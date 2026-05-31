import assert from "node:assert/strict";
import test from "node:test";
import { createKeyValueCacheFromEnv } from "../dist/infrastructure/cache/createKeyValueCacheFromEnv.js";
import { InMemoryKeyValueCache } from "../dist/infrastructure/cache/InMemoryKeyValueCache.js";
import { NoopKeyValueCache } from "../dist/infrastructure/cache/NoopKeyValueCache.js";
import { RedisKeyValueCache } from "../dist/infrastructure/cache/RedisKeyValueCache.js";

test("createKeyValueCacheFromEnv defaults to portable in-memory cache", async () => {
  const cache = createKeyValueCacheFromEnv({});

  assert.ok(cache instanceof InMemoryKeyValueCache);
  await cache.setJson("sample", { ok: true });
  assert.deepEqual(await cache.getJson("sample"), { ok: true });
});

test("createKeyValueCacheFromEnv supports explicit off mode", async () => {
  const cache = createKeyValueCacheFromEnv({ HORUS_CACHE_DRIVER: "off" });

  assert.ok(cache instanceof NoopKeyValueCache);
  await cache.setJson("sample", { ok: true });
  assert.equal(await cache.getJson("sample"), null);
});

test("createKeyValueCacheFromEnv enables Redis only when configured", () => {
  const cache = createKeyValueCacheFromEnv({
    HORUS_CACHE_DRIVER: "redis",
    HORUS_REDIS_URL: "redis://localhost:6379",
  });

  assert.ok(cache instanceof RedisKeyValueCache);
});
