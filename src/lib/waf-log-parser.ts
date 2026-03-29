import { createReadStream, existsSync, statSync, truncateSync } from 'node:fs';
import { createInterface } from 'node:readline';
import maxmind, { CountryResponse } from 'maxmind';
import db from './db';
import { wafEvents, wafLogParseState } from './db/schema';
import { eq } from 'drizzle-orm';
import { getRetentionSettings, getWafSettings } from './settings';
import type { WafSettings } from './settings';
import { isIpInAnyCidr } from './cidr';
import { rollupWafHours, purgeOldWafRollups } from './analytics-rollup';

const AUDIT_LOG = '/logs/waf-audit.log';
const RULES_LOG = '/logs/waf-rules.log';
const GEOIP_DB = '/usr/share/GeoIP/GeoLite2-Country.mmdb';
const BATCH_SIZE = 200;
const DEFAULT_RETENTION_DAYS = 90;
const MAX_LINES_PER_CYCLE = 10_000;
const PURGE_INTERVAL_MS = 3_600_000; // 1 hour

let lastPurgeTime = 0;

let geoReader: Awaited<ReturnType<typeof maxmind.open<CountryResponse>>> | null = null;
const geoCache = new Map<string, string | null>();

let stopped = false;

// Muted sources cache (refreshed every 60s)
let cachedMutedSources: WafSettings['muted_sources'] | null = null;
let mutedSourcesLastRefresh = 0;
const MUTED_SOURCES_TTL_MS = 60_000;

async function getMutedSources(): Promise<WafSettings['muted_sources'] | undefined> {
  const now = Date.now();
  if (cachedMutedSources !== null && now - mutedSourcesLastRefresh < MUTED_SOURCES_TTL_MS) {
    return cachedMutedSources ?? undefined;
  }
  try {
    const waf = await getWafSettings();
    cachedMutedSources = waf?.muted_sources ?? null;
    mutedSourcesLastRefresh = now;
    return cachedMutedSources ?? undefined;
  } catch {
    return cachedMutedSources ?? undefined;
  }
}

function matchesUaPattern(ua: string, pattern: string): boolean {
  // Simple glob matching: * = any chars
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  try {
    return new RegExp(`^${escaped}$`, 'i').test(ua);
  } catch {
    return false;
  }
}

function isSourceMuted(clientIp: string, userAgent: string, mutedSources: WafSettings['muted_sources']): boolean {
  if (!mutedSources) return false;
  if (mutedSources.cidrs.length > 0 && isIpInAnyCidr(clientIp, mutedSources.cidrs)) return true;
  if (mutedSources.ua_patterns.length > 0 && userAgent) {
    return mutedSources.ua_patterns.some((p) => matchesUaPattern(userAgent, p));
  }
  return false;
}

// ── state helpers ─────────────────────────────────────────────────────────────

function getState(key: string): string | null {
  const row = db.select({ value: wafLogParseState.value }).from(wafLogParseState).where(eq(wafLogParseState.key, key)).get();
  return row?.value ?? null;
}

function setState(key: string, value: string): void {
  db.insert(wafLogParseState).values({ key, value }).onConflictDoUpdate({ target: wafLogParseState.key, set: { value } }).run();
}

// ── GeoIP ─────────────────────────────────────────────────────────────────────

async function initGeoIP(): Promise<void> {
  if (!existsSync(GEOIP_DB)) return;
  try {
    geoReader = await maxmind.open<CountryResponse>(GEOIP_DB);
  } catch {
    // GeoIP optional
  }
}

function lookupCountry(ip: string): string | null {
  if (!geoReader) return null;
  if (geoCache.has(ip)) return geoCache.get(ip)!;
  if (geoCache.size > 10_000) geoCache.clear();
  try {
    const result = geoReader.get(ip);
    const code = result?.country?.iso_code ?? null;
    geoCache.set(ip, code);
    return code;
  } catch {
    geoCache.set(ip, null);
    return null;
  }
}

