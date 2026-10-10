// Relativity's three gravities (floors/relativity.js) and you walking in them. Frame k's own coordinates map to the world
// by P^k, P(x, y, z) = (z, x, y): a third of a turn about the (1, 1, 1) diagonal. So frame 0's floor (y = -L) is frame
// 1's (z = -L) and frame 2's (x = -L), every frame has the next one's floor as the wall at its z = -L and the previous
// one's as the wall at its x = -L, and one layout built in a frame's own coordinates serves all three.
//
// The world is axis-aligned boxes, each tagged with the frames it's a floor for (`m`, a bit per frame). You walk in your
// frame's coordinates, y up: walls stop you, steps up to STEP lift you, drops of more than DROP stop you at the edge.
// Two seams turn you: pressing into a wall that's another frame's floor (a concave corner: you roll up onto it), and
// walking off an edge whose side is another frame's floor (convex: you roll over it). Either way it's a 90° roll about
// the corner, eased over ROLL seconds, and that surface is your floor.

import * as THREE from 'three';
import { ease, EYE } from '../util.js';

export const P = (v, k) => {
  k = ((k % 3) + 3) % 3;
  let [x, y, z] = v;
  for (let i = 0; i < k; i++) [x, y, z] = [z, x, y];
  return [x, y, z];
};
export const toWorld = (k, v) => P(v, k);
export const toLocal = (k, v) => P(v, -k);
export const upW = (k) => new THREE.Vector3(...toWorld(k, [0, 1, 0]));
/** Frame k's rotation, as a matrix and a quaternion. */
export const frameM = (k) => new THREE.Matrix4().makeBasis(new THREE.Vector3(...toWorld(k, [1, 0, 0])), upW(k), new THREE.Vector3(...toWorld(k, [0, 0, 1])));
export const frameQ = (k) => new THREE.Quaternion().setFromRotationMatrix(frameM(k));

const R = 0.25, RG = 0.1, HGT = 1.72, STEP = 0.36, DROP = 0.45, ROLL = 0.6, PRESS = 0.14, EPS = 1e-4;

/**
 * @param {{ min: number[], max: number[], m: number }[]} boxes  in world coordinates
 */
