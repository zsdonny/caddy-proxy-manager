import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within, expect, waitFor } from 'storybook/test';
import { RuleLibraryTab } from '../../src/components/waf/RuleLibraryTab';
import type { RuleSetItem } from '../../src/components/waf/RuleSetDialog';

const meta: Meta<typeof RuleLibraryTab> = {
  title: 'Components/RuleLibraryTab',
  component: RuleLibraryTab,
  tags: ['autodocs'],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/waf' } },
  },
};
export default meta;
type Story = StoryObj<typeof RuleLibraryTab>;

const mockRuleSets: RuleSetItem[] = [
  {
    id: 1,
    name: 'WordPress Relaxation',
    description: 'Relaxes OWASP CRS rules that commonly block WordPress admin, REST API, and media uploads.',
    directives: 'SecRuleRemoveById 941100 941160 942100\nSecRule REQUEST_URI "@beginsWith /wp-admin/" "id:70001,phase:1,ctl:ruleEngine=Off,nolog"',
    isPreset: true,
    createdAt: '2026-03-27T00:00:00Z',
    updatedAt: '2026-03-27T00:00:00Z',
  },
  {
    id: 2,
    name: 'Django / Python API',
    description: 'Relaxes rules triggered by Django REST Framework and Python API patterns.',
    directives: 'SecRuleRemoveById 920420\nSecRule REQUEST_HEADERS:Content-Type "@rx ^application/json" "id:70010,phase:1,ctl:requestBodyProcessor=JSON,nolog"',
    isPreset: true,
    createdAt: '2026-03-27T00:00:00Z',
    updatedAt: '2026-03-27T00:00:00Z',
  },
  {
    id: 3,
    name: 'My Custom Rules',
    description: 'Block scanners and enforce custom policies for my apps.',
    directives: 'SecRule REQUEST_HEADERS:User-Agent "@contains leakix" "id:60001,phase:1,deny,status:403,log"',
    isPreset: false,
    createdAt: '2026-03-25T10:30:00Z',
    updatedAt: '2026-03-26T14:00:00Z',
  },
];

export const WithRuleSets: Story = {
  name: 'With presets and custom rule sets',
  args: {
    ruleSets: mockRuleSets,
  },
};

export const Empty: Story = {
  name: 'Empty — no rule sets',
  args: {
    ruleSets: [],
  },
};

export const PresetsOnly: Story = {
  name: 'Presets only (no custom)',
  args: {
    ruleSets: mockRuleSets.filter((rs) => rs.isPreset),
  },
};
