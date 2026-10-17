// THE RESTRICTED LEVEL (B3): below the archive, behind an access code on the car panel. Mustard wallpaper, damp carpet and
// buzzing strip lights in rooms that go on for ever, generated round you a chunk at a time from a fixed seed, so the
// same doorway is always in the same place. The cameras down here never show anything; Rosie and John know nothing.
// Its own scene, drawn by renderFloor. The code is on a sticky note in the office (see installNote).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, fit, FONT, LIFT, makeCanvas, MARKER, rng } from '../util.js';
import { MONO } from '../painters.js';
import { makeSound } from './restricted-sound.js';
import { installStory } from './restricted-story.js';
import { installCreature } from './restricted-creature.js';
import { wornPaths, wear } from './restricted-paths.js';
import { makeWarps } from './restricted-warps.js';
import { findExit } from './world-edge-backstage.js';
import { makeWarm } from '../systems/warm.js';

const N = -3, CODE = '1408';   // asked for every time: never remembered
// The grid: cells of C metres, CH x CH to a chunk; walls on the cells' edges. Cell (i, j) is x GX + i C .. + C,
// z GZ + j C .. + C in the floor's own space (the car at z = 0): the lift fills cell (-1, 0), an alcove at the end of a
// long corridor running west. Past LIM cells out the rooms simply stop.
const C = 3.2, CH = 4, CW = C * CH, H = 2.75, T = 0.16, LIM = 56;
const GX = LIFT.x + 2.6, GZ = -C / 2;
const LOAD = 30, DROP = 42;   // metres from you to a chunk's edge: built inside LOAD, dropped past DROP
const WP = 0.8;               // the wallpaper's repeat, metres
const OPEN = 0, SOLID = 1, DOORWAY = 2, WIDE = 3, AJAR = 5;
const NLIGHTS = 6;

