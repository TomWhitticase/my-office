// The coast of the acrobats' floor (floors/acro.js): a dusk sky, soft and luminous, a crescent moon low over the sea and
// clouds banked along the horizon, warmer on the right; the sea, calm, the sky and the moon in it, foam where it meets
// the rocks; the granite, pink-grey with lichen, in rounded domes and slabs (acro-plan.js terrain); pines on it, and on
// the far shore across the bay; gulls wheeling. Light: the sky's blue from above, a low warm light off the horizon.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEN, D, N, SEA, toWorld, toSU, terrain, fbm, vn, inland, RING, STAIR, PLATEAU, SEATS, Y_DECK, DECK0 } from './acro-plan.js';

export const SKY = { zen: new THREE.Color('#2c4677'), mid: new THREE.Color('#6a84b4'), hor: new THREE.Color('#c3cde2'), glow: new THREE.Color('#ecc7b8'), fog: new THREE.Color('#9fb0cf') };
// the moon: up over the sea, left of the line out; the glow on the horizon to the right
export const MOON = new THREE.Vector3(D.x * 0.86 - N.x * 0.5, 0.5, D.z * 0.86 - N.z * 0.5).normalize();
export const GLOW = new THREE.Vector3(-D.x * 0.2 + N.x * 0.98, 0.0, -D.z * 0.2 + N.z * 0.98).normalize();

const SKY_GLSL = `
  uniform vec3 zen, mid, hor, glow, moonD, glowD;
  float sh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
  float sf(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += sn(p) * a; p = p * 2.02 + 1.3; a *= 0.5; } return v; }
  vec3 skyCol(vec3 d, float t, bool clouds) {
    float up = max(d.y, 0.0);
    vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, up));
    c = mix(c, zen, smoothstep(0.18, 0.85, up));
    float g = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), glowD));
    c = mix(c, glow, pow(g, 3.0) * exp(-up * 7.0) * 0.75);
    if (clouds) {
      // soft banks of cloud low over the sea, drifting; lit from the glow, blue-grey under
      vec2 p = d.xz / (0.12 + up) * 1.4 + vec2(t * 0.004, t * 0.002);
      float cl = sf(p * 0.9) * 0.65 + sf(p * 2.3 + 7.0) * 0.35;
      float band = smoothstep(0.02, 0.1, up) * (1.0 - smoothstep(0.22, 0.5, up));
      float k = smoothstep(0.48, 0.72, cl) * band;
      vec3 cc = mix(vec3(0.62, 0.68, 0.8), vec3(0.95, 0.88, 0.88), clamp(pow(g, 2.0) * 0.7 + (cl - 0.5) * 1.2, 0.0, 1.0));
      c = mix(c, cc, k * 0.75);
      // high thin streaks
      float hi = smoothstep(0.55, 0.8, sf(vec2(d.x * 3.0 / (0.3 + up), d.z * 9.0 / (0.3 + up)) + t * 0.003)) * smoothstep(0.25, 0.45, up) * (1.0 - smoothstep(0.7, 0.95, up));
      c = mix(c, vec3(0.78, 0.8, 0.9), hi * 0.25);
      // stars, faint, high up
      vec2 sp = floor(d.xz / (d.y + 0.2) * 260.0);
      float st = step(0.9985, sh(sp)) * smoothstep(0.35, 0.8, up);
      c += vec3(0.8, 0.85, 1.0) * st * (0.4 + 0.6 * sin(t * 2.0 + sh(sp + 1.0) * 40.0)) * 0.5;
    }
    // the moon: a crescent, its glow round it
    float m = dot(d, moonD), r = 0.0215;
    float ang = acos(clamp(m, -1.0, 1.0));
    c += vec3(0.75, 0.8, 0.95) * exp(-ang * 28.0) * 0.35 + vec3(0.9, 0.9, 1.0) * exp(-ang * 7.0) * 0.08;
    if (ang < r * 1.05) {
      // the lit limb toward the glow: the disc less a disc pushed away from it
      vec3 off = normalize(moonD + normalize(cross(cross(glowD, moonD), moonD)) * -0.0);
      vec3 tdir = normalize(glowD - moonD * dot(glowD, moonD));
      float inner = acos(clamp(dot(d, normalize(moonD - tdir * r * 0.62)), -1.0, 1.0));
      float lit = smoothstep(r * 1.02, r * 0.94, ang) * smoothstep(r * 0.86, r * 0.96, inner);
      c = mix(c, vec3(1.0, 0.98, 0.9) * 1.25, lit);
    }
    return c;
  }`;

