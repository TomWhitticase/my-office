// Security cameras round the building and the feeds for the Security app on your desktop (desktop.js). Each camera is
// a small dome on a ceiling or a bullet on a bracket, with an LED that's red while its feed is being watched and green
// otherwise. The archive has one, in its entrance hall; the void and the gateway have none.
//
// Feeds are drawn only while the app shows them: desktop.js calls dash.cctv.want([{ id, canvas }]) with the canvases on
// screen (none when the window's closed, minimised or covered), and they're refreshed round-robin, one a frame at a few
// fps each, at the canvas's own (low) resolution. A feed renders its floor's scene with the main renderer into a small
// HDR target (no AO or bloom), then a CCTV grade (tone mapping, desaturated green-grey, noise, scanlines and a vignette)
// draws it into a corner of the office's own canvas, and createImageBitmap snapshots that on the GPU before the office's
// frame draws over it, into the app's canvas (a bitmaprenderer). An async read-back of a render target stalled the GPU
// for 100+ ms each time in Chrome, and drawImage into a small (CPU) 2D canvas cost ~20 ms; the read-back is kept only as
// the fallback for a canvas too small to borrow. While the 3D view is closed (your desktop
// full screen) the office keeps running for the feeds on a loop of its own (resume()).

import * as THREE from 'three';
import { dash, mat, ME_LAYER, rng } from '../util.js';

