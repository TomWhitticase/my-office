// A ventilation duct from the den (world/secret-den.js) to the corridor behind the sky (floors/world-edge-backstage.js).
// In the den, a carved wooden grille low in the east wall ("A vent") swings open on its hinges onto galvanised steel, a
// draught and a hum; walk into it (or click the opening) and you're down on your hands and knees in a duct 0.6 m square.
// It runs east, turns, climbs a short slope, turns again, and (out of the office's scene, see below) runs on past a
// junction whose dead end has a grille in its floor over a plant room, its fan turning, drops a step with rungs welded
// to it, turns twice more and ends at a plain painted louvred grille low in the corridor's concrete wall: push it (twice)
// and it pops off its clips and clatters onto the floor, and you climb out. Back the same way: from the corridor, pull the
// grille off (or put it back) and crawl in. W and S crawl, A and D shuffle sideways, the mouse looks, Shift scrambles;
// about 35 s end to end. Hands and knees thump on the metal, it ticks and booms, you breathe, slats of light come through
// grilles you pass, voices murmur somewhere.
//
// It's laid out on a grid of 0.6 m cells in its own space, which is the office's: the first half is real geometry in 47's
// dead storey, beside the den; the second is in the backstage's own scene, its plan turned a quarter and 3.8 m up (TM),
// out in the dark behind the corridor's last leg, where nothing can see it. The two meet across a straight cell, through
// a pair of portals (systems/portal.js), and as your eye crosses it you change floors (the backstage needs a car of yours
// to hang from, so one's parked for you at B3 as you near it, as a reload does). The duct isn't lit by either scene: its
// light is baked into it from its own few sources, so it looks the same on both sides of the join. The backstage is built
// as you open the vent; this file dresses it (ctx.dressBackstage: the grille, the far half, the plant room). Nothing here
// runs while you're not in it; a reload puts you back in the office's half where you were (the far half saves nothing:
// you're put back by the join), and the menu's Back to my desk works from anywhere in it.
//
// window.__office.secret: .vent(open), .duct(x, z, yaw, pitch) (crawling at (x, z), duct space), .corridor(x, z, yaw,
// pitch) (stood behind the sky, its plan's space), .grille(off).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { angDiff, clamp, damp, ease, EYE, lerp, makeCanvas, rng } from '../util.js';
import { makePortal } from '../systems/portal.js';

const C = 0.6, X0 = 12.6, Z0 = -9.7, CRAWL = 0.45, XC = X0 + 7 * C, ZC = Z0 + 10.5 * C;   // a cell; the grid's corner; your eye; the join
export const VENT = { z0: Z0, z1: Z0 + C, y0: 0.08, y1: 0.08 + C };   // in the den's east wall (heights over its floor)
// Duct space to the backstage's plan: a quarter turn, 3.8 m up. The join lands at (30, 6.3) there; the end, PLAN.VENT.
const TM = new THREE.Matrix4().set(0, 0, -1, 26.6, 0, 1, 0, 3.8, 1, 0, 0, -10.5, 0, 0, 0, 1), TMi = TM.clone().invert();
const MOUTH = X0 + 28 * C, OUT = MOUTH + 0.2;   // the far end: the wall's back face, its corridor face
// How bright the duct looks, whichever scene draws it (each half's materials are over that scene's exposure: the den's or
// the backstage's), so it's the same seen through the den's grille, from the corridor, inside, and across the join.
const LOOK = 0.42;

// ----- the cells: i along x, j along z; lv the floor over the low level; ramps along +z; the drop a cell two high -----
function layout() {
  const cells = new Map(), key = (i, j) => `${i},${j}`;
  const put = (i, j, o = {}) => { const c = { i, j, lv: 0, bs: i >= 7, x0: X0 + C * i, z0: Z0 + C * j, ...o }; cells.set(key(i, j), c); };
  for (let i = 0; i <= 4; i++) put(i, 0);
  for (let j = 1; j <= 7; j++) put(4, j);
  put(4, 8, { ramp: [0, 0.3] }); put(4, 9, { ramp: [0.3, 0.6] });
  for (let i = 4; i <= 12; i++) put(i, 10, { lv: 0.6 });
  for (let j = 10; j >= -10; j--) put(13, j, { lv: 0.6 });   // past the join; the junction at j = -6, its dead end at -10
  for (let i = 14; i <= 20; i++) put(i, -6, { lv: 0.6 });
  put(21, -6, { drop: true });
  put(22, -6);
  for (let j = -5; j <= 4; j++) put(22, j);
  for (let i = 23; i <= 27; i++) put(i, 4);
  return { cells, at: (x, z) => cells.get(key(Math.floor((x - X0) / C), Math.floor((z - Z0) / C))), get: (i, j) => cells.get(key(i, j)) };
}
const SIDES = { 'x-': [-1, 0], 'x+': [1, 0], 'z-': [0, -1], 'z+': [0, 1] };

