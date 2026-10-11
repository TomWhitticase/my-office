// The wellness floor's spa and the rooms round it (floors/wellness.js). In the south-east: a cedar sauna with a window
// on the city (benches to sit on, a stove of stones: click the ladle for löyly, a hiss, a cloud of steam, the dial
// climbing, the air shimmering while you're in), a tiled steam room under a starry ceiling (the glass fogs the longer
// you're in, steam rolling round you), an infrared cabin (a bench in the heaters' red glow), a cold plunge (click to get in), rain showers (click one to run it) and a quiet
// lounge on the window. West of them, two small changing rooms behind doors (oak lockers: click one to open it); on the way
// through, a juice bar (click the blender); on the west windows, a yoga studio behind glass and a lounge of daybeds.

import * as THREE from 'three';
import { clamp, FONT, makeCanvas, mat, rng } from '../util.js';
import { causticMaterial } from './wellness-pool.js';

const AMBER = new THREE.Color('#ffb070'), IR = new THREE.Color('#ff9a70');

export function installSpa(ctx, W) {
  const { G, M, kit, solid, R } = W, { toast, camera } = ctx;
  const sound = W.sound;
  const k = kit();
  let lampShade;
  const glow = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.8 });
  const slateM = mat('#3b3f42', { roughness: 0.55 });
  const mosaicTex = (() => {   // the steam room's tiles: 2.5 cm, slate to sea green
    const t = makeCanvas(512, 512), c = t.ctx, n = 40, s = 512 / n, cols = ['#3f5552', '#47605c', '#36504d', '#52706a', '#3a4a49'];
    c.fillStyle = '#26302f'; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = cols[Math.floor(R() * cols.length)]; c.fillRect(i * s + 1, j * s + 1, s - 2, s - 2); }
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true;
    return t.tex;   // 1 m
  })();
  const mosaicM = new THREE.MeshStandardMaterial({ map: mosaicTex, roughness: 0.25 });
  W.tileWallM.map = mosaicTex; W.tileWallM.color.set('#ffffff'); W.tileWallM.needsUpdate = true;
  const tiled = (w, h, d, x, y, z, s = 1) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); k.geo(mosaicM, W.uvWorld(g, s, 'wall')); };
  const cedarBox = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); k.geo(M.cedar, W.uvWorld(g, 1, 'wall')); };
  const inZone = (p, x0, x1, z0, z1) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1;
  // A small brass plaque by a door, facing `ry`.
  W.plaque = (text, x, y, z, ry) => {
    const t = makeCanvas(256, 64), c = t.ctx;
    c.fillStyle = '#b8935a'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#2a2016'; c.font = `500 26px ${FONT}`; c.textAlign = 'center'; c.fillText(text.split('').join(' '), 128, 42);
    t.tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.09), new THREE.MeshStandardMaterial({ map: t.tex, metalness: 0.6, roughness: 0.35 }));
    m.position.set(x, y, z); m.rotation.y = ry; G.add(m);
  };

  // ----- steam: soft billboards, one instanced mesh for every puff and wisp on the floor -----
  const NS = 96, steamGeo = new THREE.PlaneGeometry(1, 1), iData = new THREE.InstancedBufferAttribute(new Float32Array(NS * 4), 4);
  steamGeo.setAttribute('iData', iData);
  const steamM = new THREE.ShaderMaterial({
    uniforms: { time: W.U.time }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 iData; varying vec2 vUv; varying vec4 vD;
      void main() { vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * iData.y; gl_Position = projectionMatrix * mv; vUv = uv; vD = iData; }`,
    fragmentShader: `uniform float time; varying vec2 vUv; varying vec4 vD;
      void main() {
        vec2 p = vUv - 0.5; float r = length(p) * 2.0;
        float n = 0.65 + 0.35 * sin(p.x * 9.0 + vD.z * 6.3 + time * 0.7) * sin(p.y * 7.0 - vD.z * 4.1 + time * 0.5);
        gl_FragColor = vec4(vec3(0.93, 0.95, 0.95), (1.0 - smoothstep(0.1, 1.0, r)) * n * vD.x * vD.w);
      }`,
  });
  const steam = new THREE.InstancedMesh(steamGeo, steamM, NS);
  steam.frustumCulled = false; steam.layers.set(1); steam.renderOrder = 3; steam.count = 0; G.add(steam);
  const puffs = [];   // { x, y, z, vx, vy, vz, age, life, size, grow, a }
  const m4 = new THREE.Matrix4();
  function puff(x, y, z, o = {}) {
    if (puffs.length >= NS) puffs.shift();
    puffs.push({ x, y, z, vx: o.vx ?? (Math.random() - 0.5) * 0.15, vy: o.vy ?? 0.35, vz: o.vz ?? (Math.random() - 0.5) * 0.15, age: 0, life: o.life ?? 3, size: o.size ?? 0.4,
      grow: o.grow ?? 0.5, a: o.a ?? 0.5, seed: Math.random(), ceil: o.ceil ?? 3.2, drag: o.drag ?? 0 });
  }
  W.puff = puff;
  function steamFx(dt) {
    let n = 0;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt;
      if (p.age > p.life) { puffs.splice(i, 1); continue; }
      p.x += p.vx * dt; p.z += p.vz * dt; p.y = Math.min(p.ceil, p.y + p.vy * dt);
      if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vz *= f; }
      if (p.y >= p.ceil) { p.vx *= 1.01; p.vz *= 1.01; }
    }
    for (const p of puffs) {
      const u = p.age / p.life;
      m4.makeTranslation(p.x, p.y, p.z); steam.setMatrixAt(n, m4);
      iData.setXYZW(n, Math.min(1, u * 5) * (1 - u) * (1 - u), p.size + p.grow * p.age, p.seed, p.a);
      n++;
    }
    steam.count = n; steam.instanceMatrix.needsUpdate = true; iData.needsUpdate = true;
  }

  // ----- standing fog: the steam room's (thick by the floor and under the ceiling) and the sauna's faint heat haze -----
  // Big soft sprites that stay put and drift slowly, one instanced mesh for both rooms; each kept half its size clear of
  // the walls, floor and ceiling (a billboard cutting through a wall shows a hard edge), faded as you come up to one.
  const bank = [], bankR = rng(4646 + 7);
  const NB = 44, bankGeo = new THREE.PlaneGeometry(1, 1), bData = new THREE.InstancedBufferAttribute(new Float32Array(NB * 4), 4);
  bankGeo.setAttribute('iData', bData);
  const bankM = new THREE.ShaderMaterial({
    uniforms: { time: W.U.time }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 iData; varying vec2 vUv; varying vec4 vD; varying float vNear;
      void main() { vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * iData.y;
        vNear = smoothstep(0.15, 0.9, -mv.z / iData.y); gl_Position = projectionMatrix * mv; vUv = uv; vD = iData; }`,
    fragmentShader: `uniform float time; varying vec2 vUv; varying vec4 vD; varying float vNear;
      void main() {
        vec2 p = vUv - 0.5; float r = length(p) * 2.0, s = fract(vD.z);
        float n = 0.6 + 0.4 * sin(p.x * 6.0 + s * 9.0 + time * 0.23) * sin(p.y * 5.0 - s * 7.0 + time * 0.17);
        vec3 c = mix(vec3(0.92, 0.95, 0.95), vec3(1.0, 0.78, 0.5), step(1.0, vD.z));   // white steam; amber haze
        gl_FragColor = vec4(c, (1.0 - smoothstep(0.05, 1.0, r)) * n * vD.x * vD.w * vNear);
      }`,
  });
  const fogBank = new THREE.InstancedMesh(bankGeo, bankM, NB);
  fogBank.frustumCulled = false; fogBank.layers.set(1); fogBank.renderOrder = 3; fogBank.count = 0; G.add(fogBank);
  const ST = { x0: 10.8, x1: 15.6, z0: -14.9, z1: -10.6 };
  const SA = { x0: 15.6, x1: 19.9, z0: -14.9, z1: -10.6 };
  {
    // The steam room: a layer on the floor, a layer under the ceiling (2.55), thinner between.
    for (let i = 0; i < 34; i++) {
      const band = i < 14 ? 0 : i < 26 ? 2 : 1, size = band === 1 ? 1.5 + bankR() * 0.4 : 0.95 + bankR() * 0.35, h = size / 2;
      const y = band === 0 ? h + bankR() * 0.15 : band === 2 ? 2.55 - h - bankR() * 0.1 : 1.0 + bankR() * 0.5;
      bank.push({ room: 0, x: ST.x0 + h + 0.05 + bankR() * (ST.x1 - ST.x0 - size - 0.1), y, z: ST.z0 + 0.7 + h + bankR() * (ST.z1 - ST.z0 - 0.7 - size - 0.1),
        size, a: band === 1 ? 0.22 : 0.42, ph: bankR() * 6.28, seed: bankR() * 0.99 });
    }
    // The sauna: a faint warm haze under its lowered ceiling (2.45) and over the stove.
    for (let i = 0; i < 10; i++) {
      const size = 0.8 + bankR() * 0.3, h = size / 2, overStove = i < 3;
      bank.push({ room: 1, x: overStove ? 19.0 - bankR() * 0.3 : SA.x0 + 1.4 + h + bankR() * (SA.x1 - SA.x0 - 1.5 - size), y: overStove ? 1.35 + i * 0.25 : 2.45 - h - bankR() * 0.05,
        z: overStove ? -11.5 - bankR() * 0.3 : SA.z0 + 0.2 + h + bankR() * (SA.z1 - SA.z0 - 0.4 - size), size, a: overStove ? 0.16 : 0.12, ph: bankR() * 6.28, seed: 1 + bankR() * 0.99 });
    }
  }
  function bankFx(t, steamK, hazeK) {
    let n = 0;
    for (const b of bank) {
      const k = b.room ? hazeK : steamK;
      if (k < 0.01) continue;
      // A slow drift, never further than keeps it clear of the walls.
      const dx = Math.sin(t * 0.07 + b.ph) * 0.12, dz = Math.cos(t * 0.05 + b.ph * 1.3) * 0.12, dy = Math.sin(t * 0.11 + b.ph) * 0.04;
      m4.makeTranslation(b.x + dx, b.y + dy, b.z + dz); fogBank.setMatrixAt(n, m4);
      bData.setXYZW(n, k, b.size, b.seed, b.a); n++;
    }
    fogBank.count = n; fogBank.instanceMatrix.needsUpdate = true; bData.needsUpdate = true;
  }

  // ----- the sauna -----
  // Cedar inside: the shared wall, the south wall, a lowered ceiling and duckboards; two tiers of benches along the west
  // wall facing the window; the stove by the door, a bucket and ladle; a dial on the south wall.
  const stove = { x: 19.1, z: -11.35 };
  const sauna = { temp: 82, hum: 12, heat: 0, stove, inside: false, creakAt: 6, burst: 0,
    hotM: new THREE.MeshStandardMaterial({ color: '#4a2c20', emissive: '#ff5a1a', emissiveIntensity: 0.6, roughness: 0.9 }) };
  W.sauna = sauna;
  {
    cedarBox(SA.x1 - SA.x0, 3.3, 0.04, (SA.x0 + SA.x1) / 2, 1.65, SA.z0 + 0.12);   // over the south wall
    cedarBox(SA.x1 - SA.x0, 0.06, SA.z1 - SA.z0, (SA.x0 + SA.x1) / 2, 2.45, (SA.z0 + SA.z1) / 2);   // the lowered ceiling
    cedarBox(SA.x1 - SA.x0 - 0.1, 0.04, SA.z1 - SA.z0 - 0.15, (SA.x0 + SA.x1) / 2, 0.02, (SA.z0 + SA.z1) / 2);
    // Benches in two tiers: slatted tops on bearers, the upper one's front boarded with gaps, slatted backrests on the wall
    // with warm light behind them.
    const BZ = -12.95, BL = 3.5;   // the benches' middle and length, clear of the door
    const slats = (x0, x1, y) => {   // boards along the bench, 9 cm with 1.5 cm gaps, on bearers every 0.8 m
      for (let x = x0 + 0.05; x < x1 - 0.04; x += 0.105) cedarBox(0.09, 0.035, BL, x, y, BZ);
      for (let z = BZ - BL / 2 + 0.15; z < BZ + BL / 2; z += 0.8) cedarBox(x1 - x0 - 0.02, 0.05, 0.05, (x0 + x1) / 2, y - 0.045, z);
    };
    slats(SA.x0 + 0.1, SA.x0 + 0.66, 0.95); cedarBox(0.55, 0.92, 0.05, SA.x0 + 0.38, 0.46, BZ - BL / 2 + 0.03);
    for (let y = 0.6; y < 0.92; y += 0.11) cedarBox(0.03, 0.08, BL, SA.x0 + 0.65, y, BZ);   // the step's riser
    slats(SA.x0 + 0.62, SA.x0 + 1.18, 0.48);
    for (let y = 0.06; y < 0.44; y += 0.11) cedarBox(0.03, 0.08, BL, SA.x0 + 1.17, y, BZ);
    for (const y of [1.24, 1.37, 1.5]) cedarBox(0.035, 0.08, BL, SA.x0 + 0.13, y, BZ);
    k.box(glow('#ffb35c', 1.6), 0.02, 0.02, BL - 0.1, SA.x0 + 0.11, 1.17, BZ); k.box(glow('#ffb35c', 1.2), 0.02, 0.02, BL - 0.1, SA.x0 + 0.6, 0.9, BZ);
    solid(SA.x0 + 0.62, BZ, 1.15, BL);
    // The stove: black steel under a heap of stones, a cedar guard round it.
    k.box(M.black, 0.55, 0.7, 0.45, stove.x, 0.35, stove.z); k.box(M.black, 0.6, 0.04, 0.5, stove.x, 0.72, stove.z);
    // Stones, the ones down in the heap glowing (brighter with each ladle), and the firebox's slot under them.
    const stoneM = mat('#6b6762', { roughness: 0.95 });
    for (let i = 0; i < 30; i++) {
      const r = 0.05 + R() * 0.04, x = stove.x + (R() - 0.5) * 0.45, y = 0.78 + R() * 0.16, z = stove.z + (R() - 0.5) * 0.36;
      k.geo(i % 3 === 0 && y < 0.88 ? sauna.hotM : stoneM, new THREE.IcosahedronGeometry(r, 0).translate(x, y, z));
    }
    k.geo(sauna.hotM, new THREE.BoxGeometry(0.3, 0.035, 0.01).toNonIndexed().translate(stove.x - 0.02, 0.5, stove.z - 0.226));   // (merged with the stones: unindexed too)
    // A wall lamp in the corner behind a cedar louvre: the low amber light.
    k.box(glow('#ffa64d', 2.2), 0.04, 0.3, 0.3, SA.x0 + 0.06, 2.05, SA.z0 + 0.35);
    for (let y = 1.92; y < 2.2; y += 0.06) cedarBox(0.03, 0.025, 0.36, SA.x0 + 0.12, y, SA.z0 + 0.35);
    for (const [w, d, x, z] of [[0.04, 0.7, stove.x - 0.42, stove.z], [0.75, 0.04, stove.x - 0.05, stove.z - 0.4]]) cedarBox(w, 0.85, d, x, 0.43, z);
    solid(stove.x, stove.z, 0.9, 0.85);
    // Bucket and ladle on the lower bench's end.
    const bk = { x: 16.5, z: -11.5 };   // the bucket, on the lower bench's end
    k.cyl(M.cedar, 0.12, 0.1, 0.2, bk.x, 0.61, bk.z, 16); k.cyl(M.brass, 0.125, 0.125, 0.02, bk.x, 0.702, bk.z, 16);   // (the rim 2 mm over the staves' top)
    k.cyl(M.cedar, 0.012, 0.012, 0.55, bk.x + 0.12, 0.86, bk.z, 6, 0, -0.6); k.cyl(M.brass, 0.04, 0.03, 0.04, bk.x, 0.688, bk.z, 10);
    W.hits.push(ctx.hitBox(G, 0.45, 0.6, 0.4, bk.x, 0.8, bk.z, { action: 'wellness-ladle', reach: 2.6 }));
    // Seats: two on each tier, facing the window.
    for (const [x, y, z] of [[SA.x0 + 0.42, 1.35, -13.6], [SA.x0 + 0.42, 1.35, -12.0], [SA.x0 + 0.95, 0.95, -13.9], [SA.x0 + 0.95, 0.95, -12.4]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 2; G.add(g);
      const st = W.seat(g, 'Sauna bench', 0, y + 0.5);
      W.hits.push(ctx.hitBox(G, 0.5, 0.2, 0.7, x, y - 0.38, z, { seat: st }));
    }
  }
  // The dial: temperature round the outside, humidity under it.
  const dial = W.screen(G, 0.36, 0.36, 18.3, 1.75, SA.z0 + 0.15, 0, 256);
  function paintDial() {
    const { ctx: c, W: w } = dial, r = w / 2;
    c.fillStyle = '#3b2616'; c.fillRect(0, 0, w, w);
    c.fillStyle = '#f2e6d0'; c.beginPath(); c.arc(r, r, r - 10, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#b8935a'; c.lineWidth = 8; c.stroke();
    c.fillStyle = '#2a2420'; c.textAlign = 'center';
    for (let t = 40; t <= 120; t += 20) { const a = Math.PI * 0.75 + (t - 40) / 80 * Math.PI * 1.5; c.font = `500 18px ${FONT}`; c.fillText(String(t), r + Math.cos(a) * (r - 40), r + Math.sin(a) * (r - 40) + 6); }
    const a = Math.PI * 0.75 + (sauna.temp - 40) / 80 * Math.PI * 1.5;
    c.strokeStyle = '#b3261e'; c.lineWidth = 5; c.beginPath(); c.moveTo(r, r); c.lineTo(r + Math.cos(a) * (r - 30), r + Math.sin(a) * (r - 30)); c.stroke();
    c.fillStyle = '#2a2420'; c.beginPath(); c.arc(r, r, 9, 0, Math.PI * 2); c.fill();
    c.font = `600 22px ${FONT}`; c.fillText(`${Math.round(sauna.temp)} °C`, r, r + 56); c.font = `400 16px ${FONT}`; c.fillText(`${Math.round(sauna.hum)} % RH`, r, r + 80);
    c.textAlign = 'left'; dial.tex.needsUpdate = true;
  }
  paintDial();
  // A sand timer on the wall beside it (15 minutes): click to turn it over.
  const sand = { k: 0.6, flip: 0, g: new THREE.Group(), hg: new THREE.Group() };
  {
    const { g, hg } = sand, sk = kit(), H = 0.11, Rb = 0.045, sandM = mat('#d9b77a', { roughness: 1 });
    g.position.set(17.45, 1.62, SA.z0 + 0.2); G.add(g); g.add(hg);
    sk.cyl(M.cedar, 0.07, 0.07, 0.02, 0, H + 0.01, 0, 16); sk.cyl(M.cedar, 0.07, 0.07, 0.02, 0, -H - 0.01, 0, 16);
    for (let i = 0; i < 3; i++) { const a = i * 2.094; sk.cyl(M.brass, 0.005, 0.005, 2 * H, Math.cos(a) * 0.058, 0, Math.sin(a) * 0.058, 6); }
    sk.flush(hg);
    const bulbs = new THREE.Mesh(mergeBulbs(Rb, H), M.glass); hg.add(bulbs);
    sand.top = new THREE.Mesh(new THREE.ConeGeometry(Rb * 0.92, H * 0.92, 16).rotateX(Math.PI).translate(0, H * 0.46, 0), sandM); hg.add(sand.top);
    sand.bot = new THREE.Mesh(new THREE.ConeGeometry(Rb * 0.95, H * 0.6, 16).translate(0, H * 0.3, 0), sandM); sand.bot.position.y = -H; hg.add(sand.bot);
    sand.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, H, 4).translate(0, -H / 2, 0), sandM); hg.add(sand.stream);
    W.hits.push(ctx.hitBox(g, 0.16, 0.26, 0.12, 0, 0, 0, { action: 'wellness-timer', reach: 2.6 }));
    sand.place = () => {
      const a = Math.cbrt(Math.max(sand.k, 1e-4)), b = Math.cbrt(Math.max(1 - sand.k, 1e-4));
      sand.top.scale.setScalar(a); sand.bot.scale.set(b, b, b);
      sand.stream.visible = sand.k > 0.002 && !sand.flip; sand.stream.scale.y = 1 - 0.6 * b;
    };
    sand.place();
  }
  function mergeBulbs(r, h) {   // two cones of glass meeting at a narrow neck
    const a = new THREE.CylinderGeometry(r, 0.004, h, 16, 1, true).translate(0, h / 2, 0), b = new THREE.CylinderGeometry(0.004, r, h, 16, 1, true).translate(0, -h / 2, 0);
    const g = new THREE.BufferGeometry(), pa = [...a.attributes.position.array, ...b.attributes.position.array], na = [...a.attributes.normal.array, ...b.attributes.normal.array];
    const off = a.attributes.position.count, ix = [...a.index.array, ...b.index.array.map((i) => i + off)];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(na, 3)); g.setIndex(ix);
    return g;
  }
  ctx.action('wellness-timer', {
    hover: () => `<b>Sand timer</b><div class="m">${sand.k > 0.002 ? `About ${Math.max(1, Math.round(sand.k * 15))} min of sand left` : 'Run out'}</div><div class="k">Click to turn it over</div>`,
    click: () => { if (!sand.flip) sand.flip = 0.001; },
  });
  ctx.action('wellness-ladle', {
    hover: () => `<b>Löyly</b><div class="m">${Math.round(sauna.temp)} °C · ${Math.round(sauna.hum)} % humidity</div><div class="k">Click to throw a ladle of water on the stones</div>`,
    click: () => {
      sound.hiss(stove.x, stove.z);
      // A burst off the stones that hits the ceiling and spreads along it (and a second wave as the water reaches the bottom).
      const burst = () => { for (let i = 0; i < 9; i++) puff(stove.x + (Math.random() - 0.5) * 0.3, 0.95, stove.z + (Math.random() - 0.5) * 0.3, { vy: 0.6 + Math.random() * 0.5, life: 3.5 + Math.random() * 2, size: 0.35, grow: 0.55, a: 0.85, ceil: 2.3,
        vx: -0.25 - Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.4, drag: 0.4 }); };
      burst(); sauna.burst = 0.45; sauna.again = burst;
      sauna.temp = Math.min(104, sauna.temp + 6); sauna.hum = Math.min(60, sauna.hum + 14); sauna.heat = Math.min(1, sauna.heat + 0.55);
      toast(sauna.temp > 98 ? 'Löyly · it’s fierce in here now' : 'Löyly · a wave of heat rolls down from the ceiling');
    },
  });

  // ----- the steam room -----
  // Mosaic everywhere inside (a skin over the cedar wall and the south wall, a lowered ceiling with a field of tiny lights),
  // tiled benches round two walls, a brass nozzle low down that breathes steam out every so often.
  const nozzle = { x: 15.45, z: -12.4 };
  const steamRoom = { fog: 0.35, puff: 0, next: 4, inside: false, dense: 0.7, open: false };
  W.steam = steamRoom;
  {
    // (the skins 4 mm under the ceiling: off the beams' tops)
    tiled(0.04, 3.296, ST.z1 - ST.z0 - 0.004, ST.x1 - 0.08, 1.648, (ST.z0 + ST.z1) / 2); tiled(ST.x1 - ST.x0, 3.296, 0.04, (ST.x0 + ST.x1) / 2, 1.648, ST.z0 + 0.12);
    k.box(mat('#252b2a', { roughness: 0.6 }), ST.x1 - ST.x0 - 0.008, 0.06, ST.z1 - ST.z0 - 0.008, (ST.x0 + ST.x1) / 2, 2.55, (ST.z0 + ST.z1) / 2);   // dark, for the stars (its edges inside the walls, off the skins' ends)
    tiled(ST.x1 - ST.x0 - 0.2, 0.45, 0.55, (ST.x0 + ST.x1) / 2, 0.225, ST.z0 + 0.42); tiled(0.55, 0.45, 2.9, ST.x0 + 0.37, 0.225, -12.3);
    tiled(ST.x1 - ST.x0 - 0.2, 0.5, 0.06, (ST.x0 + ST.x1) / 2, 0.7, ST.z0 + 0.16);
    k.box(slateM, ST.x1 - ST.x0 - 0.1, 0.02, ST.z1 - ST.z0 - 0.1, (ST.x0 + ST.x1) / 2, 0.01, (ST.z0 + ST.z1) / 2);
    k.cyl(M.brass, 0.05, 0.05, 0.08, nozzle.x, 0.32, nozzle.z, 14, 0, Math.PI / 2);
    const under = glow('#bfe6e0', 1.0);   // a soft light under the benches' lips
    k.box(under, ST.x1 - ST.x0 - 0.3, 0.015, 0.02, (ST.x0 + ST.x1) / 2, 0.41, ST.z0 + 0.71); k.box(under, 0.02, 0.015, 2.8, ST.x0 + 0.66, 0.41, -12.3);
    solid((ST.x0 + ST.x1) / 2, ST.z0 + 0.42, ST.x1 - ST.x0, 0.6); solid(ST.x0 + 0.37, -12.3, 0.6, 2.9);
    // A starry ceiling: a few hundred fibre-optic points.
    const star = glow('#fff6e0', 1.3), stars = [];
    for (let i = 0; i < 220; i++) stars.push([ST.x0 + 0.1 + R() * (ST.x1 - ST.x0 - 0.2), 2.515, ST.z0 + 0.2 + R() * (ST.z1 - ST.z0 - 0.3), 0.008 + R() * 0.01]);
    for (const [x, y, z, s] of stars) k.box(star, s, 0.004, s, x, y, z);
    for (const [x, z, rot] of [[12.0, ST.z0 + 0.42, 0], [13.3, ST.z0 + 0.42, 0], [14.6, ST.z0 + 0.42, 0], [ST.x0 + 0.37, -12.9, Math.PI / 2], [ST.x0 + 0.37, -11.6, Math.PI / 2]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; G.add(g);
      const st = W.seat(g, 'Steam bench', 0, 0.95);
      W.hits.push(ctx.hitBox(G, rot ? 0.55 : 0.9, 0.2, rot ? 0.9 : 0.55, x, 0.4, z, { seat: st }));
    }
  }
  // The sauna's and steam room's doors: cedar-framed glass, and frameless fogged glass.
  W.hingedDoor({ name: 'Sauna door', hx: 18.1, hz: -10.6, r0: Math.PI, swing: 1, w: 0.8, m: M.cedar, win: [0.2, 0.6, 1.2, 1.75] });   // opens out, a small window in it
  const steamDoor = W.slidingDoor('x', -10.6, 12.8, 13.6, { m: M.fog, frame: M.chrome });

  // The steam room's glass, fogged, with condensation: beads all over it and drops that gather and run down, leaving
  // clearer trails that mist over again (an alpha map on the fog glass, repainted a few times a second while you're near).
  const cond = makeCanvas(256, 256), drops = [], beads = [];
  for (let i = 0; i < 700; i++) beads.push([bankR() * 256, bankR() * 256, 0.6 + bankR() * 1.4, 0.3 + bankR() * 0.5]);
  cond.tex.wrapS = cond.tex.wrapT = THREE.RepeatWrapping; cond.tex.repeat.set(2, 1);
  M.fog.alphaMap = cond.tex; M.fog.needsUpdate = true;
  let condAt = 0;
  function paintCond(dt) {
    const c = cond.ctx;
    c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 256);
    for (const [x, y, r, a] of beads) { c.fillStyle = `rgba(90,90,90,${a})`; c.fillRect(x, y, r, r); }
    if (drops.length < 22 && bankR() < dt * 4 * (0.5 + steamRoom.fog)) drops.push({ x: bankR() * 256, y0: bankR() * 140, y: 0, v: 8 + bankR() * 14, age: 0, w: 1.5 + bankR() * 2 });
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.age += dt; d.y += d.v * dt * (0.6 + 0.8 * Math.abs(Math.sin(d.age * 1.7 + d.x)));   // runs in fits and starts
      const fade = Math.max(0, 1 - d.age / 14);
      if (fade <= 0 || d.y0 + d.y > 262) { drops.splice(i, 1); continue; }
      c.fillStyle = `rgba(0,0,0,${0.8 * fade})`; c.fillRect(d.x, d.y0, d.w, d.y);
      c.fillStyle = `rgba(255,255,255,${fade})`; c.fillRect(d.x - 0.5, d.y0 + d.y - 1, d.w + 1, 2.5);
    }
    cond.tex.needsUpdate = true;
  }
  paintCond(0);

  // ----- the cold plunge -----
  // A raised travertine tub of icy water: click to get in up to your shoulders (shiver, the cold blue), move or Esc to climb out.
  const PL = { x: 8.2, z: -13.3, w: 2.4, d: 1.9 }, plungeTop = 0.62;
  {
    const { x, z, w, d } = PL, t = 0.14;
    for (const [bw, bd, bx, bz] of [[w, t, x, z - d / 2], [w, t, x, z + d / 2], [t, d, x - w / 2, z], [t, d, x + w / 2, z]]) k.box(M.stoneWall, bw, plungeTop, bd, bx, plungeTop / 2, bz);
    k.box(M.stone, w + 0.14, 0.04, t + 0.1, x, plungeTop + 0.02, z + d / 2); k.box(M.stone, w + 0.14, 0.04, t + 0.1, x, plungeTop + 0.02, z - d / 2);
    k.box(M.stone, t + 0.1, 0.04, d - t - 0.1, x - w / 2, plungeTop + 0.02, z); k.box(M.stone, t + 0.1, 0.04, d - t - 0.1, x + w / 2, plungeTop + 0.02, z);   // (between the long ones, not under them)
    const inner = causticMaterial({ color: '#5f9497', roughness: 0.3 }, { ...W.U, waterY: { value: W.Y + plungeTop - 0.06 } });
    // Its floor just over the room's (which would show through one sunk below it), tiled like the walls.
    k.box(inner, w - t, 0.02, d - t, x, 0.02, z);
    for (const [bw, bd, bx, bz] of [[w - t, 0.02, x, z - d / 2 + t / 2 + 0.01], [w - t, 0.02, x, z + d / 2 - t / 2 - 0.01], [0.02, d - t, x - w / 2 + t / 2 + 0.01, z], [0.02, d - t, x + w / 2 - t / 2 - 0.01, z]])
      k.box(inner, bw, plungeTop - 0.03, bd, bx, (plungeTop + 0.03) / 2, bz);
    k.box(M.chrome, 0.03, 0.9, 0.03, x + w / 2 - 0.25, 0.95, z + d / 2 + 0.02); k.box(M.chrome, 0.03, 0.03, 0.35, x + w / 2 - 0.25, 1.4, z + d / 2 - 0.15);
    const g = new THREE.PlaneGeometry(w - t, d - t); g.rotateX(-Math.PI / 2); g.translate(x, plungeTop - 0.06, z);
    const water = new THREE.Mesh(g, W.water()); water.renderOrder = 2; water.layers.set(1); G.add(water);
    // The body of the water, so it reads as full: a cold blue-green just under the surface (the surface alone is clear).
    const body = new THREE.Mesh(g.clone().translate(0, -0.012, 0), new THREE.MeshBasicMaterial({ color: '#1f6f7a', transparent: true, opacity: 0.3, depthWrite: false }));
    body.renderOrder = 1; body.layers.set(1); G.add(body);
    solid(x, z, w + 0.1, d + 0.1);
    const sign = makeCanvas(256, 96), c = sign.ctx;
    c.fillStyle = '#1b1c1e'; c.fillRect(0, 0, 256, 96); c.fillStyle = '#9fd3e0'; c.font = `300 44px ${FONT}`; c.textAlign = 'center'; c.fillText('8 °C', 128, 52);
    c.font = `500 15px ${FONT}`; c.fillStyle = '#c9c4ba'; c.fillText('COLD PLUNGE', 128, 80); sign.tex.needsUpdate = true;
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), new THREE.MeshStandardMaterial({ map: sign.tex, roughness: 0.4 }));
    sm.position.set(x, 0.4, z + d / 2 + 0.072); G.add(sm);
    W.hits.push(ctx.hitBox(G, w, 0.8, d, x, 0.4, z, { action: 'wellness-plunge', reach: 3 }));
  }
  const plunge = {
    name: 'Cold plunge', t: 0,
    start() {
      Object.assign(ctx.player, { x: PL.x + 0.3, z: PL.z, seated: false, seat: null, yaw: Math.PI / 2, pitch: -0.1 });
      W.lift.eye = 0.95; plunge.t = 0;
      sound.splash(PL.x, PL.z, false); W.ripple(PL.x, PL.z, 0.03);
      toast('8 °C · breathe slowly · move or <kbd>Esc</kbd> to climb out');
    },
    fx(dt) {
      plunge.t += dt;
      const shiver = Math.exp(-plunge.t / 8) * 0.9 + 0.1;
      W.lift.bob = Math.sin(plunge.t * 37) * 0.004 * shiver; W.lift.roll = Math.sin(plunge.t * 29) * 0.006 * shiver;
      W.wantVeil = ['radial-gradient(ellipse at 50% 40%, rgba(170,225,240,.0), rgba(120,190,220,.55))', 0.25 + 0.5 * Math.exp(-plunge.t / 3)];
      if (plunge.t > 45) { W.stop(); toast('Out of the plunge · tingling all over'); }
    },
    stop() { Object.assign(ctx.player, { x: PL.x + PL.w / 2 + 0.55, z: PL.z + 0.6 }); W.lift.bob = W.lift.roll = 0; sound.splash(PL.x, PL.z, false); },
  };
  ctx.action('wellness-plunge', {
    hover: () => `<b>Cold plunge · 8 °C</b><div class="k">${W.using === plunge ? 'Click to climb out' : 'Click to get in'}</div>`,
    click: () => W.use(plunge),
  });

  // ----- the rain showers -----
  // Three ceiling heads in a bay behind the fluted screen, a slate floor with a linear drain. Click one to run it.
  const SH = { x: 5.2, zs: [-14.1, -12.95, -11.8] }, showers = [];
  {
    k.box(slateM, 2.296, 0.02, 3.7, 5.2, 0.012, -13.05); k.box(M.black, 0.08, 0.0185, 3.5, 4.35, 0.01525, -13.05);
    tiled(2.3, 3.296, 0.04, 5.2, 1.648, -14.84);
    const rainM = new THREE.ShaderMaterial({ uniforms: { time: W.U.time, on: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vL; void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float time, on; varying vec3 vL;
        void main() {
          vec2 q = vec2((vL.x + vL.z) * 38.0, vL.y * 3.0 + time * 9.0);
          float col = floor(q.x), h = fract(sin(col * 91.7) * 43758.5);
          float streak = smoothstep(0.75, 1.0, fract(q.y + h * 7.0)) * step(0.35, fract(q.x));
          gl_FragColor = vec4(vec3(0.85, 0.93, 1.0), streak * 0.5 * on * smoothstep(0.0, 0.3, vL.y + 1.1));
        }` });
    W.rainM = rainM;   // the hall's experience showers' too
    for (const z of SH.zs) {
      k.box(M.black, 0.42, 0.03, 0.42, SH.x, 3.25, z); k.box(M.chrome, 0.38, 0.01, 0.38, SH.x, 3.23, z);
      const m = rainM.clone(); m.uniforms.time = W.U.time;
      const rain = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 2.2, 10, 1, true), m);
      rain.position.set(SH.x, 2.12, z); rain.visible = false; rain.layers.set(1); G.add(rain);
      const hit = ctx.hitBox(G, 0.6, 3.2, 0.6, SH.x, 1.6, z, { action: 'wellness-shower', reach: 3 });
      const s = { z, rain, on: false, at: 0 }; hit.userData.info = s; showers.push(s); W.hits.push(hit);
    }
    k.box(M.chrome, 0.05, 0.2, 0.08, 4.12, 1.3, -12.4);   // the mixer
  }
  ctx.action('wellness-shower', {
    hover: (h) => `<b>Rain shower</b><div class="k">Click to turn it ${h.info.on ? 'off' : 'on'}</div>`,
    click: (h) => {
      const s = h.info; s.on = !s.on; s.at = 0; s.rain.visible = s.on; s.rain.material.uniforms.on.value = s.on ? 1 : 0;
      const any = showers.find((q) => q.on);
      sound.shower(!!any, SH.x, any?.z ?? s.z);
      if (s.on) toast('Rain shower · 38 °C');
    },
  });

  // ----- the spa lounge -----
  // Two heated stone loungers on the east window, a low table with tea, a tall plant.
  for (const z of [-8.9, -6.4]) {
    const g = new THREE.Group(); g.position.set(17.6, 0, z); g.rotation.y = Math.PI / 2; G.add(g);
    const lk = kit();
    lk.box(M.stoneWall, 0.8, 0.32, 1.9, 0, 0.16, 0); lk.box(M.taupe, 0.72, 0.08, 1.25, 0, 0.36, 0.3);
    const back = new THREE.BoxGeometry(0.72, 0.08, 0.7); back.translate(0, 0, -0.35); back.rotateX(0.7); back.translate(0, 0.36, -0.3); lk.geo(M.taupe, back);
    lk.box(M.linen, 0.6, 0.04, 0.5, 0, 0.42, 0.6);
    lk.flush(g);
    const st = W.seat(g, 'Heated lounger', 0, 0.95); W.markSeat(g, st);
    solid(17.6, z, 1.95, 0.85);
  }
  k.cyl(M.oak, 0.3, 0.3, 0.04, 17.6, 0.42, -7.65, 24); k.cyl(M.black, 0.05, 0.05, 0.4, 17.6, 0.2, -7.65, 10);
  for (const dx of [-0.08, 0.1]) { k.cyl(M.linen, 0.035, 0.03, 0.07, 17.6 + dx, 0.475, -7.6 + dx, 12); }
  k.cyl(mat('#2c2420', { roughness: 0.4 }), 0.06, 0.05, 0.14, 17.45, 0.51, -7.75, 14);
  solid(17.6, -7.65, 0.62, 0.62);
  W.planter(19.3, -4.4, 1.1); W.planter(10.4, -4.2, 0.9);

  // ----- the changing rooms -----
  // Two small rooms either side of the passage in from the way through, each behind an oak door you click: oak lockers
  // along the back wall (click one to open it), an oak bench, a backlit mirror over a shelf on the side wall.
  const lockers = [], LW = 0.46, LH = 1.95, CZ0 = -6.94, CZ1 = -3.56;
  const lockerHits = [];
  for (const { x0, x1, door, side } of [{ x0: -4.54, x1: -1.46, door: -3.6, side: -1 }, { x0: 0.46, x1: 3.94, door: 1.6, side: 1 }]) {
    const n = Math.floor((x1 - x0 - 0.1) / LW), cx = (x0 + x1) / 2, bx0 = cx - n * LW / 2, lz = CZ1 - 0.325;
    for (let i = 0; i < n; i++) lockers.push({ x: bx0 + LW / 2 + i * LW, z: lz, ry: Math.PI });   // doors facing south
    // Carcass, plinth and a lit cornice.
    k.box(M.dark, n * LW, LH, 0.55, cx, LH / 2 + 0.1, CZ1 - 0.275); k.box(M.black, n * LW, 0.1, 0.5, cx, 0.05, CZ1 - 0.27);
    k.box(M.cove, n * LW, 0.03, 0.04, cx, LH + 0.12, CZ1 - 0.53);
    solid(cx, CZ1 - 0.3, n * LW, 0.6);
    lockerHits.push(ctx.hitBox(G, n * LW, LH, 0.2, cx, LH / 2 + 0.1, CZ1 - 0.625, { action: 'wellness-locker', reach: 2.6 }));
    // The bench down the middle.
    const g = new THREE.Group(); g.position.set(cx, 0, -5.3); G.add(g);
    const bk = kit(); bk.box(M.oak, 2.0, 0.06, 0.42, 0, 0.45, 0); for (const s of [-1, 1]) bk.box(M.black, 0.05, 0.42, 0.36, s * 0.85, 0.21, 0); bk.flush(g);
    for (const lx of [-0.5, 0.5]) { const st = W.seat(g, 'Bench', lx, 1.12); W.markSeat(g, st); }
    solid(cx, -5.3, 2.0, 0.45);
    // Mirror and shelf on the side wall away from the passage, a hook rail with a robe.
    const wx = side < 0 ? x0 + 0.01 : x1 - 0.01, sx = -side;
    k.box(M.mirror, 0.02, 1.0, 0.9, wx + sx * 0.02, 1.65, -5.4); k.box(M.cove, 0.01, 1.04, 0.94, wx + sx * 0.005, 1.65, -5.4);
    k.box(M.stone, 0.3, 0.04, 1.0, wx + sx * 0.15, 0.95, -5.4); k.cyl(M.linen, 0.035, 0.03, 0.12, wx + sx * 0.15, 1.03, -5.15, 12);
    k.box(M.brass, 0.03, 0.03, 0.8, wx + sx * 0.06, 1.75, -6.3);
    k.box(M.towel, 0.12, 0.9, 0.34, wx + sx * 0.1, 1.3, -6.3);
    W.hingedDoor({ name: 'Changing room door', hx: door, hz: -7, swing: -1 });
    W.plaque('CHANGING', door - 0.32, 1.5, -7.07, Math.PI);
  }
  // The doors: one instanced oak leaf (and one of brass pulls), each hinged on its left edge.
  const leafG = new THREE.BoxGeometry(LW - 0.012, LH - 0.02, 0.025).translate((LW - 0.012) / 2, 0, 0.0125);
  const pullG = new THREE.BoxGeometry(0.018, 0.16, 0.025).translate(LW - 0.07, 0.05, 0.04);
  const leaves = new THREE.InstancedMesh(leafG, M.oak, lockers.length), pulls = new THREE.InstancedMesh(pullG, M.brass, lockers.length);
  leaves.castShadow = false; pulls.castShadow = false; G.add(leaves, pulls);
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), Yax = new THREE.Vector3(0, 1, 0);
  function placeLocker(i) {
    const L = lockers[i], c = Math.cos(L.ry), s = Math.sin(L.ry), off = 0.225;   // the hinge, on the leaf's left edge, out at the carcass's face
    pos.set(L.x - c * LW / 2 + s * off, LH / 2 + 0.1, L.z + s * LW / 2 + c * off); q.setFromAxisAngle(Yax, L.ry - (L.k || 0) * 1.75);
    m4.compose(pos, q, sc); leaves.setMatrixAt(i, m4); pulls.setMatrixAt(i, m4);
    leaves.instanceMatrix.needsUpdate = pulls.instanceMatrix.needsUpdate = true;
  }
  lockers.forEach((L, i) => { L.k = 0; L.to = 0; placeLocker(i); });
  {
    const nearest = (p) => { let best = 0, bd = Infinity; lockers.forEach((L, i) => { const d = Math.hypot(L.x - p.x, L.z - p.z); if (d < bd) { bd = d; best = i; } }); return best; };
    for (const h of lockerHits) { h.userData.drawerAt = nearest; W.hits.push(h); }
  }
  ctx.action('wellness-locker', {
    hover: (h) => `<b>Locker ${h.drawer + 1}</b><div class="k">Click to ${lockers[h.drawer].to ? 'close' : 'open'} it</div>`,
    click: (h) => { const L = lockers[h.drawer]; L.to = L.to ? 0 : 1; sound.latch(L.x, 1.1, L.z, !!L.to); },
  });

  // ----- the juice bar -----
  // On the way through: an oak bar with a fluted travertine front and four stools, a back counter of fruit, juicers and
  // a blender (click it for a smoothie), a menu board.
  const JB = { x0: -7.2, x1: -2.6, z: -1.95 };
  {
    const mx = (JB.x0 + JB.x1) / 2, len = JB.x1 - JB.x0;
    k.box(M.stoneWall, len, 1.0, 0.5, mx, 0.5, JB.z); k.box(M.oak, len + 0.1, 0.05, 0.65, mx, 1.025, JB.z + 0.05);
    for (let x = JB.x0 + 0.08; x < JB.x1; x += 0.16) k.cyl(M.stoneWall, 0.05, 0.05, 0.96, x, 0.48, JB.z + 0.25, 8);
    k.box(M.brass, len, 0.03, 0.04, mx, 0.25, JB.z + 0.32);
    solid(mx, JB.z, len + 0.1, 0.7);
    // Back counter against the wall.
    k.box(M.oak, len + 0.4, 0.9, 0.55, mx, 0.45, -3.15); k.box(M.stone, len + 0.5, 0.04, 0.6, mx, 0.92, -3.15);
    k.box(M.oak, len + 0.4, 0.035, 0.26, mx, 1.6, -3.3); k.box(M.oak, len + 0.4, 0.035, 0.26, mx, 2.05, -3.3);
    solid(mx, -3.15, len + 0.5, 0.6);
    // Fruit: bowls of oranges, limes, apples; bottles of juice on the shelves.
    const fruitM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    const fruit = (x, y, z, c, n) => { for (let i = 0; i < n; i++) { const g = new THREE.SphereGeometry(0.04 + R() * 0.01, 10, 8).translate(x + (R() - 0.5) * 0.18, y + (i > 4 ? 0.06 : 0) + R() * 0.02, z + (R() - 0.5) * 0.14);
      const col = new THREE.Color(c).offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.1), arr = new Float32Array(g.attributes.position.count * 3);
      for (let j = 0; j < arr.length; j += 3) { arr[j] = col.r; arr[j + 1] = col.g; arr[j + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); k.geo(fruitM, g); } };
    for (const [x, c] of [[-6.6, '#f08a1c'], [-6.1, '#8cc63f'], [-5.6, '#c0262d']]) { k.cyl(M.linen, 0.16, 0.1, 0.07, x, 0.975, -3.1, 20); fruit(x, 1.03, -3.1, c, 7); }
    const bottleCols = ['#f2a33a', '#a6c94a', '#d9465a', '#f4d35e', '#7fb36a', '#e4733a'];
    for (let i = 0; i < 14; i++) { const x = JB.x0 + 0.1 + i * 0.32, c = bottleCols[i % bottleCols.length];
      k.cyl(glow(c, 0.08), 0.035, 0.035, 0.2, x, 1.72, -3.3, 10); k.cyl(M.linen, 0.02, 0.02, 0.03, x, 1.84, -3.3, 8);
      if (i % 2) { k.cyl(glow(bottleCols[(i + 3) % 6], 0.08), 0.035, 0.035, 0.2, x + 0.1, 2.17, -3.3, 10); } }
    // A citrus press and juice dispensers.
    k.cyl(M.chrome, 0.12, 0.14, 0.35, -4.1, 1.115, -3.15, 18); k.cyl(M.black, 0.1, 0.1, 0.05, -4.1, 1.3, -3.15, 18);
    for (const [x, c] of [[-3.5, '#f2a33a'], [-3.2, '#a6c94a']]) { k.cyl(M.glass, 0.11, 0.11, 0.38, x, 1.13, -3.15, 18); k.cyl(glow(c, 0.1), 0.1, 0.1, 0.3, x, 1.1, -3.15, 18); }
    // Stools along the front.
    for (let i = 0; i < 4; i++) {
      const x = JB.x0 + 0.6 + i * 1.1, g = new THREE.Group(); g.position.set(x, 0, -1.15); g.rotation.y = Math.PI; G.add(g);
      const sk = kit(); sk.cyl(M.leather, 0.19, 0.19, 0.07, 0, 0.76, 0, 20); sk.cyl(M.brass, 0.02, 0.025, 0.72, 0, 0.37, 0, 10); sk.cyl(M.brass, 0.18, 0.2, 0.02, 0, 0.01, 0, 20);
      const ring = new THREE.TorusGeometry(0.15, 0.012, 6, 20); ring.rotateX(Math.PI / 2); ring.translate(0, 0.3, 0); sk.geo(M.brass, ring); sk.flush(g);
      const st = W.seat(g, 'Bar stool', 0, 1.5); W.markSeat(g, st);
    }
  }
  // The blender: its jug's contents spin and turn the colour of whatever you asked for; the glass appears on the bar.
  const BL = { x: -5.0, z: -3.1 }, RECIPES = [['Green goddess', 'spinach, apple, cucumber, ginger', '#7dbb47'], ['Sunrise', 'mango, orange, passion fruit', '#f2a33a'],
    ['Berry recovery', 'blueberry, raspberry, banana, oat', '#7a3157'], ['Beet it', 'beetroot, apple, lemon, ginger', '#b0263f'], ['Coconut cooler', 'coconut, pineapple, lime, mint', '#efe6c8']];
  const blender = { t: -1, i: 0, served: 0 };
  {
    k.box(M.black, 0.2, 0.18, 0.2, BL.x, 1.03, BL.z); k.cyl(M.glass, 0.075, 0.06, 0.26, BL.x, 1.25, BL.z, 18); k.cyl(M.black, 0.08, 0.08, 0.03, BL.x, 1.395, BL.z, 18);
    blender.mix = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.12, 18), new THREE.MeshStandardMaterial({ color: '#7dbb47', roughness: 0.6 }));
    blender.mix.position.set(BL.x, 1.19, BL.z); blender.mix.visible = false; G.add(blender.mix);
    blender.glasses = [0, 1, 2, 3].map((i) => {
      const g = new THREE.Group(); g.position.set(JB.x0 + 0.6 + i * 1.1, 1.05, JB.z + 0.1); g.visible = false; G.add(g);
      const juice = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.13, 14), new THREE.MeshStandardMaterial({ color: '#7dbb47', roughness: 0.6 }));
      juice.position.y = 0.07; g.add(juice);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.16, 14, 1, true), M.glass); glass.position.y = 0.08; g.add(glass);
      const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 6), M.black); straw.position.set(0.012, 0.15, 0); straw.rotation.z = 0.2; g.add(straw);
      return { g, juice };
    });
    W.hits.push(ctx.hitBox(G, 0.3, 0.5, 0.3, BL.x, 1.2, BL.z, { action: 'wellness-blender', reach: 3.2 }));
    // The menu board.
    const menu = makeCanvas(512, 320), c = menu.ctx;
    c.fillStyle = '#1e1f1d'; c.fillRect(0, 0, 512, 320); c.fillStyle = '#e9cf98'; c.font = `300 34px ${FONT}`; c.fillText('Juice bar', 28, 50);
    RECIPES.forEach(([n, what], i) => { c.font = `600 19px ${FONT}`; c.fillStyle = '#f2efe8'; c.fillText(n, 28, 96 + i * 46); c.font = `400 15px ${FONT}`; c.fillStyle = '#a7a39a'; c.fillText(what, 28, 116 + i * 46); });
    menu.tex.needsUpdate = true;
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.69), new THREE.MeshStandardMaterial({ map: menu.tex, roughness: 0.7 }));
    mm.position.set(-6.4, 2.5, -3.432); G.add(mm);
  }
  ctx.action('wellness-blender', {
    hover: () => `<b>Blender</b><div class="k">${blender.t >= 0 ? 'Blending…' : 'Click for a smoothie'}</div>`,
    click: () => {
      if (blender.t >= 0) return;
      blender.i = Math.floor(Math.random() * RECIPES.length); blender.t = 0;
      blender.mix.material.color.set(RECIPES[blender.i][2]); blender.mix.visible = true;
      sound.blend(BL.x, BL.z);
    },
  });

  // ----- the yoga studio -----
  // Oak floor behind glass on the west windows (the jacuzzi beyond its south wall): mats facing a big TV (click one to sit), bolsters and blocks,
  // a round mirror and a shelf of rolled mats on the east wall.
  {
    const matCols = ['#9caf88', '#c98f6e', '#b9b2a4', '#7e9a9a', '#c4a484', '#8f8aa8'];
    let i = 0;
    // Two rows facing the big TV on the south wall (a class on it), clear of the door.
    for (const x of [-17.6, -14.6, -11.6]) for (const z of [-7.3, -4.9]) {
      if (x === -11.6 && z === -4.9) continue;   // by the door
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI; G.add(g);
      const mk = kit(); mk.box(mat(matCols[i++ % matCols.length], { roughness: 0.95 }), 0.62, 0.012, 1.85, 0, 0.007, 0);
      if (i % 2) mk.cyl(M.taupe, 0.11, 0.11, 0.6, -0.15, 0.12, 0.95, 16, 0, Math.PI / 2);
      if (i % 3 === 0) mk.box(mat('#d7c7a3', { roughness: 0.9 }), 0.22, 0.1, 0.15, 0.2, 0.06, 0.95);
      mk.flush(g);
      const st = W.seat(g, 'Yoga mat', 0, 0.78); W.markSeat(g, st);
    }
    const mr = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), M.mirror); mr.position.set(-8.08, 1.6, -8.3); mr.rotation.y = -Math.PI / 2; G.add(mr);
    k.geo(M.brass, new THREE.TorusGeometry(0.76, 0.02, 8, 48).rotateY(Math.PI / 2).translate(-8.08, 1.6, -8.3));
    k.box(M.oak, 0.64, 0.035, 1.6, -8.39, 1.2, -6.2);   // deep enough for the rolls, which lie across it clear of the wall
    for (let j = 0; j < 6; j++) k.cyl(mat(matCols[j], { roughness: 0.95 }), 0.07, 0.07, 0.6, -8.4, 1.29, -6.85 + j * 0.26, 12, Math.PI / 2, 0, Math.PI / 2);
    // A singing bowl on a low stool.
    k.cyl(M.oak, 0.18, 0.18, 0.2, -19.0, 0.1, -9.05, 20); k.geo(M.brass, new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(-19.0, 0.32, -9.05));
    W.planter(-19.3, -4.3, 1.1); W.planter(-8.7, -9.0, 0.9);
  }

  // The studio's big TV, on its south wall over the mats (a yoga class on it to start with), and one in the lobby across
  // from reception (calm music): the office's own wall TVs (systems/tvs.js), streamed and heard only while you're here.
  W.hits.push(ctx.addTv('wellness-yoga', -14.6, 1.85, -9.4, 0, 2.8, false, { parent: G, floor: 46 }).scr.mesh);
  W.hits.push(ctx.addTv('wellness-lobby', 9.4, 1.8, -3.4, 0, 1.6, false, { parent: G, floor: 46 }).scr.mesh);

  // ----- the lounge -----
  // Three daybeds on the west windows with throws and cushions, low tables between, a floor lamp and a rug.
  {
    k.box(mat('#cfc3b0', { roughness: 1 }), 5.6, 0.01, 6.4, -16.6, 0.01, 0);
    for (const z of [-2.35, 0.0, 2.35]) {
      const g = new THREE.Group(); g.position.set(-16.4, 0, z); g.rotation.y = -Math.PI / 2; G.add(g);
      const dk = kit();
      dk.box(M.oak, 1.05, 0.28, 2.05, 0, 0.14, 0); dk.box(M.linen, 0.98, 0.16, 1.98, 0, 0.36, 0);
      const back = new THREE.BoxGeometry(0.98, 0.14, 0.75); back.translate(0, 0, -0.37); back.rotateX(0.6); back.translate(0, 0.44, -0.45); dk.geo(M.linen, back);
      dk.box(M.taupe, 0.98, 0.05, 0.6, 0, 0.46, 0.55);
      for (const s of [-1, 1]) dk.box(mat('#b5654a', { roughness: 1 }), 0.32, 0.26, 0.12, s * 0.25, 0.62, -0.62);
      dk.flush(g);
      const st = W.seat(g, 'Daybed', 0, 0.92); W.markSeat(g, st);
      solid(-16.4, z, 2.05, 1.05);
    }
    for (const z of [-1.17, 1.17]) { k.cyl(M.oak, 0.22, 0.22, 0.04, -15.6, 0.4, z, 20); k.cyl(M.black, 0.03, 0.03, 0.38, -15.6, 0.19, z, 8);
      k.cyl(glow('#ffd59a', 1.5), 0.02, 0.02, 0.05, -15.6, 0.45, z, 10); }
    k.cyl(M.black, 0.015, 0.015, 1.5, -12.0, 0.75, 2.9, 8); k.cyl(M.black, 0.15, 0.15, 0.02, -12.0, 0.01, 2.9, 16);
    lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.28, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#efe2c8', emissive: '#ffcf8a', emissiveIntensity: 0, side: THREE.DoubleSide, roughness: 0.9 }));
    lampShade.position.set(-12.0, 1.55, 2.9); G.add(lampShade); solid(-12.0, 2.9, 0.35, 0.35);
    W.planter(-19.3, 3.0, 1.2);
  }
  // ----- the infrared cabin -----
  // On the spa's north wall between the plunge and the lounge (x 11..14, z -6.3..-3.5; its walls in WALLS): cedar inside,
  // glass onto the spa with a cedar door like the sauna's (click it), a bench along the back wall facing out (click to
  // sit), carbon heater panels glowing a dull red; warm on you while you're in, the heaters humming and ticking.
  const IRC = { x0: 11, x1: 14, z0: -6.3, z1: -3.5 };
  const heatM = new THREE.MeshStandardMaterial({ color: '#2a1d18', emissive: '#ff4a1c', emissiveIntensity: 0.2, roughness: 0.7 });
  W.infrared = { x: 12.5, z: -4.4, inside: false };
  {
    const i0 = IRC.x0 + 0.06, i1 = IRC.x1 - 0.06, jb = IRC.z1 - 0.07, jf = IRC.z0 + 0.05, cx = (i0 + i1) / 2;
    cedarBox(i1 - i0, 3.2, 0.02, cx, 1.6, jb);   // lining the stone wall behind
    for (let x = i0 + 0.05; x < i1; x += 0.12) k.box(M.cedar, 0.09, 0.025, jb - jf - 0.04, x, 0.013, (jb + jf) / 2);   // duckboards
    // The bench: slats on a frame along the back wall, a slatted back rest.
    const bz = jb - 0.3;
    for (let q = 0; q < 5; q++) k.box(M.cedar, i1 - i0 - 0.1, 0.035, 0.08, cx, 0.45, bz + 0.2 - q * 0.1);
    for (const x of [i0 + 0.2, cx, i1 - 0.2]) k.box(M.cedar, 0.06, 0.43, 0.48, x, 0.215, bz);
    for (let q = 0; q < 4; q++) k.box(M.cedar, i1 - i0 - 0.1, 0.07, 0.025, cx, 0.62 + q * 0.12, jb - 0.04 - q * 0.012);
    solid(cx, bz, i1 - i0, 0.55);
    // Heaters: three over the bench, one on each side wall, a long one low under the bench.
    for (const x of [cx - 0.85, cx, cx + 0.85]) { k.box(heatM, 0.7, 0.95, 0.02, x, 1.6, jb - 0.02); k.box(M.black, 0.74, 0.99, 0.01, x, 1.6, jb - 0.012); }
    for (const [x, bx] of [[i0 + 0.02, i0 + 0.011], [i1 - 0.02, i1 - 0.011]]) { k.box(heatM, 0.02, 1.0, 0.7, x, 1.5, -4.85); k.box(M.black, 0.01, 1.04, 0.74, bx, 1.5, -4.85); }
    k.box(heatM, i1 - i0 - 0.4, 0.06, 0.02, cx, 0.12, bz - 0.2);
    k.box(glow('#ffb48a', 0.6), i1 - i0, 0.02, 0.03, cx, 3.0, jb - 0.03);   // a warm strip light up under the ceiling
    const g = new THREE.Group(); g.position.set(cx, 0, bz); g.rotation.y = Math.PI; G.add(g);   // facing out, south
    for (const lx of [-0.9, 0, 0.9]) { const st = W.seat(g, 'Infrared bench', lx, 1.12); W.markSeat(g, st); }
    W.hingedDoor({ name: 'Infrared door', hx: 13.8, hz: -6.3, r0: Math.PI, swing: -1, w: 0.8, m: M.cedar, win: [0.2, 0.6, 1.2, 1.75] });   // opens out
    W.plaque('INFRARED', 13.4, 2.45, -6.34, Math.PI);
  }
  k.flush(G);

  // ----- each frame -----
  W.fxs.push((dt, t) => {
    const p = ctx.player;
    // The sauna: cooling back toward 82 °C, the heat of a fresh löyly fading; inside it, a warm shimmer.
    sauna.temp += (82 - sauna.temp) * Math.min(1, dt * 0.02); sauna.hum += (12 - sauna.hum) * Math.min(1, dt * 0.03); sauna.heat = Math.max(0, sauna.heat - dt / 14);
    sauna.inside = inZone(p, SA.x0, SA.x1, SA.z0, SA.z1);
    // The infrared heaters cycling, a slow breath of glow; in the cabin, the warmth on you.
    heatM.emissiveIntensity = 0.2 + 0.05 * Math.sin(t * 0.4);
    W.infrared.inside = inZone(p, IRC.x0, IRC.x1, IRC.z0, IRC.z1);
    if (W.infrared.inside) {
      ctx.hemi.color.lerp(IR, 0.35);
      W.wantVeil = ['radial-gradient(ellipse at 50% 55%, rgba(255,120,60,0), rgba(255,80,40,.4))', 0.3];
    }
    sauna.hotM.emissiveIntensity = (0.5 + 1.6 * sauna.heat) * (0.85 + 0.15 * Math.sin(t * 3.7) * Math.sin(t * 1.3));
    if (sauna.burst > 0 && (sauna.burst -= dt) <= 0) sauna.again?.();
    if (sand.flip) {   // turning over: half a turn, then the full end's on top
      sand.flip = Math.min(1, sand.flip + dt / 0.8); sand.hg.rotation.z = Math.PI * sand.flip * sand.flip * (3 - 2 * sand.flip);
      if (sand.flip >= 1) { sand.flip = 0; sand.hg.rotation.z = 0; sand.k = 1 - sand.k; }
      sand.place();
    } else if (sand.k > 0) { sand.k = Math.max(0, sand.k - dt / 900); sand.place(); }
    if ((sauna.paintAt = (sauna.paintAt || 0) - dt) <= 0) { sauna.paintAt = 0.5; paintDial(); }
    if (sauna.inside) {
      const h = 0.35 + 0.65 * sauna.heat;
      camera.position.y += Math.sin(t * 2.3) * 0.004 * h; camera.rotation.z += Math.sin(t * 3.1) * 0.0025 * h;
      W.wantVeil = [`radial-gradient(ellipse at 50% 60%, rgba(255,170,90,.0), rgba(190,90,30,.${Math.round(30 + 25 * h)}))`, 0.25 + 0.3 * h];
      if (Math.random() < dt * 0.5) puff(stove.x + (Math.random() - 0.5) * 0.3, 0.9, stove.z, { vy: 0.25, life: 3, size: 0.25, grow: 0.25, a: 0.18, ceil: 2.35 });
      // The light in here: low and amber.
      ctx.hemi.color.lerp(AMBER, 0.5); ctx.hemi.intensity *= 0.75;
      // The benches creak now and then.
      if ((sauna.creakAt -= dt) <= 0) { sauna.creakAt = 5 + Math.random() * 12; sound.creak(SA.x0 + 0.6, 0.9, -12.95 + (Math.random() - 0.5) * 3); }
    }
    // The steam room: the generator breathes out every 20-30 s; inside, steam rolls round you and the glass fogs over.
    steamRoom.inside = inZone(p, ST.x0, ST.x1, ST.z0, ST.z1);
    steamRoom.next -= dt;
    if (steamRoom.next <= 0) { steamRoom.puff = 1; steamRoom.next = 20 + Math.random() * 10; if (Math.hypot(p.x - nozzle.x, p.z - nozzle.z) < 10) sound.pulse(nozzle.x, nozzle.z); }
    steamRoom.puff = Math.max(0, steamRoom.puff - dt / 7);
    const near = Math.hypot(p.x - 13.2, p.z + 12.75) < 9;
    if (near && Math.random() < dt * (2.5 + 8 * steamRoom.puff)) {
      const fromNozzle = Math.random() < 0.5 + 0.4 * steamRoom.puff;
      puff(fromNozzle ? nozzle.x - 0.1 : ST.x0 + 0.4 + Math.random() * (ST.x1 - ST.x0 - 0.8), fromNozzle ? 0.35 : 0.3 + Math.random() * 1.5,
        fromNozzle ? nozzle.z + (Math.random() - 0.5) * 0.3 : ST.z0 + 0.4 + Math.random() * (ST.z1 - ST.z0 - 0.8),
        { vy: 0.12 + Math.random() * 0.1, life: 6 + Math.random() * 4, size: 0.6, grow: 0.4, a: 0.32, ceil: 2.45 });
    }
    steamRoom.fog = clamp(steamRoom.fog + (steamRoom.inside ? dt / 35 : -dt / 120), 0.35, 1);
    M.fog.opacity = 0.45 + 0.5 * steamRoom.fog; M.fog.roughness = 0.6 + 0.4 * steamRoom.fog;
    // How thick the air is: up with each burst, settling back while the door's shut, thinning while it's open.
    const open = steamDoor.k > 0.05;
    steamRoom.dense = clamp(steamRoom.dense + dt * (0.12 * steamRoom.puff + (open ? -0.08 : 0.02 * (0.8 - steamRoom.dense))), 0.35, 1);
    // Opening the door lets a billow roll out into the corridor, and a little more while it stands open.
    if (open && !steamRoom.open) for (let i = 0; i < 18; i++) steamOut(0.5 + Math.random() * 0.5, 0.9 * steamRoom.dense);
    else if (open && Math.random() < dt * 5 * steamRoom.dense) steamOut(0.3 + Math.random() * 0.25, 0.5 * steamRoom.dense);
    steamRoom.open = open;
    if (steamRoom.inside) {   // the further in, the less you see
      const deep = clamp((ST.z1 - p.z) / (ST.z1 - ST.z0), 0, 1);
      W.wantVeil = ['radial-gradient(ellipse at 50% 45%, rgba(232,238,238,.55), rgba(222,230,230,.97))', 0.2 + 0.5 * steamRoom.dense * (0.45 + 0.55 * deep)];
    }
    if (near && (condAt -= dt) <= 0) { paintCond(0.15 - condAt); condAt = 0.15; }
    bankFx(t, near ? 0.55 + 0.45 * steamRoom.dense : 0, Math.hypot(p.x - 17.8, p.z + 12.75) < 8 ? 0.45 + 0.55 * sauna.heat : 0);
    steamFx(dt);
    // Lockers swinging, the blender, the lamp.
    lockers.forEach((L, i) => { if (L.k !== L.to) { L.k = L.to > L.k ? Math.min(1, L.k + dt / 0.6) : Math.max(0, L.k - dt / 0.5); placeLocker(i); } });
    if (blender.t >= 0) {
      blender.t += dt;
      const on = blender.t > 0.3 && blender.t < 3.6;
      blender.mix.rotation.y += dt * (on ? 40 : 2); blender.mix.scale.set(1, on ? 1.4 + Math.sin(t * 40) * 0.15 : 1, 1); blender.mix.position.y = on ? 1.21 : 1.19;
      if (blender.t > 4.2) {
        const [name, what, col] = RECIPES[blender.i], gl = blender.glasses[blender.served++ % 4];
        gl.juice.material.color.set(col); gl.g.visible = true; blender.mix.visible = false; blender.t = -1;
        toast(`<b>${name}</b> · ${what} · on the bar for you`);
      }
    }
    lampShade.material.emissiveIntensity = 0.3 + 0.9 * W.lampK;
    // Showers left running turn themselves off after a minute.
    for (const s of showers) if (s.on && (s.at += dt) > 60) { s.on = false; s.rain.visible = false; s.rain.material.uniforms.on.value = 0; if (!showers.some((q) => q.on)) sound.shower(false); }
  });
  function steamOut(v, a) {   // a puff from the steam room's doorway out into the corridor (north), slowing as it spreads
    puff(12.85 + Math.random() * 0.7, 0.3 + Math.random() * 1.9, -10.7, { vx: (Math.random() - 0.5) * 0.35, vz: v, vy: 0.08, life: 4 + Math.random() * 2.5,
      size: 0.7, grow: 0.6, a, ceil: 3.1, drag: 0.3 });
  }
  W.leaves.push(() => {
    for (const s of showers) { s.on = false; s.rain.visible = false; s.rain.material.uniforms.on.value = 0; }
    sound.shower(false); puffs.length = 0; steam.count = 0; fogBank.count = 0;
  });
}
