import db from "../db";
import { wafEvents } from "../db/schema";
import { desc, like, or, count, and, gte, lte, sql, inArray, eq, ne } from "drizzle-orm";
import { isIpInAnyCidr } from "../cidr";

export type WafEvent = {
  id: number;
  ts: number;
  host: string;
  clientIp: string;
  countryCode: string | null;
  method: string;
  uri: string;
  ruleId: number | null;
  ruleMessage: string | null;
  severity: string | null;
  rawData: string | null;
  blocked: boolean;
  muted: boolean;
};

function buildSearch(search?: string) {
  if (!search) return undefined;
  return or(
    like(wafEvents.host, `%${search}%`),
    like(wafEvents.clientIp, `%${search}%`),
    like(wafEvents.uri, `%${search}%`),
    like(wafEvents.ruleMessage, `%${search}%`)
  );
}

export async function countWafEvents(search?: string, includeMuted = false): Promise<number> {
  const conditions = [];
  const searchCond = buildSearch(search);
  if (searchCond) conditions.push(searchCond);
  if (!includeMuted) conditions.push(eq(wafEvents.muted, false));
  const [row] = await db
    .select({ value: count() })
    .from(wafEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return row?.value ?? 0;
}

export async function countMutedWafEvents(search?: string): Promise<number> {
  const conditions = [eq(wafEvents.muted, true)];
  const searchCond = buildSearch(search);
  if (searchCond) conditions.push(searchCond);
  const [row] = await db
    .select({ value: count() })
    .from(wafEvents)
    .where(and(...conditions));
  return row?.value ?? 0;
}

export async function countWafEventsInRange(from: number, to: number, includeMuted = true): Promise<number> {
  const conditions = [gte(wafEvents.ts, from), lte(wafEvents.ts, to)];
  if (!includeMuted) conditions.push(eq(wafEvents.muted, false));
  const [row] = await db
    .select({ value: count() })
    .from(wafEvents)
    .where(and(...conditions));
  return row?.value ?? 0;
}

export type TopWafRule = { ruleId: number; count: number; message: string | null };

export async function getTopWafRules(from: number, to: number, limit = 10, includeMuted = true): Promise<TopWafRule[]> {
  const conditions = [gte(wafEvents.ts, from), lte(wafEvents.ts, to), sql`${wafEvents.ruleId} IS NOT NULL`];
  if (!includeMuted) conditions.push(eq(wafEvents.muted, false));
  const rows = await db
    .select({
      ruleId: wafEvents.ruleId,
      count: count(),
      message: sql<string | null>`MAX(${wafEvents.ruleMessage})`,
    })
    .from(wafEvents)
    .where(and(...conditions))
    .groupBy(wafEvents.ruleId)
    .orderBy(desc(count()))
    .limit(limit);
  return rows
    .filter((r): r is typeof r & { ruleId: number } => r.ruleId != null)
    .map((r) => ({ ruleId: r.ruleId, count: r.count, message: r.message ?? null }));
}

export type TopWafRuleWithHosts = {
  ruleId: number;
  count: number;
  message: string | null;
  hosts: { host: string; count: number }[];
};

export async function getTopWafRulesWithHosts(from: number, to: number, limit = 10, includeMuted = true): Promise<TopWafRuleWithHosts[]> {
  const topRules = await getTopWafRules(from, to, limit, includeMuted);
  if (topRules.length === 0) return [];

  const ruleIds = topRules.map(r => r.ruleId);
  const hostConditions = [gte(wafEvents.ts, from), lte(wafEvents.ts, to), inArray(wafEvents.ruleId, ruleIds)];
  if (!includeMuted) hostConditions.push(eq(wafEvents.muted, false));
  const hostRows = await db
    .select({ ruleId: wafEvents.ruleId, host: wafEvents.host, count: count() })
    .from(wafEvents)
    .where(and(...hostConditions))
    .groupBy(wafEvents.ruleId, wafEvents.host)
    .orderBy(desc(count()));

  return topRules.map(rule => ({
    ...rule,
    hosts: hostRows
      .filter(r => r.ruleId === rule.ruleId)
      .map(r => ({ host: r.host, count: r.count })),
  }));
}

export async function getWafEventCountries(from: number, to: number, includeMuted = true): Promise<{ countryCode: string; count: number }[]> {
  const conditions = [gte(wafEvents.ts, from), lte(wafEvents.ts, to)];
  if (!includeMuted) conditions.push(eq(wafEvents.muted, false));
  const rows = await db
    .select({ countryCode: wafEvents.countryCode, count: count() })
    .from(wafEvents)
    .where(and(...conditions))
    .groupBy(wafEvents.countryCode)
    .orderBy(desc(count()));
  return rows.map(r => ({ countryCode: r.countryCode ?? 'XX', count: r.count }));
}

export async function getWafRuleMessages(ruleIds: number[]): Promise<Record<number, string | null>> {
  if (ruleIds.length === 0) return {};
  const rows = await db
    .select({
      ruleId: wafEvents.ruleId,
      message: sql<string | null>`MAX(${wafEvents.ruleMessage})`,
    })
    .from(wafEvents)
    .where(inArray(wafEvents.ruleId, ruleIds))
    .groupBy(wafEvents.ruleId);
  return Object.fromEntries(
    rows.filter((r): r is typeof r & { ruleId: number } => r.ruleId != null)
        .map((r) => [r.ruleId, r.message ?? null])
  );
}

export async function listWafEvents(limit = 50, offset = 0, search?: string, includeMuted = false): Promise<WafEvent[]> {
  const conditions = [];
  const searchCond = buildSearch(search);
  if (searchCond) conditions.push(searchCond);
  if (!includeMuted) conditions.push(eq(wafEvents.muted, false));
  const rows = await db
    .select()
    .from(wafEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(wafEvents.ts))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    host: r.host,
    clientIp: r.clientIp,
    countryCode: r.countryCode ?? null,
    method: r.method,
    uri: r.uri,
    ruleId: r.ruleId ?? null,
    ruleMessage: r.ruleMessage ?? null,
    severity: r.severity ?? null,
    rawData: r.rawData ?? null,
    blocked: r.blocked ?? true,
    muted: r.muted ?? false,
  }));
}

