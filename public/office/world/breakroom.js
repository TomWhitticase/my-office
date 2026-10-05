// The breakroom: sofas round a coffee table, the ping pong table and its ball, a high table for chats, beanbags, and
// (installCozy, after the whiteboard) its bookshelf divider, lamps, pendants and neon.

import * as THREE from 'three';
import { box, cyl, damp, FONT, lerp, makeScreen, mat, PP, solid } from '../util.js';

export function install(ctx) {
  const { sofa, world } = ctx;
  // ----- breakroom -----
  sofa(-14, 5.2, 0);
  sofa(-14, 8.8, Math.PI);
  box(world, 1.3, 0.06, 0.65, '#8a6a4a', -14, 0.4, 7, { mat: { roughness: 0.5 } });
  box(world, 1.2, 0.37, 0.55, '#6e5238', -14, 0.185, 7);
  solid(-14, 7, 1.3, 0.65);
  cyl(world, 0.06, 0.06, 0.12, '#2f6f8f', -14.3, 0.49, 7.1); cyl(world, 0.04, 0.035, 0.1, '#f4f1ea', -13.7, 0.48, 6.9);
  // Ping pong, by the kitchen (east of the island, clear of the x -11.6 corridor to the kitchen).
  box(world, 2.74, 0.04, 1.525, '#1d5c3a', PP.x, 0.76, PP.z, { mat: { roughness: 0.5 } });
  box(world, 2.74, 0.005, 0.02, '#ffffff', PP.x, 0.783, PP.z, { shadow: false });
  box(world, 0.02, 0.15, 1.6, '#eeeeee', PP.x, 0.86, PP.z, { mat: { transparent: true, opacity: 0.7 } });
  for (const dx of [-1.2, 1.2]) for (const dz of [-0.65, 0.65]) box(world, 0.05, 0.74, 0.05, '#222', PP.x + dx, 0.37, PP.z + dz);
  solid(PP.x, PP.z, 2.74, 1.525);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }));
  ball.castShadow = true; world.add(ball);
  // High table for chats.
  cyl(world, 0.4, 0.4, 0.04, '#f2efe9', -9.6, 1.06, 4.9, { seg: 24 });
  cyl(world, 0.04, 0.04, 1.04, '#2f3236', -9.6, 0.52, 4.9);
  cyl(world, 0.25, 0.25, 0.03, '#2f3236', -9.6, 0.015, 4.9);
  solid(-9.6, 4.9, 0.8, 0.8);
  cyl(world, 0.04, 0.035, 0.1, '#d97757', -9.5, 1.13, 4.85);
  // Beanbags.
  for (const z of [7.6, 9.6]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), mat(z < 8 ? '#c0573e' : '#e0a63a', { roughness: 1 }));
    b.scale.set(1, 0.55, 1); b.position.set(-18.35, 0.26, z); b.castShadow = true; b.receiveShadow = true; world.add(b);
  }
  Object.assign(ctx, { ball });
  ctx.onFrame((dt, t) => {
    // Ping pong rally when both ends are manned and settled.
    const [a, b] = ctx.pp.map((q) => q.occupant);
    const rally = a && b && !a.path.length && !b.path.length && a.spot === ctx.pp[0] && b.spot === ctx.pp[1];
    ball.visible = !!rally;
    if (rally) {
      const P = 1.05, k = (t % (2 * P)) / P, dir = k < 1, u = dir ? k : k - 1;
      const x0 = PP.x - 1.45, x1 = PP.x + 1.45;
      const z = PP.z + 0.35 * Math.sin(t * 0.9);
      ball.position.set(dir ? lerp(x0, x1, u) : lerp(x1, x0, u), 0.79 + 0.32 * Math.abs(Math.sin(u * Math.PI * 2 * 0.75 + 0.1)), z);
      a.swing = dir ? Math.max(0, 1 - u * 4) : Math.max(0, (u - 0.75) * 4);
      b.swing = dir ? Math.max(0, (u - 0.75) * 4) : Math.max(0, 1 - u * 4);
      a.root.position.z = damp(a.root.position.z, z, 4, dt); b.root.position.z = damp(b.root.position.z, z, 4, dt);
      ctx.sfx.rally(k, ball.position);
    }
  }, 40);
}

export function installCozy(ctx) {
  const { bookshelf, floorLamp, pendant, plant, addLamp, smallPlant, world } = ctx;
  // Cozy bits: bookshelf divider, lamps, pendants, neon.
  bookshelf(-16, 2.42, 0, 7, 1.1, 2);
  for (const x of [-18.6, -16.2, -13.5]) smallPlant(world, x, 1.1, 2.42);
  floorLamp(-15.75, 4.95, 10);
  pendant(-14, 7, { light: 14 });
  pendant(-9.6, 4.9, { drop: 1.1, light: 10, shade: '#d97757' });
  pendant(PP.x - 0.6, PP.z, { drop: 0.9 }); pendant(PP.x + 0.6, PP.z, { drop: 0.9 });
  plant(-12, 2.6, 0.8);
  {
    const neon = makeScreen(world, 1.8, 0.45, 720, 180, -19.84, 2.78, 4.6);
    neon.mesh.rotation.y = Math.PI / 2;
    const { ctx } = neon;
    ctx.clearRect(0, 0, 720, 180);
    ctx.font = `italic 700 110px ${FONT}`; ctx.textAlign = 'center';
    ctx.shadowColor = '#ff5fa2'; ctx.shadowBlur = 30; ctx.fillStyle = '#ffd1e6';
    ctx.fillText('ship it ✦', 360, 128); ctx.fillText('ship it ✦', 360, 128);
    neon.mesh.material.transparent = true;
    neon.tex.needsUpdate = true;
  }
  addLamp(-17.5, 2.6, -7.5, 16); addLamp(-9, 2.6, -5.5, 16); addLamp(-1, 2.6, -9.5, 14);
}
