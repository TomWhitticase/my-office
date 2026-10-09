// Rosie, the receptionist: behind the front desk by the lifts, with her side of the counter (a work surface, her monitor,
// a desk phone, a nameplate for visitors and her chair) and the light panel on the lift core beside her. Click her to ask
// for something: POST /api/receptionist (a claude -p on the server, like John's) answers in character with a checked plan
// of office-admin actions. She acts the plan out: gets up, walks (A* over the office's colliders) to each blind group,
// door, TV or the light panel in turn, does it there through the same routes as the Admin app (PUT /api/office, PUT
// /api/tvs/:id, and POST /api/receptionist/tv to find something on a TV), then comes back and sits down. Requests queue;
// with the office not drawing (you're at your computer, or on another floor) she still gets it all done.

import * as THREE from 'three';
import { CAN_CHAT, escapeHtml } from '../../chat.js';
import { G, Person } from '../people.js';
import { box, colliders, cyl, dash, FONT, LIFT, makeScreen, mat, matCache, ROOM, rng } from '../util.js';

const NAME = 'Rosie';
const CHAIR = { x: 17.62, z: -2.3, rotY: -Math.PI / 2 };   // behind the counter (world/shell.js installReception), facing out
const PANEL = { x: LIFT.x - 0.012, y: 1.3, z: -1.33 };     // the light panel on the lift core, by the end of the counter
const BLIND_NAMES = { front: 'office front blinds', side: 'office side blinds', office: 'blinds in your office', north: 'north window blinds',
  west: 'west window blinds', east: 'east window blinds', meetSouth: 'south meeting room blinds', meetNorth: 'north meeting room blinds',
  meetSmall: 'small meeting room blinds' };
