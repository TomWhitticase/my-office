// The menu (☰ top left with the mouse free, or Q from anywhere): a way back that never needs the 3D view to work. Plain DOM,
// so it answers with the pointer released (Esc) however stuck you are: not through hover, the raycast or walking.
// - Back to my desk: from any floor, the roof, the helicopter (put back on its pad), Relativity, B3, behind the sky, inside
//   a repo, a machine or the pool, mid-tween. Leaves whatever you're doing, sits you at your desk, and saves that as where
//   a reload finds you.
// - Lift lobby: the same, standing in front of the lifts on 48.
// - Unstick me: the nearest free spot where you are (in front of your car if nothing's in the way); flying, the
//   helicopter takes you home to the pad; in Relativity, back out the stone door to B3.

import { EYE, LIFT, REDUCED } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { hud, container, player, keys, mine, collide, setCam, tween, camPose, seatedPose, laptop, toast, dash, TELEPORTS } = ctx;
  const btn = hud.querySelector('.of-menub'), el = hud.querySelector('.of-menu'), unstick = el.querySelector('[data-go=unstick]');
  const fade = document.createElement('div');
  fade.style.cssText = 'position:absolute;inset:0;z-index:5;background:#000;opacity:0;pointer-events:none';
  container.appendChild(fade);

  const shown = () => el.classList.contains('on');
  function open() {
    if (!ctx.active || ['idle', 'intro', 'outro'].includes(ctx.mode)) return;   // (the view's opening or closing)
    if (document.pointerLockElement) document.exitPointerLock();
    keys.clear();
    unstick.textContent = ctx.mode === 'heli' ? 'Fly back to the helipad' : ctx.away && ctx.away === ctx.rel ? 'Back out to B3' : 'Unstick me';
    el.classList.add('on'); btn.setAttribute('aria-expanded', 'true');
  }
  function close() { el.classList.remove('on'); btn.setAttribute('aria-expanded', 'false'); }

  // Out of whatever you're in: a chat, a TV, a board, the drawer; off any floor (its leave() puts its own things away: the
  // keypad, a note you're reading, a machine, the pool) and the helicopter back on its pad. A floor whose leave() throws
  // still lets you go.
  const safe = (fn) => { try { fn(); } catch (e) { console.warn('office: menu', e); } };
  function leaveAll() {
    safe(() => ctx.closeChat());
    safe(() => ctx.leaveTv());
    safe(() => ctx.leaveBoard());
    safe(() => dash.closeDrawer?.());
    if (ctx.heli) ctx.heli.stay = false;
    safe(() => ctx.resetLift());
    if (ctx.away) { ctx.away.on = false; ctx.away = null; ctx.cssRenderer.domElement.style.visibility = ''; safe(() => ctx.sfx.setAway(false)); }
    safe(() => ctx.heli?.stow());
    hud.classList.remove('of-flying', 'of-relative', 'of-restricted', 'of-using', 'of-boarding', 'of-chatting');
    keys.clear();
    ctx.mode = 'free';
  }
  // The view cut to black and back, and any tween underway (a ride's, climbing into the helicopter) replaced by none.
  function arrive() {
    tween(camPose(), camPose(), 1, null);
    setCam({ x: player.x, y: player.eye + (player.fy || 0), z: player.z, yaw: player.yaw, pitch: player.pitch });
    fade.style.transition = 'none'; fade.style.opacity = '1';
    requestAnimationFrame(() => requestAnimationFrame(() => { fade.style.transition = `opacity ${REDUCED ? 0.1 : 0.5}s ease`; fade.style.opacity = '0'; }));
  }
  function toDesk() {
    leaveAll();
    laptop.open = false;   // your desk, not the MacBook's armchair
    if (laptop.shown) { laptop.shown = false; ctx.placeHole(); }
    const s = seatedPose();
    Object.assign(player, { x: s.x, z: s.z, eye: s.y, yaw: s.yaw, pitch: s.pitch, seated: true, seat: null, fy: 0 });
    arrive();
    ctx.toDesk();
  }
  function toLobby() {
    leaveAll();
    TELEPORTS.Digit4();
    player.fy = 0;
    arrive();
    ctx.savePose();
  }
  // Somewhere you can stand: what collide() and the floor's bounds leave where they are.
  function isFree(x, z) {
    const q = { x, z };
    collide(q);
    ctx.away?.bound?.(q);
    return Math.hypot(q.x - x, q.z - z) < 0.05;
  }
  function nearestFree(x, z) {   // in rings out to 8 m
    if (isFree(x, z)) return { x, z };
    for (let r = 0.3; r <= 8; r += 0.3) for (let i = 0, n = Math.ceil(r * 12); i < n; i++) {
      const a = (i / n) * Math.PI * 2, q = { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
      if (isFree(q.x, q.z)) return q;
    }
    return null;
  }
  function unstickMe() {
    if (ctx.mode === 'heli') { ctx.heli.goHome(); return; }
    if (ctx.away && ctx.away === ctx.rel) { ctx.rel.back(); return; }
    safe(() => ctx.closeChat()); safe(() => ctx.leaveTv()); safe(() => ctx.leaveBoard());
    if (ctx.mode !== 'free') ctx.mode = 'free';
    const F = ctx.away, wasFree = isFree(player.x, player.z);
    let q = wasFree ? null : nearestFree(player.x, player.z);
    if (!q) {   // nothing in the way where you are: in front of your car instead (on 48, the lobby)
      if (!F) { toLobby(); toast('Nothing in your way there · the lift lobby'); return; }
      if (F.carless || F.liftGone || !mine.L) { toast(wasFree ? 'Nothing’s in your way here' : 'Nowhere free near here · try Back to my desk'); return; }
      q = nearestFree(LIFT.x - 1.6, mine.L.z);
      if (!q) { toast('Nowhere free near here · try Back to my desk'); return; }
      toast('Nothing in your way there · by the lift');
    }
    Object.assign(player, { x: q.x, z: q.z, seated: false, seat: null, eye: EYE });
    player.fy = F?.ground?.(q.x, q.z) || 0;
    if (!F?.walk) setCam({ x: player.x, y: player.eye + (F?.y || 0) + player.fy, z: player.z, yaw: player.yaw, pitch: player.pitch });
  }

  const GO = { desk: toDesk, lobby: toLobby, unstick: unstickMe };
  el.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (b?.dataset.go) { close(); GO[b.dataset.go](); }
    else if (e.target === el) close();
  });
  btn.addEventListener('click', () => (shown() ? close() : open()));
  // Q opens it from anywhere but a field you're typing in, or a TV page you're using (its keys go to the page: the ☰ is there).
  document.addEventListener('keydown', (e) => {
    if (!ctx.active || e.metaKey || e.ctrlKey || e.altKey || /** @type {HTMLElement} */ (e.target).closest?.('input, select, textarea, [contenteditable]')) return;
    if (e.code === 'Escape' && shown()) { close(); return; }
    if (e.code !== 'KeyQ' || ctx.mode === 'tv') return;
    e.preventDefault(); e.stopImmediatePropagation();
    shown() ? close() : open();
  }, true);
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) close(); });

  ctx.menu = { open, close, toDesk, toLobby, unstick: unstickMe };
}
