// The train on the viaduct (floors/acro.js): a small steam engine, its tender and four coaches with their lamps lit,
// on the deck's track (acro-plan.js). It comes in out of the haze from the far end, slows, stops at the halt on the
// headland with a sigh of steam, waits, and backs away out to sea until it's lost again; then a while before the next.
// Ringing the bell at the halt (`call()`) brings it now. Smoke out of its chimney in chuffs as it works, steam about
// its wheels when it stops, drifting off on the wind (a pool of points, moved here). Its headlamp and windows glow.
// `S`: where it is (s of the engine's front), how fast, what it's doing; `on(ev)`: 'whistle', 'chuff', 'hiss', 'brake'.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { D, N, TRACK_U, Y_DECK, DECK0, DECK_END, toWorld } from './acro-plan.js';

const STOP = DECK0 + 1.6, FAR = Math.min(DECK_END - 70, 470), CRUISE = 13;
const colored = (g, c) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); const cl = new THREE.Color(c), a = new Float32Array(g.attributes.position.count * 3); for (let k = 0; k < a.length; k += 3) { a[k] = cl.r; a[k + 1] = cl.g; a[k + 2] = cl.b; } return g.setAttribute('color', new THREE.BufferAttribute(a, 3)); };

export function buildTrain(fl, R, time, on = () => {}) {
  const root = new THREE.Group(); fl.scene.add(root);
  // Built along +x (the way it faces: toward the ring, -s), its front at x = 0, the rails' top at y = 0, centred on z.
  const P = [], G = [];   // painted parts, glowing parts
  const add = (g, c, x, y, z) => P.push(colored(g.translate(x, y, z), c));
  const cylX = (r, l, seg = 16) => new THREE.CylinderGeometry(r, r, l, seg).rotateZ(Math.PI / 2);
  const body = '#2e3a40', black = '#1d1f22', brass = '#b8924a', red = '#7a2f2a', coach = '#4a5d6a', roof = '#34383e';
  // the engine: buffer beam, smokebox, boiler, dome, chimney, cab, wheels, the running plate
  add(new THREE.BoxGeometry(0.2, 0.32, 2.3), red, -0.1, 0.95, 0);
  for (const z of [-0.6, 0.6]) add(cylX(0.11, 0.26, 10), black, 0.08, 0.95, z);
  add(new THREE.BoxGeometry(7.4, 0.14, 2.4), black, -3.8, 1.18, 0);
  add(cylX(0.78, 1.0), black, -0.85, 2.0, 0);
  add(cylX(0.72, 4.0), body, -3.3, 2.0, 0);
  for (const x of [-1.7, -3.0, -4.3]) add(cylX(0.745, 0.09), brass, x, 2.0, 0);
  add(new THREE.CylinderGeometry(0.2, 0.26, 0.75, 12), black, -0.95, 3.05, 0);
  add(new THREE.CylinderGeometry(0.28, 0.2, 0.12, 12), black, -0.95, 3.45, 0);
  add(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass, -3.0, 2.62, 0);
  add(new THREE.BoxGeometry(2.16, 2.3, 2.5), body, -6.4, 2.35, 0);
  add(new THREE.BoxGeometry(2.4, 0.12, 2.7), black, -6.4, 3.56, 0);
  for (const z of [-1.26, 1.26]) add(new THREE.BoxGeometry(0.7, 0.6, 0.03), '#c9b27a', -6.0, 2.8, z);   // (cab windows: glow below)
  for (const x of [-1.5, -3.3, -5.1]) for (const z of [-0.78, 0.78]) {
    add(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 20).rotateX(Math.PI / 2), black, x, 0.62, z);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10).rotateX(Math.PI / 2), red, x, 0.62, z);
  }
  for (const z of [-0.88, 0.88]) add(new THREE.BoxGeometry(3.8, 0.1, 0.06), '#8f8f96', -3.3, 0.62, z);   // the coupling rods
  add(new THREE.BoxGeometry(0.5, 0.5, 0.5), black, -0.4, 1.55, 0);
  G.push(colored(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 14).rotateZ(Math.PI / 2).translate(-0.12, 1.55, 0), '#fff2cc'));   // the headlamp
  G.push(colored(new THREE.BoxGeometry(0.64, 0.54, 0.02).translate(-6.0, 2.8, 1.29), '#ffcf7a'), colored(new THREE.BoxGeometry(0.64, 0.54, 0.02).translate(-6.0, 2.8, -1.29), '#ffcf7a'));
  // the tender
  add(new THREE.BoxGeometry(3.6, 1.7, 2.4), body, -9.6, 1.95, 0);
  add(new THREE.BoxGeometry(3.4, 0.3, 2.2), '#141414', -9.6, 2.85, 0);
  for (const x of [-8.6, -10.6]) for (const z of [-0.78, 0.78]) add(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16).rotateX(Math.PI / 2), black, x, 0.46, z);
  add(new THREE.BoxGeometry(3.7, 0.14, 2.46), black, -9.6, 1.05, 0);
  // the coaches: four, each with a row of lit windows both sides, a curved roof
  const CL = 9.6;
  for (let c = 0; c < 4; c++) {
    const x0 = -12.0 - c * (CL + 0.7), xc = x0 - CL / 2;
    add(new THREE.BoxGeometry(CL, 2.1, 2.6), coach, xc, 2.15, 0);
    add(new THREE.BoxGeometry(CL + 0.04, 0.18, 2.62), '#2d3940', xc, 1.12, 0);
    add(new THREE.CylinderGeometry(1.42, 1.42, CL + 0.1, 20, 1, false, -0.85, 1.7).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), roof, xc, 2.1, 0);
    for (const x of [x0 - 1.3, x0 - CL + 1.3]) for (const z of [-0.78, 0.78]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14).rotateX(Math.PI / 2), black, x, 0.45, z);
    for (let w = 0; w < 7; w++) for (const z of [-1.31, 1.31]) G.push(colored(new THREE.BoxGeometry(0.85, 0.62, 0.02).translate(x0 - 0.8 - w * 1.3, 2.45, z), '#ffd38a'));
    if (c < 3) add(new THREE.BoxGeometry(0.7, 1.7, 1.6), '#23282c', x0 - CL - 0.35, 2.0, 0);   // the gangway
  }
  // (the roof's cylinder was laid along y and rolled to x: a shell, its open side down)
  const paintM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 });
  const glowM = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: '#ffc77a', emissiveIntensity: 1.7, roughness: 0.5 });
  const train = new THREE.Group();
  train.add(new THREE.Mesh(mergeGeometries(P), paintM), new THREE.Mesh(mergeGeometries(G), glowM));
  // its headlamp's beam: a soft additive glow
  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 64;
  { const c = glowC.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.3, 'rgba(255,220,160,.35)'); g.addColorStop(1, 'rgba(255,200,140,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  const glowT = new THREE.CanvasTexture(glowC);
  const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: '#ffe2b0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  lamp.scale.setScalar(2.2); lamp.position.set(0.1, 1.55, 0); train.add(lamp);
  root.add(train);
  const LEN = 12.0 + 4 * (CL + 0.7);
  // it faces -s (toward the ring): local x → -D, y up, z → -N (right-handed: (-D) × up = -N; it's symmetric across z)
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(-D.x, 0, -D.z), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-N.x, 0, -N.z));
  train.matrixAutoUpdate = false;

  // ----- smoke and steam: a pool of soft points -----
  const NP = 320, sp = new Float32Array(NP * 3), sv = new Float32Array(NP * 3), sa = new Float32Array(NP), ss = new Float32Array(NP), sk = new Float32Array(NP);
  const age = new Float32Array(NP).fill(99), life = new Float32Array(NP);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
  sg.setAttribute('aA', new THREE.BufferAttribute(sa, 1).setUsage(THREE.DynamicDrawUsage));
  sg.setAttribute('aS', new THREE.BufferAttribute(ss, 1).setUsage(THREE.DynamicDrawUsage));
  sg.setAttribute('aK', new THREE.BufferAttribute(sk, 1));
  for (let i = 0; i < NP; i++) sk[i] = R();
  const smokeM = new THREE.ShaderMaterial({
    uniforms: { time, px: { value: 600 } }, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute float aA, aS, aK; uniform float px; varying float vA, vK;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aA; vK = aK; gl_Position = projectionMatrix * mv; gl_PointSize = aA > 0.0 ? clamp(aS * px / -mv.z, 1.0, 220.0) : 0.0; }`,
    fragmentShader: `varying float vA, vK;
      void main() { vec2 p = gl_PointCoord - 0.5; float r = length(p); if (r > 0.5) discard;
        float n = sin(p.x * 9.0 + vK * 30.0) * sin(p.y * 8.0 - vK * 21.0) * 0.12;
        float a = smoothstep(0.5, 0.05, r + n) * vA;
        gl_FragColor = vec4(mix(vec3(0.82, 0.84, 0.9), vec3(0.62, 0.64, 0.72), vK), a * 0.55); }`,
  });
  const smoke = new THREE.Points(sg, smokeM); smoke.frustumCulled = false; root.add(smoke);
  let next = 0;
  const puff = (x, y, z, vx, vy, vz, size, l) => {
    const i = next; next = (next + 1) % NP;
    sp[i * 3] = x; sp[i * 3 + 1] = y; sp[i * 3 + 2] = z; sv[i * 3] = vx; sv[i * 3 + 1] = vy; sv[i * 3 + 2] = vz; ss[i] = size; age[i] = 0; life[i] = l;
  };

  // ----- the timetable -----
  const S = { s: FAR + 200, v: 0, state: 'away', t: 0, wait: 25, called: false, chuff: 0, dir: -1 };
  const pos = new THREE.Vector3(), w2 = new THREE.Vector3(), chim = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const WIND = new THREE.Vector3(N.x * 0.5 + D.x * 0.6, 0, N.z * 0.5 + D.z * 0.6);
  function place() {
    const w = toWorld(S.s, TRACK_U);
    m4.copy(basis).setPosition(w.x, Y_DECK + 0.2, w.z);
    train.matrix.copy(m4); train.matrixWorldNeedsUpdate = true;
    train.visible = S.s < DECK_END + 30;
  }
  function update(dt, t) {
    dt = Math.min(dt, 0.1);
    S.t += dt;
    const was = S.state;
    switch (S.state) {
      case 'away':
        if (S.t > S.wait || S.called) { S.state = 'in'; S.t = 0; S.s = FAR; S.v = CRUISE; S.called = false; on('whistle', 1); }
        break;
      case 'in': {
        const left = S.s - STOP;
        S.v = Math.min(CRUISE, Math.max(0.6, Math.sqrt(Math.max(0, left) * 2 * 0.55)));
        S.s -= S.v * dt;
        if (left < 60 && !S.braked) { S.braked = true; on('brake'); }
        if (S.s <= STOP) { S.s = STOP; S.v = 0; S.state = 'stop'; S.t = 0; S.braked = false; on('hiss'); }
        break;
      }
      case 'stop':
        if (S.t > 14) { S.state = 'out'; S.t = 0; on('whistle', 0); }
        break;
      case 'out':
        S.v = Math.min(CRUISE * 1.1, S.v + dt * 0.5);
        S.s += S.v * dt;
        if (S.s > FAR + 60) { S.state = 'away'; S.t = 0; S.s = FAR + 200; S.wait = 30 + Math.random() * 25; S.v = 0; }
        break;
    }
    if (was !== S.state) S.since = t;
    place();
    // the chuffs: four a turn of the wheels, a puff each from the chimney; harder starting, softer at speed
    chim.set(-0.95, 3.6, 0).applyMatrix4(train.matrix);
    if (S.v > 0.1) {
      S.chuff += S.v * dt / (Math.PI * 1.24) * 4;
      if (S.chuff >= 1) {
        S.chuff -= 1;
        const hard = S.state === 'out' ? Math.max(0.4, 1 - S.v / 10) : 0.35;
        for (let k = 0; k < 3; k++) puff(chim.x, chim.y, chim.z, (Math.random() - 0.5) * 0.4, 1.6 + hard * 2.5 + Math.random(), (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.5, 4 + Math.random() * 3);
        on('chuff', hard);
      }
    } else if (S.state === 'stop') {   // standing: a lazy column from the chimney, steam about the wheels at first
      if (Math.random() < dt * 3) puff(chim.x, chim.y, chim.z, 0, 0.8, 0, 1.0, 6);
      if (S.t < 3 && Math.random() < dt * 30) { w2.set(-1.5 - Math.random() * 4, 0.5, (Math.random() < 0.5 ? -1 : 1) * 1.3).applyMatrix4(train.matrix); puff(w2.x, w2.y, w2.z, (Math.random() - 0.5) * 1.5, 0.4, (Math.random() - 0.5) * 1.5, 1.0, 2.5); }
    }
    // the smoke: rising, slowing, spreading, drifting with the wind and left behind as the train goes
    for (let i = 0; i < NP; i++) {
      if (age[i] > life[i]) { sa[i] = 0; continue; }
      age[i] += dt;
      const u = age[i] / life[i], drag = Math.exp(-dt * 0.8);
      sv[i * 3] = sv[i * 3] * drag + WIND.x * dt * 0.6; sv[i * 3 + 1] = sv[i * 3 + 1] * drag; sv[i * 3 + 2] = sv[i * 3 + 2] * drag + WIND.z * dt * 0.6;
      sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt + dt * 0.25; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
      ss[i] += dt * 0.9;
      sa[i] = Math.min(1, age[i] * 5) * (1 - u) * (1 - u);
    }
    sg.attributes.position.needsUpdate = sg.attributes.aA.needsUpdate = sg.attributes.aS.needsUpdate = true;
  }
  place();
  return {
    root, train, S, update, LEN,
    call() { if (S.state === 'away') { S.called = true; return true; } return false; },
    /** (tests) stand it somewhere: s of its front, its state */
    stage(s, state = 'stop') { S.s = s; S.state = state; S.t = 0; S.v = state === 'stop' ? 0 : CRUISE; place(); },
    res(h) { smokeM.uniforms.px.value = h * 0.9; },
    pos: () => pos.set(0, 2, 0).applyMatrix4(train.matrix),
  };
}
