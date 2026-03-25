import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import CertificatesClient from '../../app/(dashboard)/certificates/CertificatesClient';
import { withDashboardLayout } from '../decorators';
import type {
  AcmeHost,
  ImportedCertView,
  ManagedCertView,
  CaCertificateView,
} from '../../app/(dashboard)/certificates/page';

const meta: Meta<typeof CertificatesClient> = {
  title: 'Pages/Certificates',
  component: CertificatesClient,
  decorators: [withDashboardLayout],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/certificates' } },
  },
};
export default meta;
type Story = StoryObj<typeof CertificatesClient>;

const acmeHosts: AcmeHost[] = [
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

const importedCerts: ImportedCertView[] = [
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
];

const caCertificates: CaCertificateView[] = [
  {
    id: 1,
    name: 'Internal Services CA',
    certificate_pem: '-----BEGIN CERTIFICATE-----\nMIIBfakeCA...\n-----END CERTIFICATE-----',
    has_private_key: true,
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

export const Default: Story = {
  name: 'Certificates — ACME, imported, CA/mTLS',
  args: {
    acmeHosts,
    importedCerts,
    managedCerts: [] as ManagedCertView[],
    caCertificates,
    acmePagination: { total: 4, page: 1, perPage: 25 },
  },
};
