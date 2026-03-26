import React, { useState, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { L4PortsApplyBanner } from '../../src/components/l4-proxy-hosts/L4PortsApplyBanner';
import { withDashboardLayout } from '../decorators';

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
  title: 'Pages/L4 Apply Banner',
  decorators: [withDashboardLayout],
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/l4-proxy-hosts' } },
  },
};
export default meta;

export const Pending: StoryObj = {
  name: 'Pending — ports need apply',
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

let mockPhase: 'idle' | 'applying' | 'applied' = 'idle';
let triggerRefresh: (() => void) | null = null;

function InteractiveApplyBanner() {
  const [signal, setSignal] = useState(0);

  useEffect(() => {
    triggerRefresh = () => setSignal((s) => s + 1);
    return () => { triggerRefresh = null; };
  }, []);

  return <L4PortsApplyBanner refreshSignal={signal} />;
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

export const Applying: StoryObj = {
  name: 'Applying — spinner visible',
  beforeEach: () => {
    const cleanupEvents = suppressCaddyEvents();
    const orig = window.fetch;
    window.fetch = () => Promise.resolve(json({
      diff: { currentPorts: [':25565/tcp'], requiredPorts: [':25565/tcp', ':5353/udp'], needsApply: true },
      status: { state: 'applying', message: 'Recreating caddy container…' },
      networkMode: 'bridge',
    }));
    return () => { window.fetch = orig; cleanupEvents(); };
  },
  render: () => <L4PortsApplyBanner />,
};
