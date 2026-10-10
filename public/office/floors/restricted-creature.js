// The thing on the restricted level (floors/restricted.js): what Hale's notes are about ("it learned the chime", "don't
// look away from it"). Tall, thin, too-long arms, no face, a flat black that the strip lights don't touch, its edges never
// quite still. It turns up now and then, more often the longer you're down here and the further you walk, seeded by the
// visit: behind you, at the end of a long view back the way you came, under a dead light, round a door frame, dropping out
// of the ceiling ahead, watching through a gap where a ceiling tile was, or only heard overhead, dragging itself away.
// It keeps its distance: it only moves while you're not looking at it, it backs off faster than you walk if you come at it,
// and if you run at it it bolts faster than you can run and goes up into the ceiling. It never comes within 9 m, never
// touches you, never jumps out. Near it the lights dim and stutter, the hum drops away and something very low comes up,
// and your own steps sometimes come back a beat late. One creature, a handful of meshes, no lights of its own.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, makeCanvas, rng } from '../util.js';

const NEAR = 9, BACK = 14, KEEP = 17, RUN = 12, WALK = 6;   // metres; metres a second (you walk 4.4, run 8.5)
const TILE = 0.6;   // the ceiling's tiles (restricted.js's ceiling texture: 2 x 2 to its 1.2 m repeat)

