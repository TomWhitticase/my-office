// Your glass office: tinted walls with a frosted band, venetian blinds (on its glass and on every outside window), and
// glass doors, yours shared with every browser through /api/office; officeFx eases the blinds and doors each frame.

import * as THREE from 'three';
import { artTexture, box, clamp, colliders, cyl, dash, ease, FONT, lerp, makeCanvas, makeScreen, mat, mergedBoxes, ROOM, solid } from '../util.js';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { world, frameM, winRuns, winKey, WIN, shaftU } = ctx;
  Object.assign(ctx, { glassDoor, wallGroup, hangBlind, officeFx });
  // ----- my office -----
  // Tinted glass that gets more opaque and reflective at grazing angles, so the walls read as solid.
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#b9d3da', transparent: true, opacity: 0.14, roughness: 0.03, metalness: 0, envMapIntensity: 2.2,
    specularIntensity: 1, depthWrite: false });
  glassM.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.a = mix(gl_FragColor.a, 0.62, pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0));');
  };
  const frostTex = (() => {
    const t = makeCanvas(128, 64), { ctx } = t;
    ctx.fillStyle = 'rgba(244,247,248,.62)'; ctx.fillRect(0, 0, 128, 34);
    for (let x = 8; x < 128; x += 16) { ctx.beginPath(); ctx.arc(x, 48, 4.5, 0, Math.PI * 2); ctx.fill(); }
    t.tex.wrapS = THREE.RepeatWrapping; t.tex.needsUpdate = true;
    return t.tex;
  })();
  // Venetian blinds: k 0 = raised, 1 = lowered with slats tilted ~57°, leaving thin slits of light.
  // A run is one InstancedMesh of slats (and one of bottom rails) for a row of [x, width] cells hanging from `top` down to `bot`.
  const slatM = mat('#e6e1d6', { roughness: 0.95, envMapIntensity: 0.25 }), railM = mat('#cfc9bd'), blinds = {};
  for (const [key, name] of [['side', 'Blinds'], ['front', 'Blinds'], ['north', 'North window blinds'], ['east', 'East window blinds'],
    ['west', 'West window blinds'], ['office', 'Window blinds'],
    ['meetSouth', 'Meeting room (south) blinds'], ['meetNorth', 'Meeting room (north) blinds'],
      ['meetSmall', 'Small meeting room blinds'], ['meetHuddle', 'Huddle room blinds']]) blinds[key] = { key, name, k: 0, to: 0, runs: [] };
  const BL = { top: ROOM.h - 0.12, sp: 0.05, stack: 0.008, slatG: new THREE.BoxGeometry(1, 0.004, 0.058), railG: new THREE.BoxGeometry(1, 0.02, 0.06) };
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q0 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(),
    _s = new THREE.Vector3(1, 1, 1);
  // States: 0 raised, 0.5 lowered with the slats open, 1 closed. The first half drops the blind, the second tilts the slats.
  const blindShut = (k) => clamp(k * 2, 0, 1) * 0.3 + clamp(k * 2 - 1, 0, 1) * 0.6;
  function layBlind(r, k) {
    const drop = clamp(k * 2, 0, 1), tilt = clamp(k * 2 - 1, 0, 1) * 1.0;
    const railY = lerp(r.top - r.n * BL.stack - 0.02, r.bot, drop);
    _q.setFromEuler(_e.set(tilt, 0, 0));
    r.cells.forEach(([x, w], c) => {
      _s.x = w;
      r.rails.setMatrixAt(c, _m4.compose(_v.set(x, railY, 0), _q0, _s));
      for (let i = 0; i < r.n;
        i++) r.slats.setMatrixAt(c * r.n + i, _m4.compose(_v.set(x, Math.max(r.top - (i + 1) * BL.sp, railY + (r.n - i) * BL.stack), 0), _q, _s));
    });
    for (const m of [r.slats, r.rails]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  }
  function hangBlind(g, cells, top, bot, z, bl) {
    const n = Math.floor((top - bot - 0.02) / BL.sp),
      r = { cells, top, bot, n, slats: new THREE.InstancedMesh(BL.slatG, slatM, n * cells.length),
      rails: new THREE.InstancedMesh(BL.railG, railM, cells.length) };
    g.add(mergedBoxes(cells.map(([x, w]) => [w, 0.05, 0.07, x, top + 0.03, z]), mat('#d9d4c9')));
    for (const m of [r.slats, r.rails]) { m.position.z = z; m.castShadow = true; m.userData = { action: 'blinds', blind: bl, reach: 6 }; g.add(m); }
    bl.runs.push(r); layBlind(r, 0);
  }
  // A group on the `inward` side of a wall along x (z fixed) or z (x fixed), centred at `mid`; ux maps a wall coordinate to its local x.
  function wallGroup(axis, fixed, inward, mid) {
    const X = axis === 'x', g = new THREE.Group();
    g.position.set(X ? mid : fixed, 0, X ? fixed : mid); g.rotation.y = X ? (inward > 0 ? 0 : Math.PI) : inward * Math.PI / 2; world.add(g);
    const sx = X ? Math.cos(g.rotation.y) : -Math.sin(g.rotation.y);
    return { g, ux: (u) => (u - mid) * sx };
  }
  function glass(axis, fixed, from, to, bl) {
    const len = to - from, mid = (from + to) / 2, X = axis === 'x';
    const at = (u, w, h, d, y, m) => box(world, X ? w : d, h, X ? d : w, '', X ? u : fixed, y, X ? fixed : u, { material: m, shadow: false });
    const pane = at(mid, len, ROOM.h, 0.03, ROOM.h / 2, glassM);
    pane.userData = { action: 'blinds', blind: bl, reach: 3.5, glass: true };
    at(mid, len, 0.06, 0.06, 0.03, frameM); at(mid, len, 0.06, 0.06, ROOM.h - 0.03, frameM);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) at(from + (i * len) / n, 0.05, ROOM.h, 0.07, ROOM.h / 2, frameM);
    const fm = new THREE.MeshStandardMaterial({ map: frostTex.clone(), transparent: true, roughness: 0.9, depthWrite: false });
    fm.map.repeat.set(len / 0.32, 1); fm.map.needsUpdate = true;
    at(mid, len, 0.16, 0.036, 1.46, fm).userData = pane.userData;
    solid(X ? mid : fixed, X ? fixed : mid, X ? len : 0.08, X ? 0.08 : len);
    // Blind hangs on the office side of the glass.
    const g = new THREE.Group();
    g.position.set(X ? mid : fixed, 0, X ? fixed : mid); g.rotation.y = X ? Math.PI : Math.PI / 2; world.add(g);
    hangBlind(g, [[0, len - 0.2]], BL.top, 0.06, 0.11, bl);
  }
  glass('z', 6, -15, -3.5, blinds.side);
  glass('x', -3.5, 6, 7, blinds.front);
  glass('x', -3.5, 8.4, 20, blinds.front);
  // Outside windows: a blind per pane just inside the glass, above the sill. One run per wall stretch and group.
  for (const w of winRuns) {
    const X = w.axis === 'x', { g, ux } = wallGroup(w.axis, w.fixed, w.inward, (w.a + w.b) / 2), cells = {};
    const cell = (a, b) => (cells[winKey(w.axis, w.fixed, (a + b) / 2)] ||= []).push([ux((a + b) / 2), b - a]);
    for (let q = 0; q < w.n; q++) {
      const a = w.a + q * w.step + 0.07, b = w.a + (q + 1) * w.step - 0.07;
      if (!X && w.fixed > 0 && a < -3.5 && b > -3.5) { cell(a, -3.56); cell(-3.44, b); } else cell(a, b);   // my office's glass meets the east wall here
    }
    for (const [key, cs] of Object.entries(cells)) hangBlind(g, cs, 3.0, 0.53, 0.16, blinds[key]);
    w.glass.userData = { action: 'blinds', glass: true, reach: 3.5, blindAt: (p) => blinds[winKey(w.axis, w.fixed, X ? p.x : p.z)] };
  }
  for (const x of [7, 8.4]) box(world, 0.06, ROOM.h, 0.06, '', x, ROOM.h / 2, -3.5, { material: frameM, shadow: false });
  box(world, 1.46, 0.08, 0.08, '', 7.7, 2.24, -3.5, { material: frameM, shadow: false });
  box(world, 1.34, ROOM.h - 2.34, 0.03, '', 7.7, (ROOM.h + 2.28) / 2, -3.5, { material: glassM, shadow: false });
  // Glass doors: a leaf hinged at (hx, hz), lying along angle r0 when shut and swinging `swing` (±1) quarter turns open.
  // An invisible box over the whole leaf takes the clicks (the glass itself is on layer 1, which the ray skips). Its
  // collider follows it, and `auto` doors open by themselves while someone walks through.
  const doors = [], doorHitM = new THREE.MeshBasicMaterial();
  function glassDoor({ name, hx, hz, r0, swing, W, H = 2.18, auto = false }) {
    const d = { name, k: 0, to: 0, r0, swing, W, hx, hz, auto, pivot: new THREE.Group(), box: {} };
    const p = d.pivot;
    p.position.set(hx, 0, hz); p.rotation.y = r0; world.add(p);
    box(p, W, H, 0.025, '', W / 2, H / 2 + 0.01, 0, { material: glassM, shadow: false });
    for (const [w, h, x, y] of [[W, 0.07, W / 2, 0.045], [W, 0.05, W / 2, H - 0.015], [0.05, H, 0.025, H / 2 + 0.01],
      [0.05, H, W - 0.025, H / 2 + 0.01]]) box(p, w, h, 0.045, '', x, y, 0, { material: frameM });
    const fm = new THREE.MeshStandardMaterial({ map: frostTex.clone(), transparent: true, roughness: 0.9, depthWrite: false });
    fm.map.repeat.set(W / 0.32, 1); fm.map.needsUpdate = true;
    box(p, W - 0.1, 0.16, 0.03, '', W / 2, 1.46, 0, { material: fm, shadow: false });
    for (const s of [-1, 1]) {
      cyl(p, 0.014, 0.014, 0.9, '#b8bcc2', W - 0.12, 1.05, s * 0.07, { mat: { metalness: 0.9, roughness: 0.25 } });
      for (const y of [0.65, 1.45]) box(p, 0.018, 0.018, 0.06, '#b8bcc2', W - 0.12, y, s * 0.04, { mat: { metalness: 0.9, roughness: 0.25 } });
    }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.1), doorHitM);
    hit.position.set(W / 2, H / 2, 0); hit.visible = false; p.add(hit);
    p.traverse((o) => { if (o.isMesh) o.userData = { action: 'door', door: d, reach: 5 }; });
    setDoorBox(d, false);
    colliders.push(d.box);
    doors.push(d);
    return d;
  }
  function setDoorBox(d, open) {
    const r = d.r0 + (open ? d.swing * Math.PI / 2 : 0), tx = d.hx + Math.cos(r) * d.W, tz = d.hz - Math.sin(r) * d.W;
    Object.assign(d.box,
      { minX: Math.min(d.hx, tx) - 0.04, maxX: Math.max(d.hx, tx) + 0.04, minZ: Math.min(d.hz, tz) - 0.04, maxZ: Math.max(d.hz, tz) + 0.04 });
  }
  // Mine: hinged on the left post, swinging into my office; shared with every browser via /api/office.
  const door = glassDoor({ name: 'Office door', hx: 7.04, hz: -3.5, r0: 0, swing: 1, W: 1.34 });
  function officeFx(dt) {
    for (const b of Object.values(blinds)) if (b.k !== b.to) {
      b.k = b.to > b.k ? Math.min(b.to, b.k + dt / 2.2) : Math.max(b.to, b.k - dt / 2.2);
      for (const r of b.runs) layBlind(r, b.k);
      if (WIN.includes(b.key)) shaftU.shut.value[WIN.indexOf(b.key)] = blindShut(b.k);
    }
    for (const d of doors) {
      const mid = { x: d.hx + Math.cos(d.r0) * d.W / 2, z: d.hz - Math.sin(d.r0) * d.W / 2 };
      const want = d.auto && [...ctx.people.values()].some((q) => Math.hypot(q.root.position.x - mid.x, q.root.position.z - mid.z) < 1.3) ? 1 : d.to;
      if (d.k === want) continue;
      d.k = want > d.k ? Math.min(1, d.k + dt / 0.9) : Math.max(0, d.k - dt / 0.9);
      d.pivot.rotation.y = d.r0 + d.swing * ease(d.k) * Math.PI * 0.5;
      setDoorBox(d, d.k > 0.85);
      if (d.k < 0.85 && want === 0) ctx.collide(ctx.player);
    }
  }
  Object.assign(ctx, { blinds, door, doors, glassM, frostTex, BL });
  ctx.onFrame((dt) => officeFx(dt), 60);
  ctx.action('blinds',
    { hover: (h) => `<b>${h.blind.name}</b><div class="k">Click to ${['lower the blinds', 'close the slats', 'raise the blinds'][h.blind.to * 2]}</div>`,
    click: (h) => { h.blind.to = h.blind.to === 1 ? 0 : h.blind.to + 0.5; dash.putOffice({ blinds: { [h.blind.key]: h.blind.to } }); } });
  ctx.action('door', { hover: (h) => `<b>${h.door.name}</b><div class="k">Click to ${h.door.to ? 'close' : 'open'}</div>`,
    click: (h) => { const d = h.door; d.to = d.to ? 0 : 1; if (d === door) dash.putOffice({ door: d.to }); } });
  ctx.hoverTargets(() => doors.map((d) => d.pivot), 50);
  ctx.hoverTargets(() => [...new Set(Object.values(blinds).flatMap((b) => b.runs.map((r) => r.slats.parent)))], 90);
  ctx.hoverTargets(() => world.children.filter((o) => o.userData.glass), 100);
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function installScreen(ctx) {
  const { OWNER, monitor, world, cssScene, laptop } = ctx;
  Object.assign(ctx, { placeHole, syncCss, layoutCenterMonitor });
  // The centre monitor: the real dashboard page, sized to the viewport's aspect so the
  // zoom transition starts and ends pixel-identical to the flat overview.
  const center = { x: OWNER.x, z: OWNER.z - 0.3, w: 1.25, h: 0.7 };
  const centerMon = monitor(world, 1, 1, center.x, 0.765, center.z);
  const holeM = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, side: THREE.DoubleSide });
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), holeM);
  hole.userData.action = 'computer';
  centerMon.g.add(hole);
  const domScreen = document.createElement('div');
  domScreen.className = 'of-dom';
  const cssObj = new CSS3DObject(domScreen);
  cssObj.element.style.pointerEvents = 'none';
  cssScene.add(cssObj);
  const screenWorld = new THREE.Vector3(), lapScr = { w: 0.3, h: 0.19 }, cssPx = { w: 1, h: 1 }, cssS = new THREE.Vector3();
  // While the MacBook's open the one live page sits on its lid instead, and the monitor says where it went.
  const awayScr = makeScreen(centerMon.g, 1, 1, 640, 360, 0, 0, 0.011);
  awayScr.mesh.visible = false;
  {
    const { ctx: a } = awayScr, gr = a.createLinearGradient(0, 0, 640, 360);
    gr.addColorStop(0, '#1b2433'); gr.addColorStop(1, '#0d1118'); a.fillStyle = gr; a.fillRect(0, 0, 640, 360);
    a.textAlign = 'center'; a.fillStyle = '#e8e6df'; a.font = `600 30px ${FONT}`; a.fillText('Open on your MacBook', 320, 178);
    a.fillStyle = '#8d96a6'; a.font = `400 18px ${FONT}`; a.fillText('Lounge · corner nook', 320, 212);
    awayScr.tex.needsUpdate = true;
  }
  function layoutCenterMonitor(pxW, pxH) {
    center.h = center.w * pxH / pxW;
    // The lid's display area (302 × 196 mm), filled edge to edge: the page is laid out at the lid's shape while it's there.
    lapScr.w = 0.302; lapScr.h = 0.196;
    centerMon.bezel.scale.set(center.w + 0.03, center.h + 0.03, 1);
    centerMon.bezel.position.y = 0.12 + center.h / 2;
    awayScr.mesh.scale.set(center.w, center.h, 1); awayScr.mesh.position.y = 0.12 + center.h / 2;
    Object.assign(cssPx, { vw: pxW, vh: pxH });
    placeHole();
  }
  function placeHole() {
    const lap = laptop.shown, s = lap ? lapScr : center;
    const pw = cssPx.vw, ph = lap ? Math.round(pw * lapScr.h / lapScr.w) : cssPx.vh;
    if (pw !== cssPx.w || ph !== cssPx.h) { domScreen.style.width = pw + 'px'; domScreen.style.height = ph + 'px'; Object.assign(cssPx, { w: pw, h: ph }); }
    (lap ? laptop.pivot : centerMon.g).add(hole);
    hole.scale.set(s.w, s.h, 1);
    if (lap) hole.position.set(0, laptop.LH - 0.004 - s.h / 2, 0.001); else hole.position.set(0, 0.12 + center.h / 2, 0.012);
    awayScr.mesh.visible = lap;
    centerMon.g.updateWorldMatrix(true, true);
    (lap ? awayScr.mesh : hole).getWorldPosition(screenWorld);
    syncCss();
  }
  // The CSS3D page follows the hole (the lid moves), at one CSS pixel per screen pixel.
  function syncCss() {
    hole.updateWorldMatrix(true, false);
    hole.matrixWorld.decompose(cssObj.position, cssObj.quaternion, cssS);
    cssObj.scale.setScalar(cssS.x / cssPx.w);
  }
  Object.assign(ctx, { hole, holeM, lapScr, center, screenWorld, domScreen });
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function installDesk(ctx) {
  const { world, legM, officeChair, monitor, sofa, plant, bookshelf, art, smallPlant, pendant, floorLamp, markerBoard, rug } = ctx;
  const OWNER = { x: 13, z: -11.6 };
  box(world, 3.4, 0.05, 1.0, '#2a2724', OWNER.x, 0.74, OWNER.z, { mat: { roughness: 0.35 } });
  box(world, 0.05, 0.72, 0.9, '', OWNER.x - 1.65, 0.36, OWNER.z, { material: legM });
  box(world, 0.05, 0.72, 0.9, '', OWNER.x + 1.65, 0.36, OWNER.z, { material: legM });
  box(world, 0.46, 0.015, 0.15, '#3a3c40', OWNER.x, 0.77, OWNER.z + 0.27);
  cyl(world, 0.04, 0.035, 0.1, '#d97757', OWNER.x + 0.75, 0.815, OWNER.z + 0.3);
  solid(OWNER.x, OWNER.z, 3.4, 1.0);
  officeChair(OWNER.x, OWNER.z + 1.15, Math.PI, '#1d1f22');
  const leftMon = monitor(world, 0.9, 0.5625, OWNER.x - 1.18, 0.765, OWNER.z - 0.12, 0.5);
  const usageScr = makeScreen(leftMon.g, 0.9, 0.5625, 800, 500, 0, leftMon.screenY, leftMon.screenZ);
  const rightMon = monitor(world, 0.9, 0.5625, OWNER.x + 1.18, 0.765, OWNER.z - 0.12, -0.5);
  const rosterScr = makeScreen(rightMon.g, 0.9, 0.5625, 800, 500, 0, rightMon.screenY, rightMon.screenZ);
  const wallTV = makeScreen(world, 3.4, 1.7, 1280, 640, OWNER.x, 2.42, -14.86);
  box(world, 3.5, 1.8, 0.06, '#111214', OWNER.x, 2.42, -14.9);
  sofa(19.3, -9, -Math.PI / 2, 2.4, '#3d3a36');
  plant(18.9, -14.3, 1.2); plant(6.6, -14.3);

  // The one under the neon is a door: world/secret-room.js takes this out and builds it again in three sections (built
  // here still, so what's built after it draws the same random numbers).
  const secretShelf = bookshelf(8.6, -14.7, 0, 2.4, 2.2, 5);
  art(10.52, 1.82, -14.92, 0, 0.84, 1.12);   // between the bookshelf and the TV (the task board has the wall right of it), the clock above it
  smallPlant(world, 16.6, 1.1, -3.0);
  pendant(13, -10.6, { drop: 0.85, light: 12, shade: '#d97757' });
  floorLamp(19.3, -10.8, 10);
  smallPlant(world, OWNER.x - 1.5, 0.765, OWNER.z + 0.3);
  // Lived-in bits: desk clutter kept below the screens, a credenza under the TV, books and a whiteboard along the glass,
  // a lounge corner by the windows, a round table for 1:1s and a coat stand by the door.
  {
    const vcM = mat('#ffffff', { vertexColors: true, roughness: 0.6 }), shinyM = mat('#ffffff', { vertexColors: true, roughness: 0.3, metalness: 0.7 });
    const dy = 0.765, dx = OWNER.x, dz = OWNER.z;
    box(world, 0.21, 0.015, 0.28, '#2b3650', dx - 0.62, dy + 0.008, dz + 0.24).rotation.y = 0.15;   // notebook and pen
    cyl(world, 0.006, 0.006, 0.14, '#d97757', dx - 0.47, dy + 0.007, dz + 0.24, { seg: 6 }).rotation.x = Math.PI / 2;
    box(world, 0.075, 0.008, 0.15, '#1c1c1e', dx + 0.45, dy + 0.004, dz + 0.3).rotation.y = -0.2;   // phone
    // Headphones on a stand at the front corner.
    world.add(mergedBoxes([[0.12, 0.012, 0.1, dx + 1.56, dy + 0.006, dz + 0.36, '#2a2c30'], [0.015, 0.24, 0.015, dx + 1.56, dy + 0.13, dz + 0.36, '#2a2c30'],
      [0.03, 0.03, 0.17, dx + 1.56, dy + 0.255, dz + 0.36, '#1c1c1e']], vcM));
    for (const s of [-1, 1]) {
      box(world, 0.018, 0.17, 0.02, '#1c1c1e', dx + 1.56, dy + 0.18, dz + 0.36 + s * 0.085);
      box(world, 0.06, 0.08, 0.035, '#3a3c40', dx + 1.56, dy + 0.11, dz + 0.36 + s * 0.095);
    }

    // Credenza under the TV: four doors, a speaker, books, a framed photo, a trophy and an espresso machine.
    const cz = -14.6, cy = 0.76;
    const cred = [[3.2, 0.62, 0.46, dx, 0.41, cz, '#5e4029'], [3.26, 0.04, 0.5, dx, 0.74, cz, '#3a281a']];
    for (const fx of [-1.6, 1.6]) for (const fz of [-0.18, 0.18]) cred.push([0.04, 0.1, 0.04, dx + fx * 0.95, 0.05, cz + fz, '#2f3236']);
    for (let i = 1; i < 4; i++) cred.push([0.01, 0.56, 0.005, dx - 1.6 + i * 0.8, 0.41, cz + 0.232, '#2a1d12']);
    for (let i = 0; i < 4; i++) cred.push([0.012, 0.16, 0.02, dx - 1.6 + i * 0.8 + (i % 2 ? 0.07 : 0.73), 0.5, cz + 0.24, '#b8bcc2']);
    world.add(mergedBoxes(cred, vcM));
    solid(dx, cz, 3.26, 0.5);
    world.add(mergedBoxes([[0.18, 0.3, 0.18, dx - 1.38, cy + 0.15, cz, '#1c1c1e'], [0.2, 0.032, 0.26, dx - 0.95, cy + 0.016, cz, '#8c3b2f'],
      [0.18, 0.03, 0.24, dx - 0.95, cy + 0.047, cz, '#e7dcc8'], [0.19, 0.035, 0.25, dx - 0.95, cy + 0.08, cz, '#2f5d62'],
      [0.015, 0.16, 0.12, dx - 0.62, cy + 0.08, cz, '#2a2c30'], [0.015, 0.16, 0.12, dx - 0.27, cy + 0.08, cz, '#2a2c30']], vcM));
    cyl(world, 0.05, 0.05, 0.01, '#3a3c40', dx - 1.38, cy + 0.2, cz + 0.091, { seg: 20 }).rotation.x = Math.PI / 2;   // speaker cone
    cyl(world, 0.025, 0.025, 0.01, '#3a3c40', dx - 1.38, cy + 0.07, cz + 0.091, { seg: 16 }).rotation.x = Math.PI / 2;
    world.add(mergedBoxes(['#3f4a6b', '#d9a441', '#1f2a33', '#a35d7a', '#6b8e4e',
      '#c26a3d'].map((c, i) => [0.035, 0.2 + (i % 3) * 0.025, 0.15, dx - 0.585 + 0.045 * (i + 1), cy + 0.1 + (i % 3) * 0.0125, cz, c]), vcM));
    smallPlant(world, dx - 0.95, cy + 0.1, cz);
    {
      const g = new THREE.Group(); g.position.set(dx + 0.3, cy, cz + 0.02); g.rotation.set(-0.15, -0.25, 0); world.add(g);
      box(g, 0.24, 0.3, 0.02, '#1c1a18', 0, 0.15, 0);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.24), new THREE.MeshStandardMaterial({ map: artTexture(ctx.artSeed++, 0.75), roughness: 0.9 }));
      pic.position.set(0, 0.15, 0.011); g.add(pic);
    }
    // Trophy: plinth, stem, cup.
    world.add(mergedBoxes([[0.12, 0.06, 0.12, dx + 0.75, cy + 0.03, cz, '#2a2724']], vcM));
    cyl(world, 0.012, 0.02, 0.08, '#d9a441', dx + 0.75, cy + 0.1, cz, { mat: { metalness: 0.9, roughness: 0.25 } });
    cyl(world, 0.07, 0.03, 0.1, '#d9a441', dx + 0.75, cy + 0.19, cz, { mat: { metalness: 0.9, roughness: 0.25 } });
    // Espresso machine with a cup on the drip tray.
    world.add(mergedBoxes([[0.32, 0.36, 0.3, dx + 1.3, cy + 0.18, cz - 0.03, '#b8bcc2'], [0.24, 0.04, 0.12, dx + 1.3, cy + 0.32, cz + 0.16, '#2a2c30'],
      [0.24, 0.02, 0.12, dx + 1.3, cy + 0.04, cz + 0.16, '#2a2c30'], [0.06, 0.05, 0.06, dx + 1.3, cy + 0.27, cz + 0.17, '#1c1c1e']], shinyM));
    cyl(world, 0.03, 0.025, 0.06, '#f4f1ea', dx + 1.3, cy + 0.08, cz + 0.17, { seg: 12 });

    // Neon over the bookshelf, a tall plant beside it.
    const neon = makeScreen(world, 1.8, 0.45, 720, 180, 8.6, 2.75, -14.86);
    neon.ctx.clearRect(0, 0, 720, 180);
    neon.ctx.font = `italic 700 96px ${FONT}`; neon.ctx.textAlign = 'center';
    neon.ctx.shadowColor = '#ff8a4c'; neon.ctx.shadowBlur = 30; neon.ctx.fillStyle = '#ffe2c8';
    neon.ctx.fillText('stay curious', 360, 120); neon.ctx.fillText('stay curious', 360, 120);
    neon.mesh.material.transparent = true; neon.tex.needsUpdate = true;
    plant(10.4, -14.4, 0.9);

    // Along the west glass: a tall bookcase, a rolling whiteboard, the coat stand by the door. Kept clear of the blind.
    bookshelf(6.38, -12.4, Math.PI / 2, 2.2, 2.2, 5);
    const wg = new THREE.Group(); wg.position.set(6.5, 0, -8.6); wg.rotation.y = Math.PI / 2; world.add(wg);
    wg.add(mergedBoxes([[1.76, 1.02, 0.04, 0, 1.4, -0.01, '#b9bcc0'], [0.04, 1.85, 0.04, -0.86, 0.93, -0.03, '#8d9399'],
      [0.04, 1.85, 0.04, 0.86, 0.93, -0.03, '#8d9399'],
      [0.06, 0.04, 0.5, -0.86, 0.08, -0.03, '#5a5f66'], [0.06, 0.04, 0.5, 0.86, 0.08, -0.03, '#5a5f66'], [1.7, 0.03, 0.06, 0, 0.87, 0.03, '#b9bcc0']],
    mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.3 })));
    markerBoard('office', 'whiteboard', makeScreen(wg, 1.7, 0.96, 768, 434, 0, 1.4, 0.012), (c) => {
      const node = (x, y, t, col) =>
        { c.strokeStyle = col; c.strokeRect(x - 90, y - 34, 180, 68); c.fillStyle = col; c.font = `600 30px "Marker Felt", "Comic Sans MS", ${FONT}`;
        c.textAlign = 'center'; c.fillText(t, x, y + 10); };
      node(130, 90, '~/.claude', '#1f6fd1'); node(384, 90, 'server', '#2e8b57'); node(638, 90, 'office', '#c0392b');
      c.strokeStyle = '#333';
      for (const x of [220, 474]) { c.beginPath(); c.moveTo(x, 90); c.lineTo(x + 70, 90); c.lineTo(x + 56, 80); c.moveTo(x + 70, 90); c.lineTo(x + 56, 100);
        c.stroke(); }
      c.textAlign = 'left'; c.fillStyle = '#333'; c.font = `400 28px "Marker Felt", "Comic Sans MS", ${FONT}`;
      ['Q4', '- hire 2 engineers', '- launch v2 ✦', '- inbox zero (lol)'].forEach((t, i) => c.fillText(t, 50, 200 + i * 52));
      c.strokeStyle = '#d97757'; c.beginPath(); c.ellipse(560, 300, 140, 60, 0.1, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#d97757'; c.fillText('1:1s Thu', 500, 310);
    });
    solid(6.5, -8.6, 0.5, 1.8);
    {
      const x = 6.45, z = -5.3;
      cyl(world, 0.22, 0.24, 0.03, '#2a2a2a', x, 0.015, z, { seg: 20 }); cyl(world, 0.02, 0.025, 1.8, '#5a3d28', x, 0.9, z);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4;
        box(world, 0.16, 0.02, 0.02, '#2a2a2a', x + Math.cos(a) * 0.07, 1.72, z + Math.sin(a) * 0.07).rotation.y = -a; }
      box(world, 0.16, 0.75, 0.34, '#1f2a44', x + 0.09, 1.32, z - 0.02).rotation.x = 0.05;   // a coat
      box(world, 0.05, 0.12, 0.3, '#2a2724', x - 0.08, 1.6, z + 0.02);                       // a bag strap
      solid(x, z, 0.4, 0.4);
    }

    // Lounge corner by the windows: two armchairs across a coffee table from the sofa, on a rug.
    rug(16.7, 19.85, -11.4, -6.6, '#e2d6c0', '#8b5a3c');
    sofa(17.9, -10.65, 0, 1.05, '#8b5a3c'); sofa(17.9, -7.35, Math.PI, 1.05, '#8b5a3c');
    box(world, 0.9, 0.04, 0.55, '#8a6a4a', 17.9, 0.4, -9, { mat: { roughness: 0.5 } });
    for (const [ox, oz] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) box(world, 0.035, 0.38, 0.035, '', 17.9 + ox, 0.19, -9 + oz,
      { material: legM });
    world.add(mergedBoxes([[0.24, 0.03, 0.18, 17.75, 0.435, -9.08, '#1f2a33'], [0.22, 0.025, 0.17, 17.76, 0.462, -9.07, '#d9a441']], vcM));
    cyl(world, 0.04, 0.035, 0.1, '#2f6f8f', 18.15, 0.47, -8.9);
    smallPlant(world, 17.98, 0.42, -9.15);
    solid(17.9, -9, 0.9, 0.55);
    plant(19.3, -4.2, 1.35);

    // Round table for 1:1s.
    const tx = 15.4, tz = -5.5;
    cyl(world, 0.55, 0.55, 0.04, '#f2efe9', tx, 0.74, tz, { seg: 32 });
    cyl(world, 0.04, 0.04, 0.72, '#2f3236', tx, 0.36, tz);
    cyl(world, 0.28, 0.28, 0.03, '#2f3236', tx, 0.015, tz);
    solid(tx, tz, 1.1, 1.1);
    for (const a of [Math.PI / 2, -Math.PI / 2, 0]) officeChair(tx - Math.sin(a) * 0.85, tz - Math.cos(a) * 0.85, a, '#4b5a6a');
    box(world, 0.21, 0.015, 0.28, '#e7dcc8', tx - 0.18, 0.768, tz + 0.05).rotation.y = -0.3;
    cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', tx + 0.22, 0.81, tz - 0.12);
    pendant(tx, tz, { drop: 1.05, shade: '#2b3650' });
  }
  Object.assign(ctx, { OWNER, usageScr, rosterScr, wallTV, secretShelf });
}
