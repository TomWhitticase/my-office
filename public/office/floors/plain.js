// THE PLAIN: behind a painting on the restricted level (B3, restricted.js). In a dim hall deep in B3, on the end wall, a
// small dark oil painting in an old gilt frame: an ochre plain under a burning sky, a city on fire far off, a black
// square hanging over it, and in front, crouched in the dust, something with a bandaged head (plain-painting.js has
// where, the frame and the paint). From across the room it's a picture. Closer, the paint has depth: the haze moves,
// the embers drift, and the thing in it turns its head to you and goes. Walk into it and you're there.
// It's seamless both ways (systems/portal.js): the painting is a window, drawn as paint while you're off it and clean as
// you reach it, the two floors' looks and sounds meeting at its plane; behind you, out there, the same frame hangs in the
// air with B3 through it (and from behind, the back of a canvas), and you walk back out the way you came.
// Out there (plain-world.js): the plain, endless, the city that's always as far away, the lamp, the table and chest, the
// gazebo, the bones. The thing hunts you (plain-crawler.js), and never quite gets you. The sound (plain-sound.js): wind,
// fire, people screaming and calling for help a long way off, metal, a whisper just behind your head. Over all of it, its
// own painted look (plain-painting.js makePaintPass).
// Its own unlisted, carless floor; your car waits on B3. Nothing of it is built until you first come near the painting
// (or a reload puts you out there), and nothing of it runs unless you're out there or looking in.
// Debug: ctx.plain (window.__office.plain): .go(x, z, yaw, pitch) stands you out there (the frame's at the origin, its
// plane z = 0, the way in toward -z; yaw 0 faces the city), .painting(x, z, yaw, pitch) on B3 in front of it (x across,
// z out from it into the room; yaw 0 faces it), .crawler(d) sets it on you from d m ahead, .stage(x, z, yaw, rise) puts it
// there looking at you (rise 1: risen up).

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { EYE, lerp, rng, sstep } from '../util.js';
import { makePortal } from '../systems/portal.js';
import { findPainting, makeFrame, paintPane, paintPassShader, PAINT } from './plain-painting.js';
import { buildWorld } from './plain-world.js';
import { makeCrawler } from './plain-crawler.js';
import { makeSound } from './plain-sound.js';

