import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect, waitFor } from 'storybook/test';
import { WafFields } from '../../src/components/proxy-hosts/WafFields';

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof WafFields> = {
  title: 'Components/WafFields',
  component: WafFields,
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
type Story = StoryObj<typeof WafFields>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
  name: 'Default (disabled)',
  args: {},
};

export const EnabledClean: Story = {
  name: 'Enabled — clean directives',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives:
        'SecRule REQUEST_URI "@contains /secret" "id:9001,deny,status:403,log,msg:\'Blocked path\'"',
    },
  },
};

export const UnsupportedDirective: Story = {
  name: 'SecLang error — unsupported directive',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives: 'SecTmpDir /tmp/modsec\nSecRule REQUEST_URI "@contains /ok" "id:9001,allow,nolog"',
    },
  },
};

export const ManagedDirectiveWarning: Story = {
  name: 'SecLang warning — managed directive',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives: 'SecRuleEngine On\nSecRule REQUEST_URI "@contains /ok" "id:9001,allow,nolog"',
    },
  },
};

export const IncludeCorazaConfError: Story = {
  name: 'SecLang error — Include @coraza.conf-recommended',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives: 'Include @coraza.conf-recommended',
    },
  },
};

export const MixedErrorsAndWarnings: Story = {
  name: 'SecLang — mixed errors & warnings',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives: [
        'SecRuleEngine On',
        'SecTmpDir /tmp/modsec',
        'SecRule REQUEST_URI "@contains /ok" "id:9001,allow,nolog"',
        'SecDebugLogLevel 3',
        'SecAuditEngine RelevantOnly',
      ].join('\n'),
    },
  },
};

export const OverrideMode: Story = {
  name: 'Override mode',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: false,
      waf_mode: 'override',
      custom_directives:
        'SecRule REMOTE_ADDR "@ipMatch 10.0.0.0/8" "id:9000,phase:1,allow,nolog"',
    },
  },
};

export const NoModeSelector: Story = {
  name: 'Global settings (no mode selector)',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      custom_directives: '',
    },
    showModeSelector: false,
  },
};

// ── Interactive tests ─────────────────────────────────────────────────────────

export const TypeUnsupportedDirective: Story = {
  name: '▶ Type unsupported directive → error appears',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives: '',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByPlaceholderText(/SecRule REQUEST_URI/i);
    await userEvent.type(textarea, 'SecTmpDir /tmp/modsec');

    await waitFor(() => {
      const errorText = canvasElement.querySelector('.text-red-600');
      expect(errorText).toBeTruthy();
      expect(errorText!.textContent).toContain('not supported by Coraza');
    });
  },
};

export const TypeManagedDirective: Story = {
  name: '▶ Type managed directive → warning appears',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives: '',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByPlaceholderText(/SecRule REQUEST_URI/i);
    await userEvent.type(textarea, 'SecRuleEngine On');

    await waitFor(() => {
      const warningText = canvasElement.querySelector('.text-amber-600');
      expect(warningText).toBeTruthy();
      expect(warningText!.textContent).toContain('managed automatically');
    });
  },
};

export const TypeValidDirective: Story = {
  name: '▶ Type valid directive → no issues',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives: '',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByPlaceholderText(/SecRule REQUEST_URI/i);
    await userEvent.type(
      textarea,
      'SecRule REQUEST_URI "@contains /api" "id:9001,phase:1,ctl:ruleEngine=Off,nolog"'
    );

    // No errors or warnings should appear
    await waitFor(() => {
      expect(canvasElement.querySelector('.text-red-600')).toBeNull();
      expect(canvasElement.querySelector('.text-amber-600')).toBeNull();
    });
  },
};

export const DisabledWithData: Story = {
  name: 'Disabled — settings preserved',
  args: {
    value: {
      enabled: false,
      mode: 'On',
      load_owasp_crs: false,
      waf_mode: 'override',
      custom_directives:
        'SecRule REMOTE_ADDR "@ipMatch 10.0.0.0/8" "id:9000,phase:1,allow,nolog"',
      excluded_rule_ids: [941100, 942100],
    },
  },
};

