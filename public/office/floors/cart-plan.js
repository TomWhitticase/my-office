// The grey meadow's layout (floors/cart.js): the ground, the path and where everything stands. The frame you come in by
// is at the origin, its plane z = 0, the way in toward -z (yaw 0 faces -z). Seen from B3 across the room, the painting's
// picture is the tableau ~8 m in (near enough that the window itself frames it as the picture does): the girl on the path on the left, the cart behind her on the right, bare trees, the
// hills (TABLEAU). The path is one loop the girl walks for ever, winding past the frame, the swing's tree, the old carts
// in the grove, the toy-maker's shed and back (PATH, sampled into PTS with their arc length).

// ----- noise -----
const h2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
export function vn(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h2(i, j), b = h2(i + 1, j), c = h2(i, j + 1), d = h2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, z) => vn(x, z) * 0.55 + vn(x * 2.03 + 5.2, z * 2.03 + 1.3) * 0.3 + vn(x * 4.1 + 9.7, z * 4.1 + 3.1) * 0.15;

// ----- the path: a closed loop through these, walked in this order -----
const CTRL = [
  [7.5, -25], [3.4, -19.5], [1.4, -13.5], [-0.6, -7.5], [-3.4, -2.6], [-8.8, 2.4], [-17, 3.5], [-27, -1], [-34, -12],
  [-36, -26], [-29, -39], [-17, -49], [-2, -56], [13, -55], [25, -47], [30, -36], [27, -27], [17, -23.5],
];
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}
/** the loop sampled every ~0.5 m: [x, z, s] (s its distance along) */
export const PTS = (() => {
  const raw = [], n = CTRL.length;
  for (let i = 0; i < n; i++) for (let k = 0; k < 24; k++) raw.push(catmull(CTRL[(i - 1 + n) % n], CTRL[i], CTRL[(i + 1) % n], CTRL[(i + 2) % n], k / 24));
  const out = [];
  let s = 0;
  for (let i = 0; i < raw.length; i++) { if (i) s += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]); out.push([raw[i][0], raw[i][1], s]); }
  return out;
})();
export const LOOP = PTS[PTS.length - 1][2] + Math.hypot(PTS[0][0] - PTS[PTS.length - 1][0], PTS[0][1] - PTS[PTS.length - 1][1]);
/** where the path is s along it (wrapping), into o: { x, z, dx, dz } */
export function along(s, o) {
  s = ((s % LOOP) + LOOP) % LOOP;
  let lo = 0, hi = PTS.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PTS[m][2] <= s) lo = m; else hi = m; }
  const a = PTS[lo], b = s >= PTS[PTS.length - 1][2] ? PTS[0] : PTS[lo + 1], sb = s >= PTS[PTS.length - 1][2] ? LOOP : b[2];
  const t = (s - a[2]) / Math.max(1e-6, sb - a[2]), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  o.x = a[0] + dx * t; o.z = a[1] + dz * t; o.dx = dx / l; o.dz = dz / l;
  return o;
}
/** the nearest point of the path to (x, z): { d, s } */
export function nearest(x, z, o = { d: 0, s: 0 }) {
  let best = Infinity, bs = 0;
  for (let i = 0; i < PTS.length; i++) {
    const a = PTS[i], b = PTS[(i + 1) % PTS.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), px = a[0] + dx * t - x, pz = a[1] + dz * t - z, d2 = px * px + pz * pz;
    if (d2 < best) { best = d2; bs = a[2] + t * Math.sqrt(l2); }
  }
  o.d = Math.sqrt(best); o.s = bs % LOOP;
  return o;
}
// a coarse grid of distance to the path, for the ground's colour and height (and anything placed off it)
const PG = { x0: -80, z0: -100, n: 180, k: 1 };   // 1 m cells
const pathD = (() => {
  const a = new Float32Array(PG.n * PG.n).fill(99);
  for (let i = 0; i < PTS.length; i++) {
    const [x, z] = PTS[i], ci = Math.round(x - PG.x0), cj = Math.round(z - PG.z0);
    for (let dj = -8; dj <= 8; dj++) for (let di = -8; di <= 8; di++) {
      const gi = ci + di, gj = cj + dj; if (gi < 0 || gj < 0 || gi >= PG.n || gj >= PG.n) continue;
      const d = Math.hypot(PG.x0 + gi - x, PG.z0 + gj - z), k = gj * PG.n + gi; if (d < a[k]) a[k] = d;
    }
  }
  return a;
})();
/** about how far (x, z) is from the path (to ~0.3 m; 99 well off it) */
export function pathDist(x, z) {
  const fx = x - PG.x0, fz = z - PG.z0, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= PG.n - 1 || j >= PG.n - 1) return 99;
  const u = fx - i, v = fz - j, n = PG.n;
  return (pathD[j * n + i] * (1 - u) + pathD[j * n + i + 1] * u) * (1 - v) + (pathD[(j + 1) * n + i] * (1 - u) + pathD[(j + 1) * n + i + 1] * u) * v;
}
export const PATH_W = 1.1;   // the path's half-width, worn bare

