// Getting a scene ready to be seen before it is, without a hitch on the way: what a floor behind a doorway (grid.js, the
// painting doors) runs while you're still walking up to it. Its programs are compiled in the background (compileAsync,
// with everything in it shown, as it's drawn into its floor's composer: a half-float target); then a few milliseconds a
// frame, each program's first use (its uniforms looked up, its link checked: calls that wait on the GPU process, tens of
// milliseconds each when it's busy); then the next frame draws everything once, unseen, into a few pixels, none of it
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
      while (progs.length && performance.now() - t0 < 3) progs.pop().getUniforms();
      if (!progs.length) state = 'drawing';
      return false;
    }
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    for (const sc of scenes) shown(sc, () => { renderer.shadowMap.needsUpdate = true; renderer.render(sc, cam); });
    renderer.setRenderTarget(prev);
    rt.dispose();
    state = 'done';
    return true;
  };
}
