// The sky, sun, moon and time of day: the sun and moon follow the real sky over the configured location (London by
// default), driving the light, the lamps, the city's windows and the sunbeams; time can be sped up from the HUD (or T).

import * as THREE from 'three';
import { clamp, dash, lerp, sstep } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { scene, hud, renderer, pmrem } = ctx;
  Object.assign(ctx, { setSpeed, updateSky, updateClock });
  // ----- sky, sun, moon, time of day -----
  // Sun and moon follow the real sky over the configured location (London by default); time can be sped up from the HUD (or T).
  let officeExposure = 1.05;
  const hemi = new THREE.HemisphereLight('#e3ecf7', '#b39b80', 0.95);
  const sun = new THREE.DirectionalLight('#fff1dc', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  const moonLight = new THREE.DirectionalLight('#9fb4ff', 0);
  scene.add(hemi, sun, sun.target, moonLight, moonLight.target);
  const lamps = [];   // { light, base } or { mat, eBase }: dimmed by day, full in the evening

  const skyU = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, horizonSun: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
    cloudLit: { value: new THREE.Color() }, cloudDark: { value: new THREE.Color() },
    sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, -1, 0) },
    night: { value: 0 }, time: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, horizon, horizonSun, ground, cloudLit, cloudDark, sunCol, sunDir, moonDir; uniform float night, time; varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Horizon glows toward the sun (fiery at sunset) and stays cooler on the far side.
        float toward = pow(dot(normalize(d.xz + 1e-4), normalize(sunDir.xz + 1e-4)) * 0.5 + 0.5, 5.0);
        vec3 hor = mix(horizon, horizonSun, toward);
        vec3 col = h > 0.0 ? mix(hor, top, pow(h, 0.5)) : mix(hor, ground, pow(min(-h * 4.0, 1.0), 0.6));
        float sd = max(dot(d, sunDir), 0.0);
        col += sunCol * (pow(sd, 1400.0) * 30.0 + pow(sd, 60.0) * 0.6 + pow(sd, 8.0) * 0.25);
        if (h > 0.0) {
          float s = hash(floor(d * 700.0));
          col += vec3(step(0.9982, s) * night * (0.6 + 0.4 * sin(time * 3.0 + s * 60.0)) * smoothstep(0.0, 0.25, h));
        }
        float mc = dot(d, moonDir), R = 0.03;
        if (mc > cos(R)) {
          vec3 off = d - moonDir * mc;
          float r = length(off) / sin(R);
          vec3 n = normalize(off / sin(R) - moonDir * sqrt(max(0.0, 1.0 - r * r)));
          float lit = smoothstep(-0.08, 0.12, dot(n, sunDir));
          col = mix(col, vec3(0.95, 0.93, 0.86) * (0.06 + 1.4 * lit), smoothstep(1.0, 0.9, r) * smoothstep(-0.02, 0.03, moonDir.y));
        }
        col += vec3(0.6, 0.65, 0.8) * pow(max(mc, 0.0), 200.0) * 0.25 * night;
        // Clouds: a drifting fbm layer, lit from the sun side (orange-pink undersides at sunset).
        if (h > 0.01) {
          vec2 uv = d.xz / (h + 0.06) * 0.9 + vec2(time * 0.006, time * 0.003);
          float c = smoothstep(0.5, 0.78, fbm(uv)) * smoothstep(0.01, 0.16, h);
          float lit = pow(sd, 3.0);
          vec3 cc = mix(cloudDark, cloudLit, 0.35 + 0.65 * (toward * 0.6 + lit * 0.4));
          cc += sunCol * pow(sd, 12.0) * 0.8;
          col = mix(col, cc, c * 0.9);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const skyScene = new THREE.Scene();   // sky alone, rendered into an env map so city glass and water reflect the real sky
  skyScene.add(new THREE.Mesh(sky.geometry, sky.material));
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // [sun elevation°, zenith, horizon, horizon toward the sun, below horizon, cloud lit side, cloud shadow side]
  const SKY_KEYS = [
    [-18, '#03050c', '#090f1f', '#0d1226', '#05070c', '#141a2e', '#0a0d18'],
    [-9, '#0c1434', '#2a2350', '#4a2c5e', '#0b0d14', '#3a2b57', '#191730'],
    [-4, '#182a64', '#9a4e6e', '#ff6a3d', '#1a1418', '#ff7a5c', '#4a2e5c'],
    [0, '#26489a', '#e2776a', '#ff8a2e', '#2a1f1c', '#ff9a5a', '#7a4870'],
    [5, '#3566b5', '#f2a27c', '#ffbd5e', '#3a302a', '#ffd3a0', '#9a7f98'],
    [16, '#3a80d6', '#bcd8ef', '#e3edf6', '#4a4a48', '#ffffff', '#c3cedb'],
    [60, '#2a6ccc', '#cbe3f6', '#e6f0f9', '#55534f', '#ffffff', '#d0d8e2'],
  ].map(([el, ...cs]) => [el, ...cs.map((c) => new THREE.Color(c))]);
  const SKY_C = Array.from({ length: 6 }, () => new THREE.Color());
  const SUN_RED = new THREE.Color('#ff4a12'), SUN_GOLD = new THREE.Color('#ffa040'), SUN_HIGH = new THREE.Color('#fff4e4');
  const HEMI = { daySky: new THREE.Color('#e3ecf7'), dayGnd: new THREE.Color('#b39b80'), nightSky: new THREE.Color('#2c3555'),
    nightGnd: new THREE.Color('#4a3a2a'), sunset: new THREE.Color('#ff9a66'), sunsetGnd: new THREE.Color('#7a4a3a') };
  const C = { sun: new THREE.Color() };
  const LAT = (dash.config?.lat ?? 51.5) * Math.PI / 180, LON = dash.config?.lon ?? -0.13;
  const J2000 = Date.UTC(2000, 0, 1, 12);
  const RAD = Math.PI / 180;
  function altAz(ra, dec, d) {
    const H = ((18.697374558 + 24.06570982441908 * d) * 15 + LON) * RAD - ra;
    const el = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(LAT) - Math.sin(LAT) * Math.cos(H));   // from north, clockwise
    return { el, az };
  }
  function sunPos(date) {
    const d = (date - J2000) / 864e5, g = (357.529 + 0.98560028 * d) * RAD;
    const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
    return altAz(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), Math.asin(Math.sin(e) * Math.sin(L)), d);
  }
  function moonPos(date) {
    const d = (date - J2000) / 864e5, e = 23.4397 * RAD;
    const M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.22935 * d) * RAD;
    const lon = (218.316 + 13.176396 * d) * RAD + 6.289 * RAD * Math.sin(M), lat = 5.128 * RAD * Math.sin(F);
    const ra = Math.atan2(Math.sin(lon) * Math.cos(e) - Math.tan(lat) * Math.sin(e), Math.cos(lon));
    return altAz(ra, Math.asin(Math.sin(lat) * Math.cos(e) + Math.cos(lat) * Math.sin(e) * Math.sin(lon)), d);
  }
  // World axes: +x east, +z north, so evening sun pours in through the west windows.
  const toDir = (p, v) => v.set(Math.sin(p.az) * Math.cos(p.el), Math.sin(p.el), Math.cos(p.az) * Math.cos(p.el));
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
  let daylight = 1, lampK = 0;
  let raysStrength = 0, lastEnvEl = 999, lastEnvAt = 0, envRT = null;
  function updateSky(date, t) {
    const sp = sunPos(date), mp = moonPos(date);
    toDir(sp, sunDir); toDir(mp, moonDir);
    const el = sp.el / RAD, mel = mp.el / RAD;
    let i = 0;
    while (i < SKY_KEYS.length - 2 && el > SKY_KEYS[i + 1][0]) i++;
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], k = clamp((el - a[0]) / (b[0] - a[0]), 0, 1);
    for (let c = 0; c < 6; c++) SKY_C[c].lerpColors(a[c + 1], b[c + 1], k);
    const [top, hor, horSun, gnd, cLit, cDark] = SKY_C;
    const night = 1 - sstep(-10, -2, el), dl = sstep(-4, 12, el), sunset = sstep(-6, -0.5, el) * (1 - sstep(8, 20, el));
    // The sun drops behind the mountain ridge a little before the true horizon.
    const azDeg = ((Math.round(Math.atan2(sunDir.z, sunDir.x) / RAD) % 360) + 360) % 360;
    const sunVis = sstep(ctx.city.ridge[azDeg] - 0.5, ctx.city.ridge[azDeg] + 0.7, el);
    daylight = dl;
    if (el < 7) C.sun.lerpColors(SUN_RED, SUN_GOLD, sstep(-1, 7, el)); else C.sun.lerpColors(SUN_GOLD, SUN_HIGH, sstep(7, 28, el));
    skyU.top.value.copy(top); skyU.horizon.value.copy(hor); skyU.horizonSun.value.copy(horSun); skyU.ground.value.copy(gnd);
    skyU.cloudLit.value.copy(cLit); skyU.cloudDark.value.copy(cDark);
    skyU.sunDir.value.copy(sunDir); skyU.moonDir.value.copy(moonDir);
    skyU.sunCol.value.copy(C.sun).multiplyScalar(sstep(-4, 1, el));
    skyU.night.value = night; skyU.time.value = t;
    sun.position.copy(sunDir).multiplyScalar(90); sun.color.copy(C.sun); sun.intensity = 4.2 * sstep(-1.5, 2.5, el) * sunVis;
    moonLight.position.copy(moonDir).multiplyScalar(90); moonLight.intensity = 0.4 * night * sstep(-2, 8, mel);
    hemi.intensity = lerp(0.2, 0.9, dl) + 0.12 * sunset;
    hemi.color.lerpColors(HEMI.nightSky, HEMI.daySky, dl).lerp(HEMI.sunset, sunset * 0.6);
    hemi.groundColor.lerpColors(HEMI.nightGnd, HEMI.dayGnd, dl).lerp(HEMI.sunsetGnd, sunset * 0.5);
    scene.environmentIntensity = lerp(0.1, 0.42, dl);
    scene.fog.color.copy(hor).lerp(horSun, 0.3); scene.background.copy(scene.fog.color);
    renderer.toneMappingExposure = officeExposure = lerp(1.12, 1.0, dl) + 0.06 * sunset;
    // Lamps follow the Admin tab: 'auto' keeps them off in daylight (the windows light the office) and fades them up from
    // dusk as the sun drops below ~12°; 'on'/'off' override that. Eased so switching doesn't snap.
    const o = dash.office || {}, lampTo = (o.lights === 'on' ? 1 : o.lights === 'off' ? 0 : 1 - dl) * (o.brightness ?? 1);
    lampK += (lampTo - lampK) * 0.08;
    for (const L of lamps) {
      if (L.light) L.light.intensity = L.base * lampK;
      if (L.mat) L.mat.emissiveIntensity = L.eBase * lampK;
    }
    ctx.ceilingM.emissiveIntensity = 0.04 + 0.2 * dl;
    ctx.city.mat.emissiveIntensity = 0.04 + 1.25 * night;
    ctx.city.ground.emissiveIntensity = 0.02 + 1.1 * night;
    ctx.city.av.emissiveIntensity = Math.sin(t * 2.4) > 0.55 ? 4 : 0.15;
    
    ctx.shaftU.uLight.value.copy(sunDir).negate(); ctx.shaftU.color.value.copy(C.sun);
    ctx.shaftU.strength.value = sunVis * sstep(-1, 2, el) * (0.25 + 0.75 * (1 - sstep(8, 30, el)));
    ctx.shaftU.time.value = t;
    raysStrength = sunVis * sstep(-2, 2, el) * (0.45 + 0.9 * sunset);
    if (Math.abs(el - lastEnvEl) > 0.8 || performance.now() - lastEnvAt > 60000) {
      lastEnvEl = el; lastEnvAt = performance.now();
      envRT?.dispose();
      envRT = pmrem.fromScene(skyScene, 0, 0.1, 500);
      ctx.city.setEnv(envRT.texture);
    }
  }

  const SPEEDS = [1, 120, 1200, 7200];
  const timeEl = hud.querySelector('.of-time'), clockEl = hud.querySelector('.of-clock');
  const clockState = { speed: 1, simBase: Date.now(), realBase: Date.now() };
  const simNow = () => (clockState.speed === 1 ? Date.now() : clockState.simBase + (Date.now() - clockState.realBase) * clockState.speed);
  function setSpeed(sp) {
    const cur = simNow();
    Object.assign(clockState, { speed: sp, simBase: sp === 1 ? Date.now() : cur, realBase: Date.now() });
    localStorage.officeTimeSpeed = sp;
    for (const b of timeEl.querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.dataset.speed === sp));
  }
  timeEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.speed); });
  setSpeed(SPEEDS.includes(+localStorage.officeTimeSpeed) ? +localStorage.officeTimeSpeed : 1);
  let clockText = '';
  function updateClock(date) {
    const txt = `${daylight > 0.5 ? '☀︎' : '☾'}  ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${date.toLocaleDateString([], { weekday: 'short' })}`;
    if (txt !== clockText) clockEl.textContent = clockText = txt;
  }
  Object.assign(ctx, { clockState, lamps, skyU, RAD, hemi, SPEEDS, sunDir, simNow, sky });
  Object.defineProperty(ctx, 'daylight', { get: () => daylight, set: (v) => { daylight = v; }, enumerable: true });
  Object.defineProperty(ctx, 'officeExposure', { get: () => officeExposure, set: (v) => { officeExposure = v; }, enumerable: true });
  Object.defineProperty(ctx, 'raysStrength', { get: () => raysStrength, set: (v) => { raysStrength = v; }, enumerable: true });
  ctx.onFrame((dt, t) => {
    const simDate = new Date(simNow());
    updateSky(simDate, t);
    updateClock(simDate);
    ctx.updateClocks(simDate);
  }, 50);
  ctx.onFrame(() => sky.position.copy(ctx.camera.position), 180);
}
