// The painting on B3 that's a way into the grey meadow (floors/cart.js): where it hangs, its frame, and its paint.
// - findCart: a wall far out in B3's east, a long room in front of it (painting-door.js findWall), well away from the
//   lift and every other way out (the fire door, the Plain's painting, the grid's bookcase, the stone door's home, the
//   acrobats' coast's, the winter village's and the portrait's paintings).
// - frame: plain-painting.js's moulding in old ebonised wood, worn brown at the edges, with a dull gilt sight edge.
// - paint: the pane (systems/portal.js) as an old oil. From across the room it's the scene composed as the picture is
//   (`comp`: the meadow drawn now and then from a fixed camera a few metres in front of the cart into a texture of its
//   own: the girl in front on the left, the cart behind her on the right, its face looking out); come up to it and the
//   paint gives way to the window itself, clean by the time you reach it. plain-painting.js's strokes, weave and cracks,
//   under a pale varnish rather than the Plain's amber one.
// - pass: the meadow's own look over its whole view: soft brushwork, the colour muted toward olive and grey, the
//   shadows a little warm, a fine canvas tooth, a soft vignette; none of it by the frame.

import * as THREE from 'three';
import { findWall } from './painting-door.js';
import { makeFrame, paintPane as oilPane, findPainting } from './plain-painting.js';
import { findExit } from './world-edge-backstage.js';
import { findGridDoor } from './grid-door.js';
import { findAcro } from './acro-painting.js';
import { findKettle } from './kettle-painting.js';
import { findLisa } from './lisa-painting.js';

// The canvas: a little taller than wide, the way the picture is.
export const SIZE = { w: 1.0, h: 1.25, SILL: 0.92, PO: 0.03 };

let at = null;
export function findCart(restr) {
  if (at) return at;
  const sp = (f) => [f.spot.i, f.spot.j, 25], home = restr.paths.home;
  return (at = findWall(restr, {
    dmin: 22, dmax: 60, sight: 8, reserved: true,
    // the fire door, the Plain's painting, the grid's bookcase, the stone door's home, the coast's, the winter village's
    // and the portrait's paintings
    away: [sp(findExit(restr)), sp(findPainting(restr)), sp(findGridDoor(restr)), [home.i, home.j, 25], sp(findAcro(restr)), sp(findKettle(restr)), sp(findLisa(restr)),
      [-1, 0, 25]],   // (and the lift)
    fallback: { i: 23, j: 16, side: 'e', back: [24, 16], d: 50 },
  }));
}

// ----- the frame -----
const tex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
function frameMats(R) {
  const ebony = tex(256, 256, (c, w, h) => {   // black paint over brown wood, rubbed through along the moulding
    c.fillStyle = '#1d1714'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) { c.fillStyle = `rgba(${R() < 0.5 ? '8,6,5' : '70,50,36'},${R() * 0.25})`; c.fillRect(0, y, w, 1); }
    for (let k = 0; k < 60; k++) { c.fillStyle = `rgba(98,70,46,${0.1 + R() * 0.25})`; c.fillRect(R() * w, R() * h, 6 + R() * 40, 1 + R() * 2); }
  });
  const gilt = tex(64, 64, (c, w, h) => { c.fillStyle = '#8c7344'; c.fillRect(0, 0, w, h); for (let k = 0; k < 260; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '200,172,110' : '50,38,20'},${R() * 0.25})`; c.fillRect(R() * w, R() * h, 2, 1); } });
  const wood = tex(128, 128, (c, w, h) => { c.fillStyle = '#7d6648'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(60,44,28,${R() * 0.3})`; c.fillRect(0, y, w, 1); } });
  const linen = tex(128, 128, (c, w, h) => {
    c.fillStyle = '#8a7a60'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) { c.fillStyle = 'rgba(50,40,26,.22)'; c.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(160,140,108,.16)'; c.fillRect(0, y, w, 1); }
    for (let k = 0; k < 7; k++) { c.fillStyle = `rgba(60,46,30,${R() * 0.2})`; c.beginPath(); c.arc(R() * w, R() * h, 8 + R() * 24, 0, 7); c.fill(); }
  });
  return {
    gilt: new THREE.MeshStandardMaterial({ map: ebony, color: '#ffffff', roughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ map: gilt, color: '#d8c08a', metalness: 0.45, roughness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.9 }),
    linen: new THREE.MeshStandardMaterial({ map: linen, roughness: 1 }),
  };
}
let mats = null;
export const frame = (R, o) => makeFrame(R, { ...o, size: SIZE, mats: (mats ||= frameMats(R)) });

