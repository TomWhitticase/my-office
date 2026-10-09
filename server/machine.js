// ---------- this machine (the server room) ----------
// Sampled only while someone asks (the server room polls /api/machine every few seconds): CPU from os.cpus() deltas,
// memory, swap, network (per interface), disk I/O and battery from the OS's own tools, df every 30 s, the top processes,
// and the live sessions' procs. Nothing here needs sudo. On a Mac: the battery's own sensors (ioreg AppleSmartBattery:
// temperature, cycles, health, draw, the adapter), macOS's thermal pressure (notifyutil) and warnings (pmset -g therm),
// memory pressure (sysctl), Wi-Fi signal (system_profiler, once a minute in the background). CPU/GPU die temperatures,
// fans and power need `macmon` (Apple Silicon, no sudo): if it's on the PATH, one `macmon pipe` runs while someone's
// asking (restarted if it dies, stopped a minute after the last ask); without it `sensors` says how to get them.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { run, binOf, safeJSON } = require('./util');
const S = require('./state');
const { STATUS_LABELS } = S;

const DARWIN = process.platform === 'darwin';
const machine = { at: 0, json: '{}', cpus: os.cpus().map((c) => { const t = c.times; return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq }; }), net: null, df: [], dfAt: 0, batt: null, battAt: 0, busy: null,
  io: null, therm: null, thermAt: 0, wifi: null, wifiAt: 0 };
