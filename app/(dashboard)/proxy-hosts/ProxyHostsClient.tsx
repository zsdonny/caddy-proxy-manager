"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Globe, MoreHorizontal, ArrowRight, Lock, ShieldCheck, KeyRound, ShieldAlert, LockKeyhole, Scale, Waypoints, CornerDownRight, PenLine, FileJson, Workflow, ListFilter } from "lucide-react";
import type { AccessList } from "@/lib/models/access-lists";
import type { Certificate } from "@/lib/models/certificates";
import type { ProxyHost } from "@/lib/models/proxy-hosts";
import type { CaCertificate } from "@/lib/models/ca-certificates";
import type { AuthentikSettings } from "@/lib/settings";
import { toggleProxyHostAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchField } from "@/components/ui/SearchField";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { CreateHostDialog, EditHostDialog, DeleteHostDialog } from "@/components/proxy-hosts/HostDialogs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props = {
  hosts: ProxyHost[];
  certificates: Certificate[];
  accessLists: AccessList[];
  caCertificates: CaCertificate[];
  authentikDefaults: AuthentikSettings | null;
  pagination: { total: number; page: number; perPage: number };
  initialSearch: string;
  initialSort?: { sortBy: string; sortDir: "asc" | "desc" };
};

function getGeoLabel(host: ProxyHost): string | null {
  if (!host.geoblock?.enabled) return null;
  const hasCountry = (host.geoblock.block_countries?.length ?? 0) > 0 || (host.geoblock.allow_countries?.length ?? 0) > 0;
  const hasCidr = (host.geoblock.block_cidrs?.length ?? 0) > 0 || (host.geoblock.allow_cidrs?.length ?? 0) > 0;
  if (hasCountry && hasCidr) return "Country/CIDR";
  if (hasCountry) return "Country";
  if (hasCidr) return "CIDR";
  return "Geo";
}

function GeoBlockBadge({ host }: { host: ProxyHost }) {
  const label = getGeoLabel(host);
  if (!label) return null;
  const hasOverride = host.geoblock_mode === "override";
  const hasCustomBlock = (host.geoblock?.response_body && host.geoblock.response_body !== "Forbidden") || !!host.geoblock?.redirect_url;
  const showDot = hasOverride || hasCustomBlock;
  const popoverLines: string[] = [];
  if (hasOverride) popoverLines.push("Override global geo blocking");
  if (hasCustomBlock) popoverLines.push(host.geoblock?.redirect_url ? "Custom redirect URL" : "Custom block page");
  const badge = (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 relative transition-all duration-150 hover:scale-110 hover:brightness-110">
      <Globe className="h-2.5 w-2.5 mr-0.5" />{label}
      {showDot && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />}
    </Badge>
  );
  if (!showDot) return badge;
  return (
    <Popover>
      <PopoverTrigger asChild>{badge}</PopoverTrigger>
      <PopoverContent className="w-auto p-2 text-xs space-y-0.5">
        {popoverLines.map((line) => <p key={line} className="font-medium">{line}</p>)}
      </PopoverContent>
    </Popover>
  );
}

