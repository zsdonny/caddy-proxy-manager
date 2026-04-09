"use client";
/**
 * DEMO ONLY — Storybook story for L4 proxy hosts folder view with many entries
 * to test pagination / scroll behaviour.
 */
import React, { useMemo, useState, useCallback, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ArrowRight,
  Lock,
  LockKeyhole,
  Cable,
  Globe,
  Scale,
  Waypoints,
  Pin,
  Network,
  MoreHorizontal,
  ListFilter,
  FolderOpen,
} from "lucide-react";
import type { L4ProxyHost } from "../../src/lib/models/l4-proxy-hosts";
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
import { Card, CardContent } from "../../src/components/ui/card";

// ---------------------------------------------------------------------------
// Generate 60 mock L4 proxy hosts
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

const SERVICE_NAMES = [
  "Game Server", "DNS Forwarder", "Mail Relay", "Database Proxy", "VPN Tunnel",
  "Redis Cache", "MongoDB Proxy", "MySQL Proxy", "PostgreSQL HA", "Kafka Broker",
  "RabbitMQ Proxy", "NATS Relay", "gRPC Gateway", "SSH Bastion", "LDAP Proxy",
  "NTP Relay", "Syslog Collector", "SNMP Trap", "RADIUS Auth", "MQTT Broker",
  "CoAP Gateway", "AMQP Relay", "Memcached Proxy", "Elasticsearch Proxy", "ClickHouse Proxy",
  "InfluxDB Proxy", "TimescaleDB HA", "CockroachDB LB", "ScyllaDB Proxy", "Cassandra Proxy",
  "MinIO Gateway", "S3 Cache", "FTP Relay", "SFTP Bastion", "SIP Proxy",
  "RTSP Relay", "RTP Forwarder", "TURN Server", "STUN Relay", "WireGuard Proxy",
  "OpenVPN Relay", "IPSec Gateway", "ZeroTier Relay", "Tailscale Proxy", "Consul Proxy",
  "etcd Proxy", "ZooKeeper Proxy", "Vault HA", "Nomad Gateway", "Prometheus Proxy",
  "Loki Gateway", "Tempo Proxy", "Mimir Proxy", "Thanos Gateway", "Cortex LB",
  "Envoy Proxy", "HAProxy Mirror", "Traefik Relay", "Nginx Stream", "Keepalived VIP",
];

const PORTS = [
  ":25565", ":5353", ":587", ":5432", ":1194", ":6379", ":27017", ":3306",
  ":5433", ":9092", ":5672", ":4222", ":50051", ":2222", ":389", ":123",
  ":514", ":162", ":1812", ":1883", ":5683", ":5673", ":11211", ":9200",
  ":8123", ":8086", ":5434", ":26257", ":9042", ":9160", ":9000", ":8443",
  ":21", ":2223", ":5060", ":554", ":5004", ":3478", ":3479", ":51820",
  ":1195", ":500", ":9993", ":41641", ":8300", ":2379", ":2181", ":8200",
  ":4646", ":9091", ":3100", ":3200", ":8080", ":10902", ":9009", ":15000",
  ":1936", ":8081", ":12345", ":12346",
];

const UPSTREAM_POOL = [
  "10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.1.10", "10.0.1.11",
  "10.0.2.20", "10.0.2.21", "10.0.3.30", "db-primary", "db-replica-1",
  "cache-1", "cache-2", "broker-1", "broker-2", "proxy-internal",
];

const MATCHER_TYPES: L4ProxyHost["matcher_type"][] = ["none", "tls_sni", "none", "none", "tls_sni", "none"];

function makeL4Host(id: number): L4ProxyHost {
  const idx = (id - 1) % SERVICE_NAMES.length;
  const name = SERVICE_NAMES[idx]
    + (id > SERVICE_NAMES.length ? ` (${Math.ceil(id / SERVICE_NAMES.length)})` : "");
  const port = PORTS[idx % PORTS.length];
  const protocol: "tcp" | "udp" = id % 7 === 0 ? "udp" : "tcp";
  const matcherType = MATCHER_TYPES[id % MATCHER_TYPES.length];
  const upstreamCount = (id % 3) + 1;
  const upstreams = Array.from({ length: upstreamCount }, (_, i) => {
    const host = UPSTREAM_POOL[(id + i) % UPSTREAM_POOL.length];
    const p = port.slice(1);
    return `${host}:${p}`;
  });

  return {
    id,
    name,
    protocol,
    listen_address: port,
    upstreams,
    matcher_type: matcherType,
    matcher_value: matcherType === "tls_sni"
      ? [`${name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}.example.com`]
      : [],
    tls_termination: matcherType === "tls_sni" || id % 4 === 0,
    proxy_protocol_version: id % 8 === 0 ? "v1" : id % 12 === 0 ? "v2" : null,
    proxy_protocol_receive: id % 10 === 0,
    enabled: id % 9 !== 0,
    meta: null,
    load_balancer: upstreamCount > 1
      ? { enabled: true, policy: "round_robin", tryDuration: "30s", tryInterval: "250ms", retries: 3, activeHealthCheck: null, passiveHealthCheck: null }
      : null,
    dns_resolver: id % 6 === 0
      ? { enabled: true, resolvers: ["1.1.1.1:53", "8.8.8.8:53"], fallbacks: [], timeout: "5s" }
      : null,
    upstream_dns_resolution: id % 7 === 0
      ? { enabled: true, family: "ipv4" }
      : null,
    geoblock: id % 11 === 0
      ? { enabled: true, block_countries: ["CN", "RU", "KP"], block_continents: [], block_asns: [], block_cidrs: [], block_ips: [], allow_countries: [], allow_continents: [], allow_asns: [], allow_cidrs: [], allow_ips: [] }
      : null,
    geoblock_mode: "merge",
    upstream_tls: null,
    mtls: null,
    idle_timeout: null,
    certificate_id: null,
    created_at: now,
    updated_at: now,
  };
}

