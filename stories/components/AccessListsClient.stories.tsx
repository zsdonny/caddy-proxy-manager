import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import AccessListsClient from '../../app/(dashboard)/access-lists/AccessListsClient';
import type { AccessList } from '../../src/lib/models/access-lists';
import { withDashboardLayout } from '../decorators';

const meta: Meta<typeof AccessListsClient> = {
  title: 'Components/AccessListsClient',
  component: AccessListsClient,
  tags: ['autodocs'],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/access-lists' } },
  },
};
export default meta;
type Story = StoryObj<typeof AccessListsClient>;

// ── Mock data ─────────────────────────────────────────────────────────────────

function makeEntry(id: number, username: string): AccessList['entries'][number] {
  return {
    id,
    username,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  };
}

const mockLists: AccessList[] = [
  {
    id: 1,
    name: 'Internal Staff',
    description: 'Read-only access for internal dashboard users',
    entries: [
      makeEntry(1, 'alice'),
      makeEntry(2, 'bob'),
      makeEntry(3, 'charlie'),
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-03-10T08:30:00Z',
  },
  {
    id: 2,
    name: 'Admin Panel',
    description: 'Administrators with full CRUD access',
    entries: [
      makeEntry(4, 'admin'),
      makeEntry(5, 'devops'),
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-20T14:00:00Z',
  },
  {
    id: 3,
    name: 'Monitoring Probes',
    description: null,
    entries: [
      makeEntry(6, 'prometheus'),
      makeEntry(7, 'grafana-agent'),
      makeEntry(8, 'datadog'),
    ],
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 4,
    name: 'API Consumers',
    description: 'External service accounts',
    entries: [
      makeEntry(9, 'svc-billing'),
      makeEntry(10, 'svc-notifications'),
    ],
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 5,
    name: 'Legacy Clients',
    description: 'Deprecated — pending migration',
    entries: [
      makeEntry(11, 'old-app-v1'),
    ],
    created_at: '2025-06-01T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z',
  },
];

// ── Stories ───────────────────────────────────────────────────────────────────

export const MultipleCards: Story = {
  name: 'Multiple access lists — cycling accent colors',
  args: {
    lists: mockLists,
    pagination: { total: 5, page: 1, perPage: 10 },
  },
};

export const Single: Story = {
  name: 'Single access list',
  args: {
    lists: [mockLists[0]],
    pagination: { total: 1, page: 1, perPage: 10 },
  },
};

export const Empty: Story = {
  name: 'Empty state — no access lists',
  args: {
    lists: [],
    pagination: { total: 0, page: 1, perPage: 10 },
  },
};

export const Fullscreen: Story = {
  name: 'Fullscreen — dashboard layout',
  decorators: [withDashboardLayout],
  parameters: { layout: 'fullscreen' },
  args: { ...MultipleCards.args },
};
