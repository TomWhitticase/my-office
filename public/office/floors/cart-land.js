// The grey meadow's land (floors/cart.js): an overcast sky, heavy and soft, lighter toward the horizon; the meadows,
// olive and rolling, the path worn ochre through them (drawn per fragment from a map of the distance to it, so its edge
// is crisp wherever you stand), darker under the trees; blue hills far off, hazed; mist lying in the hollows; groves of
// bare, gnarled trees (a few made, instanced); dry grass in tufts; crows on the branches that go up when you come near
// and settle again somewhere further off. Light: the sky's grey from above, a soft light from the upper left.
// Builders are generators (cart.js spreads them over frames).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, vn, terrain, ground, pathDist, PATH_W, HOLLOWS, SHED, SWING, OLD, PRAM, WALL, CEN, MAP, RADIUS } from './cart-plan.js';

export const SKY = { top: new THREE.Color('#4a535b'), mid: new THREE.Color('#78838b'), hor: new THREE.Color('#b0b3a6'), fog: new THREE.Color('#a4a89c'), hill: new THREE.Color('#6d819c') };

/** @returns {Generator<void, any>} */
export function* buildLand(fl, R, time, A) {
  const S = fl.scene, root = new THREE.Group();
  fl.stage.add(root);   // (cart.js shows it once it's all built and drawn once)
  S.background = SKY.fog.clone();
  S.fog = new THREE.FogExp2(SKY.fog.clone(), 0.0052);
  const onCam = (m) => { m.frustumCulled = false; m.onBeforeRender = (r, s, cam) => { const e = cam.matrixWorld.elements; m.position.set(e[12], e[13], e[14]); m.updateMatrixWorld(); }; return m; };

  // ----- the sky: banks of grey cloud, darker above, a paler band low down -----
  const sky = onCam(new THREE.Mesh(new THREE.SphereGeometry(2500, 40, 20), new THREE.ShaderMaterial({
    uniforms: { top: { value: SKY.top }, mid: { value: SKY.mid }, hor: { value: SKY.hor }, time },
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, hor; uniform float time; varying vec3 vD;
      float sh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float sn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
      float sf(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += sn(p) * a; p = p * 2.03 + 1.7; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vD); float up = max(d.y, 0.0);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, up));
        c = mix(c, top, smoothstep(0.12, 0.7, up));
        // cloud: soft heavy masses, their undersides darker, drifting
        vec2 p = d.xz / (0.18 + up) * 1.3 + vec2(time * 0.003, time * 0.0015);
        float cl = sf(p * 0.8), k = smoothstep(0.35, 0.72, cl);
        c = mix(c, c * 0.72 + vec3(0.015, 0.018, 0.024), k * smoothstep(0.02, 0.22, up));
        c = mix(c, c * 1.12 + vec3(0.03), smoothstep(0.52, 0.82, sf(p * 1.7 + 4.0)) * 0.6 * smoothstep(0.02, 0.3, up));
        // a paler, warmer seam low over the hills
        c += vec3(0.03, 0.028, 0.015) * exp(-abs(d.y - 0.04) * 22.0);
        if (d.y < 0.0) c = hor;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })));
  sky.renderOrder = -2; root.add(sky);
  yield;

  // ----- the ground: a polar grid round the middle (cart-sculpt.js groundArrays, made in the worker) and its map -----
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(A.ground.pos, 3)); tg.setAttribute('normal', new THREE.BufferAttribute(A.ground.nrm, 3));
  tg.setIndex(new THREE.BufferAttribute(A.ground.idx, 1)); tg.computeBoundingSphere();
  // the map the ground's colour reads: r the distance to the path (0-8 m), g shade under trees and things
  const MN = MAP.n, M0 = { x: MAP.x0, z: MAP.z0 }, MW = MAP.w, md = A.ground.md;
  const shadeAt = (x, z, r, s) => {   // darken the ground round (x, z): radius r, strength s
    const ci = (x - M0.x) / MW * MN, cj = (z - M0.z) / MW * MN, rr = r / MW * MN;
    for (let j = Math.floor(cj - rr); j <= Math.ceil(cj + rr); j++) for (let i = Math.floor(ci - rr); i <= Math.ceil(ci + rr); i++) {
      if (i < 0 || j < 0 || i >= MN || j >= MN) continue;
      const d = Math.hypot(i - ci, j - cj) / rr; if (d >= 1) continue;
      const kk = (j * MN + i) * 4; md[kk + 1] = Math.min(255, md[kk + 1] + (1 - d * d) * s * 255);
    }
  };
  const mapT = new THREE.DataTexture(md, MN, MN); mapT.magFilter = mapT.minFilter = THREE.LinearFilter; mapT.wrapS = mapT.wrapT = THREE.ClampToEdgeWrapping;
  const groundM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.97, metalness: 0 });
  groundM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tPath: { value: mapT }, m0: { value: new THREE.Vector2(M0.x, M0.z) }, mw: { value: MW }, pathW: { value: PATH_W } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW; uniform sampler2D tPath; uniform vec2 m0; uniform float mw, pathW;
      float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
      float gf(vec2 p) { return gn(p) * 0.5 + gn(p * 2.1 + 3.1) * 0.3 + gn(p * 4.3 + 7.7) * 0.2; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vW.xz, mu = (p - m0) / mw;
        vec4 m = texture2D(tPath, mu);
        float inside = step(0.0, mu.x) * step(mu.x, 1.0) * step(0.0, mu.y) * step(mu.y, 1.0);
        float pd = mix(99.0, m.r * 8.0, inside);
        // the meadow: olive, yellower in its swells, a darker sage in patches, brushed with a few long strokes
        float n1 = gf(p * 0.05), n2 = gf(p * 0.23), n3 = gn(p * 1.7);
        vec3 olive = vec3(0.36, 0.38, 0.17), yel = vec3(0.47, 0.45, 0.2), sage = vec3(0.27, 0.32, 0.17), dry = vec3(0.5, 0.45, 0.28);
        vec3 c = mix(olive, yel, smoothstep(0.35, 0.7, n1));
        c = mix(c, sage, smoothstep(0.55, 0.8, n2) * 0.7);
        c = mix(c, dry, smoothstep(0.62, 0.9, gf(p * 0.11 + 9.0)) * 0.45);
        c *= 0.92 + n3 * 0.12;
        // the path: bare ochre earth, a rut either side, a ragged edge into the grass
        float edge = pathW * (0.9 + 0.35 * (gn(p * 1.3) - 0.5));
        float onP = 1.0 - smoothstep(edge - 0.18, edge + 0.12, pd);
        vec3 earth = mix(vec3(0.58, 0.47, 0.27), vec3(0.66, 0.55, 0.33), gn(p * 0.8)) * (0.93 + 0.1 * gn(p * 6.0));
        earth *= 1.0 - 0.1 * exp(-pow((pd - 0.45) / 0.12, 2.0));
        c = mix(c, earth, onP);
        c = mix(c, c * 0.86, (1.0 - onP) * exp(-pow((pd - edge - 0.3) / 0.35, 2.0)));   // the grass darker where it's trodden at the edge
        // under the trees and the things in the meadow; a little darker in the hollows
        c *= 1.0 - m.g * 0.42 * inside;
        c *= 0.88 + 0.12 * smoothstep(-2.5, 0.5, vW.y);
        diffuseColor.rgb = c;
      }`);
  };
  groundM.customProgramCacheKey = () => 'cart-ground';
  const land = new THREE.Mesh(tg, groundM);
  land.userData.ground = true;
  root.add(land);
  yield;

  // ----- the hills: a ring far out, blue and hazed, paler toward their feet -----
  {
    const N = 360, rows = 6, hp = [], hi = [];
    for (let a = 0; a <= N; a++) {
      const t = (a / N) * Math.PI * 2, top = 70 + 90 * fbm(Math.cos(t) * 3 + 11, Math.sin(t) * 3 + 2) ** 1.6 + 60 * Math.max(0, Math.sin(t * 2 + 0.8)) ** 3;
      for (let r = 0; r < rows; r++) {
        const f = r / (rows - 1), rad = 900 + 260 * (1 - f) * 0.5 + 120 * fbm(Math.cos(t) * 2, Math.sin(t) * 2);
        hp.push(CEN.x + Math.cos(t) * rad, -30 + (top + 30) * Math.sin(f * Math.PI / 2), CEN.z + Math.sin(t) * rad);
      }
    }
    for (let a = 0; a < N; a++) for (let r = 0; r < rows - 1; r++) { const p0 = a * rows + r, p1 = p0 + rows; hi.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); g.setIndex(hi);
    // a second, nearer and darker range in front of it, lower
    const hills = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { hill: { value: SKY.hill }, hor: { value: SKY.hor }, fogc: { value: SKY.fog } }, fog: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vW; void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }',
      fragmentShader: `uniform vec3 hill, hor, fogc; varying vec3 vW;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() { float k = clamp(vW.y / 140.0, 0.0, 1.0); vec3 c = mix(fogc, hill, 0.35 + 0.5 * smoothstep(0.0, 0.7, k));
          c *= 0.97 + 0.06 * h(floor(vW.xz * 0.05)); gl_FragColor = vec4(c, 1.0); }`,
    }));
    hills.renderOrder = -1; hills.frustumCulled = false; root.add(hills);
  }
  yield;

  // ----- mist in the hollows: soft banks of it, each a quad turned to the camera (in the shader), low over the ground,
  // drifting; thinner close to you, so you walk into it rather than through a sheet -----
  const MIST = [];
  for (const [hx, hz, r] of HOLLOWS) for (let k = 0; k < 46; k++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * r * 1.1, x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d;
    MIST.push([x, ground(x, z) + 0.5 + R() * 0.7, z, 5 + R() * 6]);
  }
  for (let k = 0; k < 40; k++) { const a = R() * 6.28, d = 30 + R() * 70, x = CEN.x + Math.cos(a) * d, z = CEN.z + Math.sin(a) * d; MIST.push([x, ground(x, z) + 0.6 + R(), z, 8 + R() * 8]); }
  const mg = new THREE.InstancedBufferGeometry(); mg.index = new THREE.PlaneGeometry(1, 1).index; mg.setAttribute('position', new THREE.PlaneGeometry(1, 1).attributes.position);
  mg.setAttribute('at', new THREE.InstancedBufferAttribute(new Float32Array(MIST.flat()), 4));
  mg.instanceCount = MIST.length;
  const mistM = new THREE.ShaderMaterial({
    uniforms: { time, col: { value: new THREE.Color('#c4c7be') } }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 at; uniform float time; varying vec2 vUv; varying float vA; varying vec3 vW;
      void main() {
        vUv = position.xy + 0.5;
        float w = at.w, ph = fract(at.x * 0.137 + at.z * 0.071);
        vec3 c = at.xyz + vec3(sin(time * 0.05 + ph * 6.28) * 2.0, 0.0, cos(time * 0.04 + ph * 6.28) * 1.5);
        // turned to the camera about the vertical; low and wide
        vec3 toC = cameraPosition - c; vec3 rt = normalize(vec3(toC.z, 0.0, -toC.x));
        vec3 p = c + rt * position.x * w + vec3(0.0, 1.0, 0.0) * position.y * w * 0.32;
        vW = p;
        float d = length(toC);
        vA = smoothstep(2.0, 12.0, d) * (0.55 + 0.45 * sin(time * 0.11 + ph * 9.0));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 col; varying vec2 vUv; varying float vA; varying vec3 vW;
      void main() {
        vec2 q = vUv - 0.5; float r = length(q * vec2(1.0, 1.6)) * 2.0;
        float a = smoothstep(1.0, 0.1, r) * smoothstep(0.0, 0.35, vUv.y + 0.1) * 0.16 * vA;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mist = new THREE.Mesh(mg, mistM); mist.frustumCulled = false; mist.renderOrder = 2;
  root.add(mist);
  yield;

  // ----- the trees: a few made, gnarled and bare, each many times over -----
  const variants = [];
  for (let v = 0; v < 6; v++) { variants.push(makeTree(R, v)); yield; }
  const barkM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  // where: in groves either side of the path, a few on their own; the tableau's own; never on the path or the things
  const spots = [];
  const clear = (x, z, r = 0) => {
    if (pathDist(x, z) < 2.4 + r) return false;
    if (Math.hypot(x, z) < 5 || Math.hypot(x - SHED.x, z - SHED.z) < 7 || Math.hypot(x - SWING.x, z - SWING.z) < 4.5 || Math.hypot(x - PRAM.x, z - PRAM.z) < 3) return false;
    for (const o of OLD) if (Math.hypot(x - o.x, z - o.z) < 3.4) return false;
    for (const s of spots) if (Math.hypot(x - s.x, z - s.z) < 3.2) return false;
    return true;
  };
  // the picture's: thin ones on the left of the girl, one big one behind the cart on the right, one in the right foreground
  for (const [x, z, v, s, a] of [[-3.2, -11, 0, 0.9, 0.3], [-4.6, -15, 1, 0.85, 1.4], [-2.6, -18.5, 2, 0.95, 2.2], [-6.5, -9.5, 3, 0.8, 4.1], [5.2, -15.5, 4, 1.25, 0.8], [2.7, -5.0, 5, 1.0, 2.9], [-9, -24, 1, 1.1, 0.4], [8.5, -21, 0, 1.0, 5.2]]) spots.push({ x, z, v, s, a });
  for (let n = 0; n < 4000 && spots.length < 190; n++) {
    const x = -95 + R() * 190, z = -120 + R() * 150;
    if (Math.hypot(x - CEN.x, z - CEN.z) > RADIUS + 25) continue;
    const grove = fbm(x * 0.045 + 3, z * 0.045 + 8);
    if (grove < 0.5 && R() > 0.06) continue;
    if (!clear(x, z)) continue;
    spots.push({ x, z, v: Math.floor(R() * variants.length), s: 0.75 + R() * 0.55, a: R() * 6.28 });
  }
  yield;
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
  const trees = [], perches = [], cols = [];
  for (let v = 0; v < variants.length; v++) {
    const list = spots.filter((s) => s.v === v);
    const im = new THREE.InstancedMesh(variants[v].geo, barkM, list.length);
    list.forEach((s, i) => {
      const y = ground(s.x, s.z) - 0.1;
      m4.compose(pp.set(s.x, y, s.z), qt.setFromAxisAngle(yAx, s.a), sc.set(s.s, s.s * (0.92 + (s.a % 0.3)), s.s));
      im.setMatrixAt(i, m4);
      for (const t of variants[v].perch) perches.push(new THREE.Vector3().copy(t).applyMatrix4(m4));
      const r = 0.16 * s.s * variants[v].girth;
      cols.push({ minX: s.x - r, maxX: s.x + r, minZ: s.z - r, maxZ: s.z + r });
      shadeAt(s.x, s.z, 3.5 * s.s, 0.35);
    });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    root.add(im); trees.push(im);
  }
  // shade under the things in the meadow
  for (const o of OLD) shadeAt(o.x, o.z, 2.4, 0.45);
  shadeAt(SHED.x, SHED.z, 4.5, 0.5); shadeAt(SWING.x, SWING.z, 4.5, 0.35); shadeAt(PRAM.x, PRAM.z, 1.6, 0.4);
  mapT.needsUpdate = true;
  yield;

  // ----- dry grass: tufts of thin blades, thicker off the path, swaying a little -----
  {
    const blades = [];
    for (let b = 0; b < 14; b++) {
      const a = (b / 14) * Math.PI * 2 + R(), h = 0.1 + R() * 0.2, lean = 0.06 + R() * 0.12;
      const g = new THREE.BufferGeometry(), w = 0.014;
      const tip = [Math.cos(a) * lean, h, Math.sin(a) * lean], ox = -Math.sin(a) * w, oz = Math.cos(a) * w;
      g.setAttribute('position', new THREE.Float32BufferAttribute([ox * 1.4, 0, oz * 1.4, -ox * 1.4, 0, -oz * 1.4, tip[0], tip[1], tip[2]], 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute([0.33, 0.35, 0.16, 0.33, 0.35, 0.16, 0.5, 0.48, 0.26], 3));
      blades.push(g);
    }
    const tuft = mergeGeometries(blades); tuft.computeVertexNormals();
    const grassM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    grassM.onBeforeCompile = (sh) => {
      sh.uniforms.time = time;
      sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 w = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = sin(time * 1.3 + w.x * 0.3 + w.z * 0.2) * 0.5 + sin(time * 2.9 + w.x) * 0.2;
          transformed.x += s * transformed.y * 0.18; transformed.z += s * transformed.y * 0.08; }`);
      sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vec3(0.0, 1.0, 0.0);');
    };
    grassM.customProgramCacheKey = () => 'cart-grass';
    const list = [];
    for (let n = 0; n < 30000 && list.length < 7000; n++) {
      const x = CEN.x - 75 + R() * 150, z = CEN.z - 75 + R() * 150, d = pathDist(x, z);
      if (d < PATH_W + 0.25 || Math.hypot(x - CEN.x, z - CEN.z) > 78) continue;
      if (Math.abs(x - SHED.x) < 3 && Math.abs(z - SHED.z) < 3) continue;
      if (fbm(x * 0.12, z * 0.12) < 0.5 + (d < 3 ? -0.12 : 0)) continue;
      list.push([x, z]);
    }
    const im = new THREE.InstancedMesh(tuft, grassM, list.length);
    list.forEach(([x, z], i) => { const s = 0.7 + R() * 0.8; im.setMatrixAt(i, m4.compose(pp.set(x, ground(x, z) - 0.02, z), qt.setFromAxisAngle(yAx, R() * 6.28), sc.set(s, s * (0.7 + R() * 0.6), s))); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); root.add(im);
  }
  yield;

  // ----- a tumbledown dry-stone wall along the meadow's edge -----
  {
    const stones = [];
    for (let w = 0; w < WALL.length - 1; w++) {
      const [x0, z0] = WALL[w], [x1, z1] = WALL[w + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 0.42);
      for (let i = 0; i < n; i++) {
        const t = (i + R() * 0.3) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, gap = vn(x * 0.2, z * 0.2);
        const rows = gap < 0.35 ? 0 : gap < 0.55 ? 1 : 3;
        for (let r = 0; r < rows; r++) {
          const g = new THREE.DodecahedronGeometry(0.2 + R() * 0.08, 0); g.scale(1.2, 0.62, 0.9);
          g.rotateY(Math.atan2(x1 - x0, z1 - z0) + R() * 0.4).translate(x + (R() - 0.5) * 0.1, ground(x, z) + 0.08 + r * 0.24, z + (R() - 0.5) * 0.1);
          stones.push(g);
        }
      }
    }
    const g = mergeGeometries(stones); g.computeVertexNormals();
    root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#7d7a6e', roughness: 1, flatShading: true })));
    for (let w = 0; w < WALL.length - 1; w++) {   // (its colliders: a few boxes along each stretch)
      const [x0, z0] = WALL[w], [x1, z1] = WALL[w + 1];
      for (let i = 0; i < 6; i++) { const x = x0 + (x1 - x0) * (i + 0.5) / 6, z = z0 + (z1 - z0) * (i + 0.5) / 6, hx = Math.abs(x1 - x0) / 12 + 0.3, hz = Math.abs(z1 - z0) / 12 + 0.3; cols.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz }); }
    }
  }
  yield;

  // ----- crows: black, perched along the branch tips; up when you come near, over to a tree further off -----
  const crows = makeCrows(R, time, perches);
  root.add(crows.mesh);
  yield;

  // (made by cart.js lights() as the build starts, so that the scene's lights never change: see there)

  return {
    root, land, mist, trees, crows, cols, perches, spots,
    /** the haze: thicker toward the edge (r: how far you are from the middle) */
    haze(r) { S.fog.density = 0.0052 + Math.max(0, r - RADIUS + 18) * 0.0012; },
    update(dt, t, you) { crows.update(dt, t, you); },
  };
}

