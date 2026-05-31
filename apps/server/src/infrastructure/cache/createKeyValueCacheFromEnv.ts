import type { KeyValueCachePort } from "../../application/ports/index.js";
import { InMemoryKeyValueCache } from "./InMemoryKeyValueCache.js";
import { NoopKeyValueCache } from "./NoopKeyValueCache.js";
import { RedisKeyValueCache } from "./RedisKeyValueCache.js";

export function createKeyValueCacheFromEnv(
  env: NodeJS.ProcessEnv = process.env
): KeyValueCachePort {
  const driver = normalizeDriver(env["HORUS_CACHE_DRIVER"]);
  if (driver === "off") return new NoopKeyValueCache();

  const redisUrl = env["HORUS_REDIS_URL"] ?? env["REDIS_URL"];
  if (driver === "redis" || redisUrl) {
    if (!redisUrl) return new InMemoryKeyValueCache();
    return new RedisKeyValueCache(
      redisUrl,
      env["HORUS_REDIS_KEY_PREFIX"] ?? "horus"
    );
  }

  return new InMemoryKeyValueCache();
}

function normalizeDriver(value: string | undefined): "memory" | "redis" | "off" {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "redis" ||
    normalized === "memory" ||
    normalized === "off"
  ) {
    return normalized;
  }
  if (
    normalized === "none" ||
    normalized === "noop" ||
    normalized === "disabled"
  ) {
    return "off";
  }
  return "memory";
}
