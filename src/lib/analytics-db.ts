import { sql, and, gte, lte, eq, inArray, lt } from 'drizzle-orm';
import db from './db';
import { trafficEvents, proxyHosts, trafficRollups } from './db/schema';
import { existsSync } from 'node:fs';

const ROLLUP_THRESHOLD_S = 86400; // use rollup tables for ranges >= 24h
const HOUR_S = 3600;

function currentHourBucket(): number {
  return Math.floor(Date.now() / 1000 / HOUR_S) * HOUR_S;
}

function buildRollupWhere(from: number, to: number, hosts: string[]) {
  const currentHour = currentHourBucket();
  // Query only complete hours in the rollup table; current partial hour is merged separately.
  const conditions = [
    gte(trafficRollups.hourBucket, Math.floor(from / HOUR_S) * HOUR_S),
    lt(trafficRollups.hourBucket, currentHour),
    lt(trafficRollups.hourBucket, to),
  ];
  if (hosts.length === 1) {
    conditions.push(eq(trafficRollups.host, hosts[0]));
  } else if (hosts.length > 1) {
    conditions.push(inArray(trafficRollups.host, hosts));
  }
  return and(...conditions);
}

export type Interval = '1h' | '12h' | '24h' | '7d' | '30d';

const LOG_FILE = '/logs/access.log';

export const INTERVAL_SECONDS: Record<Interval, number> = {
  '1h': 3600,
  '12h': 43200,
  '24h': 86400,
  '7d': 7 * 86400,
  '30d': 30 * 86400,
};

function buildWhere(from: number, to: number, hosts: string[]) {
  const conditions = [gte(trafficEvents.ts, from), lte(trafficEvents.ts, to)];
  if (hosts.length === 1) {
    conditions.push(eq(trafficEvents.host, hosts[0]));
  } else if (hosts.length > 1) {
    conditions.push(inArray(trafficEvents.host, hosts));
  }
  return and(...conditions);
}

// ── Summary ──────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalRequests: number;
  uniqueIps: number;
  blockedRequests: number;
  blockedPercent: number;
  bytesServed: number;
  loggingDisabled: boolean;
}

