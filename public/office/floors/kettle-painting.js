// The painting on B3 that's a way into the winter village (floors/kettle.js): where it hangs, its frame, and its paint.
// - findKettle: a fixed wall in B3's fixed layout (painting-door.js findWall), in a long room far out to the south, kept
//   well away from the lift, the stone door's home, the fire door, the Plain's painting, the grid's bookcase and the
//   circus painting and the portrait (acro-painting.js, lisa-painting.js: their walls, as they're found).
// - makeKettleFrame: a country frame, carved and painted: a broad flat of dark blue-green, hand-painted flowers and leaves
//   round it, a worn gold bead inside and a walnut lip outside (plain-painting.js's ring for the mouldings).
// - the pane's paint is plain-painting.js paintPane with this canvas's size and a cooler, paler varnish.
// - kettlePassShader: the village's own painted look over its whole view: soft brushwork, lilac shadows, warm lights, the
//   canvas's tooth; `amount` 0 by the frame, so it meets the pane's clean window as you cross.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { findWall } from './painting-door.js';
import { findPainting, ring } from './plain-painting.js';
import { findExit } from './world-edge-backstage.js';
import { findGridDoor } from './grid-door.js';
import { findAcro } from './acro-painting.js';

// The canvas you see (the opening): w x h, landscape, its bottom (the sill) SILL up, its plane PO in front of the wall.
export const CANVAS = { w: 1.3, h: 0.88, SILL: 1.15, PO: 0.03 };

let at = null;
export function findKettle(restr) {
  if (at) return at;
  const s = (d) => [d.spot.i, d.spot.j, 25], home = restr.paths.home;
  const away = [[home.i, home.j, 25], s(findExit(restr)), s(findPainting(restr)), s(findGridDoor(restr)), s(findAcro(restr)), [-3, 39, 25], [23, 16, 25]];   // (the portrait's, lisa-painting.js; the cart's, cart-painting.js)
  return (at = findWall(restr, { dmin: 18, dmax: 44, sight: 9, away, reserved: true, fallback: { i: -12, j: -21, side: 'w', back: [-13, -21] } }));
}

// ----- the frame -----
const tex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
const made = new WeakMap();
function frameMats(R) {
  if (made.has(R)) return made.get(R);
  // the flat: blue-green paint over gesso, rubbed through at the edges, little flowers and leaves painted round it
  const flat = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#2f5257'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 1600; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '90,130,128' : '20,40,44'},${R() * 0.16})`; c.fillRect(R() * w, R() * h, 1 + R() * 4, 1 + R() * 2); }
    for (let k = 0; k < 26; k++) {
      const x = R() * w, y = R() * h, r = 4 + R() * 4, col = ['#d8b44a', '#c9614a', '#e9dfc8', '#c98fb0'][Math.floor(R() * 4)];
      c.fillStyle = 'rgba(70,110,70,.85)';
      for (const a of [R() * 6, R() * 6]) { c.beginPath(); c.ellipse(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6, r * 1.1, r * 0.45, a, 0, 7); c.fill(); }
      c.fillStyle = col;
      for (let p = 0; p < 5; p++) { const a = p * 1.2566 + R() * 0.3; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55, 0, 7); c.fill(); }
      c.fillStyle = '#5a3a1e'; c.beginPath(); c.arc(x, y, r * 0.35, 0, 7); c.fill();
    }
    for (let k = 0; k < 30; k++) { c.fillStyle = `rgba(200,180,140,${0.05 + R() * 0.12})`; c.fillRect(R() * w, R() * h, 2 + R() * 10, 1 + R() * 2); }
  });
  const gold = tex(128, 128, (c, w, h) => {
    c.fillStyle = '#a8843e'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '235,205,130' : '70,48,20'},${R() * 0.2})`; c.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 2); }
  });
  const walnut = tex(128, 128, (c, w, h) => {
    c.fillStyle = '#3d2a1c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(${R() < 0.5 ? '25,16,10' : '96,70,46'},${R() * 0.3})`; c.fillRect(0, y, w, 1 + R() * 2); }
  });
  const linen = tex(128, 128, (c, w, h) => {
    c.fillStyle = '#857a66'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) { c.fillStyle = 'rgba(40,34,24,.22)'; c.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(160,150,128,.18)'; c.fillRect(0, y, w, 1); }
  });
  const m = {
    flat: new THREE.MeshStandardMaterial({ map: flat, roughness: 0.75 }),
    gold: new THREE.MeshStandardMaterial({ map: gold, color: '#f2d690', metalness: 0.3, roughness: 0.45 }),
    walnut: new THREE.MeshStandardMaterial({ map: walnut, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ map: walnut, color: '#c8a888', roughness: 0.9 }),
    linen: new THREE.MeshStandardMaterial({ map: linen, roughness: 1 }),
  };
  made.set(R, m);
  return m;
}
/** The frame: a group, its opening's sill's middle at the origin, the picture's plane at z = PO, facing +z. */
export function makeKettleFrame(R, { back = false } = {}) {
  const { w: W, h: H, PO } = CANVAS, m = frameMats(R), g = new THREE.Group(), cy = H / 2;
  // back to front: the walnut lip off the wall, the broad painted flat, a gold bead, the sight edge in walnut
  g.add(new THREE.Mesh(ring(W + 0.36, H + 0.36, W + 0.28, H + 0.28, cy, 0.003, 0.05, 0.008), m.walnut));
  g.add(new THREE.Mesh(ring(W + 0.29, H + 0.29, W + 0.09, H + 0.09, cy, 0.006, 0.036, 0.004), m.flat));
  g.add(new THREE.Mesh(ring(W + 0.1, H + 0.1, W + 0.03, H + 0.03, cy, 0.01, 0.052, 0.008), m.gold));
  g.add(new THREE.Mesh(ring(W + 0.035, H + 0.035, W, H, cy, 0.004, 0.046, 0.004), m.walnut));
  if (back) {   // seen from behind: the stretcher and the back of the canvas, a little inside the opening and behind its plane
    const bars = [];
    const bar = (w, h, x, y, d = 0.02) => bars.push(new THREE.BoxGeometry(w, h, d).translate(x, y, PO - 0.016));
    bar(W - 0.008, 0.045, 0, 0.027); bar(W - 0.008, 0.045, 0, H - 0.027); bar(0.045, H - 0.106, -W / 2 + 0.027, cy); bar(0.045, H - 0.106, W / 2 - 0.027, cy);
    bar(0.035, H - 0.106, 0, cy, 0.014);
    const st = new THREE.Mesh(mergeGeometries(bars), m.wood);
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.004, H - 0.004).rotateY(Math.PI).translate(0, cy, PO - 0.004), m.linen);
    g.add(st, canvas);
  }
  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  return g;
}
export const VARNISH = [0.98, 0.94, 0.9];

