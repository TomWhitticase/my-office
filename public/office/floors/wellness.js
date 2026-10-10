// THE WELLNESS FLOOR (46), right under the office: the office's shell at its own height in the office's scene (so the
// city, sky and sun out of the windows are the real ones from there), laid out as a members' club. Reception and a
// towel counter at the lifts; a lap pool along the north glass with an infinity edge right against it (the glass comes
// down to the water there); the gym in the north-east corner, cardio facing the east windows; the spa in the south-east
// (a cedar sauna with a window, a steam room, an infrared cabin, a cold plunge, rain showers, a quiet lounge); two small changing rooms behind
// doors off a passage from the way through, and past them a hall with a float room, a quiet room, a treatment room and
// experience showers, and a jacuzzi on a raised deck along the west glass in the south-west corner; a juice bar on the way through; a yoga studio and a lounge of daybeds on the west windows. Partitions are travertine, oak slats on
// felt, clear or fluted glass; the doors slide open as you come up to them.
//
// This file builds the shell, floors, partitions, doors, reception and lighting, and registers the floor; the pool
// (wellness-pool.js), the gym (wellness-gym.js), the spa and its rooms (wellness-spa.js), the jacuzzi
// and float room (wellness-retreat.js) and the rest of the hall past the changing rooms (wellness-hall.js) build into the same floor
// kit, `W`, and its sounds are wellness-sound.js. X is always shown (from outside: the helicopter, the roof, the
// cameras, the pool glowing through the glass at night); G, everything inside, only while you're here.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, dash, ease, FONT, LIFT, makeCanvas, makeScreen, mat, rng, ROOM, woodTexture } from '../util.js';
import { installPool } from './wellness-pool.js';
import { installGym } from './wellness-gym.js';
import { installSpa } from './wellness-spa.js';
import { installRetreat } from './wellness-retreat.js';
import { installHall } from './wellness-hall.js';
import { makeSound } from './wellness-sound.js';

const STOREY = ROOM.h + 0.5;   // floor to floor, as the roof sits over the office
export const WELLNESS = 46;

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three gives every object a uuid from Math.random: build with a seeded one of our own, so adding this floor doesn't
  // shift the draws everything after makes in a seeded run (the harness).
  const random = Math.random;
  Math.random = rng(4646 + 46);
  try { build(ctx); } finally { Math.random = random; }
}

// Boxes, cylinders and any other geometry gathered by material and merged into one mesh each (one draw call per material).
export function kit() {
  const byM = new Map();
  const add = (m, g) => { if (!byM.has(m)) byM.set(m, []); byM.get(m).push(g); return g; };
  return {
    box(m, w, h, d, x, y, z, ry = 0, rx = 0) {
      const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); return add(m, g);
    },
    cyl(m, rt, rb, h, x, y, z, seg = 16, rx = 0, rz = 0, ry = 0) {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); return add(m, g);
    },
    geo: add,
    flush(parent, shadow = true) {
      const out = [];
      for (const [m, list] of byM) {
        const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
        mesh.castShadow = shadow && !m.transparent; mesh.receiveShadow = true; parent.add(mesh); out.push(mesh);
        for (const g of list) g.dispose();
      }
      byM.clear();
      return out;
    },
  };
}

