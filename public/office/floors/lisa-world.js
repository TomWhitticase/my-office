// Her world (floors/lisa.js), the portrait's own landscape built round you: the loggia she sat in and the country below it.
// - The loggia: a stone floor on a high podium, a plastered back wall, side walls with round-headed doorways onto stairs
//   down the outside, a low parapet along the front with four columns standing on it (the painting's column bases), a
//   beamed ceiling; her chair, a little in front of where you come in, facing you. Its frame hangs in the air in the middle.
// - Below and away: a hillside falling to a river, a red earth road winding down off each stair, the one on the right to
//   a three-arched stone bridge over the river, the other winding off along the valley to the left; boulders; then the
//   country going on and on, lakes lying in it, and far off, jagged blue-grey spires in haze. One terrain, fine near you
//   and coarse far off (rings round the middle), the same height function underfoot (ground()).
// - The sky, the haze and the water in the painting's palette: a greenish blue-grey sky paling to the horizon, a soft
//   blue-green sfumato over the distance, still pale water.
// Its horror, as uniforms the floor drives (lisa.js): `dread` (the sky to blood red and black, the haze to smoke, the
// river to black), `peel` (the paint cracking all over and coming away in flakes, the raw canvas showing, black void
// behind that: every surface out here), `faces` (her face in the clouds and in the river).
// Built under its own random stream. Positions: the frame at the origin, its plane z = 0, the loggia's floor y = 0, the
// view toward -z.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas } from '../util.js';
import { WL, RIVER, ROADS, BRIDGE, STAIR, LOGGIA, terrain, along, vn, h2, sstep } from './lisa-land.js';

export { WL };

export const HAZE = new THREE.Color('#a9b7a0');
const FOG = 0.0011;
const SMOKE = new THREE.Color('#2a1410');

// ----- materials: lit, fogged, and able to crack and peel (the paint coming off the world) -----
const PEEL = `
  float lp_h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float lp_n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lp_h(i), lp_h(i + vec2(1, 0)), f.x), mix(lp_h(i + vec2(0, 1)), lp_h(i + vec2(1, 1)), f.x), f.y); }
  float lp_f(vec2 p) { return lp_n(p) * 0.5 + lp_n(p * 2.03 + 7.1) * 0.3 + lp_n(p * 4.1 - 3.3) * 0.2; }
  // cracks: the edges of a web of cells; the flakes come away cell by cell where the noise lets them
  vec2 lp_cell(vec2 p) {
    vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), o = vec2(lp_h(i + g), lp_h(i + g + 17.0)), r = g + o - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = lp_h(i + g + 3.0); } else if (d < d2) d2 = d;
    }
    return vec2(sqrt(d2) - sqrt(d1), id);
  }
  // in: the surface's colour, world position, normal; out: the colour, with how much light it still takes in .a
  vec4 lisaPeel(vec3 col, vec3 wp, vec3 n, float peel, float scale) {
    if (peel <= 0.001) return vec4(col, 1.0);
    vec3 an = abs(n); vec2 p = (an.y > an.x && an.y > an.z ? wp.xz : an.x > an.z ? wp.zy : wp.xy) / scale;
    vec2 c = lp_cell(p * 3.0);
    float big = lp_f(p * 0.35), crack = smoothstep(0.06 * peel + 0.01, 0.0, c.x) * smoothstep(0.0, 0.35, peel);
    float gone = smoothstep(peel * 1.25 - 0.08, peel * 1.25, 1.0 - big * 0.7 - c.y * 0.3 + 0.1);
    gone = 1.0 - gone;   // 1 where the flake's off
    float voidK = smoothstep(0.55, 0.85, peel * 1.25 - (1.0 - big * 0.7 - c.y * 0.3 + 0.1) + 0.55);
    // raw canvas: a pale linen, its weave; where that's gone too, nothing
    vec2 wv = p * 220.0; float weave = 0.8 + 0.2 * sin(wv.x) * sin(wv.y);
    vec3 canvas = vec3(0.62, 0.55, 0.42) * weave;
    vec3 o = mix(col * (1.0 - crack * 0.85), canvas, gone);
    o = mix(o, vec3(0.0), gone * voidK);
    return vec4(o, 1.0 - gone * voidK);
  }`;
