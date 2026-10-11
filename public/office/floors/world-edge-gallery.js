// The gallery behind the sky (world-edge-backstage.js): a dark control room. A curved bank of monitors wraps round the
// model table (world-edge-model.js), each showing a live feed of the world: the office's own security cameras
// (systems/cctv.js, the same pictures as the Security app), one on the pier where the helicopter waits, and one of this
// gallery's way in, where you'll see yourself come in; the city's own cameras along the top; a clock, and a status
// screen of what the console (world-edge-console.js, across the table) has set. Each screen faces the table square on:
// turned to it, then leant toward it by its height. In front of them, a mixing desk (for show), an empty chair, a
// headset, a mug of cold coffee. Feeds are drawn only while you're in here and the bank is in view, one a frame at most,
// a few times a second each, at 256 x 144.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dash, FONT, makeCanvas, MARKER, ME_LAYER } from '../util.js';

const FW = 256, FH = 144, FPS = 3;

export function installGallery(ctx, bs, PLAN) {
  const { camera } = ctx, root = bs.root, { TC, GAL } = PLAN, R = Math.random;
  const hits = [], cols = [];
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, ...o });
  const at = (r, a, y = 0) => new THREE.Vector3(TC.x + r * Math.cos(a), y, TC.z + r * Math.sin(a));
  const faceIn = (a) => Math.atan2(-Math.cos(a), -Math.sin(a));   // a rotation.y whose +z points from angle a back at the table
  const aabb = (cx, cz, w, d, yaw, pad = 0) => {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), hx = (w * c + d * s) / 2 + pad, hz = (w * s + d * c) / 2 + pad;
    cols.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz });
  };
  const info = (h, k) => ({ action: 'backstage', reach: 4, info: `<b>${h}</b>${k ? `<div class="k">${k}</div>` : ''}` });

  // ----- the monitor bank: 7 columns of 3 on an arc round the table, a cabinet under, a fascia over -----
  const RB = 5.4, COLS = 7, SPAN = 1.32 / RB, A0 = -SPAN * (COLS - 1) / 2;
  const pier = { F: { cctv: null }, eye: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 3000), n: 0, name: 'Pier' };
  const door = { F: bs, eye: new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 60), n: 0, name: 'Stage door' };
  for (const c of [pier.eye, door.eye]) { c.layers.enable(1); c.layers.enable(ME_LAYER); }
  door.eye.position.copy(at(RB - 0.2, 0, 3.15)); door.eye.lookAt(GAL.x0, 1.2, TC.z); root.add(door.eye);
  // the pier's camera, high on the wall by the stairs looking down at it (set in the world once we know where that is)
  const E = ctx.heli.edge;
  pier.eye.position.set(-E.R + 16, E.PT + 8, E.PIER.u0 - 8); pier.eye.lookAt(-E.R + 5, E.PT + 1.5, (E.PIER.u0 + E.PIER.u1) / 2 + 3); pier.eye.updateMatrixWorld();
  const byId = new Map((ctx.cctv?.cams || []).map((c) => [c.id, c]));
  const SLOTS = [['city-street', 'city-bridge', 'city-park', 'status', 'city-rooftop', 'city-sea', 'city-pass'],
    ['roof-terrace', 'roof-helipad', 'lobby', 'clock', 'meeting', 'wellness-gym', 'hall-noc'],
    ['desks-se', 'breakroom', 'my-office', 'pier', 'door', 'lounge', 'wellness-pool']];
  const ROWS = [2.86, 2.12, 1.38], EYE_AT = [1.65, RB - 1.9];   // each row's height; leant toward an eye this high, this far in
  const screens = [];
  const screenM = (tex) => new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, k: { value: 1.7 }, on: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float k, on; varying vec2 vUv;
      void main() {
        vec3 c = pow(texture2D(map, vUv).rgb, vec3(2.2)) * on + vec3(0.004, 0.006, 0.01) * (1.0 - on);
        c *= 0.92 + 0.08 * step(0.5, fract(vUv.y * 72.0));
        gl_FragColor = vec4(c * k, 1.0);
      }`,
  });
  const labels = makeCanvas(1024, 256), lc = labels.ctx;   // each screen's caption, burnt into its corner: a 256 x 32 cell each
  const cab = [], bez = [], labelGeos = [];
  let n = 0;
  for (let row = 0; row < ROWS.length; row++) for (let col = 0; col < COLS; col++) {
    const a = A0 + col * SPAN, id = SLOTS[row][col], y = ROWS[row], p = at(RB, a, y), yaw = faceIn(a);
    const tilt = Math.atan2(y - EYE_AT[0], EYE_AT[1]);   // top toward the table (+x about its own axis, after the turn)
    const cam = id === 'pier' ? pier : id === 'door' ? door : byId.get(id), still = id === 'clock' || id === 'status';
    const name = id === 'clock' ? 'Clock' : id === 'status' ? 'Status' : cam ? (cam.city ? cam.name : cam.name.split(' · ').pop()) : id;
    const rt = new THREE.WebGLRenderTarget(FW, FH, { depthBuffer: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.675), screenM(rt.texture));
    mesh.position.copy(p); mesh.rotation.set(tilt, yaw, 0, 'YXZ'); root.add(mesh);   // (turned, then leant: no roll)
    bez.push(new THREE.BoxGeometry(1.27, 0.74, 0.08).translate(0, 0, -0.045).rotateX(tilt).rotateY(yaw).translate(p.x, p.y, p.z));
    // its label: a slot of the shared strip
    const u = n % 4, v = Math.floor(n / 4), lx = u * 256, ly = v * 32;
    lc.fillStyle = 'rgba(0,0,0,.6)'; lc.fillRect(lx, ly, 256, 32);
    if (!still) {
      lc.fillStyle = '#e0352b'; lc.beginPath(); lc.arc(lx + 14, ly + 16, 5, 0, 7); lc.fill();
      lc.fillStyle = '#e8ecf2'; lc.font = `600 17px ui-monospace, Menlo, monospace`; lc.fillText(`${String(n + 1).padStart(2, '0')} ${name.toUpperCase()}`.slice(0, 22), lx + 26, ly + 22);
    }
    const lg = new THREE.PlaneGeometry(0.44, 0.055), U = lg.attributes.uv;
    for (let k = 0; k < U.count; k++) U.setXY(k, (u + U.getX(k)) / 4, 1 - (v + 1 - U.getY(k)) / 8);
    if (!still) labelGeos.push(lg.translate(-0.35, -0.29, 0.004).rotateX(tilt).rotateY(yaw).translate(p.x, p.y, p.z));
    screens.push({ id, cam, rt, mesh, at: -1, name });
    hits.push(Object.assign(mesh, { userData: info(name, still ? '' : id === 'pier' || id === 'door' ? 'Live' : 'Live · the same camera as the Security app') }));
    n++;
  }
  for (let col = 0; col < COLS; col++) {   // the cabinet under each column, and the fascia over
    const a = A0 + col * SPAN, yaw = faceIn(a), p = at(RB + 0.15, a);
    cab.push(new THREE.BoxGeometry(1.3, 1.0, 0.6).translate(0, 0.5, 0).rotateY(yaw).translate(p.x, 0, p.z));
    cab.push(new THREE.BoxGeometry(1.3, 0.22, 0.5).translate(0, 3.38, -0.05).rotateY(yaw).translate(p.x, 0, p.z));
    aabb(p.x, p.z, 1.3, 0.6, yaw);
  }
  const mergeAll = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
  const metal = M({ color: '#1a1b1e', roughness: 0.5, metalness: 0.4 });
  root.add(new THREE.Mesh(mergeAll(cab), metal), new THREE.Mesh(mergeAll(bez), M({ color: '#0c0d0f', roughness: 0.35, metalness: 0.3 })));
  labels.tex.needsUpdate = true;
  root.add(new THREE.Mesh(mergeAll(labelGeos), new THREE.MeshBasicMaterial({ map: labels.tex, color: new THREE.Color(0.9, 0.9, 0.9) })));
  // the clock's own screen: big amber digits, the office's time (the sky's clock, whatever it's set to)
  const clock = makeCanvas(FW, FH), clockS = screens.find((s) => s.id === 'clock');
  clockS.mesh.material.uniforms.map.value = clock.tex; clockS.mesh.material.uniforms.on.value = 1;
  let clockText = '';
  function paintClock() {
    const d = new Date(ctx.simNow()), txt = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    if (txt === clockText) return;
    clockText = txt;
    const c = clock.ctx; c.fillStyle = '#060504'; c.fillRect(0, 0, FW, FH);
    c.fillStyle = '#ffb02e'; c.font = `700 52px ui-monospace, Menlo, monospace`; c.textAlign = 'center'; c.fillText(txt, FW / 2, 86);
    c.font = `600 16px ${FONT}`; c.fillStyle = '#b07a20'; c.fillText(d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase(), FW / 2, 118);
    c.fillStyle = ctx.clockState.mode === 'live' ? '#e0352b' : '#6a6a6a'; c.beginPath(); c.arc(22, 22, 7, 0, 7); c.fill();
    c.font = `700 14px ${FONT}`; c.textAlign = 'left'; c.fillText(ctx.clockState.mode === 'live' ? 'LIVE' : ctx.clockState.speed < 0.01 ? 'HELD' : `×${ctx.clockState.speed}`, 36, 27);
    clock.tex.needsUpdate = true;
  }
  // the status screen: what the console has set, in the clock's amber
  const status = makeCanvas(FW, FH), statusS = screens.find((s) => s.id === 'status');
  statusS.mesh.material.uniforms.map.value = status.tex; statusS.mesh.material.uniforms.on.value = 1;
  let statusText = '';
  function paintStatus() {
    const cs = ctx.clockState, W = ctx.weather?.state, o = dash.office || {}, bl = Object.values(o.blinds || {});
    const lines = [['TIME', cs.mode === 'live' ? 'LIVE' : cs.speed < 0.01 ? 'HELD' : `×${cs.speed}`],
      ['SKY', W ? `${ctx.weather.KINDS[W.kind].label.toUpperCase()} ${Math.round(W.cover * 100)}%` : '-'],
      ['WIND', W ? `${Math.round(W.wind * 60)} KN` : '-'],
      ['LIGHTS', o.lights === 'off' ? 'OFF' : `${(o.lights || 'auto').toUpperCase()} ${Math.round((o.brightness ?? 1) * 100)}%`],
      ['BLINDS', !bl.length || bl.every((b) => !b) ? 'UP' : bl.every((b) => b === 1) ? 'CLOSED' : bl.every((b) => b === 0.5) ? 'SLATS' : 'MIXED']];
    const txt = JSON.stringify(lines);
    if (txt === statusText) return;
    statusText = txt;
    const c = status.ctx; c.fillStyle = '#060504'; c.fillRect(0, 0, FW, FH);
    c.font = `700 19px ui-monospace, Menlo, monospace`; c.textBaseline = 'middle';
    lines.forEach(([k, v], i) => { c.fillStyle = '#b07a20'; c.textAlign = 'left'; c.fillText(k, 16, 20 + i * 26); c.fillStyle = '#ffb02e'; c.textAlign = 'right'; c.fillText(v, FW - 16, 20 + i * 26); });
    status.tex.needsUpdate = true;
  }
  // the bank's glow on the room
  for (const a of [-0.7, 0, 0.7]) { const l = new THREE.PointLight('#9fbcff', 2.2, 8, 1.6), p = at(RB - 1.2, a, 1.9); l.position.copy(p); root.add(l); }

  // ----- the mixing desk: five sloped segments on an inner arc, channel strips, a meter bridge -----
  const RD = 3.4, SEGS = 5, SS = 1.08 / RD, D0 = -SS * (SEGS - 1) / 2, SLOPE = 0.16;
  const deskG = [], capG = [], knobG = [], slotG = [];
  const meters = makeCanvas(512, 64);
  const tops = [];
  for (let k = 0; k < SEGS; k++) {
    const a = D0 + k * SS, yaw = faceIn(a), p = at(RD, a), g = new THREE.Group();
    g.position.set(p.x, 0, p.z); g.rotation.y = yaw; root.add(g);
    deskG.push(new THREE.BoxGeometry(1.06, 0.78, 0.86).translate(0, 0.39, 0).rotateY(yaw).translate(p.x, 0, p.z));
    deskG.push(new THREE.BoxGeometry(1.06, 0.3, 0.16).translate(0, 1.0, -0.42).rotateY(yaw).translate(p.x, 0, p.z));   // the meter bridge
    aabb(p.x, p.z, 1.06, 0.86, yaw);
    const top = new THREE.Group(); top.position.set(0, 0.86, 0.02); top.rotation.x = SLOPE; g.add(top); tops.push(top);
    deskG.push(new THREE.BoxGeometry(1.06, 0.06, 0.86).translate(0, 0.83, 0).rotateY(yaw).translate(p.x, 0, p.z));
  }
  // channel strips: a fader each, knobs above (all in the segments' sloped tops' space, merged)
  tops.forEach((top, k) => {
    top.parent.updateMatrix(); top.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(top.parent.matrix, top.matrix);
    for (let c = 0; c < 8; c++) {
      const x = -0.44 + c * 0.125;
      slotG.push(new THREE.BoxGeometry(0.012, 0.004, 0.3).translate(x, 0.034, 0.17).applyMatrix4(m));
      for (let r = 0; r < 4; r++) knobG.push(new THREE.CylinderGeometry(0.014, 0.016, 0.02, 10).translate(x, 0.04, -0.06 - r * 0.07).applyMatrix4(m));
      capG.push(new THREE.BoxGeometry(0.03, 0.024, 0.04).translate(x, 0.046, 0.3 - R() * 0.26).applyMatrix4(m));
    }
  });
  root.add(new THREE.Mesh(mergeAll(deskG), M({ color: '#23252a', roughness: 0.55, metalness: 0.25 })));
  root.add(new THREE.Mesh(mergeAll(slotG), M({ color: '#050505', roughness: 0.9 })));
  root.add(new THREE.Mesh(mergeAll(knobG), M({ color: '#3b3f45', roughness: 0.4, metalness: 0.5 })));
  root.add(new THREE.Mesh(mergeAll(capG), M({ color: '#cfd2d6', roughness: 0.4 })));
  // the scribble strip, and the meters on the bridge
  const mid = tops[2];
  const strip = makeCanvas(512, 64), sc = strip.ctx;
  sc.fillStyle = '#e9e4d2'; sc.fillRect(0, 0, 512, 64); sc.fillStyle = '#1b1b1b'; sc.font = `700 26px ${MARKER}`; sc.textAlign = 'center';
  ['AMB', 'AMB', 'VOX', 'VOX', 'FX', 'CROWD', 'RAIN', 'TALK'].forEach((t, c) => sc.fillText(t, (c + 0.5) * 64, 42));
  strip.tex.needsUpdate = true;
  const stripM = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.07).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: strip.tex, roughness: 0.9 }));
  stripM.position.set(0, 0.0345, 0.36); mid.add(stripM);
  const meterM = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.12), new THREE.MeshBasicMaterial({ map: meters.tex, color: new THREE.Color(1.6, 1.6, 1.6) }));
  meterM.position.set(0, 1.0, -0.339); mid.parent.add(meterM);
  for (const k of [1, 3]) { const m2 = meterM.clone(); m2.position.copy(meterM.position); tops[k].parent.add(m2); }
  function paintMeters(t) {
    const c = meters.ctx; c.fillStyle = '#050605'; c.fillRect(0, 0, 512, 64);
    for (let i = 0; i < 24; i++) {
      const lv = 0.35 + 0.3 * Math.sin(t * (1.3 + i * 0.37) + i) + 0.25 * Math.sin(t * 5.1 + i * 2.3);
      for (let s = 0; s < 12; s++) if (s / 12 < lv) { c.fillStyle = s > 9 ? '#ff4a2a' : s > 7 ? '#ffc42a' : '#3cff6a'; c.fillRect(10 + i * 20.8, 56 - s * 4.4, 15, 3); }
    }
    meters.tex.needsUpdate = true;
  }
  ctx.action('backstage', { hover: (h) => h.info || '', click: () => true });

  // ----- an empty chair, a headset, a mug, a clipboard, a gooseneck lamp -----
  const wood = M({ color: '#3b2a1c', roughness: 0.6 }), canvasM = M({ color: '#141414', roughness: 0.95, side: THREE.DoubleSide });
  const chair = new THREE.Group(), cp = at(2.55, 0.62); chair.position.copy(cp); chair.rotation.y = faceIn(0.62) + Math.PI; root.add(chair);
  const stick = (w, h, d, x, y, z, m = wood, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; chair.add(o); return o; };
  for (const sx of [-0.27, 0.27]) {
    stick(0.035, 1.0, 0.035, sx, 0.5, 0.18, wood, 0.18); stick(0.035, 1.0, 0.035, sx, 0.5, -0.18, wood, -0.18);   // the crossed legs (from the side)
    stick(0.035, 0.035, 0.5, sx, 0.98, 0); stick(0.035, 0.75, 0.035, sx, 1.25, -0.22);
  }
  stick(0.54, 0.012, 0.42, 0, 0.94, 0, canvasM); stick(0.54, 0.26, 0.012, 0, 1.38, -0.22, canvasM);
  stick(0.6, 0.03, 0.03, 0, 0.12, 0.25); stick(0.6, 0.03, 0.03, 0, 0.12, -0.25);
  aabb(cp.x, cp.z, 0.65, 0.6, chair.rotation.y);
  hits.push(ctx.hitBox(chair, 0.7, 1.5, 0.7, 0, 0.75, 0, info('A tall folding chair', 'Empty. The canvas is worn where someone leans back.')));
  const prop = (k, x, z) => { const g = new THREE.Group(); tops[k].add(g); g.position.set(x, 0.035, z); return g; };
  const hs = prop(0, -0.2, 0.15), black = M({ color: '#111', roughness: 0.6 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.009, 6, 20, Math.PI), black); band.rotation.set(-Math.PI / 2 + 0.3, 0, 0.4); band.position.y = 0.03; hs.add(band);
  for (const s of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14), black); cup.position.set(s * 0.08 * Math.cos(0.4), 0.02, s * -0.08 * Math.sin(0.4)); hs.add(cup); }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), black); boom.rotation.z = 1.3; boom.position.set(-0.12, 0.03, 0.05); hs.add(boom);
  hits.push(ctx.hitBox(hs, 0.26, 0.1, 0.2, 0, 0.03, 0, info('A headset', 'Still warm. Somebody’s talking quietly in it.')));
  const mug = prop(4, 0.25, 0.1), white = M({ color: '#e9e6df', roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 18, 1, true), white); body.position.y = 0.05; mug.add(body);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.038, 18).rotateX(-Math.PI / 2), white); bottom.position.y = 0.002; mug.add(bottom);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.04, 18).rotateX(-Math.PI / 2), M({ color: '#2a1a10', roughness: 0.15 })); coffee.position.y = 0.075; mug.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12), white); handle.position.set(0.048, 0.05, 0); mug.add(handle);
  hits.push(ctx.hitBox(mug, 0.12, 0.12, 0.1, 0, 0.05, 0, info('A mug of coffee', 'Stone cold, a skin on it.')));
  const clip = prop(1, 0.2, 0.18);
  clip.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.006, 0.31), M({ color: '#7a5a32' })), {}));
  const sheet = makeCanvas(256, 340), shc = sheet.ctx;
  shc.fillStyle = '#f4f1e6'; shc.fillRect(0, 0, 256, 340); shc.fillStyle = '#222'; shc.font = `700 18px ${FONT}`; shc.fillText('RUNNING ORDER', 20, 34);
  shc.font = `400 14px ${FONT}`;
  ['06:12  SUNRISE', '07:30  LIGHTS AUTO', '09:00  OFFICE OPENS', '12:30  CLOUD 40%', '17:45  LIGHTS UP', '19:58  SUNSET', '22:00  WIND DOWN'].forEach((l, i) => shc.fillText(l, 20, 70 + i * 34));
  shc.strokeStyle = '#c33'; shc.lineWidth = 2; shc.beginPath(); shc.moveTo(16, 140); shc.lineTo(230, 140); shc.stroke();
  sheet.tex.needsUpdate = true;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sheet.tex, roughness: 0.95 }));
  paper.position.set(0, 0.004, 0.01); clip.add(paper);
  hits.push(ctx.hitBox(clip, 0.25, 0.04, 0.32, 0, 0.01, 0, info('A clipboard', 'A running order for today. One line has been crossed out.')));
  const lamp = prop(3, 0.38, -0.15);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.32, 6), black); neck.position.set(0, 0.16, 0); neck.rotation.z = 0.3; lamp.add(neck);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 12, 1, true), M({ color: '#222', side: THREE.DoubleSide })); shade.position.set(-0.05, 0.31, 0); shade.rotation.z = 2.4; lamp.add(shade);
  const bulb = new THREE.PointLight('#ffcf8a', 0.5, 2.2, 1.8); bulb.position.set(-0.07, 0.27, 0); lamp.add(bulb);

  // ----- the window over the set: dark glass, and far below, work lights in the dark -----
  const set = makeCanvas(1024, 256), stc = set.ctx;
  stc.fillStyle = '#000'; stc.fillRect(0, 0, 1024, 256);
  for (let k = 0; k < 90; k++) { const x = R() * 1024, y = 60 + R() * 196, r = 0.6 + R() * 1.6; stc.fillStyle = `rgba(${R() < 0.3 ? '255,200,140' : '200,215,255'},${0.3 + R() * 0.6})`; stc.beginPath(); stc.arc(x, y, r, 0, 7); stc.fill(); }
  stc.strokeStyle = 'rgba(80,90,110,.25)'; for (let k = 0; k < 14; k++) { stc.beginPath(); const x = R() * 1024; stc.moveTo(x, 0); stc.lineTo(x + (R() - 0.5) * 200, 256); stc.stroke(); }
  set.tex.needsUpdate = true;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(60, 15), new THREE.MeshBasicMaterial({ map: set.tex, color: new THREE.Color(1.4, 1.4, 1.4), fog: false }));
  far.position.set(0, -4, GAL.z0 - 26); root.add(far);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.75), new THREE.MeshStandardMaterial({ color: '#0a0d12', roughness: 0.08, metalness: 0.7, transparent: true, opacity: 0.55 }));
  glass.position.set(0, 1.875, GAL.z0 - 0.1); glass.layers.set(1); root.add(glass);
  hits.push(Object.assign(ctx.hitBox(root, 9, 1.75, 0.1, 0, 1.875, GAL.z0 - 0.1, info('A window', 'Out over the dark. Far below, work lights.')), {}));

  // ----- each frame while you're in here (or looking in) -----
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), bankC = new THREE.Vector3(), sphere = new THREE.Sphere();
  let meterAt = 0;
  let statusAt = -1;
  function fx(dt, t) {
    paintClock();
    if (t - statusAt > 0.5) { statusAt = t; paintStatus(); }
    if (t - meterAt > 0.12) { meterAt = t; paintMeters(t); }
    // the feeds: only from in here, only with the bank in view, the most overdue first, one a frame
    if (!bs.on || !ctx.cctv?.into) return;
    bankC.copy(at(RB, 0, 1.75)).applyMatrix4(root.matrixWorld); sphere.set(bankC, 6);
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (!frustum.intersectsSphere(sphere)) return;
    let due = null;
    for (const s of screens) if (s.cam && (s.cam !== pier || E.E.built) && t - s.at >= 1 / FPS && (!due || s.at < due.at)) due = s;   // (the pier: once there's one)
    if (!due) return;
    due.at = t;
    ctx.cctv.into(due.cam, due.rt, t);
    due.mesh.material.uniforms.on.value = 1;
  }
  return { fx, hits, cols, screens, pier, door, at: (id) => screens.find((s) => s.id === id) };
}
