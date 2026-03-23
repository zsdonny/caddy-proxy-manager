import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import maxmind, { CountryResponse } from 'maxmind';
import db from './db';
import { wafEvents, wafLogParseState } from './db/schema';
import { eq } from 'drizzle-orm';
import { getRetentionSettings } from './settings';

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

function parseLine(line: string, ruleMap: Map<string, RuleInfo>): typeof wafEvents.$inferInsert | null {
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

  // Look up rule info from the WAF rules log via the transaction unique_id
  const ruleInfo = tx.id ? ruleMap.get(tx.id) : undefined;

  const blocked = tx.is_interrupted ?? false;

  // Only store events where a specific rule matched or the request was blocked.
  // Audit log entries without any rule match are clean requests and can be discarded.
  if (!blocked && !ruleInfo) return null;

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
  db.run(`DELETE FROM waf_events WHERE ts < ${cutoff}`);
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
      const rows = lines.map(l => parseLine(l, ruleMap)).filter((r): r is typeof wafEvents.$inferInsert => r !== null);
      const tParse = performance.now();
      if (rows.length > 0) {
        insertBatch(rows);
        const tInsert = performance.now();
        const rss = Math.round(process.memoryUsage.rss() / 1024 / 1024);
        console.log(
          `[waf-log-parser] ${lines.length} lines → ${rows.length} events ` +
          `parse=${Math.round(tParse - t0)}ms insert=${Math.round(tInsert - tParse)}ms rss=${rss}MB`
        );
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
