// The portrait on B3 that's a way into her world (floors/lisa.js), painted here: a young woman half-length, seated,
// turned three-quarters to our left, her face turned back toward us; dark hair parted in the middle under a fine dark
// veil, falling in loose ringlets to the shoulders; a dark dress, finely pleated, its wide neckline edged with an
// embroidered knotwork band; a darker shawl over her far shoulder; honey-coloured sleeves rumpled into a hundred folds;
// her hands folded on the arm of a chair, the right over the left. Behind her a low parapet with the sliver of a column's
// base, and beyond it a dreamlike landscape seen from high up: crags and lakes in blue-green haze, a road winding off to
// the left, a bridge on the right, the horizon not level across her. Soft-edged everywhere, smoke rather than lines;
// under old yellow-green varnish, fine-cracked.
// How: her skin, her sleeves, her hair and the crags are relief, lit: a height over the canvas for each (her face an
// ellipsoid with the nose, sockets, lips and chin pushed in and out of it), shaded by one warm light from the upper left
// and blurred a little, so they model softly the way the paint does. Plain shapes and strokes for the rest.
// No three.js and no DOM: OffscreenCanvas only, so it paints in a worker (lisa-paint-worker.js) and never holds up a
// frame. The pane's shader (lisa-painting.js) draws the irises in their openings, so they can follow you, and widens
// the smile round MOUTH. paintFace paints her face alone, for her head in the world (lisa-figure.js).

const TAU = Math.PI * 2;
// Everything below is laid out on a 960 x 1431 canvas (RW x RH) and scaled to the size asked for.
const RW = 960, RH = 1431;

// Where her features are, in the canvas's own 0-1 (u across, v down), for the pane's shader.
export const EYES = [{ u: 400 / RW, v: 0.2297, w: 0.058, h: 0.0136, tilt: 0.05 }, { u: 510 / RW, v: 0.2277, w: 0.056, h: 0.0132, tilt: -0.04 }];
export const IRIS = { r: 0.0118, look: [0.0055, 0.0008] };   // radius (of u); where they rest in their openings
export const MOUTH = { u: 0.466, v: 0.3135, w: 0.058, h: 0.012 };
export const ASPECT = RH / RW;

// ----- small tools -----
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
function hash(x, y) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), ux), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy);
}
const fbm = (x, y, o = 5) => { let v = 0, a = 0.5, s = 1; for (let i = 0; i < o; i++) { v += a * vnoise(x * s + i * 17.3, y * s - i * 9.1); s *= 2.03; a *= 0.5; } return v / (1 - 0.5 ** o); };
// the distance from p to the segment a-b, and how far along it (0-1)
function seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return [Math.hypot(px - ax - dx * t, py - ay - dy * t), t];
}
// inside a closed polygon of [x, y] (ref px): a soft coverage, `f` px of feather, from its signed distance
function polySD(px, py, P) {
  let d = Infinity, s = 1;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i];
    d = Math.min(d, seg(px, py, ax, ay, bx, by)[0]);
    if ((by > py) !== (ay > py) && px < (ax - bx) * (py - by) / (ay - by) + bx) s = -s;
  }
  return s * -d;   // (positive inside)
}
// a smooth closed curve through points, as a polygon of many (for polySD and fills)
function smooth(P, n = 8) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const p0 = P[(i - 1 + P.length) % P.length], p1 = P[i], p2 = P[(i + 1) % P.length], p3 = P[(i + 2) % P.length];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  return out;
}
const bbox = (P, m = 4) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0 - m, y0 - m, x1 + m, y1 + m]; };
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

/**
 * A painter onto a W x H canvas showing the ref canvas from (ox, oy) at S pixels a ref px: relief(), layer(), spot().
 * Light from the upper left, a little toward us.
 */
