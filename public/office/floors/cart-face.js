// The pull-toy carts of the grey meadow (floors/cart.js): a big red hooded body on wooden spoked wheels with a man's
// face on the front, a little bowler hat on top and a grey pompom tail.
// - The face is sculpted, not modelled by hand: a grid over the front of an ellipsoid (θ round, φ up), pushed along its
//   normal by a sum of soft shapes in metres (the brow, the sockets, cheekbones, the nasolabial folds, jowls, the lips
//   and their downturned corners, the chin), the nose pushed straight out, a little lumpiness. Round each eye the
//   surface is draped over the eyeball itself: inside the opening it's tucked just behind the ball, outside it lies on
//   the ball a lid's thickness proud, so the lids are the face's own skin and the opening's edge is a lid's margin. The
//   opening's shape is what blinks: morph targets for `blink` (shut), `regard` (lids up a little, the inner brows raised,
//   the corners of the mouth less down) and `speak` (the jaw dropped, the lips parted, the mouth's inside darkened in the
//   shader by the `mouth` attribute).
// - Its skin: a colour map and a normal map worked out in the same (θ, φ) as the grid: pale and sallow, ruddy on the
//   nose, cheeks and lids, bruised under the eyes, a shadow of stubble, the lips muted; pores, forehead lines, crow's
//   feet. A physical material with a little sheen, lifted warm in its shadows.
// - The eyes: wet, clear-coated balls with an iris painted round their pole (+z), turned by the cart (gaze).
// - The hood and body: rings of an oval cross-section along the cart, from a lip tucked in behind the face's edge,
//   rolled out over it, swelling into the body and tapering to the tail; soft folds round the face. Felt, with sheen.
// - The hat (a bowler, its brim curled up at the sides), the pompom (fuzz), a wheel (rim, hub and spokes).
// All of it in the cart's own space: +z forward (the way it's pulled), y up from the ground, the face on the front.
// The face's and the skin's arithmetic is cart-sculpt.js, run in a worker (cart-worker.js); here, what's made of it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vn } from './cart-plan.js';
import { FACE, EYE, PEOPLE, eyeZ } from './cart-sculpt.js';

export { FACE, EYE, PEOPLE };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const eyeAt = (p, side) => new THREE.Vector3(side * EYE.x, EYE.y, eyeZ(p));

/** The face's geometry from faceArrays' (cart-sculpt.js, made in the worker): its morphs blink, regard, speak. */
export function faceGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  g.setAttribute('mouth', new THREE.BufferAttribute(a.mouth, 1));
  g.setIndex(new THREE.BufferAttribute(a.idx, 1));
  if (a.tgt.length) {
    g.morphAttributes.position = a.tgt.map((t) => new THREE.BufferAttribute(t, 3));
    g.morphAttributes.normal = a.tgtN.map((t) => new THREE.BufferAttribute(t, 3));
    g.morphTargetsRelative = true;
  }
  g.computeBoundingSphere();
  return g;
}
/** the skin's textures from skinArrays' (cart-sculpt.js) */
export function skinMaps(a, S) {
  const map = new THREE.DataTexture(a.col, S, S); map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.DataTexture(a.nm, S, S);
  for (const t of [map, normalMap]) { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; }
  return { map, normalMap };
}

/** the skin's material: maps from skinMaps; `open` darkens the mouth's inside as it parts (a uniform shared by its carts) */
export function skinMaterial({ map, normalMap }, open = { value: 0 }, tint = '#ffffff') {
  const m = new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.55, 0.55), color: tint, roughness: 0.58, sheen: 0.35, sheenColor: new THREE.Color('#ff9f8a'), sheenRoughness: 0.55,
    emissive: new THREE.Color('#5a2418'), emissiveIntensity: 0.12, emissiveMap: map });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.mouthOpen = open;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float mouth; varying float vMouth;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMouth = mouth;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float mouthOpen; varying float vMouth;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - clamp(vMouth * mouthOpen * 1.6, 0.0, 0.92);');
  };
  m.customProgramCacheKey = () => 'cart-skin';
  return m;
}

