// Preloaded into the server under test (node --require): pins everything the fixture HOME can't, so two runs
// of the same code give byte-identical API responses. Test-only; server.js knows nothing about it.
//   FIXTURE_NOW   the frozen wall clock (ms): Date.now() and new Date() always return it
//   FIXTURE_PIDS  comma-separated pids the fixture sessions use: alive, with a fixed ps line each
const os = require('os');
const cp = require('child_process');

const NOW = Number(process.env.FIXTURE_NOW);
const PIDS = new Set(String(process.env.FIXTURE_PIDS || '').split(',').filter(Boolean).map(Number));

if (NOW) {
  const Real = Date;
  class FrozenDate extends Real {
    constructor(...a) { if (a.length) super(...a); else super(NOW); }
    static now() { return NOW; }
  }
  globalThis.Date = FrozenDate;
}

os.hostname = () => 'fixture-host';

const kill = process.kill.bind(process);
process.kill = (pid, sig) => (PIDS.has(Number(pid)) && (sig === 0 || sig === undefined) ? true : kill(pid, sig));

// `ps -o pid=,%cpu=,rss= -p <pids>` (the live sessions' procs): one steady line per fixture pid.
const execFile = cp.execFile;
cp.execFile = function (cmd, args, ...rest) {
  if (cmd === 'ps' && Array.isArray(args) && args.includes('-p')) {
    const pids = String(args[args.indexOf('-p') + 1]).split(',').map(Number);
    if (pids.every((p) => PIDS.has(p))) {
      const cb = rest.find((x) => typeof x === 'function');
      const out = pids.map((p, i) => `${p} ${(i * 7.5).toFixed(1)} ${(180 + i * 40) * 1024}`).join('\n') + '\n';
      setImmediate(() => cb?.(null, out, ''));
      return { on() {}, kill() {} };
    }
  }
  return execFile.call(this, cmd, args, ...rest);
};
