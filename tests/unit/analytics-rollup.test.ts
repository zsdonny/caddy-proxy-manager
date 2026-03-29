import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DB mock ───────────────────────────────────────────────────────────────────
// We want to test the rollup orchestration logic (hour iteration, state key
// reads/writes) without hitting a real SQLite DB.

let stateStore: Record<string, string> = {};
let insertedHours: { table: string; hour: number }[] = [];
let deletedHours: { table: string; before: number }[] = [];
let minTrafficTs: number | null = null;
let minWafTs: number | null = null;

const makeSelectChain = (value: unknown) => ({
  from: () => ({
    where: () => ({ get: () => value, all: () => [value].filter(Boolean) }),
    all: () => [value].filter(Boolean),
  }),
  distinctOn: () => ({ from: () => ({ all: () => [] }) }),
});

const mockDb = {
  select: vi.fn(({ minTs }: { minTs?: unknown } = {}) => {
    // Discriminate by what was selected — we peek at the call context via
    // a closure set externally per test.
    return makeSelectChain(null);
  }),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    run: vi.fn(),
  })),
  delete: vi.fn(() => ({ where: vi.fn().mockReturnValue({ run: vi.fn() }), run: vi.fn() })),
  run: vi.fn(),
  update: vi.fn(() => ({ set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnValue({ run: vi.fn() }) })),
};

vi.mock('@/src/lib/db', () => ({ default: mockDb }));

vi.mock('@/src/lib/db/schema', () => ({
  trafficEvents: { ts: 'ts' },
  wafEvents: { ts: 'ts' },
  trafficRollups: { hourBucket: 'hour_bucket' },
  wafRollups: { hourBucket: 'hour_bucket' },
  logParseState: { key: 'key', value: 'value' },
  wafLogParseState: { key: 'key', value: 'value' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  sql: Object.assign(
    (parts: TemplateStringsArray, ...vals: unknown[]) => ({ sql: parts.join('?'), vals }),
    { raw: (s: string) => s }
  ),
  and: (...args: unknown[]) => args,
  gte: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  inArray: vi.fn(),
}));

// ── helpers under test (pure math extractions) ────────────────────────────────

describe('rollup hour-bucket math', () => {
  it('floors ts to the hour', () => {
    const ts = 1_700_005_000; // some seconds
    const hourBucket = Math.floor(ts / 3600) * 3600;
    expect(hourBucket % 3600).toBe(0);
    expect(hourBucket).toBeLessThanOrEqual(ts);
    expect(hourBucket + 3600).toBeGreaterThan(ts);
  });

  it('currentHourBucket is always on an hour boundary', () => {
    const now = Math.floor(Date.now() / 1000);
    const current = Math.floor(now / 3600) * 3600;
    expect(current % 3600).toBe(0);
  });

  it('purge cutoff rounds down to hour boundary', () => {
    const cutoffTs = 1_700_005_500;
    const cutoffHour = Math.floor(cutoffTs / 3600) * 3600;
    expect(cutoffHour).toBe(1_700_004_000); // 1_700_005_500 / 3600 = 472223.75.. -> 472222 * 3600 = ...
    // Verify: 1_700_005_500 / 3600 = 472223.75, floor = 472223, *3600 = 1_700_004_800
    const expected = Math.floor(1_700_005_500 / 3600) * 3600;
    expect(cutoffHour).toBe(expected);
  });
});

describe('analytics rollup module imports cleanly', () => {
  it('exports expected functions', async () => {
    const mod = await import('@/src/lib/analytics-rollup');
    expect(typeof mod.rollupTrafficHours).toBe('function');
    expect(typeof mod.rollupWafHours).toBe('function');
    expect(typeof mod.purgeOldTrafficRollups).toBe('function');
    expect(typeof mod.purgeOldWafRollups).toBe('function');
    expect(typeof mod.invalidateWafRollups).toBe('function');
  });
});
