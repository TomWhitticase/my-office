// The painting on B3 that's a way onto the Plain (floors/plain.js): where it hangs, its frame, and its paint.
// - findPainting: a fixed place in B3's fixed layout (restricted.js h3), worked out once like findExit
//   (world-edge-backstage.js): a wall at the end of a long dim room in one of B3's dark patches, 18-28 cells' walk from the
//   lift, well away from the stone door's home and the fire door, with the room behind that wall clear too.
// - makeFrame: an old gilt frame, rings of moulding round the opening (in a frame with the opening's sill's middle at the
//   origin, the picture's plane at z = PO, its face +z); `back`: the canvas's back and stretcher behind the opening, for
//   the frame that hangs in mid-air on the Plain.
// - paintPane: the portal's pane (systems/portal.js) as paint while you're any way off it: strokes pushed along a flow
//   that's fixed to the canvas, the weave, old varnish, a darker edge and fine cracks; up close (`paint` 0) a clean window.
// - makePaintPass: the Plain's own oil-paint look, over its whole view: brushed, grained, the shadows crushed amber, a
//   vignette; `amount` 0 by the frame, so it meets the pane's clean window as you cross.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { findExit } from './world-edge-backstage.js';
import { findWall } from './painting-door.js';

// The canvas you see (the opening): w x h, its bottom (the sill) SILL up, its plane PO in front of the wall.
export const PAINT = { w: 1.05, h: 1.25, SILL: 0.95, PO: 0.03 };

let at = null;
export const findPainting = (restr) => (at ||= findWall(restr, { dmin: 18, dmax: 28, dark: true, sight: 10,
  away: [[restr.paths.home.i, restr.paths.home.j, 9], [findExit(restr).spot.i, findExit(restr).spot.j, 25]], fallback: { i: -6, j: 13, side: 'w', back: [-7, 13] } }));

// ----- the frame -----
const tex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
const made = new WeakMap();   // (one set per frame's R: both of a painting's frames share it, another painting has its own)
function frameMats(R) {
  if (made.has(R)) return made.get(R);
  // tarnished gilt: bright where it's proud, brown-black in the hollows and grime; worn through to the red bole in places
  const gilt = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#9c7a35'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 2400; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '230,196,110' : '60,40,16'},${R() * 0.18})`; c.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 2); }
    for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(120,48,30,${0.15 + R() * 0.25})`; c.beginPath(); c.ellipse(R() * w, R() * h, 2 + R() * 8, 1 + R() * 3, R() * 3, 0, 7); c.fill(); }
    for (let k = 0; k < 14; k++) { c.fillStyle = `rgba(30,20,8,${0.1 + R() * 0.2})`; c.fillRect(0, R() * h, w, 2 + R() * 10); }
  });
  const wood = tex(128, 128, (c, w, h) => {
    c.fillStyle = '#5b4630'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(${R() < 0.5 ? '40,28,16' : '120,96,64'},${R() * 0.25})`; c.fillRect(0, y, w, 1 + R() * 2); }
  });
  const linen = tex(128, 128, (c, w, h) => {
    c.fillStyle = '#7b6446'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) { c.fillStyle = 'rgba(40,30,18,.25)'; c.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(150,126,90,.18)'; c.fillRect(0, y, w, 1); }
    for (let k = 0; k < 9; k++) { c.fillStyle = `rgba(50,36,20,${R() * 0.25})`; c.beginPath(); c.arc(R() * w, R() * h, 6 + R() * 26, 0, 7); c.fill(); }
  });
  const mats = {
    gilt: new THREE.MeshStandardMaterial({ map: gilt, color: '#f0cf80', metalness: 0.35, roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ map: gilt, color: '#6e5228', metalness: 0.25, roughness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.9 }),
    linen: new THREE.MeshStandardMaterial({ map: linen, roughness: 1 }),
  };
  made.set(R, mats);
  return mats;
}
// A rectangular ring w0 x h0 outside, w1 x h1 inside (round its middle at y = c), from z0 to z1, its edges rounded by b.
export function ring(w0, h0, w1, h1, c, z0, z1, b) {
  const s = new THREE.Shape(), o = [w0 / 2 - b, h0 / 2 - b], i = [w1 / 2 + b, h1 / 2 + b];
  s.moveTo(-o[0], -o[1]); s.lineTo(o[0], -o[1]); s.lineTo(o[0], o[1]); s.lineTo(-o[0], o[1]); s.closePath();
  const hole = new THREE.Path(); hole.moveTo(-i[0], -i[1]); hole.lineTo(-i[0], i[1]); hole.lineTo(i[0], i[1]); hole.lineTo(i[0], -i[1]); hole.closePath();
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0 - 2 * b, bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 1 });
  // (uv: the moulding's grain along it, from the shape's x/y; a few metres of texture)
  const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2.2, uv.getY(k) * 2.2);
  return g.translate(0, c, z0 + b);
}
/** The frame: a group, its opening's sill's middle at the origin, the picture's plane at z = PO, facing +z. size: the
 * canvas (PAINT's shape); mats: { gilt, dark, wood, linen } instead of the old gilt. */
