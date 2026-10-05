// ---------- this machine (the server room) ----------
// Sampled only while someone asks (the server room polls /api/machine every few seconds): CPU from os.cpus() deltas,
// memory, network and battery from the OS's own tools, df every 30 s, the top processes, and the live sessions' procs.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { run } = require('./util');
const S = require('./state');
const { STATUS_LABELS } = S;

const DARWIN = process.platform === 'darwin';
const machine = { at: 0, json: '{}', cpus: os.cpus().map((c) => { const t = c.times; return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq }; }), net: null, df: [], dfAt: 0, batt: null, battAt: 0, busy: null };
const cpuTimes = () => os.cpus().map((c) => { const t = c.times; return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq }; });
function parseNet(out) {   // total bytes in/out over real interfaces
  let rx = 0, tx = 0;
  if (DARWIN) for (const l of out.split('\n')) {
    const f = l.trim().split(/\s+/);
    if (!f[2]?.startsWith('<Link#') || /^(lo|gif|stf|utun|awdl|llw|anpi|ap)\d/.test(f[0])) continue;
    rx += Number(f.at(-5)) || 0; tx += Number(f.at(-2)) || 0;
  }
  else for (const l of out.split('\n').slice(2)) {
    const [name, rest] = l.split(':'); if (!rest || name.trim() === 'lo') continue;
    const f = rest.trim().split(/\s+/); rx += Number(f[0]) || 0; tx += Number(f[8]) || 0;
  }
  return { rx, tx, t: Date.now() };
}
function parseMem(out) {
  const total = os.totalmem();
  if (DARWIN) {
    const page = Number(out.match(/page size of (\d+)/)?.[1]) || 16384, n = (k) => Number(out.match(new RegExp(`${k}:\\s+(\\d+)`))?.[1]) || 0;
    return { total, used: Math.min(total, (n('Pages active') + n('Pages wired down') + n('Pages occupied by compressor') - n('Pages purgeable')) * page) };
  }
  const avail = Number(out.match(/MemAvailable:\s+(\d+)/)?.[1]) * 1024;
  return { total, used: avail ? total - avail : total - os.freemem() };
}
function parseDf(out) {
  const seen = new Set();
  return out.trim().split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((f) => f[0].startsWith('/dev/') && f.length >= 6)
    .map((f) => ({ dev: f[0], size: Number(f[1]) * 1024, used: Number(f[2]) * 1024, avail: Number(f[3]) * 1024, mount: f.slice(5).join(' ') }))
    .filter((v) => !(DARWIN && v.mount.startsWith('/System/Volumes/') && v.mount !== '/System/Volumes/Data') && !v.mount.startsWith('/boot') && !v.mount.startsWith('/snap/'))
    .filter((v) => { const k = `${v.size}:${v.used}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 6);
}
async function sampleMachine() {
  const now = Date.now();
  const cpus = cpuTimes(), prev = machine.cpus;
  machine.cpus = cpus;
  const cores = cpus.map((c, i) => { const p = prev?.[i], dt = p ? c.total - p.total : 0; return dt > 0 ? Math.round(100 * (1 - (c.idle - p.idle) / dt)) : 0; });
  const [mem, net, procs, df, batt] = await Promise.all([
    DARWIN ? run('vm_stat', []).then((r) => parseMem(r.out)) : fs.promises.readFile('/proc/meminfo', 'utf8').then(parseMem, () => parseMem('')),
    DARWIN ? run('netstat', ['-ib']).then((r) => parseNet(r.out)) : fs.promises.readFile('/proc/net/dev', 'utf8').then(parseNet, () => null),
    run('ps', DARWIN ? ['-Ao', 'pid=,pcpu=,rss=,comm=', '-r'] : ['-Ao', 'pid=,pcpu=,rss=,comm=', '--sort=-pcpu']).then((r) => r.out.trim().split('\n').slice(0, 8).map((l) => {
      const [, pid, cpu, rss, cmd] = l.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/) || [];
      return pid && { pid: Number(pid), cpu: Number(cpu), rssMB: Math.round(Number(rss) / 1024), name: path.basename(cmd).slice(0, 40) };
    }).filter(Boolean)),
    now - machine.dfAt > 30e3 ? run('df', ['-kP']).then((r) => { machine.dfAt = now; return (machine.df = parseDf(r.out)); }) : machine.df,
    DARWIN && now - machine.battAt > 60e3 ? run('pmset', ['-g', 'batt']).then((r) => {
      machine.battAt = now;
      const m = r.out.match(/(\d+)%;\s*([^;]+)/);
      return (machine.batt = m ? { pct: Number(m[1]), state: m[2].trim(), ac: /AC Power/.test(r.out) } : null);
    }) : machine.batt,
  ]);
  const pn = machine.net, dt = pn && net ? (net.t - pn.t) / 1000 : 0;
  machine.net = net;
  const live = S.registry.map((r) => ({ sessionId: r.sessionId, name: r.name, pid: r.pid, status: STATUS_LABELS[r.status] || r.status, ...(S.procStats[r.pid] || {}) }));
  machine.json = JSON.stringify({
    at: now, hostname: os.hostname(), os: `${DARWIN ? 'macOS' : os.type()} ${os.release()}`, arch: os.arch(), cpuModel: os.cpus()[0]?.model?.trim(),
    uptime: os.uptime(), load: os.loadavg(), cores, mem, disks: df, battery: batt,
    net: dt > 0 ? { rx: Math.max(0, (net.rx - pn.rx) / dt), tx: Math.max(0, (net.tx - pn.tx) / dt) } : null,
    top: procs, sessions: live,
  });
  machine.at = now;
}
function machineJSON() {   // one sample in flight at a time; callers within 2 s share it
  if (Date.now() - machine.at < 2000) return Promise.resolve(machine.json);
  return (machine.busy ||= sampleMachine().catch(() => {}).then(() => { machine.busy = null; return machine.json; }));
}

module.exports = { machineJSON };
