// The grid's ending (floors/grid.js): once the black hole has taken everything (grid-hole.js), it takes you. You're
// dragged in, faster and faster, down the funnel and into the throat, turning; your view tunnels, stretches and ripples
// into streaks of colour and light, the grid smeared past you, then (the floors changing under the tunnel, where nothing
// of either shows) the sky and the city smeared past, and you burst out in a blinding flash a kilometre over the office
// tower, in the office's own scene. Then you fall, for real: gravity and air (a skydiver's terminal speed), the wind
// rising, the city and the tower coming up at you; you can look round, and lean a little (WASD) to steer, never off the
// roof. You land on it with a heavy thud, the view dipping and shaking, and you're standing on the roof terrace, unhurt.
// The warp is one full-screen pass at the end of both floors' composers (the grid's and the office's), off but while this
// runs. Q's menu and Backspace work throughout: Backspace twice before the burst puts you back by the doorway, the hole
// healed; after it, straight down onto the roof. A reload mid-fall stands you on the roof, where you'd have landed.
// window.__office.grid.ending(sec) runs it from the moment you're taken (sec seconds on).

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { angDiff, clamp, EYE, rng, ROOM, sstep } from '../util.js';

// ----- the warp: the view tunnelling, stretching and rippling into streaks of colour and light; the flash -----
// amt: how far into the tunnel (from the middle out); scene: how much of what's in view is smeared round it; flash: the
// burst's white. At the floors' switch amt is 1 and scene 0, so both composers draw exactly the same thing.
let WM = null;
export function warpMaterial() {
  if (WM) return WM;
  const WU = { tDiffuse: { value: null }, amt: { value: 0 }, flash: { value: 0 }, t: { value: 0 }, scene: { value: 1 }, aspect: { value: 1 }, twist: { value: 0 } };
  WM = new THREE.ShaderMaterial({
    uniforms: WU, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float amt, flash, t, scene, aspect, twist; varying vec2 vUv;
      float h1(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
        float r = length(p), a = atan(p.y, p.x);
        // the view: twisted round the middle, rippling, stretched in toward it (a zoom smear)
        float tw = twist * amt * (1.0 - smoothstep(0.0, 0.9, r)), ca = cos(tw), sa = sin(tw);
        vec2 q = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
        q *= 1.0 + amt * (0.04 * sin(r * 30.0 - t * 11.0) + 0.3 * amt * r);
        vec2 uv = q / vec2(aspect, 1.0) + 0.5;
        vec3 view = vec3(0.0);
        for (int i = 0; i < 10; i++) view += texture2D(tDiffuse, 0.5 + (uv - 0.5) * (1.0 - amt * 0.4 * float(i) / 9.0)).rgb;
        view /= 10.0;
        // the tunnel: lanes of light rushing past, colours wheeling; what was in view wrapped round it in smears
        float z = 0.35 / (r + 0.03) + t * 7.0, ang = fract(a / 6.2832 + tw * 0.08 + 0.04 * t), id = floor(ang * 96.0), sp = h1(id * 13.7);
        float seg = fract(z * 0.22 * (0.6 + sp) + h1(id) * 7.0);
        float streak = smoothstep(0.0, 0.04, seg) * smoothstep(0.7, 0.15, seg) * step(0.5, h1(id * 3.1)) * (1.0 - abs(fract(ang * 96.0) - 0.5) * 2.0);
        vec3 hue = 0.5 + 0.5 * cos(6.2832 * (sp + vec3(0.0, 0.33, 0.67)) + z * 0.04);
        vec3 frag = texture2D(tDiffuse, vec2(fract(ang * 2.0 + 0.1 * sin(z * 0.2)), fract(z * 0.035))).rgb;
        vec3 tunnel = (frag * scene * 1.1 + hue * 0.25) * (0.35 + 1.4 * streak) + hue * streak * 1.3;
        tunnel = tunnel * smoothstep(0.0, 0.3, r) + vec3(1.0, 0.96, 0.9) * exp(-r * 8.0) * 1.4;   // the light at the end of it
        float m = 1.0 - smoothstep(amt * 1.3 - 0.2, amt * 1.3, r);   // from the middle out
        vec3 c = mix(view, tunnel, clamp(m * amt * 1.2, 0.0, 1.0));
        c = mix(c, vec3(1.0, 0.97, 0.92), clamp(flash, 0.0, 1.0)) + vec3(1.0, 0.9, 0.7) * flash * exp(-r * 3.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return WM;
}

// Switched on, the warp's the last pass of a composer, drawing to the screen, and the colour grade before it draws into a
// render target instead: two programs nothing else uses; and the GPU's own work for a program it's first asked to draw
// takes a second or two, during which a frame that needs it waits. So both are got ready (with the burst's) long before
// any ending, in the background (makeEnding's warm), and drawn once, a pixel of each, unseen.
function prewarm(ctx) {
  const r = ctx.renderer, rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }), rt2 = rt.clone(), was = r.getRenderTarget();
  // (as passes, so drawn just as a composer draws them: their full-screen triangle, into what they'd draw into)
  if (ctx.grade) new ShaderPass(ctx.grade.material).render(r, rt2, rt);
  const p = new ShaderPass(warpMaterial());
  p.renderToScreen = true;
  r.setScissorTest(true); r.setScissor(0, 0, 1, 1);
  p.render(r, null, rt);
  r.setScissorTest(false); r.setRenderTarget(was);
  rt.dispose(); rt2.dispose();
}

const WARP = 1.6, BURST = 2.6, HIGH = 1000, G = 9.81, VT = 66;   // the switch and the burst, seconds into the warp; the drop

/** @param {any} ctx @param {any} grid the floor @param {any} W its world (grid-world.js) @param {any} hole grid-hole.js's @param {any} sound */
export function makeEnding(ctx, grid, W, hole, sound) {
  const { camera, mine } = ctx;
  const roofF = () => ctx.FLOORS.find((F) => F.n === ctx.ROOF);

  // ----- the warp (warpMaterial, below) -----
  const warpM = warpMaterial(), WU = warpM.uniforms;
  const passG = new ShaderPass(warpM), passO = new ShaderPass(warpM);
  passG.enabled = passO.enabled = false;
  function passes(on) {   // (onto the floors' composers the first time: off, they cost nothing)
    if (grid.composer && !grid.composer.passes.includes(passG)) grid.composer.addPass(passG);
    if (ctx.composer && !ctx.composer.passes.includes(passO)) ctx.composer.addPass(passO);
    passG.enabled = on && ctx.away === grid; passO.enabled = on && ctx.away !== grid;
  }

  // ----- the burst: a ball of light swelling and fading round where you came out, sparks flying from it -----
  const burst = new THREE.Group();
  const glowT = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,240,200,.85)'); g.addColorStop(0.6, 'rgba(255,190,120,.25)'); g.addColorStop(1, 'rgba(255,160,80,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  const NS = 240, sparkV = [], sparkG = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NS * 3), 3));
  for (let i = 0; i < NS; i++) { const v = new THREE.Vector3().randomDirection(); v.multiplyScalar(40 + Math.random() * 110); sparkV.push(v); }
  const sparks = new THREE.Points(sparkG, new THREE.PointsMaterial({ map: glowT, size: 3.5, color: '#ffe2b0', blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  sparks.frustumCulled = false;
  burst.add(ball, sparks);
  burst.traverse((o) => o.layers.set(1));   // (transparent: off the AO's layer, as systems/post.js keeps them)
  function burstFx(k) {   // k: seconds since the burst
    burst.visible = k < 4;
    if (!burst.visible) return;
    ball.scale.setScalar(20 + 380 * sstep(0, 1.6, k)); ball.material.opacity = Math.max(0, 1 - sstep(0.2, 3.5, k));
    const P = sparkG.attributes.position;
    for (let i = 0; i < NS; i++) { const v = sparkV[i], d = 1 - Math.exp(-k * 1.2); P.setXYZ(i, v.x * d, v.y * d - 4 * k * k, v.z * d); }
    P.needsUpdate = true; sparks.material.opacity = Math.max(0, 1 - sstep(0.5, 3.8, k));
  }

  // ----- the state: null, or drag (in the grid), warp, fall, land -----
  const E = { phase: null, k: 0, warpK: 0, burstK: -1, drop: 0, h: HIGH, vy: 0, vx: 0, vz: 0, land: { x: 0, z: 0 }, roof: null };
  const p = () => ctx.player;
  const walk = () => {};
  // High up, what's inside the office storey (the desks, the rooms, everything in them: nearly all of the office scene's
  // draws) can't be seen through the roof: it's left out till you're 80 m off it (not the shell, the roof or the city).
  // Nor is the sun's shadow map drawn again till then (its box is round the tower: from up there its shadows are specks,
  // and in twenty seconds the sun hasn't moved). Which those things are is worked out a couple of milliseconds a frame
  // from when the hole opens (a box round a big mesh the first time can take tens of them). Never anything with a light
  // in it: the number of lights is in every lit material's program, so hiding one recompiles the whole office, twice.
  let inside = [], scan = { i: 0, found: [], done: false };
  const box = new THREE.Box3();
  function scanInside(ms) {
    const kids = ctx.world.children, top = roofF().y - 0.3, m = 0.4, t0 = performance.now();
    for (; scan.i < kids.length && performance.now() - t0 < ms; scan.i++) {
      const c = kids[scan.i];
      if (c === roofF().g || c.isLight) continue;
      let lit = false;
      c.traverse((o) => { lit ||= o.isLight; });
      if (lit) continue;
      box.setFromObject(c);
      if (!box.isEmpty() && box.min.y > -0.3 && box.max.y < top && box.min.x > ROOM.minX + m && box.max.x < ROOM.maxX - m && box.min.z > ROOM.minZ + m && box.max.z < ROOM.maxZ - m) scan.found.push(c);
    }
    scan.done = scan.i >= kids.length;
  }
  // (Nor its ambient occlusion: from up there there's nothing for it to shade, and at full size it's a good part of a frame.)
  const ao = () => ctx.composer?.passes.find((x) => x.gtaoMaterial);
  let aoOff = false;
  function hideInside() {
    if (!scan.done) scanInside(Infinity);
    inside = scan.found.filter((c) => c.visible);
    for (const c of inside) c.visible = false;
    if (ctx.sun) ctx.sun.shadow.autoUpdate = false;
    const a = ao();
    if (a?.enabled) { a.enabled = false; aoOff = true; }
  }
  function showInside() {
    for (const c of inside) c.visible = true;
    inside = [];
    if (ctx.sun && !ctx.sun.shadow.autoUpdate) { ctx.sun.shadow.autoUpdate = true; ctx.sun.shadow.needsUpdate = true; }
    if (aoOff) { aoOff = false; const a = ao(); if (a) a.enabled = ctx.quality; }
  }
  // The office, got ready for you coming out over it (the roof's things perhaps never drawn yet, and none of it drawn for
  // as long as you've been down here: the first frame of it would wait on the GPU): the roof's programs compiled in the
  // background as the hole opens; and as you're taken, the office drawn once, unseen, into a few pixels from up where
  // you'll come out, as it'll be then (the roof shown, the storey's insides not).
  let roofReady = false;
  function compileRoof() {
    roofReady = true;
    const r = ctx.renderer, R = roofF(), random = Math.random;
    Math.random = rng(1997);   // (three's uuids: a stream of their own)
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    Math.random = random;
    const was = r.getRenderTarget(), undo = R.cctv?.stage?.();
    r.setRenderTarget(rt);
    r.compileAsync(R.g, camera, ctx.scene).catch(() => {}).finally(() => rt.dispose());
    r.setRenderTarget(was);
    undo?.();
  }
  function drawOffice() {
    const r = ctx.renderer, R = roofF(), random = Math.random;
    Math.random = rng(1998);
    const rt = new THREE.WebGLRenderTarget(16, 10, { type: THREE.HalfFloatType }), cam = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
    Math.random = random;
    cam.layers.mask = camera.layers.mask;
    cam.position.set(0, R.y + HIGH + EYE, -2); cam.rotation.set(-1.0, 0, 0); cam.updateMatrixWorld();
    const was = r.getRenderTarget(), undo = R.cctv?.stage?.();
    r.setRenderTarget(rt); r.render(ctx.scene, cam); r.setRenderTarget(was);
    undo?.(); rt.dispose();
  }
  // Taken (grid-hole.js, when it's had everything): not while you're at the doorway, on your way out.
  function start() {
    const P = p();
    if (E.phase || ctx.away !== grid || Math.hypot(P.x, P.z) < 3) return false;
    Object.assign(E, { phase: 'drag', k: 0, warpK: 0, burstK: -1, drop: 0, drawn: false });
    hideInside();
    grid.walk = walk; grid.unstick = abort;
    return true;
  }
  // Out of it, wherever it's got to (Backspace twice, or the menu took you somewhere): the warp off, the sounds stopped,
  // the floors' hooks gone. Still in the grid: back by the doorway, the hole healed.
  function abort() {
    const inGrid = ctx.away === grid && E.phase && E.phase !== 'fall' && E.phase !== 'land' && E.warpK < WARP;
    end();
    if (inGrid) { hole.reset(); Object.assign(p(), { x: 0, z: -1.4, yaw: 0, pitch: 0, eye: EYE, fy: 0 }); return true; }
    return false;
  }
  function end() {
    E.phase = null;
    delete grid.walk; delete grid.unstick;
    if (E.roof) { delete E.roof.walk; delete E.roof.unstick; E.roof = null; }
    WU.amt.value = WU.flash.value = 0; passes(false);
    burst.removeFromParent();
    showInside();
    sound.warp(0); sound.wind(0);
  }

  // Through: onto the roof floor (your car parked up there, waiting), a kilometre over the deck, falling.
  function arrive() {
    const R = roofF(), L = mine.L, P = p();
    if (!R || !L) { abort(); return; }
    L.floor = ctx.ROOF; L.dir = 0; L.doorK = 0; ctx.setLift(L, 'parked');
    ctx.setFloor(R);
    E.roof = R; R.walk = walk; R.unstick = () => { touchDown(); return true; };
    // where you'll come down: open deck, near the middle
    const free = (x, z) => { const q = { x, z }; ctx.collide(q); return Math.hypot(q.x - x, q.z - z) < 0.05; };
    const spot = [[0, -2], [2, -6], [-4, 0], [4, 2], [-2, -8], [6, -4]].find(([x, z]) => free(x, z)) || [0, -2];
    E.land.x = spot[0]; E.land.z = spot[1];
    Object.assign(P, { x: spot[0], z: spot[1], pitch: -1.0, eye: EYE, fy: 0, seated: false, seat: null });
    E.h = HIGH; E.vy = 0; E.vx = E.vz = 0;
    burst.position.set(P.x, R.y + HIGH + EYE, P.z); ctx.scene.add(burst); burstFx(0); burst.visible = false;
    place();
  }
  function touchDown() {
    const P = p();
    E.phase = 'land'; E.k = 0; E.h = EYE;
    P.x = clamp(P.x, E.land.x - 6, E.land.x + 6); P.z = clamp(P.z, E.land.z - 6, E.land.z + 6);
    ctx.collide(P);
    sound.wind(0); sound.land();
    place();
  }
  // the camera where you are in the fall (or landing: dipped and shaking)
  function place(dip = 0, shake = 0) {
    const P = p(), R = E.roof;
    ctx.setCam({ x: P.x + (Math.random() - 0.5) * shake, y: R.y + E.h + dip + (Math.random() - 0.5) * shake, z: P.z + (Math.random() - 0.5) * shake, yaw: P.yaw, pitch: P.pitch });
  }

  function update(dt, t) {
    if (!E.phase) {
      if (hole.on && ctx.away === grid && !roofReady) compileRoof();
      if (hole.on && !scan.done && ctx.away === grid) scanInside(2);
      else if (!hole.on && scan.i) scan = { i: 0, found: [], done: false };   // (looked at afresh each time: things come and go)
      return;
    }
    if (!scan.done) scanInside(2);
    const P = p();
    // taken somewhere else (the menu): let go
    const onGrid = E.phase === 'drag' || (E.phase === 'warp' && E.warpK < WARP);
    if (ctx.away !== (onGrid ? grid : E.roof)) { end(); return; }
    E.k += dt;
    WU.t.value = t; WU.aspect.value = camera.aspect;
    if (onGrid) {
      if (!E.drawn) { E.drawn = true; drawOffice(); }
      // dragged in: faster and faster, round and down the funnel, turned to face it, the view tipping down into it
      const at = hole.st.at, dx = P.x - at.x, dz = P.z - at.z, r = Math.hypot(dx, dz), r0 = hole.P.r0;
      const v = Math.min(14, 0.8 + 1.5 * E.k * E.k), a = Math.atan2(dz, dx) + Math.min(1.5, 0.45 * v / Math.max(r, 0.5)) * dt, r2 = Math.max(0, r - v * dt);
      P.x = at.x + Math.cos(a) * r2; P.z = at.z + Math.sin(a) * r2;
      const yawTo = Math.atan2(at.x - P.x, at.z - P.z) + Math.PI;
      P.yaw += angDiff(P.yaw, yawTo) * Math.min(1, dt * 1.6) * sstep(0, 1.2, E.k);
      P.pitch += (-0.95 - P.pitch) * Math.min(1, dt * 1.6) * sstep(0, 1.5, E.k);
      if (r2 < r0 * 1.6 || E.phase === 'warp') E.drop += dt * (5 + 9 * E.warpK);
      if (E.phase === 'drag' && (r2 < r0 * 1.8 || E.k > 8)) { E.phase = 'warp'; E.warpK = 0; }
      if (E.phase === 'warp') { P.yaw += dt * 1.8 * E.warpK; E.warpK += dt; }
      ctx.setCam({ x: P.x, y: EYE + hole.ground(P.x, P.z) - E.drop, z: P.z, yaw: P.yaw, pitch: P.pitch });
      camera.rotation.z = 0.5 * sstep(1, 5, E.k) * Math.sin(E.k * 1.7) + 0.8 * E.warpK;
      const w = sstep(0, WARP, E.warpK);
      WU.amt.value = w; WU.scene.value = 1 - sstep(0.9, WARP, E.warpK); WU.twist.value = 2.5 * w; WU.flash.value = 0;
      sound.warp(Math.max(0.25 * sstep(0, 3, E.k), w), 0.6 + 0.9 * w);
      if (E.warpK >= WARP) { arrive(); }
      passes(E.warpK > 0);
      return;
    }
    if (E.phase === 'warp') {   // on the roof floor now, still in the tunnel: the sky and the city smeared past, then the burst
      E.warpK += dt;
      WU.amt.value = 1; WU.scene.value = sstep(WARP + 0.1, BURST - 0.2, E.warpK); WU.twist.value = 2.5; WU.flash.value = sstep(BURST - 0.15, BURST, E.warpK);
      sound.warp(1, 1.5 + 0.8 * sstep(WARP, BURST, E.warpK));
      if (E.warpK >= BURST) { E.phase = 'fall'; E.k = 0; E.burstK = 0; burst.visible = true; sound.warp(0); sound.boom(); }
      place();
      passes(true);
      return;
    }
    // falling: gravity against the air; leaning to steer, a little, never off the roof
    E.burstK += dt; burstFx(E.burstK);
    const fade = 1 - sstep(0, 1.1, E.burstK);
    WU.amt.value = fade * fade; WU.flash.value = Math.max(0, 1 - sstep(0.05, 1.4, E.burstK)); WU.twist.value = 2.5 * fade;
    passes(WU.amt.value > 0.002 || WU.flash.value > 0.002);
    if (E.phase === 'fall') {
      E.vy += (-G + G * (E.vy * E.vy) / (VT * VT)) * dt;
      E.h += E.vy * dt;
      const k = ctx.keys, f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
      E.vx += ((-sy * f + cy * s) * 3 - E.vx * 0.6) * dt; E.vz += ((-cy * f - sy * s) * 3 - E.vz * 0.6) * dt;
      P.x = clamp(P.x + E.vx * dt, E.land.x - 6, E.land.x + 6); P.z = clamp(P.z + E.vz * dt, E.land.z - 6, E.land.z + 6);
      E.roof.bound(P);
      if (E.h < 150) P.pitch += (-0.5 - P.pitch) * Math.min(1, dt * 0.5);   // (the roof coming up: looking at it, not past it)
      const speed = Math.min(1, -E.vy / VT);
      sound.wind(speed);
      if (E.h < 80) showInside();
      if (E.h <= EYE) touchDown();
      else place(0, 0.05 * speed * speed);
      return;
    }
    // landed: the dip and the shake, then you're standing
    const dip = -0.75 * sstep(0, 0.1, E.k) * (1 - sstep(0.1, 0.9, E.k));
    P.pitch += (-0.12 - P.pitch) * Math.min(1, dt * 2.5) * sstep(0.3, 1, E.k);   // (and up: you're standing)
    place(dip, 0.12 * Math.exp(-E.k * 5));
    if (E.k > 1) {
      Object.assign(P, { eye: EYE, fy: 0 });
      end();
      ctx.savePose?.();
    }
  }
  ctx.onFrame(update, 85);   // (after you'd have moved: systems/player.js, 80)

  // For the tests and for looking: taken now (in the grid, the hole open, everything gone), sec seconds on.
  function stage(sec = 0) {
    if (E.phase) end();
    if (ctx.away !== grid) return false;
    hole.tear(30, 0.5, -18);
    for (const th of W.things) { th.taken = true; th.o.visible = false; }
    hole.st.taking = true;
    const P = p();
    if (Math.hypot(P.x, P.z) < 3) Object.assign(P, { x: 0.5, z: -6 });
    start();
    for (let s = 0; s < sec && E.phase; s += 0.05) update(0.05, s);
    return E.phase;
  }
  // Got ready before it's needed (floors/grid.js calls this once the world's ready, long before any ending): the burst's
  // programs, the warp's (for the screen) and the grade's (into a target) compiled in the background; then, a frame each,
  // their first use, and each drawn once, unseen (the burst into what the office's composer draws into, the passes as
  // prewarm draws them). Gives back a tick for each frame on B3 or in here, true once it's done.
  function warm() {
    const r = ctx.renderer, random = Math.random;
    Math.random = rng(1996);   // (three's uuids: from a stream of its own, so nothing after this shifts)
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }), sc = new THREE.Scene(), scr = new THREE.Scene(), cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const quad = new THREE.PlaneGeometry(2, 2);
    if (ctx.grade) sc.add(new THREE.Mesh(quad, ctx.grade.material));
    scr.add(new THREE.Mesh(quad, warpM));
    Math.random = random;
    cam.layers.enableAll(); cam.position.set(0, 0, 30);
    const lone = !burst.parent;   // (not mid-ending: it's in the office's scene then)
    if (lone) { sc.add(burst); burstFx(0.5); }
    const was = r.getRenderTarget(), mats = [warpM, ball.material, sparks.material, ...(ctx.grade ? [ctx.grade.material] : [])];
    r.setRenderTarget(rt); const a = r.compileAsync(sc, cam);
    r.setRenderTarget(null); const b = r.compileAsync(scr, cam);
    r.setRenderTarget(was);
    if (lone) burst.removeFromParent();
    let state = 0;   // 0 compiling, 1 compiled, 2 first used, 3 done
    Promise.all([a, b]).catch(() => {}).then(() => { state = 1; });
    return () => {
      if (state === 1) { for (const m of mats) r.properties.get(m).currentProgram?.getUniforms(); state = 2; }
      else if (state === 2) {
        const prev = r.getRenderTarget();
        if (!burst.parent) { sc.add(burst); burstFx(0.5); r.setRenderTarget(rt); r.render(sc, cam); r.setRenderTarget(prev); burst.removeFromParent(); }
        prewarm(ctx);
        rt.dispose(); quad.dispose();
        state = 3;
      }
      return state === 3;
    };
  }
  return { start, abort, stage, warm, get phase() { return E.phase; }, E };
}
