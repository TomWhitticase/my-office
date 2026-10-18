// The carts of the grey meadow (floors/cart.js), from cart-face.js's parts.
// - makeCart: the girl's: the face (its morphs: blink, regard, speak), the eyes that follow you, the hood and body
//   breathing, the hat that lifts, the pompom, the wheels turning as it rolls. update() runs its face: blinking now and
//   then, slow breaths and the odd sigh, its look softening while you stand in front of it, its mouth while it speaks.
// - makeOld: the carts left among the trees, a few tipped over, a wheel gone, their hoods faded: merged by material
//   (their faces into one mesh, each its own face; their hoods into another, coloured per cart), and every one of their
//   eyes in one instanced mesh, turned toward you each frame.
// Generators, like the rest (cart.js spreads them over frames); the faces' and skin's arrays come from its worker (A).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { K, FACE, PEOPLE, faceGeometry, skinMaps, skinMaterial, eyeMaterial, eyeGeometry, eyeAt, hoodGeometry, feltMaterial, hatGeometry, pompomGeometry,
  wheelGeometry, woodMaterial, chassisGeometry, WHEELS, WHEEL_R, HOOD_TOP, TAIL, HITCH } from './cart-face.js';
export const SKIN_S = 768;
import { ground } from './cart-plan.js';

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** shared between the carts: the skin's maps and the materials made from them; A: the worker's answers */
export function* makeParts(R, A) {
  const skin = skinMaps(A.skin, SKIN_S);
  const mouthOpen = { value: 0 };
  const parts = {
    skin, mouthOpen,
    skinM: skinMaterial(skin, mouthOpen),
    oldSkinM: skinMaterial(skin, { value: 0 }, '#cfc6bc'),
    eyeM: eyeMaterial(R), eyeG: eyeGeometry(),
    feltM: feltMaterial('#b0382a', R),
    hatM: new THREE.MeshPhysicalMaterial({ color: '#2a2421', roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color('#6a5a50'), sheenRoughness: 0.6 }),
    bandM: new THREE.MeshStandardMaterial({ color: '#141110', roughness: 0.5 }),
    pomM: new THREE.MeshPhysicalMaterial({ color: '#8b8d90', roughness: 1, sheen: 1, sheenColor: new THREE.Color('#d8dade'), sheenRoughness: 0.8 }),
    woodM: woodMaterial(R, '#9a5a34'),
    wheelG: wheelGeometry(), chassisG: chassisGeometry(), hat: hatGeometry(), pomG: pompomGeometry(R),
  };
  parts.hoodG = hoodGeometry();
  yield;
  return parts;
}

