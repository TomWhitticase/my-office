// The thing on the Plain (floors/plain.js), as the painting has it: a dark hunched body, the back higher than the head,
// a pale head wound round in old bandage, stained at the front; four long thin limbs, elbows and knees jutting high,
// ending in long spidery fingers spread on the dust. It walks on them a limb at a time (two-bone IK to feet planted in
// the world, each lifted when the body's left it behind), never quite in step: pairs out of order, hesitations, a lurch,
// the head snapping from one angle to the next. Limbs, fingers and joints are two instanced meshes.
// What it does: crouched in the painting's foreground while you're on B3 (and come up close to the painting and it turns
// its head to you, then scuttles off into the haze); out here, it turns up far off, at the edge of what you can see, and
// watches; creeps nearer; then comes for you, faster and faster, shrieks as it closes, and at the last moment goes
// straight past you, close, and off into the haze; and later comes round again. It never touches you.
// Its own random stream (R): the same each visit for the tests.

import * as THREE from 'three';
import { clamp, damp, lerp, makeCanvas } from '../util.js';

export const POSE = { x: -0.6, z: -13.5, yaw: -Math.PI / 2 };   // where it crouches in the painting
const TAU = Math.PI * 2, SC = 1.5;   // built at 1, shown half again as big
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function makeCrawler(R, events = {}) {
  const root = new THREE.Group(), body = new THREE.Group(), headG = new THREE.Group();
  root.add(body); body.add(headG); root.scale.setScalar(SC);
  // ----- the body: a heavy round back, darker than anything near it, its rump high -----
  const skin = new THREE.MeshStandardMaterial({ color: '#1b130e', roughness: 0.5 });
  // (lumpy, not a ball: the spine down its middle, the ribs and the bulk of it pushing through)
  const lumpy = (g, k) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + k * (Math.sin(x * 7 + z * 3) * Math.sin(y * 5 - z * 4) * 0.6 + Math.sin(z * 13) * 0.25 * Math.max(0, y)) + 0.07 * Math.exp(-x * x * 60) * Math.max(0, y);
    p.setXYZ(i, x * n, y * n, z * n); } g.computeVertexNormals(); return g; };
  const torso = new THREE.Mesh(lumpy(new THREE.SphereGeometry(1, 40, 28), 0.05), skin); torso.scale.set(0.37, 0.35, 0.64); torso.position.set(0, 0.95, -0.2); torso.rotation.x = 0.28;
  const rump = new THREE.Mesh(lumpy(new THREE.SphereGeometry(1, 24, 16), 0.06), skin); rump.scale.set(0.31, 0.3, 0.38); rump.position.set(0, 1.04, -0.5);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.42, 10), skin); neck.position.set(0, 0.78, 0.36); neck.rotation.x = 1.0;
  body.add(torso, rump, neck);
  headG.position.set(0, 0.66, 0.52);
  // the head: bandage wound round and round, grey with dirt in its folds, a raw stain where the face would be
  const bt = makeCanvas(256, 256), c = bt.ctx;
  c.fillStyle = '#e4dccb'; c.fillRect(0, 0, 256, 256);
  for (let y = -20; y < 280; y += 9 + R() * 6) {
    const s = (R() - 0.5) * 30, w = 6 + R() * 8;
    c.fillStyle = `rgba(${R() < 0.5 ? '250,246,236' : '200,190,170'},.7)`; c.beginPath(); c.moveTo(0, y); c.lineTo(256, y + s); c.lineTo(256, y + s + w); c.lineTo(0, y + w); c.fill();
    c.strokeStyle = 'rgba(110,98,80,.55)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, y + w); c.lineTo(256, y + s + w); c.stroke();
  }
  for (let k = 0; k < 1500; k++) { c.fillStyle = `rgba(90,80,64,${R() * 0.12})`; c.fillRect(R() * 256, R() * 256, 1, 1 + R() * 3); }
  const st = c.createRadialGradient(70, 170, 4, 70, 175, 60);   // u 0.25 is its front (+z)
  st.addColorStop(0, 'rgba(176,44,40,.95)'); st.addColorStop(0.5, 'rgba(190,80,70,.6)'); st.addColorStop(1, 'rgba(200,120,100,0)');
  c.fillStyle = st; c.fillRect(0, 100, 150, 156);
  bt.tex.needsUpdate = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), new THREE.MeshStandardMaterial({ map: bt.tex, roughness: 0.95, emissive: '#ffffff', emissiveMap: bt.tex, emissiveIntensity: 0.22 }));
  head.scale.set(0.21, 0.24, 0.25); head.position.set(0, -0.02, 0.13); head.rotation.x = 0.35;
  headG.add(head);
  const shade = makeCanvas(64, 64), sc = shade.ctx, sg = sc.createRadialGradient(32, 32, 2, 32, 32, 31);
  sg.addColorStop(0, 'rgba(20,12,6,.6)'); sg.addColorStop(1, 'rgba(20,12,6,0)'); sc.fillStyle = sg; sc.fillRect(0, 0, 64, 64); shade.tex.needsUpdate = true;
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shade.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  blob.position.y = 0.014; root.add(blob);

  // ----- the limbs: anchors on the body, lengths, where each foot rests, which way its joint bends -----
  const LIMBS = [
    { a: V(0.2, 0.86, 0.24), L: [0.64, 0.8], home: V(0.52, 0, 1.0), pole: V(1, 0.5, -0.5), fingers: 5, pair: 0 },
    { a: V(-0.2, 0.86, 0.24), L: [0.64, 0.8], home: V(-0.52, 0, 1.0), pole: V(-1, 0.5, -0.5), fingers: 5, pair: 1 },
    { a: V(0.24, 0.98, -0.6), L: [0.68, 0.84], home: V(0.6, 0, -0.78), pole: V(1, 1.3, 0.4), fingers: 4, pair: 1 },
    { a: V(-0.24, 0.98, -0.6), L: [0.68, 0.84], home: V(-0.6, 0, -0.78), pole: V(-1, 1.3, 0.4), fingers: 4, pair: 0 },
  ].map((l, i) => ({ ...l, i, foot: V(0, 0, 0), from: V(0, 0, 0), to: V(0, 0, 0), t: -1, dur: 0.3, lift: 0, wait: 0 }));
  const NSEG = LIMBS.reduce((n, l) => n + 2 + l.fingers * 2, 0), NJ = LIMBS.reduce((n, l) => n + 2 + l.fingers, 0);
  const segG = new THREE.CylinderGeometry(0.72, 1, 1, 7, 1).translate(0, 0.5, 0);
  const limbM = new THREE.MeshStandardMaterial({ color: '#86603f', roughness: 0.62, emissive: '#3a2414', emissiveIntensity: 0.4 });
  const segs = new THREE.InstancedMesh(segG, limbM, NSEG), joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), limbM, NJ);
  segs.frustumCulled = joints.frustumCulled = false;
  root.add(segs, joints);

  // ----- moving it -----
  const S = { x: POSE.x, z: POSE.z, yaw: POSE.yaw, speed: 0, want: 0, state: 'posed', t: 0, timer: 0, shrieked: false, pass: null, hx: 0, hy: 0, hr: 0, tw: 0, twAt: 0,
    stopT: 0, lurch: 0, visible: true, seen: 0 };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = V(0, 1, 0), tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), sca = V(1, 1, 1);
  let si = 0, ji = 0;
  const seg = (a, b, r) => {
    tmp.subVectors(b, a); const len = tmp.length();
    Q.setFromUnitVectors(UP, tmp.multiplyScalar(1 / (len || 1)));
    M.compose(a, Q, sca.set(r, len, r)); segs.setMatrixAt(si++, M);
  };
  const joint = (p, r) => { M.compose(p, Q.identity(), sca.set(r, r, r)); joints.setMatrixAt(ji++, M); };
  // to world, from the root's frame (ground under the body, +z ahead)
  const toW = (v, out) => { const c = Math.cos(S.yaw) * SC, s = Math.sin(S.yaw) * SC; return out.set(S.x + v.x * c + v.z * s, v.y * SC, S.z - v.x * s + v.z * c); };
  const toL = (v, out) => { const c = Math.cos(S.yaw) / SC, s = Math.sin(S.yaw) / SC, dx = v.x - S.x, dz = v.z - S.z; return out.set(dx * c - dz * s, v.y / SC, dx * s + dz * c); };
  function plant() { for (const l of LIMBS) { toW(l.home, l.foot); l.t = -1; } }
  plant();

  // Two-bone IK: from a, reaching t, lengths L0 L1, the joint bent toward `pole`: the joint's position into `j`.
  const dv = V(0, 0, 0), pv = V(0, 0, 0);
  function ik(a, t, L0, L1, pole, j) {
    dv.subVectors(t, a); let d = dv.length();
    d = clamp(d, Math.abs(L0 - L1) + 0.01, L0 + L1 - 0.01); dv.normalize();
    const ca = (L0 * L0 + d * d - L1 * L1) / (2 * L0 * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    pv.copy(pole).addScaledVector(dv, -pole.dot(dv)).normalize();
    j.copy(a).addScaledVector(dv, L0 * ca).addScaledVector(pv, L0 * sa);
    // (out of reach: the hand where the arm ends)
    tmp2.subVectors(t, a); if (tmp2.length() > L0 + L1) t.copy(a).addScaledVector(dv, L0 + L1 - 0.01);
  }

  const A = V(0, 0, 0), J = V(0, 0, 0), POLE = V(0, 0, 0), W2 = V(0, 0, 0), P = V(0, 0, 0), F1 = V(0, 0, 0), F2 = V(0, 0, 0), home = V(0, 0, 0), fwd = V(0, 0, 0), side = V(0, 0, 0);
  // The legs for this frame: steps due, steps under way, then every bone.
  function legs(dt, t) {
    const sp = S.speed, stride = (0.3 + sp / SC * 0.11) * SC, lead = Math.min(0.5, 0.18 + sp / SC * 0.03);
    const busy = LIMBS.filter((l) => l.t >= 0), pairBusy = busy.length ? busy[0].pair : -1;
    fwd.set(Math.sin(S.yaw), 0, Math.cos(S.yaw));
    for (const l of LIMBS) {
      toW(l.home, home).addScaledVector(fwd, sp * lead);
      if (l.t < 0) {
        l.wait -= dt;
        const far = l.foot.distanceTo(home);
        if (far > stride * (l.i === 2 ? 1.25 : 1) && l.wait <= 0 && busy.length < 2 && (pairBusy < 0 || pairBusy === l.pair || R() < 0.08)) {
          l.from.copy(l.foot); l.to.copy(home).add(tmp.set((R() - 0.5) * 0.12, 0, (R() - 0.5) * 0.12));
          l.dur = clamp(0.36 - sp / SC * 0.024, 0.08, 0.36) * (0.8 + R() * 0.5); l.t = 0; l.lift = (0.1 + sp / SC * 0.025 + (l.i < 2 ? 0.1 : 0.05)) * SC;
          busy.push(l);
        } else if (far < 0.05 * SC && sp < 0.1) l.wait = R() * 0.2;
      }
      if (l.t >= 0) {
        l.to.lerp(home, Math.min(1, dt * 3));   // (the body's still going)
        l.t += dt / l.dur;
        const u = Math.min(1, l.t), e = u * u * (3 - 2 * u);
        l.foot.lerpVectors(l.from, l.to, e); l.foot.y = Math.sin(Math.PI * u) * l.lift;
        if (l.t >= 1) { l.t = -1; l.foot.y = 0; l.wait = R() < 0.15 ? R() * 0.3 : 0; events.tap?.(l.foot, sp); }
      }
    }
    // the body: low and pitched forward as it runs, rocking with the feet that are up, a slow heave when it's still
    const up = LIMBS.reduce((a, l) => a + l.foot.y, 0) / SC;
    body.position.y = -sp * 0.022 + up * 0.25 + Math.sin(t * 1.3) * 0.012 + S.lurch * 0.05;
    body.rotation.x = sp * 0.012 + (LIMBS[0].foot.y + LIMBS[1].foot.y - LIMBS[2].foot.y - LIMBS[3].foot.y) / SC * 0.35 + S.lurch * 0.1;
    body.rotation.z = (LIMBS[1].foot.y + LIMBS[3].foot.y - LIMBS[0].foot.y - LIMBS[2].foot.y) / SC * 0.5 + Math.sin(t * 0.7) * 0.02;
    body.updateMatrix(); root.updateMatrixWorld(true);
    // every bone, in the root's frame (the instanced meshes are children of root)
    si = 0; ji = 0;
    for (const l of LIMBS) {
      A.copy(l.a).applyMatrix4(body.matrix);
      toL(l.foot, W2); W2.y += 0.07;   // the wrist, just off the ground
      ik(A, W2, l.L[0], l.L[1], POLE.copy(l.pole).normalize(), J);
      seg(A, J, 0.04); seg(J, W2, 0.03); joint(J, 0.042); joint(W2, 0.034);
      // the fingers: splayed ahead and out on the ground; curled in under while the hand's up
      const a0 = Math.atan2(W2.x - A.x, W2.z - A.z), curl = Math.min(1, l.foot.y * 6), n = l.fingers;
      for (let f = 0; f < n; f++) {
        const a = a0 + (f - (n - 1) / 2) * (l.i < 2 ? 0.36 : 0.42), len = (f === 0 || f === n - 1 ? 0.15 : 0.21) * (l.i < 2 ? 1 : 0.85);
        side.set(Math.sin(a), 0, Math.cos(a));
        F1.copy(W2).addScaledVector(side, len * 0.45 * (1 - curl * 0.4)); F1.y = W2.y - 0.025 + curl * 0.02;
        F2.copy(F1).addScaledVector(side, len * 0.55 * (1 - curl * 0.75)); F2.y = Math.max(0.006, F1.y - 0.05 - curl * 0.06);
        seg(W2, F1, 0.011); seg(F1, F2, 0.008); joint(F1, 0.012);
      }
    }
    segs.instanceMatrix.needsUpdate = true; joints.instanceMatrix.needsUpdate = true;
  }

  // The head: its own small jerks, snapping from one angle to the next; looking at `at` (world) when there's something to look at.
  function look(dt, t, at, k) {
    if (t > S.twAt) { S.twAt = t + 0.12 + R() * (S.state === 'chase' || S.state === 'pass' ? 0.25 : 0.9); S.tw = R(); S.hr = (R() - 0.5) * 0.9; }
    const amp = S.state === 'posed' ? 0.3 : 1;
    let yaw = (S.tw - 0.5) * 0.5 * amp, pitch = 0.25 + (S.tw - 0.5) * 0.2 * amp;
    if (at) {
      toL(at, P); const ay = Math.atan2(P.x, P.z - 0.5), ap = -Math.atan2(P.y - 0.7, Math.hypot(P.x, P.z));
      yaw = lerp(yaw, clamp(ay, -1.3, 1.3), k); pitch = lerp(pitch, clamp(ap, -0.6, 0.7), k);
    }
    // not smoothly: most of the way at once, then still
    S.hx = damp(S.hx, yaw, 22, dt); S.hy = damp(S.hy, pitch, 22, dt);
    headG.rotation.set(S.hy, S.hx, S.hr * (S.state === 'posed' ? 0.4 : 1), 'YXZ');
  }

  // ----- what it does -----
  const set = (state, timer = 0) => { S.state = state; S.t = 0; S.timer = timer; };
  const me3 = V(0, 0, 0);
  // Out on the Plain, where you are (me: x, z and which way you face, fx fz).
  function hunt(dt, t, me) {
    const dx = me.x - S.x, dz = me.z - S.z, d = Math.hypot(dx, dz), toMe = Math.atan2(dx, dz);
    let at = me3.set(me.x, 1.6, me.z), lookK = 1;
    switch (S.state) {
      case 'posed': case 'look': set('flee'); break;
      case 'hidden':
        S.want = 0; S.speed = 0;
        if (S.t > S.timer) {   // at the edge of what you can see, ahead of you more or less
          const a = Math.atan2(me.fx, me.fz) + (R() - 0.5) * 1.1, r = 66 + R() * 10;
          S.x = me.x + Math.sin(a) * r; S.z = me.z + Math.cos(a) * r; S.yaw = a + Math.PI; plant();
          set('watch', 3 + R() * 3); events.appear?.(V(S.x, 0.8, S.z));
        }
        break;
      case 'watch':
        S.want = 0; S.yaw += angTo(S.yaw, toMe) * Math.min(1, dt * 2);
        if (S.t > S.timer || d < 42) set('stalk', 5 + R() * 4);
        break;
      case 'stalk':   // nearer, in fits and starts
        S.stopT -= dt;
        if (S.stopT < -1 - R() * 1.5) S.stopT = 0.4 + R() * 1.2;
        S.want = S.stopT > 0 ? 0 : 1.8;
        S.yaw += angTo(S.yaw, toMe) * Math.min(1, dt * 3);
        if (S.t > S.timer || d < 34) { set('chase'); S.shrieked = false; S.speed = Math.max(S.speed, 2.5); events.charge?.(V(S.x, 0.8, S.z)); }
        break;
      case 'chase': {
        S.want = Math.min(13, 3 + S.t * 2.4);
        S.speed = Math.max(S.speed, S.want * 0.8);
        S.yaw += angTo(S.yaw, toMe) * Math.min(1, dt * 4);
        if (!S.shrieked && d < 19) { S.shrieked = true; events.shriek?.(V(S.x, 0.9, S.z)); }
        if (d < 9 || S.t > 14) {   // past you, close, on whichever side it's already on
          const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), lat = (S.x - me.x) * fz - (S.z - me.z) * fx;
          S.pass = { fx, fz, side: Math.abs(lat) > 0.3 ? Math.sign(lat) : (R() < 0.5 ? -1 : 1) };
          set('pass');
        }
        break;
      }
      case 'pass': {
        const { fx, fz, side } = S.pass, along = (S.x - me.x) * fx + (S.z - me.z) * fz;
        S.want = 13; S.speed = Math.max(S.speed, 10);
        // aim for a point beside you, 2.6 m off, then straight on
        const tx = me.x - fz * side * 2.6 + fx * 30, tz = me.z + fx * side * 2.6 + fz * 30;
        if (along < 0) S.yaw += angTo(S.yaw, Math.atan2(tx - S.x, tz - S.z)) * Math.min(1, dt * 12);
        // never closer than 2.2 m going by (its limbs reach a metre and more out from it)
        const lat = (S.x - me.x) * fz - (S.z - me.z) * fx;
        if (Math.abs(along) < 3 && Math.abs(lat) < 2.2) { const k = (Math.sign(lat) || side) * (2.2 - Math.abs(lat)) * Math.min(1, dt * 10); S.x += fz * k; S.z -= fx * k; }
        lookK = along < 0 ? 1 : 0;
        if (along > 0 && d > 80) { set('hidden', 22 + R() * 24); }
        break;
      }
      case 'flee': flee(dt); at = null; break;
      default: break;
    }
    return [at, lookK];
  }
  // Away from the painting into the haze, faster as it goes.
  function flee(dt) {
    S.want = Math.min(8, 1 + S.t * 3);
    S.yaw += angTo(S.yaw, Math.atan2(-1, -0.45)) * Math.min(1, dt * 1.5);
    if (Math.hypot(S.x, S.z) > 85) set('hidden', 14 + R() * 8);
  }
  // From B3, through the painting (me: where you'd be out here, in front of the frame at z = d from it).
  function watched(dt, t, me, drawn) {
    let at = null, lookK = 0;
    if (S.state === 'posed') {
      S.want = 0;
      if (me.d < 3.2) { set('look'); events.notice?.(V(S.x, 0.8, S.z)); }
    } else if (S.state === 'look') {
      at = me3.set(me.x, 1.6, me.z); lookK = Math.min(1, S.t * 1.5);
      if (S.t > 1.7) { set('flee'); events.flee?.(V(S.x, 0.8, S.z)); }
    } else if (S.state === 'flee') flee(dt);
    else if (!drawn && me.d > 5) { S.x = POSE.x; S.z = POSE.z; S.yaw = POSE.yaw; S.speed = S.want = 0; plant(); set('posed'); }   // back where it was, unseen
    else if (S.state !== 'hidden') { S.want = 0; }
    return [at, lookK];
  }

  return {
    root, S,
    /** A frame of it: `me` where you are out here ({ x, z, fx, fz }, and d: how far in front of the frame); `plain`: you're
     *  out here (else on B3, looking through it, `drawn` if the painting's drawn this frame). */
    update(dt, t, me, plain, drawn) {
      S.t += dt;
      const [at, lookK] = plain ? hunt(dt, t, me) : watched(dt, t, me, drawn);
      // speed: up quickly, down quicker; a lurch now and then on the way
      S.speed = damp(S.speed, S.want, S.want > S.speed ? 2.2 : 4, dt);
      if (S.speed > 0.5 && R() < dt * 0.6) S.lurch = 1;
      S.lurch = Math.max(0, S.lurch - dt * 3);
      const v = S.speed * (1 - S.lurch * 0.5);
      S.x += Math.sin(S.yaw) * v * dt; S.z += Math.cos(S.yaw) * v * dt;
      const vis = S.state !== 'hidden';
      root.visible = vis;
      if (!vis) return;
      root.position.set(S.x, 0, S.z); root.rotation.y = S.yaw;
      legs(dt, t);
      look(dt, t, at, lookK);
    },
    /** Put it d m in front of you (me), coming at you, already running (for looking). */
    charge(me, d = 20) {
      S.x = me.x + me.fx * d; S.z = me.z + me.fz * d; S.yaw = Math.atan2(-me.fx, -me.fz); plant();
      set('chase'); S.t = 3; S.speed = S.want = 10; S.shrieked = d < 19;
    },
    hide(timer) { set('hidden', timer); },
    /** Stand it at (x, z) facing yaw, still, its head on you (for looking). */
    stage(x, z, yaw) { S.x = x; S.z = z; S.yaw = yaw; S.speed = S.want = 0; plant(); set('stay'); },
    pose() { S.x = POSE.x; S.z = POSE.z; S.yaw = POSE.yaw; S.speed = S.want = 0; plant(); set('posed'); },
    dist: (x, z) => Math.hypot(S.x - x, S.z - z),
  };
}
