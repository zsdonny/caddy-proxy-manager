/**
 * Unit tests for Authentik excluded paths support in src/lib/caddy.ts
 *
 * Covers:
 *  - parseAuthentikConfig: excluded_paths parsed to excludedPaths
 *  - parseAuthentikConfig: excluded paths trimmed and filtered
 *  - parseAuthentikConfig: existing behavior unchanged when neither field is set
 *  - parseAuthentikConfig: protectedPaths and excludedPaths are independent fields
 */
import { describe, it, expect } from 'vitest';
import { parseAuthentikConfig } from '../../src/lib/caddy-authentik';

// ── Shared base meta ──────────────────────────────────────────────────────────

const baseMeta = {
  enabled: true,
  outpost_domain: 'outpost.goauthentik.io',
  outpost_upstream: 'https://authentik:9000',
};

// ── parseAuthentikConfig — excludedPaths ──────────────────────────────────────

describe('parseAuthentikConfig — excludedPaths', () => {
  it('returns excludedPaths null when excluded_paths is absent', () => {
    const config = parseAuthentikConfig(baseMeta);
    expect(config).not.toBeNull();
    expect(config!.excludedPaths).toBeNull();
  });

  it('returns excludedPaths null when excluded_paths is an empty array', () => {
    const config = parseAuthentikConfig({ ...baseMeta, excluded_paths: [] });
    expect(config!.excludedPaths).toBeNull();
  });

  it('parses excluded_paths into excludedPaths array', () => {
    const config = parseAuthentikConfig({
      ...baseMeta,
      excluded_paths: ['/share/*', '/api/public/*'],
    });
    expect(config!.excludedPaths).toEqual(['/share/*', '/api/public/*']);
  });

  it('trims whitespace from individual excluded paths', () => {
    const config = parseAuthentikConfig({
      ...baseMeta,
      excluded_paths: ['  /share/*  ', '/api/public/*  '],
    });
    expect(config!.excludedPaths).toEqual(['/share/*', '/api/public/*']);
  });

  it('filters out blank/empty excluded paths', () => {
    const config = parseAuthentikConfig({
      ...baseMeta,
      excluded_paths: ['/share/*', '', '   ', '/api/public/*'],
    });
    expect(config!.excludedPaths).toEqual(['/share/*', '/api/public/*']);
  });

  it('returns excludedPaths null when all paths are blank after trim', () => {
    const config = parseAuthentikConfig({
      ...baseMeta,
      excluded_paths: ['', '   '],
    });
    expect(config!.excludedPaths).toBeNull();
  });
});

// ── parseAuthentikConfig — protectedPaths unchanged ───────────────────────────

describe('parseAuthentikConfig — protectedPaths behavior unchanged', () => {
  it('returns protectedPaths null when protected_paths is absent', () => {
    const config = parseAuthentikConfig(baseMeta);
    expect(config!.protectedPaths).toBeNull();
  });

  it('parses protected_paths correctly alongside empty excluded_paths', () => {
    const config = parseAuthentikConfig({
      ...baseMeta,
      protected_paths: ['/admin/*'],
      excluded_paths: [],
    });
    expect(config!.protectedPaths).toEqual(['/admin/*']);
    expect(config!.excludedPaths).toBeNull();
  });
});

// ── parseAuthentikConfig — independence of both fields ────────────────────────

describe('parseAuthentikConfig — both fields are independent', () => {
  it('can have both protectedPaths and excludedPaths set (config builder decides precedence)', () => {
    // The parser itself does not enforce mutual exclusivity — that is the UI's responsibility.
    // The route builder applies protectedPaths first; excludedPaths is ignored when protectedPaths is set.
    const config = parseAuthentikConfig({
      ...baseMeta,
      protected_paths: ['/admin/*'],
      excluded_paths: ['/share/*'],
    });
    expect(config!.protectedPaths).toEqual(['/admin/*']);
    expect(config!.excludedPaths).toEqual(['/share/*']);
  });
});

// ── parseAuthentikConfig — null / disabled inputs ─────────────────────────────

describe('parseAuthentikConfig — null/disabled inputs', () => {
  it('returns null when meta is undefined', () => {
    expect(parseAuthentikConfig(undefined)).toBeNull();
  });

  it('returns null when meta is null', () => {
    expect(parseAuthentikConfig(null)).toBeNull();
  });

  it('returns null when enabled is false', () => {
    expect(parseAuthentikConfig({ ...baseMeta, enabled: false })).toBeNull();
  });

  it('returns null when outpost_domain is missing', () => {
    const { outpost_domain: _, ...meta } = baseMeta;
    expect(parseAuthentikConfig(meta)).toBeNull();
  });
});
