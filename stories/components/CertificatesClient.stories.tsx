import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect } from 'storybook/test';
import CertificatesClient from '../../app/(dashboard)/certificates/CertificatesClient';
import type {
  AcmeHost,
  ImportedCertView,
  ManagedCertView,
  CaCertificateView,
} from '../../app/(dashboard)/certificates/page';

const meta: Meta<typeof CertificatesClient> = {
  title: 'Components/CertificatesClient',
  component: CertificatesClient,
  tags: ['autodocs'],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/certificates' } },
  },
};
export default meta;
type Story = StoryObj<typeof CertificatesClient>;

// ── Mock data ───────────────────────────────────────────────────────────────

const mockAcmeHosts: AcmeHost[] = [
  {
    id: 1,
    name: 'app.example.com',
    domains: ['app.example.com'],
    ssl_forced: true,
    enabled: true,
    certValidFrom: '2026-01-01T00:00:00Z',
    certValidTo: '2026-04-01T00:00:00Z',
    certIssuer: "Let's Encrypt",
    certExpiryStatus: 'ok',
  },
  {
    id: 2,
    name: 'api.example.com',
    domains: ['api.example.com', 'api-v2.example.com'],
    ssl_forced: true,
    enabled: true,
    certValidFrom: '2025-12-01T00:00:00Z',
    certValidTo: '2026-03-27T00:00:00Z',
    certIssuer: "Let's Encrypt",
    certExpiryStatus: 'expiring_soon',
  },
  {
    id: 3,
    name: 'legacy.example.com',
    domains: ['legacy.example.com'],
    ssl_forced: false,
    enabled: true,
    certValidFrom: '2025-06-01T00:00:00Z',
    certValidTo: '2025-09-01T00:00:00Z',
    certIssuer: 'ZeroSSL',
    certExpiryStatus: 'expired',
  },
  {
    id: 4,
    name: 'staging.example.com',
    domains: ['staging.example.com'],
    ssl_forced: true,
    enabled: false,
    certValidFrom: null,
    certValidTo: null,
    certIssuer: null,
    certExpiryStatus: null,
  },
];

const mockImportedCerts: ImportedCertView[] = [
  {
    id: 10,
    name: 'Corporate Wildcard',
    domains: ['*.corp.example.com'],
    validFrom: '2025-01-01T00:00:00Z',
    validTo: '2027-01-01T00:00:00Z',
    issuer: 'DigiCert',
    expiryStatus: 'ok',
    usedBy: [
      { id: 5, name: 'internal.corp.example.com', domains: ['internal.corp.example.com'] },
    ],
  },
  {
    id: 11,
    name: 'Old Dev Cert',
    domains: ['dev.example.com'],
    validFrom: '2024-01-01T00:00:00Z',
    validTo: '2025-01-15T00:00:00Z',
    issuer: 'Self-signed',
    expiryStatus: 'expired',
    usedBy: [],
  },
];

const mockManagedCerts: ManagedCertView[] = [];

const mockCaCerts: CaCertificateView[] = [
  {
    id: 1,
    name: 'Internal Services CA',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    issuedCerts: [
      {
        id: 1,
        ca_certificate_id: 1,
        common_name: 'dev-laptop (Alice)',
        serial_number: 'A1B2C3D4E5F6',
        fingerprint_sha256: 'AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899',
        certificate_pem: '-----BEGIN CERTIFICATE-----\nMIIBfake...\n-----END CERTIFICATE-----',
        valid_from: '2026-02-01T00:00:00Z',
        valid_to: '2027-02-01T00:00:00Z',
        revoked_at: null,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
      {
        id: 2,
        ca_certificate_id: 1,
        common_name: 'ci-runner',
        serial_number: 'F6E5D4C3B2A1',
        fingerprint_sha256: 'FFEEDDCCBBAA11223344556677889900FFEEDDCCBBAA11223344556677889900',
        certificate_pem: '-----BEGIN CERTIFICATE-----\nMIIBfake2...\n-----END CERTIFICATE-----',
        valid_from: '2026-01-15T00:00:00Z',
        valid_to: '2027-01-15T00:00:00Z',
        revoked_at: '2026-03-01T00:00:00Z',
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      },
    ],
  },
];

// ── Stories ─────────────────────────────────────────────────────────────────

export const AllTabs: Story = {
  name: 'ACME — healthy, expiring, expired certs',
  args: {
    acmeHosts: mockAcmeHosts,
    importedCerts: mockImportedCerts,
    managedCerts: mockManagedCerts,
    caCertificates: mockCaCerts,
    acmePagination: { total: 4, page: 1, perPage: 25 },
  },
};

export const AcmeOnly: Story = {
  name: 'ACME — all healthy',
  args: {
    acmeHosts: [
      {
        id: 1,
        name: 'app.example.com',
        domains: ['app.example.com'],
        ssl_forced: true,
        enabled: true,
        certValidFrom: '2026-01-01T00:00:00Z',
        certValidTo: '2026-04-01T00:00:00Z',
        certIssuer: "Let's Encrypt",
        certExpiryStatus: 'ok',
      },
      {
        id: 2,
        name: 'api.example.com',
        domains: ['api.example.com'],
        ssl_forced: true,
        enabled: true,
        certValidFrom: '2026-01-15T00:00:00Z',
        certValidTo: '2026-04-15T00:00:00Z',
        certIssuer: "Let's Encrypt",
        certExpiryStatus: 'ok',
      },
    ],
    importedCerts: [],
    managedCerts: [],
    caCertificates: [],
    acmePagination: { total: 2, page: 1, perPage: 25 },
  },
};

export const WithMtls: Story = {
  name: '▶ Interactive — navigate to CA/mTLS tab',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Click the CA / mTLS tab to reveal the CA certificate list
    const caTab = await canvas.findByRole('tab', { name: /CA/i });
    await userEvent.click(caTab);
    // Desktop table + mobile card both render the CA name, so use findAllByText
    const matches = await canvas.findAllByText('Internal Services CA');
    await expect(matches.length).toBeGreaterThan(0);
  },
  args: {
    acmeHosts: mockAcmeHosts.slice(0, 1),
    importedCerts: [],
    managedCerts: [],
    caCertificates: mockCaCerts,
    acmePagination: { total: 1, page: 1, perPage: 25 },
  },
};

export const Empty: Story = {
  name: 'Empty state — no certs yet',
  args: {
    acmeHosts: [],
    importedCerts: [],
    managedCerts: [],
    caCertificates: [],
    acmePagination: { total: 0, page: 1, perPage: 25 },
  },
};
