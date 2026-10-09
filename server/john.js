// ---------- John, the server hall's sysadmin ----------
// POST /api/john { text, history: [{ role: 'user' | 'john', text }] } -> { reply }. One `claude -p` per question: Haiku, no
// tools, no MCP, no customisations, nothing persisted; John only ever sees the snapshot below, so he can't run anything.
// One at a time, a few a minute, from this machine only. No claude CLI: { reply, lunch: true }.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { binOf } = require('./util');
const S = require('./state');
const { ownPids } = S;
const { machineJSON } = require('./machine');

const JOHN = { busy: false, at: [], pids: ownPids, max: 600, perMin: 8 };
const JOHN_BIN = () => binOf('claude') || [path.join(os.homedir(), '.local/bin/claude'), path.join(os.homedir(), '.claude/local/claude')].find((p) => fs.existsSync(p));
const JOHN_PERSONA = `You are John, the sysadmin who looks after the server hall on floor 47 of this office building. You're in your fifties,
grey hair in a ponytail, flannel shirt, a mug of terrible coffee; grizzled, dry, friendly, been doing this since the dial-up days.
The "servers" in the hall are really one machine (described below) and the Claude Code sessions running on it: each live session
is a 2U unit in racks A01-A03, the machine itself is in B01-B03 (CPU, memory, load, disks, UPS, switches), and the NOC wall shows
the graphs. Someone has walked up to your desk to ask you something.
Rules: answer in character, in 1-4 short sentences of plain spoken English (no markdown, no lists, no *actions*). Ground every
fact in the SNAPSHOT; never invent incidents, numbers, processes or sessions that aren't in it, and if it isn't there say you'd
have to check. You can't run commands or touch anything from this chat, so don't offer to. Friendly opinions and sysadmin
war stories are fine as long as they're clearly yours and not claims about this machine.
If anyone asks about the restricted level, B3, whatever is below the archive or an access code: nothing down there is on
any rack you look after, you've never been and you'd rather not discuss it. Go quiet, change the subject, never give a code.`;
function johnSnapshot(m) {
  const st = S.state || {}, t = st.totals || {}, GB = (b) => (b / 2 ** 30).toFixed(1), rate = (b) => `${(b / 1024).toFixed(0)} KB/s`;
  const cpu = m.cores?.length ? Math.round(m.cores.reduce((a, b) => a + b, 0) / m.cores.length) : '?';
  const L = [`Time now: ${new Date().toLocaleString()}`,
    `Machine: ${m.hostname}, ${m.os} ${m.arch}, ${m.cpuModel || ''}, up ${(m.uptime / 3600).toFixed(1)} h`,
    `CPU: ${cpu}% average over ${m.cores?.length} cores (per core: ${(m.cores || []).join(' ')}); load ${(m.load || []).map((v) => v.toFixed(2)).join(' / ')} (1/5/15 min)`,
    m.mem && `Memory: ${GB(m.mem.used)} of ${GB(m.mem.total)} GB used (${Math.round(m.mem.used / m.mem.total * 100)}%)`,
    `Disks: ${(m.disks || []).map((d) => `${d.mount} ${GB(d.used)}/${GB(d.size)} GB (${Math.round(d.used / d.size * 100)}%)`).join('; ') || 'unknown'}`,
    m.net && `Network: in ${rate(m.net.rx)}, out ${rate(m.net.tx)}`,
    m.mem?.pressure && `Memory pressure: ${m.mem.pressure}${m.mem.freePct != null ? ` (${m.mem.freePct}% free by the kernel's measure)` : ''}`,
    m.swap && `Swap: ${GB(m.swap.used)} of ${GB(m.swap.total)} GB used`,
    m.diskIO && `Disk I/O: read ${rate(m.diskIO.read)}, write ${rate(m.diskIO.write)}`,
    m.wifi && `Wi-Fi: signal ${m.wifi.signal} dBm, noise ${m.wifi.noise} dBm, channel ${m.wifi.channel}, ${m.wifi.rate || '?'} Mbps`,
    m.battery && `Battery: ${m.battery.pct}% (${m.battery.state}${m.battery.ac ? ', on mains' : ', on battery'})${m.battery.tempC != null ? `, battery temperature ${m.battery.tempC.toFixed(1)} °C` : ''}${m.battery.cycles != null ? `, ${m.battery.cycles} charge cycles, health ${m.battery.health}% of design capacity` : ''}${m.battery.watts ? `, ${m.battery.watts < 0 ? 'drawing' : 'charging at'} ${Math.abs(m.battery.watts)} W` : ''}${m.battery.adapterW ? `, ${m.battery.adapterW} W adapter` : ''}${m.battery.minutes != null ? `, ${m.battery.minutes} min ${m.battery.charging ? 'to full' : 'left'}` : ''}`,
    m.thermal && `Thermal state (macOS thermal pressure): ${m.thermal.level}${m.thermal.warning ? `; ${m.thermal.warning}` : ''}`,
    m.sensors && (m.sensors.source ? `Sensors (${m.sensors.source}): CPU ${m.sensors.cpuTempC ?? '?'} °C${m.sensors.gpuTempC != null ? `, GPU ${m.sensors.gpuTempC} °C` : ''}${m.sensors.cpuW != null ? `, CPU ${m.sensors.cpuW} W, GPU ${m.sensors.gpuW} W, whole system ${m.sensors.sysW} W` : ''}${m.sensors.gpuPct != null ? `, GPU ${m.sensors.gpuPct}% busy` : ''}${m.sensors.fans?.length ? `, fans ${m.sensors.fans.map((f) => `${f.rpm} rpm`).join(' / ')}` : ''}`
      : `CPU/GPU die temperatures, fans and power draw: not readable (${m.sensors.hint}); the battery temperature above is the only temperature there is`),
    m.procs && `Processes: ${m.procs}${m.files ? `; open files ${m.files.open} of ${m.files.max}` : ''}`,
    `Top processes by CPU: ${(m.top || []).slice(0, 6).map((p) => `${p.name} ${p.cpu}% ${p.rssMB} MB`).join('; ')}`,
    `Claude Code sessions live: ${(st.live || []).length} (${t.working || 0} working)`,
    ...(st.live || []).slice(0, 20).map((s) => `- ${s.name || s.sessionId.slice(0, 8)}: ${s.status}${s.transcript?.title ? `, "${String(s.transcript.title).slice(0, 80)}"` : ''}${s.transcript?.branch ? `, branch ${s.transcript.branch}` : ''}${s.statusline?.model ? `, ${s.statusline.model}` : ''}, CPU ${s.proc?.cpu ?? '?'}%, RSS ${s.proc?.rssMB ?? '?'} MB, cost so far $${(s.cost || 0).toFixed(2)}${s.transcript?.pendingTool ? `, running ${s.transcript.pendingTool.name}` : ''}`),
    `Today: $${(t.todayCost || 0).toFixed(2)} API-equivalent across ${t.todaySessions || 0} sessions, ${Math.round((t.todayTokens || 0) / 1e3)}k tokens`];
  return L.filter(Boolean).join('\n');
}
async function askJohn(text, history) {
  const bin = JOHN_BIN();
  if (!bin) return { reply: 'John’s on his lunch break. (No claude CLI on this machine, so he can’t answer.)', lunch: true };
  const m = JSON.parse(await machineJSON() || '{}');
  const convo = history.map((h) => `${h.role === 'john' ? 'John' : 'Visitor'}: ${h.text}`).join('\n');
  const prompt = `SNAPSHOT (live, just taken):\n${johnSnapshot(m)}\n\n${convo ? `CONVERSATION SO FAR:\n${convo}\n\n` : ''}Visitor: ${text}\nJohn:`;
  return new Promise((resolve) => {
    const c = spawn(bin, ['-p', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence', '--disable-slash-commands',
      '--output-format', 'text', '--system-prompt', JOHN_PERSONA], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'my-office-john' } });
    JOHN.pids.add(c.pid);
    let out = '', err = '';
    const done = (r) => { clearTimeout(timer); JOHN.pids.delete(c.pid); resolve(r); };
    const timer = setTimeout(() => { c.kill('SIGKILL'); }, 60e3);
    c.stdout.on('data', (d) => { out += d; if (out.length > 8000) c.kill(); });
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', () => done({ reply: 'John’s on his lunch break. (The claude CLI wouldn’t start.)', lunch: true }));
    c.on('close', (code) => {
      const reply = out.trim().replace(/^John:\s*/i, '').slice(0, 1500);
      if (/not logged in|please run \/login/i.test(out + err)) done({ reply: 'John’s on his lunch break. (The claude CLI here isn’t logged in.)', lunch: true });
      else if (code === 0 && reply) done({ reply });
      else { console.log(`[john] claude exited ${code}: ${err.trim().slice(0, 300)}`); done({ reply: 'John squints at his screen and mutters something about the coffee machine. (He couldn’t answer just now; try again in a minute.)', error: true }); }
    });
    c.stdin.end(prompt);
  });
}

module.exports = { JOHN, askJohn };
