// Canvas painters for the office's screens: desk monitors (session, away, code), the usage/team/spend/activity screens,
// the breakroom board and the name tags over people.

import { titleOf } from '../chat.js';
import { F, FONT, dash, fit } from './util.js';

// ---------- screen painters ----------
export const EV_LABEL = { prompt: 'You', say: 'Claude', error: 'Error', turn: 'Done', notify: 'Task', recap: 'Recap', command: 'Cmd', compact: 'Compact' };
export const STATUS = {
  working: { text: '● WORKING', color: '#22c55e' },
  shell: { text: '◐ WAITING ON SHELL', color: '#fab219' },
  idle: { text: '○ IDLE', color: '#9a9890' },
};
export const statusOf = (s) => STATUS[s.status] || { text: String(s.status || '?').toUpperCase(), color: '#ec835a' };
export const evText = (e) => (e.kind === 'turn' ? `Turn finished in ${F.dur(e.ms)}` : e.text || '');

export function spark(ctx, vals, x, y, w, h, color) {
  if (!vals.length) return;
  const max = Math.max(...vals, 1);
  ctx.beginPath();
  vals.forEach((v, i) => { const px = x + (i / (vals.length - 1)) * w, py = y + h - (v / max) * h; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  ctx.globalAlpha = 0.18; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
}
export function bars(ctx, vals, x, y, w, h, color, labelFn, fmt) {
  const max = Math.max(...vals, 0.01);
  const bw = w / vals.length;
  ctx.strokeStyle = '#2c2c2a'; ctx.lineWidth = 1;
  for (let i = 0; i <= 2; i++) { const gy = y + h - (h * i) / 2; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
  ctx.font = `500 15px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.textAlign = 'right';
  ctx.fillText(fmt(max), x - 8, y + 6); ctx.fillText(fmt(0), x - 8, y + h + 5);
  ctx.textAlign = 'center';
  vals.forEach((v, i) => {
    const bh = (v / max) * h;
    ctx.fillStyle = color;
    if (v > 0) { ctx.beginPath(); ctx.roundRect(x + i * bw + bw * 0.15, y + h - bh, bw * 0.7, Math.max(bh, 2), [3, 3, 0, 0]); ctx.fill(); }
    const l = labelFn(i);
    if (l) { ctx.fillStyle = '#8b8a85'; ctx.fillText(l, x + i * bw + bw / 2, y + h + 22); }
  });
  ctx.textAlign = 'left';
}
export function header(ctx, W, title, sub) {
  ctx.fillStyle = '#0f1013'; ctx.fillRect(0, 0, W, 9999);
  ctx.font = `700 26px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(title, 30, 48);
  if (sub) { const tw = ctx.measureText(title).width; ctx.font = `400 18px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText(sub, 30 + tw + 14, 48); }
}

export function drawSession(scr, s, color) {
  const { ctx, W, H } = scr, tr = s.transcript || {}, sl = s.statusline || {}, P = 30, st = statusOf(s);
  ctx.fillStyle = '#0f1013'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, 8);
  ctx.font = `700 18px ${FONT}`; ctx.fillStyle = st.color; ctx.fillText(st.text, P, 44);
  ctx.fillStyle = '#8b8a85'; ctx.textAlign = 'right'; ctx.fillText('for ' + F.dur(Date.now() - s.statusSince), W - P, 44); ctx.textAlign = 'left';
  ctx.font = `700 34px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, titleOf(s), W - 2 * P), P, 90);
  ctx.font = `400 19px ${FONT}`; ctx.fillStyle = '#9a9890';
  ctx.fillText(fit(ctx, `${s.name} · ${F.home(s.cwd)}${tr.branch ? ' · ⎇ ' + tr.branch : ''}`, W - 2 * P), P, 118);

  ctx.fillStyle = '#1c1e23'; ctx.beginPath(); ctx.roundRect(P, 136, W - 2 * P, 52, 10); ctx.fill();
  const p = tr.pendingTool, busy = s.status !== 'idle';
  let tag = 'LAST ASK', txt = tr.lastPrompt || '—', timer = '';
  if (busy && p) { tag = p.name; txt = p.detail; timer = F.dur(Date.now() - p.t); }
  else if (busy) { tag = 'THINKING'; txt = tr.lastPrompt || ''; }
  ctx.font = `700 17px ${FONT}`; ctx.fillStyle = busy ? '#22c55e' : '#8b8a85';
  const T = tag.toUpperCase(); ctx.fillText(T, P + 16, 169);
  const tw = ctx.measureText(T).width;
  ctx.font = `400 19px ${FONT}`; ctx.fillStyle = '#e6e5df';
  ctx.fillText(fit(ctx, txt, W - 2 * P - tw - 50 - (timer ? 80 : 0)), P + 30 + tw, 169);
  if (timer) { ctx.textAlign = 'right'; ctx.fillStyle = '#8b8a85'; ctx.fillText(timer, W - P - 16, 169); ctx.textAlign = 'left'; }

  const ctxPct = sl.context?.used_percentage ?? null;
  const tools = Object.values(tr.tools || {}).reduce((a, b) => a + b, 0);
  const cols = [['COST (API-EQ.)', F.usd(s.cost)], ['CONTEXT', ctxPct != null ? ctxPct + '%' : '—'], ['PROMPTS · TOOLS', `${tr.prompts ?? 0} · ${tools}`],
    ['SUBAGENTS', s.subagents.active ? `${s.subagents.active} running` : String(s.subagents.total)]];
  const cw = (W - 2 * P) / 4;
  cols.forEach(([k, v], i) => {
    const x = P + i * cw;
    ctx.font = `600 14px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText(k, x, 222);
    ctx.font = `700 28px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(v, x, 256);
  });
  if (ctxPct != null) {
    ctx.fillStyle = '#2c2c2a'; ctx.fillRect(P + cw, 266, cw - 28, 5);
    ctx.fillStyle = ctxPct >= 80 ? '#fab219' : '#3987e5'; ctx.fillRect(P + cw, 266, (cw - 28) * Math.min(ctxPct, 100) / 100, 5);
  }
  spark(ctx, tr.spark || [], P, 288, W - 2 * P, 50, color);

  let y = 376;
  for (const e of (tr.events || []).slice(-5).reverse()) {
    ctx.font = `500 15px ${FONT}`; ctx.fillStyle = '#6f6e69'; ctx.fillText(e.t ? F.clock(e.t) : '', P, y);
    const label = e.kind === 'tool' ? e.name : EV_LABEL[e.kind] || e.kind;
    ctx.font = `700 15px ${FONT}`; ctx.fillStyle = e.kind === 'error' || e.error ? '#e66767' : e.kind === 'prompt' ? '#3987e5' : '#c3c2b7';
    ctx.fillText(label, P + 62, y);
    const lw = Math.max(70, ctx.measureText(label).width + 12);
    ctx.font = `400 16px ${FONT}`; ctx.fillStyle = '#a9a8a2';
    ctx.fillText(fit(ctx, evText(e), W - 2 * P - 62 - lw), P + 62 + lw, y);
    y += 27;
  }
}

export function drawAway(scr, s, color) {
  const { ctx, W, H } = scr;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, color); g.addColorStop(1, '#0b0c0f');
  ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.45; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = `200 110px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.fillText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), W / 2, 190);
  ctx.font = `600 24px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, titleOf(s), W - 80), W / 2, 270);
  ctx.font = `400 20px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText(`Away from desk · idle ${F.dur(Date.now() - s.statusSince)}`, W / 2, 306);
  ctx.fillText(`${s.name} · ${F.usd(s.cost)} so far`, W / 2, 336);
  ctx.font = `500 16px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillText('🔒 Locked', W / 2, H - 40);
  ctx.textAlign = 'left';
}

