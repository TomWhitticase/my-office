// Coplanar overlaps (part of the world suite): two visible surfaces on the same plane, facing the same way, overlapping in
// area, fight for the same pixels and flicker as you move (see CLAUDE.md, "Surfaces never share a plane"). Each scene (the
// office, then every floor in turn, as you'd see it there) is walked for the meshes drawn, instanced and merged geometry
// included; triangles are bucketed by plane (normal to ~0.5°, distance to 1 mm) and the overlapping pairs reported, biggest
// first, with where they are. Left out: shader materials (their vertex shaders put the geometry somewhere else: the sky, the
// sea, the sunbeams), what your view doesn't draw (hidden, see-through glass, polygonOffset decals, another camera's layer),
// and faces nobody sees: a closed box's insides, undersides on a floor, a face pressed against one facing it, two that
// don't write depth (they blend), and two that draw the same pixels whichever wins (same material, colour and texture
// placement). Anything listed in ALLOW (with why) is let through; anything else fails the suite.
// Per-scene results are cached in test/out against a fingerprint of what's drawn there, so an unchanged scene isn't redone.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/server.mjs';

const OUT = path.join(ROOT, 'test', 'out'), CACHE = path.join(OUT, 'coplanar-cache.json');
const MIN_AREA = 2e-4;   // m² (2 cm²): less is a sliver along a shared edge, not a surface

