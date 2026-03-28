/**
 * WAF handler builder and effective-config resolver for Caddy.
 * Extracted from caddy.ts so these functions can be unit tested.
 */
import { type WafSettings } from "./settings";
import { type WafHostConfig } from "./models/proxy-hosts";

// ---------------------------------------------------------------------------
// Coraza SecLang directive validation
// ---------------------------------------------------------------------------

/**
 * Directives that exist in Apache ModSecurity but are NOT implemented by
 * Coraza's Go SecLang parser.  Pasting these into custom directives causes
 * Caddy to reject the WAF config with a hard 400 error.
 */
const UNSUPPORTED_DIRECTIVES = new Set([
  'sectmpdir',
  'secdatadir',
  'secuploaddir',
  'sectmpsaveuploadedfiles',
  'secunicodemapfile',
  'secauditlogtype',
  'secauditlogrelevant',         // prefix match covers SecAuditLogRelevantStatus
  'secdebuglog',                 // prefix match covers SecDebugLog and SecDebugLogLevel
  'seccookieformat',
  'secargumentseparator',
  'secserversignature',
  'seccomponentSignature',       // note: set is case-insensitive via lowercase match
  'sechashmethodrx',
  'sechashmethodpm',
  'sechashengine',
  'sechashparam',
  'sechashkey',
  'secencryptionkey',
]);

/**
 * Directives that buildWafHandler already emits. Users should not duplicate
 * these in custom directives because the values will conflict or be ignored.
 */
const MANAGED_DIRECTIVES = new Set([
  'secruleengine',
  'secrequestbodyaccess',
  'secrequestbodylimit',
  'secrequestbodynofileslimit',
  'secrequestbodylimitaction',
  'secresponsebodyaccess',
  'secauditengine',
  'secauditlog',
  'secauditlogformat',
  'secauditlogparts',
]);

export type SecLangIssue = {
  line: number;
  directive: string;
  severity: 'error' | 'warning';
  message: string;
};

/**
 * Validates custom SecLang directives and returns an array of issues.
 * - **error**: directive will crash Coraza (unsupported by Go parser)
 * - **warning**: directive duplicates one that the system manages automatically
 *
 * Also flags `Include @coraza.conf-recommended` as an error.
 */
export function validateSecLangDirectives(text: string): SecLangIssue[] {
  if (!text.trim()) return [];
  const issues: SecLangIssue[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;

    // Check for Include @coraza.conf-recommended
    if (/^\s*Include\s+@coraza\.conf-recommended\b/i.test(raw)) {
      issues.push({
        line: i + 1,
        directive: 'Include @coraza.conf-recommended',
        severity: 'error',
        message: 'This file contains directives unsupported by Coraza and will crash Caddy.',
      });
      continue;
    }

    // Extract the directive name (first token on the line)
    const match = raw.match(/^(Sec\w+|Include)\b/i);
    if (!match) continue;
    const directive = match[1];
    const lower = directive.toLowerCase();

    // Check unsupported directives (prefix match for families like SecDebugLog*)
    for (const unsupported of UNSUPPORTED_DIRECTIVES) {
      if (lower === unsupported || lower.startsWith(unsupported)) {
        issues.push({
          line: i + 1,
          directive,
          severity: 'error',
          message: `"${directive}" is not supported by Coraza and will cause Caddy to reject the config.`,
        });
        break;
      }
    }

    // Check managed directives
    if (MANAGED_DIRECTIVES.has(lower)) {
      issues.push({
        line: i + 1,
        directive,
        severity: 'warning',
        message: `"${directive}" is managed automatically. Your value may conflict or be ignored.`,
      });
    }
  }

  return issues;
}

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
      rule_set_ids: host.rule_set_ids,
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
      rule_set_ids: [...new Set([
        ...(global.rule_set_ids ?? []),
        ...(host.rule_set_ids ?? []),
      ])],
    };
  }

  if (host?.enabled) {
    return {
      enabled: true,
      mode: host.mode ?? 'On',
      load_owasp_crs: host.load_owasp_crs ?? false,
      custom_directives: host.custom_directives ?? '',
      excluded_rule_ids: host.excluded_rule_ids,
      rule_set_ids: host.rule_set_ids,
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

  // Split custom directives into pre-CRS and post-CRS groups.
  //
  // SecRule directives (and their comments) are emitted BEFORE CRS includes so
  // that `ctl:ruleEngine=Off` and other per-path bypasses take effect before
  // any CRS rule in the same phase fires.  Without this, CRS phase-1 rules
  // accumulate anomaly scores and the phase-2 blocking evaluation (949110)
  // interrupts the request before the custom ctl ever fires.
  //
  // SecRuleRemoveById directives must come AFTER the CRS Include because they
  // operate on already-loaded rules — placing them before the Include would be
  // a no-op.
  let preCrs = '';
  let postCrs = '';

  if (waf.custom_directives?.trim()) {
    // Strip any lines that would crash Coraza (unsupported directives, bad includes).
    // Warnings (managed directive duplicates) are allowed through — they're harmless.
    const errorLines = new Set(
      validateSecLangDirectives(waf.custom_directives)
        .filter(i => i.severity === 'error')
        .map(i => i.line)
    );
    const sanitized = waf.custom_directives
      .split('\n')
      .filter((_, idx) => !errorLines.has(idx + 1))
      .join('\n')
      .trim();

    if (sanitized) {
      // SecRuleRemoveById → post-CRS; everything else → pre-CRS
      const pre: string[] = [];
      const post: string[] = [];
      for (const line of sanitized.split('\n')) {
        if (/^\s*SecRuleRemoveById\b/i.test(line)) {
          post.push(line);
        } else {
          pre.push(line);
        }
      }
      preCrs = pre.join('\n').trim();
      postCrs = post.join('\n').trim();
    }
  }

  // Emit custom SecRule directives before CRS so ctl actions take priority.
  if (preCrs) parts.push(preCrs);

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

  // SecRuleRemoveById from the UI "Excluded Rule IDs" field
  if (waf.excluded_rule_ids?.length) {
    parts.push(`SecRuleRemoveById ${waf.excluded_rule_ids.join(' ')}`);
  }

  // SecRuleRemoveById from custom directives / rule sets
  if (postCrs) parts.push(postCrs);

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

  const handler: Record<string, unknown> = { handler: 'waf', directives: parts.join('\n') };
  if (waf.load_owasp_crs) handler.load_owasp_crs = true;
  return handler;
}