export function installCreature(ctx, restr, sound) {
  const { camera } = ctx;
  const { H, C, CH, X, Z } = restr.grid;
  const J = rng(1717);   // its shimmer, and anything else per frame: never Math.random (the harness seeds that)
  const c = { on: false, kind: '', R: rng(1), next: 0, x: 0, z: 0, born: 0, life: 0, seen: false, seenFor: 0, unseenFor: 0, losAt: 0,
    mode: '', stuck: 0, stepAt: 0, flee: null, above: null, gap: null, tile: null, peek: null, lean: 0, climb: null };

  // ----- the body: torso, head and legs in one mesh, the arms on pivots, a shell that won't hold still, a pale smear -----
  const g = new THREE.Group(), black = new THREE.MeshBasicMaterial({ color: '#020101', fog: true });
  const geo = (gm, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) => gm.scale(sx, sy, sz).rotateZ(rz).translate(x, y, z);
  const bodyG = mergeGeometries([
    geo(new THREE.CapsuleGeometry(0.13, 0.8, 4, 10), 0, 1.6, 0, 1, 1, 0.55),
    geo(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 8), 0, 2.12, 0),
    geo(new THREE.SphereGeometry(0.13, 12, 10), 0, 2.33, 0.01, 0.82, 1.35, 0.9),
    geo(new THREE.CylinderGeometry(0.03, 0.05, 1.22, 8), -0.075, 0.6, 0, 1, 1, 1, -0.04),
    geo(new THREE.CylinderGeometry(0.03, 0.05, 1.22, 8), 0.075, 0.6, 0, 1, 1, 1, 0.04),
  ]);
  const body = new THREE.Mesh(bodyG, black);
  const shell = new THREE.Mesh(bodyG, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false, fog: true }));
  const arms = [-1, 1].map((s) => {   // hanging from the shoulders to below the knees, a long hand on each
    const p = new THREE.Group(); p.position.set(s * 0.19, 2.0, 0);
    const a = new THREE.Mesh(mergeGeometries([geo(new THREE.CylinderGeometry(0.022, 0.03, 1.4, 6), 0, -0.7, 0),
      geo(new THREE.BoxGeometry(0.05, 0.3, 0.02), 0, -1.53, 0)]), black);
    p.add(a); p.rotation.z = s * 0.06; g.add(p); return p;
  });
  const smear = makeCanvas(64, 96), sc = smear.ctx, sg = sc.createRadialGradient(32, 46, 2, 32, 48, 30);
  sg.addColorStop(0, 'rgba(225,215,190,.5)'); sg.addColorStop(1, 'rgba(225,215,190,0)'); sc.fillStyle = sg; sc.fillRect(0, 0, 64, 96); smear.tex.needsUpdate = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.22), new THREE.MeshBasicMaterial({ map: smear.tex, transparent: true, opacity: 0.55, depthWrite: false, fog: true }));
  face.position.set(0, 2.33, 0.125);
  g.add(body, shell, face); g.visible = false; restr.root.add(g);
  // A ceiling tile it moves, and the dark over it.
  const tileTex = restr.ceilTex.clone(); tileTex.repeat.set(0.5, 0.5); tileTex.needsUpdate = true;
  const tile = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.01, 0.018, TILE - 0.01), new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.95 }));
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000' }));
  const peer = face.clone(); peer.material = face.material.clone(); peer.rotation.x = Math.PI / 2 - 0.5;   // a face in the gap
  for (const m of [tile, hole, peer]) { m.visible = false; restr.root.add(m); }

  // ----- where things are -----
  const z0 = () => restr.z0;
  const hitAt = (x, z, r = 0.35) => restr.colliders.some((b) => x > b.minX - r && x < b.maxX + r && z + z0() > b.minZ - r && z + z0() < b.maxZ + r);
  const fwd = () => ({ x: -Math.sin(ctx.player.yaw), z: -Math.cos(ctx.player.yaw) });
  function clearFrom(x, z, dx, dz, max) {   // clear metres along (dx, dz)
    for (let d = 0.5; d < max; d += 0.5) if (hitAt(x + dx * d, z + dz * d, 0.25)) return d - 0.5;
    return max;
  }
  function inView(x, z, px, pz) {   // within your view's middle, nothing in the way
    const f = fwd(), dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
    if ((dx * f.x + dz * f.z) / d < Math.cos(0.75)) return false;
    return clearFrom(px, pz, dx / d, dz / d, d - 0.6) >= d - 0.7;
  }
  const snap = (v) => Math.floor(v / TILE) * TILE + TILE / 2;
  // Somewhere for it: `test(x, z, d)` over points round you, from its seeded stream.
  function spot(px, pz, test, ahead = false, d0 = 13, d1 = 26, tries = 60) {   // ahead: in your view's middle
    const f = fwd(), a0 = Math.atan2(f.z, f.x);
    for (let k = 0; k < tries; k++) {
      const a = ahead ? a0 + (c.R() - 0.5) * 1.1 : c.R() * Math.PI * 2, d = d0 + c.R() * (d1 - d0), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (!hitAt(x, z, 0.45) && test(x, z, d)) return { x, z };
    }
    return null;
  }
  const behind = (x, z, px, pz) => { const f = fwd(); return ((x - px) * f.x + (z - pz) * f.z) / Math.hypot(x - px, z - pz) < -0.2; };

  // ----- showing up -----
  function show(x, z, kind) {
    Object.assign(c, { on: true, kind, x, z, born: c.t, life: 25 + c.R() * 45, seenFor: 0, unseenFor: 0, mode: 'still', stuck: 0, flee: null, peek: null, lean: 0, climb: null });
    g.visible = true; g.position.set(x, 0, z); g.scale.set(1, 1, 1);
    arms.forEach((p, i) => { p.rotation.x = 0; p.rotation.z = (i ? 1 : -1) * 0.06; });
  }
  function hide() { c.on = false; g.visible = false; sound.creature.dread(0); sound.creature.echo(null); }
  const pickKind = (k) => {   // what kind of turn, by how long and far you've been down here (k 0..1)
    const w = { overhead: 0.3, behind: 0.35, dead: 0.3, far: k > 0.25 ? 0.25 : 0, peek: k > 0.3 ? 0.3 : 0, gap: k > 0.45 ? 0.2 : 0, drop: k > 0.6 ? 0.2 : 0 };
    let r = c.R() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const [kk, v] of Object.entries(w)) if ((r -= v) < 0) return kk;
    return 'behind';
  };
  function appear(kind, px, pz) {
    const f = fwd(), chunks = [...restr.chunks.values()];
    if (kind === 'behind') { const s = spot(px, pz, (x, z) => behind(x, z, px, pz)); if (s) show(s.x, s.z, kind); return !!s; }
    if (kind === 'far') {   // at the end of the long view back the way you came
      const d = clearFrom(px, pz, -f.x, -f.z, 30);
      if (d < 18) return false;
      show(px - f.x * Math.min(d - 1, 26), pz - f.z * Math.min(d - 1, 26), kind); return true;
    }
    if (kind === 'dead') {   // under a light that's gone out
      const s = chunks.flatMap((ch) => ch.dead).map((p) => ({ ...p, d: Math.hypot(p.x - px, p.z - pz) }))
        .filter((p) => p.d > 13 && p.d < 26 && !inView(p.x, p.z, px, pz) && !hitAt(p.x, p.z, 0.45)).sort((a, b) => a.d - b.d)[0];
      if (s) show(s.x, s.z, kind); return !!s;
    }
    if (kind === 'peek') {   // half round a door frame, on the far side of it, leaning out
      const s = chunks.flatMap((ch) => ch.doors).map((p) => ({ ...p, d: Math.hypot(p.x - px, p.z - pz) }))
        .filter((p) => p.d > 13 && p.d < 22).sort((a, b) => a.d - b.d)[0];
      if (!s) return false;
      const far = s.v ? Math.sign(s.x - px) : Math.sign(s.z - pz), side = c.R() < 0.5 ? -1 : 1, off = s.w / 2 + 0.28;
      const x = s.v ? s.x + far * 0.35 : s.x + side * off, z = s.v ? s.z + side * off : s.z + far * 0.35;
      if (hitAt(x, z, 0.2)) return false;
      show(x, z, kind); c.peek = { side, v: s.v };
      return true;
    }
    if (kind === 'overhead' || kind === 'drop' || kind === 'gap') {
      const s = kind === 'overhead' ? spot(px, pz, (x, z, d) => d < 16) : spot(px, pz, (x, z) => inView(x, z, px, pz), true, 11, kind === 'gap' ? 15 : 20);
      if (!s) return false;
      startAbove(s.x, s.z, kind === 'overhead' ? null : kind, px, pz);
      return true;
    }
    return false;
  }
  // Up into the ceiling at its feet (a tile lifts, it pulls itself up, the tile drops back), then along overhead.
  function climb(fast) {
    c.mode = 'climb';
    c.climb = { k: 0, dur: fast ? 0.35 : 0.7 };
    openTile(snap(c.x), snap(c.z));
    sound.creature.lift(c.x, c.z);
  }
  function startAbove(x, z, then, px, pz) {   // dragging itself overhead from (x, z) away from you, then maybe down again
    hide();
    const a = Math.atan2(z - pz, x - px) + (c.R() - 0.5), d = 6 + c.R() * 8;
    c.above = { x, z, tx: x + Math.cos(a) * d, tz: z + Math.sin(a) * d, k: 0, dur: 4 + c.R() * 4, then, creakAt: 0 };
    if (then) { c.above.tx = x; c.above.tz = z; c.above.dur = 1.5; }   // it's already where it's going: a creak, then the tile
  }
  function openTile(x, z) { c.tile = { x, z, k: 0, to: 1 }; tile.position.set(x, H + 0.009, z); hole.position.set(x, H - 0.002, z); }

  // ----- each frame -----
  c.t = 0;
  const creature = {
    enter(visit) {
      Object.assign(c, { R: rng(visit * 131 + 9), t: 0, next: 75 + 60 * rng(visit * 131 + 9)(), above: null, gap: null, tile: null });
      hide(); tile.visible = hole.visible = peer.visible = false;
    },
    leave() { hide(); c.above = c.gap = c.tile = null; tile.visible = hole.visible = peer.visible = false; },
    // The lights near it: how much of a point light at (x, z) is left (restricted.js).
    dim(x, z, t) {
      if (!c.on) return 1;
      const d = Math.hypot(x - c.x, z - c.z);
      return d > 6 ? 1 : 0.15 + 0.5 * (d / 6) * (Math.sin(t * 31 + d) > -0.3 ? 1 : 0.3);
    },
    near: (ch) => c.on && Math.abs(c.x - X(ch.ci * CH) - C * CH / 2) < 9 && Math.abs(c.z - Z(ch.cj * CH) - C * CH / 2) < 9,   // tubes stutter round it
    fx(dt, t, px, pz, riding, walked) {
      c.t += dt;
      // the tile: lifting and sliding aside, or settling back with a clack
      if (c.tile) {
        const T = c.tile, was = T.k;
        T.k = clamp(T.k + (T.to ? dt / 0.25 : -dt / 0.3), 0, 1);
        tile.visible = hole.visible = T.k > 0.02;
        tile.position.y = H + 0.009 + T.k * 0.1; tile.rotation.x = T.k * 0.5; tile.position.x = T.x + T.k * 0.08;
        if (!T.to && was > 0 && T.k === 0) { sound.creature.clack(T.x, T.z); c.tile = null; }
      }
      if (riding) return;
      const k = clamp(c.t / 900 + walked / 900, 0, 1);
      // overhead: creaks and a drag moving off, then down through a tile, or a face in the gap, or nothing
      if (c.above) {
        const A = c.above;
        A.k = Math.min(1, A.k + dt / A.dur);
        const x = A.x + (A.tx - A.x) * A.k, z = A.z + (A.tz - A.z) * A.k;
        if (c.t > A.creakAt) { sound.creature.creak(x, z); if (!A.then && c.R() < 0.4) sound.creature.drag(x, z); A.creakAt = c.t + 0.5 + c.R() * 1.1; }
        if (A.k === 1) {
          c.above = null;
          if (A.then === 'drop') { openTile(snap(x), snap(z)); show(snap(x), snap(z), 'drop'); c.mode = 'drop'; c.climb = { k: 1, dur: 0.6 }; sound.creature.lift(x, z); }
          else if (A.then === 'gap') { openTile(snap(x), snap(z)); c.gap = { x: snap(x), z: snap(z), until: c.t + 3.5 + c.R() * 3 }; sound.creature.lift(x, z); }
          else c.next = c.t + 30 + c.R() * 40;
        }
      }
      if (c.gap) {   // watching through it: a pale smear in the dark, turned to you
        const G = c.gap;
        peer.visible = c.tile?.k > 0.6; peer.position.set(G.x, H + 0.08, G.z); peer.rotation.set(-Math.PI / 2 + 0.6, Math.atan2(px - G.x, pz - G.z), 0, 'YXZ');
        sound.creature.dread(0.6, G.x, G.z);
        if (c.t > G.until || Math.hypot(px - G.x, pz - G.z) < 8) { c.gap = null; peer.visible = false; if (c.tile) c.tile.to = 0; sound.creature.dread(0); c.next = c.t + 40 + c.R() * 50; }
      }
      // not here: maybe now
      if (!c.on && !c.above && !c.gap) {
        if (c.next === Infinity) c.next = c.t + (1 - k) * 110 + 45 + c.R() * 50;   // gone on its own
        if (c.t > c.next && c.t > 60 && walked > 50) {
          if (!appear(pickKind(k), px, pz)) c.next = c.t + 5;
          else c.next = Infinity;
        }
        return;
      }
      if (!c.on) return;
      const dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz);
      if (c.t > c.losAt) { c.seen = inView(c.x, c.z, px, pz); c.losAt = c.t + 0.1; }
      c.seenFor = c.seen ? c.seenFor + dt : 0; c.unseenFor = c.seen ? 0 : c.unseenFor + dt;
      // into or out of the ceiling
      if (c.mode === 'climb' || c.mode === 'drop') {
        const C = c.climb, up = c.mode === 'climb';
        C.k = clamp(C.k + (up ? dt : -dt) / C.dur, 0, 1);
        const e = C.k * C.k;
        arms.forEach((p, i) => { p.rotation.x = Math.PI * Math.min(1, C.k * 2.5); p.rotation.z = (i ? 1 : -1) * (0.06 + 0.2 * C.k); });
        g.position.y = up ? Math.max(0, (C.k - 0.25) / 0.75) * (H + 0.3) : e * (H + 0.3);
        g.scale.y = 1 - 0.25 * C.k;
        if (up && C.k === 1) { const x = c.x, z = c.z; hide(); if (c.tile) c.tile.to = 0; c.above = { x, z, tx: x + (x - px) / d * 10, tz: z + (z - pz) / d * 10, k: 0, dur: 3 + c.R() * 3, then: null, creakAt: c.t + 0.4 }; }
        if (!up && C.k === 0) { c.mode = 'still'; g.scale.y = 1; arms.forEach((p) => { p.rotation.x = 0; }); if (c.tile) c.tile.to = 0; }
        return;
      }
      g.rotation.y = Math.atan2(-dx, -dz);   // always turned to you
      // the shimmer: the shell never quite lines up with it
      shell.position.set((J() - 0.5) * 0.03, (J() - 0.5) * 0.02, (J() - 0.5) * 0.03); shell.scale.setScalar(1.04 + J() * 0.05);
      face.material.opacity = 0.35 + J() * 0.25;
      if (c.peek) { c.lean = Math.min(1, c.lean + dt); g.rotation.z = c.peek.side * 0.22 * c.lean * (c.peek.v ? 1 : -1); }
      // keep away: back off from you walking at it, bolt (and go up) if you run at it, never within NEAR
      const running = ctx.keys.has('ShiftLeft') || ctx.keys.has('ShiftRight');
      if (d < NEAR) { if (c.seen) climb(true); else hide(); return; }
      if (!c.flee && d < BACK + 2 && running && c.seen) { c.flee = { until: c.t + 1.4 }; sound.creature.skitter(c.x, c.z); }
      let speed = 0, tx = 0, tz = 0;
      if (c.flee) { speed = RUN; tx = dx / d; tz = dz / d; if (c.t > c.flee.until) { c.flee = null; climb(true); return; } }
      else if (d < BACK) { speed = WALK; tx = dx / d; tz = dz / d; }
      else if (!c.seen && !c.peek) {   // following, from behind you
        const f = fwd(), gx = px - f.x * KEEP - c.x, gz = pz - f.z * KEEP - c.z, gd = Math.hypot(gx, gz);
        if (gd > 1.5) { speed = 3.2; tx = gx / gd; tz = gz / gd; }
      }
      if (speed) {
        const nx = c.x + tx * speed * dt, nz = c.z + tz * speed * dt, ox = c.x, oz = c.z;
        if (!hitAt(nx, nz)) { c.x = nx; c.z = nz; } else if (!hitAt(nx, c.z)) c.x = nx; else if (!hitAt(c.x, nz)) c.z = nz;
        const moved = Math.hypot(c.x - ox, c.z - oz);
        c.stuck = moved < speed * dt * 0.3 ? c.stuck + dt : 0;
        g.position.set(c.x, 0, c.z);
        if (!c.flee && moved > 0 && c.t > c.stepAt) { sound.creature.step(c.x, c.z); c.stepAt = c.t + (c.R() < 0.3 ? 0.12 : 0.85 + c.R() * 0.3); }   // too slow, then two at once
        if (c.stuck > (c.flee || d < BACK ? 0.3 : 3)) { if (c.seen) climb(true); else hide(); c.next = c.t + 20 + c.R() * 30; return; }
      }
      // looked at too long, or a peek seen: it goes (up, if you're watching); its time up: gone while you're not looking
      if ((c.seenFor > (c.peek ? 1.5 : 5 + c.R() * 0.02)) || (c.t - c.born > c.life && c.unseenFor > 0.5)) {
        if (c.seen) climb(false); else hide();
        c.next = c.t + (1 - k) * 110 + 45 + c.R() * 50;
        return;
      }
      sound.creature.dread(clamp(1 - (d - 12) / 22, 0, 1), c.x, c.z);
      sound.creature.echo(behind(c.x, c.z, px, pz) && d < 26 ? { x: c.x, z: c.z } : null);
    },
    // For tests and looking: `kind` now, round you (or standing at (x, z) in the floor's own space).
    force(kind, x, z) {
      const p = camera.position, px = p.x, pz = p.z - restr.z0;
      if (x !== undefined) { show(x, z, kind || 'far'); return true; }
      return appear(kind, px, pz);
    },
    c,
  };
  return creature;
}
