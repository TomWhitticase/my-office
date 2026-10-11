// You: where you are and what you're doing (mode: idle, intro, free, tv, board, chat, warp, read, outro), the camera and
// its tweens, sitting and standing, walking and bumping into things, the MacBook opening as you sit at it, and the mouse
// and keys while you walk about (the 1-5 teleports, G, H, M, T, E).

import * as THREE from 'three';
import { angDiff, clamp, colliders, damp, dash, ease, EYE, lerp, LIFT, REDUCED, ROOM, SEATED_EYE } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { OWNER, renderer, laptop, camera, lapScr, center, screenWorld, hole, placeHole, carCollide, people, flyPlayer, sfx, openTvPanel, hud, mine, inMyCar,
    toast, setOverlays, setSpeed, SPEEDS, clockState } = ctx;
  Object.assign(ctx, { sitIn, openLaptop, collide, tween, camPose, setCam, movePlayer, laptopFx, stepTween, fillPose, seatedPose });
  // ----- player -----
  const player = { x: OWNER.x, z: OWNER.z + 1.45, eye: SEATED_EYE, yaw: 0, pitch: 0, seated: true };
  const keys = new Set();
  let locked = false, active = false, mode = 'idle', anim = null;

  // Square-on to whichever screen holds the page (the monitor, or the open MacBook), filling the view.
  const lapAt = new THREE.Vector3(), lapN = new THREE.Vector3();
  function fillPose() {
    if (!laptop.shown) {
      const d = (center.h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      return { x: screenWorld.x, y: screenWorld.y, z: screenWorld.z + d, yaw: 0, pitch: 0 };
    }
    // Close enough that the lid's screen covers the whole view, whatever the window's shape.
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), d = Math.max((lapScr.h / 2) / tv, (lapScr.w / 2) / (tv * camera.aspect));
    lapScreen();
    return { x: lapAt.x + lapN.x * d, y: lapAt.y + lapN.y * d, z: lapAt.z + lapN.z * d, yaw: Math.atan2(lapN.x, lapN.z), pitch: Math.asin(-lapN.y) };
  }
  function seatedPose() {
    if (laptop.shown) {
      const st = laptop.seat, y = st.eye;
      lapScreen();
      return { x: st.x, y, z: st.z, yaw: Math.atan2(st.x - lapAt.x, st.z - lapAt.z), pitch: Math.atan2(lapAt.y - y, Math.hypot(lapAt.x - st.x, lapAt.z - st.z)),
        seat: st };
    }
    const x = OWNER.x, z = OWNER.z + 1.45, y = SEATED_EYE;
    return { x, y, z, yaw: 0, pitch: Math.atan2(screenWorld.y - y, z - screenWorld.z) };
  }
  function lapScreen() {
    hole.updateWorldMatrix(true, false);
    hole.getWorldPosition(lapAt);
    lapN.set(0, 0, 1).transformDirection(hole.matrixWorld);
  }
  // Clicking the MacBook sits you in the nearer free armchair (or the one you're in) and opens it toward you; it shuts when
  // you get up. Once the screen's awake, clicking it again flies into your desktop like the office computer.
  function openLaptop() {
    const L = laptop;
    if (L.open) { if (L.shown) { document.exitPointerLock(); dash.setView('desktop'); } return; }
    const near = (st) => Math.hypot(st.x - player.x, st.z - player.z);
    const st = L.seats.includes(player.seat) ? player.seat : L.seats.filter((q) => !seatTaken(q)).sort((a, b) => near(a) - near(b))[0];
    if (!st) return;
    sitIn(st);
    if (player.seat !== st) return;
    Object.assign(L, { seat: st, open: true });
    player.pitch = Math.atan2(0.52 - st.eye, 0.9);
  }
  function laptopFx(dt) {
    const L = laptop, p = L.poseFor(L.seat);
    if (L.open && mode === 'free' && player.seat !== L.seat) L.open = false;
    L.g.position.x = damp(L.g.position.x, p.x, 8, dt); L.g.position.z = damp(L.g.position.z, p.z, 8, dt);
    L.g.rotation.y += angDiff(L.g.rotation.y, p.r) * Math.min(1, dt * 8);
    L.k = L.open ? Math.min(1, L.k + dt / 0.8) : Math.max(0, L.k - dt / 0.8);
    L.pivot.rotation.x = lerp(Math.PI / 2, -0.38, ease(L.k));
    // The screen wakes partway up and goes dark the moment you stand.
    const shown = L.open && L.k > 0.55;
    if (shown !== L.shown) { L.shown = shown; placeHole(); }
    L.light.intensity = shown ? 0.04 + 0.08 * (1 - ctx.daylight) : 0;   // a faint spill on the keys, not a lamp
    L.deckM.emissiveIntensity = ease(L.k) * (1 - ctx.daylight) * 0.3;
  }
  function setCam(p) { camera.position.set(p.x, p.y, p.z); camera.rotation.set(p.pitch, p.yaw, 0); }
  function camPose() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, pitch: camera.rotation.x }; }
  function tween(from, to, ms, done) {
    anim = { from, to, ms: REDUCED ? 1 : ms, start: performance.now(), done };
  }
  function stepTween(now) {
    if (!anim) return;
    const u = clamp((now - anim.start) / anim.ms, 0, 1), e = ease(u), { from: a, to: b } = anim;
    setCam({ x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e), yaw: a.yaw + angDiff(a.yaw, b.yaw) * e, pitch: lerp(a.pitch, b.pitch, e) });
    if (u >= 1) { const d = anim.done; anim = null; d?.(); }
  }
  function teleport(x, z, look, seated = false) {
    Object.assign(player, { x, z, seated, seat: null, eye: seated ? SEATED_EYE : EYE });
    player.yaw = Math.atan2(-(look.x - x), -(look.z - z));
    player.pitch = Math.atan2((look.y ?? EYE) - player.eye, Math.hypot(look.x - x, look.z - z));
  }

  function collide(p, r = 0.3) {
    if (p === player && carCollide(p)) return;
    for (const b of ctx.away ? ctx.away.colliders : colliders) {
      const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
      else {
        const pen = [[p.x - b.minX, -1, 0], [b.maxX - p.x, 1, 0], [p.z - b.minZ, 0, -1], [b.maxZ - p.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
        if (pen[1]) p.x = pen[1] < 0 ? b.minX - r : b.maxX + r; else p.z = pen[2] < 0 ? b.minZ - r : b.maxZ + r;
      }
    }
    if (ctx.away) { ctx.away.bound(p); return; }
    p.x = clamp(p.x, ROOM.minX + 0.4, ROOM.maxX - 0.4);
    p.z = clamp(p.z, ROOM.minZ + 0.4, ROOM.maxZ - 0.4);
  }

  const seatTaken = (st) => !st.floor && [...people.values()].some((p) => Math.hypot(p.root.position.x - st.x, p.root.position.z - st.z) < 0.4);
  function sitIn(st) {
    if (seatTaken(st)) return;
    Object.assign(player, { x: st.x, z: st.z, seated: true, seat: st, eye: player.eye });
    player.yaw = st.rotY + Math.PI; player.pitch = -0.08;
  }
  function movePlayer(dt) {
    if (ctx.away?.fly) { flyPlayer(dt); return; }
    if (ctx.away?.walk) { ctx.away.walk(dt, keys); return; }   // a floor that moves you itself (relativity.js)
    let f = 0, s = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    if (f || s) {
      // Stand up: step forward out of the chair (or back from your own desk, which has no seat entry).
      if (player.seated) {
        const st = player.seat;
        if (st) { player.x += Math.sin(st.rotY) * 0.55; player.z += Math.cos(st.rotY) * 0.55; } else player.z += 0.25;
        player.seated = false; player.seat = null;
      }
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8.5 : 4.4) * dt * (ctx.away?.pace?.(player.x, player.z) ?? 1), n = Math.hypot(f, s);
      const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      player.x += ((-sy * f + cy * s) / n) * speed;
      player.z += ((-cy * f - sy * s) / n) * speed;
      collide(player);
    }
    player.eye = damp(player.eye, player.seated ? player.seat?.eye ?? SEATED_EYE : EYE, 5, dt);
    const bob = (f || s) && !player.seated ? Math.sin(performance.now() / 140) * 0.025 : 0;
    player.fy = damp(player.fy || 0, ctx.away?.ground?.(player.x, player.z) || 0, 14, dt);   // up steps (the gateway's plinth)
    setCam({ x: player.x, y: player.eye + bob + (ctx.away?.y || 0) + player.fy, z: player.z, yaw: player.yaw, pitch: player.pitch });
  }

  // ----- input -----
  renderer.domElement.addEventListener('click', (e) => {
    sfx.unlock();
    if (mode === 'chat') { ctx.closeChat(true); return; }
    if (mode !== 'free') return;
    if (!locked) { renderer.domElement.requestPointerLock(); return; }
    if (!ctx.hover) return;
    const a = ctx.hover.action && ctx.actionOf(ctx.hover.action);
    if (a?.click) a.click(ctx.hover, e);
    else if (ctx.hover.sessionId && ctx.hover.screen) { document.exitPointerLock(); dash.openDrawer(ctx.hover.sessionId); }
    else if (ctx.hover.sessionId) ctx.openChat(ctx.hover.sessionId);
    else if (ctx.hover.seat) sitIn(ctx.hover.seat);
    else if (ctx.hover.tv) {
      if (ctx.hover.tv.cfg && !e.shiftKey) ctx.useTv(ctx.hover.tv);
      else { document.exitPointerLock(); openTvPanel(ctx.hover.tv); }
    }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    hud.classList.toggle('of-locked', locked);
    if (!locked) keys.clear();
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked || mode !== 'free') return;
    if (ctx.grab?.(e.movementX, e.movementY)) return;   // holding a control (the console behind the sky): it turns, not you
    player.yaw -= e.movementX * 0.0022;
    player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.4, 1.4);
  });
  const TELEPORTS = {
    Digit1: () => teleport(-2.5, 0.8, { x: -9, y: 1.0, z: -9 }),
    Digit2: () => teleport(-6.5, 2.2, { x: -13, y: 1.0, z: 8 }),
    Digit3: () => { const p = seatedPose(); teleport(p.x, p.z, { x: screenWorld.x, y: screenWorld.y, z: screenWorld.z }, true); },
    Digit4: () => teleport(14.6, 0.6, { x: LIFT.x, y: 1.6, z: LIFT.z }),
    Digit5: () => teleport(12.4, 1.4, { x: 17, y: 1.2, z: 6.5 }),
  };
  document.addEventListener('keydown', (e) => {
    if (!active || mode !== 'free' || e.metaKey || e.ctrlKey || e.target.closest?.('input, select, textarea')) return;
    if (ctx.onKey(e)) return;
    if (locked) { keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  for (const k of Object.keys(TELEPORTS)) ctx.key(k,
    (e) => { if (ctx.away || (mine.L?.state === 'travel' && inMyCar())) toast('Take the lift back to the office'); else TELEPORTS[e.code](); return true; });
  ctx.key('KeyG', () => { ctx.setQuality(!ctx.quality); return true; });
  ctx.key('KeyH', () => { setOverlays(!ctx.overlays); return true; });
  ctx.key('KeyM',
    () => { dash.setSound({ on: !dash.sound.on }); sfx.unlock();
    toast(`Sounds ${dash.sound.on ? 'on' : 'off'} · <kbd>M</kbd> to ${dash.sound.on ? 'mute' : 'unmute'}`); return true; });
  ctx.key('KeyT', () => { setSpeed(SPEEDS[(SPEEDS.indexOf(clockState.mode) + 1) % SPEEDS.length]); return true; });
  ctx.key('KeyE', () => { if (!ctx.hover?.tv) return false; document.exitPointerLock(); openTvPanel(ctx.hover.tv); return true; });
  ctx.key('KeyE', () => { if (!ctx.hover?.sessionId) return false; document.exitPointerLock(); dash.openDrawer(ctx.hover.sessionId); return true; });
  Object.assign(ctx, { player, keys, seatTaken, TELEPORTS });
  Object.defineProperty(ctx, 'mode', { get: () => mode, set: (v) => { mode = v; }, enumerable: true });
  Object.defineProperty(ctx, 'active', { get: () => active, set: (v) => { active = v; }, enumerable: true });
  Object.defineProperty(ctx, 'locked', { get: () => locked, set: (v) => { locked = v; }, enumerable: true });
  Object.defineProperty(ctx, 'anim', { get: () => anim, set: (v) => { anim = v; }, enumerable: true });
  ctx.onFrame((dt, t) => {
    if (ctx.mode === 'free') movePlayer(dt);
    if (ctx.mode === 'free' && mine.L?.state === 'travel' && inMyCar()) {   // the ride: a faint sway, strongest mid-shaft
      const k = Math.sin(Math.PI * mine.k);
      camera.position.y += Math.sin(t * 11) * 0.003 * k - 0.012 * Math.sin(Math.PI * Math.min(1, mine.k * 6));
      camera.rotation.z = Math.sin(t * 1.9) * 0.0035 * k;
    }
  }, 80);
  ctx.onFrame((dt) => laptopFx(dt), 90);
  ctx.onFrame((dt, t, now) => stepTween(now), 100);
  // Your computer and your MacBook: click to use them.
  const machineHover = (h) => (h.action === 'computer' && !laptop.shown ? '<b>Your computer</b><div class="k">Click to sit down and use it</div>'
    : `<b>Your MacBook</b><div class="k">${laptop.shown ? 'Click to use it' : laptop.open ? 'Waking up…' : 'Click to sit down and open it'}</div>`);
  ctx.action('computer', { hover: machineHover, click: () => { document.exitPointerLock(); dash.setView('desktop'); } });
  ctx.action('laptop', { hover: machineHover, click: () => openLaptop() });
  ctx.hoverTargets(() => [hole], 20);
  ctx.hoverTargets(() => [laptop.g], 30);
}
