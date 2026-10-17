// The grid's world (floors/grid.js): mid-90s raytraced CGI. A floor of glowing pure-green lines on near-black, a cell
// 0.6 m across and the lines 4% of it, running off to a dark green haze at the horizon; over it a very dark navy sky with
// faint smoky wisps and pinprick stars (pure black the moment you arrive, the sky coming up over a few seconds). One hard
// key light from the left, crisp shadows on the floor, a green glow up from the grid, and everything glossy (Phong:
// tight white highlights). On the floor, too-perfect primitives in plastic colours: a bronze sphere, a dark red teapot,
// a crumpled-foil cone, little red cones, lavender pyramids, cubes yellow, orange, teal marble and stone, cylinders teal,
// grey and orange, a purple block with P=NP on it; floating, a mauve cube and an earth-like planet turning slowly. A
// stone temple, a raised fish pond with goldfish, a brass signpost with clear plaques (← Z, X →, Y). Maths and code hang
// in the air, pale and a little see-through: e^πi = -1, 1 + 1 = 2, 1782^12 + 1841^12 = 1922^12, ρ0 > 3H0²/8πG, 107, 734,
// and a line of hex. The floor's shader also draws the black hole's funnel (grid-hole.js): the grid dimpling down round
// a point, its lines swirling into a throat that goes black.
// Its own space: the doorway back to B3 at the origin, its front facing -z; the world lies toward -z.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import { makeCanvas, rng } from '../util.js';

export const CELL = 0.6, HW = 0.02;   // a cell, metres; a line's half-width, in cells (4% of the cell)
const TEXT_FONT = '"Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif';

/** Built a piece at a time (floors/grid.js steps through it, a step a frame, or all at once): yields between pieces, and
 * returns the world.
 * @param {any} ctx */
