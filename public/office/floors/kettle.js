// THE VILLAGE ON THE ICE: behind a painting on the restricted level (B3, restricted.js). Down a long room far out to the
// south, on its end wall, a small naive oil in a painted country frame: a winter village at dusk, a giant blue enamel
// kettle that's a house, a crumbling brick wall and little snowy houses, a big frozen lake full of skaters, sunflowers
// walking on stick legs (kettle-painting.js has where, the frame and the paint). From across the room it's a picture.
// Closer, it moves: the snow falls, the skaters go round. Walk into it and you're there. It's seamless both ways
// (painting-door.js, systems/portal.js), and out there the same frame hangs in the air with B3 through it.
// Out there (kettle-world.js): the snowfield, the lake, the wall with its gateway and stair, the houses, the golden tree
// and washing line, the dock, the fishing hole, benches and an easel sign. The kettle (kettle-house.js): its door opens
// at the top of a stair; inside, a stove, tea on the table, a ladder up into the lid and a chair at a round window. The
// people, dogs and sunflowers (kettle-folk.js). The sound (kettle-sound.js).
// Here: how you move (on the snow you walk; on the ice you skate, gliding, a push at a time; up stairs, the wall's top,
// the dock, through the kettle's door and up its ladder), snowballs (click at nothing, or F), what you can click, the
// map, a reload, and the debug hooks.
// Its own unlisted, carless floor; your car waits on B3. Nothing of it is built until you first come near the painting (it
// builds a slice a frame from 70 m), and nothing of it runs unless you're out there or looking in.
// Debug: ctx.kettle (window.__office.kettle): .go(x, z, yaw, pitch) out there (the frame's at the origin, its plane z = 0,
// the village toward -z; yaw 0 faces the kettle), .painting(x, z, yaw, pitch) on B3 in front of it, .inside(x, z, yaw,
// pitch) in the kettle (its own frame: the door toward +z), .loft(yaw, pitch) up in its lid at the window, .door(open),
// .whistle(), .stoke(), .skate(vx, vz) a push on the ice, .throw(), .pet(k), .peer() at the fishing hole, .sit(i) a bench.

import * as THREE from 'three';
import { EYE, clamp, damp, rng } from '../util.js';
import { makePaintingDoor } from './painting-door.js';
import { paintPane } from './plain-painting.js';
import { CANVAS, findKettle, kettlePassShader, makeKettleFrame, VARNISH } from './kettle-painting.js';
import { buildWorld, ICE, L } from './kettle-world.js';
import { buildKettle, K, radiusAt } from './kettle-house.js';

const R0 = K.R0, OUT = K.belly + 0.4;   // the door's plane; as near as you get to the kettle outside
import { buildFolk } from './kettle-folk.js';
import { makeSound } from './kettle-sound.js';