const cpuTimes = () => os.cpus().map((c) => { const t = c.times; return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq }; });
function parseNet(out) {   // bytes in/out over real interfaces, in total and per interface
  let rx = 0, tx = 0;
  const ifs = {};
  if (DARWIN) for (const l of out.split('\n')) {
    const f = l.trim().split(/\s+/);
    if (!f[2]?.startsWith('<Link#') || /^(lo|gif|stf|utun|awdl|llw|anpi|ap)\d/.test(f[0])) continue;
    const r = Number(f.at(-5)) || 0, t = Number(f.at(-2)) || 0;
    rx += r; tx += t; ifs[f[0].replace(/\*$/, '')] = { rx: r, tx: t };
  }
  else for (const l of out.split('\n').slice(2)) {
    const [name, rest] = l.split(':'); if (!rest || name.trim() === 'lo') continue;
    const f = rest.trim().split(/\s+/), r = Number(f[0]) || 0, t = Number(f[8]) || 0;
    rx += r; tx += t; ifs[name.trim()] = { rx: r, tx: t };
  }
  return { rx, tx, ifs, t: Date.now() };
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
// The Mac's battery, from its own gauge: AppleSmartBattery's Temperature is centi-degrees C, Amperage a signed 64-bit mA
// printed unsigned, capacities mAh (MaxCapacity is a percentage on Apple Silicon, so health is AppleRawMaxCapacity / Design).
function parseBattery(out) {
  const v = (k) => out.match(new RegExp(`"${k}" = (\\d+|Yes|No)\\b`))?.[1], n = (k) => (v(k) && /^\d+$/.test(v(k)) ? Number(v(k)) : null), yes = (k) => v(k) === 'Yes';
  if (n('Temperature') == null) return null;
  const amps = v('InstantAmperage') || v('Amperage'), mA = amps ? Number(BigInt.asIntN(64, BigInt(amps))) : 0, mV = n('Voltage') || 0;
  const max = n('AppleRawMaxCapacity') ?? n('NominalChargeCapacity'), design = n('DesignCapacity'), charging = yes('IsCharging');
  const left = charging ? n('AvgTimeToFull') : n('AvgTimeToEmpty');
  return { tempC: n('Temperature') / 100, cycles: n('CycleCount'), health: max && design ? Math.round(max / design * 100) : null, maxMAh: max, designMAh: design,
    charging, full: yes('FullyCharged'), external: yes('ExternalConnected'), watts: Math.round(mV * mA / 1e5) / 10,
    adapterW: Number(out.match(/"AdapterDetails" = \{[^}]*"Watts"=(\d+)/)?.[1]) || null, minutes: left != null && left < 65535 ? left : null };
}
const THERMAL = ['nominal', 'fair', 'serious', 'critical', 'critical'];   // OSThermalPressureLevel: nominal, moderate, heavy, trapping, sleeping
function parseIo(out) {   // bytes read and written since boot, over every block device (ioreg) or disk (/proc/diskstats)
  let read = 0, write = 0;
  if (DARWIN) for (const m of out.matchAll(/"Bytes \(Read\)"=(\d+),?[^}]*?"Bytes \(Write\)"=(\d+)|"Bytes \(Write\)"=(\d+),?[^}]*?"Bytes \(Read\)"=(\d+)/g)) {
    read += Number(m[1] ?? m[4]); write += Number(m[2] ?? m[3]);
  }
  else for (const l of out.split('\n')) {
    const f = l.trim().split(/\s+/);
    if (f.length > 9 && /^(sd[a-z]+|nvme\d+n\d+|vd[a-z]+|mmcblk\d+)$/.test(f[2])) { read += Number(f[5]) * 512; write += Number(f[9]) * 512; }
  }
  return { read, write, t: Date.now() };
}
// Wi-Fi: system_profiler takes a few seconds, so it runs in the background at most once a minute and the sample uses the last.
function refreshWifi(now) {
  if (!DARWIN || now - machine.wifiAt < 60e3) return;
  machine.wifiAt = now;
  run('system_profiler', ['-json', 'SPAirPortDataType']).then((r) => {
    const ifs = safeJSON(r.out)?.SPAirPortDataType?.[0]?.spairport_airport_interfaces || [];
    const c = ifs.map((i) => i.spairport_current_network_information).find((x) => x?.spairport_signal_noise);
    const [, sig, noise] = c?.spairport_signal_noise?.match(/(-?\d+) dBm \/ (-?\d+) dBm/) || [];
    machine.wifi = c ? { signal: Number(sig), noise: Number(noise), channel: c.spairport_network_channel || '', rate: c.spairport_network_rate || null,
      phy: c.spairport_network_phymode || '' } : null;
  });
}
// macmon (https://github.com/vladkens/macmon): CPU/GPU die temperatures, fans, power and GPU use on Apple Silicon without
// sudo. One `macmon pipe` (a JSON line every 2 s) while the hall is asking; restarted if it dies, stopped after a quiet minute.
const MACMON = { proc: null, last: null, at: 0, asked: 0, retryAt: 0 };
function macmon(now) {
  MACMON.asked = now;
  if (MACMON.proc || now < MACMON.retryAt) return;
  const bin = binOf('macmon');
  if (!bin) { MACMON.retryAt = now + 60e3; return; }
  const c = MACMON.proc = spawn(bin, ['pipe', '-i', '2000'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let buf = '';
  c.stdout.on('data', (d) => {
    buf += d; const lines = buf.split('\n'); buf = lines.pop().slice(-1e5);
    for (const l of lines) { const j = safeJSON(l); if (j) { MACMON.last = j; MACMON.at = Date.now(); } }
  });
  const done = () => { if (MACMON.proc === c) { MACMON.proc = null; MACMON.retryAt = Date.now() + 10e3; } };
  c.on('error', done); c.on('exit', done);
  const idle = setInterval(() => { if (Date.now() - MACMON.asked > 60e3 || MACMON.proc !== c) { clearInterval(idle); c.kill(); } }, 10e3);
  idle.unref();
}
function sensors(now, zones) {
  const j = Date.now() - MACMON.at < 10e3 && MACMON.last, r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
  if (j) return { source: 'macmon', cpuTempC: r1(j.temp?.cpu_temp_avg), gpuTempC: r1(j.temp?.gpu_temp_avg), cpuW: r1(j.cpu_power), gpuW: r1(j.gpu_power),
    aneW: r1(j.ane_power), sysW: r1(j.sys_power), gpuPct: Array.isArray(j.gpu_usage) ? Math.round(j.gpu_usage[1] * 100) : null,
    fans: (j.fans || []).map((f) => ({ rpm: Math.round(f.rpm), max: Math.round(f.max_rpm) || null })) };
  if (zones?.length) return { source: 'thermal_zone', cpuTempC: r1(Math.max(...zones)) };
  return { source: null, hint: DARWIN ? (binOf('macmon') ? 'macmon is starting…' : 'install macmon (brew install macmon) for CPU/GPU temperatures, fans and power')
    : 'no thermal sensors readable' };
}
async function sampleMachine() {
  const now = Date.now();
  const cpus = cpuTimes(), prev = machine.cpus;
  machine.cpus = cpus;
  const cores = cpus.map((c, i) => { const p = prev?.[i], dt = p ? c.total - p.total : 0; return dt > 0 ? Math.round(100 * (1 - (c.idle - p.idle) / dt)) : 0; });
  if (DARWIN) { macmon(now); refreshWifi(now); }
  const txt = (f) => fs.promises.readFile(f, 'utf8').catch(() => '');
  const [mem, net, ps, df, batt, gauge, sys, therm, io, zones] = await Promise.all([
    DARWIN ? run('vm_stat', []).then((r) => parseMem(r.out)) : txt('/proc/meminfo').then(parseMem),
    DARWIN ? run('netstat', ['-ib']).then((r) => parseNet(r.out)) : fs.promises.readFile('/proc/net/dev', 'utf8').then(parseNet, () => null),
    run('ps', DARWIN ? ['-Ao', 'pid=,pcpu=,rss=,comm=', '-r'] : ['-Ao', 'pid=,pcpu=,rss=,comm=', '--sort=-pcpu']).then((r) => {
      const lines = r.out.trim().split('\n');
      return { count: lines.length, top: lines.slice(0, 8).map((l) => {
        const [, pid, cpu, rss, cmd] = l.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/) || [];
        return pid && { pid: Number(pid), cpu: Number(cpu), rssMB: Math.round(Number(rss) / 1024), name: path.basename(cmd).slice(0, 40) };
      }).filter(Boolean) };
    }),
    now - machine.dfAt > 30e3 ? run('df', ['-kP']).then((r) => { machine.dfAt = now; return (machine.df = parseDf(r.out)); }) : machine.df,
    DARWIN && now - machine.battAt > 60e3 ? run('pmset', ['-g', 'batt']).then((r) => {
      machine.battAt = now;
      const m = r.out.match(/(\d+)%;\s*([^;]+)/);
      return (machine.batt = m ? { pct: Number(m[1]), state: m[2].trim(), ac: /AC Power/.test(r.out) } : null);
    }) : machine.batt,
    DARWIN ? run('ioreg', ['-rn', 'AppleSmartBattery', '-w0']).then((r) => parseBattery(r.out)) : null,
    DARWIN ? run('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level', 'kern.memorystatus_level', 'kern.num_files', 'kern.maxfiles', 'vm.swapusage'])
      .then((r) => r.out.trim().split('\n')) : Promise.all([txt('/proc/sys/fs/file-nr'), txt('/proc/pressure/memory')]),
    DARWIN ? Promise.all([run('notifyutil', ['-g', 'com.apple.system.thermalpressurelevel']),
      now - machine.thermAt > 30e3 ? run('pmset', ['-g', 'therm']).then((r) => { machine.thermAt = now; return (machine.therm = r.out); }) : machine.therm])
      .then(([p, w]) => {
        const lvl = Number(p.out.match(/(\d+)\s*$/)?.[1]), warn = String(w || '').match(/(?:thermal|performance) warning level[^\n]*?(\d+)/gi);
        return { level: Number.isFinite(lvl) ? THERMAL[lvl] || 'critical' : 'unknown', pressure: Number.isFinite(lvl) ? lvl : null,
          warning: warn?.length ? warn.join('; ') : null };
      }) : null,
    DARWIN ? run('ioreg', ['-c', 'IOBlockStorageDriver', '-r', '-w0']).then((r) => parseIo(r.out)) : txt('/proc/diskstats').then(parseIo),
    DARWIN ? null : fs.promises.readdir('/sys/class/thermal').then((ds) => Promise.all(ds.filter((d) => d.startsWith('thermal_zone'))
      .map((d) => txt(`/sys/class/thermal/${d}/temp`).then((t) => Number(t) / 1000)))).then((v) => v.filter((x) => x > 0 && x < 150), () => []),
  ]);
  const pn = machine.net, dt = pn && net ? (net.t - pn.t) / 1000 : 0;
  machine.net = net;
  const pio = machine.io, dio = pio && io ? (io.t - pio.t) / 1000 : 0;
  machine.io = io;
  let swap = null, files = null;
  if (DARWIN && sys) {
    const [pl, freePct, nf, mf, sw] = sys, MB = (k) => Number(sw?.match(new RegExp(`${k} = ([\\d.]+)M`))?.[1]) * 2 ** 20 || 0;
    if (mem) Object.assign(mem, { pressure: { 1: 'normal', 2: 'warn', 4: 'critical' }[pl] || 'normal', freePct: Number(freePct) || null });
    swap = { total: MB('total'), used: MB('used') }; files = { open: Number(nf) || 0, max: Number(mf) || 0 };
  } else if (sys) {
    const [fnr, psi] = sys, [open, , max] = fnr.trim().split(/\s+/).map(Number), avg = Number(psi.match(/some avg10=([\d.]+)/)?.[1]);
    if (open) files = { open, max };
    if (mem && Number.isFinite(avg)) mem.pressure = avg > 20 ? 'critical' : avg > 5 ? 'warn' : 'normal';
    const mi = await txt('/proc/meminfo'), kb = (k) => Number(mi.match(new RegExp(`${k}:\\s+(\\d+)`))?.[1]) * 1024 || 0;
    swap = { total: kb('SwapTotal'), used: kb('SwapTotal') - kb('SwapFree') };
  }
  const battery = batt && gauge ? { ...batt, ...gauge } : batt;
  const live = S.registry.map((r) => ({ sessionId: r.sessionId, name: r.name, pid: r.pid, status: STATUS_LABELS[r.status] || r.status, ...(S.procStats[r.pid] || {}) }));
  const rate = (a, b, k) => Math.max(0, (a[k] - b[k]) / dt);
  machine.json = JSON.stringify({
    at: now, hostname: os.hostname(), os: `${DARWIN ? 'macOS' : os.type()} ${os.release()}`, arch: os.arch(), cpuModel: os.cpus()[0]?.model?.trim(),
    uptime: os.uptime(), load: os.loadavg(), cores, mem, swap, disks: df, battery,
    power: battery ? (battery.ac ? `AC${battery.adapterW ? ` ${battery.adapterW} W` : ''}` : 'Battery') : 'AC',
    thermal: therm, sensors: sensors(now, zones),
    net: dt > 0 ? { rx: rate(net, pn, 'rx'), tx: rate(net, pn, 'tx') } : null,
    ifaces: dt > 0 ? Object.entries(net.ifs).filter(([k]) => pn.ifs[k]).map(([name, v]) => ({ name, rx: rate(v, pn.ifs[name], 'rx'), tx: rate(v, pn.ifs[name], 'tx') }))
      .filter((v) => v.rx + v.tx > 0 || v.name === 'en0').slice(0, 6) : [],
    diskIO: dio > 0 ? { read: Math.max(0, (io.read - pio.read) / dio), write: Math.max(0, (io.write - pio.write) / dio) } : null,
    wifi: machine.wifi, procs: ps.count, files,
    top: ps.top, sessions: live,
  });
  machine.at = now;
}
function machineJSON() {   // one sample in flight at a time; callers within 2 s share it
  if (Date.now() - machine.at < 2000) return Promise.resolve(machine.json);
  return (machine.busy ||= sampleMachine().catch((e) => { console.log(`[machine] ${e.message}`); }).then(() => { machine.busy = null; return machine.json; }));
}

module.exports = { machineJSON };
