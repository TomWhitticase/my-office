#!/usr/bin/env node
// Server snapshots: runs server.js against fixture data in an isolated HOME with a frozen clock, and records or checks every
// /api route's status, headers and body (plus the security refusals and the /tv upgrade).
//   node test/api-baseline/snap.mjs record   write test/api-baseline/*.json
//   node test/api-baseline/snap.mjs check    compare against them (exit 1 on any difference)
//   node test/api-baseline/snap.mjs tv       TV browser: launches, streams a frame, shuts down with the server
//   node test/api-baseline/snap.mjs route    real ~/.claude data: where a message to each live session would go (dry run, sends nothing)
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import crypto from 'crypto';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url)), ROOT = process.env.SNAP_ROOT || path.resolve(DIR, '../..');   // SNAP_ROOT: another checkout's server
const FIXED = Date.UTC(2026, 9, 1, 12, 30);
const PORT = Number(process.env.SNAP_PORT || 7789);
const mode = process.argv[2] || 'check';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
process.on('exit', () => { for (const p of procs) try { p.kill('SIGKILL'); } catch {} });

// ---------- fixtures ----------
const iso = (minAgo) => new Date(FIXED - minAgo * 60e3).toISOString();
const sid = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
function write(file, data, mtime = FIXED - 60e3) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  fs.utimesSync(file, mtime / 1000, mtime / 1000);
}
let msgN = 0;
const usage = (out, extra = {}) => ({ input_tokens: 10, output_tokens: out, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500,
  cache_creation: { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 200 }, ...extra });
const tx = (cwd, branch) => ({
  prompt: (m, text, kind = 'human') => ({ type: 'user', timestamp: iso(m), cwd, gitBranch: branch, entrypoint: 'cli', origin: { kind }, message: { role: 'user', content: text } }),
  asst: (m, content, { model = 'claude-opus-5-5', out = 120, stop = 'tool_use', id, extra } = {}) => ({ type: 'assistant', timestamp: iso(m), cwd, gitBranch: branch, effort: 'high',
    message: { id: id || `msg_${++msgN}`, model, stop_reason: stop, usage: usage(out, extra), content } }),
  result: (m, id, text, isError = false) => ({ type: 'user', timestamp: iso(m), toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: text }] } }),
  sys: (m, o) => ({ type: 'system', timestamp: iso(m), ...o }),
  queue: (m, operation, content) => ({ type: 'queue-operation', timestamp: iso(m), operation, content }),
});
const tool = (id, name, input) => ({ type: 'tool_use', id, name, input });
const text = (t) => ({ type: 'text', text: t });
const jsonl = (lines) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';

