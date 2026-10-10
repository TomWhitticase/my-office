// THE GATEWAY in the archive and, through it, inside a repo. Dial a repo's coordinates on the keypad, the ring tunes in
// while its whole history loads, and walking through flies you into its tree as it was at every commit: bookcases of files,
// the further in the further back. Pull a book out to read the file as it was then. Own scene; the way out leads back.

import * as THREE from 'three';
import { escapeHtml } from '../../chat.js';
import { angDiff, box, clamp, damp, ease, EYE, fit, FONT, hash, lerp, makeCanvas, makeScreen, mat, mergedBoxes, REDUCED, rng, sstep } from '../util.js';
import { MONO } from '../painters.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { ARCH, arch, hud, camera, style, files, loadRepos, setFloor, langColor, scene, toast, mapCtx, renderer, readmeHtml } = ctx;
  Object.assign(ctx, { flyPlayer, gateFx, pullFx, tessHover, gatePress, readBook });
  // ----- THE GATEWAY, and inside a repo -----
  // Every repo has coordinates (a hash of owner/name, typed in its folder). Far off to the left of the cabinet a ring stands
  // half sunk in the floor, with a keypad: enter a repo's coordinates and it opens onto a tunnel of threads, and walking
  // through takes you inside the repo (`tess`, a floor of its own the lift doesn't serve). In there you float through a
  // lattice of bookcases in the dark: every folder a bookcase (one per 56 files), laid out as the tree, each file a book on
  // its shelves. The lattice repeats away from you, one layer per commit, so going deeper goes back in time: books come and
  // go as files did, and the ones a commit touched glow. Look at a book and click to read it as it was then.
  const coordOf = (f) => hash(`${f.owner}/${f.name}`).toString(16).toUpperCase().padStart(8, '0');
  const fmtCoord = (c) => `${c.slice(0, 4)}·${c.slice(4)}`;
  const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);
  // Out on its own, 74 m on down the line from the doorway through the cabinet (see archive.js ARCH), up on a plinth with
  // steps either side (PL high, its top PW wide and PD deep). The ring stands in a slot cut through the plinth, touching
  // nothing, its foot just off the floor and its portal level with the top. It's laid out in its own frame (L: you come up
  // its steps going +z, the ring across your way along x), turned to face back down the line: its +z is the world's -x.
  const GATE = { x: ARCH.x - 74, z: ARCH.z, y: 2.82, R: 2.6, tube: 0.2, PL: 0.9, PW: 6.4, PD: 3.6, STEP: 0.35, SLOT: 0.3, CUT: 2.2, rot: -Math.PI / 2 };
  // Between its frame and the world's: a point (local x, z about the ring) and back; a box (axis-aligned either way).
  const toW = (lx, lz) => ({ x: GATE.x - lz, z: GATE.z + lx }), toL = (x, z) => ({ x: z - GATE.z, z: GATE.x - x });
  const boxW = (x0, x1, z0, z1) => ({ minX: GATE.x - z1, maxX: GATE.x - z0, minZ: GATE.z + x0, maxZ: GATE.z + x1 });
  const portalMat = (core, rim) => new THREE.ShaderMaterial({
    uniforms: { uOpen: { value: 0 }, uTime: { value: 0 }, uHaze: { value: 0 }, uReady: { value: 0 }, uFlash: { value: 0 },
      uCore: { value: new THREE.Color(...core) }, uRim: { value: new THREE.Color(...rim) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uOpen, uTime, uHaze, uReady, uFlash; uniform vec3 uCore, uRim; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
        float z = 0.35 / (r + 0.04) + uTime * (0.2 + 0.5 * uReady);   // a tunnel of threads, rushing once it's tuned in
        float g = pow(1.0 - abs(fract(a / 6.2831853 * 24.0) - 0.5) * 2.0, 26.0) + pow(1.0 - abs(fract(z) - 0.5) * 2.0, 18.0);
        vec3 c = mix(uCore, uRim, smoothstep(0.0, 0.9, r)) + vec3(1.6, 1.05, 0.45) * g * smoothstep(0.02, 0.35, r) * (0.3 + 0.7 * uReady);
        c += vec3(2.4, 1.9, 1.2) * uFlash * (1.0 - 0.6 * r);   // the moment it's ready
        gl_FragColor = vec4(mix(c, vec3(1.0), uHaze), max(uOpen, uFlash) * smoothstep(1.0, 0.94, r));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const dialTex = (() => {   // the brass dial inside the ring: ticks and the sixteen hex digits
    const d = makeCanvas(1024, 1024), c = d.ctx;
    c.translate(512, 512); c.strokeStyle = c.fillStyle = '#fff';
    for (const r of [500, 412]) { c.lineWidth = 6; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2, l = i % 8 ? 18 : 40;
      c.lineWidth = i % 8 ? 3 : 6; c.beginPath(); c.moveTo(Math.cos(a) * 496, Math.sin(a) * 496); c.lineTo(Math.cos(a) * (496 - l), Math.sin(a) * (496 - l));
      c.stroke();
    }
    c.font = `600 34px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 16; i++) { c.save(); c.rotate((i / 16) * Math.PI * 2); c.fillText(i.toString(16).toUpperCase(), 0, -436); c.restore(); }
    d.tex.needsUpdate = true;
    return d.tex;
  })();
  function makeGate(parent, x, y, z, core, rim, rot = 0) {   // a ring facing ±z (turned by rot), its portal on layer 1 (out of the AO)
    const g = new THREE.Group(), { R, tube } = GATE;
    g.position.set(x, y, z); g.rotation.y = rot;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 24, 128), mat('#2a2622', { metalness: 0.85, roughness: 0.32 }));
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R - tube - 0.02, 0.025, 8, 128), mat('#b08a4a', { metalness: 1, roughness: 0.3 }));
    const dial = new THREE.Mesh(new THREE.RingGeometry(R - tube - 0.5, R - tube - 0.05, 128),
      new THREE.MeshStandardMaterial({ map: dialTex, color: '#c9a25c', metalness: 0.9, roughness: 0.35, alphaTest: 0.3, side: THREE.DoubleSide }));
    const portal = new THREE.Mesh(new THREE.CircleGeometry(R - tube - 0.48, 96), portalMat(core, rim));
    portal.layers.set(1);
    g.add(ring, lip, dial, portal); parent.add(g);
    return { g, dial, u: portal.material.uniforms };
  }

  // The gateway in the archive, and its keypad on a lectern beside it.
  const gate = arch.gate = { code: '', msg: 'ENTER COORDINATES', repo: null, open: 0, to: 0, ready: false, side: -1, hot: null, hotT: 0, bad: false,
    clear: false,
    ...makeGate(arch.scene, GATE.x, GATE.y, GATE.z, [0.3, 0.17, 0.06], [0.012, 0.009, 0.006], GATE.rot) };
  const GATE_P = new THREE.Vector3(GATE.x, GATE.y, GATE.z);
  {
    // The plinth: dark stone, four steps up from the cabinet's side and four down the far side, the ring standing in the middle.
    const { PL, PW, PD, STEP, SLOT, CUT } = GATE, n = Math.round(PL / 0.15), run = n * STEP, side = PW / 2 - CUT;
    const stone = [...[-1, 1].map((s) => [PW, PL, PD / 2 - SLOT, 0, PL / 2, s * (PD / 2 + SLOT) / 2, '#2a2622']),   // either side of the slot
      ...[-1, 1].map((s) => [side, PL, SLOT * 2, s * (CUT + side / 2), PL / 2, 0, '#2a2622']),   // past the ring's ends
      [CUT * 2, 0.02, SLOT * 2, 0, 0.01, 0, '#0b0907']];   // the slot's floor, in shadow
    for (let j = 0; j < n;
      j++) for (const s of [-1, 1]) stone.push([PW, PL - (j + 1) * 0.15, STEP, 0, (PL - (j + 1) * 0.15) / 2, s * (PD / 2 + (j + 0.5) * STEP),
      j % 2 ? '#2e2a26' : '#332e29']);
    for (const s of [-1, 1]) stone.push([PW + 0.02, 0.02, 0.04, 0, PL + 0.01, s * (PD / 2 - 0.02), '#b08a4a']);   // brass nosing at the top step
    const plinth = mergedBoxes(stone, mat('#ffffff', { vertexColors: true, roughness: 0.7, metalness: 0.2 }));
    // A centimetre up: its bottom step's top would lie in the floor.
    plinth.position.set(GATE.x, 0.01, GATE.z); plinth.rotation.y = GATE.rot; arch.scene.add(plinth);
    const psh = new THREE.Mesh(new THREE.PlaneGeometry((PD + 2 * run) * 1.5, PW * 1.7),
      new THREE.MeshBasicMaterial({ map: arch.blob, color: '#000', transparent: true, opacity: 0.4, depthWrite: false }));
    psh.rotation.x = -Math.PI / 2; psh.position.set(GATE.x, 0.002, GATE.z); psh.layers.set(1); arch.scene.add(psh);
    for (const s of [-1, 1]) {   // the ring's feet, and the plinth's sides (you go up by the steps)
      arch.colliders.push(boxW(Math.min(s * 1.4, s * (CUT + 0.1)), Math.max(s * 1.4, s * (CUT + 0.1)), -SLOT, SLOT));
      arch.colliders.push(boxW(s * PW / 2 - 0.05, s * PW / 2 + 0.05, -PD / 2 - run, PD / 2 + run));
    }
    // How high the ground is here: the plinth's top, a step, or the floor (see movePlayer).
    arch.ground = (wx, wz) => {
      const { x, z } = toL(wx, wz);
      if (Math.abs(x) > PW / 2) return 0;
      const d = Math.abs(z) - PD / 2;
      return d < 0 ? PL : Math.max(0, PL - Math.ceil(d / STEP + 1e-6) * 0.15);   // (you step over the slot)
    };
    // The lectern, on the floor to the right of the steps: the keypad on a sloped brass board, clear of everything.
    const { x: PX, z: PZ } = toW(2.6, -PD / 2 - run - 1.2), ped = new THREE.Group();
    ped.position.set(PX, 0, PZ); ped.rotation.y = Math.PI + 0.25 + GATE.rot;   // facing you as you come along the path
    ped.add(mergedBoxes([[0.62, 0.08, 0.5, 0, 0.04, 0, '#1f1d1b'], [0.32, 1.1, 0.26, 0, 0.63, -0.03, '#2a2622']],
      mat('#ffffff', { vertexColors: true, metalness: 0.6, roughness: 0.4 })));
    const pad = gate.pad = makeScreen(ped, 0.34, 0.51, 340, 510, 0, 1.35, 0.01);
    pad.mesh.rotation.x = -1.05;
    const board = box(ped, 0.4, 0.57, 0.04, '', 0, 1.35 - 0.87 * 0.022, 0.01 - 0.5 * 0.022, { material: mat('#b08a4a', { metalness: 0.9, roughness: 0.35 }) });
    board.rotation.x = -1.05;
    Object.assign(pad.mesh.userData, { action: 'gatekey', reach: 2.4, keyAt: (uv) => keyAt(uv) });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4),
      new THREE.MeshBasicMaterial({ map: arch.blob, color: '#000', transparent: true, opacity: 0.5, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(PX, 0.002, PZ); sh.layers.set(1);
    arch.scene.add(ped, sh);
    gate.parts = [gate.g, plinth, psh, ped, sh];
    arch.colliders.push({ minX: PX - 0.3, maxX: PX + 0.3, minZ: PZ - 0.3, maxZ: PZ + 0.3 });
    arch.hits.push(pad.mesh);
    arch.nFixed = arch.colliders.length;   // the cabinet, its drawer and the gateway (the lift's goes after, see arch.enter)
  }
  const KEYS = [...'0123456789ABCDEF', '⌫', 'GO', 'CLOSE'];
  // for window.__office.arch
  Object.assign(arch, { coordOf, gatePress: (k) => gatePress(k), tess: () => tess, readBook: (b) => readBook(b), closeBook: () => closeBook(false) });
  function keyAt(uv) {
    const x = uv.x * 340, y = (1 - uv.y) * 510, r = Math.floor((y - 100) / 68), c = Math.floor((x - 10) / 80);
    if (y < 100 || c < 0 || c > 3 || r > 5) return null;
    return r < 4 ? KEYS[r * 4 + c] : r > 4 ? 'CLOSE' : c < 2 ? '⌫' : 'GO';
  }
  function paintPad() {
    const { ctx: c, W, H } = gate.pad;
    c.fillStyle = '#16130f'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#050403'; c.fillRect(10, 10, W - 20, 80);
    c.textAlign = 'center'; c.font = `600 34px ${MONO}`; c.fillStyle = gate.bad ? '#ff6b4a' : '#ffc46b';
    c.fillText(fmtCoord((gate.code + '________').slice(0, 8)), W / 2, 52);
    c.font = `600 14px ${FONT}`; c.fillStyle = gate.bad ? '#ff8a6b' : '#c9a25c'; c.fillText(fit(c, gate.msg, W - 40), W / 2, 79);
    KEYS.forEach((k, i) => {
      const big = i > 15, end = i > 17, x = 10 + (end ? 0 : big ? (i - 16) * 160 : (i % 4) * 80), y = 100 + (end ? 5 : big ? 4 : Math.floor(i / 4)) * 68,
        w = end ? 312 : big ? 152 : 72, hot = gate.hot === k;
      c.fillStyle = hot ? '#ffc46b' : end ? '#3a1d17' : '#2b2620'; c.beginPath(); c.roundRect(x, y, w, 60, 8); c.fill();
      c.strokeStyle = end ? '#8a3a2a' : '#6b5530'; c.lineWidth = 2; c.stroke();
      c.fillStyle = hot ? '#16130f' : end ? '#ffb39a' : '#e8c88a'; c.font = `600 ${big ? 22 : 30}px ${MONO}`;
      c.fillText(k === 'GO' ? 'ENTER' : end ? 'CLOSE THE GATEWAY' : k, x + w / 2, y + 41);
    });
    c.textAlign = 'left'; gate.pad.tex.needsUpdate = true;
  }
  paintPad();
  function gatePress(k) {
    if (!k) return;
    const at = gate.pad.mesh.getWorldPosition(new THREE.Vector3());
    Object.assign(gate, { hot: k, hotT: performance.now() + 160 });
    if (k === 'CLOSE') {
      if (gate.to) { ctx.sfx.cabinet('spindown', GATE_P, 0.7); ctx.sfx.cabinet('beep', at, 0.22); }
      Object.assign(gate, { code: '', to: 0, ready: false, repo: null, bad: false, clear: false, msg: gate.to ? 'GATEWAY CLOSED' : 'ENTER COORDINATES' });
      paintPad(); return;
    }
    if (gate.clear && k !== 'GO') Object.assign(gate, { code: '', clear: false, bad: false, msg: 'ENTER COORDINATES' });
    if (k === '⌫') { gate.code = gate.code.slice(0, -1); ctx.sfx.cabinet('beep', at, 0.22); }
    else if (k !== 'GO') { if (gate.code.length < 8) { gate.code += k; ctx.sfx.cabinet('beep', at, 0.22); } else ctx.sfx.cabinet('buzz', at, 0.25); }
    else if (gate.code.length < 8) { Object.assign(gate, { msg: 'COORDINATES ARE 8 DIGITS', bad: true }); ctx.sfx.cabinet('buzz', at, 0.35); }
    else if (!files.list) { Object.assign(gate, { msg: files.loading ? 'READING THE ARCHIVE…' : 'THE ARCHIVE IS UNREADABLE', bad: !files.loading });
      loadRepos(); ctx.sfx.cabinet('buzz', at, 0.3); }
    else {
      const f = files.list.find((r) => coordOf(r) === gate.code);
      if (f) tune(f, at);
      else { Object.assign(gate, { msg: 'NOTHING AT THOSE COORDINATES', bad: true, clear: true, to: 0, ready: false, repo: null });
        ctx.sfx.cabinet('buzz', at, 0.4); }
    }
    paintPad();
  }
  async function tune(f, at) {
    Object.assign(gate, { repo: f, to: 1, ready: false, prog: 0, bad: false, msg: `TUNING IN · ${f.name.toUpperCase()}` });
    ctx.sfx.cabinet('accept', at, 0.35); ctx.sfx.cabinet('spinup', GATE_P, 0.7);
    const ok = await loadTree(f, ({ done, total }) => {
      if (gate.repo !== f) return false;
      gate.msg = total ? `TUNING IN · ${done} / ${total} COMMITS` : `TUNING IN · ${f.name.toUpperCase()}`; gate.prog = total ? done / total : 0; paintPad();
      return true;
    });
    if (gate.repo !== f) return;
    if (ok) { Object.assign(gate, { ready: true, flash: 1, prog: 1, msg: `OPEN · ${f.name.toUpperCase()} · WALK THROUGH` });
      ctx.sfx.cabinet('accept', GATE_P, 0.5); ctx.sfx.cabinet('boom', GATE_P, 0.4); }
    else { Object.assign(gate, { to: 0, msg: 'CAN’T REACH IT · TRY AGAIN', bad: true, clear: true }); ctx.sfx.cabinet('buzz', at, 0.35); }
    paintPad();
  }
  function gateFx(dt, t) {
    // Tuning in (the history still loading): it powers up, flickering and building with the progress, a slow tunnel, the dial
    // spinning ever faster; only once it's ready does it open fully, with a flash. Before then you can't go through.
    const loading = gate.to && !gate.ready;
    gate.open = gate.ready ? Math.min(1, gate.open + dt / 0.8) : Math.max(0, gate.open - dt / 1.2);
    gate.charge = damp(gate.charge || 0, loading ? Math.max(0.08, gate.prog || 0) : 0, 3, dt);
    const flick = loading ? 0.55 + 0.45 * Math.abs(Math.sin(t * 11.3) * Math.sin(t * 4.1 + 1)) : 0;
    const u = gate.u;
    u.uOpen.value = Math.max(ease(gate.open), (0.3 + 0.45 * gate.charge) * flick); u.uTime.value = t;
    u.uReady.value = damp(u.uReady.value, gate.ready ? 1 : 0.3 * gate.charge, 2, dt);
    gate.flash = Math.max(0, (gate.flash || 0) - dt / 0.9); u.uFlash.value = gate.flash ** 1.5;
    // The scene's fog (8-95 m), the glow showing through a little, then not at all as it reaches the fog's far end; past
    // that it isn't drawn (even fully fogged, its depth would still shade the AO): from the doorway, there's no gateway.
    const far = Math.hypot(camera.position.x - GATE.x, camera.position.z - GATE.z);
    u.uHaze.value = clamp((far - 8) / 87, 0, 1) * 0.9 + 0.1 * sstep(80, 95, far);
    for (const o of gate.parts) o.visible = far < 96;
    gate.dial.rotation.z += dt * (0.02 + 0.25 * gate.open + (loading ? 0.4 + 2.4 * gate.charge : 0));
    if (gate.hot && performance.now() > gate.hotT) { gate.hot = null; paintPad(); }
    const me = toL(ctx.player.x, ctx.player.z);   // you, in the gateway's frame
    if (loading && ctx.mode === 'free' && gate.side < 0 && Math.abs(me.x) < 1.5 && me.z > -0.45) {   // not yet: a soft bounce
      ctx.player.x = toW(me.x, -0.45).x; me.z = -0.45;
      if (t > (gate.bumpT || 0)) { gate.bumpT = t + 1.2; ctx.sfx.cabinet('buzz', GATE_P, 0.25); }
    }
    const side = Math.sign(me.z) || 1;
    if (side > 0 && gate.side < 0 && gate.ready && gate.open > 0.9 && Math.abs(me.x) < 1.3 && ctx.mode === 'free') enterTess();
    gate.side = side;
    const d = Math.hypot(ctx.player.x - GATE.x, ctx.player.z - GATE.z);
    if (d > PULL + 0.5) gate.armed = true;   // (not straight back in when you've just come out)
    const s = gate.ready && gate.open > 0.9 && gate.armed && side < 0 && ctx.mode === 'free' ? pullOf(d) : 0;
    if (s) { const to = toW(0, 0.8); pullTo(dt, s, to.x, GATE.y, to.z, false); ctx.collide(ctx.player); }
    pullFx(s, WARP_IN, GATE_P);
  }

  // The pull: within PULL m of an open ring, on the side you go in by, it draws you to its centre and turns you to face it.
  // Gently at first (you can walk away from the edge), then faster than you can walk against; the view starts to stretch and
  // streak, and a rush builds, until you're through and the crossing takes over.
  const PULL = 6, PULL_V = 9;
  const pullOf = (d) => clamp(1 - d / PULL, 0, 1) ** 1.5;
  function pullTo(dt, s, tx, ty, tz, fly) {
    const ey = fly ? ctx.player.eye : ctx.player.eye + (ctx.player.fy || 0);
    const dx = tx - ctx.player.x, dy = fly ? ty - ey : 0, dz = tz - ctx.player.z, d = Math.hypot(dx, dy, dz) || 1, v = Math.min(d, s * PULL_V * dt);
    ctx.player.x += (dx / d) * v; ctx.player.z += (dz / d) * v; if (fly) ctx.player.eye += (dy / d) * v;
    const k = Math.min(1, s * 2.5 * dt), h = Math.hypot(tx - ctx.player.x, tz - ctx.player.z);
    ctx.player.yaw += angDiff(ctx.player.yaw, Math.atan2(-(tx - ctx.player.x), -(tz - ctx.player.z))) * k;
    ctx.player.pitch += (Math.atan2(ty - ey, Math.max(h, 0.5)) * 0.6 - ctx.player.pitch) * k;
  }
  const WARP_IN = { ray: 'rgba(255,196,110,.9)', flash: '#fff1cf', bg: '#0b0704' },
    WARP_OUT = { ray: 'rgba(255,255,255,.95)', flash: '#ffffff', bg: '#f4f1ea' };
  function pullFx(s, look, at) {
    if (tess.warping) return;
    tess.pullS = s;
    if (s > 0.005) {
      fadeEl.style.setProperty('--ray', look.ray); fadeEl.style.setProperty('--flash', look.flash); fadeEl.style.setProperty('--bg', look.bg);
      fadeEl.classList.add('on');
      const r = (performance.now() / 40) % 360;
      Object.assign(raysA.style, { opacity: (s * 0.55).toFixed(3), transform: `scale(${(0.12 + 0.4 * s).toFixed(3)}) rotate(${r.toFixed(1)}deg)` });
      Object.assign(raysB.style, { opacity: (s * 0.4).toFixed(3), transform: `scale(${(0.08 + 0.3 * s).toFixed(3)}) rotate(${(-r * 0.7).toFixed(1)}deg)` });
      flashEl.style.opacity = (s * s * 0.3).toFixed(3);
    } else if (fadeEl.classList.contains('on')) { fadeEl.classList.remove('on'); for (const e of [raysA, raysB, flashEl]) e.style.opacity = 0; }
    // (flying, flyPlayer adds it)
    if (!ctx.away?.fly) { const fov = FOV0 + 16 * s; if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); } }
    ctx.sfx.pull(s, at);
  }

  // Through the ring: the view stretches as you're pulled in, threads of light streak past and fold into a flash, a deep boom,
  // and the far side swims into view as the threads fall away behind you.
  const fadeEl = document.createElement('div');
  fadeEl.className = 'of-fade';
  fadeEl.innerHTML = '<div class="rays"></div><div class="rays b"></div><div class="flash"></div>';
  hud.appendChild(fadeEl);
  const [raysA, raysB, flashEl] = fadeEl.children;
  function fovTo(a, b, ms, ez) {   // the warp's own lens, frame by frame (flyPlayer leaves the FOV alone meanwhile)
    const t0 = performance.now();
    return new Promise((done) => {
      const step = () => {
        const u = clamp((performance.now() - t0) / ms, 0, 1);
        camera.fov = lerp(a, b, ez(u)); camera.updateProjectionMatrix();
        if (u < 1) requestAnimationFrame(step); else done();
      };
      step();
    });
  }
  const easeIn = (u) => u * u * u, easeOut = (u) => 1 - (1 - u) ** 3;
  async function warp(look, then) {
    if (tess.warping) return;
    tess.warping = true;
    ctx.keys.clear(); ctx.mode = 'warp';
    if (REDUCED) { then(); if (ctx.mode === 'warp') ctx.mode = 'free'; tess.warping = false; return; }
    fadeEl.style.setProperty('--ray', look.ray); fadeEl.style.setProperty('--flash', look.flash); fadeEl.style.setProperty('--bg', look.bg);
    fadeEl.classList.add('on');
    ctx.sfx.cabinet('whoosh', camera.position, 0.6); ctx.sfx.cabinet('spinup', camera.position, 0.35);
    const IN = { duration: 1100, easing: 'cubic-bezier(.55,0,.9,.4)', fill: 'forwards' };
    const from = (e, t) => ({ transform: e.style.transform || t, opacity: +(e.style.opacity || 0) });   // where the pull left it
    raysA.animate([from(raysA, 'scale(.12) rotate(0deg)'), { transform: 'scale(.8) rotate(30deg)', opacity: 1, offset: 0.55 },
      { transform: 'scale(3) rotate(80deg)', opacity: 1 }], IN);
    raysB.animate([from(raysB, 'scale(.08) rotate(0deg)'), { transform: 'scale(.6) rotate(-20deg)', opacity: 0.8, offset: 0.6 },
      { transform: 'scale(2.4) rotate(-55deg)', opacity: 1 }], IN);
    const f0 = +(flashEl.style.opacity || 0);
    flashEl.animate([{ opacity: f0 }, { opacity: f0, offset: 0.6 }, { opacity: 1 }], IN);
    ctx.sfx.pull(0);
    await fovTo(camera.fov, FOV0 + 70, 1100, easeIn);
    ctx.sfx.cabinet('boom', camera.position, 0.8);
    then();
    if (ctx.mode === 'warp') ctx.mode = 'free';
    await new Promise((r) => setTimeout(r, 250));
    ctx.sfx.cabinet('boom', camera.position, 0.25);
    const OUT = { duration: 1500, easing: 'cubic-bezier(.1,.6,.3,1)', fill: 'forwards' };
    raysA.animate([{ transform: 'scale(3) rotate(80deg)', opacity: 1 }, { transform: 'scale(.15) rotate(130deg)', opacity: 0 }], OUT);
    raysB.animate([{ transform: 'scale(2.4) rotate(-55deg)', opacity: 1 }, { transform: 'scale(.1) rotate(-100deg)', opacity: 0 }], OUT);
    flashEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease-out', fill: 'forwards' });
    await fovTo(FOV0 + 70, FOV0, 1600, easeOut);
    fadeEl.classList.remove('on');
    for (const e of [raysA, raysB, flashEl]) { e.getAnimations().forEach((a) => a.cancel()); e.style.transform = ''; e.style.opacity = 0; }
    tess.warping = false;
  }
  const enterTess = () => warp(WARP_IN, () => setFloor(tess));
  const exitTess = () => warp(WARP_OUT, () => {
    setFloor(arch);
    arch.out = 1;   // straight into the void's own light
    // on the plinth, looking back down the path (towards the cabinet)
    Object.assign(ctx.player, { ...toW(0, -1.2), eye: EYE, fy: GATE.PL, yaw: GATE.rot, pitch: -0.05, seated: false, seat: null });
    gate.side = -1; gate.armed = false;
  });

  // ----- inside a repo -----
  const EXIT_Z = 26;   // the way out, 26 m in front of the first bookcases (you arrive 9 m inside it, clear of its pull)
  const TX = -3000, BW = 2.4, BH = 2.0, BD = 0.36, GX = 3.3, GY = 2.9, GZ = 5, PER = 56, SLOT = (BW - 0.12) / 14, SHELF = (BH - 0.1) / 4, WC = 8, WB = 4, WF = 40,
    WK = 3;
  const EXT = { js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', html: 'HTML',
    css: 'CSS', scss: 'SCSS',
    java: 'Java', cs: 'C#', cpp: 'C++', cc: 'C++', h: 'C', c: 'C', go: 'Go', rs: 'Rust', sh: 'Shell', swift: 'Swift', kt: 'Kotlin', rb: 'Ruby', php: 'PHP',
      dart: 'Dart',
    vue: 'Vue', svelte: 'Svelte', lua: 'Lua', ipynb: 'Jupyter Notebook', gd: 'GDScript', astro: 'Astro' };
  const DOCS = { md: '#d8c6a0', txt: '#cdbf9f', json: '#8f9a6a', yml: '#9a7f6a', yaml: '#9a7f6a', lock: '#6d6a64', svg: '#c78a5a', png: '#7a8fa6',
    jpg: '#7a8fa6', gif: '#7a8fa6', ico: '#7a8fa6' };
  const bookColor = (p) => { const e = (/\.([^./]+)$/.exec(p)?.[1] || '').toLowerCase(); return EXT[e] ? langColor(EXT[e]) : DOCS[e] || '#8a7a66'; };
  // A texture atlas per instanced mesh: each instance picks its cell with an aUv offset (as the folder tabs do).
  const atlasMat = (o) => {
    const cell = { value: new THREE.Vector2(1, 1) }, m = new THREE.MeshBasicMaterial(o);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.cell = cell;
      sh.vertexShader = 'attribute vec2 aUv;\nuniform vec2 cell;\n' + sh.vertexShader.replace('#include <uv_vertex>',
        '#include <uv_vertex>\n\tvMapUv = vMapUv * cell + aUv;');
    };
    m.cell = cell.value;
    return m;
  };
  const tess = { n: 'T', label: 'INSIDE', title: 'Inside', sound: 'tess', on: false, carless: true, fly: true, colliders: [], hits: [], composer: null,
    vel: new THREE.Vector3(), t: null };
  const caseG = mergedBoxes([[0.04, BH, BD, -BW / 2 + 0.02, 0, 0], [0.04, BH, BD, BW / 2 - 0.02, 0, 0], [BW, 0.05, BD, 0, BH / 2 - 0.025, 0],
    [BW, 0.05, BD, 0, -BH / 2 + 0.025, 0],
    ...[1, 2, 3].map((s) => [BW - 0.08, 0.02, BD, 0, BH / 2 - 0.05 - s * SHELF, 0])], mat('#fff')).geometry;
  const caseBackG = new THREE.PlaneGeometry(BW - 0.06, BH - 0.06).translate(0, 0, -BD / 2 + 0.005), bookG = new THREE.BoxGeometry(1, 1, 1),
    unitG = new THREE.PlaneGeometry(1, 1);
  const plaqueG = new THREE.PlaneGeometry(1.5, 0.19);
  const caseM = mat('#2b1e14', { roughness: 0.6 }), bookM_ = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const glowTex = (() =>
    { const g = makeCanvas(128, 128), c = g.ctx, r = c.createRadialGradient(64, 64, 4, 64, 64, 92); r.addColorStop(0, '#ffffff'); r.addColorStop(1, '#3a3026');
    c.fillStyle = r; c.fillRect(0, 0, 128, 128); g.tex.needsUpdate = true; return g.tex; })();
  const caseBackM = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1.5, 0.92, 0.42), side: THREE.DoubleSide });
  // A far bookcase: a glowing panel the size of its frame, in its books' colours (the instance colour), lit from the middle out.
  // Made the first time you go inside a repo, under its own seeded random (three's uuids would shift the office's stream).
  let farG, farM;
  const farParts = () => {
    if (!farG) { const random = Math.random; Math.random = rng(7070);
      try { farG = new THREE.PlaneGeometry(BW, BH); farM = new THREE.MeshBasicMaterial({ map: glowTex, side: THREE.DoubleSide }); } finally { Math.random = random; } }
    return [farG, farM];
  };
  const bookGlowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.25, 0.55), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending,
    depthWrite: false });
  const threadM = new THREE.LineBasicMaterial({ color: new THREE.Color(1.4, 0.95, 0.42), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending,
    depthWrite: false });
  {
    const S = tess.scene = new THREE.Scene(), dark = new THREE.Color('#070403');
    S.background = dark; S.fog = new THREE.Fog(dark, 8, 200);   // 40 layers deep (WF): far ones are just their glow (see tessWindow)
    S.environment = scene.environment; S.environmentIntensity = 0.12;
    const key = new THREE.DirectionalLight('#ffd7a0', 0.7); key.position.set(4, 6, 12);
    S.add(tess.hemi = new THREE.HemisphereLight('#ffd9a0', '#140b05', 0.35), key);
    tess.look = { exposure: 1.1, hemi: 0.35, sky: new THREE.Color('#ffd9a0'), ground: new THREE.Color('#140b05'), env: 0.12, bloom: 2.2, grade: 1,
      lights: [[key, 0.7]], aoSkip1: true };
    S.add(tess.root = new THREE.Group());
    tess.exit = makeGate(S, 0, 0, EXIT_Z, [2.2, 2.1, 2.0], [0.9, 0.82, 0.7]);   // the way back: white, the archive through it
    tess.exit.u.uOpen.value = tess.exit.u.uReady.value = 1;
    tess.pulled = new THREE.Mesh(bookG, new THREE.MeshStandardMaterial({ roughness: 0.75 }));
    Object.assign(tess.pulled, { visible: false, matrixAutoUpdate: false }); S.add(tess.pulled);
    // Dust in the light, wrapping round you so it never runs out.
    const N = 1400, pos = new Float32Array(N * 3), R = rng(7);
    for (let i = 0; i < N * 3; i++) pos[i] = R() * 30;
    tess.dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 } },
      vertexShader: `uniform vec3 uCam; uniform float uTime; varying float vA;
        void main() {
          vec3 p = mod(position + vec3(0.05, 0.11, 0.03) * uTime - uCam + 15.0, 30.0) - 15.0;
          vA = smoothstep(15.0, 4.0, length(p));
          vec4 mv = modelViewMatrix * vec4(p + uCam, 1.0); gl_PointSize = 26.0 / -mv.z; gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader:
        'varying float vA; void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.6, 1.15, 0.6, vA * smoothstep(0.5, 0.0, d) * 0.7); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    tess.dust.frustumCulled = false; tess.dust.layers.set(1); S.add(tess.dust);
  }

  // The whole history takes a while the first time (a call per commit): the server answers 202 with how far it's got until then.
  async function loadTree(f, progress) {
    if (tess.t?.repo === f) return true;
    for (;;) {
      const r = await fetch(`/api/repos/${encodeURIComponent(f.owner)}/${encodeURIComponent(f.name)}/tree`).then(async (x) =>
        ({ s: x.status, j: await x.json() })).catch(() => null);
      if (!r || r.s >= 400) return false;
      if (r.s === 200) { buildTess(f, r.j); return true; }
      if (!progress(r.j)) return false;
      await new Promise((ok) => setTimeout(ok, 700));
    }
  }
  function buildTess(f, d) {
    for (const o of [...tess.root.children]) { tess.root.remove(o); o.dispose?.();
      if (o.geometry !== caseG && o.geometry !== caseBackG && o.geometry !== bookG && o.geometry !== unitG && o.geometry !== plaqueG) o.geometry.dispose();
      if (o.material.map && o.material.map !== glowTex) { o.material.map.dispose(); o.material.dispose(); } }
    const commits = d.commits || [], K = Math.max(1, commits.length);
    // The tree at each commit, newest first: slice 0 is now, and each one after undoes the commit before it. Rather than a file
    // list per layer (there can be thousands), each file keeps the runs of layers it exists in: life[i] = [from, to, from, to...].
    const idx = new Map(), paths = [], size = [], life = [], open = new Map();
    const add = (p, s) =>
      { if (!idx.has(p)) { if (paths.length >= 5000) return -1; idx.set(p, paths.length); paths.push(p); size.push(s || 0); life.push([]); } return idx.get(p);
      };
    for (const [p, s] of d.files) { const i = add(p, s); if (i >= 0) open.set(i, 0); }
    const close = (p, k) => { const i = idx.get(p); if (i !== undefined && open.has(i)) { life[i].push(open.get(i), k); open.delete(i); } };
    const reopen = (p, s, k) => { const i = add(p, s); if (i >= 0 && !open.has(i)) open.set(i, k); };
    for (let k = 1; k < K; k++) for (const [fn, st, prev] of commits[k - 1].files) {
      if (st === 'added') close(fn, k - 1);
      else if (st === 'removed') reopen(fn, size[idx.get(fn)] || 2000, k);
      else if (st === 'renamed') { close(fn, k - 1); if (prev) reopen(prev, size[idx.get(fn)] || 2000, k); }
    }
    for (const [i, from] of open) life[i].push(from, K - 1);
    const slices = Array.from({ length: K }, (_, k) => {
      const c = commits[k] || { sha: d.head || '', message: '', author: '', date: null, files: [] };
      return { c, touched: new Set(c.files.map(([fn]) => idx.get(fn)).filter((i) => i !== undefined)) };
    });
    // Folders, laid out as the tree: each one's bookcases over its subfolders', a row per level down.
    const dirs = new Map(), byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
    const dirOf = (p) => {
      let x = dirs.get(p);
      if (x) return x;
      const cut = p.lastIndexOf('/');
      dirs.set(p, x = { path: p, name: p ? p.slice(cut + 1) : f.name, depth: p ? p.split('/').length : 0, files: [], kids: [] });
      if (p) dirOf(cut < 0 ? '' : p.slice(0, cut)).kids.push(x);
      return x;
    };
    dirOf('');
    paths.forEach((p, i) => { const cut = p.lastIndexOf('/'); dirOf(cut < 0 ? '' : p.slice(0, cut)).files.push(i); });
    let next = 0;
    const place = (x) => {
      x.files.sort((a, b) => byName(paths[a], paths[b])); x.kids.sort((a, b) => byName(a.name, b.name));
      x.cases = Math.max(1, Math.ceil(x.files.length / PER));
      const start = next;
      for (const k of x.kids) place(k);
      if (next - start < x.cases) next = start + x.cases;
      x.col = start + (next - start - x.cases) / 2;
    };
    place(dirs.get(''));
    const caseAt = (x, c) => new THREE.Vector3(TX + (x.col + c) * GX, -x.depth * GY, 0);
    const cases = [], rows = new Map();
    for (const x of dirs.values()) for (let c = 0; c < x.cases; c++) {
      const cs = { d: x, c, p: caseAt(x, c) };
      cases.push(cs);
      if (!rows.has(x.depth)) rows.set(x.depth, []);
      rows.get(x.depth).push(cs);
    }
    // Each file's book and spine label, in its layer's space (a layer is the same thing GZ further back).
    const at = new Array(paths.length), caseOf = new Map(cases.map((cs) => [`${cs.d.path}|${cs.c}`, cs]));
    for (const x of dirs.values()) x.files.forEach((i, r) => {
      const c = Math.floor(r / PER), q = r % PER, sh = Math.floor(q / 14), o = caseAt(x, c), Rr = rng(hash(paths[i]));
      const t = clamp(0.028 + (0.11 * Math.log10(size[i] + 10)) / 6, 0.03, SLOT - 0.012), h = SHELF * (0.62 + 0.3 * Rr()), dep = 0.24 + 0.06 * Rr();
      const base = o.y + BH / 2 - 0.05 - (sh + 1) * SHELF + 0.01, bx = o.x - BW / 2 + 0.06 + ((q % 14) + 0.5) * SLOT, bz = BD / 2 - dep / 2 - 0.015,
        lean = Rr() < 0.12 ? (Rr() - 0.5) * 0.2 : 0;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(bx, base + h / 2, bz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, lean)),
        new THREE.Vector3(t, h, dep));
      const lm = new THREE.Matrix4().compose(new THREE.Vector3(bx, base + h / 2, bz + dep / 2 + 0.001),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, lean + Math.PI / 2)), new THREE.Vector3(h * 0.9, t * 0.8, 1));
      at[i] = { m, lm, y: base + h / 2, h, color: new THREE.Color(bookColor(paths[i])).multiplyScalar(0.5 + 0.25 * Rr()) };
      const cs = caseOf.get(`${x.path}|${c}`); (cs.glow ||= new THREE.Color(0, 0, 0)).add(at[i].color); cs.n = (cs.n || 0) + 1;
    });
    // From afar a bookcase is its books' colours, glowing softly: their average, warmed (dim enough that the far layers, piling
    // up towards the vanishing point, don't bloom into a band).
    for (const cs of cases) cs.glow = cs.n ? cs.glow.multiplyScalar(0.55 / cs.n).lerp(new THREE.Color(0.62, 0.42, 0.2), 0.45) : new THREE.Color(0.3, 0.2, 0.1);
    // Spine labels (file names) and plaques (folder names), one atlas each.
    const SC = { w: 192, h: 28, cols: 10 }, labelCap = Math.min(paths.length, SC.cols * Math.floor(8192 / SC.h));
    const spines = makeCanvas(SC.cols * SC.w, 2 ** Math.ceil(Math.log2(Math.max(64, Math.ceil(labelCap / SC.cols) * SC.h)))), sc = spines.ctx;
    sc.font = `600 18px ${FONT}`; sc.fillStyle = '#f3e3c0'; sc.textBaseline = 'middle';
    for (let i = 0; i < labelCap;
      i++) sc.fillText(fit(sc, paths[i].slice(paths[i].lastIndexOf('/') + 1), SC.w - 12), (i % SC.cols) * SC.w + 6, Math.floor(i / SC.cols) * SC.h + SC.h / 2);
    spines.tex.needsUpdate = true;
    const labelUv = (i) => [(i % SC.cols) / SC.cols, 1 - ((Math.floor(i / SC.cols) + 1) * SC.h) / spines.H];
    const PC = { w: 512, h: 64, cols: 4 }, dl = [...dirs.values()].slice(0, PC.cols * 128);
    const plates = makeCanvas(PC.cols * PC.w, 2 ** Math.ceil(Math.log2(Math.max(64, Math.ceil(dl.length / PC.cols) * PC.h)))), pc = plates.ctx;
    dl.forEach((x, j) => {
      const px = (j % PC.cols) * PC.w, py = Math.floor(j / PC.cols) * PC.h;
      x.cell = j; x.uv = [(j % PC.cols) / PC.cols, 1 - ((Math.floor(j / PC.cols) + 1) * PC.h) / plates.H];
      pc.fillStyle = '#1a120a'; pc.fillRect(px, py, PC.w, PC.h); pc.strokeStyle = '#8a6a3a'; pc.lineWidth = 3;
      pc.strokeRect(px + 3, py + 3, PC.w - 6, PC.h - 6);
      pc.fillStyle = '#e8c27a'; pc.textAlign = 'center'; pc.textBaseline = 'middle'; pc.font = `600 30px ${MONO}`;
      pc.fillText(fit(pc, x.path ? `${x.name}/` : x.name, PC.w - 30), px + PC.w / 2, py + PC.h / 2 + 1);
    });
    plates.tex.needsUpdate = true;
    // Instanced meshes, refilled for the layers near you (see tessWindow).
    const KC = Math.min(K, 2 * WC + 1), KB = Math.min(K, 2 * WB + 1), KF = Math.min(K, 2 * WF + 1);
    const inst = (g, m, n, layer) =>
      { const x = new THREE.InstancedMesh(g, m, Math.max(1, n)); x.count = 0; x.frustumCulled = false; if (layer) x.layers.set(1); tess.root.add(x); return x;
      };
    const alive = (i, k) => { const r = life[i]; for (let j = 0; j < r.length; j += 2) if (k >= r[j] && k <= r[j + 1]) return true; return false; };
    const T = tess.t = { repo: f, K, paths, size, life, alive, slices, dirs, cases, rows, at, labelCap, labelUv, cur: -1, held: null, capped: d.capped };
    T.frames = inst(caseG, caseM, cases.length * KC);
    T.backs = inst(caseBackG, caseBackM, cases.length * KC);
    T.far = inst(...farParts(), cases.length * KF, true);   // the layers past WC: a panel per bookcase (see tessWindow)
    T.plaques = inst(plaqueG.clone(), atlasMat({ map: plates.tex, color: new THREE.Color(1.15, 1.1, 1.05) }), dl.length * KC);
    T.plaques.material.cell.set(1 / PC.cols, PC.h / plates.H);
    T.plaqueUv = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, dl.length * KC) * 2), 2); T.plaques.geometry.setAttribute('aUv', T.plaqueUv);
    T.books = inst(bookG, bookM_, paths.length * KB); T.books.castShadow = false;
    T.glow = inst(bookG, bookGlowM, paths.length * KB, true);
    T.labels = inst(unitG.clone(),
      atlasMat({ map: spines.tex, transparent: true, alphaTest: 0.15, color: new THREE.Color(1.0, 0.92, 0.78), depthWrite: false }), labelCap * KB, true);
    T.labels.material.cell.set(1 / SC.cols, SC.h / spines.H);
    T.labelUvA = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, labelCap * KB) * 2), 2); T.labels.geometry.setAttribute('aUv', T.labelUvA);
    // Golden threads: four through each bookcase's corners, from out toward the gateway back through every layer into the dark;
    // and in the layers near you, one from every folder down to each subfolder, and beams along each row (see tessWindow).
    const L = [], seg = (x0, y0, z0, x1, y1, z1) => L.push(x0, y0, z0, x1, y1, z1), zEnd = -(K - 1) * GZ - 40;
    for (const cs of cases) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) seg(cs.p.x + (sx * BW) / 2, cs.p.y + (sy * BH) / 2, EXIT_Z - 6,
      cs.p.x + (sx * BW) / 2, cs.p.y + (sy * BH) / 2, zEnd);
    const mid = (x) => caseAt(x, (x.cases - 1) / 2);
    let x0 = Infinity, x1 = -Infinity, deep = 0;
    for (const cs of cases) { x0 = Math.min(x0, cs.p.x); x1 = Math.max(x1, cs.p.x); deep = Math.max(deep, cs.d.depth); }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(L, 3)), threadM);
    lines.layers.set(1); lines.frustumCulled = false; tess.root.add(lines);
    const layer = [];   // one layer's links and beams, at z = 0
    for (const x of dirs.values()) for (const kid of x.kids) { const a = mid(x), b = mid(kid); layer.push(a.x, a.y - BH / 2, 0, b.x, b.y + BH / 2 + 0.3, 0); }
    for (const r of rows.keys()) for (const dy of [-BH / 2, BH / 2]) layer.push(x0 - 6, -r * GY + dy, -BD / 2, x1 + 6, -r * GY + dy, -BD / 2);
    T.layerL = layer;
    T.links = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(layer.length * KC), 3)),
      threadM);
    T.links.layers.set(1); T.links.frustumCulled = false; tess.root.add(T.links);
    T.top = clamp((K * GZ) / 25, 60, 320);   // top speed: the whole history in about 25 s flat out
    // A card hanging over each layer near you: which commit it is.
    T.cards = Array.from({ length: Math.min(K, 2 * WK + 1) }, () => {
      const cv = makeCanvas(640, 160),
        m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8),
        new THREE.MeshBasicMaterial({ map: cv.tex, transparent: true, depthWrite: false, color: new THREE.Color(1.2, 1.15, 1.1) }));
      m.layers.set(1); tess.root.add(m);
      return { cv, m, k: -1 };
    });
    T.rootP = mid(dirs.get(''));
    T.box = { x0: x0 - BW / 2 - 8, x1: x1 + BW / 2 + 8, y0: -deep * GY - BH / 2 - 6, y1: BH / 2 + 6, z0: zEnd + 20 };
    tess.exit.g.position.set(T.rootP.x, T.rootP.y, EXIT_Z);
  }

  // Refill the instanced meshes for the layers around layer k0: bookcases further out, books (and the glow on the ones the
  // layer's commit touched) closer in. Books are rebuilt from per-file matrices, shifted back GZ a layer.
  function tessWindow(k0, force) {
    const T = tess.t;
    if (!T || (k0 === T.cur && !force)) return;
    const moved = k0 !== T.cur, m = new THREE.Matrix4(), GLOW = new THREE.Vector3(1.3, 1.04, 1.04);
    T.cur = k0;
    let n = 0, np = 0, nb = 0, nl = 0, ng = 0;
    for (let k = Math.max(0, k0 - WC); k <= Math.min(T.K - 1, k0 + WC); k++) for (const cs of T.cases) {
      m.makeTranslation(cs.p.x, cs.p.y, -k * GZ); T.frames.setMatrixAt(n, m); T.backs.setMatrixAt(n, m); n++;
      if (cs.c === 0 && cs.d.uv) { m.makeTranslation(cs.p.x, cs.p.y + BH / 2 + 0.17, -k * GZ + BD / 2); T.plaques.setMatrixAt(np, m);
        T.plaqueUv.setXY(np, ...cs.d.uv); np++; }
    }
    for (let k = Math.max(0, k0 - WB); k <= Math.min(T.K - 1, k0 + WB); k++) {
      const z = -k * GZ, S = T.slices[k];
      for (let i = 0; i < T.paths.length; i++) {
        if (!T.alive(i, k) || (T.held?.k === k && T.held.i === i)) continue;
        const b = T.at[i];
        m.copy(b.m); m.elements[14] += z; T.books.setMatrixAt(nb, m); T.books.setColorAt(nb, b.color); nb++;
        if (S.touched.has(i)) { m.copy(b.m).scale(GLOW); m.elements[14] += z; T.glow.setMatrixAt(ng++, m); }
        if (i < T.labelCap) { m.copy(b.lm); m.elements[14] += z; T.labels.setMatrixAt(nl, m); T.labelUvA.setXY(nl, ...T.labelUv(i)); nl++; }
      }
    }
    let nf = 0;
    for (let k = Math.max(0, k0 - WF); k <= Math.min(T.K - 1, k0 + WF); k++) {
      if (Math.abs(k - k0) <= WC) continue;
      for (const cs of T.cases) { m.makeTranslation(cs.p.x, cs.p.y, -k * GZ); T.far.setMatrixAt(nf, m); T.far.setColorAt(nf, cs.glow); nf++; }
    }
    T.far.count = nf; T.far.instanceMatrix.needsUpdate = true; if (T.far.instanceColor) T.far.instanceColor.needsUpdate = true;
    T.frames.count = T.backs.count = n; T.plaques.count = np; T.books.count = nb; T.labels.count = nl; T.glow.count = ng;
    for (const x of [T.frames, T.backs, T.plaques, T.books, T.labels, T.glow]) x.instanceMatrix.needsUpdate = true;
    if (T.books.instanceColor) T.books.instanceColor.needsUpdate = true;
    T.plaqueUv.needsUpdate = T.labelUvA.needsUpdate = true;
    if (!moved) return;
    const pos = T.links.geometry.attributes.position, A = pos.array, LL = T.layerL;
    let o = 0;
    for (let k = Math.max(0, k0 - WC); k <= Math.min(T.K - 1, k0 + WC); k++, o += LL.length) for (let j = 0; j < LL.length; j += 3) { A[o + j] = LL[j];
      A[o + j + 1] = LL[j + 1]; A[o + j + 2] = LL[j + 2] - k * GZ; }
    T.links.geometry.setDrawRange(0, o / 3); pos.needsUpdate = true;
    const ks = []; for (let k = Math.max(0, k0 - WK); k <= Math.min(T.K - 1, k0 + WK); k++) ks.push(k);
    const free = T.cards.filter((c) => !ks.includes(c.k));
    for (const k of ks) if (!T.cards.some((c) => c.k === k)) paintCard(free.pop(), k);
    stripSync();
  }
  const ago = (k) => (k ? `${k} commit${k > 1 ? 's' : ''} back` : 'now');
  function paintCard(card, k) {
    const T = tess.t, c = T.slices[k].c, { ctx: x, W, H } = card.cv;
    card.k = k;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(20,12,5,.55)'; x.fillRect(0, 0, W, H); x.strokeStyle = 'rgba(232,194,122,.6)'; x.lineWidth = 2; x.strokeRect(1, 1, W - 2, H - 2);
    x.fillStyle = '#ffd58f'; x.font = `700 30px ${MONO}`; x.fillText(`${ago(k).toUpperCase()}  ·  ${(c.sha || '').slice(0, 7)}`, 22, 44);
    x.fillStyle = '#f3e3c0'; x.font = `500 26px ${FONT}`; x.fillText(fit(x, c.message || '—', W - 44), 22, 92);
    x.fillStyle = '#a8946c'; x.font = `500 20px ${FONT}`;
    x.fillText(fit(x,
      [c.author, c.date &&
      new Date(c.date).toLocaleString(undefined,
      { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · '), W - 44), 22, 132);
    card.cv.tex.needsUpdate = true;
    card.m.position.set(T.rootP.x, T.rootP.y + BH / 2 + 1.2, -k * GZ);
  }

  // The bottom strip: which layer you're in, where it is in time, and how to move.
  const stripEl = document.createElement('div');
  stripEl.className = 'of-tstrip';
  hud.appendChild(stripEl);
  function stripSync() {
    const T = tess.t, k = T.cur, c = T.slices[k].c;
    stripEl.innerHTML = `<b>${escapeHtml(T.repo.name)}</b> · ${ago(k)} · <code>${escapeHtml((c.sha || '').slice(0, 7))}</code> ${escapeHtml(c.message || '')}
      ${T.K <= 60 ? `<div class="bar">${T.slices.map((_, j) => `<i${j === k ? ' class="on"' : ''}></i>`).join('')}</div>`
        : `<div class="tl"><i style="left:${(k / (T.K - 1)) * 100}%"></i><span>now</span><span>${T.K - 1} commits back${T.capped ? ' (as far as the archive reaches)' : ' · the first commit'}</span></div>`}
      <small><kbd>W</kbd><kbd>S</kbd> fly where you look · <kbd>A</kbd><kbd>D</kbd> sideways · <kbd>Space</kbd> up · <kbd>C</kbd> down · hold <kbd>Shift</kbd> to build speed · deeper is further back in time · the way out is behind where you came in</small>`;
  }

  tess.enter = () => {
    const T = tess.t, r = T.rootP;
    Object.assign(ctx.player, { x: r.x, z: EXIT_Z - 9, eye: r.y - 0.4, yaw: 0, pitch: 0.02, seated: false, seat: null });
    tess.vel.set(0, 0, 0); tess.prevZ = EXIT_Z - 9; tess.armed = false;
    tessWindow(0, true);
    hud.classList.add('of-tess');
    toast(`<b>INSIDE ${escapeHtml(T.repo.name.toUpperCase())}</b> · the further in, the further back`);
  };
  tess.leave = () => {
    const T = tess.t;
    if (!tess.warping) pullFx(0);
    tess.boost = 0;
    if (camera.fov !== FOV0 && !tess.warping) { camera.fov = FOV0; camera.updateProjectionMatrix(); }
    if (T?.held) { T.held = null; tess.pulled.visible = false; tessWindow(T.cur, true); }
    pageEl.classList.remove('on');
    if (ctx.mode === 'read') ctx.mode = 'free';
    hud.classList.remove('of-tess');
  };
  tess.bound = (p) => {
    const b = tess.t.box;
    p.x = clamp(p.x, b.x0, b.x1); p.z = clamp(p.z, b.z0, EXIT_Z + 0.6); p.eye = clamp(p.eye ?? EYE, b.y0, b.y1);
  };
  tess.fx = (dt, t) => {
    const T = tess.t;
    if (!T) return;
    tessWindow(clamp(Math.round(-ctx.player.z / GZ), 0, T.K - 1));
    const u = tess.dust.material.uniforms; u.uCam.value.copy(camera.position); u.uTime.value = t;
    tess.exit.u.uTime.value = t; tess.exit.dial.rotation.z += dt * 0.15;
    for (const c of T.cards) c.m.lookAt(camera.position.x, c.m.position.y, camera.position.z);   // turned to face you
    const h = T.held;
    if (h) {
      h.e = h.to ? Math.min(1, h.e + dt / 0.35) : Math.max(0, h.e - dt / 0.3);
      const e = ease(h.e), b = T.at[h.i];
      tess.pulled.matrix.copy(b.m); tess.pulled.matrix.elements[14] += -h.k * GZ + e * 0.45; tess.pulled.matrix.elements[13] += e * 0.04;
      tess.pulled.matrixWorldNeedsUpdate = true;
      if (!h.e && !h.to) { T.held = null; tess.pulled.visible = false; tessWindow(T.cur, true); }
    }
    const g = tess.exit.g.position;   // through the white ring: back to the archive
    if (tess.prevZ < g.z && ctx.player.z >= g.z && Math.hypot(ctx.player.x - g.x, ctx.player.eye - g.y) < 1.8 && ctx.mode === 'free') exitTess();
    tess.prevZ = ctx.player.z;
    const d = Math.hypot(ctx.player.x - g.x, ctx.player.eye - g.y, ctx.player.z - g.z);
    if (d > PULL + 0.5) tess.armed = true;
    const s = tess.armed && ctx.player.z < g.z && ctx.mode === 'free' ? pullOf(d) : 0;
    if (s) { pullTo(dt, s, g.x, g.y, g.z + 0.8, true); tess.vel.multiplyScalar(1 - Math.min(1, s * 3 * dt)); }
    pullFx(s, WARP_OUT, g);
  };
  // What you're looking at: the books are in planes (each layer's front, or back if you're looking forward in time), so find
  // where the ray crosses the nearest few and which bookcase, shelf and slot that is.
  tess.pick = (ray) => {
    const T = tess.t;
    if (!T) return null;
    const o = ray.ray.origin, dv = ray.ray.direction;
    let best = null;
    if (Math.abs(dv.z) < 1e-4) return null;
    for (let k = Math.max(0, T.cur - 2); k <= Math.min(T.K - 1, T.cur + 2); k++) {
      const s = (-k * GZ + (dv.z < 0 ? BD / 2 : -BD / 2) - o.z) / dv.z;
      if (s <= 0 || s > 7 || (best && s >= best.s)) continue;
      const x = o.x + dv.x * s, y = o.y + dv.y * s, cs = T.rows.get(Math.round(-y / GY))?.find((c) => Math.abs(x - c.p.x) < BW / 2);
      if (!cs || Math.abs(y - cs.p.y) > BH / 2) continue;
      const sh = Math.floor((cs.p.y + BH / 2 - 0.05 - y) / SHELF), sl = Math.floor((x - (cs.p.x - BW / 2 + 0.06)) / SLOT);
      const i = sh >= 0 && sh < 4 && sl >= 0 && sl < 14 ? cs.d.files[cs.c * PER + sh * 14 + sl] : undefined;
      best = { s, k, i: i !== undefined && T.alive(i, k) && Math.abs(y - T.at[i].y) < T.at[i].h / 2 ? i : null };
    }
    return best?.i != null ? { action: 'book', book: { k: best.k, i: best.i } } : null;
  };
  tess.map = () => {   // a side view of the tree with you in it, and where you are in time down the right
    const c = mapCtx, W = 440, H = 330, T = tess.t, b = T.box, k = Math.min((W - 70) / (b.x1 - b.x0), (H - 70) / (b.y1 - b.y0));
    const sx = (x) => 20 + (x - b.x0) * k, sy = (y) => 50 + (b.y1 - y) * k;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#ffd58f'; c.font = '600 20px system-ui'; c.fillText(fit(c, `INSIDE · ${T.repo.name}`, W - 40), 16, 30);
    c.fillStyle = 'rgba(255,213,143,.45)';
    for (const cs of T.cases) c.fillRect(sx(cs.p.x - BW / 2), sy(cs.p.y + BH / 2), Math.max(2, BW * k), Math.max(2, BH * k));
    c.fillStyle = '#fff'; c.beginPath(); c.arc(sx(ctx.player.x), sy(ctx.player.eye), 5, 0, Math.PI * 2); c.fill();
    const t0 = 50, t1 = H - 20, u = clamp(-ctx.player.z / Math.max(1, (T.K - 1) * GZ), 0, 1);
    c.fillStyle = 'rgba(255,213,143,.25)'; c.fillRect(W - 24, t0, 4, t1 - t0);
    c.fillStyle = '#ffd58f'; c.fillRect(W - 30, t0 + u * (t1 - t0) - 2, 16, 4);
  };
  const flyV = new THREE.Vector3(), FOV0 = camera.fov;
  function flyPlayer(dt) {   // inside a repo you float: where you look, plus up and down
    const f = (ctx.keys.has('KeyW') || ctx.keys.has('ArrowUp') ? 1 : 0) - (ctx.keys.has('KeyS') || ctx.keys.has('ArrowDown') ? 1 : 0);
    const s = (ctx.keys.has('KeyD') || ctx.keys.has('ArrowRight') ? 1 : 0) - (ctx.keys.has('KeyA') || ctx.keys.has('ArrowLeft') ? 1 : 0);
    const up = (ctx.keys.has('Space') ? 1 : 0) - (ctx.keys.has('KeyC') || ctx.keys.has('KeyQ') ? 1 : 0);
    const cy = Math.cos(ctx.player.yaw), sy = Math.sin(ctx.player.yaw), cp = Math.cos(ctx.player.pitch), sp = Math.sin(ctx.player.pitch);
    flyV.set(-sy * cp * f + cy * s, sp * f + up, -cy * cp * f - sy * s);
    if (flyV.lengthSq() > 1) flyV.normalize();
    // Shift: faster, and the longer you hold it on the move the more it builds, up to a long glide (60 m/s after ~7 s);
    // let go or stop and it eases off. The view widens a touch with speed.
    const shift = ctx.keys.has('ShiftLeft') || ctx.keys.has('ShiftRight'), going = flyV.lengthSq() > 0.01;
    tess.boost = shift && going ? Math.min(1, (tess.boost || 0) + dt / 7) : Math.max(0, (tess.boost || 0) - dt / 1.2);
    const speed = shift ? lerp(9, tess.t?.top || 60, tess.boost ** 2) : 3.5;
    tess.vel.lerp(flyV.multiplyScalar(speed), Math.min(1, dt * (tess.vel.length() > speed ? 1.6 : 2.5)));
    const fov = FOV0 + 14 * clamp((tess.vel.length() - 6) / 50, 0, 1) + 6 * clamp((tess.vel.length() - 60) / 260, 0, 1) + 16 * (tess.pullS || 0);
    if (!tess.warping && Math.abs(camera.fov - fov) > 0.01) { camera.fov = damp(camera.fov, fov, 4, dt); camera.updateProjectionMatrix(); }
    ctx.player.x += tess.vel.x * dt; ctx.player.eye += tess.vel.y * dt; ctx.player.z += tess.vel.z * dt;
    tess.bound(ctx.player);
    ctx.setCam({ x: ctx.player.x, y: ctx.player.eye + Math.sin(performance.now() / 1300) * 0.02, z: ctx.player.z, yaw: ctx.player.yaw,
      pitch: ctx.player.pitch });
  }

  // Reading a book: it slides off the shelf toward you and opens as a page (the .of-page overlay), as it was in that commit.
  const pageEl = document.createElement('div');
  pageEl.className = 'of-page';
  hud.appendChild(pageEl);
  pageEl.addEventListener('error', (e) => {   // a broken image: its alt text instead
    const im = e.target;
    if (im.tagName !== 'IMG') return;
    const span = document.createElement('span'); span.className = 'ia'; span.textContent = im.alt ? `[${im.alt}]` : '';
    im.replaceWith(span);
  }, true);
  style.textContent += `
    .of-hud .of-fade { position: absolute; inset: 0; overflow: hidden; display: none; pointer-events: none; }
    .of-hud .of-fade.on { display: block !important; }
    .of-fade .rays { position: absolute; left: 50%; top: 50%; width: 260vmax; height: 260vmax; margin: -130vmax 0 0 -130vmax; opacity: 0;
      background: repeating-conic-gradient(var(--ray) 0deg .5deg, transparent .5deg 3.1deg); -webkit-mask: radial-gradient(circle, transparent 3%, #000 22%, #000 60%, transparent 72%); mask: radial-gradient(circle, transparent 3%, #000 22%, #000 60%, transparent 72%); }
    .of-fade .rays.b { background: repeating-conic-gradient(var(--ray) 0deg .25deg, transparent .25deg 5.3deg); }
    .of-fade .flash { position: absolute; inset: 0; opacity: 0; background: radial-gradient(circle, var(--flash) 0%, var(--flash) 18%, var(--bg) 75%); }
    .of-tstrip { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); width: min(760px, calc(100% - 32px)); display: none; text-align: center; background: rgba(15,10,5,.78); border: 1px solid rgba(255,200,120,.25); border-radius: 10px; padding: 7px 14px; color: #f0dcb4; }
    .of-tess .of-tstrip { display: block; }
    .of-tess .of-legend, .of-tess .of-count, .of-tess .of-time { display: none; }
    .of-tstrip b { color: #ffd58f; } .of-tstrip code { font: 12px ${MONO}; color: #c9a25c; }
    .of-tstrip small { display: block; color: #a8946c; font-size: 11px; } .of-tstrip kbd { font: inherit; font-weight: 600; color: #ffe2ad; background: rgba(255,213,143,.12); border-radius: 4px; padding: 0 4px; margin: 0 1px; }
    .of-tstrip .bar { display: flex; gap: 3px; justify-content: center; margin: 5px 0 4px; } .of-tstrip .bar i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,213,143,.22); }
    .of-tstrip .bar i.on { background: #ffd58f; box-shadow: 0 0 8px #ffb347; }
    .of-tstrip .tl { position: relative; height: 4px; margin: 8px 6px 16px; border-radius: 2px; background: rgba(255,213,143,.22); }
    .of-tstrip .tl i { position: absolute; top: -3px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: #ffd58f; box-shadow: 0 0 8px #ffb347; }
    .of-tstrip .tl span { position: absolute; top: 7px; left: 0; font-size: 10px; color: #a8946c; } .of-tstrip .tl span + span { left: auto; right: 0; }
    .of-hud .of-page { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: auto; background: radial-gradient(rgba(20,12,4,.3), rgba(5,3,1,.75)); }
    .of-hud .of-page.on { display: flex !important; }
    .of-page .pp { width: min(1000px, 92vw); height: min(760px, calc(100vh - 80px)); display: flex; flex-direction: column; background: #14100b; border: 1px solid #6b5530; border-radius: 10px; box-shadow: 0 0 90px rgba(255,170,70,.2); color: #ecdcbc; animation: of-pp-in .35s ease-out; }
    @keyframes of-pp-in { from { transform: scale(.94); opacity: 0; } }
    .of-page .hd { padding: 14px 18px 10px; border-bottom: 1px solid #3a2e1c; }
    .of-page .hd b { font: 600 16px ${MONO}; color: #ffd58f; overflow-wrap: anywhere; }
    .of-page .hd small { display: block; color: #a8946c; font-size: 12px; margin-top: 3px; overflow-wrap: anywhere; }
    .of-page .bd { flex: 1; overflow: auto; overscroll-behavior: contain; padding: 12px 0; }
    .of-page .code { font: 12.5px/1.55 ${MONO}; margin: 0; counter-reset: ln; white-space: pre; tab-size: 4; }
    .of-page .code span { display: block; padding-right: 18px; }
    .of-page .code span::before { counter-increment: ln; content: counter(ln); display: inline-block; width: 46px; padding-right: 14px; text-align: right; color: #5e4f36; }
    .of-page .md { padding: 0 24px; font: 14px/1.6 system-ui, sans-serif; }
    .of-page .md h2, .of-page .md h3, .of-page .md h4, .of-page .md h5, .of-page .md h6, .of-page .md h7 { color: #ffd58f; font-size: 16px; margin: 16px 0 6px; } .of-page .md h2 { font-size: 21px; }
    .of-page .md pre { background: #0b0805; padding: 8px 10px; overflow-x: auto; font: 12px/1.45 ${MONO}; } .of-page .md code { background: #2a2014; padding: 0 3px; font-family: ${MONO}; }
    .of-page .md img { max-width: 100%; height: auto; vertical-align: middle; } .of-page .md .ia { opacity: .6; font-style: italic; }
    .of-page .md p, .of-page .md ul, .of-page .md ol, .of-page .md blockquote { margin: 0 0 10px; overflow-wrap: anywhere; } .of-page .md .tr { white-space: pre; font: 12px ${MONO}; }
    .of-page a { color: #ffc46b; } .of-page .n { color: #a8946c; font-style: italic; padding: 0 18px; }
    .of-page .btns { display: flex; gap: 8px; justify-content: flex-end; padding: 10px 14px; border-top: 1px solid #3a2e1c; }
    .of-page .btns > * { font: 600 13px system-ui, sans-serif; background: #3a2c18; color: #ffe2ad; border: 1px solid #6b5530; border-radius: 7px; padding: 7px 13px; cursor: pointer; text-decoration: none; }
    .of-page .btns > :hover { background: #4d3a1f; } .of-page kbd { font: inherit; opacity: .7; }
    .of-folder .co { font: 700 12px "Courier New", monospace; letter-spacing: .14em; color: #5d574c; margin: 2px 0 8px; }
    .of-folder .co b { color: #b8352b; font-size: 17px; letter-spacing: .1em; border: 1px dashed #b8352b; padding: 1px 8px; margin-left: 6px; }
  `;
  pageEl.addEventListener('click', (e) => { if (e.target === pageEl || e.target.closest('[data-act=back]')) closeBook(true); });
  let pageTurnAt = 0;
  pageEl.addEventListener('scroll', (e) => {
    const el = e.target, now = performance.now();
    if (Math.abs(el.scrollTop - (el.turned || 0)) > 500 && now - pageTurnAt > 250) { el.turned = el.scrollTop; pageTurnAt = now;
      ctx.sfx.cabinet('page', camera.position, 0.12); }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!pageEl.classList.contains('on') || e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation(); closeBook(false);
  }, true);
  function readBook(b) {
    const T = tess.t;
    if (!T || T.held || ctx.mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    ctx.mode = 'read'; ctx.keys.clear(); tess.vel.set(0, 0, 0);
    T.held = { ...b, e: 0, to: 1 };
    tessWindow(T.cur, true);
    tess.pulled.material.color.copy(T.at[b.i].color); tess.pulled.visible = true;
    ctx.sfx.cabinet('book', new THREE.Vector3().setFromMatrixPosition(T.at[b.i].m).setZ(-b.k * GZ), 0.4);
    const c = T.slices[b.k].c, p = T.paths[b.i];
    pageEl.innerHTML = pageHtml(T, b, null); pageEl.classList.add('on');
    fetch(`/api/repos/${encodeURIComponent(T.repo.owner)}/${encodeURIComponent(T.repo.name)}/blob?ref=${encodeURIComponent(c.sha)}&path=${encodeURIComponent(p)}`)
      .then(async (x) => (x.ok ? x.json() : { error: (await x.json().catch(() => ({}))).error || `HTTP ${x.status}` })).catch((e) => ({ error: e.message }))
      .then((r) => { if (T.held?.i === b.i && T.held.k === b.k && T.held.to) pageEl.innerHTML = pageHtml(T, b, r); });
  }
  function closeBook(relock) {
    const T = tess.t;
    if (!T?.held?.to) return;
    T.held.to = 0;
    pageEl.classList.remove('on');
    ctx.sfx.cabinet('book', camera.position, 0.3);
    if (ctx.mode === 'read') ctx.mode = 'free';
    if (relock) renderer.domElement.requestPointerLock();
  }
  function pageHtml(T, b, r) {
    const p = T.paths[b.i], c = T.slices[b.k].c, s = escapeHtml;
    const when = c.date ? new Date(c.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    let body;
    if (!r) body = '<p class="n">Taking it off the shelf…</p>';
    else if (r.error) body = `<p class="n">Couldn’t read it: ${s(r.error)}</p>`;
    else if (r.text == null) body = `<p class="n">Nothing to read here: it’s ${s(r.why)}.</p>`;
    else if (/\.(md|markdown)$/i.test(p)) body = `<div class="md">${readmeHtml(r.text, T.repo.url, c.sha, p.split('/').slice(0, -1).join('/'))}</div>`;   // (its images: the default branch's)
    else body = `<pre class="code">${r.text.replace(/\n$/, '').split('\n').map((l) => `<span>${s(l) ||
      ' '}</span>`).join('')}</pre>${r.cut ? '<p class="n">…and on (cut short here).</p>' : ''}`;
    const url = `${T.repo.url}/blob/${c.sha}/${p.split('/').map(encodeURIComponent).join('/')}`;
    return `<div class="pp"><div class="hd"><b>${s(p)}</b><small>${fmtSize(T.size[b.i])} · as it was ${b.k ? `${b.k} commit${b.k > 1 ? 's' : ''} ago` : 'now'} · ${s(c.sha.slice(0, 7))} “${s(c.message)}”${when ? ` · ${s(when)}` : ''}${T.slices[b.k].touched.has(b.i) ? ' · this commit changed it' : ''}</small></div>
      <div class="bd">${body}</div><div class="btns"><a href="${s(url)}" target="_blank" rel="noopener noreferrer">Open on GitHub ↗</a><button data-act="back">Put it back <kbd>Esc</kbd></button></div></div>`;
  }
  function tessHover(h) {
    if (h.action === 'gatekey') return `<b>The gateway</b><div class="m">${escapeHtml(gate.msg)}</div><div class="k">${h.key ? `Click to ${h.key === 'CLOSE' ?
      'close the gateway' :
      `press ${h.key === 'GO' ? 'ENTER' : h.key === '⌫' ? 'delete' : h.key}`}` : 'Enter a repo’s coordinates (they’re in its folder)'}</div>`;
    const T = tess.t, { k, i } = h.book, p = T.paths[i];
    return `<b>${escapeHtml(p.slice(p.lastIndexOf('/') + 1))}</b><div class="m">${escapeHtml(p)}</div><div class="m">${fmtSize(T.size[i])}${T.slices[k].touched.has(i) ? ' · changed in this commit' : ''}</div>
      <div class="k">Click to read it as it was ${k ? `${k} commit${k > 1 ? 's' : ''} ago` : 'now'}</div>`;
  }
  Object.assign(ctx, { GATE, tess, fmtCoord, coordOf });
  ctx.action('gatekey', { hover: (h) => tessHover(h), click: (h) => gatePress(h.key) });
  ctx.action('book', { hover: (h) => tessHover(h), click: (h) => readBook(h.book) });
}
