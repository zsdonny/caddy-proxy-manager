/**
 * ACME certificate info via TLS handshake probes + SQLite cache.
 *
 * Instead of reading Caddy's certificate files (which have owner-only
 * permissions), we connect to Caddy over TLS with the target SNI and parse the
 * peer certificate.  Results are cached in the `acme_cert_cache` table so the
 * certificates page loads instantly from the DB.
 */

import tls from 'node:tls';
import db from '@/src/lib/db';
import { acmeCertCache, proxyHosts, l4ProxyHosts } from '@/src/lib/db/schema';
import { isNull, eq, and, gt, notInArray } from 'drizzle-orm';

export type AcmeCertInfo = {
  validTo: string;
  validFrom: string;
  issuer: string;
  domains: string[];
};

// ---------------------------------------------------------------------------
// Probe target collection
// ---------------------------------------------------------------------------

type ProbeTarget = { domain: string; host: string; port: number };

/**
 * Resolve a Caddy container hostname from its API URL.
 * CADDY_API_URL is typically http://caddy:2019 — we extract "caddy".
 */
function caddyHostname(): string {
  const raw = process.env.CADDY_API_URL ?? 'http://caddy:2019';
  try {
    return new URL(raw).hostname;
  } catch {
    return 'caddy';
  }
}

/**
 * Parse a listen_address like ":443", "0.0.0.0:8443" into a port number.
 */
