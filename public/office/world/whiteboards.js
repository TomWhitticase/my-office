// Whiteboards: every one can be drawn on (installDrawing). What's on a board is a transparent ink layer over it (plain,
// or the breakroom's live shipped list), saved per board to localStorage; a board's printed sketch starts out as ink, so it
// can be erased, and Reset puts it back.

import * as THREE from 'three';
import { box, makeScreen, MARKER, WB_COLORS } from '../util.js';
import { drawBoard } from '../painters.js';

export function install(ctx) {
  const { world, plant } = ctx;
  Object.assign(ctx, { markerBoard, inkDefault, paintBoard });
  // ----- whiteboards -----
  // Every whiteboard can be drawn on (see useBoard). What's on one is a transparent ink layer over the board (plain, or the
  // breakroom's live shipped list), saved per board to localStorage. A board's printed sketch starts out as ink, so it can be
  // erased, and Reset puts it back.
  const boards = [], WB_BG = '#f7f7f4';
  function whiteboard(scr, id, name, draw, live = false) {
    const ink = document.createElement('canvas');
    ink.width = scr.W; ink.height = scr.H;
    const b = { id, name, scr, draw, live, list: live && localStorage[`officeBoardList:${id}`] !== 'off', ink, ictx: ink.getContext('2d'), undo: [], redo: [], dirty: true,
      w: scr.mesh.geometry.parameters.width, h: scr.mesh.geometry.parameters.height };
    scr.mesh.material = new THREE.MeshStandardMaterial({ map: scr.tex, roughness: 0.6 });
    scr.mesh.userData = { action: 'board', board: b, reach: 5 };
    const saved = localStorage[`officeBoard:${id}`];
    if (saved) { const img = new Image(); img.onload = () => { b.ictx.drawImage(img, 0, 0); b.dirty = true; }; img.src = saved; }
    else inkDefault(b);
    boards.push(b);
    return b;
  }
  function inkDefault(b) {
    const c = b.ictx;
    c.clearRect(0, 0, b.ink.width, b.ink.height);
    if (!b.draw) return;
    c.save(); c.lineCap = c.lineJoin = 'round'; c.lineWidth = 5; b.draw(c, b.ink.width, b.ink.height); c.restore();
  }
  function paintBoard(b) {
    const { ctx: c, W, H } = b.scr;
    if (b.live && b.list && ctx.state) drawBoard(b.scr, ctx.state); else { c.fillStyle = WB_BG; c.fillRect(0, 0, W, H); }
    c.drawImage(b.ink, 0, 0);
    b.scr.tex.needsUpdate = true; b.dirty = false;
  }
  function markerBoard(id, name, scr, draw) { return whiteboard(scr, id, name, draw); }
  // Breakroom whiteboard: today's shipped list, drawn over.
  const board = makeScreen(world, 2.4, 1.3, 1024, 560, -19.86, 1.6, 4.6);
  board.mesh.rotation.y = Math.PI / 2;
  const breakBoard = whiteboard(board, 'breakroom', 'breakroom whiteboard', null, true);
  box(world, 0.04, 1.38, 2.48, '#b9bcc0', -19.9, 1.6, 4.6, { shadow: false });
  plant(-2.6, 14.3, 1.1); plant(-19.3, 3.1); plant(-11, 14.3, 0.9);
  Object.assign(ctx, { boards, breakBoard });
}

