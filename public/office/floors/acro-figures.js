// The people of the acrobats' coast (floors/acro.js): one body, modelled once per pose and costume and drawn instanced.
// A body is smooth lathed parts (a shaped torso, tapered limbs with rounded ends, a head, hair, hands, shoes), posed by
// its joints, the costume in its vertex colours: the men in loose yellow shirts and red trousers with a slate sash, the
// women in yellow leotards with a red belt. Each vertex also carries `aBreath` (how much it moves as the chest breathes)
// and `aSpine` (the point on the body's own axis it would shrink toward: the viaduct's stone fills the gaps round it).
// Poses: 'base' (standing, hands up round the ankles of the one on its shoulders), 'top' (standing, arms reaching up
// and out), 'chain' (straight, arms overhead: a link in an arch), 'seat' (sitting, arms not included: the audience's
// arms are their own instances, 'arm', so they can clap). q: 'hi' near, 'lo' far.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
export const C = {
  shirt: '#e9c35b', leo: '#ecc85e', red: '#9b3b36', belt: '#b8433a', sash: '#56657d', skin: '#e2a585', hair: '#4b3427', hairF: '#5a3a26',
  shoe: '#3b2c24', coat: '#4d5874', dress: '#6d4a5e', knit: '#7f6a52',
};

// A lathed part round the y axis from a profile [[r, y], ...], its depth squashed by `flat`, stood from a to b.
function lathe(prof, a, b, seg, flat = 1, twist = 0) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);
  g.deleteAttribute('uv');
  if (flat !== 1) g.scale(1, 1, flat);
  if (twist) g.rotateY(twist);
  const d = V().subVectors(b, a), len = d.length();
  g.scale(1, len / prof[prof.length - 1][1], 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  return g.translate(a.x, a.y, a.z);
}
// A capsule from a to b, radius r0 at a and r1 at b, its ends rounded (round a and b).
function capsule(a, b, r0, r1, seg, rows = 3) {
  const len = a.distanceTo(b), prof = [];
  for (let k = 0; k <= rows; k++) { const t = (k / rows) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(r0 * Math.sin(t), 1e-4), -r0 * Math.cos(t))); }
  for (let k = rows; k >= 0; k--) { const t = (k / rows) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(r1 * Math.sin(t), 1e-4), len + r1 * Math.cos(t))); }
  const g = new THREE.LatheGeometry(prof, seg);
  g.deleteAttribute('uv');
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, V().subVectors(b, a).normalize()));
  return g.translate(a.x, a.y, a.z);
}
function ellipsoid(c, rx, ry, rz, ws, hs, phi0 = 0, phiL = Math.PI * 2, th0 = 0, thL = Math.PI) {
  const g = new THREE.SphereGeometry(1, ws, hs, phi0, phiL, th0, thL);
  g.deleteAttribute('uv');
  return g.scale(rx, ry, rz).translate(c.x, c.y, c.z);
}
const tint = (g, col, breath = 0, spine = null) => {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count, c = new THREE.Color(col), a = new Float32Array(n * 3), b = new Float32Array(n), s = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b; }
  const p = g.attributes.position;
  for (let k = 0; k < n; k++) {
    b[k] = typeof breath === 'function' ? breath(p.getY(k)) : breath;
    const sp = spine ? spine(p.getX(k), p.getY(k), p.getZ(k)) : [0, p.getY(k), 0];
    s[k * 3] = sp[0]; s[k * 3 + 1] = sp[1]; s[k * 3 + 2] = sp[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('aBreath', new THREE.BufferAttribute(b, 1));
  g.setAttribute('aSpine', new THREE.BufferAttribute(s, 3));
  return g;
};

// ----- the poses: joint positions, the body standing at the origin facing +z, its feet at y 0 -----
function pose(kind) {
  const J = {};
  const side = (name, l, r) => { J[name + 'L'] = l; J[name + 'R'] = r; };
  const mirror = (v) => V(-v.x, v.y, v.z);
  let hip = 0.95, shoulder = 1.44, lean = 0;
  if (kind === 'seat') {
    J.pelvis = V(0, 0.5, -0.02); J.neck = V(0, 1.06, -0.06);
    side('hip', V(0.1, 0.5, 0), V(-0.1, 0.5, 0));
    side('knee', V(0.12, 0.5, 0.44), V(-0.12, 0.5, 0.44));
    side('ankle', V(0.13, 0.08, 0.5), V(-0.13, 0.08, 0.5));
    side('toe', V(0.14, 0.03, 0.66), V(-0.14, 0.03, 0.66));
    side('shoulder', V(0.19, 1.0, -0.05), V(-0.19, 1.0, -0.05));
    J.head = V(0, 1.18, -0.04);
    return J;
  }
  J.pelvis = V(0, hip, 0); J.neck = V(0, shoulder + 0.06, lean);
  side('hip', V(0.095, hip, 0), V(-0.095, hip, 0));
  const spread = kind === 'chain' ? 0.06 : 0.12;
  side('knee', V(spread, 0.5, 0.03), V(-spread, 0.5, 0.03));
  side('ankle', V(spread + 0.01, 0.08, 0), V(-spread - 0.01, 0.08, 0));
  side('toe', V(spread + 0.03, 0.03, 0.17), V(-spread - 0.03, 0.03, 0.17));
  side('shoulder', V(0.19, shoulder, 0), V(-0.19, shoulder, 0));
  J.head = V(0, shoulder + 0.22, 0.01);
  let el, wr, fi;
  if (kind === 'base') { el = V(0.4, 1.36, 0.08); wr = V(0.25, 1.62, 0.07); fi = V(0.19, 1.7, 0.07); }
  else if (kind === 'top') { el = V(0.36, 1.72, 0.04); wr = V(0.52, 1.98, 0.08); fi = V(0.58, 2.1, 0.09); }
  else if (kind === 'chain') { el = V(0.17, 1.78, 0.02); wr = V(0.12, 2.04, 0.03); fi = V(0.1, 2.17, 0.04); }
  else { el = V(0.24, 1.15, 0.02); wr = V(0.26, 0.88, 0.05); fi = V(0.26, 0.76, 0.06); }
  side('elbow', el, mirror(el)); side('wrist', wr, mirror(wr)); side('finger', fi, mirror(fi));
  return J;
}

/** A body: { geo } in pose `kind` ('base' | 'top' | 'chain' | 'seat'), `sex` ('m' | 'f'), quality 'hi' | 'lo'. */
export function makeBody(kind, sex = 'm', q = 'hi', dress = null) {
  const J = pose(kind), hi = q === 'hi', S = hi ? 12 : 5, L = hi ? 9 : 4, parts = [], f = sex === 'f';
  const add = (g, col, breath, spine) => parts.push(tint(g, col, breath, spine));
  const top = dress?.top || (f ? C.leo : C.shirt), legC = dress?.legs || (f ? C.skin : C.red), armC = f ? C.skin : C.shirt;
  // the torso: hips to the base of the neck, flattened front to back; the chest rises and falls
  const tl = J.neck.distanceTo(J.pelvis) + 0.1;
  const prof = f
    ? [[0.02, 0], [0.12, 0.04], [0.172, 0.13], [0.165, 0.2], [0.122, 0.3], [0.135, 0.4], [0.155, 0.47], [0.165, 0.55], [0.15, 0.6], [0.08, 0.64], [0.05, 0.66]]
    : [[0.02, 0], [0.12, 0.04], [0.16, 0.13], [0.152, 0.2], [0.138, 0.3], [0.155, 0.4], [0.17, 0.48], [0.18, 0.55], [0.16, 0.61], [0.08, 0.65], [0.05, 0.67]];
  const pr = prof.map(([r, y]) => [r, y * tl / 0.67]);
  const t0 = J.pelvis.clone().add(V(0, -0.1, 0)), t1 = J.neck.clone().add(V(0, 0.02, 0));
  const torso = lathe(pr, t0, t1, hi ? 14 : 6, 0.62);
  const tAxis = V().subVectors(t1, t0).normalize();
  const spineOf = (x, y, z) => { const p = V(x, y, z).sub(t0), k = Math.max(0, Math.min(tl, p.dot(tAxis))); return [t0.x + tAxis.x * k, t0.y + tAxis.y * k, t0.z + tAxis.z * k]; };
  const breathOf = (y) => Math.max(0, Math.min(1, (y - (J.pelvis.y + 0.25)) / 0.25)) * Math.max(0, Math.min(1, (J.neck.y - 0.02 - y) / 0.1));
  add(torso, top, breathOf, spineOf);
  // a sash or a belt round the waist, a little proud of the torso
  const wy = J.pelvis.y + (f ? 0.2 : 0.17), wr = (f ? 0.124 : 0.142) + 0.012;
  if (!dress) add(new THREE.TorusGeometry(wr, f ? 0.022 : 0.03, hi ? 6 : 3, hi ? 16 : 7).scale(1, 1, 0.66).rotateX(Math.PI / 2).translate(J.pelvis.x, wy, J.pelvis.z + (J.neck.z - J.pelvis.z) * 0.3), f ? C.belt : C.sash, 0, spineOf);
  if (!f && !dress) {   // the shirt's tail, loose over the trousers' top
    add(lathe([[0.168, 0], [0.172, 0.06], [0.158, 0.12]], J.pelvis.clone().add(V(0, -0.02, 0)), J.pelvis.clone().add(V(0, 0.1, 0)), hi ? 14 : 6, 0.64), top, 0, spineOf);
  }
  // the neck and the head; hair over the crown, a bun for the women; a nose
  const limbSpine = (a, b) => (x, y, z) => { const d = V().subVectors(b, a), l2 = d.lengthSq(), p = V(x, y, z).sub(a), k = Math.max(0, Math.min(1, p.dot(d) / l2)); return [a.x + d.x * k, a.y + d.y * k, a.z + d.z * k]; };
  const hc = J.head, nb = J.neck;
  add(capsule(nb, hc.clone().add(V(0, -0.05, 0)), 0.048, 0.044, hi ? 8 : 4), C.skin, 0, limbSpine(nb, hc));
  add(ellipsoid(hc, 0.088, 0.112, 0.1, hi ? 16 : 6, hi ? 12 : 5), C.skin, 0, () => [hc.x, hc.y, hc.z]);
  add(ellipsoid(hc.clone().add(V(0, 0.022, -0.012)), 0.095, 0.112, 0.104, hi ? 16 : 6, hi ? 8 : 3, 0, Math.PI * 2, 0, Math.PI * 0.52), f ? C.hairF : C.hair, 0, () => [hc.x, hc.y, hc.z]);
  if (f) add(ellipsoid(hc.clone().add(V(0, 0.06, -0.1)), 0.05, 0.048, 0.048, hi ? 8 : 4, hi ? 6 : 3), C.hairF, 0, () => [hc.x, hc.y, hc.z]);
  if (hi) {
    add(capsule(hc.clone().add(V(0, 0.0, 0.09)), hc.clone().add(V(0, -0.035, 0.112)), 0.012, 0.016, 5, 2), C.skin, 0, () => [hc.x, hc.y, hc.z]);
    for (const s of [-1, 1]) add(ellipsoid(hc.clone().add(V(s * 0.087, -0.005, -0.005)), 0.014, 0.026, 0.02, 5, 4), C.skin, 0, () => [hc.x, hc.y, hc.z]);
  }
  // legs: thigh, shin, the shoe; the men's trousers loose, gathered over the shoe
  for (const s of ['L', 'R']) {
    const h = J['hip' + s], k = J['knee' + s], a = J['ankle' + s], t = J['toe' + s];
    add(capsule(h, k, f ? 0.078 : 0.088, f ? 0.054 : 0.07, S, hi ? 3 : 1), legC, 0, limbSpine(h, k));
    add(capsule(k, a, f ? 0.052 : 0.068, f ? 0.036 : 0.06, S, hi ? 3 : 1), legC, 0, limbSpine(k, a));
    add(capsule(a.clone().add(V(0, -0.03, -0.05)), t, 0.045, 0.04, hi ? 8 : 4, hi ? 2 : 1), f ? C.skin : C.shoe, 0, limbSpine(a, t));
  }
  // arms (not for the seated: theirs are 'arm')
  if (kind !== 'seat') for (const s of ['L', 'R']) {
    const sh = J['shoulder' + s], el = J['elbow' + s], wr2 = J['wrist' + s], fi = J['finger' + s];
    add(capsule(sh, el, f ? 0.05 : 0.064, f ? 0.04 : 0.056, S, hi ? 3 : 1), armC, 0, limbSpine(sh, el));
    add(capsule(el, wr2, f ? 0.04 : 0.056, f ? 0.03 : 0.052, S, hi ? 3 : 1), armC, 0, limbSpine(el, wr2));
    if (!f && hi) add(lathe([[0.052, 0], [0.056, 0.02], [0.05, 0.04]], wr2.clone().lerp(el, 0.12), wr2.clone().lerp(el, 0.02), S), C.shirt, 0, limbSpine(el, wr2));   // the cuff
    add(capsule(wr2, fi, 0.034, 0.026, hi ? 8 : 4, hi ? 2 : 1), C.skin, 0, limbSpine(wr2, fi));
  } else {   // the seated: their shoulders, the arms' tops
    for (const s of ['L', 'R']) add(ellipsoid(J['shoulder' + s], 0.06, 0.06, 0.06, S, 5), dress?.top || C.coat, 0, () => [0, J['shoulder' + s].y, 0]);
  }
  return mergeGeometries(parts);
}

/** An audience member's arm, its shoulder at the origin, hanging forward and bent, the hand in front of the chest
 * (x toward the body's middle is -x for the left arm: built for the left, mirrored for the right). */
export function makeArm(q = 'hi', side = 1, coat = C.coat) {
  const hi = q === 'hi', S = hi ? 9 : 4, sh = V(0, 0, 0), el = V(0.02 * side, -0.27, 0.1), wr = V(-0.1 * side, -0.16, 0.31), fi = V(-0.15 * side, -0.12, 0.39);
  const ls = (a, b) => (x, y, z) => { const d = V().subVectors(b, a), p = V(x, y, z).sub(a), k = Math.max(0, Math.min(1, p.dot(d) / d.lengthSq())); return [a.x + d.x * k, a.y + d.y * k, a.z + d.z * k]; };
  return mergeGeometries([
    tint(capsule(sh, el, 0.058, 0.05, S, hi ? 2 : 1), coat, 0, ls(sh, el)),
    tint(capsule(el, wr, 0.05, 0.042, S, hi ? 2 : 1), coat, 0, ls(el, wr)),
    tint(capsule(wr, fi, 0.034, 0.028, hi ? 7 : 4, 1), C.skin, 0, ls(wr, fi)),
  ]);
}

/** The head of a seated figure (so it can turn to look at you): a neck, the head, hair; at the origin, the neck's base. */
export function makeHead(q = 'hi', sex = 'm') {
  const hi = q === 'hi', hc = V(0, 0.15, 0.01), parts = [];
  parts.push(tint(capsule(V(0, -0.02, 0), V(0, 0.09, 0), 0.046, 0.043, hi ? 8 : 4), C.skin));
  parts.push(tint(ellipsoid(hc, 0.087, 0.11, 0.098, hi ? 14 : 6, hi ? 10 : 4), C.skin));
  parts.push(tint(ellipsoid(hc.clone().add(V(0, 0.024, -0.014)), 0.094, 0.11, 0.102, hi ? 14 : 6, hi ? 7 : 3, 0, Math.PI * 2, 0, Math.PI * (sex === 'f' ? 0.62 : 0.5)), sex === 'f' ? C.hairF : C.hair));
  if (hi) parts.push(tint(capsule(hc.clone().add(V(0, 0, 0.088)), hc.clone().add(V(0, -0.034, 0.11)), 0.012, 0.015, 5, 2), C.skin));
  return mergeGeometries(parts);
}