// ----- a bare tree: a trunk and branches in tapered segments, each bent a little from the last; twigs at the ends -----
function makeTree(R, v) {
  const P = [], N = [], C = [], perch = [];
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), a1 = new THREE.Vector3(), a2 = new THREE.Vector3();
  const tall = [7.5, 6.2, 8.6, 5.4, 9.5, 6.8][v], spread = [0.9, 1.25, 0.75, 1.4, 1.15, 1.0][v], girth = [1, 0.85, 1.1, 0.8, 1.5, 0.95][v];
  const bark = new THREE.Color('#463d35'), moss = new THREE.Color('#4f5a3c'), pale = new THREE.Color('#6b6359');
  // a ring of `sides` points round p, across direction d, radius r
  function ring(p, d, r, sides, out) {
    tmp.copy(Math.abs(d.y) < 0.95 ? up : new THREE.Vector3(1, 0, 0));
    a1.crossVectors(d, tmp).normalize(); a2.crossVectors(d, a1).normalize();
    for (let s = 0; s < sides; s++) { const t = (s / sides) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t); out.push([p.x + (a1.x * c + a2.x * sn) * r, p.y + (a1.y * c + a2.y * sn) * r, p.z + (a1.z * c + a2.z * sn) * r, a1.x * c + a2.x * sn, a1.y * c + a2.y * sn, a1.z * c + a2.z * sn]); }
  }
  function tube(pts, rads, sides) {
    const rings = [];
    for (let i = 0; i < pts.length; i++) {
      const d = new THREE.Vector3().subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      const r = []; ring(pts[i], d, rads[i], sides, r); rings.push(r);
    }
    for (let i = 0; i < rings.length - 1; i++) for (let s = 0; s < sides; s++) {
      const a = rings[i][s], b = rings[i][(s + 1) % sides], c = rings[i + 1][s], d = rings[i + 1][(s + 1) % sides];
      for (const q of [a, c, b, b, c, d]) {
        P.push(q[0], q[1], q[2]); N.push(q[3], q[4], q[5]);
        const m = Math.max(0, 1 - q[1] / 2.2) * 0.6 * (q[3] * -0.5 + 0.5), col = bark.clone().lerp(moss, m).lerp(pale, Math.max(0, q[1] - 4) * 0.04);
        C.push(col.r, col.g, col.b);
      }
    }
  }
  // a branch from p along d, length L, radius r0; depth: how many more times it splits
  function branch(p, d, L, r0, depth) {
    const segs = depth >= 3 ? 7 : depth >= 2 ? 5 : 4, pts = [p.clone()], rads = [r0];
    const dir = d.clone(), cur = p.clone();
    for (let i = 1; i <= segs; i++) {
      // gnarled: each segment turned a little, a kink now and then; reaching up as they go
      dir.x += (R() - 0.5) * 0.55; dir.z += (R() - 0.5) * 0.55; dir.y += (R() - 0.35) * 0.35 + 0.05 * (3 - depth);
      if (R() < 0.18) { dir.x += (R() - 0.5) * 0.9; dir.z += (R() - 0.5) * 0.9; }
      dir.normalize();
      cur.addScaledVector(dir, L / segs); pts.push(cur.clone());
      rads.push(r0 * (1 - (i / segs) * 0.72));
    }
    tube(pts, rads, depth >= 3 ? 7 : depth >= 2 ? 5 : depth >= 1 ? 4 : 3);
    if (depth === 0) { if (cur.y > tall * 0.55 && R() < 0.35) perch.push(cur.clone()); return; }
    if (depth === 1 && R() < 0.35) { if (cur.y > tall * 0.5) perch.push(cur.clone()); return; }   // (some ends bare: no twigs)
    // the splits along it, mostly toward its end
    const kids = depth >= 3 ? 5 + Math.floor(R() * 3) : depth === 2 ? 3 + Math.floor(R() * 2) : 1 + Math.floor(R() * 2);
    for (let k = 0; k < kids; k++) {
      const t = depth >= 3 ? 0.38 + 0.6 * (k / kids) + R() * 0.05 : 0.35 + R() * 0.65, i = Math.min(segs - 1, Math.floor(t * segs));
      const at = pts[i].clone().lerp(pts[i + 1], t * segs - i);
      const out = new THREE.Vector3(R() - 0.5, 0, R() - 0.5).normalize();
      const nd = d.clone().multiplyScalar(0.6).addScaledVector(out, (depth >= 3 ? 0.9 : 0.75) * spread).add(new THREE.Vector3(0, 0.45, 0)).normalize();
      branch(at, nd, L * (depth >= 3 ? 0.42 + R() * 0.2 : 0.5 + R() * 0.25), Math.max(depth === 1 ? 0.014 : 0.02, rads[i] * (depth >= 3 ? 0.42 : 0.55)), depth - 1);
    }
    if (depth <= 2 && cur.y > tall * 0.5 && R() < 0.4) perch.push(cur.clone());
  }
  branch(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3((R() - 0.5) * 0.15, 1, (R() - 0.5) * 0.15).normalize(), tall * 0.62, 0.17 * girth, 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.computeBoundingSphere();
  return { geo, perch: perch.slice(0, 6), girth };
}

