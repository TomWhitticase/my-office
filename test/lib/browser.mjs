// Opens the office in headless Chrome with time under our control: Playwright's fake clock drives Date, performance.now,
// timers and requestAnimationFrame, so nothing moves between our steps and every run sees the same frames.
import { chromium } from 'playwright-core';
import { T0 } from './fixtures.mjs';
import { mockRoutes } from './mocks.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const VIEW = { width: 800, height: 500 };
// A desktop Chrome's, not HeadlessChrome's: the office only offers chat to a real browser (see chat.js CAN_CHAT).
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export async function launch() {
  return chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--font-render-hinting=none'] });
}

// Before any page script: a seeded Math.random, settled preferences, and a count of fetches still in flight (so a step
// can wait for whatever it set off to land before the next frame).
function init() {
  let s = 20260617;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Object.assign(localStorage, { officeSound: 'off', officeQuality: 'high', officeOverlays: 'on', officeTimeSpeed: '1' });
  const real = window.fetch;
  window.__inflight = 0;
  window.fetch = async (...a) => {
    window.__inflight++;
    try { const r = await real(...a), b = await r.arrayBuffer(); return new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers }); }
    finally { window.__inflight--; }
  };
}

export async function openOffice(browser, base, { errors = [] } = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, timezoneId: 'Europe/London', locale: 'en-GB', reducedMotion: 'no-preference', userAgent: UA });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(init);
  await mockRoutes(page, base);
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.goto(base + '/');
  await page.waitForFunction(() => window.__office && window.dash?.state && window.dash.office, null, { timeout: 120000 });
  await idle(page);
  const o = { page, ctx, step: (n = 1, ms = 50) => step(page, n, ms), idle: () => idle(page), eval: (fn, arg) => page.evaluate(fn, arg) };
  return o;
}

// Fetches in flight have landed and their handlers have run (a few real macrotasks, which the fake clock doesn't touch).
export async function idle(page) {
  await page.waitForFunction(() => window.__inflight === 0, null, { timeout: 60000, polling: 50 });
  await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); }); });
}

// n frames, `ms` of sim time apart: each fast-forward fires the pending requestAnimationFrame once (and any due timers).
export async function step(page, n = 1, ms = 50) {
  for (let i = 0; i < n; i++) {
    await page.clock.fastForward(ms);
    await idle(page);
  }
}
