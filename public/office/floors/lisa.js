// HER WORLD: behind a portrait on the restricted level (B3, restricted.js). Far out to the north, in a long room, an old
// portrait in a plain walnut frame under a little brass picture light: a young woman, half-length, her hands folded, a
// dreamlike landscape behind her (lisa-portrait.js painted it; lisa-painting.js has where, the frame and the picture).
// Perfectly ordinary, and serene; only, her eyes follow you a little too far, and now and then, looking back, her smile
// is a little wider than it was. Come close and the paint runs and comes apart and the world's behind it; walk on into it
// and you're there, on the loggia she sat in, looking out over her landscape (lisa-world.js), her chair in front of you:
// empty.
// It's seamless both ways (systems/portal.js, painting-door.js): the portrait's a window, painted over far off; behind you,
// out there, the same frame hangs in the air with B3 through it, and you walk back out the way you came.
// Then (the director here, `H`): it's calm, and much too quiet, but for breathing. You glimpse her, sitting perfectly
// still in her chair, far off on the road, then on the bridge, always serene, always nearer whenever you look away. Close,
// her head turns, and goes on turning; the smile splits, ear to ear, too many teeth in it; her face cracks like old
// varnish, her eyes go black, and she drops onto all fours and scuttles (lisa-figure.js). The sky goes to blood and black,
// the haze to smoke, the river runs dark; the paint cracks and peels off everything, canvas behind it and nothing behind
// that; her face comes up in the clouds and in the river; and the frame back to B3 begins, slowly, to drift away from you.
// She hunts you: stalking, jumping nearer when you look away; up the podium's face and over the parapet, up the back wall
// and over the ceiling to drop behind you; rising off the ground with rocks and her chair turning in the air round her,
// then flinging them past you; coming for you, faster and faster. When she's on you, her face fills your view and she
// shrieks; then she recoils and scuttles off, and later it starts again. She never touches you, there's no end to it but
// walking back out. B3 is quiet again; look back, and she's sitting in the portrait as if nothing had happened, only her
// smile's not right, for a few seconds.
// Sounds (lisa-sound.js). Its own unlisted, carless floor; your car waits on B3. Nothing of it is built until you first
// come near the portrait (or a reload puts you out there); the portrait and the land are painted off the main thread
// (lisa-paint-worker.js).
// Debug: ctx.lisa (window.__office.lisa): .go(x, z, yaw, pitch) stands you out there (the frame's at the origin, its plane
// z = 0, the way in toward -z, the loggia's floor y = 0; yaw 0 faces out over the landscape), .painting(x, z, yaw, pitch)
// on B3 in front of the portrait (x across, z out from it into the room; yaw 0 faces it), .ready (painted and built),
// .phase(name) (calm, glimpse, reveal, hunt), .sit(x, z) / .reveal() / .scare() / .tk() / .climb() / .charge(d) / .crawl(x, z,
// supine), .horror(dread, peel, faces) and .drift(x, z) for the set pieces; .grin(v) on B3.

import * as THREE from 'three';
import { clamp, damp, lerp, rng, sstep } from '../util.js';
import { makePaintingDoor } from './painting-door.js';
import { paintPane } from './plain-painting.js';
import { findLisa, makeLisaFrame, pictureMaterial, lisaPassShader, CANVAS } from './lisa-painting.js';
import { buildWorld, WL } from './lisa-world.js';
import { groundAt, terrain, along, RIVER, BRIDGE, LOGGIA, STAIR } from './lisa-land.js';
import { makeLisa } from './lisa-figure.js';
import { makeSound } from './lisa-sound.js';

