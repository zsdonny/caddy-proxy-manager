import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import AnalyticsClient from '../../app/(dashboard)/analytics/AnalyticsClient';
import { withDashboardLayout } from '../decorators';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Mock data ────────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000);

const mockHosts = ['app.example.com', 'api.example.com', 'cdn.example.com'];

const mockSummary = {
  totalRequests: 45283,
  uniqueIps: 1247,
  blockedRequests: 1583,
  blockedPercent: 3.5,
  bytesServed: 2_147_483_648,
  loggingDisabled: false,
};

const mockTimeline = Array.from({ length: 24 }, (_, i) => ({
  ts: now - (23 - i) * 3600,
  total: 800 + Math.floor(Math.random() * 1200),
  blocked: 20 + Math.floor(Math.random() * 80),
}));

const mockCountries = [
  { countryCode: 'US', total: 12400, blocked: 340 },
  { countryCode: 'DE', total: 8200, blocked: 120 },
  { countryCode: 'CN', total: 5100, blocked: 890 },
  { countryCode: 'GB', total: 4300, blocked: 55 },
  { countryCode: 'JP', total: 3800, blocked: 28 },
  { countryCode: 'FR', total: 2900, blocked: 42 },
  { countryCode: 'RU', total: 2100, blocked: 310 },
  { countryCode: 'BR', total: 1800, blocked: 15 },
];

const mockProtocols = [
  { proto: 'HTTP/2', count: 28000, percent: 61.8 },
  { proto: 'HTTP/3', count: 12000, percent: 26.5 },
  { proto: 'HTTP/1.1', count: 5283, percent: 11.7 },
];

const mockUserAgents = [
  { userAgent: 'Chrome/125.0.6422.76', count: 18900, percent: 41.7 },
  { userAgent: 'Firefox/126.0', count: 8200, percent: 18.1 },
  { userAgent: 'Safari/17.5', count: 6100, percent: 13.5 },
  { userAgent: 'Googlebot/2.1', count: 4800, percent: 10.6 },
  { userAgent: 'curl/8.7.1', count: 3200, percent: 7.1 },
  { userAgent: 'python-requests/2.31.0', count: 2100, percent: 4.6 },
  { userAgent: 'Go-http-client/2.0', count: 1983, percent: 4.4 },
];

const mockBlocked = {
  events: [
    { id: 1, ts: now - 120, clientIp: '203.0.113.42', countryCode: 'RU', method: 'POST', uri: '/admin/login', status: 403, host: 'app.example.com' },
    { id: 2, ts: now - 340, clientIp: '198.51.100.7', countryCode: 'CN', method: 'GET', uri: '/api/v1/users?id=1%20OR%201=1--', status: 403, host: 'api.example.com' },
    { id: 3, ts: now - 780, clientIp: '10.0.0.55', countryCode: 'DE', method: 'POST', uri: '/search?q=<script>alert(1)</script>', status: 403, host: 'app.example.com' },
    { id: 4, ts: now - 1200, clientIp: '192.0.2.88', countryCode: 'US', method: 'GET', uri: '/../../etc/passwd', status: 403, host: 'cdn.example.com' },
    { id: 5, ts: now - 2400, clientIp: '172.16.0.22', countryCode: 'FR', method: 'PUT', uri: '/api/v2/configs', status: 403, host: 'api.example.com' },
  ],
  total: 47,
  page: 1,
  pages: 5,
};

const mockWafStats = {
  total: 342,
  topRules: [
    { ruleId: 932160, count: 128, message: 'Remote Command Execution: Unix Shell Code Found', hosts: [{ host: 'app.example.com', count: 98 }, { host: 'api.example.com', count: 30 }] },
    { ruleId: 942100, count: 87, message: 'SQL Injection Attack Detected via libinjection', hosts: [{ host: 'api.example.com', count: 87 }] },
    { ruleId: 941100, count: 64, message: 'XSS Attack Detected via libinjection', hosts: [{ host: 'app.example.com', count: 64 }] },
    { ruleId: 920350, count: 38, message: 'Host header is a numeric IP address', hosts: [{ host: 'cdn.example.com', count: 38 }] },
    { ruleId: 930100, count: 25, message: 'Path Traversal Attack (/../)', hosts: [{ host: 'api.example.com', count: 25 }] },
  ],
  byCountry: [
    { countryCode: 'RU', count: 142 },
    { countryCode: 'CN', count: 118 },
    { countryCode: 'US', count: 52 },
    { countryCode: 'DE', count: 30 },
  ],
};

const mockWafStatsWithScanner = {
  ...mockWafStats,
  total: 1847,
  topRules: [
    { ruleId: 920350, count: 1205, message: 'Host header is a numeric IP address', hosts: [{ host: 'app.example.com', count: 800 }, { host: 'api.example.com', count: 405 }] },
    ...mockWafStats.topRules,
  ],
};

// ── URL-based fetch router ───────────────────────────────────────────────────

