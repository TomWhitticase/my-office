// Helpers shared by the server modules.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const CLAUDE = path.join(os.homedir(), '.claude');

const safeJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const clip = (s, n = 220) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const ts = (s) => (s ? Date.parse(s) : 0) || 0;
const hourKey = (t) => Math.floor(t / 3600e3) * 3600e3;
const minuteKey = (t) => Math.floor(t / 60e3) * 60e3;

const BIN_DIRS = [...(process.env.PATH || '').split(':'), '/usr/local/bin', '/opt/homebrew/bin', '/Applications/Orca.app/Contents/Resources/bin'];
const binOf = (name) => BIN_DIRS.map((d) => d && path.join(d, name)).find((p) => p && fs.existsSync(p));
const run = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { timeout: 30000, maxBuffer: 16 << 20 },
  (err, out, errOut) => resolve({ err, out: String(out || ''), errOut: String(errOut || '') })));

const clients = new Set();   // open /events streams (server.js); modules push their own events to them

module.exports = { CLAUDE, safeJSON, readJSON, clip, pidAlive, ts, hourKey, minuteKey, binOf, run, clients };
