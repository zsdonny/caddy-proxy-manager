/**
 * Analytics pre-aggregation rollup system.
 *
 * Aggregates raw traffic_events and waf_events into hourly rollup tables.
 * Rollup rows enable fast queries for ranges >= 24h without scanning millions
 * of raw rows. The rollup runs during the regular 1-hour purge cycle.
 */

import db from './db';
import { trafficEvents, logParseState, wafEvents, wafLogParseState, trafficRollups, wafRollups } from './db/schema';
import { eq, sql, and, gte, lt, lte } from 'drizzle-orm';

const HOUR_S = 3600;

// ── state helpers (reuse the same parse-state tables) ────────────────────────

function getTrafficState(key: string): string | null {
  const row = db.select({ value: logParseState.value }).from(logParseState).where(eq(logParseState.key, key)).get();
  return row?.value ?? null;
}

function setTrafficState(key: string, value: string): void {
  db.insert(logParseState).values({ key, value }).onConflictDoUpdate({ target: logParseState.key, set: { value } }).run();
}

function getWafState(key: string): string | null {
  const row = db.select({ value: wafLogParseState.value }).from(wafLogParseState).where(eq(wafLogParseState.key, key)).get();
  return row?.value ?? null;
}

function setWafState(key: string, value: string): void {
  db.insert(wafLogParseState).values({ key, value }).onConflictDoUpdate({ target: wafLogParseState.key, set: { value } }).run();
}

// ── current hour bucket ───────────────────────────────────────────────────────

function currentHourBucket(): number {
  return Math.floor(Date.now() / 1000 / HOUR_S) * HOUR_S;
}

// ── traffic rollup ────────────────────────────────────────────────────────────

function rollupTrafficHour(hourBucket: number): void {
  const end = hourBucket + HOUR_S;
  db.run(sql`
    INSERT OR IGNORE INTO traffic_rollups
      (hour_bucket, host, country_code, proto, user_agent,
       total_requests, blocked_requests, unique_ips, bytes_sent)
    SELECT
      ${hourBucket},
      host,
      country_code,
      proto,
      user_agent,
      COUNT(*) AS total_requests,
      SUM(CASE WHEN is_blocked THEN 1 ELSE 0 END) AS blocked_requests,
      COUNT(DISTINCT client_ip) AS unique_ips,
      SUM(bytes_sent) AS bytes_sent
    FROM traffic_events
    WHERE ts >= ${hourBucket} AND ts < ${end}
    GROUP BY host, country_code, proto, user_agent
  `);
}

function rollupWafHour(hourBucket: number): void {
  const end = hourBucket + HOUR_S;
  db.run(sql`
    INSERT OR IGNORE INTO waf_rollups
      (hour_bucket, host, country_code, rule_id, rule_message,
       total_events, muted_events, unmuted_events)
    SELECT
      ${hourBucket},
      host,
      country_code,
      rule_id,
      MAX(rule_message) AS rule_message,
      COUNT(*) AS total_events,
      SUM(CASE WHEN muted THEN 1 ELSE 0 END) AS muted_events,
      SUM(CASE WHEN muted THEN 0 ELSE 1 END) AS unmuted_events
    FROM waf_events
    WHERE ts >= ${hourBucket} AND ts < ${end}
    GROUP BY host, country_code, rule_id
  `);
}

// ── find earliest raw data ────────────────────────────────────────────────────

function earliestTrafficHour(): number | null {
  const row = db.select({ minTs: sql<number>`MIN(ts)` }).from(trafficEvents).get();
  if (!row?.minTs) return null;
  return Math.floor(row.minTs / HOUR_S) * HOUR_S;
}

function earliestWafHour(): number | null {
  const row = db.select({ minTs: sql<number>`MIN(ts)` }).from(wafEvents).get();
  if (!row?.minTs) return null;
  return Math.floor(row.minTs / HOUR_S) * HOUR_S;
}

// ── public rollup functions ───────────────────────────────────────────────────

/**
 * Roll up all completed traffic hours since last run.
 * On first call (no state key), backfills from earliest raw data.
 * Safe to call repeatedly — uses INSERT OR IGNORE for idempotency.
 */
export function rollupTrafficHours(): void {
  const currentHour = currentHourBucket();
  const storedTs = getTrafficState('traffic_rollup_ts');

  let fromHour: number;
  if (storedTs !== null) {
    fromHour = parseInt(storedTs, 10);
  } else {
    // First run — backfill from earliest raw data
    const earliest = earliestTrafficHour();
    if (earliest === null) return; // no data yet
    fromHour = earliest;
    console.log(`[rollup] backfilling traffic rollups from ${new Date(fromHour * 1000).toISOString()}`);
  }

  let hour = fromHour;
  let count = 0;
  while (hour < currentHour) {
    rollupTrafficHour(hour);
    hour += HOUR_S;
    count++;
  }

  if (count > 0) {
    console.log(`[rollup] rolled up ${count} traffic hour(s) through ${new Date((currentHour - HOUR_S) * 1000).toISOString()}`);
  }

  setTrafficState('traffic_rollup_ts', String(currentHour));
}

/**
 * Roll up all completed WAF hours since last run.
 * On first call (no state key), backfills from earliest raw data.
 * Safe to call repeatedly — uses INSERT OR IGNORE for idempotency.
 */
export function rollupWafHours(): void {
  const currentHour = currentHourBucket();
  const storedTs = getWafState('waf_rollup_ts');

  let fromHour: number;
  if (storedTs !== null) {
    fromHour = parseInt(storedTs, 10);
  } else {
    const earliest = earliestWafHour();
    if (earliest === null) return;
    fromHour = earliest;
    console.log(`[rollup] backfilling WAF rollups from ${new Date(fromHour * 1000).toISOString()}`);
  }

  let hour = fromHour;
  let count = 0;
  while (hour < currentHour) {
    rollupWafHour(hour);
    hour += HOUR_S;
    count++;
  }

  if (count > 0) {
    console.log(`[rollup] rolled up ${count} WAF hour(s) through ${new Date((currentHour - HOUR_S) * 1000).toISOString()}`);
  }

  setWafState('waf_rollup_ts', String(currentHour));
}

/**
 * Purge rollup rows older than the given cutoff timestamp.
 * Called alongside raw table purge to keep rollups aligned with retention.
 */
export function purgeOldTrafficRollups(cutoffTs: number): void {
  const cutoffHour = Math.floor(cutoffTs / HOUR_S) * HOUR_S;
  db.delete(trafficRollups).where(lt(trafficRollups.hourBucket, cutoffHour)).run();
}

export function purgeOldWafRollups(cutoffTs: number): void {
  const cutoffHour = Math.floor(cutoffTs / HOUR_S) * HOUR_S;
  db.delete(wafRollups).where(lt(wafRollups.hourBucket, cutoffHour)).run();
}

/**
 * Invalidate all WAF rollup rows and reset the rollup state so the next
 * rollup cycle re-aggregates from scratch. Called after mute re-evaluation
 * since muted/unmuted counts may have changed across all hours.
 */
export function invalidateWafRollups(): void {
  db.delete(wafRollups).run();
  db.delete(wafLogParseState).where(eq(wafLogParseState.key, 'waf_rollup_ts')).run();
  console.log('[rollup] WAF rollups invalidated — will re-aggregate on next cycle');
}
