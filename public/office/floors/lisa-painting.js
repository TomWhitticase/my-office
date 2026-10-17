// The portrait on B3 that's a way into her world (floors/lisa.js): where it hangs, its frame and light, the picture
// itself, and the world's painted look.
// - findLisa: a fixed wall in B3's fixed layout (painting-door.js findWall), far out to the north, a long walk from the
//   lift, kept well away from the stone door's home, the fire door, the Plain's painting, the grid's bookcase, the
//   acrobats' painting, the winter village's and the cart's (kettle-painting.js, cart-painting.js: fixed cells, so this
//   doesn't wait on them).
// - makeLisaFrame: a plain museum frame, walnut, a flat with a rounded lip and a narrow inner bead (plain-painting.js
//   makeFrame's mouldings in wood); on B3, a small brass picture light on an arm over its top, lit, and the picture.
// - The picture (the portrait, lisa-portrait.js, painted in a worker): a plane a few mm in front of the doorway's pane,
//   its own shader drawing the irises in their openings, following you a little too far and a beat late, and the mouth
//   widened round MOUTH when `grin` is up; lit from the lamp above. From a few metres in, it melts: the paint runs and
//   comes apart in patches and the world shows through behind it, the window (the doorway's pane, systems/portal.js),
//   until, close up, there's only the window: the loggia, and her chair, empty.
// - lisaPassShader: the world's own painted look over all of it: soft sfumato (the view's lights bled into a haze), the
//   old varnish's yellow-green, the canvas's tooth and fine cracks; and her horror: the colour drained to blood and black,
//   a vignette closing in, the view warping and splitting into its colours as she comes near, a flash when she's on you.
//   `amount` 0 by the frame, as the door wants, so it meets the pane's clean window as you cross.

import * as THREE from 'three';
import { findWall } from './painting-door.js';
import { findPainting, makeFrame } from './plain-painting.js';
import { findExit } from './world-edge-backstage.js';
import { findGridDoor } from './grid-door.js';
import { findAcro } from './acro-painting.js';
import { EYES, IRIS, MOUTH, ASPECT } from './lisa-portrait.js';

// The canvas you see (the opening): the portrait's own shape, its bottom (the sill) SILL up, its plane PO off the wall.
export const CANVAS = { w: 0.82, h: +(0.82 * ASPECT).toFixed(4), SILL: 0.98, PO: 0.03 };

let at = null;
export function findLisa(restr) {
  if (at) return at;
  const sp = (f) => { const s = f.spot; return [s.i, s.j, 25]; }, home = restr.paths.home;
  const away = [[home.i, home.j, 25], sp(findExit(restr)), sp(findPainting(restr)), sp(findGridDoor(restr)), sp(findAcro(restr)), [-12, -21, 25], [23, 16, 25]];   // (-12, -21: the winter village's; 23, 16: the cart's)
  return (at = findWall(restr, { dmin: 18, dmax: 60, sight: 9, away, reserved: true, fallback: { i: -3, j: 39, side: 'n', back: [-3, 40] } }));
}

