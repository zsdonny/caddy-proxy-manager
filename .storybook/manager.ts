import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming/create';

/**
 * Brand logo using inline HTML via brandTitle (Storybook renders brandTitle
 * as raw HTML via dangerouslySetInnerHTML when brandImage is null).
 *
 * This gives real CSS font rendering, identical to the shipped app:
 *   h-7 w-7 (28px) rounded-md bg-primary (#7c3aed) with bold white "C"
 *   font-semibold text-sm tracking-tight "Caddy Proxy Manager"
 */
const cpmTheme = create({
  base: 'dark',

  brandTitle: [
    `<div style="display:flex;align-items:center;gap:8px">`,
    `<div style="width:28px;height:28px;background:#7c3aed;border-radius:6px;`,
    `display:flex;align-items:center;justify-content:center;flex-shrink:0">`,
    `<span style="color:white;font-weight:700;font-size:13px;`,
    `font-family:system-ui,-apple-system,sans-serif;line-height:1">C</span></div>`,
    `<span style="font-weight:600;font-size:14px;color:#f3f4f6;`,
    `font-family:system-ui,-apple-system,sans-serif;letter-spacing:-0.025em;`,
    `white-space:nowrap">Caddy Proxy Manager</span></div>`,
  ].join(''),
  brandUrl: '/',
  brandTarget: '_self',
});

addons.setConfig({ theme: cpmTheme });