const BLIND_STATE = { raised: 0, open: 0.5, closed: 1 }, BLIND_SAID = { raised: 'raised', open: 'lowered, slats open', closed: 'closed' };
const DOOR_NAMES = { office: 'your office door', meetSouth: 'south meeting room door', meetNorth: 'north meeting room door', meetSmall: 'small meeting room door' };
const WALK = 1.5;   // brisker than the sessions' stroll

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { world, hud, keys, renderer, camera, toast, doors, door, blinds, tvs, player } = ctx;
  // three gives every object a uuid from Math.random: build with a seeded one of our own, so she doesn't shift the rest
  // (and leave the shared material cache as it was, or later parts would reuse hers instead of drawing their own).
  const random = Math.random, cached = new Set(matCache.keys());
  Math.random = rng(4848);
  let built;
  try { built = build(); } finally { Math.random = random; for (const k of [...matCache.keys()]) if (!cached.has(k)) matCache.delete(k); }
  const { p, scr, handset, panelScr } = built;

  function build() {
    const g = new THREE.Group(); world.add(g);
    const top = mat('#2a2724', { roughness: 0.35 }), wood = mat('#c49a6c', { roughness: 0.55 });
    // Her side of the counter: a work surface at desk height, end panels down to the floor.
    box(g, 0.42, 0.03, 1.86, '', 17.24, 0.735, -2.3, { material: top });
    for (const z of [-3.21, -1.39]) box(g, 0.42, 0.72, 0.03, '', 17.24, 0.36, z, { material: wood });
    // Her monitor, turned to her: the front desk's queue (paintScreen).
    const mg = new THREE.Group(); mg.position.set(17.1, 0.75, -2.62); mg.rotation.y = Math.PI / 2 - 0.25; g.add(mg);
    box(mg, 0.56, 0.35, 0.03, '#141518', 0, 0.36, -0.005, { mat: { roughness: 0.4 } });
    box(mg, 0.05, 0.18, 0.04, '#2a2c30', 0, 0.1, -0.03);
    box(mg, 0.22, 0.015, 0.15, '#2a2c30', 0, 0.008, -0.03);
    const scr = makeScreen(mg, 0.53, 0.32, 424, 256, 0, 0.36, 0.012);
    box(g, 0.15, 0.015, 0.42, '#1d1f23', 17.27, 0.758, -2.36);                 // keyboard
    box(g, 0.1, 0.012, 0.06, '#1d1f23', 17.3, 0.756, -2.02);                   // mouse
    // The desk phone: a base with a keypad, and its handset (which she lifts when it rings).
    const ph = new THREE.Group(); ph.position.set(17.13, 0.75, -1.72); ph.rotation.y = Math.PI / 2; g.add(ph);
    box(ph, 0.2, 0.05, 0.16, '#202226', 0, 0.025, 0);
    box(ph, 0.09, 0.004, 0.07, '', 0.03, 0.052, 0.02, { material: mat('#9fd0ff', { emissive: '#7fb8ff', emissiveIntensity: 0.5 }), shadow: false });
    const handset = new THREE.Group(); handset.position.set(-0.05, 0.065, 0); ph.add(handset);
    box(handset, 0.05, 0.035, 0.2, '#202226', 0, 0, 0);
    // A mug and a little stack of visitor badges.
    cyl(g, 0.04, 0.035, 0.1, '#f4f1ea', 17.3, 0.8, -2.85);
    box(g, 0.1, 0.03, 0.07, '#e8e3d6', 17.05, 0.765, -3.0);
    // The nameplate on the counter, facing visitors.
    const np = new THREE.Group(); np.position.set(16.32, 1.1, -1.9); np.rotation.y = -Math.PI / 2; g.add(np);
    box(np, 0.3, 0.07, 0.03, '#1b1c1f', 0, 0.035, -0.012, { mat: { roughness: 0.3, metalness: 0.3 } });
    const plate = makeScreen(np, 0.28, 0.06, 448, 96, 0, 0.036, 0.004);
    { const c = plate.ctx; c.fillStyle = '#1b1c1f'; c.fillRect(0, 0, 448, 96); c.fillStyle = '#e9d8b4'; c.textAlign = 'center';
      c.font = `600 44px ${FONT}`; c.fillText(NAME, 224, 50); c.font = `500 22px ${FONT}`; c.fillStyle = '#a49c8c'; c.fillText('RECEPTION', 224, 82); plate.tex.needsUpdate = true; }
    // Her chair (not one you can take: no seat).
    const ch = new THREE.Group(); ch.position.set(CHAIR.x + 0.06, 0, CHAIR.z); ch.rotation.y = CHAIR.rotY; g.add(ch);
    box(ch, 0.48, 0.08, 0.48, '#2b2e33', 0, 0.43, 0);
    box(ch, 0.46, 0.55, 0.06, '#2b2e33', 0, 0.78, -0.24);
    cyl(ch, 0.03, 0.03, 0.36, '#555', 0, 0.22, 0);
    cyl(ch, 0.26, 0.26, 0.04, '#333', 0, 0.04, 0, { seg: 5 });
    // The light panel: a brushed plate with a little screen (mode and brightness) and three rockers.
    const lp = new THREE.Group(); lp.position.set(PANEL.x, PANEL.y, PANEL.z); lp.rotation.y = -Math.PI / 2; world.add(lp);
    box(lp, 0.15, 0.24, 0.012, '#c9ccd0', 0, 0, 0, { mat: { roughness: 0.35, metalness: 0.6 } });
    const panelScr = makeScreen(lp, 0.11, 0.06, 176, 96, 0, 0.055, 0.007);
    for (const x of [-0.04, 0, 0.04]) box(lp, 0.028, 0.06, 0.01, '#f2f2ee', x, -0.05, 0.009, { mat: { roughness: 0.5 } });
    lp.traverse((o) => { if (o.isMesh) o.userData = { action: 'lightpanel', reach: 3 }; });
    return { p: makeRosie(), scr, handset, panelScr, lp };
  }

  // Her: smart navy blazer over a white blouse, auburn hair in a bun, round tortoiseshell glasses and a headset.
  function makeRosie() {
    const p = new Person('rosie-reception', '#24324f');
    const skin = mat('#e8b896', { roughness: 0.7 }), hair = mat('#7a3520', { roughness: 0.9 }), blazer = mat('#24324f', { roughness: 0.8 }),
      trousers = mat('#26272c', { roughness: 0.85 }), white = mat('#f3f1ec', { roughness: 0.8 }), shell = mat('#6b3b1e', { roughness: 0.4 }),
      dark = mat('#1b1c1f', { roughness: 0.5 });
    p.root.remove(p.label);
    const skinGeo = [G.head, G.neck, G.hand], hairGeo = [G.hairCap, G.hairLong, G.bun], legGeo = [G.thigh, G.shin, G.hips];
    for (const o of [...p.head.children]) if (hairGeo.includes(o.geometry)) p.head.remove(o);
    p.root.traverse((o) => {
      if (!o.isMesh) return;
      if (skinGeo.includes(o.geometry)) o.material = skin;
      else if (legGeo.includes(o.geometry)) o.material = trousers;
      else if (o.geometry === G.foreArm || o.geometry === G.upperArm || o.geometry === G.torso) o.material = blazer;
    });
    const add = (geo, m, x, y, z, parent = p.head) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    add(G.hairCap, hair, 0, 0.014, -0.004).rotation.x = -0.22;
    add(G.bun, hair, 0, 0.05, -0.125).scale.set(1.1, 1, 1);
    for (const s of [-1, 1]) {
      add(new THREE.TorusGeometry(0.028, 0.005, 6, 18), shell, s * 0.042, 0.016, 0.112);
      add(new THREE.BoxGeometry(0.004, 0.004, 0.11), shell, s * 0.07, 0.02, 0.06);
    }
    add(new THREE.BoxGeometry(0.03, 0.004, 0.004), shell, 0, 0.02, 0.114);
    // Headset: a band over the top, an ear cup on her left, the mic on a boom to her mouth.
    add(new THREE.TorusGeometry(0.127, 0.007, 6, 24, Math.PI), dark, 0, 0.01, 0);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 14), dark, 0.122, -0.01, 0).rotation.z = Math.PI / 2;
    const boom = add(new THREE.BoxGeometry(0.006, 0.006, 0.12), dark, 0.1, -0.05, 0.06); boom.rotation.set(0.3, -0.45, 0);
    add(new THREE.SphereGeometry(0.012, 8, 6), dark, 0.07, -0.07, 0.11);
    // The blouse at her collar, and a lapel each side.
    add(new THREE.BoxGeometry(0.13, 0.16, 0.02), white, 0, 0.45, 0.115, p.upper).rotation.x = -0.12;
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.2, 0.02), blazer, s * 0.075, 0.42, 0.122, p.upper).rotation.z = s * 0.35;
    // The desk phone's handset, for when she takes a call.
    const held = new THREE.Group(); held.visible = false; held.position.set(0, -0.04, 0.03); held.rotation.set(0.2, 0, 0); p.arms[0].hand.add(held);
    box(held, 0.035, 0.2, 0.05, '#202226', 0, 0.02, 0);
    p.held = held;
    p.phone.children[1].material = mat('#2a2c30');   // her phone is a TV remote while she's out (no glowing screen)
    p.root.traverse((o) => { o.userData = { action: 'rosie', reach: 4 }; });
    p.place({ pos: CHAIR, rotY: CHAIR.rotY });
    world.add(p.root);
    return p;
  }

  // ----- what she's doing -----
  // state: desk (sitting; mood type / phone / look), walk (to a stop, or back to her chair), act (doing the stop's job).
  const R = { state: 'desk', mood: 'type', stop: null, actT: 0, queue: [], job: null, chat: null, doing: 'typing away', lastFrame: 0, held: new Map(),
    p, findPath, grid: null };
  const deskMood = (t) => { const c = (t + 3) % 50; return c < 17 ? 'type' : c < 25 ? 'phone' : c < 40 ? 'type' : 'look'; };
  const base = p.targets.bind(p);
  p.targets = (t) => {
    const s = R.state, m = R.mood;
    p.spot = s === 'desk' ? { pose: 'type', rotY: CHAIR.rotY } : { pose: 'stand', rotY: R.stop?.rotY ?? p.rotY };
    const j = base(t);
    p.held.visible = s === 'desk' && m === 'phone'; handset.visible = !p.held.visible;
    if (s === 'desk' && m === 'phone') Object.assign(j, { sh0: -0.7, shz0: -0.25, shy0: 0.3, el0: -2.45, headX: 0.05, headY: -0.25 + 0.1 * Math.sin(t * 0.7) });
    if (s === 'desk' && m === 'look') Object.assign(j, { el0: -0.6, el1: -0.6, lean: -0.05 });
    if (s !== 'act' || p.path.length) return j;
    const k = R.stop.pose, w = Math.sin(t * 5);
    if (k === 'pull') Object.assign(j, { sh0: -2.45 + 0.3 * w, el0: -0.25, shz0: 0.05, sh1: -0.3, el1: -0.4, headX: -0.35 });
    else if (k === 'press') Object.assign(j, { sh0: -1.4, el0: -0.2, shz0: 0.08, headX: 0.05 });
    else if (k === 'door') Object.assign(j, { sh0: -1.1, el0: -0.45, shz0: 0.12, headX: 0.1 });
    else if (k === 'remote') { p.phone.visible = true; Object.assign(j, { sh0: -1.55, el0: -0.1, shz0: 0.05, sh1: -0.2, el1: -0.5, headX: -0.18 }); }
    return j;
  };

  // ----- getting about: A* over the office's colliders -----
  // A grid of 0.2 m cells (cells within her radius of anything solid are blocked; the glass doors aren't, she holds them),
  // the cheapest 8-way path, then pulled tight to the corners it can't see past.
  const GRID = { x0: ROOM.minX, z0: ROOM.minZ, s: 0.2, nx: Math.round((ROOM.maxX - ROOM.minX) / 0.2), nz: Math.round((ROOM.maxZ - ROOM.minZ) / 0.2), r: 0.24 };
  function grid() {
    if (R.grid) return R.grid;
    const { x0, z0, s, nx, nz, r } = GRID, b = new Uint8Array(nx * nz), skip = new Set(doors.map((d) => d.box));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = x0 + (i + 0.5) * s, z = z0 + (k + 0.5) * s;
      if (x < ROOM.minX + r || x > ROOM.maxX - r || z < ROOM.minZ + r || z > ROOM.maxZ - r) b[k * nx + i] = 1;
    }
    for (const c of colliders) {
      if (skip.has(c)) continue;
      const i0 = Math.max(0, Math.floor((c.minX - r - x0) / s)), i1 = Math.min(nx - 1, Math.floor((c.maxX + r - x0) / s));
      const k0 = Math.max(0, Math.floor((c.minZ - r - z0) / s)), k1 = Math.min(nz - 1, Math.floor((c.maxZ + r - z0) / s));
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
        const x = x0 + (i + 0.5) * s, z = z0 + (k + 0.5) * s;
        if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) b[k * nx + i] = 1;
      }
    }
    return R.grid = b;
  }
  const cellOf = (q) => {
    const i = Math.min(GRID.nx - 1, Math.max(0, Math.floor((q.x - GRID.x0) / GRID.s))), k = Math.min(GRID.nz - 1, Math.max(0, Math.floor((q.z - GRID.z0) / GRID.s)));
    return k * GRID.nx + i;
  };
  const centre = (c) => ({ x: GRID.x0 + ((c % GRID.nx) + 0.5) * GRID.s, z: GRID.z0 + (Math.floor(c / GRID.nx) + 0.5) * GRID.s });
  function nearestFree(c) {   // the closest open cell (breadth first), for a spot just inside something
    const b = grid(), seen = new Set([c]), q = [c];
    for (let n = 0; n < q.length && n < 4000; n++) {
      const x = q[n];
      if (!b[x]) return x;
      const i = x % GRID.nx;
      for (const y of [i > 0 ? x - 1 : -1, i < GRID.nx - 1 ? x + 1 : -1, x - GRID.nx, x + GRID.nx]) if (y >= 0 && y < b.length && !seen.has(y)) { seen.add(y); q.push(y); }
    }
    return -1;
  }
  function clear(a, c) {   // nothing blocked on the straight line between two points
    const b = grid(), n = Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / 0.08);
    for (let i = 1; i < n; i++) if (b[cellOf({ x: a.x + (c.x - a.x) * i / n, z: a.z + (c.z - a.z) * i / n })]) return false;
    return true;
  }
  // The cheapest walk from `a` over the grid (A* toward `z`, or with z -1 a flood of the whole floor): { g: cost per
  // cell in cells walked, came: the step before each }.
  const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  function search(a, z) {
    const b = grid(), nx = GRID.nx, g = new Float32Array(b.length).fill(Infinity), came = new Int32Array(b.length).fill(-1), done = new Uint8Array(b.length);
    const heap = [], push = (c, f) => { heap.push([f, c]); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top[1]; };
    const zi = z % nx, zk = Math.floor(z / nx), h = (c) => { if (z < 0) return 0; const dx = Math.abs(c % nx - zi), dz = Math.abs(Math.floor(c / nx) - zk); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    g[a] = 0; push(a, h(a));
    while (heap.length) {
      const c = pop();
      if (c === z) break;
      if (done[c]) continue;
      done[c] = 1;
      const i = c % nx;
      for (const [di, dk, w] of STEPS) {
        if (i + di < 0 || i + di >= nx) continue;
        const y = c + di + dk * nx;
        if (y < 0 || y >= b.length || b[y] || (di && dk && (b[c + di] || b[c + dk * nx]))) continue;
        if (g[c] + w < g[y]) { g[y] = g[c] + w; came[y] = c; push(y, g[y] + h(y)); }
      }
    }
    return { g, came };
  }
  // How far she'd walk from `from` to anywhere (metres), for putting stops in order.
  function walkFrom(from) {
    const a = nearestFree(cellOf(from)), g = a < 0 ? null : search(a, -1).g;
    return (q) => { const c = nearestFree(cellOf(q)); return g && c >= 0 ? g[c] * GRID.s : Infinity; };
  }
  function findPath(from, to) {
    const b = grid(), a = nearestFree(cellOf(from)), z = nearestFree(cellOf(to));
    if (a < 0 || z < 0) return null;
    const { came } = search(a, z);
    if (a !== z && came[z] < 0) return null;
    const cells = [z];
    while (cells[0] !== a) cells.unshift(came[cells[0]]);
    const pts = cells.map(centre);
    if (!b[cellOf(to)]) pts[pts.length - 1] = { x: to.x, z: to.z };
    const out = [];
    for (let i = 0, at = from; i < pts.length;) {   // pull the path tight: the farthest point still in sight each time
      let j = pts.length - 1;
      while (j > i && !clear(at, pts[j])) j--;
      out.push(pts[j]); at = pts[j]; i = j + 1;
    }
    return out;
  }

  // ----- where each job is done -----
  const v3 = new THREE.Vector3(), n3 = new THREE.Vector3();
  const meetDoor = { meetSouth: [14, 3], meetNorth: [14, 8], meetSmall: [-1.3, 11.2] };
  const doorOf = (id) => id === 'office' ? door
    : doors.filter((d) => d.name === 'Meeting room door').sort((a, b) => Math.hypot(a.hx - meetDoor[id][0], a.hz - meetDoor[id][1]) - Math.hypot(b.hx - meetDoor[id][0], b.hz - meetDoor[id][1]))[0];
  const facing = (s, at) => ({ ...s, rotY: Math.atan2(at.x - s.x, at.z - s.z) });
  function blindStop(key, from, dist) {   // in front of the nearest part of that group's panes, on the side the blind hangs
    let best = null;
    for (const r of blinds[key].runs) {
      const g = r.slats.parent;
      g.updateWorldMatrix(true, false);
      const lx = g.worldToLocal(v3.set(from.x, 0, from.z)).x;
      for (const [x, w] of r.cells) {
        const u = Math.min(x + w / 2 - 0.4, Math.max(x - w / 2 + 0.4, lx)), at = g.localToWorld(v3.set(u, 0, r.slats.position.z)).clone();
        const s = g.localToWorld(n3.set(u, 0, r.slats.position.z + 0.7)), d = dist(s);
        if (!best || d < best.d) best = { ...facing({ x: s.x, z: s.z }, at), d };
      }
    }
    return best;
  }
  function doorStop(d) {   // on the side it doesn't swing into, facing the middle of the leaf
    const mid = { x: d.hx + Math.cos(d.r0) * d.W / 2, z: d.hz - Math.sin(d.r0) * d.W / 2 }, a = d.r0 + d.swing * Math.PI / 2;
    return facing({ x: mid.x - Math.cos(a) * 0.75, z: mid.z + Math.sin(a) * 0.75 }, mid);
  }
  function tvStop(t) { return facing({ x: t.center.x + t.normal.x * 2.2, z: t.center.z + t.normal.z * 2.2 }, t.center); }
  const panelStop = () => facing({ x: PANEL.x - 0.55, z: PANEL.z }, PANEL);
  const boardStop = () => { const b = ctx.taskBoard.mesh.position; return facing({ x: b.x, z: b.z + 0.95 }, b); };   // in front of the guitars

  // A plan's actions as stops, in order (a group of blinds or doors nearest first); sounds need no walking.
  function stopsFor(actions) {
    const out = [];
    let at = { x: p.root.position.x, z: p.root.position.z };
    // A group (all the blinds, all the doors) nearest first, by how far she'd actually walk.
    const near = (list) => { const res = []; list = [...list]; while (list.length) { const dist = walkFrom(at); list.sort((a, b) => a.d(at, dist) - b.d(at, dist)); const s = list.shift().make(at, dist); res.push(s); at = s; } return res; };
    for (const a of actions) {
      if (a.do === 'setLights') { const s = { ...panelStop(), pose: 'press', place: 'the light panel', a }; out.push(s); at = s; }
      else if (a.do === 'setBlinds') {
        const v = BLIND_STATE[a.state], keys = (a.group === 'all' ? Object.keys(BLIND_NAMES) : [a.group]).filter((k) => blinds[k] && dash.office.blinds?.[k] !== v);
        out.push(...near(keys.map((k) => ({ d: (q, dist) => blindStop(k, q, dist).d, make: (q, dist) => ({ ...blindStop(k, q, dist), pose: 'pull', place: `the ${BLIND_NAMES[k]}`, a, key: k, v }) }))));
      } else if (a.do === 'setDoor') {
        const ids = (a.id === 'all' ? Object.keys(DOOR_NAMES) : [a.id]).filter((id) => doorOf(id) && (doorOf(id).to === 1) !== a.open);
        out.push(...near(ids.map((id) => ({ d: (q, dist) => dist(doorStop(doorOf(id))),
          make: () => ({ ...doorStop(doorOf(id)), pose: 'door', place: DOOR_NAMES[id], a, id }) }))));
      } else if (a.do === 'setSounds') out.push({ a, here: true });
      else if (a.do === 'tv') { const t = tvs.find((x) => x.id === a.id); if (t) { const s = { ...tvStop(t), pose: 'remote', place: `the ${t.name} TV`, a, tv: t }; out.push(s); at = s; } }
      else if (a.do === 'addCard' && ctx.taskBoard) { const s = { ...boardStop(), pose: 'press', place: 'your task board', a }; out.push(s); at = s; }
    }
    return out;
  }

  // ----- doing it (through the Admin app's own routes) -----
  const putTv = (id, patch) => dash.tvs[id] ? dash.patchTv(id, patch)
    : fetch('/api/tvs/' + id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {});
  async function apply(s) {
    const a = s.a;
    if (a.do === 'setLights') {
      const patch = {}; if (a.mode) patch.lights = a.mode; if (a.brightness !== undefined) patch.brightness = a.brightness;
      dash.putOffice(patch);
      return `Lights ${a.mode ? `${a.mode === 'auto' ? 'on auto' : a.mode}` : ''}${a.mode && a.brightness !== undefined ? ', ' : ''}${a.brightness !== undefined ? `at ${Math.round(a.brightness * 100)}%` : ''}`;
    }
    if (a.do === 'setBlinds') { dash.putOffice({ blinds: { [s.key]: s.v } }); return `${cap(BLIND_NAMES[s.key])}: ${BLIND_SAID[a.state]}`; }
    if (a.do === 'setDoor') {
      const d = doorOf(s.id); R.held.delete(d); d.to = a.open ? 1 : 0;
      if (d === door) dash.putOffice({ door: d.to });
      return `${cap(DOOR_NAMES[s.id])} ${a.open ? 'open' : 'shut'}`;
    }
    if (a.do === 'setSounds') {
      const patch = {}; if (a.on !== undefined) patch.on = a.on; if (a.volume !== undefined) patch.volume = a.volume;
      dash.setSound(patch);
      return ['Office sounds', a.on === false ? 'off' : a.on ? 'on' : '', a.volume !== undefined ? `at ${a.volume}%` : ''].filter(Boolean).join(' ');
    }
    if (a.do === 'tv') {
      const name = `${s.tv.name} TV`, extras = () => { const x = {}; for (const k of ['volume', 'muted', 'adblock']) if (a[k] !== undefined) x[k] = a[k]; return x; };
      if (a.power === false) { await dash.saveTv(a.id, '', 0); return `${name} switched off`; }
      let said = name;
      if (a.search) {
        progress(`Looking up “${a.search}” on the ${name}…`);
        const r = await fetch('/api/receptionist/tv', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: a.id, search: a.search, kind: a.kind }) })
          .then((x) => x.json()).catch((e) => ({ error: e.message }));
        if (r.error) return `Couldn’t find anything for “${a.search}” (${r.error})`;
        said = `Found “${r.title}”${r.live ? ' (live)' : r.playlist ? ' (playlist)' : ''} on the ${name}`;
      } else if (a.url) {
        const res = await dash.saveTv(a.id, a.url, a.refresh ?? dash.tvs[a.id]?.refresh ?? 0);
        if (res?.error) return `The ${name} wouldn’t take that link (${res.error})`;
        said = `${name} on ${hostOf(a.url)}`;
      }
      const x = extras();
      if (a.refresh !== undefined && !a.url) x.refresh = a.refresh;
      if (Object.keys(x).length) { await new Promise((r) => setTimeout(r, 300)); putTv(a.id, x); }
      if (a.volume !== undefined) said += `, volume ${a.volume}%`;
      if (a.muted !== undefined) said += a.muted ? ', muted' : ', unmuted';
      if (a.adblock !== undefined) said += `, ad blocking ${a.adblock ? 'on' : 'off'}`;
      if (a.refresh !== undefined) said += a.refresh ? `, reloading every ${a.refresh} s` : ', no auto-reload';
      return said;
    }
    if (a.do === 'addCard') {
      const r = ctx.taskBoard.addCard({ title: a.title, body: a.details || '', prio: a.prio || 0, kind: a.sticky ? 'sticky' : 'index', color: a.sticky ? 'yellow' : 'white' }, a.column);
      return r ? `“${a.title}” pinned up in ${r.col.name}` : 'Couldn’t get at your board just now';
    }
    return '';
  }
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };

  // ----- the job runner -----
  // One plan at a time: walk to each stop, act (the change lands part way through), next; then back to the chair.
  function next() {
    const job = R.job;
    if (!job) {
      R.job = R.queue.shift() || null;
      if (!R.job) return goHome();
      R.job.stops = stopsFor(R.job.actions);
      if (!R.job.stops.length) say('Nothing needed changing: it’s all as you asked already.', true);
      return next();
    }
    const s = job.stops.shift();
    if (!s) { R.job = null; return next(); }
    if (s.here) { apply(s).then((m) => { progress(`✓ ${m}`); next(); }); return; }
    walkTo(s, () => { R.state = 'act'; R.actT = 0; R.stop = s; R.doing = doingAt(s); s.result = null; s.done = false; });
    progress(`Heading to ${s.place}…`);
  }
  function walkTo(s, arrive) {
    const path = findPath({ x: p.root.position.x, z: p.root.position.z }, s) || [{ x: s.x, z: s.z }];
    R.state = 'walk'; R.stop = s; R.doing = s.home ? 'heading back to her desk' : `heading to ${s.place}`;
    p.path = path; p.onArrive = () => { p.onArrive = null; arrive(); };
  }
  function goHome() {
    if (R.state === 'desk' || R.stop?.home) return;
    walkTo({ x: CHAIR.x, z: CHAIR.z, rotY: CHAIR.rotY, home: true }, () => {
      R.state = 'desk'; R.stop = null; R.doing = 'typing away';
      say('Done!', false);
      if (!R.chat.open) toast(`<b>${NAME}</b>: all done!`);
    });
  }
  const doingAt = (s) => s.a?.do === 'addCard' ? 'pinning a card on your board' : ({ pull: `doing the ${BLIND_NAMES[s.key]}`, press: 'at the light panel', door: `at ${DOOR_NAMES[s.id]}`, remote: `working the ${s.tv?.name} TV` })[s.pose] || 'busy';
  function actTick(dt) {   // at a stop: the change goes in after a moment, and she moves on once it's done
    const s = R.stop;
    R.actT += dt;
    if (R.actT > 0.7 && !s.started) {
      s.started = true;
      apply(s).then((m) => { s.result = m; s.done = true; }, (e) => { s.result = `Something went wrong: ${e.message}`; s.done = true; });
    }
    if (s.done && R.actT > 1.6) { progress(`✓ ${s.result}`); R.state = 'walk'; R.stop = null; next(); }
  }

  // She holds the glass doors she walks through (her own, not the office's setting), and lets them go behind her.
  function holdDoors() {
    const q = p.root.position;
    for (const d of doors) {
      if (d.name !== 'Office door' && d.name !== 'Meeting room door') continue;
      const mx = d.hx + Math.cos(d.r0) * d.W / 2, mz = d.hz - Math.sin(d.r0) * d.W / 2, dist = Math.hypot(q.x - mx, q.z - mz);
      if (dist < 1.5 && d.to === 0 && R.state === 'walk' && !R.held.has(d)) { R.held.set(d, 0); d.to = 1; }
      else if (dist > 1.9 && R.held.has(d)) { R.held.delete(d); d.to = d === door ? dash.office.door : 0; }
    }
  }

  function tick(dt, t) {
    if (R.state === 'desk') {
      const near = !ctx.away && Math.hypot(player.x - CHAIR.x, player.z - CHAIR.z) < 4.5 && player.x < CHAIR.x;
      R.mood = R.chat.open || R.chat.busy ? 'look' : near && deskMood(t) !== 'phone' ? 'look' : deskMood(t);
      if (R.chat.busy) R.mood = 'type';
      R.doing = { type: 'typing away', phone: 'on the phone', look: 'at the front desk' }[R.mood];
      p.lookAt = R.mood === 'look' && (near || R.chat.open) ? camera.position : null;
    } else p.lookAt = null;
    if (R.state === 'act' && !p.path.length) actTick(dt);
    p.update(t, R.state === 'walk' || p.path.length ? dt * WALK : dt);
    if (R.state === 'walk' && !p.path.length && p.onArrive) p.onArrive();
    if (R.held.size || R.state === 'walk') holdDoors();
  }
  ctx.onFrame((dt, t) => { R.lastFrame = performance.now(); R.t = t; tick(dt, t); }, 15);
  // With nothing drawing the office (you're at your computer and no camera feed is open), she carries on regardless.
  setInterval(() => {
    if ((R.job || R.state !== 'desk') && performance.now() - R.lastFrame > 700) { R.t = (R.t || 0) + 0.25; tick(0.05, R.t); tick(0.05, R.t); tick(0.05, R.t); tick(0.05, R.t); tick(0.05, R.t); }
  }, 250);

  // ----- her screen and the light panel -----
  function paintScreen() {
    const { ctx: c, W, H } = scr;
    c.fillStyle = '#f4f2ed'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#24324f'; c.fillRect(0, 0, W, 40);
    c.fillStyle = '#fff'; c.font = `600 19px ${FONT}`; c.fillText('Front desk · requests', 14, 27);
    const lines = (R.chat?.msgs || []).filter((m) => m.role === 'note').slice(-7);
    c.font = `500 16px ${FONT}`;
    if (!lines.length) { c.fillStyle = '#7d786e'; c.fillText('All quiet. Ask me for anything!', 14, 80); }
    lines.forEach((m, i) => { c.fillStyle = m.text.startsWith('✓') ? '#2e7d4f' : '#3a3833'; c.fillText(m.text.slice(0, 44), 14, 72 + i * 26); });
    scr.tex.needsUpdate = true;
  }
  let panelKey = '';
  function paintPanel() {
    const o = dash.office, key = `${o.lights}|${o.brightness}`;
    if (key === panelKey) return;
    panelKey = key;
    const { ctx: c, W, H } = panelScr;
    c.fillStyle = '#10161c'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#8fd3ff'; c.font = `600 24px ${FONT}`; c.textAlign = 'center';
    c.fillText(o.lights === 'auto' ? 'AUTO' : o.lights === 'on' ? 'ON' : 'OFF', W / 2, 36);
    c.fillStyle = 'rgba(143,211,255,.25)'; c.fillRect(20, 60, W - 40, 14);
    c.fillStyle = '#8fd3ff'; c.fillRect(20, 60, (W - 40) * Math.min(1, o.brightness / 2), 14);
    c.textAlign = 'left';
    panelScr.tex.needsUpdate = true;
  }
  paintPanel();
  dash.officeListeners.add(paintPanel);

  // ----- talking to her -----
  // John's panel and bar, cloned again: her answers come from POST /api/receptionist and live only here, with her
  // progress on whatever she's doing in between.
  const chatEl = hud.querySelector('.of-chat'), chatBar = hud.querySelector('.of-chatbar');
  const el = /** @type {HTMLElement} */ (chatEl.cloneNode(true)), bar = /** @type {HTMLElement} */ (chatBar.cloneNode(true));
  el.classList.add('of-rosie'); bar.classList.add('of-rosie'); hud.append(el, bar);
  el.querySelector('[data-act=details]')?.remove();
  /** @type {HTMLElement} */ (el.querySelector('i')).style.background = '#24324f';
  el.querySelector('b').textContent = NAME;
  el.querySelector('small').textContent = 'Reception · Floor 48, by the lifts';
  const log = el.querySelector('.of-chatlog'), input = bar.querySelector('textarea'), st = bar.querySelector('.st'), sendBtn = bar.querySelector('button');
  input.maxLength = 600; input.placeholder = `Ask ${NAME} to do something (“open all the blinds”, “put some music on”)`;
  const chat = R.chat = { open: false, busy: false, note: null,
    msgs: [{ role: 'rosie', text: 'Hi! I’m Rosie. Lights, blinds, doors, the TVs: just say the word and I’ll sort it.' }] };
  function render() {
    log.innerHTML = chat.msgs.map((m) => m.role === 'user' ? `<div class="u">${escapeHtml(m.text)}</div>`
      : `<div class="${m.role === 'note' || m.lunch || m.error ? 'n' : 'a'}">${escapeHtml(m.text)}</div>`).join('')
      + (chat.busy ? `<div class="n typing">${NAME} is typing</div>` : '');
    log.scrollTop = log.scrollHeight;
    st.className = 'st' + (chat.note ? ' bad' : '');
    st.innerHTML = chat.note ? escapeHtml(chat.note) : `Office admin only: lights, blinds, doors, sounds, TVs, cards on your board · <kbd>Enter</kbd> send · <kbd>Esc</kbd> back`;
    input.disabled = sendBtn.disabled = chat.busy;
    paintScreen();
  }
  function say(text, note) { chat.msgs.push({ role: note ? 'note' : 'rosie', text }); render(); }
  function progress(text) { say(text, true); }
  async function ask() {
    const text = input.value.trim();
    if (!text || chat.busy) return;
    const history = chat.msgs.filter((m) => (m.role === 'user' || m.role === 'rosie') && !m.lunch && !m.error).slice(-10).map(({ role, text }) => ({ role, text }));
    chat.msgs.push({ role: 'user', text }); input.value = ''; input.style.height = '';
    chat.busy = true; chat.note = null; render();
    const local = { sound: dash.sound, doors: Object.fromEntries(['meetSouth', 'meetNorth', 'meetSmall'].map((id) => [id, doorOf(id)?.to === 1])) };
    const r = await fetch('/api/receptionist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, history, local }) })
      .then((x) => x.json()).catch((e) => ({ error: e.message }));
    chat.busy = false;
    if (r.say) {
      chat.msgs.push({ role: 'rosie', text: r.say, lunch: r.lunch, error: r.error });
      if (r.rejected?.length) chat.msgs.push({ role: 'note', text: `(Left out: ${r.rejected.join('; ')})` });
      if (r.actions?.length) { R.queue.push({ actions: r.actions }); if (!R.job) next(); }
    } else { chat.note = `${NAME} didn’t catch that: ${r.error || 'no answer'}`; chat.msgs.pop(); input.value = text; }
    render();
    if (chat.open) input.focus();
  }
  function open() {
    if (!CAN_CHAT) { toast(`${NAME} only takes requests from people on this computer`); return; }
    if (ctx.mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    ctx.mode = 'chat'; keys.clear(); chat.open = true;
    hud.classList.add('of-rosieing');
    render();
    setTimeout(() => input.focus());
  }
  function close(relock) {
    chat.open = false;
    hud.classList.remove('of-rosieing');
    input.blur();
    if (ctx.mode === 'chat') ctx.mode = 'free';
    if (relock) renderer.domElement.requestPointerLock();
  }
  el.addEventListener('click', (e) => { if (/** @type {HTMLElement} */ (e.target).closest('button')?.dataset.act === 'close') close(); });
  bar.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); ask(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(); } });
  input.addEventListener('input', () => { input.style.height = ''; input.style.height = Math.min(input.scrollHeight + 2, innerHeight * 0.3) + 'px'; });
  document.addEventListener('keydown', (e) => {
    if (!chat.open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    const t = /** @type {HTMLElement} */ (e.target);
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !t.closest?.('input, select, textarea') && !input.disabled) input.focus();
  }, true);
  const closeOthers = ctx.closeChat;   // leaving the office (or anything else that closes the chat) closes hers too
  ctx.closeChat = (relock) => { if (chat.open) close(relock); else closeOthers(relock); };
  render();

  ctx.action('rosie', { hover: () => `<b>${NAME}</b><div class="m">Reception · ${R.doing}</div><div class="k">${CAN_CHAT ? 'Click to ask her for something' : 'She only takes requests from people on this computer'}</div>`,
    click: () => open() });
  ctx.action('lightpanel', { hover: () => `<b>Lights</b><div class="m">${{ auto: 'Auto (follows daylight)', on: 'On', off: 'Off' }[dash.office.lights]} · ${Math.round(dash.office.brightness * 100)}%</div><div class="k">Click to switch: auto, on, off</div>`,
    click: () => dash.putOffice({ lights: { auto: 'on', on: 'off', off: 'auto' }[dash.office.lights] || 'auto' }) });
  ctx.hoverTargets(() => [p.root, built.lp], 45);
  ctx.minimap((c, sx, sz) => {
    const q = p.root.position;
    c.fillStyle = '#24324f'; c.strokeStyle = '#e9d8b4'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(sx(q.x), sz(q.z), 7, 0, Math.PI * 2); c.fill(); c.stroke();
  }, 35);
  Object.assign(ctx, { rosie: R, openRosie: open, rosieChat: chat });
}