// ----- textures -----
function travertine(R) {   // big pale limestone slabs, 1.2 by 0.6, the pores running along them
  const t = makeCanvas(1024, 1024), c = t.ctx;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) {
    const x = i * 256 + (j % 2) * 128, y = j * 128, v = R() * 10;
    for (const dx of [0, -1024]) {
      c.fillStyle = `rgb(${212 + v},${196 + v},${172 + v})`; c.fillRect(x + dx, y, 256, 128);
      for (let k = 0; k < 26; k++) {
        c.fillStyle = `rgba(${R() > 0.6 ? '160,140,110' : '250,244,232'},${0.08 + R() * 0.12})`;
        c.fillRect(x + dx + R() * 256, y + R() * 128, 8 + R() * 50, 1 + R() * 2);
      }
    }
  }
  for (let k = 0; k < 9000; k++) { c.fillStyle = `rgba(120,100,70,${R() * 0.08})`; c.fillRect(R() * 1024, R() * 1024, 1 + R() * 2, 1); }
  c.fillStyle = 'rgba(150,135,112,.6)';
  for (let j = 0; j <= 8; j++) c.fillRect(0, j * 128 - 1, 1024, 2);
  for (let j = 0; j < 8; j++) for (let i = 0; i <= 4; i++) c.fillRect(i * 256 + (j % 2) * 128 - 1, j * 128, 2, 128);
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true;
  return t.tex;   // 2.4 m square
}
function rubber(R) {   // gym flooring: charcoal with flecks, metre tiles
  const t = makeCanvas(512, 512), c = t.ctx;
  c.fillStyle = '#2a2b2d'; c.fillRect(0, 0, 512, 512);
  const fl = ['#55585d', '#6e7277', '#3b4250', '#8a8f96'];
  for (let k = 0; k < 7000; k++) { c.fillStyle = fl[Math.floor(R() * fl.length)]; c.globalAlpha = 0.25 + R() * 0.5; c.fillRect(R() * 512, R() * 512, 1 + R() * 2, 1 + R() * 2); }
  c.globalAlpha = 1; c.fillStyle = 'rgba(0,0,0,.5)';
  for (let k = 0; k <= 2; k++) { c.fillRect(k * 256 - 1, 0, 2, 512); c.fillRect(0, k * 256 - 1, 512, 2); }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true;
  return t.tex;   // 2 m square
}
function slats(R, base, gap = '#151517', n = 24) {   // vertical slats on dark felt (acoustic panels, cedar), 1 m wide
  const t = makeCanvas(256, 256), c = t.ctx, w = 256 / n;
  c.fillStyle = gap; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) {
    const [h, s, l] = base, d = (R() - 0.5) * 6;
    c.fillStyle = `hsl(${h + d * 0.4} ${s}% ${l + d}%)`; c.fillRect(i * w + w * 0.14, 0, w * 0.72, 256);
    for (let g = 0; g < 5; g++) { c.fillStyle = `rgba(60,35,15,${0.05 + R() * 0.08})`; c.fillRect(i * w + w * 0.14 + R() * w * 0.6, 0, 1, 256); }
  }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true;
  return t.tex;
}
function mosaic(R, colors, n, grout) {   // small square tiles, `n` across the texture
  const t = makeCanvas(512, 512), c = t.ctx, s = 512 / n;
  c.fillStyle = grout; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = colors[Math.floor(R() * colors.length)]; c.fillRect(i * s + 1, j * s + 1, s - 2, s - 2); }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true;
  return t.tex;
}
function fluted() {   // reeded glass: bright and dark bands across each reed
  const t = makeCanvas(128, 8), c = t.ctx, n = 8, w = 128 / n;
  for (let i = 0; i < n; i++) {
    const g = c.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(0.35, 'rgba(235,240,238,.35)'); g.addColorStop(0.8, 'rgba(170,180,178,.55)'); g.addColorStop(1, 'rgba(255,255,255,.8)');
    c.fillStyle = g; c.fillRect(i * w, 0, w, 8);
  }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true;
  return t.tex;   // 8 reeds, 0.25 m
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { world, lifts, CORE, DOOR, hitBox, carPanel, liftCore, floorSign, shellWalls, sunbeams, shaftU, WIN, ceilingM, paintIndicator, addFloor,
    mapCtx, camera, lamps, mine, plantKit, addSeat, toast } = ctx;
  const Y = (WELLNESS - 48) * STOREY, R = rng(4646);
  const G = new THREE.Group(), X = new THREE.Group();
  G.position.y = X.position.y = Y; G.visible = false; world.add(X, G);
  /** @type {{ minX: number, maxX: number, minZ: number, maxZ: number }[]} */
  const cols = [];
  const solid = (x, z, w, d) => cols.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  const floorY = { value: Y };

  // ----- materials, shared by every part of the floor -----
  const tex = { stone: travertine(R), rubber: rubber(R), oakSlat: slats(R, [30, 42, 52]), cedar: slats(R, [24, 52, 56], '#6b4128', 10), fluted: fluted(),
    wood: woodTexture() };
  const M = {
    stone: new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.42 }),
    stoneWall: new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ map: tex.rubber, roughness: 0.95 }),
    oak: new THREE.MeshStandardMaterial({ map: tex.wood, color: '#f1dcc0', roughness: 0.55 }),
    oakSlat: new THREE.MeshStandardMaterial({ map: tex.oakSlat, roughness: 0.75 }),
    cedar: new THREE.MeshStandardMaterial({ map: tex.cedar, roughness: 0.8 }),
    plaster: mat('#e8e1d4', { roughness: 0.95 }),
    brass: mat('#b8935a', { metalness: 1, roughness: 0.32 }),
    black: mat('#1b1c1e', { metalness: 0.55, roughness: 0.42 }),
    chrome: mat('#d9dde2', { metalness: 1, roughness: 0.15 }),
    leather: mat('#262321', { roughness: 0.55 }),
    linen: mat('#e6dfd3', { roughness: 1 }),
    taupe: mat('#9b8b78', { roughness: 1 }),
    towel: mat('#f6f4ef', { roughness: 1 }),
    dark: mat('#2b2c2f', { roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: '#d9ecec', transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    fluted: new THREE.MeshStandardMaterial({ map: tex.fluted, color: '#eef4f2', transparent: true, opacity: 0.85, roughness: 0.3, depthWrite: false }),
    fog: new THREE.MeshStandardMaterial({ color: '#eef3f3', transparent: true, opacity: 0.5, roughness: 0.9, depthWrite: false }),   // the steam room's (spa sets how fogged)
    mirror: new THREE.MeshStandardMaterial({ color: '#d5dce2', metalness: 0.92, roughness: 0.06, emissive: '#4c5156', emissiveIntensity: 0.35 }),
    // Warm cove light and downlights: off by day, up with the lamps at dusk (see lampK).
    cove: new THREE.MeshStandardMaterial({ color: '#fff4e2', emissive: '#ffcf96', emissiveIntensity: 0, roughness: 0.9 }),
    down: new THREE.MeshStandardMaterial({ color: '#fbf6ee', emissive: '#fff0d8', emissiveIntensity: 0, roughness: 0.9 }),
  };
  const uvWorld = (g, s, ax = 'xz') => {   // UVs from world position, `s` metres per texture repeat
    const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(n.getX(i)), nz = Math.abs(n.getZ(i));
      const u = ax === 'xz' ? p.getX(i) : nx > nz ? p.getZ(i) : p.getX(i), v = ax === 'xz' ? p.getZ(i) : p.getY(i);
      uv.setXY(i, u / s, v / s);
    }
    return g;
  };
  const W = { ctx, G, X, Y, R, cols, solid, M, tex, kit, uvWorld, hits: [], fxs: [], leaves: [], lampK: 0, dayK: 1, using: null, sound: null, F: null, seats: [] };

  // ----- the shell -----
  // As every floor's, but along the pool the north wall's upstand and sill are gone and the glass comes down to the water,
  // so swimming you look straight out (the mullions run down with it).
  const POOL_X1 = 3.6;
  {
    const k = kit();
    const { panes, outerGlassM, frameM } = shellWalls((w, h, d, x, y, z, m) => {
      if (Math.abs(z - 15) < 0.2 && w > 20 && y < 0.6) return;   // the north upstand and sill over the pool: replaced below
      if (m.isMeshBasicMaterial && Math.abs(z - 15) < 0.05 && w > 20) { k.box(m, w, 3.05 + 0.02, d, x, (3.05 - 0.02) / 2, z); return; }
      k.box(m, w, h, d, x, y, z);
    }, ceilingM, false);
    // The north run is x -20..6: glass to the floor over the pool, the usual upstand and sill east of it.
    const sillM = mat('#a87447', { roughness: 0.6 }), wallM = mat('#ece3d3', { roughness: 0.95 });
    k.box(wallM, 6 - POOL_X1, 0.45, 0.2, (6 + POOL_X1) / 2, 0.225, 15); k.box(sillM, 6 - POOL_X1, 0.04, 0.3, (6 + POOL_X1) / 2, 0.47, 14.88);
    k.box(frameM, POOL_X1 + 20, 0.05, 0.22, (POOL_X1 - 20) / 2, -0.035, 14.97);   // the infinity edge's channel, the glass standing in it
    for (let q = 0; q <= 10; q++) { const x = -20 + q * 2.6; if (x < POOL_X1) k.box(frameM, 0.08, 0.47, 0.12, x, 0.215, 15); }
    for (const mesh of k.flush(X)) { if (mesh.material === outerGlassM) mesh.castShadow = false; }
    // Sunbeams like 48's, faded at this floor's own boards.
    const shafts = sunbeams(panes, { ...shaftU, shut: { value: WIN.map(() => 0) }, floorY });
    G.add(shafts); W.shafts = shafts;
  }

  // ----- floors -----
  // Travertine everywhere but the gym (rubber), the yoga studio and the lounge (oak); the pool is a hole in it (its own basin).
  const POOL = { x0: -19.88, x1: POOL_X1, z0: 9.4, z1: 14.88 };   // inside the outer walls' line (45's walls are under it)
  W.POOL = POOL;
  {
    const k = kit();
    const plane = (m, x0, x1, z0, z1, s, y = 0) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      k.geo(m, uvWorld(g, s));
    };
    const ST = 2.4;
    // Not under the jacuzzi's deck on the west glass (x -20..-13, z -15..-9.5; wellness-retreat.js): its tub goes down
    // through where the boards would be.
    plane(M.stone, -20, 20, -9.5, POOL.z0, ST); plane(M.stone, -13, 20, -15, -9.5, ST);
    plane(M.stone, POOL.x1, 20, POOL.z0, 15, ST);
    plane(M.rubber, 6, 20, 3.5, 15, 2, 0.003);
    plane(M.oak, -20, -8, -9.5, -3.5, 4, 0.003); plane(M.oak, -20, -10.5, -3.5, 3.5, 4, 0.003);
    for (const m of k.flush(X)) { m.castShadow = false; }
  }

  // ----- partitions -----
  // [axis, fixed, from, to, kind, gaps]: along x at z = fixed, or along z at x = fixed. Each run is cut round its gaps
  // (doorways), with a header over each; glass runs get black steel rails and mullions.
  const T = 0.12, HH = ROOM.h;
  const WALLS = [
    ['x', 3.5, -20, 20, 'glass', [[-1.2, 0.6], [13.6, 15.2]]],      // the pool hall and the gym, onto the way through
    ['z', 6, 3.5, 8, 'fluted', [[4.6, 6.2]]], ['z', 6, 8, 15, 'slat'],   // gym | pool hall
    ['z', -10.5, 0.8, 3.5, 'fluted'], ['z', -10.5, -3.5, -2.2, 'fluted'],   // the lounge, screened off
    ['x', -3.5, -20, -8, 'glass', [[-12.6, -11.2]]], ['x', -3.5, -8, 4, 'stone', [[-1.3, 0.3]]], ['x', -3.5, 4, 18, 'stone', [[6.4, 8.0]]],
    ['z', -8, -15, -3.5, 'stone', [[-12.8, -11.4]]],                    // yoga and the jacuzzi | the hall past the changing rooms
    ['x', -9.5, -20, -8, 'stone'],                                      // yoga | the jacuzzi, in the south-west corner
    ['z', 4, -15, -3.5, 'stone', [[-10.65, -8.6]]],                     // the south windows | spa (2 m, south of the column's pier)
    // The changing rooms either side of the passage in from the way through (x -1.4..0.4), their doors onto the hall.
    ['x', -7, -4.6, 4, 'stone', [[-3.6, -2.6], [-1.4, 0.4], [1.6, 2.6]]], ['z', -4.6, -7, -3.5, 'stone'],
    ['z', -1.4, -7, -3.5, 'stone'], ['z', 0.4, -7, -3.5, 'stone'],
    ['x', -11, 0, 4, 'stone', [[1.2, 2.2]]], ['z', 0, -15, -11, 'stone'],   // the float room, in the hall's south-east corner
    ['x', -10.6, 15.6, 19.9, 'glass', [[17.3, 18.1]]], ['z', 15.6, -14.9, -10.6, 'cedar'],   // the sauna
    ['x', -10.6, 10.8, 15.6, 'fog', [[12.8, 13.6]]], ['z', 10.8, -14.9, -10.6, 'tile'],    // the steam room (its glass fogs up)
    ['z', 6.4, -14.9, -11.2, 'fluted'],                                 // the showers' screen
    // The hall past the changing rooms (wellness-hall.js): a quiet room on its west side (round into the corner by the
    // changing rooms), a treatment room beside it, and experience showers in bays along the south glass.
    ['x', -11.2, -8, -1.6, 'stone'], ['z', -4.6, -11.2, -7, 'stone', [[-8.4, -7.2]]],
    ['x', -8.6, -4.6, -1.6, 'stone', [[-3.4, -2.5]]], ['z', -1.6, -11.2, -8.6, 'stone'],
    // The infrared cabin (wellness-spa.js), on the spa's north wall: cedar sides, glass onto the spa, a cedar door.
    ['z', 11, -6.3, -3.5, 'cedar'], ['z', 14, -6.3, -3.5, 'cedar'], ['x', -6.3, 11, 14, 'glass', [[13.0, 13.8]]],
    ['z', -6, -14.9, -13.1, 'pale'], ['z', -4, -14.9, -13.1, 'pale'], ['z', -2, -14.9, -13.1, 'pale'],
  ];
  W.WALLS = WALLS;
  const glassRuns = [];
  {
    const k = kit(), DH = 2.25;
    const faceM = { stone: M.stoneWall, slat: M.oakSlat, cedar: M.cedar, tile: null, plaster: M.plaster };
    W.tileWallM = new THREE.MeshStandardMaterial({ color: '#3d4a4c', roughness: 0.35 });   // replaced by the spa's mosaic
    faceM.tile = W.tileWallM;
    // The hall's experience showers' pale sand mosaic, 5 cm (its own stream, so nothing after it here shifts).
    faceM.pale = W.paleTileM = new THREE.MeshStandardMaterial({ map: mosaic(rng(4655), ['#ebe6dc', '#e0d9cc', '#d6d9d6', '#e6dfd1', '#d9d2c4'], 20, '#b9b0a2'), roughness: 0.3 });
    for (const [axis, fixed, from, to, kind, gaps = []] of WALLS) {
      const at = (a, b, y0, y1, m, t = T) => {   // a box along the run from a to b, y0 to y1
        const len = b - a, mid = (a + b) / 2, h = y1 - y0, y = (y0 + y1) / 2;
        const g = axis === 'x' ? new THREE.BoxGeometry(len, h, t) : new THREE.BoxGeometry(t, h, len);
        g.translate(axis === 'x' ? mid : fixed, y, axis === 'x' ? fixed : mid);
        k.geo(m, uvWorld(g, kind === 'stone' ? 2.4 : 1, 'wall'));
      };
      const glassy = kind === 'glass' || kind === 'fluted' || kind === 'fog', paneM = { glass: M.glass, fluted: M.fluted, fog: M.fog }[kind];
      let cur = from;
      const segs = [];
      for (const [a, b] of [...gaps, [to, to]]) { if (a > cur) segs.push([cur, a]); cur = b; }
      for (const [a, b] of segs) {
        if (glassy) {
          at(a, b, 0.06, HH - 0.06, paneM, 0.02);
          at(a, b, 0, 0.06, M.black, 0.06); at(a, b, HH - 0.06, HH, M.black, 0.06);
          const n = Math.max(1, Math.round((b - a) / 1.4));
          for (let q = 0; q <= n; q++) { const u = a + (b - a) * q / n; at(u - 0.02, u + 0.02, 0, HH, M.black, 0.05); }
          glassRuns.push({ axis, fixed, a, b, kind });
        } else at(a, b, 0, HH, faceM[kind]);
        if (axis === 'x') solid((a + b) / 2, fixed, b - a, 0.16); else solid(fixed, (a + b) / 2, 0.16, b - a);
      }
      for (const [a, b] of gaps) {   // the header over a doorway
        if (glassy) { at(a, b, DH, HH - 0.06, paneM, 0.02); at(a, b, DH - 0.05, DH, M.black, 0.06); at(a, b, HH - 0.06, HH, M.black, 0.06); }
        else at(a, b, DH, HH, faceM[kind]);
      }
      // A cove of warm light along the top of the solid ones, both sides.
      if (!glassy) for (const s of [-1, 1]) for (const [a, b] of segs) {
        const g = axis === 'x' ? new THREE.BoxGeometry(b - a, 0.03, 0.05) : new THREE.BoxGeometry(0.05, 0.03, b - a);
        g.translate(axis === 'x' ? (a + b) / 2 : fixed + s * (T / 2 + 0.03), HH - 0.33, axis === 'x' ? fixed + s * (T / 2 + 0.03) : (a + b) / 2); k.geo(M.cove, g);
      }
    }
    for (const m of k.flush(X)) if (m.material === M.cove) m.castShadow = false;
  }

  // Columns where 48's stand, clad in travertine with a brass shadow gap at the foot.
  {
    const k = kit();
    for (const [x, z] of [[4, -8], [4, 8], [-9, 0.5 - 2.6]]) { k.box(M.stoneWall, 0.56, ROOM.h, 0.56, x, ROOM.h / 2, z); k.box(M.brass, 0.6, 0.04, 0.6, x, 0.02, z); solid(x, z, 0.56, 0.56); }
    // The one at (4, -8) is wrapped into the spa's wall as a thick pier, from the spa doorway's north side to the corner of
    // the changing rooms, so it stands beside the doorway rather than in it. The doorway: a dark steel frame (jambs and a
    // head under the stone header), the sliding glass door running into the pier.
    const PZ0 = -8.6, PZ1 = -7.0, PT = 0.62, D0 = -10.65, DH = 2.25;
    { const g = new THREE.BoxGeometry(PT, ROOM.h, PZ1 - PZ0); g.translate(4, ROOM.h / 2, (PZ0 + PZ1) / 2); k.geo(M.stoneWall, uvWorld(g, 2.4, 'wall')); }
    k.box(M.brass, PT + 0.04, 0.04, PZ1 - PZ0, 4, 0.02, (PZ0 + PZ1) / 2);
    for (const s of [-1, 1]) k.box(M.cove, 0.05, 0.03, PZ1 - PZ0, 4 + s * (PT / 2 + 0.03), ROOM.h - 0.33, (PZ0 + PZ1) / 2);
    solid(4, (PZ0 + PZ1) / 2, PT, PZ1 - PZ0);
    k.box(M.black, PT, 0.08, PZ0 - D0 + 0.1, 4, DH + 0.04, (D0 + PZ0) / 2);   // the head, as deep as the pier
    k.box(M.black, PT, DH, 0.05, 4, DH / 2, PZ0 - 0.025);                   // the pier's jamb
    k.box(M.black, T + 0.06, DH, 0.05, 4, DH / 2, D0 + 0.025);              // the south jamb
    k.flush(G);
  }

  // Downlights: small warm discs in the ceiling between the beams, and a lit cove round the room under the ceiling.
  {
    const k = kit();
    for (let x = -18; x <= 18; x += 2) for (let z = -13; z <= 13; z += 2.6) { if (x % 4 === 0) continue; k.cyl(M.down, 0.07, 0.07, 0.012, x, ROOM.h - 0.006, z, 14); }
    for (const [x, z, w, d] of [[0, 14.8, 39.6, 0.04], [0, -14.8, 39.6, 0.04], [-19.8, 0, 0.04, 29.6]]) k.box(M.cove, w, 0.03, d, x, ROOM.h - 0.05, z);
    for (const m of k.flush(X)) m.castShadow = false;
  }

  // ----- doors -----
  // Sliding glass leaves in the doorways that open as you come within reach and close behind you (no colliders: they're
  // always open by the time you get there). One leaf running into the wall on its -x side, or with `split` two meeting in
  // the middle and parting (where there's little wall either side); `lining` (a depth) frames a solid wall's doorway in
  // dark steel, as the spa's; `off` hangs the leaves that far in front of a glass wall on a track, clear of its panes.
  const doors = [];
  W.slidingDoor = (axis, fixed, a, b, { m = M.glass, frame = M.black, name = 'Door', split = false, lining = 0, off = 0 } = {}) => {
    const w = b - a, g = new THREE.Group(), DH = 2.25;
    g.position.set(axis === 'x' ? (a + b) / 2 : fixed, 0, axis === 'x' ? fixed : (a + b) / 2);
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    const leafOf = (lw, pull) => {   // a leaf lw wide, its pull at x = pull
      const leaf = new THREE.Group(), k = kit();
      k.box(m, lw - 0.02, DH - 0.04, 0.02, 0, DH / 2, 0);
      for (const s of [-1, 1]) k.box(frame, 0.035, DH - 0.02, 0.035, s * (lw / 2 - 0.02), DH / 2, 0);
      k.box(frame, lw, 0.035, 0.035, 0, DH - 0.02, 0); k.box(frame, lw, 0.05, 0.035, 0, 0.025, 0);
      for (const s of [-1, 1]) k.box(M.brass, 0.025, 0.7, 0.03, pull, 1.05, s * 0.04);
      k.flush(leaf, false); leaf.position.z = off; g.add(leaf);
      return leaf;
    };
    const leaves = split ? [leafOf(w / 2, w / 4 - 0.1), leafOf(w / 2, -w / 4 + 0.1)] : [leafOf(w, w / 2 - 0.12)];
    const k = kit();
    if (lining) {
      for (const s of [-1, 1]) k.box(M.black, 0.05, DH, lining, s * (w / 2 - 0.025), DH / 2, 0);
      k.box(M.black, w, 0.08, lining, 0, DH + 0.04, 0);
    }
    if (off) k.box(M.black, w * 2 + 0.1, 0.06, 0.05, split ? 0 : -w / 2, DH + 0.03, off);
    k.flush(g, false);
    G.add(g);
    const d = { name, g, leaves, w, split, k: 0, at: { x: g.position.x, z: g.position.z } };
    doors.push(d);
    return d;
  };
  W.doors = doors;
  // Hinged doors you click to open or close (the office's 'door' action), solid while shut: a leaf hinged at (hx, hz),
  // lying along angle r0 when shut and swinging `swing` (±1) a quarter turn open.
  const hinged = [];
  const doorBox = (d, open) => {
    const r = d.r0 + (open ? d.swing * Math.PI / 2 : 0), tx = d.hx + Math.cos(r) * d.W, tz = d.hz - Math.sin(r) * d.W;
    Object.assign(d.box, { minX: Math.min(d.hx, tx) - 0.04, maxX: Math.max(d.hx, tx) + 0.04, minZ: Math.min(d.hz, tz) - 0.04, maxZ: Math.max(d.hz, tz) + 0.04 });
  };
  // `win`: a small window in the leaf, [x0, x1, y0, y1] along it and up from the floor.
  W.hingedDoor = ({ name, hx, hz, r0 = 0, swing, w = 0.98, m = M.oak, win = null }) => {
    const d = { name, k: 0, to: 0, r0, swing, W: w, hx, hz, pivot: new THREE.Group(), box: {} }, DH = 2.2;
    d.pivot.position.set(hx, 0, hz); d.pivot.rotation.y = r0; G.add(d.pivot);
    const k = kit();
    if (!win) k.box(m, w - 0.02, DH, 0.045, w / 2, DH / 2 + 0.01, 0);
    else {
      const [a, b, y0, y1] = win, x0 = 0.01, x1 = w - 0.01;
      k.box(m, x1 - x0, y0 - 0.01, 0.045, (x0 + x1) / 2, (y0 + 0.01) / 2, 0); k.box(m, x1 - x0, DH + 0.01 - y1, 0.045, (x0 + x1) / 2, (y1 + DH + 0.01) / 2, 0);
      k.box(m, a - x0, y1 - y0, 0.045, (x0 + a) / 2, (y0 + y1) / 2, 0); k.box(m, x1 - b, y1 - y0, 0.045, (b + x1) / 2, (y0 + y1) / 2, 0);
      k.box(M.glass, b - a, y1 - y0, 0.012, (a + b) / 2, (y0 + y1) / 2, 0);
    }
    for (const s of [-1, 1]) { k.box(M.brass, 0.025, 0.42, 0.025, w - 0.12, 1.05, s * 0.05); k.box(M.brass, 0.025, 0.025, 0.05, w - 0.12, 1.24, s * 0.035); }
    k.flush(d.pivot);
    W.hits.push(hitBox(d.pivot, w, DH, 0.12, w / 2, DH / 2, 0, { action: 'door', door: d, reach: 3.2 }));
    doorBox(d, false); cols.push(d.box); hinged.push(d);
    return d;
  };
  W.hinged = hinged;
  for (const [axis, fixed, a, b] of [['x', 3.5, 13.6, 15.2], ['z', 6, 4.6, 6.2], ['x', -3.5, -12.6, -11.2], ['z', -8, -12.8, -11.4], ['z', 4, -10.65, -8.6]]) W.slidingDoor(axis, fixed, a, b);
  // The rest of the doorways: a pair parting in the pool hall's glass (hung on its side of it), a pair at each end of the
  // passage between the changing rooms (whose doors leave no room for one leaf to run into the wall), the spa's from the
  // way through.
  W.slidingDoor('x', 3.5, -1.2, 0.6, { split: true, off: 0.07 });
  W.slidingDoor('x', -3.5, -1.3, 0.3, { split: true, lining: T + 0.06 }); W.slidingDoor('x', -7, -1.4, 0.4, { split: true, lining: T + 0.06 });
  W.slidingDoor('x', -3.5, 6.4, 8.0, { lining: T + 0.06 });
  W.slidingDoor('z', -4.6, -8.4, -7.2, { m: M.fluted, lining: T + 0.06 });   // the quiet room
  function doorFx(dt) {
    const p = ctx.player;
    for (const d of doors) {
      const near = Math.hypot(p.x - d.at.x, p.z - d.at.z) < 2.1, was = d.k;
      d.k = clamp(d.k + (near ? dt : -dt) / 0.7, 0, 1);
      if ((was === 0 && d.k > 0) || (was === 1 && d.k < 1)) W.sound?.door(d.at);
      const e = ease(d.k);
      if (d.split) { d.leaves[0].position.x = -d.w / 4 - e * (d.w / 2 - 0.06); d.leaves[1].position.x = d.w / 4 + e * (d.w / 2 - 0.06); }
      else d.leaves[0].position.x = -e * (d.w - 0.08);
    }
    for (const d of hinged) {
      if (d.k === d.to) continue;
      const was = d.k;
      d.k = d.to > d.k ? Math.min(1, d.k + dt / 0.9) : Math.max(0, d.k - dt / 0.9);
      d.pivot.rotation.y = d.r0 + d.swing * ease(d.k) * Math.PI * 0.5;
      doorBox(d, d.k > 0.85);
      const mid = { x: d.hx + Math.cos(d.r0) * d.W / 2, z: d.hz - Math.sin(d.r0) * d.W / 2 };
      if (was === 0) W.sound?.latch(mid.x, 1.1, mid.z, true);
      if (d.k === 0) W.sound?.latch(mid.x, 1.1, mid.z, false);
      if (d.k < 0.85 && d.to === 0) ctx.collide(p);
    }
  }

  // ----- reception -----
  // A long travertine desk with an oak top and a brass kick, facing the lifts across the lobby; behind it, a backlit oak
  // slat wall with the club's name and the towel counter's shelves.
  {
    const k = kit(), DX0 = 12.0, DX1 = 15.6, DZ = -1.85;
    k.box(M.stoneWall, DX1 - DX0, 1.02, 0.62, (DX0 + DX1) / 2, 0.53, DZ);
    k.box(M.oak, DX1 - DX0 + 0.1, 0.05, 0.78, (DX0 + DX1) / 2, 1.075, DZ - 0.06);
    k.box(M.brass, DX1 - DX0 - 0.1, 0.06, 0.6, (DX0 + DX1) / 2, 0.03, DZ + 0.02);
    k.box(M.oak, DX1 - DX0 - 0.2, 0.04, 0.5, (DX0 + DX1) / 2, 0.76, DZ - 0.5);   // the work surface behind
    solid((DX0 + DX1) / 2, DZ - 0.1, DX1 - DX0 + 0.1, 0.85);
    // Back wall: oak slats with a lit name, shelves of rolled towels either side.
    k.box(M.oakSlat, 6.4, 2.6, 0.04, 13.8, 1.3 + 0.02, -3.42);
    k.box(M.cove, 6.4, 0.02, 0.04, 13.8, 2.64, -3.38);
    for (const x of [11.25, 16.35]) for (let y = 0.5; y < 2.3; y += 0.42) k.box(M.oak, 1.1, 0.035, 0.36, x, y, -3.25);
    // A monitor and an orchid on the desk, a brass bell.
    k.box(M.black, 0.5, 0.32, 0.02, 14.6, 1.33, DZ - 0.25); k.box(M.black, 0.04, 0.2, 0.04, 14.6, 1.15, DZ - 0.26);
    k.cyl(M.brass, 0.05, 0.06, 0.05, 12.6, 1.125, DZ + 0.05, 16);
    k.cyl(M.linen, 0.07, 0.06, 0.12, 13.1, 1.16, DZ - 0.05, 16);
    k.flush(G);
    const sign = makeCanvas(512, 128), c = sign.ctx;
    c.clearRect(0, 0, 512, 128); c.fillStyle = '#e9cf98'; c.font = `300 76px ${FONT}`; c.textAlign = 'center'; c.fillText('A U R A', 256, 82);
    c.font = `500 18px ${FONT}`; c.fillStyle = '#d9c39a'; c.fillText('W E L L N E S S   ·   4 6', 256, 116); sign.tex.needsUpdate = true;
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: sign.tex, transparent: true, emissive: '#ffd9a0', emissiveMap: sign.tex,
      emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.6, depthWrite: false }));
    sm.position.set(13.8, 1.9, -3.39); G.add(sm); W.signM = sm.material;
    // Rolled towels on the shelves: one instanced mesh.
    const roll = new THREE.CylinderGeometry(0.07, 0.07, 0.34, 12); roll.rotateX(Math.PI / 2);
    const towels = new THREE.InstancedMesh(roll, M.towel, 96), m4 = new THREE.Matrix4();
    let n = 0;
    for (const x0 of [10.8, 15.9]) for (let y = 0.5; y < 2.3; y += 0.42) for (let i = 0; i < 6 && n < 96; i++) {
      m4.makeTranslation(x0 + i * 0.15 + (R() - 0.5) * 0.01, y + 0.09, -3.25); towels.setMatrixAt(n++, m4);
      if (i % 2 === 0 && n < 96 && y < 2) { m4.makeTranslation(x0 + i * 0.15 + 0.075, y + 0.215, -3.25); towels.setMatrixAt(n++, m4); }
    }
    towels.count = n; towels.castShadow = false; G.add(towels);
    const hit = hitBox(G, 1.2, 1.9, 0.4, 16.35, 1.35, -3.25, { action: 'wellness-towel', reach: 3.2 });
    W.hits.push(hit);
    const hit2 = hitBox(G, 1.2, 1.9, 0.4, 11.25, 1.35, -3.25, { action: 'wellness-towel', reach: 3.2 });
    W.hits.push(hit2);
  }
  let towelsTaken = 0;
  ctx.action('wellness-towel', {
    hover: () => `<b>Towel service</b><div class="k">${towelsTaken ? `You have ${towelsTaken === 1 ? 'a towel' : `${towelsTaken} towels`} · click for another` : 'Click for a fresh towel'}</div>`,
    click: () => { towelsTaken++; W.sound?.towel(); toast(towelsTaken === 1 ? 'A fresh towel, warm from the press' : towelsTaken < 4 ? 'Another towel' : 'That’s a lot of towels'); },
  });

  // Plants in pale stone planters: their leaves in the office's one instanced kit (world positions, so at this floor's height).
  // Each leaf is kept on the planter's side of the partitions and windows near it: a card that would reach through one is
  // turned back toward the room, and failing that drawn in and made smaller (no draws, so nothing after it shifts).
  const planes = [...WALLS.map(([axis, fixed, from, to]) => ({ n: axis === 'x' ? 'z' : 'x', at: fixed, a: from, b: to, half: T / 2 + 0.03 })),
    ...[-20, 20].map((at) => ({ n: 'x', at, a: -15, b: 15, half: 0.15 })), ...[-15, 15].map((at) => ({ n: 'z', at, a: -20, b: 20, half: 0.15 }))];
  const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0), XV = new THREE.Vector3(1, 0, 0);
  const pts = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3());
  const leafPts = (P, D, sx, sy, roll, droop) => {   // as plantKit's add lays a card out: corners at its foot, middle and tip
    by.copy(D).normalize(); bx.crossVectors(by, Math.abs(by.y) > 0.99 ? XV : UPV).normalize(); bz.crossVectors(bx, by);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    [[-0.5, 0], [0.5, 0], [-0.5, 0.5], [0.5, 0.5], [-0.5, 1], [0.5, 1]].forEach(([u, v], i) => {
      const lx = u * sx, lz = -droop * v * v * sy;
      pts[i].copy(P).addScaledVector(bx, lx * cr + lz * sr).addScaledVector(by, v * sy).addScaledVector(bz, -lx * sr + lz * cr);
    });
    return pts;
  };
  const fitLeaf = (cx, cz, L) => {   // L: { P, D, sx, sy, roll, droop }, changed in place; false if it can't be made to fit
    const near = planes.filter((q) => Math.abs((q.n === 'x' ? cx : cz) - q.at) < 1.6 && (q.n === 'x' ? cz : cx) > q.a - 1.6 && (q.n === 'x' ? cz : cx) < q.b + 1.6);
    for (let i = 0; i < 8; i++) {
      let bad = null;
      for (const p of leafPts(L.P, L.D, L.sx, L.sy, L.roll, L.droop)) for (const q of near) {
        const along = q.n === 'x' ? p.z : p.x, side = Math.sign((q.n === 'x' ? cx : cz) - q.at);
        if (along > q.a - 0.05 && along < q.b + 0.05 && side * (p[q.n] - q.at) < q.half) { bad = q; break; }
      }
      if (!bad) return true;
      const side = Math.sign((bad.n === 'x' ? cx : cz) - bad.at);
      if (L.D[bad.n] * side < 0) L.D[bad.n] = -L.D[bad.n];
      else { L.P.x += (cx - L.P.x) * 0.5; L.P.z += (cz - L.P.z) * 0.5; L.sx *= 0.85; L.sy *= 0.85; }
    }
    return false;
  };
  W.planter = (x, z, s = 1, round = true) => {
    const k = kit();
    if (round) k.cyl(M.stoneWall, 0.3 * s, 0.24 * s, 0.6 * s, x, 0.3 * s, z, 20); else k.box(M.stoneWall, 0.56 * s, 0.6 * s, 0.56 * s, x, 0.3 * s, z);
    k.cyl(mat('#3b2c22', { roughness: 1 }), 0.27 * s, 0.27 * s, 0.02, x, 0.6 * s, z, 12);
    k.flush(G);
    const { twig, strap, stem, add: put } = plantKit(), P = new THREE.Vector3(), D = new THREE.Vector3(), c = new THREE.Color(), soil = Y + 0.6 * s;
    const add = (im, P, D, sx, sy, roll, color) => {
      if (im === stem) { put(im, P, D, sx, sy, roll, color); return; }
      const L = { P, D, sx, sy, roll, droop: im === twig ? 0.35 : 0.15 };
      if (fitLeaf(x, z, L)) put(im, L.P, L.D, L.sx, L.sy, L.roll, color);
    };
    if (R() < 0.5) {
      for (let i = 0; i < 16; i++) {   // a tall bird of paradise / snake plant: upright straps
        const a = i * 2.4 + R(), r = R() * 0.14 * s, h = (0.9 + R() * 0.6) * s;
        P.set(x + Math.cos(a) * r, soil, z + Math.sin(a) * r); D.set(Math.cos(a) * (0.1 + R() * 0.25), 1, Math.sin(a) * (0.1 + R() * 0.25));
        add(strap, P, D, h * 0.45, h, R() * 3, c.setRGB(0.75 + R() * 0.2, 1, 0.8 + R() * 0.2));
      }
    } else {
      // An olive-ish tree: the trunk up into a crown of twigs, held on six branches from its top (as 48's plants are).
      const top = soil + 1.1 * s;
      add(stem, P.set(x, soil, z), D.set(0, 1, 0), 0.03 * s, top - soil);
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + 0.4, q = new THREE.Vector3(x + Math.cos(a) * 0.32 * s, top + (0.08 + (i % 3) * 0.14) * s, z + Math.sin(a) * 0.32 * s);
        P.set(x, top - 0.12 * s, z); D.subVectors(q, P); add(stem, P, D, 0.014 * s, D.length());
      }
      for (let i = 0; i < 80; i++) {
        const u = R() * 2 - 1, a = R() * Math.PI * 2, kk = Math.sqrt(1 - u * u), f = 0.4 + R() * 0.6, cr = 0.5 * s, cy = soil + 1.25 * s;
        D.set(Math.cos(a) * kk, u * 0.7 + 0.3, Math.sin(a) * kk);
        P.set(x + D.x * cr * f * 0.8, cy + D.y * cr * f * 0.8, z + D.z * cr * f * 0.8);
        D.y += 0.3;
        const h = (0.3 + R() * 0.15) * s;
        add(twig, P, D, h * 0.9, h, (R() - 0.5) * 1.2, c.setRGB(0.7 + R() * 0.15, 0.85 + R() * 0.1, 0.65 + R() * 0.15));
      }
    }
    solid(x, z, 0.62 * s, 0.62 * s);
  };
  for (const [x, z, s] of [[16.9, -3.0, 1.1], [11.0, 3.0, 1.0], [5.3, 3.0, 0.9], [-9.9, 3.0, 1.0], [5.3, -3.0, 0.9]]) W.planter(x, z, s);

  // Seats on this floor: as the office's, but only offered here (st.floor).
  W.seat = (g, name, lx, eye) => { const st = addSeat(g, name, lx, eye); st.floor = WELLNESS; W.seats.push(st); return st; };
  W.markSeat = (g, st) => g.traverse((o) => { if (o.isMesh) o.userData.seat = st; });

  // ----- using things -----
  // One thing at a time (a treadmill, a set of curls, the plunge pool…): W.use(act) puts you on it, W.stop() takes you off
  // (moving away, Esc, letting go of the mouse, clicking it again, or taking the lift). act: { name, start(), fx(dt, t),
  // key(e) → true if it took the key, stop() }. Movement keys it doesn't take step you off and walk on.
  W.use = (act) => { if (W.using === act) { W.stop(); return; } W.stop(); W.using = act; act.start?.(); };
  W.stop = () => { const a = W.using; if (!a) return; W.using = null; a.stop?.(); };
  const MOVES = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Escape', 'KeyE'];
  for (const code of MOVES) ctx.key(code, (e) => {
    if (ctx.away !== W.F || !W.using) return false;
    if (W.using.key?.(e)) return true;
    W.stop();
    return code === 'Escape' || code === 'KeyE' || code === 'Space';
  });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && W.using) W.stop(); });
  W.fxs.push((dt, t) => W.using?.fx?.(dt, t));
  // Where your eyes are while you're on something: eased from standing to `eye` (over the boards) as you get on, and the
  // bob it adds; applied after you've been placed for the frame (movePlayer), like the lift's sway.
  W.lift = { k: 0, eye: ctx.player?.eye ?? 1.65, bob: 0, roll: 0, dx: 0, dz: 0 };
  W.fxs.push((dt) => {
    const L = W.lift, on = !!W.using;
    L.k = clamp(L.k + (on ? dt : -dt) / 0.5, 0, 1);
    if (!L.k) return;
    const e = ease(L.k), cam = ctx.camera;
    cam.position.y += (L.eye - 1.65) * e + L.bob * e;
    cam.position.x += L.dx * e; cam.position.z += L.dz * e;
    cam.rotation.z += L.roll * e;
  });
  // A small screen on a machine (its console), facing -x (toward you, on the cardio row) unless turned.
  W.screen = (parent, w, h, x, y, z, ry = -Math.PI / 2, px = 256) => {
    const s = makeScreen(parent, w, h, px, Math.round(px * h / w), x, y, z);
    s.mesh.rotation.y = ry; return s;
  };

  // ----- lighting -----
  // By day the windows light it. From dusk (with the lamps), the coves and downlights glow and four warm lights fill the
  // lobby, the pool hall, the gym and the spa; the hemisphere light is lifted a little so the rooms read as lit, not as
  // the office's night through the glass. The four are the office's own lamp lights, borrowed while you're here (48's
  // lamps are off down here anyway) and put back as you leave: lights of the floor's own would cost every material in
  // the office a little more each frame, here or not.
  const FILLS = [[14, 2.9, 0, '#ffd7a8', 9], [-8, 2.9, 6.5, '#ffdcb4', 14], [13, 2.9, 9, '#fff0de', 11], [9, 2.9, -8, '#ffd2a0', 9]];
  let borrowed = [];
  const borrow = () => {
    borrowed = lamps.filter((l) => l.light).slice(0, FILLS.length).map(({ light }, i) => {
      const [x, y, z, c, base] = FILLS[i], was = { light, pos: light.position.clone(), color: light.color.clone(), distance: light.distance, base };
      light.position.set(x, Y + y, z); light.color.set(c); light.distance = 18;
      return was;
    });
  };
  const giveBack = () => { for (const b of borrowed) { b.light.position.copy(b.pos); b.light.color.copy(b.color); b.light.distance = b.distance; } borrowed = []; };

  // ----- the parts -----
  W.sound = makeSound(ctx, W);
  installPool(ctx, W);
  installGym(ctx, W);
  installSpa(ctx, W);
  installRetreat(ctx, W);
  installHall(ctx, W);

  // ----- the lift core -----
  const core = liftCore(G, lifts.map((L) => L.z));
  solid((LIFT.x + CORE.x1) / 2, (CORE.z0 + CORE.z1) / 2, CORE.x1 - LIFT.x, CORE.z1 - CORE.z0);
  floorSign(G, WELLNESS, () => ['Aura · Wellness', 'Gym · Pool · Spa · Members only']).paint();
  const cars = core.cars.map((c) => ({ ...c, lantern: { ind: c.ind, floor: 48, dir: 0 } }));
  const callHit = hitBox(G, 0.06, 0.42, 0.22, LIFT.x - 0.03, 1.1, LIFT.z, { action: 'liftcall', reach: 2.5 });
  const panel = carPanel(G, 0);   // one, moved into your car (see enter)

  // ----- the floor -----
  const WARM = new THREE.Color('#ffe3c4');
  const F = /** @type {import('../ctx.js').Floor} */ ({ n: WELLNESS, label: 'WELLNESS', title: 'Wellness', blurb: 'Gym · Pool · Spa', y: Y,
    sound: { kind: 'wellness', steps: true }, hits: [callHit, panel.mesh, ...W.hits] });
  W.F = F;
  Object.defineProperty(F, 'colliders', { get: () => W.colliders(), enumerable: true });
  // While you're here the office's own things (its rooms, furniture and people, all on and above 48's boards inside the
  // tower) are behind this floor's ceiling, but they'd still be drawn: skip them, for this view's renders only, so
  // nothing else's idea of what's shown is touched. The city, the stand-ins below and the plants' shared kit stay.
  const overhead = [], skipped = [], box3 = new THREE.Box3();
  const findOverhead = () => {
    overhead.length = 0;
    for (const o of world.children) {
      if (o === X || o === G || o.isLight || !o.visible) continue;
      box3.setFromObject(o);
      if (!box3.isEmpty() && box3.min.y > -0.6 && box3.min.x > -21 && box3.max.x < 21 && box3.min.z > -16 && box3.max.z < 16) overhead.push(o);
    }
  };
  const { scene } = ctx, before = scene.onBeforeRender, after = scene.onAfterRender;
  scene.onBeforeRender = (...a) => {
    before.apply(scene, a);
    if (!F.on || a[2] !== camera) return;
    for (const o of overhead) if (o.visible) { o.visible = false; skipped.push(o); }
  };
  scene.onAfterRender = (...a) => { for (const o of skipped) o.visible = true; skipped.length = 0; after.apply(scene, a); };
  F.enter = (z) => {
    G.visible = true; panel.moveTo(z); borrow(); findOverhead();
    if (ctx.underPool) ctx.underPool.visible = false;   // 45's ceiling, which the pool's basin reaches down into
    W.inside = 1;
  };
  F.leave = () => {
    W.stop?.();
    for (const f of W.leaves) f();
    W.veil('transparent', 0);
    G.visible = false; W.inside = 0; giveBack();
    if (ctx.underPool) ctx.underPool.visible = true;
    W.sound.stop();
  };
  F.bound = (p) => { p.x = clamp(p.x, ROOM.minX + 0.4, ROOM.maxX - 0.4); p.z = clamp(p.z, ROOM.minZ + 0.4, ROOM.maxZ - 0.4); };
  F.save = () => (W.using ? false : null);   // on a machine, in the plunge or the pod: a reload stands you where you got on (resume.js)
  F.restore = (s, p) => { if (W.swim && W.inPool(p.x, p.z)) W.swim.in = true; };   // swimming: the pool's sides are what you can't pass
  F.ground = (x, z) => W.ground(x, z);
  F.pace = (x, z) => W.pace(x, z);
  F.fx = (dt, t) => {
    // Your car's doors open here; the other stays shut. Each lantern shows where its car is.
    lifts.forEach((L, i) => {
      const e = L === mine.L ? ease(L.doorK) : 0;
      cars[i].leaves.forEach((m, k) => { m.position.z = L.z + (k ? 1 : -1) * (DOOR.w / 4 + e * DOOR.w * 0.48); });
      Object.assign(cars[i].lantern, { floor: L.floor, dir: L.dir }); paintIndicator(cars[i].lantern);
    });
    core.callM.emissiveIntensity = mine.L?.state === 'opening' ? 2.5 : 0;
    W.shafts.visible = ctx.quality;
    for (const l of lamps) if (l.light) l.light.intensity = 0;   // 48's lamps don't shine down through the slab
    for (const b of borrowed) b.light.intensity = b.base * W.lampK;
    // A touch more sky light indoors at night, warm, so the rooms read as lit.
    ctx.hemi.intensity += 0.35 * W.lampK; ctx.hemi.color.lerp(WARM, 0.3 * W.lampK);
    doorFx(dt);
    W.wantVeil = null;
    for (const f of W.fxs) f(dt, t);
    if (W.wantVeil) W.veil(...W.wantVeil); else W.veil('transparent', 0);
    W.sound.fx(dt, t);
  };
  F.map = () => drawMap();
  // On the security cameras (systems/cctv.js; the reception, the pool, the gym and the way through, never the changing
  // rooms, the sauna, the steam room or the float room): while you're elsewhere a feed's shot shows the floor, lit as
  // you'd see it here, without the office overhead.
  let overN = -1;
  F.cctv = {
    root: G,
    stage() {
      if (F.on) return () => {};
      if (world.children.length !== overN) { overN = world.children.length; findOverhead(); }
      const hid = overhead.filter((o) => o.visible), lit = lamps.map((l) => l.light?.intensity), hemi = [ctx.hemi.intensity, ctx.hemi.color.clone()];
      for (const o of hid) o.visible = false;
      const under = ctx.underPool?.visible;
      G.visible = true; borrow();
      if (ctx.underPool) ctx.underPool.visible = false;
      for (const l of lamps) if (l.light) l.light.intensity = 0;
      for (const b of borrowed) b.light.intensity = b.base * W.lampK;
      ctx.hemi.intensity += 0.35 * W.lampK; ctx.hemi.color.lerp(WARM, 0.3 * W.lampK);
      return () => {
        lamps.forEach((l, i) => { if (l.light) l.light.intensity = lit[i]; });
        ctx.hemi.intensity = hemi[0]; ctx.hemi.color.copy(hemi[1]);
        giveBack(); G.visible = false;
        if (ctx.underPool) ctx.underPool.visible = under;
        for (const o of hid) o.visible = true;
      };
    },
  };
  addFloor(F);

  // Every frame, here or not: the lamps' level (for the coves, the fills and the pool's lights, seen from outside too)
  // and the water's clock.
  ctx.onFrame((dt, t) => {
    const o = dash.office || {}, to = (o.lights === 'on' ? 1 : o.lights === 'off' ? 0 : 1 - ctx.daylight) * (o.brightness ?? 1);
    W.lampK += (to - W.lampK) * Math.min(1, dt * 3);
    W.dayK = ctx.daylight;
    M.cove.emissiveIntensity = 1.4 * W.lampK; M.down.emissiveIntensity = 1.1 * W.lampK; W.signM.emissiveIntensity = 0.35 + 0.9 * W.lampK;
    W.tick?.(dt, t);
  }, 55);

  function drawMap() {
    const c = mapCtx, Wd = 440, H = 330, sx = (x) => ((x - ROOM.minX) / 40) * Wd, sz = (z) => ((z - ROOM.minZ) / 30) * H;
    c.clearRect(0, 0, Wd, H);
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 3; c.strokeRect(sx(-19.9), sz(-14.9), sx(19.9) - sx(-19.9), sz(14.9) - sz(-14.9));
    c.fillStyle = 'rgba(80,190,200,.45)'; c.fillRect(sx(POOL.x0), sz(POOL.z0), sx(POOL.x1) - sx(POOL.x0), sz(POOL.z1) - sz(POOL.z0));
    c.fillStyle = 'rgba(255,255,255,.22)';
    for (const b of W.colliders()) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(2, sx(b.maxX) - sx(b.minX)), Math.max(2, sz(b.maxZ) - sz(b.minZ)));
    c.font = '600 16px system-ui'; c.fillStyle = 'rgba(255,255,255,.6)';
    for (const [t, x, z] of [['Pool', -9, 12.6], ['Gym', 11, 7], ['Sauna', 16.3, -13], ['Steam', 11.7, -13], ['Spa', 8, -8], ['Changing', -4.4, -5.2], ['Jacuzzi', -19, -13.6], ['Float', 1.0, -13.4], ['Quiet', -7.6, -8.6], ['Treatment', -4.5, -9.6], ['Infrared', 11.1, -4.3], ['Showers', -6.6, -14.0],
      ['Yoga', -16, -6.8], ['Lounge', -18.5, 0.6], ['Juice bar', -6.5, 0.6], ['Reception', 12.2, 0.6]]) c.fillText(t, sx(x), sz(z));
    c.font = '600 15px system-ui'; c.fillText('Lifts', sx(LIFT.x) - 44, sz(-2.6));
    const px = sx(camera.position.x), pz = sz(camera.position.z);
    c.save(); c.translate(px, pz); c.rotate(-camera.rotation.y);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }
  Object.assign(ctx, { wellness: W });
}
