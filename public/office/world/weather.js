// The weather over the city: clear, cloudy, overcast, rain, storm, fog or snow, how much of the sky is cloud, and the
// wind. Set from the control room's console behind the sky (floors/world-edge-console.js), kept in this browser with the
// clock (localStorage, like the HUD's time speed). Each kind eases in over a few seconds: the sky greys and darkens and
// hides the sun (sky.js's skyWeather, which also thickens the haze), the cloud, high (the sky's) and low (city.js's),
// thickens with the cover and blows along with the wind, and rain or snow falls round whoever's looking (a box of
// streaks or flakes that follows each camera, the security cameras' too, and never inside the building under its
// roof). In a storm, lightning (the sky and the light flash) and thunder after it. The model of the world on the control
// room's table shows the same (world-edge-model.js reads `now`).

import * as THREE from 'three';
import { clamp, damp, dash, ROOM, rng, sstep } from '../util.js';

// What each kind does (cover is where selecting it sets the cloud; the console's fader moves it from there).
export const KINDS = {
  clear: { label: 'Clear', cover: 0.3 },
  cloudy: { label: 'Cloudy', cover: 0.72, grey: 0.15, sun: 0.3 },
  overcast: { label: 'Overcast', cover: 0.95, grey: 0.6, dark: 0.22, sun: 0.9, fog: 0.08 },
  rain: { label: 'Rain', cover: 0.95, grey: 0.72, dark: 0.5, sun: 0.94, fog: 0.22, rain: 1 },
  storm: { label: 'Storm', cover: 1, grey: 0.8, dark: 0.74, sun: 0.98, fog: 0.3, rain: 1.8, storm: 1 },
  fog: { label: 'Fog', cover: 0.95, grey: 0.88, dark: 0.12, sun: 0.85, fog: 1 },
  snow: { label: 'Snow', cover: 0.92, grey: 0.82, dark: 0.08, sun: 0.88, fog: 0.3, snow: 1 },
};
export const ORDER = Object.keys(KINDS);
const DEFAULT = { kind: 'clear', cover: 0.5, wind: 0.3 };   // the sky as it always was

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const random = Math.random;
  Math.random = rng(4747);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { scene, skyU, skyWeather: wx, hemi } = ctx;
  // The office's haze (the scene's exp² fog) starts further off the thicker it is: fog outside, not in the room. Only
  // the office's scene has exp² fog; at its usual density this is as it was.
  THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
    'float fogD = max(vFogDepth - clamp((fogDensity - 0.001) * 1400.0, 0.0, 22.0), 0.0); float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogD * fogD );');
  let state = { ...DEFAULT };
  try { const s = JSON.parse(localStorage.officeWeather || 'null'); if (s && KINDS[s.kind]) state = { kind: s.kind, cover: clamp(+s.cover || 0, 0, 1), wind: clamp(+s.wind || 0, 0, 1) }; } catch {}
  const save = () => { localStorage.officeWeather = JSON.stringify(state); };
  // `now`: where it's got to, eased (each 0..1, rain up to ~2 for a storm's)
  const now = { grey: 0, dark: 0, sun: 0, fog: 0, rain: 0, snow: 0, storm: 0, flash: 0, cover: state.cover, wind: state.wind };
  const targets = () => {
    const k = KINDS[state.kind], c = state.cover;
    return { grey: Math.max(k.grey || 0, 0.45 * sstep(0.6, 1, c)), dark: Math.max(k.dark || 0, 0.12 * sstep(0.8, 1, c)),
      sun: Math.max(k.sun || 0, 0.85 * sstep(0.55, 1, c)), fog: k.fog || 0, rain: k.rain || 0, snow: k.snow || 0, storm: k.storm || 0 };
  };
  function set(patch) {
    if (patch.kind && KINDS[patch.kind] && patch.kind !== state.kind) state = { ...state, kind: patch.kind, cover: KINDS[patch.kind].cover };
    if (Number.isFinite(patch.cover)) state.cover = clamp(patch.cover, 0, 1);
    if (Number.isFinite(patch.wind)) state.wind = clamp(patch.wind, 0, 1);
    save();
  }
  const reset = () => { state = { ...DEFAULT }; save(); };

  // ----- rain and snow: a box of drops round the camera, wrapped as they fall, drawn for each camera that looks -----
  // In the vertex shader: each drop's place in the box (a, 0..1), fallen and blown by time, wrapped round the eye; out
  // of sight inside the building (below its roof) and under the streets.
  const wrapGLSL = `uniform vec3 eye, box, vel; uniform float t, amount, roofY, ground; attribute vec3 a; varying float vA;
    vec3 place() {
      vec3 p = a * box + vel * t;
      p = eye + mod(p - eye + box * 0.5, box) - box * 0.5;
      bool inside = abs(p.x) < ${ROOM.maxX + 0.45} && abs(p.z) < ${ROOM.maxZ + 0.45} && p.y < roofY;
      vA = (inside || p.y < ground || fract(a.x * 91.7 + a.z * 37.3) > amount) ? 0.0 : 1.0 - smoothstep(box.x * 0.3, box.x * 0.5, distance(p.xz, eye.xz));
      return p;
    }`;
  const mk = (n, box, vel, extra) => {
    const a = new Float32Array(n * 3 * (extra.line ? 2 : 1)), end = new Float32Array(n * (extra.line ? 2 : 1));
    for (let i = 0; i < n; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      if (extra.line) { a.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1; } else a.set([x, y, z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a.length), 3));   // (unused: placed in the shader)
    g.setAttribute('a', new THREE.BufferAttribute(a, 3)); g.setAttribute('end', new THREE.BufferAttribute(end, 1));
    const U = { eye: { value: new THREE.Vector3() }, box: { value: new THREE.Vector3(...box) }, vel: { value: new THREE.Vector3(...vel) }, t: { value: 0 },
      amount: { value: 0 }, roofY: { value: ROOM.h + 0.6 }, ground: { value: ctx.city.GROUND }, col: { value: new THREE.Color() }, ps: { value: 1 } };
    const m = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, fog: false, vertexShader: extra.vs(wrapGLSL), fragmentShader: extra.fs });
    const o = new (extra.line ? THREE.LineSegments : THREE.Points)(g, m);
    o.frustumCulled = false; o.visible = false; o.layers.set(1); o.renderOrder = 2;
    // whoever's drawing: the drops are round them
    o.onBeforeRender = (r, s, cam) => {
      cam.getWorldPosition(U.eye.value);
      U.ps.value = r.getDrawingBufferSize(v2).y * cam.projectionMatrix.elements[5] * 0.5;
    };
    scene.add(o);
    return { o, U };
  };
  const v2 = new THREE.Vector2();
  const rain = mk(22000, [54, 28, 54], [0, -11, 0], { line: true,
    vs: (w) => `${w} attribute float end; uniform float len;
      void main() { vec3 p = place() - normalize(vel) * len * end; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fs: `uniform vec3 col; varying float vA; void main() { if (vA < 0.01) discard; gl_FragColor = vec4(col, 0.5 * vA);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
  rain.U.len = { value: 1.1 };
  const snow = mk(16000, [40, 22, 40], [0, -1.1, 0], {
    vs: (w) => `${w} uniform float ps;
      void main() {
        vec3 p = place();
        p.x += sin(t * 1.3 + a.y * 40.0) * 0.35; p.z += cos(t * 1.1 + a.x * 40.0) * 0.35;   // drifting as it falls
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(0.11 * ps / -mv.z, 1.5, 18.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fs: `uniform vec3 col; varying float vA;
      void main() { float r = length(gl_PointCoord - 0.5); if (vA < 0.01 || r > 0.5) discard; gl_FragColor = vec4(col, 0.85 * vA * smoothstep(0.5, 0.2, r));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });

  // ----- the sound: rain on the glass (muffled indoors), thunder after the lightning -----
  let A = null, rainV = null, rainBuf = null, thunderAt = 0;
  const audio = () => { const a = ctx.sfx?.audio; if (!a) return null; if (A?.ctx !== a.ctx) { A = a; rainV = null; rainBuf = null; } return A; };
  function noise(sec, fn) {
    const SR = A.ctx.sampleRate, n = Math.ceil(sec * SR), b = A.ctx.createBuffer(1, n, SR), d = b.getChannelData(0);
    let l = 0, m = 0;
    for (let k = 0; k < n; k++) { l = fn(k / SR, Math.random() * 2 - 1, l); d[k] = l; m = Math.max(m, Math.abs(l)); }
    for (let k = 0; k < n; k++) d[k] *= (m ? 0.9 / m : 0) * Math.min(1, (n - k) / (SR * 0.01), k / (SR * 0.01));
    return b;
  }
  function rainSound(level, muffle) {
    if (!audio()) return;
    if (!rainV && level > 0.01) {
      rainBuf ||= noise(6, (t, x, l) => l * 0.6 + x * 0.4 + (Math.random() < 0.002 ? (Math.random() - 0.5) * 3 : 0));
      const src = A.ctx.createBufferSource(), g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter();
      src.buffer = rainBuf; src.loop = true; lp.type = 'lowpass'; g.gain.value = 0;
      src.connect(lp).connect(g).connect(A.master); src.start();
      rainV = { src, g, lp };
    }
    if (!rainV) return;
    const c = A.ctx.currentTime;
    rainV.g.gain.setTargetAtTime(0.11 * level, c, 0.4); rainV.lp.frequency.setTargetAtTime(muffle ? 700 : 4200, c, 0.3);
    if (level < 0.005 && rainV.g.gain.value < 0.003) { rainV.src.stop(); rainV = null; }
  }
  function thunder(delay, k) {
    if (!audio()) return;
    const b = noise(4 + 2 * Math.random(), (t, x, l) => l * 0.985 + x * 0.06 * (t < 0.08 ? 4 : Math.exp(-t * 0.8) * (1 + 0.6 * Math.sin(t * 9 + Math.random()))));
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = b; g.gain.value = 0.5 * k; src.connect(g).connect(A.master); src.start(A.ctx.currentTime + delay);
    src.onended = () => src.disconnect();
  }

  // ----- each frame, before the sky (it reads skyWeather) -----
  let boltAt = 6, bolt = -1, drift = 0;
  const DRIFT = new THREE.Vector2(0.006, 0.003);
  ctx.onFrame((dt, t) => {
    const T = targets(), r = Math.min(1, dt * 0.6);
    for (const k of ['grey', 'dark', 'sun', 'fog', 'rain', 'snow', 'storm']) now[k] += (T[k] - now[k]) * r;
    now.cover = damp(now.cover, state.cover, 1.5, dt); now.wind = damp(now.wind, state.wind, 1.5, dt);
    skyU.cover.value = now.cover;
    // the wind: the cloud's drift beyond its usual (0.3 is as it always was), rain and snow blown along
    drift += (now.wind / DEFAULT.wind - 1) * dt;
    skyU.drift.value.copy(DRIFT).multiplyScalar(drift);
    // lightning: now and then in a storm, a flicker or two; thunder a few seconds later
    if (now.storm > 0.3 && t > boltAt) { bolt = t; boltAt = t + 4 + Math.random() * 11; thunder(0.6 + Math.random() * 3, now.storm); }
    const since = t - bolt;
    now.flash = since >= 0 && since < 0.5 ? now.storm * (since < 0.07 ? 1 : since < 0.14 ? 0.15 : since < 0.22 ? 0.75 : Math.max(0, 1 - (since - 0.22) / 0.28) * 0.4) : 0;
    Object.assign(wx, { grey: now.grey, dark: now.dark, sun: now.sun, fog: now.fog, flash: now.flash });
    // the drops: lit like the air (the hemisphere's sky colour), blown by the wind
    const wv = now.wind * 9, lit = clamp(hemi.intensity * 0.55, 0.06, 1);
    for (const [P, amt, fall] of [[rain, clamp(now.rain, 0, 2) / 2, 11], [snow, now.snow, 1.1]]) {
      P.o.visible = amt > 0.002;
      if (!P.o.visible) continue;
      P.U.amount.value = amt; P.U.t.value = t;
      P.U.vel.value.set(wv * 0.89 * (fall > 2 ? 1 : 0.5), -fall, wv * 0.45 * (fall > 2 ? 1 : 0.5));
      P.U.col.value.copy(hemi.color).multiplyScalar(lit * (P === snow ? 1.6 : 1.1)).addScalar(now.flash * 0.6);
    }
    // heard where the office's own sounds are (the office, the roof, the helicopter), muffled indoors
    const out = !ctx.away?.scene, roofed = !ctx.away || ctx.away.n !== 50 || ctx.heli?.S?.aboard;
    rainSound(out && dash.sound?.on !== false ? clamp(now.rain, 0, 1.6) : 0, roofed);
  }, 45);

  ctx.weather = { KINDS, ORDER, now, set, reset, get state() { return { ...state }; }, DEFAULT };
}
