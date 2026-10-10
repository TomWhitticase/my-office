// THE EDGE OF THE WORLD: the sky is a set. Hold the helicopter on outward against the edge of the city until it gives
// up (helicopter.js, S.free), then keep going west, over the low pass in the mountains and out across open sea, and the
// sky turns out to be a wall: a dome 5.2 km across, painted with the sky as seen from the middle of the city, so from
// town (and most of the way out) it's the sky; only up close do its panels and seams show, and its clouds stop moving
// with you. You can't fly through it (a hollow knock). Due west, a plain concrete stair rises out of the water along it
// from a little pier to a door in the sky marked EXIT. Land on the pier, get out (F), climb up and open the door: behind
// it is what's behind the sky (world-edge-backstage.js), and you walk straight in.
// Nothing here is built until you're first let out past the city's edge, and nothing is shown or runs unless you're out
// there (or behind it). It's in the office's scene, like the roof (you're still on the roof floor while you fly).
// Debug: ctx.heli.edge.place(d, h) puts the helicopter d m out from the wall by the stairs, h m up, facing it, flying;
// .land() sets it down on the pier; .door(true) opens the door; .backstage (once built) stages what's behind it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { damp, makeCanvas, mat, mergedBoxes, rng, sstep } from '../util.js';
import { makeSound } from './world-edge-sound.js';
import { installBackstage } from './world-edge-backstage.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { heli, city, roof, world, scene, camera, skyU, sun, hemi, hitBox } = ctx;
  const S = heli.S, ROOF_Y = roof.y;
  // The dome: centred on the city at sea level. Due west of the centre (x = -R, z = 0) is the door; locally there, u = z
  // runs along the wall and w = x + R is how far you are in from it.
  const R = 5200, SEA = city.GROUND + 0.4, SQ = 2975;
  const RISE = 0.175, TREAD = 0.28, STEPS = 34, PT = SEA + 0.9, LT = PT + (STEPS + 1) * RISE;   // the pier's top and the landing's
  const LAND = { u0: -0.8, u1: 0.8 }, STAIR = { u0: LAND.u0 - STEPS * TREAD, w: 1.2 }, PIER = { u0: STAIR.u0 - 12, u1: STAIR.u0, w: 10 };
  const DOOR = { w: 0.92, h: 2.07 };   // the opening; the leaf's a centimetre in all round
  const toU = (x, z) => [z, x + R];
  const sound = makeSound(ctx);

  // ----- out there, for the helicopter -----
  const inSquare = (x, z) => x > -SQ && x < 3045 && z > -SQ && z < 3045;   // the city's streets
  const hitAt = new THREE.Vector3(), C = new THREE.Vector3(0, SEA, 0);
  let knockAt = 0;
  heli.far = {
    ground: (x, z) => Math.max(inSquare(x, z) ? -Infinity : SEA, city.mtnY(x, z)),
    wet: (x, z) => !inSquare(x, z),
    // Keep the rotor 5 m inside the dome; bounce gently off it. Returns how hard you hit it.
    wall(p, v) {
      hitAt.copy(p).setY(p.y + 1.5).sub(C);
      const d = hitAt.length(), lim = R - 5;
      if (d <= lim) return 0;
      hitAt.divideScalar(d);
      p.addScaledVector(hitAt, lim - d);
      const vn = v.dot(hitAt);
      if (vn <= 0) return 0;
      v.addScaledVector(hitAt, -vn * 1.25);
      const now = performance.now();
      if (vn > 0.5 && now - knockAt > 600) { knockAt = now; sound.knock(hitAt.clone().multiplyScalar(R).add(C), vn); }
      return vn;
    },
  };

  // ----- on foot: the pier, the stairs, the landing and (once it's open) the doorway -----
  const RECTS = [
    [PIER.u0 + 0.4, PIER.u1 - 0.1, 0.45, PIER.w - 0.4],   // u0, u1, w0, w1
    [STAIR.u0 - 0.3, LAND.u0 + 0.3, 0.45, STAIR.w - 0.35],
    [LAND.u0 - 0.1, LAND.u1 - 0.3, 0.45, 1.6 - 0.35],
  ];
  const DOORWAY = [-DOOR.w / 2 + 0.22, DOOR.w / 2 - 0.22, -0.6, 0.6];   // (you're through, behind the sky, past w = 0.01)
  const E = { built: false, shown: false, open: 0, want: 0, dim: 1, top: false, G: null, hinge: null, leaf: null, back: null };
  const walkable = (u, w) => RECTS.some(([a, b, c, d]) => u >= a && u <= b && w >= c && w <= d)
    || (E.open > 0.6 && u >= DOORWAY[0] && u <= DOORWAY[1] && w >= DOORWAY[2] && w <= DOORWAY[3]);
  const groundAt = (x, z) => {
    const [u] = toU(x, z);
    if (u < STAIR.u0) return PT;
    if (u < LAND.u0) return PT + Math.min(STEPS, Math.floor((u - STAIR.u0) / TREAD) + 1) * RISE;
    return LT;
  };
  const walk = {
    label: 'Out on the pier', cols: [], ground: groundAt,
    bound(p, o) {
      const [u, w] = toU(p.x, p.z), [lu, lw] = toU(o.last.x, o.last.z);
      let hit = false;
      if (!walkable(u, w)) {
        hit = true;
        if (walkable(u, lw)) p.x = o.last.x;
        else if (walkable(lu, w)) p.z = o.last.z;
        else { p.x = o.last.x; p.z = o.last.z; }
      }
      if (p === ctx.player) {
        o.last.x = p.x; o.last.z = p.z;
        if (hit && !o.edge) {
          if (w < 0.6) { ctx.toast('It’s a wall'); sound.knock({ x: -R, y: groundAt(p.x, p.z) + 1.2, z: p.z }, 0); }
          else ctx.toast('You’d get wet');
        }
        o.edge = hit;
      }
    },
  };
  const pier = { x: -R + (PIER.w - 0.3) / 2, z: (PIER.u0 + PIER.u1) / 2, w: PIER.w + 0.3, d: PIER.u1 - PIER.u0, top: PT, walk };
  heli.addSolid(pier);

  // ----- the sky wall's paint: the sky's own shader, looking out from below the city -----
  // From afar (and from town) it's the sky as you'd see it from where you are; as you come within a couple of kilometres of
  // it (`near`, the whole dome at once) it becomes the painting: the sky as seen from a point far under the city's middle,
  // fixed on the wall, bluer at its foot than any real horizon. Below the horizon (seen from up high, far off) it's the haze
  // the sea would fade into. Panels and seams show only up close; `dim` is the studio's lights.
  const U = { near: { value: 0 }, eye0: { value: new THREE.Vector3(0, SEA - 2000, 0) }, fogC: { value: scene.fog.color }, dim: { value: 1 }, Rw: { value: R },
    sea: { value: SEA }, hole: { value: new THREE.Vector4(0, LT - SEA + DOOR.h / 2, DOOR.w / 2, DOOR.h / 2) } };
  function paintMaterial(cut, paintM) {
    let f = ctx.sky.material.fragmentShader;
    const swap = (a, b) => { if (!f.includes(a)) throw new Error(`world-edge: the sky's shader has changed (${a})`); f = f.replace(a, b); };
    swap('varying vec3 vDir;', 'varying vec3 vW, vP; uniform vec3 eye0, fogC; uniform float near, dim, Rw, sea, cut; uniform vec4 hole;');
    swap('vec3 d = normalize(vDir);', `
        float dist = distance(vW, cameraPosition);
        float wu = atan(vP.z, -vP.x) * Rw, wy = vP.y - sea;   // metres along the wall from due west, and up it
        if (cut > 0.5 && abs(wu - hole.x) < hole.z && abs(wy - hole.y) < hole.w) discard;   // the doorway
        vec3 d = normalize(vP - mix(cameraPosition, eye0, near));`);
    swap('mix(hor, ground, pow(min(-h * 4.0, 1.0), 0.6))', 'mix(hor, fogC, smoothstep(0.0, 0.03, -h))');
    swap('smoothstep(1.0 - cover, 1.28 - cover, fbm(uv))', 'smoothstep(1.0 - cover + 0.14 * near, 1.28 - cover + 0.1 * near, fbm(uv))');   // fewer, thinner clouds painted on
    swap('gl_FragColor = vec4(col, 1.0);', `
        // Panels 6 m by 3 m, each a shade off the next, fine seams between them.
        vec2 pg = vec2(wu / 6.0, wy / 3.0), fw = max(fwidth(pg), vec2(1e-6)), off = abs(fract(pg + 0.5) - 0.5), lw = vec2(0.022 / 6.0, 0.022 / 3.0);
        vec2 ln = (1.0 - smoothstep(lw * 0.5, lw * 0.5 + fw, off)) * min(vec2(1.0), lw / fw);
        col *= 1.0 - 0.32 * max(ln.x, ln.y) * smoothstep(600.0, 40.0, dist);
        col *= 1.0 + (h2(floor(pg) + 7.0) - 0.5) * 0.04 * smoothstep(1500.0, 150.0, dist);
        col *= dim;
        gl_FragColor = vec4(col, 1.0);`);
    return new THREE.ShaderMaterial({
      uniforms: { ...skyU, ...U, cut: { value: cut }, paintM: { value: paintM } }, side: THREE.DoubleSide, fragmentShader: f,
      vertexShader: `uniform mat4 paintM; varying vec3 vW, vP;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vP = (paintM * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    });
  }

  // ----- building it, the first time you're out -----
  let seaM = null, env = null, door = null;
  const setEnv0 = city.setEnv;
  city.setEnv = (tex) => { setEnv0(tex); env = tex; if (seaM) { if (!seaM.envMap) seaM.needsUpdate = true; seaM.envMap = tex; } };
  function build() {
    // three gives every object a uuid from Math.random: build with our own, so the harness's draws don't shift.
    const random = Math.random;
    Math.random = rng(5200);
    try { buildIt(); } finally { Math.random = random; }
    E.built = true;
  }
  function buildIt() {
    const G = E.G = new THREE.Group(), Rn = Math.random;
    G.visible = false; world.add(G);

    // The dome: rows packed toward the water (where you see it up close), a column due west, through the door.
    const SEG = 512, ROWS = 48, pos = [], idx = [];
    for (let j = 0; j <= ROWS; j++) {
      const el = -0.004 + Math.pow(j / ROWS, 2.2) * (Math.PI / 2 + 0.004);
      for (let i = 0; i <= SEG; i++) {
        const ph = i / SEG * Math.PI * 2;
        pos.push(-R * Math.cos(el) * Math.cos(ph), SEA + R * Math.sin(el), R * Math.cos(el) * Math.sin(ph));
        if (i && j) { const a = j * (SEG + 1) + i, b = a - 1, c = a - SEG - 1, d = c - 1; idx.push(d, b, a, d, a, c); }
      }
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); dg.setIndex(idx);
    dg.boundingSphere = new THREE.Sphere(C.clone(), R + 10);
    const dome = new THREE.Mesh(dg, paintMaterial(1, new THREE.Matrix4()));
    dome.frustumCulled = false; dome.layers.set(1); G.add(dome);   // layer 1: no ambient occlusion on the sky (post.js)

    // The sea: from under the mountains' outer slopes to the foot of the wall, small waves rolling on a normal map.
    const N = 256, nc = makeCanvas(N, N), img = nc.ctx.createImageData(N, N), hgt = new Float32Array(N * N);
    const waves = Array.from({ length: 7 }, (_, k) => [1 + Math.floor(Rn() * (3 + k * 2)), Math.floor(Rn() * (3 + k * 2)) - k, Rn() * 6.3, 1 / (1 + k * 0.8)]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
      hgt[y * N + x] = waves.reduce((s, [a, b, p, A]) => s + A * Math.sin(Math.PI * 2 * (a * x + b * y) / N + p), 0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N], dy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];
      const k = (y * N + x) * 4, l = Math.hypot(dx * 2, dy * 2, 1);
      img.data[k] = (-dx * 2 / l * 0.5 + 0.5) * 255; img.data[k + 1] = (-dy * 2 / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    nc.ctx.putImageData(img, 0, 0);
    const nt = nc.tex; nt.colorSpace = THREE.NoColorSpace; nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(R * 2 / 7, R * 2 / 7); nt.needsUpdate = true;
    seaM = new THREE.MeshStandardMaterial({ color: '#1b3444', roughness: 0.22, metalness: 0.8, envMapIntensity: 1.1, normalMap: nt, normalScale: new THREE.Vector2(0.18, 0.18) });
    if (env) seaM.envMap = env;
    const sg = new THREE.RingGeometry(4000, R + 0.6, 1024, 6); sg.rotateX(-Math.PI / 2);   // ending just behind the wall (AO sees through it)
    const seaMesh = new THREE.Mesh(sg, seaM); seaMesh.position.y = SEA; seaMesh.receiveShadow = true; G.add(seaMesh);
    E.waves = nt;

    // The pier, the stairs and the landing: plain poured concrete, each from under the water, set into the wall.
    const conc = [], x = (w) => -R + w;
    const slab = (u0, u1, w0, w1, y0, y1, c) => conc.push([w1 - w0, y1 - y0, u1 - u0, x((w0 + w1) / 2), (y0 + y1) / 2, (u0 + u1) / 2, c]);
    const tone = () => { const v = 0.39 + Rn() * 0.04; return new THREE.Color(v, v * 0.985, v * 0.95); };
    slab(PIER.u0, PIER.u1, -0.3, PIER.w, SEA - 3, PT, tone());
    for (let k = 1; k <= STEPS; k++) slab(STAIR.u0 + (k - 1) * TREAD, STAIR.u0 + k * TREAD, -0.3, STAIR.w, SEA - 2, PT + k * RISE, tone());
    slab(LAND.u0, LAND.u1, -0.3, 1.6, SEA - 2, LT, tone());
    // a weathered tide line along the foot, and two iron bollards on the pier's edge
    slab(PIER.u0 - 0.01, LAND.u1 + 0.01, -0.31, 0.02, SEA - 0.2, SEA + 0.35, new THREE.Color(0.34, 0.36, 0.33));
    const concrete = mergedBoxes(conc, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }));
    G.add(concrete);
    const iron = mat('#2e3134', { roughness: 0.6, metalness: 0.5 }), steel = mat('#8d9195', { roughness: 0.4, metalness: 0.7 });
    const bits = [];
    for (const u of [PIER.u0 + 2, PIER.u1 - 2]) {
      bits.push(new THREE.CylinderGeometry(0.16, 0.2, 0.45, 14).translate(x(PIER.w - 0.6), PT + 0.225, u),
        new THREE.CylinderGeometry(0.24, 0.24, 0.07, 14).translate(x(PIER.w - 0.6), PT + 0.48, u));
    }
    const bollards = new THREE.Mesh(mergeGeometries(bits), iron); bollards.castShadow = bollards.receiveShadow = true; G.add(bollards);

    // The handrail: a thin steel tube on posts up the open side of the stairs and round the landing.
    const rail = [], tube = (a, b, r = 0.022) => {
      const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), 8);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); rail.push(g);
    };
    const RW = STAIR.w - 0.08, LW = 1.6 - 0.08, H = 0.92, at = (u) => groundAt(x(0.5), u);
    const p0 = new THREE.Vector3(x(RW), PT + RISE + H, STAIR.u0 + TREAD / 2), p1 = new THREE.Vector3(x(RW), LT + H, LAND.u0);
    tube(p0, p1); tube(p1, new THREE.Vector3(x(LW), LT + H, LAND.u0 + 0.3)); tube(new THREE.Vector3(x(LW), LT + H, LAND.u0 + 0.3), new THREE.Vector3(x(LW), LT + H, LAND.u1 - 0.08));
    tube(new THREE.Vector3(x(LW), LT + H, LAND.u1 - 0.08), new THREE.Vector3(x(-0.2), LT + H, LAND.u1 - 0.08));
    for (let u = STAIR.u0 + TREAD / 2; u < LAND.u0; u += TREAD * 5) tube(new THREE.Vector3(x(RW), at(u), u), new THREE.Vector3(x(RW), at(u) + H + 0.05, u), 0.02);
    for (const [w, u] of [[RW, LAND.u0 - 0.05], [LW, LAND.u0 + 0.3], [LW, LAND.u1 - 0.08], [0.6, LAND.u1 - 0.08]])
      tube(new THREE.Vector3(x(w), LT, u), new THREE.Vector3(x(w), LT + H + 0.03, u), 0.02);
    for (let u = STAIR.u0 + TREAD / 2; u < LAND.u0; u += TREAD * 5)   // a mid rail
      tube(new THREE.Vector3(x(RW), at(u) + H * 0.5, u), new THREE.Vector3(x(RW), at(Math.min(u + TREAD * 5, LAND.u0 - 0.1)) + H * 0.5, Math.min(u + TREAD * 5, LAND.u0 - 0.1)), 0.012);
    const rails = new THREE.Mesh(mergeGeometries(rail), steel); rails.castShadow = true; G.add(rails);

    // The door, painted with the wall's sky where it would be, hung on the stairs' side and opening away from you. Open,
    // it's the copy behind the sky you see (world-edge-backstage.js): this one's only ever seen shut.
    const LW2 = DOOR.w - 0.02, LH = DOOR.h - 0.02, hinge = E.hinge = new THREE.Group();
    hinge.position.set(-R + 0.018, LT + 0.01 + LH / 2, -LW2 / 2); G.add(hinge);
    const edgeM = mat('#6f7378', { roughness: 0.7 });
    const leafM = paintMaterial(0, new THREE.Matrix4());
    const leaf = E.leaf = new THREE.Mesh(new THREE.BoxGeometry(0.045, LH, LW2), [leafM, edgeM, edgeM, edgeM, edgeM, edgeM]);
    leaf.position.set(-0.0225, 0, LW2 / 2); hinge.add(leaf);
    G.updateMatrixWorld(true);
    leafM.uniforms.paintM.value.copy(leaf.matrixWorld);   // the paint stays where it was when the door's shut
    // the sign: EXIT, white on black, near the top; a plain round knob
    const sc = makeCanvas(256, 96), c2 = sc.ctx;
    c2.fillStyle = '#121314'; c2.fillRect(0, 0, 256, 96); c2.fillStyle = '#f3f1ea'; c2.font = '600 62px Helvetica, Arial, sans-serif';
    c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('EXIT', 128, 52); sc.tex.needsUpdate = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshStandardMaterial({ map: sc.tex, roughness: 0.5 }));
    sign.rotation.y = Math.PI / 2; sign.position.set(0.0265, LH / 2 - 0.28, 0); leaf.add(sign);   // 4 mm proud: the paint's positions are float32, 5 km out
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), steel); knob.scale.set(0.7, 1, 1);
    knob.position.set(0.045, -LH / 2 + 1.0, LW2 / 2 - 0.08); leaf.add(knob);
    door = hitBox(leaf, 0.12, LH, LW2, 0.03, 0, 0, { action: 'edge-door', reach: 2.6 });
    roof.hits.push(door);
    Object.assign(E, { leafM, edgeM, steel, signTex: sc.tex, LW2, LH });
    // What's behind it, built now too (its own scene: nothing of it is drawn or runs until you look through the door).
    E.back = installBackstage(ctx, edge);
    heli.edge.backstage = E.back.debug;
  }

  // ----- the door: click to open it, again to shut it (from either side) -----
  ctx.action('edge-door', {
    hover: () => `<b>EXIT</b><div class="k">Click to ${E.want ? 'shut' : 'open'} it</div>`,
    click: () => { openDoor(!E.want); return true; },
  });
  function openDoor(on = true) {
    if (!!E.want === on) return;
    E.want = on ? 1 : 0;
    sound.creak(new THREE.Vector3(-R, LT + 1, 0));
  }

  // ----- each frame -----
  const camW = new THREE.Vector3();
  function show(on) {
    if (on && !E.built) build();
    E.shown = on; E.G.visible = on; ctx.sky.visible = !on;   // the dome covers the whole sky (and costs as much)
    camera.far = on ? 12000 : 6000; camera.updateProjectionMatrix();   // the whole dome, from anywhere inside it
    if (!on) { sound.stop(); E.dim = 1; U.dim.value = 1; }
  }
  ctx.onFrame((dt, t) => {
    const back = E.back?.here(), on = S.free && (roof.on || back);   // back: behind the sky (or just through its exit)
    if (on !== E.shown && (on || E.built)) show(on);
    if (!on) return;
    camera.getWorldPosition(camW);
    let hear = 1;
    if (back) { const d = E.back.toOffice(camW); hear = E.open * sstep(12, 1, d) * 0.6; }   // through the open door, from behind
    const [u] = toU(camW.x, camW.z), toWall = R - camW.distanceTo(C);
    E.waves.offset.set(t * 0.004, t * 0.0027);
    U.near.value = sstep(1800, 250, toWall);
    // The door swings open over a couple of seconds, slowing; the doorway's walkable once it's well open.
    E.open = damp(E.open, E.want, 1.4, dt);
    E.hinge.rotation.y = -1.75 * sstep(0, 1, E.open);
    E.leaf.visible = E.open < 0.002;   // open, it's the one behind the sky you see, through the doorway
    E.hinge.updateMatrixWorld();
    // At the top of the stairs, the lights go down a little (and stay down while you're up there, or behind).
    const P = ctx.player, onFoot = S.out && !S.aboard;
    E.top = !!back || (onFoot && roof.on && toU(P.x, P.z)[0] > LAND.u0 - 0.6 && P.fy + ROOF_Y > LT - 0.5);
    E.dim = damp(E.dim, E.top ? 0.62 : 1, 0.5, dt); U.dim.value = E.dim;
    sound.update(sstep(1500, 30, toWall) * hear, sstep(200, 5, camW.y - SEA) * (Math.abs(u) < 400 ? 1 : 0.5));
  }, 52);
  // The sun and sky light dimmed with the wall (after the sky's set them, order 50).
  ctx.onFrame(() => { if (E.shown && E.dim < 0.999) { sun.intensity *= E.dim; hemi.intensity *= E.dim; } }, 53);

  // ----- debug and test hooks -----
  const edge = heli.edge = {
    E, sound, paintMaterial, DOOR, U,
    // The doorway's frame in the world: its sill's middle, +z the way in (west), +y up (see systems/portal.js).
    frame: new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(-R + 0.009, LT, 0),
    openDoor,
    // The helicopter d m in from the wall by the pier, h m up, facing the wall, hovering (you must be aboard).
    place(d = 300, h = 60) {
      Object.assign(S, { free: true, landed: false, engine: true, rpm: 1, auto: null, pitch: 0, roll: 0, yawRate: 0, yaw: Math.PI / 2 });
      S.pos.set(-R + d, SEA + h, (PIER.u0 + PIER.u1) / 2); S.vel.set(0, 0, 0);
      heli.place(0);
      return true;
    },
    // Set down on the pier, engine off, ready to get out (F).
    land() {
      Object.assign(S, { free: true, landed: true, engine: false, rpm: 0, auto: null, pitch: 0, roll: 0, yawRate: 0, yaw: Math.PI / 2, flown: false });
      S.pos.set(-R + 6.8, PT, (PIER.u0 + PIER.u1) / 2 + 1); S.vel.set(0, 0, 0);
      heli.place(0);
      return true;
    },
    door(open = true) { openDoor(open); E.open = E.want; },
    R, SEA, PT, LT, PIER, STAIR, LAND,
  };
}
