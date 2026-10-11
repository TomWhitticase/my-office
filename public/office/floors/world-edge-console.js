// The operator's console in the gallery behind the sky (world-edge-backstage.js): a standing desk of three angled
// panels on the near side of the model table, facing it and the monitor bank beyond, each control a thing you take hold
// of, with its name engraved by it and a lit readout on the bridge behind:
//   TIME: a big 24-hour dial (the time of day: scrub it and the sky, the sun and its shadows, the office's lights and the
//     table's model follow), LIVE (back on the real clock), and the TIME SPEED switch, HOLD · LIVE · ×1 · ×120 · ×1200 ·
//     ×7200 (the HUD's speeds, ctx.clockState, the same state both ways; HOLD stops the clock where it is).
//   WEATHER: a selector, clear to snow (world/weather.js), a CLOUD COVER fader and a WIND knob.
//   BUILDING: the office's LIGHTS fader and AUTO, the BLINDS (up, slats, closed: every blind, as the Admin app's buttons
//     for them all), a big red STOP and an ON AIR lamp (for show), and RESET ALL (back to the real clock, the usual sky,
//     the lights on auto and the blinds up).
// Hold the mouse button on one and move the mouse to turn or slide it (the view stays put while you do), click to step
// it (Shift+click the other way) or set a fader where you point, or scroll over it. The time and weather are kept in this
// browser with the clock; the lights and blinds are the office's settings (the Admin app's).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, dash, FONT, makeCanvas } from '../util.js';

const PX = 1024;   // canvas pixels a metre on the panels
const MONO = 'ui-monospace, Menlo, monospace';

