// The meeting rooms: glass rooms like your office with doorways instead of doors, two along the east windows either side
// of a solid partition, one by the north windows and a narrower huddle room the same depth beside it (the other side of a
// solid partition, between it and the ping pong table), each
// with a table, chairs, a whiteboard and a pendant. MR lists them with their seats (idle sessions meet in them).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AISLE, box, cyl, FONT, makeScreen, mat, mergedBoxes, rng, ROOM, solid } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { plant, blinds, glassDoor, glassM, frostTex, world, frameM, wallM, wallGroup, hangBlind, BL, deskTopM, barM, addLamp, legM, officeChair,
    markerBoard } = ctx;
  // The huddle room came later: three gives every object a uuid from Math.random, so its parts are built with a seeded one
  // of their own and don't shift the draws of everything after them in a seeded run (the harness).
  const seeded = (seed, fn) => { const random = Math.random; Math.random = rng(seed); try { fn(); } finally { Math.random = random; } };
  // ----- meeting rooms -----
  // Glass rooms like my office (tint, frosted band, mullions) with doorways instead of doors: two along the east windows
  // either side of a solid partition, one by the north windows. All panes, frames and frost are three meshes.
  // Seats: `xs` along both long sides of a table at (tx, tz); idle sessions walk in by `entry`, then the south or north corridor.
  const MR = [
    { tx: 17.2, tz: 5, len: 2.8, dep: 1.1, co: 0.85, xs: [16.3, 17.2, 18.1],
      entry: [[13.4, AISLE], [13.4, 3.55], [14.6, 3.55]], south: 3.55, north: 6.6, around: 14.6 },
    { tx: 17.2, tz: 10.2, len: 2.2, dep: 1.1, co: 0.85, xs: [16.7, 17.7],
      entry: [[13.4, AISLE], [13.4, 8.55], [14.6, 8.55]], south: 8.55, north: 11.85, around: 14.6 },
    { tx: 0.8, tz: 13.3, len: 1.8, dep: 0.9, co: 0.75, xs: [0.35, 1.25],
      entry: [[-0.75, AISLE], [-0.75, 11.9]], south: 11.9, north: 14.55, around: -0.75 },
    // The huddle room, west of the small one and the same depth: in from the walkway to the ping pong table's east end (x -4.75).
    { tx: -3.6, tz: 13.3, len: 1.4, dep: 0.8, co: 0.7, xs: [-4, -3.2],
      entry: [[-4.75, AISLE], [-4.75, 11.9]], south: 11.9, north: 14.55, around: -4.75 },
  ];
  {
    const panes = [], frames = [], frost = [];
    // A glass wall along x (z fixed) or z (x fixed), with optional doorway [a, b]: posts, header and a glass transom over it.
    // Blinds (group `bl`) hang full height on the room's side (`inward`), either side of the doorway.
    const mrWall = (axis, fixed, from, to, gap, bl, inward) => {
      const blind = wallGroup(axis, fixed, inward, (from + to) / 2), cells = [];
      const X = axis === 'x', at = (list, u, w, h, d, y) => list.push(X ? [w, h, d, u, y, fixed] : [d, h, w, fixed, y, u]);
      for (const [a, b] of gap ? [[from, gap[0]], [gap[1], to]] : [[from, to]]) {
        const len = b - a, mid = (a + b) / 2, n = Math.max(1, Math.round(len / 1.5));
        at(panes, mid, len, ROOM.h, 0.03, ROOM.h / 2);
        at(frames, mid, len, 0.06, 0.06, 0.03); at(frames, mid, len, 0.06, 0.06, ROOM.h - 0.03);
        for (let i = 0; i <= n; i++) at(frames, a + (i * len) / n, 0.05, ROOM.h, 0.07, ROOM.h / 2);
        at(frost, mid, len, 0.16, 0.036, 1.46); frost[frost.length - 1].len = len;
        solid(X ? mid : fixed, X ? fixed : mid, X ? len : 0.08, X ? 0.08 : len);
        cells.push([blind.ux(mid), len - 0.2]);
      }
      hangBlind(blind.g, cells, BL.top, 0.06, 0.11, bl);
      if (gap) {
        const mid = (gap[0] + gap[1]) / 2, len = gap[1] - gap[0];
        at(frames, mid, len + 0.06, 0.08, 0.08, 2.24);
        at(panes, mid, len, ROOM.h - 2.28, 0.03, (ROOM.h + 2.28) / 2);
      }
    };
    const { meetSouth, meetNorth, meetSmall, meetHuddle } = blinds;
    mrWall('x', 2.5, 14, 20, null, meetSouth, 1); mrWall('z', 14, 2.5, 7.5, [3.0, 4.1], meetSouth, 1); mrWall('z', 14, 7.5, 12.5, [8.0, 9.1], meetNorth, 1);
    mrWall('x', 12.5, 14, 20, null, meetNorth, -1);
    mrWall('z', 3.4, 11.2, 15, null, meetSmall, -1); mrWall('x', 11.2, -1.8, 3.4, [-1.3, -0.2], meetSmall, 1);
    // Doors in the doorways, swinging into the rooms. People walking in or out open them on the way through.
    glassDoor({ name: 'Meeting room door', hx: 14, hz: 3.02, r0: -Math.PI / 2, swing: 1, W: 1.06, H: 2.16, auto: true });
    glassDoor({ name: 'Meeting room door', hx: 14, hz: 8.02, r0: -Math.PI / 2, swing: 1, W: 1.06, H: 2.16, auto: true });
    glassDoor({ name: 'Meeting room door', hx: -1.28, hz: 11.2, r0: 0, swing: -1, W: 1.06, H: 2.16, auto: true });
    // The huddle room: its doorway is in its front where the walkway from the aisle meets it.
    seeded(2307, () => {
      mrWall('z', -5.6, 11.2, 15, null, meetHuddle, 1); mrWall('x', 11.2, -5.6, -1.8, [-5.28, -4.22], meetHuddle, 1);
      glassDoor({ name: 'Meeting room door', hx: -5.26, hz: 11.2, r0: 0, swing: -1, W: 1.06, H: 2.16, auto: true });
    });
    const glassMesh = mergedBoxes(panes, glassM); glassMesh.castShadow = false;
    // Frost bands share one material; their UVs are stretched per wall so the dot pattern keeps its spacing.
    const frostM = new THREE.MeshStandardMaterial({ map: frostTex, transparent: true, roughness: 0.9, depthWrite: false });
    const frostMesh = new THREE.Mesh(mergeGeometries(frost.map(([w, h, d, x, y, z], i) => {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * frost[i].len / 0.32);
      return g.translate(x, y, z);
    })), frostM);
    world.add(glassMesh, frostMesh, mergedBoxes(frames, frameM));
    glassMesh.userData = frostMesh.userData = { action: 'blinds', glass: true, reach: 3.5,
      blindAt: (p) => p.x < -1.85 ? meetHuddle : p.x < 8 ? meetSmall : p.z < 7.5 ? meetSouth : meetNorth };
    // Solid partition between the two east rooms: a wall screen on one side, a whiteboard on the other.
    box(world, 6, ROOM.h, 0.12, '', 17, ROOM.h / 2, 7.5, { material: wallM });
    solid(17, 7.5, 6, 0.12);
    // And between the small room and the huddle room.
    box(world, 0.12, ROOM.h, 3.8, '', -1.8, ROOM.h / 2, 13.1, { material: wallM });
    solid(-1.8, 13.1, 0.12, 3.8);
  }
  const furnish = (r) => {
    box(world, r.len, 0.05, r.dep, '', r.tx, 0.74, r.tz, { material: deskTopM });
    for (const dx of [-1, 1]) box(world, 0.06, 0.72, r.dep - 0.2, '', r.tx + dx * (r.len / 2 - 0.25), 0.36, r.tz, { material: legM });
    solid(r.tx, r.tz, r.len, r.dep);
    for (const x of r.xs) { officeChair(x, r.tz - r.co, 0, '#3f4a5a'); officeChair(x, r.tz + r.co, Math.PI, '#3f4a5a'); }
    cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', r.xs[0] + 0.2, 0.815, r.tz - 0.25);
    box(world, 0.3, 0.012, 0.22, '#e8e4dc', r.xs[r.xs.length - 1] - 0.1, 0.771, r.tz + 0.2, { shadow: false });
    // A light bar over the table: glows by the lamps rule and has one (lamp-controlled) light.
    box(world, r.len * 0.6, 0.035, 0.09, '', r.tx, 2.6, r.tz, { material: barM, shadow: false });
    for (const dx of [-1, 1]) cyl(world, 0.004, 0.004, ROOM.h - 2.6, '#222', r.tx + dx * r.len * 0.25, (ROOM.h + 2.6) / 2, r.tz, { shadow: false });
    addLamp(r.tx, 2.4, r.tz, 8);
  };
  MR.slice(0, 3).forEach(furnish); seeded(2308, () => furnish(MR[3]));
  // Whiteboards with a marker sketch on them to start with.
  {
    // South east room: a whiteboard on its face of the partition, back to back with the north room's.
    const sb = makeScreen(world, 2.4, 1.2, 1024, 512, 17.2, 1.55, 7.4);
    sb.mesh.rotation.y = Math.PI;
    box(world, 2.48, 1.28, 0.03, '#b9bcc0', 17.2, 1.55, 7.425, { shadow: false });
    box(world, 1.2, 0.03, 0.07, '#b9bcc0', 17.2, 0.93, 7.38, { shadow: false });
    markerBoard('meet-south', 'meeting room whiteboard', sb, null);
    // North east room: whiteboard on the other face of the partition.
    const wb = makeScreen(world, 2.4, 1.2, 1024, 512, 17.2, 1.55, 7.6);
    box(world, 2.48, 1.28, 0.03, '#b9bcc0', 17.2, 1.55, 7.575, { shadow: false });
    box(world, 1.2, 0.03, 0.07, '#b9bcc0', 17.2, 0.93, 7.62, { shadow: false });
    markerBoard('meet-north', 'meeting room whiteboard', wb, (c) => {
      const node = (x, y, t, col) =>
        { c.strokeStyle = col; c.strokeRect(x - 105, y - 42, 210, 84); c.fillStyle = col; c.font = `600 34px "Marker Felt", "Comic Sans MS", ${FONT}`;
        c.textAlign = 'center'; c.fillText(t, x, y + 12); };
      const arrow = (x0, x1, y) =>
        { c.strokeStyle = '#333'; c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.lineTo(x1 - 16, y - 12); c.moveTo(x1, y); c.lineTo(x1 - 16, y + 12);
        c.stroke(); };
      node(170, 150, 'idea', '#1f6fd1'); node(512, 150, 'plan', '#2e8b57'); node(854, 150, 'ship ✦', '#c0392b');
      arrow(282, 400, 150); arrow(624, 742, 150);
      c.textAlign = 'left'; c.fillStyle = '#333'; c.font = `400 30px "Marker Felt", "Comic Sans MS", ${FONT}`;
      ['- write the test first', '- keep diffs small', '- ask before force-pushing'].forEach((t, i) => c.fillText(t, 90, 300 + i * 52));
      c.strokeStyle = '#c0392b'; c.beginPath(); c.ellipse(790, 400, 150, 70, -0.1, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#c0392b'; c.fillText('demo Fri!', 712, 410);
    });
    // North room: a rolling whiteboard by the east glass, facing the table; the huddle room's by its west glass.
    const rolling = (x, z, rotY, id, draw) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; world.add(g);
      g.add(mergedBoxes([[1.36, 0.92, 0.04, 0, 1.4, -0.01, '#b9bcc0'], [0.04, 1.85, 0.04, -0.66, 0.93, -0.03, '#8d9399'],
        [0.04, 1.85, 0.04, 0.66, 0.93, -0.03, '#8d9399'],
        [0.06, 0.04, 0.5, -0.66, 0.08, -0.03, '#5a5f66'], [0.06, 0.04, 0.5, 0.66, 0.08, -0.03, '#5a5f66'], [1.3, 0.03, 0.06, 0, 0.92, 0.03, '#b9bcc0']],
        mat('#ffffff', { vertexColors: true, roughness: 0.5, metalness: 0.3 })));
      markerBoard(id, 'meeting room whiteboard', makeScreen(g, 1.3, 0.86, 640, 424, 0, 1.4, 0.012), draw);
      solid(x, z, 0.5, 1.4);
    };
    rolling(2.95, 13.3, -Math.PI / 2, 'meet-small', (c) => {
      c.fillStyle = '#1f2a44'; c.font = `400 38px "Marker Felt", "Comic Sans MS", ${FONT}`;
      ['standup notes', '- review open PRs', '- fix flaky test'].forEach((t, i) => c.fillText(t, 40, 110 + i * 92));
      c.strokeStyle = '#c0392b'; c.beginPath(); c.moveTo(40, 128); c.lineTo(330, 128); c.stroke();
    });
    seeded(2309, () => rolling(-5.3, 13.3, Math.PI / 2, 'meet-huddle', (c) => {
      c.fillStyle = '#2e8b57'; c.font = `400 38px "Marker Felt", "Comic Sans MS", ${FONT}`;
      ['pair on it', '1. repro', '2. bisect', '3. fix + test'].forEach((t, i) => c.fillText(t, 40, 90 + i * 84));
      c.strokeStyle = '#1f6fd1'; c.beginPath(); c.arc(500, 250, 80, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#1f6fd1'; c.textAlign = 'center'; c.fillText('✓', 500, 264);
    }));
  }
  plant(19.3, 12, 1); plant(2.9, 14.5, 0.75);
  Object.assign(ctx, { MR });
}
