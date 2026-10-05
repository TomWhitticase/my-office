// The minimap in the HUD's corner: the office's layers registered with ctx.minimap (or the floor's own map).

import { colliders, dash, LIFT, ROOM } from '../util.js';

export function install(ctx) {
  const { mapCtx, lifts, DOOR, people, camera } = ctx;
  Object.assign(ctx, { drawMap });
  // ----- minimap -----
  function drawMap() {
    if (ctx.away) { ctx.away.map(); return; }
    const c = mapCtx, W = 440, H = 330, sx = (x) => ((x - ROOM.minX) / 40) * W, sz = (z) => ((z - ROOM.minZ) / 30) * H;
    c.clearRect(0, 0, W, H);
    ctx.drawMinimap(c, sx, sz);
  }
  ctx.minimap((c, sx, sz) => {   // areas, everything solid, and their names
    c.fillStyle = 'rgba(181,138,95,.35)'; c.fillRect(sx(-19.9), sz(2.6), sx(-2) - sx(-19.9), sz(14.9) - sz(2.6));
    c.fillStyle = 'rgba(86,98,115,.55)'; c.fillRect(sx(6), sz(-15), sx(20) - sx(6), sz(-3.5) - sz(-15));
    c.fillStyle = 'rgba(120,160,185,.4)';
    for (const r of [[14, 20, 2.5, 12.5], [-1.8, 3.4, 11.2, 15]]) c.fillRect(sx(r[0]), sz(r[2]), sx(r[1]) - sx(r[0]), sz(r[3]) - sz(r[2]));
    c.fillStyle = 'rgba(255,255,255,.22)';
    for (const b of colliders) c.fillRect(sx(b.minX), sz(b.minZ), Math.max(2, sx(b.maxX) - sx(b.minX)), Math.max(2, sz(b.maxZ) - sz(b.minZ)));
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillText('Desks', sx(-12), sz(-0.6)); c.fillText('Breakroom', sx(-12), sz(13.6)); c.fillText(dash.officeName(), sx(9), sz(-13.4)); c.fillText('Lounge', sx(8), sz(13.6));
  }, 10);
  ctx.minimap((c, sx, sz) => {   // the lifts
    c.fillStyle = 'rgba(200,205,212,.9)';
    for (const L of lifts) c.fillRect(sx(LIFT.x) - 3, sz(L.z - DOOR.w / 2), 4, sz(L.z + DOOR.w / 2) - sz(L.z - DOOR.w / 2));
    c.font = '600 15px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText('Lifts', sx(LIFT.x) - 44, sz(-2.6));
  }, 20);
  ctx.minimap((c, sx, sz) => {   // everyone, ringed green while they work
    for (const p of people.values()) {
      if (!p.root.visible) continue;
      c.fillStyle = p.color; c.beginPath(); c.arc(sx(p.root.position.x), sz(p.root.position.z), 7, 0, Math.PI * 2); c.fill();
      if (p.session?.status === 'working') { c.strokeStyle = '#22c55e'; c.lineWidth = 3; c.stroke(); }
    }
  }, 30);
  ctx.minimap((c, sx, sz) => {   // you
    const px = sx(camera.position.x), pz = sz(camera.position.z), yaw = camera.rotation.y;
    c.save(); c.translate(px, pz); c.rotate(-yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
  }, 40);
}
