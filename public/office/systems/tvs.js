// The wall TVs: each is a live tab in a browser the server runs (set from its panel or the Admin tab, /api/tvs). Frames
// arrive over one socket (/tv) and are drawn into the screen's canvas; only the nearest few in view stream, the rest keep
// their last frame. installUse: clicking into one to use it, mouse and keys going to its page.

import * as THREE from 'three';
import { escapeHtml } from '../../chat.js';
import { box, clamp, cyl, dash, fit, FONT, makeScreen, ROOM, sstep } from '../util.js';

export function install(ctx) {
  const { world, camera, door, blinds } = ctx;
  Object.assign(ctx, { tvQuiet, openTvPanel, updateTVs, tvSocket });
  // ----- wall TVs -----
  // Each is a live tab in a browser the server runs (set from its panel or the Admin tab, /api/tvs). Frames arrive over
  // one socket and are drawn into the screen's canvas; only the nearest few in view stream, the rest keep their last frame.
  const tvs = [];
  let using = null;   // the TV clicked into, taking mouse and keys
  function tvSet(id, x, y, z, rotY, w, hung) {
    const name = dash.tvList[id];
    const h = w * 9 / 16, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; world.add(g);
    box(g, w + 0.08, h + 0.08, 0.06, '#111214', 0, 0, -0.03, { mat: { roughness: 0.4 } });
    if (hung) for (const dx of [-w / 3, w / 3]) cyl(g, 0.01, 0.01, ROOM.h - y - h / 2, '#222', dx, (ROOM.h - y + h / 2) / 2, -0.03, { shadow: false });
    const scr = makeScreen(g, w, h, 1280, 720, 0, 0, 0.004);
    scr.mesh.userData.tv = id;
    scr.mesh.material.color.setScalar(1); scr.mesh.material.toneMapped = false;   // web pages in their own colours, not tone-mapped
    const t = { id, name, w, h, scr, cfg: null, frame: null, seq: 0, shown: 0, live: false, page: null, center: new THREE.Vector3(x, y, z),
      normal: new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)) };
    t.sphere = new THREE.Sphere(t.center, w * 0.6);
    tvs.push(t);
    paintTv(t);
  }
  const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };
  function paintTv(t) {
    const { ctx, W, H } = t.scr, c = t.cfg;
    ctx.fillStyle = c ? '#0b0d12' : '#050607'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    if (!c) {
      ctx.font = `600 44px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillText(`${t.name.toUpperCase()} TV · CLICK TO SET UP`, W / 2, H / 2 + 16);
    } else if (t.frame) {
      ctx.drawImage(t.frame, 0, 0, W, H);
      if (!t.live && t !== using) {
        ctx.font = `600 26px ${FONT}`; const label = '❚❚  paused · live when you walk closer', lw = ctx.measureText(label).width + 40;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.roundRect(W - lw - 20, H - 68, lw, 48, 24); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(label, W - lw / 2 - 20, H - 35);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(W / 2, 280, 92, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(W / 2 - 28, 232); ctx.lineTo(W / 2 + 48, 280); ctx.lineTo(W / 2 - 28, 328);
      ctx.fill();
      ctx.font = `600 52px ${FONT}`; ctx.fillStyle = '#e8e6df'; ctx.fillText(fit(ctx, hostOf(c.url), W - 160), W / 2, 480);
      ctx.font = `400 36px ${FONT}`; ctx.fillStyle = '#9a9890'; ctx.fillText(t.live ? 'loading…' : 'live when you walk closer', W / 2, 544);
    }
    t.scr.tex.needsUpdate = true;
  }
  tvSet('desks-west', -16.2, 2.05, -14.8, 0, 2.4);
  tvSet('desks-east', -0.4, 2.05, -14.8, 0, 2.4);
  tvSet('breakroom', -14, 2.15, 2.42, 0, 1.8, true);
  tvSet('pingpong', 3.69, 1.6, 8, -Math.PI / 2, 1.4);
  tvSet('lounge', 11, 1.75, 14.78, Math.PI, 2.6);
  tvSet('lobby', 16.9, 2.15, -3.3, 0, 2.0, true);

  // One socket to the server for every TV: JPEG frames in ([id length][id][JPEG]) and page updates; which TVs we're
  // looking at, how loud each should be for us, and input for the TV in use out.
  let sock = null, sentWatch = '', sentFade = '', fadeAt = 0;
  const utf8 = new TextDecoder();
  function tvSocket() {
    if (sock) return;
    sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/tv`);
    sock.binaryType = 'arraybuffer';
    sock.onopen = () => { sentWatch = sentFade = ''; };
    sock.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = JSON.parse(e.data), t = tvs.find((x) => x.id === m.id);
        if (t && m.t === 'page') { t.page = m; if (t === using) ctx.tvBarSync(); }
        return;
      }
      const b = new Uint8Array(e.data), n = b[0], t = tvs.find((x) => x.id === utf8.decode(b.subarray(1, 1 + n)));
      if (!t?.cfg) return;
      const seq = ++t.seq;   // decodes can finish out of order; keep the newest
      createImageBitmap(new Blob([b.subarray(1 + n)], { type: 'image/jpeg' })).then((img) => {
        if (seq < t.shown) return img.close();
        t.shown = seq; t.frame?.close(); t.frame = img; t.dirty = true;
      }).catch(() => {});
    };
    sock.onclose = () => { sock = null; if (ctx.active) setTimeout(tvSocket, 2000); };
  }
  const tvSend = (m) => sock?.readyState === 1 && sock.send(JSON.stringify(m));
  function tvQuiet() { tvSend({ t: 'watch', ids: [] }); tvSend({ t: 'fade', fades: {} }); sentWatch = sentFade = ''; }
  document.addEventListener('visibilitychange', () => { if (document.hidden && ctx.active) tvQuiet(); });

  // Sound fades with distance: full within AUDIO.near, silent by AUDIO.far, times the TV's own volume (applied by the server).
  const AUDIO = { near: 3, far: 20 };
  const tvFrustum = new THREE.Frustum(), tvProj = new THREE.Matrix4(), toCam = new THREE.Vector3();
  function updateTVs(now) {
    camera.updateMatrixWorld();
    tvFrustum.setFromProjectionMatrix(tvProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const t of tvs) t.dist = toCam.subVectors(camera.position, t.center).length();
    const want = tvs.filter((t) => t.cfg && t.dist < 25
      && toCam.subVectors(camera.position, t.center).dot(t.normal) > 0 && tvFrustum.intersectsSphere(t.sphere)).sort((a, b) => a.dist - b.dist).slice(0, 3);
    for (const t of tvs) {
      if (want.includes(t) || t === using) t.seen = now;
      const live = !!t.cfg && now - (t.seen ?? -1e9) < 3000;   // a short grace, so glancing away doesn't stop the stream
      if (live !== t.live) { t.live = live; t.dirty = true; }
      if (t.dirty) { t.dirty = false; paintTv(t); }
    }
    if (sock?.readyState !== 1) return;
    const ids = tvs.filter((t) => t.live).map((t) => t.id), w = `${ids}|${using?.id || ''}`;
    if (w !== sentWatch) { sentWatch = w; tvSend({ t: 'watch', ids, use: using?.id || null }); }
    if (now - fadeAt < 250) return;
    fadeAt = now;
    const fades = {};
    for (const t of tvs) if (t.cfg && t.dist < AUDIO.far) fades[t.id] = Math.round(100 * (1 - sstep(AUDIO.near, AUDIO.far, t.dist))) / 100;
    const f = JSON.stringify(fades);
    if (f !== sentFade) { sentFade = f; tvSend({ t: 'fade', fades }); }
  }
  function applyTvs(map) {
    for (const t of tvs) {
      const c = map?.[t.id] || null;
      if (JSON.stringify(c) === JSON.stringify(t.cfg)) continue;
      if (c?.url !== t.cfg?.url || c?.at !== t.cfg?.at) { t.frame?.close(); t.frame = null; t.shown = t.seq; t.page = null; }
      t.cfg = c; t.dirty = true;
      if (t === using) c ? ctx.tvBarSync() : ctx.leaveTv();
    }
  }
  dash.tvListeners.add(applyTvs);
  applyTvs(dash.tvs);
  // Blinds and door follow the shared office settings (Admin tab, or a click in another browser).
  function applyOffice(o) {
    for (const [k, v] of Object.entries(o?.blinds || {})) if (blinds[k]) blinds[k].to = v;
    if (o && 'door' in o) door.to = o.door;
  }
  dash.officeListeners.add(applyOffice);
  applyOffice(dash.office);

  // TV config lives in the drawer (and the Admin tab). Volume and mute apply live without reloading the page.
  const TV_REFRESH = dash.tvRefresh;
  const normUrl = dash.normUrl;
  function openTvPanel(t) {
    const c = t.cfg || {};
    const db = dash.openPanel(`<div style="font-size:19px;font-weight:650">${escapeHtml(t.name)} TV</div><div class="muted" style="font-size:12px">A live browser tab on the office wall · click the TV to use it</div>`,
      `<form class="panel of-tvform">
        <label>Show this URL<input name="url" type="text" autocomplete="off" spellcheck="false" placeholder="Any web page: YouTube, GitHub, the dashboard" value="${escapeHtml(c.url || '')}"></label>
        <div class="of-presets">Try <button type="button" data-url="${escapeHtml(location.origin)}/">Live dashboard</button></div>
        <label>Auto-refresh<select name="refresh">${TV_REFRESH.map(([v, l]) => `<option value="${v}"${v === (c.refresh || 0) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Volume<span class="of-volrow"><input name="volume" type="range" min="0" max="100"><span class="of-volv"></span><button type="button" data-mute></button></span></label>
        <div class="of-tvwarn"></div>
        <div class="of-tvbtns"><button type="submit" class="pri">Save</button><button type="button" data-off>Turn off</button><a target="_blank" rel="noopener">Open in new tab ↗</a></div>
        <div class="muted" style="font-size:12px">Sound fades with distance on top of this volume. Logins made on a TV stay in the TV browser's own profile.</div>
      </form>`);
    const form = db.querySelector('form'), input = form.elements.url, warn = form.querySelector('.of-tvwarn'), link = form.querySelector('a');
    const vol = form.elements.volume, volV = form.querySelector('.of-volv'), mute = form.querySelector('[data-mute]');
    const check = (msg) => {
      let host = '';
      try { host = new URL(normUrl(input.value)).hostname; } catch {}
      link.href = normUrl(input.value) || '#'; link.style.visibility = host ? '' : 'hidden';
      warn.className = 'of-tvwarn' + (msg ? ' bad' : ''); warn.textContent = msg || '';
    };
    const syncVol = () => {
      const c = dash.tvs[t.id];
      vol.disabled = mute.disabled = !c;
      if (document.activeElement !== vol) vol.value = c?.volume ?? 100;
      volV.textContent = c ? `${c.volume}%` : 'TV off';
      mute.textContent = c?.muted ? 'Unmute' : 'Mute';
    };
    vol.oninput = () => { dash.patchTv(t.id, { volume: +vol.value }); syncVol(); };
    mute.onclick = () => { dash.patchTv(t.id, { muted: !dash.tvs[t.id]?.muted }); syncVol(); };
    dash.tvListeners.add(syncVol);
    new MutationObserver((_, mo) => { if (!form.isConnected) { dash.tvListeners.delete(syncVol); mo.disconnect(); } }).observe(db, { childList: true });
    input.oninput = () => check();
    form.querySelector('.of-presets').onclick = (e) => { const b = e.target.closest('button'); if (b) { input.value = b.dataset.url; check(); } };
    const save = async (url, refresh) => {
      warn.className = 'of-tvwarn'; warn.textContent = url ? 'Saving…' : '';
      const r = await dash.saveTv(t.id, url, refresh);
      if (r?.error) return check(`Couldn't save: ${r.error}`);
      dash.closeDrawer();
    };
    form.onsubmit = (e) => { e.preventDefault(); save(normUrl(input.value), +form.elements.refresh.value); };
    form.querySelector('[data-off]').onclick = () => save('', 0);
    check(); syncVol();
    input.focus(); input.select();
  }
  Object.assign(ctx, { tvSend, tvs, hostOf });
  Object.defineProperty(ctx, 'using', { get: () => using, set: (v) => { using = v; }, enumerable: true });
  ctx.hoverTargets(() => tvs.map((t) => t.scr.mesh), 70);
}

