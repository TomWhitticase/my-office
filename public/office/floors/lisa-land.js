// The lay of her world's land (floors/lisa-world.js), with no three.js in it, so the worker (lisa-paint-worker.js) can
// build the terrain's mesh off the main thread: the hill the loggia's built into, falling to the river; the river's bed;
// the two roads' cuttings; the bridge; the country beyond with its lakes, and the mountains round it all. groundAt() is
// what's underfoot (the loggia's floor, its stairs, the bridge, the land). landMesh() the terrain: rings round the valley,
// fine near and coarse far, its colours and normals.

export const WL = -24;   // the water's level
export function h2(a, b) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export const fbm = (x, y, o = 4) => { let v = 0, a = 0.5, s = 1; for (let i = 0; i < o; i++) { v += a * vn(x * s + i * 31.7, y * s - i * 17.3); s *= 2.02; a *= 0.5; } return v / (1 - 0.5 ** o); };
const ridged = (x, y, o = 5) => { let v = 0, a = 0.5, s = 1; for (let i = 0; i < o; i++) { v += a * (1 - Math.abs(vn(x * s + i * 13.1, y * s + i * 7.7) * 2 - 1)) ** 2; s *= 2.1; a *= 0.5; } return v / (1 - 0.5 ** o); };
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// distance from (x, z) to a polyline, and how far along it (m)
export function along(P, x, z) {
  let best = Infinity, at = 0, run = 0, bi = 0, bt = 0;
  for (let i = 1; i < P.length; i++) {
    const [ax, az] = P[i - 1], [bx, bz] = P[i], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; at = run + t * L; bi = i; bt = t; }
    run += L;
  }
  return [best, at, bi, bt];
}
// the river (east to west across the valley, then off toward the lake), and the two roads off the stairs
export const RIVER = [[220, -60], [120, -82], [70, -88], [45, -89], [10, -92], [-30, -104], [-80, -122], [-170, -150], [-320, -230], [-700, -520]];
export const ROADS = [
  [[7.85, -13.4], [11, -22], [8, -34], [16, -48], [30, -62], [45, -74], [45, -79.6], [45, -98.4], [46, -110], [54, -128], [48, -150], [26, -176], [10, -210]],
  [[-7.85, -13.4], [-13, -25], [-6, -38], [-20, -54], [-44, -60], [-68, -72], [-104, -80], [-150, -78], [-210, -86], [-280, -80]],
];
export const BRIDGE = { x: 45, z0: -98.4, z1: -79.6, w: 3.4, deck: -16.2 };
// the stairs down the outside: off each side doorway's landing, toward -z, from 0 down to STAIR.y1
export const STAIR = { x0: 6.9, x1: 8.8, z0: -1.3, z1: -13.4, y1: -6 };
export const LOGGIA = { x: 6.4, zf: -3.9, zb: 3.2, wall: 0.4, h: 5.2 };

// the land's height: the hill the loggia's built into, falling away to the river; the river's bed; the roads' cuttings;
// the country beyond, and the mountains round it all
function base(x, z) {
  const r = Math.hypot(x, z + 60);
  // near: down from under the loggia toward the river, the hill rising steeply behind
  let h = -6 - 0.15 * Math.max(0, -z - 14) - 1.6 * sstep(-4.5, -12, z) * sstep(9, 6, Math.abs(x)) + 1.6 * sstep(-14, -4, z);
  h += z > 3 ? (z - 3) * 0.9 + 6 * fbm(x / 30, z / 30, 3) : 0;
  h = Math.min(h, -6 + Math.max(0, z + 13.4) * 0.6 + 12 * sstep(4, 20, z));   // (never above the stair's foot round it)
  // the valley: lower toward the river, rising beyond it toward the far hills
  const [dr] = along(RIVER, x, z);
  h += 3.2 * (fbm(x / 60, z / 60, 4) - 0.5) + 1.2 * (fbm(x / 14, z / 14, 3) - 0.5) + 4 * ridged(x / 45, z / 45, 3) ** 3 * sstep(30, 60, Math.hypot(x, z));
  h = Math.min(h, -18.5 - 5 + 5 * sstep(4, 26, dr) + 0.2 * Math.max(0, dr - 26));
  if (z < -95) h = Math.max(h, -26) + Math.min(14, 0.08 * Math.max(0, dr - 30));
  // the country beyond: rolling, with basins that fill as lakes; then the spires, far off, jagged
  const far = sstep(300, 900, r);
  if (far > 0) {
    const roll = 60 * (fbm(x / 500, z / 500, 4) - 0.55) + WL + 6;
    const spire = 260 * ridged(x / 500 + 3.1, z / 500 - 1.7, 5) ** 2 * sstep(900, 2400, r);
    h = h + (roll + spire - h) * far;
  }
  return h;
}
export function terrain(x, z) {
  let h = base(x, z);
  // the roads: a level cutting, a little below the land round it
  for (const R of ROADS) {
    const [d] = along(R, x, z);
    if (d < 7) h = h + ((Math.min(h, roadY(R, x, z)) - 0.15) - h) * sstep(7, 1.6, d);
  }
  return h;
}
const roadAt = new Map();
function roadY(R, x, z) {   // a road's height there: the land under its middle, smoothed along it
  const [, s] = along(R, x, z), k = Math.round(s / 4);
  const key = R === ROADS[0] ? k : -k - 1;
  if (!roadAt.has(key)) {
    let acc = 0, n = 0;
    for (let q = -2; q <= 2; q++) { const p = pointAt(R, Math.max(0, (k + q) * 4)); acc += base(p[0], p[1]); n++; }
    roadAt.set(key, acc / n);
  }
  return roadAt.get(key);
}
function pointAt(R, s) {
  for (let i = 1; i < R.length; i++) {
    const [ax, az] = R[i - 1], [bx, bz] = R[i], L = Math.hypot(bx - ax, bz - az);
    if (s <= L) return [ax + (bx - ax) * s / L, az + (bz - az) * s / L];
    s -= L;
  }
  return R[R.length - 1];
}

