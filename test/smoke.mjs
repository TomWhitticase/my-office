// Smoke: does the office load at all? The page opened as you'd open it (real clock, real GPU unless --software), against
// the fixture server and the browser mocks; it must reach the office (`mode === 'free'`, after the intro's pull back to
// your chair) with no page error and no console error on the way (a missing favicon aside). About 20 s, and cheap
// enough to need no lock. bin/live.sh runs it on every commit before deploying it.
import { VIEW } from './lib/browser.mjs';
import { mockRoutes } from './lib/mocks.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export async function runSmoke(browser, base, { log = console.log, timeout = 60000 } = {}) {
  const t = Date.now(), problems = [];
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, timezoneId: 'Europe/London', locale: 'en-GB', userAgent: UA });
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error' || /favicon/.test(m.location()?.url || '')) return;
      problems.push(`console error: ${m.text()}${m.location()?.url ? ` (${m.location().url}:${m.location().lineNumber})` : ''}`);
    });
    await page.addInitScript(() => Object.assign(localStorage, { officeSound: 'off' }));
    await mockRoutes(page, base);
    await page.goto(base + '/');
    const mode = () => page.evaluate(() => window.__office?.mode ?? 'not mounted').catch(() => '?');
    while (!problems.length && await mode() !== 'free') {   // an error ends it early: it won't come right
      if (Date.now() - t > timeout) { problems.push(`the office never came up (mode ${await mode()} after ${timeout / 1000} s)`); break; }
      await page.waitForTimeout(100);
    }
    if (!problems.length) await page.waitForTimeout(1000);   // a second of frames in the office itself
  } finally {
    await ctx.close();
  }
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  if (!problems.length) { log(`  ✓ the office loads (${secs}s)`); return 0; }
  log(`  ✗ the office doesn't load cleanly (${secs}s):\n    ${[...new Set(problems)].slice(0, 20).join('\n    ')}`);
  return 1;
}
