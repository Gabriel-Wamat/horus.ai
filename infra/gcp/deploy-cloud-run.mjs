#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));

const project = readRequired("project", "GCP_PROJECT_ID");
const region = readRequired("region", "GCP_REGION");
const service = readRequired("service", "GCP_SERVICE_NAME");
const repository = readRequired("repository", "GCP_ARTIFACT_REPOSITORY");
const imageTag = args.tag ?? process.env.GCP_IMAGE_TAG ?? buildImageTag();
const allowUnauthenticated =
  args.allowUnauthenticated ??
  readBoolean(process.env.GCP_RUN_ALLOW_UNAUTHENTICATED, true);

const image = `${region}-docker.pkg.dev/${project}/${repository}/${service}:${imageTag}`;
const runtimeEnv = {
  HORUS_ENV: process.env.HORUS_ENV ?? "preview",
  PERSISTENCE_DRIVER: process.env.PERSISTENCE_DRIVER ?? "file",
  HORUS_DATA_DIR: process.env.HORUS_DATA_DIR ?? ".horus/data",
  ...args.env,
};

enableServices(project);
ensureArtifactRepository({ project, region, repository });
submitBuild({ project, image });
deployCloudRun({
  project,
  region,
  service,
  image,
  allowUnauthenticated,
  runtimeEnv,
  secrets: args.secrets,
});

function parseArgs(argv) {
  const parsed = {
    env: {},
    secrets: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      continue;
    }
    if (arg === "--project") {
      parsed.project = readNext(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--region") {
      parsed.region = readNext(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--service") {
      parsed.service = readNext(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--repository") {
      parsed.repository = readNext(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--tag") {
      parsed.tag = readNext(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--allow-unauthenticated") {
      parsed.allowUnauthenticated = true;
      continue;
    }
    if (arg === "--no-allow-unauthenticated") {
      parsed.allowUnauthenticated = false;
      continue;
    }
    if (arg === "--env") {
      const pair = readKeyValue(arg, next);
      parsed.env[pair.key] = pair.value;
      index += 1;
      continue;
    }
    if (arg === "--secret") {
      const pair = readKeyValue(arg, next);
      parsed.secrets[pair.key] = pair.value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function readRequired(argName, envName) {
  const value = args[argName] ?? process.env[envName];
  if (value && value.trim()) return value.trim();
  throw new Error(`Missing required input: --${argName} or ${envName}`);
}

function readNext(arg, value) {
  if (value && value.trim()) return value.trim();
  throw new Error(`Missing value for ${arg}`);
}

function readKeyValue(arg, value) {
  const raw = readNext(arg, value);
  const separatorIndex = raw.indexOf("=");
  if (separatorIndex <= 0) {
    throw new Error(`${arg} expects KEY=value`);
  }
  const key = raw.slice(0, separatorIndex).trim();
  const parsedValue = raw.slice(separatorIndex + 1).trim();
  if (!key || !parsedValue) {
    throw new Error(`${arg} expects a non-empty KEY=value`);
  }
  return { key, value: parsedValue };
}

function readBoolean(value, fallback) {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Expected boolean value, received: ${value}`);
}

function buildImageTag() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function enableServices(project) {
  run("gcloud", [
    "services",
    "enable",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "--project",
    project,
  ]);
}

function ensureArtifactRepository({ project, region, repository }) {
  const describe = run(
    "gcloud",
    [
      "artifacts",
      "repositories",
      "describe",
      repository,
      "--location",
      region,
      "--project",
      project,
    ],
    { allowFailure: true, quiet: true }
  );

  if (describe.status === 0) return;

  run("gcloud", [
    "artifacts",
    "repositories",
    "create",
    repository,
    "--repository-format",
    "docker",
    "--location",
    region,
    "--project",
    project,
  ]);
}

function submitBuild({ project, image }) {
  const tempDir = mkdtempSync(join(tmpdir(), "horus-gcp-build-"));
  const configFile = join(tempDir, "cloudbuild.yaml");
  const config = [
    "steps:",
    "- name: gcr.io/cloud-builders/docker",
    "  args:",
    "  - build",
    "  - --target",
    "  - server-runtime",
    "  - -t",
    `  - ${image}`,
    "  - .",
    "images:",
    `- ${image}`,
    "",
  ].join("\n");

  try {
    writeFileSync(configFile, config, "utf8");
    run("gcloud", [
      "builds",
      "submit",
      ".",
      "--config",
      configFile,
      "--project",
      project,
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function deployCloudRun({
  project,
  region,
  service,
  image,
  allowUnauthenticated,
  runtimeEnv,
  secrets,
}) {
  const tempDir = mkdtempSync(join(tmpdir(), "horus-gcp-"));
  const envFile = join(tempDir, "cloud-run-env.yaml");

  try {
    writeFileSync(envFile, toYaml(runtimeEnv), "utf8");
    const deployArgs = [
      "run",
      "deploy",
      service,
      "--image",
      image,
      "--region",
      region,
      "--project",
      project,
      "--platform",
      "managed",
      "--env-vars-file",
      envFile,
      allowUnauthenticated
        ? "--allow-unauthenticated"
        : "--no-allow-unauthenticated",
    ];

    const secretEntries = Object.entries(secrets);
    if (secretEntries.length > 0) {
      deployArgs.push(
        "--set-secrets",
        secretEntries.map(([key, value]) => `${key}=${value}`).join(",")
      );
    }

    run("gcloud", deployArgs);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function toYaml(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n")}\n`;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: options.quiet ? "pipe" : "inherit",
    encoding: "utf8",
  });

  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed`);
  }
  return result;
}