export function makeFrame(R, { back = false, size = PAINT, mats = null } = {}) {
  const { w: W, h: H, PO } = size, m = mats || frameMats(R), g = new THREE.Group(), cy = H / 2;
  // back to front: a wide flat moulding off the wall, a fat rounded torus of gilt, a dark hollow, the sight edge
  g.add(new THREE.Mesh(ring(W + 0.27, H + 0.27, W + 0.04, H + 0.04, cy, 0.003, 0.034, 0.004), m.dark));
  g.add(new THREE.Mesh(ring(W + 0.25, H + 0.25, W + 0.15, H + 0.15, cy, 0.03, 0.072, 0.014), m.gilt));
  g.add(new THREE.Mesh(ring(W + 0.155, H + 0.155, W + 0.065, H + 0.065, cy, 0.031, 0.05, 0.006), m.dark));
  g.add(new THREE.Mesh(ring(W + 0.07, H + 0.07, W, H, cy, 0.006, 0.058, 0.008), m.gilt));
  if (back) {   // seen from behind: the stretcher and the back of the canvas, a little inside the opening and behind its plane
    const bars = [];
    const bar = (w, h, x, y, d = 0.02) => bars.push(new THREE.BoxGeometry(w, h, d).translate(x, y, PO - 0.016));
    bar(W - 0.008, 0.05, 0, 0.029); bar(W - 0.008, 0.05, 0, H - 0.029); bar(0.05, H - 0.116, -W / 2 + 0.029, cy); bar(0.05, H - 0.116, W / 2 - 0.029, cy);
    bar(0.04, H - 0.116, 0, cy); bar(W - 0.116, 0.04, 0, cy * 1.02, 0.014);   // (the crossbar halved into the upright, inside it)
    const st = new THREE.Mesh(mergeGeometries(bars), m.wood);
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.004, H - 0.004).rotateY(Math.PI).translate(0, cy, PO - 0.004), m.linen);
    g.add(st, canvas);
  }
  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  return g;
}

// ----- the paint -----
const NOISE = `
  float ph(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float pn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ph(i), ph(i + vec2(1, 0)), f.x), mix(ph(i + vec2(0, 1)), ph(i + vec2(1, 1)), f.x), f.y); }
  float pf(vec2 p) { return pn(p) * 0.55 + pn(p * 2.1 + 3.7) * 0.3 + pn(p * 4.3 + 7.1) * 0.15; }`;

/** The pane of a portal (a flat one) made paint while you're off it: `paint` (0 to 1) how much. size: the canvas;
 * varnish: the old varnish's tint (its shadows sunk the same). */
