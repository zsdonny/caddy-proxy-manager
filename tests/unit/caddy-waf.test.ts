/**
 * Unit tests for src/lib/caddy-waf.ts
 *
 * Key regression: when WAF is enabled but OWASP CRS is NOT loaded,
 * the generated directives must NOT contain any @-prefixed Include paths
 * (e.g. @coraza.conf-recommended).  Those paths only resolve from the
 * embedded coraza-coreruleset filesystem which is mounted by the Caddy
 * plugin only when load_owasp_crs=true.  Including them without the
 * filesystem causes:
 *   "failed to readfile: open @coraza.conf-recommended: no such file or directory"
 */
import { describe, it, expect } from 'vitest';
import { buildWafHandler, resolveEffectiveWaf, validateSecLangDirectives } from '../../src/lib/caddy-waf';

const baseWaf = {
  enabled: true,
  mode: 'On' as const,
  load_owasp_crs: false,
  custom_directives: '',
};

// ---------------------------------------------------------------------------
// Regression: @-prefixed paths must not appear without load_owasp_crs
// ---------------------------------------------------------------------------

describe('buildWafHandler — without OWASP CRS', () => {
  it('does NOT include @coraza.conf-recommended when load_owasp_crs is false', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: false });
    expect(handler.directives).not.toContain('@coraza.conf-recommended');
  });

  it('does NOT include any @-prefixed Include when load_owasp_crs is false', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: false });
    // Guard against any future @-prefixed file references leaking in
    expect(handler.directives).not.toMatch(/Include @/);
  });

  it('does NOT set load_owasp_crs field on handler when disabled', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: false });
    expect(handler.load_owasp_crs).toBeUndefined();
  });

  it('still emits SecRuleEngine directive', () => {
    const handler = buildWafHandler({ ...baseWaf, mode: 'On', load_owasp_crs: false });
    expect(handler.directives).toContain('SecRuleEngine On');
  });

  it('still emits SecRuleEngine Off in DetectionOnly-like mode', () => {
    const handler = buildWafHandler({ ...baseWaf, mode: 'Off', load_owasp_crs: false });
    expect(handler.directives).toContain('SecRuleEngine Off');
  });

  it('includes custom directives when provided', () => {
    const directive = 'SecRule REQUEST_HEADERS:User-Agent "@contains leakix.net" "id:9002,phase:1,deny,status:403,log"';
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: false, custom_directives: directive });
    expect(handler.directives).toContain(directive);
  });

  it('does not append empty/whitespace-only custom_directives', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: false, custom_directives: '   ' });
    // The directives string should end with the last standard directive
    expect((handler.directives as string).trimEnd()).not.toMatch(/\s+$/);
  });

  it('strips Include @coraza.conf-recommended from custom_directives', () => {
    const custom = 'Include @coraza.conf-recommended\nSecRule REMOTE_ADDR "@ipMatch 1.2.3.4" "id:9000,phase:1,allow,nolog"';
    const handler = buildWafHandler({ ...baseWaf, custom_directives: custom });
    expect(handler.directives).not.toContain('@coraza.conf-recommended');
    expect(handler.directives).toContain('@ipMatch 1.2.3.4');
  });

  it('strips Include @coraza.conf-recommended even with leading whitespace', () => {
    const handler = buildWafHandler({ ...baseWaf, custom_directives: '  Include @coraza.conf-recommended  ' });
    expect(handler.directives).not.toContain('@coraza.conf-recommended');
  });
});

// ---------------------------------------------------------------------------
// With OWASP CRS enabled
// ---------------------------------------------------------------------------

