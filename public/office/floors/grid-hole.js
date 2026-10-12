// The grid's black hole (floors/grid.js), as it goes in the reference: a little silver cone drifts by the signpost; come
// near it and it darts at you and pokes you, then hangs there in front of you. Click and you throw it, point first, into
// the floor a few metres ahead: it sticks, quivers, and sinks, leaving a dark hole; the grid dimples down round it into a
// smooth funnel, its green lines bending down into the dark (grid-world.js draws it); the funnel deepens and widens and
// starts to turn, the lines winding into the throat, and everything near it (the shapes, the maths in the air) slides and
// tumbles round and down and is gone. It pulls on you too, harder the nearer you are, but never as hard as you can walk:
// you can always get away, and out the way you came (it's never thrown within 10 m of the doorway, and you can't be
// pulled into the throat itself). After a while it heals: the funnel unwinds and rises flat, everything it took pops
// back where it was, and the cone's back by the signpost.

import * as THREE from 'three';
import { clamp, sstep } from '../util.js';

const HOME = new THREE.Vector3(0.6, 1.45, -27.6);   // where the cone drifts, by the signpost
const DENT = 2.5, OPEN = 8, HEAL = 48, DONE = 55;     // the tear's beats, seconds from the cone going in

/** @param {any} ctx @param {any} W grid-world.js's world @param {any} sound */
export function makeHole(ctx, W, sound) {
  const { camera } = ctx;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 32), [
    new THREE.MeshPhongMaterial({ color: '#8d97a3', shininess: 160, specular: '#ffffff' }),
    new THREE.MeshPhongMaterial({ color: '#3fbf63', shininess: 60, emissive: '#0c4a1c' }),   // its base, catching the grid's green
  ]);
  cone.castShadow = true;
  Object.assign(cone.userData, { action: 'gridcone', reach: 4 });
  W.root.add(cone);
  const st = { cone: 'drift', k: 0, p0: new THREE.Vector3(), at: new THREE.Vector3(), phase: 'none', ht: 0, s: 0, spin: 0, pop: 0, R: 0 };
  const v = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  const P = { D: 0, r0: 1, R: 1 };   // the funnel: depth, throat, reach (as the floor's shader has them)
  const holeG = (r) => P.r0 * P.r0 / (r * r + P.r0 * P.r0);
  const holeY = (r) => (st.phase === 'none' || r >= P.R ? 0 : -P.D * (holeG(r) - holeG(P.R)) / (1 - holeG(P.R)));
  // how far out the funnel's 0.6 m deep (you're kept out of it: it's a slope you can stand on to there)
  function lip() {
    if (P.D < 0.6) return 0;
    let a = 0, b = P.R;
    for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (holeY(m) < -0.6) a = m; else b = m; }
    return b;
  }

  // ----- the cone -----
  // Where it'd go in: a few metres ahead of you, never within 10 m of the doorway, nor in the temple or the pond.
  function landing() {
    camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
    const inside = (x, z) => W.statics.some((b) => x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2);
    for (let d = 6.5; d < 20; d += 0.5) {
      v.set(camera.position.x + fwd.x * d, 0, camera.position.z + fwd.z * d);
      if (Math.hypot(v.x, v.z) >= 10 && Math.hypot(v.x, v.z) < 55 && !inside(v.x, v.z)) return v.clone();
    }
    return new THREE.Vector3(0, 0, -16);
  }
  function throwIt() {
    if (st.cone !== 'drift' && st.cone !== 'held') return;
    st.p0.copy(cone.position); st.at.copy(landing()); st.cone = 'throw'; st.k = 0;
    sound.whoosh(cone.position);
  }
  // the cone's place in front of you, held: low and to the right, as if in your hand
  function heldAt(out) {
    camera.getWorldDirection(fwd);
    const right = v.crossVectors(fwd, up).normalize();
    return out.copy(camera.position).addScaledVector(fwd, 0.55).addScaledVector(right, 0.28).addScaledVector(up, -0.28);
  }
  const tmp = new THREE.Vector3();
  function coneFx(dt, t) {
    switch (st.cone) {
      case 'drift': {
        cone.visible = true;
        cone.position.set(HOME.x + Math.sin(t * 0.3) * 0.25, HOME.y + Math.sin(t * 0.7) * 0.1, HOME.z + Math.cos(t * 0.23) * 0.2);
        cone.rotation.set(0.5 + Math.sin(t * 0.4) * 0.2, t * 0.6, 0.3);
        cone.scale.setScalar(Math.min(1, st.pop += dt * 2));
        if (st.phase === 'none' && Math.hypot(camera.position.x - cone.position.x, camera.position.z - cone.position.z) < 2.4) { st.cone = 'dart'; st.k = 0; st.p0.copy(cone.position); }
        break;
      }
      case 'dart': {   // at you, point first, and a poke
        st.k = Math.min(1, st.k + dt / 0.45);
        const to = heldAt(tmp).addScaledVector(fwd, -0.2);
        cone.position.lerpVectors(st.p0, to, st.k * st.k);
        cone.quaternion.setFromUnitVectors(up, v.copy(to).sub(st.p0).normalize());
        if (st.k >= 1) {
          st.cone = 'held'; sound.poke(cone.position);
          ctx.player.pitch += 0.06; ctx.player.yaw += 0.03; jolt = 0.25;
        }
        break;
      }
      case 'held': {
        heldAt(tmp);
        cone.position.lerp(tmp, Math.min(1, dt * 10));
        camera.getWorldDirection(fwd);
        q.setFromUnitVectors(up, v.copy(fwd).add(up.clone().multiplyScalar(0.6)).normalize());
        cone.quaternion.slerp(q, Math.min(1, dt * 8));
        break;
      }
      case 'throw': {   // an arc, point first, into the floor
        st.k = Math.min(1, st.k + dt / 0.85);
        const k = st.k, y = st.p0.y * (1 - k) + 0.1 * k + 1.3 * Math.sin(Math.PI * k) * (1 - k * 0.3);
        tmp.set(st.p0.x + (st.at.x - st.p0.x) * k, y, st.p0.z + (st.at.z - st.p0.z) * k);
        v.copy(tmp).sub(cone.position);
        if (v.lengthSq() > 1e-8) cone.quaternion.setFromUnitVectors(up, v.normalize());
        cone.position.copy(tmp);
        if (k >= 1) { st.cone = 'stuck'; st.k = 0; sound.tink(st.at); begin(st.at); }
        break;
      }
      case 'stuck': {   // it quivers, and sinks
        st.k += dt;
        const w = Math.exp(-st.k * 3) * Math.sin(st.k * 38) * 0.12;
        cone.quaternion.setFromEuler(new THREE.Euler(Math.PI + w, 0, w * 0.6));
        cone.position.set(st.at.x, 0.06 - sstep(1.0, 2.4, st.k) * 0.5, st.at.z);
        if (st.k > 2.4) { st.cone = 'gone'; cone.visible = false; }
        break;
      }
      default: break;
    }
  }

  // ----- the tear -----
  function begin(at) { st.phase = 'dent'; st.ht = 0; st.spin = 0; st.at.copy(at); W.disc.position.set(at.x, 0, at.z); }
  // Everything put back as it was: the floor flat, the things home, the cone by the signpost.
  function reset() {
    st.phase = 'none'; st.ht = 0; st.s = 0; st.spin = 0; P.D = 0;
    for (const th of W.things) restore(th, 1);
    st.cone = 'drift'; st.pop = 1; cone.visible = true; jolt = 0;
    apply();
  }
  function restore(th, s) {
    th.o.position.copy(th.home.p); th.o.quaternion.copy(th.home.q); th.o.scale.copy(th.home.s).multiplyScalar(s);
    th.o.visible = true; th.taken = false; th.moved = false;
  }
  function apply() {
    const on = st.phase !== 'none';
    W.HU.hOn.value = on ? 1 : 0; W.disc.visible = on;
    W.HU.hC.value.set(st.at.x, st.at.z);
    W.HU.hP.value.set(Math.max(P.D, 1e-3), P.r0, P.R, st.spin);
  }
  function tearFx(dt) {
    if (st.phase === 'none') return;
    const h = st.ht += dt;
    st.phase = h < DENT ? 'dent' : h < OPEN ? 'open' : h < HEAL ? 'pull' : h < DONE ? 'heal' : 'none';
    if (st.phase === 'none') { reset(); return; }
    // the shape: a shallow dimple, then a throat opening and the funnel spreading; healing, all of it back the other way
    const grow = sstep(DENT, OPEN, h), shut = sstep(HEAL, HEAL + 5, h);
    P.D = (0.7 * sstep(0, DENT, h) + 9.3 * grow + 1.5 * sstep(OPEN, HEAL, h)) * (1 - shut);
    P.r0 = 0.45 + 0.75 * grow;
    P.R = Math.max(2, (2.6 + 6.4 * grow + 4 * sstep(OPEN, HEAL - 10, h)) * (1 - 0.6 * shut));
    st.s = grow * (1 - sstep(HEAL, HEAL + 3, h));
    st.spin = (3.2 + 0.9 * Math.sin(h * 0.9)) * grow * (1 - shut);   // wound round the throat, breathing; healing, unwound
    st.R = 5 + 17 * st.s;   // how far out it takes things
    if (h >= HEAL && !st.healed) { st.healed = true; sound.heal(st.at); }
    if (h < HEAL) st.healed = false;
    // things: round and down and gone; healing, back where they were, popping up from nothing
    for (const th of W.things) {
      if (h >= HEAL + 2) {
        if (th.taken || th.moved) { restore(th, 0); th.grow = 0; }
        if (th.grow !== undefined && th.grow < 1) { th.grow = Math.min(1, th.grow + dt / 0.6); th.o.scale.copy(th.home.s).multiplyScalar(sstep(0, 1, th.grow)); }
        continue;
      }
      if (th.taken || st.s < 0.02) continue;
      const dx = th.o.position.x - st.at.x, dz = th.o.position.z - st.at.z, r = Math.hypot(dx, dz);
      if (r > st.R) continue;
      th.moved = true;
      const vr = st.s * (0.5 + 7 / (r + 0.6)) * sstep(st.R, st.R - 5, r), wa = st.s * 2.2 / (r + 0.8);
      const a = Math.atan2(dz, dx) + wa * dt, r2 = Math.max(0, r - vr * dt);
      th.o.position.x = st.at.x + Math.cos(a) * r2; th.o.position.z = st.at.z + Math.sin(a) * r2;
      const floorY = holeY(r2) + (th.float ? 0.4 : th.home.p.y);
      th.o.position.y += (floorY - th.o.position.y) * Math.min(1, dt * (th.float ? 0.8 : 6));
      th.o.rotation.x += dt * st.s * (1.5 + 3 / (r2 + 0.5)); th.o.rotation.z += dt * st.s * 0.9;
      th.o.scale.copy(th.home.s).multiplyScalar(clamp(r2 / 1.2, 0.05, 1));
      if (r2 < 0.45) { th.taken = true; th.o.visible = false; sound.zip(th.o.position); }
    }
  }

  // ----- you: pulled in (never as hard as you walk), and down its slope -----
  let jolt = 0;
  function pull(dt) {
    const p = ctx.player;
    jolt = Math.max(0, jolt - dt);
    if (st.s < 0.01) return;
    const dx = p.x - st.at.x, dz = p.z - st.at.z, r = Math.hypot(dx, dz);
    if (r > st.R || r < 1e-3) return;
    const k = st.s * sstep(st.R, st.R - 4, r), vin = k * Math.min(3.2, 1.2 + 8 / (r + 1)), vt = k * 0.9;
    p.x += (-dx / r * vin - dz / r * vt) * dt; p.z += (-dz / r * vin + dx / r * vt) * dt;
    ctx.collide(p);
    camera.position.x = p.x; camera.position.z = p.z;
  }

  return {
    st, cone, throwIt, reset, ground: (x, z) => holeY(Math.hypot(x - st.at.x, z - st.at.z)),
    // the throat, as somewhere you can't stand (a box round its lip)
    cols() { const l = lip(); return l > 0 ? [{ minX: st.at.x - l * 0.85, maxX: st.at.x + l * 0.85, minZ: st.at.z - l * 0.85, maxZ: st.at.z + l * 0.85 }] : []; },
    get on() { return st.phase !== 'none'; },
    get strength() { return st.s; },
    update(dt, t, walk = true) { coneFx(dt, t); tearFx(dt); apply(); if (walk) pull(dt); },
    // For the tests and for looking: the tear now at (x, z) (or a few metres ahead of you), `sec` seconds on.
    tear(sec = 0, x, z) {
      const at = Number.isFinite(x) ? new THREE.Vector3(x, 0, z) : landing();
      reset(); st.cone = 'gone'; cone.visible = false; begin(at);
      for (let s = 0; s < sec; s += 0.05) { tearFx(0.05); if (st.phase === 'none') break; }
      apply();
      return st.phase;
    },
  };
}