// ----- the girl's cart -----
export function* makeCart(P, R, A) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const faceG = faceGeometry(A.face0);
  const face = new THREE.Mesh(faceG, P.skinM);
  face.position.set(0, FACE.cy, FACE.cz);
  face.morphTargetInfluences = [0, 0, 0];
  const hood = new THREE.Mesh(P.hoodG, P.feltM);
  const eyes = [-1, 1].map((s) => { const e = new THREE.Mesh(P.eyeG, P.eyeM); e.position.copy(eyeAt(PEOPLE[0], s)).add(face.position); e.rotation.order = 'YXZ'; return e; });
  const hat = new THREE.Group(), hatFelt = new THREE.Mesh(P.hat.felt, P.hatM), hatBand = new THREE.Mesh(P.hat.band, P.bandM);
  hat.add(hatFelt, hatBand); hat.position.set(0, HOOD_TOP.y - 0.015, HOOD_TOP.z); hat.rotation.x = 0.12;
  const pom = new THREE.Mesh(P.pomG, P.pomM); pom.position.set(0, TAIL.y + 0.04, TAIL.z - 0.1);
  body.add(hood, face, ...eyes, hat, pom);
  const chassis = new THREE.Mesh(P.chassisG, P.woodM);
  const wheels = WHEELS.map(([x, z]) => { const w = new THREE.Mesh(P.wheelG, P.woodM); w.position.set(x, WHEEL_R, z); root.add(w); return w; });
  root.add(chassis);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  root.scale.setScalar(K);
  yield;

  // ----- its face, alive -----
  const S = { soft: false, blink: 0, nextBlink: 2, regard: 0, speak: 0, speakUntil: 0, sigh: 0, nextSigh: 18, lift: 0, liftT: -9, breath: 0, gx: 0, gy: 0, roll: 0, wantRegard: 0 };
  const inv = new THREE.Matrix4(), lp = new THREE.Vector3(), eyeL = new THREE.Vector3();
  let onSigh = null;
  return {
    root, body, face, hood, eyes, hat, wheels, S, hitch: HITCH,
    meshes: [face, hood, hatFelt, pom],
    set onSigh(f) { onSigh = f; },
    /** it speaks for `sec` (its mouth working); loud: a line, not a murmur */
    say(t, sec) { S.speakUntil = t + sec; },
    /** the hat lifted a little, in greeting */
    tip(t) { if (t - S.liftT > 4) S.liftT = t; },
    sigh(t) { S.sigh = t; S.nextSigh = t + 20 + R() * 25; onSigh?.(); },
    /** you: the camera's position (world), or null; dt, t */
    update(dt, t, you) {
      // breathing: slow, the body swelling a little; a sigh now and then, longer and deeper, the lids drooping with it
      if (t > S.nextSigh) this.sigh(t);
      const sg = t - S.sigh < 4.5 ? Math.sin(Math.min(1, (t - S.sigh) / 4.5) * Math.PI) : 0;
      const br = Math.sin(t * (Math.PI * 2 / 5.2)) * 0.5 + 0.5;
      body.scale.set(1 + br * 0.008 + sg * 0.018, 1 + br * 0.012 + sg * 0.026, 1);
      body.position.y = -br * 0.004;
      // where you are, in its own space; how squarely you're in front of it
      let front = 0;
      if (you) {
        root.updateMatrixWorld(); inv.copy(root.matrixWorld).invert(); lp.copy(you).applyMatrix4(inv);
        const dz = lp.z - FACE.cz, d = Math.hypot(lp.x, dz);
        front = dz > 0.5 ? sstep(9, 3, d) * sstep(0.8, 0.35, Math.abs(lp.x) / Math.max(0.5, dz)) : 0;
        // the eyes after you: each its own aim, the turn eased, never quite all the way round
        for (let i = 0; i < 2; i++) {
          const e = eyes[i]; eyeL.copy(lp).sub(e.position);
          const yaw = Math.max(-0.55, Math.min(0.55, Math.atan2(eyeL.x, eyeL.z))), pitch = Math.max(-0.35, Math.min(0.3, -Math.atan2(eyeL.y, Math.hypot(eyeL.x, eyeL.z))));
          const k = 1 - Math.exp(-dt * 2.2);
          e.rotation.y += (dz > -0.5 ? yaw - e.rotation.y : -e.rotation.y) * k; e.rotation.x += (dz > -0.5 ? pitch - e.rotation.x : -e.rotation.x) * k;
        }
      }
      // in front of it a while: its look changes, a little (lids up, the brows, the mouth's corners)
      S.wantRegard = front;
      S.regard += (S.wantRegard * 0.85 - S.regard) * (1 - Math.exp(-dt * (S.wantRegard > S.regard ? 0.6 : 0.35)));
      // blinking: slow, heavy; sometimes twice
      if (t > S.nextBlink) { S.blink = t; S.nextBlink = t + (R() < 0.2 ? 0.45 : 2.5 + R() * 4.5); }
      const bt = (t - S.blink) / 0.32, bk = bt < 1 ? Math.sin(bt * Math.PI) ** 0.7 : 0;
      // speaking: the jaw working, syllables
      const sp = t < S.speakUntil ? (0.35 + 0.65 * Math.abs(Math.sin(t * 8.3) * Math.sin(t * 3.1 + 1))) * Math.min(1, (S.speakUntil - t) * 3) : 0;
      S.speak += (sp - S.speak) * (1 - Math.exp(-dt * 18));
      const inf = face.morphTargetInfluences;
      inf[0] = Math.min(1, bk + sg * 0.35); inf[1] = S.regard; inf[2] = S.speak * (S.soft ? 0.22 : 0.55) + sg * 0.12;   // (a murmur hardly moves its lips)
      P.mouthOpen.value = inf[2];
      // the hat: up and forward, held, back down
      const ht = t - S.liftT, hl = ht < 2.4 ? sstep(0, 0.5, ht) * sstep(2.4, 1.6, ht) : 0;
      hat.position.y = HOOD_TOP.y - 0.015 + hl * 0.13; hat.rotation.x = 0.12 + hl * 0.32;
      return front;
    },
    /** the wheels turned by how far it's rolled (d, m) */
    roll(d) { S.roll += d / WHEEL_R; for (const w of wheels) w.rotation.x = S.roll; },
  };
}

