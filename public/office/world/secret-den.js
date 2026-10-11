// The den: the room at the foot of the ladder behind my office's bookcase (world/secret-room.js), in the dead storey
// under 48. Walnut panelling, a beamed ceiling, a worn rug on dark boards. Against the west wall a desk with a green
// banker's lamp (click it) and, over it, four little monitors showing the office upstairs through its security cameras
// (systems/cctv.js `into`; click for others); on the south wall a fireplace, lit (click to put it out or light it): a
// carved stone surround, a clock, candlesticks and a photo on the mantel, logs on a grate with flames (a few layered
// planes of a cheap noise shader), glowing embers and the odd spark, a crackle, and its flicker on the room (one of the
// lamp lights secret-room.js borrows; no shadows); a fire screen and a set of fire irons. By it, a leather wingback
// turned to the fire (sit in it), a side table and a reading lamp; a cabinet of whisky on the east wall (click to pour;
// again to drink); on the north wall, beside the ladder, a record player on a sideboard (click to play), an old safe in
// the corner (click: the dial, then the door), and the lever that shuts the bookcase upstairs. Built the first time the
// bookcase opens, merged by material; its fx runs only while it's shown, and the fire only moves while you're below.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { artTexture, damp, ease, makeCanvas, rng, rugTexture, woodTexture } from '../util.js';

