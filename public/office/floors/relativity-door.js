// The way into Relativity (floors/relativity.js) from the restricted level (floors/restricted.js): a door that doesn't
// fit. Set into the wallpaper, an arch of old dressed stone round a heavy oak door; cold daylight under it, and a few
// flagstones showing through the carpet in front. It turns up once a visit, after you've walked a while (sooner once
// you've been through), in a wall a little way ahead, seeded by the visit; it goes with its rooms, and comes round again
// further on. One of Hale's notes mentions it (restricted-story.js).
// Open it and it's seamless (systems/portal.js): the hall's there through it, live, in its own light, and you walk
// through; from inside, the doors you came in by show B3 back through them (each, in its own gravity), and walking out
// through one puts you back in front of this door. The doorways are the same size to the centimetre. Near the threshold
// the two floors' exposure, bloom and grade meet halfway, the hall's engraving fades out, and each side's sound carries
// through the other's (bleed), so nothing jumps as you cross.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, EYE, lerp, makeCanvas, rng, sstep } from '../util.js';
import { makePortal } from '../systems/portal.js';
import { DOOR } from './relativity-arch.js';
import { frameM, frameQ, toLocal } from './relativity-gravity.js';

const W = DOOR.w, SPRING = DOOR.s, H = SPRING + W / 2;   // the opening (its crown and the keystone just clear B3's 2.75 m ceiling)
const PO = 0.01;   // B3's side of the doorway: a centimetre proud of the wallpaper it's drawn over

