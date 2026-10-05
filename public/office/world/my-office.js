// Your glass office: tinted walls with a frosted band, venetian blinds (on its glass and on every outside window), and
// glass doors, yours shared with every browser through /api/office; officeFx eases the blinds and doors each frame.

import * as THREE from 'three';
import { box, clamp, colliders, cyl, ease, lerp, makeCanvas, mat, mergedBoxes, ROOM, solid } from '../util.js';

export function install(ctx) {
  const { world, frameM, winRuns, winKey, WIN, shaftU, collide } = ctx;
  Object.assign(ctx, { glassDoor, wallGroup, hangBlind, officeFx });
  // ----- my office -----
  // Tinted glass that gets more opaque and reflective at grazing angles, so the walls read as solid.
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#b9d3da', transparent: true, opacity: 0.14, roughness: 0.03, metalness: 0, envMapIntensity: 2.2, specularIntensity: 1, depthWrite: false });
  glassM.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = mix(gl_FragColor.a, 0.62, pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0));');
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
  for (const [key, name] of [['side', 'Blinds'], ['front', 'Blinds'], ['north', 'North window blinds'], ['east', 'East window blinds'], ['west', 'West window blinds'], ['office', 'Window blinds'],
    ['meetSouth', 'Meeting room (south) blinds'], ['meetNorth', 'Meeting room (north) blinds'], ['meetSmall', 'Small meeting room blinds']]) blinds[key] = { key, name, k: 0, to: 0, runs: [] };
  const BL = { top: ROOM.h - 0.12, sp: 0.05, stack: 0.008, slatG: new THREE.BoxGeometry(1, 0.004, 0.058), railG: new THREE.BoxGeometry(1, 0.02, 0.06) };
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q0 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  // States: 0 raised, 0.5 lowered with the slats open, 1 closed. The first half drops the blind, the second tilts the slats.
  const blindShut = (k) => clamp(k * 2, 0, 1) * 0.3 + clamp(k * 2 - 1, 0, 1) * 0.6;
  function layBlind(r, k) {
    const drop = clamp(k * 2, 0, 1), tilt = clamp(k * 2 - 1, 0, 1) * 1.0;
    const railY = lerp(r.top - r.n * BL.stack - 0.02, r.bot, drop);
    _q.setFromEuler(_e.set(tilt, 0, 0));
    r.cells.forEach(([x, w], c) => {
      _s.x = w;
      r.rails.setMatrixAt(c, _m4.compose(_v.set(x, railY, 0), _q0, _s));
      for (let i = 0; i < r.n; i++) r.slats.setMatrixAt(c * r.n + i, _m4.compose(_v.set(x, Math.max(r.top - (i + 1) * BL.sp, railY + (r.n - i) * BL.stack), 0), _q, _s));
    });
    for (const m of [r.slats, r.rails]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  }
  function hangBlind(g, cells, top, bot, z, bl) {
    const n = Math.floor((top - bot - 0.02) / BL.sp), r = { cells, top, bot, n, slats: new THREE.InstancedMesh(BL.slatG, slatM, n * cells.length), rails: new THREE.InstancedMesh(BL.railG, railM, cells.length) };
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
    for (const [w, h, x, y] of [[W, 0.07, W / 2, 0.045], [W, 0.05, W / 2, H - 0.015], [0.05, H, 0.025, H / 2 + 0.01], [0.05, H, W - 0.025, H / 2 + 0.01]]) box(p, w, h, 0.045, '', x, y, 0, { material: frameM });
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
    Object.assign(d.box, { minX: Math.min(d.hx, tx) - 0.04, maxX: Math.max(d.hx, tx) + 0.04, minZ: Math.min(d.hz, tz) - 0.04, maxZ: Math.max(d.hz, tz) + 0.04 });
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
      if (d.k < 0.85 && want === 0) collide(ctx.player);
    }
  }
  Object.assign(ctx, { blinds, door, doors, glassM, frostTex, BL });
}
