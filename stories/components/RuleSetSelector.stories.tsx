import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RuleSetSelector } from '../../src/components/waf/RuleSetSelector';
import type { RuleSetItem } from '../../src/components/waf/RuleSetDialog';

const meta: Meta<typeof RuleSetSelector> = {
  title: 'Components/RuleSetSelector',
  component: RuleSetSelector,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <form onSubmit={(e) => e.preventDefault()} className="max-w-md p-4">
        <Story />
      </form>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof RuleSetSelector>;

const mockRuleSets: RuleSetItem[] = [
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
    name: 'Node.js / Express API',
    description: 'Relaxes rules for JSON APIs and common JS framework patterns.',
    directives: 'SecRuleRemoveById 920420',
    isPreset: true,
    createdAt: '2026-03-27T00:00:00Z',
    updatedAt: '2026-03-27T00:00:00Z',
  },
  {
    id: 3,
    name: 'My Scanner Blocker',
    description: null,
    directives: 'SecRule ARGS "evil" "id:9001,deny"',
    isPreset: false,
    createdAt: '2026-03-25T10:00:00Z',
    updatedAt: '2026-03-26T12:00:00Z',
  },
];

export const NoneSelected: Story = {
  name: 'No rule sets selected',
  args: {
    ruleSets: mockRuleSets,
    selected: [],
    onChange: () => {},
  },
};

export const SomeSelected: Story = {
  name: 'Some rule sets selected',
  args: {
    ruleSets: mockRuleSets,
    selected: [1, 3],
    onChange: () => {},
  },
};

export const AllSelected: Story = {
  name: 'All rule sets selected',
  args: {
    ruleSets: mockRuleSets,
    selected: [1, 2, 3],
    onChange: () => {},
    inputName: 'waf_rule_set_ids',
  },
};

export const Empty: Story = {
  name: 'No rule sets available (renders nothing)',
  args: {
    ruleSets: [],
    selected: [],
    onChange: () => {},
  },
};
