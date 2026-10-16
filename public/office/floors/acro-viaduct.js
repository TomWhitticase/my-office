// The towers and the viaduct (floors/acro.js): one thing, seen from near or far.
// Every tower on the line (acro-plan.js) is acrobats standing on each other's shoulders, the men at the bottom, the
// women above, up to the springing of the arches; from each tower's top, chains of acrobats lean out, feet on the last
// one's hands, curving over to meet the chain from the next tower hand to hand at the crown: the arches. Out over the
// sea the deck lies on them. Near you they're people: yellow and red, breathing, swaying to keep their balance up the
// tower, the top ones reaching. Further off, the same bodies are carved stone: the colour, the grain and the courses of
// masonry come up through them, the gaps between them fill (a core inside each tower and along each arch, collapsed to
// a line while they're people, swelling to a pier and an arch ring as they turn), and they stop moving. It's per
// fragment, by how far it is from whichever camera draws it (yours, the portal's, the painting's): walk out along the
// deck and the ones under you are people again. The deck, its spandrels, parapets and rails are always stone.
// The people: instanced bodies (acro-figures.js), hi near and lo far, each tower moved as a chain from its base up.
// What they do: sway and breathe; `flip(k)` the top acrobat jumps, turns over and lands; `bow()` the ring's towers bow;
// `ripple(k)` a wave of balance goes up a tower.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBody } from './acro-figures.js';
import { CEN, D, N, SEA, SPAN, NPIER, LEVEL, Y_SPRING, ARCH_R, Y_DECK, DECK0, DECK_W, DECK_END, TRACK_U, OPEN, toWorld, pierS, terrain, FLOOR_Y, RING } from './acro-plan.js';

export const NEAR = 15, FAR = 46;   // metres: people inside NEAR, stone past FAR
const HI = 52;                       // towers nearer than this drawn with the detailed bodies
const COL = 0.25;                    // a tower's two columns, either side of its middle

// The stone and the morph, shared by the bodies, the cores and the deck (kind: 0 a body, 1 a core, 2 always stone).
const STONE_GLSL = `
  float sth(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float stn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sth(i), sth(i + vec3(1, 0, 0)), f.x), mix(sth(i + vec3(0, 1, 0)), sth(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(sth(i + vec3(0, 0, 1)), sth(i + vec3(1, 0, 1)), f.x), mix(sth(i + vec3(0, 1, 1)), sth(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  vec3 stoneCol(vec3 w, vec3 n) {
    float g = stn(w * 3.1) * 0.5 + stn(w * 9.0) * 0.3 + stn(w * 0.6) * 0.2;
    vec3 c = mix(vec3(0.5, 0.47, 0.52), vec3(0.66, 0.62, 0.64), g);
    c = mix(c, vec3(0.42, 0.45, 0.43), smoothstep(0.6, 0.8, stn(w * 0.9 + 4.0)) * 0.5);    // weathering, lichen-dark
    float course = smoothstep(0.035, 0.0, abs(fract(w.y / 0.58) - 0.5) - 0.465);           // the courses of the masonry
    c *= 1.0 - course * 0.32 * (1.0 - abs(n.y));
    c *= 0.82 + 0.18 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);                                   // grime in the undersides
    return c;
  }`;
function morphMat(kind, time, uNear, uFar, inst = kind === 0) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: kind !== 2, color: '#ffffff', roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { time, uNear, uFar });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float time, uNear, uFar;
      attribute float aBreath; attribute vec3 aSpine;
      ${kind === 2 ? '' : inst ? 'attribute float iBias; attribute float iPhase;' : 'attribute float iBias; float iPhase = 0.0;'}
      varying vec3 vW; varying float vStone;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        ${kind === 2 ? 'float iBias = 1.0, iPhase = 0.0; vec3 aSp = transformed;' : 'vec3 aSp = aSpine;'}
        mat4 toW = modelMatrix${inst ? ' * instanceMatrix' : ''};
        vec3 sw = (toW * vec4(aSp, 1.0)).xyz;
        float st = max(iBias, smoothstep(uNear, uFar, distance(sw, cameraPosition)));
        vStone = st;
        ${kind === 0 ? `transformed += normal * aBreath * 0.012 * sin(time * 1.7 + iPhase * 6.28) * (1.0 - st);
        transformed = aSp + (transformed - aSp) * (1.0 + 0.16 * st);` : ''}
        ${kind === 1 ? 'transformed = aSp + (transformed - aSp) * st;' : ''}
      }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
      vW = (modelMatrix${inst ? ' * instanceMatrix' : ''} * vec4(transformed, 1.0)).xyz;`);
    // (instanced: three's own begin/project use instanceMatrix; the shadow/normal chunks aren't changed)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW; varying float vStone; ${STONE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 nW = normalize(cross(dFdx(vW), dFdy(vW)));
        float st = ${kind === 2 ? '1.0' : 'vStone'};
        vec3 sc = stoneCol(vW, nW);
        // people: the costume's colour, a little sheen of cloth; stone: its own, and the creases filled with shadow
        diffuseColor.rgb = mix(diffuseColor.rgb, sc, st); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.72, 0.96, ${kind === 2 ? '1.0' : 'vStone'});`);
  };
  m.customProgramCacheKey = () => `acro-morph-${kind}-${inst}`;
  return m;
}