/** @param {any} ctx @param {any} api secret-room.js's: S, DY, snd(), ensure(), hideOverhead() */
export function installDuct(ctx, api) {
  const { S, DY } = api, { camera, renderer } = ctx;
  const FL = DY + 0.08, G = layout();
  const floorRel = (c, z) => (c.ramp ? lerp(c.ramp[0], c.ramp[1], clamp((z - c.z0) / C, 0, 1)) : c.drop ? 0 : c.lv);
  const range = (c, s) => (c.ramp ? (s === 'z-' ? [c.ramp[0], c.ramp[0] + C] : s === 'z+' ? [c.ramp[1], c.ramp[1] + C] : null) : c.drop ? [0, 2 * C] : [c.lv, c.lv + C]);
  // Grilles you pass, with light through them (a cell and a side, its light's colour), and the plant room's under the dead end.
  const GRILLES = [{ i: 4, j: 4, s: 'x+', c: [1.0, 0.82, 0.6] }, { i: 13, j: 2, s: 'y-', c: [0.62, 0.74, 1.0] }, { i: 22, j: -1, s: 'x-', c: [0.7, 0.8, 1.0] }];
  const PEEK = { i: 13, j: -10 };
  const isPeek = (c) => c.i === PEEK.i && c.j === PEEK.j;
  const grilleOf = (c, s) => GRILLES.find((g) => g.i === c.i && g.j === c.j && g.s === s);
  // The duct's own light: a little everywhere, warm at the den's end, cool at the corridor's, each grille's, the plant room's.
  const LIGHTS = [[X0 - 0.2, FL + 0.3, Z0 + 0.3, [0.75, 0.42, 0.22], 1.8], [OUT + 0.1, FL + 0.3, Z0 + 4.5 * C, [0.6, 0.68, 0.8], 1.8],
    [X0 + 21 * C, FL + 0.3, Z0 - 9.5 * C, [1.0, 0.5, 0.2], 1.6],
    ...GRILLES.map((g) => [X0 + C * (g.i + 0.5) + (g.s === 'x+' ? 0.3 : g.s === 'x-' ? -0.3 : 0), FL + G.get(g.i, g.j).lv + (g.s === 'y-' ? -0.05 : 0.35), Z0 + C * (g.j + 0.5), g.c, 1.7])];
  const lightAt = (x, y, z) => {
    const v = [0.3, 0.31, 0.34];
    for (const [lx, ly, lz, c, r] of LIGHTS) { const d = Math.hypot(x - lx, y - ly, z - lz), k = Math.max(0, 1 - d / r) ** 2; for (let n = 0; n < 3; n++) v[n] += c[n] * k; }
    return v;
  };
  const own = (fn) => { const random = Math.random; Math.random = rng(4949); try { return fn(); } finally { Math.random = random; } };

  // ----- materials: galvanised sheet (seams, rivets, spangle), lit by the bake (unlit by the scene) -----
  const sheetT = (() => {
    const t = makeCanvas(128, 128), c = t.ctx, R = rng(77);
    c.fillStyle = '#a9afb4'; c.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 160; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '40,46,52'},${0.04 + R() * 0.06})`; c.beginPath(); const x = R() * 128, y = R() * 128, r = 3 + R() * 9; c.moveTo(x, y); for (let q = 0; q < 6; q++) c.lineTo(x + Math.cos(q + R()) * r, y + Math.sin(q + R()) * r); c.fill(); }
    c.fillStyle = 'rgba(30,34,38,.55)'; c.fillRect(0, 0, 128, 3); c.fillRect(0, 0, 3, 128);
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, 3, 128, 1); c.fillRect(3, 0, 1, 128);
    c.fillStyle = 'rgba(40,44,48,.7)'; for (let x = 10; x < 128; x += 16) { c.beginPath(); c.arc(x, 8, 1.6, 0, 7); c.fill(); c.beginPath(); c.arc(8, x, 1.6, 0, 7); c.fill(); }
    t.tex.needsUpdate = true;
    return t.tex;
  })();
  const sheetM = new THREE.MeshBasicMaterial({ map: sheetT, vertexColors: true, fog: false });
  const fitM = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const beamT = (() => { const t = makeCanvas(4, 64), c = t.ctx, g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, '#000'); g.addColorStop(1, '#fff'); c.fillStyle = g; c.fillRect(0, 0, 4, 64); t.tex.needsUpdate = true; return t.tex; })();
  const beamM = new THREE.MeshBasicMaterial({ map: beamT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

  // No ambient occlusion over the duct, in either scene: its light's baked, and the screen-space pass (heavy in a 0.6 m box)
  // would differ between what you see of it from outside, through the join and from inside. Its meshes are left out of
  // each AO pass's depth and normals (the office's, the backstage's), wrapped as it's first drawn.
  const unshaded = new Set();
  const noAO = (m) => { unshaded.add(m); return m; };
  function skipAO(ao) {
    if (!ao || ao.__duct) return;
    ao.__duct = true;
    const over = ao._overrideVisibility.bind(ao), restore = ao._restoreVisibility.bind(ao), hid = [];
    ao._overrideVisibility = () => { over(); for (const m of unshaded) if (m.visible) { m.visible = false; hid.push(m); } };
    ao._restoreVisibility = () => { for (const m of hid) m.visible = true; hid.length = 0; restore(); };
  }

  // ----- building one half (the office's cells, or the far ones): faces facing in, the grilles, the beams -----
  function buildHalf(far, exp) {
    const k = LOOK / exp, mat = (m) => { const c = m.clone(); c.color.multiplyScalar(k); return c; };
    const pos = [], uv = [], col = [], fits = [], beams = [], glows = [];
    const quad = (pts, n, u = [[0, 0], [1, 0], [1, 1], [0, 1]], into = { pos, uv, col }, tint = null) => {
      const [a, b, c] = pts, e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const order = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      const face = n[1] > 0.5 ? 1.15 : n[1] < -0.5 ? 0.65 : 0.9;   // (the floor catches most, the top least)
      for (const k of order) { const p = pts[k]; into.pos.push(...p); into.uv.push(...u[k]); into.col.push(...(tint ? tint(p) : lightAt(p[0], p[1], p[2]).map((v) => v * face))); }
    };
    const fit = (w, h, d, x, y, z, color, ry = 0, rz = 0, geo) => {
      const g = (geo || new THREE.BoxGeometry(w, h, d)).rotateZ(rz).rotateY(ry).translate(x, y, z), n = g.attributes.position.count, a = new Float32Array(n * 3);
      const L = lightAt(x, y, z), cc = new THREE.Color(color);
      for (let k = 0; k < n; k++) { a[k * 3] = cc.r * L[0] * 2.2; a[k * 3 + 1] = cc.g * L[1] * 2.2; a[k * 3 + 2] = cc.b * L[2] * 2.2; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); fits.push(g.index ? g.toNonIndexed() : g);
    };
    for (const c of G.cells.values()) {
      if (!!c.bs !== far) continue;
      const x0 = c.x0, x1 = x0 + C, z0 = c.z0, z1 = z0 + C, fz = (z) => FL + floorRel(c, z), tz = (z) => fz(z) + (c.drop ? 2 * C : C);
      // floor and ceiling (the dead end's floor is a grille over the plant room; the floor grille's lets light up)
      const fgr = grilleOf(c, 'y-');
      if (!isPeek(c) && !fgr) quad([[x0, fz(z0), z0], [x1, fz(z0), z0], [x1, fz(z1), z1], [x0, fz(z1), z1]], [0, 1, 0]);
      quad([[x0, tz(z0), z0], [x1, tz(z0), z0], [x1, tz(z1), z1], [x0, tz(z1), z1]], [0, -1, 0]);
      if (isPeek(c) || fgr) {
        const y = fz(z0), gap = isPeek(c) ? 0.12 : 0.07;
        for (let x = x0 + 0.04; x < x1 - 0.02; x += gap) fit(0.025, 0.03, C - 0.08, x, y - 0.015, (z0 + z1) / 2, '#4a4f54');
        fit(C, 0.04, 0.04, (x0 + x1) / 2, y - 0.02, z0 + 0.02, '#4a4f54'); fit(C, 0.04, 0.04, (x0 + x1) / 2, y - 0.02, z1 - 0.02, '#4a4f54');
        if (fgr) {
          glows.push([C - 0.06, C - 0.06, (x0 + x1) / 2, y - 0.14, (z0 + z1) / 2, 'y', fgr.c]);
          for (let x = x0 + 0.075; x < x1 - 0.03; x += 0.07) beams.push([[x, y, z0 + 0.08], [x + 0.03, y, z0 + 0.08], [x + 0.06, y + 0.55, z0 + 0.12], [x + 0.03, y + 0.55, z0 + 0.12], fgr.c, 'up', z1 - z0 - 0.16]);
        }
      }
      // the four sides: walls where there's no cell beyond (or only part of an opening), a grille where there's light
      for (const [s, [di, dj]] of Object.entries(SIDES)) {
        const n = G.get(c.i + di, c.j + dj), inward = [-di, 0, -dj];
        const at = s === 'x-' ? x0 : s === 'x+' ? x1 : s === 'z-' ? z0 : z1, alongX = s[0] === 'z';
        const corner = (u, y) => (alongX ? [u, y, at] : [at, y, u]);
        const [u0, u1] = alongX ? [x0, x1] : [z0, z1];
        const end = (c.i === 0 && c.j === 0 && s === 'x-') || (c.i === 27 && c.j === 4 && s === 'x+');
        if (end) continue;   // the two ends: open
        const gr = grilleOf(c, s);
        if (gr) {
          const y0 = fz(z0), mid = (u0 + u1) / 2;
          for (let k = 0; k < 6; k++) { const y = y0 + 0.08 + k * 0.09; fit(alongX ? C - 0.006 : 0.03, 0.035, alongX ? 0.03 : C - 0.006, alongX ? mid : at - di * 0.015, y, alongX ? at - dj * 0.015 : mid, '#454a4f', 0, 0); }
          fit(alongX ? C : 0.04, 0.06, alongX ? 0.04 : C, alongX ? mid : at, y0 + 0.03, alongX ? at : mid, '#3d4146'); fit(alongX ? C : 0.04, 0.06, alongX ? 0.04 : C, alongX ? mid : at, y0 + C - 0.03, alongX ? at : mid, '#3d4146');
          glows.push([C, C, alongX ? mid : at + di * 0.1, y0 + C / 2, alongX ? at + dj * 0.1 : mid, alongX ? 'z' : 'x', gr.c]);
          for (let k = 0; k < 5; k++) {   // a slat of light from each gap, down across the floor
            const y = y0 + 0.125 + k * 0.09, ya = y + 0.018, yb = y - 0.018, reach = 0.3 + y * 0.6 - y0 * 0.6;
            const p = (u, yy, d) => (alongX ? [u, yy, at - dj * d] : [at - di * d, yy, u]);
            beams.push([p(u0 + 0.05, ya, 0), p(u1 - 0.05, ya, 0), p(u1 - 0.05, Math.max(y0 + 0.005, yb - reach * 0.7), reach), p(u0 + 0.05, Math.max(y0 + 0.005, yb - reach * 0.7), reach), gr.c, 'side']);
          }
          continue;
        }
        const mine = range(c, s);
        if (!mine) {   // a ramp's side: one sloped quad
          quad([[at, FL + c.ramp[0], z0], [at, FL + c.ramp[1], z1], [at, FL + c.ramp[1] + C, z1], [at, FL + c.ramp[0] + C, z0]], inward);
          continue;
        }
        const open = n ? range(n, { 'x-': 'x+', 'x+': 'x-', 'z-': 'z+', 'z+': 'z-' }[s]) : null;
        const pieces = open ? [[mine[0], Math.max(mine[0], Math.min(mine[1], open[0]))], [Math.min(mine[1], Math.max(mine[0], open[1])), mine[1]]] : [mine];
        for (const [ya, yb] of pieces) if (yb - ya > 0.005) quad([corner(u0, FL + ya), corner(u1, FL + ya), corner(u1, FL + yb), corner(u0, FL + yb)], inward,
          [[0, ya / C], [1, ya / C], [1, yb / C], [0, yb / C]]);
        if (c.drop && s === 'x-') for (const y of [0.2, 0.42]) fit(0, 0, 0, at + 0.035, FL + y, (z0 + z1) / 2, '#6d7378', 0, Math.PI / 2, new THREE.CylinderGeometry(0.014, 0.014, C - 0.12, 8).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2));   // rungs to climb back up
      }
    }
    {   // a collar round the duct at the join, each half its own side of it (what the portals' margins show: systems/portal.js)
      const x = far ? XC + 0.04 : XC - 0.04, y0 = FL + 0.6, zc = ZC;   // (a centimetre off the join: never on the portal's clipping plane)
      for (const [h, d, y, z] of [[0.05, C + 0.1, y0 - 0.028, zc], [0.05, C + 0.1, y0 + C + 0.028, zc], [C + 0.006, 0.05, y0 + C / 2, zc - C / 2 - 0.028], [C + 0.006, 0.05, y0 + C / 2, zc + C / 2 + 0.028]])
        fit(0.06, h, d, x, y, z, '#5a6066');
    }
    if (far) {   // the stub through the corridor's wall, to its face
      const z0 = Z0 + 4 * C, z1 = z0 + C;
      quad([[MOUTH, FL, z0], [OUT, FL, z0], [OUT, FL, z1], [MOUTH, FL, z1]], [0, 1, 0]); quad([[MOUTH, FL + C, z0], [OUT, FL + C, z0], [OUT, FL + C, z1], [MOUTH, FL + C, z1]], [0, -1, 0]);
      quad([[MOUTH, FL, z0], [OUT, FL, z0], [OUT, FL + C, z0], [MOUTH, FL + C, z0]], [0, 0, 1]); quad([[MOUTH, FL, z1], [OUT, FL, z1], [OUT, FL + C, z1], [MOUTH, FL + C, z1]], [0, 0, -1]);
    }
    const g = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    g.add(noAO(new THREE.Mesh(geo, mat(sheetM))));
    if (fits.length) g.add(noAO(new THREE.Mesh(mergeGeometries(fits), mat(fitM))));
    if (beams.length) {   // the slats of light: additive, bright at the grille, fading out
      const b = { pos: [], uv: [], col: [] };
      for (const [p0, p1, p2, p3, c, kind, w] of beams) {
        const tint = (k) => () => c.map((v) => v * k);
        if (kind === 'up') { const dz = w; quad([p0, p1, [p2[0], p2[1], p2[2] + dz * 0], p3], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], b, tint(0.35)); quad([[p0[0], p0[1], p0[2] + dz], [p1[0], p1[1], p1[2] + dz], [p2[0], p2[1], p2[2] + dz - 0.04], [p3[0], p3[1], p3[2] + dz - 0.04]], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]], b, tint(0.35)); }
        else quad([p0, p1, p2, p3], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], b, tint(0.45));
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); bg.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      const bm = new THREE.Mesh(bg, mat(beamM)); bm.material.side = THREE.DoubleSide; bm.layers.set(1); g.add(bm);
    }
    for (const [w, h, x, y, z, ax, c] of glows) {   // what's beyond each grille: a lit room you can't quite see
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c).multiplyScalar(1.3 * k), side: THREE.DoubleSide, fog: false }));
      noAO(m); m.position.set(x, y, z); if (ax === 'x') m.rotation.y = Math.PI / 2; if (ax === 'y') m.rotation.x = Math.PI / 2; g.add(m);
    }
    return g;
  }

  // ----- the den's end: a carved grille on hinges in a moulded frame, in the den's walnut -----
  const V = { open: false, k: 0, hinge: null, hit: null, inHit: null };
  const vz = (VENT.z0 + VENT.z1) / 2;
  let officeG = null;
  function buildOffice(den) {
    if (officeG) return;
    own(() => {
      officeG = buildHalf(false, api.DEN_EXP); skipAO(ctx.composer.passes.find((p) => p._overrideVisibility)); officeG.visible = false; ctx.world.add(officeG);
      const { part, merge, vc } = den, Y0 = DY, wall = X0 - 0.004, L = [];
      for (const [w, h, z, y] of [[0.05, C + 0.16, VENT.z0 - 0.04, VENT.y0 + C / 2], [0.05, C + 0.16, VENT.z1 + 0.04, VENT.y0 + C / 2], [C + 0.12, 0.06, vz, VENT.y1 + 0.04]])
        L.push(part(new THREE.BoxGeometry(0.035, h, w), '#3a2414', wall - 0.012, Y0 + y, z));
      L.push(part(new THREE.BoxGeometry(0.02, 0.025, C + 0.12), '#4a2e1b', wall - 0.03, Y0 + VENT.y1 + 0.075, vz));
      den.g.add(merge(L, vc({ roughness: 0.55 })));
      // the grille: a fretwork panel (carved lattice and a rosette, cut through), its own frame
      const fret = (() => {
        const t = makeCanvas(128, 128), c = t.ctx;
        c.fillStyle = '#5a3a24'; c.fillRect(0, 0, 128, 128);
        c.globalCompositeOperation = 'destination-out';
        for (let y = 14; y < 120; y += 20) for (let x = 14; x < 120; x += 20) { if (Math.hypot(x - 64, y - 64) < 26) continue; c.beginPath(); c.ellipse(x, y, 6, 6, 0, 0, 7); c.fill(); }
        for (let a = 0; a < 8; a++) { c.beginPath(); c.ellipse(64 + Math.cos(a * Math.PI / 4) * 14, 64 + Math.sin(a * Math.PI / 4) * 14, 7, 3, a * Math.PI / 4, 0, 7); c.fill(); }
        c.globalCompositeOperation = 'source-over';
        c.strokeStyle = 'rgba(30,16,8,.6)'; c.lineWidth = 2; c.strokeRect(5, 5, 118, 118);
        t.tex.needsUpdate = true;
        return t.tex;
      })();
      V.hinge = new THREE.Group(); V.hinge.position.set(wall - 0.02, Y0 + VENT.y0, VENT.z0 + 0.005); den.g.add(V.hinge);
      const pw = C - 0.01, panel = new THREE.Mesh(new THREE.PlaneGeometry(pw, C - 0.01), new THREE.MeshStandardMaterial({ map: fret, alphaTest: 0.5, roughness: 0.6, side: THREE.DoubleSide }));
      panel.rotation.y = -Math.PI / 2; panel.position.set(0, C / 2, pw / 2); V.hinge.add(panel);
      const pf = merge([part(new THREE.BoxGeometry(0.03, C - 0.01, 0.035), '#4a2e1b', 0, C / 2, 0.0175), part(new THREE.BoxGeometry(0.03, C - 0.01, 0.035), '#4a2e1b', 0, C / 2, pw - 0.0175),
        part(new THREE.BoxGeometry(0.03, 0.035, pw), '#4a2e1b', 0, 0.0175, pw / 2), part(new THREE.BoxGeometry(0.03, 0.035, pw), '#4a2e1b', 0, C - 0.0275, pw / 2),
        part(new THREE.SphereGeometry(0.012, 8, 6), '#b8913f', -0.02, C / 2, pw - 0.06)], vc({ roughness: 0.55 }));
      V.hinge.add(pf);
      V.hit = ctx.hitBox(V.hinge, 0.06, C, pw, 0, C / 2, pw / 2, { action: 'duct-vent', reach: 2.4 });
      V.inHit = ctx.hitBox(den.g, 0.1, C, C, X0 + 0.06, Y0 + VENT.y0 + C / 2, vz, { action: 'duct-in', reach: 2.4 });
    });
  }
  function vent(open, quiet) {
    if (V.open === open) return;
    V.open = open;
    if (open) back();
    if (!quiet) { api.snd().clunk({ x: X0 - 0.1, y: DY + 0.3, z: vz }); api.snd().creak({ x: X0 - 0.1, y: DY + 0.3, z: vz }); }
  }

  // ----- the far end, behind the sky: the half there, the grille, the plant room (dressed as the backstage is built) -----
  let B = null;   // { bs, root, place, farG, grille: {...} }
  const back = () => { if (!B) ctx.heli?.edge?.back?.(); return B; };
  const GR = { state: 'on', t: 0, knocks: 0, knockAt: -9, pivot: null, hit: null, downHit: null };
  ctx.dressBackstage = (bsApi) => own(() => {
    const { bs, root } = bsApi;
    const farG = buildHalf(true, bs.look.exposure); farG.matrixAutoUpdate = false; farG.matrix.copy(TM); root.add(farG);
    farG.add(plantRoom());
    // the grille: plain painted steel, louvred, on the corridor's face of the wall (the plan's own space, as the corridor's)
    const P = { x: 33.6, z: 19.1 }, w = 0.7, h = 0.74, paint = new THREE.MeshStandardMaterial({ color: '#8b9095', roughness: 0.55, metalness: 0.35 });
    GR.pivot = new THREE.Group(); GR.pivot.position.set(P.x, 0.02, P.z + 0.012); root.add(GR.pivot);
    const parts = [new THREE.BoxGeometry(w, 0.04, 0.025).translate(0, 0.02, 0), new THREE.BoxGeometry(w, 0.04, 0.025).translate(0, h - 0.02, 0),
      new THREE.BoxGeometry(0.04, h, 0.025).translate(-w / 2 + 0.02, h / 2, 0), new THREE.BoxGeometry(0.04, h, 0.025).translate(w / 2 - 0.02, h / 2, 0)];
    for (let y = 0.07; y < h - 0.05; y += 0.055) parts.push(new THREE.BoxGeometry(w - 0.06, 0.05, 0.006).rotateX(-0.75).translate(0, y, -0.002));
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const y of [0.05, h - 0.05]) parts.push(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 8).rotateX(Math.PI / 2).translate(x, y, 0.013));
    GR.pivot.add(new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), paint));
    GR.hit = ctx.hitBox(root, w, h, 0.12, P.x, h / 2 + 0.02, P.z, { action: 'duct-grille', reach: 2.6 });
    GR.downHit = ctx.hitBox(GR.pivot, w, h, 0.06, 0, h / 2, 0, { action: 'duct-grille-down', reach: 2.6 });
    bs.hits.push(GR.hit, GR.downHit);
    bs.more.push({ minX: P.x - 0.36, maxX: P.x + 0.36, minZ: 18.9, maxZ: P.z + 0.03 });   // (shut or not, it's not a way you walk)
    B = { ...bsApi, farG };
  });
  // The plant room, under the junction's dead end: dark, two air handlers, a fan turning under the grille, a sodium lamp.
  let fan = null;
  function plantRoom() {
    const g = new THREE.Group(), PF = FL - 3.28, x0 = 18.0, x1 = 23.5, z0 = -18.9, z1 = -14.6, top = FL - 0.12, lamp = [19.0, PF + 2.7, -18.75];
    const lit = (x, y, z) => { const d = Math.hypot(x - lamp[0], y - lamp[1], z - lamp[2]), k = Math.max(0, 1 - d / 7.5) ** 1.6; return [0.03 + 0.95 * k, 0.03 + 0.5 * k, 0.035 + 0.16 * k]; };
    const geos = [];
    const box = (w, h, d, x, y, z, color, inward = false) => {
      const b = new THREE.BoxGeometry(w, h, d); if (inward) b.scale(-1, 1, 1);
      b.translate(x, y, z); const nb = b.toNonIndexed(), p = nb.attributes.position, a = new Float32Array(p.count * 3), cc = new THREE.Color(color);
      for (let k = 0; k < p.count; k++) { const L = lit(p.getX(k), p.getY(k), p.getZ(k)); a[k * 3] = cc.r * L[0] * 2; a[k * 3 + 1] = cc.g * L[1] * 2; a[k * 3 + 2] = cc.b * L[2] * 2; }
      nb.setAttribute('color', new THREE.BufferAttribute(a, 3)); geos.push(nb);
    };
    box(x1 - x0, top - PF, z1 - z0, (x0 + x1) / 2, (PF + top) / 2, (z0 + z1) / 2, '#6e6c66', true);   // the room, seen from in
    box(2.0, 1.6, 1.2, 19.4, PF + 0.8, -17.9, '#4d5a52'); box(1.9, 1.5, 1.2, 22.2, PF + 0.75, -17.9, '#4d5a52');
    for (const x of [18.7, 19.4, 20.1, 21.6, 22.3, 23.0]) box(0.04, 1.3, 0.02, x, PF + 0.8, -17.29, '#2e3531');
    box(1.4, 1.2, 1.4, 20.7, PF + 0.6, -15.5, '#59625c');   // the fan's plinth, under the grille
    box(1.2, 0.08, 1.2, 20.7, PF + 1.86, -15.4, '#3c4440');
    for (const [x, z] of [[20.15, -15.95], [21.25, -15.95], [20.15, -14.85], [21.25, -14.85]]) box(0.06, 0.66, 0.06, x, PF + 1.53, z, '#3c4440');
    box(0.5, top - PF - 2.0, 0.5, 18.4, (PF + 2.0 + top) / 2, -15.2, '#8a9096');   // a duct rising out of it
    box(0.12, 0.12, z1 - z0, 23.2, PF + 0.3, (z0 + z1) / 2, '#7a3a2a'); box(0.1, 0.1, z1 - z0, 23.0, PF + 0.55, (z0 + z1) / 2, '#2f5a8a');
    box(0.3, 0.12, 0.08, lamp[0], lamp[1], lamp[2] + 0.05, '#2a2a2a');
    g.add(new THREE.Mesh(mergeGeometries(geos), fitM));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.3), fog: false }));
    bulb.position.set(lamp[0], lamp[1] - 0.06, lamp[2] + 0.1); g.add(bulb);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 0.1, 0.05), fog: false }));
    led.position.set(19.0, PF + 1.2, -17.28); g.add(led);
    // the fan: four blades in a ring, turning (only while you're in the duct's far half)
    fan = new THREE.Group(); fan.position.set(20.7, PF + 1.92, -15.4); g.add(fan);
    const bl = []; for (let k = 0; k < 4; k++) bl.push(new THREE.BoxGeometry(0.5, 0.012, 0.16).rotateX(0.35).translate(0.27, 0, 0).rotateY(k * Math.PI / 2).toNonIndexed());
    const bg = mergeGeometries(bl), bc = new Float32Array(bg.attributes.position.count * 3).fill(0.09); bg.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    fan.add(new THREE.Mesh(bg, fitM));
    fan.userData.led = led;
    return g;
  }

  // ----- you, in it -----
  // Duct space: where you are (x, z), your floor (fy), the way you face (yaw, the office's sense), which half's scene
  // you're in, a tween in or out, the crawl's phase.
  const D = { x: 0, z: 0, fy: FL, eyeH: CRAWL, yaw: 0, pitch: 0, side: 'o', tw: null, phase: 0, step: 0, dist: 0, tick: 2, car: false, set: { x: 0, z: 0 } };
  const bsYaw = () => -Math.PI / 2 + (B ? B.root.rotation.y : 0);
  const W4 = new THREE.Matrix4(), v3 = new THREE.Vector3();
  const toBs = (x, y, z) => { W4.multiplyMatrices(B.root.matrixWorld, TM); return v3.set(x, y, z).applyMatrix4(W4); };
  const fromBs = (x, y, z) => { W4.multiplyMatrices(B.root.matrixWorld, TM).invert(); return v3.set(x, y, z).applyMatrix4(W4); };
  const inMouth = (x, z) => Math.abs(z - (Z0 + 4.5 * C)) < C / 2 && x >= MOUTH && x <= OUT + (GR.state === 'off' ? 0.3 : 0.02) || Math.abs(z - vz) < C / 2 && x >= X0 - 0.25 && x < X0;
  const inside = (x, z) => !!G.at(x, z) || inMouth(x, z);
  const R = 0.17, SAMPLES = [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R], [R * 0.7, R * 0.7], [-R * 0.7, R * 0.7], [R * 0.7, -R * 0.7], [-R * 0.7, -R * 0.7]];
  const ok = (x, z) => SAMPLES.every(([a, b]) => inside(x + a, z + b));
  const floorAt = (x, z) => { const c = G.at(x, z); return c ? FL + floorRel(c, z) : FL; };

  function enter(from) {   // from the den (you stand by the vent) or the corridor (by the grille)
    api.ensure();
    const p = ctx.player, s = D;
    if (from === 'den') {
      Object.assign(s, { x: p.x, z: p.z, fy: DY, eyeH: p.eye, yaw: p.yaw, pitch: p.pitch, side: 'o' });
      s.tw = { t: 0, d: 1.1, a: { x: p.x, z: p.z, fy: DY, eyeH: p.eye, yaw: p.yaw, pitch: p.pitch }, b: { x: X0 + 0.32, z: vz, fy: FL, eyeH: CRAWL, yaw: -Math.PI / 2, pitch: 0 } };
    } else {
      const d = fromBs(p.x, (p.fy || 0) + p.eye, p.z);
      Object.assign(s, { x: d.x, z: d.z, fy: d.y - p.eye, eyeH: p.eye, yaw: p.yaw - bsYaw(), pitch: p.pitch, side: 'b' });
      s.tw = { t: 0, d: 1.2, a: { x: d.x, z: d.z, fy: d.y - p.eye, eyeH: p.eye, yaw: s.yaw, pitch: p.pitch }, b: { x: MOUTH - 0.12, z: Z0 + 4.5 * C, fy: FL, eyeH: CRAWL, yaw: Math.PI / 2, pitch: 0 } };
    }
    Object.assign(p, { seated: false, seat: null });
    S.at = 'duct'; D.dist = 0;
    api.snd().duct('knee', 0.5);
  }
  function leave(to) {   // out into the den, or the corridor
    const s = D;
    s.tw = to === 'den'
      ? { t: 0, d: 1.1, a: { x: s.x, z: s.z, fy: s.fy, eyeH: s.eyeH, yaw: s.yaw, pitch: s.pitch }, b: { x: X0 - 0.6, z: vz, fy: DY, eyeH: EYE, yaw: Math.PI / 2, pitch: -0.1 }, then: to }
      : { t: 0, d: 1.3, a: { x: s.x, z: s.z, fy: s.fy, eyeH: s.eyeH, yaw: s.yaw, pitch: s.pitch }, b: { x: OUT + 0.85, z: Z0 + 4.5 * C, fy: DY, eyeH: EYE, yaw: 0, pitch: 0 }, then: to };   // (turned down the corridor, toward its light: not facing its far wall)
    api.snd().duct('hand', 0.4);
  }
  function finish(to) {
    const p = ctx.player;
    camera.rotation.z = 0;
    api.snd().ductLoops(null);
    if (to === 'den') { S.at = 'den'; Object.assign(p, { fy: DY, eye: EYE }); if (D.car) dropCar(); }
    else { S.at = 'office'; Object.assign(p, { fy: 0, eye: EYE }); }   // behind the sky, on your feet: its own floor walks you
  }
  // A car of yours for the backstage to hang from (floors/world-edge-backstage.js: it's laid out about your car's z).
  function needCar() {
    if (ctx.mine.L) return true;
    if (!back()) return false;
    const L = ctx.lifts.find(ctx.spare);
    if (!L) return false;
    Object.assign(ctx.mine, { L, call: false, goal: null }); L.player = true; L.floor = -3; L.dir = 0; L.doorK = 0; ctx.setLift(L, 'parked');
    D.car = true; B.place(L.z);
    return true;
  }
  function dropCar() { D.car = false; if (!ctx.away && ctx.mine.L) ctx.resetLift(); }
  function toSide(side) {
    const heli = ctx.heli;
    if (heli) heli.stay = true;
    if (side === 'b') { ctx.setFloor(B.bs); B.bs.out = 1; renderer.shadowMap.needsUpdate = true; } else { ctx.resetLift(); D.car = false; }
    if (heli) heli.stay = false;
    D.side = side;
  }
  // Each frame while you're in it: player.js hands your movement here (ctx.climb, through secret-room.js).
  function crawl(dt, keys) {
    const p = ctx.player, sd = D;
    sd.yaw = p.yaw - (sd.side === 'b' ? bsYaw() : 0); sd.pitch = p.pitch;
    let moving = 0, shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (sd.tw) {
      const tw = sd.tw;
      tw.t = Math.min(1, tw.t + dt / tw.d);
      const e = ease(tw.t), down = tw.b.eyeH < tw.a.eyeH, ke = ease(clamp(down ? tw.t / 0.6 : (tw.t - 0.3) / 0.7, 0, 1)), kx = ease(clamp(down ? (tw.t - 0.25) / 0.75 : tw.t / 0.75, 0, 1));
      sd.x = lerp(tw.a.x, tw.b.x, kx); sd.z = lerp(tw.a.z, tw.b.z, kx); sd.fy = lerp(tw.a.fy, tw.b.fy, ke); sd.eyeH = lerp(tw.a.eyeH, tw.b.eyeH, ke);
      sd.yaw = tw.a.yaw + angDiff(tw.a.yaw, tw.b.yaw) * e; sd.pitch = lerp(tw.a.pitch, tw.b.pitch, e);
      if (tw.t >= 1) { sd.tw = null; if (tw.then) { place(); finish(tw.then); return true; } }
    } else {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      if (f || s) {
        const c = G.at(sd.x, sd.z), ahead = G.at(sd.x - Math.sin(sd.yaw) * 0.3 * f, sd.z - Math.cos(sd.yaw) * 0.3 * f);
        const up = ahead && c && FL + floorRel(ahead, sd.z) - sd.fy > 0.25 ? 0.35 : 1;   // a step up the drop: slower, by the rungs
        const sp = (shift ? 1.9 : 1.15) * up * dt, n = Math.hypot(f, s * 0.6);
        const dx = ((-Math.sin(sd.yaw) * f + Math.cos(sd.yaw) * s * 0.6) / n) * sp, dz = ((-Math.cos(sd.yaw) * f - Math.sin(sd.yaw) * s * 0.6) / n) * sp;
        const x0 = sd.x, z0 = sd.z;
        if (ok(sd.x + dx, sd.z + dz)) { sd.x += dx; sd.z += dz; } else if (ok(sd.x + dx, sd.z)) sd.x += dx; else if (ok(sd.x, sd.z + dz)) sd.z += dz;
        // the ends: the den's vent (pushed open from inside if it's shut), the corridor's grille (knocked out)
        if (Math.abs(sd.z - vz) < C / 2 && sd.x < X0 + 0.12 && dx < 0) { if (!V.open) { vent(true); sd.x = X0 + 0.12; } else if (sd.x < X0 + 0.02) leave('den'); }
        if (Math.abs(sd.z - (Z0 + 4.5 * C)) < C / 2 && sd.x > MOUTH - 0.05 && dx > 0) {
          if (GR.state === 'on') { sd.x = Math.min(sd.x, MOUTH - 0.05); knock(); } else if (GR.state === 'off' && sd.x > MOUTH + 0.1) leave('corridor');
        }
        moving = Math.hypot(sd.x - x0, sd.z - z0);
        // the join: which scene your eye's in
        const row = Math.abs(sd.z - ZC) < C / 2;
        if (row && sd.side === 'o' && sd.x >= XC) { if (needCar()) toSide('b'); else sd.x = XC - 0.01; }
        else if (row && sd.side === 'b' && sd.x < XC) toSide('o');
        if (sd.side === 'o' && sd.x > X0 + 4 * C && sd.z > ZC - C / 2) needCar();
        else if (sd.side === 'o' && sd.car && sd.z < ZC - 2 * C) dropCar();
      }
      sd.fy = damp(sd.fy, floorAt(sd.x, sd.z), 7, dt);
      sd.eyeH = damp(sd.eyeH, CRAWL, 6, dt);
    }
    // the crawl: a hand and a knee each half stride, a sway from side to side, a dip at each
    sd.phase += moving / 0.32 * Math.PI;
    if (moving) {
      const st = Math.floor(sd.phase / Math.PI);
      if (st !== sd.step) { sd.step = st; api.snd().duct(st % 2 ? 'knee' : 'hand', (shift ? 0.32 : 0.22) * (st % 2 ? 1 : 0.8)); }
      sd.dist += moving;
      if (sd.dist > 4 + Math.random() * 4) { sd.dist = 0; api.snd().duct('boom', 0.25); }
    }
    sd.tick -= dt;
    if (sd.tick < 0) { sd.tick = 2 + Math.random() * 5; api.snd().duct('tick', 0.12 + Math.random() * 0.15); }
    place(Math.abs(Math.sin(sd.phase)) * (moving ? 1 : 0.15));
    return true;
  }
  let bob = 0, roll = 0;
  function place(k = 0) {   // you, where the duct has you, in whichever scene you're in
    const p = ctx.player, sd = D, b = sd.side === 'b';
    bob = damp(bob, k, 10, 1 / 60); roll = damp(roll, k ? Math.sin(sd.phase) : 0, 8, 1 / 60);
    const crouch = clamp((EYE - sd.eyeH) / (EYE - CRAWL), 0, 1), y = sd.fy + sd.eyeH + (0.022 * bob - 0.01) * crouch;
    const w = b && B ? toBs(sd.x, y, sd.z) : v3.set(sd.x, y, sd.z), yaw = sd.yaw + (b ? bsYaw() : 0);
    Object.assign(p, { x: w.x, z: w.z, yaw, pitch: clamp(sd.pitch, -1.3, 1.3), eye: sd.eyeH, fy: w.y - sd.eyeH, seated: false, seat: null });
    ctx.setCam({ x: w.x, y: w.y, z: w.z, yaw, pitch: p.pitch });
    camera.rotation.z = 0.022 * roll * crouch;
    sd.set = { x: p.x, z: p.z };
  }
  function knock() {
    const t = performance.now() / 1000;
    if (t - GR.knockAt < 0.45) return;
    GR.knockAt = t; GR.knocks++;
    api.snd().duct('knee', 0.55); api.snd().duct('tick', 0.4);
    GR.rattle = 1;
    if (GR.knocks >= 2) popGrille();
  }
  function popGrille() {
    if (GR.state !== 'on') return;
    GR.state = 'falling'; GR.t = 0; GR.knocks = 0;
    setTimeout(() => { if (B) { const c = B.root.localToWorld(new THREE.Vector3(33.6, 0.1, 19.6)); api.snd().clatter(c); } }, 260);
  }
  function grilleBack() { if (GR.state === 'off') { GR.state = 'rising'; GR.t = 0; api.snd().duct('tick', 0.4); } }

  // ----- each frame -----
  const ductLv = { breath: 0, hum: 0, draught: 0, voices: 0 };
  ctx.onFrame((dt) => {
    if (B) skipAO(B.bs.gtao);   // (the backstage's passes are made as it's first drawn)
    // the den's vent swinging, its opening a way in while it's open
    if (V.hinge) {
      V.k = damp(V.k, V.open ? 1 : 0, 4, dt);
      V.hinge.rotation.y = -1.9 * ease(clamp(V.k, 0, 1));
      V.inHit.layers.set(V.open ? 0 : 7);   // (a way in only while it's open: the pointer's ray sees layer 0)
      if (officeG) officeG.visible = S.at === 'duct' || S.at === 'den';   // (behind the grille's fretwork; from the far half, seen through the join)
    }
    // the grille behind the sky: rattling, falling off its clips onto the floor, or put back
    if (GR.pivot) {
      GR.rattle = Math.max(0, (GR.rattle || 0) - dt * 4);
      if (GR.state === 'falling') { GR.t += dt; const u = clamp((GR.t - 0.12) / 0.45, 0, 1); GR.pivot.position.z = 19.112 + Math.min(1, GR.t / 0.12) * 0.04; GR.pivot.rotation.x = Math.PI / 2 * u * u - (u === 1 ? Math.max(0, 0.08 * Math.sin((GR.t - 0.57) * 18) * Math.exp(-(GR.t - 0.57) * 6)) : 0); if (GR.t > 1.3) { GR.state = 'off'; GR.pivot.rotation.x = Math.PI / 2; } }
      else if (GR.state === 'rising') { GR.t += dt; const u = 1 - ease(clamp(GR.t / 0.6, 0, 1)); GR.pivot.rotation.x = Math.PI / 2 * u; GR.pivot.position.z = 19.112 + 0.04 * u; if (GR.t >= 0.6) GR.state = 'on'; }
      else if (GR.state === 'on') GR.pivot.rotation.x = -0.02 * GR.rattle * Math.sin(performance.now() / 18);
      GR.downHit.layers.set(GR.state === 'off' ? 0 : 7);
    }
    if (S.at !== 'duct') {
      if (ductLv.breath) { for (const k in ductLv) ductLv[k] = 0; api.snd().ductLoops(null); }
      post(0);
      return;
    }
    if (fan && D.side === 'b') { fan.rotation.y += dt * 5; fan.userData.led.visible = (performance.now() % 1400) < 700; }
    // sounds: your breath, the hum from the plant room, the draught at an open end, voices beyond the den's grille
    const dPlant = Math.hypot(D.x - (X0 + 13.5 * C), D.z - (Z0 - 9.5 * C)), dDen = Math.hypot(D.x - X0, D.z - vz), dOut = Math.hypot(D.x - MOUTH, D.z - (Z0 + 4.5 * C));
    const dVoice = Math.hypot(D.x - (X0 + 4.5 * C), D.z - (Z0 + 4.5 * C));
    Object.assign(ductLv, { breath: 0.09, hum: 0.025 + 0.22 * Math.max(0, 1 - dPlant / 9), draught: 0.12 * Math.max(0, 1 - dDen / 4) * (V.open ? 1 : 0.2) + 0.12 * Math.max(0, 1 - dOut / 4) * (GR.state === 'off' ? 1 : 0.3),
      voices: 0.07 * Math.max(0, 1 - dVoice / 7) });
    api.snd().ductLoops(ductLv);
    // the den's end eases the office's bloom and grade to the backstage's over the duct's first metre, so they're its at the join
    S.ek = D.side === 'b' ? 1 : clamp((D.x - X0) / 1.2, 0, 1) * (D.tw && D.tw.then === 'den' ? 1 - D.tw.t : 1);
    post(D.side === 'b' ? 0 : ease(S.ek));
  }, 85);
  let bloom0 = null, postK = 0;
  function post(k) {   // (only while it's ours to set: back to the office's own as you leave)
    if (k === postK) return;
    postK = k; bloom0 ??= ctx.bloom.strength;
    const L = B?.bs.look || { bloom: 1, grade: 1 };
    ctx.bloom.strength = bloom0 * lerp(1, L.bloom, k); ctx.grade.uniforms.amount.value = lerp(1, L.grade, k);
  }
  // Walking into the den's open vent, or the corridor's open duct, facing it: in you go.
  ctx.onFrame(() => {
    const p = ctx.player, k = ctx.keys;
    if (ctx.mode !== 'free' || p.seated || !(k.has('KeyW') || k.has('ArrowUp'))) return;
    if (S.at === 'den' && V.open && p.x > X0 - 0.75 && Math.abs(p.z - vz) < 0.3 && Math.abs(angDiff(p.yaw, -Math.PI / 2)) < 0.9) enter('den');
    else if (S.at === 'office' && B && ctx.away === B.bs && GR.state === 'off') {
      const d = fromBs(p.x, 1, p.z);
      if (d.x > OUT && d.x < OUT + 0.75 && Math.abs(d.z - (Z0 + 4.5 * C)) < 0.3 && Math.abs(angDiff(p.yaw - bsYaw(), Math.PI / 2)) < 0.9) enter('corridor');
    }
  }, 86);
  // The join: each half shows the other through it (only near enough to see it).
  let portO = null, portB = null, shadowed = false;
  const flip = new THREE.Matrix4().makeRotationY(Math.PI), HO = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(XC, FL + 0.59, ZC);   // (1 cm round the duct: the portal's box hides behind its walls)
  const HOb = HO.clone().multiply(flip), TH = new THREE.Matrix4(), THb = new THREE.Matrix4();
  ctx.onFrame(() => {
    const nearO = S.at === 'duct' && D.side === 'o' && D.x > X0 + 4 * C && D.z > ZC - 1.5 * C, nearB = S.at === 'duct' && D.side === 'b' && D.x < XC + 6.2 * C && D.z > ZC - C / 2;
    if (!B || !(nearO || nearB)) { portO?.hide(); portB?.hide(); return; }
    if (!portO) { portO = makePortal(ctx, { w: C + 0.02, h: C + 0.02, flat: true }); portB = makePortal(ctx, { w: C + 0.02, h: C + 0.02, flat: true }); portO.mesh.userData.secret = true; ctx.scene.add(portO.mesh); B.bs.scene.add(portB.mesh); }   // (secret: drawn when the office overhead isn't)
    TH.multiplyMatrices(B.root.matrixWorld, TM).multiply(HO); THb.copy(TH).multiply(flip);
    // (the backstage's shadow maps are drawn with its first look: what's lit by them can't be drawn before they are)
    if (nearO) { portB.hide(); portO.draw({ here: HO, there: TH, scene: B.bs.scene, k: B.bs.look.exposure / renderer.toneMappingExposure, prepare: () => { if (!shadowed) { shadowed = true; renderer.shadowMap.needsUpdate = true; } return null; } }); }
    else { portO.hide(); portB.draw({ here: THb, there: HOb, scene: ctx.scene, k: api.DEN_EXP / B.bs.look.exposure, prepare: () => {   // (and leave a shadow update that's due alone: it's the backstage's own, for its frame)
      const was = renderer.shadowMap.needsUpdate, undo = api.hideOverhead(); renderer.shadowMap.needsUpdate = false;
      return () => { undo(); renderer.shadowMap.needsUpdate = was; };
    } }); }
  }, 193);

  // ----- pointing and clicking -----
  ctx.hoverTargets(() => (V.hinge && (S.at === 'den' || (S.at === 'duct' && D.side === 'o')) ? [V.hit, V.inHit] : []), 44);
  ctx.action('duct-vent', { hover: () => (V.open ? '<b>A vent</b><div class="k">Click to shut it</div>' : '<b>A vent</b>'), click: () => vent(!V.open) });
  ctx.action('duct-in', { hover: () => '<b>A duct</b><div class="k">Click (or walk in) to crawl in · W/S, Shift to scramble</div>', click: () => { if (S.at === 'den') enter('den'); } });
  ctx.action('duct-grille', {
    hover: () => (GR.state === 'off' ? '<b>A duct</b><div class="k">Click (or walk in) to crawl in</div>' : '<b>A vent grille</b><div class="k">Click to pull it off</div>'),
    click: () => { if (GR.state === 'on') popGrille(); else if (GR.state === 'off') enter('corridor'); },
  });
  ctx.action('duct-grille-down', { hover: () => '<b>A vent grille</b><div class="k">Click to put it back</div>', click: () => grilleBack() });

  return {
    buildOffice, crawl,
    get officeG() { return officeG; },
    below: { colliders: [], ground: () => D.fy },
    // Has something else moved you (the menu, a teleport, another floor)?
    lost: () => !D.tw && (Math.hypot(ctx.player.x - D.set.x, ctx.player.z - D.set.z) > 0.3 || ctx.away !== (D.side === 'b' ? B?.bs : null)),
    reset() { D.tw = null; D.car = false; camera.rotation.z = 0; S.ek = 0; post(0); api.snd().ductLoops(null); portO?.hide(); portB?.hide(); },
    save: () => (D.tw ? false : { den: 'duct', x: Math.round(D.x * 100) / 100, z: Math.round(D.z * 100) / 100 }),
    restore(s) {
      vent(true, true); V.k = 1;
      let x = +s.x, z = +s.z;
      if (!(G.at(x, z) && !G.at(x, z).bs && ok(x, z))) { x = X0 + 0.32; z = vz; }
      Object.assign(D, { x, z, fy: floorAt(x, z), eyeH: CRAWL, yaw: ctx.player.yaw, pitch: ctx.player.pitch, side: 'o', tw: null });
      S.at = 'duct';
      if (x > X0 + 4 * C && z > ZC - C / 2) needCar();
      place();
    },
    debug: {
      D, G, V, GR, vent: (open = true) => { api.ensure(); vent(open, true); V.k = open ? 1 : 0; },
      duct(x, z, yaw = 0, pitch = 0) {
        api.ensure();
        const c = G.at(x, z);
        if (!c) return false;
        if (c.bs) { if (!needCar()) return false; if (ctx.away !== B.bs) toSide('b'); } else if (ctx.away) return false;
        vent(true, true); V.k = 1;
        Object.assign(D, { x, z, fy: floorAt(x, z), eyeH: CRAWL, yaw, pitch, side: c.bs ? 'b' : 'o', tw: null });
        Object.assign(ctx.player, { seated: false, seat: null });
        S.at = 'duct'; place();
        return true;
      },
      corridor(x, z, yaw = 0, pitch = 0) {
        if (!back() || !needCar()) return false;
        if (ctx.away !== B.bs) toSide('b');
        S.at = 'office';
        const w = B.root.localToWorld(new THREE.Vector3(x, 0, z));
        Object.assign(ctx.player, { x: w.x, z: w.z, yaw: yaw + B.root.rotation.y, pitch, fy: 0, eye: EYE, seated: false, seat: null });
        ctx.setCam({ x: w.x, y: EYE, z: w.z, yaw: ctx.player.yaw, pitch });
        return true;
      },
      grille(off = true) { if (off && GR.state === 'on') { GR.state = 'off'; GR.pivot.rotation.x = Math.PI / 2; GR.pivot.position.z = 19.152; } else if (!off) { GR.state = 'on'; GR.pivot.rotation.x = 0; GR.pivot.position.z = 19.112; } },
    },
  };
}
