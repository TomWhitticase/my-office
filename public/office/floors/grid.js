// THE GRID (unlisted, carless): the third dimension behind a bookcase on the restricted level (B3). In from B3 through a
// stretch of wall that gives (grid-door.js), you're out of the flat, drawn world into mid-90s raytraced CGI: a black
// void over a glowing green grid to the horizon, glossy primitives, maths hanging in the air (grid-world.js), an eerie
// synth score (grid-sound.js). Something here wants poking: the little cone. Throw it into the floor and the floor tears
// into a swirling black hole that swallows everything near it and pulls on you; walk out the way you came, or wait, and
// it heals (grid-hole.js). Its own scene, its own floor (N = -6), reached only through that wall; your car waits on B3.
// Nothing's built till you first come near the doorway on B3 (or a reload brings you back in here); nothing runs
// unless you're in here or looking in.
// Debug: window.__office.grid: .go(x, z, yaw, pitch) stands you in here (its own space: the doorway at the origin, the
// world toward -z, yaw 0 facing it), .door(x, z, yaw, pitch) stands you on B3 at the doorway (x along the wall, z out
// from it, yaw 0 facing it), .open(v) the wall given that far, .tear(sec, x, z) the black hole now (sec seconds in),
// .heal() everything back, .ending(sec) the hole taking you, sec seconds on (grid-ending.js), .bookcase(open) the bookcase against the wall (false) or pulled out (true, or 0 to 1), .build() builds it now.

import * as THREE from 'three';
import { clamp, EYE, rng, sstep } from '../util.js';
import { buildWorld, CELL } from './grid-world.js';
import { makeHole } from './grid-hole.js';
import { installDoor, findGridDoor } from './grid-door.js';
import { makeSound } from './grid-sound.js';
import { makeEnding } from './grid-ending.js';
import { makeWarm } from '../systems/warm.js';

