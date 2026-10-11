// BEHIND THE SKY (floors/world-edge.js): the back of a set. The door in the sky opens off the end of a bare concrete
// service corridor (strip lights, some dead, one flickering; cable trays, pipes and conduit along the walls; extinguishers,
// stencils, puddles, fire doors, a cupboard, a WC that's engaged, an edit suite in session, a plant room), and the corridor
// runs along the back of the gallery: through a sound lock (two sets of doors, ON AIR over them) and you're on its rear
// walkway, looking down over the empty operators' chairs on their tiers, the director's console at the top (its dials,
// switches and faders run the world: the time, the weather, the office's lights and blinds, world-edge-console.js), a live
// model of the whole world glowing on a table in the pit (world-edge-model.js) and the monitor wall beyond, showing it all
// live (world-edge-gallery.js). Stairs down the tiers' sides. Off the corridor, a cramped flat where two people sit
// watching it on TV (world-edge-flat.js). The corridor's other way is long (two turns, 56 m) and ends at a plain fire door
// marked EXIT just short of the plant room, which opens onto the restricted level (B3, restricted.js): the far wall of a
// dead end deep in its rooms, a long walk from its lift, always the same place (found from B3's fixed layout, findExit), a
// plain steel door with a handle from that side, easy to miss. It's there from the start: its own scene, a floor of its own
// (unlisted, carless), built the first time you come near that door on B3 (or are let out past the city's edge, whichever's
// first). The sky side (world-edge.js: the dome, the pier) is built only once it's needed: open the door in the sky from in
// here having come in from B3, and the helicopter's out on the pier waiting for you, as if you'd flown it there.
// Both those doors are seamless (systems/portal.js): open, each shows the other side live, with its own light, and you walk
// through without a cut. They're just two more doors here, each off a corridor's side by a turn. This side is laid out in
// B3's own space, so the exit door is the same place on both sides: B3's wall, at the doorway, is this side's too. It's a
// door both ways: open or shut it from either side, come and go. The helicopter waits on the pier while you're in here or
// on B3; leave B3 by its lift (or any way but this door) and it's put away on its pad, and it's on the pier again whenever
// you open the sky door from in here.
// Debug: ctx.heli.edge.backstage: .go(x, z, yaw, pitch) stands you in here (this side's own coordinates, PLAN: the monitor
// wall toward -z, the corridors behind the gallery toward +z, the exit at PLAN.EXIT; yaw 0 faces -z), .exit(open),
// .b3(x, z, yaw, pitch) stands you on B3 relative to the exit (+z out into the dead end); .doors (by name: .open(on));
// .gallery/.flat/.model/.desk.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, FONT, makeCanvas, mergedBoxes, rng, sstep } from '../util.js';
import { makePortal } from '../systems/portal.js';
import { installGallery } from './world-edge-gallery.js';
import { installFlat } from './world-edge-flat.js';
import { installModel } from './world-edge-model.js';
import { installConsole } from './world-edge-console.js';

// The plan, in this side's own space: the walkway's and the corridors' floors at y = 0, the gallery stepping down from it.
export const PLAN = {
  T: 0.2,
  GAL: { x0: -7.5, x1: 7.5, z0: -17, z1: -0.4, h: 3.6 },   // the gallery: the monitor wall along z0, the doors in from the back (z1)
  PIT: -1.6,                                                // the pit's floor, in front of the tiers
  TIERS: [[-8.6, -1.2], [-6.6, -0.8], [-4.6, -0.4]],        // each tier's front edge (z) and floor, front to back
  REAR: -1.8,                                               // the top tier's back: a low partition, the walkway behind it (at 0)
  AISLE: 5.9,                                               // the tiers are between ±AISLE; outside, stairs down either side
  STEPS: [-2.2, -3.4, -4.6, -5.6, -6.6, -7.6, -8.6, -9.4], // the stairs' nosings (z), 0.2 m down each
  LOCK: { x0: -5.9, x1: -3.3, z0: -0.2, z1: 2.0, h: 2.6, w: 1.6 },   // the sound lock, at the back's west corner: a vestibule, double doors each end
  COR: { w: 1.8, h: 2.6 },                                  // the corridors: 1.8 m wide, their middle line:
  ROUTE: [[-18.4, 8.0], [-18.4, 3.1], [24, 3.1], [24, 20], [40.9, 20]],   // from the stub by the sky door, along the back, round to the exit
  SKYAT: { x: -19.3, z: 6.4 },                              // the door in the sky: its sill's middle, in the stub's west wall
  FLAT: { x0: -14.9, x1: -7.9, z0: -2.8, z1: 2.0, h: 2.45, door: -11.1 },   // the flat, its door on the corridor
  EXIT: { w: 1.0, h: 2.1, x: 38.8, z: 21.1 },               // the fire door onto B3, in the last leg's side, just short of its end
  TC: { x: 0, z: -11.6, y: -1.6 },                          // the model table's middle, on the pit's floor
  DIR: { x: 0, z: -3.9, y: -0.4 },                             // the director's console, at the top tier's middle
  VENT: { x: 33.6, z: 19.0, w: 0.64, h: 0.7 },              // a duct's grille low in the last leg's wall (world/secret-duct.js dresses it)
};
// How high the floor is at (x, z) (this side's own space): the tiers, the stairs, the pit; 0 everywhere else.
export function floorAt(x, z) {
  const { GAL, TIERS, AISLE, STEPS, PIT, REAR } = PLAN;
  if (z >= REAR || z < GAL.z0 || Math.abs(x) > GAL.x1) return 0;
  if (Math.abs(x) < AISLE) { for (let k = TIERS.length - 1; k >= 0; k--) if (z >= TIERS[k][0]) return TIERS[k][1]; return PIT; }
  let y = 0;
  for (const s of STEPS) if (z < s) y -= 0.2;
  return Math.max(PIT, y);
}

// ----- where the exit is on B3: deep in, easy to miss, and always the same place -----
// B3's layout is fixed by place (restricted.js h3), so walk it once from the lift (cells joined by anything but a solid
// wall) and take the first dead end (one way in) at least 22 cells' walk away (70 m or so), with nothing else on its
// walls; the door goes in its far wall, facing back the way you'd come. This side is laid out about that doorway,
// turned to face the same way (its +z, out onto B3, is into the dead end). [XD, ZF]: the doorway's middle on the wall's
// face (B3's own space, the car at z = 0); YAW, which way is out of it. Cheap, and worked out once.
let exitAt = null;
export function findExit(restr) {
  if (exitAt) return exitAt;
  const G = restr.grid, key = (i, j) => `${i},${j}`;
  const ways = (i, j) => [[i - 1, j, G.edgeType('v', i, j), 'w'], [i + 1, j, G.edgeType('v', i + 1, j), 'e'], [i, j - 1, G.edgeType('h', i, j), 's'], [i, j + 1, G.edgeType('h', i, j + 1), 'n']];
  let spot = null;
  const dist = new Map([[key(-1, 0), 0]]), q = [[-1, 0]];
  for (let h = 0; h < q.length && !spot; h++) {
    const [i, j] = q[h], d = dist.get(key(i, j)), open = ways(i, j).filter(([, , t]) => t !== G.SOLID);
    if (d >= 22 && open.length === 1 && G.h3(i, j, 10) >= 0.03) {
      const far = { w: 'e', e: 'w', s: 'n', n: 's' }[open[0][3]];
      if (ways(i, j).find((w) => w[3] === far)[2] === G.SOLID) spot = { i, j, side: far, d };
    }
    for (const [ni, nj, t] of open) if (G.cellOk(ni, nj) && !dist.has(key(ni, nj))) { dist.set(key(ni, nj), d + 1); q.push([ni, nj]); }
  }
  spot ||= { i: -4, j: 0, side: 's', d: 3 };   // (never: the layout always has one)
  const cx0 = G.X(spot.i) + G.C / 2, cz0 = G.Z(spot.j) + G.C / 2, H2 = G.C / 2 - G.T / 2;
  const [XD, ZF, YAW] = { s: [cx0, cz0 - H2, 0], n: [cx0, cz0 + H2, Math.PI], w: [cx0 - H2, cz0, Math.PI / 2], e: [cx0 + H2, cz0, -Math.PI / 2] }[spot.side];
  return (exitAt = { spot, XD, ZF, YAW });
}

