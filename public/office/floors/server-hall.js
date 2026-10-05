// SERVER HALL (47): racks of servers whose LEDs, screens and fans follow this machine (/api/machine) and the live
// sessions, a staging bay, and the NOC where John the sysadmin sits; talk to him (systems/chat.js). Its own scene.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { escapeHtml } from '../../chat.js';
import { box, clamp, cyl, dash, ease, F, fit, FONT, LIFT, makeCanvas, makeScreen, mat, mergedBoxes, rng, ROOM } from '../util.js';
import { MONO } from '../painters.js';
import { G, Person } from '../people.js';

export function install(ctx) {
  const { scene, liftShaft, addFloor, CAR, hitBox, camera, mapCtx } = ctx;
  // ----- SERVER HALL (47) -----
  // This machine as a data-centre hall: a vestibule off the lift with an access-controlled door, then a 40 x 38 m raised-floor
  // hall, 5 m high: seven contained cold-aisle pods (14 rows, A-N) of 42U racks in two blocks either side of a cross aisle,
  // ladder racks and cable trays overhead, CRACs along both long walls, a staging/build area, and a glass-walled NOC office
  // at the far end where John, the sysadmin, sits (click him to talk; /api/john).
  // In the first cold aisle, straight in from the door, row A's first three racks hold a 2U unit per live Claude session
  // (`srv.slots`, colour-coded like the people, LEDs blinking with what it's doing, click for its details) and row B's first
  // three are the machine itself: CPU per core, memory, load, top processes, a disk array per volume, switches and the UPS
  // (polled from /api/machine every 3 s while you're here). The NOC wall and its repeater over the cross aisle graph it all.
  // Built about the car at z = 0 in `srv.root`, moved onto your car's z when you arrive. Generic racks are instanced from a
  // few templates; all LEDs are one InstancedMesh, and only the racks within 15 m of you get theirs updated.
  const SV = { x0: -26, x1: 14.5, z0: -19, z1: 19, vz: 2.2, h: 5, dw: 0.6, dh: 2.2 }, RK = { w: 0.6, d: 1.07, h: 2.0, U: 0.04445, base: 0.08, fw: 0.45 };
  const POD = 4.54, PODS = [0, -1, 1, -2, 2, -3, 3], LETTERS = 'ABCDEFGHIJKLMN';
  // Rows by pod: the low row faces +z into the pod's cold aisle, the high row -z. Pod 0's are A and B, in line with the door.
  const ROWS = PODS.flatMap((k, i) =>
    [{ id: LETTERS[i * 2], z: k * POD - 1.135, f: 1, pod: k }, { id: LETTERS[i * 2 + 1], z: k * POD + 1.135, f: -1, pod: k }]);
  const BLOCKS = [{ x: (i) => 12.1 - i * RK.w, n: 10, first: 1 }, { x: (i) => 2.7 - i * RK.w, n: 24, first: 11 }];
  for (const B of BLOCKS) { B.x0 = B.x(B.n - 1) - RK.w / 2; B.x1 = B.x(0) + RK.w / 2; }
  const RACKX = BLOCKS[0].x, AISLES = PODS.map((k) => k * POD), SLOTS = 54;
  const NOC = { x0: SV.x0, x1: -17, z0: 4, z1: SV.z1, h: 3 }, STAGE = { x0: SV.x0, x1: -14, z0: -17.5, z1: -2 };
  const srv = { n: 47, label: 'SERVERS', title: 'Server Hall', on: false, composer: null, colliders: [], fixed: [], hits: [], slots: [], m: null,
    hist: { cpu: [], mem: [], load: [], sess: [], net: [] }, polledAt: 0, tick: 0, paintAt: 0, nocAt: 0, doors: [], aisleDoors: [], john: null };
  // John: a Person with grey hair in a ponytail, glasses, a grey beard, a flannel shirt and a bit of a belly, at his desk
  // (J: the desk's x, z). His `mood` (type, sip, lean, read) is set in srv.fx; he turns his head to you while you talk.
  function makeJohn(parent, J) {
    const p = new Person('john-sysadmin', '#7a2e2a'), grey = mat('#c8c5bf', { roughness: 0.95 }), shirt = mat('#7a2e2a', { roughness: 0.9 });
    const pl = makeCanvas(128, 128), c = pl.ctx;   // red and black flannel
    c.fillStyle = '#7a2420'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(20,16,16,.55)'; c.fillRect(0, 40, 128, 36); c.fillRect(40, 0, 36, 128);
    c.fillStyle = 'rgba(20,16,16,.35)'; c.fillRect(0, 100, 128, 8); c.fillRect(100, 0, 8, 128);
    c.fillStyle = 'rgba(230,200,150,.25)'; c.fillRect(0, 86, 128, 3); c.fillRect(86, 0, 3, 128);
    pl.tex.wrapS = pl.tex.wrapT = THREE.RepeatWrapping; pl.tex.repeat.set(2, 2); pl.tex.needsUpdate = true;
    const flannel = new THREE.MeshStandardMaterial({ map: pl.tex, roughness: 0.95 });
    p.root.remove(p.label);
    p.root.traverse((o) => { if (o.material === shirt) o.material = flannel; if (o.geometry === G.torso) o.scale.set(1.2, 1, 0.86); });
    for (const o of [...p.head.children]) if ([G.hairCap, G.hairLong, G.bun].includes(o.geometry)) p.head.remove(o);
    const add = (geo, m, x, y, z, parent = p.head) =>
      { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    add(G.hairCap, grey, 0, 0.004, -0.014).rotation.x = -0.42;   // receding a bit
    const tail = new THREE.Group(); tail.position.set(0, -0.01, -0.115); tail.rotation.x = 0.28; p.head.add(tail);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.025, 10), mat('#2a2522'), 0, -0.01, 0, tail);
    add(new THREE.CapsuleGeometry(0.026, 0.2, 4, 8), grey, 0, -0.13, -0.006, tail).scale.set(1, 1, 0.8);
    add(new THREE.SphereGeometry(0.08, 14, 10), grey, 0, -0.07, 0.055).scale.set(1, 0.72, 0.75);   // beard
    const frameM = mat('#1c1c1c', { roughness: 0.4, metalness: 0.4 });
    for (const s of [-1, 1]) {
      add(new THREE.TorusGeometry(0.026, 0.004, 6, 18), frameM, s * 0.042, 0.016, 0.112);
      add(new THREE.BoxGeometry(0.004, 0.004, 0.11), frameM, s * 0.07, 0.02, 0.06);
    }
    add(new THREE.BoxGeometry(0.03, 0.004, 0.004), frameM, 0, 0.02, 0.114);
    p.mug.children[0].material = mat('#2c4a73');
    p.waitStyle = () => 'lean';
    const base = p.targets.bind(p);
    p.mood = 'type';
    p.targets = (t) => {
      p.spot = { pose: p.mood === 'lean' ? 'wait' : 'type', rotY: Math.PI / 2 };
      const j = base(t);
      if (p.mood === 'sip') { p.mug.visible = true; Object.assign(j, { sh0: -1.1, el0: -2.1, shy0: 0, shz0: 0.12, headX: -0.1 }); }
      if (p.mood === 'read') Object.assign(j, { el0: -0.67, el1: -0.67, headX: 0.05 });
      return j;
    };
    p.root.traverse((o) => { o.userData = { action: 'john', reach: 3.5 }; });
    p.root.position.set(J.x - 0.64, 0, J.z); p.rotY = Math.PI / 2; p.root.rotation.y = p.rotY;
    parent.add(p.root);
    return p;
  }
  const lbl = (c, text, x, y, font, color, align = 'left') =>
    { c.font = font; c.fillStyle = color; c.textAlign = align; c.fillText(text, x, y); c.textAlign = 'left'; };
  {
    const SC = srv.scene = new THREE.Scene(), root = srv.root = new THREE.Group();
    SC.background = new THREE.Color('#0d1117');
    const H = SV.h;
    SC.environment = scene.environment; SC.environmentIntensity = 0.35;
    const key = new THREE.DirectionalLight('#e6efff', 0.8); key.position.set(-2, 14, 4); key.target.position.set(-6, 0, -1); root.add(key.target);
    SC.add(srv.hemi = new THREE.HemisphereLight('#dfe9ff', '#3a4250', 1.0), key, root);
    srv.look = { exposure: 1.0, hemi: 1.0, sky: new THREE.Color('#dfe9ff'), ground: new THREE.Color('#3a4250'), env: 0.35, bloom: 1.5, grade: 1,
      lights: [[key, 0.8]] };
    const R = rng(47);
    // A face of `w` x `h` at (x, y, z) facing rotY, textured from a canvas rect [px, py, pw, ph] of a W x H canvas.
    const quadGeo = (list, cw, ch) => {
      const pos = [], uv = [], idx = [];
      for (const [x, y, z, w, h, rotY, [px, py, pw, ph]] of list) {
        const rx = Math.cos(rotY) * w / 2, rz = -Math.sin(rotY) * w / 2, n = pos.length / 3;
        pos.push(x - rx, y - h / 2, z - rz, x + rx, y - h / 2, z + rz, x + rx, y + h / 2, z + rz, x - rx, y + h / 2, z - rz);
        const u0 = px / cw, u1 = (px + pw) / cw, v0 = 1 - (py + ph) / ch, v1 = 1 - py / ch;
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const quads = (list, material, cw, ch) => { const m = new THREE.Mesh(quadGeo(list, cw, ch), material); root.add(m); return m; };
    // Flat on the floor (or a ceiling, facing down), textures repeating every `tile` metres: one mesh for many rects.
    const flats = (list, material, tile, y = 0, down = false) => {
      const m = new THREE.Mesh(mergeGeometries(list.map(([x0, x1, z0, z1]) => {
        const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / tile, uv.getY(i) * (z1 - z0) / tile);
        return g.rotateX(down ? Math.PI / 2 : -Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      })), material);
      root.add(m); return m;
    };
    const sign = (w, h, x, y, z, rotY, ppm, draw, o = {}) => {
      const c = makeCanvas(Math.round(w * ppm), Math.round(h * ppm)); draw(c.ctx, c.W, c.H); c.tex.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        o.basic ? new THREE.MeshBasicMaterial({ map: c.tex }) : new THREE.MeshStandardMaterial({ map: c.tex, roughness: 0.6, ...o.mat }));
      m.position.set(x, y, z); m.rotation.y = rotY; root.add(m); return Object.assign(m, { c });
    };

    // Floors: raised-floor tiles (perforated in the cold aisles), anti-static vinyl in the vestibule; a dark open soffit.
    const tile = (perf) => {
      const t = makeCanvas(256, 256), c = t.ctx;
      c.fillStyle = '#b4b9c0'; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '50,55,60'},${R() * 0.06})`; c.fillRect(R() * 256, R() * 256, 2, 2); }
      if (perf) { c.fillStyle = '#23272c';
        for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { c.beginPath(); c.arc(20 + i * 14.4, 20 + j * 14.4, 4.2, 0, Math.PI * 2); c.fill(); } }
      c.strokeStyle = '#5e646c'; c.lineWidth = 6; c.strokeRect(0, 0, 256, 256);
      t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.needsUpdate = true; return t.tex;
    };
    flats([[SV.x0, SV.x1, SV.z0, SV.z1]], new THREE.MeshStandardMaterial({ map: tile(false), roughness: 0.55, metalness: 0.1 }), 0.6);
    flats(AISLES.flatMap((z) => BLOCKS.map((B) => [B.x0, B.x1, z - 0.6, z + 0.6])),
      new THREE.MeshStandardMaterial({ map: tile(true), roughness: 0.5, metalness: 0.15 }), 0.6, 0.003);
    flats([[SV.x1, LIFT.x, -SV.vz, SV.vz]], mat('#3b3f45', { roughness: 0.7 }), 1, 0.001);
    flats([[SV.x0, SV.x1, SV.z0, SV.z1]], mat('#1b1f25', { roughness: 0.9 }), 1, H, true);
    flats([[SV.x1, LIFT.x, -SV.vz, SV.vz]], mat('#20242a', { roughness: 0.9 }), 1, ROOM.h, true);

    // Walls: the hall's four, the vestibule's two, and the partition between them with the access door's opening at z = 0.
    const wallC = '#c4c8ce', sk = '#2b2f35', t = 0.12, walls = [], DW = SV.dw, DH = SV.dh;   // DW: half the door opening
    const wall = (x0, x1, z0, z1, h = H) => walls.push([x1 - x0 || t, h, z1 - z0 || t, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, wallC]);
    wall(SV.x0 - t, SV.x0 - t, SV.z0, SV.z1); wall(SV.x0, SV.x1, SV.z0 - t / 2, SV.z0 - t / 2); wall(SV.x0, SV.x1, SV.z1 + t / 2, SV.z1 + t / 2);
    wall(SV.x1, SV.x1, SV.z0, -DW); wall(SV.x1, SV.x1, DW, SV.z1);
    walls.push([t, H - DH, DW * 2, SV.x1, (H + DH) / 2, 0, wallC]);
    wall(SV.x1, LIFT.x, -SV.vz - t / 2, -SV.vz - t / 2, ROOM.h); wall(SV.x1, LIFT.x, SV.vz + t / 2, SV.vz + t / 2, ROOM.h);
    for (const s of [-1, 1]) walls.push([0.1, ROOM.h, SV.vz - CAR.w / 2 - 0.3, LIFT.x + 0.05, ROOM.h / 2, s * (SV.vz + CAR.w / 2 + 0.3) / 2, '#77716a']);
    for (const [x0, x1, z] of [[SV.x0, SV.x1, SV.z0 + 0.01], [SV.x0, SV.x1, SV.z1 - 0.01], [SV.x1 + 0.07, LIFT.x, -SV.vz + 0.01],
      [SV.x1 + 0.07, LIFT.x, SV.vz - 0.01]]) walls.push([x1 - x0, 0.1, 0.02, (x0 + x1) / 2, 0.05, z, sk]);
    for (const [z0, z1] of [[SV.z0, -DW], [DW, SV.z1]]) walls.push([0.02, 0.1, z1 - z0, SV.x1 - 0.07, 0.05, (z0 + z1) / 2, sk]);
    walls.push([0.02, 0.1, SV.z1 - SV.z0, SV.x0 + 0.01, 0.05, 0, sk]);
    root.add(mergedBoxes(walls, mat('#ffffff', { vertexColors: true, roughness: 0.85 })));
    srv.fixed.push({ minX: SV.x1 - 0.08, maxX: SV.x1 + 0.08, minZ: SV.z0, maxZ: -DW + 0.08 },
      { minX: SV.x1 - 0.08, maxX: SV.x1 + 0.08, minZ: DW - 0.08, maxZ: SV.z1 });

    // Light: long cold-white LED battens over every aisle, and round the walls (emissive only; the bloom does the rest).
    const battens = [];
    for (const k of PODS) for (const B of BLOCKS) for (const dz of [0, POD / 2]) battens.push([B.x1 - B.x0, 0.05, 0.14, (B.x0 + B.x1) / 2, H - 0.04,
      k * POD + dz]);
    for (const B of BLOCKS) battens.push([B.x1 - B.x0, 0.05, 0.14, (B.x0 + B.x1) / 2, H - 0.04, -3 * POD - POD / 2]);
    for (let z = -16; z <= 16; z += 4) battens.push([0.14, 0.05, 2.4, 4.7, H - 0.04, z], [0.14, 0.05, 2.4, -18.5, H - 0.04, z]);
    battens.push([2.4, 0.05, 0.14, (SV.x1 + LIFT.x) / 2, ROOM.h - 0.03, 0]);
    root.add(mergedBoxes(battens, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e4efff', emissiveIntensity: 2.2 })));

    // The rack face atlas: generic servers (1U, 2U with 12 or 24 bays, 4U, a switch, a patch panel, blanking) and rears.
    const FA = makeCanvas(512, 768), fc = FA.ctx;
    const DES = { '1U': [0, 52], blank: [52, 52], sw: [104, 52], patch: [156, 52], '2U12': [208, 104], '2U24': [312, 104], '4U': [416, 208], rear: [624, 104] };
    const bez = (y, h, col) =>
      { fc.fillStyle = col; fc.fillRect(0, y, 512, h); fc.fillStyle = 'rgba(255,255,255,.08)'; fc.fillRect(0, y, 512, 2); fc.fillStyle = 'rgba(0,0,0,.5)';
      fc.fillRect(0, y + h - 2, 512, 2); };
    const vents = (x0, y0, w, h, step = 6) =>
      { fc.fillStyle = '#0b0c0e'; for (let x = x0; x < x0 + w; x += step) for (let y = y0; y < y0 + h; y += step) fc.fillRect(x, y, step - 2, step - 2); };
    bez(0, 52, '#2a2d32'); vents(20, 10, 300, 32); fc.fillStyle = '#c8ccd2'; fc.fillRect(340, 18, 60, 14);
    lbl(fc, 'R640', 344, 30, `600 11px ${FONT}`, '#2a2d32');
    bez(52, 52, '#1b1d20'); for (let x = 24; x < 490; x += 18) { fc.fillStyle = '#111214'; fc.fillRect(x, 66, 10, 24); }
    bez(104, 52, '#24272b');
    for (let i = 0; i < 24; i++) for (let j = 0; j < 2; j++) { fc.fillStyle = '#0a0b0c'; fc.fillRect(40 + i * 17, 110 + j * 21, 13, 14); }
    bez(156, 52, '#1d1f22');
    for (let i = 0; i < 24; i++) { fc.fillStyle = '#e8e8e8'; fc.fillRect(40 + i * 17, 168, 13, 11);
      fc.fillStyle = ['#2a6fd6', '#e3c23a', '#d9534f', '#3a3d42'][i % 7 % 4]; fc.fillRect(42 + i * 17, 182, 9, 10); }
    bez(208, 104, '#2b2e33');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { fc.fillStyle = '#16181b'; fc.fillRect(30 + i * 100, 216 + j * 30, 92, 26);
      fc.fillStyle = '#3a3e44'; fc.fillRect(34 + i * 100, 220 + j * 30, 60, 18); }
    bez(312, 104, '#2b2e33');
    for (let i = 0; i < 24; i++) { fc.fillStyle = '#16181b'; fc.fillRect(24 + i * 18, 320, 15, 88); fc.fillStyle = '#4a4e55';
      fc.fillRect(26 + i * 18, 324, 11, 6); }
    bez(416, 208, '#2a2c30'); vents(24, 432, 380, 120, 8); fc.fillStyle = '#d97757'; fc.fillRect(24, 570, 70, 22);
    lbl(fc, 'STORAGE', 100, 587, `600 15px ${FONT}`, '#9aa0a8');
    bez(624, 104, '#18191c');
    for (let i = 0; i < 2; i++) { fc.fillStyle = '#2c2f34'; fc.fillRect(20 + i * 90, 634, 80, 84); vents(28 + i * 90, 642, 64, 50, 6); }
    for (let i = 0; i < 9; i++) { fc.strokeStyle = ['#2a6fd6', '#e3c23a', '#2a6fd6', '#7a7f87', '#d9534f'][i % 5]; fc.lineWidth = 5; fc.beginPath();
      fc.moveTo(220 + i * 30, 640); fc.bezierCurveTo(230 + i * 30, 700, 300 + i * 18, 690, 330 + i * 18, 728); fc.stroke(); }
    FA.tex.needsUpdate = true;
    const faceM = new THREE.MeshStandardMaterial({ map: FA.tex, roughness: 0.55, metalness: 0.35 });

    // LEDs: one InstancedMesh; `leds` holds every one's position and how to colour it (`dyn`: those that change).
    const leds = [], dyn = [], C = (r, g, b, k = 1) => new THREE.Color(r * k, g * k, b * k);
    const LED = { g: C(0.15, 1, 0.3, 3), b: C(0.2, 0.5, 1, 3.2), a: C(1, 0.55, 0.05, 3), r: C(1, 0.08, 0.05, 3), w: C(0.9, 0.95, 1, 2.6),
      off: C(0.03, 0.035, 0.04) };
    // `ry`: which way it faces (0: +z). `sink`: a rack template's own list (see the racks below) instead of the room's.
    const led = (x, y, z, col, fn, ry = 0, sink) =>
      { const o = { x, y, z, col, fn, ry }; if (sink) sink.push(o); else { leds.push(o); if (fn) dyn.push(o); } return o; };
    // Where a pixel of a face lands: face centre (x, y, z), facing f (+1: +z), w x h metres for a pw x ph pixel rect.
    const at = (x, y, z, f, w, h, pw, ph, sink) => (px, py, cb) =>
      led(x + f * (px / pw - 0.5) * w, y + (0.5 - py / ph) * h, z + f * 0.004, cb[0], cb[1], f > 0 ? 0 : Math.PI, sink);
    const blinky = (duty, col) => [LED.off, (o) => (Math.random() < duty ? col : LED.off)];
    const faces = [], rears = [], bodies = [], doors = [], tags = [];
    const unitY = (u, n) => RK.base + (u - 1 + n / 2) * RK.U;
    const face = (rx, row, u, d, T) => {   // T: a rack template ({ faces, leds }), built about x = z = 0 facing +z
      const [py, ph] = DES[d], n = Math.round(ph / 52), y = unitY(u, n), z = row.z + row.f * (RK.d / 2 - 0.03), h = n * RK.U - 0.002;
      (T?.faces || faces).push([rx, y, z, RK.fw, h, row.f > 0 ? 0 : Math.PI, [0, py, 512, ph]]);
      const p = at(rx, y, z, row.f, RK.fw, h, 512, ph, T?.leds), act = 0.04 + R() * 0.5, col = R() < 0.8 ? LED.g : LED.b;
      if (d === '1U') { p(470, 26, [LED.g]); p(486, 26, blinky(act, col)); }
      if (d === '2U12') { for (let i = 0; i < 4; i++) p(104 + i * 100, 230 - py, R() < 0.85 ? blinky(act * 0.6, LED.g) : [LED.off]); p(486, 20, [LED.b]); }
      if (d === '2U24') { for (let i = 0; i < 24; i += 4) p(31 + i * 18, 404 - py, blinky(act * 0.5, LED.g)); p(486, 20, [LED.g]); }
      if (d === '4U') { p(470, 60, [LED.g]); p(486, 60, blinky(act, LED.a)); }
      if (d === 'sw') for (let i = 0; i < 24; i += T ? 2 : 1) p(46 + i * 17, 26, R() < 0.75 ? blinky(0.15 + R() * 0.5, LED.g) : [LED.off]);
      return n;
    };
    // The racks: steel frames, the faces (generic servers, except the live racks filled in below), rears, mesh doors, tags.
    const meshTex = (() => {
      const t = makeCanvas(64, 64), c = t.ctx;
      c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#000';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(8 + i * 16 + (j % 2) * 8, 8 + j * 16, 6, 0, Math.PI * 2); c.fill(); }
      t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(14, 46); t.tex.colorSpace = THREE.NoColorSpace; t.tex.needsUpdate = true; return t.tex;
    })();
    // Every rack's frame and rear is one InstancedMesh each; a generic rack's front (servers, mesh door) is one of a few
    // templates, each its own InstancedMesh, and its LEDs are copied into the room's at its place. The live racks
    // (A01-A03, B01-B03) have no door and get their own faces below.
    const live = new Set(['A0', 'A1', 'A2', 'B0', 'B1', 'B2']), O = { z: 0, f: 1 }, fz0 = RK.d / 2;
    bodies.push([0.02, RK.h, RK.d, -RK.w / 2 + 0.01, RK.h / 2, 0, '#15171a'], [0.02, RK.h, RK.d, RK.w / 2 - 0.01, RK.h / 2, 0, '#15171a'],
      [RK.w, 0.04, RK.d, 0, RK.h - 0.02, 0, '#15171a'], [RK.w, RK.base, RK.d, 0, RK.base / 2, 0, '#0c0d0f'],
        [RK.w - 0.04, RK.h - 0.12, 0.01, 0, RK.h / 2, 0, '#0f1012']);
    for (const s of [-1, 1]) bodies.push([0.016, RK.h - 0.12, 0.012, s * 0.232, RK.h / 2, fz0 - 0.035, '#9ca2aa']);   // front rails
    for (let u = 1; u <= 42; u += 2) rears.push([0, unitY(u, 2), -(RK.d / 2 - 0.03), RK.fw, 2 * RK.U - 0.002, Math.PI, [0, 624, 512, 104]]);
    doors.push([0, RK.h / 2 + 0.03, fz0 + 0.01, RK.w - 0.03, RK.h - 0.1, 0, [0, 0, 64, 64]]);
    const TPL = [...Array(8)].map((_, k) => {
      const T = { faces: [], leds: [], at: [] }, empty = k >= 6 ? 14 + k * 3 : 43;   // two half-empty ones
      face(0, O, 42, R() < 0.7 ? 'sw' : 'patch', T);
      for (let u = 1; u < 42;) {
        if (u >= empty) { face(0, O, u, 'blank', T); u++; continue; }
        const r = R(), d = u <= 38 && r < 0.08 ? '4U' : u <= 40 && r < 0.34 ? '2U12' : u <= 40 && r < 0.48 ? '2U24' : r < 0.86 ? '1U' : 'blank';
        u += face(0, O, u, d, T);
      }
      return T;
    });
    srv.racks = []; srv.ledGroups = [];
    const rackM = new THREE.Matrix4(), place = [];
    for (const row of ROWS) for (const B of BLOCKS) for (let i = 0; i < B.n; i++) {
      const x = B.x(i), z = row.z, f = row.f, name = `${row.id}${String(B.first + i).padStart(2, '0')}`, ry = f > 0 ? 0 : Math.PI;
      const r = { name, x, z, f, ry, live: B.n === 10 && live.has(row.id + i) };
      if (!r.live) r.tpl = Math.floor(R() * TPL.length), TPL[r.tpl].at.push(r);
      tags.push({ name, x, z: z + f * fz0, f });
      srv.racks.push(r); place.push(r);
    }
    const inst = (geo, material, list) => {
      const m = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((r, i) => m.setMatrixAt(i, rackM.makeRotationY(r.ry).setPosition(r.x, 0, r.z)));
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); root.add(m); return m;
    };
    srv.body = inst(mergedBoxes(bodies, null).geometry, mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.5 }), place);
    srv.rear = inst(quadGeo(rears, 512, 768), faceM, place);
    const doorM = new THREE.MeshStandardMaterial({ color: '#1a1c20', metalness: 0.6, roughness: 0.45, alphaMap: meshTex, transparent: true, opacity: 0.92,
      side: THREE.DoubleSide, depthWrite: false });
    inst(quadGeo(doors, 64, 64), doorM, place.filter((r) => !r.live));
    for (const T of TPL) if (T.at.length) inst(quadGeo(T.faces, 512, 768), faceM, T.at);
    for (const B of BLOCKS) for (const row of ROWS) srv.fixed.push({ minX: B.x0, maxX: B.x1, minZ: row.z - RK.d / 2, maxZ: row.z + RK.d / 2 });
    {   // rack tags over each front, from one canvas
      const T = makeCanvas(512, 2048), c = T.ctx;
      tags.forEach((g, i) =>
        { const px = (i % 8) * 64, py = Math.floor(i / 8) * 32; c.fillStyle = '#e9ecef'; c.fillRect(px + 2, py + 2, 60, 28);
        lbl(c, g.name, px + 32, py + 23, `700 19px ${MONO}`, '#14161a', 'center'); });
      T.tex.needsUpdate = true;
      quads(tags.map((g, i) => [g.x, RK.h - 0.06, g.z + g.f * 0.012, 0.12, 0.06, g.f > 0 ? 0 : Math.PI, [(i % 8) * 64, Math.floor(i / 8) * 32, 64, 32]]),
        new THREE.MeshStandardMaterial({ map: T.tex, roughness: 0.6 }), 512, 2048);
    }

    // The live racks' faces: an atlas per kind, self-lit a little (LCDs, backlit plates), repainted a couple of times a second.
    const atlas = (w, h) =>
      { const a = makeCanvas(w, h);
      return { a,
      m: new THREE.MeshStandardMaterial({ map: a.tex, emissiveMap: a.tex, emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.3 }) }; };
    // Sessions: 18 x 2U per rack in A01-A03, top down; a cell of 340 x 70 px each.
    const SA = srv.sa = atlas(1020, 1260), slotFaces = [];
    for (let k = 0; k < SLOTS; k++) {
      const r = Math.floor(k / 18), j = k % 18, row = ROWS[0], x = RACKX(r), u = 37 - j * 2, y = unitY(u, 2), z = row.z + RK.d / 2 - 0.03, h = 2 * RK.U - 0.002;
      const cell = [(k % 3) * 340, Math.floor(k / 3) * 70, 340, 70];
      slotFaces.push([x, y, z, RK.fw, h, 0, cell]);
      const p = at(x, y, z, 1, RK.fw, h, 340, 70), s = { k, cell, sid: null, state: 'empty', since: 0, dirty: true };
      s.hit = hitBox(root, RK.fw, h, 0.03, x, y, z + 0.01, { screen: true, reach: 4 });
      const on = () => s.state === 'live' || s.state === 'boot';
      p(326, 16, [LED.off, () => (on() ? LED.b : LED.off)]);
      p(326, 35, [LED.off, (o, t) => {   // activity: busy with work, a slow blink idle, off when down
        if (!on()) return LED.off;
        const ss = s.sess;
        if (s.state === 'boot') return (t * 8 + k) % 2 < 1 ? LED.a : LED.off;
        if (ss?.status === 'working') return Math.random() < 0.35 + 0.6 * Math.min(1, (ss.proc?.cpu || 0) / 80) ? LED.g : LED.off;
        return (t + k * 0.37) % 2.5 < 0.12 ? LED.g : LED.off;
      }]);
      p(326, 54, [LED.off,
        (o, t) => !on() ? LED.off : s.sess?.status === 'working' || s.state === 'boot' ? LED.g : s.sess?.status === 'idle' ? C(0.15, 1, 0.3, 1.2) :
        (t % 1 < 0.5 ? LED.a : LED.off)]);
      for (let b = 0; b < 4;
        b++) p(272 + b * 13, 62,
        [LED.off, () => (on() && s.sess?.status === 'working' && Math.random() < 0.25 + 0.5 * Math.min(1, (s.sess?.proc?.cpu || 0) / 100) ? LED.g : LED.off)]);
      srv.slots.push(s);
    }
    quads(slotFaces, SA.m, 1020, 1260);
    for (let r = 0; r < 3;
      r++) for (const [u, d] of [[42, 'sw'], [41, 'patch'], [40, 'blank'], [39, 'blank'], [2, 'blank'], [1, 'blank']]) face(RACKX(r), ROWS[0], u, d);

    // The machine: CPU, memory, load and the top processes in B01; a disk array per volume and the UPS in B02; switches in B03.
    const IA = srv.ia = atlas(1024, 1024), infraFaces = [], cols = [0, 0];
    const lit = (k, n) => (k / n < 0.6 ? LED.g : k / n < 0.85 ? LED.a : LED.r);
    srv.units = [];
    const unit = (r, u, n, title, paint, ledsFn, info) => {
      const row = ROWS[1], x = RACKX(r), y = unitY(u, n), z = row.z - RK.d / 2 + 0.03, h = n * RK.U - 0.002, ph = n * 44, col = cols[0] <= cols[1] ? 0 : 1;
      const cell = [col * 512, cols[col], 512, ph]; cols[col] += ph;
      infraFaces.push([x, y, z, RK.fw, h, Math.PI, cell]);
      const p = at(x, y, z, -1, RK.fw, h, 512, ph), U = { title, cell, paint, info };
      ledsFn?.((px, py, fn) => p(px, py, [LED.off, fn]));
      U.hit = hitBox(root, RK.fw, h, 0.03, x, y, z - 0.01, { action: 'info', reach: 4, info: () => `<b>${title}</b><div class="m">${info?.() || ''}</div>` });
      srv.units.push(U);
    };
    const m = () => srv.m, cores = () => m()?.cores || [];
    const NC = Math.max(1, navigator.hardwareConcurrency || 8);
    unit(0, 36, 6, 'Compute', (c, W, H) => {
      const cs = cores();
      lbl(c, (m()?.hostname || 'this machine').toUpperCase(), 14, 30, `700 20px ${MONO}`, '#e8eef6');
      lbl(c, fit(c, m()?.cpuModel || '', 200), 14, 52, `400 13px ${FONT}`, '#8a93a0');
      lbl(c, `CPU ${Math.round(cs.reduce((a, b) => a + b, 0) / (cs.length || 1))}%`, 14, 92, `700 26px ${MONO}`, '#5dff9b');
      lbl(c, `${cs.length || NC} cores`, 14, 116, `400 13px ${FONT}`, '#8a93a0');
    }, (p) => { for (let i = 0; i < Math.min(16, NC); i++) for (let j = 0; j < 12;
      j++) p(240 + i * 16, 250 - j * 19, () => ((cores()[i] || 0) > (j + 0.5) * 100 / 12 ? lit(j, 12) : LED.off)); },
    () => `${cores().length} cores · ${cores().map((v) => v + '%').join(' ')}`);
    const mem = () => (m()?.mem ? m().mem.used / m().mem.total : 0), GB = (b) => (b / 2 ** 30).toFixed(1);
    unit(0, 32, 3, 'Memory', (c) => {
      lbl(c, 'MEMORY', 14, 30, `700 18px ${MONO}`, '#e8eef6');
      if (m()?.mem) lbl(c, `${GB(m().mem.used)} / ${GB(m().mem.total)} GB · ${Math.round(mem() * 100)}%`, 14, 58, `600 15px ${MONO}`, '#5dff9b');
      for (let i = 0; i < 16; i++) { c.fillStyle = '#16191d'; c.fillRect(240 + i * 16, 10, 12, 100); c.fillStyle = '#2d6b3c';
        c.fillRect(242 + i * 16, 14, 8, 86); }
    }, (p) => { for (let i = 0; i < 30; i++) p(14 + i * 7.6, 112, () => (mem() > (i + 0.5) / 30 ? lit(i, 30) : LED.off)); },
      () => m()?.mem ? `${GB(m().mem.used)} of ${GB(m().mem.total)} GB in use` : '');
    unit(0, 28, 3, 'Load', (c) => {
      lbl(c, 'LOAD', 14, 30, `700 18px ${MONO}`, '#e8eef6');
      (m()?.load || []).forEach((v, i) => lbl(c, `${['1m', '5m', '15m'][i]} ${v.toFixed(2)}`, 14 + i * 150, 60, `600 15px ${MONO}`, '#5dff9b'));
    }, (p) => { for (let r = 0; r < 3; r++) for (let i = 0; i < 40;
      i++) p(14 + i * 12, 80 + r * 14, () => ((m()?.load?.[r] || 0) / NC > (i + 0.5) / 40 * 1.5 ? lit(i, 40) : LED.off)); },
    () => `load ${(m()?.load || []).map((v) => v.toFixed(2)).join(' · ')} on ${NC} cores`);
    unit(0, 14, 12, 'Top processes', (c, W, H) => {
      c.fillStyle = '#04100a'; c.fillRect(12, 12, W - 24, H - 24);
      lbl(c, 'PID     CPU%    RSS   COMMAND', 24, 42, `600 17px ${MONO}`, '#3fbf74');
      (m()?.top || []).slice(0,
        8).forEach((q, i) =>
        lbl(c, `${String(q.pid).padEnd(7)} ${q.cpu.toFixed(1).padStart(5)} ${String(q.rssMB).padStart(5)}M  ${q.name}`.slice(0, 44), 24, 80 + i * 52,
        `500 17px ${MONO}`, q.cpu > 50 ? '#ffb347' : '#5dff9b'));
    }, null, () => (m()?.top || []).slice(0, 5).map((q) => `${escapeHtml(q.name)} ${q.cpu.toFixed(0)}%`).join(' · '));
    const disk = (v) => m()?.disks?.[v];
    for (let v = 0; v < 6; v++) unit(1, 37 - v * 3, 2, `Disk array ${v + 1}`, (c) => {
      const d = disk(v);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { c.fillStyle = '#16181b'; c.fillRect(200 + i * 50, 8 + j * 38, 46, 34);
        c.fillStyle = d ? '#3a3e44' : '#22252a'; c.fillRect(204 + i * 50, 12 + j * 38, 30, 26); }
      lbl(c, d ? fit(c, d.mount, 170) : 'NO VOLUME', 12, 30, `700 15px ${MONO}`, d ? '#e8eef6' : '#5a6068');
      if (d) lbl(c, `${GB(d.used)}/${GB(d.size)} GB`, 12, 58, `500 13px ${MONO}`, '#8ab4ff');
      if (d) lbl(c, `${Math.round(d.used / d.size * 100)}%`, 12, 80, `700 15px ${MONO}`, d.used / d.size > 0.85 ? '#ff6b5b' : '#5dff9b');
    }, (p) => { for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { const b = j * 6 + i;
      p(240 + i * 50, 16 + j * 38,
      () => { const d = disk(v); return !d ? LED.off : b < Math.ceil(d.used / d.size * 12) ? (Math.random() < 0.06 ? LED.w : LED.b) : C(0.1, 0.25, 0.5, 0.4);
      }); } },
    () => { const d = disk(v); return d ? `${escapeHtml(d.mount)} · ${GB(d.used)} of ${GB(d.size)} GB used (${escapeHtml(d.dev)})` : 'Empty bay: no volume'; });
    const batt = () => m()?.battery;
    unit(1, 3, 3, 'UPS', (c) => {
      lbl(c, 'UPS', 14, 30, `700 18px ${MONO}`, '#e8eef6');
      const b = batt();
      lbl(c, b ? `${b.pct}% · ${b.ac ? 'ON MAINS' : 'ON BATTERY'}` : 'MAINS · NO BATTERY', 14, 60, `600 15px ${MONO}`, b && !b.ac ? '#ffb347' : '#5dff9b');
      if (m()) lbl(c, `UP ${F.dur(m().uptime * 1000)}`, 14, 90, `500 14px ${MONO}`, '#8a93a0');
    }, (p) => { for (let i = 0; i < 20; i++) p(260 + i * 11, 40, () => ((batt()?.pct ?? 100) > (i + 0.5) * 5 ? lit(19 - i, 20) : LED.off));
      p(260, 90, () => (batt()?.ac === false ? LED.a : LED.g)); },
    () => (batt() ? `Battery ${batt().pct}% · ${escapeHtml(batt().state)}` : 'On mains') + (m() ? ` · up ${F.dur(m().uptime * 1000)}` : ''));
    const rate = (b) => (b > 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MB/s` : `${(b / 1024).toFixed(0)} KB/s`),
      traffic = () => (m()?.net ? m().net.rx + m().net.tx : 0);
    for (const [u, k] of [[38, 0], [36, 1]]) unit(2, u, 1, `Switch ${k + 1}`, (c) => {
      for (let i = 0; i < 24; i++) for (let j = 0; j < 1; j++) { c.fillStyle = '#0a0b0c'; c.fillRect(96 + i * 17, 10, 13, 16); }
      lbl(c, `SW${k + 1}`, 12, 28, `700 15px ${MONO}`, '#e8eef6');
    }, (p) => { for (let i = 0; i < 24; i++) { const up = i < 18 - k * 6;
      p(102 + i * 17, 34, () => (!up ? LED.off : Math.random() < Math.min(0.9, 0.05 + Math.log10(1 + traffic() / 2048) * 0.22) ? LED.a : LED.g)); } },
    () => (m()?.net ? `↓ ${rate(m().net.rx)} · ↑ ${rate(m().net.tx)}` : ''));
    unit(2, 31, 2, 'Uplink', (c) => {
      lbl(c, 'UPLINK', 14, 30, `700 18px ${MONO}`, '#e8eef6');
      if (m()?.net) { lbl(c, `↓ ${rate(m().net.rx)}`, 14, 62, `600 15px ${MONO}`, '#8ab4ff');
        lbl(c, `↑ ${rate(m().net.tx)}`, 200, 62, `600 15px ${MONO}`, '#5dff9b'); }
    }, (p) => { p(470, 30, () => LED.g); p(486, 30, () => (Math.random() < 0.2 + Math.min(0.7, traffic() / 2 ** 20) ? LED.a : LED.off)); },
      () => (m()?.net ? `↓ ${rate(m().net.rx)} · ↑ ${rate(m().net.tx)}` : ''));
    quads(infraFaces, IA.m, 1024, 1024);
    {   // the rest of the machine racks: patch panels and blanking
      const used = new Map([[0, [[36, 6], [32, 3], [28, 3], [14, 12]]], [1, [...Array(6)].map((_, v) => [37 - v * 3, 2]).concat([[3, 3]])],
        [2, [[38, 1], [36, 1], [31, 2]]]]);
      for (const [r, list] of used) for (let u = 1; u <= 42;
        u++) if (!list.some(([a, n]) => u >= a && u < a + n)) face(RACKX(r), ROWS[1], u, r === 2 && u % 4 === 1 ? 'patch' : 'blank');
    }
    quads(faces, faceM, 512, 768);   // the live racks' switches, patch panels and blanking

    // Containment: a glass roof over every cold aisle and sliding glass doors at both ends, opening as you come (instanced
    // leaves, only the doors near you move). A sign over each end.
    const glassM = new THREE.MeshStandardMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false,
      side: THREE.DoubleSide });
    const aluM = mat('#aab0b8', { metalness: 0.8, roughness: 0.3 }), alu = [], roofs = [], aisleSigns = [];
    const AS = makeCanvas(512, 512);
    PODS.forEach((k, pi) => {
      const z = k * POD, nm = `${ROWS[pi * 2].id}/${ROWS[pi * 2 + 1].id}`;
      { const c = AS.ctx, px = (pi % 2) * 256, py = Math.floor(pi / 2) * 64; c.fillStyle = '#1f5fbf'; c.fillRect(px, py, 256, 64);
        lbl(c, `COLD AISLE ${nm}`, px + 128, py + 44, `700 30px ${FONT}`, '#fff', 'center'); }
      for (const B of BLOCKS) {
        const x0 = B.x0 - 0.3, x1 = B.x1 + 0.3;
        roofs.push([x0, x1, z - 0.6, z + 0.6]);
        for (const s of [-1, 1]) alu.push([x1 - x0, 0.05, 0.04, (x0 + x1) / 2, RK.h + 0.05, z + s * 0.6]);
        for (const x of [x0, x1]) {
          alu.push([0.06, 0.12, 1.3, x, RK.h + 0.02, z]);
          for (const s of [-1, 1]) alu.push([0.06, RK.h, 0.05, x, RK.h / 2, z + s * 0.65]);
          const out = x === x1 ? 1 : -1;
          aisleSigns.push([x + out * 0.035, 1.75, z, 0.5, 0.125, out > 0 ? Math.PI / 2 : -Math.PI / 2, [(pi % 2) * 256, Math.floor(pi / 2) * 64, 256, 64]]);
          srv.aisleDoors.push({ x, z, k: 0, e: -1 });
        }
      }
    });
    AS.tex.needsUpdate = true;
    quads(aisleSigns, new THREE.MeshBasicMaterial({ map: AS.tex }), 512, 512);
    flats(roofs, glassM, 1, RK.h + 0.05).castShadow = false;
    root.add(mergedBoxes(alu, aluM));
    {   // the leaves: two per door, a glass pane and its aluminium frame
      const n = srv.aisleDoors.length * 2;
      srv.leafGlass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, RK.h - 0.06, 0.6), glassM, n);
      srv.leafFrame = new THREE.InstancedMesh(mergedBoxes([[0.03, 0.04, 0.6, 0, (RK.h - 0.06) / 2, 0], [0.03, 0.04, 0.6, 0, -(RK.h - 0.06) / 2, 0],
        [0.03, RK.h - 0.06, 0.03, 0, 0, 0.285], [0.03, RK.h - 0.06, 0.03, 0, 0, -0.285]], null).geometry, aluM, n);
      root.add(srv.leafGlass, srv.leafFrame);
    }

    // Overhead, on threaded rods from the soffit: a wire-basket tray over every row (data, with bundles and drops into the
    // racks), a ladder rack over every hot aisle (power), cross ladder racks along the cross aisle and the far end, and
    // the red suppression pipework at the top.
    const tray = [], cable = [], pipe = [], rods = [];
    const ladder = (x0, x1, z0, z1, y, list) => {   // along x if x1 - x0 > z1 - z0
      const alongX = x1 - x0 > z1 - z0, w = alongX ? z1 - z0 : x1 - x0, len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (const s of [-1, 1]) list.push(alongX ? [len, 0.08, 0.02, cx, y, cz + s * w / 2] : [0.02, 0.08, len, cx + s * w / 2, y, cz]);
      for (let a = 0.15; a < len; a += 0.3) list.push(alongX ? [0.025, 0.02, w, x0 + a, y - 0.03, cz] : [w, 0.02, 0.025, cx, y - 0.03, z0 + a]);
      for (let a = 0.6; a < len;
        a += 1.8) for (const s of [-1, 1]) rods.push(alongX ? [0.012, H - y, 0.012, x0 + a, (H + y) / 2, cz + s * w / 2] :
        [0.012, H - y, 0.012, cx + s * w / 2, (H + y) / 2, z0 + a]);
    };
    for (const row of ROWS) for (const B of BLOCKS) {
      const z = row.z, y = 2.45, xa = B.x0 - 0.2, xb = B.x1 + 0.2;
      for (const s of [-1, 1]) tray.push([xb - xa, 0.05, 0.012, (xa + xb) / 2, y, z + s * 0.15]);
      for (let x = xa; x < xb; x += 0.2) tray.push([0.008, 0.008, 0.3, x, y - 0.025, z]);
      for (let x = xa + 0.6; x < xb; x += 1.8) rods.push([0.012, H - y, 0.012, x, (H + y) / 2, z - 0.15], [0.012, H - y, 0.012, x, (H + y) / 2, z + 0.15]);
      [['#2a6fd6', -0.08], ['#e3c23a', 0],
        ['#7a7f87', 0.08]].forEach(([col, dz], i) => cable.push([xb - xa, 0.035 + i * 0.01, 0.07, (xa + xb) / 2, y + 0.02, z + dz, col]));
      for (let i = 0; i < B.n; i += 2) cable.push([0.05, y - RK.h, 0.05, B.x(i), (y + RK.h) / 2, z - row.f * 0.3, i % 4 ? '#e3c23a' : '#2a6fd6']);
    }
    for (const k of [...PODS, -4]) for (const B of BLOCKS) {
      const z = k * POD + POD / 2;
      if (k === -4 || k === 3) continue;
      ladder(B.x0 - 0.2, B.x1 + 0.2, z - 0.25, z + 0.25, 3.0, tray);
      for (const [col, dz] of [['#1a1a1a', -0.1], ['#b3261e', 0.02], ['#1a1a1a', 0.12]]) cable.push([B.x1 - B.x0 + 0.3, 0.04, 0.06, (B.x0 + B.x1) / 2, 3.03,
        z + dz, col]);
    }
    ladder(4.45, 4.95, -17, 17, 3.5, tray); ladder(-13.25, -12.75, -17, 17, 3.5, tray);
    for (const x of [4.7, -13]) for (const [col, dx] of [['#2a6fd6', -0.1], ['#e3c23a', 0.05]]) cable.push([0.07, 0.05, 33.6, x + dx, 3.53, 0, col]);
    for (const z of [-POD * 2 - 2.27, -2.27, POD * 2 - 2.27, POD * 2 + 2.27]) {
      pipe.push([SV.x1 - SV.x0 - 0.4, 0.06, 0.06, (SV.x0 + SV.x1) / 2, H - 0.3, z]);
      for (let x = SV.x0 + 1.5; x < SV.x1; x += 3) pipe.push([0.03, 0.14, 0.03, x, H - 0.4, z], [0.08, 0.03, 0.08, x, H - 0.48, z]);
    }
    pipe.push([0.06, 0.06, SV.z1 - SV.z0 - 1, SV.x1 - 0.4, H - 0.3, 0]);
    root.add(mergedBoxes(tray, mat('#b8bec6', { metalness: 0.85, roughness: 0.35 })), mergedBoxes(rods, mat('#7d838b', { metalness: 0.8, roughness: 0.4 })),
      mergedBoxes(cable, mat('#ffffff', { vertexColors: true, roughness: 0.7 })), mergedBoxes(pipe, mat('#b3261e', { roughness: 0.45, metalness: 0.2 })));

    // CRACs along both long walls, facing into the hot aisles' ends: cream cabinets, grilles, one shared display texture
    // (return air follows the CPU); each says its name on hover.
    srv.cracs = [];
    const crac = [], grilles = [], screens = [];
    const GR = makeCanvas(256, 128); GR.ctx.fillStyle = '#26282b'; GR.ctx.fillRect(0, 0, 256, 128); GR.ctx.fillStyle = '#121315';
    for (let y = 4; y < 128; y += 9) GR.ctx.fillRect(4, y, 248, 5); GR.tex.needsUpdate = true;
    let ci = 0;
    for (const side of [-1, 1]) for (const x of [11.4, 6.6, 0.8, -4.8, -10.4]) {
      if (side > 0 && x < -9) continue;   // the NOC office is there
      const z = side * (SV.z1 - 0.45), nm = `CRAC-${String(++ci).padStart(2, '0')}`, f = -side, fz = z + f * 0.45;
      crac.push([1.8, 1.95, 0.85, x, 0.975, z, '#d9d6cd'], [1.6, 0.5, 0.02, x, 0.4, fz + f * 0.005, '#3a3c3f']);
      grilles.push([x, 1.45, fz + f * 0.006, 1.58, 0.68, f > 0 ? 0 : Math.PI, [0, 0, 256, 128]]);
      screens.push([x + f * 0.55, 0.95, fz + f * 0.008, 0.26, 0.12, f > 0 ? 0 : Math.PI, [0, 0, 208, 96]]);
      srv.cracs.push({ nm, x, z });
      srv.fixed.push({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.43, maxZ: z + 0.43 });
      srv.units.push({ hit:
        hitBox(root, 1.8, 1.95, 0.9, x, 0.975, z, { action: 'info', reach: 4, info: () => `<b>${nm}</b><div class="m">${cracText(z).join(' · ')}</div>` }) });
    }
    root.add(mergedBoxes(crac, mat('#ffffff', { vertexColors: true, roughness: 0.6, metalness: 0.2 })));
    quads(grilles, new THREE.MeshStandardMaterial({ map: GR.tex, roughness: 0.6, metalness: 0.5 }), 256, 128);
    const CD = srv.cracScreen = makeCanvas(208, 96);
    quads(screens, new THREE.MeshBasicMaterial({ map: CD.tex, color: new THREE.Color(1.25, 1.25, 1.25) }), 208, 96);
    const cracText = (z) =>
      { const cs = cores(), load = cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : 20;
      return [`SUPPLY ${(17.6 + (z > 0 ? 0.4 : 0)).toFixed(1)}°C`, `RETURN ${(23 + load * 0.09 + (z > 0 ? 0.3 : 0)).toFixed(1)}°C`,
      `RH ${44 + (z > 0 ? 2 : 0)}%`]; };
    srv.paintCracs = () =>
      { const c = CD.ctx; c.fillStyle = '#071019'; c.fillRect(0, 0, CD.W, CD.H); lbl(c, 'CRAC · AUTO', 8, 20, `700 16px ${MONO}`, '#8ab4ff');
      cracText(-1).forEach((tx, i) => lbl(c, tx, 8, 44 + i * 20, `500 14px ${MONO}`, '#cfe3ff')); CD.tex.needsUpdate = true; };

    // The NOC: a big wall in the glass office at the far end, and a double-sided repeater over the cross aisle, one canvas.
    const noc = srv.noc = makeScreen(root, 4.4, 2.475, 1280, 720, SV.x0 + 0.08, 1.65, 11.5); noc.mesh.rotation.y = Math.PI / 2;
    root.add(mergedBoxes([[0.06, 2.56, 4.5, SV.x0 + 0.04, 1.65, 11.5], [0.3, 0.3, 0.3, 4.7, H - 0.4, 0], [0.04, H - 3.55, 0.04, 4.7, (H + 3.55) / 2, 0],
      [0.12, 1.06, 1.86, 4.7, 3.0, 0]], mat('#0c0d0f', { roughness: 0.4 })));
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0125), noc.mesh.material); m.position.set(4.7 + s * 0.061, 3.0, 0);
      m.rotation.y = s * Math.PI / 2; root.add(m); }
    Object.assign(noc.mesh.userData, { action: 'info', reach: 12, info: () => '<b>NOC wall</b><div class="m">This machine, live</div>' });
    srv.units.push({ hit: noc.mesh });

    // The KVM crash cart, parked in the cross aisle by the first pod.
    {
      const x = 4.2, z = -2.6, g = new THREE.Group(), steel = mat('#5d636b', { metalness: 0.7, roughness: 0.4 });
      g.position.set(x, 0, z); g.rotation.y = 2.2; root.add(g);
      const parts = [[0.5, 0.02, 0.4, 0, 0.9, 0], [0.5, 0.02, 0.4, 0, 0.35, 0], [0.12, 0.3, 0.02, 0, 1.06, -0.12]];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([0.025, 0.86, 0.025, sx * 0.23, 0.48, sz * 0.18]);
      g.add(mergedBoxes(parts, steel));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.03, 0.03, 0.025, '#111', sx * 0.23, 0.03, sz * 0.18, { seg: 10 }).rotation.z = Math.PI / 2;
      box(g, 0.42, 0.28, 0.025, '#151618', 0, 1.25, -0.12);
      const scr = makeScreen(g, 0.39, 0.25, 312, 200, 0, 1.25, -0.106), c = scr.ctx;
      c.fillStyle = '#000'; c.fillRect(0, 0, 312, 200);
      srv.kvm = scr;
      box(g, 0.4, 0.015, 0.14, '#202226', 0, 0.918, 0.06); box(g, 0.05, 0.012, 0.08, '#202226', 0.16, 0.918, 0.07);
      box(g, 0.3, 0.12, 0.22, '#2a2c30', 0, 0.42, 0);
      srv.fixed.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35 });
      srv.units.push({ hit:
        hitBox(g, 0.5, 1.4, 0.4, 0, 0.7, 0,
        { action: 'info', reach: 3, info: () => `<b>KVM crash cart</b><div class="m">Console on ${escapeHtml(m()?.hostname || 'this machine')}</div>` }) });
    }
    // By the door, inside: the emergency power off and an extinguisher.
    {
      const x = SV.x1 - 0.07, z = -1.3;
      root.add(mergedBoxes([[0.04, 0.22, 0.22, x, 1.4, z, '#f2c230'], [0.03, 0.4, 0.3, x + 0.02, 1.05, -1.9, '#b3261e']],
        mat('#ffffff', { vertexColors: true, roughness: 0.5 })));
      cyl(root, 0.05, 0.05, 0.05, '#c0221a', x - 0.04, 1.4, z, { seg: 20 }).rotation.z = Math.PI / 2;
      sign(0.3, 0.1, x - 0.001, 1.62, z, -Math.PI / 2, 600,
        (c, W, H) =>
        { c.fillStyle = '#b3261e'; c.fillRect(0, 0, W, H); lbl(c, 'EMERGENCY POWER OFF', W / 2, H * 0.68, `800 ${H * 0.42}px ${FONT}`, '#fff', 'center'); });
      cyl(root, 0.08, 0.08, 0.55, '#c0221a', x - 0.12, 0.3, -1.9, { seg: 16 });
      srv.units.push({ hit:
        hitBox(root, 0.1, 0.3, 0.3, x - 0.03, 1.45, z,
        { action: 'info', reach: 3, info: () => '<b>Emergency power off</b><div class="m">Kills every rack in the hall. Don’t.</div>' }) });
    }

    // The staging/build area in the far corner: ESD benches with a server opened up, a half-built rack on castors, spares
    // shelving, boxes on a pallet, and yellow floor markings.
    {
      const S = STAGE, parts = [], card = [];
      const mark = []; for (const [x0, x1, z0, z1] of [[S.x0 + 0.2, S.x1, S.z1 - 0.05, S.z1], [S.x1 - 0.05, S.x1, S.z0, S.z1]]) mark.push([x0, x1, z0, z1]);
      flats(mark, mat('#e3c23a', { roughness: 0.6 }), 1, 0.004);
      for (const z of [-15.6, -12.2]) {   // benches against the far wall
        const x = S.x0 + 0.45;
        parts.push([0.85, 0.04, 2.2, x, 0.9, z, '#4b5563'], [0.86, 0.006, 2.1, x, 0.923, z, '#3767a6'], [0.04, 0.88, 0.04, x - 0.38, 0.44, z - 1.05, '#9aa0a8'],
          [0.04, 0.88, 0.04, x + 0.38, 0.44, z - 1.05, '#9aa0a8'],
          [0.04, 0.88, 0.04, x - 0.38, 0.44, z + 1.05, '#9aa0a8'], [0.04, 0.88, 0.04, x + 0.38, 0.44, z + 1.05, '#9aa0a8'],
            [0.8, 0.02, 2.1, x, 0.25, z, '#6b7280'], [0.05, 0.7, 2.2, x - 0.42, 1.27, z, '#9aa0a8'],
          [0.03, 0.03, 2.1, x - 0.38, 1.55, z, '#4b5563']);
        srv.fixed.push({ minX: S.x0, maxX: x + 0.45, minZ: z - 1.1, maxZ: z + 1.1 });
      }
      // an open 1U on the first bench: chassis, fans, DIMMs, a heatsink, its lid beside it
      const ox = S.x0 + 0.45, oz = -15.6;
      parts.push([0.45, 0.044, 0.7, ox, 0.95, oz, '#2a2d32'], [0.44, 0.004, 0.68, ox + 0.0, 0.93, oz + 0.75, '#5d636b'],
        [0.12, 0.03, 0.12, ox, 0.98, oz + 0.05, '#b8bec6']);
      for (let i = 0; i < 6; i++) parts.push([0.05, 0.035, 0.04, ox - 0.15 + i * 0.06, 0.975, oz - 0.2, '#16181b']);
      for (let i = 0; i < 8; i++) parts.push([0.006, 0.03, 0.13, ox + 0.1 + i * 0.012, 0.975, oz + 0.05, '#1f6f3a']);
      // a box of screws, a cable tester, a drive caddy box
      parts.push([0.25, 0.08, 0.18, ox, 0.97, -12.6, '#c9b28a'], [0.05, 0.02, 0.18, ox + 0.2, 0.93, -12.0, '#e3c23a'],
        [0.3, 0.2, 0.4, ox, 1.03, -11.6, '#2a2d32']);
      // half-built rack on castors
      const hx = -20, hz = -13.5;
      for (const [w, h, d, x, y, z] of [[0.02, 2, 1.07, -0.29, 1.08, 0], [0.02, 2, 1.07, 0.29, 1.08, 0], [0.6, 0.04, 1.07, 0, 2.06, 0],
        [0.6, 0.06, 1.07, 0, 0.11, 0]]) parts.push([w, h, d, hx + x, y, hz + z, '#15171a']);
      for (const [x, z] of [[-0.25, -0.45], [0.25, -0.45], [-0.25, 0.45], [0.25, 0.45]]) parts.push([0.06, 0.08, 0.06, hx + x, 0.04, hz + z, '#111']);
      for (let u = 0; u < 5; u++) parts.push([0.45, 0.04, 0.8, hx, 0.2 + u * 0.045, hz, u % 2 ? '#2a2d32' : '#2b2e33']);
      srv.fixed.push({ minX: hx - 0.32, maxX: hx + 0.32, minZ: hz - 0.55, maxZ: hz + 0.55 });
      // spares shelving on the south wall
      for (const x of [-23.6, -21.4]) {
        for (const y of [0.15, 0.6, 1.05, 1.5, 1.95]) parts.push([1.9, 0.02, 0.5, x, y, S.z0 - 1.15, '#9aa0a8']);
        for (const sx of [-0.93, 0.93]) for (const sz of [-0.23, 0.23]) parts.push([0.025, 2, 0.025, x + sx, 1, S.z0 - 1.15 + sz, '#9aa0a8']);
        for (const y of [0.16, 0.61, 1.06, 1.51]) for (let i = 0; i < 4;
          i++) if (R() < 0.8) card.push([0.36 + R() * 0.1, 0.18 + R() * 0.2, 0.36, x - 0.7 + i * 0.46, y + 0.1 + R() * 0.02, S.z0 - 1.15,
          R() < 0.3 ? '#2a2d32' : '#b08a5a']);
        srv.fixed.push({ minX: x - 0.96, maxX: x + 0.96, minZ: S.z0 - 1.45, maxZ: S.z0 - 0.85 });
      }
      // boxed servers on a pallet, one box open
      const px = -17.2, pz = -5.2;
      parts.push([1.2, 0.14, 1.0, px, 0.07, pz, '#a07b4f']);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2;
        j++) card.push([0.55, 0.28, 0.95, px - 0.29 + j * 0.58, 0.28 + i * 0.29, pz, '#b08a5a'],
        [0.56, 0.06, 0.96, px - 0.29 + j * 0.58, 0.3 + i * 0.29, pz, '#c9b28a']);
      card.push([0.6, 0.35, 0.8, px + 1.1, 0.175, pz + 0.6, '#b08a5a'], [0.6, 0.02, 0.4, px + 1.1, 0.4, pz + 0.95, '#b08a5a']);
      srv.fixed.push({ minX: px - 0.6, maxX: px + 1.42, minZ: pz - 0.5, maxZ: pz + 1.0 });
      root.add(mergedBoxes(parts, mat('#ffffff', { vertexColors: true, roughness: 0.6, metalness: 0.3 })),
        mergedBoxes(card, mat('#ffffff', { vertexColors: true, roughness: 0.95 })));
      sign(2.4, 0.5, S.x0 + 0.07, 2.9, -10, Math.PI / 2, 300,
        (c, W, H) =>
        { c.fillStyle = '#e3c23a'; c.fillRect(0, 0, W, H); c.fillStyle = '#111';
        for (let x = -H; x < W; x += 40) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + 20, H); c.lineTo(x + 20 + H * 0.2, H * 0.8);
        c.lineTo(x + H * 0.2, H * 0.8); c.fill(); } lbl(c, 'STAGING · BUILD AREA', W / 2, H * 0.55, `800 ${H * 0.36}px ${FONT}`, '#111', 'center'); });
      srv.units.push({ hit:
        hitBox(root, 0.9, 1, 2.2, S.x0 + 0.45, 0.6, -15.6,
        { action: 'info', reach: 3.5, info: () => '<b>Build bench</b><div class="m">Someone’s halfway through a DIMM swap. Again.</div>' }) });
    }

    // The NOC office: glass on its two open sides (a doorway near the floor end), a dark roof, the NOC wall, a console
    // facing it, and John's desk by the glass looking out over the floor.
    {
      const N = NOC, gl = [], fr = [], doorZ = [N.z0 + 0.6, N.z0 + 1.8];
      gl.push([N.x1 - N.x0, N.h - 0.1, 0.02, (N.x0 + N.x1) / 2, (N.h - 0.1) / 2 + 0.05, N.z0],
        [0.02, N.h - 0.1, N.z1 - doorZ[1], N.x1, (N.h - 0.1) / 2 + 0.05, (doorZ[1] + N.z1) / 2],
        [0.02, N.h - 0.1, doorZ[0] - N.z0, N.x1, (N.h - 0.1) / 2 + 0.05, (N.z0 + doorZ[0]) / 2]);
      for (let x = N.x0 + 1.5; x < N.x1; x += 1.5) fr.push([0.05, N.h, 0.06, x, N.h / 2, N.z0]);
      for (let z = doorZ[1] + 1.5; z < N.z1; z += 1.5) fr.push([0.06, N.h, 0.05, N.x1, N.h / 2, z]);
      for (const z of [...doorZ, N.z0]) fr.push([0.08, N.h, 0.08, N.x1, N.h / 2, z]);
      fr.push([N.x1 - N.x0, 0.06, 0.08, (N.x0 + N.x1) / 2, 0.03, N.z0], [N.x1 - N.x0, 0.08, 0.08, (N.x0 + N.x1) / 2, N.h - 0.04, N.z0],
        [0.08, 0.08, N.z1 - N.z0, N.x1, N.h - 0.04, (N.z0 + N.z1) / 2],
        [0.08, 0.06, N.z1 - doorZ[1], N.x1, 0.03, (doorZ[1] + N.z1) / 2],
          [0.08, N.h - 2.2, doorZ[1] - doorZ[0], N.x1, (N.h + 2.2) / 2, (doorZ[0] + doorZ[1]) / 2]);
      const pane = mergedBoxes(gl, glassM); pane.castShadow = false; root.add(pane);
      root.add(mergedBoxes(fr, mat('#2b2f35', { metalness: 0.6, roughness: 0.4 })));
      root.add(mergedBoxes([[N.x1 - N.x0 + 0.1, 0.12, N.z1 - N.z0 + 0.1, (N.x0 + N.x1) / 2, N.h + 0.06, (N.z0 + N.z1) / 2]],
        mat('#2a2e35', { roughness: 0.8 })));
      flats([[N.x0, N.x1, N.z0, N.z1]], mat('#3a3f47', { roughness: 0.9 }), 1, N.h - 0.002, true);
      flats([[N.x0, N.x1, N.z0, N.z1]], mat('#4a4f57', { roughness: 0.85 }), 1, 0.002);   // carpet tiles
      root.add(mergedBoxes([[1.2, 0.02, 0.6, -21.5, N.h - 0.012, 8], [1.2, 0.02, 0.6, -21.5, N.h - 0.012, 15]],
        new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4f7ff', emissiveIntensity: 1.6 })));
      srv.fixed.push({ minX: N.x0, maxX: N.x1 + 0.05, minZ: N.z0 - 0.05, maxZ: N.z0 + 0.05 },
        { minX: N.x1 - 0.05, maxX: N.x1 + 0.05, minZ: doorZ[1], maxZ: N.z1 }, { minX: N.x1 - 0.05, maxX: N.x1 + 0.05, minZ: N.z0, maxZ: doorZ[0] });
      sign(1.4, 0.3, N.x1 + 0.03, 2.6, (doorZ[1] + N.z1) / 2 + 1.5, Math.PI / 2, 300,
        (c, W, H) =>
        { c.fillStyle = '#1d2228'; c.fillRect(0, 0, W, H); lbl(c, 'NOC', 20, H * 0.72, `800 ${H * 0.6}px ${FONT}`, '#d97757');
        lbl(c, 'Network Operations', 120, H * 0.66, `500 ${H * 0.36}px ${FONT}`, '#e8eef6'); });
      // the console facing the wall: a long desk, three monitors showing the NOC
      const cx = -22.6, desk = [[0.8, 0.04, 3.2, cx, 0.74, 11.5, '#2a2c30'], [0.04, 0.7, 3.1, cx + 0.38, 0.37, 11.5, '#1d1f22']];
      for (const dz of [-1, 0, 1]) desk.push([0.04, 0.42, 0.04, cx - 0.2, 0.97, 11.5 + dz, '#111'], [0.025, 0.36, 0.6, cx - 0.24, 1.18, 11.5 + dz, '#111']);
      root.add(mergedBoxes(desk, mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.3 })));
      for (const dz of [-1, 0, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.315), noc.mesh.material);
        m.position.set(cx - 0.26, 1.18, 11.5 + dz); m.rotation.y = -Math.PI / 2; root.add(m); }
      srv.fixed.push({ minX: cx - 0.4, maxX: cx + 0.4, minZ: 9.9, maxZ: 13.1 });
    }
    // John's desk, against the glass: two monitors (his terminals), a keyboard, a mug, papers, manuals, a rubber duck.
    {
      const dx = -17.85, dz = 12.6, J = srv.jdesk = { x: dx, z: dz }, parts = [];
      parts.push([0.75, 0.04, 1.7, dx, 0.74, dz, '#6b5440'], [0.04, 0.72, 0.04, dx - 0.33, 0.36, dz - 0.8, '#222'],
        [0.04, 0.72, 0.04, dx + 0.33, 0.36, dz - 0.8, '#222'],
        // a pedestal
        [0.04, 0.72, 0.04, dx - 0.33, 0.36, dz + 0.8, '#222'], [0.04, 0.72, 0.04, dx + 0.33, 0.36, dz + 0.8, '#222'],
          [0.45, 0.6, 0.4, dx, 0.42, dz + 0.55, '#3a3d42']);
      for (const o of [-0.33, 0.33]) parts.push([0.04, 0.38, 0.04, dx + 0.22, 0.95, dz + o, '#111'], [0.2, 0.012, 0.18, dx + 0.22, 0.765, dz + o, '#111'],
        [0.025, 0.33, 0.58, dx + 0.2, 1.14, dz + o, '#111']);
      parts.push([0.16, 0.015, 0.44, dx - 0.15, 0.768, dz, '#1d1f22'], [0.1, 0.02, 0.06, dx - 0.12, 0.77, dz + 0.36, '#1d1f22']);   // keyboard, mouse
      // papers, manuals
      parts.push([0.22, 0.003, 0.3, dx - 0.05, 0.763, dz - 0.6, '#f2f0ea'], [0.22, 0.003, 0.3, dx - 0.02, 0.766, dz - 0.62, '#e9e6dc'],
        [0.24, 0.08, 0.3, dx + 0.15, 0.8, dz - 0.65, '#7a2a2a'], [0.24, 0.05, 0.3, dx + 0.15, 0.865, dz - 0.66, '#1f4f7a']);
      // sticky notes on the bezels
      parts.push([0.06, 0.06, 0.003, dx + 0.19, 1.3, dz - 0.62, '#f7e36b'], [0.06, 0.06, 0.003, dx + 0.19, 1.28, dz + 0.04, '#f7a8c8']);
      root.add(mergedBoxes(parts, mat('#ffffff', { vertexColors: true, roughness: 0.6 })));
      J.mug = new THREE.Group(); cyl(J.mug, 0.042, 0.038, 0.1, '#2c4a73', 0, 0.05, 0);
      cyl(J.mug, 0.038, 0.038, 0.005, '#3a2516', 0, 0.098, 0, { shadow: false });
      J.mug.position.set(dx - 0.15, 0.76, dz - 0.4); root.add(J.mug);
      const duck = new THREE.Group(); duck.position.set(dx + 0.1, 0.76, dz + 0.72); duck.rotation.y = -2.4;
      cyl(duck, 0.035, 0.04, 0.05, '#f2c230', 0, 0.025, 0, { seg: 12 }); cyl(duck, 0.022, 0.022, 0.035, '#f2c230', 0, 0.06, 0.02, { seg: 12 });
      box(duck, 0.02, 0.008, 0.02, '#e07a1a', 0, 0.058, 0.045); root.add(duck);
      J.scr = [-0.33,
        0.33].map((o) => { const s = makeScreen(root, 0.54, 0.3, 512, 284, dx + 0.185, 1.14, dz + o); s.mesh.rotation.y = -Math.PI / 2; return s; });
      // his chair
      const cx = dx - 0.75, ch = new THREE.Group(); ch.position.set(cx, 0, dz); root.add(ch);
      ch.add(mergedBoxes([[0.5, 0.08, 0.5, 0, 0.43, 0, '#1d1f22'], [0.08, 0.6, 0.48, -0.27, 0.78, 0, '#1d1f22'], [0.05, 0.36, 0.05, 0, 0.21, 0, '#555'],
        [0.55, 0.03, 0.06, 0, 0.04, 0, '#333'], [0.06, 0.03, 0.55, 0, 0.04, 0, '#333']], mat('#ffffff', { vertexColors: true, roughness: 0.7 })));
      srv.fixed.push({ minX: dx - 0.38, maxX: dx + 0.4, minZ: dz - 0.85, maxZ: dz + 0.85 }, { minX: cx - 0.3, maxX: cx + 0.3, minZ: dz - 0.3, maxZ: dz + 0.3 });
    }

    // The vestibule: signage, the fire suppression panel and the access-controlled door into the hall.
    sign(1.6, 0.55, SV.x1 + 0.07, 2.55, 0, Math.PI / 2, 400, (c, W, H) => {
      c.fillStyle = '#1d2228'; c.fillRect(0, 0, W, H); c.fillStyle = '#d97757'; c.fillRect(24, 26, 8, H - 52);
      lbl(c, '47  SERVER HALL', 50, 92, `300 70px ${FONT}`, '#f2efe8');
      lbl(c, 'AUTHORISED PERSONNEL ONLY · CARD ACCESS', 52, 150, `600 22px ${FONT}`, '#c3c2b7');
      lbl(c, 'Cold aisles A/B–M/N · NOC · Staging', 52, 190, `400 22px ${FONT}`, '#9a9890');
    });
    for (const s of [-1, 1]) sign(0.42, 0.56, SV.x1 + 0.07, 1.5, s * 1.1, Math.PI / 2, 400, s < 0 ? (c, W, H) => {
      c.fillStyle = '#f5f5f2'; c.fillRect(0, 0, W, H); c.fillStyle = '#b3261e'; c.fillRect(0, 0, W, 56);
      lbl(c, 'WARNING', W / 2, 40, `800 32px ${FONT}`, '#fff', 'center');
      ['This room is protected', 'by an FM-200 gaseous', 'fire suppression', 'system. On alarm,', 'leave the room',
        'immediately.'].forEach((tx, i) => lbl(c, tx, W / 2, 96 + i * 24, `500 15px ${FONT}`, '#222', 'center'));
    } : (c, W, H) => {
      c.fillStyle = '#f5f5f2'; c.fillRect(0, 0, W, H); c.fillStyle = '#1f5fbf'; c.fillRect(0, 0, W, 56);
      lbl(c, 'NOTICE', W / 2, 40, `800 32px ${FONT}`, '#fff', 'center');
      ['No food or drink', 'beyond this point.', '', 'ESD: earth yourself', 'before touching',
        'any equipment.'].forEach((tx, i) => lbl(c, tx, W / 2, 96 + i * 24, `500 18px ${FONT}`, '#222', 'center'));
    });
    {
      const z = SV.vz, x = 16.2;
      root.add(mergedBoxes([[0.42, 0.56, 0.08, x, 1.45, z - 0.04, '#b3261e'], [0.22, 0.3, 0.06, x + 0.45, 1.3, z - 0.03, '#f2c230'],
        [0.14, 0.14, 0.05, x - 0.42, 1.35, z - 0.025, '#1f5fbf']], mat('#ffffff', { vertexColors: true, roughness: 0.5 })));
      const fp = sign(0.36, 0.42, x, 1.47, z - 0.081, Math.PI, 500, (c, W, H) => {
        c.fillStyle = '#e9e6df'; c.fillRect(0, 0, W, H); lbl(c, 'FM-200', W / 2, 34, `800 26px ${FONT}`, '#b3261e', 'center');
        lbl(c, 'EXTINGUISHING CONTROL', W / 2, 58, `600 12px ${FONT}`, '#333', 'center');
        c.fillStyle = '#071019'; c.fillRect(20, 70, W - 40, 50); lbl(c, 'SYSTEM HEALTHY · ARMED', W / 2, 101, `600 14px ${MONO}`, '#5dff9b', 'center');
        ['POWER', 'ARMED', 'FAULT', 'DISCHARGE', 'ALARM'].forEach((tx, i) => lbl(c, tx, 52, 146 + i * 13, `600 10px ${FONT}`, '#333'));
      });
      const p = (px, py, col, fn) => led(fp.position.x - (px / 180 - 0.5) * 0.36, 1.47 + (0.5 - py / 210) * 0.42, z - 0.085, col, fn, Math.PI);
      p(34, 142, LED.g); p(34, 155, LED.a); p(34, 168, LED.off); p(34, 181, LED.off); p(34, 194, LED.off);
      sign(0.2, 0.06, x + 0.45, 1.5, z - 0.061, Math.PI, 500,
        (c, W, H) =>
        { c.fillStyle = '#f2c230'; c.fillRect(0, 0, W, H); lbl(c, 'MANUAL RELEASE', W / 2, H * 0.68, `800 ${H * 0.5}px ${FONT}`, '#222', 'center'); });
      cyl(root, 0.06, 0.06, 0.05, '#e9e6df', 16.2, 2.6, z - 0.03, { seg: 20 }).rotation.x = Math.PI / 2;   // sounder/strobe
      srv.units.push({ hit:
        hitBox(root, 1.2, 0.6, 0.12, x, 1.45, z - 0.06,
        { action: 'info', reach: 3, info: () => '<b>Fire suppression</b><div class="m">FM-200 clean agent · system healthy · armed</div>' }) });
    }
    {   // the access door: a steel frame lining the opening, and a leaf that slides into the wall once the reader lets you through
      const x = SV.x1, fw = 0.07, fd = t + 0.06;   // frame: jambs 7 cm wide, proud of the wall by 3 cm each side
      const frame = [[fd, DH, fw, x, DH / 2, -DW + fw / 2], [fd, DH, fw, x, DH / 2, DW - fw / 2], [fd, fw, DW * 2, x, DH - fw / 2, 0],
        [fd, 0.012, DW * 2 - fw * 2, x, 0.006, 0],
        // stops, flush with the jambs' faces
        [0.012, DH - fw, 0.02, x - 0.035, (DH - fw) / 2, -DW + fw - 0.01], [0.012, DH - fw, 0.02, x + 0.035, (DH - fw) / 2, DW - fw + 0.01]];
      for (const s of [-1, 1]) frame.push([0.012, DH + fw, fw * 2, x + s * (fd / 2 + 0.006), (DH + fw) / 2, -DW + 0.035],
        [0.012, DH + fw, fw * 2, x + s * (fd / 2 + 0.006), (DH + fw) / 2, DW - 0.035],
        [0.012, fw * 2, DW * 2 + fw * 2, x + s * (fd / 2 + 0.006), DH + fw / 2, 0]);   // architraves over the joint with the wall
      root.add(mergedBoxes(frame, mat('#8d949c', { metalness: 0.7, roughness: 0.35 })));
      const lw = DW * 2 - fw * 2 + 0.03, lh = DH - fw - 0.012 + 0.01, leaf = new THREE.Group();   // into the jambs and head a little: no light round it
      leaf.add(mergedBoxes([[0.05, lh, lw, 0, 0.012 + lh / 2, 0, '#7d848c'], [0.056, 0.5, 0.2, 0, 1.55, 0.18, '#22303d'],
        [0.056, 0.02, 0.24, 0, 1.31, 0.18, '#5d636b'], [0.056, 0.02, 0.24, 0, 1.81, 0.18, '#5d636b']],
        mat('#ffffff', { vertexColors: true, metalness: 0.6, roughness: 0.3 })));
      leaf.position.set(x, 0, 0); root.add(leaf);
      const pocket = DW * 2 - fw;   // how far it slides: fully behind the +z jamb, into the wall
      box(root, 0.04, 0.14, 0.09, '#1a1c20', x + fd / 2 + 0.02, 1.2, DW + 0.2);
      led(x + fd / 2 + 0.041, 1.24, DW + 0.2, LED.r, () => (srv.doors.at(-1)?.k > 0.05 ? LED.g : LED.r), Math.PI / 2);
      srv.doors.push({ x, z: 0, leaves: [leaf], k: 0, access: true, pocket });
      sign(0.3, 0.12, x - fd / 2 - 0.002, DH + 0.25, 0, -Math.PI / 2, 500,
        (c, W, H) => { c.fillStyle = '#1b7f3a'; c.fillRect(0, 0, W, H); lbl(c, 'EXIT  ➜', W / 2, H * 0.72, `800 ${H * 0.55}px ${FONT}`, '#fff', 'center'); },
        { basic: true });
    }
    // one tile up in the hot aisle
    const lifted = sign(0.6, 0.6, 9.4, 0.004, -2.27 + 0.3, 0, 100,
      (c, W, H) =>
      { c.fillStyle = '#05070a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#e3c23a'; c.lineWidth = 3;
      for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 8 + i * 9); c.bezierCurveTo(20, 20 + i * 4, 40, 10, W, 14 + i * 7); c.stroke(); } });
    lifted.rotation.x = -Math.PI / 2;

    // LEDs: unlit quads, bright enough to bloom. The room's own first (always updated), then each generic rack's copy of
    // its template's, contiguous per rack so the near ones can be updated and uploaded as one range (see srv.fx).
    srv.ledAlways = leds.length;
    for (const r of srv.racks) {
      if (r.live) continue;
      const g = { x: r.x, z: r.z, a: leds.length, dyn: [] }, cos = Math.cos(r.ry), sin = Math.sin(r.ry);
      for (const o of TPL[r.tpl].leds) { const q = { x: r.x + o.x * cos + o.z * sin, y: o.y, z: r.z - o.x * sin + o.z * cos, col: o.col, fn: o.fn, ry: r.ry };
        leds.push(q); if (q.fn) g.dyn.push(q); }
      g.b = leds.length - 1; srv.ledGroups.push(g);
    }
    const ledIM = srv.leds = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.008, 0.006), new THREE.MeshBasicMaterial({ toneMapped: false }), leds.length),
      mx = new THREE.Matrix4();
    leds.forEach((o, i) => { ledIM.setMatrixAt(i, mx.makeRotationY(o.ry).setPosition(o.x, o.y, o.z)); ledIM.setColorAt(i, o.col); o.i = i; });
    ledIM.instanceMatrix.needsUpdate = true; ledIM.computeBoundingSphere(); root.add(ledIM);
    srv.dyn = dyn;
    Object.assign(srv, liftShaft()); root.add(srv.lift);
    srv.john = makeJohn(root, srv.jdesk);
    srv.hits = [srv.callHit, srv.panel.mesh, ...srv.slots.map((s) => s.hit), ...srv.units.map((u) => u.hit), srv.john.root, srv.body, srv.rear];
    srv.sound = { tone: 'fans',
      hums: [...PODS.flatMap((k) => BLOCKS.map((B) => [(B.x0 + B.x1) / 2, 1.4, k * POD, 0.55])), ...srv.cracs.map((c) => [c.x, 1.2, c.z, 0.5])],
      clicks: srv.racks.filter((_, i) => i % 3 === 0).map((r) => [r.x, 1, r.z]), relays: [...srv.cracs.map((c) => [c.x, 1.0, c.z]), [16.2, 1.5, SV.vz]] };
    srv.baseSound = JSON.parse(JSON.stringify(srv.sound));
    srv.atlases = [SA, IA];
    addFloor(srv);
  }
  srv.enter = (z) => {
    srv.root.position.z = z;
    srv.colliders = srv.fixed.map((b) => ({ ...b, minZ: b.minZ + z, maxZ: b.maxZ + z }));
    srv.static = srv.colliders.length;
    for (const k of ['hums', 'clicks', 'relays']) srv.sound[k] = srv.baseSound[k].map(([x, y, zz, g]) => [x, y, zz + z, g]);
    srv.polledAt = 0; srv.paintAt = srv.nocAt = 0;
  };
  srv.bound = (p) => {
    const z0 = srv.root.position.z, lz = p.z - z0;
    if (p.x > SV.x1 + 0.06) { p.z = z0 + clamp(lz, -SV.vz + 0.3, SV.vz - 0.3); p.x = Math.min(p.x, LIFT.x - 0.3); }
    else { p.x = Math.max(p.x, SV.x0 + 0.3); p.z = z0 + clamp(lz, SV.z0 + 0.3, SV.z1 - 0.3); }
  };
  async function pollMachine() {
    srv.polledAt = performance.now();
    try {
      const m = srv.m = await (await fetch('/api/machine')).json(), h = srv.hist, push = (k, v) => { h[k].push(v); if (h[k].length > 120) h[k].shift(); };
      push('cpu', m.cores.length ? m.cores.reduce((a, b) => a + b, 0) / m.cores.length : 0);
      push('mem', m.mem ? m.mem.used / m.mem.total * 100 : 0);
      push('load', m.load[0]);
      push('sess', ctx.state?.live.length || 0);
      push('net', m.net ? (m.net.rx + m.net.tx) / 1024 : 0);
      const ts = new Date().toTimeString().slice(0, 8), log = srv.jlog ||= [];
      log.push(`${ts} ${m.hostname} kernel: load ${m.load[0].toFixed(2)} mem ${Math.round(h.mem.at(-1))}%`);
      for (const s of ctx.state?.live || []) if (s.status !== srv.jseen?.[s.sessionId]) { log.push(`${ts} claude[${s.pid}]: ${sessName(s)} -> ${s.status}`);
        (srv.jseen ||= {})[s.sessionId] = s.status; }
      if (Math.random() < 0.3) log.push(`${ts} sshd[${4000 + Math.floor(Math.random() * 5000)}]: Accepted publickey for john from 10.47.0.${Math.floor(Math.random() * 250)}`);
      if (log.length > 40) log.splice(0, log.length - 40);
      srv.nocAt = 0;
    } catch {}
  }
  // Sessions into slots: a new session takes the slot that's been empty longest and boots; one that ends powers down,
  // its plate stays a minute, then the slot is blanked.
  function syncSlots(now) {
    const live = new Map((ctx.state?.live || []).map((s) => [s.sessionId, s]));
    for (const s of srv.slots) {
      const ss = s.sid && live.get(s.sid);
      if (ss) { s.sess = ss; if (s.state === 'off') { s.state = 'boot'; s.since = now; } if (s.state === 'boot' && now - s.since > 2500) s.state = 'live';
        live.delete(s.sid); }
      else if (s.sid && s.state !== 'off') { s.state = 'off'; s.since = now; }
      else if (s.state === 'off' && now - s.since > 60e3) Object.assign(s, { sid: null, sess: null, state: 'empty', since: now });
      s.hit.userData.sessionId = s.state === 'live' || s.state === 'boot' ? s.sid : null;
    }
    for (const ss of live.values()) {
      const s = srv.slots.filter((x) => x.state === 'empty').sort((a, b) => a.since - b.since || a.k - b.k)[0];
      if (!s) break;
      Object.assign(s, { sid: ss.sessionId, sess: ss, state: 'boot', since: now });
      s.hit.userData.sessionId = ss.sessionId;
    }
  }
  const sessName = (s) => s.name || s.statusline?.name || s.transcript?.title || s.sessionId.slice(0, 8);
  function paintSlot(s, now) {
    const c = srv.sa.a.ctx, [x, y, w, h] = s.cell, ss = s.sess, col = s.sid ? dash.colorHex(s.sid) : '#444';
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y);
    if (s.state === 'empty') {
      c.fillStyle = '#1b1d20'; c.fillRect(0, 0, w, h);
      for (let i = 18; i < w - 10; i += 14) { c.fillStyle = '#101113'; c.fillRect(i, 14, 8, h - 28); }
    } else {
      const off = s.state === 'off';
      c.fillStyle = '#25292e'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, 0, w, 2); c.fillStyle = '#0d0f11';
      c.fillRect(0, h - 3, w, 3);
      c.fillStyle = off ? '#3a3d42' : col; c.fillRect(6, 6, 8, h - 12);
      c.fillStyle = off ? '#55585e' : col; c.fillRect(20, 12, 100, h - 24);
      const name = ss ? sessName(ss) : '';
      c.font = `700 9px ${MONO}`; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(`CC-${String(s.k + 1).padStart(2, '0')}`, 25, 24);
      c.font = `700 15px ${FONT}`; c.fillStyle = '#111'; c.fillText(fit(c, name, 92), 25, 44);
      c.fillStyle = '#05080a'; c.fillRect(128, 9, 134, h - 18);
      if (!off) {
        const lines = s.state === 'boot' ? ['BOOTING…', `POST ${'█'.repeat(1 + Math.floor((now - s.since) / 350) % 8)}`, ''] : [
          name, `CPU ${(ss?.proc?.cpu ?? 0).toFixed(1).padStart(5)}%  ${String(ss?.proc?.rssMB ?? 0).padStart(4)}M`,
          ss?.status === 'working' ? 'WORKING' : ss?.status === 'idle' ? `IDLE ${F.dur(now - (ss.statusSince || now))}` :
            String(ss?.status || '').toUpperCase()];
        lines.forEach((tx, i) =>
          { c.font = `600 ${i ? 12 : 13}px ${MONO}`; c.fillStyle = i === 2 && ss?.status !== 'working' && ss?.status !== 'idle' ? '#ffb347' : '#5dff9b';
          c.fillText(fit(c, tx, 124), 133, 24 + i * 16); });
      } else { c.font = `600 10px ${MONO}`; c.fillStyle = '#5a6068'; c.fillText('POWERED OFF', 140, h / 2 + 4); }
      for (let b = 0; b < 4; b++) { c.fillStyle = '#16181b'; c.fillRect(266 + b * 13, 9, 11, h - 18); c.fillStyle = '#3a3e44';
        c.fillRect(268 + b * 13, 12, 7, h - 34); }
    }
    c.restore();
  }
  function paintUnits() {
    const c = srv.ia.a.ctx;
    for (const U of srv.units) {
      if (!U.paint) continue;
      const [x, y, w, h] = U.cell;
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y);
      c.fillStyle = '#23272c'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, 0, w, 2); c.fillStyle = '#0d0f11';
      c.fillRect(0, h - 3, w, 3);
      U.paint(c, w, h);
      c.restore();
    }
  }
  function paintNoc(now) {
    const { ctx: c, W, H } = srv.noc, m = srv.m, h = srv.hist;
    c.fillStyle = '#070b10'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0f1620'; c.fillRect(0, 0, W, 64);
    lbl(c, 'NOC', 28, 43, `800 30px ${FONT}`, '#d97757');
    lbl(c, m ? `${m.hostname} · ${m.os} · ${m.arch} · up ${F.dur(m.uptime * 1000)}` : 'waiting for /api/machine…', 100, 42, `500 22px ${FONT}`, '#c9d4e3');
    lbl(c, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), W - 28, 43, `600 26px ${MONO}`, '#e8eef6', 'right');
    const tileT = (x, y, w, hh, title, big, sub, vals, color, max) => {
      c.fillStyle = '#0d131b'; c.fillRect(x, y, w, hh); c.strokeStyle = '#1b2633'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, hh - 2);
      lbl(c, title, x + 18, y + 32, `700 16px ${FONT}`, '#7f8da0');
      lbl(c, big, x + 18, y + 78, `700 40px ${MONO}`, '#f2f5f9');
      if (sub) lbl(c, fit(c, sub, w - 36), x + 18, y + 104, `500 15px ${FONT}`, '#7f8da0');
      if (vals?.length > 1) {   // the last 6 minutes, against `max` (or its own peak)
        const gx = x + 18, gy = y + 120, gw = w - 36, gh = hh - 136, top = max ?? (Math.max(...vals) * 1.15 || 1);
        c.strokeStyle = '#1b2633'; c.lineWidth = 1;
        for (let i = 0; i <= 2; i++) { c.beginPath(); c.moveTo(gx, gy + gh * i / 2); c.lineTo(gx + gw, gy + gh * i / 2); c.stroke(); }
        const px = (i) => gx + gw * (1 - (vals.length - 1 - i) / 119);
        c.beginPath();
        vals.forEach((v, i) => { const py = gy + gh * (1 - Math.min(1, v / top)); i ? c.lineTo(px(i), py) : c.moveTo(px(i), py); });
        c.strokeStyle = color; c.lineWidth = 2.5; c.stroke();
        c.lineTo(px(vals.length - 1), gy + gh); c.lineTo(px(0), gy + gh); c.closePath(); c.globalAlpha = 0.18; c.fillStyle = color; c.fill(); c.globalAlpha = 1;
      }
    };
    const cs = m?.cores || [], cpu = h.cpu.at(-1) ?? 0;
    const col = (v) => (v < 60 ? '#5dff9b' : v < 85 ? '#ffb347' : '#ff6b5b');
    tileT(24, 84, 400, 300, 'CPU', `${Math.round(cpu)}%`, `${cs.length} cores · ${m?.cpuModel || ''}`, h.cpu, col(cpu), 100);
    {   // per-core bars under the CPU tile's number
      const x = 230, y = 104, bw = Math.min(14, 170 / Math.max(1, cs.length));
      cs.forEach((v, i) =>
        { c.fillStyle = '#16202b'; c.fillRect(x + i * (bw + 3), y, bw, 60); c.fillStyle = col(v); c.fillRect(x + i * (bw + 3), y + 60 - v * 0.6, bw, v * 0.6);
        });
    }
    const memP = h.mem.at(-1) ?? 0;
    tileT(440, 84, 400, 300, 'MEMORY', `${Math.round(memP)}%`, m?.mem ? `${(m.mem.used / 2 ** 30).toFixed(1)} of ${(m.mem.total / 2 ** 30).toFixed(1)} GB` : '',
      h.mem, col(memP), 100);
    tileT(856, 84, 400, 300, 'LOAD', m ? m.load[0].toFixed(2) : '–', m ? `5m ${m.load[1].toFixed(2)} · 15m ${m.load[2].toFixed(2)}` : '', h.load, '#8ab4ff');
    const live = ctx.state?.live || [], working = live.filter((s) => s.status === 'working').length;
    tileT(24, 400, 400, 296, 'CLAUDE SESSIONS', String(live.length), `${working} working · today ${F.usd(ctx.state?.totals?.todayCost || 0)} API-eq.`, h.sess,
      '#d97757');
    {   // disks
      const x = 440, y = 400, w = 400;
      c.fillStyle = '#0d131b'; c.fillRect(x, y, w, 296); c.strokeStyle = '#1b2633'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, 294);
      lbl(c, 'DISKS', x + 18, y + 32, `700 16px ${FONT}`, '#7f8da0');
      (m?.disks || []).slice(0, 5).forEach((d, i) => {
        const p = d.used / d.size, yy = y + 64 + i * 46;
        lbl(c, fit(c, d.mount, 230), x + 18, yy, `500 16px ${MONO}`, '#c9d4e3');
        lbl(c, `${Math.round(p * 100)}% of ${(d.size / 2 ** 30).toFixed(0)} GB`, x + w - 18, yy, `500 15px ${MONO}`, '#7f8da0', 'right');
        c.fillStyle = '#16202b'; c.fillRect(x + 18, yy + 8, w - 36, 10); c.fillStyle = col(p * 100); c.fillRect(x + 18, yy + 8, (w - 36) * p, 10);
      });
    }
    const net = m?.net, rate = (b) => (b > 2 ** 20 ? `${(b / 2 ** 20).toFixed(1)} MB/s` : `${(b / 1024).toFixed(0)} KB/s`);
    tileT(856, 400, 400, 296, 'NETWORK', net ? rate(net.rx + net.tx) : '–',
      net ? `↓ ${rate(net.rx)} · ↑ ${rate(net.tx)}${m.battery ? ` · battery ${m.battery.pct}%${m.battery.ac ? ' (AC)' : ''}` : ''}` : '', h.net, '#8ab4ff');
    srv.noc.tex.needsUpdate = true;
  }
  function paintKvm() {
    const { ctx: c, W, H } = srv.kvm, m = srv.m;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const lines = [`${m?.os || 'macOS'} (${m?.hostname || 'localhost'}) (console)`, '', `${m?.hostname || 'localhost'} login: root`, 'Password:',
      `Last login: ${new Date(Date.now() - 864e5).toDateString()} on console`, `root@${m?.hostname || 'localhost'}:~# uptime`,
      m ? ` up ${F.dur(m.uptime * 1000)}, load averages: ${m.load.map((v) => v.toFixed(2)).join(' ')}` : '',
        `root@${m?.hostname || 'localhost'}:~# ${Date.now() % 1000 < 500 ? '█' : ''}`];
    lines.forEach((tx, i) => lbl(c, fit(c, tx, W - 16), 8, 20 + i * 18, `500 12px ${MONO}`, '#c8c8c8'));
    srv.kvm.tex.needsUpdate = true;
  }
  // Per frame while you're here: doors, LEDs (15 Hz), faces (2 Hz), the NOC (1 Hz), polling (every 3 s).
  function paintJohnScreens() {
    const [a, b] = srv.jdesk.scr, m = srv.m;
    for (const { ctx: c, W, H } of [a, b]) { c.fillStyle = '#0b0f0c'; c.fillRect(0, 0, W, H); }
    { const c = a.ctx, cs = m?.cores || [];
      lbl(c, `john@${m?.hostname || 'localhost'}: ~ $ htop`, 10, 22, `600 15px ${MONO}`, '#9fe8a8');
      cs.forEach((v, i) =>
        { const y = 40 + i * 16; lbl(c, String(i + 1).padStart(2), 10, y + 11, `500 12px ${MONO}`, '#5ec2d8'); c.fillStyle = '#1b2a1e';
        c.fillRect(34, y, 200, 11); c.fillStyle = v < 60 ? '#4ade80' : v < 85 ? '#facc15' : '#f87171'; c.fillRect(34, y, v * 2, 11); });
      if (m?.mem) lbl(c, `Mem ${(m.mem.used / 2 ** 30).toFixed(1)}G/${(m.mem.total / 2 ** 30).toFixed(1)}G  Load ${m.load.map((v) => v.toFixed(2)).join(' ')}`,
        250, 52, `500 13px ${MONO}`, '#d1fae5');
      c.fillStyle = '#4ade80'; c.fillRect(248, 68, 260, 16); lbl(c, '  PID  CPU%  MEM  COMMAND', 250, 80, `700 13px ${MONO}`, '#06260f');
      (m?.top || []).slice(0,
        10).forEach((q, i) =>
        lbl(c, `${String(q.pid).padStart(5)} ${q.cpu.toFixed(1).padStart(5)} ${String(q.rssMB).padStart(4)}M ${q.name}`.slice(0, 36), 250, 100 + i * 17,
        `500 13px ${MONO}`, '#d1fae5'));
      a.tex.needsUpdate = true; }
    { const c = b.ctx;
      lbl(c, `john@${m?.hostname || 'localhost'}: ~ $ journalctl -f`, 10, 22, `600 15px ${MONO}`, '#9fe8a8');
      (srv.jlog || []).slice(-15).forEach((l, i) => lbl(c, fit(c, l, b.W - 20), 10, 46 + i * 16, `500 12px ${MONO}`, /claude/.test(l) ? '#fcd34d' : '#cbd5c0'));
      if (Date.now() % 1000 < 500) { c.fillStyle = '#9fe8a8'; c.fillRect(10, 46 + Math.min(15, (srv.jlog || []).length) * 16 - 10, 8, 13); }
      b.tex.needsUpdate = true; }
  }
  // Per frame while you're here: doors (only those near you move), John, LEDs (15 Hz, only racks within 15 m), faces (2 Hz),
  // the NOC (1 Hz), polling (every 3 s).
  const _mx = new THREE.Matrix4(), _look = new THREE.Vector3();
  srv.fx = (dt, t) => {
    const now = Date.now(), z0 = srv.root.position.z, px = ctx.player.x, pz = ctx.player.z - z0;
    if (performance.now() - srv.polledAt > 3000) pollMachine();
    srv.colliders.length = srv.static;
    for (const d of srv.doors) {   // the access door
      const was = d.k;
      d.k = clamp(d.k + (Math.hypot(px - d.x, pz - d.z) < 1.6 ? dt / 0.7 : -dt / 0.9), 0, 1);
      if (!was && d.k) ctx.sfx.slide({ x: d.x, z: d.z + z0 }, true);
      d.leaves[0].position.z = ease(d.k) * d.pocket;
      if (d.k < 0.7) srv.colliders.push({ minX: d.x - 0.1, maxX: d.x + 0.1, minZ: z0 - SV.dw, maxZ: z0 + SV.dw });
    }
    let moved = false;
    srv.aisleDoors.forEach((d, i) => {
      const near = (px - d.x) ** 2 + (pz - d.z) ** 2 < 3.6;
      if (near || d.k > 0) { const was = d.k; d.k = clamp(d.k + (near ? dt / 0.6 : -dt / 0.9), 0, 1);
        if (!was && d.k) ctx.sfx.slide({ x: d.x, z: d.z + z0 }, true); }
      if (d.k < 0.7) srv.colliders.push({ minX: d.x - 0.05, maxX: d.x + 0.05, minZ: z0 + d.z - 0.6, maxZ: z0 + d.z + 0.6 });
      const e = ease(d.k);
      if (e === d.e) return;
      d.e = e; moved = true;
      for (const s of [0, 1]) { _mx.makeTranslation(d.x, RK.h / 2 - 0.02, d.z + (s ? 1 : -1) * (0.3 + e * 0.58)); srv.leafGlass.setMatrixAt(i * 2 + s, _mx);
        srv.leafFrame.setMatrixAt(i * 2 + s, _mx); }
    });
    if (moved) for (const im of [srv.leafGlass, srv.leafFrame]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    const jn = srv.john, cyc = (t + 5) % 52;
    jn.mood = ctx.johnChat.open ? 'lean' : cyc < 14 ? 'type' : cyc < 18 ? 'sip' : cyc < 29 ? 'type' : cyc < 37 ? 'lean' : cyc < 43 ? 'read' : 'type';
    jn.lookAt = ctx.johnChat.open ? _look.set(camera.position.x, 0, camera.position.z - z0) : null;   // his root is in srv.root's space
    jn.update(t, dt);
    srv.jdesk.mug.visible = jn.mood !== 'sip';
    if ((srv.tick += dt) > 1 / 15) {
      srv.tick = 0;
      const im = srv.leds, col = im.instanceColor;
      for (const o of srv.dyn) im.setColorAt(o.i, o.fn(o, t));
      let lo = Infinity, hi = -1;
      for (const g of srv.ledGroups) {
        if ((g.x - px) ** 2 + (g.z - pz) ** 2 > 225) continue;
        for (const o of g.dyn) im.setColorAt(o.i, o.fn(o, t));
        if (g.a < lo) lo = g.a;
        if (g.b > hi) hi = g.b;
      }
      col.clearUpdateRanges(); col.addUpdateRange(0, srv.ledAlways * 3);
      if (hi >= lo) col.addUpdateRange(lo * 3, (hi - lo + 1) * 3);
      col.needsUpdate = true;
    }
    if (now - srv.paintAt > 500) {
      srv.paintAt = now;
      syncSlots(now);
      for (const s of srv.slots) paintSlot(s, now);
      paintUnits(); srv.paintCracs();
      for (const A of srv.atlases) A.a.tex.needsUpdate = true;
      paintKvm(); paintJohnScreens();
    }
    if (now - srv.nocAt > 1000) { srv.nocAt = now; paintNoc(now); }
  };
  srv.map = () => {
    const c = mapCtx, W = 440, H = 330, z0 = srv.root.position.z, k = Math.min((W - 20) / (LIFT.x + 1 - SV.x0), (H - 50) / (SV.z1 - SV.z0)),
      sx = (x) => 10 + (x - SV.x0) * k, sz = (z) => 44 + (z - z0 - SV.z0) * k;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(sx(SV.x0), sz(SV.z0 + z0), (SV.x1 - SV.x0) * k, (SV.z1 - SV.z0) * k);
    c.fillRect(sx(SV.x1), sz(-SV.vz + z0), (LIFT.x - SV.x1) * k, SV.vz * 2 * k);
    c.fillStyle = 'rgba(80,140,255,.3)'; for (const z of AISLES) for (const B of BLOCKS) c.fillRect(sx(B.x0), sz(z - 0.6 + z0), (B.x1 - B.x0) * k, 1.2 * k);
    c.fillStyle = 'rgba(217,119,87,.35)'; c.fillRect(sx(NOC.x0), sz(NOC.z0 + z0), (NOC.x1 - NOC.x0) * k, (NOC.z1 - NOC.z0) * k);
    c.fillStyle = 'rgba(227,194,58,.25)'; c.fillRect(sx(STAGE.x0), sz(STAGE.z0 + z0), (STAGE.x1 - STAGE.x0) * k, (STAGE.z1 - STAGE.z0) * k);
    c.fillStyle = 'rgba(255,255,255,.5)';
    for (const b of srv.colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(1.5, (b.maxX - b.minX) * k), Math.max(1.5, (b.maxZ - b.minZ) * k));
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText('SERVER HALL · 47', 16, 28);
    c.font = '600 12px system-ui'; c.fillStyle = 'rgba(255,255,255,.75)';
    c.fillText('Sessions · Machine', sx(6.4), sz(z0 - 2.4));
    c.fillText('NOC · John', sx(NOC.x0) + 4, sz(NOC.z0 + z0) + 14); c.fillText('Staging', sx(STAGE.x0) + 4, sz(STAGE.z0 + z0) + 14);
    c.fillText('Lift', sx(LIFT.x) - 26, sz(z0) + 4);
    const jp = srv.john.root.position; c.fillStyle = '#d97757'; c.beginPath(); c.arc(sx(jp.x), sz(jp.z + z0), 4, 0, Math.PI * 2); c.fill();
    const ppx = sx(camera.position.x), ppz = sz(camera.position.z);
    c.save(); c.translate(ppx, ppz); c.rotate(-camera.rotation.y);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.fill();
    c.restore();
  };
  Object.assign(ctx, { srv });
  ctx.action('info', { hover: (h) => h.info() });
}
