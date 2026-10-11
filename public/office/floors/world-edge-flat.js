// The flat off the corridor behind the sky (world-edge-backstage.js): cramped and dark, tired wallpaper, a brown carpet.
// Two figures on a sagging sofa, faceless and still, watching a TV: it shows your office live (its own security camera,
// in colour), until you stand in their doorway, when it shows you, standing in their doorway, from beside the set. They
// don't turn round. The TV's glow on the room, a laugh track (world-edge-sound.js), a takeaway on the table. Their front
// door's one of the corridor's (world-edge-backstage.js's DOORS, 'flat'), dressed here: chipped paint over panels, a
// number, a spyhole, a letterbox, a worn handle, a mat; shut, the TV's light flickers under it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FONT, makeCanvas, ME_LAYER, mergedBoxes } from '../util.js';

const TW = 320, TH = 180;

export function installFlat(ctx, bs, PLAN, door) {
  const root = bs.root, { FLAT } = PLAN, R = Math.random, hits = [], cols = [];
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  const info = (h, k) => ({ action: 'backstage', reach: 4, info: `<b>${h}</b>${k ? `<div class="k">${k}</div>` : ''}` });
  const cx = FLAT.door - 0.2, tvZ = FLAT.z0 + 0.35, sofaZ = FLAT.z0 + 2.5, tz = tvZ + 1.3;   // (the coffee table between them)

  // ----- the sofa (facing the TV, its back to the door), a coffee table, a lamp, a sideboard, closed blinds -----
  const sofa = [], fab = '#5d4a3c', fab2 = '#4c3c30';
  sofa.push([1.88, 0.42, 0.85, cx, 0.21, sofaZ, fab2],   // (the seat between the arms)
    [2.1, 0.5, 0.22, cx, 0.62, sofaZ + 0.34, fab], [0.22, 0.6, 0.85, cx - 1.05, 0.3, sofaZ, fab], [0.22, 0.6, 0.85, cx + 1.05, 0.3, sofaZ, fab]);
  sofa.push([0.95, 0.14, 0.62, cx - 0.48, 0.47, sofaZ - 0.06, '#66523f'], [0.95, 0.12, 0.62, cx + 0.48, 0.46, sofaZ - 0.06, '#614e3d']);   // cushions, one sunk
  sofa.push([1.1, 0.04, 0.6, cx, 0.42, tz, '#4a3523'], ...[[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].map(([x, z]) => [0.04, 0.4, 0.04, cx + x, 0.2, tz + z, '#3a2a1c']));
  sofa.push([1.6, 0.55, 0.42, cx, 0.275, tvZ + 0.05, '#3b2c20']);   // the sideboard the TV's on
  sofa.push([1.3, 0.8, 0.4, FLAT.x0 + 0.25, 0.4, FLAT.z0 + 3.4, '#4a3a2c'], [1.3, 0.04, 0.4, FLAT.x0 + 0.25, 1.1, FLAT.z0 + 3.4, '#4a3a2c']);   // a shelf, by the west wall (turned)
  const furn = mergedBoxes(sofa, M({ vertexColors: true }));
  root.add(furn);
  cols.push({ minX: cx - 1.16, maxX: cx + 1.16, minZ: sofaZ - 0.45, maxZ: sofaZ + 0.46 }, { minX: cx - 0.58, maxX: cx + 0.58, minZ: tz - 0.32, maxZ: tz + 0.32 },
    { minX: cx - 0.82, maxX: cx + 0.82, minZ: FLAT.z0, maxZ: tvZ + 0.3 }, { minX: FLAT.x0, maxX: FLAT.x0 + 0.5, minZ: FLAT.z0 + 2.7, maxZ: FLAT.z0 + 4.1 });
  hits.push(ctx.hitBox(root, 2.3, 0.9, 0.9, cx, 0.45, sofaZ, info('A sofa', 'Sagging in the middle. They’ve been sitting there a long time.')));
  // a window with its blind down, the street's light leaking round it
  const blind = makeCanvas(128, 128), bc = blind.ctx;
  bc.fillStyle = '#2a2621'; bc.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 8) { bc.fillStyle = 'rgba(255,220,170,.06)'; bc.fillRect(0, y, 128, 2); }
  blind.tex.needsUpdate = true;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), M({ map: blind.tex, emissive: '#ffcc88', emissiveIntensity: 0.02 }));
  win.position.set(FLAT.x0 + 0.002, 1.45, FLAT.z0 + 1.4); win.rotation.y = Math.PI / 2; root.add(win);
  // the lamp: a tall shade in the corner, on low
  const lampM = M({ color: '#d9c49a', emissive: '#ffb860', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 16, 1, true), lampM); shade.position.set(FLAT.x1 - 0.4, 1.45, FLAT.z0 + 0.45); root.add(shade);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 6), M({ color: '#2b2b2b' })); pole.position.set(FLAT.x1 - 0.4, 0.68, FLAT.z0 + 0.45); root.add(pole);
  const lampL = new THREE.PointLight('#ffb070', 0.9, 5, 1.8); lampL.position.set(FLAT.x1 - 0.4, 1.4, FLAT.z0 + 0.5); root.add(lampL);

  // ----- the takeaway: cartons, a foil tray, cans -----
  const tk = [];
  tk.push([0.12, 0.1, 0.1, cx - 0.25, 0.49, tz + 0.05, '#efe9dc'], [0.12, 0.1, 0.1, cx - 0.08, 0.49, tz - 0.12, '#efe9dc'], [0.22, 0.035, 0.15, cx + 0.2, 0.457, tz + 0.08, '#bfc3c7'],
    [0.2, 0.012, 0.16, cx + 0.22, 0.446, tz - 0.14, '#d8d2c0']);
  root.add(mergedBoxes(tk, M({ vertexColors: true, roughness: 0.5 })));
  const can = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14);
  const cans = new THREE.Mesh(mergeGeometries([can.clone().translate(cx + 0.42, 0.5, tz + 0.12), can.clone().rotateZ(Math.PI / 2).translate(cx + 0.38, 0.473, tz - 0.05)]), M({ color: '#9a1d1d', metalness: 0.7, roughness: 0.3 }));
  root.add(cans);
  const lid = makeCanvas(64, 64); lid.ctx.fillStyle = '#efe9dc'; lid.ctx.fillRect(0, 0, 64, 64); lid.ctx.fillStyle = '#b8261d'; lid.ctx.font = `700 22px ${FONT}`; lid.ctx.fillText('☺', 20, 40); lid.tex.needsUpdate = true;
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lid.tex })); tag.position.set(cx - 0.25, 0.543, tz + 0.05); root.add(tag);
  hits.push(ctx.hitBox(root, 1.1, 0.3, 0.6, cx, 0.5, tz, info('A takeaway', 'Half eaten. Cold. Two forks.')));

  // ----- the two of them: smooth, faceless, sitting, never moving much -----
  const torso = new THREE.LatheGeometry([[0, 0.0], [0.15, 0.02], [0.17, 0.2], [0.19, 0.38], [0.12, 0.48], [0.05, 0.52], [0.045, 0.57], [0, 0.58]].map(([x, y]) => new THREE.Vector2(x, y)), 16).scale(1, 1, 0.7);
  const head = new THREE.SphereGeometry(0.105, 16, 12).scale(0.9, 1.2, 1).translate(0, 0.69, 0);
  const thigh = new THREE.CapsuleGeometry(0.07, 0.36, 4, 8).rotateX(Math.PI / 2).translate(0, 0, -0.22);
  const shin = new THREE.CapsuleGeometry(0.06, 0.36, 4, 8).translate(0, -0.22, -0.42);
  const arm = new THREE.CapsuleGeometry(0.048, 0.48, 4, 8).rotateX(0.5).translate(0, 0.3, -0.12);
  const skin = M({ color: '#c9c2b4', roughness: 0.75 });
  const people = [];
  for (const [dx, lean, tilt] of [[-0.5, 0.06, 0.05], [0.52, -0.04, -0.08]]) {
    const parts = [torso.clone(), head.clone(), ...[-0.1, 0.1].map((s) => thigh.clone().translate(s, 0, 0)), ...[-0.1, 0.1].map((s) => shin.clone().translate(s, 0, 0)),
      ...[-0.2, 0.2].map((s) => arm.clone().translate(s, 0, 0))].map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of parts) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const p = new THREE.Mesh(mergeGeometries(parts), skin);
    p.position.set(cx + dx, 0.46, sofaZ + 0.05); p.rotation.set(0.12, tilt, lean); root.add(p);   // facing the TV (-z), leant back a little
    people.push(p);
    hits.push(ctx.hitBox(root, 0.6, 1.3, 0.7, cx + dx, 0.75, sofaZ, info('Someone watching', 'They don’t look round.')));
  }

  // ----- the TV: on the sideboard, a camera hidden beside it looking back at the door -----
  const tvG = new THREE.Group(); tvG.position.set(cx, 0.55, tvZ + 0.1); root.add(tvG);
  tvG.add(mergedBoxes([[1.32, 0.8, 0.08, 0, 0.46, 0, '#0b0b0c'], [0.36, 0.04, 0.22, 0, 0.02, 0, '#141414'], [0.06, 0.08, 0.04, 0, 0.06, 0, '#141414']], M({ vertexColors: true, roughness: 0.4 })));
  const rt = new THREE.WebGLRenderTarget(TW, TH, { depthBuffer: false });
  const tvM = new THREE.ShaderMaterial({
    uniforms: { map: { value: rt.texture }, k: { value: 1.6 }, on: { value: 0 }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float k, on, t; varying vec2 vUv;
      void main() {
        vec3 c = pow(texture2D(map, vUv).rgb, vec3(2.2)) * on;
        c *= 0.94 + 0.06 * sin(vUv.y * 420.0 + t * 30.0);
        gl_FragColor = vec4(c * k * (0.97 + 0.03 * sin(t * 50.0)), 1.0);
      }`,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.7), tvM); screen.position.set(0, 0.47, 0.042); tvG.add(screen);
  hits.push(Object.assign(screen, { userData: info('Their TV', 'Live.') }));
  const glow = new THREE.PointLight('#a8c4ff', 1.6, 6, 1.6); glow.position.set(cx, 1.0, tvZ + 0.6); root.add(glow);
  const eye = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 30);
  eye.position.set(cx + 0.1, 1.62, tvZ + 0.15); eye.lookAt(PLAN.FLAT.door, 1.2, FLAT.z1);   // (over the set)
  eye.layers.enable(1); eye.layers.enable(ME_LAYER); root.add(eye);
  const self = { F: bs, eye, n: 0 }, office = () => ctx.cctv?.cams.find((c) => c.id === 'my-office');

  // ----- their front door: tired paint over four panels, chipped to the undercoat; brass gone dull; a mat outside -----
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };   // its own stream (the harness's draws stay put)
  const L = door.leaves[0], lw = L.lw, lh = (door.h ?? 2.1) - 0.02, PX = 400;
  const chips = Array.from({ length: 70 }, () => {   // round the lock, along the edges, low down, on the mouldings
    const r = rng(), x = r < 0.3 ? lw - 0.03 - rng() * 0.22 : r < 0.5 ? rng() * lw : r < 0.65 ? (rng() < 0.5 ? 0.02 : lw - 0.02) + (rng() - 0.5) * 0.04 : 0.1 + rng() * (lw - 0.2);
    const y = r < 0.3 ? 0.8 + rng() * 0.5 : r < 0.5 ? rng() * 0.3 : rng() * lh;
    return { x, y, s: 0.003 + rng() ** 3 * 0.022, a: rng() * 6.3, n: 5 + Math.floor(rng() * 4), deep: rng() < 0.3, j: Array.from({ length: 8 }, () => 0.55 + rng() * 0.45) };
  });
  const leafTex = (front, bump) => {
    const c = makeCanvas(Math.round(lw * PX), Math.round(lh * PX)), g = c.ctx, W = c.W, H = c.H, X = (x) => (front ? x : lw - x) * PX, Y = (y) => H - y * PX;
    const paint = bump ? '#909090' : front ? '#3d5753' : '#cfc6ad', rec = bump ? '#5a5a5a' : front ? '#36504c' : '#c4bba2';
    g.fillStyle = paint; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 300 && !bump; i++) { g.fillStyle = `rgba(${front ? '20,30,28' : '90,80,60'},${0.03 + rng() * 0.04})`; g.fillRect(rng() * W, rng() * H, 1 + rng() * 3, 4 + rng() * 40); }   // brush marks, years of them
    for (const [x0, x1, y0, y1] of [[0.12, lw / 2 - 0.05, 1.12, lh - 0.13], [lw / 2 + 0.05, lw - 0.12, 1.12, lh - 0.13], [0.12, lw / 2 - 0.05, 0.24, 0.9], [lw / 2 + 0.05, lw - 0.12, 0.24, 0.9]]) {
      const a = Math.min(X(x0), X(x1)), b = Math.max(X(x0), X(x1)), t = Y(y1), u = Y(y0), m = 10;
      g.fillStyle = bump ? '#b8b8b8' : 'rgba(255,255,255,.07)'; g.fillRect(a - 4, t - 4, b - a + 8, u - t + 8);   // the moulding's lip
      g.fillStyle = bump ? '#383838' : 'rgba(0,0,0,.35)'; g.fillRect(a, t, b - a, u - t);
      g.fillStyle = rec; g.fillRect(a + m, t + m, b - a - 2 * m, u - t - 2 * m);   // the panel, sunk
      if (!bump) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(a + m, t + m, b - a - 2 * m, 3); g.fillRect(a + m, t + m, 3, u - t - 2 * m); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(a + m, u - m - 2, b - a - 2 * m, 2); }
    }
    if (!bump) {   // grime: a kicked bottom rail, hands round the lock
      let gr = g.createLinearGradient(0, H, 0, H - 0.4 * PX); gr.addColorStop(0, 'rgba(25,20,12,.55)'); gr.addColorStop(1, 'rgba(25,20,12,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      gr = g.createRadialGradient(X(lw - 0.1), Y(1.05), 2, X(lw - 0.1), Y(1.05), 0.28 * PX); gr.addColorStop(0, 'rgba(30,24,14,.4)'); gr.addColorStop(1, 'rgba(30,24,14,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    for (const k of chips) {
      if (!front && k.s > 0.012) continue;   // the inside's had it easier
      const pts = k.j.map((j, i) => [X(k.x) + Math.cos(k.a + i * 0.785) * k.s * PX * j, Y(k.y) + Math.sin(k.a + i * 0.785) * k.s * PX * j * 0.7]);
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = bump ? '#707070' : front ? (k.deep ? '#5e3027' : '#8f8b7c') : '#e0d9c6'; g.fill();   // the old red under the green, the undercoat
      if (k.deep && k.s > 0.01) { g.save(); g.translate(X(k.x), Y(k.y)); g.scale(0.45, 0.45); g.translate(-X(k.x), -Y(k.y)); g.fillStyle = bump ? '#606060' : '#8a6a46'; g.fill(); g.restore(); }   // bare wood
    }
    for (let i = 0; i < 14 && front; i++) { const x = X(lw - 0.05 - rng() * 0.2), y = Y(0.9 + rng() * 0.35); g.strokeStyle = bump ? '#7a7a7a' : 'rgba(215,205,185,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 12); g.stroke(); }   // key scratches
    if (bump) c.tex.colorSpace = THREE.NoColorSpace;
    c.tex.needsUpdate = true; return c.tex;
  };
  const edgeM = M({ color: '#4a5553', roughness: 0.8 });
  L.leaf.material = [edgeM, edgeM, edgeM, edgeM, ...[true, false].map((f) => M({ map: leafTex(f), bumpMap: leafTex(f, true), bumpScale: 2.5, roughness: f ? 0.62 : 0.7 }))];
  const brass = [], dark = [], bx = (list, w, h, d, x, y, z) => list.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const cy = (list, r, d, x, y, z, n = 16) => list.push(new THREE.CylinderGeometry(r, r, d, n).rotateX(Math.PI / 2).translate(x, y, z));
  const ft = 0.025, hx = lw - 0.075, mid = lw / 2;
  for (const sz of [1, -1]) {   // the lever on its rose, both sides; the keyhole under it
    cy(brass, 0.028, 0.01, hx, 1.0, sz * (ft + 0.005)); cy(brass, 0.009, 0.035, hx, 1.0, sz * (ft + 0.02), 8);
    bx(brass, 0.12, 0.018, 0.018, hx - 0.06, 1.0, sz * (ft + 0.038));
    bx(brass, 0.028, 0.06, 0.005, hx, 0.91, sz * (ft + 0.0025)); bx(dark, 0.008, 0.026, 0.002, hx, 0.905, sz * (ft + 0.0055));
  }
  bx(brass, 0.3, 0.075, 0.006, mid, 1.0, ft + 0.003); bx(brass, 0.26, 0.04, 0.004, mid, 0.995, ft + 0.007); bx(dark, 0.262, 0.004, 0.003, mid, 1.016, ft + 0.009);   // the letterbox, its flap
  bx(dark, 0.28, 0.06, 0.02, mid, 1.0, -ft - 0.01);   // and its brush, inside
  cy(brass, 0.014, 0.012, mid, 1.5, ft + 0.006); cy(dark, 0.007, 0.004, mid, 1.5, ft + 0.013, 10); cy(brass, 0.016, 0.014, mid, 1.5, -ft - 0.007);   // the spyhole
  cy(brass, 0.019, 0.012, hx, 1.42, ft + 0.006); bx(dark, 0.003, 0.012, 0.003, hx, 1.42, ft + 0.0125);   // a Yale outside, its rim lock inside
  bx(dark, 0.1, 0.08, 0.035, hx - 0.02, 1.42, -ft - 0.0175); cy(brass, 0.014, 0.02, hx - 0.03, 1.42, -ft - 0.045, 10);
  bx(brass, 0.11, 0.022, 0.008, hx - 0.03, 1.58, -ft - 0.004); for (let i = 0; i < 7; i++) bx(brass, 0.012, 0.022, 0.006, hx + 0.03 - i * 0.006, 1.57 - i * 0.022 + (i > 3 ? (i - 3) * 0.008 : 0), -ft - 0.012);   // the chain, hanging
  const cent = (g) => (g.index ? g.toNonIndexed() : g);
  L.body.add(new THREE.Mesh(mergeGeometries(brass.map(cent)), M({ color: '#9a7c46', metalness: 0.85, roughness: 0.42 })), new THREE.Mesh(mergeGeometries(dark.map(cent)), M({ color: '#141210', roughness: 0.6 })));
  const num = makeCanvas(96, 128); num.ctx.fillStyle = '#fff'; num.ctx.font = `600 120px Georgia, serif`; num.ctx.textAlign = 'center'; num.ctx.textBaseline = 'middle'; num.ctx.fillText('7', 48, 70); num.tex.needsUpdate = true;
  const n7 = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.1), M({ color: '#b08f52', metalness: 0.8, roughness: 0.38, alphaMap: num.tex, transparent: true, alphaTest: 0.4 }));
  n7.position.set(mid, 1.74, ft + 0.004); L.body.add(n7);
  // the mat, coir, WELCOME mostly gone
  const mat = makeCanvas(256, 160), mc = mat.ctx;
  mc.fillStyle = '#6e5230'; mc.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 2600; i++) { const v = rng(); mc.fillStyle = `rgba(${v < 0.5 ? '40,28,14' : '150,118,72'},${0.25 + rng() * 0.35})`; mc.fillRect(rng() * 256, rng() * 160, 1, 1 + rng() * 2); }
  mc.strokeStyle = 'rgba(30,20,10,.75)'; mc.lineWidth = 10; mc.strokeRect(5, 5, 246, 150);
  mc.fillStyle = 'rgba(30,20,10,.55)'; mc.font = `800 40px ${FONT}`; mc.textAlign = 'center'; mc.textBaseline = 'middle'; mc.fillText('WELCOME', 128, 82);
  for (let i = 0; i < 40; i++) { mc.fillStyle = `rgba(110,82,48,${0.4 + rng() * 0.5})`; mc.beginPath(); mc.ellipse(70 + rng() * 120, 70 + rng() * 26, 4 + rng() * 14, 3 + rng() * 6, rng() * 3, 0, 7); mc.fill(); }   // worn through where feet go
  mat.tex.needsUpdate = true;
  const DZ = door.z + PLAN.T / 2, LZ = door.z - door.face2 + 0.05;   // the corridor's face of the wall; the leaf's, shut (hung on the flat's side)
  const matM = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.014, 0.48), M({ map: mat.tex, roughness: 1 })); matM.position.set(door.x + 0.03, 0.007, DZ + 0.3); matM.rotation.y = 0.04; root.add(matM);
  hits.push(ctx.hitBox(root, 0.8, 0.05, 0.48, door.x, 0.02, DZ + 0.3, info('A doormat', 'WELCOME, nearly.')));
  // the TV's light under the door (and out through it, open): a line in the gap, a wash on the floor that flickers with it
  const wash = makeCanvas(64, 64), wg = wash.ctx.createLinearGradient(0, 0, 0, 64);
  wg.addColorStop(0, 'rgba(255,255,255,1)'); wg.addColorStop(0.35, 'rgba(255,255,255,.35)'); wg.addColorStop(1, 'rgba(255,255,255,0)');
  wash.ctx.fillStyle = wg; wash.ctx.fillRect(0, 0, 64, 64);
  const side = wash.ctx.createLinearGradient(0, 0, 64, 0); side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.18, 'rgba(0,0,0,0)'); side.addColorStop(0.82, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
  wash.ctx.globalCompositeOperation = 'destination-out'; wash.ctx.fillStyle = side; wash.ctx.fillRect(0, 0, 64, 64); wash.tex.needsUpdate = true;
  const add = (o) => new THREE.MeshBasicMaterial({ color: '#a8c4ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...o });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), add({ map: wash.tex, opacity: 0 }));
  spill.position.set(door.x, 0.016, LZ + 0.002); spill.renderOrder = 2; root.add(spill);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(door.w - 0.04, 0.012), add({ opacity: 0, color: new THREE.Color(1.4, 1.7, 2.4) })); slit.position.set(door.x, 0.006, LZ + 0.002); root.add(slit);

  // ----- each frame while you're in here or looking in -----
  let at = -1, glowK = 1;
  const v = new THREE.Vector3(), frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere();
  function fx(dt, t) {
    tvM.uniforms.t.value = t;
    glowK += (0.7 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1) + (Math.random() - 0.5) * 0.3 - glowK) * Math.min(1, dt * 6);
    glow.intensity = 1.6 * glowK * (tvM.uniforms.on.value ? 1 : 0.2);
    const ok = Math.min(1, door.k * 1.6), lit = glowK * (tvM.uniforms.on.value ? 1 : 0.35);   // the light from under the door, out of it
    spill.scale.set(door.w - 0.1 + ok * 0.6, 1, 0.38 + ok * 1.6); spill.material.opacity = lit * (0.32 + ok * 0.08);
    slit.material.opacity = Math.min(1, lit * 1.6) * (1 - ok);
    people[0].rotation.z = 0.06 + 0.01 * Math.sin(t * 0.4); people[1].rotation.z = -0.04 + 0.008 * Math.sin(t * 0.33 + 2);   // breathing, barely
    if (!bs.on || !ctx.cctv?.into) return;
    // you, in the open doorway (or in here): it shows you; anywhere else, the office; nobody sees it through the shut door
    const P = ctx.player; v.set(P.x, 0, P.z); root.worldToLocal(v);
    const inside = v.x > FLAT.x0 && v.x < FLAT.x1 && v.z > FLAT.z0 && v.z < FLAT.z1;
    if (!inside && door.k < 0.02) return;
    const inDoor = inside || (door.k > 0.3 && Math.abs(v.x - FLAT.door) < 1.2 && v.z < FLAT.z1 + 1.0);
    const near = Math.hypot(v.x - FLAT.door, v.z - FLAT.z1) < 7;
    if (!near || t - at < (inDoor ? 1 / 10 : 1 / 4)) return;
    const cam0 = ctx.camera;   // and only with the set in view
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(cam0.projectionMatrix, cam0.matrixWorldInverse));
    if (!frustum.intersectsSphere(sphere.set(screen.getWorldPosition(v), 0.8))) return;
    const cam = inDoor ? self : office();
    if (!cam) return;
    at = t;
    ctx.cctv.into(cam, rt, t, 1);
    tvM.uniforms.on.value = 1;
  }
  return { fx, hits, cols, tv: { rt, screen, self }, people };
}
