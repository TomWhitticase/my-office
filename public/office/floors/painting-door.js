// A painting on the restricted level (B3, restricted.js) that's a way onto a floor of its own, the way the Plain's is
// (plain.js): what every such painting shares, so each floor only brings its world, its frame and its paint.
// - findWall: a fixed wall in B3's fixed layout (restricted.js h3), worked out once like findExit
//   (world-edge-backstage.js): a cell some walk from the lift whose wall has a long room in front of it and a cell behind
//   it that's clear too, kept a distance from whatever else is on B3 (`away`).
// - makePaintingDoor: the frame on B3's wall and the same frame hanging in the air out there (its opening's sill's middle
//   at the origin, the picture's plane z = 0, the way in toward -z), seamless both ways (systems/portal.js: a flat
//   portal each side, painted while you're off it and clean as you reach it); B3's wall opened across it while you're in
//   front; crossing, the two floors' exposure, bloom and grade meeting at its plane, each heard through the other; the
//   floor's own look over its whole view (an optional ShaderPass, `amount` 0 at the frame); nothing built till you first
//   come within `near` of it on B3 (or a reload puts you out there); and the hooks to stand you either side.

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { EYE, lerp, rng, sstep } from '../util.js';
import { makePortal } from '../systems/portal.js';

/**
 * A wall for a painting, found from B3's fixed layout. dmin..dmax: cells' walk from the lift; dark: only in one of B3's
 * dark patches; sight: cells clear across the room from it; away: [[i, j, minimum cells]] kept from (B3's own cells);
 * reserved: skip cells already reserved (restr.reserved); fallback: { i, j, side, back } (never: the layout has one).
 * Returns { spot: { i, j, side, back, d }, X, Z, YAW }: the wall's face at the middle of that side (B3's own space, the
 * car at z = 0), and YAW the way out of it into the room.
 */
export function findWall(restr, { dmin, dmax, dark = false, sight: want = 10, away = [], reserved = false, fallback }) {
  const G = restr.grid, key = (i, j) => `${i},${j}`;
  const ways = (i, j) => [[i - 1, j, G.edgeType('v', i, j), 'w'], [i + 1, j, G.edgeType('v', i + 1, j), 'e'], [i, j - 1, G.edgeType('h', i, j), 's'], [i, j + 1, G.edgeType('h', i, j + 1), 'n']];
  const STEP = { w: [-1, 0], e: [1, 0], s: [0, -1], n: [0, 1] }, OPP = { w: 'e', e: 'w', s: 'n', n: 's' };
  const quiet = (i, j) => G.cellOk(i, j) && G.h3(i, j, 10) >= 0.03 && !(j === 0 && i >= -3 && i <= -1) && !(reserved && restr.reserved?.has(key(i, j)));   // nothing else in it
  const isDark = (i, j) => G.h3(Math.floor(i / 4), Math.floor(j / 4), 77) < 0.1;   // (restricted.js darkPatch)
  // how many cells straight across the room from the wall on side w of (i, j)
  const sight = (i, j, w) => {
    let n = 0;
    for (let ci = i, cj = j; n < 12; n++) { if (ways(ci, cj).find((x) => x[3] === OPP[w])[2] === G.SOLID) break; ci += STEP[OPP[w]][0]; cj += STEP[OPP[w]][1]; }
    return n;
  };
  const dist = new Map([[key(-1, 0), 0]]), q = [[-1, 0]];
  let spot = null;
  for (let h = 0; h < q.length && !spot; h++) {
    const [i, j] = q[h], d = dist.get(key(i, j));
    if (d >= dmin && d <= dmax && quiet(i, j) && (!dark || isDark(i, j)) && away.every(([ai, aj, m]) => Math.hypot(i - ai, j - aj) >= m)) {
      for (const [ni, nj, t, w] of ways(i, j)) if (t === G.SOLID && quiet(ni, nj) && sight(i, j, w) >= want) { spot = { i, j, side: w, back: [ni, nj], d }; break; }
    }
    for (const [ni, nj, t] of ways(i, j)) if (t !== G.SOLID && G.cellOk(ni, nj) && !dist.has(key(ni, nj))) { dist.set(key(ni, nj), d + 1); q.push([ni, nj]); }
  }
  spot ||= fallback;
  const cx = G.X(spot.i) + G.C / 2, cz = G.Z(spot.j) + G.C / 2, H2 = G.C / 2 - G.T / 2;
  const [X, Z, YAW] = { w: [cx - H2, cz, Math.PI / 2], e: [cx + H2, cz, -Math.PI / 2], s: [cx, cz - H2, 0], n: [cx, cz + H2, Math.PI] }[spot.side];
  return { spot, X, Z, YAW };
}

