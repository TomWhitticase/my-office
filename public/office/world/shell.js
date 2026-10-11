// The building shell: the wooden floor and rugs, the ceiling and its beams, the outer walls with their floor-to-ceiling
// windows, the sunbeams through them, and the pillars; installReception (after the city) the reception desk and the
// lounge's brick wall. shellWalls and sunbeams build the same walls, ceiling and beams for the empty floors below (floors/empty-floors.js).

import * as THREE from 'three';
import { box, brickTexture, mat, mergedBoxes, ROOM, rugTexture, solid, woodTexture } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { world } = ctx;
  Object.assign(ctx, { rug });
  // ----- building shell -----
  const woodTex = woodTexture();
  woodTex.repeat.set(10, 7.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
  let rugSeed = 1;
  const rugs = [];   // soft footsteps
  function rug(x0, x1, z0, z1, base, accent, y = 0.006) {
    rugs.push({ x0, x1, z0, z1 });
    const tex = accent ? rugTexture(base, accent, rugSeed++) : null;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0),
      new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : base, map: tex, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; world.add(m);
    return m;
  }
  const officeCarpet = rug(6, 19.9, -14.9, -3.5, '#3a4660', null, 0.004);   // my office carpet
  rug(10.5, 15.5, -11, -7.5, '#d8c7a8', '#33405a');
  rug(-15.9, -12.1, 4.4, 9.6, '#cdb99b', '#8c5a3c');                        // breakroom
  rug(7.4, 12.6, 6.8, 11.2, '#b5654a', '#e2c9a6');                          // lounge

  // Ceiling with exposed timber beams.
  const ceilingM = new THREE.MeshStandardMaterial({ color: '#efe7da', roughness: 1, emissive: '#efe7da', emissiveIntensity: 0.2 });
  const put = (w, h, d, x, y, z, material, shadow = true) => box(world, w, h, d, '', x, y, z, { material, shadow });
  const { panes, winRuns, wallM, frameM } = shellWalls(put, ceilingM, true);
  {
    const slats = [];
    for (let x = -19.8; x < 5.9; x += 0.14) if (x < -10.5 || x > -5.9) slats.push([0.05, ROOM.h - 0.1, 0.04, x, (ROOM.h - 0.1) / 2, -14.88]);
    world.add(mergedBoxes(slats, mat('#b07d4f', { roughness: 0.7 })));
  }
  // Sunbeams: each window pane swept along the light direction, drawn additively and faded with depth.
  // `shut` is how much each window group's blinds cut the light (0 raised, ~0.9 lowered).
  const shaftU = { uLight: { value: new THREE.Vector3(0, -1, 0) }, color: { value: new THREE.Color() }, strength: { value: 0 }, time: { value: 0 },
    shut: { value: WIN.map(() => 0) } };
  const shafts = sunbeams(panes, shaftU);
  world.add(shafts);

  for (const [x, z] of [[4, -8], [4, 8], [-9, 0.5 - 2.6]]) { box(world, 0.5, ROOM.h, 0.5, '#a8774b', x, ROOM.h / 2, z, { mat: { roughness: 0.7 } });
    solid(x, z, 0.5, 0.5); }
  Object.assign(ctx, { rugs, frameM, winRuns, winKey, WIN, shaftU, wallM, ceilingM, shafts, shellWalls, sunbeams, officeFloor: floor, officeCarpet });
}

