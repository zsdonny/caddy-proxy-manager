import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect } from 'storybook/test';
import WafEventsClient from '../../app/(dashboard)/waf/WafEventsClient';
import type { WafEvent } from '../../src/lib/models/waf-events';
import type { RuleSetItem } from '../../src/components/waf/RuleSetDialog';
import { withDashboardLayout } from '../decorators';

const meta: Meta<typeof WafEventsClient> = {
  title: 'Components/WafEventsClient',
  component: WafEventsClient,
  tags: ['autodocs'],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/waf' } },
  },
};
export default meta;
type Story = StoryObj<typeof WafEventsClient>;

// ── Helpers ──────────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000);

function event(overrides: Partial<WafEvent> & { id: number }): WafEvent {
  return {
    ts: now - overrides.id * 37,
    host: 'app.example.com',
    clientIp: '203.0.113.42',
    countryCode: 'US',
    method: 'GET',
    uri: '/',
    ruleId: null,
    ruleMessage: null,
    severity: null,
    rawData: null,
    blocked: false,
    muted: false,
    ...overrides,
  };
}

// ── Mock events ───────────────────────────────────────────────────────────────

const mockEvents: WafEvent[] = [
  event({
    id: 1,
    host: 'app.example.com',
    clientIp: '203.0.113.42',
    countryCode: 'RU',
    method: 'POST',
    uri: '/admin/login',
    ruleId: 932160,
    ruleMessage: 'Remote Command Execution: Unix Shell Code Found',
    severity: 'CRITICAL',
    blocked: true,
    rawData: JSON.stringify({ matched: 'Remote Code Execution', tags: ['OWASP_CRS', 'attack-rce'] }),
  }),
  event({
    id: 2,
    host: 'api.example.com',
    clientIp: '198.51.100.7',
    countryCode: 'CN',
    method: 'GET',
    uri: "/api/v1/users?id=1 OR 1=1--",
    ruleId: 942100,
    ruleMessage: 'SQL Injection Attack Detected via libinjection',
    severity: 'HIGH',
    blocked: true,
    rawData: JSON.stringify({ matched: '1 OR 1=1', tags: ['OWASP_CRS', 'attack-sqli'] }),
  }),
  event({
    id: 3,
    host: 'app.example.com',
    clientIp: '10.0.0.55',
    countryCode: 'DE',
    method: 'POST',
    uri: '/search',
    ruleId: 941100,
    ruleMessage: 'XSS Attack Detected via libinjection',
    severity: 'HIGH',
    blocked: false,
    rawData: JSON.stringify({ matched: '<script>alert(1)</script>', tags: ['OWASP_CRS', 'attack-xss'] }),
  }),
  event({
    id: 4,
    host: 'api.example.com',
    clientIp: '192.0.2.88',
    countryCode: 'US',
    method: 'GET',
    uri: '/api/status',
    ruleId: 920350,
    ruleMessage: 'Host header is a numeric IP address',
    severity: 'WARNING',
    blocked: false,
    rawData: JSON.stringify({ matched: '10.1.2.3', tags: ['OWASP_CRS', 'protocol-enforcement'] }),
  }),
  event({
    id: 5,
    host: 'app.example.com',
    clientIp: '172.16.0.22',
    countryCode: 'FR',
    method: 'PUT',
    uri: '/api/v2/configs',
    ruleId: 930100,
    ruleMessage: 'Path Traversal Attack (/../)',
    severity: 'NOTICE',
    blocked: false,
    rawData: JSON.stringify({ matched: '../../../etc/passwd', tags: ['OWASP_CRS', 'attack-lfi'] }),
  }),
];

// ── Mock Rule Sets ────────────────────────────────────────────────────────────

const mockRuleSets: RuleSetItem[] = [
  {
    id: 1,
    name: 'WordPress',
    description: 'Relaxes CRS rules commonly triggered by WordPress admin, REST API, and file uploads.',
    directives: 'SecRule REQUEST_URI "@rx ^/wp-(?:admin|login)" "id:70001,phase:1,pass,nolog,ctl:ruleEngine=Off"',
    isPreset: true,
    createdAt: '2026-03-27T00:00:00Z',
    updatedAt: '2026-03-27T00:00:00Z',
  },
  {
    id: 2,
    name: 'Node.js / Express API',
    description: 'Relaxes CRS rules for JSON APIs, JWTs, and common Node.js patterns.',
    directives: 'SecRule REQUEST_URI "@beginsWith /api/" "id:70020,phase:1,pass,nolog,ctl:ruleEngine=Off"',
    isPreset: true,
    createdAt: '2026-03-27T00:00:00Z',
    updatedAt: '2026-03-27T00:00:00Z',
  },
  {
    id: 3,
    name: 'My Scanner Blocker',
    description: null,
    directives: 'SecRule REQUEST_HEADERS:User-Agent "@contains leakix" "id:60001,phase:1,deny,status:403,log"',
    isPreset: false,
    createdAt: '2026-03-25T10:30:00Z',
    updatedAt: '2026-03-26T14:00:00Z',
  },
];

// ── Default WAF settings stub ─────────────────────────────────────────────────

