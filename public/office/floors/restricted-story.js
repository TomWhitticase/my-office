// What happened down here (floors/restricted.js): R. Hale from Facilities came down on work order #1408 (the lighting
// fault: the tubes won't switch off), "back in 20". Found in order, one at a time, further and further from the lift:
// the work order; Hale's desk, the coffee still warm; Hale's badge on the carpet; a tally of sleeps; a tape; notes getting
// more frantic (the lift's chime comes from where the lift isn't; follow the hum instead); a door with the lift arriving
// behind it; Hale's last note, to you by name: Hale left the code upstairs on purpose, so someone would come down. Last,
// if you stay long enough, your own name on a wall. Between them, rarer the longer you're down here: a phone ringing in a
// far room that stops as you get near, and wet footprints that aren't yours; and whatever it is that keeps its distance
// (restricted-creature.js). Each beat is placed once a visit, ahead of you in rooms already built, seeded by
// the visit; what you've found before comes round sooner next time. Notes, the badge and the tape can be picked up.

import * as THREE from 'three';
import { dash, FONT, makeCanvas, MARKER, rng } from '../util.js';
import { MONO } from '../painters.js';

const VISITS = 'officeRestrictedVisits', FOUND = 'officeRestrictedStory';
// at: metres walked this visit before it's placed; wall: on a wall (else on the floor); read: pick it up to read it.
const BEATS = [
  { id: 'order', at: 40, wall: true, read: true },
  { id: 'desk', at: 95, wall: true },
  { id: 'badge', at: 150, read: true },
  { id: 'tally', at: 215, wall: true, read: true },
  { id: 'tape', at: 280, read: true },
  { id: 'frantic', at: 345, wall: true, read: true },
  { id: 'chimedoor', at: 410, wall: true },
  { id: 'last', at: 480, wall: true, read: true },
  { id: 'name', at: 540, wall: true, after: 300 },   // and five minutes down here
];

