// The desk floor: benching pods of desks, each with two monitors (the session's stats and its latest code) and a chair,
// the clutter that piles up on the hardest-working desks, and the big activity screen over them.

import * as THREE from 'three';
import { AISLE, angDiff, box, clamp, cyl, ease, hash, makeScreen, mat, rng, ROOM, solid } from '../util.js';
import { drawFeed, drawOff, tokenRoll } from '../painters.js';

export function install(ctx) {
  const { world, barM, monitor, officeChair, smallPlant, rug } = ctx;
  Object.assign(ctx, { setClutter, clutterFor });
  // ----- desks -----
  // Benching pods: runs of desks pushed together side by side, two runs back to back across a felt privacy screen.
  // Each desk is built in its own group in desk-local space: local +z points from the monitors toward the chair.
  const desks = [], DESK = { w: 2.0, d: 0.8 }, CHAIR_Z = 0.62, LANE_Z = 1.5;
  const deskTopM = mat('#c49a6c', { roughness: 0.55 }), legM = mat('#2f3236', { metalness: 0.5, roughness: 0.4 });
  const podScreenM = mat('#9aab9f', { roughness: 1 }), podRailM = mat('#b9bcc0', { metalness: 0.7, roughness: 0.35 });
  // Desk-local (lx, lz) to world, for a desk at (x, z) turned by ry.
  const deskToWorld = (d, lx, lz) => ({ x: d.x + lx * Math.cos(d.ry) + lz * Math.sin(d.ry), z: d.z - lx * Math.sin(d.ry) + lz * Math.cos(d.ry) });
  function desk(x, z, ry, walkX) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; world.add(g);
    box(g, DESK.w - 0.01, 0.04, DESK.d, '', 0, 0.74, 0, { material: deskTopM });
    box(g, 0.44, 0.015, 0.14, '#3a3c40', 0, 0.765, 0.12);   // where a seated worker's hands land (see the 'type' pose)
    box(g, 0.06, 0.02, 0.1, '#3a3c40', 0.36, 0.765, 0.14);
    if (hash(String(x * z)) % 3 === 0) cyl(g, 0.04, 0.035, 0.1, '#f4f1ea', -0.82, 0.81, 0.2);
    box(g, 1.3, 0.035, 0.09, '', 0, 2.6, 0.1, { material: barM, shadow: false });
    for (const dx of [-0.5, 0.5]) cyl(g, 0.004, 0.004, ROOM.h - 2.6, '#222', dx, (ROOM.h + 2.6) / 2, 0.1, { shadow: false });
    // Left: session stats. Right: the code it's writing. Both angled in toward the chair.
    const mon = monitor(g, 0.9, 0.5625, -0.47, 0.76, -0.2, 0.14);
    const scr = makeScreen(mon.g, 0.9, 0.5625, 800, 500, 0, mon.screenY, mon.screenZ);
    const codeMon = monitor(g, 0.9, 0.5625, 0.47, 0.76, -0.2, -0.14);
    const codeScr = makeScreen(codeMon.g, 0.9, 0.5625, 800, 500, 0, codeMon.screenY, codeMon.screenZ);
    drawOff(scr); scr.tex.needsUpdate = true;
    drawOff(codeScr); codeScr.tex.needsUpdate = true;
    const d = { x, z, ry, rotY: angDiff(0, ry + Math.PI), scr, codeScr, owner: null };
    if (hash(`${x}|${z}`) % 3 === 1) { const p = deskToWorld(d, 0.86, 0.22); smallPlant(world, p.x, 0.76, p.z); }   // its leaves are world-space instances
    const seat = deskToWorld(d, 0, 0.68);
    d.chair = officeChair(seat.x, seat.z, d.rotY);
    // In from the main aisle down the nearest walkway between pods, along the lane behind the chairs, then sit.
    const chair = deskToWorld(d, 0, CHAIR_Z), lane = deskToWorld(d, 0, LANE_Z);
    d.spot = { key: `desk:${x},${z}`, kind: 'desk', pos: chair, rotY: d.rotY, pose: 'type',
      route: [{ x: walkX, z: AISLE }, { x: walkX, z: lane.z }, lane, chair] };
    desks.push(d);
    return d;
  }
  // A pod of 2 x n desks centred on (cx, cz), runs along x: the south run faces north, the north run faces south.
  // `walks` are the x of the walkways either side; each desk is reached from the nearer one.
  function pod(cx, cz, n, walks) {
    const len = n * DESK.w, x0 = cx - len / 2;
    rug(x0 - 1.1, x0 + len + 1.1, cz - DESK.d - 1.25, cz + DESK.d + 1.25, '#6f7c6c', '#55614f');
    for (let i = 0; i <= n; i++) box(world, 0.05, 0.72, 2 * DESK.d - 0.1, '', x0 + i * DESK.w, 0.36, cz, { material: legM });
    box(world, len, 0.05, 0.05, '', cx, 0.68, cz, { material: legM });
    box(world, len - 0.2, 0.08, 0.22, '#26282b', cx, 0.6, cz);              // cable tray
    box(world, len, 0.34, 0.03, '', cx, 0.93, cz, { material: podScreenM });   // privacy screen, ~30 cm above the desktops
    box(world, len, 0.015, 0.04, '', cx, 1.105, cz, { material: podRailM });
    for (let i = 0; i < n; i++) box(world, 0.12, 0.04, 0.06, '#d9dcdf', x0 + (i + 0.5) * DESK.w, 0.78, cz);   // power rail sockets
    solid(cx, cz, len, 2 * DESK.d);
    const runs = [];
    for (const [dz, ry] of [[DESK.d / 2, 0], [-DESK.d / 2, Math.PI]]) for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * DESK.w;
      runs.push(desk(x, cz + dz, ry, walks.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a))));
    }
    return runs;
  }
  // Two bands of two pods across the desk floor, walkways at the west wall, between the pods (under the big
  // activity screen) and east of them. Desks fill south band first, nearest the aisle.
  const DESK_WALKS = [-18.75, -8.3, 2.6];
  for (const cz of [-5.4, -10.8]) for (const cx of [-3.1, -13.5]) pod(cx, cz, 4, DESK_WALKS);

  // Desk clutter: takeaway coffee cups and energy drink cans pile up on the desks of the sessions working hardest
  // (output tokens + time spent busy). Each desk has a fixed, seeded layout of DESK_MAX slots filled in order, so the
  // pile only grows; cups sometimes stack. Four instanced meshes for every desk.
  const DESK_MAX = 18, clutterN = desks.length * DESK_MAX;
  const clutter = {
    cup: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.03, 0.115, 12).translate(0, 0.0575, 0), mat('#ffffff', { roughness: 0.75 }), clutterN),
    lid: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.043, 0.043, 0.012, 12).translate(0, 0.121, 0), mat('#ffffff', { roughness: 0.5 }), clutterN),
    can: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.033, 0.033, 0.122, 14).translate(0, 0.061, 0), mat('#ffffff', { roughness: 0.3, metalness: 0.6 }), clutterN),
    top: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.033, 0.008, 14).translate(0, 0.126, 0), mat('#c9ccd1', { roughness: 0.3, metalness: 0.9 }), clutterN),
  };
  {
    const CUP = ['#f2efe8', '#c9a57a', '#f2efe8', '#e9e4da'], LID = ['#2a2a2a', '#f4f4f4'], CAN = ['#7ed321', '#1f6fd1', '#e3e5e8', '#e0245e', '#151515', '#ffb000'];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    // Free spots on the desk top (desk-local): beside the monitors and in the front corners clear of keyboard and mouse.
    const ZONES = [[-0.93, -0.62, -0.34, 0.34], [0.62, 0.93, -0.34, 0.12], [-0.6, -0.3, 0.24, 0.36], [0.5, 0.62, 0.24, 0.36]];
    desks.forEach((d, di) => {
      const R = rng(hash(`clutter|${d.x}|${d.z}`)), placed = [];
      d.clutter = [];
      for (let i = 0, tries = 0; i < DESK_MAX && tries < 400; tries++) {
        const kind = R() < 0.55 ? 'cup' : 'can', base = kind === 'cup' && placed.find((p) => p.kind === 'cup' && p.h < 3 && R() < 0.3);
        let x, z, y = 0.76, lying = false;
        if (base) { x = base.x; z = base.z; y = 0.76 + base.h * 0.105; base.h++; }
        else {
          const [x0, x1, z0, z1] = ZONES[Math.floor(R() * R() * ZONES.length)];
          x = x0 + R() * (x1 - x0); z = z0 + R() * (z1 - z0);
          if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 0.09) || Math.hypot(x + 0.82, z - 0.2) < 0.09 || Math.hypot(x - 0.86, z - 0.22) < 0.12) continue;
          lying = kind === 'can' && R() < 0.25;
          placed.push({ kind, x, z, h: 1 });
        }
        e.set(lying ? Math.PI / 2 : 0, R() * Math.PI * 2, 0, 'YXZ');
        const w = deskToWorld(d, x, z);
        m4.compose(v.set(w.x, lying ? y + 0.033 : y, w.z), q.setFromEuler(e), one);
        const k = di * DESK_MAX + i;
        d.clutter.push({ k, kind, m: m4.clone() });
        if (kind === 'cup') { clutter.cup.setColorAt(k, c.set(CUP[Math.floor(R() * CUP.length)])); clutter.lid.setColorAt(k, c.set(LID[Math.floor(R() * LID.length)])); }
        else clutter.can.setColorAt(k, c.set(CAN[Math.floor(R() * CAN.length)]));
        i++;
      }
      d.clutterShown = -1;
    });
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const im of Object.values(clutter)) {
      for (let k = 0; k < clutterN; k++) im.setMatrixAt(k, zero);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      world.add(im);
    }
  }
  // How many items a session has earned: ~1 per 15k output tokens plus 1 per 10 minutes busy.
  function clutterFor(s, now) {
    const t = s?.transcript;
    if (!t) return 0;
    const busyMs = (t.turns || 0) * (t.avgTurnMs || 0) + (s.status === 'working' && s.statusSince ? now - s.statusSince : 0);
    return Math.min(DESK_MAX, Math.floor((t.tokens?.output || 0) / 15000 + busyMs / 600000));
  }
  function setClutter(d, n) {
    if (n === d.clutterShown) return;
    d.clutterShown = n;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [i, it] of d.clutter.entries()) {
      const m = i < n ? it.m : zero;
      if (it.kind === 'cup') { clutter.cup.setMatrixAt(it.k, m); clutter.lid.setMatrixAt(it.k, m); }
      else { clutter.can.setMatrixAt(it.k, m); clutter.top.setMatrixAt(it.k, m); }
    }
    for (const im of Object.values(clutter)) im.instanceMatrix.needsUpdate = true;
  }

  // Big activity screen over the desk floor.
  const feedTV = makeScreen(world, 4.2, 2.1, 1280, 640, -8.2, 2.05, -14.86);
  box(world, 4.3, 2.2, 0.06, '#111214', -8.2, 2.05, -14.9);
  Object.assign(ctx, { deskTopM, legM, desks, feedTV });
  ctx.onFrame((dt, t, now) => {
    // Roll the board's token counter up to the latest total over 1.5 s, repainting the board at ~12 fps while it moves.
    if (ctx.state && tokenRoll.shown !== tokenRoll.target && now - (tokenRoll.painted || 0) > 80) {
      const u = clamp((now - tokenRoll.at) / 1500, 0, 1);
      tokenRoll.shown = u >= 1 ? tokenRoll.target : tokenRoll.from + (tokenRoll.target - tokenRoll.from) * ease(u);
      tokenRoll.painted = now;
      drawFeed(feedTV, ctx.state); feedTV.tex.needsUpdate = true;
    }
  }, 30);
  ctx.hoverTargets(() => desks.flatMap((d) => [d.scr.mesh, d.codeScr.mesh]), 60);
}