export function installDrawing(ctx) {
  const { hud, gl, keys, camera, tween, camPose, player, renderer, toast, inkDefault } = ctx;
  Object.assign(ctx, { leaveBoard, useBoard });
  // ----- drawing on a whiteboard -----
  // Clicking a board frames it square-on and frees the mouse (or pen): the pointer draws through the board's UVs into its ink
  // layer, which is saved to localStorage shortly after each change. Esc (or Done) goes back to walking.
  const wbBar = hud.querySelector('.of-wbbar'), wbIn = hud.querySelector('.of-wbtext'), WB_SIZES = { S: 4, M: 8, L: 15 };
  const wb = { b: null, tool: 'pen', color: WB_COLORS[0], size: 'M', stroke: null, text: null, saveT: 0 };
  const wbRay = new THREE.Raycaster(), wbNdc = new THREE.Vector2(), wbV = new THREE.Vector3(), wbQ = new THREE.Quaternion();
  function useBoard(b) {
    if (!b || !ctx.active || ctx.mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    wb.b = b; ctx.mode = 'board'; keys.clear();
    if (wb.tool === 'text') wb.tool = 'pen';
    hud.classList.add('of-boarding');
    hud.querySelector('.of-wbname').textContent = b.name;
    wbSync();
    const m = b.scr.mesh, c = m.getWorldPosition(new THREE.Vector3()), n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(wbQ));
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), d = Math.max(b.h / 2 / half / 0.72, b.w / 2 / (half * camera.aspect) / 0.84);
    tween(camPose(), { x: c.x + n.x * d, y: c.y, z: c.z + n.z * d, yaw: Math.atan2(n.x, n.z), pitch: 0 }, 700);
  }
  function leaveBoard(relock) {
    if (!wb.b) return;
    wbText(false); wbEnd(); wbSave(true);
    wb.b = null;
    hud.classList.remove('of-boarding');
    gl.style.cursor = '';
    if (ctx.mode !== 'board') return;
    tween(camPose(), { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch }, 600, () => { if (ctx.mode === 'board') ctx.mode = 'free'; });
    if (relock) renderer.domElement.requestPointerLock();   // only works from a click; after Esc, click to look around again
  }
  function wbSync() {
    const b = wb.b;
    if (!b) return;
    for (const el of wbBar.querySelectorAll('button')) {
      const { c, t, s: sz, a } = el.dataset;
      if (c || t || sz) el.setAttribute('aria-pressed', String(c ? c === wb.color && wb.tool !== 'eraser' : t ? t === wb.tool : sz === wb.size));
      if (a === 'undo') el.disabled = !b.undo.length;
      if (a === 'redo') el.disabled = !b.redo.length;
      if (a === 'list') { el.hidden = !b.live; el.setAttribute('aria-pressed', String(b.list)); }
      if (a === 'reset') el.hidden = !b.draw;
    }
    gl.style.cursor = wb.tool === 'text' ? 'text' : wb.tool === 'eraser' ? 'cell' : 'crosshair';
  }
  // Pointer to board canvas pixels, or null off the board.
  function wbAt(e) {
    const r = gl.getBoundingClientRect();
    wbNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    wbRay.setFromCamera(wbNdc, camera);
    const hit = wbRay.intersectObject(wb.b.scr.mesh)[0];
    return hit ? { x: hit.uv.x * wb.b.scr.W, y: (1 - hit.uv.y) * wb.b.scr.H } : null;
  }
  const wbK = (b) => b.scr.W / b.w / 430;   // line widths are tuned for ~430 px per metre of board
  function wbPush() {
    const b = wb.b;
    b.undo.push(b.ictx.getImageData(0, 0, b.ink.width, b.ink.height));
    if (b.undo.length > 20) b.undo.shift();
    b.redo.length = 0;
    wbSync();
  }
  function wbLine(a, z, pressure) {
    const b = wb.b, c = b.ictx, er = wb.tool === 'eraser';
    c.save();
    c.globalCompositeOperation = er ? 'destination-out' : 'source-over';
    c.strokeStyle = wb.color; c.lineCap = c.lineJoin = 'round';
    c.lineWidth = WB_SIZES[wb.size] * wbK(b) * (er ? 5 : 1) * (pressure > 0 && pressure !== 0.5 ? 0.5 + pressure : 1);   // pens: pressure; mice report 0.5
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(z.x + 0.01, z.y); c.stroke();
    c.restore();
    b.dirty = true;
  }
  function wbEnd() {
    if (!wb.stroke) return;
    wb.stroke = null;
    wbSave();
  }
  function wbSave(now) {
    clearTimeout(wb.saveT);
    const b = wb.b;
    if (!b) return;
    const save = () => {
      try { localStorage[`officeBoard:${b.id}`] = b.ink.toDataURL('image/png'); }
      catch { toast("Couldn't save the whiteboard: browser storage is full"); }
    };
    if (now) save(); else wb.saveT = setTimeout(save, 400);
  }
  function wbHistory(from, to) {
    const b = wb.b;
    if (!b || !from.length) return;
    to.push(b.ictx.getImageData(0, 0, b.ink.width, b.ink.height));
    b.ictx.putImageData(from.pop(), 0, 0);
    b.dirty = true; wbSave(); wbSync();
  }
  // Text: an input floats where you clicked, at the size it'll be on the board; Enter (or clicking elsewhere) writes it.
  function wbText(open, e, at) {
    if (wb.text) {
      const t = wb.text, v = wbIn.value.trim();
      wb.text = null; wbIn.style.display = 'none';
      if (v && t.b === wb.b) {
        wbPush();
        const c = t.b.ictx;
        c.font = `400 ${t.px}px ${MARKER}`; c.fillStyle = t.color; c.fillText(v, t.x, t.y);
        t.b.dirty = true; wbSave();
      }
    }
    if (!open) return;
    const b = wb.b, px = (18 + WB_SIZES[wb.size] * 3) * wbK(b) * 1.4;
    // Board pixels to screen pixels, from the board's projected height.
    const m = b.scr.mesh, r = gl.getBoundingClientRect(), hr = hud.getBoundingClientRect();
    const top = m.localToWorld(wbV.set(0, b.h / 2, 0)).project(camera).y, bot = m.localToWorld(wbV.set(0, -b.h / 2, 0)).project(camera).y;
    const scale = ((top - bot) / 2 * r.height) / b.scr.H, fs = px * scale;
    wb.text = { b, x: at.x, y: at.y, px, color: wb.color };
    Object.assign(wbIn.style, { display: 'block', left: `${e.clientX - hr.left}px`, top: `${e.clientY - hr.top - fs * 0.95}px`, fontSize: `${fs}px`, color: wb.color });
    wbIn.value = '';
    setTimeout(() => wbIn.focus());
  }
  wbIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); wbText(false); }
    if (e.key === 'Escape') { e.preventDefault(); wbIn.value = ''; wbText(false); }
  });
  wbIn.addEventListener('blur', () => setTimeout(() => { if (wb.text && document.activeElement !== wbIn) wbText(false); }, 0));
  gl.addEventListener('pointerdown', (e) => {
    if (ctx.mode !== 'board' || !wb.b || ctx.anim || e.button !== 0) return;
    const p = wbAt(e);
    if (wb.tool === 'text') { if (p) { e.preventDefault(); wbText(true, e, p); } else wbText(false); return; }
    if (!p) return;
    wbText(false); wbPush();
    wb.stroke = { last: p };
    gl.setPointerCapture(e.pointerId);
    wbLine(p, p, e.pressure);
  });
  gl.addEventListener('pointermove', (e) => {
    if (!wb.stroke || ctx.mode !== 'board') return;
    for (const ev of e.getCoalescedEvents?.() || [e]) {
      const p = wbAt(ev);
      if (p) { wbLine(wb.stroke.last || p, p, ev.pressure); }
      wb.stroke.last = p;   // off the board breaks the line
    }
  });
  gl.addEventListener('pointerup', wbEnd);
  gl.addEventListener('pointercancel', wbEnd);
  wbBar.addEventListener('click', (e) => {
    const el = e.target.closest('button'), b = wb.b;
    if (!el || !b) return;
    const { c, t, s: sz, a } = el.dataset;
    if (c) { wb.color = c; if (wb.tool === 'eraser') wb.tool = 'pen'; }
    if (t) wb.tool = t;
    if (sz) wb.size = sz;
    if (a === 'undo') wbHistory(b.undo, b.redo);
    if (a === 'redo') wbHistory(b.redo, b.undo);
    if (a === 'wipe' || a === 'reset') { wbPush(); a === 'wipe' ? b.ictx.clearRect(0, 0, b.ink.width, b.ink.height) : inkDefault(b); b.dirty = true; wbSave(); }
    if (a === 'list') { b.list = !b.list; localStorage[`officeBoardList:${b.id}`] = b.list ? 'on' : 'off'; b.dirty = true; }
    if (a === 'leave') { leaveBoard(true); return; }
    wbSync();
    el.blur();
  });
  document.addEventListener('keydown', (e) => {
    if (ctx.mode !== 'board' || !wb.b || e.target.closest?.('input, select, textarea, #drawer')) return;
    const cmd = e.metaKey || e.ctrlKey;
    if (e.code === 'Escape') { e.preventDefault(); leaveBoard(); return; }
    if (cmd && (e.code === 'KeyZ' || e.code === 'KeyY')) { e.preventDefault(); e.shiftKey || e.code === 'KeyY' ? wbHistory(wb.b.redo, wb.b.undo) : wbHistory(wb.b.undo, wb.b.redo); return; }
    if (cmd || e.altKey) return;
    const tool = { KeyP: 'pen', KeyB: 'pen', KeyE: 'eraser', KeyT: 'text' }[e.code], n = /^Digit([1-6])$/.exec(e.code);
    if (tool) wb.tool = tool;
    else if (n) { wb.color = WB_COLORS[n[1] - 1]; if (wb.tool === 'eraser') wb.tool = 'pen'; }
    else return;
    e.preventDefault(); wbSync();
  });
  Object.assign(ctx, { wb });
}