// ----- the eyes -----
export function eyeMaterial(R) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const a = (j / S) * Math.PI, around = (i / S) * Math.PI * 2, k = (j * S + i) * 4;   // a: from the pole (+z, the front)
    let r, gg, b;
    if (a < 0.13) { r = 14; gg = 11; b = 10; }   // the pupil
    else if (a < 0.5) {   // the iris: hazel-brown fibres, darker at its rim, a lighter ring round the pupil
      const f = 0.5 + 0.5 * Math.sin(around * 70 + Math.sin(around * 13) * 3) * vn(around * 9, a * 30), t = (a - 0.13) / 0.37;
      const rim = sstep(0.75, 1.0, t), collar = sstep(0.3, 0.05, t);
      r = (92 + 40 * f + 50 * collar) * (1 - rim * 0.65); gg = (70 + 26 * f + 34 * collar) * (1 - rim * 0.65); b = (48 + 14 * f) * (1 - rim * 0.6);
    } else {   // the white, yellowed and veined toward its edges
      const v = Math.max(0, Math.sin(around * 9 + vn(around * 4, a * 6) * 6) - 0.6) * sstep(0.9, 1.6, a);
      r = 218 - 6 * a + v * 20; gg = 206 - 18 * a - v * 70; b = 192 - 22 * a - v * 70;
      const ring = sstep(0.62, 0.5, a); r -= ring * 40; gg -= ring * 40; b -= ring * 36;
    }
    img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  void R;
  return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 });
}
/** an eyeball: its pole (the pupil) on +z */
export const eyeGeometry = () => new THREE.SphereGeometry(EYE.r, 40, 28).rotateX(Math.PI / 2);

