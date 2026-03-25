export const dynamic = 'force-dynamic';

import { X509Certificate } from 'node:crypto';
import db from '@/src/lib/db';
import { proxyHosts, certificates, l4ProxyHosts } from '@/src/lib/db/schema';
import { isNull, isNotNull, count, eq, and, desc } from 'drizzle-orm';
import { requireAdmin } from '@/src/lib/auth';
import CertificatesClient from './CertificatesClient';
import { scanAcmeCerts } from '@/src/lib/acme-certs';
import { listCaCertificates, type CaCertificate } from '@/src/lib/models/ca-certificates';
import { listIssuedClientCertificates, type IssuedClientCertificate } from '@/src/lib/models/issued-client-certificates';
export type { CaCertificate };
export type { IssuedClientCertificate };

export type CaCertificateView = CaCertificate & {
  issuedCerts: IssuedClientCertificate[];
};

export type CertExpiryStatus = 'ok' | 'expiring_soon' | 'expired';

export type AcmeHost = {
  id: number;
  name: string;
  domains: string[];
  ssl_forced: boolean;
  enabled: boolean;
  certValidTo: string | null;
  certValidFrom: string | null;
  certIssuer: string | null;
  certExpiryStatus: CertExpiryStatus | null;
  source: 'http' | 'l4';
};

export type ImportedCertView = {
  id: number;
  name: string;
  domains: string[];
  validTo: string | null;
  validFrom: string | null;
  issuer: string | null;
  expiryStatus: CertExpiryStatus | null;
  usedBy: { id: number; name: string; domains: string[] }[];
};

export type ManagedCertView = { id: number; name: string; domain_names: string[] };

const PER_PAGE = 25;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

function parsePemInfo(pem: string): { validTo: string; validFrom: string; issuer: string; sanDomains: string[] } | null {
  try {
    const c = new X509Certificate(pem);
    const sanDomains =
      c.subjectAltName
        ?.split(',')
        .map(s => s.trim())
        .filter(s => s.startsWith('DNS:'))
        .map(s => s.slice(4)) ?? [];
    const issuerLine = c.issuer ?? '';
    const issuer = (
      issuerLine.match(/O=([^\n,]+)/)?.[1] ??
      issuerLine.match(/CN=([^\n,]+)/)?.[1] ??
      issuerLine
    ).trim();
    return {
      validTo: new Date(c.validTo).toISOString(),
      validFrom: new Date(c.validFrom).toISOString(),
      issuer,
      sanDomains,
    };
  } catch {
    return null;
  }
}

function getExpiryStatus(validToIso: string): CertExpiryStatus {
  const diff = new Date(validToIso).getTime() - Date.now();
  if (diff < 0) return 'expired';
  if (diff < 30 * 86400 * 1000) return 'expiring_soon';
  return 'ok';
}