function painter(W, H, S, ox = 0, oy = 0) {
  const canvas = new OffscreenCanvas(W, H), c = canvas.getContext('2d');
  const L = (() => { const v = [-0.52, -0.58, 0.63], n = Math.hypot(...v); return v.map((x) => x / n); })();
  const Hh = (() => { const v = [L[0], L[1], L[2] + 1], n = Math.hypot(...v); return v.map((x) => x / n); })();
  const scratch = new OffscreenCanvas(W, H), sc = scratch.getContext('2d');
  // a closed path in ref px onto context g
  const path = (g, P) => { g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  // Draw into a clear layer (in ref px: the context is scaled), then lay it down blurred by `blur` ref px.
  function layer(blur, draw, op = 'source-over', alpha = 1) {
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, W, H); sc.setTransform(S, 0, 0, S, -ox * S, -oy * S);
    draw(sc);
    c.save(); c.globalAlpha = alpha; c.globalCompositeOperation = op; if (blur) c.filter = `blur(${(blur * S).toFixed(2)}px)`; c.drawImage(scratch, 0, 0); c.restore();
  }
  // Relief: for every pixel in box (ref px), f(x, y, out) sets out = [h, alpha, r, g, b, spec, gloss, wrap] (h in ref px);
  // shaded and laid down, blurred by `blur`.
  const o = new Float32Array(8), oL = new Float32Array(8), oU = new Float32Array(8);
  const mc = new OffscreenCanvas(W, H), mx = mc.getContext('2d', { willReadFrequently: true });
  // a shape's coverage, feathered by `f` ref px: an alpha per canvas pixel over its box
  function mask(Pg, f = 2.5) {
    mx.setTransform(1, 0, 0, 1, 0, 0); mx.clearRect(0, 0, W, H); mx.filter = `blur(${(f * S * 0.5).toFixed(2)}px)`;
    mx.setTransform(S, 0, 0, S, -ox * S, -oy * S); path(mx, Pg); mx.fillStyle = '#fff'; mx.fill(); mx.filter = 'none';
    const a = mx.getImageData(0, 0, W, H).data, m = new Float32Array(W * H);
    for (let i = 0; i < m.length; i++) m[i] = a[i * 4 + 3] / 255;
    return m;
  }
  // Relief over box (ref px), or over a shape's box with its coverage (`shape`): f(x, y, o, m) sets
  // o = [h, alpha, r, g, b, spec, gloss, wrap] (h in ref px; m the coverage there); shaded and laid down, blurred by `blur`.
  function relief(box, f, { blur = 1, amb = 0.34, key = 0.9, rim = 0, shape = null, feather = 2.5, flat = false } = {}) {
    const m = shape ? mask(shape, feather) : null;
    if (shape) box = bbox(shape);
    const x0 = Math.max(0, Math.floor((box[0] - ox) * S)), y0 = Math.max(0, Math.floor((box[1] - oy) * S)), x1 = Math.min(W, Math.ceil((box[2] - ox) * S)), y1 = Math.min(H, Math.ceil((box[3] - oy) * S));
    if (x1 <= x0 || y1 <= y0) return;
    const img = new ImageData(x1 - x0, y1 - y0), d = img.data, e = 1 / S;
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const cov = m ? m[py * W + px] : 1;
      if (cov < 0.004) continue;
      const x = (px + 0.5) / S + ox, y = (py + 0.5) / S + oy;
      o.fill(0); o[1] = cov; f(x, y, o, cov);
      if (o[1] <= 0.002) continue;
      if (flat) { const i = ((py - y0) * (x1 - x0) + px - x0) * 4; d[i] = clamp(o[2], 0, 1) * 255; d[i + 1] = clamp(o[3], 0, 1) * 255; d[i + 2] = clamp(o[4], 0, 1) * 255; d[i + 3] = clamp(o[1], 0, 1) * 255; continue; }
      oL.fill(0); f(x + e, y, oL); oU.fill(0); f(x, y + e, oU);
      // the normal from the height's slope (x right, y down, z toward you)
      let nx = -(oL[0] - o[0]) / e, ny = -(oU[0] - o[0]) / e, nz = 1;
      const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
      const ndl = nx * L[0] + ny * L[1] + nz * L[2], wrap = o[7] || 0.35, df = Math.max(0, (ndl + wrap) / (1 + wrap));
      const sp = o[5] * Math.max(0, nx * Hh[0] + ny * Hh[1] + nz * Hh[2]) ** (o[6] || 20);
      const rm = rim * (1 - nz) ** 2;
      // warm in the light, cooler and browner turning into shadow (the shadows are a deeper, redder tone, not grey)
      const sh = amb + key * df, k = 1 - df;
      const r = o[2] * sh * (1 + 0.06 * k) + sp + rm * 0.5, g = o[3] * sh * (1 - 0.04 * k) + sp * 0.92 + rm * 0.45, b = o[4] * sh * (1 - 0.16 * k) + sp * 0.7 + rm * 0.3;
      const i = ((py - y0) * (x1 - x0) + px - x0) * 4;
      d[i] = clamp(r, 0, 1) * 255; d[i + 1] = clamp(g, 0, 1) * 255; d[i + 2] = clamp(b, 0, 1) * 255; d[i + 3] = clamp(o[1], 0, 1) * 255;
    }
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, W, H); sc.putImageData(img, x0, y0);
    c.save(); if (blur) c.filter = `blur(${(blur * S).toFixed(2)}px)`; c.drawImage(scratch, 0, 0); c.restore();
  }
  const spot = (g, x, y, rx, ry, col, rot = 0) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
  };
  return { W, H, S, canvas, c, layer, relief, path, spot };
}

// ----- her shapes (ref px) -----
const FACE = smooth([[466, 190], [524, 196], [562, 226], [584, 282], [588, 345], [582, 410], [570, 456], [540, 490], [494, 508], [450, 507], [414, 492], [390, 464], [374, 424], [359, 352], [357, 282], [372, 228], [412, 198]]);
const HAIR_L = smooth([[436, 150], [378, 170], [342, 218], [326, 300], [318, 400], [306, 500], [310, 590], [332, 650], [372, 690], [404, 640], [414, 560], [404, 486], [374, 420], [360, 340], [362, 270], [376, 228], [418, 198]]);
const HAIR_R = smooth([[476, 138], [544, 146], [602, 178], [638, 244], [654, 330], [658, 430], [664, 530], [680, 610], [706, 660], [664, 690], [612, 650], [568, 600], [552, 520], [566, 466], [586, 400], [590, 320], [574, 240], [532, 200]]);
const CROWN = smooth([[464, 126], [524, 130], [582, 160], [614, 206], [592, 240], [548, 206], [470, 191], [400, 204], [362, 240], [352, 214], [382, 160]]);
const NECK = smooth([[402, 456], [474, 502], [560, 452], [566, 540], [580, 640], [480, 670], [392, 646], [398, 550]]);
const CHEST = smooth([[366, 590], [470, 612], [576, 586], [630, 636], [656, 696], [642, 730], [562, 762], [470, 776], [378, 762], [298, 732], [280, 700], [316, 636]]);
const BODY = smooth([[364, 636], [300, 676], [214, 740], [140, 830], [92, 930], [56, 1050], [30, 1200], [10, 1440], [960, 1440], [952, 1260], [928, 1100], [890, 960], [840, 840], [770, 740], [702, 680], [640, 648]], 6);
const SHAWL = smooth([[606, 664], [690, 674], [772, 718], [842, 798], [884, 900], [904, 1010], [884, 1104], [832, 1064], [790, 962], [740, 880], [680, 800], [628, 738]]);
const SLEEVE_L = smooth([[146, 936], [206, 918], [262, 952], [306, 1004], [328, 1062], [314, 1112], [262, 1124], [196, 1096], [130, 1062], [102, 1010]]);
const SLEEVE_R = smooth([[536, 1150], [600, 1122], [684, 1108], [762, 1110], [812, 1128], [828, 1180], [792, 1224], [700, 1234], [610, 1228], [546, 1212]]);
const HAND_R = smooth([[300, 1066], [348, 1052], [404, 1068], [456, 1098], [516, 1128], [560, 1156], [580, 1190], [566, 1216], [536, 1236], [494, 1250], [452, 1240], [404, 1208], [352, 1172], [310, 1130], [294, 1098]]);
const HAND_L = smooth([[232, 1150], [290, 1132], [352, 1144], [412, 1172], [434, 1212], [414, 1262], [376, 1300], [320, 1314], [264, 1302], [232, 1264], [222, 1204]]);
const ARM_CHAIR = [[230, 1250], [520, 1240], [800, 1250], [810, 1290], [520, 1296], [228, 1300]];