// A geometry posed (rotated x, y, z then moved) and painted one colour (a vertex colour), for merge().
export function part(g, color, x, y, z, rx = 0, ry = 0, rz = 0) {
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// Parts as one mesh (one draw); it takes shadows but casts none (nothing in here throws one).
export function merge(parts, material) {
  const m = new THREE.Mesh(mergeGeometries(parts), material);
  m.receiveShadow = true;
  return m;
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function buildDen(ctx, api) {
  const { DY, CEIL, HOLE, DEN } = api, { world, dash } = ctx;
  const G = new THREE.Group(); G.visible = false; world.add(G);
  const Y = (y) => DY + y, H = CEIL - DY, R = rng(4848);
  const colliders = [], solid = (x0, x1, z0, z1) => colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  const vc = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, ...o });
  const B = (w, h, d, c, x, y, z, ry = 0) => part(new THREE.BoxGeometry(w, h, d), c, x, Y(y), z, 0, ry);
  const C = (rt, rb, h, c, x, y, z, seg = 16, rx = 0, rz = 0) => part(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, Y(y), z, rx, 0, rz);
  const add = (m, o = {}) => { Object.assign(m.userData, o); G.add(m); return m; };

  // ----- the room -----
  // Walls: walnut panelling, a dado of short raised panels under tall ones, a rail between, a cornice: one 1.2 m bay
  // repeated along each wall, facing in (seen from outside they aren't there; from the sun they cast).
  const panel = (() => {
    const t = makeCanvas(256, 556), c = t.ctx, W = 256, Hp = 556, px = Hp / H;   // 1.2 m by the room's height
    c.fillStyle = '#4b2d1b'; c.fillRect(0, 0, W, Hp);
    for (let i = 0; i < 500; i++) { c.strokeStyle = `rgba(${R() < 0.5 ? '25,12,5' : '120,72,40'},${0.06 + R() * 0.1})`; const x = R() * W; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 4, Hp * 0.3, x - 4, Hp * 0.6, x + R() * 6 - 3, Hp); c.stroke(); }
    const raised = (x0, y0, x1, y1) => {
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.fillStyle = 'rgba(255,214,170,.14)'; c.fillRect(x0, y0, x1 - x0, 3); c.fillRect(x0, y0, 3, y1 - y0);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x0, y1 - 3, x1 - x0, 3); c.fillRect(x1 - 3, y0, 3, y1 - y0);
      c.fillStyle = 'rgba(110,64,34,.25)'; c.fillRect(x0 + 14, y0 + 14, x1 - x0 - 28, y1 - y0 - 28);
    };
    const yOf = (m) => Hp - m * px;
    raised(18, yOf(0.9), W - 18, yOf(0.18));
    raised(18, yOf(2.3), W - 18, yOf(1.08));
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, yOf(0.98), W, 4); c.fillStyle = 'rgba(255,214,170,.18)'; c.fillRect(0, yOf(1.0), W, 4);   // the dado rail
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, yOf(2.45)); c.fillRect(0, 0, 3, Hp);   // the cornice's shadow, the joint between bays
    t.tex.wrapS = THREE.RepeatWrapping; t.tex.needsUpdate = true;
    return t.tex;
  })();
  // (hole: [u0, u1, v0, v1], along the wall from its middle and up from the floor: an opening, the panelling's pattern unbroken round it)
  const wall = (len, x, z, ry, hole) => {
    const tex = panel.clone(); tex.repeat.set(len / 1.2, 1); tex.needsUpdate = true;
    let g = new THREE.PlaneGeometry(len, H);
    if (hole) {
      const v2 = (a) => a.map(([u, v]) => new THREE.Vector2(u, v)), sh = new THREE.Shape(v2([[-len / 2, -H / 2], [len / 2, -H / 2], [len / 2, H / 2], [-len / 2, H / 2]]));
      const [u0, u1, v0, v1] = hole;
      sh.holes.push(new THREE.Path(v2([[u0, v0 - H / 2], [u0, v1 - H / 2], [u1, v1 - H / 2], [u1, v0 - H / 2]])));
      g = new THREE.ShapeGeometry(sh);
      const pa = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) / len + 0.5, pa.getY(i) / H + 0.5);
    }
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    m.position.set(x, Y(H / 2), z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true;
    return add(m);
  };
  const W = DEN.x1 - DEN.x0, D = DEN.z1 - DEN.z0, cx = (DEN.x0 + DEN.x1) / 2, cz = (DEN.z0 + DEN.z1) / 2;
  const VT = api.vent;   // the duct's vent, low in the east wall (world/secret-duct.js)
  wall(W, cx, DEN.z0, 0); wall(W, cx, DEN.z1, Math.PI); wall(D, DEN.x0, cz, Math.PI / 2); wall(D, DEN.x1, cz, -Math.PI / 2, [VT.z0 - cz, VT.z1 - cz, VT.y0, VT.y1]);
  {
    const tex = woodTexture(); tex.repeat.set(W / 3, D / 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tex, color: '#5e3c26', roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, DY, cz); floor.receiveShadow = true; add(floor);
    const rugM = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.0), new THREE.MeshStandardMaterial({ map: rugTexture('#6a2a22', '#c9a46a', 47), roughness: 1 }));
    rugM.rotation.x = -Math.PI / 2; rugM.position.set(9.0, Y(0.005), -11.5); rugM.receiveShadow = true; add(rugM);
  }
  // The ceiling: dark boards with the shaft's opening, two beams clear of it. Faces down.
  {
    const quads = [[DEN.x0, DEN.x1, HOLE.z1, DEN.z1], [DEN.x0, HOLE.x0, DEN.z0, HOLE.z1], [HOLE.x1, DEN.x1, DEN.z0, HOLE.z1]];
    const geos = quads.map(([x0, x1, z0, z1]) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(Math.PI / 2); g.translate((x0 + x1) / 2, CEIL, (z0 + z1) / 2); return g; });
    const ceil = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: '#2e231c', roughness: 0.9 }));
    ceil.castShadow = ceil.receiveShadow = true; add(ceil);
  }
  // Mouldings and beams: skirting, the cornice, the beams; the shaft's opening trimmed.
  const trim = [];
  for (const [w, d, x, z] of [[W, 0.03, cx, DEN.z0 + 0.015], [W, 0.03, cx, DEN.z1 - 0.015], [0.03, D, DEN.x0 + 0.015, cz], [0.03, D, DEN.x1 - 0.015, cz]]) {
    const o = d < 0.1 ? 0 : 0.003;   // (the runs along x and along z meet at the corners: never in one plane)
    trim.push(B(w, 0.12 - o, d * 2, '#3a2414', x, H - 0.06 - o / 2, z));
    if (x !== DEN.x1 - 0.015) { trim.push(B(w, 0.16 - o, d, '#2a180d', x, 0.08 - o / 2, z)); continue; }
    for (const [za, zb] of [[DEN.z0, VT.z0 - 0.07], [VT.z1 + 0.07, DEN.z1]]) trim.push(B(w, 0.16 - o, zb - za, '#2a180d', x, 0.08 - o / 2, (za + zb) / 2));   // (round the vent's frame)
  }
  for (const x of [6.55, 10.6]) trim.push(B(0.18, 0.2, D, '#2a1a10', x, H - 0.1, cz));
  for (const [w, d, x, z] of [[HOLE.x1 - HOLE.x0 + 0.1, 0.05, (HOLE.x0 + HOLE.x1) / 2, HOLE.z1 + 0.025], [0.05, HOLE.z1 - HOLE.z0, HOLE.x0 - 0.025, (HOLE.z0 + HOLE.z1) / 2],
    [0.05, HOLE.z1 - HOLE.z0, HOLE.x1 + 0.025, (HOLE.z0 + HOLE.z1) / 2]]) trim.push(B(w, 0.08, d, '#2a1a10', x, H - 0.04, z));
  add(merge(trim, vc({ roughness: 0.6 })));
  for (const [x0, x1, z0, z1] of [[DEN.x0 - 1, DEN.x0, DEN.z0 - 1, DEN.z1 + 1], [DEN.x1, DEN.x1 + 1, DEN.z0 - 1, DEN.z1 + 1], [DEN.x0, DEN.x1, DEN.z0 - 1, DEN.z0],
    [DEN.x0, DEN.x1, DEN.z1, DEN.z1 + 1]]) solid(x0, x1, z0, z1);
  solid(HOLE.x0, HOLE.x1, HOLE.z0, HOLE.z1);   // the ladder

  // ----- furniture: wood, brass, leather -----
  const wood = [], brass = [], leather = [], dark = [];
  // The desk against the west wall, green leather on its top, and its chair.
  wood.push(B(0.82, 0.05, 1.8, '#3b2416', 5.93, 0.755, -11.6));
  for (const z of [-12.22, -10.98]) {
    wood.push(B(0.74, 0.73, 0.46, '#3f2718', 5.93, 0.365, z));
    for (const y of [0.18, 0.42, 0.62]) { wood.push(B(0.01, 0.17, 0.4, '#341f12', 6.305, y, z)); brass.push(B(0.02, 0.015, 0.08, '#c9a24a', 6.32, y, z)); }
  }
  dark.push(B(0.62, 0.004, 1.5, '#1f3a2a', 5.93, 0.782, -11.6));
  dark.push(B(0.21, 0.02, 0.3, '#e9e1cf', 6.05, 0.792, -11.4, 0.2), B(0.22, 0.015, 0.31, '#2b3650', 6.0, 0.789, -11.05, -0.1));   // papers, a notebook
  solid(5.5, 6.36, -12.5, -10.7);
  wood.push(B(0.48, 0.06, 0.48, '#3a2414', 6.85, 0.46, -11.6), B(0.06, 0.5, 0.46, '#3a2414', 7.08, 0.74, -11.6));
  leather.push(B(0.44, 0.06, 0.44, '#4a1d16', 6.84, 0.51, -11.6), B(0.05, 0.36, 0.4, '#4a1d16', 7.04, 0.76, -11.6));
  brass.push(C(0.03, 0.03, 0.42, '#2a2420', 6.85, 0.21, -11.6), C(0.26, 0.26, 0.03, '#2a2420', 6.85, 0.02, -11.6, 5));
  solid(6.62, 7.12, -11.85, -11.35);
  // The banker's lamp: brass foot and stem, a green glass shade (its own material: it glows while the lamp's on).
  brass.push(C(0.07, 0.08, 0.03, '#b8913f', 5.78, 0.795, -12.05, 24), C(0.008, 0.008, 0.26, '#b8913f', 5.78, 0.93, -12.05), B(0.02, 0.02, 0.2, '#b8913f', 5.78, 1.06, -12.05));
  const lamp = { on: true, k: 1 };
  const shadeM = new THREE.MeshStandardMaterial({ color: '#1d5a30', emissive: '#3fae5a', emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide });
  const bulbM = new THREE.MeshStandardMaterial({ color: '#fff3dd', emissive: '#ffcf8a', emissiveIntensity: 2.2 });
  {
    const g = new THREE.CylinderGeometry(0.075, 0.075, 0.4, 20, 1, true, -Math.PI / 2, Math.PI);
    g.rotateX(-Math.PI / 2);
    const shade = new THREE.Mesh(g, shadeM); shade.position.set(5.78, Y(1.08), -12.05); add(shade, { action: 'den-lamp', reach: 2.6 });
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), bulbM); bulb.rotation.x = Math.PI / 2; bulb.position.set(5.78, Y(1.06), -12.05); add(bulb, { action: 'den-lamp', reach: 2.6 });
    brass.push(C(0.003, 0.003, 0.12, '#c9a24a', 5.86, 1.0, -11.9));   // the pull chain
  }
  // Four monitors over the desk in a walnut surround, each a security camera's feed of the office upstairs.
  const feeds = [], camIds = ['my-office', 'lobby', 'desks-se', 'breakroom', 'lounge', 'meeting', 'desks-nw'];
  let camAt = 0;
  // A feed comes graded for display (cctv.js): back to linear for the frame's own output pass, a little scanline, dark
  // till its first picture.
  const screenM = (tex) => new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, on: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float on; varying vec2 vUv;
      void main() { vec3 c = pow(texture2D(map, vUv).rgb, vec3(2.2)) * 0.6 * on + vec3(0.004, 0.006, 0.01) * (1.0 - on);
        gl_FragColor = vec4(c * (0.9 + 0.1 * step(0.5, fract(vUv.y * 60.0))), 1.0); }`,
  });
  wood.push(B(0.12, 0.92, 1.36, '#3a2414', 5.46, 1.58, -11.6));
  for (const [dz, y] of [[-0.31, 1.38], [0.31, 1.38], [-0.31, 1.79], [0.31, 1.79]]) {
    dark.push(B(0.06, 0.36, 0.58, '#141414', 5.53, y, -11.6 + dz));
    const rt = new THREE.WebGLRenderTarget(256, 160, { depthBuffer: false });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.31), screenM(rt.texture));
    scr.position.set(5.565, Y(y), -11.6 + dz); scr.rotation.y = Math.PI / 2; add(scr, { action: 'den-cams', reach: 3 });
    feeds.push({ rt, scr });
  }
  // The wingback turned to the fire; a side table at its elbow; a reading lamp behind.
  // (a metre in from the room's corner, clear of the way from the ladder to the fire and of the east wall)
  const CH = { x: 10.2, z: -10.45, ry: Math.atan2(9.0 - 10.2, -8.85 + 10.45) };
  const chair = new THREE.Group(); chair.position.set(CH.x, DY, CH.z); chair.rotation.y = CH.ry; G.add(chair);
  {
    const L = [], c = '#5b2219', P = (g, x, y, z, rx = 0, rz = 0) => L.push(part(g, c, x, y, z, rx, 0, rz));
    P(new THREE.BoxGeometry(0.86, 0.36, 0.82), 0, 0.26, 0); P(new THREE.BoxGeometry(0.62, 0.13, 0.62), 0, 0.5, 0.06);
    P(new THREE.BoxGeometry(0.86, 0.78, 0.2), 0, 0.82, -0.32, -0.08); P(new THREE.BoxGeometry(0.17, 0.3, 0.74), -0.35, 0.56, 0.02); P(new THREE.BoxGeometry(0.17, 0.3, 0.74), 0.35, 0.56, 0.02);
    P(new THREE.CylinderGeometry(0.1, 0.1, 0.76, 14), -0.36, 0.72, 0.02, Math.PI / 2); P(new THREE.CylinderGeometry(0.1, 0.1, 0.76, 14), 0.36, 0.72, 0.02, Math.PI / 2);
    for (const s of [-1, 1]) P(new THREE.BoxGeometry(0.14, 0.5, 0.3), s * 0.36, 1.0, -0.22);   // the wings
    const m = merge(L, vc({ roughness: 0.45, metalness: 0.05 })); m.userData = { action: 'den-chair', reach: 2.6 }; chair.add(m);
    const legs = []; for (const [x, z] of [[-0.36, -0.34], [0.36, -0.34], [-0.36, 0.34], [0.36, 0.34]]) legs.push(part(new THREE.CylinderGeometry(0.025, 0.02, 0.08, 8), '#2a1a10', x, 0.04, z));
    chair.add(merge(legs, vc()));
  }
  const seat = { name: 'Armchair', x: CH.x + Math.sin(CH.ry) * 0.05, z: CH.z + Math.cos(CH.ry) * 0.05, rotY: CH.ry, eye: 1.08, floor: 'den', obj: chair };
  solid(CH.x - 0.5, CH.x + 0.5, CH.z - 0.5, CH.z + 0.5);
  const st = { x: CH.x + Math.cos(CH.ry) * 0.75, z: CH.z - Math.sin(CH.ry) * 0.75 };   // (at its left hand)
  wood.push(C(0.24, 0.24, 0.03, '#3b2416', st.x, 0.58, st.z, 24), C(0.025, 0.03, 0.56, '#3b2416', st.x, 0.29, st.z), C(0.16, 0.18, 0.03, '#3b2416', st.x, 0.015, st.z, 20));
  dark.push(B(0.16, 0.035, 0.22, '#2f4a5e', st.x - 0.05, 0.613, st.z, 0.4));
  solid(st.x - 0.25, st.x + 0.25, st.z - 0.25, st.z + 0.25);
  const RL = { x: CH.x - Math.sin(CH.ry) * 0.7 + Math.cos(CH.ry) * 0.3, z: CH.z - Math.cos(CH.ry) * 0.7 - Math.sin(CH.ry) * 0.3 };   // (behind it, over its shoulder)
  brass.push(C(0.15, 0.17, 0.03, '#2a2420', RL.x, 0.015, RL.z, 20), C(0.012, 0.012, 1.4, '#b8913f', RL.x, 0.72, RL.z));
  const fabricM = new THREE.MeshStandardMaterial({ color: '#e9d8b8', emissive: '#ffcf8a', emissiveIntensity: 0.55, roughness: 0.9, side: THREE.DoubleSide });
  { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 24, 1, true), fabricM); s.position.set(RL.x, Y(1.5), RL.z); add(s); }
  solid(RL.x - 0.2, RL.x + 0.2, RL.z - 0.2, RL.z + 0.2);

  // The whisky cabinet on the east wall: a cupboard, a glass-fronted case of bottles, a decanter and a tumbler.
  const cab = { x: 12.33, z: -12.75, fill: 0, to: 0 };
  wood.push(B(0.48, 0.85, 1.1, '#3f2718', cab.x, 0.425, cab.z), B(0.52, 0.04, 1.14, '#2e1c10', cab.x, 0.87, cab.z), B(0.02, 0.92, 1.06, '#3a2414', cab.x + 0.23, 1.36, cab.z),
    B(0.37, 0.92, 0.02, '#3a2414', cab.x + 0.055, 1.36, cab.z - 0.52), B(0.37, 0.92, 0.02, '#3a2414', cab.x + 0.055, 1.36, cab.z + 0.52), B(0.5, 0.05, 1.12, '#2e1c10', cab.x, 1.84, cab.z));
  for (const dz of [-0.27, 0.27]) { wood.push(B(0.01, 0.75, 0.5, '#341f12', cab.x - 0.245, 0.43, cab.z + dz)); brass.push(B(0.02, 0.08, 0.02, '#c9a24a', cab.x - 0.255, 0.55, cab.z + dz * 0.15)); }
  const glassBits = [];
  for (const [y, n] of [[0.94, 5], [1.36, 6]]) {
    wood.push(B(0.34, 0.02, 1.02, '#2e1c10', cab.x + 0.06, y, cab.z));
    for (let i = 0; i < n; i++) {
      const z = cab.z - 0.42 + (i + 0.5) * (0.84 / n), h = 0.24 + R() * 0.08, col = ['#7a3d12', '#a8641c', '#2f4a2a', '#c58a2c', '#5a2a10', '#d9b06a'][Math.floor(R() * 6)];
      glassBits.push(C(0.035, 0.035, h, col, cab.x + 0.07, y + 0.01 + h / 2, z, 12), C(0.012, 0.016, 0.07, col, cab.x + 0.07, y + 0.01 + h + 0.035, z, 8));
    }
  }
  glassBits.push(C(0.06, 0.07, 0.2, '#b06a20', cab.x - 0.18, 0.99, cab.z - 0.3, 18), C(0.025, 0.04, 0.06, '#d8c6a8', cab.x - 0.18, 1.12, cab.z - 0.3, 12));   // the decanter, out on the counter
  const bottles = merge(glassBits, vc({ roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
  bottles.layers.set(1); add(bottles, { action: 'den-whisky', reach: 2.6 });
  const tumbler = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.09, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#e8f0f2', transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide }));
  tumbler.position.set(cab.x - 0.18, Y(0.935), cab.z + 0.2); tumbler.layers.set(1); add(tumbler, { action: 'den-whisky', reach: 2.6 });
  const dram = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.033, 1, 16), new THREE.MeshStandardMaterial({ color: '#b5651d', emissive: '#4a2008', emissiveIntensity: 0.3, roughness: 0.1, transparent: true, opacity: 0.85 }));
  dram.position.set(cab.x - 0.18, Y(0.893), cab.z + 0.2); dram.scale.y = 0.001; dram.visible = false; dram.layers.set(1); add(dram);
  {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.86), new THREE.MeshStandardMaterial({ color: '#cfe0e4', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.2 }));
    pane.position.set(cab.x - 0.125, Y(1.36), cab.z); pane.rotation.y = -Math.PI / 2; pane.layers.set(1); add(pane, { action: 'den-whisky', reach: 2.6 });
  }
  solid(12.06, 12.6, -13.32, -12.18);

  // The sideboard on the north wall with the record player, two speakers and a row of LPs.
  const sb = { x0: 9.3, x1: 11.1, z0: DEN.z0, z1: -14.43 }, sbx = (sb.x0 + sb.x1) / 2, sbz = (sb.z0 + sb.z1) / 2, top = 0.62;
  wood.push(B(sb.x1 - sb.x0, 0.04, sb.z1 - sb.z0, '#2e1c10', sbx, top - 0.02, sbz), B(sb.x1 - sb.x0, 0.06, sb.z1 - sb.z0 - 0.04, '#2e1c10', sbx, 0.03, sbz),
    B(0.04, top - 0.08, sb.z1 - sb.z0, '#3f2718', sb.x0 + 0.02, top / 2, sbz), B(0.04, top - 0.08, sb.z1 - sb.z0, '#3f2718', sb.x1 - 0.02, top / 2, sbz),
    B(sb.x1 - sb.x0, top - 0.08, 0.02, '#3a2414', sbx, top / 2, sb.z0 + 0.01));
  for (let x = sb.x0 + 0.08; x < sb.x1 - 0.08; x += 0.013 + R() * 0.004) dark.push(B(0.012, 0.31, 0.3, `hsl(${Math.floor(R() * 360)}, ${Math.round(35 + R() * 35)}%, ${Math.round(12 + R() * 22)}%)`, x, 0.22, sbz + 0.02));
  for (const x of [sb.x0 + 0.18, sb.x1 - 0.18]) { wood.push(B(0.22, 0.32, 0.22, '#3f2718', x, top + 0.16, sbz)); dark.push(B(0.17, 0.27, 0.005, '#2a2420', x, top + 0.16, sbz + 0.112)); }
  const tt = { x: 10.2, z: sbz + 0.02, on: false, spin: 0, arm: 0 };
  wood.push(B(0.46, 0.09, 0.36, '#4a2e1b', tt.x, top + 0.045, tt.z));
  brass.push(C(0.15, 0.15, 0.02, '#8c9096', tt.x - 0.05, top + 0.1, tt.z, 32));
  const platter = new THREE.Group(); platter.position.set(tt.x - 0.05, Y(top + 0.112), tt.z); G.add(platter);
  {
    const disc = merge([part(new THREE.CylinderGeometry(0.143, 0.143, 0.004, 40), '#0c0c0d', 0, 0, 0), part(new THREE.CylinderGeometry(0.045, 0.045, 0.005, 24), '#b8322b', 0, 0, 0),
      part(new THREE.BoxGeometry(0.03, 0.006, 0.008), '#e8dcc0', 0.02, 0, 0)], vc({ roughness: 0.3 }));
    disc.userData = { action: 'den-records', reach: 2.6 }; platter.add(disc);
  }
  const arm = new THREE.Group(); arm.position.set(tt.x + 0.15, Y(top + 0.12), tt.z - 0.12); G.add(arm);
  arm.add(merge([part(new THREE.CylinderGeometry(0.015, 0.018, 0.03, 12), '#b8bcc2', 0, 0, 0), part(new THREE.BoxGeometry(0.008, 0.008, 0.23), '#c9ced4', 0, 0.02, 0.11),
    part(new THREE.BoxGeometry(0.02, 0.01, 0.03), '#2a2c30', 0, 0.015, 0.23)], vc({ metalness: 0.7, roughness: 0.3 })));
  arm.traverse((o) => { o.userData = { action: 'den-records', reach: 2.6 }; });
  solid(sb.x0, sb.x1, sb.z0, sb.z1 + 0.04);

  // The safe in the corner: green steel, a brass dial and handle; inside, gold, and a file.
  const sf = { x0: 11.65, x1: 12.45, z0: DEN.z0, z1: -14.35, k: 0, to: 0, dial: 0, phase: 0 };
  const sfx_ = (sf.x0 + sf.x1) / 2, sfz = (sf.z0 + sf.z1) / 2, sh = 0.9;
  const steel = vc({ metalness: 0.55, roughness: 0.45 });
  add(merge([part(new THREE.BoxGeometry(0.06, sh, sf.z1 - sf.z0), '#22352a', sf.x0 + 0.03, Y(sh / 2), sfz), part(new THREE.BoxGeometry(0.06, sh, sf.z1 - sf.z0), '#22352a', sf.x1 - 0.03, Y(sh / 2), sfz),
    part(new THREE.BoxGeometry(sf.x1 - sf.x0, 0.06, sf.z1 - sf.z0), '#22352a', sfx_, Y(sh - 0.03), sfz), part(new THREE.BoxGeometry(sf.x1 - sf.x0, 0.08, sf.z1 - sf.z0), '#1c2b22', sfx_, Y(0.04), sfz),
    part(new THREE.BoxGeometry(sf.x1 - sf.x0, sh, 0.04), '#17221b', sfx_, Y(sh / 2), sf.z0 + 0.02), part(new THREE.BoxGeometry(sf.x1 - sf.x0 - 0.12, 0.02, sf.z1 - sf.z0 - 0.08), '#1c2b22', sfx_, Y(0.45), sfz),
    ...[0, 1, 2, 3].map((i) => part(new THREE.BoxGeometry(0.18, 0.05, 0.08), '#d9a441', sfx_ - 0.12 + (i % 2) * 0.2, Y(0.105 + Math.floor(i / 2) * 0.05), sfz + 0.02)),
    part(new THREE.BoxGeometry(0.24, 0.03, 0.32), '#8c2f24', sfx_ + 0.05, Y(0.475), sfz + 0.02, 0, 0.2)], steel), { action: 'den-safe', reach: 2.6 });
  const door = new THREE.Group(); door.position.set(sf.x0 + 0.005, DY, sf.z1); G.add(door);
  const dial = new THREE.Group(); dial.position.set((sf.x1 - sf.x0) * 0.62, 0.6, 0.06); door.add(dial);
  {
    const dw = sf.x1 - sf.x0 - 0.01;
    const d = merge([part(new THREE.BoxGeometry(dw, sh - 0.01, 0.06), '#2a4334', dw / 2, sh / 2, 0.0), part(new THREE.BoxGeometry(dw - 0.08, sh - 0.09, 0.005), '#1f3328', dw / 2, sh / 2, 0.032),
      part(new THREE.BoxGeometry(0.035, 0.16, 0.035), '#c9a24a', dw * 0.62, 0.36, 0.05), part(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), '#c9a24a', dw * 0.62, 0.36, 0.04, Math.PI / 2)], steel);
    door.add(d);
    dial.add(merge([part(new THREE.CylinderGeometry(0.07, 0.075, 0.025, 32), '#c9a24a', 0, 0, 0, Math.PI / 2), part(new THREE.BoxGeometry(0.008, 0.03, 0.01), '#2a2420', 0, 0.05, 0.014)],
      vc({ metalness: 0.85, roughness: 0.3 })));
    door.traverse((o) => { o.userData = { action: 'den-safe', reach: 2.6 }; });
  }
  solid(sf.x0, sf.x1, sf.z0, sf.z1 + 0.05);

  // The lever beside the ladder: brass on a plate. Up, the bookcase is open.
  const leverAt = { x: 7.12, y: Y(1.2), z: DEN.z0 + 0.03 };
  brass.push(B(0.12, 0.3, 0.02, '#8f7134', leverAt.x, 1.2, DEN.z0 + 0.01));
  const lever = new THREE.Group(); lever.position.set(leverAt.x, Y(1.12), DEN.z0 + 0.04); G.add(lever);
  lever.add(merge([part(new THREE.BoxGeometry(0.024, 0.24, 0.024), '#c9a24a', 0, 0.12, 0), part(new THREE.SphereGeometry(0.028, 14, 10), '#2a1a10', 0, 0.25, 0),
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), '#8f7134', 0, 0, 0, 0, Math.PI / 2)], vc({ metalness: 0.8, roughness: 0.3 })));
  lever.traverse((o) => { o.userData = { action: 'den-lever', reach: 2.4 }; });
  // A caged bulkhead light by the ladder.
  const cageM = new THREE.MeshStandardMaterial({ color: '#fff0d8', emissive: '#ffcf8a', emissiveIntensity: 1.6 });
  { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), cageM); b.position.set(9.1, Y(2.25), DEN.z0 + 0.08); add(b); }
  brass.push(C(0.07, 0.07, 0.03, '#2a2420', 9.1, 2.25, DEN.z0 + 0.02, 16, Math.PI / 2), ...[-1, 0, 1].map((k) => B(0.004, 0.13, 0.004, '#2a2420', 9.1 + k * 0.04, 2.25, DEN.z0 + 0.11)));

  // The fireplace on the south wall: a chimney breast out from the panelling with the firebox in it, a carved stone
  // surround and mantel, a stone hearth; logs on an iron grate; a fire screen and the irons.
  const FP = { x: 9.0, face: DEN.z1 - 0.45, ow: 1.0, oh: 0.82, on: true, k: 1, flick: 1 };   // (the breast's face; the opening)
  const fz = FP.face, bz = DEN.z1 - 0.06, o0 = FP.x - FP.ow / 2, o1 = FP.x + FP.ow / 2, stone = [], soot = [];
  stone.push(B(o0 - 7.95, H, DEN.z1 - fz, '#4a3a2e', (7.95 + o0) / 2, H / 2, (fz + DEN.z1) / 2), B(10.05 - o1, H, DEN.z1 - fz, '#4a3a2e', (o1 + 10.05) / 2, H / 2, (fz + DEN.z1) / 2),
    B(FP.ow, H - FP.oh, DEN.z1 - fz, '#4a3a2e', FP.x, FP.oh + (H - FP.oh) / 2, (fz + DEN.z1) / 2));   // the breast, plastered dark
  for (const x of [o0 - 0.11, o1 + 0.11]) stone.push(B(0.22, 1.02, 0.08, '#b5a991', x, 0.51, fz - 0.04), B(0.26, 0.06, 0.1, '#bfb29a', x, 0.03, fz - 0.05), B(0.26, 0.05, 0.1, '#bfb29a', x, 1.0, fz - 0.05));
  stone.push(B(FP.ow + 0.44, 0.2, 0.07, '#afa38c', FP.x, FP.oh + 0.1, fz - 0.035), B(0.3, 0.12, 0.02, '#b3a68e', FP.x, FP.oh + 0.1, fz - 0.075),   // the frieze, a carved panel
    B(FP.ow + 0.8, 0.07, 0.34, '#bcb099', FP.x, 1.07, fz - 0.13), B(FP.ow + 0.7, 0.03, 0.3, '#bfb29a', FP.x, 1.02, fz - 0.11),   // the mantel shelf
    B(FP.ow + 0.9, 0.04, 0.62, '#5c544c', FP.x, 0.02, fz - 0.31));   // the hearth
  soot.push(B(FP.ow, FP.oh, 0.02, '#141110', FP.x, FP.oh / 2, bz + 0.01), B(0.02, FP.oh, bz - fz, '#1a1614', o0 + 0.01, FP.oh / 2, (fz + bz) / 2),
    B(0.02, FP.oh, bz - fz, '#1a1614', o1 - 0.01, FP.oh / 2, (fz + bz) / 2), B(FP.ow, 0.02, bz - fz, '#1a1614', FP.x, FP.oh - 0.01, (fz + bz) / 2),
    B(FP.ow - 0.04, 0.03, bz - fz, '#211b17', FP.x, 0.055, (fz + bz) / 2));
  // The grate (black iron) and the irons on their stand.
  const gz = (fz + bz) / 2 + 0.03;
  for (let i = 0; i < 6; i++) dark.push(B(0.012, 0.16, 0.012, '#1c1c1c', FP.x - 0.28 + i * 0.112, 0.17, gz - 0.13));
  dark.push(B(0.6, 0.015, 0.3, '#1c1c1c', FP.x, 0.1, gz), B(0.6, 0.015, 0.015, '#1c1c1c', FP.x, 0.25, gz - 0.13));
  for (const x of [-0.27, 0.27]) for (const z of [-0.12, 0.12]) dark.push(B(0.02, 0.09, 0.02, '#1c1c1c', FP.x + x, 0.045, gz + z));
  const irons = { x: o1 + 0.62, z: fz - 0.22 };
  brass.push(C(0.1, 0.11, 0.02, '#2a2420', irons.x, 0.01, irons.z, 16), C(0.008, 0.008, 0.7, '#b8913f', irons.x, 0.36, irons.z), C(0.06, 0.06, 0.012, '#b8913f', irons.x, 0.66, irons.z, 12));
  for (const [dx, dz, t] of [[0.04, 0, 0], [-0.02, 0.035, 0.1], [-0.02, -0.035, -0.1]]) brass.push(part(new THREE.CylinderGeometry(0.006, 0.006, 0.66, 6), '#2a2420', irons.x + dx, Y(0.36), irons.z + dz, t, 0, -t),
    C(0.012, 0.012, 0.07, '#c9a24a', irons.x + dx, 0.72, irons.z + dz, 8));
  solid(irons.x - 0.12, irons.x + 0.12, irons.z - 0.12, irons.z + 0.12);
  // On the mantel: a clock, two candlesticks, a small framed photo.
  const my = 1.105;
  wood.push(B(0.22, 0.26, 0.1, '#2e1c10', FP.x, my + 0.13, fz - 0.14), B(0.26, 0.03, 0.12, '#2e1c10', FP.x, my + 0.015, fz - 0.14));
  dark.push(C(0.075, 0.075, 0.006, '#efe6d2', FP.x, my + 0.16, fz - 0.192, 24, Math.PI / 2), B(0.004, 0.05, 0.002, '#1c1c1c', FP.x, my + 0.18, fz - 0.196, 0), B(0.035, 0.004, 0.002, '#1c1c1c', FP.x + 0.015, my + 0.16, fz - 0.197));
  const flameM = new THREE.MeshStandardMaterial({ color: '#fff3dd', emissive: '#ffb050', emissiveIntensity: 2.0 });
  for (const x of [FP.x - 0.55, FP.x + 0.55]) {
    brass.push(C(0.04, 0.045, 0.015, '#b8913f', x, my + 0.008, fz - 0.14, 14), C(0.012, 0.018, 0.2, '#b8913f', x, my + 0.11, fz - 0.14, 10), C(0.025, 0.015, 0.03, '#b8913f', x, my + 0.225, fz - 0.14, 12));
    dark.push(C(0.011, 0.011, 0.12, '#efe8da', x, my + 0.3, fz - 0.14, 10));
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), flameM); f.scale.y = 2; f.position.set(x, Y(my + 0.375), fz - 0.14); add(f);
  }
  wood.push(B(0.16, 0.2, 0.015, '#1c1a18', FP.x + 0.33, my + 0.1, fz - 0.17, -0.25));
  { const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.16), new THREE.MeshStandardMaterial({ map: artTexture(77, 0.75), roughness: 0.9 }));
    pic.position.set(FP.x + 0.33 - 0.0025, Y(my + 0.1), fz - 0.179); pic.rotation.y = Math.PI - 0.25; add(pic); }
  add(merge(stone, vc({ roughness: 0.85 }))); add(merge(soot, vc({ roughness: 1 })), { action: 'den-fire', reach: 3 });
  solid(7.95, 10.05, fz, DEN.z1);
  // The logs: three, crossed on the grate, their ends glowing while it burns.
  const logM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: '#ff4a10', emissiveIntensity: 0.5 });
  const logs = merge([part(new THREE.CylinderGeometry(0.055, 0.06, 0.52, 10), '#4a3020', FP.x, Y(0.17), gz, 0, 0.3, Math.PI / 2),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.48, 10), '#3e2a1c', FP.x + 0.03, Y(0.22), gz + 0.02, 0, -0.5, Math.PI / 2),
    part(new THREE.CylinderGeometry(0.045, 0.05, 0.42, 10), '#52361f', FP.x - 0.05, Y(0.25), gz - 0.04, 0, 0.9, Math.PI / 2 - 0.3)], logM);
  add(logs, { action: 'den-fire', reach: 3 });
  // The fire: flames on a few crossed planes and the embers under them, one noise shader, added on (no depth written).
  const fireU = { t: { value: 0 }, k: { value: 1 } };
  const NOISE = `float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n1(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y); }`;
  const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const flameMat = (seed) => new THREE.ShaderMaterial({ uniforms: { ...fireU, seed: { value: seed } }, vertexShader: VS, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    fragmentShader: `uniform float t, k, seed; varying vec2 vUv; ${NOISE}
      void main() {
        float y = vUv.y, q = n1(vec2(vUv.x * 4.0 + seed, y * 3.0 - t * 2.3)) * 0.65 + n1(vec2(vUv.x * 9.0 - seed, y * 7.0 - t * 4.1)) * 0.35;
        float w = (1.0 - y) * 0.42 + 0.04, d = abs(vUv.x - 0.5 + (q - 0.5) * 0.3 * y);
        float f = smoothstep(w, w * 0.25, d) * smoothstep(1.0, 0.2, y + q * 0.45) * smoothstep(0.0, 0.1, y) * k;
        gl_FragColor = vec4(mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.82, 0.42), smoothstep(0.35, 0.95, f)) * f * 1.8, 1.0);
      }` });
  const flames = [];
  for (const [w, hh, dx, dz, ry, seed] of [[0.56, 0.5, 0, 0.02, 0, 1.3], [0.42, 0.42, -0.1, -0.03, 0.6, 7.1], [0.4, 0.38, 0.12, -0.01, -0.6, 3.7], [0.3, 0.3, 0.02, 0.05, 0.2, 5.2]]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), flameMat(seed));
    f.position.set(FP.x + dx, Y(0.17 + hh / 2), gz + dz); f.rotation.y = Math.PI + ry; f.layers.set(1); f.userData = { action: 'den-fire', reach: 3 }; add(f); flames.push(f);
  }
  const embers = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.26), new THREE.ShaderMaterial({ uniforms: fireU, vertexShader: VS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: `uniform float t, k; varying vec2 vUv; ${NOISE}
      void main() { float e = n1(vUv * vec2(14.0, 7.0) + vec2(t * 0.25, -t * 0.4)) * 0.7 + n1(vUv * 30.0 - t * 0.6) * 0.3, edge = smoothstep(0.0, 0.25, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        gl_FragColor = vec4(vec3(1.0, 0.32, 0.05) * pow(e, 2.0) * edge * (0.25 + 0.95 * k) * 1.6, 1.0); }` }));
  embers.rotation.x = -Math.PI / 2; embers.position.set(FP.x, Y(0.115), gz); embers.layers.set(1); add(embers);
  // A spark now and then, rising out of it.
  const NS = 8, sparkP = new Float32Array(NS * 3), sparks = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#ffb35a', size: 0.018,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.geometry.setAttribute('position', new THREE.BufferAttribute(sparkP, 3)); sparks.frustumCulled = false; sparks.layers.set(1); add(sparks);
  const sp = Array.from({ length: NS }, () => ({ life: -R() * 3, vx: 0, vz: 0 }));
  // The screen in front: a brass frame round a dark mesh you can see the fire through.
  brass.push(B(1.12, 0.02, 0.02, '#b8913f', FP.x, 0.62, fz - 0.42), B(1.12, 0.02, 0.02, '#b8913f', FP.x, 0.05, fz - 0.42), B(0.02, 0.6, 0.02, '#b8913f', FP.x - 0.55, 0.34, fz - 0.42),
    B(0.02, 0.6, 0.02, '#b8913f', FP.x + 0.55, 0.34, fz - 0.42), B(0.25, 0.012, 0.012, '#b8913f', FP.x - 0.55, 0.012, fz - 0.42, Math.PI / 2), B(0.25, 0.012, 0.012, '#b8913f', FP.x + 0.55, 0.012, fz - 0.42, Math.PI / 2));
  {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.56), new THREE.MeshStandardMaterial({ color: '#0d0c0b', transparent: true, opacity: 0.4, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    mesh.position.set(FP.x, Y(0.335), fz - 0.42); mesh.layers.set(1); add(mesh, { action: 'den-fire', reach: 3 });
  }
  solid(FP.x - 0.6, FP.x + 0.6, fz - 0.47, fz);

  add(merge(wood, vc({ roughness: 0.55 })));
  add(merge(brass, vc({ metalness: 0.8, roughness: 0.32 })));
  add(merge(leather, vc({ roughness: 0.45 })));
  add(merge(dark, vc({ roughness: 0.8 })));

  // ----- each frame while it's shown -----
  const lights = [
    { p: new THREE.Vector3(5.8, Y(0.98), -12.05), color: '#ffd29a', distance: 6, level: () => 3.0 * lamp.k },
    { p: new THREE.Vector3(RL.x, Y(1.45), RL.z), color: '#ffc88a', distance: 8, level: () => 4.2 },
    { p: new THREE.Vector3(FP.x, Y(0.8), FP.face - 0.8), color: '#ff9848', distance: 8, level: () => 2.8 * FP.k * FP.flick },   // the fire
    { p: new THREE.Vector3(9.1, Y(2.2), DEN.z0 + 0.3), color: '#ffd8a6', distance: 6, level: () => 1.8 },
  ];
  let feedN = 0, feedAt = 0;
  const bank = new THREE.Box3(new THREE.Vector3(5.4, Y(1.1), -12.3), new THREE.Vector3(5.6, Y(2.05), -10.9));
  function fx(dt, t, S) {
    // The cameras: each is a whole render of the office, so only while you're down here and the monitors are in view, one
    // feed every eighth frame in turn (each straight away the first time).
    const fresh = feeds.find((f) => !f.scr.material.uniforms.on.value);
    if (S.at === 'den' && ctx.cctv && api.inView(bank) && (fresh || (feedN = (feedN + 1) % 8) === 0)) {
      const i = fresh ? feeds.indexOf(fresh) : (feedAt = (feedAt + 1) % feeds.length), f = feeds[i];
      const cams = ctx.cctv.cams.filter((cm) => cm.n === 48 && !cm.city), cam = cams.find((cm) => cm.id === camIds[(camAt + i) % camIds.length]) || cams[i % cams.length];
      if (cam) { ctx.cctv.into(cam, f.rt, t); f.scr.material.uniforms.on.value = 1; }
    }
    // The fire: it moves only while you're below; its crackle comes from the hearth (and fades with distance).
    FP.k = damp(FP.k, FP.on ? 1 : 0, FP.on ? 1.2 : 2.5, dt);
    api.snd().fire(S.at === 'office' || ctx.away ? 0 : FP.k, { x: FP.x, y: Y(0.3), z: FP.face - 0.2 });
    if (S.at !== 'office') {
      FP.flick = 0.84 + 0.08 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 7.3 + 1) + 0.05 * Math.sin(t * 23.7 + 2);
      fireU.t.value = t; fireU.k.value = FP.k;
      for (const f of flames) f.visible = FP.k > 0.01;
      logM.emissiveIntensity = (0.08 + 0.3 * FP.flick) * FP.k;
      sp.forEach((q, i) => {
        q.life += dt;
        if (q.life > 1.4) { q.life = FP.k > 0.5 && Math.random() < 0.5 ? 0 : -Math.random() * 2; q.vx = (Math.random() - 0.5) * 0.15; q.vz = (Math.random() - 0.5) * 0.1; }
        const u = Math.max(0, q.life), on = q.life >= 0 && FP.k > 0.5;
        sparkP[i * 3] = FP.x + q.vx * u + Math.sin(u * 9 + i) * 0.02; sparkP[i * 3 + 1] = on ? Y(0.3 + u * 0.45) : -999; sparkP[i * 3 + 2] = gz + q.vz * u;
      });
      sparks.geometry.attributes.position.needsUpdate = true;
    }
    // The lamp, the record, the safe, the dram, the lever.
    lamp.k = damp(lamp.k, lamp.on ? 1 : 0, 14, dt);
    shadeM.emissiveIntensity = 0.08 + 0.55 * lamp.k; bulbM.emissiveIntensity = 0.05 + 2.2 * lamp.k;
    tt.arm = damp(tt.arm, tt.on ? 1 : 0, 3, dt); arm.rotation.y = -0.45 * tt.arm;
    tt.spin = damp(tt.spin, tt.on && tt.arm > 0.9 ? 1 : 0, 2, dt); platter.rotation.y -= tt.spin * dt * Math.PI * 2 * (33.3 / 60);
    if (sf.phase === 1) { sf.dial += dt; dial.rotation.z = Math.sin(sf.dial * 9) * 2.2 * (1 - sf.dial); if (sf.dial >= 1) { sf.phase = 0; sf.to = 1; api.snd().creak({ x: sfx_, y: Y(0.5), z: sf.z1 }); } }
    const was = sf.k;
    sf.k = sf.to > sf.k ? Math.min(1, sf.k + dt / 1.2) : Math.max(0, sf.k - dt / 0.6);
    if (was > 0 && sf.k === 0 && sf.to === 0) api.snd().clang({ x: sfx_, y: Y(0.5), z: sf.z1 });
    door.rotation.y = -1.7 * ease(sf.k);
    cab.fill = damp(cab.fill, cab.to, 2.5, dt); dram.visible = cab.fill > 0.01; dram.scale.y = 0.05 * cab.fill; dram.position.y = Y(0.893 + 0.025 * cab.fill);
    lever.rotation.x = 0.4 + (Math.PI - 0.8) * (1 - api.openK());
  }
  function stopAll() { if (tt.on) { tt.on = false; api.snd().record(false); } api.snd().fire(0); }

  // ----- clicks -----
  const hint = (t, k) => `<b>${t}</b>${k ? `<div class="k">${k}</div>` : ''}`;
  ctx.action('den-lamp', { hover: () => hint('Banker’s lamp', `Click to switch it ${lamp.on ? 'off' : 'on'}`),
    click: () => { lamp.on = !lamp.on; api.snd().chain({ x: 5.86, y: Y(1.0), z: -11.9 }); } });
  ctx.action('den-records', { hover: () => hint('Record player', tt.on ? 'Click to lift the needle' : 'Click to put a record on'),
    click: () => { tt.on = !tt.on; api.snd().record(tt.on, { x: tt.x, y: Y(top + 0.2), z: tt.z }); } });
  ctx.action('den-safe', { hover: () => hint('The safe', sf.to ? 'Click to shut it' : 'Click to open it'),
    click: () => { if (sf.phase) return; if (sf.to) sf.to = 0; else { sf.phase = 1; sf.dial = 0; api.snd().dial({ x: sfx_, y: Y(0.6), z: sf.z1 }); } } });
  ctx.action('den-whisky', { hover: () => hint('Whisky', cab.to ? 'Click to drink it' : 'Click to pour one'),
    click: () => { if (!cab.to) ctx.sfx.pour({ x: cab.x - 0.18, y: Y(1.0), z: cab.z + 0.2 }); cab.to = cab.to ? 0 : 1; } });
  ctx.action('den-chair', { hover: () => hint('Armchair', 'Click to sit · move to stand up'), click: () => ctx.sitIn(seat) });
  ctx.action('den-lever', { hover: () => hint('Lever', `Click to ${api.S.T > 0 ? 'shut' : 'open'} the bookcase`), click: () => api.toggle('lever') });
  ctx.action('den-cams', {
    hover: () => { const cams = ctx.cctv?.cams || []; return hint('Office cameras', `${feeds.map((f, i) => cams.find((c) => c.id === camIds[(camAt + i) % camIds.length])?.name).filter(Boolean).join(' · ')}<br>Click for others`); },
    click: () => { camAt = (camAt + 1) % camIds.length; },
  });
  ctx.action('den-fire', { hover: () => hint('The fire', FP.on ? 'Click to put it out' : 'Click to light it'),
    click: () => { FP.on = !FP.on; api.snd()[FP.on ? 'ignite' : 'douse']({ x: FP.x, y: Y(0.3), z: FP.face - 0.2 }); } });

  // ----- the map while you're down here -----
  function map(c, sx, sz) {
    c.fillStyle = 'rgba(120,78,48,.55)'; c.fillRect(sx(DEN.x0), sz(DEN.z0), sx(DEN.x1) - sx(DEN.x0), sz(DEN.z1) - sz(DEN.z0));
    c.fillStyle = 'rgba(255,255,255,.25)';
    for (const b of colliders) if (b.maxX > DEN.x0 && b.minX < DEN.x1 && b.maxZ > DEN.z0 && b.minZ < DEN.z1)
      c.fillRect(sx(Math.max(b.minX, DEN.x0)), sz(Math.max(b.minZ, DEN.z0)), Math.max(2, sx(Math.min(b.maxX, DEN.x1)) - sx(Math.max(b.minX, DEN.x0))),
        Math.max(2, sz(Math.min(b.maxZ, DEN.z1)) - sz(Math.max(b.minZ, DEN.z0))));
    c.font = '600 18px system-ui'; c.fillStyle = 'rgba(255,255,255,.6)'; c.fillText('The den', sx(8.2), sz(-11.0));
    c.font = '600 13px system-ui'; c.fillText('Ladder', sx(HOLE.x0) - 4, sz(HOLE.z1) + 16);
  }

  return { g: G, colliders, lights, seat, leverAt, fx, map, stopAll, vc, merge, part };
}
