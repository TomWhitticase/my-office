// The gallery behind the sky (world-edge-backstage.js): a dark control room laid out like a broadcast gallery. Its front
// is a wall of monitors on a shallow arc, each showing a live feed of the world: the office's own security cameras
// (systems/cctv.js, the same pictures as the Security app), one on the pier where the helicopter waits, and one of the
// gallery itself from the front corner, where you'll see yourself come in; the city's own cameras along the top; a clock,
// and a status screen of what the console (world-edge-console.js) has set. Each screen faces the director's chair square
// on: turned to it, then leant toward it by its height. The operators' desks step up toward you in tiers facing it (the
// sound desk in front, vision and production behind, the director's console at the top), their chairs empty, little
// monitors of scopes and running orders; a headset, a mug of cold coffee, a clipboard; a window over the set in the side
// wall. Feeds are drawn only while you're in here and the wall is in view, one a frame at most, a few times a second each,
// at 256 x 144; the text on the clock and status screens is kept inside a monitor's safe area.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dash, FONT, makeCanvas, MARKER, ME_LAYER } from '../util.js';

const FW = 256, FH = 144, FPS = 3;

export function installGallery(ctx, bs, PLAN) {
  const { camera } = ctx, root = bs.root, { GAL, DIR, TIERS, PIT } = PLAN, R = Math.random;
  const hits = [], cols = [];
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, ...o });
  // round the director's position: angle a from straight ahead (-z), r out
  const at = (r, a, y = 0) => new THREE.Vector3(DIR.x + r * Math.sin(a), y, DIR.z - r * Math.cos(a));
  const faceIn = (a) => -a;   // a rotation.y whose +z points from angle a back at the director
  const aabb = (cx, cz, w, d, yaw, pad = 0) => {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), hx = (w * c + d * s) / 2 + pad, hz = (w * s + d * c) / 2 + pad;
    cols.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz });
  };
  const info = (h, k) => ({ action: 'backstage', reach: 4, info: `<b>${h}</b>${k ? `<div class="k">${k}</div>` : ''}` });
  const mergeAll = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));

  // ----- the monitor wall: 7 columns of 3 on a shallow arc round the director, cabinets under, a fascia over -----
  const RB = 11.9, COLS = 7, SW = 1.5, SH = SW * 9 / 16, SK = SW / 1.2, SPAN = (SW + 0.08) / RB, A0 = -SPAN * (COLS - 1) / 2;
  const pier = { F: { cctv: null }, eye: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 3000), n: 0, name: 'Pier' };
  const door = { F: bs, eye: new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 60), n: 0, name: 'Gallery' };
  for (const c of [pier.eye, door.eye]) { c.layers.enable(1); c.layers.enable(ME_LAYER); }
  const LX = (PLAN.LOCK.x0 + PLAN.LOCK.x1) / 2;   // over the sound lock's inner doors, down over the tiers to the wall: you, coming in
  door.eye.position.set(LX + 1.1, 3.3, GAL.z1 - 0.25); door.eye.lookAt(-0.5, -1.4, -11); root.add(door.eye);
  // the pier's camera, high on the wall by the stairs looking down at it (set in the world once we know where that is)
  const E = ctx.heli.edge;
  pier.eye.position.set(-E.R + 16, E.PT + 8, E.PIER.u0 - 8); pier.eye.lookAt(-E.R + 5, E.PT + 1.5, (E.PIER.u0 + E.PIER.u1) / 2 + 3); pier.eye.updateMatrixWorld();
  const byId = new Map((ctx.cctv?.cams || []).map((c) => [c.id, c]));
  const SLOTS = [['city-street', 'city-bridge', 'city-park', 'status', 'city-rooftop', 'city-sea', 'city-pass'],
    ['roof-terrace', 'roof-helipad', 'lobby', 'clock', 'meeting', 'wellness-gym', 'hall-noc'],
    ['desks-se', 'breakroom', 'my-office', 'pier', 'door', 'lounge', 'wellness-pool']];
  const ROWS = [2.45, 1.54, 0.63], EYE_AT = [DIR.y + 1.65, RB + 1.1];   // each row's height; leant toward the director's eye, this high, this far
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
  // each screen's caption, burnt into its bottom-left corner: a 256 x 32 cell each of a shared strip, the text fitted inside
  // its cell with a margin (and the caption itself kept inside the picture's own margin)
  const labels = makeCanvas(1024, 256), lc = labels.ctx, LBL = [0.44 * SK, 0.055 * SK];
  const cab = [], bez = [], labelGeos = [];
  let n = 0;
  for (let row = 0; row < ROWS.length; row++) for (let col = 0; col < COLS; col++) {
    const a = A0 + col * SPAN, id = SLOTS[row][col], y = ROWS[row], p = at(RB, a, y), yaw = faceIn(a);
    const tilt = Math.atan2(y - EYE_AT[0], EYE_AT[1]);   // top toward the director (+x about its own axis, after the turn)
    const cam = id === 'pier' ? pier : id === 'door' ? door : byId.get(id), still = id === 'clock' || id === 'status';
    const name = id === 'clock' ? 'Clock' : id === 'status' ? 'Status' : cam ? (cam.city ? cam.name : cam.name.split(' · ').pop()) : id;
    const rt = new THREE.WebGLRenderTarget(FW, FH, { depthBuffer: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenM(rt.texture));
    mesh.position.copy(p); mesh.rotation.set(tilt, yaw, 0, 'YXZ'); root.add(mesh);   // (turned, then leant: no roll)
    bez.push(new THREE.BoxGeometry(SW + 0.07, SH + 0.065, 0.08).translate(0, 0, -0.045).rotateX(tilt).rotateY(yaw).translate(p.x, p.y, p.z));
    // its label: a slot of the shared strip
    const u = n % 4, v = Math.floor(n / 4), lx = u * 256, ly = v * 32;
    lc.clearRect(lx, ly, 256, 32);
    if (!still) {
      lc.fillStyle = 'rgba(0,0,0,.6)'; lc.fillRect(lx, ly, 256, 32);
      lc.fillStyle = '#e0352b'; lc.beginPath(); lc.arc(lx + 14, ly + 16, 5, 0, 7); lc.fill();
      let txt = `${String(n + 1).padStart(2, '0')} ${name.toUpperCase()}`, size = 17;
      lc.font = `600 ${size}px ui-monospace, Menlo, monospace`;
      while (lc.measureText(txt).width > 256 - 26 - 8 && size > 12) lc.font = `600 ${--size}px ui-monospace, Menlo, monospace`;
      while (lc.measureText(txt).width > 256 - 26 - 8) txt = txt.slice(0, -1);
      lc.fillStyle = '#e8ecf2'; lc.textBaseline = 'middle'; lc.fillText(txt, lx + 26, ly + 16.5);
    }
    const lg = new THREE.PlaneGeometry(LBL[0], LBL[1]), U = lg.attributes.uv;
    for (let k = 0; k < U.count; k++) U.setXY(k, (u + U.getX(k)) / 4, 1 - (v + 1 - U.getY(k)) / 8);
    // (inside the picture by 4% of its height and width, as a broadcast caption would be)
    if (!still) labelGeos.push(lg.translate(-SW / 2 + SW * 0.04 + LBL[0] / 2, -SH / 2 + SH * 0.05 + LBL[1] / 2, 0.004).rotateX(tilt).rotateY(yaw).translate(p.x, p.y, p.z));
    screens.push({ id, cam, rt, mesh, at: -1, name });
    hits.push(Object.assign(mesh, { userData: info(name, still ? '' : id === 'pier' || id === 'door' ? 'Live' : 'Live · the same camera as the Security app') }));
    n++;
  }
  const cabTop = ROWS[2] - SH / 2 - 0.06, fasc = ROWS[0] + SH / 2 + 0.06;
  for (let col = 0; col < COLS; col++) {   // the cabinet under each column, and the fascia over
    const a = A0 + col * SPAN, yaw = faceIn(a), p = at(RB + 0.2, a);
    cab.push(new THREE.BoxGeometry(SW + 0.1, cabTop - PIT, 0.6).translate(0, (cabTop + PIT) / 2, 0).rotateY(yaw).translate(p.x, 0, p.z));
    cab.push(new THREE.BoxGeometry(SW + 0.1, 0.26, 0.5).translate(0, fasc + 0.13, -0.05).rotateY(yaw).translate(p.x, 0, p.z));
    cab.push(new THREE.BoxGeometry(SW + 0.1, fasc - cabTop, 0.3).translate(0, (fasc + cabTop) / 2, -0.25).rotateY(yaw).translate(p.x, 0, p.z));   // the frame behind the screens
    aabb(p.x, p.z, SW + 0.1, 0.6, yaw);
  }
  const metal = M({ color: '#1a1b1e', roughness: 0.5, metalness: 0.4 });
  root.add(new THREE.Mesh(mergeAll(cab), metal), new THREE.Mesh(mergeAll(bez), M({ color: '#0c0d0f', roughness: 0.35, metalness: 0.3 })));
  labels.tex.needsUpdate = true;
  root.add(new THREE.Mesh(mergeAll(labelGeos), new THREE.MeshBasicMaterial({ map: labels.tex, transparent: true, color: new THREE.Color(0.9, 0.9, 0.9) })));
  // The two screens of text: everything inside a margin of 8% of the width and 10% of the height (a monitor's safe area).
  const SAFE = { x: Math.round(FW * 0.08), y: Math.round(FH * 0.1) };
  // the clock's own screen: big amber digits, the office's time (the sky's clock, whatever it's set to)
  const clock = makeCanvas(FW, FH), clockS = screens.find((s) => s.id === 'clock');
  clockS.mesh.material.uniforms.map.value = clock.tex; clockS.mesh.material.uniforms.on.value = 1;
  let clockText = '';
  function paintClock() {
    const d = new Date(ctx.simNow()), txt = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    if (txt === clockText) return;
    clockText = txt;
    const c = clock.ctx, w = FW - 2 * SAFE.x; c.fillStyle = '#060504'; c.fillRect(0, 0, FW, FH);
    c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillStyle = ctx.clockState.mode === 'live' ? '#e0352b' : '#6a6a6a'; c.beginPath(); c.arc(SAFE.x + 6, SAFE.y + 8, 6, 0, 7); c.fill();
    c.font = `700 14px ${FONT}`; c.fillText(ctx.clockState.mode === 'live' ? 'LIVE' : ctx.clockState.speed < 0.01 ? 'HELD' : `×${ctx.clockState.speed}`, SAFE.x + 18, SAFE.y + 9);
    c.textAlign = 'center'; c.fillStyle = '#ffb02e';
    let size = 50; c.font = `700 ${size}px ui-monospace, Menlo, monospace`;
    while (c.measureText(txt).width > w && size > 20) c.font = `700 ${--size}px ui-monospace, Menlo, monospace`;
    c.fillText(txt, FW / 2, FH / 2 + 4);
    const date = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    size = 15; c.font = `600 ${size}px ${FONT}`;
    while (c.measureText(date).width > w && size > 9) c.font = `600 ${--size}px ${FONT}`;
    c.fillStyle = '#b07a20'; c.fillText(date, FW / 2, FH - SAFE.y - 8);
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
    const c = status.ctx, lh = (FH - 2 * SAFE.y) / lines.length; c.fillStyle = '#060504'; c.fillRect(0, 0, FW, FH);
    c.font = `700 ${Math.floor(lh * 0.72)}px ui-monospace, Menlo, monospace`; c.textBaseline = 'middle';
    lines.forEach(([k, v], i) => {
      const y = SAFE.y + lh * (i + 0.5);
      c.fillStyle = '#b07a20'; c.textAlign = 'left'; c.fillText(k, SAFE.x, y);
      c.fillStyle = '#ffb02e'; c.textAlign = 'right'; c.fillText(v, FW - SAFE.x, y);
    });
    status.tex.needsUpdate = true;
  }
  // the wall's glow on the room
  for (const a of [-0.3, 0, 0.3]) { const l = new THREE.PointLight('#9fbcff', 2.6, 10, 1.6), p = at(RB - 1.4, a, 1.2); l.position.copy(p); root.add(l); }
  ctx.action('backstage', { hover: (h) => h.info || '', click: () => true });

  // ----- the tiers' desks, facing the wall: the sound desk in front, vision and production behind, empty chairs -----
  // Each desk a row of 1.1 m segments along its tier's front edge; the operators sat behind them, on the tier.
  const SLOPE = 0.16, deskG = [], capG = [], knobG = [], slotG = [], monG = [], monS = [], chairG = [];
  const meters = makeCanvas(512, 64), tops = [];
  // the desks' little monitors: one shared texture of four pictures (scopes, a running order, a multiviewer, bars)
  const pics = makeCanvas(512, 256), pc = pics.ctx;
  {
    pc.fillStyle = '#05070a'; pc.fillRect(0, 0, 512, 256);
    pc.strokeStyle = '#3cff6a'; pc.lineWidth = 1.5; pc.beginPath(); for (let x = 0; x < 256; x++) pc.lineTo(x, 64 + Math.sin(x / 9) * 30 * Math.sin(x / 61) + (R() - 0.5) * 8); pc.stroke();
    pc.strokeStyle = 'rgba(120,200,255,.5)'; pc.beginPath(); pc.arc(64, 64, 40, 0, 7); pc.stroke();
    pc.fillStyle = '#d8dce2'; pc.font = `600 11px ${FONT}`; ['VT 1  OPENING TITLES', 'CAM 2  WIDE', 'GFX  WEATHER MAP', 'CAM 4  PIER', 'VT 3  CITY', 'BREAK'].forEach((l, i) => pc.fillText(l, 268, 22 + i * 18));
    pc.fillStyle = '#c33'; pc.fillRect(260, 31, 240, 2);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { pc.fillStyle = `hsl(${200 + R() * 40},20%,${10 + R() * 25}%)`; pc.fillRect(4 + i * 63, 132 + j * 60, 59, 56); }
    ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'].forEach((c, i) => { pc.fillStyle = c; pc.fillRect(256 + i * 36.6, 128, 37, 96); });
    pc.fillStyle = '#111'; pc.fillRect(256, 224, 256, 32);
    pics.tex.needsUpdate = true;
  }
  const monitor = (m, x, z, k) => {   // a little monitor on a stand, on a desk segment's back edge (in its space, m)
    monG.push(new THREE.BoxGeometry(0.5, 0.31, 0.04).translate(x, 1.12, z).applyMatrix4(m), new THREE.BoxGeometry(0.04, 0.2, 0.04).translate(x, 0.88, z - 0.02).applyMatrix4(m),
      new THREE.BoxGeometry(0.2, 0.015, 0.14).translate(x, 0.785, z - 0.02).applyMatrix4(m));
    const s = new THREE.PlaneGeometry(0.46, 0.27), U = s.attributes.uv, cu = k % 2, cv = (k >> 1) % 2;
    for (let i = 0; i < U.count; i++) U.setXY(i, (cu + U.getX(i)) / 2, 1 - (cv + 1 - U.getY(i)) / 2);
    monS.push(s.translate(x, 1.12, z + 0.021).applyMatrix4(m));
  };
  const chair = (x, y, z, yaw) => {   // an operator's chair: five-star base, a post, a seat, a back
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    chairG.push(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 10).translate(0, 0.07, 0).applyMatrix4(m), new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8).translate(0, 0.27, 0).applyMatrix4(m),
      new THREE.BoxGeometry(0.48, 0.07, 0.46).translate(0, 0.47, 0).applyMatrix4(m), new THREE.BoxGeometry(0.44, 0.52, 0.06).translate(0, 0.82, 0.24).rotateX(-0.08).applyMatrix4(m),
      new THREE.BoxGeometry(0.05, 0.05, 0.3).translate(-0.25, 0.65, 0.02).applyMatrix4(m), new THREE.BoxGeometry(0.05, 0.05, 0.3).translate(0.25, 0.65, 0.02).applyMatrix4(m));
  };
  const SEG = 1.1, SEGS = 10;
  TIERS.forEach(([zf, y], tier) => {
    for (let k = 0; k < SEGS; k++) {
      const x = -SEG * (SEGS - 1) / 2 + k * SEG;
      if (tier === 2 && Math.abs(x) < 2.1) continue;   // (the director's console, world-edge-console.js)
      const zc = zf + 0.45, m = new THREE.Matrix4().setPosition(x, y, zc), g = new THREE.Group(); g.position.set(x, y, zc); root.add(g);
      deskG.push(new THREE.BoxGeometry(SEG - 0.02, 0.76, 0.8).translate(0, 0.38, 0).applyMatrix4(m));
      if (tier === 0) {   // the sound desk: a sloped top, channel strips, a meter bridge
        deskG.push(new THREE.BoxGeometry(SEG - 0.02, 0.3, 0.16).translate(0, 0.98, -0.38).applyMatrix4(m));
        const top = new THREE.Group(); top.position.set(0, 0.82, 0.02); top.rotation.x = SLOPE; g.add(top); tops.push(top);
        deskG.push(new THREE.BoxGeometry(SEG - 0.02, 0.06, 0.8).translate(0, 0.79, 0).applyMatrix4(m));
      } else {   // vision and production: a flat top, two monitors, a keyboard
        deskG.push(new THREE.BoxGeometry(SEG - 0.02, 0.04, 0.8).translate(0, 0.78, 0).applyMatrix4(m));
        monitor(m, -0.26, -0.28, k + tier); monitor(m, 0.26, -0.28, k + tier + 1);
        capG.push(new THREE.BoxGeometry(0.42, 0.02, 0.14).translate(0, 0.81, 0.14).applyMatrix4(m));
      }
      // its chair, pushed back from it, turned a little this way or that
      chair(x + (R() - 0.5) * 0.3, y, zf + 1.2 + R() * 0.25, (R() - 0.5) * 0.7);
    }
    aabb(0, zf + 0.45, SEG * SEGS, 0.8, 0);
  });
  // the sound desk's channel strips: a fader each, knobs above (all in its sloped tops' space, merged)
  tops.forEach((top) => {
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
  root.add(new THREE.Mesh(mergeAll(monG), M({ color: '#0e0f11', roughness: 0.4, metalness: 0.3 })));
  root.add(new THREE.Mesh(mergeAll(monS), new THREE.MeshBasicMaterial({ map: pics.tex, color: new THREE.Color(1.1, 1.1, 1.1) })));
  root.add(new THREE.Mesh(mergeAll(chairG), M({ color: '#17181b', roughness: 0.75 })));
  hits.push(ctx.hitBox(root, SEG * SEGS, 1.0, 0.8, 0, TIERS[0][1] + 0.6, TIERS[0][0] + 0.45, info('The sound desk', 'Faders down. Someone’s left a headset on it.')));
  hits.push(ctx.hitBox(root, SEG * SEGS, 1.2, 0.8, 0, TIERS[1][1] + 0.7, TIERS[1][0] + 0.45, info('Vision and graphics', 'Scopes, a running order, colour bars. Nobody at them.')));
  for (const s of [-1, 1]) hits.push(ctx.hitBox(root, 3.3, 1.2, 0.8, s * 3.85, TIERS[2][1] + 0.7, TIERS[2][0] + 0.45, info('Production', 'Two monitors each, the chairs pushed back.')));
  // the scribble strip, and the meters on the bridge
  const mid = tops[Math.floor(tops.length / 2)];
  const strip = makeCanvas(512, 64), sc = strip.ctx;
  sc.fillStyle = '#e9e4d2'; sc.fillRect(0, 0, 512, 64); sc.fillStyle = '#1b1b1b'; sc.font = `700 26px ${MARKER}`; sc.textAlign = 'center';
  ['AMB', 'AMB', 'VOX', 'VOX', 'FX', 'CROWD', 'RAIN', 'TALK'].forEach((t, c) => sc.fillText(t, (c + 0.5) * 64, 42));
  strip.tex.needsUpdate = true;
  const stripM = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.07).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: strip.tex, roughness: 0.9 }));
  stripM.position.set(0, 0.0345, 0.36); mid.add(stripM);
  const meterM = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.12), new THREE.MeshBasicMaterial({ map: meters.tex, color: new THREE.Color(1.6, 1.6, 1.6) }));
  meterM.position.set(0, 0.98, -0.299); mid.parent.add(meterM);
  for (const k of [1, 3, 6, 8]) { const m2 = meterM.clone(); m2.position.copy(meterM.position); tops[k].parent.add(m2); }
  function paintMeters(t) {
    const c = meters.ctx; c.fillStyle = '#050605'; c.fillRect(0, 0, 512, 64);
    for (let i = 0; i < 24; i++) {
      const lv = 0.35 + 0.3 * Math.sin(t * (1.3 + i * 0.37) + i) + 0.25 * Math.sin(t * 5.1 + i * 2.3);
      for (let s = 0; s < 12; s++) if (s / 12 < lv) { c.fillStyle = s > 9 ? '#ff4a2a' : s > 7 ? '#ffc42a' : '#3cff6a'; c.fillRect(10 + i * 20.8, 56 - s * 4.4, 15, 3); }
    }
    meters.tex.needsUpdate = true;
  }

  // ----- the director's chair (tall, folding, rolled aside from the console), a headset, a mug, a clipboard, a lamp -----
  const wood = M({ color: '#3b2a1c', roughness: 0.6 }), canvasM = M({ color: '#141414', roughness: 0.95, side: THREE.DoubleSide });
  const dchair = new THREE.Group(); dchair.position.set(DIR.x + 2.0, DIR.y, DIR.z + 1.35); dchair.rotation.y = -0.5; root.add(dchair);
  const stick = (w, h, d, x, y, z, m = wood, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; dchair.add(o); return o; };
  for (const sx of [-0.27, 0.27]) {
    stick(0.035, 1.0, 0.035, sx, 0.5, 0.18, wood, 0.18); stick(0.035, 1.0, 0.035, sx, 0.5, -0.18, wood, -0.18);   // the crossed legs (from the side)
    stick(0.035, 0.035, 0.5, sx, 0.98, 0); stick(0.035, 0.75, 0.035, sx, 1.25, 0.22);
  }
  stick(0.54, 0.012, 0.42, 0, 0.94, 0, canvasM); stick(0.54, 0.26, 0.012, 0, 1.38, 0.22, canvasM);
  stick(0.6, 0.03, 0.03, 0, 0.12, 0.25); stick(0.6, 0.03, 0.03, 0, 0.12, -0.25);
  aabb(dchair.position.x, dchair.position.z, 0.65, 0.6, dchair.rotation.y);
  hits.push(ctx.hitBox(dchair, 0.7, 1.5, 0.7, 0, 0.75, 0, info('The director’s chair', 'Empty. The canvas is worn where someone leans back.')));
  const prop = (k, x, z) => { const g = new THREE.Group(); tops[k].add(g); g.position.set(x, 0.035, z); return g; };
  const hs = prop(3, -0.2, 0.15), black = M({ color: '#111', roughness: 0.6 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.009, 6, 20, Math.PI), black); band.rotation.set(-Math.PI / 2 + 0.3, 0, 0.4); band.position.y = 0.03; hs.add(band);
  for (const s of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14), black); cup.position.set(s * 0.08 * Math.cos(0.4), 0.02, s * -0.08 * Math.sin(0.4)); hs.add(cup); }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), black); boom.rotation.z = 1.3; boom.position.set(-0.12, 0.03, 0.05); hs.add(boom);
  hits.push(ctx.hitBox(hs, 0.26, 0.1, 0.2, 0, 0.03, 0, info('A headset', 'Still warm. Somebody’s talking quietly in it.')));
  const mug = prop(6, 0.25, 0.1), white = M({ color: '#e9e6df', roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 18, 1, true), white); body.position.y = 0.05; mug.add(body);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.038, 18).rotateX(-Math.PI / 2), white); bottom.position.y = 0.002; mug.add(bottom);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.04, 18).rotateX(-Math.PI / 2), M({ color: '#2a1a10', roughness: 0.15 })); coffee.position.y = 0.075; mug.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12), white); handle.position.set(0.048, 0.05, 0); mug.add(handle);
  hits.push(ctx.hitBox(mug, 0.12, 0.12, 0.1, 0, 0.05, 0, info('A mug of coffee', 'Stone cold, a skin on it.')));
  const clip = prop(5, 0.2, 0.18);
  clip.add(new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.006, 0.31), M({ color: '#7a5a32' })));
  const sheet = makeCanvas(256, 340), shc = sheet.ctx;
  shc.fillStyle = '#f4f1e6'; shc.fillRect(0, 0, 256, 340); shc.fillStyle = '#222'; shc.font = `700 18px ${FONT}`; shc.fillText('RUNNING ORDER', 20, 34);
  shc.font = `400 14px ${FONT}`;
  ['06:12  SUNRISE', '07:30  LIGHTS AUTO', '09:00  OFFICE OPENS', '12:30  CLOUD 40%', '17:45  LIGHTS UP', '19:58  SUNSET', '22:00  WIND DOWN'].forEach((l, i) => shc.fillText(l, 20, 70 + i * 34));
  shc.strokeStyle = '#c33'; shc.lineWidth = 2; shc.beginPath(); shc.moveTo(16, 140); shc.lineTo(230, 140); shc.stroke();
  sheet.tex.needsUpdate = true;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: sheet.tex, roughness: 0.95 }));
  paper.position.set(0, 0.004, 0.01); clip.add(paper);
  hits.push(ctx.hitBox(clip, 0.25, 0.04, 0.32, 0, 0.01, 0, info('A clipboard', 'A running order for today. One line has been crossed out.')));
  const lamp = prop(4, 0.38, -0.15);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.32, 6), black); neck.position.set(0, 0.16, 0); neck.rotation.z = 0.3; lamp.add(neck);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 12, 1, true), M({ color: '#222', side: THREE.DoubleSide })); shade.position.set(-0.05, 0.31, 0); shade.rotation.z = 2.4; lamp.add(shade);
  const bulb = new THREE.PointLight('#ffcf8a', 0.5, 2.2, 1.8); bulb.position.set(-0.07, 0.27, 0); lamp.add(bulb);

  // ----- the window over the set, in the east wall over the stairs: dark glass, and far below, work lights in the dark -----
  const set = makeCanvas(1024, 256), stc = set.ctx;
  stc.fillStyle = '#000'; stc.fillRect(0, 0, 1024, 256);
  for (let k = 0; k < 90; k++) { const x = R() * 1024, y = 60 + R() * 196, r = 0.6 + R() * 1.6; stc.fillStyle = `rgba(${R() < 0.3 ? '255,200,140' : '200,215,255'},${0.3 + R() * 0.6})`; stc.beginPath(); stc.arc(x, y, r, 0, 7); stc.fill(); }
  stc.strokeStyle = 'rgba(80,90,110,.25)'; for (let k = 0; k < 14; k++) { stc.beginPath(); const x = R() * 1024; stc.moveTo(x, 0); stc.lineTo(x + (R() - 0.5) * 200, 256); stc.stroke(); }
  set.tex.needsUpdate = true;
  const WZ = -10, WY = 1.7;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), new THREE.MeshBasicMaterial({ map: set.tex, color: new THREE.Color(1.4, 1.4, 1.4), fog: false }));
  far.position.set(GAL.x1 + 14, -4, -15); far.rotation.y = -Math.PI / 2; root.add(far);   // (clear of the corridors behind)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.6), new THREE.MeshStandardMaterial({ color: '#0a0d12', roughness: 0.08, metalness: 0.7, transparent: true, opacity: 0.55 }));
  glass.position.set(GAL.x1 + 0.1, WY, WZ); glass.rotation.y = -Math.PI / 2; glass.layers.set(1); root.add(glass);
  hits.push(ctx.hitBox(root, 0.1, 1.6, 8, GAL.x1 + 0.1, WY, WZ, info('A window', 'Out over the dark. Far below, work lights.')));

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
    bankC.copy(at(RB, 0, 1.7)).applyMatrix4(root.matrixWorld); sphere.set(bankC, 7);
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
