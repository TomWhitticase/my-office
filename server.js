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
const net = require('net');
const crypto = require('crypto');
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
const CHAT_MAX = 300;             // conversation entries kept per main transcript (the in-office chat)
const CHAT_CAP = 20000;           // chars kept per chat message

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
    this.chat = [];                 // the conversation for the in-office chat: {t, role: user|assistant|tool|command|note, text, name?, queued?}
    this.chatSeq = 0;
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

  say(m) {
    if (this.isSubagent) return;
    this.chat.push(m); this.chatSeq++;
    if (this.chat.length > CHAT_MAX) this.chat.splice(0, this.chat.length - CHAT_MAX);
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
      // Messages typed while Claude is busy are queued, then absorbed mid-turn or run as the next turn.
      case 'queue-operation':
        if (d.operation === 'enqueue' && d.content) this.say({ t, role: 'user', text: String(d.content).slice(0, CHAT_CAP), queued: true });
        else if (d.operation === 'remove') { const q = this.chat.findLast((m) => m.queued && m.text === String(d.content).slice(0, CHAT_CAP)); if (q) { q.queued = false; q.ran = true; this.chatSeq++; } }
        return;
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
          this.say({ t, role: 'note', text: 'Context compacted' });
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
        this.say({ t, role: 'tool', name: c.name, text: detail });
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
        this.say({ t, role: 'assistant', text: c.text.slice(0, CHAT_CAP) });
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
        if (cmd) { this.push({ t, kind: 'command', text: cmd[1] }); this.say({ t, role: 'command', text: cmd[1] }); }
        return;
      }
      this.prompts++;
      this.lastPrompt = clip(text, 300);
      this.lastPromptAt = t;
      this.push({ t, kind: 'prompt', text: clip(text, 600) });
      // A queued message that later ran as its own turn is already in the chat.
      const q = this.chat.slice(-30).findLast((m) => m.role === 'user' && m.queued !== undefined && !m.ran && m.text === text.slice(0, CHAT_CAP));
      if (q) { q.queued = false; q.ran = true; this.chatSeq++; } else this.say({ t, role: 'user', text: text.slice(0, CHAT_CAP) });
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
// Each wall TV in the 3D office is a live tab in a real browser on this machine. Config lives in ~/.claude/my-office/tvs.json:
// { id: { url, refresh, volume, muted, at } }. `at` changes whenever the URL is (re)set, which (re)loads the tab; volume and
// mute are patched on their own so the page keeps playing.
const TVS_FILE = path.join(CLAUDE, 'my-office', 'tvs.json');
let tvs = readJSON(TVS_FILE) || {};
for (const c of Object.values(tvs)) { delete c.src; delete c.blocked; c.volume ??= 100; c.muted ??= false; c.at ??= 0; }   // pre-browser entries
function sendTvs() { const json = JSON.stringify(tvs); for (const res of clients) res.write(`event: tvs\ndata: ${json}\n\n`); }
function putTv(id, body) {
  const prev = tvs[id], vol = (v, d) => Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : d;
  const refresh = (v, d) => 'refresh' in body ? Math.min(86400, Math.max(0, Math.round(Number(v) || 0))) : d;
  if ('url' in body) {
    const url = String(body.url || '').trim();
    if (!url) delete tvs[id];
    else {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol) || url.length > 2048) throw new Error('only http(s) URLs');
      lastFrames.delete(id);
      tvs[id] = { url: u.href, refresh: refresh(body.refresh, 0), volume: vol(body.volume, prev?.volume ?? 100), muted: 'muted' in body ? !!body.muted : !!prev?.muted, at: Date.now() };
    }
  } else if (prev) Object.assign(prev, { volume: vol(body.volume, prev.volume), muted: 'muted' in body ? !!body.muted : prev.muted, refresh: refresh(body.refresh, prev.refresh) });
  else throw new Error('that TV is off');
  fs.mkdirSync(path.dirname(TVS_FILE), { recursive: true });
  fs.writeFileSync(TVS_FILE, JSON.stringify(tvs, null, 2));
  sendTvs();
  tvSync();
  return tvs[id] || null;
}

