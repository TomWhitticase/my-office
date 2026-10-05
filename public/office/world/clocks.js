// Wall clocks: their hands follow the office's simulated time (the clock driving the sky, sped up with T); one shared
// face canvas.

import * as THREE from 'three';
import { box, cyl, FONT, makeCanvas, mat } from '../util.js';

export function install(ctx) {
  const { world, clockState } = ctx;
  Object.assign(ctx, { updateClocks });
  // ----- wall clocks -----
  // Hands follow the office's simulated time (the clock driving the sky, sped up with T); one shared face canvas.
  const clocks = [];
  const clockFaceM = (() => {
    const t = makeCanvas(256, 256), { ctx } = t;
    ctx.fillStyle = '#f7f5f0'; ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1c1e'; ctx.textAlign = 'center'; ctx.font = `500 30px ${FONT}`;
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2, big = i % 5 === 0;
      ctx.save(); ctx.translate(128, 128); ctx.rotate(a); ctx.fillRect(big ? -3 : -1, -122, big ? 6 : 2, big ? 18 : 8); ctx.restore();
      if (big) ctx.fillText(String(i / 5 || 12), 128 + Math.sin(a) * 84, 139 - Math.cos(a) * 84);
    }
    t.tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.6 });
  })();
  const handM = mat('#1c1c1e', { roughness: 0.5 }), secM = mat('#d0402b', { roughness: 0.5 });
  function wallClock(x, y, z, rotY, r = 0.2) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; world.add(g);
    cyl(g, r + 0.02, r + 0.02, 0.05, '#2a2b2e', 0, 0, 0.025, { seg: 40 }).rotation.x = Math.PI / 2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 40), clockFaceM); face.position.z = 0.051; g.add(face);
    const hand = (len, w, m, z) =>
      { const p = new THREE.Group(); p.position.z = z; g.add(p); box(p, w, len, 0.005, '', 0, len * 0.4, 0, { material: m, shadow: false }); return p; };
    clocks.push({ h: hand(r * 0.55, r * 0.1, handM, 0.056), m: hand(r * 0.85, r * 0.065, handM, 0.061), s: hand(r * 0.92, r * 0.025, secM, 0.066) });
    cyl(g, r * 0.06, r * 0.06, 0.02, '#d0402b', 0, 0, 0.068, { seg: 12 }).rotation.x = Math.PI / 2;
  }
  function updateClocks(d) {
    const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60, T = -Math.PI * 2;
    // faster, the second hand just blurs
    for (const c of clocks) { c.h.rotation.z = (h / 12) * T; c.m.rotation.z = (m / 60) * T; c.s.rotation.z = (s / 60) * T;
      c.s.visible = clockState.speed <= 120; }
  }
  wallClock(-3.3, 2.45, -14.86, 0);             // desk floor
  wallClock(3.74, 2.65, 8, -Math.PI / 2);       // pillar over the ping pong TV, facing the breakroom
  wallClock(10.55, 2.35, -14.9, 0, 0.18);       // my office
  wallClock(17.2, 2.8, 7.44, Math.PI, 0.17);    // south east meeting room, over the whiteboard
}
