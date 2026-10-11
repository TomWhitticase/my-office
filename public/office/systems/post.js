// Post-processing: ambient occlusion, screen-space light rays toward the sun, bloom and a colour grade over the office
// (G turns them off, ctx.setQuality); and renderFrame, which draws the office and re-punches the hole the live desktop
// shows through (installRender).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sstep } from '../util.js';
import { maskAO } from './portal.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { world, camera, renderer, scene, shafts } = ctx;
  Object.assign(ctx, { setQuality });
  // ----- post-processing -----
  // Transparent things live on layer 1 so the AO pass and the hole's depth pre-pass ignore them.
  world.traverse((o) => { if (o.isSprite || (o.material && o.material.transparent)) o.layers.set(1); });
  camera.layers.enable(1);
  renderer.shadowMap.autoUpdate = false;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 512, 512);
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 12 });
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (...a) => { camera.layers.disable(1); gtaoRender(...a); camera.layers.enable(1); };
  maskAO(gtao);   // (the sky's door: systems/portal.js)
  composer.addPass(gtao);
  // Screen-space light rays: radial blur of the brightest pixels toward the sun's screen position.
  const rays = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, sunPos: { value: new THREE.Vector2() }, strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float strength; varying vec2 vUv;
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        vec2 delta = (vUv - sunPos) / 64.0 * 0.95, uv = vUv;
        float decay = 1.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < 64; i++) {
          uv -= delta;
          vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
          acc += min(s * max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - 1.1, 0.0), vec3(3.0)) * decay;
          decay *= 0.966;
        }
        gl_FragColor = vec4(base.rgb + acc * strength / 64.0, base.a);
      }`,
  });
  composer.addPass(rays);
  // Bloom: only the brightest highlights (lamps, screens, the sun) glow, softly. Every floor's bloom scales from this one.
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.22, 0.4, 1.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, amount: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(vec3(l), c.rgb, mix(1.0, 1.12, amount));
        c.rgb *= mix(1.0, mix(0.8, 1.0, smoothstep(0.95, 0.35, length(vUv - 0.5))), amount);
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grade);
  let hq = localStorage.officeQuality !== 'low';
  function setQuality(on) {
    hq = on; localStorage.officeQuality = on ? 'high' : 'low';
    gtao.enabled = bloom.enabled = grade.enabled = on;
    shafts.visible = on;
  }
  setQuality(hq);
  Object.assign(ctx, { bloom, grade, rays, composer });
  Object.defineProperty(ctx, 'quality', { get: () => hq, set: (v) => { hq = v; }, enumerable: true });   // high quality (G)
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function installRender(ctx) {
  const { hole, holeM, camera, sunDir, rays, renderer, composer, scene } = ctx;
  Object.assign(ctx, { renderFrame });
  const sunScreen = new THREE.Vector3(), camFwd = new THREE.Vector3();
  const holeScene = new THREE.Scene(), holeProxy = new THREE.Mesh(hole.geometry, holeM);
  holeProxy.matrixAutoUpdate = false;
  holeScene.add(holeProxy);
  const depthOnlyM = new THREE.MeshBasicMaterial({ colorWrite: false });
  function renderFrame() {
    camera.getWorldDirection(camFwd);
    sunScreen.copy(sunDir).multiplyScalar(500).add(camera.position).project(camera);
    rays.uniforms.sunPos.value.set(sunScreen.x * 0.5 + 0.5, sunScreen.y * 0.5 + 0.5);
    rays.uniforms.strength.value = ctx.raysStrength * sstep(0.15, 0.55, camFwd.dot(sunDir)) * 1.2;
    rays.enabled = ctx.quality && rays.uniforms.strength.value > 0.01;
    renderer.shadowMap.needsUpdate = true;
    composer.render();
    // The canvas is transparent so the dashboard can show through the hole, which means any pixel the passes leave
    // below full alpha lets the (white) page behind flash through. Force alpha to 1 everywhere first, then punch.
    renderer.setRenderTarget(null);
    const gl = renderer.getContext();
    gl.colorMask(false, false, false, true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.colorMask(true, true, true, true);
    renderer.state.buffers.color.reset();   // three caches the mask and clear colour; make it resend both
    // Re-punch the dashboard hole: depth of opaque geometry, then the hole writes alpha 0 where it's visible.
    renderer.autoClear = false;
    renderer.clearDepth();
    camera.layers.disable(1);
    // A Color background force-clears the canvas, so drop it for the depth-only pass.
    const bg = scene.background;
    scene.background = null;
    scene.overrideMaterial = depthOnlyM;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg;
    camera.layers.enable(1);
    holeProxy.matrix.copy(hole.matrixWorld);
    renderer.render(holeScene, camera);
    renderer.autoClear = true;
  }
}
