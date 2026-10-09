// The task board on my office's north wall: a cork board in a timber frame, each column's name on a pinned card strip,
// index cards and sticky notes in handwriting, masking tape between the columns, a red string under the headings, and a
// marker tray with a pad of stickies. What's on it is the server's (/api/board; every browser kept in step by the board
// event): this paints it, keeps the layout the overlay (systems/task-board.js) points at, and sends changes as ops,
// shown at once and put right by what the server sends back. Built under its own seeded random, so nothing else moves.

import * as THREE from 'three';
import { escapeHtml } from '../../chat.js';
import { box, cyl, dash, FONT, makeCanvas, MARKER, mat, matCache, rng } from '../util.js';

// Where it hangs (the plane's centre and size in metres) and its canvas.
export const TB = { x: 16.7, y: 1.975, z: -14.874, w: 3.2, h: 1.35, W: 2048, H: 864 };   // above the guitar corner
export const HAND = '"Bradley Hand", "Noteworthy", "Segoe Print", "Comic Sans MS", cursive';
// Sticky notes are bright; index cards come in white and paler card stock.
export const COLORS = { white: '#fbf9f1', yellow: '#fbe98a', pink: '#f9c3d2', blue: '#bfe0f5', green: '#cdecb4', orange: '#fcc98f' };
const STOCK = { white: '#fbf9f1', yellow: '#fbf3c4', pink: '#fbe2e8', blue: '#e0eef8', green: '#e5f3d8', orange: '#fde7cc' };
export const PRIO = ['None', 'Low', 'Medium', 'High'], PRIO_COLOR = [null, '#3cae5c', '#f0a630', '#e0453a'];
const PINS = ['#d23b2f', '#2f6fd2', '#2e9b55', '#e8b23a', '#8a4fd0', '#ece8df'];
const TAGS = ['#7fb3e8', '#f2a65a', '#9ad17a', '#e88fb4', '#c6a0f0', '#f5d45e'];
const INK = '#1f2b4d';
export const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
export const newId = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7).padEnd(5, '0');
export const BLANK = { kind: 'index', color: 'white', title: '', body: '', prio: 0, due: '', labels: [], who: '', archived: false };