// the face's relief: an egg, turned a little to our left, the features pushed out of and into it
const MX = 447;   // where the line down the middle of her face falls (the nose, the lips, the chin)
const mouthY = (x) => 451 - 6 * ((x - MX) / 47) ** 2 - 2.6 * (x - MX) / 47;
function faceH(x, y) {
  const dx = x - 472, dy = y - 350, a = (dx < 0 ? 114 : 124) * (1 - 0.2 * sstep(0.2, 1, dy / 160) ** 1.3), b = 160, q = (dx / a) ** 2 + (dy / b) ** 2;
  let h = 120 * Math.sqrt(Math.max(0, 1 - q));
  h += 7 * gauss(x, y, 458, 270, 84, 30);   // the brow, smooth and high (no brows)
  h -= 13 * gauss(x, y, 400, 330, 33, 18) + 13 * gauss(x, y, 510, 327, 34, 19);   // the sockets, deep and soft
  h += 6 * gauss(x, y, 400, 331, 22, 8) + 6 * gauss(x, y, 510, 329, 22, 8);   // the eyes in them
  h += 3.2 * gauss(x, y, 400, 320, 26, 5) + 3.2 * gauss(x, y, 510, 318, 26, 5);   // the heavy upper lids
  h += 2 * gauss(x, y, 400, 346, 24, 5) + 2 * gauss(x, y, 510, 344, 24, 5);   // and the lower, a little puffed
  // the nose: a soft ridge from between the eyes down to a rounded tip, the wings either side, the nostrils
  const [nd, nt] = seg(x, y, 455, 318, MX - 3, 400);
  h += (6 + 11 * nt) * Math.exp(-((nd / (10 + 7 * nt)) ** 2));
  h += 8 * gauss(x, y, MX - 4, 402, 16, 12) + 5 * gauss(x, y, 426, 408, 11, 9) + 5 * gauss(x, y, 468, 408, 12, 9);
  h -= 6 * gauss(x, y, 433, 415, 7, 3.5) + 6 * gauss(x, y, 460, 415, 7, 3.5);
  // the cheeks, full, the far one turning away; the soft fold from the nose's wing down past the mouth
  h += 9 * gauss(x, y, 398, 384, 32, 36) + 10 * gauss(x, y, 535, 384, 44, 44);
  h -= 2.2 * gauss(x, y, 486, 432, 8, 20);
  // the mouth: the groove under the nose, the upper lip, the line between, the lower lip, the dent under it, the chin
  h -= 2.5 * gauss(x, y, MX - 1, 428, 7, 10);
  const my = mouthY(x), lip = Math.exp(-(((x - MX) / 44) ** 6));
  h += 2.6 * lip * Math.exp(-(((y - my + 6) / 5) ** 2));
  h -= 3.6 * lip * Math.exp(-(((y - my) / 2.2) ** 2));
  h += 4.5 * gauss(x, y, MX + 1, my + 10, 26, 7);
  h -= 3.4 * gauss(x, y, MX + 2, 479, 21, 5);
  h += 7 * gauss(x, y, MX + 4, 493, 28, 15);
  // the jaw, soft, its edge under the far cheek
  h -= 6 * gauss(x, y, 540, 470, 40, 16);
  return h;
}
// a smooth union of two heights (fingers into a hand)
const smax = (a, b, k) => { const h = clamp(0.5 + 0.5 * (a - b) / k, 0, 1); return mix(b, a, h) + k * h * (1 - h); };

