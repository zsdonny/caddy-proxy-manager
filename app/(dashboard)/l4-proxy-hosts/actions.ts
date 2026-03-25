"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/src/lib/auth";
import { actionError, actionSuccess, INITIAL_ACTION_STATE, type ActionState } from "@/src/lib/actions";
import { applyCaddyConfig } from "@/src/lib/caddy";
import {
  createL4ProxyHost,
  deleteL4ProxyHost,
  updateL4ProxyHost,
  type L4ProxyHostInput,
  type L4Protocol,
  type L4MatcherType,
  type L4ProxyProtocolVersion,
  type L4LoadBalancingPolicy,
  type L4LoadBalancerConfig,
  type L4DnsResolverConfig,
  type L4UpstreamDnsResolutionConfig,
  type L4GeoBlockConfig,
  type L4GeoBlockMode,
  type L4UpstreamTlsConfig,
  type L4UpstreamTlsRenegotiation,
  type L4MtlsConfig,
} from "@/src/lib/models/l4-proxy-hosts";
import { parseCheckbox, parseCsv, parseUpstreams, parseOptionalText, parseOptionalNumber } from "@/src/lib/form-parse";

const VALID_PROTOCOLS: L4Protocol[] = ["tcp", "udp"];
const VALID_MATCHER_TYPES: L4MatcherType[] = ["none", "tls_sni", "http_host", "proxy_protocol", "remote_ip"];
const VALID_PP_VERSIONS: L4ProxyProtocolVersion[] = ["v1", "v2"];
const VALID_L4_LB_POLICIES: L4LoadBalancingPolicy[] = ["random", "round_robin", "least_conn", "ip_hash", "first"];
const VALID_DNS_FAMILIES = ["ipv6", "ipv4", "both"] as const;
const VALID_RENEGOTIATION: L4UpstreamTlsRenegotiation[] = ["never", "once", "freely"];