// ---------- code monitor ----------
export const MONO = '"SF Mono", Menlo, Consolas, monospace';
export const KEYWORDS = new Set(('const let var function return if else for while do switch case break continue new class extends import from export default ' +
  'async await try catch finally throw typeof instanceof in of this super null undefined true false def lambda pass with as elif not and or is None ' +
  'True False self yield global nonlocal fn mut pub struct enum impl trait use mod match where func package type interface map chan go defer ' +
  'func extends signal onready tool static void int float bool string var set get public private protected readonly').split(' '));
export const SYN = { kw: '#c678dd', str: '#98c379', num: '#d19a66', com: '#7f848e', fn: '#61afef', type: '#e5c07b', txt: '#d7dae0' };
export const TOKEN = /(\/\/.*|#(?![{\w-]*\s*[:{]).*|\/\*.*?\*\/|<!--.*?-->)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?)|(\b\d[\d_.xXa-fA-F]*\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;
export function tokens(line) {
  const out = [];
  let last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push([line.slice(last, m.index), SYN.txt]);
    const [tok, com, str, num, fn, word] = m;
    out.push([tok, com ? SYN.com : str ? SYN.str : num ? SYN.num : fn ? (KEYWORDS.has(fn) ? SYN.kw : SYN.fn)
      : KEYWORDS.has(word) ? SYN.kw : /^[A-Z][a-z]/.test(word) ? SYN.type : SYN.txt]);
    last = m.index + tok.length;
    if (!tok.length) TOKEN.lastIndex++;
  }
  if (last < line.length) out.push([line.slice(last), SYN.txt]);
  return out;
}
export const countLines = (x) => (x ? x.split('\n').length : 0);

