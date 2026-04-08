"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Globe,
  ArrowRight,
  ShieldCheck,
  KeyRound,
  ShieldAlert,
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
import type { ProxyHost } from "@/lib/models/proxy-hosts";
import type { AccessList } from "@/lib/models/access-lists";
import type { Certificate } from "@/lib/models/certificates";
import type { CaCertificate } from "@/lib/models/ca-certificates";
import type { AuthentikSettings } from "@/lib/settings";
import type { FolderStateData } from "@/lib/models/user-preferences";
import type { RuleSetItem } from "@/src/components/waf/RuleSetDialog";
import { toggleProxyHostAction } from "./actions";
import { saveProxyHostFolderStateAction } from "./folder-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchField } from "@/components/ui/SearchField";
import { StatusChip } from "@/components/ui/StatusChip";
import { CreateHostDialog, EditHostDialog, DeleteHostDialog } from "@/components/proxy-hosts/HostDialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FolderAccordionTable, type FolderColumn, type SortState } from "@/components/folder-organization/FolderAccordionTable";
import { useFolderState } from "@/components/folder-organization/useFolderState";

// ---------------------------------------------------------------------------
// Feature filter types
// ---------------------------------------------------------------------------

const PROXY_FEATURE_FILTERS = [
  "Auth", "Authentik", "WAF", "mTLS", "GeoBlock", "LB", "DNS",
  "Redirect", "Rewrite", "Custom RP", "Pre-Handler",
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
  Auth: <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />,
  Authentik: <KeyRound className="h-3.5 w-3.5" />,
  WAF: <ShieldAlert className="h-3.5 w-3.5 text-red-400" />,
  mTLS: <LockKeyhole className="h-3.5 w-3.5 text-amber-500" />,
  GeoBlock: <Globe className="h-3.5 w-3.5 text-rose-500" />,
  LB: <Scale className="h-3.5 w-3.5 text-cyan-500" />,
  DNS: <Waypoints className="h-3.5 w-3.5 text-emerald-500" />,
  Redirect: <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />,
  Rewrite: <PenLine className="h-3.5 w-3.5 text-muted-foreground" />,
  "Custom RP": <FileJson className="h-3.5 w-3.5 text-muted-foreground" />,
  "Pre-Handler": <Workflow className="h-3.5 w-3.5 text-muted-foreground" />,
};

// ---------------------------------------------------------------------------
// Badge components (same as ProxyHostsClient)
// ---------------------------------------------------------------------------

function GeoBlockBadge({ host }: { host: ProxyHost }) {
  if (!host.geoblock?.enabled) return null;
  const hasCountry = (host.geoblock.block_countries?.length ?? 0) > 0 || (host.geoblock.allow_countries?.length ?? 0) > 0;
  const hasCidr = (host.geoblock.block_cidrs?.length ?? 0) > 0 || (host.geoblock.allow_cidrs?.length ?? 0) > 0;
  const label = hasCountry && hasCidr ? "Country/CIDR" : hasCountry ? "Country" : hasCidr ? "CIDR" : "Geo";
  const hasOverride = host.geoblock_mode === "override";
  const hasCustomBlock = (host.geoblock.response_body && host.geoblock.response_body !== "Forbidden") || !!host.geoblock.redirect_url;
  const showDot = hasOverride || hasCustomBlock;
  const badge = (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 relative transition-all duration-150 hover:scale-110 hover:brightness-110">
      <Globe className="h-2.5 w-2.5 mr-0.5" />{label}
      {showDot && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />}
    </Badge>
  );
  if (!showDot) return badge;
  const popoverLines: string[] = [];
  if (hasOverride) popoverLines.push("Override global geo blocking");
  if (hasCustomBlock) popoverLines.push(host.geoblock.redirect_url ? "Custom redirect URL" : "Custom block page");
  return (
    <Popover>
      <PopoverTrigger asChild>{badge}</PopoverTrigger>
      <PopoverContent className="w-auto p-2 text-xs space-y-0.5">
        {popoverLines.map(line => <p key={line} className="font-medium">{line}</p>)}
      </PopoverContent>
    </Popover>
  );
}

