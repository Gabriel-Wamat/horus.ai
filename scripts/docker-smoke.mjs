#!/usr/bin/env node

const dockerHost = readEnv("HORUS_DOCKER_HOST", "127.0.0.1");
const dockerPort = readEnv("HORUS_WEB_HOST_PORT", "8080");
const baseUrl = new URL(
  process.env.HORUS_DOCKER_BASE_URL ?? `http://${dockerHost}:${dockerPort}`
);

const checks = [
  { name: "web root", path: "/", expectedStatus: 200 },
  { name: "api health via web", path: "/health", expectedStatus: 200 },
  { name: "api readiness via web", path: "/ready", expectedStatus: 200 },
  { name: "preview projects via web proxy", path: "/api/preview/projects", expectedStatus: 200 },
];

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  const response = await fetch(url, { cache: "no-store" }).catch((error) => {
    throw new Error(`${check.name} failed to connect to ${url}: ${error.message}`);
  });
  if (response.status !== check.expectedStatus) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${check.name} returned ${response.status}, expected ${check.expectedStatus}. ${body}`
    );
  }
  console.log(`PASS ${check.name}: ${url}`);
}

console.log(`Docker smoke passed for ${baseUrl}`);

function readEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}
