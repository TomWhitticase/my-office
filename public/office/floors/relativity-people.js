// Relativity's inhabitants (floors/relativity.js): Escher's smooth, faceless figures, each going about its routine in
// its own gravity and paying you no attention. Up and down the stairs (one on each side of the same stair, one on
// top and one beneath), across the bridges, a basket on the head along the arcade, leaning on a balustrade, sitting at
// the long table. One more is you: now and then, far off on another gravity's stair, walking when you walk.
// Every figure is a handful of instances in four InstancedMeshes (bodies, legs, arms, baskets): four draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frameM, toWorld } from './relativity-gravity.js';

const SPEED = 0.8, HIP = 0.92, SHOULDER = 1.43;

export function makePeople(root, arch, R) {
  const M = [0, 1, 2].map(frameM);
  // ----- the figures' parts, made at the origin facing +z -----
  const torso = new THREE.LatheGeometry([[0, 0.86], [0.13, 0.88], [0.16, 1.0], [0.17, 1.2], [0.2, 1.4], [0.13, 1.49], [0.055, 1.52], [0.05, 1.56], [0, 1.57]]
    .map(([x, y]) => new THREE.Vector2(x, y)), 18).scale(1, 1, 0.68);
  const head = new THREE.SphereGeometry(0.105, 18, 14).scale(0.9, 1.2, 1).translate(0, 1.67, 0.005);
  const bodyG = mergeGeometries([torso.toNonIndexed(), head.toNonIndexed()]);
  const legG = new THREE.CapsuleGeometry(0.068, 0.76, 4, 10).translate(0, -0.45, 0);
  const armG = new THREE.CapsuleGeometry(0.05, 0.56, 4, 8).translate(0, -0.33, 0);
  const basketG = mergeGeometries([new THREE.CylinderGeometry(0.22, 0.16, 0.22, 14, 1, true).toNonIndexed(),
    new THREE.TorusGeometry(0.21, 0.025, 6, 16).rotateX(Math.PI / 2).translate(0, 0.11, 0).toNonIndexed()]);
  const skin = new THREE.MeshStandardMaterial({ color: '#c9c2b4', roughness: 0.75 });
  const wicker = new THREE.MeshStandardMaterial({ color: '#8a7b63', roughness: 0.9, side: THREE.DoubleSide });

  // ----- who: a figure per path (and per seat), plus you -----
  const figs = [];
  for (const p of arch.paths) {
    const pts = p.pts.map((v) => new THREE.Vector3(...v)), seg = [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push(d); len += d; }
    figs.push({ k: p.k, kind: p.kind, pts, seg, len, s: R() * len, dir: R() < 0.5 ? 1 : -1, wait: 0, ph: R() * 6, yaw: p.yaw ?? 0, pos: new THREE.Vector3() });
  }
  for (const st of arch.seats) figs.push({ k: st.k, kind: 'sit', pts: [new THREE.Vector3(...st.at)], seg: [], len: 0, s: 0, dir: 1, wait: 0, ph: R() * 6, yaw: st.yaw, pos: new THREE.Vector3() });
  // one on each side of the same stair: the climber on top and the one beneath pass each other
  for (const f of figs) if (f.kind === 'top' || f.kind === 'under') { f.s = f.len * 0.5; f.dir = f.kind === 'top' ? 1 : -1; }
  const me = { k: 1, kind: 'me', pts: [], seg: [], len: 0, s: 0, dir: 1, wait: 0, ph: 0, yaw: 0, pos: new THREE.Vector3(), on: false };
  figs.push(me);
  const N = figs.length, baskets = figs.filter((f) => f.kind === 'basket');
  const body = new THREE.InstancedMesh(bodyG, skin, N), legs = new THREE.InstancedMesh(legG, skin, N * 2), arms = new THREE.InstancedMesh(armG, skin, N * 2);
  const bask = new THREE.InstancedMesh(basketG, wicker, Math.max(1, baskets.length));
  for (const m of [body, legs, arms, bask]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(m); }
  // you're the dark one: the same figure, in shadow, whatever the light
  const pale = new THREE.Color(1, 1, 1), dark = new THREE.Color(0.22, 0.21, 0.2), mi = N - 1;
  for (let i = 0; i < N; i++) body.setColorAt(i, i === mi ? dark : pale);
  for (let i = 0; i < N * 2; i++) { legs.setColorAt(i, i >> 1 === mi ? dark : pale); arms.setColorAt(i, i >> 1 === mi ? dark : pale); }

  // ----- each frame -----
  const at = (f, s) => {   // where along its path, and which way it's heading there
    let i = 0;
    while (i < f.seg.length - 1 && s > f.seg[i]) { s -= f.seg[i]; i++; }
    const a = f.pts[i], b = f.pts[i + 1] || a, u = f.seg[i] ? Math.min(1, s / f.seg[i]) : 0;
    f.pos.lerpVectors(a, b, u);
    const dx = (b.x - a.x) * f.dir, dz = (b.z - a.z) * f.dir;
    if (Math.abs(dx) + Math.abs(dz) > 1e-3) f.yaw = Math.atan2(dx, dz);
  };
  const base = new THREE.Matrix4(), m4 = new THREE.Matrix4(), part = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const pose = (x, y, z, rx, ry, rz) => part.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz, 'YXZ')), one);
  function update(dt) {
    let bi = 0;
    figs.forEach((f, n) => {
      let swing = 0;
      if (f.len && f.kind !== 'me') {
        if (f.wait > 0) f.wait -= dt;
        else {
          f.s += f.dir * SPEED * dt;
          if (f.s > f.len || f.s < 0) { f.s = Math.max(0, Math.min(f.len, f.s)); f.dir *= -1; f.wait = 1.5 + (n % 4) * 0.6; }
          f.ph += SPEED * dt * 4.6; swing = 1;
        }
        at(f, f.s);
      } else if (f.kind !== 'me') f.pos.copy(f.pts[0]);
      if (f.kind === 'me') swing = f.walking ? 1 : 0;
      if (f.kind === 'me' && !f.on) { body.setMatrixAt(n, zero); for (const i of [2 * n, 2 * n + 1]) { legs.setMatrixAt(i, zero); arms.setMatrixAt(i, zero); } return; }
      const sit = f.kind === 'sit', lean = f.kind === 'lean', carry = f.kind === 'basket';
      const s = Math.sin(f.ph) * swing, drop = sit ? -0.46 : 0, pitch = lean ? 0.28 : sit ? -0.05 : 0;
      base.copy(M[f.k]).multiply(m4.compose(f.pos, q.setFromEuler(e.set(0, f.yaw, 0)), one));
      // the upper body pitches about the hip (leaning on the rail)
      body.setMatrixAt(n, m4.copy(base).multiply(pose(0, HIP + drop, 0, pitch, 0, 0)).multiply(part.makeTranslation(0, -HIP, 0)));
      for (const side of [-1, 1]) {
        const li = 2 * n + (side > 0 ? 1 : 0);
        const lx = sit ? -1.12 : lean ? 0.05 * side : s * 0.5 * side;
        legs.setMatrixAt(li, m4.copy(base).multiply(pose(0.09 * side, HIP + drop, 0, lx, 0, 0)));
        const ax = carry ? -2.75 : lean ? -1.25 : sit ? -0.7 : -s * 0.42 * side, az = carry ? -0.32 * side : 0.06 * side;
        // shoulders ride on the pitched torso
        const sy = HIP + drop + (SHOULDER - HIP) * Math.cos(pitch), sz = (SHOULDER - HIP) * Math.sin(pitch);
        arms.setMatrixAt(li, m4.copy(base).multiply(pose(0.215 * side, sy, sz, ax, 0, az)));
      }
      if (carry) bask.setMatrixAt(bi++, m4.copy(base).multiply(pose(0, 1.86 + Math.abs(s) * 0.02, 0, 0, 0, 0)));
    });
    for (const m of [body, legs, arms, bask]) m.instanceMatrix.needsUpdate = true;
  }

  // ----- you, far off: on another gravity's stair, walking when you walk -----
  const stairs = figs.filter((f) => f.kind === 'top' || f.kind === 'under');
  // A spot on a stair of another gravity, 13-55 m from `from` (world) that `seen(p)` says you can see: you're there, or
  // nobody is (false).
  function glimpse(k, from, seen) {
    const probe = { pts: null, seg: null, dir: 1, pos: new THREE.Vector3(), yaw: 0 }, spots = [];
    for (const f of stairs) if (f.k !== k) for (const u of [0.25, 0.4, 0.55, 0.7]) {
      Object.assign(probe, { pts: f.pts, seg: f.seg });
      at(probe, f.len * u);
      const w = new THREE.Vector3(...toWorld(f.k, [probe.pos.x, probe.pos.y + 1, probe.pos.z])), d = w.distanceTo(from);
      if (d > 13 && d < 55) spots.push({ f, s: f.len * u, w, d, r: R() });
    }
    const spot = spots.sort((a, b) => a.r - b.r).find((x) => seen(x.w));
    if (!spot) return false;
    Object.assign(me, { k: spot.f.k, pts: spot.f.pts, seg: spot.f.seg, len: spot.f.len, s: spot.s, dir: 1, on: true, walking: false });
    at(me, me.s);
    return true;
  }
  // `step`: how far you walked this frame, so it walks too (and only then)
  function mirror(step, dt) {
    if (!me.on) return;
    me.walking = step > 0.002;
    if (!me.walking) return;
    me.s += me.dir * step;
    if (me.s > me.len - 0.5 || me.s < 0.5) { me.dir *= -1; me.s = Math.max(0.5, Math.min(me.len - 0.5, me.s)); }
    me.ph += step * 4.6;
    at(me, me.s);
  }
  const worldPos = (f) => new THREE.Vector3(...toWorld(f.k, [f.pos.x, f.pos.y + 0.1, f.pos.z]));
  return { figs, update, glimpse, mirror, me, worldPos, meshes: [body, legs, arms, bask] };
}