describe('buildWafHandler — with OWASP CRS', () => {
  it('does NOT include @coraza.conf-recommended (uses inline directives instead)', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: true });
    expect(handler.directives).not.toContain('@coraza.conf-recommended');
  });

  it('includes @crs-setup.conf.example when load_owasp_crs is true', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: true });
    expect(handler.directives).toContain('Include @crs-setup.conf.example');
  });

  it('includes @owasp_crs/*.conf when load_owasp_crs is true', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: true });
    expect(handler.directives).toContain('Include @owasp_crs/*.conf');
  });

  it('sets load_owasp_crs=true on the handler object', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: true });
    expect(handler.load_owasp_crs).toBe(true);
  });

  it('engine directives appear BEFORE CRS includes', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: true });
    const directives = handler.directives as string;
    const enginePos = directives.indexOf('SecRuleEngine');
    const crsPos = directives.indexOf('@owasp_crs');
    expect(enginePos).toBeLessThan(crsPos);
  });
});

// ---------------------------------------------------------------------------
// Excluded rule IDs
// ---------------------------------------------------------------------------

describe('buildWafHandler — excluded_rule_ids', () => {
  it('emits SecRuleRemoveById with single ID', () => {
    const handler = buildWafHandler({ ...baseWaf, excluded_rule_ids: [941100] });
    expect(handler.directives).toContain('SecRuleRemoveById 941100');
  });

  it('emits SecRuleRemoveById with multiple IDs space-separated', () => {
    const handler = buildWafHandler({ ...baseWaf, excluded_rule_ids: [941100, 942200, 943300] });
    expect(handler.directives).toContain('SecRuleRemoveById 941100 942200 943300');
  });

  it('omits SecRuleRemoveById when excluded_rule_ids is empty', () => {
    const handler = buildWafHandler({ ...baseWaf, excluded_rule_ids: [] });
    expect(handler.directives).not.toContain('SecRuleRemoveById');
  });

  it('omits SecRuleRemoveById when excluded_rule_ids is undefined', () => {
    const handler = buildWafHandler({ ...baseWaf });
    expect(handler.directives).not.toContain('SecRuleRemoveById');
  });
});

// ---------------------------------------------------------------------------
// Handler structure
// ---------------------------------------------------------------------------

