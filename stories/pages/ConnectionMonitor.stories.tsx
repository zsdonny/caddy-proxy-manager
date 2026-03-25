import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ConnectionMonitor } from '../../src/components/ui/ConnectionMonitor';
import { withDashboardLayout } from '../decorators';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const meta: Meta = {
  title: 'Pages/Connection Monitor',
  decorators: [withDashboardLayout],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
  },
};
export default meta;

function OfflineWrapper() {
  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new Event('caddy-reconnect-expected'));
    }, 400);
    return () => clearTimeout(t);
  }, []);
  return <ConnectionMonitor />;
}

export const Offline: StoryObj = {
  name: 'Offline — full-screen overlay',
  beforeEach: () => {
    const orig = window.fetch;
    window.fetch = () => { throw new Error('no server'); };
    return () => { window.fetch = orig; };
  },
  render: () => <OfflineWrapper />,
};

let healthShouldFail = false;

function InteractiveWrapper() {
  return (
    <div className="space-y-4">
      <button
        className="text-xs px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary/10 transition-colors"
        onClick={() => {
          healthShouldFail = true;
          window.dispatchEvent(new Event('caddy-reconnect-expected'));
        }}
      >
        Trigger Caddy Restart
      </button>

      {createPortal(
        <button
          className="fixed top-4 right-4 z-[10000] text-xs px-3 py-1.5 rounded bg-card border border-border shadow-lg hover:bg-muted transition-colors cursor-pointer"
          style={{ fontFamily: 'inherit' }}
          onClick={() => { healthShouldFail = false; }}
        >
          Resume connection
        </button>,
        document.body
      )}

      <ConnectionMonitor />
    </div>
  );
}

export const ExpectedRestart: StoryObj = {
  name: '▶ Interactive — Caddy restart',
  beforeEach: () => {
    const orig = window.fetch;
    healthShouldFail = false;
    window.fetch = () => {
      if (healthShouldFail) return Promise.reject(new Error('server restarting'));
      return Promise.resolve(json({ status: 'ok' }));
    };
    return () => { window.fetch = orig; healthShouldFail = false; };
  },
  render: () => <InteractiveWrapper />,
};
