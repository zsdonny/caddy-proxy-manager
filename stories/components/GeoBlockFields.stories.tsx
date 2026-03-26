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

/** Scope queries to the visible (active) Block Rules tab panel. */
function activeTabPanel(canvasElement: HTMLElement) {
  const panel = canvasElement.querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]');
  if (!panel) throw new Error('No active tab panel found');
  return within(panel);
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
  name: '▶ Rejects bare IP in CIDRs field',
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
    const canvas = activeTabPanel(canvasElement);

    // Find the CIDRs input by its placeholder
    const cidrInput = await canvas.findByPlaceholderText('10.0.0.0/8…');

    // Type a bare IP (missing /mask) and press Enter
    await userEvent.clear(cidrInput);
    await userEvent.type(cidrInput, '192.168.1.1{Enter}');

    // Inline error should appear below the field
    await waitFor(() =>
      expect(canvas.getByText(/CIDRs must include \/mask/i)).toBeTruthy()
    );

    // The bare IP should NOT appear as a tag
    const tags = canvasElement.querySelectorAll('[class*="badge"]');
    for (const tag of tags) {
      expect(tag.textContent).not.toContain('192.168.1.1');
    }
  },
};

export const RejectsIpv6BareInCidrField: Story = {
  name: '▶ Rejects :: in CIDRs field',
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
    const canvas = activeTabPanel(canvasElement);

    const cidrInput = await canvas.findByPlaceholderText('10.0.0.0/8…');
    await userEvent.clear(cidrInput);
    await userEvent.type(cidrInput, '::{Enter}');

    await waitFor(() =>
      expect(canvas.getByText(/CIDRs must include \/mask/i)).toBeTruthy()
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
    const canvas = activeTabPanel(canvasElement);

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
  name: '▶ Rejects non-numeric ASN',
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
    const canvas = activeTabPanel(canvasElement);

    const asnInput = await canvas.findByPlaceholderText('13335, 15169…');
    await userEvent.clear(asnInput);
    await userEvent.type(asnInput, 'abc{Enter}');

    await waitFor(() =>
      expect(canvas.getByText(/ASN must be a number/i)).toBeTruthy()
    );
  },
};

export const RejectsCidrInIpField: Story = {
  name: '▶ Rejects CIDR in IP field',
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
    const canvas = activeTabPanel(canvasElement);

    const ipInput = await canvas.findByPlaceholderText('1.2.3.4…');
    await userEvent.clear(ipInput);
    await userEvent.type(ipInput, '10.0.0.0/8{Enter}');

    await waitFor(() =>
      expect(canvas.getByText(/use the CIDRs field for ranges/i)).toBeTruthy()
    );
  },
};

export const DisabledWithData: Story = {
  name: 'Disabled — settings preserved',
  args: {
    initialValues: {
      geoblock: {
        enabled: false,
        block_countries: ['CN', 'RU'],
        block_continents: ['AS'],
        block_asns: [13335],
        block_cidrs: ['192.168.1.0/24'],
        block_ips: ['1.2.3.4'],
        allow_countries: ['US'],
        allow_continents: [],
        allow_asns: [],
        allow_cidrs: ['10.0.0.0/8'],
        allow_ips: [],
      },
      geoblock_mode: 'override',
    },
  },
};

export const ToggleOffOnPreservesCidrs: Story = {
  name: '▶ Toggle off → on preserves CIDRs & countries',
  args: {
    initialValues: {
      geoblock: {
        enabled: true,
        block_countries: ['CN'],
        block_continents: [],
        block_asns: [],
        block_cidrs: ['192.168.1.0/24'],
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
    const toggle = canvas.getByRole('switch');

    // Verify CIDR tag is visible while enabled
    const panel = activeTabPanel(canvasElement);
    expect(panel.getByText('192.168.1.0/24')).toBeTruthy();

    // Toggle OFF
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());

    // Toggle back ON
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());

    // CIDR tag should still be there
    const panelAfter = activeTabPanel(canvasElement);
    expect(panelAfter.getByText('192.168.1.0/24')).toBeTruthy();

    // Country hidden input should still carry CN
    const hiddenInput = canvasElement.querySelector<HTMLInputElement>(
      'input[name="geoblock_block_countries"]'
    );
    expect(hiddenInput?.value).toContain('CN');
  },
};

export const ToggleOffOnPreservesCustomResponse: Story = {
  name: '▶ Toggle off → on preserves response body',
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
        response_status: 451,
        response_body: 'Access denied from your region.',
      },
      geoblock_mode: 'merge',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch');

    // Open the nested "Trusted Proxies & Block Response" accordion
    const advancedTrigger = canvas.getByText('Trusted Proxies & Block Response');
    await userEvent.click(advancedTrigger);

    // Verify initial values are present
    await waitFor(() => {
      const statusInput = canvasElement.querySelector<HTMLInputElement>(
        'input[name="geoblock_response_status"]'
      );
      expect(statusInput?.value).toBe('451');
    });

    // Toggle OFF then ON
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());

    // Re-open accordion (may have stayed open via CSS-only collapse)
    const advancedTriggerAfter = canvas.getByText('Trusted Proxies & Block Response');
    await userEvent.click(advancedTriggerAfter);

    // Values should persist after toggle cycle
    await waitFor(() => {
      const statusInput = canvasElement.querySelector<HTMLInputElement>(
        'input[name="geoblock_response_status"]'
      );
      expect(statusInput?.value).toBe('451');

      const bodyInput = canvasElement.querySelector<HTMLInputElement>(
        'input[name="geoblock_response_body"]'
      );
      expect(bodyInput?.value).toBe('Access denied from your region.');
    });
  },
};
