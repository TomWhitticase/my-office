// Her (floors/lisa.js): the woman in the portrait, and then what she is.
// Built as the portrait has her: a young woman, the dark dress with its wide neckline and embroidered band, the darker shawl
// over her left shoulder, honey-coloured sleeves rumpled into folds, dark hair parted in the middle falling in ringlets
// under a fine dark veil, her face the portrait's own (lisa-portrait.js paintFace, projected onto a sculpted head turned
// as it's turned in the painting). Her skirt is cloth: a ring of strips from her waist, hanging, swinging, dragging, caught
// on her knees and the ground (a little verlet net).
// Seated, she sits as she sits in the painting, perfectly still, only her eyes on you. Then: her head turns, and goes on
// turning, too far; her smile splits wide, much too wide, from ear to ear, rows of teeth in it; her skin cracks like old
// varnish, the craquelure spreading over it; her eyes go black. She drops onto all fours and scuttles: prone, face to the
// ground and her head craned up at you, or the other way up, belly to the sky, her head hanging back upside down; her
// elbows and knees bent the wrong way, her arms longer than they were; jerky, out of step, terribly fast; up the walls and
// across the ceiling as easily as the floor (she goes on whatever surface she's on: its normal is her up).
// The limbs are two-bone IK to hands and feet planted where they fall, each lifted when the body's left it too far behind
// (after plain-crawler.js); the bones, knuckles and fingers instanced. Positions are the world's; the floor drives what she
// does (lisa.js), this is how.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp } from '../util.js';
import { EYES, FACE_BOX, MOUTH } from './lisa-portrait.js';
import { peelable } from './lisa-world.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const RW = 960, RH = 1431;
// the head's size (m): half its width, height, depth; the turn the painting's face has, for its projection
const HW = 0.074, HH = 0.112, HD = 0.094, TURN = -0.16;
const FK = 1520;   // ref px a metre, on the face

// ----- the head -----
// The head's surface, out from a unit sphere: an egg, the features pushed out of and into its front (its own frame: +z the
// way she faces, +y up, +x her left... the viewer's right).
function headR(x, y, z) {
  // x, y, z on the unit sphere; returns the scale of the radius there
  const front = sm(0.1, 0.9, z), g = (cx, cy, s) => Math.exp(-(((x - cx) / s) ** 2 + ((y - cy) / s) ** 2));
  let k = 1;
  k += front * (0.13 * g(0, -0.2, 0.1) * sm(-0.48, -0.12, y) + 0.07 * g(0, -0.02, 0.09) + 0.05 * g(0, -0.36, 0.08));   // the nose, its tip
  k += front * 0.03 * (g(0.16, -0.38, 0.06) + g(-0.16, -0.38, 0.06));   // its wings
  k += front * 0.035 * g(0, 0.36, 0.3);   // the brow, smooth and high
  k -= front * 0.085 * (g(0.34, 0.12, 0.15) + g(-0.34, 0.12, 0.15));   // the sockets
  k += front * 0.03 * (g(0.34, 0.1, 0.08) + g(-0.34, 0.1, 0.08));   // the eyes in them
  k += front * 0.05 * (g(0.44, -0.18, 0.2) + g(-0.44, -0.18, 0.2));   // the cheeks, full
  k += front * 0.025 * g(0, -0.47, 0.09) - front * 0.015 * Math.exp(-(((y + 0.53) / 0.025) ** 2)) * sm(0.3, 0.0, Math.abs(x));   // the lips, the line between
  k += front * 0.03 * g(0, -0.58, 0.08);   // the lower lip
  k += front * 0.055 * g(0, -0.82, 0.18);   // the chin
  k -= front * 0.025 * g(0, -0.68, 0.06);   // under the lower lip
  k -= 0.08 * sm(0.0, -0.9, y) * sm(0.3, 0.9, Math.abs(x));   // the jaw narrowing
  return k;
}
// The line the smile splits along, on the face (its own x, y): from the mouth's corners up across the cheeks to the ears
const splitY = (x) => -0.4 - 0.02 * x + 0.32 * sm(0.18, 0.9, Math.abs(x)) ** 1.2;

function headGeo() {
  const g = new THREE.SphereGeometry(1, 72, 54), p = g.attributes.position, uv = g.attributes.uv;
  const jaw = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = headR(x, y, z);
    const X = x * k * HW, Y = y * k * HH * (y < 0 ? 1.04 : 1), Z = z * k * HD * (z > 0 ? 1 : 1.12);
    p.setXYZ(i, X, Y, Z);
    // the face's projection: the head turned as the painting has it, flattened onto the painted face
    const xt = X * Math.cos(TURN) + Z * Math.sin(TURN), px = 470 + xt * FK, py = 352 - Y * FK;
    uv.setXY(i, (px - FACE_BOX[0]) / FACE_BOX[2], (py - FACE_BOX[1]) / FACE_BOX[3]);
    jaw[i] = z > -0.15 && y < splitY(x) ? 1 : 0;
  }
  g.computeVertexNormals();
  g.setAttribute('jaw', new THREE.BufferAttribute(jaw, 1));
  return g;
}
// split a geometry's triangles by an attribute (all three over 0.5, or not), each part non-indexed
function split(g, attr) {
  const n = g.toNonIndexed(), a = n.attributes[attr], keep = [[], []];
  for (let t = 0; t < a.count / 3; t++) keep[a.getX(t * 3) + a.getX(t * 3 + 1) + a.getX(t * 3 + 2) > 1.5 ? 1 : 0].push(t);
  return keep.map((list) => {
    const out = new THREE.BufferGeometry();
    for (const name of Object.keys(n.attributes)) {
      const src = n.attributes[name], sz = src.itemSize, arr = new Float32Array(list.length * 3 * sz);
      list.forEach((t, j) => arr.set(src.array.subarray(t * 3 * sz, t * 3 * sz + 3 * sz), j * 3 * sz));
      out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
    }
    return out;
  });
}

// ----- shapes for the limbs (as plain-crawler.js's: a lathed bone along +y, 0 to 1, instanced scaled) -----
function lathe(profile, segs = 20, sides = 12, ridge = null) {
  const pts = []; for (let i = 0; i <= segs; i++) { const v = i / segs; pts.push(new THREE.Vector2(Math.max(0.02, profile(v)), v)); }
  const g = new THREE.LatheGeometry(pts, sides), p = g.attributes.position;
  if (ridge) for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = ridge(Math.atan2(z, x), y); p.setXYZ(i, x * k, y, z * k); }
  g.computeVertexNormals();
  return g;
}
function lump(seed, d = 2) {
  const g = new THREE.IcosahedronGeometry(1, d), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.12 * Math.sin(x * 4 + seed) * Math.sin(y * 3 - z * 5 + seed * 2); p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals(); return g;
}

