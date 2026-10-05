// Furniture: lamps and their glow, pendants, floor lamps, bookshelves, art, plants (one instanced kit for all
// their leaves), seats you can sit in, office chairs, monitors and sofas.

import * as THREE from 'three';
import { artTexture, box, cyl, hash, leafTexture, mat, mergedBoxes, rng, ROOM, SEATED_EYE, solid } from '../util.js';

export function install(ctx) {
  const { world, lamps } = ctx;
  Object.assign(ctx, { sofa, plant, bookshelf, floorLamp, pendant, addLamp, officeChair, monitor, art, smallPlant, addSeat, plantKit });
  // ----- furniture helpers -----
  const LAMP_DIM = 0.6, GLOW_DIM = 0.6;   // overall dimmer for lamp light and the glow of bulbs/shades
  function addLamp(x, y, z, base) {
    base *= LAMP_DIM;
    const l = new THREE.PointLight('#ffc98a', base, 16, 2);
    l.position.set(x, y, z);
    world.add(l);
    lamps.push({ light: l, base });
  }
  const glowMat = (eBase, color = '#fff3dd') => {
    eBase *= GLOW_DIM;
    const m = new THREE.MeshStandardMaterial({ color, emissive: '#ffcf8a', emissiveIntensity: eBase, roughness: 0.9, side: THREE.DoubleSide });
    lamps.push({ mat: m, eBase });
    return m;
  };
  const bulbM = glowMat(1.7), barM = glowMat(1.5);
  function pendant(x, z, { drop = 1.0, light = 0, shade = '#2b2b2b' } = {}) {
    const y = ROOM.h - drop;
    cyl(world, 0.006, 0.006, drop, '#222', x, ROOM.h - drop / 2, z, { shadow: false });
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.26, 24, 1, true), mat(shade, { roughness: 0.5, side: THREE.DoubleSide }));
    sh.position.set(x, y - 0.12, z);
    world.add(sh);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), bulbM);
    bulb.position.set(x, y - 0.22, z);
    world.add(bulb);
    if (light) addLamp(x, y - 0.35, z, light);
  }
  function floorLamp(x, z, light = 10) {
    cyl(world, 0.16, 0.18, 0.03, '#2a2a2a', x, 0.015, z);
    cyl(world, 0.012, 0.012, 1.5, '#2a2a2a', x, 0.77, z);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.3, 24, 1, true), glowMat(0.9, '#efe2c8'));
    shade.position.set(x, 1.56, z);
    world.add(shade);
    if (light) addLamp(x, 1.45, z, light);   // 0: shade glows, no light
    solid(x, z, 0.35, 0.35);
  }
  function bookshelf(x, z, rotY, w, h, rows) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; world.add(g);
    const D = 0.34, gap = (h - 0.06) / rows;
    const frame = [[0.04, h, D, -w / 2 + 0.02, h / 2, 0], [0.04, h, D, w / 2 - 0.02, h / 2, 0], [w, 0.03, D, 0, h - 0.015, 0],
      [w, 0.04, D, 0, 0.02, 0], [w, h, 0.02, 0, h / 2, -D / 2 + 0.01]];
    for (let r = 1; r < rows; r++) frame.push([w, 0.025, D, 0, 0.04 + r * gap, 0]);
    g.add(mergedBoxes(frame, mat('#7a5232', { roughness: 0.7 })));
    const R = rng(hash(`${x},${z}`)), books = [];
    const pal = ['#8c3b2f', '#2f5d62', '#d9a441', '#3f4a6b', '#e7dcc8', '#6b8e4e', '#a35d7a', '#1f2a33', '#c26a3d'];
    for (let r = 0; r < rows; r++) {
      let bx = -w / 2 + 0.06;
      const by = 0.04 + r * gap + 0.0125;
      while (bx < w / 2 - 0.1) {
        if (R() < 0.07) { bx += 0.18; continue; }
        const bw = 0.025 + R() * 0.035, bh = Math.min(gap - 0.05, 0.17 + R() * 0.12), lean = R() < 0.04;
        books.push([lean ? bh : bw, lean ? bw : bh, 0.2 + R() * 0.06, bx + (lean ? bh : bw) / 2, by + (lean ? bw : bh) / 2, 0.02,
          pal[Math.floor(R() * pal.length)]]);
        bx += (lean ? bh : bw) + 0.004;
      }
    }
    g.add(mergedBoxes(books, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
    const horiz = Math.abs(Math.sin(rotY)) < 0.5;
    solid(x, z, horiz ? w : D, horiz ? D : w);
    return g;
  }
  let artSeed = 3;
  function art(x, y, z, rotY, w, h) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; world.add(g);
    box(g, w + 0.08, h + 0.08, 0.04, '#1c1a18', 0, 0, 0);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: artTexture(artSeed++, w / h), roughness: 0.9 }));
    pic.position.z = 0.022;
    g.add(pic);
  }
  // All plant foliage is three instanced meshes (twig cards, strap-leaf cards, stems) sharing one alpha-tested
  // leaf atlas; cards sway in the vertex shader. Built lazily since plant() runs before this point in the file.
  function plantKit() {
    if (plantKit.k) return plantKit.k;
    const map = leafTexture(), time = { value: 0 };
    const sway = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = dot(instanceMatrix[3].xyz, vec3(3.1, 1.7, 2.3)), w = position.y * position.y;
          w *= instanceMatrix[3].y > ${ROOM.h.toFixed(1)} ? 4.0 + 2.5 * sin(uTime * 0.37 + ph * 0.05) * sin(uTime * 0.13) : 1.0;   // out in the wind on the roof
          transformed.x += sin(uTime * 0.6 + ph) * 0.01 * w; transformed.z += sin(uTime * 0.9 + ph * 1.7) * 0.007 * w; }`);
    };
    const leafM = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
    const depthM = new THREE.MeshDepthMaterial({ map, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
    leafM.onBeforeCompile = depthM.onBeforeCompile = sway;
    const cardGeo = (u0, droop) => {
      const g = new THREE.PlaneGeometry(1, 1, 1, 4); g.translate(0, 0.5, 0);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { p.setZ(i, -droop * p.getY(i) ** 2); uv.setX(i, u0 + uv.getX(i) * 0.5); }
      g.computeVertexNormals();
      return g;
    };
    const inst = (geo, m, n) => {
      const im = new THREE.InstancedMesh(geo, m, n);
      // layer 1: keep alpha cards out of the AO/depth passes
      im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.layers.set(1);
      world.add(im);
      return im;
    };
    const twig = inst(cardGeo(0, 0.35), leafM, 2600), strap = inst(cardGeo(0.5, 0.15), leafM, 3000);
    const stem = inst(new THREE.CylinderGeometry(0.6, 1, 1, 5).translate(0, 0.5, 0), mat('#5b4532', { roughness: 1 }), 200);
    twig.customDepthMaterial = strap.customDepthMaterial = depthM;
    twig.onBeforeRender = () => { time.value = performance.now() / 1000; };
    const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
    const M = new THREE.Matrix4(), rollM = new THREE.Matrix4(), sc = new THREE.Vector3();
    // Card base at p growing along d, leaf face turned up/outward, so the bend in the geometry droops the tip.
    const add = (im, p, d, sx, sy, roll = 0, color) => {
      by.copy(d).normalize(); bx.crossVectors(by, Math.abs(by.y) > 0.99 ? X : UP).normalize(); bz.crossVectors(bx, by);
      M.makeBasis(bx, by, bz).multiply(rollM.makeRotationY(roll)).scale(sc.set(sx, sy, im === stem ? sx : sy)).setPosition(p);
      im.setMatrixAt(im.count, M); im.instanceMatrix.needsUpdate = true;
      if (color) { im.setColorAt(im.count, color); im.instanceColor.needsUpdate = true; }
      im.count++;
    };
    return (plantKit.k = { twig, strap, stem, add });
  }
  function smallPlant(parent, x, y, z) {
    cyl(parent, 0.06, 0.05, 0.1, '#d9cfc0', x, y + 0.05, z);
    const { strap, add } = plantKit(), R = rng(hash(`${x}|${y}|${z}`)), p = new THREE.Vector3(), d = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + R(), h = 0.12 + R() * 0.08;
      p.set(x + Math.cos(a) * 0.015, y + 0.09, z + Math.sin(a) * 0.015); d.set(Math.cos(a) * (0.3 + R() * 0.5), 1, Math.sin(a) * (0.3 + R() * 0.5));
      add(strap, p, d, h * 0.9, h, R() - 0.5, c.setRGB(0.8 + R() * 0.2, 1.05, 0.95 + R() * 0.2));
    }
  }
  // Pot plus one of three plant types picked by position: leafy ficus-like shrub, upright snake plant, arching fern-like fronds.
  function plant(x, z, s = 1) {
    cyl(world, 0.22 * s, 0.17 * s, 0.45 * s, '#d6d2c8', x, 0.225 * s, z);
    cyl(world, 0.2 * s, 0.2 * s, 0.02, '#3b2c22', x, 0.44 * s, z, { seg: 12, mat: { roughness: 1 } });
    const { twig, strap, stem, add } = plantKit(), R = rng(hash(`${x}|${z}`)), kind = [0, 0, 1, 2][hash(`${z}|${x}`) % 4];
    const p = new THREE.Vector3(), d = new THREE.Vector3(), c = new THREE.Color(), tint = new THREE.Color(0.85 + R() * 0.2, 1, 0.8 + R() * 0.25);
    const soil = 0.45 * s, cy = 0.85 * s, cr = 0.42 * s;
    if (kind === 0) {
      add(stem, p.set(x, soil, z), d.set(0, 1, 0), 0.025 * s, cy - soil);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + R(), q = new THREE.Vector3(x + Math.cos(a) * cr * 0.55, cy + (R() - 0.3) * cr * 0.8, z + Math.sin(a) * cr * 0.55);
        p.set(x, cy - 0.1 * s, z); d.subVectors(q, p); add(stem, p, d, 0.012 * s, d.length());
      }
      for (let i = 0; i < 72; i++) {
        const u = R() * 2 - 1, a = R() * Math.PI * 2, k = Math.sqrt(1 - u * u), f = 0.35 + R() * 0.6;
        d.set(Math.cos(a) * k, u * 0.7 + 0.3, Math.sin(a) * k);
        p.set(x + d.x * cr * f * 0.75, cy + d.y * cr * f * 0.9, z + d.z * cr * f * 0.75);
        d.x += (R() - 0.5) * 0.6; d.z += (R() - 0.5) * 0.6; d.y += 0.25;
        const h = (0.32 + R() * 0.16) * s;
        add(twig, p, d, h * 0.9, h, (R() - 0.5) * 1.2, c.copy(tint).multiplyScalar((0.55 + 0.45 * f) * (0.85 + R() * 0.3)));
      }
    } else if (kind === 1) {
      for (let i = 0; i < 13; i++) {
        const a = i * 2.4 + R(), r = R() * 0.1 * s, h = (0.65 + R() * 0.4) * s;
        p.set(x + Math.cos(a) * r, soil, z + Math.sin(a) * r); d.set(Math.cos(a) * (0.08 + R() * 0.2), 1, Math.sin(a) * (0.08 + R() * 0.2));
        add(strap, p, d, h * 0.5, h, R() * 3, c.copy(tint).multiplyScalar(0.8 + R() * 0.35));
      }
    } else {
      add(stem, p.set(x, soil, z), d.set(0, 1, 0), 0.02 * s, 0.25 * s);
      for (let i = 0; i < 30; i++) {
        const a = i * 2.4 + R() * 0.5, up = i < 8 ? 1.6 + R() : 0.5 + R() * 0.7, h = (0.38 + R() * 0.18) * s, y = soil + (0.05 + R() * 0.2) * s;
        p.set(x, y, z); d.set(Math.cos(a), up, Math.sin(a));
        add(twig, p, d, h * 0.85, h, (R() - 0.5) * 0.4, c.copy(tint).multiplyScalar((i < 8 ? 1.05 : 0.8) * (0.85 + R() * 0.3)));
      }
    }
    solid(x, z, 0.5 * s, 0.5 * s);
  }
  // Seats you can sit in (click one): chairs and sofa places, facing local +z. `eye` is the seated eye height.
  const seats = [];
  function addSeat(g, name, lx, eye) {
    const seat = { name, x: g.position.x + Math.cos(g.rotation.y) * lx, z: g.position.z - Math.sin(g.rotation.y) * lx, rotY: g.rotation.y, eye, obj: g };
    seats.push(seat);
    return seat;
  }
  function officeChair(x, z, rotY, color = '#2b2e33') {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; world.add(g);
    box(g, 0.5, 0.08, 0.5, color, 0, 0.43, 0);
    box(g, 0.48, 0.55, 0.06, color, 0, 0.78, -0.25);
    cyl(g, 0.03, 0.03, 0.36, '#555', 0, 0.22, 0);
    cyl(g, 0.28, 0.28, 0.04, '#333', 0, 0.04, 0, { seg: 5 });
    const seat = addSeat(g, 'Chair', 0, SEATED_EYE);
    g.traverse((o) => { if (o.isMesh) o.userData.seat = seat; });
    return g;
  }
  function monitor(parent, w, h, x, yBottom, z, rotY = 0) {
    const g = new THREE.Group(); g.position.set(x, yBottom, z); g.rotation.y = rotY; parent.add(g);
    const bezel = box(g, w + 0.03, h + 0.03, 0.03, '#141518', 0, 0.12 + h / 2, -0.005, { mat: { roughness: 0.4 } });
    box(g, 0.05, 0.12, 0.04, '#2a2c30', 0, 0.06 + 0.01, -0.03);
    box(g, 0.24, 0.015, 0.16, '#2a2c30', 0, 0.008, -0.03);
    return { g, bezel, screenY: 0.12 + h / 2, screenZ: 0.012 };
  }
  function sofa(x, z, rotY, len = 2.4, color = '#5b6b7d', parent = world) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; parent.add(g);
    box(g, len, 0.4, 0.9, color, 0, 0.2, 0);
    box(g, len, 0.12, 0.7, color, 0, 0.46, 0.08, { mat: { roughness: 1 } });
    box(g, len, 0.5, 0.2, color, 0, 0.6, -0.35);
    box(g, 0.2, 0.32, 0.9, color, -len / 2 + 0.1, 0.52, 0);
    box(g, 0.2, 0.32, 0.9, color, len / 2 - 0.1, 0.52, 0);
    const CUSH = ['#d9a441', '#b5654a', '#e7dcc8', '#6b8e4e', '#a35d7a'];
    for (const side of [-1, 1]) box(g, 0.26, 0.34, 0.12, CUSH[hash(`${x}${z}${side}`) % CUSH.length], side * (len / 2 - 0.33), 0.72, -0.2).rotation.x = -0.25;
    // One place per ~0.7 m of seat; clicking the sofa sits you in the place nearest where you aimed.
    const n = Math.max(1, Math.round((len - 0.4) / 0.7)), places = [];
    for (let i = 0; i < n; i++) places.push(addSeat(g, len < 1.4 ? 'Armchair' : 'Sofa', ((i + 0.5) / n - 0.5) * (len - 0.4), 1.08));
    g.traverse((o) =>
      { if (o.isMesh) o.userData.seatAt = (pt) => places.reduce((a, b) => (Math.hypot(b.x - pt.x, b.z - pt.z) < Math.hypot(a.x - pt.x, a.z - pt.z) ? b : a));
      });
    const horiz = Math.abs(Math.sin(rotY)) < 0.5;
    solid(x, z, horiz ? len : 0.9, horiz ? 0.9 : len);
  }
  Object.assign(ctx, { seats, barM, glowMat });
  Object.defineProperty(ctx, 'artSeed', { get: () => artSeed, set: (v) => { artSeed = v; }, enumerable: true });
}
