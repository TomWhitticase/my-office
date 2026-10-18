// The arithmetic of the grey meadow's faces and ground (floors/cart-face.js, cart-land.js): no three.js in it, so the
// worker (cart-worker.js) can run it off the main thread. What it sculpts is described in cart-face.js.

import { vn, CEN, MAP, ground, pathDist } from './cart-plan.js';

// ----- the face's shape: parameters, so the old carts can have their own -----
export const FACE = { rx: 0.555, ry: 0.7, rz: 0.46, cy: 0.9, cz: 0.2 };   // the ellipsoid, its centre in the cart
export const EYE = { x: 0.172, y: 0.085, r: 0.07 };   // the eyes' centres (± x), their radius
const G = (x, y, cx, cy, sx, sy) => { const a = (x - cx) / sx, b = (y - cy) / sy; return Math.exp(-a * a - b * b); };
// distance from (x, y) to the segment (ax, ay)-(bx, by)
const seg = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - ax - dx * t, y - ay - dy * t); };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A face's own character: p.nose (size), p.jowl, p.lip, p.brow, p.age, p.wide, p.droop (the corners), p.lid (how open), p.seed */
export const PEOPLE = [
  { nose: 1, jowl: 1, lip: 1, brow: 1, age: 0.8, wide: 1, droop: 1, lid: 0.66, seed: 1 },          // the cart's own: tired, middle-aged
  { nose: 1.2, jowl: 0.6, lip: 0.8, brow: 1.3, age: 1.3, wide: 0.92, droop: 1.3, lid: 0.45, seed: 2 },   // gaunt, old
  { nose: 0.85, jowl: 1.5, lip: 1.25, brow: 0.8, age: 0.8, wide: 1.08, droop: 0.6, lid: 0.85, seed: 3 },  // heavy, wide awake
  { nose: 1.1, jowl: 1.1, lip: 0.9, brow: 1.1, age: 1.1, wide: 1.0, droop: 1.6, lid: 0.3, seed: 4 },     // nearly asleep
];

// The eye opening at (dx, dy) from the eye's centre (x mirrored so +dx is outward): the signed distance's sign (>0 inside)
// and how far (m). open: 1 the face's own; 0 shut; >1 wider.
function opening(dx, dy, open) {
  const a = dx / 0.09;
  if (Math.abs(a) >= 1) return -Math.min(0.03, (Math.abs(a) - 1) * 0.09 + 0.0001);
  const k = 1 - a * a, lo = -0.028 * Math.pow(k, 0.85) + 0.006 * a - 0.004;   // the lower lid, lowest a little outward
  const up0 = 0.041 * Math.pow(k, 0.7) * (1 - 0.18 * a) + 0.004 * a - 0.002;  // the upper lid, its peak a little inward
  const closed = lo + 0.005 * k;
  const up = closed + (up0 - closed) * open;
  if (up <= lo) return -0.002;
  return Math.min(dy - lo, up - dy);
}