const N = -5, NEAR = 32;   // built once you're this near the painting on B3
const { w: W, h: H, SILL, PO } = PAINT;

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three takes a uuid from Math.random for every object: what's made here takes them from its own stream, so it doesn't
  // shift what's built after it (see helicopter.js); the same when the rest is built later.
  const random = Math.random;
  Math.random = rng(1890);
  try { setup(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function setup(ctx) {
  const { camera, hud, style, mapCtx, addFloor, hitBox, renderer } = ctx;
  const restr = ctx.restr;
  const pl = { n: N, label: 'THE PLAIN', title: 'The Plain', unlisted: true, carless: true, liftGone: true, home: -3, on: false, composer: null,
    colliders: [], hits: [], scene: new THREE.Scene(), sound: { kind: 'plain', steps: true }, built: false };
  const at = findPainting(restr);
  // (Hale's things and the stone door are never put on this wall, or on its back: restricted-story.js, relativity-door.js)
  restr.reserved ||= new Set();
  restr.reserved.add(`${at.spot.i},${at.spot.j}`).add(`${at.spot.back[0]},${at.spot.back[1]}`);
  const st = { crossing: false, front: true, near: Infinity, t: 0 };
  let world = null, crawler = null, sound = null, g = null, pg = null, inP = null, outP = null, pass = null, inPaint = null, outPaint = null;
  const base = { b3: { exposure: restr.look.exposure, bloom: restr.look.bloom, grade: restr.look.grade }, pl: null };
  const flip = new THREE.Matrix4().makeRotationY(Math.PI);
  // A doorway's frame (portal.js): its sill's middle, +z through it the way you'd walk from the side it's seen from.
  // B3's: the painting seen from the room (b3), come out of (b3Out). Out here: the frame at the origin, the way in -z
  // (plIn), and back out toward B3, +z (plBack).
  const F = { b3: new THREE.Matrix4(), b3Out: new THREE.Matrix4(), plIn: new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, SILL, 0), plBack: new THREE.Matrix4().setPosition(0, SILL, 0) };
  const frames = () => { g.updateMatrixWorld(true); F.b3Out.copy(g.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0, 0, PO)); F.b3.copy(F.b3Out).multiply(flip); };

  // ----- built the first time it's wanted -----
  function build() {
    if (pl.built) return;
    pl.built = true;
    const random = Math.random;
    Math.random = rng(1891);
    try {
      const R = rng(1892);
      world = buildWorld(pl, R);
      base.pl = { exposure: pl.look.exposure, bloom: pl.look.bloom, grade: pl.look.grade };
      sound = makeSound(ctx);
      const near = (p) => ctx.away === pl && p.distanceTo(camera.position) < 40;
      crawler = makeCrawler(rng(1893), {
        tap: (p, s) => { if (near(p)) sound.tap(p, s); },
        shriek: (p) => { if (ctx.away === pl) sound.shriek(p); },
        charge: (p) => { if (ctx.away === pl) sound.charge(p); },
        notice: (p) => { if (st.near < 5) sound.creak(p); },
      });
      pl.scene.add(crawler.root);
      // the painting on B3, on its wall
      g = makeFrame(R);
      g.position.set(at.X, SILL, at.Z); g.rotation.y = at.YAW;
      restr.root.add(g);
      const hit = hitBox(g, W + 0.3, H + 0.3, 0.12, 0, H / 2, PO + 0.04, { action: 'plain-painting', reach: 4 });
      // and out here, hanging in the air: its face toward the way back (-z), the canvas's back behind it
      pg = makeFrame(R, { back: true });
      pg.position.set(0, SILL, PO); pg.rotation.y = Math.PI;
      pl.scene.add(pg);
      const back = hitBox(pg, W + 0.3, H + 0.3, 0.14, 0, H / 2, PO, { action: 'plain-frame', reach: 4 });
      pl.hits = [back];
      inP = makePortal(ctx, { w: W, h: H, flat: true }); outP = makePortal(ctx, { w: W, h: H, flat: true });
      restr.scene.add(inP.mesh); pl.scene.add(outP.mesh);
      inPaint = paintPane(inP); outPaint = paintPane(outP);
      pass = new ShaderPass(paintPassShader());
      frames();
      // on B3: the painting to point at; and its wall open across it while you're in front (so you can walk up into it)
      restr.extras.push({
        cols: () => [],
        hits: () => [hit],
        cut(list) {
          if (!st.front) return;
          const gap = box(F.b3Out, -W / 2, W / 2, -0.25, 0.02);
          const alongX = Math.abs(Math.cos(at.YAW)) > 0.5, [lo, hi, a, b2] = alongX ? ['minX', 'maxX', 'minZ', 'maxZ'] : ['minZ', 'maxZ', 'minX', 'maxX'];
          for (let k = list.length - 1; k >= 0; k--) {
            const b = list[k];
            if (b[hi] <= gap[lo] || b[lo] >= gap[hi] || b[b2] <= gap[a] || b[a] >= gap[b2]) continue;
            list.splice(k, 1);
            if (b[lo] < gap[lo]) list.push({ ...b, [hi]: gap[lo] });
            if (b[hi] > gap[hi]) list.push({ ...b, [lo]: gap[hi] });
          }
        },
      });
      restr.sync();
      // B3 heard through it: whichever's louder, this or the stone door's (relativity-door.js sets it every frame)
      const bleed0 = restr.audio.bleed;
      restr.audio.bleed = (v) => bleed0(Math.max(v, st.b3Bleed || 0));
    } finally { Math.random = random; }
  }
  // a box in a frame's own x (across) and z (out of it), in the world
  const bv = new THREE.Vector3();
  function box(m, x0, x1, z0, z1) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      bv.set(x, 0, z).applyMatrix4(m);
      minX = Math.min(minX, bv.x); maxX = Math.max(maxX, bv.x); minZ = Math.min(minZ, bv.z); maxZ = Math.max(maxZ, bv.z);
    }
    return { minX, maxX, minZ, maxZ };
  }
  // Watching for you coming near it on B3.
  ctx.onFrame(() => {
    if (pl.built || ctx.away !== restr) return;
    if (Math.hypot(ctx.player.x - at.X, ctx.player.z - restr.z0 - at.Z) < NEAR) build();
  }, 189);

  // ----- crossing -----
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const carry = (here, there) => { m4.copy(there).multiply(new THREE.Matrix4().copy(here).invert()); return pos.copy(camera.position).applyMatrix4(m4); };
  const pose = (x, z, yaw, pitch) => { Object.assign(ctx.player, { x, z, yaw, pitch, eye: EYE, fy: 0, seated: false, seat: null }); ctx.setCam({ x, y: EYE, z, yaw, pitch }); };
  function take() {   // carry your camera's pose across (m4, from carry) and stand there
    camera.updateMatrixWorld();
    q.setFromRotationMatrix(m4).multiply(camera.quaternion);
    eul.setFromQuaternion(q, 'YXZ');
    Object.assign(ctx.player, { x: pos.x, z: pos.z, yaw: eul.y, pitch: eul.x, eye: EYE, fy: 0, seated: false, seat: null });
    camera.position.copy(pos); camera.quaternion.copy(q); camera.updateMatrixWorld();
  }
  function intoPlain() {
    carry(F.b3, F.plIn);
    paintAt(0, st.t);   // (at the frame: none of the paint yet)
    st.crossing = true; ctx.setFloor(pl); st.crossing = false;
    take();
  }
  function outToB3() {
    carry(F.plBack, F.b3Out);
    restr.arriveAt = { x: pos.x, z: pos.z - restr.z0 };   // (its rooms built round the painting, not the lift)
    st.crossing = true; ctx.setFloor(restr); st.crossing = false;
    restr.out = 1;   // (no fading in from the car's light: you didn't come by lift)
    frames(); take();
  }

  // ----- the floor -----
  const R = rng(1894);
  const lit = (F2) => {   // lit as it's lit from inside, for a look through: its look in full
    const L = F2.look;
    if (F2.hemi) { F2.hemi.intensity = L.hemi; F2.hemi.color.copy(L.sky); F2.hemi.groundColor.copy(L.ground); }
    for (const [l, k] of L.lights) l.intensity = k;
    F2.scene.environmentIntensity = L.env;
    return null;
  };
  // the frame out here: you can't walk into its sides, nor through it from behind (from in front, it's the way back)
  const sides = [{ minX: -W / 2 - 0.15, maxX: -W / 2, minZ: -0.06, maxZ: 0.06 }, { minX: W / 2, maxX: W / 2 + 0.15, minZ: -0.06, maxZ: 0.06 }];
  const whole = [{ minX: -W / 2 - 0.15, maxX: W / 2 + 0.15, minZ: -0.02, maxZ: 0.06 }];
  style.textContent += `.of-plain .of-clock { font-size: 0 !important; } .of-plain .of-clock::after { content: '—'; font-size: 12px; }
    .of-plain .of-count { font-size: 0; } .of-plain .of-count::after { content: '·'; font-size: 12px; }`;
  pl.prepare = async () => { build(); return true; };
  pl.enter = () => {
    build();
    hud.classList.add('of-plain');
    pl.colliders = sides;
    if (st.crossing) return;
    pose(0, -2.4, 0, 0);   // (debug, a reload: in front of the frame, the city ahead)
    crawler.hide(12 + R() * 8);
  };
  pl.leave = () => { hud.classList.remove('of-plain'); sound?.stop(); outP?.hide(); };
  pl.bound = () => {};
  pl.save = () => ({});
  pl.restore = (s, p) => {
    pose(p.x, p.z, p.yaw, p.pitch);
    if (Math.abs(p.z) < 0.4 && Math.abs(p.x) < W / 2 + 0.5) pose(p.x, -0.8, p.yaw, p.pitch);   // (never in the frame)
    return true;
  };
  pl.fx = (dt, t) => {
    paintAt(pass.uniforms.amount.value, t);
    world.view(camera.position, t);
    const fw = camera.getWorldDirection(fwd);
    crawler.update(dt, t, { x: camera.position.x, z: camera.position.z, fx: fw.x / (Math.hypot(fw.x, fw.z) || 1), fz: fw.z / (Math.hypot(fw.x, fw.z) || 1), d: -camera.position.z }, true, false);
    // behind the frame it's solid across; in front, only its sides
    const front = camera.position.z < 0;
    if (front !== st.plFront) { st.plFront = front; pl.colliders = front ? sides : whole; }
    sound.fx(dt, t);
  };

  // ----- each frame on either side: what's through it, going through, the looks and sounds meeting -----
  const last = new THREE.Vector3(), v = new THREE.Vector3(), inv = new THREE.Matrix4(), fwd = new THREE.Vector3(), mp = new THREE.Vector3();
  let lastAway = null, seenB3 = false, drawn = false, primed = false, wasU = 0, bl = 0;
  // how far the camera is from the opening (frame f), in front of it only (or just through it)
  const dist = (f) => { v.copy(camera.position).applyMatrix4(inv.copy(f).invert()); return v.z > 0.5 ? Infinity : Math.hypot(Math.max(0, Math.abs(v.x) - W / 2), Math.max(0, v.y - H, -v.y), v.z); };
  // just through, facing on: it's behind you, nothing of it to draw
  const away = (f, d) => d < 0.4 && camera.getWorldDirection(fwd).dot(v.setFromMatrixColumn(f, 2)) < 0;
  const KEYS = ['exposure', 'bloom', 'grade'];
  function blend(u) {
    for (const k of KEYS) { pl.look[k] = lerp(base.pl[k], base.b3[k], u / 2); if (u > 0 || wasU > 0) restr.look[k] = lerp(base.b3[k], base.pl[k], u / 2); }
    wasU = u;
  }
  ctx.onFrame((dt, t) => {
    const A = ctx.away, side = pl.built && A === restr ? 'b3' : pl.built && A === pl ? 'pl' : null;
    st.t = t;
    if (side !== 'b3') inP?.hide();
    if (side !== 'pl') outP?.hide();
    st.b3Bleed = 0;
    if (!side) { lastAway = null; seenB3 = false; st.near = Infinity; if (pl.built && sound) { bl = Math.max(0, bl - dt / 2.5); sound.bleed(bl); } return; }
    camera.updateMatrixWorld();
    if (lastAway !== A) { last.copy(camera.position); lastAway = A; }
    let u = 0, hear = 0;
    if (side === 'b3') {
      frames();
      const d = dist(F.b3);
      st.near = d;
      // in front of its wall (the room it's in, not the one behind it): the wall's open across it
      v.copy(camera.position).applyMatrix4(inv.copy(F.b3Out).invert());
      const front = v.z > -0.05;
      if (front !== st.front) { st.front = front; restr.sync(); }
      if (d < 40) {
        // out there, as seen from here: the world round where you'd be, and the thing in the painting
        carry(F.b3, F.plIn); mp.copy(pos);
        world.view(mp, t);
        crawler.update(dt, t, { x: mp.x, z: mp.z, fx: 0, fz: -1, d }, false, drawn);
        inPaint.value = sstep(1.2, 4, d);
        if (d < 6 && !primed) { primed = true; prime(); }
        u = sstep(5, 0, d); hear = 0.6 * sstep(8, 0, d);
        blend(u);   // (before it's drawn: k is the two exposures as they'll be drawn)
        drawn = inP.draw({ here: F.b3, there: F.plIn, scene: pl.scene, k: pl.look.exposure / restr.look.exposure, open: !away(F.b3, d), prepare: () => lit(pl) });
        if (inP.crossed(F.b3, last, camera.position) > 0) intoPlain();
      } else { inP.hide(); drawn = false; blend(0); }
    } else {
      const d = dist(F.plBack), zc = ctx.mine.L?.z ?? restr.z0;
      st.near = d;
      if (pass) pass.uniforms.amount.value = sstep(1.0, 4.0, Math.min(d, Math.hypot(camera.position.x, camera.position.y - SILL - H / 2, camera.position.z)));
      if (d < 120) {
        outPaint.value = sstep(1.2, 4, d);
        u = sstep(5, 0, d); hear = 0.6 * sstep(8, 0, d);
        blend(u);
        if (restr.z0 !== zc) restr.view(at.X, at.Z, t, zc, false);   // (B3 laid out from your car)
        frames();
        outP.draw({ here: F.plBack, there: F.b3Out, scene: restr.scene, k: restr.look.exposure / pl.look.exposure, open: !away(F.plBack, d),
          prepare: () => { carry(F.plBack, F.b3Out); restr.view(pos.x, pos.z - restr.z0, t, restr.z0, !seenB3); seenB3 = true; return lit(restr); } });
        if (outP.crossed(F.plBack, last, camera.position) > 0) outToB3();
      } else { outP.hide(); blend(0); }
    }
    last.copy(camera.position);
    // each side heard through the other: in as you come up to it, out slowly once you're through
    const want = ctx.away === restr ? hear : 0;
    bl = want > bl ? want : Math.max(want, bl - dt / 2.5);
    sound.bleed(bl);
    st.b3Bleed = ctx.away === pl ? hear : 0;
  }, 196);
  // Its post-processing made and drawn a couple of times before you first walk in: the first frames out of a new
  // composer are wrong. (Drawn to the canvas, under the frame that's drawn over it.)
  function prime() { ctx.renderFloor(pl); paintAt(0, 0); ctx.renderFloor(pl); ctx.renderFloor(pl); }
  // the paint over everything out here: on, sized, how much
  function paintAt(amount, t) {
    if (pl.composer && !pass.added) { pl.composer.addPass(pass); pass.added = true; }
    renderer.getDrawingBufferSize(pass.uniforms.res.value);
    pass.uniforms.amount.value = amount; pass.uniforms.time.value = t;
  }

  // ----- the map: dust, and which way the frame is -----
  pl.map = () => {
    const c = mapCtx, MW = 440, MH = 330, K = 3;
    c.clearRect(0, 0, MW, MH);
    c.fillStyle = 'rgba(150,104,52,.35)'; c.fillRect(0, 0, MW, MH);
    const dx = -camera.position.x, dz = -camera.position.z;
    let px = MW / 2 + dx * K, pz = MH / 2 + 10 + dz * K;
    const inside = px > 24 && px < MW - 24 && pz > 50 && pz < MH - 20;
    if (!inside) { const s = Math.min((MW / 2 - 24) / Math.abs(dx * K || 1e-6), (MH / 2 - 40) / Math.abs(dz * K || 1e-6)); px = MW / 2 + dx * K * s; pz = MH / 2 + 10 + dz * K * s; }
    c.fillStyle = 'rgba(214,176,96,.95)';
    if (inside) { c.fillRect(px - 6, pz - 2, 12, 4); c.font = '600 15px system-ui'; c.fillText('the frame', px + 10, pz + 5); }
    else { const a = Math.atan2(dz, dx); c.save(); c.translate(px, pz); c.rotate(a); c.beginPath(); c.moveTo(10, 0); c.lineTo(-6, -7); c.lineTo(-6, 7); c.fill(); c.restore(); }
    c.save(); c.translate(MW / 2, MH / 2 + 10); c.rotate(-ctx.player.yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('—', 16, 30);
  };

  ctx.action('plain-painting', { hover: () => (st.near < 1.6 ? '<b>The painting</b><div class="k">Warm air coming off it, and grit. Walk into it</div>'
    : '<b>A small oil painting</b><div class="k">Dust, a city burning, something crouched in the foreground. No name on it. The paint looks wet</div>') });
  ctx.action('plain-frame', { hover: () => (camera.position.z < 0 ? '<b>The painting</b><div class="k">B3 through it, the yellow rooms. Walk back into it</div>'
    : '<b>The back of a canvas</b><div class="k">Hanging in the air, from nothing</div>') });

  // ----- getting you there, for the tests and for looking -----
  function car() {   // your car, waiting on B3 (setFloor wants one)
    const { mine, lifts, spare } = ctx;
    if (mine.L) return true;
    const L = lifts.find(spare); if (!L) return false;
    Object.assign(mine, { L, call: false, goal: null }); L.player = true; L.floor = -3; L.dir = 0; L.doorK = 0; ctx.setLift(L, 'parked');
    return true;
  }
  ctx.plain = {
    pl, st, F, at, get built() { return pl.built; }, get crawlerS() { return crawler?.S; }, build,
    go(x = 0, z = -2.4, yaw = 0, pitch = 0) {
      build(); if (!car()) return false;
      if (ctx.away !== pl) ctx.setFloor(pl);
      pose(x, z, yaw, pitch); lastAway = null;
      return true;
    },
    painting(x = 0, z = 3, yaw = 0, pitch = 0) {
      build(); if (!car()) return false;
      if (ctx.away !== restr) { frames(); const p = box(F.b3Out, x, x, z, z); restr.arriveAt = { x: p.minX, z: p.minZ - restr.z0 }; ctx.setFloor(restr); restr.out = 1; }
      restr.out = 1; frames();   // (out of the car's light: as if you'd walked here)
      const p = box(F.b3Out, x, x, z, z), zx = F.b3Out.elements[8], zz = F.b3Out.elements[10];
      pose(p.minX, p.minZ, Math.atan2(zx, zz) + yaw, pitch); lastAway = null;
      return true;
    },
    crawler(d = 20) { if (ctx.away !== pl) return false; const f = camera.getWorldDirection(fwd), n = Math.hypot(f.x, f.z) || 1; crawler.charge({ x: ctx.player.x, z: ctx.player.z, fx: f.x / n, fz: f.z / n }, d); return true; },
    stage(x, z, yaw, rise = 0) { if (!crawler) return false; crawler.stage(x, z, yaw, rise); return true; },
    into: () => { frames(); intoPlain(); },
  };
  addFloor(pl);
}
