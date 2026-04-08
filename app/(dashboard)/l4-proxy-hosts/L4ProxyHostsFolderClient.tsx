"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Network,
  ArrowRight,
  Lock,
  LockKeyhole,
  Cable,
  Globe,
  Scale,
  Waypoints,
  Pin,
  MoreHorizontal,
  ListFilter,
  FolderOpen,
} from "lucide-react";
import type { L4ProxyHost } from "@/src/lib/models/l4-proxy-hosts";
import type { Certificate } from "@/lib/models/certificates";
import type { CaCertificate } from "@/lib/models/ca-certificates";
import type { FolderStateData } from "@/lib/models/user-preferences";
import { toggleL4ProxyHostAction } from "./actions";
import { saveL4FolderStateAction } from "./folder-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchField } from "@/components/ui/SearchField";
import { StatusChip } from "@/components/ui/StatusChip";
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
import { CreateL4HostDialog, EditL4HostDialog, DeleteL4HostDialog } from "@/components/l4-proxy-hosts/L4HostDialogs";
import { L4PortsApplyBanner } from "@/components/l4-proxy-hosts/L4PortsApplyBanner";
import { FolderAccordionTable, type FolderColumn, type SortState } from "@/components/folder-organization/FolderAccordionTable";
import { useFolderState } from "@/components/folder-organization/useFolderState";

// ---------------------------------------------------------------------------
// Feature filter types
// ---------------------------------------------------------------------------

const L4_FEATURE_FILTERS = [
  "TLS", "ProxyProto", "GeoBlock", "LB", "DNS", "DNS Pin", "Upstream TLS", "mTLS",
] as const;
type L4FeatureKey = (typeof L4_FEATURE_FILTERS)[number];

function getL4HostFeatures(host: L4ProxyHost): Set<L4FeatureKey> {
  const f = new Set<L4FeatureKey>();
  if (host.tls_termination) f.add("TLS");
  if (host.proxy_protocol_version) f.add("ProxyProto");
  if (host.geoblock?.enabled) f.add("GeoBlock");
  if (host.load_balancer?.enabled) f.add("LB");
  if (host.dns_resolver?.enabled) f.add("DNS");
  if (host.upstream_dns_resolution?.enabled) f.add("DNS Pin");
  if (host.upstream_tls?.enabled) f.add("Upstream TLS");
  if (host.mtls?.enabled) f.add("mTLS");
  return f;
}

const L4_FILTER_ICONS: Record<L4FeatureKey, React.ReactNode> = {
  TLS: <Lock className="h-3.5 w-3.5 text-cyan-500" />,
  ProxyProto: <Cable className="h-3.5 w-3.5 text-muted-foreground" />,
  GeoBlock: <Globe className="h-3.5 w-3.5 text-rose-500" />,
  LB: <Scale className="h-3.5 w-3.5 text-cyan-500" />,
  DNS: <Waypoints className="h-3.5 w-3.5 text-emerald-500" />,
  "DNS Pin": <Pin className="h-3.5 w-3.5 text-violet-500" />,
  "Upstream TLS": <Lock className="h-3.5 w-3.5 text-sky-500" />,
  mTLS: <LockKeyhole className="h-3.5 w-3.5 text-amber-500" />,
};

// ---------------------------------------------------------------------------
// Badge components
// ---------------------------------------------------------------------------

function formatMatcher(host: L4ProxyHost): string | null {
  if (host.matcher_type === "tls_sni") return `SNI: ${host.matcher_value.join(", ")}`;
  return null;
}

function ProtocolBadge({ protocol }: { protocol: string }) {
  return protocol === "tcp"
    ? <Badge variant="info">{protocol.toUpperCase()}</Badge>
    : <Badge variant="warning">{protocol.toUpperCase()}</Badge>;
}

function L4GeoBlockBadge({ host }: { host: L4ProxyHost }) {
  if (!host.geoblock?.enabled) return null;
  const hasCountry = (host.geoblock.block_countries?.length ?? 0) > 0 || (host.geoblock.allow_countries?.length ?? 0) > 0;
  const hasCidr = (host.geoblock.block_cidrs?.length ?? 0) > 0 || (host.geoblock.allow_cidrs?.length ?? 0) > 0;
  const label = hasCountry && hasCidr ? "Country/CIDR" : hasCountry ? "Country" : hasCidr ? "CIDR" : "Geo";
  const hasOverride = host.geoblock_mode === "override";
  const badge = (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 relative transition-all duration-150 hover:scale-110 hover:brightness-110">
      <Globe className="h-2.5 w-2.5 mr-0.5" />{label}
      {hasOverride && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />}
    </Badge>
  );
  if (!hasOverride) return badge;
  return (
    <Popover>
      <PopoverTrigger asChild>{badge}</PopoverTrigger>
      <PopoverContent className="w-auto p-2 text-xs">
        <p className="font-medium">Override global geo blocking</p>
      </PopoverContent>
    </Popover>
  );
}

