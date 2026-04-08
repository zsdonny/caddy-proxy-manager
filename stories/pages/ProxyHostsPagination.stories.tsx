"use client";
/**
 * DEMO ONLY — Storybook story for classic (non-folder) proxy hosts view with
 * 60 mock entries to test live pagination switching.
 *
 * How it works: The real ProxyHostsClient calls router.push('?page=N') when
 * the user clicks Previous / Next. We intercept that push in the wrapper,
 * parse the new page number, and re-render with the correct data slice —
 * simulating a real server round-trip without needing useSearchParams (which
 * is static in the Storybook mock and does not update on router.push).
 *
 * Note: "all items on one page" is not a valid story because the classic view
 * is server-paginated — the server only ever returns one page of items at a
 * time. The folder view (which is fully client-side) does support that.
 */
import React, { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ProxyHost } from "../../src/lib/models/proxy-hosts";
import ProxyHostsClient from "../../app/(dashboard)/proxy-hosts/ProxyHostsClient";
import { withDashboardLayout } from "../decorators";

const meta: Meta = {
  title: "Pages/Proxy Hosts/Many Items",
  decorators: [withDashboardLayout],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/proxy-hosts" } },
  },
};

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Generate 60 mock proxy hosts (same logic as ProxyHostsFoldersPagination)
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

const SERVICE_NAMES = [
  "Main App", "Admin Panel", "Public API", "Auth Service", "Payment Gateway",
  "Inventory Service", "Notification Hub", "Analytics Dashboard", "CMS Backend", "Image CDN",
  "Search API", "Chat Service", "Video Transcoder", "Email Service", "Webhook Relay",
  "GraphQL Gateway", "Rate Limiter", "Logging Proxy", "Metrics Collector", "Cache Layer",
  "User Portal", "Partner API", "Mobile BFF", "IoT Gateway", "CI Dashboard",
  "Status Page", "Docs Site", "Staging Frontend", "Staging API", "QA Environment",
  "Canary Deploy", "Blue Deployment", "Green Deployment", "Feature Preview", "PR Preview",
  "Internal Wiki", "Jira Proxy", "GitLab Mirror", "Artifactory", "SonarQube",
  "Grafana", "Prometheus Proxy", "Kibana", "Jaeger UI", "Vault UI",
  "Consul UI", "Nomad UI", "Terraform Backend", "Secrets Manager", "Key Service",
  "OAuth Provider", "SSO Gateway", "LDAP Bridge", "SCIM Endpoint", "Compliance API",
  "Billing Portal", "Invoice Service", "Subscription API", "Tax Calculator", "Report Generator",
];

const DOMAINS = SERVICE_NAMES.map(n =>
  n.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + ".example.com"
);

const UPSTREAMS_POOL = [
  "backend:3000", "api:4000", "web:8080", "app:5000", "svc:9090",
  "node-1:3000", "node-2:3000", "node-3:3000", "worker:8000", "internal:443",
];

