// THE GREY MEADOW: behind a painting on the restricted level (B3, restricted.js). Far out in B3's east, on the wall of a
// long room, a quiet old oil in a dark frame: a little girl in a long white dress on a winding dirt path among bare
// trees, under a grey sky, blue hills behind; on a string she pulls a toy cart on wooden wheels, and the cart is a huge
// red hooded body with a tired man's face on its front, a little bowler hat on top, a grey pompom for a tail
// (cart-painting.js has where, the frame and the paint). Come up to it and the paint gives way to a window; walk into it
// and you're there, the frame hanging in the air behind you with B3 through it (painting-door.js, systems/portal.js:
// seamless both ways). The picture is the meadow itself: the girl and the cart stand a few metres in from the frame,
// where the window frames them the way the painting does.
// Out there (cart-plan.js lays it out): olive meadows, the ochre path winding through them in one long loop, groves of
// bare gnarled trees, crows on them, mist in the hollows, the hills in haze, a broken wall (cart-land.js); the girl
// (cart-girl.js), who walks the path slowly with the cart creaking behind her, stops when you come near, turns and looks
// at you without expression and carries on, hums a thin old tune, and if you follow her, stops by the things worth
// seeing; the cart (cart-carts.js, cart-face.js), whose eyes follow you, which blinks and breathes and sighs, murmurs
// half-heard fragments, looks a little different at you if you stand in front of it, says an odd line when you click its
// face and sometimes lifts its hat; the other carts left among the trees, some tipped over, all their eyes on you; the
// toy-maker's shed, its benches, unfinished faces and hoods, tools and wheels, and a music box; the swing on a dead tree
// that sways on its own; an old pram in the mist (cart-things.js). Sounds: cart-sound.js. Its own muted painted look.
// What you can do: click the cart's body to take the string and pull it yourself (the girl follows you instead; click
// it again to give it back); click its face; wind the music box; push the swing.
// Its own unlisted, carless floor; your car waits on B3. Nothing of it is built until you first come near the painting
// (or a reload puts you out there): then the heavy arithmetic in a worker (cart-worker.js) and the rest a few
// milliseconds a frame; and nothing of it runs unless you're out there or looking in.
// Debug: ctx.cart (window.__office.cart): .go(x, z, yaw, pitch) stands you out there (the frame at the origin, its plane
// z = 0, the way in toward -z; yaw 0 faces the girl and the cart); .painting(x, z, yaw, pitch) on B3 in front of it;
// .face(d, side, pitch) in front of the cart's face; .girl(s, mode) puts her s along the path (mode 'path', 'wait',
// 'stop'); .say(i) the face says line i; .hold(on) the string; .wind() the box; .push() the swing; .by(thing, d, yaw,
// pitch) stands you by 'shed', 'box', 'swing', 'grove', 'pram'.

import * as THREE from 'three';
import { EYE, rng, sstep } from '../util.js';
import { makePaintingDoor } from './painting-door.js';
import { findCart, frame, paintPane, passShader, SIZE } from './cart-painting.js';
import { along, nearest, ground as groundAt, pathDist, PATH_W, TABLEAU, SWING, SHED, OLD, PRAM, CEN, RADIUS, PTS, LOOP, WALL } from './cart-plan.js';
import { faceArrays, skinArrays, groundArrays } from './cart-sculpt.js';
import { PEOPLE } from './cart-sculpt.js';
import { buildLand } from './cart-land.js';
import { makeParts, makeCart, makeOld, SKIN_S } from './cart-carts.js';
import { buildThings } from './cart-things.js';
import { makeGirl } from './cart-girl.js';
import { FACE, HITCH, K } from './cart-face.js';
import { makeSound } from './cart-sound.js';

const N_FLOOR = -10, L_GIRL = 1.7, L_YOU = 2.2, WB = (HITCH.z + 1.22) * K;   // the string's length in her hand and yours; hitch to rear axle