export function* buildWorld(ctx) {
  const R = rng(1995);
  const S = new THREE.Scene(), root = new THREE.Group();
  const haze = new THREE.Color('#03130e');
  S.background = new THREE.Color('#000000'); S.fog = new THREE.Fog(haze, 16, 80);
  S.environment = ctx.scene.environment; S.environmentIntensity = 0.1;
  S.add(root);
  // the key light: hard, from the left and a little in front, its shadows following you; the grid's green from below
  const key = new THREE.DirectionalLight('#fff4e6', 2.4);
  key.position.set(-14, 22, 9); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
  S.add(key, key.target);
  const hemi = new THREE.HemisphereLight('#1d2d46', '#0b4a16', 0.6);
  S.add(hemi);
  // (No ambient occlusion and no bloom: raytraced, hard shadows only, the lines' glow their own; and they're what cost most here.)
  const look = { exposure: 1.0, hemi: 0.6, sky: new THREE.Color('#1d2d46'), ground: new THREE.Color('#0b4a16'), env: 0.1, bloom: 0, grade: 0.9,
    lights: [[key, 2.4]], aoSkip1: true, ao: false };

  // ----- the sky: a dome that goes with you -----
  const U = { wisp: { value: 0 }, t: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; uniform float wisp, t;
      float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1, 0, 0)), f.x), mix(h(i + vec3(0, 1, 0)), h(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(h(i + vec3(0, 0, 1)), h(i + vec3(1, 0, 1)), f.x), mix(h(i + vec3(0, 1, 1)), h(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vD); float y = d.y;
        vec3 top = vec3(0.0, 0.012, 0.02), hor = vec3(0.008, 0.035, 0.03);
        vec3 c = mix(hor, top, smoothstep(0.0, 0.4, y));
        float n = fbm(vec3(d.x * 2.6, d.y * 8.0, d.z * 2.6) + vec3(t * 0.004, 0.0, 0.0));   // smoky wisps, drawn out sideways
        c += vec3(0.03, 0.045, 0.06) * smoothstep(0.5, 0.85, n) * smoothstep(-0.02, 0.12, y) * (1.0 - smoothstep(0.45, 0.8, y));
        vec3 sc = floor(d * 260.0); float s = h(sc);
        c += vec3(0.7, 0.75, 0.8) * step(0.9993, s) * smoothstep(0.03, 0.12, y) * (0.6 + 0.4 * sin(t * (1.0 + s * 3.0) + s * 40.0));
        if (y < 0.0) c = hor * 0.7;
        gl_FragColor = vec4(c * wisp, 1.0);
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10; S.add(sky);

  // ----- the floor: green lines on near-black; with the hole (grid-hole.js) a funnel and a swirl -----
  // hC: the hole's middle; hP: its depth, throat, reach and swirl; hQ: the broad dish round it (its depth), the ripples
  // running in to it (height, phase, wavenumber); hOn: whether there's one. The floor stays flat round the doorway (at the
  // origin), so going through it nothing jumps (grid-hole.js has the same shape, for walking on). The plain floor is two
  // triangles under you (moved a whole 6 m at a time); the funnel a fine disc round the hole, the floor cut away under it.
  const HU = { hC: { value: new THREE.Vector2() }, hP: { value: new THREE.Vector4(0, 1, 1, 0) }, hQ: { value: new THREE.Vector4() }, hOn: { value: 0 } };
  const floorMat = (disc) => {
    const m = new THREE.MeshStandardMaterial({ color: '#181818', roughness: 0.85, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, HU);
      const head = `uniform vec2 hC; uniform vec4 hP, hQ; uniform float hOn; varying vec2 vG; varying float vDepth;
        float holeG(float r) { return hP.y * hP.y / (r * r + hP.y * hP.y); }
        float holeF(float r) { float g0 = holeG(hP.z); return r >= hP.z ? 0.0 : -hP.x * (holeG(r) - g0) / (1.0 - g0); }   // the funnel
        float holeH(vec2 w) {   // all of it: the funnel, the dish, the ripples
          float r = length(w - hC); if (r >= hP.z) return 0.0;
          float u = r / hP.z, y = holeF(r) - hQ.x * (1.0 - u) * (1.0 - u) + hQ.y * sin(hQ.w * r + hQ.z) * 4.0 * u * (1.0 - u);
          return y * smoothstep(4.0, 10.0, length(w));
        }`;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${head}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vec3 gp = position; ${disc ? 'gp.xz *= hP.z;' : ''}
          vec4 gw0 = modelMatrix * vec4(gp, 1.0); vG = gw0.xz; vDepth = 0.0;
          float hy = 0.0;
          ${disc ? `vec2 w = gw0.xz; hy = holeH(w); vDepth = holeF(length(w - hC)) * smoothstep(4.0, 10.0, length(w));
          vec2 e = vec2(0.04, 0.0);
          objectNormal = normalize(vec3(-(holeH(w + e) - holeH(w - e)) / 0.08, 1.0, -(holeH(w + e.yx) - holeH(w - e.yx)) / 0.08));` : ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${disc ? 'transformed.xz *= hP.z; transformed.y += hy;' : ''}`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${head}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec2 hp = vG - hC; float hr = length(hp);
            ${disc ? '' : 'if (hOn > 0.5 && hr < hP.z) discard;'}
            vec2 q = vG;
            float pulse = 0.0;
            if (hOn > 0.5) {   // the lines wound round the throat, more the nearer it, and far out; bright rings running in
              float u = min(hr / hP.z, 1.0);
              float th = hP.w * (1.4 / (hr + 0.35) + 0.7 * (1.0 - u) * (1.0 - u)) * smoothstep(hP.z, hP.z * 0.15, hr), cs = cos(th), sn = sin(th);
              q = hC + vec2(cs * hp.x - sn * hp.y, sn * hp.x + cs * hp.y);
              pulse = smoothstep(0.6, 1.0, sin(hQ.w * hr + hQ.z)) * 4.0 * u * (1.0 - u) * clamp(hQ.y * 3.0, 0.0, 1.0);
            }
            vec2 g = q / ${CELL.toFixed(2)}, fw = max(fwidth(g), vec2(1e-4)), d = abs(fract(g + 0.5) - 0.5);
            vec2 core = 1.0 - smoothstep(vec2(${HW.toFixed(3)}) - fw, vec2(${HW.toFixed(3)}) + fw, d);
            vec2 gl = exp(-d / 0.02);
            float line = max(core.x, core.y) + 0.12 * max(gl.x, gl.y);
            line = mix(line, ${(2.5 * HW).toFixed(3)} + 0.02, smoothstep(0.3, 0.9, max(fw.x, fw.y)));   // far off: the haze the lines make
            float dk = exp(vDepth * 0.42);   // down the throat, to black
            // painted on and lit, so things' shadows fall across the lines too; a little glow of their own besides
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0, 0.5, 0.0), clamp(line, 0.0, 1.0)) * dk;
            totalEmissiveRadiance += vec3(0.0, 0.2, 0.0) * line * dk * (1.0 + 2.5 * pulse);
          }`);
    };
    m.customProgramCacheKey = () => (disc ? 'grid-disc' : 'grid-floor');
    if (disc) m.defines = { DISC: 1 };
    return m;
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), floorMat(false));
  floor.receiveShadow = true; root.add(floor);
  // the funnel: rings closer together toward the middle, a unit disc (scaled to the hole's reach in the shader)
  const disc = (() => {
    const NR = 112, NS = 256, pos = [], idx = [];
    for (let k = 0; k <= NR; k++) {
      const r = Math.pow(k / NR, 1.8);
      for (let s = 0; s < NS; s++) { const a = s / NS * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
    }
    for (let k = 0; k < NR; k++) for (let s = 0; s < NS; s++) {
      const a = k * NS + s, b = k * NS + (s + 1) % NS, c = a + NS, d = b + NS;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)).setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, floorMat(true));
    m.frustumCulled = false; m.receiveShadow = true; m.visible = false; root.add(m);
    return m;
  })();

  yield;
  // ----- materials: glossy plastic, foil, marble, stone -----
  const ph = (color, shininess = 90, specular = '#ffffff', o = {}) => new THREE.MeshPhongMaterial({ color, shininess, specular, ...o });
  const tex = (w, h, draw) => { const cv = makeCanvas(w, h); draw(cv.ctx, w, h); cv.tex.colorSpace = THREE.SRGBColorSpace; cv.tex.anisotropy = 4; cv.tex.needsUpdate = true; return cv.tex; };
  const marble = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#7fb3b0'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2400; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '230,245,240' : '30,70,72'},${R() * 0.12})`; c.fillRect(R() * w, R() * h, 2 + R() * 6, 2 + R() * 6); }
    c.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {   // veins
      c.strokeStyle = `rgba(20,50,52,${0.25 + R() * 0.3})`; c.beginPath(); let x = R() * w, y = 0; c.moveTo(x, y);
      while (y < h) { x += (R() - 0.5) * 30; y += 8 + R() * 14; c.lineTo(x, y); } c.stroke();
    }
  });
  const stone = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#9d988a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '235,230,215' : '60,55,48'},${R() * 0.14})`; c.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); }
    for (let i = 0; i < 14; i++) { c.strokeStyle = `rgba(55,50,44,${0.2 + R() * 0.3})`; c.lineWidth = 1; c.beginPath(); let x = R() * w, y = R() * h; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 40; y += (R() - 0.3) * 30; c.lineTo(x, y); } c.stroke(); }
  });
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  yield;
  const earth = tex(512, 256, (c, w, h) => {   // an earth-like planet: blue seas, green and brown land, ice at the poles, cloud
    c.fillStyle = '#1d4c78'; c.fillRect(0, 0, w, h);
    const blob = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(0.6, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; for (const dx of [-w, 0, w]) c.fillRect(x + dx - r, y - r, r * 2, r * 2); };
    for (let k = 0; k < 6; k++) {   // continents: clusters of blobs
      const cx = R() * w, cy = 60 + R() * (h - 120), n = 14 + R() * 14;
      for (let i = 0; i < n; i++) blob(cx + (R() - 0.5) * 110, cy + (R() - 0.5) * 70, 8 + R() * 22, R() < 0.6 ? `rgba(${60 + R() * 30},${105 + R() * 30},${45 + R() * 20},.95)` : `rgba(${140 + R() * 30},${115 + R() * 20},${70 + R() * 20},.9)`);
    }
    const ice = c.createLinearGradient(0, 0, 0, h); ice.addColorStop(0, 'rgba(235,240,245,.95)'); ice.addColorStop(0.08, 'rgba(235,240,245,0)'); ice.addColorStop(0.92, 'rgba(235,240,245,0)'); ice.addColorStop(1, 'rgba(235,240,245,.95)');
    c.fillStyle = ice; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const y = R() * h; c.fillStyle = `rgba(240,244,248,${0.12 + R() * 0.2})`; c.beginPath(); c.ellipse(R() * w, y, 20 + R() * 50, 3 + R() * 6, (R() - 0.5) * 0.3, 0, Math.PI * 2); c.fill(); }
  });

  const things = [];   // [{ o, half: [hx, hz] (a collider) | null, float, spin, bob, home }] — what the hole can take
  const statics = [];  // colliders that don't move (the temple, the pond, the signpost), till the hole takes them
  const hits = [];
  // Put a mesh down: on the floor (y its rest height) or floating; keep it as a thing the hole can take.
  function put(o, x, y, z, { ry = 0, half = null, float = false, spin = 0, bob = 0, info = null, cast = true } = {}) {
    o.position.set(x, y, z); o.rotation.y = ry;
    o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; } });
    root.add(o);
    const t = { o, half, float, spin, bob, ph: R() * 6.283, home: { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() } };
    things.push(t);
    if (info) { o.traverse((m) => { if (m.isMesh) Object.assign(m.userData, { action: 'gridthing', reach: 4, info }); }); hits.push(o); }
    return t;
  }
  // The temple, the pond and the signpost: fixed, until the hole takes them too (heavy: slower, and last). Their box,
  // with the thing it belongs to (grid.js leaves it out once that's moved).
  function big(o, box) {
    const t = { o, half: null, float: false, spin: 0, bob: 0, ph: 0, heavy: true, home: { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() } };
    things.push(t);
    return Object.assign(box, { thing: t });
  }
  const mesh = (g, m) => new THREE.Mesh(g, m);
  const cube = (s, m) => mesh(new THREE.BoxGeometry(s, s, s), m);
  const ball = (r, m) => mesh(new THREE.SphereGeometry(r, 40, 24), m);
  const cyl = (r, h, m) => mesh(new THREE.CylinderGeometry(r, r, h, 40), m);
  const cone = (r, h, m, seg = 40) => mesh(new THREE.ConeGeometry(r, h, seg), m);

  yield;
  // ----- the near ground: what you see first -----
  put(ball(0.32, ph('#4f2c0c', 70, '#f0c080')), -2.2, 0.32, -5.2, { half: [0.3, 0.3] });                 // bronze
  put(cube(0.6, ph('#b29600', 35, '#666')), -1.0, 0.3, -7.6, { ry: 0.3, half: [0.4, 0.4] });               // yellow
  put(cyl(0.3, 0.8, ph('#465c58', 40, '#888')), 2.1, 0.4, -6.2, { half: [0.3, 0.3] });                    // grey barrel
  put(cone(0.12, 0.3, ph('#8a1a14', 90)), 0.4, 0.15, -4.2);                                                // little red cone
  put(ball(0.22, ph('#8c6aa0', 90)), 1.0, 0.22, -9.6, { half: [0.2, 0.2] });                               // purple
  put(cyl(0.25, 0.7, ph('#946318', 50, '#aaa')), -5.6, 0.35, -6.2, { half: [0.25, 0.25] });               // orange
  put(cube(0.65, ph('#a4601a', 25, '#444')), 6.0, 0.325, -8.2, { ry: -0.4, half: [0.45, 0.45] });         // orange
  {   // the purple block with P=NP on its face
    const face = tex(256, 256, (c, w, h) => {
      c.fillStyle = '#3a3346'; c.fillRect(0, 0, w, h);
      c.font = `500 66px ${TEXT_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(15,12,20,.6)'; c.fillText('P=NP', w / 2 + 3, h / 2 + 3); c.fillStyle = '#a9a0bf'; c.fillText('P=NP', w / 2, h / 2);
    });
    const side = ph('#3a3346', 40, '#555');
    put(mesh(new THREE.BoxGeometry(1.0, 1.0, 0.8), [side, side, side, side, ph('#ffffff', 40, '#555', { map: face }), side]), -4.2, 0.5, -10.2, { ry: 0.15, half: [0.6, 0.55] });
  }
  put(cube(0.8, ph('#ffffff', 60, '#bbb', { map: marble })), -3.0, 0.4, -14.2, { ry: 0.5, half: [0.55, 0.55] });   // teal marble
  put(cone(0.35, 0.8, ph('#82508c', 80)), 3.6, 0.4, -16.2, { half: [0.3, 0.3] });                         // pink-purple
  put(cyl(0.35, 0.9, ph('#2a7c86', 60)), 4.2, 0.45, -20.2, { half: [0.35, 0.35] });                       // teal
  put(cyl(0.3, 1.0, ph('#6aa2b2', 60)), -7.2, 0.5, -18.2, { half: [0.3, 0.3] });                          // pale blue
  put(cone(0.3, 0.7, ph('#c4c4c8', 90), 4), 8.2, 0.35, -18.4, { ry: 0.4 });                                 // white pyramid
  put(cone(0.5, 0.9, ph('#86789e', 70), 4), 13.6, 0.45, -20.5, { ry: 0.2, half: [0.45, 0.45] });          // lavender pyramid
  put(cone(0.4, 0.7, ph('#86789e', 70), 4), -3.4, 0.35, -26.0, { ry: 0.7, half: [0.35, 0.35] });
  for (const [x, z] of [[-8.4, -12.2], [10.4, -35.2], [2.6, -33.2], [-11.5, -30.5]]) put(cone(0.12, 0.3, ph('#8a1a14', 90)), x, 0.15, z);
  put(cube(0.7, ph('#55635a', 20, '#333', { map: stone })), -9.8, 0.35, -8.0, { ry: 0.2, half: [0.5, 0.5] });   // grey stone
  // the corner of the world in the reference's first look round: a dark block, the teapot, the foil cone, a small cone
  put(mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), ph('#38323f', 30, '#444')), -6.6, 0.6, -21.4, { half: [0.6, 0.6] });
  {
    const tp = mesh(new TeapotGeometry(0.22, 10), ph('#5a0c0c', 110));
    put(tp, -3.7, 0.2, -22.2, { ry: 0.6, half: [0.4, 0.3], info: '<b>A teapot</b><div class="k">The first thing anyone ever drew in here, they say.</div>' });
    const fg = new THREE.ConeGeometry(0.55, 1.4, 56, 14), P = fg.attributes.position, v = new THREE.Vector3();   // foil: crumpled in and out
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const rr = Math.hypot(v.x, v.z);
      if (rr > 0.01 && v.y > -0.69) { const k = 1 + (R() - 0.5) * 0.08 * (rr / 0.55 + 0.3); P.setXYZ(i, v.x * k, v.y + (R() - 0.5) * 0.015, v.z * k); }
    }
    fg.computeVertexNormals();
    put(mesh(fg, ph('#6d7884', 140, '#ffffff', { flatShading: true })), 1.0, 0.7, -22.4, { half: [0.5, 0.5] });
    put(cone(0.18, 0.4, ph('#7d8792', 120), 40), 3.6, 0.2, -27.4);
  }
  // floating: a mauve cube, cubes high up, the planet
  put(cube(0.9, ph('#7a6888', 50)), 1.6, 3.4, -18.4, { float: true, spin: 0.12, bob: 0.15 });
  put(cube(0.6, ph('#2d6f66', 40)), -5.5, 4.6, -24.0, { float: true, spin: -0.09, bob: 0.2 });
  put(cube(0.5, ph('#8e8a2a', 40)), 9.0, 3.8, -11.0, { float: true, spin: 0.15, bob: 0.12 });
  put(ball(0.18, ph('#c8a0d8', 90)), -1.8, 2.6, -12.5, { float: true, bob: 0.25 });
  put(ball(1.1, ph('#ffffff', 25, '#556', { map: earth })), 5.6, 2.2, -12.4, { float: true, spin: 0.06, bob: 0.1 });

  yield;
  // ----- the signpost: a brass pole, clear plaques with orange letters -----
  {
    const g = new THREE.Group(), brass = ph('#a07a22', 80, '#fff0c0');
    const pole = mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 20).translate(0, 1.6 + 0.12, 0), brass);
    const foot = mesh(new THREE.ConeGeometry(0.22, 0.12, 24).translate(0, 0.06, 0), brass);
    g.add(pole, foot);
    const clear = new THREE.MeshPhongMaterial({ color: '#dfe8ec', transparent: true, opacity: 0.32, shininess: 140, specular: '#ffffff', depthWrite: false });
    const sign = (txt, w, h, x, y, ry, vertical = false) => {
      const p = new THREE.Group(); p.position.set(x, y, 0.07); p.rotation.y = ry; g.add(p);
      p.add(mesh(new THREE.BoxGeometry(w, h, 0.025), clear));
      const t = tex(256, Math.round(256 * h / w), (c, cw, ch) => {
        c.font = `700 ${Math.round(ch * (vertical ? 0.24 : 0.78))}px ${TEXT_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 6; c.strokeStyle = 'rgba(70,30,0,.8)'; c.strokeText(txt, cw / 2, ch / 2); c.fillStyle = '#ee9420'; c.fillText(txt, cw / 2, ch / 2);
      });
      for (const s of [-1, 1]) {
        const l = mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.92), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.FrontSide }));
        l.position.z = s * 0.0165; if (s < 0) l.rotation.y = Math.PI; p.add(l);
      }
    };
    sign('←  Z', 0.8, 0.24, -0.46, 1.95, 0.12);
    sign('X  →', 0.8, 0.24, 0.46, 1.8, -0.12);
    sign('Y', 0.2, 0.62, 0, 2.75, 0, true);
    g.position.set(-1.6, 0, -30.0); g.rotation.y = 0.35;
    g.traverse((m) => { if (m.isMesh) { m.castShadow = m.material !== clear && !m.material.transparent; m.receiveShadow = true; Object.assign(m.userData, { action: 'gridthing', reach: 4, info: '<b>A signpost</b><div class="k">X one way, Z the other, Y straight up. Pick one.</div>' }); } });
    root.add(g); hits.push(g);
    statics.push(big(g, { minX: -1.8, maxX: -1.4, minZ: -30.2, maxZ: -29.8 }));
  }

  // ----- the temple: steps, six columns, the cella, entablature and pediment, in weathered stone -----
  {
    const parts = [], b = (w, h, d, x, y, z) => parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    b(9.6, 0.25, 7.0, 0, 0.125, 0); b(9.2, 0.25, 6.6, 0, 0.375, 0); b(8.8, 0.25, 6.2, 0, 0.625, 0);
    for (const x of [-3.6, -2.16, -0.72, 0.72, 2.16, 3.6]) {
      b(0.7, 0.15, 0.7, x, 0.825, 2.55); b(0.74, 0.18, 0.74, x, 3.96, 2.55);
      parts.push(new THREE.CylinderGeometry(0.26, 0.29, 2.97, 24).translate(x, 2.385, 2.55));
    }
    b(7.6, 3.3, 4.4, 0, 2.4, -0.6);
    b(8.8, 0.6, 6.2, 0, 4.35, 0);
    const tri = new THREE.Shape(); tri.moveTo(-4.4, 0); tri.lineTo(4.4, 0); tri.lineTo(0, 1.3); tri.closePath();
    parts.push(new THREE.ExtrudeGeometry(tri, { depth: 6.2, bevelEnabled: false }).translate(0, 4.65, -3.1));
    const g = mergeGeometries(parts.map((p) => { const n = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; }));
    stone.repeat.set(1, 1);
    const tm = mesh(g, new THREE.MeshPhongMaterial({ map: stone, color: '#b9b4a6', shininess: 8, specular: '#222' }));
    const door = mesh(new THREE.PlaneGeometry(1.5, 2.4), ph('#1a120c', 5, '#000'));
    door.position.set(0, 0.75 + 1.2, 1.605);
    const g2 = new THREE.Group(); g2.add(tm, door);
    g2.position.set(-14, 0, -38);
    g2.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; Object.assign(m.userData, { action: 'gridthing', reach: 6, info: '<b>A temple</b><div class="k">Columns, steps, a door into the dark. Built for a camera to swing past.</div>' }); } });
    root.add(g2); hits.push(g2);
    statics.push(big(g2, { minX: -14 - 4.8, maxX: -14 + 4.8, minZ: -38 - 3.5, maxZ: -38 + 3.5 }));
  }

  yield;
  // ----- the fish pond: a dark rim, rippling blue water, goldfish -----
  const fish = [];
  const PW = { t: { value: 0 } };
  {
    const g = new THREE.Group(), rim = ph('#43291a', 30, '#333'), W = 4.6, D = 3.4, T = 0.25, H = 0.4;
    for (const s of [-1, 1]) {
      const a = mesh(new THREE.BoxGeometry(W, H, T), rim); a.position.set(0, H / 2, s * (D - T) / 2); g.add(a);
      const c = mesh(new THREE.BoxGeometry(T, H, D - 2 * T), rim); c.position.set(s * (W - T) / 2, H / 2, 0); g.add(c);
    }
    const bed = mesh(new THREE.BoxGeometry(W - 2 * T, 0.06, D - 2 * T), ph('#0b2a4a', 10, '#000')); bed.position.y = 0.03; g.add(bed);
    const water = mesh(new THREE.PlaneGeometry(W - 2 * T, D - 2 * T).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: PW, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float t; varying vec2 vP;
        void main() {
          float w = sin(vP.x * 5.0 + t * 1.3) * sin(vP.y * 6.0 - t * 1.1) + 0.6 * sin((vP.x + vP.y) * 9.0 + t * 2.1) + 0.4 * sin(length(vP - vec2(0.6, -0.3)) * 14.0 - t * 2.6);
          vec3 c = mix(vec3(0.03, 0.22, 0.55), vec3(0.25, 0.6, 1.0), smoothstep(-0.6, 1.6, w));
          c += vec3(0.8, 0.9, 1.0) * smoothstep(1.35, 1.7, w);
          gl_FragColor = vec4(c, 0.72);
        }`,
    }));
    water.position.y = H - 0.06; g.add(water);
    const fm = ph('#e07018', 60, '#ffd090', { emissive: '#3a1400' });
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Group();
      const body = mesh(new THREE.SphereGeometry(0.07, 14, 8).scale(1.6, 0.8, 0.7), fm), tail = mesh(new THREE.ConeGeometry(0.05, 0.08, 4).rotateZ(Math.PI / 2).translate(-0.14, 0, 0), fm);
      f.add(body, tail); g.add(f);
      fish.push({ f, r: 0.5 + R() * 0.9, a: R() * 6.283, w: (0.4 + R() * 0.5) * (R() < 0.5 ? -1 : 1), y: 0.12 + R() * 0.12, ex: 1 + R() * 0.4 });
    }
    g.position.set(9.4, 0, -24.2);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = m !== water; m.receiveShadow = true; Object.assign(m.userData, { action: 'gridthing', reach: 4, info: '<b>A fish pond</b><div class="k">Goldfish, going round. The water’s too blue.</div>' }); } });
    root.add(g); hits.push(g);
    statics.push(big(g, { minX: 9.4 - W / 2, maxX: 9.4 + W / 2, minZ: -24.2 - D / 2, maxZ: -24.2 + D / 2 }));
  }

  // ----- maths and code in the air: pale, a little see-through, condensed, with a dark extruded edge -----
  // Markup: ^{..} superscript, _{..} subscript.
  function textMesh(src, h, color, opacity) {
    const runs = [];
    src.replace(/([\^_])\{([^}]*)\}|([^^_]+)/g, (m, k, inner, plain) => { runs.push(k ? { s: inner, k } : { s: plain, k: '' }); return m; });
    const S2 = 120, c0 = makeCanvas(8, 8).ctx, f = (k) => `500 ${k ? S2 * 0.5 : S2}px ${TEXT_FONT}`;
    let wsum = 0;
    for (const r of runs) { c0.font = f(r.k); r.w = c0.measureText(r.s).width; wsum += r.w; }
    const cw = Math.ceil(wsum + 40), ch = Math.round(S2 * 1.7), cv = makeCanvas(cw, ch), c = cv.ctx;
    const draw = (dx, dy, fill) => {
      let x = 20 + dx;
      for (const r of runs) {
        c.font = f(r.k); c.fillStyle = fill; c.textBaseline = 'alphabetic';
        c.fillText(r.s, x, S2 * 1.2 + dy + (r.k === '^' ? -S2 * 0.55 : r.k === '_' ? S2 * 0.18 : 0)); x += r.w;
      }
    };
    for (let i = 8; i > 0; i--) draw(i * 1.1, i * 1.1, 'rgba(10,18,22,0.55)');   // the extruded sides
    draw(0, 0, color);
    cv.tex.colorSpace = THREE.SRGBColorSpace; cv.tex.anisotropy = 4; cv.tex.needsUpdate = true;
    return mesh(new THREE.PlaneGeometry(h * cw / ch, h), new THREE.MeshBasicMaterial({ map: cv.tex, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  }
  const words = [
    ['48 65 6C 6C 6F 20 77 6F 72 6C 64 21', 0.95, '#a8bdb8', 0.55, -5.4, 2.4, -15.4, 0.22],
    ['e^{πi} = -1', 1.3, '#62c48c', 0.7, 3.4, 2.1, -11.2, -0.16],
    ['734', 1.6, '#2c5a66', 0.4, 3.4, 4.2, -28.6, -0.05],
    ['1 + 1 = 2', 1.0, '#6c8e88', 0.5, 7.2, 2.4, -31.0, -0.3],
    ['1782^{12} + 1841^{12} = 1922^{12}', 2.4, '#dccfe2', 0.85, 5.6, 2.3, -44.0, -0.08],
    ['107', 1.1, '#7d8fa8', 0.5, -9.2, 3.2, -25.0, 0.42],
    ['ρ_{0} > 3H_{0}^{2}/8πG', 1.0, '#90a2ba', 0.5, 11.4, 3.0, -15.2, -0.5],
  ];
  for (const [s, h, col, op, x, y, z, ry] of words) { yield; put(textMesh(s, h, col, op), x, y, z, { ry, float: true, bob: 0.08, cast: false }); }

  // ----- each frame: the sky over you, the floor under you, things turning and bobbing, the fish -----
  const homeY = (t) => t.home.p.y;
  function update(dt, t, cam) {
    U.t.value = t; PW.t.value = t;
    sky.position.copy(cam);
    floor.position.set(Math.round(cam.x / 6) * 6, 0, Math.round(cam.z / 6) * 6);
    key.position.set(Math.round(cam.x / 4) * 4 - 14, 22, Math.round(cam.z / 4) * 4 + 9); key.target.position.set(key.position.x + 14, 0, key.position.z - 9);
    for (const th of things) {
      if (th.taken || !th.float) continue;
      th.o.position.y = homeY(th) + Math.sin(t * 0.5 + th.ph) * th.bob;
      if (th.spin) th.o.rotation.y += th.spin * dt;
    }
    for (const f of fish) {
      f.a += f.w * dt;
      f.f.position.set(Math.cos(f.a) * f.r * f.ex, f.y, Math.sin(f.a) * f.r * 0.7);
      f.f.rotation.y = -f.a - Math.sign(f.w) * Math.PI / 2;
    }
  }
  return { scene: S, root, key, hemi, look, U, HU, floor, disc, things, statics, hits, update };
}
