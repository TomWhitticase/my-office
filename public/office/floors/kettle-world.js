// What's in the winter village (floors/kettle.js), a naive painted dusk: a lilac-grey sky with soft cloud and a warm
// glow low on the left, snow falling in flecks, birds wheeling; a snowfield in gentle drifts round a big frozen lake that
// runs off into the haze; on its near shore the crumbling brick wall with its arched gateway and the stair up its face,
// the little houses behind it with snow on their roofs, lit windows and smoking chimneys, a tall golden-leafed tree and a
// washing line; the little dock, fence stakes along the shore, an ice-fishing hole, benches, a hand-painted easel sign;
// far shores with a hamlet. The kettle-house is kettle-house.js, the people, dogs and walking sunflowers kettle-folk.js.
// Built under the floor's own random stream; mostly merged into a few meshes (one draw call a material).
// Its space: the frame at the origin (its plane z = 0, the village toward -z), y up, the snowfield at y = 0.
// heightAt(x, z): the ground under you (the snow's drifts, down onto the ice); the floor adds the stairs and the kettle.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas } from '../util.js';

export const SKY = new THREE.Color('#8f879c'), ICE = -0.3;
// Where things are (the floor's space, metres).
export const L = {
  kettle: { x: -1, z: -34 },
  wall: { x0: -34, x1: -6.5, z: -24, t: 0.7, h: 3.2, gate: -17, gw: 2.2, gh: 2.7 },
  stair: { x0: -34.2, x1: -28.6, n: 12, d: 1.0 },   // up the wall's face, from the left
  tower: { x: 5.2, z: -44.5 },
  tree: { x: -15.5, z: -36 },
  easel: { x: 8.8, z: -10.5 },
  dock: { x: 9.6, z: -27, len: 7 },
  hole: { x: 23, z: -21 },
  benches: [[3.2, -7.5, 2.3], [-13.6, -21.6, 0], [4.6, -19.5, 2.0]],   // x, z, yaw (the way you face sitting in it)
  centre: { x: 40, z: -60 }, R: 150,   // as far as you can go
};
// The lake's shore, round it (a closed curve through these, smoothed).
const SHORE = [[12, -12], [24, -5], [44, -6], [70, -12], [100, -26], [122, -52], [128, -90], [110, -126], [74, -144], [36, -140], [14, -118], [8, -92], [9, -66],
  [11, -50], [9, -40], [7.5, -30], [8.5, -20]];

