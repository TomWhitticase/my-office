// THE ARCHIVE (B2): a bright white void with a freestanding lift back up and one steel filing cabinet holding your
// GitHub repos, a drawer per A-F, G-L, M-R, S-Z, each sliding out metres long with a hanging folder per repo. Pick a
// folder up to read it; its coordinates open the gateway (floors/gateway.js). Its own scene, drawn by renderFloor.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { escapeHtml } from '../../chat.js';
import { clamp, cyl, ease, F, fit, FONT, hash, LIFT, makeCanvas, mat, mergedBoxes, rng } from '../util.js';
import { MONO } from '../painters.js';

export function install(ctx) {
  const { ARCHIVE, hud, style, scene, hitBox, liftShaft, CAR, addFloor, mapCtx, camera, renderer } = ctx;
  Object.assign(ctx, { loadRepos, readmeHtml, cabinetHover, toggleDrawer, pickUp });
  // ----- THE ARCHIVE (B2) -----
  // A bright white void: a seamless floor fading into white haze, a freestanding lift back up, and in the middle one steel
  // filing cabinet (`arch.drawers`: a group per drawer, front at +z in the cabinet's space, so sliding one out is +z).
  // Its own scene and composer; while you're down here the office still runs, but isn't drawn or heard.
  const ARCH = { x: LIFT.x - 24, z: LIFT.z, r: 84 };   // the cabinet, 24 m out from the lift
  const arch = { n: ARCHIVE, label: 'ARCHIVE', title: 'The Archive', on: false, colliders: [], drawers: [], composer: null };
  {
    // Plain white haze, brightened by exposure (see renderFloor): an over-bright background clear gets clamped.
    const S = arch.scene = new THREE.Scene(), haze = new THREE.Color('#ffffff');
    S.background = haze; S.fog = new THREE.Fog(haze, 8, 95);   // far enough to make out the gateway, 70 m off
    S.environment = scene.environment; S.environmentIntensity = 0.7;
    const key = arch.key = new THREE.DirectionalLight('#ffffff', 0.75); key.position.set(-6, 14, 5);
    S.add(arch.hemi = new THREE.HemisphereLight('#ffffff', '#dcdcdc', 1.5), key);
    // Unlit and a shade under the haze, so it greys a touch around you and fades into the haze with no horizon at all.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.87, 0.87, 0.87) }));
    floor.rotation.x = -Math.PI / 2; floor.layers.set(1); S.add(floor);   // layer 1: out of the AO pass, which would draw the horizon back in
    // Soft contact shadows: a blurred black rectangle, a tight dark one and a wide faint one under each thing.
    const blob = makeCanvas(256, 256);
    blob.ctx.filter = 'blur(26px)'; blob.ctx.fillStyle = '#000'; blob.ctx.fillRect(64, 64, 128, 128); blob.tex.needsUpdate = true; arch.blob = blob.tex;
    const shadow = (parent, w, d, x, z, o) => {
      for (const [k, a] of [[1.15, o], [2.4, o * 0.35]]) {   // the dark core is the middle half of the texture
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 4 * k, d * 4 * k), new THREE.MeshBasicMaterial({ map: blob.tex, color: '#000', transparent: true, opacity: a, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, z); m.layers.set(1); parent.add(m);
      }
    };
    // THE ARCHIVE in the floor, reading as you walk from the lift to the cabinet.
    const word = makeCanvas(2048, 256), wc = word.ctx;
    wc.font = `200 150px ${FONT}`; wc.letterSpacing = '60px'; wc.fillStyle = '#ffffff'; wc.textAlign = 'center'; wc.textBaseline = 'middle';
    wc.fillText('THE ARCHIVE', 1024 + 30, 132); word.tex.needsUpdate = true;
    const words = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: word.tex, color: new THREE.Color(0.55, 0.55, 0.55), transparent: true, depthWrite: false }));
    words.rotation.order = 'YXZ'; words.rotation.set(-Math.PI / 2, Math.PI / 2, 0); words.position.set(ARCH.x + 3.2, 0.003, ARCH.z); words.layers.set(1);
    S.add(words);

    // The filing cabinet: powder-coated putty steel, a little scuffed, four drawers with pulls, label cards and a lock.
    const wear = makeCanvas(256, 512), R = rng(48), w = wear.ctx;
    w.fillStyle = '#9ea198'; w.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2500; i++) { w.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '40,40,36'},${R() * 0.05})`; w.fillRect(R() * 256, R() * 512, 1 + R() * 3, 1 + R() * 3); }
    for (let i = 0; i < 22; i++) { w.strokeStyle = `rgba(${R() > 0.4 ? '210,212,205' : '70,70,64'},${0.12 + R() * 0.2})`; w.lineWidth = 0.6 + R(); const x = R() * 256, y = R() * 512; w.beginPath(); w.moveTo(x, y); w.lineTo(x + (R() - 0.5) * 40, y + (R() - 0.5) * 10); w.stroke(); }
    const edge = w.createLinearGradient(0, 0, 256, 0); edge.addColorStop(0, 'rgba(60,60,55,.18)'); edge.addColorStop(0.06, 'rgba(0,0,0,0)'); edge.addColorStop(0.94, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(60,60,55,.18)');
    w.fillStyle = edge; w.fillRect(0, 0, 256, 512); wear.tex.needsUpdate = true;
    const bodyM = new THREE.MeshStandardMaterial({ map: wear.tex, metalness: 0.35, roughness: 0.48 }), chromeM = mat('#d7dade', { metalness: 1, roughness: 0.18 });
    const cab = arch.cabinet = new THREE.Group(), W = 0.47, H = 1.32, D = 0.62, base = 0.08, gap = 0.008, dh = (H - base - 0.012 - gap * 5) / 4;
    cab.position.set(ARCH.x, 0, ARCH.z); cab.rotation.y = Math.PI / 2;   // fronts face the lift
    cab.add(mergedBoxes([[0.012, H - base, D, -W / 2 + 0.006, base + (H - base) / 2, 0], [0.012, H - base, D, W / 2 - 0.006, base + (H - base) / 2, 0],
      [W, 0.012, D, 0, H - 0.006, 0], [W, H - base, 0.012, 0, base + (H - base) / 2, -D / 2 + 0.006]], bodyM));
    cab.add(mergedBoxes([[W - 0.03, 0.075, D - 0.05, 0, 0.0375, -0.01, '#2d2f2c'], [W - 0.024, H - base - 0.012, 0.004, 0, base + (H - base) / 2, D / 2 - 0.024, '#1e1f1d']], mat('#ffffff', { vertexColors: true, roughness: 0.7 })));
    ['A – F', 'G – L', 'M – R', 'S – Z'].reverse().forEach((t, i) => {
      const g = new THREE.Group(), fz = D / 2 - 0.011;
      g.position.set(0, base + gap + i * (dh + gap) + dh / 2, 0);
      g.add(mergedBoxes([[W - 0.024 - gap, dh, 0.02, 0, 0, fz]], bodyM));
      g.add(mergedBoxes([[0.15, 0.016, 0.014, 0, -0.035, fz + 0.03], [0.012, 0.016, 0.03, -0.068, -0.035, fz + 0.016], [0.012, 0.016, 0.03, 0.068, -0.035, fz + 0.016],
        [0.104, 0.054, 0.003, 0, 0.07, fz + 0.011]], chromeM));
      const card = makeCanvas(192, 96);
      card.ctx.fillStyle = '#f1ead9'; card.ctx.fillRect(0, 0, 192, 96); card.ctx.fillStyle = '#2b2a28'; card.ctx.font = `600 40px "Courier New", ${MONO}`; card.ctx.textAlign = 'center'; card.ctx.fillText(t, 96, 62);
      card.tex.needsUpdate = true;
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.044), new THREE.MeshStandardMaterial({ map: card.tex, roughness: 0.9 }));
      lab.position.set(0, 0.07, fz + 0.0128); g.add(lab);
      if (i === 3) { const lock = cyl(g, 0.011, 0.011, 0.012, '', W / 2 - 0.06, dh / 2 - 0.035, fz + 0.014, { material: chromeM, seg: 20 }); lock.rotation.x = Math.PI / 2; }
      cab.add(g); arch.drawers.push({ g, label: t, open: 0 });
    });
    arch.drawers.reverse();   // top drawer first
    arch.dims = { W, D, dh };
    arch.cabHit = hitBox(cab, W, H, D + 0.06, 0, H / 2, 0.03, { action: 'cabinet', reach: 4 });
    S.add(cab);
    shadow(S, D / 2 + 0.03, W / 2 + 0.03, ARCH.x, ARCH.z, 0.75);
    arch.colliders.push({ minX: ARCH.x - D / 2, maxX: ARCH.x + D / 2, minZ: ARCH.z - W / 2, maxZ: ARCH.z + W / 2 });

    // The lift back up: a freestanding stone shaft, the same car as upstairs, so the swap behind its doors is seamless.
    // Built about z = 0 and moved onto your car's z when you arrive (see arch.enter).
    Object.assign(arch, liftShaft());
    const lift = arch.lift, back = LIFT.x + 0.1 + CAR.d, sw = CAR.w / 2 + 0.3;
    shadow(lift, (back + 0.2 - LIFT.x) / 2, sw, (LIFT.x + back + 0.2) / 2, 0, 0.6);
    S.add(lift);
    arch.hits = [arch.cabHit, arch.callHit, arch.panel.mesh, cab, lift];
    // Brighter than the office, no bloom or grade (see renderFloor); the floor and its shadows stay out of the AO (layer 1).
    arch.look = { exposure: 1.5, hemi: 1.5, sky: new THREE.Color('#ffffff'), ground: new THREE.Color('#dcdcdc'), env: 0.7, bloom: 0, grade: 0, lights: [[key, 0.75]], aoSkip1: true };
    arch.enter = (z) => {
      arch.lift.position.z = z;
      arch.colliders.length = arch.nFixed;   // the cabinet, its open drawer (see cabinetFx) and the gateway
      loadRepos();
      arch.colliders.push({ minX: LIFT.x, maxX: LIFT.x + 0.3 + CAR.d, minZ: z - CAR.w / 2 - 0.3, maxZ: z + CAR.w / 2 + 0.3 });
    };
    arch.bound = (p) => {   // the void ends in a soft wall you don't see
      const dx = p.x - ARCH.x, dz = p.z - ARCH.z, d = Math.hypot(dx, dz);
      if (d > ARCH.r) { p.x = ARCH.x + (dx / d) * ARCH.r; p.z = ARCH.z + (dz / d) * ARCH.r; }
    };
    arch.map = drawArchiveMap;
    addFloor(arch);
  }
  function drawArchiveMap() {
    const x0 = ctx.GATE.x - 8, x1 = LIFT.x + 6, z0 = ARCH.z - 8, z1 = ctx.GATE.z + 8, k = Math.min(400 / (x1 - x0), 270 / (z1 - z0));
    const c = mapCtx, W = 440, H = 330, sx = (x) => W / 2 + (x - (x0 + x1) / 2) * k, sz = (z) => H / 2 + 18 + (z - (z0 + z1) / 2) * k;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(sx(ARCH.x), sz(ARCH.z), ARCH.r * k, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (const b of arch.colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(3, (b.maxX - b.minX) * k), Math.max(3, (b.maxZ - b.minZ) * k));
    c.font = '600 20px system-ui'; c.fillText('THE ARCHIVE · B2', 16, 30);
    c.font = '600 15px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText('Lift', sx(LIFT.x) - 6, sz(arch.lift.position.z) - 18); c.fillText('Cabinet', sx(ARCH.x) - 26, sz(ARCH.z) + 26); c.fillText('Gateway', sx(ctx.GATE.x) - 28, sz(ctx.GATE.z) + 34);
    c.fillRect(sx(ctx.GATE.x - ctx.GATE.PW / 2), sz(ctx.GATE.z - ctx.GATE.PD / 2 - 1.2), ctx.GATE.PW * k, (ctx.GATE.PD + 2.4) * k);
    const px = sx(camera.position.x), pz = sz(camera.position.z);
    c.save(); c.translate(px, pz); c.rotate(-camera.rotation.y);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }
  // ----- THE ARCHIVE's filing cabinet: your GitHub repos -----
  // Click a drawer and it slides out, and keeps on sliding: 4–14 m of steel drawer out of a 62 cm cabinet, with a hanging folder
  // per repo (filed by name into A–F, G–L, M–R, S–Z; anything else up front). The tray and folders are cut off at the cabinet's
  // dark backing, so nothing ever pokes out behind it. Click a folder to lift it out and read it (the .of-folder overlay).
  const LANG = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5', HTML: '#e34c26', CSS: '#563d7c', Java: '#b07219', 'C#': '#178600', 'C++': '#f34b7d',
    C: '#555555', Go: '#00add8', Rust: '#dea584', Shell: '#89e051', Swift: '#f05138', Kotlin: '#a97bff', Ruby: '#701516', PHP: '#4f5d95', Dart: '#00b4ab', Vue: '#41b883',
    Svelte: '#ff3e00', Lua: '#000080', 'Jupyter Notebook': '#da5b0b', GDScript: '#355570', Dockerfile: '#384d54', SCSS: '#c6538c', Astro: '#ff5a03' };
  const langColor = (l) => LANG[l] || (l ? `hsl(${hash(l) % 360},45%,48%)` : '#b9b4a6');
  const drawerOf = (name) => { const c = name[0].toUpperCase(); return !/[A-Z]/.test(c) ? 0 : c < 'G' ? 0 : c < 'M' ? 1 : c < 'S' ? 2 : 3; };
  const files = arch.files = { list: null, err: null, at: 0, loading: false, held: null, tabCell: { value: new THREE.Vector2(1, 1) } };
  const { W: CW, D: CD, dh: DH } = arch.dims, FZ = CD / 2 - 0.011, WI = CW - 0.06, CUT = CD / 2 - 0.03, RAIL = DH / 2 - 0.055, ROD = RAIL + 0.007;
  const TAB = { w: 0.17, h: 0.048, cols: 8, cw: 256, ch: 72 }, ZERO4 = new THREE.Matrix4().makeScale(0, 0, 0);
  const trayM = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5 }), folderM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  // One unit of drawer along -z, stretched to however much of it is out: floor, sides, the hanging-file rails and the slides.
  const trayG = mergedBoxes([[WI, 0.006, 1, 0, -DH / 2 + 0.023, -0.5, '#9ea198'], ...[-1, 1].flatMap((s) => [
    [0.006, RAIL + DH / 2 - 0.02, 1, s * WI / 2, (RAIL - DH / 2 + 0.02) / 2, -0.5, '#9ea198'],
    [0.014, 0.004, 1, s * (WI / 2 - 0.005), RAIL + 0.002, -0.5, '#d7dade'],
    [0.01, 0.034, 1, s * (WI / 2 + 0.009), -0.02, -0.5, '#6f726c']])], trayM).geometry;
  // A hanging folder about its rod, which rests on the rails; the body is white so the instance colour makes it manila or kraft.
  const folderG = mergedBoxes([[0.34, 0.2, 0.006, 0, -0.106, 0, '#ffffff'], [WI + 0.012, 0.006, 0.008, 0, 0, 0, '#45474a'],
    ...[-1, 1].map((s) => [0.006, 0.02, 0.008, s * 0.17, -0.008, 0, '#45474a'])], folderM).geometry;
  const tabG = new THREE.PlaneGeometry(TAB.w, TAB.h);
  // The loose paper packed between the folders: a sheet standing on the drawer floor, its top corner dog-eared (mirrored at
  // at random), white so the instance colour makes it a sheet, a form or a thin file.
  const paperG = (() => {
    const w = 0.29, h = 0.2, c = 0.028, x = w / 2, sh = new THREE.Shape([[-x, 0], [x, 0], [x, h - c], [x - c, h], [-x, h]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ShapeGeometry(sh).toNonIndexed(), n = g.attributes.position.count;
    const flap = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([x, h - c, 0, x - c, h, 0, x - c, h - c, 0.002], 3));
    flap.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3)); flap.setAttribute('color', new THREE.Float32BufferAttribute(new Array(9).fill(0.84), 3));
    return mergeGeometries([g, flap]);
  })();
  const paperM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  const PAPER = ['#f5f3ec', '#f1eee4', '#ece8dc', '#f7f6f1', '#e9e4d4', '#f5f3ec', '#e3ecf2', '#f2e6e4', '#dcc590', '#cfb07b', '#f3ecc8'];
  const tabAt = [-0.11, 0, 0.11].map((x) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0.028, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), new THREE.Vector3(1, 1, 1)));
  const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);   // the tab's other face, so it reads from either end of the drawer
  // Tabs share one atlas; each instance picks its cell with an offset attribute.
  const tabM = new THREE.MeshStandardMaterial({ roughness: 0.55, map: makeCanvas(4, 4).tex });
  tabM.onBeforeCompile = (sh) => {
    sh.uniforms.tabCell = files.tabCell;
    sh.vertexShader = 'attribute vec2 tabUv;\nuniform vec2 tabCell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvMapUv = vMapUv * tabCell + tabUv;');
  };
  arch.drawers.forEach((d, i) => {
    Object.assign(d, { k: 0, to: 0, L: 4.5, sp: 0.3, items: [] });
    d.tray = new THREE.Mesh(trayG, trayM); d.tray.position.z = FZ - 0.01; d.tray.castShadow = d.tray.receiveShadow = true; d.g.add(d.tray);
    d.hit = hitBox(d.g, CW - 0.03, DH, 0.05, 0, 0, FZ, { action: 'cabinet', reach: 4, drawerAt: () => i });
    // A soft shadow on the floor under what's out, fainter the higher the drawer.
    d.shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: arch.blob, color: '#000', transparent: true, opacity: 0.3 - d.g.position.y * 0.15, depthWrite: false }));
    d.shade.rotation.x = -Math.PI / 2; d.shade.layers.set(1); d.shade.visible = false; arch.cabinet.add(d.shade);
  });
  arch.cabHit.userData.drawerAt = (p) => arch.drawers.reduce((b, d, j) => (Math.abs(d.g.position.y - p.y) < Math.abs(arch.drawers[b].g.position.y - p.y) ? j : b), 0);
  arch.drawerBox = { minX: ARCH.x, maxX: ARCH.x, minZ: ARCH.z, maxZ: ARCH.z };
  arch.colliders.push(arch.drawerBox);
  Object.assign(arch, { fx: (dt, t) => { cabinetFx(dt); ctx.gateFx(dt, t); }, leave: cabinetReset, toggleDrawer, pickUp, putBack, loadRepos });   // fx/leave: floor hooks (see setFloor)

  function toggleDrawer(i) {
    const d = arch.drawers[i];
    if (!d || files.held) return;
    d.to = d.to ? 0 : 1;
    if (d.to) for (const o of arch.drawers) if (o !== d) o.to = 0;
    loadRepos();
  }
  const frontP = new THREE.Vector3();
  const drawerFront = (d) => frontP.set(ARCH.x + FZ + d.g.position.z, d.g.position.y, ARCH.z);   // the cabinet faces +x
  function cabinetFx(dt) {
    let out = 0, moving = false;
    for (const d of arch.drawers) {
      const dur = 0.7 + d.L * 0.07;
      if (d.to !== d.was) {   // set off: the latch lets go (opening from shut), and it rolls for as long as it'll travel
        if (d.to && d.k === 0) ctx.sfx.cabinet('latch', drawerFront(d), 0.35);
        d.roll?.stop(); d.roll = d.k === d.to ? null : ctx.sfx.roll(drawerFront(d), (d.to ? 1 - d.k : d.k) * dur);
        d.was = d.to;
      }
      if (d.k !== d.to) {
        d.k = d.to ? Math.min(1, d.k + dt / dur) : Math.max(0, d.k - dt / dur); moving = true;
        if (d.k === d.to) { ctx.sfx.cabinet(d.to ? 'thunk' : 'slam', drawerFront(d), d.to ? 0.45 : 0.6); d.roll = null; }
      }
      const s = (d.L - 0.4) * ease(d.k), n = d.items.length;
      d.g.position.z = s;
      if (d.roll) d.roll.move(drawerFront(d));
      d.tray.scale.z = Math.min(d.L, FZ - 0.01 - CUT + s);
      const shown = n ? clamp(Math.floor((FZ - 0.13 - CUT + s) / d.sp) + 1, 0, n) : 0;
      if (d.bodies) d.bodies.count = d.tabs.count = d.backs.count = shown;
      if (d.papers) { let a = 0, b = d.pz.length; while (a < b) { const c = (a + b) >> 1; if (d.pz[c] + s > CUT) a = c + 1; else b = c; } d.papers.count = a; }
      d.shade.visible = s > 0.05;
      if (d.shade.visible) { d.shade.scale.set(CW * 1.9, s + 0.3, 1); d.shade.position.set(0, 0.003, CD / 2 + s / 2); }
      out = Math.max(out, s);
      // Walk off and it slides home.
      if (d.to && !files.held) {
        const b = arch.drawerBox, dx = Math.max(b.minX - ctx.player.x, 0, ctx.player.x - b.maxX), dz = Math.max(b.minZ - ctx.player.z, 0, ctx.player.z - b.maxZ);
        if (Math.hypot(dx, dz) > 5) d.to = 0;
      }
    }
    Object.assign(arch.drawerBox, out > 0.02 ? { minX: ARCH.x + CD / 2, maxX: ARCH.x + FZ + 0.03 + out, minZ: ARCH.z - CW / 2, maxZ: ARCH.z + CW / 2 } : { minX: ARCH.x, maxX: ARCH.x, minZ: ARCH.z, maxZ: ARCH.z });
    if (moving && ctx.mode === 'free') ctx.collide(ctx.player);   // a drawer sliding into you pushes you along
    heldFx(dt);
  }

  async function loadRepos() {
    if (files.loading || (files.list && Date.now() - files.at < 10 * 60e3)) return;
    files.loading = true;
    const r = await fetch('/api/repos').then(async (x) => ({ ok: x.ok, j: await x.json() })).catch((e) => ({ ok: false, j: { error: e.message } }));
    files.loading = false;
    if (r.ok) Object.assign(files, { list: r.j.repos, err: null, at: Date.now() });
    else if (!files.list) files.err = r.j;
    if (!files.held && (r.ok || !files.list)) refile();
  }
  // gh missing, signed out or failing: every drawer holds one folder saying so.
  const errFolder = () => ({ error: true, name: files.err?.signin ? 'gh isn’t signed in' : 'GitHub unavailable', description: files.err?.error || '', language: '' });
  function refile() {
    const all = files.list || [errFolder()];
    paintTabs(all);
    arch.drawers.forEach((d, i) => fileDrawer(d, files.list ? all.filter((f) => drawerOf(f.name) === i) : all));
  }
  function paintTabs(all) {
    const { cols, cw, ch } = TAB, rows = Math.ceil(all.length / cols), H = Math.min(8192, 2 ** Math.ceil(Math.log2(Math.max(rows * ch, 64)))), cap = cols * Math.floor(H / ch);
    const a = files.atlas = makeCanvas(cols * cw, H), c = a.ctx;
    all.forEach((f, j) => {
      f.cell = Math.min(j, cap - 1);
      const x = (f.cell % cols) * cw, y = Math.floor(f.cell / cols) * ch, stamp = f.error ? 'SEE INSIDE' : f.archived ? 'ARCHIVED' : f.private ? 'PRIVATE' : f.fork ? 'FORK' : '';
      c.fillStyle = '#c9d2d6'; c.fillRect(x, y, cw, ch);   // the clear plastic tab
      c.fillStyle = '#f7f3e8'; c.fillRect(x + 4, y + 4, cw - 8, ch - 8);   // its paper insert
      c.fillStyle = f.error ? '#c0392b' : langColor(f.language); c.fillRect(x + 4, y + 4, 14, ch - 8);
      c.fillStyle = '#0b0b0a'; c.font = `700 27px ${FONT}`; c.textBaseline = 'alphabetic';
      c.fillText(fit(c, f.name, cw - 36), x + 26, y + 34);
      c.font = `600 16px ${FONT}`; c.fillStyle = '#4f4a40'; c.fillText(fit(c, f.language || (f.error ? 'my-office' : '—'), 110), x + 26, y + 58);
      if (stamp) {
        c.font = `700 14px "Courier New", ${MONO}`; const w = c.measureText(stamp).width + 10;
        c.save(); c.translate(x + cw - 12 - w / 2, y + 53); c.rotate(-0.06);
        c.strokeStyle = c.fillStyle = '#b8352b'; c.lineWidth = 2; c.strokeRect(-w / 2, -10, w, 19); c.textAlign = 'center'; c.fillText(stamp, 0, 4); c.restore();
      }
    });
    a.tex.needsUpdate = true;
    tabM.map.dispose(); tabM.map = a.tex; tabM.needsUpdate = true;
    files.tabCell.value.set(1 / cols, ch / H);
  }
  function fileDrawer(d, items) {
    for (const m of [d.bodies, d.tabs, d.backs, d.papers]) if (m) { d.g.remove(m); m.dispose(); if (m === d.tabs || m === d.backs) m.geometry.dispose(); }
    const n = items.length, R = rng(hash(d.label) + n);
    d.items = items; d.L = clamp(1.5 + n * 0.25, 4.5, 14); d.sp = Math.min(0.4, (d.L - 0.9) / Math.max(n, 1));
    const geo = tabG.clone();
    d.bodies = new THREE.InstancedMesh(folderG, folderM, Math.max(n, 1)); d.tabs = new THREE.InstancedMesh(geo, tabM, Math.max(n, 1)); d.backs = new THREE.InstancedMesh(geo.clone(), tabM, Math.max(n, 1));
    const uv = new Float32Array(Math.max(n, 1) * 2), m = new THREE.Matrix4(), t = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    const { cols, cw, ch } = TAB, cv = files.tabCell.value.y;
    items.forEach((f, j) => {
      e.set(-0.03 + (R() - 0.5) * 0.16, (R() - 0.5) * 0.02, (R() - 0.5) * 0.03);
      m.compose(new THREE.Vector3(0, ROD, FZ - 0.14 - j * d.sp), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      d.bodies.setMatrixAt(j, m); d.tabs.setMatrixAt(j, t.multiplyMatrices(m, tabAt[j % 3])); d.backs.setMatrixAt(j, t.multiply(FLIP));
      d.bodies.setColorAt(j, c.set(R() < 0.55 ? '#dcc48c' : '#c49d66').offsetHSL((R() - 0.5) * 0.02, 0, (R() - 0.5) * 0.06));
      uv[j * 2] = (f.cell % cols) * cw / (cols * cw); uv[j * 2 + 1] = 1 - (Math.floor(f.cell / cols) + 1) * cv;
    });
    const tabUv = new THREE.InstancedBufferAttribute(uv, 2);
    d.tabs.geometry.setAttribute('tabUv', tabUv); d.backs.geometry.setAttribute('tabUv', tabUv);
    for (const x of [d.bodies, d.tabs, d.backs]) {
      x.castShadow = true; x.computeBoundingSphere(); x.count = 0;
      Object.assign(x.userData, { action: 'folder', reach: 2.6, folderAt: (id) => ({ d, i: id }) });
      d.g.add(x);
    }
    d.backs.boundingSphere = d.tabs.boundingSphere = d.bodies.boundingSphere = d.bodies.boundingSphere.clone().union(d.tabs.boundingSphere);
    // Paper the whole way down: a sheet or thin file every ~1.3 cm, leaning a little, uneven, a few sticking up, none hard
    // against a folder. Ordered front to back (d.pz), so what's out of the cabinet is always the first `count`.
    const pz = d.pz = [], fz = items.map((_, j) => FZ - 0.14 - j * d.sp), back = FZ - 0.01 - d.L + 0.03, one = new THREE.Vector3();
    for (let z = FZ - 0.04; z > back; z -= 0.008 + R() * 0.01) if (!fz.some((f) => Math.abs(f - z) < 0.012)) pz.push(z);
    d.papers = new THREE.InstancedMesh(paperG, paperM, pz.length);
    const FLAT = new THREE.Matrix4().makeRotationZ(Math.PI).setPosition(0, 0.2, 0);
    pz.forEach((z, j) => {
      const up = R() < 0.06 ? 0.015 + R() * 0.035 : R() * 0.012, file = R() < 0.12, hgt = file ? 1.04 : 0.86 + R() * 0.12;
      e.set((R() - 0.5) * 0.12, (R() - 0.5) * 0.04, (R() - 0.5) * 0.025);
      m.compose(one.set((R() - 0.5) * 0.04, -DH / 2 + 0.027 + up, z), q.setFromEuler(e), new THREE.Vector3(R() < 0.5 ? -1 : 1, hgt, 1));
      if (R() > 0.2) m.multiply(FLAT);   // most stand the other way up, the dog-ear down out of sight
      d.papers.setMatrixAt(j, m);
      d.papers.setColorAt(j, c.set(file ? PAPER[8 + Math.floor(R() * 3)] : PAPER[Math.floor(R() * 8)]).offsetHSL(0, 0, (R() - 0.5) * 0.04));
    });
    d.papers.raycast = () => {};   // you look past the paper to the folder it's filed behind
    d.papers.count = 0; d.papers.receiveShadow = true; d.papers.frustumCulled = false;
    d.g.add(d.papers);
  }

  function cabinetHover(h) {
    if (h.action === 'cabinet') {
      const d = arch.drawers[h.drawer], n = files.list ? d.items.length : 0;
      return `<b>Filing cabinet · ${d.label}</b><div class="m">${files.list ? `${n} repo${n === 1 ? '' : 's'}` : files.loading ? 'Fetching your repos…' : files.err ? escapeHtml(errFolder().name) : ''}</div><div class="k">Click to ${d.to ? 'close' : 'open'} the drawer</div>`;
    }
    const f = h.folder.d.items[h.folder.i];
    if (!f) return '';
    return `<b>${escapeHtml(f.name)}</b>${f.description ? `<div class="m">${escapeHtml(f.description.slice(0, 160))}</div>` : ''}
      <div class="k">${[f.private && 'Private', f.archived && 'Archived', f.fork && 'Fork', f.language].filter(Boolean).map(escapeHtml).join(' · ')}${f.error ? '' : ' · '}click to pick it up</div>`;
  }

  // ----- picking a folder up -----
  // The folder lifts off its rails into your hands (a copy; its instance hides meanwhile), then opens as a paper overlay.
  const folderEl = document.createElement('div');
  folderEl.className = 'of-folder';
  hud.appendChild(folderEl);
  style.textContent += `
    .of-hud .of-folder { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: auto; background: radial-gradient(rgba(40,36,28,.08), rgba(40,36,28,.42)); color: #2a2722; font: 13px/1.5 system-ui, -apple-system, sans-serif; }
    .of-hud.of-bare > .of-folder.on, .of-hud .of-folder.on { display: flex !important; }
    .of-folder .fo { position: relative; width: min(1180px, 94vw); height: min(760px, calc(100vh - 90px)); margin-top: 26px; display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); background: #cfa96b; border-radius: 4px 8px 8px 8px; padding: 14px 14px 58px; box-shadow: 0 30px 90px rgba(0,0,0,.4); perspective: 1800px; animation: of-fo-in .3s ease-out; }
    .of-folder .tab { position: absolute; left: 0; top: -30px; height: 30px; max-width: 60%; padding: 6px 22px 0 16px; background: #cfa96b; border-radius: 8px 14px 0 0; font: 700 14px "Courier New", monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .of-folder .pg { background: #fbf8ef; overflow-y: auto; overscroll-behavior: contain; padding: 24px 28px; box-shadow: 0 1px 3px rgba(0,0,0,.18); }
    .of-folder .l { transform-origin: 100% 50%; animation: of-fo-open .7s cubic-bezier(.2,.7,.25,1) both; border-right: 1px solid #ded5c0; backface-visibility: hidden; }
    .of-folder .r { font: 13.5px/1.6 "Courier New", Courier, monospace; background: repeating-linear-gradient(#fbf8ef 0 1100px, #e9e2d0 1100px 1104px); }
    @keyframes of-fo-in { from { transform: translateY(30px) scale(.9); opacity: 0; } }
    @keyframes of-fo-open { from { transform: rotateY(-95deg); } }
    .of-folder h1 { font: 700 26px/1.2 "Courier New", monospace; margin: 0 0 2px; overflow-wrap: anywhere; }
    .of-folder .own { color: #8a8170; font-size: 12px; }
    .of-folder .stamps { margin: 12px 0 4px; min-height: 24px; }
    .of-folder .stamp { display: inline-block; border: 2px solid #b8352b; color: #b8352b; font: 700 12px "Courier New", monospace; letter-spacing: .14em; padding: 1px 8px; margin-right: 8px; border-radius: 3px; transform: rotate(-4deg); opacity: .85; }
    .of-folder .stamp.ok { border-color: #2f6b45; color: #2f6b45; transform: rotate(2deg); }
    .of-folder .desc { font-size: 14px; margin: 8px 0 12px; overflow-wrap: anywhere; }
    .of-folder dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; margin: 0; }
    .of-folder dt { color: #8a8170; } .of-folder dd { margin: 0; }
    .of-folder h3 { font: 700 11px system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #8a8170; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #e3dccb; }
    .of-folder .bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #e6dfcf; margin: 4px 0 6px; }
    .of-folder .lg { font-size: 12px; color: #5d574c; } .of-folder .lg span { margin-right: 12px; white-space: nowrap; }
    .of-folder .lg i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
    .of-folder .files { columns: 2; font: 12px/1.65 "Courier New", monospace; overflow-wrap: anywhere; }
    .of-folder .cm { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; font-size: 12px; }
    .of-folder .cm code { font: 12px "Courier New", monospace; color: #8a8170; } .of-folder .cm small { display: block; color: #8a8170; }
    .of-folder .r h2, .of-folder .r h3, .of-folder .r h4, .of-folder .r h5, .of-folder .r h6, .of-folder .r h7 { font: 700 15px/1.3 "Courier New", monospace; letter-spacing: 0; text-transform: none; color: #2a2722; border: 0; margin: 18px 0 6px; }
    .of-folder .r h2 { font-size: 22px; } .of-folder .r h3 { font-size: 18px; text-decoration: underline; }
    .of-folder .r p, .of-folder .r ul, .of-folder .r ol, .of-folder .r blockquote { margin: 0 0 10px; overflow-wrap: anywhere; }
    .of-folder .r blockquote { border-left: 3px solid #d9cfb8; padding-left: 10px; color: #5d574c; }
    .of-folder .r pre { background: #f1ecdf; padding: 8px 10px; overflow-x: auto; font: 12px/1.45 "Courier New", monospace; margin: 0 0 10px; }
    .of-folder .r code { background: #efe8d8; padding: 0 3px; } .of-folder .r .tr { white-space: pre; overflow-x: auto; font-size: 12px; }
    .of-folder a { color: #1f4f99; }
    .of-folder .n { color: #8a8170; font-style: italic; }
    .of-folder .btns { position: absolute; right: 14px; bottom: 12px; display: flex; gap: 8px; }
    .of-folder .btns > * { font: 600 13px system-ui, sans-serif; background: #2a2722; color: #f6f1e4; border: 0; border-radius: 7px; padding: 8px 14px; cursor: pointer; text-decoration: none; }
    .of-folder .btns > :hover { background: #000; }
    .of-folder kbd { font: inherit; opacity: .7; }
  `;
  let turnAt = 0;   // a page turning every so often as you scroll through
  folderEl.addEventListener('scroll', (e) => {
    const el = e.target, y = el.scrollTop, now = performance.now();
    if (Math.abs(y - (el.turned || 0)) > 420 && now - turnAt > 220) { el.turned = y; turnAt = now; if (files.held) ctx.sfx.cabinet('page', files.hand.position, 0.18); }
  }, true);
  folderEl.addEventListener('click', (e) => {
    if (e.target === folderEl || e.target.closest('[data-act=back]')) putBack(true);
  });
  document.addEventListener('keydown', (e) => {
    if (!files.held || e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation(); putBack(false);
  }, true);
  function pickUp(at) {
    const { d, i } = at || {}, f = d?.items[i];
    if (!f || files.held || ctx.mode !== 'free') return;
    if (document.pointerLockElement) document.exitPointerLock();
    ctx.mode = 'folder'; ctx.keys.clear();
    const h = files.held = { d, i, f, k: 0, to: 1, m: [d.bodies, d.tabs, d.backs].map((x) => x.getMatrixAt(i, new THREE.Matrix4())), p: new THREE.Vector3(), q: new THREE.Quaternion() };
    for (const x of [d.bodies, d.tabs, d.backs]) { x.setMatrixAt(i, ZERO4); x.instanceMatrix.needsUpdate = true; }
    if (!files.hand) {   // the folder in your hands: the same body, its own copy of the tab
      const g = files.hand = new THREE.Group(), tab = files.handTab = makeCanvas(TAB.cw, TAB.ch);
      g.add(files.handBody = new THREE.Mesh(folderG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
      const t = new THREE.Mesh(tabG, new THREE.MeshStandardMaterial({ map: tab.tex, roughness: 0.55, side: THREE.DoubleSide }));
      t.applyMatrix4(tabAt[1]); g.add(t);
    }
    d.bodies.getColorAt(i, files.handBody.material.color);
    const { cols, cw, ch } = TAB;
    files.handTab.ctx.drawImage(files.atlas.canvas, (f.cell % cols) * cw, Math.floor(f.cell / cols) * ch, cw, ch, 0, 0, cw, ch); files.handTab.tex.needsUpdate = true;
    arch.scene.updateMatrixWorld();
    new THREE.Matrix4().multiplyMatrices(d.g.matrixWorld, h.m[0]).decompose(h.p, h.q, new THREE.Vector3());
    arch.scene.add(files.hand);
    ctx.sfx.cabinet('rustle', h.p, 0.5);
    showFolder(f, null);
    if (!f.error) fetch(`/api/repos/${encodeURIComponent(f.owner)}/${encodeURIComponent(f.name)}`).then(async (x) => ({ ok: x.ok, j: await x.json() })).catch((e) => ({ ok: false, j: { error: e.message } }))
      .then((r) => { if (files.held?.f === f) showFolder(f, r.ok ? r.j : { error: r.j.error || 'couldn’t read the repo' }); });
  }
  function putBack(relock) {
    const h = files.held;
    if (!h || !h.to) return;
    h.to = 0;
    folderEl.classList.remove('on');
    if (relock) renderer.domElement.requestPointerLock();
  }
  const handP = new THREE.Vector3(), handQ = new THREE.Quaternion(), TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0));
  function heldFx(dt) {
    const h = files.held;
    if (!h) return;
    h.k = h.to ? Math.min(1, h.k + dt / 0.55) : Math.max(0, h.k - dt / 0.5);
    if (h.k === 1 && !folderEl.classList.contains('on')) folderEl.classList.add('on');
    if (h.k === 0 && !h.to) { dropHeld(); return; }
    // Held up in front of your eyes, rising out of the drawer on a little arc.
    camera.updateMatrixWorld();
    handP.set(0, 0.07, -0.42).applyMatrix4(camera.matrixWorld);
    handQ.copy(camera.quaternion).multiply(TILT);
    const e = ease(h.k);
    files.hand.position.lerpVectors(h.p, handP, e); files.hand.position.y += Math.sin(Math.PI * h.k) * 0.25;
    files.hand.quaternion.slerpQuaternions(h.q, handQ, e);
  }
  function dropHeld(quiet) {
    const h = files.held;
    files.held = null;
    if (!h) return;
    if (!quiet) ctx.sfx.cabinet('rustle', h.p, 0.45);
    [h.d.bodies, h.d.tabs, h.d.backs].forEach((x, j) => { x.setMatrixAt(h.i, h.m[j]); x.instanceMatrix.needsUpdate = true; });
    arch.scene.remove(files.hand);
    folderEl.classList.remove('on');
    if (ctx.mode === 'folder') ctx.mode = 'free';
  }
  function cabinetReset() {   // leaving B2: everything filed away and shut
    if (!ctx.tess.warping) ctx.pullFx(0);
    dropHeld(true);
    for (const d of arch.drawers) { d.roll?.stop(); d.k = d.to = d.was = 0; d.roll = null; }
    cabinetFx(0);
  }

  // The folder's contents. Everything from GitHub is escaped; the README is a small markdown subset with no HTML.
  const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
  function showFolder(f, x) {
    const s = (v) => escapeHtml(v), when = (t) => (t ? `${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${F.dur(Date.now() - Date.parse(t))} ago` : '—');
    let left, right;
    if (f.error) {
      left = `<h1>${s(f.name)}</h1><div class="stamps"><span class="stamp">NOT FILED</span></div>
        <p class="desc">The archive reads your repos through the GitHub CLI on this computer${files.err?.signin ? ', and it isn’t signed in' : ', and it failed'}.</p>
        <h3>To fix it</h3><p>In a terminal on this computer, run</p><pre style="font:14px 'Courier New',monospace;background:#f1ecdf;padding:8px 10px">gh auth login</pre>
        <p>then ride the lift back down (or reopen a drawer). If gh isn’t installed: <a href="https://cli.github.com" target="_blank" rel="noopener noreferrer">cli.github.com</a>.</p>`;
      right = `<h3>What gh said</h3><p>${s(f.description || 'nothing')}</p>`;
    } else {
      const st = [f.private ? '<span class="stamp">PRIVATE</span>' : '<span class="stamp ok">PUBLIC</span>', f.archived && '<span class="stamp">ARCHIVED</span>', f.fork && '<span class="stamp">FORK</span>'].filter(Boolean).join('');
      const langs = x?.languages?.filter((l) => l.size > 0) || [], total = langs.reduce((a, l) => a + l.size, 0);
      const col = (l) => (COLOR_RE.test(l.color || '') ? l.color : langColor(l.name));
      left = `<h1>${s(f.name)}</h1><div class="own">${s(f.owner)}/${s(f.name)}</div><div class="stamps">${st}</div>
        <div class="co">COORDINATES<b>${ctx.fmtCoord(ctx.coordOf(f))}</b></div>
        ${f.description ? `<p class="desc">${s(f.description)}</p>` : '<p class="desc n">No description.</p>'}
        <dl><dt>Language</dt><dd>${s(f.language || '—')}</dd><dt>Stars</dt><dd>★ ${f.stars}</dd><dt>Updated</dt><dd>${s(when(f.updatedAt))}</dd><dt>Size</dt><dd>${f.kb >= 1024 ? `${(f.kb / 1024).toFixed(1)} MB` : `${f.kb} KB`}</dd>
        ${x && !x.error ? `<dt>Branch</dt><dd>${s(x.branch || '—')}</dd><dt>Open PRs</dt><dd>${x.prs}</dd><dt>Open issues</dt><dd>${x.issues}</dd>` : ''}</dl>
        ${total ? `<h3>Languages</h3><div class="bar">${langs.map((l) => `<i style="width:${(l.size / total) * 100}%;background:${col(l)}"></i>`).join('')}</div>
          <div class="lg">${langs.slice(0, 8).map((l) => `<span><i style="background:${col(l)}"></i>${s(l.name)} ${((l.size / total) * 100).toFixed(1)}%</span>`).join('')}</div>` : ''}
        ${!x ? '<h3>Files</h3><p class="n">Reading the folder…</p>' : x.error ? `<h3>Files</h3><p class="n">Couldn’t read it: ${s(x.error)}</p>` : `
          <h3>Files</h3>${x.files.length ? `<div class="files">${x.files.map((e) => `<div>${e.type === 'dir' ? '▸ ' : '&nbsp; '}${s(e.name)}${e.type === 'dir' ? '/' : ''}</div>`).join('')}</div>` : '<p class="n">Empty.</p>'}
          <h3>Last commits</h3>${x.commits.length ? `<div class="cm">${x.commits.map((c) => `<code>${s(c.sha)}</code><div>${s(c.message)}<small>${s(c.author)} · ${s(when(c.date))}</small></div>`).join('')}</div>` : '<p class="n">None.</p>'}`}`;
      right = !x ? '<p class="n">Reading the folder…</p>' : x.error ? '' : x.readme ? readmeHtml(x.readme.text, f.url, x.branch) : '<p class="n">No README in this one.</p>';
    }
    folderEl.innerHTML = `<div class="fo"><div class="tab">${s(f.name)}</div><div class="pg l">${left}</div><div class="pg r">${right}</div>
      <div class="btns">${f.url ? `<a href="${s(f.url)}" target="_blank" rel="noopener noreferrer">Open on GitHub ↗</a>` : ''}<button data-act="back">Put back <kbd>Esc</kbd></button></div></div>`;
  }
  function readmeHtml(text, url, branch) {
    const href = (h) => (/^https?:\/\//i.test(h) ? h : h.startsWith('#') ? '' : `${escapeHtml(url)}/blob/${escapeHtml(branch || 'HEAD')}/${h.replace(/^\.?\//, '')}`);
    const inline = (t) => escapeHtml(t).replace(/!\[([^\]]*)\]\([^)]*\)/g, (m, a) => (a ? `[${a}]` : ''))
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (m, t2, h) => (href(h) ? `<a href="${href(h)}" target="_blank" rel="noopener noreferrer">${t2}</a>` : t2))
      .split(/(`[^`]+`)/).map((p, j) => (j % 2 ? `<code>${p.slice(1, -1)}</code>` : p
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])[*_]([^*_\s][^*_]*)[*_](?=[\s).,:;!?]|$)/g, '$1<i>$2</i>'))).join('');
    const out = [];
    let para = [], list = null, code = null;
    const flush = () => {
      if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
      if (list) { out.push(`</${list}>`); list = null; }
    };
    for (const raw of String(text).replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
      if (/^\s*(```|~~~)/.test(raw)) { if (code) { out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`); code = null; } else { flush(); code = []; } continue; }
      if (code) { code.push(raw); continue; }
      const l = raw.replace(/<\/?[a-z][^>]*>/gi, '');
      let m;
      if (!l.trim()) { if (!/^\s*<\/?[a-z]/i.test(raw)) flush(); }
      else if ((m = l.match(/^\s*(#{1,6})\s+(.*)/))) { flush(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2].replace(/\s#+\s*$/, ''))}</h${n}>`); }
      else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push('<hr>'); }
      else if ((m = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)/))) {
        const t = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (para.length || list !== t) flush();
        if (!list) { out.push(`<${t}>`); list = t; }
        out.push(`<li>${inline(m[2])}</li>`);
      }
      else if ((m = l.match(/^\s*>\s?(.*)/))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
      else if (/^\s*\|/.test(l)) { flush(); if (!/^\s*\|[\s:|-]+\|?\s*$/.test(l)) out.push(`<div class="tr">${inline(l.trim())}</div>`); }
      else { if (list) flush(); para.push(l.trim()); }
    }
    if (code) out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`);
    flush();
    return out.join('') || '<p class="n">The README is empty.</p>';
  }
  Object.assign(ctx, { ARCH, arch, files, langColor });
  ctx.action('cabinet', { hover: (h) => cabinetHover(h), click: (h) => toggleDrawer(h.drawer) });
  ctx.action('folder', { hover: (h) => cabinetHover(h), click: (h) => pickUp(h.folder) });
}
