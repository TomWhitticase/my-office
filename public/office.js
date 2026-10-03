// 3D first-person office view of the live dashboard.
// Working sessions sit at desks with their stats on screen; idle ones hang out in the breakroom.
// Your own glass office holds the overview: the centre monitor is the real, live dashboard page,
// projected with CSS3DRenderer behind a hole punched in the WebGL scene.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const dash = window.dash;
const F = dash.fmt;
const AISLE = 0.5;
const EYE = 1.65, SEATED_EYE = 1.2;
const ROOM = { minX: -20, maxX: 20, minZ: -15, maxZ: 15, h: 3.3 };
const LIFT = { x: 18.6, z: AISLE };   // reception: where new sessions arrive and finished ones leave
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- small helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (v, target, rate, dt) => v + (target - v) * Math.min(1, rate * dt);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Boxes merged into one mesh (one draw call); a 7th entry gives that box a vertex colour.
function mergedBoxes(list, material) {
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
function woodTexture() {
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
function brickTexture() {
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
function rugTexture(base, accent, seed) {
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
function leafTexture() {
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
function artTexture(seed, aspect) {
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

const matCache = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o }));
  return matCache.get(k);
}
function box(parent, w, h, d, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o.material || mat(color, o.mat));
  m.position.set(x, y, z);
  m.castShadow = o.shadow ?? true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 16), o.material || mat(color, o.mat));
  m.position.set(x, y, z); m.castShadow = o.shadow ?? true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

const colliders = [];
function solid(x, z, w, d) { colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }); }

function fit(ctx, text, maxW) {
  text = String(text ?? '').replace(/\s+/g, ' ').slice(0, 220);
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}
function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx, tex, W: w, H: h };
}
// A canvas-backed screen plane; faces +z in its parent's space.
function makeScreen(parent, w, h, pxW, pxH, x, y, z) {
  const scr = makeCanvas(pxW, pxH);
  // Slightly over-bright so screens still read as glowing after the tone-mapping output pass.
  scr.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: scr.tex, color: new THREE.Color(1.25, 1.25, 1.25) }));
  scr.mesh.position.set(x, y, z);
  parent.add(scr.mesh);
  return scr;
}

// ---------- screen painters ----------
const EV_LABEL = { prompt: 'You', say: 'Claude', error: 'Error', turn: 'Done', notify: 'Task', recap: 'Recap', command: 'Cmd', compact: 'Compact' };
const STATUS = {
  working: { text: '● WORKING', color: '#22c55e' },
  shell: { text: '◐ WAITING ON SHELL', color: '#fab219' },
  idle: { text: '○ IDLE', color: '#9a9890' },
};
const statusOf = (s) => STATUS[s.status] || { text: String(s.status || '?').toUpperCase(), color: '#ec835a' };
const titleOf = (s) => s.statusline?.name || s.transcript?.title || s.name;
const evText = (e) => (e.kind === 'turn' ? `Turn finished in ${F.dur(e.ms)}` : e.text || '');

function spark(ctx, vals, x, y, w, h, color) {
  if (!vals.length) return;
  const max = Math.max(...vals, 1);
  ctx.beginPath();
  vals.forEach((v, i) => { const px = x + (i / (vals.length - 1)) * w, py = y + h - (v / max) * h; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  ctx.globalAlpha = 0.18; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
}
function bars(ctx, vals, x, y, w, h, color, labelFn, fmt) {
  const max = Math.max(...vals, 0.01);
  const bw = w / vals.length;
  ctx.strokeStyle = '#2c2c2a'; ctx.lineWidth = 1;
  for (let i = 0; i <= 2; i++) { const gy = y + h - (h * i) / 2; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
  ctx.font = `500 15px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.textAlign = 'right';
  ctx.fillText(fmt(max), x - 8, y + 6); ctx.fillText(fmt(0), x - 8, y + h + 5);
  ctx.textAlign = 'center';
  vals.forEach((v, i) => {
    const bh = (v / max) * h;
    ctx.fillStyle = color;
    if (v > 0) { ctx.beginPath(); ctx.roundRect(x + i * bw + bw * 0.15, y + h - bh, bw * 0.7, Math.max(bh, 2), [3, 3, 0, 0]); ctx.fill(); }
    const l = labelFn(i);
    if (l) { ctx.fillStyle = '#8b8a85'; ctx.fillText(l, x + i * bw + bw / 2, y + h + 22); }
  });
  ctx.textAlign = 'left';
}
function header(ctx, W, title, sub) {
  ctx.fillStyle = '#0f1013'; ctx.fillRect(0, 0, W, 9999);
  ctx.font = `700 26px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(title, 30, 48);
  if (sub) { const tw = ctx.measureText(title).width; ctx.font = `400 18px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText(sub, 30 + tw + 14, 48); }
}

function drawSession(scr, s, color) {
  const { ctx, W, H } = scr, tr = s.transcript || {}, sl = s.statusline || {}, P = 30, st = statusOf(s);
  ctx.fillStyle = '#0f1013'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, 8);
  ctx.font = `700 18px ${FONT}`; ctx.fillStyle = st.color; ctx.fillText(st.text, P, 44);
  ctx.fillStyle = '#8b8a85'; ctx.textAlign = 'right'; ctx.fillText('for ' + F.dur(Date.now() - s.statusSince), W - P, 44); ctx.textAlign = 'left';
  ctx.font = `700 34px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, titleOf(s), W - 2 * P), P, 90);
  ctx.font = `400 19px ${FONT}`; ctx.fillStyle = '#9a9890';
  ctx.fillText(fit(ctx, `${s.name} · ${F.home(s.cwd)}${tr.branch ? ' · ⎇ ' + tr.branch : ''}`, W - 2 * P), P, 118);

  ctx.fillStyle = '#1c1e23'; ctx.beginPath(); ctx.roundRect(P, 136, W - 2 * P, 52, 10); ctx.fill();
  const p = tr.pendingTool, busy = s.status !== 'idle';
  let tag = 'LAST ASK', txt = tr.lastPrompt || '—', timer = '';
  if (busy && p) { tag = p.name; txt = p.detail; timer = F.dur(Date.now() - p.t); }
  else if (busy) { tag = 'THINKING'; txt = tr.lastPrompt || ''; }
  ctx.font = `700 17px ${FONT}`; ctx.fillStyle = busy ? '#22c55e' : '#8b8a85';
  const T = tag.toUpperCase(); ctx.fillText(T, P + 16, 169);
  const tw = ctx.measureText(T).width;
  ctx.font = `400 19px ${FONT}`; ctx.fillStyle = '#e6e5df';
  ctx.fillText(fit(ctx, txt, W - 2 * P - tw - 50 - (timer ? 80 : 0)), P + 30 + tw, 169);
  if (timer) { ctx.textAlign = 'right'; ctx.fillStyle = '#8b8a85'; ctx.fillText(timer, W - P - 16, 169); ctx.textAlign = 'left'; }

  const ctxPct = sl.context?.used_percentage ?? null;
  const tools = Object.values(tr.tools || {}).reduce((a, b) => a + b, 0);
  const cols = [['COST (API-EQ.)', F.usd(s.cost)], ['CONTEXT', ctxPct != null ? ctxPct + '%' : '—'], ['PROMPTS · TOOLS', `${tr.prompts ?? 0} · ${tools}`],
    ['SUBAGENTS', s.subagents.active ? `${s.subagents.active} running` : String(s.subagents.total)]];
  const cw = (W - 2 * P) / 4;
  cols.forEach(([k, v], i) => {
    const x = P + i * cw;
    ctx.font = `600 14px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText(k, x, 222);
    ctx.font = `700 28px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(v, x, 256);
  });
  if (ctxPct != null) {
    ctx.fillStyle = '#2c2c2a'; ctx.fillRect(P + cw, 266, cw - 28, 5);
    ctx.fillStyle = ctxPct >= 80 ? '#fab219' : '#3987e5'; ctx.fillRect(P + cw, 266, (cw - 28) * Math.min(ctxPct, 100) / 100, 5);
  }
  spark(ctx, tr.spark || [], P, 288, W - 2 * P, 50, color);

  let y = 376;
  for (const e of (tr.events || []).slice(-5).reverse()) {
    ctx.font = `500 15px ${FONT}`; ctx.fillStyle = '#6f6e69'; ctx.fillText(e.t ? F.clock(e.t) : '', P, y);
    const label = e.kind === 'tool' ? e.name : EV_LABEL[e.kind] || e.kind;
    ctx.font = `700 15px ${FONT}`; ctx.fillStyle = e.kind === 'error' || e.error ? '#e66767' : e.kind === 'prompt' ? '#3987e5' : '#c3c2b7';
    ctx.fillText(label, P + 62, y);
    const lw = Math.max(70, ctx.measureText(label).width + 12);
    ctx.font = `400 16px ${FONT}`; ctx.fillStyle = '#a9a8a2';
    ctx.fillText(fit(ctx, evText(e), W - 2 * P - 62 - lw), P + 62 + lw, y);
    y += 27;
  }
}

function drawAway(scr, s, color) {
  const { ctx, W, H } = scr;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, color); g.addColorStop(1, '#0b0c0f');
  ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.45; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = `200 110px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.fillText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), W / 2, 190);
  ctx.font = `600 24px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, titleOf(s), W - 80), W / 2, 270);
  ctx.font = `400 20px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText(`Away from desk · idle ${F.dur(Date.now() - s.statusSince)}`, W / 2, 306);
  ctx.fillText(`${s.name} · ${F.usd(s.cost)} so far`, W / 2, 336);
  ctx.font = `500 16px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillText('🔒 Locked', W / 2, H - 40);
  ctx.textAlign = 'left';
}

// ---------- code monitor ----------
const MONO = '"SF Mono", Menlo, Consolas, monospace';
const KEYWORDS = new Set(('const let var function return if else for while do switch case break continue new class extends import from export default ' +
  'async await try catch finally throw typeof instanceof in of this super null undefined true false def lambda pass with as elif not and or is None ' +
  'True False self yield global nonlocal fn mut pub struct enum impl trait use mod match where func package type interface map chan go defer ' +
  'func extends signal onready tool static void int float bool string var set get public private protected readonly').split(' '));
const SYN = { kw: '#c678dd', str: '#98c379', num: '#d19a66', com: '#7f848e', fn: '#61afef', type: '#e5c07b', txt: '#d7dae0' };
const TOKEN = /(\/\/.*|#(?![{\w-]*\s*[:{]).*|\/\*.*?\*\/|<!--.*?-->)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?)|(\b\d[\d_.xXa-fA-F]*\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;
function tokens(line) {
  const out = [];
  let last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push([line.slice(last, m.index), SYN.txt]);
    const [tok, com, str, num, fn, word] = m;
    out.push([tok, com ? SYN.com : str ? SYN.str : num ? SYN.num : fn ? (KEYWORDS.has(fn) ? SYN.kw : SYN.fn)
      : KEYWORDS.has(word) ? SYN.kw : /^[A-Z][a-z]/.test(word) ? SYN.type : SYN.txt]);
    last = m.index + tok.length;
    if (!tok.length) TOKEN.lastIndex++;
  }
  if (last < line.length) out.push([line.slice(last), SYN.txt]);
  return out;
}
const countLines = (x) => (x ? x.split('\n').length : 0);

// Draws the session's latest edit; `shown` chars of it are revealed (typing animation).
function drawCode(scr, s, color, shown, cursorOn) {
  const { ctx, W, H } = scr, code = s.code;
  ctx.fillStyle = '#1e2127'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#16181d'; ctx.fillRect(0, 0, W, 44);
  if (!code) {
    ctx.textAlign = 'center';
    ctx.font = `500 22px ${FONT}`; ctx.fillStyle = '#7f848e'; ctx.fillText('No code written yet this session', W / 2, H / 2 - 6);
    ctx.font = `400 17px ${FONT}`; ctx.fillStyle = '#5c6370'; ctx.fillText('Edits will appear here live as they happen', W / 2, H / 2 + 24);
    ctx.textAlign = 'left';
    return;
  }
  const base = code.file.split('/').pop();
  ctx.font = `600 17px ${FONT}`;
  const tabW = Math.min(ctx.measureText(base).width + 44, 380);
  ctx.fillStyle = '#1e2127'; ctx.fillRect(0, 0, tabW, 44);
  ctx.fillStyle = color; ctx.fillRect(0, 0, tabW, 3);
  ctx.fillStyle = '#e6e6e6'; ctx.fillText(fit(ctx, base, tabW - 34), 16, 28);
  ctx.textAlign = 'right'; ctx.font = `500 15px ${FONT}`;
  const plus = countLines(code.added), minus = countLines(code.removed);
  ctx.fillStyle = '#98c379'; const tag = `+${plus}`; ctx.fillText(tag, W - 150, 28);
  if (minus) { ctx.fillStyle = '#e06c75'; ctx.fillText(`−${minus}`, W - 108, 28); }
  ctx.fillStyle = '#7f848e'; ctx.fillText(`${code.tool} · ${F.dur(Date.now() - code.t)} ago`, W - 16, 28);
  ctx.textAlign = 'left';
  ctx.font = `400 14px ${FONT}`; ctx.fillStyle = '#5c6370';
  const crumbs = code.file.split('/').join('  ›  ') + (code.agent ? `     ⤷ subagent: ${code.agent}` : '');
  ctx.fillText(fit(ctx, crumbs, W - 32), 16, 66);

  const LH = 22, top = 92, gutter = 64, rows = Math.floor((H - top) / LH);
  ctx.font = `400 16px ${MONO}`;
  const cw = ctx.measureText('M').width, cols = Math.floor((W - gutter - 16) / cw);
  const text = code.added.slice(0, shown), lines = text.split('\n');
  const first = Math.max(0, lines.length - rows + 2);
  const start = code.line || 1;
  for (let i = first, row = 0; i < lines.length && row < rows; i++, row++) {
    const y = top + row * LH;
    const isCursor = i === lines.length - 1;
    if (isCursor && cursorOn !== null) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, y - 16, W, LH); }
    ctx.textAlign = 'right'; ctx.fillStyle = isCursor ? '#abb2bf' : '#4b5263';
    ctx.fillText(String(start + i), gutter - 14, y);
    ctx.textAlign = 'left';
    let x = gutter, used = 0;
    for (const [tok, col] of tokens(lines[i].replace(/\t/g, '  '))) {
      if (used >= cols) break;
      const piece = tok.slice(0, cols - used);
      ctx.fillStyle = col; ctx.fillText(piece, x, y);
      x += piece.length * cw; used += piece.length;
    }
    if (isCursor && cursorOn) { ctx.fillStyle = color; ctx.fillRect(Math.min(x, W - 12) + 1, y - 15, 2.5, 19); }
  }
  ctx.fillStyle = color; ctx.fillRect(gutter - 6, top - 16, 2, Math.min(rows, lines.length - first) * LH);
}

