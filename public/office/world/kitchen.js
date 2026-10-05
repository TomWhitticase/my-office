// The kitchen: base units under the north windows (sink, coffee machine, drinks fridge, taps, snacks), the tall appliance
// wall (fridge, glass drinks fridges, microwaves, pantry) and the island with stools. Fridges are doors, the drinks fridges
// open for anyone fetching a can, and the coffee machine brews when clicked (kitchen.brew, kitchen.update each frame).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, clamp, cyl, dash, fit, FONT, makeCanvas, makeScreen, mat, mergedBoxes, rng, ROOM, SEATED_EYE, solid, sstep } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { world, smallPlant, doors, pendant, addSeat } = ctx;
  // ----- kitchen -----
  // A run of base units under the north windows (sink, coffee station, drinks fridge, taps, snacks), a tall appliance wall
  // on the west (fridge, two glass drinks fridges, microwaves, pantry), and an island with stools. The fridges open
  // (they're doors), the drinks fridges open for anyone fetching a can, and the coffee machine brews when clicked.
  const kitchen = (() => {
    const GREEN = '#2f4a3f', GAP = '#1b2a24', OAK = '#b98a5a', STEEL = '#c3c7cc', BLACK = '#1c1c1e', BRASS = '#c9a35a';
    const kvc = mat('#ffffff', { vertexColors: true, roughness: 0.6 }), kmetal = mat('#ffffff', { vertexColors: true, roughness: 0.3, metalness: 0.7 });
    const quartzM = mat('#efece6', { roughness: 0.38 }), litM = mat('#eef3f7', { emissive: '#eaf4ff', emissiveIntensity: 0.55, roughness: 0.6 });
    const kGlassM = new THREE.MeshPhysicalMaterial({ color: '#cfe0e6', transparent: true, opacity: 0.16, roughness: 0.04, envMapIntensity: 1.6,
      depthWrite: false });
    const B = [], M = [];   // painted boxes, metal boxes: [w, h, d, x, y, z, colour]
    // Base run: carcass, recessed plinth, then fronts per module along x. Fronts face -z at FZ.
    const X0 = -20, X1 = -11.45, FZ = 14.25, TOP = 0.92;
    const BX0 = -15.35, BX1 = -14.75;   // under-counter drinks fridge: a lit cavity instead of carcass
    for (const [a, b] of [[X0, BX0], [BX1, X1]]) B.push([b - a, 0.78, 14.9 - FZ, (a + b) / 2, 0.49, (FZ + 14.9) / 2, GAP]);
    B.push([X1 - X0, 0.1, 0.6, (X0 + X1) / 2, 0.05, 14.6, BLACK], [BX1 - BX0, 0.03, 0.6, (BX0 + BX1) / 2, 0.115, 14.58, '#dfe6ea'],
      [BX1 - BX0, 0.03, 0.6, (BX0 + BX1) / 2, 0.865, 14.58, '#dfe6ea']);
    const front = (xa, xb, ya, yb, c = GREEN) => B.push([xb - xa - 0.008, yb - ya - 0.008, 0.02, (xa + xb) / 2, (ya + yb) / 2, FZ - 0.01, c]);
    const pull = (x, y, w = 0.14) => M.push([w, 0.012, 0.02, x, y, FZ - 0.035, BRASS]);
    const MODS = [[-19.35, -18.75, 'drawers'], [-18.75, -17.95, 'doors'], [-17.95, -17.35, 'dishwasher'], [-17.35, -16.75, 'bins'], [-16.75, -15.95, 'doors'],
      [-15.95, -15.35, 'drawers'], [-15.35, -14.75, 'bev'], [-14.75, -13.95, 'keg'], [-13.95, -13.35, 'drawers'], [-13.35, -12.4, 'doors'],
        [-12.4, -11.45, 'doors']];
        for (const [xa, xb, kind] of MODS) {
      const mx = (xa + xb) / 2;
      if (kind === 'drawers') for (const [ya, yb] of [[0.1, 0.42], [0.42, 0.68], [0.68, 0.88]]) { front(xa, xb, ya, yb); pull(mx, yb - 0.06); }
      else if (kind === 'doors') { front(xa, mx, 0.1, 0.88); front(mx, xb, 0.1, 0.88);
        for (const s of [-1, 1]) M.push([0.012, 0.16, 0.02, mx + s * 0.04, 0.74, FZ - 0.035, BRASS]); }
      else if (kind === 'dishwasher') { M.push([xb - xa - 0.01, 0.77, 0.02, mx, 0.49, FZ - 0.01, STEEL],
        [xb - xa - 0.12, 0.02, 0.03, mx, 0.8, FZ - 0.04, '#9aa0a6']); }
      else if (kind === 'bins') { front(xa, xb, 0.1, 0.88); pull(mx, 0.8);
        ['#4f8a4a', '#3a6fb0', '#6b6f75'].forEach((c, i) => B.push([0.13, 0.05, 0.005, xa + 0.13 + i * 0.17, 0.66, FZ - 0.022, c])); }
      else if (kind === 'keg') { M.push([xb - xa - 0.01, 0.77, 0.02, mx, 0.49, FZ - 0.01, '#8d9399']); pull(mx, 0.8, 0.4); }
      else if (kind === 'bev') {   // under-counter drinks fridge: black frame, lit inside, cans behind glass
        const w = xb - xa - 0.008;
        B.push([w, 0.05, 0.03, mx, 0.125, FZ - 0.01, BLACK], [w, 0.08, 0.03, mx, 0.84, FZ - 0.01, BLACK],
          [0.04, 0.77, 0.03, xa + 0.024, 0.49, FZ - 0.01, BLACK], [0.04, 0.77, 0.03, xb - 0.024, 0.49, FZ - 0.01, BLACK]);
        for (const y of [0.36, 0.6]) M.push([w - 0.04, 0.008, 0.55, mx, y, 14.56, '#b8bcc2']);
        M.push([0.012, 0.3, 0.02, xb - 0.07, 0.55, FZ - 0.04, BLACK]);
      }
    }
    world.add(mergedBoxes(B.splice(0), kvc), mergedBoxes(M.splice(0), kmetal));
    box(world, X1 - X0 + 0.03, 0.04, 0.7, '', (X0 + X1) / 2 - 0.015, TOP - 0.02, 14.55, { material: quartzM });
    solid((X0 + X1) / 2, 14.55, X1 - X0, 0.7);

    // Sink with a gooseneck tap, soap and a brush; a boiling/sparkling water tap by the coffee.
    const sx = -18.35;
    M.push([0.62, 0.006, 0.42, sx, TOP + 0.001, 14.5, '#7d8389'], [0.54, 0.008, 0.34, sx, TOP + 0.002, 14.5, '#3a3e43'],
      [0.05, 0.009, 0.05, sx, TOP + 0.003, 14.5, '#202225']);
    const tap = (x, z, h, r) => {
      cyl(world, 0.022, 0.026, 0.03, '', x, TOP + 0.015, z, { material: shinyTapM });
      cyl(world, 0.012, 0.012, h, '', x, TOP + h / 2, z, { material: shinyTapM });
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 16, Math.PI), shinyTapM);
      arc.position.set(x, TOP + h, z - r); arc.rotation.y = Math.PI / 2; arc.castShadow = true; world.add(arc);
      cyl(world, 0.014, 0.012, 0.04, '', x, TOP + h - 0.02, z - 2 * r, { material: shinyTapM });
    };
    const shinyTapM = mat('#d4d7db', { metalness: 0.95, roughness: 0.15 });
    tap(sx, 14.72, 0.32, 0.1); tap(-15.05, 14.66, 0.22, 0.07);
    cyl(world, 0.03, 0.03, 0.14, '#e8e2d6', sx + 0.4, TOP + 0.07, 14.62); cyl(world, 0.008, 0.008, 0.05, '#222', sx + 0.4, TOP + 0.16, 14.62);
    box(world, 0.04, 0.03, 0.14, OAK, sx + 0.5, TOP + 0.015, 14.6).rotation.y = 0.4;

    // Coffee station: bean-to-cup machine (screen, spouts, drip tray, hopper), grinder, knock box, a stack of mugs.
    const CX = -16.5, CZ = 14.52;
    B.push([0.38, 0.5, 0.42, CX, TOP + 0.25, CZ, '#202225'], [0.3, 0.1, 0.05, CX, TOP + 0.36, CZ - 0.23, '#2a2c30'],
      [0.07, 0.05, 0.06, CX, TOP + 0.3, CZ - 0.25, BLACK],
      [0.14, 0.32, 0.2, CX + 0.36, TOP + 0.16, CZ + 0.04, '#26282b'], [0.12, 0.1, 0.12, CX - 0.38, TOP + 0.05, CZ - 0.04, BLACK]);
    M.push([0.39, 0.04, 0.43, CX, TOP + 0.48, CZ, STEEL], [0.32, 0.025, 0.15, CX, TOP + 0.0125, CZ - 0.24, '#9aa0a6'],
      [0.012, 0.3, 0.43, CX - 0.19, TOP + 0.25, CZ, STEEL], [0.012, 0.3, 0.43, CX + 0.19, TOP + 0.25, CZ, STEEL]);
    cyl(world, 0.07, 0.06, 0.12, '#4a2c1a', CX + 0.06, TOP + 0.56, CZ + 0.06, { mat: { roughness: 0.9 } });
    cyl(world, 0.07, 0.03, 0.12, '#3b2416', CX + 0.36, TOP + 0.38, CZ + 0.04, { mat: { roughness: 0.9 } });
    const MUGS = ['#f4f1ea', '#d97757', '#2f6f8f', '#e0b23a', '#f4f1ea', '#33473f'];
    for (let i = 0; i < 6; i++) cyl(world, 0.042, 0.038, 0.1, MUGS[i], -15.75 + (i % 3) * 0.1, TOP + 0.05 + Math.floor(i / 3) * 0.1, 14.5 + (i % 2) * 0.02);
    // Kettle and tea tins.
    cyl(world, 0.065, 0.08, 0.2, '#e8e2d6', -15.4, TOP + 0.1, 14.55, { seg: 20 }); box(world, 0.03, 0.14, 0.02, BLACK, -15.4, TOP + 0.13, 14.64);
    ['#3f4a6b', '#c4572a', '#6b8e4e'].forEach((c, i) => cyl(world, 0.04, 0.04, 0.13, c, -15.62 + i * 0.09, TOP + 0.065, 14.72));
    // Cold brew and kombucha on tap, from the keg fridge below.
    M.push([0.06, 0.36, 0.06, -14.35, TOP + 0.18, 14.55, STEEL], [0.3, 0.06, 0.07, -14.35, TOP + 0.38, 14.55, STEEL],
      [0.24, 0.015, 0.12, -14.35, TOP + 0.008, 14.45, '#7d8389']);
    for (const [dx, c] of [[-0.1, BLACK], [0.1, OAK]]) {
      B.push([0.03, 0.12, 0.03, -14.35 + dx, TOP + 0.47, 14.53, c], [0.06, 0.04, 0.005, -14.35 + dx, TOP + 0.38, 14.512, dx < 0 ? '#2f2016' : '#d9a441']);
      M.push([0.015, 0.05, 0.015, -14.35 + dx, TOP + 0.32, 14.5, STEEL]);
    }
    // Snacks: a stepped oak riser of clear bins (nuts, sweets, crisps, granola) and three cereal dispensers.
    const SNACK = ['#c98f4a', '#e05a7a', '#e0b23a', '#8c5a3c', '#f2c94c', '#6b8e4e', '#d97757', '#b5654a', '#9a6a3a', '#ff8fab', '#7a4a2a', '#ffd166'];
    for (let t = 0; t < 3; t++) {
      const z = 14.42 + t * 0.14, y = TOP + t * 0.12;
      B.push([1.4, 0.03 + t * 0.12, 0.15, -12.95, TOP + (0.03 + t * 0.12) / 2, z, OAK]);
      for (let i = 0; i < 4; i++) B.push([0.28, 0.12, 0.11, -13.45 + i * 0.33, y + 0.03 + 0.06 + 0.005, z - 0.005, SNACK[t * 4 + i]]);
    }
    for (let i = 0; i < 3; i++) {
      const x = -11.95 + i * 0.16;
      cyl(world, 0.055, 0.055, 0.2, ['#f2c94c', '#8c5a3c', '#e05a7a'][i], x, TOP + 0.2, 14.55, { mat: { roughness: 0.9 } });
      M.push([0.05, 0.1, 0.05, x, TOP + 0.05, 14.55, '#2a2c30'], [0.14, 0.03, 0.14, x, TOP + 0.315, 14.55, '#2a2c30']);
    }
    world.add(mergedBoxes(B.splice(0), kvc), mergedBoxes(M.splice(0), kmetal));
    box(world, 1.38, 0.42, 0.42, '', -12.95, TOP + 0.21, 14.56, { material: kGlassM, shadow: false });
    for (let i = 0; i < 3; i++) cyl(world, 0.064, 0.064, 0.22, '', -11.95 + i * 0.16, TOP + 0.2, 14.55, { material: kGlassM, shadow: false });

    // Cans and bottles, shared by the drinks fridges: one instanced mesh each, a product per shelf like a restocked fridge.
    const cans = [], bottles = [];
    const DRINKS = [['can', ['#f2b8c6', '#7fd1c7', '#c7e27a', '#ffb36b']], ['can', ['#d0312d']], ['bottle', ['#f28c28', '#f6a623']],
      ['bottle', ['#b5762a', '#8fb35a']], ['can', ['#2b2b2b', '#e8e8e8']], ['bottle', ['#bfe3f2']]];
    function stock(cols, rows, at) {   // at(c, r) -> [x, y, z, drinksIndex]
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const [x, y, z, k] = at(c, r), [kind, pal] = DRINKS[k % DRINKS.length];
        (kind === 'can' ? cans : bottles).push([x, y, z, pal[(c + r) % pal.length]]);
      }
    }
    // under-counter fridge: 7 across, 3 shelves, 2 deep
    stock(7, 6, (c, r) => [-15.3 + c * 0.075, [0.13, 0.364, 0.604][r % 3], r < 3 ? 14.38 : 14.6, r % 3 + 1]);

    // Tall wall on the west: carcass, then (south to north) pantry, two microwaves, two glass drinks fridges, fridge-freezer.
    const WX = -19.35, WZ0 = 10.9, WZ1 = 14.22, TH = 2.25;
    const wfront = (za, zb, ya, yb, c = GREEN) => B.push([0.02, yb - ya - 0.008, zb - za - 0.008, WX + 0.01, (ya + yb) / 2, (za + zb) / 2, c]);
    B.push([0.65, ROOM.h - TH, WZ1 - WZ0, WX - 0.325, (TH + ROOM.h) / 2, (WZ0 + WZ1) / 2, GREEN],
      [0.6, 0.1, WZ1 - WZ0, WX - 0.33, 0.05, (WZ0 + WZ1) / 2, BLACK]);
    for (const z of [WZ0 + 0.01, 11.4, 12.0, 12.635, 13.27, WZ1 - 0.01]) B.push([0.66, TH, 0.02, WX - 0.33, TH / 2, z, GREEN]);
    B.push([0.62, TH - 0.1, 0.48, WX - 0.33, TH / 2 + 0.05, 11.15, GAP], [0.62, TH - 0.1, 0.58, WX - 0.33, TH / 2 + 0.05, 11.7, GAP]);
    wfront(WZ0, 11.4, 0.1, TH); M.push([0.02, 0.6, 0.012, WX + 0.035, 1.15, 11.33, BRASS]);
    wfront(11.4, 12.0, 0.1, 0.88); wfront(11.4, 12.0, 0.88, 1.32);
    M.push([0.02, 0.012, 0.16, WX + 0.035, 0.8, 11.7, BRASS], [0.02, 0.012, 0.16, WX + 0.035, 1.22, 11.7, BRASS]);
    for (const y of [1.32, 1.79]) {   // microwaves: black glass door, steel trim, keypad, a green clock
      M.push([0.02, 0.46, 0.6, WX + 0.01, y + 0.23, 11.7, STEEL]);
      B.push([0.012, 0.36, 0.38, WX + 0.025, y + 0.23, 11.64, '#101114'], [0.012, 0.36, 0.1, WX + 0.025, y + 0.23, 11.9, '#2a2c30']);
      for (let k = 0; k < 6; k++) B.push([0.006, 0.025, 0.025, WX + 0.033, y + 0.15 + (k % 3) * 0.045, 11.88 + Math.floor(k / 3) * 0.04, '#5a5e64']);
    }
    const clock = [];
    for (const y of [1.32, 1.79]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.02), mat('#000', { emissive: '#4cff8a', emissiveIntensity: 1.6 }));
      c.position.set(WX + 0.034, y + 0.38, 11.9); c.rotation.y = Math.PI / 2; world.add(c); clock.push(c); }

    // A door on the doors list (so it animates, hovers and clicks like the others), hinged at z=hz on the tall wall's face.
    // `north` hinges sit at the north edge of the unit and the leaf swings out into the room.
    const leaves = [];
    function applianceDoor(name, za, zb, ya, yb, north, build, auto = false) {
      const W = zb - za, hz = north ? zb : za,
        d = { name, k: 0, to: 0, r0: north ? Math.PI / 2 : -Math.PI / 2, swing: north ? -1 : 1, W, hx: WX, hz, auto, pivot: new THREE.Group(), box: {} };
      d.pivot.position.set(WX, 0, hz); d.pivot.rotation.y = d.r0; world.add(d.pivot);
      build(d.pivot, W, ya, yb);
      d.pivot.traverse((o) => { if (o.isMesh) o.userData = { action: 'door', door: d, reach: 3.2 }; });
      doors.push(d); leaves.push(d);
      return d;
    }
    // Leaf space: x runs 0..W from the hinge, z out of the face (toward the room).
    const handle = (g, W, y0, y1, c = STEEL) => { box(g, 0.02, y1 - y0, 0.02, c, W - 0.06, (y0 + y1) / 2, 0.075, { mat: { metalness: 0.9, roughness: 0.25 } });
      for (const y of [y0 + 0.02, y1 - 0.02]) box(g, 0.02, 0.02, 0.05, c, W - 0.06, y, 0.05, { mat: { metalness: 0.9, roughness: 0.25 } }); };

    // Glass drinks fridges: lit white box, wire shelves, six products; black-framed glass doors that open toward each other's hinge.
    for (const [za, zb, north, name] of [[12.635, 13.27, true, 'Drinks fridge'], [12.0, 12.635, false, 'Drinks fridge']]) {
      const zm = (za + zb) / 2, w = zb - za - 0.06;
      B.push([0.02, TH - 0.2, w, WX - 0.62, TH / 2, zm, '#eaf2f7'], [0.6, 0.02, w, WX - 0.33, 0.12, zm, '#dfe6ea'],
        [0.6, 0.02, w, WX - 0.33, TH - 0.08, zm, '#dfe6ea'], [0.6, 0.1, w + 0.04, WX - 0.33, 0.05, zm, BLACK]);
      B.push([0.012, 0.08, w, WX - 0.33, TH - 0.15, zm, '#1f2a33']);   // lit header
      for (let s = 0; s < 6; s++) M.push([0.55, 0.012, w, WX - 0.34, 0.15 + s * 0.34, zm, '#b8bcc2']);
      const k0 = north ? 0 : 3;
      stock(Math.floor(w / 0.078), 12, (c, r) => {
        const s = Math.floor(r / 2), back = r % 2;
        return [WX - 0.12 - back * 0.16, 0.16 + s * 0.34, za + 0.07 + c * 0.078, k0 + s];
      });
      applianceDoor(name, za, zb, 0.1, TH - 0.02, north, (g, W, ya, yb) => {
        const fr = [[W, 0.06, 0.04, W / 2, ya + 0.03, 0.02], [W, 0.1, 0.04, W / 2, yb - 0.05, 0.02], [0.05, yb - ya, 0.04, 0.025, (ya + yb) / 2, 0.02],
          [0.05, yb - ya, 0.04, W - 0.025, (ya + yb) / 2, 0.02]];
        g.add(mergedBoxes(fr.map((b) => [...b, BLACK]), kvc));
        box(g, W - 0.1, yb - ya - 0.16, 0.012, '', W / 2, (ya + yb) / 2 - 0.02, 0.02, { material: kGlassM, shadow: false });
        handle(g, W, 0.85, 1.55, BLACK);
      }, true);
    }
    // Fridge-freezer: lit interior with glass shelves and food behind the top door; freezer drawer below.
    {
      const za = 13.27, zb = WZ1, zm = (za + zb) / 2, w = zb - za - 0.06;
      B.push([0.6, 0.05, w + 0.04, WX - 0.33, 0.77, zm, '#e3e7ea'], [0.6, 0.08, w + 0.04, WX - 0.33, TH - 0.04, zm, '#e3e7ea'],
        [0.6, 0.1, w + 0.04, WX - 0.33, 0.05, zm, BLACK]);
      for (const s of [1.15, 1.5, 1.85]) M.push([0.55, 0.01, w, WX - 0.34, s, zm, '#cfe3ea']);
      const FOOD = [[0.09, 0.24, 0.07, '#f4f6f9'], [0.08, 0.22, 0.08, '#4a6fd0'], [0.07, 0.2, 0.07, '#f2f2f2'], [0.2, 0.1, 0.15, '#ff9d3a'],
        [0.18, 0.08, 0.14, '#e8e2d6'], [0.06, 0.14, 0.06, '#c4572a'], [0.07, 0.07, 0.07, '#e0b23a'], [0.16, 0.12, 0.12, '#6b8e4e']];
      const FR = rng(77);
      for (const s of [0.8, 1.16, 1.51, 1.86]) for (let z = za + 0.1; z < zb - 0.12;) {
        const [fw, fh, fd, c] = FOOD[Math.floor(FR() * FOOD.length)];
        if (z + fd > zb - 0.06) break;
        B.push([fw, fh, fd, WX - 0.2 - FR() * 0.25, s + fh / 2, z + fd / 2, c]); z += fd + 0.03 + FR() * 0.04;
      }
      applianceDoor('Fridge', za, zb, 0.8, TH - 0.02, true, (g, W, ya, yb) => {
        g.add(mergedBoxes([[W - 0.008, yb - ya, 0.06, W / 2, (ya + yb) / 2, 0.03, STEEL]], kmetal));
        g.add(mergedBoxes([[W - 0.1, 0.02, 0.06, W / 2, ya + 0.35, -0.03, '#e3e7ea'], [W - 0.1, 0.02, 0.06, W / 2, ya + 0.75, -0.03, '#e3e7ea'],
          [0.08, 0.2, 0.05, 0.2, ya + 0.47, -0.03, '#f4f6f9'], [0.08, 0.22, 0.05, 0.32, ya + 0.48, -0.03, '#d97757'],
            [0.07, 0.12, 0.05, 0.44, ya + 0.85, -0.03, '#e0b23a']], kvc));
        handle(g, W, ya + 0.1, ya + 0.85);
      });
      M.push([0.06, 0.68, w + 0.05, WX + 0.03, 0.44, zm, STEEL], [0.02, 0.02, 0.5, WX + 0.075, 0.7, zm, '#9aa0a6']);
      B.push([0.6, 0.008, w, WX - 0.33, 0.78, zm, '#d9e6ec']);
    }
    // Interiors glow: a lit back panel per fridge, so the glass doors show the stock day and night.
    for (const [za, zb] of [[12.0, 12.635], [12.635, 13.27], [13.27, WZ1]]) box(world, 0.01, TH - 0.4, zb - za - 0.08, '', WX - 0.6, TH / 2 + 0.1,
      (za + zb) / 2, { material: litM, shadow: false });
    box(world, BX1 - BX0 - 0.02, 0.72, 0.01, '', (BX0 + BX1) / 2, 0.49, 14.86, { material: litM, shadow: false });
    box(world, BX1 - BX0 - 0.06, 0.66, 0.01, '', (BX0 + BX1) / 2, 0.49, FZ - 0.01, { material: kGlassM, shadow: false });
    world.add(mergedBoxes(B.splice(0), kvc), mergedBoxes(M.splice(0), kmetal));
    const canGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10),
      bottleGeo = mergeGeometries([new THREE.CylinderGeometry(0.03, 0.03, 0.17, 10).translate(0, 0.085, 0),
      new THREE.CylinderGeometry(0.012, 0.03, 0.07, 10).translate(0, 0.205, 0)]);
    canGeo.translate(0, 0.06, 0);
    const c = new THREE.Color();
    for (const [geo, list, ro] of [[canGeo, cans, 0.35], [bottleGeo, bottles, 0.15]]) {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: ro, metalness: geo === canGeo ? 0.6 : 0 }), list.length);
      list.forEach(([x, y, z, col], i) => { im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)); im.setColorAt(i, c.set(col)); });
      world.add(im);
    }
    solid(WX - 0.33, (WZ0 + WZ1) / 2, 0.7, WZ1 - WZ0);

    // "Today in the kitchen" board on the end of the tall units.
    {
      const brd = makeScreen(world, 0.5, 0.7, 400, 560, WX - 0.33, 1.5, WZ0 - 0.012);
      brd.mesh.rotation.y = Math.PI;
      const { ctx } = brd;
      ctx.fillStyle = '#23302a'; ctx.fillRect(0, 0, 400, 560);
      ctx.strokeStyle = OAK; ctx.lineWidth = 16; ctx.strokeRect(8, 8, 384, 544);
      ctx.fillStyle = '#f4efe4'; ctx.font = `700 40px ${FONT}`; ctx.fillText('Today', 36, 76);
      ctx.font = `400 26px ${FONT}`; ctx.fillStyle = '#d6cfbf';
      ['Lunch 12:30: tacos 🌮', 'Beans: Ethiopia, washed', 'Oat milk: top shelf', 'Kombucha: ginger', '', 'Friday: pizza + demos', '', 'Please load the',
        'dishwasher ♥'].forEach((l, i) => ctx.fillText(l, 36, 136 + i * 42));
      brd.mesh.material = new THREE.MeshStandardMaterial({ map: brd.tex, roughness: 0.9 });
      brd.tex.needsUpdate = true;
    }

    // Island: quartz top with waterfall ends, oak fluted base on the stool side, green cupboards facing the kitchen.
    const IX = -15.4, IZ = 11.5, IL = 3.8, ID = 1.1;
    box(world, IL, 0.05, ID, '', IX, TOP - 0.025, IZ, { material: quartzM });
    for (const s of [-1, 1]) box(world, 0.05, TOP - 0.05, ID, '', IX + s * (IL / 2 - 0.025), (TOP - 0.05) / 2, IZ, { material: quartzM });
    B.push([IL - 0.1, TOP - 0.15, 0.62, IX, (TOP - 0.05) / 2 + 0.05, IZ + 0.12, GAP], [IL - 0.12, 0.1, 0.58, IX, 0.05, IZ + 0.12, BLACK]);
    for (let x = IX - IL / 2 + 0.1; x < IX + IL / 2 - 0.1; x += 0.05) B.push([0.04, TOP - 0.16, 0.025, x + 0.025, (TOP - 0.06) / 2 + 0.05, IZ - 0.2, OAK]);
    for (let i = 0; i < 6; i++) {
      const xa = IX - IL / 2 + 0.05 + i * (IL - 0.1) / 6, xb = xa + (IL - 0.1) / 6;
      B.push([xb - xa - 0.008, TOP - 0.16, 0.02, (xa + xb) / 2, (TOP - 0.06) / 2 + 0.05, IZ + 0.44, GREEN]);
      M.push([0.012, 0.16, 0.02, i % 2 ? xa + 0.05 : xb - 0.05, 0.7, IZ + 0.465, BRASS]);
    }
    // On the island: fruit bowl, a little plant, napkins, a tray with mugs, someone's laptop sticker-side up.
    cyl(world, 0.2, 0.1, 0.09, '#e8e2d6', IX + 0.3, TOP + 0.045, IZ + 0.05, { seg: 24 });
    const FRUIT = ['#c0392b', '#e67e22', '#8bbf3c', '#e74c3c', '#f39c12', '#a3c94a', '#d35400'];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = i < 6 ? 0.1 : 0.03, f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(FRUIT[i % FRUIT.length], { roughness: 0.5 }));
      f.position.set(IX + 0.3 + Math.cos(a) * r, TOP + 0.1 + (i < 6 ? 0 : 0.05), IZ + 0.05 + Math.sin(a) * r); f.castShadow = true; world.add(f);
    }
    for (const dz of [-0.05, 0.05]) { const ba = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 12, 2.2), mat('#f2c94c', { roughness: 0.6 }));
      ba.position.set(IX + 0.32, TOP + 0.16, IZ + dz); ba.rotation.set(0.3, 0, 2.6); world.add(ba); }
    smallPlant(world, IX - 1.2, TOP, IZ + 0.1);
    B.push([0.34, 0.015, 0.24, IX - 0.6, TOP + 0.008, IZ + 0.15, OAK], [0.14, 0.05, 0.14, IX + 1.1, TOP + 0.025, IZ + 0.2, '#f4f1ea'],
      [0.32, 0.012, 0.22, IX - 0.2, TOP + 0.006, IZ - 0.25, '#b9bcc0']);
    world.add(mergedBoxes(B.splice(0), kvc), mergedBoxes(M.splice(0), kmetal));
    for (let i = 0; i < 3; i++) cyl(world, 0.04, 0.035, 0.09, MUGS[i + 1], IX - 0.68 + i * 0.09, TOP + 0.06, IZ + 0.15);
    solid(IX, IZ, IL + 0.04, ID);
    for (const x of [IX - 1.2, IX, IX + 1.2]) pendant(x, IZ, { drop: 0.95, light: x === IX ? 12 : 0, shade: '#e9e4da' });

    // Stools on the south side, facing the island; sit-in-able, and idle sessions perch on them with a coffee.
    const stools = [];
    for (const x of [-16.75, -15.85, -14.95, -14.05]) {
      const g = new THREE.Group(); g.position.set(x, 0, 10.6); world.add(g);
      cyl(g, 0.19, 0.18, 0.05, OAK, 0, 0.665, 0, { seg: 24, mat: { roughness: 0.55 } });
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = box(g, 0.025, 0.66, 0.025, BLACK, dx * 0.12, 0.32, dz * 0.12);
        l.rotation.set(-dz * 0.06, 0, dx * 0.06); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 6, 24), mat(BLACK)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring);
      const st = addSeat(g, 'Stool', 0, SEATED_EYE + 0.24);
      g.traverse((o) => { if (o.isMesh) o.userData.seat = st; });
      stools.push({ x, z: 10.6 });
    }

    // Coffee machine you can use: click it and it grinds, pours into a cup on the drip tray, then leaves it there a while.
    const scr = makeScreen(world, 0.15, 0.085, 160, 90, CX, TOP + 0.36, CZ - 0.2575);
    scr.mesh.rotation.y = Math.PI;
    const cup = new THREE.Group(); cup.position.set(CX, TOP + 0.025, CZ - 0.25); cup.visible = false; world.add(cup);
    cyl(cup, 0.04, 0.032, 0.085, '#f4f1ea', 0, 0.0425, 0, { seg: 16 });
    const fill = cyl(cup, 0.036, 0.036, 0.004, '#5a3420', 0, 0.01, 0, { seg: 16, shadow: false });
    const steamTex = (() =>
      { const t = makeCanvas(64, 64), g = t.ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)'); t.ctx.fillStyle = g; t.ctx.fillRect(0, 0, 64, 64); t.tex.needsUpdate = true; return t.tex; })();
    const steam = [0, 1, 2,
      3].map((i) =>
      { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 })); s.scale.setScalar(0.06);
      cup.add(s); s.userData.ph = i / 4; return s; });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.5), new THREE.MeshBasicMaterial()); hit.position.set(CX, TOP + 0.27, CZ - 0.03);
    hit.visible = false; world.add(hit);
    hit.userData = { action: 'coffee', reach: 3 };
    const brew = { t: -1, left: 0, served: 0 };
    let shown = '';
    function paint(txt, sub) {
      if (shown === txt + sub) return; shown = txt + sub;
      const { ctx } = scr; ctx.fillStyle = '#0e1013'; ctx.fillRect(0, 0, 160, 90);
      ctx.fillStyle = '#f4efe4'; ctx.font = `600 22px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(txt, 80, 42);
      ctx.fillStyle = '#d9a441'; ctx.font = `400 15px ${FONT}`; ctx.fillText(sub, 80, 68); scr.tex.needsUpdate = true;
    }
    paint('Ready', 'flat white ▸');
    return {
      hit, stools,
      brewing: () => brew.t >= 0,
      brew(sound = true) { if (brew.t >= 0) return false; brew.t = 0; cup.visible = true; if (sound) ctx.sfx.espresso?.(); return true; },
      update(dt, t) {
        clock.forEach((m) => { m.material.emissiveIntensity = Math.floor(t) % 2 ? 1.6 : 1.3; });
        if (brew.t >= 0) {
          brew.t += dt;
          const k = brew.t;
          paint(k < 2.7 ? 'Grinding' : k < 7 ? 'Pouring' : 'Enjoy ☕', k < 7 ? '•'.repeat(1 + Math.floor(k * 2) % 3) : 'flat white');
          fill.position.y = 0.01 + 0.065 * sstep(3, 6.8, k); fill.material.color.set(k > 5.5 ? '#c79a6a' : '#5a3420');
          if (k > 7) { brew.t = -1; brew.left = 25; brew.served++; }
        } else if (brew.left > 0) {
          brew.left -= dt;
          if (brew.left <= 0) { cup.visible = false; paint('Ready', 'flat white ▸'); }
        }
        const hot = cup.visible ? (brew.t >= 0 ? sstep(3, 5, brew.t) : clamp(brew.left / 25, 0, 1)) : 0;
        for (const s of steam) {
          const u = (t * 0.35 + s.userData.ph) % 1;
          s.position.set(Math.sin(u * 9 + s.userData.ph * 6) * 0.015, 0.1 + u * 0.22, 0); s.scale.setScalar(0.05 + u * 0.08);
          s.material.opacity = hot * 0.5 * Math.sin(u * Math.PI);
        }
      },
    };
  })();
  {
    const plate = makeScreen(world, 0.9, 0.22, 360, 88, 9.4, 1.75, -3.47);
    plate.ctx.fillStyle = 'rgba(20,20,22,.85)'; plate.ctx.beginPath(); plate.ctx.roundRect(0, 0, 360, 88, 14); plate.ctx.fill();
    plate.ctx.font = `600 40px ${FONT}`; plate.ctx.fillStyle = '#fff'; plate.ctx.fillText(fit(plate.ctx, dash.officeName(), 310), 26, 58);
    plate.mesh.material.transparent = true; plate.tex.needsUpdate = true;
  }
  Object.assign(ctx, { kitchen });
  ctx.onFrame((dt, t) => kitchen.update(dt, t), 70);
  ctx.action('coffee',
    { hover: () => `<b>Coffee machine</b><div class="k">${kitchen.brewing() ? 'Brewing…' : 'Click to make a flat white'}</div>`, click: () => kitchen.brew() });
  ctx.hoverTargets(() => [kitchen.hit], 40);
}
