import React, { useRef, useEffect } from 'react';
import type { Decorator } from '@storybook/nextjs-vite';
import DashboardLayoutClient from '../app/(dashboard)/DashboardLayoutClient';

const mockUser = {
  id: 'demo-1',
  name: 'Alex Johnson',
  email: 'alex@demo.example.com',
  image: null as string | null,
};

function useInterceptLinks(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href && href.startsWith('/')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener('click', handler, true);
    return () => el.removeEventListener('click', handler, true);
  }, [ref]);
}

/**
 * Page-level decorator that wraps the story in the full dashboard shell
 * (sidebar, header, nav). Use only in pages/ stories.
 */
export const withDashboardLayout: Decorator = (Story) => {
  const ref = useRef<HTMLDivElement>(null);
  useInterceptLinks(ref);
  return (
    <div ref={ref}>
      <DashboardLayoutClient user={mockUser}>
        <div className="p-6">
          <Story />
        </div>
      </DashboardLayoutClient>
    </div>
  );
};