// ----- the crows -----
function makeCrows(R, time, perches) {
  const parts = [];
  const add = (g, fl) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const n = g.attributes.position.count, a = new Float32Array(n).fill(fl); g.setAttribute('wing', new THREE.BufferAttribute(a, 1)); parts.push(g); };
  add(new THREE.SphereGeometry(0.085, 10, 7).scale(0.85, 0.9, 1.6).translate(0, 0.1, 0), 0);   // body
  add(new THREE.SphereGeometry(0.055, 9, 6).translate(0, 0.17, 0.12), 0);                       // head
  add(new THREE.ConeGeometry(0.018, 0.075, 6).rotateX(Math.PI / 2).translate(0, 0.165, 0.2), 0); // beak
  add(new THREE.BoxGeometry(0.07, 0.012, 0.16).translate(0, 0.09, -0.19).rotateX(-0.2), 0);    // tail
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.26, 0.008, 0.11).translate(s * 0.13, 0.12, -0.01), s);   // wings (flapped by `wing`)
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 4).translate(0.025, 0.03, 0.02), 0);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 4).translate(-0.025, 0.03, 0.02), 0);
  const g = mergeGeometries(parts); g.computeVertexNormals();
  const n = 18, fly = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  g.setAttribute('fly', fly);
  const m = new THREE.MeshStandardMaterial({ color: '#1c1b1e', roughness: 0.55, metalness: 0.1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.time = time;
    sh.vertexShader = 'uniform float time; attribute float wing; attribute float fly;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float ph = float(gl_InstanceID) * 1.37, w = abs(wing);
        // folded along the body perched; spread and beating in flight
        if (w > 0.5) {
          float a = fly * sin(time * 13.0 + ph) * 0.9 + fly * 0.15;
          float fold = 1.0 - fly;
          vec3 p = transformed; float sx = p.x;
          p.x = mix(sx, wing * 0.03 + sx * 0.25, fold); p.z = mix(p.z, p.z - abs(sx) * 0.6, fold); p.y -= fold * 0.02;
          float r = abs(p.x); p.y += sin(a) * r * 1.2; p.x = sign(p.x) * r * cos(a);
          transformed = p;
        } }`);
  };
  m.customProgramCacheKey = () => 'cart-crow';
  const mesh = new THREE.InstancedMesh(g, m, n); mesh.frustumCulled = false;
  // perches near the middle, high enough to be seen
  const pool = perches.filter((p) => Math.hypot(p.x - CEN.x, p.z - CEN.z) < 70);
  const C = Array.from({ length: n }, (_, i) => {
    const p = pool[Math.floor(R() * pool.length)] || new THREE.Vector3(0, 6, -20);
    return { at: p.clone(), from: p.clone(), to: p.clone(), t: 1, dur: 1, yaw: R() * 6.28, fly: 0, hop: R() * 10, high: i >= n - 3 };
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1.3, 1.3, 1.3), p = new THREE.Vector3(), yAx = new THREE.Vector3(0, 1, 0);
  let onUp = null;
  return {
    mesh, C,
    /** what hears them go up: (crow) */
    set onUp(f) { onUp = f; },
    scatter(you, r = 9) { for (const c of C) if (!c.high && c.t >= 1 && Math.hypot(c.at.x - you.x, c.at.z - you.z) < r) this.fly(c, you); },
    fly(c, you) {
      const far = pool.filter((x) => Math.hypot(x.x - you.x, x.z - you.z) > 22 && Math.hypot(x.x - c.at.x, x.z - c.at.z) < 60);
      const to = far[Math.floor(R() * far.length)] || c.at;
      c.from.copy(c.at); c.to.copy(to); c.t = 0; c.dur = 4 + c.from.distanceTo(to) / 7;
      onUp?.(c);
    },
    update(dt, t, you) {
      for (let i = 0; i < C.length; i++) {
        const c = C[i];
        if (c.high) {   // a few always wheeling high and far off
          const a = t * 0.11 + i * 2.1, x = CEN.x + Math.cos(a) * (60 + i * 9), z = CEN.z + Math.sin(a) * (50 + i * 7);
          p.set(x, 28 + 4 * Math.sin(t * 0.3 + i), z); c.yaw = -a; c.fly = 1;
        } else if (c.t < 1) {
          c.t = Math.min(1, c.t + dt / c.dur);
          const u = c.t, e = u * u * (3 - 2 * u);
          p.copy(c.from).lerp(c.to, e); p.y += Math.sin(u * Math.PI) * (5 + c.dur);
          c.yaw = Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z);
          c.fly = Math.min(1, u * 8, (1 - u) * 6);
          if (c.t >= 1) c.at.copy(c.to);
        } else {
          p.copy(c.at); c.fly = 0;
          if (you && Math.hypot(c.at.x - you.x, c.at.z - you.z) < 8.5) this.fly(c, you);
          if (t > c.hop) { c.hop = t + 4 + R() * 9; c.yaw += (R() - 0.5) * 1.6; }
        }
        fly.array[i] = c.fly;
        q.setFromAxisAngle(yAx, c.yaw);
        mesh.setMatrixAt(i, m4.compose(p, q, sc));
      }
      mesh.instanceMatrix.needsUpdate = true; fly.needsUpdate = true;
    },
  };
}