// A hash of three integers to [0, 1): the whole layout comes from it.
function h3(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const cellOk = (i, j) => Math.abs(i) <= LIM && Math.abs(j) <= LIM;
const darkPatch = (i, j) => h3(Math.floor(i / 4), Math.floor(j / 4), 77) < 0.1;
// Blocks of B x B cells (19 m), each one thing: a pillared hall, a big empty room (or two), a block crossed by a long
// corridor (lined up with its neighbours', so they run on for blocks), or a few narrow strips with dead ends. Blocks
// meet in a wall with a doorway or two in it, or none at all between two halls. The lift's block is a corridor, so you
// step out into one. Block (bi, bj) is cells bi B .. + B - 1 and bj B - 2 .. + B - 3 (so the lift's row is its third).
const B = 6, JOFF = 2;
const blocks = new Map();
function block(bi, bj) {
  const k = `${bi},${bj}`;
  let b = blocks.get(k);
  if (b) return b;
  const lift = bj === 0 && bi >= -3 && bi <= -1;   // the first 57 m west from the lift: one long corridor
  const r = h3(bi, bj, 40), along = lift || h3(bi, bj, 41) < 0.6 ? 'x' : 'z';
  const type = lift ? 'corr' : r < 0.16 ? 'hall' : r < 0.55 ? 'room' : r < 0.87 ? 'corr' : 'strips';
  b = { type, along,
    // a corridor's row (along x) is shared by every block in its row of blocks, its column (along z) likewise
    line: along === 'x' ? (bj === 0 ? JOFF : 1 + Math.floor(h3(0, bj, 42) * 4)) : 1 + Math.floor(h3(bi, 0, 43) * 4),
    split: type === 'room' && h3(bi, bj, 44) < 0.45 ? 2 + Math.floor(h3(bi, bj, 45) * 3) : 0 };
  blocks.set(k, b);
  return b;
}
const bOf = (i, j) => [Math.floor(i / B), Math.floor((j + JOFF) / B)];
// The edge on the west (v) or south (h) side of cell (i, j).
function edgeType(dir, i, j) {
  const [ai, aj] = dir === 'v' ? [i - 1, j] : [i, j - 1];
  const a = cellOk(ai, aj), b = cellOk(i, j);
  if (!a && !b) return OPEN;
  if (!a || !b) return SOLID;
  if (dir === 'v' && j === 0 && i === 0) return SOLID;      // behind the lift
  if (dir === 'h' && i === -1 && (j === 0 || j === 1)) return SOLID;   // the alcove's sides
  const [pi, pj] = bOf(ai, aj), [qi, qj] = bOf(i, j), P = block(pi, pj), Q = block(qi, qj);
  const li = i - qi * B, lj = j + JOFF - qj * B;   // the + side cell, in its block
  const door = (d) => (d && h3(i, j, 6) < 0.1 ? AJAR : d);
  if (pi === qi && pj === qj) {   // inside a block
    const along = dir === 'v' ? 'z' : 'x', at = dir === 'v' ? li : lj, pos = dir === 'v' ? lj : li, salt = dir === 'v' ? 46 : 47;
    if (Q.type === 'hall') return OPEN;
    if (Q.type === 'room') {
      if (!Q.split || at !== Q.split || (Q.along === 'x') !== (dir === 'h')) return OPEN;
      return pos === Math.floor(h3(qi, qj, 48) * B) ? door(DOORWAY) : SOLID;
    }
    if (Q.along !== along) return OPEN;
    if (Q.type === 'corr') {
      if (at !== Q.line && at !== Q.line + 1) return OPEN;
      // a doorway or none on each side, never in the stretch by the lift (its sign)
      const side = at === Q.line ? 0 : 1, d = Math.floor(h3(qi, qj, salt + side * 2) * B * 1.6);
      return pos === d && !(qi === -1 && qj === 0 && pos >= 3) ? door(DOORWAY) : SOLID;
    }
    if (at !== 2 && at !== 4) return OPEN;   // strips: two walls, a doorway in each
    return pos === Math.floor(h3(qi, qj, salt + at) * B) ? door(DOORWAY) : SOLID;
  }
  // between blocks: the corridors run through; halls open into each other; otherwise a wall with a doorway or two
  const along = dir === 'v' ? 'x' : 'z', cross = dir === 'v' ? j : i;
  for (const [Kb, ki, kj] of [[P, pi, pj], [Q, qi, qj]]) {
    if (Kb.type !== 'corr' || Kb.along !== along) continue;
    const base = along === 'x' ? kj * B - JOFF : ki * B;
    if (cross - base === Kb.line) return OPEN;
  }
  if (P.type === 'hall' && Q.type === 'hall') return OPEN;
  const pos = dir === 'v' ? lj : li, sa = dir === 'v' ? 50 : 54, hall = P.type === 'hall' || Q.type === 'hall';
  if (pos === Math.floor(h3(qi, qj, sa) * B) || (h3(qi, qj, sa + 2) < 0.3 && pos === Math.floor(h3(qi, qj, sa + 1) * B))) return hall ? WIDE : door(DOORWAY);
  return SOLID;
}
const isHall = (i, j) => block(...bOf(i, j)).type === 'hall';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three gives every object a uuid from Math.random: build with a seeded one, so this floor doesn't shift the draws
  // made after it (see helicopter.js). Chunks built later, while you're down here, do the same.
  const random = Math.random;
  Math.random = rng(3333);
  try { build(ctx); installNote(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { scene, liftShaft, addFloor, CAR, hitBox, camera, mapCtx, hud, style, floorName } = ctx;
  const restr = { n: N, label: 'RESTRICTED', title: 'Restricted Level', unlisted: true, ride: 9, on: false, composer: null,
    colliders: [], hits: [], chunks: new Map(), z0: 0, extras: [], sound: { kind: 'restricted', steps: true } };   // steps: it plays your own (on the wet carpet)
  const S = restr.scene = new THREE.Scene(), root = restr.root = new THREE.Group();
  const murk = new THREE.Color('#1f1a0b');
  S.background = murk; S.fog = new THREE.Fog(murk, 3, 30);
  S.environment = scene.environment; S.environmentIntensity = 0.12;
  S.add(restr.hemi = new THREE.HemisphereLight('#e9d98f', '#4a3f1c', 0.5), root);
  const lights = Array.from({ length: NLIGHTS }, () => { const l = new THREE.PointLight('#ffeaa6', 0, 9, 1.4); root.add(l); return l; });
  restr.look = { exposure: 0.85, hemi: 0.5, sky: new THREE.Color('#e9d98f'), ground: new THREE.Color('#4a3f1c'), env: 0.12, bloom: 0.7, grade: 1.15,
    lights: lights.map((l) => [l, 0]) };

  // ----- materials: wallpaper, carpet, ceiling tiles, stains -----
  const R = rng(303);
  const wall = makeCanvas(256, 880), w = wall.ctx;
  w.fillStyle = '#b8a455'; w.fillRect(0, 0, 256, 880);
  for (let x = 0; x < 256; x += 32) { w.fillStyle = 'rgba(232,214,128,.35)'; w.fillRect(x + 4, 0, 12, 880); w.fillStyle = 'rgba(140,118,48,.18)'; w.fillRect(x + 16, 0, 2, 880); }
  w.fillStyle = 'rgba(150,128,54,.35)';
  for (let y = 12; y < 880; y += 44) for (let x = 0; x < 256; x += 32) {   // a small diamond between the stripes, staggered
    const cx = x + 24 + ((y / 44) % 2 ? 0 : 0), cy = y + ((x / 32) % 2 ? 22 : 0);
    w.beginPath(); w.moveTo(cx, cy - 6); w.lineTo(cx + 4, cy); w.lineTo(cx, cy + 6); w.lineTo(cx - 4, cy); w.fill();
  }
  for (let k = 0; k < 4000; k++) { w.fillStyle = `rgba(${R() > 0.5 ? '255,245,190' : '90,72,30'},${R() * 0.06})`; w.fillRect(R() * 256, R() * 880, 1 + R() * 2, 1 + R() * 2); }
  for (let k = 0; k < 14; k++) { w.fillStyle = `rgba(110,88,40,${0.03 + R() * 0.05})`; w.fillRect(R() * 256, 0, 1 + R() * 3, 880); }   // grime runs
  let g = w.createLinearGradient(0, 880, 0, 700);   // damp creeping up from the carpet
  g.addColorStop(0, 'rgba(70,52,20,.55)'); g.addColorStop(0.15, 'rgba(90,70,28,.3)'); g.addColorStop(1, 'rgba(90,70,28,0)');
  w.fillStyle = g; w.fillRect(0, 700, 256, 180);
  g = w.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, 'rgba(80,66,30,.3)'); g.addColorStop(1, 'rgba(80,66,30,0)');
  w.fillStyle = g; w.fillRect(0, 0, 256, 90);
  wall.tex.wrapS = THREE.RepeatWrapping; wall.tex.needsUpdate = true;
  const wallM = new THREE.MeshStandardMaterial({ map: wall.tex, roughness: 0.93 });

  const carpet = makeCanvas(256, 256), cp = carpet.ctx, img = cp.createImageData(256, 256);
  for (let k = 0; k < img.data.length; k += 4) { const v = (R() - 0.5) * 34; img.data[k] = 150 + v; img.data[k + 1] = 133 + v; img.data[k + 2] = 86 + v * 0.8; img.data[k + 3] = 255; }
  cp.putImageData(img, 0, 0);
  for (let k = 0; k < 30; k++) { cp.fillStyle = `rgba(${R() > 0.4 ? '70,56,26' : '190,172,120'},${0.04 + R() * 0.05})`; cp.beginPath();
    cp.ellipse(R() * 256, R() * 256, 10 + R() * 40, 8 + R() * 30, R() * 3, 0, Math.PI * 2); cp.fill(); }
  carpet.tex.wrapS = carpet.tex.wrapT = THREE.RepeatWrapping; carpet.tex.needsUpdate = true;
  const ceil = makeCanvas(256, 256), cc = ceil.ctx;
  cc.fillStyle = '#d4cba5'; cc.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 1400; k++) { cc.fillStyle = `rgba(120,108,74,${0.15 + R() * 0.25})`; cc.fillRect(R() * 256, R() * 256, 1.2, 1.2); }   // pinholes
  for (let k = 0; k < 4; k++) { cc.fillStyle = `rgba(150,128,70,${R() * 0.12})`; cc.fillRect((k % 2) * 128, Math.floor(k / 2) * 128, 128, 128); }
  cc.fillStyle = '#9d9474'; for (const p of [0, 128]) { cc.fillRect(p, 0, 3, 256); cc.fillRect(0, p, 256, 3); }   // the grid
  ceil.tex.wrapS = ceil.tex.wrapT = THREE.RepeatWrapping; ceil.tex.needsUpdate = true;
  const PLANE = 96;   // carpet and ceiling: big enough for the fog, and moved with you (a whole 4.8 m tile at a time, see fx)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(PLANE, PLANE).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: carpet.tex, roughness: 1, color: '#d8ccb0' }));
  carpet.tex.repeat.set(PLANE / 2.4, PLANE / 2.4);
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(PLANE, PLANE).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: ceil.tex, roughness: 0.95 }));
  ceil.tex.repeat.set(PLANE / 1.2, PLANE / 1.2); lid.position.y = H;
  root.add(floor, lid);
  restr.planes = [floor, lid]; restr.ceilTex = ceil.tex;
  // Stains: one atlas, thirds for a wall's drips, a ring on a ceiling tile and a damp patch in the carpet.
  const st = makeCanvas(768, 256), sc = st.ctx;
  for (let k = 0; k < 26; k++) {   // drips from the top
    const x = 20 + R() * 216, len = 60 + R() * 190, gr = sc.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, `rgba(96,70,26,${0.25 + R() * 0.3})`); gr.addColorStop(1, 'rgba(96,70,26,0)');
    sc.fillStyle = gr; sc.fillRect(x, 0, 3 + R() * 10, len);
  }
  for (let k = 0; k < 6; k++) {   // rings
    sc.strokeStyle = `rgba(110,82,34,${0.25 + R() * 0.3})`; sc.lineWidth = 2 + R() * 4;
    sc.beginPath(); sc.ellipse(384 + (R() - 0.5) * 30, 128 + (R() - 0.5) * 30, 40 + k * 15 + R() * 8, 36 + k * 14, R(), 0, Math.PI * 2); sc.stroke();
  }
  g = sc.createRadialGradient(384, 128, 10, 384, 128, 110); g.addColorStop(0, 'rgba(120,90,40,.3)'); g.addColorStop(1, 'rgba(120,90,40,0)');
  sc.fillStyle = g; sc.fillRect(256, 0, 256, 256);
  for (let k = 0; k < 9; k++) {   // the damp
    const gx = 640 + (R() - 0.5) * 120, gy = 128 + (R() - 0.5) * 120, rr = 30 + R() * 60, d = sc.createRadialGradient(gx, gy, 0, gx, gy, rr);
    d.addColorStop(0, 'rgba(48,38,16,.4)'); d.addColorStop(1, 'rgba(48,38,16,0)'); sc.fillStyle = d; sc.fillRect(512, 0, 256, 256);
  }
  st.tex.needsUpdate = true;
  const stainM = new THREE.MeshStandardMaterial({ map: st.tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const exit = makeCanvas(256, 96), ex = exit.ctx;
  ex.fillStyle = '#0e7a3a'; ex.fillRect(0, 0, 256, 96); ex.fillStyle = '#eaffef'; ex.font = `800 58px ${FONT}`; ex.fillText('EXIT', 28, 70);
  ex.beginPath(); ex.moveTo(178, 30); ex.lineTo(228, 48); ex.lineTo(178, 66); ex.fill(); ex.fillRect(166, 42, 22, 12);
  exit.tex.needsUpdate = true;
  const exitM = new THREE.MeshBasicMaterial({ map: exit.tex, color: new THREE.Color(1.3, 1.3, 1.3), side: THREE.DoubleSide });
  const panelM = new THREE.MeshBasicMaterial({ vertexColors: true }), decorM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const LIT = new THREE.Color('#fff4cf').multiplyScalar(1.6), DEAD = new THREE.Color('#57524a');

  // ----- the lift, the landing in front of it, and a cctv root for the cameras that show nothing (systems/cctv.js) -----
  Object.assign(restr, liftShaft()); root.add(restr.lift);
  restr.lift.traverse((o) => { if (o.material?.emissiveIntensity === 1.6) restr.carLight = o.material; });
  restr.cctv = { root };
  {
    const sign = makeCanvas(512, 256), c = sign.ctx;
    c.fillStyle = '#bba653'; c.fillRect(0, 0, 512, 256);
    c.fillStyle = 'rgba(40,32,14,.82)'; c.font = `900 150px ${FONT}`; c.fillText('B3', 30, 160);
    c.font = `700 26px ${MONO}`; c.fillText('SUBLEVEL 3', 250, 92); c.fillText('NO UNAUTHORISED', 250, 132); c.fillText('ACCESS', 250, 172);
    c.fillStyle = 'rgba(150,128,54,.5)'; for (let k = 0; k < 600; k++) c.fillRect(R() * 512, R() * 256, 2, 2);   // the stencil's worn through
    sign.tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshStandardMaterial({ map: sign.tex, transparent: true, roughness: 0.9, opacity: 0.9 }));
    m.position.set(GX - 1.5 * C, 1.65, GZ + C - T / 2 - 0.003); m.rotation.y = Math.PI; root.add(m);   // on the corridor's wall, by the lift
  }

  // ----- a chunk: its walls, ceiling lights, stains and the odd thing in a room -----
  // Boxes for walls, with the wallpaper's u along the wall and v up it (so it lines up from one wall to the next).
  function slab(list, x0, x1, z0, z1, y0 = 0, y1 = H) {
    const b = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const P = b.attributes.position, Nn = b.attributes.normal, U = b.attributes.uv;
    for (let k = 0; k < P.count; k++) {
      const ny = Nn.getY(k);
      U.setXY(k, ny ? P.getX(k) / WP : (Nn.getX(k) ? P.getZ(k) : P.getX(k)) / WP, ny ? P.getZ(k) / WP : P.getY(k) / H);
    }
    list.push(b);
  }
  // A box in an object's own space (front +z), turned by yaw and set down at (ox, oz), in one colour.
  function part(list, w, h, d, x, y, z, color, yaw, ox, oz) {
    const b = new THREE.BoxGeometry(w, h, d).translate(x, y, z).rotateY(yaw).translate(ox, 0, oz), col = new THREE.Color(color);
    b.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.attributes.position.count * 3).map((_, k) => [col.r, col.g, col.b][k % 3]), 3));
    list.push(b);
  }
  // A stain: a rect of the atlas (third 0, 1 or 2) on a face. `face`: 'up', 'down', or a wall's normal yaw.
  function decal(list, third, x, y, z, w, h, face) {
    const b = new THREE.PlaneGeometry(w, h), U = b.attributes.uv;
    for (let k = 0; k < U.count; k++) U.setX(k, (third + U.getX(k)) / 3);
    if (face === 'up') b.rotateX(-Math.PI / 2); else if (face === 'down') b.rotateX(Math.PI / 2); else b.rotateY(face);
    list.push(b.translate(x, y, z));
  }
  function buildChunk(ci, cj) {
    const walls = [], decor = [], stains = [], signs = [], lit = [], flick = [], cols = [], panels = [], hits = [], phones = [], doors = [], dead = [];
    const stainsAt = (i, j, cx, cz) => {   // a ring on the ceiling, or a damp patch in the carpet
      const r = h3(i, j, 10);
      if (r > 0.04 && r < 0.1) decal(stains, 1, cx + (h3(i, j, 14) - 0.5) * 1.6, H - 0.004, cz + (h3(i, j, 15) - 0.5) * 1.6, 0.8 + r * 10, 0.8 + r * 10, 'down');
      else if (r > 0.04 && r < 0.16) decal(stains, 2, cx + (h3(i, j, 16) - 0.5) * 1.4, 0.004, cz + (h3(i, j, 17) - 0.5) * 1.4, 1 + r * 9, 1 + r * 8, 'up');
    };
    const X = (i) => GX + i * C, Z = (j) => GZ + j * C;
    const solidSlab = (x0, x1, z0, z1) => { slab(walls, x0, x1, z0, z1); cols.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 }); };
    // An edge: `fixed` is its x (v) or z (h), it runs from a to b along the other axis.
    function edge(dir, i, j) {
      const t = edgeType(dir, i, j);
      if (t === OPEN) return;
      const v = dir === 'v', fixed = v ? X(i) : Z(j), a = v ? Z(j) : X(i), b = a + C, a1 = a + T / 2, b1 = b - T / 2, r = h3(i, j, v ? 3 : 4);
      const seg = (s0, s1, y0 = 0, y1 = H) => {
        if (s1 - s0 < 0.01) return;
        const [x0, x1, z0, z1] = v ? [fixed - T / 2, fixed + T / 2, s0, s1] : [s0, s1, fixed - T / 2, fixed + T / 2];
        if (y0 > 0) slab(walls, x0, x1, z0, z1, y0, y1); else solidSlab(x0, x1, z0, z1);
      };
      const at = (s, off, y) => (v ? [fixed + off, y, s] : [s, y, fixed + off]);
      if (t === SOLID) {
        seg(a1, b1);
        if (r < 0.3) for (const side of [-1, 1]) if (h3(i, j, side + 9) < 0.5) {   // a stain down one face or the other
          const s = a + 0.4 + h3(i, j, 31) * (C - 0.8), wd = 0.6 + r * 2.5, [x, y, z] = at(s, side * (T / 2 + 0.004), H - 0.7);
          decal(stains, 0, x, y, z, wd, 1.4, v ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI));
        }
        return;
      }
      const dw = t === WIDE ? 2.0 : 1.0, dh = t === WIDE ? 2.35 : 2.1;
      const d = t === WIDE ? a + C / 2 + (r - 0.5) * 0.6 : a + 0.9 + r * (C - 1.8);
      seg(a1, d - dw / 2); seg(d + dw / 2, b1); seg(d - dw / 2, d + dw / 2, dh, H);
      doors.push(v ? { x: fixed, z: d, v, w: dw } : { x: d, z: fixed, v, w: dw });   // somewhere to peek round (restricted-creature.js)
      if (t === AJAR) {   // a door standing open, as if someone just went through
        const side = h3(i, j, 6) < 0.5 ? -1 : 1, th = 1.42, lw = dw - 0.04;
        const hinge = d - dw / 2 + 0.02, dx = v ? side * Math.sin(th) : Math.cos(th), dz = v ? Math.cos(th) : side * Math.sin(th);
        const [hx, , hz] = at(hinge, 0, 0), cx = hx + dx * lw / 2, cz = hz + dz * lw / 2, yaw = Math.atan2(-dz, dx);
        part(decor, lw, dh - 0.02, 0.045, 0, (dh - 0.02) / 2, 0, '#7a5a3a', yaw, cx, cz);
        part(decor, 0.05, 0.05, 0.12, lw / 2 - 0.08, 1.0, 0, '#c9b98a', yaw, cx, cz);
        const ex2 = Math.abs(dx) * lw / 2 + 0.03, ez = Math.abs(dz) * lw / 2 + 0.03;
        cols.push({ minX: cx - ex2, maxX: cx + ex2, minZ: cz - ez, maxZ: cz + ez });
      }
    }
    const i0 = ci * CH, j0 = cj * CH;
    for (let i = i0; i < i0 + CH; i++) for (let j = j0; j < j0 + CH; j++) {
      edge('v', i, j); edge('h', i, j);
      // A post where walls meet, and in a hall a square pillar every other corner (6.4 m apart).
      const any = [edgeType('v', i, j - 1), edgeType('v', i, j), edgeType('h', i - 1, j), edgeType('h', i, j)].some((t) => t !== OPEN);
      if (any) solidSlab(X(i) - T / 2, X(i) + T / 2, Z(j) - T / 2, Z(j) + T / 2);
      else if (!(i & 1) && !(j & 1) && cellOk(i, j) && isHall(i, j) && isHall(i - 1, j - 1) && isHall(i - 1, j) && isHall(i, j - 1)) {
        solidSlab(X(i) - 0.32, X(i) + 0.32, Z(j) - 0.32, Z(j) + 0.32);
      }
      if (!cellOk(i, j) || (i === -1 && j === 0)) continue;
      // The light: a panel a cell (every other one in a hall), a few dead, some flickering (the one outside the lift always is).
      const cx = X(i) + C / 2, cz = Z(j) + C / 2, along = h3(i, j, 8) < 0.5, pr = h3(i, j, 9);
      if (isHall(i, j) && (i + j) & 1) { stainsAt(i, j, cx, cz); continue; }
      const kind = i === -2 && j === 0 ? 1 : darkPatch(i, j) ? (pr < 0.85 ? 2 : 1) : pr < 0.06 ? 2 : pr < 0.15 ? 1 : 0;
      const [pw, pd] = along ? [1.2, 0.6] : [0.6, 1.2];
      part(decor, pw + 0.08, 0.02, pd + 0.08, 0, H - 0.01, 0, '#b9b19a', 0, cx, cz);
      part(kind === 1 ? flick : lit, pw, 0.02, pd, 0, H - 0.016, 0, kind === 2 ? DEAD : LIT, 0, cx, cz);
      if (kind !== 2) panels.push({ x: cx, z: cz, kind }); else dead.push({ x: cx, z: cz });
      // The odd thing.
      if (i === -2 && j === 0) continue;
      const r = h3(i, j, 10), sides = [['v', i, j, X(i), 0], ['v', i + 1, j, X(i + 1), Math.PI], ['h', i, j, Z(j), 1], ['h', i, j + 1, Z(j + 1), 2]];
      const wallSide = sides.find(([d, a, b]) => edgeType(/** @type {string} */ (d), a, b) === SOLID);
      const onWall = (off) => {   // a spot `off` out from that wall, its middle, facing into the room
        const [d, , , f, k] = wallSide;
        if (d === 'v') return { x: f + (k ? -off : off), z: cz, yaw: k ? -Math.PI / 2 : Math.PI / 2 };
        return { x: cx, z: f + (k === 1 ? off : -off), yaw: k === 1 ? 0 : Math.PI };
      };
      if (r < 0.011 && wallSide) {   // a chair, facing the wall
        const { x, z, yaw } = onWall(0.7), y2 = yaw + Math.PI;
        part(decor, 0.46, 0.07, 0.46, 0, 0.47, 0, '#3a3a3d', y2, x, z); part(decor, 0.44, 0.5, 0.06, 0, 0.8, -0.22, '#3a3a3d', y2, x, z);
        part(decor, 0.05, 0.38, 0.05, 0, 0.25, 0, '#1c1c1e', y2, x, z);
        part(decor, 0.6, 0.04, 0.06, 0, 0.05, 0, '#1c1c1e', y2, x, z); part(decor, 0.06, 0.04, 0.6, 0, 0.05, 0, '#1c1c1e', y2, x, z);
        cols.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
        hits.push(hitBox(root, 0.6, 1.1, 0.6, x, 0.55, z, { action: 'backrooms', reach: 3, info: '<b>A chair</b><div class="k">Facing the wall. Someone was sitting here.</div>' }));
      } else if (r < 0.017) {   // an exit sign, hung from the ceiling, pointing nowhere in particular
        const yaw = Math.floor(h3(i, j, 12) * 4) * Math.PI / 2, x = cx + 0.8, z = cz;
        part(decor, 0.38, 0.16, 0.05, 0, H - 0.33, 0, '#e8e6dc', yaw, x, z);
        for (const s of [-1, 1]) part(decor, 0.012, 0.17, 0.012, s * 0.12, H - 0.165, 0, '#8f8b80', yaw, x, z);
        for (const s of [-1, 1]) signs.push(new THREE.PlaneGeometry(0.34, 0.13).rotateY(s < 0 ? Math.PI : 0).translate(0, H - 0.33, s * 0.0265).rotateY(yaw).translate(x, 0, z));
      } else if (r < 0.023 && wallSide) {   // a payphone
        const { x, z, yaw } = onWall(T / 2);
        phones.push({ x, z });
        part(decor, 0.3, 0.55, 0.13, 0, 1.35, 0.065, '#7d8187', yaw, x, z); part(decor, 0.42, 0.04, 0.3, 0, 1.66, 0.15, '#6b6f75', yaw, x, z);
        part(decor, 0.18, 0.18, 0.012, 0.04, 1.28, 0.135, '#24262a', yaw, x, z); part(decor, 0.06, 0.016, 0.012, 0.05, 1.52, 0.135, '#c9ccd1', yaw, x, z);
        part(decor, 0.065, 0.25, 0.06, -0.11, 1.4, 0.17, '#1b1c1e', yaw, x, z); part(decor, 0.012, 0.3, 0.012, -0.11, 1.12, 0.17, '#111', yaw, x, z);
        hits.push(hitBox(root, 0.5, 0.8, 0.5, x, 1.35, z, { action: 'backrooms', reach: 3, info: '<b>A payphone</b><div class="k">No dial tone. The handset is warm.</div>' }));
      } else if (r < 0.027) {   // a door in a frame in the middle of the room, going nowhere
        const yaw = h3(i, j, 13) < 0.5 ? 0 : Math.PI / 2;
        for (const s of [-1, 1]) part(decor, 0.08, 2.18, 0.14, s * 0.5, 1.09, 0, '#d9d2b8', yaw, cx, cz);
        part(decor, 1.08, 0.08, 0.14, 0, 2.18, 0, '#d9d2b8', yaw, cx, cz); part(decor, 0.92, 2.12, 0.045, 0, 1.06, 0, '#7a5a3a', yaw, cx, cz);
        for (const s of [-1, 1]) part(decor, 0.05, 0.05, 0.05, 0.36, 1.0, s * 0.045, '#c9b98a', yaw, cx, cz);
        const [ex2, ez] = yaw ? [0.1, 0.56] : [0.56, 0.1];
        cols.push({ minX: cx - ex2, maxX: cx + ex2, minZ: cz - ez, maxZ: cz + ez });
        hits.push(hitBox(root, yaw ? 0.2 : 1.1, 2.2, yaw ? 1.1 : 0.2, cx, 1.1, cz,
          { action: 'backrooms', reach: 3, info: '<b>A door</b><div class="k">Locked. From both sides.</div>' }));
      } else stainsAt(i, j, cx, cz);
    }
    const grp = new THREE.Group(), add = (list, m) => { if (!list.length) return null; const mesh = new THREE.Mesh(mergeGeometries(list), m);
      for (const b of list) b.dispose(); grp.add(mesh); return mesh; };
    const flickM = panelM.clone();
    const wallMesh = add(walls, wallM);
    add(decor, decorM); add(lit, panelM); add(flick, flickM); add(signs, exitM);
    const stainMesh = add(stains, stainM);
    if (stainMesh) stainMesh.renderOrder = 1;
    root.add(grp);
    return { ci, cj, grp, cols, panels, phones, doors, dead, hits: wallMesh ? [wallMesh, ...hits] : hits, flickM, seed: h3(ci, cj, 20) * 100, v: 1 };
  }
  function dropChunk(k) {
    const ch = restr.chunks.get(k);
    root.remove(ch.grp);
    ch.grp.traverse((o) => o.geometry?.dispose());
    for (const h of ch.hits) if (h.parent === root) { root.remove(h); h.geometry.dispose(); }
    ch.flickM.dispose();
    restr.chunks.delete(k);
  }
  const chunkDist = (ci, cj, x, z) => {
    const x0 = GX + ci * CW, z0 = GZ + cj * CW;
    return Math.hypot(Math.max(x0 - x, 0, x - x0 - CW), Math.max(z0 - z, 0, z - z0 - CW));
  };
  // Keep the chunks round (x, z) (the floor's own space) built: all at once on arrival, else one a frame.
  function stream(x, z, all) {
    let changed = false;
    for (const [k, ch] of restr.chunks) if (chunkDist(ch.ci, ch.cj, x, z) > DROP) { dropChunk(k); changed = true; }
    const want = [];
    const c0 = Math.floor((x - GX) / CW), c1 = Math.floor((z - GZ) / CW), r = Math.ceil(LOAD / CW);
    for (let ci = c0 - r; ci <= c0 + r; ci++) for (let cj = c1 - r; cj <= c1 + r; cj++) {
      if (restr.chunks.has(`${ci},${cj}`) || Math.abs(ci * CH) > LIM + CH || Math.abs(cj * CH) > LIM + CH) continue;
      const d = chunkDist(ci, cj, x, z);
      if (d < LOAD) want.push([d, ci, cj]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, ci, cj] of all ? want : want.slice(0, 1)) {
      const random = Math.random;
      Math.random = rng(1 + Math.floor(h3(ci, cj, 21) * 1e6));
      try { restr.chunks.set(`${ci},${cj}`, buildChunk(ci, cj)); } finally { Math.random = random; }
      changed = true;
    }
    if (changed) syncChunks();
  }
  function syncChunks() {
    const z0 = restr.z0, shaft = { minX: LIFT.x, maxX: LIFT.x + 0.3 + CAR.d, minZ: z0 - CAR.w / 2 - 0.3, maxZ: z0 + CAR.w / 2 + 0.3 };
    restr.colliders = [shaft];
    restr.hits = [restr.callHit, restr.panel.mesh, restr.lift];
    for (const ch of restr.chunks.values()) {
      for (const b of ch.cols) restr.colliders.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ + z0, maxZ: b.maxZ + z0 });
      restr.hits.push(...ch.hits);
    }
    for (const e of [story, ...restr.extras]) {   // Hale's things, and whatever else a part puts down here (relativity-door.js)
      for (const b of e?.cols() || []) restr.colliders.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ + z0, maxZ: b.maxZ + z0 });
      restr.hits.push(...e?.hits() || []);
    }
    for (const e of restr.extras) e.cut?.(restr.colliders);   // a doorway through a wall (world-edge-backstage.js)
    lightAt = null;
  }
  // The point lights go to the nearest working panels, picked again when you move a few metres.
  let lightAt = null, near = [];
  function placeLights(x, z) {
    if (lightAt && Math.hypot(lightAt.x - x, lightAt.z - z) < 1.2) return;
    lightAt = { x, z };
    const all = [];
    for (const ch of restr.chunks.values()) for (const p of ch.panels) all.push({ p, ch, d: Math.hypot(p.x - x, p.z - z) });
    near = all.sort((a, b) => a.d - b.d).slice(0, NLIGHTS);
    lights.forEach((l, k) => { const q = near[k]; if (q) l.position.set(q.p.x, H - 0.3, q.p.z); });
  }
  // A flickering panel: steady mostly, now and then a bad spell of stutters (all of a chunk's at once).
  const flicker = (t, s) => {
    if (Math.sin(t * 0.23 + s * 3.1) + 0.6 * Math.sin(t * 0.61 + s * 1.7) < 1.05) return 1;
    return Math.sin(t * 37 + s * 11) * Math.sin(t * 13.7 + s * 5) > -0.1 ? 1 : 0.06;
  };

  // ----- arriving, leaving, bounds, each frame -----
  const local = () => ({ x: camera.position.x, z: camera.position.z - restr.z0 });
  restr.enter = (z) => {
    restr.z0 = z; root.position.z = z;
    story.enter();
    creature.enter(story.st.visit);
    const at = restr.arriveAt || { x: LIFT.x - 3, z: 0 }; restr.arriveAt = null;   // (or, through a doorway from another floor, where that is)
    stream(at.x, at.z, true); syncChunks();
    hud.classList.add('of-restricted');
  };
  restr.leave = () => {
    hud.classList.remove('of-restricted');
    blink.style.opacity = '0';
    if (restr.carLight) restr.carLight.emissiveIntensity = 1.6;
    keypad.close();
    story.leave();
    creature.leave();
    sound.stop();
  };
  restr.bound = (p) => {
    p.x = clamp(p.x, GX - (LIM + 1) * C, GX + LIM * C); p.z = clamp(p.z, restr.z0 + GZ - LIM * C, restr.z0 + GZ + (LIM + 1) * C);
  };
  // The rooms round (x, z) built and lit: where you are, or (heard: false) seen from another floor through a doorway.
  function seen(x, z, t, heard, all = false) {
    stream(x, z, all);
    placeLights(x, z);
    worn.at(restr.z0);
    for (const m of restr.planes) m.position.set(Math.round(x / 4.8) * 4.8, m.position.y, Math.round(z / 4.8) * 4.8);
    for (const ch of restr.chunks.values()) {
      let v = flicker(t, ch.seed);
      if (creature.near(ch)) v = Math.min(v, Math.sin(t * 23 + ch.seed * 3) * Math.sin(t * 7.1) > 0.15 ? 0.05 : 1);   // something's near
      if (heard && v !== ch.v && v < 1 && chunkDist(ch.ci, ch.cj, x, z) < 4) sound.buzz(ch, x, z);
      ch.v = v; ch.flickM.color.setScalar(0.1 + 0.9 * v);
    }
    near.forEach((q, k) => { restr.look.lights[k][1] = 2.8 * (q.p.kind === 1 ? q.ch.v : 1) * creature.dim(q.p.x, q.p.z, t); });
    for (let k = near.length; k < NLIGHTS; k++) restr.look.lights[k][1] = 0;
  }
  // Seen from another floor through a doorway (world-edge-backstage.js): with your car at z0, the rooms round (x, z) (the
  // floor's own space) as they'd be if you were there (all: every room in reach at once, not one a frame).
  restr.view = (x, z, t, z0, all) => {
    if (z0 !== restr.z0) { restr.z0 = z0; root.position.z = z0; syncChunks(); }
    seen(x, z, t, false, all);
  };
  let glitchAt = 0;
  restr.fx = (dt, t) => {
    const { x, z } = local();
    seen(x, z, t, true);
    // The ride down: the car's light stutters, the panel loses its mind, and the dark comes and goes.
    const L = ctx.mine.L, riding = L?.state === 'travel' && ctx.inMyCar();
    if (riding) {
      const k = ctx.mine.k, bad = Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1) > 0.25 || (k > 0.45 && k < 0.6);
      const v = bad && Math.sin(t * 43) * Math.sin(t * 17) > -0.2 ? 0.15 : 1;
      if (restr.carLight) restr.carLight.emissiveIntensity = 1.6 * v;
      blink.style.opacity = String(k > 0.92 ? 0 : (1 - v) * 0.75);
      if (t - glitchAt > 0.08) { glitchAt = t; glitchPanel(restr.panel, t); }
    } else if (restr.carLight && restr.carLight.emissiveIntensity !== 1.6) {
      restr.carLight.emissiveIntensity = 1.6; blink.style.opacity = '0';
    }
    story.fx(dt, t, x, z, riding);
    creature.fx(dt, t, x, z, riding, story.st.walked);
    sound.fx(dt, t, x, z, riding, near);
  };
  // The car panel on the way down: buttons that swap places and labels that don't say anything.
  function glitchPanel(scr, t) {
    const { ctx: c, W, H: PH } = scr, grid = ctx.panelGrid(scr), j = Math.floor(t * 12), lit = Math.floor(h3(j, 1, 2) * grid.length);
    c.fillStyle = '#4d5157'; c.fillRect(0, 0, W, PH); c.textAlign = 'center'; c.textBaseline = 'middle';
    grid.forEach(({ F, x, y: y0, r: rr, cw }, i) => {
      const y = y0 + (h3(j, i, 3) < 0.2 ? (h3(j, i, 4) - 0.5) * 40 : 0);
      c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fillStyle = i === lit ? '#ffb347' : '#33363b'; c.fill();
      c.beginPath(); c.arc(x, y, rr * 0.84, 0, Math.PI * 2); c.fillStyle = '#d9dcdf'; c.fill();
      const scramble = h3(j, i, 5) < 0.5;
      c.fillStyle = '#26282b'; c.font = `700 ${Math.round(rr * 0.8)}px ${FONT}`; c.fillText(scramble ? '?▓░B'[Math.floor(h3(j, i, 6) * 4)] : floorName(F.n), x, y);
      c.fillStyle = '#e8e6e1'; c.font = `700 ${Math.round(Math.min(30, rr * 0.64))}px ${FONT}`; c.fillText(scramble ? '▓▒░▒▓' : fit(c, F.label, cw - 8), x, y + rr * 1.45);
    });
    if (h3(j, 9, 9) < 0.3) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, h3(j, 9, 8) * PH, W, 2 + h3(j, 9, 7) * 16); }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic'; scr.tex.needsUpdate = true;
  }

  // ----- the minimap: static, and the lift -----
  const noise = [0, 1, 2].map((s) => {
    const cv = makeCanvas(110, 83), c = cv.ctx, d = c.createImageData(110, 83), Rn = rng(900 + s);
    for (let k = 0; k < d.data.length; k += 4) { const v = Rn() * 200; d.data[k] = d.data[k + 1] = d.data[k + 2] = v; d.data[k + 3] = 255; }
    c.putImageData(d, 0, 0); return cv.canvas;
  });
  let mapN = 0;
  const warps = makeWarps(ctx, restr);   // the hidden ways out: a faint warp in the static at each (restricted-warps.js)
  restr.map = () => {
    const c = mapCtx, W = 440, MH = 330, K = 4;
    c.clearRect(0, 0, W, MH);
    c.imageSmoothingEnabled = false; c.globalAlpha = 0.4; c.drawImage(noise[(mapN = (mapN + 1) % 3)], 0, 0, W, MH); c.globalAlpha = 1; c.imageSmoothingEnabled = true;
    warps(c, noise[mapN], (x, z) => [W / 2 + (x - camera.position.x) * K, MH / 2 + 10 + (z + restr.z0 - camera.position.z) * K]);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, (mapN * 97) % MH, W, 14);
    // The lift, from where you are: on the map within 50 m or so, else an arrow at the edge pointing to it.
    const dx = LIFT.x + 1 - camera.position.x, dz = restr.z0 - camera.position.z;
    let px = W / 2 + dx * K, pz = MH / 2 + 10 + dz * K;
    const inside = px > 24 && px < W - 24 && pz > 50 && pz < MH - 20;
    if (!inside) { const s = Math.min((W / 2 - 24) / Math.abs(dx * K || 1e-6), (MH / 2 - 40) / Math.abs(dz * K || 1e-6)); px = W / 2 + dx * K * s; pz = MH / 2 + 10 + dz * K * s; }
    c.fillStyle = 'rgba(200,205,212,.9)';
    if (inside) { c.fillRect(px - 4, pz - 8, 8, 16); c.font = '600 15px system-ui'; c.fillText('Lift', px + 9, pz + 5); }
    else { const a = Math.atan2(dz, dx); c.save(); c.translate(px, pz); c.rotate(a); c.beginPath(); c.moveTo(10, 0); c.lineTo(-6, -7); c.lineTo(-6, 7); c.fill(); c.restore(); }
    c.save(); c.translate(W / 2, MH / 2 + 10); c.rotate(-camera.rotation.y);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('B3 · NO SIGNAL', 16, 30);
  };

  // ----- HUD: the clock and the count lose track down here; the dark that comes and goes on the way down; the keypad -----
  style.textContent += `
    .of-restricted .of-clock { font-size: 0 !important; } .of-restricted .of-clock::after { content: '??:??'; font-size: 12px; }
    .of-restricted .of-count { font-size: 0; } .of-restricted .of-count::after { content: '0 at desks · 0 in the breakroom'; font-size: 12px; }
    .of-hud .of-blink { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
    .of-hud .of-keypad { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: auto; background: radial-gradient(rgba(0,0,0,.1), rgba(0,0,0,.55)); }
    .of-hud .of-keypad.on { display: flex !important; }
    .of-keypad .kp { width: 248px; padding: 18px 18px 14px; border-radius: 10px; color: #26282b; font: 600 12px ${FONT};
      background: repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0 1px, rgba(0,0,0,.05) 1px 3px), linear-gradient(180deg, #cfd3d7, #a9aeb4);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.7), inset 0 -2px 0 rgba(0,0,0,.25), 0 24px 60px rgba(0,0,0,.6); animation: of-kp-in .18s ease-out; }
    .of-keypad .pl { display: flex; justify-content: space-between; letter-spacing: .14em; font-size: 11px; color: #3b3e42; margin-bottom: 10px; }
    .of-keypad .pl i { width: 8px; height: 8px; border-radius: 50%; background: #5a1410; box-shadow: inset 0 1px 2px rgba(0,0,0,.6); align-self: center; }
    .of-keypad .lcd { background: #0d1a10; border-radius: 5px; padding: 8px 10px; box-shadow: inset 0 2px 6px rgba(0,0,0,.8); color: #6dff8f; font: 600 11px ${MONO}; letter-spacing: .12em; }
    .of-keypad .lcd b { display: block; font: 600 28px ${MONO}; letter-spacing: .35em; margin-top: 2px; min-height: 34px; }
    .of-keypad .keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
    .of-keypad button { height: 44px; border: 0; border-radius: 7px; font: 700 17px ${FONT}; color: #1f2124; cursor: pointer;
      background: linear-gradient(180deg, #eef0f2, #c3c8cd); box-shadow: 0 2px 0 #7d8389, 0 3px 6px rgba(0,0,0,.3); }
    .of-keypad button.fn { font-size: 11px; letter-spacing: .08em; }
    .of-keypad button:active, .of-keypad button.dn { transform: translateY(2px); box-shadow: 0 0 0 #7d8389, 0 1px 2px rgba(0,0,0,.3); }
    .of-keypad .ft { margin-top: 12px; text-align: center; font-weight: 500; font-size: 11px; color: #4a4e53; }
    .of-keypad.deny .lcd { color: #ff5a4a; background: #1d0c0a; } .of-keypad.deny .pl i { background: #ff3b2b; box-shadow: 0 0 10px #ff3b2b; }
    .of-keypad.deny .kp { animation: of-kp-no .4s; }
    .of-keypad.ok .lcd { color: #6dff8f; } .of-keypad.ok .pl i { background: #3dff6a; box-shadow: 0 0 10px #3dff6a; }
    @keyframes of-kp-in { from { transform: scale(.96); opacity: 0; } }
    @keyframes of-kp-no { 20%, 60% { transform: translateX(-7px); } 40%, 80% { transform: translateX(7px); } }
  `;
  const blink = document.createElement('div'); blink.className = 'of-blink'; hud.appendChild(blink);
  let pass = false;   // the one ride the right code buys: used up by the press it makes (see restr.access)
  try { localStorage.removeItem('officeRestricted'); } catch {}   // it used to be remembered there
  const sound = restr.audio = makeSound(ctx, restr);   // (relativity-door.js plays its bleed through the stone door)
  restr.grid = { C, CH, H, T, X: (i) => GX + i * C, Z: (j) => GZ + j * C, edgeType, SOLID, cellOk, h3 };
  restr.sync = syncChunks;
  // The worn ways in the carpet, from the lift to the doors nobody mentions (restricted-paths.js); paths.home is where the
  // stone door into Relativity stands (relativity-door.js). restr.hidden: every hidden way out, each with a trail and a
  // warp on the map (restricted-warps.js); the doors behind the paintings and the bookcase add theirs as they install.
  const paths = restr.paths = wornPaths(restr, [LIFT.x - 0.4, 0]), worn = restr.worn = wear(floor.material, paths);
  restr.hidden.add('stone', () => paths.home.door, { shown: () => !!ctx.rel?.door?.st.at });   // (it turns up after a while)
  restr.hidden.add('exit', () => { const e = findExit(restr); return { X: e.XD, Z: e.ZF, YAW: e.YAW }; });
  // A reload down here (systems/resume.js): the same rooms round where you were (they're fixed by place, not by visit), and no keypad.
  restr.restore = (s, p) => { stream(p.x, p.z - restr.z0, true); syncChunks(); };
  const story = restr.story = installStory(ctx, restr, sound);
  const creature = restr.creature = installCreature(ctx, restr, sound);
  const keypad = makeKeypad();
  ctx.onFrame(() => { if (keypad.el.classList.contains('on') && ctx.mode !== 'keypad') keypad.close(); }, 175);   // the view left under it
  // On the way down (your car sent here: a long ride, its doors shut), the rooms round the lift laid out and got ready to be
  // seen in the background (systems/warm.js), and the floor's post-processing made and drawn once (under the frame
  // that's drawn over it): the doors then don't open on a frame that waits on them. Only before your first time down.
  let warmB3 = null, warmedB3 = false;
  ctx.onFrame((dt, t) => {
    if (ctx.away === restr) { warmedB3 = true; warmB3 = null; }
    if (warmedB3) return;
    const L = ctx.mine.L;
    if (!warmB3) {
      if (!L || L.goal !== -3 || ctx.away) return;
      restr.view(LIFT.x - 3, 0, t, L.z, true);
      warmB3 = makeWarm(ctx.renderer, [restr.scene]);
    } else if (warmB3()) {
      warmB3 = null; warmedB3 = true;
      const exp = ctx.renderer.toneMappingExposure;
      ctx.renderFloor(restr);
      ctx.renderer.toneMappingExposure = exp;
    }
  }, 198);
  function makeKeypad() {
    const el = document.createElement('div');
    el.className = 'of-keypad';
    el.innerHTML = `<div class="kp"><div class="pl"><span>B3 · RESTRICTED</span><i></i></div><div class="lcd"><span>ENTER ACCESS CODE</span><b></b></div>
      <div class="keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'].map((k) => `<button data-k="${k}" class="${k.length > 1 ? 'fn' : ''}">${k}</button>`).join('')}</div>
      <div class="ft">Type the code · Enter · Esc to step back</div></div>`;
    hud.appendChild(el);
    const msg = el.querySelector('.lcd span'), out = el.querySelector('.lcd b');
    let entry = '', busy = false, timer = 0;
    const show = () => { out.textContent = entry.padEnd(Math.max(4, entry.length), '_'); };
    const press = (k) => {
      if (busy) return;
      el.querySelector(`[data-k="${k}"]`)?.animate([{ transform: 'translateY(2px)' }, { transform: 'none' }], 120);
      if (k === 'CLR') { entry = ''; sound.beep(); }
      else if (k === 'ENT') submit();
      else if (entry.length < 8) { entry += k; sound.beep(); }
      show();
    };
    function submit() {
      busy = true;
      if (entry === CODE) {
        msg.textContent = 'ACCESS GRANTED'; el.classList.add('ok'); sound.granted();
        timer = setTimeout(() => { close(); pass = true; ctx.pressFloor(N); pass = false; }, 900);
      } else {
        msg.textContent = 'ACCESS DENIED'; el.classList.add('deny'); sound.denied();
        timer = setTimeout(() => { el.classList.remove('deny'); msg.textContent = 'ENTER ACCESS CODE'; entry = ''; busy = false; show(); }, 1300);
      }
    }
    function open() {
      if (document.pointerLockElement) document.exitPointerLock();
      ctx.mode = 'keypad'; ctx.keys.clear();
      entry = ''; busy = false; msg.textContent = 'ENTER ACCESS CODE'; el.classList.remove('ok', 'deny'); show();
      el.classList.add('on');
    }
    function close() {
      clearTimeout(timer); busy = false;
      if (!el.classList.contains('on')) return;
      el.classList.remove('on', 'ok', 'deny');
      if (ctx.mode === 'keypad') ctx.mode = 'free';
    }
    el.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('button');
      if (b) press(b.dataset.k); else if (e.target === el) close();
    });
    document.addEventListener('keydown', (e) => {
      if (!el.classList.contains('on')) return;
      const k = /^(Digit|Numpad)\d$/.test(e.code) ? e.code.slice(-1) : e.key === 'Enter' ? 'ENT' : e.key === 'Backspace' || e.key === 'Delete' ? 'CLR' : null;
      if (e.key === 'Escape') close(); else if (k) press(k); else return;
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    return { el, open, close, press, get entry() { return entry; } };
  }
  // Its button on the car panel: the keypad, every time (the right code then presses it again, with the pass).
  restr.access = () => {
    if (pass) { pass = false; return true; }
    keypad.open();
    return false;
  };

  ctx.action('backrooms', { hover: (h) => h.info });
  Object.assign(restr, { keypad, stream, h3, CODE });
  Object.assign(ctx, { restr });
  addFloor(restr);
}

