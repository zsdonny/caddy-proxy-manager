"use client";
/**
 * DEMO ONLY — Storybook story for classic (non-folder) L4 proxy hosts view
 * with 60 mock entries to test live pagination switching.
 *
 * How it works: The real L4ProxyHostsClient calls router.push('?page=N') when
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
import type { L4ProxyHost } from "../../src/lib/models/l4-proxy-hosts";
import L4ProxyHostsClient from "../../app/(dashboard)/l4-proxy-hosts/L4ProxyHostsClient";
import { withDashboardLayout } from "../decorators";

const meta: Meta = {
  title: "Pages/L4 Proxy Hosts/Many Items",
  decorators: [withDashboardLayout],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/l4-proxy-hosts" } },
  },
};

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Generate 60 mock L4 proxy hosts (same logic as L4ProxyHostsFoldersPagination)
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

const PER_PAGE = 25;
const allMockHosts: L4ProxyHost[] = Array.from({ length: 60 }, (_, i) => makeL4Host(i + 1));

// ---------------------------------------------------------------------------
// Stateful wrapper — intercepts router.push to extract the new page number
// and re-render with the correct data slice.
// ---------------------------------------------------------------------------

function L4ProxyHostsPaginationDemo() {
  const [page, setPage] = useState(1);
  const router = useRouter();

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
    <L4ProxyHostsClient
      hosts={hosts}
      pagination={{ total: allMockHosts.length, page, perPage: PER_PAGE }}
      initialSearch=""
      initialSort={{ sortBy: "name", sortDir: "asc" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const SixtyHosts: Story = {
  name: "60 items — live page switching",
  render: () => <L4ProxyHostsPaginationDemo />,
};