const mockHosts: L4ProxyHost[] = Array.from({ length: 60 }, (_, i) => makeL4Host(i + 1));

// ---------------------------------------------------------------------------
// Feature filter helpers
// ---------------------------------------------------------------------------

const L4_FEATURE_FILTERS = [
  "TLS", "ProxyProto", "GeoBlock", "LB", "DNS", "DNS Pin",
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
  return f;
}

const L4_FILTER_ICONS: Record<L4FeatureKey, React.ReactNode> = {
  "TLS":        <Lock       className="h-3.5 w-3.5 text-cyan-500" />,
  "ProxyProto": <Cable      className="h-3.5 w-3.5 text-muted-foreground" />,
  "GeoBlock":   <Globe      className="h-3.5 w-3.5 text-rose-500" />,
  "LB":         <Scale      className="h-3.5 w-3.5 text-cyan-500" />,
  "DNS":        <Waypoints  className="h-3.5 w-3.5 text-emerald-500" />,
  "DNS Pin":    <Pin        className="h-3.5 w-3.5 text-violet-500" />,
};

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function ProtocolBadge({ protocol }: { protocol: string }) {
  return protocol === "tcp"
    ? <Badge variant="info" className="text-[10px] px-1.5 py-0">{protocol.toUpperCase()}</Badge>
    : <Badge variant="warning" className="text-[10px] px-1.5 py-0">{protocol.toUpperCase()}</Badge>;
}