// The code, on two sticky notes: one half peeled off the side of the vending machine in the lounge (world/lounge.js
// installVending), down by your knee where nobody looks; one on the back of the centre monitor on your own desk
// (world/my-office.js installScreen), where you'd only see it walking round the desk. Hale left them (restricted-story.js).
/** @param {import('../ctx.js').OfficeCtx} ctx */
function installNote(ctx) {
  const { world, center } = ctx;
  const n = makeCanvas(128, 128), c = n.ctx;
  c.fillStyle = '#f3dd6c'; c.fillRect(0, 0, 128, 128);
  c.fillStyle = 'rgba(160,130,40,.25)'; c.fillRect(0, 0, 128, 14);
  c.fillStyle = '#1d2c6e'; c.font = `700 30px ${MARKER}`; c.fillText('B3', 14, 46);
  c.font = `700 36px ${MARKER}`; c.fillText(CODE, 18, 88);
  c.font = `400 13px ${MARKER}`; c.fillText('don’t stay long', 18, 114);
  n.tex.needsUpdate = true;
  const noteM = new THREE.MeshStandardMaterial({ map: n.tex, roughness: 0.9, side: THREE.DoubleSide });
  const where = {
    vending: 'Half peeled off the side of the vending machine',
    monitor: 'Stuck to the back of your monitor, where you’d never see it from your chair',
  };
  const hits = [];
  const note = (x, y, z, ry, rz, curl, at) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.076), noteM);
    m.position.set(x, y, z); m.rotation.set(0, ry, rz); m.rotateX(curl);   // curling off at the bottom
    m.castShadow = false; m.receiveShadow = true;
    world.add(m);
    hits.push(ctx.hitBox(world, Math.abs(Math.sin(ry)) > 0.5 ? 0.06 : 0.13, 0.13, Math.abs(Math.sin(ry)) > 0.5 ? 0.13 : 0.06, x, y, z,
      { action: 'restrictednote', reach: 2.4, info: where[at] }));
  };
  note(6.618, 0.46, 14.36, -Math.PI / 2, 0.21, -0.12, 'vending');
  note(center.x + 0.36, 1.04, center.z - 0.0225, Math.PI, -0.08, 0.06, 'monitor');   // the bezel's back is 0.02 behind the group
  ctx.action('restrictednote', { hover: (h) => `<b>A sticky note</b><div class="k">${h.info}, in biro: “B3 · ${CODE}”. Under it, smaller: “don’t stay long”.</div>` });
  ctx.hoverTargets(() => hits, 60);
}