const N = -9;
const EYE_Y = CANVAS.h * (1 - 0.2297);   // the portrait's eyes, up from its sill

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // (three's uuids from Math.random: what's made here takes them from its own stream: see helicopter.js)
  const random = Math.random;
  Math.random = rng(1503);
  try { setup(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function setup(ctx) {
  const { camera, style, mapCtx, addFloor } = ctx;
  const restr = ctx.restr;
  const fl = { n: N, label: 'THE PORTRAIT', title: 'The portrait', unlisted: true, carless: true, liftGone: true, home: -3, on: false, composer: null,
    colliders: [], hits: [], scene: new THREE.Scene(), sound: { kind: 'lisa', steps: true }, built: false, ground: groundAt };
  style.textContent += `.of-lisa .of-clock { font-size: 0 !important; } .of-lisa .of-clock::after { content: '—'; font-size: 12px; }
    .of-lisa .of-count { font-size: 0; } .of-lisa .of-count::after { content: '·'; font-size: 12px; }`;
  // her streams, and her own clock (settle() restarts them: the same from there however long the painting took)
  let rD = rng(1504), rH = rng(1506), clock = 0;
  const R = () => rD(), RH = () => rH(), at = findLisa(restr);
  let world = null, her = null, sound = null, passM = null;
  const fwd = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), inv = new THREE.Matrix4();

  // ----- painted off the main thread, asked for as you come within 70 m of the portrait (or a reload's out there) -----
  const pic = pictureMaterial(), paint = { portrait: null, face: null, land: null, asked: false };
  function ask() {
    if (paint.asked) return;
    paint.asked = true;
    const wk = new Worker(new URL('./lisa-paint-worker.js', import.meta.url), { type: 'module' });
    wk.onmessage = ({ data }) => {
      if (data.portrait) {
        const tex = (b) => { const t = new THREE.Texture(b); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
        paint.portrait = tex(data.portrait); paint.face = tex(data.face);
        // (the picture's uv: v down the canvas, flipY off: the shader samples (u, 1 - v))
        pic.uniforms.tPaint.value = paint.portrait; pic.uniforms.ready.value = 1;
        if (her) her.setFace(paint.face);
        if (world) world.U.tFace.value = paint.face;
      }
      if (data.land) { paint.land = data.land; if (world) world.setLand(paint.land); wk.terminate(); }
    };
    wk.postMessage({ seed: 77, w: 768, fw: 512 });
  }
  ctx.onFrame(() => {
    if (paint.asked || ctx.away !== restr) return;
    if (Math.hypot(ctx.player.x - at.X, ctx.player.z - restr.z0 - at.Z) < 70) ask();
  }, 188);

  // ----- the door -----
  const door = makePaintingDoor(ctx, fl, {
    at, size: CANVAS, key: 'lisa', near: 32, seed: 1505, hud: 'of-lisa',
    frame: (R2, o) => makeLisaFrame(R2, { back: !!o.back, picture: o.back ? null : pic }),
    paint: (p) => paintPane(p, { size: CANVAS, varnish: [1.02, 0.95, 0.66] }),
    pass: () => (passM = new THREE.ShaderMaterial(lisaPassShader())),
    window: (d) => d < 3.6,   // (further off, the picture covers it all: nothing of the world's drawn)
    build(R2) {
      ask();
      world = buildWorld(fl, R2, paint.face || blankTex(), paint.land);
      sound = makeSound(ctx);
      her = makeLisa(RH, paint.face || blankTex(), {
        tap: (p, sp, arm) => { if (ctx.away === fl && p.distanceTo(camera.position) < 30 && (arm || Math.random() < 0.5)) sound.nail(p, sp); },
      });
      fl.scene.add(her.root, her.skirt);
      her.S.visible = false;
      return {
        sound,
        // out there, as seen from B3 through the portrait: the world round where you'd be, calm, her chair empty
        seen(mp, dt, t) { if (H.phase !== 'calm' && ctx.away !== fl) reset(); world.view(mp, t); clock += dt; her.update(dt, clock, groundAt); },
        fx: (dt, t) => frame(dt, t),
        arrive() { door.pose(0, -0.9, 0, 0); },   // (debug, a reload: a step past the frame, the chair ahead)
        cols: world.cols,
      };
    },
    hover: {
      painting: (near) => (near < 1.6 ? '<b>The portrait</b><div class="k">The paint’s running. There’s air behind it, cool, and somewhere a long way off, a river. Walk into it</div>'
        : '<b>A portrait</b><div class="k">A young woman, half-length, her hands folded, a landscape behind her. No name on it. Her eyes are on you</div>'),
      frame: (front) => (front ? '<b>The portrait’s frame</b><div class="k">B3 through it, the yellow rooms. Walk back into it</div>'
        : '<b>The back of a canvas</b><div class="k">Hanging in the air, from nothing</div>'),
    },
    leave() { her && (her.S.visible = false); },
  });
  const blankTex = (() => { let t = null; return () => (t ||= new THREE.DataTexture(new Uint8Array([200, 168, 120, 255]), 1, 1)); })();
  fl.prepare = async () => { ask(); door.build(); return true; };   // (the land follows from the worker in a moment)
  fl.bound = (p) => {
    // the valley's as far as you go; not into the river but by the bridge
    const dx = p.x, dz = p.z + 60, r = Math.hypot(dx, dz);
    if (r > 175) { p.x = dx / r * 175; p.z = dz / r * 175 - 60; }
    if (p.z < -20) {
      const [d] = along(RIVER, p.x, p.z), onBridge = Math.abs(p.x - BRIDGE.x) < BRIDGE.w / 2 && p.z > BRIDGE.z0 - 1 && p.z < BRIDGE.z1 + 1;
      if (d < 9 && !onBridge) {   // pushed back up the bank you came from
        const e = 0.5, gx = along(RIVER, p.x + e, p.z)[0] - along(RIVER, p.x - e, p.z)[0], gz = along(RIVER, p.x, p.z + e)[0] - along(RIVER, p.x, p.z - e)[0], n = Math.hypot(gx, gz) || 1;
        p.x += gx / n * (9 - d); p.z += gz / n * (9 - d);
      }
    }
  };
  fl.save = () => ({});
  fl.restore = (s, p) => { door.restore(p); ctx.player.fy = groundAt(ctx.player.x, ctx.player.z); return true; };

  // ----- the director -----
  // phase: calm (nothing, too quiet, breathing), glimpse (her, seated, nearer each time you look away), reveal, hunt
  const H = { phase: 'calm', t: 0, dread: 0, peel: 0, faces: 0, mode: 'gone', mt: 0, step: 0, seen: 0, unseen: 0, los: true, losAt: 0, cool: 0, flash: 0, near: 0,
    drift: new THREE.Vector2(0, 0), want: new THREE.Vector2(0, 0), route: null, ri: 0, vy: 0, tk: null, stuck: 0, last: new THREE.Vector3(), flick: 0, scared: 0, onB3: 0 };
  const TK = 10, tkM = new THREE.Matrix4(), tkQ = new THREE.Quaternion(), tkE = new THREE.Euler(), tkS = new THREE.Vector3(1, 1, 1), tkP = new THREE.Vector3();
  let tk = null;   // the stones she lifts (an instanced mesh, made with the world)
  function reset() {
    Object.assign(H, { phase: 'calm', t: 0, dread: 0, peel: 0, faces: 0, mode: 'gone', mt: 0, step: 0, seen: 0, unseen: 0, cool: 0, flash: 0, near: 0, route: null, tk: null, scared: 0 });
    H.drift.set(0, 0); door.place(0, 0);
    if (her) { Object.assign(her.S, { visible: false, sit: 1, prone: 0, supine: 0, split: 0, crack: 0, black: 0, turn: 0, tilt: 0, arms: 1, rise: 0, lookK: 0 }); }
    if (world) { chairHome(); horror(0, 0, 0); if (tk) tk.visible = false; }
  }
  function horror(d, p, f) { H.dread = d; H.peel = p; H.faces = f; world.dread.value = d; world.peel.value = p; world.faces.value = f; }
  const chairHome = () => { const c = world.chair; c.visible = true; c.position.set(1.3, 0, -2.6); c.rotation.set(0, -0.45, 0); Object.assign(world.chairCol, { minX: 1.0, maxX: 1.6, minZ: -2.9, maxZ: -2.3 }); door.refresh(); };
  const camXZ = () => camera.position;
  const yawOf = () => { camera.getWorldDirection(fwd); return Math.atan2(fwd.x, fwd.z); };
  const nearFrame = () => Math.hypot(camera.position.x - door.out.x, camera.position.z - door.out.z);
  // is a point on screen, and (checked a few times a second) in plain sight
  const ndc = new THREE.Vector3(), los0 = new THREE.Vector3(), los1 = new THREE.Vector3(), ray = new THREE.Raycaster();
  function onScreen(p) {
    ndc.copy(p).project(camera);
    return ndc.z < 1 && ndc.z > -1 && Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95;
  }
  function inSight(p) {
    los0.copy(camera.position); los1.copy(p);
    // the land: sampled along the line
    for (let k = 1; k < 16; k++) { const u = k / 16, x = lerp(los0.x, los1.x, u), z = lerp(los0.z, los1.z, u), y = lerp(los0.y, los1.y, u); if (y < terrain(x, z) - 0.2 && !(Math.abs(x) < 9 && z > -14 && z < 4)) return false; }
    // the loggia
    ray.set(los0, v4.subVectors(los1, los0).normalize()); ray.far = los0.distanceTo(los1) - 0.6;
    return !ray.intersectObjects(world.solid, false).length;
  }
  // her: seated in her chair at (x, z), facing you
  function sitAt(x, z) {
    const S = her.S, y = groundAt(x, z), c = camXZ(), yaw = Math.atan2(c.x - x, c.z - z);
    Object.assign(S, { visible: true, sit: 1, prone: 0, supine: 0, speed: 0, want: 0, lookK: 1, turn: 0, split: 0, crack: 0, black: 0, arms: 1, rise: 0 });
    S.P.set(x, y, z); S.N.set(0, 1, 0); S.F.set(Math.sin(yaw), 0, Math.cos(yaw));
    her.place(true);
    const ch = world.chair; ch.visible = true; ch.position.set(x, y, z); ch.rotation.set(0, yaw, 0);
    world.chairCol.minX = x - 0.32; world.chairCol.maxX = x + 0.32; world.chairCol.minZ = z - 0.32; world.chairCol.maxZ = z + 0.32; door.refresh();
  }
  // a spot d m from you, out of view (to your side, more or less), clear to stand on and in sight of you
  function spotNear(d, offView = true) {
    const c = camXZ(), y0 = yawOf();
    for (let k = 0; k < 24; k++) {
      const a = y0 + (offView ? (R() < 0.5 ? -1 : 1) * (0.9 + R() * 1.1) : (R() - 0.5) * 0.7), r = d * (0.85 + R() * 0.3);
      const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
      if (!free(x, z)) continue;
      v3.set(x, groundAt(x, z) + 1.1, z);
      if (Math.abs(v3.y - 1.1 - (camera.position.y - 1.65)) > 12) continue;
      if (!inSight(v3)) continue;
      return [x, z];
    }
    return null;
  }
  const free = (x, z) => {
    if (Math.hypot(x - door.out.x, z - door.out.z) < 1.6) return false;
    for (const b of world.cols) if (x > b.minX - 0.5 && x < b.maxX + 0.5 && z > b.minZ - 0.5 && z < b.maxZ + 0.5) return false;
    if (z < -20 && along(RIVER, x, z)[0] < 9) return false;
    return Math.hypot(x, z + 60) < 170 && groundAt(x, z) > WL + 0.6;
  };
  const inLoggia = (p) => Math.abs(p.x) < LOGGIA.x && p.z > LOGGIA.zf && p.z < LOGGIA.zb;
  // the glimpses: two far ones first (the road on the left, the bridge), then nearer each time
  const GLIMPSE = [[-46, -61], [BRIDGE.x, -89]], NEARER = [34, 22, 14, 9, 6];
  function glimpse() {
    const k = H.step++;
    if (k < GLIMPSE.length) { const [x, z] = GLIMPSE[k]; sitAt(x, z); return; }
    const d = NEARER[Math.min(NEARER.length - 1, k - GLIMPSE.length)], s = spotNear(d) || spotNear(d, false);
    if (s) sitAt(s[0], s[1]);
  }

  // her moving over the ground toward (x, z) at `speed`, pushed out of what's solid
  function crawlToward(dt, x, z, speed, away = false) {
    const S = her.S;
    let dx = x - S.P.x, dz = z - S.P.z; if (away) { dx = -dx; dz = -dz; }
    const n = Math.hypot(dx, dz) || 1, a = Math.atan2(dx / n, dz / n), cur = Math.atan2(S.F.x, S.F.z);
    const turn = Math.atan2(Math.sin(a - cur), Math.cos(a - cur)), na = cur + turn * Math.min(1, dt * (speed > 5 ? 9 : 5)) + Math.sin(H.t * 9) * 0.15 * dt * speed * 0.2;
    S.F.set(Math.sin(na), 0, Math.cos(na)); S.N.set(0, 1, 0);
    S.want = speed;
    S.speed = damp(S.speed, S.want, S.want > S.speed ? 3 : 6, dt);
    S.P.x += S.F.x * S.speed * dt; S.P.z += S.F.z * S.speed * dt;
    for (const b of world.cols) {
      const r = 0.45, cx = clamp(S.P.x, b.minX, b.maxX), cz = clamp(S.P.z, b.minZ, b.maxZ), ex = S.P.x - cx, ez = S.P.z - cz, d2 = ex * ex + ez * ez;
      if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); S.P.x = cx + ex / d * r; S.P.z = cz + ez / d * r; }
    }
    S.P.y = damp(S.P.y, groundAt(S.P.x, S.P.z), 20, dt);
    // stuck (against the podium, the stair's walls): she's elsewhere, the next time you look away
    if (H.last.distanceTo(S.P) < S.speed * dt * 0.2 && S.speed > 1) H.stuck += dt; else H.stuck = 0;
    H.last.copy(S.P);
  }
  const dist = () => Math.hypot(her.S.P.x - camera.position.x, her.S.P.z - camera.position.z);
  function setMode(m) { H.mode = m; H.mt = 0; }
  function scuttle(supine = R() < 0.35) {
    const S = her.S;
    Object.assign(S, { visible: true, sit: 0, prone: supine ? 0 : 1, supine: supine ? 1 : 0, lookK: 1, arms: 1.35, split: 0.55, crack: 1, black: 1, turn: 0 });
  }
  // appear somewhere d off, crawling, out of view
  function reappear(d) {
    const s = spotNear(d) || spotNear(d * 1.5) || spotNear(d, false);
    if (!s) return false;
    scuttle();
    her.S.P.set(s[0], groundAt(s[0], s[1]), s[1]); her.S.F.set(camera.position.x - s[0], 0, camera.position.z - s[1]).normalize(); her.S.N.set(0, 1, 0);
    her.place(true);
    return true;
  }

  // ----- the set pieces: routes over the loggia's faces (points, and the surface's normal there) -----
  const P = (x, y, z, nx, ny, nz) => ({ p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(nx, ny, nz) });
  function routeCeiling() {   // floor to the back wall, up it, out over the ceiling to over your head; then she drops
    const c = camXZ(), x = clamp(c.x + (R() - 0.5) * 3, -4.5, 4.5);
    return [P(x, 0, LOGGIA.zb - 0.7, 0, 1, 0), P(x, 0.4, LOGGIA.zb - 0.05, 0, 0, -1), P(x, LOGGIA.h - 0.5, LOGGIA.zb - 0.05, 0, 0, -1), P(x, LOGGIA.h - 0.05, LOGGIA.zb - 0.6, 0, -1, 0),
      P(clamp(c.x, -5, 5), LOGGIA.h - 0.3, clamp(c.z + 0.8, LOGGIA.zf + 0.6, LOGGIA.zb - 0.6), 0, -1, 0)];
  }
  function routeParapet() {   // from under the podium's front, up its face, over the parapet and down onto the floor
    const x = clamp(camera.position.x + (R() - 0.5) * 4, -5.6, 5.6);
    return [P(x, terrain(x, -6.5), -6.5, 0, 1, 0), P(x, terrain(x, -4.6) + 0.3, -4.62, 0, 0, -1), P(x, 0.9, -4.62, 0, 0, -1), P(x, 0.96, -4.2, 0, 1, 0), P(x, 0.5, -3.88, 0, 0, 1), P(x, 0, -3.4, 0, 1, 0)];
  }
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), UPV = new THREE.Vector3(0, 1, 0);
  function follow(dt, speed) {   // along H.route; true at its end
    const S = her.S, w = H.route[H.ri];
    v3.subVectors(w.p, S.P); const d = v3.length();
    if (d < 0.08) { if (++H.ri >= H.route.length) return true; return false; }
    const step = Math.min(d, speed * dt);
    S.P.addScaledVector(v3.normalize(), step);
    // her up toward the surface's, quickly; her heading along the way on it
    S.N.lerp(w.n, Math.min(1, dt * 10)).normalize();
    S.F.copy(v3).addScaledVector(S.N, -v3.dot(S.N)); if (S.F.lengthSq() < 1e-6) S.F.set(0, 0, 1); S.F.normalize();
    S.speed = speed; S.want = speed;
    void qa; void qb; void UPV;
    return false;
  }

  // ----- the stones she lifts -----
  function tkStart() {
    const S = her.S, list = [];
    for (let k = 0; k < TK; k++) {
      const a = k / TK * Math.PI * 2 + R(), r = 2 + R() * 2.2, x = S.P.x + Math.cos(a) * r, z = S.P.z + Math.sin(a) * r;
      list.push({ a, r, h: 0.8 + R() * 2.4, x, y: groundAt(x, z), z, s: 0.25 + R() * 0.45, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(4), rot: new THREE.Euler(R() * 6, R() * 6, R() * 6), v: null, go: 1e9 });
    }
    // the chair too, if it's near
    const ch = world.chair, chOk = ch.visible && Math.hypot(ch.position.x - S.P.x, ch.position.z - S.P.z) < 12;
    H.tk = { list, chair: chOk ? { x: ch.position.x, y: ch.position.y, z: ch.position.z, v: null, go: 1e9, rot: new THREE.Euler(0, ch.rotation.y, 0) } : null, t: 0 };
    tk.visible = true; sound.lift(S.P);
  }
  const tkV = new THREE.Vector3(), tkT = new THREE.Vector3();
  function tkStep(dt) {
    const T = H.tk, S = her.S; T.t += dt;
    const throwAt = 3.4;
    const each = (o, i, isChair) => {
      if (o.v) {   // flung: straight on past you, falling a little, gone a way off
        o.x += o.v.x * dt; o.y += o.v.y * dt; o.z += o.v.z * dt; o.v.y -= 2 * dt;
        if (!o.passed && Math.hypot(o.x - camera.position.x, o.z - camera.position.z) < 3) { o.passed = true; sound.rush(tkV.set(o.x, o.y, o.z)); }
        o.rot.x += dt * 9; o.rot.z += dt * 6;
        return;
      }
      // rising out of the ground, turning in the air round her
      const k = sstep(0, 1.6, T.t - i * 0.08), a = o.a + T.t * 0.9, r = o.r * (1 - 0.2 * k);
      const tx = S.P.x + Math.cos(a) * r, tz = S.P.z + Math.sin(a) * r, ty = groundAt(tx, tz) + o.h * k + Math.sin(T.t * 2 + i) * 0.15;
      o.x = lerp(o.x, tx, Math.min(1, dt * 4)); o.z = lerp(o.z, tz, Math.min(1, dt * 4)); o.y = lerp(o.y, ty, Math.min(1, dt * 3));
      if (!isChair) { o.rot.x += o.spin.x * dt * k; o.rot.y += o.spin.y * dt * k; o.rot.z += o.spin.z * dt * k; } else { o.rot.x = Math.sin(T.t * 1.3) * 0.6 * k; o.rot.z = Math.sin(T.t * 0.9) * 0.5 * k; }
      if (T.t > throwAt + i * 0.22) {
        // past you, never at you: aimed at a point beside your head, 1.3 to 2.4 m off to one side, and on beyond it
        camera.getWorldDirection(fwd); const side = (i % 2 ? 1 : -1) * (1.3 + R() * 1.1);
        tkT.set(camera.position.x - fwd.z * side, camera.position.y + (R() - 0.3) * 1.2, camera.position.z + fwd.x * side);
        tkV.subVectors(tkT, tkP.set(o.x, o.y, o.z)).normalize().multiplyScalar(20 + R() * 6);
        o.v = tkV.clone();
      }
    };
    T.list.forEach((o, i) => {
      each(o, i, false);
      tkM.compose(tkP.set(o.x, o.y, o.z), tkQ.setFromEuler(o.rot), tkS.setScalar(o.s)); tk.setMatrixAt(i, tkM);
    });
    tk.instanceMatrix.needsUpdate = true;
    if (T.chair) { each(T.chair, TK, true); const ch = world.chair; ch.position.set(T.chair.x, T.chair.y, T.chair.z); ch.rotation.copy(T.chair.rot); }
    return T.t > throwAt + TK * 0.22 + 2.5;
  }

  // ----- each frame out there -----
  const lookAtYou = new THREE.Vector3();
  function frame(dt, t) {
    world.view(camera.position, t);
    const S = her.S;
    H.t += dt; H.mt += dt;
    lookAtYou.copy(camera.position); S.look.copy(lookAtYou);
    const vis = S.visible && onScreen(v3.copy(her.headG.getWorldPosition(v4)));
    if (t > H.losAt) { H.losAt = t + 0.25; H.los = !S.visible || inSight(v4); }
    const seen = vis && H.los;
    if (seen) { H.seen += dt; H.unseen = 0; } else H.unseen += dt;
    const d = S.visible ? dist() : 99, safe = nearFrame() > 2.6;
    switch (H.phase) {
      case 'calm': {
        sound.set(0, 0, 1);
        if (H.t > 14 || (H.t > 6 && !inLoggia(camera.position))) { H.phase = 'glimpse'; H.t = 0; world.chair.visible = false; world.chairCol.minX = world.chairCol.maxX = 99; door.refresh(); H.step = 0; glimpse(); H.seen = 0; }
        break;
      }
      case 'glimpse': {
        sound.set(0, 0, 1);
        // seen long enough, and looked away from: nearer; close, and looked at: it begins
        if (H.seen > 1.0 && H.unseen > 0.6) { H.seen = 0; glimpse(); }
        if (H.unseen > 22) { H.unseen = 0; const s = spotNear(30, false); if (s) sitAt(s[0], s[1]); }
        if (d < 7.5 && H.seen > 1.6 && safe) { H.phase = 'reveal'; H.t = 0; sound.neck(S.P); }
        break;
      }
      case 'reveal': {
        const r = H.t;
        sound.set(sstep(1.4, 9, r), 0, 1 - sstep(0, 1, r));
        // her head turns, on round, too far (in jerks); the smile splits; the cracks spread; her eyes go black
        S.turn = 2.7 * sstep(0.2, 2.6, r) + (r < 2.6 ? Math.sin(r * 13) * 0.05 : 0);
        S.split = sstep(1.3, 2.0, r); S.crack = sstep(1.4, 4.2, r); S.black = sstep(1.8, 2.3, r); S.tilt = 0.5 * sstep(2.0, 3.0, r);
        if (r > 1.3 && !H.screech) { H.screech = 1; sound.screech(S.P); }
        horror(sstep(1.4, 9, r), 0, 0);
        if (r > 3.3) {
          // she drops onto all fours; the chair goes over behind her
          H.screech = 0;
          S.turn = 0; scuttle(false); S.sit = 0; her.place(true);
          const ch = world.chair; ch.rotation.x = -1.4; ch.position.y += 0.25;
          H.phase = 'hunt'; H.t = 0; setMode('stalk'); H.cool = 0;
        }
        break;
      }
      case 'hunt': hunt(dt, t, d, seen, safe); break;
      default: break;
    }
    // the world's horror over the hunt: the paint coming off, her faces, the frame drifting away from you
    if (H.phase === 'hunt') {
      horror(Math.min(1, H.dread + dt * 0.2), Math.min(0.78, H.peel + dt * 0.02), Math.min(1, H.faces + dt * 0.03));
      sound.set(H.dread, H.peel, 0);
      if (nearFrame() > 1.8) {
        // away from you, slowly; a way off, never out of the loggia, never out of reach
        const c = camXZ(), fx = door.out.x - c.x, fz = door.out.z - c.z, n = Math.hypot(fx, fz) || 1;
        H.drift.x = clamp(H.drift.x + fx / n * dt * 0.22, -4.2, 4.2); H.drift.y = clamp(H.drift.y + fz / n * dt * 0.22, -2.6, 2.0);
        if (Math.hypot(H.drift.x, H.drift.y) > 4.4) H.drift.multiplyScalar(0.995);
        door.place(H.drift.x, H.drift.y);
      }
    }
    // the look over it all: blood, her closeness, the flash
    if (passM) {
      const nr = S.visible && H.phase === 'hunt' ? sstep(16, 2, d) * (seen ? 1 : 0.5) : 0;
      H.near = damp(H.near, Math.max(nr, H.flash * 0.8), 4, dt);
      H.flash = Math.max(0, H.flash - dt * 2.2);
      const k = sstep(0.6, 2.2, nearFrame());   // (none of it at the frame: it meets B3's look there)
      passM.uniforms.dread.value = H.dread * k; passM.uniforms.near.value = H.near * k; passM.uniforms.flash.value = H.flash * k;
    }
    clock += dt;
    her.update(dt, clock, groundAt);
    sound.fx(dt, t, !inLoggia(camera.position) && camera.position.y < -0.5 + 1.65);
  }

  // The hunt: what she's doing (H.mode), round and round.
  function hunt(dt, t, d, seen, safe) {
    const S = her.S, c = camXZ();
    switch (H.mode) {
      case 'gone':   // after a scare: nowhere, for a while
        S.visible = false;
        if (H.mt > H.cool && reappear(28 + R() * 10)) { setMode('stalk'); sound.voice(S.P); }
        break;
      case 'stalk': {
        // looked at, she's still, twitching (now and then a jerk toward you); not, she comes on, fast, and jumps nearer
        if (seen) {
          S.want = 0; S.speed = damp(S.speed, 0, 8, dt);
          if (R() < dt * 0.8) S.shud = 1;
          if (R() < dt * 0.35 && d > 8) { H.flick = 3; }
        } else {
          crawlToward(dt, c.x, c.z, 7);
          if (R() < dt * 0.6 && d > 9) { const k = Math.min(d - 6, 3 + R() * 4); S.P.x += S.F.x * k; S.P.z += S.F.z * k; S.P.y = groundAt(S.P.x, S.P.z); her.plant(); }
        }
        // a flicker: a few frames at a time, nearer each
        if (H.flick > 0 && R() < 0.5) { H.flick--; const k = 1.2 + R(); S.P.x += S.F.x * k; S.P.z += S.F.z * k; S.P.y = groundAt(S.P.x, S.P.z); her.plant(); S.visible = R() < 0.5; } else S.visible = true;
        if (R() < dt * 0.08) { S.prone = 1 - S.prone; S.supine = 1 - S.prone; S.shud = 1; }   // (over, onto her back, and back)
        if (H.stuck > 1 && !seen) { H.stuck = 0; reappear(Math.max(8, d * 0.7)); }
        // what's next: a charge when she's near enough; now and then a set piece
        if (safe && H.mt > 4) {
          const inL = inLoggia(c);
          if (inL && H.mt > 6 && R() < dt * 0.25 && !seen) { H.route = R() < 0.5 ? routeCeiling() : routeParapet(); H.ri = 0; const w = H.route[0]; S.P.copy(w.p); S.N.copy(w.n); her.place(true); scuttle(false); S.visible = true; setMode('climb'); }
          else if (d > 9 && d < 18 && seen && R() < dt * 0.2) { setMode('tk'); S.want = S.speed = 0; tkStart(); }
          else if (d < 13 && R() < dt * 0.5) { setMode('charge'); sound.screech(S.P); }
        }
        break;
      }
      case 'charge':   // straight at you, faster and faster, skittering
        crawlToward(dt, c.x, c.z, Math.min(12, 5 + H.mt * 5));
        if (!safe) { setMode('flee'); break; }
        if (d < 2.4) { setMode('lunge'); sound.shriek(S.P); H.flash = 1; }
        if (H.mt > 6) setMode('stalk');
        break;
      case 'climb': {   // over the loggia's faces, then dropped behind you
        const done = follow(dt, 3.6 + 2 * Math.sin(H.mt * 3));
        if (done || H.mt > 12) { setMode('fall'); H.vy = 0; }
        break;
      }
      case 'fall': {
        H.vy -= 9.8 * dt; S.P.y += H.vy * dt; S.N.lerp(UPV, Math.min(1, dt * 8)).normalize();
        const gy = groundAt(S.P.x, S.P.z);
        if (S.P.y <= gy) { S.P.y = gy; S.N.set(0, 1, 0); her.place(true); S.shud = 1; setMode(safe ? 'charge' : 'stalk'); }
        break;
      }
      case 'tk': {   // risen off the ground, the stones and her chair turning round her, flung past you
        S.rise = Math.min(1, S.rise + dt); S.P.y = lerp(S.P.y, groundAt(S.P.x, S.P.z) + 1.1 * S.rise, Math.min(1, dt * 2)); S.lookK = 1;
        if (tkStep(dt)) { tk.visible = false; S.rise = 0; H.tk = null; setMode(safe ? 'charge' : 'stalk'); }
        break;
      }
      case 'lunge': {   // on you: her face filling your view, her mouth open; she shrieks
        const k = Math.min(1, H.mt / 0.12);
        camera.getWorldDirection(fwd);
        // her head brought to just in front of your eyes (the body after it)
        her.headG.getWorldPosition(v4);
        v3.copy(camera.position).addScaledVector(fwd, 0.42).sub(v4);
        S.P.addScaledVector(v3, k); S.F.set(-fwd.x, 0, -fwd.z).normalize();
        S.split = 1; S.lookK = 1; S.shud = 1; S.rise = 1;
        her.head.scale.setScalar(1 + 0.5 * k);
        H.scared = Math.max(H.scared, 1);
        if (H.mt > 0.85) { setMode('recoil'); her.head.scale.setScalar(1); }
        break;
      }
      case 'recoil':   // thrown back, then off, away out of sight, fast
        S.rise = Math.max(0, S.rise - dt * 3); S.split = 0.55;
        crawlToward(dt, c.x, c.z, H.mt < 0.3 ? 9 : 13, true);
        if (H.mt > 0.3 && (d > 30 || (!seen && H.mt > 1.5)) || H.mt > 6) { setMode('gone'); H.cool = 10 + R() * 12; S.visible = false; }
        break;
      case 'flee':   // (you're at the frame: she won't come there)
        crawlToward(dt, c.x, c.z, 10, true);
        if (H.mt > 2.5 || d > 25) setMode('stalk');
        break;
      default: break;
    }
  }

  // ----- on B3: the portrait's eyes, its smile, the melt -----
  const iris = new THREE.Vector2(), q4 = new THREE.Vector4();
  const B = { grin: 0, grinT: 0, off: 0, wrongT: 0, wasAway: false, stare: 0, now: 0 };
  ctx.onFrame((dt, t) => {
    B.now = t;
    if (!fl.built) return;
    const on = ctx.away === restr;
    pic.uniforms.time.value = t;
    if (ctx.away === fl) B.wasAway = true;
    else if (B.wasAway && on) { B.wasAway = false; B.wrongT = t + 90; }   // (just walked back out)
    if (!on) return;
    const d = door.st.near;
    pic.uniforms.melt.value = sstep(3.4, 1.55, d);
    // where you are, from the portrait: its eyes after you, a little too far, a beat late
    v3.copy(camera.position).applyMatrix4(inv.copy(door.F.b3Out).invert());
    const ax = Math.atan2(v3.x, Math.max(0.2, v3.z)), ay = Math.atan2(v3.y - EYE_Y, Math.max(0.2, v3.z));
    const k = 0.0072 * (1 + B.stare);
    iris.set(clamp(ax * k, -0.0085, 0.0085), clamp(-ay * k, -0.0035, 0.0035));
    const u = pic.uniforms.iris.value;
    u.x = damp(u.x, iris.x, 2.6, dt); u.y = damp(u.y, iris.y, 2.6, dt);
    // looked back at: now and then, wider; just come back out, wrong for a few seconds
    q4.set(0, EYE_Y, 0, 1).applyMatrix4(door.F.b3Out);
    ndc.set(q4.x, q4.y, q4.z).project(camera);
    const look = ndc.z < 1 && Math.abs(ndc.x) < 0.8 && Math.abs(ndc.y) < 0.8 && d < 14 && v3.z > 0;
    if (!look) B.off += dt;
    else {
      if (B.off > 2.2) {
        if (t < B.wrongT && pic.uniforms.melt.value < 0.3) { B.grinT = t + 4.5; B.grin = 0.85; B.stare = 1.4; B.wrongT = 0; }
        else if (R() < 0.14) { B.grinT = t + 2.4; B.grin = 0.32; }
      }
      B.off = 0;
    }
    const want = t < B.grinT ? B.grin : 0;
    pic.uniforms.grin.value = damp(pic.uniforms.grin.value, want, want > pic.uniforms.grin.value ? 30 : 0.9, dt);
    B.stare = damp(B.stare, 0, t < B.grinT ? 0 : 0.5, dt);
  }, 197);

  // ----- the map: parchment, which way the frame is -----
  fl.map = () => {
    const c = mapCtx, MW = 440, MH = 330, K = 3;
    c.clearRect(0, 0, MW, MH);
    c.fillStyle = H.dread > 0.5 ? 'rgba(90,20,14,.4)' : 'rgba(120,128,96,.35)'; c.fillRect(0, 0, MW, MH);
    const dx = door.out.x - camera.position.x, dz = door.out.z - camera.position.z;
    let px = MW / 2 + dx * K, pz = MH / 2 + 10 + dz * K;
    const inside = px > 24 && px < MW - 24 && pz > 50 && pz < MH - 20;
    if (!inside) { const s = Math.min((MW / 2 - 24) / Math.abs(dx * K || 1e-6), (MH / 2 - 40) / Math.abs(dz * K || 1e-6)); px = MW / 2 + dx * K * s; pz = MH / 2 + 10 + dz * K * s; }
    c.fillStyle = 'rgba(214,190,130,.95)';
    if (inside) { c.fillRect(px - 6, pz - 2, 12, 4); c.font = '600 15px system-ui'; c.fillText('the frame', px + 10, pz + 5); }
    else { const a = Math.atan2(dz, dx); c.save(); c.translate(px, pz); c.rotate(a); c.beginPath(); c.moveTo(10, 0); c.lineTo(-6, -7); c.lineTo(-6, 7); c.fill(); c.restore(); }
    c.save(); c.translate(MW / 2, MH / 2 + 10); c.rotate(-ctx.player.yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('—', 16, 30);
  };

  // ----- the world's extras, once it's built: the stones she lifts, what she can't be seen through -----
  const extras = () => {
    if (tk || !world) return;
    tk = new THREE.InstancedMesh(world.rocks.geometry, world.rocks.material, TK); tk.count = TK; tk.visible = false; tk.frustumCulled = false;
    fl.scene.add(tk);
  };
  ctx.onFrame(() => { if (world && !tk) extras(); }, 199);

  // ----- getting you there, for the tests and for looking -----
  const pose = (x, z, yaw, pitch) => { door.pose(x, z, yaw, pitch); ctx.player.fy = groundAt(x, z); };
  ctx.lisa = {
    fl, H, st: door.st, F: door.F, at, door,
    get built() { return fl.built; }, get ready() { return fl.built && !!paint.land && !!paint.portrait; }, get her() { return her; }, get world() { return world; },
    go(x = 0.9, z = -0.9, yaw = 0, pitch = 0) { if (!door.go(x, z, yaw, pitch)) return false; ctx.player.fy = groundAt(x, z); return true; },
    painting: (x = 0, z = 3, yaw = 0, pitch = 0) => door.painting(x, z, yaw, pitch),
    into: door.into, pose,
    phase(p) { if (!world) return false; reset(); H.phase = p; H.t = 0; if (p === 'glimpse') { world.chair.visible = false; H.step = 0; glimpse(); } if (p === 'hunt') { horror(1, 0.4, 0.6); setMode('gone'); H.cool = 0; } return true; },
    sit(x, z) { if (!her) return false; sitAt(x, z); return true; },
    reveal() { if (!her) return false; H.phase = 'reveal'; H.t = 0; return true; },
    face({ turn = 0, split = 0, crack = 0, black = 0, tilt = 0 } = {}) { Object.assign(her.S, { turn, split, crack, black, tilt }); return true; },
    crawl(x, z, supine = false) { if (!her) return false; H.phase = 'hunt'; setMode('hold'); scuttle(supine); her.S.P.set(x, groundAt(x, z), z); her.S.F.set(camera.position.x - x, 0, camera.position.z - z).normalize(); her.S.N.set(0, 1, 0); her.place(true); return true; },
    charge(dd = 12) { if (!her) return false; camera.getWorldDirection(fwd); const x = camera.position.x + fwd.x * dd, z = camera.position.z + fwd.z * dd; this.crawl(x, z); setMode('charge'); return true; },
    scare() { if (!her) return false; this.crawl(camera.position.x + 2, camera.position.z - 2); setMode('lunge'); sound.shriek(her.S.P); H.flash = 1; return true; },
    tk(dd = 11) { if (!her) return false; camera.getWorldDirection(fwd); this.crawl(camera.position.x + fwd.x * dd, camera.position.z + fwd.z * dd); setMode('tk'); tkStart(); return true; },
    // (hold: stop her at that point of the route, held there, for looking)
    climb(kind = 'ceiling', hold = -1) {
      if (!her) return false; H.phase = 'hunt'; scuttle(false); H.route = kind === 'ceiling' ? routeCeiling() : routeParapet(); H.ri = 0;
      const w = H.route[hold >= 0 ? Math.min(hold, H.route.length - 1) : 0]; her.S.P.copy(w.p); her.S.N.copy(w.n);
      if (hold >= 0) { const nx = H.route[Math.min(hold + 1, H.route.length - 1)]; her.S.F.subVectors(nx.p, w.p); if (her.S.F.lengthSq() < 1e-6) her.S.F.set(0, 0, -1); her.S.F.normalize(); }
      her.place(true); setMode(hold >= 0 ? 'hold' : 'climb'); return true;
    },
    horror(dd = 1, p = 0, f = 0) { if (!world) return false; horror(dd, p, f); return true; },
    drift(x, z) { H.drift.set(x, z); door.place(x, z); return true; },
    /** her streams and clock restarted (for the tests: after the paint's come, however long it took) */
    settle() { rD = rng(1504); rH = rng(1506); clock = 0; H.t = H.mt = 0; H.losAt = 0; if (her) her.S.twAt = 0; return true; },
    grin(v = 0.8, sec = 4) { B.grin = v; B.grinT = B.now + sec; return true; },
  };
  addFloor(fl);
}