// ----- the frame -----
const tex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
const made = new WeakMap();
function frameMats(R) {
  if (made.has(R)) return made.get(R);
  // walnut: a warm dark brown, its grain running along the moulding, waxed
  const walnut = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#4a2f1b'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 1) { c.fillStyle = `rgba(${R() < 0.5 ? '24,14,8' : '110,74,44'},${R() * 0.22})`; c.fillRect(0, y + Math.sin(y * 0.3) * 2, w, 1); }
    for (let k = 0; k < 18; k++) { c.strokeStyle = `rgba(20,12,6,${0.15 + R() * 0.2})`; c.lineWidth = 1 + R() * 2; const y = R() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + (R() - 0.5) * 30, w * 0.7, y + (R() - 0.5) * 30, w, y); c.stroke(); }
  });
  const linen = tex(128, 128, (c, w, h) => {
    c.fillStyle = '#857052'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) { c.fillStyle = 'rgba(40,30,18,.22)'; c.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(160,136,100,.16)'; c.fillRect(0, y, w, 1); }
  });
  const mats = {
    gilt: new THREE.MeshStandardMaterial({ map: walnut, color: '#d8b48c', roughness: 0.42, metalness: 0.0 }),
    dark: new THREE.MeshStandardMaterial({ map: walnut, color: '#7a5a3e', roughness: 0.55 }),
    wood: new THREE.MeshStandardMaterial({ map: walnut, color: '#a78a6a', roughness: 0.8 }),
    linen: new THREE.MeshStandardMaterial({ map: linen, roughness: 1 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b08a48', metalness: 0.85, roughness: 0.32 }),
  };
  made.set(R, mats);
  return mats;
}

/** The frame (sill's middle at the origin, the picture's plane z = PO, facing +z). back: seen from behind too (out there).
 *  picture: the portrait's material (on B3). */
export function makeLisaFrame(R, { back = false, picture = null } = {}) {
  const m = frameMats(R), g = makeFrame(R, { back, size: CANVAS, mats: m });
  if (!back) {
    const { w: W, h: H, PO } = CANVAS;
    // the picture light: a short brass tube on an arm, over the frame's top, angled down at the canvas
    const top = H + 0.135, lamp = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.34, 18).rotateZ(Math.PI / 2), m.brass);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.33, 14, 1, true, Math.PI * 1.15, Math.PI * 0.7).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.4), side: THREE.DoubleSide }));
    lip.position.y = -0.0045;
    const caps = [-1, 1].map((s) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 18).rotateZ(Math.PI / 2), m.brass); c.position.x = s * 0.176; return c; });
    tube.add(lip, ...caps); tube.position.set(0, 0, 0.16); tube.rotation.x = -0.5;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 8).rotateX(Math.PI / 2).translate(0, 0.02, 0.08), m.brass);
    arm.rotation.x = -0.25;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.012).translate(0, 0, 0.006), m.brass);
    lamp.add(tube, arm, plate); lamp.position.set(0, top, 0.004);
    g.add(lamp);
    // its light: a warm pool on the wall over the frame and on the frame's top (additive, no light of its own: a light
    // on B3 would cost every material there); and the picture
    const glowT = tex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,214,150,.5)'); gr.addColorStop(1, 'rgba(255,214,150,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.7, 0.55), new THREE.MeshBasicMaterial({ map: glowT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    glow.position.set(0, H + 0.12, 0.006); glow.renderOrder = 3;
    g.add(glow);
    if (picture) {
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(W, H).translate(0, H / 2, PO + 0.007), picture);
      pic.renderOrder = 2; pic.name = 'lisa-picture';
      g.add(pic);
    }
  }
  return g;
}

// ----- the picture -----
const NOISE = `
  float ph(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float pn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ph(i), ph(i + vec2(1, 0)), f.x), mix(ph(i + vec2(0, 1)), ph(i + vec2(1, 1)), f.x), f.y); }
  float pf(vec2 p) { return pn(p) * 0.55 + pn(p * 2.1 + 3.7) * 0.3 + pn(p * 4.3 + 7.1) * 0.15; }`;

/** The picture's material: the portrait, the eyes and the smile, the melt. Its uniforms: tPaint, ready, melt (0 the
 *  painting, 1 gone: the window behind), iris (where the irises look, in u), grin (0 to 1), lum, time. */