// In the page: the overlaps in what's drawn under `root` now. Returns { tris, fp, hits: [{ a, b, area, at: [x, y, z] }] }.
function scanScene([which, cachedFp]) {
  const o = window.__office, THREE = o.ctx.THREE;
  const root = which === 'office' ? o.ctx.scene : (o.ctx.away?.scene || o.ctx.scene);
  root.updateMatrixWorld(true);
  const people = new Set([...o.people.values()].map((p) => p.root));
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const M = new THREE.Matrix4(), IM = new THREE.Matrix4();
  const tris = [];   // flat: [nx, ny, nz, d, x0,y0,z0, x1,y1,z1, x2,y2,z2, src, r,g,b, u0,v0,u1,v1,u2,v2]
  const srcs = [], srcMat = [], srcNew = [], srcNoDepth = [];
  // The office's scene, seen again with a floor in it (the roof, 46, the empty floors): what the office pass already
  // scanned is only looked at where it shares a plane with something new, and only pairs with something new are reported.
  const seen = window.__coplanarSeen ||= new Set(), first = which === 'office', again = !first && root === o.ctx.scene;
  const sig = (m) => m.uuid + ':' + m.matrixWorld.elements.map((x) => x.toFixed(4)).join(',');
  let keep = null;   // in an `again` pass, the planes the new triangles are on
  const label = (m) => {
    const names = [];
    for (let x = m; x && x !== root && names.length < 3; x = x.parent) if (x.name) names.unshift(x.name);
    const w = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    // (COPLANAR_WHERE: the first two places in the office's own files that built it, past the shared helpers)
    const at = m.__at ? ' ' + m.__at.split('\n').filter((l) => /\/office\//.test(l) && !/util\.js|furniture\.js/.test(l)).slice(0, 2)
      .map((l) => l.replace(/.*\/office\/|\)$/g, '').replace(/:\d+$/, '')).join(' < ') : '';
    return `${names.join('/') || '·'}${at} ${m.geometry?.type?.replace('Geometry', '') || m.type}:${m.geometry?.attributes.position.count}${m.isInstancedMesh ? '×' + m.count : ''} @${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)}`;
  };
  const skipMat = (mt) => !mt || mt.isShaderMaterial || mt.visible === false || mt.colorWrite === false || mt.polygonOffset || mt.isShadowMaterial
    || (mt.transparent && mt.opacity < 0.95) || mt.depthTest === false;
  // The triangles of g with an edge no other triangle shares (vertices matched by position, to 0.1 mm).
  const openOf = new Map();
  function openTri(g, t) {
    if (!openOf.has(g)) {
      const pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      const vk = [], edges = new Map(), open = new Set();
      for (let i = 0; i < n; i++) vk.push(key(idx ? idx.getX(i) : i));
      const ek = (a, b) => (vk[a] < vk[b] ? vk[a] + '|' + vk[b] : vk[b] + '|' + vk[a]);
      for (let i = 0; i + 2 < n; i += 3) for (let j = 0; j < 3; j++) { const k = ek(i + j, i + (j + 1) % 3); edges.set(k, (edges.get(k) || 0) + 1); }
      for (let i = 0; i + 2 < n; i += 3) for (let j = 0; j < 3; j++) if (edges.get(ek(i + j, i + (j + 1) % 3)) === 1) { open.add(i); break; }
      openOf.set(g, open);
    }
    return openOf.get(g).has(t);
  }
  function addMesh(m) {
    const g = m.geometry, pos = g?.attributes?.position;
    if (!pos) return;
    const isNew = !again || !seen.has(sig(m));
    if (first) seen.add(sig(m));
    if (keep ? isNew : !isNew) return;   // (an `again` pass: the new first, then the old on their planes)
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : pos.count, materialIndex: 0 }];
    const idx = g.index, count = m.isInstancedMesh ? m.count : 1, col = g.attributes.color, uv = g.attributes.uv, ic = new THREE.Color();
    for (let k = 0; k < count; k++) {
      M.copy(m.matrixWorld);
      if (m.isInstancedMesh) { m.getMatrixAt(k, IM); M.multiply(IM); }
      for (const gr of groups) {
        const mt = mats[gr.materialIndex ?? 0];
        if (skipMat(mt)) continue;
        const sid = srcs.length;
        srcNew.push(isNew);
        if (m.isInstancedMesh && m.instanceColor) m.getColorAt(k, ic); else ic.setRGB(1, 1, 1);
        srcMat.push(mt.uuid + (mt.map ? ':map' : '')); srcNoDepth.push(mt.depthWrite === false);
        srcs.push(`${label(m)} [${mt.type.replace('Mesh', '').replace('Material', '')}${mt.color ? ' #' + mt.color.getHexString() : ''}${mt.map ? ' map' : ''}${mats.length > 1 ? ' g' + gr.materialIndex : ''}]`);
        const end = Math.min(gr.start + gr.count, idx ? idx.count : pos.count);
        for (let t = gr.start; t + 2 < end; t += 3) {
          for (let j = 0; j < 3; j++) v[j].fromBufferAttribute(pos, idx ? idx.getX(t + j) : t + j).applyMatrix4(M);
          e1.subVectors(v[1], v[0]); e2.subVectors(v[2], v[0]); n.crossVectors(e1, e2);
          const a2 = n.length();
          if (a2 < 2e-6) continue;   // a sliver: under 1 mm²
          n.divideScalar(a2);
          if (M.determinant() < 0) n.negate();
          // Double-sided, the back counts only on an open surface (a triangle with a free edge): a closed box's insides never show.
          const sides = mt.side === THREE.DoubleSide ? (openTri(g, t) ? [1, -1] : [1]) : mt.side === THREE.BackSide ? [-1] : [1];
          const ix = [0, 1, 2].map((j) => (idx ? idx.getX(t + j) : t + j));
          let r = ic.r, gg = ic.g, bb = ic.b;
          if (col && mt.vertexColors) { r *= col.getX(ix[0]); gg *= col.getY(ix[0]); bb *= col.getZ(ix[0]); }
          const uvs = uv && mt.map ? ix.flatMap((j) => [uv.getX(j), uv.getY(j)]) : [0, 0, 0, 0, 0, 0];
          if (n.y < -0.999 && floorYs.some((f) => Math.abs(v[0].y - f) < 0.002)) continue;   // an underside on a floor: never seen
          if (keep && !sides.some((s) => keep.has(planeKey(n.x * s, n.y * s, n.z * s, n.dot(v[0]) * s)))) continue;
          for (const s of sides) tris.push(n.x * s, n.y * s, n.z * s, n.dot(v[0]) * s, v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z, sid, r, gg, bb, ...uvs);
        }
      }
    }
  }
  // The floors you stand on here: a floor's own scene's, or in the office's every storey of the tower (48 down to 44, the roof).
  const floorYs = root === o.ctx.scene ? [-4, -3, -2, -1, 0, 1].map((k) => k * (3.3 + 0.5)) : [0];
  const nKey = (x, y, z) => `${Math.round(x * 115)},${Math.round(y * 115)},${Math.round(z * 115)}`;   // 1/115 ≈ 0.5°
  const planeKey = (x, y, z, d) => nKey(x, y, z) + '|' + Math.round(d * 250);
  const meshes = [];
  (function walk(x) {
    if (!x.visible || people.has(x) || typeof x.userData?.sessionId === 'string') return;
    if (x.isMesh && !x.isSkinnedMesh && (x.layers.mask & o.camera.layers.mask)) meshes.push(x);   // (what your view draws: not a camera's own layer)
    for (const c of x.children) walk(c);
  })(root);
  // What's drawn, fingerprinted: every mesh's place, vertices and materials. Unchanged since the last run, its hits stand.
  let fp = 2166136261;
  const mix = (x) => { fp = Math.imul(fp ^ (Math.round(x * 1e4) | 0), 16777619); };
  for (const m of meshes) {
    for (const x of m.matrixWorld.elements) mix(x);
    const a = m.geometry?.attributes?.position?.array, ix = m.geometry?.index?.array;
    if (a) for (let i = 0; i < a.length; i++) mix(a[i]);
    if (ix) for (let i = 0; i < ix.length; i++) fp = Math.imul(fp ^ ix[i], 16777619);
    if (m.isInstancedMesh) { mix(m.count); const im = m.instanceMatrix.array; for (let i = 0; i < m.count * 16; i++) mix(im[i]); }
    for (const mt of [m.material].flat()) if (mt) { mix(mt.side); mix(mt.opacity); mix(+mt.transparent); mix(+mt.visible); mix(+!!mt.map); mix(+mt.polygonOffset); mt.color && mix(mt.color.getHex()); }
  }
  const fps = (fp >>> 0).toString(16) + ':' + meshes.length + (again ? ':' + window.__coplanarOffice : '');
  if (first) window.__coplanarOffice = fps;
  if (fps === cachedFp) { if (first) for (const m of meshes) seen.add(sig(m)); return { cached: true, fp: fps }; }
  for (const m of meshes) addMesh(m);
  if (again) {   // then the old, on the new triangles' planes (2 mm buckets and their neighbours)
    keep = new Set();
    for (let b = 0; b < tris.length; b += 23) {
      const nk = nKey(tris[b], tris[b + 1], tris[b + 2]), dk = Math.round(tris[b + 3] * 250);
      for (const k of [dk - 1, dk, dk + 1]) keep.add(nk + '|' + k);
    }
    for (const m of meshes) addMesh(m);
  }
  // Bucket by normal, then runs of near-equal distance along it, then pairs whose 2D boxes meet; clip for the overlap.
  const S = 23, N = tris.length / S, byN = new Map();
  for (let i = 0; i < N; i++) {
    const b = i * S, key = nKey(tris[b], tris[b + 1], tris[b + 2]);
    if (!byN.has(key)) byN.set(key, []);
    byN.get(key).push(i);
  }
  const area2 = (P) => { let a = 0; for (let i = 0; i < P.length; i += 2) { const j = (i + 2) % P.length; a += P[i] * P[j + 1] - P[j] * P[i + 1]; } return a / 2; };
  function clip(P, ax, ay, bx, by) {   // keep the left of a→b
    const out = [], L = P.length;
    for (let i = 0; i < L; i += 2) {
      const j = (i + 2) % L, px = P[i], py = P[i + 1], qx = P[j], qy = P[j + 1];
      const sp = (bx - ax) * (py - ay) - (by - ay) * (px - ax), sq = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
      if (sp >= 0) out.push(px, py);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push(px + (qx - px) * t, py + (qy - py) * t); }
    }
    return out;
  }
  // A face pressed against another facing it, on the same plane (a wall's top on the ceiling's underside, a box on a
  // shelf): buried, never seen. True if opposite-facing triangles there cover the overlap P (2D, in U/V).
  const oppCache = new Map();
  function buried(P, b, U, V, area) {
    const A = tris, key = nKey(-A[b], -A[b + 1], -A[b + 2]), d = -A[b + 3], ck = key + '|' + Math.round(d * 1000);
    let opp = oppCache.get(ck);
    if (!opp) {
      opp = (byN.get(key) || []).filter((i) => Math.abs(A[i * S + 3] - d) < 0.001).map((i) => {
        const q = i * S, Q = [A[q + 4 + U], A[q + 4 + V], A[q + 7 + U], A[q + 7 + V], A[q + 10 + U], A[q + 10 + V]];
        return area2(Q) < 0 ? [Q[0], Q[1], Q[4], Q[5], Q[2], Q[3]] : Q;
      });
      oppCache.set(ck, opp);
    }
    let covered = 0;
    for (const Q of opp) {
      let R = P;
      for (let e = 0; e < 6 && R.length >= 6; e += 2) { const f = (e + 2) % 6; R = clip(R, Q[e], Q[e + 1], Q[f], Q[f + 1]); }
      if (R.length >= 6) covered += area2(R);
      if (covered > area * 0.98) return true;
    }
    return false;
  }
  const pairs = new Map();
  let same = 0;
  // Two triangles that draw the same pixels whichever wins: one material, one colour, and the texture laid on the same
  // (the UVs one affine map of the plane for both). Their overlap can't flicker; it's counted, not reported.
  function uvMap(P, b) {   // the affine map (x, y) → (u, v) of a triangle in the plane's 2D coords
    const A = tris, [x0, y0, x1, y1, x2, y2] = P, det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(det) < 1e-12) return null;
    // P was put in ccw order: its vertices may be 0,2,1 of the triangle's
    const flip = P.flipped, u = flip ? [A[b + 17], A[b + 21], A[b + 19]] : [A[b + 17], A[b + 19], A[b + 21]], w = flip ? [A[b + 18], A[b + 22], A[b + 20]] : [A[b + 18], A[b + 20], A[b + 22]];
    const g = (q) => [((q[1] - q[0]) * (y2 - y0) - (q[2] - q[0]) * (y1 - y0)) / det, ((q[2] - q[0]) * (x1 - x0) - (q[1] - q[0]) * (x2 - x0)) / det];
    const [ux, uy] = g(u), [wx, wy] = g(w);
    return [ux, uy, u[0] - ux * x0 - uy * y0, wx, wy, w[0] - wx * x0 - wy * y0];
  }
  function alike(a, c, Pa, Pc) {
    const A = tris;
    if (srcMat[A[a + 13]] !== srcMat[A[c + 13]]) return false;
    if (Math.abs(A[a + 14] - A[c + 14]) + Math.abs(A[a + 15] - A[c + 15]) + Math.abs(A[a + 16] - A[c + 16]) > 0.01) return false;
    if (!srcMat[A[a + 13]].endsWith(':map')) return true;
    const ma = uvMap(Pa, a), mc = uvMap(Pc, c);
    return !!ma && !!mc && ma.every((x, i) => Math.abs(x - mc[i]) < (i % 3 === 2 ? 2e-3 : 1e-3));
  }
  for (const list of byN.values()) {
    if (list.length < 2) continue;
    list.sort((i, j) => tris[i * S + 3] - tris[j * S + 3]);
    for (let r0 = 0; r0 < list.length;) {
      let r1 = r0 + 1;
      while (r1 < list.length && tris[list[r1] * S + 3] - tris[list[r1 - 1] * S + 3] < 0.001) r1++;
      if (r1 - r0 > 1) {
        // 2D: drop the normal's biggest axis
        const b0 = list[r0] * S, ax = Math.abs(tris[b0]), ay = Math.abs(tris[b0 + 1]), az = Math.abs(tris[b0 + 2]);
        const [U, V, nd] = ax >= ay && ax >= az ? [1, 2, ax] : ay >= az ? [0, 2, ay] : [0, 1, az];
        const items = [];
        for (let q = r0; q < r1; q++) {
          const b = list[q] * S, P = [tris[b + 4 + U], tris[b + 4 + V], tris[b + 7 + U], tris[b + 7 + V], tris[b + 10 + U], tris[b + 10 + V]];
          if (area2(P) < 0) { P.splice(0, 6, P[0], P[1], P[4], P[5], P[2], P[3]); P.flipped = true; }
          items.push({ b, P, u0: Math.min(P[0], P[2], P[4]), u1: Math.max(P[0], P[2], P[4]), v0: Math.min(P[1], P[3], P[5]), v1: Math.max(P[1], P[3], P[5]) });
        }
        items.sort((a, c) => a.u0 - c.u0);
        const act = [];
        for (const it of items) {
          for (let k = act.length - 1; k >= 0; k--) if (act[k].u1 <= it.u0) act.splice(k, 1);
          for (const o2 of act) {
            if (o2.v1 <= it.v0 || it.v1 <= o2.v0) continue;
            const A = tris, a = o2.b, c = it.b;
            if (Math.abs(A[a + 3] - A[c + 3]) > 0.001 || A[a] * A[c] + A[a + 1] * A[c + 1] + A[a + 2] * A[c + 2] < 0.99996) continue;
            let P = it.P;
            for (let e = 0; e < 6 && P.length >= 6; e += 2) { const f = (e + 2) % 6; P = clip(P, o2.P[e], o2.P[e + 1], o2.P[f], o2.P[f + 1]); }
            if (P.length < 6) continue;
            const ar = area2(P) / nd;
            if (ar < 1e-6) continue;
            if (buried(P, a, U, V, ar * nd)) { same++; continue; }
            if (!srcNew[A[a + 13]] && !srcNew[A[c + 13]]) continue;
            if (srcNoDepth[A[a + 13]] && srcNoDepth[A[c + 13]]) continue;   // neither writes depth (frosting, glass): they blend, they don't fight
            if (alike(a, c, o2.P, it.P)) { same++; continue; }
            const sa = srcs[A[a + 13]], sc = srcs[A[c + 13]];
            const key = (sa < sc ? sa + '\n' + sc : sc + '\n' + sa) + '\n' + nKey(A[c], A[c + 1], A[c + 2]) + '|' + Math.round(A[c + 3] * 200);   // one plane (to 5 mm) a hit
            let h = pairs.get(key);
            if (!h) pairs.set(key, h = { a: sa < sc ? sa : sc, b: sa < sc ? sc : sa, area: 0, x: 0, y: 0, z: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9], n: [A[c], A[c + 1], A[c + 2]].map((x) => +x.toFixed(2)) });
            h.area += ar;
            const cx = (A[c + 4] + A[c + 7] + A[c + 10]) / 3, cy = (A[c + 5] + A[c + 8] + A[c + 11]) / 3, cz = (A[c + 6] + A[c + 9] + A[c + 12]) / 3;
            h.x += cx * ar; h.y += cy * ar; h.z += cz * ar;
            for (let k = 0; k < 3; k++) {   // the extent of the overlap: where both triangles' boxes meet
              const lo = Math.max(Math.min(A[a + 4 + k], A[a + 7 + k], A[a + 10 + k]), Math.min(A[c + 4 + k], A[c + 7 + k], A[c + 10 + k]));
              const hi = Math.min(Math.max(A[a + 4 + k], A[a + 7 + k], A[a + 10 + k]), Math.max(A[c + 4 + k], A[c + 7 + k], A[c + 10 + k]));
              h.lo[k] = Math.min(h.lo[k], lo); h.hi[k] = Math.max(h.hi[k], hi);
            }
          }
          act.push(it);
        }
      }
      r0 = r1;
    }
  }
  const hits = [...pairs.values()].map((h) => ({ a: h.a, b: h.b, n: h.n, box: h.lo.map((x, k) => `${x.toFixed(3)}..${h.hi[k].toFixed(3)}`).join(' '), area: +h.area.toFixed(4), at: [h.x / h.area, h.y / h.area, h.z / h.area].map((x) => +x.toFixed(2)) }));
  return { tris: N, same, fp: fps, hits };
}