// ----- layout: where everything is on the canvas (the overlay uses the same numbers to point at things) -----
const M = 34, TOP = 150, BOT = TB.H - 24, GAP = 14, STEP = 56, MORE = 44;
export function cardSize(c, cw) {
  if (c.kind === 'sticky') { const s = Math.round(Math.min(cw - 64, 236)); return { w: s, h: s }; }
  const w = Math.round(Math.min(cw - 36, 330));
  return { w, h: Math.round(w * 0.6) };
}
// view: { draft } a card being edited, shown as it will be (in place, or at the end of its column if it's new);
// { drag: { id, card, col, at, x, y } } a card being dragged: a gap where it would drop, and the card at (x, y).
export function layout(b, view = {}) {
  const cols = b.columns, n = cols.length, cw = (TB.W - 2 * M) / n, { draft, drag } = view;
  const out = { cw, cols: [], cards: [], more: [] }, lists = new Map(cols.map((c) => [c.id, []]));
  for (const c of b.cards) {
    if (c.archived || (drag && c.id === drag.id)) continue;
    const card = draft?.id === c.id ? draft : c;
    (lists.get(card.col) || lists.get(cols[0].id)).push(card);
  }
  if (draft && !b.cards.some((c) => c.id === draft.id)) lists.get(draft.col)?.push(draft);
  if (drag && lists.has(drag.col)) lists.get(drag.col).splice(drag.at, 0, { ...drag.card, ghost: true });
  cols.forEach((col, i) => {
    const x = M + i * cw, list = lists.get(col.id), sizes = list.map((c) => cardSize(c, cw));
    out.cols.push({ id: col.id, name: col.name, x, w: cw, n: list.filter((c) => !c.ghost).length });
    const fits = sizes.reduce((s, z) => s + z.h + GAP, -GAP) <= BOT - TOP;
    // Too many to lay out whole: shingle them, each still showing its heading; past that, count the rest.
    let k = list.length, step = 0;
    if (!fits) {
      const hmax = Math.max(...sizes.map((z) => z.h));
      k = Math.min(k, Math.floor((BOT - TOP - MORE - hmax) / STEP) + 1);
      step = (BOT - TOP - (k < list.length ? MORE : 0) - sizes[k - 1].h) / Math.max(1, k - 1);
    }
    let y = TOP;
    for (let j = 0; j < k; j++) {
      const c = list[j], { w, h } = sizes[j], r = hash(c.id);
      const cx = x + cw / 2 + ((r % 13) - 6);
      out.cards.push({ c, col: col.id, i: j, x: cx - w / 2, y, w, h, rot: (((r >> 8) % 1000) / 1000 - 0.5) * 0.07 });
      y += fits ? h + GAP : Math.min(step, h + GAP);
    }
    if (k < list.length) out.more.push({ col: col.id, n: list.length - k, x: x + cw / 2, y: BOT - MORE / 2 + 4 });
  });
  return out;
}
// Where a card dropped at canvas (px, py) goes: { col, at } among that column's cards (the dragged one left out).
export function dropAt(lay, px, py) {
  const col = lay.cols.find((k) => px < k.x + k.w) || lay.cols[lay.cols.length - 1] || null;
  if (!col) return null;
  const inCol = lay.cards.filter((k) => k.col === col.id && !k.c.ghost);
  let at = 0;
  for (const k of inCol) if (py > k.y + Math.min(k.h, STEP) / 2) at = k.i + 1;
  return { col: col.id, at: Math.min(at, inCol.length) };
}
export const headerRect = (col) => { const w = Math.min(col.w - 70, 300); return { x: col.x + col.w / 2 - w / 2, y: 34, w, h: 76 }; };

// ----- the ops, applied here as the server will (it checks and clamps them; this only has to agree) -----
function put(b, c, col, at) {
  const inCol = b.cards.filter((x) => x.col === col && !x.archived), before = Number.isInteger(at) && at >= 0 ? inCol[at] : null;
  c.col = col;
  if (before) b.cards.splice(b.cards.indexOf(before), 0, c);
  else { const last = inCol[inCol.length - 1]; b.cards.splice(last ? b.cards.indexOf(last) + 1 : b.cards.length, 0, c); }
}
export function applyOps(b, ops) {
  b = { ...b, columns: b.columns.map((k) => ({ ...k })), cards: b.cards.map((c) => ({ ...c })) };
  for (const o of ops) {
    const i = b.cards.findIndex((c) => c.id === (o.op === 'add' ? o.card?.id : o.id));
    if (o.op === 'add' && i < 0) put(b, { ...BLANK, ...o.card }, o.col ?? b.columns[0].id, o.at);
    else if (o.op === 'edit' && i >= 0) Object.assign(b.cards[i], o.set);
    else if (o.op === 'move' && i >= 0) { const [c] = b.cards.splice(i, 1); c.archived = false; put(b, c, o.col, o.at); }
    else if (o.op === 'archive' && i >= 0) b.cards[i].archived = o.archived !== false;
    else if (o.op === 'delete' && i >= 0) b.cards.splice(i, 1);
    else if (o.op === 'columns') {
      b.columns = o.columns.map((k) => ({ id: k.id, name: k.name }));
      for (const c of b.cards) if (!b.columns.some((k) => k.id === c.col)) c.col = b.columns[0].id;
    }
  }
  return b;
}

