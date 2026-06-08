#!/usr/bin/env node

const baseUrl = new URL(process.env.PRESTAGING_BASE_URL ?? "http://127.0.0.1:8080");

const checks = [
  { name: "web root", path: "/", expectedStatus: 200 },
  { name: "api health via web", path: "/health", expectedStatus: 200 },
  { name: "api readiness via web", path: "/ready", expectedStatus: 200 },
  { name: "authenticated preview projects via web proxy", path: "/api/preview/projects", expectedStatus: 200 },
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

console.log(`Pre-staging smoke passed for ${baseUrl}`);
