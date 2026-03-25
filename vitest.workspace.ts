import { defineWorkspace } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

export default defineWorkspace([
  // Existing unit + integration tests (node environment)
  'tests/vitest.config.ts',

  // Storybook component tests (browser environment via Playwright)
  {
    plugins: [storybookTest({ configDir: '.storybook' })],
    test: {
      name: 'storybook',
      browser: {
        enabled: true,
        headless: true,
        provider: 'playwright',
        instances: [{ browser: 'chromium' }],
      },
      setupFiles: ['.storybook/vitest.setup.ts'],
    },
  },
]);
