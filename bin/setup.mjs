#!/usr/bin/env node
// my-office setup: installs dependencies, writes config.json, hooks the Claude Code status line,
// and runs the server as a background service. Driven by the /setup skill, but usable directly:
//
//   node bin/setup.mjs --status                         report what's installed, incl. optional tools (JSON)
//   node bin/setup.mjs --owner Sam --city Berlin --lat 52.52 --lon 13.40 [--port 7777]
//                      [--no-service] [--no-statusline]
//   node bin/setup.mjs --uninstall                      remove the service and restore the status line

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const CLAUDE = path.join(HOME, '.claude');
const SETTINGS = path.join(CLAUDE, 'settings.json');
const STATE_DIR = path.join(CLAUDE, 'my-office');
const NEXT_FILE = path.join(STATE_DIR, 'statusline-next');
const TAP = path.join(ROOT, 'bin', 'statusline-tap.sh');
const CONFIG = path.join(ROOT, 'config.json');
const LABEL = 'com.my-office.server';
const PLIST = path.join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);
const UNIT = path.join(HOME, '.config', 'systemd', 'user', 'my-office.service');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const log = (msg) => console.log(`• ${msg}`);
const readJSON = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };

// ---------- status line ----------
// "tap": our tap is the status line command. "custom": the user's own script already writes snapshots.
function statuslineState() {
  const cmd = readJSON(SETTINGS, {}).statusLine?.command || '';
  if (cmd.includes('statusline-tap.sh')) return { state: 'tap', command: cmd, pointsHere: cmd.includes(TAP) };
  const file = cmd.trim().replace(/^["']|["']$/g, '').split(/\s+/)[0].replace(/^~(?=\/)/, HOME);
  if (file && fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('my-office/statusline')) return { state: 'custom', command: cmd };
  return { state: cmd ? 'other' : 'none', command: cmd };
}

function installStatusline() {
  const st = statuslineState();
  if (st.state === 'custom') { log('Status line: your own status line script already saves snapshots, leaving it alone.'); return; }
  fs.chmodSync(TAP, 0o755);
  const settings = readJSON(SETTINGS, {});
  if (st.state === 'tap') {
    if (st.pointsHere) { log('Status line: already installed.'); return; }
    settings.statusLine.command = `"${TAP}"`;
    writeJSON(SETTINGS, settings);
    log('Status line: re-pointed the tap at this checkout.');
    return;
  }
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, `${SETTINGS}.bak-my-office-${Date.now()}`);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (st.command) fs.writeFileSync(NEXT_FILE, st.command);
  else fs.rmSync(NEXT_FILE, { force: true });
  settings.statusLine = { ...(settings.statusLine || {}), type: 'command', command: `"${TAP}"` };
  if (settings.statusLine.padding === undefined) settings.statusLine.padding = 0;
  writeJSON(SETTINGS, settings);
  log(st.command ? 'Status line: installed the tap in front of your existing status line (settings.json backed up).'
    : 'Status line: installed the tap with a minimal status line (settings.json backed up).');
}

function uninstallStatusline() {
  const st = statuslineState();
  if (st.state !== 'tap') { log('Status line: tap not installed, nothing to restore.'); return; }
  const settings = readJSON(SETTINGS, {});
  fs.copyFileSync(SETTINGS, `${SETTINGS}.bak-my-office-${Date.now()}`);
  const prev = fs.existsSync(NEXT_FILE) ? fs.readFileSync(NEXT_FILE, 'utf8').trim() : '';
  if (prev) settings.statusLine.command = prev; else delete settings.statusLine;
  writeJSON(SETTINGS, settings);
  fs.rmSync(NEXT_FILE, { force: true });
  log(prev ? 'Status line: restored your previous status line.' : 'Status line: removed.');
}

// ---------- service ----------
function serviceState() {
  if (process.platform === 'darwin') return fs.existsSync(PLIST) ? 'launchd' : 'none';
  if (process.platform === 'linux') return fs.existsSync(UNIT) ? 'systemd' : 'none';
  return 'unsupported';
}

function installService() {
  const logDir = process.platform === 'darwin' ? path.join(HOME, 'Library', 'Logs', 'my-office') : path.join(STATE_DIR, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  if (process.platform === 'darwin') {
    const uid = process.getuid();
    spawnSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { stdio: 'ignore' });
    fs.mkdirSync(path.dirname(PLIST), { recursive: true });
    // ProcessType must be Standard: Background gets I/O-throttled and the first transcript scan crawls.
    fs.writeFileSync(PLIST, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${process.execPath}</string><string>${path.join(ROOT, 'server.js')}</string></array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Standard</string>
  <key>StandardOutPath</key><string>${path.join(logDir, 'out.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, 'err.log')}</string>
</dict>
</plist>
`);
    execFileSync('launchctl', ['bootstrap', `gui/${uid}`, PLIST]);
    log(`Service: launchd agent ${LABEL} installed (starts at login, restarts on crash). Logs: ${logDir}`);
    return true;
  }
  if (process.platform === 'linux') {
    fs.mkdirSync(path.dirname(UNIT), { recursive: true });
    fs.writeFileSync(UNIT, `[Unit]
Description=my-office live Claude Code dashboard

[Service]
ExecStart=${process.execPath} ${path.join(ROOT, 'server.js')}
WorkingDirectory=${ROOT}
Restart=always

[Install]
WantedBy=default.target
`);
    execFileSync('systemctl', ['--user', 'daemon-reload']);
    execFileSync('systemctl', ['--user', 'enable', '--now', 'my-office.service']);
    execFileSync('systemctl', ['--user', 'restart', 'my-office.service']);
    log('Service: systemd user unit my-office.service enabled. Logs: journalctl --user -u my-office');
    return true;
  }
  log(`Service: not supported on ${process.platform}; run \`npm start\` in ${ROOT} instead.`);
  return false;
}

function uninstallService() {
  if (process.platform === 'darwin' && fs.existsSync(PLIST)) {
    spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' });
    fs.rmSync(PLIST);
    log('Service: launchd agent removed.');
  } else if (process.platform === 'linux' && fs.existsSync(UNIT)) {
    spawnSync('systemctl', ['--user', 'disable', '--now', 'my-office.service'], { stdio: 'ignore' });
    fs.rmSync(UNIT);
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
    log('Service: systemd unit removed.');
  } else log('Service: not installed.');
}

async function waitForServer(port) {
  const url = `http://127.0.0.1:${port}/api/state`;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(url);
      const body = await r.text();
      if (r.ok && body) { const s = JSON.parse(body); return s; }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// ---------- optional tools ----------
// Not needed to run, but each unlocks part of the office. Looked up the way server.js does, including the places a
// launchd/systemd service's bare PATH misses (Homebrew, Orca's bundled CLI, Claude Code's own install dirs).
const BIN_DIRS = [...(process.env.PATH || '').split(path.delimiter), '/usr/local/bin', '/opt/homebrew/bin', '/Applications/Orca.app/Contents/Resources/bin',
  path.join(HOME, '.local', 'bin'), path.join(HOME, '.claude', 'local')];
const binOf = (name) => BIN_DIRS.map((d) => d && path.join(d, name)).find((p) => p && fs.existsSync(p)) || null;
function optionalTools() {
  const gh = binOf('gh'), chrome = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p)) || null;
  const ghAuthed = !!gh && spawnSync(gh, ['auth', 'status'], { stdio: 'ignore', timeout: 15000 }).status === 0;
  return {
    gh: { found: !!gh, signedIn: ghAuthed, unlocks: 'THE ARCHIVE: your GitHub repos in the filing cabinet and the gateway into them', fix: gh ? 'gh auth login' : 'brew install gh && gh auth login' },
    chrome: { found: !!chrome, unlocks: 'the wall TVs (each one is a tab in a hidden Chrome)', fix: 'install Google Chrome, or set CHROME_PATH' },
    orca: { found: !!binOf('orca'), unlocks: 'messaging sessions (Messages app, clicking a person to chat) when they run in Orca terminals', fix: 'run sessions in Orca (orca.app), or in tmux' },
    tmux: { found: !!binOf('tmux'), unlocks: 'messaging sessions that run inside tmux', fix: 'brew install tmux, and run claude inside it' },
    claude: { found: !!binOf('claude'), unlocks: 'John in the server room (answers with Claude Haiku via the claude CLI)', fix: 'make sure the claude CLI is on your PATH' },
  };
}
function reportOptional(t) {
  for (const [name, o] of Object.entries(t)) {
    const ok = o.found && (o.signedIn ?? true);
    log(`${ok ? 'Found' : o.found ? 'Not signed in' : 'Missing'}: ${name} (${o.unlocks})${ok ? '' : ` · fix: ${o.fix}`}`);
  }
}

// ---------- main ----------
const nodeMajor = Number(process.versions.node.split('.')[0]);
const config = readJSON(CONFIG, {});

if (flag('status')) {
  console.log(JSON.stringify({
    root: ROOT, platform: process.platform, node: process.versions.node, nodeOk: nodeMajor >= 18,
    dependencies: fs.existsSync(path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js')),
    claudeDir: fs.existsSync(CLAUDE), config, statusline: statuslineState(), service: serviceState(), optional: optionalTools(),
    running: await fetch(`http://127.0.0.1:${config.port || 7777}/api/config`).then((r) => r.ok, () => false),
  }, null, 2));
  process.exit(0);
}

if (flag('uninstall')) {
  uninstallService();
  uninstallStatusline();
  log(`Left in place: ${ROOT} (config.json, node_modules) and ${STATE_DIR}. Delete them to remove everything.`);
  process.exit(0);
}

if (nodeMajor < 18) { console.error(`my-office needs Node.js 18 or newer (found ${process.versions.node}).`); process.exit(1); }
if (!fs.existsSync(CLAUDE)) { console.error('No ~/.claude directory found. Install and run Claude Code once first.'); process.exit(1); }

log('Installing dependencies…');
execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: ROOT, stdio: 'inherit' });

for (const k of ['owner', 'city']) if (opt(k) !== undefined) config[k] = opt(k);
for (const k of ['lat', 'lon', 'port']) if (opt(k) !== undefined) config[k] = Number(opt(k));
config.port ||= 7777;
writeJSON(CONFIG, config);
log(`Config: ${JSON.stringify(config)}`);

if (!flag('no-statusline')) installStatusline();

if (flag('no-service')) log(`Service: skipped. Start it with \`npm start\` in ${ROOT}.`);
else if (installService()) {
  log('Waiting for the server (the first scan of your transcripts can take a few seconds)…');
  const s = await waitForServer(config.port);
  if (s) log(`Running: http://127.0.0.1:${config.port} · ${s.totals.live} Claude Code sessions live right now`);
  else { console.error(`Server didn't answer on port ${config.port}. Check the logs above, or whether the port is in use.`); process.exit(1); }
}
log('Optional extras (everything else works without them):');
reportOptional(optionalTools());
