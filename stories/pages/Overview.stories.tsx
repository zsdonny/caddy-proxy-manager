import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowLeftRight, Cable, ShieldCheck } from 'lucide-react';
import OverviewClient from '../../app/(dashboard)/OverviewClient';
import { withDashboardLayout } from '../decorators';

const meta: Meta<typeof OverviewClient> = {
  title: 'Pages/Overview',
  component: OverviewClient,
  decorators: [withDashboardLayout],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
  },
};

export default meta;
type Story = StoryObj<typeof OverviewClient>;

export const Default: Story = {
  name: 'Overview — dashboard home',
  args: {
    userName: 'Alex Johnson',
    stats: [
      { label: 'Proxy Hosts', icon: <ArrowLeftRight className="h-4 w-4" />, count: 12, href: '/proxy-hosts' },
      { label: 'L4 Proxy Hosts', icon: <Cable className="h-4 w-4" />, count: 8, href: '/l4-proxy-hosts' },
      { label: 'Certificates', icon: <ShieldCheck className="h-4 w-4" />, count: 7, href: '/certificates' },
    ],
    trafficSummary: {
      totalRequests: 45283,
      blockedPercent: 3,
    },
    recentEvents: [
      { summary: 'Create proxy host app.example.com', created_at: new Date(Date.now() - 5 * 60000).toISOString() },
      { summary: 'Update proxy host api.example.com', created_at: new Date(Date.now() - 18 * 60000).toISOString() },
      { summary: 'Delete L4 host minecraft-proxy', created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
      { summary: 'Create certificate *.example.com', created_at: new Date(Date.now() - 4 * 3600000).toISOString() },
      { summary: 'Update WAF global settings', created_at: new Date(Date.now() - 6 * 3600000).toISOString() },
    ],
  },
};

export const NoTraffic: Story = {
  name: 'Overview — no traffic yet',
  args: {
    ...Default.args,
    trafficSummary: null,
    recentEvents: [],
  },
};

export const HighBlockRate: Story = {
  name: 'Overview — high block rate',
  args: {
    ...Default.args,
    trafficSummary: {
      totalRequests: 182047,
      blockedPercent: 34,
    },
  },
};