function mockFetch(wafResponse = mockWafStats) {
  return (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/analytics/hosts')) return Promise.resolve(json(mockHosts));
    if (url.includes('/api/analytics/summary')) return Promise.resolve(json(mockSummary));
    if (url.includes('/api/analytics/timeline')) return Promise.resolve(json(mockTimeline));
    if (url.includes('/api/analytics/countries')) return Promise.resolve(json(mockCountries));
    if (url.includes('/api/analytics/protocols')) return Promise.resolve(json(mockProtocols));
    if (url.includes('/api/analytics/user-agents')) return Promise.resolve(json(mockUserAgents));
    if (url.includes('/api/analytics/blocked')) return Promise.resolve(json(mockBlocked));
    if (url.includes('/api/analytics/waf-stats')) {
      const includeMuted = url.includes('include_muted=1');
      return Promise.resolve(json(includeMuted ? wafResponse : mockWafStats));
    }
    return Promise.resolve(json({ error: 'not found' }, 404));
  };
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof AnalyticsClient> = {
  title: 'Pages/Analytics',
  component: AnalyticsClient,
  decorators: [withDashboardLayout],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/analytics' } },
  },
};
export default meta;
type Story = StoryObj<typeof AnalyticsClient>;

// ── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: 'Analytics — full dashboard',
  beforeEach: () => {
    const orig = window.fetch;
    window.fetch = mockFetch() as typeof window.fetch;
    return () => { window.fetch = orig; };
  },
};

export const WithScannerNoise: Story = {
  name: 'Analytics — scanner noise visible (All mode)',
  beforeEach: () => {
    const orig = window.fetch;
    window.fetch = mockFetch(mockWafStatsWithScanner) as typeof window.fetch;
    return () => { window.fetch = orig; };
  },
};

export const NoTraffic: Story = {
  name: 'Analytics — no traffic data',
  beforeEach: () => {
    const orig = window.fetch;
    window.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/analytics/hosts')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/summary')) return Promise.resolve(json({
        totalRequests: 0, uniqueIps: 0, blockedRequests: 0, blockedPercent: 0, bytesServed: 0, loggingDisabled: false,
      }));
      if (url.includes('/api/analytics/timeline')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/countries')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/protocols')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/user-agents')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/blocked')) return Promise.resolve(json({ events: [], total: 0, page: 1, pages: 0 }));
      if (url.includes('/api/analytics/waf-stats')) return Promise.resolve(json({ total: 0, topRules: [], byCountry: [] }));
      return Promise.resolve(json({ error: 'not found' }, 404));
    }) as typeof window.fetch;
    return () => { window.fetch = orig; };
  },
};

export const LoggingDisabled: Story = {
  name: 'Analytics — logging not enabled',
  beforeEach: () => {
    const orig = window.fetch;
    window.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/analytics/hosts')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/summary')) return Promise.resolve(json({
        totalRequests: 0, uniqueIps: 0, blockedRequests: 0, blockedPercent: 0, bytesServed: 0, loggingDisabled: true,
      }));
      if (url.includes('/api/analytics/timeline')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/countries')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/protocols')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/user-agents')) return Promise.resolve(json([]));
      if (url.includes('/api/analytics/blocked')) return Promise.resolve(json({ events: [], total: 0, page: 1, pages: 0 }));
      if (url.includes('/api/analytics/waf-stats')) return Promise.resolve(json({ total: 0, topRules: [], byCountry: [] }));
      return Promise.resolve(json({ error: 'not found' }, 404));
    }) as typeof window.fetch;
    return () => { window.fetch = orig; };
  },
};

export const HighBlockRate: Story = {
  name: 'Analytics — high block rate (under attack)',
  beforeEach: () => {
    const orig = window.fetch;
    const attackSummary = {
      totalRequests: 182047,
      uniqueIps: 4891,
      blockedRequests: 61896,
      blockedPercent: 34,
      bytesServed: 8_589_934_592,
      loggingDisabled: false,
    };
    const attackWaf = {
      total: 48210,
      topRules: [
        { ruleId: 932160, count: 18420, message: 'Remote Command Execution: Unix Shell Code Found', hosts: [{ host: 'app.example.com', count: 18420 }] },
        { ruleId: 942100, count: 14300, message: 'SQL Injection Attack Detected via libinjection', hosts: [{ host: 'api.example.com', count: 14300 }] },
        { ruleId: 941100, count: 9800, message: 'XSS Attack Detected via libinjection', hosts: [{ host: 'app.example.com', count: 9800 }] },
        { ruleId: 913120, count: 5690, message: 'Found request filename/argument associated with security scanner', hosts: [{ host: 'cdn.example.com', count: 5690 }] },
      ],
      byCountry: [
        { countryCode: 'RU', count: 22100 },
        { countryCode: 'CN', count: 18400 },
        { countryCode: 'KP', count: 4200 },
        { countryCode: 'IR', count: 3510 },
      ],
    };
    window.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/analytics/hosts')) return Promise.resolve(json(mockHosts));
      if (url.includes('/api/analytics/summary')) return Promise.resolve(json(attackSummary));
      if (url.includes('/api/analytics/timeline')) return Promise.resolve(json(mockTimeline.map(b => ({ ...b, blocked: b.blocked * 12 }))));
      if (url.includes('/api/analytics/countries')) return Promise.resolve(json(mockCountries.map(c => ({ ...c, blocked: c.blocked * 8 }))));
      if (url.includes('/api/analytics/protocols')) return Promise.resolve(json(mockProtocols));
      if (url.includes('/api/analytics/user-agents')) return Promise.resolve(json(mockUserAgents));
      if (url.includes('/api/analytics/blocked')) return Promise.resolve(json(mockBlocked));
      if (url.includes('/api/analytics/waf-stats')) return Promise.resolve(json(attackWaf));
      return Promise.resolve(json({ error: 'not found' }, 404));
    }) as typeof window.fetch;
    return () => { window.fetch = orig; };
  },
};
