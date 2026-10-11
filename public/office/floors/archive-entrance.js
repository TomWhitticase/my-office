// THE ARCHIVE's entrance hall (B2): the lift opens into an old records office, at odds with the white void beyond it.
// Dark wood panelling and brass, a wall of card-catalogue drawers, a reception counter with a desk bell, a visitors' book
// and a green banker's lamp, pneumatic tubes along the ceiling with the odd capsule whooshing through, a softly
// flickering THE ARCHIVE sign, and at the far end a round bank-vault door. Walk up to it (or click its wheel): the wheel
// spins, the bolts draw back and it swings open on the white void and the filing cabinet (floors/archive.js), the light
// pouring into the room. It shuts behind you once you've been through and come back into the room.
// Out in the void the space doesn't add up: the doorway stands on its own, you can walk all the way round it, and behind it
// there's only more void (no hall, no lift). Only through the open doorway from the front do you see the hall, drawn into a
// render target with the hall's own light and shown on a disc across the bore (portalFx); walk back through and you're in
// it again. `side` is which you're in: 'hall' (the hall's geometry, colliders and lift are there) or 'void' (they're not).
// Built about the car at z = 0 in `arch.room`, moved onto your car's z when you arrive (arch.enter). The room has its own
// warm, dim look: the floor's look (arch.look) is blended from the room's to the void's across the vault's doorway (see
// hallFx). The car itself is still lit like the office's (renderFloor), so the lift looks the same on every floor.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { escapeHtml } from '../../chat.js';
import { addPane } from '../systems/portal.js';
import { damp, dash, ease, LIFT, makeCanvas, mat, mergedBoxes, rng, ROOM, sstep } from '../util.js';