/** @param {any} ctx @param {any} edge */
export function installBackstage(ctx, edge) {
  const { scene: office, camera, renderer, heli, roof, mine } = ctx;
  const restr = ctx.restr, { T, GAL, PIT, TIERS, REAR, AISLE, STEPS, LOCK, COR, ROUTE, SKYAT, FLAT, EXIT } = PLAN, E = edge.E, sound = edge.sound;
  const S = new THREE.Scene(), root = new THREE.Group();
  S.background = new THREE.Color('#010101');
  S.environment = office.environment;
  S.add(root);
  const bs = { n: -9, label: 'BACKSTAGE', title: 'Backstage', unlisted: true, carless: true, liftGone: true, on: false, composer: null, scene: S, root,
    colliders: [], more: [], hits: [], sound: { kind: 'backstage' }, hemi: new THREE.HemisphereLight('#c9d2e0', '#2a2622', 0.05),
    look: { exposure: 1.0, hemi: 0.05, sky: new THREE.Color('#c9d2e0'), ground: new THREE.Color('#2a2622'), env: 0.05, bloom: 1.1, grade: 1.1, lights: [], aoSkip1: true } };
  S.add(bs.hemi); S.environmentIntensity = bs.look.env;
  ctx.addFloor(bs);

  // ----- this side, laid out about the exit's doorway on B3 (findExit) -----
  const G = restr.grid, { spot, XD, ZF, YAW } = findExit(restr), Q = EXIT;
  const cy = Math.cos(YAW), sy = Math.sin(YAW);
  let z0 = 0;
  // this side's own space to B3's (z0: the car's; 0 for B3's root, which is already moved by it), the exit (Q) to the
  // doorway; a box's bounds likewise. atDoor: from the exit's own space (its sill's middle, +z out) to this side's.
  const toB3 = (x, z, zz = z0) => { x -= Q.x; z -= Q.z; return [XD + x * cy + z * sy, ZF + zz - x * sy + z * cy]; };
  const atDoor = (b) => ({ minX: b.minX + Q.x, maxX: b.maxX + Q.x, minZ: b.minZ + Q.z, maxZ: b.maxZ + Q.z });
  const boxB3 = (b, zz = z0) => {
    const [ax, az] = toB3(b.minX, b.minZ, zz), [bx, bz] = toB3(b.maxX, b.maxZ, zz);
    return { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
  };
  const place = (z) => { z0 = z; root.position.set(XD - (Q.x * cy + Q.z * sy), 0, ZF + z - (-Q.x * sy + Q.z * cy)); root.rotation.y = YAW; root.updateMatrixWorld(true); frames(); };
  // B3's space to this side's own (the inverse of toB3)
  const fromB3 = (x, z) => { const dx = x - XD, dz = z - ZF - z0; return [dx * cy - dz * sy + Q.x, dx * sy + dz * cy + Q.z]; };

  // ----- the rooms: concrete and paint, boxes merged by material -----
  const lists = { conc: [], dark: [], flat: [], floorC: [], floorG: [], floorF: [], ceil: [], trim: [], led: [] };
  const cols = [];   // this side's own space
  // A wall from (x0, z0) to (x1, z1) (an axis-aligned box), y0..y1; solid to walk into if it starts at or under the floor.
  const wallBox = (list, x0, x1, za, zb, y0, y1, c) => {
    list.push([x1 - x0, y1 - y0, zb - za, (x0 + x1) / 2, (y0 + y1) / 2, (za + zb) / 2, c]);
    if (y0 <= 0.01) cols.push({ minX: x0, maxX: x1, minZ: za, maxZ: zb });
  };
  // A wall with holes [a0, a1, top] along it (z for a wall along z, ns; x for one along x), from y0 up to h.
  function wallWith(list, ns, fixed, a0, a1, h, holes, c, y0 = 0) {
    let at = a0;
    const piece = (b0, b1, ya, yb) => (ns ? wallBox(list, fixed - T / 2, fixed + T / 2, b0, b1, ya, yb, c) : wallBox(list, b0, b1, fixed - T / 2, fixed + T / 2, ya, yb, c));
    for (const [b0, b1, top] of [...holes].sort((p, q) => p[0] - q[0])) {
      if (b0 > at) piece(at, b0, y0, h);
      if (top < h) piece(b0, b1, top, h);
      at = b1;
    }
    if (a1 > at) piece(at, a1, y0, h);
  }
  const SKY = edge.DOOR;   // the door in the sky: its opening (0.92 x 2.07)

  // ----- the gallery: the monitor wall at the front, the tiers, a window over the set in the east wall -----
  const WIN = { z0: -14, z1: -6, y0: 0.9, y1: 2.5 };
  wallBox(lists.dark, GAL.x0 - T, GAL.x1 + T, GAL.z0 - T, GAL.z0, PIT, GAL.h, '#2b2c2f');
  wallBox(lists.dark, GAL.x0 - T, GAL.x0, GAL.z0, GAL.z1, PIT, GAL.h, '#2b2c2f');
  wallBox(lists.dark, GAL.x1, GAL.x1 + T, GAL.z0, WIN.z0, PIT, GAL.h, '#2b2c2f');
  wallBox(lists.dark, GAL.x1, GAL.x1 + T, WIN.z1, GAL.z1, PIT, GAL.h, '#2b2c2f');
  wallBox(lists.dark, GAL.x1, GAL.x1 + T, WIN.z0, WIN.z1, PIT, WIN.y0, '#2b2c2f');
  wallBox(lists.dark, GAL.x1, GAL.x1 + T, WIN.z0, WIN.z1, WIN.y1, GAL.h, '#2b2c2f');
  const LX = (LOCK.x0 + LOCK.x1) / 2;
  wallWith(lists.dark, false, GAL.z1 + T / 2, GAL.x0 - T, GAL.x1 + T, GAL.h, [[LX - LOCK.w / 2 - 0.03, LX + LOCK.w / 2 + 0.03, 2.23]], '#2b2c2f');   // the back, the sound lock's inner doors (cut under their frame)
  // the floors: the pit, the tiers (their fronts are the risers), the stairs either side, the top and the walkway
  const fl = (x0, x1, za, zb, y, c = '#151618') => lists.floorG.push([x1 - x0, y - PIT + 0.1, zb - za, (x0 + x1) / 2, (y + PIT - 0.1) / 2, (za + zb) / 2, c]);
  fl(GAL.x0, GAL.x1, GAL.z0, TIERS[0][0], PIT);
  TIERS.forEach(([zf, y], k) => fl(-AISLE, AISLE, zf, k < 2 ? TIERS[k + 1][0] : REAR, y, '#1b1c1f'));
  fl(GAL.x0, GAL.x1, REAR, GAL.z1 + T, 0, '#1b1c1f');
  for (const s of [-1, 1]) {
    const xa = s > 0 ? AISLE : GAL.x0, xb = s > 0 ? GAL.x1 : -AISLE;
    fl(xa, xb, STEPS[0], REAR, 0, '#222327');
    STEPS.forEach((zs, k) => { if (k < STEPS.length - 1) fl(xa, xb, STEPS[k + 1], zs, -0.2 * (k + 1), '#222327'); });
  }
  for (const [zf] of TIERS) cols.push({ minX: -AISLE, maxX: AISLE, minZ: zf - 0.05, maxZ: zf + 0.05 });   // (the risers: a step up's a wall)
  // the edges lit, as they are in the dark: each tier's nosing, each stair's
  for (const [zf, y] of TIERS) lists.led.push([2 * AISLE, 0.012, 0.02, 0, y - 0.012, zf + 0.012]);
  for (const s of [-1, 1]) STEPS.forEach((zs, k) => lists.led.push([GAL.x1 - AISLE - 0.1, 0.012, 0.02, s * (AISLE + GAL.x1) / 2, -0.2 * k - 0.012, zs + 0.012]));
  // the low partition between the top tier and the walkway, a timber cap
  wallBox(lists.dark, -AISLE, AISLE, REAR - 0.06, REAR + 0.06, TIERS[2][1], 1.0, '#26272a');
  lists.trim.push([2 * AISLE + 0.04, 0.04, 0.2, 0, 1.02, REAR, '#4a3626']);
  lists.ceil.push([GAL.x1 - GAL.x0 + 0.4, 0.1, GAL.z1 - GAL.z0 + 0.4, (GAL.x0 + GAL.x1) / 2, GAL.h + 0.05, (GAL.z0 + GAL.z1) / 2, '#0d0e10']);
  // the sound lock: a little lobby between two sets of double doors, dark acoustic walls
  wallBox(lists.dark, LOCK.x0 - T, LOCK.x0, LOCK.z0, LOCK.z1, 0, LOCK.h, '#2b2c2f');
  wallBox(lists.dark, LOCK.x1, LOCK.x1 + T, LOCK.z0, LOCK.z1, 0, LOCK.h, '#2b2c2f');
  lists.floorC.push([LOCK.x1 - LOCK.x0, 0.1, LOCK.z1 - LOCK.z0, LX, -0.05, (LOCK.z0 + LOCK.z1) / 2]);
  lists.ceil.push([LOCK.x1 - LOCK.x0 + 0.4, 0.1, LOCK.z1 - LOCK.z0, LX, LOCK.h + 0.05, (LOCK.z0 + LOCK.z1) / 2, '#2a2b2e']);
  // the flat
  wallWith(lists.flat, true, FLAT.x0 - T / 2, FLAT.z0 - T, FLAT.z1, FLAT.h, [], '#8f8a6e');
  wallWith(lists.flat, true, FLAT.x1 + T / 2, FLAT.z0 - T, FLAT.z1, FLAT.h, [], '#8f8a6e');
  wallWith(lists.flat, false, FLAT.z0 - T / 2, FLAT.x0, FLAT.x1, FLAT.h, [], '#8f8a6e');
  lists.floorF.push([FLAT.x1 - FLAT.x0, 0.1, FLAT.z1 - FLAT.z0 + 0.2, (FLAT.x0 + FLAT.x1) / 2, -0.05, (FLAT.z0 + FLAT.z1) / 2 + 0.1]);
  lists.ceil.push([FLAT.x1 - FLAT.x0 + 0.4, 0.1, FLAT.z1 - FLAT.z0 + 0.3, (FLAT.x0 + FLAT.x1) / 2, FLAT.h + 0.05, (FLAT.z0 + FLAT.z1) / 2 - 0.05, '#a19b86']);   // (its end inside the corridor's wall, not on its face)

  // ----- the corridors: one route, from the stub by the sky door along the gallery's back and round to the exit -----
  // Its walls are its middle line offset either side (o > 0: to the left of the way along it, the +n side); the doors in
  // them, by where they are. A cupboard off it.
  const LW = COR.w / 2, RT = ROUTE, dirs = RT.slice(1).map((b, i) => [Math.sign(b[0] - RT[i][0]), Math.sign(b[1] - RT[i][1])]);
  const nrm = (d) => [-d[1], d[0]];
  const offsetLine = (o) => RT.map((p, i) => {
    const n0 = nrm(dirs[Math.max(0, i - 1)]), n1 = nrm(dirs[Math.min(dirs.length - 1, i)]);
    if (i === 0) return [p[0] + o * n1[0], p[1] + o * n1[1]];
    if (i === RT.length - 1) return [p[0] + o * n0[0], p[1] + o * n0[1]];
    return [p[0] + o * (n0[0] + n1[0]), p[1] + o * (n0[1] + n1[1])];
  });
  // The doors: in a wall along z (ns) or x, their middle at (x, z). kind: 'fire' (steel, wired glass, a push bar), 'wood',
  // 'steel', 'flat' (the flat's front door: world-edge-flat.js dresses it); `inward` ones always swing away from their `face`; across a corridor (`across`: a frame and a transom, no wall); `pair` for double doors; locked ones rattle; auto
  // ones swing open as you come up to them, and shut behind you.
  const DOORS = [
    { name: 'lockIn', x: LX, z: GAL.z1 + T / 2, ns: false, w: LOCK.w, h: 2.2, pair: true, kind: 'acoustic', auto: true, face: 1, title: 'Gallery 4', say: 'Swing doors: they open as you come to them' },
    { name: 'lockOut', x: LX, z: 3.1 - LW - T / 2, ns: false, w: LOCK.w, h: 2.2, pair: true, kind: 'acoustic', auto: true, face: 1, title: 'Gallery 4', say: 'Swing doors: they open as you come to them' },
    { name: 'fireW', x: -15.6, z: 3.1, ns: true, w: 1.6, pair: true, kind: 'fire', auto: true, across: true, title: 'Fire door', say: 'Fire door: keep shut' },
    { name: 'fireE', x: 9.5, z: 3.1, ns: true, w: 1.6, pair: true, kind: 'fire', auto: true, across: true, title: 'Fire door', say: 'Fire door: keep shut' },
    { name: 'fireS', x: 24, z: 12, ns: false, w: 1.6, pair: true, kind: 'fire', auto: true, across: true, title: 'Fire door', say: 'Fire door: keep shut' },
    { name: 'wc', x: -1.6, z: 3.1 - LW - T / 2, ns: false, w: 0.85, kind: 'wood', locked: true, face: 1, title: 'WC', say: 'Engaged. Someone coughs.' },
    { name: 'edit', x: 4.6, z: 3.1 - LW - T / 2, ns: false, w: 0.85, kind: 'wood', locked: true, face: 1, title: 'Edit 2', say: 'Locked. A red light over it: in session.' },
    { name: 'flat', x: FLAT.door, z: 3.1 - LW - T / 2, ns: false, w: 0.9, h: 2.05, kind: 'flat', inward: true, face: 1, title: 'Flat 7', say: 'A front door, tired. A TV on behind it.' },
    { name: 'store', x: -6.0, z: 3.1 + LW + T / 2, ns: false, w: 0.85, kind: 'wood', face: -1, title: 'Store', say: 'A store cupboard' },
    { name: 'dock', x: -18.4, z: 8.0 + T / 2, ns: false, w: 1.3, kind: 'steel', locked: true, face: -1, title: 'Scene dock', say: 'Locked. Something big leans on it from the other side.' },
    { name: 'riser', x: 24 + LW + T / 2, z: 7.5, ns: true, w: 0.8, kind: 'steel', locked: true, face: -1, title: 'Electrical riser', say: 'Locked. It hums.' },
    { name: 'plant', x: 40.9 + T / 2, z: 20, ns: true, w: 1.2, kind: 'steel', locked: true, face: -1, title: 'Plant room', say: 'Locked. Authorised personnel only.' },
  ];
  // (a framed one cut 3 cm wider each side and higher than its opening, the wall's ends hidden inside the frame, not on
  // the same plane as its jambs' faces)
  const holes = [   // every opening in a corridor wall: the doors above, and the two that go somewhere else
    ...DOORS.filter((d) => !d.across).map((d) => ({ ...d, lap: 0.03 })),
    { x: SKYAT.x - T / 2, z: SKYAT.z, ns: true, w: SKY.w, h: SKY.h }, { x: Q.x, z: Q.z - T / 2, ns: false, w: EXIT.w, h: EXIT.h, lap: 0.03 },
    { x: PLAN.VENT.x, z: PLAN.VENT.z, ns: false, w: PLAN.VENT.w, h: PLAN.VENT.h, own: true },
  ];
  const holesOn = (ns, fixed, a0, a1) => holes.filter((d) => !!d.ns === ns && Math.abs((ns ? d.x : d.z) - fixed) < 0.15 && (ns ? d.z : d.x) > a0 && (ns ? d.z : d.x) < a1)
    .map((d) => { const m = ns ? d.z : d.x, e = d.w / 2 + (d.lap || 0); return [m - e, m + e, (d.h ?? 2.1) + (d.lap || 0), d.own]; });
  const corL = { own: [], walls: [], floor: [], ceil: [], fit: [], glow: [], pool: [], wet: [], pipe: [] };
  for (const s of [1, -1]) {
    const pts = offsetLine(s * (LW + T / 2));
    for (let i = 0; i < pts.length - 1; i++) {
      // each run carries on through the corner square at its end; the next starts past it (two through it: a doubled face)
      const [a, b] = [pts[i], pts[i + 1]], ns = Math.abs(a[0] - b[0]) < 1e-6, fixed = ns ? a[0] : a[1];
      const sa = ns ? a[1] : a[0], sb = ns ? b[1] : b[0], dr = Math.sign(sb - sa), s0 = sa + dr * (i === 0 ? -T / 2 : T / 2), s1 = sb + dr * T / 2;
      const a0 = Math.min(s0, s1), a1 = Math.max(s0, s1);
      // (a run with the duct's opening in it is built apart, on a stream of its own, a placeholder in its place: three takes
      // a uuid from Math.random for each box, and the extra pieces round it would move every draw after them)
      const hs = holesOn(ns, fixed, a0, a1), apart = hs.some((h) => h[3]);
      wallWith(apart ? corL.own : corL.walls, ns, fixed, a0, a1, COR.h, hs, s > 0 ? '#77746e' : '#7a776f');
      if (apart) corL.walls.push([0, 0, 0, 0, -9, 0, '#77746e']);
    }
  }
  {   // the two ends
    const [p0, p1] = [RT[0], RT[RT.length - 1]];
    wallWith(corL.walls, false, p0[1] + T / 2, p0[0] - LW - T, p0[0] + LW + T, COR.h, holesOn(false, p0[1] + T / 2, -1e9, 1e9), '#77746e');
    wallWith(corL.walls, true, p1[0] + T / 2, p1[1] - LW - T, p1[1] + LW + T, COR.h, holesOn(true, p1[0] + T / 2, -1e9, 1e9), '#77746e');
  }
  const rects = [], lids = [];   // the corridors' floor, each leg through the corner at its end (the next from there on); the ceiling, into the walls
  for (let i = 0; i < dirs.length; i++) {
    const a = RT[i], b = RT[i + 1], ea = i > 0 ? -LW : 0, eb = i < dirs.length - 1 ? LW : 0, d = dirs[i];
    const xa = a[0] - d[0] * ea, za = a[1] - d[1] * ea, xb = b[0] + d[0] * eb, zb = b[1] + d[1] * eb;
    rects.push([Math.min(xa, xb) - (d[0] ? 0 : LW), Math.max(xa, xb) + (d[0] ? 0 : LW), Math.min(za, zb) - (d[1] ? 0 : LW), Math.max(za, zb) + (d[1] ? 0 : LW)]);
    const ca = i > 0 ? -LW - 0.2 : 0.2, cb = i < dirs.length - 1 ? LW + 0.2 : 0.2, xc = a[0] - d[0] * ca, zc = a[1] - d[1] * ca, xd = b[0] + d[0] * cb, zd = b[1] + d[1] * cb;
    lids.push([Math.min(xc, xd) - (d[0] ? 0 : LW + 0.2), Math.max(xc, xd) + (d[0] ? 0 : LW + 0.2), Math.min(zc, zd) - (d[1] ? 0 : LW + 0.2), Math.max(zc, zd) + (d[1] ? 0 : LW + 0.2)]);
  }
  for (const [x0, x1, za, zb] of rects) corL.floor.push([x1 - x0, 0.1, zb - za, (x0 + x1) / 2, -0.05, (za + zb) / 2]);
  for (const [x0, x1, za, zb] of lids) corL.ceil.push([x1 - x0, 0.1, zb - za, (x0 + x1) / 2, COR.h + 0.05, (za + zb) / 2, '#5f5d58']);
  // the store: a cupboard off the corridor, shelves of tape boxes and gaffer, a mop in a bucket
  const ST = { x0: -6.9, x1: -5.1, z0: 3.1 + LW + T, z1: 5.5 };
  wallWith(corL.walls, true, ST.x0 - T / 2, ST.z0, ST.z1 + T, COR.h, [], '#8a877f');
  wallWith(corL.walls, true, ST.x1 + T / 2, ST.z0, ST.z1 + T, COR.h, [], '#8a877f');
  wallWith(corL.walls, false, ST.z1 + T / 2, ST.x0 - T, ST.x1 + T, COR.h, [], '#8a877f');
  corL.floor.push([ST.x1 - ST.x0, 0.1, ST.z1 - ST.z0, (ST.x0 + ST.x1) / 2, -0.05, (ST.z0 + ST.z1) / 2]);
  corL.ceil.push([ST.x1 - ST.x0 + 0.4, 0.1, ST.z1 - ST.z0 + 0.4, (ST.x0 + ST.x1) / 2, COR.h + 0.05, (ST.z0 + ST.z1) / 2, '#6a6862']);
  {
    const sh = [];
    for (const y of [0.35, 0.85, 1.35, 1.85]) {
      sh.push([0.4, 0.03, ST.z1 - ST.z0 - 0.1, ST.x0 + 0.22, y, (ST.z0 + ST.z1) / 2 + 0.03, '#7b6a50'], [0.4, 0.03, ST.z1 - ST.z0 - 0.1, ST.x1 - 0.22, y, (ST.z0 + ST.z1) / 2 + 0.03, '#7b6a50']);
      for (let k = 0; k < 5; k++) for (const sx of [ST.x0 + 0.22, ST.x1 - 0.22]) if (Math.random() < 0.75) {
        const w = 0.18 + Math.random() * 0.14, h = 0.12 + Math.random() * 0.25;
        sh.push([0.3, h, w, sx, y + 0.015 + h / 2, ST.z0 + 0.25 + k * 0.33, ['#2a2b2e', '#6b5a42', '#1c3b6e', '#c9c3b2', '#3a3a3a'][(Math.random() * 5) | 0]]);
      }
    }
    sh.push([0.3, 0.28, 0.3, (ST.x0 + ST.x1) / 2, 0.14, ST.z1 - 0.3, '#c8a21a'], [0.025, 1.2, 0.025, (ST.x0 + ST.x1) / 2 + 0.05, 0.75, ST.z1 - 0.28, '#8a6a40']);   // the bucket, the mop
    corL.fit.push(...sh);
    cols.push({ minX: ST.x0, maxX: ST.x0 + 0.45, minZ: ST.z0, maxZ: ST.z1 }, { minX: ST.x1 - 0.45, maxX: ST.x1, minZ: ST.z0, maxZ: ST.z1 });
  }

  // Textures: concrete (a soft mottle), the gallery's acoustic slats, the flat's tired wallpaper and carpet, painted floors.
  const R = Math.random;
  const tex = (w, h, draw, rep = 1, repY = rep) => { const c = makeCanvas(w, h); draw(c.ctx, w, h); c.tex.wrapS = c.tex.wrapT = THREE.RepeatWrapping; c.tex.repeat.set(rep, repY); c.tex.needsUpdate = true; return c.tex; };
  const mottle = (c, w, h, base, n, a) => { c.fillStyle = base; c.fillRect(0, 0, w, h); for (let k = 0; k < n; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * a})`; c.beginPath(); c.arc(R() * w, R() * h, 2 + R() * 18, 0, 7); c.fill(); } };
  const concT = tex(256, 256, (c, w, h) => mottle(c, w, h, '#fff', 500, 0.05));
  const slatT = tex(256, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(x, 0, 3, h); } }, 4, 1);
  const paperT = tex(128, 256, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { c.fillStyle = 'rgba(120,96,60,.18)'; c.fillRect(x, 0, 10, h); }
    for (let y = 10; y < h; y += 40) for (let x = 0; x < w; x += 32) { c.fillStyle = 'rgba(120,70,60,.2)'; c.beginPath(); c.arc(x + 21, y + ((x / 32) % 2) * 20, 4, 0, 7); c.fill(); }
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(60,50,30,.25)'); g.addColorStop(0.3, 'rgba(60,50,30,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, 9, 1);
  const carpetT = tex(128, 128, (c, w, h) => mottle(c, w, h, '#fff', 900, 0.08), 6);
  const floorT = tex(512, 512, (c, w, h) => { mottle(c, w, h, '#fff', 700, 0.06); }, 4);
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
  const concM = M({ vertexColors: true, map: concT }), darkM = M({ vertexColors: true, map: slatT, roughness: 0.95 }), flatM = M({ vertexColors: true, map: paperT });
  const LIT = new THREE.Color('#eef4ff').multiplyScalar(2.2);
  const meshes = [
    mergedBoxes(lists.dark, darkM), mergedBoxes(lists.flat, flatM),
    mergedBoxes(lists.floorC, M({ color: '#4a4b4d', map: floorT, roughness: 0.75 })), mergedBoxes(lists.floorG, M({ vertexColors: true, map: floorT, roughness: 0.6, metalness: 0.2 })),
    mergedBoxes(lists.floorF, M({ color: '#5b4a3a', map: carpetT, roughness: 1 })), mergedBoxes(lists.ceil, M({ vertexColors: true })),
    mergedBoxes(lists.trim, M({ vertexColors: true, roughness: 0.5 })), mergedBoxes(lists.led, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.55, 1.0) })),
  ];
  for (const m of meshes) { m.castShadow = false; root.add(m); }
  {   // the flat's paper on the corridor's wall too, round its front door (a skin, its pattern the same size as the far wall's)
    const sh = new THREE.Shape([[FLAT.x0, 0], [FLAT.x1, 0], [FLAT.x1, FLAT.h], [FLAT.x0, FLAT.h]].map(([x, y]) => new THREE.Vector2(x, y))), dh = 0.51;
    const hx = FLAT.x0 + FLAT.x1 - FLAT.door;   // (it's turned round to face in)
    sh.holes.push(new THREE.Path([[hx - dh, 0], [hx - dh, 2.11], [hx + dh, 2.11], [hx + dh, 0]].map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ShapeGeometry(sh), pa = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pa.count; i++) uv.setXY(i, (FLAT.x1 - pa.getX(i)) / (FLAT.x1 - FLAT.x0), pa.getY(i) / FLAT.h);
    g.rotateY(Math.PI).translate(FLAT.x0 + FLAT.x1, 0, FLAT.z1 - 0.006);
    root.add(new THREE.Mesh(g, M({ color: '#8f8a6e', map: paperT })));
  }

  const red = M({ color: '#a8231c', roughness: 0.45 }), black = M({ color: '#151515', roughness: 0.6 });
  const cyl = (g, r, h, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), m); o.position.set(x, y, z); g.add(o); return o; };
  const decal = (w, h, draw, x, y, z, ry, parent = root) => {
    const c = makeCanvas(Math.round(w * 400), Math.round(h * 400)); draw(c.ctx, c.W, c.H); c.tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: c.tex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
  };
  const stencil = (c, txt, size, col) => {
    c.font = `800 ${size}px "Arial Black", Impact, ${FONT}`; c.fillStyle = col; c.textBaseline = 'middle'; c.fillText(txt, 8, c.canvas.height / 2);
    c.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(0,0,0,${R() * 0.5})`; c.fillRect(R() * c.canvas.width, R() * c.canvas.height, 2, 2); }
    c.globalCompositeOperation = 'source-over';
  };
  const point = (c, i, d, x, y, z) => { const l = new THREE.PointLight(c, i, d, 1.6); l.position.set(x, y, z); root.add(l); return l; };

  // ----- the corridors' fittings: every run along a wall, round the corners with an elbow, above your head -----
  // A run o to the left of the route's middle line (its wall side), at height y: round (pipes, conduit: straight lengths
  // and a bend at each corner) or flat (the tray, its cables: lengths meeting square at the corners).
  const tint = (g, c) => { const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const pipeGeos = [];
  function roundRun(o, y, r, c, bend = 0.3) {
    const pts = offsetLine(o).map(([x, z]) => new THREE.Vector3(x, y, z));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = b.clone().sub(a), len = d.length(); d.normalize();
      const s0 = i > 0 ? bend : 0, s1 = i < pts.length - 2 ? bend : 0, l = len - s0 - s1;
      const g = new THREE.CylinderGeometry(r, r, l, 10, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      const m = a.clone().addScaledVector(d, s0 + l / 2); g.translate(m.x, m.y, m.z);
      pipeGeos.push(tint(g, c));
      if (i < pts.length - 2) {   // the elbow round the next corner
        const dn = pts[i + 2].clone().sub(b).normalize();
        const curve = new THREE.QuadraticBezierCurve3(b.clone().addScaledVector(d, -bend), b.clone(), b.clone().addScaledVector(dn, bend));
        pipeGeos.push(tint(new THREE.TubeGeometry(curve, 8, r, 10, false), c));
        pipeGeos.push(tint(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.05, 10).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)).translate(...b.clone().addScaledVector(d, -bend).toArray()), c));   // its collars
        pipeGeos.push(tint(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.05, 10).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dn)).translate(...b.clone().addScaledVector(dn, bend).toArray()), c));
      }
    }
  }
  function flatRun(o, y, w, h, c, list = corL.fit) {
    const pts = offsetLine(o);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], ns = Math.abs(a[0] - b[0]) < 1e-6, e0 = i > 0 ? -w / 2 : 0, e1 = i < pts.length - 2 ? w / 2 : 0;   // (through the corner at its end; the next from there on)
      const lo = Math.min(ns ? a[1] : a[0], ns ? b[1] : b[0]), hi = Math.max(ns ? a[1] : a[0], ns ? b[1] : b[0]);
      const sa = (ns ? a[1] < b[1] : a[0] < b[0]) ? e0 : e1, sb = sa === e0 ? e1 : e0, l = hi - lo + sa + sb, mid = (lo - sa + hi + sb) / 2;
      list.push(ns ? [w, h, l, a[0], y, mid, c] : [l, h, w, mid, y, a[1], c]);
    }
  }
  const TRAY = COR.h - 0.18;
  flatRun(LW - 0.2, TRAY, 0.32, 0.02, '#6d7175');   // the tray along the left-hand wall, its cables on it
  ['#1d1f22', '#2c2f33', '#7a2a24', '#1d1f22', '#2a4a7a', '#d8c24a'].forEach((c, k) => flatRun(LW - 0.08 - k * 0.045, TRAY + 0.028, 0.035, 0.035, c));
  roundRun(-(LW - 0.1), COR.h - 0.13, 0.055, '#4f5357');   // two pipes along the right-hand wall, lagged and bare
  roundRun(-(LW - 0.27), COR.h - 0.12, 0.035, '#8a7a5a');
  roundRun(-(LW - 0.02), COR.h - 0.04, 0.0125, '#9a9ea2', 0.15);   // and a conduit, tucked up in the wall's top corner
  {   // the tray's hangers, the pipes' clips: every so often along each leg
    for (const [o, y, h, c] of [[LW - 0.2, COR.h - 0.09, 0.18, '#5d6165'], [-(LW - 0.1), COR.h - 0.035, 0.07, '#3d4044'], [-(LW - 0.27), COR.h - 0.04, 0.08, '#3d4044']]) {
      const pts = offsetLine(o);
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i], len = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
        for (let u = 0.6; u < len - 0.4; u += 1.2) corL.fit.push([0.025, h, 0.025, pts[i][0] + d[0] * u, y, pts[i][1] + d[1] * u, c]);
      }
    }
  }
  // the strip lights: down the middle every 4 m (every fifth dead, one that flickers), not where a door hangs across
  let tube = 0;
  const flick = { glow: [], pool: [] };
  const across = DOORS.filter((d) => d.across);
  for (let i = 0; i < dirs.length; i++) {
    const a = RT[i], d = dirs[i], len = Math.abs(RT[i + 1][0] - a[0]) + Math.abs(RT[i + 1][1] - a[1]);
    for (let u = 2; u < len - 0.5; u += 4) {
      const x = a[0] + d[0] * u, z = a[1] + d[1] * u;
      if (across.some((q) => Math.hypot(q.x - x, q.z - z) < 1)) continue;
      const dead = tube % 5 === 3, flicker = tube === 7, w = d[0] ? [1.3, 0.09] : [0.09, 1.3];
      tube++;
      corL.fit.push([w[0], 0.05, w[1], x, COR.h - 0.03, z, '#8c8f93']);
      if (dead) { corL.fit.push([w[0] * 0.94, 0.02, w[1] * 0.94, x, COR.h - 0.065, z, '#3a3c3e']); continue; }
      (flicker ? flick.glow : corL.glow).push([w[0] * 0.94, 0.02, w[1] * 0.94, x, COR.h - 0.065, z]);
      (flicker ? flick.pool : corL.pool).push([d[0] ? 3.4 : 1.7, 0.002, d[0] ? 1.7 : 3.4, x, 0.004, z]);
    }
  }
  // vents, low on the walls here and there; puddles under a leaking joint or two
  for (const [x, z, ns] of [[-18.4 + LW - 0.02, 5.0, true], [-9.0, 3.1 + LW - 0.02, false], [14.5, 3.1 + LW - 0.02, false], [24 - LW + 0.02, 16.5, true], [31, 20 - LW + 0.02, false]]) {
    corL.fit.push(ns ? [0.04, 0.32, 0.6, x, 0.35, z, '#3d4044'] : [0.6, 0.32, 0.04, x, 0.35, z, '#3d4044']);
    for (let k = 0; k < 5; k++) corL.fit.push(ns ? [0.05, 0.012, 0.56, x, 0.23 + k * 0.06, z, '#1a1b1d'] : [0.56, 0.012, 0.05, x, 0.23 + k * 0.06, z, '#1a1b1d']);
  }
  for (const [x, z, r, sx] of [[-12.5, 3.3, 0.5, 1.7], [3.0, 2.8, 0.35, 1.2], [13.2, 3.3, 0.6, 1.9], [24.2, 6.5, 0.45, 1.5], [23.8, 15.5, 0.3, 1], [29.5, 20.2, 0.55, 2.0], [36.2, 19.8, 0.35, 1.4]]) {
    const g = new THREE.CircleGeometry(r, 18), pp = g.attributes.position;
    for (let i = 1; i < pp.count; i++) { const k = 0.75 + R() * 0.45; pp.setXY(i, pp.getX(i) * k * sx, pp.getY(i) * k); }
    corL.wet.push(g.rotateX(-Math.PI / 2).translate(x, 0.006, z));
  }
  let corFlicker = (t) => {};
  {
    const parts = [mergedBoxes(corL.walls, concM), mergedBoxes(corL.floor, M({ color: '#4a4b4d', map: floorT, roughness: 0.75 })), mergedBoxes(corL.ceil, M({ vertexColors: true })),
      mergedBoxes(corL.fit, M({ vertexColors: true, roughness: 0.6, metalness: 0.3 })), new THREE.Mesh(mergeGeometries(pipeGeos), M({ vertexColors: true, roughness: 0.5, metalness: 0.5 }))];
    for (const m of parts) { m.castShadow = false; root.add(m); }
    { const random = Math.random; Math.random = rng(5310); try { root.add(Object.assign(mergedBoxes(corL.own, concM), { castShadow: false })); } finally { Math.random = random; } }
    root.add(mergedBoxes(corL.glow, new THREE.MeshBasicMaterial({ color: LIT })));
    // the light each tube throws on the floor, and the wet
    const poolT = tex(128, 128, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    const poolM = new THREE.MeshBasicMaterial({ map: poolT, color: new THREE.Color('#cfdcff').multiplyScalar(0.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pools = mergedBoxes(corL.pool, poolM); pools.layers.set(1); root.add(pools);
    const wetM = M({ color: '#08090a', roughness: 0.3, metalness: 0, envMapIntensity: 0.04, polygonOffset: true, polygonOffsetFactor: -2 });
    root.add(new THREE.Mesh(mergeGeometries(corL.wet), wetM));
    // the one that flickers
    const fG = mergedBoxes(flick.glow, new THREE.MeshBasicMaterial({ color: LIT })), fP = mergedBoxes(flick.pool, poolM.clone()); fP.layers.set(1);
    root.add(fG, fP);
    const fl2 = new THREE.PointLight('#e6eeff', 2.2, 9, 1.6); fl2.position.copy(new THREE.Box3().setFromObject(fG).getCenter(new THREE.Vector3())).setY(COR.h - 0.3); root.add(fl2);
    corFlicker = (t) => {
      const on = Math.sin(t * 13.1) + Math.sin(t * 31.7) * 0.6 + Math.sin(t * 2.3) > 0.4 || (t % 7) < 3.5;
      fG.material.color.copy(LIT).multiplyScalar(on ? 1 : 0.08); fP.visible = on; fl2.intensity = on ? 2.2 : 0.05;
    };
  }
  // the light: a tube's worth here and there (the rest only glow), the sound lock's, and the gallery's blue at its doors
  for (const [x, z] of [[-18.4, 5.4], [-12, 3.1], [2, 3.1], [16, 3.1], [24, 8], [24, 19.2], [37.4, 20]]) point('#e6eeff', 3.2, 11, x, COR.h - 0.3, z);
  point('#7f9cff', 1.2, 5, LX, 2.2, 0.9);
  // the gallery's own: dim downlights over the tiers and the walkway (the wall's glow and the desks' screens do the rest)
  for (const [z, i, tz] of [[-6.4, 36, -7.4], [-1.6, 12, -2.6]]) {
    const l = new THREE.SpotLight('#c9d6ff', i, 10, 1.15, 0.8, 1.4); l.position.set(0, GAL.h - 0.1, z); l.target.position.set(0, -1, tz); root.add(l, l.target);
  }
  // extinguishers on their brackets, their signs; stencils
  for (const [x, z, ry] of [[-14.2, 3.1 + LW - 0.12, Math.PI], [7.4, 3.1 + LW - 0.12, Math.PI], [24 - LW + 0.12, 14.2, Math.PI / 2], [39.8, 20 - LW + 0.12, 0]]) {
    const e2 = new THREE.Group(); e2.position.set(x, 0, z); e2.rotation.y = ry; root.add(e2);
    cyl(e2, 0.085, 0.5, red, 0, 0.62, 0); cyl(e2, 0.05, 0.05, black, 0, 0.9, 0); cyl(e2, 0.012, 0.12, black, 0.05, 0.93, 0).rotation.z = 1.2;
    decal(0.26, 0.26, (c, w, h) => { c.fillStyle = '#b2241b'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `700 ${w * 0.14}px ${FONT}`; c.textAlign = 'center'; c.fillText('FIRE', w / 2, h * 0.42); c.fillText('EXTINGUISHER', w / 2, h * 0.62); },
      0, 1.4, -0.1, 0, e2);
  }
  decal(1.6, 0.5, (c) => stencil(c, 'STAGE 4', 150, 'rgba(232,226,210,.9)'), 0.2, 1.75, 3.1 + LW - 0.003, Math.PI);
  decal(1.5, 0.3, (c) => stencil(c, '← STAGE DOOR', 86, 'rgba(232,226,210,.8)'), -8.6, 1.5, 3.1 + LW - 0.003, Math.PI);
  decal(1.7, 0.3, (c) => stencil(c, 'LOADING BAY →', 86, 'rgba(232,226,210,.8)'), 12.4, 1.5, 3.1 + LW - 0.003, Math.PI);
  decal(1.5, 0.3, (c) => stencil(c, '← GALLERY', 92, 'rgba(232,226,210,.8)'), 24 + LW - 0.003, 1.5, 15, -Math.PI / 2);
  decal(1.2, 0.42, (c) => stencil(c, 'S4-B', 130, 'rgba(232,226,210,.75)'), 24 - LW + 0.003, 1.8, 5.2, Math.PI / 2);
  decal(1.2, 0.42, (c) => stencil(c, 'S4-A', 130, 'rgba(232,226,210,.75)'), -18.4 + LW - 0.003, 1.8, SKYAT.z + 0.3, -Math.PI / 2);   // (across from the sky door)
  decal(1.5, 0.3, (c) => stencil(c, '← GALLERY', 92, 'rgba(232,226,210,.8)'), -18.4 + LW - 0.003, 1.45, SKYAT.z - 0.2, -Math.PI / 2);
  decal(1.2, 0.42, (c) => stencil(c, 'S4-C', 130, 'rgba(232,226,210,.75)'), 27.5, 1.8, 20 - LW + 0.003, 0);

  // ----- the doors: frames, leaves that swing, signs -----
  const frameG = [], doors = [];
  const doorM = { fire: M({ color: '#5d6266', roughness: 0.5, metalness: 0.5 }), wood: M({ color: '#8a6d4c', roughness: 0.55 }), steel: M({ color: '#4f5458', roughness: 0.55, metalness: 0.4 }),
    acoustic: M({ color: '#2e3034', roughness: 0.7 }), flat: null };   // (the flat's: its own, world-edge-flat.js)
  const glassM = M({ color: '#0c1014', roughness: 0.1, metalness: 0.6 }), chrome = M({ color: '#b9bdc1', metalness: 0.8, roughness: 0.3 });
  const signM = (draw, w, h) => { const c = makeCanvas(Math.round(w * 500), Math.round(h * 500)); draw(c.ctx, c.W, c.H); c.tex.needsUpdate = true; return c.tex; };
  const fireSignM = M({ roughness: 0.5, map: signM((c, w, h) => {
    c.fillStyle = '#1f4fa8'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = `700 ${h * 0.15}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    ['FIRE DOOR', 'KEEP SHUT'].forEach((l, i) => c.fillText(l, w / 2, h * (0.42 + i * 0.19)));
  }, 0.36, 0.36) });
  const plate = (txt, bg = '#f2f0ea', fg = '#1d1d1d') => (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = `700 ${h * 0.5}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2 + 2); };
  for (const d of DOORS) {
    const g = new THREE.Group(); g.position.set(d.x, 0, d.z); g.rotation.y = d.ns ? Math.PI / 2 : 0; root.add(g); g.updateMatrix();   // local x along the wall, z across it
    const h = d.h ?? 2.1, w = d.w, m = doorM[d.kind], deep = d.across ? 0.12 : T + 0.02;
    const fb = (bw, bh, bd, x, y, z) => frameG.push(new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z).applyMatrix4(g.matrix));
    fb(0.06, h, deep, -w / 2 - 0.03, h / 2, 0); fb(0.06, h, deep, w / 2 + 0.03, h / 2, 0); fb(w + 0.12, 0.06, deep, 0, h + 0.03, 0);   // jambs, the head over them
    if (d.across) {   // a door across the corridor: posts to the walls, a transom over it to the ceiling, its cables and pipes through
      const side = (COR.w - w - 0.12) / 2;
      if (side > 0.01) { fb(side, h + 0.06, 0.1, -COR.w / 2 + side / 2, (h + 0.06) / 2, 0); fb(side, h + 0.06, 0.1, COR.w / 2 - side / 2, (h + 0.06) / 2, 0); }
      fb(COR.w, COR.h - h - 0.06, 0.1, 0, (COR.h + h + 0.06) / 2, 0);
      const cb = d.ns ? { minX: d.x - 0.06, maxX: d.x + 0.06, minZ: d.z - LW, maxZ: d.z - w / 2 } : { minX: d.x - LW, maxX: d.x - w / 2, minZ: d.z - 0.06, maxZ: d.z + 0.06 };
      cols.push(cb, d.ns ? { ...cb, minZ: d.z + w / 2, maxZ: d.z + LW } : { ...cb, minX: d.x + w / 2, maxX: d.x + LW });
    }
    const leaves = (d.pair ? [-1, 1] : [-1]).map((s) => {
      // hung at the jamb's corner on the face it opens toward (hang()), the leaf behind that line: open, it's clear of the
      // jamb and the reveal, not swung through them
      const lw = (d.pair ? w / 2 : w) - 0.015, hinge = new THREE.Group(), body = new THREE.Group(); hinge.position.set(s * (w / 2 - 0.005), 0.01, 0); g.add(hinge); hinge.add(body);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, h - 0.02, 0.05).translate(-s * lw / 2, (h - 0.02) / 2, 0), m); body.add(leaf);
      if (d.kind === 'flat') return { hinge, body, s, leaf, lw };
      const fx = -s * lw / 2;   // the leaf's middle, across
      if (d.kind === 'fire' || d.kind === 'acoustic') {   // a vision panel
        const gl = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.3, lw * 0.4), 0.7, 0.056), glassM); gl.position.set(fx, 1.45, 0); body.add(gl);
      }
      if (d.kind === 'fire') {   // a push bar one side, a pull handle the other; the round blue sign
        for (const sz of [1, -1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(lw * 0.7, 0.05, 0.05), chrome); b.position.set(fx, 1.0, sz * 0.055); body.add(b); }
        const sg = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), fireSignM); sg.position.set(fx, h - 0.2, 0.027); body.add(sg);   // (over the glass, not in it)
        const sg2 = sg.clone(); sg2.position.z = -0.027; sg2.rotation.y = Math.PI; body.add(sg2);
      } else if (d.kind === 'acoustic') {
        for (const sz of [1, -1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), chrome); b.position.set(fx + s * lw * 0.3, 1.1, sz * 0.035); body.add(b); }   // push plates
      } else {
        for (const sz of [1, -1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.05), chrome); b.position.set(-s * (lw - 0.1), 1.0, sz * 0.05); body.add(b); }   // lever handles
      }
      return { hinge, body, s, leaf };
    });
    const D = { ...d, g, leaves, k: 0, want: 0, swing: d.inward ? -d.face : d.locked ? d.face : 1, held: false, rattle: 0, hit: null, face2: (deep / 2) - 0.006 };
    hang(D);
    D.hit = ctx.hitBox(g, w, h, 0.3, 0, h / 2, 0, { action: 'stage-door', reach: 2.6 }); D.hit.userData.door = D;
    // its sign, both sides (or the corridor's side), a lamp over some
    if (!d.across && d.kind !== 'acoustic' && d.kind !== 'flat') {
      const tx = signM(plate(d.title.toUpperCase()), 0.36, 0.1);
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.1), M({ map: tx, roughness: 0.5 })); sp.position.set(d.locked ? 0 : (d.w / 2 + 0.3) * d.face, 1.62, d.face * (d.locked ? D.face2 + 0.003 : T / 2 + 0.003));   // (a locked one's on its leaf)
      if (d.face < 0) sp.rotation.y = Math.PI; g.add(sp);
    }
    doors.push(D);
  }
  root.add(Object.assign(new THREE.Mesh(mergeGeometries(frameG.map((b) => b.toNonIndexed())), M({ color: '#3e4246', metalness: 0.5, roughness: 0.5 })), { castShadow: false }));
  const doorBy = Object.fromEntries(doors.map((d) => [d.name, d]));
  // the sound lock's signs: ON AIR over the outer doors (lit: it always is), GALLERY 4 by them, QUIET PLEASE in the lobby
  const lamp = (txt, w, h, col, bg, x, y, z, ry) => {
    const m = decal(w, h, (c, W2, H2) => { c.fillStyle = bg; c.fillRect(0, 0, W2, H2); c.fillStyle = col; c.font = `800 ${H2 * 0.6}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, W2 / 2, H2 / 2 + 3); }, x, y, z, ry);
    m.material = new THREE.MeshBasicMaterial({ map: m.material.map, color: new THREE.Color(1.3, 1.3, 1.3) }); return m;
  };
  lamp('ON AIR', 0.5, 0.16, '#ff3a2a', '#1a0605', LX, 2.34, 3.1 - LW + 0.012, 0);
  lamp('IN SESSION', 0.4, 0.1, '#ff3a2a', '#1a0605', doorBy.edit.x, 2.28, 3.1 - LW + 0.012, 0);
  lamp('ENGAGED', 0.24, 0.07, '#ff3a2a', '#1a0605', doorBy.wc.x + 0.28, 1.0, 3.1 - LW + 0.012, 0);
  decal(0.7, 0.2, plate('GALLERY 4', '#1c1d20', '#e9e6dc'), LX + 1.3, 1.62, 3.1 - LW + 0.003, 0);
  decal(0.6, 0.16, plate('QUIET PLEASE', '#1c1d20', '#e9e6dc'), LOCK.x1 - 0.003, 1.65, 0.9, -Math.PI / 2);
  decal(0.6, 0.16, plate('ON AIR · NO ENTRY', '#3a0b08', '#ffd6cf'), LX, 2.4, GAL.z1 + T + 0.003, 0);
  point('#ff4030', 0.25, 2.5, LX, 2.3, 3.1 - LW + 0.4);

  // ----- the door in the sky, from behind: the back of a set (battens, ply), the leaf a copy of the sky's -----
  const back = [];
  for (const z of [SKYAT.z - SKY.w / 2 - 0.05, SKYAT.z + SKY.w / 2 + 0.05]) back.push([0.06, COR.h, 0.1, SKYAT.x + 0.03, COR.h / 2, z, '#6b5a43']);
  back.push([0.06, 0.1, SKY.w, SKYAT.x + 0.03, SKY.h + 0.05, SKYAT.z, '#6b5a43']);   // (between the uprights, not over them)
  root.add(mergedBoxes(back, M({ vertexColors: true, roughness: 0.8 })));
  const skyHinge = new THREE.Group(); skyHinge.matrixAutoUpdate = false; S.add(skyHinge);   // in the world: set from the sky door's own each frame
  const plyT = tex(128, 256, (c, w, h) => { c.fillStyle = '#c9a77a'; c.fillRect(0, 0, w, h); for (let k = 0; k < 40; k++) { c.strokeStyle = `rgba(110,80,40,${R() * 0.25})`; c.lineWidth = 1 + R() * 2; c.beginPath(); const y = R() * h; c.moveTo(0, y); c.bezierCurveTo(w / 3, y + 9, w * 0.66, y - 9, w, y + R() * 6); c.stroke(); } });
  const plyM = M({ map: plyT, roughness: 0.85 });
  // (its outer face is the sky's paint, its sign the sky side's: put on once that's built, wearOut)
  const LH = SKY.h - 0.02, LW2 = SKY.w - 0.02, greyM = M({ color: '#6f7378', roughness: 0.7 });
  const skyLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.045, LH, LW2), [greyM, plyM, greyM, greyM, greyM, greyM]);
  skyLeaf.position.set(-0.0225, 0, LW2 / 2); skyHinge.add(skyLeaf);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, LW2 * 0.7), M({ color: '#9aa0a6', metalness: 0.7, roughness: 0.35 }));
  bar.position.set(-0.05, -LH / 2 + 1.0, 0); skyLeaf.add(bar);
  const skyHit = ctx.hitBox(skyLeaf, 0.14, LH, LW2, -0.02, 0, 0, { action: 'edge-door', reach: 2.6 });
  let worn = false;
  function wearOut() {
    worn = true;
    skyLeaf.material = [E.leafM, plyM, E.edgeM, E.edgeM, E.edgeM, E.edgeM];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshStandardMaterial({ map: E.signTex, roughness: 0.5 }));
    sign.rotation.y = Math.PI / 2; sign.position.set(0.0265, LH / 2 - 0.28, 0); skyLeaf.add(sign);   // (as the one out there)
  }
  // the sky door's hinge in the world while it's shut (as world-edge.js hangs it), till there's a real one to follow
  const hinge0 = new THREE.Matrix4().makeTranslation(-edge.R + 0.018, edge.LT + 0.01 + LH / 2, -LW2 / 2);
  // what the security camera in here sees through it, open (a portal has nothing to show a feed)
  const skyGlow = new THREE.Mesh(new THREE.PlaneGeometry(SKY.w, SKY.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.0, 2.6) }));
  skyGlow.rotation.y = Math.PI / 2; skyGlow.position.set(SKYAT.x - 0.02, SKY.h / 2, SKYAT.z); skyGlow.visible = false; root.add(skyGlow);

  // ----- the exit: a steel fire door in the corridor's side, push bar this side, a lit sign over it -----
  const exitLeafG = (withBar) => {
    const g = new THREE.Group(), steel = doorM.fire;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(EXIT.w - 0.02, EXIT.h - 0.02, 0.05), steel);
    leaf.position.set((EXIT.w - 0.02) / 2, (EXIT.h - 0.02) / 2, 0); g.add(leaf);
    if (withBar) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(EXIT.w * 0.72, 0.06, 0.06), chrome);
      b.position.set(EXIT.w / 2, 1.0, -0.06); g.add(b);
      for (const x of [0.16, EXIT.w - 0.16]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.06), b.material); k.position.set(x, 1.0, -0.035); g.add(k); }
    }
    return { g, leaf };
  };
  const exitFrame = (parent, z, deep) => {   // a steel frame round the opening, on the face at z
    const f = [[0.06, EXIT.h, deep, -EXIT.w / 2 - 0.03, EXIT.h / 2, z], [0.06, EXIT.h, deep, EXIT.w / 2 + 0.03, EXIT.h / 2, z],
      [EXIT.w + 0.12, 0.06, deep, 0, EXIT.h + 0.03, z]];
    const m = mergedBoxes(f, M({ color: '#4d5256', metalness: 0.5, roughness: 0.5 })); m.castShadow = false; parent.add(m); return m;
  };
  const exitG = new THREE.Group(); exitG.position.set(Q.x, 0, Q.z); root.add(exitG);   // the exit's own space
  exitFrame(exitG, -T / 2 - 0.005, T + 0.01);   // (proud this side; on the other, flush with the doorway, where its pane is)
  // its leaf hung at the jamb's corner on B3's side, behind that line: open, clear of the jamb and the reveal
  const inLeaf = exitLeafG(true), inHinge = new THREE.Group(); inHinge.position.set(-EXIT.w / 2 + 0.005, 0.01, 0.004); inLeaf.g.position.z = -0.025; inHinge.add(inLeaf.g); exitG.add(inHinge);
  const exitHit = ctx.hitBox(inLeaf.g, EXIT.w, EXIT.h, 0.2, EXIT.w / 2, EXIT.h / 2, -0.05, { action: 'edge-exit', reach: 2.6 });
  const exitSign = decal(0.42, 0.16, (c, w, h) => { c.fillStyle = '#0e7a3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#eaffef'; c.font = `800 ${h * 0.66}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('EXIT', w / 2, h / 2 + 3); },
    0, EXIT.h + 0.17, -T - 0.034, Math.PI);
  exitG.add(exitSign);
  exitSign.material = new THREE.MeshBasicMaterial({ map: exitSign.material.map, color: new THREE.Color(1.15, 1.15, 1.15) });
  const signBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.05), M({ color: '#d9dcd5' })); signBox.position.set(0, EXIT.h + 0.17, -T - 0.005); exitG.add(signBox);
  point('#5cff9a', 0.35, 3, Q.x, EXIT.h + 0.15, Q.z - T - 0.4);
  // and on B3: the same door from its side (frame, leaf, a plain handle), there from now on
  const b3 = new THREE.Group(); b3.position.set(XD, 0, ZF); b3.rotation.y = YAW;
  exitFrame(b3, 0.012, 0.024);
  const outLeaf = exitLeafG(false), outHinge = new THREE.Group(); outHinge.position.set(-EXIT.w / 2 + 0.005, 0.01, 0.004); outLeaf.g.position.z = -0.025; outHinge.add(outLeaf.g); b3.add(outHinge);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.05), chrome);
  handle.position.set(EXIT.w - 0.12, 1.0, 0.055); outLeaf.g.add(handle);
  const outHit = ctx.hitBox(outLeaf.g, EXIT.w, EXIT.h, 0.12, EXIT.w / 2, EXIT.h / 2, 0.03, { action: 'edge-exit', reach: 2.6 });
  restr.root.add(b3);
  const X = { open: 0, want: 0, cut: false, seen: false };
  restr.extras.push({
    cols: () => (X.open > 0.05 ? [boxB3(atDoor({ minX: -EXIT.w / 2 - 0.03, maxX: -EXIT.w / 2 + 0.05, minZ: 0, maxZ: EXIT.w }), 0)] : []),   // the leaf, swung open
    hits: () => [outHit],
    cut(list) {   // open, the doorway's a way through B3's wall: the wall's boxes there split either side of it
      if (X.open < 0.5) return;
      const gap = boxB3(atDoor({ minX: -EXIT.w / 2, maxX: EXIT.w / 2, minZ: -G.T - 0.02, maxZ: 0.02 })), alongX = Math.abs(cy) > 0.5;
      const [lo, hi, a, b2] = alongX ? ['minX', 'maxX', 'minZ', 'maxZ'] : ['minZ', 'maxZ', 'minX', 'maxX'];
      for (let k = list.length - 1; k >= 0; k--) {
        const b = list[k];
        if (b[hi] <= gap[lo] || b[lo] >= gap[hi] || b[b2] <= gap[a] || b[a] >= gap[b2]) continue;
        list.splice(k, 1);
        if (b[lo] < gap[lo]) list.push({ ...b, [hi]: gap[lo] });
        if (b[hi] > gap[hi]) list.push({ ...b, [lo]: gap[hi] });
      }
    },
  });
  ctx.action('edge-exit', {
    hover: () => (ctx.away === restr ? `<b>A steel door</b><div class="k">Click to ${X.want ? 'shut' : 'open'} it</div>`
      : `<b>EXIT</b><div class="k">${X.want ? 'Click to shut it' : 'Push the bar to open it'}</div>`),
    click: () => { exitDoor(!X.want); return true; },
  });
  const v3 = new THREE.Vector3();
  const at3 = (x, z, y = 1) => { const [bx, bz] = toB3(x, z); return v3.set(bx, y, bz); };
  function exitDoor(on) {
    if (!!X.want === on) return;
    X.want = on ? 1 : 0;
    sound.bar(at3(Q.x, Q.z));
    if (!on) setTimeout(() => sound.clunk(at3(Q.x, Q.z)), 900);
  }

  // ----- the ordinary doors: click to open or shut (the swing doors open as you come to them); locked ones rattle -----
  ctx.action('stage-door', {
    hover: (h) => {
      const d = h.door;
      return `<b>${d.title}</b><div class="m">${d.say}</div>${d.locked ? '' : `<div class="k">Click to ${d.want ? 'shut' : 'open'} it</div>`}`;
    },
    click: (h) => { doorClick(h.door); return true; },
  });
  function doorClick(d) {
    if (d.locked) {
      d.rattle = 1;
      for (const ms of [0, 110, 260]) setTimeout(() => ctx.sfx.cabinet?.('latch', at3(d.x, d.z), 0.35), ms);
      return;
    }
    openDoor(d, !d.want); d.held = d.want;
  }
  // A door's leaves on the face it'll open toward (swing: +1 toward its +z), shut flush with it, 4 mm in from its frame
  function hang(d) { for (const L of d.leaves) { L.hinge.position.z = d.swing * d.face2; L.body.position.z = -d.swing * 0.025; } }
  function openDoor(d, on) {
    if (!!d.want === !!on) return;
    if (on && d.k < 0.05 && !d.inward) {   // swinging away from you
      const [px, pz] = fromB3(P.x, P.z), side = d.ns ? px - d.x : pz - d.z;
      d.swing = side > 0 ? -1 : 1; hang(d);
    }
    d.want = on ? 1 : 0;
    if (d.kind === 'fire') { if (on) sound.bar(at3(d.x, d.z)); else setTimeout(() => sound.clunk(at3(d.x, d.z)), 1100); }
    else if (d.kind === 'flat') {   // the latch, then the hinge; shutting, the hinge, then the latch catching
      const p = at3(d.x, d.z);
      if (on) { ctx.sfx.cabinet?.('latch', p, 0.3); setTimeout(() => sound.creak(p, 0.35, 1.25), 120); }
      else { sound.creak(p, 0.25, 1.45); setTimeout(() => ctx.sfx.cabinet?.('latch', p, 0.45), 1250); }
    } else ctx.sfx.cabinet?.('latch', at3(d.x, d.z), 0.2);
  }
  // each frame: the swing doors open as you come to them and shut behind you; the leaves where they are
  function doorsFx(dt, t) {
    const [px, pz] = fromB3(P.x, P.z);
    for (const d of doors) {
      const dist = Math.hypot(px - d.x, pz - d.z);
      if (d.auto && bs.on) {
        if (dist < 1.7 && !d.want && !d.shutBy) openDoor(d, true);
        if (dist > 3) { d.shutBy = false; if (d.want && !d.held) openDoor(d, false); }
      }
      d.k = damp(d.k, d.want, d.want ? 3 : 1.8, dt);
      d.rattle = Math.max(0, d.rattle - dt * 2.5);
      const a = 1.55 * sstep(0, 1, d.k) * d.swing, r = d.rattle ? Math.sin(t * 70) * 0.012 * d.rattle : 0;
      for (const L of d.leaves) L.hinge.rotation.y = L.s < 0 ? -a + r : a - r;
    }
  }

  // ----- the rooms' contents -----
  const gallery = installGallery(ctx, bs, PLAN);
  const flat = installFlat(ctx, bs, PLAN, doorBy.flat);
  const model = installModel(ctx, bs, PLAN, edge);
  const desk = installConsole(ctx, bs, PLAN);

  // ----- the doors' frames, and the two portals -----
  const flip = new THREE.Matrix4().makeRotationY(Math.PI);
  const F = { sky: new THREE.Matrix4(), skyIn: new THREE.Matrix4(), skyBack: new THREE.Matrix4(), skyOut: new THREE.Matrix4(), exit: new THREE.Matrix4(), exitBack: new THREE.Matrix4() };
  const toBack = new THREE.Matrix4(), toOff = new THREE.Matrix4();
  function frames() {
    // the door in the sky: in the world (edge.frame, +z west into here) and here (its sill, +z east, in from it)
    F.sky.copy(edge.frame); F.skyOut.copy(F.sky).multiply(flip);
    F.skyIn.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(SKYAT.x, 0, SKYAT.z).premultiply(root.matrixWorld);
    F.skyBack.copy(F.skyIn).multiply(flip);
    toBack.copy(F.skyIn).multiply(new THREE.Matrix4().copy(F.sky).invert());   // the world's space to here
    toOff.copy(toBack).invert();
    // the exit: +z out onto B3; the same in both scenes
    F.exit.makeTranslation(Q.x, 0, Q.z).premultiply(root.matrixWorld); F.exitBack.copy(F.exit).multiply(flip);
  }
  place(0);
  const skyP = makePortal(ctx, { w: SKY.w, h: SKY.h, flat: true }), outP = makePortal(ctx, { w: EXIT.w, h: EXIT.h, flat: true });
  const skyBackP = makePortal(ctx, { w: SKY.w, h: SKY.h, flat: true }), outBackP = makePortal(ctx, { w: EXIT.w, h: EXIT.h, flat: true });
  office.add(skyP.mesh); S.add(skyBackP.mesh, outP.mesh); restr.scene.add(outBackP.mesh);

  // Lighting another floor as it's lit from inside, for a look through a door: its look in full.
  const lit = (F2) => () => {
    const L = F2.look;
    if (F2.hemi) { F2.hemi.intensity = L.hemi; F2.hemi.color.copy(L.sky); F2.hemi.groundColor.copy(L.ground); }
    for (const [l, k] of L.lights) l.intensity = k;
    F2.scene.environmentIntensity = L.env;
    return null;
  };
  const officeLit = () => {   // the world from behind: the dome, the stairs, the helicopter waiting
    const hide = ctx.city.trees.filter((o) => o.visible); for (const o of hide) o.visible = false;
    return () => { for (const o of hide) o.visible = true; };
  };

  // ----- each frame: the doors, what's through them, going through -----
  const last = new THREE.Vector3(), cam = new THREE.Vector3(), P = ctx.player;
  let lastAway = null;
  // Into another floor through a door: you keep your place on screen exactly (the camera's carried across by `map`).
  function cross(to, map, dyaw) {
    const fromY = ctx.away?.y || 0;
    cam.copy(camera.position).applyMatrix4(map);
    const dy = cam.y - camera.position.y;
    if (to === restr) restr.arriveAt = { x: cam.x, z: cam.z - z0 };   // (its rooms built round the doorway, not the lift)
    heli.stay = true; ctx.setFloor(to); heli.stay = false;
    if (to.out !== undefined) to.out = 1;   // (no fading in from the car's light: you didn't come by lift)
    if (mine.L && !to.carless) { mine.L.floor = to.n; mine.L.dir = 0; }   // your car waits for you here, as if you'd come by it
    P.x = cam.x; P.z = cam.z; P.yaw += dyaw; P.fy = (P.fy || 0) + fromY + dy - (to.y || 0);
    ctx.setCam({ x: cam.x, y: cam.y, z: cam.z, yaw: P.yaw, pitch: P.pitch });
    camera.updateMatrixWorld();
    last.copy(camera.position); lastAway = to;
  }
  // where B3's rooms are built round for the look through the exit: you, or (further off down the corridor) just inside it
  const viewAt = () => { const [dx, dz] = toB3(Q.x, Q.z - 1); return Math.hypot(P.x - dx, P.z - dz) < 8 ? [P.x, P.z] : [dx, dz]; };
  const yawOf = (m) => { const e = m.elements; return Math.atan2(e[8], e[10]); };
  ctx.onFrame((dt, t) => {
    const A = ctx.away, at = A === bs ? 'back' : A === restr ? 'b3' : A === roof && heli.S.free && heli.S.out && !heli.S.aboard ? 'pier' : null;
    // (only the doors you're looking through from where you are: one drawn into another's picture would show a stale one)
    if (at !== 'pier') skyP.hide();
    if (at !== 'back') { skyBackP.hide(); outP.hide(); }
    if (at !== 'b3') outBackP.hide();
    if (!at) { lastAway = null; return; }
    camera.updateMatrixWorld();
    if (lastAway !== A) { last.copy(camera.position); lastAway = A; }
    if (at === 'pier' && mine.L && mine.L.z !== z0) place(mine.L.z);   // (your car's z: B3's rooms, and so this side, are laid out about it)
    if (at === 'b3' && restr.z0 !== z0) place(restr.z0);   // (built on B3, before you'd come in any other way)
    // the exit's leaf: opening over a second, shutting a little slower
    X.open = damp(X.open, X.want, X.want ? 2.2 : 1.6, dt);
    inHinge.rotation.y = outHinge.rotation.y = -1.62 * sstep(0, 1, X.open);
    const wasCut = X.cut; X.cut = X.open > 0.5;
    if (X.cut !== wasCut) restr.sync();
    // the sky door's copy in here follows the one out there
    if (E.built && !worn) wearOut();
    skyHinge.matrix.copy(toBack).multiply(E.built ? E.hinge.matrixWorld : hinge0); skyHinge.matrixWorldNeedsUpdate = true;
    const skyOpen = E.built && E.open > 0.002, exitOpen = X.open > 0.002;
    if (at === 'pier') {
      skyP.draw({ here: F.sky, there: F.skyIn, scene: S, k: bs.look.exposure / ctx.officeExposure, open: skyOpen, prepare: () => { inside(dt, t, true); return null; } });
      if (skyOpen && E.open > 0.5 && skyP.crossed(F.sky, last, camera.position) > 0) cross(bs, toBack, yawOf(toBack));
    } else if (at === 'back') {
      inside(dt, t);
      skyBackP.draw({ here: F.skyBack, there: F.skyOut, scene: office, k: ctx.officeExposure / bs.look.exposure, open: skyOpen, far: 12000, prepare: officeLit });
      outP.draw({ here: F.exit, there: F.exit, scene: restr.scene, k: restr.look.exposure / bs.look.exposure, open: exitOpen,
        prepare: () => { const [vx, vz] = viewAt(); restr.view(vx, vz - z0, t, z0, !X.seen); X.seen = true; return lit(restr)(); } });
      if (skyOpen && E.open > 0.5 && skyBackP.crossed(F.skyBack, last, camera.position) > 0) cross(roof, toOff, -yawOf(toBack));
      else if (exitOpen && X.open > 0.5 && outP.crossed(F.exit, last, camera.position) > 0) cross(restr, new THREE.Matrix4(), 0);
    } else {   // on B3: the way back in, while it's open (and the door itself only near enough to matter: it's in a wall that's only built near you)
      const [dx, dz] = toB3(Q.x, Q.z);
      b3.visible = Math.hypot(P.x - dx, P.z - dz) < 40;
      outBackP.draw({ here: F.exitBack, there: F.exitBack, scene: S, k: bs.look.exposure / restr.look.exposure, open: exitOpen, prepare: () => { inside(dt, t, true); return lit(bs)(); } });
      if (exitOpen && X.open > 0.5 && outBackP.crossed(F.exitBack, last, camera.position) > 0) cross(bs, new THREE.Matrix4(), 0);
    }
    last.copy(camera.position);
    if (bs.on && model.shadow.shadow) { model.shadow.shadow = false; renderer.shadowMap.needsUpdate = true; }   // the model lamp's (world-edge-model.js)
  }, 192);

  // Everything in here that moves, once a frame while you're in here or looking in. Seen through a door, the model lamp's
  // shadows are drawn then (its map must have been drawn once before anything lit by it is).
  let insideAt = -1;
  function inside(dt, t, through) {
    if (insideAt === t) return;
    insideAt = t;
    gallery.fx(dt, t); flat.fx(dt, t); model.fx(dt, t); desk.fx(dt, t); doorsFx(dt, t);
    if (through && model.shadow.shadow) { model.shadow.shadow = false; renderer.shadowMap.needsUpdate = true; }
  }

  // Off B3 any way but back in here (the lift, the stone door): the helicopter's put away, as leaving the roof does.
  const restrLeave = restr.leave;
  restr.leave = () => { restrLeave(); if (!heli.stay && heli.S.free) heli.stow(); };

  // ----- the floor -----
  bs.hits = [skyHit, exitHit, ...doors.map((d) => d.hit), ...gallery.hits, ...flat.hits, ...model.hits, ...desk.hits];
  bs.enter = () => {
    place(mine.L?.z ?? restr.z0);
    bs.colliders = [...cols, ...gallery.cols, ...flat.cols, ...model.cols, ...desk.cols, ...bs.more].map((b) => boxB3(b));
    bound = boxB3({ minX: SKYAT.x - 0.3, maxX: RT[RT.length - 1][0] + 0.3, minZ: GAL.z0, maxZ: Q.z + 0.4 });
    shut();
  };
  // The doors as solid as they are: shut, a door's a wall.
  const doorCols = { sky: { minX: SKYAT.x - T, maxX: SKYAT.x + 0.05, minZ: SKYAT.z - SKY.w / 2, maxZ: SKYAT.z + SKY.w / 2 }, exit: atDoor({ minX: -EXIT.w / 2, maxX: EXIT.w / 2, minZ: -T, maxZ: 0.05 }) };
  for (const d of doors) {
    const t2 = d.across ? 0.06 : T / 2 + 0.03;
    doorCols[d.name] = d.ns ? { minX: d.x - t2, maxX: d.x + t2, minZ: d.z - d.w / 2, maxZ: d.z + d.w / 2 } : { minX: d.x - d.w / 2, maxX: d.x + d.w / 2, minZ: d.z - t2, maxZ: d.z + t2 };
  }
  function shut() {
    const n = bs.colliders.filter((b) => !b.door);
    for (const [k, b] of Object.entries(doorCols)) {
      const open = k === 'sky' ? E.open : k === 'exit' ? X.open : doorBy[k].k;
      if (open < 0.5) n.push({ ...boxB3(b), door: true });
    }
    bs.colliders = n;
  }
  bs.leave = () => {
    sound.backstage(0);
    skyBackP.hide(); outP.hide();
    // Left any way but through a door (the 3D view closing, a reload's reset): the helicopter's put away
    if (!heli.stay && lastAway === bs && ctx.away !== roof && ctx.away !== restr) heli.stow();
  };
  let bound = null;
  bs.bound = (p) => { p.x = clamp(p.x, bound.minX, bound.maxX); p.z = clamp(p.z, bound.minZ, bound.maxZ); };
  bs.ground = (x, z) => { const [lx, lz] = fromB3(x, z); return floorAt(lx, lz); };
  bs.save = () => false;   // a reload in here puts you back where it last saved you: out on the pier (systems/resume.js)
  const tvAt = new THREE.Vector3();
  bs.fx = (dt, t) => {
    shut(); corFlicker(t);
    const [px, pz] = fromB3(P.x, P.z), inFlat = px > FLAT.x0 && px < FLAT.x1 && pz > FLAT.z0 && pz < FLAT.z1;   // their TV: muffled under their door, clear through it
    sound.backstage(1, flat.tv.screen.getWorldPosition(tvAt), inFlat ? 1 : sstep(0, 0.6, doorBy.flat.k));
  };
  bs.map = () => {
    const c = ctx.mapCtx, W = 440, MH = 330, K = 9, [px, pz] = fromB3(P.x, P.z), sx = (x) => W / 2 + (x - px) * K, sz = (z) => MH / 2 + (z - pz) * K;
    c.clearRect(0, 0, W, MH);
    c.fillStyle = 'rgba(255,255,255,.14)';
    for (const r of [GAL, LOCK, FLAT, ST, ...rects.map(([x0, x1, z0, z1]) => ({ x0, x1, z0, z1 }))]) c.fillRect(sx(r.x0), sz(r.z0), (r.x1 - r.x0) * K, (r.z1 - r.z0) * K);
    c.fillStyle = 'rgba(255,255,255,.1)';
    for (const [zf] of TIERS) c.fillRect(sx(-AISLE), sz(zf), 2 * AISLE * K, 2);
    c.save(); c.translate(W / 2, MH / 2); c.rotate(-(P.yaw - YAW));
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.restore();
  };
  // On its own security camera (the gallery's, world-edge-gallery.js): no portals, the open sky door a bright blank.
  bs.cctv = {
    root, exposure: bs.look.exposure,
    stage() {
      const was = [skyBackP.mesh.visible, outP.mesh.visible, skyGlow.visible];
      skyBackP.mesh.visible = outP.mesh.visible = false; skyGlow.visible = E.open > 0.05;
      return () => { [skyBackP.mesh.visible, outP.mesh.visible, skyGlow.visible] = was; };
    },
  };

  ctx.dressBackstage?.({ bs, root, place: (z) => place(z), toB3, fromB3 });   // others' parts in here (world/secret-duct.js: the duct's grille)
  return {
    bs, gallery, flat, model, X,
    here: () => bs.on || restr.on,
    // Where a point in here would be, out in the world (the camera's, for the sea and wind through the open door); returns
    // how far it is from the sky door.
    toOffice(p) { const [x, z] = fromB3(p.x, p.z), d = Math.hypot(x - SKYAT.x, z - SKYAT.z); if (bs.on) p.applyMatrix4(toOff); return d; },
    debug: {
      bs, X, skyLeaf,
      go(x, z, yaw = 0, pitch = 0) {
        if (!ctx.mine.L) return false;
        if (ctx.away !== bs) { heli.stay = true; ctx.setFloor(bs); heli.stay = false; }
        const [wx, wz] = toB3(x, z), fy = floorAt(x, z);
        Object.assign(P, { x: wx, z: wz, yaw: yaw + YAW, pitch, fy, seated: false, seat: null, eye: 1.65 });
        ctx.setCam({ x: P.x, y: 1.65 + fy, z: P.z, yaw: P.yaw, pitch }); lastAway = null;
        return true;
      },
      b3(x, z, yaw = 0, pitch = 0) {
        if (!ctx.mine.L) return false;
        const [wx, wz] = toB3(Q.x + x, Q.z + z, mine.L.z);
        if (ctx.away !== restr) { restr.arriveAt = { x: wx, z: wz - mine.L.z }; heli.stay = true; ctx.setFloor(restr); heli.stay = false; restr.out = 1; }
        Object.assign(P, { x: wx, z: wz, yaw: yaw + YAW, pitch, fy: 0, seated: false, seat: null, eye: 1.65 });
        ctx.setCam({ x: P.x, y: 1.65, z: P.z, yaw: P.yaw, pitch }); lastAway = null;
        return true;
      },
      exit(open = true) { exitDoor(open); X.open = X.want; },
      doors: Object.fromEntries(doors.map((d) => [d.name, { d, open: (on = true) => { openDoor(d, on); d.held = on; d.k = d.want; }, rattle: () => doorClick(d) }])),
      gallery, flat, model, desk, spot, XD, ZF, YAW, get z0() { return z0; }, toB3: (x, z) => toB3(x, z), where: () => [...fromB3(P.x, P.z), P.fy],
    },
  };
}
