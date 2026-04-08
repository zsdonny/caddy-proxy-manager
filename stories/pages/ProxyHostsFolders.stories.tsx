"use client";
/**
 * DEMO ONLY — Storybook story for drag-and-drop folder organization of proxy hosts.
 * This file is excluded from git tracking via .git/info/exclude.
 */
import React, { useMemo, useState, useCallback, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";
import { delay, getItemRow, getFolderZone, simulateDrag } from "../helpers/dndPlayHelpers";
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
// Shared mock data (a subset of ProxyHosts.stories.tsx)
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

const mockHosts: ProxyHost[] = [
  {
    id: 1, name: "Main App",
    domains: ["app.example.com"],
    upstreams: ["backend:3000"],
    certificate_id: 1, access_list_id: null,
    ssl_forced: true, hsts_enabled: true, hsts_subdomains: false,
    allow_websocket: true, preserve_host_header: true, skip_https_hostname_validation: false,
    enabled: true, created_at: now, updated_at: now,
    custom_reverse_proxy_json: null, custom_pre_handlers_json: null,
    authentik: null, load_balancer: null, dns_resolver: null, upstream_dns_resolution: null,
    geoblock: null, geoblock_mode: "merge",
    waf: { enabled: true, mode: "On", load_owasp_crs: true, waf_mode: "merge" },
    mtls: null, redirects: [], rewrite: null,
  },
  {
    id: 2, name: "Admin Panel",
    domains: ["admin.example.com"],
    upstreams: ["admin-service:8080"],
    certificate_id: 1, access_list_id: 1,
    ssl_forced: true, hsts_enabled: true, hsts_subdomains: false,
    allow_websocket: false, preserve_host_header: false, skip_https_hostname_validation: false,
    enabled: true, created_at: now, updated_at: now,
    custom_reverse_proxy_json: null, custom_pre_handlers_json: null,
    authentik: null, load_balancer: null, dns_resolver: null, upstream_dns_resolution: null,
    geoblock: null, geoblock_mode: "merge",
    waf: null,
    mtls: { enabled: true, ca_certificate_ids: [1] },
    redirects: [], rewrite: null,
  },
  {
    id: 3, name: "Public API",
    domains: ["api.example.com", "api-v2.example.com"],
    upstreams: ["api:4000"],
    certificate_id: 2, access_list_id: null,
    ssl_forced: true, hsts_enabled: true, hsts_subdomains: false,
    allow_websocket: false, preserve_host_header: false, skip_https_hostname_validation: false,
    enabled: true, created_at: now, updated_at: now,
    custom_reverse_proxy_json: null, custom_pre_handlers_json: null,
    authentik: null, load_balancer: null, dns_resolver: null, upstream_dns_resolution: null,
    geoblock: { enabled: true, block_countries: ["KP"], block_continents: [], block_asns: [], block_cidrs: [], block_ips: [], allow_countries: [], allow_continents: [], allow_asns: [], allow_cidrs: [], allow_ips: [], redirect_url: null, response_body: "Forbidden" } as ProxyHost["geoblock"],
    geoblock_mode: "override",
    waf: { enabled: true, mode: "On", load_owasp_crs: true, waf_mode: "override" },
    mtls: null, redirects: [],
    rewrite: { path_prefix: "/api/v1" },
  },
  {
    id: 4, name: "Scale Service",
    domains: ["scale.example.com"],
    upstreams: ["node-1:3000", "node-2:3000", "node-3:3000"],
    certificate_id: 3, access_list_id: null,
    ssl_forced: true, hsts_enabled: false, hsts_subdomains: false,
    allow_websocket: true, preserve_host_header: true, skip_https_hostname_validation: false,
    enabled: true, created_at: now, updated_at: now,
    custom_reverse_proxy_json: null, custom_pre_handlers_json: null,
    authentik: { enabled: true, outpostDomain: "auth.example.com", outpostUpstream: "authentik:9000", authEndpoint: null, copyHeaders: [], trustedProxies: [], setOutpostHostHeader: true, protectedPaths: null },
    load_balancer: { enabled: true, policy: "round_robin", policyHeaderField: null, policyCookieName: null, policyCookieSecret: null, tryDuration: "30s", tryInterval: "250ms", retries: 3, activeHealthCheck: null, passiveHealthCheck: null },
    dns_resolver: { enabled: true, resolvers: ["10.0.0.1:53"], fallbacks: null, timeout: "5s" },
    upstream_dns_resolution: null,
    geoblock: null, geoblock_mode: "merge",
    waf: null, mtls: null, redirects: [], rewrite: null,
  },
  {
    id: 5, name: "Legacy Redirect",
    domains: ["old.example.com"],
    upstreams: [],
    certificate_id: null, access_list_id: null,
    ssl_forced: false, hsts_enabled: false, hsts_subdomains: false,
    allow_websocket: false, preserve_host_header: false, skip_https_hostname_validation: false,
    enabled: true, created_at: now, updated_at: now,
    custom_reverse_proxy_json: null, custom_pre_handlers_json: null,
    authentik: null, load_balancer: null, dns_resolver: null, upstream_dns_resolution: null,
    geoblock: null, geoblock_mode: "merge",
    waf: null, mtls: null,
    redirects: [{ from: "/", to: "https://app.example.com", status: 301 }],
    rewrite: null,
  },
  {
    id: 6, name: "Staging",
    domains: ["staging.example.com"],
    upstreams: ["staging:3000"],
    certificate_id: null, access_list_id: null,
    ssl_forced: false, hsts_enabled: false, hsts_subdomains: false,
    allow_websocket: false, preserve_host_header: false, skip_https_hostname_validation: false,
    enabled: false, created_at: now, updated_at: now,
    custom_reverse_proxy_json: null, custom_pre_handlers_json: null,
    authentik: null, load_balancer: null, dns_resolver: null, upstream_dns_resolution: null,
    geoblock: null, geoblock_mode: "merge",
    waf: null, mtls: null, redirects: [], rewrite: null,
  },
  {
    id: 7, name: "WordPress Blog",
    domains: ["blog.example.com"],
    upstreams: ["wordpress:80"],
    certificate_id: 1, access_list_id: null,
    ssl_forced: true, hsts_enabled: false, hsts_subdomains: false,
    allow_websocket: false, preserve_host_header: false, skip_https_hostname_validation: false,
    enabled: true, created_at: now, updated_at: now,
    custom_reverse_proxy_json: null, custom_pre_handlers_json: null,
    authentik: null, load_balancer: null, dns_resolver: null, upstream_dns_resolution: null,
    geoblock: null, geoblock_mode: "merge",
    waf: { enabled: true, mode: "On", load_owasp_crs: true, waf_mode: "merge" },
    mtls: null, redirects: [], rewrite: null,
  },
];

// ---------------------------------------------------------------------------
// Feature filter helpers (matches ProxyHostsClient)
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
// Badge helpers (simplified from ProxyHostsClient — no popovers in demo)
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
// Controlled story wrapper
// ---------------------------------------------------------------------------

const INITIAL_FOLDERS_DEFAULT = [
  { name: "Production", itemIds: ["1", "3", "4"] },
  { name: "Internal",   itemIds: ["2", "7"] },
];
const INITIAL_UNGROUPED_DEFAULT = ["5", "6", "8"];

const INITIAL_FOLDERS_COLLAPSED = [
  { name: "Production", itemIds: ["1", "3", "4"] },
  { name: "Internal",   itemIds: ["2", "7"] },
];

function ProxyHostFolderDemo({
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
        return null; // third click clears
      }
      return { columnId, dir: "asc" };
    });
  }, []);

  const allItemIds = useMemo(() => mockHosts.map(h => String(h.id)), [])
  const folderState = useFolderState<ProxyHost>(
    { folders: initialFolders, ungrouped: initialUngrouped },
    allItemIds,
  );

  // Stable ref so columns useMemo doesn't depend on folderState directly.
  // folderState changes on every drag move, which would recreate columns,
  // re-render every ItemRow's content, and trigger the React 19 Radix Switch
  // ref-callback setState loop.
  const folderStateRef = useRef(folderState);
  folderStateRef.current = folderState;

  const mobileCard = useCallback((host: ProxyHost, dragHandle?: React.ReactNode) => {
    const currentFolderId = folderStateRef.current.folders.find(f => f.itemIds.includes(String(host.id)))?.id ?? null;
    return (
      <Card className={[
        "border-l-2",
        getEnabled(host) ? "border-l-emerald-500" : "border-l-zinc-500/30",
      ].join(" ")}>
        <CardContent className="p-4">
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

  // Apply collapseAll on mount
  React.useEffect(() => {
    if (collapseAll) {
      folderState.folders.forEach(f => {
        if (!f.collapsed) folderState.toggleFolder(f.id);
      });
    }
    // intentionally run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allItemsById = useMemo(
    () => Object.fromEntries(mockHosts.map(h => [String(h.id), h])),
    []
  );

  const itemsById = useMemo(() => {
    let entries = Object.entries(allItemsById);
    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      entries = entries.filter(([, h]) =>
        h.name.toLowerCase().includes(q) ||
        h.domains.some(d => d.toLowerCase().includes(q))
      );
    }
    // Feature filter
    if (featureFilters.size > 0) {
      entries = entries.filter(([, h]) => {
        const features = getProxyHostFeatures(h);
        for (const f of featureFilters) { if (features.has(f)) return true; }
        return false;
      });
    }
    return Object.fromEntries(entries);
  }, [allItemsById, searchTerm, featureFilters]);

  // Feature filter dropdown header
  const featuresHeaderContent = useMemo(() => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-3 h-8 font-medium uppercase text-xs tracking-wide">
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
      className: "w-44 shrink-0 flex items-center py-2 pr-3 overflow-hidden",
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
        description="Define HTTP(S) reverse proxies orchestrated by Caddy with automated certificates."
        action={{ label: "Create Host", onClick: () => {} }}
      />

      <div className="flex items-center gap-2">
        <SearchField
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search hosts..."
        />
      </div>

      <FolderAccordionTable
        itemsById={itemsById}
        folderState={folderState}
        columns={columns}
        itemLabel={h => h.name}
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
  title: "Pages/Proxy Hosts (Folders)",
  decorators: [withDashboardLayout],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/proxy-hosts" } },
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  name: "With folders",
  render: () => (
    <ProxyHostFolderDemo
      initialFolders={INITIAL_FOLDERS_DEFAULT}
      initialUngrouped={INITIAL_UNGROUPED_DEFAULT}
    />
  ),
};

export const CollapsedFolders: Story = {
  name: "Folders collapsed",
  render: () => (
    <ProxyHostFolderDemo
      initialFolders={INITIAL_FOLDERS_COLLAPSED}
      initialUngrouped={INITIAL_UNGROUPED_DEFAULT}
      collapseAll
    />
  ),
};

export const NoFolders: Story = {
  name: "No folders (flat)",
  render: () => (
    <ProxyHostFolderDemo
      initialFolders={[]}
      initialUngrouped={mockHosts.map(h => String(h.id))}
    />
  ),
};

export const EmptyFolder: Story = {
  name: "Empty folder state",
  render: () => (
    <ProxyHostFolderDemo
      initialFolders={[{ name: "Production", itemIds: [] }]}
      initialUngrouped={mockHosts.map(h => String(h.id))}
    />
  ),
};

/**
 * Automated rapid cross-container drag regression test.
 *
 * Grabs "Main App" from Production, moves it to Internal → ungrouped →
 * Internal → Production, drops, and repeats 3 times. If the measureRects
 * infinite-loop bug regresses, React throws "Maximum update depth exceeded"
 * before completion.
 */
export const CrossContainerDrag: Story = {
  name: "▶ Cross-container drag",
  render: () => (
    <ProxyHostFolderDemo
      initialFolders={INITIAL_FOLDERS_DEFAULT}
      initialUngrouped={INITIAL_UNGROUPED_DEFAULT}
    />
  ),
  play: async ({ canvasElement }) => {
    await delay(200);

    const ITERATIONS = 3;
    for (let i = 0; i < ITERATIONS; i++) {
      const sourceItem = getItemRow(canvasElement, "Main App");
      const internalZone = getFolderZone(canvasElement, "Internal");
      const ungroupedItem = getItemRow(canvasElement, "Legacy Redirect");
      const productionZone = getFolderZone(canvasElement, "Production");

      if (!sourceItem || !internalZone || !productionZone) break;

      const waypoints: Element[] = [internalZone];
      if (ungroupedItem) waypoints.push(ungroupedItem);
      waypoints.push(internalZone, productionZone);

      await simulateDrag(sourceItem, waypoints, productionZone);
      await delay(100);
    }

    await waitFor(() => {
      expect(getFolderZone(canvasElement, "Production")).toBeTruthy();
      expect(getFolderZone(canvasElement, "Internal")).toBeTruthy();
    });
  },
};
