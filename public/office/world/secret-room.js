// The bookcase under the "stay curious" neon in my office is a door. One book on it (a darker red, its spine worn) pulls
// out on its bottom edge; the latch behind it lets go, and the bookcase's middle bay, a door's width and its full height,
// books and all, backs into the wall with a clunk and then rumbles sideways into a pocket behind its right-hand neighbour.
// The rest of the bookcase stays put. Behind it, a carpeted hatch drops and a steel ladder's stiles run up out of a narrow
// shaft: down it, through the slab, into the den in the dead storey under 48 (47's space, windowless behind the louvres:
// world/secret-den.js). All of it is real geometry in the office's own scene, so nothing cuts: the floor and my office's
// carpet get a hole cut in them while it's open (their own geometry, the same UVs round it, put back when it shuts), the
// shaft is lined from the boards down to the den's ceiling, and from below a shut hatch is a solid lid.
//
// Walk into the ladder facing it (or click it) and you take hold: W climbs up, S down (Shift faster), hand over hand (a sway
// and a clank for each rung); off the bottom or the top you step back off it. The den has its own colliders and floor
// height while you're down there (ctx.below, which player.js walks you by), and its own light: as your head goes down
// through the slab, the office's lamps, sky light, sun and environment fade out and four of the office's own lamp lights
// (borrowed, as the wellness floor does, and put back as you come up) light the den instead. Below the boards, while the
// shaft's opening is out of view, nothing but the den and the shaft is drawn. A lever at the foot of the ladder shuts the
// bookcase (or opens it); climbing up to a shut hatch pushes it open. Nothing of it is built until it's first opened, and nothing runs while
// it's shut and you're upstairs. A reload puts you back on the ladder where you were, or in the den (48's save/restore,
// resume.js). The minimap shows it only once you're down there.
//
// window.__office.secret: open(instant), close(instant), pose(T) (T seconds into opening), climb(fy, yaw, pitch) (on the ladder fy below 48's boards),
// den(x, z, yaw, pitch) (stood in the den), S (its state).

import * as THREE from 'three';
import { angDiff, clamp, colliders, damp, ease, EYE, hash, lerp, makeCanvas, mat, mergedBoxes, rng, sstep } from '../util.js';
import { buildDen, merge, part } from './secret-den.js';
import { makeSound } from './secret-sound.js';

export const DY = -3.8, CEIL = -1.2;   // the den's floor (47's, a storey down) and its ceiling (a void and the slab above)
export const HOLE = { x0: 7.925, x1: 8.775, z0: -14.88, z1: -14.1 };   // the shaft, from 48's boards down into the den (in off 47's slab edge and louvres)
export const DEN = { x0: 5.4, x1: 12.6, z0: -14.87, z1: -8.4 };   // (its north wall just in from 47's louvres, which stand at -14.9)
export const LADDER = { x: 8.35, z: -14.78, hang: -14.38, rung: 0.28 };   // its rungs' line, where you hang off it, their spacing
const OFF = { x: LADDER.x, z: -13.62 };   // where you step back off it, top and bottom
// The bookcase: three sections between end panels. The middle one, the bay over the shaft, is the door: it backs 19 cm
// into the 37 cm between the bookcase's front and the wall, then runs sideways into a pocket behind the right-hand section,
// whose shelves are only as deep as the bay's (the left-hand one's are full depth).
const CASE = { x0: 7.4, x1: 9.8, front: -14.53, back: -14.87, h: 2.2, rows: 5 }, POCKET = -14.7;
const BAY = { x0: HOLE.x0, x1: HOLE.x1, inward: 0.19, slide: 0.87 };
// The opening, as one timeline (seconds): the book tilts out, the bay backs into the wall with a clunk, slides away behind
// its neighbour, the hatch drops and the ladder's stiles rise. Shutting runs it backwards.
const T_END = 4.5, READY = 4.0;   // (from READY the hatch is down and the ladder's yours)
const bookK = (T) => sstep(0, 0.35, T), inK = (T) => ease(clamp((T - 0.5) / 0.8, 0, 1)), slideK = (T) => ease(clamp((T - 1.45) / 2.0, 0, 1)),
  hatchK = (T) => ease(clamp((T - 3.5) / 0.5, 0, 1)), stileK = (T) => ease(clamp((T - 3.9) / 0.6, 0, 1));