// ── WAF rules log parsing ─────────────────────────────────────────────────────
// Caddy's http.handlers.waf logger emits a JSON line per matched rule containing
// the ModSecurity-format message string, e.g.:
//   [id "941100"] [msg "XSS Attack ..."] [severity "critical"] [unique_id "abc123"]
// We parse these to build a map of unique_id → first matched rule info.

interface RuleInfo {
  ruleId: number | null;
  ruleMessage: string | null;
  severity: string | null;
}

export function extractBracketField(msg: string, field: string): string | null {
  const m = msg.match(new RegExp(`\\[${field} "([^"]*)"\\]`));
  return m ? m[1] : null;
}

async function readRulesLog(startOffset: number): Promise<{ ruleMap: Map<string, RuleInfo>; newOffset: number }> {
  return new Promise((resolve, reject) => {
    const ruleMap = new Map<string, RuleInfo>();
    let bytesRead = 0;

    const stream = createReadStream(RULES_LOG, { start: startOffset, encoding: 'utf8' });
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'EACCES') resolve({ ruleMap, newOffset: startOffset });
      else reject(err);
    });

    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      bytesRead += Buffer.byteLength(line, 'utf8') + 1;
      if (!line.trim()) return;
      try {
        const entry = JSON.parse(line) as { msg?: string };
        const msg = entry.msg ?? '';
        const uniqueId = extractBracketField(msg, 'unique_id');
        if (!uniqueId) return;
        // Keep only the first detection rule per unique_id (skip anomaly evaluation rules)
        if (ruleMap.has(uniqueId)) return;
        const ruleIdStr = extractBracketField(msg, 'id');
        const ruleId = ruleIdStr ? parseInt(ruleIdStr, 10) : null;
        // Skip anomaly evaluation rule (949110 / 980130) — not a specific attack rule
        if (ruleId === 949110 || ruleId === 980130) return;
        ruleMap.set(uniqueId, {
          ruleId,
          ruleMessage: extractBracketField(msg, 'msg'),
          severity: extractBracketField(msg, 'severity'),
        });
      } catch {
        // skip malformed lines
      }
    });
    rl.on('close', () => resolve({ ruleMap, newOffset: startOffset + bytesRead }));
    rl.on('error', reject);
  });
}

// ── audit log parsing ─────────────────────────────────────────────────────────

interface CorazaAuditEntry {
  transaction?: {
    id?: string;
    client_ip?: string;
    // unix_timestamp is nanoseconds since epoch
    unix_timestamp?: number;
    timestamp?: string;
    // is_interrupted: true means the request was blocked/detected by the WAF
    is_interrupted?: boolean;
    request?: {
      method?: string;
      uri?: string;
      // header values are arrays of strings (lowercase keys)
      headers?: Record<string, string[]>;
    };
  };
}