// ----- the hood and body -----
// Rings along the cart: [z, centre y, half-width, half-height]; the first a lip tucked in behind the face's edge.
function hoodRings() {
  const cz = FACE.cz, cy = FACE.cy;
  const front = [[cz + 0.08, cy, 0.43, 0.6], [cz + 0.18, cy + 0.01, 0.475, 0.655], [cz + 0.235, cy + 0.015, 0.53, 0.71], [cz + 0.215, cy + 0.02, 0.585, 0.765],
    [cz + 0.14, cy + 0.03, 0.635, 0.81], [cz + 0.02, cy + 0.04, 0.67, 0.84]];
  const body = [];
  const Z0 = cz - 0.1, Z1 = -1.72;
  for (let k = 1; k <= 26; k++) {
    const t = k / 26, z = Z0 + (Z1 - Z0) * t;
    // swelling a little behind the face, then tapering to the tail; drooping toward it
    const r = 0.84 * (1 - 0.05 * Math.sin(t * Math.PI)) * Math.pow(Math.cos(Math.min(1, Math.max(0, (t - 0.45) / 0.55)) * Math.PI / 2), 0.55) + 0.001;
    const y = cy + 0.06 - 0.18 * t * t;
    body.push([z, y, r * 0.8 * (1 + 0.04 * Math.sin(t * Math.PI)), r * (0.94 - 0.1 * t)]);
  }
  return [...front, ...body];
}
export function hoodGeometry() {
  const rings = hoodRings(), A = 72, pos = [], nrmFold = [];
  for (let k = 0; k < rings.length; k++) {
    const [z, y, w, h] = rings[k];
    const fold = k > 0 && k < 9 ? 0.016 * Math.sin(Math.min(1, k / 3) * Math.PI) : 0;
    for (let a = 0; a <= A; a++) {
      const t = (a / A) * Math.PI * 2, f = 1 + fold * Math.sin(t * 11 + k * 0.6) + 0.006 * Math.sin(t * 5 + k);
      pos.push(Math.sin(t) * w * f, y + Math.cos(t) * h * f, z);
    }
    nrmFold.push(fold);
  }
  // the tail's end, closed
  const last = rings[rings.length - 1];
  pos.push(0, last[1], last[0] - 0.02);
  const idx = [];
  for (let k = 0; k < rings.length - 1; k++) for (let a = 0; a < A; a++) {
    const p = k * (A + 1) + a, q = p + A + 1;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const tip = pos.length / 3 - 1, lr = (rings.length - 1) * (A + 1);
  for (let a = 0; a < A; a++) idx.push(lr + a, tip, lr + a + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let k = 0; k < rings.length; k++) for (let a = 0; a <= A; a++) uv.push(a / A * 4, k / rings.length * 3); uv.push(0, 3);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // (wound so its normals face out: checked on the body's top)
  const nTop = g.attributes.normal.getY(10 * (A + 1));
  if (nTop < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
export const HOOD_TOP = { y: FACE.cy + 0.06 + 0.84 * 0.94 - 0.012, z: FACE.cz - 0.3 };   // where the hat sits
export const TAIL = { y: FACE.cy + 0.06 - 0.18, z: -1.74 };

/** felt: its colour, faded (0 to 1) */
export function feltMaterial(color = '#b0382a', R = Math.random) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * 0.06})`; g.fillRect(R() * 128, R() * 128, 1 + R() * 3, 1 + R() * 3); }
  for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(60,30,20,${R() * 0.07})`; g.beginPath(); g.arc(R() * 128, R() * 128, 8 + R() * 22, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhysicalMaterial({ color, map: t, roughness: 0.92, sheen: 0.9, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffd0b8'), 0.45), sheenRoughness: 0.55 });
}

// ----- the hat, the pompom, a wheel -----
export function hatGeometry() {
  const prof = [[0.0001, 0.155], [0.05, 0.152], [0.085, 0.14], [0.112, 0.115], [0.126, 0.08], [0.13, 0.04], [0.13, 0.012], [0.132, 0.008]].map(([r, y]) => new THREE.Vector2(r, y));
  const dome = new THREE.LatheGeometry(prof, 40);
  // the brim: a flat ring, curled up at the sides
  const brim = new THREE.RingGeometry(0.128, 0.205, 48, 2).rotateX(-Math.PI / 2);
  const bp = brim.attributes.position;
  for (let k = 0; k < bp.count; k++) { const x = bp.getX(k), z = bp.getZ(k), r = Math.hypot(x, z), s = Math.max(0, (r - 0.15) / 0.055); bp.setY(k, 0.004 + 0.034 * s * s * (x * x / (r * r))); }
  const under = brim.clone(); under.scale(1, 1, 1); { const p = under.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) - 0.008); } under.index.array.reverse();
  // the band round its foot, a hair proud of the dome
  const band = new THREE.CylinderGeometry(0.1335, 0.1345, 0.03, 40, 1, true).translate(0, 0.026, 0);
  for (const g of [dome, brim, under, band]) { g.deleteAttribute('uv'); g.computeVertexNormals(); }
  return { felt: mergeGeometries([dome, brim, under]), band };
}
export function pompomGeometry(R) {
  const g = new THREE.IcosahedronGeometry(0.17, 5), p = g.attributes.position, v = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); const n = v.clone().normalize(); const s = 1 + 0.16 * (vn(n.x * 9 + 3, n.y * 9 + n.z * 7) - 0.5) + 0.12 * (R() - 0.5); v.copy(n).multiplyScalar(0.17 * s); p.setXYZ(k, v.x, v.y, v.z); }
  g.deleteAttribute('uv'); g.computeVertexNormals();
  return g;
}
export const WHEEL_R = 0.36;
export const K = 1.55;   // every cart's scale in the meadow: the face a head taller than the girl, as in the picture
/** a spoked wheel, its axle along x, its centre at the origin */
export function wheelGeometry() {
  const parts = [];
  const rim = new THREE.TorusGeometry(WHEEL_R - 0.022, 0.024, 6, 40).rotateY(Math.PI / 2); rim.scale(0.75, 1, 1); parts.push(rim);
  const tyre = new THREE.TorusGeometry(WHEEL_R - 0.004, 0.012, 5, 40).rotateY(Math.PI / 2); parts.push(tyre);
  const hub = new THREE.CylinderGeometry(0.055, 0.06, 0.09, 12).rotateZ(Math.PI / 2); parts.push(hub);
  for (let s = 0; s < 10; s++) {
    const a = (s / 10) * Math.PI * 2, sp = new THREE.CylinderGeometry(0.011, 0.015, WHEEL_R - 0.08, 6).translate(0, (WHEEL_R - 0.08) / 2 + 0.045, 0).rotateX(a);
    parts.push(sp);
  }
  for (const g of parts) { g.deleteAttribute('uv'); }
  const g = mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)));
  g.computeVertexNormals();
  return g;
}
export function woodMaterial(R, base = '#9a5a34') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y++) { g.fillStyle = `rgba(${R() < 0.5 ? '40,20,8' : '200,140,90'},${R() * 0.18})`; g.fillRect(0, y, 128, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.72 });
}
// the wheels' places on a cart: [x, z]; the axles under it; the hitch under the chin, where the string's tied
export const WHEELS = [[-0.66, -0.3], [0.66, -0.3], [-0.66, -1.22], [0.66, -1.22]];
export const HITCH = new THREE.Vector3(0, 0.3, FACE.cz + 0.24);
export function chassisGeometry() {
  const parts = [];
  for (const z of [-0.3, -1.22]) parts.push(new THREE.CylinderGeometry(0.022, 0.022, 1.24, 8).rotateZ(Math.PI / 2).translate(0, WHEEL_R, z));
  parts.push(new THREE.BoxGeometry(0.5, 0.05, 1.46).translate(0, WHEEL_R + 0.05, -0.76));
  // the tow bar forward under the chin, and its ring
  parts.push(new THREE.BoxGeometry(0.05, 0.04, 0.72).translate(0, 0.31, FACE.cz - 0.12));
  parts.push(new THREE.TorusGeometry(0.03, 0.007, 6, 16).translate(0, 0.3, FACE.cz + 0.255));
  return mergeGeometries(parts.map((x) => { x.deleteAttribute('uv'); return x.index ? x.toNonIndexed() : x; }));
}
