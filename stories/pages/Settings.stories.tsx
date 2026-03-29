import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import SettingsClient from '../../app/(dashboard)/settings/SettingsClient';
import { withDashboardLayout } from '../decorators';

const meta: Meta<typeof SettingsClient> = {
  title: 'Pages/Settings',
  component: SettingsClient,
  decorators: [withDashboardLayout],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/settings' } },
  },
};

export default meta;
type Story = StoryObj<typeof SettingsClient>;

const baseInstanceSync = {
  mode: 'standalone' as const,
  modeFromEnv: false,
  tokenFromEnv: false,
  overrides: {
    general: false,
    cloudflare: false,
    authentik: false,
    metrics: false,
    logging: false,
    dns: false,
    upstreamDnsResolution: false,
  },
  replica: null,
  primary: null,
};

export const Standalone: Story = {
  name: 'Settings — standalone mode',
  args: {
    general: { primaryDomain: 'example.com', acmeEmail: 'admin@example.com' },
    cloudflare: { hasToken: true, zoneId: 'abc123zone', accountId: 'acc456', fetchCloudflareIps: true },
    authentik: { outpostDomain: 'auth.example.com', outpostUpstream: 'authentik:9000', authEndpoint: 'https://auth.example.com/outpost.goauthentik.io' },
    metrics: { enabled: true, port: 9090 },
    logging: { enabled: true, format: 'json' },
    dns: {
      enabled: true,
      resolvers: ['1.1.1.1', '8.8.8.8'],
      fallbacks: ['9.9.9.9'],
      timeout: '5s',
    },
    upstreamDnsResolution: { enabled: true, family: 'both' },
    globalGeoBlock: null,
    retention: { trafficRetentionDays: 90, wafRetentionDays: 90 },
    instanceSync: baseInstanceSync,
  },
};

export const NoSettings: Story = {
  name: 'Settings — unconfigured (all null)',
  args: {
    general: null,
    cloudflare: { hasToken: false },
    authentik: null,
    metrics: null,
    logging: null,
    dns: null,
    upstreamDnsResolution: null,
    globalGeoBlock: null,
    retention: null,
    instanceSync: baseInstanceSync,
  },
};

export const PrimaryMode: Story = {
  name: 'Settings — primary with replicas',
  args: {
    ...Standalone.args,
    instanceSync: {
      ...baseInstanceSync,
      mode: 'primary',
      primary: {
        instances: [
          { id: 1, name: 'EU Replica', base_url: 'https://eu.example.com', enabled: true, last_sync_at: new Date(Date.now() - 60_000).toISOString(), last_sync_error: null },
          { id: 2, name: 'US Replica', base_url: 'https://us.example.com', enabled: true, last_sync_at: new Date(Date.now() - 5 * 60_000).toISOString(), last_sync_error: 'Connection refused' },
          { id: 3, name: 'APAC Replica', base_url: 'https://apac.example.com', enabled: false, last_sync_at: null, last_sync_error: null },
        ],
        envInstances: [
          { name: 'Edge Node', url: 'https://edge.example.internal' },
        ],
      },
    },
  },
};

export const ReplicaMode: Story = {
  name: 'Settings — replica mode',
  args: {
    ...Standalone.args,
    instanceSync: {
      ...baseInstanceSync,
      mode: 'replica',
      overrides: {
        general: false,
        cloudflare: true,
        authentik: false,
        metrics: false,
        logging: false,
        dns: false,
        upstreamDnsResolution: false,
      },
      replica: {
        hasToken: true,
        lastSyncAt: new Date(Date.now() - 2 * 60_000).toISOString(),
        lastSyncError: null,
      },
    },
  },
};

export const ReplicaSyncError: Story = {
  name: 'Settings — replica with sync error',
  args: {
    ...Standalone.args,
    instanceSync: {
      ...baseInstanceSync,
      mode: 'replica',
      overrides: {
        general: false,
        cloudflare: false,
        authentik: false,
        metrics: false,
        logging: false,
        dns: false,
        upstreamDnsResolution: false,
      },
      replica: {
        hasToken: true,
        lastSyncAt: new Date(Date.now() - 30 * 60_000).toISOString(),
        lastSyncError: 'TLS: certificate verify failed',
      },
    },
  },
};

export const EnvLocked: Story = {
  name: 'Settings — mode and token locked via env',
  args: {
    ...Standalone.args,
    instanceSync: {
      ...baseInstanceSync,
      mode: 'replica',
      modeFromEnv: true,
      tokenFromEnv: true,
      replica: {
        hasToken: true,
        lastSyncAt: new Date().toISOString(),
        lastSyncError: null,
      },
    },
  },
};

export const GeoBlockEnabled: Story = {
  name: 'Settings — global geo-block active',
  args: {
    ...Standalone.args,
    globalGeoBlock: {
      enabled: true,
      block_countries: ['CN', 'RU', 'KP'],
      block_continents: [],
      block_asns: [],
      block_cidrs: [],
      block_ips: [],
      allow_countries: [],
      allow_continents: [],
      allow_asns: [],
      allow_cidrs: [],
      allow_ips: [],
      trusted_proxies: ['10.0.0.0/8'],
      fail_closed: false,
    },
  },
};
