// Worn paths in B3's carpet (floors/restricted.js): from the lift to each of the secret doors, the stone door into
// Relativity (at its home, relativity-door.js) and the fire door behind the sky (world-edge-backstage.js findExit). Very
// faint: a soft strip of flatter, paler, greyer pile half a metre or so wide that wanders a little and frays, a touch
// stronger through doorways and where the way turns. Someone who knows to look can follow it.
// Worked out once from B3's fixed layout (the walk findExit makes from the lift) and baked into a mask over the floor's
// own space (RES metres a texel), which the carpet's material reads (wear()): no extra draw calls.

import * as THREE from 'three';
import { findExit } from './world-edge-backstage.js';

const RES = 0.2, WORN = 0.32;   // texels, metres; how much paler the worn pile is at its most
const WAYS = [['w', -1, 0], ['e', 1, 0], ['s', 0, -1], ['n', 0, 1]];

export function wornPaths(restr, start) {
  const G = restr.grid, { C, X, Z, h3, edgeType, SOLID, cellOk } = G, key = (i, j) => `${i},${j}`;
  // the edge between (i, j) and its neighbour that way: its type, and where you'd cross it (a doorway's middle)
  function edge(i, j, w) {
    const [dir, ei, ej] = w === 'w' ? ['v', i, j] : w === 'e' ? ['v', i + 1, j] : w === 's' ? ['h', i, j] : ['h', i, j + 1];
    const t = edgeType(dir, ei, ej), v = dir === 'v', a = v ? Z(ej) : X(ei), r = h3(ei, ej, v ? 3 : 4);
    const along = t === 3 ? a + C / 2 + (r - 0.5) * 0.6 : t === 0 ? a + C / 2 + (h3(ei, ej, 60) - 0.5) * 0.8 : a + 0.9 + r * (C - 1.8);
    return { t, door: t !== 0, at: v ? [X(ei), along] : [along, Z(ej)] };
  }
  // the walk from the lift (as findExit's): every cell's way back
  const back = new Map([[key(-1, 0), null]]), dist = new Map([[key(-1, 0), 0]]), order = [[-1, 0]];
  for (let h = 0; h < order.length; h++) {
    const [i, j] = order[h];
    for (const [w, di, dj] of WAYS) {
      const ni = i + di, nj = j + dj;
      if (!cellOk(ni, nj) || back.has(key(ni, nj)) || edge(i, j, w).t === SOLID) continue;
      back.set(key(ni, nj), [i, j, w]); dist.set(key(ni, nj), dist.get(key(i, j)) + 1); order.push([ni, nj]);
    }
  }
  // The stone door's home: 16-30 cells' walk out, away from the fire door's side, in the wall straight ahead as you come
  // into the cell (k: relativity-door.js's sides, 0 west wall .. 3 north).
  const ex = findExit(restr), lx = X(-1), lz = 0, ux = ex.XD - lx, uz = ex.ZF - lz;
  const FAR = { w: [0, 'w'], e: [1, 'e'], s: [2, 's'], n: [3, 'n'] };   // came in going that way: the wall ahead
  let home = null;
  for (const away of [true, false]) {
    for (const [i, j] of order) {
      const d = dist.get(key(i, j)), b = back.get(key(i, j));
      if (!b || d < 16 || d > 30 || (j === 0 && i >= -3 && i <= -1) || h3(i, j, 10) < 0.03 || (i === ex.spot.i && j === ex.spot.j)) continue;
      const cx = X(i) + C / 2, cz = Z(j) + C / 2;
      if (away && (cx - lx) * ux + (cz - lz) * uz > 0) continue;
      const [k, w] = FAR[b[2]];
      if (edge(i, j, w).t === SOLID) { home = { i, j, k }; break; }
    }
    if (home) break;
  }
  home ||= { i: -5, j: 0, k: 3 };

  // A route: the lift's door, each crossing on the way, then up to the door (`end`, on its wall's face; `inward` into the room).
  function route(i, j, end, inward) {
    const cells = [];
    for (let c = [i, j]; c; ) { cells.unshift(c); const b = back.get(key(c[0], c[1])); c = b && [b[0], b[1]]; }
    const pts = [{ p: start, s: 1 }];
    for (let n = 1; n < cells.length; n++) {
      const [pi, pj] = cells[n - 1], [ci, cj] = cells[n], w = WAYS.find(([, di, dj]) => pi + di === ci && pj + dj === cj)[0], e = edge(pi, pj, w);
      pts.push({ p: e.at, s: e.door ? 1.5 : 1 });
    }
    pts.push({ p: [end[0] + inward[0] * 1.2, end[1] + inward[1] * 1.2], s: 1.4 }, { p: [end[0] + inward[0] * 0.25, end[1] + inward[1] * 0.25], s: 1.8 });
    // where the way turns, feet turn: stronger
    for (let n = 1; n < pts.length - 1; n++) {
      const [a, b, c] = [pts[n - 1].p, pts[n].p, pts[n + 1].p], ax = b[0] - a[0], az = b[1] - a[1], bx = c[0] - b[0], bz = c[1] - b[1];
      const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1);
      pts[n].s += 0.5 * Math.max(0, 1 - cos);
    }
    // rounded off (Chaikin, twice), keeping the ends
    let q = pts;
    for (let it = 0; it < 2; it++) {
      const o = [q[0]];
      for (let n = 0; n < q.length - 1; n++) {
        const A = q[n], B = q[n + 1], m = (u) => ({ p: [A.p[0] + (B.p[0] - A.p[0]) * u, A.p[1] + (B.p[1] - A.p[1]) * u], s: A.s + (B.s - A.s) * u });
        o.push(m(0.25), m(0.75));
      }
      o.push(q[q.length - 1]); q = o;
    }
    return q;
  }
  const exitIn = [Math.sin(ex.YAW), Math.cos(ex.YAW)];
  const hf = [[X(home.i), Z(home.j) + C / 2, 1, 0], [X(home.i + 1), Z(home.j) + C / 2, -1, 0], [X(home.i) + C / 2, Z(home.j), 0, 1], [X(home.i) + C / 2, Z(home.j + 1), 0, -1]][home.k];
  const routes = [route(ex.spot.i, ex.spot.j, [ex.XD, ex.ZF], exitIn), route(home.i, home.j, [hf[0], hf[1]], [hf[2], hf[3]])];

  // ----- the mask: soft discs stamped every few centimetres along each route, the strongest kept where they overlap -----
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of routes) for (const { p } of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  x0 -= 2; z0 -= 2; x1 += 2; z1 += 2;
  const W = Math.ceil((x1 - x0) / RES), H = Math.ceil((z1 - z0) / RES), data = new Uint8Array(W * H);
  const lo = (u, s) => Math.sin(u * 0.9 + s) * 0.6 + Math.sin(u * 2.3 + s * 2.1) * 0.4;   // slow, smooth, -1..1
  routes.forEach((r, ri) => {
    let u = 0;
    for (let n = 0; n < r.length - 1; n++) {
      const A = r[n], B = r[n + 1], len = Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]), steps = Math.max(1, Math.ceil(len / 0.05));
      const nx = -(B.p[1] - A.p[1]) / (len || 1), nz = (B.p[0] - A.p[0]) / (len || 1);
      for (let k = 0; k < steps; k++, u += len / steps) {
        const f = k / steps, wob = lo(u * 0.5, ri * 7) * 0.14;   // wanders a little side to side
        const px = A.p[0] + (B.p[0] - A.p[0]) * f + nx * wob, pz = A.p[1] + (B.p[1] - A.p[1]) * f + nz * wob;
        const s = (A.s + (B.s - A.s) * f) * (0.8 + 0.2 * lo(u * 1.7, ri * 3 + 1)), rad = 0.42 + 0.07 * lo(u * 1.1, ri * 5 + 2);
        const gx = (px - x0) / RES, gz = (pz - z0) / RES, R = Math.ceil(rad / RES) + 1;
        for (let a = Math.floor(gx - R); a <= gx + R; a++) for (let b = Math.floor(gz - R); b <= gz + R; b++) {
          if (a < 0 || b < 0 || a >= W || b >= H) continue;
          const d = Math.hypot((a + 0.5 - gx) * RES, (b + 0.5 - gz) * RES), e = d >= rad ? 0 : 1 - (d / rad) ** 2;
          const v = Math.round(Math.min(255, e * s * 110));
          if (v > data[b * W + a]) data[b * W + a] = v;
        }
      }
    }
  });
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return { tex, box: { x0, z0, w: W * RES, h: H * RES }, home, routes };
}