export const ToggleOffOnPreservesDirectives: Story = {
  name: '▶ Toggle off → on preserves custom directives',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives:
        'SecRule REMOTE_ADDR "@ipMatch 10.0.0.0/8" "id:9000,phase:1,allow,nolog"',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch');

    // Verify directives visible while enabled
    const textarea = canvas.getByPlaceholderText(/SecRule REQUEST_URI/i);
    expect(textarea).toHaveValue(
      'SecRule REMOTE_ADDR "@ipMatch 10.0.0.0/8" "id:9000,phase:1,allow,nolog"'
    );

    // Toggle OFF
    await userEvent.click(toggle);
    await waitFor(() => {
      // Content area should be collapsed
      expect(toggle).not.toBeChecked();
    });

    // Toggle back ON
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toBeChecked();
    });

    // Directives should still be there
    const textareaAfter = canvas.getByPlaceholderText(/SecRule REQUEST_URI/i);
    expect(textareaAfter).toHaveValue(
      'SecRule REMOTE_ADDR "@ipMatch 10.0.0.0/8" "id:9000,phase:1,allow,nolog"'
    );
  },
};

export const ToggleOffOnPreservesEngineMode: Story = {
  name: '▶ Toggle off → on preserves engine mode & CRS',
  args: {
    value: {
      enabled: true,
      mode: 'Off',
      load_owasp_crs: false,
      waf_mode: 'override',
      custom_directives: '',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch');

    // Verify "Override global" mode card is selected (has a distinctive border)
    const overrideCard = canvas.getByText('Override global');
    expect(overrideCard.closest('[class*="border-destructive"]')).toBeTruthy();

    // Toggle OFF then back ON
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());

    // Hidden inputs should still carry the persisted values
    const modeInput = canvasElement.querySelector<HTMLInputElement>('input[name="waf_engine_mode"]');
    expect(modeInput?.value).toBe('Off');

    const crsInput = canvasElement.querySelector<HTMLInputElement>('input[name="waf_load_owasp_crs"]');
    expect(crsInput?.value).toBe('');

    const wafModeInput = canvasElement.querySelector<HTMLInputElement>('input[name="waf_mode"]');
    expect(wafModeInput?.value).toBe('override');
  },
};

export const WithRuleSets: Story = {
  name: 'With Rule Sets selector',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives: '',
      rule_set_ids: [1],
    },
    ruleSets: [
      {
        id: 1,
        name: 'WordPress Relaxation',
        description: 'Relaxes OWASP CRS rules for WordPress admin and REST API.',
        directives: 'SecRuleRemoveById 941100',
        isPreset: true,
        createdAt: '2026-03-27T00:00:00Z',
        updatedAt: '2026-03-27T00:00:00Z',
      },
      {
        id: 2,
        name: 'My Custom Rules',
        description: null,
        directives: 'SecRule ARGS "evil" "id:9001,deny"',
        isPreset: false,
        createdAt: '2026-03-25T10:00:00Z',
        updatedAt: '2026-03-26T12:00:00Z',
      },
    ],
  },
};

export const FocusExpandTextarea: Story = {
  name: '▶ Directives textarea expands on focus',
  args: {
    value: {
      enabled: true,
      mode: 'On',
      load_owasp_crs: true,
      waf_mode: 'merge',
      custom_directives: 'SecRule REQUEST_URI "@contains /api" "id:9001,phase:1,ctl:ruleEngine=Off,nolog"',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByPlaceholderText(/SecRule REQUEST_URI/i);

    // Should start collapsed at 3 rows
    expect(textarea).toHaveAttribute('rows', '3');

    // Focus → should expand to 12 rows
    await userEvent.click(textarea);
    await waitFor(() => {
      expect(textarea).toHaveAttribute('rows', '12');
    });

    // Blur → should collapse back to 3 rows
    await userEvent.tab();
    await waitFor(() => {
      expect(textarea).toHaveAttribute('rows', '3');
    });
  },
};