export function installStory(ctx, restr, sound) {
  const { camera, hud, style, hitBox } = ctx;
  const { C, H, T, X, Z, edgeType, SOLID, cellOk, h3 } = restr.grid;
  const owner = () => String(dash.config?.owner || 'You').slice(0, 24);
  const st = { visit: 0, R: rng(1), walked: 0, t: 0, idx: 0, best: 0, items: [], last: null, prints: null,
    phone: null, rings: 0, ringAt: 0, printsSeen: false };
  const story = { cols: () => st.items.flatMap((it) => it.cols), hits: () => st.items.flatMap((it) => it.hits), st };

  // ----- papers: drawn once each, the same canvas on the wall and in your hands -----
  const scrawl = (c, lines, x, y, size, lh, R, color = '#2a2418') => {
    c.fillStyle = color;
    lines.forEach((l, k) => {
      c.save(); c.translate(x + (R() - 0.5) * 6, y + k * lh); c.rotate((R() - 0.5) * 0.05);
      c.font = `${l.startsWith('!') ? 700 : 400} ${size * (l.startsWith('!') ? 1.25 : 1)}px ${MARKER}`; c.fillText(l.replace(/^!/, ''), 0, 0); c.restore();
    });
  };
  function paper(w, h, seed, draw, tint = '#efe8d2') {
    const cv = makeCanvas(w, h), c = cv.ctx, R = rng(seed);
    c.fillStyle = tint; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(120,100,60,${R() * 0.05})`; c.fillRect(R() * w, R() * h, 2, 2); }
    for (let k = 0; k < 3; k++) {   // damp
      const gx = R() * w, gy = R() * h, rr = 40 + R() * w * 0.4, g = c.createRadialGradient(gx, gy, rr * 0.7, gx, gy, rr);
      g.addColorStop(0, 'rgba(160,130,60,.12)'); g.addColorStop(0.9, 'rgba(120,90,40,.22)'); g.addColorStop(1, 'rgba(120,90,40,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    draw(c, w, h, R);
    cv.tex.needsUpdate = true;
    return cv;
  }
  const PAPERS = {};
  const papers = () => {
    if (PAPERS.order) return PAPERS;
    PAPERS.order = paper(512, 724, 11, (c, w, h, R) => {
      c.fillStyle = '#d97757'; c.fillRect(36, 40, 8, 54);
      c.fillStyle = '#26282b'; c.font = `700 30px ${FONT}`; c.fillText('WORK ORDER', 58, 72);
      c.font = `400 17px ${FONT}`; c.fillText(dash.officeName() + ' · Facilities', 58, 96);
      c.strokeStyle = 'rgba(40,40,40,.5)'; c.lineWidth = 1;
      [['No.', '1408'], ['Location', 'B3 (sublevel 3)'], ['Fault', 'Lighting: tubes will not'], ['', 'switch off. Humming.'], ['Priority', 'Low'],
        ['Assigned', 'R. Hale'], ['Access', 'code as issued'], ['Status', 'OPEN']].forEach(([k, v], i) => {
        const y = 160 + i * 46; c.font = `600 15px ${MONO}`; c.fillStyle = '#555'; c.fillText(k.toUpperCase(), 40, y);
        c.font = `400 19px ${MONO}`; c.fillStyle = '#1d1d1d'; c.fillText(v, 170, y); c.beginPath(); c.moveTo(165, y + 10); c.lineTo(w - 40, y + 10); c.stroke();
      });
      scrawl(c, ['going down now.', 'back in 20. — R'], 60, 600, 34, 46, R, '#1d2c6e');
    });
    PAPERS.tally = paper(512, 724, 12, (c, w, h, R) => {
      c.strokeStyle = '#2a2418'; c.lineWidth = 4; c.lineCap = 'round';
      for (let g = 0; g < 7; g++) {   // 33: six fives and three
        const gx = 50 + (g % 4) * 108, gy = 70 + Math.floor(g / 4) * 110, n = g === 6 ? 3 : 5;
        for (let k = 0; k < Math.min(4, n); k++) { c.beginPath(); c.moveTo(gx + k * 18 + (R() - 0.5) * 4, gy); c.lineTo(gx + k * 18 + (R() - 0.5) * 6, gy + 70); c.stroke(); }
        if (n === 5) { c.beginPath(); c.moveTo(gx - 8, gy + 58); c.lineTo(gx + 70, gy + 10); c.stroke(); }
      }
      scrawl(c, ['the lights don’t go off', 'so I count sleeps', '', 'the lift came once.', 'I wasn’t there.', '', 'it’s chimed twice since.', '!not from the lift.'],
        44, 330, 30, 44, R);
    });
    PAPERS.last = paper(512, 724, 13, (c, w, h, R) => {
      scrawl(c, [`${owner()} —`, '', 'I left the code where', 'you’d find it. I’m sorry.', 'somebody had to come down', 'for the lift to come down.', '',
        'go back while it still', 'answers. don’t wait', 'for me.', '', '— R'], 40, 70, 31, 50, R, '#1d2c6e');
    });
    PAPERS.frantic = [['SAME ROOM.', '!SAME ROOM'], ['a STONE door', 'it doesn’t', 'belong. stairs', '!every way up'], ['the EXIT signs', 'point at', 'each other'],
      ['don’t follow', '!the chime'], ['follow the HUM', 'the hum is', 'the real lift'], ['it’s in the', '!CEILING', 'don’t look away']].map((lines, k) =>
      paper(256, 256, 20 + k, (c, w, h, R) => scrawl(c, lines, 18, 70, 30, 48, R, k === 3 ? '#7a1a12' : '#2a2418'), k % 2 ? '#f3dd6c' : '#efe8d2'));
    PAPERS.scrawl = paper(1024, 256, 30, (c, w, h, R) => { c.clearRect(0, 0, w, h); scrawl(c, ['!IT LEARNED THE CHIME'], 30, 160, 80, 0, R, 'rgba(70,40,18,.82)'); }, 'rgba(0,0,0,0)');
    PAPERS.name = paper(1024, 400, 31, (c, w, h, R) => {
      c.clearRect(0, 0, w, h);
      scrawl(c, [`!${owner().toUpperCase()}`], 40, 190, 120, 0, R, 'rgba(60,34,14,.85)');
      scrawl(c, ['WAS HERE'], 120, 320, 70, 0, R, 'rgba(60,34,14,.75)');
    }, 'rgba(0,0,0,0)');
    PAPERS.badge = paper(320, 512, 32, (c, w) => {
      c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, w, 512);
      c.fillStyle = '#26282b'; c.fillRect(0, 0, w, 110); c.fillStyle = '#d97757'; c.fillRect(24, 26, 7, 58);
      c.fillStyle = '#f2efe8'; c.font = `600 22px ${FONT}`; c.fillText(dash.officeName(), 44, 52); c.font = `400 16px ${FONT}`; c.fillText('STAFF · ALL FLOORS', 44, 80);
      c.fillStyle = '#c9c2ad'; c.fillRect(85, 140, 150, 180);   // the photo: just a stain where a face was
      const g = c.createRadialGradient(160, 220, 10, 160, 230, 90); g.addColorStop(0, 'rgba(110,84,40,.6)'); g.addColorStop(1, 'rgba(110,84,40,0)');
      c.fillStyle = g; c.fillRect(85, 140, 150, 180);
      c.fillStyle = '#1d1d1d'; c.textAlign = 'center'; c.font = `700 34px ${FONT}`; c.fillText('R. HALE', w / 2, 375);
      c.font = `500 18px ${FONT}`; c.fillStyle = '#555'; c.fillText('FACILITIES', w / 2, 405); c.font = `400 14px ${MONO}`; c.fillText('ID 0418', w / 2, 440);
      c.textAlign = 'left';
    });
    return PAPERS;
  };

  // ----- the things -----
  const part = (g, w, h, d, x, y, z, color, o = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }));
    m.position.set(x, y, z); g.add(m); return m;
  };
  const sheet = (g, cv, w, h, x, y, z, ry = 0, rz = 0, transparent = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: cv.tex, roughness: 0.95, transparent, depthWrite: !transparent,
      polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(0, ry, rz); g.add(m); return m;
  };
  // Each builds into g, in a frame where the wall (if any) is at z = 0 facing +z and the floor at y = 0.
  const BUILD = {
    order(g) { sheet(g, papers().order, 0.21, 0.297, 0, 1.45, 0.012, 0, 0.03); part(g, 0.06, 0.02, 0.002, -0.02, 1.6, 0.014, '#e8e2c8', { transparent: true, opacity: 0.7 }); },
    tally(g) { sheet(g, papers().tally, 0.21, 0.297, 0, 1.3, 0.012, 0, -0.05); part(g, 0.06, 0.02, 0.002, 0.03, 1.44, 0.014, '#e8e2c8', { transparent: true, opacity: 0.7 }); },
    last(g) { sheet(g, papers().last, 0.21, 0.297, 0, 1.5, 0.012, 0, 0.02); },
    frantic(g) {
      papers().frantic.forEach((cv, k) => sheet(g, cv, 0.13, 0.13, -0.55 + k * 0.27 + Math.sin(k * 7) * 0.05, 1.2 + Math.sin(k * 3.3) * 0.25, 0.012, 0, Math.sin(k * 5) * 0.2));
      sheet(g, papers().scrawl, 1.8, 0.45, 0.1, 1.95, 0.008, 0, -0.04, true);
    },
    name(g) { sheet(g, papers().name, 2.3, 0.9, 0, 1.55, 0.008, 0, 0.02, true); },
    chimedoor(g) {
      part(g, 1.08, 2.18, 0.06, 0, 1.09, 0.03, '#d9d2b8'); part(g, 0.92, 2.1, 0.06, 0, 1.05, 0.05, '#6e5134');
      part(g, 0.05, 0.05, 0.06, 0.36, 1.0, 0.1, '#c9b98a', { metalness: 0.6, roughness: 0.4 });
      const sign = paper(256, 96, 33, (c) => { c.fillStyle = '#3b3e42'; c.fillRect(0, 0, 256, 96); c.fillStyle = '#e8e6e1'; c.font = `700 30px ${FONT}`; c.fillText('LIFT  B3', 40, 60); });
      sheet(g, sign, 0.3, 0.11, 0, 1.75, 0.082);
    },
    desk(g) {   // a desk out from the wall, its chair pushed back
      const W = 1.4, D = 0.7, z0 = 0.05 + D / 2;
      part(g, W, 0.035, D, 0, 0.74, z0, '#b8ad8e');
      for (const s of [-1, 1]) part(g, 0.03, 0.72, D - 0.06, s * (W / 2 - 0.03), 0.36, z0, '#6b6f75', { metalness: 0.5 });
      part(g, W - 0.08, 0.4, 0.02, 0, 0.5, 0.08, '#6b6f75', { metalness: 0.4 });
      part(g, 0.56, 0.34, 0.04, -0.1, 1.05, 0.2, '#1b1c1e'); part(g, 0.52, 0.3, 0.005, -0.1, 1.05, 0.223, '#050505', { roughness: 0.2 });
      part(g, 0.06, 0.14, 0.06, -0.1, 0.83, 0.2, '#1b1c1e'); part(g, 0.22, 0.012, 0.16, -0.1, 0.765, 0.2, '#1b1c1e');
      part(g, 0.44, 0.02, 0.15, -0.08, 0.77, 0.5, '#2a2b2e');
      const postit = paper(128, 128, 34, (c, w, h, R) => scrawl(c, ['back in 20', '— R'], 12, 52, 26, 40, R, '#1d2c6e'), '#f3dd6c');
      sheet(g, postit, 0.075, 0.075, 0.12, 1.15, 0.226, 0, -0.08);
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 18), new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.5 }));
      mug.position.set(0.42, 0.81, 0.45); g.add(mug);
      const cof = new THREE.Mesh(new THREE.CircleGeometry(0.037, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2b1a0e', roughness: 0.15 }));
      cof.position.set(0.42, 0.835, 0.45); g.add(cof);
      // the last of its warmth: a wisp or two over it
      const wisp = makeCanvas(64, 128), wc = wisp.ctx, gr = wc.createRadialGradient(32, 64, 2, 32, 64, 30);
      gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); wc.fillStyle = gr; wc.fillRect(0, 0, 64, 128); wisp.tex.needsUpdate = true;
      const steam = [0, 1, 2].map((k) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.14), new THREE.MeshBasicMaterial({ map: wisp.tex, transparent: true, opacity: 0, depthWrite: false }));
        m.position.set(0.42, 0.9, 0.45); m.userData.k = k; g.add(m); return m;
      });
      g.userData.steam = steam;
      const ch = new THREE.Group(); ch.position.set(0.25, 0, 1.05); ch.rotation.y = 0.5; g.add(ch);   // the chair
      part(ch, 0.48, 0.07, 0.46, 0, 0.47, 0, '#2f3033'); part(ch, 0.46, 0.55, 0.06, 0, 0.82, 0.22, '#2f3033'); part(ch, 0.05, 0.38, 0.05, 0, 0.25, 0, '#1c1c1e');
      part(ch, 0.6, 0.04, 0.06, 0, 0.05, 0, '#1c1c1e'); part(ch, 0.06, 0.04, 0.6, 0, 0.05, 0, '#1c1c1e');
      return [[-W / 2, W / 2, 0.05, 0.05 + D], [-0.05, 0.55, 0.75, 1.35]];
    },
    badge(g) {
      const m = sheet(g, papers().badge, 0.054, 0.086, 0, 0.004, 0, 0, 0); m.rotation.set(-Math.PI / 2, 0, 0.6);
      part(g, 0.012, 0.002, 0.35, 0.04, 0.003, -0.2, '#1f3b73').rotation.y = 0.9;   // the lanyard
      part(g, 0.012, 0.002, 0.3, -0.08, 0.003, -0.22, '#1f3b73').rotation.y = -0.4;
    },
    tape(g) {
      part(g, 0.26, 0.06, 0.16, 0, 0.03, 0, '#2b2c2e', { roughness: 0.5 }); part(g, 0.2, 0.004, 0.09, 0.0, 0.062, -0.02, '#4a4c50');
      for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 14), new THREE.MeshStandardMaterial({ color: '#d9d4c4' }));
        r.position.set(s * 0.045, 0.066, -0.02); g.add(r); }
      for (let k = 0; k < 4; k++) part(g, 0.035, 0.012, 0.03, -0.07 + k * 0.045, 0.066, 0.055, k === 1 ? '#7a1a12' : '#8c8f94');
      part(g, 0.006, 0.006, 0.004, 0.11, 0.05, 0.081, '#ff3b2b', { emissive: '#ff2010', emissiveIntensity: 0.6 });
    },
  };
  const INFO = {
    order: '<b>A work order</b><div class="k">Taped to the wall. Click to read it</div>',
    desk: '<b>A desk</b><div class="k">A dead monitor, a note on it. Half a cup of coffee, still slightly warm.</div>',
    badge: '<b>A staff badge</b><div class="k">Face down in the damp. Click to pick it up</div>',
    tally: '<b>A note</b><div class="k">Rows of marks. Click to read it</div>',
    tape: '<b>A tape recorder</b><div class="k">A tape still in it. Click to play it</div>',
    frantic: '<b>Notes</b><div class="k">Lots of them, in a hurry. Click to read them</div>',
    chimedoor: '<b>A door</b><div class="k">Locked. Behind it, a lift arrives. Nobody gets out.</div>',
    last: '<b>A note</b><div class="k">It has your name on it. Click to read it</div>',
    name: '<b>Your name</b><div class="k">It looks like your handwriting.</div>',
  };

  // ----- placing a beat: a cell 15-28 m off, ahead of you if there's one, in rooms already built -----
  const chunkLoaded = (i, j) => restr.chunks.has(`${Math.floor(i / restr.grid.CH)},${Math.floor(j / restr.grid.CH)}`);
  const sides = (i, j) => [['v', i, j, 0], ['v', i + 1, j, 1], ['h', i, j, 2], ['h', i, j + 1, 3]]
    .filter(([d, a, b]) => edgeType(d, a, b) === SOLID).map(([, , , k]) => k);
  function wallFrame(i, j, k) {   // the middle of side k of cell (i, j), facing into it
    const cx = X(i) + C / 2, cz = Z(j) + C / 2, o = T / 2;
    return [[X(i) + o, cz, Math.PI / 2], [X(i + 1) - o, cz, -Math.PI / 2], [cx, Z(j) + o, 0], [cx, Z(j + 1) - o, Math.PI]][k];
  }
  function place(n, x, z, dmin = 15, dmax = 28) {
    const beat = BEATS[n], fx = -Math.sin(ctx.player.yaw), fz = -Math.cos(ctx.player.yaw), i0 = Math.floor((x - X(0)) / C), j0 = Math.floor((z - Z(0)) / C);
    let best = null;
    for (let i = i0 - 9; i <= i0 + 9; i++) for (let j = j0 - 9; j <= j0 + 9; j++) {
      const cx = X(i) + C / 2, cz = Z(j) + C / 2, d = Math.hypot(cx - x, cz - z);
      if (d < dmin || d > dmax || !cellOk(i, j) || !chunkLoaded(i, j) || (j === 0 && i >= -3 && i <= -1) || h3(i, j, 10) < 0.03) continue;
      if (st.items.some((it) => it.i === i && it.j === j)) continue;
      if (restr.paths && i === restr.paths.home.i && j === restr.paths.home.j) continue;   // the stone door's (relativity-door.js)
      if (restr.reserved?.has(`${i},${j}`)) continue;   // the painting's wall (plain.js), the bookcase's (grid-door.js)
      const ws = beat.wall ? sides(i, j) : [0];
      if (!ws.length) continue;
      const ahead = ((cx - x) * fx + (cz - z) * fz) / d > 0.3 ? 0 : 1, score = ahead + h3(st.visit, n * 977 + i, j);
      if (!best || score < best.score) best = { i, j, k: ws[Math.floor(h3(st.visit, i, j) * ws.length)], score };
    }
    if (!best) return false;
    const { i, j, k } = best, g = new THREE.Group();
    const [px, pz, yaw] = beat.wall ? wallFrame(i, j, k) : [X(i) + C / 2 + (h3(i, j, 70) - 0.5), Z(j) + C / 2 + (h3(i, j, 71) - 0.5), h3(i, j, 72) * 6.28];
    g.position.set(px, 0, pz); g.rotation.y = yaw;
    const rects = BUILD[beat.id](g) || [];
    restr.root.add(g);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3(), cols = [];
    for (const [x0, x1, z0, z1] of rects) {   // the frame's rects turned into the floor's space
      box.makeEmpty();
      for (const [a, b] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box.expandByPoint(new THREE.Vector3(a, 0, b).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(px, 0, pz)));
      cols.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
    }
    const hb = beat.wall ? [beat.id === 'name' || beat.id === 'frantic' ? 2.4 : 1.2, 2, 0.3, 0, 1.2, 0.15] : [0.5, 0.25, 0.5, 0, 0.1, 0];
    // keyAt: hover.js hands it back as h.key, so a click knows which beat it was
    const hit = hitBox(g, hb[0], hb[1], hb[2], hb[3], hb[4], hb[5], { action: 'restrictedfind', reach: 3.2, info: INFO[beat.id], keyAt: () => beat.id });
    st.items.push({ beat, n, g, i, j, cols, hits: [hit], at: { x: px, z: pz }, found: false });
    restr.sync();
    return true;
  }
  function remove(it) {
    restr.root.remove(it.g);
    const keep = new Set(Object.values(PAPERS).flat().map((p) => p.tex));   // the papers are drawn once; the hit box's material is shared
    it.g.traverse((o) => { if (o.userData.action) return; o.geometry?.dispose(); if (o.material?.map && !keep.has(o.material.map)) o.material.map.dispose(); o.material?.dispose(); });
    st.items.splice(st.items.indexOf(it), 1);
  }
  function found(it) {
    if (it.found) return;
    it.found = true;
    st.idx = Math.max(st.idx, it.n + 1);
    if (st.idx > st.best) { st.best = st.idx; try { localStorage[FOUND] = String(st.best); } catch {} }
  }

  // ----- the rare events -----
  const ahead = (x, z, max) => {   // clear metres from (x, z) along where you're looking (the floor's own space)
    const fx = -Math.sin(ctx.player.yaw), fz = -Math.cos(ctx.player.yaw), z0 = restr.z0;
    for (let d = 0.5; d < max; d += 0.5) {
      const px = x + fx * d, pz = z + fz * d + z0;
      if (restr.colliders.some((b) => px > b.minX - 0.2 && px < b.maxX + 0.2 && pz > b.minZ - 0.2 && pz < b.maxZ + 0.2)) return d - 0.5;
    }
    return max;
  };
  let printTex = null;
  function footprints(x, z, len) {   // wet prints leading off ahead of you, and stopping
    if (!printTex) {
      const cv = makeCanvas(64, 160), c = cv.ctx; c.filter = 'blur(3px)'; c.fillStyle = 'rgba(40,28,10,.75)';
      c.beginPath(); c.ellipse(32, 52, 20, 40, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(32, 124, 15, 22, 0, 0, Math.PI * 2); c.fill();
      cv.tex.needsUpdate = true; printTex = cv.tex;
    }
    const yaw = ctx.player.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), geos = [];
    for (let d = 2.5, k = 0; d < len; d += 0.68, k++) {
      const s = k % 2 ? 1 : -1, wob = Math.sin(k * 1.7) * 0.05;
      geos.push(new THREE.PlaneGeometry(0.11, 0.28).rotateX(-Math.PI / 2).rotateY(yaw + wob).translate(x + fx * d - fz * s * 0.11, 0.006, z + fz * d + fx * s * 0.11));
    }
    const m = new THREE.Mesh(mergeAll(geos), new THREE.MeshBasicMaterial({ map: printTex, transparent: true, depthWrite: false, opacity: 0.8, fog: true }));
    restr.root.add(m);
    st.prints = { m, x, z };
  }
  const mergeAll = (geos) => {   // planes of the same layout, into one
    const pos = [], uv = [], idx = [];
    for (const g of geos) { const n = pos.length / 3; pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); idx.push(...[...g.index.array].map((v) => v + n)); g.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  };

  // ----- each frame (x, z: you, in the floor's own space) -----
  story.enter = () => {
    let v = 0, b = 0;
    try { v = (+localStorage[VISITS] || 0) + 1; localStorage[VISITS] = String(v); b = +localStorage[FOUND] || 0; } catch {}
    Object.assign(st, { visit: v, R: rng(v * 7919 + 13), walked: 0, t: 0, idx: 0, best: b, last: null, rings: 0, printsSeen: false });
    st.ringAt = 90 + st.R() * 90;
  };
  story.leave = () => {
    for (const it of [...st.items]) remove(it);
    if (st.prints) { restr.root.remove(st.prints.m); st.prints.m.geometry.dispose(); st.prints = null; }
    st.phone?.h?.stop(); st.phone = null;
    reader.close();
  };
  story.fx = (dt, t, x, z, riding) => {
    st.t += dt;
    const p = camera.position, step = st.last ? Math.hypot(p.x - st.last.x, p.z - st.last.z) : 0;
    st.last = { x: p.x, z: p.z };
    if (step < 1 && ctx.mode === 'free' && !riding) st.walked += step;
    // what's been built round you can go again with its rooms (found or not: an unfound one comes round again)
    for (const it of [...st.items]) if (!chunkLoaded(it.i, it.j)) { remove(it); restr.sync(); }
    // the next beat, once you've walked far enough (sooner if you've found it before)
    const n = st.idx, beat = BEATS[n];
    if (beat && !st.items.some((it) => it.n === n) && st.walked >= beat.at * (n < st.best ? 0.6 : 1) && st.t >= (beat.after || 0)) place(n, x, z);
    const fx = -Math.sin(ctx.player.yaw), fz = -Math.cos(ctx.player.yaw);
    for (const it of st.items) {
      const dx = it.at.x - x, dz = it.at.z - z, d = Math.hypot(dx, dz), facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (!it.found && d < (it.beat.id === 'name' ? 6 : 2.6) && facing > 0.5) found(it);
      if (it.beat.id === 'chimedoor' && d < 14 && t > (it.chimeAt ??= t + 2)) { sound.chimeBehind(it.at.x, it.at.z); it.chimeAt = t + 9 + st.R() * 8; }
      for (const s of it.g.userData.steam || []) {
        const k = ((t * 0.35 + s.userData.k / 3) % 1);
        s.position.y = 0.88 + k * 0.22; s.material.opacity = 0.16 * Math.sin(Math.PI * k) * (d < 6 ? 1 : 0); s.rotation.y = Math.atan2(x - it.at.x, z - it.at.z) - it.g.rotation.y;
      }
    }
    if (riding) return;
    // a phone, far off: it stops when you get near (or when it gives up)
    if (st.phone) {
      const d = Math.hypot(st.phone.x - x, st.phone.z - z);
      if (d < 10 || st.t > st.phone.until) { st.phone.h?.stop(); st.phone = null; st.ringAt = st.t + 100 + st.R() * 120; }
    } else if (st.walked > 130 && st.rings < 3 && st.t > st.ringAt) {
      const far = [...restr.chunks.values()].flatMap((c) => c.phones).find((q) => { const d = Math.hypot(q.x - x, q.z - z); return d > 20 && d < 40; });
      const a = st.R() * Math.PI * 2, at = far || { x: x + Math.cos(a) * 30, z: z + Math.sin(a) * 30 };
      st.phone = { ...at, until: st.t + 30, h: sound.ring(at.x, at.z) };
      st.rings++;
    }
    // wet footprints that aren't yours, once, after the badge
    if (!st.printsSeen && st.idx >= 3 && st.t % 2 < dt) { const clear = ahead(x, z, 14); if (clear > 8) { footprints(x, z, clear); st.printsSeen = true; } }
    if (st.prints && Math.hypot(st.prints.x - x, st.prints.z - z) > 40) { restr.root.remove(st.prints.m); st.prints.m.geometry.dispose(); st.prints = null; }
  };

  // ----- picking things up: the paper (or the badge, or the tape playing) close up -----
  style.textContent += `
    .of-hud .of-find { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; pointer-events: auto; background: radial-gradient(rgba(20,16,6,.25), rgba(10,8,2,.75)); }
    .of-hud .of-find.on { display: flex !important; }
    .of-find img { max-height: min(78vh, 760px); max-width: 86vw; box-shadow: 0 30px 80px rgba(0,0,0,.6); transform: rotate(-1.2deg); animation: of-find-in .25s ease-out; }
    .of-find .notes { display: grid; grid-template-columns: repeat(3, minmax(0, 220px)); gap: 18px; }
    .of-find .notes img { width: 100%; transform: rotate(var(--r)); }
    .of-find .badge { height: min(56vh, 520px); border-radius: 14px; }
    .of-find .k { position: absolute; bottom: 26px; left: 0; right: 0; text-align: center; color: #d9cfa8; font: 13px ${FONT}; opacity: .8; }
    .of-find .rec { width: 360px; padding: 26px; border-radius: 12px; background: linear-gradient(#36373a, #232426); color: #d9d4c4; font: 12px ${MONO}; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
    .of-find .rec .win { display: flex; justify-content: space-around; background: #111; border-radius: 6px; padding: 16px; }
    .of-find .rec .win i { width: 54px; height: 54px; border-radius: 50%; border: 6px dashed #d9d4c4; animation: of-reel 2.4s linear infinite; animation-play-state: var(--play, paused); }
    .of-find .rec .lab { margin-top: 14px; padding: 8px 12px; background: #efe8d2; color: #1d2c6e; font: 20px ${MARKER}; transform: rotate(-1deg); }
    .of-find .rec .led { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #551510; margin-right: 6px; } .of-find .rec.on .led { background: #ff3b2b; box-shadow: 0 0 8px #ff3b2b; }
    @keyframes of-reel { to { transform: rotate(360deg); } }
    @keyframes of-find-in { from { transform: scale(.94) rotate(-3deg); opacity: 0; } }
  `;
  const reader = (() => {
    const el = document.createElement('div'); el.className = 'of-find'; hud.appendChild(el);
    let timer = 0;
    const url = (cv) => cv.canvas.toDataURL();
    function open(id) {
      if (document.pointerLockElement) document.exitPointerLock();
      ctx.mode = 'reading'; ctx.keys.clear();
      const P = papers(), hint = '<div class="k">Click or Esc to put it back</div>';
      if (id === 'frantic') el.innerHTML = `<div class="notes">${P.frantic.map((cv, k) => `<img src="${url(cv)}" style="--r:${Math.sin(k * 5) * 6}deg">`).join('')}</div>${hint}`;
      else if (id === 'badge') el.innerHTML = `<img class="badge" src="${url(P.badge)}">${hint}`;
      else if (id === 'tape') {
        el.innerHTML = `<div class="rec"><div class="win"><i></i><i></i></div><div class="lab">TAPE 3 · for whoever’s next</div><p><span class="led"></span><span class="st">PLAY</span></p></div>${hint}`;
        const d = sound.tape(st.items.find((it) => it.beat.id === 'tape')?.at.x ?? 0, st.items.find((it) => it.beat.id === 'tape')?.at.z ?? 0);
        const rec = el.querySelector('.rec'); rec.classList.add('on'); rec.style.setProperty('--play', 'running');
        clearTimeout(timer);
        timer = setTimeout(() => { rec.classList.remove('on'); rec.style.setProperty('--play', 'paused'); el.querySelector('.st').textContent = 'STOP · the voice was too slow to follow. Near the end, two syllables, three times, like a name.'; },
          (d || 4) * 1000);
      } else el.innerHTML = `<img src="${url(P[id])}">${hint}`;
      el.classList.add('on');
    }
    function close() {
      clearTimeout(timer);
      if (!el.classList.contains('on')) return;
      el.classList.remove('on'); el.innerHTML = '';
      if (ctx.mode === 'reading') ctx.mode = 'free';
    }
    el.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (el.classList.contains('on') && e.key === 'Escape') { close(); e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    ctx.onFrame(() => { if (el.classList.contains('on') && ctx.mode !== 'reading') close(); }, 176);
    return { open, close, el };
  })();
  ctx.action('restrictedfind', {
    hover: (h) => h.info,
    click: (h) => {
      const it = st.items.find((x) => x.beat.id === h.key);
      if (!it) return;
      found(it);
      if (it.beat.read) reader.open(it.beat.id);
    },
  });
  // For the tests and for looking: put beat `id` in front of you now, or read it.
  story.force = (id) => {
    const n = BEATS.findIndex((b) => b.id === id), p = camera.position;
    st.idx = n; for (const it of st.items.filter((x) => x.n === n)) remove(it);
    return place(n, p.x, p.z - restr.z0, 2, 8);
  };
  story.read = (id) => reader.open(id);
  story.reader = reader;
  return story;
}
