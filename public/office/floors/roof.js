// THE ROOF (R): the tower's roof terrace, in the office's own scene (same sky, sun, city and shadows), shown only while
// you're up there: a glass balustrade round paving and decking, a lounge, fire table and cafe under festoon lights, planters
// and a BBQ, a helipad, the plant behind a louvred screen, and the lift overrun your car opens out of.

import * as THREE from 'three';
import { box, clamp, colliders, cyl, FONT, lerp, LIFT, makeCanvas, makeScreen, mat, mergedBoxes, rng, ROOM, SEATED_EYE } from '../util.js';

export function install(ctx) {
  const { ROOF, seats, world, CAR, CORE, lifts, hitBox, carPanel, paintPanel, city, plantKit, sofa, lamps, glowMat, addFloor, DOOR, addSeat,
    paintIndicator, mapCtx, camera } = ctx;
  // ----- THE ROOF (R) -----
  // The tower's roof terrace, over the office in the same scene, so the sky, sun, city, clouds and shadows are the ones
  // you see from your desk. Paving and decking inside a glass balustrade; a lounge, a fire table and a café under festoon
  // lights (on at dusk with the lamps); planters, a herb bed and a BBQ; a helipad; the plant (condensers, a water tank,
  // vents) behind a louvred screen; and the lift overrun your car opens out of, under a mast with a red aviation light.
  // Built at deck height 0 in roof.g, which sits at ROOF_Y and is only shown while you're up here.
  const ROOF_Y = ROOM.h + 0.5, EDGE = { x: 20.3, z: 15.3 }, HELI = { x: -9.5, z: 8.6, r: 5.6 };
  const roof = { n: ROOF, label: 'ROOF', title: 'Roof terrace', y: ROOF_Y, sound: 'roof', g: new THREE.Group(), colliders: [], cars: [], fans: [] };
  {
    const G = roof.g, c0 = colliders.length, s0 = seats.length, R = rng(5050);
    G.position.y = ROOF_Y; G.visible = false; world.add(G);
    const flat = (w, d, m, x, z, y = 0.002) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; G.add(p); return p; };
    // Paving: big pale concrete slabs, a little uneven in tone. Decking: weathered hardwood boards.
    const pave = makeCanvas(512, 512), pc = pave.ctx;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = 128 + R() * 20; pc.fillStyle = `rgb(${v},${v - 2},${v - 6})`; pc.fillRect(i * 128, j * 128, 128, 128); }
    for (let i = 0; i < 9000; i++) { pc.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '50,48,44'},${R() * 0.07})`; pc.fillRect(R() * 512, R() * 512, 1 + R() * 2, 1 + R() * 2); }
    pc.fillStyle = '#6d6a64'; for (let k = 0; k <= 4; k++) { pc.fillRect(k * 128 - 2, 0, 4, 512); pc.fillRect(0, k * 128 - 2, 512, 4); }
    pave.tex.wrapS = pave.tex.wrapT = THREE.RepeatWrapping; pave.tex.repeat.set(40.6 / 2.4, 30.6 / 2.4); pave.tex.needsUpdate = true;
    const deck = makeCanvas(512, 512), dc = deck.ctx;
    for (let j = 0; j < 8; j++) for (let x = 0; x < 512;) {
      const len = 160 + R() * 260, v = R(); dc.fillStyle = `rgb(${128 + v * 30},${100 + v * 22},${78 + v * 16})`; dc.fillRect(x, j * 64, len, 64);
      for (let g = 0; g < 14; g++) { dc.fillStyle = `rgba(60,40,28,${0.06 + R() * 0.08})`; dc.fillRect(x, j * 64 + 4 + R() * 56, len, 1 + R() * 2); }
      dc.fillStyle = '#3b2c22'; dc.fillRect(x, j * 64, 3, 64); x += len;
    }
    dc.fillStyle = '#2a201a'; for (let j = 0; j < 8; j++) dc.fillRect(0, j * 64, 512, 5);
    deck.tex.wrapS = deck.tex.wrapT = THREE.RepeatWrapping; deck.tex.needsUpdate = true;
    const slabM = mat('#8f8c86', { roughness: 0.9 });
    box(G, EDGE.x * 2, 0.3, EDGE.z * 2, '', 0, -0.15, 0, { material: slabM });
    flat(EDGE.x * 2, EDGE.z * 2, new THREE.MeshStandardMaterial({ map: pave.tex, roughness: 0.92 }), 0, 0);
    const TER = { x0: -19.6, x1: 16.6, z0: -14.0, z1: -4.0 };   // the decked terrace, south side
    const dt = deck.tex.clone(); dt.repeat.set((TER.x1 - TER.x0) / 2.6, (TER.z1 - TER.z0) / 1.3); dt.needsUpdate = true;
    box(G, TER.x1 - TER.x0, 0.03, TER.z1 - TER.z0, '', (TER.x0 + TER.x1) / 2, 0.015, (TER.z0 + TER.z1) / 2, { material: new THREE.MeshStandardMaterial({ map: dt, roughness: 0.8 }) });

    // The edge: a stone upstand, frameless glass on top and a steel handrail you can lean on.
    const up = [], rail = [], joints = [], H = 1.12, gw = 0.35;
    for (const s of [-1, 1]) {
      up.push([EDGE.x * 2, 0.3, gw, 0, 0.15, s * (EDGE.z - gw / 2)], [gw, 0.3, EDGE.z * 2 - gw * 2, s * (EDGE.x - gw / 2), 0.15, 0]);
      rail.push([EDGE.x * 2 - 0.2, 0.05, 0.07, 0, H, s * (EDGE.z - gw / 2)], [0.07, 0.05, EDGE.z * 2 - 0.2, s * (EDGE.x - gw / 2), H, 0],
        [EDGE.x * 2 - 0.2, 0.09, 0.08, 0, 0.345, s * (EDGE.z - gw / 2)], [0.08, 0.09, EDGE.z * 2 - 0.2, s * (EDGE.x - gw / 2), 0.345, 0]);
      for (let x = -EDGE.x + 1.9; x < EDGE.x - 1; x += 1.9) joints.push([0.012, H - 0.39, 0.03, x, (H + 0.39) / 2, s * (EDGE.z - gw / 2)]);
      for (let z = -EDGE.z + 1.9; z < EDGE.z - 1; z += 1.9) joints.push([0.03, H - 0.39, 0.012, s * (EDGE.x - gw / 2), (H + 0.39) / 2, z]);
      // Colliders at the glass, so you can walk right up to the rail and look over.
      roof.colliders.push({ minX: -EDGE.x, maxX: EDGE.x, minZ: s > 0 ? EDGE.z - gw / 2 - 0.05 : -EDGE.z, maxZ: s > 0 ? EDGE.z : -EDGE.z + gw / 2 + 0.05 },
        { minX: s > 0 ? EDGE.x - gw / 2 - 0.05 : -EDGE.x, maxX: s > 0 ? EDGE.x : -EDGE.x + gw / 2 + 0.05, minZ: -EDGE.z, maxZ: EDGE.z });
    }
    G.add(mergedBoxes(up, mat('#b9b4aa', { roughness: 0.85 })), mergedBoxes([...rail, ...joints], mat('#c9cdd2', { metalness: 0.85, roughness: 0.3 })));
    const glassM = new THREE.MeshStandardMaterial({ color: '#d6e8ee', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const pane = mergedBoxes([0, 1].flatMap((i) => [-1, 1].map((s) => i ? [0.02, H - 0.39, EDGE.z * 2 - 0.2, s * (EDGE.x - gw / 2), (H + 0.39) / 2, 0] : [EDGE.x * 2 - 0.2, H - 0.39, 0.02, 0, (H + 0.39) / 2, s * (EDGE.z - gw / 2)])), glassM);
    pane.castShadow = false; G.add(pane);

    // The lift overrun: two cars over the core, the same cars as downstairs, stone portal under a canopy, zinc above.
    const top = 3.3, fx = LIFT.x + 0.05, cx = LIFT.x + 0.1 + CAR.d / 2, back = LIFT.x + 0.1 + CAR.d, z0 = CORE.z0 - 0.2, z1 = CORE.z1 + 0.2, x1 = EDGE.x - gw;
    const stone = [], zinc = [], steel = [], car = [], mirror = [], glow = [];
    const edges = [z0, ...lifts.flatMap((L) => [L.z - DOOR.w / 2, L.z + DOOR.w / 2]), z1];
    for (let k = 0; k < edges.length; k += 2) stone.push([0.1, top, edges[k + 1] - edges[k], fx, top / 2, (edges[k] + edges[k + 1]) / 2]);
    zinc.push([x1 - LIFT.x, top, 0.1, (LIFT.x + x1) / 2, top / 2, z0 + 0.05], [x1 - LIFT.x, top, 0.1, (LIFT.x + x1) / 2, top / 2, z1 - 0.05],
      [x1 - LIFT.x + 0.2, 0.25, z1 - z0 + 0.2, (LIFT.x + x1) / 2, top + 0.125, (z0 + z1) / 2], [0.1, top, z1 - z0, x1 - 0.05, top / 2, (z0 + z1) / 2]);
    for (let x = LIFT.x + 0.5; x < x1; x += 0.5) for (const s of [-1, 1]) zinc.push([0.03, top, 0.03, x, top / 2, s > 0 ? z1 + 0.01 : z0 - 0.01]);   // standing seams
    steel.push([1.3, 0.1, z1 - z0 + 0.6, LIFT.x - 0.6, 2.95, (z0 + z1) / 2], [0.02, 0.38, 0.15, LIFT.x - 0.01, 1.1, LIFT.z]);   // canopy, call panel
    roof.callM = new THREE.MeshStandardMaterial({ color: '#e6e3dc', emissive: '#ffb347', emissiveIntensity: 0, roughness: 0.4 });
    for (const y of [1.16, 1.04]) cyl(G, 0.026, 0.026, 0.02, '', LIFT.x - 0.025, y, LIFT.z, { material: y > 1.1 ? mat('#e6e3dc', { roughness: 0.4 }) : roof.callM, seg: 16, shadow: false }).rotation.z = Math.PI / 2;
    const steelM = ctx.liftSteelM;   // the office's brushed steel, so doors and surrounds match on every floor
    for (const L of lifts) {
      const z = L.z;
      stone.push([0.1, top - DOOR.h, DOOR.w, fx, (top + DOOR.h) / 2, z]);
      for (const s of [-1, 1]) steel.push([0.05, DOOR.h + 0.08, 0.08, LIFT.x - 0.02, (DOOR.h + 0.08) / 2, z + s * (DOOR.w / 2 + 0.04)]);
      steel.push([0.05, 0.08, DOOR.w + 0.16, LIFT.x - 0.02, DOOR.h + 0.04, z], [0.34, 0.012, DOOR.w, fx + 0.02, 0.006, z], [0.04, 0.26, 0.56, LIFT.x - 0.02, 2.5, z]);
      car.push([CAR.d, 0.02, CAR.w, cx, 0.01, z, '#2c2b2a'], [CAR.d, 0.04, CAR.w, cx, CAR.h, z, '#232426'], [0.04, CAR.h, CAR.w, back, CAR.h / 2, z, '#8a6446']);
      for (const s of [-1, 1]) car.push([CAR.d, CAR.h, 0.04, cx, CAR.h / 2, z + s * CAR.w / 2, '#aeb4ba'], [CAR.d - 0.3, 0.035, 0.035, cx + 0.1, 0.95, z + s * (CAR.w / 2 - 0.06), '#dfe2e5']);
      car.push([0.035, 0.035, CAR.w - 0.2, back - 0.06, 0.95, z, '#dfe2e5'], [0.02, 0.4, 0.16, LIFT.x + 0.35, 1.2, z + CAR.w / 2 - 0.03, '#5a5f66']);
      mirror.push([0.01, 1.05, CAR.w - 0.3, back - 0.025, 1.65, z]);
      glow.push([CAR.d - 0.5, 0.01, CAR.w - 0.45, cx, CAR.h - 0.025, z]);
      // Doors and lantern in a group on the car's z, so they slide like every floor's (see myLift).
      const dg = new THREE.Group(); dg.position.z = z; G.add(dg);
      const ind = makeScreen(dg, 0.48, 0.2, 192, 80, LIFT.x - 0.045, 2.5, 0);
      ind.mesh.rotation.y = -Math.PI / 2;
      roof.cars.push({ z, leaves: [-1, 1].map((s) => box(dg, 0.03, DOOR.h, DOOR.w / 2 + 0.01, '', LIFT.x + 0.13, DOOR.h / 2, s * DOOR.w / 4, { material: steelM, shadow: false })), ind: { ind, floor: L.floor, dir: 0 } });
    }
    G.add(mergedBoxes(stone, mat('#77716a', { roughness: 0.55 })), mergedBoxes(zinc, mat('#5d636a', { metalness: 0.5, roughness: 0.55 })), mergedBoxes(steel, steelM),
      mergedBoxes(car, mat('#ffffff', { vertexColors: true, roughness: 0.45, metalness: 0.35 })), mergedBoxes(mirror, mat('#dfe4e8', { metalness: 1, roughness: 0.05 })));
    const carLight = mergedBoxes(glow, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3df', emissiveIntensity: 1.6 }));
    carLight.castShadow = false; G.add(carLight);
    roof.callHit = hitBox(G, 0.06, 0.42, 0.22, LIFT.x - 0.03, 1.1, LIFT.z, { action: 'liftcall', reach: 2.5 });
    roof.panel = carPanel(G, 0); paintPanel(roof.panel, null);   // one, moved into your car (see roof.enter)
    roof.colliders.push({ minX: LIFT.x, maxX: EDGE.x, minZ: z0, maxZ: z1 });
    // A plaque by the doors, like the floor sign downstairs.
    const sign = makeScreen(G, 0.9, 0.6, 360, 240, LIFT.x - 0.012, 1.6, z0 + 0.62), sc = sign.ctx;
    sign.mesh.rotation.y = -Math.PI / 2;
    sc.fillStyle = '#26282b'; sc.fillRect(0, 0, 360, 240); sc.fillStyle = '#d97757'; sc.fillRect(26, 40, 5, 90);
    sc.font = `200 104px ${FONT}`; sc.fillStyle = '#f2efe8'; sc.fillText('R', 44, 128);
    sc.font = `600 22px ${FONT}`; sc.fillStyle = '#c3c2b7'; sc.fillText('ROOF', 130, 72); sc.font = `400 20px ${FONT}`; sc.fillText('Terrace · Helipad', 130, 104);
    sc.fillStyle = '#9a9890'; sc.font = `400 17px ${FONT}`; sc.fillText('Please don’t lean over the glass', 26, 196);
    sign.mesh.material = new THREE.MeshStandardMaterial({ map: sign.tex, roughness: 0.5 }); sign.tex.needsUpdate = true;
    // The mast on the overrun: a tapered pole, two arms of antennas and the red light on top (it blinks with the city's).
    const mx = 19.2, mz = 1.6, mh = 9;
    cyl(G, 0.05, 0.1, mh, '#b8bcc0', mx, top + 0.25 + mh / 2, mz, { mat: { metalness: 0.7, roughness: 0.4 }, seg: 10 });
    for (const [y, l] of [[top + 4, 1.4], [top + 6.5, 1]]) {
      box(G, l, 0.05, 0.05, '#b8bcc0', mx, y, mz);
      for (const s of [-1, 1]) cyl(G, 0.02, 0.02, 1.1, '#e5e5e2', mx + s * l / 2, y + 0.3, mz, { seg: 6 });
    }
    const dish = cyl(G, 0.32, 0.05, 0.14, '#e9e8e4', mx - 0.2, top + 2.6, mz, { seg: 20 }); dish.rotation.z = Math.PI / 2 - 0.3;
    const av = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), city.av); av.position.set(mx, top + 0.3 + mh, mz); G.add(av);

    // Planters: long ones of swaying grasses along the edge, big square ones with a small tree.
    const planterM = mat('#3d4042', { roughness: 0.7 }), soilM = mat('#3b2c22', { roughness: 1 });
    const { strap, twig, stem, add } = plantKit(), p = new THREE.Vector3(), d = new THREE.Vector3(), col = new THREE.Color();
    const grass = (x, z, n, h) => {
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, r = R() * 0.08, hh = h * (0.6 + R() * 0.5);
        p.set(x + Math.cos(a) * r, ROOF_Y + 0.5, z + Math.sin(a) * r); d.set(Math.cos(a) * (0.15 + R() * 0.35), 1, Math.sin(a) * (0.15 + R() * 0.35));
        add(strap, p, d, hh * 0.22, hh, R() * 3, col.setRGB(0.95 + R() * 0.25, 1.0, 0.55 + R() * 0.25));
      }
    };
    const planter = (x0, x1, z) => {
      G.add(mergedBoxes([[x1 - x0, 0.5, 0.6, (x0 + x1) / 2, 0.25, z]], planterM)); box(G, x1 - x0 - 0.08, 0.02, 0.52, '', (x0 + x1) / 2, 0.49, z, { material: soilM, shadow: false });
      for (let x = x0 + 0.25; x < x1 - 0.15; x += 0.42) grass(x + (R() - 0.5) * 0.1, z + (R() - 0.5) * 0.25, 7, 0.75);
      roof.colliders.push({ minX: x0, maxX: x1, minZ: z - 0.3, maxZ: z + 0.3 });
    };
    planter(-19.7, -9.4, -14.55); planter(-6.4, 6.2, -14.55); planter(8.6, 16.8, -14.55);
    for (const z of [-11.6, -6.6, 6.5, 11]) { G.add(mergedBoxes([[0.6, 0.5, 3.4, -19.55, 0.25, z]], planterM)); for (let k = -1.5; k <= 1.5; k += 0.42) grass(-19.55, z + k, 7, 0.75); roof.colliders.push({ minX: -19.85, maxX: -19.25, minZ: z - 1.7, maxZ: z + 1.7 }); }
    const tree = (x, z) => {
      G.add(mergedBoxes([[1.2, 0.7, 1.2, x, 0.35, z]], planterM)); box(G, 1.1, 0.02, 1.1, '', x, 0.69, z, { material: soilM, shadow: false });
      const y0 = ROOF_Y + 0.7, tint = new THREE.Color(0.85 + R() * 0.15, 1, 0.75 + R() * 0.2);
      add(stem, p.set(x, y0, z), d.set(0.05, 1, 0.03), 0.06, 1.9);
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + R(); p.set(x, y0 + 1.4 + R() * 0.4, z); d.set(Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6); add(stem, p, d, 0.025, 0.9); }
      for (let i = 0; i < 120; i++) {
        const u = R() * 2 - 1, a = R() * Math.PI * 2, k = Math.sqrt(1 - u * u), f = 0.45 + R() * 0.55;
        d.set(Math.cos(a) * k, u * 0.6 + 0.2, Math.sin(a) * k);
        p.set(x + d.x * 0.95 * f, y0 + 2.35 + d.y * 0.75 * f, z + d.z * 0.95 * f); d.y += 0.3;
        const h = 0.36 + R() * 0.16;
        add(twig, p, d, h * 0.9, h, (R() - 0.5) * 1.2, col.copy(tint).multiplyScalar((0.55 + 0.45 * f) * (0.85 + R() * 0.3)));
      }
      roof.colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
    };
    tree(-7.9, -14.1); tree(7.4, -14.1); tree(15.6, -4.9); tree(-19.1, -4.6); tree(-19.1, 2.2); tree(4.2, 13.9);

    // The lounge by the lift, and round the fire table: sofas you can sit on.
    sofa(11, -12.1, 0, 2.6, '#d9d3c7', G); sofa(11, -7.5, Math.PI, 2.6, '#d9d3c7', G); sofa(8.3, -9.8, Math.PI / 2, 1.05, '#c26a3d', G); sofa(13.7, -9.8, -Math.PI / 2, 1.05, '#c26a3d', G);
    G.add(mergedBoxes([[1.6, 0.36, 0.8, 11, 0.2, -9.8, '#8a6a4a'], [1.5, 0.03, 0.7, 11, 0.395, -9.8, '#a8835d']], mat('#ffffff', { vertexColors: true, roughness: 0.7 })));
    roof.colliders.push({ minX: 10.2, maxX: 11.8, minZ: -10.2, maxZ: -9.4 });
    sofa(-1.5, -12.6, 0, 2.8, '#5f6f68', G); sofa(-4.4, -10.2, Math.PI / 2, 2.2, '#5f6f68', G); sofa(1.4, -10.2, -Math.PI / 2, 2.2, '#5f6f68', G);
    const fire = new THREE.MeshStandardMaterial({ color: '#2a1a10', emissive: '#ff7a2a', emissiveIntensity: 1.2, roughness: 0.6 });
    lamps.push({ mat: fire, eBase: 2.2 });
    G.add(mergedBoxes([[1.8, 0.42, 1.0, -1.5, 0.21, -10.2]], mat('#4a4c4e', { roughness: 0.6 }))); box(G, 1.2, 0.02, 0.36, '', -1.5, 0.43, -10.2, { material: fire, shadow: false });
    roof.colliders.push({ minX: -2.4, maxX: -0.6, minZ: -10.7, maxZ: -9.7 });

    // Café: round tables with two chairs each, two under parasols, and the BBQ by the planters.
    const chairM = mat('#2f3236', { metalness: 0.5, roughness: 0.45 }), slatM = mat('#a87447', { roughness: 0.6 });
    const cafeChair = (x, z, rotY) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; G.add(g);
      g.add(mergedBoxes([[0.03, 0.45, 0.03, -0.2, 0.225, -0.2], [0.03, 0.45, 0.03, 0.2, 0.225, -0.2], [0.03, 0.45, 0.03, -0.2, 0.225, 0.2], [0.03, 0.45, 0.03, 0.2, 0.225, 0.2],
        [0.03, 0.42, 0.03, -0.2, 0.66, -0.2], [0.03, 0.42, 0.03, 0.2, 0.66, -0.2]], chairM));
      g.add(mergedBoxes([[0.46, 0.03, 0.44, 0, 0.46, 0], [0.44, 0.1, 0.02, 0, 0.72, -0.21], [0.44, 0.1, 0.02, 0, 0.86, -0.21]], slatM));
      const seat = addSeat(g, 'Chair', 0, SEATED_EYE);
      g.traverse((o) => { if (o.isMesh) o.userData.seat = seat; });
    };
    const canopy = new THREE.ConeGeometry(1.5, 0.45, 8, 1, true);
    [[-16.2, -7.2, 1], [-12.6, -7.2, 0], [-16.2, -11, 0], [-12.6, -11, 1], [-9, -7.2, 0]].forEach(([x, z, shade], i) => {
      cyl(G, 0.4, 0.4, 0.03, '#e8e4dc', x, 0.74, z, { seg: 28 }); cyl(G, 0.03, 0.03, 0.72, '#2f3236', x, 0.37, z, { seg: 8 }); cyl(G, 0.22, 0.22, 0.02, '#2f3236', x, 0.01, z, { seg: 20 });
      cafeChair(x - 0.72, z, Math.PI / 2); cafeChair(x + 0.72, z, -Math.PI / 2);
      if (shade) {
        cyl(G, 0.02, 0.02, 2.5, '#d9d6cf', x, 1.25, z, { seg: 8 });
        const c = new THREE.Mesh(canopy, mat(i ? '#d97757' : '#e9e3d6', { roughness: 0.9, side: THREE.DoubleSide })); c.position.set(x, 2.35, z); c.castShadow = c.receiveShadow = true; G.add(c);
      }
      roof.colliders.push({ minX: x - 0.42, maxX: x + 0.42, minZ: z - 0.42, maxZ: z + 0.42 });
    });
    G.add(mergedBoxes([[1.5, 0.85, 0.65, -3.6, 0.425, -13.8, '#c9cdd2'], [1.1, 0.25, 0.55, -3.6, 1.0, -13.8, '#2b2d30'], [0.5, 0.03, 0.03, -3.6, 0.95, -14.15, '#c9cdd2'],
      [0.2, 0.02, 0.5, -2.7, 0.86, -13.8, '#8a6a4a']], mat('#ffffff', { vertexColors: true, metalness: 0.6, roughness: 0.35 })));
    roof.colliders.push({ minX: -4.35, maxX: -2.85, minZ: -14.15, maxZ: -13.45 });
    // A herb bed along the path from the lift: raised timber, rosemary, thyme, basil, chives.
    for (const x of [3.2, 6.6]) {
      G.add(mergedBoxes([[2.8, 0.55, 0.9, x, 0.275, 3.5]], slatM)); box(G, 2.7, 0.02, 0.8, '', x, 0.54, 3.5, { material: soilM, shadow: false });
      for (let k = 0; k < 9; k++) {
        const hx = x - 1.15 + k * 0.29, tint = [[0.7, 1, 0.8], [0.9, 1.05, 0.6], [1.1, 1.2, 0.5], [0.8, 0.95, 0.9]][k % 4];
        for (let i = 0; i < 9; i++) {
          const a = i * 2.4 + R(), h = 0.24 + R() * 0.14;
          p.set(hx + Math.cos(a) * 0.03, ROOF_Y + 0.55, 3.5 + (R() - 0.5) * 0.4); d.set(Math.cos(a) * (0.3 + R() * 0.5), 1, Math.sin(a) * (0.3 + R() * 0.5));
          add(k % 4 === 2 ? twig : strap, p, d, h * (k % 4 === 2 ? 0.8 : 0.4), h, R() * 3, col.setRGB(tint[0], tint[1], tint[2]).multiplyScalar(0.8 + R() * 0.3));
        }
      }
      roof.colliders.push({ minX: x - 1.4, maxX: x + 1.4, minZ: 3.05, maxZ: 3.95 });
    }

    // Festoon lights over the terrace: zigzag strings between black poles, warm bulbs that come on with the lamps.
    const poles = [-18.6, -10.4, -2.2, 6, 14.2].flatMap((x) => [[x, -13.6], [x, -4.4]]), H2 = 3.1;
    for (const [x, z] of poles) { cyl(G, 0.04, 0.05, H2, '#1e1f21', x, H2 / 2, z, { seg: 8 }); roof.colliders.push({ minX: x - 0.1, maxX: x + 0.1, minZ: z - 0.1, maxZ: z + 0.1 }); }
    const wire = [], bulbs = [];
    for (let i = 0; i + 2 < poles.length; i++) {
      const [ax, az] = poles[i], [bx, bz] = poles[i + (i % 2 ? 1 : 3)] || poles[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.5);
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const u = k / n, q = new THREE.Vector3(lerp(ax, bx, u), H2 - 0.1 - Math.sin(Math.PI * u) * 0.7, lerp(az, bz, u));
        if (prev) wire.push(prev.x, prev.y, prev.z, q.x, q.y, q.z);
        if (k && k < n) bulbs.push(q);
        prev = q;
      }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    G.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#1a1a1a' })));
    const bulbIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 10, 6), glowMat(2.6, '#fff4dc'), bulbs.length);
    bulbs.forEach((q, i) => bulbIM.setMatrixAt(i, new THREE.Matrix4().makeTranslation(q.x, q.y - 0.06, q.z)));
    G.add(bulbIM);

    // The helipad, flush on the north side: painted pad, H, and green edge lights that come on at dusk.
    const hp = makeCanvas(1024, 1024), hc = hp.ctx, M = 512;
    hc.fillStyle = '#4a4d50'; hc.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 5000; i++) { hc.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '0,0,0'},${R() * 0.06})`; hc.fillRect(R() * 1024, R() * 1024, 2, 2); }
    hc.lineWidth = 26; hc.strokeStyle = '#f2f0ea'; hc.beginPath(); hc.arc(M, M, 470, 0, Math.PI * 2); hc.stroke();
    hc.lineWidth = 40; hc.strokeStyle = '#e8c33a'; hc.beginPath(); hc.arc(M, M, 330, 0, Math.PI * 2); hc.stroke();
    hc.fillStyle = '#f2f0ea'; hc.fillRect(M - 150, M - 200, 70, 400); hc.fillRect(M + 80, M - 200, 70, 400); hc.fillRect(M - 80, M - 35, 160, 70);
    hc.font = `600 52px ${FONT}`; hc.textAlign = 'center'; hc.fillText('6.0', M, M + 280); hp.tex.needsUpdate = true;
    const padM = new THREE.MeshStandardMaterial({ map: hp.tex, roughness: 0.85 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(HELI.r, HELI.r, 0.04, 72), [mat('#3a3c3e'), padM, padM]);
    pad.rotation.y = Math.PI / 2; pad.position.set(HELI.x, 0.02, HELI.z); pad.receiveShadow = true; G.add(pad);
    const greenM = new THREE.MeshStandardMaterial({ color: '#cfe8cf', emissive: '#3dff6a', emissiveIntensity: 0, roughness: 0.3 });
    lamps.push({ mat: greenM, eBase: 3 });
    const edge = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), greenM, 16);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; edge.setMatrixAt(i, new THREE.Matrix4().makeTranslation(HELI.x + Math.cos(a) * (HELI.r + 0.2), 0.05, HELI.z + Math.sin(a) * (HELI.r + 0.2))); }
    G.add(edge);
    // Windsock by the pad.
    cyl(G, 0.035, 0.045, 3.2, '#d9d6cf', -16.6, 1.6, 13.8, { seg: 8 }); roof.colliders.push({ minX: -16.7, maxX: -16.5, minZ: 13.7, maxZ: 13.9 });
    const sockT = makeCanvas(256, 64); for (let i = 0; i < 5; i++) { sockT.ctx.fillStyle = i % 2 ? '#f2f0ea' : '#ff6a1a'; sockT.ctx.fillRect(i * 52, 0, 52, 64); } sockT.tex.needsUpdate = true;
    const sockG = new THREE.CylinderGeometry(0.1, 0.24, 1.4, 14, 1, true); sockG.rotateZ(Math.PI / 2); sockG.translate(0.7, 0, 0);
    roof.sock = new THREE.Mesh(sockG, new THREE.MeshStandardMaterial({ map: sockT.tex, roughness: 0.9, side: THREE.DoubleSide }));
    roof.sock.position.set(-16.6, 3.05, 13.8); roof.sock.castShadow = true; G.add(roof.sock);

    // The plant: two condensers with spinning fans, an air handler with its ducts, a water tank on legs, mushroom vents,
    // all behind a louvred screen open to the north.
    const plantM = mat('#c3c6c8', { metalness: 0.4, roughness: 0.5 }), darkM = mat('#2b2d30', { roughness: 0.6 });
    for (const x of [9.6, 12.6]) {
      const body = [[2.4, 1.3, 1.2, x, 0.65, 12.6]];
      for (let y = 0.2; y < 1.2; y += 0.08) body.push([2.42, 0.02, 1.22, x, y, 12.6]);
      G.add(mergedBoxes(body, plantM));
      for (const dx of [-0.6, 0.6]) {
        cyl(G, 0.5, 0.5, 0.06, '', x + dx, 1.32, 12.6, { material: darkM, seg: 24 });
        const fan = new THREE.Group(); fan.position.set(x + dx, 1.36, 12.6); G.add(fan); roof.fans.push(fan);
        for (let b = 0; b < 4; b++) { const bl = box(fan, 0.42, 0.01, 0.12, '#55595e', 0.21, 0, 0, { shadow: false }); bl.position.set(Math.cos(b * Math.PI / 2) * 0.21, 0, Math.sin(b * Math.PI / 2) * 0.21); bl.rotation.y = -b * Math.PI / 2; bl.rotation.x = 0.3; }
      }
      roof.colliders.push({ minX: x - 1.2, maxX: x + 1.2, minZ: 12, maxZ: 13.2 });
    }
    G.add(mergedBoxes([[4.2, 1.7, 1.8, 13.2, 0.85, 7.4], [0.8, 0.8, 1.9, 10.7, 0.5, 7.4], [0.9, 0.9, 3.4, 15.8, 0.45, 10], [4.4, 0.1, 2, 13.2, 1.75, 7.4]], plantM));
    roof.colliders.push({ minX: 10.3, maxX: 15.3, minZ: 6.5, maxZ: 8.3 }, { minX: 15.35, maxX: 16.25, minZ: 8.3, maxZ: 11.7 });
    cyl(G, 1.2, 1.2, 2.4, '#9aa3a8', 17.9, 1.8, 12.4, { mat: { metalness: 0.4, roughness: 0.45 }, seg: 28 });
    G.add(mergedBoxes([[0.1, 0.6, 0.1, 17.1, 0.3, 11.6], [0.1, 0.6, 0.1, 18.7, 0.3, 11.6], [0.1, 0.6, 0.1, 17.1, 0.3, 13.2], [0.1, 0.6, 0.1, 18.7, 0.3, 13.2], [2.6, 0.08, 2.6, 17.9, 0.6, 12.4]], darkM));
    for (const y of [1.2, 2.4]) cyl(G, 1.215, 1.215, 0.04, '#7d868b', 17.9, y, 12.4, { seg: 28, shadow: false });
    roof.colliders.push({ minX: 16.6, maxX: 19.2, minZ: 11.1, maxZ: 13.7 });
    for (const [x, z] of [[2.2, 7.2], [3.6, 9.4], [2.4, 11.8], [0.2, 8.8]]) {
      cyl(G, 0.11, 0.11, 0.6, '#b8bcc0', x, 0.3, z, { seg: 12 }); cyl(G, 0.26, 0.26, 0.1, '#b8bcc0', x, 0.68, z, { seg: 16 });
      roof.colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 });
    }
    const lou = [];
    for (let y = 0.15; y < 1.9; y += 0.14) lou.push([11, 0.1, 0.03, 13.3, y, 5.6], [0.03, 0.1, 5, 7.8, y, 8.1]);
    for (let x = 7.8; x <= 18.8; x += 1.83) lou.push([0.06, 1.95, 0.06, x, 0.975, 5.6]);
    for (let z = 5.6; z <= 10.6; z += 1.66) lou.push([0.06, 1.95, 0.06, 7.8, 0.975, z]);
    G.add(mergedBoxes(lou, mat('#6f7479', { metalness: 0.4, roughness: 0.5 })));
    roof.colliders.push({ minX: 7.8, maxX: 18.8, minZ: 5.5, maxZ: 5.7 }, { minX: 7.7, maxX: 7.9, minZ: 5.6, maxZ: 10.6 });

    roof.colliders.push(...colliders.splice(c0));   // the sofas' and planters' own
    for (const st of seats.slice(s0)) st.floor = ROOF;
    roof.hits = [roof.callHit, roof.panel.mesh];
    roof.map = drawRoofMap;
    roof.enter = (z) => {
      const c = roof.cars.find((k) => k.z === z) || roof.cars[0];
      Object.assign(roof, { leaves: c.leaves, ind: c.ind });
      roof.panel.mesh.position.z = z + 0.68;
      G.visible = true;
    };
    roof.leave = () => { G.visible = false; };
    roof.bound = (p) => { p.x = clamp(p.x, -EDGE.x + 0.5, EDGE.x - 0.5); p.z = clamp(p.z, -EDGE.z + 0.5, EDGE.z - 0.5); };
    roof.fx = (dt, t) => {
      for (const [i, f] of roof.fans.entries()) f.rotation.y += dt * (7 + i);
      roof.sock.rotation.set(Math.sin(t * 1.3) * 0.05, 2.4 + Math.sin(t * 0.31) * 0.35 + Math.sin(t * 0.83) * 0.1, -0.25 + Math.sin(t * 0.5) * 0.12);
      roof.cars.forEach((c, i) => { Object.assign(c.ind, { floor: lifts[i].floor, dir: lifts[i].dir }); paintIndicator(c.ind); });   // the other car's lantern
    };
    addFloor(roof);
  }
  function drawRoofMap() {
    const c = mapCtx, W = 440, H = 330, sx = (x) => ((x - ROOM.minX) / 40) * W, sz = (z) => ((z - ROOM.minZ) / 30) * H;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(181,138,95,.35)'; c.fillRect(sx(-19.6), sz(-14), sx(16.6) - sx(-19.6), sz(-4) - sz(-14));
    c.strokeStyle = 'rgba(232,195,58,.7)'; c.lineWidth = 3; c.beginPath(); c.arc(sx(HELI.x), sz(HELI.z), HELI.r * W / 40, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.22)';
    for (const b of roof.colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(2, sx(b.maxX) - sx(b.minX)), Math.max(2, sz(b.maxZ) - sz(b.minZ)));
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillText('Helipad', sx(HELI.x) - 36, sz(HELI.z) + 7); c.fillText('Terrace', sx(-4), sz(-8)); c.fillText('Plant', sx(11), sz(10));
    c.font = '600 15px system-ui'; c.fillText('Lift', sx(LIFT.x) - 36, sz(LIFT.z) + 5);
    const px = sx(camera.position.x), pz = sz(camera.position.z);
    c.save(); c.translate(px, pz); c.rotate(-camera.rotation.y);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }
  Object.assign(ctx, { EDGE, roof });
}
