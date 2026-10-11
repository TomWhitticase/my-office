// Relativity's architecture (floors/relativity.js): one layout, built three times, once in each gravity's own coordinates
// (relativity-gravity.js), so the three fit together as in Escher's print and only gravity is split. In its own frame
// a gravity has a floor (y = -L) with an arcade on its two open sides and a garden beyond, sunk a storey and running off
// into the haze; the next gravity's floor is its wall at z = -L, the previous one's at x = -L, and the hall's other faces
// are open. Up from its floor a stair climbs to a landing at the foot of the stair it shares with the next gravity:
// it walks up the top of that one while the next walks up its underside, and the landing's edge beside it rolls you
// over onto the next one's landing below. Off the top a bridge crosses to the foot of the stair it shares with the
// previous gravity (it walks that one's underside), and up that to a balcony with a door that opens onto sky.
//
// Everything you can bump into is an axis-aligned box in `boxes` (with `m`, the frames it's a floor for, for rolling);
// what you see is merged into a few meshes. `check()` reports boxes of different pieces that overlap, so a change can't
// quietly put one gravity's stair through another's landing.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frameM, toWorld } from './relativity-gravity.js';

export const L = 15;
// The shared stair, in its upper gravity's frame: steps x xa..xa+W, from the foot corner (y yf, z zf) up n steps of h
// (rise = run) toward +z; T, how deep its stepped underside is; the landings' slab (T1), depth (D) and extra width (EXT).
export const DOOR = { w: 1.1, s: 1.7 };   // the way out: as wide as B3's stone door, springing as high
export const S = { xa: -3, W: 3, yf: -9, zf: -4.2, n: 16, h: 0.3, T: 0.42, T1: 0.5, D: 2.4, EXT: 3.3 };
S.yt = S.yf + S.n * S.h; S.zt = S.zf + S.n * S.h;
const RAIL = 1.0, TILE = 1.2;
const bit = (k) => 1 << ((k % 3 + 3) % 3);

