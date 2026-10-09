// Using the task board: clicking it frames it square-on (mode 'board', as at a whiteboard) and lays a layer over it that
// lines up with what's painted: drag a card to another column or place, click one to open it (title, details, column,
// priority, due date, labels, who), double-click a heading to rename it. Every change is an op the board sends to the
// server, and each can be undone. Card text only ever goes in as a value or textContent, never as HTML.

import * as THREE from 'three';
import { FONT, MARKER } from '../util.js';
import { BLANK, COLORS, HAND, PRIO, TB, dropAt, dueText, headerRect, layout, newId } from '../world/task-board.js';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const CMD = IS_MAC ? '⌘' : 'Ctrl+';
const CSS = `
  .of-kbui { display: none; }
  .of-kb { position: absolute; pointer-events: auto; touch-action: none; user-select: none; }
  .of-kanban .of-kb { display: block; }
  .of-kanban .of-legend, .of-kanban .of-start, .of-kanban .of-map, .of-kanban .of-count, .of-kanban .of-time, .of-kanban .of-target { display: none; }
  .of-kb .card { position: absolute; cursor: grab; border-radius: 2px; }
  .of-kb .card:hover { box-shadow: 0 0 0 2px rgba(57,135,229,.9), 0 0 18px rgba(57,135,229,.35); }
  .of-kb.dragging, .of-kb.dragging * { cursor: grabbing !important; }
  .of-kb.dragging .card:hover { box-shadow: none; }
  .of-kb .hdr { position: absolute; cursor: text; border-radius: 2px; }
  .of-kb .hdr:hover { box-shadow: 0 0 0 2px rgba(255,255,255,.7); }
  .of-kb .hdr .tools { position: absolute; right: 0; bottom: 100%; padding-bottom: 3px; display: none; gap: 3px; }
  .of-kb .hdr:hover .tools, .of-kb .hdr .tools.armed { display: flex; }
  .of-kb button { font: 600 12px ${FONT}; color: #fff; background: rgba(15,16,19,.82); border: 1px solid rgba(255,255,255,.2); border-radius: 6px; padding: 2px 7px; cursor: pointer; }
  .of-kb button:hover { background: #3987e5; border-color: #3987e5; }
  .of-kb .tools button.armed { background: #c0392b; border-color: #c0392b; }
  .of-kb .add { position: absolute; transform: translate(-50%, -50%); width: 26px; height: 26px; padding: 0; border-radius: 50%; font-size: 16px; line-height: 1; opacity: .75; }
  .of-kb .add:hover { opacity: 1; }
  .of-kb .hdr input { width: 100%; height: 100%; box-sizing: border-box; font: 400 22px ${MARKER}; text-align: center; text-transform: uppercase; color: #1b1d22; background: #fffdf6; border: 2px solid #3987e5; border-radius: 2px; outline: none; }
  .of-kb .more { position: absolute; transform: translate(-50%, -50%); cursor: pointer; border-radius: 2px; }
  .of-kb .more:hover { box-shadow: 0 0 0 2px rgba(57,135,229,.9); }
  .of-kbhint { position: absolute; left: 50%; top: 16px; transform: translateX(-50%); background: rgba(15,16,19,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 7px 11px; color: #c3c2b7; font-size: 12px; white-space: nowrap; }
  .of-kbhint b { color: #fff; }
  .of-kbhint kbd, .of-kbbar kbd, .of-kbundo kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
  .of-kanban .of-kbhint { display: block; }
  .of-kbbar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); width: max-content; max-width: calc(100% - 32px); flex-wrap: wrap; justify-content: center; align-items: center; gap: 5px; background: rgba(15,16,19,.86); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 6px 8px; pointer-events: auto; }
  .of-kanban .of-kbbar { display: flex; }
  .of-kbbar button, .of-kblist button, .of-kbundo button { font: inherit; font-size: 13px; color: #e8e6df; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 7px; padding: 4px 9px; cursor: pointer; white-space: nowrap; }
  .of-kbbar button:hover, .of-kblist button:hover, .of-kbundo button:hover { color: #fff; background: rgba(255,255,255,.14); }
  .of-kbbar button:disabled { opacity: .4; cursor: default; }
  .of-kbbar i { width: 1px; height: 20px; background: rgba(255,255,255,.15); margin: 0 3px; }
  .of-kbundo { position: absolute; left: 50%; top: 58px; transform: translateX(-50%); align-items: center; gap: 10px; background: rgba(15,16,19,.9); border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 6px 8px 6px 12px; color: #e8e6df; font-size: 13px; pointer-events: auto; max-width: min(520px, calc(100% - 32px)); }
  .of-kbundo span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .of-kanban .of-kbundo.on { display: flex; }
  .of-kbcard { position: absolute; right: 24px; top: 50%; transform: translateY(-50%) rotate(.3deg); width: min(560px, calc(100% - 48px)); max-height: calc(100% - 130px); overflow: auto; box-sizing: border-box;
    flex-direction: column; gap: 10px; color: #1f2b4d; background: #fbf9f1; border-radius: 3px; box-shadow: 0 22px 60px rgba(0,0,0,.6); padding: 18px 20px 14px; pointer-events: auto; font: 13px ${FONT}; }
  .of-kbcard.left { left: 24px; right: auto; transform: translateY(-50%) rotate(-.3deg); }
  .of-kanban .of-kbcard.on { display: flex; }
  .of-kbcard .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
  .of-kbcard input[name=title] { font: 400 28px ${MARKER}; color: inherit; background: transparent; border: none; border-bottom: 2px solid rgba(214,92,92,.6); padding: 2px 0 4px; outline: none; }
  .of-kbcard textarea { font: 400 17px/24px ${HAND}; color: #2b3550; background: repeating-linear-gradient(transparent 0 23px, rgba(110,160,210,.5) 23px 24px); background-attachment: local; border: none; padding: 0; resize: vertical; min-height: 168px; outline: none; }
  .of-kbcard label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #5b6070; }
  .of-kbcard label.wide { flex: 1; min-width: 160px; }
  .of-kbcard select, .of-kbcard .row input { font: 13px ${FONT}; color: #1d2230; background: rgba(255,255,255,.75); border: 1px solid rgba(0,0,0,.18); border-radius: 6px; padding: 4px 6px; }
  .of-kbcard button { font: 13px ${FONT}; color: #1d2230; background: rgba(255,255,255,.6); border: 1px solid rgba(0,0,0,.18); border-radius: 7px; padding: 5px 11px; cursor: pointer; }
  .of-kbcard button:hover { background: #fff; }
  .of-kbcard button.pri { background: #3987e5; border-color: #3987e5; color: #fff; }
  .of-kbcard button[aria-pressed="true"] { background: #1f2b4d; border-color: #1f2b4d; color: #fff; }
  .of-kbcard button.sw { width: 22px; height: 22px; padding: 0; border-radius: 3px; }
  .of-kbcard button.sw[aria-pressed="true"] { box-shadow: 0 0 0 2px #fbf9f1, 0 0 0 4px #1f2b4d; }
  .of-kbcard button.del:hover { background: #c0392b; border-color: #c0392b; color: #fff; }
  .of-kbcard kbd { font: inherit; font-size: 11px; opacity: .7; }
  .of-kbcard .sp { flex: 1; }
  .of-kbcard .meta { color: #8a8d96; font-size: 11px; }
  .of-kblist { position: absolute; right: 16px; top: 16px; bottom: 112px; width: min(420px, calc(100% - 32px)); flex-direction: column; background: rgba(15,16,19,.9); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; pointer-events: auto; overflow: hidden; color: #e8e6df; }
  .of-kanban .of-kblist.on { display: flex; }
  .of-kblist .hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.1); }
  .of-kblist .hd b { flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .of-kblist .ls { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
  .of-kblist .it { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,.04); }
  .of-kblist .it:hover { background: rgba(255,255,255,.09); }
  .of-kblist .it i { width: 12px; height: 12px; border-radius: 2px; flex: none; }
  .of-kblist .it div { flex: 1; min-width: 0; cursor: pointer; }
  .of-kblist .it b, .of-kblist .it small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .of-kblist .it b { font-weight: 600; font-size: 13px; }
  .of-kblist .it small { color: #8b8a85; font-size: 11px; }
  .of-kblist .none { color: #8b8a85; text-align: center; padding: 20px; }
`;
const HTML = `<div class="of-kbui of-kb"></div>
  <div class="of-kbui of-kbhint">Your <b>task board</b> · drag cards between columns · click one to open it · double-click a heading to rename it · <kbd>N</kbd> new card <kbd>S</kbd> sticky · <kbd>${CMD}Z</kbd> undo · <kbd>Esc</kbd> back to walking</div>
  <div class="of-kbui of-kbbar"><button data-a="index" title="New index card (N)">+ Index card</button><button data-a="sticky" title="New sticky note (S)">+ Sticky note</button><button data-a="col" title="Add a column on the right">+ Column</button><i></i>
    <button data-a="archive" title="Take everything in the last column off the board (it's kept: see Archived)">Archive done</button><button data-a="archived">Archived</button><i></i>
    <button data-a="undo" title="Undo (${CMD}Z)">↶ Undo</button><button data-a="leave">Done <kbd>Esc</kbd></button></div>
  <div class="of-kbui of-kbundo"><span></span><button>Undo</button></div>
  <div class="of-kbui of-kblist"><div class="hd"><b></b><button data-a="close">Close <kbd>Esc</kbd></button></div><div class="ls"></div></div>
  <form class="of-kbui of-kbcard" autocomplete="off">
    <div class="row"><button type="button" data-kind="index">Index card</button><button type="button" data-kind="sticky">Sticky note</button><span class="sp"></span>
      ${Object.entries(COLORS).map(([k, c]) => `<button type="button" class="sw" data-color="${k}" style="background:${c}" title="${k[0].toUpperCase() + k.slice(1)}"></button>`).join('')}</div>
    <input name="title" maxlength="200" placeholder="Title" spellcheck="true">
    <textarea name="body" maxlength="10000" rows="8" placeholder="Details: as much as you like" spellcheck="true"></textarea>
    <div class="row"><label>Column <select name="col"></select></label>
      <label>Priority <select name="prio">${PRIO.map((p, i) => `<option value="${i}">${p}</option>`).join('')}</select></label>
      <label>Due <input name="due" type="date"></label><label>Who <input name="who" maxlength="3" size="4" placeholder="Initials"></label></div>
    <div class="row"><label class="wide">Labels <input name="labels" maxlength="200" placeholder="comma, separated"></label></div>
    <div class="row"><button type="button" class="del" data-a="delete">Delete</button><button type="button" data-a="archive">Archive</button><span class="meta"></span><span class="sp"></span>
      <button type="button" data-a="cancel">Cancel <kbd>Esc</kbd></button><button class="pri">Save <kbd>${CMD}↵</kbd></button></div>
  </form>`;

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function installUse(ctx) {
  const { hud, keys, camera, tween, camPose, player, renderer, gl, taskBoard } = ctx;
  const { tb, send, mesh } = taskBoard;
  const style = document.createElement('style'); style.textContent = CSS; hud.append(style);
  hud.insertAdjacentHTML('beforeend', HTML);
  const $ = (s) => /** @type {HTMLElement} */ (hud.querySelector(s));
  const kb = $('.of-kb'), bar = $('.of-kbbar'), undoEl = $('.of-kbundo'), list = $('.of-kblist'), form = /** @type {HTMLFormElement} */ ($('.of-kbcard'));
  const F = /** @type {any} */ (form.elements);
  const S = { on: false, ed: null, undos: [], start: null, base: null, rename: null, hot: null, listCol: undefined, lay: null, undoT: 0 };
  const v = new THREE.Vector3();

  // ----- walking up to it and away -----
  function useTaskBoard() {
    if (!ctx.active || ctx.mode !== 'free' || !tb.board) return;
    if (document.pointerLockElement) document.exitPointerLock();
    ctx.mode = 'board'; keys.clear(); S.on = true;
    hud.classList.add('of-kanban');
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), w = TB.w + 0.2, h = TB.h + 0.4;
    const d = Math.max(h / 2 / half / 0.8, w / 2 / (half * camera.aspect) / 0.94);
    tween(camPose(), { x: TB.x, y: TB.y - 0.06, z: TB.z + d, yaw: 0, pitch: 0 }, 700);
    rebuild();
  }
  function leaveTaskBoard(relock) {
    if (!S.on) return;
    closeCard(); closeList(); endDrag(); S.on = false; S.rename = null;
    hud.classList.remove('of-kanban');
    if (ctx.mode !== 'board') return;
    tween(camPose(), { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch }, 600,
      () => { if (ctx.mode === 'board') ctx.mode = 'free'; });
    if (relock) renderer.domElement.requestPointerLock();
  }
  // Leaving a board (Esc, hiding the office) leaves this one too: main.js reads leaveBoard after this.
  const leaveBoard = ctx.leaveBoard;
  ctx.leaveBoard = (relock) => { leaveTaskBoard(relock); leaveBoard(relock); };

  // ----- the layer over the board -----
  // Follows the board on screen each frame; what's in it is rebuilt whenever the board is repainted.
  const pct = (n, of) => `${(n / of) * 100}%`;
  function place() {
    const r = gl.getBoundingClientRect(), hr = hud.getBoundingClientRect();
    mesh.updateWorldMatrix(true, false);
    const a = mesh.localToWorld(v.set(-TB.w / 2, TB.h / 2, 0)).project(camera), ax = (a.x + 1) / 2 * r.width, ay = (1 - a.y) / 2 * r.height;
    const b = mesh.localToWorld(v.set(TB.w / 2, -TB.h / 2, 0)).project(camera), bx = (b.x + 1) / 2 * r.width, by = (1 - b.y) / 2 * r.height;
    Object.assign(kb.style, { left: `${r.left - hr.left + ax}px`, top: `${r.top - hr.top + ay}px`, width: `${bx - ax}px`, height: `${by - ay}px` });
  }
  function rebuild() {
    S.lay = tb.lay;
    if (!S.on || !tb.lay || tb.view.drag) return;
    const lay = tb.lay, els = [];
    lay.cols.forEach((col, i) => {
      const r = headerRect(col), h = div('hdr', r.x, r.y, r.w, r.h);
      h.dataset.col = col.id; h.title = 'Double-click to rename';
      if (S.rename === col.id) {
        const inp = document.createElement('input');
        inp.value = col.name; inp.maxLength = 40; inp.spellcheck = false;
        inp.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); renameCol(col.id, inp.value); }
          if (e.key === 'Escape') { e.preventDefault(); S.rename = null; rebuild(); }
        });
        inp.addEventListener('blur', () => { if (S.rename === col.id) renameCol(col.id, inp.value); });
        h.append(inp); setTimeout(() => { inp.focus(); inp.select(); });
      } else {
        const tools = document.createElement('div'); tools.className = 'tools';
        tools.append(btn('◀', 'Move left', 'left', i === 0), btn('▶', 'Move right', 'right', i === lay.cols.length - 1),
          btn('✕', col.n ? `Delete (its ${col.n} card${col.n === 1 ? '' : 's'} go to ${lay.cols[i ? 0 : 1]?.name || 'the first column'})` : 'Delete this column', 'del', lay.cols.length < 2));
        h.append(tools);
      }
      els.push(h);
      const add = document.createElement('button');
      add.className = 'add'; add.textContent = '+'; add.title = `New card in ${col.name}`; add.dataset.add = col.id;
      Object.assign(add.style, { left: pct(r.x + r.w + 20, TB.W), top: pct(r.y + r.h / 2, TB.H) });
      els.push(add);
    });
    for (const k of lay.cards) {
      if (k.c.ghost) continue;
      const el = div('card', k.x, k.y, k.w, k.h);
      el.dataset.id = k.c.id; el.style.transform = `rotate(${k.rot}rad)`;
      els.push(el);
    }
    for (const m of lay.more) {
      const el = div('more', m.x, m.y, 160, 36);
      el.style.transform = 'translate(-50%, -50%) rotate(-0.03rad)'; el.style.left = pct(m.x, TB.W); el.style.top = pct(m.y, TB.H);
      el.dataset.more = m.col; el.title = 'Show them all';
      els.push(el);
    }
    kb.replaceChildren(...els);
  }
  function div(cls, x, y, w, h) {
    const el = document.createElement('div');
    el.className = cls;
    Object.assign(el.style, { left: pct(x, TB.W), top: pct(y, TB.H), width: pct(w, TB.W), height: pct(h, TB.H) });
    return el;
  }
  function btn(text, title, act, disabled) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text; b.title = title; b.dataset.tool = act; b.disabled = !!disabled;
    if (disabled) b.style.display = 'none';
    return b;
  }
  ctx.onFrame(() => {
    if (!S.on) return;
    place();
    if (tb.lay !== S.lay) rebuild();
  }, 132);

  // ----- pointing, clicking and dragging -----
  const at = (e) => { const r = kb.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * TB.W, y: (e.clientY - r.top) / r.height * TB.H }; };
  kb.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || ctx.anim || S.ed) return;
    const card = /** @type {HTMLElement} */ (e.target).closest?.('.card');
    if (!card) return;
    e.preventDefault();
    S.start = { id: card.dataset.id, p: at(e), sx: e.clientX, sy: e.clientY, pointer: e.pointerId };
    kb.setPointerCapture(e.pointerId);
  });
  kb.addEventListener('pointermove', (e) => {
    const s = S.start;
    if (!s) return;
    const p = at(e);
    if (!tb.view.drag) {
      if (Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < 6) return;
      const c = tb.board.cards.find((x) => x.id === s.id);
      if (!c) { S.start = null; return; }
      // Where everything else sits without it: drops are worked out against that.
      S.base = layout(tb.board, { drag: { id: c.id } });
      const from = tb.board.cards.filter((x) => x.col === c.col && !x.archived && x.id !== c.id);
      s.from = { col: c.col, at: tb.board.cards.filter((x) => x.col === c.col && !x.archived).indexOf(c) };
      s.from.at = Math.min(s.from.at, from.length);
      tb.view.drag = { id: c.id, card: c, col: c.col, at: s.from.at };
      kb.classList.add('dragging');
    }
    const d = tb.view.drag, to = dropAt(S.base, p.x, p.y);
    Object.assign(d, { x: p.x, y: p.y }, to || {});
    tb.dirty = true;
  });
  kb.addEventListener('pointerup', (e) => {
    const s = S.start;
    S.start = null;
    if (!s) return;
    const d = tb.view.drag;
    if (!d) { const c = tb.board.cards.find((x) => x.id === s.id); if (c) openCard(c); return; }
    endDrag();
    if (d.col === s.from.col && d.at === s.from.at) return;
    const c = d.card, colName = nameOf(d.col);
    act([{ op: 'move', id: c.id, col: d.col, at: d.at }], [{ op: 'move', id: c.id, col: s.from.col, at: s.from.at }],
      d.col !== s.from.col ? `Moved “${c.title || 'Untitled'}” to ${colName}` : null);
  });
  kb.addEventListener('pointercancel', () => { S.start = null; endDrag(); });
  function endDrag() {
    if (!tb.view.drag) return;
    tb.view.drag = null; S.base = null; kb.classList.remove('dragging'); tb.dirty = true;
  }
  kb.addEventListener('pointerover', (e) => { S.hot = /** @type {HTMLElement} */ (e.target).closest?.('.card')?.dataset.id || null; });
  kb.addEventListener('pointerleave', () => { S.hot = null; });
  kb.addEventListener('dblclick', (e) => {
    const h = /** @type {HTMLElement} */ (e.target).closest?.('.hdr');
    if (h && !S.rename) { S.rename = h.dataset.col; rebuild(); }
  });
  kb.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target), b = tb.board;
    const add = t.closest?.('[data-add]'), more = t.closest?.('[data-more]'), tool = t.closest?.('[data-tool]');
    if (add) newCard('index', add.dataset.add);
    else if (more) openList(more.dataset.more);
    else if (tool) {
      const id = tool.closest('.hdr').dataset.col, cols = b.columns.map((k) => ({ ...k })), i = cols.findIndex((k) => k.id === id);
      const a = tool.dataset.tool;
      if (a === 'left' || a === 'right') {
        const j = a === 'left' ? i - 1 : i + 1;
        [cols[i], cols[j]] = [cols[j], cols[i]];
        act([{ op: 'columns', columns: cols }], [{ op: 'columns', columns: b.columns }]);
      } else if (a === 'del') {
        const cards = b.cards.filter((c) => c.col === id);
        if (cards.length && !tool.classList.contains('armed')) {   // a column with cards in it: a second click to be sure
          tool.classList.add('armed'); tool.textContent = 'Delete?'; tool.parentElement.classList.add('armed');
          return;
        }
        cols.splice(i, 1);
        act([{ op: 'columns', columns: cols }], [{ op: 'columns', columns: b.columns }, ...cards.map((c) => ({ op: 'move', id: c.id, col: id }))],
          `Deleted the ${b.columns[i].name} column`);
      }
    }
  });
  function renameCol(id, name) {
    S.rename = null;
    name = name.replace(/\s+/g, ' ').trim().slice(0, 40);
    const b = tb.board, col = b.columns.find((k) => k.id === id);
    if (col && name && name !== col.name) act([{ op: 'columns', columns: b.columns.map((k) => k.id === id ? { ...k, name } : k) }], [{ op: 'columns', columns: b.columns }]);
    else rebuild();
  }

  // ----- changes, and undoing them -----
  // ops now; undo puts it back. `said` shows an Undo button for a moment (deleting, archiving, moving to another column).
  function act(ops, undo, said) {
    send(ops);
    S.undos.push({ undo, said });
    if (S.undos.length > 50) S.undos.shift();
    if (said) {
      undoEl.querySelector('span').textContent = said;
      undoEl.classList.add('on'); clearTimeout(S.undoT); S.undoT = setTimeout(() => undoEl.classList.remove('on'), 8000);
    }
    syncBar();
  }
  function undo() {
    const u = S.undos.pop();
    undoEl.classList.remove('on');
    if (u) { send(u.undo); ctx.toast(`Undone${u.said ? ': ' + u.said.replace(/[&<>"']/g, '') : ''}`); }
    syncBar();
  }
  undoEl.querySelector('button').addEventListener('click', undo);
  function syncBar() {
    const b = tb.board;
    /** @type {HTMLButtonElement} */ (bar.querySelector('[data-a=undo]')).disabled = !S.undos.length;
    const n = b ? b.cards.filter((c) => c.archived).length : 0;
    bar.querySelector('[data-a=archived]').textContent = `Archived${n ? ` (${n})` : ''}`;
    const last = b?.columns[b.columns.length - 1];
    const done = last ? b.cards.filter((c) => c.col === last.id && !c.archived).length : 0;
    const ab = /** @type {HTMLButtonElement} */ (bar.querySelector('[data-a=archive]'));
    ab.disabled = !done; ab.textContent = last ? `Archive ${last.name.length > 16 ? 'done' : last.name.toLowerCase()}${done ? ` (${done})` : ''}` : 'Archive done';
  }
  tb.listeners.add(() => { syncBar(); if (list.classList.contains('on')) openList(S.listCol); });
  syncBar();
  const nameOf = (id) => tb.board.columns.find((k) => k.id === id)?.name || 'the board';
  bar.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!el) return;
    const a = el.dataset.a, b = tb.board;
    if (a === 'index' || a === 'sticky') newCard(a, b.columns[0].id);
    if (a === 'col') {
      if (b.columns.length >= 12) { ctx.toast('That’s as many columns as the board will take (12)'); return; }
      const id = newId();
      S.rename = id;
      act([{ op: 'columns', columns: [...b.columns, { id, name: 'New column' }] }], [{ op: 'columns', columns: b.columns }]);
    }
    if (a === 'archive') {
      const last = b.columns[b.columns.length - 1], cards = b.cards.filter((c) => c.col === last.id && !c.archived).slice(0, 100);
      if (cards.length) act(cards.map((c) => ({ op: 'archive', id: c.id })), cards.map((c) => ({ op: 'archive', id: c.id, archived: false })),
        `Archived ${cards.length} card${cards.length === 1 ? '' : 's'} from ${last.name}`);
    }
    if (a === 'archived') openList(null);
    if (a === 'undo') undo();
    if (a === 'leave') leaveTaskBoard(true);
    el.blur();
  });

  // ----- a card, open -----
  // The board shows it as you type (the draft); Save sends what changed, Cancel or Esc drops it.
  function newCard(kind, col) { openCard({ ...BLANK, id: newId(), col, kind, color: kind === 'sticky' ? 'yellow' : 'white' }, true); }
  function openCard(c, isNew = false) {
    closeList();
    S.ed = { orig: c, isNew };
    const b = tb.board, sel = F.col;
    sel.replaceChildren(...b.columns.map((k) => { const o = document.createElement('option'); o.value = k.id; o.textContent = k.name; return o; }));
    F.title.value = c.title; F.body.value = c.body; sel.value = c.col; F.prio.value = String(c.prio || 0); F.due.value = c.due || '';
    F.who.value = c.who || ''; F.labels.value = (c.labels || []).join(', ');
    S.ed.kind = c.kind; S.ed.color = c.color;
    const ci = b.columns.findIndex((k) => k.id === c.col);
    form.classList.toggle('left', ci >= b.columns.length / 2);
    form.querySelector('[data-a=delete]').toggleAttribute('hidden', isNew);
    form.querySelector('[data-a=archive]').toggleAttribute('hidden', isNew);
    const when = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    form.querySelector('.meta').textContent = isNew ? '' : `Added ${when(c.created)}${c.updated - c.created > 60e3 ? ` · changed ${when(c.updated)}` : ''}`;
    form.classList.add('on');
    draft();
    setTimeout(() => (isNew || !c.title ? F.title : F.body).focus());
  }
  function fieldsNow() {
    return { title: F.title.value.replace(/\s+/g, ' ').trim().slice(0, 200), body: F.body.value, kind: S.ed.kind, color: S.ed.color, prio: +F.prio.value,
      due: F.due.value || '', who: F.who.value.trim().toUpperCase().slice(0, 3), labels: [...new Set(F.labels.value.split(',').map((l) => l.trim().slice(0, 24)).filter(Boolean))].slice(0, 8) };
  }
  function draft() {
    if (!S.ed) return;
    const f = fieldsNow();
    for (const el of form.querySelectorAll('[data-kind]')) el.setAttribute('aria-pressed', String(el.dataset.kind === f.kind));
    for (const el of form.querySelectorAll('[data-color]')) el.setAttribute('aria-pressed', String(el.dataset.color === f.color));
    form.style.background = f.kind === 'sticky' ? COLORS[f.color] : '';
    tb.view.draft = { ...S.ed.orig, ...f, col: F.col.value };
    tb.dirty = true;
  }
  form.addEventListener('input', draft);
  form.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!el || !S.ed) return;
    if (el.dataset.kind) {   // the other kind's usual colour comes along with it
      if (S.ed.color === (S.ed.kind === 'sticky' ? 'yellow' : 'white')) S.ed.color = el.dataset.kind === 'sticky' ? 'yellow' : 'white';
      S.ed.kind = el.dataset.kind; draft();
    }
    if (el.dataset.color) { S.ed.color = el.dataset.color; draft(); }
    const c = S.ed.orig, b = tb.board;
    if (el.dataset.a === 'cancel') closeCard();
    if (el.dataset.a === 'delete') {
      const at = b.cards.filter((x) => x.col === c.col && !x.archived).indexOf(c);
      closeCard();
      act([{ op: 'delete', id: c.id }], [{ op: 'add', card: c, col: c.col, at: at < 0 ? undefined : at }], `Deleted “${c.title || 'Untitled'}”`);
    }
    if (el.dataset.a === 'archive') { closeCard(); act([{ op: 'archive', id: c.id }], [{ op: 'archive', id: c.id, archived: false }], `Archived “${c.title || 'Untitled'}”`); }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); saveCard(); });
  form.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closeCard(); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target !== F.body)) { e.preventDefault(); saveCard(); }
  });
  function saveCard() {
    const ed = S.ed;
    if (!ed) return;
    const f = fieldsNow(), c = ed.orig, col = F.col.value, b = tb.board;
    closeCard();
    if (ed.isNew) {
      if (!f.title && !f.body.trim()) return;
      act([{ op: 'add', card: { ...c, ...f }, col }], [{ op: 'delete', id: c.id }]);
      return;
    }
    if (!b.cards.some((x) => x.id === c.id)) { ctx.toast('That card’s gone: someone else took it off the board'); return; }
    const set = {}, back = {};
    for (const k of Object.keys(f)) if (JSON.stringify(f[k]) !== JSON.stringify(c[k])) { set[k] = f[k]; back[k] = c[k]; }
    const ops = [], undoOps = [];
    if (Object.keys(set).length) { ops.push({ op: 'edit', id: c.id, set }); undoOps.push({ op: 'edit', id: c.id, set: back }); }
    if (col !== c.col) {
      const at = b.cards.filter((x) => x.col === c.col && !x.archived).indexOf(c);
      ops.push({ op: 'move', id: c.id, col }); undoOps.unshift({ op: 'move', id: c.id, col: c.col, at });
    }
    if (ops.length) act(ops, undoOps.reverse());
  }
  function closeCard() {
    if (!S.ed) return;
    S.ed = null; tb.view.draft = null; tb.dirty = true;
    form.classList.remove('on');
    /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
  }

  // ----- lists: a column's cards (when there are more than fit), or the archive -----
  function openList(col) {
    S.listCol = col;
    const b = tb.board, cards = b.cards.filter((c) => (col ? c.col === col && !c.archived : c.archived));
    list.querySelector('.hd b').textContent = col ? `${nameOf(col)} (${cards.length})` : `Archived (${cards.length})`;
    const rows = cards.slice().reverse().slice(0, 300).map((c) => {
      const it = document.createElement('div'), sw = document.createElement('i'), t = document.createElement('div'), b1 = document.createElement('b'), sm = document.createElement('small');
      it.className = 'it'; sw.style.background = COLORS[c.color] || COLORS.white;
      b1.textContent = c.title || 'Untitled';
      sm.textContent = [col ? '' : nameOf(c.col), c.due ? `due ${dueText(c.due)}` : '', c.body.split('\n')[0].slice(0, 80)].filter(Boolean).join(' · ');
      t.append(b1, sm); t.title = 'Open it';
      t.addEventListener('click', () => openCard(c));
      it.append(sw, t);
      if (!col) {
        const r = document.createElement('button'), d = document.createElement('button');
        r.textContent = 'Restore'; r.title = `Back on the board, in ${nameOf(c.col)}`;
        r.addEventListener('click', () => act([{ op: 'move', id: c.id, col: c.col }], [{ op: 'archive', id: c.id }]));
        d.textContent = 'Delete';
        d.addEventListener('click', () => act([{ op: 'delete', id: c.id }], [{ op: 'add', card: c, col: c.col }], `Deleted “${c.title || 'Untitled'}”`));
        it.append(r, d);
      }
      return it;
    });
    if (!rows.length) { const n = document.createElement('div'); n.className = 'none'; n.textContent = col ? 'Nothing here' : 'Nothing archived yet'; rows.push(n); }
    list.querySelector('.ls').replaceChildren(...rows);
    list.classList.add('on');
  }
  function closeList() { list.classList.remove('on'); S.listCol = undefined; }
  list.querySelector('[data-a=close]').addEventListener('click', closeList);

  // ----- keys -----
  document.addEventListener('keydown', (e) => {
    if (!S.on || ctx.mode !== 'board' || e.target.closest?.('input, select, textarea, #drawer')) return;
    const cmd = e.metaKey || e.ctrlKey;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (list.classList.contains('on')) closeList(); else leaveTaskBoard();
      return;
    }
    if (cmd && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (cmd || e.altKey || S.ed || tb.view.drag) return;
    const hot = S.hot && tb.board.cards.find((c) => c.id === S.hot);
    if (e.code === 'KeyN' || e.code === 'KeyS') newCard(e.code === 'KeyS' ? 'sticky' : 'index', tb.board.columns[0].id);
    else if (hot && (e.code === 'Enter' || e.code === 'Space')) openCard(hot);
    else if (hot && (e.code === 'Delete' || e.code === 'Backspace')) {
      const at = tb.board.cards.filter((x) => x.col === hot.col && !x.archived).indexOf(hot);
      act([{ op: 'delete', id: hot.id }], [{ op: 'add', card: hot, col: hot.col, at }], `Deleted “${hot.title || 'Untitled'}”`);
    } else return;
    e.preventDefault();
  });

  Object.assign(ctx, { useTaskBoard, leaveTaskBoard });
  Object.assign(taskBoard, { use: useTaskBoard, leave: leaveTaskBoard, openCard, newCard, S });
}
