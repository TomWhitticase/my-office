// The village's people, dogs and walking sunflowers (floors/kettle.js), small and naive like the picture's: a bell of a
// coat, a round head, a pointed hat or a cap, stick legs and arms. Skaters gliding in loops and lines, leaning into the
// turns; children running about, jumping, pelting each other with snowballs; someone fishing at the hole; an accordion
// player on a barrel by the gateway; people strolling, chatting, walking their dogs. They turn their heads to you as you
// pass, wave when you look at them, and a snowball sets them hopping (and sometimes they throw one back). Dogs trot about,
// sniff, bark, and follow you for a while; pet one and it sits and wags. Out on the snowfields tall sunflowers stroll on
// spindly legs, turning their faces to follow you.
// All instanced: one draw call a part, every matrix set each frame with nothing allocated.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ICE, L } from './kettle-world.js';

const TAU = Math.PI * 2;
const COATS = ['#2c3a64', '#5a3a28', '#a8443a', '#222228', '#5a6a8a', '#3e5a4a', '#7a4a6a', '#8a6a3a'];
const angd = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function buildFolk(R, { scene, heightAt, brush, sound, throwBall }) {
  const lam = (o = {}) => new THREE.MeshLambertMaterial({ map: brush, ...o });
  // ----- who's who -----
  const P = [];
  const person = (o) => P[P.push({ x: 0, z: 0, yaw: 0, y: 0, s: 1, coat: COATS[Math.floor(R() * COATS.length)], hat: R() < 0.35 ? 1 : R() < 0.6 ? 2 : 0, ph: R() * 10,
    head: 0, wave: 0, waved: -99, hop: 0, look: 0, sit: 0, speed: 0, lean: 0, ...o }) - 1];
  // skaters in loops on the ice (cx, cz, r, angular speed); a few crossing in long lines; far ones, small in the haze
  for (const [cx, cz, r, n] of [[24, -33, 5, 3], [36, -16, 7, 2], [30, -40, 9, 3], [50, -58, 13, 3], [38, -86, 11, 2], [76, -62, 15, 3], [96, -86, 9, 2], [60, -112, 12, 2]]) {
    const w = (0.35 + R() * 0.25) * (R() < 0.5 ? 1 : -1) * 4 / r;
    for (let k = 0; k < n; k++) person({ kind: 'loop', cx, cz, r: r * (0.85 + R() * 0.3), w: w * (0.9 + R() * 0.2), a: k * TAU / n + R() * 0.5, skirt: R() < 0.3 });
  }
  for (const [ax, az, bx, bz] of [[18, -28, 92, -68], [30, -14, 40, -120], [70, -20, 110, -100]]) person({ kind: 'line', ax, az, bx, bz, u: R(), v: 0.035 + R() * 0.02 });
  // children on the near snowfield, and one on skis
  const kids = [];
  for (let k = 0; k < 5; k++) kids.push(person({ kind: 'kid', s: 0.68, x: -9 + R() * 6, z: -16 + R() * 6, tx: -8, tz: -12, run: 0, next: R() * 3, hat: k % 2 ? 1 : 2, coat: ['#a8443a', '#2c3a64', '#d8b444', '#3e5a4a', '#7a4a6a'][k] }));
  // strollers on the shore and in the yard behind the wall, and two pairs chatting
  for (const [x0, x1, z0, z1] of [[-6, 12, -20, -6], [-4, 14, -16, -4], [-27, -9, -27.6, -25.6], [-30, -12, -27.4, -25.8]]) person({ kind: 'stroll', box: [x0, x1, z0, z1], x: (x0 + x1) / 2, z: (z0 + z1) / 2, tx: x0, tz: z0, wait: R() * 4 });
  for (const [x, z, a] of [[5.6, -17.6, 0.6], [6.6, -17.0, 0.6 + Math.PI], [-6.8, -20.6, -1.2], [-7.6, -21.1, -1.2 + Math.PI]]) person({ kind: 'chat', x, z, yaw: a, base: a });
  // the fisher at the hole, the accordion player by the gate
  const fisher = person({ kind: 'fish', x: L.hole.x + 1.0, z: L.hole.z + 0.3, yaw: Math.atan2(-1.0, -0.3), base: Math.atan2(-1.0, -0.3), sit: 1, hat: 2, coat: '#5a3a28' });
  const player = person({ kind: 'music', x: -20.2, z: -22.7, yaw: 0.25, base: 0.25, sit: 1, hat: 1, coat: '#2c3a64' });
  // people walking dogs: along the shore, there and back
  const walkers = [];
  for (const [ax, az, bx, bz] of [[-8, -13, 16, -7], [-4, -19, 12, -12], [4, -9, 20, -4]]) { const u = R(); walkers.push(person({ kind: 'dogwalk', ax, az, bx, bz, u, x: ax + (bx - ax) * u, z: az + (bz - az) * u, dir: 1, wait: 0 })); }
  for (const p of P) {   // on their paths from the start (not at the origin, where you arrive, till their first update)
    if (p.kind === 'loop') { p.x = p.cx + Math.cos(p.a) * p.r; p.z = p.cz + Math.sin(p.a) * p.r; }
    if (p.kind === 'line') { p.x = p.ax + (p.bx - p.ax) * p.u; p.z = p.az + (p.bz - p.az) * p.u; }
  }
  const N = P.length;

  // ----- their parts -----
  const coatG = new THREE.LatheGeometry([[0.001, 0], [0.31, 0.0], [0.27, 0.25], [0.2, 0.6], [0.14, 0.86], [0.08, 0.92], [0.001, 0.93]].map(([r, y]) => new THREE.Vector2(r, y)), 10).translate(0, 0.36, 0);
  const headG = new THREE.SphereGeometry(0.13, 10, 8);
  const hatPG = new THREE.ConeGeometry(0.13, 0.46, 9).translate(0, 0.27, 0);
  const hatCG = new THREE.SphereGeometry(0.14, 10, 6, 0, TAU, 0, Math.PI / 2).translate(0, 0.02, 0);
  const legG = new THREE.CylinderGeometry(0.045, 0.04, 0.42, 5).translate(0, -0.21, 0);
  const armG = new THREE.CylinderGeometry(0.04, 0.035, 0.5, 5).translate(0, -0.25, 0);
  const inst = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); return im; };
  const coats = inst(coatG, lam(), N), heads = inst(headG, lam({ color: '#e8cdb0' }), N), hatsP = inst(hatPG, lam(), N), hatsC = inst(hatCG, lam(), N);
  const legs = inst(legG, lam({ color: '#2a2630' }), N * 2), arms = inst(armG, lam(), N * 2);
  const shadows = inst(new THREE.CircleGeometry(0.4, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#6a6488', transparent: true, opacity: 0.28, depthWrite: false }), N + 16);
  const cc = new THREE.Color();
  P.forEach((p, k) => {
    coats.setColorAt(k, cc.set(p.skirt ? '#e0dcd0' : p.coat)); arms.setColorAt(k * 2, cc.set(p.coat)); arms.setColorAt(k * 2 + 1, cc);
    hatsP.setColorAt(k, cc.set(['#2c3a64', '#222228', '#a8443a', '#3e5a4a'][Math.floor(R() * 4)])); hatsC.setColorAt(k, cc.set(['#a8443a', '#d8b444', '#e8e2d4', '#3a3a5a'][Math.floor(R() * 4)]));
  });
  // an accordion, and the fisher's rod tip moves with them (part of the hole's own kit)
  const accordion = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.18), lam({ color: '#a8443a' }));
  scene.add(accordion);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.5, 12), lam({ color: '#6a4a30' }));
  barrel.position.set(player.x, heightAt(player.x, player.z) + 0.25, player.z); scene.add(barrel);

  // ----- dogs -----
  const D = [];
  const dog = (o) => D.push({ x: 0, z: 0, yaw: 0, ph: R() * 10, speed: 0, sit: 0, wag: 0, follow: 0, cool: 0, bark: 3 + R() * 10, tx: 0, tz: 0, colour: ['#6a4a30', '#2a2624', '#e0d8c8', '#a87a4a', '#4a4440'][D.length % 5], s: 0.85 + R() * 0.35, ...o });
  walkers.forEach((w) => dog({ owner: w, x: w.ax, z: w.az }));
  for (const [x, z] of [[-2, -12], [4, -15], [-18, -26.6]]) dog({ x, z, tx: x, tz: z, home: [x, z] });
  const ND = D.length;
  const dBodyG = new THREE.SphereGeometry(1, 10, 8).scale(0.3, 0.15, 0.14);
  const dHeadG = mergeGeometries([new THREE.SphereGeometry(0.1, 8, 6), new THREE.BoxGeometry(0.07, 0.07, 0.12).translate(0, -0.025, 0.1)]);
  const dEarG = new THREE.ConeGeometry(0.04, 0.1, 4).translate(0, 0.05, 0);
  const dLegG = new THREE.CylinderGeometry(0.025, 0.022, 0.24, 4).translate(0, -0.12, 0);
  const dTailG = new THREE.CylinderGeometry(0.018, 0.01, 0.2, 4).translate(0, 0.1, 0);
  const dm = lam();
  const dBody = inst(dBodyG, dm, ND), dHead = inst(dHeadG, dm, ND), dEar = inst(dEarG, lam({ color: '#2a2624' }), ND * 2), dLeg = inst(dLegG, dm, ND * 4), dTail = inst(dTailG, dm, ND);
  D.forEach((d, k) => {
    cc.set(d.colour); dBody.setColorAt(k, cc); dHead.setColorAt(k, cc); dTail.setColorAt(k, cc);
    for (let j = 0; j < 4; j++) dLeg.setColorAt(k * 4 + j, cc);
  });
  // leads: one line per walker and their dog
  const leadG = new THREE.BufferGeometry(); leadG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(walkers.length * 6), 3));
  leadG.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const leads = new THREE.LineSegments(leadG, new THREE.LineBasicMaterial({ color: '#2a2224' })); leads.frustumCulled = false; scene.add(leads);

  // ----- the sunflowers: tall, on two spindly legs, strolling the snowfields -----
  const F = [];
  const stemM = lam({ color: '#4a6a34' }), petalM = lam({ color: '#e8c03a', emissive: '#3a2a04', side: THREE.DoubleSide }), discM = lam({ color: '#5a3a1e' });
  const petalG = (() => {
    const g = [];
    for (let k = 0; k < 18; k++) { const a = k / 18 * TAU, p = new THREE.PlaneGeometry(0.22, 0.75).translate(0, 0.62, 0); p.rotateZ(a); g.push(p.translate(0, 0, (k % 2) * 0.01)); }
    for (let k = 0; k < 12; k++) { const a = (k + 0.5) / 12 * TAU, p = new THREE.PlaneGeometry(0.18, 0.5).translate(0, 0.5, -0.03); p.rotateZ(a); g.push(p); }
    return mergeGeometries(g);
  })();
  const discG = new THREE.CylinderGeometry(0.42, 0.38, 0.12, 18).rotateX(Math.PI / 2);
  const legUG = new THREE.CylinderGeometry(0.05, 0.04, 1.3, 5).translate(0, -0.65, 0), legLG = new THREE.CylinderGeometry(0.04, 0.03, 1.3, 5).translate(0, -0.65, 0);
  const leafG = new THREE.SphereGeometry(1, 8, 4).scale(0.5, 0.06, 0.18).translate(0.48, 0, 0);
  for (const [cx, cz, rx, rz, hgt] of [[36, 12, 14, 7, 5.6], [62, 16, 10, 6, 4.8], [142, -70, 8, 14, 6.4], [150, -102, 10, 9, 5.2], [-2, -66, 10, 8, 5.0]]) {
    const g = new THREE.Group(); scene.add(g);
    const hip = new THREE.Group(); hip.position.y = 2.5; g.add(hip);
    const legsF = [-1, 1].map((s) => { const u = new THREE.Mesh(legUG, stemM); u.position.x = s * 0.12; hip.add(u); const l = new THREE.Mesh(legLG, stemM); l.position.y = -1.3; u.add(l); return { u, l, s }; });
    const stemC = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15, hgt * 0.35, 0.05), new THREE.Vector3(-0.1, hgt * 0.7, 0), new THREE.Vector3(0, hgt, 0.1)]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemC, 12, 0.07, 5), stemM); hip.add(stem);
    const leaves = [0.35, 0.55].map((u, k) => { const lf = new THREE.Mesh(leafG, stemM); stemC.getPointAt(u, lf.position); lf.rotation.y = k * Math.PI; hip.add(lf); return lf; });
    const head = new THREE.Group(); head.position.set(0, hgt + 0.1, 0.1); hip.add(head);
    const disc = new THREE.Mesh(discG, discM), petals = new THREE.Mesh(petalG, petalM); petals.position.z = 0.02; head.add(disc, petals);
    head.scale.setScalar(hgt / 5.5);
    const a0 = R() * TAU; g.position.set(cx + Math.cos(a0) * rx, heightAt(cx + Math.cos(a0) * rx, cz + Math.sin(a0) * rz), cz + Math.sin(a0) * rz);   // (where it is from the start)
    F.push({ g, hip, legs: legsF, leaves, head, cx, cz, rx, rz, a: a0, w: (0.012 + R() * 0.01) * (R() < 0.5 ? 1 : -1), ph: R() * 10, hgt, yaw: 0, look: 0, pit: 0 });
  }

  // ----- each frame -----
  const o = new THREE.Object3D(), part = new THREE.Object3D(), m4 = new THREE.Matrix4(), rootM = new THREE.Matrix4();
  const set = (im, k, parentM, x, y, z, rx, ry, rz, sx = 1, sy = sx, sz = sx) => {
    part.position.set(x, y, z); part.rotation.set(rx, ry, rz); part.scale.set(sx, sy, sz); part.updateMatrix();
    m4.multiplyMatrices(parentM, part.matrix); im.setMatrixAt(k, m4);
  };
  const hide = (im, k) => { m4.makeScale(0, 0, 0); im.setMatrixAt(k, m4); };
  function rootOf(x, y, z, yaw, lean, side, s) { o.position.set(x, y, z); o.rotation.set(lean, yaw, side, 'YXZ'); o.scale.setScalar(s); o.updateMatrix(); rootM.copy(o.matrix); return rootM; }
  let lastT = 0, cool = 0;
  const tg = { x: 0, z: 0 };

  function update(dt, t, me) {   // me: { x, z, fx, fz, look(x, z) => how straight you're looking at it, 0..1 }
    dt = Math.min(dt, 0.1); lastT = t; cool -= dt;
    for (let k = 0; k < N; k++) {
      const p = P[k];
      let px = p.x, pz = p.z, swing = 0, pushL = 0, skate = false, lean = 0, side = 0, armsUp = 0, sitK = p.sit;
      // where they go
      if (p.kind === 'loop') {
        p.a += p.w * dt; px = p.cx + Math.cos(p.a) * p.r; pz = p.cz + Math.sin(p.a) * p.r;
        p.yaw = Math.atan2(-Math.sin(p.a) * Math.sign(p.w), Math.cos(p.a) * Math.sign(p.w)); skate = true; side = -Math.sign(p.w) * 0.18; lean = 0.25;
      } else if (p.kind === 'line') {
        p.u += p.v * dt * (p.back ? -1 : 1); if (p.u > 1) { p.u = 1; p.back = true; } if (p.u < 0) { p.u = 0; p.back = false; }
        px = p.ax + (p.bx - p.ax) * p.u; pz = p.az + (p.bz - p.az) * p.u; p.yaw = Math.atan2((p.bx - p.ax) * (p.back ? -1 : 1), (p.bz - p.az) * (p.back ? -1 : 1)); skate = true; lean = 0.28;
      } else if (p.kind === 'kid' || p.kind === 'stroll' || p.kind === 'dogwalk') {
        let sp = 0;
        if (p.kind === 'kid') {
          p.next -= dt;
          if (p.next < 0) {
            p.next = 1.5 + R() * 3;
            const r = R();
            if (r < 0.25 && cool < 0 && throwBall) {   // a snowball at another child
              const q = kids[Math.floor(R() * kids.length)];
              if (q !== p) { throwBall(p.x, heightAt(p.x, p.z) + 1.0, p.z, q.x, heightAt(q.x, q.z) + 0.7, q.z, 'kid'); p.armT = 0.5; cool = 1.2; }
            } else if (r < 0.4) p.hop = 0.6;
            else { p.tx = -13 + R() * 11; p.tz = -19 + R() * 11; }
          }
          sp = 2.6;
        } else if (p.kind === 'stroll') {
          if (p.wait > 0) p.wait -= dt;
          else if (Math.hypot(p.tx - p.x, p.tz - p.z) < 0.3) { p.wait = 2 + R() * 5; p.tx = p.box[0] + R() * (p.box[1] - p.box[0]); p.tz = p.box[2] + R() * (p.box[3] - p.box[2]); }
          sp = p.wait > 0 ? 0 : 0.9;
        } else {
          if (p.wait > 0) { p.wait -= dt; sp = 0; }
          else {
            p.u += dt * 0.04 * p.dir; if (p.u > 1 || p.u < 0) { p.dir *= -1; p.u = Math.max(0, Math.min(1, p.u)); p.wait = 2 + R() * 4; }
            p.tx = p.ax + (p.bx - p.ax) * p.u; p.tz = p.az + (p.bz - p.az) * p.u; sp = 1.0;
          }
        }
        // stop to look at you a moment if you're close and looking
        const dme = Math.hypot(me.x - p.x, me.z - p.z);
        if (p.kind !== 'kid' && dme < 3.5) sp = 0;
        const dx = p.tx - p.x, dz = p.tz - p.z, dl = Math.hypot(dx, dz);
        if (p.kind === 'dogwalk' && p.wait <= 0 && sp) { p.x = p.tx; p.z = p.tz; p.yaw += angd(Math.atan2((p.bx - p.ax) * p.dir, (p.bz - p.az) * p.dir) - p.yaw) * Math.min(1, dt * 4); p.speed = 0.04 * Math.hypot(p.bx - p.ax, p.bz - p.az); }
        else if (dl > 0.2 && sp) { const st = Math.min(dl, sp * dt); p.x += dx / dl * st; p.z += dz / dl * st; p.yaw += angd(Math.atan2(dx, dz) - p.yaw) * Math.min(1, dt * 5); p.speed = sp; }
        else p.speed = Math.max(0, p.speed - dt * 4);
        px = p.x; pz = p.z; swing = Math.sin(t * (p.kind === 'kid' ? 11 : 6.5) + p.ph) * Math.min(1, p.speed) * 0.6;
      } else if (p.kind === 'chat') {
        p.yaw = p.base + Math.sin(t * 0.4 + p.ph) * 0.15; armsUp = Math.max(0, Math.sin(t * 1.3 + p.ph)) * 0.6;
      } else if (p.kind === 'fish') {
        p.yaw = p.base; armsUp = 0.9 + Math.sin(t * 0.8) * 0.08 + (Math.sin(t * 0.21) > 0.93 ? Math.sin(t * 14) * 0.1 : 0);
      } else if (p.kind === 'music') {
        p.yaw = p.base + Math.sin(t * 0.5) * 0.1;
      }
      p.x = px; p.z = pz;
      // you: heads turn to you, a wave if you're looking at them, close
      const dx = me.x - px, dz = me.z - pz, d = Math.hypot(dx, dz);
      const want = d < 9 ? Math.max(-1.3, Math.min(1.3, angd(Math.atan2(dx, dz) - p.yaw))) : 0;
      p.head += (want - p.head) * Math.min(1, dt * 3);
      if (d < 6 && t - p.waved > 25 && me.look(px, pz) > 0.97 && p.kind !== 'fish') { p.waved = t; p.wave = 2.2; sound?.hello({ x: px, y: 1.4, z: pz }, p.s < 0.8); }
      if (p.wave > 0) p.wave -= dt;
      if (p.hop > 0) p.hop -= dt;
      if (p.armT > 0) p.armT -= dt;
      // the pose
      const ground = p.kind === 'loop' || p.kind === 'line' ? ICE : heightAt(px, pz);
      const hopY = p.hop > 0 ? Math.sin((0.6 - p.hop) / 0.6 * Math.PI) * 0.35 : 0;
      if (skate) { pushL = Math.sin(t * 2.4 + p.ph); swing = 0; }
      const R0 = rootOf(px, ground + hopY - sitK * 0.3, pz, p.yaw, lean * p.s, side, p.s);
      set(coats, k, R0, 0, 0, 0, 0, 0, 0);
      set(heads, k, R0, 0, 1.36, 0, 0, p.head, 0);
      if (p.hat === 1) { set(hatsP, k, R0, 0, 1.44, 0, -0.08, p.head, 0.06); hide(hatsC, k); } else if (p.hat === 2) { set(hatsC, k, R0, 0, 1.43, 0, 0, p.head, 0); hide(hatsP, k); } else { hide(hatsP, k); hide(hatsC, k); }
      for (const s of [-1, 1]) {
        const i = k * 2 + (s > 0 ? 1 : 0);
        if (sitK) set(legs, i, R0, s * 0.1, 0.62, 0.05, -1.4, 0, 0);
        else if (skate) set(legs, i, R0, s * 0.1, 0.42, 0, s * pushL > 0 ? -0.15 : 0.3 * Math.abs(pushL), 0, s * (s * pushL > 0 ? 0.32 * Math.abs(pushL) : 0.04));
        else set(legs, i, R0, s * 0.1, 0.42, 0, swing * s, 0, 0);
        let ax = -swing * s * 0.8, az = s * 0.18;
        if (skate) { ax = 0.5; az = s * 0.35 + pushL * 0.2; }
        if (p.kind === 'music') { ax = -1.2; az = s * (0.5 + 0.25 * Math.sin(t * 2.2)); }
        if (armsUp && s > 0) ax = -armsUp * 1.5;
        if (p.armT > 0 && s > 0) ax = -2.6 + (0.5 - p.armT) * 6;
        if (p.wave > 0 && s > 0) { ax = -2.7; az = 0.4 + Math.sin(t * 12) * 0.35; }
        if (p.hop > 0) { ax = -2.4; az = s * 0.6; }
        set(arms, i, R0, s * 0.16, 1.14, 0, ax, 0, az);
      }
      shadows.setMatrixAt(k, m4.makeTranslation(px, ground + 0.02, pz).scale(o.scale.set(p.s, 1, p.s)));
    }
    // the accordion between the player's hands, breathing
    const mp = P.indexOf(player);
    if (mp >= 0) { const q = P[mp]; accordion.position.set(q.x + Math.sin(q.yaw) * 0.28, heightAt(q.x, q.z) - 0.3 + 0.95, q.z + Math.cos(q.yaw) * 0.28); accordion.rotation.y = q.yaw; accordion.scale.x = 1 + 0.35 * Math.sin(t * 2.2); }
    // dogs
    let li = 0;
    const la = leadG.attributes.position.array;
    for (let k = 0; k < ND; k++) {
      const d = D[k];
      d.cool -= dt; d.bark -= dt;
      let tx = d.tx, tz = d.tz, sp = 0;
      const dme = Math.hypot(me.x - d.x, me.z - d.z);
      if (d.sit > 0) d.sit -= dt;
      if (d.owner) {   // on a lead, a little ahead and to the side
        const w = d.owner, f = w.yaw;
        tx = w.x + Math.sin(f) * 1.1 + Math.cos(f) * 0.5; tz = w.z + Math.cos(f) * 1.1 - Math.sin(f) * 0.5;
        const far2 = Math.hypot(tx - d.x, tz - d.z); sp = 1.6 + far2 * 1.5;
        if (far2 > 4) { d.x = tx; d.z = tz; }   // (never at the end of a lead across the field)
        la[li++] = w.x + Math.sin(f) * 0.2 + Math.cos(f) * 0.25; la[li++] = heightAt(w.x, w.z) + 0.95; la[li++] = w.z + Math.cos(f) * 0.2 - Math.sin(f) * 0.25;
        la[li++] = d.x + Math.sin(d.yaw) * 0.3; la[li++] = heightAt(d.x, d.z) + 0.38 * d.s; la[li++] = d.z + Math.cos(d.yaw) * 0.3;
      } else {
        if (d.follow > 0) {   // following you, a step or two behind
          d.follow -= dt; tx = me.x - me.fx * 1.6 + Math.sin(t * 0.7 + k) * 0.6; tz = me.z - me.fz * 1.6 + Math.cos(t * 0.6 + k) * 0.6; sp = 3.4;
          if (d.follow <= 0) { d.cool = 25 + R() * 20; d.tx = d.home[0] + (R() - 0.5) * 8; d.tz = d.home[1] + (R() - 0.5) * 6; }
        } else {
          if (dme < 5 && d.cool <= 0 && me.on) { d.follow = 18 + R() * 20; sound?.bark({ x: d.x, y: 0.4, z: d.z }, d.s); }
          if (Math.hypot(d.tx - d.x, d.tz - d.z) < 0.3 || R() < dt * 0.05) { d.tx = d.home[0] + (R() - 0.5) * 10; d.tz = d.home[1] + (R() - 0.5) * 7; }
          tx = d.tx; tz = d.tz; sp = 1.3;
        }
      }
      if (d.sit > 0) sp = 0;
      const dx = tx - d.x, dz = tz - d.z, dl = Math.hypot(dx, dz);
      if (dl > 0.35 && sp) { const st = Math.min(dl - 0.3, sp * dt * Math.min(1, dl)); d.x += dx / dl * st; d.z += dz / dl * st; d.yaw += angd(Math.atan2(dx, dz) - d.yaw) * Math.min(1, dt * 6); d.speed = st / Math.max(dt, 1e-4); }
      else { d.speed = Math.max(0, d.speed - dt * 6); if (dme < 4) d.yaw += angd(Math.atan2(me.x - d.x, me.z - d.z) - d.yaw) * Math.min(1, dt * 2); }
      if (d.bark < 0) { d.bark = 6 + R() * 18; if (dme < 30) sound?.bark({ x: d.x, y: 0.4, z: d.z }, d.s); }
      const gy = heightAt(d.x, d.z), run = Math.min(1, d.speed / 2), gait = t * (8 + run * 6) + d.ph, sit = d.sit > 0 ? 1 : 0;
      const R0 = rootOf(d.x, gy + 0.38 * d.s - sit * 0.08 * d.s + Math.abs(Math.sin(gait)) * 0.03 * run, d.z, d.yaw, -sit * 0.35, 0, d.s);
      set(dBody, k, R0, 0, 0, 0, 0, Math.PI / 2, 0);
      const hl = Math.sin(t * 1.3 + d.ph) * 0.25;
      set(dHead, k, R0, 0, 0.13 + sit * 0.05, 0.3, -0.1, hl, 0);
      for (const s of [-1, 1]) set(dEar, k * 2 + (s > 0 ? 1 : 0), R0, s * 0.06, 0.21 + sit * 0.05, 0.28, -0.3, hl, s * 0.5);
      for (let j = 0; j < 4; j++) {
        const fr = j < 2 ? 1 : -1, s = j & 1 ? 1 : -1, sw = Math.sin(gait + (j === 0 || j === 3 ? 0 : Math.PI)) * 0.6 * run;
        set(dLeg, k * 4 + j, R0, s * 0.08, -0.02, fr * 0.18, sit && fr < 0 ? -1.3 : sw, 0, 0);
      }
      const wag = (d.wag > 0 ? 16 : 6) * t;
      if (d.wag > 0) d.wag -= dt;
      set(dTail, k, R0, 0, 0.06, -0.28, -0.9, Math.sin(wag + d.ph) * (d.wag > 0 ? 0.8 : 0.3), 0);
      shadows.setMatrixAt(N + k, m4.makeTranslation(d.x, gy + 0.02, d.z).scale(o.scale.set(d.s * 0.9, 1, d.s * 0.9)));
    }
    leadG.attributes.position.needsUpdate = true;
    // sunflowers
    for (const f of F) {
      f.a += f.w * dt;
      const x = f.cx + Math.cos(f.a) * f.rx, z = f.cz + Math.sin(f.a) * f.rz, dir = Math.atan2(-Math.sin(f.a) * f.rx * Math.sign(f.w), Math.cos(f.a) * f.rz * Math.sign(f.w));
      const gait = f.a * 70 + f.ph, gy = heightAt(x, z);
      f.g.position.set(x, gy, z); f.g.rotation.y = dir;
      f.hip.position.y = 2.5 + Math.abs(Math.sin(gait)) * 0.08;
      for (const L2 of f.legs) { const sw = Math.sin(gait + (L2.s > 0 ? 0 : Math.PI)); L2.u.rotation.x = sw * 0.35; L2.l.rotation.x = Math.max(0, -sw) * 0.7 + 0.08; }
      f.leaves[0].rotation.z = 0.4 + Math.sin(gait * 0.5) * 0.25; f.leaves[1].rotation.z = 0.4 + Math.sin(gait * 0.5 + 1) * 0.25;
      f.hip.rotation.z = Math.sin(gait) * 0.04;
      // its face to you (within reason), up toward you if you're close
      const dx = me.x - x, dz = me.z - z, dd = Math.hypot(dx, dz);
      const want = dd < 90 ? Math.max(-2.2, Math.min(2.2, angd(Math.atan2(dx, dz) - dir))) : Math.sin(lastT * 0.2 + f.ph) * 0.4;
      f.look += (want - f.look) * Math.min(1, dt * 0.8);
      const pit = dd < 90 ? Math.atan2(f.hgt + 2.6 - 1.65, Math.max(dd, 2)) * 0.8 : 0.1;
      f.pit += (pit - f.pit) * Math.min(1, dt);
      f.head.rotation.set(f.pit, f.look, Math.sin(lastT * 0.7 + f.ph) * 0.08, 'YXZ');
    }
    for (const im of [coats, heads, hatsP, hatsC, legs, arms, shadows, dBody, dHead, dEar, dLeg, dTail]) im.instanceMatrix.needsUpdate = true;
  }
  coats.instanceColor.needsUpdate = true;

  // ----- you, them -----
  const hp = new THREE.Vector3();
  return {
    P, D, F, update, fisher,
    /** a person or dog along the ray within reach: { kind: 'dog' | 'person', k, d } */
    pick(ray, reach = 4) {
      let best = null;
      const test = (x, y, z, r, kind, k) => {
        hp.set(x, y, z);
        const d = ray.ray.distanceSqToPoint(hp), along = hp.sub(ray.ray.origin).dot(ray.ray.direction);
        if (d < r * r && along > 0 && along < reach && (!best || along < best.d)) best = { kind, k, d: along };
      };
      for (let k = 0; k < ND; k++) { const d = D[k]; test(d.x, heightAt(d.x, d.z) + 0.38 * d.s, d.z, 0.38 * d.s, 'dog', k); }
      for (let k = 0; k < N; k++) { const p = P[k]; test(p.x, (p.kind === 'loop' || p.kind === 'line' ? ICE : heightAt(p.x, p.z)) + 0.9 * p.s, p.z, 0.45 * p.s, 'person', k); }
      return best;
    },
    pet(k) { const d = D[k]; d.sit = 3; d.wag = 4; d.follow = Math.max(d.follow, 12); d.cool = 0; sound?.happy({ x: d.x, y: 0.4, z: d.z }, d.s); },
    /** something at (x, y, z) hit by a snowball? who */
    hitTest(x, y, z) {
      for (let k = 0; k < N; k++) { const p = P[k], gy = p.kind === 'loop' || p.kind === 'line' ? ICE : heightAt(p.x, p.z); if (Math.hypot(x - p.x, z - p.z) < 0.4 * p.s && y > gy && y < gy + 1.7 * p.s) return { kind: 'person', k }; }
      for (let k = 0; k < ND; k++) { const d = D[k]; if (Math.hypot(x - d.x, z - d.z) < 0.35 * d.s && y < heightAt(d.x, d.z) + 0.6) return { kind: 'dog', k }; }
      for (const f of F) if (Math.hypot(x - f.g.position.x, z - f.g.position.z) < 0.9 && y > f.g.position.y + 2 && y < f.g.position.y + f.hgt + 3.5) return { kind: 'flower', f };
      return null;
    },
    struck(h, me, kid) {   // hopping, laughing; now and then one back at you
      if (h.kind === 'person') {
        const p = P[h.k]; p.hop = 0.6; sound?.laugh({ x: p.x, y: 1.4, z: p.z }, p.s < 0.8);
        if (!kid && throwBall && (p.s < 0.8 || R() < 0.35) && p.kind !== 'fish' && p.kind !== 'music') setTimeout(() => throwBall(p.x, heightAt(p.x, p.z) + 1.1 * p.s, p.z, me.x, null, me.z, 'back'), 700);
      } else if (h.kind === 'dog') { const d = D[h.k]; d.sit = 0; d.follow = 0; d.cool = 15; d.tx = d.x + (d.x - me.x) * 2; d.tz = d.z + (d.z - me.z) * 2; sound?.bark({ x: d.x, y: 0.4, z: d.z }, d.s); }
      else if (h.kind === 'flower') { h.f.ph += 2; h.f.head.rotation.z += 0.5; }
    },
    /** you can't walk through people or dogs */
    push(p) {
      for (let k = 0; k < N; k++) { const q = P[k], dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz), r = 0.45 * q.s + 0.2; if (d < r && d > 1e-4) { p.x = q.x + dx / d * r; p.z = q.z + dz / d * r; } }
      for (const f of F) { const dx = p.x - f.g.position.x, dz = p.z - f.g.position.z, d = Math.hypot(dx, dz); if (d < 0.6 && d > 1e-4) { p.x = f.g.position.x + dx / d * 0.6; p.z = f.g.position.z + dz / d * 0.6; } }
      void tg;
    },
  };
}
