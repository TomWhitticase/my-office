// THE ROOF BAR: an outdoor bar against the west glass of the roof terrace, between the two trees: a timber counter with
// five stools, a back bar of bottles over a fridge, a beer tap you can pull a pint from, all under a striped awning on
// black posts with bulbs that come on with the lamps. Clear of the helipad, the lift and the walk between them.

import * as THREE from 'three';
import { box, cyl, FONT, makeCanvas, makeScreen, mat, mergedBoxes, rng, sstep } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three gives every object a uuid from Math.random: build with a seeded one of our own (see helicopter.js).
  const random = Math.random;
  Math.random = rng(6262);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { roof, seats, ROOF, glowMat, addSeat, toast } = ctx;
  const G = roof.g, R = rng(6363), s0 = seats.length;
  // Laid out along z against the west glass: the back bar at the glass, the bartender's aisle, the counter, the stools.
  const Z0 = -3.4, Z1 = 1.0, ZM = (Z0 + Z1) / 2, L = Z1 - Z0;
  const BACK = -19.7, CX = -18.1, TOP = 1.08, STOOL = -17.35;
  const AW = { x0: -20.0, x1: -16.5, z0: -3.75, z1: 1.35, hi: 2.95, lo: 2.6 };   // the awning, falling to the east

  // The counter: a dark plinth, vertical timber slats on the customer side, a thick oak top with a lip and a steel
  // footrail, and a warm strip under the lip.
  const slatM = mat('#a87447', { roughness: 0.6 }), darkM = mat('#2b2d30', { roughness: 0.6 }), steelM = mat('#c9cdd2', { metalness: 0.85, roughness: 0.3 });
  const slats = [];
  for (let z = Z0 + 0.05; z < Z1 - 0.02; z += 0.11) slats.push([0.03, 0.9, 0.09, CX + 0.31, 0.53, z + 0.045, `hsl(26,${38 + R() * 8}%,${44 + R() * 8}%)`]);
  slats.push([0.64, 0.9, 0.04, CX + 0.01, 0.53, Z0 - 0.02, '#9a6a40'], [0.64, 0.9, 0.04, CX + 0.01, 0.53, Z1 + 0.02, '#9a6a40']);
  G.add(mergedBoxes(slats, mat('#ffffff', { vertexColors: true, roughness: 0.6 })));
  G.add(mergedBoxes([[0.6, 0.9, L, CX, 0.53, ZM], [0.66, 0.08, L + 0.04, CX, 0.04, ZM]], darkM));
  G.add(mergedBoxes([[0.8, 0.07, L + 0.1, CX + 0.06, TOP - 0.035, ZM], [0.5, 0.04, L - 0.1, CX - 0.08, 0.9, ZM]], mat('#8a5f3c', { roughness: 0.45 })));
  const rail = cyl(G, 0.025, 0.025, L - 0.2, '', CX + 0.42, 0.24, ZM, { material: steelM, seg: 10 }); rail.rotation.x = Math.PI / 2;
  for (const z of [Z0 + 0.3, ZM, Z1 - 0.3]) box(G, 0.12, 0.03, 0.03, '', CX + 0.37, 0.24, z, { material: steelM });
  box(G, 0.02, 0.02, L - 0.1, '', CX + 0.43, TOP - 0.08, ZM, { material: glowMat(1.8, '#ffe2b0'), shadow: false });
  roof.colliders.push({ minX: CX - 0.32, maxX: CX + 0.46, minZ: Z0 - 0.05, maxZ: Z1 + 0.05 });

  // The stools: a round tan leather seat on a chrome column with a footring, facing the counter.
  const leatherM = mat('#8a6448', { roughness: 0.7 }), chromeM = mat('#d5d8dc', { metalness: 0.9, roughness: 0.2 });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group(); g.position.set(STOOL, 0, Z0 + 0.45 + i * (L - 0.9) / 4); g.rotation.y = -Math.PI / 2; G.add(g);
    cyl(g, 0.2, 0.18, 0.07, '', 0, 0.76, 0, { material: leatherM, seg: 20 });
    cyl(g, 0.03, 0.03, 0.72, '', 0, 0.37, 0, { material: chromeM, seg: 10 });
    cyl(g, 0.21, 0.23, 0.025, '', 0, 0.013, 0, { material: chromeM, seg: 20 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 20), chromeM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    const seat = addSeat(g, 'Bar stool', 0, 1.5);
    g.traverse((o) => { if (o.isMesh) o.userData.seat = seat; });
  }
  for (const st of seats.slice(s0)) st.floor = ROOF;

  // The back bar: a fridge with glass doors (lit inside at night), a steel frame of shelves over it lined with bottles.
  G.add(mergedBoxes([[0.5, 0.92, L - 0.2, BACK, 0.46, ZM], [0.54, 0.04, L - 0.16, BACK + 0.02, 0.94, ZM]], darkM));
  roof.colliders.push({ minX: BACK - 0.3, maxX: BACK + 0.3, minZ: Z0 + 0.05, maxZ: Z1 - 0.05 });
  const fridgeM = glowMat(0.5, '#8fa6b4');
  for (let k = 0; k < 3; k++) {
    const z = Z0 + 0.1 + (k + 0.5) * (L - 0.2) / 3;
    box(G, 0.01, 0.62, (L - 0.2) / 3 - 0.12, '', BACK + 0.255, 0.48, z, { material: fridgeM, shadow: false });
    box(G, 0.03, 0.4, 0.025, '', BACK + 0.27, 0.5, z + (L - 0.2) / 6 - 0.12, { material: steelM, shadow: false });
  }
  const frame = [];
  for (const z of [Z0 + 0.12, ZM, Z1 - 0.12]) frame.push([0.04, 1.12, 0.04, BACK + 0.12, 1.5, z], [0.04, 1.12, 0.04, BACK - 0.12, 1.5, z]);
  const SHELF = [1.42, 1.86];
  for (const y of SHELF) frame.push([0.3, 0.03, L - 0.2, BACK, y, ZM]);
  G.add(mergedBoxes(frame, mat('#1e1f21', { metalness: 0.5, roughness: 0.45 })));
  for (const y of SHELF) box(G, 0.02, 0.012, L - 0.3, '', BACK + 0.13, y - 0.025, ZM, { material: glowMat(1.4, '#ffd9a0'), shadow: false });
  // Bottles: one lathe shape, instanced in a row on the fridge and on each shelf, in a spread of glass colours and heights.
  const prof = [[0, 0], [0.036, 0], [0.038, 0.01], [0.038, 0.19], [0.032, 0.22], [0.013, 0.26], [0.012, 0.31], [0.014, 0.315], [0, 0.315]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const bottleG = new THREE.LatheGeometry(prof, 12);
  const glassCols = ['#3d5a2a', '#6a3a16', '#2b4a3a', '#c9d6c8', '#7a2f1e', '#d9b45a', '#244a6a', '#4a2a1a', '#e5e2d6'];
  const spots = [];
  for (const y of [0.96, ...SHELF.map((s) => s + 0.016)]) for (let z = Z0 + 0.22; z < Z1 - 0.16; z += 0.1 + R() * 0.05) if (R() > 0.12) spots.push([y, z]);
  const bottles = new THREE.InstancedMesh(bottleG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15, metalness: 0.1 }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
  spots.forEach(([y, z], i) => {
    const s = 0.8 + R() * 0.4;
    bottles.setMatrixAt(i, m4.compose(pos.set(BACK + (R() - 0.5) * 0.08, y, z), q, sc.set(1, s, 1)));
    bottles.setColorAt(i, col.set(glassCols[Math.floor(R() * glassCols.length)]));
  });
  bottles.castShadow = true; G.add(bottles);

  // The beer tap at the counter's middle: a chrome tower with three handles and a drip tray. Click it for a pint.
  const TAP = { x: CX - 0.05, z: ZM };
  cyl(G, 0.05, 0.06, 0.38, '', TAP.x, TOP + 0.19, TAP.z, { material: chromeM, seg: 14 });
  const bar = cyl(G, 0.045, 0.045, 0.42, '', TAP.x, TOP + 0.38, TAP.z, { material: chromeM, seg: 14 }); bar.rotation.x = Math.PI / 2;
  box(G, 0.16, 0.02, 0.48, '', TAP.x + 0.12, TOP + 0.01, TAP.z, { material: mat('#3a3c40', { metalness: 0.6, roughness: 0.4 }) });
  const handleCols = ['#d97757', '#e8c33a', '#2b2d30'];
  for (let k = -1; k <= 1; k++) {
    const z = TAP.z + k * 0.15;
    cyl(G, 0.012, 0.016, 0.07, '', TAP.x + 0.06, TOP + 0.34, z, { material: chromeM, seg: 8 });   // the spout
    cyl(G, 0.014, 0.014, 0.05, '', TAP.x + 0.02, TOP + 0.43, z, { material: chromeM, seg: 8 });
    cyl(G, 0.02, 0.014, 0.17, handleCols[k + 1], TAP.x + 0.02, TOP + 0.54, z, { seg: 10, mat: { roughness: 0.4 } });
  }
  // The pint: glass, the beer rising in it, then the head.
  const pint = new THREE.Group(); pint.position.set(TAP.x + 0.08, TOP + 0.02, TAP.z); pint.visible = false; G.add(pint);
  const glass = cyl(pint, 0.042, 0.034, 0.16, '', 0, 0.08, 0,
    { material: new THREE.MeshStandardMaterial({ color: '#e8f0f2', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false }), seg: 18, shadow: false });
  const beer = cyl(pint, 0.039, 0.032, 1, '', 0, 0, 0, { material: mat('#b8650e', { roughness: 0.2, emissive: '#2a1200' }), seg: 18, shadow: false });
  const head = cyl(pint, 0.041, 0.039, 0.02, '#f4ead2', 0, 0, 0, { seg: 18, shadow: false, mat: { roughness: 0.9 } });
  const stream = cyl(G, 0.005, 0.005, 1, '', TAP.x + 0.08, 0, TAP.z, { material: beer.material, seg: 6, shadow: false });
  stream.visible = false;
  glass.renderOrder = 2;
  const tapHit = ctx.hitBox(G, 0.3, 0.55, 0.6, TAP.x, TOP + 0.3, TAP.z, { action: 'pint', reach: 2.6 });
  roof.hits.push(tapHit);
  const POUR = 3.2;
  let pour = -1;   // seconds into the pour, or -1 with nothing poured
  const fill = (t) => {
    const k = sstep(0, POUR - 0.6, t), h = 0.005 + k * 0.13;
    beer.scale.y = h; beer.position.y = 0.006 + h / 2;
    head.visible = t > 0.5; head.scale.y = 0.4 + sstep(1, POUR, t) * 1.2; head.position.y = 0.006 + h + head.scale.y * 0.01;
    stream.visible = t < POUR - 0.4;
    const top = TOP + 0.31, bot = TOP + 0.02 + 0.006 + h;
    stream.scale.y = top - bot; stream.position.y = (top + bot) / 2;
  };
  ctx.action('pint', {
    hover: () => (pour >= 0 && pour < POUR ? '<b>Pouring…</b>' : '<b>Beer tap</b><div class="k">Click to pull a pint</div>'),
    click: () => { if (pour >= 0 && pour < POUR) return; pour = 0; pint.visible = true; fill(0); },
  });
  ctx.onFrame((dt) => {
    if (pour < 0 || pour >= POUR) return;
    pour = Math.min(POUR, pour + dt); fill(pour);
    if (pour >= POUR) toast('Cheers 🍺');
  }, 50);

  // The awning: black posts like the festoon's, timber beams, and a striped canvas falling to the east with a scalloped
  // valance carrying the bar's name; a string of bulbs under its front edge and three over the counter.
  const posts = [[AW.x0 + 0.2, AW.z0 + 0.1], [AW.x0 + 0.2, AW.z1 - 0.1], [AW.x1 - 0.1, AW.z0 + 0.1], [AW.x1 - 0.1, AW.z1 - 0.1]];
  const postM = mat('#1e1f21', { metalness: 0.4, roughness: 0.5 }), beams = [];
  for (const [x, z] of posts) {
    const h = x < -19 ? AW.hi : AW.lo;
    beams.push([0.09, h, 0.09, x, h / 2, z]);
    roof.colliders.push({ minX: x - 0.08, maxX: x + 0.08, minZ: z - 0.08, maxZ: z + 0.08 });
  }
  for (const z of [AW.z0 + 0.1, AW.z1 - 0.1]) beams.push([AW.x1 - AW.x0 - 0.2, 0.09, 0.09, (AW.x0 + AW.x1) / 2 + 0.05, (AW.hi + AW.lo) / 2 - 0.05, z]);
  beams.push([0.09, 0.09, AW.z1 - AW.z0, AW.x1 - 0.1, AW.lo, (AW.z0 + AW.z1) / 2], [0.09, 0.09, AW.z1 - AW.z0, AW.x0 + 0.2, AW.hi, (AW.z0 + AW.z1) / 2]);
  G.add(mergedBoxes(beams, postM));
  const stripes = makeCanvas(64, 512), stc = stripes.ctx;   // bands across v, which runs along z: stripes down the slope
  for (let i = 0; i < 16; i++) { stc.fillStyle = i % 2 ? '#efe9dc' : '#d97757'; stc.fillRect(0, i * 32, 64, 32); }
  stripes.tex.needsUpdate = true;
  const canvasM = new THREE.MeshStandardMaterial({ map: stripes.tex, roughness: 0.9, side: THREE.DoubleSide });
  const run = AW.x1 - AW.x0 + 0.2, drop = AW.hi - AW.lo + 0.08, slope = Math.atan2(drop, run);
  const clothG = new THREE.PlaneGeometry(Math.hypot(run, drop), AW.z1 - AW.z0 + 0.2); clothG.rotateX(-Math.PI / 2); clothG.rotateZ(-slope);
  const cloth = new THREE.Mesh(clothG, canvasM);
  cloth.position.set((AW.x0 + AW.x1) / 2 + 0.05, (AW.hi + AW.lo) / 2 + 0.06, (AW.z0 + AW.z1) / 2);
  cloth.castShadow = cloth.receiveShadow = true; G.add(cloth);
  // The valance: scallops cut into a canvas strip, the name painted on the middle.
  const val = makeCanvas(1024, 64), vc = val.ctx;
  for (let i = 0; i < 32; i++) { vc.fillStyle = i % 2 ? '#efe9dc' : '#d97757'; vc.fillRect(i * 32, 0, 32, 64); }
  vc.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16; i++) { vc.beginPath(); vc.arc(i * 64 + 32, 70, 20, 0, Math.PI * 2); vc.fill(); }
  vc.globalCompositeOperation = 'source-over';
  vc.fillStyle = '#26282b'; vc.fillRect(392, 6, 240, 36); vc.font = `600 24px ${FONT}`; vc.fillStyle = '#f2efe8'; vc.textAlign = 'center';
  vc.fillText('ROOF  BAR', 512, 33);
  val.tex.needsUpdate = true;
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(AW.z1 - AW.z0 + 0.2, 0.26),
    new THREE.MeshStandardMaterial({ map: val.tex, roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 }));
  valance.rotation.y = Math.PI / 2; valance.position.set(AW.x1 + 0.05, AW.lo - 0.08, (AW.z0 + AW.z1) / 2); valance.castShadow = true; G.add(valance);
  // Bulbs: a sagging string along the front beam, and three pendants over the counter.
  const bulbM = glowMat(2.6, '#fff4dc'), bulbPts = [];
  for (let k = 1; k < 12; k++) { const u = k / 12; bulbPts.push([AW.x1 - 0.08, AW.lo - 0.28 - Math.sin(Math.PI * u) * 0.12, AW.z0 + 0.1 + u * (AW.z1 - AW.z0 - 0.2)]); }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 10, 6), bulbM, bulbPts.length);
  bulbPts.forEach(([x, y, z], i) => bulbs.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  G.add(bulbs);
  const shadeM = mat('#2b2b2b', { roughness: 0.5, side: THREE.DoubleSide }), glowM = glowMat(1.7);
  for (const z of [Z0 + 0.8, ZM, Z1 - 0.8]) {
    const yTop = 2.78, y = 2.05;
    cyl(G, 0.006, 0.006, yTop - y, '#222', CX, (yTop + y) / 2, z, { shadow: false });
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 20, 1, true), shadeM); sh.position.set(CX, y - 0.08, z); G.add(sh);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glowM); b.position.set(CX, y - 0.16, z); G.add(b);
  }

  // A chalkboard by the stools, propped on the counter's south end: tonight's taps.
  const board = makeScreen(G, 0.42, 0.56, 168, 224, CX + 0.2, TOP + 0.31, Z0 + 0.12), bc = board.ctx;
  board.mesh.rotation.y = Math.PI / 2;
  bc.fillStyle = '#23272a'; bc.fillRect(0, 0, 168, 224); bc.strokeStyle = '#8a5f3c'; bc.lineWidth = 10; bc.strokeRect(0, 0, 168, 224);
  bc.fillStyle = '#efe9dc'; bc.textAlign = 'center'; bc.font = `600 20px ${FONT}`; bc.fillText('ON TAP', 84, 40);
  bc.font = `400 15px ${FONT}`; bc.textAlign = 'left';
  [['Pale ale', '#d97757'], ['Lager', '#e8c33a'], ['Stout', '#c3c2b7']].forEach(([n, c], i) => {
    bc.fillStyle = c; bc.fillRect(22, 70 + i * 40, 10, 10); bc.fillStyle = '#efe9dc'; bc.fillText(n, 42, 80 + i * 40);
  });
  bc.fillStyle = '#9a9890'; bc.font = `400 12px ${FONT}`; bc.fillText('Sunset happy hour', 22, 204);
  board.mesh.material = new THREE.MeshStandardMaterial({ map: board.tex, roughness: 0.8 }); board.tex.needsUpdate = true;

  // On the roof's map: a label by the counter.
  const map = roof.map;
  roof.map = () => {
    map();
    const c = ctx.mapCtx, W = 440, H = 330;
    c.font = '600 15px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillText('Bar', ((-17.2 + 20) / 40) * W, ((ZM + 15) / 30) * H + 5);
  };
}