// ----- the old carts -----
export function* makeOld(P, R, list, A) {
  const faces = [], hoods = [], woods = [], hats = [], poms = [], eyes = [];
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), rot = new THREE.Matrix4(), v = new THREE.Vector3();
  const faceGs = {};
  for (const o of list) {
    faceGs[o.face] ||= faceGeometry(A[`face${o.face}`]);
    // its pose: on its wheels, or over on its side, resting on the ground
    rot.makeRotationZ(o.roll);
    let lo = Infinity; const hp = P.hoodG.attributes.position;
    for (let k = 0; k < hp.count; k += 7) { v.fromBufferAttribute(hp, k).applyMatrix4(rot); lo = Math.min(lo, v.y); }
    for (const [x, z] of WHEELS) for (const a of [0, 1.57, 3.14, 4.71]) { v.set(x, WHEEL_R + Math.cos(a) * WHEEL_R, z + Math.sin(a) * WHEEL_R).applyMatrix4(rot); lo = Math.min(lo, v.y); }
    const lift = o.roll ? -lo - 0.06 : 0;
    M.makeTranslation(o.x, ground(o.x, o.z) - 0.04, o.z).multiply(T.makeRotationY(o.yaw)).multiply(T.makeScale(K, K, K)).multiply(T.makeTranslation(0, lift, 0)).multiply(rot);
    o.M = M.clone(); o.inv = M.clone().invert();
    const fm = M.clone().multiply(T.makeTranslation(0, FACE.cy, FACE.cz));
    faces.push(faceGs[o.face].clone().applyMatrix4(fm));
    // the hood: its colour as a vertex colour (one material for them all)
    const hg = P.hoodG.clone().applyMatrix4(M), c = new THREE.Color(o.hood), n = hg.attributes.position.count, ca = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const f = 0.85 + 0.15 * R(); ca[k * 3] = c.r * f; ca[k * 3 + 1] = c.g * f; ca[k * 3 + 2] = c.b * f; }
    hg.setAttribute('color', new THREE.BufferAttribute(ca, 3)); hoods.push(hg);
    woods.push(P.chassisG.clone().applyMatrix4(M));
    WHEELS.forEach(([x, z], i) => {
      if (o.lost && i === 3) {   // the wheel that came off, lying in the grass beside it
        const w = new THREE.Matrix4().makeTranslation(o.x + Math.cos(o.yaw) * 2.1, ground(o.x, o.z) + 0.03 * K, o.z - Math.sin(o.yaw) * 2.1).multiply(T.makeScale(K, K, K)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.05)).multiply(new THREE.Matrix4().makeRotationX(R() * 3));
        woods.push(P.wheelG.clone().applyMatrix4(w)); return;
      }
      woods.push(P.wheelG.clone().applyMatrix4(M.clone().multiply(T.makeTranslation(x, WHEEL_R, z)).multiply(new THREE.Matrix4().makeRotationX(R() * 6))));
    });
    if (o.face !== 2) hats.push(P.hat.felt.clone().applyMatrix4(M.clone().multiply(T.makeTranslation(0, HOOD_TOP.y - 0.02, HOOD_TOP.z)).multiply(new THREE.Matrix4().makeRotationX(0.12 + R() * 0.2).multiply(new THREE.Matrix4().makeRotationZ((R() - 0.5) * 0.3)))));
    poms.push(P.pomG.clone().applyMatrix4(M.clone().multiply(T.makeTranslation(0, TAIL.y + 0.04, TAIL.z - 0.1))));
    for (const s of [-1, 1]) eyes.push({ o, at: eyeAt(PEOPLE[o.face], s).add(new THREE.Vector3(0, FACE.cy, FACE.cz)), yaw: 0, pitch: 0 });
    yield;
  }
  const mk = (gs, m) => { const g = mergeGeometries(gs.map((g2) => g2.index ? g2.toNonIndexed() : g2)); g.computeBoundingSphere(); const x = new THREE.Mesh(g, m); x.castShadow = x.receiveShadow = false; return x; };
  // (the faces keep their indices: they're big)
  const fg = mergeGeometries(faces); fg.computeBoundingSphere();
  const faceMesh = new THREE.Mesh(fg, P.oldSkinM);
  const hoodM = P.feltM.clone(); hoodM.vertexColors = true; hoodM.color.set('#ffffff'); hoodM.sheenColor.set('#c8b8a8');
  const meshes = [faceMesh];
  yield;
  meshes.push(mk(hoods, hoodM)); yield;
  meshes.push(mk(woods, P.woodM), mk(hats, P.hatM), mk(poms, P.pomM));
  yield;
  const eyeMesh = new THREE.InstancedMesh(P.eyeG, P.eyeM, eyes.length);
  eyeMesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), lp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  function update(dt, you) {
    const k = 1 - Math.exp(-dt * 1.4);
    for (let i = 0; i < eyes.length; i++) {
      const E = eyes[i];
      if (you) {
        lp.copy(you).applyMatrix4(E.o.inv).sub(E.at);
        E.yaw += (Math.max(-0.6, Math.min(0.6, Math.atan2(lp.x, lp.z))) - E.yaw) * k;
        E.pitch += (Math.max(-0.4, Math.min(0.35, -Math.atan2(lp.y, Math.hypot(lp.x, lp.z)))) - E.pitch) * k;
      }
      e.set(E.pitch, E.yaw, 0); q.setFromEuler(e);
      m4.compose(E.at, q, one).premultiply(E.o.M);
      eyeMesh.setMatrixAt(i, m4);
    }
    eyeMesh.instanceMatrix.needsUpdate = true;
  }
  update(0, null);
  return { meshes, eyeMesh, update, list };
}
