// The lie of the land on the acrobats' coast (floors/acro.js): where everything is, and the ground under it.
// Everything's laid out along one line, the axis: from the middle of the circus ring (CEN) out toward the sea (D), with
// u across it (N, positive on the far side from the frame you arrive by). The towers of acrobats stand on that line
// every SPAN metres; the first two in the ring, two on the rocks, the rest in the sea, where they're the viaduct's piers;
// the deck runs on their arches from DECK0 out to the horizon. On the far side a granite ridge climbs from beside the
// ring to a headland level with the deck (the halt, the bell), a stair cut along its crest. The tiers of seats curve
// round the ring's far right. The frame hangs at the origin (its plane z = 0), the ground flat round it.
// ground(x, z): the height of the rocks (the seats' tiers and the stair's steps included); walk(...) says where you
// can stand.

export const CEN = { x: 3, z: -14.5 }, D = { x: -0.622, z: -0.783 }, N = { x: 0.783, z: -0.622 };
export const SEA = -7, RING = 9, RIM = 0.42, RIM_H = 0.5, FLOOR_Y = 0.05;
export const SPAN = 9, S0 = -3, NPIER = 48, LEVEL = 1.45, Y_SPRING = 7.3, ARCH_R = SPAN / 2;
export const Y_DECK = 12.4, DECK0 = 24, DECK_W = 3.2, WALK = [0.5, 2.8], TRACK_U = -1.35, DECK_END = S0 + SPAN * (NPIER - 1);
export const OPEN = [33, 41];   // the gap in the deck's far parapet onto the headland
// the headland: its top level with the deck, a cliff toward the ring and along the deck, its back sloping down to the
// rocks (u0 to u1 across); the stair climbs that back slope, across s0..s1, from the bottom (u1) to the top (u0)
export const PLATEAU = { s0: 31, s1: 54, u0: 3.6, u1: 12, back: 35 }, STAIR = { s0: 45.6, s1: 47.4, u0: 11.6, u1: 33.5, rise: 0.2 };
export const SEATS = { a0: 1.2, a1: 2.8, r0: 10.6, step: 0.92, rise: 0.42, rows: 5 };   // angles in (s, u) from the axis
export const toWorld = (s, u) => ({ x: CEN.x + D.x * s + N.x * u, z: CEN.z + D.z * s + N.z * u });
export const toSU = (x, z) => { const dx = x - CEN.x, dz = z - CEN.z; return { s: dx * D.x + dz * D.z, u: dx * N.x + dz * N.z }; };
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
  const head = Math.min(60 - s, (u - 4.2) * 1.6, s - 22);                  // the headland on the far side, out along the deck
  return Math.max(main, head) + (fbm(x * 0.05, z * 0.05) - 0.5) * 9;
}
// The bare rock, before anything's cut into it or levelled for it.
function rock(x, z) {
  const { s, u } = toSU(x, z), L = inland(s, u, x, z);
  // granite: broad low domes and slabs, smoother near the ring
  const dome = (fbm(x * 0.045 + 3, z * 0.045 - 2) - 0.45) * 5 + (vn(x * 0.16, z * 0.16) - 0.5) * 0.8;
  let h = Math.max(-1.2, dome) * ss(-2, 10, L);
  h = h * ss(0, 1, L) + (SEA - 2.5) * (1 - ss(-9, 3, L)) + Math.max(0, dome) * 0.3 * ss(-9, 3, L) * (1 - ss(0, 1, L));
  // the headland: level with the deck on top, cliffs toward the ring and along the deck, its back a long slope down
  const across = ss(PLATEAU.u0 - 0.2, PLATEAU.u0 + 0.6, u) * (1 - ss(PLATEAU.u1, PLATEAU.back, u));
  const along = ss(PLATEAU.s0 - 4, PLATEAU.s0, s) * (1 - ss(PLATEAU.s1, PLATEAU.s1 + 7, s));
  const hill = Y_DECK * across * along;
  if (hill > 0.01) h = Math.max(h, hill + ((fbm(x * 0.21, z * 0.21) - 0.5) * 2.2 + (vn(x * 0.7, z * 0.7) - 0.5) * 0.5) * (1 - ss(0.97, 1, across * along)) * ss(0, 2, hill));
  return h;
}
/** The rock with the level places made in it: the ring's ground, round the frame, the headland's top, the stair. */
export function terrain(x, z) {
  const { s, u } = toSU(x, z);
  let h = rock(x, z);
  const rc = Math.hypot(x - CEN.x, z - CEN.z), rf = Math.hypot(x, z);
  h = h * ss(RING + 3, RING + 9, rc);                                       // the ring's ground, level at 0
  h = h * ss(3, 7, rf);                                                     // round the frame
  if (s > PLATEAU.s0 - 0.5 && s < PLATEAU.s1 && u > PLATEAU.u0 && u < PLATEAU.u1) {   // the headland's top, flat where you walk
    const k = ss(PLATEAU.s0 - 0.5, PLATEAU.s0 + 1, s) * ss(PLATEAU.u0, PLATEAU.u0 + 0.5, u) * (1 - ss(PLATEAU.s1 - 3, PLATEAU.s1, s)) * (1 - ss(PLATEAU.u1 - 4, PLATEAU.u1, u));
    h = h + (Y_DECK - 0.05 - h) * k;
  }
  const st = stairAt(s, u);
  if (st != null) h = Math.min(h, st - 0.06);                               // (the steps' own blocks stand on it)
  return h;
}
/** The stair's tread height at (s, u), or null off it. */
export function stairAt(s, u) {
  if (s < STAIR.s0 || s > STAIR.s1 || u < STAIR.u0 - 0.4 || u > STAIR.u1 + 0.6) return null;
  return stepY(u);
}
export const STEPS = Math.round((Y_DECK - 0.05) / STAIR.rise), RUN = (STAIR.u1 - STAIR.u0) / STEPS;
// (from the bottom, u1, a step up every RUN toward the top, u0)
export const stepY = (u) => clamp(Math.ceil((STAIR.u1 - u) / RUN), 0, STEPS) * (Y_DECK - 0.05) / STEPS;

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
  if (st != null) return Math.max(st, 0);
  const t = tierAt(s, u);
  if (t != null) return t;
  return terrain(x, z);
}
