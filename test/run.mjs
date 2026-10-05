#!/usr/bin/env node
// The refactor harness: node test/run.mjs [api] [world] [golden] [--record] [--only=name,name] [--port=7781] [--log]
// With no suite named it runs all three. Exit code 0 only if everything matches. See test/README.md.
import { startServer } from './lib/server.mjs';
import { launch } from './lib/browser.mjs';

const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}`));
const val = (k) => flag(k)?.split('=')[1];
const suites = args.filter((a) => !a.startsWith('--'));
const want = (s) => !suites.length || suites.includes(s);
const record = !!flag('record'), only = val('only')?.split(',') || null;

const server = await startServer({ port: Number(val('port') || 7781), log: !!flag('log') });
let failed = 0, browser = null;
try {
  if (want('api')) {
    const { runApi } = await import('./api.mjs');
    console.log('api snapshots');
    failed += await runApi(server, { record });
  }
  if (want('world') || want('golden')) browser = await launch();
  if (want('world')) {
    const { runWorld } = await import('./world.mjs');
    console.log('world snapshots');
    failed += await runWorld(browser, server.base, { record });
  }
  if (want('golden')) {
    const { runGoldens } = await import('./goldens.mjs');
    console.log('golden screenshots');
    const { results, errors } = await runGoldens(browser, server.base, { record, only });
    failed += results.filter((r) => r.ok === false).length + (errors.length ? 1 : 0);
  }
} finally {
  await browser?.close();
  await server.stop();
}
console.log(failed ? `\n${failed} failure(s)` : record ? '\nrecorded' : '\nall match');
process.exit(failed ? 1 : 0);
