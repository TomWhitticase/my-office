// The circus on the rocks (floors/acro.js): the ring, teal with great gold scrolls swirling over its floor and a cream
// band round it, its padded rim (teal panels, dark ovals, a cream cushion along the top), open toward the frame you
// come by; strings of warm lamps on poles round it; the tiers of seats curving round its far right, an audience in them
// that murmurs, leans in and claps (their arms are their own instances: `clap(t)`, `gasp(t)`); the stair cut along the
// ridge's crest up to the headland, a rope on posts each side; and up there the halt: a bell on a post to call the
// train (`bell`), a signal whose arm drops when it's coming, a lamp, a bench.
// Seats you can sit in: `seatAt(point)` (hover.js's userData.seatAt) on the tiers.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBody, makeArm } from './acro-figures.js';
import { CEN, D, N, SEA, frameAt, RING, RIM, RIM_H, FLOOR_Y, SEATS, STAIR, LANDING, STEPS, RUN, Y_DECK, OPEN, DECK_W, toWorld, toSU } from './acro-plan.js';

const yawOf = (dx, dz) => Math.atan2(dx, dz);
// a (s, u, up) frame in the world: shape x → +s, shape y → +u, extruded down (a right-handed frame)
const SUD = new THREE.Matrix4().makeBasis(new THREE.Vector3(D.x, 0, D.z), new THREE.Vector3(N.x, 0, N.z), new THREE.Vector3(0, -1, 0));
const colored = (g, c) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); const cl = new THREE.Color(c), a = new Float32Array(g.attributes.position.count * 3); for (let k = 0; k < a.length; k += 3) { a[k] = cl.r; a[k + 1] = cl.g; a[k + 2] = cl.b; } return g.setAttribute('color', new THREE.BufferAttribute(a, 3)); };
export const GAP = { a: Math.atan2(-CEN.x, -CEN.z), half: 0.12 };   // the rim's opening, toward the frame (lathe angle: x = r sin a, z = r cos a)

