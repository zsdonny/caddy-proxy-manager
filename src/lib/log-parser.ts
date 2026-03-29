import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import maxmind, { CountryResponse } from 'maxmind';
import db from './db';
import { trafficEvents, logParseState } from './db/schema';
import { eq, sql } from 'drizzle-orm';
import { getRetentionSettings } from './settings';
import { rollupTrafficHours, purgeOldTrafficRollups } from './analytics-rollup';

const LOG_FILE = '/logs/access.log';
const GEOIP_DB = '/usr/share/GeoIP/GeoLite2-Country.mmdb';
const BATCH_SIZE = 500;
const DEFAULT_RETENTION_DAYS = 90;
const MAX_LINES_PER_CYCLE = 10_000;
const PURGE_INTERVAL_MS = 3_600_000; // 1 hour

let lastPurgeTime = 0;

// GeoIP reader — null if mmdb not available
let geoReader: Awaited<ReturnType<typeof maxmind.open<CountryResponse>>> | null = null;
const geoCache = new Map<string, string | null>();

let stopped = false;

// ── state helpers ────────────────────────────────────────────────────────────

function getState(key: string): string | null {
  const row = db.select({ value: logParseState.value }).from(logParseState).where(eq(logParseState.key, key)).get();
  return row?.value ?? null;
}

function setState(key: string, value: string): void {
  db.insert(logParseState).values({ key, value }).onConflictDoUpdate({ target: logParseState.key, set: { value } }).run();
}

// ── GeoIP ────────────────────────────────────────────────────────────────────

async function initGeoIP(): Promise<void> {
  if (!existsSync(GEOIP_DB)) {
    console.log('[log-parser] GeoIP database not found, country codes will be null');
    return;
  }
  try {
    geoReader = await maxmind.open<CountryResponse>(GEOIP_DB);
    console.log('[log-parser] GeoIP database loaded');
  } catch (err) {
    console.warn('[log-parser] Failed to load GeoIP database:', err);
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

// ── log parsing ──────────────────────────────────────────────────────────────

interface CaddyLogEntry {
  ts?: number;
  msg?: string;
  plugin?: string;
  // fields on "request blocked" entries (top-level)
  client_ip?: string;
  method?: string;
  uri?: string;
  // fields on "handled request" entries
  status?: number;
  size?: number;
  request?: {
    client_ip?: string;
    remote_ip?: string;
    host?: string;
    method?: string;
    uri?: string;
    proto?: string;
    headers?: Record<string, string[]>;
  };
}

// Build a set of signatures from caddy-blocker's "request blocked" entries so we
// can mark the corresponding "handled request" rows correctly instead of using
// status === 403 (which would also catch legitimate upstream 403s).
export function collectBlockedSignatures(lines: string[]): Set<string> {
  const blocked = new Set<string>();
  for (const line of lines) {
    let entry: CaddyLogEntry;
    try { entry = JSON.parse(line.trim()); } catch { continue; }
    if (entry.msg !== 'request blocked' || entry.plugin !== 'caddy-blocker') continue;
    const ts = Math.floor(entry.ts ?? 0);
    const key = `${ts}|${entry.client_ip ?? ''}|${entry.method ?? ''}|${entry.uri ?? ''}`;
    blocked.add(key);
  }
  return blocked;
}

export function parseLine(line: string, blocked: Set<string>): typeof trafficEvents.$inferInsert | null {
  let entry: CaddyLogEntry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  // Only process "handled request" log entries
  if (entry.msg !== 'handled request') return null;

  const req = entry.request ?? {};
  const clientIp = req.client_ip || req.remote_ip || '';
  const ts = Math.floor(entry.ts ?? Date.now() / 1000);
  const method = req.method ?? '';
  const uri = req.uri ?? '';
  const status = entry.status ?? 0;

  const key = `${ts}|${clientIp}|${method}|${uri}`;

  return {
    ts,
    clientIp,
    countryCode: clientIp ? lookupCountry(clientIp) : null,
    host: req.host ?? '',
    method,
    uri,
    status,
    proto: req.proto ?? '',
    bytesSent: entry.size ?? 0,
    userAgent: req.headers?.['User-Agent']?.[0] ?? '',
    isBlocked: blocked.has(key),
  };
}

async function readLines(startOffset: number): Promise<{ lines: string[]; newOffset: number }> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    let bytesRead = 0;
    let capped = false;

    const stream = createReadStream(LOG_FILE, { start: startOffset, encoding: 'utf8' });
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'EACCES') resolve({ lines: [], newOffset: startOffset });
      else reject(err);
    });

    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (capped) return;
      bytesRead += Buffer.byteLength(line, 'utf8') + 1; // +1 for newline
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

