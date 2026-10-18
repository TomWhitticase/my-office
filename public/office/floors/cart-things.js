// The things in the grey meadow (floors/cart.js) besides the carts:
// - the toy-maker's shed: weathered boards, a door you walk in by, a window, a lantern burning under the ridge; inside,
//   two workbenches with tools, a carved face as big as the cart's leaning on the wall with no eyes in it yet, smaller
//   ones on the bench (one half painted), a dish of glass eyes, a half-sewn hood on a hook, spare wheels on pegs, spools
//   of red thread, a stool; and a music box with a tiny cart on its lid that turns while it plays (wind it: `box`).
// - the swing: a dead tree, bigger than the rest, a bough out sideways, two ropes and a seat that sways on its own,
//   more than the wind would move it (push it: `swing`).
// - an old pram, half sunk in the mist's hollow.
// All of it merged by material; the moving parts their own small groups. `cols` are their colliders (the world's).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHED, SWING, PRAM, ground, terrain } from './cart-plan.js';
import { faceGeometry, FACE } from './cart-face.js';

const tex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
// a box's geometry, non-indexed, its uv scaled to metres (so a plank texture tiles the same on every piece)
function B(w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, n = g.attributes.normal;
  for (let k = 0; k < uv.count; k++) {
    const ax = Math.abs(n.getX(k)), ay = Math.abs(n.getY(k));
    const [a, b] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(k, uv.getX(k) * a, uv.getY(k) * b);
  }
  if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry);
  return g.translate(x, y, z).toNonIndexed();
}
const merge = (gs) => { const g = mergeGeometries(gs); g.computeBoundingSphere(); return g; };