/**
 * Re-evaluate all existing events against current muted sources config.
 * Resets all muted flags, then marks matching events as muted.
 * Returns the number of events marked as muted.
 */
export async function reEvaluateMutedEvents(
  cidrs: string[],
  uaPatterns: string[]
): Promise<number> {
  // First, clear all muted flags
  const currentlyMuted = await db.select({ value: count() }).from(wafEvents).where(eq(wafEvents.muted, true));
  if (currentlyMuted[0]?.value > 0) {
    await db.update(wafEvents).set({ muted: false }).where(eq(wafEvents.muted, true));
  }

  if (cidrs.length === 0 && uaPatterns.length === 0) return 0;

  // Load all events with clientIp (batch-friendly approach)
  const BATCH = 1000;
  let offset = 0;
  const mutedIds: number[] = [];

  // Build UA regex matchers once
  const uaMatchers = uaPatterns.map((p) => {
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try { return new RegExp(`^${escaped}$`, 'i'); } catch { return null; }
  }).filter((r): r is RegExp => r !== null);

  while (true) {
    const rows = await db
      .select({ id: wafEvents.id, clientIp: wafEvents.clientIp, rawData: wafEvents.rawData })
      .from(wafEvents)
      .orderBy(wafEvents.id)
      .limit(BATCH)
      .offset(offset);

    if (rows.length === 0) break;

    for (const row of rows) {
      let muted = false;

      // Check CIDR match
      if (cidrs.length > 0 && row.clientIp) {
        muted = isIpInAnyCidr(row.clientIp, cidrs);
      }

      // Check UA pattern match (extract from rawData if available)
      if (!muted && uaMatchers.length > 0 && row.rawData) {
        try {
          const data = JSON.parse(row.rawData);
          const ua = data?.request_headers?.['User-Agent']?.[0]
            ?? data?.request_headers?.['user-agent']?.[0]
            ?? '';
          if (ua) {
            muted = uaMatchers.some((re) => re.test(ua));
          }
        } catch { /* ignore parse errors */ }
      }

      if (muted) mutedIds.push(row.id);
    }

    offset += BATCH;
  }

  // Batch update in chunks
  const CHUNK = 500;
  for (let i = 0; i < mutedIds.length; i += CHUNK) {
    const chunk = mutedIds.slice(i, i + CHUNK);
    await db.update(wafEvents).set({ muted: true }).where(inArray(wafEvents.id, chunk));
  }

  return mutedIds.length;
}
