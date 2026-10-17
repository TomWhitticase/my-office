// The kettle that's a house (floors/kettle.js): a giant blue enamel kettle standing in the snow at the lake's edge, chipped
// and dark in its creases, its lid's wooden knob on top, a wire handle arching overhead with a wooden grip, the spout
// curling up to the right, steaming (the stove's pipe runs into it), a lantern hanging off its tip, a pennant on the lid.
// A door in its belly at the top of a wooden stair. Inside: round, warm, lined with planks; a little iron stove glowing, a
// table set for tea, stools, a rug, shelves of jars, small paintings round the wall; a ladder up into the lid, where a loft
// has a chair at a round window looking out across the ice. Its light is baked (no lamp of its own, so nothing in the
// village is lit through its walls), flickering with the stove.
// Built in its own frame (kettle at the origin, its door toward +z turned by DOOR_A); kettle.js walks you through it.

import * as THREE from 'three';
import { parts, limb, paint } from './kettle-world.js';
import { makeCanvas } from '../util.js';

// Its outer profile, [radius, height] from the bottom up to the top of the lid; and what's what in it.
// Taller than it's wide, nearly straight-sided, a high domed lid (as the picture's).
const PROFILE = [[3.55, 0], [4.05, 0.3], [4.35, 1.1], [4.48, 2.6], [4.5, 3.6], [4.42, 5.2], [4.15, 6.6], [3.7, 7.7], [3.3, 8.3], [3.42, 8.38], [3.36, 8.55], [3.15, 9.5], [2.7, 10.5],
  [2.0, 11.25], [1.1, 11.7], [0.001, 11.85]];
// R0: the wall's face at the door (the landing and stair go out from it); in: as far as you go inside; loftR: up in the loft
export const K = { floor: 1.2, loft: 6.0, thick: 0.2, DOOR_A: -0.2, doorW: 1.3, doorH: 2.35, WIN_A: 1.25, winY: 7.55, winR: 0.42, R0: 4.45, belly: 4.5, inR: 3.85, loftR: 3.45 };
const TAU = Math.PI * 2;

// the profile resampled every ~12 cm, with its outward normals; r(y): the outer radius at a height (below the lid)
function sample() {
  const out = [];
  for (let k = 0; k < PROFILE.length - 1; k++) {
    const [r0, y0] = PROFILE[k], [r1, y1] = PROFILE[k + 1], n = Math.max(1, Math.ceil(Math.hypot(r1 - r0, y1 - y0) / 0.12));
    for (let s = 0; s < n; s++) out.push([r0 + (r1 - r0) * s / n, y0 + (y1 - y0) * s / n]);
  }
  out.push(PROFILE.at(-1));
  return out.map(([r, y], k) => {
    const a = out[Math.max(0, k - 1)], b = out[Math.min(out.length - 1, k + 1)], dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1;
    return { r, y, nr: dy / l, ny: -dr / l };
  });
}
export const radiusAt = (y) => {
  for (let k = 0; k < PROFILE.length - 1; k++) { const [r0, y0] = PROFILE[k], [r1, y1] = PROFILE[k + 1]; if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0); }
  return 0;
};

