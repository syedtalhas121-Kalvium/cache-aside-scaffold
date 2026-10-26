import { redis } from "../redis.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readCache(key) {
  const value = await redis.get(key);
  if (value === null) return { hit: false };

  try {
    return { hit: true, value: JSON.parse(value) };
  } catch {
    // Treat corrupt/old cache entries as misses instead of breaking the route.
    await redis.del(key);
    return { hit: false };
  }
}

/**
 * Cache-aside with a short Redis NX/EX lock to coalesce concurrent misses.
 * The cache stores JSON because Redis values are strings.
 */
export async function cached(key, ttl, fetcher) {
  const first = await readCache(key);
  if (first.hit) return first.value;

  const lockKey = "lock:" + key;
  const gotLock = await redis.set(lockKey, "1", "NX", "EX", 5);

  if (gotLock) {
    try {
      // Another request may have populated the cache between our GET and SET.
      const second = await readCache(key);
      if (second.hit) return second.value;

      const value = await fetcher();
      await redis.set(key, JSON.stringify(value), "EX", ttl);
      return value;
    } finally {
      await redis.del(lockKey);
    }
  }

  // A peer owns the lock. Wait briefly and check for its result a few times.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(50);
    const result = await readCache(key);
    if (result.hit) return result.value;
  }

  // Avoid waiting indefinitely if the lock holder failed or took too long.
  // This fallback deliberately does not overwrite the cache without the lock.
  return fetcher();
}
