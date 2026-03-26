/**
 * WAF handler builder and effective-config resolver for Caddy.
 * Extracted from caddy.ts so these functions can be unit tested.
 */
import { type WafSettings } from "./settings";
import { type WafHostConfig } from "./models/proxy-hosts";

/**
 * Resolves the effective WAF settings for a proxy host by merging or overriding
 * the global WAF settings with the per-host WAF config.
 *
 * Semantics:
 *  - host = null/undefined          → global settings apply as-is
 *  - host.enabled === false          → explicit opt-out; no WAF regardless of global
 *  - host.waf_mode === "override"    → use host config entirely, ignore global
 *  - host.waf_mode === "merge" (default) → merge host settings on top of global
 */
export function resolveEffectiveWaf(
  global: WafSettings | null,
  host: WafHostConfig | null | undefined
): WafSettings | null {
  const hostEnabled = host?.enabled;
  const globalEnabled = global?.enabled;

  if (!hostEnabled && !globalEnabled) return null;

  // Override mode: use host config entirely
  if (host && host.waf_mode === "override") {
    if (!hostEnabled) return null;
    return {
      enabled: true,
      mode: host.mode ?? 'On',
      load_owasp_crs: host.load_owasp_crs ?? false,
      custom_directives: host.custom_directives ?? '',
      excluded_rule_ids: host.excluded_rule_ids,
    };
  }

  // Merge mode: start with global, overlay host fields.
  // host.enabled === false is an explicit opt-out — respect it even when global is on.
  if (host && global) {
    if (host.enabled === false) return null;
    return {
      enabled: true,
      mode: host.mode ?? global.mode,
      load_owasp_crs: host.load_owasp_crs ?? global.load_owasp_crs,
      custom_directives: [global.custom_directives, host.custom_directives].filter(Boolean).join('\n'),
      excluded_rule_ids: [
        ...(global.excluded_rule_ids ?? []),
        ...(host.excluded_rule_ids ?? []),
      ],
    };
  }

  if (host?.enabled) {
    return {
      enabled: true,
      mode: host.mode ?? 'On',
      load_owasp_crs: host.load_owasp_crs ?? false,
      custom_directives: host.custom_directives ?? '',
      excluded_rule_ids: host.excluded_rule_ids,
    };
  }
  if (global?.enabled) return global;
  return null;
}

/**
 * Builds the Caddy `waf` handler object for the given WAF settings.
 *
 * All engine/body/audit directives are emitted inline rather than relying on the
 * embedded `@coraza.conf-recommended` file, which contains directives Coraza's Go
 * SecLang parser does not implement (SecTmpSaveUploadedFiles, SecUploadDir).
 * The CRS setup and rules are still loaded from the embedded filesystem when
 * `load_owasp_crs` is true — only the recommended config is replaced.
 *
 * @param allowWebsocket - When true, a SecLang rule is prepended that bypasses
 *   WAF inspection for the initial HTTP upgrade request (Upgrade: websocket).
 *   After the protocol switch the connection becomes a WebSocket tunnel that the
 *   WAF cannot inspect anyway, but without this bypass the WAF may silently drop
 *   the upgrade handshake: the block happens before SecAuditEngine captures it,
 *   producing no log entry and an unexplained connection failure.
 */
export function buildWafHandler(waf: WafSettings, allowWebsocket = false): Record<string, unknown> {
  const parts: string[] = [];

  if (allowWebsocket) {
    // WebSocket upgrade is an HTTP GET with Upgrade: websocket.  The WAF sits
    // first in the handler chain and would process this request.  After the
    // 101 Switching Protocols response the connection becomes a raw WebSocket
    // tunnel — the WAF never sees subsequent frames.  Turning the rule engine
    // off for the upgrade request prevents silent drops while having zero
    // impact on normal HTTP traffic through the same host.
    parts.push(
      'SecRule REQUEST_HEADERS:Upgrade "@rx (?i)^websocket$" ' +
      '"id:9900,phase:1,pass,nolog,noauditlog,ctl:ruleEngine=off"'
    );
  }

  // Engine and body inspection directives — emitted BEFORE CRS includes so the
  // rule engine is configured before any rules are evaluated.
  parts.push(
    `SecRuleEngine ${waf.mode}`,
    // Enable request body inspection so rules can match POST/PUT payloads (SQLi, XSS in forms).
    'SecRequestBodyAccess On',
    'SecRequestBodyLimit 13107200',         // 12.5 MB
    'SecRequestBodyNoFilesLimit 131072',    // 128 KB
    'SecRequestBodyLimitAction Reject',
    'SecResponseBodyAccess Off',
  );

  if (waf.load_owasp_crs) {
    // @-prefixed paths resolve from the embedded coraza-coreruleset filesystem,
    // which is only mounted when load_owasp_crs is true.
    //
    // NOTE: We intentionally skip `Include @coraza.conf-recommended`.  That file
    // contains directives Coraza's Go SecLang parser does not implement (e.g.
    // SecTmpSaveUploadedFiles, SecUploadDir) which cause a hard 400 error on
    // config load.  All useful directives from that file are emitted inline above
    // and below (SecRuleEngine, SecRequestBodyAccess/Limit, SecAuditEngine, etc.).
    parts.push(
      'Include @crs-setup.conf.example',
      'Include @owasp_crs/*.conf',
    );
  }

  if (waf.excluded_rule_ids?.length) {
    parts.push(`SecRuleRemoveById ${waf.excluded_rule_ids.join(' ')}`);
  }

  parts.push(
    // RelevantOnly logs transactions where a rule fired with the auditlog action (which all OWASP
    // CRS rules include via SecDefaultAction), covering both blocked and DetectionOnly hits.
    // Clean requests with no rule matches are silently skipped, avoiding massive log growth.
    'SecAuditEngine RelevantOnly',
    'SecAuditLog /logs/waf-audit.log',
    'SecAuditLogFormat JSON',
    // Omit request/response bodies (parts I, J, E) and intermediate response headers (D)
    // to prevent logging multi-MB payloads. Headers (B, F) and rule match trailer (H) are kept.
    'SecAuditLogParts ABFHZ',
  );

  if (waf.custom_directives?.trim()) {
    // Strip Include @coraza.conf-recommended — that file contains directives
    // Coraza's Go parser does not implement (SecTmpSaveUploadedFiles, etc.)
    // and may be present in the DB from older versions.
    const sanitized = waf.custom_directives
      .split('\n')
      .filter(l => !/^\s*Include\s+@coraza\.conf-recommended\b/i.test(l))
      .join('\n')
      .trim();
    if (sanitized) parts.push(sanitized);
  }

  const handler: Record<string, unknown> = { handler: 'waf', directives: parts.join('\n') };
  if (waf.load_owasp_crs) handler.load_owasp_crs = true;
  return handler;
}