function fixtures(home) {
  const C = path.join(home, '.claude'), P = path.join(C, 'projects');
  const alpha = path.join(home, 'work', 'alpha'), beta = path.join(home, 'work', 'beta');
  write(path.join(beta, 'b.txt'), 'one\ntwo\nthree\n');
  write(path.join(C, 'my-office', 'adblock', 'hosts'), '0.0.0.0 ads.example.com\n0.0.0.0 tracker.example.net\n', mode === 'record' || mode === 'check' ? FIXED : Date.now());

  // A: busy, in an Orca terminal, rich transcript, a subagent.
  const a = tx(alpha, 'feat/login');
  write(path.join(P, '-work-alpha', `${sid(1)}.jsonl`), jsonl([
    { type: 'permission-mode', permissionMode: 'acceptEdits' },
    a.prompt(200, 'Fix the login bug'),
    a.asst(199, [text('Looking into it.'), tool('tu_a1', 'Bash', { command: 'ls -la', description: 'List files' })], { id: 'msg_dup' }),
    a.asst(199, [text('(repeat block)')], { id: 'msg_dup' }),
    a.result(199, 'tu_a1', 'ok'),
    a.asst(198, [tool('tu_a2', 'Edit', { file_path: path.join(alpha, 'app.js'), old_string: 'a', new_string: 'b' })]),
    a.result(197, 'tu_a2', 'ok'),
    a.asst(196, [tool('tu_a3', 'Write', { file_path: path.join(alpha, 'new.js'), content: 'nope' })]),
    a.result(196, 'tu_a3', [{ type: 'text', text: 'permission denied' }], true),
    a.sys(195, { subtype: 'turn_duration', durationMs: 5000, messageCount: 6 }),
    { type: 'ai-title', aiTitle: 'Fix login bug' },
    { type: 'pr-link', timestamp: iso(190), prUrl: 'https://github.com/o/r/pull/7', prNumber: 7, prRepository: 'o/r' },
    a.prompt(120, '<command-name>/compact</command-name><command-message>compact</command-message>'),
    a.sys(119, { subtype: 'compact_boundary' }),
    a.sys(118, { subtype: 'away_summary', content: 'While you were away: fixed the bug.' }),
    a.sys(117, { level: 'error', subtype: 'api_error', content: 'API error 529' }),
    a.queue(60, 'enqueue', 'queued one'),
    a.queue(59, 'enqueue', 'queued two'),
    a.queue(58, 'remove', 'queued one'),
    a.queue(57, 'enqueue', '<task-notification>bg</task-notification>'),
    a.queue(56, 'popAll', 'queued two'),
    a.queue(55, 'enqueue', 'queued three'),
    a.prompt(50, 'queued three'),
    a.prompt(40, '<task-notification><summary>Build done</summary></task-notification>', 'task-notification'),
    a.prompt(39, 'hello from a channel', 'channel'),
    { type: 'user', isMeta: true, timestamp: iso(38), message: { role: 'user', content: 'meta' } },
    a.asst(30, [tool('tu_a4', 'MultiEdit', { file_path: path.join(alpha, 'm.js'), edits: [{ old_string: 'x', new_string: 'y' }, { old_string: 'p', new_string: 'q' }] }),
      tool('tu_a5', 'WebFetch', { url: 'https://example.com/page' }), tool('tu_a6', 'Agent', { description: 'Find usages', subagent_type: 'Explore' }),
      tool('tu_a7', 'Skill', { skill: 'setup' }), tool('tu_a8', 'Foo', { x: 'bar' }), tool('tu_a9', 'NotebookEdit', { notebook_path: '/n/b.ipynb', new_source: 'print(1)' })]),
    a.result(29, 'tu_a4', 'ok'), a.result(29, 'tu_a5', 'ok'), a.result(28, 'tu_a6', 'ok'), a.result(28, 'tu_a7', 'ok'), a.result(28, 'tu_a8', 'ok'), a.result(28, 'tu_a9', 'ok'),
    a.asst(3, [text('Now searching.'), tool('tu_a10', 'Grep', { pattern: 'login\\(' })], { model: 'claude-sonnet-5-5', extra: { speed: 'fast' } }),
    { type: 'last-prompt', lastPrompt: 'x' },
  ]));
  const sub = path.join(P, '-work-alpha', sid(1), 'subagents');
  write(path.join(sub, 'agent-a1.jsonl'), jsonl([
    a.asst(20, [tool('tu_s1', 'Edit', { file_path: path.join(alpha, 'sub.js'), old_string: 'q', new_string: 'sub code' })], { model: 'claude-haiku-4-5' }),
    a.result(19, 'tu_s1', 'ok'),
    a.asst(18, [tool('tu_s2', 'Read', { file_path: '/x/y/z.js' })], { model: 'claude-haiku-4-5' }),
  ]), FIXED - 10e3);
  write(path.join(sub, 'agent-a1.meta.json'), { agentType: 'Explore', description: 'Find usages', requestShape: 'background', spawnDepth: 1 });
  write(path.join(sub, 'agent-a2.jsonl'), jsonl([a.asst(150, [text('old sub')], { stop: 'end_turn' })]));

  // B: idle, tmux, an edit whose line is looked up in a real file.
  const b = tx(beta, 'main');
  write(path.join(P, '-work-beta', `${sid(2)}.jsonl`), jsonl([
    { type: 'custom-title', customTitle: 'Beta work' },
    b.prompt(100, 'Tweak b.txt'),
    b.asst(99, [tool('tu_b1', 'Edit', { file_path: path.join(beta, 'b.txt'), old_string: 'TWO', new_string: 'two\nthree' })]),
    b.result(98, 'tu_b1', 'ok'),
    b.asst(90, [text('Done.')], { stop: 'end_turn', model: 'claude-fable-5-1' }),
  ]));
  // C: live, but its transcript is older than the scan window (tracked anyway); no terminal.
  const c = tx('/work/gamma', 'dev');
  write(path.join(P, '-work-gamma', `${sid(3)}.jsonl`), jsonl([c.prompt(4000, 'Old one'), c.asst(3999, [text('Hi')], { stop: 'end_turn' })]), FIXED - 3 * 864e5);
  // E, F share a terminal; G's process changed since it registered.
  for (const [n, m] of [[5, 80], [6, 70], [7, 60]]) {
    const e = tx('/work/e', 'main');
    write(path.join(P, '-work-e', `${sid(n)}.jsonl`), jsonl([e.prompt(m + 1, `Session ${n}`), e.asst(m, [text('ok')], { stop: 'end_turn' })]));
  }
  // R: recent, not live. H: a one-shot helper call (skipped). O: old and not live (not tracked).
  const r = tx('/work/r', 'main');
  write(path.join(P, '-work-r', `${sid(10)}.jsonl`), jsonl([{ type: 'ai-title', aiTitle: 'Recent thing' }, r.prompt(300, 'Do the recent thing'),
    r.asst(299, [tool('tu_r1', 'Bash', { command: 'npm test' })]), r.result(298, 'tu_r1', 'ok'), r.asst(290, [text('Tests pass.')], { stop: 'end_turn' })]));
  write(path.join(P, '-work-r', `${sid(11)}.jsonl`), jsonl([{ ...r.prompt(200, 'branch name please'), promptSource: 'sdk', origin: undefined }, r.asst(200, [text('feat/x')], { stop: 'end_turn', model: 'claude-haiku-4-5' })]));
  write(path.join(P, '-work-r', `${sid(12)}.jsonl`), jsonl([r.prompt(5000, 'ancient'), r.asst(5000, [text('ok')])]), FIXED - 4 * 864e5);

  write(path.join(C, 'my-office', 'statusline', `${sid(1)}.json`), { session_name: 'alpha', model: { display_name: 'Opus 5.5' }, effort: { level: 'high' },
    cost: { total_cost_usd: 1.23, total_lines_added: 10, total_lines_removed: 3 }, context_window: { used_percentage: 40 }, prompt_cache: { hit: 0.9 },
    workspace: { repo: 'o/r', git_worktree: 'login' }, thinking: { enabled: true }, rate_limits: { five_hour: { used_percentage: 12 } } }, FIXED - 5e3);
  write(path.join(C, 'dashboard', 'statusline', `${sid(2)}.json`), { session_name: 'beta', model: { display_name: 'Fable 5.1' }, rate_limits: { five_hour: { used_percentage: 3 } } }, FIXED - 50e3);
  write(path.join(C, 'powerline', 'usage', 'day-2026-09-30.json'), { data: { cost: 3.5, entryCount: 20, tokenBreakdown: { input: 1, output: 2, cacheCreation: 3, cacheRead: 4 } } });
  write(path.join(C, 'powerline', 'usage', 'day-2026-10-01.json'), { data: { cost: 9, entryCount: 5, tokenBreakdown: { input: 1 } } });

  // Live sessions: one idle process each, with the terminal environment its route comes from.
  const sessions = [
    [1, 'alpha', 'busy', { ORCA_TERMINAL_HANDLE: 'term_snap-a' }],
    [2, 'beta', 'idle', { TMUX: '/tmp/tmux-snap/default,1,0', TMUX_PANE: '%7' }],
    [3, 'gamma', 'idle', {}],
    [4, 'delta', 'idle', {}, { kind: 'sdk', entrypoint: 'sdk-ts' }],
    [5, 'echo', 'idle', { ORCA_TERMINAL_HANDLE: 'term_snap-dup' }],
    [6, 'foxtrot', 'idle', { ORCA_TERMINAL_HANDLE: 'term_snap-dup' }],
    [7, 'golf', 'waiting', { ORCA_TERMINAL_HANDLE: 'term_snap-g' }, { procStart: '2001-01-01T00:00:00' }],
  ];
  const pids = new Map();
  for (const [n, name, status, env, extra] of sessions) {
    // node, not /bin/sleep: ps doesn't show a platform binary's environment.
    const p = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { env: { PATH: '/usr/bin:/bin', ...env }, stdio: 'ignore' });
    procs.push(p);
    pids.set(p.pid, `<pid:${name}>`);
    write(path.join(C, 'sessions', `${p.pid}.json`), { pid: p.pid, sessionId: sid(n), cwd: `/work/${name}`, startedAt: FIXED - 3600e3, kind: 'interactive', entrypoint: 'cli',
      name, status, statusUpdatedAt: FIXED - n * 60e3, version: '2.1.0', ...extra });
  }
  return pids;
}

