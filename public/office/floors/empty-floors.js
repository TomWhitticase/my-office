// The empty floors (46, 45, 44) under the office: the office's shell with nothing in it, in the office's own scene a floor
// or more down (so the city, sky, sun and low cloud out of the windows are the ones you'd see from there). One build moves
// to whichever of them you ride to: the same walls, glazing, beamed ceiling and lift core as 48, carpet tiles, the columns,
// a few open floor boxes, protective sheeting out of the lifts, and a To Let board.

import * as THREE from 'three';
import { clamp, ease, FONT, LIFT, makeCanvas, makeScreen, mat, mergedBoxes, rng, ROOM } from '../util.js';

const STOREY = ROOM.h + 0.5;   // floor to floor, as the roof sits over the office
export const EMPTY = [46, 45, 44];

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three gives every object a uuid from Math.random: build with a seeded one of our own, so adding these doesn't shift
  // the draws everything after makes in a seeded run (the harness).
  const random = Math.random;
  Math.random = rng(4646);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { world, lifts, CORE, DOOR, hitBox, carPanel, paintPanel, liftCore, floorSign, shellWalls, sunbeams, shaftU, WIN, ceilingM, glowMat,
    paintIndicator, addFloor, mapCtx, camera, lamps, mine } = ctx;
  const G = new THREE.Group(), R = rng(4545);
  G.visible = false; world.add(G);
  /** @type {{ minX: number, maxX: number, minZ: number, maxZ: number }[]} */
  const colliders = [];
  const floorY = { value: 0 };
  let shafts;
  const solid = (x, z, w, d) => colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

  // The shell, merged by material: walls, glazing, ceiling and beams as on 48, the south wall left plain.
  {
    const byM = new Map();
    const put = (w, h, d, x, y, z, m) => { if (!byM.has(m)) byM.set(m, []); byM.get(m).push([w, h, d, x, y, z]); };
    const { panes, outerGlassM } = shellWalls(put, ceilingM, false);
    for (const [m, list] of byM) { const mesh = mergedBoxes(list, m); mesh.castShadow = m !== outerGlassM; G.add(mesh); }
    // Sunbeams like 48's, with no blinds to cut them, faded at this floor's own boards.
    shafts = sunbeams(panes, { ...shaftU, shut: { value: WIN.map(() => 0) }, floorY });
    G.add(shafts);
  }

  // Carpet tiles, half a metre square, the pile laid alternately (so they read as a checker in the light).
  {
    const t = makeCanvas(512, 512), c = t.ctx, n = 8, s = 512 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = (i + j) % 2 ? 92 : 100, d = R() * 6;
      c.fillStyle = `rgb(${v + d},${v + d + 2},${v + d + 6})`; c.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 140; k++) { c.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '20,22,28'},${0.04 + R() * 0.06})`;
        const x = i * s + R() * s, y = j * s + R() * s; (i + j) % 2 ? c.fillRect(x, y, 1, 3 + R() * 4) : c.fillRect(x, y, 3 + R() * 4, 1); }
    }
    c.fillStyle = 'rgba(30,32,36,.45)'; for (let k = 0; k <= n; k++) { c.fillRect(k * s - 1, 0, 2, 512); c.fillRect(0, k * s - 1, 512, 2); }
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(40 / 4, 30 / 4); t.tex.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ map: t.tex, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; G.add(floor);
  }

  // Bare concrete columns where 48's timber-clad pillars stand.
  {
    const cols = [[4, -8], [4, 8], [-9, 0.5 - 2.6]];
    G.add(mergedBoxes(cols.map(([x, z]) => [0.5, ROOM.h, 0.5, x, ROOM.h / 2, z]), mat('#a9a7a2', { roughness: 0.92 })));
    for (const [x, z] of cols) solid(x, z, 0.5, 0.5);
  }

  // Recessed LED panels between the beams, on the lamps (off by day, dim at night: nobody's here).
  {
    const panels = [];
    for (let x = -16; x <= 16; x += 4) for (const z of [-11, -5.5, 0, 5.5, 11]) panels.push([0.32, 0.02, 1.2, x, ROOM.h - 0.01, z]);
    const m = mergedBoxes(panels, glowMat(0.35, '#eef2f6')); m.castShadow = false; G.add(m);
  }

  // Floor boxes with their lids off: the tile lifted beside each, the box's sockets, and a loose coil of cable or two.
  {
    const parts = [], dark = [];
    for (const [x, z] of [[-14, -9], [-6, -9], [-14, 9], [-2, 4], [10, -10], [10, 9]]) {
      dark.push([0.5, 0.004, 0.5, x, 0.002, z]);
      parts.push([0.36, 0.05, 0.22, x, 0.03, z, '#6d7177'], [0.08, 0.012, 0.06, x - 0.08, 0.061, z, '#e9e7e2'], [0.08, 0.012, 0.06, x + 0.08, 0.061, z, '#c0392b']);
      const a = R() * Math.PI * 2, lx = x + Math.cos(a) * 0.62, lz = z + Math.sin(a) * 0.62;
      parts.push([0.5, 0.012, 0.5, lx, 0.012, lz, '#62666d']);   // the lifted tile
      for (let k = 0; k < 1 + Math.floor(R() * 2); k++) {
        const len = 0.5 + R() * 0.9, ang = R() * Math.PI;
        const cable = [0.025, 0.02, len, x + Math.sin(ang) * len / 2, 0.012, z + Math.cos(ang) * len / 2, k ? '#2f6fd1' : '#1d1e20'];
        parts.push(cable);
      }
    }
    G.add(mergedBoxes(parts, mat('#ffffff', { vertexColors: true, roughness: 0.7 })), mergedBoxes(dark, mat('#141518', { roughness: 1 })));
  }

  // Protective sheeting from the lifts out across the lobby, taped down at the edges.
  {
    const sheetM = new THREE.MeshStandardMaterial({ color: '#e8eef2', transparent: true, opacity: 0.35, roughness: 0.25, depthWrite: false });
    for (const [x0, x1, z0, z1, y] of [[9.5, LIFT.x - 0.05, -1.6, 0.9, 0.006], [9.0, 15.5, 0.4, 2.6, 0.008]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), sheetM);
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; G.add(m);
    }
    const tape = [];
    for (const [x0, x1, z0, z1] of [[9.5, LIFT.x - 0.05, -1.6, 0.9], [9.0, 15.5, 0.4, 2.6]])
      tape.push([x1 - x0, 0.003, 0.05, (x0 + x1) / 2, 0.01, z0], [x1 - x0, 0.003, 0.05, (x0 + x1) / 2, 0.01, z1], [0.05, 0.003, z1 - z0, x0, 0.01, (z0 + z1) / 2]);
    G.add(mergedBoxes(tape, mat('#c9b25a', { roughness: 0.6 })));
  }

  // The lift core as on 48: both cars, their lanterns and the call panel; the floor sign and its directory.
  const core = liftCore(G, lifts.map((L) => L.z));
  solid((LIFT.x + CORE.x1) / 2, (CORE.z0 + CORE.z1) / 2, CORE.x1 - LIFT.x, CORE.z1 - CORE.z0);
  const sign = floorSign(G, EMPTY[0], () => ['Available', 'Vacant floor · To let']);
  const cars = core.cars.map((c) => ({ ...c, lantern: { ind: c.ind, floor: 48, dir: 0 } }));
  const callHit = hitBox(G, 0.06, 0.42, 0.22, LIFT.x - 0.03, 1.1, LIFT.z, { action: 'liftcall', reach: 2.5 });
  const panel = carPanel(G, 0); paintPanel(panel, null);   // one, moved into your car (see enter)

  // A letting agent's board on its stand, out in the lobby, turned to the lift doors.
  const BX = 15.6, BZ = 3.7, ry = Math.atan2(LIFT.x - BX, LIFT.z - BZ);
  const board = makeScreen(G, 1.0, 1.3, 400, 520, BX, 1.25, BZ);
  board.mesh.rotation.y = ry;
  board.mesh.material = new THREE.MeshStandardMaterial({ map: board.tex, roughness: 0.6 });
  {
    const stand = new THREE.Group(); stand.position.set(BX, 0, BZ); stand.rotation.y = ry; G.add(stand);
    stand.add(mergedBoxes([[1.04, 1.34, 0.03, 0, 1.25, -0.02], [0.04, 1.0, 0.04, -0.45, 0.5, -0.05], [0.04, 1.0, 0.04, 0.45, 0.5, -0.05],
      [0.04, 0.03, 0.5, -0.45, 0.015, -0.05], [0.04, 0.03, 0.5, 0.45, 0.015, -0.05]], mat('#2a2c30', { roughness: 0.5 })));
    solid(BX, BZ, 1.0, 1.0);
  }
  function paintBoard(n) {
    const c = board.ctx, W = 400;
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, 520);
    c.fillStyle = '#d97757'; c.fillRect(0, 0, W, 150);
    c.fillStyle = '#ffffff'; c.font = `700 92px ${FONT}`; c.textAlign = 'center'; c.fillText('TO LET', W / 2, 112);
    c.fillStyle = '#26282b'; c.font = `200 120px ${FONT}`; c.fillText(String(n), W / 2, 290);
    c.font = `600 26px ${FONT}`; c.fillText('OPEN-PLAN OFFICE', W / 2, 344);
    c.font = `400 24px ${FONT}`; c.fillStyle = '#5a5c60'; c.fillText('1,200 m² · fully glazed', W / 2, 384); c.fillText('Available now', W / 2, 416);
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(40, 446, W - 80, 2);
    c.fillStyle = '#26282b'; c.font = `600 22px ${FONT}`; c.fillText('Enquiries: reception, 48', W / 2, 486);
    c.textAlign = 'left'; board.tex.needsUpdate = true;
  }

  // The floors: one entry each on the car panel and the directory, all built from G (moved to the one you ride to).
  for (const n of EMPTY) {
    const F = /** @type {import('../ctx.js').Floor} */ ({ n, label: 'VACANT', title: 'Vacant floor', blurb: 'Available · To let', y: (n - 48) * STOREY,
      colliders, hits: [callHit, panel.mesh] });
    F.enter = (z) => {
      G.position.y = F.y; floorY.value = F.y; G.visible = true;
      panel.mesh.position.z = z + 0.68;
      sign.n = n; sign.paint(); paintBoard(n);
    };
    F.leave = () => { G.visible = false; };
    F.bound = (p) => { p.x = clamp(p.x, ROOM.minX + 0.4, ROOM.maxX - 0.4); p.z = clamp(p.z, ROOM.minZ + 0.4, ROOM.maxZ - 0.4); };
    F.fx = () => {
      // Your car's doors open here; the other stays shut. Each lantern shows where its car is.
      lifts.forEach((L, i) => {
        const e = L === mine.L ? ease(L.doorK) : 0;
        cars[i].leaves.forEach((m, k) => { m.position.z = L.z + (k ? 1 : -1) * (DOOR.w / 4 + e * DOOR.w * 0.48); });
        Object.assign(cars[i].lantern, { floor: L.floor, dir: L.dir }); paintIndicator(cars[i].lantern);
      });
      core.callM.emissiveIntensity = mine.L?.state === 'opening' ? 2.5 : 0;
      shafts.visible = ctx.quality;
      for (const l of lamps) if (l.light) l.light.intensity = 0;   // 48's lamps don't shine down through the slab
    };
    F.map = () => drawMap(n);
    addFloor(F);
  }

  function drawMap(n) {
    const c = mapCtx, W = 440, H = 330, sx = (x) => ((x - ROOM.minX) / 40) * W, sz = (z) => ((z - ROOM.minZ) / 30) * H;
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 3; c.strokeRect(sx(-19.9), sz(-14.9), sx(19.9) - sx(-19.9), sz(14.9) - sz(-14.9));
    c.fillStyle = 'rgba(232,238,242,.18)'; c.fillRect(sx(9), sz(-1.6), sx(LIFT.x) - sx(9), sz(2.6) - sz(-1.6));
    c.fillStyle = 'rgba(255,255,255,.22)';
    for (const b of colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(2, sx(b.maxX) - sx(b.minX)), Math.max(2, sz(b.maxZ) - sz(b.minZ)));
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText(`Floor ${n} · vacant`, sx(-8), sz(0.6));
    c.font = '600 15px system-ui'; c.fillText('Lifts', sx(LIFT.x) - 44, sz(-2.6));
    const px = sx(camera.position.x), pz = sz(camera.position.z);
    c.save(); c.translate(px, pz); c.rotate(-camera.rotation.y);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }
}
