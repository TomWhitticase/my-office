// The lie of the land on the acrobats' coast (floors/acro.js): where everything is, and the ground under it.
// Everything's laid out along one line, the axis: from the middle of the circus ring (CEN) out toward the sea (D), with
// u across it (N, positive on the far side from the frame you arrive by). The towers of acrobats stand on that line
// every SPAN metres; the first two in the ring, two on the rocks, the rest in the sea, where they're the viaduct's piers;
// the deck runs on their arches from DECK0 out to the horizon. On its far side a stone stair climbs beside it from the
// rocks past the ring to a landing level with the deck (the halt, the bell). The tiers of seats curve round the ring's
// far right as you come in. The frame hangs at the origin (its plane z = 0), the ground flat round it.
// ground(x, z): the height of the rocks (the seats' tiers, the stair's steps and its landing included).

export const CEN = { x: 3, z: -14.5 }, D = { x: -0.622, z: -0.783 }, N = { x: 0.783, z: -0.622 };
export const SEA = -7, RING = 9, RIM = 0.42, RIM_H = 0.5, FLOOR_Y = 0.05;
export const SPAN = 9, S0 = -3, NPIER = 48, LEVEL = 1.45, Y_SPRING = 7.3, ARCH_R = SPAN / 2;
export const Y_DECK = 12.4, DECK0 = 42, DECK_W = 3.2, WALK = [0.5, 2.8], TRACK_U = -1.35, DECK_END = S0 + SPAN * (NPIER - 1);
export const OPEN = [76.2, 81.2];   // the gap in the deck's far parapet onto the landing
// the stair: a flight of stone steps on open piers on the viaduct's far side, climbing toward it from the rocks (u1)
// up to a landing level with the deck (the halt), s0..s1 across; the landing, open onto the deck's walk through OPEN
export const STAIR = { s0: 77.9, s1: 79.5, u0: 8.0, u1: 25.5, rise: 0.2 }, LANDING = { s0: 75.6, s1: 81.8, u0: 3.2, u1: 8.0 };
export const SEATS = { a0: 0.34, a1: 1.5, r0: 10.6, step: 0.92, rise: 0.42, rows: 5 };   // angles in (s, u) from the axis
// the painting's own view (acro.js comp): where in the ring it's seen from, which way (an angle in (s, u)), how far up
export const COMP = { s: -7.6, u: -3.9, y: 1.3, a: 0.36, pitch: 0.24, fov: 64 };
// The line runs straight from the ring out over the rocks, then bends toward the near side (left, looking out) in a
// wide arc over the sea, BEND_R round a centre on that side: so from the ring the viaduct sweeps away across the view.
export const S_BEND = 18, BEND_R = 260;
const ARC = { x: CEN.x + D.x * S_BEND - N.x * BEND_R, z: CEN.z + D.z * S_BEND - N.z * BEND_R };
/** The line's own frame at s: where it is (u = 0), which way it runs (dx, dz) and which way is across it (nx, nz). */
export function frameAt(s, o = {}) {
  if (s <= S_BEND) return Object.assign(o, { x: CEN.x + D.x * s, z: CEN.z + D.z * s, dx: D.x, dz: D.z, nx: N.x, nz: N.z });
  const a = (s - S_BEND) / BEND_R, c = Math.cos(a), sn = Math.sin(a), nx = N.x * c + D.x * sn, nz = N.z * c + D.z * sn;
  return Object.assign(o, { x: ARC.x + nx * BEND_R, z: ARC.z + nz * BEND_R, dx: D.x * c - N.x * sn, dz: D.z * c - N.z * sn, nx, nz });
}
const fa = {};
export const toWorld = (s, u) => { frameAt(s, fa); return { x: fa.x + fa.nx * u, z: fa.z + fa.nz * u }; };
export const toSU = (x, z) => {
  const dx = x - CEN.x, dz = z - CEN.z, s = dx * D.x + dz * D.z;
  if (s <= S_BEND) return { s, u: dx * N.x + dz * N.z };
  const vx = x - ARC.x, vz = z - ARC.z, a = Math.atan2(vx * D.x + vz * D.z, vx * N.x + vz * N.z);
  return { s: S_BEND + a * BEND_R, u: Math.hypot(vx, vz) - BEND_R };
};
/** The heading (yaw, three's: atan2(x, z)) of a thing facing the line's near side at s (its +z toward -u). */
export const yawAt = (s) => { frameAt(s, fa); return Math.atan2(-fa.nx, -fa.nz); };
export const pierS = (k) => S0 + k * SPAN;