// Floor, name, where it's mounted ('dome' under the ceiling, or a beam at `ceil`; 'wall' on a bracket from the point `wall`;
// 'pole' on a mast from the deck), where the lens is and what it looks at, in its floor's own space (the hall's root, the
// roof's deck). The office's ceiling beams run along z every 4 m (x = 2 mod 4) down to 3.02 m: cameras hang below them.
// `pan` is how far it turns either way from there (degrees: wall cameras less, so they don't stare into the wall; domes
// and masts all the way round); tilt is TILT, zoom 1-ZOOM, both for all. The Security app aims them (office.cameras).
const CAMS = [
  { id: 'desks-nw', n: 48, name: 'Desk floor · North-west', kind: 'wall', p: [-19.55, 2.85, -14.55], wall: [-19.95, 2.85, -14.95], at: [-6, 0.2, -2], pan: 40 },
  { id: 'desks-se', n: 48, name: 'Desk floor · South-east', kind: 'dome', ceil: 3.02, p: [2, 2.95, 1.4], at: [-10, 0.4, -11] },
  { id: 'breakroom', n: 48, name: 'Breakroom & kitchen', kind: 'dome', ceil: 3.02, p: [-2, 2.95, 3.2], at: [-13, 0.4, 12] },
  { id: 'lounge', n: 48, name: 'Lounge', kind: 'wall', p: [13.5, 2.85, 3.4], wall: [13.9, 2.85, 3.0], at: [6, 0.4, 12], pan: 60 },
  { id: 'lobby', n: 48, name: 'Lift lobby', kind: 'dome', ceil: 3.02, p: [10, 2.95, -2.6], at: [18, 0.9, 0.4] },
  { id: 'meeting', n: 48, name: 'Meeting rooms corridor', kind: 'wall', p: [12.9, 2.85, 14.5], wall: [12.9, 2.85, 14.95], at: [13, 0.7, 1], pan: 60 },
  { id: 'my-office', n: 48, name: 'Private office', kind: 'wall', p: [19.55, 2.85, -14.55], wall: [19.95, 2.85, -14.95], at: [11, 0.4, -7], pan: 40 },
  { id: 'hall-vestibule', n: 47, name: 'Vestibule', kind: 'wall', fov: 68, p: [17.55, 2.9, -1.95], wall: [17.75, 2.9, -2.15], at: [14.5, 0.9, 0.6], pan: 40 },
  { id: 'hall-aisle', n: 47, name: 'Cold aisle A/B', kind: 'wall', p: [12.1, 1.85, 0.3], wall: [12.1, 2.1, 0.3], at: [0, 0.8, 0], pan: 60 },
  { id: 'hall-noc', n: 47, name: 'NOC', kind: 'wall', p: [-17.4, 2.7, 18.5], wall: [-17.1, 2.7, 18.9], at: [-18.8, 0.9, 12.6], pan: 40 },
  { id: 'roof-terrace', n: 50, name: 'Roof terrace', kind: 'pole', p: [17.4, 3.4, -13.6], at: [0, 0.2, -6] },
  { id: 'roof-helipad', n: 50, name: 'Helipad', kind: 'pole', p: [-1.6, 3.6, 3.6], at: [-9.5, 0.4, 8.6] },
  // The archive's entrance hall (floors/archive-entrance.js, about the car's z): high in the corner by the vault door,
  // looking back at the lift and the counter. The void itself has none.
  { id: 'archive-hall', n: -2, name: 'Entrance hall', kind: 'wall', fov: 70, p: [7.45, 3.55, 3.25], wall: [7.04, 3.55, 3.45], at: [16, 0.6, -1.2], pan: 50 },
  // The restricted level (floors/restricted.js, about the car's z): there, but `dead`: never a picture, whatever the app says.
  { id: 'restricted-lift', n: -3, name: 'Lift landing', kind: 'dome', ceil: 2.75, p: [15.2, 2.7, 0], at: [18.6, 0.8, 0], dead: true },
  { id: 'restricted-corridor', n: -3, name: 'Corridor', kind: 'wall', p: [13.82, 2.45, -1.05], wall: [14.1, 2.45, -1.2], at: [4, 0.6, 1], pan: 50, dead: true },
];
const LAYER = 3;   // the cameras' own bodies: the office's view sees them, the feeds don't (no lens in its own shot)
const SLOT = 1;    // feeds refreshed per frame at most
const FPS = { grid: 4, one: 12 };   // full screen; on the monitor, while the office is drawn too, a quarter of that
const TILT = [-40, 25], ZOOM = 3, PAN = { dome: 170, wall: 70, pole: 120 };
const FAR = 30;    // indoors: the city through the windows is the office's dearest part to draw, and blown out on CCTV anyway

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three gives every object a uuid from Math.random: build with a seeded one, so the cameras don't shift the draws
  // made after them (see helicopter.js).
  const random = Math.random;
  Math.random = rng(4848);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { world, scene, renderer, camera, FLOORS, hole } = ctx;
  const floorOf = (n) => FLOORS.find((F) => F.n === n);
  camera.layers.enable(LAYER);

  // ----- the cameras -----
  const whiteM = mat('#e8eaec', { roughness: 0.45, metalness: 0.1 }), greyM = mat('#9ba1a7', { roughness: 0.5, metalness: 0.5 });
  const glassM = mat('#121417', { roughness: 0.08, metalness: 0.6 });
  const v = new THREE.Vector3(), m4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  const part = (g, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.layers.set(LAYER); g.add(o); return o; };
  // A rod between two points, in group g's space.
  const rod = (g, a, b, r, m) => {
    const len = a.distanceTo(b), o = part(g, new THREE.CylinderGeometry(r, r, len, 10), m);
    o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(UP, v.copy(b).sub(a).normalize());
    return o;
  };
  const cams = CAMS.map((c) => {
    const F = floorOf(c.n), parent = c.n === 48 ? world : F.cctv.root, g = new THREE.Group();
    const p = new THREE.Vector3(...c.p), at = new THREE.Vector3(...c.at);
    g.name = `cctv:${c.id}`;
    parent.add(g);
    const ledM = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#22ff55', emissiveIntensity: 2 });
    // The housing: +z of `head` points down the lens. It turns about `pivot` (a bullet about its mount, `reach` behind the
    // lens; a dome about its lens), from the aim it was built with (yaw0, pitch0) by the app's pan and tilt.
    const head = new THREE.Group(), d0 = v.copy(at).sub(p).normalize();
    const yaw0 = Math.atan2(d0.x, d0.z), pitch0 = Math.asin(d0.y), reach = c.kind === 'dome' ? 0 : 0.22;
    head.position.copy(p); head.quaternion.setFromRotationMatrix(m4.lookAt(at, p, UP));
    g.add(head);
    if (c.kind === 'dome') {
      const base = part(g, new THREE.CylinderGeometry(0.1, 0.11, 0.035, 24), whiteM, p.x, (c.ceil ?? 3.3) - 0.018, p.z);
      part(g, new THREE.SphereGeometry(0.075, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassM, p.x, base.position.y - 0.017, p.z);
      part(g, new THREE.SphereGeometry(0.008, 8, 6), ledM, p.x + 0.085, base.position.y - 0.019, p.z);
      part(head, new THREE.CylinderGeometry(0.022, 0.022, 0.04, 12), greyM, 0, 0, -0.01).rotation.x = Math.PI / 2;
    } else {
      // Bullet: a white body with a sun shield, the lens's dark glass at the front, the LED under it.
      const body = part(head, new THREE.CylinderGeometry(0.045, 0.045, 0.22, 16), whiteM, 0, 0, -0.13);
      body.rotation.x = Math.PI / 2;
      part(head, new THREE.BoxGeometry(0.11, 0.008, 0.27), whiteM, 0, 0.052, -0.12);
      part(head, new THREE.CylinderGeometry(0.036, 0.036, 0.01, 16), glassM, 0, 0, -0.018).rotation.x = Math.PI / 2;
      part(head, new THREE.SphereGeometry(0.007, 8, 6), ledM, 0, -0.032, -0.03);
      const back = new THREE.Vector3(0, 0, -0.22).applyQuaternion(head.quaternion).add(p);
      if (c.kind === 'wall') {
        const w = new THREE.Vector3(...c.wall);
        rod(g, w, back, 0.014, greyM);
        part(g, new THREE.BoxGeometry(0.1, 0.1, 0.1), whiteM).position.copy(w);
      } else {   // a mast from the deck, the bracket out to the camera at the top
        const foot = new THREE.Vector3(back.x, 0, back.z), top = new THREE.Vector3(back.x, p.y + 0.12, back.z);
        rod(g, foot, top, 0.045, greyM);
        part(g, new THREE.CylinderGeometry(0.12, 0.14, 0.06, 16), greyM, foot.x, 0.03, foot.z);
        rod(g, top, back, 0.015, greyM);
      }
    }
    // The feed's camera: wide, 16:9, a little in front of the glass.
    const eye = new THREE.PerspectiveCamera(c.fov ?? (c.kind === 'dome' ? 58 : 52), 16 / 9, 0.05, c.n === 50 ? 3000 : FAR);
    eye.position.copy(at).sub(p).setLength(0.08).add(p);
    eye.quaternion.setFromRotationMatrix(m4.lookAt(eye.position, at, UP));
    eye.layers.enable(1); eye.layers.enable(ME_LAYER);   // the transparent things (see post.js), and you; not LAYER
    g.add(eye);
    const pivot = p.clone().addScaledVector(d0.set(Math.sin(yaw0) * Math.cos(pitch0), Math.sin(pitch0), Math.cos(yaw0) * Math.cos(pitch0)), -reach);
    const lim = { pan: c.pan ?? PAN[c.kind], tilt: TILT, zoom: ZOOM };
    return { ...c, F, g, head, eye, ledM, pivot, reach, yaw0, pitch0, fov0: eye.fov, lim, on: true, aim: '', lit: '', seen: 0 };
  });

  // ----- aiming, and on/off: office.cameras[id] = { on, pan, tilt, zoom }, from the server (or the app, at once) -----
  const D = THREE.MathUtils.DEG2RAD, dir = new THREE.Vector3(), lens = new THREE.Vector3(), tgt = new THREE.Vector3();
  const setOf = (c) => ({ on: true, pan: 0, tilt: 0, zoom: 1, ...dash.office?.cameras?.[c.id] });
  function apply() {
    for (const c of cams) {
      const s = setOf(c), pan = THREE.MathUtils.clamp(s.pan, -c.lim.pan, c.lim.pan), tilt = THREE.MathUtils.clamp(s.tilt, ...c.lim.tilt);
      const zoom = THREE.MathUtils.clamp(s.zoom, 1, c.lim.zoom), key = `${pan}|${tilt}|${zoom}`;
      c.on = s.on !== false && !c.dead;
      if (key === c.aim) continue;
      c.aim = key;
      const yaw = c.yaw0 - pan * D, pitch = THREE.MathUtils.clamp(c.pitch0 + tilt * D, -1.5, 0.5);
      dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      lens.copy(c.pivot).addScaledVector(dir, c.reach);
      c.head.position.copy(lens); c.head.quaternion.setFromRotationMatrix(m4.lookAt(tgt.copy(lens).add(dir), lens, UP));
      c.eye.position.copy(lens).addScaledVector(dir, 0.08);
      c.eye.quaternion.setFromRotationMatrix(m4.lookAt(c.eye.position, tgt.copy(c.eye.position).add(dir), UP));
      c.eye.fov = c.fov0 / zoom; c.eye.updateProjectionMatrix();
      c.g.updateMatrixWorld(true);
    }
    for (const c of cams) if (!c.on && c.lit !== 'off') { c.lit = 'off'; c.ledM.emissive.set('#000'); }
  }
  apply();
  dash.officeListeners.add(apply);

  // ----- the feeds -----
  // The grade: ACES as the office's tone mapping does it, to sRGB, then the CCTV look. Flipped, so the read-back's rows
  // (bottom first) come out top first.
  const gradeM = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1 }, seed: { value: 0 }, flip: { value: 1 }, res: { value: new THREE.Vector2(320, 180) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float exposure, seed, flip; uniform vec2 res; varying vec2 vUv;
      vec3 rrt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537, b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c) {
        const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        return clamp(O * rrt(I * (c * exposure / 0.6)), 0.0, 1.0);
      }
      vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
      void main() {
        vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, flip)), d = uv - 0.5;
        uv = 0.5 + d * (0.97 + 0.08 * dot(d, d));   // a touch of barrel
        vec3 c = srgb(aces(texture2D(tDiffuse, uv).rgb));
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 0.3) * vec3(0.9, 1.0, 0.92);
        c = (c - 0.5) * 1.15 + 0.53;
        c += (hash(floor(vUv * res)) - 0.5) * 0.09;
        c *= 0.9 + 0.1 * step(0.5, fract(vUv.y * res.y * 0.5));
        c *= smoothstep(0.95, 0.35, length(d * vec2(1.0, 0.8)));
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gradeM), quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera();
  quad.frustumCulled = false; quadScene.add(quad);
  /** @type {Map<string, { hdr: any, out: any }>} */
  const targets = new Map();
  const targetsFor = (w, h) => {
    const k = `${w}x${h}`;
    if (!targets.has(k)) {
      const random = Math.random;
      Math.random = rng(w * 7 + h);   // made while the harness runs too: keep the seeded stream where it was
      try {
        targets.set(k, { hdr: new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }),
          out: new THREE.WebGLRenderTarget(w, h, { depthBuffer: false }) });
      } finally { Math.random = random; }
    }
    return targets.get(k);
  };

  /** @type {{ cam: any, canvas: HTMLCanvasElement, c2: ImageBitmapRenderingContext, img: ImageData, buf: Uint8Array, fps: number, at: number, busy: boolean }[]} */
  let feeds = [];
  const byId = new Map(cams.map((c) => [c.id, c]));
  // The canvases on screen: [{ id, canvas, fps? }]. Each keeps its own pixels; a canvas resized gets new ones.
  function want(list) {
    const old = new Map(feeds.map((f) => [f.canvas, f]));
    feeds = list.filter((w) => byId.has(w.id)).map(({ id, canvas, fps }) => {
      const f = old.get(canvas), cam = byId.get(id), W = canvas.width, H = canvas.height;
      if (f && f.cam === cam && f.img.width === W && f.img.height === H) return Object.assign(f, { fps: fps || f.fps });
      const buf = new Uint8Array(W * H * 4);
      return { cam, canvas, c2: canvas.getContext('bitmaprenderer'), buf, img: new ImageData(new Uint8ClampedArray(buf.buffer), W, H), fps: fps || FPS.grid, at: 0, busy: false };
    });
    resume();
  }

  // Is the desktop on show? Full screen, or on the monitor/MacBook while you're in the office and it's in view nearby.
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  function onShow() {
    if (!ctx.active) return document.body.dataset.view === 'desktop';
    if (ctx.away || ctx.mode === 'tv' || ctx.mode === 'board') return false;
    if (ctx.mode === 'intro' || ctx.mode === 'outro') return true;
    hole.getWorldPosition(v);
    if (v.distanceTo(camera.position) > 14) return false;
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return frustum.containsPoint(v);
  }

  // Left out of every feed: the city's trees (specks at this size, and most of the scene's triangles). Left out of the
  // roof's: the office under the deck (the parts of the world wholly inside the building below it), a thousand draws that
  // frustum culling can't tell are out of sight. Worked out again whenever the world gains or loses a part (people).
  let under = [], underN = -1;
  const bb = new THREE.Box3();
  function below() {
    if (world.children.length !== underN) {
      underN = world.children.length;
      under = world.children.filter((o) => o !== ctx.roof.g && !ctx.city.trees.includes(o) && !bb.setFromObject(o).isEmpty()
        && bb.max.y < ctx.roof.y - 0.1 && bb.min.x > -20.6 && bb.max.x < 20.6 && bb.min.z > -15.6 && bb.max.z < 15.6);
    }
    return under;
  }
  // A frame lands in its canvas (a bitmaprenderer: the bitmap is shown as it is, no copy).
  const show = (f) => (bm) => { if (feeds.includes(f)) { f.c2.transferFromImageBitmap(bm); f.canvas.dataset.live = '1'; } else bm.close(); };
  let n = 0, seed = 0;
  const fresh = new Set(), vp = new THREE.Vector4(), vp0 = new THREE.Vector4();
  const stats = { renders: 0, ms: 0 };
  function shoot(f, t) {
    const { cam } = f, F = cam.F, W = f.img.width, H = f.img.height, T = targetsFor(W, H);
    const sc = F.scene || scene, t0 = performance.now();
    const undo = F.cctv?.stage?.();
    // The office's sky dome follows whoever is looking.
    const skyAt = sc === scene ? ctx.sky.position.clone() : null;
    if (skyAt) ctx.sky.position.copy(cam.eye.getWorldPosition(v));
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(T.hdr);
    // The scene's matrices: walked once a frame (thousands of objects), by whichever render comes first, the office's or ours.
    const auto = sc.matrixWorldAutoUpdate;
    if (fresh.has(sc) || (sc === scene && ctx.active && !ctx.away)) sc.matrixWorldAutoUpdate = false;
    fresh.add(sc);
    const hide = [...ctx.city.trees, ...(cam.n === 50 ? below() : [])].filter((o) => o.visible);
    for (const o of hide) o.visible = false;
    renderer.render(sc, cam.eye);
    for (const o of hide) o.visible = true;
    sc.matrixWorldAutoUpdate = auto;
    if (skyAt) ctx.sky.position.copy(skyAt);
    undo?.();
    gradeM.uniforms.tDiffuse.value = T.hdr.texture;
    gradeM.uniforms.exposure.value = F.cctv?.exposure ?? F.look?.exposure ?? ctx.officeExposure;   // (a floor whose look changes as you go gives its own)
    gradeM.uniforms.seed.value = (seed = (seed + 1) % 97);
    gradeM.uniforms.res.value.set(W, H);
    const gl = renderer.domElement, pr = renderer.getPixelRatio();
    // Mounted for the cameras but never shown, the canvas is still 300 x 150: big enough for the feed will do (show() resizes).
    if (!ctx.active && (gl.width < W || gl.height < H)) renderer.setSize(Math.max(W, gl.width) / pr, Math.max(H, gl.height) / pr, false);
    if (gl.width >= W && gl.height >= H) {
      // Graded into the bottom-left corner of the office's own canvas and copied out at once, before the office's frame
      // draws over it (GPU to GPU in the browser: no read-back, no stall).
      gradeM.uniforms.flip.value = 0;
      renderer.getViewport(vp0);
      renderer.setRenderTarget(null);
      renderer.setViewport(0, 0, W / pr, H / pr);
      renderer.render(quadScene, quadCam);
      renderer.getCurrentViewport(vp);
      f.busy = true;
      createImageBitmap(gl, vp.x, gl.height - vp.y - vp.w, vp.z, vp.w).then(show(f), () => {}).finally(() => { f.busy = false; });
      renderer.setViewport(vp0);
    } else {   // a canvas too small (or the 3D view never laid out): read the pixels back
      gradeM.uniforms.flip.value = 1;
      renderer.setRenderTarget(T.out);
      renderer.render(quadScene, quadCam);
      f.busy = true;
      renderer.readRenderTargetPixelsAsync(T.out, 0, 0, W, H, f.buf)
        .then(() => createImageBitmap(f.img)).then(show(f), () => {})
        .finally(() => { f.busy = false; });
    }
    renderer.setRenderTarget(prev);
    cam.seen = t;
    stats.renders++; stats.ms += performance.now() - t0;
  }

  // Once a frame (the office's, or resume()'s own while the 3D view is closed): the floors' watched bits move, then the
  // most overdue feeds are drawn.
  function tick(dt, t, now) {
    const on = feeds.length > 0 && onShow();
    fresh.clear();
    if (on) {
      for (const F of new Set(feeds.map((f) => f.cam.F))) F.cctv?.tick?.(dt, t, cams.filter((c) => c.F === F));
      let shadows = !ctx.active || !!ctx.away;   // the office's own frame isn't updating them
      const slow = ctx.active ? 4 : 1;
      const due = feeds.filter((f) => f.cam.on && !f.busy && now - f.at >= 1000 * slow / f.fps).sort((a, b) => a.at - b.at).slice(0, SLOT);
      for (const f of due) {
        f.at = now;
        if (shadows && !f.cam.F.scene) { renderer.shadowMap.needsUpdate = true; shadows = false; }
        shoot(f, t);
      }
    }
    if ((n = (n + 1) % 15) === 0) for (const c of cams) {   // red while recording to a screen, green on standby, dark when off
      const lit = !c.on ? 'off' : on && t - c.seen < 1 ? 'live' : 'standby';
      if (lit !== c.lit) { c.lit = lit; c.ledM.emissive.set(lit === 'off' ? '#000' : lit === 'live' ? '#ff2a1a' : '#22ff55'); }
    }
  }
  ctx.onFrame(tick, 185);

  // With the 3D view closed, a loop of the office's own runs while any feed is wanted.
  let raf = 0, last = 0;
  const t0 = performance.now();
  function resume() {
    if (raf || ctx.active || !feeds.length) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    raf = 0;
    if (ctx.active || !feeds.length) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    ctx.runFrame(dt, (now - t0) / 1000, now);
  }

  const list = cams.map(({ id, name, n: fl, lim, dead }) => ({ id, name, floor: fl, where: floorOf(fl).title, lim, dead: !!dead }));
  dash.cctv = { cams: list, want, stats };
  Object.assign(ctx, { cctv: { cams, want, resume, stats } });
}