export async function getAnalyticsSummary(from: number, to: number, hosts: string[]): Promise<AnalyticsSummary> {
  const loggingDisabled = !existsSync(LOG_FILE);

  if (to - from >= ROLLUP_THRESHOLD_S) {
    // ── fast path: rollup tables ──────────────────────────────────────────
    const rollupWhere = buildRollupWhere(from, to, hosts);
    const rollupRow = db
      .select({
        total: sql<number>`sum(${trafficRollups.totalRequests})`,
        uniqueIps: sql<number>`sum(${trafficRollups.uniqueIps})`,
        blocked: sql<number>`sum(${trafficRollups.blockedRequests})`,
        bytes: sql<number>`sum(${trafficRollups.bytesSent})`,
      })
      .from(trafficRollups)
      .where(rollupWhere)
      .get();

    // partial current hour from raw table
    const currentHour = currentHourBucket();
    const partialWhere = buildWhere(Math.max(from, currentHour), to, hosts);
    const partialRow = db
      .select({
        total: sql<number>`count(*)`,
        uniqueIps: sql<number>`count(distinct ${trafficEvents.clientIp})`,
        blocked: sql<number>`sum(case when ${trafficEvents.isBlocked} then 1 else 0 end)`,
        bytes: sql<number>`sum(${trafficEvents.bytesSent})`,
      })
      .from(trafficEvents)
      .where(partialWhere)
      .get();

    const total = (rollupRow?.total ?? 0) + (partialRow?.total ?? 0);
    const blocked = (rollupRow?.blocked ?? 0) + (partialRow?.blocked ?? 0);

    return {
      totalRequests: total,
      uniqueIps: (rollupRow?.uniqueIps ?? 0) + (partialRow?.uniqueIps ?? 0),
      blockedRequests: blocked,
      blockedPercent: total > 0 ? Math.round((blocked / total) * 1000) / 10 : 0,
      bytesServed: (rollupRow?.bytes ?? 0) + (partialRow?.bytes ?? 0),
      loggingDisabled,
    };
  }

  // ── slow path: raw table ──────────────────────────────────────────────────
  const where = buildWhere(from, to, hosts);
  const row = db
    .select({
      total: sql<number>`count(*)`,
      uniqueIps: sql<number>`count(distinct ${trafficEvents.clientIp})`,
      blocked: sql<number>`sum(case when ${trafficEvents.isBlocked} then 1 else 0 end)`,
      bytes: sql<number>`sum(${trafficEvents.bytesSent})`,
    })
    .from(trafficEvents)
    .where(where)
    .get();

  const total = row?.total ?? 0;
  const blocked = row?.blocked ?? 0;

  return {
    totalRequests: total,
    uniqueIps: row?.uniqueIps ?? 0,
    blockedRequests: blocked,
    blockedPercent: total > 0 ? Math.round((blocked / total) * 1000) / 10 : 0,
    bytesServed: row?.bytes ?? 0,
    loggingDisabled,
  };
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineBucket {
  ts: number;
  total: number;
  blocked: number;
}

function bucketSizeForDuration(seconds: number): number {
  if (seconds <= 3600) return 300;
  if (seconds <= 43200) return 1800;
  if (seconds <= 86400) return 3600;
  if (seconds <= 7 * 86400) return 21600;
  return 86400;
}

export async function getAnalyticsTimeline(from: number, to: number, hosts: string[]): Promise<TimelineBucket[]> {
  const bucketSize = bucketSizeForDuration(to - from);

  if (to - from >= ROLLUP_THRESHOLD_S) {
    // ── fast path: rollup tables ──────────────────────────────────────────
    const rollupWhere = buildRollupWhere(from, to, hosts);
    const rollupRows = db
      .select({
        bucket: sql<number>`(${trafficRollups.hourBucket} / ${sql.raw(String(bucketSize))})`,
        total: sql<number>`sum(${trafficRollups.totalRequests})`,
        blocked: sql<number>`sum(${trafficRollups.blockedRequests})`,
      })
      .from(trafficRollups)
      .where(rollupWhere)
      .groupBy(sql`(${trafficRollups.hourBucket} / ${sql.raw(String(bucketSize))})`)
      .orderBy(sql`(${trafficRollups.hourBucket} / ${sql.raw(String(bucketSize))})`)
      .all();

    // partial current hour from raw table
    const currentHour = currentHourBucket();
    const partialWhere = buildWhere(Math.max(from, currentHour), to, hosts);
    const partialRows = db
      .select({
        bucket: sql<number>`(${trafficEvents.ts} / ${sql.raw(String(bucketSize))})`,
        total: sql<number>`count(*)`,
        blocked: sql<number>`sum(case when ${trafficEvents.isBlocked} then 1 else 0 end)`,
      })
      .from(trafficEvents)
      .where(partialWhere)
      .groupBy(sql`(${trafficEvents.ts} / ${sql.raw(String(bucketSize))})`)
      .all();

    const bucketMap = new Map<number, { total: number; blocked: number }>();
    for (const r of rollupRows) {
      bucketMap.set(r.bucket, { total: r.total ?? 0, blocked: r.blocked ?? 0 });
    }
    for (const r of partialRows) {
      const existing = bucketMap.get(r.bucket);
      if (existing) {
        existing.total += r.total ?? 0;
        existing.blocked += r.blocked ?? 0;
      } else {
        bucketMap.set(r.bucket, { total: r.total ?? 0, blocked: r.blocked ?? 0 });
      }
    }
    return Array.from(bucketMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([bucket, v]) => ({ ts: bucket * bucketSize, total: v.total, blocked: v.blocked }));
  }

  // ── slow path: raw table ──────────────────────────────────────────────────
  const where = buildWhere(from, to, hosts);
  const rows = db
    .select({
      bucket: sql<number>`(${trafficEvents.ts} / ${sql.raw(String(bucketSize))})`,
      total: sql<number>`count(*)`,
      blocked: sql<number>`sum(case when ${trafficEvents.isBlocked} then 1 else 0 end)`,
    })
    .from(trafficEvents)
    .where(where)
    .groupBy(sql`(${trafficEvents.ts} / ${sql.raw(String(bucketSize))})`)
    .orderBy(sql`(${trafficEvents.ts} / ${sql.raw(String(bucketSize))})`)
    .all();

  return rows.map((r) => ({
    ts: r.bucket * bucketSize,
    total: r.total,
    blocked: r.blocked ?? 0,
  }));
}

// ── Countries ────────────────────────────────────────────────────────────────

export interface CountryStats {
  countryCode: string;
  total: number;
  blocked: number;
}

export async function getAnalyticsCountries(from: number, to: number, hosts: string[]): Promise<CountryStats[]> {
  if (to - from >= ROLLUP_THRESHOLD_S) {
    // ── fast path: rollup tables ──────────────────────────────────────────
    const rollupWhere = buildRollupWhere(from, to, hosts);
    const rollupRows = db
      .select({
        countryCode: trafficRollups.countryCode,
        total: sql<number>`sum(${trafficRollups.totalRequests})`,
        blocked: sql<number>`sum(${trafficRollups.blockedRequests})`,
      })
      .from(trafficRollups)
      .where(rollupWhere)
      .groupBy(trafficRollups.countryCode)
      .all();

    // partial current hour
    const currentHour = currentHourBucket();
    const partialWhere = buildWhere(Math.max(from, currentHour), to, hosts);
    const partialRows = db
      .select({
        countryCode: trafficEvents.countryCode,
        total: sql<number>`count(*)`,
        blocked: sql<number>`sum(case when ${trafficEvents.isBlocked} then 1 else 0 end)`,
      })
      .from(trafficEvents)
      .where(partialWhere)
      .groupBy(trafficEvents.countryCode)
      .all();

    const countryMap = new Map<string, { total: number; blocked: number }>();
    for (const r of rollupRows) {
      const key = r.countryCode ?? 'XX';
      countryMap.set(key, { total: r.total ?? 0, blocked: r.blocked ?? 0 });
    }
    for (const r of partialRows) {
      const key = r.countryCode ?? 'XX';
      const existing = countryMap.get(key);
      if (existing) {
        existing.total += r.total ?? 0;
        existing.blocked += r.blocked ?? 0;
      } else {
        countryMap.set(key, { total: r.total ?? 0, blocked: r.blocked ?? 0 });
      }
    }
    return Array.from(countryMap.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([countryCode, v]) => ({ countryCode, total: v.total, blocked: v.blocked }));
  }

  // ── slow path: raw table ──────────────────────────────────────────────────
  const where = buildWhere(from, to, hosts);
  const rows = db
    .select({
      countryCode: trafficEvents.countryCode,
      total: sql<number>`count(*)`,
      blocked: sql<number>`sum(case when ${trafficEvents.isBlocked} then 1 else 0 end)`,
    })
    .from(trafficEvents)
    .where(where)
    .groupBy(trafficEvents.countryCode)
    .orderBy(sql`count(*) desc`)
    .all();

  return rows.map((r) => ({
    countryCode: r.countryCode ?? 'XX',
    total: r.total,
    blocked: r.blocked ?? 0,
  }));
}

// ── Protocols ────────────────────────────────────────────────────────────────

export interface ProtoStats {
  proto: string;
  count: number;
  percent: number;
}

export async function getAnalyticsProtocols(from: number, to: number, hosts: string[]): Promise<ProtoStats[]> {
  let rows: { proto: string | null; count: number }[];

  if (to - from >= ROLLUP_THRESHOLD_S) {
    // ── fast path: rollup tables ──────────────────────────────────────────
    const rollupWhere = buildRollupWhere(from, to, hosts);
    const rollupRows = db
      .select({
        proto: trafficRollups.proto,
        count: sql<number>`sum(${trafficRollups.totalRequests})`,
      })
      .from(trafficRollups)
      .where(rollupWhere)
      .groupBy(trafficRollups.proto)
      .all();

    // partial current hour
    const currentHour = currentHourBucket();
    const partialWhere = buildWhere(Math.max(from, currentHour), to, hosts);
    const partialRows = db
      .select({ proto: trafficEvents.proto, count: sql<number>`count(*)` })
      .from(trafficEvents)
      .where(partialWhere)
      .groupBy(trafficEvents.proto)
      .all();

    const protoMap = new Map<string, number>();
    for (const r of rollupRows) protoMap.set(r.proto || 'Unknown', (protoMap.get(r.proto || 'Unknown') ?? 0) + (r.count ?? 0));
    for (const r of partialRows) protoMap.set(r.proto || 'Unknown', (protoMap.get(r.proto || 'Unknown') ?? 0) + (r.count ?? 0));
    rows = Array.from(protoMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([proto, count]) => ({ proto, count }));
  } else {
    // ── slow path: raw table ────────────────────────────────────────────────
    const where = buildWhere(from, to, hosts);
    rows = db
      .select({ proto: trafficEvents.proto, count: sql<number>`count(*)` })
      .from(trafficEvents)
      .where(where)
      .groupBy(trafficEvents.proto)
      .orderBy(sql`count(*) desc`)
      .all();
  }

  const total = rows.reduce((s, r) => s + r.count, 0);
  return rows.map((r) => ({
    proto: r.proto || 'Unknown',
    count: r.count,
    percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
  }));
}

// ── User Agents ──────────────────────────────────────────────────────────────

export interface UAStats {
  userAgent: string;
  count: number;
  percent: number;
}

export async function getAnalyticsUserAgents(from: number, to: number, hosts: string[]): Promise<UAStats[]> {
  let rows: { userAgent: string | null; count: number }[];

  if (to - from >= ROLLUP_THRESHOLD_S) {
    // ── fast path: rollup tables ──────────────────────────────────────────
    const rollupWhere = buildRollupWhere(from, to, hosts);
    const rollupRows = db
      .select({
        userAgent: trafficRollups.userAgent,
        count: sql<number>`sum(${trafficRollups.totalRequests})`,
      })
      .from(trafficRollups)
      .where(rollupWhere)
      .groupBy(trafficRollups.userAgent)
      .all();

    // partial current hour
    const currentHour = currentHourBucket();
    const partialWhere = buildWhere(Math.max(from, currentHour), to, hosts);
    const partialRows = db
      .select({ userAgent: trafficEvents.userAgent, count: sql<number>`count(*)` })
      .from(trafficEvents)
      .where(partialWhere)
      .groupBy(trafficEvents.userAgent)
      .all();

    const uaMap = new Map<string, number>();
    for (const r of rollupRows) uaMap.set(r.userAgent || 'Unknown', (uaMap.get(r.userAgent || 'Unknown') ?? 0) + (r.count ?? 0));
    for (const r of partialRows) uaMap.set(r.userAgent || 'Unknown', (uaMap.get(r.userAgent || 'Unknown') ?? 0) + (r.count ?? 0));
    rows = Array.from(uaMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userAgent, count]) => ({ userAgent, count }));
  } else {
    // ── slow path: raw table ────────────────────────────────────────────────
    const where = buildWhere(from, to, hosts);
    rows = db
      .select({ userAgent: trafficEvents.userAgent, count: sql<number>`count(*)` })
      .from(trafficEvents)
      .where(where)
      .groupBy(trafficEvents.userAgent)
      .orderBy(sql`count(*) desc`)
      .limit(10)
      .all();
  }

  const total = rows.reduce((s, r) => s + r.count, 0);
  return rows.map((r) => ({
    userAgent: r.userAgent || 'Unknown',
    count: r.count,
    percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
  }));
}