// Draws the session's latest edit; `shown` chars of it are revealed (typing animation).
export function drawCode(scr, s, color, shown, cursorOn) {
  const { ctx, W, H } = scr, code = s.code;
  ctx.fillStyle = '#1e2127'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#16181d'; ctx.fillRect(0, 0, W, 44);
  if (!code) {
    ctx.textAlign = 'center';
    ctx.font = `500 22px ${FONT}`; ctx.fillStyle = '#7f848e'; ctx.fillText('No code written yet this session', W / 2, H / 2 - 6);
    ctx.font = `400 17px ${FONT}`; ctx.fillStyle = '#5c6370'; ctx.fillText('Edits will appear here live as they happen', W / 2, H / 2 + 24);
    ctx.textAlign = 'left';
    return;
  }
  const base = code.file.split('/').pop();
  ctx.font = `600 17px ${FONT}`;
  const tabW = Math.min(ctx.measureText(base).width + 44, 380);
  ctx.fillStyle = '#1e2127'; ctx.fillRect(0, 0, tabW, 44);
  ctx.fillStyle = color; ctx.fillRect(0, 0, tabW, 3);
  ctx.fillStyle = '#e6e6e6'; ctx.fillText(fit(ctx, base, tabW - 34), 16, 28);
  ctx.textAlign = 'right'; ctx.font = `500 15px ${FONT}`;
  const plus = countLines(code.added), minus = countLines(code.removed);
  ctx.fillStyle = '#98c379'; const tag = `+${plus}`; ctx.fillText(tag, W - 150, 28);
  if (minus) { ctx.fillStyle = '#e06c75'; ctx.fillText(`−${minus}`, W - 108, 28); }
  ctx.fillStyle = '#7f848e'; ctx.fillText(`${code.tool} · ${F.dur(Date.now() - code.t)} ago`, W - 16, 28);
  ctx.textAlign = 'left';
  ctx.font = `400 14px ${FONT}`; ctx.fillStyle = '#5c6370';
  const crumbs = code.file.split('/').join('  ›  ') + (code.agent ? `     ⤷ subagent: ${code.agent}` : '');
  ctx.fillText(fit(ctx, crumbs, W - 32), 16, 66);

  const LH = 22, top = 92, gutter = 64, rows = Math.floor((H - top) / LH);
  ctx.font = `400 16px ${MONO}`;
  const cw = ctx.measureText('M').width, cols = Math.floor((W - gutter - 16) / cw);
  const text = code.added.slice(0, shown), lines = text.split('\n');
  const first = Math.max(0, lines.length - rows + 2);
  const start = code.line || 1;
  for (let i = first, row = 0; i < lines.length && row < rows; i++, row++) {
    const y = top + row * LH;
    const isCursor = i === lines.length - 1;
    if (isCursor && cursorOn !== null) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, y - 16, W, LH); }
    ctx.textAlign = 'right'; ctx.fillStyle = isCursor ? '#abb2bf' : '#4b5263';
    ctx.fillText(String(start + i), gutter - 14, y);
    ctx.textAlign = 'left';
    let x = gutter, used = 0;
    for (const [tok, col] of tokens(lines[i].replace(/\t/g, '  '))) {
      if (used >= cols) break;
      const piece = tok.slice(0, cols - used);
      ctx.fillStyle = col; ctx.fillText(piece, x, y);
      x += piece.length * cw; used += piece.length;
    }
    if (isCursor && cursorOn) { ctx.fillStyle = color; ctx.fillRect(Math.min(x, W - 12) + 1, y - 15, 2.5, 19); }
  }
  ctx.fillStyle = color; ctx.fillRect(gutter - 6, top - 16, 2, Math.min(rows, lines.length - first) * LH);
}