/**
 * @param {import('../ctx.js').OfficeCtx} ctx
 * @param {any} fl the floor (its scene, look, colliders; `on`, `built` are kept here)
 * @param {{
 *   at: { spot: any, X: number, Z: number, YAW: number }, size: { w: number, h: number, SILL: number, PO: number },
 *   key: string, near?: number, seed: number,
 *   build: (R: () => number) => { sound?: any, seen?: Function, fx?: Function, arrive?: Function, cols?: any[] },
 *   frame: (R: () => number, o: { back?: boolean }) => THREE.Object3D, paint: (portal: any) => { value: number },
 *   pass?: () => any, hover: { painting: (near: number) => string, frame: (front: boolean) => string },
 *   hud?: string, leave?: () => void,
 * }} o
 *   build(R): the world, made once (Math.random its own stream meanwhile); what it gives back: `sound` (bleed(v), stop()),
 *   `seen(p, dt, t, d, drawn)` the world as seen from B3 through the painting (p: where you'd be out there), `fx(dt, t)`
 *   each frame out there, `arrive()` stands you somewhere on arriving not through it, `cols` its colliders (a list it
 *   may change; call door.refresh() after).
 *   frame(R, { back }): the frame, sill's middle at the origin, the picture's plane z = PO, facing +z; back: seen from
 *   behind too. paint(portal): its pane made paint, returning the uniform (0 to 1) of how much.
 */