// ----- the ground: long low swells, two hollows where the mist lies, the path a little sunk; the hills far off -----
export const HOLLOWS = [[-22, -24, 13], [20, -70, 16], [-45, 18, 12]];
export const SHED = { x: 34, z: -44, yaw: -Math.PI / 2 };   // the toy-maker's shed, its door (local +z) toward the path (-x)
export function terrain(x, z) {
  // level round the shed, at its own height
  const ds = Math.hypot(x - SHED.x, z - SHED.z);
  if (ds < 7) { const w = Math.min(1, Math.max(0, (7 - ds) / 3)), k = w * w * (3 - 2 * w); return rough(x, z) * (1 - k) + rough(SHED.x, SHED.z) * k; }
  return rough(x, z);
}
function rough(x, z) {
  let h = (fbm(x * 0.018 + 3, z * 0.018 + 7) - 0.5) * 5.2 + (fbm(x * 0.06, z * 0.06) - 0.5) * 0.9;
  for (const [hx, hz, r] of HOLLOWS) { const d = Math.hypot(x - hx, z - hz) / r; h -= 1.6 * Math.exp(-d * d * 1.6); }
  // flatter round the frame, so it hangs at a sensible height over the ground
  const f = Math.hypot(x, z);
  h *= 0.35 + 0.65 * Math.min(1, f / 12);
  // far out, the land rises toward the haze
  const r = Math.hypot(x, z + 20);
  h += Math.min(18, Math.max(0, r - 95) ** 1.3 * 0.03);
  return h;
}
const BASE = terrain(0, -1.2);   // (the frame's sill stands on the ground's height here)
/** the ground's height, the path worn a few centimetres into it, level with the frame's foot */
export function ground(x, z) {
  const d = pathDist(x, z);
  return terrain(x, z) - BASE - 0.06 * Math.max(0, 1 - d / PATH_W);
}

// ----- where things are -----
export const TABLEAU = { girl: 0 };   // (set below: the girl's s along the path; the cart trails her on its string)
{
  // the girl stands where the path is nearest (-0.6, -7.5), the cart trailing behind her
  const n = nearest(-0.6, -7.5); TABLEAU.girl = n.s;
}
export const SWING = { x: -38.6, z: -18, yaw: Math.PI };   // the dead tree, its bough out away from the path (local +x), the swing along it
// the carts left in the grove: x, z, turn (from facing the path), tipped (roll), hood colour, face variant, a wheel gone
export const OLD = [
  { x: -22, z: -56, turn: 0.35, roll: 0, hood: '#8a5a3c', face: 1, lost: false },
  { x: -10.5, z: -62, turn: -0.5, roll: 1.2, hood: '#5e6b78', face: 2, lost: true },
  { x: 2, z: -66, turn: 0.2, roll: 0, hood: '#7a3a30', face: 3, lost: false },
  { x: -29, z: -47, turn: 0.6, roll: -1.1, hood: '#6f7552', face: 2, lost: false },
  { x: 14.5, z: -64.5, turn: -0.3, roll: 0.25, hood: '#9a8a6a', face: 1, lost: true },
];
// each faces the path (its nearest point), turned a little from it
for (const o of OLD) { const n = nearest(o.x, o.z); const p = along(n.s, { x: 0, z: 0, dx: 0, dz: 0 }); o.yaw = Math.atan2(p.x - o.x, p.z - o.z) + o.turn; }
export const PRAM = { x: -20.5, z: -21.5, yaw: 0.7 };      // half sunk in the mist's hollow
export const WALL = [[-60, -6], [-50, 6], [-41, 14], [-30, 22]];   // a tumbledown wall along the meadow's edge
export const CEN = { x: 0, z: -28 };   // the middle of things: the ground's and the hills' centre
export const MAP = { x0: -90, z0: -110, w: 180, n: 256 };   // the ground's map (cart-land.js): its corner, size (m) and texels
export const RADIUS = 105;   // past this the haze thickens and you can't get on (cart.js bound)
