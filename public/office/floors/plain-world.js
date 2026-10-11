// What's on the Plain (floors/plain.js): an ochre dust plain that doesn't end, under a sooty amber haze; a city of
// spires burning far off (its windows flickering, embers going up off it, smoke), always about as far away however far
// you walk toward it; a black square hanging in the sky; and things that shouldn't be out here, on their own: a
// streetlamp, lit; a little table with a chest on it; a gazebo rotting where it stands, strands hanging off it and
// stirring; planks, rags, rocks, sticks and bones. Fog hides where any of it stops.
// Everything that's about you (the sky, the ground, the dust in the air, the debris round you) is put where it's wanted by
// view(p): the camera drawing it, yours or (through the painting from B3) the portal's, so it's the same either way.
// Built under the Plain's own random stream; placed by hashing, so the same spot always has the same things on it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas } from '../util.js';

export const HAZE = new THREE.Color('#b48348');
const CHUNK = 22, REACH = 4;   // the debris: per cell of CHUNK m, out to REACH cells round you

// A hash of three integers to [0, 1) (restricted.js's).
export function h3(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const colored = (g, c) => {
  g = g.index ? g.toNonIndexed() : g;
  const col = new THREE.Color(c), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; }
  return g.setAttribute('color', new THREE.BufferAttribute(a, 3));
};
// a merged mesh of [geometry, colour] parts (one draw call), uvs dropped
const merged = (parts, m) => new THREE.Mesh(mergeGeometries(parts.map(([g, c]) => { const n = colored(g, c); n.deleteAttribute('uv'); return n; })), m);
// a tube from a to b, radius r0 at a and r1 at b
function limb(a, b, r0, r1, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r1, r0, d.length(), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildWorld(pl, R) {
  const S = pl.scene, root = new THREE.Group();
  S.add(root);
  S.background = HAZE.clone(); S.fog = new THREE.FogExp2(HAZE.clone(), 0.0145);
  const time = { value: 0 };
  // follows whichever camera draws it (centred on it as it's drawn: the sky, the dust, the square)
  const onCam = (m, fn) => { m.frustumCulled = false; m.onBeforeRender = (r, s, cam) => { fn(m, cam.matrixWorld.elements); m.updateMatrixWorld(); }; return m; };

  // ----- the sky: soot overhead, the haze thick and bright low down, brightest over the fire; smoke drifting -----
  const sky = onCam(new THREE.Mesh(new THREE.SphereGeometry(3800, 32, 16), new THREE.ShaderMaterial({
    uniforms: { time, haze: { value: HAZE } }, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; uniform vec3 haze; varying vec3 vD;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float nn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
      float fb(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += nn(p) * a; p = p * 2.03 + 1.7; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vD); float up = max(d.y, 0.0);
        vec3 soot = vec3(0.08, 0.05, 0.03), c = mix(haze, soot, smoothstep(0.0, 0.6, pow(up, 0.6)));
        float fire = pow(max(0.0, -d.z), 3.0) * exp(-up * 9.0);   // over the city (toward -z), low
        c += vec3(0.55, 0.22, 0.05) * fire * 0.8;
        vec2 p = d.xz / (0.25 + up) * 2.5 + vec2(time * 0.006, time * 0.011);
        float sm = fb(p) * 0.7 + fb(p * 2.7 - time * 0.01) * 0.3;
        c *= mix(1.0, 0.62 + sm * 0.55, smoothstep(0.02, 0.35, up));
        c = mix(c, haze, smoothstep(0.08, 0.0, up));   // into the fog at the horizon
        gl_FragColor = vec4(c, 1.0);
      }`,
  })), (m, e) => m.position.set(e[12], e[13], e[14]));
  sky.renderOrder = -2; root.add(sky);

  // ----- the black square: high up and to the left of the city, tilted, darker than anything else -----
  const SQ = V(-0.42, 0.3, -0.86).normalize();
  const square = onCam(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#0b0908', fog: false, depthWrite: false })),
    (m, e) => m.position.set(e[12] + SQ.x * 1500, e[13] + SQ.y * 1500, e[14] + SQ.z * 1500));
  square.scale.setScalar(210); square.lookAt(SQ.clone().negate()); square.rotateZ(0.22); square.renderOrder = -1;
  root.add(square);

  // ----- the ground: dust, pebbles, cracks; slow broad patches darker and paler over it -----
  const dust = makeCanvas(512, 512), dc = dust.ctx, img = dc.createImageData(512, 512);
  for (let k = 0; k < img.data.length; k += 4) { const v = (R() - 0.5) * 30; img.data[k] = 184 + v; img.data[k + 1] = 160 + v * 0.9; img.data[k + 2] = 98 + v * 0.6; img.data[k + 3] = 255; }
  dc.putImageData(img, 0, 0);
  for (let k = 0; k < 900; k++) { const r = 0.6 + R() * 2.6; dc.fillStyle = `rgba(${R() < 0.5 ? '70,46,22' : '214,180,124'},${0.25 + R() * 0.4})`; dc.beginPath(); dc.ellipse(R() * 512, R() * 512, r, r * (0.6 + R() * 0.4), R() * 3, 0, 7); dc.fill(); }
  for (let k = 0; k < 26; k++) {   // cracks
    let x = R() * 512, y = R() * 512; dc.strokeStyle = `rgba(60,38,18,${0.2 + R() * 0.3})`; dc.lineWidth = 0.6 + R(); dc.beginPath(); dc.moveTo(x, y);
    for (let s = 0; s < 8; s++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; dc.lineTo(x, y); }
    dc.stroke();
  }
  for (let k = 0; k < 40; k++) { const g = dc.createRadialGradient(0, 0, 0, 0, 0, 40); g.addColorStop(0, `rgba(${R() < 0.5 ? '90,60,30' : '200,160,100'},.12)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    dc.save(); dc.translate(R() * 512, R() * 512); dc.fillStyle = g; dc.fillRect(-40, -40, 80, 80); dc.restore(); }
  dust.tex.wrapS = dust.tex.wrapT = THREE.RepeatWrapping; dust.tex.repeat.set(600 / 7, 600 / 7); dust.tex.needsUpdate = true;
  const groundM = new THREE.MeshStandardMaterial({ map: dust.tex, roughness: 1, color: '#ffffff' });
  groundM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vGW;
      float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { float b = gn(vGW * 0.035) * 0.6 + gn(vGW * 0.11) * 0.3 + gn(vGW * 0.5) * 0.1;
        float st = gn(vec2(vGW.x * 0.02 + vGW.y * 0.06, vGW.y * 0.01));
        diffuseColor.rgb *= mix(0.62, 1.12, b) * mix(0.9, 1.05, st);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.62, 0.45), smoothstep(0.55, 0.8, gn(vGW * 0.07 + 9.0)) * 0.5); }`);
  };
  groundM.customProgramCacheKey = () => 'plain-ground';
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), groundM);
  ground.receiveShadow = false; root.add(ground);

  // ----- the city: spires, towers, domes, a wall of them across the horizon; two ranks, the far one paler -----
  const city = new THREE.Group(); root.add(city);
  const cityParts = [];
  const silhouette = (x, z, s, k) => {   // one building: a body, then a spire, a dome or a cluster of pinnacles
    const w = (10 + R() * 24) * s, d = (10 + R() * 18) * s, h = (20 + R() * 62) * s, dark = new THREE.Color('#3b2414').lerp(HAZE, k), lit = new THREE.Color('#a4502a').lerp(HAZE, k * 0.6);
    const sink = 2 + R() * 4, body = new THREE.BoxGeometry(w, h + sink, d).translate(x, (h - sink) / 2, z);   // (its foot sunk out of sight, each to its own depth)
    // lit from below by the fire: its colour warmer and brighter toward its foot
    const P = body.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
    for (let i = 0; i < P.count; i++) { c.copy(lit).lerp(dark, Math.min(1, Math.max(0, P.getY(i)) / (h * 0.6))); col.set([c.r, c.g, c.b], i * 3); }
    body.setAttribute('color', new THREE.BufferAttribute(col, 3)); body.deleteAttribute('uv');
    cityParts.push(body.toNonIndexed());
    const r = R(), top = r < 0.5 ? new THREE.ConeGeometry(w * (0.3 + R() * 0.25), (25 + R() * 70) * s, 4 + Math.floor(R() * 3)) : r < 0.75 ? new THREE.SphereGeometry(w * 0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2) : null;
    if (top) { top.translate(x, h + (r < 0.5 ? top.parameters.height / 2 : 0), z); cityParts.push(colored(top, dark)); }
    else for (let k2 = 0; k2 < 4; k2++) { const ph = (15 + R() * 35) * s, p = new THREE.ConeGeometry(2.2 * s, ph, 4).translate(x + (R() - 0.5) * w, h + ph / 2, z + (R() - 0.5) * d); cityParts.push(colored(p, dark)); }
    return { x, z, w, h };
  };
  const towers = [];
  for (let i = 0; i < 70; i++) towers.push(silhouette((R() - 0.5) * 1100, -430 - R() * 80, 1, 0.58));
  for (let i = 0; i < 40; i++) silhouette((R() - 0.5) * 1500, -620 - R() * 120, 1.3, 0.78);
  for (const g of cityParts) g.deleteAttribute('uv');
  const cityMesh = new THREE.Mesh(mergeGeometries(cityParts.map((g) => (g.index ? g.toNonIndexed() : g))), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  city.add(cityMesh);
  // its windows, burning: points on the near rank's faces toward you, each flickering at its own rate
  const wins = [], wph = [];
  for (const t of towers) for (let k = 0; k < 12; k++) { wins.push(t.x + (R() - 0.5) * t.w * 0.85, t.h * (0.05 + R() * R() * 0.8), t.z + 12); wph.push(R() * 100); }
  const winG = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wins, 3)).setAttribute('ph', new THREE.Float32BufferAttribute(wph, 1));
  const winM = new THREE.ShaderMaterial({ uniforms: { time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float time; attribute float ph; varying float vB;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float f = 0.55 + 0.45 * sin(time * (1.5 + fract(ph) * 4.0) + ph) * sin(time * 0.7 + ph * 3.1);
        vB = f * step(0.25, fract(sin(floor(time * 0.3 + ph) * 12.9898) * 43758.5));
        gl_PointSize = clamp(700.0 / -mv.z, 1.0, 2.5); }`,
    fragmentShader: 'varying float vB; void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)); gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * vB * a * 1.2, 1.0); }' });
  const windows = new THREE.Points(winG, winM); windows.frustumCulled = false; city.add(windows);
  // the fire along its foot, and the glow off it in the haze
  const glowT = makeCanvas(64, 256), gc = glowT.ctx, gg = gc.createLinearGradient(0, 256, 0, 0);
  gg.addColorStop(0, 'rgba(255,140,50,1)'); gg.addColorStop(0.25, 'rgba(230,100,40,.55)'); gg.addColorStop(1, 'rgba(160,70,30,0)'); gc.fillStyle = gg; gc.fillRect(0, 0, 64, 256); glowT.tex.needsUpdate = true;
  const glowM = new THREE.MeshBasicMaterial({ map: glowT.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.3 });
  for (const [z, w, h] of [[-415, 1300, 70], [-600, 1700, 120]]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowM); g.position.set(0, h / 2 - 4, z); city.add(g); }
  // smoke going up off it, leaning with the wind
  const smokeM = new THREE.ShaderMaterial({ uniforms: { time }, transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; varying vec2 vU;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float nn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
      void main() { vec2 p = vec2(vU.x * 3.0 + vU.y * 1.2, vU.y * 6.0 - time * 0.05);
        float n = nn(p) * 0.6 + nn(p * 2.3) * 0.4, w = smoothstep(0.5, 0.15, abs(vU.x - 0.5 - vU.y * 0.18)) * smoothstep(0.0, 0.1, vU.y) * smoothstep(1.0, 0.5, vU.y);
        gl_FragColor = vec4(vec3(0.16, 0.1, 0.06), w * n * 0.55); }` });
  for (let i = 0; i < 9; i++) { const t = towers[Math.floor(R() * towers.length)], s = new THREE.Mesh(new THREE.PlaneGeometry(160, 520), smokeM); s.position.set(t.x, 230, t.z - 20 - i); city.add(s); }
  // embers going up off it
  const em = [], eph = [];
  for (let i = 0; i < 700; i++) { em.push((R() - 0.5) * 1100, R() * 300, -420 - R() * 60); eph.push(R()); }
  const emG = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(em, 3)).setAttribute('ph', new THREE.Float32BufferAttribute(eph, 1));
  const emM = new THREE.ShaderMaterial({ uniforms: { time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float time; attribute float ph; varying float vA;
      void main() { vec3 p = position; float y = mod(p.y + time * (6.0 + ph * 10.0), 320.0); p.y = y; p.x += sin(time * 0.3 + ph * 30.0) * 12.0 + y * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = (1.0 - y / 320.0) * (0.5 + 0.5 * sin(time * 3.0 + ph * 60.0));
        gl_PointSize = clamp(500.0 / -mv.z, 1.0, 2.0); }`,
    fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(vec3(1.0, 0.45, 0.12) * vA * 1.4, 1.0); }' });
  const embers = new THREE.Points(emG, emM); embers.frustumCulled = false; city.add(embers);

  // ----- in the air round you: ash drifting down, now and then an ember -----
  const ash = [], aph = [];
  for (let i = 0; i < 520; i++) { ash.push(R() * 36, R() * 14, R() * 36); aph.push(R()); }
  const airM = (warm) => new THREE.ShaderMaterial({ uniforms: { time }, transparent: true, depthWrite: false, fog: false, blending: warm ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `uniform float time; attribute float ph; varying float vA;
      void main() {
        vec3 p = position + vec3(time * (${warm ? '0.9' : '0.6'} + ph * 0.5), time * ${warm ? '0.5' : '-0.25'} * (0.5 + ph), time * 0.3);
        p = mod(p - cameraPosition + 18.0, vec3(36.0, 14.0, 36.0)) + cameraPosition - vec3(18.0, 5.0, 18.0);
        p.x += sin(time * 0.7 + ph * 40.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float d = length(mv.xyz); vA = smoothstep(18.0, 6.0, d) * smoothstep(0.3, 1.2, d)${warm ? ' * (0.5 + 0.5 * sin(time * 4.0 + ph * 80.0))' : ''};
        gl_PointSize = clamp(${warm ? '50.0' : '80.0'} / d, 1.0, ${warm ? '4.0' : '6.0'}); }`,
    fragmentShader: `varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.2, length(q)) * vA;
      gl_FragColor = vec4(${warm ? 'vec3(1.0, 0.5, 0.15) * a * 1.5, 1.0' : 'vec3(0.3, 0.27, 0.24), a * 0.6'}); }` });
  const air = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ash, 3)).setAttribute('ph', new THREE.Float32BufferAttribute(aph, 1)), airM(false));
  const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ash.slice(0, 180), 3)).setAttribute('ph', new THREE.Float32BufferAttribute(aph.slice(0, 60), 1)), airM(true));
  air.frustumCulled = sparks.frustumCulled = false; root.add(air, sparks);

  // ----- veils of dust low over the ground, drifting: big soft sheets round you, always turned to you -----
  const veilM = new THREE.ShaderMaterial({ uniforms: { time, haze: { value: HAZE } }, transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec2 vU; varying vec3 vW; void main() { vU = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time; uniform vec3 haze; varying vec2 vU; varying vec3 vW;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float nn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
      void main() { vec2 p = vec2(vW.x * 0.05 + vW.z * 0.03 + time * 0.04, vU.y * 2.0 + time * 0.01);
        float n = nn(p) * 0.6 + nn(p * 2.7 + 3.0) * 0.4, e = smoothstep(0.0, 0.25, vU.x) * smoothstep(1.0, 0.75, vU.x) * smoothstep(1.0, 0.0, vU.y);
        float near = smoothstep(4.0, 14.0, distance(vW, cameraPosition));
        gl_FragColor = vec4(haze * 1.04, n * e * near * 0.32); }` });
  const veils = [];
  for (let i = 0; i < 7; i++) { const v = new THREE.Mesh(new THREE.PlaneGeometry(70, 9).translate(0, 4.5, 0), veilM); v.frustumCulled = false; v.userData.a = i / 7 * Math.PI * 2 + R() * 0.6; v.userData.d = 22 + R() * 40; veils.push(v); root.add(v); }

  // ----- the things out here -----
  const mStd = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const shadowT = makeCanvas(64, 64), sc2 = shadowT.ctx, sg = sc2.createRadialGradient(32, 32, 2, 32, 32, 31);
  sg.addColorStop(0, 'rgba(30,18,8,.55)'); sg.addColorStop(1, 'rgba(30,18,8,0)'); sc2.fillStyle = sg; sc2.fillRect(0, 0, 64, 64); shadowT.tex.needsUpdate = true;
  const shadowM = new THREE.MeshBasicMaterial({ map: shadowT.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const blob = (parent, w, d, x = 0, z = 0) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), shadowM); s.position.set(x, 0.012, z); parent.add(s); return s; };

  // The streetlamp: a thin iron post, leaning a little, a lantern hung off its arm, lit
  function lamp() {
    const g = new THREE.Group(), iron = '#1c1612', P = [];
    P.push([limb(V(0, -0.05, 0), V(0.05, 4.3, 0), 0.07, 0.045, 8), iron], [new THREE.CylinderGeometry(0.13, 0.16, 0.5, 8).translate(0, 0.2, 0), iron]);
    P.push([limb(V(0.05, 4.25, 0), V(0.75, 4.45, 0), 0.03, 0.025), iron], [limb(V(0.75, 4.45, 0), V(0.75, 4.2, 0), 0.012, 0.012, 4), iron]);
    P.push([new THREE.ConeGeometry(0.2, 0.16, 6).translate(0.75, 4.15, 0), iron], [new THREE.CylinderGeometry(0.11, 0.14, 0.04, 6).translate(0.75, 3.84, 0), iron]);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push([limb(V(0.75 + Math.cos(a) * 0.15, 4.07, Math.sin(a) * 0.15), V(0.75 + Math.cos(a) * 0.12, 3.86, Math.sin(a) * 0.12), 0.01, 0.01, 3), iron]); }
    g.add(merged(P, mStd));
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.1, 0.2, 6).translate(0.75, 3.97, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.7, 0.75) }));
    g.add(glass);
    const glowS = makeCanvas(64, 64), c = glowS.ctx, gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,200,120,.9)'); gr.addColorStop(0.3, 'rgba(255,160,80,.25)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); glowS.tex.needsUpdate = true;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowS.tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.position.set(0.75, 3.97, 0); halo.scale.setScalar(2.2); g.add(halo);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowS.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, polygonOffset: true, polygonOffsetFactor: -4 }));
    pool.position.set(0.75, 0.02, 0); g.add(pool);
    g.rotation.z = -0.025;
    return g;
  }
  // The little table, a chest on it, its lid up a crack
  function table() {
    const g = new THREE.Group(), wd = '#5a2e1c', dk = '#2e1a10', P = [];
    P.push([new THREE.BoxGeometry(1.0, 0.05, 0.6).translate(0, 0.74, 0), wd]);
    for (const [x, z] of [[-0.44, -0.24], [0.44, -0.24], [-0.44, 0.24], [0.44, 0.24]]) P.push([new THREE.BoxGeometry(0.05, 0.71, 0.05).translate(x, 0.355, z), dk]);
    P.push([new THREE.BoxGeometry(0.86, 0.06, 0.03).translate(0, 0.66, 0.255), dk], [new THREE.BoxGeometry(0.86, 0.06, 0.03).translate(0, 0.66, -0.255), dk]);
    P.push([new THREE.BoxGeometry(0.56, 0.28, 0.34).translate(-0.1, 0.905, 0), '#6e3320']);
    for (const x of [-0.31, 0.11]) P.push([new THREE.BoxGeometry(0.03, 0.29, 0.35).translate(x, 0.906, 0), '#2a2420']);
    P.push([new THREE.BoxGeometry(0.57, 0.05, 0.35).rotateX(-0.12).translate(-0.1, 1.07, -0.012), '#5a2a1a']);
    return merged(P, mStd);
  }
  // The gazebo: six posts out of true, a ring beam, a sagging roof; dark growth heaped on it, strands hanging to the ground
  const swayU = { time };
  function gazebo() {
    const g = new THREE.Group(), wood = '#2a1d14', rot = '#18110c', P = [], RR = 2.1, H = 2.7;
    const post = [];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2, x = Math.cos(a) * RR, z = Math.sin(a) * RR, lean = (R() - 0.5) * 0.18;
      post.push(V(x + lean, H, z));
      P.push([limb(V(x, -0.05, z), V(x + lean, H, z), 0.075, 0.06, 6), wood]);
    }
    for (let k = 0; k < 6; k++) P.push([limb(post[k], post[(k + 1) % 6], 0.06, 0.06, 5), wood]);
    const roof = new THREE.ConeGeometry(RR + 0.5, 1.3, 6, 3, true).rotateY(Math.PI / 6).translate(0, H + 0.6, 0), rp = roof.attributes.position;
    for (let i = 0; i < rp.count; i++) { const y = rp.getY(i); rp.setY(i, y - Math.max(0, Math.hypot(rp.getX(i), rp.getZ(i)) - RR * 0.5) * 0.15 + (R() - 0.5) * 0.08); }   // sagging
    roof.computeVertexNormals(); P.push([roof, rot]);
    for (let k = 0; k < 9; k++) {   // the growth: lumps on the roof and up the posts
      const lump = new THREE.IcosahedronGeometry(0.3 + R() * 0.4, 1), lp = lump.attributes.position;
      for (let i = 0; i < lp.count; i++) lp.setXYZ(i, lp.getX(i) * (0.8 + R() * 0.4), lp.getY(i) * (0.6 + R() * 0.4), lp.getZ(i) * (0.8 + R() * 0.4));
      const a = R() * 6.28, r = R() * RR;
      lump.computeVertexNormals(); P.push([lump.translate(Math.cos(a) * r, H + 1.1 - r * 0.5, Math.sin(a) * r), rot]);
    }
    g.add(merged(P, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })));
    // the strands: thin, tapering, from the roof's edge and the beam, stirring
    const st = [];
    for (let k = 0; k < 70; k++) {
      const a = R() * Math.PI * 2, r = RR * (0.7 + R() * 0.55), top = H + 0.25 - (r - RR * 0.5) * 0.2, len = 0.6 + R() * (top - 0.1) * 0.95;
      const s = new THREE.CylinderGeometry(0.012 + R() * 0.02, 0.004, len, 4, 6).translate(Math.cos(a) * r, top - len / 2, Math.sin(a) * r);
      const sw = new Float32Array(s.attributes.position.count), ph = new Float32Array(s.attributes.position.count).fill(R() * 40);
      for (let i = 0; i < sw.length; i++) sw[i] = (top - s.attributes.position.getY(i)) / len;
      s.setAttribute('sway', new THREE.BufferAttribute(sw, 1)); s.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); s.deleteAttribute('uv');
      st.push(s);
    }
    const strandM = new THREE.MeshStandardMaterial({ color: '#1b130d', roughness: 0.8 });
    strandM.onBeforeCompile = (sh) => {
      sh.uniforms.time = swayU.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time; attribute float sway; attribute float ph;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat sw2 = sway * sway; transformed.x += sin(time * 0.9 + ph) * 0.12 * sw2 + sin(time * 2.3 + ph * 1.7) * 0.03 * sw2; transformed.z += cos(time * 0.7 + ph * 1.3) * 0.1 * sw2;');
    };
    strandM.customProgramCacheKey = () => 'plain-strand';
    g.add(new THREE.Mesh(mergeGeometries(st), strandM));
    blob(g, 6.5, 6.5);
    return g;
  }

  // Where they stand at first: as the painting has them, ahead of the frame (toward the city, -z), the lamp off to the
  // left, the table further on to the right, the gazebo off to the right; and in places further out, others the same.
  const marks = { lamp: lamp(), table: table(), gazebo: gazebo() };
  const fixed = [['lamp', -3.6, -38, 0.3], ['table', 3.0, -29, -0.35], ['gazebo', 10.5, -46, 0.4]];
  for (const [k, x, z, yaw] of fixed) { const m = marks[k]; m.position.set(x, 0, z); m.rotation.y = yaw; root.add(m); }
  blob(marks.table, 1.4, 1.0);
  const lampL = new THREE.PointLight('#ffb766', 0, 16, 1.6); lampL.position.set(-3.6 + 0.75, 3.7, -38); root.add(lampL);
  // the others: one kind a 160 m cell (hashed), the nearest few of each kind shown (copies of the same)
  const SUPER = 160, copies = { lamp: [], table: [], gazebo: [] };
  for (const k of Object.keys(copies)) for (let n = 0; n < 2; n++) { const c = marks[k].clone(); c.visible = false; root.add(c); copies[k].push(c); }
  function landmarks(px, pz) {
    const ci = Math.round(px / SUPER), cj = Math.round(pz / SUPER), cand = { lamp: [], table: [], gazebo: [] };
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      if (Math.abs(i) <= 0 && Math.abs(j) <= 0) continue;   // (the first cell's are the painting's)
      const r = h3(i, j, 91), kind = r < 0.22 ? 'lamp' : r < 0.4 ? 'table' : r < 0.52 ? 'gazebo' : null;
      if (!kind) continue;
      const x = (i + (h3(i, j, 92) - 0.5) * 0.6) * SUPER, z = (j + (h3(i, j, 93) - 0.5) * 0.6) * SUPER;
      cand[kind].push({ x, z, yaw: h3(i, j, 94) * 6.28, d: Math.hypot(x - px, z - pz) });
    }
    for (const k of Object.keys(copies)) {
      const list = cand[k].sort((a, b) => a.d - b.d);
      copies[k].forEach((c, n) => { const q = list[n]; c.visible = !!q && q.d < 220; if (q) { c.position.set(q.x, 0, q.z); c.rotation.y = q.yaw; } });
    }
  }

  // ----- debris: in cells round you, hashed, instanced (a draw call a kind) -----
  const kinds = [];
  function kind(geo, color, cap, rough = 0.9) {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough }), cap);
    m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(m);
    const k = { m, cap }; kinds.push(k); return k;
  }
  const rockG = new THREE.IcosahedronGeometry(1, 0); { const p = rockG.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.55); rockG.computeVertexNormals(); }
  const boneG = mergeGeometries([limb(V(-0.22, 0, 0), V(0.22, 0, 0), 0.02, 0.018, 6), new THREE.SphereGeometry(0.035, 6, 4).translate(-0.24, 0, 0), new THREE.SphereGeometry(0.03, 6, 4).translate(0.24, 0.005, 0.01)]
    .map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; })).translate(0, 0.02, 0);
  const skullG = (() => { const s = new THREE.SphereGeometry(0.1, 10, 8).scale(1, 0.85, 1.2).translate(0, 0.085, 0), j = new THREE.BoxGeometry(0.1, 0.04, 0.08).translate(0, 0.02, 0.1);
    return mergeGeometries([s.toNonIndexed(), j.toNonIndexed()].map((g) => { g.deleteAttribute('uv'); return g; })); })();
  const ribG = (() => { const parts = []; for (let k = 0; k < 5; k++) parts.push(new THREE.TorusGeometry(0.16 - k * 0.012, 0.009, 4, 10, Math.PI * 0.9).rotateY(Math.PI / 2).translate(k * 0.06, 0.0, 0).toNonIndexed());
    parts.push(limb(V(-0.03, 0.0, 0), V(0.3, 0.0, 0), 0.015, 0.012).toNonIndexed());
    return mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; })).rotateZ(-Math.PI / 2 + 0.25).translate(0, 0.0, 0); })();
  const plankG = new THREE.BoxGeometry(1.4, 0.04, 0.16).translate(0, 0.02, 0);
  const stickG = limb(V(0, -0.1, 0), V(0.05, 0.9, 0), 0.02, 0.008, 5);
  const ragG = (() => { const g = new THREE.PlaneGeometry(0.6, 0.45, 4, 3).rotateX(-Math.PI / 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, 0.015 + Math.abs(Math.sin(i * 1.7)) * 0.04); g.computeVertexNormals(); return g; })();
  const scrapG = new THREE.BoxGeometry(0.7, 0.012, 0.4).translate(0, 0.02, 0);
  const K = { rock: kind(rockG, '#6d5236', 260), bone: kind(boneG, '#cdbb98', 140, 0.7), skull: kind(skullG, '#d4c3a0', 30, 0.7), rib: kind(ribG, '#c4b08a', 40, 0.7),
    plank: kind(plankG, '#4a3626', 90), stick: kind(stickG, '#2e2219', 60), rag: kind(ragG, '#5a3f2c', 50), scrap: kind(scrapG, '#5c3a22', 40, 0.6) };
  K.rag.m.material.side = THREE.DoubleSide;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P3 = new THREE.Vector3(), S3 = new THREE.Vector3();
  let debrisAt = null;
  function debris(px, pz) {
    const ci = Math.floor(px / CHUNK), cj = Math.floor(pz / CHUNK);
    if (debrisAt && debrisAt[0] === ci && debrisAt[1] === cj) return;
    debrisAt = [ci, cj];
    for (const k of kinds) k.m.count = 0;
    const put = (k, x, y, z, yaw, s, tilt = 0) => {
      if (k.m.count >= k.cap) return;
      E.set(tilt, yaw, tilt * 0.5); Q.setFromEuler(E); M4.compose(P3.set(x, y, z), Q, S3.setScalar(s));
      k.m.setMatrixAt(k.m.count++, M4);
    };
    for (let i = ci - REACH; i <= ci + REACH; i++) for (let j = cj - REACH; j <= cj + REACH; j++) {
      const n = Math.floor(h3(i, j, 1) * 9);
      for (let q = 0; q < n; q++) {
        const x = (i + h3(i, j, 10 + q)) * CHUNK, z = (j + h3(i, j, 30 + q)) * CHUNK, r = h3(i, j, 50 + q), yaw = h3(i, j, 70 + q) * 6.28;
        if (Math.hypot(x, z) < 3 || Math.hypot(x + 0.6, z + 13.5) < 2.5) continue;   // (clear of the frame, and of where it crouches)
        if (r < 0.34) put(K.rock, x, -0.04 - h3(i, j, 90 + q) * 0.04, z, yaw, 0.12 + h3(i, j, 110 + q) * 0.45);
        else if (r < 0.5) { put(K.bone, x, -0.004 - r * 0.01, z, yaw, 0.8 + r); if (r > 0.44) put(K.bone, x + 0.3, -0.006, z + 0.2, yaw + 0.8, 0.9); }
        else if (r < 0.56) { put(K.skull, x, -0.01, z, yaw, 1); put(K.rib, x + 0.4, 0.06, z - 0.3, yaw + 1.2, 1); }
        else if (r < 0.68) put(K.plank, x, -0.005 - r * 0.01, z, yaw, 0.6 + r * 0.5, (r - 0.62) * 0.4);
        else if (r < 0.76) put(K.stick, x, 0, z, yaw, 0.7 + r * 0.6, (r - 0.72) * 0.6);
        else if (r < 0.86) put(K.rag, x, 0.0, z, yaw, 0.7 + r * 0.6);
        else if (r < 0.92) put(K.scrap, x, -0.004 - r * 0.01, z, yaw, 0.8 + r, (r - 0.89) * 0.6);
      }
    }
    for (const k of kinds) k.m.instanceMatrix.needsUpdate = true;
    landmarks(px, pz);
  }

  // ----- the light: a hemisphere off the haze and the ground, a low glow from the fire ahead, a little from behind -----
  const hemi = new THREE.HemisphereLight('#e8c07a', '#6e5632', 1.15);
  const sun = new THREE.DirectionalLight('#ffc884', 1.6); sun.position.set(0.25, 0.75, -1).multiplyScalar(60);
  const fill = new THREE.DirectionalLight('#c0a080', 0.25); fill.position.set(-0.3, 0.6, 1).multiplyScalar(60);
  S.add(hemi, sun, fill);
  pl.hemi = hemi;
  pl.look = { exposure: 0.95, hemi: 1.15, sky: new THREE.Color('#e8c07a'), ground: new THREE.Color('#6e5632'), env: 0.08, bloom: 1.0, grade: 1.1, lights: [[sun, 1.6], [fill, 0.25], [lampL, 1.4]], aoSkip1: true };

  // ----- each draw: where it's seen from (p, the camera's world position) -----
  const vp = new THREE.Vector3();
  return {
    root, time, marks, fixed,
    view(p, t) {
      time.value = t;
      ground.position.set(Math.round(p.x / 7) * 7, 0, Math.round(p.z / 7) * 7);
      // the city keeps its distance: walk toward it and it's that much further
      city.position.set(p.x * 0.3, 0, Math.min(0, p.z));
      for (const v of veils) {
        const a = v.userData.a + t * 0.004, d = v.userData.d;
        v.position.set(p.x + Math.cos(a) * d + Math.sin(t * 0.05 + a) * 4, 0, p.z + Math.sin(a) * d);
        vp.set(p.x, 0, p.z); v.lookAt(vp); v.rotation.x = 0; v.rotation.z = 0;
      }
      debris(p.x, p.z);
      // the lamp's light only where it's the one near you
      const L = fixed[0], nearL = Math.hypot(p.x - L[1], p.z - L[2]) < 60;
      pl.look.lights[2][1] = nearL ? 1.4 * (0.92 + 0.08 * Math.sin(t * 13) * Math.sin(t * 4.1)) : 0;
    },
  };
}
