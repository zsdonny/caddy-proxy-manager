"use client";
/**
 * DEMO ONLY — Storybook story for proxy hosts folder view with many entries
 * to test pagination / scroll behaviour.
 */
import React, { useMemo, useState, useCallback, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Globe,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  LockKeyhole,
  Scale,
  Waypoints,
  CornerDownRight,
  PenLine,
  FileJson,
  Workflow,
  MoreHorizontal,
  ListFilter,
  FolderOpen,
} from "lucide-react";
import { Card, CardContent } from "../../src/components/ui/card";
import type { ProxyHost } from "../../src/lib/models/proxy-hosts";
import { StatusChip } from "../../src/components/ui/StatusChip";
import { Badge } from "../../src/components/ui/badge";
import { Button } from "../../src/components/ui/button";
import { PageHeader } from "../../src/components/ui/PageHeader";
import { SearchField } from "../../src/components/ui/SearchField";
import { Switch } from "../../src/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "../../src/components/ui/dropdown-menu";
import { withDashboardLayout } from "../decorators";
import { FolderAccordionTable, type FolderColumn, type SortState } from "../../src/components/folder-organization/FolderAccordionTable";
import { useFolderState } from "../../src/components/folder-organization/useFolderState";

// ---------------------------------------------------------------------------
// Generate 60 mock proxy hosts
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

const mockHosts: ProxyHost[] = Array.from({ length: 60 }, (_, i) => makeHost(i + 1));

// ---------------------------------------------------------------------------
// Feature filter helpers
// ---------------------------------------------------------------------------

const PROXY_FEATURE_FILTERS = [
  "Auth", "Authentik", "WAF", "mTLS", "GeoBlock", "LB", "DNS", "Redirect", "Rewrite", "Custom RP", "Pre-Handler",
] as const;
type ProxyFeatureKey = (typeof PROXY_FEATURE_FILTERS)[number];

function getProxyHostFeatures(host: ProxyHost): Set<ProxyFeatureKey> {
  const f = new Set<ProxyFeatureKey>();
  if (host.access_list_id) f.add("Auth");
  if (host.authentik?.enabled) f.add("Authentik");
  if (host.waf?.enabled) f.add("WAF");
  if (host.mtls?.enabled) f.add("mTLS");
  if (host.geoblock?.enabled) f.add("GeoBlock");
  if (host.load_balancer?.enabled) f.add("LB");
  if (host.dns_resolver?.enabled) f.add("DNS");
  if (host.redirects?.length > 0) f.add("Redirect");
  if (host.rewrite?.path_prefix) f.add("Rewrite");
  if (host.custom_reverse_proxy_json) f.add("Custom RP");
  if (host.custom_pre_handlers_json) f.add("Pre-Handler");
  return f;
}