/** A generator (it yields between pieces: see kettle-world.js buildWorld). */
export function* buildKettle(R, { time, puffs, brush }) {
  const g = new THREE.Group(), SEG = 120, prof = sample();
  const hits = [], ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const hole = (phi, y, r) => {
    const dd = ang(phi - K.DOOR_A);
    if (Math.abs(dd) < (K.doorW / 2) / K.R0 && y > K.floor - 0.02 && y < K.floor + K.doorH) return true;
    const dw = ang(phi - K.WIN_A) * r, dy = y - K.winY;
    return dw * dw + dy * dy < (K.winR + 0.05) ** 2;
  };
  // a lathe of the profile (inner: offset in by the wall's thickness, facing in), quads in a hole left out
  function lathe(inner) {
    const P = inner ? prof.map((p) => ({ r: Math.max(0.001, p.r - p.nr * K.thick), y: p.y - p.ny * K.thick })).filter((p, k, all) => all.slice(0, k + 1).some((q) => q.y > K.floor - 0.1)) : prof;
    // (into typed arrays, its normals from the profile's: quick, and smooth round it)
    const NP = inner ? P.map((p, k) => { const q = prof[prof.length - P.length + k]; return { nr: -q.nr, ny: -q.ny }; }) : P;
    const pos = new Float32Array((P.length - 1) * SEG * 18), nor = new Float32Array(pos.length), uv = new Float32Array((P.length - 1) * SEG * 12);
    let n = 0, m = 0;
    const put = (i, j) => {
      const p = P[i], q = NP[i], a = j / SEG * TAU, sa = Math.sin(a), ca = Math.cos(a);
      pos[n] = sa * p.r; pos[n + 1] = p.y; pos[n + 2] = ca * p.r;
      nor[n] = sa * q.nr; nor[n + 1] = q.ny; nor[n + 2] = ca * q.nr; n += 3;
      uv[m++] = j / SEG * 22; uv[m++] = p.y / 2.5;
    };
    for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < SEG; j++) {
      const am = (j + 0.5) / SEG * TAU, ym = (P[i].y + P[i + 1].y) / 2;
      if (P[i].y > 1 && P[i].y < 9 && hole(am, ym, (P[i].r + P[i + 1].r) / 2)) continue;
      if (inner) { put(i, j); put(i + 1, j); put(i, j + 1); put(i, j + 1); put(i + 1, j); put(i + 1, j + 1); }
      else { put(i, j); put(i, j + 1); put(i + 1, j); put(i, j + 1); put(i + 1, j + 1); put(i + 1, j); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, n), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor.slice(0, n), 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv.slice(0, m), 2));
    return geo;
  }

  yield;
  // ----- outside: the enamel, chipped -----
  const enamel = (() => {
    const t = makeCanvas(512, 256), c = t.ctx;
    c.fillStyle = '#66708a'; c.fillRect(0, 0, 512, 256);
    for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '130,146,176' : '34,42,60'},${(R() * 0.14).toFixed(2)})`; c.fillRect(R() * 512, R() * 256, 3 + R() * 12, 1 + R() * 4); }
    for (let k = 0; k < 90; k++) {   // chips: black iron through the blue, a pale rim round each
      const x = R() * 512, y = R() * 256, r = 1 + R() * 4;
      c.fillStyle = 'rgba(200,210,230,.5)'; c.beginPath(); c.ellipse(x, y, r + 1, r * 0.8 + 1, R() * 3, 0, 7); c.fill();
      c.fillStyle = '#1c1e26'; c.beginPath(); c.ellipse(x, y, r, r * 0.8, R() * 3, 0, 7); c.fill();
    }
    for (let k = 0; k < 30; k++) { c.fillStyle = `rgba(90,60,40,${0.08 + R() * 0.12})`; const x = R() * 512; c.fillRect(x, R() * 256, 1 + R() * 3, 20 + R() * 60); }   // rust runs
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.colorSpace = THREE.SRGBColorSpace; t.tex.needsUpdate = true;
    return t.tex;
  })();
  yield;
  const enamelM = new THREE.MeshStandardMaterial({ map: enamel, color: '#c9ccd6', roughness: 0.42, metalness: 0.08 });
  enamelM.onBeforeCompile = (sh) => {   // darker toward the bottom and in the shoulder's shadow, a cool sheen up the sides
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvY = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vY;').replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 2.5, vY)) * mix(1.0, 0.8, smoothstep(7.1, 8.0, vY) * (1.0 - smoothstep(8.1, 8.5, vY)));`);
  };
  enamelM.customProgramCacheKey = () => 'kettle-enamel';
  yield;
  const shell = new THREE.Mesh(lathe(false), enamelM); g.add(shell);
  shell.userData = { action: 'kettle-kettle', reach: 9 }; hits.push(shell);
  yield;
  // the lid's lip, the knob, the pennant
  const P = parts();
  P.add(new THREE.TorusGeometry(3.37, 0.07, 6, 72).rotateX(Math.PI / 2).translate(0, 8.36, 0), '#323a4c');
  P.put(new THREE.SphereGeometry(0.5, 14, 10).scale(1, 1.25, 1), '#a0703e', 0, 12.35, 0);
  P.cyl(0.18, 0.22, 0.3, 0, 11.88, 0, '#2a3040', 12);
  P.add(limb(new THREE.Vector3(-2.05, 10.4, 0.6), new THREE.Vector3(-2.7, 12.9, 0.9), 0.025, 0.02, 5), '#3a3028');
  { const pen = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.42, 0, 0.75, -0.2, 0.02], 3)); pen.computeVertexNormals(); P.put(pen, '#b8463a', -2.68, 12.88, 0.9); }
  // the handle: wire from lugs either side of the shoulder, arching over, the grip of turned wood
  const lug = (s) => { P.box(0.24, 0.5, 0.3, s * 3.72, 7.75, 0, '#2a3040', 0, 0, s * 0.5); };
  lug(-1); lug(1);
  const arch = new THREE.CatmullRomCurve3([[-3.8, 7.9], [-4.3, 9.2], [-4.0, 11.8], [-3.0, 14.0], [-1.7, 14.7], [1.7, 14.7], [3.0, 14.0], [4.0, 11.8], [4.3, 9.2], [3.8, 7.9]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  P.add(new THREE.TubeGeometry(arch, 80, 0.06, 6, false), '#26262c');
  P.add(new THREE.CylinderGeometry(0.2, 0.2, 3.0, 12).rotateZ(Math.PI / 2).translate(0, 14.82, 0), '#8a5a32');
  for (const s of [-1, 1]) P.add(new THREE.TorusGeometry(0.21, 0.03, 5, 12).rotateY(Math.PI / 2).translate(s * 1.5, 14.82, 0), '#3a3028');
  yield;
  // the spout: from low on the right side up and out, narrowing; its tip open
  const sp = new THREE.CatmullRomCurve3([[5.4, 3.4, 0], [6.0, 4.1, 0], [6.4, 5.6, 0], [7.0, 7.6, 0], [7.8, 8.8, 0]].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const spout = new THREE.TubeGeometry(sp, 40, 1, 14, false), pp = spout.attributes.position, c3 = new THREE.Vector3(), q3 = new THREE.Vector3();
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, r = 1.0 * (1 - u) ** 1.3 + 0.32; sp.getPointAt(u, c3);   // (flared into the body, never through to the room inside)
    for (let k = 0; k <= 14; k++) { const n = i * 15 + k; q3.fromBufferAttribute(pp, n).sub(c3).multiplyScalar(r).add(c3); pp.setXYZ(n, q3.x, q3.y, q3.z); }
  }
  spout.computeVertexNormals();
  const spoutM = new THREE.Mesh(spout, enamelM.clone()); spoutM.material.side = THREE.DoubleSide; g.add(spoutM);
  spoutM.userData = { action: 'kettle-kettle', reach: 9 }; hits.push(spoutM);
  const tip = new THREE.Vector3(7.8, 8.8, 0);
  // a lantern on a wire from the spout's tip, lit
  P.add(limb(new THREE.Vector3(7.5, 8.65, 0), new THREE.Vector3(7.5, 7.7, 0), 0.01, 0.01, 3), '#26262c');
  P.cyl(0.14, 0.14, 0.06, 7.5, 7.68, 0, '#26262c', 8);
  P.cyl(0.16, 0.12, 0.06, 7.5, 7.2, 0, '#26262c', 8);
  P.put(new THREE.ConeGeometry(0.17, 0.16, 8), '#26262c', 7.5, 7.75, 0);
  // snow heaped round its foot, and on the shoulder
  P.add(new THREE.TorusGeometry(3.85, 0.5, 6, 48).rotateX(Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.02, 0), '#eceaf2');
  yield;
  // ----- the door: a stair, a landing, the frame, the door on its hinge -----
  const da = K.DOOR_A, dx = Math.sin(da), dz = Math.cos(da), rot = da;
  const at = (r, y, s = 0) => [dx * r + Math.cos(da) * s, y, dz * r - Math.sin(da) * s];
  const radial = (w, h, d, r, y, s, colr) => { const [x, yy, z] = at(r, y, s); P.box(w, h, d, x, yy, z, colr, rot); };
  const R0 = K.R0;
  radial(1.7, 0.12, 1.25, R0 + 0.65, K.floor - 0.06, 0, '#6a4c36');   // the landing
  radial(1.6, 0.04, 1.15, R0 + 0.68, K.floor + 0.02, 0, '#eeebf3');
  for (const s of [-0.75, 0.75]) radial(0.1, K.floor - 0.12, 0.1, R0 + 1.15, (K.floor - 0.12) / 2, s, '#4e3a2c');
  for (let k = 0; k < 5; k++) {   // the stair, down and out: five steps, the last a step up off the snow
    const r = R0 + 1.4 + k * 0.3, y = K.floor - 0.2 * (k + 1);
    radial(1.4, 0.07, 0.3, r, y - 0.035, 0, k & 1 ? '#6a4c36' : '#73543c');
    radial(1.3, 0.03, 0.26, r, y + 0.015, 0, '#eeebf3');
  }
  for (const s of [-0.72, 0.72]) {   // its strings, and a rail on the left
    const a = new THREE.Vector3(...at(R0 + 1.25, K.floor - 0.1, s)), b = new THREE.Vector3(...at(R0 + 2.85, -0.2, s));
    P.add(limb(a, b, 0.06, 0.06, 4), '#4e3a2c');
  }
  P.add(limb(new THREE.Vector3(...at(R0 + 1.2, K.floor + 0.95, -0.75)), new THREE.Vector3(...at(R0 + 3.0, 0.9, -0.75)), 0.03, 0.03, 5), '#5a4030');
  for (const r of [1.2, 2.1, 3.0]) P.add(limb(new THREE.Vector3(...at(R0 + r, Math.max(0, K.floor - (r - 1.2) * 0.67) - 0.1, -0.75)), new THREE.Vector3(...at(R0 + r, K.floor + 0.95 - (r - 1.2) * 0.17, -0.75)), 0.025, 0.025, 4), '#5a4030');
  // the frame: jambs through the wall's thickness, an arched head over it
  const hw = K.doorW / 2;
  for (const s of [-1, 1]) radial(0.12, K.doorH, 0.55, R0, K.floor + K.doorH / 2, s * (hw + 0.06), '#5a3e2c');
  radial(K.doorW + 0.36, 0.14, 0.55, R0 + 0.02, K.floor + K.doorH + 0.07, 0, '#5a3e2c');
  {
    const arc = new THREE.Shape(), r0 = hw + 0.18;
    arc.moveTo(-r0, 0); arc.absarc(0, 0, r0, Math.PI, 0, true); arc.lineTo(hw - 0.02, 0); arc.absarc(0, 0, hw - 0.02, 0, Math.PI, false); arc.closePath();
    const ag = new THREE.ExtrudeGeometry(arc, { depth: 0.12, bevelEnabled: false, curveSegments: 12 }).translate(0, K.floor + K.doorH - hw + 0.05, R0 + 0.29).rotateY(da);
    P.add(ag, '#5a3e2c');
  }
  g.add(P.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, map: brush })));
  // the lantern's glass, glowing
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.42, 8).translate(7.5, 7.44, 0), new THREE.MeshBasicMaterial({ color: '#ffc874' }));
  g.add(lamp);
  // the door itself: planks, round-headed, on a hinge at its left
  const door = new THREE.Group();
  {
    const s = new THREE.Shape(), w = K.doorW - 0.06, h = K.doorH - 0.04, sp2 = h - w / 2;
    s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, sp2); s.absarc(w / 2, sp2, w / 2, 0, Math.PI, false); s.closePath();
    const DP = parts();
    DP.add(new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false, curveSegments: 10 }), '#6e4a30');
    for (let k = 1; k < 5; k++) DP.box(0.012, sp2 - 0.1, 0.01, k * w / 5, sp2 / 2 + 0.05, 0.075, '#3e2a1c');
    DP.box(w - 0.1, 0.08, 0.02, w / 2, 0.4, 0.08, '#3a3a40'); DP.box(w - 0.1, 0.08, 0.02, w / 2, sp2 - 0.2, 0.08, '#3a3a40');
    DP.put(new THREE.TorusGeometry(0.07, 0.015, 5, 12), '#c8a050', w - 0.18, 1.0, 0.1);
    DP.put(new THREE.CircleGeometry(0.12, 12), '#2a2a30', w / 2, sp2 + 0.08, 0.072);   // a little round peep window, dark
    const dm = DP.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, map: brush }));
    dm.position.set(0, 0, 0); door.add(dm);
    dm.userData = { action: 'kettle-door', reach: 4 }; hits.push(dm);
    const [hx, , hz] = at(R0 + 0.05, 0, -hw + 0.03);
    door.position.set(hx, K.floor + 0.02, hz); door.rotation.y = da;
    g.add(door);
  }

  yield;
  // ----- inside: baked warm light, flickering with the stove -----
  const STOVE = new THREE.Vector3(Math.sin(1.45) * 3.0, 1.9, Math.cos(1.45) * 3.0), LAMP = new THREE.Vector3(-1.2, 2.3, -0.8), LOFT = new THREE.Vector3(0.6, 7.2, -0.4);
  const bv = new THREE.Vector3(), base = new THREE.Color(), warm = new THREE.Color('#ffb46a');
  function bake(geo, c) {
    geo = paint(geo, c);
    const p = geo.attributes.position, cl = geo.attributes.color;
    for (let i = 0; i < p.count; i++) {
      bv.fromBufferAttribute(p, i); base.setRGB(cl.getX(i), cl.getY(i), cl.getZ(i));
      const ds = bv.distanceTo(STOVE), dl = bv.distanceTo(LAMP), dt2 = bv.distanceTo(LOFT);
      const k = 0.3 + 1.5 / (1 + ds * ds * 0.18) + 0.8 / (1 + dl * dl * 0.35) + 0.7 / (1 + dt2 * dt2 * 0.4) - Math.max(0, bv.y - 8) * 0.06;
      const w = Math.min(1, k * 0.55);
      cl.setXYZ(i, base.r * k * (1 - w * 0.25) + warm.r * w * 0.1, base.g * k * (1 - w * 0.35) + warm.g * w * 0.06, base.b * k * (1 - w * 0.55));
    }
    return geo;
  }
  const I = { P: [], put(geo, c, x = 0, y = 0, z = 0, ry = 0) { if (ry) geo.rotateY(ry); I.P.push(bake(geo.translate(x, y, z), c)); } };
  const box = (w, h, d, x, y, z, c, ry = 0) => I.put(new THREE.BoxGeometry(w, h, d), c, x, y, z, ry);
  const cyl = (r0, r1, h, x, y, z, c, seg = 12) => I.put(new THREE.CylinderGeometry(r1, r0, h, seg), c, x, y, z);
  // the planked lining (its own texture), the floor, the loft's floor with its hatch
  const planks = (() => {
    const t = makeCanvas(256, 256), c = t.ctx;
    for (let k = 0; k < 8; k++) { const v = R(); c.fillStyle = `rgb(${128 + v * 34},${96 + v * 26},${72 + v * 18})`; c.fillRect(k * 32, 0, 32, 256); c.fillStyle = 'rgba(50,30,20,.6)'; c.fillRect(k * 32, 0, 2, 256); }
    for (let k = 0; k < 500; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '70,44,28' : '200,160,110'},${R() * 0.2})`; c.fillRect(R() * 256, R() * 256, 1 + R() * 2, 6 + R() * 30); }
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.colorSpace = THREE.SRGBColorSpace; t.tex.needsUpdate = true;
    return t.tex;
  })();
  yield;
  const inM = new THREE.MeshBasicMaterial({ vertexColors: true, map: planks, color: '#ffffff' });
  const lining = new THREE.Mesh(bake(lathe(true), '#b09a88'), inM); g.add(lining);
  yield;
  I.put(new THREE.RingGeometry(0.02, K.inR + 0.45, 64, 6).rotateX(-Math.PI / 2), '#8a6446', 0, K.floor + 0.005, 0);
  {   // the loft's floor: a disc with the hatch cut out, a little thick
    const s = new THREE.Shape(); s.absarc(0, 0, radiusAt(K.loft) - K.thick - 0.02, 0, TAU, false);
    const h = new THREE.Path(); h.moveTo(-0.55, -1.95); h.lineTo(-0.55, -3.05); h.lineTo(0.55, -3.05); h.lineTo(0.55, -1.95); h.closePath(); s.holes.push(h);
    I.put(new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false, curveSegments: 48 }).rotateX(Math.PI / 2).translate(0, K.loft, 0), '#7a5638');
    for (let k = 0; k < 6; k++) box(0.12, 0.16, 2 * Math.sqrt(Math.max(0.1, (radiusAt(K.loft - 0.2) - 0.45) ** 2 - ((k - 2.5) * 1.1) ** 2)), (k - 2.5) * 1.1, K.loft - 0.22, 0, '#5a3e2c');
    // a rail round the hatch, on its three open sides
    for (const [w, d, x, z, h] of [[1.2, 0.05, 0, -1.9, 0.05], [0.04, 1.1, -0.6, -2.5, 0.04], [0.04, 1.1, 0.6, -2.5, 0.04]]) { box(w, h, d, x, K.loft + 0.85, z, '#5a3e2c'); }
    for (const [x, z] of [[-0.6, -1.9], [0.6, -1.9]]) box(0.06, 0.85, 0.06, x, K.loft + 0.425, z, '#5a3e2c');
  }
  // the ladder, up through the hatch at the back (+z side of the hatch is toward the wall)
  const LAD = { x: 0, z: -2.65 };
  for (const s of [-0.24, 0.24]) box(0.06, K.loft - K.floor + 1.0, 0.07, LAD.x + s, (K.floor + K.loft + 1.0) / 2, LAD.z, '#7a5638');
  for (let y = K.floor + 0.3; y < K.loft + 0.9; y += 0.3) box(0.42, 0.04, 0.045, LAD.x, y, LAD.z, '#8a6446');
  // the stove: round, black, legs, its door glowing (the glow's its own mesh), a pipe up and out into the spout, a little kettle on top
  const sx = STOVE.x, sz = STOVE.z;
  cyl(0.42, 0.42, 0.8, sx, K.floor + 0.62, sz, '#2a2628', 16);
  cyl(0.47, 0.47, 0.06, sx, K.floor + 1.05, sz, '#1e1c1e', 16);
  for (let k = 0; k < 3; k++) { const a = k * 2.09; box(0.06, 0.24, 0.06, sx + Math.sin(a) * 0.3, K.floor + 0.12, sz + Math.cos(a) * 0.3, '#1e1c1e'); }
  I.put(limb(new THREE.Vector3(sx, K.floor + 1.08, sz), new THREE.Vector3(sx, K.floor + 1.9, sz), 0.1, 0.1, 10), '#2a2628');
  I.put(limb(new THREE.Vector3(sx, K.floor + 1.9, sz), new THREE.Vector3(4.2, 3.2, 0.1), 0.1, 0.1, 10), '#2a2628');
  {   // the small kettle on the stove, blue like the house
    const kg = new THREE.LatheGeometry([[0.001, 0], [0.16, 0.01], [0.2, 0.08], [0.19, 0.17], [0.12, 0.24], [0.06, 0.27], [0.001, 0.29]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
    I.put(kg, '#4c6390', sx - 0.12, K.floor + 1.08, sz + 0.12);
    I.put(limb(new THREE.Vector3(sx + 0.06, K.floor + 1.15, sz + 0.12), new THREE.Vector3(sx + 0.3, K.floor + 1.32, sz + 0.12), 0.035, 0.018, 6), '#4c6390');
  }
  const fireM = new THREE.MeshBasicMaterial({ color: '#ff9a40' });
  const fire = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), fireM);
  {
    const a = Math.atan2(-sx, -sz);   // facing the room
    fire.position.set(sx + Math.sin(a) * 0.425, K.floor + 0.52, sz + Math.cos(a) * 0.425); fire.rotation.y = a; g.add(fire);
    box(0.4, 0.04, 0.03, sx + Math.sin(a) * 0.43, K.floor + 0.67, sz + Math.cos(a) * 0.43, '#141214', a);
    box(0.4, 0.04, 0.03, sx + Math.sin(a) * 0.43, K.floor + 0.37, sz + Math.cos(a) * 0.43, '#141214', a);
    for (let k = -1; k <= 1; k++) box(0.02, 0.26, 0.02, sx + Math.sin(a) * 0.44 + Math.cos(a) * k * 0.1, K.floor + 0.52, sz + Math.cos(a) * 0.44 - Math.sin(a) * k * 0.1, '#141214', a);
    fire.userData = { action: 'kettle-stove', reach: 3 }; hits.push(fire);
  }
  // logs by it
  for (let k = 0; k < 4; k++) I.put(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 7).rotateZ(Math.PI / 2).rotateY(1.45 + 0.6), '#6a4a30', Math.sin(2.1) * 3.6 + (k % 2) * 0.12, K.floor + 0.08 + Math.floor(k / 2) * 0.13, Math.cos(2.1) * 3.6 + (k % 2) * 0.05);
  yield;
  // the rug, the table set for tea, two stools, a lamp on it
  I.put(new THREE.CircleGeometry(1.5, 40).rotateX(-Math.PI / 2), '#8a3a34', -0.9, K.floor + 0.012, -0.4);
  I.put(new THREE.RingGeometry(1.3, 1.42, 40).rotateX(-Math.PI / 2), '#d8b444', -0.9, K.floor + 0.018, -0.4);
  const TB = { x: -1.3, z: -0.8 };
  cyl(0.55, 0.55, 0.05, TB.x, K.floor + 0.72, TB.z, '#7a5638', 20);
  cyl(0.53, 0.53, 0.012, TB.x, K.floor + 0.751, TB.z, '#e8e0d0', 20);   // a cloth
  cyl(0.06, 0.08, 0.66, TB.x, K.floor + 0.37, TB.z, '#5a3e2c', 8);
  cyl(0.3, 0.3, 0.04, TB.x, K.floor + 0.02, TB.z, '#5a3e2c', 12);
  for (const [a, d] of [[0.6, 0.95], [3.4, 0.95]]) { const x = TB.x + Math.sin(a) * d, z = TB.z + Math.cos(a) * d; cyl(0.2, 0.2, 0.05, x, K.floor + 0.45, z, '#8a6446', 12); for (let k = 0; k < 3; k++) box(0.04, 0.45, 0.04, x + Math.sin(k * 2.1) * 0.13, K.floor + 0.22, z + Math.cos(k * 2.1) * 0.13, '#5a3e2c'); }
  {   // a teapot, two cups, a plate of something, the lamp
    const tp = new THREE.LatheGeometry([[0.001, 0], [0.1, 0.01], [0.13, 0.08], [0.1, 0.16], [0.03, 0.19], [0.001, 0.2]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
    I.put(tp, '#e8e0d0', TB.x + 0.1, K.floor + 0.757, TB.z + 0.1);
    for (const [x, z] of [[-0.25, 0.2], [0.25, -0.15]]) { cyl(0.04, 0.05, 0.07, TB.x + x, K.floor + 0.792, TB.z + z, '#c8d4ec', 10); }
    cyl(0.12, 0.12, 0.012, TB.x - 0.15, K.floor + 0.764, TB.z - 0.25, '#e8e0d0', 14);
    for (let k = 0; k < 4; k++) cyl(0.03, 0.03, 0.02, TB.x - 0.15 + Math.sin(k * 1.6) * 0.06, K.floor + 0.78, TB.z - 0.25 + Math.cos(k * 1.6) * 0.06, '#b07a40', 8);
    cyl(0.07, 0.09, 0.05, LAMP.x, K.floor + 0.782, LAMP.z, '#c8a050', 10);
  }
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 1.8, 1), new THREE.MeshBasicMaterial({ color: '#ffd890' }));
  flame.position.set(LAMP.x, K.floor + 0.88, LAMP.z); g.add(flame);
  // shelves of jars on the wall to the left of the door, a cupboard on the right, paintings round the walls
  const onWall = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];
  for (let s = 0; s < 3; s++) {
    const a = -0.95, [x, z] = onWall(a, 4.05 - s * 0.02), y = K.floor + 1.0 + s * 0.5;
    box(1.2, 0.04, 0.28, x, y, z, '#6a4a30', a);
    for (let k = 0; k < 5; k++) { const o = (k - 2) * 0.22, jx = x + Math.cos(a) * o, jz = z - Math.sin(a) * o; cyl(0.06, 0.06, 0.14 + (k % 3) * 0.04, jx, y + 0.1 + (k % 3) * 0.02, jz, ['#c08a40', '#a04a3a', '#e8dcc0', '#6a8a5a', '#d8b444'][k], 8); }
  }
  {
    const a = 2.45, [x, z] = onWall(a, 3.75);
    box(1.0, 1.6, 0.5, x, K.floor + 0.8, z, '#7a5638', a);
    box(0.9, 0.012, 0.01, x - Math.cos(a) * 0.0 + Math.sin(a) * 0.255, K.floor + 1.0, z + Math.cos(a) * 0.255, '#3e2a1c', a);
    I.put(new THREE.SphereGeometry(0.035, 6, 4), '#c8a050', x + Math.sin(a) * 0.27 + Math.cos(a) * 0.25, K.floor + 0.9, z + Math.cos(a) * 0.27 - Math.sin(a) * 0.25);
  }
  const art = [];
  const pics = [[-2.0, 2.6, 0.5, 0.38], [-1.55, 2.0, 0.34, 0.44], [0.6, 2.5, 0.5, 0.36], [3.3, 2.3, 0.42, 0.32], [2.6, 2.6, 0.32, 0.4], [-2.6, 2.4, 0.4, 0.3]];
  for (const [a, y, w, h] of pics) {
    const r = radiusAt(y) - K.thick - 0.045, [x, z] = onWall(a, r), ry = a + Math.PI;
    box(w + 0.07, h + 0.07, 0.03, x, y, z, '#c8a050', ry);
    const [px, pz] = onWall(a, r - 0.018);
    art.push([px, y, pz, ry, w, h]);
  }
  const inside = new THREE.Mesh(mergeAll(I.P), inM.clone()); inside.material.map = brush;
  g.add(inside);
  yield;
  // the little paintings: tiny scenes, one texture
  {
    const t = makeCanvas(512, 256), c = t.ctx, n = art.length;
    for (let k = 0; k < n; k++) {
      const x0 = (k % 3) * 170, y0 = Math.floor(k / 3) * 128, w = 170, h = 128;
      const sk = c.createLinearGradient(0, y0, 0, y0 + h); sk.addColorStop(0, ['#6a6a9a', '#c8a070', '#8a9ac0', '#a07aa0', '#7a8a6a', '#5a6a8a'][k]); sk.addColorStop(1, '#e8e0e8');
      c.fillStyle = sk; c.fillRect(x0, y0, w, h);
      c.fillStyle = '#eeeaf2'; c.fillRect(x0, y0 + h * 0.65, w, h * 0.35);
      if (k % 3 === 0) { c.fillStyle = '#d8b444'; for (let p = 0; p < 10; p++) { const a2 = p * 0.628; c.beginPath(); c.ellipse(x0 + 85 + Math.cos(a2) * 18, y0 + 50 + Math.sin(a2) * 18, 12, 5, a2, 0, 7); c.fill(); } c.fillStyle = '#5a3a1e'; c.beginPath(); c.arc(x0 + 85, y0 + 50, 12, 0, 7); c.fill(); c.strokeStyle = '#4a6a3a'; c.lineWidth = 4; c.beginPath(); c.moveTo(x0 + 85, y0 + 62); c.lineTo(x0 + 80, y0 + 120); c.stroke(); }
      else if (k % 3 === 1) { c.fillStyle = '#4c6390'; c.beginPath(); c.ellipse(x0 + 80, y0 + 80, 30, 34, 0, 0, 7); c.fill(); c.fillRect(x0 + 106, y0 + 52, 30, 10); c.strokeStyle = '#26262c'; c.lineWidth = 2; c.beginPath(); c.arc(x0 + 80, y0 + 50, 26, Math.PI, 0); c.stroke(); }
      else { c.fillStyle = '#9aa0b0'; c.fillRect(x0, y0 + h * 0.7, w, h * 0.3); for (let p = 0; p < 6; p++) { c.fillStyle = '#2a2a3a'; c.fillRect(x0 + 20 + p * 25, y0 + 84 - (p % 2) * 4, 4, 12); c.beginPath(); c.arc(x0 + 22 + p * 25, y0 + 80 - (p % 2) * 4, 3, 0, 7); c.fill(); } }
    }
    t.tex.colorSpace = THREE.SRGBColorSpace; t.tex.needsUpdate = true;
    const geos = art.map(([x, y, z, ry, w, h], k) => {
      const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv, u0 = (k % 3) / 3, v0 = 1 - (Math.floor(k / 3) + 1) / 2;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 3, v0 + uv.getY(i) / 2);
      return geo.rotateY(ry).translate(x, y, z);
    });
    const pm = new THREE.Mesh(mergeAll(geos), new THREE.MeshBasicMaterial({ map: t.tex, color: '#b8a088' }));
    pm.userData = { action: 'kettle-art', reach: 3 }; hits.push(pm);
    g.add(pm);
  }
  yield;
  // up in the loft: a chair at the window, a bed under a quilt, a lantern
  const LF = K.loft;
  {
    const a = K.WIN_A, [x, z] = onWall(a, 2.6), ry = a + Math.PI;
    box(0.5, 0.06, 0.5, x, LF + 0.45, z, '#7a5638', ry);
    box(0.5, 0.6, 0.06, x + Math.sin(ry) * -0.24, LF + 0.78, z + Math.cos(ry) * -0.24, '#7a5638', ry);
    for (const [ox, oz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(0.05, 0.45, 0.05, x + ox, LF + 0.22, z + oz, '#5a3e2c');
    const bx = -1.5, bz = 0.9;
    box(1.0, 0.36, 2.0, bx, LF + 0.18, bz, '#6a4a30', 0.5);
    box(0.92, 0.12, 1.9, bx, LF + 0.42, bz, '#c84a3a', 0.5);
    for (let k = 0; k < 4; k++) box(0.93, 0.015, 0.1, bx + Math.sin(0.5) * (k - 1.5) * 0.45, LF + 0.485, bz + Math.cos(0.5) * (k - 1.5) * 0.45, '#e8dcc0', 0.5);
    box(0.6, 0.12, 0.35, bx - Math.sin(0.5) * 0.7, LF + 0.54, bz - Math.cos(0.5) * 0.7, '#eeeaf2', 0.5);
    cyl(0.08, 0.1, 0.2, LOFT.x, LF + 0.1, LOFT.z, '#3a3a40', 8);
  }
  const loftLamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd890' }));
  loftLamp.position.set(LOFT.x, LF + 0.28, LOFT.z); g.add(loftLamp);
  // the round window: a ring of wood, a cross in it, through the wall's thickness
  {
    const a = K.WIN_A, r = radiusAt(K.winY), tilt = Math.atan2(radiusAt(K.winY - 0.3) - radiusAt(K.winY + 0.3), 0.6), WP = parts();
    const ring = new THREE.Shape(); ring.absarc(0, 0, K.winR + 0.28, 0, TAU, false); const h2 = new THREE.Path(); h2.absarc(0, 0, K.winR - 0.02, 0, TAU, true); ring.holes.push(h2);
    WP.add(new THREE.ExtrudeGeometry(ring, { depth: 0.5, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -0.32).rotateX(-tilt).translate(0, K.winY, r - 0.1).rotateY(a), '#5a3e2c');
    WP.add(new THREE.BoxGeometry(0.04, K.winR * 2 - 0.04, 0.04).rotateX(-tilt).translate(0, K.winY, r - 0.12).rotateY(a), '#4a3424');
    WP.add(new THREE.BoxGeometry(K.winR * 2 - 0.04, 0.04, 0.03).rotateX(-tilt).translate(0, K.winY, r - 0.12).rotateY(a), '#4a3424');
    g.add(WP.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, map: brush })));
  }
  // what's inside you can bump into (in the kettle's frame): [x, z, radius, floor]
  const solids = [[sx, sz, 0.62, K.floor], [TB.x, TB.z, 0.7, K.floor], [LAD.x, LAD.z - 0.1, 0.32, K.floor], [Math.sin(2.45) * 3.75, Math.cos(2.45) * 3.75, 0.65, K.floor], [-1.5, 0.9, 1.15, LF], [0, -2.5, 0.75, LF]];
  return {
    g, hits, door, tip, fire, flame, loftLamp, lamp, inM, inside, solids, LAD, STOVE, TB,
    seat: { name: 'A chair at the window', loft: true, a: K.WIN_A },
    tick(t, stoke) {   // the stove's flicker through everything inside
      const f = 0.9 + 0.06 * Math.sin(t * 9.1) * Math.sin(t * 3.7) + 0.04 * Math.sin(t * 17.3) + stoke * 0.25;
      inM.color.setScalar(f); inside.material.color.setScalar(f);
      fireM.color.setRGB(1, 0.55 + 0.15 * Math.sin(t * 11) + stoke * 0.2, 0.2 + stoke * 0.2);
      flame.scale.y = 1 + 0.15 * Math.sin(t * 13); loftLamp.scale.setScalar(1 + 0.05 * Math.sin(t * 7));
    },
  };
}
function mergeAll(geos) {
  // (all non-indexed, with the same attributes)
  geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const keys = ['position', 'normal', 'uv', 'color'].filter((k) => geos.every((g) => g.attributes[k]));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of keys) {
    const s = geos[0].attributes[k].itemSize, a = new Float32Array(n * s); let o = 0;
    for (const g of geos) { const src = g.attributes[k].array; a.set(src, o); o += src.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, s));
  }
  return out;
}