export function drawOff(scr) {
  const { ctx, W, H } = scr;
  ctx.fillStyle = '#060607'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

export function limitBar(ctx, x, y, w, label, l) {
  ctx.font = `500 17px ${FONT}`; ctx.fillStyle = '#c3c2b7'; ctx.fillText(label, x, y);
  if (!l) { ctx.fillStyle = '#6f6e69'; ctx.fillText('—', x + w - 20, y); return; }
  const p = l.used_percentage, c = p >= 90 ? '#d03b3b' : p >= 70 ? '#fab219' : '#0ca30c';
  ctx.font = `700 30px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(p + '%', x + w, y + 4); ctx.textAlign = 'left';
  ctx.fillStyle = '#2c2c2a'; ctx.beginPath(); ctx.roundRect(x, y + 16, w, 12, 6); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y + 16, Math.max(12, w * Math.min(p, 100) / 100), 12, 6); ctx.fill();
  ctx.font = `400 15px ${FONT}`; ctx.fillStyle = '#8b8a85';
  ctx.fillText('resets in ' + F.dur(l.resets_at * 1000 - Date.now()), x, y + 50);
}

export function drawUsage(scr, S) {
  const { ctx, W } = scr, t = S.totals;
  header(ctx, W, 'Usage', S.host);
  ctx.font = `600 15px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText('RUNNING', 30, 100); ctx.fillText('TODAY · API-EQ.', 300, 100); ctx.fillText('LIVE · LIFETIME', 560, 100);
  ctx.font = `700 48px ${FONT}`; ctx.fillStyle = '#fff';
  ctx.fillText(String(t.live), 30, 152); ctx.fillText(F.usd(t.todayCost), 300, 152); ctx.fillText(F.usd(t.liveCost), 560, 152);
  ctx.font = `500 17px ${FONT}`; ctx.fillStyle = '#22c55e'; ctx.fillText(`${t.working} working`, 30, 182);
  ctx.fillStyle = '#8b8a85'; ctx.fillText(`${F.tok(t.todayTokens)} tokens`, 300, 182); ctx.fillText(`+${t.linesAdded} / −${t.linesRemoved} lines`, 560, 182);
  limitBar(ctx, 30, 240, W - 60, '5-hour limit', S.rateLimits?.five_hour);
  limitBar(ctx, 30, 350, W - 60, 'Weekly limit', S.rateLimits?.seven_day);
}

export function drawRoster(scr, S) {
  const { ctx, W } = scr;
  header(ctx, W, 'Team', `${S.live.length} sessions · ${S.totals.working} working`);
  let y = 96;
  for (const s of S.live.slice(0, 9)) {
    const st = statusOf(s);
    ctx.fillStyle = dash.colorHex(s.sessionId); ctx.beginPath(); ctx.arc(40, y - 6, 8, 0, Math.PI * 2); ctx.fill();
    ctx.font = `700 14px ${FONT}`; ctx.fillStyle = st.color; ctx.fillText(st.text.replace(/^. /, ''), 60, y - 1);
    ctx.font = `600 19px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, titleOf(s), W - 330), 200, y);
    ctx.font = `600 18px ${FONT}`; ctx.fillStyle = '#c3c2b7'; ctx.textAlign = 'right'; ctx.fillText(F.usd(s.cost), W - 30, y); ctx.textAlign = 'left';
    y += 44;
  }
}

export function drawWall(scr, S) {
  const { ctx, W, H } = scr;
  header(ctx, W, 'Spend', 'API-equivalent');
  ctx.font = `600 18px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText('LAST 24 HOURS', 90, 110); ctx.fillText('LAST 30 DAYS', W / 2 + 70, 110);
  const hrs = S.hourly;
  bars(ctx, hrs.map((h) => h.cost), 90, 140, W / 2 - 150, H - 220, '#3987e5',
    (i) => (i % 6 === 0 || i === 23 ? new Date(hrs[i].t).toLocaleTimeString([], { hour: '2-digit' }) : ''), F.usd);
  const days = S.days || [];
  bars(ctx, days.map((d) => d.cost), W / 2 + 70, 140, W / 2 - 110, H - 220, '#9085e9',
    (i) => (i % 7 === 0 || i === days.length - 1 ? new Date(days[i].date + 'T12:00').toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''), F.usd);
}

// Today's token total in the board's header rolls up to each new figure like an odometer (see feedRoll in the loop).
export const tokenRoll = { shown: null, target: 0, from: 0, at: 0 };
export function drawFeed(scr, S) {
  const { ctx, W } = scr;
  header(ctx, W, 'Live activity', 'all sessions');
  ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(W - 46, 40, 9, 0, Math.PI * 2); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 300); ctx.fill(); ctx.globalAlpha = 1;
  const t = S.totals, n = Math.round(tokenRoll.shown ?? t.todayTokens);
  ctx.textAlign = 'right';
  ctx.font = `700 34px ${MONO}`; ctx.fillStyle = '#f3f2ec'; ctx.fillText(n.toLocaleString(), W - 74, 52);
  const nw = ctx.measureText(n.toLocaleString()).width;
  ctx.font = `600 13px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText('TOKENS TODAY', W - 86 - nw, 34);
  ctx.font = `400 15px ${FONT}`; ctx.fillStyle = '#6f6e69'; ctx.fillText(`${F.tok(t.todayOutput)} output · ${F.usd(t.todayCost)}`, W - 86 - nw, 56);
  ctx.textAlign = 'left';
  let y = 104;
  for (const e of S.feed.slice(0, 12)) {
    ctx.font = `500 20px ${FONT}`; ctx.fillStyle = '#6f6e69'; ctx.fillText(F.clock(e.t), 30, y);
    ctx.fillStyle = dash.colorHex(e.sessionId); ctx.beginPath(); ctx.arc(110, y - 7, 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = `500 18px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText(fit(ctx, e.session, 280), 128, y);
    const label = e.kind === 'tool' ? e.name : EV_LABEL[e.kind] || e.kind;
    ctx.font = `700 19px ${FONT}`; ctx.fillStyle = e.kind === 'error' || e.error ? '#e66767' : e.kind === 'prompt' ? '#3987e5' : '#c3c2b7';
    ctx.fillText(label, 430, y);
    const lw = Math.max(90, ctx.measureText(label).width + 14);
    ctx.font = `400 20px ${FONT}`; ctx.fillStyle = '#e6e5df'; ctx.fillText(fit(ctx, evText(e), W - 460 - lw), 430 + lw, y);
    y += 44;
  }
}

