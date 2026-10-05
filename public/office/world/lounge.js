// The lounge: the meeting table, the corner nook with two armchairs, and your MacBook on its table (open it from either
// armchair; while it's open the live desktop moves onto its lid).

import * as THREE from 'three';
import { box, cyl, FONT, makeCanvas, makeScreen, mat, mergedBoxes, rng, solid } from '../util.js';

export function install(ctx) {
  const { world, deskTopM, plant, sofa, seats, pendant, floorLamp, legM, officeChair } = ctx;
  // ----- lounge / meeting area -----
  box(world, 3, 0.05, 1.2, '#e9e4da', 10, 0.74, 9, { material: deskTopM });
  for (const dx of [-1.3, 1.3]) box(world, 0.06, 0.72, 1, '', 10 + dx, 0.36, 9, { material: legM });
  solid(10, 9, 3, 1.2);
  for (const dx of [-1, 0, 1]) { officeChair(10 + dx, 8.15, 0, '#7a8796'); officeChair(10 + dx, 9.85, Math.PI, '#7a8796'); }
  plant(3.5, 3.4); plant(19.2, 14.2, 1.2); plant(5.4, -2.9, 0.9);
  // Corner nook: two armchairs facing each other across a low table.
  sofa(15.85, 13.95, Math.PI / 2, 1.05, '#8a6f5a'); sofa(17.55, 13.95, -Math.PI / 2, 1.05, '#8a6f5a');
  box(world, 0.6, 0.04, 0.5, '#8a6a4a', 16.7, 0.38, 14.05, { mat: { roughness: 0.6 } });
  for (const [dx, dz] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) box(world, 0.035, 0.36, 0.035, '', 16.7 + dx, 0.18, 14.05 + dz,
    { material: legM });
  box(world, 0.22, 0.03, 0.16, '#3f4a6b', 16.66, 0.415, 14.21).rotation.y = 0.1; cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', 16.95, 0.45, 14.21);
  solid(16.7, 14.05, 0.6, 0.5);
  const laptop = macbook(seats.slice(-2));

  // Your MacBook, on the nook table facing whichever armchair you open it from. 14" proportions; the lid hinges at the back
  // (pivot.rotation.x: PI/2 shut, LID_OPEN tilted back). While it's open the dashboard screen moves onto it (see placeHole).
  function macbook(nookSeats) {
    const W = 0.312, D = 0.221, T = 0.011, LT = 0.0045, LH = 0.215;
    const alu = new THREE.MeshStandardMaterial({ color: '#b9bbbf', metalness: 0.4, roughness: 0.55, envMapIntensity: 0.6 });   // bead-blasted, not mirror
    // A rounded-rectangle plate in x-y, extruded `t` back along -z, with softened edges.
    function plate(w, h, t, r) {
      const b = Math.min(0.0015, t / 3), s = new THREE.Shape(), x = -w / 2 + b, y = -h / 2 + b, iw = w - 2 * b, ih = h - 2 * b;
      s.moveTo(x + r, y); s.lineTo(x + iw - r, y); s.quadraticCurveTo(x + iw, y, x + iw, y + r); s.lineTo(x + iw, y + ih - r);
      s.quadraticCurveTo(x + iw, y + ih, x + iw - r, y + ih); s.lineTo(x + r, y + ih); s.quadraticCurveTo(x, y + ih, x, y + ih - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return new THREE.ExtrudeGeometry(s, { depth: t - 2 * b, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -t + b);
    }
    const g = new THREE.Group(); world.add(g);
    const base = new THREE.Mesh(plate(W, D, T, 0.012).rotateX(-Math.PI / 2), alu);
    base.position.y = T; base.castShadow = base.receiveShadow = true; g.add(base);
    // Deck: keyboard well, keycaps, speaker grilles and trackpad on one canvas; the legends double as the backlight.
    const deck = makeCanvas(1024, 726), glow = makeCanvas(1024, 726), c = deck.ctx, e = glow.ctx;
    c.fillStyle = '#c3c5c9'; c.fillRect(0, 0, 1024, 726);
    e.fillStyle = '#000'; e.fillRect(0, 0, 1024, 726);
    c.fillStyle = '#0c0c0d'; c.beginPath(); c.roundRect(128, 34, 768, 352, 10); c.fill();
    c.fillStyle = '#9fa2a7';
    for (const x0 of [44, 914]) for (let y = 50; y < 370; y += 9) for (let x = x0; x < x0 + 66; x += 9) c.fillRect(x, y, 3, 3);
    const ROWS = [
      [[1.5, 'esc'], ...'F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12'.split(' ').map((k) => [1, k]), [1, '']],
      [...'` 1 2 3 4 5 6 7 8 9 0 - ='.split(' ').map((k) => [1, k]), [1.5, 'delete']],
      [[1.5, 'tab'], ...'Q W E R T Y U I O P [ ] \\'.split(' ').map((k) => [1, k])],
      [[1.8, 'caps'], ...'A S D F G H J K L ; \''.split(' ').map((k) => [1, k]), [1.7, 'return']],
      [[2.3, 'shift'], ...'Z X C V B N M , . /'.split(' ').map((k) => [1, k]), [2.2, 'shift']],
      [[1, 'fn'], [1, 'ctrl'], [1, 'opt'], [1.25, 'cmd'], [5.1, ''], [1.25, 'cmd'], [1, 'opt'], [1, '◀'], [1, '▲▼'], [1, '▶']],
    ];
    ROWS.forEach((row, i) => {
      const sum = row.reduce((a, k) => a + k[0], 0), u = 744 / sum, h = i ? 54 : 30, y = i ? 82 + (i - 1) * 59 : 44;
      let x = 140;
      for (const [w, label] of row) {
        c.fillStyle = '#1e1f21'; c.beginPath(); c.roundRect(x + 2, y, w * u - 5, h, 6); c.fill();
        if (label) {
          e.font = `500 ${label.length > 2 ? 13 : 19}px ${FONT}`; e.fillStyle = '#fff'; e.textAlign = 'center';
          e.fillText(label, x + (w * u) / 2, y + h / 2 + 6);
          c.font = e.font; c.fillStyle = '#6d6f73'; c.textAlign = 'center'; c.fillText(label, x + (w * u) / 2, y + h / 2 + 6);
        }
        x += w * u;
      }
    });
    c.fillStyle = '#b9bbbf'; c.strokeStyle = '#a7a9ad'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(292, 420, 440, 276, 16); c.fill(); c.stroke();
    deck.tex.needsUpdate = true; glow.tex.needsUpdate = true;
    const deckM = new THREE.MeshStandardMaterial({ map: deck.tex, metalness: 0.2, roughness: 0.6, envMapIntensity: 0.5, emissive: '#cfe2ff',
      emissiveMap: glow.tex, emissiveIntensity: 0 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.006, D - 0.006), deckM);
    top.rotation.x = -Math.PI / 2; top.position.y = T + 0.0003; top.receiveShadow = true; g.add(top);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, W - 0.05, 12).rotateZ(Math.PI / 2),
      mat('#2b2c2f', { metalness: 0.5, roughness: 0.4 }));
    hinge.position.set(0, T - 0.0005, -D / 2 + 0.0045); g.add(hinge);
    // Lid: aluminium back, black glass bezel with the notch, and the logo. The screen itself is the punched hole.
    const pivot = new THREE.Group(); pivot.position.set(0, T + 0.0022, -D / 2 + 0.003); g.add(pivot);
    const lid = new THREE.Mesh(plate(W, LH, LT, 0.012).translate(0, LH / 2, 0), alu);
    lid.castShadow = true; pivot.add(lid);
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.004, LH - 0.004),
      new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.4, metalness: 0 }));
    bezel.position.set(0, LH / 2, 0.0003); pivot.add(bezel);
    const notch = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.0065), bezel.material);
    notch.position.set(0, LH - 0.002 - 0.0033, 0.0018); pivot.add(notch);
    const logo = makeCanvas(256, 256), l = logo.ctx;
    l.fillStyle = '#fff';
    for (const [x, y, rx, ry] of [[100, 140, 72, 74], [156, 140, 72, 74], [128, 184, 82, 58]]) { l.beginPath(); l.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      l.fill(); }
    l.beginPath(); l.ellipse(144, 40, 13, 30, 0.7, 0, Math.PI * 2); l.fill();
    l.globalCompositeOperation = 'destination-out';
    for (const [x, y, r] of [[128, 62, 18], [128, 246, 16], [236, 132, 34]]) { l.beginPath(); l.arc(x, y, r, 0, Math.PI * 2); l.fill(); }
    logo.tex.needsUpdate = true;
    const apple = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.046),
      new THREE.MeshStandardMaterial({ color: '#f1f2f4', metalness: 1, roughness: 0.08, alphaMap: logo.tex, alphaTest: 0.5, emissive: '#ffffff',
      emissiveIntensity: 0.06 }));
    apple.rotation.y = Math.PI; apple.position.set(0, LH / 2 + 0.006, -LT - 0.0002); pivot.add(apple);
    // The screen's light on the keys and on you.
    const light = new THREE.PointLight('#d6e4ff', 0, 0.9, 2);
    light.position.set(0, LH * 0.5, 0.16); pivot.add(light);
    g.traverse((o) => { if (o.isMesh) Object.assign(o.userData, { action: 'laptop', reach: 3.2 }); });
    // Rest on the table edge nearest `st`, facing it.
    const poseFor = (st) => ({ x: 16.7 - Math.sin(st.rotY) * 0.09, z: 13.96, r: st.rotY + Math.PI });
    const L = { g, pivot, lid, light, deckM, W, LH, seats: nookSeats, seat: nookSeats[0], open: false, shown: false, k: 0, poseFor };
    const p0 = poseFor(L.seat);
    g.position.set(p0.x, 0.4, p0.z); g.rotation.y = p0.r; pivot.rotation.x = Math.PI / 2;
    return L;
  }

  pendant(9.3, 9, { light: 14, shade: '#2f463b' }); pendant(10.7, 9, { shade: '#2f463b' });
  floorLamp(18.55, 14.3, 10);
  plant(14.7, 14.4, 0.9);
  Object.assign(ctx, { laptop });
}