const PROXY_FILTER_ICONS: Record<ProxyFeatureKey, React.ReactNode> = {
  "Auth":        <ShieldCheck  className="h-3.5 w-3.5 text-amber-500" />,
  "Authentik":   <KeyRound     className="h-3.5 w-3.5" />,
  "WAF":         <ShieldAlert  className="h-3.5 w-3.5 text-red-400" />,
  "mTLS":        <LockKeyhole  className="h-3.5 w-3.5 text-amber-500" />,
  "GeoBlock":    <Globe        className="h-3.5 w-3.5 text-rose-500" />,
  "LB":          <Scale        className="h-3.5 w-3.5 text-cyan-500" />,
  "DNS":         <Waypoints    className="h-3.5 w-3.5 text-emerald-500" />,
  "Redirect":    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />,
  "Rewrite":     <PenLine      className="h-3.5 w-3.5 text-muted-foreground" />,
  "Custom RP":   <FileJson     className="h-3.5 w-3.5 text-muted-foreground" />,
  "Pre-Handler": <Workflow     className="h-3.5 w-3.5 text-muted-foreground" />,
};

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function ProxyFeatureBadges({ host }: { host: ProxyHost }) {
  const badges: React.ReactNode[] = [];
  if (host.access_list_id)       badges.push(<Badge key="auth" variant="warning" className="text-[10px] px-1.5 py-0"><ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Auth</Badge>);
  if (host.authentik?.enabled)   badges.push(<Badge key="authentik" variant="outline" className="text-[10px] px-1.5 py-0 border-indigo-500/30 bg-indigo-500/10 text-indigo-500"><KeyRound className="h-2.5 w-2.5 mr-0.5" />Authentik</Badge>);
  if (host.waf?.enabled)         badges.push(<Badge key="waf" variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/30 bg-red-500/10 text-red-500"><ShieldAlert className="h-2.5 w-2.5 mr-0.5" />WAF</Badge>);
  if (host.mtls?.enabled)        badges.push(<Badge key="mtls" variant="warning" className="text-[10px] px-1.5 py-0"><LockKeyhole className="h-2.5 w-2.5 mr-0.5" />mTLS</Badge>);
  if (host.geoblock?.enabled)    badges.push(<Badge key="geo" variant="outline" className="text-[10px] px-1.5 py-0 border-rose-500/30 bg-rose-500/10 text-rose-600"><Globe className="h-2.5 w-2.5 mr-0.5" />Geo</Badge>);
  if (host.load_balancer?.enabled) badges.push(<Badge key="lb" variant="info" className="text-[10px] px-1.5 py-0"><Scale className="h-2.5 w-2.5 mr-0.5" />LB</Badge>);
  if (host.dns_resolver?.enabled)  badges.push(<Badge key="dns" variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600"><Waypoints className="h-2.5 w-2.5 mr-0.5" />DNS</Badge>);
  if (host.redirects?.length > 0) badges.push(<Badge key="redir" variant="muted" className="text-[10px] px-1.5 py-0"><CornerDownRight className="h-2.5 w-2.5 mr-0.5" />Redirect</Badge>);
  if (host.rewrite?.path_prefix)  badges.push(<Badge key="rw" variant="muted" className="text-[10px] px-1.5 py-0"><PenLine className="h-2.5 w-2.5 mr-0.5" />Rewrite</Badge>);
  if (host.custom_reverse_proxy_json) badges.push(<Badge key="crp" variant="muted" className="text-[10px] px-1.5 py-0"><FileJson className="h-2.5 w-2.5 mr-0.5" />Custom RP</Badge>);
  if (host.custom_pre_handlers_json)  badges.push(<Badge key="pre" variant="muted" className="text-[10px] px-1.5 py-0"><Workflow className="h-2.5 w-2.5 mr-0.5" />Pre-Handler</Badge>);
  if (badges.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return <div className="flex flex-wrap gap-1">{badges}</div>;
}

// ---------------------------------------------------------------------------
// Initial folder layout — 60 items spread across 6 folders + ungrouped
// ---------------------------------------------------------------------------

const INITIAL_FOLDERS = [
  { name: "Production",   itemIds: ["1", "3", "5", "7", "9", "11", "13", "15", "17", "19"] },
  { name: "Staging",      itemIds: ["2", "4", "6", "8", "10", "12", "14"] },
  { name: "Internal",     itemIds: ["21", "23", "25", "27", "29", "31"] },
  { name: "Monitoring",   itemIds: ["33", "35", "37", "39", "41"] },
  { name: "CI / CD",      itemIds: ["43", "45", "47", "49"] },
  { name: "Deprecated",   itemIds: ["51", "53", "55", "57", "59"] },
];

const assignedIds = new Set(INITIAL_FOLDERS.flatMap(f => f.itemIds));
const INITIAL_UNGROUPED = mockHosts.map(h => String(h.id)).filter(id => !assignedIds.has(id));

// ---------------------------------------------------------------------------
// Story wrapper
// ---------------------------------------------------------------------------

function ProxyHostFolderPaginationDemo({
  initialFolders,
  initialUngrouped,
  collapseAll = false,
}: {
  initialFolders: Array<{ name: string; itemIds: string[] }>;
  initialUngrouped: string[];
  collapseAll?: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [enabledOverrides, setEnabledOverrides] = useState<Map<number, boolean>>(new Map());
  const [featureFilters, setFeatureFilters] = useState<Set<ProxyFeatureKey>>(new Set());
  const [sort, setSort] = useState<SortState>(null);

  const getEnabled = useCallback(
    (host: ProxyHost) => enabledOverrides.has(host.id) ? enabledOverrides.get(host.id)! : host.enabled,
    [enabledOverrides]
  );

  const handleToggle = useCallback((id: number, val: boolean) => {
    setEnabledOverrides(prev => new Map(prev).set(id, val));
  }, []);

  const toggleFeatureFilter = useCallback((key: ProxyFeatureKey) => {
    setFeatureFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleSort = useCallback((columnId: string) => {
    setSort(prev => {
      if (prev?.columnId === columnId) {
        if (prev.dir === "asc") return { columnId, dir: "desc" };
        return null;
      }
      return { columnId, dir: "asc" };
    });
  }, []);

  const allItemIds = useMemo(() => mockHosts.map(h => String(h.id)), []);
  const folderState = useFolderState<ProxyHost>(
    { folders: initialFolders, ungrouped: initialUngrouped },
    allItemIds,
  );

  const folderStateRef = useRef(folderState);
  folderStateRef.current = folderState;

  const mobileCard = useCallback((host: ProxyHost, dragHandle?: React.ReactNode) => {
    const currentFolderId = folderStateRef.current.folders.find(f => f.itemIds.includes(String(host.id)))?.id ?? null;
    return (
      <Card className={[
        "border-l-2 overflow-hidden",
        getEnabled(host) ? "border-l-emerald-500" : "border-l-zinc-500/30",
      ].join(" ")}>
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            {dragHandle}
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{host.name}</p>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {host.domains[0]}{host.domains.length > 1 ? ` +${host.domains.length - 1}` : ""}
                <span className="mx-1 text-muted-foreground">→</span>
                {host.upstreams[0]}
              </p>
              <StatusChip status={getEnabled(host) ? "active" : "inactive"} className="w-fit mt-1" />
              <div className="flex flex-wrap gap-1 mt-1">
                <ProxyFeatureBadges host={host} />
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Switch
                checked={getEnabled(host)}
                onCheckedChange={val => handleToggle(host.id, val)}
                aria-label={`Toggle ${host.name}`}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderOpen className="h-3.5 w-3.5 mr-2" />
                      Move to folder
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        disabled={currentFolderId === null}
                        onClick={() => folderStateRef.current.moveItem(String(host.id), null)}
                      >
                        Ungrouped
                      </DropdownMenuItem>
                      {folderStateRef.current.folders.length > 0 && <DropdownMenuSeparator />}
                      {folderStateRef.current.folders.map(f => (
                        <DropdownMenuItem
                          key={f.id}
                          disabled={f.id === currentFolderId}
                          onClick={() => folderStateRef.current.moveItem(String(host.id), f.id)}
                        >
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }, [getEnabled, handleToggle]);

  React.useEffect(() => {
    if (collapseAll) {
      folderState.folders.forEach(f => {
        if (!f.collapsed) folderState.toggleFolder(f.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allItemsById = useMemo(
    () => Object.fromEntries(mockHosts.map(h => [String(h.id), h])),
    []
  );

  const itemsById = useMemo(() => {
    let entries = Object.entries(allItemsById);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      entries = entries.filter(([, h]) =>
        h.name.toLowerCase().includes(q) ||
        h.domains.some(d => d.toLowerCase().includes(q))
      );
    }
    if (featureFilters.size > 0) {
      entries = entries.filter(([, h]) => {
        const features = getProxyHostFeatures(h);
        for (const f of featureFilters) { if (features.has(f)) return true; }
        return false;
      });
    }
    return Object.fromEntries(entries);
  }, [allItemsById, searchTerm, featureFilters]);

  const featuresHeaderContent = useMemo(() => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-3 h-8 font-medium text-xs tracking-wide">
          Features
          <ListFilter className={`ml-1 h-3.5 w-3.5 ${featureFilters.size > 0 ? "text-primary" : "opacity-50"}`} />
          {featureFilters.size > 0 && (
            <span className="ml-0.5 text-[10px] rounded-full bg-primary text-primary-foreground px-1">{featureFilters.size}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {PROXY_FEATURE_FILTERS.map(key => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={featureFilters.has(key)}
            onCheckedChange={() => toggleFeatureFilter(key)}
            onSelect={e => e.preventDefault()}
          >
            <span className="flex items-center gap-2">{PROXY_FILTER_ICONS[key]}{key}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {featureFilters.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setFeatureFilters(new Set())}>
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ), [featureFilters, toggleFeatureFilter]);

  const columns = useMemo<FolderColumn<ProxyHost>[]>(() => [
    {
      id: "name",
      label: "Name / Domain",
      className: "flex-1 min-w-[200px] flex items-start gap-3 py-2 pr-3 overflow-hidden",
      sortFn: host => host.name.toLowerCase(),
      render: host => (
        <>
          <div className={[
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            getEnabled(host)
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
          ].join(" ")}>
            <Globe className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{host.name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
              {host.domains[0]}
              {host.domains.length > 1 && (
                <span className="ml-1">+{host.domains.length - 1}</span>
              )}
            </p>
          </div>
        </>
      ),
    },
    {
      id: "upstream",
      label: "Upstream",
      className: "flex-1 min-w-[11rem] flex items-center py-2 pr-3 overflow-hidden",
      render: host => host.upstreams.length === 0
        ? <span className="text-xs text-muted-foreground">—</span>
        : (
          <div className="flex items-center gap-1.5 min-w-0">
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-sm font-mono font-medium text-foreground/80 truncate">
              {host.upstreams[0]}
              {host.upstreams.length > 1 && (
                <span className="ml-1 text-muted-foreground">+{host.upstreams.length - 1}</span>
              )}
            </span>
          </div>
        ),
    },
    {
      id: "features",
      label: "Features",
      className: "flex-1 min-w-[180px] flex items-center py-2 pr-3 overflow-hidden",
      headerContent: featuresHeaderContent,
      render: host => <ProxyFeatureBadges host={host} />,
    },
    {
      id: "status",
      label: "Status",
      className: "w-28 shrink-0 flex items-center py-2 pr-3",
      sortFn: host => getEnabled(host) ? 0 : 1,
      render: host => <StatusChip status={getEnabled(host) ? "active" : "inactive"} />,
    },
    {
      id: "actions",
      label: "",
      className: "w-24 shrink-0 self-stretch flex items-center justify-end gap-2 py-2 pr-3 sticky right-0 z-10 bg-card group-hover:bg-muted/50 transition-colors shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]",
      render: host => {
        const currentFolderId = folderStateRef.current.folders.find(f => f.itemIds.includes(String(host.id)))?.id ?? null;
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={getEnabled(host)}
              onCheckedChange={val => handleToggle(host.id, val)}
              aria-label={`Toggle ${host.name}`}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderOpen className="h-3.5 w-3.5 mr-2" />
                    Move to folder
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      disabled={currentFolderId === null}
                      onClick={() => folderStateRef.current.moveItem(String(host.id), null)}
                    >
                      Ungrouped
                    </DropdownMenuItem>
                    {folderStateRef.current.folders.length > 0 && <DropdownMenuSeparator />}
                    {folderStateRef.current.folders.map(f => (
                      <DropdownMenuItem
                        key={f.id}
                        disabled={f.id === currentFolderId}
                        onClick={() => folderStateRef.current.moveItem(String(host.id), f.id)}
                      >
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [getEnabled, handleToggle, featuresHeaderContent]);

  return (
    <div className="flex flex-col gap-6 w-full">
      <PageHeader
        title="Proxy Hosts"
        description={`${mockHosts.length} HTTP(S) reverse proxies — pagination / scroll stress test.`}
        action={{ label: "Create Host", onClick: () => {} }}
      />

      <FolderAccordionTable
        itemsById={itemsById}
        folderState={folderState}
        columns={columns}
        toolbar={<SearchField value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search hosts..." />}
        itemLabel={h => h.name}
        itemSubLabel={h => h.domains[0] ?? ""}
        itemIcon={h => (
          <div className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            getEnabled(h)
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
          ].join(" ")}>
            <Globe className="h-3.5 w-3.5" />
          </div>
        )}
        mobileCard={mobileCard}
        emptyMessage={searchTerm || featureFilters.size > 0 ? "No hosts match your filters" : "No proxy hosts"}
        sort={sort}
        onSort={handleSort}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------

const meta: Meta = {
  title: "Pages/Proxy Hosts (Folders)/Many Items",
  decorators: [withDashboardLayout],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/proxy-hosts" } },
  },
};

export default meta;
type Story = StoryObj;

export const SixtyItemsWithFolders: Story = {
  name: "60 items — 6 folders",
  render: () => (
    <ProxyHostFolderPaginationDemo
      initialFolders={INITIAL_FOLDERS}
      initialUngrouped={INITIAL_UNGROUPED}
    />
  ),
};

export const SixtyItemsCollapsed: Story = {
  name: "60 items — folders collapsed",
  render: () => (
    <ProxyHostFolderPaginationDemo
      initialFolders={INITIAL_FOLDERS}
      initialUngrouped={INITIAL_UNGROUPED}
      collapseAll
    />
  ),
};

export const SixtyItemsFlat: Story = {
  name: "60 items — flat (no folders)",
  render: () => (
    <ProxyHostFolderPaginationDemo
      initialFolders={[]}
      initialUngrouped={mockHosts.map(h => String(h.id))}
    />
  ),
};

export const SixtyItemsAllInOneFolder: Story = {
  name: "60 items — single folder",
  render: () => (
    <ProxyHostFolderPaginationDemo
      initialFolders={[{ name: "Everything", itemIds: mockHosts.map(h => String(h.id)) }]}
      initialUngrouped={[]}
    />
  ),
};
