// RELATIVITY: the space behind the stone door on the restricted level (relativity-door.js), after Escher's 1953
// lithograph. A hall of pale stone open to the haze on three sides, three gravities at right angles, each with its own
// floor, arcades, garden, stairs and people; only gravity is split, the building is one (relativity-arch.js). You walk in
// whichever gravity you're in (relativity-gravity.js: press into another one's floor, or step off an edge onto it, and the
// world turns over). Faceless figures go about their business in theirs (relativity-people.js); the sound is a vast quiet
// room (relativity-sound.js). Its own scene, lit soft and flat and drawn through an engraved grade (hatched shadows on
// paper). The doors in the wall where you came in take you back to B3, by the lift; the doors on the high balconies
// open onto sky. Nothing here runs unless you're in it.

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, ease, EYE, LIFT, makeCanvas, rng } from '../util.js';
import { buildArch, L } from './relativity-arch.js';
import { frameM, makeWalker } from './relativity-gravity.js';
import { makePeople } from './relativity-people.js';
import { makeSound } from './relativity-sound.js';
import { installDoor } from './relativity-door.js';

const N = -4;

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three draws a uuid from Math.random for every object: build under our own seed so nothing after this shifts
  const random = Math.random;
  Math.random = rng(1953);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { scene, camera, hud, style, mapCtx, addFloor, hitBox, renderer } = ctx;
  const rel = { n: N, label: 'RELATIVITY', title: 'Relativity', unlisted: true, carless: true, liftGone: true, on: false, composer: null,
    colliders: [], hits: [], sound: { kind: 'relativity', steps: true } };
  const S = rel.scene = new THREE.Scene(), haze = new THREE.Color('#e6e2d8');
  S.background = haze; S.fog = new THREE.Fog(haze, 24, 150);
  S.environment = scene.environment; S.environmentIntensity = 0.12;
  // A low sun from one side of the diagonal, so the three floors, and every face of a step, take three different tones.
  const sun = new THREE.DirectionalLight('#fffaf0', 2.6); sun.position.set(0.62, 0.7, 0.36).multiplyScalar(50);
  const fill = new THREE.DirectionalLight('#f0f0ff', 0.25); fill.position.set(-0.3, -0.5, -0.8).multiplyScalar(50);
  S.add(rel.hemi = new THREE.HemisphereLight('#f6f3ec', '#5e584e', 0.55), sun, fill);
  rel.look = { exposure: 0.9, hemi: 0.55, sky: new THREE.Color('#f6f3ec'), ground: new THREE.Color('#5e584e'), env: 0.12, bloom: 0.2, grade: 0.6,
    lights: [[sun, 2.6], [fill, 0.25]] };
  const root = rel.root = new THREE.Group(); S.add(root);
  const R = rng(4141);

  // ----- textures: dressed stone, smooth stone, grass, sky, the wallpaper you came from -----
  const tex = (w, h, draw, rep = true) => {
    const cv = makeCanvas(w, h);
    draw(cv.ctx, w, h);
    if (rep) cv.tex.wrapS = cv.tex.wrapT = THREE.RepeatWrapping;
    cv.tex.anisotropy = 4; cv.tex.needsUpdate = true;
    return cv.tex;
  };
  const speck = (c, w, h, n, a) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,255,250' : '80,72,60'},${R() * a})`; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } };
  const ashlar = tex(256, 256, (c, w, h) => {   // 1.2 m square: three courses of blocks, joints offset course to course
    c.fillStyle = '#f1ede4'; c.fillRect(0, 0, w, h);
    speck(c, w, h, 5000, 0.08);
    for (let i = 0; i < 3; i++) {
      const y = (i * h) / 3, off = i % 2 ? w / 2 : w / 4;
      for (let k = 0; k < 8; k++) { c.fillStyle = `rgba(120,110,95,${R() * 0.06})`; c.fillRect(off + k * w / 2 - w, y, w / 2, h / 3); c.fillRect(off + k * w / 2, y, w / 2, h / 3); }
      c.fillStyle = 'rgba(95,86,72,.45)'; c.fillRect(0, y, w, 2);
      for (let x = off; x < w + w / 2; x += w / 2) c.fillRect(x % w, y, 2, h / 3);
    }
  });
  const smooth = tex(128, 128, (c, w, h) => { c.fillStyle = '#f6f3ec'; c.fillRect(0, 0, w, h); speck(c, w, h, 1200, 0.06); });
  const grass = tex(128, 128, (c, w, h) => { c.fillStyle = '#dcdccc'; c.fillRect(0, 0, w, h); speck(c, w, h, 3000, 0.18); });
  const clouds = tex(512, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7f93a6'); g.addColorStop(0.7, '#c3cdd4'); g.addColorStop(1, '#e9ebe8'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {   // heaped clouds: grey undersides, white tops, smaller and flatter toward the horizon
      const y = h * (0.12 + R() * 0.75), sc = 0.4 + y / h, x = R() * w;
      for (let j = 0; j < 7; j++) {
        const bx = x + (R() - 0.5) * 120 * sc, by = y + (R() - 0.5) * 30 * sc, r = (18 + R() * 30) * sc;
        for (const [dy, col] of [[r * 0.35, 'rgba(120,128,138,.5)'], [0, 'rgba(255,255,255,.95)']]) {
          const gr = c.createRadialGradient(bx, by + dy, 0, bx, by + dy, r); gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
          c.fillStyle = gr; c.fillRect(bx - r, by + dy - r, r * 2, r * 2);
        }
      }
    }
  }, false);
  const paper = tex(256, 512, (c, w, h) => {   // B3's wallpaper, glimpsed behind the door on the way out
    c.fillStyle = '#b8a455'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { c.fillStyle = 'rgba(232,214,128,.35)'; c.fillRect(x + 4, 0, 12, h); }
  }, false);

  // ----- the building -----
  const arch = rel.arch = buildArch(rng(77));
  const mats = {
    stone: new THREE.MeshStandardMaterial({ map: ashlar, vertexColors: true, roughness: 0.92 }),
    pale: new THREE.MeshStandardMaterial({ map: smooth, vertexColors: true, roughness: 0.8 }),
    lawn: new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  };
  grass.repeat.set(1, 1);
  const shown = [];
  for (const [kind, g] of Object.entries(arch.merged)) { const m = new THREE.Mesh(g, mats[kind]); m.matrixAutoUpdate = false; root.add(m); shown.push(m); }
  // A group per gravity, turned into the world, for the things made in its own coordinates.
  const frames = [0, 1, 2].map((k) => { const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(frameM(k)); root.add(g); return g; });

  // ----- doors: leaves on hinges, in round-headed openings (w wide, springing at s) -----
  const archShape = (w, s) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(w, 0); sh.lineTo(w, s); sh.absarc(w / 2, s, w / 2, 0, Math.PI, false); sh.closePath(); return sh; };
  const oak = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), OAK = new THREE.Color('#6e5a45').toArray(), IRON = new THREE.Color('#2a2724').toArray();
  function makeDoor(d, behind, swing) {
    const grp = new THREE.Group(); grp.position.set(...d.hinge); grp.rotation.y = d.along === 'z' ? -Math.PI / 2 : 0; frames[d.k].add(grp);
    // the leaf, its straps and ring in one mesh (a draw call a door)
    const parts = [[new THREE.ExtrudeGeometry(archShape(d.w - 0.04, d.s), { depth: 0.07, bevelEnabled: false, curveSegments: 12 }).translate(0.02, 0, -0.035), OAK],
      ...[0.4, d.s - 0.1].map((y) => [new THREE.BoxGeometry(d.w * 0.8, 0.06, 0.02).translate(d.w * 0.42, y, 0.045), IRON]),
      [new THREE.TorusGeometry(0.06, 0.012, 6, 14).translate(d.w - 0.18, 1.0, 0.05), IRON]].map(([g, c]) => {
      g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
      return g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).map((_, i) => c[i % 3]), 3));
    });
    const leaf = new THREE.Mesh(mergeGeometries(parts), oak); grp.add(leaf);
    const back = new THREE.Mesh(new THREE.ShapeGeometry(archShape(d.w, d.s), 10), behind);   // what's through it
    back.position.z = d.along === 'z' ? -0.15 : 0.25; grp.add(back);
    return { ...d, grp, leaf, k: d.k, open: 0, want: 0, swing };
  }
  const skyM = new THREE.MeshBasicMaterial({ map: clouds, fog: false });
  const paperM = new THREE.MeshBasicMaterial({ map: paper, fog: false, color: new THREE.Color(0.75, 0.72, 0.6) });
  const skyDoors = rel.skyDoors = arch.skyDoors.map((d) => makeDoor(d, skyM, -1));
  const exits = arch.doors.map((d, i) => {
    const door = makeDoor(d, paperM, 1);
    const hit = hitBox(frames[d.k], d.w, d.s + d.w / 2, 0.3, d.hinge[0] + d.w / 2, d.hinge[1] + (d.s + d.w / 2) / 2, d.hinge[2] - 0.1,
      { action: 'relexit', reach: 3, keyAt: () => i });
    rel.hits.push(hit);
    return door;
  });
  for (const d of skyDoors) {
    const hit = hitBox(frames[d.k], 0.3, d.s + d.w / 2, d.w, d.hinge[0], d.hinge[1] + (d.s + d.w / 2) / 2, d.hinge[2] + d.w / 2, { action: 'relsky', reach: 4 });
    rel.hits.push(hit);
  }

  // ----- the people, you, your walking -----
  const people = rel.people = makePeople(root, arch, rng(808));
  people.meshes[0].userData.action = 'relfig';
  rel.hits.push(people.meshes[0]);
  const walker = rel.walker = makeWalker(arch.boxes);
  const sound = rel.audio = makeSound(ctx);

  // ----- the engraved grade: soft lithograph tone on paper, cross-hatched where it's dark -----
  const hatch = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, amount: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float amount; varying vec2 vUv;
      float line(float v, float s, float w) { float d = abs(mod(v, s) - 0.5 * s); return 1.0 - smoothstep(w - 0.5, w + 0.5, d); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        vec2 p = vUv * res;
        float k = res.y / 900.0, s = 5.5 * max(k, 0.75), w = 0.55 * max(k, 0.75);
        float ink = line(p.x + p.y, s, w) * smoothstep(0.62, 0.42, l);
        ink = max(ink, line(p.x - p.y, s, w) * smoothstep(0.44, 0.26, l));
        ink = max(ink, line(p.y, s * 0.7, w) * smoothstep(0.26, 0.1, l));
        vec3 paper = vec3(0.95, 0.935, 0.9), dark = vec3(0.16, 0.15, 0.14);
        vec3 tone = mix(dark, paper, smoothstep(0.02, 0.92, l));
        vec3 o = mix(tone, dark, ink * 0.5) + (hash(floor(p)) - 0.5) * 0.035;
        gl_FragColor = vec4(mix(c.rgb, o, amount), c.a);
      }`,
  });
  const res = new THREE.Vector2();

  // ----- coming and going (the fade, a white you walk through) -----
  style.textContent += `
    .of-hud .of-relfade { position: absolute; inset: 0; background: #f4f1ea; opacity: 0; pointer-events: none; transition: opacity .8s ease; }
    .of-relative .of-clock { font-size: 0 !important; } .of-relative .of-clock::after { content: '—'; font-size: 12px; }
  `;
  const fade = document.createElement('div'); fade.className = 'of-relfade'; hud.appendChild(fade);
  let busy = false;
  const fadeTo = (v, ms = 800) => new Promise((ok) => { fade.style.transitionDuration = `${ms}ms`; fade.style.opacity = String(v); setTimeout(ok, ms); });
  // In from B3 (your car is parked there: setFloor wants it).
  rel.go = async (instant) => {
    if (busy || !ctx.mine.L) return false;
    busy = true;
    if (!instant) await fadeTo(1, 900);
    ctx.setFloor(rel);
    if (!instant) await fadeTo(0, 1600);
    busy = false;
    return true;
  };
  // Back to B3, by the lift, the doors behind you shut.
  async function back(d) {
    if (busy) return;
    busy = true;
    d.want = 1; sound.door();
    await fadeTo(1, 1000);
    const restr = ctx.restr;
    ctx.setFloor(restr);
    Object.assign(ctx.player, { x: LIFT.x - 2.2, z: restr.z0, yaw: Math.PI / 2, pitch: 0, eye: EYE, fy: 0, seated: false, seat: null });
    await fadeTo(0, 1400);
    busy = false;
  }
  rel.back = () => { back(exits[0]); };
  rel.glimpse = () => { glimpse.now = true; };   // (for looking: yourself, far off, next frame)

  rel.enter = () => {
    const d = exits[0], [x, y, z] = d.at;
    walker.place(d.k, x, y, z);
    Object.assign(ctx.player, { yaw: d.yaw, pitch: 0.36, seated: false, seat: null });
    for (const e of [...exits, ...skyDoors]) { e.open = e.want = 0; e.leaf.rotation.y = 0; }
    glimpse.at = 40 + R() * 40; glimpse.on = 0; rel.t = 0;
    hud.classList.add('of-relative');
    try { localStorage.officeRelativity = String((+localStorage.officeRelativity || 0) + 1); } catch {}
  };
  rel.leave = () => {
    hud.classList.remove('of-relative');
    people.me.on = false;
    sound.stop();
  };
  rel.bound = () => {};
  // You walk here yourself (player.js hands over): in your gravity, turning over at its seams.
  let lastFeet = null, rolls = 0;
  rel.walk = (dt, keys) => {
    const P = ctx.player, f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const r = walker.step(dt, f, s, keys.has('ShiftLeft') || keys.has('ShiftRight'), P.yaw, P.pitch, camera, performance.now() / 1000);
    if (walker.S.rolls !== rolls) { rolls = walker.S.rolls; sound.roll(); }
    if (r) { P.yaw = r.yaw; P.pitch = r.pitch; }
    const feet = walker.feet();
    rel.step = lastFeet && !walker.S.roll ? Math.min(0.5, feet.distanceTo(lastFeet)) : 0;
    lastFeet = feet;
    P.x = feet.x; P.z = feet.z;
  };
  // For the tests and for looking about: stand at (x, y, z) in gravity k, looking yaw/pitch.
  rel.pose = (k, x, y, z, yaw, pitch) => { walker.place(k, x, y, z); Object.assign(ctx.player, { yaw, pitch }); lastFeet = null; };

  // ----- each frame while you're here -----
  const glimpse = { at: 0, on: 0, seen: 0, gone: 0 };
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), ray = new THREE.Raycaster();
  // In front of you, and nothing of the building in the way (once, when a glimpse is due: the building's a lot of triangles).
  const canSee = (p) => {
    const d = tmp.copy(p).sub(camera.position), n = d.length();
    if (d.normalize().dot(fwd) < 0.6) return false;
    ray.set(camera.position, d); ray.far = n - 0.6;
    return !ray.intersectObjects(shown, false).length;
  };
  rel.fx = (dt, t) => {
    rel.t = (rel.t || 0) + dt;
    if (rel.composer && !hatch.added) { rel.composer.addPass(hatch); hatch.added = true; }
    renderer.getDrawingBufferSize(res); hatch.uniforms.res.value.copy(res);
    people.update(dt);
    const eye = camera.position;
    // the doors onto sky open as you come up to them; the way out opens when you go through it
    for (const d of skyDoors) {
      d.grp.getWorldPosition(tmp);
      d.want = tmp.distanceTo(eye) < 6 ? 1 : 0;
    }
    for (const d of [...skyDoors, ...exits]) {
      const was = d.open;
      d.open = clamp(d.open + (d.want ? dt / 2.2 : -dt / 3), 0, 1);
      if (was === 0 && d.open > 0 && skyDoors.includes(d)) sound.door(tmp.copy(d.grp.getWorldPosition(tmp)));
      d.leaf.rotation.y = ease(d.open) * 1.35 * d.swing;
    }
    // now and then, far off on another gravity's stair: you, walking when you walk; gone once you look away
    camera.getWorldDirection(fwd);
    if (!glimpse.on && (rel.t > glimpse.at || glimpse.now) && (rel.step > 0 || glimpse.now)) {
      glimpse.now = false;
      if (people.glimpse(walker.S.k, eye, canSee)) { Object.assign(glimpse, { on: 1, seen: 0, gone: 0, at: rel.t }); sound.glimpse(people.worldPos(people.me)); }
      else glimpse.at = rel.t + 20;
    }
    if (glimpse.on) {
      people.mirror(rel.step || 0, dt);
      const p = people.worldPos(people.me), toMe = tmp.copy(p).sub(eye), d = toMe.length(), inView = toMe.normalize().dot(fwd) > 0.82;
      if (inView) glimpse.seen += dt; else if (glimpse.seen > 0.4) glimpse.gone += dt;
      if (glimpse.gone > 0.3 || d < 12 || rel.t - glimpse.at > 40) { people.me.on = false; glimpse.on = 0; glimpse.at = rel.t + 90 + R() * 120; }
    }
    sound.fx(dt, t, people);
  };

  // ----- the map: which way is down, and where you are on your floor -----
  rel.map = () => {
    const c = mapCtx, W = 440, H = 330, k = walker.S.k;
    c.clearRect(0, 0, W, H);
    const cx = 150, cy = 178, sc = 4.4, sx = (x) => cx + x * sc, sz = (z) => cy + z * sc;
    c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(sx(-L), sz(-L), 2 * L * sc, 2 * L * sc);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(sx(-L), sz(L)); c.lineTo(sx(-L), sz(-L)); c.lineTo(sx(L), sz(-L)); c.stroke();   // the other two floors, standing up
    c.font = '600 12px system-ui'; c.fillStyle = 'rgba(255,255,255,.6)';
    c.save(); c.translate(sx(-L) - 8, sz(0)); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText('a floor', 0, 0); c.restore();
    c.textAlign = 'center'; c.fillText('a floor', sx(0), sz(-L) - 9); c.textAlign = 'left';
    const { x, z } = walker.S;
    c.save(); c.translate(sx(x), sz(z)); c.rotate(-ctx.player.yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill();
    c.restore();
    // three downs, yours lit
    ['I', 'II', 'III'].forEach((n, i) => {
      const y = 70 + i * 70, on = i === k;
      c.fillStyle = on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.3)';
      c.beginPath(); c.moveTo(355, y - 18); c.lineTo(355, y + 10); c.lineTo(347, y + 2); c.moveTo(355, y + 10); c.lineTo(363, y + 2);
      c.strokeStyle = c.fillStyle; c.lineWidth = 3; c.stroke();
      c.font = '600 15px system-ui'; c.fillText(n, 378, y + 2);
    });
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('RELATIVITY', 16, 30);
  };

  ctx.action('relexit', { hover: () => '<b>The door you came in by</b><div class="k">It shouldn’t lead anywhere. Click to go back through</div>',
    click: (h) => { back(exits[h.key] || exits[0]); } });
  ctx.action('relsky', { hover: () => '<b>A door</b><div class="k">Open sky, all the way down.</div>' });
  ctx.action('relfig', { hover: () => '<b>Someone</b><div class="k">Going about their business. They don’t look up.</div>' });
  Object.assign(ctx, { rel });
  addFloor(rel);
  installDoor(ctx, rel);
}