const tint = (g, col, spine) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, c = new THREE.Color(col), a = new Float32Array(n * 3), s = new Float32Array(n * 3), b = new Float32Array(n), p = g.attributes.position;
  for (let k = 0; k < n; k++) {
    a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b;
    const sp = spine(p.getX(k), p.getY(k), p.getZ(k)); s[k * 3] = sp[0]; s[k * 3 + 1] = sp[1]; s[k * 3 + 2] = sp[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.setAttribute('aSpine', new THREE.BufferAttribute(s, 3)); g.setAttribute('aBreath', new THREE.BufferAttribute(b, 1));
  return g;
};

export function buildViaduct(fl, R, time) {
  const root = new THREE.Group(), uNear = { value: NEAR }, uFar = { value: FAR };
  fl.scene.add(root);
  const bodyM = morphMat(0, time, uNear, uFar), stoneM = morphMat(2, time, uNear, uFar);

  // ----- the towers: where each one stands, its levels, the people in it -----
  // A tower's own frame: x along the line (+s), y up, z toward the near side (-u): the acrobats face you as you arrive.
  const yaw = Math.atan2(-N.x, -N.z);   // local +z → world -N
  const towers = [];
  const addTower = (k, s, u, ground, { arch = [false, false], free = false, ring = false, top = false } = {}) => {
    const w = toWorld(s, u), n = Math.max(2, Math.floor((Y_SPRING - ground - 0.02) / LEVEL));
    const T = { k, s, u, x: w.x, z: w.z, g: ground, n, y0: Y_SPRING - n * LEVEL, figs: [], arch, free, ring, top, phase: R(), flip: -1, bow: -1, rip: -1, sway: 1, stone: 0,
      root: new THREE.Matrix4().compose(new THREE.Vector3(w.x, 0, w.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)),
      lv: Array.from({ length: n + 2 }, () => new THREE.Matrix4()) };
    if (free) { T.n = n; T.y0 = ground; }
    // each level: two of them side by side, shoulder to shoulder, the men below, the women above; built broad
    const bulk = (x, z, ry) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1.16, 1, 1.18));
    const cols = free ? [0] : [-COL, COL];
    for (let i = 0; i < T.n; i++) for (const cx of cols) {
      const fem = i >= Math.max(2, Math.round(T.n * 0.55)) || (i > 0 && R() < 0.12);
      T.figs.push({ kind: 'base', sex: fem ? 'f' : 'm', lvl: i, local: bulk(cx, (R() - 0.5) * 0.04, (R() - 0.5) * 0.14) });
    }
    if (top) T.figs.push({ kind: 'top', sex: 'f', lvl: T.n, local: bulk(free ? 0 : COL, 0, 0), top: true });
    // the arches' chains off its top, from the column on that side: toward +s (arch[1]) and toward -s (arch[0]); two
    // abreast, a little apart across the line
    const RA = ARCH_R - COL;
    for (const [side, on] of [[-1, arch[0]], [1, arch[1]]]) {
      if (!on) continue;
      const cx = side * ARCH_R;
      for (const dz of [-0.17, 0.17]) for (let j = 0; j < 3; j++) {
        const a0 = Math.PI - j * Math.PI / 6, a1 = Math.PI - (j + 1) * Math.PI / 6;
        // in the arch's plane (x, y), round its centre (cx, 0); this side's mirrored
        const p0 = new THREE.Vector3(cx + side * RA * Math.cos(a0), RA * Math.sin(a0), dz), p1 = new THREE.Vector3(cx + side * RA * Math.cos(a1), RA * Math.sin(a1), dz);
        const d = p1.clone().sub(p0), len = d.length(), phi = Math.atan2(-d.x, d.y);
        const m = new THREE.Matrix4().compose(p0, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), phi), new THREE.Vector3(1.12, len / 2.15, 1.12));
        T.figs.push({ kind: 'chain', sex: (j + k + (dz > 0 ? 1 : 0)) % 2 ? 'f' : 'm', lvl: T.n, local: m, chain: true });
      }
    }
    towers.push(T);
    return T;
  };
  for (let k = 0; k < NPIER; k++) {
    const s = pierS(k), w = toWorld(s, 0), g0 = k < 2 ? FLOOR_Y : terrain(w.x, w.z);
    const sea = g0 < SEA + 0.6;
    const T = addTower(k, s, 0, sea ? SEA + 1.4 : g0, { arch: [k > 0, k < NPIER - 1], top: k === 0, ring: k < 2 });
    T.sea = sea;
    T.bias = 0;
  }
  // two more in the ring, on their own, shorter, for the show
  for (const [s, u, n] of [[-5.5, -4.6, 3], [3.2, -5.2, 4]]) {
    const T = addTower(-1, s, u, FLOOR_Y, { free: true, ring: true, top: true });
    T.figs = T.figs.filter((f) => f.lvl >= T.n - n || f.top).map((f) => ({ ...f, lvl: f.lvl - (T.n - n) }));
    T.n = n; T.y0 = FLOOR_Y; T.bias = 0;
  }

  // ----- the instanced bodies: a mesh per pose and costume, hi and lo -----
  const KINDS = [['base', 'm'], ['base', 'f'], ['top', 'f'], ['chain', 'm'], ['chain', 'f']];
  const keyOf = (f) => `${f.kind}-${f.sex}`;
  const count = {};
  for (const T of towers) for (const f of T.figs) count[keyOf(f)] = (count[keyOf(f)] || 0) + 1;
  const meshes = {};
  for (const [kind, sex] of KINDS) {
    const key = `${kind}-${sex}`, n = count[key] || 1;
    meshes[key] = {};
    for (const q of ['hi', 'lo']) {
      const g = makeBody(kind, sex, q);
      g.setAttribute('iBias', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      g.setAttribute('iPhase', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      const im = new THREE.InstancedMesh(g, bodyM, n);
      im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(im); meshes[key][q] = im;
    }
  }

  // ----- the cores: a pier inside each tower, an arch ring along each arch; nothing while they're people -----
  const coreParts = [];
  for (const T of towers) {
    if (T.free) continue;
    const h = Y_SPRING - T.y0, cx = T.x, cz = T.z;
    const g = new THREE.BoxGeometry(0.72, h + 0.3, 0.5, 1, 6, 1).translate(0, T.y0 + (h + 0.3) / 2 - 0.15, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(cx, 0, cz);
    coreParts.push(tint(g, '#8a8490', (x, y) => [cx, Math.min(Y_SPRING, Math.max(T.y0, y)), cz]));
  }
  // the arch rings, from each tower's top to the next one's
  for (let k = 0; k < NPIER - 1; k++) {
    const a = toWorld(pierS(k), 0), b = toWorld(pierS(k + 1), 0), c = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const sh = new THREE.Shape();
    sh.absarc(0, 0, ARCH_R + 0.34, 0, Math.PI, false); sh.absarc(0, 0, ARCH_R - 0.3, Math.PI, 0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.64, bevelEnabled: false, curveSegments: 18 }).translate(0, 0, -0.32);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(c.x, Y_SPRING, c.z);
    const dx = D.x, dz = D.z;
    coreParts.push(tint(g, '#8a8490', (x, y, z) => {   // its middle line: radius ARCH_R round the arch's centre, at the same angle
      const ls = (x - c.x) * dx + (z - c.z) * dz, ly = y - Y_SPRING, r = Math.hypot(ls, ly) || 1;
      return [c.x + dx * ls / r * ARCH_R, Y_SPRING + ly / r * ARCH_R, c.z + dz * ls / r * ARCH_R];
    }));
  }
  const coreG = mergeGeometries(coreParts);
  coreG.setAttribute('iBias', new THREE.BufferAttribute(new Float32Array(coreG.attributes.position.count), 1));
  // (not instanced: iBias per vertex, 0: only the distance)
  const coreMat = morphMat(1, time, uNear, uFar, false);
  const cores = new THREE.Mesh(coreG, coreMat);
  root.add(cores);

  // ----- always stone: the cutwaters in the sea, footings on the rocks, the deck, its spandrels, parapets, the rails -----
  const sp = [];
  const put = (g, s, u, y) => { const w = toWorld(s, u); g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); g.translate(w.x, y, w.z); sp.push(g); };
  for (const T of towers) {
    if (T.free || T.k < 2) continue;
    const bot = T.sea ? SEA - 1.2 : T.g - 0.8, h = T.y0 - bot;
    if (h < 0.15) continue;
    // a cutwater, pointed upstream and down (along u), its top a little inside the feet
    const shp = new THREE.Shape(), w2 = T.sea ? 0.85 : 0.6, d2 = T.sea ? 0.7 : 0.5;
    shp.moveTo(-w2, -d2); shp.lineTo(w2, -d2); shp.lineTo(w2 + 0.0, d2); shp.lineTo(-w2, d2); shp.closePath();
    if (T.sea) { shp.curves.length = 0; shp.moveTo(-w2, -d2); shp.lineTo(w2, -d2); shp.lineTo(w2, d2); shp.lineTo(0, d2 + 0.7); shp.lineTo(-w2, d2); shp.lineTo(-w2, -d2); }
    const g = new THREE.ExtrudeGeometry(shp, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2);
    // (shape's y → -z after rotating: its point toward local -z, the far side)
    put(g, T.s, 0, bot);
    if (T.sea) { const cap = new THREE.BoxGeometry(w2 * 2 + 0.16, 0.12, d2 * 2 + 0.16); put(cap, T.s, 0, T.y0 - 0.06); }
  }
  // the deck: a slab from DECK0 out, its cornice, the parapets (open onto the headland at OPEN), the spandrels over the arches
  const L = DECK_END - DECK0, mid = (DECK0 + DECK_END) / 2;
  const slab = (s0, s1, u0, u1, y0, y1) => { const g = new THREE.BoxGeometry(s1 - s0, y1 - y0, u1 - u0); put(g, (s0 + s1) / 2, -(u0 + u1) / 2, (y0 + y1) / 2); };
  // (put()'s local z is -u: a box's u span is centred at -(u0+u1)/2 in local z, i.e. u (u0+u1)/2)
  slab(DECK0, DECK_END, -DECK_W, DECK_W, Y_DECK - 0.62, Y_DECK - 0.02);
  slab(DECK0 - 0.02, DECK_END, -DECK_W - 0.12, -DECK_W + 0.0, Y_DECK - 0.82, Y_DECK - 0.62);   // the cornice's drip, each side
  slab(DECK0 - 0.02, DECK_END, DECK_W, DECK_W + 0.12, Y_DECK - 0.82, Y_DECK - 0.62);
  const parapet = (s0, s1, u) => { slab(s0, s1, u - 0.15, u + 0.15, Y_DECK - 0.02, Y_DECK + 0.85); slab(s0 - 0.03, s1 + 0.03, u - 0.2, u + 0.2, Y_DECK + 0.85, Y_DECK + 0.97); };
  parapet(DECK0 + 0.0, DECK_END, -DECK_W + 0.15);
  parapet(DECK0, OPEN[0], DECK_W - 0.15); parapet(OPEN[1], DECK_END, DECK_W - 0.15);
  slab(DECK0 - 0.3, DECK0, -DECK_W - 0.12, DECK_W + 0.12, Y_DECK - 0.82, Y_DECK + 0.4);   // the deck's end, toward the ring
  for (let k = 0; k < NPIER - 1; k++) {
    const s0 = pierS(k), s1 = pierS(k + 1);
    if (s1 <= DECK0) continue;
    const shp = new THREE.Shape(), top = Y_DECK - 0.62 - Y_SPRING, rr = ARCH_R + 0.36;
    shp.moveTo(-ARCH_R, 0); shp.lineTo(-ARCH_R, top); shp.lineTo(ARCH_R, top); shp.lineTo(ARCH_R, 0); shp.lineTo(rr, 0);
    shp.absarc(0, 0, rr, 0, Math.PI, false); shp.lineTo(-ARCH_R, 0);
    for (const u of [-0.62, 0.62]) {
      const g = new THREE.ExtrudeGeometry(shp, { depth: 0.24, bevelEnabled: false, curveSegments: 14 }).translate(0, 0, -0.12);
      put(g, (s0 + s1) / 2, -u, Y_SPRING);
    }
  }
  // the track: sleepers and two rails, on the near half; the buffers at its end
  const rails = [], sleepers = [];
  const RS = 1.435 / 2;
  for (const du of [-RS, RS]) { const g = new THREE.BoxGeometry(L - 0.8, 0.09, 0.07); const w = toWorld(mid + 0.4, TRACK_U + du); g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); g.translate(w.x, Y_DECK + 0.15, w.z); rails.push(g); }
  for (let s = DECK0 + 0.8; s < DECK_END; s += 0.75) { const g = new THREE.BoxGeometry(0.24, 0.1, 2.5); const w = toWorld(s, TRACK_U); g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); g.translate(w.x, Y_DECK + 0.05, w.z); sleepers.push(g); }
  // a low iron rail between the walk and the track
  for (const h of [0.45, 0.95]) { const g = new THREE.BoxGeometry(L - 0.5, 0.04, 0.04); const w = toWorld(mid + 0.25, 0.25); g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); g.translate(w.x, Y_DECK + h, w.z); rails.push(g); }
  for (let s = DECK0 + 0.6; s < DECK_END; s += 2.4) { const g = new THREE.BoxGeometry(0.05, 1.0, 0.05); const w = toWorld(s, 0.25); g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); g.translate(w.x, Y_DECK + 0.48, w.z); rails.push(g); }
  {   // the buffer stop
    const w = DECK0 + 0.7;
    for (const du of [-RS, RS]) { const g = new THREE.BoxGeometry(0.2, 0.95, 0.24); const p = toWorld(w, TRACK_U + du); g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); g.translate(p.x, Y_DECK + 0.47, p.z); rails.push(g); }
    const beam = new THREE.BoxGeometry(0.3, 0.32, 2.3); const p = toWorld(w + 0.2, TRACK_U); beam.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); beam.translate(p.x, Y_DECK + 0.8, p.z); sleepers.push(beam);
  }
  const stone = new THREE.Mesh(mergeGeometries(sp.map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.setAttribute('aBreath', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1)); g.setAttribute('aSpine', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3)); return g; })), stoneM);
  root.add(stone);
  const ironM = new THREE.MeshStandardMaterial({ color: '#3e3d44', roughness: 0.5, metalness: 0.7 });
  const woodM = new THREE.MeshStandardMaterial({ color: '#4a3b34', roughness: 0.95 });
  root.add(new THREE.Mesh(mergeGeometries(rails.map((g) => { g.deleteAttribute('uv'); return g; })), ironM), new THREE.Mesh(mergeGeometries(sleepers.map((g) => { g.deleteAttribute('uv'); return g; })), woodM));

  // ----- each frame: which towers are near, and the people in them moved -----
  const m = new THREE.Matrix4(), m2 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3();
  const fm = new THREE.Matrix4();
  const slots = {};   // per mesh key and quality: the figures it's drawing, in order
  for (const k in meshes) slots[k] = { hi: [], lo: [] };
  let lastPack = null;
  const cam = new THREE.Vector3(1e9, 0, 0);
  function pack(p) {
    for (const k in slots) { slots[k].hi.length = 0; slots[k].lo.length = 0; }
    for (const T of towers) {
      T.hi = Math.hypot(T.x - p.x, T.z - p.z) < HI;
      for (const f of T.figs) slots[keyOf(f)][T.hi ? 'hi' : 'lo'].push([T, f]);
    }
    for (const k in slots) for (const qk of ['hi', 'lo']) {
      const im = meshes[k][qk], list = slots[k][qk], bias = im.geometry.attributes.iBias, ph = im.geometry.attributes.iPhase;
      im.count = list.length;
      list.forEach(([T, f], i) => { bias.setX(i, T.bias); ph.setX(i, (T.phase + f.lvl * 0.37) % 1); f.slot = i; });
      bias.needsUpdate = ph.needsUpdate = true;
    }
    lastPack = p.clone();
  }
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  function place(T, t, all) {
    // how much it moves: people near, still as stone far
    const dist = Math.hypot(T.x - cam.x, T.z - cam.z), live = Math.max(0, 1 - Math.max(T.bias, (dist - NEAR) / (FAR - NEAR)));
    if (!all && live === 0 && T.still) return;
    T.still = live === 0;
    // the bow: the whole tower tips toward you and back; the ripple: a wave of balance going up it
    const bowA = T.bow >= 0 ? Math.sin(Math.min(1, (t - T.bow) / 2.2) * Math.PI) * 0.05 : 0;
    if (T.bow >= 0 && t - T.bow > 2.2) T.bow = -1;
    const rp = T.rip >= 0 ? t - T.rip : -1;
    if (rp > 4) T.rip = -1;
    m.copy(T.root).multiply(m2.makeTranslation(0, T.y0, 0));
    for (let i = 0; i <= T.n; i++) {
      const w = t * 0.9 + T.phase * 6.28 + i * 0.55;
      let ax = (Math.sin(w) * 0.008 + Math.sin(w * 2.3 + 1.1) * 0.004) * live + bowA / Math.max(1, T.n) * 2;
      let az = (Math.sin(w * 0.8 + 2.0) * 0.009 + Math.sin(w * 1.9) * 0.003) * live;
      if (rp >= 0) { const u = rp * 3 - i * 0.6; if (u > 0 && u < 3) az += Math.sin(u * Math.PI * 2 / 3) * 0.035 * (1 - u / 3) * live; }
      if (i > 0) m.multiply(m2.makeTranslation(0, LEVEL, 0));
      m.multiply(m2.makeRotationFromEuler(e.set(ax, 0, az)));
      T.lv[i].copy(m);
    }
    for (const f of T.figs) {
      fm.copy(T.lv[Math.min(f.lvl, T.n)]);
      if (f.lvl === T.n && !f.chain) fm.copy(T.lv[T.n]);
      if (f.top && T.flip >= 0) {   // the flip: up, over backwards, down onto the same shoulders
        const u = (t - T.flip) / 1.5;
        if (u >= 1) T.flip = -1;
        else {
          const k2 = Math.min(1, Math.max(0, (u - 0.12) / 0.76)), hop = Math.sin(Math.min(1, Math.max(0, (u - 0.1) / 0.8)) * Math.PI) * 1.5;
          const crouch = u < 0.12 ? Math.sin(u / 0.12 * Math.PI) * -0.12 : u > 0.88 ? Math.sin((u - 0.88) / 0.12 * Math.PI) * -0.1 : 0;
          fm.multiply(m2.makeTranslation(0, hop + crouch + 1.0, 0)).multiply(m2.makeRotationX(-ease(k2) * Math.PI * 2)).multiply(m2.makeTranslation(0, -1.0, 0));
        }
      }
      fm.multiply(f.local);
      meshes[keyOf(f)][T.hi ? 'hi' : 'lo'].setMatrixAt(f.slot, fm);
    }
  }
  function update(p, t) {
    cam.copy(p);
    let all = false;
    if (!lastPack || lastPack.distanceTo(p) > 4) { pack(p); all = true; }
    for (const T of towers) place(T, t, all);
    for (const k in meshes) { meshes[k].hi.instanceMatrix.needsUpdate = true; meshes[k].lo.instanceMatrix.needsUpdate = true; }
  }

  // what you can collide with: the towers on the rocks and in the ring
  const cols = towers.filter((T) => !T.sea).map((T) => ({ minX: T.x - (T.free ? 0.4 : 0.62), maxX: T.x + (T.free ? 0.4 : 0.62), minZ: T.z - (T.free ? 0.4 : 0.62), maxZ: T.z + (T.free ? 0.4 : 0.62) }));
  // what you can click: a box round each tower you could reach
  const hits = [];
  for (const T of towers) {
    if (T.sea && T.k > 6) continue;
    const h = new THREE.Mesh(new THREE.BoxGeometry(T.free ? 0.8 : 1.3, Y_SPRING - T.y0 + 2.2, 0.8), new THREE.MeshBasicMaterial());
    h.position.set(T.x, T.y0 + (Y_SPRING - T.y0 + 2.2) / 2, T.z); h.rotation.y = yaw; h.visible = false; h.updateMatrixWorld();
    Object.assign(h.userData, { action: 'acro-tower', reach: 14, tower: T });
    root.add(h); hits.push(h);
  }
  const ringT = towers.filter((T) => T.ring);
  return {
    root, towers, meshes, cols, hits, update, uNear, uFar,
    flip(T, t) { if (T.figs.some((f) => f.top) && T.flip < 0) { T.flip = t; return true; } T.rip = t; return false; },
    bow(t) { ringT.forEach((T, i) => { T.bow = t + i * 0.12; }); },
    ripple(T, t) { T.rip = t; },
  };
}
