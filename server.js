#!/usr/bin/env node
// my-office: tails Claude Code's on-disk state and streams it to a browser (overview + 3D office).
//
// Sources (all read-only):
//   ~/.claude/sessions/<pid>.json              live session registry (name, status, cwd)
//   ~/.claude/projects/**/<session>.jsonl      transcripts (tokens, tools, prompts, subagents)
//   ~/.claude/my-office/statusline/<sid>.json  latest status line payload (cost, context, limits), written by bin/statusline-tap.sh
//   ~/.claude/powerline/usage/day-*.json       claude-powerline's daily cost cache (history)

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { execFile, spawn } = require('child_process');

// config.json (written by `npm run setup`) holds owner name, location and port; env vars override.
const CONFIG = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; } })();
const PORT = Number(process.env.PORT || CONFIG.port || 7777);
const HOST = process.env.HOST || CONFIG.host || '127.0.0.1';
const CLAUDE = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE, 'sessions');
const PROJECTS_DIR = path.join(CLAUDE, 'projects');
const STATUSLINE_DIRS = [path.join(CLAUDE, 'my-office', 'statusline'), path.join(CLAUDE, 'dashboard', 'statusline')];
const POWERLINE_DIR = path.join(CLAUDE, 'powerline', 'usage');
const WINDOW_MS = 48 * 3600e3;          // transcripts touched within this window are tracked
const MAX_EVENTS = 400;                  // per transcript
const READ_CHUNK = 8 * 1024 * 1024;
const CODE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const CODE_CAP = 8000;            // chars of written code kept per edit

// ---------- pricing (API-equivalent USD per MTok) ----------
// [input, output, cacheRead]; cache writes are 1.25x input (5m) or 2x input (1h).
const PRICES = [
  [/fable|mythos/, [10, 50, 0.25]],
  [/opus-5-5/, [4, 20, 0.2]],
  [/opus/, [5, 25, 0.5]],
  [/sonnet-5/, [2, 10, 0.2]],
  [/sonnet/, [3, 15, 0.3]],
  [/haiku/, [1, 5, 0.1]],
];
function priceFor(model) {
  for (const [re, p] of PRICES) if (re.test(model || '')) return p;
  return [4, 20, 0.2];
}
function costOf(model, u) {
  const [inp, out, cr] = priceFor(model);
  const mult = u.speed === 'fast' ? 2 : 1;
  const cc = u.cache_creation || {};
  const w1h = cc.ephemeral_1h_input_tokens || 0;
  const w5m = cc.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
  return mult * ((u.input_tokens || 0) * inp + (u.output_tokens || 0) * out +
    (u.cache_read_input_tokens || 0) * cr + w5m * inp * 1.25 + w1h * inp * 2) / 1e6;
}

// ---------- helpers ----------
const safeJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const clip = (s, n = 220) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const ts = (s) => (s ? Date.parse(s) : 0) || 0;
const hourKey = (t) => Math.floor(t / 3600e3) * 3600e3;
const minuteKey = (t) => Math.floor(t / 60e3) * 60e3;

function toolDetail(name, input = {}) {
  const base = (p) => (p ? String(p).split('/').slice(-2).join('/') : '');
  switch (name) {
    case 'Bash': return input.description || input.command;
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit': return base(input.file_path || input.notebook_path);
    case 'Grep': case 'Glob': return input.pattern;
    case 'WebFetch': try { return new URL(input.url).host; } catch { return input.url; }
    case 'WebSearch': return input.query;
    case 'Agent': case 'Task': return input.description || input.subagent_type;
    case 'Skill': return input.skill;
    default: {
      const v = Object.values(input).find((x) => typeof x === 'string');
      return v || '';
    }
  }
}

// The code a file-writing tool call writes, and what it replaced.
function codeOf(name, input = {}) {
  const cap = (x) => String(x ?? '').slice(0, CODE_CAP);
  switch (name) {
    case 'Write': return { file: input.file_path, added: cap(input.content), removed: '' };
    case 'Edit': return { file: input.file_path, added: cap(input.new_string), removed: cap(input.old_string).slice(0, 2000) };
    case 'MultiEdit': return { file: input.file_path, added: cap((input.edits || []).map((e) => e.new_string).join('\n\n')),
      removed: cap((input.edits || []).map((e) => e.old_string).join('\n')).slice(0, 2000) };
    case 'NotebookEdit': return { file: input.notebook_path, added: cap(input.new_source), removed: '' };
  }
  return null;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((c) => c.type === 'text').map((c) => c.text).join(' ');
  return '';
}

