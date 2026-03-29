import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cachedResponse, clearAnalyticsCache, evictCacheEntry, ttlForRange } from '../../src/lib/analytics-cache';

describe('ttlForRange', () => {
  it('returns 60s for 1h range', () => {
    const to = 1_000_000;
    expect(ttlForRange(to - 3600, to)).toBe(60_000);
  });

  it('returns 60s for 12h range', () => {
    const to = 1_000_000;
    expect(ttlForRange(to - 43200, to)).toBe(60_000);
  });

  it('returns 120s for 24h range', () => {
    const to = 1_000_000;
    expect(ttlForRange(to - 86400, to)).toBe(120_000);
  });

  it('returns 300s for 7d range', () => {
    const to = 1_000_000;
    expect(ttlForRange(to - 7 * 86400, to)).toBe(300_000);
  });

  it('returns 300s for 30d range', () => {
    const to = 1_000_000;
    expect(ttlForRange(to - 30 * 86400, to)).toBe(300_000);
  });
});

describe('cachedResponse', () => {
  beforeEach(() => {
    clearAnalyticsCache();
  });

  it('calls fetcher on cache miss', async () => {
    const fetcher = vi.fn().mockResolvedValue({ total: 42 });
    const result = await cachedResponse('key1', 60_000, fetcher);
    expect(result).toEqual({ total: 42 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('returns cached value on second call without calling fetcher again', async () => {
    const fetcher = vi.fn().mockResolvedValue({ total: 99 });
    await cachedResponse('key2', 60_000, fetcher);
    const result = await cachedResponse('key2', 60_000, fetcher);
    expect(result).toEqual({ total: 99 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('uses separate cache entries for different keys', async () => {
    const fetcherA = vi.fn().mockResolvedValue('A');
    const fetcherB = vi.fn().mockResolvedValue('B');
    const a = await cachedResponse('keyA', 60_000, fetcherA);
    const b = await cachedResponse('keyB', 60_000, fetcherB);
    expect(a).toBe('A');
    expect(b).toBe('B');
    expect(fetcherA).toHaveBeenCalledOnce();
    expect(fetcherB).toHaveBeenCalledOnce();
  });

  it('re-fetches after TTL expires', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue('fresh');
    await cachedResponse('key3', 100, fetcher); // 100ms TTL
    vi.advanceTimersByTime(101);
    await cachedResponse('key3', 100, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not re-fetch before TTL expires', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue('fresh');
    await cachedResponse('key4', 1000, fetcher);
    vi.advanceTimersByTime(500);
    await cachedResponse('key4', 1000, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('evictCacheEntry', () => {
  beforeEach(() => {
    clearAnalyticsCache();
  });

  it('forces re-fetch after eviction', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    await cachedResponse('evictKey', 60_000, fetcher);
    evictCacheEntry('evictKey');
    await cachedResponse('evictKey', 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('clearAnalyticsCache', () => {
  it('clears all entries', async () => {
    const fetcherA = vi.fn().mockResolvedValue('A');
    const fetcherB = vi.fn().mockResolvedValue('B');
    await cachedResponse('ca', 60_000, fetcherA);
    await cachedResponse('cb', 60_000, fetcherB);
    clearAnalyticsCache();
    await cachedResponse('ca', 60_000, fetcherA);
    await cachedResponse('cb', 60_000, fetcherB);
    expect(fetcherA).toHaveBeenCalledTimes(2);
    expect(fetcherB).toHaveBeenCalledTimes(2);
  });
});