function L4FeatureBadges({ host }: { host: L4ProxyHost }) {
  const badges: React.ReactNode[] = [];
  if (host.tls_termination)            badges.push(<Badge key="tls" variant="info" className="text-[10px] px-1.5 py-0"><Lock className="h-2.5 w-2.5 mr-0.5" />TLS</Badge>);
  if (host.proxy_protocol_version)      badges.push(<Badge key="pp" variant="muted" className="text-[10px] px-1.5 py-0"><Cable className="h-2.5 w-2.5 mr-0.5" />ProxyProto</Badge>);
  if (host.geoblock?.enabled)           badges.push(<Badge key="geo" variant="outline" className="text-[10px] px-1.5 py-0 border-rose-500/30 bg-rose-500/10 text-rose-600"><Globe className="h-2.5 w-2.5 mr-0.5" />Geo</Badge>);
  if (host.load_balancer?.enabled)      badges.push(<Badge key="lb" variant="info" className="text-[10px] px-1.5 py-0"><Scale className="h-2.5 w-2.5 mr-0.5" />LB</Badge>);
  if (host.dns_resolver?.enabled)       badges.push(<Badge key="dns" variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 bg-emerald-500/10 text-emerald-600"><Waypoints className="h-2.5 w-2.5 mr-0.5" />DNS</Badge>);
  if (host.upstream_dns_resolution?.enabled) badges.push(<Badge key="dnspin" variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500/30 bg-violet-500/10 text-violet-600"><Pin className="h-2.5 w-2.5 mr-0.5" />DNS Pin</Badge>);
  if (badges.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return <div className="flex flex-wrap gap-1">{badges}</div>;
}

// ---------------------------------------------------------------------------
// Initial folder layout — 60 items spread across 6 folders + ungrouped
// ---------------------------------------------------------------------------

const INITIAL_FOLDERS = [
  { name: "Database Layer",    itemIds: ["3", "4", "7", "8", "9", "23", "24", "25", "29", "30"] },
  { name: "Network Services",  itemIds: ["2", "15", "16", "17", "18", "36", "37", "38", "39"] },
  { name: "Message Queues",    itemIds: ["10", "11", "12", "20", "22"] },
  { name: "Security / VPN",    itemIds: ["5", "19", "40", "41", "42", "43", "44"] },
  { name: "Observability",     itemIds: ["50", "51", "52", "53", "54", "55"] },
  { name: "Deprecated",        itemIds: ["6", "33", "34", "45", "59", "60"] },
];

const assignedIds = new Set(INITIAL_FOLDERS.flatMap(f => f.itemIds));
const INITIAL_UNGROUPED = mockHosts.map(h => String(h.id)).filter(id => !assignedIds.has(id));

// ---------------------------------------------------------------------------
// Story wrapper
// ---------------------------------------------------------------------------

function L4FolderPaginationDemo({
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
  const [featureFilters, setFeatureFilters] = useState<Set<L4FeatureKey>>(new Set());
  const [sort, setSort] = useState<SortState>(null);

  const getEnabled = useCallback(
    (host: L4ProxyHost) => enabledOverrides.has(host.id) ? enabledOverrides.get(host.id)! : host.enabled,
    [enabledOverrides]
  );

  const handleToggle = useCallback((id: number, val: boolean) => {
    setEnabledOverrides(prev => new Map(prev).set(id, val));
  }, []);

  const toggleFeatureFilter = useCallback((key: L4FeatureKey) => {
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
  const folderState = useFolderState<L4ProxyHost>(
    { folders: initialFolders, ungrouped: initialUngrouped },
    allItemIds,
  );

  const folderStateRef = useRef(folderState);
  folderStateRef.current = folderState;

  const mobileCard = useCallback((host: L4ProxyHost, dragHandle?: React.ReactNode) => {
    const currentFolderId = folderStateRef.current.folders.find(f => f.itemIds.includes(String(host.id)))?.id ?? null;
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
                <span className="mx-1 text-muted-foreground">→</span>
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
        h.listen_address.toLowerCase().includes(q) ||
        h.matcher_value.some(v => v.toLowerCase().includes(q))
      );
    }
    if (featureFilters.size > 0) {
      entries = entries.filter(([, h]) => {
        const features = getL4HostFeatures(h);
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
      label: "Name / Protocol",
      className: "flex-1 min-w-[180px] flex items-center gap-3 py-2 pr-3 overflow-hidden",
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
            {host.matcher_type === "tls_sni" && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                SNI: {host.matcher_value.join(", ")}
              </p>
            )}
          </div>
        </>
      ),
    },
    {
      id: "protocol",
      label: "Protocol",
      className: "w-24 shrink-0 flex items-center py-2 pr-3",
      sortFn: host => host.protocol,
      render: host => <ProtocolBadge protocol={host.protocol} />,
    },
    {
      id: "listen",
      label: "Listen",
      className: "w-32 shrink-0 flex items-center py-2 pr-3 overflow-hidden",
      sortFn: host => host.listen_address,
      render: host => (
        <span className="text-xs font-mono text-muted-foreground truncate">{host.listen_address}</span>
      ),
    },
    {
      id: "upstreams",
      label: "Upstreams",
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
        title="L4 Proxy Hosts"
        description={`${mockHosts.length} TCP/UDP stream proxies — pagination / scroll stress test.`}
        action={{ label: "Create Host", onClick: () => {} }}
      />

      <FolderAccordionTable
        itemsById={itemsById}
        folderState={folderState}
        columns={columns}
        toolbar={<SearchField value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search L4 hosts..." />}
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
        emptyMessage={searchTerm || featureFilters.size > 0 ? "No hosts match your filters" : "No L4 proxy hosts"}
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
  title: "Pages/L4 Proxy Hosts (Folders)/Many Items",
  decorators: [withDashboardLayout],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/l4-proxy-hosts" } },
  },
};

export default meta;
type Story = StoryObj;

export const SixtyItemsWithFolders: Story = {
  name: "60 items — 6 folders",
  render: () => (
    <L4FolderPaginationDemo
      initialFolders={INITIAL_FOLDERS}
      initialUngrouped={INITIAL_UNGROUPED}
    />
  ),
};

export const SixtyItemsCollapsed: Story = {
  name: "60 items — folders collapsed",
  render: () => (
    <L4FolderPaginationDemo
      initialFolders={INITIAL_FOLDERS}
      initialUngrouped={INITIAL_UNGROUPED}
      collapseAll
    />
  ),
};

export const SixtyItemsFlat: Story = {
  name: "60 items — flat (no folders)",
  render: () => (
    <L4FolderPaginationDemo
      initialFolders={[]}
      initialUngrouped={mockHosts.map(h => String(h.id))}
    />
  ),
};

export const SixtyItemsAllInOneFolder: Story = {
  name: "60 items — single folder",
  render: () => (
    <L4FolderPaginationDemo
      initialFolders={[{ name: "All Streams", itemIds: mockHosts.map(h => String(h.id)) }]}
      initialUngrouped={[]}
    />
  ),
};
