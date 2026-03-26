import React from 'react';
import type { Preview } from '@storybook/nextjs-vite';
import { themes } from 'storybook/theming';
import { DocsContainer } from '@storybook/addon-docs/blocks';
import '../app/globals.css';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';

const preview: Preview = {
  globalTypes: {
    theme: {
      name: 'Theme',
      defaultValue: 'dark',
      toolbar: {
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark',  title: 'Dark',  icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: 'padded',
    docs: {
      theme: themes.dark,
      container: (props: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = props.context as any;
        const theme = ctx?.store?.globals?.globals?.theme
          ?? ctx?.store?.userGlobals?.globals?.theme
          ?? ctx?.globals?.theme
          ?? 'dark';
        const docsTheme = theme === 'light' ? themes.light : themes.dark;
        return React.createElement(DocsContainer, { ...props, theme: docsTheme });
      },
    },
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/' },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals as { theme?: string }).theme ?? 'dark';
      document.documentElement.classList.toggle('dark', theme === 'dark');
      return React.createElement(
        ThemeProvider,
        { attribute: 'class', forcedTheme: theme },
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(Story),
          React.createElement(Toaster, { richColors: true, position: 'bottom-right' })
        )
      );
    },
  ],
};

export default preview;