export function installUse(ctx) {
  const { hud, renderer, keys, camera, tween, camPose, player, ALT, tvSend, openTvPanel, IS_MAC } = ctx;
  Object.assign(ctx, { leaveTv, tvBarSync, useTv, tvMouse });
  // ----- using a TV -----
  // Clicking a TV frames it square-on and frees the mouse: the cursor maps onto the page through the screen's UVs, and keys
  // go to the page until Esc. The bar below has back/forward/reload/home, the address, and the TV's volume.
  const tvBar = hud.querySelector('.of-tvbar'), tvUrl = tvBar.querySelector('input[name=u]'), tvVol = tvBar.querySelector('input[type=range]');
  const tvMuteBtn = tvBar.querySelector('[data-act=mute]'), osdEl = hud.querySelector('.of-osd');
  const BTN = ['left', 'middle', 'right'];
  const mods = (e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
  function useTv(t) {
    if (!t?.cfg || !ctx.active) return;
    if (document.pointerLockElement) document.exitPointerLock();
    ctx.using = t; ctx.mode = 'tv'; keys.clear(); t.dirty = true;
    hud.classList.add('of-using');
    tvBarSync();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), d = Math.max(t.h / 2 / half / 0.82, t.w / 2 / (half * camera.aspect) / 0.92);
    tween(camPose(), { x: t.center.x + t.normal.x * d, y: t.center.y, z: t.center.z + t.normal.z * d, yaw: Math.atan2(t.normal.x, t.normal.z), pitch: 0 }, 700);
  }
  function leaveTv(relock) {
    if (!ctx.using) return;
    ctx.using.dirty = true; ctx.using = null;
    hud.classList.remove('of-using');
    tvUrl.blur();
    if (ctx.mode !== 'tv') return;
    tween(camPose(), { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch }, 600,
      () => { if (ctx.mode === 'tv') ctx.mode = 'free'; });
    if (relock) renderer.domElement.requestPointerLock();   // only works from a click; after Esc, click to look around again
  }
  function tvBarSync() {
    if (!ctx.using) return;
    const c = ctx.using.cfg;
    if (document.activeElement !== tvUrl) tvUrl.value = ctx.using.page?.url || c.url;
    if (document.activeElement !== tvVol) tvVol.value = c.volume;
    tvMuteBtn.textContent = c.muted ? '🔇' : c.volume ? '🔊' : '🔈';
    tvMuteBtn.title = `${c.muted ? 'Unmute' : 'Mute'} (${ALT}M)`;
    hud.querySelector('.of-tvname').textContent = ctx.using.name;
  }
  let osdT = 0;
  function tvVolume(patch) {
    const c = { ...ctx.using.cfg, ...patch };
    dash.patchTv(ctx.using.id, patch);
    osdEl.textContent = c.muted ? '🔇  Muted' : `${c.volume ? '🔊' : '🔈'}  ${c.volume}%`;
    osdEl.classList.add('on'); clearTimeout(osdT); osdT = setTimeout(() => osdEl.classList.remove('on'), 1100);
  }
  const volStep = (d) => tvVolume({ volume: clamp(ctx.using.cfg.volume + d, 0, 100), muted: false });
  tvBar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !ctx.using) return;
    if (b.dataset.nav) tvSend({ t: 'nav', id: ctx.using.id, act: b.dataset.nav });
    else if (b.dataset.act === 'mute') tvVolume({ muted: !ctx.using.cfg.muted });
    else if (b.dataset.act === 'setup') openTvPanel(ctx.using);
    else if (b.dataset.act === 'leave') leaveTv(true);
    b.blur();
  });
  tvVol.addEventListener('input', () => ctx.using && tvVolume({ volume: +tvVol.value, muted: false }));
  tvVol.addEventListener('change', () => tvVol.blur());
  tvBar.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (ctx.using && tvUrl.value.trim()) tvSend({ t: 'nav', id: ctx.using.id, act: 'go', url: dash.normUrl(tvUrl.value) });
    tvUrl.blur();
  });
  tvUrl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); tvUrl.blur(); tvBarSync(); } });

  const tvRay = new THREE.Raycaster(), tvNdc = new THREE.Vector2();
  let tvMove = null;   // latest mousemove, sent once per frame
  function tvMouse(e, type, extra) {
    if (ctx.mode !== 'tv' || !ctx.using || ctx.anim) return;
    const r = renderer.domElement.getBoundingClientRect();
    tvNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    tvRay.setFromCamera(tvNdc, camera);
    const hit = tvRay.intersectObject(ctx.using.scr.mesh)[0];
    if (!hit) return;
    const press = type === 'mousePressed' || type === 'mouseReleased';
    tvSend({ t: 'mouse', id: ctx.using.id, type, x: hit.uv.x, y: 1 - hit.uv.y, button: press ? BTN[e.button] || 'none' : e.buttons & 1 ? 'left' : 'none',
      buttons: e.buttons, clickCount: press ? e.detail || 1 : 0, mods: mods(e), ...extra });
  }
  const gl = renderer.domElement;
  gl.addEventListener('mousemove', (e) => { if (ctx.mode === 'tv') tvMove = e; });
  gl.addEventListener('mousedown', (e) => { document.activeElement?.blur?.(); tvMouse(e, 'mousePressed'); });
  gl.addEventListener('mouseup', (e) => tvMouse(e, 'mouseReleased'));
  gl.addEventListener('contextmenu', (e) => { if (ctx.mode === 'tv') e.preventDefault(); });
  gl.addEventListener('wheel', (e) => {
    if (ctx.mode !== 'tv' || !ctx.using) return;
    e.preventDefault();
    if (e.altKey) return volStep(e.deltaY < 0 ? 5 : -5);
    const k = [1, 40, 720][e.deltaMode] || 1;
    tvMouse(e, 'mouseWheel', { dx: e.deltaX * k, dy: e.deltaY * k });
  }, { passive: false });
  // ⌘A/C/X/Z need explicit editing commands on a Mac; ⌘V is sent as text from the paste event; other ⌘ shortcuts stay the dashboard's.
  const CMDS = { KeyA: 'selectAll', KeyC: 'copy', KeyX: 'cut', KeyZ: 'undo' };
  const VOL_KEYS = { KeyM: () => tvVolume({ muted: !ctx.using.cfg.muted }), Minus: () => volStep(-10), Equal: () => volStep(10) };
  function tvKey(e) {
    if (ctx.mode !== 'tv' || !ctx.using || e.target.closest?.('input, select, textarea, #drawer')) return;
    const down = e.type === 'keydown';
    if (e.code === 'Escape') { if (down) { e.preventDefault(); leaveTv(); } return; }
    if (e.altKey && !e.metaKey && !e.ctrlKey && VOL_KEYS[e.code]) { e.preventDefault(); if (down) VOL_KEYS[e.code](); return; }
    if ((e.metaKey || (e.ctrlKey && !IS_MAC)) && e.code === 'KeyV') return;
    if (e.metaKey && !CMDS[e.code] && e.key !== 'Meta') return;
    e.preventDefault();
    const text = !down ? '' : e.key === 'Enter' ? '\r' : e.key.length === 1 && !e.ctrlKey && !e.metaKey ? e.key : '';
    tvSend({ t: 'key', id: ctx.using.id, type: !down ? 'keyUp' : text ? 'keyDown' : 'rawKeyDown', key: e.key, code: e.code, keyCode: e.keyCode, text,
      mods: mods(e), loc: e.location, cmd: down && e.metaKey ? CMDS[e.code] : undefined });
  }
  document.addEventListener('keydown', tvKey);
  document.addEventListener('keyup', tvKey);
  document.addEventListener('paste', (e) => {
    if (ctx.mode !== 'tv' || !ctx.using || e.target.closest?.('input, textarea')) return;
    e.preventDefault();
    tvSend({ t: 'text', id: ctx.using.id, text: e.clipboardData.getData('text') });
  });
  Object.assign(ctx, { gl });
  Object.defineProperty(ctx, 'tvMove', { get: () => tvMove, set: (v) => { tvMove = v; }, enumerable: true });
  ctx.onFrame((dt, t, now) => {
    if (ctx.tvMove) { tvMouse(ctx.tvMove, 'mouseMoved'); ctx.tvMove = null; }
    if (!ctx.away) ctx.updateTVs(now);
  }, 140);
}