// ---------- TV browser ----------
// One headless Chrome, launched when a TV is first needed, with its own persistent profile (log in once on a TV and it
// sticks). New-style headless still plays sound through the speakers, and has no window or Dock icon to steal focus.
// CDP runs over --remote-debugging-pipe, so there is no debugging port at all. Each TV gets a tab, screencast only while
// an office client is looking at it; tabs nobody needs are frozen after 30 s and closed after 3 min (reopening where they
// left off), and the browser quits with its last tab, so with nobody near a TV it costs nothing.
const TV_PROFILE = path.join(CLAUDE, 'my-office', 'tv-browser');
const TV_FRAMES = path.join(CLAUDE, 'my-office', 'tv-frames');   // last frame per TV, shown until it's live again
const TV_W = 1280, TV_H = 720, TV_MAX_TABS = 8, TV_MAX_CASTS = 4;
const TV_UA_TAG = 'my-office-tv';   // on the TV browser's user agent, so a TV showing the office can't open TV streams itself
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
const UA_OS = { darwin: 'Macintosh; Intel Mac OS X 10_15_7', win32: 'Windows NT 10.0; Win64; x64' }[process.platform] || 'X11; Linux x86_64';
// Volume for every <video>/<audio> in a frame, set by the server (starts silent until it knows how close you are), and
// __tvHold to pause playing media while the tab is frozen (freezing alone leaves video decoding running).
const TV_VOL_JS = `(() => { if (window.__tvVol) return; let v = 0, held = [];
  const set = (m) => { if (Math.abs(m.volume - v) > 0.005) m.volume = v; };
  window.__tvVol = (x) => { v = x; document.querySelectorAll('video, audio').forEach(set); };
  window.__tvHold = (on) => { if (on) { held = [...document.querySelectorAll('video, audio')].filter((m) => !m.paused); held.forEach((m) => m.pause()); } else { held.forEach((m) => m.play().catch(() => {})); held = []; } };
  for (const ev of ['play', 'playing', 'volumechange', 'loadedmetadata']) addEventListener(ev, (e) => e.target instanceof HTMLMediaElement && set(e.target), true);
  const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { set(this); return play.apply(this, arguments); }; })()`;
let chrome = null;   // { proc, send, ready }
const tabs = new Map();   // tv id -> { id, targetId, sid, kids, at, cast, vol, frozen, neededAt, loadedAt, page }
const tvSessions = new Map();   // CDP session -> tab (the page and its out-of-process iframes)
const lastFrames = new Map();   // tv id -> { jpeg, saved }
const resumeAt = new Map();   // tv id -> { url, at }: page a closed tab was showing, reopened if its config hasn't changed