// Into the carpet's material: `box.y` follows the car (B3's rooms are laid out from it); set it with at(z0).
export function wear(m, { tex, box }) {
  const U = { wornT: { value: tex }, wornB: { value: new THREE.Vector4(box.x0, box.z0, 1 / box.w, 1 / box.h) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWorn;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWorn = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      #define WORN ${WORN.toFixed(3)}
      varying vec2 vWorn; uniform sampler2D wornT; uniform vec4 wornB;
      float wornN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
        float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        float m = texture2D(wornT, (vWorn - wornB.xy) * wornB.zw).r;
        if (m > 0.0) {   // frayed: broken up at the edges, patchy along
          float n = wornN(vWorn * 7.0) * 0.6 + wornN(vWorn * 19.0) * 0.4;
          float w = clamp(m * 1.6 - 0.25 + (n - 0.5) * 0.7, 0.0, 1.0) * (0.7 + 0.6 * wornN(vWorn * 0.6));
          vec3 c = diffuseColor.rgb, pile = diffuse * texture2D(map, vMapUv, 5.0).rgb;   // the pile flattened: less of its grain
          c = mix(c, pile, 0.6 * w);
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(c, vec3(l), 0.15 * w);   // greyer
          diffuseColor.rgb = c * (1.0 + WORN * w);   // and paler
        }
      }`);
  };
  m.customProgramCacheKey = () => 'worn';
  return { U, at: (z0) => { U.wornB.value.y = box.z0 + z0; } };
}
