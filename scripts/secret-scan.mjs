#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HIGH_CONFIDENCE_PATTERNS = [
  { name: "openai_api_key", pattern: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: "github_token", pattern: /gh[pousr]_[A-Za-z0-9_]{30,}/g },
  { name: "aws_access_key", pattern: /AKIA[0-9A-Z]{16}/g },
  { name: "google_api_key", pattern: /AIza[0-9A-Za-z_-]{30,}/g },
  { name: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g },
];

const SKIP_PATH_PATTERNS = [
  /^node_modules\//,
  /^\.git\//,
  /^\.turbo\//,
  /^\.pnpm-store\//,
  /^\.horus\//,
  /^data\//,
  /^output\//,
  /^coverage\//,
  /^apps\/docs\/\.next\//,
  /(^|\/)dist\//,
  /(^|\/)\.env(?:\.|$)/,
  /\.(?:png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|tgz|lockb)$/i,
];

export function scanContent(content, filePath) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("secret-scan: allow")) continue;
    for (const { name, pattern } of HIGH_CONFIDENCE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        findings.push({
          filePath,
          line: index + 1,
          kind: name,
        });
      }
    }
  }
  return findings;
}

export async function scanFiles(filePaths) {
  const findings = [];
  for (const filePath of filePaths.filter(shouldScanPath)) {
    const buffer = await readFile(filePath).catch(() => null);
    if (!buffer || buffer.includes(0)) continue;
    findings.push(...scanContent(buffer.toString("utf8"), filePath));
  }
  return findings;
}

async function listGitCandidateFiles() {
  const { stdout } = await execFileAsync("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function shouldScanPath(filePath) {
  return !SKIP_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

async function main() {
  const files = process.argv.slice(2);
  const findings = await scanFiles(files.length > 0 ? files : await listGitCandidateFiles());
  if (findings.length === 0) {
    console.log("secret-scan: no high-confidence secrets found");
    return;
  }
  for (const finding of findings) {
    console.error(
      `${finding.filePath}:${finding.line} high-confidence secret (${finding.kind})`
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