describe('buildWafHandler — handler structure', () => {
  it('always sets handler="waf"', () => {
    expect(buildWafHandler(baseWaf).handler).toBe('waf');
  });

  it('directives is a non-empty string', () => {
    const handler = buildWafHandler(baseWaf);
    expect(typeof handler.directives).toBe('string');
    expect((handler.directives as string).length).toBeGreaterThan(0);
  });

  it('always includes audit log directives', () => {
    const handler = buildWafHandler(baseWaf);
    expect(handler.directives).toContain('SecAuditEngine RelevantOnly');
    expect(handler.directives).toContain('SecAuditLog /logs/waf-audit.log');
    expect(handler.directives).toContain('SecAuditLogFormat JSON');
  });

  it('always enables request body inspection with sensible limits', () => {
    const handler = buildWafHandler(baseWaf);
    expect(handler.directives).toContain('SecRequestBodyAccess On');
    expect(handler.directives).toContain('SecRequestBodyLimit 13107200');
    expect(handler.directives).toContain('SecRequestBodyNoFilesLimit 131072');
    expect(handler.directives).toContain('SecRequestBodyLimitAction Reject');
  });

  it('emits request body directives even when OWASP CRS is loaded', () => {
    const handler = buildWafHandler({ ...baseWaf, load_owasp_crs: true });
    expect(handler.directives).toContain('SecRequestBodyAccess On');
    expect(handler.directives).toContain('SecRequestBodyLimit 13107200');
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveWaf
// ---------------------------------------------------------------------------

const globalWaf = {
  enabled: true,
  mode: 'On' as const,
  load_owasp_crs: false,
  custom_directives: 'SecRule REQUEST_HEADERS:User-Agent "@contains leakix.net" "id:9002,phase:1,deny,status:403,log"',
};

describe('resolveEffectiveWaf — no per-host config', () => {
  it('returns null when both global and host are null', () => {
    expect(resolveEffectiveWaf(null, null)).toBeNull();
  });

  it('returns null when global is disabled and host is null', () => {
    expect(resolveEffectiveWaf({ ...globalWaf, enabled: false }, null)).toBeNull();
  });

  it('applies global WAF when host has no per-host config (null)', () => {
    const result = resolveEffectiveWaf(globalWaf, null);
    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(true);
    expect(result!.custom_directives).toContain('9002');
  });

  it('applies global WAF when host config is undefined', () => {
    const result = resolveEffectiveWaf(globalWaf, undefined);
    expect(result).not.toBeNull();
    expect(result!.custom_directives).toContain('9002');
  });
});

describe('resolveEffectiveWaf — merge mode (regression: host.enabled=false must opt out)', () => {
  it('returns null when host explicitly disables WAF in merge mode (the bug fix)', () => {
    // This was the bug: host.enabled=false in merge mode was ignored and global WAF applied anyway
    const result = resolveEffectiveWaf(globalWaf, { enabled: false, waf_mode: 'merge' });
    expect(result).toBeNull();
  });

  it('returns null when host.enabled=false with no waf_mode set (defaults to merge)', () => {
    const result = resolveEffectiveWaf(globalWaf, { enabled: false });
    expect(result).toBeNull();
  });

  it('merges host settings on top of global when host is enabled', () => {
    const result = resolveEffectiveWaf(globalWaf, {
      enabled: true,
      waf_mode: 'merge',
      mode: 'On',
      load_owasp_crs: true,
      custom_directives: 'SecRule ARGS "@contains evil" "id:9003,deny"',
    });
    expect(result).not.toBeNull();
    expect(result!.load_owasp_crs).toBe(true);
    // Both global and host custom directives are present
    expect(result!.custom_directives).toContain('9002');
    expect(result!.custom_directives).toContain('9003');
  });

  it('merge result has enabled=true', () => {
    const result = resolveEffectiveWaf(globalWaf, { enabled: true, waf_mode: 'merge' });
    expect(result!.enabled).toBe(true);
  });

  it('merged excluded_rule_ids combines global and host lists', () => {
    const global = { ...globalWaf, excluded_rule_ids: [941100] };
    const result = resolveEffectiveWaf(global, {
      enabled: true,
      waf_mode: 'merge',
      excluded_rule_ids: [942200],
    });
    expect(result!.excluded_rule_ids).toContain(941100);
    expect(result!.excluded_rule_ids).toContain(942200);
  });
});

describe('resolveEffectiveWaf — override mode', () => {
  it('returns null when host.enabled=false in override mode', () => {
    const result = resolveEffectiveWaf(globalWaf, { enabled: false, waf_mode: 'override' });
    expect(result).toBeNull();
  });

  it('uses only host config in override mode, ignores global custom_directives', () => {
    const result = resolveEffectiveWaf(globalWaf, {
      enabled: true,
      waf_mode: 'override',
      mode: 'On',
      load_owasp_crs: true,
      custom_directives: 'SecRule ARGS "@contains evil" "id:9003,deny"',
    });
    expect(result).not.toBeNull();
    expect(result!.custom_directives).toBe('SecRule ARGS "@contains evil" "id:9003,deny"');
    // Global directives are NOT included
    expect(result!.custom_directives).not.toContain('9002');
    expect(result!.load_owasp_crs).toBe(true);
  });

  it('host-only WAF with no global applies correctly', () => {
    const result = resolveEffectiveWaf(null, { enabled: true, waf_mode: 'override', mode: 'On' });
    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildWafHandler — WebSocket bypass is now at Caddy route level, NOT SecLang
// ---------------------------------------------------------------------------

describe('buildWafHandler — no SecLang WebSocket bypass (handled at route level)', () => {
  it('does NOT emit any WebSocket/Upgrade SecLang rule', () => {
    const handler = buildWafHandler(baseWaf);
    expect(handler.directives).not.toContain('ctl:ruleEngine=off');
    expect(handler.directives).not.toContain('Upgrade');
    expect(handler.directives).not.toContain('websocket');
  });

  it('does not accept an allowWebsocket parameter (signature changed)', () => {
    // buildWafHandler now takes only one argument
    expect(buildWafHandler.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// validateSecLangDirectives
// ---------------------------------------------------------------------------

describe('validateSecLangDirectives', () => {
  it('returns empty array for empty input', () => {
    expect(validateSecLangDirectives('')).toEqual([]);
    expect(validateSecLangDirectives('   ')).toEqual([]);
  });

  it('returns no issues for valid custom rules', () => {
    const text = [
      'SecRule ARGS "@contains evil" "id:9001,deny"',
      'SecRuleRemoveByTag "attack-xss"',
      'SecRuleRemoveById 920440',
    ].join('\n');
    expect(validateSecLangDirectives(text)).toEqual([]);
  });

  it('skips comment lines and blank lines', () => {
    const text = [
      '# This is a comment',
      '',
      '   # Another comment',
      'SecRule ARGS "@contains test" "id:9010,deny"',
    ].join('\n');
    expect(validateSecLangDirectives(text)).toEqual([]);
  });

  it('returns error for unsupported directives', () => {
    const cases = [
      'SecTmpDir /tmp',
      'SecDataDir /tmp',
      'SecUploadDir /tmp',
      'SecTmpSaveUploadedFiles On',
      'SecUnicodeMapFile unicode.mapping 20127',
      'SecAuditLogType Serial',
      'SecDebugLog /var/log/debug.log',
      'SecDebugLogLevel 9',
      'SecCookieFormat 0',
      'SecArgumentSeparator &',
      'SecServerSignature "Apache"',
      'SecHashEngine On',
      'SecEncryptionKey "mykey"',
    ];
    for (const directive of cases) {
      const issues = validateSecLangDirectives(directive);
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues[0].severity).toBe('error');
    }
  });

  it('returns error for Include @coraza.conf-recommended', () => {
    const issues = validateSecLangDirectives('Include @coraza.conf-recommended');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].directive).toBe('Include @coraza.conf-recommended');
  });

  it('returns warning for managed directives', () => {
    const cases = [
      'SecRuleEngine On',
      'SecRequestBodyAccess On',
      'SecRequestBodyLimit 13107200',
      'SecResponseBodyAccess Off',
      'SecAuditEngine RelevantOnly',
      'SecAuditLog /var/log/audit.log',
      'SecAuditLogFormat JSON',
      'SecAuditLogParts ABIJDEFHZ',
    ];
    for (const directive of cases) {
      const issues = validateSecLangDirectives(directive);
      expect(issues.length).toBeGreaterThanOrEqual(1);
      expect(issues[0].severity).toBe('warning');
    }
  });

  it('reports correct line numbers in mixed content', () => {
    const text = [
      '# comment',
      'SecRule ARGS "@contains test" "id:9010,deny"',
      'SecTmpDir /tmp',
      '',
      'SecRuleEngine On',
    ].join('\n');
    const issues = validateSecLangDirectives(text);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ line: 3, severity: 'error', directive: 'SecTmpDir' });
    expect(issues[1]).toMatchObject({ line: 5, severity: 'warning', directive: 'SecRuleEngine' });
  });

  it('handles case-insensitive matching', () => {
    const issues = validateSecLangDirectives('sectmpdir /tmp');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('handles prefix matching for directive families', () => {
    const issues = validateSecLangDirectives('SecAuditLogRelevantStatus "^(?:5|4\\d[^4])"\nSecDebugLogLevel 3');
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.severity === 'error')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveWaf — rule_set_ids merging
// ---------------------------------------------------------------------------

describe('resolveEffectiveWaf — rule_set_ids', () => {
  it('passes through global rule_set_ids when host is null', () => {
    const global = { ...globalWaf, rule_set_ids: [1, 2] };
    const result = resolveEffectiveWaf(global, null);
    expect(result!.rule_set_ids).toEqual([1, 2]);
  });

  it('passes through host rule_set_ids in override mode', () => {
    const result = resolveEffectiveWaf(globalWaf, {
      enabled: true,
      waf_mode: 'override',
      mode: 'On',
      rule_set_ids: [3, 4],
    });
    expect(result!.rule_set_ids).toEqual([3, 4]);
  });

  it('does not include global rule_set_ids in override mode', () => {
    const global = { ...globalWaf, rule_set_ids: [1, 2] };
    const result = resolveEffectiveWaf(global, {
      enabled: true,
      waf_mode: 'override',
      mode: 'On',
      rule_set_ids: [3],
    });
    expect(result!.rule_set_ids).toEqual([3]);
    expect(result!.rule_set_ids).not.toContain(1);
  });

  it('merges global and host rule_set_ids in merge mode with dedup', () => {
    const global = { ...globalWaf, rule_set_ids: [1, 2] };
    const result = resolveEffectiveWaf(global, {
      enabled: true,
      waf_mode: 'merge',
      rule_set_ids: [2, 3],
    });
    expect(result!.rule_set_ids).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(result!.rule_set_ids).toHaveLength(3);
  });

  it('handles missing rule_set_ids on both sides in merge mode', () => {
    const result = resolveEffectiveWaf(globalWaf, {
      enabled: true,
      waf_mode: 'merge',
    });
    expect(result!.rule_set_ids).toEqual([]);
  });

  it('host-only WAF (no global) preserves rule_set_ids', () => {
    const result = resolveEffectiveWaf(null, {
      enabled: true,
      mode: 'On',
      rule_set_ids: [5],
    });
    expect(result!.rule_set_ids).toEqual([5]);
  });
});

// ---------------------------------------------------------------------------
// buildWafHandler — pre-CRS / post-CRS directive splitting
// ---------------------------------------------------------------------------

describe('buildWafHandler — custom directive ordering (pre-CRS / post-CRS split)', () => {
  it('SecRule custom directives appear BEFORE CRS includes', () => {
    const handler = buildWafHandler({
      ...baseWaf,
      load_owasp_crs: true,
      custom_directives: 'SecRule REQUEST_URI "@rx ^/api/" "id:50001,phase:1,pass,nolog,ctl:ruleEngine=Off"',
    });
    const directives = handler.directives as string;
    const rulePos = directives.indexOf('id:50001');
    const crsPos = directives.indexOf('@owasp_crs');
    expect(rulePos).toBeGreaterThanOrEqual(0);
    expect(crsPos).toBeGreaterThanOrEqual(0);
    expect(rulePos).toBeLessThan(crsPos);
  });

  it('SecRuleRemoveById in custom directives appears AFTER CRS includes', () => {
    const handler = buildWafHandler({
      ...baseWaf,
      load_owasp_crs: true,
      custom_directives: 'SecRuleRemoveById 911100',
    });
    const directives = handler.directives as string;
    const removePos = directives.indexOf('SecRuleRemoveById 911100');
    const crsPos = directives.indexOf('@owasp_crs');
    expect(removePos).toBeGreaterThanOrEqual(0);
    expect(crsPos).toBeGreaterThanOrEqual(0);
    expect(removePos).toBeGreaterThan(crsPos);
  });

  it('mixed SecRule + SecRuleRemoveById are split correctly around CRS', () => {
    const custom = [
      'SecRule REQUEST_URI "@rx ^/api/" "id:50001,phase:1,pass,nolog,ctl:ruleEngine=Off"',
      'SecRuleRemoveById 920420',
      '# A comment',
      'SecRuleRemoveById 911100',
      'SecRule REQUEST_URI "@rx ^/static/" "id:50002,phase:1,pass,nolog,ctl:ruleEngine=Off"',
    ].join('\n');
    const handler = buildWafHandler({
      ...baseWaf,
      load_owasp_crs: true,
      custom_directives: custom,
    });
    const directives = handler.directives as string;
    const crsPos = directives.indexOf('@owasp_crs');

    // SecRule directives and comments should be before CRS
    expect(directives.indexOf('id:50001')).toBeLessThan(crsPos);
    expect(directives.indexOf('id:50002')).toBeLessThan(crsPos);
    expect(directives.indexOf('# A comment')).toBeLessThan(crsPos);

    // SecRuleRemoveById should be after CRS
    expect(directives.indexOf('SecRuleRemoveById 920420')).toBeGreaterThan(crsPos);
    expect(directives.indexOf('SecRuleRemoveById 911100')).toBeGreaterThan(crsPos);
  });

  it('excluded_rule_ids from UI field still appear after CRS', () => {
    const handler = buildWafHandler({
      ...baseWaf,
      load_owasp_crs: true,
      excluded_rule_ids: [941100],
      custom_directives: 'SecRule REQUEST_URI "@rx ^/api/" "id:50001,phase:1,pass,nolog,ctl:ruleEngine=Off"',
    });
    const directives = handler.directives as string;
    const crsPos = directives.indexOf('@owasp_crs');
    const excludedPos = directives.indexOf('SecRuleRemoveById 941100');
    expect(excludedPos).toBeGreaterThan(crsPos);
  });

  it('SecRuleUpdateTargetById in custom directives appears AFTER CRS includes', () => {
    const handler = buildWafHandler({
      ...baseWaf,
      load_owasp_crs: true,
      custom_directives: 'SecRuleUpdateTargetById 942100-942999 "!REQUEST_HEADERS:cookie"',
    });
    const directives = handler.directives as string;
    const updatePos = directives.indexOf('SecRuleUpdateTargetById 942100-942999');
    const crsPos = directives.indexOf('@owasp_crs');
    expect(updatePos).toBeGreaterThanOrEqual(0);
    expect(crsPos).toBeGreaterThanOrEqual(0);
    expect(updatePos).toBeGreaterThan(crsPos);
  });

  it('SecRuleUpdateActionById in custom directives appears AFTER CRS includes', () => {
    const handler = buildWafHandler({
      ...baseWaf,
      load_owasp_crs: true,
      custom_directives: 'SecRuleUpdateActionById 949110 "deny,status:403"',
    });
    const directives = handler.directives as string;
    const updatePos = directives.indexOf('SecRuleUpdateActionById 949110');
    const crsPos = directives.indexOf('@owasp_crs');
    expect(updatePos).toBeGreaterThanOrEqual(0);
    expect(crsPos).toBeGreaterThanOrEqual(0);
    expect(updatePos).toBeGreaterThan(crsPos);
  });

  it('mixed SecRule + SecRuleRemoveById + SecRuleUpdateTargetById are split correctly', () => {
    const custom = [
      'SecRule REQUEST_URI "@rx ^/api/" "id:50001,phase:1,pass,nolog,ctl:ruleEngine=Off"',
      'SecRuleRemoveById 920420',
      'SecRuleUpdateTargetById 941100-941999 "!REQUEST_HEADERS:cookie"',
      'SecRule REQUEST_URI "@rx ^/static/" "id:50002,phase:1,pass,nolog,ctl:ruleEngine=Off"',
    ].join('\n');
    const handler = buildWafHandler({
      ...baseWaf,
      load_owasp_crs: true,
      custom_directives: custom,
    });
    const directives = handler.directives as string;
    const crsPos = directives.indexOf('@owasp_crs');

    // SecRule directives should be before CRS
    expect(directives.indexOf('id:50001')).toBeLessThan(crsPos);
    expect(directives.indexOf('id:50002')).toBeLessThan(crsPos);

    // SecRuleRemoveById and SecRuleUpdateTargetById should be after CRS
    expect(directives.indexOf('SecRuleRemoveById 920420')).toBeGreaterThan(crsPos);
    expect(directives.indexOf('SecRuleUpdateTargetById 941100-941999')).toBeGreaterThan(crsPos);
  });

  it('without CRS, all custom directives still appear in output', () => {
    const custom = [
      'SecRule REQUEST_URI "@rx ^/api/" "id:50001,phase:1,pass,nolog,ctl:ruleEngine=Off"',
      'SecRuleRemoveById 920420',
    ].join('\n');
    const handler = buildWafHandler({
      ...baseWaf,
      load_owasp_crs: false,
      custom_directives: custom,
    });
    const directives = handler.directives as string;
    expect(directives).toContain('id:50001');
    expect(directives).toContain('SecRuleRemoveById 920420');
  });
});
