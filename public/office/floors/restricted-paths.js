// Worn paths in B3's carpet (floors/restricted.js): from the lift to every hidden way out. Very faint: a soft strip of
// flatter, paler, greyer pile half a metre or so wide that wanders a little and frays, a touch stronger through doorways
// and where the way turns. Someone who knows to look can follow it.
// The ways out are a registry, restr.hidden (the minimap's warps read it too, restricted-warps.js): a door adds itself
// with restr.hidden.add(name, find, { shown }), find() giving { X, Z, YAW }, the doorway's middle on its wall's face in
// B3's own space (the car at z = 0) and YAW the way out of it into the room (+z turned by YAW), worked out from B3's
// fixed layout. Each gets a trail, the walk from the lift (findExit's) to it; trails share their way as far as they go
// together, and there the wear is a little stronger, not stacked. Baked once, the first time B3's seen (again only if a
// door's added after), into one mask over the floor's own space that the carpet's material reads (wear()): no extra
// draw calls.

import * as THREE from 'three';
import { findExit } from './world-edge-backstage.js';

const RES = 0.2, WORN = 0.32, MAXTX = 2.5e6;   // texels, metres (coarser if the trails spread so far the mask would pass MAXTX
// texels); how much paler the worn pile is at its most
const SHARE = 0.25, SHARED = 1.3;   // where trails run together: each other one adds this much of its wear, to at most this times one's
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
  // the stone door's home as a doorway (its wall's face, the way into the room)
  const hf = [[X(home.i), Z(home.j) + C / 2, Math.PI / 2], [X(home.i + 1), Z(home.j) + C / 2, -Math.PI / 2], [X(home.i) + C / 2, Z(home.j), 0], [X(home.i) + C / 2, Z(home.j + 1), Math.PI]][home.k];
  home.door = { X: hf[0], Z: hf[1], YAW: hf[2] };

  // ----- the registry, and the mask, baked from it when first wanted -----
  const hidden = restr.hidden = [];
  let dirty = true, baked = null;
  hidden.add = (name, find, { shown } = {}) => { hidden.push({ name, find, shown }); dirty = true; };
  const routes = {};
  function bake() {
    dirty = false;
    for (const k of Object.keys(routes)) delete routes[k];
    for (const h of hidden) {
      const d = h.find(), inw = [Math.sin(d.YAW), Math.cos(d.YAW)];
      const i = Math.floor((d.X + inw[0] * 0.5 - X(0)) / C), j = Math.floor((d.Z + inw[1] * 0.5 - Z(0)) / C);   // the room it opens into
      if (back.has(key(i, j))) routes[h.name] = route(i, j, [d.X, d.Z], inw);
    }
    return (baked = mask(Object.values(routes)));
  }

  // ----- the mask: soft discs stamped every few centimetres along each route, the strongest kept where a route overlaps
  // itself; where routes overlap, the strongest and a little of the rest. The wobble and the patchiness go by the distance
  // walked from the lift, the same for every route, so routes that share a way lie on each other there exactly. -----
  function mask(routes) {
    if (!routes.length) return { tex: new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat, THREE.UnsignedByteType), box: { x0: 0, z0: 0, w: 1, h: 1 } };
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const r of routes) for (const { p } of r) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    x0 -= 2; z0 -= 2; x1 += 2; z1 += 2;
    const res = Math.max(RES, Math.sqrt(((x1 - x0) * (z1 - z0)) / MAXTX));
    const W = Math.ceil((x1 - x0) / res), H = Math.ceil((z1 - z0) / res), data = new Uint8Array(W * H), sum = new Uint16Array(W * H), one = new Uint8Array(W * H);
    const lo = (u, s) => Math.sin(u * 0.9 + s) * 0.6 + Math.sin(u * 2.3 + s * 2.1) * 0.4;   // slow, smooth, -1..1
    for (const r of routes) {
      let u = 0;
      one.fill(0);
      for (let n = 0; n < r.length - 1; n++) {
        const A = r[n], B = r[n + 1], len = Math.hypot(B.p[0] - A.p[0], B.p[1] - A.p[1]), steps = Math.max(1, Math.ceil(len / 0.05));
        const nx = -(B.p[1] - A.p[1]) / (len || 1), nz = (B.p[0] - A.p[0]) / (len || 1);
        for (let k = 0; k < steps; k++, u += len / steps) {
          const f = k / steps, wob = lo(u * 0.5, 0) * 0.14;   // wanders a little side to side
          const px = A.p[0] + (B.p[0] - A.p[0]) * f + nx * wob, pz = A.p[1] + (B.p[1] - A.p[1]) * f + nz * wob;
          const s = (A.s + (B.s - A.s) * f) * (0.8 + 0.2 * lo(u * 1.7, 1)), rad = 0.42 + 0.07 * lo(u * 1.1, 2);
          const gx = (px - x0) / res, gz = (pz - z0) / res, R = Math.ceil(rad / res) + 1;
          for (let a = Math.floor(gx - R); a <= gx + R; a++) for (let b = Math.floor(gz - R); b <= gz + R; b++) {
            if (a < 0 || b < 0 || a >= W || b >= H) continue;
            const d = Math.hypot((a + 0.5 - gx) * res, (b + 0.5 - gz) * res), e = d >= rad ? 0 : 1 - (d / rad) ** 2;
            const v = Math.round(Math.min(255, e * s * 110));
            if (v > one[b * W + a]) one[b * W + a] = v;
          }
        }
      }
      for (let k = 0; k < one.length; k++) if (one[k]) { sum[k] += one[k]; if (one[k] > data[k]) data[k] = one[k]; }
  }
  for (let k = 0; k < data.length; k++) if (sum[k] > data[k]) data[k] = Math.min(255, data[k] * SHARED, data[k] + (sum[k] - data[k]) * SHARE);
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return { tex, box: { x0, z0, w: W * res, h: H * res } };
  }
  // the mask, baked now if it's not yet (or a door's been added since)
  const get = () => (dirty || !baked ? bake() : baked);
  return { home, routes, get };
}

// Into the carpet's material: `box.y` follows the car (B3's rooms are laid out from it); set it with at(z0), which bakes
// the mask the first time.
export function wear(m, paths) {
  const none = new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat, THREE.UnsignedByteType); none.needsUpdate = true;
  const U = { wornT: { value: none }, wornB: { value: new THREE.Vector4(0, 0, 1, 1) } };
  let mine = null;
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
  return {
    U,
    at(z0) {
      const b = paths.get();
      if (b !== mine) { mine = b; U.wornT.value = b.tex; U.wornB.value.set(b.box.x0, 0, 1 / b.box.w, 1 / b.box.h); }
      U.wornB.value.y = b.box.z0 + z0;
    },
  };
}