// ----- painting -----
// Lines of text that fit maxW, at most max of them (the last one cut with an ellipsis); \n starts a new line.
export function wrap(c, text, maxW, max) {
  const out = [];
  for (const para of String(text || '').slice(0, 800).split('\n')) {
    let line = '';
    for (let word of para.split(' ')) {
      while (c.measureText(word).width > maxW && word.length > 1) {   // longer than a line: break it
        let n = word.length - 1;
        while (n > 1 && c.measureText(word.slice(0, n)).width > maxW) n = Math.floor(n * 0.8);
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, n)); word = word.slice(n);
      }
      const t = line ? `${line} ${word}` : word;
      if (line && c.measureText(t).width > maxW) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
    if (out.length > max) break;
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  if (out.length > max) {
    out.length = max;
    let l = out[max - 1];
    while (l && c.measureText(l + '…').width > maxW) l = l.slice(0, -1);
    out[max - 1] = l.trimEnd() + '…';
  }
  return out;
}
export const dueText = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };

// The strip along a card's foot: a priority sticker, label tags, the due date and whose it is.
function footer(c, card, w, h, s) {
  const y = h - 16 * s, pad = 13 * s;
  let x = pad, right = w - pad;
  if (card.who) {
    const r = 12 * s, cx = right - r;
    c.fillStyle = `hsl(${hash(card.who) % 360} 45% 42%)`; c.beginPath(); c.arc(cx, y - 2 * s, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = `700 ${Math.round(10.5 * s)}px ${FONT}`; c.textAlign = 'center'; c.fillText(card.who.slice(0, 3), cx, y + 2 * s);
    right = cx - r - 6 * s;
  }
  if (card.due) {
    const over = card.due < today();
    c.font = `400 ${Math.round(15 * s)}px ${HAND}`; c.textAlign = 'right'; c.fillStyle = over ? '#c0392b' : '#4a4f5c';
    const t = (over ? '! ' : '') + dueText(card.due);
    c.fillText(t, right, y + 3 * s); right -= c.measureText(t).width + 8 * s;
  }
  c.textAlign = 'left';
  if (card.prio) {
    const r = 7.5 * s;
    c.fillStyle = PRIO_COLOR[card.prio]; c.beginPath(); c.arc(x + r, y - 2 * s, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(x + r * 0.7, y - 2 * s - r * 0.3, r * 0.35, 0, Math.PI * 2); c.fill();
    x += r * 2 + 6 * s;
  }
  c.font = `600 ${Math.round(11 * s)}px ${FONT}`;
  for (const l of card.labels || []) {
    const tw = Math.min(c.measureText(l).width, 90 * s) + 10 * s;
    if (x + tw > right) break;
    c.fillStyle = TAGS[hash(l) % TAGS.length]; c.fillRect(x, y - 10 * s, tw, 16 * s);
    c.fillStyle = 'rgba(20,24,32,.85)';
    c.save(); c.beginPath(); c.rect(x, y - 10 * s, tw - 4 * s, 16 * s); c.clip(); c.fillText(l, x + 5 * s, y + 2 * s); c.restore();
    x += tw + 5 * s;
  }
}
// A card's face, w × h canvas pixels.
export function drawFace(c, card, w, h) {
  const sticky = card.kind === 'sticky', s = sticky ? w / 236 : h / 198, pad = 13 * s;
  const foot = card.prio || card.due || card.who || card.labels?.length ? 26 * s : 0;
  c.textBaseline = 'alphabetic';
  if (sticky) {
    const g = c.createLinearGradient(0, 0, 0, h), base = COLORS[card.color] || COLORS.yellow;
    g.addColorStop(0, base); g.addColorStop(1, shade(base, -0.07));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,.035)'; c.fillRect(0, 0, w, 0.13 * h);   // the glue strip
    c.font = `400 ${Math.round(29 * s)}px ${MARKER}`; c.fillStyle = INK;
    const tl = wrap(c, card.title || 'Untitled', w - 2 * pad, 2);
    tl.forEach((t, i) => c.fillText(t, pad, 0.13 * h + 30 * s + i * 32 * s));
    c.font = `400 ${Math.round(18 * s)}px ${HAND}`; c.fillStyle = '#2b3550';
    const top = 0.13 * h + 30 * s + (tl.length - 1) * 32 * s + 28 * s, lh = 22 * s;
    wrap(c, card.body, w - 2 * pad, Math.max(0, Math.floor((h - top - foot) / lh) + 1)).forEach((t, i) => c.fillText(t, pad, top + i * lh));
  } else {
    c.fillStyle = STOCK[card.color] || STOCK.white; c.fillRect(0, 0, w, h);
    const head = Math.round(h * 0.25), rule = h * 0.115;
    c.lineWidth = Math.max(1, 1.2 * s);
    c.strokeStyle = 'rgba(110,160,210,.5)';
    c.beginPath(); for (let y = head + rule; y < h - 6 * s; y += rule) { c.moveTo(0, y); c.lineTo(w, y); } c.stroke();
    c.strokeStyle = 'rgba(214,92,92,.7)'; c.beginPath(); c.moveTo(0, head); c.lineTo(w, head); c.stroke();
    c.font = `400 ${Math.round(27 * s)}px ${MARKER}`; c.fillStyle = INK;
    c.fillText(wrap(c, card.title || 'Untitled', w - 2 * pad, 1)[0] || '', pad, head - 11 * s);
    c.font = `400 ${Math.round(17 * s)}px ${HAND}`; c.fillStyle = '#2b3550';
    const n = Math.max(0, Math.floor((h - head - foot - 4 * s) / rule));
    wrap(c, card.body, w - 2 * pad, n).forEach((t, i) => c.fillText(t, pad, head + rule * (i + 1) - 5 * s));
  }
  if (foot) footer(c, card, w, h, s);
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(Math.min(255, Math.max(0, v + v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function pin(c, x, y, color, r = 9) {
  c.save();
  c.shadowColor = 'rgba(30,15,5,.5)'; c.shadowBlur = 4; c.shadowOffsetX = 3; c.shadowOffsetY = 4;
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff'); g.addColorStop(0.25, color); g.addColorStop(1, shade(color.length === 7 ? color : '#888888', -0.45));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { world } = ctx;
  // three gives every object a uuid from Math.random: build under a seeded one of our own (and leave the material
  // cache as it was), so the rest of the office comes out the same.
  const random = Math.random, cached = new Set(matCache.keys());
  Math.random = rng(4242);
  let built;
  try { built = build(); } finally { Math.random = random; for (const k of [...matCache.keys()]) if (!cached.has(k)) matCache.delete(k); }
  const { scr, mesh, cork } = built;

  function build() {
    const g = new THREE.Group(); g.name = 'task board'; world.add(g);
    const { x, y, z, w, h } = TB, wood = mat('#8a5a33', { roughness: 0.55 }), dark = mat('#5a3a20', { roughness: 0.6 });
    box(g, w + 0.04, h + 0.04, 0.02, '', x, y, z - 0.012, { material: dark });
    const scr = makeCanvas(TB.W, TB.H);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: scr.tex, roughness: 0.92 }));
    mesh.position.set(x, y, z); mesh.receiveShadow = true;
    mesh.userData = { action: 'taskboard', reach: 7 };
    g.add(mesh);
    // The frame: four timber rails proud of the cork.
    for (const [fw, fh, fx, fy] of [[w + 0.16, 0.08, x, y + h / 2 + 0.04], [w + 0.16, 0.08, x, y - h / 2 - 0.04], [0.08, h, x - w / 2 - 0.04, y],
      [0.08, h, x + w / 2 + 0.04, y]]) box(g, fw, fh, 0.05, '', fx, fy, z + 0.008, { material: wood });
    // The marker tray along the bottom: markers, an eraser, a pad of stickies and a stack of index cards.
    const ty = y - h / 2 - 0.1, tz = z + 0.05;
    box(g, w * 0.86, 0.02, 0.1, '', x, ty, tz, { material: wood });
    box(g, w * 0.86, 0.035, 0.012, '', x, ty + 0.012, tz + 0.05, { material: wood });
    for (const [mx, col] of [[-0.9, '#1c1f24'], [-0.75, '#c0392b'], [-0.6, '#1f5fbf'], [-0.45, '#2e8b57']]) {
      const m = cyl(g, 0.01, 0.01, 0.13, col, x + mx, ty + 0.021, tz - 0.005, { seg: 10 });
      m.rotation.z = Math.PI / 2 + (hash(col) % 7 - 3) * 0.02;
      cyl(g, 0.0105, 0.0105, 0.04, '#e8e6df', x + mx + 0.075, ty + 0.021, tz - 0.005, { seg: 10 }).rotation.z = Math.PI / 2;
    }
    box(g, 0.13, 0.035, 0.05, '#2f3236', x - 0.18, ty + 0.028, tz - 0.01);
    box(g, 0.13, 0.008, 0.05, '#d8d4c8', x - 0.18, ty + 0.006, tz - 0.01);
    box(g, 0.076, 0.022, 0.076, '#fbe98a', x + 0.55, ty + 0.021, tz - 0.008).rotation.y = 0.12;
    box(g, 0.076, 0.016, 0.076, '#f9c3d2', x + 0.7, ty + 0.018, tz - 0.006).rotation.y = -0.08;
    box(g, 0.127, 0.014, 0.076, '#fbf9f1', x + 0.95, ty + 0.017, tz - 0.008).rotation.y = 0.05;

    // The cork, once: warm brown with darker and lighter granules.
    const cork = document.createElement('canvas'); cork.width = TB.W; cork.height = TB.H;
    const k = cork.getContext('2d'), r = rng(77);
    const gr = k.createLinearGradient(0, 0, TB.W, TB.H); gr.addColorStop(0, '#c08d5b'); gr.addColorStop(1, '#b07c4b');
    k.fillStyle = gr; k.fillRect(0, 0, TB.W, TB.H);
    for (let i = 0; i < 26000; i++) {
      const v = r();
      k.fillStyle = v < 0.45 ? `rgba(120,72,35,${0.25 + r() * 0.3})` : v < 0.8 ? `rgba(225,180,125,${0.2 + r() * 0.3})` : `rgba(80,45,20,${0.2 + r() * 0.3})`;
      k.fillRect(r() * TB.W, r() * TB.H, 1 + r() * 3.5, 1 + r() * 3.5);
    }
    // Old pin holes.
    k.fillStyle = 'rgba(50,28,12,.5)';
    for (let i = 0; i < 160; i++) { k.beginPath(); k.arc(r() * TB.W, r() * TB.H, 1.6, 0, Math.PI * 2); k.fill(); }
    return { scr, mesh, cork };
  }

  // ----- the board's data -----
  // server: the last board the server sent; board: that with this page's unanswered ops on top (what's shown).
  const tb = { server: null, board: null, pending: [], view: { draft: null, drag: null }, dirty: true, lay: null, listeners: new Set() };
  function take(b) {
    if (!b || !Array.isArray(b.columns) || !Array.isArray(b.cards)) return;
    if (tb.server && b.rev < tb.server.rev) return;
    tb.server = b;
    tb.board = tb.pending.reduce((x, ops) => applyOps(x, ops), b);
    changed();
  }
  function changed() { tb.dirty = true; for (const f of tb.listeners) f(tb.board); }
  dash.boardListeners?.add(take);
  take(dash.board);
  // Sends ops: shown now, saved by the server, which every browser then hears from.
  async function send(ops) {
    if (!tb.board) return false;
    tb.pending.push(ops);
    tb.board = applyOps(tb.board, ops); changed();
    const r = await fetch('/api/board', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) })
      .then((res) => res.json().then((j) => ({ ok: res.ok, j }), () => ({ ok: false, j: { error: `HTTP ${res.status}` } })), (e) => ({ ok: false, j: { error: e.message } }));
    tb.pending.splice(tb.pending.indexOf(ops), 1);
    if (!r.ok) ctx.toast(`Couldn’t save the board: ${escapeHtml(r.j.error || 'no answer')}`);
    const b = r.ok ? r.j : r.j.board;
    if (b) take(b); else { tb.board = tb.pending.reduce((x, o) => applyOps(x, o), tb.server); changed(); }
    return r.ok;
  }
  // A new card from outside the board (Rosie): into the column of that id or name, else the first.
  function addCard(card, column) {
    const b = tb.board;
    if (!b) return null;
    const want = String(column || '').toLowerCase(), col = b.columns.find((k) => k.id === column || k.name.toLowerCase() === want) || b.columns[0];
    const c = { ...BLANK, kind: 'index', color: 'white', ...card, id: newId() };
    send([{ op: 'add', card: c, col: col.id }]);
    return { card: c, col };
  }

  // ----- painting it -----
  const faces = new Map();   // a card's face, by what's on it
  function faceOf(card, w, h) {
    const key = JSON.stringify([card.kind, card.color, card.title, card.body.slice(0, 800), card.prio, card.due, card.labels, card.who, w, h, card.due && today()]);
    let f = faces.get(key);
    if (!f) {
      f = document.createElement('canvas'); f.width = w; f.height = h;
      drawFace(f.getContext('2d'), card, w, h);
      if (faces.size > 800) faces.delete(faces.keys().next().value);
    } else faces.delete(key);
    faces.set(key, f);
    return f;
  }
  function drawCard(c, k, lifted) {
    const { w, h } = k, sticky = k.c.kind === 'sticky';
    c.save();
    c.translate(k.x + w / 2, k.y + h / 2); c.rotate(k.rot);
    if (k.c.ghost) {
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.setLineDash([12, 8]); c.lineWidth = 3;
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(-w / 2, -h / 2, w, h); c.strokeRect(-w / 2, -h / 2, w, h);
      c.restore(); return;
    }
    c.shadowColor = 'rgba(40,22,8,.5)'; c.shadowBlur = lifted ? 26 : sticky ? 9 : 6;
    c.shadowOffsetX = lifted ? 10 : 3; c.shadowOffsetY = lifted ? 16 : sticky ? 6 : 4;
    c.drawImage(faceOf({ ...BLANK, ...k.c }, w, h), -w / 2, -h / 2);
    c.shadowColor = 'transparent';
    c.restore();
    if (!sticky) {
      const py = -h / 2 + 15 * (h / 198), cs = Math.cos(k.rot), sn = Math.sin(k.rot);
      pin(c, k.x + w / 2 - py * sn, k.y + h / 2 + py * cs, PINS[hash(k.c.id) % PINS.length], 10 * (h / 198));
    }
  }
  function paint() {
    tb.dirty = false;
    const c = scr.ctx, b = tb.board;
    c.drawImage(cork, 0, 0);
    if (!b) { tb.lay = null; scr.tex.needsUpdate = true; return; }
    const lay = tb.lay = layout(b, tb.view);
    // Masking tape between the columns, and a red string under the headings, pinned where it crosses.
    for (let i = 1; i < lay.cols.length; i++) {
      const x = lay.cols[i].x, r = hash(lay.cols[i].id);
      c.save(); c.translate(x, TB.H / 2); c.rotate(((r % 100) / 100 - 0.5) * 0.012);
      c.fillStyle = 'rgba(236,224,190,.78)'; c.fillRect(-11, -TB.H / 2 + 14, 22, TB.H - 28);
      c.fillStyle = 'rgba(160,140,100,.15)'; for (let y = -TB.H / 2 + 20; y < TB.H / 2 - 20; y += 9) c.fillRect(-11, y, 22, 1);
      c.restore();
    }
    c.strokeStyle = '#b3261e'; c.lineWidth = 3.5; c.shadowColor = 'rgba(40,20,5,.45)'; c.shadowBlur = 3; c.shadowOffsetY = 3;
    c.beginPath(); c.moveTo(M - 10, 128);
    const ends = [M - 10, ...lay.cols.slice(1).map((k) => k.x), TB.W - M + 10];
    for (let i = 1; i < ends.length; i++) c.quadraticCurveTo((ends[i - 1] + ends[i]) / 2, 136, ends[i], 128);
    c.stroke(); c.shadowColor = 'transparent';
    for (const x of ends) pin(c, x, 128, '#ece8df', 7);
    // The headings: a card strip per column, its name in marker, how many cards in pencil.
    for (const col of lay.cols) {
      const r = headerRect(col), rot = ((hash(col.id + col.name) % 100) / 100 - 0.5) * 0.04;
      c.save(); c.translate(r.x + r.w / 2, r.y + r.h / 2); c.rotate(rot);
      c.shadowColor = 'rgba(40,22,8,.45)'; c.shadowBlur = 6; c.shadowOffsetX = 2; c.shadowOffsetY = 4;
      c.fillStyle = '#f6f1e4'; c.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
      c.shadowColor = 'transparent';
      c.fillStyle = '#1b1d22'; c.textAlign = 'center'; c.textBaseline = 'middle';
      let px = 40; c.font = `400 ${px}px ${MARKER}`;
      const name = col.name.toUpperCase();
      while (px > 20 && c.measureText(name).width > r.w - 60) c.font = `400 ${(px -= 2)}px ${MARKER}`;
      c.fillText(wrap(c, name, r.w - 50, 1)[0] || '', -8, 3);
      c.font = `400 22px ${HAND}`; c.fillStyle = '#777'; c.textAlign = 'right'; c.fillText(String(col.n), r.w / 2 - 12, 22);
      c.restore();
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      pin(c, r.x + 16, r.y + 14, PINS[hash(col.id) % PINS.length], 8); pin(c, r.x + r.w - 16, r.y + 14, PINS[(hash(col.id) + 2) % PINS.length], 8);
    }
    for (const k of lay.cards) drawCard(c, k);
    for (const m of lay.more) {
      c.save(); c.translate(m.x, m.y); c.rotate(-0.03);
      c.fillStyle = '#f6f1e4'; c.shadowColor = 'rgba(40,22,8,.4)'; c.shadowBlur = 5; c.shadowOffsetY = 3; c.fillRect(-80, -18, 160, 36);
      c.shadowColor = 'transparent'; c.fillStyle = '#333'; c.font = `400 24px ${HAND}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(`+ ${m.n} more`, 0, 2); c.restore();
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    }
    const d = tb.view.drag;
    if (d?.x != null) { const { w, h } = cardSize(d.card, lay.cw); drawCard(c, { c: d.card, x: d.x - w / 2, y: d.y - h * 0.2, w, h, rot: -0.03 }, true); }
    scr.tex.needsUpdate = true;
  }
  ctx.onFrame(() => { if (tb.dirty) paint(); }, 131);

  const fmtCounts = () => tb.board ? tb.board.columns.map((k) => `${escapeHtml(k.name)} ${tb.board.cards.filter((c) => c.col === k.id && !c.archived).length}`).join(' · ') : 'Loading…';
  ctx.action('taskboard', { hover: () => `<b>Task board</b><div class="m">${fmtCounts()}</div><div class="k">Click to use it</div>`,
    click: () => ctx.useTaskBoard?.() });
  ctx.hoverTargets(() => [mesh], 85);
  Object.assign(ctx, { taskBoard: { tb, send, addCard, mesh, scr, layout, paint: () => { tb.dirty = true; } } });
}