function parsePort(listenAddr: string): number | null {
  // Strip udp/ prefix if present
  const addr = listenAddr.replace(/^udp\//, '');
  const lastColon = addr.lastIndexOf(':');
  if (lastColon === -1) {
    const n = parseInt(addr, 10);
    return isNaN(n) ? null : n;
  }
  const n = parseInt(addr.slice(lastColon + 1), 10);
  return isNaN(n) ? null : n;
}

/**
 * Collect all domains that should be probed.
 * - HTTP proxy hosts without a custom certificate → probe caddy:443
 * - L4 TLS-terminating SNI hosts → probe caddy:<listen_port>
 */
export async function collectProbeTargets(): Promise<ProbeTarget[]> {
  const hostname = caddyHostname();
  const targets: ProbeTarget[] = [];
  const seen = new Set<string>();

  // HTTP proxy hosts (ACME-managed: no custom certificateId)
  const httpRows = await db
    .select({ domains: proxyHosts.domains, enabled: proxyHosts.enabled })
    .from(proxyHosts)
    .where(isNull(proxyHosts.certificateId));

  for (const row of httpRows) {
    const domains = JSON.parse(row.domains) as string[];
    for (const d of domains) {
      const domain = d.toLowerCase();
      const key = `${domain}:${hostname}:443`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ domain, host: hostname, port: 443 });
      }
    }
  }

  // L4 TLS-terminating SNI hosts
  const l4Rows = await db
    .select({
      matcherValue: l4ProxyHosts.matcherValue,
      listenAddress: l4ProxyHosts.listenAddress,
      enabled: l4ProxyHosts.enabled,
      meta: l4ProxyHosts.meta,
    })
    .from(l4ProxyHosts)
    .where(
      and(
        eq(l4ProxyHosts.tlsTermination, true),
        eq(l4ProxyHosts.matcherType, 'tls_sni'),
      )
    );

  for (const row of l4Rows) {
    const meta = row.meta ? JSON.parse(row.meta) as Record<string, unknown> : {};
    if (meta.certificate_id) continue; // uses imported cert, skip
    const port = parsePort(row.listenAddress);
    if (!port) continue;
    const domains = row.matcherValue
      ? (row.matcherValue.startsWith('[')
        ? JSON.parse(row.matcherValue) as string[]
        : row.matcherValue.split(',').map((s: string) => s.trim()))
      : [];
    for (const d of domains) {
      const domain = d.toLowerCase();
      const key = `${domain}:${hostname}:${port}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ domain, host: hostname, port });
      }
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// TLS probe
// ---------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 5000;
const MAX_CONCURRENT_PROBES = 10;

/**
 * For a wildcard domain like *.example.com, TLS SNI with a literal '*'
 * won't match a Caddy route.  Instead, probe with a synthetic subdomain
 * that Caddy will match to the wildcard cert.
 */
function sniForDomain(domain: string): string {
  if (domain.startsWith('*.')) {
    return `_acme-probe.${domain.slice(2)}`;
  }
  return domain;
}

/**
 * Connect to a TLS server with a specific SNI and parse the peer certificate.
 */
function probeTls(target: ProbeTarget): Promise<AcmeCertInfo | null> {
  const sni = sniForDomain(target.domain);
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: target.host,
        port: target.port,
        servername: sni,
        rejectUnauthorized: false, // we just want to read the cert, not validate trust
        timeout: PROBE_TIMEOUT_MS,
      },
      () => {
        try {
          const cert = socket.getPeerX509Certificate?.();
          if (!cert) {
            socket.destroy();
            resolve(null);
            return;
          }

          const sanDomains =
            cert.subjectAltName
              ?.split(',')
              .map((s: string) => s.trim())
              .filter((s: string) => s.startsWith('DNS:'))
              .map((s: string) => s.slice(4).toLowerCase()) ?? [];

          const issuerLine = cert.issuer ?? '';
          const issuer = (
            issuerLine.match(/O=([^\n,]+)/)?.[1] ??
            issuerLine.match(/CN=([^\n,]+)/)?.[1] ??
            issuerLine
          ).trim();

          socket.destroy();
          resolve({
            validTo: new Date(cert.validTo).toISOString(),
            validFrom: new Date(cert.validFrom).toISOString(),
            issuer,
            domains: sanDomains,
          });
        } catch {
          socket.destroy();
          resolve(null);
        }
      }
    );

    socket.on('timeout', () => { socket.destroy(); resolve(null); });
    socket.on('error', () => { socket.destroy(); resolve(null); });
  });
}

/**
 * Probe targets in parallel (limited concurrency) and upsert results into the cache.
 */
export async function probeAndCacheCerts(targets: ProbeTarget[]): Promise<number> {
  if (targets.length === 0) return 0;

  let probed = 0;
  const now = new Date().toISOString();

  // Process in batches of MAX_CONCURRENT_PROBES
  for (let i = 0; i < targets.length; i += MAX_CONCURRENT_PROBES) {
    const batch = targets.slice(i, i + MAX_CONCURRENT_PROBES);
    const results = await Promise.all(
      batch.map(async (target) => {
        const info = await probeTls(target);
        return { target, info };
      })
    );

    for (const { target, info } of results) {
      if (!info) continue;
      probed++;

      try {
        db.insert(acmeCertCache)
          .values({
            domain: target.domain,
            validFrom: info.validFrom,
            validTo: info.validTo,
            issuer: info.issuer,
            sanDomains: JSON.stringify(info.domains),
            probedAt: now,
            probeTarget: `${target.host}:${target.port}`,
          })
          .onConflictDoUpdate({
            target: acmeCertCache.domain,
            set: {
              validFrom: info.validFrom,
              validTo: info.validTo,
              issuer: info.issuer,
              sanDomains: JSON.stringify(info.domains),
              probedAt: now,
              probeTarget: `${target.host}:${target.port}`,
            },
          })
          .run();
      } catch (err) {
        console.error(`[acme-certs] failed to cache cert for ${target.domain}:`, err);
      }
    }
  }

  console.log(`[acme-certs] probed ${targets.length} target(s) → ${probed} cert(s) cached`);
  return probed;
}

// ---------------------------------------------------------------------------
// Cache read (used by certificates page)
// ---------------------------------------------------------------------------

/**
 * Read the cert cache and return a Map<domain, AcmeCertInfo>.
 * This is a fast DB read — no TLS connections, no filesystem access.
 */
export async function getAcmeCertMap(): Promise<Map<string, AcmeCertInfo>> {
  const rows = await db.select().from(acmeCertCache);
  const map = new Map<string, AcmeCertInfo>();

  for (const row of rows) {
    map.set(row.domain, {
      validFrom: row.validFrom,
      validTo: row.validTo,
      issuer: row.issuer,
      domains: JSON.parse(row.sanDomains) as string[],
    });
  }

  return map;
}

// ---------------------------------------------------------------------------
// Stale refresh (with in-flight coalescing)
// ---------------------------------------------------------------------------

const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

/** In-flight probe run — concurrent callers piggy-back on this promise. */
let probeRunning: Promise<void> | null = null;

/** Internal implementation — callers should use refreshStaleCertCache(). */
async function doRefresh(maxAgeMs: number): Promise<void> {
  const allTargets = await collectProbeTargets();
  if (allTargets.length === 0) return;

  // Prune orphan cache entries for domains that no longer have a proxy host
  const liveDomains = allTargets.map((t) => t.domain);
  try {
    if (liveDomains.length > 0) {
      db.delete(acmeCertCache)
        .where(notInArray(acmeCertCache.domain, liveDomains))
        .run();
    } else {
      db.delete(acmeCertCache).run();
    }
  } catch (err) {
    console.error('[acme-certs] orphan prune failed:', err);
  }

  let targets: ProbeTarget[];

  if (maxAgeMs <= 0) {
    // Full refresh: probe everything
    targets = allTargets;
  } else {
    // Only probe stale or missing entries
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const freshDomains = new Set(
      db
        .select({ domain: acmeCertCache.domain })
        .from(acmeCertCache)
        .where(gt(acmeCertCache.probedAt, cutoff))
        .all()
        .map((r) => r.domain)
    );
    targets = allTargets.filter((t) => !freshDomains.has(t.domain));
  }

  if (targets.length === 0) return;

  await probeAndCacheCerts(targets);
}

/**
 * Collect probe targets, filter to stale/missing, and probe them.
 * If a probe run is already in flight, callers coalesce onto it.
 * @param maxAgeMs  Set to 0 to force-refresh all. Default: 6 hours.
 */
export async function refreshStaleCertCache(maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<void> {
  if (probeRunning) {
    // Another refresh is already running — wait for it instead of stacking.
    await probeRunning;
    return;
  }

  probeRunning = doRefresh(maxAgeMs);
  try {
    await probeRunning;
  } finally {
    probeRunning = null;
  }
}

// ---------------------------------------------------------------------------
// Debounced schedule (used by caddy.ts after config apply)
// ---------------------------------------------------------------------------

const SCHEDULE_DELAY_MS = 15_000;
let pendingProbeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a full cert probe after a delay.  Repeated calls reset the timer
 * so rapid config applies only trigger a single probe run.
 */
export function scheduleCertRefresh(): void {
  if (pendingProbeTimer) clearTimeout(pendingProbeTimer);
  pendingProbeTimer = setTimeout(async () => {
    pendingProbeTimer = null;
    try {
      await refreshStaleCertCache(0);
    } catch (err) {
      console.error('[acme-certs] scheduled probe failed:', err);
    }
  }, SCHEDULE_DELAY_MS);
}
