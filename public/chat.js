// A conversation with one Claude session, shared by the office's chat panel (click a person) and the desktop's Messages app.
// Polls GET /api/session/:id/chat, sends with POST /api/session/:id/send (the server types it into the session's own terminal),
// and renders the log and the compose box's status line. Never from a TV or a framed copy of the page.

const dash = window.dash;
export const CAN_CHAT = window.top === window && !/HeadlessChrome|my-office-tv/.test(navigator.userAgent);
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const titleOf = (s) => s.statusline?.name || s.transcript?.title || s.name;

export function md(text) {
  return String(text).split(/```[^\n]*\n?/).map((part, i) => i % 2 ? `<pre>${escapeHtml(part.replace(/\n$/, ''))}</pre>` :
    escapeHtml(i ? part.replace(/^\n/, '') : part).split('\n').map((l) => {
      // Code spans (any run of backticks, as in CommonMark) first, so ** inside code stays literal.
      l = l.split(/(`+)(.+?)\1(?!`)/).map((x, j) => j % 3 === 2 ? `<code>${x.replace(/^ (.+) $/, '$1')}</code>` : j % 3 ? '' : x.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')).join('');
      const h = l.match(/^#{1,6}\s+(.*)/);
      return h ? `<span class="h">${h[1]}</span>` : l.replace(/^(\s*)[-*] /, '$1• ');
    }).join('\n')).join('');
}

// log: the scrolling message list; input/send/status: the compose box. `keys` is appended to the status hint, onUpdate runs
// after each poll, onSent(id) after a message is delivered. route() says whether to ask the server how a message would be
// delivered (it looks up terminals, so only while the chat is really in use).
export function chatView({ log, input, send, status, keys = '', onUpdate = () => {}, onSent = () => {}, route = () => true }) {
  const c = { id: null, seq: null, msgs: [], route: null, cantSend: null, outbox: [], note: null, busy: false, timer: 0, routeAt: 0, polling: false, html: '', open, close, poll, sync, render };
  function open(id) {
    if (c.id !== id) Object.assign(c, { id, seq: null, msgs: [], route: null, cantSend: null, outbox: [], note: null, routeAt: 0 });
    c.html = '';
    log.innerHTML = '<div class="n">Loading the conversation…</div>';
    sync(); poll();
    clearInterval(c.timer); c.timer = setInterval(poll, 1000);
  }
  function close() {
    clearInterval(c.timer);
    c.id = null;
    input.blur();
  }
  async function poll() {
    if (c.polling || !c.id) return;   // one request at a time, so an old answer can't land after a newer one
    const id = c.id, withRoute = route() && Date.now() - c.routeAt > 10000;
    c.polling = true;
    const r = await fetch(`/api/session/${id}/chat?seq=${c.seq ?? ''}${withRoute ? '&route' : ''}`).then((x) => x.json()).catch(() => null);
    c.polling = false;
    if (!r || id !== c.id) return;
    if (withRoute) { c.routeAt = Date.now(); c.route = r.route || null; c.cantSend = r.cantSend || null; }
    if (r.messages) { c.msgs = r.messages; c.seq = r.seq; }
    // A sent message stays in the outbox until the transcript has it, which is the proof it reached Claude.
    const n = c.outbox.length;
    c.outbox = c.outbox.filter((o) => !c.msgs.some((m) => m.role === 'user' && m.text.includes(o.text) && m.t >= o.t - 5000) && Date.now() - o.t < 120000);
    if (c.outbox.length < n && c.note?.cls === 'ok') c.note = { cls: 'ok', at: Date.now(), text: 'Delivered · it’s in the conversation' };
    onUpdate(); sync(); render();
  }
  function render() {
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    const out = [], tools = [];
    let lastT = 0;
    const flush = () => {
      if (!tools.length) return;
      const line = (m) => `${escapeHtml(m.name)} · ${escapeHtml(m.text)}`;
      out.push(tools.length === 1 ? `<div class="t">⚙ ${line(tools[0])}</div>`
        : `<details class="t"><summary>⚙ ${tools.length} tool calls · ${escapeHtml([...new Set(tools.map((m) => m.name))].join(', '))}</summary>${tools.map((m) => `<div>${line(m)}</div>`).join('')}</details>`);
      tools.length = 0;
    };
    for (const m of c.msgs) {
      if (m.t - lastT > 15 * 60e3) { flush(); out.push(`<div class="ts">${new Date(m.t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</div>`); }
      lastT = m.t || lastT;
      if (m.role === 'tool') { tools.push(m); continue; }
      flush();
      if (m.role === 'user') out.push(`<div class="u${m.queued ? ' q' : ''}">${escapeHtml(m.text)}${m.queued ? '<em>queued · Claude will read it when it can</em>' : ''}</div>`);
      else if (m.role === 'assistant') out.push(`<div class="a">${md(m.text)}</div>`);
      else out.push(`<div class="n">${escapeHtml(m.text)}</div>`);
    }
    flush();
    for (const o of c.outbox) out.push(`<div class="u q">${escapeHtml(o.text)}<em>${o.queued ? 'queued · Claude will read it when it can' : 'sent'}</em></div>`);
    const s = dash.state?.live.find((x) => x.sessionId === c.id);
    if (s?.status === 'working') out.push(`<div class="n">${s.transcript?.pendingTool ? `working · ${escapeHtml(s.transcript.pendingTool.name)}` : 'thinking'}…</div>`);
    const html = out.join('') || '<div class="n">No conversation yet</div>';
    if (html === c.html) return;   // unchanged: leave the DOM (and any selection) alone
    // Keep expanded tool groups open across updates; they're counted from the top, which only grows.
    const open = [...log.querySelectorAll('details')].map((d) => d.open);
    c.html = log.innerHTML = html;
    log.querySelectorAll('details').forEach((d, i) => { if (open[i]) d.open = true; });
    if (stick) log.scrollTop = log.scrollHeight;
  }
  function sync() {
    const s = dash.state?.live.find((x) => x.sessionId === c.id), who = s ? titleOf(s) : 'this session';
    const why = !CAN_CHAT ? 'messages can only be sent from your own browser' : !s ? 'this session has ended' : c.cantSend || (!['idle', 'working'].includes(s.status) && `it’s ${s.status === 'waiting' ? 'waiting on a prompt (a permission request or question)' : s.status}: answer it in its terminal`);
    input.disabled = send.disabled = !!why || c.busy;
    input.placeholder = why ? 'Can’t send from here' : s.status === 'working' ? `Message ${who} · it’s working, so this will be queued` : `Message ${who}`;
    if (c.note?.cls === 'ok' && Date.now() - c.note.at > 8000) c.note = null;   // success fades; errors stay until you type
    if (c.note) { status.className = 'st ' + c.note.cls; status.textContent = c.note.text; return; }
    status.className = 'st' + (why ? ' bad' : s.status === 'working' ? ' warn' : '');
    status.innerHTML = why ? escapeHtml(why[0].toUpperCase() + why.slice(1)) : s.status === 'working'
      ? `Working: your message will be queued and Claude reads it at its next step · <kbd>Enter</kbd> send · <kbd>Shift+Enter</kbd> new line${keys}`
      : `${s.status === 'idle' ? 'Waiting for you' : escapeHtml(s.status)}${c.route ? ` · types into its ${c.route === 'orca' ? 'Orca' : 'tmux'} terminal` : ''} · <kbd>Enter</kbd> send · <kbd>Shift+Enter</kbd> new line${keys}`;
  }
  async function sendMsg() {
    const id = c.id, text = input.value.trim();
    if (!text || c.busy || input.disabled) return;
    c.busy = true; c.note = { cls: '', text: 'Sending…' }; sync();
    const r = await fetch(`/api/session/${id}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
      .then((x) => x.json()).catch((e) => ({ error: e.message }));
    c.busy = false;
    if (id !== c.id) return;
    if (r.error) c.note = { cls: 'bad', text: `Not sent: ${r.error}` };
    else {
      input.value = ''; input.style.height = '';
      c.outbox.push({ text, t: Date.now(), queued: r.queued });
      c.note = { cls: 'ok', at: Date.now(), text: r.queued ? 'Delivered · queued until Claude finishes its current step' : r.started ? 'Delivered · Claude is on it' : 'Typed into its terminal · waiting to see it in the conversation…' };
      onSent(id);
    }
    sync(); render();
    input.focus();
  }
  input.form.addEventListener('submit', (e) => { e.preventDefault(); sendMsg(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMsg(); } });
  input.addEventListener('input', () => {
    input.style.height = ''; input.style.height = Math.min(input.scrollHeight + 2, innerHeight * 0.3) + 'px';
    if (c.note && !c.busy) { c.note = null; sync(); }
  });
  return c;
}