/** the face's surface at grid (θ, φ) for parameters p and a pose { open, regard, jaw }; into o (x, y, z) with the mouth's weight */
function sculpt(th, ph, p, pose, o) {
  const { rx, ry, rz } = FACE;
  const cp = Math.cos(ph), bx = rx * Math.sin(th) * cp * p.wide, by = ry * Math.sin(ph), bz = rz * Math.cos(th) * cp;
  // the base normal of the ellipsoid
  let nx = bx / (rx * rx), ny = by / (ry * ry), nz = bz / (rz * rz); const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
  const x = bx, y = by, ax = Math.abs(x) + 0.004 * Math.sin(p.seed * 3.1) * Math.sign(x);   // (a touch of asymmetry)
  const front = sstep(-0.05, 0.45, Math.cos(th) * cp);
  const reg = pose.regard, jaw = pose.jaw + 0.12;   // (its lips a little apart, always)
  // the mouth's line: the corners turned down; lifted a little in regard; the jaw's drop below it
  const mw = 0.135 * (0.95 + 0.1 * p.lip);
  const ym = -0.335 - 0.034 * p.droop * (1 - 0.45 * reg) * (x / mw) ** 2;
  const below = sstep(ym + 0.01, ym - 0.03, y), jd = jaw * 0.036 * below * (1 - sstep(0.2, 0.42, ax));
  let d = 0;
  // the forehead and brow; the inner brows raised in regard
  d += 0.02 * G(x, y, 0, 0.42, 0.3, 0.15);
  d += 0.034 * p.brow * G(ax, y, 0.15, 0.2, 0.16, 0.045) + 0.012 * G(x, y, 0, 0.19, 0.07, 0.05);
  d += 0.006 * p.age * Math.sin(y * 95) * G(x, y, 0, 0.42, 0.28, 0.1);   // the deepest lines on the forehead, in the shape
  // the sockets, the hollow under the brow, the bags and the tear troughs below
  d -= 0.074 * G(ax, y, EYE.x, EYE.y + 0.01, 0.088, 0.062);
  d -= 0.016 * G(ax, y, 0.18, 0.145, 0.08, 0.028);
  d += 0.02 * p.age * G(ax, y, 0.172, 0.0, 0.07, 0.024);
  d -= 0.014 * p.age * Math.exp(-((seg(ax, y, 0.095, -0.005, 0.26, -0.045) / 0.012) ** 2));
  // cheekbones, the cheeks' fat beside the folds, the temples
  d += 0.04 * G(ax, y, 0.3, -0.04, 0.11, 0.08);
  d += 0.028 * G(ax, y, 0.2, -0.21, 0.1, 0.1);
  d -= 0.04 * G(ax, y, 0.43, 0.22, 0.08, 0.14);
  // the nasolabial folds, the marionette lines, the jowls
  d -= 0.022 * (0.8 + 0.3 * p.age) * Math.exp(-((seg(ax, y, 0.092, -0.14, 0.195, -0.335) / 0.016) ** 2));
  d -= 0.011 * p.age * Math.exp(-((seg(ax, y, 0.15, -0.38, 0.185, -0.5) / 0.014) ** 2));
  d += 0.034 * p.jowl * G(ax, y, 0.26, -0.47, 0.1, 0.09);
  // the muzzle, the lips, the line between them, the corners, the philtrum
  d += 0.05 * G(x, y, 0, -0.3, 0.18, 0.12);
  const lipW = Math.max(0, 1 - (x / (mw * 1.04)) ** 2);
  const bow = 0.012 * G(ax, 0, 0.03, 0, 0.03, 1) - 0.006 * G(x, 0, 0, 0, 0.015, 1);   // cupid's bow
  const uy = y - ym, upT = (0.032 + bow) * p.lip, loT = 0.048 * p.lip;
  d += 0.026 * p.lip * Math.pow(lipW, 0.6) * sstep(0, 0.006, uy) * sstep(upT + 0.008, upT * 0.4, uy);
  d += 0.032 * p.lip * Math.pow(lipW, 0.5) * sstep(0, -0.008, uy) * sstep(-loT - 0.012, -loT * 0.35, uy);
  const lineW = Math.pow(Math.max(0, 1 - (x / (mw * 1.08)) ** 2), 0.4);
  d -= (0.014 + jaw * 0.03) * lineW * Math.exp(-((uy / (0.0045 + jaw * 0.012)) ** 2));
  d -= 0.012 * G(ax, y, mw * 1.02, ym, 0.022, 0.016);
  d -= 0.006 * Math.exp(-((x / 0.012) ** 2)) * sstep(-0.31, -0.285, y) * sstep(-0.21, -0.245, y);
  d += 0.004 * Math.exp(-(((ax - 0.02) / 0.008) ** 2)) * sstep(-0.31, -0.285, y) * sstep(-0.21, -0.245, y);
  // under the lower lip, the chin
  d -= 0.02 * G(x, y, 0, -0.43, 0.1, 0.025);
  d += 0.046 * G(x, y, 0, -0.53, 0.11, 0.07);
  // lumpiness
  d += (vn(x * 22 + p.seed * 7, y * 22) - 0.5) * 0.006 + (vn(x * 7, y * 7 + p.seed) - 0.5) * 0.008;
  d *= front;
  let px = bx + nx * d, py = by + ny * d - jd, pz = bz + nz * d;
  // the nose, pushed straight out: a bridge from between the eyes to a fleshy tip, the wings either side, under it
  const ns = p.nose;
  if (y > -0.3 && y < 0.2) {
    const t = sstep(0.14, -0.17, y);   // 0 at its root, 1 at the tip
    let h = (0.02 + 0.118 * Math.pow(t, 1.2)) * ns;
    h *= sstep(-0.262, -0.205, y);   // turned under to the base
    const w = (0.04 + 0.038 * t) * (0.9 + 0.1 * ns) + 0.014 * G(y, 0, -0.18, 0, 0.04, 1);
    const cross = Math.pow(Math.max(0, 1 - (x / (w * 1.65)) ** 2), 1.7);
    pz += h * cross * front;
    pz += 0.02 * ns * G(x, y, 0, -0.172, 0.046, 0.038) * front;   // the bulb
    // the wings (alae), and the crease round them
    pz += 0.05 * ns * G(ax, y, 0.07, -0.205, 0.036, 0.03) * front;
    pz -= 0.012 * Math.exp(-(((Math.hypot(ax - 0.07, (y + 0.205) / 0.85) - 0.045) / 0.006) ** 2)) * sstep(-0.24, -0.17, y) * front;
    // the nostrils: tucked up under it
    pz -= 0.02 * G(ax, y, 0.034, -0.232, 0.016, 0.01) * front;
  }
  // round each eye: tucked behind the ball inside the opening, draped on it outside
  const side = x < 0 ? -1 : 1, ex = side * EYE.x, ey = EYE.y, er = EYE.r;
  const ez = eyeZ(p), dx = (px - ex) * side, dy = py - ey, rr = dx * dx + dy * dy;
  if (rr < (er * 1.2) ** 2) {
    // the inner brows raised in regard pull the lid up with them a touch
    const open = (pose.open ?? p.lid) * (1 + 0.25 * reg);
    const sd = opening(dx, dy, open);
    const zs = ez + Math.sqrt(Math.max(0, er * er - rr));
    const lid = 0.012 * sstep(0.05, 0.0, -sd) + 0.003;   // a lid's thickness at its margin, thinning away from it
    const w = sstep(er * 1.18, er * 0.96, Math.sqrt(rr));   // (fades to the face itself past the ball's edge)
    const over = Math.max(pz, zs + lid), under = zs - 0.012;
    const m = sstep(-0.0025, 0.0025, sd);   // 1 inside the opening
    pz = pz + (over + (under - over) * m - pz) * w;
  }
  if (reg) py += 0.012 * reg * G(ax, y, 0.1, 0.2, 0.06, 0.05);
  o.x = px; o.y = py; o.z = pz; o.mouth = lineW * Math.exp(-((uy / 0.02) ** 2)) * front;
  return o;
}
// how deep the eyeballs sit: their front just short of where the brow's shadow would be
export const eyeZ = (p) => FACE.rz * Math.sqrt(Math.max(0, 1 - (EYE.x / FACE.rx / p.wide) ** 2 - (EYE.y / FACE.ry) ** 2)) - 0.075 - EYE.r + 0.034;
/** The face's arrays: an nU x nV grid over (θ, φ); morphs: blink, regard, speak (relative, positions and normals).
 * Positions in the face's own space (the ellipsoid's centre at the origin); uv: (θ, φ) over the grid. */