export function buildArch(R) {
  const boxes = [], pieces = [], geos = { stone: [], pale: [], lawn: [], leaf: [], wood: [], sky: [] };
  const M = [0, 1, 2].map(frameM);
  let piece = '';
  const col = (hex, j = 0.04) => { const c = new THREE.Color(hex); const v = 1 + (R() - 0.5) * j; return [c.r * v, c.g * v, c.b * v]; };
  const STONE = '#d6cfbf', PALE = '#e6e0d2', DARK = '#b8af9c';

  // ----- helpers, in frame k's own coordinates -----
  // A geometry made in frame k, turned into the world, coloured, with UVs a texture tile per TILE metres.
  function put(k, g, kind, rgb, worldUv = true) {
    g = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    g.applyMatrix4(M[k]);
    const P = g.attributes.position, N = g.attributes.normal;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(P.count * 2), 2));
    const U = g.attributes.uv;
    if (worldUv) for (let i = 0; i < P.count; i++) {
      const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
      const [u, v] = nx >= ny && nx >= nz ? [P.getZ(i), P.getY(i)] : ny >= nz ? [P.getX(i), P.getZ(i)] : [P.getX(i), P.getY(i)];
      U.setXY(i, u / TILE, v / TILE);
    }
    const c = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) c.set(rgb, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geos[kind].push(g);
    return g;
  }
  // A box from (x0, y0, z0) to (x1, y1, z1) in frame k: solid (in `boxes`, a floor for frames m) and/or shown.
  function box(k, x0, y0, z0, x1, y1, z1, { m = bit(k), solid = true, show = true, kind = 'stone', tint = STONE, j, rgb } = {}) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    const a = toWorld(k, [x0, y0, z0]), b = toWorld(k, [x1, y1, z1]);
    if (solid) { boxes.push({ min: a, max: b, m, piece }); }
    if (show) put(0, new THREE.BoxGeometry(b[0] - a[0], b[1] - a[1], b[2] - a[2]).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), kind, rgb || col(tint, j));
  }
  const begin = (name) => { piece = name; pieces.push(name); };

  // A wall with round-arched openings: along x (at z = at, thickness d toward +z) or along z (at x = at, toward +x),
  // from a to b along it, y0 up h. Openings: { c, w, s (spring height), rail, door }. Collision: the piers, the wall over
  // each opening, and a balustrade across it if `rail`.
  function arches(k, along, at, a, b, y0, h, d, open, { solid = true, tint = STONE } = {}) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(b - a, 0); sh.lineTo(b - a, h); sh.lineTo(0, h); sh.closePath();
    for (const o of open) {
      const uc = along === 'x' ? o.c - a : b - o.c, u0 = uc - o.w / 2, u1 = uc + o.w / 2, hole = new THREE.Path();
      hole.moveTo(u0, 0); hole.lineTo(u0, o.s); hole.absarc(uc, o.s, o.w / 2, Math.PI, 0, true); hole.lineTo(u1, 0); hole.closePath();
      sh.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 10 });
    // shape (u, v) and depth w into the frame: along x: (a + u, y0 + v, at + w); along z: (at + w, y0 + v, b - u)
    const m4 = along === 'x' ? new THREE.Matrix4().set(1, 0, 0, a, 0, 1, 0, y0, 0, 0, 1, at, 0, 0, 0, 1)
      : new THREE.Matrix4().set(0, 0, 1, at, 0, 1, 0, y0, -1, 0, 0, b, 0, 0, 0, 1);
    put(k, g.applyMatrix4(m4), 'stone', col(tint));
    if (!solid) return;
    const seg = (u0, u1, v0, v1) => (along === 'x' ? box(k, u0, y0 + v0, at, u1, y0 + v1, at + d, { show: false })
      : box(k, at, y0 + v0, u0, at + d, y0 + v1, u1, { show: false }));
    let u = a;
    for (const o of [...open].sort((p, q) => p.c - q.c)) {
      seg(u, o.c - o.w / 2, 0, h); seg(o.c - o.w / 2, o.c + o.w / 2, o.s + o.w / 2 - 0.15, h);
      if (o.rail) {
        seg(o.c - o.w / 2, o.c + o.w / 2, 0, RAIL);
        const r = along === 'x' ? [o.c - o.w / 2, at + d / 2, o.c + o.w / 2, at + d / 2] : [at + d / 2, o.c - o.w / 2, at + d / 2, o.c + o.w / 2];
        rail(k, ...r, y0, { solid: false });
      }
      u = o.c + o.w / 2;
    }
    seg(u, b, 0, h);
  }
  // Openings of width w with piers p between, centred on a..b.
  const bays = (a, b, w, p, s, extra = {}) => {
    const n = Math.max(1, Math.floor((b - a - p) / (w + p))), used = n * (w + p) + p, o = a + (b - a - used) / 2 + p + w / 2;
    return Array.from({ length: n }, (_, i) => ({ c: o + i * (w + p), w, s, ...extra }));
  };
  // A balustrade on a level surface at height y, from (x0, z0) to (x1, z1) (one of them the same): a coping on
  // balusters, and a box you can't step over. Where two meet at a corner they'd share faces: what's shown stops 5 mm
  // short of each end (inside the one it meets), and one along z stands 5 mm taller than one along x.
  function rail(k, x0, z0, x1, z1, y, { solid = true, h = RAIL } = {}) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    if (len < 0.05) return;
    const lo = Math.min(alongX ? x0 : z0, alongX ? x1 : z1), c = alongX ? z0 : x0, a = lo + 0.005, b = lo + len - 0.005, t = alongX ? 0 : 0.005;
    const B = (u0, v0, w0, u1, v1, w1, o) => (alongX ? box(k, u0, v0, w0, u1, v1, w1, o) : box(k, w0, v0, u0, w1, v1, u1, o));
    B(a, y + h + t - 0.1, c - 0.12, b, y + h + t, c + 0.12, { solid: false, kind: 'pale', tint: PALE });
    B(a, y, c - 0.1, b, y + 0.12 + t, c + 0.1, { solid: false, kind: 'pale', tint: PALE });
    const n = Math.max(1, Math.round(len / 0.24));
    for (let i = 0; i <= n; i++) {
      const u = a + ((b - a) * i) / n, w = i === 0 || i === n ? 0.08 : 0.035;
      B(u - w, y + 0.12 + t, c - w, u + w, y + h + t - 0.1, c + w, { solid: false, kind: 'pale', tint: PALE });
    }
    if (solid) B(lo, y, c - 0.1, lo + len, y + h, c + 0.1, { show: false });
  }
  // A column from y0 to y1 at (x, z): shaft, base and capital.
  function column(k, x, z, y0, y1, r = 0.24) {
    const g = new THREE.CylinderGeometry(r * 0.9, r, y1 - y0 - 0.5, 14).translate(x, (y0 + y1) / 2 - 0.05, z);
    put(k, g, 'pale', col(PALE), false);
    box(k, x - r - 0.08, y0, z - r - 0.08, x + r + 0.08, y0 + 0.2, z + r + 0.08, { kind: 'pale', tint: PALE, solid: false });
    box(k, x - r - 0.1, y1 - 0.3, z - r - 0.1, x + r + 0.1, y1, z + r + 0.1, { kind: 'pale', tint: PALE, solid: false });
    box(k, x - r, y0, z - r, x + r, y1, z + r, { show: false });
  }

  // ----- the pieces -----
  const doors = [], skyDoors = [], paths = [], seats = [];
  for (let k = 0; k < 3; k++) {
    begin(`floor${k}`);
    box(k, -L, -L - 1, -L, L + 3, -L, L + 3, { tint: '#cfc7b6' });
    // flagstones: a grid of joints, a shade darker (kept to the floor, not over its edges; where they cross, one way a
    // little prouder, and each stops 1 cm short of the edge joints across its ends)
    for (let i = -L; i <= L + 3; i += 3) {
      const u0 = Math.max(-L, i - 0.015), u1 = Math.min(L + 3, i + 0.015);
      box(k, u0, -L, -L + 0.01, u1, -L + 0.004, L + 2.99, { solid: false, kind: 'stone', tint: DARK });
      box(k, -L + 0.01, -L, u0, L + 2.99, -L + 0.008, u1, { solid: false, kind: 'stone', tint: DARK });
    }
    begin(`arcade${k}`);
    arches(k, 'z', L, -7, L, -L, 6.5, 0.8, bays(-7, L, 2.7, 0.9, 3.3, { rail: true }));
    arches(k, 'x', L, -7, L + 0.8, -L, 6.5, 0.8, bays(-7, L + 0.8, 2.7, 0.9, 3.3, { rail: true }));
    box(k, L - 0.1, -L + 6.5, -7, L + 0.9, -L + 6.9, L + 0.9, { solid: false, kind: 'pale', tint: PALE });   // a cornice
    box(k, -7, -L + 6.5, L - 0.1, L - 0.1, -L + 6.9, L + 0.9, { solid: false, kind: 'pale', tint: PALE });   // (up to the other one)
    begin(`garden${k}`);
    rail(k, L + 3, -6.5, L + 3, L + 3, -L, { solid: false });
    rail(k, -6.5, L + 3, L + 3, L + 3, -L, { solid: false });
    box(k, L + 2.6, -L - 3.6, -6.5, L + 3, -L - 1, L + 3, { solid: false, tint: DARK });   // the retaining wall down to the lawn
    box(k, -6.5, -L - 3.6, L + 2.6, L + 2.6, -L - 1, L + 3, { solid: false, tint: DARK });
    box(k, L + 3, -L - 4.2, -6, 70, -L - 3.6, 70, { solid: false, kind: 'lawn', tint: '#c9c8b4' });
    box(k, -6, -L - 4.2, L + 3, L + 3, -L - 3.6, 70, { solid: false, kind: 'lawn', tint: '#c9c8b4' });
    const yl = -L - 3.6;
    for (let n = 0; n < 46; n++) {   // round trees and cypresses, off in the haze
      const far = R() < 0.5, x = far ? L + 6 + R() * 50 : -3 + R() * (L + 4), z = far ? -3 + R() * 60 : L + 6 + R() * 50;
      if (x < L + 6 && z < L + 6) continue;
      const cyp = R() < 0.35, ht = cyp ? 6 + R() * 5 : 3 + R() * 3, s = 0.8 + R() * 0.6;
      put(k, new THREE.CylinderGeometry(0.12 * s, 0.18 * s, ht * 0.5, 6).translate(x, yl + ht * 0.25, z), 'leaf', col('#8f8a7c'), false);
      const crown = cyp ? new THREE.ConeGeometry(0.9 * s, ht, 8).translate(x, yl + ht * 0.62, z)
        : new THREE.IcosahedronGeometry(1.4 * s + ht * 0.25, 1).scale(1, 0.85, 1).translate(x, yl + ht * 0.55 + 1, z);
      put(k, crown, 'leaf', col('#bdbcae', 0.15), false);
    }
    for (let n = 0; n < 6; n++) {   // hedges
      const x = L + 8 + n * 7;
      box(k, x, yl, 4, x + 1.2, yl + 1.2, 40, { solid: false, kind: 'leaf', tint: '#b6b5a6' });
      box(k, 4, yl, x, 40, yl + 1.3, x + 1.2, { solid: false, kind: 'leaf', tint: '#b6b5a6' });   // (taller than those they cross)
    }
    // far off, more of the same building: arcades on arcades
    for (const [along, at] of [['z', 72 + k * 0.5], ['x', 72 + k * 0.5]]) {   // (each gravity's further out: two cross)
      for (let lvl = 0; lvl < 3; lvl++) arches(k, along, at, -6, 72, yl + lvl * 7, 7, 1, bays(-6, 72, 3, 1.2, 4), { solid: false, tint: lvl ? '#cbc3b2' : DARK });
    }

    // the stair shared with the next gravity: this one on top, the next underneath
    begin(`stair${k}`);
    const { xa, W, yf, zf, n, h, T, T1, D, EXT, yt, zt } = S, mm = bit(k) | bit(k + 1);
    for (let i = 0; i < n; i++) {
      const step = { m: mm, tint: i % 2 ? STONE : '#d1c9b8', j: 0.02 };
      if (i < n - 1) box(k, xa, yf + i * h - T, zf + i * h, xa + W, yf + (i + 1) * h, zf + (i + 1) * h, step);
      else {   // the top one: its right half's in the next one's top landing (below), so only what's under that is shown
        const rgb = col(step.tint, step.j);
        box(k, xa, yf + i * h - T, zf + i * h, xa + W, yf + (i + 1) * h, zf + (i + 1) * h, { m: mm, show: false });
        box(k, xa, yf + i * h - T, zf + i * h, xa + W / 2, yf + (i + 1) * h, zf + (i + 1) * h, { solid: false, rgb });
        box(k, xa + W / 2, yf + i * h - T, zf + i * h, xa + W, yt - T, zf + (i + 1) * h, { solid: false, rgb });
      }
      for (const x of [xa, xa + W - 0.2]) {   // balustrades: on top (this gravity's), and on the underside (the next one's)
        box(k, x, yf + (i + 1) * h, zf + i * h, x + 0.2, yf + (i + 1) * h + RAIL, zf + (i + 1) * h, { show: false });
        box(k, x, yf + i * h - T, zf + (i + 1) * h, x + 0.2, yf + (i + 1) * h - T, zf + (i + 1) * h + RAIL, { show: false });
        box(k, x + 0.065, yf + (i + 1) * h, zf + i * h + 0.105, x + 0.135, yf + (i + 1) * h + RAIL - 0.1, zf + i * h + 0.175, { solid: false, kind: 'pale', tint: PALE });
        box(k, x + 0.065, yf + i * h - T + 0.1, zf + (i + 1) * h, x + 0.135, yf + i * h - T + 0.17, zf + (i + 1) * h + RAIL - 0.1, { solid: false, kind: 'pale', tint: PALE });
      }
    }
    for (const x of [xa, xa + W - 0.2]) {   // the copings, sloped
      const len = Math.hypot(n * h, n * h), cg = (y, z) => new THREE.BoxGeometry(0.22, 0.1, len).rotateX(-Math.PI / 4).translate(x + 0.1, y, z);
      put(k, cg(yf + n * h / 2 + RAIL - 0.05 + h / 2, zf + n * h / 2), 'pale', col(PALE));
      put(k, cg(yf + n * h / 2 - T + h / 2, zf + n * h / 2 + RAIL - 0.05), 'pale', col(PALE));
    }
    box(k, xa, yf - T1, zf - D, xa + W + EXT, yf, zf, { m: mm });   // its foot: this one's landing, and the next one's
    box(k, xa, yf - D, zf - T1, xa + W + EXT, yf - T1, zf, { m: mm });
    box(k, xa - EXT, yt - T1, zt, xa + W / 2, yt, zt + D, { m: bit(k) });   // its top: split, this one's to the left
    box(k, xa + W / 2, yt - T, zt - h - 0.2, xa + W + EXT, yt + D, zt, { m: bit(k + 1) });

    // this gravity's way up: a solid stair from the floor to the foot landing, on two columns
    begin(`approach${k}`);
    const ax = xa + W + EXT, steps = Math.round((yf + L) / h);
    for (let i = 0; i < steps; i++) box(k, ax + (steps - 1 - i) * h, -L, zf - D, ax + (steps - i) * h, -L + (i + 1) * h, zf - 0.6, { j: 0.02 });
    for (let i = 0; i < steps; i++) {
      const x0 = ax + (steps - 1 - i) * h, y = -L + (i + 1) * h;
      for (const z of [zf - D + 0.12, zf - 0.72]) {
        box(k, x0, y, z - 0.1, x0 + h, y + RAIL, z + 0.1, { show: false });
        box(k, x0 + 0.12, y, z - 0.035, x0 + 0.19, y + RAIL - 0.1, z + 0.035, { solid: false, kind: 'pale', tint: PALE });
      }
    }
    for (const z of [zf - D + 0.12, zf - 0.72]) {
      const len = Math.hypot(steps * h, steps * h);
      put(k, new THREE.BoxGeometry(len, 0.1, 0.24).rotateZ(-Math.PI / 4).translate(ax + steps * h / 2, -L + steps * h / 2 + RAIL - 0.05 + h / 2, z), 'pale', col(PALE));
    }
    column(k, xa + 0.3, zf - D + 0.3, -L, yf - T1);
    column(k, xa + 0.3, zf - 0.75, -L, yf - T1);
    column(k, ax - 0.3, zf - 0.75, -L, yf - T1);
    // the foot landing's balustrades: not on the edge beside the stair (over it, you roll onto the next one's landing)
    rail(k, xa + 0.1, zf - D, xa + 0.1, zf, yf);
    rail(k, xa, zf - D + 0.1, ax, zf - D + 0.1, yf);
    // the bridge from the top across to the foot of the stair shared with the previous gravity (whose landing is at
    // x yf - D .. yf - T1, y zf, z xa .. xa + W + EXT in this frame)
    begin(`bridge${k}`);
    const bx0 = yf, bz0 = zt - 0.3, bz1 = zt + 1.5;
    box(k, bx0, yt - T1, bz0, xa - EXT, yt, bz1);
    for (let x = bx0 + 1.2; x < xa - EXT - 0.5; x += 2.2) box(k, x, yt - T1 - 0.5, bz0, x + 0.25, yt - T1, bz1, { solid: false, tint: DARK });   // ribs under it
    rail(k, bx0, bz0 + 0.1, xa - EXT, bz0 + 0.1, yt);
    rail(k, bx0, bz1 - 0.1, xa - EXT, bz1 - 0.1, yt);
    rail(k, xa - EXT + 0.1, bz1, xa - EXT + 0.1, zt + D, yt);   // round the top landing
    rail(k, xa - EXT, zt + D - 0.1, xa + W / 2, zt + D - 0.1, yt);
    rail(k, xa - EXT, zt + 0.1, xa, zt + 0.1, yt);
    rail(k, xa + W / 2 - 0.1, zt, xa + W / 2 - 0.1, zt + D, yt);
    // and the far landing's: round the previous gravity's foot landing, which this one walks out over
    rail(k, yf - D + 0.1, xa, yf - D + 0.1, xa + W + EXT, zf);
    rail(k, yf - D, xa + 0.1, yf - T, xa + 0.1, zf);
    rail(k, yf - D, xa + W + EXT - 0.1, bx0, xa + W + EXT - 0.1, zf);
    // the balcony at the top of that stair (the previous gravity's split top, its right half), and its door onto sky
    begin(`balcony${k}`);
    const by = zt, bx = yt + D;   // its floor at y zt, x yt - T .. yt + D, z xa + W/2 .. xa + W + EXT
    rail(k, yt - T, xa + W + EXT - 0.1, bx - 0.3, xa + W + EXT - 0.1, by);
    rail(k, yt, xa + W / 2 + 0.1, bx - 0.3, xa + W / 2 + 0.1, by);
    arches(k, 'z', bx - 0.3, xa + W / 2, xa + W + EXT, by, 3.6, 0.3, [{ c: xa + W / 2 + (W / 2 + EXT) / 2, w: 1.2, s: 1.8 }]);
    skyDoors.push({ k, hinge: [bx - 0.18, by, xa + W / 2 + (W / 2 + EXT) / 2 - 0.6], w: 1.2, s: 1.8, along: 'z' });
    paths.push({ k, kind: 'under', pts: [[yf - 1.4, zf, xa + W - 0.75], [yf - T, zf, xa + W - 0.75], [yt - T, zt, xa + W - 0.75], [bx - 1.2, zt, xa + W - 0.75]] });

    // the way back out: a wall on the floor with a door in it, and figures' places
    begin(`door${k}`);
    const dz = 9;
    // (the doorway's the stone door's on B3, to the centimetre: you walk from one into the other, relativity-door.js)
    arches(k, 'x', dz, 5, 13, -L, 5, 0.6, [{ c: 9, w: DOOR.w, s: DOOR.s, door: true }, { c: 6.4, w: 0.9, s: 2.4 }, { c: 11.6, w: 0.9, s: 2.4 }]);
    const shut = boxes.length;   // what stops you while it's shut
    box(k, 9 - DOOR.w / 2, -L, dz, 9 + DOOR.w / 2, -L + DOOR.s + DOOR.w / 2, dz + 0.6, { show: false });
    doors.push({ k, hinge: [9 - DOOR.w / 2, -L, dz + 0.3], w: DOOR.w, s: DOOR.s, along: 'x', at: [9, -L, dz - 1.1], yaw: 0.87, sill: [9, -L, dz], shut });
    box(k, 4.8, -L + 5, dz - 0.1, 13.2, -L + 5.3, dz + 0.7, { solid: false, kind: 'pale', tint: PALE });
    begin(`table${k}`);   // a long table and its benches
    box(k, 2.6, -L + 0.72, 1.6, 5.4, -L + 0.8, 2.6, { kind: 'wood', tint: '#7d6a55', solid: false });
    for (const [x, z] of [[2.8, 1.8], [5.2, 1.8], [2.8, 2.4], [5.2, 2.4]]) box(k, x - 0.05, -L, z - 0.05, x + 0.05, -L + 0.72, z + 0.05, { kind: 'wood', tint: '#5f5040', solid: false });
    box(k, 2.6, -L, 1.6, 5.4, -L + 0.8, 2.6, { show: false });
    for (const z of [1.0, 3.2]) { box(k, 2.7, -L + 0.42, z - 0.2, 5.3, -L + 0.48, z + 0.2, { kind: 'wood', tint: '#7d6a55', solid: false }); box(k, 2.7, -L, z - 0.2, 5.3, -L + 0.48, z + 0.2, { show: false }); }
    seats.push({ k, at: [3.5, -L, 0.95], yaw: Math.PI }, { k, at: [4.6, -L, 3.25], yaw: 0 });
    paths.push({ k, kind: 'top', pts: [[xa + 0.75, yf, zf - 1.4], [xa + 0.75, yf, zf], [xa + 0.75, yt, zt], [xa + 0.75, yt, zt + 1.2]] });
    paths.push({ k, kind: 'walk', pts: [[11, -L, 3], [10, -L, zf - 1.6], [ax + steps * h + 0.6, -L, zf - 1.6], [ax, yf, zf - 1.6], [xa + 1.6, yf, zf - 1.6]] });
    paths.push({ k, kind: 'basket', pts: [[L - 1.4, -L, -5], [L - 1.4, -L, L - 1.4], [-3, -L, L - 1.4]] });
    paths.push({ k, kind: 'walk', pts: [[xa - EXT + 0.5, yt, zt + 0.7], [bx0 - 0.5, yt, zt + 0.7], [bx0 - 0.6, zf, xa + 1.2]] });
    paths.push({ k, kind: 'lean', pts: [[xa - 0.6, yt, zt + D - 0.5]], yaw: 0 });
    paths.push({ k, kind: 'lean', pts: [[L - 0.7, -L, 2.7]], yaw: Math.PI / 2 });
  }

  // ----- merged -----
  const merged = Object.fromEntries(Object.entries(geos).filter(([, l]) => l.length).map(([kind, l]) => {
    const g = mergeGeometries(l);
    for (const x of l) x.dispose();
    return [kind, g];
  }));
  // Boxes of different pieces that overlap (touching is fine): none, for a consistent building.
  function check() {
    const bad = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.piece === b.piece) continue;
      let ok = true;
      for (let d = 0; d < 3; d++) if (a.min[d] >= b.max[d] - 1e-3 || b.min[d] >= a.max[d] - 1e-3) { ok = false; break; }
      if (ok) bad.push(`${a.piece} × ${b.piece}: [${a.min.map((v) => v.toFixed(2))}]-[${a.max.map((v) => v.toFixed(2))}] / [${b.min.map((v) => v.toFixed(2))}]-[${b.max.map((v) => v.toFixed(2))}]`);
    }
    return bad;
  }
  return { boxes, merged, doors, skyDoors, paths, seats, check };
}