// ----- the village's look -----
const NOISE = `
  float ph(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float pn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ph(i), ph(i + vec2(1, 0)), f.x), mix(ph(i + vec2(0, 1)), ph(i + vec2(1, 1)), f.x), f.y); }
  float pf(vec2 p) { return pn(p) * 0.55 + pn(p * 2.1 + 3.7) * 0.3 + pn(p * 4.3 + 7.1) * 0.15; }`;

/** A ShaderPass's material (amount 0 to 1, res, time). */
export function kettlePassShader() {
  return {
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, amount: { value: 1 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float amount, time; varying vec2 vUv;
      ${NOISE}
      void main() {
        vec4 src = texture2D(tDiffuse, vUv);
        vec2 p = vUv * res, s = vec2(res.x / res.y, 1.0);
        // soft brushwork: short dabs along a flow field fixed to the view
        float a = pf(vUv * s * 6.0) * 9.0, px = amount * 1.1 * max(res.y / 900.0, 0.6);
        vec2 dir = vec2(cos(a), sin(a)) * px / res;
        vec3 c = vec3(0.0);
        for (int i = -2; i <= 2; i++) c += texture2D(tDiffuse, vUv + dir * float(i)).rgb;
        c /= 5.0;
        float l = dot(c, vec3(0.3, 0.55, 0.15));
        // shadows lilac, lights toward warm cream: the dusk of the picture
        vec3 g = mix(c * vec3(0.92, 0.88, 1.06) + vec3(0.025, 0.015, 0.04), c, smoothstep(0.05, 0.45, l));
        g = mix(g, g * vec3(1.06, 1.0, 0.9), smoothstep(0.55, 1.0, l) * 0.6);
        // the canvas's tooth and a little speckle of paint
        float tooth = pn(p * 0.4) * 0.6 + pn(p * 1.1) * 0.4, spk = ph(floor(p * 0.5));
        g *= 1.0 + (tooth - 0.5) * 0.1 + (spk - 0.5) * 0.035;
        // a soft vignette toward a dusky violet
        vec2 q = vUv - 0.5; float vg = smoothstep(0.9, 0.3, length(q * vec2(1.0, 1.2)));
        g = mix(g * vec3(0.62, 0.56, 0.7), g, vg);
        gl_FragColor = vec4(mix(src.rgb, g, amount), src.a);
      }`,
  };
}
