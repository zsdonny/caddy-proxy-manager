import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect } from 'storybook/test';
import WafEventsClient from '../../app/(dashboard)/waf/WafEventsClient';
import type { WafEvent } from '../../src/lib/models/waf-events';

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
    globalExcluded: [],
    globalExcludedMessages: {},
    globalWafEnabled: true,
    hostWafMap: {},
    globalWaf: defaultGlobalWaf,
  },
};

export const WithExclusions: Story = {
  name: 'With global + per-host rule exclusions',
  args: {
    events: mockEvents,
    pagination: { total: 47, page: 1, perPage: 10 },
    initialSearch: '',
    globalExcluded: [932160],
    globalExcludedMessages: { 932160: 'Remote Command Execution: Unix Shell Code Found' },
    globalWafEnabled: true,
    hostWafMap: {
      'api.example.com': [942100],
    },
    globalWaf: defaultGlobalWaf,
  },
};

export const Empty: Story = {
  name: 'Empty — no events yet',
  args: {
    events: [],
    pagination: { total: 0, page: 1, perPage: 10 },
    initialSearch: '',
    globalExcluded: [],
    globalExcludedMessages: {},
    globalWafEnabled: false,
    hostWafMap: {},
    globalWaf: null,
  },
};

export const SecLangErrors: Story = {
  name: 'Global WAF — SecLang validation errors',
  args: {
    events: mockEvents.slice(0, 2),
    pagination: { total: 2, page: 1, perPage: 10 },
    initialSearch: '',
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
  },
};