export function installVending(ctx) {
  const { bins, art, rug, sofa, world, floorLamp, metalM } = ctx;
  // Lounge, by the brick wall: a vending machine with a lit front, recycling bins, some art.
  {
    const x = 7.1, z = 14.42;
    world.add(mergedBoxes([[0.95, 1.85, 0.8, x, 0.925, z, '#1f2a33'], [0.6, 0.12, 0.04, x - 0.12, 0.3, z - 0.41, '#0d1114'],
      [0.2, 0.5, 0.03, x + 0.33, 1.1, z - 0.41, '#2a3540']], metalM));
    const v = makeScreen(world, 0.56, 1.2, 280, 600, x - 0.12, 1.15, z - 0.415), c = v.ctx;
    v.mesh.rotation.y = Math.PI;
    c.fillStyle = '#0e1a22'; c.fillRect(0, 0, 280, 600);
    const DR = ['#e0245e', '#7ed321', '#1f6fd1', '#ffb000', '#f4f1ea', '#d97757'], R = rng(77);
    for (let r = 0; r < 6; r++) {
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(10, 92 + r * 96, 260, 4);
      for (let k = 0; k < 5; k++) { c.fillStyle = DR[Math.floor(R() * DR.length)]; c.fillRect(18 + k * 52, 30 + r * 96, 36, 60);
        c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(22 + k * 52, 34 + r * 96, 6, 52); }
    }
    v.tex.needsUpdate = true;
    solid(x, z, 0.95, 0.8);
  }
  bins(8.0, 14.6);
  art(14.4, 1.85, 14.82, Math.PI, 1.2, 0.9);
  art(-12.65, 1.95, -14.84, 0, 1.5, 1.0);
  // A reading nook between the pillar and the lounge: two armchairs, a side table, a standing lamp (glow only, no light).
  rug(4.5, 7.4, 3.6, 5.7, '#3f4a6b', '#d9a441');
  sofa(5.0, 4.6, Math.PI / 2, 1.05, '#6b8e4e');
  sofa(6.9, 4.6, -Math.PI / 2, 1.05, '#b5654a');
  cyl(world, 0.24, 0.24, 0.03, '#8a6a4a', 5.95, 0.5, 4.6, { seg: 24 }); cyl(world, 0.03, 0.03, 0.5, '#2f3236', 5.95, 0.25, 4.6); solid(5.95, 4.6, 0.5, 0.5);
  cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', 5.88, 0.565, 4.55);
  floorLamp(5.95, 5.55, 0);
}