function L4FeatureBadges({ host }: { host: L4ProxyHost }) {
  const badges: React.ReactNode[] = [];
  if (host.tls_termination) badges.push(<Badge key="tls" variant="info" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><Lock className="h-2.5 w-2.5 mr-0.5" />TLS</Badge>);
  if (host.proxy_protocol_version) badges.push(<Badge key="pp" variant="muted" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><Cable className="h-2.5 w-2.5 mr-0.5" />ProxyProto</Badge>);
  if (host.geoblock?.enabled) badges.push(<L4GeoBlockBadge key="geo" host={host} />);
  if (host.load_balancer?.enabled) badges.push(<Badge key="lb" variant="info" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><Scale className="h-2.5 w-2.5 mr-0.5" />LB</Badge>);
  if (host.dns_resolver?.enabled) badges.push(<Badge key="dns" variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-all duration-150 hover:scale-110 hover:brightness-110"><Waypoints className="h-2.5 w-2.5 mr-0.5" />DNS</Badge>);
  if (host.upstream_dns_resolution?.enabled) badges.push(<Badge key="dnspin" variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 transition-all duration-150 hover:scale-110 hover:brightness-110"><Pin className="h-2.5 w-2.5 mr-0.5" />DNS Pin</Badge>);
  if (host.upstream_tls?.enabled) badges.push(<Badge key="utls" variant="outline" className="text-[10px] px-1.5 py-0 border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 transition-all duration-150 hover:scale-110 hover:brightness-110"><Lock className="h-2.5 w-2.5 mr-0.5" />Upstream TLS</Badge>);
  if (host.mtls?.enabled) badges.push(<Badge key="mtls" variant="warning" className="text-[10px] px-1.5 py-0 transition-all duration-150 hover:scale-110 hover:brightness-110"><LockKeyhole className="h-2.5 w-2.5 mr-0.5" />mTLS</Badge>);
  if (badges.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return <div className="flex flex-wrap gap-1">{badges}</div>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  hosts: L4ProxyHost[];
  certificates?: Certificate[];
  caCertificates?: CaCertificate[];
  initialFolderState: FolderStateData | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function L4ProxyHostsFolderClient({
  hosts,
  certificates = [],
  caCertificates = [],
  initialFolderState,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateHost, setDuplicateHost] = useState<L4ProxyHost | null>(null);
  const [editHost, setEditHost] = useState<L4ProxyHost | null>(null);
  const [deleteHost, setDeleteHost] = useState<L4ProxyHost | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [featureFilters, setFeatureFilters] = useState<Set<L4FeatureKey>>(new Set());
  const [sort, setSort] = useState<SortState>(null);
  const [optimisticEnabled, setOptimisticEnabled] = useState<Map<number, boolean>>(new Map());
  const [bannerRefresh, setBannerRefresh] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allItemIds = useMemo(() => hosts.map(h => String(h.id)), [hosts]);

  const handleStateChange = useCallback((state: FolderStateData) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveL4FolderStateAction(state).catch(() => {
        toast.error("Failed to save folder arrangement");
      });
    }, 500);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const folderState = useFolderState<L4ProxyHost>(initialFolderState, allItemIds, handleStateChange);

  // Stable ref so columns/mobileCard useMemo doesn't depend on folderState directly.
  // folderState changes on every drag move, which would recreate columns,
  // re-render Switch, and trigger the React 19 Radix Switch ref-callback setState loop.
  const folderStateRef = useRef(folderState);
  folderStateRef.current = folderState;

  const signalBannerRefresh = useCallback(() => setBannerRefresh(n => n + 1), []);

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
    (host: L4ProxyHost) =>
      optimisticEnabled.has(host.id) ? optimisticEnabled.get(host.id)! : host.enabled,
    [optimisticEnabled],
  );

  const handleToggleEnabled = useCallback(async (id: number, enabled: boolean) => {
    setOptimisticEnabled(prev => new Map([...prev, [id, enabled]]));
    try {
      const result = await toggleL4ProxyHostAction(id, enabled);
      if (result.status === "error") {
        toast.error(result.message ?? "Failed to toggle host");
        setOptimisticEnabled(prev => { const next = new Map(prev); next.delete(id); return next; });
      }
    } catch {
      toast.error("Failed to toggle host");
      setOptimisticEnabled(prev => { const next = new Map(prev); next.delete(id); return next; });
    } finally {
      signalBannerRefresh();
    }
  }, [signalBannerRefresh]);

  const toggleFeatureFilter = useCallback((key: L4FeatureKey) => {
    setFeatureFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const itemsById = useMemo(() => {
    let entries = hosts.map(h => [String(h.id), h] as const);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      entries = entries.filter(([, h]) =>
        h.name.toLowerCase().includes(q) ||
        h.listen_address.includes(q) ||
        (formatMatcher(h) ?? "").toLowerCase().includes(q),
      );
    }
    if (featureFilters.size > 0) {
      entries = entries.filter(([, h]) => {
        const features = getL4HostFeatures(h);
        for (const f of featureFilters) {
          if (features.has(f)) return true;
        }
        return false;
      });
    }
    return Object.fromEntries(entries);
  }, [hosts, searchTerm, featureFilters]);

  const featuresHeaderContent = useMemo(() => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-3 h-8 font-medium text-xs tracking-wide">
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
        {L4_FEATURE_FILTERS.map(key => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={featureFilters.has(key)}
            onCheckedChange={() => toggleFeatureFilter(key)}
            onSelect={e => e.preventDefault()}
          >
            <span className="flex items-center gap-2">{L4_FILTER_ICONS[key]}{key}</span>
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

  const columns = useMemo<FolderColumn<L4ProxyHost>[]>(() => [
    {
      id: "name",
      label: "Name / Matcher",
      className: "flex-1 min-w-[200px] flex items-center gap-3 py-2 pr-3 overflow-hidden",
      sortFn: host => host.name.toLowerCase(),
      render: host => (
        <>
          <div className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            host.protocol === "tcp"
              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-500"
              : "border-amber-500/30 bg-amber-500/10 text-amber-500",
          ].join(" ")}>
            <Network className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{host.name}</p>
            {formatMatcher(host) && <p className="text-xs text-muted-foreground mt-0.5 truncate">{formatMatcher(host)}</p>}
          </div>
        </>
      ),
    },
    {
      id: "protocol",
      label: "Protocol",
      className: "w-20 shrink-0 flex items-center py-2 pr-3",
      sortFn: host => host.protocol,
      render: host => <ProtocolBadge protocol={host.protocol} />,
    },
    {
      id: "listen",
      label: "Listen",
      className: "w-32 shrink-0 flex items-center py-2 pr-3 overflow-hidden",
      sortFn: host => host.listen_address,
      render: host => (
        <span className="text-sm font-mono font-medium tabular-nums text-foreground/80 truncate">
          {host.listen_address}
        </span>
      ),
    },
    {
      id: "upstreams",
      label: "Upstreams",
      className: "w-44 shrink-0 flex items-center py-2 pr-3 overflow-hidden",
      render: host => (
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
      className: "flex-1 min-w-[160px] flex items-center py-2 pr-3 overflow-hidden",
      headerContent: featuresHeaderContent,
      render: host => <L4FeatureBadges host={host} />,
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
  ], [getEnabled, handleToggleEnabled, featuresHeaderContent]);

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

  const mobileCard = useCallback((host: L4ProxyHost, dragHandle?: React.ReactNode) => {
    const currentFolderId =
      folderStateRef.current.folders.find(f => f.itemIds.includes(String(host.id)))?.id ?? null;
    return (
      <Card className={[
        "border-l-2 overflow-hidden",
        host.protocol === "tcp" ? "border-l-cyan-500" : "border-l-amber-500",
      ].join(" ")}>
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            {dragHandle}
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold truncate">{host.name}</p>
                <ProtocolBadge protocol={host.protocol} />
              </div>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {host.listen_address}
                <span className="mx-1">→</span>
                {host.upstreams[0]}{host.upstreams.length > 1 ? ` +${host.upstreams.length - 1}` : ""}
              </p>
              <StatusChip status={getEnabled(host) ? "active" : "inactive"} className="w-fit mt-1" />
              <div className="flex flex-wrap gap-1 mt-1">
                <L4FeatureBadges host={host} />
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
  }, [getEnabled, handleToggleEnabled]);

  return (
    <div className="flex flex-col gap-6 w-full">
      <L4PortsApplyBanner refreshSignal={bannerRefresh} />

      <PageHeader
        title="L4 Proxy Hosts"
        description="Define TCP/UDP stream proxies powered by caddy-l4. Port mappings are applied automatically."
        action={{ label: "Create L4 Host", onClick: () => setCreateOpen(true) }}
      />

      <div className="flex items-center gap-2">
        <SearchField
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search L4 hosts..."
        />
      </div>

      <FolderAccordionTable
        itemsById={itemsById}
        folderState={folderState}
        columns={columns}
        itemLabel={h => h.name}
        itemSubLabel={h => h.listen_address}
        itemIcon={h => (
          <div className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            h.protocol === "tcp"
              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-500"
              : "border-amber-500/30 bg-amber-500/10 text-amber-500",
          ].join(" ")}>
            <Network className="h-3.5 w-3.5" />
          </div>
        )}
        mobileCard={mobileCard}
        emptyMessage={hasFilters ? "No hosts match your filters" : "No L4 proxy hosts"}
        sort={sort}
        onSort={handleSort}
      />

      <CreateL4HostDialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); setTimeout(() => setDuplicateHost(null), 200); signalBannerRefresh(); }}
        initialData={duplicateHost}
        certificates={certificates}
        caCertificates={caCertificates}
      />

      {editHost && (
        <EditL4HostDialog
          open={!!editHost}
          host={editHost}
          onClose={() => { setEditHost(null); signalBannerRefresh(); }}
          certificates={certificates}
          caCertificates={caCertificates}
        />
      )}

      {deleteHost && (
        <DeleteL4HostDialog
          open={!!deleteHost}
          host={deleteHost}
          onClose={() => { setDeleteHost(null); signalBannerRefresh(); }}
        />
      )}
    </div>
  );
}
