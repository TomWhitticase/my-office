// A doorway into another scene that you can walk through without a cut. What's beyond it is that scene drawn each frame
// from where you'd be standing in it (your camera carried across by the two doorways' frames), clipped at its doorway by
// an oblique near plane, into a target the size of the canvas but only within the doorway's rectangle on screen (a
// scissor, and a projection narrowed to it, so frustum culling only lets through what the doorway can show). A box across
// the opening shows it, sampling by screen position: flat across the opening when you're away from it, deepened toward you
// as you come up to it so the near plane never clips it away. The other floor's exposure is carried across (`k`).
// Used by floors/world-edge.js and floors/world-edge-backstage.js; floors/archive-entrance.js does the same within one scene.
//
// A doorway's frame is a Matrix4 in its scene's world space: origin at the middle of its sill, +y up, +z pointing through it
// the way you'd walk from the side it's seen from. A point p on this side is (there · here⁻¹) p on the other.

import * as THREE from 'three';
import { rng } from '../util.js';

// What a doorway shows is a picture, not geometry, so ambient occlusion must leave it alone: an AO pass that skips layer
// 1 (the panes are there) sees straight through a pane to what's behind the doorway in its own scene and shades the
// picture with it (the hall's balustrade ghosted over B3's corridor). maskAO(ao) has a GTAOPass draw every visible pane
// into its depth after its own, at depth 1 wherever the pane's nearest (marked in the stencil, then written): background,
// which it leaves unshaded and nothing is occluded by. Panes register with addPane (makePortal's do). The mark is drawn
// 3 cm nearer you than the pane: the pass's depth has what doesn't write depth in the picture (stains and decals on the
// wall round a doorway, a centimetre proud of it), and on that plane those would punch holes in it.
const panes = new Set();
export const addPane = (m) => { panes.add(m); return m; };
let portals = 0;
// (three takes a uuid from Math.random for each material and mesh: what's made here takes them from its own stream, so
// it doesn't shift what's built after it: see helicopter.js)
const own = (seed, fn) => { const random = Math.random; Math.random = rng(seed); try { return fn(); } finally { Math.random = random; } };
const VS = 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
let markM, skyM;
const NEAR_VS = 'void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); p.xyz -= normalize(p.xyz) * 0.03; gl_Position = projectionMatrix * p; }';
const aoMats = () => own(7101, () => [markM = new THREE.ShaderMaterial({ vertexShader: NEAR_VS, fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }', side: THREE.DoubleSide,
  colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }),
skyM = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: 'void main() { gl_FragColor = vec4(0.5, 0.5, 1.0, 1.0); gl_FragDepth = 1.0; }',
  side: THREE.DoubleSide, depthFunc: THREE.AlwaysDepth, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc })]);
/** @param {any} ao a GTAOPass */
export function maskAO(ao) {
  if (!markM) aoMats();
  const over = ao._renderOverride.bind(ao);
  ao._renderOverride = (renderer, m, rt, ...a) => {
    over(renderer, m, rt, ...a);
    if (rt !== ao.normalRenderTarget) return;
    const cam = ao.camera, mask = cam.layers.mask, autoClear = renderer.autoClear;
    cam.layers.enable(1);
    renderer.autoClear = false;   // (onto the pass's own depth and normals: a clear here would wipe them, and the AO with them)
    for (const p of panes) {
      if (!p.visible) continue;
      let top = p; while (top.parent) top = top.parent;
      if (top !== ao.scene) continue;
      const mat = p.material, auto = p.matrixWorldAutoUpdate;   // (drawn alone: its world matrix as it is, parent and all)
      const kids = p.children.filter((c) => c.visible);
      for (const c of kids) c.visible = false;
      p.matrixWorldAutoUpdate = false;
      for (const m of p.userData.ao || [markM, skyM]) { p.material = m; renderer.render(p, cam); }
      p.material = mat; p.matrixWorldAutoUpdate = auto;
      for (const c of kids) c.visible = true;
    }
    cam.layers.mask = mask; renderer.autoClear = autoClear;
  };
}

