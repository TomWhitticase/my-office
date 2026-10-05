// What you're pointing at: a ray from the crosshair each frame through everything registered with ctx.hoverTargets (or
// the floor's own hits), the hover card for it, and the click actions registered with ctx.action.

import * as THREE from 'three';
import { CAN_CHAT, escapeHtml, titleOf } from '../../chat.js';
import { dash, F } from '../util.js';
import { statusOf } from '../painters.js';

export function install(ctx) {
  const { camera, targetEl, seats, player, tvs, seatTaken, hostOf } = ctx;
  Object.assign(ctx, { updateHover });
  // ----- hover / inspect -----
  const ray = new THREE.Raycaster();
  ray.far = 14;
  ray.camera = camera;
  let hover = null;
  function updateHover() {
    hover = null;
    if (ctx.locked && ctx.mode === 'free') {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const targets = ctx.away ? [...ctx.away.hits] : ctx.collectTargets([]);
      for (const st of seats) if ((st.floor || 48) === (ctx.away?.n ?? 48) && st.obj !== player.seat?.obj && Math.hypot(st.x - player.x, st.z - player.z) < 4) targets.push(st.obj);
      hover = ctx.away?.pick?.(ray) || null;   // a floor can find what you're looking at itself (inside a repo)
      if (!hover) for (const hit of ray.intersectObjects(targets, true)) {
        const ud = hit.object.userData;
        if (ud.reach && hit.distance > ud.reach) { if (ud.glass || hit.object.material.transparent) continue; break; }
        if (ud.action) { hover = { action: ud.action, door: ud.door, board: ud.board, blind: ud.blind || ud.blindAt?.(hit.point), floor: ud.floorAt?.(hit.uv), key: ud.keyAt?.(hit.uv), drawer: ud.drawerAt?.(hit.point), folder: ud.folderAt?.(hit.instanceId), info: ud.info }; break; }
        if (ud.tv) { hover = { tv: tvs.find((t) => t.id === ud.tv) }; break; }
        if (ud.sessionId) { hover = { sessionId: ud.sessionId, screen: !!ud.screen }; break; }
        if ((ud.seat || ud.seatAt) && hit.distance < 3) { hover = { seat: ud.seat || ud.seatAt(hit.point) }; break; }
        if (hit.object.isMesh && !hit.object.isSprite) break;
      }
    }
    if (!hover) { targetEl.style.display = 'none'; return; }
    targetEl.style.display = 'block';
    const a = hover.action && ctx.actionOf(hover.action);
    if (a?.hover) { targetEl.innerHTML = a.hover(hover); return; }
    if (hover.seat) {
      const taken = seatTaken(hover.seat);
      targetEl.innerHTML = `<b>${hover.seat.name}</b><div class="k">${taken ? 'Someone’s sitting here' : 'Click to sit · move to stand up'}</div>`;
      return;
    }
    if (hover.tv) {
      const c = hover.tv.cfg;
      targetEl.innerHTML = `<b>${escapeHtml(hover.tv.name)} TV</b><div class="m">${c ? escapeHtml(hostOf(c.url)) : 'Off'}</div>
        <div class="k">${c ? 'Click to use it · E (or Shift+click) to set it up' : 'Click to choose what it shows'}</div>`;
      return;
    }
    const s = ctx.state?.live.find((x) => x.sessionId === hover.sessionId);
    if (!s) { targetEl.style.display = 'none'; return; }
    const st = statusOf(s), tr = s.transcript || {};
    const doing = s.status !== 'idle' && tr.pendingTool ? `${tr.pendingTool.name}: ${tr.pendingTool.detail || ''}` : s.status === 'idle' ? `idle for ${F.dur(Date.now() - s.statusSince)}` : 'thinking';
    targetEl.innerHTML = `<b>${escapeHtml(titleOf(s))}</b><div class="m"><span style="color:${st.color}">${st.text}</span> · ${F.usd(s.cost)}${s.statusline?.context ? ` · ${s.statusline.context.used_percentage}% context` : ''}</div>
      <div class="m">${escapeHtml(doing.slice(0, 90))}</div><div class="k">${escapeHtml(s.name)} · ${CAN_CHAT && !hover.screen ? 'click to talk · E for details' : 'click for full details'}</div>`;
  }

  Object.defineProperty(ctx, 'hover', { get: () => hover, set: (v) => { hover = v; }, enumerable: true });
  ctx.onFrame(() => updateHover(), 160);
}