export function faceArrays(p, nU = 240, nV = 300, morphs = true) {
  const T0 = 1.27, P0 = -1.12, P1 = 1.2, n = nU * nV, o = {};
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), mouth = new Float32Array(n);
  const poses = morphs ? [{ open: 0, regard: 0, jaw: 0 }, { regard: 1, jaw: 0 }, { regard: 0, jaw: 1 }] : [];
  const tgt = poses.map(() => new Float32Array(n * 3));
  for (let j = 0; j < nV; j++) {
    const ph = P0 + (P1 - P0) * j / (nV - 1);
    for (let i = 0; i < nU; i++) {
      const th = -T0 + 2 * T0 * i / (nU - 1), k = j * nU + i;
      sculpt(th, ph, p, { regard: 0, jaw: 0 }, o);
      pos[k * 3] = o.x; pos[k * 3 + 1] = o.y; pos[k * 3 + 2] = o.z; mouth[k] = o.mouth;
      uv[k * 2] = i / (nU - 1); uv[k * 2 + 1] = j / (nV - 1);
      for (let m = 0; m < poses.length; m++) {
        sculpt(th, ph, p, poses[m], o);
        tgt[m][k * 3] = o.x - pos[k * 3]; tgt[m][k * 3 + 1] = o.y - pos[k * 3 + 1]; tgt[m][k * 3 + 2] = o.z - pos[k * 3 + 2];
      }
    }
  }
  const idx = gridIndex(nU, nV);
  const nrm = normals(pos, idx), tgtN = tgt.map((t) => {
    const tp = new Float32Array(n * 3); for (let k = 0; k < n * 3; k++) tp[k] = pos[k] + t[k];
    const tn = normals(tp, idx); for (let k = 0; k < n * 3; k++) tn[k] -= nrm[k];
    return tn;
  });
  return { pos, uv, mouth, idx, nrm, tgt, tgtN };
}
export function gridIndex(nU, nV) {
  const idx = new Uint32Array((nU - 1) * (nV - 1) * 6);
  let q = 0;
  for (let j = 0; j < nV - 1; j++) for (let i = 0; i < nU - 1; i++) {
    const a = j * nU + i, b = a + 1, c = a + nU, d = c + 1;
    idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
  }
  return idx;
}
/** smooth vertex normals (area-weighted), as three's computeVertexNormals */
export function normals(pos, idx) {
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { nrm[q] += nx; nrm[q + 1] += ny; nrm[q + 2] += nz; }
  }
  for (let q = 0; q < nrm.length; q += 3) { const l = Math.hypot(nrm[q], nrm[q + 1], nrm[q + 2]) || 1; nrm[q] /= l; nrm[q + 1] /= l; nrm[q + 2] /= l; }
  return nrm;
}