function drawOff(scr) {
  const { ctx, W, H } = scr;
  ctx.fillStyle = '#060607'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function limitBar(ctx, x, y, w, label, l) {
  ctx.font = `500 17px ${FONT}`; ctx.fillStyle = '#c3c2b7'; ctx.fillText(label, x, y);
  if (!l) { ctx.fillStyle = '#6f6e69'; ctx.fillText('—', x + w - 20, y); return; }
  const p = l.used_percentage, c = p >= 90 ? '#d03b3b' : p >= 70 ? '#fab219' : '#0ca30c';
  ctx.font = `700 30px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(p + '%', x + w, y + 4); ctx.textAlign = 'left';
  ctx.fillStyle = '#2c2c2a'; ctx.beginPath(); ctx.roundRect(x, y + 16, w, 12, 6); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y + 16, Math.max(12, w * Math.min(p, 100) / 100), 12, 6); ctx.fill();
  ctx.font = `400 15px ${FONT}`; ctx.fillStyle = '#8b8a85';
  ctx.fillText('resets in ' + F.dur(l.resets_at * 1000 - Date.now()), x, y + 50);
}

function drawUsage(scr, S) {
  const { ctx, W } = scr, t = S.totals;
  header(ctx, W, 'Usage', S.host);
  ctx.font = `600 15px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText('RUNNING', 30, 100); ctx.fillText('TODAY · API-EQ.', 300, 100); ctx.fillText('LIVE · LIFETIME', 560, 100);
  ctx.font = `700 48px ${FONT}`; ctx.fillStyle = '#fff';
  ctx.fillText(String(t.live), 30, 152); ctx.fillText(F.usd(t.todayCost), 300, 152); ctx.fillText(F.usd(t.liveCost), 560, 152);
  ctx.font = `500 17px ${FONT}`; ctx.fillStyle = '#22c55e'; ctx.fillText(`${t.working} working`, 30, 182);
  ctx.fillStyle = '#8b8a85'; ctx.fillText(`${F.tok(t.todayTokens)} tokens`, 300, 182); ctx.fillText(`+${t.linesAdded} / −${t.linesRemoved} lines`, 560, 182);
  limitBar(ctx, 30, 240, W - 60, '5-hour limit', S.rateLimits?.five_hour);
  limitBar(ctx, 30, 350, W - 60, 'Weekly limit', S.rateLimits?.seven_day);
}

function drawRoster(scr, S) {
  const { ctx, W } = scr;
  header(ctx, W, 'Team', `${S.live.length} sessions · ${S.totals.working} working`);
  let y = 96;
  for (const s of S.live.slice(0, 9)) {
    const st = statusOf(s);
    ctx.fillStyle = dash.colorHex(s.sessionId); ctx.beginPath(); ctx.arc(40, y - 6, 8, 0, Math.PI * 2); ctx.fill();
    ctx.font = `700 14px ${FONT}`; ctx.fillStyle = st.color; ctx.fillText(st.text.replace(/^. /, ''), 60, y - 1);
    ctx.font = `600 19px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, titleOf(s), W - 330), 200, y);
    ctx.font = `600 18px ${FONT}`; ctx.fillStyle = '#c3c2b7'; ctx.textAlign = 'right'; ctx.fillText(F.usd(s.cost), W - 30, y); ctx.textAlign = 'left';
    y += 44;
  }
}

function drawWall(scr, S) {
  const { ctx, W, H } = scr;
  header(ctx, W, 'Spend', 'API-equivalent');
  ctx.font = `600 18px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText('LAST 24 HOURS', 90, 110); ctx.fillText('LAST 30 DAYS', W / 2 + 70, 110);
  const hrs = S.hourly;
  bars(ctx, hrs.map((h) => h.cost), 90, 140, W / 2 - 150, H - 220, '#3987e5',
    (i) => (i % 6 === 0 || i === 23 ? new Date(hrs[i].t).toLocaleTimeString([], { hour: '2-digit' }) : ''), F.usd);
  const days = S.days || [];
  bars(ctx, days.map((d) => d.cost), W / 2 + 70, 140, W / 2 - 110, H - 220, '#9085e9',
    (i) => (i % 7 === 0 || i === days.length - 1 ? new Date(days[i].date + 'T12:00').toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''), F.usd);
}

function drawFeed(scr, S) {
  const { ctx, W } = scr;
  header(ctx, W, 'Live activity', 'all sessions');
  ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(W - 46, 40, 9, 0, Math.PI * 2); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 300); ctx.fill(); ctx.globalAlpha = 1;
  let y = 104;
  for (const e of S.feed.slice(0, 12)) {
    ctx.font = `500 20px ${FONT}`; ctx.fillStyle = '#6f6e69'; ctx.fillText(F.clock(e.t), 30, y);
    ctx.fillStyle = dash.colorHex(e.sessionId); ctx.beginPath(); ctx.arc(110, y - 7, 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = `500 18px ${FONT}`; ctx.fillStyle = '#8b8a85'; ctx.fillText(fit(ctx, e.session, 280), 128, y);
    const label = e.kind === 'tool' ? e.name : EV_LABEL[e.kind] || e.kind;
    ctx.font = `700 19px ${FONT}`; ctx.fillStyle = e.kind === 'error' || e.error ? '#e66767' : e.kind === 'prompt' ? '#3987e5' : '#c3c2b7';
    ctx.fillText(label, 430, y);
    const lw = Math.max(90, ctx.measureText(label).width + 14);
    ctx.font = `400 20px ${FONT}`; ctx.fillStyle = '#e6e5df'; ctx.fillText(fit(ctx, evText(e), W - 460 - lw), 430 + lw, y);
    y += 44;
  }
}

function drawBoard(scr, S) {
  const { ctx, W, H } = scr;
  ctx.fillStyle = '#fbfbf8'; ctx.fillRect(0, 0, W, H);
  const marker = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
  ctx.font = `700 46px ${marker}`; ctx.fillStyle = '#1f5fbf'; ctx.fillText('Shipped today ✓', 40, 70);
  ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(40, 86); ctx.lineTo(420, 82); ctx.stroke();
  let y = 140;
  const done = S.recent.slice(0, 7);
  if (!done.length) { ctx.font = `400 30px ${marker}`; ctx.fillStyle = '#777'; ctx.fillText('nothing finished yet…', 40, y); }
  for (const r of done) {
    ctx.font = `400 30px ${marker}`; ctx.fillStyle = '#222';
    ctx.fillText(fit(ctx, '• ' + (r.title || F.home(r.cwd)), W - 260), 40, y);
    ctx.fillStyle = '#c0392b'; ctx.textAlign = 'right'; ctx.fillText(F.usd(r.cost), W - 40, y); ctx.textAlign = 'left';
    y += 54;
  }
}

function drawLabel(lab, s, color) {
  const { ctx, W, H } = lab, st = statusOf(s);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(15,16,19,0.82)'; ctx.beginPath(); ctx.roundRect(4, 4, W - 8, H - 8, 22); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(36, 46, 11, 0, Math.PI * 2); ctx.fill();
  ctx.font = `700 30px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(fit(ctx, titleOf(s), W - 80), 58, 57);
  const tr = s.transcript || {};
  let sub = s.status === 'idle' ? `idle ${F.dur(Date.now() - s.statusSince)} · ${F.usd(s.cost)}` : `${st.text.replace(/^. /, '').toLowerCase()}${tr.pendingTool ? ' · ' + tr.pendingTool.name : ''} · ${F.usd(s.cost)}`;
  if (s.subagents.active) sub += ` · ${s.subagents.active} subagents`;
  ctx.font = `500 22px ${FONT}`; ctx.fillStyle = st.color; ctx.fillText(fit(ctx, sub, W - 58), 32, 98);
}

// ---------- people ----------
const SKIN = ['#f1c7a5', '#e0ac85', '#c68863', '#a0674a', '#7a4a33', '#ffdbbf'];
const HAIR = ['#2b1d14', '#4a3121', '#8a5a2b', '#c9a15a', '#1a1a1a', '#a33b20', '#d8d0c4'];
const PANTS = ['#2d3340', '#3b3f47', '#1f2a44', '#4a4038', '#28323a'];
const G = {
  thigh: new THREE.CapsuleGeometry(0.068, 0.3, 4, 10), shin: new THREE.CapsuleGeometry(0.056, 0.3, 4, 10),
  shoe: new THREE.BoxGeometry(0.1, 0.07, 0.24), hips: new THREE.BoxGeometry(0.33, 0.16, 0.21),
  torso: new THREE.CapsuleGeometry(0.17, 0.3, 6, 14), neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10),
  head: new THREE.SphereGeometry(0.115, 20, 16), eye: new THREE.SphereGeometry(0.016, 8, 6),
  hairCap: new THREE.SphereGeometry(0.124, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairLong: new THREE.BoxGeometry(0.22, 0.26, 0.07), bun: new THREE.SphereGeometry(0.055, 12, 10),
  upperArm: new THREE.CapsuleGeometry(0.048, 0.2, 4, 8), foreArm: new THREE.CapsuleGeometry(0.042, 0.18, 4, 8),
  hand: new THREE.SphereGeometry(0.045, 10, 8),
};

class Person {
  constructor(id, colorHex) {
    this.id = id;
    this.color = colorHex;
    this.phase = (hash(id) % 1000) / 100;
    const h = hash(id);
    const skinM = mat(SKIN[h % SKIN.length], { roughness: 0.7 }), hairM = mat(HAIR[(h >>> 3) % HAIR.length], { roughness: 0.95 });
    const pantsM = mat(PANTS[(h >>> 6) % PANTS.length]), shirtM = mat(colorHex, { roughness: 0.9 }), shoeM = mat('#222222', { roughness: 0.6 });
    const style = (h >>> 9) % 4;
    this.root = new THREE.Group();
    this.root.userData.sessionId = id;
    this.body = new THREE.Group(); this.root.add(this.body);
    const add = (parent, geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.userData.sessionId = id;
      parent.add(mesh); return mesh;
    };
    // index 0 = right side (-x, since people face +z), 1 = left
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group(); hip.position.set(0.095 * side, 0.9, 0); this.body.add(hip);
      add(hip, G.thigh, pantsM, 0, -0.22, 0);
      const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
      add(knee, G.shin, pantsM, 0, -0.2, 0);
      add(knee, G.shoe, shoeM, 0, -0.42, 0.045);
      return { hip, knee };
    });
    add(this.body, G.hips, pantsM, 0, 0.92, 0);
    this.upper = new THREE.Group(); this.upper.position.y = 0.9; this.body.add(this.upper);
    add(this.upper, G.torso, shirtM, 0, 0.3, 0).scale.set(1.12, 1, 0.72);
    add(this.upper, G.neck, skinM, 0, 0.55, 0);
    this.head = new THREE.Group(); this.head.position.y = 0.7; this.upper.add(this.head);
    add(this.head, G.head, skinM, 0, 0, 0);
    add(this.head, G.eye, mat('#1b1b1b'), 0.042, 0.015, 0.103);
    add(this.head, G.eye, mat('#1b1b1b'), -0.042, 0.015, 0.103);
    add(this.head, G.hairCap, hairM, 0, 0.012, -0.008).rotation.x = -0.3;
    if (style === 1) add(this.head, G.hairLong, hairM, 0, -0.1, -0.07);
    if (style === 2) add(this.head, G.bun, hairM, 0, 0.07, -0.11);
    this.arms = [-1, 1].map((side) => {
      const sh = new THREE.Group(); sh.position.set(0.215 * side, 0.5, 0); this.upper.add(sh);
      add(sh, G.upperArm, shirtM, 0, -0.14, 0);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      add(el, G.foreArm, skinM, 0, -0.12, 0);
      const hand = new THREE.Group(); hand.position.y = -0.26; el.add(hand);
      add(hand, G.hand, skinM, 0, 0, 0);
      return { sh, el, hand, side };
    });
    this.mug = new THREE.Group();
    cyl(this.mug, 0.04, 0.035, 0.1, '#f4f1ea', 0, 0, 0);
    cyl(this.mug, 0.036, 0.036, 0.005, '#4a2c1a', 0, 0.046, 0, { shadow: false });
    this.mug.position.set(0, -0.03, 0.06); this.mug.rotation.x = Math.PI / 2; this.mug.visible = false;
    this.arms[0].hand.add(this.mug);
    this.paddle = new THREE.Group();
    cyl(this.paddle, 0.075, 0.075, 0.012, '#c0392b', 0, 0.12, 0, { seg: 20 }).rotation.x = Math.PI / 2;
    cyl(this.paddle, 0.015, 0.015, 0.1, '#c8a46a', 0, 0.03, 0);
    this.paddle.rotation.x = Math.PI; this.paddle.visible = false;
    this.arms[0].hand.add(this.paddle);

    this.lab = makeCanvas(512, 128);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.lab.tex, depthWrite: false, transparent: true }));
    this.label.scale.set(1.1, 0.275, 1);
    this.label.position.y = 2.1;
    this.label.userData.sessionId = id;
    this.label.layers.set(1);
    this.root.add(this.label);

    this.j = { bodyY: 0, lean: 0, leg0: 0, leg1: 0, knee0: 0, knee1: 0, sh0: 0, sh1: 0, shz0: -0.07, shz1: 0.07, el0: -0.15, el1: -0.15, headY: 0, headX: 0 };
    this.path = [];
    this.spot = null;
    this.desk = null;
    this.rotY = 0;
    this.walkPhase = 0;
    this.labelKey = '';
  }

  place(spot) {
    this.root.position.set(spot.pos.x, 0, spot.pos.z);
    this.rotY = spot.rotY;
    this.path = [];
  }

  targets(t) {
    const ph = this.phase, j = { bodyY: 0, lean: 0.02 * Math.sin(t * 1.3 + ph), leg0: 0, leg1: 0, knee0: 0, knee1: 0,
      sh0: 0, sh1: 0, shz0: -0.07, shz1: 0.07, el0: -0.15, el1: -0.15, headY: 0, headX: 0 };
    this.mug.visible = false; this.paddle.visible = false;
    if (this.path.length) {
      const w = this.walkPhase;
      Object.assign(j, { leg0: 0.5 * Math.sin(w), leg1: -0.5 * Math.sin(w), knee0: 0.1 + 0.55 * Math.max(0, Math.sin(w + 1.6)),
        knee1: 0.1 + 0.55 * Math.max(0, Math.sin(w + 1.6 + Math.PI)), sh0: -0.4 * Math.sin(w), sh1: 0.4 * Math.sin(w),
        el0: -0.35, el1: -0.35, bodyY: -0.02 * Math.abs(Math.cos(w)), lean: 0.05 });
      return j;
    }
    const sit = (seat) => Object.assign(j, { bodyY: seat - 0.9, leg0: -1.5, leg1: -1.5, knee0: 1.5, knee1: 1.5 });
    switch (this.spot?.pose) {
      case 'type':
        sit(0.47);
        Object.assign(j, { lean: 0.12, sh0: -0.55, sh1: -0.55, shz0: -0.12, shz1: 0.12, headX: 0.12, headY: 0.05 + 0.2 * Math.sin(t * 0.45 + ph),
          el0: -1.05 + 0.07 * Math.sin(t * 19 + ph), el1: -1.05 + 0.07 * Math.sin(t * 17 + ph + 1.3) });
        break;
      case 'wait':
        sit(0.47);
        Object.assign(j, { lean: -0.12, sh0: -0.3, sh1: -0.3, el0: -1.4, el1: -1.4, shz0: -0.15, shz1: 0.15, headX: -0.05 + 0.04 * Math.sin(t * 0.8 + ph) });
        break;
      case 'sofa':
        sit(0.53);
        Object.assign(j, { lean: -0.25, leg0: -1.5, leg1: -1.5, knee0: 1.45, knee1: 1.45, sh0: -0.15, sh1: -0.15, el0: -0.9, el1: -0.9,
          headY: 0.5 * Math.sin(t * 0.25 + ph), headX: -0.05 });
        break;
      case 'beanbag':
        sit(0.3);
        Object.assign(j, { lean: -0.45, leg0: -1.2, leg1: -1.2, knee0: 0.8, knee1: 0.8, sh0: 0.1, sh1: 0.1, shz0: -0.3, shz1: 0.3, el0: -0.4, el1: -0.4,
          headY: 0.3 * Math.sin(t * 0.2 + ph) });
        break;
      case 'coffee': {
        this.mug.visible = true;
        const sip = (t + ph) % 7 < 1.6;
        Object.assign(j, { sh0: sip ? -0.9 : -0.25, el0: sip ? -2.2 : -1.5, headX: sip ? -0.15 : 0.05 * Math.sin(t + ph), headY: 0.25 * Math.sin(t * 0.4 + ph) });
        break;
      }
      case 'chat':
        Object.assign(j, { sh0: -0.35 - 0.25 * (0.5 + 0.5 * Math.sin(t * 2.1 + ph)), el0: -1.2 + 0.3 * Math.sin(t * 3.3 + ph),
          sh1: -0.05, el1: -0.25, headX: 0.08 * Math.sin(t * 1.7 + ph), headY: 0.2 * Math.sin(t * 0.5 + ph) });
        break;
      case 'pingpong': {
        this.paddle.visible = true;
        const swing = this.swing || 0;
        Object.assign(j, { bodyY: -0.05, leg0: -0.35, leg1: -0.35, knee0: 0.5, knee1: 0.5, lean: 0.25,
          sh0: -0.6 - 0.8 * swing, el0: -0.9 + 0.3 * swing, sh1: -0.2, el1: -0.6 });
        break;
      }
    }
    return j;
  }

  update(t, dt) {
    if (this.scaleT !== undefined) this.root.scale.setScalar(Math.max(0.001, damp(this.root.scale.x, this.scaleT, 5, dt)));
    if (this.path.length) {
      const target = this.path[0], p = this.root.position;
      const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz), step = 1.4 * dt;
      if (d <= step) { p.x = target.x; p.z = target.z; this.path.shift(); }
      else { p.x += (dx / d) * step; p.z += (dz / d) * step; this.rotY += angDiff(this.rotY, Math.atan2(dx, dz)) * Math.min(1, dt * 10); }
      this.walkPhase += dt * 8;
      if (!this.path.length) this.onArrive?.();
    } else if (this.spot) {
      this.rotY += angDiff(this.rotY, this.spot.rotY) * Math.min(1, dt * 6);
    }
    this.root.rotation.y = this.rotY;
    const tg = this.targets(t), j = this.j;
    for (const k in tg) j[k] = damp(j[k], tg[k], 9, dt);
    this.body.position.y = j.bodyY;
    this.upper.rotation.x = j.lean;
    this.legs[0].hip.rotation.x = j.leg0; this.legs[1].hip.rotation.x = j.leg1;
    this.legs[0].knee.rotation.x = j.knee0; this.legs[1].knee.rotation.x = j.knee1;
    this.arms[0].sh.rotation.x = j.sh0; this.arms[1].sh.rotation.x = j.sh1;
    this.arms[0].sh.rotation.z = j.shz0; this.arms[1].sh.rotation.z = j.shz1;
    this.arms[0].el.rotation.x = j.el0; this.arms[1].el.rotation.x = j.el1;
    this.head.rotation.y = j.headY; this.head.rotation.x = j.headX;
    this.label.position.y = 2.1 + j.bodyY;
  }

  setLabel(s) {
    const key = [titleOf(s), s.status, s.transcript?.pendingTool?.name, F.usd(s.cost), s.subagents.active, s.status === 'idle' ? F.dur(Date.now() - s.statusSince) : ''].join('|');
    if (key === this.labelKey) return;
    this.labelKey = key;
    drawLabel(this.lab, s, this.color);
    this.lab.tex.needsUpdate = true;
  }
}

// ---------- the office ----------
export function mountOffice(container) {
  const style = document.createElement('style');
  style.textContent = `
    #view-office canvas.of-gl { position: absolute; inset: 0; z-index: 1; display: block; }
    #view-office .of-css { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
    .of-dom { background: var(--page); overflow: hidden; pointer-events: none; }
    .of-hud { position: absolute; inset: 0; z-index: 2; pointer-events: none; font: 13px/1.4 system-ui, -apple-system, sans-serif; color: #fff; transition: opacity .4s; }
    .of-hud.hidden { opacity: 0; }
    .of-bare > :not(.of-cross, .of-toast, .of-tvbar, .of-osd) { display: none !important; }   /* a TV in use keeps its bar */
    .of-toast { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); background: rgba(15,16,19,.82); border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 6px 12px; color: #c3c2b7; font-size: 12px; opacity: 0; transition: opacity .3s; }
    .of-toast.on { opacity: 1; }
    .of-toast kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
    .of-cross { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: rgba(255,255,255,.9); box-shadow: 0 0 0 2px rgba(0,0,0,.35); display: none; }
    .of-locked .of-cross { display: block; }
    .of-target { position: absolute; left: 50%; top: calc(50% + 28px); transform: translateX(-50%); background: rgba(15,16,19,.86); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 8px 12px; min-width: 220px; max-width: 420px; text-align: center; display: none; }
    .of-target b { font-size: 14px; display: block; }
    .of-target .m { color: #c3c2b7; }
    .of-target .k { color: #8b8a85; font-size: 12px; margin-top: 3px; }
    .of-map { position: absolute; right: 16px; top: 16px; border-radius: 10px; background: rgba(15,16,19,.78); border: 1px solid rgba(255,255,255,.12); }
    .of-legend { position: absolute; left: 16px; bottom: 14px; background: rgba(15,16,19,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 7px 11px; color: #c3c2b7; font-size: 12px; }
    .of-legend kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
    .of-start { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); background: rgba(15,16,19,.82); border: 1px solid rgba(255,255,255,.14); border-radius: 14px; padding: 16px 22px; text-align: center; pointer-events: none; }
    .of-start b { font-size: 16px; display: block; margin-bottom: 4px; }
    .of-start span { color: #c3c2b7; }
    .of-locked .of-start { display: none; }
    .of-count { position: absolute; left: 16px; top: 16px; background: rgba(15,16,19,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 7px 11px; color: #c3c2b7; font-size: 12px; }
    .of-count b { color: #fff; }
    .of-time { position: absolute; left: 16px; top: 56px; display: flex; align-items: center; gap: 6px; background: rgba(15,16,19,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 5px 6px 5px 11px; color: #c3c2b7; font-size: 12px; pointer-events: auto; }
    .of-time .of-clock { color: #fff; font-weight: 600; min-width: 96px; white-space: pre; }
    .of-time button { font: inherit; font-size: 11px; color: #c3c2b7; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 6px; padding: 2px 7px; cursor: pointer; }
    .of-time button:hover { color: #fff; }
    .of-time button[aria-pressed="true"] { background: #3987e5; border-color: #3987e5; color: #fff; }
    .of-tvbar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); width: min(880px, calc(100% - 32px)); display: none; align-items: center; gap: 6px; background: rgba(15,16,19,.86); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 6px 8px; pointer-events: auto; }
    .of-using .of-tvbar { display: flex; }
    .of-using .of-legend, .of-using .of-start, .of-using .of-map, .of-using .of-count, .of-using .of-time { display: none; }
    .of-tvbar button { font: inherit; font-size: 13px; color: #e8e6df; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 7px; padding: 4px 9px; cursor: pointer; white-space: nowrap; }
    .of-tvbar button:hover { color: #fff; background: rgba(255,255,255,.14); }
    .of-tvbar form { flex: 1; display: flex; min-width: 0; }
    .of-tvbar input[name=u] { flex: 1; min-width: 0; font: inherit; font-size: 13px; color: #fff; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.14); border-radius: 7px; padding: 5px 9px; }
    .of-tvbar input[type=range] { width: 90px; accent-color: #3987e5; }
    .of-tvbar kbd, .of-tvhint kbd { font: inherit; font-weight: 600; color: #fff; background: rgba(255,255,255,.12); border-radius: 4px; padding: 0 5px; }
    .of-tvhint { position: absolute; left: 50%; top: 16px; transform: translateX(-50%); display: none; background: rgba(15,16,19,.72); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 7px 11px; color: #c3c2b7; font-size: 12px; white-space: nowrap; }
    .of-tvhint b { color: #fff; }
    .of-using .of-tvhint { display: block; }
    .of-osd { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); background: rgba(15,16,19,.84); border-radius: 14px; padding: 14px 24px; font-size: 22px; font-weight: 600; white-space: pre; opacity: 0; transition: opacity .3s; }
    .of-osd.on { opacity: 1; }
    .of-volrow { display: flex; gap: 10px; align-items: center; }
    .of-volrow input { flex: 1; accent-color: var(--accent); padding: 0 !important; }
    .of-volv { min-width: 44px; color: var(--ink-2); font-size: 13px; }
    .of-tvform { display: grid; gap: 12px; }
    .of-tvform label { display: grid; gap: 5px; font-size: 12px; color: var(--muted); }
    .of-tvform input, .of-tvform select { font: inherit; font-size: 14px; color: var(--ink); background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; }
    .of-tvform button, .of-tvform a { font: inherit; font-size: 13px; color: var(--ink-2); background: none; border: 1px solid var(--border); border-radius: 8px; padding: 5px 12px; cursor: pointer; }
    .of-tvform button.pri { background: var(--accent); border-color: var(--accent); color: #fff; }
    .of-presets { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
    .of-presets button { font-size: 12px; padding: 2px 9px; }
    .of-tvwarn { font-size: 12px; color: var(--ink-2); }
    .of-tvwarn:empty { display: none; }
    .of-tvwarn.warn { color: var(--warning); }
    .of-tvwarn.bad { color: var(--critical); }
    .of-tvbtns { display: flex; gap: 8px; align-items: center; }
    .of-tvbtns a { margin-left: auto; }
  `;
  document.head.appendChild(style);

  // ----- renderers -----
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'of-gl';
  const cssRenderer = new CSS3DRenderer();
  cssRenderer.domElement.className = 'of-css';
  container.append(cssRenderer.domElement, renderer.domElement);

  const hud = document.createElement('div');
  hud.className = 'of-hud hidden';
  const IS_MAC = /Mac/.test(navigator.platform), ALT = IS_MAC ? '⌥' : 'Alt+';
  hud.innerHTML = `<div class="of-cross"></div><div class="of-target"></div><canvas class="of-map" width="440" height="330" style="width:220px;height:165px"></canvas>
    <div class="of-count"></div>
    <div class="of-time"><span class="of-clock"></span><button data-speed="1">Live</button><button data-speed="120">×120</button><button data-speed="1200">×1200</button><button data-speed="7200">×7200</button></div>
    <div class="of-legend"><kbd>W A S D</kbd> move · <kbd>Shift</kbd> run · <kbd>Click</kbd> inspect or use a TV · <kbd>E</kbd> set up a TV · <kbd>1</kbd> desks <kbd>2</kbd> breakroom <kbd>3</kbd> my office <kbd>4</kbd> lobby · <kbd>T</kbd> time speed · <kbd>G</kbd> graphics · <kbd>H</kbd> hide overlays · <kbd>Esc</kbd> release mouse</div>
    <div class="of-toast"></div>
    <div class="of-start"><b>Click to look around</b><span>Walk up to anyone, or their screen, and click for details.<br>Click your own monitor to go back to the dashboard.</span></div>
    <div class="of-tvhint">Using the <b class="of-tvname"></b> TV · click and type into the page · <kbd>${ALT}M</kbd> mute · <kbd>${ALT}−</kbd> <kbd>${ALT}=</kbd> or <kbd>${ALT}scroll</kbd> volume · <kbd>Esc</kbd> back to walking</div>
    <div class="of-tvbar"><button data-nav="back" title="Back">←</button><button data-nav="forward" title="Forward">→</button><button data-nav="reload" title="Reload">⟳</button><button data-nav="home" title="Back to the TV's own page">⌂</button>
      <form><input name="u" type="text" spellcheck="false" autocomplete="off" placeholder="Go to a URL"></form>
      <button data-act="mute"></button><input type="range" min="0" max="100" title="TV volume"><button data-act="setup" title="Set up this TV">⚙</button><button data-act="leave">Done <kbd>Esc</kbd></button></div>
    <div class="of-osd"></div>`;
  container.appendChild(hud);
  const targetEl = hud.querySelector('.of-target'), mapCanvas = hud.querySelector('.of-map'), mapCtx = mapCanvas.getContext('2d'), countEl = hud.querySelector('.of-count');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bcd8ef');
  scene.fog = new THREE.FogExp2('#bcd8ef', 0.0008);
  const cssScene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 6000);
  camera.rotation.order = 'YXZ';

  // ----- sky, sun, moon, time of day -----
  // Sun and moon follow the real sky over the configured location (London by default); time can be sped up from the HUD (or T).
  const hemi = new THREE.HemisphereLight('#e3ecf7', '#b39b80', 0.95);
  const sun = new THREE.DirectionalLight('#fff1dc', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  const moonLight = new THREE.DirectionalLight('#9fb4ff', 0);
  scene.add(hemi, sun, sun.target, moonLight, moonLight.target);
  const lamps = [];   // { light, base } or { mat, eBase }: dimmed by day, full in the evening

  const skyU = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, horizonSun: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
    cloudLit: { value: new THREE.Color() }, cloudDark: { value: new THREE.Color() },
    sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, -1, 0) },
    night: { value: 0 }, time: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, horizon, horizonSun, ground, cloudLit, cloudDark, sunCol, sunDir, moonDir; uniform float night, time; varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Horizon glows toward the sun (fiery at sunset) and stays cooler on the far side.
        float toward = pow(dot(normalize(d.xz + 1e-4), normalize(sunDir.xz + 1e-4)) * 0.5 + 0.5, 5.0);
        vec3 hor = mix(horizon, horizonSun, toward);
        vec3 col = h > 0.0 ? mix(hor, top, pow(h, 0.5)) : mix(hor, ground, pow(min(-h * 4.0, 1.0), 0.6));
        float sd = max(dot(d, sunDir), 0.0);
        col += sunCol * (pow(sd, 1400.0) * 30.0 + pow(sd, 60.0) * 0.6 + pow(sd, 8.0) * 0.25);
        if (h > 0.0) {
          float s = hash(floor(d * 700.0));
          col += vec3(step(0.9982, s) * night * (0.6 + 0.4 * sin(time * 3.0 + s * 60.0)) * smoothstep(0.0, 0.25, h));
        }
        float mc = dot(d, moonDir), R = 0.03;
        if (mc > cos(R)) {
          vec3 off = d - moonDir * mc;
          float r = length(off) / sin(R);
          vec3 n = normalize(off / sin(R) - moonDir * sqrt(max(0.0, 1.0 - r * r)));
          float lit = smoothstep(-0.08, 0.12, dot(n, sunDir));
          col = mix(col, vec3(0.95, 0.93, 0.86) * (0.06 + 1.4 * lit), smoothstep(1.0, 0.9, r) * smoothstep(-0.02, 0.03, moonDir.y));
        }
        col += vec3(0.6, 0.65, 0.8) * pow(max(mc, 0.0), 200.0) * 0.25 * night;
        // Clouds: a drifting fbm layer, lit from the sun side (orange-pink undersides at sunset).
        if (h > 0.01) {
          vec2 uv = d.xz / (h + 0.06) * 0.9 + vec2(time * 0.006, time * 0.003);
          float c = smoothstep(0.5, 0.78, fbm(uv)) * smoothstep(0.01, 0.16, h);
          float lit = pow(sd, 3.0);
          vec3 cc = mix(cloudDark, cloudLit, 0.35 + 0.65 * (toward * 0.6 + lit * 0.4));
          cc += sunCol * pow(sd, 12.0) * 0.8;
          col = mix(col, cc, c * 0.9);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const skyScene = new THREE.Scene();   // sky alone, rendered into an env map so city glass and water reflect the real sky
  skyScene.add(new THREE.Mesh(sky.geometry, sky.material));
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // [sun elevation°, zenith, horizon, horizon toward the sun, below horizon, cloud lit side, cloud shadow side]
  const SKY_KEYS = [
    [-18, '#03050c', '#090f1f', '#0d1226', '#05070c', '#141a2e', '#0a0d18'],
    [-9, '#0c1434', '#2a2350', '#4a2c5e', '#0b0d14', '#3a2b57', '#191730'],
    [-4, '#182a64', '#9a4e6e', '#ff6a3d', '#1a1418', '#ff7a5c', '#4a2e5c'],
    [0, '#26489a', '#e2776a', '#ff8a2e', '#2a1f1c', '#ff9a5a', '#7a4870'],
    [5, '#3566b5', '#f2a27c', '#ffbd5e', '#3a302a', '#ffd3a0', '#9a7f98'],
    [16, '#3a80d6', '#bcd8ef', '#e3edf6', '#4a4a48', '#ffffff', '#c3cedb'],
    [60, '#2a6ccc', '#cbe3f6', '#e6f0f9', '#55534f', '#ffffff', '#d0d8e2'],
  ].map(([el, ...cs]) => [el, ...cs.map((c) => new THREE.Color(c))]);
  const SKY_C = Array.from({ length: 6 }, () => new THREE.Color());
  const SUN_RED = new THREE.Color('#ff4a12'), SUN_GOLD = new THREE.Color('#ffa040'), SUN_HIGH = new THREE.Color('#fff4e4');
  const HEMI = { daySky: new THREE.Color('#e3ecf7'), dayGnd: new THREE.Color('#b39b80'), nightSky: new THREE.Color('#2c3555'),
    nightGnd: new THREE.Color('#4a3a2a'), sunset: new THREE.Color('#ff9a66'), sunsetGnd: new THREE.Color('#7a4a3a') };
  const C = { sun: new THREE.Color() };
  const LAT = (dash.config?.lat ?? 51.5) * Math.PI / 180, LON = dash.config?.lon ?? -0.13;
  const J2000 = Date.UTC(2000, 0, 1, 12);
  const RAD = Math.PI / 180;
  function altAz(ra, dec, d) {
    const H = ((18.697374558 + 24.06570982441908 * d) * 15 + LON) * RAD - ra;
    const el = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(LAT) - Math.sin(LAT) * Math.cos(H));   // from north, clockwise
    return { el, az };
  }
  function sunPos(date) {
    const d = (date - J2000) / 864e5, g = (357.529 + 0.98560028 * d) * RAD;
    const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
    return altAz(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), Math.asin(Math.sin(e) * Math.sin(L)), d);
  }
  function moonPos(date) {
    const d = (date - J2000) / 864e5, e = 23.4397 * RAD;
    const M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.22935 * d) * RAD;
    const lon = (218.316 + 13.176396 * d) * RAD + 6.289 * RAD * Math.sin(M), lat = 5.128 * RAD * Math.sin(F);
    const ra = Math.atan2(Math.sin(lon) * Math.cos(e) - Math.tan(lat) * Math.sin(e), Math.cos(lon));
    return altAz(ra, Math.asin(Math.sin(lat) * Math.cos(e) + Math.cos(lat) * Math.sin(e) * Math.sin(lon)), d);
  }
  // World axes: +x east, +z north, so evening sun pours in through the west windows.
  const toDir = (p, v) => v.set(Math.sin(p.az) * Math.cos(p.el), Math.sin(p.el), Math.cos(p.az) * Math.cos(p.el));
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
  let daylight = 1, lampK = 0;
  let raysStrength = 0, lastEnvEl = 999, lastEnvAt = 0, envRT = null;
  function updateSky(date, t) {
    const sp = sunPos(date), mp = moonPos(date);
    toDir(sp, sunDir); toDir(mp, moonDir);
    const el = sp.el / RAD, mel = mp.el / RAD;
    let i = 0;
    while (i < SKY_KEYS.length - 2 && el > SKY_KEYS[i + 1][0]) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], k = clamp((el - a[0]) / (b[0] - a[0]), 0, 1);
    for (let c = 0; c < 6; c++) SKY_C[c].lerpColors(a[c + 1], b[c + 1], k);
    const [top, hor, horSun, gnd, cLit, cDark] = SKY_C;
    const night = 1 - sstep(-10, -2, el), dl = sstep(-4, 12, el), sunset = sstep(-6, -0.5, el) * (1 - sstep(8, 20, el));
    // The sun drops behind the mountain ridge a little before the true horizon.
    const azDeg = ((Math.round(Math.atan2(sunDir.z, sunDir.x) / RAD) % 360) + 360) % 360;
    const sunVis = sstep(city.ridge[azDeg] - 0.5, city.ridge[azDeg] + 0.7, el);
    daylight = dl;
    if (el < 7) C.sun.lerpColors(SUN_RED, SUN_GOLD, sstep(-1, 7, el)); else C.sun.lerpColors(SUN_GOLD, SUN_HIGH, sstep(7, 28, el));
    skyU.top.value.copy(top); skyU.horizon.value.copy(hor); skyU.horizonSun.value.copy(horSun); skyU.ground.value.copy(gnd);
    skyU.cloudLit.value.copy(cLit); skyU.cloudDark.value.copy(cDark);
    skyU.sunDir.value.copy(sunDir); skyU.moonDir.value.copy(moonDir);
    skyU.sunCol.value.copy(C.sun).multiplyScalar(sstep(-4, 1, el));
    skyU.night.value = night; skyU.time.value = t;
    sun.position.copy(sunDir).multiplyScalar(90); sun.color.copy(C.sun); sun.intensity = 4.2 * sstep(-1.5, 2.5, el) * sunVis;
    moonLight.position.copy(moonDir).multiplyScalar(90); moonLight.intensity = 0.4 * night * sstep(-2, 8, mel);
    hemi.intensity = lerp(0.2, 0.9, dl) + 0.12 * sunset;
    hemi.color.lerpColors(HEMI.nightSky, HEMI.daySky, dl).lerp(HEMI.sunset, sunset * 0.6);
    hemi.groundColor.lerpColors(HEMI.nightGnd, HEMI.dayGnd, dl).lerp(HEMI.sunsetGnd, sunset * 0.5);
    scene.environmentIntensity = lerp(0.1, 0.42, dl);
    scene.fog.color.copy(hor).lerp(horSun, 0.3); scene.background.copy(scene.fog.color);
    renderer.toneMappingExposure = lerp(1.12, 1.0, dl) + 0.06 * sunset;
    // Lamps follow the Admin tab: 'auto' keeps them off in daylight (the windows light the office) and fades them up from
    // dusk as the sun drops below ~12°; 'on'/'off' override that. Eased so switching doesn't snap.
    const o = dash.office || {}, lampTo = (o.lights === 'on' ? 1 : o.lights === 'off' ? 0 : 1 - dl) * (o.brightness ?? 1);
    lampK += (lampTo - lampK) * 0.08;
    for (const L of lamps) {
      if (L.light) L.light.intensity = L.base * lampK;
      if (L.mat) L.mat.emissiveIntensity = L.eBase * lampK;
    }
    ceilingM.emissiveIntensity = 0.04 + 0.2 * dl;
    city.mat.emissiveIntensity = 0.04 + 1.25 * night;
    city.ground.emissiveIntensity = 0.02 + 1.1 * night;
    city.av.emissiveIntensity = Math.sin(t * 2.4) > 0.55 ? 4 : 0.15;
    
    shaftU.uLight.value.copy(sunDir).negate(); shaftU.color.value.copy(C.sun);
    shaftU.strength.value = sunVis * sstep(-1, 2, el) * (0.25 + 0.75 * (1 - sstep(8, 30, el)));
    shaftU.time.value = t;
    raysStrength = sunVis * sstep(-2, 2, el) * (0.45 + 0.9 * sunset);
    if (Math.abs(el - lastEnvEl) > 0.8 || performance.now() - lastEnvAt > 60000) {
      lastEnvEl = el; lastEnvAt = performance.now();
      envRT?.dispose();
      envRT = pmrem.fromScene(skyScene, 0, 0.1, 500);
      city.setEnv(envRT.texture);
    }
  }

  const SPEEDS = [1, 120, 1200, 7200];
  const timeEl = hud.querySelector('.of-time'), clockEl = hud.querySelector('.of-clock');
  const clockState = { speed: 1, simBase: Date.now(), realBase: Date.now() };
  const simNow = () => (clockState.speed === 1 ? Date.now() : clockState.simBase + (Date.now() - clockState.realBase) * clockState.speed);
  function setSpeed(sp) {
    const cur = simNow();
    Object.assign(clockState, { speed: sp, simBase: sp === 1 ? Date.now() : cur, realBase: Date.now() });
    localStorage.officeTimeSpeed = sp;
    for (const b of timeEl.querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.dataset.speed === sp));
  }
  timeEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.speed); });
  setSpeed(SPEEDS.includes(+localStorage.officeTimeSpeed) ? +localStorage.officeTimeSpeed : 1);
  let clockText = '';
  function updateClock(date) {
    const txt = `${daylight > 0.5 ? '☀︎' : '☾'}  ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${date.toLocaleDateString([], { weekday: 'short' })}`;
    if (txt !== clockText) clockEl.textContent = clockText = txt;
  }

  const world = new THREE.Group();
  scene.add(world);

  // ----- building shell -----
  const H = ROOM.h + 0.15;
  const woodTex = woodTexture();
  woodTex.repeat.set(10, 7.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
  let rugSeed = 1;
  function rug(x0, x1, z0, z1, base, accent, y = 0.006) {
    const tex = accent ? rugTexture(base, accent, rugSeed++) : null;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : base, map: tex, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; world.add(m);
  }
  rug(6, 19.9, -14.9, -3.5, '#3a4660', null, 0.004);                       // my office carpet
  rug(10.5, 15.5, -11, -7.5, '#d8c7a8', '#33405a');
  rug(-15.9, -12.1, 4.4, 9.6, '#cdb99b', '#8c5a3c');                        // breakroom
  rug(7.4, 12.6, 6.8, 11.2, '#b5654a', '#e2c9a6');                          // lounge
  for (const z of [-3.5, -7.5, -11.5]) rug(-18.7, 2.2, z - 0.75, z + 1.45, '#6f7c6c', '#55614f');

  // Ceiling with exposed timber beams.
  const ceilingM = new THREE.MeshStandardMaterial({ color: '#efe7da', roughness: 1, emissive: '#efe7da', emissiveIntensity: 0.2 });
  box(world, 40.4, 0.2, 30.4, '', 0, ROOM.h + 0.1, 0, { material: ceilingM });
  const beamM = mat('#9c6b43', { roughness: 0.75 });
  for (let x = -18; x <= 18; x += 4) box(world, 0.22, 0.28, 30, '', x, ROOM.h - 0.14, 0, { material: beamM });

  const wallM = mat('#ece3d3', { roughness: 0.95 }), frameM = mat('#2f3236', { metalness: 0.4, roughness: 0.5 });
  const sillM = mat('#a87447', { roughness: 0.6 });
  const outerGlassM = new THREE.MeshBasicMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.05, depthWrite: false });
  // Outer wall along x (z fixed) or z (x fixed); `windows` are [from, to] spans of floor-to-ceiling glazing.
  const panes = [];
  function wall(axis, fixed, from, to, windows = [], m = wallM) {
    const inward = Math.sign(-fixed);
    const seg = (a, b, y0, y1, material = m, depth = 0.2, off = 0, shadow = true) => {
      const len = b - a, mid = (a + b) / 2;
      return axis === 'x'
        ? box(world, len, y1 - y0, depth, '', mid, (y0 + y1) / 2, fixed + off * inward, { material, shadow })
        : box(world, depth, y1 - y0, len, '', fixed + off * inward, (y0 + y1) / 2, mid, { material, shadow });
    };
    let cur = from;
    for (const [a, b] of windows) {
      if (a > cur) seg(cur, a, 0, H);
      seg(a, b, 0, 0.45); seg(a, b, 3.05, H);
      seg(a, b, 0.45, 3.05, outerGlassM, 0.02, 0, false);
      seg(a, b, 0.45, 0.49, sillM, 0.3, 0.12);
      const n = Math.max(1, Math.round((b - a) / 2.5)), step = (b - a) / n;
      for (let q = 0; q <= n; q++) seg(a + q * step - 0.04, a + q * step + 0.04, 0.45, 3.05, frameM, 0.12);
      for (let q = 0; q < n; q++) panes.push({ axis, fixed, a: a + q * step + 0.04, b: a + (q + 1) * step - 0.04, inward });
      seg(a, b, 2.3, 2.36, frameM, 0.1);
      cur = b;
    }
    if (cur < to) seg(cur, to, 0, H);
  }
  wall('x', 15, -20, 20, [[-20, 6], [16, 20]]);
  wall('z', -20, -15, 15, [[-15, 2], [6.8, 15]]);
  wall('z', 20, -15, 15, [[-15, 15]]);
  wall('x', -15, -20, 6, [], mat('#2f463b', { roughness: 0.9 }));          // green accent behind the desks
  wall('x', -15, 6, 20, [], mat('#2b3650', { roughness: 0.9 }));           // navy in my office
  {
    const slats = [];
    for (let x = -19.8; x < 5.9; x += 0.14) if (x < -10.5 || x > -5.9) slats.push([0.05, ROOM.h - 0.1, 0.04, x, (ROOM.h - 0.1) / 2, -14.88]);
    world.add(mergedBoxes(slats, mat('#b07d4f', { roughness: 0.7 })));
  }
  // Sunbeams: each window pane swept along the light direction, drawn additively and faded with depth.
  const shaftU = { uLight: { value: new THREE.Vector3(0, -1, 0) }, color: { value: new THREE.Color() }, strength: { value: 0 }, time: { value: 0 } };
  const shafts = (() => {
    const pos = [], along = [], nIn = [], idx = [];
    for (const p of panes) {
      const y0 = 0.49, y1 = 3.05;
      const cs = p.axis === 'x' ? [[p.a, y0, p.fixed], [p.b, y0, p.fixed], [p.b, y1, p.fixed], [p.a, y1, p.fixed]]
        : [[p.fixed, y0, p.a], [p.fixed, y0, p.b], [p.fixed, y1, p.b], [p.fixed, y1, p.a]];
      const nrm = p.axis === 'x' ? [0, 0, p.inward] : [p.inward, 0, 0], base = pos.length / 3;
      for (const t of [0, 1]) for (const c of cs) { pos.push(...c); along.push(t); nIn.push(...nrm); }
      for (const [a, b, c, d] of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) idx.push(base + a, base + b, base + c, base + a, base + c, base + d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute('nIn', new THREE.Float32BufferAttribute(nIn, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: shaftU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute float along; attribute vec3 nIn; uniform vec3 uLight; varying float vA; varying float vFace; varying vec3 vW;
        void main() { vec3 p = position + along * 16.0 * uLight; vA = along; vFace = max(dot(uLight, nIn), 0.0);
          vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 color; uniform float strength, time; varying float vA; varying float vFace; varying vec3 vW;
        void main() {
          float fade = smoothstep(0.0, 0.05, vA) * pow(1.0 - vA, 1.7);
          float dust = 0.8 + 0.2 * sin(vW.x * 2.1 + vW.y * 3.3 + time * 0.5) * sin(vW.z * 1.7 - time * 0.35);
          gl_FragColor = vec4(color * strength * vFace * fade * dust * smoothstep(0.0, 0.3, vW.y) * 0.03, 1.0);
        }`,
    }));
    m.frustumCulled = false;
    world.add(m);
    return m;
  })();

  for (const [x, z] of [[4, -8], [4, 8], [-9, 0.5 - 2.6]]) { box(world, 0.5, ROOM.h, 0.5, '#a8774b', x, ROOM.h / 2, z, { mat: { roughness: 0.7 } }); solid(x, z, 0.5, 0.5); }

  // ----- the city outside (we're ~60 m up) -----
  const city = buildCity();
  function buildCity() {
    const GROUND = -62, R = rng(4242);
    // Facade colour, lit windows at night, and a roughness/metalness map so the glass is glossy and reflective.
    const fac = makeCanvas(512, 512), lit = makeCanvas(512, 512), rm = makeCanvas(512, 512);
    fac.ctx.fillStyle = '#9a9a96'; fac.ctx.fillRect(0, 0, 512, 512);
    lit.ctx.fillStyle = '#000'; lit.ctx.fillRect(0, 0, 512, 512);
    rm.ctx.fillStyle = 'rgb(0,235,25)'; rm.ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const x = i * 64, y = j * 64, g = fac.ctx.createLinearGradient(x, y, x + 64, y + 64);
      g.addColorStop(0, '#2c3a4a'); g.addColorStop(1, '#5f7489');
      fac.ctx.fillStyle = g; fac.ctx.fillRect(x + 9, y + 10, 46, 40);
      fac.ctx.fillStyle = 'rgba(0,0,0,.25)'; fac.ctx.fillRect(x + 9, y + 48, 46, 3);
      rm.ctx.fillStyle = 'rgb(0,40,230)'; rm.ctx.fillRect(x + 9, y + 10, 46, 40);
      if (R() < 0.42) {
        lit.ctx.globalAlpha = 0.5 + R() * 0.5;
        lit.ctx.fillStyle = ['#ffd49a', '#ffe6bf', '#fff1d6', '#cfe0ff', '#ffc27a'][Math.floor(R() * 5)];
        lit.ctx.fillRect(x + 9, y + 10, 46, 40);
      }
    }
    lit.ctx.globalAlpha = 1;
    rm.tex.colorSpace = THREE.NoColorSpace;
    for (const t of [fac.tex, lit.tex, rm.tex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }

    // A river runs north-south just west of us, and the west side is low-rise, so sunsets have a clear view.
    const riverX = (z) => -230 + 60 * Math.sin(z / 250) + 20 * Math.sin(z / 90), RIVER_W = 42;
    const bigPark = (gx, gz) => gx >= 2 && gx <= 4 && gz >= -3 && gz <= -1;
    const geos = [], av = [], trees = [], parks = [], ponds = [];
    const TINTS = ['#ffffff', '#e8dccb', '#cfd8e3', '#d9d2c5', '#bfc6cc', '#f0e6d8', '#a9b4c0', '#c9b8a6'];
    const addB = (w, h, d, x, z, tintHex, uo, vo) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, GROUND + h / 2, z);
      const uv = g.attributes.uv, col = new Float32Array(uv.count * 3), tint = new THREE.Color(tintHex);
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        if (f === 2 || f === 3) uv.setXY(i, 0.003, 0.003);
        else uv.setXY(i, uv.getX(i) * (f < 2 ? d : w) / 16 + uo, uv.getY(i) * h / 24 + vo);
        col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    };
    const tree = (x, z, scale = 1) => trees.push([x, z, (8 + R() * 7) * scale, (2.6 + R() * 1.9) * scale]);
    addB(40.6, -GROUND - 0.05, 30.6, 0, 0, '#d8d2c8', 0, 0);                // our own tower, below the office
    for (let gx = -12; gx <= 12; gx++) for (let gz = -12; gz <= 12; gz++) {
      const cx = gx * 70, cz = gz * 70, dist = Math.hypot(cx, cz), ring = Math.max(Math.abs(gx), Math.abs(gz));
      if ((gx === 0 && gz === 0) || dist > 880) continue;
      if (bigPark(gx, gz) || (ring >= 3 && R() < 0.1 && Math.abs(cx - riverX(cz)) > 75)) {
        parks.push([cx, cz]);
        if (R() < 0.4) ponds.push([cx + (R() - 0.5) * 20, cz + (R() - 0.5) * 20, 7 + R() * 6]);
        for (let k = 0; k < 26; k++) {
          const x = cx + (R() - 0.5) * 48, z = cz + (R() - 0.5) * 48;
          if (!ponds.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + 3)) tree(x, z);
        }
        continue;
      }
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const w = 14 + R() * 22, d = 14 + R() * 22;
        // Low-rise next door so the view opens over rooftops to the skyline; towers further out.
        const tall = R() < 0.1 ? 110 + R() * 140 : 0;
        let h = ring === 1 ? 12 + R() * 26 : ring === 2 ? 20 + R() * 40 + (R() < 0.2 ? 30 + R() * 50 : 0) : 18 + R() * 95 * (1 - dist / 1300) + tall;
        const x = cx + (R() - 0.5) * (54 - w), z = cz + (R() - 0.5) * (54 - d);
        if (cx < -40 && Math.abs(cz) < -cx * 0.75 + 60) h = Math.min(h, 22 + R() * 30);
        if (Math.abs(x - riverX(z)) < RIVER_W + Math.max(w, d) / 2 + 6) continue;
        addB(w, h, d, x, z, TINTS[Math.floor(R() * TINTS.length)], Math.floor(R() * 8) / 8, Math.floor(R() * 8) / 8);
        if (h > 120) av.push([x, GROUND + h + 1, z]);
      }
      if (R() < 0.55) {   // street trees along one or two kerbs
        const side = Math.floor(R() * 4);
        for (let k = 0; k < 6; k++) {
          const o = -22 + k * 8.8;
          const [x, z] = [[cx + o, cz - 25], [cx + o, cz + 25], [cx - 25, cz + o], [cx + 25, cz + o]][side];
          if (Math.abs(x - riverX(z)) > RIVER_W + 4) tree(x, z, 0.8);
        }
      }
    }
    // Riverside parks with trees along both banks.
    for (let z = -1100; z <= 1100; z += 12) for (const s of [-1, 1]) if (R() < 0.75) tree(riverX(z) + s * (RIVER_W + 6 + R() * 14), z + R() * 6);

    const cityMat = new THREE.MeshStandardMaterial({ map: fac.tex, emissiveMap: lit.tex, emissive: '#ffffff', vertexColors: true,
      roughnessMap: rm.tex, metalnessMap: rm.tex, roughness: 1, metalness: 1, envMapIntensity: 1.1 });
    world.add(new THREE.Mesh(mergeGeometries(geos), cityMat));

    const avMat = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff2a1a', emissiveIntensity: 3 });
    const avMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), avMat, av.length);
    const m4 = new THREE.Matrix4();
    av.forEach(([x, y, z], i) => avMesh.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    world.add(avMesh);

    // Streets: one 70 m block per texture tile, roads on the tile edges, streetlights along the kerbs.
    const gt = makeCanvas(256, 256), ge = makeCanvas(256, 256), px = 256 / 70;
    gt.ctx.fillStyle = '#2a2c30'; gt.ctx.fillRect(0, 0, 256, 256);
    gt.ctx.fillStyle = '#5a5d61'; gt.ctx.fillRect(8 * px, 8 * px, 54 * px, 54 * px);
    gt.ctx.fillStyle = '#4b5a46'; gt.ctx.fillRect(11 * px, 11 * px, 48 * px, 48 * px);
    gt.ctx.fillStyle = '#c9c3a8';
    for (let i = 0; i < 256; i += 14) { gt.ctx.fillRect(i, 0, 7, 1.2); gt.ctx.fillRect(i, 254.8, 7, 1.2); gt.ctx.fillRect(0, i, 1.2, 7); gt.ctx.fillRect(254.8, i, 1.2, 7); }
    ge.ctx.fillStyle = '#000'; ge.ctx.fillRect(0, 0, 256, 256);
    for (let i = 4; i < 256; i += 32) for (const [x, y] of [[i, 7 * px], [i, 63 * px], [7 * px, i], [63 * px, i]]) {
      const g = ge.ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, 'rgba(255,200,130,1)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      ge.ctx.fillStyle = g; ge.ctx.fillRect(x - 9, y - 9, 18, 18);
    }
    for (const t of [gt.tex, ge.tex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(86, 86); t.needsUpdate = true; }
    const groundMat = new THREE.MeshStandardMaterial({ map: gt.tex, emissiveMap: ge.tex, emissive: '#ffffff', roughness: 0.95 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6020, 6020), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(35, GROUND, 35);
    world.add(ground);

    // Grass for parks and river banks, water for the river and ponds.
    const grassMat = mat('#5f8f4a', { roughness: 1 });
    const parkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(56, 0.4, 56), grassMat, parks.length);
    parks.forEach(([x, z], i) => parkMesh.setMatrixAt(i, m4.makeTranslation(x, GROUND + 0.2, z)));
    world.add(parkMesh);
    const waterMat = new THREE.MeshStandardMaterial({ color: '#1b3444', roughness: 0.07, metalness: 0.85, envMapIntensity: 1.2 });
    const strip = (offA, offB, y, material) => {
      const pos = [], idx = [];
      for (let z = -3000, i = 0; z <= 3000; z += 20, i++) {
        const x = riverX(z);
        pos.push(x + offA, y, z, x + offB, y, z);
        if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, material); m.material.side = THREE.DoubleSide;
      world.add(m);
    };
    strip(-RIVER_W, RIVER_W, GROUND + 0.35, waterMat);
    strip(RIVER_W, RIVER_W + 24, GROUND + 0.3, grassMat);
    strip(-RIVER_W - 24, -RIVER_W, GROUND + 0.3, grassMat);
    const pondMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.2, 32), waterMat, ponds.length);
    const dummy = new THREE.Object3D();
    ponds.forEach(([x, z, r], i) => { dummy.position.set(x, GROUND + 0.45, z); dummy.scale.set(r, 1, r); dummy.updateMatrix(); pondMesh.setMatrixAt(i, dummy.matrix); });
    world.add(pondMesh);

    // Trees: autumn palette, it being October.
    const TREE_COLS = ['#3f7a3a', '#4f8a3c', '#2f6b3a', '#5d9440', '#d08a2a', '#c4572a', '#e0b23a', '#a23a2a', '#b8742a'].map((c) => new THREE.Color(c));
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), mat('#5a4030', { roughness: 1 }), trees.length);
    // Crowns: a clump of lumpy blobs, darker underneath, instead of one smooth ball.
    const crownGeo = mergeGeometries([[0, 0.1, 0, 0.8], [0.5, -0.2, 0.2, 0.62], [-0.45, -0.15, -0.3, 0.64], [0.1, 0.45, -0.25, 0.55], [-0.2, -0.05, 0.5, 0.58], [0.3, 0.2, -0.5, 0.5]].map(([x, y, z, r]) => {
      const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const n = Math.sin(p.getX(i) * 91.7 + p.getY(i) * 47.3 + p.getZ(i) * 73.1 + x * 13) * 43758.5, k = 0.9 + 0.2 * (n - Math.floor(n));
        p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z);
        col.fill(0.55 + 0.45 * sstep(-0.7, 0.8, p.getY(i)), i * 3, i * 3 + 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    }));
    crownGeo.computeVertexNormals();
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, vertexColors: true }), trees.length);
    trees.forEach(([x, z, h, r], i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, GROUND + h * 0.25, z); dummy.scale.set(1, h * 0.5, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, GROUND + h * 0.62, z); dummy.scale.set(r, r * 1.25, r); dummy.rotation.y = R() * 6; dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(i, TREE_COLS[R() < 0.55 ? Math.floor(R() * 4) : 4 + Math.floor(R() * 5)]);
    });
    world.add(trunks, crowns);

    // Mountains on the far horizon: a ring of ridged fbm terrain, tallest to the north, lower in the west so sunsets clear them.
    const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const n2 = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return lerp(lerp(h2(xi, yi), h2(xi + 1, yi), u), lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v);
    };
    const fbm2 = (x, y) => { let s = 0, a = 0.5; for (let i = 0; i < 5; i++) { s += a * n2(x, y); x = x * 2.03 + 1.7; y = y * 2.03 + 3.1; a *= 0.5; } return s; };
    const MBASE = GROUND - 40, R0 = 2700, R1 = 4400, SEG = 720, ROWS = 16;
    const mtnH = (th, t) => {
      const c = Math.cos(th), sn = Math.sin(th);
      const amp = 120 + 380 * fbm2(c * 2.2 + 5, sn * 2.2 + 9) + 320 * Math.max(0, sn) + 160 * Math.max(0, c) - 90 * Math.max(0, -c);
      const ridge = 1 - Math.abs(fbm2(c * 9 + t * 3, sn * 9 - t * 2) * 2 - 1);
      return amp * Math.pow(Math.sin(Math.PI * clamp(t * 1.15, 0, 1)), 0.85) * (0.5 + 0.5 * ridge);
    };
    const mpos = [], mcol = [], midx = [], ridgeDeg = new Array(360).fill(-90);
    const SNOW = new THREE.Color('#f4f6f9'), ROCK = new THREE.Color('#6b7078'), FOREST = new THREE.Color('#3a5440'), tmpC = new THREE.Color();
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS, r = R0 + (R1 - R0) * t;
      for (let i = 0; i <= SEG; i++) {
        const th = (i / SEG) * Math.PI * 2, hh = mtnH(th, t), y = MBASE + hh;
        mpos.push(Math.cos(th) * r, y, Math.sin(th) * r);
        if (hh > 470 + 60 * n2(i * 0.3, j)) tmpC.copy(SNOW); else tmpC.copy(FOREST).lerp(ROCK, sstep(120, 380, hh));
        mcol.push(tmpC.r, tmpC.g, tmpC.b);
        const deg = Math.round(th / RAD) % 360;
        ridgeDeg[deg] = Math.max(ridgeDeg[deg], Math.atan2(y - 1.65, r) / RAD);
        if (j && i) { const w = SEG + 1, a = j * w + i, b = a - 1, c = a - w, d = c - 1; midx.push(d, b, a, d, a, c); }
      }
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mpos, 3));
    mg.setAttribute('color', new THREE.Float32BufferAttribute(mcol, 3));
    mg.setIndex(midx); mg.computeVertexNormals();
    const mtnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: '#8a8a8a', side: THREE.DoubleSide });
    // Aerial perspective: the scene's exp² fog, but ~3x thinner, so far ranges fade into the sky instead of vanishing.
    mtnMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
        `#ifdef USE_FOG
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.11);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.9);
        #endif`);
    };
    world.add(new THREE.Mesh(mg, mtnMat));

    return {
      mat: cityMat, ground: groundMat, av: avMat, mtn: mtnMat, ridge: ridgeDeg,
      setEnv(tex) { for (const m of [cityMat, waterMat]) { if (!m.envMap) m.needsUpdate = true; m.envMap = tex; } },
    };
  }

  // Reception by the east windows.
  box(world, 2.6, 1.05, 0.7, '#c49a6c', 17.6, 0.525, -1.9, { mat: { roughness: 0.55 } });
  box(world, 2.7, 0.05, 0.85, '#2a2724', 17.6, 1.075, -1.9, { mat: { roughness: 0.35 } });
  solid(17.6, -1.9, 2.7, 0.85);
  plant(19.3, -2.7, 1.1);

  // Brick feature wall in the lounge.
  {
    const bt = brickTexture();
    bt.repeat.set(5, 1.7);
    box(world, 10, ROOM.h, 0.06, '', 11, ROOM.h / 2, 14.87, { material: new THREE.MeshStandardMaterial({ map: bt, roughness: 0.95 }) });
  }

  // ----- furniture helpers -----
  const LAMP_DIM = 0.6, GLOW_DIM = 0.6;   // overall dimmer for lamp light and the glow of bulbs/shades
  function addLamp(x, y, z, base) {
    base *= LAMP_DIM;
    const l = new THREE.PointLight('#ffc98a', base, 16, 2);
    l.position.set(x, y, z);
    world.add(l);
    lamps.push({ light: l, base });
  }
  const glowMat = (eBase, color = '#fff3dd') => {
    eBase *= GLOW_DIM;
    const m = new THREE.MeshStandardMaterial({ color, emissive: '#ffcf8a', emissiveIntensity: eBase, roughness: 0.9, side: THREE.DoubleSide });
    lamps.push({ mat: m, eBase });
    return m;
  };
  const bulbM = glowMat(1.7), barM = glowMat(1.5);
  function pendant(x, z, { drop = 1.0, light = 0, shade = '#2b2b2b' } = {}) {
    const y = ROOM.h - drop;
    cyl(world, 0.006, 0.006, drop, '#222', x, ROOM.h - drop / 2, z, { shadow: false });
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.26, 24, 1, true), mat(shade, { roughness: 0.5, side: THREE.DoubleSide }));
    sh.position.set(x, y - 0.12, z);
    world.add(sh);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), bulbM);
    bulb.position.set(x, y - 0.22, z);
    world.add(bulb);
    if (light) addLamp(x, y - 0.35, z, light);
  }
  function floorLamp(x, z, light = 10) {
    cyl(world, 0.16, 0.18, 0.03, '#2a2a2a', x, 0.015, z);
    cyl(world, 0.012, 0.012, 1.5, '#2a2a2a', x, 0.77, z);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.3, 24, 1, true), glowMat(0.9, '#efe2c8'));
    shade.position.set(x, 1.56, z);
    world.add(shade);
    addLamp(x, 1.45, z, light);
    solid(x, z, 0.35, 0.35);
  }
  function bookshelf(x, z, rotY, w, h, rows) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; world.add(g);
    const D = 0.34, gap = (h - 0.06) / rows;
    const frame = [[0.04, h, D, -w / 2 + 0.02, h / 2, 0], [0.04, h, D, w / 2 - 0.02, h / 2, 0], [w, 0.03, D, 0, h - 0.015, 0],
      [w, 0.04, D, 0, 0.02, 0], [w, h, 0.02, 0, h / 2, -D / 2 + 0.01]];
    for (let r = 1; r < rows; r++) frame.push([w, 0.025, D, 0, 0.04 + r * gap, 0]);
    g.add(mergedBoxes(frame, mat('#7a5232', { roughness: 0.7 })));
    const R = rng(hash(`${x},${z}`)), books = [];
    const pal = ['#8c3b2f', '#2f5d62', '#d9a441', '#3f4a6b', '#e7dcc8', '#6b8e4e', '#a35d7a', '#1f2a33', '#c26a3d'];
    for (let r = 0; r < rows; r++) {
      let bx = -w / 2 + 0.06;
      const by = 0.04 + r * gap + 0.0125;
      while (bx < w / 2 - 0.1) {
        if (R() < 0.07) { bx += 0.18; continue; }
        const bw = 0.025 + R() * 0.035, bh = Math.min(gap - 0.05, 0.17 + R() * 0.12), lean = R() < 0.04;
        books.push([lean ? bh : bw, lean ? bw : bh, 0.2 + R() * 0.06, bx + (lean ? bh : bw) / 2, by + (lean ? bw : bh) / 2, 0.02, pal[Math.floor(R() * pal.length)]]);
        bx += (lean ? bh : bw) + 0.004;
      }
    }
    g.add(mergedBoxes(books, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
    const horiz = Math.abs(Math.sin(rotY)) < 0.5;
    solid(x, z, horiz ? w : D, horiz ? D : w);
    return g;
  }
  let artSeed = 3;
  function art(x, y, z, rotY, w, h) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; world.add(g);
    box(g, w + 0.08, h + 0.08, 0.04, '#1c1a18', 0, 0, 0);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: artTexture(artSeed++, w / h), roughness: 0.9 }));
    pic.position.z = 0.022;
    g.add(pic);
  }
  // All plant foliage is three instanced meshes (twig cards, strap-leaf cards, stems) sharing one alpha-tested
  // leaf atlas; cards sway in the vertex shader. Built lazily since plant() runs before this point in the file.
  function plantKit() {
    if (plantKit.k) return plantKit.k;
    const map = leafTexture(), time = { value: 0 };
    const sway = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = dot(instanceMatrix[3].xyz, vec3(3.1, 1.7, 2.3)), w = position.y * position.y;
          transformed.x += sin(uTime * 0.6 + ph) * 0.01 * w; transformed.z += sin(uTime * 0.9 + ph * 1.7) * 0.007 * w; }`);
    };
    const leafM = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
    const depthM = new THREE.MeshDepthMaterial({ map, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
    leafM.onBeforeCompile = depthM.onBeforeCompile = sway;
    const cardGeo = (u0, droop) => {
      const g = new THREE.PlaneGeometry(1, 1, 1, 4); g.translate(0, 0.5, 0);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { p.setZ(i, -droop * p.getY(i) ** 2); uv.setX(i, u0 + uv.getX(i) * 0.5); }
      g.computeVertexNormals();
      return g;
    };
    const inst = (geo, m, n) => {
      const im = new THREE.InstancedMesh(geo, m, n);
      im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.layers.set(1);   // layer 1: keep alpha cards out of the AO/depth passes
      world.add(im);
      return im;
    };
    const twig = inst(cardGeo(0, 0.35), leafM, 1600), strap = inst(cardGeo(0.5, 0.15), leafM, 600);
    const stem = inst(new THREE.CylinderGeometry(0.6, 1, 1, 5).translate(0, 0.5, 0), mat('#5b4532', { roughness: 1 }), 200);
    twig.customDepthMaterial = strap.customDepthMaterial = depthM;
    twig.onBeforeRender = () => { time.value = performance.now() / 1000; };
    const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
    const M = new THREE.Matrix4(), rollM = new THREE.Matrix4(), sc = new THREE.Vector3();
    // Card base at p growing along d, leaf face turned up/outward, so the bend in the geometry droops the tip.
    const add = (im, p, d, sx, sy, roll = 0, color) => {
      by.copy(d).normalize(); bx.crossVectors(by, Math.abs(by.y) > 0.99 ? X : UP).normalize(); bz.crossVectors(bx, by);
      M.makeBasis(bx, by, bz).multiply(rollM.makeRotationY(roll)).scale(sc.set(sx, sy, im === stem ? sx : sy)).setPosition(p);
      im.setMatrixAt(im.count, M); im.instanceMatrix.needsUpdate = true;
      if (color) { im.setColorAt(im.count, color); im.instanceColor.needsUpdate = true; }
      im.count++;
    };
    return (plantKit.k = { twig, strap, stem, add });
  }
  function smallPlant(parent, x, y, z) {
    cyl(parent, 0.06, 0.05, 0.1, '#d9cfc0', x, y + 0.05, z);
    const { strap, add } = plantKit(), R = rng(hash(`${x}|${y}|${z}`)), p = new THREE.Vector3(), d = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + R(), h = 0.12 + R() * 0.08;
      p.set(x + Math.cos(a) * 0.015, y + 0.09, z + Math.sin(a) * 0.015); d.set(Math.cos(a) * (0.3 + R() * 0.5), 1, Math.sin(a) * (0.3 + R() * 0.5));
      add(strap, p, d, h * 0.9, h, R() - 0.5, c.setRGB(0.8 + R() * 0.2, 1.05, 0.95 + R() * 0.2));
    }
  }
  // Pot plus one of three plant types picked by position: leafy ficus-like shrub, upright snake plant, arching fern-like fronds.
  function plant(x, z, s = 1) {
    cyl(world, 0.22 * s, 0.17 * s, 0.45 * s, '#d6d2c8', x, 0.225 * s, z);
    cyl(world, 0.2 * s, 0.2 * s, 0.02, '#3b2c22', x, 0.44 * s, z, { seg: 12, mat: { roughness: 1 } });
    const { twig, strap, stem, add } = plantKit(), R = rng(hash(`${x}|${z}`)), kind = [0, 0, 1, 2][hash(`${z}|${x}`) % 4];
    const p = new THREE.Vector3(), d = new THREE.Vector3(), c = new THREE.Color(), tint = new THREE.Color(0.85 + R() * 0.2, 1, 0.8 + R() * 0.25);
    const soil = 0.45 * s, cy = 0.85 * s, cr = 0.42 * s;
    if (kind === 0) {
      add(stem, p.set(x, soil, z), d.set(0, 1, 0), 0.025 * s, cy - soil);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + R(), q = new THREE.Vector3(x + Math.cos(a) * cr * 0.55, cy + (R() - 0.3) * cr * 0.8, z + Math.sin(a) * cr * 0.55);
        p.set(x, cy - 0.1 * s, z); d.subVectors(q, p); add(stem, p, d, 0.012 * s, d.length());
      }
      for (let i = 0; i < 72; i++) {
        const u = R() * 2 - 1, a = R() * Math.PI * 2, k = Math.sqrt(1 - u * u), f = 0.35 + R() * 0.6;
        d.set(Math.cos(a) * k, u * 0.7 + 0.3, Math.sin(a) * k);
        p.set(x + d.x * cr * f * 0.75, cy + d.y * cr * f * 0.9, z + d.z * cr * f * 0.75);
        d.x += (R() - 0.5) * 0.6; d.z += (R() - 0.5) * 0.6; d.y += 0.25;
        const h = (0.32 + R() * 0.16) * s;
        add(twig, p, d, h * 0.9, h, (R() - 0.5) * 1.2, c.copy(tint).multiplyScalar((0.55 + 0.45 * f) * (0.85 + R() * 0.3)));
      }
    } else if (kind === 1) {
      for (let i = 0; i < 13; i++) {
        const a = i * 2.4 + R(), r = R() * 0.1 * s, h = (0.65 + R() * 0.4) * s;
        p.set(x + Math.cos(a) * r, soil, z + Math.sin(a) * r); d.set(Math.cos(a) * (0.08 + R() * 0.2), 1, Math.sin(a) * (0.08 + R() * 0.2));
        add(strap, p, d, h * 0.5, h, R() * 3, c.copy(tint).multiplyScalar(0.8 + R() * 0.35));
      }
    } else {
      add(stem, p.set(x, soil, z), d.set(0, 1, 0), 0.02 * s, 0.25 * s);
      for (let i = 0; i < 30; i++) {
        const a = i * 2.4 + R() * 0.5, up = i < 8 ? 1.6 + R() : 0.5 + R() * 0.7, h = (0.38 + R() * 0.18) * s, y = soil + (0.05 + R() * 0.2) * s;
        p.set(x, y, z); d.set(Math.cos(a), up, Math.sin(a));
        add(twig, p, d, h * 0.85, h, (R() - 0.5) * 0.4, c.copy(tint).multiplyScalar((i < 8 ? 1.05 : 0.8) * (0.85 + R() * 0.3)));
      }
    }
    solid(x, z, 0.5 * s, 0.5 * s);
  }
  function officeChair(x, z, rotY, color = '#2b2e33') {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; world.add(g);
    box(g, 0.5, 0.08, 0.5, color, 0, 0.43, 0);
    box(g, 0.48, 0.55, 0.06, color, 0, 0.78, -0.25);
    cyl(g, 0.03, 0.03, 0.36, '#555', 0, 0.22, 0);
    cyl(g, 0.28, 0.28, 0.04, '#333', 0, 0.04, 0, { seg: 5 });
    return g;
  }
  function monitor(parent, w, h, x, yBottom, z, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, yBottom, z); g.rotation.y = rotY; parent.add(g);
    const bezel = box(g, w + 0.03, h + 0.03, 0.03, '#141518', 0, 0.12 + h / 2, -0.005, { mat: { roughness: 0.4 } });
    box(g, 0.05, 0.12, 0.04, '#2a2c30', 0, 0.06 + 0.01, -0.03);
    box(g, 0.24, 0.015, 0.16, '#2a2c30', 0, 0.008, -0.03);
    return { g, bezel, screenY: 0.12 + h / 2, screenZ: 0.012 };
  }
  function sofa(x, z, rotY, len = 2.4, color = '#5b6b7d') {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; world.add(g);
    box(g, len, 0.4, 0.9, color, 0, 0.2, 0);
    box(g, len, 0.12, 0.7, color, 0, 0.46, 0.08, { mat: { roughness: 1 } });
    box(g, len, 0.5, 0.2, color, 0, 0.6, -0.35);
    box(g, 0.2, 0.32, 0.9, color, -len / 2 + 0.1, 0.52, 0);
    box(g, 0.2, 0.32, 0.9, color, len / 2 - 0.1, 0.52, 0);
    const CUSH = ['#d9a441', '#b5654a', '#e7dcc8', '#6b8e4e', '#a35d7a'];
    for (const side of [-1, 1]) box(g, 0.26, 0.34, 0.12, CUSH[hash(`${x}${z}${side}`) % CUSH.length], side * (len / 2 - 0.33), 0.72, -0.2).rotation.x = -0.25;
    const horiz = Math.abs(Math.sin(rotY)) < 0.5;
    solid(x, z, horiz ? len : 0.9, horiz ? 0.9 : len);
  }

  // ----- desks -----
  const desks = [];
  const deskTopM = mat('#c49a6c', { roughness: 0.55 }), legM = mat('#2f3236', { metalness: 0.5, roughness: 0.4 });
  for (const z of [-3.5, -7.5, -11.5]) {
    for (const x of [0.5, -3, -6.5, -10, -13.5, -17]) {
      box(world, 2.0, 0.04, 0.8, '', x, 0.74, z, { material: deskTopM });
      box(world, 0.04, 0.72, 0.7, '', x - 0.96, 0.36, z, { material: legM });
      box(world, 0.04, 0.72, 0.7, '', x + 0.96, 0.36, z, { material: legM });
      box(world, 0.44, 0.015, 0.14, '#3a3c40', x, 0.765, z + 0.18);
      box(world, 0.06, 0.02, 0.1, '#3a3c40', x + 0.36, 0.765, z + 0.2);
      if (hash(String(x * z)) % 3 === 0) cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', x - 0.82, 0.81, z + 0.2);
      box(world, 1.3, 0.035, 0.09, '', x, 2.6, z + 0.1, { material: barM, shadow: false });
      for (const dx of [-0.5, 0.5]) cyl(world, 0.004, 0.004, ROOM.h - 2.6, '#222', x + dx, (ROOM.h + 2.6) / 2, z + 0.1, { shadow: false });
      if (hash(`${x}|${z}`) % 3 === 1) smallPlant(world, x + 0.86, 0.76, z + 0.22);
      officeChair(x, z + 0.68, Math.PI);
      // Left: session stats. Right: the code it's writing. Both angled in toward the chair.
      const mon = monitor(world, 0.9, 0.5625, x - 0.47, 0.76, z - 0.2, 0.14);
      const scr = makeScreen(mon.g, 0.9, 0.5625, 800, 500, 0, mon.screenY, mon.screenZ);
      const codeMon = monitor(world, 0.9, 0.5625, x + 0.47, 0.76, z - 0.2, -0.14);
      const codeScr = makeScreen(codeMon.g, 0.9, 0.5625, 800, 500, 0, codeMon.screenY, codeMon.screenZ);
      drawOff(scr); scr.tex.needsUpdate = true;
      drawOff(codeScr); codeScr.tex.needsUpdate = true;
      solid(x, z, 2.0, 0.8);
      const chair = { x, z: z + 0.62 };
      const lane = x + 1.75;
      desks.push({ x, z, scr, codeScr, owner: null, spot: { key: `desk:${x},${z}`, kind: 'desk', pos: chair, rotY: Math.PI, pose: 'type',
        route: [{ x: lane, z: AISLE }, { x: lane, z: chair.z }, chair] } });
    }
  }

  // Big activity screen over the desk floor.
  const feedTV = makeScreen(world, 4.2, 2.1, 1280, 640, -8.2, 2.05, -14.86);
  box(world, 4.3, 2.2, 0.06, '#111214', -8.2, 2.05, -14.9);

  // ----- breakroom -----
  sofa(-14, 5.2, 0);
  sofa(-14, 8.8, Math.PI);
  box(world, 1.3, 0.06, 0.65, '#8a6a4a', -14, 0.4, 7, { mat: { roughness: 0.5 } });
  box(world, 1.2, 0.37, 0.55, '#6e5238', -14, 0.185, 7);
  solid(-14, 7, 1.3, 0.65);
  cyl(world, 0.06, 0.06, 0.12, '#2f6f8f', -14.3, 0.49, 7.1); cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', -13.7, 0.48, 6.9);
  // Kitchen counter, coffee machine, fridge.
  box(world, 6.6, 0.9, 0.7, '#fafafa', -15.5, 0.45, 14.5);
  box(world, 6.7, 0.04, 0.74, '#3b3f45', -15.5, 0.92, 14.5, { mat: { roughness: 0.3 } });
  box(world, 0.45, 0.55, 0.42, '#2b2b2b', -16.5, 1.22, 14.55, { mat: { metalness: 0.5, roughness: 0.35 } });
  box(world, 0.3, 0.06, 0.2, '#b08d57', -16.5, 1.35, 14.32, { shadow: false });
  for (let i = 0; i < 4; i++) cyl(world, 0.04, 0.035, 0.1, ['#f4f1ea', '#d97757', '#2f6f8f', '#f4f1ea'][i], -15.6 + i * 0.12, 0.99, 14.4);
  box(world, 0.8, 1.9, 0.75, '#dcdfe3', -19.32, 0.95, 14.4, { mat: { metalness: 0.3, roughness: 0.35 } });
  solid(-15.5, 14.5, 6.6, 0.7); solid(-19.32, 14.4, 0.8, 0.75);
  // Ping pong.
  box(world, 2.74, 0.04, 1.525, '#1d5c3a', -5.6, 0.76, 9.2, { mat: { roughness: 0.5 } });
  box(world, 2.74, 0.005, 0.02, '#ffffff', -5.6, 0.783, 9.2, { shadow: false });
  box(world, 0.02, 0.15, 1.6, '#eeeeee', -5.6, 0.86, 9.2, { mat: { transparent: true, opacity: 0.7 } });
  for (const dx of [-1.2, 1.2]) for (const dz of [-0.65, 0.65]) box(world, 0.05, 0.74, 0.05, '#222', -5.6 + dx, 0.37, 9.2 + dz);
  solid(-5.6, 9.2, 2.74, 1.525);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }));
  ball.castShadow = true; world.add(ball);
  // High table for chats.
  cyl(world, 0.4, 0.4, 0.04, '#f2efe9', -9.6, 1.06, 4.9, { seg: 24 });
  cyl(world, 0.04, 0.04, 1.04, '#2f3236', -9.6, 0.52, 4.9);
  cyl(world, 0.25, 0.25, 0.03, '#2f3236', -9.6, 0.015, 4.9);
  solid(-9.6, 4.9, 0.8, 0.8);
  cyl(world, 0.04, 0.035, 0.1, '#d97757', -9.5, 1.13, 4.85);
  // Beanbags.
  for (const z of [7.6, 9.6]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), mat(z < 8 ? '#c0573e' : '#e0a63a', { roughness: 1 }));
    b.scale.set(1, 0.55, 1); b.position.set(-18.35, 0.26, z); b.castShadow = true; b.receiveShadow = true; world.add(b);
  }
  // Whiteboard.
  const board = makeScreen(world, 2.4, 1.3, 1024, 560, -19.86, 1.6, 4.6);
  board.mesh.rotation.y = Math.PI / 2;
  board.mesh.material = new THREE.MeshStandardMaterial({ map: board.tex, roughness: 0.6 });
  box(world, 0.04, 1.38, 2.48, '#b9bcc0', -19.9, 1.6, 4.6, { shadow: false });
  plant(-2.6, 14.3, 1.1); plant(-19.3, 3.1); plant(-11, 14.3, 0.9);

  // Cozy bits: bookshelf divider, lamps, pendants, neon.
  bookshelf(-16, 2.42, 0, 7, 1.1, 2);
  for (const x of [-18.6, -16.2, -13.5]) smallPlant(world, x, 1.1, 2.42);
  floorLamp(-15.75, 4.95, 10);
  pendant(-14, 7, { light: 14 });
  pendant(-9.6, 4.9, { drop: 1.1, light: 10, shade: '#d97757' });
  pendant(-6.2, 9.2, { drop: 0.9 }); pendant(-5, 9.2, { drop: 0.9 });
  plant(-19.3, 12.6, 1.3); plant(-12, 2.6, 0.8);
  {
    const neon = makeScreen(world, 1.8, 0.45, 720, 180, -19.84, 2.78, 4.6);
    neon.mesh.rotation.y = Math.PI / 2;
    const { ctx } = neon;
    ctx.clearRect(0, 0, 720, 180);
    ctx.font = `italic 700 110px ${FONT}`; ctx.textAlign = 'center';
    ctx.shadowColor = '#ff5fa2'; ctx.shadowBlur = 30; ctx.fillStyle = '#ffd1e6';
    ctx.fillText('ship it ✦', 360, 128); ctx.fillText('ship it ✦', 360, 128);
    neon.mesh.material.transparent = true;
    neon.tex.needsUpdate = true;
  }
  addLamp(-17.5, 2.6, -7.5, 16); addLamp(-9, 2.6, -5.5, 16); addLamp(-1, 2.6, -9.5, 14);

  // ----- lounge / meeting area -----
  box(world, 3, 0.05, 1.2, '#e9e4da', 10, 0.74, 9, { material: deskTopM });
  for (const dx of [-1.3, 1.3]) box(world, 0.06, 0.72, 1, '', 10 + dx, 0.36, 9, { material: legM });
  solid(10, 9, 3, 1.2);
  for (const dx of [-1, 0, 1]) { officeChair(10 + dx, 8.15, 0, '#7a8796'); officeChair(10 + dx, 9.85, Math.PI, '#7a8796'); }
  plant(3.5, 3.4); plant(19.2, 14.2, 1.2); plant(19.2, 3.2); plant(5.4, -2.9, 0.9);
  sofa(16.5, 13.9, Math.PI, 2.6, '#8a6f5a');

  pendant(9.3, 9, { light: 14, shade: '#2f463b' }); pendant(10.7, 9, { shade: '#2f463b' });
  floorLamp(18.4, 14.3, 10);
  plant(15, 14.4, 0.9);

  // ----- my office -----
  // Tinted glass that gets more opaque and reflective at grazing angles, so the walls read as solid.
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#b9d3da', transparent: true, opacity: 0.14, roughness: 0.03, metalness: 0, envMapIntensity: 2.2, specularIntensity: 1, depthWrite: false });
  glassM.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = mix(gl_FragColor.a, 0.62, pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0));');
  };
  const frostTex = (() => {
    const t = makeCanvas(128, 64), { ctx } = t;
    ctx.fillStyle = 'rgba(244,247,248,.62)'; ctx.fillRect(0, 0, 128, 34);
    for (let x = 8; x < 128; x += 16) { ctx.beginPath(); ctx.arc(x, 48, 4.5, 0, Math.PI * 2); ctx.fill(); }
    t.tex.wrapS = THREE.RepeatWrapping; t.tex.needsUpdate = true;
    return t.tex;
  })();
  // Venetian blinds: k 0 = raised, 1 = lowered with slats tilted ~57°, leaving thin slits of light. Instanced slats per glass run.
  const slatM = mat('#e6e1d6', { roughness: 0.95, envMapIntensity: 0.25 }), blinds = { side: { key: 'side', k: 0, to: 0, runs: [] }, front: { key: 'front', k: 0, to: 0, runs: [] } };
  const BL = { top: ROOM.h - 0.12, sp: 0.05, stack: 0.008 }, _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  BL.n = Math.floor((BL.top - 0.08) / BL.sp);
  function layBlind(r, k) {
    const drop = clamp(k * 1.35, 0, 1), tilt = clamp((k - 0.72) / 0.28, 0, 1) * 1.0;
    const railY = lerp(BL.top - BL.n * BL.stack - 0.02, 0.06, drop);
    r.rail.position.y = railY;
    _q.setFromEuler(_e.set(tilt, 0, 0));
    for (let i = 0; i < BL.n; i++) {
      _m4.compose(_v.set(0, Math.max(BL.top - (i + 1) * BL.sp, railY + (BL.n - i) * BL.stack), 0), _q, _s);
      r.slats.setMatrixAt(i, _m4);
    }
    r.slats.instanceMatrix.needsUpdate = true;
    r.slats.computeBoundingSphere();
  }
  function glass(axis, fixed, from, to, bl) {
    const len = to - from, mid = (from + to) / 2, X = axis === 'x';
    const at = (u, w, h, d, y, m) => box(world, X ? w : d, h, X ? d : w, '', X ? u : fixed, y, X ? fixed : u, { material: m, shadow: false });
    const pane = at(mid, len, ROOM.h, 0.03, ROOM.h / 2, glassM);
    pane.userData = { action: 'blinds', blind: bl, reach: 3.5, glass: true };
    at(mid, len, 0.06, 0.06, 0.03, frameM); at(mid, len, 0.06, 0.06, ROOM.h - 0.03, frameM);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) at(from + (i * len) / n, 0.05, ROOM.h, 0.07, ROOM.h / 2, frameM);
    const fm = new THREE.MeshStandardMaterial({ map: frostTex.clone(), transparent: true, roughness: 0.9, depthWrite: false });
    fm.map.repeat.set(len / 0.32, 1); fm.map.needsUpdate = true;
    at(mid, len, 0.16, 0.036, 1.46, fm).userData = pane.userData;
    solid(X ? mid : fixed, X ? fixed : mid, X ? len : 0.08, X ? 0.08 : len);
    // Blind hangs on the office side of the glass.
    const g = new THREE.Group();
    g.position.set(X ? mid : fixed, 0, X ? fixed : mid); g.rotation.y = X ? Math.PI : Math.PI / 2; world.add(g);
    const w = len - 0.2;
    box(g, w, 0.05, 0.07, '#d9d4c9', 0, ROOM.h - 0.09, 0.11);
    const r = { slats: new THREE.InstancedMesh(new THREE.BoxGeometry(w, 0.004, 0.058), slatM, BL.n), rail: box(g, w, 0.02, 0.06, '#cfc9bd', 0, 0, 0.11) };
    r.slats.position.z = 0.11; r.slats.castShadow = true; g.add(r.slats);
    r.slats.userData = r.rail.userData = { action: 'blinds', blind: bl, reach: 6 };
    bl.runs.push(r); layBlind(r, 0);
  }
  glass('z', 6, -15, -3.5, blinds.side);
  glass('x', -3.5, 6, 7, blinds.front);
  glass('x', -3.5, 8.4, 20, blinds.front);
  for (const x of [7, 8.4]) box(world, 0.06, ROOM.h, 0.06, '', x, ROOM.h / 2, -3.5, { material: frameM, shadow: false });
  box(world, 1.46, 0.08, 0.08, '', 7.7, 2.24, -3.5, { material: frameM, shadow: false });
  box(world, 1.34, ROOM.h - 2.34, 0.03, '', 7.7, (ROOM.h + 2.28) / 2, -3.5, { material: glassM, shadow: false });
  // Glass door hinged on the left post, swinging into the office. Its collider follows it.
  const door = { k: 0, to: 0, pivot: new THREE.Group(), box: { minX: 7, maxX: 8.4, minZ: -3.54, maxZ: -3.46 } };
  {
    const p = door.pivot, W = 1.34, H = 2.18;
    p.position.set(7.04, 0, -3.5); world.add(p);
    box(p, W, H, 0.025, '', W / 2, H / 2 + 0.01, 0, { material: glassM, shadow: false });
    for (const [w, h, x, y] of [[W, 0.07, W / 2, 0.045], [W, 0.05, W / 2, H - 0.015], [0.05, H, 0.025, H / 2 + 0.01], [0.05, H, W - 0.025, H / 2 + 0.01]]) box(p, w, h, 0.045, '', x, y, 0, { material: frameM });
    const fm = new THREE.MeshStandardMaterial({ map: frostTex.clone(), transparent: true, roughness: 0.9, depthWrite: false });
    fm.map.repeat.set(W / 0.32, 1); fm.map.needsUpdate = true;
    box(p, W - 0.1, 0.16, 0.03, '', W / 2, 1.46, 0, { material: fm, shadow: false });
    for (const s of [-1, 1]) {
      cyl(p, 0.014, 0.014, 0.9, '#b8bcc2', W - 0.12, 1.05, s * 0.07, { mat: { metalness: 0.9, roughness: 0.25 } });
      for (const y of [0.65, 1.45]) box(p, 0.018, 0.018, 0.06, '#b8bcc2', W - 0.12, y, s * 0.04, { mat: { metalness: 0.9, roughness: 0.25 } });
    }
    p.traverse((o) => { if (o.isMesh) o.userData = { action: 'door', reach: 5 }; });
    colliders.push(door.box);
  }
  function setDoorBox(open) {
    Object.assign(door.box, open ? { minX: 7, maxX: 7.1, minZ: -4.9, maxZ: -3.5 } : { minX: 7, maxX: 8.4, minZ: -3.54, maxZ: -3.46 });
  }
  function officeFx(dt) {
    for (const b of Object.values(blinds)) if (b.k !== b.to) {
      b.k = b.to > b.k ? Math.min(b.to, b.k + dt / 1.6) : Math.max(b.to, b.k - dt / 1.6);
      for (const r of b.runs) layBlind(r, b.k);
    }
    if (door.k !== door.to) {
      door.k = door.to > door.k ? Math.min(1, door.k + dt / 0.9) : Math.max(0, door.k - dt / 0.9);
      door.pivot.rotation.y = ease(door.k) * Math.PI * 0.5;
      setDoorBox(door.k > 0.85);
      if (door.k < 0.85 && door.to === 0) collide(player);
    }
  }
  {
    const plate = makeScreen(world, 0.9, 0.22, 360, 88, 9.4, 1.75, -3.47);
    plate.ctx.fillStyle = 'rgba(20,20,22,.85)'; plate.ctx.beginPath(); plate.ctx.roundRect(0, 0, 360, 88, 14); plate.ctx.fill();
    plate.ctx.font = `600 40px ${FONT}`; plate.ctx.fillStyle = '#fff'; plate.ctx.fillText(fit(plate.ctx, dash.config?.owner ? `${dash.config.owner}'s office` : 'My office', 310), 26, 58);
    plate.mesh.material.transparent = true; plate.tex.needsUpdate = true;
  }
  const OWNER = { x: 13, z: -11.6 };
  box(world, 3.4, 0.05, 1.0, '#2a2724', OWNER.x, 0.74, OWNER.z, { mat: { roughness: 0.35 } });
  box(world, 0.05, 0.72, 0.9, '', OWNER.x - 1.65, 0.36, OWNER.z, { material: legM });
  box(world, 0.05, 0.72, 0.9, '', OWNER.x + 1.65, 0.36, OWNER.z, { material: legM });
  box(world, 0.46, 0.015, 0.15, '#3a3c40', OWNER.x, 0.77, OWNER.z + 0.27);
  cyl(world, 0.04, 0.035, 0.1, '#d97757', OWNER.x + 0.75, 0.815, OWNER.z + 0.3);
  solid(OWNER.x, OWNER.z, 3.4, 1.0);
  officeChair(OWNER.x, OWNER.z + 1.15, Math.PI, '#1d1f22');
  const leftMon = monitor(world, 0.9, 0.5625, OWNER.x - 1.18, 0.765, OWNER.z - 0.12, 0.5);
  const usageScr = makeScreen(leftMon.g, 0.9, 0.5625, 800, 500, 0, leftMon.screenY, leftMon.screenZ);
  const rightMon = monitor(world, 0.9, 0.5625, OWNER.x + 1.18, 0.765, OWNER.z - 0.12, -0.5);
  const rosterScr = makeScreen(rightMon.g, 0.9, 0.5625, 800, 500, 0, rightMon.screenY, rightMon.screenZ);
  const wallTV = makeScreen(world, 3.4, 1.7, 1280, 640, OWNER.x, 2.42, -14.86);
  box(world, 3.5, 1.8, 0.06, '#111214', OWNER.x, 2.42, -14.9);
  sofa(19.3, -9, -Math.PI / 2, 2.4, '#3d3a36');
  plant(18.9, -14.3, 1.2); plant(6.6, -14.3);

  bookshelf(8.6, -14.7, 0, 2.4, 2.2, 5);
  art(17.4, 1.75, -14.92, 0, 1.6, 1.1);
  smallPlant(world, 16.8, 1.1, -1.85);
  pendant(13, -10.6, { drop: 0.85, light: 12, shade: '#d97757' });
  floorLamp(19.3, -10.8, 10);
  smallPlant(world, OWNER.x - 1.5, 0.765, OWNER.z + 0.3);

  // The centre monitor: the real dashboard page, sized to the viewport's aspect so the
  // zoom transition starts and ends pixel-identical to the flat overview.
  const center = { x: OWNER.x, z: OWNER.z - 0.3, w: 1.25, h: 0.7 };
  const centerMon = monitor(world, 1, 1, center.x, 0.765, center.z);
  const holeM = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, side: THREE.DoubleSide });
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), holeM);
  hole.userData.action = 'computer';
  centerMon.g.add(hole);
  const domScreen = document.createElement('div');
  domScreen.className = 'of-dom';
  const cssObj = new CSS3DObject(domScreen);
  cssObj.element.style.pointerEvents = 'none';
  cssScene.add(cssObj);
  const screenWorld = new THREE.Vector3();
  function layoutCenterMonitor(pxW, pxH) {
    center.h = center.w * pxH / pxW;
    hole.scale.set(center.w, center.h, 1);
    hole.position.set(0, 0.12 + center.h / 2, 0.012);
    centerMon.bezel.scale.set(center.w + 0.03, center.h + 0.03, 1);
    centerMon.bezel.position.y = 0.12 + center.h / 2;
    domScreen.style.width = pxW + 'px';
    domScreen.style.height = pxH + 'px';
    hole.updateWorldMatrix(true, false);
    hole.getWorldPosition(screenWorld);
    cssObj.position.copy(screenWorld);
    cssObj.scale.setScalar(center.w / pxW);
  }

  // ----- wall TVs -----
  // Each is a live tab in a browser the server runs (set from its panel or the Admin tab, /api/tvs). Frames arrive over
  // one socket and are drawn into the screen's canvas; only the nearest few in view stream, the rest keep their last frame.
  const tvs = [];
  let using = null;   // the TV clicked into, taking mouse and keys
  function tvSet(id, x, y, z, rotY, w, hung) {
    const name = dash.tvList[id];
    const h = w * 9 / 16, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; world.add(g);
    box(g, w + 0.08, h + 0.08, 0.06, '#111214', 0, 0, -0.03, { mat: { roughness: 0.4 } });
    if (hung) for (const dx of [-w / 3, w / 3]) cyl(g, 0.01, 0.01, ROOM.h - y - h / 2, '#222', dx, (ROOM.h - y + h / 2) / 2, -0.03, { shadow: false });
    const scr = makeScreen(g, w, h, 1280, 720, 0, 0, 0.004);
    scr.mesh.userData.tv = id;
    scr.mesh.material.color.setScalar(1); scr.mesh.material.toneMapped = false;   // web pages in their own colours, not tone-mapped
    const t = { id, name, w, h, scr, cfg: null, frame: null, seq: 0, shown: 0, live: false, page: null, center: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)) };
    t.sphere = new THREE.Sphere(t.center, w * 0.6);
    tvs.push(t);
    paintTv(t);
  }
  const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };
  function paintTv(t) {
    const { ctx, W, H } = t.scr, c = t.cfg;
    ctx.fillStyle = c ? '#0b0d12' : '#050607'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    if (!c) {
      ctx.font = `600 44px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillText(`${t.name.toUpperCase()} TV · CLICK TO SET UP`, W / 2, H / 2 + 16);
    } else if (t.frame) {
      ctx.drawImage(t.frame, 0, 0, W, H);
      if (!t.live && t !== using) {
        ctx.font = `600 26px ${FONT}`; const label = '❚❚  paused · live when you walk closer', lw = ctx.measureText(label).width + 40;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.roundRect(W - lw - 20, H - 68, lw, 48, 24); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(label, W - lw / 2 - 20, H - 35);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(W / 2, 280, 92, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(W / 2 - 28, 232); ctx.lineTo(W / 2 + 48, 280); ctx.lineTo(W / 2 - 28, 328); ctx.fill();
      ctx.font = `600 52px ${FONT}`; ctx.fillStyle = '#e8e6df'; ctx.fillText(fit(ctx, hostOf(c.url), W - 160), W / 2, 480);
      ctx.font = `400 36px ${FONT}`; ctx.fillStyle = '#9a9890'; ctx.fillText(t.live ? 'loading…' : 'live when you walk closer', W / 2, 544);
    }
    t.scr.tex.needsUpdate = true;
  }
  tvSet('desks-west', -16.2, 2.05, -14.8, 0, 2.4);
  tvSet('desks-east', -0.4, 2.05, -14.8, 0, 2.4);
  tvSet('breakroom', -14, 2.15, 2.42, 0, 1.8, true);
  tvSet('pingpong', 3.69, 1.6, 8, -Math.PI / 2, 1.4);
  tvSet('lounge', 11, 1.75, 14.78, Math.PI, 2.6);
  tvSet('lobby', 17.6, 2.15, -3.3, 0, 2.0, true);

  // One socket to the server for every TV: JPEG frames in ([id length][id][JPEG]) and page updates; which TVs we're
  // looking at, how loud each should be for us, and input for the TV in use out.
  let sock = null, sentWatch = '', sentFade = '', fadeAt = 0;
  const utf8 = new TextDecoder();
  function tvSocket() {
    if (sock) return;
    sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/tv`);
    sock.binaryType = 'arraybuffer';
    sock.onopen = () => { sentWatch = sentFade = ''; };
    sock.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = JSON.parse(e.data), t = tvs.find((x) => x.id === m.id);
        if (t && m.t === 'page') { t.page = m; if (t === using) tvBarSync(); }
        return;
      }
      const b = new Uint8Array(e.data), n = b[0], t = tvs.find((x) => x.id === utf8.decode(b.subarray(1, 1 + n)));
      if (!t?.cfg) return;
      const seq = ++t.seq;   // decodes can finish out of order; keep the newest
      createImageBitmap(new Blob([b.subarray(1 + n)], { type: 'image/jpeg' })).then((img) => {
        if (seq < t.shown) return img.close();
        t.shown = seq; t.frame?.close(); t.frame = img; t.dirty = true;
      }).catch(() => {});
    };
    sock.onclose = () => { sock = null; if (active) setTimeout(tvSocket, 2000); };
  }
  const tvSend = (m) => sock?.readyState === 1 && sock.send(JSON.stringify(m));
  function tvQuiet() { tvSend({ t: 'watch', ids: [] }); tvSend({ t: 'fade', fades: {} }); sentWatch = sentFade = ''; }
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) tvQuiet(); });

  // Sound fades with distance: full within AUDIO.near, silent by AUDIO.far, times the TV's own volume (applied by the server).
  const AUDIO = { near: 3, far: 20 };
  const tvFrustum = new THREE.Frustum(), tvProj = new THREE.Matrix4(), toCam = new THREE.Vector3();
  function updateTVs(now) {
    camera.updateMatrixWorld();
    tvFrustum.setFromProjectionMatrix(tvProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const t of tvs) t.dist = toCam.subVectors(camera.position, t.center).length();
    const want = tvs.filter((t) => t.cfg && t.dist < 25
      && toCam.subVectors(camera.position, t.center).dot(t.normal) > 0 && tvFrustum.intersectsSphere(t.sphere)).sort((a, b) => a.dist - b.dist).slice(0, 3);
    for (const t of tvs) {
      if (want.includes(t) || t === using) t.seen = now;
      const live = !!t.cfg && now - (t.seen ?? -1e9) < 3000;   // a short grace, so glancing away doesn't stop the stream
      if (live !== t.live) { t.live = live; t.dirty = true; }
      if (t.dirty) { t.dirty = false; paintTv(t); }
    }
    if (sock?.readyState !== 1) return;
    const ids = tvs.filter((t) => t.live).map((t) => t.id), w = `${ids}|${using?.id || ''}`;
    if (w !== sentWatch) { sentWatch = w; tvSend({ t: 'watch', ids, use: using?.id || null }); }
    if (now - fadeAt < 250) return;
    fadeAt = now;
    const fades = {};
    for (const t of tvs) if (t.cfg && t.dist < AUDIO.far) fades[t.id] = Math.round(100 * (1 - sstep(AUDIO.near, AUDIO.far, t.dist))) / 100;
    const f = JSON.stringify(fades);
    if (f !== sentFade) { sentFade = f; tvSend({ t: 'fade', fades }); }
  }
  function applyTvs(map) {
    for (const t of tvs) {
      const c = map?.[t.id] || null;
      if (JSON.stringify(c) === JSON.stringify(t.cfg)) continue;
      if (c?.url !== t.cfg?.url || c?.at !== t.cfg?.at) { t.frame?.close(); t.frame = null; t.shown = t.seq; t.page = null; }
      t.cfg = c; t.dirty = true;
      if (t === using) c ? tvBarSync() : leaveTv();
    }
  }
  dash.tvListeners.add(applyTvs);
  applyTvs(dash.tvs);
  // Blinds and door follow the shared office settings (Admin tab, or a click in another browser).
  function applyOffice(o) {
    for (const [k, v] of Object.entries(o?.blinds || {})) if (blinds[k]) blinds[k].to = v;
    if (o && 'door' in o) door.to = o.door;
  }
  dash.officeListeners.add(applyOffice);
  applyOffice(dash.office);

  // TV config lives in the drawer (and the Admin tab). Volume and mute apply live without reloading the page.
  const TV_REFRESH = dash.tvRefresh;
  const normUrl = dash.normUrl;
  function openTvPanel(t) {
    const c = t.cfg || {};
    const db = dash.openPanel(`<div style="font-size:19px;font-weight:650">${escapeHtml(t.name)} TV</div><div class="muted" style="font-size:12px">A live browser tab on the office wall · click the TV to use it</div>`,
      `<form class="panel of-tvform">
        <label>Show this URL<input name="url" type="text" autocomplete="off" spellcheck="false" placeholder="Any web page: YouTube, GitHub, the dashboard" value="${escapeHtml(c.url || '')}"></label>
        <div class="of-presets">Try <button type="button" data-url="${escapeHtml(location.origin)}/">Live dashboard</button></div>
        <label>Auto-refresh<select name="refresh">${TV_REFRESH.map(([v, l]) => `<option value="${v}"${v === (c.refresh || 0) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Volume<span class="of-volrow"><input name="volume" type="range" min="0" max="100"><span class="of-volv"></span><button type="button" data-mute></button></span></label>
        <div class="of-tvwarn"></div>
        <div class="of-tvbtns"><button type="submit" class="pri">Save</button><button type="button" data-off>Turn off</button><a target="_blank" rel="noopener">Open in new tab ↗</a></div>
        <div class="muted" style="font-size:12px">Sound fades with distance on top of this volume. Logins made on a TV stay in the TV browser's own profile.</div>
      </form>`);
    const form = db.querySelector('form'), input = form.elements.url, warn = form.querySelector('.of-tvwarn'), link = form.querySelector('a');
    const vol = form.elements.volume, volV = form.querySelector('.of-volv'), mute = form.querySelector('[data-mute]');
    const check = (msg) => {
      let host = '';
      try { host = new URL(normUrl(input.value)).hostname; } catch {}
      link.href = normUrl(input.value) || '#'; link.style.visibility = host ? '' : 'hidden';
      warn.className = 'of-tvwarn' + (msg ? ' bad' : ''); warn.textContent = msg || '';
    };
    const syncVol = () => {
      const c = dash.tvs[t.id];
      vol.disabled = mute.disabled = !c;
      if (document.activeElement !== vol) vol.value = c?.volume ?? 100;
      volV.textContent = c ? `${c.volume}%` : 'TV off';
      mute.textContent = c?.muted ? 'Unmute' : 'Mute';
    };
    vol.oninput = () => { dash.patchTv(t.id, { volume: +vol.value }); syncVol(); };
    mute.onclick = () => { dash.patchTv(t.id, { muted: !dash.tvs[t.id]?.muted }); syncVol(); };
    dash.tvListeners.add(syncVol);
    new MutationObserver((_, mo) => { if (!form.isConnected) { dash.tvListeners.delete(syncVol); mo.disconnect(); } }).observe(db, { childList: true });
    input.oninput = () => check();
    form.querySelector('.of-presets').onclick = (e) => { const b = e.target.closest('button'); if (b) { input.value = b.dataset.url; check(); } };
    const save = async (url, refresh) => {
      warn.className = 'of-tvwarn'; warn.textContent = url ? 'Saving…' : '';
      const r = await dash.saveTv(t.id, url, refresh);
      if (r?.error) return check(`Couldn't save: ${r.error}`);
      dash.closeDrawer();
    };
    form.onsubmit = (e) => { e.preventDefault(); save(normUrl(input.value), +form.elements.refresh.value); };
    form.querySelector('[data-off]').onclick = () => save('', 0);
    check(); syncVol();
    input.focus(); input.select();
  }

  // ----- idle spots -----
  const R = (...pts) => pts.map(([x, z]) => ({ x, z }));
  const idleSpots = [];
  const spot = (key, x, z, rotY, pose, route) => { const s = { key, kind: 'idle', pos: { x, z }, rotY, pose, route: [...route, { x, z }] }; idleSpots.push(s); return s; };
  const sofaA = [-14.8, -14, -13.2].map((x, i) => spot(`sofaA${i}`, x, 5.25, 0, 'sofa', R([-11.6, AISLE], [-11.6, 6.15], [x, 6.15])));
  const sofaB = [-14.8, -14, -13.2].map((x, i) => spot(`sofaB${i}`, x, 8.75, Math.PI, 'sofa', R([-11.6, AISLE], [-11.6, 7.85], [x, 7.85])));
  const coffee = [[-16.3, 13.35, -15.2], [-15.2, 13.3, -16.3]].map(([x, z, fx], i) =>
    spot(`coffee${i}`, x, z, faceTo({ x, z }, { x: fx, z: 12.7 }), 'coffee', R([-11.6, AISLE], [-11.6, 12.6], [x, 12.6])));
  const pp = [spot('pp0', -7.45, 9.2, Math.PI / 2, 'pingpong', R([-7.45, AISLE])), spot('pp1', -3.75, 9.2, -Math.PI / 2, 'pingpong', R([-3.75, AISLE]))];
  const chat = [
    spot('chat0', -10.35, 4.9, Math.PI / 2, 'chat', R([-10.35, AISLE])),
    spot('chat1', -8.85, 4.9, -Math.PI / 2, 'chat', R([-8.85, AISLE])),
    spot('chat2', -9.6, 5.65, Math.PI, 'chat', R([-8.2, AISLE], [-8.2, 5.65])),
  ];
  const bean = [7.6, 9.6].map((z, i) => spot(`bean${i}`, -17.9, z, Math.PI / 2, 'beanbag', R([-11.6, AISLE], [-11.6, 10.7], [-16.9, 10.7], [-16.9, z])));
  const meet = [8.8, 10, 11.2].map((x, i) => spot(`meet${i}`, x, 7.55, 0, 'chat', R([x, AISLE])));
  const IDLE_ORDER = [sofaA[1], coffee[0], pp[0], pp[1], sofaA[0], chat[0], chat[1], bean[0], sofaA[2], coffee[1], bean[1], chat[2],
    sofaB[0], sofaB[1], sofaB[2], ...meet];
  const LOBBY = { key: 'lobby', kind: 'idle', pos: LIFT, rotY: -Math.PI / 2, pose: 'chat', route: [{ x: LIFT.x - 1, z: AISLE }, LIFT] };

  // ----- people sync -----
  const people = new Map();
  let overlays = localStorage.officeOverlays !== 'off';   // see setOverlays (H)
  let first = true;
  let S = null;
  const routeOut = (p) => (p.spot ? [...p.spot.route].reverse().slice(1) : []);
  function sendTo(p, target, instant) {
    if (p.spot === target) return;
    if (instant) { p.spot = target; p.place(target); return; }
    p.path = [...routeOut(p), ...target.route].map((q) => ({ ...q }));
    p.spot = target;
  }
  function sync(state) {
    S = state;
    const seen = new Set();
    for (const s of state.live) {
      seen.add(s.sessionId);
      let p = people.get(s.sessionId);
      if (!p) {
        p = new Person(s.sessionId, dash.colorHex(s.sessionId));
        p.label.visible = overlays;
        people.set(s.sessionId, p);
        world.add(p.root);
        if (!first) { p.root.position.set(LIFT.x, 0, LIFT.z); p.rotY = -Math.PI / 2; p.spot = LOBBY; p.root.scale.setScalar(0.01); p.scaleT = 1; }
      }
      p.session = s;
      const atDesk = s.status !== 'idle';
      if (!p.desk) { p.desk = desks.find((d) => !d.owner); if (p.desk) p.desk.owner = p; }
      let target;
      if (atDesk && p.desk) {
        if (p.idle) { p.idle.occupant = null; p.idle = null; }
        target = { ...p.desk.spot, pose: s.status === 'working' ? 'type' : 'wait' };
        if (p.spot?.key === target.key) { p.spot.pose = target.pose; target = p.spot; }
      } else {
        if (!p.idle) { p.idle = IDLE_ORDER.find((q) => !q.occupant) || null; if (p.idle) p.idle.occupant = p; }
        target = p.idle || LOBBY;
      }
      sendTo(p, target, first);
    }
    for (const [id, p] of people) {
      if (seen.has(id) || p.leaving) continue;
      p.leaving = true;
      if (p.idle) p.idle.occupant = null;
      if (p.desk) p.desk.owner = null;
      p.path = [...routeOut(p), { x: LIFT.x, z: AISLE }];
      p.spot = null;
      p.onArrive = () => { p.scaleT = 0; p.dying = true; };
    }
    first = false;
    const atDesks = state.live.filter((x) => x.status !== 'idle').length;
    countEl.innerHTML = `<b>${atDesks}</b> at desks · <b>${state.live.length - atDesks}</b> in the breakroom${state.totals.subagentsActive ? ` · <b>${state.totals.subagentsActive}</b> subagents` : ''}`;
    paintScreens(true);
  }

  let lastPaint = 0;
  function paintScreens(force) {
    const now = performance.now();
    if (!S || (!force && now - lastPaint < 1000)) return;
    lastPaint = now;
    for (const d of desks) {
      const s = d.owner?.session;
      const key = s ? (s.status === 'idle' ? 'away' : 'live') : 'off';
      if (key === 'off' && d.painted === 'off') continue;
      if (!s) drawOff(d.scr);
      else if (s.status === 'idle') drawAway(d.scr, s, d.owner.color);
      else drawSession(d.scr, s, d.owner.color);
      d.painted = key;
      d.scr.mesh.userData.sessionId = d.codeScr.mesh.userData.sessionId = s?.sessionId;
      d.scr.tex.needsUpdate = true;
      paintCode(d, now, true);
    }
    for (const p of people.values()) if (p.session && !p.leaving) p.setLabel(p.session);
    drawUsage(usageScr, S); usageScr.tex.needsUpdate = true;
    drawRoster(rosterScr, S); rosterScr.tex.needsUpdate = true;
    drawWall(wallTV, S); wallTV.tex.needsUpdate = true;
    drawFeed(feedTV, S); feedTV.tex.needsUpdate = true;
    drawBoard(board, S); board.tex.needsUpdate = true;
  }
  // Typing animation: a new edit is revealed over 1.5-9 s (faster for big edits); already-seen edits show in full.
  function paintCode(d, now, force) {
    const s = d.owner?.session;
    if (!s || s.status === 'idle') {
      if (d.codePainted !== 'off') { drawOff(d.codeScr); d.codeScr.tex.needsUpdate = true; d.codePainted = 'off'; }
      return;
    }
    const code = s.code, id = code?.id || 'none';
    if (d.codeId !== id) {
      const fresh = d.codeId !== undefined && code;
      d.codeId = id;
      d.codeAnim = fresh ? { start: now, dur: clamp(code.added.length / 0.09, 1500, 9000) } : null;
    }
    const a = d.codeAnim, typing = a && now - a.start < a.dur, recent = a && now - a.start < a.dur + 4000;
    if (!force && !recent) return;
    if (!force && now - (d.codeDrawn || 0) < (typing ? 70 : 500)) return;
    d.codeDrawn = now;
    const len = code ? code.added.length : 0;
    const shown = typing ? Math.max(1, Math.floor(len * ease(clamp((now - a.start) / a.dur, 0, 1)))) : len;
    drawCode(d.codeScr, s, d.owner.color, shown, recent ? Math.floor(now / 450) % 2 === 0 : null);
    d.codeScr.tex.needsUpdate = true;
    d.codePainted = 'code';
  }

  dash.onUpdate(sync);

  // ----- player -----
  const player = { x: OWNER.x, z: OWNER.z + 1.45, eye: SEATED_EYE, yaw: 0, pitch: 0, seated: true };
  const keys = new Set();
  let locked = false, active = false, mode = 'idle', anim = null;

  function fillPose() {
    const d = (center.h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return { x: screenWorld.x, y: screenWorld.y, z: screenWorld.z + d, yaw: 0, pitch: 0 };
  }
  function seatedPose() {
    const x = OWNER.x, z = OWNER.z + 1.45, y = SEATED_EYE;
    return { x, y, z, yaw: 0, pitch: Math.atan2(screenWorld.y - y, z - screenWorld.z) };
  }
  function setCam(p) { camera.position.set(p.x, p.y, p.z); camera.rotation.set(p.pitch, p.yaw, 0); }
  function camPose() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, pitch: camera.rotation.x }; }
  function tween(from, to, ms, done) {
    anim = { from, to, ms: REDUCED ? 1 : ms, start: performance.now(), done };
  }
  function stepTween(now) {
    if (!anim) return;
    const u = clamp((now - anim.start) / anim.ms, 0, 1), e = ease(u), { from: a, to: b } = anim;
    setCam({ x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e), yaw: a.yaw + angDiff(a.yaw, b.yaw) * e, pitch: lerp(a.pitch, b.pitch, e) });
    if (u >= 1) { const d = anim.done; anim = null; d?.(); }
  }
  function teleport(x, z, look, seated = false) {
    Object.assign(player, { x, z, seated, eye: seated ? SEATED_EYE : EYE });
    player.yaw = Math.atan2(-(look.x - x), -(look.z - z));
    player.pitch = Math.atan2((look.y ?? EYE) - player.eye, Math.hypot(look.x - x, look.z - z));
  }

  function collide(p, r = 0.3) {
    for (const b of colliders) {
      const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
      else {
        const pen = [[p.x - b.minX, -1, 0], [b.maxX - p.x, 1, 0], [p.z - b.minZ, 0, -1], [b.maxZ - p.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
        if (pen[1]) p.x = pen[1] < 0 ? b.minX - r : b.maxX + r; else p.z = pen[2] < 0 ? b.minZ - r : b.maxZ + r;
      }
    }
    p.x = clamp(p.x, ROOM.minX + 0.4, ROOM.maxX - 0.4);
    p.z = clamp(p.z, ROOM.minZ + 0.4, ROOM.maxZ - 0.4);
  }

  function movePlayer(dt) {
    let f = 0, s = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    if (f || s) {
      if (player.seated) { player.seated = false; player.z += 0.25; }
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8.5 : 4.4) * dt, n = Math.hypot(f, s);
      const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      player.x += ((-sy * f + cy * s) / n) * speed;
      player.z += ((-cy * f - sy * s) / n) * speed;
      collide(player);
    }
    player.eye = damp(player.eye, player.seated ? SEATED_EYE : EYE, 5, dt);
    const bob = (f || s) && !player.seated ? Math.sin(performance.now() / 140) * 0.025 : 0;
    setCam({ x: player.x, y: player.eye + bob, z: player.z, yaw: player.yaw, pitch: player.pitch });
  }

  // ----- input -----
  renderer.domElement.addEventListener('click', (e) => {
    if (mode !== 'free') return;
    if (!locked) { renderer.domElement.requestPointerLock(); return; }
    if (!hover) return;
    if (hover.action === 'computer') { document.exitPointerLock(); dash.setView('overview'); }
    else if (hover.sessionId) { document.exitPointerLock(); dash.openDrawer(hover.sessionId); }
    else if (hover.action === 'blinds') { hover.blind.to = hover.blind.to ? 0 : 1; dash.putOffice({ blinds: { [hover.blind.key]: hover.blind.to } }); }
    else if (hover.action === 'door') { door.to = door.to ? 0 : 1; dash.putOffice({ door: door.to }); }
    else if (hover.tv) {
      if (hover.tv.cfg && !e.shiftKey) useTv(hover.tv);
      else { document.exitPointerLock(); openTvPanel(hover.tv); }
    }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    hud.classList.toggle('of-locked', locked);
    if (!locked) keys.clear();
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked || mode !== 'free') return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.4, 1.4);
  });
  const TELEPORTS = {
    Digit1: () => teleport(-6, 1.4, { x: -8, y: 1.3, z: -10 }),
    Digit2: () => teleport(-6.5, 2.2, { x: -13, y: 1.0, z: 8 }),
    Digit3: () => { const p = seatedPose(); teleport(p.x, p.z, { x: screenWorld.x, y: screenWorld.y, z: screenWorld.z }, true); },
    Digit4: () => teleport(18.2, AISLE, { x: 0, y: 1.5, z: AISLE }),
  };
  document.addEventListener('keydown', (e) => {
    if (!active || mode !== 'free' || e.metaKey || e.ctrlKey || e.target.closest?.('input, select, textarea')) return;
    if (TELEPORTS[e.code]) { TELEPORTS[e.code](); return; }
    if (e.code === 'KeyG') { setQuality(!hq); return; }
    if (e.code === 'KeyH') { setOverlays(!overlays); return; }
    if (e.code === 'KeyT') { setSpeed(SPEEDS[(SPEEDS.indexOf(clockState.speed) + 1) % SPEEDS.length]); return; }
    if (e.code === 'KeyE' && hover?.tv) { document.exitPointerLock(); openTvPanel(hover.tv); return; }
    if (locked) { keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));

  // ----- using a TV -----
  // Clicking a TV frames it square-on and frees the mouse: the cursor maps onto the page through the screen's UVs, and keys
  // go to the page until Esc. The bar below has back/forward/reload/home, the address, and the TV's volume.
  const tvBar = hud.querySelector('.of-tvbar'), tvUrl = tvBar.querySelector('input[name=u]'), tvVol = tvBar.querySelector('input[type=range]');
  const tvMuteBtn = tvBar.querySelector('[data-act=mute]'), osdEl = hud.querySelector('.of-osd');
  const BTN = ['left', 'middle', 'right'];
  const mods = (e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
  function useTv(t) {
    if (!t?.cfg || !active) return;
    if (document.pointerLockElement) document.exitPointerLock();
    using = t; mode = 'tv'; keys.clear(); t.dirty = true;
    hud.classList.add('of-using');
    tvBarSync();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), d = Math.max(t.h / 2 / half / 0.82, t.w / 2 / (half * camera.aspect) / 0.92);
    tween(camPose(), { x: t.center.x + t.normal.x * d, y: t.center.y, z: t.center.z + t.normal.z * d, yaw: Math.atan2(t.normal.x, t.normal.z), pitch: 0 }, 700);
  }
  function leaveTv(relock) {
    if (!using) return;
    using.dirty = true; using = null;
    hud.classList.remove('of-using');
    tvUrl.blur();
    if (mode !== 'tv') return;
    tween(camPose(), { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch }, 600, () => { if (mode === 'tv') mode = 'free'; });
    if (relock) renderer.domElement.requestPointerLock();   // only works from a click; after Esc, click to look around again
  }
  function tvBarSync() {
    if (!using) return;
    const c = using.cfg;
    if (document.activeElement !== tvUrl) tvUrl.value = using.page?.url || c.url;
    if (document.activeElement !== tvVol) tvVol.value = c.volume;
    tvMuteBtn.textContent = c.muted ? '🔇' : c.volume ? '🔊' : '🔈';
    tvMuteBtn.title = `${c.muted ? 'Unmute' : 'Mute'} (${ALT}M)`;
    hud.querySelector('.of-tvname').textContent = using.name;
  }
  let osdT = 0;
  function tvVolume(patch) {
    const c = { ...using.cfg, ...patch };
    dash.patchTv(using.id, patch);
    osdEl.textContent = c.muted ? '🔇  Muted' : `${c.volume ? '🔊' : '🔈'}  ${c.volume}%`;
    osdEl.classList.add('on'); clearTimeout(osdT); osdT = setTimeout(() => osdEl.classList.remove('on'), 1100);
  }
  const volStep = (d) => tvVolume({ volume: clamp(using.cfg.volume + d, 0, 100), muted: false });
  tvBar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !using) return;
    if (b.dataset.nav) tvSend({ t: 'nav', id: using.id, act: b.dataset.nav });
    else if (b.dataset.act === 'mute') tvVolume({ muted: !using.cfg.muted });
    else if (b.dataset.act === 'setup') openTvPanel(using);
    else if (b.dataset.act === 'leave') leaveTv(true);
    b.blur();
  });
  tvVol.addEventListener('input', () => using && tvVolume({ volume: +tvVol.value, muted: false }));
  tvVol.addEventListener('change', () => tvVol.blur());
  tvBar.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (using && tvUrl.value.trim()) tvSend({ t: 'nav', id: using.id, act: 'go', url: dash.normUrl(tvUrl.value) });
    tvUrl.blur();
  });
  tvUrl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); tvUrl.blur(); tvBarSync(); } });

  const tvRay = new THREE.Raycaster(), tvNdc = new THREE.Vector2();
  let tvMove = null;   // latest mousemove, sent once per frame
  function tvMouse(e, type, extra) {
    if (mode !== 'tv' || !using || anim) return;
    const r = renderer.domElement.getBoundingClientRect();
    tvNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    tvRay.setFromCamera(tvNdc, camera);
    const hit = tvRay.intersectObject(using.scr.mesh)[0];
    if (!hit) return;
    const press = type === 'mousePressed' || type === 'mouseReleased';
    tvSend({ t: 'mouse', id: using.id, type, x: hit.uv.x, y: 1 - hit.uv.y, button: press ? BTN[e.button] || 'none' : e.buttons & 1 ? 'left' : 'none',
      buttons: e.buttons, clickCount: press ? e.detail || 1 : 0, mods: mods(e), ...extra });
  }
  const gl = renderer.domElement;
  gl.addEventListener('mousemove', (e) => { if (mode === 'tv') tvMove = e; });
  gl.addEventListener('mousedown', (e) => { document.activeElement?.blur?.(); tvMouse(e, 'mousePressed'); });
  gl.addEventListener('mouseup', (e) => tvMouse(e, 'mouseReleased'));
  gl.addEventListener('contextmenu', (e) => { if (mode === 'tv') e.preventDefault(); });
  gl.addEventListener('wheel', (e) => {
    if (mode !== 'tv' || !using) return;
    e.preventDefault();
    if (e.altKey) return volStep(e.deltaY < 0 ? 5 : -5);
    const k = [1, 40, 720][e.deltaMode] || 1;
    tvMouse(e, 'mouseWheel', { dx: e.deltaX * k, dy: e.deltaY * k });
  }, { passive: false });
  // ⌘A/C/X/Z need explicit editing commands on a Mac; ⌘V is sent as text from the paste event; other ⌘ shortcuts stay the dashboard's.
  const CMDS = { KeyA: 'selectAll', KeyC: 'copy', KeyX: 'cut', KeyZ: 'undo' };
  const VOL_KEYS = { KeyM: () => tvVolume({ muted: !using.cfg.muted }), Minus: () => volStep(-10), Equal: () => volStep(10) };
  function tvKey(e) {
    if (mode !== 'tv' || !using || e.target.closest?.('input, select, textarea, #drawer')) return;
    const down = e.type === 'keydown';
    if (e.code === 'Escape') { if (down) { e.preventDefault(); leaveTv(); } return; }
    if (e.altKey && !e.metaKey && !e.ctrlKey && VOL_KEYS[e.code]) { e.preventDefault(); if (down) VOL_KEYS[e.code](); return; }
    if ((e.metaKey || (e.ctrlKey && !IS_MAC)) && e.code === 'KeyV') return;
    if (e.metaKey && !CMDS[e.code] && e.key !== 'Meta') return;
    e.preventDefault();
    const text = !down ? '' : e.key === 'Enter' ? '\r' : e.key.length === 1 && !e.ctrlKey && !e.metaKey ? e.key : '';
    tvSend({ t: 'key', id: using.id, type: !down ? 'keyUp' : text ? 'keyDown' : 'rawKeyDown', key: e.key, code: e.code, keyCode: e.keyCode, text,
      mods: mods(e), loc: e.location, cmd: down && e.metaKey ? CMDS[e.code] : undefined });
  }
  document.addEventListener('keydown', tvKey);
  document.addEventListener('keyup', tvKey);
  document.addEventListener('paste', (e) => {
    if (mode !== 'tv' || !using || e.target.closest?.('input, textarea')) return;
    e.preventDefault();
    tvSend({ t: 'text', id: using.id, text: e.clipboardData.getData('text') });
  });

  // ----- hover / inspect -----
  const ray = new THREE.Raycaster();
  ray.far = 14;
  ray.camera = camera;
  let hover = null;
  function updateHover() {
    hover = null;
    if (locked && mode === 'free') {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const targets = [hole, door.pivot, ...desks.flatMap((d) => [d.scr.mesh, d.codeScr.mesh]), ...tvs.map((t) => t.scr.mesh)];
      for (const b of Object.values(blinds)) for (const r of b.runs) targets.push(r.slats.parent);
      world.children.forEach((o) => { if (o.userData.glass) targets.push(o); });
      for (const p of people.values()) targets.push(p.root);
      for (const hit of ray.intersectObjects(targets, true)) {
        const ud = hit.object.userData;
        if (ud.reach && hit.distance > ud.reach) { if (ud.glass || hit.object.material.transparent) continue; break; }
        if (ud.action) { hover = { action: ud.action, blind: ud.blind }; break; }
        if (ud.tv) { hover = { tv: tvs.find((t) => t.id === ud.tv) }; break; }
        if (ud.sessionId) { hover = { sessionId: ud.sessionId }; break; }
        if (hit.object.isMesh && !hit.object.isSprite) break;
      }
    }
    if (!hover) { targetEl.style.display = 'none'; return; }
    targetEl.style.display = 'block';
    if (hover.action === 'computer') {
      targetEl.innerHTML = '<b>Your computer</b><div class="k">Click to sit down and open the dashboard</div>';
      return;
    }
    if (hover.action === 'blinds' || hover.action === 'door') {
      targetEl.innerHTML = hover.action === 'door' ? `<b>Office door</b><div class="k">Click to ${door.to ? 'close' : 'open'}</div>` : `<b>Blinds</b><div class="k">Click to ${hover.blind.to ? 'raise' : 'lower'} the blinds</div>`;
      return;
    }
    if (hover.tv) {
      const c = hover.tv.cfg;
      targetEl.innerHTML = `<b>${escapeHtml(hover.tv.name)} TV</b><div class="m">${c ? escapeHtml(hostOf(c.url)) : 'Off'}</div>
        <div class="k">${c ? 'Click to use it · E (or Shift+click) to set it up' : 'Click to choose what it shows'}</div>`;
      return;
    }
    const s = S?.live.find((x) => x.sessionId === hover.sessionId);
    if (!s) { targetEl.style.display = 'none'; return; }
    const st = statusOf(s), tr = s.transcript || {};
    const doing = s.status !== 'idle' && tr.pendingTool ? `${tr.pendingTool.name}: ${tr.pendingTool.detail || ''}` : s.status === 'idle' ? `idle for ${F.dur(Date.now() - s.statusSince)}` : 'thinking';
    targetEl.innerHTML = `<b>${escapeHtml(titleOf(s))}</b><div class="m"><span style="color:${st.color}">${st.text}</span> · ${F.usd(s.cost)}${s.statusline?.context ? ` · ${s.statusline.context.used_percentage}% context` : ''}</div>
      <div class="m">${escapeHtml(doing.slice(0, 90))}</div><div class="k">${escapeHtml(s.name)} · click for full details</div>`;
  }
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ----- minimap -----
  function drawMap() {
    const c = mapCtx, W = 440, H = 330, sx = (x) => ((x - ROOM.minX) / 40) * W, sz = (z) => ((z - ROOM.minZ) / 30) * H;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(181,138,95,.35)'; c.fillRect(sx(-19.9), sz(2.6), sx(-2) - sx(-19.9), sz(14.9) - sz(2.6));
    c.fillStyle = 'rgba(86,98,115,.55)'; c.fillRect(sx(6), sz(-15), sx(20) - sx(6), sz(-3.5) - sz(-15));
    c.fillStyle = 'rgba(255,255,255,.22)';
    for (const b of colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(2, sx(b.maxX) - sx(b.minX)), Math.max(2, sz(b.maxZ) - sz(b.minZ)));
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillText('Desks', sx(-12), sz(-0.6)); c.fillText('Breakroom', sx(-12), sz(13.6)); c.fillText('My office', sx(9), sz(-13.4)); c.fillText('Lounge', sx(8), sz(13.6));
    for (const p of people.values()) {
      c.fillStyle = p.color; c.beginPath(); c.arc(sx(p.root.position.x), sz(p.root.position.z), 7, 0, Math.PI * 2); c.fill();
      if (p.session?.status === 'working') { c.strokeStyle = '#22c55e'; c.lineWidth = 3; c.stroke(); }
    }
    const px = sx(camera.position.x), pz = sz(camera.position.z), yaw = camera.rotation.y;
    c.save(); c.translate(px, pz); c.rotate(-yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }

  // ----- post-processing -----
  // Transparent things live on layer 1 so the AO pass and the hole's depth pre-pass ignore them.
  world.traverse((o) => { if (o.isSprite || (o.material && o.material.transparent)) o.layers.set(1); });
  camera.layers.enable(1);
  renderer.shadowMap.autoUpdate = false;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 512, 512);
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 12 });
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (...a) => { camera.layers.disable(1); gtaoRender(...a); camera.layers.enable(1); };
  composer.addPass(gtao);
  // Screen-space light rays: radial blur of the brightest pixels toward the sun's screen position.
  const rays = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, sunPos: { value: new THREE.Vector2() }, strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float strength; varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        vec2 delta = (vUv - sunPos) / 64.0 * 0.95, uv = vUv;
        float decay = 1.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < 64; i++) {
          uv -= delta;
          vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
          acc += min(s * max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - 1.1, 0.0), vec3(3.0)) * decay;
          decay *= 0.966;
        }
        gl_FragColor = vec4(base.rgb + acc * strength / 64.0, base.a);
      }`,
  });
  composer.addPass(rays);
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.38, 0.55, 1.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(vec3(l), c.rgb, 1.12);
        c.rgb *= mix(0.8, 1.0, smoothstep(0.95, 0.35, length(vUv - 0.5)));
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grade);
  let hq = localStorage.officeQuality !== 'low';
  function setQuality(on) {
    hq = on; localStorage.officeQuality = on ? 'high' : 'low';
    gtao.enabled = bloom.enabled = grade.enabled = on;
    shafts.visible = on;
  }
  setQuality(hq);
  // H hides every overlay: HUD panels, minimap, hover cards and the name tags over people. Only the crosshair stays.
  let toastTimer = 0;
  function setOverlays(on, quiet) {
    overlays = on; localStorage.officeOverlays = on ? 'on' : 'off';
    hud.classList.toggle('of-bare', !on);
    for (const p of people.values()) p.label.visible = on;
    if (quiet) return;
    const t = hud.querySelector('.of-toast');
    t.innerHTML = `Overlays ${on ? 'shown' : 'hidden'} · <kbd>H</kbd> to ${on ? 'hide' : 'show'}`;
    t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
  }
  setOverlays(overlays, true);
  const sunScreen = new THREE.Vector3(), camFwd = new THREE.Vector3();
  const holeScene = new THREE.Scene(), holeProxy = new THREE.Mesh(hole.geometry, holeM);
  holeProxy.matrixAutoUpdate = false;
  holeScene.add(holeProxy);
  const depthOnlyM = new THREE.MeshBasicMaterial({ colorWrite: false });
  function renderFrame() {
    camera.getWorldDirection(camFwd);
    sunScreen.copy(sunDir).multiplyScalar(500).add(camera.position).project(camera);
    rays.uniforms.sunPos.value.set(sunScreen.x * 0.5 + 0.5, sunScreen.y * 0.5 + 0.5);
    rays.uniforms.strength.value = raysStrength * sstep(0.15, 0.55, camFwd.dot(sunDir)) * 1.2;
    rays.enabled = hq && rays.uniforms.strength.value > 0.01;
    renderer.shadowMap.needsUpdate = true;
    composer.render();
    // Re-punch the dashboard hole: depth of opaque geometry, then the hole writes alpha 0 where it's visible.
    renderer.autoClear = false;
    renderer.clearDepth();
    camera.layers.disable(1);
    // A Color background force-clears the canvas, so drop it for the depth-only pass.
    const bg = scene.background;
    scene.background = null;
    scene.overrideMaterial = depthOnlyM;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg;
    camera.layers.enable(1);
    holeProxy.matrix.copy(hole.matrixWorld);
    renderer.render(holeScene, camera);
    renderer.autoClear = true;
  }

  // ----- loop -----
  let raf = 0, lastT = performance.now();
  const clock0 = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const t = (now - clock0) / 1000;
    for (const [id, p] of people) {
      p.update(t, dt);
      if (p.dying && p.root.scale.x < 0.03) { world.remove(p.root); people.delete(id); }
    }
    // Ping pong rally when both ends are manned and settled.
    const [a, b] = pp.map((q) => q.occupant);
    const rally = a && b && !a.path.length && !b.path.length && a.spot === pp[0] && b.spot === pp[1];
    ball.visible = !!rally;
    if (rally) {
      const P = 1.05, k = (t % (2 * P)) / P, dir = k < 1, u = dir ? k : k - 1;
      const x0 = -5.6 - 1.45, x1 = -5.6 + 1.45;
      const z = 9.2 + 0.35 * Math.sin(t * 0.9);
      ball.position.set(dir ? lerp(x0, x1, u) : lerp(x1, x0, u), 0.79 + 0.32 * Math.abs(Math.sin(u * Math.PI * 2 * 0.75 + 0.1)), z);
      a.swing = dir ? Math.max(0, 1 - u * 4) : Math.max(0, (u - 0.75) * 4);
      b.swing = dir ? Math.max(0, (u - 0.75) * 4) : Math.max(0, 1 - u * 4);
      a.root.position.z = damp(a.root.position.z, z, 4, dt); b.root.position.z = damp(b.root.position.z, z, 4, dt);
    }
    const simDate = new Date(simNow());
    updateSky(simDate, t);
    updateClock(simDate);
    officeFx(dt);
    if (mode === 'free') movePlayer(dt);
    stepTween(now);
    paintScreens(false);
    if (tvMove) { tvMouse(tvMove, 'mouseMoved'); tvMove = null; }
    updateTVs(now);
    for (const d of desks) if (d.codeAnim) paintCode(d, performance.now(), false);
    updateHover();
    drawMap();
    sky.position.copy(camera.position);
    renderFrame();
    cssRenderer.render(cssScene, camera);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    cssRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    layoutCenterMonitor(w, h);
    composer.setSize(w, h);
  }
  new ResizeObserver(resize).observe(container);

  window.__office = { teleport: (k) => TELEPORTS[k](), openTv: (id) => openTvPanel(tvs.find((t) => t.id === id)), useTv: (id) => useTv(tvs.find((t) => t.id === id)), leaveTv,
    tvPoint: (id, u, v) => { const t = tvs.find((x) => x.id === id), p = t.scr.mesh.localToWorld(new THREE.Vector3((u - 0.5) * t.w, (0.5 - v) * t.h, 0)).project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; },
    tvs: () => tvs.map((t) => ({ id: t.id, live: t.live, frame: !!t.frame, url: t.page?.url, title: t.page?.title, dist: t.dist })), player, people, blinds, door, collide, setSpeed, clockState, setTime: (ms) => Object.assign(clockState, { speed: 0.0001, simBase: ms, realBase: Date.now() }) };

  return {
    // Adopt the overview page onto the monitor, then pull back from it to the chair.
    show(scrollY = 0) {
      active = true;
      tvSocket();
      const main = document.querySelector('body > main');
      if (main) domScreen.appendChild(main);
      resize();
      domScreen.scrollTop = scrollY;
      setCam(fillPose());
      mode = 'intro';
      hud.classList.add('hidden');
      lastT = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      const seat = seatedPose();
      setTimeout(() => tween(fillPose(), seat, 2600, () => {
        Object.assign(player, { x: seat.x, z: seat.z, eye: SEATED_EYE, yaw: seat.yaw, pitch: seat.pitch, seated: true });
        mode = 'free';
        hud.classList.remove('hidden');
      }), REDUCED ? 0 : 350);
    },
    // Fly back into the monitor, then hand the page back. Resolves with the scroll offset to restore.
    hide() {
      return new Promise((resolve) => {
        if (document.pointerLockElement) document.exitPointerLock();
        dash.closeDrawer();
        if (using) { using.dirty = true; using = null; hud.classList.remove('of-using'); }
        hud.classList.add('hidden');
        mode = 'outro';
        const from = camPose(), to = fillPose();
        const dist = Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
        tween(from, to, clamp(dist * 260, 1100, 2800), () => {
          requestAnimationFrame(() => {
            const scroll = domScreen.scrollTop;
            const main = domScreen.querySelector('main');
            if (main) document.body.insertBefore(main, container);
            cancelAnimationFrame(raf);
            tvQuiet();
            active = false;
            mode = 'idle';
            resolve(scroll);
          });
        });
      });
    },
  };
}