function startChrome() {
  if (chrome) return chrome.ready;
  if (!CHROME) return Promise.reject(new Error('no Chrome found (set CHROME_PATH)'));
  const c = chrome = { pending: new Map(), seq: 0 };
  c.ready = (async () => {
    // A TV browser left behind by a server that died hard still holds the profile.
    await new Promise((r) => execFile('pkill', ['-f', `user-data-dir=${TV_PROFILE}`], () => setTimeout(r, 300)));
    const ver = await new Promise((r) => execFile(CHROME, ['--version'], (e, out) => r(String(out).match(/(\d+)\.\d+\.\d+\.\d+/)?.[1] || '140')));
    const proc = c.proc = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${TV_PROFILE}`, '--no-first-run', '--no-default-browser-check',
      '--use-mock-keychain', '--password-store=basic', '--autoplay-policy=no-user-gesture-required', '--disable-blink-features=AutomationControlled',
      `--user-agent=Mozilla/5.0 (${UA_OS}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36 ${TV_UA_TAG}`, `--window-size=${TV_W},${TV_H}`, 'about:blank'],
      { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    let buf = '';
    proc.stdio[4].setEncoding('utf8');
    proc.stdio[4].on('data', (d) => {
      buf += d;
      for (let i; (i = buf.indexOf('\0')) >= 0; buf = buf.slice(i + 1)) {
        let m; try { m = JSON.parse(buf.slice(0, i)); } catch { continue; }
        const p = m.id && c.pending.get(m.id);
        if (p) { c.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
        else if (m.method) try { cdpEvent(m); } catch (e) { console.error('tv', m.method, e.message); }
      }
    });
    proc.stdio[3].on('error', () => {});
    proc.on('exit', () => {
      console.log('tv browser exited');
      for (const p of c.pending.values()) p.reject(new Error('browser exited'));
      if (chrome === c) { chrome = null; tabs.clear(); tvSessions.clear(); }
    });
    c.send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      if (proc.exitCode !== null) return reject(new Error('browser exited'));
      const id = ++c.seq;
      c.pending.set(id, { resolve, reject });
      proc.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
    await c.send('Target.setDiscoverTargets', { discover: true });
    await c.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    console.log(`tv browser up (Chrome ${ver}, pid ${proc.pid})`);
  })();
  c.ready.catch((e) => { console.error('tv browser', e.message); if (chrome === c) chrome = null; });
  return c.ready;
}
const cdp = (method, params, sid) => chrome?.send ? chrome.send(method, params, sid) : Promise.reject(new Error('no browser'));
function stopChrome() {
  const c = chrome;
  if (!c?.proc) return;
  chrome = null; tabs.clear(); tvSessions.clear();
  c.send('Browser.close').catch(() => {});
  setTimeout(() => { try { process.kill(-c.proc.pid, 'SIGKILL'); } catch {} }, 2000).unref();
}

async function openTab(id) {
  const tab = { id, kids: new Set(), at: tvs[id].at, cast: 0, vol: -1, frozen: false, neededAt: Date.now(), page: {} };
  tabs.set(id, tab);
  try {
    await startChrome();
    tab.targetId = (await cdp('Target.createTarget', { url: 'about:blank', newWindow: true, background: true })).targetId;
    const sid = (await cdp('Target.attachToTarget', { targetId: tab.targetId, flatten: true })).sessionId;
    tvSessions.set(sid, tab);
    await Promise.all([
      cdp('Page.enable', {}, sid),
      cdp('Page.addScriptToEvaluateOnNewDocument', { source: TV_VOL_JS }, sid),
      cdp('Emulation.setDeviceMetricsOverride', { width: TV_W, height: TV_H, deviceScaleFactor: 1, mobile: false }, sid),
      cdp('Emulation.setFocusEmulationEnabled', { enabled: true }, sid),
      cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sid),
    ]);
    if (tabs.get(id) !== tab || !tvs[id]) throw new Error('gone');
    tab.sid = sid;
    const r = resumeAt.get(id);
    navTab(tab, r && r.at === tab.at ? r.url : tvs[id].url);
  } catch (e) {
    if (tabs.get(id) === tab) tabs.delete(id);
    if (tab.targetId) cdp('Target.closeTarget', { targetId: tab.targetId }).catch(() => {});
    if (e.message !== 'gone') console.error('tv tab', id, e.message);
  }
  tvSync();
}
function closeTab(tab) {
  tabs.delete(tab.id);
  if (/^https?:/.test(tab.page.url || '')) resumeAt.set(tab.id, { url: tab.page.url, at: tab.at });
  saveFrame(tab.id);
  for (const s of [tab.sid, ...tab.kids]) tvSessions.delete(s);
  if (tab.targetId) cdp('Target.closeTarget', { targetId: tab.targetId }).catch(() => {});
  if (!tabs.size) stopChrome();
}
function navTab(tab, url) {
  tab.loadedAt = Date.now();
  cdp('Page.navigate', { url }, tab.sid).catch(() => {});
}
function setVol(tab, v) {
  tab.vol = v;
  for (const s of [tab.sid, ...tab.kids]) cdp('Runtime.evaluate', { expression: `window.__tvVol?.(${v})` }, s).catch(() => {});
}

function cdpEvent(m) {
  const p = m.params || {}, tab = tvSessions.get(m.sessionId);
  switch (m.method) {
    case 'Page.screencastFrame':
      cdp('Page.screencastFrameAck', { sessionId: p.sessionId }, m.sessionId).catch(() => {});
      if (tab && m.sessionId === tab.sid) tvFrame(tab, p.data);
      return;
    case 'Page.domContentEventFired': case 'Page.loadEventFired':
      if (tab) setVol(tab, tab.vol);   // a fresh document starts silent
      return;
    case 'Page.javascriptDialogOpening':   // nobody is there to answer alerts or "leave this page?"
      cdp('Page.handleJavaScriptDialog', { accept: true }, m.sessionId).catch(() => {});
      return;
    case 'Inspector.targetCrashed':
      if (tab && m.sessionId === tab.sid) closeTab(tab);
      return;
    case 'Target.attachedToTarget':   // out-of-process iframes (e.g. a YouTube embed) need the volume hook too
      if (!tab || p.targetInfo.type !== 'iframe') { if (p.waitingForDebugger) cdp('Runtime.runIfWaitingForDebugger', {}, p.sessionId).catch(() => {}); return; }
      tab.kids.add(p.sessionId); tvSessions.set(p.sessionId, tab);
      cdp('Page.enable', {}, p.sessionId).catch(() => {});
      cdp('Page.addScriptToEvaluateOnNewDocument', { source: TV_VOL_JS }, p.sessionId).catch(() => {});
      cdp('Runtime.evaluate', { expression: `${TV_VOL_JS}; window.__tvVol(${tab.vol})` }, p.sessionId).catch(() => {});
      return;
    case 'Target.detachedFromTarget':
      if (tab) { tab.kids.delete(p.sessionId); tvSessions.delete(p.sessionId); }
      return;
    case 'Target.targetCreated': case 'Target.targetInfoChanged': {
      const ti = p.targetInfo;
      if (ti.type !== 'page') return;
      const own = [...tabs.values()].find((t) => t.targetId === ti.targetId);
      if (own) {
        own.page = { url: ti.url, title: ti.title };
        const json = JSON.stringify({ t: 'page', id: own.id, ...own.page });
        for (const cl of tvClients) wsSend(cl.sock, 1, json);
        return;
      }
      // A popup (target=_blank, window.open): show it on the TV that opened it, or the one in use, instead.
      const opener = [...tabs.values()].find((t) => t.targetId === ti.openerId) || tabs.get(tvUsed);
      if (/^https?:/.test(ti.url) && opener?.sid) { navTab(opener, ti.url); cdp('Target.closeTarget', { targetId: ti.targetId }).catch(() => {}); }
      else if (m.method === 'Target.targetCreated') setTimeout(() => {
        if (chrome && ![...tabs.values()].some((t) => t.targetId === ti.targetId)) cdp('Target.closeTarget', { targetId: ti.targetId }).catch(() => {});
      }, 15000);
      return;
    }
  }
}
function tvFrame(tab, b64) {
  const jpeg = Buffer.from(b64, 'base64');
  lastFrames.set(tab.id, { jpeg, saved: false });
  const msg = frameMsg(tab.id, jpeg);
  for (const cl of tvClients) if (cl.watch.has(tab.id) && cl.sock.writableLength < 4e6) wsSend(cl.sock, 2, msg);
}
function saveFrame(id) {
  const f = lastFrames.get(id);
  if (!f || f.saved) return;
  f.saved = true;
  fs.mkdirSync(TV_FRAMES, { recursive: true });
  fs.writeFile(path.join(TV_FRAMES, `${id}.jpg`), f.jpeg, () => {});
}
function lastFrame(id) {
  if (!lastFrames.has(id)) {
    const file = path.join(TV_FRAMES, `${id}.jpg`);
    try { if (fs.statSync(file).mtimeMs > (tvs[id]?.at || 0)) lastFrames.set(id, { jpeg: fs.readFileSync(file), saved: true }); } catch {}
  }
  return lastFrames.get(id)?.jpeg;
}
const frameMsg = (id, jpeg) => Buffer.concat([Buffer.from([Buffer.byteLength(id)]), Buffer.from(id), jpeg]);

// What every TV should be doing, from what the office clients are looking at and how close they are. Called on any change
// and once a second.
let tvUsed = null;
function tvSync() {
  const now = Date.now(), watch = new Map(), fade = new Map();   // id -> screencast everyNthFrame, id -> loudest client's fade
  tvUsed = null;
  for (const cl of tvClients) {
    for (const id of cl.watch) watch.set(id, Math.min(watch.get(id) || 9, id === cl.use ? 2 : 6));   // ~30 fps in use, ~10 otherwise
    for (const [id, f] of Object.entries(cl.fade)) fade.set(id, Math.max(fade.get(id) || 0, f));
    if (cl.use) tvUsed = cl.use;
  }
  for (const id of Object.keys(tvs)) if ((watch.has(id) || fade.get(id) > 0) && !tabs.has(id) && tabs.size < TV_MAX_TABS) openTab(id);
  let casts = 0;
  for (const tab of [...tabs.values()].sort((a, b) => (watch.get(a.id) || 9) - (watch.get(b.id) || 9))) {
    const c = tvs[tab.id];
    if (!c) { lastFrames.delete(tab.id); fs.rm(path.join(TV_FRAMES, `${tab.id}.jpg`), { force: true }, () => {}); closeTab(tab); continue; }
    if (!tab.sid) continue;   // still opening
    if (watch.has(tab.id) || fade.get(tab.id) > 0) tab.neededAt = now;
    const idle = now - tab.neededAt;
    if (idle > 180e3) { closeTab(tab); continue; }
    if (tab.at !== c.at) { tab.at = c.at; lastFrames.delete(tab.id); navTab(tab, c.url); }
    else if (c.refresh && !idle && tvUsed !== tab.id && now - tab.loadedAt > c.refresh * 1000) { tab.loadedAt = now; cdp('Page.reload', {}, tab.sid).catch(() => {}); }
    const frozen = idle > 30e3, life = (f) => {
      tab.frozen = f;
      const hold = () => { for (const s of [tab.sid, ...tab.kids]) cdp('Runtime.evaluate', { expression: `window.__tvHold?.(${f})` }, s).catch(() => {}); };
      if (f) hold();
      cdp('Page.setWebLifecycleState', { state: f ? 'frozen' : 'active' }, tab.sid).then(f ? null : hold).catch(() => {});
    };
    if (!frozen && tab.frozen) life(false);
    const nth = !frozen && watch.has(tab.id) && casts++ < TV_MAX_CASTS ? watch.get(tab.id) : 0;
    if (nth !== tab.cast) {
      if (tab.cast) { cdp('Page.stopScreencast', {}, tab.sid).catch(() => {}); saveFrame(tab.id); }
      if (nth && !tab.cast) cdp('Page.captureScreenshot', { format: 'jpeg', quality: 70 }, tab.sid).then((r) => tab.cast && tvFrame(tab, r.data)).catch(() => {});   // a still page sends no screencast frames until it changes
      if (nth) cdp('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: TV_W, maxHeight: TV_H, everyNthFrame: nth }, tab.sid).catch(() => {});
      tab.cast = nth;
    }
    const vol = c.muted || frozen ? 0 : Math.round(c.volume * (fade.get(tab.id) || 0)) / 100;
    if (vol !== tab.vol) setVol(tab, vol);
    if (frozen && !tab.frozen) life(true);   // after muting: a frozen page runs nothing
  }
}
setInterval(tvSync, 1000);
setInterval(() => { for (const id of lastFrames.keys()) saveFrame(id); }, 30000);
const exitTvs = () => { if (chrome?.proc) try { process.kill(-chrome.proc.pid, 'SIGKILL'); } catch {} };
process.on('exit', exitTvs);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => {
  for (const id of lastFrames.keys()) { const f = lastFrames.get(id); if (!f.saved) try { fs.mkdirSync(TV_FRAMES, { recursive: true }); fs.writeFileSync(path.join(TV_FRAMES, `${id}.jpg`), f.jpeg); } catch {} }
  if (!chrome?.send) process.exit(0);
  chrome.proc.once('exit', () => process.exit(0));
  chrome.send('Browser.close').catch(() => {});   // let it flush cookies, so TV logins stick
  setTimeout(() => process.exit(0), 1500);
});

// ---------- TV socket ----------
// A minimal WebSocket server (RFC 6455, no deps) at /tv: one socket per office client. The client sends JSON (which TVs
// it's looking at, how loud each should be for it, mouse/keys/navigation for the TV in use); the server sends binary
// screencast frames ([id length][id][JPEG]) and JSON page updates. The TV browser carries the user's logins, so only
// pages served by this server itself may connect.
const tvClients = new Set();
function wsSend(sock, op, data) {
  if (sock.destroyed) return;
  if (typeof data === 'string') data = Buffer.from(data);
  const n = data.length, head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.alloc(10);
  if (n >= 65536) { head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  sock.cork(); sock.write(head); sock.write(data); sock.uncork();
}
function trustedHost(host) {
  const h = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return h === 'localhost' || net.isIP(h) || h === os.hostname() || h.endsWith('.local');
}
function tvUpgrade(req, sock) {
  const host = req.headers.host || '', key = req.headers['sec-websocket-key'];
  if (new URL(req.url, 'http://x').pathname !== '/tv' || !key || !trustedHost(host) || req.headers.origin !== `http://${host}`
    || (req.headers['user-agent'] || '').includes(TV_UA_TAG)) return sock.destroy();
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${
    crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')}\r\n\r\n`);
  sock.setNoDelay(true);
  const cl = { sock, watch: new Set(), fade: {}, use: null };
  tvClients.add(cl);
  for (const id of Object.keys(tvs)) { const f = lastFrame(id); if (f) wsSend(sock, 2, frameMsg(id, f)); }
  for (const t of tabs.values()) if (t.page.url) wsSend(sock, 1, JSON.stringify({ t: 'page', id: t.id, ...t.page }));
  let buf = Buffer.alloc(0), parts = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2) {
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (!(buf[1] & 128) || len > 1 << 20) return sock.destroy();   // clients must mask; nothing legit is this big
      if (buf.length < off + 4 + len) return;
      const fin = buf[0] & 128, op = buf[0] & 15, mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 8) return sock.end(Buffer.from([0x88, 0]));
      if (op === 9) { wsSend(sock, 10, data); continue; }
      if (op > 2) continue;
      parts.push(data);
      if (!fin) continue;
      const text = Buffer.concat(parts).toString(); parts = [];
      try { tvMessage(cl, JSON.parse(text)); } catch (e) { console.error('tv message', e.message); }
    }
  });
  const bye = () => { if (tvClients.delete(cl)) tvSync(); };
  sock.on('close', bye); sock.on('error', bye);
}
const KEY_TYPES = new Set(['keyDown', 'rawKeyDown', 'keyUp']), MOUSE_TYPES = new Set(['mouseMoved', 'mousePressed', 'mouseReleased', 'mouseWheel']);
function tvMessage(cl, m) {
  if (m.t === 'watch') {
    cl.watch = new Set((Array.isArray(m.ids) ? m.ids : []).filter((id) => tvs[id]).slice(0, TV_MAX_TABS));
    cl.use = tvs[m.use] ? m.use : null;
    if (cl.use) cl.watch.add(cl.use);
    return tvSync();
  }
  if (m.t === 'fade') {
    cl.fade = {};
    for (const [id, f] of Object.entries(m.fades || {})) if (tvs[id] && Number.isFinite(f)) cl.fade[id] = Math.min(1, Math.max(0, f));
    return tvSync();
  }
  // Input and navigation only go to the TV this client is using.
  const tab = tabs.get(m.id);
  if (!tab?.sid || m.id !== cl.use) return;
  const n = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0)), s = (v) => String(v ?? '').slice(0, 32);
  if (m.t === 'mouse' && MOUSE_TYPES.has(m.type)) {
    cdp('Input.dispatchMouseEvent', { type: m.type, x: n(m.x, 0, 1) * TV_W, y: n(m.y, 0, 1) * TV_H, modifiers: n(m.mods, 0, 15),
      button: ['left', 'middle', 'right'].includes(m.button) ? m.button : 'none', buttons: n(m.buttons, 0, 31), clickCount: n(m.clickCount, 0, 3),
      deltaX: n(m.dx, -5000, 5000), deltaY: n(m.dy, -5000, 5000) }, tab.sid).catch(() => {});
  } else if (m.t === 'key' && KEY_TYPES.has(m.type)) {
    const text = m.type === 'keyDown' ? s(m.text) : undefined;
    cdp('Input.dispatchKeyEvent', { type: m.type, key: s(m.key), code: s(m.code), text, unmodifiedText: text, windowsVirtualKeyCode: n(m.keyCode, 0, 255),
      modifiers: n(m.mods, 0, 15), location: n(m.loc, 0, 3), commands: m.cmd ? [s(m.cmd)] : undefined }, tab.sid).catch(() => {});
  } else if (m.t === 'text') {
    cdp('Input.insertText', { text: String(m.text || '').slice(0, 1e5) }, tab.sid).catch(() => {});
  } else if (m.t === 'nav') {
    if (m.act === 'reload') { tab.loadedAt = Date.now(); cdp('Page.reload', {}, tab.sid).catch(() => {}); }
    else if (m.act === 'home') navTab(tab, tvs[tab.id].url);
    else if (m.act === 'go') { try { const u = new URL(String(m.url)); if (/^https?:$/.test(u.protocol)) navTab(tab, u.href); } catch {} }
    else if (m.act === 'back' || m.act === 'forward') cdp('Page.getNavigationHistory', {}, tab.sid).then(({ currentIndex, entries }) => {
      const e = entries[currentIndex + (m.act === 'back' ? -1 : 1)];
      if (e) return cdp('Page.navigateToHistoryEntry', { entryId: e.id }, tab.sid);
    }).catch(() => {});
  }
}

