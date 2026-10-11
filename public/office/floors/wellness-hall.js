// The wellness floor's hall past the changing rooms (floors/wellness.js), round the float room (wellness-retreat.js):
// on its west side a quiet room behind a fluted door (five loungers on a rug facing a fire set in a stone chimney
// breast, blankets, candles); beside it a treatment room behind an oak door (a massage table to lie on, oils, warm
// stones); and along the south glass, experience showers in tiled bays opening onto the way
// to the jacuzzi: tropical rain, a cold mist, a bucket drench and an ice fountain (click each).

import * as THREE from 'three';
import { mat } from '../util.js';

export function installHall(ctx, W) {
  const { G, M, kit, solid, R, uvWorld } = W, { toast } = ctx;
  const sound = W.sound;
  const k = kit();
  const glow = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.8 });
  const panel = (m, w, h, d, x, y, z, s = 1) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); k.geo(m, uvWorld(g, s, 'wall')); };
  const inZone = (p, x0, x1, z0, z1) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1;

  // ----- the quiet room -----
  // x -8..-4.6, z -11.2..-3.5: the loungers' heads to the west wall, an aisle down the east side from the door to the fire.
  const QR = { x0: -8, x1: -4.6, z0: -11.2, z1: -3.5 };
  {
    k.box(mat('#8c7b69', { roughness: 1 }), 2.296, 0.01, 7.2, -6.748, 0.006, -7.4);   // a wool rug under the loungers
    const LZ = [-10.5, -8.95, -7.4, -5.85, -4.3];
    for (const z of LZ) {
      const g = new THREE.Group(); g.position.set(-6.95, 0, z); g.rotation.y = Math.PI / 2; G.add(g);   // head to the west wall
      const lk = kit();
      lk.box(M.oak, 0.8, 0.3, 1.9, 0, 0.15, 0); lk.box(M.linen, 0.72, 0.1, 1.25, 0, 0.35, 0.3);
      const back = new THREE.BoxGeometry(0.72, 0.1, 0.7); back.translate(0, 0, -0.35); back.rotateX(0.65); back.translate(0, 0.35, -0.3); lk.geo(M.linen, back);
      lk.box(M.taupe, 0.74, 0.05, 0.42, 0, 0.42, 0.68);   // a folded throw at the foot
      lk.box(M.towel, 0.4, 0.1, 0.22, 0, 0.62, -0.62, 0, -0.6);   // a pillow on the back
      lk.flush(g);
      const st = W.seat(g, 'Quiet room lounger', 0, 0.95); W.markSeat(g, st);
      solid(-6.95, z, 1.95, 0.85);
    }
    // Low tables between their heads, each with a candle in a glass.
    for (let i = 0; i < LZ.length - 1; i++) {
      const z = (LZ[i] + LZ[i + 1]) / 2;
      k.cyl(M.oak, 0.2, 0.2, 0.04, -7.62, 0.46, z, 20); k.cyl(M.black, 0.025, 0.025, 0.44, -7.62, 0.22, z, 8);
      k.cyl(M.glass, 0.045, 0.045, 0.09, -7.62, 0.525, z, 12); k.cyl(glow('#ffd08a', 1.6), 0.012, 0.012, 0.03, -7.62, 0.52, z, 8);
      solid(-7.62, z, 0.4, 0.4);
    }
    // The chimney breast on the east wall, a long fire set low in it behind glass, a brass surround.
    const BX0 = -5.01, BZ0 = -6.5, BZ1 = -4.3;
    panel(M.stoneWall, QR.x1 - 0.06 - BX0, 3.296, BZ1 - BZ0, (BX0 + QR.x1 - 0.06) / 2, 1.648, (BZ0 + BZ1) / 2, 2.4);   // (up to 4 mm under the ceiling, off the beams' tops)
    k.box(M.black, 0.02, 0.5, 1.7, BX0 - 0.005, 0.72, (BZ0 + BZ1) / 2);
    for (const [w, h, y, dz] of [[1.78, 0.04, 0.99, 0], [1.78, 0.04, 0.45, 0]]) k.box(M.brass, 0.03, h, w, BX0 - 0.012, y, (BZ0 + BZ1) / 2 + dz);
    for (const s of [-1, 1]) k.box(M.brass, 0.03, 0.58, 0.04, BX0 - 0.012, 0.72, (BZ0 + BZ1) / 2 + s * 0.87);
    k.box(M.stone, 0.45, 0.06, BZ1 - BZ0 + 0.2, BX0 - 0.2, 0.03, (BZ0 + BZ1) / 2);   // the hearth
    k.box(mat('#3a3330', { roughness: 0.9 }), 0.012, 0.08, 1.6, BX0 - 0.024, 0.52, (BZ0 + BZ1) / 2);   // the stones the flames come up through
    solid((BX0 + QR.x1) / 2 - 0.1, (BZ0 + BZ1) / 2, QR.x1 - BX0 + 0.25, BZ1 - BZ0);
    const fireM = new THREE.ShaderMaterial({
      uniforms: { time: W.U.time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = vUv;
          float q = n(vec2(p.x * 16.0, p.y * 2.5 - time * 1.9)) * 0.65 + n(vec2(p.x * 37.0, p.y * 5.0 - time * 3.3)) * 0.35;
          float f = smoothstep(0.05, 0.75, (1.0 - p.y) * (0.55 + q) - 0.32) * smoothstep(0.0, 0.08, p.x) * smoothstep(1.0, 0.92, p.x);
          vec3 c = mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.82, 0.45), f * f);
          gl_FragColor = vec4(c * f * 1.5, f);
        }` });
    const fire = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), fireM);
    fire.position.set(BX0 - 0.02, 0.76, (BZ0 + BZ1) / 2); fire.rotation.y = -Math.PI / 2; fire.renderOrder = 2; fire.layers.set(1); G.add(fire);
    k.box(M.glass, 0.01, 0.5, 1.7, BX0 - 0.03, 0.72, (BZ0 + BZ1) / 2);
    // Blankets on oak shelves at the aisle's south end; a plant in the corner past the fire.
    k.box(M.oak, 0.9, 1.6, 0.04, -5.2, 0.8, QR.z0 + 0.09);
    for (let y = 0.3; y < 1.6; y += 0.42) {
      k.box(M.oak, 0.9, 0.03, 0.34, -5.2, y, QR.z0 + 0.25);
      for (let j = 0; j < 3; j++) k.box(j % 2 ? M.taupe : M.linen, 0.78, 0.07, 0.3, -5.2 + (R() - 0.5) * 0.04, y + 0.05 + j * 0.075, QR.z0 + 0.26);
    }
    solid(-5.2, QR.z0 + 0.22, 0.95, 0.4);
    W.planter(-5.05, -3.97, 0.8);
    W.plaque('QUIET', -4.53, 2.45, -7.8, Math.PI / 2);
  }

  // ----- the treatment room -----
  // x -4.6..-1.6, z -11.2..-8.6, behind an oak door off the hall: a massage table under a low warm pendant (click to lie
  // on it), shelves of oils and rolled towels on the back wall, a trolley with a bowl of warm stones, a rug.
  {
    const TX = -2.9, TZ = -10.15;
    k.box(mat('#a3917c', { roughness: 1 }), 2.6, 0.01, 2.2, -3.1, 0.006, -9.9);
    // The table: a padded top on an oak frame, a face cradle at its west end, a towel folded at its foot.
    const g = new THREE.Group(); g.position.set(TX, 0, TZ); G.add(g);
    const tk = kit();
    tk.box(M.oak, 1.8, 0.08, 0.66, 0, 0.62, 0); tk.box(M.taupe, 1.84, 0.1, 0.7, 0, 0.71, 0);
    for (const [dx, dz] of [[-0.8, -0.27], [-0.8, 0.27], [0.8, -0.27], [0.8, 0.27]]) tk.box(M.oak, 0.06, 0.6, 0.06, dx, 0.3, dz);
    tk.box(M.oak, 1.6, 0.04, 0.04, 0, 0.18, 0.27); tk.box(M.oak, 1.6, 0.04, 0.04, 0, 0.18, -0.27);
    tk.box(M.taupe, 0.26, 0.08, 0.32, -1.07, 0.7, 0); tk.box(M.black, 0.1, 0.03, 0.2, -0.96, 0.62, 0);
    tk.box(M.towel, 0.4, 0.06, 0.6, 0.62, 0.79, 0);
    tk.flush(g);
    const st = W.seat(g, 'Treatment table', 0, 1.15); W.markSeat(g, st);
    solid(TX, TZ, 2.1, 0.75);
    // Shelves on the back wall: amber oil bottles, rolled towels, a candle.
    for (const y of [1.1, 1.5]) k.box(M.oak, 1.6, 0.035, 0.24, -3.1, y, -11.02);
    for (let i = 0; i < 6; i++) { const x = -3.75 + i * 0.13; k.cyl(mat('#8a4a16', { roughness: 0.2, metalness: 0.1 }), 0.03, 0.03, 0.13, x, 1.185, -11.0, 10); k.cyl(M.black, 0.012, 0.012, 0.04, x, 1.27, -11.0, 6); }
    for (let i = 0; i < 4; i++) k.cyl(M.towel, 0.055, 0.055, 0.22, -2.75 + i * 0.12, 1.175, -11.0, 10, Math.PI / 2);
    for (let i = 0; i < 5; i++) k.cyl(M.towel, 0.055, 0.055, 0.22, -3.7 + i * 0.12, 1.575, -11.0, 10, Math.PI / 2);
    k.cyl(M.glass, 0.05, 0.05, 0.1, -2.6, 1.57, -11.0, 12); k.cyl(glow('#ffd08a', 1.6), 0.012, 0.012, 0.03, -2.6, 1.56, -11.0, 8);
    // The trolley: two oak trays on chrome posts, a black bowl of warm stones on top.
    k.box(M.oak, 0.5, 0.03, 0.36, -4.15, 0.8, -10.55); k.box(M.oak, 0.5, 0.03, 0.36, -4.15, 0.3, -10.55);
    for (const [dx, dz] of [[-0.22, -0.15], [-0.22, 0.15], [0.22, -0.15], [0.22, 0.15]]) k.cyl(M.chrome, 0.012, 0.012, 0.8, -4.15 + dx, 0.4, -10.55 + dz, 6);
    k.cyl(M.dark, 0.14, 0.09, 0.07, -4.15, 0.85, -10.55, 18);
    for (let i = 0; i < 7; i++) k.geo(mat('#2e2c2a', { roughness: 0.35 }), new THREE.SphereGeometry(0.04, 10, 6).scale(1.3, 0.55, 1).translate(-4.15 + (R() - 0.5) * 0.14, 0.89, -10.55 + (R() - 0.5) * 0.14));
    solid(-4.15, -10.55, 0.55, 0.4);
    // A low pendant over the table, a sconce by the door.
    k.cyl(M.black, 0.006, 0.006, 1.6, TX, 2.5, TZ, 6); k.cyl(glow('#ffcf96', 0.9), 0.16, 0.2, 0.14, TX, 1.65, TZ, 20);
    k.box(glow('#ffcf96', 0.7), 0.05, 0.3, 0.1, -4.51, 1.7, -9.2);
    W.planter(-4.22, -9.0, 0.6);
    W.hingedDoor({ name: 'Treatment room door', hx: -3.4, hz: -8.6, swing: 1, w: 0.9 });
    W.plaque('TREATMENT', -3.95, 1.5, -8.53, 0);
  }

  // ----- the experience showers -----
  // Four tiled bays on the south glass (x -8..0, partitions at -6, -4, -2 in WALLS), slate floor and a linear drain.
  const SZ = -14.84, bays = [];
  {
    panel(W.paleTileM, 7.88, 3.296, 0.04, -4, 1.648, SZ);
    k.box(mat('#3b3f42', { roughness: 0.55 }), 7.88, 0.02, 1.8, -4, 0.012, (SZ + -13.05) / 2);
    k.box(M.black, 7.9, 0.0185, 0.08, -4, 0.01525, -13.2);   // (its foot 4 mm above the slate's underside, its top 2.5 mm proud)
    for (const [name, x] of [['RAIN', -7], ['MIST', -5], ['DRENCH', -3], ['ICE', -1]]) W.plaque(name, x, 2.55, SZ + 0.03, 0);
    const rain = (x, z, r, warm) => {
      const m = W.rainM.clone(); m.uniforms.time = W.U.time;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, 2.2, 12, 1, true), m);
      mesh.position.set(x, 2.12, z); mesh.visible = false; mesh.layers.set(1); G.add(mesh);
      return mesh;
    };
    // Tropical rain: a big square head and a warm ring of light round it.
    const ringM = glow('#ffb070', 0);
    k.box(M.black, 0.64, 0.03, 0.64, -7, 3.25, -14.1); k.box(M.chrome, 0.6, 0.01, 0.6, -7, 3.23, -14.1);
    for (const [w, d, dx, dz] of [[0.7, 0.03, 0, -0.35], [0.7, 0.03, 0, 0.35], [0.03, 0.7, -0.35, 0], [0.03, 0.7, 0.35, 0]]) k.box(ringM, w, 0.02, d, -7 + dx, 3.27, -14.1 + dz);
    bays.push({ name: 'Tropical rain', x: -7, kind: 'rain', rain: rain(-7, -14.1, 0.3), lightM: ringM, on: false, verb: 'Warm, heavy rain' });
    // Cold mist: nozzles on the back wall and over head, a cool blue light strip.
    const blueM = glow('#7fc8ff', 0);
    for (const [y, dx] of [[1.2, -0.4], [1.2, 0.4], [1.9, -0.4], [1.9, 0.4]]) k.cyl(M.chrome, 0.02, 0.025, 0.05, -5 + dx, y, SZ + 0.045, 10, Math.PI / 2);
    k.box(blueM, 1.6, 0.03, 0.02, -5, 2.3, SZ + 0.03); k.cyl(M.chrome, 0.12, 0.12, 0.03, -5, 3.27, -14.1, 16);
    bays.push({ name: 'Cold mist', x: -5, kind: 'mist', lightM: blueM, on: false, t: 0, verb: 'A cold mist' });
    // The bucket drench: a cedar bucket on a chrome arm off the back wall, a chain with a brass pull to tip it.
    const pivot = new THREE.Group(); pivot.position.set(-3, 2.55, -14.35); G.add(pivot);
    const bk = kit();
    bk.cyl(M.cedar, 0.24, 0.2, 0.32, 0, -0.1, 0, 18); bk.cyl(M.chrome, 0.245, 0.245, 0.025, 0, 0.05, 0, 18); bk.cyl(M.chrome, 0.205, 0.205, 0.025, 0, -0.24, 0, 18);
    bk.cyl(mat('#5e8fa0', { roughness: 0.15 }), 0.22, 0.22, 0.01, 0, 0.0, 0, 18);
    bk.flush(pivot);
    k.box(M.chrome, 0.04, 0.04, 0.5, -3, 2.55, -14.6); k.box(M.chrome, 0.56, 0.04, 0.04, -3, 2.55, -14.35);
    k.cyl(M.chrome, 0.006, 0.006, 0.9, -2.72, 2.1, -14.35, 6); k.box(M.brass, 0.03, 0.14, 0.03, -2.72, 1.6, -14.35);
    bays.push({ name: 'Bucket drench', x: -3, kind: 'drench', pivot, rain: rain(-3, -14.2, 0.24), t: -1, verb: 'A bucket of ice-cold water' });
    // The ice fountain: a travertine basin on a plinth, heaped with crushed ice, a chrome scoop.
    k.box(M.stoneWall, 1.1, 0.85, 0.55, -1, 0.425, SZ + 0.32); k.box(M.stone, 1.2, 0.05, 0.62, -1, 0.875, SZ + 0.32);
    const ice = new THREE.SphereGeometry(0.42, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), ip = ice.attributes.position;
    for (let i = 0; i < ip.count; i++) { const f = 0.9 + R() * 0.2; ip.setXYZ(i, ip.getX(i) * f, ip.getY(i) * 0.38 * f, ip.getZ(i) * 0.6 * f); }
    ice.computeVertexNormals(); ice.translate(-1, 0.9, SZ + 0.32);
    k.geo(new THREE.MeshStandardMaterial({ color: '#eef7fb', emissive: '#bfe4f5', emissiveIntensity: 0.15, roughness: 0.18, metalness: 0.05, flatShading: true }), ice);
    k.box(M.chrome, 0.1, 0.02, 0.16, -0.55, 0.92, SZ + 0.5); k.box(M.chrome, 0.02, 0.02, 0.14, -0.55, 0.93, SZ + 0.65);
    k.cyl(M.chrome, 0.02, 0.02, 0.5, -1, 1.55, SZ + 0.07, 10); k.cyl(M.chrome, 0.02, 0.02, 0.2, -1, 1.79, SZ + 0.15, 10, Math.PI / 2);
    solid(-1, SZ + 0.32, 1.2, 0.66);
    bays.push({ name: 'Ice fountain', x: -1, kind: 'ice', t: -1, verb: 'A handful of crushed ice' });
    // Towels over a brass rail across the way, on the quiet room's wall: each hangs both sides of it, one side longer.
    k.box(M.brass, 2.2, 0.025, 0.025, -6.3, 1.45, -11.31);
    for (const s of [-1, 1]) k.box(M.brass, 0.03, 0.03, 0.06, -6.3 + s * 1.05, 1.45, -11.29);
    for (const x of [-7.05, -6.55, -6.05, -5.55]) {
      k.box(M.towel, 0.4, 0.62, 0.012, x, 1.13, -11.29); k.box(M.towel, 0.4, 0.5, 0.012, x, 1.19, -11.335);
      k.cyl(M.towel, 0.024, 0.024, 0.4, x, 1.45, -11.31, 10, 0, Math.PI / 2);
    }
    for (const b of bays) {
      const hit = ctx.hitBox(G, 1.6, 3.0, 1.4, b.x, 1.5, -14.1, { action: 'wellness-xshower', reach: 3 });
      hit.userData.info = b; W.hits.push(hit);
    }
  }
  const anyOn = () => bays.find((b) => b.on);
  const set = (b, on) => {
    b.on = on;
    if (b.rain) { b.rain.visible = on; b.rain.material.uniforms.on.value = on ? 1 : 0; }
    if (b.lightM) b.lightM.emissiveIntensity = on ? 1.6 : 0;
    const a = anyOn(); sound.shower(!!a, a?.x ?? b.x, -14.1);
  };
  ctx.action('wellness-xshower', {
    hover: (h) => { const b = h.info; return `<b>${b.name}</b><div class="k">${b.kind === 'rain' || b.kind === 'mist' ? `Click to turn it ${b.on ? 'off' : 'on'}` : b.kind === 'drench' ? 'Pull the chain' : 'Click for a handful'}</div>`; },
    click: (h) => {
      const b = h.info;
      if (b.kind === 'rain' || b.kind === 'mist') { set(b, !b.on); if (b.on) toast(`${b.verb} · click again to turn it off`); return; }
      if (b.t >= 0) return;
      b.t = 0;
      if (b.kind === 'drench') { sound.creak(b.x, 2.5, -14.35); toast(`${b.verb} · bracing`); }
      else { sound.thud(b.x, -14.5, 0.12); toast(`${b.verb} · rubbed on your arms, it stings, then glows`); }
    },
  });
  W.leaves.push(() => { for (const b of bays) { if (b.on) set(b, false); b.t = -1; if (b.pivot) b.pivot.rotation.x = 0; } });
  k.flush(G);

  // ----- each frame -----
  let mistT = 0;
  W.fxs.push((dt, t) => {
    const p = ctx.player;
    for (const b of bays) {
      if (b.kind === 'mist' && b.on) {
        mistT -= dt;
        if (mistT <= 0) { mistT = 0.09; W.puff(b.x + (Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.6, -14.4 + Math.random() * 0.8, { vy: -0.06, vx: (Math.random() - 0.5) * 0.2, vz: 0.12, life: 3.2, size: 0.5, grow: 0.4, a: 0.5, drag: 0.4 }); }
        if (inZone(p, b.x - 1, b.x + 1, -14.9, -13.1)) W.wantVeil = ['radial-gradient(ellipse at 50% 50%, rgba(200,230,255,.1), rgba(170,210,240,.5))', 0.35];
      }
      if (b.kind === 'drench' && b.t >= 0) {
        b.t += dt;
        // Tip over in half a second, pour, hold, and swing back.
        const tip = b.t < 0.5 ? b.t / 0.5 : b.t < 1.3 ? 1 : Math.max(0, 1 - (b.t - 1.3) / 1.2);
        b.pivot.rotation.x = 1.9 * tip * tip * (3 - 2 * tip);
        const pour = b.t > 0.35 && b.t < 1.5;
        if (pour !== b.rain.visible) {
          b.rain.visible = pour; b.rain.material.uniforms.on.value = pour ? 1.6 : 0;
          if (pour) sound.splash(b.x, -14.2, true);
        }
        if (inZone(p, b.x - 1, b.x + 1, -14.9, -13.1) && b.t < 2.2) W.wantVeil = ['radial-gradient(ellipse at 50% 40%, rgba(170,225,240,.0), rgba(120,190,220,.55))', 0.5 * Math.max(0, 1 - Math.abs(b.t - 0.9) / 1.3)];
        if (b.t > 2.6) { b.t = -1; b.pivot.rotation.x = 0; }
      }
      if (b.kind === 'ice' && b.t >= 0) {
        b.t += dt;
        W.wantVeil = ['radial-gradient(ellipse at 50% 50%, rgba(220,240,255,0), rgba(190,225,250,.45))', 0.35 * Math.max(0, 1 - b.t / 2)];
        if (b.t > 2) b.t = -1;
      }
    }
  });
}
