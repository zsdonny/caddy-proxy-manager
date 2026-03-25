import type { StorybookConfig } from '@storybook/nextjs-vite';
import type { Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vite plugin that replaces "use server" files with no-op async stubs.
 * Prevents server-only imports (next/server, node:fs, better-sqlite3, etc.)
 * from being pulled into the browser bundle.
 */
function mockServerActions(): Plugin {
  return {
    name: 'storybook-mock-server-actions',
    enforce: 'pre',
    async transform(code, id) {
      // Skip node_modules — only transform app code
      if (id.includes('node_modules')) return;
      const trimmed = code.trimStart();
      if (!trimmed.startsWith('"use server"') && !trimmed.startsWith("'use server'")) return;

      // Extract exported function names and replace with no-op stubs
      const exportedFns = [
        ...code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g),
      ].map((m) => m[1]);

      // Also match: export const NAME = ...
      const exportedConsts = [
        ...code.matchAll(/export\s+const\s+(\w+)/g),
      ].map((m) => m[1]);

      const stubs = [
        ...exportedFns.map(
          (name) => `export async function ${name}() { return { status: "success", message: "Storybook mock" }; }`
        ),
        ...exportedConsts.map(
          (name) => `export const ${name} = { status: "", message: "" };`
        ),
      ];

      return stubs.length > 0 ? stubs.join('\n') : 'export {};';
    },
  };
}

const config: StorybookConfig = {
  stories: [
    "../stories/**/*.mdx",
    "../stories/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  docs: {
    autodocs: true,
  },
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
  viteFinal: async (config) => {
    config.plugins ??= [];
    config.plugins.unshift(mockServerActions());
    config.plugins.push(tsconfigPaths());
    return config;
  },
};
export default config;