/** The portrait: an OffscreenCanvas w wide, the painting's own shape. R: a seeded random. */
export function paintPortrait(R, w = 768) {
  const P = painter(w, Math.round(w * ASPECT), w / RW), { c, W, H, S, layer, relief, path, spot } = P;
  const rnd = (a, b) => a + R() * (b - a);
  c.setTransform(1, 0, 0, 1, 0, 0);

  // ----- the sky: a deep greenish blue-grey above, paler toward the haze; soft clouds -----
  relief([0, 0, RW, 640], (x, y, o) => {
    const t = (y / 640) ** 1.2, n = fbm(x / 170, y / 60, 4);
    o[2] = mix(0.22, 0.66, t) * (0.9 + 0.2 * n); o[3] = mix(0.33, 0.73, t) * (0.9 + 0.2 * n); o[4] = mix(0.3, 0.62, t) * (0.92 + 0.16 * n);
  }, { blur: 3, flat: true });

  // ----- the landscape: tall crags, lakes and valleys, bluer and paler the further off, dissolving into the haze -----
  // the skylines (ref px, the y of the top at x): the left's spires lower and wispier, the right's higher
  const spires = (x, seed, n) => { let v = 0; for (let k = 0; k < n; k++) { const cx = hash(k, seed) * RW, w = 26 + hash(k, seed + 1) * 50, hgt = 30 + hash(k, seed + 2) * 90, u = Math.abs(x - cx) / w; v = Math.max(v, u < 1 ? hgt * Math.cos(u * Math.PI / 2) ** 0.7 : 0); } return v + 16 * fbm(x / 9, seed, 3); };
  const skyL = (x) => 470 - 90 * fbm(x / 70, 1.3, 4) - spires(x, 11, 14) * (1 - sstep(260, 360, x)) - 60 * sstep(380, 0, x);
  const skyR = (x) => 400 - 70 * fbm(x / 60, 7.7, 4) - spires(x, 23, 16) * sstep(600, 700, x) * 0.8 - 20 * sstep(700, 960, x);
  const crag = (x, y, top, o) => {
    const far = sstep(top + 260, top, y) * 0.75 + 0.25;   // (the higher up a crag, the further and hazier)
    const n = fbm(x / 9, y / 60, 5), r = 1 - Math.abs(fbm(x / 22 + 3, y / 130, 4) * 2 - 1);
    o[0] = (r * 30 + n * 16) * (1 - far * 0.5); o[1] = sstep(top - 2, top + 2, y) * (1 - 0.25 * sstep(top + 40, top, y) * far);
    // their feet lost in a pale mist
    const mist = sstep(top + 120, top + 220, y) * 0.5;
    o[2] = mix(mix(0.42, 0.56, far) + 0.05 * n, 0.7, mist); o[3] = mix(mix(0.5, 0.68, far) + 0.05 * n, 0.76, mist); o[4] = mix(mix(0.4, 0.68, far) + 0.03 * n, 0.68, mist); o[7] = 0.7;
  };
  relief([0, 140, 400, 620], (x, y, o) => crag(x, y, skyL(x), o), { blur: 2.6, amb: 0.6, key: 0.5 });
  relief([560, 120, RW, 560], (x, y, o) => crag(x, y, skyR(x), o), { blur: 2.6, amb: 0.6, key: 0.5 });
  // the lakes: still, pale, catching the sky
  layer(2, (g) => {
    let gr = g.createLinearGradient(0, 540, 0, 620); gr.addColorStop(0, '#b9c6b0'); gr.addColorStop(1, '#86a198');
    g.fillStyle = gr; path(g, smooth([[-10, 546], [120, 540], [260, 548], [384, 560], [384, 612], [200, 622], [-10, 618]])); g.fill();
    gr = g.createLinearGradient(0, 400, 0, 470); gr.addColorStop(0, '#c6cfb6'); gr.addColorStop(1, '#9db1a2');
    g.fillStyle = gr; path(g, smooth([[596, 408], [760, 398], [970, 400], [970, 466], [800, 474], [606, 466]])); g.fill();
    for (let k = 0; k < 70; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '222,230,208' : '90,110,100'},${rnd(0.15, 0.35)})`; const right = R() < 0.5; g.fillRect(right ? rnd(606, 960) : rnd(0, 374), right ? rnd(408, 466) : rnd(548, 614), rnd(20, 90), 1.4); }
  });
  // the middle distance: rock shelves and earth, warmer and darker nearer
  const ground = (x, y, o, top) => {
    const n = fbm(x / 26, y / 14, 5), r = 1 - Math.abs(fbm(x / 44 - 4, y / 22, 4) * 2 - 1), near = sstep(600, 860, y);
    o[0] = r * 16 + n * 9; o[1] = sstep(top - 2, top + 2, y);
    o[2] = mix(0.52, 0.5, near) + 0.08 * n; o[3] = mix(0.52, 0.37, near) + 0.05 * n; o[4] = mix(0.4, 0.2, near) + 0.02 * n; o[7] = 0.5;
  };
  relief([0, 590, 430, 900], (x, y, o) => ground(x, y, o, 616 + 40 * fbm(x / 70, 2, 3) - 18 * sstep(250, 430, x)), { blur: 1.7, amb: 0.42, key: 0.72 });
  relief([560, 450, RW, 900], (x, y, o) => ground(x, y, o, 468 + 26 * fbm(x / 60, 5, 3) + 30 * sstep(800, 600, x)), { blur: 1.7, amb: 0.42, key: 0.72 });
  layer(1.4, (g) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    // the road, a ribbon of red earth snaking down and away to the left
    g.strokeStyle = '#a66c3a'; g.lineWidth = 15;
    g.beginPath(); g.moveTo(30, 830); g.bezierCurveTo(230, 812, 250, 770, 110, 752); g.bezierCurveTo(10, 742, 40, 705, 170, 700); g.bezierCurveTo(250, 697, 240, 676, 200, 668); g.stroke();
    g.strokeStyle = 'rgba(196,140,84,.7)'; g.lineWidth = 5; g.stroke();
    // the river: down the valley from the high lake toward us, under the bridge
    g.strokeStyle = '#97ab9c'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(940, 468); g.bezierCurveTo(840, 510, 935, 545, 850, 592); g.bezierCurveTo(790, 626, 820, 650, 760, 690); g.stroke();
    // the bridge: a row of small arches, warm stone, small and far
    const y0 = 640, y1 = 664, x0 = 760, x1 = 900;
    g.fillStyle = '#a7895e'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = '#504a32';
    for (let k = 0; k < 5; k++) { const ax = x0 + (x1 - x0) * (k + 0.5) / 5, r = (x1 - x0) / 13; g.beginPath(); g.moveTo(ax - r, y1); g.arc(ax, y1, r, Math.PI, 0); g.fill(); }
    g.fillStyle = '#c4a57a'; g.fillRect(x0, y0 - 2, x1 - x0, 3);
  });
  // the near ground, dark and warm toward the parapet; the parapet across at shoulder height, the column's base at the left
  layer(4, (g) => { const gr = g.createLinearGradient(0, 780, 0, 880); gr.addColorStop(0, 'rgba(60,44,24,0)'); gr.addColorStop(1, 'rgba(56,40,22,.9)'); g.fillStyle = gr; g.fillRect(0, 780, RW, 110); });
  layer(1.6, (g) => {
    g.fillStyle = '#504529'; g.fillRect(0, 836, 200, 34); g.fillRect(780, 852, 190, 34);
    g.fillStyle = '#76673f'; g.fillRect(0, 834, 200, 6); g.fillRect(780, 850, 190, 6);
    g.fillStyle = '#2a2416'; g.fillRect(0, 870, 200, 600); g.fillRect(780, 886, 190, 600);
    g.fillStyle = '#3b301e'; path(g, smooth([[-10, 732], [30, 736], [52, 760], [46, 800], [56, 836], [-10, 836]])); g.fill();
    spot(g, 22, 762, 28, 12, 'rgba(120,104,70,.55)');
  });

  // ----- her: the dark mass of the dress, then the shawl, the sleeves, the skin, the hair -----
  // the dress: dark olive-black, fine pleats gathered from under the neckline, a little sheen on them
  relief(null, (x, y, o) => {
    const fx = 470 + (x - 470) * 620 / Math.max(120, y - 120), pl = Math.sin(fx / 4.6 + 2 * fbm(x / 90, y / 90, 2)), v = sstep(770, 1060, y);
    const fold = fbm(x / 90, y / 80, 3);
    o[0] = pl * 1.4 * (1 - v * 0.8) + fold * 22;
    o[2] = 0.15 + 0.04 * fold; o[3] = 0.16 + 0.04 * fold; o[4] = 0.085 + 0.02 * fold; o[5] = 0.04; o[6] = 12; o[7] = 0.5;
  }, { shape: BODY, blur: 1.4, amb: 0.42, key: 0.8 });
  // the shawl: off her far shoulder and down, darker, in broad soft folds, its twisted end lying across her
  relief(null, (x, y, o, m) => {
    const a = (x - 600) * 0.6 + (y - 680) * 0.8, fold = Math.sin(a / 18 + 2.2 * fbm(x / 60, y / 60, 2)) * 0.5 + 0.5;
    o[0] = fold * 10 + fbm(x / 40, y / 40, 3) * 12; o[1] = m * 0.94;
    o[2] = 0.23; o[3] = 0.21; o[4] = 0.11; o[5] = 0.06; o[6] = 10; o[7] = 0.4;
  }, { shape: SHAWL, blur: 1.6, amb: 0.4, key: 0.8 });
  relief([660, 760, 880, 900], (x, y, o) => {   // the twisted end
    const [d, t] = seg(x, y, 690, 790, 840, 860), r = 22 * (1 - 0.4 * t);
    if (d > r) { o[1] = 0; return; }
    const tw = Math.sin(t * 22 + (d / r) * 2.5);
    o[0] = Math.sqrt(1 - (d / r) ** 2) * r * 0.6 + tw * 3; o[1] = sstep(r, r - 3, d);
    o[2] = 0.46; o[3] = 0.38; o[4] = 0.2; o[5] = 0.08; o[6] = 12;
  }, { blur: 1.3 });
  // the sleeves: honey silk rumpled into folds across the arm, each catching the light along its ridge
  const sleeve = (Pg, ax, ay, bx, by) => relief(null, (x, y, o) => {
    const [d, t] = seg(x, y, ax, ay, bx, by), rr = 72;
    const tube = Math.sqrt(Math.max(0, 1 - (d / rr) ** 2)) * 44;
    // folds: across the arm, broken, bunched and wandering, a few big ones and many small
    const wob = fbm(x / 40, y / 40, 3), u = t * 240 + 30 * fbm(x / 50, y / 50, 3);
    const big = 1 - Math.abs(fbm(u / 9, d / 34 + wob, 3) * 2 - 1), small = fbm(x / 12, y / 12, 2);
    o[0] = tube + big ** 2 * 12 + small * 1.5;
    o[2] = 0.66 + 0.12 * wob; o[3] = 0.44 + 0.07 * wob; o[4] = 0.17; o[5] = 0.3; o[6] = 8; o[7] = 0.2;
  }, { shape: Pg, blur: 1.4, amb: 0.26, key: 0.95 });
  sleeve(SLEEVE_L, 140, 960, 300, 1090);
  sleeve(SLEEVE_R, 820, 1170, 560, 1180);
  // the chair's arm: dark wood across the bottom, a turned post at its end
  relief([200, 1230, 830, 1440], (x, y, o) => {
    const inside = polySD(x, y, ARM_CHAIR), post = Math.abs(x - 252) < 30 - 8 * Math.sin((y - 1290) / 16) && y > 1280;
    if (inside < -2 && !post) { o[1] = 0; return; }
    o[0] = post ? Math.sqrt(Math.max(0, 1 - ((x - 252) / 30) ** 2)) * 20 : Math.sqrt(Math.max(0, 1 - ((y - 1272) / 28) ** 2)) * 18;
    o[1] = 1; o[2] = 0.3; o[3] = 0.19; o[4] = 0.1; o[5] = 0.12; o[6] = 16;
  }, { blur: 1.2, amb: 0.35, key: 0.8 });

  // the skin: warm yellow, the shadows a deeper umber
  const SKIN = [0.9, 0.72, 0.44];
  const skin = (o, h, rose = 0) => { o[0] = h; o[2] = SKIN[0] + rose * 0.03; o[3] = SKIN[1] - rose * 0.07; o[4] = SKIN[2] - rose * 0.05; o[5] = 0.05; o[6] = 14; o[7] = 0.5; };
  const shade = (o, k) => { o[2] *= k; o[3] *= k; o[4] *= k * 0.96; };
  // the chest: broad and lit, the hair's shadow on its far side
  relief(null, (x, y, o) => {
    let h = 80 * Math.sqrt(Math.max(0, 1 - ((x - 462) / 230) ** 2 - ((y - 720) / 190) ** 2));
    h -= 5 * gauss(x, y, 470, 618, 26, 16);   // the pit of the throat
    h += 2.5 * gauss(x, y, 410, 644, 50, 6) + 2.5 * gauss(x, y, 535, 638, 50, 6);   // the collarbones, barely
    skin(o, h);
    shade(o, 1 - 0.42 * sstep(540, 652, x) - 0.18 * sstep(380, 290, x) - 0.3 * gauss(x, y, 520, 600, 60, 26));
  }, { shape: CHEST, blur: 2.4 });
  // the neck: round, its far side and under the jaw in shadow
  relief(null, (x, y, o) => {
    skin(o, 64 * Math.sqrt(Math.max(0, 1 - ((x - 478) / 112) ** 2)));
    shade(o, 0.84 - 0.5 * gauss(x, y, 490, 508, 100, 30) - 0.3 * sstep(500, 575, x) - 0.12 * sstep(440, 396, x) + 0.08 * sstep(560, 650, y));
  }, { shape: NECK, blur: 2.6 });
  // the neckline's embroidery: a band of interlaced loops, and the pleats gathered under it
  layer(0.7, (g) => {
    const edge = (t) => { const x = 290 + t * 360; return [x, 770 - 30 * (1 - ((x - 462) / 175) ** 2) * 0.9 - (x > 560 ? (x - 560) * 0.35 : 0)]; };
    g.lineWidth = 13; g.strokeStyle = '#3a3018'; g.lineCap = 'round'; g.beginPath();
    for (let k = 0; k <= 80; k++) { const [x, y] = edge(k / 80); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    for (let k = 0; k < 70; k++) {
      const [x, y] = edge((k + 0.5) / 70);
      g.strokeStyle = `rgba(184,152,90,${rnd(0.5, 0.8)})`; g.lineWidth = 1.3;
      g.beginPath(); g.ellipse(x, y, 3.2, 3.6, k * 0.6, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(x - 3, y + 4); g.lineTo(x + 3, y - 4); g.stroke();
    }
    for (let k = 0; k < 90; k++) {
      const [x, y] = edge(k / 90);
      g.strokeStyle = `rgba(${R() < 0.5 ? '110,108,62' : '20,20,10'},.4)`; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y + 9); g.lineTo(x + rnd(-5, 5), y + 40); g.stroke();
    }
  });
  paintFaceOn(P, skin, shade);

  // the hair: dark umber, a glint of red in it, ringlets packed down each side catching the light
  const ringlets = (x, y, side) => {
    // packed coils: the nearest of a jittered grid of them, each a ring
    const cx = x / 9, cy = y / 8 + side, ix = Math.floor(cx), iy = Math.floor(cy);
    let best = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const sx = ix + i + 0.5 + (hash(ix + i, iy + j) - 0.5) * 0.7, sy = iy + j + 0.5 + (hash(iy + j, ix + i + 5) - 0.5) * 0.7;
      const dd = Math.hypot((cx - sx) * 9, (cy - sy) * 8), r = 3.4 + hash(ix + i + 9, iy + j) * 2;
      best = Math.max(best, Math.exp(-(((dd - r) / 1.5) ** 2)));
    }
    return best;
  };
  const hairF = (side) => (x, y, o) => {
    const curl = sstep(300, 440, y) * 0.8 + 0.2, strands = Math.sin(x / 2.4 + fbm(x / 20, y / 50, 2) * 9) * 0.5 + 0.5;
    const rg = ringlets(x, y, side);
    o[0] = mix(strands * 1.4, rg * 2.6, curl) + fbm(x / 30, y / 60, 3) * 14;
    const red = fbm(x / 40 + side, y / 50, 3) * (0.6 + 0.6 * rg * curl);
    o[2] = 0.2 + 0.32 * red * red; o[3] = 0.11 + 0.1 * red * red; o[4] = 0.05 + 0.03 * red; o[5] = 0.06; o[6] = 16; o[7] = 0.15;
  };
  relief(null, hairF(0), { shape: HAIR_L, blur: 1.3, amb: 0.3, key: 0.85, feather: 7 });
  relief(null, hairF(3), { shape: HAIR_R, blur: 1.3, amb: 0.3, key: 0.85, feather: 7 });
  relief(null, (x, y, o) => {   // the crown: smooth, combed down from the parting
    const a = Math.atan2(y - 120, x - 466), st = Math.sin(a * 150 + fbm(x / 30, y / 30, 2) * 4) * 0.5 + 0.5;
    o[0] = 50 * Math.sqrt(Math.max(0, 1 - ((x - 470) / 170) ** 2 - ((y - 230) / 120) ** 2)) + st * 1.4;
    o[2] = 0.26; o[3] = 0.15; o[4] = 0.07; o[5] = 0.12; o[6] = 22; o[7] = 0.3;
  }, { shape: CROWN, blur: 1.4, amb: 0.3, key: 0.85 });
  // the veil: a fine dark gauze over the hair, its edge across the top of the forehead, hanging past the hair on our left
  layer(1.4, (g) => {
    g.strokeStyle = 'rgba(46,30,14,.5)'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(366, 238); g.bezierCurveTo(410, 204, 520, 202, 574, 232); g.stroke();
    g.fillStyle = 'rgba(28,22,14,.3)'; path(g, smooth([[352, 212], [320, 300], [302, 420], [292, 540], [302, 640], [322, 680], [320, 560], [328, 420], [340, 300]])); g.fill();
    g.fillStyle = 'rgba(28,22,14,.16)'; path(g, CROWN); g.fill();
    spot(g, 452, 216, 70, 14, 'rgba(30,22,12,.16)');
  });

  // the hands: the right lying over the left wrist; the left curled over the chair's arm
  const fingers = (list, x, y) => {   // [ax, ay, bx, by, r]: a finger's capsule, tapering; the highest one wins
    let best = 0;
    for (const [ax, ay, bx, by, r] of list) {
      const [d, t] = seg(x, y, ax, ay, bx, by), rr = r * (1 - 0.22 * t);
      if (d < rr) best = Math.max(best, Math.sqrt(1 - (d / rr) ** 2) * rr * 0.75 + 4 * (1 - t));
    }
    return best;
  };
  // (each a back, an ellipse, and fingers; covered where either is)
  const handF = (bx, by, ax, ay, rot, FL, lift, kn) => (x, y, o) => {
    const c0 = Math.cos(rot), s0 = Math.sin(rot), u = ((x - bx) * c0 + (y - by) * s0) / ax, v = (-(x - bx) * s0 + (y - by) * c0) / ay, q = u * u + v * v;
    const back = 30 * Math.sqrt(Math.max(0, 1 - q)), f = fingers(FL, x, y);
    const cov = Math.max(sstep(1.02, 0.94, q), f > 0.5 ? sstep(0.5, 2.5, f) : 0);
    if (cov <= 0) { o[1] = 0; return; }
    let k = 0; for (const p of FL) k += gauss(x, y, p[0], p[1], 9, 9);
    skin(o, smax(back, f + lift, 6) + kn * k); o[1] = cov;
  };
  const LF = [[300, 1220, 266, 1294, 13.5], [326, 1228, 300, 1306, 13.5], [352, 1232, 334, 1304, 13], [378, 1228, 366, 1290, 12], [420, 1178, 470, 1196, 15]];
  relief([200, 1120, 450, 1330], (x, y, o) => {
    handF(328, 1186, 100, 56, 0.12, LF, 10, 0)(x, y, o);
    shade(o, 1 - 0.3 * sstep(1170, 1120, y) - 0.18 * sstep(1260, 1310, y));   // (under the other hand; turning under at the tips)
  }, { blur: 1.6 });
  const RF = [[452, 1118, 572, 1182, 13.5], [442, 1138, 558, 1206, 14], [430, 1156, 534, 1228, 13.5], [414, 1170, 498, 1240, 12.5], [300, 1080, 340, 1100, 26]];
  relief([280, 1030, 600, 1260], handF(384, 1118, 112, 54, 0.42, RF, 12, 2.5), { blur: 1.6 });

  // ----- the shadow pooling round her, the light falling off toward the corners -----
  layer(60, (g) => {
    const gr = g.createRadialGradient(470, 600, 220, 470, 620, 900); gr.addColorStop(0, 'rgba(10,12,4,0)'); gr.addColorStop(1, 'rgba(10,12,4,.6)');
    g.fillStyle = gr; g.fillRect(0, 0, RW, RH);
  });
  // ----- the varnish: everything yellowed and greened, the darks sunk -----
  c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = '#efe2a8'; c.fillRect(0, 0, W, H); c.restore();
  c.save(); c.globalCompositeOperation = 'soft-light'; c.fillStyle = 'rgba(110,130,60,.14)'; c.fillRect(0, 0, W, H); c.restore();
  // ----- the paint's grain, and the craquelure: a fine web of cells over all of it, its cracks showing most in the lights -----
  const img = c.getImageData(0, 0, W, H), d = img.data, cell = 7 * S;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    // the distance to the nearest edge between cells (the second nearest seed less the nearest)
    const gx = px / cell, gy = py / cell, ix = Math.floor(gx), iy = Math.floor(gy);
    let d1 = 9, d2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const sx = ix + i + hash(ix + i, iy + j), sy = iy + j + hash(iy + j + 91, ix + i - 37), dd = (gx - sx) ** 2 + (gy - sy) ** 2;
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1), k = (px + py * W) * 4, l = (d[k] + d[k + 1] + d[k + 2]) / 765;
    const cr = sstep(0.07, 0.0, edge) * (0.12 + 0.4 * l) * (0.5 + 0.5 * vnoise(px / 40, py / 40)), n = (hash(px, py * 3 + 1) - 0.5) * 7;
    d[k] = d[k] * (1 - cr) + n; d[k + 1] = d[k + 1] * (1 - cr) + n; d[k + 2] = d[k + 2] * (1 - cr * 1.1) + n * 0.8;
  }
  c.putImageData(img, 0, 0);
  return P.canvas;
}

// The face: its relief, lit, then the lids' shadows and the mouth over it. skin/shade: the painter's; irises: paint them in
// (the pane draws the portrait's, so they can follow you; her head in the world has these).
function paintFaceOn(P, skin, shade, irises = false) {
  const { relief, layer, spot } = P;
  relief(null, (x, y, o) => {
    const lips = Math.exp(-(((x - MX) / 40) ** 4)) * Math.exp(-(((y - mouthY(x) - 3) / 9) ** 2));
    skin(o, faceH(x, y), lips);
    // the far cheek and temple turning away; the shadow the hair throws on the far temple; the near edge; the sockets, the
    // side of the nose, under it
    shade(o, 1 - 0.13 * sstep(530, 600, x) - 0.16 * gauss(x, y, 578, 270, 18, 70) - 0.2 * gauss(x, y, 364, 310, 16, 90) - 0.14 * gauss(x, y, 500, 500, 70, 22)
      - 0.3 * gauss(x, y, 400, 318, 34, 12) - 0.32 * gauss(x, y, 510, 316, 34, 13) - 0.1 * gauss(x, y, 470, 330, 8, 24) - 0.16 * gauss(x, y, 474, 402, 14, 26) - 0.18 * gauss(x, y, 455, 422, 30, 6));
    // the eye openings
    for (const e of EYES) {
      const ex = (x / RW - e.u) / (e.w / 2), ey = (y / RH - e.v) / (e.h / 2) - 0.3 * ex * ex;
      const k = sstep(1.05, 0.75, Math.hypot(ex, ey));
      if (k > 0) { o[2] = mix(o[2], 0.7, k); o[3] = mix(o[3], 0.6, k); o[4] = mix(o[4], 0.45, k); }
    }
  }, { shape: FACE, blur: 2.1, amb: 0.3, key: 0.9, feather: 5 });
  if (irises) layer(0.8, (g) => {
    for (const e of EYES) {
      const x = (e.u + IRIS.look[0]) * RW, y = (e.v + IRIS.look[1]) * RH;
      g.save(); g.beginPath(); g.ellipse(e.u * RW, e.v * RH, e.w * RW / 2, e.h * RH / 2, e.tilt, 0, TAU); g.clip();
      g.fillStyle = 'rgba(74,44,20,.95)'; g.beginPath(); g.arc(x, y, IRIS.r * RW, 0, TAU); g.fill();
      g.fillStyle = 'rgba(20,10,4,.9)'; g.beginPath(); g.arc(x, y, IRIS.r * RW * 0.45, 0, TAU); g.fill();
      g.restore();
    }
  });
  layer(1.3, (g) => {
    // the lids' edge and the lashes' shadow along the top of each opening, the crease above, the lower lid
    for (const e of EYES) {
      const x = e.u * RW, y = e.v * RH, w = e.w * RW / 2, h = e.h * RH / 2;
      g.save(); g.translate(x, y); g.rotate(e.tilt); g.lineCap = 'round';
      g.strokeStyle = 'rgba(52,28,12,.75)'; g.lineWidth = 2.6;
      g.beginPath(); g.ellipse(0, h * 0.55, w * 1.0, h * 1.6, 0, Math.PI * 1.12, Math.PI * 1.9); g.stroke();
      g.strokeStyle = 'rgba(92,58,30,.3)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, -h * 0.5, w * 1.04, h * 2.1, 0, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      g.strokeStyle = 'rgba(100,64,34,.18)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(0, -h * 0.25, w * 0.95, h * 1.2, 0, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
      g.restore();
    }
    // the corners of the mouth in soft shadow, turned up; the line between the lips, darkest at the middle and the corners
    spot(g, MX - 45, mouthY(MX - 45) - 3, 10, 7, 'rgba(92,56,28,.6)');
    spot(g, MX + 46, mouthY(MX + 46) - 3, 10, 7, 'rgba(92,56,28,.55)');
    g.lineCap = 'round';
    for (let x = MX - 42; x < MX + 42; x += 2) {
      const t = (x - MX) / 42, a = 0.18 + 0.32 * Math.exp(-((t / 0.35) ** 2)) + 0.3 * sstep(0.6, 1, Math.abs(t));
      g.strokeStyle = `rgba(92,50,28,${a.toFixed(3)})`; g.lineWidth = 2.2 - 0.6 * Math.abs(t);
      g.beginPath(); g.moveTo(x, mouthY(x) + 0.5); g.lineTo(x + 2, mouthY(x + 2) + 0.5); g.stroke();
    }
  });
}

/** Her face alone, for her head in the world (lisa-figure.js): the same relief, the same light, its irises in, on skin to
 *  the edges; w x w * FACE_BOX[3] / FACE_BOX[2]. FACE_BOX: the ref px it shows (x, y, w, h). */
export const FACE_BOX = [326, 176, 290, 350];
export function paintFace(R, w = 512) {
  const [ox, oy, bw, bh] = FACE_BOX, S = w / bw, P = painter(w, Math.round(bh * S), S, ox, oy), { c } = P;
  void R;
  c.fillStyle = '#c7a066'; c.fillRect(0, 0, P.W, P.H);
  const SKIN = [0.9, 0.72, 0.44];
  const skin = (o, h, rose = 0) => { o[0] = h; o[2] = SKIN[0] + rose * 0.03; o[3] = SKIN[1] - rose * 0.07; o[4] = SKIN[2] - rose * 0.05; o[5] = 0.05; o[6] = 14; o[7] = 0.5; };
  const shade = (o, k) => { o[2] *= k; o[3] *= k; o[4] *= k * 0.96; };
  P.relief([ox, oy, ox + bw, oy + bh], (x, y, o) => { skin(o, 60 * Math.sqrt(Math.max(0, 1 - ((x - 470) / 150) ** 2 - ((y - 350) / 190) ** 2))); shade(o, 0.85); }, { blur: 4 });
  paintFaceOn(P, skin, shade, true);
  return P.canvas;
}