export function makePaintingDoor(ctx, fl, o) {
  const { camera, renderer, hitBox } = ctx, restr = ctx.restr, at = o.at, { w: W, h: H, SILL, PO } = o.size, NEAR = o.near ?? 32;
  // (Hale's things and the stone door are never put on this wall, or on its back: restricted-story.js, relativity-door.js)
  restr.reserved ||= new Set();
  restr.reserved.add(`${at.spot.i},${at.spot.j}`).add(`${at.spot.back[0]},${at.spot.back[1]}`);
  restr.hidden.add(o.key, () => at);   // a worn trail to it, and a warp on the map (restricted-paths.js)
  const st = { crossing: false, front: true, plFront: undefined, near: Infinity, t: 0, b3Bleed: 0 };
  let w = null, g = null, pg = null, inP = null, outP = null, pass = null, inPaint = null, outPaint = null, hit = null;
  const base = { b3: { exposure: restr.look.exposure, bloom: restr.look.bloom, grade: restr.look.grade }, pl: null };
  const flip = new THREE.Matrix4().makeRotationY(Math.PI);
  // A doorway's frame (portal.js): its sill's middle, +z through it the way you'd walk from the side it's seen from.
  // B3's: the painting seen from the room (b3), come out of (b3Out). Out there: the frame at the origin, the way in -z
  // (plIn), and back out toward B3, +z (plBack).
  const F = { b3: new THREE.Matrix4(), b3Out: new THREE.Matrix4(), plIn: new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, SILL, 0), plBack: new THREE.Matrix4().setPosition(0, SILL, 0) };
  const toPO = new THREE.Matrix4().makeTranslation(0, 0, PO);
  const frames = () => { g.updateWorldMatrix(true, true); F.b3Out.copy(g.matrixWorld).multiply(toPO); F.b3.copy(F.b3Out).multiply(flip); };

  // ----- built the first time it's wanted -----
  function build() {
    if (fl.built) return;
    fl.built = true;
    const random = Math.random;
    Math.random = rng(o.seed);
    try {
      const R = rng(o.seed + 1);
      w = o.build(R);
      base.pl = { exposure: fl.look.exposure, bloom: fl.look.bloom, grade: fl.look.grade };
      // the painting on B3, on its wall
      g = o.frame(R, {});
      g.position.set(at.X, SILL, at.Z); g.rotation.y = at.YAW;
      restr.root.add(g);
      hit = hitBox(g, W + 0.3, H + 0.3, 0.12, 0, H / 2, PO + 0.04, { action: `${o.key}-painting`, reach: 4 });
      // and out there, hanging in the air: its face toward the way back (-z), the canvas's back behind it
      pg = o.frame(R, { back: true });
      pg.position.set(0, SILL, PO); pg.rotation.y = Math.PI;
      fl.scene.add(pg);
      const back = hitBox(pg, W + 0.3, H + 0.3, 0.14, 0, H / 2, PO, { action: `${o.key}-frame`, reach: 4 });
      fl.hits.push(back);
      inP = makePortal(ctx, { w: W, h: H, flat: true }); outP = makePortal(ctx, { w: W, h: H, flat: true });
      restr.scene.add(inP.mesh); fl.scene.add(outP.mesh);
      inPaint = o.paint(inP); outPaint = o.paint(outP);
      if (o.pass) pass = new ShaderPass(o.pass());
      frames();
      // on B3: the painting to point at; and its wall open across it while you're in front (so you can walk up into it)
      restr.extras.push({
        cols: () => [],
        hits: () => [hit],
        cut(list) {
          if (!st.front) return;
          frames();   // (B3 may have just been laid out from another car: its root moved since the last frame)
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
    if (fl.built || ctx.away !== restr) return;
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
  function into() {
    carry(F.b3, F.plIn);
    paintAt(0, st.t);   // (at the frame: none of the paint yet)
    st.crossing = true; ctx.setFloor(fl); st.crossing = false;
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
  const lit = (F2) => {   // lit as it's lit from inside, for a look through: its look in full
    const L = F2.look;
    if (F2.hemi) { F2.hemi.intensity = L.hemi; F2.hemi.color.copy(L.sky); F2.hemi.groundColor.copy(L.ground); }
    for (const [l, k] of L.lights) l.intensity = k;
    F2.scene.environmentIntensity = L.env;
    return null;
  };
  // the frame out there: you can't walk into its sides, nor through it from behind (from in front, it's the way back)
  const sides = [{ minX: -W / 2 - 0.15, maxX: -W / 2, minZ: -0.06, maxZ: 0.06 }, { minX: W / 2, maxX: W / 2 + 0.15, minZ: -0.06, maxZ: 0.06 }];
  const whole = [{ minX: -W / 2 - 0.15, maxX: W / 2 + 0.15, minZ: -0.02, maxZ: 0.06 }];
  const refresh = () => { const c = st.plFront === false ? whole : sides; fl.colliders = w?.cols ? c.concat(w.cols) : c; };
  fl.prepare = async () => { build(); return true; };
  fl.enter = () => {
    build();
    if (o.hud) ctx.hud.classList.add(o.hud);
    st.plFront = true; refresh();
    if (st.crossing) return;
    w.arrive?.();
  };
  fl.leave = () => { if (o.hud) ctx.hud.classList.remove(o.hud); w?.sound?.stop(); outP?.hide(); o.leave?.(); };
  fl.fx = (dt, t) => {
    if (pass) paintAt(pass.uniforms.amount.value, t);
    w.fx?.(dt, t);
    // behind the frame it's solid across; in front, only its sides
    const front = camera.position.z < 0;
    if (front !== st.plFront) { st.plFront = front; refresh(); }
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
    for (const k of KEYS) { fl.look[k] = lerp(base.pl[k], base.b3[k], u / 2); if (u > 0 || wasU > 0) restr.look[k] = lerp(base.b3[k], base.pl[k], u / 2); }
    wasU = u;
  }
  ctx.onFrame((dt, t) => {
    const A = ctx.away, side = fl.built && A === restr ? 'b3' : fl.built && A === fl ? 'pl' : null;
    st.t = t;
    if (side !== 'b3') inP?.hide();
    if (side !== 'pl') outP?.hide();
    st.b3Bleed = 0;
    if (!side) { lastAway = null; seenB3 = false; st.near = Infinity; if (fl.built && w.sound) { bl = Math.max(0, bl - dt / 2.5); w.sound.bleed(bl); } return; }
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
        // out there, as seen from here: the world round where you'd be
        carry(F.b3, F.plIn); mp.copy(pos);
        w.seen?.(mp, dt, t, d, drawn);
        inPaint.value = sstep(1.2, 4, d);
        if (d < 6 && !primed) { primed = true; prime(); }
        u = sstep(5, 0, d); hear = 0.6 * sstep(8, 0, d);
        blend(u);   // (before it's drawn: k is the two exposures as they'll be drawn)
        drawn = inP.draw({ here: F.b3, there: F.plIn, scene: fl.scene, k: fl.look.exposure / restr.look.exposure, open: !away(F.b3, d), prepare: () => lit(fl) });
        if (inP.crossed(F.b3, last, camera.position) > 0) into();
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
        outP.draw({ here: F.plBack, there: F.b3Out, scene: restr.scene, k: restr.look.exposure / fl.look.exposure, open: !away(F.plBack, d),
          prepare: () => { carry(F.plBack, F.b3Out); restr.view(pos.x, pos.z - restr.z0, t, restr.z0, !seenB3); seenB3 = true; return lit(restr); } });
        if (outP.crossed(F.plBack, last, camera.position) > 0) outToB3();
      } else { outP.hide(); blend(0); }
    }
    last.copy(camera.position);
    // each side heard through the other: in as you come up to it, out slowly once you're through
    const want = ctx.away === restr ? hear : 0;
    bl = want > bl ? want : Math.max(want, bl - dt / 2.5);
    w.sound?.bleed(bl);
    st.b3Bleed = ctx.away === fl ? hear : 0;
  }, 196);
  // Its post-processing made and drawn a couple of times before you first walk in: the first frames out of a new
  // composer are wrong, and its shaders compile then, not as you cross. (Drawn to the canvas, under the frame that's drawn over it.)
  function prime() { ctx.renderFloor(fl); paintAt(0, 0); ctx.renderFloor(fl); ctx.renderFloor(fl); }
  // the look over everything out there: on, sized, how much
  function paintAt(amount, t) {
    if (!pass) return;
    if (fl.composer && !pass.added) { fl.composer.addPass(pass); pass.added = true; }
    renderer.getDrawingBufferSize(pass.uniforms.res.value);
    pass.uniforms.amount.value = amount; pass.uniforms.time.value = t;
  }

  ctx.action(`${o.key}-painting`, { hover: () => o.hover.painting(st.near) });
  ctx.action(`${o.key}-frame`, { hover: () => o.hover.frame(camera.position.z < 0) });

  // ----- getting you there, for the tests and for looking -----
  function car() {   // your car, waiting on B3 (setFloor wants one)
    const { mine, lifts, spare } = ctx;
    if (mine.L) return true;
    const L = lifts.find(spare); if (!L) return false;
    Object.assign(mine, { L, call: false, goal: null }); L.player = true; L.floor = -3; L.dir = 0; L.doorK = 0; ctx.setLift(L, 'parked');
    return true;
  }
  return {
    st, F, at, build, pose, refresh, box,
    get world() { return w; },
    /** out there: x, z from the frame (its plane z = 0, the way in toward -z), yaw 0 facing away from it */
    go(x, z, yaw = 0, pitch = 0) {
      build(); if (!car()) return false;
      if (ctx.away !== fl) ctx.setFloor(fl);
      pose(x, z, yaw, pitch); lastAway = null;
      return true;
    },
    /** on B3 in front of it: x across, z out from it into the room; yaw 0 faces it */
    painting(x = 0, z = 3, yaw = 0, pitch = 0) {
      build(); if (!car()) return false;
      if (ctx.away !== restr) { frames(); const p = box(F.b3Out, x, x, z, z); restr.arriveAt = { x: p.minX, z: p.minZ - restr.z0 }; ctx.setFloor(restr); restr.out = 1; }
      restr.out = 1; frames();   // (out of the car's light: as if you'd walked here)
      const p = box(F.b3Out, x, x, z, z), zx = F.b3Out.elements[8], zz = F.b3Out.elements[10];
      pose(p.minX, p.minZ, Math.atan2(zx, zz) + yaw, pitch); lastAway = null;
      return true;
    },
    into: () => { frames(); into(); },
    /** a reload's pose out there, never in the frame */
    restore(p) {
      pose(p.x, p.z, p.yaw, p.pitch);
      if (Math.abs(p.z) < 0.4 && Math.abs(p.x) < W / 2 + 0.5) pose(p.x, -0.8, p.yaw, p.pitch);
      return true;
    },
  };
}
