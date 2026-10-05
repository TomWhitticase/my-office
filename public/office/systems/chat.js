// Talking in the office: click someone to chat with their session (the panel and bar from chat.js, sent with
// /api/session/:id/send), or John in the server hall (POST /api/john, a claude -p with a snapshot of the machine).

import * as THREE from 'three';
import { CAN_CHAT, chatView, escapeHtml, titleOf } from '../../chat.js';
import { dash, F, makeCanvas } from '../util.js';
import { statusOf } from '../painters.js';

export function install(ctx) {
  const { hud, people, keys, camera, renderer, srv, toast } = ctx;
  Object.assign(ctx, { openChat, closeChat, openJohn });
  // ----- talking to a session -----
  // Clicking a person opens their conversation (right) and a message bar (bottom); keys go to the bar until Esc. The log,
  // polling and sending are shared with the desktop's Messages app (chat.js).
  const chatEl = hud.querySelector('.of-chat'), chatLog = chatEl.querySelector('.of-chatlog'), chatBar = hud.querySelector('.of-chatbar');
  const chatIn = chatBar.querySelector('textarea');
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
  { const b = makeCanvas(128, 96), c = b.ctx;
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(8, 6, 112, 64, 22); c.moveTo(40, 68); c.lineTo(30, 92); c.lineTo(62, 68); c.fill();
    c.fillStyle = '#3987e5'; for (const x of [40, 64, 88]) { c.beginPath(); c.arc(x, 38, 8, 0, Math.PI * 2); c.fill(); }
    bubble.material.map = b.tex; bubble.scale.set(0.42, 0.315, 1); bubble.visible = false; bubble.layers.set(1); }
  let bubbleT = 0;
  const talk = chatView({ log: chatLog, input: chatIn, send: chatBar.querySelector('button'), status: chatBar.querySelector('.st'),
    keys: ' · <kbd>Esc</kbd> back',
    onUpdate: renderChatHead,
    onSent(id) {
      const p = people.get(id);
      if (p) { p.root.add(bubble); bubble.position.y = 2.5; bubble.visible = true; clearTimeout(bubbleT);
        bubbleT = setTimeout(() => (bubble.visible = false), 4000); }
    } });
  function openChat(id) {
    if (!CAN_CHAT) { dash.openDrawer(id); return; }
    if (ctx.mode !== 'free' && ctx.mode !== 'chat') return;
    if (document.pointerLockElement) document.exitPointerLock();
    ctx.mode = 'chat'; keys.clear();
    hud.classList.add('of-chatting');
    const p = people.get(id);
    if (p) p.lookAt = camera.position;
    talk.open(id);
    renderChatHead();
    setTimeout(() => chatIn.focus());
  }
  function closeChat(relock) {
    if (johnChat.open) { closeJohn(relock); return; }
    if (!talk.id) return;
    const p = people.get(talk.id);
    if (p) p.lookAt = null;
    talk.close();
    hud.classList.remove('of-chatting');
    if (ctx.mode === 'chat') ctx.mode = 'free';
    if (relock) renderer.domElement.requestPointerLock();   // only works from a click; after Esc, click to look around again
  }
  function renderChatHead() {
    const s = ctx.state?.live.find((x) => x.sessionId === talk.id), st = s ? statusOf(s) : { text: 'ENDED', color: '#9a9890' };
    chatEl.querySelector('i').style.background = dash.colorHex(talk.id);
    chatEl.querySelector('b').textContent = s ? titleOf(s) : 'Session ended';
    const sm = chatEl.querySelector('small');
    sm.textContent = s ? `${st.text}${s.status === 'idle' ? ` · ${F.dur(Date.now() - s.statusSince)}` : ''} · ${s.name}` : '';
    sm.style.color = st.color;
  }
  chatEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.act === 'details') dash.openDrawer(talk.id);
    else if (b?.dataset.act === 'close') closeChat();
  });
  // ----- talking to John (the server hall) -----
  // The same panel and bar, cloned: John isn't a session, so his messages go to POST /api/john (claude -p on the server,
  // with a snapshot of the machine and sessions) and live only here. A bubble over his head while he thinks.
  const johnEl = chatEl.cloneNode(true), johnBar = chatBar.cloneNode(true);
  johnEl.classList.add('of-john'); johnBar.classList.add('of-john'); hud.append(johnEl, johnBar);
  johnEl.querySelector('[data-act=details]').remove();
  johnEl.querySelector('i').style.background = '#7a2e2a';
  johnEl.querySelector('b').textContent = 'John';
  johnEl.querySelector('small').textContent = 'Sysadmin · Server hall, floor 47';
  const johnLog = johnEl.querySelector('.of-chatlog'), johnIn = johnBar.querySelector('textarea'), johnSt = johnBar.querySelector('.st');
  johnIn.maxLength = 600; johnIn.placeholder = 'Ask John about the servers';
  const johnChat = { open: false, busy: false, msgs: [{ role: 'john', text: 'Alright? Pull up a chair. What d’you want to know about the boxes?' }],
    note: null };
  function renderJohn() {
    johnLog.innerHTML = johnChat.msgs.map((m) =>
      (m.role === 'user' ? `<div class="u">${escapeHtml(m.text)}</div>` :
      `<div class="${m.lunch || m.error ? 'n' : 'a'}">${escapeHtml(m.text)}</div>`)).join('')
      + (johnChat.busy ? '<div class="n typing">John is typing</div>' : '');
    johnLog.scrollTop = johnLog.scrollHeight;
    johnSt.className = 'st' + (johnChat.note ? ' bad' : '');
    johnSt.innerHTML = johnChat.note ? escapeHtml(johnChat.note) : 'He reads the live stats, nothing else · <kbd>Enter</kbd> send · <kbd>Esc</kbd> back';
    johnIn.disabled = johnBar.querySelector('button').disabled = johnChat.busy;
  }
  async function askJohn() {
    const text = johnIn.value.trim();
    if (!text || johnChat.busy) return;
    const history = johnChat.msgs.filter((m) => !m.lunch && !m.error).slice(-10).map(({ role, text }) => ({ role, text }));
    johnChat.msgs.push({ role: 'user', text }); johnIn.value = ''; johnIn.style.height = '';
    johnChat.busy = true; johnChat.note = null; renderJohn();
    srv.john.root.add(bubble); bubble.position.y = 2.0; bubble.visible = true;
    const r = await fetch('/api/john', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, history }) })
      .then((x) => x.json()).catch((e) => ({ error: e.message }));
    johnChat.busy = false; bubble.visible = false;
    if (r.reply) johnChat.msgs.push({ role: 'john', text: r.reply, lunch: r.lunch, error: r.error });
    else { johnChat.note = `John didn’t hear you: ${r.error || 'no answer'}`; johnChat.msgs.pop(); johnIn.value = text; }
    renderJohn();
    if (johnChat.open) johnIn.focus();
  }
  function openJohn() {
    if (!CAN_CHAT) { toast('John only talks to people on this computer'); return; }
    if (ctx.mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    ctx.mode = 'chat'; keys.clear(); johnChat.open = true;
    hud.classList.add('of-johnning');
    renderJohn();
    setTimeout(() => johnIn.focus());
  }
  function closeJohn(relock) {
    johnChat.open = false;
    hud.classList.remove('of-johnning');
    johnIn.blur();
    if (ctx.mode === 'chat') ctx.mode = 'free';
    if (relock) renderer.domElement.requestPointerLock();
  }
  johnEl.addEventListener('click', (e) => { if (e.target.closest('button')?.dataset.act === 'close') closeJohn(); });
  johnBar.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); askJohn(); });
  johnIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); askJohn(); } });
  johnIn.addEventListener('input', () => { johnIn.style.height = ''; johnIn.style.height = Math.min(johnIn.scrollHeight + 2, innerHeight * 0.3) + 'px'; });
  document.addEventListener('keydown', (e) => {
    if (!johnChat.open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeJohn(); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest?.('input, select, textarea') && !johnIn.disabled) johnIn.focus();
  }, true);

  // Esc closes the chat (or just the drawer, if Details is open); typing anywhere goes to the message bar.
  document.addEventListener('keydown', (e) => {
    if (!talk.id || document.body.classList.contains('drawer')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeChat(); return; }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest?.('input, select, textarea') && !chatIn.disabled) chatIn.focus();
  }, true);
  Object.assign(ctx, { talk, johnChat });
  ctx.action('john',
    { hover: () =>
    `<b>John</b><div class="m">Sysadmin · ${srv.john.mood === 'sip' ? 'sipping a coffee' : srv.john.mood === 'lean' ? 'leaning back' : 'tapping away at a terminal'}</div><div class="k">${CAN_CHAT ? 'Click to talk to him' : 'He only talks to people on this computer'}</div>`,
    click: () => openJohn() });
}