// ----- the paint -----
/** The pane as the painting: `comp` the composed picture's texture (B3's side), or null (the way back: paint only). */
export function paintPane(p, comp) {
  if (!comp) return oilPane(p, { size: SIZE, varnish: [1.0, 0.94, 0.8] });
  const { w: W, h: H } = SIZE, m = p.mesh.material;
  Object.assign(m.uniforms, { paint: { value: 1 }, size: { value: new THREE.Vector2(W, H) }, tComp: { value: comp } });
  m.vertexShader = 'varying vec2 vC; void main() { vC = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  m.fragmentShader = `uniform sampler2D tView, tComp; uniform vec2 res; uniform float k, paint; uniform vec2 size; varying vec2 vC;
    ${NOISE}
    void main() {
      vec2 uv = vec2(vC.x / size.x + 0.5, vC.y / size.y), sc = gl_FragCoord.xy / res;
      // strokes: each patch of the canvas smeared along its own direction
      float a = pf(uv * vec2(7.0, 6.0)) * 9.0;
      vec2 dir = vec2(cos(a), sin(a));
      vec3 win = vec3(0.0), cmp = vec3(0.0);
      for (int i = -2; i <= 2; i++) {
        win += texture2D(tView, sc + dir * paint * 1.4 * float(i) / res).rgb;
        cmp += texture2D(tComp, vec2(1.0 - uv.x, uv.y) + dir * 0.0018 * float(i)).rgb;   // (the pane's x runs right to left, seen from the room)
      }
      win /= 5.0; cmp /= 5.0;
      // far off, the composed picture; close, the window
      vec3 c = mix(win, cmp, smoothstep(0.3, 0.9, paint));
      // old oil under a pale varnish: the shadows sunk a little, the weave, fine cracks, the edges darker
      float l = dot(c, vec3(0.3, 0.55, 0.15));
      vec3 v = mix(c, vec3(l) * vec3(1.0, 0.94, 0.8), 0.22) * 0.9;
      v = max(v - 0.008, 0.0) * 1.03;
      float weave = sin(uv.x * size.x * 900.0) * sin(uv.y * size.y * 900.0);
      float crack = smoothstep(0.035, 0.0, abs(pn(uv * 26.0) - 0.5)) * smoothstep(0.3, 0.7, pn(uv * 5.0));
      vec2 e = min(uv, 1.0 - uv);
      v *= (1.0 + weave * 0.045) * (1.0 - crack * 0.3) * mix(0.62, 1.0, smoothstep(0.0, 0.2, min(e.x * 1.15, e.y)));
      gl_FragColor = vec4(mix(c, v, paint) * k, 1.0);
    }`;
  m.needsUpdate = true;
  return m.uniforms.paint;
}

const NOISE = `
  float ph(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float pn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ph(i), ph(i + vec2(1, 0)), f.x), mix(ph(i + vec2(0, 1)), ph(i + vec2(1, 1)), f.x), f.y); }
  float pf(vec2 p) { return pn(p) * 0.55 + pn(p * 2.1 + 3.7) * 0.3 + pn(p * 4.3 + 7.1) * 0.15; }`;

/** The meadow's own look: a ShaderPass's material (amount 0 to 1, res, time). */
export function passShader() {
  return {
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, amount: { value: 1 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float amount, time; varying vec2 vUv;
      ${NOISE}
      void main() {
        vec4 src = texture2D(tDiffuse, vUv);
        vec2 p = vUv * res, s = vec2(res.x / res.y, 1.0);
        // soft brushwork: smeared a pixel or two along a slow flow, fixed to the view
        float a = pf(vUv * s * 5.5) * 9.0, px = amount * 0.9 * max(res.y / 900.0, 0.6);
        vec2 dir = vec2(cos(a), sin(a)) * px / res;
        vec3 c = vec3(0.0);
        for (int i = -2; i <= 2; i++) c += texture2D(tDiffuse, vUv + dir * float(i)).rgb;
        c /= 5.0;
        float l = dot(c, vec3(0.3, 0.55, 0.15));
        // muted: pulled toward its own grey, the greens toward olive; the shadows a little warm, the lights a little cool
        vec3 g = mix(vec3(l), c, 0.78) * vec3(1.02, 1.0, 0.94);
        g = mix(g * vec3(1.06, 0.98, 0.9), g * vec3(0.98, 1.0, 1.03), smoothstep(0.1, 0.6, l));
        g = mix(g, floor(g * 24.0 + 0.5) / 24.0, 0.18);
        float tooth = pn(p * 0.4) * 0.6 + pn(p * 1.0) * 0.4;
        g *= 1.0 + (tooth - 0.5) * 0.08;
        vec2 q = vUv - 0.5; g *= mix(0.74, 1.0, smoothstep(0.85, 0.28, length(q * vec2(1.0, 1.2))));
        gl_FragColor = vec4(mix(src.rgb, g, amount), src.a);
      }`,
  };
}