export function pictureMaterial() {
  const eyes = EYES.map((e) => `vec4(${e.u.toFixed(5)}, ${e.v.toFixed(5)}, ${(e.w / 2).toFixed(5)}, ${(e.h / 2).toFixed(5)})`).join(', ');
  return new THREE.ShaderMaterial({
    uniforms: { tPaint: { value: null }, ready: { value: 0 }, melt: { value: 0 }, iris: { value: new THREE.Vector2(0, 0) }, grin: { value: 0 }, lum: { value: 0.62 }, time: { value: 0 } },
    transparent: true, depthWrite: true,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tPaint; uniform float ready, melt, grin, lum, time; uniform vec2 iris; varying vec2 vUv;
      ${NOISE}
      const vec4 E[2] = vec4[2](${eyes});
      void main() {
        vec2 p = vec2(vUv.x, 1.0 - vUv.y);   // (the canvas's own: u across, v down)
        // the melt: patches coming away first where the paint's thinnest, running down as they go
        float n = pf(p * vec2(5.0, 7.0)) * 0.7 + pn(p * vec2(26.0, 30.0)) * 0.3;
        float m = melt * 1.25 - 0.12, run = smoothstep(m - 0.25, m, n) * (1.0 - smoothstep(m, m + 0.04, n));
        p.y -= melt * 0.05 * pn(vec2(p.x * 40.0, 3.0)) * smoothstep(m - 0.3, m, n);
        float a = smoothstep(m - 0.03, m + 0.03, n);
        if (a <= 0.003) discard;
        // the smile: the mouth pulled wider and up at its corners
        vec2 q = (p - vec2(${MOUTH.u.toFixed(4)}, ${MOUTH.v.toFixed(4)})) / vec2(${(MOUTH.w * 1.5).toFixed(4)}, ${(MOUTH.h * 4).toFixed(4)});
        float f = exp(-dot(q, q) * 1.6) * grin;
        p.x -= (p.x - ${MOUTH.u.toFixed(4)}) * 0.32 * f;
        p.y += 0.0045 * f * q.x * q.x;
        vec3 c = texture2D(tPaint, p).rgb;
        // the irises, in their openings (behind the lids: the upper part of each shaded)
        for (int k = 0; k < 2; k++) {
          vec4 e = E[k]; vec2 d = (p - e.xy) / e.zw; d.y -= 0.3 * d.x * d.x;
          float open = smoothstep(1.02, 0.82, length(d));
          if (open <= 0.0) continue;
          vec2 ic = e.xy + vec2(${IRIS.look[0].toFixed(4)}, ${IRIS.look[1].toFixed(4)}) + iris;
          float r = length((p - ic) * vec2(1.0, ${ASPECT.toFixed(4)})) / ${IRIS.r.toFixed(4)};
          vec3 ir = mix(vec3(0.16, 0.09, 0.04), vec3(0.3, 0.19, 0.09), smoothstep(0.35, 0.95, r)) * (1.0 - 0.6 * smoothstep(0.0, 0.35, -d.y + 0.2));
          ir = mix(vec3(0.05, 0.03, 0.015), ir, smoothstep(0.32, 0.48, r));
          c = mix(c, ir, open * smoothstep(1.08, 0.9, r) * 0.95);
        }
        // the lamp's light from above: brightest along the top, falling off down the canvas and to the sides
        float lamp = 0.62 + 0.62 * exp(-p.y * 2.6) * (1.0 - 0.35 * abs(p.x - 0.5) * 2.0);
        c *= lum * lamp;
        // the wet edge of a patch as it comes away, dark
        c *= 1.0 - run * 0.5;
        c = mix(vec3(0.06, 0.045, 0.025) * lum, c, ready);
        gl_FragColor = vec4(c, a);
      }`,
  });
}

// ----- the world's look -----
/** The world's painted look: a ShaderPass's material (amount 0 to 1, res, time; dread, near (her, 0 to 1), flash). */
export function lisaPassShader() {
  return {
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, amount: { value: 1 }, time: { value: 0 }, dread: { value: 0 }, near: { value: 0 }, flash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float amount, time, dread, near, flash; varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 uv = vUv, px = 1.0 / res, cq = uv - 0.5;
        // as she comes near: the view bulging and swimming, splitting into its colours toward the edges
        float w = near * amount;
        uv += cq * (dot(cq, cq) * 0.5 * w) + vec2(pn(uv * 3.0 + time * 0.7), pn(uv * 3.0 - time * 0.6) - 0.5) * 0.006 * w;
        float ca = (0.002 + 0.012 * w) * length(cq) * amount;
        vec3 src = vec3(texture2D(tDiffuse, uv + cq * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - cq * ca).b);
        // sfumato: the view a little soft, its lights bled out into a haze
        vec3 soft = vec3(0.0);
        for (int i = 0; i < 6; i++) { float a = float(i) * 1.0472 + 0.4; soft += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * px * 3.0).rgb; }
        soft /= 6.0;
        vec3 c = mix(src, soft, 0.45);
        c = mix(c, max(c, soft * 1.08), 0.35);
        // the varnish: warmer, yellow-green, the darks sunk a little
        float l = dot(c, vec3(0.3, 0.55, 0.15));
        vec3 g = mix(c, vec3(l) * vec3(1.06, 1.0, 0.72), 0.22) * vec3(1.02, 1.0, 0.9);
        g = mix(g * vec3(0.8, 0.84, 0.7), g, smoothstep(0.0, 0.25, l));
        // the canvas's tooth and fine cracks (fixed to the view: the world's a painting)
        vec2 p = vUv * res;
        float tooth = pn(p * 0.45) * 0.5 + pn(p * 1.1) * 0.5;
        float crack = smoothstep(0.025, 0.0, abs(pn(vUv * vec2(res.x / res.y, 1.0) * 110.0) - 0.5)) * smoothstep(0.4, 0.7, pn(vUv * 9.0));
        g *= (1.0 + (tooth - 0.5) * 0.08) * (1.0 - crack * 0.12);
        // dread: drained toward blood and black
        float lg = dot(g, vec3(0.3, 0.55, 0.15));
        g = mix(g, vec3(lg * 1.25, lg * 0.32, lg * 0.24), dread * 0.55);
        // the vignette: soft always, closing in as she comes
        float vg = smoothstep(0.95 - 0.35 * w - 0.15 * dread, 0.25 - 0.1 * w, length(cq * vec2(1.1, 1.3)));
        g *= mix(0.55 - 0.45 * w, 1.0, vg);
        g = mix(g, vec3(1.0, 0.9, 0.85), flash * amount);
        gl_FragColor = vec4(mix(texture2D(tDiffuse, vUv).rgb, g, amount), 1.0);
      }`,
  };
}