// What the face says when you click it: odd, melancholy, about nothing you'd know.
const LINES = [
  'I was a much larger man, once. Then they found the hood.',
  'She never says where we’re going. I’ve stopped asking.',
  'Don’t stand so close. I can’t shut my eyes. Not properly.',
  'Every turn in this path is the same turn.',
  'The hat isn’t mine. Nothing out here is mine.',
  'If you’ve somewhere to be, I envy you.',
  'They gave me wheels. They didn’t give me a reason.',
  'It’s always nearly evening here. It never arrives.',
  'I had a name. I lent it to someone and they kept it.',
  'Mind the ruts. I feel every one of them.',
  'Pull gently, if you pull. That’s all I ask.',
  'The trees were people too, I think. They have that look.',
  'She hums when she thinks I’m asleep. I’m never asleep.',
  'Somewhere there’s a door I used to go through every day.',
];
// What it murmurs to itself: half-heard.
const MURMURS = ['…so far, and never…', '…the same hill again…', '…cold, the wheels are cold…', '…where she takes me…', '…I remember a door…', '…not yet. Not yet…',
  '…tell her to stop…', '…it was summer, once…', '…someone’s watching…', '…who carved you…', '…round and round…'];

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // (three takes a uuid from Math.random for every object: what's made here takes them from its own stream: see plain.js)
  const random = Math.random;
  Math.random = rng(3100);
  try { setup(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function setup(ctx) {
  const { camera, renderer, mapCtx, addFloor, style, hud } = ctx;
  const fl = { n: N_FLOOR, label: 'THE MEADOW', title: 'The meadow', unlisted: true, carless: true, liftGone: true, home: -3, on: false, composer: null,
    colliders: [], hits: [], scene: new THREE.Scene(), stage: new THREE.Group(), sound: { kind: 'cart', steps: true }, built: false,
    look: { exposure: 1.0, hemi: 1.7, sky: new THREE.Color('#b4b9b6'), ground: new THREE.Color('#5f5c3f'), env: 0.0, bloom: 0.25, grade: 1.0, lights: [], aoSkip1: true } };
  const time = { value: 0 };
  style.textContent += `.of-cart .of-clock { font-size: 0 !important; } .of-cart .of-clock::after { content: '—'; font-size: 12px; }
    .of-cart-say { position: absolute; left: 50%; bottom: 17%; transform: translateX(-50%); max-width: 56%; text-align: center; pointer-events: none;
      font: italic 18px/1.4 Georgia, 'Times New Roman', serif; color: rgba(236,230,216,.94); text-shadow: 0 1px 8px rgba(0,0,0,.75); opacity: 0; transition: opacity .9s; }
    .of-cart-say.on { opacity: 1; } .of-cart-say.faint { color: rgba(222,216,202,.55); font-size: 15px; }`;
  const sayEl = document.createElement('div'); sayEl.className = 'of-cart-say'; hud.appendChild(sayEl);
  let sayUntil = 0;
  const caption = (text, sec, faint = false) => { sayEl.textContent = text; sayEl.classList.toggle('faint', faint); sayEl.classList.add('on'); sayUntil = time.value + sec; };

  // ----- the world, once built -----
  let W = null, sound = null, R = null, frameN = 0, mapImg = null;
  ctx.onFrame(() => { frameN++; }, 1);   // (to tell a build sliced a frame at a time from one drained at once)
  const cols = [];   // the world's colliders (the door adds the frame's)
  const B = { ready: false, worker: null, A: {}, times: [], slow: [] };   // (times: when each stage was done)
  const JOBS = { face0: ['face', { p: 0, nU: 240, nV: 300, morphs: true }], face1: ['face', { p: 1, nU: 130, nV: 160, morphs: false }], face2: ['face', { p: 2, nU: 130, nV: 160, morphs: false }],
    face3: ['face', { p: 3, nU: 130, nV: 160, morphs: false }], skin: ['skin', { S: SKIN_S, p: 0 }], ground: ['ground', {}] };
  const compute = (job, a) => (job === 'face' ? faceArrays(PEOPLE[a.p], a.nU, a.nV, a.morphs) : job === 'skin' ? skinArrays(a.S, PEOPLE[a.p]) : groundArrays());
  // The meadow's lights, in its scene from the moment the build starts and never taken away: a program is made for the
  // lights a scene has, so a light added later, or hidden and shown, recompiles everything drawn (seconds, on ANGLE).
  // The sky's grey from above, the ground's olive from below; a soft light from the upper left; the shed's lantern.
  const LIGHT = { hemi: new THREE.HemisphereLight('#b4b9b6', '#5f5c3f', 1.7), key: new THREE.DirectionalLight('#efe6d4', 1.15), back: new THREE.DirectionalLight('#9aa6b8', 0.35),
    lamp: new THREE.PointLight('#ffb764', 6, 6, 1.6) };
  LIGHT.key.position.set(-40, 55, 30); LIGHT.back.position.set(30, 20, -50);
  function start(R0) {
    B.times.push(['start', performance.now()]);
    R = R0;
    fl.scene.add(LIGHT.hemi, LIGHT.key, LIGHT.back, LIGHT.lamp);
    fl.hemi = LIGHT.hemi;
    fl.look.lights.push([LIGHT.key, 1.15], [LIGHT.back, 0.35]);
    sound = makeSound(ctx);
    try {
      B.worker = new Worker(new URL('./cart-worker.js', import.meta.url), { type: 'module' });
      B.worker.onmessage = ({ data: { id, out } }) => { B.A[id] ||= out; };
      for (const [id, [job, a]] of Object.entries(JOBS)) B.worker.postMessage({ id, job, a });
    } catch { B.worker = null; }
  }
  // (each slice of it timed: B.slow, the ones over 12 ms)
  function* timed(g, name) {
    for (let k = 0; ; k++) { const t0 = performance.now(), r = g.next(), ms = performance.now() - t0; if (ms > 12) B.slow.push([name, k, Math.round(ms)]); if (r.done) return r.value; yield; }
  }
  // The world, a piece a frame (painting-door.js slices it from `far` m off, the rest at once if it's wanted sooner)
  function* buildAll(R0) {
    start(R0);
    const A = B.A;
    // the worker's answers (or, wanted now, worked out here)
    for (let f = frameN, same = 0; ;) {
      const missing = Object.keys(JOBS).filter((k) => !A[k]);
      if (!missing.length) break;
      if (same > 2 || !B.worker) { for (const k of missing) A[k] = compute(...JOBS[k]); break; }   // (drained, not sliced: no waiting)
      yield;   // (its answers come between frames)
      same = frameN === f ? same + 1 : 0; f = frameN;
    }
    B.worker?.terminate(); B.worker = null;
    B.times.push(['worker', performance.now()]);
    const land = yield* timed(buildLand(fl, R, time, A), 'land');
    const parts = yield* timed(makeParts(R, A), 'parts');
    const cart = yield* timed(makeCart(parts, R, A), 'cart');
    const old = yield* timed(makeOld(parts, R, OLD, A), 'old');
    const things = yield* timed(buildThings(parts, R, time, A), 'things');
    const girl = makeGirl(R, time);
    B.times.push(['parts', performance.now()]);
    yield;
    // the string: a sagging line from the hand to the ring under the chin
    const sp = new Float32Array(20 * 3), sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: '#d9d2bd' })); string.frustumCulled = false;
    fl.stage.add(cart.root, old.eyeMesh, ...old.meshes, things.root, girl.root, string);
    // what you can point at
    const hb = ctx.hitBox;
    const faceHit = hb(cart.root, 1.15, 1.55, 0.45, 0, FACE.cy, FACE.cz + 0.32, { action: 'cart-face', reach: 4.5 });
    const bodyHit = hb(cart.root, 1.45, 1.4, 1.75, 0, 0.85, -0.85, { action: 'cart-string', reach: 3.5 });
    const girlHit = hb(girl.root, 0.5, 1.2, 0.45, 0, 0.6, 0, { action: 'cart-girl', reach: 5 });
    const oldHits = OLD.map((o, i) => { const m = hb(fl.stage, 1.5, 1.6, 2.6, 0, 0, 0, { action: 'cart-old', reach: 5, info: i }); m.matrixAutoUpdate = false; m.matrix.copy(o.M).multiply(new THREE.Matrix4().makeTranslation(0, 0.85, -0.6)); return m; });
    fl.hits.push(faceHit, bodyHit, girlHit, ...oldHits, ...things.hits);
    cols.push(...land.cols, ...things.cols);
    for (const o of OLD) cols.push({ minX: o.x - 1.35, maxX: o.x + 1.35, minZ: o.z - 1.35, maxZ: o.z + 1.35 });
    const cartBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, girlBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    cols.push(cartBox, girlBox);
    const lampL = [LIGHT.lamp, 6];
    fl.look.lights.push(lampL);
    LIGHT.lamp.position.copy(things.lanternAt()).y -= 0.05;
    land.crows.onUp = (c) => { if (ctx.away === fl) sound.caws(c.at, 1 + Math.floor(Math.random() * 2)); };
    cart.onSigh = () => { if (ctx.away === fl) sound.sigh(facePos); };
    W = { land, parts, cart, old, things, girl, string, cartBox, girlBox, lampL };
    things.box.root.getWorldPosition(S.boxAt);
    place();
    fl.scene.add(fl.stage);
    yield;
    mapImg = drawMap();   // (the map's picture, made now rather than the first frame out there)
    // Ambient occlusion draws everything again with one normal material (GTAOPass), a program for each kind of mesh
    // (plain, instanced, morphed), first drawn the frame the cart's first in view out there. One of each kind, with that
    // material, hidden in the scene (lit and fogged as the rest), so the door's warm-up (systems/warm.js, which shows
    // what's hidden while it works) gets those ready too.
    const aoKinds = new THREE.Group(), nm = new THREE.MeshNormalMaterial({ blending: THREE.NoBlending }), kinds = new Map();   // (as GTAOPass's)
    fl.stage.traverse((x) => { if (x.isMesh && x.material?.allowOverride !== false) kinds.set(`${!!x.isInstancedMesh}${x.geometry.morphAttributes.position?.length ?? 0}`, x); });
    for (const x of kinds.values()) {
      const m = x.isInstancedMesh ? new THREE.InstancedMesh(x.geometry, nm, x.count) : new THREE.Mesh(x.geometry, nm);
      if (x.isInstancedMesh) m.instanceMatrix = x.instanceMatrix;
      if (x.morphTargetInfluences) m.morphTargetInfluences = x.morphTargetInfluences.slice();
      aoKinds.add(m);
    }
    aoKinds.visible = false; fl.scene.add(aoKinds);
    B.ready = true;
    B.times.push(['made', performance.now()]);
    // (got ready to be seen by the door, systems/warm.js, before anything's drawn through it)
    return {
      get sound() { return sound; }, cols,
      // out here, as seen from B3: the world round where you'd be
      seen(mp, dt, t, d) { tick(mp, dt, t, false); comp.draw(t, d); },
      fx(dt, t) { tick(camera.position, dt, t, true); sound.fx(dt, t, S); },
      arrive() { stand(0, -2.4, 0, 0); },   // (debug, a reload: in front of the frame, the girl and the cart ahead)
    };
  }
  /** all of it, now (a reload out there, the debug hooks) */
  const finish = () => door.build();


  const door = makePaintingDoor(ctx, fl, {
    at: findCart(ctx.restr), size: SIZE, key: 'cart', near: 32, far: 75, seed: 3101, hud: 'of-cart',
    frame, pass: passShader,
    paint: (() => { let n = 0; return (p) => paintPane(p, n++ === 0 ? comp.rt.texture : null); })(),
    build(R0) { comp = makeComp(); return buildAll(R0); },
    hover: {
      painting: (near) => (near < 1.6 ? '<b>The painting</b><div class="k">Cold air coming off it, and the smell of wet grass. A wheel creaks somewhere in it. Walk into it</div>'
        : '<b>A painting</b><div class="k">A girl on a path, pulling a toy cart with a man’s face on it. No name on it</div>'),
      frame: (front) => (front ? '<b>The painting</b><div class="k">B3 through it, the yellow rooms. Walk back into it</div>'
        : '<b>The back of a canvas</b><div class="k">Hanging in the air over the grass</div>'),
    },
    leave() { if (G.held) letGo(false); sayEl.classList.remove('on'); },
  });

  // ----- the composed picture, for the painting seen from across the room: the meadow from a fixed camera in front of
  // the cart, framed as the picture is (the girl in front on the left, the cart behind her, the hat a quarter down) -----
  let comp = null;
  function makeComp() {
    const rt = new THREE.WebGLRenderTarget(512, 640, { type: THREE.HalfFloatType });
    const cam = new THREE.PerspectiveCamera(36, SIZE.w / SIZE.h, 0.1, 3000);
    // (blank till the meadow's built: its haze)
    const prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor('#8d9088', 1); renderer.clear(); renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
    let last = -1;
    return {
      rt, cam,
      // drawn now and then while you're near enough to see it (it's paint: it doesn't need every frame)
      draw(t, d) {
        if (!B.ready || (last >= 0 && t - last < (d < 8 ? 0.15 : 1.0))) return;
        last = t;
        cam.position.set(CP.x, CP.y, CP.z); cam.lookAt(CP.lx, CP.ly, CP.lz); cam.updateMatrixWorld();
        const L = fl.look, p0 = renderer.getRenderTarget();
        fl.hemi.intensity = L.hemi; fl.hemi.color.copy(L.sky); fl.hemi.groundColor.copy(L.ground);
        for (const [l, k] of L.lights) l.intensity = k;
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(fl.scene, cam); renderer.setRenderTarget(p0);
      },
    };
  }
  const CP = { x: -0.35, y: 1.3, z: -0.6, lx: 0.2, ly: 1.1, lz: -10 };   // the composing camera, and where it looks

  // ----- the girl and the cart: where they are, what they're doing -----
  const G = { s: TABLEAU.girl, x: 0, z: 0, yaw: 0, mode: 'wait', v: 0, phase: 0, stopT: 0, cool: 0, head: 0, nextHum: 0, look: null, seen: new Set(), lap: 0,
    goX: 0, goZ: 0, then: null, held: false, came: -1, carry: true };
  const C = { fx: 0, fz: 0, rx: 0, rz: 0, yaw: 0, v: 0, dist: 0 };   // the cart: its hitch, its rear axle, its heading, speed
  const S = { cart: new THREE.Vector3(), face: new THREE.Vector3(), speed: 0, box: null, boxAt: new THREE.Vector3(), surface: (x, z) => surface(x, z) };
  const facePos = S.face;
  // the things worth stopping by: [s along the path, where to look]
  const POI = [[SWING.x - 1.8, SWING.z], [-10, -60], [SHED.x - 2, SHED.z], [PRAM.x, PRAM.z], [0, 0.2]].map(([x, z]) => ({ s: nearest(x, z).s, x, z }));
  const P = new THREE.Vector3(), hand = new THREE.Vector3(), tmp = new THREE.Vector3(), o = { x: 0, z: 0, dx: 0, dz: 0 };
  const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // the girl and the cart as in the picture, or at s along the path with the cart behind her
  function place(s = TABLEAU.girl) {
    along(s, o); Object.assign(G, { s, x: o.x, z: o.z, yaw: Math.atan2(o.dx, o.dz), v: 0 });
    along(s - 1.35, o); C.fx = o.x; C.fz = o.z;
    along(s - 1.35 - WB, o); C.rx = o.x; C.rz = o.z;
    pose(0);
  }
  // the cart pulled toward (hx, hz) on a string L long: the hitch dragged after it, the rear axle after the hitch
  function tow(hx, hz, L, dt) {
    let dx = C.fx - hx, dz = C.fz - hz, d = Math.hypot(dx, dz);
    if (d > L) { C.fx = hx + dx / d * L; C.fz = hz + dz / d * L; }
    const rx0 = C.rx, rz0 = C.rz;
    dx = C.rx - C.fx; dz = C.rz - C.fz; d = Math.hypot(dx, dz) || 1;
    C.rx = C.fx + dx / d * WB; C.rz = C.fz + dz / d * WB;
    // round the trees and things, not through them
    for (const b of cols) {
      if (b === W.cartBox || b === W.girlBox) continue;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, r = Math.max(b.maxX - cx, b.maxZ - cz) + 0.55;
      if (r > 1.6) continue;
      const ex = C.rx - cx, ez = C.rz - cz, e = Math.hypot(ex, ez);
      if (e < r && e > 1e-4) { C.rx = cx + ex / e * r; C.rz = cz + ez / e * r; }
    }
    pose(Math.hypot(C.rx - rx0, C.rz - rz0), dt);
  }
  function pose(moved, dt = 1 / 60) {
    if (!W) return;
    const { cart, girl } = W;
    C.yaw = Math.atan2(C.fx - C.rx, C.fz - C.rz);
    const sy = Math.sin(C.yaw), cy = Math.cos(C.yaw), x = C.rx + sy * 1.22 * K, z = C.rz + cy * 1.22 * K;
    const hf = groundAt(x - sy * 0.3 * K, z - cy * 0.3 * K), hr = groundAt(C.rx, C.rz);
    cart.root.position.set(x, (hf + hr) / 2 - 0.02, z);
    cart.root.rotation.set(-Math.atan2(hf - hr, 0.92 * K), C.yaw, 0, 'YXZ');
    cart.roll(moved / K);
    C.v += (moved / Math.max(dt, 1e-3) - C.v) * Math.min(1, dt * 6); C.dist += moved;
    S.speed = C.v;
    // its collider: the body's box, turned
    const bx = x - sy * 0.58 * K, bz = z - cy * 0.58 * K, hx = (0.66 * Math.abs(cy) + 1.15 * Math.abs(sy)) * K, hz = (0.66 * Math.abs(sy) + 1.15 * Math.abs(cy)) * K;
    Object.assign(W.cartBox, { minX: bx - hx, maxX: bx + hx, minZ: bz - hz, maxZ: bz + hz });
    cart.root.updateMatrixWorld();
    S.cart.set(bx, 0.9 * K + hr, bz);
    facePos.set(0, FACE.cy - 0.25, FACE.cz + 0.45).applyMatrix4(cart.root.matrixWorld);
    // the girl
    girl.root.position.set(G.x, groundAt(G.x, G.z), G.z); girl.root.rotation.y = G.yaw;
    girl.root.updateMatrixWorld();
    Object.assign(W.girlBox, { minX: G.x - 0.17, maxX: G.x + 0.17, minZ: G.z - 0.17, maxZ: G.z + 0.17 });
  }
  // her walk: toward a heading at speed v, the dress swaying with her steps
  function stride(v, dt) {
    G.v += (v - G.v) * Math.min(1, dt * 2.5);
    G.phase += G.v * dt * 7.4;
    W.girl.walk.value = Math.min(1, G.v / 0.45); W.girl.phase.value = G.phase;
    W.girl.body.position.y = Math.abs(Math.sin(G.phase)) * 0.012 * W.girl.walk.value;
    return G.v * dt;
  }
  const turnTo = (a, rate, dt) => { G.yaw += Math.max(-rate * dt, Math.min(rate * dt, ang(a - G.yaw))); };
  function girlUpdate(dt, t, you, here) {
    const dYou = you ? Math.hypot(you.x - G.x, you.z - G.z) : 99;
    let look = null;   // what her head turns to
    if (G.mode === 'wait') {   // the picture: still, till you've come in
      stride(0, dt);
      if (here && G.came >= 0 && t - G.came > 3) G.mode = 'path';
      look = here ? you : null;
    } else if (G.mode === 'path') {
      // along the path; stopping for you, and by the things worth seeing if you're following
      const ds = stride(0.5, dt);
      G.s += ds; along(G.s, o);
      G.x = o.x; G.z = o.z; turnTo(Math.atan2(o.dx, o.dz), 2, dt);
      if (G.s > LOOP * (G.lap + 1)) { G.lap++; G.seen.clear(); }
      if (here && dYou < 3.6 && t > G.cool) { G.mode = 'stop'; G.stopT = t; }
      for (const p of POI) {
        const k = (G.s % LOOP) - p.s;
        if (k > 0 && k < 0.6 && !G.seen.has(p) && here && dYou < 18) { G.seen.add(p); G.mode = 'pause'; G.stopT = t; G.look = p; }
      }
    } else if (G.mode === 'stop' || G.mode === 'pause') {
      // stopped: she turns and watches you, no expression; then carries on
      stride(0, dt);
      const tgt = G.mode === 'stop' ? you : G.look;
      if (tgt) { const a = Math.atan2(tgt.x - G.x, tgt.z - G.z); if (Math.abs(ang(a - G.yaw)) > 0.9 || G.mode === 'stop') turnTo(a, 1.3, dt); }
      look = tgt;
      const over = G.mode === 'stop' ? (dYou > 6 || t - G.stopT > 5.5) : t - G.stopT > 5;
      if (over) {
        along(G.s, o); turnTo(Math.atan2(o.dx, o.dz), 2, dt);
        if (Math.abs(ang(Math.atan2(o.dx, o.dz) - G.yaw)) < 0.25) { G.mode = 'path'; G.cool = t + 12; }
      }
    } else if (G.mode === 'follow' || G.mode === 'go') {
      // off the path: after you (you've the string), or back to the cart and then to the path
      let tx = G.goX, tz = G.goZ;
      if (G.mode === 'follow' && you) { const sy = Math.sin(ctx.player.yaw), cy = Math.cos(ctx.player.yaw); tx = you.x + sy * 1.7 - cy * 1.3; tz = you.z + cy * 1.7 + sy * 1.3; }
      if (W.things.shedFloor(tx, tz) != null) { tx = G.x; tz = G.z; }   // (she won't go in the shed)
      const d = Math.hypot(tx - G.x, tz - G.z);
      if (d > 0.35) {
        const ds = stride(Math.min(G.mode === 'follow' ? 1.3 : 0.6, d * 0.8), dt);
        turnTo(Math.atan2(tx - G.x, tz - G.z), 2.5, dt);
        const k = Math.max(0, Math.cos(ang(Math.atan2(tx - G.x, tz - G.z) - G.yaw)));
        G.x += Math.sin(G.yaw) * ds * k; G.z += Math.cos(G.yaw) * ds * k;
      } else {
        stride(0, dt);
        if (G.mode === 'go') G.then?.();
        else if (you) turnTo(Math.atan2(you.x - G.x, you.z - G.z), 1.3, dt);
      }
      look = G.mode === 'follow' ? you : null;
    }
    // the head: toward what she's watching, as far as a neck turns
    const want = look ? Math.max(-1.1, Math.min(1.1, ang(Math.atan2(look.x - G.x, look.z - G.z) - G.yaw))) : 0;
    G.head += (want - G.head) * Math.min(1, dt * 2.2);
    W.girl.head.rotation.y = G.head;
    W.girl.head.rotation.x = 0.05 + (look ? 0 : 0.08);
    // humming, now and then, if you're near enough to hear
    if (here && dYou < 30 && t > G.nextHum && G.mode !== 'follow') { if (sound.hum(() => girlHead())) G.nextHum = t + 40 + Math.random() * 45; }
  }
  const girlHead = () => P.set(G.x, groundAt(G.x, G.z) + 1.05, G.z);
  // the string: given back, she goes to the cart's front, picks it up, and back to the path with it
  function letGo(toast = true) {
    G.held = false; G.carry = false;
    const sy = Math.sin(C.yaw), cy = Math.cos(C.yaw);
    G.mode = 'go'; G.goX = C.fx + sy * 1.2; G.goZ = C.fz + cy * 1.2;
    G.then = () => {
      G.carry = true;
      const n = nearest(G.x, G.z);
      along(n.s, o);
      G.goX = o.x; G.goZ = o.z;
      G.then = () => { G.s = n.s; G.mode = 'path'; G.cool = time.value + 8; G.then = null; };
    };
    if (toast) ctx.toast?.('You let go of the string. She comes for it');
  }
  function take() {
    if (!W) return;
    G.held = true; G.mode = 'follow'; G.then = null;
    ctx.toast?.('You take the string. It’s heavier than it looks');
  }

  // ----- each frame, for whichever camera's about to draw it -----
  let lastT = -1;
  const you = new THREE.Vector3();
  function tick(p, dt, t, here) {
    if (t === lastT) return;
    lastT = t; time.value = t;
    const { cart, old, things, land, girl, string } = W;
    you.copy(p);
    if (here && G.came < 0) G.came = t;
    girlUpdate(dt, t, you, here);
    // the string: in her hand, or yours
    if (G.held) {
      const sy = Math.sin(ctx.player.yaw), cy = Math.cos(ctx.player.yaw);
      hand.set(p.x - cy * 0.26 - sy * 0.1, groundAt(p.x, p.z) + 0.85, p.z + sy * 0.26 - cy * 0.1);
      tow(hand.x, hand.z, L_YOU, dt);
      // (no further than the shed's door)
      if (things.shedFloor(p.x, p.z) != null) { letGo(false); ctx.toast?.('The cart won’t go through the door. You let go of the string'); }
    } else if (!G.carry) {
      hand.set(C.fx, groundAt(C.fx, C.fz) + 0.02, C.fz); pose(0, dt);   // (the string on the ground: the cart where you left it)
    } else {
      girl.root.localToWorld(hand.copy(girl.hand));
      tow(hand.x, hand.z, L_GIRL, dt);
    }
    // the string from the hand to the ring, sagging as slack as it is
    tmp.copy(HITCH).applyMatrix4(cart.root.matrixWorld);
    const sp = string.geometry.attributes.position.array, d = hand.distanceTo(tmp), L = G.held ? L_YOU : L_GIRL, sag = Math.sqrt(Math.max(0, L * L - d * d)) * 0.5 + 0.02 * d;
    for (let i = 0; i < 20; i++) {
      const u = i / 19, x = hand.x + (tmp.x - hand.x) * u, z = hand.z + (tmp.z - hand.z) * u, y = hand.y + (tmp.y - hand.y) * u - sag * 4 * u * (1 - u);
      sp[i * 3] = x; sp[i * 3 + 1] = Math.max(y, groundAt(x, z) + 0.01); sp[i * 3 + 2] = z;
    }
    string.geometry.attributes.position.needsUpdate = true;
    // the face: alive, more so if you're in front of it; it murmurs if you're close, lifts its hat now and then
    const front = cart.update(dt, t, you);
    const dFace = you.distanceTo(facePos);
    if (here) {
      if (front > 0.6 && t > F.tip) { cart.tip(t); sound.tip(facePos); F.tip = t + 45 + Math.random() * 30; }
      else if (dFace < 14 && t > F.tip + 60) { cart.tip(t); sound.tip(facePos); F.tip = t + 70 + Math.random() * 60; }
      if (dFace < 7 && t > F.murmur && t > cart.S.speakUntil + 3) {
        F.murmur = t + 13 + Math.random() * 15;
        const sec = sound.voice(() => facePos, 2.2, false) || 2;
        cart.say(t, sec); cart.S.soft = true;
        if (dFace < 4.5) caption(MURMURS[Math.floor(Math.random() * MURMURS.length)], sec + 0.6, true);
      }
    }
    old.update(dt, you);
    things.update(dt, t);
    W.lampL[1] = 6 * (0.93 + 0.07 * Math.sin(t * 9.1) * Math.sin(t * 5.3));
    land.update(dt, t, here ? you : null);
    land.haze(Math.hypot(p.x - CEN.x, p.z - CEN.z));
    things.swingPivot.getWorldPosition(P);
    // the swing's ropes creak at the top of each swing
    if (here && Math.sign(things.swing.v) !== F.swingDir) { F.swingDir = Math.sign(things.swing.v); if (Math.hypot(you.x - SWING.x, you.z - SWING.z) < 25) sound.rope(P, Math.min(1, Math.abs(things.swing.a) * 2.5)); }
    // the music box (for its sound)
    S.box = things.box;
    if (things.box.playing) { things.box.wound -= dt; if (things.box.wound <= 0) { things.box.wound = 0; things.box.playing = false; } }
    if (t > sayUntil) sayEl.classList.remove('on');
  }
  const F = { tip: 6, murmur: 8, swingDir: 0 };

  // ----- standing and walking: the ground, the shed's floor, the meadow's edge in the haze -----
  const surface = (x, z) => (W?.things.shedFloor(x, z) != null ? 'board' : pathDist(x, z) < PATH_W ? 'path' : 'grass');
  fl.ground = (x, z) => W?.things.shedFloor(x, z) ?? groundAt(x, z);
  fl.pace = (x, z) => 1 - 0.65 * sstep(RADIUS - 18, RADIUS, Math.hypot(x - CEN.x, z - CEN.z));
  fl.bound = (p) => {
    const dx = p.x - CEN.x, dz = p.z - CEN.z, r = Math.hypot(dx, dz);
    if (r > RADIUS) { p.x = CEN.x + dx / r * RADIUS; p.z = CEN.z + dz / r * RADIUS; }
  };
  const inFrame = (x, z) => Math.abs(z) < 0.4 && Math.abs(x) < SIZE.w / 2 + 0.5;
  const standable = (x, z) => Math.hypot(x - CEN.x, z - CEN.z) < RADIUS - 1 && !inFrame(x, z) && !cols.some((b) => x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3);
  const stand = (x, z, yaw, pitch) => {
    door.pose(x, z, yaw, pitch);
    const y = fl.ground(x, z);
    ctx.player.fy = y;
    ctx.setCam({ x, y: EYE + y, z, yaw, pitch });
  };
  fl.unstick = () => { stand(0, -2.4, 0, 0); return true; };
  fl.save = () => ({ s: +(G.mode === 'wait' ? -1 : G.s).toFixed(2) });
  fl.restore = (s, p) => {
    finish();
    if (s && s.s >= 0) { place(s.s); G.mode = 'path'; G.came = 0; }
    if (standable(p.x, p.z)) stand(p.x, p.z, p.yaw, p.pitch);
    else stand(0, -2.4, p.yaw ?? 0, 0);
    return true;
  };

  // ----- what you can do -----
  let lastLine = -1;
  function speak(i) {
    if (!W) return false;
    const t = time.value;
    if (i == null) { do i = Math.floor(Math.random() * LINES.length); while (i === lastLine && LINES.length > 1); }
    lastLine = i;
    const line = LINES[i % LINES.length], sec = Math.max(2.2, line.length / 15);
    const got = sound?.voice(() => facePos, sec, true);
    W.cart.say(t, got || sec); W.cart.S.soft = false;
    caption(line, (got || sec) + 1.8);
    F.murmur = Math.max(F.murmur, t + 12);
    return true;
  }
  ctx.action('cart-face', {
    hover: () => '<b>The face</b><div class="k">Tired, watching you. Click: it says something</div>',
    click: () => { speak(); },
  });
  ctx.action('cart-string', {
    hover: () => (G.held ? '<b>The cart</b><div class="k">You have its string. Click to give it back</div>' : '<b>The cart</b><div class="k">Red felt, warm, breathing. Click to take its string</div>'),
    click: () => (G.held ? letGo() : take()),
  });
  ctx.action('cart-girl', {
    hover: () => '<b>The girl</b><div class="k">She looks at you without any expression at all</div>',
    click: () => { if (!W) return; sound?.whisper(() => girlHead()); caption('(she says something, too quietly to catch)', 2.6, true); if (G.mode === 'path') { G.mode = 'stop'; G.stopT = time.value; } },
  });
  ctx.action('cart-old', {
    hover: (h) => `<b>An old cart</b><div class="k">${['Left out here a long time. Its eyes follow you', 'On its side in the grass. It’s still looking at you', 'Its paint gone, its face still there. Watching',
      'Tipped over, a wheel in the air. Its eyes turn to you', 'A wheel gone. It doesn’t seem to mind. It watches you'][h.info ?? 0]}</div>`,
    click: (h) => { const c = OLD[h.info ?? 0]; if (!c?.M) return; P.set(0, FACE.cy, FACE.cz + 0.4).applyMatrix4(c.M); const p = P.clone(); sound?.voice(() => p, 1.4, false); caption(MURMURS[Math.floor(Math.random() * MURMURS.length)], 2.2, true); },
  });
  ctx.action('cart-thing', { hover: (h) => h.info || '' });
  function wind() {
    const b = W?.things.box; if (!b) return false;
    b.wound = Math.min(40, b.wound + 14); b.playing = true;
    sound?.wound(b);
    return true;
  }
  ctx.action('cart-box', {
    hover: () => (W?.things.box.playing ? '<b>The music box</b><div class="k">Playing. The little cart on it turns. Click to wind it more</div>' : '<b>A music box</b><div class="k">A little cart on its lid. Click to wind it</div>'),
    click: () => { wind(); },
  });
  function push() {
    if (!W) return false;
    // away from you: the seat swings along the tree's local z (a positive swing toward its -z)
    const seat = W.things.swingSeat(), dir = Math.sign(-((seat.x - ctx.player.x) * Math.sin(SWING.yaw) + (seat.z - ctx.player.z) * Math.cos(SWING.yaw))) || 1;
    W.things.push(dir); sound?.rope(seat, 1);
    return true;
  }
  ctx.action('cart-swing', { hover: () => '<b>The swing</b><div class="k">Still warm. Click to push it</div>', click: () => { push(); } });

  // ----- the map: the meadow, the path, the trees, the shed, the swing, the frame; the girl and the cart; you -----
  const MK = 2.6, MS = 640;
  function drawMap() {
    const c = document.createElement('canvas'); c.width = c.height = MS; const g = c.getContext('2d');
    const P2 = (x, z) => [MS / 2 + (x - CEN.x) * MK, MS / 2 + (z - CEN.z) * MK];
    g.fillStyle = 'rgba(110,112,70,.45)'; g.beginPath(); g.arc(MS / 2, MS / 2, RADIUS * MK, 0, 7); g.fill();
    g.strokeStyle = 'rgba(214,180,110,.9)'; g.lineWidth = PATH_W * 2 * MK; g.lineJoin = 'round'; g.beginPath();
    PTS.forEach(([x, z], i) => (i ? g.lineTo(...P2(x, z)) : g.moveTo(...P2(x, z)))); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(60,52,44,.8)'; for (const s of W.land.spots) { g.beginPath(); g.arc(...P2(s.x, s.z), 1.6 * s.s, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(140,136,120,.8)'; g.lineWidth = 2; g.beginPath(); WALL.forEach(([x, z], i) => (i ? g.lineTo(...P2(x, z)) : g.moveTo(...P2(x, z)))); g.stroke();
    g.save(); g.translate(...P2(SHED.x, SHED.z)); g.rotate(-SHED.yaw); g.fillStyle = 'rgba(120,96,70,.95)'; g.fillRect(-2.5 * MK, -2 * MK, 5 * MK, 4 * MK); g.restore();
    g.fillStyle = 'rgba(150,40,30,.8)'; for (const o2 of OLD) { g.beginPath(); g.arc(...P2(o2.x, o2.z), 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(80,70,60,.95)'; g.beginPath(); g.arc(...P2(SWING.x, SWING.z), 3.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(214,190,150,.95)'; g.fillRect(...P2(-0.5, -0.05), 1.0 * MK, 3);
    return c;
  }
  fl.map = () => {
    const c = mapCtx, MW = 440, MH = 330;
    c.clearRect(0, 0, MW, MH);
    c.fillStyle = 'rgba(120,122,110,.35)'; c.fillRect(0, 0, MW, MH);
    if (!W) return;
    mapImg ||= drawMap();
    const px = MS / 2 + (camera.position.x - CEN.x) * MK, pz = MS / 2 + (camera.position.z - CEN.z) * MK;
    c.drawImage(mapImg, px - MW / 2, pz - MH / 2 - 10, MW, MH, 0, 0, MW, MH);
    const at = (x, z) => [MW / 2 + (x - camera.position.x) * MK, MH / 2 + 10 + (z - camera.position.z) * MK];
    c.fillStyle = '#b8352a'; c.beginPath(); c.arc(...at(W.cart.root.position.x, W.cart.root.position.z), 4.5, 0, 7); c.fill();
    c.fillStyle = '#efe9dc'; c.beginPath(); c.arc(...at(G.x, G.z), 3.2, 0, 7); c.fill();
    c.save(); c.translate(MW / 2, MH / 2 + 10); c.rotate(-ctx.player.yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
    c.font = '600 18px system-ui'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('the meadow', 16, 30);
  };

  // ----- getting you there, for the tests and for looking -----
  const go = (x = 0, z = -2.4, yaw = 0, pitch = 0) => { if (!door.go(x, z, yaw, pitch)) return false; finish(); stand(x, z, yaw, pitch); return true; };
  // [where you stand, x, z; what you look at, x, z]
  const SPOTS = {
    shed: () => [SHED.x - 5.2, SHED.z + 0.4, SHED.x, SHED.z],
    box: () => { const a = W.things.shedAt(-1.25, 0.25), b = W.things.shedAt(-2.11, 0.05); return [a.x, a.z, b.x, b.z]; },
    swing: () => [SWING.x + 3.0, SWING.z - 6.0, SWING.x - 1.75, SWING.z],
    grove: () => [-5, -49, -10, -60],
    pram: () => [PRAM.x + 3.6, PRAM.z + 2.6, PRAM.x, PRAM.z],
  };
  ctx.cart = {
    fl, st: door.st, F: door.F, at: door.at, G, C, B, get built() { return fl.built; }, get ready() { return B.ready; }, build: () => finish(),
    get world() { return W; }, lines: LINES,
    go, painting: door.painting, into: door.into,
    /** in front of the cart's face, d m off, side (−1 to 1) round it, pitch */
    face(d = 2.2, side = 0, pitch = 0.05) {
      if (!go()) return false;
      const a = C.yaw + side, x = facePos.x + Math.sin(a) * d, z = facePos.z + Math.cos(a) * d;
      stand(x, z, a, pitch); return true;
    },
    girl(s = TABLEAU.girl, mode = 'path') { finish(); place(s); G.mode = mode; G.held = false; return true; },
    say: (i) => speak(i),
    hold(on = true) { finish(); if (on && !G.held) take(); else if (!on && G.held) letGo(false); return G.held; },
    wind, push,
    /** by one of the set pieces */
    by(what, d = 0, yaw = null, pitch = 0) {
      if (!go()) return false;
      const [x, z, lx, lz] = SPOTS[what](), y = yaw ?? Math.atan2(x - lx, z - lz);
      stand(x + Math.sin(y) * d, z + Math.cos(y) * d, y, pitch); return true;
    },
  };
  addFloor(fl);
}