// ---------- server + requests ----------
async function startServer(home, { clock = true } = {}) {
  const env = { ...process.env, HOME: home, PORT: String(PORT), HOST: '127.0.0.1', TZ: 'UTC' };
  delete env.FIXED_NOW;
  if (clock) env.FIXED_NOW = String(FIXED);
  const p = spawn(process.execPath, [...(clock ? ['-r', path.join(DIR, 'fixed-clock.cjs')] : []), 'server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p);
  p.log = '';
  p.stdout.on('data', (d) => { p.log += d; });
  p.stderr.on('data', (d) => { p.log += d; });
  for (let i = 0; i < 100 && !/my-office on http/.test(p.log); i++) await sleep(100);
  if (!/my-office on http/.test(p.log)) throw new Error(`server didn't start:\n${p.log}`);
  return p;
}
const local = { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}`, 'content-type': 'application/json', 'user-agent': 'snap' };
function req(method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const h = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined));
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: h }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || null, cache: res.headers['cache-control'] || null, body: data }));
    });
    r.on('error', reject);
    r.end(body);
  });
}
function upgrade({ path: p = '/tv', ...headers }) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, headers: { connection: 'Upgrade', upgrade: 'websocket',
      'sec-websocket-version': '13', 'sec-websocket-key': crypto.randomBytes(16).toString('base64'), host: local.host, origin: local.origin, ...headers } });
    r.on('upgrade', (res, sock) => resolve({ status: res.statusCode, sock }));
    r.on('response', (res) => resolve({ status: res.statusCode }));
    r.on('error', (e) => resolve({ status: 'destroyed', error: e.code || e.message }));
    r.end();
  });
}
async function sse() {
  return new Promise((resolve, reject) => {
    const r = http.get({ host: '127.0.0.1', port: PORT, path: '/events' }, (res) => {
      let data = '';
      res.on('data', (d) => {
        data += d;
        const blocks = data.split('\n\n').filter(Boolean);
        if (blocks.length < 4) return;
        r.destroy();
        resolve({ status: res.statusCode, type: res.headers['content-type'], events: blocks.slice(0, 4).map((b) => {
          const o = {};
          for (const l of b.split('\n')) { const i = l.indexOf(': '); o[l.slice(0, i)] = l.slice(i + 2); }
          return { event: o.event || 'message', retry: o.retry, data: JSON.parse(o.data) };
        }) });
      });
    });
    r.on('error', reject);
  });
}

// ---------- normalising ----------
const shape = (v) => v === null ? null : Array.isArray(v) ? (v.length ? [shape(v[0])] : []) : typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])])) : typeof v;
function normaliser(home, pids) {
  const walk = (v) => {
    if (typeof v === 'string') return v.split(home).join('$HOME');
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) =>
      [k, k === 'proc' && x ? shape(x) : k === 'pid' && pids.has(x) ? pids.get(x) : walk(x)]));
    return v;
  };
  return walk;
}
const parse = (s) => { try { return JSON.parse(s); } catch { return s; } };

async function snapshots(home, pids) {
  const norm = normaliser(home, pids), out = [];
  const add = (name, r, f = (x) => x) => out.push([name, norm({ ...r, body: f(parse(r.body)) })]);
  const get = (p, h) => req('GET', p, { headers: h });
  // Wait until every live session's process stats are in.
  for (let i = 0; i < 100; i++) {
    const s = parse((await get('/api/state')).body);
    if (s?.live?.length && s.live.every((x) => x.proc)) break;
    await sleep(200);
  }
  add('config', await get('/api/config'));
  add('state', await get('/api/state'));
  for (const n of [1, 2, 3, 10, 11, 12, 99]) add(`session-${n}`, await get(`/api/session/${sid(n)}`));
  const chat = await get(`/api/session/${sid(1)}/chat`);
  add('chat-1', chat);
  add('chat-1-same-seq', await get(`/api/session/${sid(1)}/chat?seq=${parse(chat.body).seq}`));
  for (const n of [1, 2, 3, 4, 5, 7, 10, 99]) add(`chat-${n}-route`, await get(`/api/session/${sid(n)}/chat?route=1`));
  add('tvs', await get('/api/tvs'));
  add('office', await get('/api/office'));
  add('machine', await get('/api/machine'), shape);
  for (const p of ['/api/repos', '/api/repos/TomWhitticase/my-office', '/api/repos/TomWhitticase/my-office/tree', '/api/repos/TomWhitticase/my-office/blob?ref=main&path=README.md',
    '/api/repos/TomWhitticase/my-office/blob?ref=0123456789abcdef0123456789abcdef01234567&path=a/../b', '/api/repos/../x', '/api/repos/./x'])
    add(`repos ${p}`, await get(p), shape);
  out.push(['events', norm(await sse())]);
  // Static files: status and headers only.
  for (const p of ['/', '/index.html', '/office.js', '/vendor/three/build/three.module.js', '/nope.js', '/%2e%2e/server.js', '/vendor/three/../../server.js'])
    out.push([`static ${p}`, { ...(await get(p)), body: undefined }]);

  // Security refusals.
  const put = (p, h, body = '{"lights":"off"}') => req('PUT', p, { headers: { ...local, ...h }, body });
  add('refuse foreign origin', await put('/api/office', { origin: 'http://evil.example' }));
  add('refuse no origin', await put('/api/office', { origin: undefined }));
  add('refuse unknown host', await put('/api/office', { host: 'evil.example', origin: 'http://evil.example' }));
  add('refuse non-json', await put('/api/office', { 'content-type': 'text/plain' }));
  add('refuse tv ua', await put('/api/office', { 'user-agent': 'Mozilla/5.0 Chrome/140 Safari/537.36 my-office-tv' }));
  add('refuse headless ua', await put('/api/office', { 'user-agent': 'Mozilla/5.0 HeadlessChrome/140' }));
  add('refuse tv put foreign', await put('/api/tvs/lobby', { origin: 'http://evil.example' }, '{"url":"https://example.com"}'));
  add('refuse john get', await get('/api/john'));
  add('refuse john foreign', await req('POST', '/api/john', { headers: { ...local, origin: 'http://evil.example' }, body: '{"text":"hi"}' }));
  add('john empty', await req('POST', '/api/john', { headers: local, body: '{"text":"  "}' }));
  add('john too long', await req('POST', '/api/john', { headers: local, body: JSON.stringify({ text: 'x'.repeat(601) }) }));
  add('refuse send get', await get(`/api/session/${sid(1)}/send`));
  add('refuse send foreign', await req('POST', `/api/session/${sid(1)}/send`, { headers: { ...local, origin: 'http://evil.example' }, body: '{"text":"hi"}' }));
  add('refuse send non-json', await req('POST', `/api/session/${sid(1)}/send`, { headers: { ...local, 'content-type': 'text/plain' }, body: '{"text":"hi"}' }));
  add('refuse send tv ua', await req('POST', `/api/session/${sid(1)}/send`, { headers: { ...local, 'user-agent': 'x my-office-tv' }, body: '{"text":"hi"}' }));
  add('send empty', await req('POST', `/api/session/${sid(1)}/send`, { headers: local, body: '{"text":" \\r\\n "}' }));
  add('send too long', await req('POST', `/api/session/${sid(1)}/send`, { headers: local, body: JSON.stringify({ text: 'x'.repeat(8001) }) }));
  add('refuse repos tv ua', await get('/api/repos', { 'user-agent': 'x my-office-tv' }));
  add('refuse repos cross-site', await get('/api/repos', { 'sec-fetch-site': 'cross-site' }));
  add('refuse repos unknown host', await get('/api/repos', { host: 'evil.example' }));
  add('refuse repos post', await req('POST', '/api/repos', { headers: local, body: '{}' }));
  for (const [name, h] of [['ok', {}], ['foreign origin', { origin: 'http://evil.example' }], ['tv ua', { 'user-agent': 'x my-office-tv' }],
    ['unknown host', { host: 'evil.example', origin: 'http://evil.example' }], ['wrong path', { path: '/nope' }]]) {
    const u = await upgrade(h);
    u.sock?.destroy();
    out.push([`tv upgrade ${name}`, { status: u.status }]);
  }

  // Changes (to the isolated HOME), and what the stream says after them.
  add('put office', await put('/api/office', {}, '{"lights":"off","brightness":5,"blinds":{"side":0.5,"north":1,"east":true,"bogus":1},"door":1}'));
  add('office after', await get('/api/office'));
  add('put tv', await put('/api/tvs/lobby', {}, '{"url":"https://example.com/x","volume":150,"muted":true,"refresh":"60"}'));
  add('put tv patch', await put('/api/tvs/lobby', {}, '{"volume":40,"adblock":false}'));
  add('put tv bad url', await put('/api/tvs/lobby', {}, '{"url":"ftp://example.com"}'));
  add('put tv off', await put('/api/tvs/nope', {}, '{"volume":5}'));
  add('put tv bad json', await put('/api/tvs/lobby', {}, '{nope'));
  add('tvs after', await get('/api/tvs'));
  out.push(['events after', norm(await sse())]);
  return out;
}

const tmpHome = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'my-office-snap-')));
const fileOf = (i, name) => path.join(DIR, `${String(i).padStart(2, '0')}-${name.replace(/[^\w.-]+/g, '_').replace(/^_|_$/g, '')}.json`);

async function main() {
  if (mode === 'record' || mode === 'check') {
    const home = tmpHome(), pids = fixtures(home);
    const server = await startServer(home);
    const snaps = await snapshots(home, pids);
    server.kill('SIGTERM');
    await new Promise((r) => server.exitCode !== null ? r() : server.once('exit', r));
    const log = server.log.replace(/indexed (\d+) transcripts in \d+ms/, 'indexed $1 transcripts in Nms').split(`:${PORT}`).join(':<port>');
    snaps.push(['server log', log.split('\n').filter(Boolean).sort()]);
    if (mode === 'record') {
      for (const f of fs.readdirSync(DIR)) if (/^\d\d-.*\.json$/.test(f)) fs.rmSync(path.join(DIR, f));
      snaps.forEach(([name, v], i) => fs.writeFileSync(fileOf(i, name), JSON.stringify(v, null, 2) + '\n'));
      console.log(`recorded ${snaps.length} snapshots`);
    } else {
      let bad = 0;
      const want = fs.readdirSync(DIR).filter((f) => /^\d\d-.*\.json$/.test(f));
      snaps.forEach(([name, v], i) => {
        const f = fileOf(i, name), got = JSON.stringify(v, null, 2) + '\n';
        if (!fs.existsSync(f)) { bad++; return console.log(`MISSING ${path.basename(f)}`); }
        if (fs.readFileSync(f, 'utf8') !== got) { bad++; fs.writeFileSync(f + '.got', got); console.log(`DIFF ${path.basename(f)} (wrote ${path.basename(f)}.got)`); }
      });
      if (want.length !== snaps.length) { bad++; console.log(`count: ${snaps.length} snapshots, ${want.length} recorded`); }
      console.log(`${snaps.length - bad}/${snaps.length} snapshots match`);
      process.exitCode = bad ? 1 : 0;
    }
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } else if (mode === 'tv') {
    const home = tmpHome(), profile = path.join(home, '.claude', 'my-office', 'tv-browser');
    fixtures(home);
    const server = await startServer(home, { clock: false });
    const pgrep = () => { try { return execFileSync('pgrep', ['-f', `user-data-dir=${profile}`]).toString().trim().split('\n').length; } catch { return 0; } };
    console.log('put tv', (await req('PUT', '/api/tvs/snaptv', { headers: local, body: JSON.stringify({ url: `http://127.0.0.1:${PORT}/api/config` }) })).status);
    const { status, sock } = await upgrade({});
    console.log('ws', status);
    let frames = 0, pages = [], buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 2) {
        let len = buf[1] & 127, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const op = buf[0] & 15, data = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        if (op === 2) frames++; else if (op === 1) pages.push(JSON.parse(data));
      }
    });
    const frame = (o) => { const d = Buffer.from(JSON.stringify(o)), m = crypto.randomBytes(4);
      return Buffer.concat([Buffer.from(d.length < 126 ? [0x81, 0x80 | d.length] : [0x81, 0x80 | 126, d.length >> 8, d.length & 255]), m, Buffer.from(d.map((b, i) => b ^ m[i & 3]))]); };
    sock.write(frame({ t: 'watch', ids: ['snaptv'], use: 'snaptv' }));
    sock.write(frame({ t: 'fade', fades: { snaptv: 0.5 } }));
    for (let i = 0; i < 300 && !(frames && pages.some((p) => p.url?.startsWith('http'))); i++) await sleep(100);
    const running = pgrep();
    console.log(`frames ${frames}, pages ${JSON.stringify(pages.map((p) => p.url))}, chrome processes ${running}`);
    sock.destroy();
    server.kill('SIGTERM');
    await new Promise((r) => server.exitCode !== null ? r() : server.once('exit', r));
    await sleep(2500);
    const left = pgrep(), saved = fs.existsSync(path.join(home, '.claude', 'my-office', 'tv-frames', 'snaptv.jpg'));
    console.log(`after SIGTERM: server exit ${server.exitCode ?? server.signalCode}, chrome processes left ${left}, last frame saved ${saved}`);
    console.log(server.log.split('\n').filter((l) => /tv browser|adblock/.test(l)).join('\n'));
    const ok = frames > 0 && running > 0 && left === 0 && saved;
    console.log(ok ? 'TV OK' : 'TV FAILED');
    process.exitCode = ok ? 0 : 1;
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } else if (mode === 'route') {
    const home = tmpHome();
    fs.mkdirSync(path.join(home, '.claude'));
    for (const d of ['sessions', 'projects']) fs.symlinkSync(path.join(os.homedir(), '.claude', d), path.join(home, '.claude', d));
    const server = await startServer(home, { clock: false });
    let s;
    for (let i = 0; i < 50 && !s?.live?.length; i++) { s = parse((await req('GET', '/api/state')).body); await sleep(200); }
    for (const x of s.live) {
      const r = parse((await req('GET', `/api/session/${x.sessionId}/chat?route=1`)).body);
      console.log(`${x.sessionId} ${String(x.name || '').padEnd(28)} ${r.route ? `route ${r.route}` : `cantSend: ${r.cantSend}`}`);
    }
    server.kill('SIGTERM');
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
main().then(() => process.exit(), (e) => { console.error(e); process.exit(1); });