// The cap (makePortal): a quad over the whole view, each pixel the ray through it met with the doorway's plane; where it
// goes through the opening, the picture at the true depth of that point, else nothing. mode 0 draws it; 1 and 2 are its
// stencil mark and depth-1 write for maskAO.
const CAP_VS = `uniform mat4 unproj; varying vec3 vDir;
  void main() { vec4 p = unproj * vec4(position.xy, 1.0, 1.0); vDir = p.xyz / p.w - cameraPosition; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const capFS = (mode, tone) => `uniform mat4 projectionMatrix; uniform sampler2D tView; uniform vec2 res; uniform float k; uniform mat4 toDoor; uniform vec3 size; varying vec3 vDir;
  ${tone}
  void main() {
    vec3 dir = normalize(vDir), o = (toDoor * vec4(cameraPosition, 1.0)).xyz, d = mat3(toDoor) * dir;
    if (d.z <= 1e-5) discard;
    float t = -o.z / d.z; vec3 p = o + d * t;
    float sp = size.y - size.x / 2.0;
    if (t <= 0.0 || abs(p.x) > size.x / 2.0 || p.y < 0.0 || p.y > size.y || (size.z > 0.5 && p.y > sp && length(vec2(p.x, p.y - sp)) > size.x / 2.0)) discard;
    vec4 c = projectionMatrix * viewMatrix * vec4(cameraPosition + dir * t, 1.0);
    ${mode === 2 ? 'gl_FragDepth = 1.0; gl_FragColor = vec4(0.5, 0.5, 1.0, 1.0);'
    : 'gl_FragDepth = clamp(c.z / c.w * 0.5 + 0.5, 0.0, 1.0); gl_FragColor = vec4(tone(gl_FragCoord.xy / res) * k, 1.0);'}
  }`;
const PLAIN = 'vec3 tone(vec2 uv) { return texture2D(tView, uv).rgb; }';

/** @param {any} ctx @param {{ w: number, h: number, arch?: boolean, flat?: boolean, tone?: { glsl: string, uniforms: object } }} size the opening,
 * metres (arch: round-headed, its crown at h; flat: a pane 2 mm this side of the opening, never deepened (close up, the cap
 * alone), so nothing of it lies along a reveal; tone: `vec3 tone(vec2 uv)` instead of the plain picture, restyling what it
 * shows (grid-door.js: B3 drawn flat, seen from the grid), and its uniforms) */
export function makePortal(ctx, { w, h, arch = false, flat = false, tone = null }) {
  const { renderer, camera } = ctx;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  rt.scissorTest = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tView: { value: rt.texture }, res: { value: new THREE.Vector2(4, 4) }, k: { value: 1 }, ...tone?.uniforms },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tView; uniform vec2 res; uniform float k; ${tone?.glsl || PLAIN} void main() { gl_FragColor = vec4(tone(gl_FragCoord.xy / res) * k, 1.0); }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh((flat ? new THREE.PlaneGeometry(w, h) : new THREE.BoxGeometry(w, h, 1)).translate(0, h / 2, -0.5), mat);
  mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.visible = false;
  mesh.layers.set(1); addPane(mesh);   // no ambient occlusion over it (maskAO)
  // Close up, the box's face across the opening can be nearer than the near plane, clipped away, what's behind it showing
  // through for a frame or two before you cross: the cap covers it then, exactly.
  const capU = { ...mat.uniforms, toDoor: { value: new THREE.Matrix4() }, unproj: { value: new THREE.Matrix4() }, size: { value: new THREE.Vector3(w, h, arch ? 1 : 0) } };
  const capM = (mode, o = {}) => new THREE.ShaderMaterial({ uniforms: capU, vertexShader: CAP_VS, fragmentShader: capFS(mode, tone?.glsl || PLAIN), side: THREE.DoubleSide, ...o });
  const cap = own(7200 + portals++, () => new THREE.Mesh(new THREE.PlaneGeometry(2, 2), capM(0)));
  cap.frustumCulled = false; cap.visible = false; cap.layers.set(1); cap.raycast = () => {};
  cap.userData.ao = own(7300 + portals, () => [capM(1, { colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }),
    capM(2, { depthFunc: THREE.AlwaysDepth, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc })]);
  mesh.add(cap); addPane(cap);
  mesh.raycast = () => {};
  const cam = new THREE.PerspectiveCamera();
  cam.matrixAutoUpdate = false; cam.matrixWorldAutoUpdate = false;   // set from yours each frame
  const inv = new THREE.Matrix4(), M = new THREE.Matrix4(), S = new THREE.Matrix4(), v = new THREE.Vector3(), v4 = new THREE.Vector4();
  const buf = new THREE.Vector2(), plane = new THREE.Plane(), n = new THREE.Vector3(), q = new THREE.Vector4(), cv = new THREE.Vector4();
  const corners = [[-w / 2, 0], [w / 2, 0], [-w / 2, h], [w / 2, h]];

  // Where (a point in this scene's space) is, in the doorway's own frame.
  const local = (here, p) => v.copy(p).applyMatrix4(inv.copy(here).invert());
  // The doorway's rectangle on screen, in canvas pixels [x, y, w, h] (y up), or null if it's not on screen. Close up (or a
  // corner behind you), the whole canvas; all four behind you, not on screen (it's somewhere at your back: drawn, it
  // would cost a whole other scene for nothing, and its pane would take the ambient occlusion off everything in view).
  function onScreen(here, close) {
    if (close) return [0, 0, buf.x, buf.y];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = 0;
    for (const [x, y] of corners) {
      v4.set(x, y, 0, 1).applyMatrix4(here).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      if (v4.w < camera.near) { behind++; continue; }
      const sx = (v4.x / v4.w * 0.5 + 0.5) * buf.x, sy = (v4.y / v4.w * 0.5 + 0.5) * buf.y;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    if (behind) return behind < corners.length ? [0, 0, buf.x, buf.y] : null;
    x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2); x1 = Math.min(buf.x, Math.ceil(x1) + 2); y1 = Math.min(buf.y, Math.ceil(y1) + 2);
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
  }

  return {
    mesh, rt, cam,
    /** Has a point moved through the opening from `a` to `b` (this scene's space)? 1 forward, -1 back, 0 not. */
    crossed(here, a, b) {
      const az = local(here, a).z, bz = local(here, b).z, { x, y } = v;
      if (Math.sign(az) === Math.sign(bz) || Math.abs(x) > w / 2 || y < -0.5 || y > h + 0.5 || a.distanceTo(b) > 1.5) return 0;
      return bz > az ? 1 : -1;
    },
    /** Map a point or a frame from this side to the other. */
    across: (here, there) => M.copy(there).multiply(inv.copy(here).invert()),
    /**
     * Draw the other side for this frame, or hide the doorway. here/there: the frames; scene: the other side's;
     * k: its exposure over this side's; prepare(): light it as it's lit from inside, returns its undo; far: the far plane over there.
     */
    draw({ here, there, scene, k = 1, prepare = null, far = camera.far, open = true }) {
      local(here, camera.position);
      const front = v.z < 0, near = front && v.z > -0.7 && Math.abs(v.x) < w / 2 + 0.4 && v.y > -0.3 && v.y < h + 0.3;
      renderer.getDrawingBufferSize(buf);
      const rect = open && front ? onScreen(here, near) : null;
      mesh.visible = !!rect;
      if (!rect) return false;
      mesh.matrix.copy(here).multiply(S.makeScale(1, 1, near && !flat ? 0.25 : 0.004));   // the box reaches back toward you from the opening
      mesh.matrixWorldNeedsUpdate = true;
      cap.visible = near;
      if (near) { camera.updateMatrixWorld(); capU.toDoor.value.copy(here).invert(); capU.unproj.value.copy(camera.matrixWorld).multiply(camera.projectionMatrixInverse); }
      if (rt.width !== buf.x || rt.height !== buf.y) { rt.setSize(buf.x, buf.y); mat.uniforms.res.value.copy(buf); }
      mat.uniforms.k.value = k;
      // The camera over there, and its projection narrowed to the doorway's rectangle.
      camera.updateMatrixWorld();
      cam.matrixWorld.copy(M.copy(there).multiply(inv.copy(here).invert())).multiply(camera.matrixWorld);
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      cam.layers.mask = camera.layers.mask;
      const top = camera.near * Math.tan(THREE.MathUtils.DEG2RAD * camera.fov / 2) / camera.zoom, height = 2 * top, width = camera.aspect * height, left = -width / 2;
      const [rx, ry, rw, rh] = rect;
      cam.near = camera.near; cam.far = far;
      cam.projectionMatrix.makePerspective(left + width * rx / buf.x, left + width * (rx + rw) / buf.x, -top + height * (ry + rh) / buf.y, -top + height * ry / buf.y, cam.near, far);
      // The near plane, tilted onto the doorway over there: nothing between you and it is drawn (Lengyel's oblique clip).
      n.set(0, 0, 1).transformDirection(there);
      plane.setFromNormalAndCoplanarPoint(n, v.setFromMatrixPosition(there)).applyMatrix4(cam.matrixWorldInverse);
      cv.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const e = cam.projectionMatrix.elements;
      q.set((Math.sign(cv.x) + e[8]) / e[0], (Math.sign(cv.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
      cv.multiplyScalar(2 / cv.dot(q));
      e[2] = cv.x; e[6] = cv.y; e[10] = cv.z + 1; e[14] = cv.w;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      rt.viewport.set(rx, ry, rw, rh); rt.scissor.set(rx, ry, rw, rh);
      const undo = prepare?.(), prev = renderer.getRenderTarget(), auto = renderer.autoClear;
      renderer.setRenderTarget(rt); renderer.autoClear = true;
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev); renderer.autoClear = auto;
      undo?.();
      return true;
    },
    hide() { mesh.visible = false; },
    /** Its programs (the pane, the cap close up, and what maskAO draws them with), one of each on a scene of their own,
     * to get ready before it's first looked through (systems/warm.js). */
    warmScene() {
      if (!markM) aoMats();
      return own(7500, () => {
        const g = new THREE.Scene();
        for (const m of [mat, cap.material, ...cap.userData.ao, markM, skyM]) g.add(new THREE.Mesh(mesh.geometry, m));
        return g;
      });
    },
  };
}