// ---------- transcript tracking ----------
// One Transcript per jsonl file (main sessions and subagents alike), parsed incrementally.
class Transcript {
  constructor(file) {
    this.file = file;
    this.offset = 0;
    this.partial = '';
    this.sessionId = path.basename(file, '.jsonl');
    this.isSubagent = file.includes(`${path.sep}subagents${path.sep}`);
    this.parentId = this.isSubagent ? path.basename(path.dirname(path.dirname(file))) : null;
    this.msgIds = new Map();        // message.id -> {cost, tokens} (Claude Code repeats usage per content block)
    this.tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    this.cost = 0;
    this.apiCalls = 0;
    this.models = {};
    this.tools = {};
    this.pending = new Map();       // tool_use_id -> {name, detail, t}
    this.code = [];                 // recent file edits: {id, t, tool, file, added, removed}
    this.codeCount = 0;
    this.events = [];
    this.prompts = 0;
    this.errors = 0;
    this.turns = [];                // turn durations (ms)
    this.prs = new Map();
    this.minutes = new Map();       // minuteKey -> output tokens
    this.hours = new Map();         // hourKey -> {cost, tokens}
    this.first = 0; this.last = 0;
    this.lastStop = null;
    this.title = null; this.lastPrompt = null; this.branch = null; this.cwd = null;
    this.permissionMode = null; this.effort = null; this.model = null; this.entrypoint = null;
    this.contextTokens = 0;
  }

  poll() {
    let st;
    try { st = fs.statSync(this.file); } catch { return false; }
    this.mtime = st.mtimeMs;
    if (st.size < this.offset) { Object.assign(this, new Transcript(this.file)); }
    if (st.size === this.offset) return false;
    const fd = fs.openSync(this.file, 'r');
    try {
      while (this.offset < st.size) {
        const len = Math.min(READ_CHUNK, st.size - this.offset);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, this.offset);
        this.offset += len;
        const lines = (this.partial + buf.toString('utf8')).split('\n');
        this.partial = lines.pop();
        for (const l of lines) if (l) this.ingest(l);
      }
    } finally { fs.closeSync(fd); }
    return true;
  }

  push(ev) {
    this.events.push(ev);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  ingest(line) {
    const d = safeJSON(line);
    if (!d) return;
    const t = ts(d.timestamp);
    if (t) { if (!this.first) this.first = t; this.last = Math.max(this.last, t); }
    if (d.gitBranch) this.branch = d.gitBranch;
    if (d.cwd) this.cwd = d.cwd;
    if (d.entrypoint) this.entrypoint = d.entrypoint;
    switch (d.type) {
      case 'ai-title': this.title = d.aiTitle; return;
      case 'custom-title': this.customTitle = d.customTitle || d.title; return;
      case 'last-prompt': return;
      case 'permission-mode': this.permissionMode = d.permissionMode; return;
      case 'pr-link': this.prs.set(d.prUrl, { url: d.prUrl, number: d.prNumber, repo: d.prRepository, t }); return;
      case 'system':
        if (d.subtype === 'turn_duration') {
          this.turns.push(d.durationMs);
          this.push({ t, kind: 'turn', ms: d.durationMs, n: d.messageCount });
        } else if (d.subtype === 'away_summary') {
          this.push({ t, kind: 'recap', text: clip(d.content, 400) });
        } else if (d.level === 'error' || /error/i.test(d.subtype || '')) {
          this.errors++;
          this.push({ t, kind: 'error', text: clip(d.content || d.subtype) });
        } else if (d.subtype === 'compact_boundary') {
          this.push({ t, kind: 'compact', text: 'Context compacted' });
        }
        return;
      case 'assistant': return this.ingestAssistant(d, t);
      case 'user': return this.ingestUser(d, t);
    }
  }

  ingestAssistant(d, t) {
    const m = d.message || {};
    if (d.effort) this.effort = d.effort;
    if (m.model && m.model !== '<synthetic>') this.model = m.model;
    if (m.stop_reason) this.lastStop = m.stop_reason;
    const u = m.usage;
    if (u && m.id && !this.msgIds.has(m.id) && m.model !== '<synthetic>') {
      const c = costOf(m.model, u);
      const tok = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      this.msgIds.set(m.id, 1);
      this.apiCalls++;
      this.cost += c;
      this.tokens.input += u.input_tokens || 0;
      this.tokens.output += u.output_tokens || 0;
      this.tokens.cacheRead += u.cache_read_input_tokens || 0;
      this.tokens.cacheWrite += u.cache_creation_input_tokens || 0;
      this.contextTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
      const mm = this.models[m.model] ||= { calls: 0, cost: 0, output: 0 };
      mm.calls++; mm.cost += c; mm.output += u.output_tokens || 0;
      if (t) {
        const mk = minuteKey(t);
        this.minutes.set(mk, (this.minutes.get(mk) || 0) + (u.output_tokens || 0));
        const h = this.hours.get(hourKey(t)) || { cost: 0, tokens: 0, output: 0 };
        h.cost += c; h.tokens += tok; h.output += u.output_tokens || 0;
        this.hours.set(hourKey(t), h);
      }
    }
    for (const c of m.content || []) {
      if (c.type === 'tool_use') {
        const detail = clip(toolDetail(c.name, c.input), 160);
        this.tools[c.name] = (this.tools[c.name] || 0) + 1;
        this.pending.set(c.id, { name: c.name, detail, t });
        this.push({ t, kind: 'tool', name: c.name, text: detail, id: c.id });
        if (CODE_TOOLS.has(c.name)) {
          const code = codeOf(c.name, c.input);
          if (code?.added) {
            this.code.push({ id: c.id, t, tool: c.name, ...code });
            if (this.code.length > 6) this.code.shift();
            this.codeCount++;
          }
        }
      } else if (c.type === 'text' && c.text && c.text.trim()) {
        this.push({ t, kind: 'say', text: clip(c.text, 400) });
      }
    }
  }

  ingestUser(d, t) {
    const m = d.message || {};
    const content = m.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c.type !== 'tool_result') continue;
        const p = this.pending.get(c.tool_use_id);
        this.pending.delete(c.tool_use_id);
        const ev = this.events.findLast?.((e) => e.id === c.tool_use_id);
        if (ev && t && ev.t) ev.ms = t - ev.t;
        if (c.is_error) {
          this.errors++;
          const ce = this.code.find((x) => x.id === c.tool_use_id);
          if (ce) ce.failed = true;
          if (ev) ev.error = true;
          this.push({ t, kind: 'error', name: p?.name, text: clip(textOf(c.content) || 'Tool error', 220) });
        }
      }
    }
    if (d.isMeta || d.toolUseResult !== undefined) return;
    const kind = d.origin?.kind;
    const text = textOf(content);
    if (!text || (Array.isArray(content) && content.some((c) => c.type === 'tool_result'))) return;
    if (kind === 'human' || (!kind && d.promptSource)) {
      if (/^<(local-command|command-name|command-message|system-reminder)/.test(text.trim())) {
        const cmd = text.match(/<command-name>([^<]+)</);
        if (cmd) this.push({ t, kind: 'command', text: cmd[1] });
        return;
      }
      this.prompts++;
      this.lastPrompt = clip(text, 300);
      this.lastPromptAt = t;
      this.push({ t, kind: 'prompt', text: clip(text, 600) });
    } else if (kind === 'task-notification') {
      const s = text.match(/<summary>([\s\S]*?)<\/summary>/);
      this.push({ t, kind: 'notify', text: clip(s ? s[1] : text, 200) });
    } else if (kind) {
      this.push({ t, kind: 'notify', text: clip(`${kind}: ${text}`, 200) });
    }
  }
}

