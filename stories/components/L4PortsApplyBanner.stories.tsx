import React, { useState, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { within } from 'storybook/test';
import { L4PortsApplyBanner } from '../../src/components/l4-proxy-hosts/L4PortsApplyBanner';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function suppressCaddyEvents() {
  const orig = window.dispatchEvent.bind(window);
  window.dispatchEvent = (e: Event) => {
    if (e.type === 'caddy-reconnect-expected' || e.type === 'caddy-reconnect-recovered') return true;
    return orig(e);
  };
  return () => { window.dispatchEvent = orig; };
}

const meta: Meta = {
  title: 'Components/L4PortsApplyBanner',
  tags: ['autodocs'],
};
export default meta;

export const Pending: StoryObj = {
  name: 'Pending — ports need apply',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /apply ports/i });
  },
  beforeEach: () => {
    const orig = window.fetch;
    window.fetch = () => Promise.resolve(json({
      diff: { currentPorts: [':25565/tcp'], requiredPorts: [':25565/tcp', ':5353/udp'], needsApply: true },
      status: { state: 'idle' },
      networkMode: 'bridge',
    }));
    return () => { window.fetch = orig; };
  },
  render: () => <L4PortsApplyBanner />,
};

export const Applying: StoryObj = {
  name: 'Applying — spinner + polling',
  beforeEach: () => {
    const cleanupEvents = suppressCaddyEvents();
    const orig = window.fetch;
    window.fetch = () => Promise.resolve(json({
      diff: { currentPorts: [], requiredPorts: [':25565/tcp', ':5353/udp', ':587/tcp'], needsApply: true },
      status: { state: 'applying', message: 'Recreating caddy container…' },
      networkMode: 'bridge',
    }));
    return () => { window.fetch = orig; cleanupEvents(); };
  },
  render: () => <L4PortsApplyBanner />,
};

export const Applied: StoryObj = {
  name: 'Applied — success state',
  beforeEach: () => {
    const orig = window.fetch;
    window.fetch = () => Promise.resolve(json({
      diff: { currentPorts: [':25565/tcp', ':5353/udp'], requiredPorts: [':25565/tcp', ':5353/udp'], needsApply: true },
      status: { state: 'applied', message: 'Ports applied successfully.' },
      networkMode: 'bridge',
    }));
    return () => { window.fetch = orig; };
  },
  render: () => <L4PortsApplyBanner />,
};

export const Failed: StoryObj = {
  name: 'Failed — error state',
  beforeEach: () => {
    const orig = window.fetch;
    window.fetch = () => Promise.resolve(json({
      diff: { currentPorts: [], requiredPorts: [':25565/tcp'], needsApply: true },
      status: { state: 'failed', message: 'Apply failed.', error: 'docker: port 25565 already in use' },
      networkMode: 'bridge',
    }));
    return () => { window.fetch = orig; };
  },
  render: () => <L4PortsApplyBanner />,
};

let mockPhase: 'idle' | 'applying' | 'applied' = 'idle';
let triggerRefresh: (() => void) | null = null;

function InteractiveApplyBanner() {
  const [signal, setSignal] = useState(0);

  useEffect(() => {
    triggerRefresh = () => setSignal((s) => s + 1);
    return () => { triggerRefresh = null; };
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Click <strong>Apply Ports</strong> — the banner animates through
        idle → applying → applied.
      </p>
      <L4PortsApplyBanner refreshSignal={signal} />
    </div>
  );
}

export const Interactive: StoryObj = {
  name: '▶ Interactive — click to apply',
  beforeEach: () => {
    const cleanupEvents = suppressCaddyEvents();
    mockPhase = 'idle';
    triggerRefresh = null;
    const orig = window.fetch;

    window.fetch = (_url: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();

      if (method === 'POST') {
        mockPhase = 'applying';
        setTimeout(() => {
          mockPhase = 'applied';
          triggerRefresh?.();
        }, 3000);
        return Promise.resolve(json({ ok: true }));
      }

      if (mockPhase === 'applying') {
        return Promise.resolve(json({
          diff: { currentPorts: [':25565/tcp'], requiredPorts: [':25565/tcp', ':5353/udp'], needsApply: true },
          status: { state: 'applying', message: 'Recreating caddy container…' },
          networkMode: 'bridge',
        }));
      }
      if (mockPhase === 'applied') {
        return Promise.resolve(json({
          diff: { currentPorts: [':25565/tcp', ':5353/udp'], requiredPorts: [':25565/tcp', ':5353/udp'], needsApply: true },
          status: { state: 'applied', message: 'Ports applied successfully.' },
          networkMode: 'bridge',
        }));
      }
      return Promise.resolve(json({
        diff: { currentPorts: [':25565/tcp'], requiredPorts: [':25565/tcp', ':5353/udp'], needsApply: true },
        status: { state: 'idle' },
        networkMode: 'bridge',
      }));
    };
    return () => { window.fetch = orig; cleanupEvents(); };
  },
  render: () => <InteractiveApplyBanner />,
};