function insertBatch(rows: typeof trafficEvents.$inferInsert[]): void {
  db.run('BEGIN');
  try {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      db.insert(trafficEvents).values(rows.slice(i, i + BATCH_SIZE)).run();
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
  const days = retention?.trafficRetentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoff = Math.floor(now / 1000) - days * 86400;
  rollupTrafficHours();
  purgeOldTrafficRollups(cutoff);
  db.run(`DELETE FROM traffic_events WHERE ts < ${cutoff}`);
}

// ── public API ───────────────────────────────────────────────────────────────

export async function initLogParser(): Promise<void> {
  await initGeoIP();
  console.log('[log-parser] initialized');
}

export async function parseNewLogEntries(): Promise<void> {
  if (stopped) return;
  if (!existsSync(LOG_FILE)) return;

  try {
    const storedOffset = parseInt(getState('access_log_offset') ?? '0', 10);
    const storedSize = parseInt(getState('access_log_size') ?? '0', 10);

    let currentSize: number;
    try {
      currentSize = statSync(LOG_FILE).size;
    } catch {
      return;
    }

    // Detect log rotation: file shrank
    const startOffset = currentSize < storedSize ? 0 : storedOffset;

    const { lines, newOffset } = await readLines(startOffset);

    if (lines.length > 0) {
      const t0 = performance.now();
      const blocked = collectBlockedSignatures(lines);
      const rows = lines.map(l => parseLine(l, blocked)).filter(r => r !== null);
      const tParse = performance.now();
      insertBatch(rows);
      const tInsert = performance.now();
      // Back-fill isBlocked from any already-inserted WAF events for this time range
      // so analytics blocked counts reflect WAF blocks regardless of parse order.
      if (rows.length > 0) {
        const tsList = rows.map(r => r.ts as number);
        const minTs = Math.min(...tsList);
        const maxTs = Math.max(...tsList);
        db.run(
          `UPDATE traffic_events SET is_blocked = 1 WHERE is_blocked = 0 AND ts BETWEEN ${minTs} AND ${maxTs} ` +
          `AND EXISTS (SELECT 1 FROM waf_events WHERE waf_events.blocked = 1 ` +
          `AND waf_events.ts = traffic_events.ts AND waf_events.client_ip = traffic_events.client_ip ` +
          `AND waf_events.method = traffic_events.method AND waf_events.uri = traffic_events.uri)`
        );
      }
      const rss = Math.round(process.memoryUsage.rss() / 1024 / 1024);
      console.log(
        `[log-parser] ${lines.length} lines → ${rows.length} rows (${blocked.size} blocked) ` +
        `parse=${Math.round(tParse - t0)}ms insert=${Math.round(tInsert - tParse)}ms rss=${rss}MB`
      );
    }

    setState('access_log_offset', String(newOffset));
    setState('access_log_size', String(currentSize));

    await purgeOldEntries();
  } catch (err) {
    console.error('[log-parser] error during parse:', err);
  }
}

export function stopLogParser(): void {
  stopped = true;
}

/**
 * One-time startup back-fill: mark all existing traffic_events rows as blocked
 * where a matching WAF event (blocked=1) exists but the traffic row still has
 * is_blocked=0. This corrects historical data that was inserted before the
 * per-cycle WAF cross-reference was added.
 */
export function backfillWafBlocked(): void {
  db.run(
    `UPDATE traffic_events SET is_blocked = 1 WHERE is_blocked = 0 AND EXISTS (` +
    `SELECT 1 FROM waf_events WHERE waf_events.blocked = 1 ` +
    `AND waf_events.ts = traffic_events.ts AND waf_events.client_ip = traffic_events.client_ip ` +
    `AND waf_events.method = traffic_events.method AND waf_events.uri = traffic_events.uri)`
  );
  const changed = db.get<{ n: number }>(sql`SELECT changes() AS n`)?.n ?? 0;
  if (changed > 0) {
    console.log(`[log-parser] back-filled ${changed} traffic_events rows with WAF blocked status`);
  }
}
