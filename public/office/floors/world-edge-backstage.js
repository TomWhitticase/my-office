// BEHIND THE SKY (floors/world-edge.js): through the door at the top of the stairs, a short bare concrete service corridor
// (strip lights, cable trays, an extinguisher, the stage's number stencilled on the wall) leads to the gallery: a dark
// control room round a live model of the whole world (world-edge-model.js), with a curved bank of monitors showing it
// live (world-edge-gallery.js) and an operator's console whose dials, switches and faders run the world: the time, the
// weather, the office's lights and blinds (world-edge-console.js). Off the corridor, a cramped flat where two
// people sit watching it on TV (world-edge-flat.js). The way out is a long bare concrete corridor from the gallery's back
// (two turns, 54 m: dead and flickering tubes, trays, pipes, puddles, the gallery's glow behind you) to a plain fire door
// marked EXIT, and it opens onto the restricted level (B3, restricted.js): the far wall of a dead end deep in its rooms, a
// long walk from its lift, always the same place (found from B3's fixed layout, findExit), a plain steel door with a
// handle from that side, easy to miss. It's there from the start: its own scene, a floor of its own (unlisted, carless),
// built the first time you come near that door on B3 (or are let out past the city's edge, whichever's first). The sky
// side (world-edge.js: the dome, the pier) is built only once it's needed: open the door in the sky from in here having
// come in from B3, and the helicopter's out on the pier waiting for you, as if you'd flown it there.
// Both doors are seamless (systems/portal.js): open, each shows the other side live, with its own light, and you walk
// through without a cut. This side is laid out in B3's own space, so the exit door is the same place on both sides: B3's
// wall, at the doorway, is this side's too. It's a door both ways: open or shut it from either side, come and go. The
// helicopter waits on the pier while you're in here or on B3; leave B3 by its lift (or any way but this door) and it's put
// away on its pad, and it's on the pier again whenever you open the sky door from in here.
// Debug: ctx.heli.edge.backstage: .go(x, z, yaw, pitch) stands you in here (this side's own coordinates, the exit at the
// gallery's back wall at the origin, the exit at PLAN.EXIT, B3 toward +z), .exit(open), .b3(x, z, yaw, pitch) stands you on
// B3 relative to the exit (+z out into the dead end); .gallery/.flat/.model/.desk.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, FONT, makeCanvas, mergedBoxes, sstep } from '../util.js';
import { makePortal } from '../systems/portal.js';
import { installGallery } from './world-edge-gallery.js';
import { installFlat } from './world-edge-flat.js';
import { installModel } from './world-edge-model.js';
import { installConsole } from './world-edge-console.js';