// The shell every floor of the tower shares: the ceiling and its beams, and the outer walls with their floor-to-ceiling
// windows, each box through `put(w, h, d, x, y, z, material, shadow)`. `accent` paints the south wall behind the desks green
// and in my office navy (the empty floors below leave it plain). Returns the panes (for the sunbeams) and window runs.
const WIN = ['north', 'east', 'west', 'office'], winKey = (axis, fixed, u) => axis === 'x' ? 'north' : fixed < 0 ? 'west' : u < -3.5 ? 'office' : 'east';
function shellWalls(put, ceilingM, accent) {
  const H = ROOM.h + 0.15;
  put(40.4, 0.2, 30.4, 0, ROOM.h + 0.1, 0, ceilingM);
  const beamM = mat('#9c6b43', { roughness: 0.75 });
  for (let x = -18; x <= 18; x += 4) put(0.22, 0.28, 30, x, ROOM.h - 0.14, 0, beamM);

  const wallM = mat('#ece3d3', { roughness: 0.95 }), frameM = mat('#2f3236', { metalness: 0.4, roughness: 0.5 });
  const sillM = mat('#a87447', { roughness: 0.6 });
  const outerGlassM = new THREE.MeshBasicMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.05, depthWrite: false });
  // Outer wall along x (z fixed) or z (x fixed); `windows` are [from, to] spans of floor-to-ceiling glazing.
  // Window blinds are grouped per wall; the stretch of east wall inside my office is its own group.
  const panes = [], winRuns = [];
  function wall(axis, fixed, from, to, windows = [], m = wallM) {
    const inward = Math.sign(-fixed);
    const seg = (a, b, y0, y1, material = m, depth = 0.2, off = 0, shadow = true) => {
      const len = b - a, mid = (a + b) / 2;
      return axis === 'x'
        ? put(len, y1 - y0, depth, mid, (y0 + y1) / 2, fixed + off * inward, material, shadow)
        : put(depth, y1 - y0, len, fixed + off * inward, (y0 + y1) / 2, mid, material, shadow);
    };
    let cur = from;
    for (const [a, b] of windows) {
      if (a > cur) seg(cur, a, 0, H);
      seg(a, b, 0, 0.45); seg(a, b, 3.05, H);
      const glass = seg(a, b, 0.45, 3.05, outerGlassM, 0.02, 0, false);
      seg(a, b, 0.45, 0.49, sillM, 0.3, 0.12);
      const n = Math.max(1, Math.round((b - a) / 2.5)), step = (b - a) / n;
      winRuns.push({ axis, fixed, a, b, n, step, inward, glass });
      for (let q = 0; q <= n; q++) seg(a + q * step - 0.04, a + q * step + 0.04, 0.49, 3.05, frameM, 0.12);   // mullions stand on the sill
      for (let q = 0; q < n;
        q++) panes.push({ axis, fixed, a: a + q * step + 0.04, b: a + (q + 1) * step - 0.04, inward,
        win: WIN.indexOf(winKey(axis, fixed, a + (q + 0.5) * step)) });
      seg(a, b, 2.3, 2.36, frameM, 0.1);
      cur = b;
    }
    if (cur < to) seg(cur, to, 0, H);
  }
  wall('x', 15, -20, 20, [[-20, 6], [16, 20]]);
  wall('z', -20, -15, 15, [[-15, 2], [6.8, 10.9]]);   // solid from 10.9 north: the kitchen's tall units stand against it
  wall('z', 20, -15, 15, [[-15, -3.5], [2.5, 15]]);   // the lift core fills the stretch between my office and the meeting rooms
  wall('x', -15, -20, 6, [], accent ? mat('#2f463b', { roughness: 0.9 }) : wallM);          // green accent behind the desks
  wall('x', -15, 6, 19.9, [], accent ? mat('#2b3650', { roughness: 0.9 }) : wallM);         // navy in my office (to the east wall's face)
  return { panes, winRuns, wallM, frameM, outerGlassM };
}

// Sunbeams through `panes`, lit by the uniforms `u` (the office's shaftU; a floor below passes its own `shut` and `floorY`).
function sunbeams(panes, u) {
  const pos = [], along = [], nIn = [], win = [], idx = [];
  for (const p of panes) {
    const y0 = 0.49, y1 = 3.05;
    const cs = p.axis === 'x' ? [[p.a, y0, p.fixed], [p.b, y0, p.fixed], [p.b, y1, p.fixed], [p.a, y1, p.fixed]]
      : [[p.fixed, y0, p.a], [p.fixed, y0, p.b], [p.fixed, y1, p.b], [p.fixed, y1, p.a]];
    const nrm = p.axis === 'x' ? [0, 0, p.inward] : [p.inward, 0, 0], base = pos.length / 3;
    for (const t of [0, 1]) for (const c of cs) { pos.push(...c); along.push(t); nIn.push(...nrm); win.push(p.win); }
    for (const [a, b, c, d] of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) idx.push(base + a, base + b, base + c,
      base + a, base + c, base + d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute('nIn', new THREE.Float32BufferAttribute(nIn, 3));
  g.setAttribute('win', new THREE.Float32BufferAttribute(win, 1));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { floorY: { value: 0 }, ...u }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `attribute float along; attribute vec3 nIn; attribute float win; uniform vec3 uLight; uniform float shut[${WIN.length}]; varying float vA; varying float vFace; varying vec3 vW;
      void main() { vec3 p = position + along * 16.0 * uLight; vA = along; vFace = max(dot(uLight, nIn), 0.0) * (1.0 - shut[int(win + 0.5)]);
        vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 color; uniform float strength, time, floorY; varying float vA; varying float vFace; varying vec3 vW;
      void main() {
        float fade = smoothstep(0.0, 0.05, vA) * pow(1.0 - vA, 1.7);
        float dust = 0.8 + 0.2 * sin(vW.x * 2.1 + vW.y * 3.3 + time * 0.5) * sin(vW.z * 1.7 - time * 0.35);
        gl_FragColor = vec4(color * strength * vFace * fade * dust * smoothstep(0.0, 0.3, vW.y - floorY) * 0.03, 1.0);
      }`,
  }));
  m.frustumCulled = false;
  return m;
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function installReception(ctx) {
  const { world } = ctx;
  // Reception, side-on to the lift core, the receptionist's back to the floor sign.
  box(world, 0.7, 1.05, 2.0, '#c49a6c', 16.6, 0.525, -2.3, { mat: { roughness: 0.55 } });
  box(world, 0.85, 0.05, 2.1, '#2a2724', 16.6, 1.075, -2.3, { mat: { roughness: 0.35 } });
  solid(16.6, -2.3, 0.85, 2.1);

  // Brick feature wall in the lounge.
  {
    const bt = brickTexture();
    bt.repeat.set(5, 1.7);
    box(world, 10, ROOM.h, 0.06, '', 11, ROOM.h / 2, 14.87, { material: new THREE.MeshStandardMaterial({ map: bt, roughness: 0.95 }) });
  }
}