// ---------- office settings ----------
// Lights, blinds and the door, set from the Admin tab or by clicking in the office; shared by every open browser.
// lights: 'auto' follows daylight, 'on'/'off' override it; brightness scales every lamp. ~/.claude/my-office/office.json.
const OFFICE_FILE = path.join(CLAUDE, 'my-office', 'office.json');
// blinds: side/front are my glass office's, north/east/west the outside windows per wall, office the outside window in my office,
// meetSouth/meetNorth/meetSmall the meeting rooms' glass.
const OFFICE_DEFAULT = { lights: 'auto', brightness: 1, blinds: { side: 0, front: 0, north: 0, east: 0, west: 0, office: 0, meetSouth: 0, meetNorth: 0, meetSmall: 0 }, door: 0 };
let office = { ...OFFICE_DEFAULT, ...readJSON(OFFICE_FILE) };
office.blinds = { ...OFFICE_DEFAULT.blinds, ...office.blinds };
function putOffice(b) {
  if (['auto', 'on', 'off'].includes(b.lights)) office.lights = b.lights;
  if (Number.isFinite(b.brightness)) office.brightness = Math.min(2, Math.max(0.1, b.brightness));
  if (b.blinds) for (const k of Object.keys(OFFICE_DEFAULT.blinds)) if (k in b.blinds) office.blinds = { ...office.blinds, [k]: b.blinds[k] ? 1 : 0 };
  if ('door' in b) office.door = b.door ? 1 : 0;
  fs.mkdirSync(path.dirname(OFFICE_FILE), { recursive: true });
  fs.writeFileSync(OFFICE_FILE, JSON.stringify(office, null, 2));
  const json = JSON.stringify(office);
  for (const res of clients) res.write(`event: office\ndata: ${json}\n\n`);
  return office;
}

