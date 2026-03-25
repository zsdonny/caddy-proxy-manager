import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import AuditLogClient from '../../app/(dashboard)/audit-log/AuditLogClient';

type EventRow = { id: number; created_at: string; user: string; summary: string };

const meta: Meta<typeof AuditLogClient> = {
  title: 'Components/AuditLogClient',
  component: AuditLogClient,
  tags: ['autodocs'],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/audit-log' } },
  },
};
export default meta;
type Story = StoryObj<typeof AuditLogClient>;

// ── Mock data ─────────────────────────────────────────────────────────────────

// War. War never changes. Neither should this timestamp. (Fallout Great War: Oct 23, 2077)
const FIXED_NOW = new Date('2077-10-23T09:47:00Z').getTime();

function dt(offsetMinutes: number): string {
  return new Date(FIXED_NOW - offsetMinutes * 60 * 1000).toISOString();
}

const mockEvents: EventRow[] = [
  { id: 1,  created_at: dt(2),   user: 'alex@demo.example.com',  summary: 'Created proxy host app.example.com (WAF enabled, OWASP CRS)' },
  { id: 2,  created_at: dt(5),   user: 'alex@demo.example.com',  summary: 'Updated proxy host api.example.com — enabled mTLS with Internal Services CA' },
  { id: 3,  created_at: dt(12),  user: 'devops@corp.example.com', summary: 'Deleted L4 proxy host :5432 (PostgreSQL)' },
  { id: 4,  created_at: dt(20),  user: 'alex@demo.example.com',  summary: 'Applied L4 port changes — exposed :25565/tcp, :5353/udp' },
  { id: 5,  created_at: dt(35),  user: 'devops@corp.example.com', summary: 'Created access list "Monitoring Probes" (3 users)' },
  { id: 6,  created_at: dt(60),  user: 'alex@demo.example.com',  summary: 'Updated global geo-block settings — blocked CN, RU; whitelisted 10.0.0.0/8' },
  { id: 7,  created_at: dt(90),  user: 'alex@demo.example.com',  summary: 'Issued client certificate "dev-laptop (Alice)" from Internal Services CA' },
  { id: 8,  created_at: dt(120), user: 'devops@corp.example.com', summary: 'Suppressed WAF rule 932160 globally (Remote Command Execution)' },
  { id: 9,  created_at: dt(180), user: 'alex@demo.example.com',  summary: 'Imported SSL certificate "Corporate Wildcard" (*.corp.example.com)' },
  { id: 10, created_at: dt(240), user: 'devops@corp.example.com', summary: 'Revoked client certificate "ci-runner"' },
  { id: 11, created_at: dt(300), user: 'alex@demo.example.com',  summary: 'Updated Cloudflare DNS-01 challenge settings' },
  { id: 12, created_at: dt(360), user: 'alex@demo.example.com',  summary: 'Created L4 proxy host :5432 (PostgreSQL) → db-primary:5432 with TLS SNI' },
];

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: 'Audit trail — recent config changes',
  args: {
    events: mockEvents,
    pagination: { total: 48, page: 1, perPage: 20 },
    initialSearch: '',
  },
};

export const SearchResult: Story = {
  name: 'Search result — filtered by "alex"',
  args: {
    events: mockEvents.filter((e) => e.user.includes('alex')),
    pagination: { total: 7, page: 1, perPage: 20 },
    initialSearch: 'alex',
  },
};

export const Empty: Story = {
  name: 'Empty state — no events',
  args: {
    events: [],
    pagination: { total: 0, page: 1, perPage: 20 },
    initialSearch: '',
  },
};
