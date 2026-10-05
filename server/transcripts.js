// Transcripts under ~/.claude/projects: what each session and subagent did, read as the files grow.
const fs = require('fs');
const path = require('path');
const { CLAUDE, safeJSON, clip, ts, hourKey, minuteKey } = require('./util');

const PROJECTS_DIR = path.join(CLAUDE, 'projects');
const WINDOW_MS = 48 * 3600e3;          // transcripts touched within this window are tracked
const MAX_EVENTS = 400;                  // per transcript
const READ_CHUNK = 8 * 1024 * 1024;
const CODE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const CODE_CAP = 8000;            // chars of written code kept per edit
const CHAT_MAX = 300;             // conversation entries kept per main transcript (the in-office chat)
const CHAT_CAP = 20000;           // chars kept per chat message
let chatClock = 0;                // chat seqs come from one clock, so a transcript that is re-read from scratch never repeats one

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
    this.chat.push(m); this.chatSeq = ++chatClock;
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
      // Messages typed while Claude is busy are queued, then absorbed mid-turn or run as the next turn; popAll pulls them back
      // into the input box unsent. Background task notifications are queued too, but they aren't yours.
      case 'queue-operation': {
        const text = typeof d.content === 'string' ? d.content.slice(0, CHAT_CAP) : '';
        if (d.operation === 'enqueue' && text.trim() && !text.trimStart().startsWith('<')) this.say({ t, role: 'user', text, queued: true });
        else if (d.operation === 'remove' && text) { const q = this.chat.findLast((m) => m.queued && m.text === text); if (q) { q.queued = false; q.ran = true; this.chatSeq = ++chatClock; } }
        else if (d.operation === 'popAll' && text) {
          const n = this.chat.length;
          this.chat = this.chat.filter((m) => !(m.queued && text.includes(m.text)));
          if (this.chat.length !== n) this.chatSeq = ++chatClock;
        }
        return;
      }
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
      // Queued messages that later ran as this turn (several queued ones run together) are already in the chat.
      const qs = this.chat.slice(-30).filter((m) => m.role === 'user' && m.queued !== undefined && !m.ran && text.includes(m.text));
      for (const q of qs) { q.queued = false; q.ran = true; this.chatSeq = ++chatClock; }
      const rest = qs.reduce((x, q) => x.replace(q.text, ''), text).trim();
      if (rest) this.say({ t, role: 'user', text: text.slice(0, CHAT_CAP) });
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

module.exports = { MAX_EVENTS, transcripts, bySession, listTranscripts, track };