const transcripts = new Map();   // file -> Transcript
const bySession = new Map();     // sessionId -> file (main transcripts only)

function listTranscripts() {
  const now = Date.now();
  let dirs;
  try { dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }); } catch { return; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const pdir = path.join(PROJECTS_DIR, d.name);
    let ents;
    try { ents = fs.readdirSync(pdir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const full = path.join(pdir, e.name);
      if (e.isFile() && e.name.endsWith('.jsonl')) {
        bySession.set(path.basename(e.name, '.jsonl'), full);
        track(full, now);
      } else if (e.isDirectory()) {
        const sub = path.join(full, 'subagents');
        let subs;
        try { subs = fs.readdirSync(sub); } catch { continue; }
        for (const s of subs) if (s.endsWith('.jsonl')) track(path.join(sub, s), now);
      }
    }
  }
}

function track(file, now, force = false) {
  if (transcripts.has(file)) return;
  if (!force) {
    let st;
    try { st = fs.statSync(file); } catch { return; }
    if (now - st.mtimeMs > WINDOW_MS) return;
  }
  transcripts.set(file, new Transcript(file));
}

// ---------- live registry + status line snapshots ----------
let registry = [];
let procStats = {};

function readRegistry() {
  let files;
  try { files = fs.readdirSync(SESSIONS_DIR).filter((f) => /^\d+\.json$/.test(f)); } catch { files = []; }
  const out = [];
  for (const f of files) {
    const r = readJSON(path.join(SESSIONS_DIR, f));
    if (!r || !r.pid || !pidAlive(r.pid)) continue;
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
const clients = new Set();

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

// ---------- office TVs ----------
// Wall TVs in the 3D office show a URL each. Config lives in ~/.claude/my-office/tvs.json: { id: { url, src, refresh, blocked } }.
// `src` is what the iframe loads (YouTube links become nocookie embeds); `blocked` is why the site refuses to be framed, if it does.
const TVS_FILE = path.join(CLAUDE, 'my-office', 'tvs.json');
let tvs = readJSON(TVS_FILE) || {};
const ytTime = (t) => { const m = String(t || '').match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
function tvSrc(raw) {
  const u = new URL(raw), host = u.hostname.replace(/^(www|m|music)\./, '');
  if (!/^(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(host)) return u.href;
  const list = u.searchParams.get('list');
  if (u.pathname === '/playlist' && list) return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&autoplay=1&mute=1&playsinline=1`;
  const ch = u.pathname.match(/^\/channel\/(UC[\w-]{22})(\/live)?\/?$/)?.[1];
  if (ch) return `https://www.youtube-nocookie.com/embed/live_stream?channel=${ch}&autoplay=1&mute=1&playsinline=1`;
  const id = host === 'youtu.be' ? u.pathname.split('/')[1] : u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?]+)/)?.[1];
  if (!/^[\w-]{6,20}$/.test(id || '')) return u.href;
  const start = ytTime(u.searchParams.get('t') || u.searchParams.get('start'));
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${id}&rel=0${start ? `&start=${start}` : ''}`;
}
// Fetch the page anonymously (never with the user's cookies) and read X-Frame-Options / CSP frame-ancestors.
async function frameBlocked(src) {
  try {
    const r = await fetch(src, { redirect: 'follow', signal: AbortSignal.timeout(6000),
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', accept: 'text/html,*/*' } });
    r.body?.cancel().catch(() => {});
    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
    const fa = (r.headers.get('content-security-policy') || '').match(/frame-ancestors([^;]*)/i)?.[1].trim().toLowerCase();
    const self = new URL(r.url).host;
    if (fa != null && !fa.split(/\s+/).some((s) => s === '*' || /localhost|127\.0\.0\.1/.test(s) || (s === "'self'" && /^(localhost|127\.0\.0\.1)(:|$)/.test(self)))) return `the site forbids embedding elsewhere (CSP frame-ancestors ${fa || "'none'"})`;
    if (fa == null && /deny|sameorigin/.test(xfo) && !/^(localhost|127\.0\.0\.1)(:|$)/.test(self)) return `the site refuses to be framed (X-Frame-Options: ${xfo.toUpperCase()})`;
    return null;
  } catch { return null; }   // unreachable from here: let the browser try
}
// Snapshot of a TV's page, painted on the screen while its live iframe is unmounted (the browser can't read pixels out of
// a cross-origin iframe). YouTube uses the video thumbnail; anything else is shot by a headless Chrome with a throwaway
// profile, so the user's cookies are never involved. Cached per TV in ~/.claude/my-office/tv-snaps.
const SNAP_DIR = path.join(CLAUDE, 'my-office', 'tv-snaps');
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
const snapping = new Map();
let chromes = 0;   // headless shots in flight; capped so a page full of TVs can't spawn a crowd of browsers
function snapTv(id, maxAge) {
  const c = tvs[id], file = path.join(SNAP_DIR, `${id}.png`);
  if (!c || c.blocked) return Promise.resolve(null);
  try { const st = fs.statSync(file); if (st.mtimeMs > (c.at || 0) && Date.now() - st.mtimeMs < maxAge) return Promise.resolve(file); } catch {}
  if (snapping.has(id)) return snapping.get(id);
  const p = (async () => {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    const yt = c.src.match(/youtube-nocookie\.com\/embed\/([\w-]{6,20})\?/)?.[1];
    if (yt) {
      for (const q of ['maxresdefault', 'hqdefault']) {
        const r = await fetch(`https://i.ytimg.com/vi/${yt}/${q}.jpg`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
        if (r?.ok) { fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return file; }
      }
    }
    if (!CHROME || chromes >= 2) return null;
    chromes++;
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'my-office-snap-'));
    try {
      // Chrome often lingers after writing the shot (pages that never go idle), so stop it as soon as the file lands,
      // killing the whole process group so its helpers go too.
      const shot = path.join(prof, 'shot.png');
      const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run',
        `--user-data-dir=${prof}`, '--window-size=1280,720', '--timeout=6000', `--screenshot=${shot}`, c.src], { detached: true, stdio: 'ignore' });
      await new Promise((resolve) => {
        let last = -1;
        const poll = setInterval(() => { const n = fs.existsSync(shot) ? fs.statSync(shot).size : -1; if (n > 0 && n === last) done(); last = n; }, 300);
        const cap = setTimeout(done, 20000);
        ch.on('exit', done); ch.on('error', done);
        function done() { clearInterval(poll); clearTimeout(cap); try { process.kill(-ch.pid, 'SIGKILL'); } catch {} resolve(); }
      });
      if (!fs.existsSync(shot)) return null;
      fs.copyFileSync(shot, file);   // tmp may be another volume
      return file;
    } finally { chromes--; fs.rmSync(prof, { recursive: true, force: true }); }
  })().finally(() => snapping.delete(id));
  snapping.set(id, p);
  return p;
}
function sendTvs() { const json = JSON.stringify(tvs); for (const res of clients) res.write(`event: tvs\ndata: ${json}\n\n`); }
async function putTv(id, body) {
  const url = String(body.url || '').trim(), refresh = Math.min(86400, Math.max(0, Math.round(Number(body.refresh) || 0)));
  if (!url) delete tvs[id];
  else {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || url.length > 2048) throw new Error('only http(s) URLs');
    const src = tvSrc(u.href);
    tvs[id] = { url: u.href, src, refresh, blocked: await frameBlocked(src), at: Date.now() };
  }
  fs.mkdirSync(path.dirname(TVS_FILE), { recursive: true });
  fs.writeFileSync(TVS_FILE, JSON.stringify(tvs, null, 2));
  sendTvs();
  return tvs[id] || null;
}