// The plan, in this side's own space: the exit's sill at the origin (B3 is +z of it), floors at y = 0.
export const PLAN = {
  T: 0.2,
  GAL: { x0: -6.6, x1: 7.4, z0: -13, z1: -0.2, h: 3.6 },        // the gallery
  COR: { x0: -17.6, x1: -6.6, z0: -7.4, z1: -5.8, h: 2.65 },    // the service corridor, from the door in the sky (x0) in to the gallery
  FLAT: { x0: -15.2, x1: -8.2, z0: -12.4, z1: -7.6, h: 2.45, door: -11.4 },   // the flat, its door on the corridor
  EXIT: { w: 1.0, h: 2.1, x: 20, z: 34 },                         // the fire door, at the far end of the long corridor
  // the long corridor from the gallery's back wall (a doorway at x = 0) to the exit: its middle line, 1.8 m wide
  LONG: { w: 1.8, h: 2.6, path: [[0, -0.2], [0, 16], [20, 16], [20, 34]] },
  TC: { x: 0, z: -6.6 },                                          // the model table's middle
};

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
  const restr = ctx.restr, { T, GAL, COR, FLAT, EXIT, LONG } = PLAN, E = edge.E, sound = edge.sound;
  const S = new THREE.Scene(), root = new THREE.Group();
  S.background = new THREE.Color('#010101');
  S.environment = office.environment;
  S.add(root);
  const bs = { n: -9, label: 'BACKSTAGE', title: 'Backstage', unlisted: true, carless: true, liftGone: true, on: false, composer: null, scene: S, root,
    colliders: [], hits: [], sound: { kind: 'backstage' }, hemi: new THREE.HemisphereLight('#c9d2e0', '#2a2622', 0.05),
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

  // ----- the rooms: concrete and paint, boxes merged by material -----
  const lists = { conc: [], dark: [], flat: [], floorC: [], floorG: [], floorF: [], ceil: [], trim: [] };
  const cols = [];   // this side's own space
  // A wall from (x0, z0) to (x1, z1) (an axis-aligned box), y0..y1; solid to walk into if it starts at the floor.
  const wallBox = (list, x0, x1, za, zb, y0, y1, c) => {
    list.push([x1 - x0, y1 - y0, zb - za, (x0 + x1) / 2, (y0 + y1) / 2, (za + zb) / 2, c]);
    if (y0 <= 0.01) cols.push({ minX: x0, maxX: x1, minZ: za, maxZ: zb });
  };
  // A wall with holes [a0, a1, top] along it (x for an east-west wall, z for a north-south one).
  function wallWith(list, ns, fixed, a0, a1, h, holes, c) {
    let at = a0;
    for (const [b0, b1, top] of [...holes].sort((p, q) => p[0] - q[0])) {
      if (b0 > at) ns ? wallBox(list, fixed - T / 2, fixed + T / 2, at, b0, 0, h, c) : wallBox(list, at, b0, fixed - T / 2, fixed + T / 2, 0, h, c);
      if (top < h) ns ? wallBox(list, fixed - T / 2, fixed + T / 2, b0, b1, top, h, c) : wallBox(list, b0, b1, fixed - T / 2, fixed + T / 2, top, h, c);
      at = b1;
    }
    if (a1 > at) ns ? wallBox(list, fixed - T / 2, fixed + T / 2, at, a1, 0, h, c) : wallBox(list, at, a1, fixed - T / 2, fixed + T / 2, 0, h, c);
  }
  const SKY = edge.DOOR;   // the door in the sky: its opening (0.92 x 2.07), in the corridor's west end
  // the gallery: north wall with the exit, the corridor's opening in the west wall, a window over the set in the south wall
  wallWith(lists.dark, false, GAL.z1 + T / 2, GAL.x0 - T, GAL.x1 + T, GAL.h, [[-LONG.w / 2, LONG.w / 2, 2.3]], '#2b2c2f');   // (the way out, at its back)
  wallWith(lists.dark, true, GAL.x0 - T / 2, GAL.z0, GAL.z1, GAL.h, [[COR.z0, COR.z1, 2.6]], '#2b2c2f');
  wallWith(lists.dark, true, GAL.x1 + T / 2, GAL.z0, GAL.z1, GAL.h, [], '#2b2c2f');
  wallWith(lists.dark, false, GAL.z0 - T / 2, GAL.x0 - T, GAL.x1 + T, GAL.h, [[-4.5, 4.5, 2.75]], '#2b2c2f');
  lists.dark.push([9, 1.0, T, 0, 0.5, GAL.z0 - T / 2, '#2b2c2f']);   // under the window
  cols.push({ minX: -4.5, maxX: 4.5, minZ: GAL.z0 - T, maxZ: GAL.z0 });
  // the corridor: the door in the sky at its west end, the flat's door in its south wall
  wallWith(lists.conc, true, COR.x0 - T / 2, COR.z0 - T, COR.z1 + T, COR.h, [[-6.6 - SKY.w / 2, -6.6 + SKY.w / 2, SKY.h]], '#77746e');
  wallWith(lists.conc, false, COR.z1 + T / 2, COR.x0 - T, COR.x1, COR.h, [], '#7a776f');
  wallWith(lists.conc, false, COR.z0 - T / 2, COR.x0 - T, COR.x1, COR.h, [[FLAT.door - 0.45, FLAT.door + 0.45, 2.05]], '#7a776f');
  // the flat
  wallWith(lists.flat, true, FLAT.x0 - T / 2, FLAT.z0 - T, FLAT.z1, FLAT.h, [], '#8f8a6e');
  wallWith(lists.flat, true, FLAT.x1 + T / 2, FLAT.z0 - T, FLAT.z1, FLAT.h, [], '#8f8a6e');
  wallWith(lists.flat, false, FLAT.z0 - T / 2, FLAT.x0, FLAT.x1, FLAT.h, [], '#8f8a6e');
  // floors and ceilings
  lists.floorG.push([GAL.x1 - GAL.x0, 0.1, GAL.z1 - GAL.z0, (GAL.x0 + GAL.x1) / 2, -0.05, (GAL.z0 + GAL.z1) / 2]);
  lists.floorC.push([COR.x1 - COR.x0 + 0.1, 0.1, COR.z1 - COR.z0, (COR.x0 + COR.x1) / 2, -0.05, (COR.z0 + COR.z1) / 2]);
  lists.floorF.push([FLAT.x1 - FLAT.x0, 0.1, FLAT.z1 - FLAT.z0 + 0.2, (FLAT.x0 + FLAT.x1) / 2, -0.05, (FLAT.z0 + FLAT.z1) / 2 + 0.1]);
  lists.ceil.push([GAL.x1 - GAL.x0 + 0.4, 0.1, GAL.z1 - GAL.z0 + 0.4, (GAL.x0 + GAL.x1) / 2, GAL.h + 0.05, (GAL.z0 + GAL.z1) / 2, '#0d0e10'],
    [COR.x1 - COR.x0 + 0.4, 0.1, COR.z1 - COR.z0 + 0.4, (COR.x0 + COR.x1) / 2, COR.h + 0.05, (COR.z0 + COR.z1) / 2, '#5f5d58'],
    [FLAT.x1 - FLAT.x0 + 0.4, 0.1, FLAT.z1 - FLAT.z0 + 0.4, (FLAT.x0 + FLAT.x1) / 2, FLAT.h + 0.05, (FLAT.z0 + FLAT.z1) / 2, '#a19b86']);

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
  const meshes = [
    mergedBoxes(lists.conc, concM), mergedBoxes(lists.dark, darkM), mergedBoxes(lists.flat, flatM),
    mergedBoxes(lists.floorC, M({ color: '#4a4b4d', map: floorT, roughness: 0.75 })), mergedBoxes(lists.floorG, M({ color: '#151618', map: floorT, roughness: 0.6, metalness: 0.2 })),
    mergedBoxes(lists.floorF, M({ color: '#5b4a3a', map: carpetT, roughness: 1 })), mergedBoxes(lists.ceil, M({ vertexColors: true })),
  ];
  for (const m of meshes) { m.castShadow = false; root.add(m); }

  // ----- the corridor's fittings: strip lights, cable trays, an extinguisher, stencils -----
  const LIT = new THREE.Color('#eef4ff').multiplyScalar(2.2);
  const fit = [], glow = [];
  for (let x = COR.x0 + 1.6; x < COR.x1; x += 3.2) {
    fit.push([0.08, 0.05, 1.3, x, COR.h - 0.03, -6.6, '#8c8f93']);
    glow.push([0.05, 0.02, 1.22, x, COR.h - 0.065, -6.6]);
  }
  for (let x = COR.x0 + 0.2; x < COR.x1; x += 2.4) fit.push([2.3, 0.02, 0.32, x + 1.15, COR.h - 0.32, COR.z1 - 0.2, '#6d7175']);   // the tray
  for (let x = COR.x0 + 0.5; x < COR.x1; x += 1.2) fit.push([0.03, 0.3, 0.03, x, COR.h - 0.17, COR.z1 - 0.04, '#5d6165']);       // its hangers
  for (let k = 0; k < 7; k++) fit.push([COR.x1 - COR.x0 - 0.3, 0.035, 0.035, (COR.x0 + COR.x1) / 2, COR.h - 0.29, COR.z1 - 0.08 - k * 0.04, ['#1d1f22', '#2c2f33', '#7a2a24', '#1d1f22', '#2a4a7a', '#1d1f22', '#d8c24a'][k]]);
  fit.push([COR.x1 - COR.x0, 0.12, 0.012, (COR.x0 + COR.x1) / 2, 0.06, COR.z1 - 0.006, '#2a2b2d'], [COR.x1 - COR.x0, 0.12, 0.012, (COR.x0 + COR.x1) / 2, 0.06, COR.z0 + 0.006, '#2a2b2d']);   // kick plates
  // the extinguisher on its bracket, its sign above
  const ext = new THREE.Group(); ext.position.set(-12.8, 0, COR.z1 - 0.12); root.add(ext);
  const red = M({ color: '#a8231c', roughness: 0.45 }), black = M({ color: '#151515', roughness: 0.6 });
  const cyl = (g, r, h, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), m); o.position.set(x, y, z); g.add(o); return o; };
  cyl(ext, 0.085, 0.5, red, 0, 0.62, 0); cyl(ext, 0.05, 0.05, black, 0, 0.9, 0); cyl(ext, 0.012, 0.12, black, 0.05, 0.93, 0).rotation.z = 1.2;
  fit.push([0.2, 0.04, 0.06, -12.8, 0.42, COR.z1 - 0.06, '#3a3c3f']);
  const tubes = mergedBoxes(fit, M({ vertexColors: true, roughness: 0.6, metalness: 0.3 })), tubeGlow = mergedBoxes(glow, new THREE.MeshBasicMaterial({ color: LIT }));
  root.add(tubes, tubeGlow);
  const decal = (w, h, draw, x, y, z, ry) => {
    const c = makeCanvas(Math.round(w * 400), Math.round(h * 400)); draw(c.ctx, c.W, c.H); c.tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: c.tex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y, z); m.rotation.y = ry; root.add(m); return m;
  };
  const stencil = (c, txt, size, col) => {
    c.font = `800 ${size}px "Arial Black", Impact, ${FONT}`; c.fillStyle = col; c.textBaseline = 'middle'; c.fillText(txt, 8, c.canvas.height / 2);
    c.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(0,0,0,${R() * 0.5})`; c.fillRect(R() * c.canvas.width, R() * c.canvas.height, 2, 2); }
    c.globalCompositeOperation = 'source-over';
  };
  decal(1.6, 0.5, (c) => stencil(c, 'STAGE 4', 150, 'rgba(232,226,210,.9)'), -16.0, 1.75, COR.z1 - 0.002, Math.PI);
  decal(1.4, 0.3, (c) => stencil(c, 'GALLERY →', 92, 'rgba(232,226,210,.8)'), -8.6, 1.55, COR.z1 - 0.002, Math.PI);
  decal(0.26, 0.26, (c, w, h) => { c.fillStyle = '#b2241b'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `700 ${w * 0.14}px ${FONT}`; c.textAlign = 'center'; c.fillText('FIRE', w / 2, h * 0.42); c.fillText('EXTINGUISHER', w / 2, h * 0.62); },
    -12.8, 1.4, COR.z1 - 0.003, Math.PI);
  // a red lamp by the gallery's way in: on while it's live (it always is)
  const onAir = decal(0.44, 0.16, (c, w, h) => { c.fillStyle = '#1a0605'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff3a2a'; c.font = `800 ${h * 0.62}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ON AIR', w / 2, h / 2 + 3); },
    -6.95, 2.35, COR.z1 - 0.012, Math.PI);
  onAir.material = new THREE.MeshBasicMaterial({ map: onAir.material.map, color: new THREE.Color(1.3, 1.3, 1.3) });

  const point = (c, i, d, x, y, z) => { const l = new THREE.PointLight(c, i, d, 1.6); l.position.set(x, y, z); root.add(l); return l; };
  // ----- the long corridor out: from the gallery's back to the exit, bare concrete, two turns -----
  const LW = LONG.w / 2, [, [, zA], [xB]] = LONG.path, zEnd = Q.z - T;   // (the path: north from the gallery, east, north to the exit)
  const longL = { walls: [], floor: [], ceil: [], fit: [], glow: [], pool: [], pipe: [], wet: [] };
  wallWith(longL.walls, true, -LW - T / 2, GAL.z1 + T, zA + LW + T, LONG.h, [], '#77746e');
  wallWith(longL.walls, true, LW + T / 2, GAL.z1 + T, zA - LW, LONG.h, [], '#7a776f');
  wallWith(longL.walls, false, zA + LW + T / 2, -LW - T, xB - LW, LONG.h, [], '#77746e');
  wallWith(longL.walls, false, zA - LW - T / 2, LW, xB + LW + T, LONG.h, [], '#7a776f');
  wallWith(longL.walls, true, xB - LW - T / 2, zA + LW, zEnd, LONG.h, [], '#7a776f');
  wallWith(longL.walls, true, xB + LW + T / 2, zA - LW - T, zEnd, LONG.h, [], '#77746e');
  wallWith(longL.walls, false, Q.z - T / 2, xB - LW - T, xB + LW + T, LONG.h, [[Q.x - EXIT.w / 2, Q.x + EXIT.w / 2, EXIT.h]], '#77746e');
  const rects = [[-LW, LW, GAL.z1, zA + LW], [LW, xB + LW, zA - LW, zA + LW], [xB - LW, xB + LW, zA + LW, zEnd]];
  for (const [x0, x1, za, zb] of rects) {
    longL.floor.push([x1 - x0, 0.1, zb - za, (x0 + x1) / 2, -0.05, (za + zb) / 2]);
    longL.ceil.push([x1 - x0 + 0.4, 0.1, zb - za + 0.4, (x0 + x1) / 2, LONG.h + 0.05, (za + zb) / 2, '#5f5d58']);
  }
  // Along each leg (a straight run from a to b, `side` the wall to the right as you walk out): tubes every 4 m down the
  // middle (every fifth dead, one flickering), a cable tray and its cables on one wall, two pipes and a conduit on the other.
  const legs = [[[0, GAL.z1 + 0.4], [0, zA]], [[0, zA], [xB, zA]], [[xB, zA], [xB, zEnd - 0.3]]];
  let tube = 0;
  const flick = { glow: [], pool: [] };
  let longFlicker = (t) => {};
  for (const [a, b] of legs) {
    const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]), len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    const rx = -dz, rz = dx, along = (d, o, y, w, h, l, c, list = longL.fit) => {   // a box d along the leg, o to the right
      const x = a[0] + dx * d + rx * o, z = a[1] + dz * d + rz * o;
      list.push(c ? [dx ? l : w, h, dx ? w : l, x, y, z, c] : [dx ? l : w, h, dx ? w : l, x, y, z]);
    };
    for (let d = 2; d < len - 0.5; d += 4, tube++) {
      const dead = tube % 5 === 3, flicker = tube === 6;
      along(d, 0, LONG.h - 0.03, 0.09, 0.05, 1.3, '#8c8f93');
      if (!dead) {
        along(d, 0, LONG.h - 0.065, 0.05, 0.02, 1.22, null, flicker ? flick.glow : longL.glow);
        along(d, 0, 0.004, 2.2, 0.002, 3.4, null, flicker ? flick.pool : longL.pool);
      } else along(d, 0, LONG.h - 0.065, 0.05, 0.02, 1.22, '#3a3c3e');   // a dead tube, grey
    }
    for (let d = 0.3; d < len; d += 2.4) along(Math.min(d + 1.15, len - 1.2), LW - 0.2, LONG.h - 0.32, 0.32, 0.02, 2.3, '#6d7175');   // the tray
    for (let k = 0; k < 6; k++) along(len / 2, LW - 0.08 - k * 0.045, LONG.h - 0.29, 0.035, 0.035, len, ['#1d1f22', '#2c2f33', '#7a2a24', '#1d1f22', '#2a4a7a', '#d8c24a'][k]);
    along(len / 2, -LW + 0.12, LONG.h - 0.14, 0.11, 0.11, len, '#4f5357', longL.pipe);   // pipes, lagged and bare
    along(len / 2, -LW + 0.28, LONG.h - 0.12, 0.07, 0.07, len, '#8a7a5a', longL.pipe);
    along(len / 2, -LW + 0.02, 1.25, 0.025, 0.025, len, '#9a9ea2');   // conduit at hand height
    for (let d = 3; d < len - 1; d += 6) along(d, -LW + 0.04, 1.25, 0.06, 0.12, 0.12, '#9a9ea2');   // and its boxes
    along(len / 2, LW - 0.006, 0.06, 0.012, 0.12, len, '#2a2b2d'); along(len / 2, -LW + 0.006, 0.06, 0.012, 0.12, len, '#2a2b2d');   // kick plates
    along(len * 0.55, -LW + 0.02, 2.0, 0.04, 0.32, 0.6, '#3d4044');   // a vent grille
    for (let k = 0; k < 5; k++) along(len * 0.55, -LW + 0.05, 1.88 + k * 0.06, 0.02, 0.012, 0.56, '#1a1b1d');
  }
  // puddles under a leaking joint or two
  for (const [x, z, r, sx] of [[0.3, 6.5, 0.55, 1.6], [-0.2, 12.2, 0.35, 1.2], [9.5, zA + 0.2, 0.7, 1.9], [14.2, zA - 0.3, 0.3, 1], [xB + 0.2, 24, 0.5, 1.5], [xB - 0.3, 30.5, 0.4, 2.1]]) {
    const g = new THREE.CircleGeometry(r, 18), pp = g.attributes.position;
    for (let i = 1; i < pp.count; i++) { const k = 0.75 + R() * 0.45; pp.setXY(i, pp.getX(i) * k * sx, pp.getY(i) * k); }
    longL.wet.push(g.rotateX(-Math.PI / 2).translate(x, 0.006, z));
  }
  {
    const vM = M({ vertexColors: true, map: concT });
    const parts = [mergedBoxes(longL.walls, vM), mergedBoxes(longL.floor, M({ color: '#4a4b4d', map: floorT, roughness: 0.75 })), mergedBoxes(longL.ceil, M({ vertexColors: true })),
      mergedBoxes(longL.fit, M({ vertexColors: true, roughness: 0.6, metalness: 0.3 })), mergedBoxes(longL.pipe, M({ vertexColors: true, roughness: 0.5, metalness: 0.5 }))];
    for (const m of parts) { m.castShadow = false; root.add(m); }
    root.add(mergedBoxes(longL.glow, new THREE.MeshBasicMaterial({ color: LIT })));
    // the light each tube throws on the floor, and the wet
    const poolT = tex(128, 128, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    const poolM = new THREE.MeshBasicMaterial({ map: poolT, color: new THREE.Color('#cfdcff').multiplyScalar(0.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pools = mergedBoxes(longL.pool, poolM); pools.layers.set(1); root.add(pools);
    const wetM = M({ color: '#08090a', roughness: 0.3, metalness: 0, envMapIntensity: 0.04, polygonOffset: true, polygonOffsetFactor: -2 });
    root.add(new THREE.Mesh(mergeGeometries(longL.wet), wetM));
    // the one that flickers
    const fG = mergedBoxes(flick.glow, new THREE.MeshBasicMaterial({ color: LIT })), fP = mergedBoxes(flick.pool, poolM.clone()); fP.layers.set(1);
    root.add(fG, fP);
    const fl = new THREE.PointLight('#e6eeff', 2.2, 9, 1.6); fl.position.copy(new THREE.Box3().setFromObject(fG).getCenter(new THREE.Vector3())).setY(LONG.h - 0.3); root.add(fl);
    longFlicker = (t) => {
      const on = Math.sin(t * 13.1) + Math.sin(t * 31.7) * 0.6 + Math.sin(t * 2.3) > 0.4 || (t % 7) < 3.5;
      fG.material.color.copy(LIT).multiplyScalar(on ? 1 : 0.08); fP.visible = on; fl.intensity = on ? 2.2 : 0.05;
    };
  }
  // the light: a tube's worth over each leg's other half, and the gallery's blue glow at its far end
  point('#e6eeff', 3.4, 11, 0, LONG.h - 0.3, 5); point('#e6eeff', 3.0, 11, 7, LONG.h - 0.3, zA); point('#e6eeff', 3.2, 11, xB, LONG.h - 0.3, 27);
  point('#7f9cff', 1.6, 7, 0, 2, GAL.z1 + 1.2);
  // two extinguishers, stencils
  for (const [x, z, ry] of [[-LW + 0.12, 9, Math.PI / 2], [xB + LW - 0.12, 20.5, -Math.PI / 2]]) {
    const e2 = new THREE.Group(); e2.position.set(x, 0, z); e2.rotation.y = ry; root.add(e2);
    cyl(e2, 0.085, 0.5, red, 0, 0.62, 0); cyl(e2, 0.05, 0.05, black, 0, 0.9, 0); cyl(e2, 0.012, 0.12, black, 0.05, 0.93, 0).rotation.z = 1.2;
    decal(0.26, 0.26, (c, w, h) => { c.fillStyle = '#b2241b'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `700 ${w * 0.14}px ${FONT}`; c.textAlign = 'center'; c.fillText('FIRE', w / 2, h * 0.42); c.fillText('EXTINGUISHER', w / 2, h * 0.62); },
      x + (ry > 0 ? -0.1 : 0.1), 1.4, z, ry);
  }
  decal(1.6, 0.5, (c) => stencil(c, 'STAGE 4', 150, 'rgba(232,226,210,.9)'), 9, 1.7, zA + LW - 0.003, Math.PI);
  decal(1.4, 0.3, (c) => stencil(c, 'EXIT →', 92, 'rgba(232,226,210,.8)'), 4.2, 1.5, zA + LW - 0.003, Math.PI);
  decal(1.5, 0.3, (c) => stencil(c, '← GALLERY', 92, 'rgba(232,226,210,.8)'), xB + LW - 0.003, 1.5, 22, -Math.PI / 2);
  decal(1.2, 0.42, (c) => stencil(c, 'S4-B', 130, 'rgba(232,226,210,.75)'), -LW + 0.003, 1.8, 3.5, Math.PI / 2);

  // ----- lights: the corridor's tubes, (the gallery and flat light themselves) -----
  point('#e6eeff', 3.2, 9, -14.8, COR.h - 0.3, -6.6); point('#e6eeff', 3.2, 9, -9.2, COR.h - 0.3, -6.6);
  point('#ff4030', 0.25, 2.5, -7.1, 2.3, -6.0);

  // ----- the door in the sky, from behind: the back of a set (battens, ply), the leaf a copy of the sky's -----
  const back = [];
  for (const z of [-6.6 - SKY.w / 2 - 0.05, -6.6 + SKY.w / 2 + 0.05]) back.push([0.06, COR.h, 0.1, COR.x0 + 0.03, COR.h / 2, z, '#6b5a43']);
  back.push([0.06, 0.1, SKY.w + 0.2, COR.x0 + 0.03, SKY.h + 0.05, -6.6, '#6b5a43']);
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
    sign.rotation.y = Math.PI / 2; sign.position.set(0.0235, LH / 2 - 0.28, 0); skyLeaf.add(sign);
  }
  // the sky door's hinge in the world while it's shut (as world-edge.js hangs it), till there's a real one to follow
  const hinge0 = new THREE.Matrix4().makeTranslation(-edge.R + 0.018, edge.LT + 0.01 + LH / 2, -LW2 / 2);
  // what the security camera in here sees through it, open (a portal has nothing to show a feed)
  const skyGlow = new THREE.Mesh(new THREE.PlaneGeometry(SKY.w, SKY.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.0, 2.6) }));
  skyGlow.rotation.y = Math.PI / 2; skyGlow.position.set(COR.x0 - 0.02, SKY.h / 2, -6.6); skyGlow.visible = false; root.add(skyGlow);

  // ----- the exit: a steel fire door in the gallery's north wall, push bar this side, a lit sign over it -----
  const exitLeafG = (withBar) => {
    const g = new THREE.Group(), steel = M({ color: '#5d6266', roughness: 0.5, metalness: 0.5 });
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(EXIT.w - 0.02, EXIT.h - 0.02, 0.05), steel);
    leaf.position.set((EXIT.w - 0.02) / 2, (EXIT.h - 0.02) / 2, 0); g.add(leaf);
    if (withBar) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(EXIT.w * 0.72, 0.06, 0.06), M({ color: '#b9bdc1', metalness: 0.8, roughness: 0.3 }));
      b.position.set(EXIT.w / 2, 1.0, -0.06); g.add(b);
      for (const x of [0.16, EXIT.w - 0.16]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.06), b.material); k.position.set(x, 1.0, -0.035); g.add(k); }
    }
    return { g, leaf };
  };
  const exitFrame = (parent, z, deep) => {   // a steel frame round the opening, on the face at z
    const f = [[0.06, EXIT.h + 0.06, deep, -EXIT.w / 2 - 0.03, (EXIT.h + 0.06) / 2, z], [0.06, EXIT.h + 0.06, deep, EXIT.w / 2 + 0.03, (EXIT.h + 0.06) / 2, z],
      [EXIT.w + 0.12, 0.06, deep, 0, EXIT.h + 0.03, z]];
    const m = mergedBoxes(f, M({ color: '#4d5256', metalness: 0.5, roughness: 0.5 })); m.castShadow = false; parent.add(m); return m;
  };
  const exitG = new THREE.Group(); exitG.position.set(Q.x, 0, Q.z); root.add(exitG);   // the exit's own space
  exitFrame(exitG, -T / 2, T + 0.02);
  const inLeaf = exitLeafG(true), inHinge = new THREE.Group(); inHinge.position.set(-EXIT.w / 2 + 0.01, 0.01, -0.03); inHinge.add(inLeaf.g); exitG.add(inHinge);
  const exitHit = ctx.hitBox(inLeaf.g, EXIT.w, EXIT.h, 0.2, EXIT.w / 2, EXIT.h / 2, -0.05, { action: 'edge-exit', reach: 2.6 });
  const exitSign = decal(0.42, 0.16, (c, w, h) => { c.fillStyle = '#0e7a3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#eaffef'; c.font = `800 ${h * 0.66}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('EXIT', w / 2, h / 2 + 3); },
    0, EXIT.h + 0.32, -T - 0.034, Math.PI);
  exitG.add(exitSign);
  exitSign.material = new THREE.MeshBasicMaterial({ map: exitSign.material.map, color: new THREE.Color(1.15, 1.15, 1.15) });
  const signBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.05), M({ color: '#d9dcd5' })); signBox.position.set(0, EXIT.h + 0.32, -T - 0.005); exitG.add(signBox);
  point('#5cff9a', 0.35, 3, Q.x, EXIT.h + 0.25, Q.z - T - 0.4);
  // and on B3: the same door from its side (frame, leaf, a plain handle), there from now on
  const b3 = new THREE.Group(); b3.position.set(XD, 0, ZF); b3.rotation.y = YAW;
  exitFrame(b3, 0.012, 0.024);
  const outLeaf = exitLeafG(false), outHinge = new THREE.Group(); outHinge.position.set(-EXIT.w / 2 + 0.01, 0.01, 0.03); outHinge.add(outLeaf.g); b3.add(outHinge);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.05), M({ color: '#b9bdc1', metalness: 0.8, roughness: 0.3 }));
  handle.position.set(EXIT.w - 0.12, 1.0, 0.05); outLeaf.g.add(handle);
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
  function exitDoor(on) {
    if (!!X.want === on) return;
    X.want = on ? 1 : 0;
    sound.bar(v3.set(...[toB3(Q.x, Q.z)].map(([x, z]) => [x, 1, z])[0]));
    if (!on) setTimeout(() => sound.clunk(v3.set(...[toB3(Q.x, Q.z)].map(([x, z]) => [x, 1, z])[0])), 900);
  }
  const v3 = new THREE.Vector3();

  // ----- the rooms' contents -----
  const gallery = installGallery(ctx, bs, PLAN);
  const flat = installFlat(ctx, bs, PLAN);
  const model = installModel(ctx, bs, PLAN, edge);
  const desk = installConsole(ctx, bs, PLAN);

  // ----- the doors' frames, and the two portals -----
  const flip = new THREE.Matrix4().makeRotationY(Math.PI);
  const F = { sky: new THREE.Matrix4(), skyIn: new THREE.Matrix4(), skyBack: new THREE.Matrix4(), skyOut: new THREE.Matrix4(), exit: new THREE.Matrix4(), exitBack: new THREE.Matrix4() };
  const toBack = new THREE.Matrix4(), toOff = new THREE.Matrix4();
  function frames() {
    // the door in the sky: in the world (edge.frame, +z west into here) and here (its sill, +z east, in from it)
    F.sky.copy(edge.frame); F.skyOut.copy(F.sky).multiply(flip);
    F.skyIn.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(COR.x0, 0, -6.6).premultiply(root.matrixWorld);
    F.skyBack.copy(F.skyIn).multiply(flip);
    toBack.copy(F.skyIn).multiply(new THREE.Matrix4().copy(F.sky).invert());   // the world's space to here
    toOff.copy(toBack).invert();
    // the exit: +z out onto B3; the same in both scenes
    F.exit.makeTranslation(Q.x, 0, Q.z).premultiply(root.matrixWorld); F.exitBack.copy(F.exit).multiply(flip);
  }
  place(0);
  const skyP = makePortal(ctx, { w: SKY.w, h: SKY.h }), outP = makePortal(ctx, { w: EXIT.w, h: EXIT.h });
  const skyBackP = makePortal(ctx, { w: SKY.w, h: SKY.h }), outBackP = makePortal(ctx, { w: EXIT.w, h: EXIT.h });
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
  // where B3's rooms are built round for the look through the exit: you, or (further back down the corridor) just inside it
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
    gallery.fx(dt, t); flat.fx(dt, t); model.fx(dt, t); desk.fx(dt, t);
    if (through && model.shadow.shadow) { model.shadow.shadow = false; renderer.shadowMap.needsUpdate = true; }
  }

  // Off B3 any way but back in here (the lift, the stone door): the helicopter's put away, as leaving the roof does.
  const restrLeave = restr.leave;
  restr.leave = () => { restrLeave(); if (!heli.stay && heli.S.free) heli.stow(); };

  // ----- the floor -----
  bs.hits = [skyHit, exitHit, ...gallery.hits, ...flat.hits, ...model.hits, ...desk.hits];
  bs.enter = () => {
    place(mine.L?.z ?? restr.z0);
    bs.colliders = [...cols, ...gallery.cols, ...flat.cols, ...model.cols, ...desk.cols].map((b) => boxB3(b));
    bound = boxB3({ minX: COR.x0 - 0.3, maxX: Math.max(GAL.x1, Q.x + LONG.w), minZ: GAL.z0, maxZ: Q.z + 0.4 });
    shut();
  };
  // The doors as solid as they are: shut, a door's a wall.
  const doorCols = { sky: { minX: COR.x0 - T, maxX: COR.x0 + 0.05, minZ: -6.6 - SKY.w / 2, maxZ: -6.6 + SKY.w / 2 }, exit: atDoor({ minX: -EXIT.w / 2, maxX: EXIT.w / 2, minZ: -T, maxZ: 0.05 }) };
  function shut() {
    const n = bs.colliders.filter((b) => !b.door);
    for (const [k, b] of Object.entries(doorCols)) if ((k === 'sky' ? E.open : X.open) < 0.5) n.push({ ...boxB3(b), door: true });
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
  // B3's space to this side's own (the inverse of toB3)
  const fromB3 = (x, z) => { const dx = x - XD, dz = z - ZF - z0; return [dx * cy - dz * sy + Q.x, dx * sy + dz * cy + Q.z]; };
  bs.ground = () => 0;
  bs.save = () => false;   // a reload in here puts you back where it last saved you: out on the pier (systems/resume.js)
  const tvAt = new THREE.Vector3();
  bs.fx = (dt, t) => { shut(); longFlicker(t); sound.backstage(1, flat.tv.screen.getWorldPosition(tvAt)); };
  bs.map = () => {
    const c = ctx.mapCtx, W = 440, MH = 330, K = 9, [px, pz] = fromB3(P.x, P.z), sx = (x) => W / 2 + (x - px) * K, sz = (z) => MH / 2 + (z - pz) * K;
    c.clearRect(0, 0, W, MH);
    c.fillStyle = 'rgba(255,255,255,.14)';
    for (const r of [GAL, COR, FLAT, ...rects.map(([x0, x1, z0, z1]) => ({ x0, x1, z0, z1 }))]) c.fillRect(sx(r.x0), sz(r.z0), (r.x1 - r.x0) * K, (r.z1 - r.z0) * K);
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

  return {
    bs, gallery, flat, model, X,
    here: () => bs.on || restr.on,
    // Where a point in here would be, out in the world (the camera's, for the sea and wind through the open door); returns
    // how far it is from the sky door.
    toOffice(p) { const [x, z] = fromB3(p.x, p.z), d = Math.hypot(x - COR.x0, z + 6.6); if (bs.on) p.applyMatrix4(toOff); return d; },
    debug: {
      bs, X, skyLeaf,
      go(x, z, yaw = 0, pitch = 0) {
        if (!ctx.mine.L) return false;
        if (ctx.away !== bs) { heli.stay = true; ctx.setFloor(bs); heli.stay = false; }
        const [wx, wz] = toB3(x, z);
        Object.assign(P, { x: wx, z: wz, yaw: yaw + YAW, pitch, fy: 0, seated: false, seat: null, eye: 1.65 });
        ctx.setCam({ x: P.x, y: 1.65, z: P.z, yaw: P.yaw, pitch }); lastAway = null;
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
      gallery, flat, model, desk, spot, XD, ZF, YAW, get z0() { return z0; },
    },
  };
}
