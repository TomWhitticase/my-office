// The way into Relativity (floors/relativity.js) from the restricted level (floors/restricted.js): a door that doesn't
// fit. Set into the wallpaper, an arch of old dressed stone round a heavy oak door; cold daylight under it, and a few
// flagstones showing through the carpet in front. It turns up once a visit, after you've walked a while (sooner once
// you've been through), in a wall a little way ahead, seeded by the visit; it goes with its rooms, and comes round again
// further on. One of Hale's notes mentions it (restricted-story.js). Click it and it opens onto white, and you're there.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, rng } from '../util.js';

const W = 1.1, SPRING = 1.7;   // the opening (its crown and the keystone just clear B3's 2.75 m ceiling)

export function installDoor(ctx, rel) {
  const restr = ctx.restr, { C, T, X, Z, edgeType, SOLID, cellOk, h3, CH } = restr.grid;
  const st = { R: rng(1), goal: Infinity, at: null, open: 0, opening: false, tries: 0 };
  const random = Math.random;

  // ----- the door, made once (in a frame with the wall at z = 0 facing +z, the floor at y = 0) and moved where it's wanted -----
  const g = new THREE.Group();
  const R = rng(1408), stone = new THREE.MeshStandardMaterial({ color: '#cfc8b6', roughness: 0.9 });
  const blocks = [];
  const blk = (w, h, d, x, y, z, rz = 0) => blocks.push(new THREE.BoxGeometry(w, h, d).rotateZ(rz).translate(x, y, z));
  for (const s of [-1, 1]) for (let y = 0, i = 0; y < SPRING - 0.05; i++) {   // the jambs: blocks long and short in turn
    const h = 0.32 + R() * 0.12, w = i % 2 ? 0.34 : 0.48;
    blk(w, Math.min(h, SPRING - y) - 0.012, 0.16, s * (W / 2 + w / 2), y + Math.min(h, SPRING - y) / 2, 0.08);
    y += h;
  }
  const NV = 11, r0 = W / 2, r1 = W / 2 + 0.34, gap = 0.006;   // the voussoirs, wedges, the keystone proud of the rest
  for (let i = 0; i < NV; i++) {
    const a0 = Math.PI * i / NV + gap, a1 = Math.PI * (i + 1) / NV - gap, key = i === (NV - 1) / 2, r2 = r1 + (key ? 0.08 : 0), sh = new THREE.Shape();
    sh.moveTo(r0 * Math.cos(a0), r0 * Math.sin(a0)); sh.lineTo(r2 * Math.cos(a0), r2 * Math.sin(a0));
    sh.lineTo(r2 * Math.cos(a1), r2 * Math.sin(a1)); sh.lineTo(r0 * Math.cos(a1), r0 * Math.sin(a1)); sh.closePath();
    blocks.push(new THREE.ExtrudeGeometry(sh, { depth: key ? 0.2 : 0.16, bevelEnabled: false }).translate(0, SPRING, 0));
  }
  const surround = new THREE.Mesh(mergeGeometries(blocks.map((b) => { const n = b.index ? b.toNonIndexed() : b; n.deleteAttribute('uv'); return n; })), stone);
  g.add(surround);
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(W, 0); shape.lineTo(W, SPRING); shape.absarc(W / 2, SPRING, W / 2, 0, Math.PI, false); shape.closePath();
  const glow = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12).translate(-W / 2, 0, 0.012),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.1), fog: false }));
  g.add(glow);
  const hinge = new THREE.Group(); hinge.position.set(-W / 2, 0, 0.05); g.add(hinge);
  const oak = new THREE.MeshStandardMaterial({ color: '#5a4634', roughness: 0.8 }), iron = new THREE.MeshStandardMaterial({ color: '#2e2b28', roughness: 0.5, metalness: 0.6 });
  const leaf = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -0.035), oak);
  hinge.add(leaf);
  for (const y of [0.35, 1.25, SPRING - 0.1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(W * 0.85, 0.06, 0.02), iron); b.position.set(W * 0.45, y, 0.045); hinge.add(b); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), iron); ring.position.set(W - 0.2, 1.0, 0.05); hinge.add(ring);
  // daylight under it, and on the carpet; the old flags showing through
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, 0.014), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.3) }));
  strip.position.set(0, 0.008, 0.088); g.add(strip);
  const pool = makeCanvas(128, 128), pc = pool.ctx, pg = pc.createRadialGradient(64, 20, 4, 64, 30, 80);
  pg.addColorStop(0, 'rgba(235,240,245,.55)'); pg.addColorStop(1, 'rgba(235,240,245,0)'); pc.fillStyle = pg; pc.fillRect(0, 0, 128, 128); pool.tex.needsUpdate = true;
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: pool.tex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }));
  spill.position.set(0, 0.006, 0.75); g.add(spill);
  const flags = makeCanvas(256, 192), fc = flags.ctx;
  for (let y = 0; y < 192; y += 48) for (let x = (y / 48) % 2 ? -32 : 0; x < 256; x += 64) {
    fc.fillStyle = `rgb(${150 + R() * 30},${145 + R() * 25},${132 + R() * 20})`; fc.fillRect(x + 2, y + 2, 60, 44);
  }
  const fade = fc.createRadialGradient(128, 30, 20, 128, 60, 150);   // only near the wall, worn into the carpet's edge
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  fc.globalCompositeOperation = 'destination-in'; fc.fillStyle = fade; fc.fillRect(0, 0, 256, 192); flags.tex.needsUpdate = true;
  const floorFlags = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: flags.tex, transparent: true, depthWrite: false,
    roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
  floorFlags.position.set(0, 0.004, 0.85); g.add(floorFlags);
  const hit = ctx.hitBox(g, W + 0.3, SPRING + W / 2 + 0.2, 0.3, 0, (SPRING + W / 2) / 2, 0.15, { action: 'reldoor', reach: 3 });
  g.visible = false;

  // ----- placing it: a solid wall 12-24 m off, ahead of you if there's one, in rooms already built -----
  const loaded = (i, j) => restr.chunks.has(`${Math.floor(i / CH)},${Math.floor(j / CH)}`);
  const sides = (i, j) => [['v', i, j, 0], ['v', i + 1, j, 1], ['h', i, j, 2], ['h', i, j + 1, 3]].filter(([d, a, b]) => edgeType(d, a, b) === SOLID).map(([, , , k]) => k);
  function frame(i, j, k) {
    const cx = X(i) + C / 2, cz = Z(j) + C / 2, o = T / 2;
    return [[X(i) + o, cz, Math.PI / 2], [X(i + 1) - o, cz, -Math.PI / 2], [cx, Z(j) + o, 0], [cx, Z(j + 1) - o, Math.PI]][k];
  }
  function place(x, z, dmin, dmax) {
    const fx = -Math.sin(ctx.player.yaw), fz = -Math.cos(ctx.player.yaw), i0 = Math.floor((x - X(0)) / C), j0 = Math.floor((z - Z(0)) / C);
    const taken = new Set(restr.story.st.items.map((it) => `${it.i},${it.j}`));
    let best = null;
    for (let i = i0 - 9; i <= i0 + 9; i++) for (let j = j0 - 9; j <= j0 + 9; j++) {
      const cx = X(i) + C / 2, cz = Z(j) + C / 2, d = Math.hypot(cx - x, cz - z);
      if (d < dmin || d > dmax || !cellOk(i, j) || !loaded(i, j) || (j === 0 && i >= -3 && i <= -1) || h3(i, j, 10) < 0.03 || taken.has(`${i},${j}`)) continue;
      const ws = sides(i, j);
      if (!ws.length) continue;
      const score = (((cx - x) * fx + (cz - z) * fz) / d > 0.3 ? 0 : 1) + h3(st.visit, i * 31 + 5, j);
      if (!best || score < best.score) best = { i, j, k: ws[Math.floor(h3(st.visit, i, j * 7) * ws.length)], score };
    }
    if (!best) return false;
    const [px, pz, yaw] = frame(best.i, best.j, best.k);
    g.position.set(px, 0, pz); g.rotation.y = yaw; g.visible = true;
    if (!g.parent) restr.root.add(g);
    g.updateMatrixWorld(true);
    const c = Math.cos(yaw), s = Math.sin(yaw), ex = Math.abs(c) * (W / 2 + 0.6) + Math.abs(s) * 0.12, ez = Math.abs(s) * (W / 2 + 0.6) + Math.abs(c) * 0.12;
    const mx = px + s * 0.1, mz = pz + c * 0.1;
    st.at = { i: best.i, j: best.j, x: px, z: pz, cols: [{ minX: mx - ex, maxX: mx + ex, minZ: mz - ez, maxZ: mz + ez }] };
    st.open = 0; hinge.rotation.y = 0;
    restr.sync();
    return true;
  }
  function remove() {
    if (!st.at) return;
    st.at = null; g.visible = false;
    if (g.parent) g.parent.remove(g);
    restr.sync();
  }
  restr.extras.push({ cols: () => st.at?.cols || [], hits: () => (st.at ? [hit] : []) });

  // ----- with the restricted level's own enter, leave and frame -----
  const been = () => { try { return +localStorage.officeRelativity > 0; } catch { return false; } };
  const enter0 = restr.enter, leave0 = restr.leave, fx0 = restr.fx;
  restr.enter = (z) => {
    enter0(z);
    st.visit = restr.story.st.visit; st.R = rng(st.visit * 131 + 9);
    st.goal = (been() ? 60 : 140) + st.R() * 70; st.tries = 0; st.opening = false;
    remove();
  };
  restr.leave = () => { leave0(); remove(); st.opening = false; };
  restr.fx = (dt, t) => {
    fx0(dt, t);
    const p = ctx.camera.position, x = p.x, z = p.z - restr.z0;
    if (st.at && !loaded(st.at.i, st.at.j)) { remove(); st.goal = restr.story.st.walked + 30; }   // gone with its rooms: further on
    if (!st.at && restr.story.st.walked >= st.goal && t > st.tries) {
      st.tries = t + 0.5;
      Math.random = rng(st.visit * 7 + 3);
      try { place(x, z, 12, 24); } finally { Math.random = random; }
    }
    if (st.opening) {
      st.open = Math.min(1, st.open + dt / 0.9);
      hinge.rotation.y = -1.25 * st.open * st.open;
    }
  };
  ctx.action('reldoor', {
    hover: () => (been() ? '<b>The stone door</b><div class="k">Still here. Cold daylight under it. Click to go through</div>'
      : '<b>A door</b><div class="k">Old stone round it, older than the building. Cold air under it, and daylight. Click to open it</div>'),
    click: () => {
      if (st.opening) return;
      st.opening = true;
      rel.audio.door();
      setTimeout(() => rel.go(), 500);
    },
  });
  // For the tests and for looking: the door, now, in a wall just ahead.
  rel.door = { force: () => { const p = ctx.camera.position; return place(p.x, p.z - restr.z0, 2, 9); }, st, g };
}
