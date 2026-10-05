// More furniture: along your office's glass on the desk floor a binder credenza, filing cabinets, a copier with recycling
// bins and a water cooler; in the lobby a waiting sofa, side table, coat and umbrella stands.

import * as THREE from 'three';
import { box, cyl, mat, mergedBoxes, solid } from '../util.js';

export function install(ctx) {
  const { bookshelf, smallPlant, world, sofa, plant } = ctx;
  Object.assign(ctx, { bins });
  // ----- more furniture -----
  // Desk floor, along my office's glass: a low binder credenza, filing cabinets, a copier with recycling bins, a water cooler.
  const metalM = mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.3 }), plainM = mat('#ffffff', { vertexColors: true, roughness: 0.8 });
  bookshelf(5.78, -6.2, -Math.PI / 2, 2.2, 1.1, 2);
  smallPlant(world, 5.78, 1.1, -6.9);
  {
    const fc = [];
    for (const z of [-9.7, -10.25]) {
      fc.push([0.62, 1.0, 0.52, 5.66, 0.5, z, '#8d9399']);
      for (let i = 0; i < 3; i++) fc.push([0.012, 0.29, 0.47, 5.345, 0.2 + i * 0.32, z, '#9ba1a7'], [0.02, 0.02, 0.14, 5.33, 0.3 + i * 0.32, z, '#d6d9dd']);
    }
    world.add(mergedBoxes(fc, metalM));
    solid(5.66, -9.975, 0.62, 1.07);
    cyl(world, 0.04, 0.035, 0.1, '#2f6f8f', 5.6, 1.05, -9.6);
    // Copier: body, scanner lid, control panel, paper trays, output tray.
    world.add(mergedBoxes([[1.0, 0.92, 0.66, 4.5, 0.46, -14.15, '#dcdcd8'], [1.0, 0.08, 0.66, 4.5, 0.96, -14.15, '#3a3c40'],
      [0.32, 0.06, 0.16, 4.82, 0.95, -13.78, '#2a2c30'], [0.9, 0.012, 0.01, 4.5, 0.3, -13.815, '#9a9a96'], [0.9, 0.012, 0.01, 4.5, 0.55, -13.815, '#9a9a96'],
      [0.4, 0.03, 0.3, 4.05, 0.75, -13.98, '#f4f4f0']], metalM));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ color: '#7fc3ff' }));
    panel.rotation.x = -Math.PI / 2 + 0.5; panel.position.set(4.82, 0.985, -13.78); world.add(panel);
    solid(4.5, -14.15, 1.0, 0.66);
  }
  // Recycling bins: paper, plastic, general.
  function bins(x, z) {
    const l = [];
    ['#2f6fd1', '#e0a63a',
      '#5a5f66'].forEach((c, i) => l.push([0.3, 0.62, 0.32, x + i * 0.34, 0.31, z, c], [0.28, 0.02, 0.3, x + i * 0.34, 0.63, z, '#e9e7e2']));
    world.add(mergedBoxes(l, plainM));
    solid(x + 0.34, z, 1.04, 0.34);
  }
  bins(3.0, -14.6);
  function waterCooler(x, z) {
    world.add(mergedBoxes([[0.32, 0.95, 0.32, x, 0.475, z, '#eceae4'], [0.2, 0.08, 0.03, x, 0.82, z - 0.17, '#2a2c30'],
      [0.22, 0.02, 0.1, x, 0.36, z - 0.2, '#9a9a96']], plainM));
    cyl(world, 0.15, 0.15, 0.38, '#7fb4e0', x, 1.15, z, { mat: { transparent: true, opacity: 0.55, roughness: 0.1 } });
    cyl(world, 0.035, 0.035, 0.24, '#f4f4f0', x + 0.2, 0.75, z, { seg: 10 });   // cup dispenser
    solid(x, z, 0.4, 0.4);
  }
  waterCooler(5.55, -1.7);
  // Lobby: a waiting sofa against my office's glass, a side table, a coat stand, an umbrella stand and a plant along the meeting room glass.
  sofa(14.6, -2.95, 0, 1.9, '#4b5a6a');
  cyl(world, 0.26, 0.26, 0.03, '#2a2724', 13.15, 0.55, -3.0, { seg: 24 }); cyl(world, 0.03, 0.03, 0.54, '#2f3236', 13.15, 0.27, -3.0);
  cyl(world, 0.18, 0.18, 0.02, '#2f3236', 13.15, 0.01, -3.0);
  smallPlant(world, 13.15, 0.565, -3.0); solid(13.15, -3.0, 0.5, 0.5);
  {
    const x = 15.6, z = 2.05;
    cyl(world, 0.22, 0.24, 0.03, '#2a2a2a', x, 0.015, z, { seg: 20 }); cyl(world, 0.02, 0.025, 1.8, '#5a3d28', x, 0.9, z);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4;
      box(world, 0.16, 0.02, 0.02, '#2a2a2a', x + Math.cos(a) * 0.07, 1.72, z + Math.sin(a) * 0.07).rotation.y = -a; }
    box(world, 0.34, 0.75, 0.16, '#6b4f3a', x - 0.02, 1.32, z + 0.09).rotation.z = 0.05;   // a coat
    box(world, 0.06, 0.6, 0.05, '#c0392b', x + 0.1, 1.35, z - 0.08);                       // a scarf
    cyl(world, 0.13, 0.12, 0.5, '#3a3c40', 15.05, 0.25, 2.1, { mat: { metalness: 0.5, roughness: 0.4 } });
    for (const [dx, c] of [[-0.04, '#1f2a44'], [0.05, '#2f6f8f']]) { cyl(world, 0.012, 0.012, 0.85, c, 15.05 + dx, 0.62, 2.1 + dx, { seg: 8 });
      cyl(world, 0.02, 0.02, 0.1, '#5a3d28', 15.05 + dx, 1.07, 2.1 + dx, { seg: 8 }); }
    solid(x, z, 0.4, 0.4); solid(15.05, 2.1, 0.3, 0.3);
  }
  plant(14.45, 2.0, 0.9);
  Object.assign(ctx, { metalM });
}