/** The floor's height under (x, z): the loggia's floor, its stairs, the bridge, the land. */
export function groundAt(x, z) {
  const ax = Math.abs(x);
  if (ax <= LOGGIA.x + LOGGIA.wall && z >= -4.4 && z <= 3.6) return 0;
  if (ax >= STAIR.x0 - 0.05 && ax <= STAIR.x1 + 0.3 && z <= 0.9 && z >= STAIR.z1) return z >= STAIR.z0 ? 0 : STAIR.y1 * (STAIR.z0 - z) / (STAIR.z0 - STAIR.z1);
  if (Math.abs(x - BRIDGE.x) <= BRIDGE.w / 2 + 0.2 && z >= BRIDGE.z0 && z <= BRIDGE.z1) return BRIDGE.deck + 0.9 * Math.sin(Math.PI * (z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0));
  return terrain(x, z);
}


const lerp3 = (o, c, t) => { o[0] += (c[0] - o[0]) * t; o[1] += (c[1] - o[1]) * t; o[2] += (c[2] - o[2]) * t; };
const hexc = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255].map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
/** The terrain: { pos, col, nrm, idx } (colours linear): rings round (CX, CZ), fine near the middle and coarse far. */
export function landMesh(NR = 150, NA = 360) {
  const CX = 0, CZ = -62;
  const radii = []; for (let i = 0; i < NR; i++) { const t = i / (NR - 1); radii.push(t < 0.45 ? t / 0.45 * 150 : 150 * Math.pow(4200 / 150, (t - 0.45) / 0.55)); }
  const pos = new Float32Array(NR * NA * 3), col = new Float32Array(NR * NA * 3), nrm = new Float32Array(NR * NA * 3), idx = new Uint32Array((NR - 1) * NA * 6);
  const grass = hexc('#6d6d3c'), earth = hexc('#7a5a34'), rock = hexc('#77745e'), road = hexc('#9b6639'), far = hexc('#6e8478'), shore = hexc('#8b8460'), c = [0, 0, 0];
  for (let i = 0; i < NR; i++) for (let a = 0; a < NA; a++) {
    const th = a / NA * Math.PI * 2 + (i % 2) * Math.PI / NA, r = radii[i], x = CX + Math.cos(th) * r, z = CZ + Math.sin(th) * r;
    const h = terrain(x, z), k = (i * NA + a) * 3, e = Math.max(1, r * 0.01);
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    const dx = (terrain(x + e, z) - terrain(x - e, z)) / (2 * e), dz = (terrain(x, z + e) - terrain(x, z - e)) / (2 * e), n = Math.hypot(dx, 1, dz);
    nrm[k] = -dx / n; nrm[k + 1] = 1 / n; nrm[k + 2] = -dz / n;
    // grass and olive scrub on the gentle ground, earth and rock on the steep, the red roads, paler by the water; far off,
    // the blue-green the haze makes of it all
    const sl = Math.hypot(dx, dz);
    c[0] = grass[0]; c[1] = grass[1]; c[2] = grass[2];
    lerp3(c, earth, sstep(0.25, 0.6, sl) * 0.8); lerp3(c, rock, sstep(0.5, 1.2, sl));
    lerp3(c, earth, sstep(0.45, 0.7, fbm(x / 40 + 9, z / 40, 3)) * 0.7);
    const b = 0.8 + 0.4 * fbm(x / 9, z / 9, 3); c[0] *= b; c[1] *= b; c[2] *= b;
    let rd = Infinity; if (r < 260) for (const R2 of ROADS) rd = Math.min(rd, along(R2, x, z)[0]);
    lerp3(c, road, sstep(2.4, 1.2, rd)); lerp3(c, shore, sstep(WL + 3, WL + 0.5, h) * 0.7); lerp3(c, far, sstep(400, 1600, r));
    col[k] = c[0]; col[k + 1] = c[1]; col[k + 2] = c[2];
  }
  let q = 0;
  for (let i = 0; i < NR - 1; i++) for (let a = 0; a < NA; a++) {
    const a1 = (a + 1) % NA, p0 = i * NA + a, p1 = i * NA + a1, p2 = (i + 1) * NA + a, p3 = (i + 1) * NA + a1;
    idx[q++] = p0; idx[q++] = p1; idx[q++] = p2; idx[q++] = p1; idx[q++] = p3; idx[q++] = p2;   // (facing up)
  }
  return { pos, col, nrm, idx };
}