export function paintPane(p, { size = PAINT, varnish = [1.05, 0.82, 0.52] } = {}) {
  const { w: W, h: H } = size, m = p.mesh.material;
  Object.assign(m.uniforms, { paint: { value: 1 }, size: { value: new THREE.Vector2(W, H) }, varnish: { value: new THREE.Vector3(...varnish) } });
  m.vertexShader = 'varying vec2 vC; void main() { vC = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  m.fragmentShader = `uniform sampler2D tView; uniform vec2 res; uniform float k; uniform float paint; uniform vec2 size; uniform vec3 varnish; varying vec2 vC;
    ${NOISE}
    void main() {
      vec2 uv = vec2(vC.x / size.x + 0.5, vC.y / size.y), sc = gl_FragCoord.xy / res;
      // strokes: each patch of the canvas smeared along its own direction, a few pixels, scaled with how big it is on screen
      float a = pf(uv * vec2(7.0, 6.0)) * 9.0, px = paint * 1.4;
      vec2 dir = vec2(cos(a), sin(a)) * px / res;
      vec3 c = vec3(0.0);
      for (int i = -2; i <= 2; i++) c += texture2D(tView, sc + dir * float(i)).rgb;
      c /= 5.0;
      // old varnish: warmer, darker, the shadows sunk; the canvas weave and fine cracks; its edges darkest
      float l = dot(c, vec3(0.3, 0.55, 0.15));
      vec3 v = mix(c, vec3(l) * varnish, 0.35) * 0.8;
      v = max(v - 0.012, 0.0) * 1.04;
      float weave = sin(uv.x * size.x * 900.0) * sin(uv.y * size.y * 900.0);
      float crack = smoothstep(0.035, 0.0, abs(pn(uv * 26.0) - 0.5)) * smoothstep(0.3, 0.7, pn(uv * 5.0));
      vec2 e = min(uv, 1.0 - uv);
      v *= (1.0 + weave * 0.05) * (1.0 - crack * 0.35) * mix(0.55, 1.0, smoothstep(0.0, 0.22, min(e.x * 1.15, e.y)));
      gl_FragColor = vec4(mix(c, v, paint) * k, 1.0);
    }`;
  m.needsUpdate = true;
  return m.uniforms.paint;
}

/** The Plain's oil-paint look: a ShaderPass's material (amount 0 to 1, res, time). */
export function paintPassShader() {
  return {
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, amount: { value: 1 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float amount, time; varying vec2 vUv;
      ${NOISE}
      void main() {
        vec4 src = texture2D(tDiffuse, vUv);
        vec2 p = vUv * res, s = vec2(res.x / res.y, 1.0);
        // brushwork: a slow flow field over the view, the picture smeared along it a few pixels
        float a = pf(vUv * s * 5.0 + time * 0.01) * 9.0, px = amount * 0.9 * max(res.y / 900.0, 0.6);
        vec2 dir = vec2(cos(a), sin(a)) * px / res;
        vec3 c = vec3(0.0);
        for (int i = -2; i <= 2; i++) c += texture2D(tDiffuse, vUv + dir * float(i)).rgb;
        c /= 5.0;
        float l = dot(c, vec3(0.3, 0.55, 0.15));
        // the shadows crushed and warmed toward burnt umber, the lights toward ochre
        vec3 sh = vec3(0.06, 0.035, 0.015), hi = vec3(1.0, 0.88, 0.62);
        vec3 g = mix(sh, c * vec3(1.03, 0.97, 0.84), smoothstep(0.0, 0.16, l));
        g = mix(g, g * hi * 1.06, smoothstep(0.5, 1.0, l) * 0.5);
        // the grain of the paint: a fixed tooth, and a fine speckle
        float tooth = pn(p * 0.35) * 0.6 + pn(p * 0.9) * 0.4, spk = ph(floor(p * 0.5));
        g *= 1.0 + (tooth - 0.5) * 0.16 + (spk - 0.5) * 0.05;
        // a heavy vignette, browner toward the corners
        vec2 q = vUv - 0.5; float vg = smoothstep(0.85, 0.25, length(q * vec2(1.05, 1.25)));
        g = mix(g * vec3(0.45, 0.32, 0.2), g, vg);
        gl_FragColor = vec4(mix(src.rgb, g, amount), src.a);
      }`,
  };
}
