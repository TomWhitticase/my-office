// @ts-check
// The building's lifts: the stone-clad core in the lobby with two cars either side of the call panel and a hall lantern
// over each (install); the cars' cycle, carrying sessions in and out (installCycle); and riding them yourself, the car
// panels and the FLOORS table (installRiding). Floors register themselves with ctx.addFloor; lifts never import floors.

import * as THREE from 'three';
import { AISLE, box, clamp, cyl, damp, dash, ease, faceTo, fit, FONT, lerp, LIFT, makeCanvas, makeScreen, mat, mergedBoxes, rng, ROOM,
  solid } from '../util.js';
import { MONO } from '../painters.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { world } = ctx;
  Object.assign(ctx, { paintIndicator });
  // ----- lift lobby -----
  // The building's lifts: a stone-clad core against the east wall, two cars facing west either side of the call panel.
  // Doors are brushed steel leaves sliding into the wall; each car is lit by an emissive ceiling panel only (no lights).
  // Sessions arrive and leave by lift: see the lift cycle next to the people sync.
  let liftSteelM;   // brushed steel for every lift's doors and surrounds (set below)
  const signs = [];   // every floor sign (floorSign), and the floors their directories list (see directory)
  let listed = [];
  const CORE = { x0: LIFT.x, x1: 20, z0: -3.47, z1: 2.46 }, DOOR = { w: 1.1, h: 2.2 }, CAR = { d: 1.8, w: 1.5, h: 2.35 };
  /** @type {import('../ctx.js').Lift[] & { callM?: any, callHit?: any }} */
  const lifts = [[LIFT.z - 0.9, 48],
    [LIFT.z + 0.9, 12]].map(([z, floor]) =>
    ({ z, at: { x: LIFT.x, z }, floor, goal: floor, dir: 0, state: floor === 48 ? 'home' : 'away', t: 0, doorK: 0, nIn: 0,
    pending: [], cargo: new Set(), exits: new Set(), callers: new Set(), riders: new Set() }));
  {
    const brushed = makeCanvas(64, 256), R = rng(31);
    brushed.ctx.fillStyle = '#c9cdd2'; brushed.ctx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 260; i++) { brushed.ctx.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '40,44,50'},${0.05 + R() * 0.08})`;
      brushed.ctx.fillRect(R() * 64, 0, 0.6 + R(), 256); }
    brushed.tex.needsUpdate = true;
    liftSteelM = new THREE.MeshStandardMaterial({ map: brushed.tex, metalness: 0.85, roughness: 0.32 });   // shared by every floor's lift
    const core = liftCore(world, lifts.map((L) => L.z));
    lifts.forEach((L, i) => Object.assign(L, core.cars[i]));
    lifts.callM = core.callM;
    solid((LIFT.x + CORE.x1) / 2, (CORE.z0 + CORE.z1) / 2, CORE.x1 - LIFT.x, CORE.z1 - CORE.z0);
    floorSign(world, 48, () => [dash.officeName(), 'Desks · Meeting rooms · Lounge']);
    directory([]);
  }
  // The core's face into `parent` (the office's; the empty floors' below, floors/empty-floors.js): stone cladding, a car behind
  // each doorway at `zs` with its surround and hall lantern, and the call panel between. Returns each car's door leaves
  // (sliding into the wall) and lantern, and the call button's lamp.
  function liftCore(parent, zs) {
    const steelM = liftSteelM;
    const fx = LIFT.x + 0.05, cx = LIFT.x + 0.1 + CAR.d / 2, back = LIFT.x + 0.1 + CAR.d;
    const edges = [CORE.z0, ...zs.flatMap((z) => [z - DOOR.w / 2, z + DOOR.w / 2]), CORE.z1];
    const stone = [], steel = [], car = [], mirror = [], glow = [], cars = [];
    for (let k = 0; k < edges.length; k += 2) {
      const a = edges[k], b = edges[k + 1], len = b - a, mid = (a + b) / 2;
      stone.push([0.1, ROOM.h, len, fx, ROOM.h / 2, mid, '#77716a'], [0.02, 0.1, len, LIFT.x - 0.01, 0.05, mid, '#3b3835']);
      for (let y = 0.9; y < ROOM.h; y += 0.9) stone.push([0.012, 0.006, len, LIFT.x - 0.001, y, mid, '#5d5852']);   // panel joints
    }
    stone.push([CORE.x1 - LIFT.x, ROOM.h, 0.06, (LIFT.x + CORE.x1) / 2, ROOM.h / 2, CORE.z0 + 0.03, '#77716a'],
      [CORE.x1 - LIFT.x, ROOM.h, 0.06, (LIFT.x + CORE.x1) / 2, ROOM.h / 2, CORE.z1 - 0.03, '#77716a']);
    for (const z of zs) {
      stone.push([0.1, ROOM.h - DOOR.h, DOOR.w, fx, (ROOM.h + DOOR.h) / 2, z, '#77716a']);
      // Surround: jambs, head, threshold and the indicator housing.
      for (const s of [-1, 1]) steel.push([0.05, DOOR.h + 0.08, 0.08, LIFT.x - 0.02, (DOOR.h + 0.08) / 2, z + s * (DOOR.w / 2 + 0.04)]);
      steel.push([0.05, 0.08, DOOR.w + 0.16, LIFT.x - 0.02, DOOR.h + 0.04, z], [0.34, 0.012, DOOR.w, fx + 0.02, 0.006, z],
        [0.04, 0.26, 0.56, LIFT.x - 0.02, 2.5, z]);
      // Car: floor, ceiling, steel sides, wood back with a mirror over it, handrails.
      car.push([CAR.d, 0.02, CAR.w, cx, 0.01, z, '#2c2b2a'], [CAR.d, 0.04, CAR.w, cx, CAR.h, z, '#232426'],
        [0.04, CAR.h, CAR.w, back, CAR.h / 2, z, '#8a6446']);
      for (const s of [-1, 1]) car.push([CAR.d, CAR.h, 0.04, cx, CAR.h / 2, z + s * CAR.w / 2, '#aeb4ba'],
        [CAR.d - 0.3, 0.035, 0.035, cx + 0.1, 0.95, z + s * (CAR.w / 2 - 0.06), '#dfe2e5']);
      car.push([0.035, 0.035, CAR.w - 0.2, back - 0.06, 0.95, z, '#dfe2e5'], [0.02, 0.4, 0.16, LIFT.x + 0.35, 1.2, z + CAR.w / 2 - 0.03, '#5a5f66']);
      mirror.push([0.01, 1.05, CAR.w - 0.3, back - 0.025, 1.65, z]);
      glow.push([CAR.d - 0.5, 0.01, CAR.w - 0.45, cx, CAR.h - 0.025, z]);
      // Two leaves meeting in the middle; they slide apart into the wall.
      // behind the stone face, so they slide into the wall
      const leaves = [-1,
        1].map((s) => box(parent, 0.03, DOOR.h, DOOR.w / 2 + 0.01, '', LIFT.x + 0.13, DOOR.h / 2, z + s * DOOR.w / 4, { material: steelM, shadow: false }));
      const ind = makeScreen(parent, 0.48, 0.2, 192, 80, LIFT.x - 0.045, 2.5, z);
      ind.mesh.rotation.y = -Math.PI / 2;
      cars.push({ leaves, ind });
    }
    steel.push([0.02, 0.38, 0.15, LIFT.x - 0.01, 1.1, LIFT.z]);   // call panel
    parent.add(mergedBoxes(stone, mat('#ffffff', { vertexColors: true, roughness: 0.55 })), mergedBoxes(steel, steelM),
      mergedBoxes(car, mat('#ffffff', { vertexColors: true, roughness: 0.45, metalness: 0.35 })),
        mergedBoxes(mirror, mat('#dfe4e8', { metalness: 1, roughness: 0.05 })));
    const carLight = mergedBoxes(glow, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3df', emissiveIntensity: 1.6 }));
    carLight.castShadow = false; parent.add(carLight);
    const callM = new THREE.MeshStandardMaterial({ color: '#e6e3dc', emissive: '#ffb347', emissiveIntensity: 0, roughness: 0.4 });
    for (const y of [1.16, 1.04]) cyl(parent, 0.026, 0.026, 0.02, '', LIFT.x - 0.025, y, LIFT.z,
      { material: y > 1.1 ? mat('#e6e3dc', { roughness: 0.4 }) : callM, seg: 16, shadow: false }).rotation.z = Math.PI / 2;
    return { cars, callM };
  }
  // The floor sign on the core behind reception: the floor's number, `what` it is ([name, line]) and a building directory.
  function floorSign(parent, n, what) {
    const sign = makeScreen(parent, 1.5, 1.0, 600, 400, LIFT.x - 0.012, 1.95, -2.3);
    sign.mesh.rotation.y = -Math.PI / 2;
    sign.mesh.material = new THREE.MeshStandardMaterial({ map: sign.tex, roughness: 0.5 });
    const s = { n, what, sign, paint: () => paintSign(s) };
    signs.push(s);
    return s;
  }
  function paintSign({ n, what, sign }) {
    const c = sign.ctx, [name, line] = what();
    c.fillStyle = '#26282b'; c.fillRect(0, 0, 600, 400);
    c.fillStyle = '#d97757'; c.fillRect(40, 54, 6, 120);
    c.font = `200 132px ${FONT}`; c.fillStyle = '#f2efe8'; c.fillText(String(n), 62, 168);
    c.font = `600 26px ${FONT}`; c.fillStyle = '#c3c2b7'; c.fillText('FLOOR', 250, 96);
    c.font = `400 24px ${FONT}`; c.fillText(fit(c, name, 310), 250, 132); c.fillText(fit(c, line, 310), 250, 164);
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(40, 214, 520, 2);
    // The directory: every other floor the lift serves, top first, from the FLOORS table.
    const rows = listed.filter((F) => F.n !== n && !F.carless && !F.unlisted), h = Math.min(34, 168 / Math.max(1, rows.length));
    rows.forEach((F, i) => {
      const y = 252 + i * h;
      c.fillStyle = '#f2efe8'; c.font = `600 22px ${FONT}`; c.fillText(floorName(F.n), 44, y);
      c.fillStyle = '#9a9890'; c.font = `400 22px ${FONT}`; c.fillText(fit(c, F.blurb || F.title, 450), 100, y);
    });
    sign.tex.needsUpdate = true;
  }
  // (repainted as floors register)
  function directory(floors) { listed = floors; signs.forEach(paintSign); }
  Object.assign(ctx, { paintDirectory: directory, liftCore, floorSign });
  // Hall lantern over each lift: floor and direction, repainted only when they change.
  const ROOF = 50;   // the roof terrace, two floors up (49 is the plant room); its button and lanterns read R
  const floorName = (f) => (f === ROOF ? 'R' : f < 0 ? `B${-f}` : f ? String(f) : 'G');
  function paintIndicator(L) {
    const f = Math.round(L.floor), key = `${f}${L.dir}`;
    if (key === L.indKey) return;
    L.indKey = key;
    const { ctx, W, H } = L.ind;
    ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffb347'; ctx.font = `600 58px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText(floorName(f), W / 2 + 22, 62); ctx.textAlign = 'left';
    if (L.dir) { ctx.beginPath(); ctx.moveTo(26, L.dir > 0 ? 22 : 58); ctx.lineTo(48, L.dir > 0 ? 22 : 58); ctx.lineTo(37, L.dir > 0 ? 8 : 72);
      ctx.lineTo(26, L.dir > 0 ? 22 : 58); ctx.fill(); ctx.fillRect(33, L.dir > 0 ? 22 : 34, 8, 24); }
    L.ind.tex.needsUpdate = true;
  }
  lifts.forEach(paintIndicator);
  Object.assign(ctx, { lifts, ROOF, DOOR, CAR, floorName, CORE });
  Object.defineProperty(ctx, 'liftSteelM', { get: () => liftSteelM, set: (v) => { liftSteelM = v; }, enumerable: true });
  ctx.minimap((c, sx, sz) => {   // the lifts
    c.fillStyle = 'rgba(200,205,212,.9)';
    for (const L of lifts) c.fillRect(sx(LIFT.x) - 3, sz(L.z - DOOR.w / 2), 4, sz(L.z + DOOR.w / 2) - sz(L.z - DOOR.w / 2));
    c.font = '600 15px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText('Lifts', sx(LIFT.x) - 44, sz(-2.6));
  }, 20);
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function installCycle(ctx) {
  const { lifts, world, paintIndicator, LOBBY, DOOR } = ctx;
  Object.assign(ctx, { setLift, arrive, leave, liftFx });
  // ----- lifts -----
  // Each lift is home (closed at 48), away (closed on another floor), travel, opening, open or closing. Arrivals ride up in
  // the car (`cargo`; `pending` until a car is free to fetch them) and walk out once the doors part. Leavers call it at the
  // panel, wait beside the doors, board, turn round, and are removed once the car has gone. Doors hold for anyone coming
  // or standing in the doorway, and reopen for them while closing.
  const PANEL = { x: LIFT.x - 0.45, z: LIFT.z };
  const inCar = (L, i) => ({ x: LIFT.x + 1.05 + (i % 2) * 0.45, z: L.z + [0, -0.4, 0.4][Math.floor(i / 2) % 3] });
  const carSpot = (L, pos) =>
    ({ key: 'lift', kind: 'lift', pos, rotY: -Math.PI / 2, route: [{ x: LIFT.x - 1.2, z: AISLE }, { x: LIFT.x - 0.6, z: L.z }, pos] });
  const calling = (L) => [...L.callers].some((p) => p.lv.stage !== 'walk');
  const waitAt = (L) =>
    ({ x: LIFT.x - 0.95 - 0.45 * ([...L.callers].filter((q) => q.lv.stage !== 'walk').length % 3), z: L.z + (L === lifts[0] ? -0.6 : 0.6) });
  const theirs = () => lifts.filter((L) => !L.player);   // the cars sessions may use: not the one you've called
  const inDoorway = (L) =>
    [...ctx.people.values()].some((p) => p.lv?.stage !== 'in' && Math.abs(p.root.position.z - L.z) < 0.7 && p.root.position.x > LIFT.x - 0.6 &&
    p.root.position.x < LIFT.x + 0.5);
  function gone(p) { world.remove(p.root); for (const [k, v] of ctx.people) if (v === p) ctx.people.delete(k); }
  function setLift(L, state) {
    if ((state === 'opening' || state === 'closing') && L.state !== state) ctx.sfx.slide(L.at, L.player);
    L.state = state; L.t = 0;
  }
  function goTo(L, floor) { L.goal = floor; L.dir = Math.sign(floor - L.floor); setLift(L, 'travel'); }
  function ride(L, p) {   // into the car out of sight: placed standing, facing the doors
    L.cargo.add(p); p.lift = L; p.root.visible = true;
    p.spot = carSpot(L, inCar(L, L.cargo.size - 1)); p.place(p.spot);
  }
  function arrive(p) {
    const free = (L) => !L.player && (L.state === 'away' || (L.state === 'travel' && L.goal === 48 && L.dir > 0));
    const L = lifts.find(free) || theirs().find((x) => x.state === 'home') || theirs().reduce((a, b) => (b.pending.length < a.pending.length ? b : a));
    p.root.visible = false; p.lift = L; p.place(carSpot(L, inCar(L, 0)));
    if (free(L)) ride(L, p); else L.pending.push(p);
  }
  function leave(p) {
    const fresh = lifts.some((L) => L.exits.delete(p));   // still stepping out of the car: turn straight round
    const C = p.lift;
    if (C) {   // gone again before they even stepped out: stay in the car, or never show up at all
      p.lift = null;
      if (C.pending.includes(p)) { C.pending.splice(C.pending.indexOf(p), 1); gone(p); return; }
      C.cargo.delete(p); C.riders.add(p); p.lv = { L: C, stage: 'in' };
      return;
    }
    const L = theirs().find((x) => x.state === 'open' || x.state === 'opening') || theirs().find(calling) || theirs().find((x) => x.state === 'home')
      || theirs().reduce((a, b) => (b.callers.size < a.callers.size ? b : a));
    const press = !lifts.some(calling) && L.state !== 'open';
    p.lv = { L, stage: 'walk', press };
    L.callers.add(p);
    p.path = [...(fresh ? [] : ctx.routeOut(p)), { x: LIFT.x - 1.2, z: AISLE }, press ? PANEL : waitAt(L)];
    p.spot = null;
    p.onArrive = () => atLift(p);
  }
  function atLift(p) {
    p.onArrive = null;
    if (p.lv.stage === 'walk' && p.lv.press) { p.lv.stage = 'press'; p.pressAt = p.time; p.spot = { pose: 'press', rotY: Math.PI / 2 }; return; }
    p.lv.stage = 'wait'; p.spot = { rotY: faceTo(p.root.position, p.lv.L.at) };
  }
  function liftFx(dt) {
    for (const L of lifts) {
      L.t += dt;
      for (const p of L.callers) {
        if (p.lv.stage === 'press' && p.time - p.pressAt > 1.2) { p.lv.stage = 'toWait'; p.path = [waitAt(L)]; p.onArrive = () => atLift(p); }
        if (p.lv.stage === 'wait' && (L.state === 'open' || (L.state === 'opening' && L.doorK > 0.8))) {
          p.lv.stage = 'board'; p.spot = null;
          p.path = [{ x: LIFT.x - 0.3, z: L.z }, inCar(L, L.nIn++)];
          p.onArrive = () => { p.onArrive = null; p.lv.stage = 'in'; L.callers.delete(p); L.riders.add(p); p.spot = { rotY: -Math.PI / 2 }; };
        }
      }
      for (const p of L.exits) if (!p.path.length || p.root.position.x < LIFT.x - 0.8) L.exits.delete(p);
      // incl. anyone about to reach it
      const holding = [...L.callers].some((p) => p.lv.stage !== 'walk' || Math.hypot(p.root.position.x - LIFT.x, p.root.position.z - L.z) < 4) ||
        L.exits.size || inDoorway(L);
      if (L.player) ctx.myCar(L, dt);
      else switch (L.state) {
        case 'home':
          if (calling(L)) { ctx.sfx.ding(L.at); setLift(L, 'opening'); }
          else if (L.pending.length) goTo(L, 30 + Math.floor(Math.random() * 15));   // fetch them from below
          break;
        case 'away':
          for (const p of L.pending.splice(0)) ride(L, p);
          if (L.cargo.size || calling(L)) goTo(L, 48);
          break;
        case 'travel':
          L.floor += L.dir * dt * 9;
          if ((L.goal - L.floor) * L.dir <= 0) {
            L.floor = L.goal; L.dir = 0;
            if (L.goal === 48) { ctx.sfx.ding(L.at); setLift(L, 'opening'); }
            else { for (const p of L.riders) gone(p); L.riders.clear(); setLift(L, 'away'); }
          }
          break;
        case 'opening':
          L.doorK = Math.min(1, L.doorK + dt / 1.1);
          if (L.doorK > 0.6) for (const p of L.cargo) { L.cargo.delete(p); p.lift = null; L.exits.add(p); ctx.sendTo(p, p.want || LOBBY); }
          if (L.doorK === 1) setLift(L, 'open');
          break;
        case 'open':
          if (L.t > 2.2 && !holding) setLift(L, 'closing');
          break;
        case 'closing':
          L.doorK = Math.max(0, L.doorK - dt / 1.3);
          if (holding) setLift(L, 'opening');
          else if (L.doorK === 0) {
            L.nIn = 0;
            if (L.riders.size) goTo(L, Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 40));
            else if (L.pending.length) goTo(L, 30 + Math.floor(Math.random() * 15));
            else setLift(L, 'home');
          }
          break;
      }
      const e = ease(Math.round(L.floor) === 48 ? L.doorK : 0);   // your car opening on another floor stays shut here
      L.leaves.forEach((m, i) => { m.position.z = L.z + (i ? 1 : -1) * (DOOR.w / 4 + e * DOOR.w * 0.48); });
      paintIndicator(L);
    }
    lifts.callM.emissiveIntensity = lifts.some((L) => calling(L) && L.state !== 'open') || ctx.mine.call ? 2.5 : 0;
    ctx.myLift(dt);
  }
  ctx.onFrame((dt) => liftFx(dt), 20);
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function installRiding(ctx) {
  const { lifts, world, CAR, DOOR, floorName, toast, setLift, paintIndicator } = ctx;
  Object.assign(ctx, { callLift, pressFloor, myLift, myCar, carPanel, paintPanel, carCollide, resetLift });
  // ----- riding the lifts yourself -----
  // Click the call panel and the nearest car no session needs is yours (`mine.L`, `L.player`) until you step out and it
  // closes: it opens, you walk in, press a floor on the car panel, and ride. Sessions keep using the other car meanwhile.
  // The other floors (THE ARCHIVE, ...) are separate scenes: the swap happens behind closed doors, and the car stays there for you.
  // FLOORS lists every floor the car panel offers, top first; `away` is the floor you're on when it isn't the office. A floor is
  // { n, label, title, scene, enter(z), bound(p), map(), colliders, hits, look } plus the car from liftShaft (see setFloor, renderFloor).
  // A floor with `y` instead of a scene is part of the office scene, that far up (THE ROOF): drawn by renderFrame, with leave().
  const ARCHIVE = -2;
  /** @typedef {import('../ctx.js').Floor} Floor */
  const OFFICE = /** @type {Floor} */ ({ n: 48, label: 'OFFICE', title: 'Office' }), FLOORS = /** @type {Floor[]} */ ([OFFICE]);
  let away = /** @type {Floor | null} */ (null);
  /** @param {Floor} F */
  const addFloor = (F) => { FLOORS.push(F); FLOORS.sort((a, b) => b.n - a.n); for (const P of carPanels()) paintPanel(P, null); ctx.paintDirectory?.(FLOORS); };
  const carPanels = () => [...lifts.map((L) => L.panel), ...FLOORS.filter((F) => F.panel).map((F) => F.panel)];
  const mine = { L: null, call: false, goal: null, from: 48, to: 48, k: 0, dur: 1 };
  // (Not while the floor has put its lift out of reach: out in the archive's void, see archive-entrance.js.)
  const inMyCar = () => !!mine.L && !ctx.away?.liftGone && ctx.player.x > LIFT.x + 0.3 &&
    ctx.player.x < LIFT.x + 0.1 + CAR.d && Math.abs(ctx.player.z - mine.L.z) < CAR.w / 2;
  const atMyDoor = () => !!mine.L && !ctx.away?.liftGone && ctx.player.x > LIFT.x - 0.7 && ctx.player.x < LIFT.x + 0.45 && Math.abs(ctx.player.z - mine.L.z) < DOOR.w / 2 + 0.1;
  const spare = (L) => !L.player && !L.pending.length && !L.cargo.size && !L.callers.size && !L.riders.size && !L.exits.size &&
    ['home', 'away', 'open', 'closing'].includes(L.state);
  function carPanel(parent, z) {   // the car's floor buttons, on the return beside the doors: one per floor, top floor first
    const scr = makeScreen(parent, 0.1, 0.34, 80, 272, LIFT.x + 0.3615, 1.2, z + 0.68);
    scr.mesh.rotation.y = Math.PI / 2;
    Object.assign(scr.mesh.userData,
      { action: 'liftpanel', reach: 2.2, floorAt: (uv) => FLOORS[clamp(Math.floor((1 - uv.y) * FLOORS.length), 0, FLOORS.length - 1)].n });
    return scr;
  }
  function paintPanel(scr, lit) {
    const { ctx: c, W, H } = scr, step = H / FLOORS.length, r = Math.min(27, step * 0.3);
    c.fillStyle = '#4d5157'; c.fillRect(0, 0, W, H); c.textAlign = 'center';
    FLOORS.forEach(({ n: f, label: t }, i) => {
      const y = step * (i + 0.42);
      c.beginPath(); c.arc(W / 2, y, r, 0, Math.PI * 2); c.fillStyle = '#d9dcdf'; c.fill();
      c.lineWidth = r / 5.4; c.strokeStyle = f === lit ? '#ffb347' : '#8b9096'; c.stroke();
      c.fillStyle = '#26282b'; c.font = `600 ${Math.round(r * 0.9)}px ${FONT}`; c.fillText(floorName(f), W / 2, y + r * 0.3);
      c.fillStyle = '#e8e6e1'; c.font = `600 ${Math.min(12, Math.round(r * 0.48))}px ${FONT}`; c.fillText(fit(c, t, W - 4), W / 2, y + r * 1.75);
    });
    c.textAlign = 'left'; scr.tex.needsUpdate = true;
  }
  const hitBox = (parent, w, h, d, x, y, z, ud) =>
    { const m = box(parent, w, h, d, '#fff', x, y, z, { shadow: false }); m.visible = false; Object.assign(m.userData, ud); return m; };
  lifts.callHit = hitBox(world, 0.06, 0.42, 0.22, LIFT.x - 0.03, 1.1, LIFT.z, { action: 'liftcall', reach: 2.5 });
  for (const L of lifts) { L.panel = carPanel(world, L.z); paintPanel(L.panel, null); }

  function callLift() {
    const L = mine.L;
    if (L) { if (L.state === 'closing' || L.state === 'parked') setLift(L, 'opening'); return; }
    if (!mine.call) toast('Lift called');
    mine.call = true;
  }
  function pressFloor(f) {
    const L = mine.L;
    if (!L || L.state === 'travel') return;
    if (f !== Math.round(L.floor) && FLOORS.find((F) => F.n === f)?.gate?.() === false) return;   // behind a code: its keypad instead (restricted.js)
    mine.goal = f === Math.round(L.floor) ? null : f;
    if (mine.goal === null && L.state !== 'open') setLift(L, 'opening');
    for (const P of carPanels()) paintPanel(P, mine.goal);
  }
  function travelTo(L, f) {
    const ride = FLOORS.find((F) => F.n === f)?.ride;   // a floor can take longer to reach (restricted.js)
    Object.assign(mine, { from: L.floor, to: f, k: 0, dur: ride || clamp(Math.abs(f - L.floor) / 11, 2.5, 5.5) });
    L.goal = f; L.dir = Math.sign(f - L.floor); setLift(L, 'travel');
    if (inMyCar()) { ctx.setFloor(f === 48 ? null : FLOORS.find((F) => F.n === f)); ctx.sfx.hum(true); }
  }
  function release(L) {   // back to the sessions, closed at whatever floor it's on
    L.player = false; L.floor = Math.round(L.floor); L.dir = 0; L.doorK = 0;
    setLift(L, L.floor === 48 ? 'home' : 'away');
    Object.assign(mine, { L: null, goal: null });
    paintPanel(L.panel, null);
  }
  function myCar(L, dt) {
    const inside = inMyCar(), door = atMyDoor(), here = Math.round(L.floor);
    switch (L.state) {
      case 'opening':
        L.doorK = Math.min(1, L.doorK + dt / 1.1);
        if (L.doorK === 1) setLift(L, 'open');
        break;
      case 'open':
        if ((mine.goal !== null && inside && !door && L.t > 0.6) || (!inside && !door && L.t > 4)) setLift(L, 'closing');
        break;
      case 'closing':
        L.doorK = Math.max(0, L.doorK - dt / 1.3);
        if (door) setLift(L, 'opening');
        else if (L.doorK === 0) setLift(L, 'parked');
        break;
      case 'parked':
        if (inside && mine.goal !== null) travelTo(L, mine.goal);
        else if (!inside && here === 48 && !away) release(L);
        break;
      case 'travel':
        mine.k = Math.min(1, mine.k + dt / mine.dur);
        L.floor = lerp(mine.from, mine.to, ease(mine.k));
        if (mine.k === 1) {
          L.floor = mine.to; L.dir = 0; mine.goal = null; ctx.sfx.hum(false);
          for (const P of carPanels()) paintPanel(P, null);
          ctx.sfx.ding(L.at, true); setLift(L, 'opening');
          if (away) toast(`<b>${away.title.toUpperCase()}</b> · ${floorName(away.n)}`);
        }
        break;
    }
  }
  function myLift() {
    if (mine.call && !mine.L) {   // the nearest car nobody else needs (one already here first) comes for you
      const L = lifts.filter(spare).sort((a, b) => Math.abs(a.floor - 48) - Math.abs(b.floor - 48) ||
        Math.abs(a.z - ctx.player.z) - Math.abs(b.z - ctx.player.z))[0];
      if (L) {
        mine.call = false; mine.L = L; L.player = true; mine.goal = null;
        if (L.state === 'home') { ctx.sfx.ding(L.at, true); setLift(L, 'opening'); }
        else if (L.state === 'away') travelTo(L, 48);
        else if (L.state === 'closing') setLift(L, 'opening');
      }
    }
    const L = mine.L;
    const F = away;
    if (!F?.leaves || !L) return;   // (inside a repo there's no lift)
    const e = ease(L.doorK);
    F.leaves.forEach((m, i) => { m.position.z = (i ? 1 : -1) * (DOOR.w / 4 + e * DOOR.w * 0.48); });
    Object.assign(F.ind, { floor: L.floor, dir: L.dir }); paintIndicator(F.ind);
    F.callM.emissiveIntensity = L.state === 'opening' ? 2.5 : 0;
  }
  function resetLift() {   // leaving the 3D view: you're back at your desk and the car goes back to the sessions
    mine.call = false;
    if (mine.L) release(mine.L);
    ctx.sfx.hum(false);
    ctx.setFloor(null);
  }
  // Your car while it's yours: its walls, and the doorway while the doors are open (the core's collider rules otherwise).
  // The car is a box you get into only through its open doorway: once in, `held` keeps you while you're anywhere in the
  // shaft's footprint (a step out through a wall, up to 0.43 m sprinting at the frame cap, is still in). Beside or behind
  // the shaft (the freestanding ones on the other floors), or at shut doors, the shaft's own collider rules, so a long step
  // never lands you inside. Arriving from more than a metre away in one go (goFloor, a teleport), the car's own box counts.
  let held = false, was = null;
  function carCollide(p) {
    const L = mine.L;
    if (!L || ctx.away?.liftGone) { was = null; return (held = false); }
    const r = 0.25, front = LIFT.x + 0.1, open = L.doorK > 0.75, half = DOOR.w / 2 - r, off = Math.abs(p.z - L.z),
      jumped = !was || Math.hypot(p.x - was.x, p.z - was.z) > 1,
      inCar = p.x > front && (held ? p.x < front + CAR.d + 0.2 && off < CAR.w / 2 + 0.3 : jumped && p.x < front + CAR.d && off < CAR.w / 2);
    held = false; was = { x: p.x, z: p.z };
    if (!inCar && !(open && p.x > LIFT.x - 0.6 && p.x < front + r && off < DOOR.w / 2)) return false;
    if (!inCar && p.x < LIFT.x - r) return true;   // in front of the open doors: nothing to bump into
    p.x = Math.min(p.x, front + CAR.d - r);
    p.z = clamp(p.z, L.z - CAR.w / 2 + r, L.z + CAR.w / 2 - r);
    if (!open) p.x = Math.max(p.x, front + 0.05 + r);
    else if (p.x < front + r && Math.abs(p.z - L.z) > half) {   // a jamb: push out the shorter way
      const dz = Math.abs(p.z - L.z) - half, dx = front + r - p.x;
      if (dx < dz) p.x = front + r; else p.z = L.z + Math.sign(p.z - L.z) * half;
    }
    held = true; was = { x: p.x, z: p.z };
    return true;
  }
  Object.assign(ctx, { ARCHIVE, mine, FLOORS, hitBox, addFloor, inMyCar, spare });
  Object.defineProperty(ctx, 'away', { get: () => away, set: (v) => { away = v; }, enumerable: true });
  const liftHover = (h) => {
    const L = mine.L, f = h.floor;
    return h.action === 'liftpanel' ? `<b>${floorName(f)} · ${FLOORS.find((F) => F.n === f)?.title}</b><div class="k">${!L || L.state === 'travel' ? '' : f === Math.round(L.floor) ? 'You’re here · click to open the doors' : mine.goal === f ? 'On its way' : 'Click to go'}</div>`
      : `<b>Lift</b><div class="k">${mine.call ? 'Called · waiting for a free car' : L && (L.state === 'open' || L.state === 'opening') ? 'Doors open · walk in' : L?.state === 'travel' ? 'On its way' : 'Click to call it'}</div>`;
  };
  ctx.action('liftcall', { hover: liftHover, click: () => callLift() });
  ctx.action('liftpanel', { hover: liftHover, click: (h) => pressFloor(h.floor) });
  ctx.hoverTargets(() => [lifts.callHit, ...lifts.map((L) => L.panel.mesh)], 10);
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function installShafts(ctx) {
  const { CAR, DOOR, ARCHIVE, hitBox, carPanel, paintPanel, cssRenderer, mine, tvQuiet, container, renderer, hemi, scene, camera } = ctx;
  Object.assign(ctx, { setFloor, liftShaft, renderFloor });
  // Another floor's car: a freestanding stone shaft and the same car as the office's, facing -x at LIFT.x about z = 0, with
  // its own doors, hall lantern, call button and floor panel (moved onto your car's z when you arrive, see setFloor).
  function liftShaft() {
    const lift = new THREE.Group(), fx = LIFT.x + 0.05, front = LIFT.x + 0.1, cx = front + CAR.d / 2, back = front + CAR.d, sw = CAR.w / 2 + 0.3, top = ROOM.h;
    const stone = [[0.1, top, sw - DOOR.w / 2, fx, top / 2, -(sw + DOOR.w / 2) / 2], [0.1, top, sw - DOOR.w / 2, fx, top / 2, (sw + DOOR.w / 2) / 2],
      [0.1, top - DOOR.h, DOOR.w, fx, (top + DOOR.h) / 2, 0],
      [back + 0.2 - front, top, 0.3, (front + back + 0.2) / 2, top / 2, -sw + 0.15],
        [back + 0.2 - front, top, 0.3, (front + back + 0.2) / 2, top / 2, sw - 0.15],
      [0.2, top, CAR.w, back + 0.1, top / 2, 0], [back + 0.2 - front, top - CAR.h - 0.04, CAR.w, (front + back + 0.2) / 2, (top + CAR.h + 0.04) / 2, 0]];
    // panel joints, not across the doorway
    for (let y = 0.9; y < top;
      y += 0.9) for (const s of y > DOOR.h ? [0] :
      [-1, 1]) stone.push([0.012, 0.006, s ? sw - DOOR.w / 2 - 0.08 : sw * 2, LIFT.x - 0.001, y, s * (sw + DOOR.w / 2 + 0.08) / 2]);
    lift.add(mergedBoxes(stone.map((b) => [...b, b[1] === 0.006 ? '#5d5852' : '#77716a']), mat('#ffffff', { vertexColors: true, roughness: 0.55 })));
    const steel = [[0.05, 0.08, DOOR.w + 0.16, LIFT.x - 0.02, DOOR.h + 0.04, 0], [0.34, 0.012, DOOR.w, fx + 0.02, 0.006, 0],
      [0.04, 0.26, 0.56, LIFT.x - 0.02, 2.5, 0],
      [0.02, 0.38, 0.15, LIFT.x - 0.01, 1.1, DOOR.w / 2 + 0.3], [back + 0.24 - LIFT.x, 0.03, sw * 2 + 0.02, (LIFT.x + back + 0.24) / 2, top + 0.015, 0]];
    for (const s of [-1, 1]) steel.push([0.05, DOOR.h + 0.08, 0.08, LIFT.x - 0.02, (DOOR.h + 0.08) / 2, s * (DOOR.w / 2 + 0.04)]);
    const steelM = ctx.liftSteelM;   // the office's brushed steel, so doors and surrounds match on every floor
    lift.add(mergedBoxes(steel, steelM));
    const car = [[CAR.d, 0.02, CAR.w, cx, 0.01, 0, '#2c2b2a'], [CAR.d, 0.04, CAR.w, cx, CAR.h, 0, '#232426'],
      [0.04, CAR.h, CAR.w, back, CAR.h / 2, 0, '#8a6446'],
      [0.035, 0.035, CAR.w - 0.2, back - 0.06, 0.95, 0, '#dfe2e5'], [0.02, 0.4, 0.16, LIFT.x + 0.35, 1.2, CAR.w / 2 - 0.03, '#5a5f66']];
    for (const s of [-1, 1]) car.push([CAR.d, CAR.h, 0.04, cx, CAR.h / 2, s * CAR.w / 2, '#aeb4ba'],
      [CAR.d - 0.3, 0.035, 0.035, cx + 0.1, 0.95, s * (CAR.w / 2 - 0.06), '#dfe2e5']);
    lift.add(mergedBoxes(car, mat('#ffffff', { vertexColors: true, roughness: 0.45, metalness: 0.35 })),
      mergedBoxes([[0.01, 1.05, CAR.w - 0.3, back - 0.025, 1.65, 0]], mat('#dfe4e8', { metalness: 1, roughness: 0.05 })),
      mergedBoxes([[CAR.d - 0.5, 0.01, CAR.w - 0.45, cx, CAR.h - 0.025, 0]],
        new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3df', emissiveIntensity: 1.6 })));
    const leaves = [-1,
      1].map((s) => box(lift, 0.03, DOOR.h, DOOR.w / 2 + 0.01, '', LIFT.x + 0.13, DOOR.h / 2, s * DOOR.w / 4, { material: steelM, shadow: false }));
    const ind = { ind: makeScreen(lift, 0.48, 0.2, 192, 80, LIFT.x - 0.045, 2.5, 0), floor: ARCHIVE, dir: 0 };
    ind.ind.mesh.rotation.y = -Math.PI / 2;
    const callM = new THREE.MeshStandardMaterial({ color: '#e6e3dc', emissive: '#ffb347', emissiveIntensity: 0, roughness: 0.4 });
    for (const y of [1.16, 1.04]) cyl(lift, 0.026, 0.026, 0.02, '', LIFT.x - 0.025, y, DOOR.w / 2 + 0.3,
      { material: y > 1.1 ? mat('#e6e3dc', { roughness: 0.4 }) : callM, seg: 16, shadow: false }).rotation.z = Math.PI / 2;
    const callHit = hitBox(lift, 0.06, 0.42, 0.22, LIFT.x - 0.03, 1.1, DOOR.w / 2 + 0.3, { action: 'liftcall', reach: 2.5 });
    const panel = carPanel(lift, 0); paintPanel(panel, null);
    return { lift, leaves, ind, callM, callHit, panel };
  }
  // Going to (F) or leaving (null) another floor, behind closed doors.
  function setFloor(F) {
    if (ctx.away === F) return;
    if (ctx.away) { ctx.away.on = false; ctx.away.leave?.(); }
    ctx.away = F;
    if (F) {
      F.on = true; F.out = 0;
      F.enter(mine.L.z); F.scene?.updateMatrixWorld();
      tvQuiet();
    }
    cssRenderer.domElement.style.visibility = F ? 'hidden' : '';
    ctx.sfx.setAway(!!F, F?.sound);
  }
  // Inside the car it's lit like the office car upstairs; stepping out of the doorway, your eyes adjust to the floor's own `look`:
  // exposure, hemisphere light, environment and extra lights, and the office's bloom and grade scaled by look.bloom/grade.
  function renderFloor(F) {
    const w = container.clientWidth, h = container.clientHeight, L = F.look;
    if (!F.composer) {
      const c = F.composer = new EffectComposer(renderer);
      c.setPixelRatio(renderer.getPixelRatio());
      c.addPass(new RenderPass(F.scene, camera));
      const ao = F.gtao = new GTAOPass(F.scene, camera, 512, 512);
      ao.blendIntensity = 0.8;
      ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 12 });
      if (L.aoSkip1) { const aoRender = ao.render.bind(ao); ao.render = (...a) => { camera.layers.disable(1); aoRender(...a); camera.layers.enable(1); }; }
      F.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), ctx.bloom.strength, ctx.bloom.radius, ctx.bloom.threshold);
      F.grade = new ShaderPass(ctx.grade.material.clone());
      c.addPass(ao); c.addPass(F.bloom); c.addPass(new OutputPass()); c.addPass(F.grade);
      c.setSize(w, h);
    }
    F.gtao.enabled = ctx.quality;
    // Only the car itself is office-lit: the switch happens across the doorway (0.4 m inside to 0.3 m out), eased over ~1 s,
    // so walking up to the lift from the floor (or round the back of it) never dims anything.
    const P = ctx.player, byCar = !!mine.L && P.x < LIFT.x + 0.3 + CAR.d && Math.abs(P.z - mine.L.z) < CAR.w / 2 + 0.3;
    F.out = F.carless || F.liftGone ? 1 : damp(F.out ?? 0, byCar ? clamp((LIFT.x + 0.4 - P.x) / 0.7, 0, 1) : 1, 3, 1 / 60);
    const k = ease(F.out);
    renderer.toneMappingExposure = lerp(ctx.officeExposure, L.exposure, k);
    F.hemi.intensity = lerp(hemi.intensity, L.hemi, k);
    F.hemi.color.copy(hemi.color).lerp(L.sky, k); F.hemi.groundColor.copy(hemi.groundColor).lerp(L.ground, k);
    for (const [light, v] of L.lights) light.intensity = v * k;
    F.bloom.strength = ctx.bloom.strength * lerp(1, L.bloom, k); F.bloom.enabled = ctx.quality && F.bloom.strength > 0.004;
    F.grade.enabled = ctx.quality; F.grade.uniforms.amount.value = lerp(1, L.grade, k);
    F.scene.environmentIntensity = lerp(scene.environmentIntensity, L.env, k);
    F.composer.render();
    renderer.setRenderTarget(null);
    const gl = renderer.getContext();   // full alpha everywhere: no dashboard hole down here (see renderFrame)
    gl.colorMask(false, false, false, true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.colorMask(true, true, true, true);
    renderer.state.buffers.color.reset();
  }
}