// ----- textures -----
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
const silkTex = (R) => canvas(128, 256, (c, w, h) => {   // the sleeves' honey silk: rumpled folds round the arm
  c.fillStyle = '#9b6a2c'; c.fillRect(0, 0, w, h);
  for (let k = 0; k < 140; k++) {
    const y = R() * h, x = R() * w, l = 20 + R() * 70, a = (R() - 0.5) * 0.8;
    c.strokeStyle = `rgba(${R() < 0.5 ? '232,182,98' : '60,34,10'},${0.3 + R() * 0.4})`; c.lineWidth = 2 + R() * 5;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y + Math.sin(a) * 20 + (R() - 0.5) * 10, x + l, y + Math.sin(a) * 40); c.stroke();
  }
});
const dressTex = (R) => canvas(256, 256, (c, w, h) => {   // the dress: dark olive-black, fine pleats
  c.fillStyle = '#23241a'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 3) { c.fillStyle = `rgba(${R() < 0.5 ? '70,72,44' : '8,8,4'},${0.2 + R() * 0.3})`; c.fillRect(x + R(), 0, 1.4, h); }
  for (let k = 0; k < 40; k++) { const g = c.createRadialGradient(R() * w, R() * h, 0, R() * w, R() * h, 30 + R() * 60); g.addColorStop(0, `rgba(${R() < 0.5 ? '60,62,40' : '0,0,0'},.25)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
});
const hairTex = (R) => canvas(256, 256, (c, w, h) => {   // dark brown, a glint of red, strands and ringlets
  c.fillStyle = '#2a170b'; c.fillRect(0, 0, w, h);
  for (let k = 0; k < 900; k++) { c.strokeStyle = `rgba(${R() < 0.4 ? '120,62,28' : R() < 0.5 ? '70,38,16' : '12,6,2'},${0.25 + R() * 0.4})`; c.lineWidth = 0.8 + R() * 1.4; const x = R() * w, y = R() * h, r = 2 + R() * 6; c.beginPath(); c.arc(x, y, r, R() * 6, R() * 6 + 3); c.stroke(); }
  for (let x = 0; x < w; x += 2) { c.fillStyle = `rgba(${R() < 0.5 ? '90,50,22' : '10,5,2'},.18)`; c.fillRect(x, 0, 1, h); }
});

/**
 * @param {() => number} R her own random stream
 * @param {THREE.Texture} faceTex the painted face (lisa-portrait.js paintFace)
 * @param {{ tap?: Function, hit?: Function }} ev
 */
export function makeLisa(R, faceTex, ev = {}) {
  const root = new THREE.Group(), body = new THREE.Group(), chest = new THREE.Group(), headG = new THREE.Group();
  root.add(body); body.add(chest); chest.add(headG);
  // her look's uniforms: cracked (0 to 1), her eyes black, the light in them; and the world's peel, for her too
  const FX = { crack: { value: 0 }, black: { value: 0 }, time: { value: 0 } };

  // ----- the skin: the painted face on the head, the same warm skin elsewhere; cracking -----
  const crackGLSL = `uniform float crack, black, time; varying vec2 vFU;
    float lh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec2 lcell(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)), o = vec2(lh(i + g), lh(i + g + 17.0)), r = g + o - f; float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = lh(i + g + 5.0); } else if (d < d2) d2 = d; }
      return vec2(sqrt(d2) - sqrt(d1), id); }`;
  const skinMat = (map, key, eyes) => {
    const m = new THREE.MeshStandardMaterial({ map, color: map ? '#ffffff' : '#d7b07a', roughness: 0.62, emissive: new THREE.Color('#3a2412'), emissiveIntensity: 0.1 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, FX);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvFU = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${crackGLSL}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          // the craquelure: a web of cracks spreading out over her from the cheek, the flakes between them lifting, dark under
          vec2 cc = lcell(vFU * vec2(52.0, 60.0));
          float spread = smoothstep(crack * 1.6, crack * 1.6 - 0.35, length((vFU - vec2(0.62, 0.55)) * vec2(1.0, 1.2)) * 1.4);
          float line = smoothstep(0.018 + 0.02 * crack, 0.0, cc.x) * spread;
          float lift = step(1.0 - crack * 0.5, cc.y) * spread;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.74, 0.66), lift * 0.7);
          // and gone ashen under them, grey, the warmth out of it
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * vec3(0.92, 0.9, 0.82), spread * crack * 0.65);
          diffuseColor.rgb *= 1.0 - line * 0.97;
          ${eyes ? `
          // her eyes: the portrait's openings, going black and wet
          float eb = 0.0;
          ${EYES.map((e) => `{ vec2 q = (vec2(${((e.u * RW - FACE_BOX[0]) / FACE_BOX[2]).toFixed(4)}, ${((e.v * RH - FACE_BOX[1]) / FACE_BOX[3]).toFixed(4)}) - vFU) / vec2(${(e.w * RW / FACE_BOX[2] / 2 * 1.25).toFixed(4)}, ${(e.h * RH / FACE_BOX[3] / 2 * 1.6).toFixed(4)}); eb = max(eb, smoothstep(1.0, 0.6, length(q))); }`).join('\n')}
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.004, 0.002, 0.002), eb * black);` : ''}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${eyes ? 'roughnessFactor = mix(roughnessFactor, 0.08, eb * black);' : ''}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - line;');
    };
    m.customProgramCacheKey = () => `lisa-skin-${key}`;
    return m;
  };
  faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;
  const faceM = skinMat(faceTex, 'face', true), skinM = skinMat(null, 'skin', false);
  const silkM = peelable(new THREE.MeshStandardMaterial({ map: silkTex(R), roughness: 0.42, metalness: 0.05, color: '#ffffff' }), 'silk', 0.4);
  const dressM = peelable(new THREE.MeshStandardMaterial({ map: dressTex(R), roughness: 0.75, vertexColors: true, side: THREE.DoubleSide }), 'dress', 0.4);
  const hairM = new THREE.MeshStandardMaterial({ map: hairTex(R), roughness: 0.6, color: '#ffffff', side: THREE.DoubleSide });
  const veilM = new THREE.MeshStandardMaterial({ color: '#1a120a', roughness: 0.8, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
  const stockM = new THREE.MeshStandardMaterial({ color: '#1c1610', roughness: 0.7 });
  const mouthM = new THREE.MeshStandardMaterial({ color: '#3a0606', roughness: 0.25, emissive: '#2a0000', emissiveIntensity: 0.6 });
  const toothM = new THREE.MeshStandardMaterial({ color: '#b8a77c', roughness: 0.3 });

  // ----- the head: skull and jaw, split along the smile; the mouth inside; the teeth -----
  const hg = headGeo(), [skullG, jawG] = split(hg, 'jaw');
  const skull = new THREE.Mesh(skullG, faceM), jawPivot = new THREE.Group(), jaw = new THREE.Mesh(jawG, faceM);
  const HINGE = V(0, -0.03, -0.035);   // where the jaw swings from (behind the cheeks, under the ears)
  jawPivot.position.copy(HINGE); jaw.position.copy(HINGE).negate(); jawPivot.add(jaw);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16).scale(HW * 0.9, HH * 0.85, HD * 0.86).translate(0, -0.02, 0.002), mouthM);
  const head = new THREE.Group(); head.add(skull, jawPivot, inner);
  // teeth: a row along each lip of the split, long, thin, too many, pointing into the gap
  const toothG = new THREE.ConeGeometry(0.0034, 0.016, 5).translate(0, -0.008, 0);
  const NT = 58, upper = new THREE.InstancedMesh(toothG, toothM, NT), lower = new THREE.InstancedMesh(toothG, toothM, NT);
  {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = V(0, 0, 0), Sc = V(1, 1, 1);
    for (let k = 0; k < NT; k++) {
      const t = (k + 0.5) / NT, x = (t - 0.5) * 1.8, y = splitY(x), z = Math.sqrt(Math.max(0.02, 1 - x * x - y * y));
      const k2 = headR(x, y, z) * 0.93, s = 0.7 + R() * 0.7;
      P.set(x * k2 * HW, y * k2 * HH * 1.04 + 0.002, z * k2 * HD);
      Q.setFromEuler(E.set((R() - 0.5) * 0.4 - 0.3, 0, (R() - 0.5) * 0.5)); M.compose(P, Q, Sc.set(s, s * (0.7 + R() * 0.8), s)); upper.setMatrixAt(k, M);
      P.y -= 0.004; Q.setFromEuler(E.set(Math.PI + (R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.5)); M.compose(P, Q, Sc.set(s, s * (1 + R()), s));
      M.premultiply(new THREE.Matrix4().makeTranslation(-HINGE.x, -HINGE.y, -HINGE.z)); lower.setMatrixAt(k, M);
    }
  }
  head.add(upper); jawPivot.add(lower);
  upper.frustumCulled = lower.frustumCulled = false;
  // the hair: a shell over the crown and back, parted in the middle, open over the face; falls of ringlets each side
  const hairG = (() => {
    const g = new THREE.SphereGeometry(1, 48, 36), p = g.attributes.position, idx = [], keep = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1.07 + 0.03 * Math.sin(Math.atan2(x, z) * 30) * Math.max(0, y) + 0.04 * Math.max(0, -z);
      p.setXYZ(i, x * HW * k * 1.05, y * HH * k + 0.008, z * HD * k * 1.02 - 0.004);
      // open over the face: in front and below the hairline
      keep[i] = !(z > 0.15 && y < 0.6 - 0.25 * Math.abs(x) && Math.abs(x) < 0.82);
    }
    const ia = g.index.array;
    for (let t = 0; t < ia.length; t += 3) if (keep[ia[t]] && keep[ia[t + 1]] && keep[ia[t + 2]]) idx.push(ia[t], ia[t + 1], ia[t + 2]);
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();
  const hair = new THREE.Mesh(hairG, hairM);
  const fallG = (side) => {   // a fall of ringlets from the temple down past the shoulder
    const c = new THREE.CatmullRomCurve3([V(side * 0.07, 0.02, 0.03), V(side * 0.082, -0.08, 0.01), V(side * 0.09, -0.18, -0.01), V(side * 0.11, -0.28, -0.03), V(side * 0.13, -0.36, -0.05)]);
    const g = new THREE.TubeGeometry(c, 40, 0.03, 10), p = g.attributes.position, cp = V(0, 0, 0);
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / 11) / 40; c.getPointAt(t, cp);
      const dx = p.getX(i) - cp.x, dy = p.getY(i) - cp.y, dz = p.getZ(i) - cp.z, a = Math.atan2(dz, dx);
      const k = (0.7 + 0.5 * t) * (1 + 0.25 * Math.sin(t * 80 + a * 2)) * (1 + 0.15 * Math.sin(a * 5));
      p.setXYZ(i, cp.x + dx * k * (1 + 0.6 * t), cp.y + dy * k, cp.z + dz * k * 0.6);
    }
    g.computeVertexNormals(); return g;
  };
  const falls = new THREE.Mesh(mergeGeometries([fallG(-1), fallG(1)]), hairM);
  // the veil: a fine dark gauze over the hair, down the back to the shoulders
  const veilG = (() => {
    const g = new THREE.SphereGeometry(1, 40, 30, 0, TAU, 0, Math.PI * 0.72), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * HW * 1.22, y * HH * 1.14 + 0.012 - Math.max(0, -y) * 0.1, z * HD * 1.16 - 0.012); }
    g.computeVertexNormals(); return g;
  })();
  const veil = new THREE.Mesh(veilG, veilM); veil.renderOrder = 2;
  head.add(hair, falls, veil);
  head.traverse((o) => { o.castShadow = false; });
  // the head sits on its neck at the top of the chest; the neck itself a tapering tube between them
  headG.add(head);

  // ----- the torso: a bodice, the chest's skin above its wide neckline, the embroidered band, the shawl -----
  // (in the chest's own frame: +y up the spine from the waist, +z the way her chest faces, +x her left)
  const torsoG = (() => {
    const segs = 30, sides = 32, pos = [], col = [], uvs = [], idx = [], sk = [];
    const dark = new THREE.Color('#2a2a1c'), skin = new THREE.Color('#d9b37c'), band = new THREE.Color('#6c5a30'), c = new THREE.Color();
    for (let i = 0; i <= segs; i++) {
      const v = i / segs, y = v * 0.5;
      // the waist narrow, widening to the ribs and the bust, the shoulders broad and round, closing over at the top
      const w = 0.125 + 0.04 * sm(0, 0.5, v) + 0.045 * sm(0.55, 0.85, v) - 0.12 * sm(0.9, 1, v);
      const d = 0.085 + 0.025 * sm(0.3, 0.6, v) - 0.015 * sm(0.75, 0.9, v) - 0.065 * sm(0.9, 1, v);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const bust = sa > 0 ? 0.022 * Math.exp(-(((v - 0.62) / 0.12) ** 2)) * Math.exp(-(((Math.abs(ca) - 0.45) / 0.3) ** 2)) : 0;
        const x = ca * w, z = sa * (d + bust) + 0.01;
        pos.push(x, y + 0.04 * sm(0.85, 1, v) * (1 - Math.abs(ca)) * 0, z);
        // skin above the neckline (in front, a wide shallow curve), the band along it, the dress elsewhere
        const neck = 0.66 + 0.12 * ca * ca, front = sa > -0.15;
        const tone = front && v > neck + 0.035 ? 1 : 0, bnd = front && Math.abs(v - neck - 0.017) < 0.017 ? 1 : 0;
        c.copy(dark).lerp(skin, tone); if (bnd) c.copy(band);
        col.push(c.r, c.g, c.b); uvs.push(j / sides * 3, v * 2); sk.push(tone);
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < sides; j++) { const a = i * (sides + 1) + j, b = a + sides + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.setAttribute('skin', new THREE.Float32BufferAttribute(sk, 1)); g.computeVertexNormals(); return g;
  })();
  // the bodice, and the skin above its neckline (the same surface, split along the neckline)
  const bodiceM = peelable(new THREE.MeshStandardMaterial({ map: dressTex(R), roughness: 0.75, vertexColors: true }), 'bodice', 0.4);
  {   // (the skin above the neckline: the dress's colour going to the skin's, smoothly, along the neckline)
    const pc = bodiceM.onBeforeCompile;
    bodiceM.onBeforeCompile = (sh, r) => {
      pc(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float skin; varying float vSk;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSk = skin;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSk;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat skk = smoothstep(0.35, 0.65, vSk); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.52, 0.3), skk);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, skk);');
    };
    bodiceM.customProgramCacheKey = () => 'lisa-bodice';
  }
  const torso = new THREE.Mesh(torsoG, bodiceM);
  const shawlG = (() => {   // over her left shoulder and down across her back and front
    const g = new THREE.PlaneGeometry(0.2, 0.62, 6, 16), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 0.2 + 0.5, v = p.getY(i) / 0.62 + 0.5, a = (v - 0.5) * Math.PI * 1.05;
      const r = 0.16 + 0.02 * Math.sin(u * 9 + v * 4);
      p.setXYZ(i, 0.1 + u * 0.08 + 0.03 * Math.sin(v * 7), 0.47 + Math.cos(a) * 0.07 - Math.abs(v - 0.5) * 0.5, Math.sin(a) * r);
    }
    g.computeVertexNormals();
    const c = new Float32Array(p.count * 3).fill(0.75); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  })();
  const shawl = new THREE.Mesh(shawlG, dressM);
  // the neck: from between the shoulders up into the head
  const neck = new THREE.Mesh(lathe((v) => 0.042 - 0.006 * v, 6, 14).scale(1, 0.13, 0.92).translate(0, 0.46, 0.0), skinM);
  chest.add(torso, shawl, neck);
  headG.position.set(0, 0.6, 0.0);   // (the head's centre over the neck)

  // ----- the skirt: cloth, a ring of strips hanging from her waist -----
  const NS = 28, NP = 10, SEG = 0.1;
  const cp = new Float32Array(NS * NP * 3), cq = new Float32Array(NS * NP * 3);   // positions, last positions (world)
  const skirtG = (() => {
    const g = new THREE.BufferGeometry(), n = (NS + 1) * NP;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = [], idx = [], col = [];
    for (let i = 0; i <= NS; i++) for (let j = 0; j < NP; j++) { uv.push(i / NS * 4, j / NP * 2); col.push(0.85, 0.85, 0.85); }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NP - 1; j++) { const a = i * NP + j, b = (i + 1) * NP + j; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    return g;
  })();
  const skirt = new THREE.Mesh(skirtG, dressM); skirt.frustumCulled = false;
  // (the skirt and the limbs are worked out in the world's space: not under her root)
  const skirtRoot = new THREE.Group(); skirtRoot.add(skirt);

  // ----- the limbs: sleeves (upper and fore), stockinged legs, hands and feet -----
  const ridgeSilk = (a, v) => 1 + 0.09 * Math.sin(a * 5 + v * 30) * Math.sin(v * 17 + a) + 0.05 * Math.sin(v * 53 + a * 3);
  const upperSleeve = lathe((v) => 1 + 0.25 * Math.sin(v * Math.PI) - 0.15 * v, 16, 14, ridgeSilk);
  const foreSleeve = lathe((v) => 1.05 - 0.25 * sm(0.6, 1, v) + 0.12 * Math.sin(v * Math.PI), 16, 14, ridgeSilk);
  const legG = lathe((v) => 1 - 0.35 * v + 0.12 * Math.exp(-(((v - 0.05) / 0.08) ** 2)), 10, 10);
  const phalG = lathe((v) => 0.8 + 0.25 * Math.exp(-(((v) / 0.15) ** 2)) - 0.12 * Math.sin(v * Math.PI) + 0.15 * Math.exp(-(((v - 1) / 0.12) ** 2)), 10, 8);
  const inst = (g, m, n) => { const x = new THREE.InstancedMesh(g, m, n); x.frustumCulled = false; skirtRoot.add(x); return x; };
  const sleeves = [inst(upperSleeve, silkM, 2), inst(foreSleeve, silkM, 2)], legs = [inst(legG, stockM, 4)];
  const NF = 10;   // five fingers to each hand
  const phals = inst(phalG, skinM, NF * 3), knobs = inst(lump(1), skinM, 2 + NF * 2), knees = inst(lump(2, 1), stockM, 2), palms = inst(lump(5), skinM, 2), feet = inst(lump(7, 1), stockM, 2), joints = inst(lump(3, 1), silkM, 2);

  // ----- moving her -----
  // S: where she is (on her surface: P, its normal N, the way she's heading F), her pose's mix (sit, prone, supine), her
  // speed, and the face's (turn: how far her head's turned, split: the smile, crack, black)
  const S = {
    P: V(0, 0, 0), N: V(0, 1, 0), F: V(0, 0, 1), speed: 0, want: 0, sit: 1, prone: 0, supine: 0, arms: 1, lift: 0, drag: 0, lurch: 0, shud: 0,
    turn: 0, tilt: 0, split: 0, crack: 0, black: 0, look: V(0, 1.6, 2), lookK: 0, hx: 0, hy: 0, hz: 0, twAt: 0, tw: 0, freeze: 0, visible: true,
    lean: 0, rise: 0, arms2: 0, head: null,
  };
  const BASIS = new THREE.Matrix4(), BI = new THREE.Matrix4(), X3 = V(0, 0, 0), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), M = new THREE.Matrix4(), UP = V(0, 1, 0);
  const tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), sca = V(1, 1, 1);
  // her frame: the surface's normal up, the heading forward (projected onto the surface)
  function frame() {
    X3.crossVectors(S.N, S.F); if (X3.lengthSq() < 1e-6) X3.set(1, 0, 0); X3.normalize();
    tmp.crossVectors(X3, S.N).normalize();   // forward, on the surface
    BASIS.makeBasis(X3, S.N, tmp).setPosition(S.P);
    BI.copy(BASIS).invert();
    root.matrixAutoUpdate = false; root.matrix.copy(BASIS); root.updateMatrixWorld(true);
  }
  const toW = (v, out) => out.copy(v).applyMatrix4(BASIS), toL = (v, out) => out.copy(v).applyMatrix4(BI);
  // the limbs: anchors on the body (resolved each frame), lengths, homes on the surface (in her frame), poles
  const LIMBS = [
    { arm: true, side: 1, L: [0.3, 0.28], home: V(0.36, 0, 0.62), foot: V(), from: V(), to: V(), t: -1, dur: 0.3, lift: 0, wait: 0, pair: 0 },
    { arm: true, side: -1, L: [0.3, 0.28], home: V(-0.38, 0, 0.66), foot: V(), from: V(), to: V(), t: -1, dur: 0.3, lift: 0, wait: 0, pair: 1 },
    { arm: false, side: 1, L: [0.43, 0.42], home: V(0.34, 0, -0.62), foot: V(), from: V(), to: V(), t: -1, dur: 0.3, lift: 0, wait: 0, pair: 1 },
    { arm: false, side: -1, L: [0.43, 0.42], home: V(-0.32, 0, -0.66), foot: V(), from: V(), to: V(), t: -1, dur: 0.3, lift: 0, wait: 0, pair: 0 },
  ];
  LIMBS.forEach((l, i) => { l.i = i; l.ph = R() * TAU; });
  const homeL = V(0, 0, 0);
  const homeOf = (l) => homeL.set(l.home.x * (1 + 0.25 * S.supine), 0, l.home.z * (l.arm ? 1 + 0.35 * (S.arms - 1) : 1) * (S.supine ? 1 - 0.3 * S.supine : 1));
  function plant() { for (const l of LIMBS) { toW(homeOf(l), l.foot); l.t = -1; } }

  // two-bone IK (plain-crawler.js's): from a reaching t, the joint bent toward pole, into j
  const dv = V(0, 0, 0), pv = V(0, 0, 0);
  function ik(a, t, L0, L1, pole, j) {
    dv.subVectors(t, a); let d = dv.length();
    if (d > L0 + L1 - 0.005) t.copy(a).addScaledVector(dv.normalize(), L0 + L1 - 0.005);
    d = clamp(d, Math.abs(L0 - L1) + 0.01, L0 + L1 - 0.005); dv.normalize();
    const ca = (L0 * L0 + d * d - L1 * L1) / (2 * L0 * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    pv.copy(pole).addScaledVector(dv, -pole.dot(dv)).normalize();
    j.copy(a).addScaledVector(dv, L0 * ca).addScaledVector(pv, L0 * sa);
  }
  const put = (m, i, a, b, th, tw = 0) => {
    tmp.subVectors(b, a); const len = tmp.length();
    Q.setFromUnitVectors(UP, tmp.multiplyScalar(1 / (len || 1)));
    if (tw) Q.multiply(Q2.setFromAxisAngle(UP, tw));
    M.compose(a, Q, sca.set(th, len, th)); m.setMatrixAt(i, M);
  };
  const putLump = (m, i, p, sx, sy, sz, dir) => {
    if (dir) Q.setFromUnitVectors(V(0, 0, 1), tmp.copy(dir).normalize()); else Q.identity();
    M.compose(p, Q, sca.set(sx, sy, sz)); m.setMatrixAt(i, M);
  };

  // ----- the body's pose: where the pelvis and chest are, which way they face, in her frame -----
  const PEL = V(0, 0, 0), CH = V(0, 0, 0), qBody = new THREE.Quaternion(), qSit = new THREE.Quaternion(), qProne = new THREE.Quaternion(), qSup = new THREE.Quaternion();
  const mB = new THREE.Matrix4();
  // sitting: upright, her body turned three-quarters to her right; prone: chest to the ground, spine forward; supine: chest
  // to the sky, spine forward (head first)
  qSit.setFromEuler(new THREE.Euler(0, -0.42, 0));
  qProne.setFromRotationMatrix(mB.makeBasis(V(1, 0, 0), V(0, 0, 1), V(0, -1, 0)));
  qSup.setFromRotationMatrix(mB.makeBasis(V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0)));
  const shoulder = V(0, 0, 0), hip = V(0, 0, 0), J = V(0, 0, 0), W2 = V(0, 0, 0), POLE = V(0, 0, 0), HD2 = V(0, 0, 0), SD = V(0, 0, 0), PC = V(0, 0, 0), K0 = V(0, 0, 0), K1 = V(0, 0, 0), K2 = V(0, 0, 0), TP = V(0, 0, 0);
  const FL = [[0.055, 0.035, 0.026], [0.062, 0.04, 0.028], [0.06, 0.038, 0.027], [0.052, 0.032, 0.024], [0.045, 0.032, 0.025]];
  // where her hands rest, sitting: folded on the chair's arm (her frame, the chair's under her)
  const SITH = [V(0.2, 0.68, 0.18), V(0.13, 0.7, 0.24)], SITF = [V(0.14, 0.0, 0.42), V(-0.1, 0.0, 0.4)];

  function pose(dt, t) {
    const pr = S.prone, su = S.supine, si = S.sit, run = sm(3, 8, S.speed);
    // the body's orientation in her frame
    qBody.copy(qSit).slerp(qProne, pr / Math.max(1e-3, pr + su) * Math.min(1, pr + su));
    if (su > pr) qBody.copy(qSit).slerp(qSup, su);
    body.quaternion.copy(qBody);
    // the pelvis: on the chair's seat sitting, up off the ground on her limbs otherwise (higher risen, lower running)
    const up = LIMBS.reduce((a, l) => a + (l.t >= 0 ? l.lift * Math.sin(Math.PI * Math.min(1, l.t)) : 0), 0);
    const hgt = lerp(0.5, lerp(0.42, 0.5, su) - 0.1 * run + 0.35 * S.rise + up * 0.15 + S.lurch * 0.05, 1 - si);
    PEL.set(0, hgt, lerp(-0.02, -0.25 * (1 - su) - 0.1 * su, 1 - si));
    body.position.copy(PEL);
    // the spine bends: forward sitting (a little), arched up at the shoulders prone, sagging supine; rocking with the limbs
    const rock = (LIMBS[0].foot.y - LIMBS[1].foot.y) * 0.5, shud = Math.sin(t * 83) * 0.05 * S.shud;
    chest.rotation.set(lerp(0.04, lerp(-0.25, 0.3, su) + 0.1 * run, 1 - si) + shud, 0, rock * (1 - si) + Math.sin(t * 0.9) * 0.01);
    chest.position.set(0, 0.0, 0);
    body.updateMatrix(); body.updateMatrixWorld(true);
  }

  const hp = V(0, 0, 0);
  // ----- the head: looking where it's told; turning too far; the split -----
  // Its default (the way the body's pose holds it: upright sitting; craned up to look ahead prone; hanging back upside down
  // supine, facing the way she goes), turned toward S.look by lookK, then turned on round its neck by S.turn, past where
  // any neck would stop; in jerks, snapping from one angle to the next while she moves.
  const qC = new THREE.Quaternion(), qD = new THREE.Quaternion(), qL = new THREE.Quaternion(), qX = new THREE.Quaternion(), qT = new THREE.Quaternion(), qH = new THREE.Quaternion();
  const CRANE = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2), mL = new THREE.Matrix4(), eul = new THREE.Euler();
  function look(dt, t) {
    const fast = S.speed > 1;
    if (t > S.twAt) { S.twAt = t + (fast ? 0.08 + R() * 0.2 : 0.5 + R() * 1.4); S.tw = (R() - 0.5) * (fast ? 0.6 : 0.08); S.tw2 = (R() - 0.5) * (fast ? 0.4 : 0.05); }
    chest.updateMatrixWorld(true);
    chest.getWorldQuaternion(qC);
    qD.copy(qC).multiply(qX.identity().slerp(CRANE, Math.min(1, S.prone + S.supine)));
    hp.setFromMatrixPosition(headG.matrixWorld);
    mL.lookAt(S.look, hp, S.N); qL.setFromRotationMatrix(mL);
    qH.copy(qD).slerp(qL, S.lookK);
    // into the chest's frame; the turn round the neck, the tilt, the jerks
    qH.premultiply(qT.copy(qC).invert());
    eul.set(S.tw2 || 0, S.turn + (S.tw || 0), S.tilt + Math.sin(t * 61) * 0.04 * S.shud, 'YXZ');
    qH.multiply(qX.setFromEuler(eul));
    headG.quaternion.slerp(qH, Math.min(1, dt * (fast || S.turn > 0.5 ? 30 : 10)));
    // the jaw: dropped and pulled wide (the split runs back to the ears: the whole lower face drops away)
    jawPivot.rotation.x = S.split * 0.75 + Math.sin(t * 40) * 0.03 * S.split * S.shud;
    jawPivot.position.y = HINGE.y - S.split * 0.012;
    inner.visible = upper.visible = lower.visible = S.split > 0.01;
    head.scale.set(1 + S.split * 0.06, 1 + S.split * 0.08, 1);
  }

  // ----- the limbs for this frame -----
  const FW = V(0, 0, 1), homeW = V(0, 0, 0);
  function limbs(dt, t) {
    const sp = S.speed, run = sm(3, 9, sp), stride = 0.3 + sp * 0.08, lead = Math.min(0.45, 0.15 + sp * 0.03);
    const busy = LIMBS.filter((l) => l.t >= 0), most = run > 0.5 ? 3 : 2, pairBusy = busy.length ? busy[0].pair : -1;
    const fw = FW.setFromMatrixColumn(BASIS, 2).normalize();
    for (const l of LIMBS) {
      if (S.sit > 0.5) { l.t = -1; continue; }
      toW(homeOf(l), homeW).addScaledVector(fw, sp * lead);
      if (l.t < 0) {
        l.wait -= dt;
        const far = l.foot.distanceTo(homeW), strain = far > stride * 1.9;
        if (far > stride && (strain || (l.wait <= 0 && busy.length < most && (pairBusy < 0 || pairBusy === l.pair || run > 0.5 || R() < 0.15)))) {
          l.from.copy(l.foot); l.to.copy(homeW).addScaledVector(fw, l.arm ? stride * 0.5 : 0.05);
          l.dur = clamp(0.3 - sp * 0.02, 0.06, 0.3) * (0.6 + R() * 0.8); l.t = 0; l.lift = (l.arm ? 0.24 : 0.16) * (1 - 0.5 * run) * (0.7 + R() * 0.6);
          busy.push(l);
        }
      }
      if (l.t >= 0) {
        l.t += dt / l.dur;
        const u = Math.min(1, l.t), e = u * u * (3 - 2 * u), arc = u < 0.4 ? Math.sin(u / 0.4 * Math.PI / 2) : Math.cos((u - 0.4) / 0.6 * Math.PI / 2) ** 0.6;
        l.foot.lerpVectors(l.from, l.to, e).addScaledVector(S.N, arc * l.lift);
        if (l.t >= 1) { l.t = -1; l.wait = R() < 0.2 ? R() * 0.3 : 0; ev.tap?.(l.foot, sp, l.arm); }
      }
    }
    // each limb: from its anchor on the body to its hand or foot, the joint bent the wrong way
    let fi = 0, ki = 0;
    const armK = S.arms;
    for (const l of LIMBS) {
      const j = l.i & 1, arm = l.arm, s = l.side;
      // the anchor (her frame): a shoulder at the top of the chest, a hip at the pelvis
      if (arm) shoulder.set(s * 0.17, 0.44, 0.0).applyMatrix4(chest.matrixWorld); else hip.set(s * 0.1, -0.02, 0).applyMatrix4(body.matrixWorld);
      const A = arm ? shoulder : hip;
      // the hand or foot: planted in the world, or (sitting) where it rests
      if (S.sit > 0.5) { toW(arm ? SITH[j] : SITF[j], W2); if (!arm) W2.y += 0.04; } else W2.copy(l.foot).addScaledVector(S.N, arm ? 0.04 : 0.06);
      const L0 = l.L[0] * (arm ? armK : 1), L1 = l.L[1] * (arm ? armK : 1);
      // poles: sitting, natural (elbows back and down, knees forward and up); otherwise wrong: elbows up and out and back,
      // knees out to the side and up
      if (S.sit > 0.5) { if (arm) POLE.set(s * 0.3, -0.3, -1); else POLE.set(s * 0.1, 0.5, 1); }
      else if (arm) POLE.set(s * 1.0, 1.4, -0.6 + S.supine * 1.2); else POLE.set(s * 1.2, 1.0, 0.2);
      tmp.copy(POLE).transformDirection(BASIS); POLE.copy(tmp);
      ik(A, W2, L0, L1, POLE, J);
      if (arm) { put(sleeves[0], j, A, J, 0.055, l.ph); put(sleeves[1], j, J, W2, 0.05, l.ph * 2); putLump(joints, j, J, 0.05, 0.05, 0.05, null); }
      else { put(legs[0], j * 2, A, J, 0.065); put(legs[0], j * 2 + 1, J, W2, 0.045); }
      // a hand: out along the forearm's line, flat on the surface (or resting); its fingers long, arched like a spider's legs
      if (arm) {
        HD2.subVectors(W2, J).normalize(); SD.crossVectors(HD2, S.N).normalize();
        const flat = S.sit > 0.5 ? 0 : 1, curl = flat ? Math.min(1, (l.t >= 0 ? 0.6 : 0) + 0.1 * Math.max(0, Math.sin(t * 3 + l.ph))) : 0.35;
        PC.copy(W2).addScaledVector(HD2, 0.05 * armK);
        putLump(palms, j, PC, 0.035, 0.014, 0.05 * armK, HD2);
        putLump(knobs, ki++, W2, 0.024, 0.022, 0.024, null);
        for (let f = 0; f < 5; f++) {
          const thumb = f === 4, L = FL[f], spread = thumb ? -0.9 * s : (f - 1.5) * 0.18 * s;
          tmp.copy(HD2).applyAxisAngle(S.N, spread);
          const fk = armK * (1 + 0.35 * (armK - 1));   // (longer, much longer, as she changes)
          K0.copy(PC).addScaledVector(tmp, thumb ? 0.01 : 0.04 * armK).addScaledVector(SD, thumb ? -0.02 * s : 0);
          K1.copy(K0).addScaledVector(tmp, L[0] * fk * (1 - 0.3 * curl)).addScaledVector(S.N, (0.025 + 0.02 * curl) * flat);
          K2.copy(K1).addScaledVector(tmp, L[1] * fk * (1 - 0.6 * curl)).addScaledVector(S.N, -(0.02 + 0.03 * curl) * flat);
          TP.copy(K2).addScaledVector(tmp, L[2] * fk * (1 - 1.2 * curl)).addScaledVector(S.N, -(0.03) * flat);
          if (!flat) { K1.y -= 0.01; K2.y -= 0.025; TP.y -= 0.04; }
          put(phals, fi++, K0, K1, 0.0085); put(phals, fi++, K1, K2, 0.0075); put(phals, fi++, K2, TP, 0.0062);
          putLump(knobs, ki++, K1, 0.0085, 0.008, 0.0085, null); putLump(knobs, ki++, K2, 0.007, 0.0068, 0.007, null);
        }
      } else {
        HD2.subVectors(W2, J); HD2.addScaledVector(S.N, -HD2.dot(S.N)).normalize();
        putLump(feet, j, tmp.copy(W2).addScaledVector(HD2, 0.06), 0.04, 0.03, 0.11, HD2);
        putLump(knees, j, J, 0.05, 0.05, 0.05, null);
      }
    }
    for (const m of [...sleeves, ...legs, phals, knobs, palms, feet, joints, knees]) m.instanceMatrix.needsUpdate = true;
  }

  // ----- the skirt's cloth -----
  const WR = new Float32Array(NS * 3), cap = [];   // the waist ring (world), the legs' capsules
  for (let k = 0; k < 4; k++) cap.push({ a: V(), b: V(), r: 0.07 });
  const g3 = V(0, 0, 0), wv = V(0, 0, 0);
  let clothOn = false;
  const WC = V(0, 0, 0);
  function waist() {
    WC.set(0, 0.02, 0).applyMatrix4(body.matrixWorld);
    for (let i = 0; i < NS; i++) {
      const a = i / NS * TAU;
      wv.set(Math.cos(a) * 0.16, 0.06, Math.sin(a) * 0.12).applyMatrix4(body.matrixWorld);
      WR[i * 3] = wv.x; WR[i * 3 + 1] = wv.y; WR[i * 3 + 2] = wv.z;
    }
  }
  function cloth(dt, ground) {
    waist();
    if (!clothOn) {   // laid out hanging straight down from the waist, once
      for (let i = 0; i < NS; i++) for (let j = 0; j < NP; j++) { const k = (i * NP + j) * 3; cp[k] = cq[k] = WR[i * 3]; cp[k + 1] = cq[k + 1] = WR[i * 3 + 1] - j * SEG; cp[k + 2] = cq[k + 2] = WR[i * 3 + 2]; }
      clothOn = true;
    }
    const h = Math.min(dt, 1 / 30), damping = 0.985;
    // integrate
    for (let i = 0; i < NS; i++) for (let j = 1; j < NP; j++) {
      const k = (i * NP + j) * 3;
      for (let c = 0; c < 3; c++) { const x = cp[k + c], v = (x - cq[k + c]) * damping; cq[k + c] = x; cp[k + c] = x + v + (c === 1 ? -9.8 * h * h : 0); }
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < NS; i++) { const k = i * NP * 3; cp[k] = WR[i * 3]; cp[k + 1] = WR[i * 3 + 1]; cp[k + 2] = WR[i * 3 + 2]; }
      // along each strip, and round each ring (to its neighbour)
      for (let i = 0; i < NS; i++) for (let j = 0; j < NP; j++) {
        const k = (i * NP + j) * 3;
        if (j < NP - 1) link(k, k + 3, SEG, j === 0 ? 1 : 0.5);
        const ring = ((i + 1) % NS * NP + j) * 3, circ = TAU * (0.13 + j * 0.045) / NS;   // (wider toward the hem)
        link(k, ring, circ, j === 0 ? 1 : 0.5, true);
      }
      // held out from her hips, wider down to the hem; the legs; the ground
      for (let i = 0; i < NS; i++) for (let j = 1; j < NP; j++) {
        const k = (i * NP + j) * 3, rmin = 0.17 + Math.min(j, 6) * 0.025;
        const ex = cp[k] - WC.x, ez = cp[k + 2] - WC.z, eh = Math.hypot(ex, ez);
        if (eh < rmin && eh > 1e-5 && cp[k + 1] < WC.y + 0.05) { cp[k] = WC.x + ex / eh * rmin; cp[k + 2] = WC.z + ez / eh * rmin; }
        for (const c of cap) push(k, c);
        const gy = ground(cp[k], cp[k + 2]) + 0.01;
        if (cp[k + 1] < gy) { cp[k + 1] = gy; cq[k] = lerp(cq[k], cp[k], 0.5); cq[k + 2] = lerp(cq[k + 2], cp[k + 2], 0.5); }
      }
    }
    // to the mesh: the strips round, the first again at the seam; normals from the grid
    const P = skirtG.attributes.position.array, N = skirtG.attributes.normal.array;
    for (let i = 0; i <= NS; i++) for (let j = 0; j < NP; j++) { const s = ((i % NS) * NP + j) * 3, d = (i * NP + j) * 3; P[d] = cp[s]; P[d + 1] = cp[s + 1]; P[d + 2] = cp[s + 2]; }
    for (let i = 0; i <= NS; i++) for (let j = 0; j < NP; j++) {
      const a = ((i === 0 ? NS - 1 : i - 1) * NP + j) * 3, b = ((i === NS ? 1 : i + 1) * NP + j) * 3, c = (i * NP + Math.max(0, j - 1)) * 3, e = (i * NP + Math.min(NP - 1, j + 1)) * 3;
      const tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2], ux = P[e] - P[c], uy = P[e + 1] - P[c + 1], uz = P[e + 2] - P[c + 2];
      let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux; const n = Math.hypot(nx, ny, nz) || 1;
      const d = (i * NP + j) * 3; N[d] = -nx / n; N[d + 1] = -ny / n; N[d + 2] = -nz / n;
    }
    skirtG.attributes.position.needsUpdate = true; skirtG.attributes.normal.needsUpdate = true;
    skirtG.computeBoundingSphere();
  }
  function link(a, b, L, wa, soft = false) {
    const dx = cp[b] - cp[a], dy = cp[b + 1] - cp[a + 1], dz = cp[b + 2] - cp[a + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
    if (soft && d < L) return;   // (round the ring: only stretched, so it gathers)
    const k = (d - L) / d * (soft ? 0.3 : 1);
    const ka = a % (NP * 3) === 0 ? 0 : wa, kb = 1 - ka;
    cp[a] += dx * k * ka; cp[a + 1] += dy * k * ka; cp[a + 2] += dz * k * ka;
    if (b % (NP * 3) !== 0) { cp[b] -= dx * k * kb; cp[b + 1] -= dy * k * kb; cp[b + 2] -= dz * k * kb; }
  }
  function push(k, c) {
    g3.set(cp[k], cp[k + 1], cp[k + 2]);
    const ab = tmp.subVectors(c.b, c.a), t = clamp(tmp2.subVectors(g3, c.a).dot(ab) / (ab.lengthSq() || 1), 0, 1);
    const q = tmp2.copy(c.a).addScaledVector(ab, t), dd = g3.distanceTo(q);
    if (dd < c.r && dd > 1e-5) { g3.sub(q).multiplyScalar(c.r / dd).add(q); cp[k] = g3.x; cp[k + 1] = g3.y; cp[k + 2] = g3.z; }
  }

  // ----- each frame -----
  const LG = [V(), V(), V(), V()];
  return {
    root, skirt: skirtRoot, S, FX, head, headG, chest, body, LIMBS,
    /** her frame from S (P, N, F); plant: her hands and feet where they'd rest */
    place(plantToo = true) { frame(); pose(0, 0); if (plantToo) plant(); },
    update(dt, t, ground) {
      FX.time.value = t;
      FX.crack.value = S.crack; FX.black.value = S.black;
      root.visible = skirt.visible = S.visible;
      if (!S.visible) { clothOn = false; return; }
      if (S.freeze > 0) { S.freeze -= dt; return; }
      S.lurch = Math.max(0, S.lurch - dt * 3); S.shud = Math.max(0, S.shud - dt * 3);
      frame();
      pose(dt, t);
      limbs(dt, t);
      look(dt, t);
      // the legs' capsules for the cloth, from the bones just placed (hips to knees to feet)
      for (const l of LIMBS) if (!l.arm) {
        const j = l.i & 1; hip.set(l.side * 0.1, -0.02, 0).applyMatrix4(body.matrixWorld);
        legs[0].getMatrixAt(j * 2 + 1, M); LG[j].setFromMatrixPosition(M);   // (the knee: where the shin starts)
        cap[j * 2].a.copy(hip); cap[j * 2].b.copy(LG[j]); cap[j * 2].r = 0.085;
        cap[j * 2 + 1].a.copy(LG[j]); cap[j * 2 + 1].b.copy(l.foot); cap[j * 2 + 1].r = 0.06;
      }
      cloth(dt, ground);
    },
    plant, frame,
    setFace(t) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; faceM.map = t; faceM.needsUpdate = true; },
  };
}