function WafBadge({ host }: { host: ProxyHost }) {
  if (!host.waf?.enabled) return null;
  const hasCustom = !!host.waf.custom_directives;
  const hasOverride = host.waf.waf_mode === "override";
  const showDot = hasCustom || hasOverride;
  const popoverLines: string[] = [];
  if (hasOverride) popoverLines.push("Override global WAF");
  if (hasCustom) popoverLines.push("Custom SecLang directives");
  const badge = (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400 relative transition-all duration-150 hover:scale-110 hover:brightness-110">
      <ShieldAlert className="h-2.5 w-2.5 mr-0.5" />WAF
      {showDot && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
    </Badge>
  );
  if (!showDot) return badge;
  return (
    <Popover>
      <PopoverTrigger asChild>{badge}</PopoverTrigger>
      <PopoverContent className="w-auto p-2 text-xs space-y-0.5">
        {popoverLines.map((line) => <p key={line} className="font-medium">{line}</p>)}
      </PopoverContent>
    </Popover>
  );
}

function ProxyFeatureBadges({ host }: { host: ProxyHost }) {
  const badges: React.ReactNode[] = [];
  if (host.certificate_id) badges.push(<Badge key="tls" variant="info" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><Lock className="h-2.5 w-2.5 mr-0.5" />TLS</Badge>);
  if (host.access_list_id) badges.push(<Badge key="auth" variant="warning" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Auth</Badge>);
  if (host.authentik?.enabled) badges.push(<Badge key="authentik" variant="outline" className="text-[10px] px-1.5 py-0 border-indigo-500/30 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 transition-all duration-150 hover:scale-110 hover:brightness-110"><KeyRound className="h-2.5 w-2.5 mr-0.5" />Authentik</Badge>);
  if (host.waf?.enabled) badges.push(<WafBadge key="waf" host={host} />);
  if (host.mtls?.enabled) badges.push(<Badge key="mtls" variant="warning" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><LockKeyhole className="h-2.5 w-2.5 mr-0.5" />mTLS</Badge>);
  if (host.geoblock?.enabled) badges.push(<GeoBlockBadge key="geo" host={host} />);
  if (host.load_balancer?.enabled) badges.push(<Badge key="lb" variant="info" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><Scale className="h-2.5 w-2.5 mr-0.5" />LB</Badge>);
  if (host.dns_resolver?.enabled) badges.push(<Badge key="dns" variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-all duration-150 hover:scale-110 hover:brightness-110"><Waypoints className="h-2.5 w-2.5 mr-0.5" />DNS</Badge>);
  if (host.redirects?.length > 0) badges.push(<Badge key="redirect" variant="muted" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><CornerDownRight className="h-2.5 w-2.5 mr-0.5" />Redirect</Badge>);
  if (host.rewrite?.path_prefix) badges.push(<Badge key="rewrite" variant="muted" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><PenLine className="h-2.5 w-2.5 mr-0.5" />Rewrite</Badge>);
  if (host.custom_reverse_proxy_json) badges.push(<Badge key="crp" variant="muted" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><FileJson className="h-2.5 w-2.5 mr-0.5" />Custom RP</Badge>);
  if (host.custom_pre_handlers_json) badges.push(<Badge key="pre" variant="muted" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><Workflow className="h-2.5 w-2.5 mr-0.5" />Pre-Handler</Badge>);
  if (badges.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return <div className="flex flex-wrap gap-1">{badges}</div>;
}

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

export default function ProxyHostsClient({ hosts, certificates, accessLists, caCertificates, authentikDefaults, pagination, initialSearch, initialSort }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateHost, setDuplicateHost] = useState<ProxyHost | null>(null);
  const [editHost, setEditHost] = useState<ProxyHost | null>(null);
  const [deleteHost, setDeleteHost] = useState<ProxyHost | null>(null);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [featureFilters, setFeatureFilters] = useState<Set<ProxyFeatureKey>>(new Set());
  const [optimisticEnabled, setOptimisticEnabled] = useState<Map<number, boolean>>(new Map());

  const toggleFeatureFilter = (key: ProxyFeatureKey) => {
    setFeatureFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filteredHosts = featureFilters.size === 0
    ? hosts
    : hosts.filter((h) => {
        const features = getProxyHostFeatures(h);
        for (const f of featureFilters) { if (features.has(f)) return true; }
        return false;
      });

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

  const featuresHeaderContent = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-3 h-8 font-medium">
          Features
          <ListFilter className={`ml-1 h-3.5 w-3.5 ${featureFilters.size > 0 ? "text-primary" : "opacity-50"}`} />
          {featureFilters.size > 0 && (
            <span className="ml-0.5 text-[10px] rounded-full bg-primary text-primary-foreground px-1">{featureFilters.size}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {PROXY_FEATURE_FILTERS.map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={featureFilters.has(key)}
            onCheckedChange={() => toggleFeatureFilter(key)}
            onSelect={(e) => e.preventDefault()}
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
  );

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchTerm(initialSearch);
  }, [initialSearch]);

  function handleSearchChange(value: string) {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("search", value.trim());
      } else {
        params.delete("search");
      }
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    }, 400);
  }

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    setOptimisticEnabled(prev => new Map([...prev, [id, enabled]]));
    try {
      const result = await toggleProxyHostAction(id, enabled);
      if (result.status === "error") {
        toast.error(result.message ?? "Failed to toggle host");
        setOptimisticEnabled(prev => { const next = new Map(prev); next.delete(id); return next; });
      }
    } catch {
      toast.error("Failed to toggle host");
      setOptimisticEnabled(prev => { const next = new Map(prev); next.delete(id); return next; });
    }
  };

  const columns = [
    {
      id: "name",
      label: "Name / Domain",
      sortKey: "name",
      render: (host: ProxyHost) => (
        <div className="flex items-start gap-3">
          <div className={[
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            host.enabled
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
          ].join(" ")}>
            <Globe className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{host.name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {host.domains[0]}
              {host.domains.length > 1 && (
                <span className="ml-1 text-muted-foreground">+{host.domains.length - 1}</span>
              )}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "target",
      label: "Upstream",
      sortKey: "upstreams",
      render: (host: ProxyHost) => (
        <div className="flex items-center gap-1.5">
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-sm font-mono font-medium text-foreground/80">
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
      headerContent: featuresHeaderContent,
      render: (host: ProxyHost) => <ProxyFeatureBadges host={host} />,
    },
    {
      id: "status",
      label: "Status",
      sortKey: "enabled",
      width: 110,
      render: (host: ProxyHost) => (
        <StatusChip status={host.enabled ? "active" : "inactive"} />
      ),
    },
    {
      id: "actions",
      label: "",
      align: "right" as const,
      width: 80,
      render: (host: ProxyHost) => (
        <div className="flex items-center gap-2 justify-end">
          <Switch
            checked={optimisticEnabled.has(host.id) ? optimisticEnabled.get(host.id)! : host.enabled}
            onCheckedChange={(checked) => handleToggleEnabled(host.id, checked)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditHost(host)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setDuplicateHost(host); setCreateOpen(true); }}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteHost(host)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const mobileCard = (host: ProxyHost) => (
    <Card className={[
      "border-l-2",
      host.enabled ? "border-l-emerald-500" : "border-l-zinc-500/30",
    ].join(" ")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-semibold truncate">{host.name}</p>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {host.domains[0]}{host.domains.length > 1 ? ` +${host.domains.length - 1}` : ""}
              <span className="mx-1 text-muted-foreground">→</span>
              {host.upstreams[0]}
            </p>
            <StatusChip status={host.enabled ? "active" : "inactive"} className="w-fit mt-1" />
            <div className="flex flex-wrap gap-1 mt-1">
              <ProxyFeatureBadges host={host} />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Switch
              checked={optimisticEnabled.has(host.id) ? optimisticEnabled.get(host.id)! : host.enabled}
              onCheckedChange={(checked) => handleToggleEnabled(host.id, checked)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditHost(host)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setDuplicateHost(host); setCreateOpen(true); }}>Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteHost(host)}>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Proxy Hosts"
        description="Define HTTP(S) reverse proxies orchestrated by Caddy with automated certificates."
        action={{ label: "Create Host", onClick: () => setCreateOpen(true) }}
      />

      <div className="flex items-center gap-2">
        <SearchField
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search hosts..."
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredHosts}
        keyField="id"
        emptyMessage={searchTerm ? "No hosts match your search" : "No proxy hosts found"}
        pagination={pagination}
        sort={initialSort}
        mobileCard={mobileCard}
        rowClassName={(host) => host.enabled ? "" : "opacity-75"}
      />

      <CreateHostDialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); setTimeout(() => setDuplicateHost(null), 200); }}
        initialData={duplicateHost}
        certificates={certificates}
        accessLists={accessLists}
        authentikDefaults={authentikDefaults}
        caCertificates={caCertificates}
      />

      {editHost && (
        <EditHostDialog
          open={!!editHost}
          host={editHost}
          onClose={() => setEditHost(null)}
          certificates={certificates}
          accessLists={accessLists}
          caCertificates={caCertificates}
        />
      )}

      {deleteHost && (
        <DeleteHostDialog
          open={!!deleteHost}
          host={deleteHost}
          onClose={() => setDeleteHost(null)}
        />
      )}
    </div>
  );
}