// ----- the skin: colour and normal maps over the grid's (θ, φ) -----
/** The skin's maps over the face grid's (θ, φ): S x S RGBA, { col (sRGB), nm (a normal map) }. */
export function skinArrays(S = 768, p = PEOPLE[0]) {
  const T0 = 1.27, P0 = -1.12, P1 = 1.2, { rx, ry } = FACE;
  const col = new Uint8Array(S * S * 4), hgt = new Float32Array(S * S);
  const skin = [0.79, 0.68, 0.6], ruddy = [0.74, 0.47, 0.42], bruise = [0.56, 0.45, 0.47], lipC = [0.6, 0.38, 0.36], stub = [0.5, 0.48, 0.47], lidC = [0.76, 0.55, 0.52];
  const mix = (c, t, k) => { c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k; };
  const c = [0, 0, 0];
  for (let j = 0; j < S; j++) {
    const ph = P0 + (P1 - P0) * j / (S - 1), cp = Math.cos(ph), y = ry * Math.sin(ph);
    for (let i = 0; i < S; i++) {
      const th = -T0 + 2 * T0 * i / (S - 1), x = rx * Math.sin(th) * cp, ax = Math.abs(x), k = j * S + i;
      c[0] = skin[0]; c[1] = skin[1]; c[2] = skin[2];
      const blot = vn(x * 9, y * 9) - 0.5, fine = vn(x * 60, y * 60) - 0.5;
      // ruddy: the nose and its tip, the cheeks, the lids and the inner corners
      mix(c, ruddy, Math.min(0.7, 0.45 * G(x, y, 0, -0.15, 0.06, 0.12) + 0.45 * G(ax, y, 0.27, -0.12, 0.12, 0.1) + 0.35 * G(ax, y, 0.1, 0.07, 0.04, 0.04) + 0.25 * blot * blot * 4));
      mix(c, lidC, 0.6 * G(ax, y, EYE.x, EYE.y + 0.035, 0.08, 0.03));
      // bruised under the eyes, and in the sockets' inner corners
      mix(c, bruise, 0.55 * G(ax, y, 0.17, 0.02, 0.075, 0.03) + 0.3 * G(ax, y, 0.1, 0.1, 0.03, 0.04));
      // the lips, the line between them darker
      const mw = 0.135, ym = -0.335 - 0.034 * (x / mw) ** 2, uy = y - ym, lw = Math.max(0, 1 - (x / (mw * 1.02)) ** 2);
      mix(c, lipC, 0.75 * Math.pow(lw, 0.5) * (sstep(-0.004, 0.002, uy) * sstep(0.03, 0.018, uy) + sstep(0.004, -0.002, uy) * sstep(-0.045, -0.03, uy)));
      const line = Math.exp(-((uy / 0.004) ** 2)) * Math.pow(lw, 0.3);
      // the nostrils
      const nost = G(ax, y, 0.034, -0.232, 0.014, 0.008);
      // stubble: upper lip, chin, jaw, a speckle
      const beard = (sstep(-0.24, -0.29, y) * (1 - sstep(0.22, 0.32, ax)) * (1 - 0.8 * G(x, y, 0, -0.33, 0.14, 0.05)) + 0.6 * sstep(-0.3, -0.5, y) * sstep(0.12, 0.3, ax));
      const sp = vn(x * 260, y * 260);
      mix(c, stub, Math.min(0.5, beard * (0.18 + 0.4 * Math.max(0, sp - 0.45))));
      // eyebrows: sparse greying hairs along the brow
      const by = 0.205 + 0.03 * Math.cos((ax - 0.16) * 9) - 0.02 * (ax > 0.2 ? (ax - 0.2) * 3 : 0);
      const brow = Math.exp(-(((y - by) / 0.016) ** 2)) * sstep(0.04, 0.07, ax) * sstep(0.29, 0.24, ax) * (0.4 + 0.6 * vn(x * 160, y * 40));
      mix(c, [0.36, 0.31, 0.28], brow * 0.85);
      // the lash line along the upper lid's margin, the lower one fainter; the lid's crease above
      const edx = (ax - EYE.x) / 0.09, ek = Math.max(0, 1 - edx * edx);
      const upY = EYE.y + 0.041 * Math.pow(ek, 0.7) * p.lid * (1 + 0.18 * edx) - 0.002, loY = EYE.y - 0.028 * Math.pow(ek, 0.85) - 0.004;
      const lash = ek > 0 ? Math.exp(-(((y - upY) / 0.0045) ** 2)) * Math.pow(ek, 0.3) : 0, lashLo = ek > 0 ? 0.35 * Math.exp(-(((y - loY) / 0.004) ** 2)) * Math.pow(ek, 0.5) : 0;
      const crease = ek > 0 ? 0.25 * Math.exp(-(((y - upY - 0.018) / 0.006) ** 2)) * Math.pow(ek, 0.6) : 0;
      const shade = 1 + blot * 0.06 + fine * 0.05 - line * 0.45 - nost * 0.6 - lash * 0.6 - lashLo * 0.5 - crease;
      col[k * 4] = Math.max(0, Math.min(255, c[0] * shade * 255)); col[k * 4 + 1] = Math.max(0, Math.min(255, c[1] * shade * 255)); col[k * 4 + 2] = Math.max(0, Math.min(255, c[2] * shade * 255)); col[k * 4 + 3] = 255;
      // the fine relief: pores (most on the nose and cheeks), forehead lines, crow's feet, the fine creases under the eyes
      let h = (vn(x * 420, y * 420) - 0.5) * (0.6 + 0.8 * G(x, y, 0, -0.15, 0.2, 0.15));
      h += 0.9 * p.age * Math.sin(y * 150 + Math.sin(x * 8) * 1.2) * G(x, y, 0, 0.4, 0.26, 0.09);
      const cfx = ax - 0.27, cfy = y - EYE.y, ca = Math.atan2(cfy, cfx);
      h += 0.8 * p.age * Math.sin(ca * 26) * G(ax, y, 0.29, EYE.y, 0.05, 0.05) * sstep(0.24, 0.27, ax);
      h += 0.5 * Math.sin((y - 0.02) * 260) * G(ax, y, 0.17, -0.01, 0.06, 0.02);
      h += 0.3 * Math.sin(Math.atan2(uy, x) * 40) * G(x, y, 0, ym, 0.12, 0.02);   // the lips' vertical lines
      hgt[k] = h;
    }
  }
  // the normal map from the relief
  const nm = new Uint8Array(S * S * 4), K = 1.6;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const k = j * S + i, l = hgt[j * S + Math.max(0, i - 1)], r = hgt[j * S + Math.min(S - 1, i + 1)], d = hgt[Math.max(0, j - 1) * S + i], u = hgt[Math.min(S - 1, j + 1) * S + i];
      let nx = (l - r) * K, ny = (d - u) * K, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      nm[k * 4] = (nx * 0.5 + 0.5) * 255; nm[k * 4 + 1] = (ny * 0.5 + 0.5) * 255; nm[k * 4 + 2] = (nz * 0.5 + 0.5) * 255; nm[k * 4 + 3] = 255;
    }
  }
  return { col, nm };
}