// A hash of three integers to [0, 1).
export function h3(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
// ----- merged, vertex-coloured parts -----
const col = new THREE.Color();
export function paint(g, c) {
  g = g.index ? g.toNonIndexed() : g;
  col.set(c);
  const a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
/** A list of parts to put into one mesh: .box(w, h, d, x, y, z, colour, ry), .add(geometry, colour), .mesh(material). */
export function parts() {
  const P = [];
  const put = (g, c, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => {
    if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
    P.push(paint(g.translate(x, y, z), c)); return P;
  };
  return {
    P, put,
    box: (w, h, d, x, y, z, c, ry = 0, rx = 0, rz = 0) => put(new THREE.BoxGeometry(w, h, d), c, x, y, z, ry, rx, rz),
    cyl: (r0, r1, h, x, y, z, c, seg = 8, ry = 0, rx = 0, rz = 0) => put(new THREE.CylinderGeometry(r1, r0, h, seg), c, x, y, z, ry, rx, rz),
    add: (g, c) => { P.push(paint(g, c)); return P; },
    geometry: () => mergeGeometries(P),
    mesh(m) { const me = new THREE.Mesh(mergeGeometries(P), m); me.matrixAutoUpdate = false; me.updateMatrix(); return me; },
  };
}
// a tube from a to b, radius r0 at a and r1 at b
export function limb(a, b, r0, r1, seg = 6, open = false) {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r1, r0, d.length(), seg, 1, open);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
// A brushy, near-white canvas texture: what every painted surface is multiplied by, so nothing's flat colour.
export function brushTex(R, size = 256, k = 0.16) {
  const t = makeCanvas(size, size), c = t.ctx;
  c.fillStyle = '#eeeeee'; c.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 6; i++) {
    const v = 200 + Math.floor(R() * 55), a = R() * Math.PI;
    c.strokeStyle = `rgba(${v},${v},${v},${k + R() * k})`; c.lineWidth = 1 + R() * 4;
    const x = R() * size, y = R() * size, l = 4 + R() * 14;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.colorSpace = THREE.SRGBColorSpace; t.tex.needsUpdate = true;
  return t.tex;
}

// ----- the shore: a signed distance (m) to it, negative on the ice, on a grid worked out once -----
function* shoreField() {
  // the curve: Catmull-Rom through SHORE, closed
  const pts = [], n = SHORE.length;
  for (let i = 0; i < n; i++) {
    const p0 = SHORE[(i - 1 + n) % n], p1 = SHORE[i], p2 = SHORE[(i + 1) % n], p3 = SHORE[(i + 2) % n];
    for (let s = 0; s < 6; s++) {
      const t = s / 6, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const X0 = -20, Z0 = -170, S = 2, NX = 80, NZ = 92, d = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    if (i === 0 && j % 12 === 11) yield;
    const x = X0 + i * S, z = Z0 + j * S;
    let best = Infinity, inside = false;
    for (let k = 0, m = pts.length - 1; k < pts.length; m = k++) {
      const [ax, az] = pts[m], [bx, bz] = pts[k];
      if ((az > z) !== (bz > z) && x < ax + (z - az) * (bx - ax) / (bz - az)) inside = !inside;
      const ex = bx - ax, ez = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
      const dx = x - ax - ex * u, dz = z - az - ez * u, q = dx * dx + dz * dz;
      if (q < best) best = q;
    }
    d[j * NX + i] = inside ? -Math.sqrt(best) : Math.sqrt(best);
  }
  const at = (x, z) => {
    const fx = (x - X0) / S, fz = (z - Z0) / S;
    if (fx < 0 || fz < 0 || fx >= NX - 1 || fz >= NZ - 1) return 40;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * NX + i;
    return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + NX] * (1 - u) + d[k + NX + 1] * u) * v;
  };
  return { at, pts };
}

/** A generator: it yields between pieces (built a slice a frame, painting-door.js), and returns the world. */
export function* buildWorld(fl, R) {
  const S = fl.scene, root = new THREE.Group();
  S.add(root);
  S.background = SKY.clone(); S.fog = new THREE.FogExp2(SKY.clone(), 0.0068);
  const time = { value: 0 }, brush = brushTex(R);
  const lam = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, map: brush, ...o });
  const M = { paint: lam(), glow: new THREE.MeshBasicMaterial({ color: '#ffc86a' }), dark: new THREE.MeshBasicMaterial({ color: '#2a2230' }) };
  const onCam = (m, fn) => { m.frustumCulled = false; m.onBeforeRender = (r, s, cam) => { fn(m, cam.matrixWorld.elements); m.updateMatrixWorld(); }; return m; };
  const shore = yield* shoreField();
  const cols = [];   // what you can't walk through: { minX, maxX, minZ, maxZ, top } (top: you can stand on it above that)
  const solid = (x0, x1, z0, z1, top = Infinity) => cols.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), top });
  const hits = [];   // what you can point at

  // ----- the sky: lilac-grey, soft cloud, a warm glow low on the left, a violet patch high on the right -----
  const sky = onCam(new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    uniforms: { time, haze: { value: SKY } }, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; uniform vec3 haze; varying vec3 vD;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float nn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
      float fb(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += nn(p) * a; p = p * 2.03 + 1.7; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vD); float up = max(d.y, 0.0);
        vec3 top = vec3(0.30, 0.27, 0.36), c = mix(haze, top, smoothstep(0.0, 0.7, pow(up, 0.7)));
        // warm low on the left (-x) and behind the village; a violet bloom high on the right
        float warm = pow(max(0.0, -d.x * 0.8 - d.z * 0.4), 2.0) * exp(-up * 5.0);
        c = mix(c, vec3(0.86, 0.76, 0.56), warm * 0.55);
        float vio = smoothstep(0.55, 1.0, dot(d, normalize(vec3(0.5, 0.55, -0.65))));
        c = mix(c, vec3(0.55, 0.48, 0.78), vio * 0.45);
        // soft cloud, drifting
        vec2 p = d.xz / (0.3 + up) * 1.6 + vec2(time * 0.004, time * 0.002);
        float cl = fb(p) * 0.65 + fb(p * 2.3 + 5.0) * 0.35;
        c *= mix(1.0, 0.78 + cl * 0.42, smoothstep(0.03, 0.3, up));
        c = mix(c, c * vec3(0.9, 0.86, 1.0), smoothstep(0.45, 0.8, cl) * smoothstep(0.1, 0.5, up) * 0.6);
        c = mix(c, haze, smoothstep(0.1, 0.0, up));   // into the haze at the horizon
        gl_FragColor = vec4(c, 1.0);
      }`,
  })), (m, e) => m.position.set(e[12], e[13], e[14]));
  sky.renderOrder = -2; root.add(sky);

  yield;
  // ----- the ground: snow in soft drifts, dipping under the ice at the shore -----
  const drift = (x, z) => 0.16 * Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.sin(z * 0.09 + 1.3) + 0.08 * Math.sin(x * 0.31 + z * 0.23);
  // near the village and its walls the snow's flat (they stand on it)
  const flat = (x, z) => Math.max(0, Math.min(1, (Math.hypot(Math.max(0, -36 - x, x - 12), Math.max(0, -50 - z, z + 18)) - 1) / 8));
  const snowH = (x, z) => {
    const d = shore.at(x, z), dr = drift(x, z) * flat(x, z);
    if (d > 3) return dr;
    if (d < -1.2) return ICE - 0.18;
    const u = Math.max(0, Math.min(1, (d + 1.2) / 4.2));
    return ICE - 0.18 + (dr - ICE + 0.18) * u * u * (3 - 2 * u);
  };
  const heightAt = (x, z) => Math.max(snowH(x, z), shore.at(x, z) < 0.6 ? ICE : -9);
  {
    // (heights, then normals from the neighbouring heights: a slice at a time)
    const W = 520, SEG = 220, g = new THREE.PlaneGeometry(W, W, SEG, SEG).rotateX(-Math.PI / 2).translate(L.centre.x, 0, L.centre.z), p = g.attributes.position, nm = g.attributes.normal, S1 = SEG + 1, cell = W / SEG;
    for (let i = 0; i < p.count; i++) { p.setY(i, snowH(p.getX(i), p.getZ(i))); if (i % 9000 === 8999) yield; }
    for (let i = 0; i < p.count; i++) {
      const c = i % S1, r = (i - c) / S1, hx = p.getY(r * S1 + Math.min(SEG, c + 1)) - p.getY(r * S1 + Math.max(0, c - 1)), hz = p.getY(Math.min(SEG, r + 1) * S1 + c) - p.getY(Math.max(0, r - 1) * S1 + c);
      const nx = -hx / (2 * cell), nz = -hz / (2 * cell), l = Math.hypot(nx, 1, nz);
      nm.setXYZ(i, nx / l, 1 / l, nz / l);
      if (i % 20000 === 19999) yield;
    }
    // snow: white with lilac in its hollows, a faint sparkle, brushed
    const t = makeCanvas(256, 256), c = t.ctx;
    c.fillStyle = '#f0eef4'; c.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 1400; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '190,184,214' : '255,255,255'},${R() * 0.25})`; c.beginPath(); c.ellipse(R() * 256, R() * 256, 2 + R() * 9, 1 + R() * 3, R() * 3, 0, 7); c.fill(); }
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(W / 6, W / 6); t.tex.colorSpace = THREE.SRGBColorSpace; t.tex.needsUpdate = true;
    const m = new THREE.MeshLambertMaterial({ map: t.tex, color: '#dedce4' });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vGW;
        float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
        { float b = gn(vGW.xz * 0.06) * 0.6 + gn(vGW.xz * 0.21) * 0.4;
          diffuseColor.rgb *= mix(vec3(0.88, 0.87, 0.93), vec3(1.03, 1.02, 1.0), b);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.7), smoothstep(0.0, -0.4, vGW.y) * 0.6); }`);
    };
    m.customProgramCacheKey = () => 'kettle-snow';
    const ground = new THREE.Mesh(g, m); ground.matrixAutoUpdate = false; ground.updateMatrix();
    root.add(ground);
  }

  yield;
  // ----- the lake: grey-blue ice, the sky's light in it, skate marks scored over it -----
  {
    const sh = new THREE.Shape(shore.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(sh, 2).rotateX(-Math.PI / 2).translate(0, ICE, 0);
    const t = makeCanvas(512, 512), c = t.ctx;
    c.fillStyle = '#9aa0b0'; c.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 60; k++) { const gr = c.createRadialGradient(0, 0, 0, 0, 0, 60); gr.addColorStop(0, `rgba(${R() < 0.5 ? '120,128,150' : '196,200,214'},.25)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.save(); c.translate(R() * 512, R() * 512); c.fillStyle = gr; c.fillRect(-60, -60, 120, 120); c.restore(); }
    for (let k = 0; k < 160; k++) {   // skate marks: long shallow curves
      c.strokeStyle = `rgba(232,234,244,${0.12 + R() * 0.3})`; c.lineWidth = 0.6 + R() * 1.2;
      const x = R() * 512, y = R() * 512, r = 30 + R() * 160, a = R() * 6.28;
      c.beginPath(); c.arc(x, y, r, a, a + 0.3 + R() * 0.9); c.stroke();
    }
    for (let k = 0; k < 40; k++) { c.strokeStyle = `rgba(70,76,96,${0.15 + R() * 0.2})`; c.lineWidth = 0.5; let x = R() * 512, y = R() * 512; c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 5; s++) { x += (R() - 0.5) * 50; y += (R() - 0.5) * 50; c.lineTo(x, y); } c.stroke(); }
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.colorSpace = THREE.SRGBColorSpace; t.tex.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ map: t.tex, color: '#7c8292', roughness: 0.3, metalness: 0 });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vIW;').replace('#include <project_vertex>', '#include <project_vertex>\nvIW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vIW;')
        .replace('#include <map_fragment>', `vec4 sampledDiffuseColor = texture2D(map, vIW.xz / 26.0); diffuseColor *= sampledDiffuseColor;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 v = normalize(cameraPosition - vIW); float fr = pow(1.0 - max(v.y, 0.0), 4.0);
          totalEmissiveRadiance += mix(vec3(0.02, 0.02, 0.035), vec3(0.36, 0.34, 0.45), fr) * 0.6; }`);
    };
    m.customProgramCacheKey = () => 'kettle-ice';
    const ice = new THREE.Mesh(g, m); ice.matrixAutoUpdate = false; ice.updateMatrix();
    root.add(ice);
  }

  yield;
  // ----- the wall: old brick, its top crumbling, an arched gateway, a stair up its face -----
  const bricks = (() => {
    const t = makeCanvas(256, 256), c = t.ctx;
    c.fillStyle = '#6e5852'; c.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 16; r++) for (let k = -1; k < 9; k++) {
      const x = k * 32 + (r & 1) * 16, v = R();
      c.fillStyle = `rgb(${150 + v * 40},${92 + v * 26},${74 + v * 20})`;
      c.fillRect(x + 1.5, r * 16 + 1.5, 29, 13);
      if (R() < 0.2) { c.fillStyle = 'rgba(60,40,40,.3)'; c.fillRect(x + 4, r * 16 + 3, 10 + R() * 10, 8); }
    }
    for (let k = 0; k < 40; k++) { const g = c.createRadialGradient(0, 0, 0, 0, 0, 40); g.addColorStop(0, `rgba(${R() < 0.5 ? '120,110,130' : '210,180,150'},.28)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.save(); c.translate(R() * 256, R() * 256); c.fillStyle = g; c.fillRect(-40, -40, 80, 80); c.restore(); }
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(0.45, 0.9); t.tex.colorSpace = THREE.SRGBColorSpace; t.tex.needsUpdate = true;
    return t.tex;
  })();
  const brickM = new THREE.MeshLambertMaterial({ map: bricks, color: '#d8c4bc' });
  const W = L.wall, wallTop = [];   // [x0, x1, y]: the top's height along it
  {
    const s = new THREE.Shape(), hz = W.h;
    // its outline, from the bottom left round: the top broken and stepping down at the right toward the kettle
    s.moveTo(W.x0, -0.4);
    s.lineTo(W.x1, -0.4);
    const top = [[W.x1, 1.4], [W.x1 - 0.5, 1.4], [W.x1 - 0.5, 2.1], [W.x1 - 1.3, 2.1], [W.x1 - 1.3, 2.7], [W.x1 - 2.4, 2.7], [W.x1 - 2.4, hz + 0.1], [-11.5, hz + 0.1], [-11.5, hz - 0.35],
      [-12.6, hz - 0.35], [-12.6, hz], [-21.5, hz], [-21.5, hz + 0.25], [-22.3, hz + 0.25], [-22.3, hz], [W.x0, hz]];
    for (const [x, y] of top) s.lineTo(x, y);
    s.closePath();
    const hole = new THREE.Path(), gx = W.gate, gw = W.gw / 2, sp = W.gh - gw;
    hole.moveTo(gx - gw, -0.4); hole.lineTo(gx + gw, -0.4); hole.lineTo(gx + gw, sp); hole.absarc(gx, sp, gw, 0, Math.PI, false); hole.lineTo(gx - gw, -0.4);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: W.t, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, W.z - W.t / 2);
    const wall = new THREE.Mesh(g, brickM); wall.matrixAutoUpdate = false; root.add(wall);
    for (let k = 0; k < top.length - 1; k++) if (top[k][1] === top[k + 1][1]) wallTop.push([Math.min(top[k][0], top[k + 1][0]), Math.max(top[k][0], top[k + 1][0]), top[k][1]]);
    // the stone round the gateway, proud of both faces, its opening a little inside the brick's
    const ar = new THREE.Shape(), i2 = new THREE.Path(), o = gw + 0.24, ii = gw - 0.03;
    ar.moveTo(gx - o, -0.4); ar.lineTo(gx - ii, -0.4); ar.lineTo(gx - ii, sp); ar.absarc(gx, sp, ii, Math.PI, 0, true); ar.lineTo(gx + ii, -0.4); ar.lineTo(gx + o, -0.4); ar.lineTo(gx + o, sp); ar.absarc(gx, sp, o, 0, Math.PI, false); ar.closePath();
    void i2;
    const arch = parts();
    arch.add(new THREE.ExtrudeGeometry(ar, { depth: W.t + 0.06, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, W.z - W.t / 2 - 0.03), '#b9aa9a');
    arch.box(o * 2 + 0.3, 0.16, W.t + 0.12, gx, W.gh + 0.32, W.z, '#a89888');   // a lintel stone over it
    // the little house-number of a plaque by the gate, and a lantern
    arch.box(0.3, 0.36, 0.03, gx + 2.0, 2.0, W.z + W.t / 2 + 0.015, '#d8d0c0');
    root.add(arch.mesh(M.paint));
    // colliders: either side of the gateway (you can stand on its top)
    solid(W.x0, gx - gw + 0.05, W.z - W.t / 2, W.z + W.t / 2, hz - 0.5);
    solid(gx + gw - 0.05, W.x1, W.z - W.t / 2, W.z + W.t / 2, 1.0);
  }
  // the stair up its face, from the left: solid steps, the treads snowy
  const ST = L.stair, stepW = (ST.x1 - ST.x0) / ST.n, rise = W.h / ST.n, zf = W.z + W.t / 2;
  {
    const P = parts();
    for (let k = 0; k < ST.n; k++) {
      const x = ST.x0 + stepW * (k + 0.5), y = rise * (k + 1);
      P.box(stepW, y + 0.4, ST.d, x, (y - 0.4) / 2, zf + ST.d / 2, '#8e7468');
      P.box(stepW - 0.04, 0.05, ST.d - 0.06, x, y + 0.025, zf + ST.d / 2 + 0.02, '#eeeaf2');
    }
    root.add(P.mesh(brickM.clone()));
    root.children.at(-1).material.vertexColors = true; root.children.at(-1).material.color.set('#ffffff');
  }
  // standing on it: the wall's top, the stair's treads (null: neither)
  const onWall = (x, z) => {
    if (z > zf && z < zf + ST.d && x > ST.x0 && x < ST.x1) return rise * Math.min(ST.n, Math.floor((x - ST.x0) / stepW) + 1) + 0.05;
    if (Math.abs(z - W.z) < W.t / 2 + 0.05) for (const [a, b, y] of wallTop) if (x >= a && x <= b && !(x > W.gate - W.gw / 2 && x < W.gate + W.gw / 2 && y < 1)) return y;
    return null;
  };

  yield;
  // ----- the houses behind the wall: snow on their roofs, lit windows, chimneys -----
  const glow = parts(), houses = parts(), chimneys = [];
  function house(x, z, w, d, h, ry, wallC, roofC, { stepped = false, round = false, far = false } = {}) {
    const c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const put = (g, colr, lx, y, lz, r2 = 0) => { const [px, pz] = at(lx, lz); houses.put(g, colr, px, y, pz, ry + r2); };
    put(new THREE.BoxGeometry(w, h + 0.4, d), wallC, 0, (h - 0.4) / 2, 0);
    // the gable: a prism from the walls' top
    const rh = w * 0.62, tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh)]);
    if (stepped) {   // a stepped brick gable, the roof behind it
      for (let k = 0; k < 4; k++) put(new THREE.BoxGeometry(w * (1 - k * 0.24), rh / 4, 0.3), wallC, 0, h + rh / 8 + k * rh / 4, d / 2 - 0.15);
      put(new THREE.ExtrudeGeometry(tri, { depth: d - 0.32, bevelEnabled: false }).translate(0, 0, -d / 2), wallC, 0, h, 0);
    } else put(new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), wallC, 0, h, 0);
    // the roof: two slabs and their snow, hanging over
    const sl = Math.hypot(w / 2, rh) + 0.35, ang = Math.atan2(rh, w / 2), dd0 = d + (stepped ? -0.3 : 0.5);
    for (const sd of [-1, 1]) {
      const mx = sd * (w / 4), my = h + rh / 2, dd = dd0 - (sd > 0 ? (far ? 0.08 : 0.02) : 0);   // (the ridge: their ends never in one plane)
      const g = new THREE.BoxGeometry(sl, 0.14, dd).translate(sd * -0.0, 0.07, 0).rotateZ(-sd * ang).translate(mx + sd * Math.sin(ang) * 0.07, my + Math.cos(ang) * 0.07, 0);
      put(g, roofC, 0, 0, stepped ? -0.15 : 0);
      const sn = new THREE.BoxGeometry(sl - 0.12, 0.2, dd - 0.1 - (sd > 0 ? (far ? 0.08 : 0.02) : 0)).translate(0, 0.24, 0).rotateZ(-sd * ang).translate(mx + sd * Math.sin(ang) * 0.07, my + Math.cos(ang) * 0.07, 0);
      put(sn, '#eeebf3', 0, 0, stepped ? -0.15 : 0);
    }
    // a chimney through the back slope, snow on it
    const cx = w * 0.22, cy = h + rh * 0.55;
    put(new THREE.BoxGeometry(0.5, rh * 0.9 + 0.7, 0.5), '#7a4e3a', cx, cy + 0.0, -d * 0.15);
    put(new THREE.BoxGeometry(0.62, 0.12, 0.62), '#eeebf3', cx, cy + rh * 0.45 + 0.41, -d * 0.15);
    const [chx, chz] = at(cx, -d * 0.15);
    chimneys.push([chx, cy + rh * 0.45 + 0.5, chz]);
    // windows on the front (+z) and one on the side: lit, a dark cross over each
    const win = (lx, y, lz, face, ww = 0.6, wh = 0.8) => {
      const g = new THREE.PlaneGeometry(ww, wh), o = far ? 0.025 : 0.005;   // (far off, depth's coarser: further off the wall, no bars)
      if (face === 'side') { g.rotateY(Math.PI / 2); const [px, pz] = at(w / 2 + o, lz); glow.put(g, '#ffffff', px, y, pz, ry); }
      else { const [px, pz] = at(lx, d / 2 + o); glow.put(g, '#ffffff', px, y, pz, ry); }
      if (far) return;
      const off = face === 'side' ? [w / 2 + 0.02, lz] : [lx, d / 2 + 0.02], r2 = face === 'side' ? Math.PI / 2 : 0;
      put(new THREE.BoxGeometry(ww + 0.12, 0.06, 0.03), '#3a2c26', off[0], y - wh / 2 - 0.03, off[1], r2);
      put(new THREE.BoxGeometry(ww + 0.12, 0.06, 0.03), '#3a2c26', off[0], y + wh / 2 + 0.03, off[1], r2);
      put(new THREE.BoxGeometry(0.04, wh, 0.02), '#3a2c26', off[0], y, off[1], r2);
      put(new THREE.BoxGeometry(ww, 0.035, 0.012), '#3a2c26', off[0], y + 0.04, off[1], r2);
    };
    const nw = Math.max(1, Math.floor(w / 1.6));
    for (let k = 0; k < nw; k++) win(-w / 2 + (k + 0.5) * w / nw, h * 0.55, 0, 'front');
    if (h > 4) for (let k = 0; k < nw; k++) if (R() < 0.7) win(-w / 2 + (k + 0.5) * w / nw, h * 0.82, 0, 'front', 0.5, 0.65);
    win(0, h * 0.55, d * 0.1, 'side');
    if (round) { const g = new THREE.CircleGeometry(0.22, 14); const [px, pz] = at(0, d / 2 + 0.005); glow.put(g, '#ffffff', px, h + rh * 0.42, pz, ry); }
    // its footprint, solid
    const r = Math.max(w, d) / 2;
    if (Math.abs(Math.sin(ry)) < 0.2) solid(x - w / 2, x + w / 2, z - d / 2, z + d / 2); else solid(x - r * 0.8, x + r * 0.8, z - r * 0.8, z + r * 0.8);
  }
  house(-31.5, -30.5, 5.2, 5, 7.2, 0.0, '#9a5a3e', '#5e3a2e', { stepped: true, round: true });
  house(-24, -33, 5.6, 4.6, 3.4, 0.08, '#d6c08c', '#6e4a3a', { round: true });
  house(-9.5, -32, 4.2, 4, 2.9, -0.12, '#cdb27a', '#6a4436');
  house(-21, -44, 4.8, 4.4, 4.4, 0.25, '#b88a5a', '#5a3a30');
  house(-34, -42, 4.4, 4.2, 3.2, -0.2, '#e0d2b0', '#6a4234');
  house(-11, -46, 3.8, 3.6, 3.0, 0.4, '#c49a6a', '#5e3c30');
  // the little orange tower by the kettle, on the shore
  {
    const T = L.tower, P = houses;
    P.cyl(1.6, 1.5, 6.4, T.x, 3.0, T.z, '#c8743e', 14);
    P.put(new THREE.ConeGeometry(1.95, 2.3, 14), '#eeebf3', T.x, 7.3, T.z);
    P.put(new THREE.ConeGeometry(1.8, 2.1, 14), '#5a3a2e', T.x, 7.15, T.z);
    for (const [a, y] of [[0.3, 2.2], [-0.4, 4.4], [1.2, 3.4]]) glow.put(new THREE.PlaneGeometry(0.45, 0.7), '#ffffff', T.x + Math.sin(a) * 1.565, y, T.z + Math.cos(a) * 1.565, a);
    P.box(0.9, 1.8, 0.1, T.x + Math.sin(-1.1) * 1.56, 0.9, T.z + Math.cos(-1.1) * 1.56, '#4a3024', -1.1);
    chimneys.push([T.x + 0.6, 8.6, T.z - 0.3]);
    P.box(0.34, 1.5, 0.34, T.x + 0.6, 7.9, T.z - 0.3, '#7a4e3a');
    solid(T.x - 1.5, T.x + 1.5, T.z - 1.5, T.z + 1.5);
  }
  // a hamlet on the far shore, small in the haze
  for (const [x, z, w, h, ry] of [[132, -70, 4, 3, 0.3], [138, -78, 3.4, 2.6, -0.2], [128, -100, 4.4, 3.4, 0.6], [124, -112, 3, 2.4, 0.1], [92, -150, 4, 3, 0.2], [80, -156, 3.4, 2.8, -0.3], [-8, -150, 5, 4, 0.2]]) house(x, z, w, w * 0.9, h, ry, R() < 0.5 ? '#c09a6a' : '#a8664a', '#5a3a30', { far: true });
  root.add(houses.mesh(M.paint));
  const glowMesh = glow.mesh(M.glow); root.add(glowMesh);

  yield;
  // ----- the tree: grey-brown limbs, golden leaves in clumps -----
  {
    const T = L.tree, P = parts(), Lf = parts(), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const grow = (a, dir, len, r, depth) => {
      const b = a.clone().addScaledVector(dir, len);
      P.add(limb(a, b, r, r * 0.68, 7, true), '#4f443c');   // (open: the joints' caps would lie in each other)
      if (depth === 0 || r < 0.05) {
        for (let k = 0; k < 3; k++) {
          const g = new THREE.IcosahedronGeometry(0.7 + R() * 0.6, 0).rotateY(R() * 6).rotateX(R() * 0.6).scale(1, 0.75, 1);
          Lf.put(g, ['#d8b444', '#e8cc62', '#bf942e', '#f0d878'][Math.floor(R() * 4)], b.x + (R() - 0.5) * 1.2, b.y + (R() - 0.3) * 0.8, b.z + (R() - 0.5) * 1.2);
        }
        return;
      }
      const n = 2 + (R() < 0.4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const d2 = dir.clone().add(V((R() - 0.5) * 1.3, R() * 0.4, (R() - 0.5) * 1.3)).normalize();
        grow(b, d2, len * (0.62 + R() * 0.2), r * 0.62, depth - 1);
      }
    };
    grow(V(T.x, -0.2, T.z), V(0.12, 1, 0.05).normalize(), 4.2, 0.32, 4);
    root.add(P.mesh(M.paint));
    const leaves = Lf.mesh(lam({ emissive: '#3a2c08' })); root.add(leaves);
    solid(T.x - 0.4, T.x + 0.4, T.z - 0.4, T.z + 0.4);
  }
  yield;
  // ----- the washing line: from the tree to the tall house, clothes pegged on it, stirring -----
  const wash = (() => {
    const a = new THREE.Vector3(L.tree.x + 0.3, 4.5, L.tree.z + 0.3), b = new THREE.Vector3(-28.9, 4.7, -28.6), P = parts(), C = parts();
    const N = 16, sag = 0.45, pt = (u) => new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0));
    for (let k = 0; k < N; k++) P.add(limb(pt(k / N), pt((k + 1) / N), 0.012, 0.012, 4), '#3a3230');
    P.cyl(0.07, 0.06, 4.9, b.x, 2.25, b.z + 0.02, '#4a3a30', 6);
    const clothes = ['#c04a3a', '#e8e2d4', '#4a6aa0', '#d8b444', '#e8e2d4', '#7a4a8a', '#5a8a6a'];
    for (let k = 0; k < clothes.length; k++) {
      const u = 0.12 + k * 0.11, p = pt(u), w = 0.35 + R() * 0.25, h = 0.4 + R() * 0.35;
      const g = new THREE.PlaneGeometry(w, h, 2, 3).translate(0, -h / 2, 0);
      g.rotateY(Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2);
      C.put(g, clothes[k], p.x, p.y - 0.01, p.z);
    }
    root.add(P.mesh(M.paint));
    const cm = lam({ side: THREE.DoubleSide });
    cm.onBeforeCompile = (sh) => {
      sh.uniforms.time = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 w = modelMatrix * vec4(position, 1.0); float k = clamp(4.6 - w.y, 0.0, 1.0); transformed.x += sin(time * 1.7 + w.x * 0.8) * 0.06 * k; transformed.z += sin(time * 2.3 + w.z) * 0.08 * k; }`);
    };
    cm.customProgramCacheKey = () => 'kettle-wash';
    const m = C.mesh(cm); root.add(m);
    return m;
  })();

  yield;
  // ----- the shore: the dock, fence stakes, the fishing hole, benches, the easel -----
  const wood = parts();
  {   // the dock: planks out over the ice on posts
    const D = L.dock;
    for (let k = 0; k < 12; k++) wood.box(0.28, 0.06, 1.8, D.x - 1.3 + k * (D.len / 12) + 0.15, 0.1 - k * 0.01 + (ICE + 0.25) * (k / 12), D.z + (R() - 0.5) * 0.03, R() < 0.5 ? '#7a5a40' : '#6a4c36', (R() - 0.5) * 0.04);
    for (const [dx, dz] of [[0, -0.8], [0, 0.8], [D.len / 2, -0.8], [D.len / 2, 0.8], [D.len - 1.3, -0.8], [D.len - 1.3, 0.8]]) wood.cyl(0.07, 0.06, 1.4, D.x - 1.1 + dx, -0.2, D.z + dz, '#4e3a2c', 6);
    for (let k = 0; k < 12; k++) wood.box(0.24, 0.05, 1.7, D.x - 1.3 + k * (D.len / 12) + 0.15, 0.172 - k * 0.01 + (ICE + 0.25) * (k / 12), D.z, '#eeebf3');
  }
  const dockAt = (x, z) => { const D = L.dock; if (Math.abs(z - D.z) < 0.9 && x > D.x - 1.3 && x < D.x - 1.3 + D.len) { const k = Math.min(11, Math.floor((x - D.x + 1.3) / (D.len / 12))); return 0.13 - k * 0.01 + (ICE + 0.25) * (k / 12) + 0.03; } return null; };
  // stakes: a crooked line of them along the shore, and round the kettle's spit
  {
    const stake = (x, z, h) => wood.cyl(0.05, 0.035, h, x, h / 2 - 0.2, z, '#3e3028', 5, 0, (R() - 0.5) * 0.15, (R() - 0.5) * 0.15);
    for (let k = 0; k < 26; k++) { const a = -0.3 + k * 0.08; stake(L.kettle.x + Math.cos(a) * 9.5, L.kettle.z + 6 + Math.sin(a) * 6.5, 0.6 + R() * 0.4); }
    for (let k = 0; k < 18; k++) stake(14 + k * 0.9 + R() * 0.3, -4.5 - k * 0.15, 0.5 + R() * 0.5);
    for (let k = 0; k < 10; k++) stake(-6 + k * 1.1, -3.5 + R() * 0.4, 0.4 + R() * 0.4);
  }
  yield;
  // the fishing hole: a dark round of water in the ice, a rim of slush, a stool and bucket by it
  const hole = (() => {
    const H = L.hole, g = new THREE.Group(); g.position.set(H.x, ICE, H.z); root.add(g);
    // black water, rings drifting out over it, now and then a fish going round under it
    const wm = new THREE.ShaderMaterial({ fog: true, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
      vertexShader: `varying vec2 vU;
        #include <fog_pars_vertex>
        void main() { vU = position.xz; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float time; varying vec2 vU;
        #include <fog_pars_fragment>
        void main() {
          float r = length(vU) / 0.55, w = sin(r * 18.0 - time * 1.4) * 0.5 + 0.5;
          vec3 c = mix(vec3(0.03, 0.05, 0.08), vec3(0.12, 0.16, 0.22), w * (1.0 - r) * 0.6 + 0.1);
          float a = time * 0.5; vec2 f = vU - vec2(cos(a), sin(a)) * 0.28, d = vec2(-sin(a), cos(a));
          vec2 q = vec2(dot(f, d), dot(f, vec2(-d.y, d.x)));
          float fish = smoothstep(1.0, 0.7, length(q / vec2(0.13, 0.045))) + smoothstep(1.0, 0.6, length((q + vec2(0.15, 0.0)) / vec2(0.04, 0.05 + 0.02 * sin(time * 9.0))));
          c = mix(c, vec3(0.16, 0.2, 0.22), clamp(fish, 0.0, 1.0) * (0.55 + 0.45 * sin(time * 0.13)));
          float glint = pow(max(0.0, sin(time * 0.7 + vU.x * 4.0) * sin(time * 0.5 + vU.y * 5.0)), 12.0);
          gl_FragColor = vec4(c + glint * vec3(0.4, 0.42, 0.5), 1.0);
          #include <fog_fragment>
        }` });
    wm.uniforms.time = time;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2).translate(0, 0.006, 0), wm);
    g.add(water);
    const rim = parts();
    rim.add(new THREE.TorusGeometry(0.62, 0.09, 6, 20).rotateX(Math.PI / 2).scale(1, 0.5, 1).translate(0, 0.02, 0), '#d8d6e4');
    rim.cyl(0.18, 0.2, 0.36, 1.0, 0.18, 0.3, '#6a4c36', 8);   // the stool
    rim.cyl(0.14, 0.16, 0.3, -0.85, 0.15, 0.55, '#7a7e88', 10);   // the bucket
    rim.add(new THREE.TorusGeometry(0.15, 0.012, 4, 12).rotateX(Math.PI / 2).translate(-0.85, 0.3, 0.55), '#555a66');
    rim.add(limb(new THREE.Vector3(0.9, 0.5, 0.25), new THREE.Vector3(0.1, 1.15, 0.05), 0.012, 0.006, 4), '#5a4030');   // a short rod, its line down into the hole
    rim.add(limb(new THREE.Vector3(0.1, 1.15, 0.05), new THREE.Vector3(0.05, -0.1, 0.02), 0.002, 0.002, 3), '#cfcfd8');
    const rm = rim.mesh(M.paint); g.add(rm);
    water.userData = { action: 'kettle-hole', reach: 4 }; hits.push(water);
    return { g, water };
  })();
  yield;
  // benches: a plank seat and back on two trestles, snow on the back rail
  const seats = [];
  for (const [x, z, yaw] of L.benches) {
    const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = yaw; root.add(g);
    const P = parts();
    P.box(1.7, 0.06, 0.42, 0, 0.45, 0, '#6a4c36');
    P.box(1.7, 0.3, 0.05, 0, 0.78, -0.22, '#6a4c36', 0, -0.12);
    P.box(1.6, 0.04, 0.06, 0, 0.955, -0.24, '#eeebf3');
    for (const sx of [-0.7, 0.7]) { P.box(0.07, 0.45, 0.4, sx, 0.21, 0, '#4e3a2c'); P.box(0.07, 0.46, 0.04, sx, 0.66, -0.22, '#4e3a2c', 0, -0.12); }
    const mesh = P.mesh(M.paint); g.add(mesh);
    const seat = { name: 'A bench', x: x - Math.sin(yaw) * 0.05, z: z - Math.cos(yaw) * 0.05, rotY: yaw, eye: 1.15 + g.position.y, obj: g, floor: fl.n };
    mesh.userData.seat = seat; hits.push(mesh); seats.push(seat);
    solid(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
  }
  yield;
  // the easel sign by the ice: a board on three legs, hand-lettered
  const easel = (() => {
    const E = L.easel, g = new THREE.Group(); g.position.set(E.x, heightAt(E.x, E.z), E.z); g.rotation.y = Math.atan2(-E.x, -E.z) + Math.PI; root.add(g);
    const P = parts();
    P.add(limb(new THREE.Vector3(-0.55, 0, 0.2), new THREE.Vector3(-0.42, 1.95, -0.02), 0.035, 0.03, 5), '#5a4030');
    P.add(limb(new THREE.Vector3(0.55, 0, 0.2), new THREE.Vector3(0.42, 1.95, -0.02), 0.035, 0.03, 5), '#5a4030');
    P.add(limb(new THREE.Vector3(0, 0, -0.6), new THREE.Vector3(0, 1.85, -0.07), 0.03, 0.025, 5), '#5a4030');
    P.box(1.25, 0.05, 0.12, 0, 0.95, 0.11, '#5a4030');
    P.box(1.42, 0.86, 0.05, 0, 1.45, 0.06, '#6a4c36', 0, -0.08);
    P.box(1.2, 0.05, 0.06, 0, 1.92, 0.025, '#eeebf3', 0, -0.08);
    g.add(P.mesh(M.paint));
    const t = makeCanvas(512, 300), c = t.ctx;
    c.fillStyle = '#e6dcc0'; c.fillRect(0, 0, 512, 300);
    for (let k = 0; k < 400; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '150,130,100' : '250,245,230'},${R() * 0.2})`; c.fillRect(R() * 512, R() * 300, 2 + R() * 8, 1 + R() * 3); }
    c.fillStyle = '#2c3a5a'; c.textAlign = 'center';
    c.font = 'italic 700 74px Georgia, serif'; c.fillText('Paintings', 256, 112);
    c.font = 'italic 48px Georgia, serif'; c.fillText('~ ask inside ~', 256, 186);
    c.font = '34px Georgia, serif'; c.fillStyle = '#7a3a2a'; c.fillText('tea · warm stove · open', 256, 250);
    for (const [x, y, cc] of [[56, 60, '#c9614a'], [458, 64, '#d8b44a'], [470, 246, '#4a6aa0'], [44, 240, '#7a4a8a']]) {
      c.fillStyle = cc; for (let p = 0; p < 6; p++) { const a = p * 1.047; c.beginPath(); c.arc(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 9, 0, 7); c.fill(); }
      c.fillStyle = '#5a3a1e'; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill();
    }
    t.tex.colorSpace = THREE.SRGBColorSpace; t.tex.needsUpdate = true;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.76), new THREE.MeshLambertMaterial({ map: t.tex }));
    board.position.set(0, 1.45, 0.087); board.rotation.x = -0.08; board.userData = { action: 'kettle-easel', reach: 5 };
    g.add(board); hits.push(board);
    solid(E.x - 0.5, E.x + 0.5, E.z - 0.5, E.z + 0.5);
    return g;
  })();
  root.add(wood.mesh(M.paint));

  yield;
  // ----- snow falling: flecks round whichever camera draws it, drifting -----
  const snow = (() => {
    const N = 2600, p = new Float32Array(N * 3), s = new Float32Array(N);
    for (let k = 0; k < N; k++) { p[k * 3] = R() * 60; p[k * 3 + 1] = R() * 30; p[k * 3 + 2] = R() * 60; s[k] = R(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({ uniforms: { time, cam: { value: new THREE.Vector3() }, px: { value: 1 }, kettle: { value: new THREE.Vector2(L.kettle.x, L.kettle.z) } }, transparent: true, depthWrite: false,
      vertexShader: `uniform float time, px; uniform vec3 cam; uniform vec2 kettle; attribute float seed; varying float vA;
        void main() {
          vec3 q = position + vec3(sin(time * 0.3 + seed * 30.0) * 1.5 + time * 0.4, -time * (0.55 + seed * 0.5), cos(time * 0.23 + seed * 20.0) * 1.5);
          q = mod(q - cam + vec3(30.0, 12.0, 30.0), vec3(60.0, 30.0, 60.0)) + cam - vec3(30.0, 12.0, 30.0);
          if (length(q.xz - kettle) < 4.7 && q.y < 11.0) q.y = -50.0;   // (not inside the kettle)
          vec4 mv = modelViewMatrix * vec4(q, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z; vA = smoothstep(0.5, 2.0, d) * (1.0 - smoothstep(18.0, 30.0, d));
          gl_PointSize = px * (1.4 + seed * 1.6) * 30.0 / max(d, 1.0);
        }`,
      fragmentShader: 'varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(c)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.97, 0.96, 1.0, a * 0.85); }' });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false;
    pts.onBeforeRender = (r, sc, cam) => { m.uniforms.cam.value.setFromMatrixPosition(cam.matrixWorld); m.uniforms.px.value = r.getPixelRatio() * r.domElement.height / 500; };
    root.add(pts);
    return pts;
  })();

  yield;
  // ----- birds: dark specks wheeling high up, a few white gulls lower over the ice, flapping -----
  const birds = (() => {
    const N = 22, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.18, -1, 0.0, -0.1, 0, 0, -0.18, 0, 0, 0.18, 1, 0.0, -0.1, 0, 0, -0.18]), 3));
    g.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.time = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = float(gl_InstanceID) * 1.7; transformed.y += abs(position.x) * sin(time * (5.0 + mod(ph, 3.0)) + ph) * 0.7; }`);
    };
    m.customProgramCacheKey = () => 'kettle-birds';
    const im = new THREE.InstancedMesh(g, m, N); im.frustumCulled = false;
    const B = Array.from({ length: N }, (_, k) => ({ gull: k < 4, cx: 20 + (R() - 0.5) * 120, cz: -60 + (R() - 0.5) * 120, r: 12 + R() * 30, y: k < 4 ? 9 + R() * 6 : 22 + R() * 25, w: (0.05 + R() * 0.08) * (R() < 0.5 ? -1 : 1), a: R() * 6.28, s: k < 4 ? 0.9 : 0.45 + R() * 0.3 }));
    B.forEach((b, k) => im.setColorAt(k, col.set(b.gull ? '#f2f0f4' : '#2e2a34')));
    root.add(im);
    const o = new THREE.Object3D();
    return { im, tick(t) {
      for (let k = 0; k < N; k++) {
        const b = B[k], a = b.a + t * b.w;
        o.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(t * 0.3 + k) * 1.5, b.cz + Math.sin(a) * b.r);
        o.rotation.set(0, -a + (b.w > 0 ? 0 : Math.PI), Math.sin(t * 0.5 + k) * 0.2); o.scale.setScalar(b.s); o.updateMatrix();
        im.setMatrixAt(k, o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    } };
  })();

  yield;
  // ----- puffs: smoke from the chimneys, the kettle's steam, snowballs bursting: one pool of soft points -----
  const puffs = (() => {
    const N = 420, pos = new Float32Array(N * 3), dat = new Float32Array(N * 4), vel = new Float32Array(N * 3), life = new Float32Array(N), age = new Float32Array(N).fill(1e9);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('dat', new THREE.BufferAttribute(dat, 4));   // size, alpha, tint (0 grey smoke, 1 white), -
    g.attributes.position.setUsage(THREE.DynamicDrawUsage); g.attributes.dat.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.ShaderMaterial({ uniforms: { px: { value: 1 } }, transparent: true, depthWrite: false,
      vertexShader: `uniform float px; attribute vec4 dat; varying vec2 vD;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vD = dat.yz; gl_PointSize = dat.x * px * 430.0 / max(-mv.z, 0.5); }`,   // (dat.x: its width in metres; 430: the view's focal length at 500 px high)
      fragmentShader: `varying vec2 vD; void main() { vec2 c = gl_PointCoord - 0.5; float r = length(c); float a = smoothstep(0.5, 0.0, r) * vD.x; if (a < 0.004) discard;
        gl_FragColor = vec4(mix(vec3(0.62, 0.6, 0.68), vec3(0.97, 0.97, 1.0), vD.y), a); }` });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 2;
    pts.onBeforeRender = (r) => { m.uniforms.px.value = r.getPixelRatio() * r.domElement.height / 500; };
    root.add(pts);
    let next = 0;
    return {
      emit(x, y, z, vx, vy, vz, size, sec, tint) {
        const k = next; next = (next + 1) % N;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; vel[k * 3] = vx; vel[k * 3 + 1] = vy; vel[k * 3 + 2] = vz;
        dat[k * 4] = size; dat[k * 4 + 2] = tint; dat[k * 4 + 3] = size; life[k] = sec; age[k] = 0;
      },
      tick(dt) {
        for (let k = 0; k < N; k++) {
          if (age[k] > life[k]) { dat[k * 4 + 1] = 0; continue; }
          age[k] += dt; const u = age[k] / life[k];
          pos[k * 3] += vel[k * 3] * dt + 0.25 * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
          vel[k * 3] *= 1 - dt * 0.8; vel[k * 3 + 1] *= 1 - dt * 0.5; vel[k * 3 + 2] *= 1 - dt * 0.8;
          dat[k * 4] = dat[k * 4 + 3] * (1 + u * 2.2); dat[k * 4 + 1] = Math.min(1, u * 6) * (1 - u) * 0.55;
        }
        g.attributes.position.needsUpdate = true; g.attributes.dat.needsUpdate = true;
      },
    };
  })();

  // ----- the light: dusk off the snow and the lilac sky; a low warm sun from behind the village, a cool fill -----
  const hemi = new THREE.HemisphereLight('#b8b0d6', '#e2deea', 1.5);
  const sun = new THREE.DirectionalLight('#ffd49a', 1.1); sun.position.set(-0.8, 0.35, -0.55).multiplyScalar(80);
  const fill = new THREE.DirectionalLight('#a8b0d8', 0.45); fill.position.set(0.6, 0.5, 0.8).multiplyScalar(80);
  S.add(hemi, sun, fill);
  fl.hemi = hemi;
  fl.look = { exposure: 1.0, hemi: 1.5, sky: new THREE.Color('#b8b0d6'), ground: new THREE.Color('#e2deea'), env: 0, bloom: 0.9, grade: 0.9, lights: [[sun, 1.1], [fill, 0.45]], aoSkip1: true, ao: false };

  // ----- each draw: where it's seen from -----
  let smokeT = 0;
  return {
    root, time, M, lam, brush, cols, hits, seats, heightAt, onWall, dockAt, shore, puffs, chimneys, hole, easel, wash, birds, snow, glowMesh,
    view(p, t) { time.value = t; },
    tick(dt, t) {
      birds.tick(t);
      smokeT += dt;
      if (smokeT > 0.22) {   // a puff from each chimney, leaning with the air
        smokeT = 0;
        for (const [x, y, z] of chimneys) puffs.emit(x, y, z, 0.1 + Math.random() * 0.1, 0.55 + Math.random() * 0.2, 0.05, 0.7, 5.5, 0.15);
      }
      puffs.tick(dt);
    },
  };
}
