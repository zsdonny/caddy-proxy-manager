/**
 * Authentik forward-auth config parser for Caddy.
 * Extracted from caddy.ts so these functions can be unit tested independently.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_AUTHENTIK_HEADERS = [
  "X-Authentik-Username",
  "X-Authentik-Groups",
  "X-Authentik-Entitlements",
  "X-Authentik-Email",
  "X-Authentik-Name",
  "X-Authentik-Uid",
  "X-Authentik-Jwt",
  "X-Authentik-Meta-Jwks",
  "X-Authentik-Meta-Outpost",
  "X-Authentik-Meta-Provider",
  "X-Authentik-Meta-App",
  "X-Authentik-Meta-Version",
];

export const DEFAULT_AUTHENTIK_TRUSTED_PROXIES = ["private_ranges"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProxyHostAuthentikMeta = {
  enabled?: boolean;
  outpost_domain?: string;
  outpost_upstream?: string;
  auth_endpoint?: string;
  copy_headers?: string[];
  trusted_proxies?: string[];
  set_outpost_host_header?: boolean;
  protected_paths?: string[];
  excluded_paths?: string[];
};

export type AuthentikRouteConfig = {
  enabled: boolean;
  outpostDomain: string;
  outpostUpstream: string;
  authEndpoint: string;
  copyHeaders: string[];
  trustedProxies: string[];
  setOutpostHostHeader: boolean;
  protectedPaths: string[] | null;
  excludedPaths: string[] | null;
};

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseAuthentikConfig(meta: ProxyHostAuthentikMeta | undefined | null): AuthentikRouteConfig | null {
  if (!meta || !meta.enabled) {
    return null;
  }

  const outpostDomain = typeof meta.outpost_domain === "string" ? meta.outpost_domain.trim() : "";
  const outpostUpstream = typeof meta.outpost_upstream === "string" ? meta.outpost_upstream.trim() : "";
  if (!outpostDomain || !outpostUpstream) {
    return null;
  }

  const authEndpointRaw = typeof meta.auth_endpoint === "string" ? meta.auth_endpoint.trim() : "";
  const authEndpoint = authEndpointRaw || `/${outpostDomain}/auth/caddy`;

  const copyHeaders =
    Array.isArray(meta.copy_headers) && meta.copy_headers.length > 0
      ? meta.copy_headers.map((header) => header?.trim()).filter((header): header is string => Boolean(header))
      : DEFAULT_AUTHENTIK_HEADERS;

  const trustedProxies =
    Array.isArray(meta.trusted_proxies) && meta.trusted_proxies.length > 0
      ? meta.trusted_proxies.map((item) => item?.trim()).filter((item): item is string => Boolean(item))
      : DEFAULT_AUTHENTIK_TRUSTED_PROXIES;

  const setOutpostHostHeader =
    meta.set_outpost_host_header !== undefined ? Boolean(meta.set_outpost_host_header) : true;

  const protectedPaths = (() => {
    if (!Array.isArray(meta.protected_paths) || meta.protected_paths.length === 0) return null;
    const filtered = meta.protected_paths.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
    return filtered.length > 0 ? filtered : null;
  })();

  const excludedPaths = (() => {
    if (!Array.isArray(meta.excluded_paths) || meta.excluded_paths.length === 0) return null;
    const filtered = meta.excluded_paths.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
    return filtered.length > 0 ? filtered : null;
  })();

  return {
    enabled: true,
    outpostDomain,
    outpostUpstream,
    authEndpoint,
    copyHeaders,
    trustedProxies,
    setOutpostHostHeader,
    protectedPaths,
    excludedPaths,
  };
}
