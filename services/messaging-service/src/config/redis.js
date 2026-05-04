const Redis = require('ioredis');

// Connects to Redis using env vars.
// REDIS_HOST=localhost for local dev, redis for Docker Compose.
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  // Retry up to 3 times on connection failure then stop so the service
  // can still start without Redis (degrades to DB-only, no caching).
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error',   (err) => console.error('[Redis] Error:', err.message));

// ─── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Get a cached value. Returns parsed object or null if missing/error.
 */
async function cacheGet(key) {
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.error(`[Redis] cacheGet failed for key "${key}":`, err.message);
    return null; // Cache miss — caller falls through to DB
  }
}

/**
 * Set a cached value with a TTL in seconds.
 */
async function cacheSet(key, value, ttlSeconds = 60) {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    console.error(`[Redis] cacheSet failed for key "${key}":`, err.message);
    // Non-fatal — DB result already returned to caller
  }
}

/**
 * Delete all keys matching a pattern (uses SCAN — safe for production).
 * Example: cacheDelPattern('threadsByUser:1001:*') busts all pages for user 1001.
 */
async function cacheDelPattern(pattern) {
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor, 'MATCH', pattern, 'COUNT', 100
      );
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    console.error(`[Redis] cacheDelPattern failed for "${pattern}":`, err.message);
  }
}

module.exports = { redis, cacheGet, cacheSet, cacheDelPattern };