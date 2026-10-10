// The all-hands: the open floor between the ping pong table and the pillar with its TV. Rows of chairs either side of two
// aisles and beanbags at the front, facing a low stage with a lectern and a big screen showing the office's live numbers.
// Idle sessions gather in it (allHands.spots, see people.js).

import * as THREE from 'three';
import { AISLE, dash, F, fit, FONT, makeScreen, mat, mergedBoxes, rng, SEATED_EYE, solid } from '../util.js';
import { MONO, statusOf } from '../painters.js';
import { titleOf } from '../../chat.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three gives every object a uuid from Math.random: build with a seeded one of our own, so adding the all-hands doesn't
  // shift the draws of everything after it in a seeded run (the harness).
  const random = Math.random;
  Math.random = rng(4848);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { world, rug, addSeat, legM } = ctx;
  // Laid out from the stage's centre line (CX), the audience facing +z, the stage and screen at the north end, short of
  // the small meeting room. The two aisles (CX ± 2) are walkways already: up to the ping pong table's east end
  // (x -4.75) and to the small meeting room's door (x -0.75), so the stage sits between them and they stay clear.
  const CX = -2.75, AISLES = [CX - 2, CX + 2], ROWS = [3.7, 2.8, 1.9], SIDE = [0.3, 0.86, 2.65, 3.21],
    STAGE = { z0: 5.5, z1: 6.95, w: 3.3, h: 0.24 }, SZ = 7.08;
  rug(CX - 3.7, CX + 3.7, 1.4, 5.4, '#cdbb9c', '#3f4a6b');

  // Chairs: stacking chairs, upholstered seat and back on a black frame, all of them two merged meshes. Each has an
  // invisible box to click and sit (hover's seat targets).
  const UP = [], FR = [], spots = [];
  const hitGeo = new THREE.BoxGeometry(0.48, 0.9, 0.46).translate(0, 0.45, 0), hitM = new THREE.MeshBasicMaterial();
  ROWS.forEach((z, row) => {
    for (const s of [-1, 1]) for (const dx of SIDE) {
      const x = CX + s * dx;
      UP.push([0.46, 0.05, 0.44, x, 0.45, z + 0.01, '#34405e'], [0.46, 0.34, 0.045, x, 0.75, z - 0.21, '#34405e']);
      for (const lx of [-0.2, 0.2]) FR.push([0.025, 0.44, 0.025, x + lx, 0.22, z + 0.19], [0.025, 0.92, 0.025, x + lx, 0.46, z - 0.21]);
      FR.push([0.42, 0.02, 0.02, x, 0.1, z - 0.21]);
      const hit = new THREE.Mesh(hitGeo, hitM); hit.position.set(x, 0, z); hit.visible = false; world.add(hit);
      hit.userData.seat = addSeat(hit, 'Chair', 0, SEATED_EYE);
      spots.push({ x, z, row, pose: 'audience' });
    }
  });
  world.add(mergedBoxes(UP, mat('#ffffff', { vertexColors: true, roughness: 0.9 })), mergedBoxes(FR, legM));

  // Beanbags at the front, between the first row and the stage.
  const BAG = ['#d9a441', '#c0573e', '#6b8e4e', '#b5654a'], bagGeo = new THREE.SphereGeometry(0.38, 18, 14);
  [-1.35, -0.45, 0.45, 1.35].forEach((dx, i) => {
    const b = new THREE.Mesh(bagGeo, mat(BAG[i], { roughness: 1 }));
    b.scale.set(1, 0.6, 1); b.position.set(CX + dx, 0.22, 4.7); b.castShadow = true; b.receiveShadow = true; world.add(b);
    b.userData.seat = addSeat(b, 'Beanbag', 0, 0.85);
    spots.push({ x: CX + dx, z: 4.7, row: -1, pose: 'beanbag' });
  });

  // The stage: a low carpeted riser with an oak nosing, a lectern on it, column speakers either side and the screen's
  // stand at the back: one merged mesh.
  const S = STAGE, sz = (S.z0 + S.z1) / 2, sd = S.z1 - S.z0, lx = CX + 0.95, lz = 6.05, y = S.h;
  const SW = 3.0, SH = SW * 9 / 16, SY = 1.95;
  const STG = [[S.w, S.h - 0.02, sd, CX, (S.h - 0.02) / 2, sz, '#24262a'], [S.w - 0.04, 0.02, sd - 0.04, CX, S.h - 0.01, sz, '#3a3d44'],
    [S.w, 0.05, 0.05, CX, S.h - 0.025, S.z0 - 0.005, '#a87447'],
    // lectern: body, oak top, the orange panel facing the rows, plinth, speaker's notes, a mic on a stalk
    [0.56, 0.98, 0.4, lx, y + 0.49, lz, '#2a2c30'], [0.6, 0.04, 0.46, lx, y + 1.0, lz - 0.01, '#a87447'], [0.5, 0.22, 0.01, lx, y + 0.78, lz - 0.205, '#d97757'],
    [0.6, 0.05, 0.44, lx, y + 0.025, lz, '#1d1f22'], [0.22, 0.008, 0.3, lx + 0.08, y + 1.026, lz - 0.02, '#f4f1ea'],
    [0.012, 0.26, 0.012, lx - 0.14, y + 1.15, lz - 0.14, '#1d1f22'], [0.035, 0.06, 0.035, lx - 0.14, y + 1.3, lz - 0.14, '#111111'],
    // the screen's bezel, its posts and feet
    [SW + 0.12, SH + 0.12, 0.08, CX, SY, SZ + 0.05, '#111214']];
  for (const s of [-1, 1]) {
    STG.push([0.24, 1.3, 0.24, CX + s * 1.48, y + 0.65, 6.65, '#17181b']);
    for (let k = 0; k < 4; k++) STG.push([0.15, 0.15, 0.01, CX + s * 1.48, y + 0.3 + k * 0.26, 6.525, '#2c2e33']);
    STG.push([0.08, SY - SH / 2, 0.08, CX + s * 1.35, (SY - SH / 2) / 2, SZ + 0.14, '#2f3236'], [0.08, 0.04, 0.5, CX + s * 1.35, 0.02, SZ + 0.1, '#2f3236']);
  }
  world.add(mergedBoxes(STG, mat('#ffffff', { vertexColors: true, roughness: 0.7 })));
  solid(CX, sz, S.w, sd);
  solid(CX, SZ + 0.1, SW + 0.2, 0.5);

  // The screen, on its stand at the back of the stage, facing the rows.
  const scr = makeScreen(world, SW, SH, 1280, 720, CX, SY, SZ);
  scr.mesh.rotation.y = Math.PI;

  // ----- what's on the screen -----
  // The office's numbers as a town-hall slide: who's live and working, today's tokens and spend, lines changed, and
  // what's being worked on now. Repainted when the state changes, and each minute for the clock.
  let shown = null, minute = -1;
  function paint(St) {
    const { ctx: c, W, H } = scr, t = St.totals, now = new Date();
    c.fillStyle = '#101216'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#d97757'; c.fillRect(0, 0, W, 10);
    c.font = `700 30px ${FONT}`; c.fillStyle = '#d97757'; c.fillText('ALL HANDS', 60, 78);
    c.font = `500 28px ${FONT}`; c.fillStyle = '#8b8a85';
    c.fillText(`${dash.officeName()} · ${now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}`, 60 + c.measureText('ALL HANDS').width * 1.12 + 24, 78);
    c.textAlign = 'right'; c.font = `600 34px ${MONO}`; c.fillStyle = '#e6e5df'; c.fillText(F.clock(now.getTime()), W - 60, 78); c.textAlign = 'left';
    c.font = `800 74px ${FONT}`; c.fillStyle = '#ffffff';
    c.fillText(`${t.live} session${t.live === 1 ? '' : 's'} live, ${t.working} working`, 60, 186);
    const tiles = [['Tokens today', F.tok(t.todayTokens), `${F.tok(t.todayOutput)} output`], ['Spend today', F.usd(t.todayCost), `${t.todaySessions} sessions`],
      ['Lines changed', `+${t.linesAdded.toLocaleString()}`, `−${t.linesRemoved.toLocaleString()} removed`], ['Subagents', String(t.subagentsActive), 'running now']];
    tiles.forEach(([k, v, sub], i) => {
      const x = 60 + i * 296, y = 236;
      c.fillStyle = '#1b1e24'; c.beginPath(); c.roundRect(x, y, 276, 168, 14); c.fill();
      c.font = `600 22px ${FONT}`; c.fillStyle = '#8b8a85'; c.fillText(k.toUpperCase(), x + 24, y + 42);
      c.font = `700 56px ${FONT}`; c.fillStyle = '#f3f2ec'; c.fillText(fit(c, v, 236), x + 24, y + 108);
      c.font = `400 22px ${FONT}`; c.fillStyle = '#6f6e69'; c.fillText(fit(c, sub, 236), x + 24, y + 146);
    });
    c.font = `600 22px ${FONT}`; c.fillStyle = '#8b8a85'; c.fillText('ON THE AGENDA', 60, 462);
    const live = [...St.live].sort((a, b) => (a.status === 'working' ? 0 : 1) - (b.status === 'working' ? 0 : 1)).slice(0, 4);
    live.forEach((s, i) => {
      const y = 508 + i * 52, st = statusOf(s);
      c.fillStyle = dash.colorHex(s.sessionId); c.beginPath(); c.arc(72, y - 9, 10, 0, Math.PI * 2); c.fill();
      c.font = `600 30px ${FONT}`; c.fillStyle = '#e6e5df'; c.fillText(fit(c, titleOf(s), 760), 100, y);
      c.textAlign = 'right'; c.font = `600 24px ${FONT}`; c.fillStyle = st.color; c.fillText(fit(c, st.text, 300), W - 60, y); c.textAlign = 'left';
    });
    if (!live.length) { c.font = `400 30px ${FONT}`; c.fillStyle = '#6f6e69'; c.fillText('Nobody’s in yet', 60, 508); }
    scr.tex.needsUpdate = true;
  }
  ctx.onFrame(() => {
    const St = ctx.state, m = Math.floor(Date.now() / 60000);
    if (!St || (St === shown && m === minute)) return;
    shown = St; minute = m;
    paint(St);
  }, 125);
  ctx.minimap((c, sx, sz) => {   // the area, under everything solid
    c.fillStyle = 'rgba(63,74,107,.35)'; c.fillRect(sx(CX - 3.7), sz(1.4), sx(CX + 3.7) - sx(CX - 3.7), sz(SZ + 0.3) - sz(1.4));
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText('All hands', sx(CX - 1.6), sz(1.1));
  }, 5);

  // Idle sessions walk up the nearer aisle and along in front of their row (or the front row, for a beanbag), then sit.
  for (const s of spots) {
    const lane = s.row < 0 ? 4.2 : s.z + 0.45, ax = AISLES[s.x < CX ? 0 : 1];
    s.route = [{ x: ax, z: AISLE }, { x: ax, z: lane }, { x: s.x, z: lane }];
  }
  Object.assign(ctx, { allHands: { spots, screen: scr, CX } });
}