// ── Blocked events ───────────────────────────────────────────────────────────

export interface BlockedEvent {
  id: number;
  ts: number;
  clientIp: string;
  countryCode: string | null;
  method: string;
  uri: string;
  status: number;
  host: string;
}

export interface BlockedPage {
  events: BlockedEvent[];
  total: number;
  page: number;
  pages: number;
}

export async function getAnalyticsBlocked(from: number, to: number, hosts: string[], page: number): Promise<BlockedPage> {
  const pageSize = 10;
  const where = and(buildWhere(from, to, hosts), eq(trafficEvents.isBlocked, true));

  const totalRow = db.select({ total: sql<number>`count(*)` }).from(trafficEvents).where(where).get();
  const total = totalRow?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);

  const rows = db
    .select({
      id: trafficEvents.id,
      ts: trafficEvents.ts,
      clientIp: trafficEvents.clientIp,
      countryCode: trafficEvents.countryCode,
      method: trafficEvents.method,
      uri: trafficEvents.uri,
      status: trafficEvents.status,
      host: trafficEvents.host,
    })
    .from(trafficEvents)
    .where(where)
    .orderBy(sql`${trafficEvents.ts} desc`)
    .limit(pageSize)
    .offset((safePage - 1) * pageSize)
    .all();

  return { events: rows, total, page: safePage, pages };
}

// ── Hosts ────────────────────────────────────────────────────────────────────

export async function getAnalyticsHosts(): Promise<string[]> {
  const hostSet = new Set<string>();

  // Hosts that appear in traffic events
  const trafficRows = db.selectDistinct({ host: trafficEvents.host }).from(trafficEvents).all();
  for (const r of trafficRows) if (r.host) hostSet.add(r.host);

  // All domains configured on proxy hosts (even those with no traffic yet)
  const proxyRows = db.select({ domains: proxyHosts.domains }).from(proxyHosts).all();
  for (const r of proxyRows) {
    try {
      const domains = JSON.parse(r.domains) as string[];
      for (const d of domains) {
        const trimmed = d?.trim().toLowerCase();
        if (trimmed) hostSet.add(trimmed);
      }
    } catch { /* ignore malformed rows */ }
  }

  const isIp = (h: string) => /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(h);
  return Array.from(hostSet).filter(h => !isIp(h)).sort();
}
