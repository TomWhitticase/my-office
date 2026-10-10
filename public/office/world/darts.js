// Darts, on the breakroom's west wall beside the whiteboard, under the neon: the board (click it from behind the oche to
// throw; the dart lands near where you aimed, scored as it lands), a chalkboard on an easel in the corner by the window
// keeping a game of 501 (click it to wipe it), and the throw mat with the oche 2.37 m out. Plus beanbags by the lounge's
// north window (the board's first home; the breakroom has no room for them).

import * as THREE from 'three';
import { box, cyl, FONT, makeCanvas, MARKER, rng, solid } from '../util.js';

// The lane: built facing +z from the wall at (WX, WZ), turned to face into the room (+x). In it, the board's centre (at
// regulation height) and the oche. The beanbags (people.js gives them idle spots) still face the lounge pillar.
const WX = -19.9, WZ = 6.3, TURN = Math.PI / 2;
const BX = 0, BY = 1.73, BZ = 0.04, OCHE = 2.37;
const BEANS = [[4.15, 13.55, '#3f6d8f'], [5.35, 13.95, '#6b8e4e'], [6.0, 12.65, '#a35d7a']]
  .map(([x, z, color]) => ({ x, z, rotY: Math.atan2(4 - x, 8.29 - z), color }));
// Clockwise from the top; ring radii in metres (bull, outer bull, treble, double, the board's edge).
const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const R = { bull: 0.00635, outer: 0.0159, t0: 0.099, t1: 0.107, d0: 0.162, d1: 0.170, edge: 0.2255 };

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three gives every object a uuid from Math.random: build with a seeded one of our own, so the darts don't move the rest.
  const random = Math.random;
  Math.random = rng(1801);
  try { build(ctx); } finally { Math.random = random; }
}

