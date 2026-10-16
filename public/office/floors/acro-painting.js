// The painting on B3 that's a way onto the acrobats' coast (floors/acro.js): where it hangs, its frame, and its paint.
// - findAcro: a wall far out in B3's west, a long room in front of it (painting-door.js findWall), well away from the
//   lift and every other way out (the fire door, the Plain's painting, the grid's bookcase, the stone door's home, the
//   other paintings).
// - frame: plain-painting.js's moulding in dark stained wood with a thin gold liner: a modern picture's frame.
// - paint: the pane (systems/portal.js) as the picture. From across the room it's the scene composed as a painter would
//   (`comp`: the world drawn from a fixed camera in the ring into a texture of its own, the towers rising on the right
//   and the viaduct going away to the left under the moon), in soft acrylic strokes on a fine canvas; come up to it and
//   the paint gives way to the window itself, live and clean by the time you reach it.
// - pass: the coast's own look over its whole view, soft and luminous: brushed, the shadows blue, the lights a little
//   warm, a fine canvas tooth; none of it by the frame, so it meets the pane's clean window as you cross.

import * as THREE from 'three';
import { findWall } from './painting-door.js';
import { makeFrame } from './plain-painting.js';
import { findExit } from './world-edge-backstage.js';
import { findPainting } from './plain-painting.js';
import { findGridDoor } from './grid-door.js';

export const SIZE = { w: 1.3, h: 1.1, SILL: 0.92, PO: 0.03 };

let at = null;
export function findAcro(restr) {
  if (at) return at;
  const sp = (f) => { const s = f.spot; return [s.i, s.j, 25]; };
  const home = restr.paths.home;
  return (at = findWall(restr, {
    dmin: 18, dmax: 44, sight: 9,
    // the fire door, the Plain's painting, the grid's bookcase, the stone door's home; the winter village's painting and
    // the portrait's (kettle-painting.js, lisa-painting.js: fixed cells, so this doesn't wait on them being built)
    away: [sp(findExit(restr)), sp(findPainting(restr)), sp(findGridDoor(restr)), [home.i, home.j, 25], [-12, -21, 25], [-3, 39, 25]],
    fallback: { i: -32, j: -3, side: 'n', back: [-32, -2], d: 34 },
  }));
}

// ----- the frame -----
const tex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
export function frameMats(R) {
  const wood = tex(256, 256, (c, w, h) => {   // dark stained oak, its grain along the moulding
    c.fillStyle = '#2f2622'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 1) { c.fillStyle = `rgba(${R() < 0.5 ? '18,12,10' : '72,58,48'},${R() * 0.22})`; c.fillRect(0, y, w, 1); }
    for (let k = 0; k < 30; k++) { c.fillStyle = `rgba(90,72,60,${R() * 0.18})`; c.fillRect(R() * w, R() * h, 10 + R() * 60, 1); }
  });
  const gold = tex(64, 64, (c, w, h) => { c.fillStyle = '#b69350'; c.fillRect(0, 0, w, h); for (let k = 0; k < 200; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '240,214,150' : '90,66,30'},${R() * 0.2})`; c.fillRect(R() * w, R() * h, 2, 1); } });
  const stretch = tex(128, 128, (c, w, h) => { c.fillStyle = '#a58a66'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(120,96,64,${R() * 0.3})`; c.fillRect(0, y, w, 1); } });
  const linen = tex(128, 128, (c, w, h) => {
    c.fillStyle = '#cdbf9f'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) { c.fillStyle = 'rgba(120,104,80,.2)'; c.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(240,230,210,.18)'; c.fillRect(0, y, w, 1); }
  });
  return {
    gilt: new THREE.MeshStandardMaterial({ map: wood, color: '#ffffff', roughness: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ map: gold, color: '#e9cf8e', metalness: 0.6, roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ map: stretch, roughness: 0.9 }),
    linen: new THREE.MeshStandardMaterial({ map: linen, roughness: 1 }),
  };
}
let mats = null;
export const frame = (R, o) => makeFrame(R, { ...o, size: SIZE, mats: (mats ||= frameMats(R)) });

