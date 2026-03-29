/**
 * Simple in-memory response cache for analytics API routes.
 *
 * TTL strategy (tuned to how stale data feels at each interval):
 *   - 1h / 12h : 60 s  — short range, users expect near-real-time
 *   - 24h       : 120 s — medium range
 *   - 7d / 30d  : 300 s — long range + rollup backed; data changes slowly
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** Return TTL in ms for the given time range (in seconds). */
export function ttlForRange(from: number, to: number): number {
  const duration = to - from;
  if (duration <= 43200) return 60_000;   // <= 12h
  if (duration <= 86400) return 120_000;  // <= 24h
  return 300_000;                          // 7d / 30d
}

/**
 * Return cached data for `key` if still fresh, otherwise call `fetcher`,
 * cache the result for `ttlMs`, and return it.
 */
export async function cachedResponse<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiry > now) {
    return entry.data;
  }

  const data = await fetcher();
  cache.set(key, { data, expiry: now + ttlMs });
  return data;
}

/** Evict all cached analytics entries (e.g. after settings change). */
export function clearAnalyticsCache(): void {
  cache.clear();
}

/** Evict a single cache entry by key. */
export function evictCacheEntry(key: string): void {
  cache.delete(key);
}
