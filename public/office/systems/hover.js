// What you're pointing at: a ray from the crosshair each frame through everything registered with ctx.hoverTargets (or
// the floor's own hits), the hover card for it, and the click actions registered with ctx.action.

import * as THREE from 'three';
import { CAN_CHAT, escapeHtml, titleOf } from '../../chat.js';
import { dash, F } from '../util.js';
import { statusOf } from '../painters.js';

export function install(ctx) {
  const { camera, targetEl, seats, player, tvs, seatTaken, hostOf, laptop, openLaptop, cabinetHover, toggleDrawer, pickUp, tessHover, gatePress,
    readBook, mine, floorName, FLOORS, callLift, pressFloor, srv, openJohn, kitchen, door, useBoard, lifts, hole, doors, desks, boards, blinds,
    world, people } = ctx;
  Object.assign(ctx, { updateHover });
  // ----- hover / inspect -----
  const ray = new THREE.Raycaster();
  ray.far = 14;
  ray.camera = camera;
  let hover = null;
  function updateHover() {
    hover = null;
    if (ctx.locked && ctx.mode === 'free') {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const targets = ctx.away ? [...ctx.away.hits] : ctx.collectTargets([]);
      for (const st of seats) if ((st.floor || 48) === (ctx.away?.n ?? 48) && st.obj !== player.seat?.obj && Math.hypot(st.x - player.x, st.z - player.z) < 4) targets.push(st.obj);
      hover = ctx.away?.pick?.(ray) || null;   // a floor can find what you're looking at itself (inside a repo)
      if (!hover) for (const hit of ray.intersectObjects(targets, true)) {
        const ud = hit.object.userData;
        if (ud.reach && hit.distance > ud.reach) { if (ud.glass || hit.object.material.transparent) continue; break; }
        if (ud.action) { hover = { action: ud.action, door: ud.door, board: ud.board, blind: ud.blind || ud.blindAt?.(hit.point), floor: ud.floorAt?.(hit.uv), key: ud.keyAt?.(hit.uv), drawer: ud.drawerAt?.(hit.point), folder: ud.folderAt?.(hit.instanceId), info: ud.info }; break; }
        if (ud.tv) { hover = { tv: tvs.find((t) => t.id === ud.tv) }; break; }
        if (ud.sessionId) { hover = { sessionId: ud.sessionId, screen: !!ud.screen }; break; }
        if ((ud.seat || ud.seatAt) && hit.distance < 3) { hover = { seat: ud.seat || ud.seatAt(hit.point) }; break; }
        if (hit.object.isMesh && !hit.object.isSprite) break;
      }
    }
    if (!hover) { targetEl.style.display = 'none'; return; }
    targetEl.style.display = 'block';
    const a = hover.action && ctx.actionOf(hover.action);
    if (a?.hover) { targetEl.innerHTML = a.hover(hover); return; }
    if (hover.seat) {
      const taken = seatTaken(hover.seat);
      targetEl.innerHTML = `<b>${hover.seat.name}</b><div class="k">${taken ? 'Someone’s sitting here' : 'Click to sit · move to stand up'}</div>`;
      return;
    }
    if (hover.tv) {
      const c = hover.tv.cfg;
      targetEl.innerHTML = `<b>${escapeHtml(hover.tv.name)} TV</b><div class="m">${c ? escapeHtml(hostOf(c.url)) : 'Off'}</div>
        <div class="k">${c ? 'Click to use it · E (or Shift+click) to set it up' : 'Click to choose what it shows'}</div>`;
      return;
    }
    const s = ctx.state?.live.find((x) => x.sessionId === hover.sessionId);
    if (!s) { targetEl.style.display = 'none'; return; }
    const st = statusOf(s), tr = s.transcript || {};
    const doing = s.status !== 'idle' && tr.pendingTool ? `${tr.pendingTool.name}: ${tr.pendingTool.detail || ''}` : s.status === 'idle' ? `idle for ${F.dur(Date.now() - s.statusSince)}` : 'thinking';
    targetEl.innerHTML = `<b>${escapeHtml(titleOf(s))}</b><div class="m"><span style="color:${st.color}">${st.text}</span> · ${F.usd(s.cost)}${s.statusline?.context ? ` · ${s.statusline.context.used_percentage}% context` : ''}</div>
      <div class="m">${escapeHtml(doing.slice(0, 90))}</div><div class="k">${escapeHtml(s.name)} · ${CAN_CHAT && !hover.screen ? 'click to talk · E for details' : 'click for full details'}</div>`;
  }

  // The click actions: what each does, and what its hover card says.
  const machineHover = (h) => (h.action === 'computer' && !laptop.shown ? '<b>Your computer</b><div class="k">Click to sit down and use it</div>'
    : `<b>Your MacBook</b><div class="k">${laptop.shown ? 'Click to use it' : laptop.open ? 'Waking up…' : 'Click to sit down and open it'}</div>`);
  ctx.action('computer', { hover: machineHover, click: () => { document.exitPointerLock(); dash.setView('desktop'); } });
  ctx.action('laptop', { hover: machineHover, click: () => openLaptop() });
  ctx.action('cabinet', { hover: (h) => cabinetHover(h), click: (h) => toggleDrawer(h.drawer) });
  ctx.action('folder', { hover: (h) => cabinetHover(h), click: (h) => pickUp(h.folder) });
  ctx.action('gatekey', { hover: (h) => tessHover(h), click: (h) => gatePress(h.key) });
  ctx.action('book', { hover: (h) => tessHover(h), click: (h) => readBook(h.book) });
  const liftHover = (h) => {
    const L = mine.L, f = h.floor;
    return h.action === 'liftpanel' ? `<b>${floorName(f)} · ${FLOORS.find((F) => F.n === f)?.title}</b><div class="k">${!L || L.state === 'travel' ? '' : f === Math.round(L.floor) ? 'You’re here · click to open the doors' : mine.goal === f ? 'On its way' : 'Click to go'}</div>`
      : `<b>Lift</b><div class="k">${mine.call ? 'Called · waiting for a free car' : L && (L.state === 'open' || L.state === 'opening') ? 'Doors open · walk in' : L?.state === 'travel' ? 'On its way' : 'Click to call it'}</div>`;
  };
  ctx.action('liftcall', { hover: liftHover, click: () => callLift() });
  ctx.action('liftpanel', { hover: liftHover, click: (h) => pressFloor(h.floor) });
  ctx.action('info', { hover: (h) => h.info() });
  ctx.action('john', { hover: () => `<b>John</b><div class="m">Sysadmin · ${srv.john.mood === 'sip' ? 'sipping a coffee' : srv.john.mood === 'lean' ? 'leaning back' : 'tapping away at a terminal'}</div><div class="k">${CAN_CHAT ? 'Click to talk to him' : 'He only talks to people on this computer'}</div>`,
    click: () => openJohn() });
  ctx.action('coffee', { hover: () => `<b>Coffee machine</b><div class="k">${kitchen.brewing() ? 'Brewing…' : 'Click to make a flat white'}</div>`, click: () => kitchen.brew() });
  ctx.action('blinds', { hover: (h) => `<b>${h.blind.name}</b><div class="k">Click to ${['lower the blinds', 'close the slats', 'raise the blinds'][h.blind.to * 2]}</div>`,
    click: (h) => { h.blind.to = h.blind.to === 1 ? 0 : h.blind.to + 0.5; dash.putOffice({ blinds: { [h.blind.key]: h.blind.to } }); } });
  ctx.action('door', { hover: (h) => `<b>${h.door.name}</b><div class="k">Click to ${h.door.to ? 'close' : 'open'}</div>`,
    click: (h) => { const d = h.door; d.to = d.to ? 0 : 1; if (d === door) dash.putOffice({ door: d.to }); } });
  ctx.action('board', { hover: (h) => `<b>${h.board.name[0].toUpperCase() + h.board.name.slice(1)}</b><div class="k">Click to draw on it</div>`, click: (h) => useBoard(h.board) });
  // What you can point at in the office, nearest first when it's a tie.
  ctx.hoverTargets(() => [lifts.callHit, ...lifts.map((L) => L.panel.mesh)], 10);
  ctx.hoverTargets(() => [hole], 20);
  ctx.hoverTargets(() => [laptop.g], 30);
  ctx.hoverTargets(() => [kitchen.hit], 40);
  ctx.hoverTargets(() => doors.map((d) => d.pivot), 50);
  ctx.hoverTargets(() => desks.flatMap((d) => [d.scr.mesh, d.codeScr.mesh]), 60);
  ctx.hoverTargets(() => tvs.map((t) => t.scr.mesh), 70);
  ctx.hoverTargets(() => boards.map((b) => b.scr.mesh), 80);
  ctx.hoverTargets(() => [...new Set(Object.values(blinds).flatMap((b) => b.runs.map((r) => r.slats.parent)))], 90);
  ctx.hoverTargets(() => world.children.filter((o) => o.userData.glass), 100);
  ctx.hoverTargets(() => [...people.values()].map((p) => p.root), 110);
  Object.defineProperty(ctx, 'hover', { get: () => hover, set: (v) => { hover = v; }, enumerable: true });
}
