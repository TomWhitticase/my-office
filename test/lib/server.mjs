// Starts a server under test: this checkout's server.js, a fresh fixture HOME, a frozen clock, its own port.
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { T0, PIDS, makeHome } from './fixtures.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// A port nothing is listening on, for --port=0.
const freePort = () => new Promise((ok, no) => { const s = net.createServer().once('error', no).listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });

export async function startServer({ port = 7781, log = false } = {}) {
  if (!port) port = await freePort();
  // Real path: on macOS os.tmpdir() is /var/folders/…, a symlink to /private/var/…, and the paths the server reports must
  // match the HOME the snapshots scrub.
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'my-office-test-')));
  makeHome(home);
  const env = { HOME: home, PORT: String(port), HOST: '127.0.0.1', TZ: 'Europe/London', PATH: process.env.PATH, LANG: 'en_GB.UTF-8',
    FIXTURE_NOW: String(T0), FIXTURE_PIDS: PIDS.join(',') };
  const proc = spawn(process.execPath, ['--require', path.join(ROOT, 'test', 'lib', 'fixture-env.cjs'), path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; if (log) process.stdout.write(d); });
  proc.stderr.on('data', (d) => { out += d; if (log) process.stderr.write(d); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    if (proc.exitCode !== null) throw new Error(`server exited:\n${out}`);
    const ok = await fetch(base + '/api/state').then((r) => r.ok, () => false);
    if (ok) break;
    if (i > 100) { proc.kill(); throw new Error(`server didn't start on ${port}:\n${out}`); }
    await new Promise((r) => setTimeout(r, 100));
  }
  // Let the first ps poll land and a tick fold it in, so the state the browser gets is the settled one.
  await new Promise((r) => setTimeout(r, 1500));
  return {
    base, home, port, output: () => out,
    async stop() { proc.kill(); await new Promise((r) => proc.once('exit', r)); fs.rmSync(home, { recursive: true, force: true }); },
  };
}