// The places to look from: [scene name, how to get there (in the page)]. A floor's own scene, or the office's with that
// floor in it (the roof, 46, 45: 44 is the same build, moved), each scanned for what's new there. The lazily built ones
// are built through their debug hooks: the den under my office, the world's edge out past the city (from the helicopter),
// Relativity (through its door from B3), what's behind the sky, the painting on B3 and the Plain behind it, the other
// painting and the acrobats' coast behind it, the grid (and B3 round its doorway),
// and the winter village and its painting. COPLANAR_ONLY=name,name: only those.
const PLACES = [
  ['office', null],
  ['den', () => window.__office.secret.den(8.35, -12.5, 0, 0)],
  ...[-1, -2, -3, 45, 46].map((n) => [`floor ${n}`, (n) => window.__office.goFloor(n), n]),
  ['floor 50', () => window.__office.goFloor(50)],
  ['edge', () => { const o = window.__office; o.heli.board(); o.heli.S.cam = 'in'; o.heli.edge.place(300, 60); }],
  ['relativity', () => { window.__office.goFloor(-3); window.__office.ctx.rel.go(true); }],
  ['backstage', () => { const b = window.__office.heli.edge.back(); b.go(0, 13, 0, 0); }],
  ['plain painting', () => window.__office.plain.painting(0, 2, 0, 0)],
  ['plain', () => window.__office.plain.go(0, -3, 0, 0)],
  ['acro painting', () => window.__office.acro.painting(0, 2, 0, 0)],
  ['acro', () => { const a = window.__office.acro; a.go(0, -3, 0, 0); a.train(30); }],
  ['grid', () => window.__office.grid.go(0, -3, 0, 0)],
  ['grid door', () => window.__office.grid.door(0, 2.5, 0, 0)],
  ['grid door, the bookcase out', () => { const g = window.__office.grid; g.door(0, 2.5, 0, 0); g.bookcase(true); }],
  ['kettle painting', () => window.__office.kettle.painting(0, 2, 0, 0)],
  ['kettle', () => { const k = window.__office.kettle; k.go(0, -3, 0, 0); k.door(true); }],
];