// ---------- http ----------
const INDEX = path.join(__dirname, 'public', 'index.html');
const STATIC_ROOTS = [
  ['/vendor/three/', path.join(__dirname, 'node_modules', 'three')],
  ['/', path.join(__dirname, 'public')],
];
const MIME = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveStatic(pathname, res) {
  for (const [prefix, root] of STATIC_ROOTS) {
    if (!pathname.startsWith(prefix)) continue;
    const file = path.resolve(root, '.' + decodeURIComponent(pathname.slice(prefix.length - 1)));
    if (!file.startsWith(root + path.sep)) break;
    return fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': prefix === '/' ? 'no-store' : 'max-age=86400' });
      fs.createReadStream(file).pipe(res);
    });
  }
  res.writeHead(404); res.end();
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`retry: 2000\ndata: ${stateJSON}\n\nevent: tvs\ndata: ${JSON.stringify(tvs)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/config') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ owner: CONFIG.owner || '', city: CONFIG.city || '', lat: CONFIG.lat ?? 51.5, lon: CONFIG.lon ?? -0.13 }));
  }
  if (url.pathname === '/api/tvs') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(tvs));
  }
  const snap = url.pathname.match(/^\/api\/tvs\/([\w-]{1,40})\/snap$/);
  if (snap) {
    // The office loaded inside a snapshot browser (a TV showing the office) must not ask for snapshots itself.
    if (/HeadlessChrome/.test(req.headers['user-agent'] || '')) { res.writeHead(404); return res.end(); }
    snapTv(snap[1], url.searchParams.has('fresh') ? 20000 : Infinity).then((file) => {
      if (!file) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });   // browsers sniff the JPEG thumbnails fine
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  const tv = url.pathname.match(/^\/api\/tvs\/([\w-]{1,40})$/);
  if (tv && req.method === 'PUT') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy(); });
    req.on('end', async () => {
      try {
        const saved = await putTv(tv[1], JSON.parse(body || '{}'));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(saved));
      } catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(stateJSON);
  }
  const m = url.pathname.match(/^\/api\/session\/([\w-]+)$/);
  if (m) {
    const file = bySession.get(m[1]);
    const tr = file && transcripts.get(file);
    if (!tr) { res.writeHead(404); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ...transcriptSummary(tr, { events: MAX_EVENTS }), subagents: subagentsOf(m[1]) }));
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return fs.createReadStream(INDEX).pipe(res);
  }
  serveStatic(url.pathname, res);
});

const t0 = Date.now();
listTranscripts();
readRegistry();
tick();
console.log(`indexed ${transcripts.size} transcripts in ${Date.now() - t0}ms`);
setInterval(tick, 1000);
setInterval(listTranscripts, 15000);
setInterval(pollProcs, 3000);
pollProcs();
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);
server.listen(PORT, HOST, () => console.log(`my-office on http://${HOST}:${PORT}`));