const defaultGlobalWaf = {
  enabled: true,
  enableOwasp: true,
  customDirectives: '',
  excludedRules: [],
};

// ── Stories ──────────────────────────────────────────────────────────────────

export const WithEvents: Story = {
  name: '▶ Interactive — click row to open event drawer',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Desktop table + mobile card may both render text, so use findAllByText
    const rows = await canvas.findAllByText(/SQL Injection Attack Detected/i);
    await userEvent.click(rows[0]);
    // Radix Sheet portals to document.body (outside storybook-root), so query body
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.findByRole('dialog')).resolves.toBeTruthy();
  },
  args: {
    events: mockEvents,
    pagination: { total: 47, page: 1, perPage: 10 },
    initialSearch: '',
    initialIncludeMuted: false,
    mutedCount: 0,
    globalExcluded: [],
    globalExcludedMessages: {},
    globalWafEnabled: true,
    hostWafMap: {},
    globalWaf: defaultGlobalWaf,
    ruleSets: mockRuleSets,
  },
};

export const WithExclusions: Story = {
  name: 'With global + per-host rule exclusions',
  args: {
    events: mockEvents,
    pagination: { total: 47, page: 1, perPage: 10 },
    initialSearch: '',
    initialIncludeMuted: false,
    mutedCount: 0,
    globalExcluded: [932160],
    globalExcludedMessages: { 932160: 'Remote Command Execution: Unix Shell Code Found' },
    globalWafEnabled: true,
    hostWafMap: {
      'api.example.com': [942100],
    },
    globalWaf: defaultGlobalWaf,
    ruleSets: [],
  },
};

export const Empty: Story = {
  name: 'Empty — no events yet',
  args: {
    events: [],
    pagination: { total: 0, page: 1, perPage: 10 },
    initialSearch: '',
    initialIncludeMuted: false,
    mutedCount: 0,
    globalExcluded: [],
    globalExcludedMessages: {},
    globalWafEnabled: false,
    hostWafMap: {},
    globalWaf: null,
    ruleSets: [],
  },
};

export const SecLangErrors: Story = {
  name: 'Global WAF — SecLang validation errors',
  args: {
    events: mockEvents.slice(0, 2),
    pagination: { total: 2, page: 1, perPage: 10 },
    initialSearch: '',
    initialIncludeMuted: false,
    mutedCount: 0,
    globalExcluded: [],
    globalExcludedMessages: {},
    globalWafEnabled: true,
    hostWafMap: {},
    globalWaf: {
      enabled: true,
      enableOwasp: true,
      customDirectives: [
        'SecTmpDir /tmp/modsec',
        'SecRuleEngine On',
        'SecRule REQUEST_URI "@contains /ok" "id:9001,allow,nolog"',
        'Include @coraza.conf-recommended',
      ].join('\n'),
      excludedRules: [],
    },
    ruleSets: [],
  },
};

export const WithMutedEvents: Story = {
  name: 'With muted events visible',
  args: {
    events: [
      ...mockEvents.slice(0, 3),
      event({
        id: 10,
        host: 'app.example.com',
        clientIp: '173.245.48.12',
        countryCode: 'US',
        method: 'GET',
        uri: '/cdn-cgi/trace',
        ruleId: 920350,
        ruleMessage: 'Host header is a numeric IP address',
        severity: 'WARNING',
        blocked: false,
        muted: true,
      }),
      event({
        id: 11,
        host: 'api.example.com',
        clientIp: '108.162.192.1',
        countryCode: 'US',
        method: 'GET',
        uri: '/health',
        ruleId: 920280,
        ruleMessage: 'Request Missing a Host Header',
        severity: 'NOTICE',
        blocked: false,
        muted: true,
      }),
    ],
    pagination: { total: 5, page: 1, perPage: 10 },
    initialSearch: '',
    initialIncludeMuted: true,
    mutedCount: 2,
    globalExcluded: [],
    globalExcludedMessages: {},
    globalWafEnabled: true,
    hostWafMap: {},
    globalWaf: {
      ...defaultGlobalWaf,
      muted_sources: {
        cidrs: ['173.245.48.0/20', '108.162.192.0/18'],
        ua_patterns: ['CloudFlare-*'],
      },
    },
    ruleSets: mockRuleSets,
  },
};

export const MutedSourcesSettings: Story = {
  name: 'Muted sources — settings tab with CIDRs and UA patterns',
  args: {
    events: mockEvents.slice(0, 2),
    pagination: { total: 2, page: 1, perPage: 10 },
    initialSearch: '',
    initialIncludeMuted: false,
    mutedCount: 12,
    globalExcluded: [],
    globalExcludedMessages: {},
    globalWafEnabled: true,
    hostWafMap: {},
    globalWaf: {
      ...defaultGlobalWaf,
      muted_sources: {
        cidrs: ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '108.162.192.0/18'],
        ua_patterns: ['CloudFlare-*', '*UptimeRobot*'],
      },
    },
    ruleSets: mockRuleSets,
  },
};

export const Fullscreen: Story = {
  name: 'Fullscreen — dashboard layout',
  decorators: [withDashboardLayout],
  parameters: { layout: 'fullscreen' },
  args: { ...WithEvents.args },
};
