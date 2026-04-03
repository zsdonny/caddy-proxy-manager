import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect } from 'storybook/test';
import { AuthentikFields } from '../../src/components/proxy-hosts/AuthentikFields';

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof AuthentikFields> = {
  title: 'Components/AuthentikFields',
  component: AuthentikFields,
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
type Story = StoryObj<typeof AuthentikFields>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: 'Default (disabled)',
  args: {},
};

export const Enabled: Story = {
  name: 'Enabled — full config, no path restrictions',
  args: {
    authentik: {
      enabled: true,
      outpostDomain: 'outpost.goauthentik.io',
      outpostUpstream: 'https://authentik:9000',
      authEndpoint: '/outpost.goauthentik.io/auth/caddy',
      copyHeaders: [
        'X-Authentik-Username',
        'X-Authentik-Groups',
        'X-Authentik-Entitlements',
        'X-Authentik-Email',
        'X-Authentik-Name',
        'X-Authentik-Uid',
        'X-Authentik-Jwt',
        'X-Authentik-Meta-Jwks',
        'X-Authentik-Meta-Outpost',
        'X-Authentik-Meta-Provider',
        'X-Authentik-Meta-App',
        'X-Authentik-Meta-Version',
      ],
      trustedProxies: ['private_ranges'],
      setOutpostHostHeader: true,
      protectedPaths: null,
      excludedPaths: null,
    },
  },
};

export const WithProtectedPaths: Story = {
  name: 'Protected Paths set — Excluded Paths disabled',
  args: {
    authentik: {
      enabled: true,
      outpostDomain: 'outpost.goauthentik.io',
      outpostUpstream: 'https://authentik:9000',
      authEndpoint: '/outpost.goauthentik.io/auth/caddy',
      copyHeaders: [
        'X-Authentik-Username',
        'X-Authentik-Groups',
        'X-Authentik-Email',
      ],
      trustedProxies: ['private_ranges'],
      setOutpostHostHeader: true,
      protectedPaths: ['/admin/*', '/dashboard/*', '/settings/*'],
      excludedPaths: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Protected Paths textarea should have content
    const protectedPathsTextarea = canvas.getByPlaceholderText('/secret/*, /admin/*');
    await expect(protectedPathsTextarea).not.toBeDisabled();

    // Excluded Paths textarea should be disabled because Protected Paths has content
    const excludedPathsTextarea = canvas.getByPlaceholderText('/share/*, /api/public/*');
    await expect(excludedPathsTextarea).toBeDisabled();
  },
};

export const WithExcludedPaths: Story = {
  name: 'Excluded Paths set — Protected Paths disabled',
  args: {
    authentik: {
      enabled: true,
      outpostDomain: 'outpost.goauthentik.io',
      outpostUpstream: 'https://authentik:9000',
      authEndpoint: '/outpost.goauthentik.io/auth/caddy',
      copyHeaders: [
        'X-Authentik-Username',
        'X-Authentik-Groups',
        'X-Authentik-Email',
      ],
      trustedProxies: ['private_ranges'],
      setOutpostHostHeader: true,
      protectedPaths: null,
      excludedPaths: ['/share/*', '/api/public/*'],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Protected Paths textarea should be disabled because Excluded Paths has content
    const protectedPathsTextarea = canvas.getByPlaceholderText('/secret/*, /admin/*');
    await expect(protectedPathsTextarea).toBeDisabled();

    // Excluded Paths textarea should have content and be enabled
    const excludedPathsTextarea = canvas.getByPlaceholderText('/share/*, /api/public/*');
    await expect(excludedPathsTextarea).not.toBeDisabled();
  },
};

export const WithDefaults: Story = {
  name: 'With global settings defaults',
  args: {
    defaults: {
      outpostDomain: 'outpost.goauthentik.io',
      outpostUpstream: 'https://authentik.internal:9000',
      authEndpoint: '/outpost.goauthentik.io/auth/caddy',
    },
  },
};

export const MutualExclusivityInteraction: Story = {
  name: 'Interaction — mutual exclusivity enforced',
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Enable the toggle
    const toggle = canvas.getByRole('switch');
    await userEvent.click(toggle);

    // Both textareas should now be enabled (empty)
    const protectedPathsTextarea = canvas.getByPlaceholderText('/secret/*, /admin/*');
    const excludedPathsTextarea = canvas.getByPlaceholderText('/share/*, /api/public/*');
    await expect(protectedPathsTextarea).not.toBeDisabled();
    await expect(excludedPathsTextarea).not.toBeDisabled();

    // Type into Protected Paths — Excluded Paths should become disabled
    await userEvent.type(protectedPathsTextarea, '/admin/*');
    await expect(excludedPathsTextarea).toBeDisabled();

    // Clear Protected Paths — Excluded Paths should re-enable
    await userEvent.clear(protectedPathsTextarea);
    await expect(excludedPathsTextarea).not.toBeDisabled();

    // Type into Excluded Paths — Protected Paths should become disabled
    await userEvent.type(excludedPathsTextarea, '/share/*');
    await expect(protectedPathsTextarea).toBeDisabled();
  },
};
