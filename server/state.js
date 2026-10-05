// The live picture: which sessions are running (~/.claude/sessions), their status lines and processes, and the state
// pushed to every browser once a second.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { CLAUDE, readJSON, pidAlive, hourKey, minuteKey, clients } = require('./util');
const { transcripts, bySession, track, feedCount } = require('./transcripts');

const SESSIONS_DIR = path.join(CLAUDE, 'sessions');
const STATUSLINE_DIRS = [path.join(CLAUDE, 'my-office', 'statusline'), path.join(CLAUDE, 'dashboard', 'statusline')];
const POWERLINE_DIR = path.join(CLAUDE, 'powerline', 'usage');
const ownPids = new Set();   // this server's own claude processes (John's), which aren't sessions

// ---------- live registry + status line snapshots ----------
let registry = [];
let procStats = {};

function readRegistry() {
  let files;
  try { files = fs.readdirSync(SESSIONS_DIR).filter((f) => /^\d+\.json$/.test(f)); } catch { files = []; }
  const out = [];
  for (const f of files) {
    const r = readJSON(path.join(SESSIONS_DIR, f));
    if (!r || !r.pid || !pidAlive(r.pid) || ownPids.has(r.pid)) continue;   // John's own claude -p isn't a session
    out.push(r);
  }
  registry = out;
  // Live sessions older than the scan window still need their transcript tracked.
  for (const r of registry) {
    const file = bySession.get(r.sessionId);
    if (file) track(file, Date.now(), true);
  }
}

function readStatusline(sid) {
  for (const dir of STATUSLINE_DIRS) {
    const f = path.join(dir, `${sid}.json`);
    const s = readJSON(f);
    if (!s) continue;
    try { s._mtime = fs.statSync(f).mtimeMs; } catch {}
    return s;
  }
  return null;
}

function pollProcs() {
  const pids = registry.map((r) => r.pid);
  if (!pids.length) return;
  execFile('ps', ['-o', 'pid=,%cpu=,rss=', '-p', pids.join(',')], (err, out) => {
    if (!out) return;
    const next = {};
    for (const l of out.trim().split('\n')) {
      const [pid, cpu, rss] = l.trim().split(/\s+/);
      next[pid] = { cpu: Number(cpu), rssMB: Math.round(Number(rss) / 1024) };
    }
    procStats = next;
  });
}