// ----- the paint -----
const NOISE = `
  float ph(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float pn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ph(i), ph(i + vec2(1, 0)), f.x), mix(ph(i + vec2(0, 1)), ph(i + vec2(1, 1)), f.x), f.y); }
  float pf(vec2 p) { return pn(p) * 0.55 + pn(p * 2.1 + 3.7) * 0.3 + pn(p * 4.3 + 7.1) * 0.15; }`;

/** The pane as the painting: `comp` the composed picture's texture (B3's side), or null (the way back: paint only). */
export function paintPane(p, comp) {
  const { w: W, h: H } = SIZE, m = p.mesh.material;
  Object.assign(m.uniforms, { paint: { value: 1 }, size: { value: new THREE.Vector2(W, H) }, tComp: { value: comp }, hasComp: { value: comp ? 1 : 0 } });
  m.vertexShader = 'varying vec2 vC; void main() { vC = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  m.fragmentShader = `uniform sampler2D tView, tComp; uniform vec2 res; uniform float k, paint, hasComp; uniform vec2 size; varying vec2 vC;
    ${NOISE}
    void main() {
      vec2 uv = vec2(vC.x / size.x + 0.5, vC.y / size.y), sc = gl_FragCoord.xy / res;
      // strokes: each patch of the canvas brushed along its own direction
      float a = pf(uv * vec2(9.0, 8.0)) * 9.0;
      vec2 dir = vec2(cos(a), sin(a));
      vec3 win = vec3(0.0), cmp = vec3(0.0);
      for (int i = -2; i <= 2; i++) {
        win += texture2D(tView, sc + dir * paint * 1.3 * float(i) / res).rgb;
        if (hasComp > 0.5) cmp += texture2D(tComp, uv + dir * 0.0016 * float(i)).rgb;
      }
      win /= 5.0; cmp /= 5.0;
      // far off, the composed picture; close, the window
      float cm = hasComp * smoothstep(0.3, 0.9, paint);
      vec3 c = mix(win, cmp, cm);
      // acrylic: a touch more colour, flattened a little into its planes; the canvas's fine weave; edges a shade darker
      float l = dot(c, vec3(0.3, 0.55, 0.15));
      vec3 v = mix(vec3(l), c, 1.12);
      v = mix(v, floor(v * 18.0 + 0.5) / 18.0, 0.25);
      float weave = sin(uv.x * size.x * 1100.0) * sin(uv.y * size.y * 1100.0);
      vec2 e = min(uv, 1.0 - uv);
      v *= (1.0 + weave * 0.035) * mix(0.8, 1.0, smoothstep(0.0, 0.08, min(e.x, e.y)));
      gl_FragColor = vec4(mix(c, v, paint) * k, 1.0);
    }`;
  m.needsUpdate = true;
  return m.uniforms.paint;
}

/** The coast's own look: a ShaderPass's material (amount 0 to 1, res, time). */
export function passShader() {
  return {
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, amount: { value: 1 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float amount, time; varying vec2 vUv;
      ${NOISE}
      void main() {
        vec4 src = texture2D(tDiffuse, vUv);
        vec2 p = vUv * res, s = vec2(res.x / res.y, 1.0);
        // soft brushwork: the picture smeared a pixel or two along a slow flow
        float a = pf(vUv * s * 6.0) * 9.0, px = amount * 0.8 * max(res.y / 900.0, 0.6);
        vec2 dir = vec2(cos(a), sin(a)) * px / res;
        vec3 c = vec3(0.0);
        for (int i = -2; i <= 2; i++) c += texture2D(tDiffuse, vUv + dir * float(i)).rgb;
        c /= 5.0;
        float l = dot(c, vec3(0.3, 0.55, 0.15));
        // shadows toward a soft blue, lights a little warm, the whole lifted and luminous
        vec3 g = mix(c * vec3(0.9, 0.97, 1.12) + vec3(0.01, 0.015, 0.03), c * vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.7, l));
        g = mix(g, floor(g * 22.0 + 0.5) / 22.0, 0.2);
        float tooth = pn(p * 0.45) * 0.6 + pn(p * 1.1) * 0.4;
        g *= 1.0 + (tooth - 0.5) * 0.06;
        vec2 q = vUv - 0.5; g *= mix(0.82, 1.0, smoothstep(0.85, 0.3, length(q * vec2(1.0, 1.2))));
        gl_FragColor = vec4(mix(src.rgb, g, amount), src.a);
      }`,
  };
}