function WafBadge({ host, ruleSets = [] }: { host: ProxyHost; ruleSets?: RuleSetItem[] }) {
  if (!host.waf?.enabled) return null;
  const hasCustom = !!host.waf.custom_directives;
  const hasOverride = host.waf.waf_mode === "override";
  const selectedIds = host.waf.rule_set_ids ?? [];
  const hasRuleSets = selectedIds.length > 0;
  const showDot = hasCustom || hasOverride || hasRuleSets;
  const badge = (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400 relative transition-all duration-150 hover:scale-110 hover:brightness-110">
      <ShieldAlert className="h-2.5 w-2.5 mr-0.5" />WAF
      {showDot && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
    </Badge>
  );
  if (!showDot) return badge;
  const popoverLines: React.ReactNode[] = [];
  if (hasOverride) popoverLines.push(<p key="override" className="font-medium">Override global WAF</p>);
  if (hasCustom) popoverLines.push(<p key="custom" className="font-medium">Custom SecLang directives</p>);
  if (hasRuleSets) {
    const resolved = selectedIds
      .map(id => ruleSets.find(rs => rs.id === id))
      .filter(Boolean) as RuleSetItem[];
    const shown = resolved.slice(0, 1);
    const remaining = resolved.length - 1;
    popoverLines.push(
      <p key="rulesets" className="font-medium max-w-[220px]">
        <span className="truncate block" title={shown[0]?.name}>{shown[0]?.name ?? "Rule set"}</span>
        {remaining > 0 && <span className="text-muted-foreground"> and {remaining} more</span>}
      </p>,
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>{badge}</PopoverTrigger>
      <PopoverContent className="w-auto max-w-[260px] p-2 text-xs space-y-0.5">
        {popoverLines}
      </PopoverContent>
    </Popover>
  );
}

function ProxyFeatureBadges({ host, ruleSets = [] }: { host: ProxyHost; ruleSets?: RuleSetItem[] }) {
  const badges: React.ReactNode[] = [];
  if (host.access_list_id) badges.push(<Badge key="auth" variant="warning" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Auth</Badge>);
  if (host.authentik?.enabled) badges.push(<Badge key="authentik" variant="outline" className="text-[10px] px-1.5 py-0 border-indigo-500/30 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 transition-all duration-150 hover:scale-110 hover:brightness-110"><KeyRound className="h-2.5 w-2.5 mr-0.5" />Authentik</Badge>);
  if (host.waf?.enabled) badges.push(<WafBadge key="waf" host={host} ruleSets={ruleSets} />);
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  hosts: ProxyHost[];
  certificates: Certificate[];
  accessLists: AccessList[];
  caCertificates: CaCertificate[];
  authentikDefaults: AuthentikSettings | null;
  ruleSets?: RuleSetItem[];
  initialFolderState: FolderStateData | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProxyHostsFolderClient({
  hosts,
  certificates,
  accessLists,
  caCertificates,
  authentikDefaults,
  ruleSets = [],
  initialFolderState,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateHost, setDuplicateHost] = useState<ProxyHost | null>(null);
  const [editHost, setEditHost] = useState<ProxyHost | null>(null);
  const [deleteHost, setDeleteHost] = useState<ProxyHost | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [featureFilters, setFeatureFilters] = useState<Set<ProxyFeatureKey>>(new Set());
  const [sort, setSort] = useState<SortState>(null);
  const [optimisticEnabled, setOptimisticEnabled] = useState<Map<number, boolean>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive all item IDs from the full host set (no pagination in folder view)
  const allItemIds = useMemo(() => hosts.map(h => String(h.id)), [hosts]);

  // Debounced server-save
  const handleStateChange = useCallback((state: FolderStateData) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveProxyHostFolderStateAction(state).catch(() => {
        toast.error("Failed to save folder arrangement");
      });
    }, 500);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const folderState = useFolderState<ProxyHost>(initialFolderState, allItemIds, handleStateChange);

  // Stable ref so columns/mobileCard useMemo doesn't depend on folderState directly.
  // folderState changes on every drag move, which would recreate columns,
  // re-render Switch, and trigger the React 19 Radix Switch ref-callback setState loop.
  const folderStateRef = useRef(folderState);
  folderStateRef.current = folderState;

  // Clear stale optimistic toggle values when server data arrives
  useEffect(() => {
    setOptimisticEnabled(prev => {
      if (prev.size === 0) return prev;
      const next = new Map<number, boolean>();
      for (const [id, val] of prev) {
        const host = hosts.find(h => h.id === id);
        if (host && host.enabled !== val) next.set(id, val);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [hosts]);

  const getEnabled = useCallback(
    (host: ProxyHost) =>
      optimisticEnabled.has(host.id) ? optimisticEnabled.get(host.id)! : host.enabled,
    [optimisticEnabled],
  );

  const handleToggleEnabled = useCallback(async (id: number, enabled: boolean) => {
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
  }, []);

  const toggleFeatureFilter = useCallback((key: ProxyFeatureKey) => {
    setFeatureFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Filtered hosts for display
  const itemsById = useMemo(() => {
    let entries = hosts.map(h => [String(h.id), h] as const);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      entries = entries.filter(([, h]) =>
        h.name.toLowerCase().includes(q) ||
        h.domains.some(d => d.toLowerCase().includes(q)),
      );
    }
    if (featureFilters.size > 0) {
      entries = entries.filter(([, h]) => {
        const features = getProxyHostFeatures(h);
        for (const f of featureFilters) {
          if (features.has(f)) return true;
        }
        return false;
      });
    }
    return Object.fromEntries(entries);
  }, [hosts, searchTerm, featureFilters]);

  // Feature filter header dropdown
  const featuresHeaderContent = useMemo(() => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-3 h-8 font-medium uppercase text-xs tracking-wide">
          Features
          <ListFilter className={`ml-1 h-3.5 w-3.5 ${featureFilters.size > 0 ? "text-primary" : "opacity-50"}`} />
          {featureFilters.size > 0 && (
            <span className="ml-0.5 text-[10px] rounded-full bg-primary text-primary-foreground px-1">
              {featureFilters.size}
            </span>
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

  // Column definitions
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
      render: host => <ProxyFeatureBadges host={host} ruleSets={ruleSets} />,
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
        const currentFolderId =
          folderStateRef.current.folders.find(f => f.itemIds.includes(String(host.id)))?.id ?? null;
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={getEnabled(host)}
              onCheckedChange={checked => handleToggleEnabled(host.id, checked)}
              aria-label={`Toggle ${host.name}`}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditHost(host)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setDuplicateHost(host); setCreateOpen(true); }}>
                  Duplicate
                </DropdownMenuItem>
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
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteHost(host)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [getEnabled, handleToggleEnabled, featuresHeaderContent, ruleSets]);

  const handleSort = useCallback((columnId: string) => {
    setSort(prev => {
      if (prev?.columnId === columnId) {
        if (prev.dir === "asc") return { columnId, dir: "desc" };
        return null;
      }
      return { columnId, dir: "asc" };
    });
  }, []);

  const hasFilters = searchTerm.trim().length > 0 || featureFilters.size > 0;

  const mobileCard = useCallback((host: ProxyHost, dragHandle?: React.ReactNode) => {
    const currentFolderId =
      folderStateRef.current.folders.find(f => f.itemIds.includes(String(host.id)))?.id ?? null;
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
                <ProxyFeatureBadges host={host} ruleSets={ruleSets} />
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Switch
                checked={getEnabled(host)}
                onCheckedChange={checked => handleToggleEnabled(host.id, checked)}
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
                  <DropdownMenuItem onClick={() => setEditHost(host)}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setDuplicateHost(host); setCreateOpen(true); }}>
                    Duplicate
                  </DropdownMenuItem>
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
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteHost(host)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }, [getEnabled, handleToggleEnabled, ruleSets]);

  return (
    <div className="flex flex-col gap-6 w-full">
      <PageHeader
        title="Proxy Hosts"
        description="Define HTTP(S) reverse proxies orchestrated by Caddy with automated certificates."
        action={{ label: "Create Host", onClick: () => setCreateOpen(true) }}
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
        emptyMessage={hasFilters ? "No hosts match your filters" : "No proxy hosts"}
        sort={sort}
        onSort={handleSort}
      />

      <CreateHostDialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); setTimeout(() => setDuplicateHost(null), 200); }}
        initialData={duplicateHost}
        certificates={certificates}
        accessLists={accessLists}
        authentikDefaults={authentikDefaults}
        caCertificates={caCertificates}
        ruleSets={ruleSets}
      />

      {editHost && (
        <EditHostDialog
          open={!!editHost}
          host={editHost}
          onClose={() => setEditHost(null)}
          certificates={certificates}
          accessLists={accessLists}
          caCertificates={caCertificates}
          ruleSets={ruleSets}
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