function readPowerlineDays() {
  let files;
  try { files = fs.readdirSync(POWERLINE_DIR).filter((f) => /^day-\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { return []; }
  return files.sort().map((f) => {
    const d = readJSON(path.join(POWERLINE_DIR, f));
    if (!d?.data) return null;
    const tb = d.data.tokenBreakdown || {};
    return { date: f.slice(4, 14), cost: d.data.cost, entries: d.data.entryCount,
      tokens: (tb.input || 0) + (tb.output || 0) + (tb.cacheCreation || 0) + (tb.cacheRead || 0), output: tb.output || 0 };
  }).filter(Boolean).slice(-30);
}

// ---------- state assembly ----------
const STATUS_LABELS = { busy: 'working', idle: 'idle', shell: 'shell' };

function transcriptSummary(tr, { events = 40 } = {}) {
  const now = Date.now();
  const spark = [];
  for (let i = 59; i >= 0; i--) spark.push(tr.minutes.get(minuteKey(now - i * 60e3)) || 0);
  const pending = [...tr.pending.values()].sort((a, b) => b.t - a.t)[0] || null;
  return {
    sessionId: tr.sessionId, file: tr.file, cwd: tr.cwd, branch: tr.branch, title: tr.customTitle || tr.title,
    model: tr.model, models: tr.models, effort: tr.effort, permissionMode: tr.permissionMode, entrypoint: tr.entrypoint,
    tokens: tr.tokens, cost: tr.cost, apiCalls: tr.apiCalls, tools: tr.tools, prompts: tr.prompts, errors: tr.errors,
    turns: tr.turns.length, avgTurnMs: tr.turns.length ? tr.turns.reduce((a, b) => a + b, 0) / tr.turns.length : 0,
    lastTurnMs: tr.turns.at(-1) || 0, prs: [...tr.prs.values()], first: tr.first, last: tr.last, mtime: tr.mtime,
    lastPrompt: tr.lastPrompt, lastPromptAt: tr.lastPromptAt, contextTokens: tr.contextTokens, lastStop: tr.lastStop,
    pendingTool: pending, spark, events: tr.events.slice(-events),
  };
}

function subagentsOf(sessionId) {
  const out = [];
  for (const tr of transcripts.values()) {
    if (tr.parentId !== sessionId) continue;
    const meta = readJSON(tr.file.replace(/\.jsonl$/, '.meta.json')) || {};
    const pending = [...tr.pending.values()].at(-1);
    out.push({
      id: path.basename(tr.file, '.jsonl'), type: meta.agentType, description: meta.description,
      background: meta.requestShape === 'background', depth: meta.spawnDepth,
      active: Date.now() - (tr.mtime || 0) < 45e3 && tr.lastStop !== 'end_turn',
      cost: tr.cost, tokens: tr.tokens, apiCalls: tr.apiCalls, toolCalls: Object.values(tr.tools).reduce((a, b) => a + b, 0),
      model: tr.model, first: tr.first, last: tr.last, current: pending ? `${pending.name}: ${pending.detail}` : null,
    });
  }
  return out.sort((a, b) => b.last - a.last);
}

// Latest successful edit by a session or any of its subagents, with the line it landed on.
const lineCache = new Map();   // edit id -> start line (1-based) or 0 if unknown
function latestCode(sessionId, tr) {
  let best = null, count = tr.codeCount, agent = null;
  const consider = (t, label) => {
    for (let i = t.code.length - 1; i >= 0; i--) {
      const c = t.code[i];
      if (c.failed) continue;
      if (!best || c.t > best.t) { best = c; agent = label; }
      break;
    }
  };
  consider(tr, null);
  for (const sub of transcripts.values()) {
    if (sub.parentId !== sessionId || !sub.code.length) continue;
    count += sub.codeCount;
    const meta = readJSON(sub.file.replace(/\.jsonl$/, '.meta.json')) || {};
    consider(sub, meta.description || meta.agentType || 'subagent');
  }
  if (!best) return null;
  if (!lineCache.has(best.id)) {
    let line = best.tool === 'Write' ? 1 : 0;
    try {
      if (!line && fs.statSync(best.file).size < 4e6) {
        const text = fs.readFileSync(best.file, 'utf8'), at = text.indexOf(best.added.slice(0, 400));
        if (at >= 0) line = text.slice(0, at).split('\n').length;
      }
    } catch {}
    lineCache.set(best.id, line);
  }
  const cwd = tr.cwd || '';
  return { id: best.id, t: best.t, tool: best.tool, agent, count, line: lineCache.get(best.id),
    file: cwd && best.file?.startsWith(cwd + '/') ? best.file.slice(cwd.length + 1) : best.file,
    added: best.added, removed: best.removed };
}

// The status line's cost already includes subagents; the transcript estimate does not.
function sessionCost(s) {
  const sl = s.statusline?.cost?.total_cost_usd;
  return sl ? sl : (s.transcript?.cost || 0) + s.subagents.cost;
}

function buildState() {
  const now = Date.now();
  const liveIds = new Set(registry.map((r) => r.sessionId));
  let rateLimits = null, rlAt = 0;

  const live = registry.map((r) => {
    const file = bySession.get(r.sessionId);
    const tr = file && transcripts.get(file);
    const sl = readStatusline(r.sessionId);
    if (sl?.rate_limits && sl._mtime > rlAt) { rateLimits = sl.rate_limits; rlAt = sl._mtime; }
    const subs = subagentsOf(r.sessionId);
    return {
      pid: r.pid, sessionId: r.sessionId, name: r.name, status: STATUS_LABELS[r.status] || r.status,
      rawStatus: r.status, statusSince: r.statusUpdatedAt, startedAt: r.startedAt, cwd: r.cwd, kind: r.kind,
      entrypoint: r.entrypoint, version: r.version, proc: procStats[r.pid] || null,
      statusline: sl && {
        name: sl.session_name, model: sl.model?.display_name, effort: sl.effort?.level, cost: sl.cost,
        context: sl.context_window, cache: sl.prompt_cache, repo: sl.workspace?.repo, worktree: sl.workspace?.git_worktree,
        thinking: sl.thinking?.enabled, at: sl._mtime,
      },
      transcript: tr ? transcriptSummary(tr) : null,
      code: tr ? latestCode(r.sessionId, tr) : null,
      feedN: tr ? feedCount(r.sessionId, tr) : 0,   // terminal feed lines so far: the office fetches /feed when this moves
      subagents: { total: subs.length, active: subs.filter((s) => s.active).length, cost: subs.reduce((a, s) => a + s.cost, 0), list: subs.slice(0, 12) },
    };
  }).map((s) => ({ ...s, cost: sessionCost(s) }))
    .sort((a, b) => (a.status === 'working' ? 0 : 1) - (b.status === 'working' ? 0 : 1) || (b.transcript?.last || 0) - (a.transcript?.last || 0));

  // Recent sessions that are no longer running.
  const recent = [];
  for (const [sid, file] of bySession) {
    if (liveIds.has(sid)) continue;
    const tr = transcripts.get(file);
    if (!tr || !tr.apiCalls || now - tr.last > 24 * 3600e3) continue;
    // Skip Claude Code's own one-shot helper calls (branch names, titles): no tools, no title, seconds long.
    if (!tr.title && !Object.keys(tr.tools).length && tr.prompts <= 1 && tr.last - tr.first < 60e3) continue;
    recent.push({ sessionId: sid, title: tr.customTitle || tr.title, cwd: tr.cwd, branch: tr.branch, model: tr.model,
      cost: tr.cost + subagentsOf(sid).reduce((a, s) => a + s.cost, 0), prompts: tr.prompts, apiCalls: tr.apiCalls,
      toolCalls: Object.values(tr.tools).reduce((a, b) => a + b, 0), first: tr.first, last: tr.last, lastPrompt: tr.lastPrompt });
  }
  recent.sort((a, b) => b.last - a.last);

  // Hourly totals over the last 24h + today, across every tracked transcript (subagents included).
  const hours = new Map();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const today = { cost: 0, tokens: 0, output: 0, apiCalls: 0, sessions: new Set() };
  const models = {};
  const toolTotals = {};
  for (const tr of transcripts.values()) {
    for (const [h, v] of tr.hours) {
      if (h >= hourKey(now) - 23 * 3600e3) {
        const sid = tr.parentId || tr.sessionId;
        const o = hours.get(h) || { cost: 0, tokens: 0, output: 0, bySession: {} };
        o.cost += v.cost; o.tokens += v.tokens; o.output += v.output;
        o.bySession[sid] = (o.bySession[sid] || 0) + v.cost;
        hours.set(h, o);
      }
      if (h >= startToday.getTime()) {
        today.cost += v.cost; today.tokens += v.tokens; today.output += v.output;
        today.sessions.add(tr.parentId || tr.sessionId);
      }
    }
    if (tr.last >= startToday.getTime()) {
      for (const [m, v] of Object.entries(tr.models)) {
        const o = models[m] ||= { calls: 0, cost: 0 }; o.calls += v.calls; o.cost += v.cost;
      }
      for (const [k, v] of Object.entries(tr.tools)) toolTotals[k] = (toolTotals[k] || 0) + v;
    }
  }
  const hourly = [];
  for (let i = 23; i >= 0; i--) {
    const h = hourKey(now) - i * 3600e3;
    hourly.push({ t: h, ...(hours.get(h) || { cost: 0, tokens: 0, output: 0, bySession: {} }) });
  }

  // Merged live feed across running sessions.
  const feed = [];
  for (const s of live) {
    for (const e of s.transcript?.events || []) feed.push({ ...e, sessionId: s.sessionId, session: s.statusline?.name || s.transcript?.title || s.name });
  }
  feed.sort((a, b) => b.t - a.t);

  // Today's bar uses this dashboard's deduplicated estimate so it matches the Today tile.
  const days = readPowerlineDays();
  const todayKey = new Date(startToday.getTime() - startToday.getTimezoneOffset() * 60e3).toISOString().slice(0, 10);
  const td = days.find((d) => d.date === todayKey);
  if (td) Object.assign(td, { cost: today.cost, tokens: today.tokens, output: today.output, live: true });
  else days.push({ date: todayKey, cost: today.cost, tokens: today.tokens, output: today.output, entries: 0, live: true });
  return {
    now, host: os.hostname(), rateLimits, rateLimitsAt: rlAt || null,
    totals: {
      live: live.length, working: live.filter((s) => s.status === 'working').length,
      subagentsActive: live.reduce((a, s) => a + s.subagents.active, 0),
      todayCost: today.cost, todayTokens: today.tokens, todayOutput: today.output, todaySessions: today.sessions.size,
      liveCost: live.reduce((a, s) => a + sessionCost(s), 0),
      linesAdded: live.reduce((a, s) => a + (s.statusline?.cost?.total_lines_added || 0), 0),
      linesRemoved: live.reduce((a, s) => a + (s.statusline?.cost?.total_lines_removed || 0), 0),
    },
    models, tools: toolTotals, hourly, days, live, recent: recent.slice(0, 30), feed: feed.slice(0, 80),
  };
}

// ---------- loop ----------
let state = null, stateJSON = '';

function tick() {
  readRegistry();
  for (const tr of transcripts.values()) {
    try { tr.poll(); } catch (e) { console.error('poll', tr.file, e.message); }
  }
  state = buildState();
  const json = JSON.stringify(state);
  if (json !== stateJSON) {
    stateJSON = json;
    for (const res of clients) res.write(`data: ${json}\n\n`);
  }
}

module.exports = {
  get registry() { return registry; }, get procStats() { return procStats; }, get state() { return state; }, get stateJSON() { return stateJSON; },
  ownPids, STATUS_LABELS, readRegistry, pollProcs, tick, transcriptSummary, subagentsOf,
};