export function installDoor(ctx, rel) {
  const restr = ctx.restr, { C, T, X, Z, edgeType, SOLID, cellOk, h3, CH } = restr.grid;
  const st = { R: rng(1), goal: Infinity, at: null, open: 0, want: 0, tries: 0, crossing: false };
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
    st.open = st.want = 0; hinge.rotation.y = 0;
    restr.sync();
    return true;
  }
  function remove() {
    if (!st.at) return;
    st.at = null; g.visible = false;
    if (g.parent) g.parent.remove(g);
    restr.sync();
  }
  // Shut, the doorway's a block; open, the jambs, the leaf swung back against them, and a way through the wall behind.
  function local(x0, x1, z0, z1) {   // a rectangle in the door's frame (wall face z = 0, the room +z) as a box on the floor
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y), xs = [], zs = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { xs.push(g.position.x + x * c + z * s); zs.push(g.position.z - x * s + z * c); }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }
  const open = () => st.open > 0.5;
  restr.extras.push({
    cols: () => (!st.at ? [] : !open() ? st.at.cols
      : [local(-W / 2 - 0.6, -W / 2, -0.02, 0.22), local(W / 2, W / 2 + 0.6, -0.02, 0.22), local(-W / 2 - 0.1, -W / 2, 0.05, W)]),
    hits: () => (st.at ? [hit] : []),
    cut(list) {   // the wall's boxes either side of the doorway, not across it
      if (!st.at || !open()) return;
      const gap = local(-W / 2, W / 2, -T - 0.05, 0.05), alongX = Math.abs(Math.cos(g.rotation.y)) > 0.5;
      gap.minZ += restr.z0; gap.maxZ += restr.z0;
      const [lo, hi, a, b2] = alongX ? ['minX', 'maxX', 'minZ', 'maxZ'] : ['minZ', 'maxZ', 'minX', 'maxX'];
      for (let k = list.length - 1; k >= 0; k--) {
        const b = list[k];
        if (b[hi] <= gap[lo] || b[lo] >= gap[hi] || b[b2] <= gap[a] || b[a] >= gap[b2]) continue;
        list.splice(k, 1);
        if (b[lo] < gap[lo]) list.push({ ...b, [hi]: gap[lo] });
        if (b[hi] > gap[hi]) list.push({ ...b, [lo]: gap[hi] });
      }
    },
  });

  // ----- the two sides of it: frames, portals -----
  // A doorway's frame: its sill's middle, +y up, +z through it the way you'd walk from the side it's seen from (portal.js).
  // B3's: this door, seen from the room (in) or come out of (out). Relativity's: each way out, seen from the hall (ex) or
  // come in by (exIn), in its own gravity's frame.
  const flip = new THREE.Matrix4().makeRotationY(Math.PI), exits = rel.exits;
  const F = { b3: new THREE.Matrix4(), b3Out: new THREE.Matrix4(),
    ex: exits.map((d) => frameM(d.k).multiply(new THREE.Matrix4().makeTranslation(...d.sill))) };
  F.exIn = F.ex.map((m) => m.clone().multiply(flip));
  const frames = () => { g.updateMatrixWorld(true); F.b3Out.copy(g.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0, 0, PO)); F.b3.copy(F.b3Out).multiply(flip); };
  // The portals' panes: the arch's own shape (portal.js's box would show in the corners over the springing), and open at the
  // end toward you: just through it, looking back into the floor you've come to, there's nothing of the pane in front of you.
  const archG = (() => {
    const e = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 16 }).translate(-W / 2, 0, -1).toNonIndexed();
    const a = e.attributes.position.array, keep = [];
    for (let i = 0; i < a.length; i += 9) if (!(a[i + 2] < -0.999 && a[i + 5] < -0.999 && a[i + 8] < -0.999)) keep.push(...a.subarray(i, i + 9));
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  })();
  const portal = (sc) => { const p = makePortal(ctx, { w: W, h: H }); p.mesh.geometry.dispose(); p.mesh.geometry = archG; sc.add(p.mesh); return p; };
  const inP = portal(restr.scene), outPs = exits.map(() => portal(rel.scene));
  rel.look.aoSkip1 = true;   // (no ambient occlusion over the panes)

  // Lit as it's lit from inside, for a look through: its look in full (renderFloor isn't drawing it).
  const lit = (F2) => {
    const L = F2.look;
    if (F2.hemi) { F2.hemi.intensity = L.hemi; F2.hemi.color.copy(L.sky); F2.hemi.groundColor.copy(L.ground); }
    for (const [l, k] of L.lights) l.intensity = k;
    F2.scene.environmentIntensity = L.env;
  };
  // Where the two floors' looks meet: u, how close you are to an open doorway (1 in it), takes each halfway to the other's.
  const KEYS = ['exposure', 'bloom', 'grade'], base = { b3: {}, rel: {} };
  for (const k of KEYS) { base.b3[k] = restr.look[k]; base.rel[k] = rel.look[k]; }
  function blend(u) {
    for (const k of KEYS) { restr.look[k] = lerp(base.b3[k], base.rel[k], u / 2); rel.look[k] = lerp(base.rel[k], base.b3[k], u / 2); }
    rel.hatch.uniforms.amount.value = 1 - u;
  }

  // ----- going through -----
  const camera = ctx.camera, last = new THREE.Vector3(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');
  let lastAway = null;
  const carry = (here, there) => {   // your camera, carried from one doorway's frame to the other's
    camera.updateMatrixWorld();
    m.copy(there).multiply(new THREE.Matrix4().copy(here).invert());
    pos.copy(camera.position).applyMatrix4(m);
    q.setFromRotationMatrix(m).multiply(camera.quaternion);
  };
  function intoRel(j) {
    carry(F.b3, F.exIn[j]);
    st.crossing = true; ctx.setFloor(rel); st.crossing = false;
    const d = exits[j], [x, y, z] = toLocal(d.k, pos.toArray());
    eul.setFromQuaternion(frameQ(d.k).invert().multiply(q), 'YXZ');
    rel.pose(d.k, x, y - EYE, z, eul.y, eul.x);   // in the hall's gravity that matches B3's: no turn, no roll
    Object.assign(d, { open: st.open, want: 1 }); rel.walker.solid(d.shut, false); d.leaf.visible = false;
    camera.position.copy(pos); camera.quaternion.copy(q); camera.updateMatrixWorld();
  }
  function outToB3(j) {
    carry(F.ex[j], F.b3Out);
    restr.arriveAt = { x: pos.x, z: pos.z - restr.z0 };   // (its rooms built round the door, not the lift)
    st.crossing = true; ctx.setFloor(restr); st.crossing = false;
    restr.out = 1;   // (no fading in from the car's light: you didn't come by lift)
    eul.setFromQuaternion(q, 'YXZ');
    Object.assign(ctx.player, { x: pos.x, z: pos.z, yaw: eul.y, pitch: eul.x, eye: EYE, fy: 0, seated: false, seat: null });
    st.want = 1; frames();
    camera.position.copy(pos); camera.quaternion.copy(q); camera.updateMatrixWorld();
  }

  // ----- with the restricted level's own enter, leave and frame (through the door, B3 stays as it is) -----
  const been = () => { try { return +localStorage.officeRelativity > 0; } catch { return false; } };
  const enter0 = restr.enter, leave0 = restr.leave, fx0 = restr.fx;
  restr.enter = (z) => {
    enter0(z);
    if (st.crossing) { restr.sync(); return; }
    st.visit = restr.story.st.visit; st.R = rng(st.visit * 131 + 9);
    st.goal = (been() ? 60 : 140) + st.R() * 70; st.tries = 0; st.want = 0;
    remove();
  };
  restr.leave = () => { leave0(); if (!st.crossing) { remove(); st.want = 0; } };
  restr.fx = (dt, t) => {
    fx0(dt, t);
    const p = ctx.camera.position, x = p.x, z = p.z - restr.z0;
    if (st.at && !loaded(st.at.i, st.at.j)) { remove(); st.goal = restr.story.st.walked + 30; }   // gone with its rooms: further on
    if (!st.at && restr.story.st.walked >= st.goal && t > st.tries) {
      st.tries = t + 0.5;
      Math.random = rng(st.visit * 7 + 3);
      try { place(x, z, 12, 24); } finally { Math.random = random; }
    }
  };

  // ----- each frame on either side: the doors, what's through them, going through, the looks and the sound meeting -----
  const at = new THREE.Vector3(), v = new THREE.Vector3(), inv = new THREE.Matrix4();
  // How far from the doorway (frame `f`) the camera is: 0 in it, in front of it only (or just through: the frame you cross in).
  const dist = (f) => { v.copy(camera.position).applyMatrix4(inv.copy(f).invert()); return v.z > 0.5 ? Infinity : Math.hypot(Math.max(0, Math.abs(v.x) - W / 2), Math.max(0, v.y - H), v.z); };
  // Just through a doorway and facing on, it's behind you: nothing of it to draw (its pane, deepened toward you up close,
  // would be all round you).
  const fwd = new THREE.Vector3(), through = new THREE.Vector3();
  const away = (f, d) => d < 0.4 && camera.getWorldDirection(fwd).dot(through.setFromMatrixColumn(f, 2)) < 0;
  const bl = { rel: 0, b3: 0 };
  let seenB3 = false, wasCut = false, peopleAt = -1;
  ctx.onFrame((dt, t) => {
    const A = ctx.away, side = st.at && A === restr ? 'b3' : st.at && A === rel ? 'rel' : null;
    if (side !== 'b3') inP.hide();
    if (side !== 'rel') for (const p of outPs) p.hide();
    let u = 0, hear = 0;
    if (side) {
      camera.updateMatrixWorld();
      if (lastAway !== A) { last.copy(camera.position); lastAway = A; }
      frames();
      if (side === 'b3') {
        // Click it open; it swings shut once you've walked off. Through it, the first way out's side of the hall.
        const d0 = dist(F.b3), u0 = Math.min(1, st.open * 2);
        if (Math.hypot(ctx.player.x - g.position.x, ctx.player.z - restr.z0 - g.position.z) > 14) st.want = 0;
        exits.forEach((d, j) => { d.want = 0; d.open = j ? 0 : st.open; d.leaf.visible = d.open < 0.001; });   // (as it's seen through this door)
        u = sstep(5, 0, d0) * u0; hear = 0.6 * sstep(8, 0, d0) * u0;
        if (st.open > 0) rel.prime();
        const drawn = inP.draw({ here: F.b3, there: F.exIn[0], scene: rel.scene, k: rel.look.exposure / restr.look.exposure, open: st.open > 0.002 && !away(F.b3, d0),
          prepare: () => { lit(rel); if (peopleAt !== t) { peopleAt = t; rel.people.update(dt); } return null; } });
        glow.visible = !drawn;
        if (open() && inP.crossed(F.b3, last, camera.position) > 0) intoRel(0);
      } else {
        // Each way out opens as you come up to it in its own gravity (or click it); B3's door goes with whichever's open.
        const S = rel.walker.S;
        let any = 0, cross = -1;
        exits.forEach((d, j) => {
          const dd = dist(F.ex[j]), mine = S.k === d.k, near = mine && dd < 5;
          if (d.force && (!mine || dd > 7)) d.force = 0;
          d.want = d.force ? (d.force > 0 ? 1 : 0) : near ? 1 : 0;
          if (d.open > 0 && !d.was) rel.audio.door(at.set(0, 1.2, 0).applyMatrix4(F.ex[j]));
          d.was = d.open > 0;
          any = Math.max(any, d.open);
          if (mine) { const uj = Math.min(1, d.open * 2); u = Math.max(u, sstep(5, 0, dd) * uj); hear = Math.max(hear, 0.6 * sstep(8, 0, dd) * uj); }
          rel.walker.solid(d.shut, d.open < 0.5);
          d.leaf.visible = d.open < 0.001;
          const drawn = outPs[j].draw({ here: F.ex[j], there: F.b3Out, scene: restr.scene, k: restr.look.exposure / rel.look.exposure, open: d.open > 0.002 && !away(F.ex[j], dd),
            prepare: () => {
              carry(F.ex[j], F.b3Out);
              restr.view(pos.x, pos.z - restr.z0, t, restr.z0, !seenB3); seenB3 = true;
              lit(restr); return null;
            } });
          d.back.visible = !drawn;
          if (mine && d.open > 0.5 && !S.roll && outPs[j].crossed(F.ex[j], last, camera.position) > 0) cross = j;
        });
        st.want = any > 0 ? 1 : 0; st.open = any;
        if (cross >= 0) outToB3(cross);
      }
      last.copy(camera.position);
    } else {
      lastAway = null; seenB3 = false;
      if (A === rel) exits.forEach((d) => { rel.walker.solid(d.shut, true); d.leaf.visible = true; d.back.visible = true; });   // no door on B3: they're doors again
    }
    // the leaf on B3: opening over a second or so, shutting a little slower; open, a way through B3's wall
    if (side === 'b3' || !side) st.open = clamp(st.open + (st.want ? dt / 1.1 : -dt / 1.6), 0, 1);
    hinge.rotation.y = -1.62 * sstep(0, 1, st.open);
    if (open() !== wasCut) { wasCut = open(); if (st.at && A === restr) restr.sync(); }
    blend(u);
    // each side heard through the other: in quickly as you come up to it, out slowly once you're through (its own comes in)
    const want = { rel: side === 'b3' ? hear : 0, b3: side === 'rel' ? hear : 0 };
    for (const k of ['rel', 'b3']) bl[k] = want[k] > bl[k] ? want[k] : Math.max(want[k], bl[k] - dt / 2.5);
    rel.audio.bleed(bl.rel); restr.audio.bleed(bl.b3);
  }, 194);

  const where = () => at.set(0, 1.2, 0.1).applyMatrix4(g.matrixWorld);
  ctx.action('reldoor', {
    hover: () => (st.want ? '<b>The stone door</b><div class="k">Daylight through it, and stairs. Walk through · click to shut it</div>'
      : been() ? '<b>The stone door</b><div class="k">Still here. Cold daylight under it. Click to open it</div>'
      : '<b>A door</b><div class="k">Old stone round it, older than the building. Cold air under it, and daylight. Click to open it</div>'),
    click: () => { st.want = st.want ? 0 : 1; rel.audio.door(where()); },
  });
  // In the hall: a way out, open or shut (false: there's no door on B3 to open onto; relativity.js takes you back by the lift).
  function exit(j) {
    const d = exits[j];
    if (!st.at || !d) return false;
    d.force = d.want ? -1 : 1;
    return true;
  }
  // For the tests and for looking: the door, now, in a wall just ahead; open (or shut) at once; through it.
  rel.door = {
    force: () => { const p = ctx.camera.position; return place(p.x, p.z - restr.z0, 2, 9); }, st, g, exit,
    open(on = true) { st.want = on ? 1 : 0; st.open = st.want; hinge.rotation.y = -1.62 * st.open; if (ctx.away === restr) restr.sync(); },
    through: () => { frames(); intoRel(0); },
  };
}