// Where a dart at (x, y) from the bull (metres, y up) scores: { n, label, double }.
export function scoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (r <= R.bull) return { n: 50, label: 'BULL', double: true };
  if (r <= R.outer) return { n: 25, label: '25', double: false };
  if (r > R.d1) return { n: 0, label: 'out', double: false };
  const seg = ORDER[Math.floor((((Math.atan2(x, y) * 180) / Math.PI + 9 + 360) % 360) / 18)];
  if (r >= R.d0) return { n: seg * 2, label: `D${seg}`, double: true };
  if (r >= R.t0 && r <= R.t1) return { n: seg * 3, label: `T${seg}`, double: false };
  return { n: seg, label: `${seg}`, double: false };
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { world, beanbag, barM, rugs } = ctx;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

  // Everything but the beanbags goes in the lane; `toWorld` / `toLane` move a point between the two.
  const lane = new THREE.Group(); lane.position.set(WX, 0, WZ); lane.rotation.y = TURN; world.add(lane); lane.updateMatrixWorld();
  const toWorld = (v) => lane.localToWorld(v), toLane = (v) => lane.worldToLocal(v);

  // ----- the board -----
  const board = new THREE.Group(); board.position.set(BX, BY, BZ); lane.add(board);
  const face = makeCanvas(1024, 1024), c = face.ctx, px = 512 / 0.235;   // the face, out to the surround's edge
  c.fillStyle = '#121212'; c.fillRect(0, 0, 1024, 1024);
  const ring = (r0, r1, a0, a1, col) => { c.fillStyle = col; c.beginPath(); c.arc(512, 512, r1 * px, a0, a1); c.arc(512, 512, r0 * px, a1, a0, true); c.fill(); };
  ORDER.forEach((n, i) => {
    const a0 = ((i * 18 - 9 - 90) * Math.PI) / 180, a1 = a0 + Math.PI / 10, dark = i % 2 === 0;
    ring(R.outer, R.d1, a0, a1, dark ? '#1b1a18' : '#efe0bd');
    for (const [r0, r1] of [[R.t0, R.t1], [R.d0, R.d1]]) ring(r0, r1, a0, a1, dark ? '#c4262b' : '#17803d');
    const mid = a0 + Math.PI / 20, rn = 0.197 * px;
    c.save(); c.translate(512 + Math.cos(mid) * rn, 512 + Math.sin(mid) * rn); c.rotate(mid + Math.PI / 2);
    c.fillStyle = '#f2f2ee'; c.font = `700 46px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), 0, 0); c.restore();
  });
  ring(0, R.outer, 0, Math.PI * 2, '#17803d'); ring(0, R.bull, 0, Math.PI * 2, '#c4262b');
  // The spider: wires round the rings and between the segments.
  c.strokeStyle = 'rgba(205,210,215,.85)'; c.lineWidth = 2.5;
  for (const r of [R.outer, R.t0, R.t1, R.d0, R.d1]) { c.beginPath(); c.arc(512, 512, r * px, 0, Math.PI * 2); c.stroke(); }
  c.beginPath(); c.arc(512, 512, R.bull * px, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 20; i++) {
    const a = ((i * 18 - 9 - 90) * Math.PI) / 180;
    c.beginPath(); c.moveTo(512 + Math.cos(a) * R.outer * px, 512 + Math.sin(a) * R.outer * px); c.lineTo(512 + Math.cos(a) * R.d1 * px, 512 + Math.sin(a) * R.d1 * px); c.stroke();
  }
  c.strokeStyle = '#8f949a'; c.lineWidth = 5; c.beginPath(); c.arc(512, 512, R.edge * px, 0, Math.PI * 2); c.stroke();   // the number ring
  face.tex.needsUpdate = true; face.tex.anisotropy = 4;
  const front = new THREE.Mesh(new THREE.CircleGeometry(0.235, 64), new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.95 }));
  front.position.z = 0.0405; front.receiveShadow = true; board.add(front);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.04, 48).rotateX(Math.PI / 2).translate(0, 0, 0.02), std('#1a1a1a', { roughness: 0.6 }));
  body.castShadow = true; board.add(body);
  // A lamp bar over it on a short arm, glowing with the office's other lamps.
  box(board, 0.03, 0.03, 0.34, '', 0, 0.42, 0.13, { material: std('#2b2b2b', { metalness: 0.6, roughness: 0.4 }) });
  box(board, 0.36, 0.05, 0.07, '', 0, 0.41, 0.3, { material: std('#2b2b2b', { metalness: 0.6, roughness: 0.4 }) });
  box(board, 0.32, 0.012, 0.045, '', 0, 0.383, 0.3, { material: barM, shadow: false });
  board.traverse((o) => { if (o.isMesh) Object.assign(o.userData, { action: 'darts', reach: 5 }); });

  // ----- darts: tip at the origin, the rest along +z (so lookAt(back) points them) -----
  const steel = std('#c9ccd0', { metalness: 0.9, roughness: 0.3 }), tung = std('#7d828a', { metalness: 0.8, roughness: 0.35 }), shaftM = std('#151515');
  const FLIGHTS = ['#d63b2f', '#1f6fd1', '#e8b21f'];
  const flightShape = new THREE.Shape();
  flightShape.moveTo(0, 0); flightShape.lineTo(0.022, 0.012); flightShape.lineTo(0.022, 0.042); flightShape.lineTo(0, 0.034); flightShape.lineTo(0, 0);
  const flightG = new THREE.ShapeGeometry(flightShape).rotateY(-Math.PI / 2).translate(0, 0, 0.1);
  const darts = FLIGHTS.map((col) => {
    const g = new THREE.Group();
    cyl(g, 0.0012, 0.0004, 0.03, '', 0, 0, 0.015, { material: steel, shadow: false }).rotation.x = -Math.PI / 2;
    cyl(g, 0.0042, 0.0035, 0.048, '', 0, 0, 0.054, { material: tung }).rotation.x = Math.PI / 2;
    cyl(g, 0.0022, 0.0022, 0.04, '', 0, 0, 0.098, { material: shaftM, shadow: false }).rotation.x = Math.PI / 2;
    const fm = std(col, { side: THREE.DoubleSide, roughness: 0.6 });
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(flightG, fm); f.rotation.z = (k * Math.PI) / 2; g.add(f); }
    g.traverse((o) => { if (o.isMesh) Object.assign(o.userData, { action: 'darts', reach: 5 }); });
    g.scale.setScalar(1.15);   // a touch big, so you can see where they went from the oche
    lane.add(g);
    return g;
  });
  // Stick dart `d` at (x, y) on the board, angled a little as thrown from `from`.
  const _p = new THREE.Vector3();
  function stick(d, x, y, from) {
    d.position.set(BX + x, BY + y, BZ + 0.038);
    const back = _p.copy(from).sub(d.position).setY(0).normalize();
    back.y = 0.12 + Math.random() * 0.1; back.x += (Math.random() - 0.5) * 0.12;   // tails up a little, each its own way
    d.lookAt(toWorld(back.add(d.position)));
    d.visible = true;
  }
  // Last night's three, still in the board.
  const start = new THREE.Vector3(BX, 1.6, OCHE + 0.3);
  [[0.004, 0.103], [-0.032, 0.088], [0.05, 0.15]].forEach(([x, y], i) => stick(darts[i], x, y, start.clone().setX(BX + (i - 1) * 0.2)));

  // ----- the chalkboard, on an easel in the corner by the window, turned to the oche -----
  const ex = -0.85, ez = 0.5, er = Math.atan2(BX - ex, OCHE + 0.3 - ez);
  const easel = new THREE.Group(); easel.position.set(ex, 0, ez); easel.rotation.y = er; lane.add(easel);
  const wood = std('#7a5232', { roughness: 0.7 });
  for (const s of [-1, 1]) { const leg = box(easel, 0.035, 1.75, 0.035, '', s * 0.27, 0.86, 0.02, { material: wood }); leg.rotation.z = s * -0.05; leg.rotation.x = -0.1; }
  const back = box(easel, 0.035, 1.6, 0.035, '', 0, 0.78, -0.3, { material: wood }); back.rotation.x = 0.2;
  box(easel, 0.58, 0.035, 0.07, '', 0, 0.68, 0.06, { material: wood });   // the ledge
  box(easel, 0.12, 0.02, 0.025, '', -0.15, 0.705, 0.07, { material: std('#e9e4da', { roughness: 1 }) });   // a duster
  cyl(easel, 0.005, 0.005, 0.07, '', 0.12, 0.705, 0.07, { material: std('#f4f1ea', { roughness: 1 }), shadow: false }).rotation.z = Math.PI / 2;
  const slate = makeCanvas(512, 704), chalk = new THREE.Group(); chalk.position.set(0, 1.1, 0.05); chalk.rotation.x = -0.1; easel.add(chalk);
  box(chalk, 0.56, 0.76, 0.025, '', 0, 0, -0.015, { material: wood });
  const slateM = new THREE.MeshStandardMaterial({ map: slate.tex, roughness: 0.95 });
  const slateMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.69), slateM); chalk.add(slateMesh);
  chalk.traverse((o) => { if (o.isMesh) Object.assign(o.userData, { action: 'dartsBoard', reach: 4 }); });
  const ew = toWorld(new THREE.Vector3(ex, 0, ez)); solid(ew.x, ew.z, 0.6, 0.6);

  // ----- the mat and the oche -----
  const mat = makeCanvas(128, 512), m = mat.ctx, ML = OCHE + 0.45 - (BZ - 0.04);
  m.fillStyle = '#26292d'; m.fillRect(0, 0, 128, 512);
  m.strokeStyle = 'rgba(255,255,255,.08)'; m.lineWidth = 2; m.strokeRect(6, 6, 116, 500);
  const ocheV = ((OCHE - (BZ - 0.04)) / ML) * 512;
  m.fillStyle = '#e9e4da'; m.fillRect(6, ocheV - 4, 116, 8);
  m.fillStyle = 'rgba(233,228,218,.55)'; m.font = `600 15px ${FONT}`; m.textAlign = 'center'; m.fillText('2.37 m', 64, ocheV - 14);
  mat.tex.needsUpdate = true;
  const matMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.75, ML), new THREE.MeshStandardMaterial({ map: mat.tex, roughness: 1 }));
  matMesh.rotation.x = -Math.PI / 2; matMesh.position.set(BX, 0.007, BZ - 0.04 + ML / 2); matMesh.receiveShadow = true; lane.add(matMesh);
  rugs.push({ x0: WX, x1: WX + ML, z0: WZ - 0.375, z1: WZ + 0.375 });
  box(lane, 0.6, 0.02, 0.04, '', BX, 0.01, OCHE, { material: std('#b08a3e', { metalness: 0.7, roughness: 0.35 }) });   // the brass toe line

  // ----- beanbags, in the lounge -----
  for (const b of BEANS) beanbag(b.x, b.z, b.rotY, b.color, std(b.color, { roughness: 1 }));

  // ----- the game: 501, double out -----
  const game = { left: 501, turn: [], turns: [], over: false, darts: 0 };
  const turnSum = () => game.turn.reduce((a, d) => a + d.n, 0);
  function paint() {
    const s = slate.ctx;
    s.fillStyle = '#26302c'; s.fillRect(0, 0, 512, 704);
    s.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 40; i++) s.fillRect((i * 97) % 512, (i * 211) % 704, 60 + (i % 5) * 20, 3);   // old smudges
    s.fillStyle = '#ece8dc'; s.strokeStyle = 'rgba(236,232,220,.7)'; s.lineWidth = 3;
    s.font = `700 68px ${MARKER}`; s.textAlign = 'center'; s.fillText('501', 256, 74);
    s.font = `400 34px ${MARKER}`; s.fillText('scored', 140, 128); s.fillText('left', 372, 128);
    s.beginPath(); s.moveTo(256, 96); s.lineTo(256, 556); s.moveTo(36, 142); s.lineTo(476, 142); s.stroke();
    const rows = game.turns.slice(-8);
    s.font = `400 42px ${MARKER}`;
    rows.forEach((t, i) => {
      const y = 192 + i * 50;
      s.fillText(t.bust ? 'bust' : String(t.scored), 140, y);
      s.fillText(String(t.left), 372, y);
      if (i < rows.length - 1) { s.beginPath(); s.moveTo(322, y - 12); s.lineTo(422, y - 26); s.stroke(); }   // crossed off
    });
    if (!rows.length) s.fillText('501', 372, 192);
    s.font = `400 40px ${MARKER}`;
    if (game.over) s.fillText('Game shot! ✦', 256, 616);
    else if (game.turn.length) s.fillText(`${game.turn.map((d) => d.label).join('  ')}  (${turnSum()})`, 256, 616);
    else s.fillText('game on', 256, 616);
    s.font = `400 26px ${MARKER}`; s.fillStyle = 'rgba(236,232,220,.6)'; s.fillText(`${game.darts} darts`, 256, 672);
    slate.tex.needsUpdate = true;
  }
  paint();
  function score(d) {
    if (game.over) Object.assign(game, { left: 501, turn: [], turns: [], over: false, darts: 0 });
    if (game.turn.done || game.turn.length === 3) game.turn = [];
    game.turn.push(d); game.darts++;
    const left = game.left - turnSum();
    if (left < 0 || left === 1 || (left === 0 && !d.double)) { game.turns.push({ scored: turnSum(), left: game.left, bust: true }); game.turn.done = true; }
    else if (left === 0) { game.turns.push({ scored: turnSum(), left: 0 }); game.left = 0; game.over = true; game.turn.done = true; }
    else if (game.turn.length === 3) { game.turns.push({ scored: turnSum(), left }); game.left = left; game.turn.done = true; }
    paint();
  }

  // ----- throwing -----
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -BZ), aim = new THREE.Vector3(), _q = new THREE.Vector3();
  let next = 0, flight = null;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const behind = () => { const p = toLane(_q.set(ctx.player.x, 0, ctx.player.z)); return p.z >= OCHE - 0.15 && Math.abs(p.x - BX) < 2; };
  function throwDart() {
    if (flight || !behind()) return false;
    ray.setFromCamera(new THREE.Vector2(0, 0), ctx.camera);
    ray.ray.applyMatrix4(lane.matrixWorld.clone().invert());   // into the lane
    if (!ray.ray.intersectPlane(plane, aim)) return false;
    // Where it lands: near the aim, by a pub player's hand (a few cm), never off the surround.
    let x = aim.x - BX + gauss() * 0.03, y = aim.y - BY + gauss() * 0.03;
    const r = Math.hypot(x, y);
    if (r > 0.225) { x *= 0.225 / r; y *= 0.225 / r; }
    if (next === 0) for (const d of darts) d.visible = false;   // pull the last three out
    const d = darts[next]; next = (next + 1) % 3;
    const cam = ctx.camera, from = toLane(new THREE.Vector3(0.12, -0.18, -0.3).applyQuaternion(cam.quaternion).add(cam.position));
    flight = { d, from, x, y, t: 0, T: Math.max(0.18, from.distanceTo(aim) / 8) };
    d.visible = true;
    return true;
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  ctx.onFrame((dt) => {
    if (!flight) return;
    const f = flight, to = _b.set(BX + f.x, BY + f.y, BZ + 0.038);
    f.t += dt;
    const u = Math.min(1, f.t / f.T), arc = (k) => _a.lerpVectors(f.from, to, k).setY(_a.y + 1.225 * f.T * f.T * 4 * k * (1 - k));
    if (u < 1) { const back = arc(Math.max(0, u - 0.05)).clone(); f.d.position.copy(arc(u)); f.d.lookAt(toWorld(back)); return; }
    stick(f.d, f.x, f.y, f.from);
    flight = null;
    score(scoreAt(f.x, f.y));
    ctx.sfx?.dart?.(f.d.getWorldPosition(_a));
  }, 45);

  ctx.action('darts', {
    hover: () => `<b>Darts</b><div class="m">${game.over ? 'Game shot! Throw again for a new game' : `501 · ${game.left - (game.turn.done ? 0 : turnSum())} left`}</div>
      <div class="k">${behind() ? 'Click to throw' : 'Stand behind the oche to throw'}</div>`,
    click: () => { throwDart(); },
  });
  ctx.action('dartsBoard', {
    hover: () => `<b>Darts scoreboard</b><div class="k">Click to wipe it for a new game</div>`,
    click: () => { Object.assign(game, { left: 501, turn: [], turns: [], over: false, darts: 0 }); paint(); },
  });
  ctx.hoverTargets(() => [board, ...darts, chalk], 45);
  Object.assign(ctx, { darts: { BEANS, game, throwDart, scoreAt } });
}