export function makeWalker(boxes) {
  const N = boxes.length;
  // Each frame's copy of the boxes, in its own coordinates (P only permutes axes, so min stays min).
  const B = [0, 1, 2].map((k) => {
    const a = new Float32Array(N * 6);
    boxes.forEach((b, i) => { a.set(toLocal(k, b.min), i * 6); a.set(toLocal(k, b.max), i * 6 + 3); });
    return a;
  });
  const M = Uint8Array.from(boxes, (b) => b.m);
  const Q = [0, 1, 2].map(frameQ), QI = Q.map((q) => q.clone().invert());
  const S = { k: 0, x: 0, y: 0, z: 0, ey: 0, supp: -1, press: 0, roll: null, moving: 0, rolls: 0 };

  // The first box overlapping your body standing at (x, y, z), from `lift` above your feet to your head.
  function hit(k, x, y, z, lift = STEP, r = R) {
    const a = B[k];
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      if (x + r > a[o] + EPS && x - r < a[o + 3] - EPS && z + r > a[o + 2] + EPS && z - r < a[o + 5] - EPS &&
        y + HGT > a[o + 1] + EPS && y + lift < a[o + 4] - EPS) return i;
    }
    return -1;
  }
  // The highest top under your feet that you could step onto.
  function ground(k, x, y, z) {
    const a = B[k];
    let top = -Infinity, at = -1;
    for (let i = 0; i < N; i++) {
      const o = i * 6, t = a[o + 4];
      if (t > top && t <= y + STEP + EPS && x + RG > a[o] && x - RG < a[o + 3] && z + RG > a[o + 2] && z - RG < a[o + 5]) { top = t; at = i; }
    }
    return { top, at };
  }
  // Move along one axis (0 x, 2 z), pushed back out of whatever you walk into: what stopped you, or -1.
  function slide(ax, d) {
    if (!d) return -1;
    const a = B[S.k];
    if (ax === 0) S.x += d; else S.z += d;
    let stop = -1;
    for (let i; (i = hit(S.k, S.x, S.y, S.z)) >= 0;) {
      const o = i * 6 + ax;
      if (ax === 0) S.x = d > 0 ? a[o] - R - EPS * 2 : a[o + 3] + R + EPS * 2;
      else S.z = d > 0 ? a[o] - R - EPS * 2 : a[o + 3] + R + EPS * 2;
      stop = i;
    }
    return stop;
  }

  // ----- the roll -----
  const v3 = () => new THREE.Vector3();
  function startRoll(j, pivotL, cam) {
    const k = S.k, pivot = new THREE.Vector3(...toWorld(k, pivotL)), rq = new THREE.Quaternion().setFromUnitVectors(upW(k), upW(j));
    const feet = new THREE.Vector3(...toWorld(k, [S.x, S.y, S.z])).sub(pivot).applyQuaternion(rq).add(pivot);
    const [x, y, z] = toLocal(j, feet.toArray());
    const g = ground(j, x, y + 0.05, z);
    if (g.at < 0 || Math.abs(g.top - y) > 0.08 || hit(j, x, g.top, z, 0.05) >= 0) return false;   // nowhere to stand
    const q1 = rq.clone().multiply(cam.quaternion), e = new THREE.Euler().setFromQuaternion(QI[j].clone().multiply(q1), 'YXZ');
    S.roll = { t: 0, j, pivot, rq, q0: cam.quaternion.clone(), eye0: cam.position.clone(), to: { x, y: g.top, z }, yaw: e.y, pitch: e.x };
    S.press = 0; S.rolls++;
    return true;
  }
  function tryConcave(i, ax, cam) {   // pressed into the face of box i that faces back along ax
    const j = (S.k + (ax === 0 ? 2 : 1)) % 3, a = B[S.k], o = i * 6;
    if (!(M[i] >> j & 1) || a[o + 4] - S.y < 1.2) return false;
    const f = a[o + 3 + ax], d = (ax === 0 ? S.x : S.z) - f;   // (R, give or take)
    return startRoll(j, ax === 0 ? [f + d, S.y + d, S.z] : [S.x, S.y + d, f + d], cam);
  }
  function tryConvex(i, ax, cam) {   // walked off box i's + side along ax
    const j = (S.k + (ax === 0 ? 2 : 1)) % 3, a = B[S.k], o = i * 6;
    if (i < 0 || !(M[i] >> j & 1)) return false;
    const f = a[o + 3 + ax];
    return startRoll(j, ax === 0 ? [f, a[o + 4], S.z] : [S.x, a[o + 4], f], cam);
  }

  // One small step (dx, dz in your frame): true if it started a roll.
  function substep(dx, dz, dt, cam) {
    const px = S.x, pz = S.z;
    const sx = slide(0, dx), sz = slide(2, dz);
    // pressing into another frame's floor
    const cx = sx >= 0 && dx < 0 && (M[sx] >> ((S.k + 2) % 3) & 1), cz = sz >= 0 && dz < 0 && (M[sz] >> ((S.k + 1) % 3) & 1);
    if (cx || cz) {
      S.press += dt;
      if (S.press > PRESS && (cx ? tryConcave(sx, 0, cam) : tryConcave(sz, 2, cam))) return true;
    } else S.press = Math.max(0, S.press - dt);
    const g = ground(S.k, S.x, S.y, S.z);
    if (g.at >= 0 && g.top >= S.y - DROP) {
      if (g.top > S.y + EPS && hit(S.k, S.x, g.top, S.z, 0.02) >= 0) { S.x = px; S.z = pz; }   // no headroom up there
      else { S.y = g.top; S.supp = g.at; }
      return false;
    }
    // an edge: over it onto another frame's floor, or stop at it
    S.x = px; S.z = pz;
    const a = B[S.k], o = S.supp * 6;
    if (S.supp >= 0 && dx > 0 && px + dx - RG >= a[o + 3] - EPS && tryConvex(S.supp, 0, cam)) return true;
    if (S.supp >= 0 && dz > 0 && pz + dz - RG >= a[o + 5] - EPS && tryConvex(S.supp, 2, cam)) return true;
    return false;
  }

  const qE = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ'), tmp = v3(), rt = new THREE.Quaternion();
  return {
    S, B, M, hit, ground,
    /** Put you at (x, y, z) in frame k, settled onto whatever's under you. */
    place(k, x, y, z) {
      Object.assign(S, { k, x, y, z, roll: null, press: 0, supp: -1 });
      const g = ground(k, x, y + 0.3, z);
      if (g.at >= 0) { S.y = g.top; S.supp = g.at; }
      S.ey = S.y;
    },
    /** The walk this frame: f/s forward and strafe (-1..1), yaw/pitch your look in your frame; sets the camera. Returns
     *  a new { yaw, pitch } when a roll finishes. */
    step(dt, f, s, run, yaw, pitch, cam, t) {
      if (S.roll) {
        const r = S.roll;
        r.t = Math.min(1, r.t + dt / ROLL);
        rt.identity().slerp(r.rq, ease(r.t));
        cam.position.copy(tmp.copy(r.eye0).sub(r.pivot).applyQuaternion(rt).add(r.pivot));
        cam.quaternion.copy(rt).multiply(r.q0);
        S.moving = 0;
        if (r.t < 1) return null;
        Object.assign(S, { k: r.j, x: r.to.x, y: r.to.y, z: r.to.z, ey: r.to.y, roll: null });
        return { yaw: r.yaw, pitch: Math.max(-1.4, Math.min(1.4, r.pitch)) };
      }
      const n = Math.hypot(f, s);
      const ox = S.x, oz = S.z;
      if (n) {
        const sp = (run ? 6.2 : 3.4) * dt, sy = Math.sin(yaw), cy = Math.cos(yaw);
        const mx = ((-sy * f + cy * s) / n) * sp, mz = ((-cy * f - sy * s) / n) * sp, k = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(mz)) / 0.07));
        for (let i = 0; i < k; i++) if (substep(mx / k, mz / k, dt / k, cam)) return this.step(0, 0, 0, false, yaw, pitch, cam, t);
      } else S.press = 0;
      S.moving = Math.hypot(S.x - ox, S.z - oz) / Math.max(dt, 1e-4);
      S.ey += (S.y - S.ey) * Math.min(1, 14 * dt);
      const bob = S.moving > 0.5 ? Math.sin(t * 9.5) * 0.022 : 0;
      cam.position.set(...toWorld(S.k, [S.x, S.ey + EYE + bob, S.z]));
      cam.quaternion.copy(Q[S.k]).multiply(qE.setFromEuler(eul.set(pitch, yaw, 0)));
      return null;
    },
    /** Your feet in the world. */
    feet: () => new THREE.Vector3(...toWorld(S.k, [S.x, S.y, S.z])),
  };
}
