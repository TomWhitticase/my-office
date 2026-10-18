// Getting a scene ready to be seen before it is, without a hitch on the way: what a floor behind a doorway (grid.js, the
// painting doors) runs while you're still walking up to it. Its programs are compiled in the background (compileAsync,
// with everything in it shown, as it's drawn into its floor's composer: a half-float target); then a few milliseconds a
// frame, each program's first use once it's compiled (its uniforms looked up, its link checked: calls that wait on the
// GPU process, tens of milliseconds each if it's not); then the next frame draws everything once, unseen, into a few pixels, none of it
// culled, shadows and all (the GPU's own work the first time it draws with a program, a second or more on ANGLE/Metal,
// done then and not on the frame it's first seen). Nothing here draws to the screen.

import * as THREE from 'three';
import { rng } from '../util.js';

/** @param {any} renderer @param {any[]} scenes the floor's scene, and any others to get ready with it (a portal's warmScene())
 * @returns {() => boolean} once a frame, before the frame's drawn: true once it's all done */
export function makeWarm(renderer, scenes) {
  // (three takes a uuid from Math.random for each target and camera: these take theirs from their own stream, so nothing
  // after them shifts: see helicopter.js)
  const random = Math.random;
  Math.random = rng(8800);
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }), cam = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
  // Ambient occlusion (GTAOPass) draws the scene again with one normal material of its own, a program for each kind of
  // mesh (plain, instanced, morphed), which compile() never sees (an override): one of each kind with that material,
  // hidden in each scene meanwhile (lit and fogged as the rest), so those are got ready too (as floors/cart.js did).
  const nm = new THREE.MeshNormalMaterial({ blending: THREE.NoBlending }), aoKinds = scenes.map((sc) => {
    const kinds = new Map(), g = new THREE.Group();
    sc.traverse((x) => { if (x.isMesh && !x.isSkinnedMesh && x.material?.allowOverride !== false) kinds.set(`${!!x.isInstancedMesh}${x.geometry.morphAttributes.position?.length ?? 0}`, x); });
    for (const x of kinds.values()) {
      const m = x.isInstancedMesh ? new THREE.InstancedMesh(x.geometry, nm, x.count) : new THREE.Mesh(x.geometry, nm);
      if (x.isInstancedMesh) m.instanceMatrix = x.instanceMatrix;
      if (x.morphTargetInfluences) m.morphTargetInfluences = x.morphTargetInfluences.slice();
      g.add(m);
    }
    g.visible = false; sc.add(g);
    return g;
  });
  Math.random = random;
  cam.layers.enableAll();
  // fn with everything in sc shown and unculled, then back as it was
  const shown = (sc, fn) => {
    const hidden = [], culled = [];
    sc.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    try { return fn(); } finally { for (const o of hidden) o.visible = false; for (const o of culled) o.frustumCulled = true; }
  };
  let state = 'compiling', progs = null;
  const was = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  for (const sc of scenes) sc.traverse((o) => { for (const m of [o.material || []].flat()) for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap']) if (m[k]?.isTexture && !m[k].isRenderTargetTexture) renderer.initTexture(m[k]); });
  Promise.all(scenes.map((sc) => shown(sc, () => renderer.compileAsync(sc, cam, sc)))).catch(() => {}).then(() => { state = 'linking'; });
  renderer.setRenderTarget(was);
  return function tick() {
    if (state === 'compiling' || state === 'done') return state === 'done';
    if (state === 'linking') {
      if (!progs) {
        const s = new Set();
        for (const sc of scenes) sc.traverse((o) => { for (const m of [o.material || []].flat()) { const p = renderer.properties.get(m).currentProgram; if (p) s.add(p); } });
        progs = [...s];
      }
      const t0 = performance.now();
      while (progs.length && performance.now() - t0 < 3) {
        if (!progs[progs.length - 1].isReady()) return false;   // (the GPU process still compiling it: a first use would wait)
        progs.pop().getUniforms();
      }
      if (!progs.length) state = 'drawing';
      return false;
    }
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    for (const sc of scenes) shown(sc, () => { renderer.shadowMap.needsUpdate = true; renderer.render(sc, cam); });
    renderer.setRenderTarget(prev);
    rt.dispose();
    for (const g of aoKinds) g.removeFromParent();
    state = 'done';
    return true;
  };
}

/** The same for a scene that's partly drawn already (the office, for coming out over its roof: grid-ending.js): every
 * material in `scene`, hidden or not, compiled a batch of objects a frame (lit as the scene is lit), then each program's
 * first use a few milliseconds a frame. No unseen draw (the caller draws what it needs). @param {any} renderer
 * @param {any} scene @param {any} camera @returns {() => boolean} once a frame: true once it's all done */
export function makeCompile(renderer, scene, camera, batch = 120) {
  const objs = [];
  scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material) objs.push(o); });
  const mats = new Set(), random = Math.random;
  Math.random = rng(8801);   // (its target's uuid: a stream of its own)
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });   // (drawn into a target, as by the composer)
  Math.random = random;
  let i = 0, progs = null;
  // (three's compile walks `scene` for materials and for lights: a stand-in that walks only this batch for the first
  // and nothing for the second; the lights come from the real scene, the target)
  const part = (list) => ({ traverse: (fn) => list.forEach(fn), traverseVisible: () => {} });
  return function tick() {
    if (i < objs.length) {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      for (const m of renderer.compile(part(objs.slice(i, i += batch)), camera, scene)) mats.add(m);
      renderer.setRenderTarget(prev);
      if (i >= objs.length) rt.dispose();
      return false;
    }
    if (!progs) {
      const s = new Set();
      for (const m of mats) { const p = renderer.properties.get(m).currentProgram; if (p) s.add(p); }
      progs = [...s];
    }
    const t0 = performance.now();
    while (progs.length && performance.now() - t0 < 3) {
      if (!progs[progs.length - 1].isReady()) return false;   // (still compiling: next frame)
      progs.pop().getUniforms();
    }
    return !progs.length;
  };
}