function parseLine(line: string, ruleMap: Map<string, RuleInfo>, mutedSources?: WafSettings['muted_sources']): typeof wafEvents.$inferInsert | null {
  let entry: CorazaAuditEntry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  const tx = entry.transaction;
  if (!tx) return null;

  const clientIp = tx.client_ip ?? '';
  if (!clientIp) return null;

  const req = tx.request ?? {};

  // unix_timestamp is nanoseconds; fall back to parsing timestamp string
  let ts: number;
  if (tx.unix_timestamp) {
    ts = Math.floor(tx.unix_timestamp / 1e9);
  } else if (tx.timestamp) {
    ts = Math.floor(new Date(tx.timestamp).getTime() / 1000);
  } else {
    ts = Math.floor(Date.now() / 1000);
  }

  // Host header is an array under lowercase key
  const hostArr = req.headers?.['host'] ?? req.headers?.['Host'];
  const host = Array.isArray(hostArr) ? (hostArr[0] ?? '') : (hostArr ?? '');

  // User-Agent header for muted source matching
  const uaArr = req.headers?.['user-agent'] ?? req.headers?.['User-Agent'];
  const userAgent = Array.isArray(uaArr) ? (uaArr[0] ?? '') : (uaArr ?? '');

  // Look up rule info from the WAF rules log via the transaction unique_id
  const ruleInfo = tx.id ? ruleMap.get(tx.id) : undefined;

  const blocked = tx.is_interrupted ?? false;

  // Only store events where a specific rule matched or the request was blocked.
  // Audit log entries without any rule match are clean requests and can be discarded.
  if (!blocked && !ruleInfo) return null;

  const muted = isSourceMuted(clientIp, userAgent, mutedSources);

  return {
    ts,
    host,
    clientIp,
    countryCode: lookupCountry(clientIp),
    method: req.method ?? '',
    uri: req.uri ?? '',
    ruleId: ruleInfo?.ruleId ?? null,
    ruleMessage: ruleInfo?.ruleMessage ?? null,
    severity: ruleInfo?.severity ?? null,
    rawData: line,
    blocked,
    muted,
  };
}

async function readAuditLog(startOffset: number): Promise<{ lines: string[]; newOffset: number }> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    let bytesRead = 0;
    let capped = false;

    const stream = createReadStream(AUDIT_LOG, { start: startOffset, encoding: 'utf8' });
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'EACCES') resolve({ lines: [], newOffset: startOffset });
      else reject(err);
    });

    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (capped) return;
      bytesRead += Buffer.byteLength(line, 'utf8') + 1;
      if (line.trim()) lines.push(line.trim());
      if (lines.length >= MAX_LINES_PER_CYCLE) {
        capped = true;
        rl.close();
        stream.destroy();
      }
    });
    rl.on('close', () => resolve({ lines, newOffset: startOffset + bytesRead }));
    rl.on('error', reject);
  });
}