// ---------- talking to sessions ----------
// The in-office chat types into a session's own terminal, as you would: through Orca's documented `orca terminal send`, or
// tmux outside Orca. The terminal comes from the claude process's own environment (Orca and tmux put ORCA_TERMINAL_HANDLE /
// TMUX_PANE in every shell they start), never guessed from the cwd; if two live sessions share a terminal we refuse.
const SEND_MAX = 8000;
const BIN_DIRS = [...(process.env.PATH || '').split(':'), '/usr/local/bin', '/opt/homebrew/bin', '/Applications/Orca.app/Contents/Resources/bin'];
const binOf = (name) => BIN_DIRS.map((d) => d && path.join(d, name)).find((p) => p && fs.existsSync(p));
const run = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { timeout: 30000, maxBuffer: 16 << 20 },
  (err, out, errOut) => resolve({ err, out: String(out || ''), errOut: String(errOut || '') })));
const sending = new Set();   // session ids with a send in flight
const sentAt = new Map();    // session id -> when we last got a message in (the registry's status lags a turn starting by seconds)

async function terminalOf(r) {
  const { out } = await run('ps', ['eww', '-o', 'lstart=,command=', '-p', String(r.pid)]);
  if (!out.trim()) throw new Error('the session has exited');
  // procStart guards against pid reuse; Claude Code writes it in UTC (older versions in local time).
  const started = Date.parse(out.slice(0, 24)), reg = r.procStart && [Date.parse(r.procStart + ' UTC'), Date.parse(r.procStart)];
  if (reg && !reg.some((x) => Math.abs(x - started) < 2000)) throw new Error('its process changed since it registered');
  const last = (re) => [...out.matchAll(re)].at(-1)?.[1];   // the environment follows the arguments
  const handle = last(/\bORCA_TERMINAL_HANDLE=(term_[\w-]+)/g);
  if (handle) return { route: 'orca', handle };
  const pane = last(/\bTMUX_PANE=(%\d+)/g), socket = last(/\bTMUX=([^\s,]+),/g);
  return pane && socket ? { route: 'tmux', handle: pane, socket } : null;
}