export function drawBoard(scr, S) {
  const { ctx, W, H } = scr;
  ctx.fillStyle = '#fbfbf8'; ctx.fillRect(0, 0, W, H);
  const marker = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
  ctx.font = `700 46px ${marker}`; ctx.fillStyle = '#1f5fbf'; ctx.fillText('Shipped today ✓', 40, 70);
  ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(40, 86); ctx.lineTo(420, 82); ctx.stroke();
  let y = 140;
  const done = S.recent.slice(0, 7);
  if (!done.length) { ctx.font = `400 30px ${marker}`; ctx.fillStyle = '#777'; ctx.fillText('nothing finished yet…', 40, y); }
  for (const r of done) {
    ctx.font = `400 30px ${marker}`; ctx.fillStyle = '#222';
    ctx.fillText(fit(ctx, '• ' + (r.title || F.home(r.cwd)), W - 260), 40, y);
    ctx.fillStyle = '#c0392b'; ctx.textAlign = 'right'; ctx.fillText(F.usd(r.cost), W - 40, y); ctx.textAlign = 'left';
    y += 54;
  }
}

export function drawLabel(lab, s, color) {
  const { ctx, W, H } = lab, st = statusOf(s);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(15,16,19,0.82)'; ctx.beginPath(); ctx.roundRect(4, 4, W - 8, H - 8, 22); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(36, 46, 11, 0, Math.PI * 2); ctx.fill();
  ctx.font = `700 30px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, titleOf(s), W - 80), 58, 57);
  const tr = s.transcript || {};
  let sub = s.status === 'idle' ? `idle ${F.dur(Date.now() - s.statusSince)} · ${F.usd(s.cost)}` : `${st.text.replace(/^. /, '').toLowerCase()}${tr.pendingTool ? ' · ' + tr.pendingTool.name : ''} · ${F.usd(s.cost)}`;
  if (s.subagents.active) sub += ` · ${s.subagents.active} subagents`;
  ctx.font = `500 22px ${FONT}`; ctx.fillStyle = st.color; ctx.fillText(fit(ctx, sub, W - 58), 32, 98);
}

