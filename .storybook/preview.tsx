import type { Preview } from '@storybook/nextjs-vite';
import '../app/globals.css';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import DashboardLayoutClient from '../app/(dashboard)/DashboardLayoutClient';

const mockUser = {
  id: 'demo-1',
  name: 'Alex Johnson',
  email: 'alex@demo.example.com',
  image: null as string | null,
};

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
      },
    },
  },
  decorators: [
    (Story, context) => {
      const pathname = context.parameters?.nextjs?.navigation?.pathname ?? '/';
      return (
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
          <TooltipProvider>
            <DashboardLayoutClient user={mockUser}>
              <div className="p-6">
                <Story />
              </div>
            </DashboardLayoutClient>
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      );
    },
  ],
};

export default preview;