function parseL4LoadBalancerConfig(formData: FormData): Partial<L4LoadBalancerConfig> | undefined {
  if (!formData.has("lb_present")) return undefined;
  const enabled = formData.has("lb_enabled_present")
    ? parseCheckbox(formData.get("lb_enabled"))
    : undefined;
  const policyRaw = parseOptionalText(formData.get("lb_policy"));
  const policy = policyRaw && VALID_L4_LB_POLICIES.includes(policyRaw as L4LoadBalancingPolicy)
    ? (policyRaw as L4LoadBalancingPolicy) : undefined;

  const result: Partial<L4LoadBalancerConfig> = {};
  if (enabled !== undefined) result.enabled = enabled;
  if (policy) result.policy = policy;
  const tryDuration = parseOptionalText(formData.get("lb_try_duration"));
  if (tryDuration !== null) result.tryDuration = tryDuration;
  const tryInterval = parseOptionalText(formData.get("lb_try_interval"));
  if (tryInterval !== null) result.tryInterval = tryInterval;
  const retries = parseOptionalNumber(formData.get("lb_retries"));
  if (retries !== null) result.retries = retries;

  // Active health check
  if (formData.has("lb_active_health_enabled_present")) {
    result.activeHealthCheck = {
      enabled: parseCheckbox(formData.get("lb_active_health_enabled")),
      port: parseOptionalNumber(formData.get("lb_active_health_port")),
      interval: parseOptionalText(formData.get("lb_active_health_interval")),
      timeout: parseOptionalText(formData.get("lb_active_health_timeout")),
    };
  }

  // Passive health check
  if (formData.has("lb_passive_health_enabled_present")) {
    result.passiveHealthCheck = {
      enabled: parseCheckbox(formData.get("lb_passive_health_enabled")),
      failDuration: parseOptionalText(formData.get("lb_passive_health_fail_duration")),
      maxFails: parseOptionalNumber(formData.get("lb_passive_health_max_fails")),
      unhealthyLatency: parseOptionalText(formData.get("lb_passive_health_unhealthy_latency")),
    };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function parseL4DnsResolverConfig(formData: FormData): Partial<L4DnsResolverConfig> | undefined {
  if (!formData.has("dns_present")) return undefined;
  const enabled = formData.has("dns_enabled_present")
    ? parseCheckbox(formData.get("dns_enabled"))
    : undefined;
  const resolversRaw = parseOptionalText(formData.get("dns_resolvers"));
  const resolvers = resolversRaw
    ? resolversRaw.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
    : undefined;
  const fallbacksRaw = parseOptionalText(formData.get("dns_fallbacks"));
  const fallbacks = fallbacksRaw
    ? fallbacksRaw.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
    : undefined;
  const timeout = parseOptionalText(formData.get("dns_timeout"));

  const result: Partial<L4DnsResolverConfig> = {};
  if (enabled !== undefined) result.enabled = enabled;
  if (resolvers) result.resolvers = resolvers;
  if (fallbacks) result.fallbacks = fallbacks;
  if (timeout !== null) result.timeout = timeout;

  return Object.keys(result).length > 0 ? result : undefined;
}

function parseL4UpstreamDnsResolutionConfig(formData: FormData): Partial<L4UpstreamDnsResolutionConfig> | undefined {
  if (!formData.has("upstream_dns_resolution_present")) return undefined;
  const modeRaw = parseOptionalText(formData.get("upstream_dns_resolution_mode")) ?? "inherit";
  const familyRaw = parseOptionalText(formData.get("upstream_dns_resolution_family")) ?? "inherit";

  const result: Partial<L4UpstreamDnsResolutionConfig> = {};
  if (modeRaw === "enabled") result.enabled = true;
  else if (modeRaw === "disabled") result.enabled = false;
  else if (modeRaw === "inherit") result.enabled = null;

  if (familyRaw === "inherit") result.family = null;
  else if (VALID_DNS_FAMILIES.includes(familyRaw as typeof VALID_DNS_FAMILIES[number])) {
    result.family = familyRaw as "ipv6" | "ipv4" | "both";
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function parseL4GeoBlockConfig(formData: FormData): { geoblock: L4GeoBlockConfig | null; geoblock_mode: L4GeoBlockMode } {
  if (!formData.has("geoblock_present")) {
    return { geoblock: null, geoblock_mode: "merge" };
  }
  const enabled = parseCheckbox(formData.get("geoblock_enabled"));
  const rawMode = formData.get("geoblock_mode");
  const mode: L4GeoBlockMode = rawMode === "override" ? "override" : "merge";

  const parseStringList = (key: string): string[] => {
    const val = formData.get(key);
    if (!val || typeof val !== "string") return [];
    return val.split(",").map(s => s.trim()).filter(Boolean);
  };
  const parseNumberList = (key: string): number[] => {
    return parseStringList(key).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
  };

  const config: L4GeoBlockConfig = {
    enabled,
    block_countries: parseStringList("geoblock_block_countries"),
    block_continents: parseStringList("geoblock_block_continents"),
    block_asns: parseNumberList("geoblock_block_asns"),
    block_cidrs: parseStringList("geoblock_block_cidrs"),
    block_ips: parseStringList("geoblock_block_ips"),
    allow_countries: parseStringList("geoblock_allow_countries"),
    allow_continents: parseStringList("geoblock_allow_continents"),
    allow_asns: parseNumberList("geoblock_allow_asns"),
    allow_cidrs: parseStringList("geoblock_allow_cidrs"),
    allow_ips: parseStringList("geoblock_allow_ips"),
  };
  return { geoblock: config, geoblock_mode: mode };
}

function parseProtocol(formData: FormData): L4Protocol {
  const raw = String(formData.get("protocol") ?? "tcp").trim().toLowerCase();
  if (VALID_PROTOCOLS.includes(raw as L4Protocol)) return raw as L4Protocol;
  return "tcp";
}

function parseMatcherType(formData: FormData): L4MatcherType {
  const raw = String(formData.get("matcher_type") ?? "none").trim();
  if (VALID_MATCHER_TYPES.includes(raw as L4MatcherType)) return raw as L4MatcherType;
  return "none";
}

function parseProxyProtocolVersion(formData: FormData): L4ProxyProtocolVersion | null {
  const raw = parseOptionalText(formData.get("proxy_protocol_version"));
  if (raw && VALID_PP_VERSIONS.includes(raw as L4ProxyProtocolVersion)) return raw as L4ProxyProtocolVersion;
  return null;
}

function parseL4UpstreamTlsConfig(formData: FormData): Partial<L4UpstreamTlsConfig> | undefined {
  if (!formData.has("upstream_tls_present")) return undefined;
  const enabled = parseCheckbox(formData.get("upstream_tls_enabled"));
  const insecure_skip_verify = parseCheckbox(formData.get("upstream_tls_insecure_skip_verify"));
  const server_name = parseOptionalText(formData.get("upstream_tls_server_name"));
  const rootCaRaw = parseOptionalText(formData.get("upstream_tls_root_ca_pem_files"));
  const root_ca_pem_files = rootCaRaw
    ? rootCaRaw.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
    : [];
  const client_certificate_file = parseOptionalText(formData.get("upstream_tls_client_cert_file"));
  const client_certificate_key_file = parseOptionalText(formData.get("upstream_tls_client_key_file"));
  const renegotiationRaw = parseOptionalText(formData.get("upstream_tls_renegotiation"));
  const renegotiation: L4UpstreamTlsRenegotiation = renegotiationRaw && VALID_RENEGOTIATION.includes(renegotiationRaw as L4UpstreamTlsRenegotiation)
    ? (renegotiationRaw as L4UpstreamTlsRenegotiation) : "never";

  return {
    enabled,
    insecure_skip_verify,
    server_name,
    root_ca_pem_files,
    client_certificate_file,
    client_certificate_key_file,
    renegotiation,
  };
}

function parseL4MtlsConfig(formData: FormData): L4MtlsConfig | undefined {
  if (!formData.has("mtls_present")) return undefined;
  const enabled = formData.get("mtls_enabled") === "true";
  const ids = formData.getAll("mtls_ca_cert_id").map(Number).filter(n => Number.isFinite(n) && n > 0);
  return { enabled, ca_certificate_ids: ids };
}

export async function createL4ProxyHostAction(
  _prevState: ActionState = INITIAL_ACTION_STATE,
  formData: FormData
): Promise<ActionState> {
  void _prevState;
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);

    const matcherType = parseMatcherType(formData);
    const matcherValue = (matcherType === "tls_sni" || matcherType === "http_host" || matcherType === "remote_ip")
      ? parseCsv(formData.get("matcher_value"))
      : [];

    const idleTimeout = parseOptionalText(formData.get("idle_timeout"));
    const certificateIdRaw = parseOptionalText(formData.get("certificate_id"));
    const certificateId = certificateIdRaw && certificateIdRaw !== "__none__" ? parseInt(certificateIdRaw, 10) : null;

    // TLS termination without SNI requires an explicit certificate
    const tlsTermination = parseCheckbox(formData.get("tls_termination"));
    if (tlsTermination && matcherType !== "tls_sni" && !certificateId) {
      return actionError(null, "TLS termination without SNI matching requires a specific certificate. Select a certificate or switch the matcher to TLS SNI.");
    }

    const input: L4ProxyHostInput = {
      name: String(formData.get("name") ?? "Untitled"),
      protocol: parseProtocol(formData),
      listen_address: String(formData.get("listen_address") ?? "").trim(),
      upstreams: parseUpstreams(formData.get("upstreams")),
      matcher_type: matcherType,
      matcher_value: matcherValue,
      tls_termination: tlsTermination,
      proxy_protocol_version: parseProxyProtocolVersion(formData),
      proxy_protocol_receive: parseCheckbox(formData.get("proxy_protocol_receive")),
      enabled: parseCheckbox(formData.get("enabled")),
      load_balancer: parseL4LoadBalancerConfig(formData),
      dns_resolver: parseL4DnsResolverConfig(formData),
      upstream_dns_resolution: parseL4UpstreamDnsResolutionConfig(formData),
      upstream_tls: parseL4UpstreamTlsConfig(formData),
      mtls: parseL4MtlsConfig(formData),
      idle_timeout: idleTimeout,
      certificate_id: certificateId,
      ...parseL4GeoBlockConfig(formData),
    };

    await createL4ProxyHost(input, userId);
    revalidatePath("/l4-proxy-hosts");
    after(() => applyCaddyConfig().catch((e) => console.error("[l4-actions] Caddy apply failed:", e)));
    return actionSuccess("L4 proxy host created and queued for Caddy reload.");
  } catch (error) {
    console.error("Failed to create L4 proxy host:", error);
    return actionError(error, "Failed to create L4 proxy host.");
  }
}

export async function updateL4ProxyHostAction(
  id: number,
  _prevState: ActionState = INITIAL_ACTION_STATE,
  formData: FormData
): Promise<ActionState> {
  void _prevState;
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);

    const matcherType = parseMatcherType(formData);
    const matcherValue = (matcherType === "tls_sni" || matcherType === "http_host" || matcherType === "remote_ip")
      ? parseCsv(formData.get("matcher_value"))
      : [];

    const idleTimeout = parseOptionalText(formData.get("idle_timeout"));
    const certificateIdRaw = parseOptionalText(formData.get("certificate_id"));
    const certificateId = certificateIdRaw && certificateIdRaw !== "__none__" ? parseInt(certificateIdRaw, 10) : null;

    // TLS termination without SNI requires an explicit certificate
    const tlsTermination = parseCheckbox(formData.get("tls_termination"));
    if (tlsTermination && matcherType !== "tls_sni" && !certificateId) {
      return actionError(null, "TLS termination without SNI matching requires a specific certificate. Select a certificate or switch the matcher to TLS SNI.");
    }

    const input: Partial<L4ProxyHostInput> = {
      name: formData.get("name") ? String(formData.get("name")) : undefined,
      protocol: parseProtocol(formData),
      listen_address: formData.get("listen_address") ? String(formData.get("listen_address")).trim() : undefined,
      upstreams: formData.get("upstreams") ? parseUpstreams(formData.get("upstreams")) : undefined,
      matcher_type: matcherType,
      matcher_value: matcherValue,
      tls_termination: tlsTermination,
      proxy_protocol_version: parseProxyProtocolVersion(formData),
      proxy_protocol_receive: parseCheckbox(formData.get("proxy_protocol_receive")),
      enabled: formData.has("enabled_present") ? parseCheckbox(formData.get("enabled")) : undefined,
      load_balancer: parseL4LoadBalancerConfig(formData),
      dns_resolver: parseL4DnsResolverConfig(formData),
      upstream_dns_resolution: parseL4UpstreamDnsResolutionConfig(formData),
      upstream_tls: parseL4UpstreamTlsConfig(formData),
      mtls: parseL4MtlsConfig(formData),
      idle_timeout: idleTimeout,
      certificate_id: certificateId,
      ...parseL4GeoBlockConfig(formData),
    };

    await updateL4ProxyHost(id, input, userId);
    revalidatePath("/l4-proxy-hosts");
    after(() => applyCaddyConfig().catch((e) => console.error("[l4-actions] Caddy apply failed:", e)));
    return actionSuccess("L4 proxy host updated.");
  } catch (error) {
    console.error(`Failed to update L4 proxy host ${id}:`, error);
    return actionError(error, "Failed to update L4 proxy host.");
  }
}

