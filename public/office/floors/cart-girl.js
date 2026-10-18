// The girl of the grey meadow (floors/cart.js): small, in an old-fashioned long white dress to the ground, high-collared
// and long-sleeved, her dark hair drawn back into a knot; a pale, still face. Lathed and merged: the dress (its skirt
// swaying and swishing as she walks, in the shader: `walk`), the head and hair, the arms (the right one held out a
// little behind her with the string in its hand). Her own space: +z the way she faces, her feet at the origin.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GIRL_H = 1.16;
const colour = (g, c) => { g = g.index ? g.toNonIndexed() : g; const cl = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) { a[k * 3] = cl.r; a[k * 3 + 1] = cl.g; a[k * 3 + 2] = cl.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; };

export function makeGirl(R, time) {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  root.add(body); body.add(head);
  // ----- the dress: one lathe from the hem to the collar, folds down the skirt -----
  const prof = [[0.235, 0.0], [0.24, 0.03], [0.225, 0.12], [0.2, 0.28], [0.175, 0.42], [0.15, 0.53], [0.128, 0.6], [0.112, 0.64], [0.118, 0.7], [0.13, 0.76], [0.128, 0.82], [0.116, 0.86], [0.09, 0.885], [0.05, 0.9], [0.036, 0.915], [0.034, 0.96]];
  const dress = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
  {
    const p = dress.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), a = Math.atan2(x, z), skirt = Math.max(0, 1 - y / 0.6);
      const f = 1 + skirt * (0.06 * Math.sin(a * 9 + Math.sin(a * 3) * 0.8) + 0.03 * Math.sin(a * 17)) + (y > 0.66 && y < 0.82 ? 0.0 : 0);
      // a little flatter front to back
      p.setXYZ(k, x * f, y, z * f * (y > 0.6 ? 0.82 : 0.94));
    }
    dress.computeVertexNormals();
  }
  // the sash at the waist, a hair proud of the dress
  const sash = new THREE.CylinderGeometry(0.1145, 0.1185, 0.04, 32, 1, true).scale(1, 1, 0.84).translate(0, 0.635, 0);
  // the sleeves: tapered tubes along the arms; the left arm hanging, the right held out behind with the string
  const arm = (pts, r0, r1) => { const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))); const g = new THREE.TubeGeometry(c, 10, 1, 8, false); const pa = g.attributes.position, n = 11;
    // taper: rescale each ring about its centre
    for (let i = 0; i <= 10; i++) { const ctr = c.getPointAt(i / 10), r = r0 + (r1 - r0) * (i / 10); for (let s = 0; s <= 8; s++) { const k = i * 9 + s; pa.setXYZ(k, ctr.x + (pa.getX(k) - ctr.x) * r, ctr.y + (pa.getY(k) - ctr.y) * r, ctr.z + (pa.getZ(k) - ctr.z) * r); } }
    void n; g.computeVertexNormals(); return g; };
  const left = arm([[-0.115, 0.84, 0], [-0.135, 0.72, 0.01], [-0.14, 0.6, 0.03], [-0.13, 0.5, 0.05]], 0.034, 0.026);
  const right = arm([[0.115, 0.84, 0], [0.15, 0.73, -0.03], [0.19, 0.62, -0.1], [0.22, 0.53, -0.17]], 0.034, 0.026);
  const cuffs = [[-0.13, 0.5, 0.05], [0.22, 0.53, -0.17]];
  const skin = '#e3d2c4';
  const hands = cuffs.map(([x, y, z]) => colour(new THREE.SphereGeometry(0.026, 10, 8).scale(0.8, 1.2, 0.9).translate(x, y - 0.03, z), skin));
  const shoes = [-0.06, 0.06].map((x) => colour(new THREE.SphereGeometry(0.045, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.8, 0.5, 1.4).translate(x, 0.0, 0.17), '#2a2522'));
  const white = '#e4e0d4';
  const dressG = mergeGeometries([colour(dress, white), colour(sash, '#cfc9ba'), colour(left, white), colour(right, white), ...hands, ...shoes]);
  const dressM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const walk = { value: 0 }, phase = { value: 0 };
  dressM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { walk, phase, time });
    sh.vertexShader = 'uniform float walk, phase, time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { float sk = clamp(1.0 - position.y / 0.62, 0.0, 1.0);
        // the hem swings with her steps, side to side and a little forward, and stirs in the wind when she's still
        float sw = sin(phase) * walk, st = sin(time * 1.1 + position.x * 6.0) * 0.006;
        transformed.x += sk * sk * (sw * 0.03 + st);
        transformed.z += sk * sk * (abs(cos(phase)) * walk * 0.025 + st * 0.5);
        transformed.y += sk * abs(sin(phase * 2.0)) * walk * 0.006; }`);
  };
  dressM.customProgramCacheKey = () => 'cart-dress';
  const dressMesh = new THREE.Mesh(dressG, dressM);
  body.add(dressMesh);

  // ----- the head: a small pale face, its features painted, still; the hair drawn back into a knot -----
  const hc = document.createElement('canvas'); hc.width = 256; hc.height = 128;
  {
    const g = hc.getContext('2d');
    // (an equirectangular wrap: x round from the back, the face's middle at x = 128)
    g.fillStyle = '#e6d6c9'; g.fillRect(0, 0, 256, 128);
    const grd = (x, y, r, c) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
    grd(112, 76, 10, 'rgba(210,150,140,.35)'); grd(144, 76, 10, 'rgba(210,150,140,.35)');
    for (const x of [116, 140]) { grd(x, 62, 7, 'rgba(120,96,96,.45)'); g.fillStyle = '#2b2422'; g.beginPath(); g.ellipse(x, 63, 3.6, 2.4, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(70,52,46,.8)'; g.fillRect(x - 6, 56, 12, 1.3); }
    g.fillStyle = 'rgba(150,110,100,.55)'; g.fillRect(127, 66, 2, 9);
    g.fillStyle = 'rgba(150,90,88,.8)'; g.beginPath(); g.ellipse(128, 85, 5.5, 1.4, 0, 0, 7); g.fill();
  }
  const faceT = new THREE.CanvasTexture(hc); faceT.colorSpace = THREE.SRGBColorSpace;
  const headG = new THREE.SphereGeometry(0.09, 24, 18, -Math.PI / 2); headG.scale(0.92, 1.08, 0.98);
  { const p = headG.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k), z = p.getZ(k); if (y < -0.02 && z > 0) p.setZ(k, z * (1 - 0.18 * Math.min(1, (-0.02 - y) / 0.07))); } headG.computeVertexNormals(); }
  const headMesh = new THREE.Mesh(headG, new THREE.MeshStandardMaterial({ map: faceT, roughness: 0.7 }));
  headMesh.position.y = 0.1;
  const hairG = mergeGeometries([
    new THREE.SphereGeometry(0.096, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(0.95, 1.08, 1.02).rotateX(-0.42).translate(0, 0.108, -0.008),
    new THREE.SphereGeometry(0.046, 12, 10).translate(0, 0.17, -0.085),
  ].map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
  const hairM = new THREE.MeshStandardMaterial({ color: '#2e2520', roughness: 0.6 });
  const hair = new THREE.Mesh(hairG, hairM);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.06, 10), headMesh.material); neck.position.y = 0.0;
  head.add(headMesh, hair, neck);
  head.position.set(0, 0.95, 0);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  const hand = new THREE.Vector3(0.22, 0.49, -0.17);   // where the string comes from, in her space
  return {
    root, body, head, walk, phase, hand,
    meshes: [dressMesh, headMesh, hair],
  };
}
