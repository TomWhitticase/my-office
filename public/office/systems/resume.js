// Where you are, kept so a reload (yours, or the one a new build sets off: index.html) puts you straight back there: the
// floor, where you stand and look, the seat you're in, and whatever the floor keeps of its own (F.save() → F.restore(s, p):
// Relativity's gravity, the rooms round you on B3, the helicopter, which repo you're inside). Saved about once a second
// while you're about (and as the page goes); read once, the first time the page shows the office (main.js show), which
// then fades in where you were instead of pulling back out of the monitor. Sitting at your desk, or at your computer,
// saves just that. A spot that's no good now (something stands there) gives the nearest free one, then the lift lobby,
// then your desk. Nor is a spot that's no good saved (inside something, or a trap: Relativity's F.save says so itself).
//
// Stuck anywhere: Backspace twice (within a second) on foot puts you on the nearest spot you can walk from (unstick):
// a floor's own F.unstick() first (Relativity's: your gravity, then gravity I, then its door), else the nearest free spot
// that isn't boxed in, the lift lobby, your desk.

import { EYE, LIFT, REDUCED } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { CAR, player, mine, lifts, FLOORS, setFloor, setLift, spare, collide, seatTaken, sitIn, seatedPose, setCam, container, hud, arch } = ctx;
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;

  // ----- saving -----
  // F.save() → what the floor keeps (JSON), or false while it's mid-something (a roll, climbing in): keep the last.
  function snapshot() {
    const F = ctx.away;
    if (!F && player.seated && !player.seat) return { desk: 1 };
    const s = F?.save?.();
    if (s === false) return null;
    if (ctx.mode === 'free' && !player.seated && !F?.walk && !F?.fly && !isFree(player.x, player.z)) return null;   // (inside something)
    return { f: F ? F.n : 48, car: mine.L ? lifts.indexOf(mine.L) : -1, cz: mine.L ? r2(mine.L.z) : 0, x: r2(player.x), z: r2(player.z),
      eye: r2(player.eye), yaw: r3(player.yaw), pitch: r3(player.pitch), seated: !!player.seat, ...(s ? { s } : {}) };
  }
  const write = (p) => { try { localStorage.officePose = JSON.stringify({ ...p, at: Date.now() }); } catch {} };
  function save() {
    if (!ctx.active || (ctx.mode !== 'free' && ctx.mode !== 'heli')) return;
    const p = snapshot();
    if (p) write(p);
  }
  let savedAt = 0;
  ctx.onFrame((dt, t, now) => { if (now - savedAt >= 1000) { savedAt = now; save(); } }, 95);
  addEventListener('pagehide', save);

  // ----- coming back -----
  const fade = document.createElement('div');
  fade.style.cssText = 'position:absolute;inset:0;z-index:5;background:#000;opacity:0;pointer-events:none;transition:opacity .7s ease';
  container.appendChild(fade);
  const isFree = (x, z) => { const q = { x, z }; collide(q); return Math.hypot(q.x - x, q.z - z) < 0.05; };
  // and somewhere you can walk off from: half a metre clear one way or another (not boxed in)
  const roomy = (x, z) => [0, 1, 2, 3, 4, 5, 6, 7].some((i) => { const a = i * Math.PI / 4; return isFree(x + Math.cos(a) * 0.5, z + Math.sin(a) * 0.5); });
  function nearestFree(x, z, ok = isFree) {   // in rings out to 6 m
    if (ok(x, z)) return { x, z };
    for (let r = 0.3; r <= 6; r += 0.3) for (let i = 0, n = Math.ceil(r * 12); i < n; i++) {
      const a = (i / n) * Math.PI * 2, q = { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
      if (ok(q.x, q.z)) return q;
    }
    return null;
  }
  const floorOf = (n) => (n === 48 ? null : n === 'T' ? arch.tess() : FLOORS.find((F) => F.n === n));
  function atDesk() {
    if (ctx.away) ctx.resetLift();
    const s = seatedPose();
    Object.assign(player, { x: s.x, z: s.z, eye: s.y, yaw: s.yaw, pitch: s.pitch, seated: true, seat: null, fy: 0 });
  }
  // Onto floor F (null: the office) at p. A floor without a lift of its own (Relativity, inside a repo) is reached from the
  // one its `home` names, where your car waits; a floor with F.prepare (a repo's tree to load) gets it first.
  async function go(p, F) {
    Object.assign(player, { seated: false, seat: null, eye: EYE, fy: 0 });
    let lobby = false;
    if (F) {
      const L = lifts[p.car] && spare(lifts[p.car]) ? lifts[p.car] : lifts.find(spare);
      if (!L) return false;
      if (F.prepare && !(await F.prepare(p.s))) { F = floorOf(F.home); lobby = true; }
      if (!F) return false;
      Object.assign(mine, { L, call: false, goal: null }); L.player = true;
      L.floor = F.home ?? F.n; L.dir = 0; L.doorK = 0; setLift(L, 'parked');
      setFloor(F);
      if (F.scene && !F.carless) p.z += L.z - p.cz;   // its rooms are laid out from the car you came in (see setFloor)
    }
    Object.assign(player, { x: p.x, z: p.z, eye: F?.fly ? p.eye : EYE, yaw: p.yaw, pitch: p.pitch });
    ctx.mode = 'free';
    if (!lobby && F?.restore?.(p.s || {}, p)) return true;   // the floor's put you somewhere itself (in the helicopter, in your gravity)
    const L = mine.L;
    if (!lobby && F && !F.carless && !F.liftGone && p.x > LIFT.x + 0.3 && p.x < LIFT.x + 0.1 + CAR.d && Math.abs(p.z - L.z) < CAR.w / 2) {
      setLift(L, 'opening');   // still in the car: its doors open on the floor
      return true;
    }
    const st = !lobby && p.seated && ctx.seats.find((q) => (q.floor || 48) === (F ? F.n : 48) && Math.hypot(q.x - p.x, q.z - p.z) < 0.3 && !seatTaken(q));
    if (st) { sitIn(st); player.eye = st.eye; return true; }
    const near = !lobby && nearestFree(p.x, p.z), q = near || (F?.carless ? null : nearestFree(LIFT.x - 1.6, L?.z ?? LIFT.z));
    if (!q) return false;
    Object.assign(player, { x: q.x, z: q.z }, near ? {} : { yaw: Math.PI / 2, pitch: 0 });   // the lobby: your back to the lift
    return true;
  }
  /** The first show since the page loaded: back where you were, or false (nothing saved) for the pull back out of the monitor.
   *  done() once you're in. */
  function resume(done) {
    let p;
    try { p = JSON.parse(localStorage.officePose || 'null'); } catch {}
    if (!p || !(Date.now() - p.at < 864e5) || !(p.desk || Number.isFinite(p.x + p.z + p.yaw + p.pitch))) return false;
    fade.style.transition = 'none'; fade.style.opacity = '1';
    const F = p.desk ? null : floorOf(p.f);
    (p.desk || F === undefined ? Promise.resolve(false) : go(p, F)).catch((e) => { console.warn('office: resume', e); return false; }).then((ok) => {
      if (!ok) { atDesk(); ctx.mode = 'free'; }
      player.fy = ctx.away?.ground?.(player.x, player.z) || 0;
      if (ctx.mode === 'free' && !ctx.away?.walk) setCam({ x: player.x, y: player.eye + (ctx.away?.y || 0) + player.fy, z: player.z, yaw: player.yaw, pitch: player.pitch });
      hud.classList.remove('hidden');
      requestAnimationFrame(() => requestAnimationFrame(() => { fade.style.transition = `opacity ${REDUCED ? 0.1 : 0.7}s ease`; fade.style.opacity = '0'; }));
      done?.();
    });
    return true;
  }
  // At your computer (or the MacBook): that's where a reload finds you.
  const toDesk = () => write({ desk: 1 });

  // ----- stuck: Backspace twice -----
  /** Out to the nearest spot you can walk from: true if you were moved. */
  function unstick() {
    const F = ctx.away;
    if (ctx.mode !== 'free' || player.seated || F?.fly) return false;
    if (F?.unstick) { const moved = F.unstick(); if (moved) save(); return moved; }
    const good = (x, z) => isFree(x, z) && roomy(x, z);
    if (good(player.x, player.z)) return false;
    const q = nearestFree(player.x, player.z, good) || (F && !F.carless && mine.L ? nearestFree(LIFT.x - 1.6, mine.L.z, good) : null);
    if (q) Object.assign(player, { x: q.x, z: q.z });
    else atDesk();
    save();
    return true;
  }
  let bsAt = -1e9;
  ctx.key('Backspace', (e) => {
    if (e.repeat) return true;
    const now = performance.now(), twice = now - bsAt < 1000;
    bsAt = twice ? -1e9 : now;
    if (twice) ctx.toast(unstick() ? 'Unstuck: back on your feet nearby' : 'You can walk from here · <kbd>⌫</kbd> <kbd>⌫</kbd> if you’re ever stuck');
    return true;
  });
  Object.assign(ctx, { resume, savePose: save, toDesk, unstick });
}
