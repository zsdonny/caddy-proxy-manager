import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect, waitFor } from 'storybook/test';
import { GeoBlockFields } from '../../src/components/proxy-hosts/GeoBlockFields';

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof GeoBlockFields> = {
  title: 'Components/GeoBlockFields',
  component: GeoBlockFields,
  tags: ['autodocs'],
  beforeEach: () => {
    const orig = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes('/api/geoip-status')) {
        return Promise.resolve(json({ country: true, asn: true }));
      }
      return orig(input, init);
    };
    return () => { window.fetch = orig; };
  },
  decorators: [
    (Story) => (
      <form onSubmit={(e) => e.preventDefault()} className="max-w-2xl p-4">
        <Story />
      </form>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof GeoBlockFields>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: 'Default (disabled)',
  args: {},
};

export const Enabled: Story = {
  name: 'Enabled with data',
  args: {
    initialValues: {
      geoblock: {
        enabled: true,
        block_countries: ['CN', 'RU'],
        block_continents: [],
        block_asns: [13335],
        block_cidrs: ['10.0.0.0/8'],
        block_ips: ['1.2.3.4'],
        allow_countries: ['US'],
        allow_continents: [],
        allow_asns: [],
        allow_cidrs: ['192.168.0.0/16'],
        allow_ips: [],
      },
      geoblock_mode: 'merge',
    },
  },
};

export const L4Mode: Story = {
  name: 'L4 mode (hide advanced)',
  args: {
    hideAdvanced: true,
    initialValues: {
      geoblock: {
        enabled: true,
        block_countries: [],
        block_continents: ['AS'],
        block_asns: [],
        block_cidrs: ['0.0.0.0/0'],
        block_ips: [],
        allow_countries: [],
        allow_continents: [],
        allow_asns: [],
        allow_cidrs: ['192.168.1.0/24'],
        allow_ips: [],
      },
      geoblock_mode: 'override',
    },
  },
};

// ── Interaction tests ─────────────────────────────────────────────────────────

export const RejectsBareIpInCidrField: Story = {
  name: '▶ Rejects bare IP in CIDRs field (toast)',
  args: {
    initialValues: {
      geoblock: {
        enabled: true,
        block_countries: [],
        block_continents: [],
        block_asns: [],
        block_cidrs: [],
        block_ips: [],
        allow_countries: [],
        allow_continents: [],
        allow_asns: [],
        allow_cidrs: [],
        allow_ips: [],
      },
      geoblock_mode: 'merge',
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const canvas = within(canvasElement);

    // Find the CIDRs input by its placeholder
    const cidrInput = await canvas.findByPlaceholderText('10.0.0.0/8…');

    // Type a bare IP (missing /mask) and press Enter
    await userEvent.clear(cidrInput);
    await userEvent.type(cidrInput, '192.168.1.1{Enter}');

    // Toast should appear with the error message
    await waitFor(() =>
      expect(body.getByText(/CIDRs must include \/mask/i)).toBeTruthy()
    );

    // The bare IP should NOT appear as a tag
    const tags = canvasElement.querySelectorAll('[class*="badge"]');
    for (const tag of tags) {
      expect(tag.textContent).not.toContain('192.168.1.1');
    }
  },
};

export const RejectsIpv6BareInCidrField: Story = {
  name: '▶ Rejects :: in CIDRs field (toast)',
  args: {
    initialValues: {
      geoblock: {
        enabled: true,
        block_countries: [],
        block_continents: [],
        block_asns: [],
        block_cidrs: [],
        block_ips: [],
        allow_countries: [],
        allow_continents: [],
        allow_asns: [],
        allow_cidrs: [],
        allow_ips: [],
      },
      geoblock_mode: 'merge',
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const canvas = within(canvasElement);

    const cidrInput = await canvas.findByPlaceholderText('10.0.0.0/8…');
    await userEvent.clear(cidrInput);
    await userEvent.type(cidrInput, '::{Enter}');

    await waitFor(() =>
      expect(body.getByText(/CIDRs must include \/mask/i)).toBeTruthy()
    );
  },
};

export const AcceptsValidCidr: Story = {
  name: '▶ Accepts valid CIDR (tag added)',
  args: {
    initialValues: {
      geoblock: {
        enabled: true,
        block_countries: [],
        block_continents: [],
        block_asns: [],
        block_cidrs: [],
        block_ips: [],
        allow_countries: [],
        allow_continents: [],
        allow_asns: [],
        allow_cidrs: [],
        allow_ips: [],
      },
      geoblock_mode: 'merge',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const cidrInput = await canvas.findByPlaceholderText('10.0.0.0/8…');
    await userEvent.clear(cidrInput);
    await userEvent.type(cidrInput, '10.0.0.0/8{Enter}');

    // Tag should appear
    await waitFor(() =>
      expect(canvas.getByText('10.0.0.0/8')).toBeTruthy()
    );
  },
};

export const RejectsInvalidAsn: Story = {
  name: '▶ Rejects non-numeric ASN (toast)',
  args: {
    initialValues: {
      geoblock: {
        enabled: true,
        block_countries: [],
        block_continents: [],
        block_asns: [],
        block_cidrs: [],
        block_ips: [],
        allow_countries: [],
        allow_continents: [],
        allow_asns: [],
        allow_cidrs: [],
        allow_ips: [],
      },
      geoblock_mode: 'merge',
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const canvas = within(canvasElement);

    const asnInput = await canvas.findByPlaceholderText('13335, 15169…');
    await userEvent.clear(asnInput);
    await userEvent.type(asnInput, 'abc{Enter}');

    await waitFor(() =>
      expect(body.getByText(/ASN must be a number/i)).toBeTruthy()
    );
  },
};

export const RejectsCidrInIpField: Story = {
  name: '▶ Rejects CIDR in IP field (toast)',
  args: {
    initialValues: {
      geoblock: {
        enabled: true,
        block_countries: [],
        block_continents: [],
        block_asns: [],
        block_cidrs: [],
        block_ips: [],
        allow_countries: [],
        allow_continents: [],
        allow_asns: [],
        allow_cidrs: [],
        allow_ips: [],
      },
      geoblock_mode: 'merge',
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const canvas = within(canvasElement);

    const ipInput = await canvas.findByPlaceholderText('1.2.3.4…');
    await userEvent.clear(ipInput);
    await userEvent.type(ipInput, '10.0.0.0/8{Enter}');

    await waitFor(() =>
      expect(body.getByText(/use the CIDRs field for ranges/i)).toBeTruthy()
    );
  },
};
