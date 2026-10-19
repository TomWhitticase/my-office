// The sun's shadow map, kept instead of redrawn: most of its ~1,500 casters never move, so their depth is drawn once and
// kept in a copy; each frame the copy goes back into the map and only what moves (people, a chair, a car) is drawn over
// it. What moves is found each frame by comparing every caster's world matrix with the last frame's: one that changes
// is drawn every frame from then on, until it's been still a while and goes back in the kept depth. The kept depth is
// redrawn when a still caster appears, goes, moves or changes, or the sun has turned a fraction of a texel (till then
// the map keeps the matrix it was drawn with).
// Any other light, scene or shadow type goes through three's own pass untouched.

import * as THREE from 'three';

const STILL = 90;   // frames still before a moving caster goes back in the kept depth
const TURN = 0.0003;   // radians the sun may turn before the kept depth is redrawn (a fifth of a texel over 10 m; about 4 s of the real sun)

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  if (localStorage.officeShadowKeep === 'off') return;   // (to compare)
  const { renderer, scene, sun } = ctx;
  const sm = renderer.shadowMap, gl = renderer.getContext(), state = renderer.state;
  const three = sm.render.bind(sm);
  /** @type {Map<THREE.Object3D, { k: number, still: number, dyn: boolean, frame?: number }>} */
  const seen = new Map();
  const dir = new THREE.Vector3(), kept = { ok: false, sig: 0, dir: new THREE.Vector3(), pos: new THREE.Vector3(), at: new THREE.Vector3(), lens: 0, w: 0, h: 0, fb: null, rb: null };
  let frame = 0;
  const stats = ctx.shadowKeep = { redraws: 0, frames: 0, why: '' };   // (for perf runs)
  const noClear = () => {};

  // A caster's key: its world matrix, and whatever else changes what it draws into the map.
  function key(o) {
    const e = o.matrixWorld.elements;
    let k = e[0] + 2 * e[1] + 3 * e[2] + 5 * e[4] + 7 * e[5] + 11 * e[6] + 13 * e[8] + 17 * e[9] + 19 * e[10] + 23 * e[12] + 29 * e[13] + 31 * e[14];
    k += o.geometry.id * 0.0071 + (o.material.id ?? 0) * 0.0031 + (o.material.visible === false ? 0.5 : 0);
    if (o.isInstancedMesh) k += o.instanceMatrix.version * 0.017 + o.count * 0.013;
    return k;
  }
  // Always drawn: what changes shape without moving (skinning, morphs, a depth material of its own, like the plants' sway)
  const live = (o) => !!(o.isSkinnedMesh || o.morphTargetInfluences || o.customDepthMaterial);
  // Walk the casters three's pass would draw: the still ones listed and signed, `changed` if any came, moved or stopped.
  let changed = false, sig = 0;
  const still = [];
  function walk(o, mask) {
    if (o.visible === false) return;
    if ((o.isMesh || o.isLine || o.isPoints) && o.castShadow && (o.layers.mask & mask) !== 0) {
      const k = key(o);
      let r = seen.get(o);
      if (!r) { r = { k, still: 0, dyn: live(o) }; seen.set(o, r); if (!r.dyn) changed = true; }
      else if (r.k !== k) {
        r.k = k; r.still = 0;
        if (!r.dyn) { r.dyn = true; changed = true; }
      } else if (r.dyn && ++r.still > STILL && !live(o)) { r.dyn = false; changed = true; }
      r.frame = frame;
      if (!r.dyn) { still.push(o); sig = (sig * 31 + o.id) | 0; }
    }
    const c = o.children;
    for (let i = 0; i < c.length; i++) walk(c[i], mask);
  }

  function blit(from, to, w, h) {
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, from);
    state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }
  function keep(w, h) {
    if (kept.w !== w || kept.h !== h) {
      if (kept.fb) { gl.deleteFramebuffer(kept.fb); gl.deleteRenderbuffer(kept.rb); }
      kept.rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, kept.rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      kept.fb = gl.createFramebuffer();
      state.bindFramebuffer(gl.FRAMEBUFFER, kept.fb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, kept.rb);
      state.bindFramebuffer(gl.FRAMEBUFFER, null);
      kept.w = w; kept.h = h;
    }
  }

  sm.render = (lights, sc, camera) => {
    if (sm.enabled === false || (sm.autoUpdate === false && sm.needsUpdate === false) || sc !== scene || lights.length !== 1 || lights[0] !== sun
      || sm.type !== THREE.PCFShadowMap || !sun.shadow.map || !(sun.shadow.autoUpdate || sun.shadow.needsUpdate)) {
      kept.ok = kept.ok && !(lights.includes(sun) && (sm.autoUpdate || sm.needsUpdate));   // three drew it: the kept depth isn't in it any more
      return three(lights, sc, camera);
    }
    frame++; changed = false; sig = 0; still.length = 0;
    walk(sc, camera.layers.mask);
    if (frame % 600 === 0) for (const [o, r] of seen) if (frame - r.frame > 600) seen.delete(o);
    dir.subVectors(sun.position, sun.target.position).normalize();
    const p = sun.shadow.camera.projectionMatrix.elements, lens = p[0] + 3 * p[5] + 7 * p[10] + 11 * p[12] + 13 * p[13] + 17 * p[14];
    const map = sun.shadow.map, w = map.width, h = map.height, fb = renderer.properties.get(map).__webglFramebuffer;
    stats.frames++;
    if (changed || !kept.ok || sig !== kept.sig || dir.dot(kept.dir) < Math.cos(TURN) || !sun.target.position.equals(kept.at) || lens !== kept.lens || kept.w !== w || kept.h !== h) {
      stats.redraws++; stats.why = changed ? 'changed' : !kept.ok ? 'drawn' : sig !== kept.sig ? 'set' : kept.w !== w || kept.h !== h ? 'size' : 'sun';   // (or its target or lens)
      // Redraw the still casters and keep their depth
      const moving = [];
      for (const [o, r] of seen) if (r.dyn && o.castShadow) { o.castShadow = false; moving.push(o); }
      try { three(lights, sc, camera); } finally { for (const o of moving) o.castShadow = true; }
      keep(w, h); blit(fb, kept.fb, w, h);
      kept.ok = true; kept.sig = sig; kept.dir.copy(dir); kept.pos.copy(sun.position); kept.at.copy(sun.target.position); kept.lens = lens;
      if (!moving.length) return;
    } else blit(kept.fb, fb, w, h);
    // Draw what moves over the kept depth, from where the sun was when it was kept (the map's matrix stays the kept one)
    const clear = renderer.clear, pos = sun.position.clone();
    for (const o of still) o.castShadow = false;
    sun.position.copy(kept.pos); sun.updateMatrixWorld();
    renderer.clear = noClear; sm.needsUpdate = true; sun.shadow.needsUpdate = true;
    try { three(lights, sc, camera); } finally {
      renderer.clear = clear; for (const o of still) o.castShadow = true;
      sun.position.copy(pos); sun.updateMatrixWorld();
    }
  };
}