const N = -6, BOUND = 70;

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const restr = ctx.restr, { camera, mine } = ctx;
  const grid = { n: N, label: 'GRID', title: 'The grid', unlisted: true, carless: true, liftGone: true, home: -3, on: false, composer: null,
    colliders: [], hits: [], sound: { kind: 'grid', steps: true }, look: { exposure: 1, bloom: 1, grade: 1 }, z0: 0, caseOut: 0 };
  let W = null, hole = null, door = null, sound = null, ending = null;
  // Its doorway's cell, and the one behind its wall, are kept clear of B3's wandering things (Hale's, the stone door).
  const spot = findGridDoor(restr);
  restr.reserved ||= new Set();
  restr.reserved.add(`${spot.spot.i},${spot.spot.j}`).add(`${spot.spot.back[0]},${spot.spot.back[1]}`);
  restr.hidden.add('grid', () => spot);   // a worn trail to it, and a warp on the map (restricted-paths.js)
  // Whether the bookcase is pulled out, kept with B3's own state through a reload (systems/resume.js), built or not.
  const save0 = restr.save, restore0 = restr.restore;
  restr.save = () => { const s = save0 ? save0() : undefined; return s === false ? s : grid.caseOut ? { ...s, gridCase: 1 } : s; };
  restr.restore = (s, p) => { grid.caseOut = s?.gridCase ? 1 : 0; door?.bookcase(grid.caseOut); return restore0?.(s, p); };

  // Built a step a frame as you come near the doorway on B3 (the world a piece at a time, then its sound, the hole and the
  // ending, then the doorway: none more than a few tens of milliseconds), or the rest of it at once when it's wanted now.
  // (three takes a uuid from Math.random for every object: built under its own seed, the same stream across the steps, so
  // nothing after this shifts.)
  let built = false, steps = null;
  const seeded = rng(1995);
  function* building() {
    const it = buildWorld(ctx);
    let r;
    while (!(r = it.next()).done) yield;
    W = r.value;
    Object.assign(grid, { scene: W.scene, hemi: W.hemi, look: W.look });
    yield;
    sound = makeSound(ctx);
    hole = makeHole(ctx, W, sound, () => ending.start());
    ending = makeEnding(ctx, grid, W, hole, sound);
    grid.hits = [...W.hits, hole.cone];
    yield;
    door = installDoor(ctx, grid, W, sound, () => warm());
  }
  function step(all = false) {
    if (built) return;
    steps ||= building();
    const random = Math.random;
    Math.random = seeded;
    try {
      let r;
      do r = steps.next(); while (all && !r.done);
      built = !!r.done;
    } finally { Math.random = random; }
    if (built && grid.caseOut) warm();
  }
  const build = () => step(true);
  // Everything got ready to be seen in the background (systems/warm.js: the world, the hole's funnel, the doorway's panes)
  // before it's first seen, so nothing hitches as the wall gives, as you step through, or the first time you turn round in
  // here: from when the bookcase starts to come out (it takes longer than this does), or as you come in some other way.
  // Then the floor's composer is made and drawn once, under a frame on B3, so its passes' programs are ready too; then the
  // ending's (grid-ending.js).
  let warmed = 0, warmTick = null;   // 0 not yet, 1 getting ready, 2 the ending getting ready (grid-ending.js), 3 done
  function warm() {
    if (warmed || !built) return;
    warmed = 1;
    warmTick = makeWarm(ctx.renderer, [W.scene, door.inP.warmScene(), door.outP.warmScene()]);
  }
  grid.prepare = () => { build(); return true; };   // (a reload in here: systems/resume.js)

  // ----- the floor -----
  let wisp = 0, drawnAt = -1e9;
  // Once a frame, in here or looking in: its things, the sky coming up the first few seconds it's seen; walk: you're
  // in here (the hole pulls on you).
  let tickAt = -1;
  grid.tick = (dt, t, eye, walk) => {
    if (tickAt === t) return;
    tickAt = t;
    if (t - drawnAt > 30) wisp = 0;
    drawnAt = t;
    wisp = Math.min(1, wisp + dt / 6);
    W.U.wisp.value = sstep(0, 1, wisp);
    W.update(dt, t, eye);
    hole.update(dt, t, walk);
  };
  grid.enter = (z) => {
    build();
    grid.z0 = z;
    warm();
    if (door.st.c < 1) door.bookcase(1);   // (you came in by it: it's out)
    if (!door.st.crossing) Object.assign(ctx.player, { x: 0, z: -1.4, yaw: 0, pitch: 0, eye: EYE, fy: 0, seated: false, seat: null });   // (not through the wall: in front of it)
  };
  grid.leave = () => { hole?.reset(); sound?.stop(); };
  grid.bound = (p) => { const r = Math.hypot(p.x, p.z); if (r > BOUND) { p.x *= BOUND / r; p.z *= BOUND / r; } };
  grid.ground = (x, z) => hole?.ground(x, z) || 0;
  grid.pick = () => (hole?.held ? { action: 'gridcone' } : null);   // (once it's poked you, whatever you're looking at)
  grid.save = () => (hole?.on ? false : {});   // (never mid-tear: a reload puts you back where it last was calm)
  grid.fx = (dt, t) => {
    grid.tick(dt, t, camera.position, true);
    // what you can walk into: the temple, the pond, the signpost, the things where they are now, the throat
    const cols = W.statics.filter((b) => !b.thing.moved && !b.thing.taken);
    for (const th of W.things) {
      if (!th.half || th.taken || !th.o.visible || th.o.position.y - (hole.on ? hole.ground(th.o.position.x, th.o.position.z) : 0) > 1.2) continue;
      cols.push({ minX: th.o.position.x - th.half[0], maxX: th.o.position.x + th.half[0], minZ: th.o.position.z - th.half[1], maxZ: th.o.position.z + th.half[1] });
    }
    grid.colliders = cols.concat(hole.cols());
    ctx.renderer.shadowMap.needsUpdate = true;   // (things bob and turn)
    sound.fx(dt, t, hole.strength, hole.st.at);
  };
  grid.map = () => {
    const c = ctx.mapCtx, MW = 440, MH = 330, K = 9, cx = MW / 2, cy = MH / 2 + 10, px = camera.position.x, pz = camera.position.z;
    c.clearRect(0, 0, MW, MH);
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, MW, MH);
    c.strokeStyle = 'rgba(40,220,60,.45)'; c.lineWidth = 1;
    const step = CELL * 5;
    for (let x = Math.floor((px - 30) / step) * step; x < px + 30; x += step) { c.beginPath(); c.moveTo(cx + (x - px) * K, 0); c.lineTo(cx + (x - px) * K, MH); c.stroke(); }
    for (let z = Math.floor((pz - 25) / step) * step; z < pz + 25; z += step) { c.beginPath(); c.moveTo(0, cy + (z - pz) * K); c.lineTo(MW, cy + (z - pz) * K); c.stroke(); }
    c.fillStyle = 'rgba(120,180,255,.95)'; c.fillRect(cx - px * K - 0.5 * K, cy - pz * K - 2, K, 4);   // the doorway
    if (hole.on) { c.fillStyle = '#000'; c.strokeStyle = 'rgba(40,220,60,.9)'; c.beginPath(); c.arc(cx + (hole.st.at.x - px) * K, cy + (hole.st.at.z - pz) * K, 2 + hole.strength * 30, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.save(); c.translate(cx, cy); c.rotate(-ctx.player.yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.restore();
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('X · Y · Z', 16, 30);
  };
  ctx.addFloor(grid);

  // ----- built as you first come near the doorway on B3; the doorway's frame (and the hole) each frame; the score
  // stopped if you're taken out of here any way but a door (the menu's way back to your desk) -----
  ctx.onFrame((dt, t) => {
    if (!built) {
      if (ctx.away === restr && (steps || Math.hypot(ctx.player.x - spot.X, ctx.player.z - spot.Z - restr.z0) < 45)) step();
      return;
    }
    if (ctx.away === restr || ctx.away === grid) {
      if (warmed === 1 && warmTick()) {
        warmed = 2; warmTick = ending.warm();
        if (ctx.away !== grid) { ctx.renderFloor(grid); ctx.renderFloor(grid); }   // (to the canvas, drawn over this frame)
      } else if (warmed === 2 && warmTick()) { warmed = 3; warmTick = null; }
    }
    if (ctx.away === restr || ctx.away === grid) door.frame(dt, t);
    else if (sound.playing || hole.on) { sound.stop(); hole.reset(); sound.buzz(0); sound.bleed(0); }
  }, 196);

  // ----- what you can point at -----
  ctx.action('gridthing', { hover: (h) => h.info });
  ctx.action('gridcone', {
    hover: () => (hole.st.cone === 'held' ? '<b>A cone</b><div class="k">It poked you. Click or <kbd>E</kbd> to throw it</div>'
      : '<b>A cone</b><div class="k">Small, silver, drifting about at head height. Click to throw it</div>'),
    click: () => { hole.throwIt(); return true; },
  });
  // Held, a click anywhere throws it, the mouse caught or not (player.js only catches it on that click); or E.
  ctx.renderer.domElement.addEventListener('click', () => { if (ctx.away === grid && ctx.mode === 'free' && hole.held) hole.throwIt(); });
  ctx.key('KeyE', () => ctx.away === grid && (hole.held || ctx.hover?.action === 'gridcone') && hole.throwIt());

  // ----- for the tests and for looking -----
  const ensureCar = () => {   // (your car parked on B3, as if you'd come down in it)
    if (mine.L) return true;
    const L = ctx.lifts.find(ctx.spare);
    if (!L) return false;
    Object.assign(mine, { L, call: false, goal: null }); L.player = true;
    L.floor = -3; L.dir = 0; L.doorK = 0; ctx.setLift(L, 'parked');
    return true;
  };
  const pose = (x, z, yaw, pitch) => {
    Object.assign(ctx.player, { x, z, yaw, pitch, eye: EYE, fy: 0, seated: false, seat: null });
    ctx.mode = 'free';
    ctx.setCam({ x, y: EYE, z, yaw, pitch });
  };
  ctx.grid = {
    build: () => { build(); return true; },
    get W() { return W; }, get hole() { return hole; }, get doorway() { return door; }, spot,
    go(x = 0, z = -1.4, yaw = 0, pitch = 0) {
      if (!ensureCar()) return false;
      build();
      if (ctx.away !== grid) ctx.setFloor(grid);
      pose(x, z, yaw, pitch);
      return true;
    },
    door(x = 0, z = 2.5, yaw = 0, pitch = 0) {
      if (!ensureCar()) return false;
      build();
      const [bx, bz] = door.toB3(x, z), wz = bz + mine.L.z;
      if (ctx.away !== restr) { restr.arriveAt = { x: bx, z: bz }; ctx.setFloor(restr); restr.out = 1; }
      pose(bx, wz, door.YAW + yaw, pitch);
      return true;
    },
    open(v = 1) { build(); door.open(clamp(v, 0, 1)); restr.sync(); return true; },
    bookcase(v = 1) { build(); door.bookcase(v === true ? 1 : v === false ? 0 : clamp(+v, 0, 1)); return true; },
    tear: (sec = 0, x, z) => (ctx.away === grid ? hole.tear(sec, x, z) : false),
    heal: () => { hole?.reset(); return true; },
    ending: (sec = 0) => { if (!ctx.grid.go(0.5, -6, 0, -0.1)) return false; return ending.stage(sec); },
    get end() { return ending; },
  };
}
