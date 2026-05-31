const redisUrl = process.env.HORUS_REDIS_URL ?? process.env.REDIS_URL;

if (!redisUrl) {
  console.log("SKIP redis-cache-smoke: HORUS_REDIS_URL or REDIS_URL is not set.");
  process.exit(0);
}

const { RedisKeyValueCache } = await import(
  "../apps/server/dist/infrastructure/cache/RedisKeyValueCache.js"
);

const keyPrefix = process.env.HORUS_REDIS_KEY_PREFIX ?? "horus-smoke";
const cache = new RedisKeyValueCache(redisUrl, keyPrefix);
const key = `smoke:${Date.now()}:${Math.random().toString(16).slice(2)}`;
const value = {
  ok: true,
  key,
  createdAt: new Date().toISOString(),
};

try {
  await cache.setJson(key, value, { ttlMs: 30_000 });
  const read = await cache.getJson(key);
  await cache.delete(key);

  if (!read || read.key !== value.key || read.ok !== true) {
    console.error("FAIL redis-cache-smoke: Redis roundtrip returned unexpected data.");
    console.error(JSON.stringify({ expected: value, received: read }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`PASS redis-cache-smoke: Redis roundtrip succeeded with prefix ${keyPrefix}.`);
  }
} finally {
  await cache.close?.();
}