// The hall inside: x from the vault's wall (X0) to the lift's (X1), z ±HW about the car, H high. Walls T thick, the
// vault's wall VT. The vault's round opening: centre height y, radius r; `gap` either side of the car's z is walkable.
const X0 = 7, X1 = LIFT.x, HW = 3.6, H = 4.2, T = 0.3, VT = 0.6, XE = LIFT.x + 2.4;
const VAULT = { y: 1.61, r: 1.4, ring: 1.85, gap: 0.72, swing: 1.92, near: 2.4, sill: 0.2 };
const HINGE = { x: X0 + 0.42, z: VAULT.r + 0.32 };   // the door swings into the hall on this, to the +z side
const SERIF = 'Georgia, "Times New Roman", serif';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three gives every object a uuid from Math.random: build with a seeded one, so the hall doesn't shift the draws made
  // after it (see helicopter.js).
  const random = Math.random;
  Math.random = rng(2202);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { arch, files, hitBox, CAR, camera } = ctx;
  const S = arch.scene, hall = arch.room = new THREE.Group();
  // `inside`: the hall itself, there only on the hall's side (the door, its hinge and the camera too: the door swings into
  // the hall); `portal`: the doorway's bare frame and sill, there on both. The hall's lights hang from `hall`, always there, dark out in the void (see blendLook).
  const inside = new THREE.Group(), portal = new THREE.Group();
  hall.add(inside, portal); S.add(hall);
  const R = rng(202);
  // Inside the hall nothing is fogged: the void's white haze starts 8 m out and would grey the dark wood.
  const M = (color, o = {}) => mat(color, { fog: false, ...o });
  const vc = (o = {}) => M('#ffffff', { vertexColors: true, roughness: 0.6, ...o });
  const brassM = M('#c9a25a', { metalness: 1, roughness: 0.3 }), steelM = M('#8f959b', { metalness: 0.9, roughness: 0.38 });
  const add = (o, parent = inside) => { parent.add(o); return o; };
  const mesh = (geo, m, x = 0, y = 0, z = 0, parent = inside) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const tex = (w, h, draw, wrap = false) => {
    const t = makeCanvas(w, h); draw(t.ctx, w, h);
    if (wrap) t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
    t.tex.needsUpdate = true; return t;
  };
  // A plane w x h whose texture repeats every tw x th metres.
  const tiled = (w, h, tw, th) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tw, uv.getY(i) * h / th);
    return g;
  };

  // ----- textures -----
  const grain = tex(256, 256, (c) => {   // pale wood grain, tinted by each box's vertex colour
    c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 110; i++) {
      c.strokeStyle = `rgba(${R() < 0.45 ? '255,255,255' : '0,0,0'},${0.04 + R() * 0.09})`; c.lineWidth = 0.5 + R() * 2.5;
      const y = R() * 256; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(85, y + (R() - 0.5) * 18, 170, y + (R() - 0.5) * 18, 256, y + (R() - 0.5) * 6); c.stroke();
    }
  }, true).tex;
  const woodM = new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.48, fog: false });
  const marble = tex(512, 512, (c) => {   // black and cream marble squares, veined
    for (let i = 0; i < 4; i++) {
      const x = (i % 2) * 256, y = (i >> 1) * 256, dark = (i % 2) ^ (i >> 1);
      c.save(); c.beginPath(); c.rect(x, y, 256, 256); c.clip();
      c.fillStyle = dark ? '#191715' : '#d6ccb6'; c.fillRect(x, y, 256, 256);
      for (let v = 0; v < 7; v++) {
        c.strokeStyle = dark ? `rgba(200,190,170,${0.05 + R() * 0.12})` : `rgba(90,80,64,${0.06 + R() * 0.14})`; c.lineWidth = 0.6 + R() * 1.8;
        let px = x + R() * 256, py = y + R() * 256; c.beginPath(); c.moveTo(px, py);
        for (let s = 0; s < 6; s++) { px += (R() - 0.3) * 70; py += (R() - 0.5) * 60; c.lineTo(px, py); }
        c.stroke();
      }
      c.restore();
      c.strokeStyle = 'rgba(10,8,6,.55)'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, 254, 254);
    }
  }, true).tex;
  const paper = tex(128, 256, (c) => {   // deep green damask above the panelling
    c.fillStyle = '#1d3429'; c.fillRect(0, 0, 128, 256);
    c.fillStyle = 'rgba(160,190,150,.07)';
    for (const [x, y] of [[64, 64], [0, 192], [128, 192]]) {
      c.beginPath(); c.ellipse(x, y, 22, 44, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(x, y - 62); c.lineTo(x + 30, y); c.lineTo(x, y + 62); c.lineTo(x - 30, y); c.closePath(); c.fill();
    }
    c.strokeStyle = 'rgba(200,170,100,.06)'; c.lineWidth = 2; for (const x of [0, 128]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke(); }
  }, true).tex;
  const paperM = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.85, fog: false });

  // ----- floor, ceiling, walls -----
  {
    const L = X1 - X0, cx = (X0 + X1) / 2;
    // Over the void's own floor (y = 0), held off it in depth too: on a coarse depth buffer a few mm isn't enough.
    const lift = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
    const fl = mesh(tiled(L, HW * 2, 1.2, 1.2), new THREE.MeshStandardMaterial({ map: marble, roughness: 0.2, fog: false, ...lift }), cx, 0.012, 0);
    fl.rotation.x = -Math.PI / 2;
    // A long runner from the lift to the vault: oxblood, a gold border and a lozenge down the middle.
    const rug = tex(1024, 160, (c, W, h) => {
      c.fillStyle = '#4e1418'; c.fillRect(0, 0, W, h);
      c.strokeStyle = '#a9853f'; c.lineWidth = 6; c.strokeRect(10, 10, W - 20, h - 20); c.lineWidth = 2; c.strokeRect(24, 24, W - 48, h - 48);
      c.fillStyle = 'rgba(169,133,63,.5)';
      for (let x = 60; x < W - 40; x += 64) { c.beginPath(); c.moveTo(x, h / 2 - 26); c.lineTo(x + 18, h / 2); c.lineTo(x, h / 2 + 26); c.lineTo(x - 18, h / 2); c.closePath(); c.fill(); }
      for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.12})`; c.fillRect(R() * W, R() * h, 2, 2); }
    });
    const runner = mesh(new THREE.PlaneGeometry(L - 1.2, 1.5), new THREE.MeshStandardMaterial({ map: rug.tex, roughness: 0.95, fog: false, polygonOffset: true,
      polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), cx + 0.15, 0.022, 0);
    runner.rotation.x = -Math.PI / 2;
    // A dark coffered ceiling: the boards, beams across every 2.2 m and two along.
    const ceil = mesh(new THREE.PlaneGeometry(L, HW * 2), M('#1c120b', { roughness: 0.7 }), cx, H - 0.01, 0);   // under the shell's roof
    ceil.rotation.x = Math.PI / 2;
    const beams = [];
    // (their tops just under the ceiling and each run's a little lower than what it crosses; the long ones short of the walls)
    for (let x = X0 + 2.2; x < X1 - 0.5; x += 2.2) beams.push([0.24, 0.244, HW * 2 - 0.01, x, H - 0.016 - 0.122, 0, '#2c1a0e']);
    for (const z of [-1.2, 1.2]) beams.push([L - 0.01, 0.18, 0.2, cx, H - 0.02 - 0.09, z, '#2c1a0e']);
    add(mergedBoxes(beams, woodM));
    // The wallpaper: the long walls, the lift's wall round the shaft, and the vault's wall round the door's frame.
    const sw = CAR.w / 2 + 0.3, P = [];
    const wall = (w, h, x, y, z, ry) => P.push(tiled(w, h, 0.6, 1.2).rotateY(ry).translate(x, y, z));
    wall(L, H, cx, H / 2, -HW + 0.002, 0); wall(L, H, cx, H / 2, HW - 0.002, Math.PI);
    wall(HW - sw, H, X1 - 0.002, H / 2, -(HW + sw) / 2, -Math.PI / 2); wall(HW - sw, H, X1 - 0.002, H / 2, (HW + sw) / 2, -Math.PI / 2);
    wall(sw * 2, H - ROOM.h, X1 - 0.002, (H + ROOM.h) / 2, 0, -Math.PI / 2);
    const vs = new THREE.Shape().moveTo(-HW, 0).lineTo(HW, 0).lineTo(HW, H).lineTo(-HW, H).closePath();
    vs.holes.push(new THREE.Path().absarc(0, VAULT.y, VAULT.ring - 0.02, 0, Math.PI * 2, true));
    const vg = new THREE.ShapeGeometry(vs, 48), pos = vg.attributes.position, uv = vg.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 0.6, pos.getY(i) / 1.2);
    P.push(vg.rotateY(Math.PI / 2).translate(X0 + 0.002, 0, 0));
    add(new THREE.Mesh(mergeGeometries(P), paperM));

    // Panelling to the dado on every wall, a brass picture rail, a cornice at the top. `run` gives a wall's box at
    // (a: along it, w: its length, h, d: out from the wall, y).
    const wood = [], brass = [];
    // `b`: how far behind the wall's face its back is, a different depth for each piece that overlaps another (behind the
    // wallpaper, in front of the shell), so no two backs share a plane.
    const N = (a, w, h, d, y, c, b = 0) => [w, h, d + b, a, y, -HW + (d - b) / 2, c], So = (a, w, h, d, y, c, b = 0) => [w, h, d + b, a, y, HW - (d - b) / 2, c];
    const E = (a, w, h, d, y, c, b = 0) => [d + b, h, w, X1 - (d - b) / 2, y, a, c], Wv = (a, w, h, d, y, c, b = 0) => [d + b, h, w, X0 + (d - b) / 2, y, a, c];
    // t0/t1: that end meets a long wall's run in a corner, so each piece stops 2 mm short of that wall's piece (its depth);
    // otherwise each piece's end is twice as far past the end as its back is behind the wall (b), so no two ends share a plane.
    function wainscot(a0, a1, run, t0 = false, t1 = false) {
      const n = Math.max(1, Math.round((a1 - a0) / 0.9)), pw = (a1 - a0) / n;
      const along = (d, h, y, c, b = 0) => {
        const p = a0 + (t0 ? d + 0.002 : -2 * b), q = a1 - (t1 ? d + 0.002 : -2 * b);
        return run((p + q) / 2, q - p, h, d, y, c, b);
      };
      wood.push(along(0.03, 1.1, 0.55, '#3a2214'), along(0.05, 0.15, 0.075, '#1f120a', 0.004), along(0.07, 0.07, 1.12, '#5a3620', 0.008));
      for (let i = 0; i < n; i++) wood.push(run(a0 + pw * (i + 0.5), pw - 0.18, 0.72, 0.045, 0.6, '#4a2c1a', -0.004));
      brass.push(along(0.035, 0.025, 2.9, '', 0.012));
      wood.push(along(0.16, 0.184, H - 0.012 - 0.092, '#2c1a0e', 0.016));   // the cornice, its top just under the ceiling, its foot off the beams'
    }
    // (each run 5 mm short of the corner: its end inside the other wall's, not in the plane of its back)
    wainscot(X0 + 0.005, X1 - 0.005, N); wainscot(X0 + 0.005, 10.85, So); wainscot(17.55, X1 - 0.005, So);
    wainscot(-HW, -sw - 0.08, E, true); wainscot(sw + 0.08, HW, E, false, true);
    wainscot(-HW, -VAULT.ring - 0.05, Wv, true); wainscot(VAULT.ring + 0.05, HW, Wv, false, true);
    wood.push(So(14.2, 6.7 - 0.064, 0.184, 0.16, H - 0.012 - 0.092, '#2c1a0e', 0.016), So(14.2, 6.7 - 0.048, 0.025, 0.035, 2.9, '#c9a25a', 0.012));   // (up to the runs' ends, not over them)   // over the catalogue
    // A brass architrave round the lift's stone face.
    for (const s of [-1, 1]) brass.push(E(s * (sw + 0.04), 0.08, ROOM.h + 0.08, 0.054, (ROOM.h + 0.08) / 2, '', 0.02));   // (4 mm prouder than the skirting it stands on)
    brass.push(E(0, sw * 2 + 0.16 - 0.002, 0.08, 0.054, ROOM.h + 0.042, '', 0.024));   // (the head between the jambs' outer faces, 4 mm prouder)
    add(mergedBoxes(wood, woodM));
    add(mergedBoxes(brass.map((b) => b.slice(0, 6)), brassM));

    // The shell outside: a plain pale block standing in the void, the lift's shaft inside it. Fogged like the rest of the void.
    // Its inside faces stand a few cm back from the hall's own wallpaper and ceiling (o), so they never show through.
    const out = mat('#e2e0db', { roughness: 0.9 }), x0 = X0 - VT, z1 = HW + T, o = 0.04, t = T - o;
    const xs = X0 - o;   // from the vault's wall on (it's a slab of its own, below): not inside it
    add(mergedBoxes([[XE - xs, H + T, t, (xs + XE) / 2, (H + T) / 2, -z1 + t / 2], [XE - xs, H + T, t, (xs + XE) / 2, (H + T) / 2, z1 - t / 2],
      [t, H + T, z1 * 2 - t * 2, XE - t / 2, (H + T) / 2, 0], [XE - xs - t, t, z1 * 2 - t * 2, (xs + XE - t) / 2, H + T - t / 2, 0]], out));
    // The vault's wall: a slab with the round bore through it, steel inside the bore.
    const ws = new THREE.Shape().moveTo(-z1, 0).lineTo(z1, 0).lineTo(z1, H + T).lineTo(-z1, H + T).closePath();
    ws.holes.push(new THREE.Path().absarc(0, VAULT.y, VAULT.ring, 0, Math.PI * 2, true));   // the collar fills it
    const wg = new THREE.ExtrudeGeometry(ws, { depth: VT - o, bevelEnabled: false, curveSegments: 64 }).rotateY(Math.PI / 2).translate(x0, 0, 0);
    arch.vaultWall = add(new THREE.Mesh(wg, [out, M('#6f757b', { metalness: 0.85, roughness: 0.45 })]));
    // and the round steel frame on either face, studded.
    const ring = (r0, r1, d) => {
      const s = new THREE.Shape().absarc(0, 0, r1, 0, Math.PI * 2, false); s.holes.push(new THREE.Path().absarc(0, 0, r0, 0, Math.PI * 2, true));
      return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 72 }).rotateY(Math.PI / 2);
    };
    const frameG = ring(VAULT.r, VAULT.ring, 0.1);
    mesh(frameG, steelM, X0, VAULT.y, 0, portal);
    mesh(frameG, M('#a8adb2', { metalness: 0.85, roughness: 0.4 }), x0 - 0.1, VAULT.y, 0, portal);
    // The collar between them: the steel bore, and its rim, so the doorway stands whole on its own out in the void.
    mesh(new THREE.CylinderGeometry(VAULT.r, VAULT.r, VT, 72, 1, true).rotateZ(Math.PI / 2), M('#6f757b', { metalness: 0.85, roughness: 0.45, side: THREE.BackSide }),
      x0 + VT / 2, VAULT.y, 0, portal);
    mesh(new THREE.CylinderGeometry(VAULT.ring + 0.015, VAULT.ring + 0.015, VT + 0.23, 96, 1, true).rotateZ(Math.PI / 2), steelM, x0 + VT / 2, VAULT.y, 0, portal);
    const studs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), steelM, 32), m4 = new THREE.Matrix4();
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; studs.setMatrixAt(i, m4.makeTranslation(X0 + 0.115, VAULT.y + Math.sin(a) * 1.7, Math.cos(a) * 1.7)); }
    add(studs, portal);
    // A steel bridge plate over the bore's sill, and a step up to it either side.
    add(mergedBoxes([[VT + 0.3, VAULT.sill, 1.0, X0 - VT / 2 + 0.05, VAULT.sill / 2, 0, '#5d6268'], [0.25, 0.1, 1.0, X0 + 0.32, 0.05, 0, '#4a4f55'],
      [0.25, 0.1, 1.0, X0 - VT - 0.22, 0.05, 0, '#4a4f55']], M('#ffffff', { vertexColors: true, metalness: 0.8, roughness: 0.5 })), portal);
  }

  // ----- the vault door -----
  // `pivot` turns on the hinge; `slab` is the door about its centre, its axis along x (+x into the hall): a tapered plug in
  // the bore, a front plate over the frame, an engraved brass ring, the hub and a three-spoked wheel (`wheel`, turning
  // about x) that throws the bolts.
  const vault = arch.vault = { state: 'shut', k: 0, t: 0, turn: 0, out: false, want: false, box: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } };
  {
    const brushed = tex(512, 512, (c) => {   // concentric brushing for the door's faces
      c.fillStyle = '#9a9fa4'; c.fillRect(0, 0, 512, 512);
      for (let r = 2; r < 362; r += 1 + R() * 2) { c.strokeStyle = `rgba(${R() < 0.5 ? '255,255,255' : '30,34,38'},${0.04 + R() * 0.08})`; c.lineWidth = 0.6 + R();
        c.beginPath(); c.arc(256, 256, r, 0, Math.PI * 2); c.stroke(); }
    }).tex;
    const faceM = new THREE.MeshStandardMaterial({ map: brushed, metalness: 0.92, roughness: 0.32, fog: false });
    // The door is the hall's: it swings into it, and isn't there out in the void.
    const pivot = vault.pivot = add(new THREE.Group()); pivot.position.set(HINGE.x, 0, HINGE.z);
    const slab = vault.slab = add(new THREE.Group(), pivot); slab.position.set(X0 - HINGE.x, VAULT.y, -HINGE.z);
    const along = (g) => g.rotateZ(-Math.PI / 2);   // a cylinder's axis onto x, its top to +x
    const r = VAULT.r;
    vault.plug = mesh(along(new THREE.CylinderGeometry(r - 0.03, r - 0.26, 0.58, 72)), faceM, -0.29, 0, 0, slab);
    vault.plate = mesh(along(new THREE.CylinderGeometry(r + 0.16, r + 0.16, 0.16, 96)), faceM, 0.2, 0, 0, slab);
    mesh(along(new THREE.CylinderGeometry(r - 0.12, r - 0.05, 0.06, 96)), faceM, 0.31, 0, 0, slab);
    mesh(new THREE.TorusGeometry(r + 0.16, 0.022, 8, 96).rotateY(Math.PI / 2), steelM, 0.2, 0, 0, slab);
    // The engraved ring: brass, lettered round.
    const eng = tex(512, 512, (c) => {
      c.fillStyle = '#b8924f'; c.fillRect(0, 0, 512, 512);
      c.translate(256, 256); c.strokeStyle = 'rgba(60,40,15,.7)'; c.lineWidth = 3;
      for (const rr of [168, 250]) { c.beginPath(); c.arc(0, 0, rr, 0, Math.PI * 2); c.stroke(); }
      c.fillStyle = 'rgba(55,36,12,.85)'; c.font = `600 34px ${SERIF}`; c.textAlign = 'center';
      const text = '· THE ARCHIVE · ALL REPOSITORIES · KEPT IN PERPETUITY ', step = (Math.PI * 2) / text.length;
      [...text].forEach((ch, i) => { c.save(); c.rotate(i * step); c.fillText(ch, 0, -198); c.restore(); });
    });
    mesh(new THREE.RingGeometry(0.62, 0.98, 96).rotateY(Math.PI / 2), M('#ffffff', { map: eng.tex, metalness: 0.8, roughness: 0.35 }), 0.342, 0, 0, slab);
    mesh(along(new THREE.CylinderGeometry(0.22, 0.26, 0.14, 48)), steelM, 0.41, 0, 0, slab);
    mesh(new THREE.SphereGeometry(0.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), brassM, 0.47, 0, 0, slab);
    const wheel = vault.wheel = add(new THREE.Group(), slab); wheel.position.x = 0.56;
    mesh(new THREE.TorusGeometry(0.52, 0.032, 12, 72).rotateY(Math.PI / 2), brassM, 0, 0, 0, wheel);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, sp = mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.72, 12), brassM, 0, Math.sin(a) * 0.36, Math.cos(a) * 0.36, wheel);
      sp.rotation.x = -a + Math.PI / 2;
      mesh(new THREE.SphereGeometry(0.05, 16, 10), brassM, 0, Math.sin(a) * 0.74, Math.cos(a) * 0.74, wheel);
    }
    // Rivets round the plate, the bolts' ends showing round the plug's edge, and the boltwork on its back face.
    const riv = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 8, 5), steelM, 40), m4 = new THREE.Matrix4();
    const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.08, 16), M('#d9dde0', { metalness: 1, roughness: 0.18 }), 14);
    const q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; riv.setMatrixAt(i, m4.makeTranslation(0.28, Math.sin(a) * (r + 0.08), Math.cos(a) * (r + 0.08))); }
    for (let i = 0; i < 14; i++) {   // radial, just proud of the plug's edge
      const a = (i / 14) * Math.PI * 2, dir = new THREE.Vector3(0, Math.sin(a), Math.cos(a));
      bolts.setMatrixAt(i, m4.compose(new THREE.Vector3(-0.12, 0, 0).addScaledVector(dir, r - 0.06), q.setFromUnitVectors(Y, dir), one));
    }
    slab.add(riv, bolts);
    // The boltwork on the back: bars across, a brass boss.
    mesh(mergeGeometries(Array.from({ length: 7 }, (_, i) => new THREE.BoxGeometry(0.04, 0.07, (r - 0.4) * 2).rotateX((i / 7) * Math.PI))), steelM, -0.6, 0, 0, slab);
    mesh(along(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 40)), brassM, -0.6, 0, 0, slab);
    // The hinge: two knuckles on mounts fixed to the frame, the door's own between them on arms.
    const hinge = [];
    for (const y of [VAULT.y - 0.8, VAULT.y + 0.8]) hinge.push([0.42, 0.28, 0.14, (X0 + HINGE.x) / 2 + 0.1, y, HINGE.z - 0.02]);
    add(mergedBoxes(hinge, steelM));
    for (const y of [VAULT.y - 0.8, VAULT.y + 0.8]) mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 24), steelM, HINGE.x, y, HINGE.z);
    for (const y of [VAULT.y - 0.4, VAULT.y + 0.4]) {
      mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.48, 24), steelM, 0, y, 0, pivot);
      const arm = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.32), steelM, -0.14, y, -0.14, pivot);
      arm.rotation.y = 0.5;
    }
    for (const o of [vault.plate, vault.plug]) o.userData.vaultPart = true;
    vault.hit = hitBox(slab, 0.4, 1.6, 1.6, 0.56, 0, 0, { action: 'vault', reach: 3.2 });
    vault.parts = [vault.plate, vault.plug];
  }

  // ----- the card catalogue (south wall) -----
  // Four sections, A-F to S-Z like the cabinet's drawers, ten columns of eighteen small drawers each, a brass label holder
  // and pull on every one; a few left pulled out. A library ladder on a brass rail.
  const CAT = { x0: 10.9, x1: 17.55, z: HW - 0.45, y0: 0.16, rows: 18, cols: 10, dw: 0.16, dh: 0.12 };
  {
    const front = tex(96, 72, (c, W, h) => {
      c.fillStyle = '#5a3620'; c.fillRect(0, 0, W, h);
      for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.12})`; c.fillRect(0, R() * h, W, 1 + R() * 2); }
      c.strokeStyle = 'rgba(20,10,4,.6)'; c.lineWidth = 4; c.strokeRect(2, 2, W - 4, h - 4);
      c.fillStyle = '#b8924f'; c.fillRect(W / 2 - 22, 12, 44, 24);
      c.fillStyle = '#eee4cc'; c.fillRect(W / 2 - 18, 15, 36, 18);
      c.strokeStyle = 'rgba(40,40,60,.55)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(W / 2 - 13, 26); c.lineTo(W / 2 + 6 + R() * 6, 25); c.stroke();
    });
    const n = 4 * CAT.cols * CAT.rows, fronts = new THREE.InstancedMesh(new THREE.BoxGeometry(CAT.dw - 0.012, CAT.dh - 0.012, 0.025),
      new THREE.MeshStandardMaterial({ map: front.tex, roughness: 0.5, fog: false }), n);
    const pulls = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 10).rotateZ(Math.PI / 2), brassM, n);
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), out = [];
    let i = 0;
    for (let s = 0; s < 4; s++) for (let cI = 0; cI < CAT.cols; cI++) for (let rI = 0; rI < CAT.rows; rI++, i++) {
      const x = CAT.x0 + 0.05 + s * (CAT.cols * CAT.dw + 0.05) + (cI + 0.5) * CAT.dw, y = CAT.y0 + (rI + 0.5) * CAT.dh;
      const pull = R() < 0.012 ? 0.06 + R() * 0.22 : 0, z = CAT.z - 0.0125 - pull;
      fronts.setMatrixAt(i, m4.makeTranslation(x, y, z)); fronts.setColorAt(i, col.setScalar(0.82 + R() * 0.3));
      pulls.setMatrixAt(i, m4.makeTranslation(x, y - 0.03, z - 0.02));
      if (pull) out.push([CAT.dw - 0.02, CAT.dh - 0.025, pull, x, y - 0.004, CAT.z - pull / 2, '#6b4428'], [CAT.dw - 0.04, 0.02, pull - 0.01, x, y + 0.03, CAT.z - pull / 2, '#efe6d0']);
    }
    inside.add(fronts, pulls);
    // (the carcass between its end panels; the panels 2 mm over it top and bottom)
    const L = CAT.x1 - CAT.x0, cx = (CAT.x0 + CAT.x1) / 2, carcass = [[L - 0.1, CAT.rows * CAT.dh, 0.43, cx, CAT.y0 + CAT.rows * CAT.dh / 2, HW - 0.235, '#120a05'],
      [L + 0.06, 0.16, 0.47, cx, 0.08, HW - 0.235, '#1f120a'], [L + 0.1, 0.1, 0.52, cx, CAT.y0 + CAT.rows * CAT.dh + 0.07, HW - 0.26, '#3a2214'], ...out];
    for (let s = 0; s <= 4; s++) carcass.push([0.05, CAT.rows * CAT.dh + 0.004, 0.47, CAT.x0 + 0.025 + s * (CAT.cols * CAT.dw + 0.05), CAT.y0 + CAT.rows * CAT.dh / 2, HW - 0.235, '#3a2214']);
    // Box files stacked on top.
    const files = [];
    for (let k = 0; k < 9; k++) { const x = CAT.x0 + 0.3 + R() * (L - 0.6), w = 0.3 + R() * 0.12, h = 0.24 + R() * 0.12;
      if (Math.abs(x - 13.85) < 0.45) continue;   // the tube's sender
      if (files.some(([a, b]) => x + w / 2 > a && x - w / 2 < b)) continue;   // not through one already there
      files.push([x - w / 2, x + w / 2]);
      carcass.push([w, h, 0.36, x, CAT.y0 + CAT.rows * CAT.dh + 0.12 + h / 2, HW - 0.24, ['#7a6448', '#8c7556', '#5f5040', '#6d5b45'][k % 4]]); }
    add(mergedBoxes(carcass, woodM));
    const plaque = tex(512, 64, (c, W, h) => {
      c.fillStyle = '#b8924f'; c.fillRect(0, 0, W, h);
      c.fillStyle = 'rgba(50,32,10,.9)'; c.font = `600 40px ${SERIF}`; c.textAlign = 'center';
      ['A – F', 'G – L', 'M – R', 'S – Z'].forEach((t, j) => { c.fillText(t, W / 8 + j * W / 4, 46); c.strokeStyle = 'rgba(50,32,10,.6)'; c.strokeRect(j * W / 4 + 6, 5, W / 4 - 12, h - 10); });
    });
    // one plane per section, each showing its quarter of the plaque
    for (let s = 0; s < 4; s++) {
      const g = new THREE.PlaneGeometry(0.5, 0.07), uv = g.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, (s + uv.getX(j)) / 4);
      mesh(g.rotateY(Math.PI), M('#ffffff', { map: plaque.tex, metalness: 0.7, roughness: 0.35 }), CAT.x0 + 0.05 + (s + 0.5) * (CAT.cols * CAT.dw + 0.05), CAT.y0 + CAT.rows * CAT.dh + 0.07, HW - 0.523);
    }
    // The ladder, hooked on its rail, leaning out.
    add(mergedBoxes([[L, 0.03, 0.03, cx, 2.27, CAT.z - 0.06]], brassM));
    const lad = add(new THREE.Group()), top = 2.27, foot = 0.6, len = Math.hypot(top, foot);
    lad.position.set(15.35, 0, CAT.z - 0.06 - foot); lad.rotation.x = Math.atan2(foot, top);
    const rails = [];
    for (const s of [-1, 1]) rails.push([0.05, len, 0.035, s * 0.22, len / 2, 0, '#5a3620']);
    for (let y = 0.3; y < len - 0.1; y += 0.3) rails.push([0.44, 0.035, 0.05, 0, y, 0, '#4a2c1a']);
    add(mergedBoxes(rails, woodM), lad);
    for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), brassM, s * 0.22, len, 0.03, lad);
  }

  // ----- reception (north side) -----
  // A long counter, green marble on panelled walnut with a brass foot rail. On it a visitors' book, a desk bell, a green
  // banker's lamp, an inkwell and pen, a box of index cards. Behind it an empty chair, pigeonholes, and the pneumatic
  // tubes' receiving station.
  const CT = { x0: 11.3, x1: 15.6, z0: -2.75, z1: -2.05, h: 1.02 };
  const desk = {};
  {
    const L = CT.x1 - CT.x0, cx = (CT.x0 + CT.x1) / 2, cz = (CT.z0 + CT.z1) / 2;
    const body = [[L, CT.h - 0.04, CT.z1 - CT.z0 - 0.06, cx, (CT.h - 0.04) / 2, cz, '#3a2214'], [L + 0.04, 0.12, CT.z1 - CT.z0 - 0.02, cx, 0.06, cz, '#1f120a']];
    const n = 5, pw = L / n;
    for (let i = 0; i < n; i++) body.push([pw - 0.16, CT.h - 0.4, 0.04, CT.x0 + pw * (i + 0.5), CT.h / 2 + 0.02, CT.z1 - 0.02, '#4a2c1a']);
    body.push([L, 0.06, 0.04, cx, CT.h - 0.1, CT.z1 - 0.02, '#5a3620']);
    desk.body = add(mergedBoxes(body, woodM));
    add(mergedBoxes([[L + 0.08, 0.04, CT.z1 - CT.z0 + 0.1, cx, CT.h + 0.02, cz + 0.03]], M('#173329', { roughness: 0.18, metalness: 0.1 })));
    add(mergedBoxes([[L + 0.1, 0.015, 0.02, cx, CT.h + 0.02, CT.z1 + 0.09], [L, 0.012, 0.012, cx, 0.16, CT.z1 + 0.16],
      ...[CT.x0 + 0.2, cx, CT.x1 - 0.2].map((x) => [0.02, 0.02, 0.15, x, 0.16, CT.z1 + 0.08])], brassM));
    const top = CT.h + 0.04;
    // The visitors' book: a red leather cover, the spread open towards you (repainted on each visit: see paintLedger).
    const lx = 12.55, lz = -2.38;
    add(mergedBoxes([[0.64, 0.025, 0.44, lx, top + 0.012, lz, '#4a1414']], vc({ roughness: 0.7 })));
    desk.ledger = makeCanvas(768, 528);
    const pages = mesh(new THREE.PlaneGeometry(0.6, 0.41), M('#ffffff', { map: desk.ledger.tex, roughness: 0.9 }), lx, top + 0.027, lz);
    pages.rotation.x = -Math.PI / 2;
    desk.pages = pages;
    const pen = mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.15, 8), M('#111'), lx + 0.18, top + 0.034, lz + 0.02);
    pen.rotation.set(Math.PI / 2, 0, 0.7);
    mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), M('#1a2a3a', { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 }), lx + 0.48, top + 0.025, lz - 0.12);
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.015, 16), brassM, lx + 0.48, top + 0.056, lz - 0.12);
    // The desk bell.
    const bx = 13.55, bz = -2.22;
    mesh(new THREE.CylinderGeometry(0.055, 0.058, 0.018, 28), M('#151312', { roughness: 0.4 }), bx, top + 0.009, bz);
    mesh(new THREE.SphereGeometry(0.05, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), M('#d8c08a', { metalness: 1, roughness: 0.15 }), bx, top + 0.018, bz);
    mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.02, 8), brassM, bx, top + 0.075, bz);
    mesh(new THREE.SphereGeometry(0.011, 10, 8), brassM, bx, top + 0.088, bz);
    desk.bell = { x: bx, y: top + 0.05, z: bz, hit: hitBox(hall, 0.14, 0.12, 0.14, bx, top + 0.05, bz, { action: 'bell', reach: 2.6 }), at: 0 };
    // The banker's lamp: a brass base and stem, the green glass shade (cased opal inside), its light under the shade.
    const kx = 14.75, kz = -2.5;
    const baseG = new THREE.CylinderGeometry(0.09, 0.1, 0.025, 32); baseG.scale(1.6, 1, 1);
    mesh(baseG, brassM, kx, top + 0.012, kz);
    mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 10), brassM, kx, top + 0.17, kz);
    mesh(new THREE.BoxGeometry(0.24, 0.012, 0.012), brassM, kx, top + 0.3, kz);
    desk.shadeM = new THREE.MeshStandardMaterial({ color: '#0e5a2a', emissive: '#0b5a26', emissiveIntensity: 0.6, roughness: 0.12, metalness: 0.2, side: THREE.DoubleSide, fog: false });
    const shade = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.38, 32, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), desk.shadeM, kx, top + 0.34, kz);
    shade.scale.set(1, 0.75, 1);
    for (const s of [-1, 1]) mesh(new THREE.CircleGeometry(0.085, 24, 0, Math.PI).rotateY(s * Math.PI / 2), desk.shadeM, kx + s * 0.19, top + 0.34, kz).scale.set(1, 0.75, 1);
    desk.bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.4, 0.9), fog: false });
    mesh(new THREE.CapsuleGeometry(0.018, 0.22, 4, 8).rotateZ(Math.PI / 2), desk.bulbM, kx, top + 0.325, kz);
    mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.12, 4), brassM, kx + 0.06, top + 0.26, kz + 0.04);
    mesh(new THREE.SphereGeometry(0.008, 8, 6), brassM, kx + 0.06, top + 0.2, kz + 0.04);
    desk.lamp = new THREE.PointLight('#ffcf8a', 0, 7, 2); desk.lamp.position.set(kx, top + 0.28, kz + 0.05); hall.add(desk.lamp);
    desk.lampOn = true;
    desk.lampHit = hitBox(hall, 0.42, 0.42, 0.24, kx, top + 0.2, kz, { action: 'banker', reach: 2.6 });
    // Index cards in a box, a rubber stamp, the ENQUIRIES plate.
    add(mergedBoxes([[0.16, 0.08, 0.22, 14.15, top + 0.04, -2.55, '#6b4428'], [0.14, 0.06, 0.2, 14.15, top + 0.07, -2.55, '#efe6d0'],
      [0.05, 0.05, 0.05, 13.95, top + 0.025, -2.3, '#2a1a10'], [0.04, 0.04, 0.04, 13.95, top + 0.07, -2.3, '#5a3620']], woodM));
    const enq = tex(256, 64, (c, W, h) => { c.fillStyle = '#b8924f'; c.fillRect(0, 0, W, h); c.fillStyle = '#2a1a08'; c.font = `600 34px ${SERIF}`; c.textAlign = 'center';
      c.fillText('ENQUIRIES', W / 2, 45); c.strokeStyle = '#2a1a08'; c.lineWidth = 2; c.strokeRect(5, 5, W - 10, h - 10); });
    mesh(new THREE.PlaneGeometry(0.32, 0.08), M('#ffffff', { map: enq.tex, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }), 11.75, top + 0.1, -2.12);
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 6), brassM, 11.75 + s * 0.12, top + 0.035, -2.12);
    // The chair nobody's sitting in, and the pigeonholes.
    add(mergedBoxes([[0.46, 0.05, 0.44, 13.3, 0.47, -3.12, '#4a2c1a'], [0.46, 0.5, 0.05, 13.3, 0.78, -3.36, '#4a2c1a'],
      ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => [0.04, 0.46, 0.04, 13.3 + a * 0.2, 0.23, -3.12 + b * 0.19, '#2c1a0e'])], woodM));
    // a thin dark back, the dividers standing on it, the shelves 4 mm back from the dividers' fronts
    const holes = [[2.38, 0.99, 0.02, 12.7, 1.85, -HW + 0.01, '#1a0f07']];
    for (let i = 0; i <= 8; i++) holes.push([0.025, 1.0, 0.28, 11.5 + i * 0.3, 1.85, -HW + 0.16, '#4a2c1a']);
    for (let j = 0; j <= 4; j++) holes.push([2.4, 0.025, 0.276, 12.7, 1.35 + j * 0.25, -HW + 0.16, '#4a2c1a']);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) if (R() < 0.6) holes.push([0.2, 0.04 + R() * 0.12, 0.24, 11.65 + i * 0.3, 1.38 + j * 0.25 + 0.04, -HW + 0.17, R() < 0.5 ? '#e8dfc8' : '#d8c8a0']);
    add(mergedBoxes(holes, woodM));
  }

  // ----- pneumatic tubes -----
  // Two glass tubes with brass couplings along the ceiling: from the archive (out of the vault's wall over the door) down
  // to the receiving station behind the counter, and from the catalogue back into the archive. Now and then a capsule
  // whooshes through; ring the bell and one comes for you.
  const route = (pts, r = 0.16) => {   // a polyline with its corners rounded
    const path = new THREE.CurvePath(), v = pts.map((p) => new THREE.Vector3(...p));
    let from = v[0];
    for (let i = 1; i < v.length - 1; i++) {
      const a = v[i].clone().sub(v[i - 1]).setLength(r), b = v[i + 1].clone().sub(v[i]).setLength(r);
      const p0 = v[i].clone().sub(a), p1 = v[i].clone().add(b);
      path.add(new THREE.LineCurve3(from, p0)); path.add(new THREE.QuadraticBezierCurve3(p0, v[i].clone(), p1)); from = p1;
    }
    path.add(new THREE.LineCurve3(from, v.at(-1)));
    return path;
  };
  const TY = 3.8;
  const tubes = arch.tubes = [
    { path: route([[X0 - 0.1, TY, -2.05], [14.55, TY, -2.05], [14.55, TY, -HW + 0.16], [14.55, 1.62, -HW + 0.16]]), land: true },
    { path: route([[13.85, 2.5, HW - 0.2], [13.85, TY, HW - 0.2], [13.85, TY, 2.05], [X0 - 0.1, TY, 2.05]]) },
  ];
  {
    const glassM = new THREE.MeshStandardMaterial({ color: '#8fa6a8', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false, fog: false });
    const cups = [];
    for (const tb of tubes) {
      const g = new THREE.Mesh(new THREE.TubeGeometry(tb.path, 160, 0.055, 14, false), glassM);
      g.layers.set(1); g.renderOrder = 2; inside.add(g);
      tb.len = tb.path.getLength();
      for (let s = 0.3; s < tb.len - 0.1; s += 1.1) {
        const p = tb.path.getPointAt(s / tb.len), t = tb.path.getTangentAt(s / tb.len);
        cups.push(new THREE.CylinderGeometry(0.066, 0.066, 0.06, 18).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t)).translate(p.x, p.y, p.z));
        if (p.y > TY - 0.05) cups.push(new THREE.CylinderGeometry(0.008, 0.008, H - TY, 6).translate(p.x, (H + TY) / 2, p.z));
      }
    }
    add(new THREE.Mesh(mergeGeometries(cups), brassM));
    // The receiving station: a brass housing with a glass door, the basket a capsule drops into; the catalogue's sender.
    add(mergedBoxes([[0.26, 0.36, 0.16, 14.55, 1.5, -HW + 0.09], [0.3, 0.02, 0.3, 14.55, 1.2, -HW + 0.16], [0.3, 0.06, 0.02, 14.55, 1.24, -HW + 0.3],
      [0.24, 0.3, 0.12, 13.85, 2.62, HW - 0.12]], brassM));
    mesh(new THREE.PlaneGeometry(0.16, 0.2), M('#203040', { roughness: 0.05, metalness: 0.5 }), 14.55, 1.52, -HW + 0.171);
    // A capsule for each tube: a felt-covered body between brass caps, along y.
    for (const tb of tubes) {
      const cap = tb.cap = add(new THREE.Group());
      mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.2, 16), M('#5a2a1a', { roughness: 0.9 }), 0, 0, 0, cap);
      for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 16), brassM, 0, s * 0.11, 0, cap);
      cap.visible = false;
      cap.traverse((o) => { o.userData = { action: 'capsule', reach: 2.6 }; });
    }
  }

  // ----- THE ARCHIVE sign, the lights, the clock -----
  const sign = {};
  {
    add(mergedBoxes([[0.05, 0.5, 3.1, X0 + 0.025, 3.8, 0]], M('#0b0a09', { roughness: 0.12, metalness: 0.4 })));
    add(mergedBoxes([[0.06, 0.03, 3.16, X0 + 0.03, 4.065, 0], [0.06, 0.03, 3.16, X0 + 0.03, 3.535, 0], [0.06, 0.56, 0.03, X0 + 0.03, 3.8, -1.565],
      [0.06, 0.56, 0.03, X0 + 0.03, 3.8, 1.565]], brassM));
    const letters = tex(1024, 140, (c, W, h) => {
      c.font = `500 104px ${SERIF}`; c.letterSpacing = '22px'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = 'rgba(255,220,160,.9)'; c.shadowBlur = 14; c.fillStyle = '#fff'; c.fillText('THE ARCHIVE', W / 2 + 11, h / 2 + 4);
    });
    sign.m = new THREE.MeshBasicMaterial({ map: letters.tex, transparent: true, depthWrite: false, color: new THREE.Color(2.2, 1.75, 1.15), fog: false });
    mesh(new THREE.PlaneGeometry(2.9, 0.4).rotateY(Math.PI / 2), sign.m, X0 + 0.055, 3.8, 0);
    sign.light = new THREE.PointLight('#ffd49a', 0, 5, 2); sign.light.position.set(X0 + 0.7, 3.5, 0); hall.add(sign.light);
    sign.base = new THREE.Color(2.2, 1.75, 1.15); sign.k = 1; sign.next = 4; sign.stutter = 0;
  }
  // Two schoolhouse pendants down the middle, and brass sconces either side of the plan and of the lift (glow only).
  const pend = [];
  {
    const globeM = new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: '#ffd49a', emissiveIntensity: 1.1, roughness: 0.6, fog: false });
    for (const x of [10.2, 15.2]) {
      mesh(new THREE.CylinderGeometry(0.008, 0.008, H - 3.15, 6), brassM, x, (H + 3.15) / 2, 0);
      mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.08, 20), brassM, x, 3.12, 0);
      mesh(new THREE.SphereGeometry(0.12, 24, 16), globeM, x, 2.98, 0);
      const l = new THREE.PointLight('#ffcf93', 0, 9, 2); l.position.set(x, 2.8, 0); hall.add(l); pend.push(l);
    }
    const sconce = [];
    for (const [x, z, ry] of [[8.05, -HW, 0], [10.15, -HW, 0], [X1, -2.35, -Math.PI / 2], [X1, 2.35, -Math.PI / 2]]) {
      const g = new THREE.BoxGeometry(0.1, 0.22, 0.03).translate(0, 0, 0.015);
      sconce.push(g.rotateY(ry).translate(x, 2.25, z));
      const arm = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8).rotateX(Math.PI / 2).translate(0, 0, 0.09);
      sconce.push(arm.rotateY(ry).translate(x, 2.25, z));
    }
    add(new THREE.Mesh(mergeGeometries(sconce), brassM));
    const shades = [];
    for (const [x, z, ry] of [[8.05, -HW, 0], [10.15, -HW, 0], [X1, -2.35, -Math.PI / 2], [X1, 2.35, -Math.PI / 2]]) {
      shades.push(new THREE.CylinderGeometry(0.05, 0.08, 0.12, 16, 1, true).translate(0, 0, 0.17).rotateY(ry).translate(x, 2.36, z));
    }
    add(new THREE.Mesh(mergeGeometries(shades), new THREE.MeshStandardMaterial({ color: '#f3e3c3', emissive: '#ffc985', emissiveIntensity: 1.6, roughness: 0.8, side: THREE.DoubleSide, fog: false })));
  }
  // The light from the void: a wide spot through the doorway, a shaft of haze, and a glare card beyond the door that only
  // shows from inside (so the void is blinding from the dark, and plain white once you're out in it).
  const spill = {};
  {
    const sp = spill.light = new THREE.SpotLight('#f4f7ff', 0, 16, 0.75, 0.9, 1.1);
    sp.position.set(X0 - 2.2, 2.0, 0); sp.target.position.set(X0 + 6, 0, 0); hall.add(sp, sp.target);
    const fade = tex(64, 256, (c, W, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,.7)'); g.addColorStop(0.12, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, W, h); });   // the cylinder's top (v = 1, the canvas's top row) is the door's end
    // the shaft: a cone from the door's bore spreading onto the floor, fading as it goes
    const cone = new THREE.CylinderGeometry(VAULT.r * 0.92, VAULT.r * 1.25, 4.2, 40, 1, true).rotateZ(Math.PI / 2).translate(X0 + 2.1, VAULT.y - 0.45, 0);
    spill.shaftM = new THREE.MeshBasicMaterial({ map: fade.tex, color: '#fff8ec', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    spill.shaft = mesh(cone, spill.shaftM); spill.shaft.layers.set(1); spill.shaft.visible = false; spill.shaft.raycast = () => {};
    const glow = tex(256, 256, (c, W) => { const g = c.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, W, W); });
    spill.glareM = new THREE.MeshBasicMaterial({ map: glow.tex, color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    spill.glare = mesh(new THREE.PlaneGeometry(5.5, 5.5).rotateY(Math.PI / 2), spill.glareM, X0 - VT - 0.25, VAULT.y, 0);
    spill.glare.layers.set(1); spill.glare.visible = false; spill.glare.raycast = () => {};
  }
  // The clock over the lift: Roman numerals on cream, in a brass bezel; it ticks.
  const clock = {};
  {
    const face = tex(256, 256, (c) => {
      c.fillStyle = '#efe6cf'; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1d1a16'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `500 26px ${SERIF}`;
      ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((t, i) => { const a = (i / 12) * Math.PI * 2;
        c.fillText(t, 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); });
      for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; c.save(); c.translate(128, 128); c.rotate(a); c.fillRect(-0.8, -124, 1.6, i % 5 ? 5 : 10); c.restore(); }
      c.font = `italic 400 13px ${SERIF}`; c.fillText('B2 · Archive', 128, 168);
    });
    const g = clock.g = add(new THREE.Group()); g.position.set(X1 - 0.06, 3.72, 0); g.rotation.y = -Math.PI / 2;
    mesh(new THREE.CircleGeometry(0.3, 48), M('#ffffff', { map: face.tex, roughness: 0.6 }), 0, 0, 0.02, g);
    mesh(new THREE.TorusGeometry(0.31, 0.025, 10, 64), brassM, 0, 0, 0.01, g);
    mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 48).rotateX(Math.PI / 2), M('#2c1a0e'), 0, 0, -0.015, g);
    const hand = (len, w, z) => { const p = add(new THREE.Group(), g); p.position.z = z; mesh(new THREE.BoxGeometry(w, len, 0.004), M('#14110e'), 0, len * 0.4, 0, p); return p; };
    Object.assign(clock, { h: hand(0.16, 0.022, 0.03), m: hand(0.24, 0.014, 0.035), s: hand(0.26, 0.005, 0.04), last: -1 });
  }
  // A long bench across from the door's swing, and over it a framed plan of the archive.
  {
    add(mergedBoxes([[2.4, 0.06, 0.42, 9.1, 0.46, -HW + 0.26, '#4a2c1a'], [2.4, 0.5, 0.05, 9.1, 0.78, -HW + 0.07, '#3a2214'],
      ...[7.98, 9.1, 10.22].map((x) => [0.06, 0.43, 0.38, x, 0.215, -HW + 0.26, '#2c1a0e'])], woodM));
    const plan = tex(512, 368, (c, W, h) => {
      c.fillStyle = '#e9dcbc'; c.fillRect(0, 0, W, h);
      for (let i = 0; i < 1800; i++) { c.fillStyle = `rgba(120,90,40,${R() * 0.06})`; c.fillRect(R() * W, R() * h, 3, 3); }
      c.strokeStyle = '#3b2a18'; c.fillStyle = '#3b2a18'; c.lineWidth = 2; c.strokeRect(14, 14, W - 28, h - 28);
      c.font = `600 22px ${SERIF}`; c.textAlign = 'center'; c.fillText('PLAN OF THE ARCHIVE · B2', W / 2, 44);
      c.setLineDash([6, 5]); c.beginPath(); c.arc(220, 200, 120, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.strokeRect(205, 192, 16, 12); c.font = `italic 15px ${SERIF}`; c.fillText('the cabinet', 214, 224);
      c.strokeRect(372, 186, 100, 30); c.fillText('entrance hall', 422, 236); c.beginPath(); c.arc(372, 201, 9, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(170, 318, 12, 0, Math.PI * 2); c.stroke(); c.fillText('gateway', 170, 345);
      c.font = `italic 13px ${SERIF}`; c.fillText('the void: extent unknown', 220, 92);
    });
    add(mergedBoxes([[1.36, 1.0, 0.04, 9.1, 2.05, -HW + 0.02]], M('#c9a25a', { metalness: 0.9, roughness: 0.35 })));
    mesh(new THREE.PlaneGeometry(1.24, 0.88), M('#ffffff', { map: plan.tex, roughness: 0.9 }), 9.1, 2.05, -HW + 0.042);
  }
  // Brass stanchions with red velvet ropes across the hall, leaving the runner open.
  {
    const posts = [], ropes = [];
    const ends = [[11.2, -1.0, -CT.z1], [11.2, 1.0, CAT.z]];
    for (const [x, z] of ends) { posts.push(new THREE.CylinderGeometry(0.025, 0.025, 0.92, 12).translate(x, 0.46, z), new THREE.CylinderGeometry(0.14, 0.15, 0.03, 24).translate(x, 0.015, z),
      new THREE.SphereGeometry(0.045, 14, 10).translate(x, 0.95, z)); }
    add(new THREE.Mesh(mergeGeometries(posts), brassM));
    for (const [x, z, z2] of ends) {
      const a = new THREE.Vector3(x, 0.88, z), b = new THREE.Vector3(x, 0.88, Math.sign(z) * Math.abs(z2) - Math.sign(z) * 0.06);
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= 0.22;
      ropes.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, 0.022, 8, false));
    }
    add(new THREE.Mesh(mergeGeometries(ropes), M('#6e0f1c', { roughness: 0.95 })));
  }

  // ----- colliders, look, sound -----
  // In the hall's own space (z about the car); arch.enter moves them onto the car's z.
  const sw = CAR.w / 2 + 0.3, x0 = X0 - VT;
  const fixed = [
    { minX: x0, maxX: XE, minZ: -HW - T, maxZ: -HW + 0.05 }, { minX: x0, maxX: XE, minZ: HW - 0.05, maxZ: HW + T },
    { minX: X1 - 0.05, maxX: XE, minZ: -HW, maxZ: -sw }, { minX: X1 - 0.05, maxX: XE, minZ: sw, maxZ: HW },
    { minX: x0, maxX: X0 + 0.12, minZ: -HW, maxZ: -VAULT.gap }, { minX: x0, maxX: X0 + 0.12, minZ: VAULT.gap, maxZ: HW },
    { minX: CAT.x0, maxX: CAT.x1, minZ: CAT.z - 0.02, maxZ: HW }, { minX: 15.1, maxX: 15.6, minZ: CAT.z - 0.7, maxZ: HW },
    { minX: CT.x0, maxX: CT.x1, minZ: CT.z0, maxZ: CT.z1 + 0.18 }, { minX: 7.9, maxX: 10.3, minZ: -HW, maxZ: -HW + 0.48 },
    { minX: 11.15, maxX: 11.25, minZ: CT.z1, maxZ: -1.0 }, { minX: 11.15, maxX: 11.25, minZ: 1.0, maxZ: CAT.z },
    { minX: 12.95, maxX: 13.6, minZ: -3.4, maxZ: -2.85 },
  ];
  // Out in the void only the doorway's collar stands there: either side of the way through.
  const collar = [-1, 1].map((s) => ({ minX: x0 - 0.12, maxX: X0 + 0.12, minZ: s < 0 ? -VAULT.ring : VAULT.gap, maxZ: s < 0 ? -VAULT.gap : VAULT.ring }));
  // How the hall is lit: warm and dim, the void's light only through the door. arch.look is blended between the two by
  // how far out into the void you are (voidK, 0 in the hall, 1 a step past the door).
  const voidLook = arch.look;
  const hallLook = { exposure: 1.0, hemi: 0.18, sky: new THREE.Color('#ffd2a0'), ground: new THREE.Color('#24160c'), env: 0.07, bloom: 1.3, grade: 1 };
  const lights = [[pend[0], 9], [pend[1], 9], [desk.lamp, 3.2], [sign.light, 2.4], [spill.light, 0]];
  const look = arch.look = { ...voidLook, sky: voidLook.sky.clone(), ground: voidLook.ground.clone(),
    lights: [...voidLook.lights.map(([l, v]) => [l, v]), ...lights.map(([l, v]) => [l, v])] };
  const nVoid = voidLook.lights.length;
  arch.hallLook = hallLook;
  // (1 - v) a + v b, not a + (b - a) v: exactly the void's own look out in it.
  const mix = (a, b, v) => (1 - v) * a + v * b, mixC = (o, a, b, v) => o.setRGB(mix(a.r, b.r, v), mix(a.g, b.g, v), mix(a.b, b.b, v));
  let side = 'hall';   // which side of the doorway you're on (see sideFx)
  const roomNow = lights.map(([, v]) => v);   // the hall's lights as they are now (the lamp, the sign's flicker, the spill)
  function blendLook(v, open) {
    for (const k of ['exposure', 'hemi', 'env', 'bloom', 'grade']) look[k] = mix(hallLook[k], voidLook[k], v);
    mixC(look.sky, hallLook.sky, voidLook.sky, v); mixC(look.ground, hallLook.ground, voidLook.ground, v);
    voidLook.lights.forEach(([, val], i) => { look.lights[i][1] = val * v; });
    roomNow[2] = desk.lampOn ? 3.2 : 0; roomNow[3] = 2.4 * sign.k; roomNow[4] = 24 * open;
    roomNow.forEach((val, i) => { look.lights[nVoid + i][1] = side === 'hall' ? val : 0; });   // dark out in the void: the hall isn't there
  }
  blendLook(1, 0);

  // ----- what happens -----
  const chance = rng(2203);   // its own dice: Math.random is seeded under test, and a draw here would shift everyone else's
  let z0 = 0, voidK = 1, last = null;
  const ledger = { signed: null };
  function paintLedger() {
    const { ctx: c, W, H: h } = desk.ledger, d = new Date();
    c.fillStyle = '#efe6cf'; c.fillRect(0, 0, W, h);
    const g = c.createLinearGradient(W / 2 - 40, 0, W / 2 + 40, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(60,40,20,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(W / 2 - 40, 0, 80, h);
    c.fillStyle = '#3a2a1a'; c.font = `600 22px ${SERIF}`; c.textAlign = 'center';
    c.fillText('VISITORS', W / 4, 34); c.fillText(d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), (W * 3) / 4, 34);
    c.textAlign = 'left'; c.strokeStyle = 'rgba(80,110,160,.35)'; c.lineWidth = 1;
    for (let y = 64; y < h - 10; y += 30) { c.beginPath(); c.moveTo(16, y); c.lineTo(W / 2 - 20, y); c.moveTo(W / 2 + 20, y); c.lineTo(W - 16, y); c.stroke(); }
    c.strokeStyle = 'rgba(170,60,60,.4)'; c.beginPath(); c.moveTo(92, 44); c.lineTo(92, h - 8); c.moveTo(W / 2 + 96, 44); c.lineTo(W / 2 + 96, h - 8); c.stroke();
    const rows = visitors();
    c.font = `italic 400 19px ${SERIF}`; c.fillStyle = '#1d2a4a';
    rows.forEach((r, i) => {
      const right = i >= 15, x = right ? W / 2 + 20 : 16, y = 60 + (i % 15) * 30;
      c.fillText(r.time, x + 6, y); c.fillText(r.name.length > 26 ? `${r.name.slice(0, 25)}…` : r.name, x + 84, y);
    });
    desk.ledger.tex.needsUpdate = true;
  }
  const hhmm = (t) => new Date(t).toTimeString().slice(0, 5);
  function visitors() {
    const live = [...(ctx.state?.live || [])].sort((a, b) => a.startedAt - b.startedAt).slice(-28);
    const rows = live.map((s) => ({ time: hhmm(s.startedAt || Date.now()), name: s.name || s.statusline?.name || s.transcript?.title || s.sessionId.slice(0, 8) }));
    if (ledger.signed) rows.push({ time: hhmm(ledger.signed), name: dash.config?.owner || 'You' });
    return rows;
  }
  function signLedger() {
    if (ledger.signed) return;
    ledger.signed = Date.now(); paintLedger();
    ctx.sfx.cabinet('page', { x: 12.55, y: 1.1, z: z0 - 2.38 }, 0.3);
  }

  // Capsules: one at a time per tube; `c.u` along it, a quick start, ~9 m/s, braking into the basket.
  const caps = [];
  function sendCapsule(i) {
    const tb = tubes[i];
    if (caps.some((c) => c.tb === tb)) return false;
    const g = tb.cap;
    g.visible = true;
    caps.push({ tb, g, s: 0, v: 0, rest: 0 });
    if (here()) ctx.sfx.cabinet('tube', tb.path.getPointAt(0.5).add(hall.position), 0.4);
    return true;
  }
  const UP = new THREE.Vector3(0, 1, 0), tan = new THREE.Vector3();
  function capsulesFx(dt) {
    for (const c of [...caps]) {
      if (c.rest) {   // lying in the basket until someone takes it (nobody does)
        if ((c.rest -= dt) <= 0) { c.g.visible = false; caps.splice(caps.indexOf(c), 1); }
        continue;
      }
      const left = c.tb.len - c.s;
      c.v = Math.min(9, c.v + dt * 22, c.tb.land ? Math.max(1.2, left * 3.2) : 9);
      c.s = Math.min(c.tb.len, c.s + c.v * dt);
      const u = c.s / c.tb.len;
      c.g.position.copy(c.tb.path.getPointAt(u)); c.g.quaternion.setFromUnitVectors(UP, c.tb.path.getTangentAt(u, tan));
      if (c.s >= c.tb.len) {
        if (c.tb.land) {
          c.g.position.set(14.55, 1.25, -HW + 0.16); c.g.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2); c.rest = 9;
          if (here()) { ctx.sfx.cabinet('thunk', c.g.position.clone().add(hall.position), 0.22); ctx.sfx.cabinet('bell', c.g.position.clone().add(hall.position), 0.06); }
        } else { c.g.visible = false; caps.splice(caps.indexOf(c), 1); }
      }
    }
  }
  let nextCap = 6;
  function signFx(dt, t) {   // a steady warm glow with a slow shimmer; every so often a stutter
    if (t > sign.next && !sign.stutter) { sign.stutter = 0.35 + chance() * 0.5; sign.next = t + 7 + chance() * 14; }
    let k = 0.96 + 0.04 * Math.sin(t * 2.3) * Math.sin(t * 0.7);
    if (sign.stutter) {
      sign.stutter = Math.max(0, sign.stutter - dt);
      const on = Math.sin(t * 61) * Math.sin(t * 23) > -0.2;
      k = on ? 0.9 : 0.25;
      if (on !== sign.on && here()) ctx.sfx.cabinet('relay', { x: X0 + 0.1, y: 3.8, z: z0 }, 0.025);
      sign.on = on;
    }
    sign.k = k; sign.m.color.copy(sign.base).multiplyScalar(k);
  }
  function clockFx() {
    const d = new Date(ctx.simNow()), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60, T2 = -Math.PI * 2;
    clock.h.rotation.z = (h / 12) * T2; clock.m.rotation.z = (m / 60) * T2; clock.s.rotation.z = (s / 60) * T2;
    if (s !== clock.last) { if (here() && clock.last >= 0) ctx.sfx.cabinet('tick', { x: X1 - 0.1, y: 3.7, z: z0 }, 0.12); clock.last = s; }
  }
  const here = () => arch.on && side === 'hall';
  // The vault: shut → unlock (the wheel spins, the bolts draw back) → opening → open → closing → locking → shut.
  const box3 = new THREE.Box3(), part = new THREE.Box3();
  function setVault(s) { vault.state = s; vault.t = 0; }
  const doorAt = () => ({ x: X0, y: VAULT.y, z: z0 });
  function vaultFx(dt, near, back) {
    const v = vault;
    v.t += dt;
    switch (v.state) {
      case 'shut':
        if (near || v.want) { setVault('unlock'); ctx.sfx.cabinet('bolts', doorAt(), 0.7); }
        break;
      case 'unlock':
        v.turn = ease(Math.min(1, v.t / 1.7)) * 1.25;
        if (v.t > 2.05) { setVault('opening'); ctx.sfx.cabinet('swing', doorAt(), 0.75); }
        break;
      case 'opening':
        v.k = Math.min(1, v.k + dt / 4.4);
        if (v.k === 1) { setVault('open'); ctx.sfx.cabinet('thunk', doorAt(), 0.35); }
        break;
      case 'open':
        if (back) { setVault('closing'); v.out = false; ctx.sfx.cabinet('swing', doorAt(), 0.7); }
        break;
      case 'closing':
        v.k = Math.max(0, v.k - dt / 3.8);
        if (near) setVault('opening');
        else if (v.k === 0) { setVault('locking'); ctx.sfx.cabinet('clang', doorAt(), 0.8); ctx.sfx.cabinet('bolts', doorAt(), 0.55); }
        break;
      case 'locking':
        v.turn = 1.25 * (1 - ease(Math.min(1, v.t / 1.5)));
        if (v.t > 1.6) { setVault('shut'); v.want = false; }
        break;
    }
    v.want = false;
    v.wheel.rotation.x = v.turn * Math.PI * 2;
    // Heavy: it gathers speed slowly and settles slowly.
    const e = v.k < 0.5 ? 2 * v.k * v.k : 1 - (-2 * v.k + 2) ** 2 / 2;
    v.pivot.rotation.y = -VAULT.swing * e;
    // The door in the way: across the bore while shut, wherever it's got to otherwise.
    const b = v.box;
    if (v.k === 0 && side === 'void' && ctx.player.x > PLANE) Object.assign(b, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });   // from behind, out in the void: no door
    else if (v.k === 0) Object.assign(b, { minX: x0, maxX: X0 + 0.3, minZ: z0 - VAULT.gap, maxZ: z0 + VAULT.gap });
    else {
      hall.updateMatrixWorld(); box3.makeEmpty();
      for (const o of v.parts) box3.union(part.copy(o.geometry.boundingBox ?? (o.geometry.computeBoundingBox(), o.geometry.boundingBox)).applyMatrix4(o.matrixWorld));
      Object.assign(b, { minX: Math.max(box3.min.x, X0 + 0.15), maxX: box3.max.x, minZ: box3.min.z, maxZ: box3.max.z });
    }
  }
  const BULB = new THREE.Color(1.8, 1.4, 0.9);
  // The glare: a flash as the door comes open, your eyes adjusting over a few seconds until the cabinet shows through.
  function lightFx(open, dt = 0) {
    spill.flash = vault.state === 'opening' ? Math.max(spill.flash ?? 0, open) : damp(spill.flash ?? 0, open * 0.22, 0.6, dt);
    spill.shaft.visible = spill.glare.visible = open > 0.002;
    spill.shaftM.opacity = 0.07 * open * (1 - voidK);
    spill.glareM.opacity = spill.flash * (1 - voidK) * 0.55;
    desk.shadeM.emissiveIntensity = desk.lampOn ? 0.6 : 0.05; desk.bulbM.color.copy(BULB).multiplyScalar(desk.lampOn ? 1 : 0.1);
  }
  // The things that run whether you're here or watching on CCTV.
  function animate(dt, t) {
    signFx(dt, t); clockFx(); capsulesFx(dt);
    if (t > nextCap) { nextCap = t + 8 + chance() * 16; sendCapsule(chance() < 0.55 ? 0 : 1); }
  }
  // Which side you're on. Through the doorway (between its jambs, across its middle) you're where you've come out: the
  // hall going in, the void coming out. Round the outside of it, out in the void, nothing changes. A jump (a teleport, the
  // way back from a repo) leaves you in the hall only if you've landed inside it.
  const PLANE = X0 - VT / 2, inBox = (x, lz) => x > x0 - 0.2 && x < XE && Math.abs(lz) < HW + T;
  function sideFx(px, lz) {
    if (!last || Math.hypot(px - last.x, lz - last.z) > 1.5) { if (!inBox(px, lz)) setSide('void'); }
    else if ((last.x - PLANE) * (px - PLANE) < 0 && Math.abs(lz) < VAULT.r) setSide(px > PLANE ? 'hall' : 'void');
    last = { x: px, z: lz };
  }
  const hallHits = [vault.hit, ...vault.parts, arch.vaultWall, desk.bell.hit, desk.lampHit, desk.pages, desk.body, tubes[0].cap, tubes[1].cap];
  let liftBox = null, liftHits = [];
  function setSide(s) {
    if (s === side) return;
    side = s;
    const there = s === 'hall';
    inside.visible = there; arch.lift.visible = there; arch.liftGone = !there;
    if (!there) vault.out = true;
    colliders();
    for (const h of [...hallHits, ...liftHits]) { const i = arch.hits.indexOf(h); if (i >= 0) arch.hits.splice(i, 1); }
    if (there) arch.hits.push(...hallHits, ...liftHits);
  }
  function colliders() {
    arch.colliders.length = arch.nFixed;
    if (side === 'hall') { if (liftBox) arch.colliders.push(liftBox); for (const b of fixed) arch.colliders.push({ ...b, minZ: b.minZ + z0, maxZ: b.maxZ + z0 }); }
    else for (const b of collar) arch.colliders.push({ ...b, minZ: b.minZ + z0, maxZ: b.maxZ + z0 });
    arch.colliders.push(vault.box);
  }

  // The doorway from the void's side: the hall drawn from your eye with its own light into a target the size of the frame,
  // shown on a disc across the bore's mouth (screen-space), scaled for the void's exposure. Only from in front of it.
  const portalRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  const discM = new THREE.ShaderMaterial({
    uniforms: { tHall: { value: portalRT.texture }, res: { value: new THREE.Vector2(4, 4) }, k: { value: 1 } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tHall; uniform vec2 res; uniform float k; void main() { gl_FragColor = vec4(texture2D(tHall, gl_FragCoord.xy / res).rgb * k, 1.0); }',
  });
  const disc = mesh(new THREE.CircleGeometry(VAULT.r + 0.01, 96).rotateY(-Math.PI / 2), discM, x0 - 0.13, VAULT.y, 0, portal);
  disc.layers.set(1); addPane(disc); disc.visible = false; disc.raycast = () => {};
  const bufSize = new THREE.Vector2();
  // The hall as it is from inside it: there, lit by its own lamps, its own hemisphere and environment. Undone by the return.
  function hallLit() {
    const h = arch.hemi, was = [h.intensity, h.color.clone(), h.groundColor.clone(), S.environmentIntensity, look.lights.map(([l]) => l.intensity),
      inside.visible, arch.lift.visible, disc.visible];
    h.intensity = hallLook.hemi; h.color.copy(hallLook.sky); h.groundColor.copy(hallLook.ground); S.environmentIntensity = hallLook.env;
    look.lights.forEach(([l], i) => { l.intensity = i < nVoid ? 0 : roomNow[i - nVoid]; });
    inside.visible = arch.lift.visible = true; disc.visible = false;
    return () => {
      h.intensity = was[0]; h.color.copy(was[1]); h.groundColor.copy(was[2]); S.environmentIntensity = was[3];
      look.lights.forEach(([l], i) => { l.intensity = was[4][i]; });
      [inside.visible, arch.lift.visible, disc.visible] = was.slice(5);
    };
  }
  function portalFx() {
    const r = ctx.renderer;
    disc.visible = side === 'void' && camera.position.x < x0 - 0.13;   // shut, it's the door you see through it, from the hall's side
    if (!disc.visible) return;
    r.getDrawingBufferSize(bufSize);
    if (portalRT.width !== bufSize.x || portalRT.height !== bufSize.y) { portalRT.setSize(bufSize.x, bufSize.y); discM.uniforms.res.value.copy(bufSize); }
    discM.uniforms.k.value = hallLook.exposure / look.exposure;
    const undo = hallLit(), prev = r.getRenderTarget();
    camera.updateMatrixWorld();
    r.setRenderTarget(portalRT); r.clear(); r.render(S, camera); r.setRenderTarget(prev);
    undo();
  }

  function hallFx(dt, t) {
    const px = ctx.player.x, pz = ctx.player.z, lz = pz - z0;
    sideFx(px, lz);
    const target = side === 'hall' ? sstep(X0 - 1.2, X0 + 0.9, px) : 0;   // how much you're in the hall: 1 a step inside the door
    voidK = Math.abs(1 - target - voidK) > 0.5 ? 1 - target : damp(voidK, 1 - target, 6, dt);   // (a jump is a teleport: no fade)
    // Walking up to it opens it: from the hall, or from in front of it out in the void (not from behind).
    const near = Math.hypot(px - X0, lz) < VAULT.near && Math.abs(lz) < VAULT.r + 0.6 && (side === 'hall' || px < x0);
    const back = vault.out && side === 'hall' && px > X0 + 4.3;
    vaultFx(dt, near, back);
    if (vault.k !== vault.lastK) { vault.lastK = vault.k; if (ctx.mode === 'free') ctx.collide(ctx.player); }   // the door swinging into you pushes you
    animate(dt, t);
    const open = sstep(0.02, 0.6, vault.k);
    lightFx(open, dt);
    blendLook(voidK, open);
    portalFx();
    ctx.sfx.voidMix(voidK + (1 - voidK) * open * 0.4);   // the void's air and echo, a little of it through the open door
  }
  function resetHall() {
    for (const c of caps.splice(0)) c.g.visible = false;
    Object.assign(vault, { state: 'shut', k: 0, t: 0, turn: 0, out: false, want: false }); spill.flash = 0;
    vault.wheel.rotation.x = 0; vault.pivot.rotation.y = 0;
    ledger.signed = null;
    setSide('hall'); last = null;
  }

  // Into the floor's hooks (archive.js and gateway.js set them up first).
  const enter0 = arch.enter, leave0 = arch.leave, fx0 = arch.fx, ground0 = arch.ground;
  liftHits = [arch.callHit, arch.panel.mesh, arch.lift];
  arch.enter = (z) => {
    enter0(z);
    liftBox = arch.colliders.at(-1);   // the lift's, pushed by archive.js's enter
    z0 = z; hall.position.z = z;
    resetHall(); colliders();
    vaultFx(0, false, false);
    paintLedger();
  };
  arch.leave = () => { leave0?.(); resetHall(); };
  arch.fx = (dt, t) => { fx0?.(dt, t); hallFx(dt, t); };
  arch.ground = (x, z) => (Math.abs(x - (X0 - VT / 2 + 0.05)) < (VT + 0.3) / 2 && Math.abs(z - z0) < 0.5 ? VAULT.sill : ground0 ? ground0(x, z) : 0);
  arch.hits.push(...hallHits);
  desk.pages.userData = { action: 'ledger', reach: 2.6 };
  // On the minimap: the hall's floor and its name (archive.js draws the colliders over it).
  // Out in the void there's only the doorway.
  arch.mapHall = (c, sx, sz, k) => {
    c.font = '600 13px system-ui';
    if (side === 'hall') {
      c.fillStyle = 'rgba(201,162,90,.18)'; c.fillRect(sx(X0), sz(z0 - HW), (X1 - X0) * k, HW * 2 * k);
      c.fillStyle = 'rgba(255,255,255,.55)'; c.textAlign = 'right'; c.fillText('Entrance hall', sx(X1), sz(z0 + HW) + 15); c.textAlign = 'left';
    } else {
      c.fillStyle = 'rgba(201,162,90,.7)'; c.fillRect(sx(x0) - 1, sz(z0 - VAULT.ring), Math.max(3, VT * k), VAULT.ring * 2 * k);
      c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText('Doorway', sx(x0) - 22, sz(z0 + VAULT.ring) + 15);
    }
  };
  // On the security camera (systems/cctv.js): lit as you'd see it from the hall, with the sign, the clock and the tubes going.
  arch.cctv = {
    root: inside,   // its camera is the hall's: never out in the void
    tick(dt, t) { if (!arch.on) animate(dt, t); },
    exposure: hallLook.exposure,
    stage() {   // (the hall is always there for its camera, whichever side you're on)
      if (!arch.on) { lightFx(0); blendLook(0, 0); }
      return hallLit();
    },
  };

  const hint = (s) => `<div class="k">${s}</div>`;
  ctx.action('vault', {
    hover: () => `<b>The vault door</b><div class="m">The Archive · B2</div>${hint({ shut: 'Click the wheel to open it', unlock: 'Unlocking…', opening: 'Opening…',
      open: 'Open · walk through', closing: 'Closing…', locking: 'Locking…' }[vault.state])}`,
    click: () => { if (vault.state === 'shut') vault.want = true; else if (vault.state === 'closing') setVault('opening'); },
  });
  ctx.action('bell', {
    hover: () => `<b>Desk bell</b><div class="m">Please ring for attendance</div>${hint('Click to ring')}`,
    click: () => {
      ctx.sfx.cabinet('bell', { x: desk.bell.x, y: desk.bell.y, z: desk.bell.z + z0 }, 0.5);
      if (performance.now() - desk.bell.at > 1500) { desk.bell.at = performance.now(); setTimeout(() => { if (arch.on) sendCapsule(0); }, 1600); }
    },
  });
  ctx.action('banker', {
    hover: () => `<b>Banker's lamp</b>${hint(`Click to turn it ${desk.lampOn ? 'off' : 'on'}`)}`,
    click: () => { desk.lampOn = !desk.lampOn; ctx.sfx.cabinet('latch', { x: 14.8, y: 1.3, z: z0 - 2.46 }, 0.2); },
  });
  ctx.action('ledger', {
    hover: () => {
      const rows = visitors().slice(-5).reverse();
      return `<b>Visitors' book</b><div class="m">${rows.length ? rows.map((r) => `${escapeHtml(r.time)} · ${escapeHtml(r.name)}`).join('<br>') : 'Nobody yet today'}</div>${hint(ledger.signed ? 'You’ve signed in' : 'Click to sign in')}`;
    },
    click: () => signLedger(),
  });
  ctx.action('capsule', {
    hover: () => `<b>A capsule from the archive</b><div class="m">${files.list ? `${files.list.length} repo${files.list.length === 1 ? '' : 's'} on file. Nobody has come for it.` : 'Rolled up inside: a note that just says “wait”.'}</div>`,
    click: () => {},
  });
  // Same handles the debug hooks use (window.__office.arch).
  Object.assign(arch, { openVault: () => { vault.want = true; }, sendCapsule, spill, hallLit, portalRT, X0, VAULT });
}