// value noise (deterministic)
function hh(i, j) { let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function vn(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hh(i, j), b = hh(i + 1, j), c = hh(i, j + 1), d = hh(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export const fbm = (x, y) => vn(x, y) * 0.55 + vn(x * 2.1 + 5.3, y * 2.1 + 1.7) * 0.28 + vn(x * 4.3 + 9.1, y * 4.3 + 3.3) * 0.17;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** How far in from the sea's edge (s, u) is, metres-ish (negative: out at sea). */
export function inland(s, u, x, z) {
  const main = 15 - s + (u < -6 ? Math.min(6, (-6 - u) * 0.35) : 0);       // the promontory the ring's on, reaching a little further on the near side
  const head = Math.min(88 - s, (u - 4.2) * 1.6, (u - 11) * 0.7 + (60 - s) * 0.4 + 6);   // the rocks on the far side, out past the stair
  return Math.max(main, head) + (fbm(x * 0.05, z * 0.05) - 0.5) * 9;
}
// The bare rock, before anything's cut into it or levelled for it.
function rock(x, z) {
  const { s, u } = toSU(x, z), L = inland(s, u, x, z);
  // granite: broad low domes and slabs, smoother near the ring
  const dome = (fbm(x * 0.045 + 3, z * 0.045 - 2) - 0.45) * 5 + (vn(x * 0.16, z * 0.16) - 0.5) * 0.8;
  let h = Math.max(-1.2, dome) * ss(-2, 10, L);
  h = h * ss(0, 1, L) + (SEA - 2.5) * (1 - ss(-9, 3, L)) + Math.max(0, dome) * 0.3 * ss(-9, 3, L) * (1 - ss(0, 1, L));
  return h;
}
/** The rock with the level places made in it: the ring's ground, round the frame. */
export function terrain(x, z) {
  const { s, u } = toSU(x, z);
  let h = rock(x, z);
  const rc = Math.hypot(x - CEN.x, z - CEN.z), rf = Math.hypot(x, z);
  h = h * ss(RING + 3, RING + 9, rc);                                       // the ring's ground, level at 0
  h = h * ss(3, 7, rf);                                                     // round the frame
  return h;
}
/** The stair's tread height at (s, u), or null off it; the landing's, at the top. */
export function stairAt(s, u) {
  if (s >= LANDING.s0 && s <= LANDING.s1 && u >= LANDING.u0 && u <= LANDING.u1) return Y_DECK - 0.02;
  if (s < STAIR.s0 || s > STAIR.s1 || u < STAIR.u0 || u > STAIR.u1 + 0.3) return null;
  return stepY(u);
}
export const STEPS = Math.round((Y_DECK - 0.02) / STAIR.rise), RUN = (STAIR.u1 - STAIR.u0) / STEPS;
// (a step up every RUN from the bottom, u1, to the landing, u0)
export const stepY = (u) => clamp(Math.ceil((STAIR.u1 - u) / RUN), 0, STEPS) * (Y_DECK - 0.02) / STEPS;

/** The seats' tier height at (s, u) (from the ring's middle, angle a in (s, u)), or null off them. */
export function tierAt(s, u) {
  const r = Math.hypot(s, u), a = Math.atan2(u, s);
  if (a < SEATS.a0 || a > SEATS.a1 || r < SEATS.r0 - 0.2) return null;
  const k = Math.floor((r - SEATS.r0 + 0.2) / SEATS.step);
  if (k >= SEATS.rows) return null;
  return (k + 1) * SEATS.rise;
}

/** Where you stand at (x, z): `deck` true if you're up on the viaduct. */
export function ground(x, z, deck = false) {
  const { s, u } = toSU(x, z);
  if (deck && s >= DECK0 && Math.abs(u) <= DECK_W) return Y_DECK;
  const st = stairAt(s, u);
  if (st != null) return Math.max(st, terrain(x, z));
  const t = tierAt(s, u);
  if (t != null) return t;
  return terrain(x, z);
}