// Intended overlaps, or ones another session is fixing: [scene, why, { box: [x0, x1, y0, y1, z0, z1] (where), upTo: n (at most
// this many in that scene) }]. A hit is let through if its centre is in the box, or the scene has no more than upTo.
export const ALLOW = [
  // Small joints left in the office's own parts (each under 90 cm², most under 10; listed in test/out/coplanar.txt): to tidy.
  ['office', 'small joints still to tidy: the stage\'s edges, the guitars\' bridges, the drinks fridges\' backs', { upTo: 11 }],
  ['floor 46', 'small joints still to tidy: changing-room benches, door frames, the pool\'s grate ends', { upTo: 24 }],
  ['floor -2', 'small joints still to tidy: the vault door\'s sill, the catalogue\'s drawers', { upTo: 7 }],
  ['floor -1', 'small joints still to tidy: a plant\'s leaves', { upTo: 4 }],
];

// Scans every place in a page of its own; 0 if nothing new shares a plane, else 1 (the list in test/out/coplanar.txt).
export async function runCoplanar(browser, base, log = console.log, { cached = true } = {}) {
  const { openOffice } = await import('./lib/browser.mjs');
  // COPLANAR_WHERE=1: each mesh remembers where it was added (three's Object3D.add, patched in this page only), and the
  // report names the file and line that built it: slower, for finding a hit's source.
  if (process.env.COPLANAR_WHERE) {
    const src = fs.readFileSync(path.join(ROOT, 'node_modules/three/build/three.core.js'), 'utf8')
      .replace('\tadd( object ) {', '\tadd( object ) { if ( arguments.length === 1 && object && ! object.__at ) object.__at = new Error().stack;');
    const newContext = browser.newContext.bind(browser);
    browser = Object.create(browser, { newContext: { value: async (...a) => {
      const c = await newContext(...a);
      await c.route('**/vendor/three/build/three.core.js', (r) => r.fulfill({ body: src, contentType: 'text/javascript' }));
      return c;
    } } });
  }
  const errors = [], o = await openOffice(browser, base, { errors });
  let cache = {};
  // (kept against this check's own code too: change how it looks, and everything's looked at afresh)
  const code = [...scanScene.toString()].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  try { cache = cached ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}; } catch {}
  if (cache.code !== code) cache = { code };
  const all = [], t0 = Date.now();
  try {
    const only = process.env.COPLANAR_ONLY?.split(',');
    for (const [name, go, arg] of PLACES) {
      if (only && !only.includes(name)) continue;
      if (go) { await o.eval(go, arg); await o.step(4); }
      const ts = Date.now(), r = await o.eval(scanScene, [name === 'office' ? 'office' : name, cache[name]?.fp]);
      if (r.cached) r.hits = cache[name].hits;
      else cache[name] = { fp: r.fp, hits: r.hits };
      if (process.env.COPLANAR_VERBOSE) log(`    ${name}: ${r.cached ? 'unchanged' : `${r.tris} triangles, ${r.same} alike or buried`}, ${r.hits.length} pairs, ${Date.now() - ts} ms`);
      for (const h of r.hits) if (h.area >= MIN_AREA) all.push({ scene: name, ...h });
    }
  } finally { await o.ctx.close(); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  // The same pair seen from two places counts once.
  const seen = new Set(), hits = [];
  for (const h of all.sort((a, b) => b.area - a.area)) {
    const k = `${h.a}|${h.b}|${h.at.join(',')}`;
    if (seen.has(k)) continue;
    seen.add(k); hits.push(h);
  }
  const inBox = (b, [x, y, z]) => x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3] && z >= b[4] && z <= b[5];
  const allowed = (h) => ALLOW.some(([s, , o]) => s === h.scene && (o.box ? inBox(o.box, h.at) : hits.filter((q) => q.scene === s).length <= o.upTo));
  const bad = hits.filter((h) => !allowed(h));
  fs.writeFileSync(path.join(OUT, 'coplanar.txt'), hits.map((h) => `${h.area.toFixed(4)} m²  ${h.scene}  at ${h.at.join(', ')}  facing ${h.n.join(', ')}  in ${h.box}${allowed(h) ? '  (allowed)' : ''}\n    ${h.a}\n    ${h.b}`).join('\n') + '\n');
  const secs = ((Date.now() - t0) / 1000).toFixed(1), n = hits.length - bad.length;
  if (errors.length) log(`  page errors:\n    ${errors.join('\n    ')}`);
  if (!bad.length) { log(`  ✓ coplanar: no surfaces sharing a plane${n ? ` (${n} allowed: test/coplanar.mjs ALLOW)` : ''} (${secs}s)`); return errors.length ? 1 : 0; }
  log(`  ✗ coplanar: ${bad.length} pair(s) of surfaces share a plane (${secs}s; all in test/out/coplanar.txt)`);
  for (const h of bad.slice(0, 12)) log(`      ${h.area.toFixed(4)} m²  ${h.scene} at ${h.at.join(', ')}\n        ${h.a}\n        ${h.b}`);
  if (bad.length > 12) log(`      …and ${bad.length - 12} more`);
  return 1;
}