export function buildLand(fl, R, time) {
  const S = fl.scene, root = new THREE.Group();
  S.add(root);
  S.background = SKY.fog.clone();
  S.fog = new THREE.FogExp2(SKY.fog.clone(), 0.0034);
  const U = { zen: { value: SKY.zen }, mid: { value: SKY.mid }, hor: { value: SKY.hor }, glow: { value: SKY.glow }, moonD: { value: MOON }, glowD: { value: GLOW }, time };
  const onCam = (m) => { m.frustumCulled = false; m.onBeforeRender = (r, s, cam) => { const e = cam.matrixWorld.elements; m.position.set(e[12], e[13], e[14]); m.updateMatrixWorld(); }; return m; };

  // ----- the sky -----
  const sky = onCam(new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; varying vec3 vD; ${SKY_GLSL} void main() { gl_FragColor = vec4(skyCol(normalize(vD), time, true), 1.0); }`,
  })));
  sky.renderOrder = -2; root.add(sky);

  // ----- the terrain: a grid in (s, u), fine near the ring and the line, coarser out to the hills -----
  const axis = (lo, hi, fine0, fine1, step, far) => {
    const v = [];
    for (let x = fine0; x <= fine1 + 1e-6; x += step) v.push(x);
    for (let x = fine0 - step, k = step; x > lo; k *= far, x -= k) v.unshift(x);
    for (let x = fine1 + step, k = step; x < hi; k *= far, x += k) v.push(x);
    return v;
  };
  const SS = axis(-520, 140, -40, 62, 0.75, 1.07), UU = axis(-520, 520, -45, 40, 0.75, 1.07);
  const nS = SS.length, nU = UU.length, pos = new Float32Array(nS * nU * 3), col = new Float32Array(nS * nU * 3);
  const granite = new THREE.Color('#a8a19e'), pink = new THREE.Color('#b3a099'), grey = new THREE.Color('#8a8a94'), lichen = new THREE.Color('#9a9c80'), wet = new THREE.Color('#55586a'), moss = new THREE.Color('#5f6a55'), cc = new THREE.Color();
  const H = new Float32Array(nS * nU);
  for (let a = 0; a < nS; a++) for (let b = 0; b < nU; b++) {
    const k = a * nU + b, w = toWorld(SS[a], UU[b]), h = terrain(w.x, w.z);
    H[k] = h; pos[k * 3] = w.x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = w.z;
  }
  for (let a = 0; a < nS; a++) for (let b = 0; b < nU; b++) {
    const k = a * nU + b, h = H[k], w = { x: pos[k * 3], z: pos[k * 3 + 2] };
    const a1 = Math.min(nS - 1, a + 1), b1 = Math.min(nU - 1, b + 1), a0 = Math.max(0, a - 1), b0 = Math.max(0, b - 1);
    const slope = Math.hypot((H[a1 * nU + b] - H[a0 * nU + b]) / (SS[a1] - SS[a0] || 1), (H[a * nU + b1] - H[a * nU + b0]) / (UU[b1] - UU[b0] || 1));
    const n1 = fbm(w.x * 0.08, w.z * 0.08), n2 = vn(w.x * 0.6, w.z * 0.6);
    cc.copy(granite).lerp(pink, n1).lerp(grey, Math.min(1, slope * 0.5) * 0.6);
    if (slope < 0.5) cc.lerp(lichen, Math.max(0, n2 - 0.6) * 0.8);
    if (slope < 0.35 && h > SEA + 2) cc.lerp(moss, Math.max(0, fbm(w.x * 0.03 + 4, w.z * 0.03) - 0.52) * 0.9);
    if (slope > 0.9) cc.multiplyScalar(0.86 + 0.1 * n2);
    cc.lerp(wet, 1 - Math.min(1, Math.max(0, (h - SEA - 0.2) / 1.4)));
    const ao = 0.82 + 0.18 * n2;
    col[k * 3] = cc.r * ao; col[k * 3 + 1] = cc.g * ao; col[k * 3 + 2] = cc.b * ao;
  }
  const idx = [];
  for (let a = 0; a < nS - 1; a++) for (let b = 0; b < nU - 1; b++) {
    const k = a * nU + b;
    if (H[k] < SEA - 2.3 && H[k + 1] < SEA - 2.3 && H[k + nU] < SEA - 2.3 && H[k + nU + 1] < SEA - 2.3) continue;   // deep under the sea: nothing to see
    idx.push(k, k + 1, k + nU, k + 1, k + nU + 1, k + nU);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setIndex(idx);
  tg.computeVertexNormals();
  // (facing up: wound so its normals point +y)
  if (tg.attributes.normal.getY(Math.floor(nS / 2) * nU + Math.floor(nU / 2)) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } tg.setIndex(idx); tg.computeVertexNormals(); }
  const rockM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  rockM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW;
      float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rh(i), rh(i + vec2(1, 0)), f.x), mix(rh(i + vec2(0, 1)), rh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 p = vW.xz + vW.y * 0.6;
        float g = rn(p * 9.0) * 0.5 + rn(p * 23.0) * 0.5;                       // the grain: feldspar and mica
        float crack = smoothstep(0.04, 0.0, abs(rn(p * 0.7 + 3.1) - 0.5)) * smoothstep(0.4, 0.7, rn(p * 0.21));
        float sl = rn(p * 0.35 + 1.7);                                          // broad slabs, a shade apart
        diffuseColor.rgb *= (0.88 + g * 0.2) * (1.0 - crack * 0.5) * (0.92 + sl * 0.14); }`);
  };
  rockM.customProgramCacheKey = () => 'acro-rock';
  const land = new THREE.Mesh(tg, rockM);
  land.userData.ground = true;
  root.add(land);

  // ----- the sea: the sky in it, the moon's path, swell; foam where it meets the rocks (from a map of the rock's height) -----
  const MS = 512, M0 = toWorld(10, 0), MW = 260, foam = new Uint8Array(MS * MS * 4);
  for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
    const x = M0.x + (i / (MS - 1) - 0.5) * MW, z = M0.z + (j / (MS - 1) - 0.5) * MW, h = terrain(x, z), k = (j * MS + i) * 4;
    foam[k] = Math.max(0, Math.min(255, (h - SEA + 3) / 6 * 255)); foam[k + 1] = 0; foam[k + 2] = 0; foam[k + 3] = 255;
  }
  const foamT = new THREE.DataTexture(foam, MS, MS); foamT.magFilter = foamT.minFilter = THREE.LinearFilter; foamT.needsUpdate = true;
  const seaM = new THREE.ShaderMaterial({
    uniforms: { ...U, foam: { value: foamT }, f0: { value: new THREE.Vector2(M0.x - MW / 2, M0.z - MW / 2) }, fw: { value: MW }, fogC: { value: SKY.fog }, fogD: { value: S.fog.density } },
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time; uniform sampler2D foam; uniform vec2 f0; uniform float fw; uniform vec3 fogC; uniform float fogD; varying vec3 vW;
      ${SKY_GLSL}
      vec2 wave(vec2 p, float t) {
        vec2 g = vec2(0.0);
        g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.35 + t * 0.9 + sn(p * 0.05) * 6.0) * 0.018;
        g += vec2(-0.5, 0.9) * cos(dot(p, vec2(-0.5, 0.9)) * 0.7 + t * 1.3 + sn(p * 0.07 + 3.0) * 6.0) * 0.014;
        g += (vec2(sn(p * 1.3 + t * 0.4), sn(p * 1.3 - t * 0.37 + 9.0)) - 0.5) * 0.06;
        g += (vec2(sn(p * 4.7 - t * 0.9), sn(p * 4.1 + t * 0.8 + 3.0)) - 0.5) * 0.03;
        return g;
      }
      void main() {
        vec3 V = vW - cameraPosition; float dist = length(V); V /= dist;
        float fade = smoothstep(260.0, 30.0, dist);
        vec2 g = wave(vW.xz, time) * (0.35 + 0.65 * fade);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 r = reflect(V, n); r.y = abs(r.y);
        float fr = 0.03 + 0.97 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
        vec3 deep = vec3(0.1, 0.17, 0.29);
        vec3 c = mix(deep, skyCol(normalize(r), time, false) * 0.92, clamp(fr * 1.15 + 0.12, 0.0, 1.0));
        // the moon's path: glints on the facets turned to it
        float sp = pow(max(dot(r, moonD), 0.0), 380.0) * 3.0 + pow(max(dot(r, moonD), 0.0), 40.0) * 0.12;
        c += vec3(1.0, 0.97, 0.88) * sp;
        // shallows and foam: the rock's height under it
        vec2 fu = (vW.xz - f0) / fw;
        if (fu.x > 0.0 && fu.x < 1.0 && fu.y > 0.0 && fu.y < 1.0) {
          float h = texture2D(foam, fu).r * 6.0 - 3.0;   // metres above the sea's level
          c = mix(c, vec3(0.32, 0.42, 0.48), smoothstep(-2.5, 0.0, h) * 0.35);
          float edge = smoothstep(-0.9, -0.05, h), lap = sin(h * 9.0 - time * 1.6 + sn(vW.xz * 0.7) * 6.0) * 0.5 + 0.5;
          c = mix(c, vec3(0.86, 0.9, 0.94), edge * (0.35 + 0.65 * lap) * smoothstep(0.35, 0.75, sn(vW.xz * 1.6 + time * 0.3)) * 0.8);
        }
        c = mix(fogC, c, exp(-fogD * fogD * dist * dist));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2), seaM);
  sea.position.y = SEA; sea.renderOrder = -1;
  root.add(sea);

  // ----- pines: a trunk and tiers of drooping boughs, dark blue-green; on the rocks, never on a path -----
  const pineParts = (q) => {
    const parts = [], tiers = q ? 7 : 4, Cb = new THREE.Color('#2a4038'), Ct = new THREE.Color('#47604d');
    const trunk = new THREE.CylinderGeometry(0.05, 0.13, 1.6, q ? 6 : 4).translate(0, 0.8, 0); trunk.deleteAttribute('uv');
    parts.push([trunk, '#4a3a33']);
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1), r = 1.35 * (1 - t * 0.82), y = 1.0 + t * 5.6;
      const g = new THREE.ConeGeometry(r, 1.6 - t * 0.5, q ? 9 : 5, 1, false).translate(0, y + 0.6, 0);
      g.deleteAttribute('uv');
      const p = g.attributes.position;   // ragged edges: the rim's points pushed in and out, and drooped
      for (let k = 0; k < p.count; k++) { const yy = p.getY(k) - y - 0.6; if (yy < -0.2) { const a = Math.atan2(p.getZ(k), p.getX(k)), w = 0.75 + 0.35 * Math.sin(a * 5 + i * 1.7); p.setX(k, p.getX(k) * w); p.setZ(k, p.getZ(k) * w); p.setY(k, p.getY(k) - 0.15 * w); } }
      parts.push([g, new THREE.Color().copy(Cb).lerp(Ct, t * 0.6 + 0.1)]);
    }
    return mergeGeometries(parts.map(([g, c]) => { g = g.index ? g.toNonIndexed() : g; const cl = new THREE.Color(c), a = new Float32Array(g.attributes.position.count * 3); for (let k = 0; k < a.length; k += 3) { a[k] = cl.r; a[k + 1] = cl.g; a[k + 2] = cl.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.computeVertexNormals(); return g; }));
  };
  const pineM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const spots = [];
  const ok = (x, z) => {
    const { s, u } = toSU(x, z), h = terrain(x, z);
    if (h < SEA + 1.2 || Math.hypot(x - CEN.x, z - CEN.z) < RING + 9 || Math.hypot(x, z) < 6) return null;
    if (Math.abs(u) < 6 && s > -14) return null;   // the line of towers
    if (u > STAIR.u0 - 2.5 && u < STAIR.u1 + 2.5 && s > STAIR.s0 - 3 && s < STAIR.s1 + 2) return null;
    if (s > PLATEAU.s0 - 1 && s < 44 && u > PLATEAU.u0 - 1 && u < 9) return null;   // (the halt's on the headland's near part)
    const r = Math.hypot(s, u), a = Math.atan2(u, s);
    if (a > SEATS.a0 - 0.25 && a < SEATS.a1 + 0.2 && r < SEATS.r0 + SEATS.rows * SEATS.step + 4) return null;
    const e = 0.6, sl = Math.hypot(terrain(x + e, z) - terrain(x - e, z), terrain(x, z + e) - terrain(x, z - e)) / (2 * e);
    return sl < 0.85 ? h : null;
  };
  for (let k = 0; k < 3000 && spots.length < 600; k++) {
    const hd = k < 400, s = hd ? PLATEAU.s0 - 2 + R() * 32 : -150 + R() * 210, u = hd ? 5 + R() * 34 : -170 + R() * 260, w = toWorld(s, u);
    const { s: s2, u: u2 } = toSU(w.x, w.z);
    if (fbm(w.x * 0.03 + 11, w.z * 0.03) < (s2 > PLATEAU.s0 && u2 > 6 && s2 < PLATEAU.s1 + 6 ? 0.2 : 0.42)) continue;   // in groves (thick on the headland)
    const h = ok(w.x, w.z); if (h == null) continue;
    spots.push([w.x, h - 0.15, w.z, 0.7 + R() * 0.8, R() * 6.28]);
  }
  // the far shore across the bay (to the left of the line, far out): islands of rock and pines
  const isles = [];
  for (const [s, u, r] of [[140, -150, 38], [230, -110, 30], [320, -210, 60], [90, -230, 45], [420, -40, 26], [180, 160, 50], [300, 120, 34]]) {
    const w = toWorld(s, u);
    const g = new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.deleteAttribute('uv');
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), z = p.getZ(k), y = p.getY(k); p.setY(k, y * (0.16 + 0.1 * vn(x * 0.1 + s, z * 0.1)) - 0.6); p.setX(k, x * (0.85 + 0.3 * vn(z * 0.05, s))); }
    g.computeVertexNormals(); g.translate(w.x, SEA, w.z); isles.push(g);
    for (let i = 0; i < r * 1.6; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * r * 0.8, x = w.x + Math.cos(a) * d, z = w.z + Math.sin(a) * d; spots.push([x, SEA + r * 0.16 * (1 - (d / r) ** 2) - 0.8, z, 1.1 + R() * 0.8, R() * 6.28]); }
  }
  const isleM = new THREE.MeshStandardMaterial({ color: '#6f6c78', roughness: 1 });
  root.add(new THREE.Mesh(mergeGeometries(isles), isleM));
  const pines = { hi: new THREE.InstancedMesh(pineParts(true), pineM, spots.length), lo: new THREE.InstancedMesh(pineParts(false), pineM, spots.length) };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
  const near = spots.filter((p) => Math.hypot(p[0] - CEN.x, p[2] - CEN.z) < 120), far = spots.filter((p) => Math.hypot(p[0] - CEN.x, p[2] - CEN.z) >= 120);
  for (const [im, list] of [[pines.hi, near], [pines.lo, far]]) {
    list.forEach(([x, y, z, s, a], i) => { im.setMatrixAt(i, m4.compose(pp.set(x, y, z), q.setFromAxisAngle(yAx, a), sc.set(s, s * (0.9 + (a % 0.4)), s))); });
    im.count = list.length; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); root.add(im);
  }

  // ----- gulls: white, slow, wheeling over the shore and out over the water, their wings flapping in the shader -----
  const gullG = (() => {
    const g = new THREE.BufferGeometry(), v = [];
    // body, and two wings in two segments each: [x, y, z] with x along the wing (flapped by |x|)
    const tri = (a, b, c) => v.push(...a, ...b, ...c);
    tri([0, 0, 0.22], [0.05, 0, -0.18], [-0.05, 0, -0.18]);
    for (const s of [-1, 1]) { tri([0, 0, 0.1], [s * 0.42, 0.02, 0.0], [0, 0, -0.08]); tri([s * 0.42, 0.02, 0.0], [s * 0.82, -0.04, -0.1], [s * 0.4, 0.02, -0.08]); }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3)); g.computeVertexNormals();
    return g;
  })();
  const gullM = new THREE.MeshBasicMaterial({ color: '#e8ecf2', side: THREE.DoubleSide, fog: true });
  gullM.onBeforeCompile = (sh) => {
    sh.uniforms.time = time;
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float ph = float(gl_InstanceID) * 1.7, w = abs(transformed.x);
        transformed.y += sin(time * 6.0 + ph) * w * w * 0.9 * (0.6 + 0.4 * sin(time * 0.7 + ph)); }`);
  };
  const gulls = new THREE.InstancedMesh(gullG, gullM, 14); gulls.frustumCulled = false;
  const gs = Array.from({ length: 14 }, (_, i) => ({ c: toWorld(10 + R() * 70, -30 + R() * 50), r: 14 + R() * 30, y: 9 + R() * 16, w: (0.08 + R() * 0.07) * (R() < 0.5 ? -1 : 1), a: R() * 6.28, s: 1.3 + R() * 0.5 }));
  root.add(gulls);

  // ----- the light: the sky from above, the warm low light off the horizon on the right, a cool moon fill -----
  const hemi = new THREE.HemisphereLight('#a9bde2', '#5d5866', 1.25);
  const key = new THREE.DirectionalLight('#ffd9c4', 1.25); key.position.copy(GLOW).multiplyScalar(80).setY(22);
  const moonL = new THREE.DirectionalLight('#b8c8ff', 0.35); moonL.position.copy(MOON).multiplyScalar(80);
  S.add(hemi, key, moonL);
  fl.hemi = hemi;

  return {
    root, land, sea, gulls,
    lights: [[key, 1.25], [moonL, 0.35]],
    update(t) {
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i], a = g.a + t * g.w, x = g.c.x + Math.cos(a) * g.r, z = g.c.z + Math.sin(a) * g.r, y = g.y + Math.sin(t * 0.3 + i) * 2;
        q.setFromAxisAngle(yAx, -a + (g.w > 0 ? 0 : Math.PI));
        gulls.setMatrixAt(i, m4.compose(pp.set(x, y, z), q, sc.set(g.s, g.s, g.s)));
      }
      gulls.instanceMatrix.needsUpdate = true;
    },
  };
}