const peelU = { peel: { value: 0 } };
/** A material that cracks and peels with `peel` (the shared uniform), by its own key. */
export function peelable(m, key, scale = 2) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.peel = peelU.peel;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLWp; varying vec3 vLN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vLWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vLN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vLWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vLN = normalize(mat3(modelMatrix) * objectNormal);
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float peel; varying vec3 vLWp; varying vec3 vLN;\n${PEEL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nvec4 lpk = lisaPeel(diffuseColor.rgb, vLWp, vLN, peel, ${scale.toFixed(2)}); diffuseColor.rgb = lpk.rgb;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= lpk.a;');
  };
  m.customProgramCacheKey = () => `lisa-${key}`;
  return m;
}

// ----- textures -----
function plasterTex(R) {   // warm lime plaster: smooth, faintly mottled, a few hairline cracks
  const t = makeCanvas(256, 256), c = t.ctx;
  c.fillStyle = '#d6c7a4'; c.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 60; k++) { const x = R() * 256, y = R() * 256, r = 10 + R() * 40, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${R() < 0.5 ? '170,150,112' : '236,224,196'},.12)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); }
  for (let k = 0; k < 2500; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,248,230' : '90,76,54'},${R() * 0.05})`; c.fillRect(R() * 256, R() * 256, 1, 1); }
  c.strokeStyle = 'rgba(110,94,70,.25)'; c.lineWidth = 0.7;
  for (let k = 0; k < 5; k++) { let x = R() * 256, y = R() * 256; c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (R() - 0.5) * 18; y += R() * 12; c.lineTo(x, y); } c.stroke(); }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true;
  return t.tex;
}
function stoneTex(R, base, w = 256, joints = true) {
  const t = makeCanvas(w, w), c = t.ctx;
  c.fillStyle = base; c.fillRect(0, 0, w, w);
  for (let k = 0; k < 1800; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,240,210' : '40,30,20'},${R() * 0.07})`; c.fillRect(R() * w, R() * w, 1 + R() * 5, 1 + R() * 4); }
  for (let k = 0; k < 30; k++) { const g = c.createRadialGradient(R() * w, R() * w, 0, R() * w, R() * w, 20 + R() * 60); g.addColorStop(0, `rgba(${R() < 0.5 ? '90,80,60' : '200,190,160'},.12)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); }
  if (joints) { c.strokeStyle = 'rgba(40,30,20,.45)'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, w - 2); c.beginPath(); c.moveTo(0, w / 2); c.lineTo(w, w / 2); c.moveTo(w / 2, 0); c.lineTo(w / 2, w / 2); c.moveTo(w / 4, w / 2); c.lineTo(w / 4, w); c.moveTo(w * 0.75, w / 2); c.lineTo(w * 0.75, w); c.stroke(); }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true;
  return t.tex;
}

/** @param {any} fl the floor @param {() => number} R */
export function buildWorld(fl, R, tFace, land) {
  const S = fl.scene, root = new THREE.Group();
  S.add(root);
  S.background = HAZE.clone();
  S.fog = new THREE.FogExp2(HAZE.clone(), FOG);
  const time = { value: 0 }, dread = { value: 0 }, faces = { value: 0 };
  const U = { time, dread, faces, peel: peelU.peel, tFace: { value: tFace } };
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P3 = new THREE.Vector3(), S3 = new THREE.Vector3();
  const onCam = (m, fn) => { m.frustumCulled = false; m.onBeforeRender = (r, s, cam) => { fn(m, cam.matrixWorld.elements); m.updateMatrixWorld(); }; return m; };

  // ----- the sky: greenish blue-grey above, paling and warming to the haze; soft clouds; in dread, blood and black -----
  const NOISE = `float sh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float sn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
    float sf(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += sn(p) * a; p = p * 2.03 + 1.7; a *= 0.5; } return v; }`;
  const sky = onCam(new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), new THREE.ShaderMaterial({
    uniforms: { ...U, haze: { value: HAZE } }, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, dread, faces, peel; uniform vec3 haze; uniform sampler2D tFace; varying vec3 vD;
      ${NOISE}
      // her face, big and faint, in the clouds: three of them round the sky, each turned a little
      float faceAt(vec3 d, vec3 c, float size) {
        vec3 u = normalize(cross(vec3(0, 1, 0), c)), v = cross(c, u); float k = dot(d, c);
        if (k < 0.8) return 0.0;
        vec2 q = vec2(dot(d, u), dot(d, v)) / size * 0.5 + 0.5; q.y = 1.0 - q.y;
        if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return 0.0;
        vec3 f = texture2D(tFace, q).rgb; float l = dot(f, vec3(0.3, 0.55, 0.15));
        vec2 e = min(q, 1.0 - q); return (1.0 - l) * smoothstep(0.0, 0.25, min(e.x, e.y));
      }
      void main() {
        vec3 d = normalize(vD); float up = max(d.y, 0.0);
        vec3 top = vec3(0.2, 0.3, 0.28), c = mix(haze, top, smoothstep(0.0, 0.7, pow(up, 0.7)));
        vec2 p = d.xz / (0.3 + up) * 1.6 + vec2(time * 0.004, time * 0.002);
        float cl = sf(p) * 0.65 + sf(p * 2.3 - time * 0.006) * 0.35;
        c = mix(c, c * 1.12 + 0.03, smoothstep(0.45, 0.8, cl) * smoothstep(0.02, 0.25, up) * 0.6);
        // dread: the sky going to blood and black, the clouds to churning smoke, lit red from under
        vec2 q = p * 1.4 + vec2(time * 0.03, -time * 0.02); float sm = sf(q) * 0.6 + sf(q * 2.7 + time * 0.05) * 0.4;
        vec3 blood = mix(vec3(0.42, 0.04, 0.02), vec3(0.02, 0.0, 0.0), smoothstep(0.05, 0.6, up)) * (0.55 + 0.9 * sm);
        blood = mix(blood, vec3(0.0), smoothstep(0.55, 0.85, sm) * smoothstep(0.1, 0.5, up));
        c = mix(c, blood, dread);
        float fz = faceAt(d, normalize(vec3(-0.5, 0.3, -1.0)), 0.5) + faceAt(d, normalize(vec3(0.7, 0.42, -0.8)), 0.42) + faceAt(d, normalize(vec3(0.1, 0.62, -1.0)), 0.6);
        c = mix(c, c * vec3(0.4, 0.3, 0.28), clamp(fz, 0.0, 1.0) * faces * (0.6 + 0.4 * sm));
        // peeled: the sky's paint coming off in big flakes, canvas, then the void
        vec2 pc = d.xz / (0.15 + up) * 3.0; float fl = sf(pc * 0.8) * 0.7 + sn(pc * 6.0) * 0.3;
        float off = smoothstep(peel * 1.1, peel * 1.1 - 0.05, 1.0 - fl);
        c = mix(c, mix(vec3(0.58, 0.5, 0.38), vec3(0.0), smoothstep(0.4, 0.9, peel)), off * step(0.001, peel));
        c = mix(c, haze * mix(vec3(1.0), vec3(0.5, 0.18, 0.1), dread), smoothstep(0.06, 0.0, up) * (1.0 - off));
        gl_FragColor = vec4(c, 1.0);
      }`,
  })), (m, e) => m.position.set(e[12], e[13], e[14]));
  sky.renderOrder = -2; root.add(sky);

  // ----- the land: one terrain (built in the worker: lisa-land.js landMesh) -----
  // (it may come after the rest: setLand)
  const landM = peelable(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 'land', 3);
  let landO = null;
  function setLand(L) {
    if (landO || !L) return;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(L.pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(L.col, 3));
    tg.setAttribute('normal', new THREE.BufferAttribute(L.nrm, 3)); tg.setIndex(new THREE.BufferAttribute(L.idx, 1));
    landO = new THREE.Mesh(tg, landM); landO.frustumCulled = false;   // (it's all round you)
    root.add(landO);
  }
  setLand(land);

  // ----- the spires: Leonardo's crags far off, tall and jagged and blue in the haze (instanced, sculpted) -----
  const cragG = (seed) => {
    const g = new THREE.CylinderGeometry(0.16, 1, 1, 20, 24, true).translate(0, 0.5, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      // fluted, pinnacled: deep vertical grooves, ledges, a broken top
      const k = (1 - 0.55 * y ** 0.8) * (1 + 0.32 * (vn(a * 3 + seed, y * 4) - 0.5) + 0.22 * Math.abs(Math.sin(a * 7 + seed + y * 3)) - 0.15 * Math.abs(Math.sin(y * 19 + a * 2)));
      const top = y > 0.85 ? (y - 0.85) * (1.6 + 2 * vn(a * 5 + seed, 1)) : 0;
      p.setXYZ(i, x * k * (1 - top), y * (1 + 0.25 * (vn(a * 2 + seed, 3) - 0.5)) - top * 0.3, z * k * (1 - top));
    }
    g.computeVertexNormals(); return g;
  };
  const hazeU = { haze: { value: HAZE }, dread };
  const cragM = new THREE.MeshStandardMaterial({ color: '#58706f', roughness: 0.9, fog: false, flatShading: false });
  cragM.onBeforeCompile = (sh) => {   // their own aerial perspective: into the pale blue-green with distance, never quite gone
    Object.assign(sh.uniforms, hazeU, { peel: peelU.peel });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHz; varying float vHy;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHz = -mvPosition.z; vHy = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 haze; uniform float dread; varying float vHz; varying float vHy;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float hz = clamp(0.3 + 0.38 * smoothstep(1400.0, 3900.0, vHz) + 0.25 * (1.0 - smoothstep(-20.0, 200.0, vHy)), 0.0, 0.88);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, haze * mix(vec3(1.0), vec3(0.32, 0.1, 0.07), dread), hz);`);
  };
  cragM.customProgramCacheKey = () => 'lisa-crag';
  const crags = [];
  for (const [n, r0, r1, a0, a1, h0, h1] of [[30, 1500, 2400, -2.7, -0.45, 120, 380], [40, 2300, 3900, -3.1, -0.05, 260, 700], [24, 1800, 3600, 0.1, 3.0, 200, 520]]) {
    const geo = cragG(n), m = new THREE.InstancedMesh(geo, cragM, n);
    for (let k = 0; k < n; k++) {
      const a = a0 + (a1 - a0) * R(), r = r0 + (r1 - r0) * R(), x = Math.cos(a) * r, z = Math.sin(a) * r - 60, h = h0 + (h1 - h0) * R() ** 1.4, w = h * (0.22 + R() * 0.35);
      M4.compose(P3.set(x, terrain(x, z) - 30, z), Q.setFromEuler(E.set((R() - 0.5) * 0.12, R() * 6, (R() - 0.5) * 0.12)), S3.set(w, h, w * (0.7 + R() * 0.5)));
      m.setMatrixAt(k, M4);
    }
    m.frustumCulled = false; crags.push(m); root.add(m);
  }

  // ----- the water: one sheet at WL, pale, still, the sky in it; dark in dread; her faces in it -----
  const water = new THREE.Mesh(new THREE.CircleGeometry(4300, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { ...U, haze: { value: HAZE } }, transparent: false, fog: false,
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time, dread, faces, peel; uniform vec3 haze; uniform sampler2D tFace; varying vec3 vW;
      ${NOISE}
      void main() {
        vec3 v = normalize(vW - cameraPosition); float dist = length(vW - cameraPosition);
        float fres = pow(1.0 - max(0.0, -v.y), 4.0);
        vec2 rp = vW.xz * 0.15 + vec2(time * 0.05, time * 0.03);
        float rip = sn(rp) * 0.6 + sn(rp * 2.7) * 0.4;
        vec3 deep = vec3(0.22, 0.3, 0.3), skyc = vec3(0.5, 0.58, 0.55);
        vec3 c = mix(deep, skyc, 0.35 + 0.55 * fres) * (0.94 + 0.12 * rip);
        // dark: the river running black, a sheen of red on it
        c = mix(c, mix(vec3(0.01, 0.005, 0.004), vec3(0.3, 0.03, 0.02), fres * 0.6) * (0.8 + 0.4 * rip), dread);
        // her faces under the surface, drifting, warped by the ripples
        vec2 fq = fract(vW.xz / vec2(14.0, 10.0) + vec2(time * 0.01, 0.0) + rip * 0.04);
        vec2 cell = floor(vW.xz / vec2(14.0, 10.0) + vec2(time * 0.01, 0.0));
        float on = step(0.6, sh(cell));
        vec3 f = texture2D(tFace, vec2(fq.x, fq.y)).rgb; vec2 e = min(fq, 1.0 - fq);
        float fk = (1.0 - dot(f, vec3(0.3, 0.55, 0.15))) * smoothstep(0.0, 0.2, min(e.x, e.y)) * on * faces * smoothstep(160.0, 20.0, dist);
        c = mix(c, c * 0.25 + vec3(0.2, 0.0, 0.0) * dread, fk);
        // into the haze with distance (as the land is)
        float fog = 1.0 - exp(-pow(dist * 0.0011, 2.0));
        c = mix(c, haze * mix(vec3(1.0), vec3(0.18, 0.08, 0.06), dread), fog);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  water.position.y = WL; water.frustumCulled = false;
  root.add(water);

  // ----- the loggia -----
  const stoneM = peelable(new THREE.MeshStandardMaterial({ map: stoneTex(R, '#b6a888'), roughness: 0.85, vertexColors: true }), 'stone', 1.2);
  const floorM = peelable(new THREE.MeshStandardMaterial({ map: stoneTex(R, '#a39478'), roughness: 0.8, vertexColors: true }), 'floor', 1.2);
  const plasterM = peelable(new THREE.MeshStandardMaterial({ map: plasterTex(R), roughness: 0.95, vertexColors: true }), 'plaster', 1.2);
  const woodM = peelable(new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.75, vertexColors: true }), 'wood', 1);
  // a box (x0..x1, y0..y1, z0..z1), its uvs in metres, shaded darker toward the back and up under the roof (no shadows
  // out here: the shade's in the colour)
  const boxes = { stone: [], floor: [], plaster: [], wood: [] };
  const shadeAt = (x, y, z) => 1 - 0.14 * sstep(-4, 3.2, z) * sstep(-1, 5, y) - 0.1 * sstep(3, 5.2, y);
  function bx(list, x0, x1, y0, y1, z0, z1, uvk = 1, drop = []) {
    let g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (drop.length) {   // faces that can't be seen (in the floor, against a wall): left out
      const keep = [0, 1, 2, 3, 4, 5].filter((f) => !drop.includes(f)), idx = g.index.array, ni = [];
      for (const f of keep) for (let k = 0; k < 6; k++) ni.push(idx[f * 6 + k]);
      g.setIndex(ni); g = g.toNonIndexed();
    }
    world(g, uvk); list.push(g);
  }
  // uvs from world position (planar by the face's normal), colour from where it is
  function world(g, uvk = 1) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      if (ay > 0.5) uv.setXY(i, x * uvk, z * uvk); else if (ax > 0.5) uv.setXY(i, z * uvk, y * uvk); else uv.setXY(i, x * uvk, y * uvk);
      const k = shadeAt(x, y, z); c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k * 0.97;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }
  const { x: LX, zf: ZF, zb: ZB, wall: T, h: LH } = LOGGIA;
  // the floor (on the podium, which goes down out of sight to the rock), its slabs; the podium's sides
  bx(boxes.floor, -LX - T - 0.1, LX + T + 0.1, -0.3, 0, ZF - 0.5, ZB + T, 0.6);
  bx(boxes.stone, -LX - T - 0.1, LX + T + 0.1, -14, -0.3, ZF - 0.5, ZB + T, 0.4, [2]);
  // the back wall, the side walls round their doorways
  bx(boxes.plaster, -LX - T, LX + T, 0, LH, ZB, ZB + T, 0.4, [3]);
  const DZ0 = -1.1, DZ1 = 0.5, DH = 2.9;
  const AR = (DZ1 - DZ0) / 2, AC = (DZ0 + DZ1) / 2, AY = DH - AR;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -LX - T : LX, x1 = s < 0 ? -LX : LX + T;
    // the wall, its round-headed doorway cut through it (a shape in z, y, extruded across x)
    const sh = new THREE.Shape(); sh.moveTo(ZF - 0.4, 0); sh.lineTo(ZB, 0); sh.lineTo(ZB, LH); sh.lineTo(ZF - 0.4, LH); sh.closePath();
    const hole = new THREE.Path(); hole.moveTo(DZ0, 0); hole.lineTo(DZ0, AY); hole.absarc(AC, AY, AR, Math.PI, 0, true); hole.lineTo(DZ1, 0); hole.closePath();
    sh.holes.push(hole);
    const wg = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 24 });
    // (the shape's x is z: turned, not mirrored, so it runs along z, its depth back across from x1 to x0)
    wg.rotateY(-Math.PI / 2).translate(x1, 0, 0);
    // drop the faces on the floor (its underside)
    const ng = wg.toNonIndexed(), pa = ng.attributes.position, keep = [];
    for (let t = 0; t < pa.count; t += 3) { if (pa.getY(t) < 0.001 && pa.getY(t + 1) < 0.001 && pa.getY(t + 2) < 0.001) continue; keep.push(t); }
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) { const src = ng.attributes[name], sz = src.itemSize, arr = new Float32Array(keep.length * 3 * sz); keep.forEach((t, j) => arr.set(src.array.subarray(t * sz, t * sz + 3 * sz), j * 3 * sz)); out.setAttribute(name, new THREE.BufferAttribute(arr, sz)); }
    world(out, 0.4); boxes.plaster.push(out);
    // the stone frame round the doorway: jambs and a keystone, proud of the wall inside
    const xi = s < 0 ? -LX : LX, xo = xi - s * 0.05;
    bx(boxes.stone, Math.min(xi, xo), Math.max(xi, xo), 0, AY, DZ0 - 0.16, DZ0, 0.8, [3]);
    bx(boxes.stone, Math.min(xi, xo), Math.max(xi, xo), 0, AY, DZ1, DZ1 + 0.16, 0.8, [3]);
    bx(boxes.stone, Math.min(xi, xo), Math.max(xi, xo), DH - 0.02, DH + 0.24, AC - 0.12, AC + 0.12, 0.8);
  }
  // the parapet along the front, its coping; the columns standing on it; the beam they carry
  const PH = 0.95;
  bx(boxes.stone, -LX, LX, 0, PH - 0.08, ZF - 0.4, ZF, 1.6, [3]);
  bx(boxes.stone, -LX - 0.05, LX + 0.05, PH - 0.08, PH, ZF - 0.46, ZF + 0.06, 0.8, [3]);
  const colG = (() => {   // a column: a moulded base (the painting's dark round bases), a tapering shaft, a plain capital
    const pts = [];
    const prof = [[0.27, 0], [0.27, 0.06], [0.24, 0.08], [0.255, 0.13], [0.21, 0.17], [0.19, 0.22], [0.175, 3.0], [0.16, 3.2], [0.19, 3.26], [0.25, 3.34], [0.27, 3.43], [0.27, 3.55], [0.0, 3.55]];
    for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(pts, 20);
  })();
  const colTop = PH, beamY = colTop + 3.55;
  for (const x of [-5, -2, 2, 5]) { const g = colG.clone().translate(x, colTop, ZF - 0.2); world(g, 1); boxes.stone.push(g.toNonIndexed()); }
  bx(boxes.stone, -LX, LX, beamY, LH, ZF - 0.5, ZF + 0.1, 0.8);
  // the ceiling: a plaster vault's flat underside, and the beams across under it (front to back)
  bx(boxes.plaster, -LX - T, LX + T, LH, LH + 0.3, ZF - 0.5, ZB + T, 0.4, [3]);
  for (let x = -5.6; x <= 5.61; x += 1.4) bx(boxes.wood, x - 0.11, x + 0.11, LH - 0.24, LH - 0.004, ZF + 0.104, ZB - 0.004, 1, [2]);
  // the landings and the stairs down the outside, a low wall along each stair's outer edge
  for (const s of [-1, 1]) {
    const ox = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    const [lx0, lx1] = ox(LX + T + 0.1, STAIR.x1);
    bx(boxes.floor, lx0, lx1, -0.3, 0, STAIR.z0, DZ1 + 0.4, 0.6);
    bx(boxes.stone, lx0, lx1, -14, -0.3, STAIR.z0, DZ1 + 0.4, 0.4, [2]);
    const n = 40, run = (STAIR.z0 - STAIR.z1) / n, rise = -STAIR.y1 / n;
    for (let k = 0; k < n; k++) {
      const top = -rise * (k + 1) + rise * 0.5, z1 = STAIR.z0 - run * k, z0 = z1 - run;
      const [x0, x1] = ox(STAIR.x0 + 0.05, STAIR.x1);
      bx(boxes.stone, x0, x1, -14, top, z0, z1, 0.9, [2]);
    }
    const [wx0, wx1] = ox(STAIR.x1, STAIR.x1 + 0.3);
    bx(boxes.stone, wx0, wx1, -14, 1.0, STAIR.z1 - 0.3, DZ1 + 0.7, 0.8, [3]);
    const [bx0, bx1] = ox(LX + T + 0.1, STAIR.x1);
    bx(boxes.stone, bx0, bx1, 0, 1.0, DZ1 + 0.4, DZ1 + 0.7, 0.8, [3]);
    // the stair's inner edge, over the drop in front of the podium: a low wall
    const [ix0, ix1] = ox(STAIR.x0, STAIR.x0 + 0.3);   // (its face 5 cm proud of the steps' ends, its foot past the last)
    bx(boxes.stone, ix0, ix1, -14, 0.9, STAIR.z1 - 0.3, -4.6, 0.8, [3]);
  }
  const solid = [];   // (what she can't be seen through: lisa.js)
  for (const [k, m] of [['stone', stoneM], ['floor', floorM], ['plaster', plasterM], ['wood', woodM]]) {
    const g = mergeGeometries(boxes[k].map((q) => (q.index ? q.toNonIndexed() : q)));
    const o = new THREE.Mesh(g, m); root.add(o); solid.push(o);
  }

  // ----- the bridge: three arches of warm stone over the river, a parapet each side -----
  {
    const B = BRIDGE, parts = [];
    const span = B.z1 - B.z0, deck = B.deck, under = WL - 4;
    const shape = new THREE.Shape(); shape.moveTo(B.z0 - 1, under); shape.lineTo(B.z1 + 1, under); shape.lineTo(B.z1 + 1, deck); shape.lineTo(B.z0 - 1, deck); shape.closePath();
    for (let k = 0; k < 3; k++) {
      const c = B.z0 + span * (k + 0.5) / 3, r = span / 3 * 0.38, hole = new THREE.Path();
      hole.moveTo(c - r, under + 0.01); hole.lineTo(c - r, deck - 2.4 - r); hole.absarc(c, deck - 2.4 - r, r, Math.PI, 0, true); hole.lineTo(c + r, under + 0.01); hole.closePath();
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: B.w, bevelEnabled: false, curveSegments: 10 });
    g.rotateY(Math.PI / 2).translate(B.x - B.w / 2, 0, 0);
    world(g, 0.8); parts.push(g.toNonIndexed());
    for (const s of [-1, 1]) { const q = new THREE.BoxGeometry(0.3, 0.9, span + 1.6).translate(B.x + s * (B.w / 2 - 0.15), deck + 0.45 + 0.004, (B.z0 + B.z1) / 2); world(q, 0.8); parts.push(q.toNonIndexed()); }
    const bridge = new THREE.Mesh(mergeGeometries(parts), stoneM); root.add(bridge); solid.push(bridge);
  }

  // ----- boulders and scrub about the hillside (placed by hashing round the valley) -----
  const rockG = (() => { const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.8 + 0.35 * vn(x * 2 + 5, z * 2 + y * 3); p.setXYZ(i, x * k, y * k * 0.7, z * k); } g.computeVertexNormals(); return g; })();
  const rockM = peelable(new THREE.MeshStandardMaterial({ color: '#86806a', roughness: 0.9 }), 'rock', 1.5);
  const rocks = new THREE.InstancedMesh(rockG, rockM, 140), bushG = new THREE.IcosahedronGeometry(1, 1);
  const bushes = new THREE.InstancedMesh(bushG, peelable(new THREE.MeshStandardMaterial({ color: '#4f5630', roughness: 1, flatShading: true }), 'bush', 1), 260);
  const cols = [];
  let nr = 0, nb = 0;
  const clear = (x, z) => { for (const R2 of ROADS) if (along(R2, x, z)[0] < 4) return false; return along(RIVER, x, z)[0] > 10 && !(Math.abs(x) < 10 && z > -15) && Math.hypot(x - BRIDGE.x, z + 89) > 14; };
  for (let k = 0; k < 2400 && (nr < 140 || nb < 260); k++) {
    const x = (h2(k, 1) - 0.5) * 300, z = -10 - h2(k, 2) * 220;
    if (!clear(x, z)) continue;
    const y = terrain(x, z);
    if (y < WL + 0.5) continue;
    if (h2(k, 3) < 0.35 && nr < 140) {
      const s = 0.5 + h2(k, 4) ** 2 * 2.6;
      M4.compose(P3.set(x, y + s * 0.15, z), Q.setFromEuler(E.set(h2(k, 5), h2(k, 6) * 6, h2(k, 7))), S3.set(s, s, s));
      rocks.setMatrixAt(nr++, M4);
      if (s > 1.1) cols.push({ minX: x - s * 0.75, maxX: x + s * 0.75, minZ: z - s * 0.75, maxZ: z + s * 0.75 });
    } else if (nb < 260) {
      const s = 0.4 + h2(k, 8) * 1.1;
      M4.compose(P3.set(x, y + s * 0.3, z), Q.setFromEuler(E.set(0, h2(k, 9) * 6, 0)), S3.set(s, s * 0.7, s));
      bushes.setMatrixAt(nb++, M4);
    }
  }
  rocks.count = nr; bushes.count = nb;
  root.add(rocks, bushes);

  // ----- her chair: a dark wooden armchair, a little in front of the frame, facing you -----
  const chair = new THREE.Group();
  {
    const P = [], wd = (w, h, d, x, y, z) => P.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    wd(0.56, 0.06, 0.52, 0, 0.46, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wd(0.05, 0.46, 0.05, sx * 0.24, 0.23, sz * 0.22);
    wd(0.56, 0.62, 0.05, 0, 0.8, -0.235); wd(0.05, 0.08, 0.5, -0.28, 0.72, 0); wd(0.05, 0.08, 0.5, 0.28, 0.72, 0);
    for (const sx of [-1, 1]) { const t = new THREE.CylinderGeometry(0.03, 0.035, 0.24, 8).translate(sx * 0.28, 0.58, 0.22); P.push(t.toNonIndexed()); }
    const geo = mergeGeometries(P.map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }));
    const m = new THREE.Mesh(geo, peelable(new THREE.MeshStandardMaterial({ color: '#3a2414', roughness: 0.6 }), 'chair', 1));
    chair.add(m);
  }
  chair.position.set(1.3, 0, -2.6); chair.rotation.y = -0.45;   // (ahead and to one side, its seat turned toward you coming in)
  root.add(chair);

  // ----- the light: a soft hemisphere off the haze and the land, a low warm sun from the upper left, a little fill -----
  const hemi = new THREE.HemisphereLight('#c7d2bc', '#6b5838', 1.1);
  const sun = new THREE.DirectionalLight('#ffe2b0', 1.7); sun.position.set(-0.6, 0.8, 0.5).multiplyScalar(60);
  const fill = new THREE.DirectionalLight('#b8c4b4', 0.75); fill.position.set(0.5, 0.4, -1).multiplyScalar(60);
  const red = new THREE.DirectionalLight('#ff4a26', 0); red.position.set(0.3, 0.15, -1).multiplyScalar(60);   // (dread: lit from under, red)
  S.add(hemi, sun, fill, red);
  fl.hemi = hemi;
  fl.look = { exposure: 0.95, hemi: 1.1, sky: new THREE.Color('#c7d2bc'), ground: new THREE.Color('#6b5838'), env: 0.1, bloom: 0.8, grade: 1.0, lights: [[sun, 1.7], [fill, 0.75], [red, 0]], aoSkip1: true };
  const look0 = { exposure: 0.95, hemi: 1.1, sun: 1.7, fill: 0.75 };

  // ----- the colliders: the loggia's walls and parapet, the podium, the landings and stairs, the bridge, the boulders -----
  const box2 = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
  cols.push(
    box2(-LX - T, LX + T, ZB, ZB + T + 0.4),   // the back wall
    box2(-LX, LX, ZF - 0.5, ZF),   // the parapet, the podium's front under it
    box2(-LX - T - 0.1, -LX, ZF - 0.5, DZ0), box2(-LX - T - 0.1, -LX, DZ1, ZB + T),   // the side walls round their doorways
    box2(LX, LX + T + 0.1, ZF - 0.5, DZ0), box2(LX, LX + T + 0.1, DZ1, ZB + T),
  );
  for (const s of [-1, 1]) {
    const ox = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    const [a0, a1] = ox(STAIR.x1, STAIR.x1 + 0.3); cols.push(box2(a0, a1, STAIR.z1 - 0.3, DZ1 + 0.7));   // the outer wall
    const [b0, b1] = ox(LX + T + 0.1, STAIR.x1); cols.push(box2(b0, b1, DZ1 + 0.4, DZ1 + 0.7));   // the landing's back
    const [c0, c1] = ox(STAIR.x0, STAIR.x0 + 0.3); cols.push(box2(c0, c1, STAIR.z1 - 0.3, -4.6));   // the stair's inner wall
    const [d0, d1] = ox(LX + T + 0.1 - 0.4, STAIR.x0 + 0.05); cols.push(box2(d0, d1, -4.6, STAIR.z0));   // the podium's side along the stair
  }
  for (const s of [-1, 1]) cols.push(box2(BRIDGE.x + s * BRIDGE.w / 2 - 0.15, BRIDGE.x + s * BRIDGE.w / 2 + 0.15, BRIDGE.z0 - 0.8, BRIDGE.z1 + 0.8));
  cols.push(box2(-60, -LX - T - 0.1, 3.6, 12), box2(LX + T + 0.1, 60, 3.6, 12));   // the hill behind, too steep to climb
  const chairCol = box2(1.0, 1.6, -2.9, -2.3);
  cols.push(chairCol);

  // ----- the state the floor drives -----
  const fogC = new THREE.Color(), SKY0 = new THREE.Color('#c7d2bc'), SKY1 = new THREE.Color('#5a1a12'), GR0 = new THREE.Color('#6b5838'), GR1 = new THREE.Color('#1a0806');
  return {
    root, U, time, dread, faces, peel: peelU.peel, chair, chairCol, cols, rocks, look0, sun, fill, red, hemi, solid, setLand,
    /** each draw: where it's seen from, and the horror's levels */
    view(p, t) {
      time.value = t;
      const d = dread.value;
      fogC.copy(HAZE).lerp(SMOKE, d);
      S.fog.color.copy(fogC); S.background.copy(fogC);
      S.fog.density = FOG + d * 0.003;
      fl.look.lights[0][1] = look0.sun * (1 - 0.55 * d); fl.look.lights[1][1] = look0.fill * (1 - 0.3 * d); fl.look.lights[2][1] = 2.6 * d;
      fl.look.hemi = look0.hemi * (1 - 0.25 * d);
      fl.look.sky.copy(SKY0).lerp(SKY1, d); fl.look.ground.copy(GR0).lerp(GR1, d);
      void p;
    },
  };
}
