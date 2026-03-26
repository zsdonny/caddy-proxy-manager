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
    const textarea = canvas.getByRole('textbox');
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
    const textarea = canvas.getByRole('textbox');
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
    const textarea = canvas.getByRole('textbox');
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
