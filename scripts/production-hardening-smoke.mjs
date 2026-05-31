import { spawnSync } from "node:child_process";

const checks = [
  {
    name: "shared build",
    command: "pnpm",
    args: ["--filter", "@u-build/shared", "build"],
    required: true,
  },
  {
    name: "server build",
    command: "pnpm",
    args: ["--filter", "@u-build/server", "build"],
    required: true,
  },
  {
    name: "redis cache smoke",
    command: "node",
    args: ["scripts/redis-cache-smoke.mjs"],
    required: Boolean(process.env.HORUS_REDIS_URL ?? process.env.REDIS_URL),
  },
  {
    name: "chat preview e2e",
    command: "node",
    args: ["scripts/horus-chat-preview-e2e.mjs"],
    required: Boolean(process.env.HORUS_E2E_CHAT_SESSION_ID),
  },
];

const results = [];

for (const check of checks) {
  if (!check.required) {
    results.push({ name: check.name, status: "skipped" });
    console.log(`SKIP ${check.name}: opt-in environment is not configured.`);
    continue;
  }

  console.log(`RUN ${check.name}: ${check.command} ${check.args.join(" ")}`);
  const result = spawnSync(check.command, check.args, {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    results.push({ name: check.name, status: "failed", exitCode: result.status });
    console.error(`FAIL ${check.name}: exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
  results.push({ name: check.name, status: "passed" });
}

console.log("Production smoke summary:");
for (const result of results) {
  console.log(`- ${result.status.toUpperCase()} ${result.name}`);
}