export default async function CertificatesPage({ searchParams }: PageProps) {
  await requireAdmin();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PER_PAGE;
  const acmeCertMap = scanAcmeCerts();

  const [caCerts, issuedClientCerts] = await Promise.all([
    listCaCertificates(),
    listIssuedClientCertificates()
  ]);

  const [acmeRows, acmeTotal, certRows, usageRows, l4AcmeRows] = await Promise.all([
    db
      .select({
        id: proxyHosts.id,
        name: proxyHosts.name,
        domains: proxyHosts.domains,
        sslForced: proxyHosts.sslForced,
        enabled: proxyHosts.enabled,
      })
      .from(proxyHosts)
      .where(isNull(proxyHosts.certificateId))
      .orderBy(desc(proxyHosts.id))
      .limit(PER_PAGE)
      .offset(offset),
    db
      .select({ value: count() })
      .from(proxyHosts)
      .where(isNull(proxyHosts.certificateId))
      .then(([r]) => r?.value ?? 0),
    db.select().from(certificates),
    db
      .select({
        certId: proxyHosts.certificateId,
        hostId: proxyHosts.id,
        hostName: proxyHosts.name,
        hostDomains: proxyHosts.domains,
      })
      .from(proxyHosts)
      .where(isNotNull(proxyHosts.certificateId)),
    db
      .select({
        id: l4ProxyHosts.id,
        name: l4ProxyHosts.name,
        matcherValue: l4ProxyHosts.matcherValue,
        enabled: l4ProxyHosts.enabled,
        meta: l4ProxyHosts.meta,
      })
      .from(l4ProxyHosts)
      .where(
        and(
          eq(l4ProxyHosts.enabled, true),
          eq(l4ProxyHosts.tlsTermination, true),
          eq(l4ProxyHosts.matcherType, "tls_sni"),
        )
      )
      .orderBy(desc(l4ProxyHosts.id)),
  ]);

  const acmeHosts: AcmeHost[] = acmeRows.map(r => {
    const domains = JSON.parse(r.domains) as string[];
    let certInfo = null;
    for (const domain of domains) {
      const info = acmeCertMap.get(domain.toLowerCase());
      if (info) { certInfo = info; break; }
    }
    return {
      id: r.id,
      name: r.name,
      domains,
      ssl_forced: r.sslForced,
      enabled: r.enabled,
      certValidTo: certInfo?.validTo ?? null,
      certValidFrom: certInfo?.validFrom ?? null,
      certIssuer: certInfo?.issuer ?? null,
      certExpiryStatus: certInfo?.validTo ? getExpiryStatus(certInfo.validTo) : null,
      source: 'http' as const,
    };
  });

  // Merge L4 ACME hosts (TLS-terminating SNI hosts without a custom certificate)
  for (const r of l4AcmeRows) {
    const meta = r.meta ? JSON.parse(r.meta) as Record<string, unknown> : {};
    if (meta.certificate_id) continue; // uses imported cert, not ACME
    const domains = r.matcherValue
      ? (r.matcherValue.startsWith('[') ? JSON.parse(r.matcherValue) as string[] : r.matcherValue.split(',').map(s => s.trim()))
      : [];
    let certInfo = null;
    for (const domain of domains) {
      const info = acmeCertMap.get(domain.toLowerCase());
      if (info) { certInfo = info; break; }
    }
    acmeHosts.push({
      id: -r.id, // negative to avoid collisions with HTTP host IDs
      name: r.name,
      domains,
      ssl_forced: false,
      enabled: r.enabled,
      certValidTo: certInfo?.validTo ?? null,
      certValidFrom: certInfo?.validFrom ?? null,
      certIssuer: certInfo?.issuer ?? null,
      certExpiryStatus: certInfo?.validTo ? getExpiryStatus(certInfo.validTo) : null,
      source: 'l4' as const,
    });
  }

  const usageMap = new Map<number, { id: number; name: string; domains: string[] }[]>();
  for (const u of usageRows) {
    if (u.certId == null) continue;
    const hosts = usageMap.get(u.certId) ?? [];
    hosts.push({
      id: u.hostId,
      name: u.hostName,
      domains: JSON.parse(u.hostDomains) as string[],
    });
    usageMap.set(u.certId, hosts);
  }

  const importedCerts: ImportedCertView[] = [];
  const managedCerts: ManagedCertView[] = [];
  const issuedByCa = issuedClientCerts.reduce<Map<number, IssuedClientCertificate[]>>((map, cert) => {
    const current = map.get(cert.ca_certificate_id) ?? [];
    current.push(cert);
    map.set(cert.ca_certificate_id, current);
    return map;
  }, new Map());
  const caCertificateViews: CaCertificateView[] = caCerts.map((cert) => ({
    ...cert,
    issuedCerts: (issuedByCa.get(cert.id) ?? []) as IssuedClientCertificate[],
  }));

  for (const cert of certRows) {
    const domainNames = JSON.parse(cert.domainNames) as string[];
    if (cert.type === 'imported') {
      const pemInfo = cert.certificatePem ? parsePemInfo(cert.certificatePem) : null;
      importedCerts.push({
        id: cert.id,
        name: cert.name,
        domains: pemInfo?.sanDomains.length ? pemInfo.sanDomains : domainNames,
        validTo: pemInfo?.validTo ?? null,
        validFrom: pemInfo?.validFrom ?? null,
        issuer: pemInfo?.issuer ?? null,
        expiryStatus: pemInfo?.validTo ? getExpiryStatus(pemInfo.validTo) : null,
        usedBy: usageMap.get(cert.id) ?? [],
      });
    } else {
      managedCerts.push({ id: cert.id, name: cert.name, domain_names: domainNames });
    }
  }

  return (
    <CertificatesClient
      acmeHosts={acmeHosts}
      importedCerts={importedCerts}
      managedCerts={managedCerts}
      caCertificates={caCertificateViews}
      acmePagination={{ total: acmeHosts.length, page, perPage: PER_PAGE }}
    />
  );
}
