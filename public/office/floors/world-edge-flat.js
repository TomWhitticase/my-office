// The flat off the corridor behind the sky (world-edge-backstage.js): cramped and dark, tired wallpaper, a brown carpet.
// Two figures on a sagging sofa, faceless and still, watching a TV: it shows your office live (its own security camera,
// in colour), until you stand in their doorway, when it shows you, standing in their doorway, from beside the set. They
// don't turn round. The TV's glow on the room, a muffled laugh track (world-edge-sound.js), a takeaway on the table.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FONT, makeCanvas, ME_LAYER, mergedBoxes } from '../util.js';

const TW = 320, TH = 180;

export function installFlat(ctx, bs, PLAN) {
  const root = bs.root, { FLAT } = PLAN, R = Math.random, hits = [], cols = [];
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  const info = (h, k) => ({ action: 'backstage', reach: 4, info: `<b>${h}</b>${k ? `<div class="k">${k}</div>` : ''}` });
  const cx = FLAT.door - 0.2, tvZ = FLAT.z0 + 0.35, sofaZ = FLAT.z0 + 2.5;

  // ----- the sofa (facing the TV, its back to the door), a coffee table, a lamp, a sideboard, closed blinds -----
  const sofa = [], fab = '#5d4a3c', fab2 = '#4c3c30';
  sofa.push([2.1, 0.42, 0.85, cx, 0.21, sofaZ, fab2], [2.1, 0.5, 0.22, cx, 0.62, sofaZ + 0.34, fab], [0.22, 0.6, 0.85, cx - 1.05, 0.3, sofaZ, fab], [0.22, 0.6, 0.85, cx + 1.05, 0.3, sofaZ, fab]);
  sofa.push([0.95, 0.14, 0.62, cx - 0.48, 0.47, sofaZ - 0.06, '#66523f'], [0.95, 0.12, 0.62, cx + 0.48, 0.46, sofaZ - 0.06, '#614e3d']);   // cushions, one sunk
  sofa.push([1.1, 0.04, 0.6, cx, 0.42, tvZ + 2.0, '#4a3523'], ...[[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].map(([x, z]) => [0.04, 0.4, 0.04, cx + x, 0.2, tvZ + 2.0 + z, '#3a2a1c']));
  sofa.push([1.6, 0.55, 0.42, cx, 0.275, tvZ + 0.05, '#3b2c20']);   // the sideboard the TV's on
  sofa.push([1.3, 0.8, 0.4, FLAT.x0 + 0.25, 0.4, FLAT.z0 + 3.4, '#4a3a2c'], [1.3, 0.04, 0.4, FLAT.x0 + 0.25, 1.1, FLAT.z0 + 3.4, '#4a3a2c']);   // a shelf, by the west wall (turned)
  const furn = mergedBoxes(sofa, M({ vertexColors: true }));
  root.add(furn);
  cols.push({ minX: cx - 1.16, maxX: cx + 1.16, minZ: sofaZ - 0.45, maxZ: sofaZ + 0.46 }, { minX: cx - 0.58, maxX: cx + 0.58, minZ: tvZ + 1.68, maxZ: tvZ + 2.32 },
    { minX: cx - 0.82, maxX: cx + 0.82, minZ: FLAT.z0, maxZ: tvZ + 0.3 }, { minX: FLAT.x0, maxX: FLAT.x0 + 0.5, minZ: FLAT.z0 + 2.7, maxZ: FLAT.z0 + 4.1 });
  hits.push(ctx.hitBox(root, 2.3, 0.9, 0.9, cx, 0.45, sofaZ, info('A sofa', 'Sagging in the middle. They’ve been sitting there a long time.')));
  // a window with its blind down, the street's light leaking round it
  const blind = makeCanvas(128, 128), bc = blind.ctx;
  bc.fillStyle = '#2a2621'; bc.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 8) { bc.fillStyle = 'rgba(255,220,170,.06)'; bc.fillRect(0, y, 128, 2); }
  blind.tex.needsUpdate = true;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), M({ map: blind.tex, emissive: '#ffcc88', emissiveIntensity: 0.02 }));
  win.position.set(FLAT.x0 + 0.002, 1.45, FLAT.z0 + 1.4); win.rotation.y = Math.PI / 2; root.add(win);
  // the lamp: a tall shade in the corner, on low
  const lampM = M({ color: '#d9c49a', emissive: '#ffb860', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 16, 1, true), lampM); shade.position.set(FLAT.x1 - 0.4, 1.45, FLAT.z0 + 0.45); root.add(shade);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 6), M({ color: '#2b2b2b' })); pole.position.set(FLAT.x1 - 0.4, 0.68, FLAT.z0 + 0.45); root.add(pole);
  const lampL = new THREE.PointLight('#ffb070', 0.9, 5, 1.8); lampL.position.set(FLAT.x1 - 0.4, 1.4, FLAT.z0 + 0.5); root.add(lampL);

  // ----- the takeaway: cartons, a foil tray, cans -----
  const tk = [], tz = tvZ + 2.0;
  tk.push([0.12, 0.1, 0.1, cx - 0.25, 0.49, tz + 0.05, '#efe9dc'], [0.12, 0.1, 0.1, cx - 0.08, 0.49, tz - 0.12, '#efe9dc'], [0.22, 0.035, 0.15, cx + 0.2, 0.457, tz + 0.08, '#bfc3c7'],
    [0.2, 0.012, 0.16, cx + 0.22, 0.446, tz - 0.14, '#d8d2c0']);
  root.add(mergedBoxes(tk, M({ vertexColors: true, roughness: 0.5 })));
  const can = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14);
  const cans = new THREE.Mesh(mergeGeometries([can.clone().translate(cx + 0.42, 0.5, tz + 0.12), can.clone().rotateZ(Math.PI / 2).translate(cx + 0.38, 0.473, tz - 0.05)]), M({ color: '#9a1d1d', metalness: 0.7, roughness: 0.3 }));
  root.add(cans);
  const lid = makeCanvas(64, 64); lid.ctx.fillStyle = '#efe9dc'; lid.ctx.fillRect(0, 0, 64, 64); lid.ctx.fillStyle = '#b8261d'; lid.ctx.font = `700 22px ${FONT}`; lid.ctx.fillText('☺', 20, 40); lid.tex.needsUpdate = true;
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lid.tex })); tag.position.set(cx - 0.25, 0.541, tz + 0.05); root.add(tag);
  hits.push(ctx.hitBox(root, 1.1, 0.3, 0.6, cx, 0.5, tz, info('A takeaway', 'Half eaten. Cold. Two forks.')));

  // ----- the two of them: smooth, faceless, sitting, never moving much -----
  const torso = new THREE.LatheGeometry([[0, 0.0], [0.15, 0.02], [0.17, 0.2], [0.19, 0.38], [0.12, 0.48], [0.05, 0.52], [0.045, 0.57], [0, 0.58]].map(([x, y]) => new THREE.Vector2(x, y)), 16).scale(1, 1, 0.7);
  const head = new THREE.SphereGeometry(0.105, 16, 12).scale(0.9, 1.2, 1).translate(0, 0.69, 0);
  const thigh = new THREE.CapsuleGeometry(0.07, 0.36, 4, 8).rotateX(Math.PI / 2).translate(0, 0, -0.22);
  const shin = new THREE.CapsuleGeometry(0.06, 0.36, 4, 8).translate(0, -0.22, -0.42);
  const arm = new THREE.CapsuleGeometry(0.048, 0.48, 4, 8).rotateX(0.5).translate(0, 0.3, -0.12);
  const skin = M({ color: '#c9c2b4', roughness: 0.75 });
  const people = [];
  for (const [dx, lean, tilt] of [[-0.5, 0.06, 0.05], [0.52, -0.04, -0.08]]) {
    const parts = [torso.clone(), head.clone(), ...[-0.1, 0.1].map((s) => thigh.clone().translate(s, 0, 0)), ...[-0.1, 0.1].map((s) => shin.clone().translate(s, 0, 0)),
      ...[-0.2, 0.2].map((s) => arm.clone().translate(s, 0, 0))].map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of parts) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const p = new THREE.Mesh(mergeGeometries(parts), skin);
    p.position.set(cx + dx, 0.46, sofaZ + 0.05); p.rotation.set(0.12, tilt, lean); root.add(p);   // facing the TV (-z), leant back a little
    people.push(p);
    hits.push(ctx.hitBox(root, 0.6, 1.3, 0.7, cx + dx, 0.75, sofaZ, info('Someone watching', 'They don’t look round.')));
  }

  // ----- the TV: on the sideboard, a camera hidden beside it looking back at the door -----
  const tvG = new THREE.Group(); tvG.position.set(cx, 0.55, tvZ + 0.1); root.add(tvG);
  tvG.add(mergedBoxes([[1.32, 0.8, 0.08, 0, 0.46, 0, '#0b0b0c'], [0.36, 0.04, 0.22, 0, 0.02, 0, '#141414'], [0.06, 0.08, 0.04, 0, 0.06, 0, '#141414']], M({ vertexColors: true, roughness: 0.4 })));
  const rt = new THREE.WebGLRenderTarget(TW, TH, { depthBuffer: false });
  const tvM = new THREE.ShaderMaterial({
    uniforms: { map: { value: rt.texture }, k: { value: 1.6 }, on: { value: 0 }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float k, on, t; varying vec2 vUv;
      void main() {
        vec3 c = pow(texture2D(map, vUv).rgb, vec3(2.2)) * on;
        c *= 0.94 + 0.06 * sin(vUv.y * 420.0 + t * 30.0);
        gl_FragColor = vec4(c * k * (0.97 + 0.03 * sin(t * 50.0)), 1.0);
      }`,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.7), tvM); screen.position.set(0, 0.47, 0.042); tvG.add(screen);
  hits.push(Object.assign(screen, { userData: info('Their TV', 'Live.') }));
  const glow = new THREE.PointLight('#a8c4ff', 1.6, 6, 1.6); glow.position.set(cx, 1.0, tvZ + 0.6); root.add(glow);
  const eye = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 30);
  eye.position.set(cx + 0.1, 1.62, tvZ + 0.15); eye.lookAt(PLAN.FLAT.door, 1.2, FLAT.z1);   // (over the set)
  eye.layers.enable(1); eye.layers.enable(ME_LAYER); root.add(eye);
  const self = { F: bs, eye, n: 0 }, office = () => ctx.cctv?.cams.find((c) => c.id === 'my-office');

  // ----- each frame while you're in here or looking in -----
  let at = -1, glowK = 1;
  const v = new THREE.Vector3(), frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere();
  function fx(dt, t) {
    tvM.uniforms.t.value = t;
    glowK += (0.7 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1) + (Math.random() - 0.5) * 0.3 - glowK) * Math.min(1, dt * 6);
    glow.intensity = 1.6 * glowK * (tvM.uniforms.on.value ? 1 : 0.2);
    people[0].rotation.z = 0.06 + 0.01 * Math.sin(t * 0.4); people[1].rotation.z = -0.04 + 0.008 * Math.sin(t * 0.33 + 2);   // breathing, barely
    if (!bs.on || !ctx.cctv?.into) return;
    // you, in the doorway (or in here): it shows you; anywhere else, the office
    const P = ctx.player; v.set(P.x, 0, P.z); root.worldToLocal(v);
    const inDoor = v.x > FLAT.x0 && v.x < FLAT.x1 && v.z > FLAT.z0 && v.z < FLAT.z1 + 1.0;
    const near = Math.hypot(v.x - FLAT.door, v.z - FLAT.z1) < 7;
    if (!near || t - at < (inDoor ? 1 / 10 : 1 / 4)) return;
    const cam0 = ctx.camera;   // and only with the set in view
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(cam0.projectionMatrix, cam0.matrixWorldInverse));
    if (!frustum.intersectsSphere(sphere.set(screen.getWorldPosition(v), 0.8))) return;
    const cam = inDoor ? self : office();
    if (!cam) return;
    at = t;
    ctx.cctv.into(cam, rt, t, 1);
    tvM.uniforms.on.value = 1;
  }
  return { fx, hits, cols, tv: { rt, screen, self }, people };
}
