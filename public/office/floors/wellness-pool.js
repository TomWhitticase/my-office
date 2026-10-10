// The wellness floor's pool (floors/wellness.js): a 23 m lap pool along the north glass, its water level with the deck
// and running right up to the glass (an infinity edge: the glass comes down to it), so swimming you look straight out
// over the city 160 m up. One water shader (wellness ripples, the window and sky reflected off them, your own ripples, lit
// from below at night) and caustics on the basin. Walk in down the steps at the east end and you're swimming: slower,
// eyes at the water, a bob; hold Space to dive under (or dip under on a stroke) for the blue-green and muffled sound.
// Climb out up the same steps. Loungers along the deck, a towel stack by the glass east of the pool.

import * as THREE from 'three';
import { clamp, EYE, makeCanvas } from '../util.js';

// Caustics: the classic "water turbulence" pattern, tiling every 2π. `p` in metres-ish, `t` seconds.
export const CAUSTIC = `
  float caustic(vec2 uv, float t) {
    vec2 p = mod(uv * 6.28318, 6.28318) - 250.0, i = p;
    float c = 1.0, inten = 0.005;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - 3.5 / float(n + 1));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 4.0; c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 2.0);
  }`;

// A material lit like any other, with caustics thrown over it below `water` (world y) and a teal glow at night (the pool's
// lights): the basin's tiles, the plunge pool's.
export function causticMaterial(params, U) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { cTime: U.time, cK: U.causK, cWater: U.waterY, cGlow: U.glow });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vCW; uniform float cTime, cK, cWater, cGlow;\n${CAUSTIC}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float under = step(vCW.y, cWater);
          vec2 q = vCW.xz * 0.32 + vec2(vCW.y * 0.21, -vCW.y * 0.17);
          float c = caustic(q, cTime * 0.55);
          totalEmissiveRadiance += diffuseColor.rgb * (c * cK * under) + vec3(0.05, 0.42, 0.46) * cGlow * under * (0.6 + 0.4 * smoothstep(cWater - 1.6, cWater, vCW.y)); }`);
  };
  m.customProgramCacheKey = () => 'wellness-caustic';
  return m;
}

export function installPool(ctx, W) {
  const { G, X, Y, M, kit, POOL, solid, R, uvWorld } = W;
  const { camera, toast, skyU } = ctx;
  const WATER = -0.03, FLOOR = -1.45, STEPS = { x0: 1.4, x1: POOL.x1, z0: POOL.z0, z1: 10.9 };
  const SWIM_EYE = WATER + 0.1, DIVE_EYE = WATER - 0.62;
  W.WATER = WATER;

  // ----- shared uniforms: the water's clock, the light on the caustics, the pool lights -----
  const U = { time: { value: 0 }, causK: { value: 0.5 }, waterY: { value: Y + WATER }, glow: { value: 0 } };
  W.U = U;

  // ----- the basin -----
  const poolTile = (() => {   // 5 cm tiles, white to pale aqua, a darker band at the waterline drawn as its own strip
    const t = makeCanvas(512, 512), c = t.ctx, n = 32, s = 512 / n;
    c.fillStyle = '#5d7470'; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = R(); c.fillStyle = `rgb(${92 + v * 26},${128 + v * 24},${126 + v * 22})`; c.fillRect(i * s + 1, j * s + 1, s - 2, s - 2); }
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true;
    return t.tex;   // 1.6 m
  })();
  W.poolTile = poolTile;
  const tileM = causticMaterial({ map: poolTile, roughness: 0.25 }, U);
  const lineM = causticMaterial({ color: '#16242e', roughness: 0.3 }, U);
  W.causticMaterial = (p) => causticMaterial(p, U);
  {
    const k = kit(), { x0, x1, z0, z1 } = POOL, D = WATER - FLOOR;
    const wall = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); k.geo(tileM, uvWorld(g, 1.6, 'wall')); };
    { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, FLOOR, (z0 + z1) / 2); k.geo(tileM, uvWorld(g, 1.6)); }
    wall(x1 - x0, D + 0.03, 0.1, (x0 + x1) / 2, (FLOOR + 0) / 2, z0 - 0.05); wall(x1 - x0, D + 0.03, 0.1, (x0 + x1) / 2, (FLOOR + 0) / 2, z1 + 0.05);
    wall(0.1, D + 0.03, z1 - z0, x0 - 0.05, (FLOOR + 0) / 2, (z0 + z1) / 2); wall(0.1, D + 0.03, z1 - z0, x1 + 0.05, (FLOOR + 0) / 2, (z0 + z1) / 2);
    // The steps: four treads down westward in the south-east corner.
    for (let i = 0; i < 4; i++) {
      const a = STEPS.x1 - 0.55 * (i + 1), b = STEPS.x1 - 0.55 * i, top = -0.3 * (i + 1);
      wall(b - a, top - FLOOR, STEPS.z1 - STEPS.z0, (a + b) / 2, (top + FLOOR) / 2, (STEPS.z0 + STEPS.z1) / 2);
      k.box(lineM, 0.05, 0.01, STEPS.z1 - STEPS.z0 - 0.1, b - 0.04, top + 0.005, (STEPS.z0 + STEPS.z1) / 2);   // a nosing you can see
    }
    // Lane lines on the floor, T-ended, and targets on the end walls.
    for (const z of [z0 + 1.86, z0 + 3.72]) {
      k.box(lineM, x1 - x0 - 4.4, 0.01, 0.22, (x0 + x1) / 2 - 0.8, FLOOR + 0.006, z);
      for (const x of [x0 + 1.2, x1 - 3.6]) k.box(lineM, 0.22, 0.01, 0.9, x, FLOOR + 0.006, z);
      k.box(lineM, 0.012, 0.9, 0.22, x0 + 0.005, FLOOR + 0.8, z);
    }
    // Coping and a black overflow grate on the room sides (south and east), at the water's edge.
    k.box(M.stone, x1 - x0 + 0.4, 0.03, 0.34, (x0 + x1) / 2 + 0.2, 0.0, z0 - 0.37);
    k.box(M.stone, 0.34, 0.03, z1 - z0, x1 + 0.37, 0.0, (z0 + z1) / 2);
    k.box(M.black, x1 - x0, 0.02, 0.18, (x0 + x1) / 2, -0.005, z0 - 0.1); k.box(M.black, 0.18, 0.02, z1 - z0 - 0.2, x1 + 0.1, -0.005, (z0 + z1) / 2 + 0.1);
    // The step rail: chrome, from a post on the deck down into the water.
    const rail = (a, b) => { const v = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(0.022, 0.022, v.length(), 10);
      g.translate(0, v.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize())); g.translate(a.x, a.y, a.z); k.geo(M.chrome, g); };
    const zr = STEPS.z0 + 0.12, V = (x, y, z) => new THREE.Vector3(x, y, z);
    rail(V(3.95, 0, zr), V(3.95, 0.92, zr)); rail(V(3.95, 0.92, zr), V(3.5, 0.92, zr)); rail(V(3.5, 0.92, zr), V(1.7, -0.45, zr)); rail(V(1.7, -0.45, zr), V(1.7, -1.2, zr));
    k.flush(G);
  }

  // ----- the water -----
  // Ripples (four travelling waves plus up to eight rings from you), their normal by differences; the north glass and the
  // sky through it reflected off them (traced to the window's plane: its mullions and transom too), the ceiling elsewhere;
  // see-through to the basin up close, mirror-like at a glance; lit from below at night. From underneath: Snell's window.
  // Seen from outside (you're not on the floor, the basin isn't drawn) it's opaque.
  const rip = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0));
  let ripI = 0;
  const ripple = (x, z, s) => { rip[ripI].set(x, z, U.time.value, s); ripI = (ripI + 1) % rip.length; };
  W.ripple = ripple;
  const waterU = { time: U.time, rip: { value: rip }, dayK: { value: 1 }, glow: U.glow, inside: { value: 0 }, floorY: { value: Y },
    skyTop: skyU.top, skyHor: skyU.horizon, sunDir: skyU.sunDir, sunCol: skyU.sunCol, night: skyU.night, win: { value: new THREE.Vector4(-20, 6, 15, 3.05) } };
  const waterM = new THREE.ShaderMaterial({
    uniforms: waterU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time, dayK, glow, inside, floorY, night; uniform vec4 rip[8]; uniform vec3 skyTop, skyHor, sunDir, sunCol; uniform vec4 win;
      varying vec3 vW;
      float hgt(vec2 p) {
        float v = sin(dot(p, vec2(0.8, 0.6)) * 3.1 + time * 1.3) * 0.010 + sin(dot(p, vec2(-0.5, 0.9)) * 4.7 + time * 1.7) * 0.007
          + sin(dot(p, vec2(0.95, -0.3)) * 7.3 - time * 2.3) * 0.004 + sin(dot(p, vec2(0.2, 1.0)) * 11.0 + time * 2.9) * 0.0025
          + sin(dot(p, vec2(-0.9, -0.4)) * 17.0 + time * 3.7) * 0.0012;
        for (int i = 0; i < 8; i++) {
          vec4 r = rip[i]; float age = time - r.z;
          if (age < 0.0 || age > 7.0) continue;
          float d = length(p - r.xy), f = d - age * 0.85;
          v += sin(f * 13.0) * exp(-f * f * 3.0) * r.w * exp(-age * 0.6) / (1.0 + d * 1.5);
        }
        return v;
      }
      void main() {
        vec2 p = vW.xz; float e = 0.025;
        vec3 N = normalize(vec3(-(hgt(p + vec2(e, 0.0)) - hgt(p - vec2(e, 0.0))) / (2.0 * e), 1.0, -(hgt(p + vec2(0.0, e)) - hgt(p - vec2(0.0, e))) / (2.0 * e)));
        vec3 V = normalize(cameraPosition - vW);
        vec3 ceil = vec3(0.86, 0.80, 0.70) * (0.12 + 0.5 * dayK) + vec3(1.0, 0.72, 0.45) * glow * 0.35;
        vec3 body = vec3(0.015, 0.11, 0.12) * (0.15 + 0.85 * dayK) + vec3(0.05, 0.55, 0.6) * glow;
        if (!gl_FrontFacing) {   // from underneath
          N = -N;
          float c = dot(N, V);
          vec3 col = mix(body * 1.3 + vec3(0.02, 0.08, 0.09), ceil * 1.4 + vec3(0.1, 0.16, 0.16) * dayK, smoothstep(0.62, 0.72, c));
          gl_FragColor = vec4(col, 0.92); return;
        }
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 Rf = reflect(-V, N), refl = ceil * 0.9;
        if (Rf.z > 0.01) {   // toward the north glass
          float t = (win.z - vW.z) / Rf.z; vec3 h = vW + Rf * t; float hy = h.y - floorY;
          if (hy < win.w && h.x > win.x && h.x < win.y) {
            vec3 sky = mix(skyHor, skyTop, pow(clamp(Rf.y * 1.6, 0.0, 1.0), 0.6));
            // The skyline out there: towers by azimuth, a few rising over the horizon, lit windows at night.
            float az = atan(Rf.x, Rf.z) * 40.0, id = floor(az), hs = fract(sin(id * 12.9898) * 43758.5);
            float top = hs > 0.55 ? (hs - 0.55) * 0.5 : 0.0, fr = fract(az);
            float tower = step(Rf.y, top) * step(0.12, fr) * step(fr, 0.88);
            vec3 bld = mix(vec3(0.42, 0.45, 0.5), vec3(0.62, 0.66, 0.7), fract(hs * 7.0)) * (0.2 + 0.8 * dayK);
            float lit = step(0.72, fract(sin(floor(fr * 6.0) * 7.1 + floor(Rf.y * 300.0) * 3.3 + id) * 43758.5)) * night;
            sky = mix(sky, bld + vec3(1.0, 0.8, 0.5) * lit * 0.9, tower);
            sky = mix(sky, mix(skyHor, vec3(0.5, 0.52, 0.55) * (0.15 + 0.85 * dayK), 0.5), (1.0 - smoothstep(0.0, 0.02, Rf.y)) * (1.0 - tower));
            float m = fract((h.x - win.x) / 2.6 + 0.5);
            float frame = step(abs(m - 0.5) * 2.6, 0.045) + step(abs(hy - 2.33), 0.035);
            refl = mix(sky, vec3(0.03), clamp(frame, 0.0, 1.0)) + sunCol * pow(max(dot(Rf, sunDir), 0.0), 900.0) * 6.0;
          }
        }
        refl *= vec3(0.78, 0.9, 0.92);   // a little of the water's own colour in what it reflects
        vec3 col = mix(body, refl, fres);
        float a = mix(0.25, 0.97, fres);
        if (inside < 0.5) { col = mix(body * 1.4 + vec3(0.02, 0.07, 0.08) * dayK, refl, fres); a = 1.0; }
        gl_FragColor = vec4(col, a);
      }`,
  });
  {
    const g = new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0, 1, 1); g.rotateX(-Math.PI / 2);
    g.translate((POOL.x0 + POOL.x1) / 2, WATER, (POOL.z0 + POOL.z1) / 2);
    const water = new THREE.Mesh(g, waterM); water.renderOrder = 2; X.add(water);
    W.waterM = waterM;
    // The same water elsewhere (the plunge pool): the same program and clock, its own uniforms where given (`win` off: no
    // north glass to reflect).
    W.water = (u = {}) => new THREE.ShaderMaterial({ uniforms: { ...waterU, win: { value: new THREE.Vector4(1, 0, 0, 0) }, ...u }, vertexShader: waterM.vertexShader,
      fragmentShader: waterM.fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }
  // The light off the water dancing on the ceiling over it.
  {
    const g = new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0 + 1); g.rotateX(Math.PI / 2);
    g.translate((POOL.x0 + POOL.x1) / 2, 3.28, (POOL.z0 + POOL.z1) / 2 - 0.3);
    const m = new THREE.ShaderMaterial({ uniforms: { time: U.time, k: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float time, k; varying vec3 vW; ${CAUSTIC}
        void main() { float c = caustic(vW.xz * 0.22, time * 0.45); gl_FragColor = vec4(vec3(0.55, 0.8, 0.82) * c * k * 0.08, 1.0); }` });
    const sheen = new THREE.Mesh(g, m); G.add(sheen); W.sheenM = m;
  }

  // ----- the deck: loungers, a towel stack, the hall's plants -----
  {
    const k = kit();
    for (let i = 0; i < 6; i++) {
      const x = -17.2 + i * 2.6, z = 6.4, gr = new THREE.Group(); gr.position.set(x, 0, z); G.add(gr);
      const lk = kit();
      // Teak frame, a thick linen pad, the back raised toward the water.
      for (const s of [-1, 1]) lk.box(M.oak, 0.05, 0.3, 1.95, s * 0.33, 0.15, 0);
      lk.box(M.oak, 0.7, 0.05, 1.9, 0, 0.3, 0);
      lk.box(M.linen, 0.66, 0.09, 1.2, 0, 0.37, 0.32);
      const back = new THREE.BoxGeometry(0.66, 0.09, 0.72); back.translate(0, 0, -0.36); back.rotateX(0.75); back.translate(0, 0.37, -0.25); lk.geo(M.linen, back);
      lk.box(M.towel, 0.5, 0.02, 0.7, 0, 0.425, 0.45);
      lk.flush(gr);
      const st = W.seat(gr, 'Lounger', 0, 0.95); W.markSeat(gr, st);
      solid(x, z, 0.72, 1.95);
      if (i % 2) { k.cyl(M.oak, 0.22, 0.22, 0.03, x + 1.3, 0.42, z - 0.3, 20); k.cyl(M.black, 0.02, 0.02, 0.4, x + 1.3, 0.2, z - 0.3, 8); }
    }
    // The towel stack: a teak shelf of folded towels against the gym wall by the glass, past the steps (not in the way to
    // them: you walk west onto the steps from the strip east of the pool).
    const TX = 5.66, TZ = 13.9;
    k.box(M.oak, 0.5, 0.04, 1.2, TX, 0.45, TZ); k.box(M.oak, 0.5, 0.04, 1.2, TX, 0.9, TZ);
    for (const z of [TZ - 0.55, TZ + 0.55]) k.box(M.oak, 0.5, 1.0, 0.04, TX, 0.5, z);
    for (let y = 0; y < 3; y++) for (let i = 0; i < 3; i++) { k.box(M.towel, 0.4, 0.1, 0.32, TX, 0.52 + y * 0.1, TZ - 0.42 + i * 0.36); if (y < 2) k.box(M.towel, 0.4, 0.1, 0.32, TX, 0.97 + y * 0.1, TZ - 0.42 + i * 0.36); }
    solid(TX, TZ, 0.55, 1.2);
    k.flush(G);
    W.hits.push(ctx.hitBox(G, 0.55, 1.0, 1.2, TX, 0.6, TZ, { action: 'wellness-towel', reach: 3 }));
  }
  for (const [x, z] of [[-19.2, 4.2], [-6.3, 4.2], [3.0, 4.2]]) W.planter(x, z, 1.15);

  // ----- swimming -----
  // `S.in` is decided after each move, from where you are, so the colliders you move against are the side of the edge you
  // started on: on the deck the pool is solid but for the steps' mouth; in the water its sides are, and the deck beyond.
  const S = { in: false, wasIn: false, depth: 0, stroke: 0, under: false, dive: false, enteredAt: 0, tip: false };
  W.swim = S;
  const inPool = (x, z) => x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1;
  const onSteps = (x, z) => x > STEPS.x0 && z < STEPS.z1;
  const box = (x0, x1, z0, z1) => ({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  const deckCols = [box(POOL.x0, POOL.x1, STEPS.z1, POOL.z1), box(POOL.x0, STEPS.x0, POOL.z0, STEPS.z1), box(STEPS.x0, POOL.x1, POOL.z0 - 0.05, POOL.z0 + 0.06)];
  const poolCols = [box(POOL.x0 - 1, POOL.x1 + 1, POOL.z0 - 1, POOL.z0), box(POOL.x1, POOL.x1 + 1, STEPS.z1, POOL.z1 + 1)];
  W.colliders = () => (S.in ? [...W.cols, ...poolCols] : [...W.cols, ...deckCols]);
  // How deep you are: 0 on the deck, down the steps to 1, swimming beyond.
  const depthAt = (x, z) => (!inPool(x, z) ? 0 : onSteps(x, z) ? clamp((STEPS.x1 - x) / (STEPS.x1 - STEPS.x0) * 1.15, 0, 1) : 1);
  W.ground = (x, z) => {
    const d = depthAt(x, z);
    if (!d) return W.groundExtra?.(x, z) || 0;
    const eye = d < 1 ? EYE - (EYE - SWIM_EYE) * d * d * (3 - 2 * d) : S.dive ? DIVE_EYE : SWIM_EYE;
    return eye - EYE;
  };
  W.pace = (x, z) => { const d = depthAt(x, z); return d ? 1 - 0.58 * d : (W.paceExtra?.(x, z) ?? 1); };

  const veil = document.createElement('div');
  veil.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;opacity:0;transition:opacity .25s;';
  ctx.renderer.domElement.after(veil);
  let veilKey = '';
  W.veil = (css, a) => { const key = `${css}|${a.toFixed(2)}`; if (key === veilKey) return; veilKey = key; veil.style.background = css; veil.style.opacity = String(a);
    veil.style.backdropFilter = a > 0.05 ? `blur(${(a * 3).toFixed(1)}px)` : ''; };
  W.veil('transparent', 0);
  W.wantVeil = null;   // the part that wants the veil this frame: [css, alpha]

  W.fxs.push((dt, t) => {
    const p = ctx.player, was = S.in;
    S.in = inPool(p.x, p.z);
    const d = depthAt(p.x, p.z), deep = d >= 1, moving = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((c) => ctx.keys.has(c));
    S.dive = S.in && deep && ctx.keys.has('Space');
    if (S.in && !was) { W.sound.splash(p.x, p.z, false); ripple(p.x, p.z, 0.02); }
    if (deep && !S.wasDeep) {
      S.enteredAt = t; W.sound.splash(p.x, p.z, true); ripple(p.x, p.z, 0.05);
      if (!S.tip) { S.tip = true; toast('Swimming · <kbd>W</kbd> to swim · hold <kbd>Space</kbd> to dive · out by the steps'); }
    }
    S.wasDeep = deep;
    // The swim: a bob that dips you under on a stroke, a ripple and a stroke sound every so often.
    if (S.in && d > 0.6 && ctx.mode === 'free') {
      S.stroke += dt * (moving ? 1.3 : 0.45);
      const bob = Math.sin(S.stroke * Math.PI * 2) * (moving ? 0.065 : 0.03) * d;
      camera.position.y += bob;
      camera.rotation.z = Math.sin(S.stroke * Math.PI) * (moving ? 0.03 : 0.012) * d;
      if (moving && Math.floor(S.stroke) !== S.lastStroke) { S.lastStroke = Math.floor(S.stroke); W.sound.stroke(p.x, p.z); ripple(p.x, p.z, 0.025); }
      if (!moving && Math.floor(S.stroke * 0.5) !== S.lastIdle) { S.lastIdle = Math.floor(S.stroke * 0.5); ripple(p.x, p.z, 0.008); }
    }
    S.under = S.in && camera.position.y < Y + WATER - 0.01;
    if (S.under) W.wantVeil = ['radial-gradient(ellipse at 50% 30%, rgba(60,170,170,.55), rgba(8,60,72,.85))', 0.88];
    W.sound.under(S.under);
  });
  W.leaves.push(() => { S.in = false; S.under = false; W.sound.under(false); });

  // Every frame, wherever you are: the water's clock and light (it's seen from outside too).
  W.tick = (dt) => {
    U.time.value += dt;
    U.glow.value = 0.85 * W.lampK;
    U.causK.value = 0.15 + 0.45 * W.dayK + 0.6 * W.lampK;
    waterU.dayK.value = W.dayK; waterU.inside.value = W.inside || 0;
    W.sheenM.uniforms.k.value = 0.6 * W.dayK + W.lampK;
  };
}