// Where a message to this session would go, or throws why it can't go anywhere.
async function routeOf(id) {
  const r = registry.find((x) => x.sessionId === id);
  if (!r || !pidAlive(r.pid)) throw new Error('this session isn’t running');
  if (r.kind !== 'interactive' || r.entrypoint !== 'cli') throw new Error(`can’t send to this session from here: it isn’t a terminal session (${r.entrypoint || r.kind})`);
  const term = await terminalOf(r);
  if (!term) throw new Error('can’t send to this session from here: it isn’t running in an Orca terminal or tmux');
  const others = await Promise.all(registry.filter((x) => x !== r && pidAlive(x.pid)).map((x) => terminalOf(x).catch(() => null)));
  if (others.some((o) => o?.route === term.route && o.handle === term.handle && o.socket === term.socket)) throw new Error('more than one Claude session runs in that terminal, so it’s unclear which would get the message');
  return { r, term };
}

async function sendToSession(id, text) {
  const { r, term } = await routeOf(id);
  if (!['idle', 'busy'].includes(r.status)) throw new Error(`it’s ${r.status === 'waiting' ? 'waiting on a prompt (a permission request or question)' : r.status}: answer it in its terminal`);
  const busy = r.status === 'busy' || (sentAt.get(id) || 0) > (r.statusUpdatedAt || 0);
  console.log(`[send] ${new Date().toISOString()} ${r.name || id} (pid ${r.pid}, ${busy ? 'busy' : 'idle'}) via ${term.route} ${term.handle}: ${JSON.stringify(text)}`);

  if (term.route === 'orca') {
    const orca = binOf('orca');
    if (!orca) throw new Error('the orca CLI isn’t installed');
    const t = safeJSON((await run(orca, ['terminal', 'list', '--json'])).out)?.result?.terminals?.find((x) => x.handle === term.handle);
    if (!t) throw new Error('its Orca terminal is gone (did Orca restart?)');
    if (!t.connected || !t.writable) throw new Error('its Orca terminal isn’t accepting input');
    // Text plus Enter is one prompt to Orca (newlines don't submit early). For an idle session wait for proof the turn started;
    // a busy one queues the message, so acceptance is all there is to see.
    const res = await run(orca, ['terminal', 'send', '--terminal', term.handle, `--text=${text}`, '--enter', ...(busy ? [] : ['--wait-submit', '10']), '--json']);
    const j = safeJSON(res.out);
    if (/agent_prompt_blocked/.test(`${j?.error?.code} ${j?.error?.message}`)) throw new Error('it’s showing a prompt in its terminal (a permission request or question), so Orca didn’t press Enter. Answer the prompt there, and check its input box: your text may be sitting in it');
    if (!j?.ok) throw new Error(j?.error?.message || res.errOut.trim() || 'orca terminal send failed');
    if (!j.result?.send?.accepted) throw new Error('Orca didn’t accept the input');
    const stages = j.result.send.prompt?.stages || [];
    console.log(`[send] ${r.name || id}: accepted, ${stages.join(' → ') || 'no receipt stages'}`);
    sentAt.set(id, Date.now());
    return { route: 'orca', terminal: t.title, started: !busy && stages.includes('turn_started'), queued: busy };
  }
  // tmux: one bracketed paste so newlines don't submit early, then Enter.
  const tmux = binOf('tmux');
  if (!tmux) throw new Error('tmux isn’t installed');
  const tm = async (...a) => { const x = await run(tmux, ['-S', term.socket, ...a]); if (x.err) throw new Error(`tmux: ${x.errOut.trim() || x.err.message}`); return x.out; };
  if ((await tm('display-message', '-p', '-t', term.handle, '#{pane_id}')).trim() !== term.handle) throw new Error('its tmux pane is gone');
  const buf = `my-office-${Date.now()}`;
  await tm('set-buffer', '-b', buf, '--', text);
  await tm('paste-buffer', '-p', '-d', '-b', buf, '-t', term.handle);
  await new Promise((ok) => setTimeout(ok, 150));
  await tm('send-keys', '-t', term.handle, 'Enter');
  sentAt.set(id, Date.now());
  return { route: 'tmux', terminal: term.handle, started: false, queued: busy };
}

