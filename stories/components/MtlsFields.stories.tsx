import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect, waitFor } from 'storybook/test';
import { MtlsFields } from '../../src/components/proxy-hosts/MtlsConfig';
import type { CaCertificate } from '../../src/lib/models/ca-certificates';

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_CA_CERTS: CaCertificate[] = [
  {
    id: 1,
    name: 'Internal Root CA',
    certificate_pem: '-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----',
    has_private_key: true,
    created_at: '2026-01-15T12:00:00Z',
    updated_at: '2026-01-15T12:00:00Z',
  },
  {
    id: 2,
    name: 'Partner CA',
    certificate_pem: '-----BEGIN CERTIFICATE-----\nMOCK2\n-----END CERTIFICATE-----',
    has_private_key: false,
    created_at: '2026-02-20T12:00:00Z',
    updated_at: '2026-02-20T12:00:00Z',
  },
  {
    id: 3,
    name: 'Dev Environment CA',
    certificate_pem: '-----BEGIN CERTIFICATE-----\nMOCK3\n-----END CERTIFICATE-----',
    has_private_key: true,
    created_at: '2026-03-01T12:00:00Z',
    updated_at: '2026-03-01T12:00:00Z',
  },
];

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof MtlsFields> = {
  title: 'Components/MtlsFields',
  component: MtlsFields,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl p-4">
        <Story />
      </form>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof MtlsFields>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: 'Default (disabled)',
  args: {
    caCertificates: MOCK_CA_CERTS,
  },
};

export const EnabledWithCerts: Story = {
  name: 'Enabled — two CAs selected',
  args: {
    value: { enabled: true, ca_certificate_ids: [1, 3] },
    caCertificates: MOCK_CA_CERTS,
  },
};

export const NoCaCertificates: Story = {
  name: 'No CA certificates available',
  args: {
    value: null,
    caCertificates: [],
  },
};

export const Disabled: Story = {
  name: 'Disabled by parent (e.g. UDP)',
  args: {
    value: null,
    caCertificates: MOCK_CA_CERTS,
    disabled: true,
    disabledReason: 'mTLS is not available for UDP connections',
  },
};

export const DisabledWithData: Story = {
  name: 'Disabled — CA selections preserved',
  args: {
    value: { enabled: false, ca_certificate_ids: [1, 2] },
    caCertificates: MOCK_CA_CERTS,
  },
};

// ── Interactive tests ─────────────────────────────────────────────────────────

export const ToggleOffOnPreservesCerts: Story = {
  name: '▶ Toggle off → on preserves CA selections',
  args: {
    value: { enabled: true, ca_certificate_ids: [1, 3] },
    caCertificates: MOCK_CA_CERTS,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch');

    // Verify two CAs are checked
    const cert1 = canvas.getByLabelText('Internal Root CA');
    const cert3 = canvas.getByLabelText('Dev Environment CA');
    expect(cert1).toBeChecked();
    expect(cert3).toBeChecked();

    // Toggle OFF
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());

    // Toggle back ON
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());

    // CA selections should be preserved
    const cert1After = canvas.getByLabelText('Internal Root CA');
    const cert3After = canvas.getByLabelText('Dev Environment CA');
    expect(cert1After).toBeChecked();
    expect(cert3After).toBeChecked();

    // Partner CA should still be unchecked
    const cert2 = canvas.getByLabelText('Partner CA');
    expect(cert2).not.toBeChecked();
  },
};

export const HiddenInputsPersistWhenDisabled: Story = {
  name: '▶ Hidden inputs still sent when disabled',
  args: {
    value: { enabled: true, ca_certificate_ids: [2] },
    caCertificates: MOCK_CA_CERTS,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch');

    // Toggle OFF
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());

    // CA cert hidden inputs should still be present (for persistence)
    const certInputs = canvasElement.querySelectorAll<HTMLInputElement>(
      'input[name="mtls_ca_cert_id"]'
    );
    expect(certInputs.length).toBe(1);
    expect(certInputs[0].value).toBe('2');

    // Enabled flag should be false
    const enabledInput = canvasElement.querySelector<HTMLInputElement>(
      'input[name="mtls_enabled"]'
    );
    expect(enabledInput?.value).toBe('false');
  },
};