// ----- the ground: a polar grid round the middle (CEN), fine out to 92 m, coarse to the hills; and the map its colour
// reads (r: the distance to the path, 0-8 m) -----
export const GROUND_A = 560;
export function groundArrays() {
  const radii = [];
  for (let r = 0.6; r < 92; r += Math.min(0.62, 0.15 + r * 0.02)) radii.push(r);
  for (let r = 92 * 1.06; r < 1200; r *= 1.07) radii.push(r);
  const A = GROUND_A, nR = radii.length + 1, pos = new Float32Array(nR * A * 3);
  let k = 0;
  for (let a = 0; a < A; a++) { pos[k++] = CEN.x; pos[k++] = ground(CEN.x, CEN.z); pos[k++] = CEN.z; }
  for (let i = 0; i < radii.length; i++) for (let a = 0; a < A; a++) {
    const t = (a / A) * Math.PI * 2, x = CEN.x + Math.cos(t) * radii[i], z = CEN.z + Math.sin(t) * radii[i];
    pos[k++] = x; pos[k++] = ground(x, z); pos[k++] = z;
  }
  const idx = new Uint32Array((nR - 1) * A * 6);
  let q = 0;
  // (wound so its normals point up)
  for (let i = 0; i < nR - 1; i++) for (let a = 0; a < A; a++) {
    const p0 = i * A + a, p1 = i * A + ((a + 1) % A), p2 = p0 + A, p3 = p1 + A;
    idx[q++] = p0; idx[q++] = p1; idx[q++] = p2; idx[q++] = p1; idx[q++] = p3; idx[q++] = p2;
  }
  const nrm = normals(pos, idx);
  const MN = MAP.n, md = new Uint8Array(MN * MN * 4);
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
    const x = MAP.x0 + (i + 0.5) / MN * MAP.w, z = MAP.z0 + (j + 0.5) / MN * MAP.w, kk = (j * MN + i) * 4;
    md[kk] = Math.min(255, pathDist(x, z) / 8 * 255); md[kk + 3] = 255;
  }
  return { pos, idx, nrm, md };
}