// ---------- http ----------
// Anything that changes state must come from this dashboard: JSON (a foreign page then needs a CORS preflight, which is never
// approved), our own Origin on our own Host (no other site, no DNS rebinding), and not a TV or headless browser (a TV showing
// the dashboard must not drive it).
function refuse(req) {
  const host = req.headers.host || '', ua = req.headers['user-agent'] || '';
  if (!trustedHost(host)) return 'unknown Host';
  if (req.headers.origin !== `http://${host}`) return 'missing or foreign Origin';
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) return 'Content-Type must be application/json';
  if (/HeadlessChrome/.test(ua) || ua.includes(TV_UA_TAG)) return 'not from a TV or headless browser';
  return null;
}
function deny(req, res) {
  const why = refuse(req);
  if (!why) return false;
  console.log(`[refused] ${req.method} ${req.url}: ${why} (origin ${req.headers.origin || '-'}, host ${req.headers.host || '-'})`);
  res.writeHead(403, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: `refused: ${why}` }));
  return true;
}
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
    res.write(`retry: 2000\ndata: ${stateJSON}\n\nevent: tvs\ndata: ${JSON.stringify(tvs)}\n\nevent: office\ndata: ${JSON.stringify(office)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/config') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ owner: CONFIG.owner || '', city: CONFIG.city || '', lat: CONFIG.lat ?? 51.5, lon: CONFIG.lon ?? -0.13 }));
  }
  if (url.pathname === '/api/office') {
    if (req.method !== 'PUT') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(office)); }
    if (deny(req, res)) return;
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try { const saved = putOffice(JSON.parse(body || '{}')); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(saved)); }
      catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (url.pathname === '/api/tvs') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(tvs));
  }
  const tv = url.pathname.match(/^\/api\/tvs\/([\w-]{1,40})$/);
  if (tv && req.method === 'PUT') {
    if (deny(req, res)) return;
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy(); });
    req.on('end', () => {
      try {
        const saved = putTv(tv[1], JSON.parse(body || '{}'));
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
  // The conversation for the in-office chat. ?seq= is the last seq the client has; unchanged means no messages are sent.
  const chat = url.pathname.match(/^\/api\/session\/([\w-]+)\/chat$/);
  if (chat) {
    const tr = transcripts.get(bySession.get(chat[1])), seq = tr?.chatSeq ?? 0;
    const body = url.searchParams.get('seq') === String(seq) ? { seq } : { seq, messages: tr?.chat.slice(-150) || [] };
    if (!url.searchParams.has('route')) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(body)); }
    // ?route also says whether (and how) a message could be delivered, so the chat can say so before you type.
    routeOf(chat[1]).then(({ term }) => ({ route: term.route }), (e) => ({ cantSend: e.message })).then((o) => {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ...body, ...o }));
    });
    return;
  }
  const send = url.pathname.match(/^\/api\/session\/([\w-]+)\/send$/);
  if (send) {
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    if (deny(req, res)) return;
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', async () => {
      const id = send[1], reply = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const text = String(safeJSON(body)?.text ?? '').replace(/\r\n?/g, '\n').trim();
      if (!text) return reply(400, { error: 'empty message' });
      if (text.length > SEND_MAX) return reply(400, { error: `too long (${text.length} of ${SEND_MAX} characters)` });
      if (sending.has(id)) return reply(409, { error: 'still sending the previous message' });
      sending.add(id);
      try { reply(200, await sendToSession(id, text)); }
      catch (e) { console.log(`[send] ${id}: refused: ${e.message}`); reply(422, { error: e.message }); }
      finally { sending.delete(id); }
    });
    return;
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
server.on('upgrade', tvUpgrade);
server.listen(PORT, HOST, () => console.log(`my-office on http://${HOST}:${PORT}`));