export async function deleteL4ProxyHostAction(
  id: number,
  _prevState: ActionState = INITIAL_ACTION_STATE
): Promise<ActionState> {
  void _prevState;
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);
    await deleteL4ProxyHost(id, userId);
    revalidatePath("/l4-proxy-hosts");
    after(() => applyCaddyConfig().catch((e) => console.error("[l4-actions] Caddy apply failed:", e)));
    return actionSuccess("L4 proxy host deleted.");
  } catch (error) {
    console.error(`Failed to delete L4 proxy host ${id}:`, error);
    return actionError(error, "Failed to delete L4 proxy host.");
  }
}

export async function toggleL4ProxyHostAction(
  id: number,
  enabled: boolean
): Promise<ActionState> {
  try {
    const session = await requireAdmin();
    const userId = Number(session.user.id);
    await updateL4ProxyHost(id, { enabled }, userId);
    revalidatePath("/l4-proxy-hosts");
    after(() => applyCaddyConfig().catch((e) => console.error("[l4-actions] Caddy apply failed:", e)));
    return actionSuccess(`L4 proxy host ${enabled ? "enabled" : "disabled"}.`);
  } catch (error) {
    console.error(`Failed to toggle L4 proxy host ${id}:`, error);
    return actionError(error, "Failed to toggle L4 proxy host.");
  }
}