/** @returns {Generator<void, any>} */
export function* buildThings(P, R, time, A) {
  const root = new THREE.Group(), cols = [], hits = [], info = [];
  const hit = (mesh, html, extra = {}) => { mesh.userData.action ||= 'cart-thing'; mesh.userData.info = html; mesh.userData.reach ||= 4; Object.assign(mesh.userData, extra); hits.push(mesh); return mesh; };
  // ----- materials -----
  const boards = tex(256, 256, (c, w, h) => {   // weathered boards, grey-brown, upright, a dark gap between
    for (let x = 0; x < w; x += 32) {
      const v = 70 + R() * 30; c.fillStyle = `rgb(${v + 18},${v + 8},${v - 4})`; c.fillRect(x, 0, 32, h);
      for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(${R() < 0.5 ? '30,24,18' : '150,140,124'},${R() * 0.16})`; c.fillRect(x + R() * 30, y, 1 + R() * 3, 2); }
      c.fillStyle = 'rgba(20,16,12,.85)'; c.fillRect(x, 0, 2, h);
      if (R() < 0.5) { c.fillStyle = 'rgba(30,24,18,.55)'; c.beginPath(); c.ellipse(x + 8 + R() * 16, R() * h, 1.2, 2.2, 0, 0, 7); c.fill(); }
    }
  });
  const shedM = new THREE.MeshStandardMaterial({ map: boards, roughness: 0.95 });
  boards.repeat.set(0.8, 0.8);
  const roofM = new THREE.MeshStandardMaterial({ color: '#3b3632', roughness: 1, map: tex(128, 128, (c, w, h) => { c.fillStyle = '#9a9690'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y, w, 2); } for (let k = 0; k < 300; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '200,200,190'},${R() * 0.12})`; c.fillRect(R() * w, R() * h, 3, 3); } }) });
  const benchM = new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.8, map: boards });
  const ironM = new THREE.MeshStandardMaterial({ color: '#3a3836', roughness: 0.5, metalness: 0.7 });
  const brassM = new THREE.MeshStandardMaterial({ color: '#b08a4a', roughness: 0.35, metalness: 0.8 });
  const carvedM = new THREE.MeshStandardMaterial({ color: '#c09a6c', roughness: 0.75, map: tex(128, 128, (c, w, h) => { c.fillStyle = '#d0b48c'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { c.fillStyle = `rgba(120,80,40,${R() * 0.18})`; c.fillRect(0, y, w, 1); } }) });
  const glassM = new THREE.MeshStandardMaterial({ color: '#6f7a78', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
  const threadM = new THREE.MeshStandardMaterial({ color: '#9b2d22', roughness: 0.8 });
  yield;

  // ----- the shed: in its own space (door at +z), placed at SHED -----
  const shed = new THREE.Group();
  const Y0 = ground(SHED.x, SHED.z) - 0.04;
  shed.position.set(SHED.x, Y0, SHED.z); shed.rotation.y = SHED.yaw;
  root.add(shed);
  const W = 2.5, D = 2.0, T = 0.06, E = 2.5, RID = 3.35, FL = 0.12;   // half-width, half-depth, boards, eaves, ridge, the floor's top
  const walls = [];
  // the floor, inside the walls
  walls.push(B(2 * W - 2 * T, FL, 2 * D - 2 * T, 0, FL / 2, 0));
  // back wall; the front with its door (x -0.45..0.45, to 2.0); the sides, between them, the right with a window
  walls.push(B(2 * W, E + 0.05, T, 0, (E - 0.05) / 2, -D + T / 2));
  const DX = 0.47, DH = 2.02;
  walls.push(B(W - DX, E + 0.05, T, -(W + DX) / 2, (E - 0.05) / 2, D - T / 2), B(W - DX, E + 0.05, T, (W + DX) / 2, (E - 0.05) / 2, D - T / 2), B(2 * DX, E - DH, T, 0, (E + DH) / 2, D - T / 2));
  walls.push(B(T, E + 0.05, 2 * D - 2 * T, -W + T / 2, (E - 0.05) / 2, 0));
  const WZ = 0.55, WY0 = 1.0, WY1 = 1.7;
  walls.push(B(T, E + 0.05, D - T - WZ, W - T / 2, (E - 0.05) / 2, -(D - T + WZ) / 2), B(T, E + 0.05, D - T - WZ, W - T / 2, (E - 0.05) / 2, (D - T + WZ) / 2),
    B(T, WY0 + 0.05, 2 * WZ, W - T / 2, (WY0 - 0.05) / 2, 0), B(T, E - WY1, 2 * WZ, W - T / 2, (E + WY1) / 2, 0));
  // the gables, front and back
  for (const z of [-D + T / 2, D - T / 2]) {
    const s = new THREE.Shape(); s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(0, RID - E); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false }).translate(0, E, z - T / 2);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), uv.getY(k));
    walls.push(g.toNonIndexed());
  }
  // the door's frame and lintel, a little proud; the door itself stands open against the wall inside
  walls.push(B(0.06, DH - 0.01, 0.1, -DX - 0.02, (DH - 0.01) / 2, D + 0.0), B(0.06, DH - 0.01, 0.1, DX + 0.02, (DH - 0.01) / 2, D + 0.0), B(2 * DX + 0.16, 0.08, 0.1, 0, DH + 0.03, D + 0.0));
  // window frame
  walls.push(B(0.1, 0.06, 2 * WZ + 0.1, W + 0.0, WY0 - 0.02, 0), B(0.1, 0.06, 2 * WZ + 0.1, W + 0.0, WY1 + 0.02, 0), B(0.1, WY1 - WY0 - 0.04, 0.06, W + 0.0, (WY0 + WY1) / 2, -WZ - 0.02), B(0.1, WY1 - WY0 - 0.04, 0.06, W + 0.0, (WY0 + WY1) / 2, WZ + 0.02));
  const shedWalls = new THREE.Mesh(merge(walls), shedM);
  const door = new THREE.Mesh(B(0.86, 1.96, 0.045, 0, 0, 0), shedM);
  door.position.set(-DX - 0.45, FL + 0.99, D - T - 0.48); door.rotation.y = -1.35;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2 * WZ, WY1 - WY0).rotateY(Math.PI / 2), glassM); pane.position.set(W - T / 2, (WY0 + WY1) / 2, 0);
  // the roof: two pitches, overhanging, a ridge board
  const pitch = Math.atan2(RID - E, W), len = Math.hypot(W, RID - E) + 0.35;
  const roof = new THREE.Mesh(merge([
    B(len, 0.07, 2 * D + 0.5, -Math.cos(pitch) * len / 2 + 0.02, E + Math.sin(pitch) * len / 2 - 0.0 + 0.06, 0, 0, 0, pitch).translate(0, 0, 0),
    B(len, 0.07, 2 * D + 0.46, Math.cos(pitch) * len / 2 - 0.02, E + Math.sin(pitch) * len / 2 + 0.06, 0, 0, 0, -pitch),   // (2 cm short each end: its ends never on the other's)
    B(0.12, 0.12, 2 * D + 0.56, 0, RID + 0.13, 0),
  ]), roofM);
  // the ridge beam inside, and the lantern from it
  const beam = B(0.12, 0.14, 2 * D - 2 * T - 0.004, 0, RID - 0.22, 0);
  shed.add(shedWalls, door, pane, roof);
  yield;

  // ----- inside: benches, stool, tools -----
  const wood = [beam], iron = [], carved = [];
  const bench = (x0, x1, z0, z1, h = 0.9) => {
    wood.push(B(x1 - x0, 0.06, z1 - z0, (x0 + x1) / 2, FL + h - 0.03, (z0 + z1) / 2));
    for (const x of [x0 + 0.08, x1 - 0.08]) for (const z of [z0 + 0.08, z1 - 0.08]) wood.push(B(0.07, h - 0.06, 0.07, x, FL + (h - 0.06) / 2, z));
    wood.push(B(x1 - x0 - 0.26, 0.04, z1 - z0 - 0.26, (x0 + x1) / 2, FL + 0.25, (z0 + z1) / 2));   // the shelf under it
  };
  bench(-1.9, 1.3, -D + T + 0.01, -D + T + 0.66);           // along the back wall
  bench(-W + T + 0.01, -W + T + 0.62, -0.9, 1.05, 0.86);   // along the left wall, by the door
  // a stool
  wood.push(B(0.36, 0.04, 0.36, 0.4, FL + 0.6, -0.5)); for (const [x, z] of [[0.26, -0.64], [0.54, -0.64], [0.26, -0.36], [0.54, -0.36]]) wood.push(B(0.035, 0.58, 0.035, x, FL + 0.29, z));
  // pegs on the right wall, with wheels on them (instanced with the rest: P.wheelG)
  for (const z of [-1.2, -0.85]) wood.push(B(0.12, 0.03, 0.03, W - T - 0.06, 1.75, z));
  // tools on the back bench: a saw, a mallet, chisels in a rack, a plane, a drawknife
  const BY = FL + 0.9, BZ = -D + T + 0.33;
  iron.push(B(0.55, 0.004, 0.11, -1.35, BY + 0.004, BZ + 0.05, 0.2));
  wood.push(B(0.13, 0.03, 0.09, -1.66, BY + 0.017, BZ + 0.0, 0.2));
  wood.push(B(0.14, 0.08, 0.08, 0.95, BY + 0.04, BZ + 0.12, -0.3), B(0.03, 0.03, 0.28, 0.95, BY + 0.016, BZ - 0.08, -0.3));
  wood.push(B(0.6, 0.05, 0.05, 0, BY + 0.43, -D + T + 0.04));   // the rack on the wall
  for (let k = 0; k < 7; k++) { const x = -0.26 + k * 0.085; wood.push(B(0.018, 0.12, 0.022, x, BY + 0.5, -D + T + 0.05)); iron.push(B(0.012, 0.13, 0.004, x, BY + 0.375, -D + T + 0.05)); }
  wood.push(B(0.26, 0.07, 0.08, 0.45, BY + 0.035, BZ - 0.05, 0.4), B(0.06, 0.06, 0.03, 0.4, BY + 0.1, BZ - 0.05, 0.4));
  iron.push(B(0.3, 0.008, 0.03, -0.4, BY + 0.004, BZ + 0.18, -0.1));
  // spools of red thread on the left bench; a dish of glass eyes
  const LX = -W + T + 0.31, LY = FL + 0.86;
  const spools = [];
  for (let k = 0; k < 4; k++) { const g = new THREE.CylinderGeometry(0.03, 0.03, 0.07, 14).translate(LX - 0.06 + (k % 2) * 0.1, LY + 0.035, -0.75 + Math.floor(k / 2) * 0.1); g.deleteAttribute('uv'); spools.push(g.toNonIndexed()); }
  const dish = new THREE.LatheGeometry([[0.0, 0], [0.09, 0.0], [0.11, 0.035], [0.105, 0.037], [0.085, 0.006], [0.0, 0.006]].map(([r, y]) => new THREE.Vector2(r, y)), 24).translate(LX, LY, 0.65);
  yield;

  // ----- faces: a big one carved, leaning on the right wall, no eyes in it; small ones on the bench -----
  const big = faceGeometry(A.face2);
  const bigM = new THREE.Matrix4().makeTranslation(W - T - 0.62, FL + FACE.ry * 1.3 * 1.02 + 0.02, 0.85).multiply(new THREE.Matrix4().makeScale(1.3, 1.3, 1.3)).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2 - 0.25)).multiply(new THREE.Matrix4().makeRotationX(-0.18));
  carved.push(big.clone().applyMatrix4(bigM));
  const small = faceGeometry(A.face1);
  const sm = (x, y, z, ry, rx, s) => small.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeRotationX(rx)).multiply(new THREE.Matrix4().makeScale(s, s, s)));
  carved.push(sm(-0.75, BY + 0.06, BZ - 0.02, 0.15, -1.25, 0.22));   // on its back on the bench, looking up
  const half = sm(-0.2, BY + 0.2, BZ - 0.12, -0.25, -0.15, 0.2);       // propped up, half painted (its own mesh)
  const bigMesh = new THREE.Mesh(merge(carved), carvedM);
  const halfMesh = new THREE.Mesh(merge([half]), P.oldSkinM);
  // the half-made hood on a hook on the back wall, small
  const hoodG = P.hoodG.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(1.75, 1.0, -D + T + 0.32).multiply(new THREE.Matrix4().makeRotationX(-1.45)).multiply(new THREE.Matrix4().makeScale(0.3, 0.3, 0.3)));
  const hoodMesh = new THREE.Mesh(hoodG, P.feltM);
  iron.push(B(0.02, 0.02, 0.1, 1.75, 1.62, -D + T + 0.05));
  const ironMesh = new THREE.Mesh(merge(iron), ironM), woodMesh = new THREE.Mesh(merge(wood), benchM);
  const spoolMesh = new THREE.Mesh(merge(spools), threadM);
  const dishMesh = new THREE.Mesh(dish, brassM);
  shed.add(bigMesh, halfMesh, hoodMesh, ironMesh, woodMesh, spoolMesh, dishMesh);
  // glass eyes in the dish, and spare wheels on the pegs (each its own small instanced mesh)
  const glassEyes = new THREE.InstancedMesh(P.eyeG, P.eyeM, 7);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); for (let k = 0; k < 7; k++) { const a = k * 2.4, r = k ? 0.05 : 0; q.setFromEuler(e.set(R() * 6, R() * 6, R() * 6)); glassEyes.setMatrixAt(k, m.compose(new THREE.Vector3(LX + Math.cos(a) * r, LY + 0.022 + (k ? 0 : 0.012), 0.65 + Math.sin(a) * r), q, new THREE.Vector3(0.28, 0.28, 0.28))); } }
  const spare = new THREE.InstancedMesh(P.wheelG, P.woodM, 3);
  { const m = new THREE.Matrix4(); [[W - T - 0.08, 1.4, -1.03, 0], [W - T - 0.12, 1.38, -1.03, 0.4], [W - T - 0.3, FL + 0.36, -1.55, 0]].forEach(([x, y, z, a], k) => spare.setMatrixAt(k, m.makeRotationY(Math.PI / 2 + (k === 2 ? 0.3 : 0)).multiply(new THREE.Matrix4().makeRotationX(a)).setPosition(x, y, z))); }
  shed.add(glassEyes, spare);
  yield;

  // the lantern under the ridge: its glass glowing, a warm light that sways a touch
  const lantern = new THREE.Group(); lantern.position.set(0.3, RID - 0.29, -0.2);
  const lgl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 12), new THREE.MeshBasicMaterial({ color: '#ffcf8a' }));
  const lcap = new THREE.Mesh(merge([B(0.16, 0.03, 0.16, 0, 0.095, 0), B(0.18, 0.02, 0.18, 0, -0.09, 0), B(0.01, 0.12, 0.01, 0, 0.17, 0)]), ironM);
  lgl.position.y = 0;
  lantern.add(lgl, lcap); lantern.position.y -= 0.1; shed.add(lantern);

  // ----- the music box, on the left bench: a box, its lid on a hinge, a key, a tiny cart that turns on top -----
  const mb = new THREE.Group(); mb.position.set(LX + 0.02, LY, 0.05); mb.rotation.y = Math.PI / 2;
  const boxWood = new THREE.MeshStandardMaterial({ color: '#5a3424', roughness: 0.45 });
  const mbBody = new THREE.Mesh(merge([B(0.24, 0.1, 0.16, 0, 0.05, 0), B(0.248, 0.012, 0.168, 0, 0.006, 0)]), boxWood);
  const lid = new THREE.Group(); lid.position.set(0, 0.1, -0.08);
  const lidM = new THREE.Mesh(B(0.244, 0.022, 0.164, 0, 0.011, 0.082), boxWood); lid.add(lidM);
  // inside: the comb and the drum, brass
  const comb = new THREE.Mesh(merge([B(0.16, 0.008, 0.05, 0, 0.07, 0.02), new THREE.CylinderGeometry(0.018, 0.018, 0.12, 14).rotateZ(Math.PI / 2).translate(0, 0.075, -0.035).toNonIndexed()].map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; })), brassM);
  // the tiny cart on its spindle, standing up out of the box when the lid's open
  const fig = new THREE.Group(); fig.position.set(0.055, 0.1, 0.03);
  const figBody = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10).scale(0.8, 0.85, 1.4), P.feltM); figBody.position.set(0, 0.03, -0.006);
  const figFace = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 12, 10).scale(1, 1.2, 0.6), new THREE.MeshStandardMaterial({ color: '#d8c0ac', roughness: 0.6 })); figFace.position.set(0, 0.031, 0.022);
  const figHat = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.008, 10).translate(0, 0.053, 0.004), P.hatM);
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.02, 6).translate(0, 0.006, 0), brassM);
  fig.add(figBody, figFace, figHat, spindle); fig.visible = false;
  const key = new THREE.Group(); key.position.set(0.124, 0.05, 0);
  key.add(new THREE.Mesh(merge([new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6).rotateZ(Math.PI / 2).translate(0.015, 0, 0).toNonIndexed(), B(0.006, 0.03, 0.018, 0.032, 0, 0)].map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; })), brassM));
  mb.add(mbBody, lid, comb, fig, key);
  shed.add(mb);
  const mbHit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.26), new THREE.MeshBasicMaterial()); mbHit.visible = false; mbHit.position.set(0, 0.1, 0); mb.add(mbHit);
  hit(mbHit, '', { action: 'cart-box', reach: 2.6 });
  const box = { wound: 0, playing: false, lid: 0, spin: 0, root: mb };
  yield;

  // what you can point at in the shed
  const hb = (w, h, d, x, y, z, html) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.visible = false; m.position.set(x, y, z); shed.add(m); hit(m, html); };
  hb(0.9, 1.4, 0.4, W - T - 0.5, FL + 0.75, 0.9, '<b>A face, carved</b><div class="k">As big as the cart’s. There are no eyes in it yet, only the hollows</div>');
  hb(0.3, 0.2, 0.3, -0.75, BY + 0.07, BZ - 0.02, '<b>A small face</b><div class="k">On its back on the bench, looking at the roof</div>');
  hb(0.25, 0.3, 0.2, -0.2, BY + 0.2, BZ - 0.12, '<b>A face, half painted</b><div class="k">One cheek done, flushed. The brush is still wet</div>');
  hb(0.26, 0.08, 0.26, LX, LY + 0.03, 0.65, '<b>A dish of glass eyes</b><div class="k">Brown, mostly. One of them is looking at you</div>');
  hb(0.4, 0.45, 0.3, 1.75, 1.2, -D + T + 0.2, '<b>A hood</b><div class="k">Red felt, half sewn, the needle left in it</div>');
  hb(0.2, 0.8, 0.8, W - T - 0.15, 1.2, -1.1, '<b>Spare wheels</b><div class="k">Spoked, oak. Never quite round</div>');
  hb(1.8, 0.3, 0.6, 0.3, BY + 0.1, BZ, '<b>The workbench</b><div class="k">Chisels, a mallet, a saw. Shavings everywhere, and nobody here</div>');
  hb(0.3, 0.3, 0.3, LX, LY + 0.05, -0.7, '<b>Red thread</b><div class="k">Four spools, three of them nearly gone</div>');
  // the shed's colliders, in the world: its walls (the door's gap left), the benches, the leaning face
  const toWorld = (x0, x1, z0, z1) => { const a = [[x0, z0], [x1, z1]].map(([x, z]) => [SHED.x + Math.cos(SHED.yaw) * x + Math.sin(SHED.yaw) * z, SHED.z - Math.sin(SHED.yaw) * x + Math.cos(SHED.yaw) * z]);
    cols.push({ minX: Math.min(a[0][0], a[1][0]), maxX: Math.max(a[0][0], a[1][0]), minZ: Math.min(a[0][1], a[1][1]), maxZ: Math.max(a[0][1], a[1][1]) }); };
  toWorld(-W, W, -D, -D + T); toWorld(-W, -DX - 0.06, D - T, D); toWorld(DX + 0.06, W, D - T, D); toWorld(-W, -W + T, -D, D); toWorld(W - T, W, -D, D);
  toWorld(-1.9, 1.3, -D + T, -D + T + 0.66); toWorld(-W + T, -W + T + 0.62, -0.9, 1.05); toWorld(W - T - 0.85, W - T, 0.45, 1.4);
  const shedFloor = (x, z) => { const lx = Math.cos(SHED.yaw) * (x - SHED.x) - Math.sin(SHED.yaw) * (z - SHED.z), lz = Math.sin(SHED.yaw) * (x - SHED.x) + Math.cos(SHED.yaw) * (z - SHED.z);
    return Math.abs(lx) < W && Math.abs(lz) < D + 0.15 ? Y0 + FL : null; };
  yield;

  // ----- the swing's tree: a trunk, gnarled, a bough out sideways; the ropes and seat hung from it -----
  const sw = new THREE.Group(); sw.position.set(SWING.x, ground(SWING.x, SWING.z) - 0.1, SWING.z); sw.rotation.y = SWING.yaw; root.add(sw);
  const trunkParts = [];
  const limb = (pts, r0, r1, sides = 8) => {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(c, Math.max(6, pts.length * 4), 1, sides, false), pa = g.attributes.position, segs = Math.max(6, pts.length * 4);
    for (let i = 0; i <= segs; i++) { const ctr = c.getPointAt(i / segs), r = r0 + (r1 - r0) * (i / segs), w = 1 + 0.12 * Math.sin(i * 1.7); for (let s = 0; s <= sides; s++) { const k = i * (sides + 1) + s; pa.setXYZ(k, ctr.x + (pa.getX(k) - ctr.x) * r * w, ctr.y + (pa.getY(k) - ctr.y) * r * w, ctr.z + (pa.getZ(k) - ctr.z) * r * w); } }
    g.deleteAttribute('uv'); g.computeVertexNormals(); trunkParts.push(g.toNonIndexed());
  };
  limb([[0, -0.2, 0], [0.1, 1.2, 0.05], [-0.15, 2.4, 0.1], [0.05, 3.4, -0.05], [-0.1, 4.6, 0.1], [0.2, 6.2, 0.3]], 0.34, 0.07, 10);
  limb([[0.05, 3.3, 0], [0.9, 3.65, 0.05], [1.8, 3.6, 0.0], [2.6, 3.85, -0.1], [3.2, 4.3, 0.1]], 0.16, 0.035);   // the bough
  limb([[-0.05, 4.0, 0.05], [-0.9, 4.8, 0.3], [-1.6, 5.9, 0.2], [-2.0, 6.6, 0.6]], 0.13, 0.025);
  limb([[0.0, 4.9, 0.1], [0.5, 5.6, -0.6], [0.6, 6.6, -1.0]], 0.1, 0.02);
  limb([[0.1, 2.6, 0.05], [-0.2, 3.0, -0.8], [-0.1, 3.6, -1.5]], 0.08, 0.02, 6);
  limb([[1.2, 3.62, 0.03], [1.4, 4.4, 0.4], [1.3, 5.1, 0.5]], 0.06, 0.015, 6);
  limb([[-0.25, 0.0, 0.1], [-0.8, -0.02, 0.4], [-1.3, -0.1, 0.5]], 0.14, 0.04, 7);   // a root over the ground
  const barkM = new THREE.MeshStandardMaterial({ color: '#4c443c', roughness: 1 });
  sw.add(new THREE.Mesh(merge(trunkParts), barkM));
  const pivot = new THREE.Group(); pivot.position.set(1.75, 3.55, 0); sw.add(pivot);
  const RL = 2.95, ropeM = new THREE.MeshStandardMaterial({ color: '#8d7f63', roughness: 1 });
  const ropes = new THREE.Mesh(merge([-0.24, 0.24].map((x) => { const g = new THREE.CylinderGeometry(0.011, 0.011, RL, 6).translate(x, -RL / 2, 0); g.deleteAttribute('uv'); return g.toNonIndexed(); })), ropeM);
  // (the ropes either side along the bough, x; it swings across it, about x)
  const seat = new THREE.Mesh(B(0.6, 0.04, 0.18, 0, -RL - 0.02, 0), new THREE.MeshStandardMaterial({ color: '#6b5a44', roughness: 0.9, map: boards }));
  const knots = new THREE.Mesh(merge([-0.24, 0.24].map((z) => { const g = new THREE.TorusGeometry(0.03, 0.012, 6, 10).rotateX(Math.PI / 2).translate(z, -0.015, 0); g.deleteAttribute('uv'); return g.toNonIndexed(); })), ropeM);
  pivot.add(ropes, seat, knots);
  const seatHit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.5), new THREE.MeshBasicMaterial()); seatHit.visible = false; seatHit.position.y = -RL + 0.2; pivot.add(seatHit);
  hit(seatHit, '', { action: 'cart-swing', reach: 3 });
  const swing = { a: 0.18, v: 0, push: 0 };
  { const c = Math.cos(SWING.yaw), s = Math.sin(SWING.yaw), x = SWING.x, z = SWING.z; cols.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 }); void c; void s; }
  yield;

  // ----- the pram: a black tub on its springs, its hood half up, sunk to its axles in the hollow -----
  {
    const pr = new THREE.Group(); pr.position.set(PRAM.x, ground(PRAM.x, PRAM.z) - 0.14, PRAM.z); pr.rotation.set(0.12, PRAM.yaw, -0.18); root.add(pr);
    const black = new THREE.MeshStandardMaterial({ color: '#23211f', roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
    const tub = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.62, 0.7, 1.15).translate(0, 0.62, 0);
    const rim = new THREE.TorusGeometry(0.5, 0.018, 6, 32).rotateX(Math.PI / 2).scale(0.62, 1, 1.15).translate(0, 0.62, 0);
    const hood = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI, 0, Math.PI / 2).rotateY(-Math.PI / 2).scale(0.6, 0.5, 0.42).translate(0, 0.63, -0.33);
    const handle = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.22, 0.55, 0.45), new THREE.Vector3(-0.24, 0.9, 0.85), new THREE.Vector3(0, 0.98, 0.95), new THREE.Vector3(0.24, 0.9, 0.85), new THREE.Vector3(0.22, 0.55, 0.45)]);
    const hg = new THREE.TubeGeometry(handle, 20, 0.014, 6, false);
    for (const g of [tub, rim, hood, hg]) g.deleteAttribute('uv');
    pr.add(new THREE.Mesh(merge([tub, rim, hood, hg].map((g) => g.index ? g.toNonIndexed() : g)), black));
    const pw = new THREE.InstancedMesh(P.wheelG, ironM, 2);
    const m = new THREE.Matrix4(); pw.setMatrixAt(0, m.makeScale(1.05, 1.05, 1.05).setPosition(-0.36, 0.3, -0.3)); pw.setMatrixAt(1, m.makeScale(1.05, 1.05, 1.05).setPosition(0.36, 0.3, 0.35));
    pr.add(pw);
    cols.push({ minX: PRAM.x - 0.6, maxX: PRAM.x + 0.6, minZ: PRAM.z - 0.6, maxZ: PRAM.z + 0.6 });
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.4), new THREE.MeshBasicMaterial()); ph.visible = false; ph.position.y = 0.6; pr.add(ph);
    hit(ph, '<b>An old pram</b><div class="k">Sunk to its axles. Empty, except for the mist</div>');
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  void terrain;

  // ----- moving: the swing (on its own, and pushed), the lantern, the music box -----
  return {
    root, cols, hits, box, swing, shedFloor, info, lanternAt: () => lantern.getWorldPosition(new THREE.Vector3()),
    shedAt: (lx, lz) => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), SHED.yaw).add(new THREE.Vector3(SHED.x, Y0 + FL, SHED.z)),
    swingSeat: () => seat.getWorldPosition(new THREE.Vector3()),
    update(dt, t) {
      // the swing: a pendulum, damped, nudged on its own in slow surges, as if someone had just got off it
      const g = 9.8 / RL;
      const drive = 0.22 * Math.max(0, Math.sin(t * 0.13) * Math.sin(t * 0.071 + 1)) + 0.04;
      swing.v += (-g * Math.sin(swing.a) - swing.v * 0.06) * dt;
      if (Math.abs(swing.a) < drive && Math.sign(swing.v) === Math.sign(swing.a || 1)) swing.v += Math.sign(swing.v || 1) * dt * 0.25;
      swing.a += swing.v * dt;
      pivot.rotation.x = swing.a;
      lantern.rotation.z = Math.sin(t * 0.7) * 0.03; lantern.rotation.x = Math.sin(t * 0.53) * 0.02;
      // the box: the lid up while it plays, the little cart turning, the key going round
      box.lid += ((box.playing ? 1 : 0) - box.lid) * (1 - Math.exp(-dt * 4));
      lid.rotation.x = -box.lid * 1.75; fig.visible = box.lid > 0.4; fig.position.y = 0.06 + 0.06 * box.lid;
      if (box.playing) { box.spin += dt * 1.6 * Math.min(1, box.wound / 4 + 0.25); fig.rotation.y = box.spin; key.rotation.x = -box.spin * 0.5; }
    },
    push(dir = 1) { swing.v += dir * 1.4 * (Math.abs(swing.a) < 0.9 ? 1 : 0.3); },
    swingPivot: pivot,
  };
}
