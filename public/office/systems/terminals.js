// The terminal pane under the code on each desk's code monitor: everything the session is doing (prompts, replies, tool
// calls and their output, its subagents' too), from /api/session/:id/feed. A desk fetches when the state's `feedN` for its
// session moves, and only while it's near you and in view; it repaints at most a few times a second.

import * as THREE from 'three';
import { drawTerm, TERM_TOP } from '../painters.js';

const NEAR = 15, KEEP = 200, CHECK_MS = 100, PAINT_MS = 250, FETCH_MS = 500;

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { desks, camera } = ctx;
  const frustum = new THREE.Frustum(), m4 = new THREE.Matrix4(), cam = new THREE.Vector3();
  for (const d of desks) {
    d.term = { sid: null, lines: [], since: 0, count: -1, loading: false, fetched: -Infinity, drawn: -Infinity, dirty: false, shown: false };
    d.termAt = d.codeScr.mesh.getWorldPosition(new THREE.Vector3());
  }
  function fetchFeed(T, s) {
    const sid = s.sessionId;
    if (s.feedN < T.count) Object.assign(T, { lines: [], since: 0 });   // the transcript was read again from the start
    T.loading = true; T.fetched = performance.now();
    fetch(`/api/session/${encodeURIComponent(sid)}/feed?since=${T.since}`).then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (!b || T.sid !== sid) return;
      Object.assign(T, { lines: T.lines.concat(b.lines).slice(-KEEP), since: b.seq, count: b.count, dirty: true });
    }).catch(() => {}).finally(() => { if (T.sid === sid) T.loading = false; });
  }
  let checked = -Infinity;
  ctx.onFrame((dt, t, now) => {
    if (ctx.away || now - checked < CHECK_MS) return;
    checked = now;
    camera.getWorldPosition(cam);
    frustum.setFromProjectionMatrix(m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const d of desks) {
      const s = d.owner?.session, T = d.term;
      if (!s || d.codePainted !== 'code') { T.shown = false; continue; }   // off, or away from the desk: the whole monitor is dark
      if (T.sid !== s.sessionId) Object.assign(T, { sid: s.sessionId, lines: [], since: 0, count: -1, loading: false, shown: false });
      const seen = cam.distanceTo(d.termAt) < NEAR && frustum.containsPoint(d.termAt);
      if (seen && s.feedN !== T.count && !T.loading && now - T.fetched > FETCH_MS) fetchFeed(T, s);
      if (T.shown && !(T.dirty && seen && now - T.drawn > PAINT_MS)) continue;
      drawTerm(d.codeScr, s, d.owner.color, T.lines, TERM_TOP);
      d.codeScr.tex.needsUpdate = true;
      Object.assign(T, { shown: true, dirty: false, drawn: now });
    }
  }, 155);
}
