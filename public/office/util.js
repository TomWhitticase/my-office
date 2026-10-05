// The office's shared constants and small helpers: maths, mat/box/cyl, merged boxes, procedural textures, canvases and
// screens, and the office floor's colliders.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const dash = window.dash;
export const F = dash.fmt;
export const AISLE = 0.5;
export const PP = { x: -8.6, z: 12.6 };   // ping pong table centre
export const EYE = 1.65, SEATED_EYE = 1.2;
export const ROOM = { minX: -20, maxX: 20, minZ: -15, maxZ: 15, h: 3.3 };
export const LIFT = { x: 18, z: 0.4 };   // lift lobby: the face of the lift core and its call panel, between the two lifts
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MARKER = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
export const WB_COLORS = ['#1c1f24', '#1f5fbf', '#c0392b', '#2e8b57', '#d97757', '#7a3fb0'];
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- small helpers ----------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const damp = (v, target, rate, dt) => v + (target - v) * Math.min(1, rate * dt);
export const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
export function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Boxes merged into one mesh (one draw call); a 7th entry gives that box a vertex colour.
export function mergedBoxes(list, material) {
  const geos = list.map(([w, h, d, x, y, z, color]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    if (color) {
      const c = new THREE.Color(color), arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- procedural textures ----------
export function woodTexture() {
  const t = makeCanvas(1024, 1024), { ctx } = t, R = rng(11), rows = 24, rh = 1024 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -R() * 300;
    while (x < 1024) {
      const len = 260 + R() * 360;
      ctx.fillStyle = `hsl(${27 + R() * 6} ${34 + R() * 8}% ${50 + R() * 10}%)`;
      ctx.fillRect(x, r * rh, len, rh);
      ctx.strokeStyle = 'rgba(70,40,15,0.09)';
      for (let g = 0; g < 4; g++) {
        const gy = r * rh + R() * rh;
        ctx.beginPath(); ctx.moveTo(x, gy); ctx.bezierCurveTo(x + len * 0.3, gy + R() * 6 - 3, x + len * 0.6, gy + R() * 6 - 3, x + len, gy); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,25,10,0.35)'; ctx.fillRect(x, r * rh, 2, rh);
      x += len;
    }
    ctx.fillStyle = 'rgba(40,25,10,0.3)'; ctx.fillRect(0, r * rh, 1024, 1.5);
  }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
  t.tex.needsUpdate = true;
  return t.tex;
}
export function brickTexture() {
  const t = makeCanvas(512, 512), { ctx } = t, R = rng(5);
  ctx.fillStyle = '#cbbfae'; ctx.fillRect(0, 0, 512, 512);
  for (let r = 0; r < 16; r++) for (let c = -1; c < 8; c++) {
    const x = c * 64 + (r % 2 ? 32 : 0);
    ctx.fillStyle = `hsl(${10 + R() * 12} ${38 + R() * 14}% ${34 + R() * 12}%)`;
    ctx.fillRect(x + 2, r * 32 + 2, 60, 28);
  }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
  t.tex.needsUpdate = true;
  return t.tex;
}
export function rugTexture(base, accent, seed) {
  const t = makeCanvas(512, 512), { ctx } = t, R = rng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = accent; ctx.lineWidth = 14; ctx.strokeRect(22, 22, 468, 468);
  ctx.lineWidth = 4; ctx.strokeRect(48, 48, 416, 416);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(256, 256, 40 + i * 30, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 4000; i++) { ctx.fillStyle = R() > 0.5 ? '#000' : '#fff'; ctx.fillRect(R() * 512, R() * 512, 2, 2); }
  ctx.globalAlpha = 1;
  t.tex.needsUpdate = true;
  return t.tex;
}
// Leaf atlas for alpha-tested plant cards: left half a leafy twig, right half one long variegated strap leaf.
export function leafTexture() {
  const t = makeCanvas(512, 256), { ctx } = t, R = rng(23);
  const leafPath = (len, wid) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(wid, -len * 0.2, wid * 0.85, -len * 0.7, 0, -len); ctx.bezierCurveTo(-wid * 0.85, -len * 0.7, -wid, -len * 0.2, 0, 0); };
  const leaf = (x, y, len, wid, ang) => {
    const h = 95 + R() * 30, s = 35 + R() * 20, l = 24 + R() * 14;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const g = ctx.createLinearGradient(-wid, 0, wid, 0);
    g.addColorStop(0, `hsl(${h},${s}%,${l + 8}%)`); g.addColorStop(0.5, `hsl(${h},${s}%,${l + 3}%)`); g.addColorStop(1, `hsl(${h},${s}%,${l - 6}%)`);
    ctx.fillStyle = g; leafPath(len, wid); ctx.fill();
    ctx.strokeStyle = `hsla(${h - 10},40%,${l + 25}%,0.5)`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(wid * 0.1, -len * 0.5, 0, -len * 0.95); ctx.stroke();
    ctx.lineWidth = 0.7;
    for (let k = 1; k < 6; k++) for (const sd of [-1, 1]) { const y0 = -len * k / 6.5; ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(sd * wid * 0.6, y0 - len * 0.1); ctx.stroke(); }
    ctx.restore();
  };
  ctx.strokeStyle = '#5b4a32'; ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) { ctx.lineWidth = 5 - k * 1.5; ctx.beginPath(); ctx.moveTo(128, 256 - k * 80); ctx.lineTo(128 + (k % 2 ? -3 : 3), 176 - k * 80); ctx.stroke(); }
  for (let i = 0; i < 10; i++) {
    const f = 0.12 + i * 0.085, sd = i % 2 ? 1 : -1;
    leaf(128, 256 - f * 236, 92 - f * 40, 31 - f * 8, sd * (0.55 + R() * 0.45));
  }
  leaf(128, 30, 30, 11, 0);
  // Strap leaf: dark green with pale wavy cross-bands and a yellow-green margin.
  ctx.save(); ctx.translate(384, 254);
  const strap = () => { ctx.beginPath(); ctx.moveTo(-14, 0); ctx.bezierCurveTo(-24, -110, -20, -190, 0, -250); ctx.bezierCurveTo(20, -190, 24, -110, 14, 0); ctx.closePath(); };
  strap(); ctx.fillStyle = '#2c5634'; ctx.fill(); ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(170,200,150,0.35)'; ctx.lineWidth = 3;
  for (let y = -6; y > -250; y -= 9 + R() * 8) { ctx.beginPath(); ctx.moveTo(-26, y); ctx.bezierCurveTo(-8, y - 6, 8, y + 6, 26, y - 2); ctx.stroke(); }
  ctx.restore(); strap(); ctx.strokeStyle = '#b9c46a'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
  t.tex.needsUpdate = true;
  return t.tex;
}
export function artTexture(seed, aspect) {
  const W = 512, H = Math.round(512 / aspect), t = makeCanvas(W, H), { ctx } = t, R = rng(seed);
  const pal = [['#f2e8d5', '#d97757', '#2f5d62', '#e8b04b', '#1f2a33'], ['#efe6da', '#3f4a6b', '#a35d7a', '#e7c07a', '#6b8e4e']][seed % 2];
  ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = pal[1 + Math.floor(R() * 4)]; ctx.globalAlpha = 0.85;
    if (R() > 0.5) { ctx.beginPath(); ctx.arc(R() * W, R() * H, 30 + R() * 120, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(R() * W * 0.8, R() * H * 0.8, 40 + R() * 200, 20 + R() * 160);
  }
  ctx.globalAlpha = 1;
  t.tex.needsUpdate = true;
  return t.tex;
}

export const matCache = new Map();
export function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o }));
  return matCache.get(k);
}
export function box(parent, w, h, d, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o.material || mat(color, o.mat));
  m.position.set(x, y, z);
  m.castShadow = o.shadow ?? true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function cyl(parent, rt, rb, h, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 16), o.material || mat(color, o.mat));
  m.position.set(x, y, z); m.castShadow = o.shadow ?? true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

export const colliders = [];
export function solid(x, z, w, d) { colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }); }

export function fit(ctx, text, maxW) {
  text = String(text ?? '').replace(/\s+/g, ' ').slice(0, 220);
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}
export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx, tex, W: w, H: h };
}
// A canvas-backed screen plane; faces +z in its parent's space.
export function makeScreen(parent, w, h, pxW, pxH, x, y, z) {
  const scr = makeCanvas(pxW, pxH);
  // Slightly over-bright so screens still read as glowing after the tone-mapping output pass.
  scr.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: scr.tex, color: new THREE.Color(1.25, 1.25, 1.25) }));
  scr.mesh.position.set(x, y, z);
  parent.add(scr.mesh);
  return scr;
}