function makeHost(id: number): ProxyHost {
  const name = SERVICE_NAMES[(id - 1) % SERVICE_NAMES.length]
    + (id > SERVICE_NAMES.length ? ` (${Math.ceil(id / SERVICE_NAMES.length)})` : "");
  const domain = id > SERVICE_NAMES.length
    ? `v${Math.ceil(id / SERVICE_NAMES.length)}-${DOMAINS[(id - 1) % DOMAINS.length]}`
    : DOMAINS[(id - 1) % DOMAINS.length];
  const upstreamCount = (id % 3) + 1;
  const upstreams = Array.from({ length: upstreamCount }, (_, i) =>
    UPSTREAMS_POOL[(id + i) % UPSTREAMS_POOL.length]
  );

  return {
    id,
    name,
    domains: id % 7 === 0 ? [domain, `alt-${domain}`] : [domain],
    upstreams,
    certificate_id: id % 5 === 0 ? null : (id % 3) + 1,
    access_list_id: id % 8 === 0 ? 1 : null,
    ssl_forced: id % 5 !== 0,
    hsts_enabled: id % 4 === 0,
    hsts_subdomains: false,
    allow_websocket: id % 3 === 0,
    preserve_host_header: id % 6 === 0,
    skip_https_hostname_validation: false,
    enabled: id % 9 !== 0,
    created_at: now,
    updated_at: now,
    custom_reverse_proxy_json: id % 12 === 0 ? '{"header_up": {"X-Custom": "true"}}' : null,
    custom_pre_handlers_json: id % 15 === 0 ? '{"rate_limit": {"zone": "api"}}' : null,
    authentik: id % 10 === 0
      ? { enabled: true, outpostDomain: "auth.example.com", outpostUpstream: "authentik:9000", authEndpoint: null, copyHeaders: [], trustedProxies: [], setOutpostHostHeader: true, protectedPaths: null, excludedPaths: null }
      : null,
    load_balancer: upstreamCount > 1
      ? { enabled: true, policy: "round_robin", policyHeaderField: null, policyCookieName: null, policyCookieSecret: null, tryDuration: "30s", tryInterval: "250ms", retries: 3, activeHealthCheck: null, passiveHealthCheck: null }
      : null,
    dns_resolver: id % 6 === 0
      ? { enabled: true, resolvers: ["10.0.0.1:53"], fallbacks: null, timeout: "5s" }
      : null,
    upstream_dns_resolution: null,
    geoblock: id % 11 === 0
      ? { enabled: true, block_countries: ["KP", "IR"], block_continents: [], block_asns: [], block_cidrs: [], block_ips: [], allow_countries: [], allow_continents: [], allow_asns: [], allow_cidrs: [], allow_ips: [], response_body: "Forbidden", trusted_proxies: [], fail_closed: false } as ProxyHost["geoblock"]
      : null,
    geoblock_mode: "merge",
    waf: id % 5 === 0
      ? { enabled: true, mode: "On", load_owasp_crs: true, waf_mode: "merge" }
      : null,
    mtls: id % 13 === 0
      ? { enabled: true, ca_certificate_ids: [1] }
      : null,
    redirects: id % 14 === 0 ? [{ from: "/old", to: "https://new.example.com", status: 301 }] : [],
    rewrite: id % 16 === 0 ? { path_prefix: "/api/v1" } : null,
  };
}

const PER_PAGE = 25;
const allMockHosts: ProxyHost[] = Array.from({ length: 60 }, (_, i) => makeHost(i + 1));

// ---------------------------------------------------------------------------
// Stateful wrapper — intercepts router.push to extract the new page number
// and re-render with the correct data slice.
// useSearchParams() is NOT used here because Storybook's mock implementation
// is static and does not re-render when router.push is called.
// ---------------------------------------------------------------------------

function ProxyHostsPaginationDemo() {
  const [page, setPage] = useState(1);
  const router = useRouter();

  // Patch router.push once (keyed to the router reference).
  // Every time ProxyHostsClient's PaginationBar calls router.push('?page=N'),
  // we intercept, parse the page, and update local state.
  useEffect(() => {
    const origPush = router.push;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (router as unknown as any).push = (href: string, ...rest: unknown[]) => {
      const qs = String(href).split("?")[1] ?? "";
      const p = parseInt(new URLSearchParams(qs).get("page") ?? "", 10);
      if (p > 0) setPage(p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (origPush as any)(href, ...rest);
    };
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (router as unknown as any).push = origPush;
    };
  }, [router]);

  const hosts = useMemo(
    () => allMockHosts.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [page]
  );

  return (
    <ProxyHostsClient
      hosts={hosts}
      certificates={[]}
      accessLists={[]}
      caCertificates={[]}
      authentikDefaults={null}
      pagination={{ total: allMockHosts.length, page, perPage: PER_PAGE }}
      initialSearch=""
      initialSort={{ sortBy: "name", sortDir: "asc" }}
      ruleSets={[]}
    />
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const SixtyHosts: Story = {
  name: "60 items — live page switching",
  render: () => <ProxyHostsPaginationDemo />,
};
