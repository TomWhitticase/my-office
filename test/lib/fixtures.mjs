// The fixture HOME: a fixed set of Claude Code sessions written at fixed times around T0, so the server's state, and
// everything the office draws from it, is the same on every run.
import fs from 'node:fs';
import path from 'node:path';

// Wednesday 17 June 2026, 14:30 in London: daylight, the sun in the south-west.
export const T0 = Date.UTC(2026, 5, 17, 13, 30, 0);
export const PIDS = [41001, 41002, 41003, 41004, 41005];
const MIN = 60e3;

const iso = (t) => new Date(t).toISOString();
function write(file, data, mtime = T0 - MIN) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
  fs.utimesSync(file, new Date(mtime), new Date(mtime));
}

// A transcript from a script: [minutesBeforeT0, kind, ...args].
function transcript({ cwd, branch, title, model = 'claude-opus-5-5' }, steps) {
  const lines = [];
  let n = 0;
  const base = (t) => ({ timestamp: iso(T0 - t * MIN), cwd, gitBranch: branch, entrypoint: 'cli' });
  if (title) lines.push({ type: 'ai-title', aiTitle: title });
  for (const [t, kind, a, b] of steps) {
    n++;
    if (kind === 'prompt') lines.push({ ...base(t), type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: a } });
    else if (kind === 'say') lines.push({ ...base(t), type: 'assistant', message: { id: `msg_${n}`, model, stop_reason: 'end_turn',
      usage: { input_tokens: 1200 + n * 37, output_tokens: 600 + n * 113, cache_read_input_tokens: 20000 + n * 900, cache_creation_input_tokens: 1500 }, content: [{ type: 'text', text: a }] } });
    else if (kind === 'tool') lines.push({ ...base(t), type: 'assistant', message: { id: `msg_${n}`, model, stop_reason: 'tool_use',
      usage: { input_tokens: 900 + n * 29, output_tokens: 300 + n * 91, cache_read_input_tokens: 18000 + n * 700, cache_creation_input_tokens: 800 },
      content: [{ type: 'tool_use', id: `toolu_${n}`, name: a, input: b }] } });
    else if (kind === 'result') lines.push({ ...base(t), type: 'user', toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${a}`, content: 'ok', is_error: !!b }] } });
    else if (kind === 'turn') lines.push({ ...base(t), type: 'system', subtype: 'turn_duration', durationMs: a, messageCount: 6 });
  }
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

const CODE = `export function greet(name) {
  // Say hello, politely.
  const who = String(name ?? 'world').trim();
  if (!who) throw new Error('nobody to greet');
  return \`Hello, \${who}!\`;
}

export const farewell = (name) => \`Goodbye, \${name}.\`;
`;

const SESSIONS = [
  { sid: '11111111-aaaa-4aaa-8aaa-000000000001', pid: PIDS[0], name: 'api-server', status: 'busy', since: 4, cwd: '/Users/fixture/code/api-server', branch: 'feat/rate-limits',
    title: 'Add rate limiting to the API', steps: [
      [40, 'prompt', 'Add per-user rate limiting to the public API, with tests'], [39, 'say', 'I’ll start by reading the request pipeline.'],
      [38, 'tool', 'Read', { file_path: '/Users/fixture/code/api-server/src/app.js' }], [38, 'result', 3],
      [30, 'tool', 'Edit', { file_path: '/Users/fixture/code/api-server/src/greet.js', old_string: 'old', new_string: CODE }], [30, 'result', 5],
      [20, 'turn', 1200000], [12, 'prompt', 'Now run the tests'], [11, 'tool', 'Bash', { command: 'npm test', description: 'Run the test suite' }]] },
  { sid: '11111111-aaaa-4aaa-8aaa-000000000002', pid: PIDS[1], name: 'docs-site', status: 'busy', since: 9, cwd: '/Users/fixture/code/docs-site', branch: 'main',
    title: 'Rewrite the getting started guide', steps: [
      [55, 'prompt', 'Rewrite the getting started guide so it fits on one page'], [54, 'say', 'Reading the current guide first.'],
      [50, 'tool', 'Write', { file_path: '/Users/fixture/code/docs-site/guide.md', content: '# Getting started\n\nInstall it, run it, open the office.\n' }], [50, 'result', 3],
      [9, 'prompt', 'Add a section on the office'], [8, 'say', 'Adding it after the install steps.']] },
  { sid: '11111111-aaaa-4aaa-8aaa-000000000003', pid: PIDS[2], name: 'infra', status: 'shell', since: 2, cwd: '/Users/fixture/code/infra', branch: 'ops/upgrade',
    title: 'Upgrade the build image', steps: [
      [25, 'prompt', 'Upgrade the build image to the new LTS and rebuild'], [24, 'tool', 'Bash', { command: 'docker build .', description: 'Rebuild the image' }]] },
  { sid: '11111111-aaaa-4aaa-8aaa-000000000004', pid: PIDS[3], name: 'mobile', status: 'idle', since: 17, cwd: '/Users/fixture/code/mobile', branch: 'fix/login',
    title: 'Fix the login crash', steps: [
      [70, 'prompt', 'The app crashes on login with an empty password'], [69, 'say', 'Found it: the validator assumes a string.'], [60, 'turn', 540000]] },
  { sid: '11111111-aaaa-4aaa-8aaa-000000000005', pid: PIDS[4], name: 'notes', status: 'idle', since: 33, cwd: '/Users/fixture/notes', branch: null,
    title: null, steps: [[90, 'prompt', 'Summarise this week’s meeting notes'], [89, 'say', 'Here’s the summary.'], [88, 'turn', 60000]] },
];
const RECENT = [
  { sid: '22222222-bbbb-4bbb-8bbb-000000000001', cwd: '/Users/fixture/code/api-server', branch: 'main', title: 'Bump dependencies',
    steps: [[300, 'prompt', 'Bump all dependencies'], [299, 'tool', 'Bash', { command: 'npm update' }], [298, 'result', 2], [290, 'say', 'Done.'], [289, 'turn', 600000]] },
  { sid: '22222222-bbbb-4bbb-8bbb-000000000002', cwd: '/Users/fixture/code/docs-site', branch: 'main', title: 'Fix broken links',
    steps: [[500, 'prompt', 'Fix the broken links'], [499, 'tool', 'Grep', { pattern: 'http://' }], [498, 'result', 2], [480, 'say', 'Fixed 12 links.'], [479, 'turn', 1200000]] },
];

export function makeHome(home) {
  const claude = path.join(home, '.claude');
  const proj = (cwd) => path.join(claude, 'projects', cwd.replace(/\//g, '-'));
  for (const s of SESSIONS) {
    write(path.join(claude, 'sessions', `${s.pid}.json`), { pid: s.pid, sessionId: s.sid, name: s.name, status: s.status, statusUpdatedAt: T0 - s.since * MIN,
      startedAt: T0 - 120 * MIN, cwd: s.cwd, kind: 'interactive', entrypoint: 'cli', version: '2.9.0' });
    write(path.join(proj(s.cwd), `${s.sid}.jsonl`), transcript(s, s.steps), T0 - s.since * MIN);
  }
  for (const s of RECENT) write(path.join(proj(s.cwd), `${s.sid}.jsonl`), transcript(s, s.steps), T0 - 280 * MIN);
  // A subagent of the first session, still at work.
  const sub = path.join(proj(SESSIONS[0].cwd), SESSIONS[0].sid, 'subagents', 'agent-fixture1.jsonl');
  write(sub, transcript({ cwd: SESSIONS[0].cwd, branch: SESSIONS[0].branch }, [[6, 'tool', 'Grep', { pattern: 'rateLimit' }]]), T0 - 20e3);
  write(sub.replace(/\.jsonl$/, '.meta.json'), { agentType: 'Explore', description: 'Find the rate limit hooks', requestShape: 'foreground', spawnDepth: 1 });
  // Status lines for two sessions, one carrying the account's rate limits.
  write(path.join(claude, 'my-office', 'statusline', `${SESSIONS[0].sid}.json`), { session_name: 'api-server', model: { display_name: 'Opus 5.5' }, effort: { level: 'high' },
    cost: { total_cost_usd: 4.37, total_lines_added: 182, total_lines_removed: 40 }, context_window: { used_percentage: 46 },
    rate_limits: { five_hour: { used_percentage: 38, resets_at: (T0 + 130 * MIN) / 1000 }, seven_day: { used_percentage: 72, resets_at: (T0 + 3 * 1440 * MIN) / 1000 } } }, T0 - 2 * MIN);
  write(path.join(claude, 'my-office', 'statusline', `${SESSIONS[1].sid}.json`), { session_name: 'docs-site', model: { display_name: 'Opus 5.5' },
    cost: { total_cost_usd: 1.12, total_lines_added: 30, total_lines_removed: 12 }, context_window: { used_percentage: 83 } }, T0 - 3 * MIN);
  // claude-powerline's daily history.
  for (let i = 12; i >= 1; i--) {
    const d = new Date(T0 - i * 1440 * MIN).toISOString().slice(0, 10);
    write(path.join(claude, 'powerline', 'usage', `day-${d}.json`), { data: { cost: 3 + ((i * 7) % 11) * 1.7, entryCount: 40 + i * 3,
      tokenBreakdown: { input: 50000 * i, output: 9000 * i, cacheCreation: 20000, cacheRead: 400000 + i * 1000 } } });
  }
  // A cached ad list, so the server doesn't go and fetch one.
  write(path.join(claude, 'my-office', 'adblock', 'hosts'), '0.0.0.0 ads.example.com\n0.0.0.0 tracker.example.net\n', T0 - MIN);
  // The task board in my office: a few of each kind of card in each column (one overdue, one with a long story).
  const card = (id, col, kind, color, title, body, more = {}) => ({ id, col, kind, color, title, body, prio: 0, due: '', labels: [], who: '', archived: false,
    created: T0 - 3 * 1440 * MIN, updated: T0 - 60 * MIN, ...more });
  write(path.join(claude, 'my-office', 'board.json'), { rev: 7, columns: [['backlog', 'Backlog'], ['todo', 'To do'], ['doing', 'Doing'], ['review', 'Review'], ['done', 'Done']]
    .map(([id, name]) => ({ id, name })), cards: [
    card('fix00001', 'backlog', 'index', 'white', 'Dark mode for the docs', 'People keep asking.\nCheck contrast on code blocks first.', { prio: 1, labels: ['docs'] }),
    card('fix00002', 'backlog', 'sticky', 'pink', 'Call the bank', 'About the card limit', { who: 'TW' }),
    card('fix00003', 'backlog', 'sticky', 'blue', 'Book dentist', ''),
    card('fix00004', 'todo', 'index', 'white', 'Rate limits: per-user buckets', 'Token bucket per API key.\nBurst 20, refill 5/s.\nReturn Retry-After on 429.\nTests for the edge of the window.\nAsk ops about Redis.',
      { prio: 3, due: '2026-06-16', labels: ['api', 'backend'], who: 'TW' }),
    card('fix00005', 'todo', 'sticky', 'yellow', 'Renew domain!', 'expires end of June', { prio: 2, due: '2026-06-28' }),
    card('fix00006', 'doing', 'index', 'yellow', 'Getting started guide', 'Fit it on one page. Screenshots of the office.', { prio: 2, labels: ['docs'], who: 'JD' }),
    card('fix00007', 'doing', 'sticky', 'green', 'Upgrade build image', 'node LTS + rebuild', { labels: ['infra'] }),
    card('fix00008', 'review', 'index', 'blue', 'Login crash on empty password', 'Validator assumed a string. Fixed + test.', { prio: 3, labels: ['mobile', 'bug'], who: 'AK' }),
    card('fix00009', 'done', 'index', 'white', 'Bump dependencies', 'All green.', { labels: ['chore'] }),
    card('fix00010', 'done', 'sticky', 'orange', 'Fix broken links', '12 of them', {}),
    card('fix00011', 'done', 'index', 'white', 'Old idea', 'Archived long ago', { archived: true }),
  ] });
  return { sessions: SESSIONS.map((s) => s.sid) };
}
export const SESSION_IDS = SESSIONS.map((s) => s.sid);