function insertBatch(rows: typeof wafEvents.$inferInsert[]): void {
  db.run('BEGIN');
  try {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      db.insert(wafEvents).values(rows.slice(i, i + BATCH_SIZE)).run();
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

async function purgeOldEntries(): Promise<void> {
  const now = Date.now();
  if (now - lastPurgeTime < PURGE_INTERVAL_MS) return;
  lastPurgeTime = now;
  const retention = await getRetentionSettings();
  const days = retention?.wafRetentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoff = Math.floor(now / 1000) - days * 86400;
  rollupWafHours();
  purgeOldWafRollups(cutoff);
  db.run(`DELETE FROM waf_events WHERE ts < ${cutoff}`);
  truncateAuditLog();
}

/**
 * Truncate the Coraza audit log file after all content has been parsed.
 *
 * Unlike the waf-rules.log (which has Caddy-native rotation via roll_size_mb),
 * waf-audit.log is written directly by Coraza's SecAuditLog and has no built-in
 * rotation.  Since the parser ingests every line into the database (where the
 * retention setting controls how long rows are kept), the file is just a transport
 * buffer.  Truncating it hourly prevents unbounded disk growth.
 *
 * Safety:
 *  - Only truncates when storedOffset >= currentSize (all content consumed).
 *  - Coraza opens the file with O_APPEND; after truncation to 0 bytes the next
 *    write resumes at offset 0 (standard Unix copytruncate semantics).
 *  - The parser already handles file-size decreases (resets offset to 0), so the
 *    next parse cycle works correctly after truncation.
 */
function truncateAuditLog(): void {
  try {
    if (!existsSync(AUDIT_LOG)) return;
    const storedOffset = parseInt(getState('waf_audit_log_offset') ?? '0', 10);
    const currentSize = statSync(AUDIT_LOG).size;
    // Only truncate when the parser has consumed all content
    if (currentSize > 0 && storedOffset >= currentSize) {
      truncateSync(AUDIT_LOG, 0);
      setState('waf_audit_log_offset', '0');
      setState('waf_audit_log_size', '0');
      console.log(`[waf-log-parser] truncated ${AUDIT_LOG} (was ${currentSize} bytes)`);
    }
  } catch {
    // Non-fatal: file may be locked or permissions insufficient in edge cases
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export async function initWafLogParser(): Promise<void> {
  await initGeoIP();
  console.log('[waf-log-parser] initialized');
}

export async function parseNewWafLogEntries(): Promise<void> {
  if (stopped) return;
  if (!existsSync(AUDIT_LOG)) return;

  try {
    // ── 0. Load muted sources configuration ──────────────────────────────────
    const mutedSources = await getMutedSources();

    // ── 1. Parse WAF rules log to build unique_id → rule info map ────────────
    const rulesOffset = parseInt(getState('waf_rules_log_offset') ?? '0', 10);
    const rulesSize = parseInt(getState('waf_rules_log_size') ?? '0', 10);

    let currentRulesSize = 0;
    if (existsSync(RULES_LOG)) {
      try { currentRulesSize = statSync(RULES_LOG).size; } catch { /* ignore */ }
    }
    const rulesStartOffset = currentRulesSize < rulesSize ? 0 : rulesOffset;
    const { ruleMap, newOffset: newRulesOffset } = await readRulesLog(rulesStartOffset);

    setState('waf_rules_log_offset', String(newRulesOffset));
    setState('waf_rules_log_size', String(currentRulesSize));

    // ── 2. Parse audit log, enriching events with rule info from map ─────────
    const storedOffset = parseInt(getState('waf_audit_log_offset') ?? '0', 10);
    const storedSize = parseInt(getState('waf_audit_log_size') ?? '0', 10);

    let currentSize: number;
    try {
      currentSize = statSync(AUDIT_LOG).size;
    } catch {
      return;
    }

    const startOffset = currentSize < storedSize ? 0 : storedOffset;
    const { lines, newOffset } = await readAuditLog(startOffset);

    if (lines.length > 0) {
      const t0 = performance.now();
      const rows = lines.map(l => parseLine(l, ruleMap, mutedSources)).filter((r): r is typeof wafEvents.$inferInsert => r !== null);
      const tParse = performance.now();
      if (rows.length > 0) {
        insertBatch(rows);
        const tInsert = performance.now();
        const rss = Math.round(process.memoryUsage.rss() / 1024 / 1024);
        console.log(
          `[waf-log-parser] ${lines.length} lines → ${rows.length} events ` +
          `parse=${Math.round(tParse - t0)}ms insert=${Math.round(tInsert - tParse)}ms rss=${rss}MB`
        );
        // Back-fill isBlocked on matching traffic_events rows so analytics blocked counts
        // reflect WAF blocks in addition to access-list/caddy-blocker blocks.
        const blockedRows = rows.filter(r => r.blocked);
        if (blockedRows.length > 0) {
          const tsList = blockedRows.map(r => r.ts as number);
          const minTs = Math.min(...tsList);
          const maxTs = Math.max(...tsList);
          db.run(
            `UPDATE traffic_events SET is_blocked = 1 WHERE is_blocked = 0 AND ts BETWEEN ${minTs} AND ${maxTs} ` +
            `AND EXISTS (SELECT 1 FROM waf_events WHERE waf_events.blocked = 1 ` +
            `AND waf_events.ts = traffic_events.ts AND waf_events.client_ip = traffic_events.client_ip ` +
            `AND waf_events.method = traffic_events.method AND waf_events.uri = traffic_events.uri)`
          );
        }
      }
    }

    setState('waf_audit_log_offset', String(newOffset));
    setState('waf_audit_log_size', String(currentSize));

    await purgeOldEntries();
  } catch (err) {
    console.error('[waf-log-parser] error during parse:', err);
  }
}

export function stopWafLogParser(): void {
  stopped = true;
}