const N = -7;
const angd = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const random = Math.random;
  Math.random = rng(1990);
  try { setup(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function setup(ctx) {
  const { camera, style, mapCtx, addFloor, hud, renderer } = ctx;
  const fl = { n: N, label: 'THE VILLAGE', title: 'The village on the ice', unlisted: true, carless: true, liftGone: true, home: -3, on: false, composer: null,
    colliders: [], hits: [], scene: new THREE.Scene(), sound: { kind: 'kettle', steps: true }, built: false };
  let W = null, KT = null, folk = null, sound = null, kg = null, balls = null, compiled = false;
  const KX = L.kettle.x, KZ = L.kettle.z, here = () => ctx.away === fl;
  // you, out there: your velocity (skating), where you are in the kettle, the door, a climb, peering into the hole
  const S = { vx: 0, vz: 0, surface: 'snow', inside: false, loft: false, open: 0, openTo: 0, climb: null, peer: 0, stoke: 0, pushT: 0, roll: 0, splat: 0 };
  style.textContent += `.of-kettle .of-clock { font-size: 0 !important; } .of-kettle .of-clock::after { content: '❄'; font-size: 12px; }
    .of-kettle-splat { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at 50% 55%, rgba(250,250,255,.95) 0 18%, rgba(240,240,250,.7) 30%, rgba(240,240,250,0) 62%); }`;
  const splat = document.createElement('div'); splat.className = 'of-kettle-splat'; hud.appendChild(splat);

  const door = makePaintingDoor(ctx, fl, {
    at: findKettle(ctx.restr), size: CANVAS, key: 'kettle', near: 32, far: 70, seed: 1991, hud: 'of-kettle',
    frame: (R, o) => makeKettleFrame(R, o), paint: (p) => paintPane(p, { size: CANVAS, varnish: VARNISH }), pass: kettlePassShader,
    *build(R) {
      W = yield* buildWorld(fl, R); yield;
      KT = yield* buildKettle(R, { time: W.time, puffs: W.puffs, brush: W.brush }); yield;
      kg = KT.g; kg.position.set(KX, 0, KZ); W.root.add(kg);
      kg.updateMatrixWorld(true);
      folk = buildFolk(R, { scene: W.root, heightAt: W.heightAt, brush: W.brush, sound: { hello: (...a) => here() && sound?.hello(...a), laugh: (...a) => here() && sound?.laugh(...a), bark: (...a) => here() && sound?.bark(...a), happy: (...a) => here() && sound?.happy(...a) },
        throwBall: (...a) => balls?.throw(...a) }); yield;
      sound = makeSound(ctx, { tunePos: { x: -20.2, y: 1.2, z: -22.7 } });
      balls = makeBalls();
      // what you can point at: the world's, the kettle's (its body by a plain proxy, cheap to hit), the ladder
      const proxy = (geo, ud) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false })); m.userData = ud; kg.add(m); m.updateMatrixWorld(true); return m; };
      const body = proxy(new THREE.CylinderGeometry(3.0, 4.1, 9.6, 16).translate(0, 5.0, 0), { action: 'kettle-kettle', reach: 12 });
      const ladder = proxy(new THREE.BoxGeometry(0.7, K.loft - K.floor + 1.2, 0.5).translate(KT.LAD.x, (K.floor + K.loft + 1.2) / 2, KT.LAD.z), { action: 'kettle-ladder', reach: 3 });
      ladder.material.side = THREE.DoubleSide;
      const chair = proxy(new THREE.BoxGeometry(0.6, 1.0, 0.6).translate(Math.sin(K.WIN_A) * 2.75, K.loft + 0.5, Math.cos(K.WIN_A) * 2.75), {});
      chair.userData.seat = { name: 'A chair at the window', x: KX + Math.sin(K.WIN_A) * 2.75, z: KZ + Math.cos(K.WIN_A) * 2.75, rotY: K.WIN_A + Math.PI, eye: K.loft + 1.15, obj: chair, floor: N, loft: true };
      fl.hits.push(...W.hits, ...KT.hits.filter((h) => h.userData.action !== 'kettle-kettle'), body, ladder, chair);
      // its shaders compiled before it's first looked into (not as it is), then everything in it drawn once, out of sight
      // (a program's first draw costs the GPU a moment of its own: ANGLE on Metal)
      renderer.compileAsync(fl.scene, camera).then(prime, prime);
      return {
        sound, cols: W.cols, ready: () => compiled,
        seen(mp, dt, t) { W.view(mp, t); tick(dt, t, mp, false); },
        fx(dt, t) { W.view(camera.position, t); tick(dt, t, camera.position, true); },
        arrive() { door.pose(0, -2.4, 0, 0); },
      };
    },
    hover: {
      painting: (near) => (near < 1.6 ? '<b>The painting</b><div class="k">Cold air coming off it, and a waltz, faintly. Walk into it</div>'
        : '<b>A small oil painting</b><div class="k">A snowy village at dusk, skaters on a lake, a kettle as big as a house. The snow in it is falling</div>'),
      frame: (front) => (front ? '<b>The painting</b><div class="k">B3 through it, its yellow rooms. Walk back into it</div>'
        : '<b>The back of a canvas</b><div class="k">Hanging in the snowy air, from nothing</div>'),
    },
  });

  function prime() {
    const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType }), culled = [], cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    fl.scene.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    const prev = renderer.getRenderTarget();
    try { renderer.setRenderTarget(rt); renderer.render(fl.scene, cam); } finally { renderer.setRenderTarget(prev); for (const o of culled) o.frustumCulled = true; rt.dispose(); }
    compiled = true;
  }

  // ----- snowballs: a few in flight at once, one draw call; a puff and a thump where they land -----
  function makeBalls() {
    const NB = 10, im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 1), new THREE.MeshLambertMaterial({ color: '#f4f2fa' }), NB);
    im.frustumCulled = false; W.root.add(im);
    const B = Array.from({ length: NB }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, who: '' }));
    const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < NB; k++) im.setMatrixAt(k, zero);
    let next = 0;
    const me = { x: 0, z: 0 };
    return {
      // from (x, y, z) to (tx, ty, tz) (ty null: your head) in an arc, or (fire) along your view
      throw(x, y, z, tx, ty, tz, who) {
        const b = B[next]; next = (next + 1) % NB;
        if (ty === null) ty = camera.position.y - 0.1;
        const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz), T = Math.max(0.4, d / 11);
        Object.assign(b, { on: true, x, y, z, vx: dx / T, vz: dz / T, vy: (ty - y + 4.9 * T * T) / T, who, t: 0 });
      },
      fire(dir) {
        const b = B[next]; next = (next + 1) % NB;
        Object.assign(b, { on: true, x: camera.position.x + dir.x * 0.5, y: camera.position.y - 0.15 + dir.y * 0.5, z: camera.position.z + dir.z * 0.5, vx: dir.x * 15, vy: dir.y * 15 + 2.5, vz: dir.z * 15, who: 'you', t: 0 });
      },
      tick(dt, live) {
        let any = false;
        for (let k = 0; k < NB; k++) {
          const b = B[k];
          if (!b.on) continue;
          any = true;
          b.t += dt; b.vy -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          let land = b.y < W.heightAt(b.x, b.z) + 0.05 || b.t > 6;
          // the kettle, walls and houses, people
          const kx = b.x - KX, kz = b.z - KZ;
          if (!land && b.y < 10 && Math.hypot(kx, kz) < radiusAt(Math.max(0, b.y)) + 0.05) land = true;
          if (!land) for (const c of W.cols) if (b.x > c.minX && b.x < c.maxX && b.z > c.minZ && b.z < c.maxZ && b.y < (c.top === Infinity ? 6 : c.top + 0.5)) { land = true; break; }
          if (!land && b.who !== 'kid' && b.who !== 'back') {
            const h = folk.hitTest(b.x, b.y, b.z);
            if (h) { land = true; me.x = camera.position.x; me.z = camera.position.z; folk.struck(h, me, false); }
          }
          if (!land && b.who === 'back' && live && Math.hypot(b.x - camera.position.x, b.y - camera.position.y, b.z - camera.position.z) < 0.6) { land = true; S.splat = 1; }
          if (land) {
            b.on = false; im.setMatrixAt(k, zero);
            for (let j = 0; j < 12; j++) W.puffs.emit(b.x, b.y, b.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.4, 0.6 + Math.random() * 0.4, 1);
            if (live) sound.thump({ x: b.x, y: b.y, z: b.z });
          } else im.setMatrixAt(k, m4.makeTranslation(b.x, b.y, b.z));
        }
        if (any) im.instanceMatrix.needsUpdate = true;
      },
    };
  }

  // ----- each frame out there (live) or seen through the painting -----
  const me = { x: 0, z: 0, fx: 0, fz: -1, on: false, look: (x, z) => { const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz) || 1; return (dx * me.fx + dz * me.fz) / d; } };
  const fwd = new THREE.Vector3();
  let steamT = 0;
  function tick(dt, t, p, live) {
    camera.getWorldDirection(fwd);
    const n = Math.hypot(fwd.x, fwd.z) || 1;
    Object.assign(me, { x: p.x, z: p.z, fx: fwd.x / n, fz: fwd.z / n, on: live });
    W.tick(dt, t);
    folk.update(dt, t, me);
    balls.tick(dt, live);
    KT.tick(t, S.stoke);
    S.stoke = Math.max(0, S.stoke - dt * 0.4);
    // the door swinging
    if (S.open !== S.openTo) { S.open = S.openTo > S.open ? Math.min(S.openTo, S.open + dt * 1.3) : Math.max(S.openTo, S.open - dt * 1.3); KT.door.rotation.y = K.DOOR_A + 1.55 * S.open * S.open * (3 - 2 * S.open); }
    // steam from the spout, always a little; a lot when it whistles
    steamT += dt;
    const whistling = S.whistle > 0;
    if (whistling) S.whistle -= dt;
    if (steamT > (whistling ? 0.03 : 0.16)) {
      steamT = 0;
      const tp = KT.tip;
      W.puffs.emit(KX + tp.x + 0.1, tp.y + 0.1, KZ + tp.z, 0.6 + Math.random() * (whistling ? 3.5 : 0.5), 0.5 + Math.random() * (whistling ? 2.0 : 0.4), (Math.random() - 0.5) * (whistling ? 1.2 : 0.4), whistling ? 1.3 : 0.6, whistling ? 2.6 : 3.2, 0.9);
    }
    if (live) {
      const what = sound.fx(dt, t, { surface: S.surface, speed: Math.hypot(S.vx, S.vz), inside: S.inside, stove: S.stoke });
      if (what === 'whistle') whistle();
      if (S.splat > 0) { S.splat = Math.max(0, S.splat - dt * 0.7); splat.style.opacity = String(Math.min(1, S.splat * 1.6)); }
    }
  }
  function whistle() { S.whistle = 3.2; sound?.whistle({ x: KX + KT.tip.x, y: KT.tip.y, z: KZ + KT.tip.z }); }

  // ----- moving: walking, skating, stairs, the kettle -----
  const local = (x, z) => [x - KX, z - KZ];
  const inSector = (lx, lz, half) => { const r = Math.hypot(lx, lz); return r > 0.1 && Math.abs(angd(Math.atan2(lx, lz) - K.DOOR_A)) < half / r; };
  // the ground under you, given where you are in the kettle
  function groundAt(x, z) {
    const [lx, lz] = local(x, z), r = Math.hypot(lx, lz);
    if (S.inside) return S.loft ? K.loft : K.floor;
    if (inSector(lx, lz, 0.75) && r < R0 + 2.75) {
      if (r < R0 + 1.25) return K.floor;
      const k = Math.floor((r - R0 - 1.25) / 0.3);
      return Math.max(W.heightAt(x, z), K.floor - 0.2 * (k + 1));   // (five steps, the last 0.2 off the snow)
    }
    const w = W.onWall(x, z); if (w !== null) return w;
    const d = W.dockAt(x, z); if (d !== null) return d;
    return W.heightAt(x, z);
  }
  // keeps p (moving from q) out of the kettle's walls; S.inside follows you through the door
  function kettleWalls(p, q) {
    const [lx, lz] = local(p.x, p.z), r = Math.hypot(lx, lz), [qx, qz] = local(q.x, q.z), r0 = Math.hypot(qx, qz);
    const put = (rr) => { const k = rr / (r || 1); p.x = KX + lx * k; p.z = KZ + lz * k; };
    if (S.inside) {
      if (S.loft) { if (r > K.loftR - 0.35) put(K.loftR - 0.35); return; }
      const gap = S.open > 0.8 && inSector(lx, lz, K.doorW / 2 - 0.22);
      if (gap) { if (r > R0) S.inside = false; return; }
      if (r > K.inR) put(K.inR);
      return;
    }
    if (r0 > R0 + 3 && r > R0 + 3) return;
    const onLanding = inSector(lx, lz, 0.72) && r < R0 + 2.8;
    if (onLanding) {
      const gap = S.open > 0.8 && inSector(lx, lz, K.doorW / 2 - 0.22);
      if (gap && r < R0) { S.inside = true; return; }
      if (!gap && r < R0 + 0.45) put(R0 + 0.45);
      return;
    }
    // round its belly (at your head's height it bulges out further), not up the stair's sides
    if (r < OUT) put(OUT);
  }
  function collide(p, feet) {
    const r = 0.3;
    for (const b of fl.colliders) {
      if (b.top !== undefined && feet > b.top - 0.35) continue;
      if (S.inside) continue;
      const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
      else {
        const pen = [[p.x - b.minX, -1, 0], [b.maxX - p.x, 1, 0], [p.z - b.minZ, 0, -1], [b.maxZ - p.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
        if (pen[1]) p.x = pen[1] < 0 ? b.minX - r : b.maxX + r; else p.z = pen[2] < 0 ? b.minZ - r : b.maxZ + r;
      }
    }
    if (S.inside) {   // the stove, the table, the ladder, the cupboard, the bed
      const lvl = S.loft ? K.loft : K.floor;
      for (const [sx, sz, sr, sl] of KT.solids) {
        if (sl !== lvl) continue;
        const dx = p.x - KX - sx, dz = p.z - KZ - sz, d = Math.hypot(dx, dz);
        if (d < sr && d > 1e-4) { p.x = KX + sx + dx / d * sr; p.z = KZ + sz + dz / d * sr; }
      }
    } else if (feet < 1) folk.push(p);
    // as far as you can go: the haze gives back gently
    const ox = p.x - L.centre.x, oz = p.z - L.centre.z, o = Math.hypot(ox, oz);
    if (o > L.R) { p.x = L.centre.x + ox / o * L.R; p.z = L.centre.z + oz / o * L.R; S.vx *= 0.5; S.vz *= 0.5; }
  }
  const prev = { x: 0, z: 0 };
  fl.walk = (dt, keys) => {
    const P = ctx.player;
    dt = Math.min(dt, 0.05);
    let f = 0, s = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
    // a climb up or down the ladder: carried, a rung at a time
    if (S.climb) {
      const c = S.climb; c.t += dt / 2.4;
      const u = Math.min(1, c.t), e = u * u * (3 - 2 * u);
      P.x = KX + c.x; P.z = KZ + c.z0 + (c.z1 - c.z0) * (c.up ? Math.max(0, (e - 0.8) / 0.2) : Math.min(1, e / 0.2));
      P.fy = c.y0 + (c.y1 - c.y0) * e + Math.sin(u * Math.PI * 12) * 0.02;
      if (u >= 1) { S.climb = null; S.loft = c.up; P.fy = c.y1; }
      ctx.setCam({ x: P.x, y: EYE + P.fy, z: P.z, yaw: P.yaw, pitch: P.pitch });
      return;
    }
    if ((f || s) && P.seated) { const st = P.seat; P.x += Math.sin(st.rotY) * 0.55; P.z += Math.cos(st.rotY) * 0.55; P.seated = false; P.seat = null; }
    if ((f || s) && S.peer) S.peer = 0;
    if (P.seated && !P.seat) P.seated = false;
    if (P.seated) { ctx.setCam({ x: P.x, y: P.seat.eye, z: P.z, yaw: P.yaw, pitch: P.pitch }); return; }
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), nn = Math.hypot(f, s) || 1;
    const ix = (-sy * f + cy * s) / nn, iz = (-cy * f - sy * s) / nn;
    if (S.carry) { S.carry = false; const sp = (f || s) ? (fast ? 8.5 : 4.4) : 0; S.vx = ix * sp; S.vz = iz * sp; }
    prev.x = P.x; prev.z = P.z;
    const feet = P.fy || 0;
    const onIce = !S.inside && W.shore.at(P.x, P.z) < 0.2 && W.dockAt(P.x, P.z) === null && feet < 0.2;
    S.surface = onIce ? 'ice' : S.inside || W.dockAt(P.x, P.z) !== null || (feet > 0.3 && W.onWall(P.x, P.z) === null) ? 'wood' : 'snow';
    if (onIce) {
      // skating: a push accelerates you the way you're pointing; you glide on, and the skates turn your way slowly
      const acc = (f || s) ? (fast ? 7 : 4.5) : 0, max = fast ? 10 : 7;
      S.vx += ix * acc * dt; S.vz += iz * acc * dt;
      const v = Math.hypot(S.vx, S.vz);
      if (v > 0.3 && (f || s)) {   // the blades carry you round toward where you're heading
        const want = Math.atan2(ix, iz), cur = Math.atan2(S.vx, S.vz), turn = clamp(angd(want - cur), -dt * 1.6, dt * 1.6);
        S.vx = Math.sin(cur + turn) * v; S.vz = Math.cos(cur + turn) * v;
      }
      const fr = Math.exp(-dt * (f || s ? 0.15 : 0.32)); S.vx *= fr; S.vz *= fr;
      if (v > max) { S.vx *= max / v; S.vz *= max / v; }
      S.pushT -= dt;
      if ((f || s) && S.pushT < 0) { S.pushT = fast ? 0.45 : 0.62; sound?.push(); }
      // lean into the turn
      const lat = (S.vx * cy - S.vz * -sy) * 0;
      S.roll = damp(S.roll, clamp(-(ix * S.vz - iz * S.vx) * 0.012, -0.05, 0.05) + lat, 4, dt);
    } else {
      // walking: snappy, but momentum off the ice carries you a step (a little slide)
      const sp = (f || s) ? (fast ? 8.5 : 4.4) : 0;
      const k = 1 - Math.exp(-dt * (S.vx * S.vx + S.vz * S.vz > 30 ? 3 : 14));
      S.vx += (ix * sp - S.vx) * k; S.vz += (iz * sp - S.vz) * k;
      S.roll = damp(S.roll, 0, 6, dt);
    }
    P.x += S.vx * dt; P.z += S.vz * dt;
    kettleWalls(P, prev);
    collide(P, feet);
    // bumped into something on the ice: the speed goes
    const mx = (P.x - prev.x) / dt, mz = (P.z - prev.z) / dt;
    if (Math.hypot(mx - S.vx, mz - S.vz) > 0.5) { S.vx = mx; S.vz = mz; }
    P.eye = damp(P.eye, S.peer ? 0.75 : EYE, 4, dt);
    P.fy = damp(P.fy || 0, groundAt(P.x, P.z), 14, dt);
    const walking = (f || s) && !onIce;
    const bob = walking ? Math.sin(performance.now() / 140) * 0.025 : onIce ? Math.sin(performance.now() / 420) * 0.012 * Math.min(1, Math.hypot(S.vx, S.vz) / 4) : 0;
    ctx.setCam({ x: P.x, y: P.eye + bob + P.fy, z: P.z, yaw: P.yaw, pitch: P.pitch });
    camera.rotation.z = S.roll;
  };
  // through the painting you arrive walking: at your walking speed already (no slowing at the threshold)
  const enter0 = fl.enter;
  fl.enter = () => { enter0(); S.vx = S.vz = 0; S.carry = true; };
  fl.ground = (x, z) => groundAt(x, z);
  fl.bound = () => {};
  fl.pick = (ray) => {
    if (!folk) return null;
    const h = folk.pick(ray, 4);
    if (!h) return null;
    // (only if nothing nearer's in the way)
    const near = ray.intersectObjects(fl.hits, true)[0];
    if (near && near.distance < h.d) return null;
    return { action: h.kind === 'dog' ? 'kettle-dog' : 'kettle-person', info: h.k };
  };
  fl.unstick = () => { Object.assign(S, { inside: false, loft: false, climb: null, peer: 0, vx: 0, vz: 0 }); door.pose(0, -2.4, 0, 0); return true; };

  // ----- clicking -----
  const pos = (x, y, z) => ({ x, y, z });
  ctx.action('kettle-kettle', { hover: () => '<b>The kettle</b><div class="k">Enamel, chipped, warm to the touch. Click to make it whistle</div>', click: () => { whistle(); } });
  ctx.action('kettle-door', {
    hover: () => (S.open > 0.5 ? '<b>The kettle\'s door</b><div class="k">Warm light and the smell of woodsmoke. Click to close it</div>' : '<b>A little round-headed door</b><div class="k">In the kettle\'s belly. Click to open it</div>'),
    click: () => { S.openTo = S.openTo > 0.5 ? 0 : 1; sound?.creak(pos(KX + Math.sin(K.DOOR_A) * 5, 2.2, KZ + Math.cos(K.DOOR_A) * 5)); },
  });
  ctx.action('kettle-ladder', {
    hover: () => (S.loft ? '<b>The ladder</b><div class="k">Click to climb down</div>' : '<b>A ladder</b><div class="k">Up into the lid. Click to climb</div>'),
    click: () => climb(!S.loft),
  });
  ctx.action('kettle-stove', { hover: () => '<b>The stove</b><div class="k">Crackling. A little kettle on top, of course. Click to put a log on</div>',
    click: () => { S.stoke = 1; sound?.stoke(pos(KX + KT.STOVE.x, 1.6, KZ + KT.STOVE.z)); } });
  ctx.action('kettle-art', { hover: () => '<b>Small paintings</b><div class="k">A sunflower, a kettle, skaters on the ice. Not for sale today, it says underneath</div>' });
  ctx.action('kettle-easel', { hover: () => '<b>A hand-painted sign</b><div class="k">Paintings · ask inside. Someone\'s added: tea · warm stove · open</div>' });
  ctx.action('kettle-hole', { hover: () => (S.peer ? '<b>The fishing hole</b><div class="k">Black water, very cold. Something moves under it. Move to stand up</div>' : '<b>A fishing hole</b><div class="k">Cut through the ice. Click to crouch and look in</div>'),
    click: () => peer() });
  ctx.action('kettle-dog', { hover: (h) => (folk.D[h.info].sit > 0 ? '<b>A good dog</b><div class="k">Very pleased with you</div>' : '<b>A dog</b><div class="k">Click to pet it</div>'),
    click: (h) => folk.pet(h.info) });
  ctx.action('kettle-person', { hover: (h) => { const p = folk.P[h.info]; return `<b>${{ loop: 'A skater', line: 'A skater', kid: 'A child', stroll: 'Someone out walking', chat: 'Someone chatting', fish: 'Someone fishing', music: 'The accordion player', dogwalk: 'Someone walking their dog' }[p.kind]}</b><div class="k">${p.kind === 'fish' ? 'Nothing yet, they say. Nothing all winter' : p.kind === 'music' ? 'Playing a waltz, a little out of tune' : 'They nod to you'}</div>`; },
    click: (h) => { const p = folk.P[h.info]; p.waved = -99; p.wave = 2; sound?.hello(pos(p.x, 1.4, p.z), p.s < 0.8); } });
  function climb(up) {
    if (S.climb || !S.inside) return;
    const P = ctx.player;
    // at its foot, a little back from it; up, off the hatch onto the loft's floor toward the middle
    S.climb = { up, t: 0, x: KT.LAD.x, z0: KT.LAD.z + (up ? 0.55 : 1.35), z1: KT.LAD.z + (up ? 1.35 : 0.55), y0: up ? K.floor : K.loft, y1: up ? K.loft : K.floor };
    P.yaw = 0; P.pitch = up ? 0.5 : -0.4;   // facing the ladder (toward -z in the kettle)
    sound?.creak(pos(KX + KT.LAD.x, 2, KZ + KT.LAD.z));
  }
  function peer() {
    const P = ctx.player, H = L.hole;
    const a = Math.atan2(P.x - H.x, P.z - H.z);
    P.x = H.x + Math.sin(a) * 0.95; P.z = H.z + Math.cos(a) * 0.95; P.yaw = a; P.pitch = -1.0; S.peer = 1; S.vx = S.vz = 0;
  }
  // snowballs: a click at nothing out there, or F
  const throwBall = () => {
    if (ctx.away !== fl || ctx.mode !== 'free' || S.inside || !balls) return false;
    camera.getWorldDirection(fwd); balls.fire(fwd); return true;
  };
  renderer.domElement.addEventListener('click', () => { if (ctx.away === fl && ctx.locked && !ctx.hover) throwBall(); });
  ctx.key('KeyF', () => throwBall());

  // ----- a reload -----
  fl.save = () => ({ inside: S.inside, loft: S.loft, open: S.openTo });
  fl.restore = (s, p) => {
    Object.assign(S, { inside: !!s.inside, loft: !!s.loft && !!s.inside, open: s.open ? 1 : 0, openTo: s.open ? 1 : 0, climb: null, peer: 0, vx: 0, vz: 0 });
    if (KT) KT.door.rotation.y = K.DOOR_A + 1.55 * S.open;
    door.restore(p);
    const P = ctx.player, [lx, lz] = local(P.x, P.z), r = Math.hypot(lx, lz);
    // never left in anything: inside but not in it, or in a wall or a house: back by the frame
    const bad = S.inside ? r > K.inR + 0.1 : r < OUT - 0.1 || fl.colliders.some((b) => b.top === undefined && P.x > b.minX && P.x < b.maxX && P.z > b.minZ && P.z < b.maxZ);
    if (bad) { S.inside = S.loft = false; door.pose(0, -2.4, 0, 0); }
    P.fy = groundAt(P.x, P.z);
    return true;
  };

  // ----- the map: the lake's shore, the kettle, the wall, the frame -----
  fl.map = () => {
    const c = mapCtx, MW = 440, MH = 330, Km = 2.2;
    c.clearRect(0, 0, MW, MH);
    c.fillStyle = 'rgba(226,222,236,.45)'; c.fillRect(0, 0, MW, MH);
    const px = (x) => MW / 2 + (x - camera.position.x) * Km, pz = (z) => MH / 2 + 10 + (z - camera.position.z) * Km;
    if (W) {
      c.beginPath(); W.shore.pts.forEach(([x, z], k) => (k ? c.lineTo(px(x), pz(z)) : c.moveTo(px(x), pz(z)))); c.closePath();
      c.fillStyle = 'rgba(140,150,176,.75)'; c.fill();
      c.fillStyle = 'rgba(150,90,70,.9)'; c.fillRect(px(L.wall.x0), pz(L.wall.z - 0.35), (L.wall.x1 - L.wall.x0) * Km, Math.max(2, 0.7 * Km));
      c.fillStyle = 'rgba(140,110,90,.8)'; for (const b of W.cols) if (b.maxX - b.minX > 2.5 && b.maxZ - b.minZ > 2.5) c.fillRect(px(b.minX), pz(b.minZ), (b.maxX - b.minX) * Km, (b.maxZ - b.minZ) * Km);
      c.fillStyle = 'rgba(76,99,144,.95)'; c.beginPath(); c.arc(px(KX), pz(KZ), K.belly * Km, 0, 7); c.fill();
      c.font = '600 14px system-ui'; c.fillStyle = 'rgba(40,40,70,.9)'; c.fillText('the kettle', px(KX) + 14, pz(KZ) - 6);
    }
    c.fillStyle = 'rgba(200,160,80,.95)'; c.fillRect(px(-0.65), pz(0) - 2, 1.3 * Km, 4);
    c.save(); c.translate(MW / 2, MH / 2 + 10); c.rotate(-ctx.player.yaw);
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(40,40,70,.8)'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(40,40,70,.85)'; c.fillText('❄', 16, 30);
  };

  // ----- getting you there, for the tests and for looking -----
  ctx.kettle = {
    fl, S, st: door.st, F: door.F, at: door.at, get built() { return fl.built; }, build: door.build, get folk() { return folk; }, get world() { return W; },
    go(x = 0, z = -2.4, yaw = 0, pitch = 0) { Object.assign(S, { inside: false, loft: false, climb: null, peer: 0, vx: 0, vz: 0 }); const ok = door.go(x, z, yaw, pitch); ctx.player.fy = groundAt(x, z); return ok; },
    painting: door.painting, into: door.into,
    inside(x = 0, z = 2.5, yaw = 0, pitch = 0) { if (!door.go(KX + x, KZ + z, yaw, pitch)) return false; Object.assign(S, { inside: true, loft: false, climb: null, peer: 0, vx: 0, vz: 0 }); ctx.player.fy = K.floor; return true; },
    loft(yaw = K.WIN_A + Math.PI, pitch = 0.0) {   // (a step back from the window, looking out of it)
      const x = Math.sin(K.WIN_A) * 1.2, z = Math.cos(K.WIN_A) * 1.2;
      if (!door.go(KX + x, KZ + z, yaw, pitch)) return false; Object.assign(S, { inside: true, loft: true, climb: null, peer: 0, vx: 0, vz: 0 }); ctx.player.fy = K.loft; return true;
    },
    door(open = true) { S.openTo = open ? 1 : 0; S.open = S.openTo; if (KT) KT.door.rotation.y = K.DOOR_A + 1.55 * S.open; return true; },
    whistle() { if (!KT) return false; whistle(); return true; },
    stoke() { S.stoke = 1; return true; },
    skate(vx = 0, vz = -5) { S.vx = vx; S.vz = vz; return true; },
    throw: () => throwBall(),
    pet(k = 3) { folk?.pet(k); return !!folk; },
    peer() { if (ctx.away !== fl) return false; peer(); return true; },
    sit(i = 0) { const st = W?.seats[i]; if (!st) return false; ctx.sitIn(st); return true; },
    climb: (up = true) => climb(up),
  };
  addFloor(fl);
}
