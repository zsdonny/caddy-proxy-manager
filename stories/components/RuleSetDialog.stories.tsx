import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RuleSetDialog } from '../../src/components/waf/RuleSetDialog';

const meta: Meta<typeof RuleSetDialog> = {
  title: 'Components/RuleSetDialog',
  component: RuleSetDialog,
  tags: ['autodocs'],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/waf' } },
  },
};
export default meta;
type Story = StoryObj<typeof RuleSetDialog>;

export const CreateEmpty: Story = {
  name: 'Create — empty',
  args: {
    open: true,
    onClose: () => {},
  },
};

export const CreateWithTemplates: Story = {
  name: 'Create — quick templates visible',
  args: {
    open: true,
    onClose: () => {},
  },
};

export const EditCustom: Story = {
  name: 'Edit — custom rule set',
  args: {
    open: true,
    onClose: () => {},
    item: {
      id: 3,
      name: 'My Scanner Blocker',
      description: 'Block known scanner user agents',
      directives: 'SecRule REQUEST_HEADERS:User-Agent "@contains leakix" "id:60001,phase:1,deny,status:403,log"',
      isPreset: false,
      createdAt: '2026-03-25T10:30:00Z',
      updatedAt: '2026-03-26T14:00:00Z',
    },
  },
};

export const EditPreset: Story = {
  name: 'Edit — preset (name read-only)',
  args: {
    open: true,
    onClose: () => {},
    item: {
      id: 1,
      name: 'WordPress Relaxation',
      description: 'Relaxes OWASP CRS rules that commonly block WordPress admin, REST API, and media uploads.',
      directives: 'SecRuleRemoveById 941100 941160 942100\nSecRule REQUEST_URI "@beginsWith /wp-admin/" "id:70001,phase:1,ctl:ruleEngine=Off,nolog"',
      isPreset: true,
      createdAt: '2026-03-27T00:00:00Z',
      updatedAt: '2026-03-27T00:00:00Z',
    },
  },
};