export function installConsole(ctx, bs, PLAN) {
  const { renderer } = ctx, root = bs.root, { TC } = PLAN;
  const hits = [], cols = [], ctls = [];
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, ...o });
  const placed = (o, p, sc) => { o.position.set(...p); if (sc) o.scale.set(...sc); return o; };
  const CX = TC.x - 3.3, CZ = TC.z;   // its middle; the operator stands on the -x side, facing +x (the table)
  const con = new THREE.Group(); con.position.set(CX, 0, CZ); con.rotation.y = -Math.PI / 2; root.add(con);   // local +z: toward you, +x: your right
  cols.push({ minX: CX - 0.75, maxX: CX + 0.42, minZ: CZ - 1.75, maxZ: CZ + 1.75 });

  // ----- the desk: three panels, the wings turned in toward you -----
  const bodyM = M({ color: '#2a2c31', roughness: 0.5, metalness: 0.3 }), trimM = M({ color: '#111214', roughness: 0.4, metalness: 0.5 });
  const segs = [-1, 0, 1].map((k) => {
    const g = new THREE.Group(); con.add(g);
    if (k) { const pivot = new THREE.Group(); pivot.position.x = k * 0.52; pivot.rotation.y = -k * 0.35; con.add(pivot); pivot.add(g); g.position.x = k * 0.52; }
    const body = [new THREE.BoxGeometry(1.03, 0.85, 0.66).translate(0, 0.425, 0.02), new THREE.BoxGeometry(1.03, 0.08, 0.06).translate(0, 0.06, 0.37)];
    g.add(new THREE.Mesh(mergeGeometries(body.map((b) => b.toNonIndexed())), bodyM));
    const top = new THREE.Group(); top.position.set(0, 0.99, 0); top.rotation.x = 0.3; g.add(top);   // the sloped panel, back edge up
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.035, 0.72), trimM); lip.position.y = -0.02; top.add(lip);
    const bridge = new THREE.Group(); bridge.position.set(0, 1.27, -0.4); bridge.rotation.x = -0.3; g.add(bridge);   // the readouts' bridge
    bridge.add(new THREE.Mesh(new THREE.BoxGeometry(1.03, 0.22, 0.08).translate(0, 0, -0.045), trimM));
    g.add(placed(new THREE.Mesh(new THREE.BoxGeometry(1.03, 0.42, 0.05), bodyM), [0, 1.03, -0.35]));
    // the panel's face: engraved legends and scales (painted below), faintly backlit
    const face = makeCanvas(PX, Math.round(0.7 * PX)), fm = new THREE.MeshStandardMaterial({ map: face.tex, emissiveMap: face.tex, emissive: '#ffffff', emissiveIntensity: 0.4, roughness: 0.55, metalness: 0.35 });
    const faceM = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7).rotateX(-Math.PI / 2), fm); faceM.position.y = 0.0; top.add(faceM);
    const rd = makeCanvas(PX, Math.round(0.18 * PX)), rm = new THREE.MeshBasicMaterial({ map: rd.tex, color: new THREE.Color(1.5, 1.5, 1.5) });
    const rdM = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.18), rm); rdM.position.z = 0.001; bridge.add(rdM);
    return { g, top, bridge, face, rd, rdText: '' };
  });
  // panel space (x across, z toward you, on the top's surface) to its canvas
  const P = (x, z) => [(x + 0.5) * PX, (z + 0.35) * PX];
  function engrave(c, text, x, z, size = 22, align = 'center', col = '#d8dbe0') {
    const [u, v] = P(x, z);
    c.font = `700 ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,.7)'; c.fillText(text, u + 1.5, v + 1.5);
    c.fillStyle = col; c.fillText(text, u, v);
  }
  function plate(c) {
    c.fillStyle = '#26282d'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; c.fillRect(Math.random() * c.canvas.width, Math.random() * c.canvas.height, 40 + Math.random() * 80, 1); }   // brushed
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 4; c.strokeRect(8, 8, c.canvas.width - 16, c.canvas.height - 16);
    for (const [x, y] of [[24, 24], [c.canvas.width - 24, 24], [24, c.canvas.height - 24], [c.canvas.width - 24, c.canvas.height - 24]]) { c.fillStyle = '#4a4d54'; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); }
  }
  // round a dial: a label at angle a (0 toward the back, clockwise as you look down) and r out
  const around = (x, z, a, r) => [x + r * Math.sin(a), z - r * Math.cos(a)];
  function ticks(c, x, z, r0, r1, a, w = 3, col = '#c9ccd2') {
    const [u0, v0] = P(...around(x, z, a, r0)), [u1, v1] = P(...around(x, z, a, r1));
    c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(u0, v0); c.lineTo(u1, v1); c.stroke();
  }

  // ----- the controls' parts -----
  const knobM = M({ color: '#1b1c1f', roughness: 0.35, metalness: 0.6 }), capM = M({ color: '#e8e4da', roughness: 0.35 }), alu = M({ color: '#b9bcc2', roughness: 0.3, metalness: 0.9 });
  const pointerM = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ff8a3a', emissiveIntensity: 0.6 });
  const sfx = (o) => ctx.sfx.cabinet?.('latch', o.getWorldPosition(new THREE.Vector3()), 0.1);
  function control(seg, def) {
    const c = { seg, ...def, acc: 0 }, top = segs[seg].top;
    c.hit = ctx.hitBox(top, def.hw || 0.16, 0.1, def.hd || 0.16, def.x, 0.04, def.z, { action: 'edge-console', reach: 2.6 });
    c.hit.userData.board = c;
    if (def.at) c.hit.userData.drawerAt = (pt) => { const v = top.worldToLocal(pt.clone()); return { v: def.at(v) }; };
    hits.push(c.hit); ctls.push(c);
    return c;
  }
  // a knob that turns: big (the time dial) or small (wind), a pointer line on its cap
  function knob(seg, x, z, r, h) {
    const g = new THREE.Group(); g.position.set(x, 0, z); segs[seg].top.add(g);
    g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.22, r * 1.25, 0.012, 40), alu), [0, 0.006, 0]));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 40), knobM); body.position.y = 0.012 + h / 2; g.add(body);
    const ptr = new THREE.Mesh(new THREE.BoxGeometry(r * 0.12, 0.004, r * 0.9), pointerM); ptr.position.set(0, 0.012 + h + 0.002, -r * 0.45); g.add(ptr);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(r * 0.1, 0.01, r * 0.3), pointerM); notch.position.set(0, 0.012, -r * 1.12); g.add(notch);
    return g;
  }
  // a chunky rotary switch: a bar across a round boss
  function rotary(seg, x, z, s = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z); segs[seg].top.add(g);
    g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.055 * s, 0.025, 32), knobM), [0, 0.0125, 0]));
    g.add(placed(new THREE.Mesh(new THREE.BoxGeometry(0.032 * s, 0.045, 0.13 * s), knobM), [0, 0.045, 0]));
    g.add(placed(new THREE.Mesh(new THREE.BoxGeometry(0.008 * s, 0.003, 0.05 * s), pointerM), [0, 0.069, -0.035 * s]));
    return g;
  }
  // a fader: a slot along z, a cap that slides (v 0 at the near end, 1 at the far)
  function fader(seg, x, z0, z1) {
    const top = segs[seg].top;
    top.add(placed(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.003, Math.abs(z1 - z0) + 0.02), M({ color: '#050505', roughness: 0.9 })), [x, 0.0015, (z0 + z1) / 2]));
    const cap = new THREE.Group(); top.add(cap); cap.position.x = x;
    cap.add(placed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.034), capM), [0, 0.02, 0]));
    cap.add(placed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.003, 0.005), M({ color: '#d33', emissive: '#f42', emissiveIntensity: 0.5 })), [0, 0.038, 0]));
    return { cap, place: (v) => { cap.position.z = z0 + (z1 - z0) * clamp(v, 0, 1); } };
  }
  // a push button, lit when it's on
  function button(seg, x, z, r, color, glow, h = 0.025) {
    const g = new THREE.Group(); g.position.set(x, 0, z); segs[seg].top.add(g);
    g.add(placed(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.3, 0.008, 28), alu), [0, 0.004, 0]));
    const m = new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 0, roughness: 0.3 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), m); b.position.y = 0.008 + h / 2; g.add(b);
    const btn = { g, b, m, y: b.position.y, down: 0 };
    pressed.push(btn);
    return btn;
  }
  const pressed = [];
  const press = (btn) => { btn.down = 0.15; };

  // ----- the state they work -----
  const cs = ctx.clockState, W = () => ctx.weather;
  const SPEEDS = [0, 'live', 1, 120, 1200, 7200], SPEED_NAMES = ['HOLD', 'LIVE', '×1', '×120', '×1200', '×7200'];
  const speedIdx = () => (cs.mode === 'live' ? 1 : cs.speed < 0.01 ? 0 : Math.max(0, SPEEDS.indexOf(cs.mode)));
  const hours = () => { const d = new Date(ctx.simNow()); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
  const hhmm = (h) => { const m = Math.floor(((h % 24) + 24) % 24 * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  // scrub: the clock moved by ms, running on as it was (from LIVE, at ×1)
  const scrub = (ms) => ctx.setSpeed(cs.mode === 'live' ? 1 : cs.mode, ctx.simNow() + ms);
  const office = () => dash.office || {};
  let putAt = 0, putWant = null;
  const put = (patch, now = false) => {   // the office's settings: as you go, a few times a second at most, and when you let go
    putWant = { ...putWant, ...patch, blinds: { ...putWant?.blinds, ...patch.blinds } };
    if (!patch.blinds) delete putWant.blinds;
    if (now || performance.now() - putAt > 180) { putAt = performance.now(); dash.putOffice(putWant); putWant = null; }
  };
  const lightsV = () => { const o = office(); return o.lights === 'off' ? 0 : (o.brightness ?? 1); };
  const BLINDS = [0, 0.5, 1], BLIND_NAMES = ['UP', 'SLATS', 'CLOSED'];
  const blindsIdx = () => { const b = Object.values(office().blinds || {}); return b.length && b.every((x) => x === b[0]) ? BLINDS.indexOf(b[0]) : -1; };
  const setBlinds = (v) => put({ blinds: Object.fromEntries(Object.keys(office().blinds || { north: 0, east: 0, west: 0, office: 0 }).map((k) => [k, v])) }, true);
  let onAir = true;

  // ===== TIME =====
  {
    const s = segs[0], c = s.face.ctx;
    plate(c);
    engrave(c, 'TIME', -0.47, -0.31, 34, 'left', '#f0f2f5');
    // the day dial: 24 hours round, midnight at the back, the night shaded
    const DX = -0.17, DZ = 0.02;
    const [u, v] = P(DX, DZ);
    c.fillStyle = 'rgba(10,14,30,.75)'; c.beginPath(); c.moveTo(u, v); c.arc(u, v, 0.165 * PX, -Math.PI / 2 + Math.PI * 2 * (19 / 24), -Math.PI / 2 + Math.PI * 2 * (30 / 24)); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,190,90,.14)'; c.beginPath(); c.moveTo(u, v); c.arc(u, v, 0.165 * PX, -Math.PI / 2 + Math.PI * 2 * (6 / 24), -Math.PI / 2 + Math.PI * 2 * (19 / 24)); c.closePath(); c.fill();
    for (let h = 0; h < 96; h++) ticks(c, DX, DZ, h % 4 ? 0.152 : 0.142, 0.165, h / 96 * Math.PI * 2, h % 4 ? 1.5 : 3.5);
    for (let h = 0; h < 24; h += 3) engrave(c, String(h).padStart(2, '0'), ...around(DX, DZ, h / 24 * Math.PI * 2, 0.19), 25);
    engrave(c, 'TIME OF DAY', DX, DZ + 0.26, 29);
    const dial = knob(0, DX, DZ, 0.085, 0.05);
    const live = button(0, DX + 0.2, DZ + 0.24, 0.026, '#3a1010', '#ff3020');
    engrave(c, 'LIVE', DX + 0.2, DZ + 0.29, 21);
    // the speed switch
    const SX = 0.29, SZ = 0.02, SA = (i) => (-75 + i * 30) * Math.PI / 180;
    SPEED_NAMES.forEach((n, i) => { ticks(c, SX, SZ, 0.072, 0.09, SA(i), 3); engrave(c, n, ...around(SX, SZ, SA(i), 0.13), 22); });
    engrave(c, 'TIME SPEED', SX, SZ + 0.26, 29);
    const sw = rotary(0, SX, SZ, 1.2);
    s.face.tex.needsUpdate = true;
    const dialC = control(0, { x: DX, z: DZ, hw: 0.36, hd: 0.36, name: 'TIME OF DAY', what: 'Sets the time of day: the sky, the sun, the office’s lights and the model follow',
      read: () => `${hhmm(hours())}${cs.mode === 'live' ? ' · live' : ''}`, how: 'Hold and move the mouse to turn it · click +1 h (Shift −1 h) · scroll ±15 min',
      drag: (d) => scrub(d * 2 * 60000), step: (k) => { scrub(k * 3600e3); sfx(dial); }, wheel: (k) => scrub(k * 15 * 60000),
      tick: () => { dial.rotation.y = -hours() / 24 * Math.PI * 2; } });
    control(0, { x: DX + 0.2, z: DZ + 0.24, hw: 0.07, hd: 0.07, name: 'LIVE', what: 'Back to the real time, on the real clock', read: () => (cs.mode === 'live' ? 'on' : 'off'),
      how: 'Click', press: () => { ctx.setSpeed('live'); press(live); sfx(live.g); }, tick: () => { live.m.emissiveIntensity = cs.mode === 'live' ? 2.2 : 0; } });
    control(0, { x: SX, z: SZ, hw: 0.2, hd: 0.2, name: 'TIME SPEED', what: 'How fast the clock runs: held, the real clock, or ×1 to ×7200 (the same as the HUD’s speeds)',
      read: () => SPEED_NAMES[speedIdx()], how: 'Hold and move the mouse to turn it · click for the next (Shift: the last) · scroll',
      step: (k) => { const i = clamp(speedIdx() + k, 0, SPEEDS.length - 1); if (i !== speedIdx()) { ctx.setSpeed(SPEEDS[i]); sfx(sw); } },
      tick: () => { sw.rotation.y = -SA(speedIdx()); } });
    s.readout = () => [['TIME', `${hhmm(hours())} ${new Date(ctx.simNow()).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}`], ['SPEED', SPEED_NAMES[speedIdx()]]];
  }

  // ===== WEATHER =====
  {
    const s = segs[1], c = s.face.ctx;
    plate(c);
    engrave(c, 'WEATHER', -0.47, -0.31, 34, 'left', '#f0f2f5');
    const K = W().ORDER, WX = -0.2, WZ = 0.02, WA = (i) => (-105 + i * 35) * Math.PI / 180;
    K.forEach((k, i) => { ticks(c, WX, WZ, 0.07, 0.085, WA(i), 3); engrave(c, W().KINDS[k].label.toUpperCase(), ...around(WX, WZ, WA(i), 0.15), 21); });
    engrave(c, 'SKY', WX, WZ + 0.26, 29);
    const sel = rotary(1, WX, WZ, 1.1);
    const leds = K.map((k, i) => {
      const m = new THREE.MeshStandardMaterial({ color: '#221', emissive: '#ffb02e', emissiveIntensity: 0 }), o = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 6), m), [lx, lz] = around(WX, WZ, WA(i), 0.1);
      o.position.set(lx, 0.004, lz); s.top.add(o);
      return m;
    });
    // cloud cover: a long fader, more cloud away from you
    const FX = 0.13, F0 = 0.2, F1 = -0.2;
    for (let i = 0; i <= 10; i++) { const [u0, v0] = P(FX - 0.05, F0 + (F1 - F0) * i / 10), [u1] = P(FX - 0.03, 0); c.strokeStyle = '#c9ccd2'; c.lineWidth = i % 5 ? 1.5 : 3; c.beginPath(); c.moveTo(u0, v0); c.lineTo(u1, v0); c.stroke(); }
    engrave(c, '100', FX - 0.065, F1, 18, 'right'); engrave(c, '0', FX - 0.065, F0, 18, 'right');
    engrave(c, 'CLOUD COVER', FX, WZ + 0.26, 26);
    const cover = fader(1, FX, F0, F1);
    // wind: a knob, 270° of sweep
    const NX = 0.36, NZ = 0.02, NA = (v) => (-135 + v * 270) * Math.PI / 180;
    for (let i = 0; i <= 12; i++) ticks(c, NX, NZ, 0.062, i % 3 ? 0.072 : 0.08, NA(i / 12), i % 3 ? 1.5 : 3);
    [0, 20, 40, 60].forEach((kn) => engrave(c, String(kn), ...around(NX, NZ, NA(kn / 60), 0.1), 14));
    engrave(c, 'WIND kn', NX, NZ + 0.26, 26);
    const wind = knob(1, NX, NZ, 0.045, 0.04);
    s.face.tex.needsUpdate = true;
    const kind = () => K.indexOf(W().state.kind);
    control(1, { x: WX, z: WZ, hw: 0.32, hd: 0.32, name: 'SKY', what: 'The weather over the city: clear, cloudy, overcast, rain, storm, fog or snow',
      read: () => W().KINDS[W().state.kind].label, how: 'Hold and move the mouse to turn it · click for the next (Shift: the last) · scroll',
      step: (k) => { const i = clamp(kind() + k, 0, K.length - 1); if (i !== kind()) { W().set({ kind: K[i] }); sfx(sel); } },
      tick: () => { sel.rotation.y = -WA(kind()); leds.forEach((m, i) => { m.emissiveIntensity = i === kind() ? 3 : 0; }); } });
    control(1, { x: FX, z: 0, hw: 0.1, hd: 0.46, name: 'CLOUD COVER', what: 'How much of the sky is cloud', read: () => `${Math.round(W().state.cover * 100)}%`,
      how: 'Hold and move the mouse to slide it · click to set it where you point · scroll', at: (p) => clamp((p.z - F0) / (F1 - F0), 0, 1),
      drag: (d) => W().set({ cover: W().state.cover + d / 300 }), set: (v) => W().set({ cover: v }), wheel: (k) => W().set({ cover: W().state.cover + k * 0.05 }),
      tick: () => cover.place(W().state.cover) });
    control(1, { x: NX, z: NZ, hw: 0.14, hd: 0.14, name: 'WIND', what: 'The wind: the cloud drifts with it, the rain and snow blow along', read: () => `${Math.round(W().state.wind * 60)} kn`,
      how: 'Hold and move the mouse to turn it · click +5 kn (Shift −5) · scroll', drag: (d) => W().set({ wind: W().state.wind + d / 400 }),
      step: (k) => { W().set({ wind: W().state.wind + k / 12 }); sfx(wind); }, wheel: (k) => W().set({ wind: W().state.wind + k / 24 }),
      tick: () => { wind.rotation.y = -NA(W().state.wind); } });
    s.readout = () => [['SKY', W().KINDS[W().state.kind].label.toUpperCase()], ['CLOUD', `${Math.round(W().state.cover * 100)}%`], ['WIND', `${Math.round(W().state.wind * 60)} KN`]];
  }

  // ===== BUILDING =====
  {
    const s = segs[2], c = s.face.ctx;
    plate(c);
    engrave(c, 'BUILDING', -0.47, -0.31, 34, 'left', '#f0f2f5');
    const LX = -0.33, L0 = 0.2, L1 = -0.2;
    for (let i = 0; i <= 10; i++) { const [u0, v0] = P(LX - 0.05, L0 + (L1 - L0) * i / 10), [u1] = P(LX - 0.03, 0); c.strokeStyle = '#c9ccd2'; c.lineWidth = i % 5 ? 1.5 : 3; c.beginPath(); c.moveTo(u0, v0); c.lineTo(u1, v0); c.stroke(); }
    engrave(c, 'OFF', LX - 0.065, L0, 18, 'right'); engrave(c, 'FULL', LX - 0.065, L1, 18, 'right');
    engrave(c, 'LIGHTS', LX, 0.28, 29);
    const lights = fader(2, LX, L0, L1);
    const auto = button(2, LX + 0.13, 0.2, 0.022, '#3a2a08', '#ffb02e');
    engrave(c, 'AUTO', LX + 0.13, 0.25, 20);
    // the blinds: a three-way switch
    const BX = -0.02, BZ = 0.0, BA = (i) => (-50 + i * 50) * Math.PI / 180;
    BLIND_NAMES.forEach((n, i) => { ticks(c, BX, BZ, 0.07, 0.085, BA(i), 3); engrave(c, n, ...around(BX, BZ, BA(i), 0.125), 21); });
    engrave(c, 'BLINDS', BX, 0.28, 29);
    const bsw = rotary(2, BX, BZ, 1.1);
    // STOP: a red mushroom in a yellow collar; ON AIR, a lamp; RESET ALL, behind a striped surround
    const [su, sv] = P(0.3, -0.15);
    c.fillStyle = '#e8c21a'; c.beginPath(); c.arc(su, sv, 0.085 * PX, 0, 7); c.fill(); engrave(c, 'EMERGENCY', 0.3, -0.15 + 0.065, 16, 'center', '#1a1a1a');
    const stop = button(2, 0.3, -0.15, 0.05, '#b3140c', '#ff2a10', 0.04);
    stop.g.add(placed(new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), stop.m), [0, 0.048, 0], [1, 0.4, 1]));
    engrave(c, 'STOP', 0.3, -0.15 - 0.105, 23);
    const air = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.06), new THREE.MeshStandardMaterial({ color: '#4a0a08', emissive: '#ff2a1a', emissiveIntensity: 2, roughness: 0.3, transparent: true, opacity: 0.92 }));
    air.position.set(0.3, 0.02, 0.1); s.top.add(air);
    const airL = makeCanvas(256, 96); airL.ctx.fillStyle = '#000'; airL.ctx.fillRect(0, 0, 256, 96); airL.ctx.fillStyle = '#fff'; airL.ctx.font = `800 54px ${FONT}`; airL.ctx.textAlign = 'center'; airL.ctx.fillText('ON AIR', 128, 68); airL.tex.needsUpdate = true;
    const airT = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.05).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: airL.tex, transparent: true, blending: THREE.AdditiveBlending, color: new THREE.Color(2, 1.6, 1.4) }));
    airT.position.set(0.3, 0.0355, 0.1); s.top.add(airT);
    const [ru, rv] = P(0.33, 0.27);
    for (let k = -4; k < 4; k++) { c.fillStyle = k % 2 ? '#e8c21a' : '#151515'; c.beginPath(); c.moveTo(ru + k * 14, rv - 28); c.lineTo(ru + k * 14 + 14, rv - 28); c.lineTo(ru + k * 14 + 34, rv + 28); c.lineTo(ru + k * 14 + 20, rv + 28); c.fill(); }
    const reset = button(2, 0.33, 0.24, 0.02, '#c9a20f', '#ffd030');
    engrave(c, 'RESET ALL', 0.33, 0.315, 18);
    s.face.tex.needsUpdate = true;
    control(2, { x: LX, z: 0, hw: 0.1, hd: 0.46, name: 'LIGHTS', what: 'The office’s lights (as the Admin app’s)', read: () => (office().lights === 'off' ? 'off' : `${office().lights || 'auto'} · ${Math.round(lightsV() * 100)}%`),
      how: 'Hold and move the mouse to slide it · click to set it where you point · scroll', at: (p) => clamp((p.z - L0) / (L1 - L0), 0, 1),
      set: (v, now = true) => put(v < 0.04 ? { lights: 'off' } : { lights: office().lights === 'auto' ? 'auto' : 'on', brightness: Math.round(v * 20) / 20 }, now),
      drag(d) { this.v = clamp((this.v ?? lightsV()) + d / 300, 0, 1); this.set(this.v, false); }, release() { if (this.v != null) this.set(this.v, true); this.v = null; },
      wheel(k) { this.set(clamp(lightsV() + k * 0.05, 0, 1)); }, tick() { lights.place(this.v ?? lightsV()); } });
    control(2, { x: LX + 0.13, z: 0.2, hw: 0.06, hd: 0.06, name: 'AUTO', what: 'The lights follow the daylight', read: () => ((office().lights || 'auto') === 'auto' ? 'on' : 'off'), how: 'Click',
      press: () => { put({ lights: 'auto' }, true); press(auto); sfx(auto.g); }, tick: () => { auto.m.emissiveIntensity = (office().lights || 'auto') === 'auto' ? 2 : 0; } });
    control(2, { x: BX, z: BZ, hw: 0.22, hd: 0.22, name: 'BLINDS', what: 'Every blind in the office: up, slats open, or closed', read: () => (blindsIdx() < 0 ? 'mixed' : BLIND_NAMES[blindsIdx()].toLowerCase()),
      how: 'Hold and move the mouse to turn it · click for the next (Shift: the last) · scroll',
      step: (k) => { const i = clamp((blindsIdx() < 0 ? 0 : blindsIdx()) + k, 0, 2); if (i !== blindsIdx()) { setBlinds(BLINDS[i]); sfx(bsw); } },
      tick: () => { bsw.rotation.y = -BA(Math.max(0, blindsIdx())); } });
    control(2, { x: 0.3, z: -0.15, hw: 0.15, hd: 0.15, name: 'STOP', what: 'A big red button. Nobody remembers what it was wired to.', read: () => 'armed', how: 'Click',
      press: () => { press(stop); sfx(stop.g); onAir = false; setTimeout(() => { onAir = true; }, 1800); }, tick: () => {} });
    control(2, { x: 0.3, z: 0.1, hw: 0.17, hd: 0.08, name: 'ON AIR', what: 'We’re live.', read: () => (onAir ? 'lit' : 'off'), how: 'Click',
      press: () => { onAir = !onAir; sfx(air); }, tick: () => { air.material.emissiveIntensity = onAir ? 2 : 0.05; airT.visible = onAir; } });
    control(2, { x: 0.33, z: 0.24, hw: 0.07, hd: 0.07, name: 'RESET ALL', what: 'Everything back: the real clock, the usual sky, the lights on auto, the blinds up', read: () => '', how: 'Click',
      press: () => { ctx.setSpeed('live'); W().reset(); put({ lights: 'auto', brightness: 1 }, true); setBlinds(0); press(reset); sfx(reset.g); }, tick: () => { reset.m.emissiveIntensity = 0.4; } });
    s.readout = () => [['LIGHTS', office().lights === 'off' ? 'OFF' : `${(office().lights || 'auto').toUpperCase()} ${Math.round(lightsV() * 100)}%`], ['BLINDS', blindsIdx() < 0 ? 'MIXED' : BLIND_NAMES[blindsIdx()]]];
  }

  // a task light over it
  const task = new THREE.SpotLight('#ffe2b8', 16, 4.5, 0.8, 0.6, 1.5);
  task.position.set(CX - 0.5, 3.2, CZ); task.target.position.set(CX - 0.1, 1, CZ); root.add(task, task.target);

  // ----- taking hold: the mouse turns or slides what you're holding, not the view -----
  let held = null, swallowAt = 0;
  const holding = (e) => e.button === 0 && ctx.locked && ctx.mode === 'free' && ctx.away === bs && ctx.hover?.action === 'edge-console';
  renderer.domElement.addEventListener('mousedown', (e) => { if (holding(e)) held = { c: ctx.hover.board, moved: 0 }; });
  addEventListener('mouseup', () => {
    if (!held) return;
    if (held.moved > 6) swallowAt = performance.now();
    held.c.release?.(); held = null;
  });
  ctx.grab = (dx, dy) => {
    if (!held) return false;
    const c = held.c, d = dx - dy;
    held.moved += Math.abs(dx) + Math.abs(dy);
    if (c.drag) c.drag(d);
    else if (c.step) { c.acc += d; while (Math.abs(c.acc) > 45) { const k = Math.sign(c.acc); c.acc -= k * 45; c.step(k); } }
    return true;
  };
  addEventListener('wheel', (e) => {
    if (!ctx.locked || ctx.away !== bs || ctx.hover?.action !== 'edge-console') return;
    const c = ctx.hover.board, k = e.deltaY < 0 ? 1 : -1;
    if (c.wheel) c.wheel(k); else if (c.step) c.step(k);
  }, { passive: true });
  ctx.action('edge-console', {
    hover: (h) => {
      const c = h.board, r = c.read();
      return `<b>${c.name}</b><div class="m">${c.what}</div>${r ? `<div class="m">Now: ${r}</div>` : ''}<div class="k">${c.how}</div>`;
    },
    click: (h, e) => {
      if (performance.now() - swallowAt < 400) return true;   // (that was a drag)
      const c = h.board, k = e?.shiftKey ? -1 : 1;
      if (c.press) c.press();
      else if (c.set && h.drawer) c.set(h.drawer.v);
      else if (c.step) c.step(k);
      return true;
    },
  });

  // ----- each frame while you're in here: the controls where they are, the readouts -----
  let paintAt = -1;
  function paintReadouts() {
    for (const s of segs) {
      const lines = s.readout(), txt = JSON.stringify(lines);
      if (txt === s.rdText) continue;
      s.rdText = txt;
      const c = s.rd.ctx, w = s.rd.canvas.width, h = s.rd.canvas.height, n = lines.length, cw = (w - 40) / n;
      c.fillStyle = '#16171a'; c.fillRect(0, 0, w, h);
      lines.forEach(([k, v], i) => {
        const x = 20 + i * cw;
        c.fillStyle = '#060504'; c.fillRect(x + 8, 30, cw - 16, h - 52);
        c.fillStyle = '#9a6a1a'; c.font = `700 22px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(k, x + 10, 24);
        c.fillStyle = '#ffb02e'; c.font = `700 ${n > 2 ? 46 : 52}px ${MONO}`; c.textAlign = 'center'; c.fillText(v, x + cw / 2, h - 44);
      });
      s.rd.tex.needsUpdate = true;
    }
  }
  function fx(dt, t) {
    for (const c of ctls) c.tick?.();
    for (const b of pressed) { b.down = Math.max(0, b.down - dt); b.b.position.y = b.y - (b.down > 0 ? 0.009 : 0); }
    if (t - paintAt > 0.25) { paintAt = t; paintReadouts(); }
  }
  return { fx, hits, cols, ctls, con, find: (name) => ctls.find((c) => c.name === name) };
}