const OPEN_AT = 1.3;   // the bay's back in the wall: the hole's there from here (under it, and the hatch in front)

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three takes a uuid from Math.random for every object, material and geometry: build with a stream of our own, so the
  // office's seeded draws after this (the harness) don't move.
  own(() => build(ctx));
}
const seeds = rng(4747);
function own(fn) { const random = Math.random; Math.random = seeds; try { return fn(); } finally { Math.random = random; } }

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { world, secretShelf: shelf, officeFloor, officeCarpet, FLOORS, scene, camera, lamps, renderer, hemi, sun } = ctx;
  const S = { T: 0, dir: 0, at: 'office', fy: 0, tw: null, hold: false, found: localStorage.officeSecret === '1', built: false, holed: false, skip: false, k: 0 };
  let den = null, shaftG = null, hatch = null, lid = null, stiles = null, snd = null;

  // ----- the bookcase -----
  // installDesk's (furniture.js) comes out; this one goes in its place, the same size, wood and palette, in three
  // sections. The bay is a group of its own, its frame and books together, so they move as one.
  world.remove(shelf);
  const { x0: X0, x1: X1, front: FR, back: BK, h: H, rows } = CASE, gap = (H - 0.06) / rows, mid = (FR + BK) / 2, pmid = (FR + POCKET) / 2;
  const woodM = mat('#7a5232', { roughness: 0.7 }), fixed = [], bayFrame = [], books = [], bayBooks = [];
  fixed.push([0.04, H, FR - BK, X0 + 0.02, H / 2, mid], [0.04, H, FR - BK, X1 - 0.02, H / 2, mid], [X1 - X0, 0.03, FR - BK, (X0 + X1) / 2, H - 0.015, mid]);
  // The left-hand section, full depth; its right side is the opening's left wall.
  const L0 = X0 + 0.04, L1 = BAY.x0 - 0.025;
  fixed.push([0.02, H - 0.03, FR - BK, L1 + 0.01, (H - 0.03) / 2, mid], [L1 - L0, 0.04, FR - BK, (L0 + L1) / 2, 0.02, mid], [L1 - L0, H - 0.07, 0.02, (L0 + L1) / 2, 0.04 + (H - 0.07) / 2, BK + 0.01]);
  // The right-hand section: shelves only as deep as the bay, a back behind them, and behind that the pocket.
  const R0 = BAY.x1 + 0.025, R1 = X1 - 0.04;
  fixed.push([0.02, H - 0.03, FR - POCKET, R0 - 0.01, (H - 0.03) / 2, pmid], [R1 - R0 + 0.02, 0.04, FR - POCKET, (R0 + R1) / 2 - 0.01, 0.02, pmid],
    [R1 - R0 + 0.02, H - 0.07, 0.01, (R0 + R1) / 2 - 0.01, 0.04 + (H - 0.07) / 2, POCKET - 0.005]);
  // The bay: its own sides, top, bottom and back, clear of the boards (6 mm up) and of the bookcase's top.
  const B0 = BAY.x0, B1 = BAY.x1, bw0 = B1 - B0, hb = 2.165 - 0.006;
  bayFrame.push([0.02, hb, FR - POCKET, B0 + 0.01, 0.006 + hb / 2, pmid], [0.02, hb, FR - POCKET, B1 - 0.01, 0.006 + hb / 2, pmid],
    [bw0 - 0.04, 0.034, FR - POCKET, (B0 + B1) / 2, 0.023, pmid], [bw0 - 0.04, 0.03, FR - POCKET, (B0 + B1) / 2, 2.15, pmid],
    [bw0 - 0.04, hb, 0.01, (B0 + B1) / 2, 0.006 + hb / 2, POCKET + 0.005]);
  for (let r = 1; r < rows; r++) {
    const y = 0.04 + r * gap;
    fixed.push([L1 - L0, 0.025, FR - BK, (L0 + L1) / 2, y, mid], [R1 - R0, 0.025, FR - POCKET - 0.01, (R0 + R1) / 2, y, pmid + 0.005]);
    bayFrame.push([bw0 - 0.04, 0.025, FR - POCKET - 0.01, (B0 + B1) / 2, y, pmid + 0.005]);
  }
  // Books, standing at the front of each shelf (the bay's and its neighbour's shelves are shallow); one on the right-hand
  // section at eye height, its spine worn, is the one that pulls.
  const R = rng(hash('secret-bookcase')), pal = ['#8c3b2f', '#2f5d62', '#d9a441', '#3f4a6b', '#e7dcc8', '#6b8e4e', '#a35d7a', '#1f2a33', '#c26a3d'];
  let pull = null;
  for (const [a0, a1, into, deep] of [[L0, L1, books, 0.22], [B0 + 0.02, B1 - 0.02, bayBooks, 0.15], [R0, R1, books, 0.15]]) for (let r = 0; r < rows; r++) {
    let bx = a0 + 0.02;
    const by = 0.04 + r * gap + 0.0125;
    while (bx < a1 - 0.06) {
      if (R() < 0.07) { bx += 0.14; continue; }
      const w = 0.025 + R() * 0.035, h = Math.min(gap - 0.05, 0.17 + R() * 0.12), lean = R() < 0.04 && a1 - bx > h + 0.02, d = deep - 0.03 + R() * 0.03;
      const b = [lean ? h : w, lean ? w : h, d, bx + (lean ? h : w) / 2, by + (lean ? w : h) / 2, FR - 0.006 - d / 2, pal[Math.floor(R() * pal.length)]];
      if (!pull && into === books && a0 === R0 && r === 3 && !lean && b[3] > 8.95 && b[3] < 9.4) pull = b; else into.push(b);
      bx += b[0] + 0.004;
    }
  }
  world.add(mergedBoxes(fixed, woodM), mergedBoxes(books, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  const bay = new THREE.Group(); world.add(bay);
  bay.add(mergedBoxes(bayFrame, woodM), mergedBoxes(bayBooks, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  // The book that pulls: its own mesh on a pivot at its bottom front edge.
  const [bw, bh, bd, bx, by, bz] = pull;
  const pivot = new THREE.Group();
  pivot.position.set(bx, by - bh / 2, bz + bd / 2); world.add(pivot);
  const spine = (() => {
    const t = makeCanvas(32, 128), c = t.ctx, R = rng(91);
    c.fillStyle = '#5a1d17'; c.fillRect(0, 0, 32, 128);
    for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '20,6,4' : '150,90,70'},${0.05 + R() * 0.12})`; c.fillRect(R() * 32, R() * 128, 1 + R() * 3, 1 + R() * 6); }
    c.fillStyle = 'rgba(176,140,74,.55)'; for (const y of [12, 17, 108, 113]) c.fillRect(2, y, 28, 2);
    c.fillStyle = 'rgba(176,140,74,.4)'; for (let y = 40; y < 84; y += 6) c.fillRect(11, y, 10, 3);   // a title, rubbed nearly off
    c.fillStyle = 'rgba(230,200,170,.18)'; c.fillRect(0, 0, 32, 3); c.fillRect(0, 125, 32, 3);   // the edges worn pale
    t.tex.needsUpdate = true;
    return t.tex;
  })();
  const coverM = mat('#5e2019', { roughness: 0.85 }), pagesM = mat('#d6cbb2', { roughness: 0.95 });
  const book = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), [coverM, coverM, pagesM, coverM, new THREE.MeshStandardMaterial({ map: spine, roughness: 0.8 }), coverM]);
  book.position.set(0, bh / 2, -bd / 2); book.castShadow = book.receiveShadow = true;
  book.userData = { action: 'secret-book', reach: 2.6 };
  pivot.add(book);
  const setBay = (kin, kslide) => bay.position.set(BAY.slide * kslide, 0, -BAY.inward * kin);

  // ----- what you bump into -----
  // Shut, the bookcase's own box (installDesk's); open, its two fixed sections and the hole between them.
  const shelfBox = colliders.find((b) => Math.abs(b.minX - X0) < 1e-6 && Math.abs(b.maxZ - FR) < 1e-6), shelfWas = { ...shelfBox };
  const rightBox = { minX: R0 - 0.02, maxX: X1, minZ: BK, maxZ: FR }, holeBox = { minX: HOLE.x0, maxX: HOLE.x1, minZ: HOLE.z0, maxZ: HOLE.z1 };
  let collOpen = false;
  function openColliders(on) {
    if (on === collOpen) return;
    collOpen = on;
    if (on) { Object.assign(shelfBox, { maxX: L1 + 0.02 }); colliders.push(rightBox, holeBox); }
    else { Object.assign(shelfBox, shelfWas); for (const b of [rightBox, holeBox]) colliders.splice(colliders.indexOf(b), 1); }
  }

  // ----- the hole in the floor -----
  // A plane's own geometry with a rectangle taken out (in four strips round it): the UVs are linear in position, so it
  // draws exactly as before round the hole.
  function holed(mesh) {
    const { width: w, height: h } = mesh.geometry.parameters, cx = mesh.position.x, cz = mesh.position.z;
    const X = (x) => clamp(x - cx, -w / 2, w / 2), Y = (z) => clamp(-(z - cz), -h / 2, h / 2);
    const hx0 = X(HOLE.x0), hx1 = X(HOLE.x1), hy0 = Y(HOLE.z1), hy1 = Y(HOLE.z0);
    const pos = [], uv = [], nrm = [], idx = [];
    for (const [x0, x1, y0, y1] of [[-w / 2, w / 2, -h / 2, hy0], [-w / 2, w / 2, hy1, h / 2], [-w / 2, hx0, hy0, hy1], [hx1, w / 2, hy0, hy1]]) {
      if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) continue;
      const b = pos.length / 3;
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { pos.push(x, y, 0); uv.push((x + w / 2) / w, (y + h / 2) / h); nrm.push(0, 0, 1); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    return g;
  }
  const whole = [officeFloor.geometry, officeCarpet.geometry];
  let cut = null;
  function holes(on) {
    if (on === S.holed) return;
    S.holed = on;
    cut ||= own(() => [holed(officeFloor), holed(officeCarpet)]);
    officeFloor.geometry = on ? cut[0] : whole[0]; officeCarpet.geometry = on ? cut[1] : whole[1];
  }

  // ----- the shaft (built the first time it's opened) -----
  function buildShaft() {
    shaftG = new THREE.Group(); world.add(shaftG);
    const { x0, x1, z0, z1 } = HOLE, t = 0.12;
    // Lined from the boards to the den's ceiling: raw concrete through the slab, dark ply in the void under it.
    const lining = [];
    for (const [y0, y1, c] of [[-0.5, -0.003, '#8d8a84'], [CEIL + 0.01, -0.5, '#3b3632']]) {   // (just clear of the boards and the den's ceiling: no fighting them)
      const h = y1 - y0, y = (y0 + y1) / 2;
      lining.push([t, h, z1 - z0 + 2 * t, x0 - t / 2, y, (z0 + z1) / 2, c], [t, h, z1 - z0 + 2 * t, x1 + t / 2, y, (z0 + z1) / 2, c],
        [x1 - x0, h, t, (x0 + x1) / 2, y, z1 + t / 2, c], [x1 - x0, h, t, (x0 + x1) / 2, y, z0 - t / 2, c]);
    }
    const lin = mergedBoxes(lining, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    lin.receiveShadow = true; shaftG.add(lin);
    // The ladder: two stiles on brackets off the wall, a rung every 28 cm, from the den's floor to 48's boards.
    const steel = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#9aa0a6', metalness: 0.75, roughness: 0.42 });
    const lad = [], L = LADDER, cs = '#c9ced4';
    for (const s of [-1, 1]) {
      lad.push(part(new THREE.BoxGeometry(0.05, -DY, 0.06), cs, L.x + s * 0.2, DY / 2, L.z));
      for (let y = DY + 0.4; y < 0; y += 1.1) lad.push(part(new THREE.BoxGeometry(0.03, 0.04, 0.12), '#7d8288', L.x + s * 0.2, y, (L.z + z0) / 2));
    }
    for (let y = DY + L.rung; y < -0.02; y += L.rung) lad.push(part(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 10), cs, L.x, y, L.z, 0, 0, Math.PI / 2));
    const ladder = merge(lad, steel); ladder.userData = { action: 'secret-ladder', reach: 2.4 }; shaftG.add(ladder);
    // Their top sections, telescoped down inside the shaft until the hatch is open, then run up a metre above the boards
    // to a hoop you can hold.
    const ext = [];
    for (const s of [-1, 1]) ext.push(part(new THREE.BoxGeometry(0.04, 1.0, 0.05), cs, L.x + s * 0.2, 0.5, L.z + 0.01));
    ext.push(part(new THREE.BoxGeometry(0.44, 0.04, 0.05), cs, L.x, 1.0, L.z + 0.01));
    for (const y of [0.3, 0.65]) ext.push(part(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 10), cs, L.x, y, L.z + 0.01, 0, 0, Math.PI / 2));
    stiles = merge(ext, steel); stiles.userData = { action: 'secret-ladder', reach: 2.4 }; shaftG.add(stiles);
    // The hatch over the shaft's front part (in front of the bookcase, and the bay's own footprint): carpet on top, flush
    // with mine; hinged at its front edge, it drops to hang a little off the shaft's front wall (never in its plane).
    hatch = new THREE.Group(); hatch.position.set((x0 + x1) / 2, 0.004, z1); shaftG.add(hatch);
    const hd = z1 - (POCKET - 0.02), hw = x1 - x0;   // (the hole's full width: no slit beside it)
    const top = new THREE.Mesh(new THREE.PlaneGeometry(hw, hd), officeCarpet.material);
    top.rotation.x = -Math.PI / 2; top.position.z = -hd / 2; top.receiveShadow = true; hatch.add(top);
    const under = mergedBoxes([[hw, 0.035, hd, 0, -0.0185, -hd / 2, '#6b4a2e'], [hw - 0.1, 0.02, 0.05, 0, -0.045, -0.06, '#4a3220'],
      [hw - 0.1, 0.02, 0.05, 0, -0.045, -hd + 0.06, '#4a3220']], new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    hatch.add(under);
    // Shut, the boards over the shaft are only my floor's plane and carpet, which have no underside: from below, a lid.
    lid = mergedBoxes([[x1 - x0, 0.04, z1 - z0, (x0 + x1) / 2, -0.025, (z0 + z1) / 2, '#6b4a2e']], new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    shaftG.add(lid);
    snd = makeSound(ctx);
  }
  function ensure() {
    if (S.built) return;
    S.built = true;
    own(() => {
      buildShaft();
      den = buildDen(ctx, api);
      inDen.colliders = den.colliders;
    });
  }

  // ----- opening and shutting -----
  function toggle(from) {
    if (S.dir) return;
    ensure();
    S.dir = S.T > 0 ? -1 : 1;
    if (S.dir > 0 && !S.found) { S.found = true; try { localStorage.officeSecret = '1'; } catch {} }
    if (from === 'lever') snd.lever(den.leverAt);
  }
  // Pose everything for the timeline's S.T.
  function apply() {
    pivot.rotation.x = 0.42 * bookK(S.T);
    setBay(inK(S.T), slideK(S.T));
    const open = S.T > OPEN_AT;
    holes(open); openColliders(open);
    if (!S.built) return;
    shaftG.visible = open || S.at !== 'office';
    hatch.visible = open; lid.visible = !open;
    hatch.rotation.x = -(Math.PI / 2 - 0.1) * hatchK(S.T);
    stiles.position.y = -1.0 * (1 - stileK(S.T));
  }
  const P = (x, y, z) => ({ x, y, z });
  function step(dt) {
    const T0 = S.T;
    S.T = clamp(S.T + S.dir * dt, 0, T_END);
    const up = (k) => S.dir > 0 && T0 < k && S.T >= k, down = (k) => S.dir < 0 && T0 > k && S.T <= k;
    const at = P((B0 + B1) / 2 + bay.position.x, 1.1, FR + bay.position.z), hole = P((HOLE.x0 + HOLE.x1) / 2, 0, HOLE.z1), latch = P(bx, by, FR);
    if (up(0.28) || down(0.1)) snd.clunk(latch);   // the latch behind the book
    if (up(1.22) || down(0.55)) snd.thud(at);   // the bay home in the wall (or back in line)
    if (up(1.45) || down(3.42)) snd.rumble(at);   // sliding away behind its neighbour (or back)
    if (up(3.62) || down(3.55)) snd.hatch(hole);
    if (up(3.92) || down(4.45)) snd.slide(P(LADDER.x, 0.2, LADDER.z));
    if (S.T === 0 || S.T === T_END) S.dir = 0;
    apply();
  }

  // ----- climbing -----
  // ctx.below while you're under 48's boards (or on the ladder): what player.js collides you with, and your floor height.
  const onLadder = { colliders: [], ground: () => S.fy }, inDen = { colliders: [], ground: () => DY };
  Object.defineProperty(ctx, 'below', { get: () => (S.at === 'office' ? null : S.at === 'den' ? inDen : onLadder), enumerable: true });
  const me = () => ctx.player;   // (player.js is installed later)
  function grab() {
    const p = me(), fromDen = S.at === 'den';
    if (S.at !== 'office' && !fromDen) return;
    if (!fromDen && S.T < READY) return;
    Object.assign(p, { seated: false, seat: null, eye: EYE });
    S.tw = { from: { x: p.x, z: p.z }, to: { x: LADDER.x, z: LADDER.hang }, t: 0, d: 0.65, then: 'ladder', pitch: fromDen ? 0.3 : -0.5 };
    S.fy = fromDen ? DY : 0; S.at = 'grab'; S.hold = true;   // (the key you walked in on isn't a climb till you let go)
    snd.rung(P(LADDER.x, EYE + S.fy - 0.3, LADDER.z));
  }
  function stepOff(where) {
    const p = me();
    S.tw = { from: { x: p.x, z: p.z }, to: OFF, t: 0, d: 0.6, then: where };
    S.at = 'off'; S.hold = true;   // (nor is the one you stepped off on a walk back into it)
  }
  let lastRung = 0;
  const rungAt = () => (S.fy - DY) / LADDER.rung;
  function climb(dt, keys) {
    if (S.at !== 'grab' && S.at !== 'ladder' && S.at !== 'off') return false;
    const p = me(), v = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    if (!v) S.hold = false;
    let w = 1;
    if (S.tw) {
      const tw = S.tw;
      tw.t = Math.min(1, tw.t + dt / tw.d);
      const e = ease(tw.t);
      p.x = lerp(tw.from.x, tw.to.x, e); p.z = lerp(tw.from.z, tw.to.z, e);
      if (S.at === 'grab') { w = e; p.yaw += angDiff(p.yaw, 0) * Math.min(1, dt * 5); p.pitch = damp(p.pitch, tw.pitch, 4, dt); } else w = 1 - e;
      if (tw.t >= 1) {
        S.at = tw.then; S.tw = null;
        if (S.at === 'office') S.fy = 0;
        lastRung = Math.round(rungAt());
      }
    } else if (v && !S.hold) {
      // Hand over hand: quick between rungs, slow at each as you take the next one.
      const u = rungAt() % 1, pace = 0.3 + 0.7 * Math.sin(Math.PI * u) ** 2, fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.6 : 1;
      S.fy += v * 1.45 * pace * fast * dt;
      if (v > 0 && S.T < READY && S.fy > -1.75) { S.fy = -1.75; if (!S.dir) toggle(); }   // your head at the shut hatch: push it open
      if (S.fy >= 0) { S.fy = 0; if (v > 0) stepOff('office'); }
      if (S.fy <= DY) { S.fy = DY; if (v < 0) stepOff('den'); }
      const r = Math.round(rungAt());
      if (r !== lastRung) { lastRung = r; snd.rung(P(LADDER.x + (r % 2 ? 0.2 : -0.2), EYE + S.fy - (v > 0 ? 0.1 : 1.3), LADDER.z)); }
    }
    p.fy = S.fy; p.eye = EYE;
    // The bob: a sway and a lean to each side in turn as you go from rung to rung, and a dip at each.
    const rp = rungAt(), side = Math.sin(Math.PI * rp) * w;
    ctx.setCam({ x: p.x + 0.03 * side, y: EYE + S.fy + 0.02 * Math.cos(2 * Math.PI * rp) * w, z: p.z, yaw: p.yaw, pitch: p.pitch });
    camera.rotation.z = 0.022 * side;
    return true;
  }
  ctx.climb = climb;
  const inside = (x, z) => x > DEN.x0 && x < DEN.x1 && z > DEN.z0 && z < DEN.z1;
  function reset() {   // somewhere else entirely (your desk from the menu, a teleport, a floor): back on 48's boards
    S.at = 'office'; S.tw = null; S.fy = 0;
    const p = me(); if (p) p.fy = 0;
    den?.stopAll();
    camera.rotation.z = 0;
  }
  // Walking into the ladder (or the hole it's in) facing it takes hold of it.
  function grabCheck() {
    const p = me(), keys = ctx.keys, w = keys.has('KeyW') || keys.has('ArrowUp');
    if (!w) S.hold = false;
    if (ctx.mode !== 'free' || p.seated || S.hold || !w || !(S.at === 'den' || (S.at === 'office' && S.T >= READY))) return;
    const dx = Math.max(HOLE.x0 - p.x, 0, p.x - HOLE.x1), dz = Math.max(HOLE.z0 - p.z, 0, p.z - HOLE.z1);
    if (Math.hypot(dx, dz) > 0.34) return;
    const toward = Math.atan2(-((HOLE.x0 + HOLE.x1) / 2 - p.x), -((HOLE.z0 + HOLE.z1) / 2 - p.z));
    if (Math.abs(angDiff(p.yaw, toward)) < 1.0) grab();
  }

  // ----- the light down there -----
  // k: 0 on 48 (and on the ladder until your head's at the boards), 1 by the time it's through the den's ceiling.
  const WARM = new THREE.Color('#ffd2a0'), DUSK = new THREE.Color('#4a3424');
  let borrowed = [];
  function borrow() {
    const pool = lamps.filter((l) => l.light).slice(-den.lights.length);   // (the wellness floor borrows from the front)
    borrowed = pool.map(({ light }, i) => {
      const d = den.lights[i], was = { light, pos: light.position.clone(), color: light.color.clone(), distance: light.distance };
      light.position.copy(d.p); light.color.set(d.color); light.distance = d.distance;
      return was;
    });
  }
  function giveBack() {
    for (const b of borrowed) { b.light.position.copy(b.pos); b.light.color.copy(b.color); b.light.distance = b.distance; }
    borrowed = [];
  }
  function light(k) {
    if (k <= 0) { if (borrowed.length) giveBack(); return; }
    if (!borrowed.length) borrow();
    const mine = new Set(borrowed.map((b) => b.light));
    for (const l of lamps) if (l.light && !mine.has(l.light)) l.light.intensity *= 1 - k;
    borrowed.forEach((b, i) => { b.light.intensity = den.lights[i].level() * k; });
    hemi.intensity *= lerp(1, 0.14, k); hemi.color.lerp(WARM, 0.5 * k); hemi.groundColor.lerp(DUSK, 0.6 * k);
    scene.environmentIntensity = lerp(scene.environmentIntensity, 0.06, k);
    sun.intensity *= 1 - k; ctx.raysStrength *= 1 - k;   // (the rays pass would streak the den's bulbs toward the sun)
    renderer.toneMappingExposure = lerp(ctx.officeExposure, 1.45, k);
  }
  // Under the boards nothing of the office, the city or the sky can show but through the shaft's opening at the top: while
  // that's out of view, your view's renders draw only the den and the shaft (the cameras' feeds draw everything).
  let overhead = [], overN = -1;
  const skipped = [], frustum = new THREE.Frustum(), M4 = new THREE.Matrix4();
  const opening = new THREE.Box3(new THREE.Vector3(HOLE.x0, -0.05, HOLE.z0), new THREE.Vector3(HOLE.x1, 0.05, HOLE.z1));
  function findOverhead() {
    overN = world.children.length + scene.children.length;
    overhead = [...world.children, ...scene.children].filter((o) => o !== world && o !== shaftG && o !== den.g && !o.isLight);
  }
  const inView = (box) => frustum.intersectsBox(box);   // (this frame's view: set before the den's fx)
  function viewNow() { camera.updateMatrixWorld(); frustum.setFromProjectionMatrix(M4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); }
  const before = scene.onBeforeRender, after = scene.onAfterRender;
  scene.onBeforeRender = (...a) => {
    before.apply(scene, a);
    if (!S.skip || a[2] !== camera) return;
    for (const o of overhead) if (o.visible) { o.visible = false; skipped.push(o); }
  };
  scene.onAfterRender = (...a) => { for (const o of skipped) o.visible = true; skipped.length = 0; after.apply(scene, a); };

  // ----- each frame (nothing till it's first opened) -----
  ctx.onFrame((dt) => { if (S.dir) step(dt); }, 62);
  ctx.onFrame(() => {
    if (S.at === 'office') return;
    const p = me();
    const lost = S.at === 'den' ? !inside(p.x, p.z) || Math.abs((p.fy || 0) - DY) > 0.5 : Math.hypot(p.x - LADDER.x, p.z - LADDER.hang) > 1.25 || Math.abs((p.fy || 0) - S.fy) > 0.3;
    if (ctx.away || lost) reset();   // (put back on the boards: the menu, a teleport, the tests' poses)
  }, 75);
  ctx.onFrame(() => { if (S.built) grabCheck(); }, 85);
  ctx.onFrame((dt, t) => {
    if (!S.built) return;
    const c = camera.position, near = Math.hypot(c.x - LADDER.x, c.z - (HOLE.z0 + HOLE.z1) / 2);
    den.g.visible = S.at !== 'office' || (S.T > OPEN_AT && near < 6 && !ctx.away);
    viewNow();
    if (den.g.visible) den.fx(dt, t, S);   // (the cameras' feeds first: they're of the office, lit as the office)
    S.k = S.at === 'office' ? 0 : sstep(-1.2, -2.8, S.at === 'den' ? DY : S.fy);
    light(S.k);
    S.skip = S.at !== 'office' && c.y < -0.05 && !inView(opening);
    if (S.skip && world.children.length + scene.children.length !== overN) findOverhead();
  }, 186);

  // ----- pointing, clicking, the map -----
  ctx.hoverTargets(() => (S.at !== 'office' ? (den ? [den.g, shaftG] : []) : S.T > OPEN_AT ? [book, shaftG] : [book]), 45);
  ctx.action('secret-book', { hover: () => '<b>A book</b>', click: () => { if (S.at === 'office') toggle(); } });
  ctx.action('secret-ladder', {
    hover: () => `<b>Ladder</b><div class="k">${S.at === 'office' && S.T < READY ? '' : `Click to climb ${S.at === 'den' ? 'up' : 'down'} · W and S on it`}</div>`,
    click: () => grab(),
  });
  ctx.minimap((c, sx, sz) => {   // only once you're down there
    if (S.at === 'office' || !den) return;
    c.fillStyle = 'rgba(10,8,7,.9)'; c.fillRect(0, 0, 440, 330);
    den.map(c, sx, sz);
  }, 35);

  // ----- a reload (resume.js: 48's own save and restore) -----
  const OFFICE = FLOORS.find((F) => F.n === 48), r2 = (v) => Math.round(v * 100) / 100;
  OFFICE.save = () => (S.tw || (S.dir && S.at !== 'office') ? false : S.at === 'ladder' ? { den: 'ladder', fy: r2(S.fy) } : S.at === 'den' ? { den: 1 } : null);
  OFFICE.restore = (s, p) => {
    if (!s.den) return false;
    ensure(); S.T = T_END; S.dir = 0;
    const pl = me();
    if (s.den === 'ladder') {
      S.at = 'ladder'; S.fy = clamp(+s.fy || 0, DY, 0); apply();
      Object.assign(pl, { x: LADDER.x, z: LADDER.hang, fy: S.fy, eye: EYE });
      lastRung = Math.round(rungAt());
      return true;
    }
    S.at = 'den'; S.fy = DY; apply();
    pl.fy = DY;
    const q = { x: clamp(p.x, DEN.x0 + 0.4, DEN.x1 - 0.4), z: clamp(p.z, DEN.z0 + 0.4, DEN.z1 - 0.4) };
    ctx.collide(q);
    Object.assign(pl, q);
    if (p.seated && Math.hypot(den.seat.x - p.x, den.seat.z - p.z) < 0.4) { ctx.sitIn(den.seat); pl.eye = den.seat.eye; }
    return true;
  };

  // ----- what the den needs from here, and the debug hooks -----
  const api = { S, toggle, inView, snd: () => snd, DY, CEIL, HOLE, DEN, LADDER, openK: () => slideK(S.T) };
  function openNow() { ensure(); S.T = T_END; S.dir = 0; S.found = true; apply(); }
  ctx.secret = {
    S,
    open(instant) { if (instant) openNow(); else if (!S.T) toggle(); },
    close(instant) { if (instant) { S.T = 0; S.dir = 0; apply(); } else if (S.T) toggle(); },
    pose(T) { ensure(); S.T = clamp(T, 0, T_END); S.dir = 0; apply(); },   // the mechanism as it is T seconds into opening
    climb(fy = -1.5, yaw = 0, pitch = 0) {
      openNow(); S.at = 'ladder'; S.tw = null; S.fy = clamp(fy, DY, 0); apply();
      Object.assign(me(), { x: LADDER.x, z: LADDER.hang, fy: S.fy, eye: EYE, yaw, pitch, seated: false, seat: null });
      lastRung = Math.round(rungAt());
    },
    den(x, z, yaw = 0, pitch = 0) {
      openNow(); S.at = 'den'; S.tw = null; S.fy = DY; apply();
      Object.assign(me(), { x, z, fy: DY, eye: EYE, yaw, pitch, seated: false, seat: null });
    },
    get room() { return den; },   // the den's parts (secret-den.js)
  };
}
