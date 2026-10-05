// The drinks cabinet in your office, against the glass behind your chair (out of your monitors' way), facing the desk: a
// walnut sideboard on brass-shod legs, a brass gallery round its top, a cut-crystal decanter of whisky on a tray with its tumblers, a few
// bottles and an ice bucket. Click the decanter to pour a dram (it tips over the empty tumbler); click again to drink it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ease, rng, solid, sstep } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // A seeded Math.random while building (three draws every uuid from it), so the cabinet doesn't shift the harness's draws.
  const random = Math.random;
  Math.random = rng(1882);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { world } = ctx;
  const X = 11.6, Z = -3.92, W = 1.3, D = 0.46, TOP = 0.875;
  const g = new THREE.Group();
  g.position.set(X, 0, Z); g.rotation.y = Math.PI; world.add(g);   // its back to the blind

  // Geometries gathered per material and merged, a vertex colour each: one draw call per material.
  const tint = (geo, color) => {
    const c = new THREE.Color(color), a = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
  const at = (geo, x, y, z, color, rx = 0, rz = 0) => {
    if (rx) geo.rotateX(rx); if (rz) geo.rotateZ(rz);
    return tint(geo.translate(x, y, z), color);
  };
  const bx = (w, h, d, x, y, z, color) => at(new THREE.BoxGeometry(w, h, d), x, y, z, color);
  const cy = (rt, rb, h, x, y, z, color, seg = 16) => at(new THREE.CylinderGeometry(rt, rb, h, seg), x, y + h / 2, z, color);
  // A turned shape from [radius, y] points, `seg` facets round (8 reads as cut crystal).
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const merged = (geos, material) => { const m = new THREE.Mesh(mergeGeometries(geos), material); m.castShadow = m.receiveShadow = true; return m; };

  const woodM = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.42, metalness: 0, envMapIntensity: 0.8 });
  const brassM = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.28, metalness: 0.95 });
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#eef6f8', transparent: true, opacity: 0.2, roughness: 0.02, metalness: 0, envMapIntensity: 2.6,
    specularIntensity: 1, flatShading: true, side: THREE.DoubleSide, depthWrite: false });
  const whiskyM = new THREE.MeshStandardMaterial({ color: '#8a4a06', emissive: '#4a2600', emissiveIntensity: 0.6, roughness: 0.12,
    transparent: true, opacity: 0.92, envMapIntensity: 1.2 });
  const bottleM = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.8 });

  // ----- the cabinet -----
  const wood = [], brass = [];
  const walnut = '#5a3a22', dark = '#2e1d10', face = '#6b4528';
  wood.push(bx(W, 0.6, D - 0.02, 0, 0.53, -0.01, walnut));                 // carcass, y 0.23..0.83
  wood.push(bx(W + 0.04, 0.035, D + 0.04, 0, TOP - 0.0175, 0, dark));         // top slab
  wood.push(bx(W - 0.02, 0.03, D - 0.04, 0, 0.215, -0.01, dark));             // underside rail
  for (const s of [-1, 1]) wood.push(bx(0.62, 0.54, 0.016, s * 0.322, 0.53, D / 2 - 0.01, face));   // two doors, a shadow line between
  wood.push(bx(0.012, 0.54, 0.01, 0, 0.53, D / 2 - 0.012, '#1a0f07'));
  // Tapered legs splayed a little, brass sabots on their feet.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * (W / 2 - 0.08), lz = sz * (D / 2 - 0.07);
    const leg = new THREE.CylinderGeometry(0.022, 0.014, 0.2, 10).rotateZ(-sx * 0.08).rotateX(sz * 0.08);
    wood.push(tint(leg.translate(lx + sx * 0.008, 0.115, lz + sz * 0.008), dark));
    brass.push(cy(0.0145, 0.013, 0.035, lx + sx * 0.016, 0, lz + sz * 0.016, '#c9a24a', 10));
  }
  // Brass ring pulls, an escutcheon on the right door, and the gallery rail round the back and sides of the top.
  for (const s of [-1, 1]) {
    brass.push(at(new THREE.TorusGeometry(0.022, 0.0035, 6, 18), s * 0.05, 0.62, D / 2 + 0.004, '#d4ad55'));
    brass.push(at(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 10), s * 0.05, 0.645, D / 2 + 0.001, '#d4ad55', Math.PI / 2));
  }
  brass.push(at(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), 0.1, 0.62, D / 2 + 0.001, '#b8913f', Math.PI / 2));
  const gy = TOP + 0.07, gx = W / 2 - 0.02, gz = D / 2 - 0.01;
  brass.push(at(new THREE.CylinderGeometry(0.005, 0.005, 2 * gx, 8), 0, gy, -gz, '#d4ad55', 0, Math.PI / 2));
  for (const s of [-1, 1]) brass.push(at(new THREE.CylinderGeometry(0.005, 0.005, 2 * gz, 8), s * gx, gy, 0, '#d4ad55', Math.PI / 2));
  for (const [px, pz] of [[-gx, -gz], [gx, -gz], [-gx, gz], [gx, gz], [-gx / 3, -gz], [gx / 3, -gz]]) brass.push(cy(0.006, 0.006, 0.07, px, TOP, pz, '#d4ad55', 8));
  // The tray: a brass-rimmed walnut board under the decanter and tumblers.
  const TX = -0.3, TZ = 0.02, TY = TOP + 0.012;
  wood.push(bx(0.52, 0.012, 0.3, TX, TOP + 0.006, TZ, '#3e2716'));
  for (const s of [-1, 1]) { brass.push(bx(0.52, 0.025, 0.008, TX, TOP + 0.0125, TZ + s * 0.15, '#d4ad55'));
    brass.push(bx(0.008, 0.025, 0.3, TX + s * 0.26, TOP + 0.0125, TZ, '#d4ad55')); }

  // ----- glass -----
  const glass = [], whisky = [], bottles = [];
  const tumbler = [[0, 0], [0.038, 0], [0.041, 0.006], [0.042, 0.088], [0.039, 0.088], [0.036, 0.016], [0, 0.016]];
  const tumblers = [[TX + 0.1, TZ - 0.08], [TX + 0.19, TZ + 0.03], [TX + 0.07, TZ + 0.06]];   // the last one is the one you pour into
  for (const [x, z] of tumblers.slice(0, 2)) glass.push(tint(lathe(tumbler, 8).translate(x, TY, z), '#ffffff'));
  whisky.push(cy(0.035, 0.035, 0.018, tumblers[0][0], TY + 0.016, tumblers[0][1], '#ffffff', 12));   // a finger left in one
  // Bottles along the back on the right: a dark green gin, a clear vodka (silver cap), a squat bourbon, each with a label.
  const bottle = (x, z, h, r, neck, body, cap, label) => {
    bottles.push(cy(r, r, h * 0.7, x, TOP, z, body, 14), cy(neck * 1.15, r, h * 0.1, x, TOP + h * 0.7, z, body, 14),
      cy(neck, neck, h * 0.14, x, TOP + h * 0.8, z, body, 12), cy(neck * 1.25, neck * 1.25, h * 0.06, x, TOP + h * 0.94, z, cap, 12),
      cy(r + 0.002, r + 0.002, h * 0.28, x, TOP + h * 0.22, z, label, 14));
  };
  bottle(0.14, -0.1, 0.3, 0.038, 0.013, '#1f4a33', '#c9a24a', '#efe6d2');
  bottle(0.27, -0.12, 0.33, 0.034, 0.012, '#c8d6da', '#9aa3ab', '#20324a');
  bottle(0.4, -0.09, 0.26, 0.045, 0.015, '#5a2a0c', '#1a1a1a', '#d9b26a');
  // An ice bucket: brass-banded, ice heaped in it, tongs leaning on the rim.
  const IX = 0.4, IZ = 0.11;
  brass.push(cy(0.062, 0.052, 0.13, IX, TOP, IZ, '#c9a24a', 20), cy(0.065, 0.065, 0.01, IX, TOP + 0.125, IZ, '#e0bb62', 20));
  for (const s of [-1, 1]) brass.push(at(new THREE.TorusGeometry(0.012, 0.003, 6, 12), IX + s * 0.064, TOP + 0.1, IZ, '#e0bb62', 0, Math.PI / 2));
  const ice = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = i ? 0.032 : 0;
    ice.push(at(new THREE.BoxGeometry(0.028, 0.026, 0.028).rotateY(a), IX + Math.cos(a) * r, TOP + 0.128 + (i ? 0 : 0.012), IZ + Math.sin(a) * r, '#eef6fa'));
  }
  brass.push(at(new THREE.BoxGeometry(0.006, 0.17, 0.012), IX + 0.03, TOP + 0.16, IZ + 0.02, '#e0bb62', 0, -0.35));
  const iceM = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.05, transparent: true, opacity: 0.78, envMapIntensity: 2 });

  g.add(merged(wood, woodM), merged(brass, brassM), merged(bottles, bottleM), merged(ice, iceM), merged(whisky, whiskyM));
  const glassMesh = merged(glass, glassM); glassMesh.castShadow = false; g.add(glassMesh);

  // ----- the decanter and the dram: what the pour moves -----
  // The decanter turns about its base's right-hand edge, so tipping it toward the tumbler swings the neck over its rim.
  const DX = TX - 0.17, DZ = TZ + 0.06, DR = 0.062;
  const pour = { t: -1, level: 0, full: 0.04, decanter: 1, sipping: -1 };
  const pivot = new THREE.Group(); pivot.position.set(DX + DR, TY, DZ); g.add(pivot);
  const dec = new THREE.Group(); dec.position.x = -DR; pivot.add(dec);
  const decGlass = new THREE.Mesh(mergeGeometries([
    lathe([[0, 0], [0.056, 0], [0.062, 0.012], [0.064, 0.13], [0.058, 0.155], [0.036, 0.18], [0.021, 0.2], [0.02, 0.236], [0.026, 0.242], [0.02, 0.246]], 8),
    new THREE.SphereGeometry(0.032, 8, 6).scale(1, 0.85, 1).translate(0, 0.275, 0),           // the stopper
    new THREE.CylinderGeometry(0.016, 0.018, 0.03, 8).translate(0, 0.25, 0)]), glassM.clone());
  decGlass.material.side = THREE.FrontSide; decGlass.material.opacity = 0.14;   // one layer of glass over the whisky, drawn after it
  decGlass.castShadow = false; decGlass.renderOrder = 1;
  // The whisky in it: a turned volume just inside the glass, scaled down a little with each dram.
  const decWhisky = new THREE.Mesh(lathe([[0, 0.012], [0.057, 0.012], [0.06, 0.13], [0.054, 0.15], [0, 0.15]], 8), whiskyM.clone());
  decWhisky.material.color.set('#6e3804');   // deeper through the depth of a full decanter
  dec.add(decWhisky, decGlass);
  const glassPour = new THREE.Mesh(lathe(tumbler, 8), glassM); glassPour.castShadow = false;
  const [PX, PZ] = tumblers[2];
  glassPour.position.set(PX, TY, PZ);
  const dram = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 1, 12).translate(0, 0.5, 0), whiskyM);
  dram.position.set(PX, TY + 0.016, PZ); dram.scale.y = 0.0001; dram.visible = false;
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0025, 1, 6).translate(0, -0.5, 0), whiskyM);
  stream.visible = false;
  g.add(glassPour, dram, stream);
  // An invisible box over the decanter takes the clicks (glass is on the layer the hover ray skips).
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 0.15), new THREE.MeshBasicMaterial());
  hit.position.set(DX, TY + 0.16, DZ); hit.visible = false; hit.userData = { action: 'decanter', reach: 3.5 }; g.add(hit);
  solid(X, Z, W + 0.06, D + 0.06);

  // Pouring: lift and tip (0–0.8 s), whisky runs into the tumbler (0.8–2.4 s), set it back down (2.4–3.2 s).
  const _mouth = new THREE.Vector3();
  function pourFx(dt) {
    if (pour.sipping >= 0) {
      pour.sipping += dt;
      pour.level = pour.full * (1 - sstep(0, 1.4, pour.sipping));
      if (pour.sipping >= 1.4) { pour.sipping = -1; pour.level = 0; }
    }
    if (pour.t >= 0) {
      pour.t += dt;
      const t = pour.t, k = t < 0.8 ? ease(t / 0.8) : t < 2.4 ? 1 : 1 - ease(Math.min(1, (t - 2.4) / 0.8));
      pivot.position.y = TY + 0.04 * k; pivot.position.x = DX + DR - 0.03 * k;
      pivot.rotation.z = -1.35 * k;
      const flow = sstep(0.75, 0.9, t) * (1 - sstep(2.25, 2.45, t));
      pour.level = pour.full * sstep(0.85, 2.4, t);
      if (flow > 0) {
        dec.updateWorldMatrix(true, false);
        _mouth.set(0, 0.244, 0).applyMatrix4(dec.matrixWorld);
        g.worldToLocal(_mouth);
        const surface = TY + 0.016 + pour.level;
        stream.position.copy(_mouth); stream.scale.set(flow, Math.max(0.001, _mouth.y - surface), flow); stream.visible = true;
      } else stream.visible = false;
      if (t >= 3.2) { pour.t = -1; pivot.position.set(DX + DR, TY, DZ); pivot.rotation.z = 0; stream.visible = false; }
    }
    dram.visible = pour.level > 0.0005;
    dram.scale.y = Math.max(0.0001, pour.level);
  }
  ctx.onFrame((dt) => { if (pour.t >= 0 || pour.sipping >= 0) pourFx(dt); }, 75);
  const poured = () => pour.level > 0 && pour.t < 0 && pour.sipping < 0;
  ctx.action('decanter', {
    hover: () => `<b>Whisky decanter</b><div class="k">${pour.t >= 0 ? 'Pouring…' : pour.sipping >= 0 ? 'Sláinte' : poured() ? 'Click to drink your dram'
      : 'Click to pour a dram'}</div>`,
    click: () => {
      if (pour.t >= 0 || pour.sipping >= 0) return;
      if (poured()) { pour.sipping = 0; return; }
      pour.t = 0;
      pour.decanter = Math.max(0.35, pour.decanter - 0.08); decWhisky.scale.y = pour.decanter;
      ctx.sfx.pour?.(new THREE.Vector3(PX, TY + 0.1, PZ).applyMatrix4(g.matrixWorld));
    },
  });
  ctx.hoverTargets(() => [hit], 45);
  Object.assign(ctx, { drinks: { pour, hit } });
}
