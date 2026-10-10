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

/** @param {any} ctx @param {{ w: number, h: number }} size the opening, metres */
export function makePortal(ctx, { w, h }) {
  const { renderer, camera } = ctx;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  rt.scissorTest = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tView: { value: rt.texture }, res: { value: new THREE.Vector2(4, 4) }, k: { value: 1 } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tView; uniform vec2 res; uniform float k; void main() { gl_FragColor = vec4(texture2D(tView, gl_FragCoord.xy / res).rgb * k, 1.0); }',
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1).translate(0, h / 2, -0.5), mat);
  mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.visible = false;
  mesh.layers.set(1);   // no ambient occlusion over it (post.js, and floors whose look has aoSkip1)
  mesh.raycast = () => {};
  const cam = new THREE.PerspectiveCamera();
  cam.matrixAutoUpdate = false; cam.matrixWorldAutoUpdate = false;   // set from yours each frame
  const inv = new THREE.Matrix4(), M = new THREE.Matrix4(), S = new THREE.Matrix4(), v = new THREE.Vector3(), v4 = new THREE.Vector4();
  const buf = new THREE.Vector2(), plane = new THREE.Plane(), n = new THREE.Vector3(), q = new THREE.Vector4(), cv = new THREE.Vector4();
  const corners = [[-w / 2, 0], [w / 2, 0], [-w / 2, h], [w / 2, h]];

  // Where (a point in this scene's space) is, in the doorway's own frame.
  const local = (here, p) => v.copy(p).applyMatrix4(inv.copy(here).invert());
  // The doorway's rectangle on screen, in canvas pixels [x, y, w, h] (y up), or null if it's not on screen. Close up (or a
  // corner behind you), the whole canvas.
  function onScreen(here, close) {
    if (close) return [0, 0, buf.x, buf.y];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of corners) {
      v4.set(x, y, 0, 1).applyMatrix4(here).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      if (v4.w < camera.near) return [0, 0, buf.x, buf.y];
      const sx = (v4.x / v4.w * 0.5 + 0.5) * buf.x, sy = (v4.y / v4.w * 0.5 + 0.5) * buf.y;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
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
      mesh.matrix.copy(here).multiply(S.makeScale(1, 1, near ? 0.25 : 0.004));   // the box reaches back toward you from the opening
      mesh.matrixWorldNeedsUpdate = true;
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
  };
}
