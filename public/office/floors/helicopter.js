// THE HELICOPTER: a little two-seat light helicopter (R44-sized: a 9 m two-blade rotor) parked on the roof's helipad.
// Click it to climb into the pilot's seat; the rotor spools up and you fly it round the city with arcade controls (W/S
// pitch, A/D yaw, Space/Shift or E/Q up and down, the mouse to look round the cockpit), land on the pad (it settles onto the
// H) or on any roof or street, and F to get out wherever you've landed (not in the river). R flies you home on its own.
// It's in the office's scene beside the roof terrace (shown with it), in world coordinates; you stay on the roof floor
// while you fly, and while you walk about wherever you got out (S.out), so the office below carries on and the TVs stay paused.

import * as THREE from 'three';
import { angDiff, clamp, damp, EYE, FONT, lerp, LIFT, makeCanvas, makeScreen, mat, rng, sstep } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three gives every object a uuid from Math.random: build with a seeded one of our own, so adding the helicopter doesn't
  // shift the draws everything after it makes (where people wander, the server hall's LEDs) in a seeded run (the harness).
  const random = Math.random;
  Math.random = rng(4747);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { world, roof, EDGE, HELI, CORE, city, lamps, hitBox, hud, renderer, camera, sun, sunDir, toast, mapCtx } = ctx;
  const ROOF_Y = roof.y, DECK = ROOF_Y + 0.04, STREET = city.GROUND + 0.1, CEILING = 650, EDGE_R = 900;
  // Parked over the H, nose east, the tail out over the west side of the pad.
  const PARK = { x: HELI.x + 1.5, z: HELI.z, yaw: -Math.PI / 2 };
  const PIVOT = 1.3;   // the body pitches and rolls about here (its centre of mass), above the skids

  // ----- the aircraft -----
  // Built in `body`, skids at y 0, the mast at the origin, nose toward -z; `g` sits on the pivot and carries the attitude.
  const g = new THREE.Group(), body = new THREE.Group();
  g.rotation.order = 'YXZ'; g.visible = false; body.position.y = -PIVOT; g.add(body); world.add(g);
  // Livery: Claude-orange lower body with a cream cheat line and a dark belly; cream roof and cowlings; the boom orange.
  const liv = makeCanvas(512, 256), lc = liv.ctx;
  lc.fillStyle = '#d97757'; lc.fillRect(0, 0, 512, 256);
  lc.fillStyle = '#f2efe8'; lc.fillRect(0, 22, 512, 16);
  lc.fillStyle = '#2b2d30'; lc.fillRect(0, 196, 512, 60);
  lc.fillStyle = '#b85f42'; lc.fillRect(0, 190, 512, 6);
  liv.tex.needsUpdate = true;
  const paint = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.38, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, ...o });
  const orangeM = paint({ map: liv.tex }), boomM = paint({ color: '#d97757' }), creamM = paint({ color: '#f2efe8' });
  const darkM = mat('#2b2d30', { roughness: 0.55 }), metalM = mat('#c9cdd2', { metalness: 0.85, roughness: 0.3 }), trimM = mat('#3a3c40', { roughness: 0.8 });
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#cfe3ec', transparent: true, opacity: 0.2, roughness: 0.03, metalness: 0, side: THREE.DoubleSide,
    depthWrite: false, envMapIntensity: 1.6 });
  const mesh = (geo, m, parent = body, shadow = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o; };

  // The cabin: an ellipsoid bubble. Glass over the front and top, down to the belt line; painted below it and behind the doors.
  const C = { x: 0, y: 1.35, z: -0.2, a: 0.7, b: 0.78, c: 1.25 }, BELT = 0.64 * Math.PI, DOOR = 0.5;
  const shell = (phi0, phiL, th0, thL, m, s = 1) => {
    const geo = new THREE.SphereGeometry(1, 48, 24, phi0, phiL, th0, thL);
    geo.scale(C.a * s, C.b * s, C.c * s); geo.translate(C.x, C.y, C.z);
    return mesh(geo, m);
  };
  shell(0, Math.PI * 2, BELT, Math.PI - BELT, orangeM);                              // lower body
  shell(DOOR, Math.PI - 2 * DOOR, 0, BELT, creamM);                                 // roof and rear wall, behind the doors
  shell(0, Math.PI * 2, BELT, Math.PI - BELT, mat('#4a4c50', { roughness: 0.9, side: THREE.BackSide }), 0.985);   // the inside of the tub
  shell(DOOR, Math.PI - 2 * DOOR, 0, BELT, mat('#d8d4cc', { roughness: 0.9, side: THREE.BackSide }), 0.985);       // the headliner
  const canopy = shell(Math.PI - DOOR, Math.PI + 2 * DOOR, 0, BELT, glassM, 1.004);
  canopy.castShadow = false;
  // The canopy frame: the centre bow, the windscreen posts, the door frames and the belt line, as tubes on the bubble.
  const onShell = (th, ph, s = 1.012) => new THREE.Vector3(C.x - C.a * s * Math.cos(ph) * Math.sin(th), C.y + C.b * s * Math.cos(th), C.z + C.c * s * Math.sin(ph) * Math.sin(th));
  const strut = (pts, r = 0.022, m = darkM) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, r, 6), m);
  const arc = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
  strut(arc(10, (u) => onShell(lerp(BELT, 0.04, u), 1.5 * Math.PI)), 0.03);
  for (const ph of [Math.PI - DOOR, 2 * Math.PI + DOOR, Math.PI + 0.62, 2 * Math.PI - 0.62]) strut(arc(10, (u) => onShell(lerp(BELT, 0.08, u), ph)));
  strut(arc(24, (u) => onShell(BELT, lerp(Math.PI - DOOR, 2 * Math.PI + DOOR, u))), 0.026);
  strut(arc(12, (u) => onShell(0.32, lerp(Math.PI - DOOR, 2 * Math.PI + DOOR, u))), 0.018);

  // Inside: floor, two seats in tan leather, the instrument panel on its pedestal, a cyclic between the pilot's knees, the
  // collective by the seat.
  const leatherM = mat('#8a6448', { roughness: 0.7 });
  mesh(new THREE.BoxGeometry(1.15, 0.04, 1.7), trimM).position.set(0, 0.7, -0.35);
  for (const sx of [-0.33, 0.33]) {
    mesh(new THREE.BoxGeometry(0.46, 0.1, 0.46), leatherM).position.set(sx, 0.83, 0.08);
    const back = mesh(new THREE.BoxGeometry(0.46, 0.62, 0.09), leatherM); back.position.set(sx, 1.15, 0.36); back.rotation.x = -0.12;
    mesh(new THREE.BoxGeometry(0.4, 0.12, 0.09), leatherM).position.set(sx, 1.55, 0.42);
  }
  mesh(new THREE.BoxGeometry(0.14, 0.32, 0.14), trimM).position.set(0, 0.85, -0.86);
  const dash = new THREE.Group(); dash.position.set(0, 1.04, -0.95); dash.rotation.x = -0.5; body.add(dash);
  mesh(new THREE.BoxGeometry(0.8, 0.24, 0.1), darkM, dash);
  mesh(new THREE.BoxGeometry(0.84, 0.03, 0.18), trimM, dash).position.set(0, 0.13, 0.04);
  const panel = makeScreen(dash, 0.74, 0.2, 384, 104, 0, 0, 0.051);
  const cyclic = new THREE.Group(); cyclic.position.set(0.33, 0.72, -0.32); body.add(cyclic);
  mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.4, 8), darkM, cyclic).position.y = 0.2;
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 8), leatherM, cyclic).position.y = 0.42;
  const collective = new THREE.Group(); collective.position.set(0.04, 0.74, 0.25); body.add(collective);
  const lever = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), darkM, collective); lever.rotation.x = Math.PI / 2; lever.position.z = -0.25;

  // Skids on curved cross tubes, the toes turned up.
  for (const sx of [-0.95, 0.95]) {
    const skid = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.7, 10), metalM); skid.rotation.x = Math.PI / 2; skid.position.set(sx, 0.05, -0.1);
    strut([new THREE.Vector3(sx, 0.05, -1.45), new THREE.Vector3(sx, 0.1, -1.62), new THREE.Vector3(sx, 0.22, -1.7)], 0.04, metalM);
  }
  for (const z of [-0.75, 0.55]) strut([[-0.95, 0.05], [-0.82, 0.42], [-0.45, 0.62], [0.45, 0.62], [0.82, 0.42], [0.95, 0.05]].map(([x, y]) => new THREE.Vector3(x, y, z)),
    0.035, metalM);
  // Behind the cabin: the engine cowling, the transmission fairing and mast, the tail boom, fins and stabiliser.
  const cowl = mesh(new THREE.CylinderGeometry(0.3, 0.56, 1.7, 14), creamM); cowl.rotation.x = Math.PI / 2; cowl.position.set(0, 1.45, 1.35);
  cowl.scale.set(1, 1, 0.8);
  mesh(new THREE.BoxGeometry(0.55, 0.32, 1.0), creamM).position.set(0, 2.08, 0.45);
  mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 10), metalM).position.set(0, 2.5, 0.35);
  const exhaust = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 10), darkM); exhaust.position.set(0, 1.25, 2.2); exhaust.rotation.x = Math.PI / 2;
  const boom = mesh(new THREE.CylinderGeometry(0.07, 0.17, 4.5, 12), boomM); boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.62, 4.35);
  boom.rotation.x = Math.PI / 2 - 0.035;
  const fin = mesh(new THREE.BoxGeometry(0.04, 1.15, 0.5), boomM); fin.position.set(0, 2.05, 6.45); fin.rotation.x = -0.4;
  const ventral = mesh(new THREE.BoxGeometry(0.04, 0.5, 0.36), boomM); ventral.position.set(0, 1.35, 6.4); ventral.rotation.x = 0.4;
  mesh(new THREE.BoxGeometry(0.95, 0.03, 0.3), boomM).position.set(0, 1.72, 5.7);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), metalM).position.set(0, 1.08, 6.55);   // tail guard
  // Main rotor: hub, two blades on hinges (they droop when still and cone up a little in flight) and the blur disc.
  const rotor = new THREE.Group(); rotor.position.set(0, 2.82, 0.35); body.add(rotor);
  mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 14), darkM, rotor);
  const bladeM = new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.5, transparent: true });
  const hinges = [0, Math.PI].map((a) => {
    const arm = new THREE.Group(); arm.rotation.y = a; rotor.add(arm);
    const hinge = new THREE.Group(); arm.add(hinge);
    mesh(new THREE.BoxGeometry(4.4, 0.035, 0.26), bladeM, hinge).position.x = 2.35;
    mesh(new THREE.BoxGeometry(0.25, 0.036, 0.262), mat('#e8c33a'), hinge).position.x = 4.42;   // yellow tips
    return hinge;
  });
  const discM = new THREE.MeshBasicMaterial({ color: '#202224', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = mesh(new THREE.RingGeometry(0.3, 4.55, 64), discM, rotor, false); disc.rotation.x = -Math.PI / 2;
  // Tail rotor, on the left of the fin.
  const tail = new THREE.Group(); tail.position.set(-0.1, 2.0, 6.55); body.add(tail);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.015, 0.7, 0.09), bladeM, tail).position.y = s * 0.37;
  const tdisc = mesh(new THREE.CircleGeometry(0.75, 32), discM, tail, false); tdisc.rotation.y = Math.PI / 2;
  // Lights: red to port and green to starboard on the stabiliser tips and white at the tail, on with the lamps (like the
  // pad's edge lights); a red beacon on the cowl and a white strobe under the belly that flash while the engine runs.
  const light = (color, emissive, x, y, z, eBase) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0, roughness: 0.3 });
    if (eBase) lamps.push({ mat: m, eBase });
    mesh(new THREE.SphereGeometry(0.045, 10, 8), m, body, false).position.set(x, y, z);
    return m;
  };
  light('#ffb0a8', '#ff1a10', -0.48, 1.72, 5.7, 4); light('#b8f0c0', '#22ff55', 0.48, 1.72, 5.7, 4); light('#ffffff', '#ffffff', 0, 2.62, 6.68, 3);
  const beaconM = light('#ff9a8a', '#ff2a10', 0, 1.97, 1.7, 0), strobeM = light('#ffffff', '#ffffff', 0, 0.56, 0.2, 0);
  // What you click: a box round the cabin and one along the boom, in the body so they move with it.
  const hits = [hitBox(body, 2.2, 2.2, 3.4, 0, 1.2, -0.15, { action: 'heli', reach: 7 }), hitBox(body, 0.5, 0.9, 4.8, 0, 1.6, 4.2, { action: 'heli', reach: 7 })];
  roof.hits.push(...hits);
  // Where you can't walk while it's parked on our roof (moved away while it flies; see park()).
  const keepOut = [{ minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }];
  roof.colliders.push(...keepOut);

  // ----- what you can bump into -----
  // Every building's footprint and top (city.boxes), but ours is the roof deck rather than the tower's top, plus the lift
  // overrun and the mast. Bucketed by the city's 70 m blocks.
  const solids = city.boxes.slice(1).map((b) => ({ ...b }));
  solids.push({ x: 0, z: 0, w: EDGE.x * 2, d: EDGE.z * 2, top: DECK, deck: true },
    { x: (LIFT.x + EDGE.x) / 2, z: (CORE.z0 + CORE.z1) / 2, w: EDGE.x - LIFT.x, d: CORE.z1 - CORE.z0 + 0.4, top: ROOF_Y + 3.55 },
    { x: 19.2, z: 1.6, w: 0.4, d: 0.4, top: ROOF_Y + 12.9 });
  const cell = (v) => Math.floor((v + 35) / 70), grid = new Map();
  for (const b of solids) {
    for (let i = cell(b.x - b.w / 2); i <= cell(b.x + b.w / 2); i++) for (let j = cell(b.z - b.d / 2); j <= cell(b.z + b.d / 2); j++) {
      const k = i * 1000 + j; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b);
    }
  }
  const nearBy = (x, z, out = new Set()) => {
    for (let i = cell(x) - 1; i <= cell(x) + 1; i++) for (let j = cell(z) - 1; j <= cell(z) + 1; j++) for (const b of grid.get(i * 1000 + j) || []) out.add(b);
    return out;
  };

  // ----- state -----
  // pos: the point under the mast at skid level (world). rpm 0..1. cam: 'out' walking about, 'tween' climbing in or out,
  // 'in' in the seat. auto: flying itself home (R).
  const S = { pos: new THREE.Vector3(PARK.x, DECK, PARK.z), vel: new THREE.Vector3(), yaw: PARK.yaw, pitch: 0, roll: 0, yawRate: 0, rpm: 0,
    engine: false, landed: true, flown: false, aboard: false, cam: 'out', auto: null, lookYaw: 0, lookPitch: -0.08, blade: 0.6, tailA: 0, bump: 0, quiet: 0,
    snap: 0, warned: { edge: false, ceiling: false }, input: { f: 0, t: 0, c: 0 } };
  const K = new Set();   // flight keys held
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3(), eye = new THREE.Vector3(), q = new THREE.Quaternion();
  const lookE = new THREE.Euler(0, 0, 0, 'YXZ'), lookQ = new THREE.Quaternion();
  const near = () => Math.hypot(ctx.player.x - S.pos.x, ctx.player.z - S.pos.z);
  const onDeck = () => Math.abs(S.pos.x) < EDGE.x - 1.5 && Math.abs(S.pos.z) < EDGE.z - 1.5 && S.pos.y < DECK + 0.3;
  const toPad = () => Math.hypot(S.pos.x - PARK.x, S.pos.z - PARK.z);

  // Put the aircraft where S says, and the keep-out boxes round it if it's sitting on our roof.
  function place(t) {
    const bob = S.landed ? 0 : (Math.sin(t * 1.7) * 0.05 + Math.sin(t * 2.9) * 0.025) * S.rpm;
    g.position.set(S.pos.x, S.pos.y + PIVOT + bob, S.pos.z);
    g.rotation.set(S.pitch, S.yaw, S.roll);
    g.updateMatrixWorld(true);
    const parked = S.landed && (onDeck() || !!S.out), c = Math.cos(S.yaw), s = Math.sin(S.yaw);
    [[-1.05, 1.05, -1.75, 1.7], [-0.35, 0.35, 1.7, 6.7]].forEach(([x0, x1, z0, z1], i) => {
      const k = keepOut[i];
      if (!parked) { Object.assign(k, { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6 }); return; }
      const xs = [], zs = [];
      for (const [lx, lz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { xs.push(S.pos.x + lx * c + lz * s); zs.push(S.pos.z - lx * s + lz * c); }
      Object.assign(k, { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
    });
  }
  function park() {   // back on the pad, cold
    Object.assign(S, { yaw: PARK.yaw, pitch: 0, roll: 0, yawRate: 0, rpm: 0, engine: false, landed: true, auto: null, snap: 0 });
    S.pos.set(PARK.x, DECK, PARK.z); S.vel.set(0, 0, 0);
  }
  place(0);

  // ----- climbing in and out -----
  function eyePose() {   // the pilot's eye (right-hand seat), looking where you're looking
    eye.set(0.33, 1.56, -0.08); body.localToWorld(eye);
    lookE.set(S.lookPitch, S.lookYaw, 0); lookQ.setFromEuler(lookE); q.copy(g.quaternion).multiply(lookQ);
    return { x: eye.x, y: eye.y, z: eye.z, q };
  }
  function board() {
    if (S.aboard || !roof.on || ctx.mode !== 'free') return false;
    if (S.out) backIn();
    S.aboard = true; S.cam = 'tween'; S.auto = null; K.clear(); ctx.keys.clear();
    ctx.mode = 'heli'; hud.classList.add('of-flying');
    Object.assign(S, { lookYaw: 0, lookPitch: -0.08, quiet: 0 });
    place(0);
    const p = eyePose(), e = new THREE.Euler().setFromQuaternion(p.q, 'YXZ');
    ctx.tween(ctx.camPose(), { x: p.x, y: p.y, z: p.z, yaw: e.y, pitch: e.x }, 1300, () => {
      S.cam = 'in'; S.engine = true;
      toast('Starting up · <kbd>W</kbd><kbd>S</kbd> pitch · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Space</kbd> up · <kbd>Shift</kbd> down');
    });
    return true;
  }
  function getOut() {
    if (!S.aboard || S.cam !== 'in') return false;
    if (!S.landed) { toast('Land first · <kbd>Shift</kbd> to descend'); return false; }
    let out = body.localToWorld(tmp.set(2.6, 0, -0.2)), side = 1, y = ROOF_Y;
    if (!onDeck()) {   // somewhere else: a roof, a park, the street
      const on = surface(), spot = on && stepOut(on);
      if (!spot) {
        toast(`${on === 'street' ? 'You’d get wet' : 'Nowhere to stand here'} · <kbd>R</kbd> flies you back to the helipad`);
        return false;
      }
      goOut(on); ({ x: out.x, z: out.z, side } = spot); y = S.out.ground(out.x, out.z);
    }
    S.engine = false; S.auto = null; K.clear();
    const p = ctx.player;
    Object.assign(p, { x: out.x, z: out.z, seated: false, seat: null, eye: EYE, fy: y - ROOF_Y, yaw: S.yaw - side * Math.PI / 2, pitch: -0.05 });   // stepped out, facing away
    ctx.collide(p);
    S.cam = 'tween';
    ctx.tween(ctx.camPose(), { x: p.x, y: EYE + y, z: p.z, yaw: p.yaw, pitch: p.pitch }, 1100, () => {
      S.aboard = false; S.cam = 'out'; hud.classList.remove('of-flying');
      if (ctx.mode === 'heli') ctx.mode = 'free';
      if (S.out) toast(`${S.out.street ? 'Out in the street' : 'Out on the roof'} · click the helicopter or <kbd>F</kbd> by it to climb back in`);
    });
    return true;
  }

  // ----- on foot, wherever you got out -----
  // S.out: what you're standing on (a building's roof, or the street round where you landed), its ground height and what
  // you can't walk through: the helicopter, anything taller near you, and in the street the trees. The roof floor's
  // colliders, bound, ground and map follow it while it's set; the lift isn't there (liftGone).
  const WALK_R = 65;
  const wet = (x, z) => Math.abs(x - city.riverX(z)) < city.RIVER_W || city.ponds.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + 0.3);
  const inPark = (x, z) => city.parks.some(([px, pz]) => Math.abs(x - px) < 28 && Math.abs(z - pz) < 28);
  const streetY = (x, z) => city.GROUND + (inPark(x, z) ? 0.4 : -2 * clamp((city.RIVER_W + 3 - Math.abs(x - city.riverX(z))) / 3, 0, 1));   // the banks slope down to the water
  const inside = (b, x, z, m = 0) => Math.abs(x - b.x) < b.w / 2 - m && Math.abs(z - b.z) < b.d / 2 - m;
  function surface() {   // what the skids are on: a building (its box), 'street', or null (somewhere too small to stand)
    for (const b of nearBy(S.pos.x, S.pos.z)) if (!b.deck && Math.abs(S.pos.y - b.top) < 0.5 && inside(b, S.pos.x, S.pos.z, -0.6)) return b.w > 4 && b.d > 4 ? b : null;
    return S.pos.y < STREET + 0.5 ? 'street' : null;
  }
  // Where you step down: your door (the right), else the left, else behind them; on the same roof, or dry street clear of buildings.
  function stepOut(on) {
    if (on === 'street' && wet(S.pos.x, S.pos.z)) return null;
    for (const [lx, lz, side] of [[2.6, -0.2, 1], [-2.6, -0.2, -1], [2.6, 2.2, 1], [-2.6, 2.2, -1]]) {
      const w = body.localToWorld(tmp.set(lx, 0, lz)), x = w.x, z = w.z;
      if (on === 'street' ? !wet(x, z) && ![...nearBy(x, z)].some((b) => inside(b, x, z, -0.5)) : inside(on, x, z, 0.5)) return { x, z, side };
    }
    return null;
  }
  let trunks = null;   // the street trees' trunks, [x, z], read once from the city's instanced trees
  function goOut(on) {
    const street = on === 'street', y = street ? STREET : on.top, c = { x: S.pos.x, z: S.pos.z };
    const cols = [...keepOut];
    for (const b of nearBy(c.x, c.z)) if (b !== on && b.top > y + 0.5) cols.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
    if (street) {
      if (!trunks) { const a = city.trees[0].instanceMatrix.array; trunks = []; for (let i = 0; i < a.length; i += 16) trunks.push([a[i + 12], a[i + 14]]); }
      for (const [x, z] of trunks) if (Math.abs(x - c.x) < WALK_R + 5 && Math.abs(z - c.z) < WALK_R + 5) cols.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
    }
    S.out = { on, street, c, cols, last: { ...c }, edge: false,
      ground: street ? streetY : () => on.top,
      bound(p) {
        const o = S.out;
        let hit = false;
        if (!street) {   // the roof's edge, half a metre in
          const x = clamp(p.x, on.x - on.w / 2 + 0.5, on.x + on.w / 2 - 0.5), z = clamp(p.z, on.z - on.d / 2 + 0.5, on.z + on.d / 2 - 0.5);
          hit = x !== p.x || z !== p.z; p.x = x; p.z = z;
        } else {   // a way round the helicopter, and not into the water
          const dx = p.x - c.x, dz = p.z - c.z, r = Math.hypot(dx, dz);
          if (r > WALK_R) { p.x = c.x + dx / r * WALK_R; p.z = c.z + dz / r * WALK_R; hit = true; }
          if (wet(p.x, p.z)) { p.x = o.last.x; p.z = o.last.z; hit = true; }
        }
        if (p === ctx.player) {
          o.last.x = p.x; o.last.z = p.z;
          if (hit && !o.edge) toast(street ? (wet(p.x + (p.x - c.x) * 0.02, p.z + (p.z - c.z) * 0.02) ? 'That’s the river' : 'Best not wander far from the helicopter') : 'The edge of the roof');
          o.edge = hit;
        }
      } };
    roof.liftGone = true;
    ctx.sfx?.setAway(true, street ? { hums: [] } : roof.sound);   // the roof's wind up high; down in the street, just your steps
    ctx.sfx?.softGround?.((x, z) => street && (inPark(x, z) || Math.abs(x - city.riverX(z)) < city.RIVER_W + 24));
    place(0);
  }
  function backIn() {   // aboard again (or gone from the roof floor): the roof's own colliders, bounds and lift
    S.out = null; roof.liftGone = false;
    ctx.sfx?.softGround?.(null);
    if (roof.on) ctx.sfx?.setAway(true, roof.sound);
  }
  // F on foot near it climbs back in, as clicking it does.
  ctx.key('KeyF', () => {
    if (!roof.on || S.aboard || !g.visible) return false;
    if (near() > 6) { if (S.out) toast('Walk back to the helicopter to climb in'); return !!S.out; }
    return board();
  });

  function goHome() {
    if (!S.aboard || S.cam !== 'in') return false;
    if (S.landed && toPad() < 0.5 && onDeck()) { toast('You’re on the helipad'); return false; }
    // Cruise high enough to clear everything on the way: the tallest top along the line home, plus a margin.
    let top = DECK + 25;
    const n = Math.ceil(toPad() / 15);
    for (let i = 0; i <= n; i++) {
      const x = lerp(S.pos.x, PARK.x, i / n), z = lerp(S.pos.z, PARK.z, i / n);
      for (const b of nearBy(x, z)) if (Math.abs(x - b.x) < b.w / 2 + 12 && Math.abs(z - b.z) < b.d / 2 + 12) top = Math.max(top, b.top + 30);
    }
    S.auto = { phase: 'climb', alt: Math.max(top, Math.min(S.pos.y, CEILING - 10)) };
    S.engine = true;
    toast('Flying back to the helipad · any flight key takes over');
    return true;
  }
  const deckCols = roof.colliders, bound0 = roof.bound, ground0 = roof.ground;
  Object.defineProperty(roof, 'colliders', { get: () => (S.out ? S.out.cols : deckCols), enumerable: true, configurable: true });
  roof.bound = (p) => (S.out ? S.out.bound(p) : bound0(p));
  roof.ground = (x, z) => (S.out ? S.out.ground(x, z) - ROOF_Y : ground0?.(x, z) || 0);
  ctx.action('heli', {
    hover: () => (S.aboard ? '' : `<b>Helicopter</b><div class="k">Click${near() < 6 ? ' or <kbd>F</kbd>' : ''} to ${S.out ? 'climb in' : 'fly'}</div>`),
    click: () => board(),
  });

  // ----- keys and the mouse while you're in it -----
  const FLIGHT = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  document.addEventListener('keydown', (e) => {
    if (ctx.mode !== 'heli' || !ctx.active || e.metaKey || e.ctrlKey || e.target.closest?.('input, select, textarea')) return;
    if (FLIGHT.has(e.code)) {
      e.preventDefault(); K.add(e.code);
      if (S.auto && S.cam === 'in') { S.auto = null; toast('Autopilot off'); }
      return;
    }
    if (e.code === 'KeyF' || e.code === 'Escape') { getOut(); return; }
    if (e.code === 'KeyR') { goHome(); return; }
    if (['KeyM', 'KeyH', 'KeyG', 'KeyT'].includes(e.code)) ctx.onKey(e);   // mute, overlays, graphics, time still work
  });
  document.addEventListener('keyup', (e) => K.delete(e.code));
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) K.clear(); });
  document.addEventListener('mousemove', (e) => {
    if (ctx.mode !== 'heli' || !ctx.locked || S.cam !== 'in') return;
    S.lookYaw = clamp(S.lookYaw - e.movementX * 0.0022, -2.3, 2.3);
    S.lookPitch = clamp(S.lookPitch - e.movementY * 0.0022, -1.2, 0.9);
  });
  renderer.domElement.addEventListener('click', () => { if (ctx.mode === 'heli' && !ctx.locked) renderer.domElement.requestPointerLock(); });

  // ----- flying -----
  const held = (...codes) => codes.some((c) => K.has(c));
  function manual() {
    const I = S.input;
    I.f = +held('KeyW', 'ArrowUp') - +held('KeyS', 'ArrowDown');
    I.t = +held('KeyA', 'ArrowLeft') - +held('KeyD', 'ArrowRight');
    I.c = +held('Space', 'KeyE') - +held('ShiftLeft', 'ShiftRight', 'KeyQ');
    return I;
  }
  function fly(dt) {
    const I = S.cam === 'in' ? manual() : Object.assign(S.input, { f: 0, t: 0, c: 0 }), A = S.auto;
    if (S.cam === 'in' && !S.engine && (I.f || I.t || I.c > 0)) { S.engine = true; toast('Starting up'); }
    S.rpm = S.engine ? Math.min(1, S.rpm + dt / 5) : Math.max(0, S.rpm - dt / 9);
    const lift = sstep(0.85, 1, S.rpm);
    fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)); right.set(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
    const prevY = S.pos.y;
    if (S.landed) {
      S.vel.set(0, 0, 0); S.pitch = damp(S.pitch, 0, 6, dt); S.roll = damp(S.roll, 0, 6, dt); S.yawRate = 0;
      if (S.snap > 0) {   // settling onto the H
        S.snap = Math.max(0, S.snap - dt);
        S.pos.x = damp(S.pos.x, PARK.x, 5, dt); S.pos.z = damp(S.pos.z, PARK.z, 5, dt); S.yaw += angDiff(S.yaw, PARK.yaw) * Math.min(1, dt * 5);
      }
      const go = A ? A.phase === 'climb' : I.c > 0;
      if (go && S.rpm > 0.97) { S.landed = false; S.flown = true; S.vel.y = 1.5; S.snap = 0; }
      // Back on the ground after a flight with nothing pressed: shut down after a moment.
      S.quiet = S.flown && !A && S.engine && !I.f && !I.t && I.c <= 0 ? S.quiet + dt : 0;
      if (S.quiet > 1.5 && S.cam === 'in') { S.engine = false; S.quiet = 0; S.flown = false; toast(onDeck() ? 'Landed · <kbd>F</kbd> to get out · <kbd>Space</kbd> to take off'
        : canOut() ? 'Landed · <kbd>F</kbd> to get out · <kbd>R</kbd> flies you back to the helipad' : 'Landed · <kbd>R</kbd> flies you back to the helipad'); }
    } else if (A) autopilot(dt, A, lift);
    else {
      // Arcade handling: nose down to go, it levels itself and slows when you let go; yaw with a bank into the turn.
      S.pitch = damp(S.pitch, -I.f * (I.f > 0 ? 0.2 : 0.12), 2.2, dt);
      S.yawRate = damp(S.yawRate, I.t * 0.9 * lift, 3, dt);
      S.yaw += S.yawRate * dt;
      const thrust = -S.pitch * 70 * lift;
      S.vel.addScaledVector(fwd, thrust * dt);
      let vf = S.vel.dot(fwd), vs = S.vel.dot(right);
      vf *= Math.exp(-(I.f ? 0.28 : 0.6) * dt); vs *= Math.exp(-1.6 * dt);
      vf = Math.max(vf, -12);
      S.vel.x = fwd.x * vf + right.x * vs; S.vel.z = fwd.z * vf + right.z * vs;
      const vyT = I.c > 0 ? 8 : I.c < 0 ? -7 : 0;
      S.vel.y = damp(S.vel.y, lerp(-9, vyT, lift), 1.8, dt);
      S.roll = damp(S.roll, clamp(S.yawRate * (0.25 + Math.abs(vf) / 40) * 0.6, -0.45, 0.45), 3, dt);
    }
    // The edge of the city: a firm push back toward the middle, and a ceiling.
    const r = Math.hypot(S.pos.x, S.pos.z);
    if (r > EDGE_R) {
      const k = (r - EDGE_R) * 0.08 * dt;
      S.vel.x -= S.pos.x / r * k * 10; S.vel.z -= S.pos.z / r * k * 10;
      if (!A && S.cam === 'in') S.yaw += angDiff(S.yaw, Math.atan2(S.pos.x, S.pos.z)) * Math.min(1, dt * 0.8);
      if (!S.warned.edge) { S.warned.edge = true; toast('Edge of the city · turning back'); }
    } else if (r < EDGE_R - 100) S.warned.edge = false;
    S.pos.addScaledVector(S.vel, dt);
    const r2 = Math.hypot(S.pos.x, S.pos.z);
    if (r2 > EDGE_R + 120) S.pos.multiplyScalar((EDGE_R + 120) / r2).setY(S.pos.y);
    if (S.pos.y > CEILING) { S.pos.y = CEILING; S.vel.y = Math.min(S.vel.y, 0); if (!S.warned.ceiling) { S.warned.ceiling = true; toast('That’s as high as it goes'); } }
    else if (S.pos.y < CEILING - 50) S.warned.ceiling = false;
    if (!S.landed) collide(prevY, dt, I);
  }
  // Buildings: land on a roof you come down onto, get pushed off the side of one you fly into (a bump). The street below all.
  function collide(prevY, dt, I) {
    const R = 2.2;
    let ground = STREET, deck = false, hit = 0;
    for (const b of nearBy(S.pos.x, S.pos.z)) {
      const dx = S.pos.x - b.x, dz = S.pos.z - b.z, hx = b.w / 2, hz = b.d / 2;
      if (Math.abs(dx) < hx + 0.6 && Math.abs(dz) < hz + 0.6 && prevY >= b.top - 0.3) { if (b.top > ground) { ground = b.top; deck = !!b.deck; } continue; }
      if (S.pos.y >= b.top) continue;
      const px = hx + R - Math.abs(dx), pz = hz + R - Math.abs(dz);
      if (px <= 0 || pz <= 0) continue;
      if (px < pz) { S.pos.x += Math.sign(dx) * px; if (S.vel.x * dx < 0) { hit = Math.max(hit, Math.abs(S.vel.x)); S.vel.x *= -0.25; } }
      else { S.pos.z += Math.sign(dz) * pz; if (S.vel.z * dz < 0) { hit = Math.max(hit, Math.abs(S.vel.z)); S.vel.z *= -0.25; } }
    }
    if (hit > 1.5) bump(hit);
    if (S.pos.y > ground) return;
    const vy = S.vel.y, hs = Math.hypot(S.vel.x, S.vel.z);
    S.pos.y = ground; if (S.vel.y < 0) S.vel.y = 0;
    if (vy < -4) bump(-vy);
    // Touchdown: slow and not climbing. On our roof near the pad, it settles onto the H.
    if ((I.c <= 0 || S.auto) && hs < 4 && Math.abs(S.pitch) < 0.16) {
      S.landed = true; S.vel.set(0, 0, 0); S.quiet = 0;
      if (deck && toPad() < 4) S.snap = 1.2;
      if (S.auto) { S.auto = null; toast(deck && toPad() < 4 ? 'Home · <kbd>F</kbd> to get out' : 'Landed'); }
    } else { S.vel.x *= Math.exp(-3 * dt); S.vel.z *= Math.exp(-3 * dt); }   // skidding along
  }
  function bump(v) {
    S.bump = Math.min(1, v / 10);
    ctx.sfx?.cabinet('slam', tmp.copy(S.pos).setY(S.pos.y + 1), clamp(v / 12, 0.2, 0.7));
  }
  // R: climb to a safe height, turn for home, fly there, slow to a hover over the H, and let down.
  function autopilot(dt, A, lift) {
    const dx = PARK.x - S.pos.x, dz = PARK.z - S.pos.z, dist = Math.hypot(dx, dz);
    let want = 0, vyT = 0, yawTo = Math.atan2(-dx, -dz);
    if (A.phase === 'climb') {
      vyT = 8; want = 0;
      if (S.pos.y > A.alt - 2) A.phase = 'cruise';
    } else if (A.phase === 'cruise') {
      const err = Math.abs(angDiff(S.yaw, yawTo));
      want = err < 0.6 ? Math.min(45, dist * 0.35) : 2;
      vyT = clamp((A.alt - S.pos.y) * 0.8, -6, 8);
      if (dist < 4) A.phase = 'descend';
    } else {
      yawTo = PARK.yaw;
      const h = S.pos.y - DECK;
      vyT = -clamp(h * 0.5, 1.4, 7);
    }
    S.yawRate = damp(S.yawRate, clamp(angDiff(S.yaw, yawTo) * 1.5, -0.9, 0.9) * lift, 3, dt);
    S.yaw += S.yawRate * dt;
    fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    // Velocity toward what it wants: along the nose in the cruise, straight at the pad once it's over it.
    const tx = A.phase === 'descend' ? clamp(dx, -3, 3) : fwd.x * want, tz = A.phase === 'descend' ? clamp(dz, -3, 3) : fwd.z * want;
    const ax = (tx - S.vel.x) * 0.8, az = (tz - S.vel.z) * 0.8;
    S.vel.x += ax * dt; S.vel.z += az * dt; S.vel.y = damp(S.vel.y, vyT, 1.8, dt);
    S.pitch = damp(S.pitch, clamp(-(ax * fwd.x + az * fwd.z) / 70, -0.2, 0.15), 2.2, dt);
    S.roll = damp(S.roll, clamp(S.yawRate * 0.4, -0.35, 0.35), 3, dt);
  }

  // ----- each frame -----
  let paintAt = 0;
  const hudEl = hud.querySelector('.of-heli'), el = (c) => hudEl.querySelector(c);
  const hudOut = { alt: el('.alt'), spd: el('.spd'), hdg: el('.hdg'), rpm: el('.rpm'), hint: el('.hint') }, shown = {};
  const set = (k, v) => { if (shown[k] !== v) { shown[k] = v; if (k === 'hintOn') hudOut.hint.classList.toggle('on', v); else hudOut[k].innerHTML = v; } };
  let outAt = 0, outOk = false;
  const canOut = () => { const now = performance.now(); if (now - outAt > 250) { outAt = now; const on = surface(); outOk = !!on && !!stepOut(on); } return outOk; };
  const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const heading = () => ((Math.atan2(-Math.sin(S.yaw), -Math.cos(S.yaw)) * 180 / Math.PI) + 360) % 360;
  function updateHud() {
    const alt = S.pos.y - city.GROUND, kmh = Math.hypot(S.vel.x, S.vel.z) * 3.6, h = heading();
    set('alt', `${Math.round(alt)} m`); set('spd', `${Math.round(kmh)} km/h`);
    set('hdg', `${String(Math.round(h) % 360).padStart(3, '0')}° ${COMPASS[Math.round(h / 45) % 8]}`); set('rpm', `${Math.round(S.rpm * 100)}%`);
    const pad = toPad(), above = S.pos.y - DECK;
    let hint, on = false;
    if (S.cam === 'tween') hint = '';
    else if (S.auto) hint = 'Autopilot: flying home · any flight key takes over';
    else if (S.landed) hint = !S.engine && S.rpm < 0.97 && S.rpm > 0.02 ? (onDeck() ? 'Shutting down · <kbd>F</kbd> get out · <kbd>Space</kbd> take off'
      : `Shutting down${canOut() ? ' · <kbd>F</kbd> get out' : ''} · <kbd>R</kbd> fly home`)
      : S.rpm < 0.97 ? 'Starting up…' : `<kbd>Space</kbd> take off${onDeck() ? ' · <kbd>F</kbd> get out' : `${canOut() ? ' · <kbd>F</kbd> get out' : ''} · <kbd>R</kbd> fly home`}`;
    else if (pad < 4 && above < 30) { hint = 'Over the pad · <kbd>Shift</kbd> to land'; on = true; }
    else if (pad < 60 && above < 80) { hint = 'Helipad ahead · slow down and descend onto the H'; on = true; }
    else hint = '<kbd>W</kbd><kbd>S</kbd> pitch · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Space</kbd><kbd>Shift</kbd> up/down · <kbd>R</kbd> home';
    set('hint', hint); set('hintOn', on);
  }
  function paintPanel(now) {   // airspeed, the artificial horizon, altimeter and rotor rpm, backlit
    if (now - paintAt < 110) return;
    paintAt = now;
    const c = panel.ctx, W = 384, H = 104, kts = Math.hypot(S.vel.x, S.vel.z) * 1.944, alt = S.pos.y - city.GROUND;
    c.fillStyle = '#141518'; c.fillRect(0, 0, W, H);
    const gauge = (x, label, k, text, arcs) => {
      c.save(); c.translate(x, 48);
      c.fillStyle = '#0b0c0e'; c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#5b5e63'; c.lineWidth = 2; c.stroke();
      for (const [a, b, col] of arcs || []) { c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 34, -1.25 * Math.PI + a * 1.5 * Math.PI, -1.25 * Math.PI + b * 1.5 * Math.PI); c.stroke(); }
      c.strokeStyle = '#d9d6cf'; c.lineWidth = 1.5;
      for (let i = 0; i <= 10; i++) { const a = -1.25 * Math.PI + i / 10 * 1.5 * Math.PI; c.beginPath(); c.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); c.lineTo(Math.cos(a) * 37, Math.sin(a) * 37); c.stroke(); }
      const a = -1.25 * Math.PI + clamp(k, 0, 1) * 1.5 * Math.PI;
      c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 31, Math.sin(a) * 31); c.stroke();
      c.fillStyle = '#9a9890'; c.font = `600 9px ${FONT}`; c.textAlign = 'center'; c.fillText(label, 0, 18);
      c.fillStyle = '#f2efe8'; c.font = `600 11px ${FONT}`; c.fillText(text, 0, 30);
      c.restore();
    };
    gauge(48, 'KNOTS', kts / 120, `${Math.round(kts)}`, [[0, 0.75, '#3d9a50'], [0.9, 1, '#c0392b']]);
    // The artificial horizon: sky over ground, turned with the roll and moved with the pitch.
    c.save(); c.translate(144, 48); c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.clip();
    c.rotate(-S.roll); const py = S.pitch * 120;
    c.fillStyle = '#3d7fc4'; c.fillRect(-60, -80 + py, 120, 80); c.fillStyle = '#8a5a34'; c.fillRect(-60, py, 120, 80);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-60, py); c.lineTo(60, py); c.stroke();
    c.restore();
    c.strokeStyle = '#e8c33a'; c.lineWidth = 3; c.beginPath(); c.moveTo(118, 48); c.lineTo(136, 48); c.moveTo(152, 48); c.lineTo(170, 48); c.stroke();
    c.strokeStyle = '#5b5e63'; c.lineWidth = 2; c.beginPath(); c.arc(144, 48, 40, 0, Math.PI * 2); c.stroke();
    gauge(240, 'ALT M', (alt % 1000) / 1000, `${Math.round(alt)}`);
    gauge(336, 'ROTOR %', S.rpm, `${Math.round(S.rpm * 100)}`, [[0.9, 1, '#3d9a50']]);
    panel.tex.needsUpdate = true;
  }
  paintPanel(0); paintAt = -1e9;

  ctx.onFrame((dt, t, now) => {   // the sun's shadows follow you while you're away from the roof
    const away = g.visible && (!S.landed || !onDeck()), at = S.out && !S.aboard ? tmp.set(ctx.player.x, S.out.ground(ctx.player.x, ctx.player.z), ctx.player.z) : S.pos;
    if (away) { sun.target.position.copy(at); sun.position.copy(sunDir).multiplyScalar(90).add(at); }
    else sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
  }, 55);
  ctx.onFrame((dt, t, now) => {
    if (!g.visible) return;
    if (S.aboard || S.rpm > 0 || !S.landed) fly(dt);
    place(t);
    // The rotor: spinning with the rpm, blades fading into the blur disc; droop at rest, a little coning in flight.
    S.blade += S.rpm * 34 * dt; S.tailA += S.rpm * 150 * dt;
    rotor.rotation.y = S.blade; tail.rotation.x = S.tailA;
    const blur = S.rpm * S.rpm;
    bladeM.opacity = lerp(1, 0.22, sstep(0.25, 0.9, S.rpm)); bladeM.depthWrite = bladeM.opacity > 0.9;
    discM.opacity = 0.16 * blur;
    for (const h of hinges) h.rotation.z = lerp(-0.045, 0.03, sstep(0.3, 1, S.rpm));
    // Controls in the cockpit follow your hands; the beacon and strobe flash while the engine runs.
    cyclic.rotation.x = -S.input.f * 0.18; cyclic.rotation.z = S.input.t * 0.12; collective.rotation.x = S.input.c * 0.2;
    const run = S.engine || S.rpm > 0.3 ? 1 : 0;
    beaconM.emissiveIntensity = run * (Math.sin(t * 7) > 0.6 ? 5 : 0.1);
    strobeM.emissiveIntensity = run * ((t % 1.3) < 0.06 ? 8 : 0);
    if (S.aboard) {
      if (S.cam === 'in') {
        const p = eyePose();
        camera.position.set(p.x, p.y, p.z); camera.quaternion.copy(p.q);
        if (S.bump > 0) { camera.position.y += Math.sin(t * 60) * 0.04 * S.bump; camera.position.x += Math.cos(t * 47) * 0.03 * S.bump; }
        // A faint buzz through the airframe while the rotor turns.
        camera.position.y += Math.sin(t * 43) * 0.0025 * S.rpm;
      }
      S.bump = Math.max(0, S.bump - dt * 2.5);
      updateHud();
    }
    if (S.aboard || S.rpm > 0) paintPanel(now);
  }, 85);
  ctx.onFrame(() => ctx.sfx.heli(g.visible ? S.rpm : 0, tmp.copy(S.pos).setY(S.pos.y + 2.5), S.aboard && S.cam === 'in'), 115);

  // While you're aboard, or on foot somewhere else, the minimap is a map of the city round you instead of the roof's (a
  // getter, so the parts after this that add to the roof's map, the bar, add to the roof's).
  let roofMap = roof.map;
  Object.defineProperty(roof, 'map', { get: () => (S.aboard || S.out ? heliMap : roofMap), set: (f) => { roofMap = f; }, enumerable: true, configurable: true });
  function heliMap() {
    const walk = S.out && !S.aboard, p = ctx.player, M = walk ? 0.5 : 2.4, cx = walk ? p.x : S.pos.x, cz = walk ? p.z : S.pos.z, y = walk ? S.out.ground(p.x, p.z) + 0.5 : S.pos.y;
    const c = mapCtx, W = 440, H = 330, sx = (x) => W / 2 + (x - cx) / M, sz = (z) => H / 2 + (z - cz) / M;
    c.clearRect(0, 0, W, H);
    if (walk) {   // where you can walk: the roof you're on, or the circle round the helicopter; and the helicopter
      const o = S.out;
      c.fillStyle = 'rgba(255,255,255,.16)';
      if (o.street) { c.beginPath(); c.arc(sx(o.c.x), sz(o.c.z), WALK_R / M, 0, Math.PI * 2); c.fill(); }
      else c.fillRect(sx(o.on.x - o.on.w / 2), sz(o.on.z - o.on.d / 2), o.on.w / M, o.on.d / M);
      c.fillStyle = 'rgba(217,119,87,.9)';
      for (const k of keepOut) c.fillRect(sx(k.minX), sz(k.minZ), (k.maxX - k.minX) / M, (k.maxZ - k.minZ) / M);
    }
    for (const b of solids) {
      if (Math.abs(b.x - cx) > W / 2 * M + 30 || Math.abs(b.z - cz) > H / 2 * M + 30 || (walk && b === S.out.on)) continue;
      c.fillStyle = b.top > y ? 'rgba(255,140,110,.55)' : b.deck ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.2)';
      c.fillRect(sx(b.x - b.w / 2), sz(b.z - b.d / 2), Math.max(1.5, b.w / M), Math.max(1.5, b.d / M));
    }
    c.strokeStyle = 'rgba(232,195,58,.9)'; c.lineWidth = 3; c.beginPath(); c.arc(sx(PARK.x), sz(PARK.z), Math.max(4, HELI.r / M), 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2; c.beginPath(); c.arc(sx(0), sz(0), EDGE_R / M, 0, Math.PI * 2); c.stroke();
    c.font = '600 18px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText('N', W / 2 - 6, 22);
    c.save(); c.translate(W / 2, H / 2); c.rotate(-(walk ? p.yaw : S.yaw));
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }
  // Shown with the roof. Leaving it (the lift, or the 3D view closing) with the helicopter anywhere but parked on our roof
  // puts it back on the pad.
  const enter0 = roof.enter, leave0 = roof.leave;
  roof.enter = (z) => { enter0(z); g.visible = true; };
  roof.leave = () => {
    leave0(); g.visible = false;
    if (S.aboard) { S.aboard = false; S.cam = 'out'; K.clear(); hud.classList.remove('of-flying'); if (ctx.mode === 'heli') ctx.mode = 'free'; }
    if (S.out) backIn();
    if (!S.landed || !onDeck()) park();
    S.engine = false; S.rpm = 0; ctx.sfx?.heli(0);
    place(0);
  };

  // And on the helipad's camera, parked or flying.
  const stage0 = roof.cctv.stage;
  roof.cctv.stage = () => { const undo = stage0(), was = g.visible; g.visible = true; return () => { g.visible = was; undo(); }; };

  ctx.heli = { S, body, keys: K, board, getOut, goHome, park, surface, get eye() { return eyePose(); } };
}