export function buildRing(fl, R, time) {
  const root = new THREE.Group(), S = fl.scene;
  S.add(root);

  // ----- the ring's floor: painted canvas over boards -----
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
  {
    const c = cv.getContext('2d'), M = 512;
    c.fillStyle = '#3f8b86'; c.fillRect(0, 0, 1024, 1024);
    // a cream band and a gold line round the edge
    c.lineWidth = 34; c.strokeStyle = '#e8dcb4'; c.beginPath(); c.arc(M, M, 480, 0, 7); c.stroke();
    c.lineWidth = 6; c.strokeStyle = '#d8b74f'; c.beginPath(); c.arc(M, M, 452, 0, 7); c.stroke();
    // great gold scrolls: a heart with its lobes curling out, six round the middle, pointing in; little curls between
    const gold = '#e7cb67', edge = '#a88a34';
    const scroll = (a) => {
      c.save(); c.translate(M, M); c.rotate(a);
      c.beginPath();
      c.moveTo(0, 110);
      c.bezierCurveTo(-60, 170, -200, 210, -170, 330);
      c.bezierCurveTo(-150, 400, -60, 400, -60, 340);
      c.bezierCurveTo(-60, 300, -110, 300, -110, 330);
      c.bezierCurveTo(-90, 260, -20, 300, 0, 380);
      c.bezierCurveTo(20, 300, 90, 260, 110, 330);
      c.bezierCurveTo(110, 300, 60, 300, 60, 340);
      c.bezierCurveTo(60, 400, 150, 400, 170, 330);
      c.bezierCurveTo(200, 210, 60, 170, 0, 110);
      c.closePath();
      c.fillStyle = gold; c.fill(); c.lineWidth = 3; c.strokeStyle = edge; c.stroke();
      // a curl off to the side
      c.beginPath(); c.moveTo(150, 250); c.bezierCurveTo(260, 200, 300, 330, 230, 340); c.bezierCurveTo(190, 345, 195, 300, 225, 305);
      c.lineWidth = 16; c.strokeStyle = gold; c.lineCap = 'round'; c.stroke();
      c.restore();
    };
    for (let k = 0; k < 6; k++) scroll(k * Math.PI / 3);
    c.fillStyle = gold; c.beginPath(); c.arc(M, M, 64, 0, 7); c.fill(); c.lineWidth = 4; c.strokeStyle = edge; c.stroke();
    c.fillStyle = '#3f8b86'; c.beginPath(); c.arc(M, M, 34, 0, 7); c.fill();
    // wear: scuffs, faded where they land
    for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,250,230' : '20,40,40'},${R() * 0.05})`; c.beginPath(); c.arc(R() * 1024, R() * 1024, 2 + R() * 14, 0, 7); c.fill(); }
  }
  const floorT = new THREE.CanvasTexture(cv); floorT.colorSpace = THREE.SRGBColorSpace; floorT.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(RING + 0.02, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.82 }));
  floor.rotation.y = yawOf(N.x, N.z);
  floor.position.set(CEN.x, FLOOR_Y, CEN.z);
  root.add(floor);
  // its edge: the boards' thickness, down to the rock
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(RING + 0.02, RING + 0.06, FLOOR_Y + 0.3, 72, 1, true), new THREE.MeshStandardMaterial({ color: '#3b4a4a', roughness: 0.9 }));
  skirt.position.set(CEN.x, (FLOOR_Y - 0.3) / 2, CEN.z); root.add(skirt);

  // ----- the rim: a padded wall round it, open toward the frame -----
  const rimC = document.createElement('canvas'); rimC.width = 1024; rimC.height = 64;
  {
    const c = rimC.getContext('2d');
    c.fillStyle = '#e9dfbf'; c.fillRect(0, 0, 1024, 64);
    c.fillStyle = '#3c847f'; c.fillRect(0, 0, 1024, 40);
    for (let k = 0; k < 16; k++) { c.fillStyle = '#1f4f4c'; c.beginPath(); c.ellipse(32 + k * 64, 20, 22, 13, 0, 0, 7); c.fill(); c.strokeStyle = '#d9c47a'; c.lineWidth = 2; c.stroke(); }
    c.fillStyle = '#c9b98d'; c.fillRect(0, 38, 1024, 3);
  }
  const rimT = new THREE.CanvasTexture(rimC); rimT.colorSpace = THREE.SRGBColorSpace; rimT.wrapS = THREE.RepeatWrapping; rimT.repeat.set(5, 1);
  const r0 = RING + 0.02, r1 = RING + RIM, prof = [[r0, FLOOR_Y], [r0, RIM_H - 0.1], [r0 + 0.05, RIM_H - 0.02], [(r0 + r1) / 2, RIM_H], [r1 - 0.05, RIM_H - 0.02], [r1, RIM_H - 0.1], [r1, -0.25]];
  // (v: 0 at its foot inside, up over the cushion, down the outside: the panels both sides, the cushion on top)
  const lp = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const rimG = new THREE.LatheGeometry(lp, 120, GAP.a + GAP.half, Math.PI * 2 - 2 * GAP.half);
  { const uv = rimG.attributes.uv, n = prof.length; for (let k = 0; k < uv.count; k++) { const j = k % n; uv.setXY(k, uv.getX(k) * 16, [0.05, 0.55, 0.85, 0.95, 0.85, 0.55, 0.05][j]); } }
  rimG.computeVertexNormals();
  const rim = new THREE.Mesh(rimG, new THREE.MeshStandardMaterial({ map: rimT, roughness: 0.75, side: THREE.DoubleSide }));
  rim.position.set(CEN.x, 0, CEN.z); root.add(rim);
  // posts at the opening
  for (const s of [-1, 1]) {
    const a = GAP.a + s * GAP.half, x = CEN.x + Math.sin(a) * (r0 + r1) / 2, z = CEN.z + Math.cos(a) * (r0 + r1) / 2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.05, 12), new THREE.MeshStandardMaterial({ color: '#d8c27a', roughness: 0.4, metalness: 0.5 }));
    p.position.set(x, 0.52, z); root.add(p);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), p.material); knob.position.set(x, 1.12, z); root.add(knob);
  }

  // ----- lamps round the ring: poles, and strings of warm bulbs swagged between them -----
  const poles = [], bulbs = [];
  const NP = 8;
  const pa = (k) => GAP.a + GAP.half + 0.25 + k * (Math.PI * 2 - 2 * GAP.half - 0.5) / (NP - 1);
  const pp = (k) => ({ x: CEN.x + Math.sin(pa(k)) * (RING + 1.3), z: CEN.z + Math.cos(pa(k)) * (RING + 1.3) });
  for (let k = 0; k < NP; k++) {
    const p = pp(k), { s, u } = toSU(p.x, p.z);
    if (Math.abs(u) < 1.2 && s > 0) continue;   // (not where the line of towers goes out)
    const g = new THREE.CylinderGeometry(0.05, 0.07, 5.2, 8).translate(p.x, 2.6, p.z); poles.push(colored(g, '#3a3640'));
    poles.push(colored(new THREE.SphereGeometry(0.09, 8, 6).translate(p.x, 5.25, p.z), '#c9a34f'));
  }
  for (let k = 0; k < NP - 1; k++) {
    const a = pp(k), b = pp(k + 1), A = toSU(a.x, a.z), B = toSU(b.x, b.z);
    if ((Math.abs(A.u) < 1.2 && A.s > 0) || (Math.abs(B.u) < 1.2 && B.s > 0)) continue;
    for (let i = 1; i < 10; i++) { const t = i / 10; bulbs.push([a.x + (b.x - a.x) * t, 5.15 - Math.sin(t * Math.PI) * 0.9, a.z + (b.z - a.z) * t]); }
  }
  const poleM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
  root.add(new THREE.Mesh(mergeGeometries(poles), poleM));
  const bulbM = new THREE.MeshStandardMaterial({ color: '#fff1c9', emissive: '#ffcf7a', emissiveIntensity: 1.1 });
  const bulbI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), bulbM, bulbs.length);
  const m4 = new THREE.Matrix4();
  bulbs.forEach(([x, y, z], i) => bulbI.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  root.add(bulbI);
  const ringL = new THREE.PointLight('#ffc98a', 22, 26, 1.6); ringL.position.set(CEN.x, 7, CEN.z); S.add(ringL);

  // ----- the tiers of seats: stone steps in an arc, seats on them, an aisle up the middle -----
  const tierParts = [], seatParts = [], seats = [];
  const NA = 40;
  for (let k = 0; k < SEATS.rows; k++) {
    const rA = SEATS.r0 + k * SEATS.step - 0.2, rB = SEATS.r0 + (k + 1) * SEATS.step - 0.2, top = (k + 1) * SEATS.rise;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, rB, SEATS.a0, SEATS.a1, false); sh.absarc(0, 0, rA, SEATS.a1, SEATS.a0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: top + 1.6, bevelEnabled: false, curveSegments: NA });
    g.applyMatrix4(SUD); g.translate(CEN.x, top, CEN.z);
    tierParts.push(colored(g, k % 2 ? '#8b8790' : '#958f96'));
    // the seats along it, leaving the aisle in the middle
    const r = (rA + rB) / 2 + 0.1, n = Math.floor((SEATS.a1 - SEATS.a0) * r / 0.62);
    for (let i = 0; i < n; i++) {
      const a = SEATS.a0 + (i + 0.5) * (SEATS.a1 - SEATS.a0) / n;
      if (Math.abs(a - (SEATS.a0 + SEATS.a1) / 2) < 0.06) continue;
      const w = toWorld(Math.cos(a) * r, Math.sin(a) * r), face = yawOf(CEN.x - w.x, CEN.z - w.z);
      seats.push({ x: w.x, z: w.z, y: top, yaw: face, k, a, taken: false });
    }
  }
  // a seat: a padded base and back, blue-grey, on a dark frame (one geometry, instanced)
  const seatG = mergeGeometries([
    colored(new THREE.BoxGeometry(0.5, 0.1, 0.44).translate(0, 0.42, 0.02), '#7b8aa2'),
    colored(new THREE.BoxGeometry(0.5, 0.5, 0.08).translate(0, 0.72, -0.2).rotateX(-0.12), '#7b8aa2'),
    colored(new THREE.BoxGeometry(0.06, 0.37, 0.4).translate(-0.23, 0.185, 0), '#3d3a42'),
    colored(new THREE.BoxGeometry(0.06, 0.37, 0.4).translate(0.23, 0.185, 0), '#3d3a42'),
  ]);
  const seatM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const seatI = new THREE.InstancedMesh(seatG, seatM, seats.length);
  const q = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  // (seats sit back from the step's front edge: a seat's front at r - 0.2)
  seats.forEach((st, i) => { seatI.setMatrixAt(i, m4.compose(pv.set(st.x, st.y + 0.003, st.z), q.setFromAxisAngle(yAx, st.yaw), one)); });
  root.add(seatI);
  root.add(new THREE.Mesh(mergeGeometries(tierParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })));

  // ----- the audience: in some of the seats, the near ones; bodies, and arms that clap -----
  const COATS = ['#4d5874', '#6d4a5e', '#7f6a52', '#3f5a52', '#6a6a72', '#8a5a44'];
  const people = [];
  for (const st of seats) if (R() < 0.34 && st.k < 4) { st.taken = true; people.push({ st, coat: Math.floor(R() * COATS.length), sex: R() < 0.5 ? 'f' : 'm', ph: R() * 6.28, rate: 0.8 + R() * 0.5 }); }
  const bodyI = [], armI = [];
  for (let c = 0; c < COATS.length; c++) for (const sex of ['m', 'f']) {
    const list = people.filter((p) => p.coat === c && p.sex === sex);
    if (!list.length) continue;
    const bm = new THREE.InstancedMesh(makeBody('seat', sex, 'hi', { top: COATS[c], legs: '#3a3a44' }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), list.length);
    const am = new THREE.InstancedMesh(mergeGeometries([makeArm('hi', 1, COATS[c]), makeArm('hi', -1, COATS[c]).translate(0, 0, 0)].map((g, i) => (i ? g.translate(-0.38, 0, 0) : g))), bm.material, list.length);
    // (both arms in one: the left's shoulder at the origin, the right's 0.38 to its right)
    list.forEach((p, i) => { p.bm = bm; p.am = am; p.i = i; });
    bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); am.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(bm, am); bodyI.push(bm); armI.push(am);
  }
  const crowd = { clap: -1, gasp: -1, cheer: 0 };
  const mb = new THREE.Matrix4(), ma = new THREE.Matrix4(), mt = new THREE.Matrix4(), eu = new THREE.Euler();
  function placeCrowd(t) {
    const clapping = crowd.clap >= 0 && t - crowd.clap < 5, gasping = crowd.gasp >= 0 && t - crowd.gasp < 2.5;
    for (const p of people) {
      const { st } = p, lean = (gasping ? 0.12 * Math.sin(Math.min(1, (t - crowd.gasp) / 2.5) * Math.PI) : 0) + Math.sin(t * 0.4 * p.rate + p.ph) * 0.02;
      mb.compose(pv.set(st.x, st.y + 0.003, st.z), q.setFromEuler(eu.set(lean, st.yaw + Math.sin(t * 0.21 * p.rate + p.ph) * 0.08, 0, 'YXZ')), one);
      p.bm.setMatrixAt(p.i, mb);
      // arms from the shoulders: clapping, the hands meeting in front; or resting
      const k = clapping ? Math.min(1, (t - crowd.clap) * 4) * Math.min(1, (5 - (t - crowd.clap)) * 2) : 0;
      const c = k * (0.35 + 0.35 * Math.sin(t * (13 + p.rate * 4) + p.ph));
      ma.copy(mb).multiply(mt.makeTranslation(0.19, 1.0, -0.05)).multiply(mt.makeRotationFromEuler(eu.set(-0.25 - k * 0.5, 0, 0, 'XYZ')));
      ma.multiply(mt.makeRotationY(-c * 0.25));
      p.am.setMatrixAt(p.i, ma);
    }
    for (const m of bodyI) m.instanceMatrix.needsUpdate = true;
    for (const m of armI) m.instanceMatrix.needsUpdate = true;
  }

  // ----- the stair: a stepped slab of stone on piers, rising toward the viaduct, a parapet each side; the landing -----
  // (built in a (q, up, s) frame, q from the stair's foot toward the deck: x → -N, y → up, z → D; right-handed)
  // (the line's own frame where the stair is: it's out on the bend)
  const SM = (LANDING.s0 + LANDING.s1) / 2, FM = frameAt(SM);
  const QYS = new THREE.Matrix4().makeBasis(new THREE.Vector3(-FM.nx, 0, -FM.nz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(FM.dx, 0, FM.dz));
  { const o = toWorld(SM, STAIR.u1); QYS.setPosition(o.x - FM.dx * SM, 0, o.z - FM.dz * SM); }
  const across = (shape, s0, s1) => new THREE.ExtrudeGeometry(shape, { depth: s1 - s0, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, s0).applyMatrix4(QYS);
  const stairParts = [], foot = SEA - 1.5, H2 = (Y_DECK - 0.02) / STEPS, Q = STAIR.u1 - STAIR.u0, THK = 0.9;
  {
    const sh = new THREE.Shape(); sh.moveTo(-0.3, -THK); sh.lineTo(-0.3, 0);
    for (let i = 1; i <= STEPS; i++) { const q = (i - 1) * RUN; sh.lineTo(q, (i - 1) * H2); sh.lineTo(q, i * H2); }
    sh.lineTo(Q + 0.02, STEPS * H2); sh.lineTo(Q + 0.02, STEPS * H2 - THK); sh.closePath();
    stairParts.push(colored(across(sh, STAIR.s0, STAIR.s1), '#958d90'));
    // its parapets: a coping wall each side, a metre over the nosings
    for (const [s0, s1] of [[STAIR.s0 - 0.24, STAIR.s0], [STAIR.s1, STAIR.s1 + 0.24]]) {
      const p = new THREE.Shape(); p.moveTo(-0.3, -THK); p.lineTo(Q, STEPS * H2 - THK); p.lineTo(Q, STEPS * H2 + 0.98); p.lineTo(-0.3, 0.98); p.closePath();
      stairParts.push(colored(across(p, s0, s1), '#8a8387'));
    }
    // its piers, down to the rock
    for (let q = 3.2; q < Q - 1; q += 3.6) {
      const y = q / Q * (Y_DECK - 0.02) - THK, pr = new THREE.Shape(); pr.moveTo(q - 0.32, -2.5); pr.lineTo(q + 0.32, -2.5); pr.lineTo(q + 0.32, y + 0.05); pr.lineTo(q - 0.32, y + 0.05); pr.closePath();
      stairParts.push(colored(across(pr, STAIR.s0 - 0.1, STAIR.s1 + 0.1), '#7f7a80'));
    }
    // the landing: a tower of stone up from the sea, its top level with the deck, a parapet round its open sides
    const LQ = (u) => STAIR.u1 - u;   // (u to q)
    const L = new THREE.Shape(); L.moveTo(LQ(LANDING.u1), foot); L.lineTo(LQ(LANDING.u0 + 0.004), foot); L.lineTo(LQ(LANDING.u0 + 0.004), Y_DECK - 0.02); L.lineTo(LQ(LANDING.u1), Y_DECK - 0.02); L.closePath();
    stairParts.push(colored(across(L, LANDING.s0, LANDING.s1), '#958d90'));
    const lp = (s0, s1, u0, u1) => { const r = new THREE.Shape(); r.moveTo(LQ(u1), Y_DECK - 0.02); r.lineTo(LQ(u0), Y_DECK - 0.02); r.lineTo(LQ(u0), Y_DECK + 0.95); r.lineTo(LQ(u1), Y_DECK + 0.95); r.closePath(); stairParts.push(colored(across(r, s0, s1), '#8a8387')); };
    lp(LANDING.s0 + 0.01, LANDING.s0 + 0.25, LANDING.u0 + 0.3, LANDING.u1 - 0.01);   // the landward end
    lp(LANDING.s1 - 0.25, LANDING.s1 - 0.01, LANDING.u0 + 0.3, LANDING.u1 - 0.01);   // the seaward end
    lp(LANDING.s0 + 0.25, STAIR.s0 - 0.24, LANDING.u1 - 0.25, LANDING.u1 - 0.01);    // the far side, either side of the stair's top
    lp(STAIR.s1 + 0.24, LANDING.s1 - 0.25, LANDING.u1 - 0.25, LANDING.u1 - 0.01);
  }
  root.add(new THREE.Mesh(mergeGeometries(stairParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));

  // ----- the halt on the landing: the bell, the signal, a lamp, a bench -----
  const halt = new THREE.Group(); root.add(halt);
  const hp = (s, u, y = Y_DECK - 0.02) => { const w = toWorld(s, u); return new THREE.Vector3(w.x, y, w.z); };
  const brass = new THREE.MeshStandardMaterial({ color: '#c79a48', roughness: 0.3, metalness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: '#2f2f36', roughness: 0.55, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: '#5a4436', roughness: 0.9 });
  // the bell: a bracket on a post, the bell hanging from it, its rope
  const bellAt = hp(LANDING.s0 + 0.9, LANDING.u1 - 0.7);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 10), iron); post.position.copy(bellAt).setY(bellAt.y + 1.3); halt.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), iron); arm.position.copy(bellAt).setY(bellAt.y + 2.5); arm.rotation.y = yawOf(-FM.nx, -FM.nz); arm.translateZ(0.3); halt.add(arm);
  const bellG = new THREE.LatheGeometry([[0.001, 0.28], [0.08, 0.27], [0.12, 0.2], [0.13, 0.08], [0.17, 0.0], [0.175, -0.02], [0.16, -0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  const bell = new THREE.Mesh(bellG, brass); bell.position.copy(arm.position).setY(bellAt.y + 2.18); bell.position.add(new THREE.Vector3(-FM.nx, 0, -FM.nz).multiplyScalar(0.3)); halt.add(bell);
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), iron); clapper.position.set(0, 0.04, 0); bell.add(clapper);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 5), new THREE.MeshStandardMaterial({ color: '#b39b70', roughness: 1 })); rope.position.set(0, -0.6, 0); bell.add(rope);
  const bellHit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshBasicMaterial()); bellHit.visible = false; bellHit.position.set(0, -0.6, 0); bell.add(bellHit);
  Object.assign(bellHit.userData, { action: 'acro-bell', reach: 4 });
  // the signal: a mast, its arm level (stop) or dropped (the train's coming)
  const sigAt = hp(LANDING.s1 - 0.6, LANDING.u1 - 0.6);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8), iron); mast.position.copy(sigAt).setY(sigAt.y + 2.1); halt.add(mast);
  const sigArm = new THREE.Group(); sigArm.position.copy(sigAt).setY(sigAt.y + 3.8); sigArm.rotation.y = yawOf(FM.dx, FM.dz) + Math.PI / 2; halt.add(sigArm);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.03), new THREE.MeshStandardMaterial({ color: '#b2392f', roughness: 0.6 })); blade.position.set(0.5, 0, 0); sigArm.add(blade);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.165, 0.035), new THREE.MeshStandardMaterial({ color: '#eee6d3', roughness: 0.6 })); stripe.position.set(0.72, 0, 0); sigArm.add(stripe);
  const sigLamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#331', emissive: '#ff3a24', emissiveIntensity: 2 })); sigLamp.position.set(-0.08, -0.05, 0.04); sigArm.add(sigLamp);
  // a lamp post with a lantern, lit; and a bench
  const lampAt = hp(LANDING.s0 + 0.6, LANDING.u0 + 1.2);
  const lp2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.0, 8), iron); lp2.position.copy(lampAt).setY(lampAt.y + 1.5); halt.add(lp2);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.36, 6), new THREE.MeshStandardMaterial({ color: '#fff0c8', emissive: '#ffcf7a', emissiveIntensity: 2.6 })); lantern.position.copy(lampAt).setY(lampAt.y + 3.12); halt.add(lantern);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 6), iron); cap.position.copy(lampAt).setY(lampAt.y + 3.39); halt.add(cap);
  const haltL = new THREE.PointLight('#ffcf8a', 8, 14, 1.6); haltL.position.copy(lantern.position); S.add(haltL);
  const benchAt = hp(STAIR.s1 + 1.3, LANDING.u1 - 0.65);
  const bench = new THREE.Group(); bench.position.copy(benchAt); bench.rotation.y = yawOf(-FM.nx, -FM.nz); halt.add(bench);
  for (const [w, h, d, x, y, z, m] of [[1.6, 0.06, 0.4, 0, 0.44, 0, wood], [1.6, 0.36, 0.05, 0, 0.72, -0.2, wood], [0.06, 0.44, 0.4, -0.7, 0.22, 0, iron], [0.06, 0.44, 0.4, 0.7, 0.22, 0, iron]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); bench.add(b); }
  const benchSeat = { x: benchAt.x - FM.nx * 0.1, z: benchAt.z - FM.nz * 0.1, y: benchAt.y, yaw: yawOf(-FM.nx, -FM.nz), bench: true };

  // seats you can sit in: the nearest free one to where you're pointing
  const seatHit = new THREE.Mesh(mergeGeometries(tierParts.map((g) => g.clone())), new THREE.MeshBasicMaterial()); seatHit.visible = false;
  const sat = (st, i) => ({ x: st.x, z: st.z, rotY: st.yaw, eye: 1.18, floor: true, name: st.bench ? 'The bench' : 'A seat in the audience', obj: seatHit, i });
  seatHit.userData.seatAt = (p) => {
    let best = null, bd = 1.2;
    for (let i = 0; i < seats.length; i++) { const st = seats[i]; if (st.taken) continue; const d = Math.hypot(st.x - p.x, st.z - p.z) + Math.abs(st.y + 0.45 - p.y) * 0.5; if (d < bd) { bd = d; best = i; } }
    return best == null ? null : sat(seats[best], best);
  };
  const benchHit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.5), new THREE.MeshBasicMaterial()); benchHit.visible = false; benchHit.position.set(0, 0.45, 0); bench.add(benchHit);
  benchHit.userData.seat = sat(benchSeat, -1);
  root.add(seatHit);
  root.updateMatrixWorld(true);

  // what you bump into: the bell's post, the lamp, the mast, the bench
  const box = (p, r) => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
  const cols = [box(bellAt, 0.18), box(lampAt, 0.16), box(sigAt, 0.16), box(benchAt, 0.6)];
  for (let k = 0; k < NP; k++) { const p = pp(k), { s, u } = toSU(p.x, p.z); if (!(Math.abs(u) < 1.2 && s > 0)) cols.push(box(p, 0.15)); }

  const bellS = { swing: 0, v: 0 };
  return {
    root, seats, people, cols, hits: [seatHit, benchHit, bellHit], bell, bellAt, crowd, ringL, haltL, rim, floor,
    seatY: (st) => st.y,
    clap(t) { crowd.clap = t; },
    gasp(t) { crowd.gasp = t; },
    ring() { bellS.v += 2.2; },
    signal(on) { sigArm.userData.on = on; },
    update(dt, t) {
      placeCrowd(t);
      bellS.v += (-bellS.swing * 30 - bellS.v * 2.2) * dt; bellS.swing += bellS.v * dt;
      bell.rotation.x = bellS.swing * 0.5;
      const want = sigArm.userData.on ? -0.7 : 0; sigArm.rotation.z += (want - sigArm.rotation.z) * Math.min(1, dt * 3);
      sigLamp.material.emissive.set(sigArm.userData.on ? '#55ff7a' : '#ff3a24');
      for (const L of [ringL]) L.intensity = 22 * (0.96 + 0.04 * Math.sin(t * 7.3) * Math.sin(t * 3.1));
    },
  };
}
