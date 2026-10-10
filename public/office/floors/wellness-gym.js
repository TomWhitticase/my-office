// The wellness floor's gym (floors/wellness.js), the north-east corner on rubber: a cardio row facing the east windows
// (three treadmills, two bikes, two rowers: click one to get on, W/S set the pace, its console shows speed, distance and
// time, Esc or a click steps off); free weights along the mirrored north wall (a dumbbell rack: click a pair for a set of
// curls), a bench press and a cable machine (click for a set: reps, then the clank of the rack), a power rack and plyo
// boxes; and a TV on the oak wall with the office's live boards.

import * as THREE from 'three';
import { clamp, FONT, mat } from '../util.js';
import { drawRoster, drawUsage } from '../painters.js';

export function installGym(ctx, W) {
  const { G, M, kit, solid } = W, { camera, toast } = ctx;
  const steel = new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.85, roughness: 0.3 });
  const rubberM = new THREE.MeshStandardMaterial({ color: '#1c1d1f', roughness: 0.75 });
  const padM = new THREE.MeshStandardMaterial({ color: '#2d2a28', roughness: 0.6 });
  const RX = 17.25;   // where you stand on the cardio row, facing east
  const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const sound = W.sound;

  // A console's screen: the machine's name, then big figures.
  function paintConsole(scr, title, rows, on) {
    const { ctx: c, W: w, H: h } = scr;
    c.fillStyle = '#07090b'; c.fillRect(0, 0, w, h);
    c.fillStyle = on ? '#e58a3c' : '#3a3f45'; c.font = `600 15px ${FONT}`; c.fillText(title.toUpperCase(), 12, 22);
    if (!on) { c.fillStyle = '#59606a'; c.font = `500 15px ${FONT}`; c.fillText('Click to start', 12, h / 2 + 12); scr.tex.needsUpdate = true; return; }
    rows.forEach(([label, value], i) => {
      const x = 12 + (i % 2) * (w / 2), y = 56 + Math.floor(i / 2) * 58;
      c.fillStyle = '#7d8590'; c.font = `500 12px ${FONT}`; c.fillText(label, x, y - 18);
      c.fillStyle = '#f1f3f5'; c.font = `600 28px ${FONT}`; c.fillText(value, x, y + 10);
    });
    scr.tex.needsUpdate = true;
  }

  // ----- the cardio row -----
  const machines = [];
  const k = kit();
  function treadmill(z) {
    k.box(M.black, 1.9, 0.18, 0.85, 17.3, 0.09, z); k.box(steel, 1.7, 0.04, 0.12, 17.25, 0.2, z - 0.33); k.box(steel, 1.7, 0.04, 0.12, 17.25, 0.2, z + 0.33);
    k.box(M.black, 0.36, 0.24, 0.85, 18.12, 0.2, z);
    for (const s of [-1, 1]) { k.box(M.black, 0.07, 1.2, 0.07, 18.15, 0.8, z + s * 0.37); k.cyl(steel, 0.018, 0.018, 0.55, 17.86, 1.05, z + s * 0.37, 10, 0, Math.PI / 2); }
    k.box(M.black, 0.1, 0.28, 0.6, 18.17, 1.3, z); k.box(M.black, 0.45, 0.05, 0.8, 18.0, 1.12, z);
    // The belt, its own material so it can run.
    const t = beltTex.clone(); t.needsUpdate = true;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.012, 0.52), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    belt.position.set(17.25, 0.186, z); belt.receiveShadow = true; G.add(belt);
    const scr = W.screen(G, 0.36, 0.22, 18.115, 1.3, z);
    solid(17.3, z, 1.95, 0.9);
    return { kind: 'treadmill', name: 'Treadmill', z, scr, belt, pace: 0, dist: 0, time: 0, phase: 0 };
  }
  function bike(z) {
    for (const x of [16.75, 17.85]) k.box(M.black, 0.08, 0.06, 0.62, x, 0.03, z);
    k.box(M.black, 1.15, 0.06, 0.08, 17.3, 0.06, z);
    const tube = (a, b, m = M.black, r = 0.03) => { const v = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, v.length(), 10);
      g.translate(0, v.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize())); g.translate(a.x, a.y, a.z); k.geo(m, g); };
    const V = (x, y) => new THREE.Vector3(x, y, z);
    tube(V(16.85, 0.06), V(17.0, 0.86)); tube(V(17.05, 0.4), V(17.7, 1.05)); tube(V(17.2, 0.08), V(17.65, 0.38));
    k.cyl(M.black, 0.27, 0.27, 0.07, 17.62, 0.38, z, 28, Math.PI / 2); k.cyl(steel, 0.2, 0.2, 0.075, 17.62, 0.38, z, 28, Math.PI / 2);
    k.box(M.leather, 0.28, 0.07, 0.19, 17.0, 0.9, z);
    k.cyl(M.black, 0.02, 0.02, 0.52, 17.7, 1.07, z, 10, Math.PI / 2); k.cyl(M.black, 0.02, 0.02, 0.32, 17.8, 1.1, z, 10, 0, Math.PI / 2);
    const crank = new THREE.Group(); crank.position.set(17.22, 0.36, z); G.add(crank);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.17, 0.02), steel); arm.position.set(0, s * 0.085, s * 0.09); crank.add(arm);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), M.black); ped.position.set(0, s * 0.17, s * 0.15); crank.add(ped); }
    const scr = W.screen(G, 0.22, 0.15, 17.83, 1.22, z, -Math.PI / 2, 220);
    scr.mesh.rotation.set(0, -Math.PI / 2, 0); scr.mesh.rotateX(-0.5);
    solid(17.3, z, 1.25, 0.62);
    return { kind: 'bike', name: 'Bike', z, scr, crank, rpm: 0, dist: 0, time: 0, phase: 0 };
  }
  function rower(z) {
    k.box(steel, 2.9, 0.05, 0.12, 17.5, 0.28, z); k.box(M.black, 0.1, 0.3, 0.5, 16.05, 0.15, z); k.box(M.black, 0.5, 0.06, 0.5, 18.75, 0.03, z);
    k.cyl(M.black, 0.3, 0.3, 0.2, 18.85, 0.48, z, 30, Math.PI / 2); k.cyl(steel, 0.08, 0.08, 0.21, 18.85, 0.48, z, 16, Math.PI / 2);
    for (const s of [-1, 1]) k.box(M.black, 0.2, 0.03, 0.14, 18.3, 0.36, z + s * 0.12);
    k.cyl(M.black, 0.015, 0.015, 0.7, 18.65, 0.95, z, 8, 0, 0.35);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.28), M.leather); seat.position.set(17.2, 0.34, z); seat.castShadow = true; G.add(seat);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), M.black); handle.rotation.x = Math.PI / 2; handle.position.set(18.5, 0.62, z); G.add(handle);
    const scr = W.screen(G, 0.2, 0.15, 18.52, 1.17, z, -Math.PI / 2, 220);
    solid(17.5, z, 3.0, 0.62);
    return { kind: 'rower', name: 'Rower', z, scr, seat, handle, spm: 0, dist: 0, time: 0, phase: 0 };
  }
  const beltTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#18191b'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * 64, Math.random() * 256, 2, 1); }
    for (let y = 0; y < 256; y += 32) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y, 64, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.rotation = Math.PI / 2; t.repeat.set(3, 1);
    return t;
  })();
  for (const z of [5.0, 6.45, 7.9]) machines.push(treadmill(z));
  for (const z of [9.3, 10.4]) machines.push(bike(z));
  for (const z of [11.9, 13.4]) machines.push(rower(z));

  for (const m of machines) {
    paintConsole(m.scr, m.name, [], false);
    const len = m.kind === 'rower' ? 3.0 : m.kind === 'bike' ? 1.3 : 1.95;
    const hit = ctx.hitBox(G, len, 1.5, 0.7, m.kind === 'rower' ? 17.5 : 17.3, 0.75, m.z, { action: 'wellness-cardio', reach: 3, machine: m });
    hit.userData.info = m;
    W.hits.push(hit);
    m.act = {
      name: m.name,
      start() {
        Object.assign(ctx.player, { x: m.kind === 'rower' ? 17.2 : m.kind === 'bike' ? 16.95 : RX, z: m.z, seated: false, seat: null, yaw: -Math.PI / 2, pitch: -0.06 });
        W.lift.eye = m.kind === 'treadmill' ? 1.85 : m.kind === 'bike' ? 1.45 : 1.02;
        Object.assign(m, { dist: 0, time: 0, pace: 0, rpm: 0, spm: 0 });
        const what = m.kind === 'treadmill' ? 'speed' : m.kind === 'bike' ? 'cadence' : 'stroke rate';
        toast(`${m.name} · <kbd>W</kbd>/<kbd>S</kbd> ${what} · <kbd>Esc</kbd> or click to get off`);
      },
      key(e) {
        if (e.code !== 'KeyW' && e.code !== 'KeyS' && e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return false;
        const up = e.code === 'KeyW' || e.code === 'ArrowUp' ? 1 : -1;
        if (m.kind === 'treadmill') m.pace = clamp(m.pace + up * 0.5, 0, 18);
        else if (m.kind === 'bike') m.rpm = clamp(m.rpm + up * 5, 0, 120);
        else m.spm = clamp(m.spm + up * 2, 0, 36);
        sound.beep(18.1, 1.4, m.z);
        return true;
      },
      fx(dt) { run(m, dt); },
      stop() {
        Object.assign(ctx.player, { x: m.kind === 'rower' ? 15.6 : 16.0, z: m.z, yaw: -Math.PI / 2 });
        W.lift.bob = W.lift.roll = W.lift.dx = 0;
        sound.tool(null);
        const done = m.dist > 0.005 ? ` · ${m.kind === 'rower' ? `${Math.round(m.dist * 1000)} m` : `${m.dist.toFixed(2)} km`} in ${fmtT(m.time)}` : '';
        toast(`Off the ${m.name.toLowerCase()}${done}`);
        m.pace = m.rpm = m.spm = 0;
        paintConsole(m.scr, m.name, [], false);
      },
    };
  }
  ctx.action('wellness-cardio', {
    hover: (h) => { const m = h.info; return `<b>${m.name}</b><div class="k">${W.using === m.act ? 'Click to get off' : `Click to get on · <kbd>W</kbd>/<kbd>S</kbd> ${m.kind === 'treadmill' ? 'speed' : m.kind === 'bike' ? 'cadence' : 'stroke rate'}`}</div>`; },
    click: (h) => W.use(h.info.act),
  });

  // Running a machine: the belt, crank or flywheel, the bob of your stride or stroke, the console every quarter second.
  let paintAt = 0;
  function run(m, dt) {
    const L = W.lift;
    if (m.kind === 'treadmill') {
      const v = m.pace / 3.6, steps = m.pace < 7 ? 1.5 + m.pace * 0.09 : 2.5 + m.pace * 0.045;
      if (m.pace > 0) { m.time += dt; m.dist += v * dt / 1000; }
      m.belt.material.map.offset.x -= v * dt / 1.5 * 3;
      const was = m.phase; m.phase += dt * steps * (m.pace > 0 ? 1 : 0);
      if (Math.floor(m.phase) !== Math.floor(was)) sound.thud(RX, m.z, 0.1 + m.pace * 0.012);
      const amp = m.pace ? 0.012 + 0.0035 * m.pace : 0;
      L.bob = -Math.abs(Math.sin(m.phase * Math.PI)) * amp + amp / 2; L.roll = Math.sin(m.phase * Math.PI) * 0.004 * (m.pace / 10);
      L.dx = Math.sin(m.phase * Math.PI * 2) * 0.01 * (m.pace / 10);
      sound.tool('whirr', m.pace / 18, 18, m.z);
    } else if (m.kind === 'bike') {
      if (m.rpm > 0) { m.time += dt; m.dist += m.rpm * 0.3 / 3600 * dt; }
      m.phase += dt * m.rpm / 60;
      m.crank.rotation.z = -m.phase * Math.PI * 2;
      L.bob = Math.sin(m.phase * Math.PI * 4) * 0.004 * Math.min(1, m.rpm / 60); L.roll = Math.sin(m.phase * Math.PI * 2) * 0.012 * Math.min(1, m.rpm / 80);
      sound.tool('whirr', m.rpm / 240, 17.6, m.z);
    } else {
      const f = m.spm / 60;
      if (m.spm > 0) { m.time += dt; m.dist += m.spm * 0.17 / 1000 * dt; }
      m.phase += dt * f;
      // The stroke: a quick drive back (a third of the cycle), a slower recovery forward.
      const u = m.phase % 1, s = u < 0.35 ? Math.sin((u / 0.35) * Math.PI / 2) : Math.cos(((u - 0.35) / 0.65) * Math.PI / 2), drive = m.spm ? s : 0;
      m.seat.position.x = 17.55 - 0.65 * drive; m.handle.position.x = 18.45 - 0.95 * drive; m.handle.position.y = 0.6 + 0.15 * drive;
      L.dx = -0.65 * drive + 0.35; L.bob = 0.05 * Math.sin(drive * Math.PI) - 0.04 * (1 - drive); L.roll = 0;
      sound.tool('fly', drive * Math.min(1, m.spm / 30), 18.85, m.z);
    }
    paintAt -= dt;
    if (paintAt <= 0) {
      paintAt = 0.25;
      if (m.kind === 'treadmill') paintConsole(m.scr, m.name, [['SPEED km/h', m.pace.toFixed(1)], ['TIME', fmtT(m.time)], ['DISTANCE km', m.dist.toFixed(2)], ['KCAL', String(Math.round(m.dist * 68))]], true);
      else if (m.kind === 'bike') paintConsole(m.scr, m.name, [['RPM', String(m.rpm)], ['TIME', fmtT(m.time)], ['km', m.dist.toFixed(2)], ['WATTS', String(Math.round(m.rpm * m.rpm * 0.018))]], true);
      else {
        const split = m.spm ? 500 / (m.spm * 0.17) : 0;
        paintConsole(m.scr, m.name, [['/500 m', m.spm ? fmtT(split) : '–:––'], ['SPM', String(m.spm)], ['METRES', String(Math.round(m.dist * 1000))], ['TIME', fmtT(m.time)]], true);
      }
    }
  }

  // ----- free weights -----
  // The mirror along the solid north wall, black-framed; the dumbbell rack under it, 2.5 to 25 kg; kettlebells below.
  k.box(M.mirror, 9.4, 2.3, 0.02, 11, 1.35, 14.87); k.box(M.black, 9.5, 0.04, 0.04, 11, 2.52, 14.86); k.box(M.black, 9.5, 0.04, 0.04, 11, 0.19, 14.86);
  const PAIRS = [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25], RACK = { x0: 8.2, x1: 13.0, z: 14.3 };
  for (const x of [RACK.x0 - 0.1, (RACK.x0 + RACK.x1) / 2, RACK.x1 + 0.1]) { k.box(M.black, 0.06, 0.8, 0.06, x, 0.4, RACK.z + 0.2); k.box(M.black, 0.06, 0.6, 0.06, x, 0.3, RACK.z - 0.2); }
  k.box(M.black, RACK.x1 - RACK.x0 + 0.3, 0.04, 0.34, (RACK.x0 + RACK.x1) / 2, 0.66, RACK.z, 0, -0.25);
  k.box(M.black, RACK.x1 - RACK.x0 + 0.3, 0.04, 0.4, (RACK.x0 + RACK.x1) / 2, 0.22, RACK.z);
  const dumbbell = (x, y, z, kg, along = 'z', kk = k) => {   // hex heads sized by weight, a knurled handle
    const r = 0.045 + Math.sqrt(kg) * 0.012, w = 0.04 + kg * 0.0035;
    if (along === 'z') { kk.cyl(steel, 0.016, 0.016, 0.16, x, y, z, 8, Math.PI / 2); for (const s of [-1, 1]) kk.cyl(rubberM, r, r, w, x, y, z + s * (0.08 + w / 2), 6, Math.PI / 2); }
    else { kk.cyl(steel, 0.016, 0.016, 0.16, x, y, z, 8, 0, Math.PI / 2); for (const s of [-1, 1]) kk.cyl(rubberM, r, r, w, x + s * (0.08 + w / 2), y, z, 6, 0, Math.PI / 2); }
  };
  PAIRS.forEach((kg, i) => { const x = RACK.x0 + 0.24 + i * (RACK.x1 - RACK.x0 - 0.48) / 9; for (const s of [-1, 1]) dumbbell(x + s * 0.11, 0.73 - 0.0, RACK.z, kg); });
  for (let i = 0; i < 6; i++) {   // kettlebells on the bottom shelf
    const x = RACK.x0 + 0.4 + i * 0.8, r = 0.09 + i * 0.012;
    k.geo(rubberM, new THREE.SphereGeometry(r, 14, 10).translate(x, 0.24 + r, RACK.z));
    const h = new THREE.TorusGeometry(r * 0.6, 0.018, 8, 16, Math.PI); h.translate(x, 0.24 + r * 1.75, RACK.z); k.geo(rubberM, h);
  }
  solid((RACK.x0 + RACK.x1) / 2, RACK.z, RACK.x1 - RACK.x0 + 0.4, 0.8);
  const rackHit = ctx.hitBox(G, RACK.x1 - RACK.x0, 0.5, 0.6, (RACK.x0 + RACK.x1) / 2, 0.75, RACK.z, { action: 'wellness-dumbbells', reach: 3 });
  rackHit.userData.drawerAt = (p) => { const i = clamp(Math.round((p.x - RACK.x0 - 0.24) / ((RACK.x1 - RACK.x0 - 0.48) / 9)), 0, 9); return { kg: PAIRS[i], i }; };
  W.hits.push(rackHit);

  // The pair in your hands: two dumbbells placed in front of you each frame.
  const held = new THREE.Group(); held.visible = false; G.add(held);
  const heldL = new THREE.Group(), heldR = new THREE.Group(); held.add(heldL, heldR);
  function setHeld(kg) {
    for (const g of [heldL, heldR]) { g.clear(); const kk = kit(); dumbbell(0, 0, 0, kg, 'x', kk); kk.flush(g, false); }
  }
  const tmpF = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpU = new THREE.Vector3();
  function placeHeld(grip, up, spread = 0.22) {   // grip: distance ahead, up: height under the eye, in camera space
    camera.updateMatrixWorld();
    tmpR.setFromMatrixColumn(camera.matrixWorld, 0); tmpU.setFromMatrixColumn(camera.matrixWorld, 1); tmpF.setFromMatrixColumn(camera.matrixWorld, 2).negate();
    for (const [g, s] of [[heldL, -1], [heldR, 1]]) {
      g.position.copy(camera.position).addScaledVector(tmpF, grip).addScaledVector(tmpU, up).addScaledVector(tmpR, s * spread);
      g.position.y -= W.Y; g.quaternion.copy(camera.quaternion);
    }
  }
  // A set: `reps` at `tempo` seconds each, `move(u)` each frame (u 0..1 through the rep), a clank as it's racked.
  function set({ name, reps, tempo, where, off = where, eye, yaw, pitch, start, move, end, clankAt }) {
    const S = { rep: 0, u: 0 };
    return {
      name,
      start() {
        Object.assign(ctx.player, { x: where.x, z: where.z, seated: false, seat: null, yaw, pitch });
        W.lift.eye = eye; S.rep = 0; S.u = 0; start?.();
        toast(`${name} · ${reps} reps · move or <kbd>Esc</kbd> to stop`);
      },
      fx(dt) {
        S.u += dt / tempo;
        if (S.u >= 1) {
          S.u -= 1; S.rep++;
          if (S.rep >= reps) { W.stop(); toast(`Set done · ${reps} × ${name.toLowerCase()} · nice work`); return; }
          if (S.rep % 3 === 0 || reps - S.rep <= 2) toast(`${name} · ${S.rep} / ${reps}`);
        }
        move(S.u, S.rep);
      },
      stop() { end?.(); sound.clank(clankAt.x, clankAt.y, clankAt.z, 0.5); W.lift.bob = W.lift.roll = W.lift.dx = W.lift.dz = 0; Object.assign(ctx.player, { x: off.x, z: off.z }); },
    };
  }
  let curls = null;
  ctx.action('wellness-dumbbells', {
    hover: (h) => `<b>Dumbbells · ${h.drawer.kg} kg</b><div class="k">${W.using === curls ? 'Click to rack them' : 'Click for a set of curls'}</div>`,
    click: (h) => {
      if (W.using === curls && curls) { W.stop(); return; }
      const kg = h.drawer.kg, x = RACK.x0 + 0.24 + h.drawer.i * (RACK.x1 - RACK.x0 - 0.48) / 9;
      curls = set({ name: `${kg} kg curls`, reps: 10, tempo: 1.5 + kg * 0.03, where: { x: clamp(x, 8.6, 12.6), z: 13.35 }, eye: 1.65, yaw: Math.PI, pitch: -0.35,
        clankAt: { x, y: 0.75, z: RACK.z },
        start: () => { setHeld(kg); held.visible = true; sound.clank(x, 0.75, RACK.z, 0.25); },
        move: (u) => {
          const c = Math.sin(u * Math.PI);   // up and down
          placeHeld(0.32 + 0.12 * c, -0.48 + 0.3 * c);
          W.lift.bob = -0.015 * c;
        },
        end: () => { held.visible = false; } });
      W.use(curls);
    },
  });

  // The bench press: a flat bench under a racked bar. Lie back and press eight, the bar coming down to your chest.
  const BP = { x: 9.0, z: 10.6 };
  k.box(padM, 0.32, 0.1, 1.25, BP.x, 0.46, BP.z + 0.15); k.box(M.black, 0.08, 0.4, 0.08, BP.x, 0.2, BP.z + 0.6); k.box(M.black, 0.4, 0.05, 0.08, BP.x, 0.03, BP.z + 0.6);
  for (const s of [-1, 1]) { k.box(M.black, 0.07, 1.18, 0.07, BP.x + s * 0.55, 0.59, BP.z - 0.5); k.box(M.black, 0.07, 0.05, 0.6, BP.x + s * 0.55, 0.025, BP.z - 0.35);
    k.box(M.black, 0.1, 0.06, 0.06, BP.x + s * 0.55, 1.06, BP.z - 0.46); }
  const barbell = (g, plates = 2) => { const kk = kit(); kk.cyl(steel, 0.014, 0.014, 2.0, 0, 0, 0, 10, 0, Math.PI / 2);
    for (const s of [-1, 1]) { for (let i = 0; i < plates; i++) kk.cyl(rubberM, 0.225 - i * 0.05, 0.225 - i * 0.05, 0.04, s * (0.7 + i * 0.045), 0, 0, 24, 0, Math.PI / 2);
      kk.cyl(steel, 0.03, 0.03, 0.05, s * 0.62, 0, 0, 12, 0, Math.PI / 2); }
    kk.flush(g, true); };
  const racked = new THREE.Group(); racked.position.set(BP.x, 1.11, BP.z - 0.46); barbell(racked); G.add(racked);
  const bar = new THREE.Group(); bar.visible = false; barbell(bar); G.add(bar);
  solid(BP.x, BP.z, 1.3, 1.5);
  W.hits.push(ctx.hitBox(G, 1.2, 1.2, 1.5, BP.x, 0.6, BP.z, { action: 'wellness-bench', reach: 3 }));
  let press = null;
  ctx.action('wellness-bench', {
    hover: () => `<b>Bench press · 60 kg</b><div class="k">${W.using === press ? 'Click to rack it' : 'Click to lie back and press a set'}</div>`,
    click: () => {
      if (W.using === press && press) { W.stop(); return; }
      press = set({ name: 'Bench press', reps: 8, tempo: 2.3, where: { x: BP.x, z: BP.z - 0.2 }, off: { x: BP.x + 1.0, z: BP.z + 0.2 }, eye: 0.66, yaw: Math.PI, pitch: 1.25,
        clankAt: { x: BP.x, y: 1.1, z: BP.z - 0.46 },
        start: () => { racked.visible = false; bar.visible = true; },
        move: (u) => {
          const c = 0.5 + 0.5 * Math.cos(u * Math.PI * 2);   // arms locked out at the top of each rep
          bar.position.set(BP.x, 0.66 + 0.18 + 0.48 * c, BP.z - 0.12 + 0.05 * c);
          W.lift.bob = -0.01 * (1 - c);
        },
        end: () => { racked.visible = true; bar.visible = false; } });
      W.use(press);
    },
  });

  // The cable machine against the oak wall: a weight stack in its frame; pull a set of rows and the stack rides up.
  const CM = { x: 6.55, z: 13.1 };
  for (const s of [-1, 1]) k.box(M.black, 0.08, 2.3, 0.08, CM.x, 1.15, CM.z + s * 0.45);
  k.box(M.black, 0.4, 0.08, 1.0, CM.x, 2.3, CM.z); k.box(M.black, 0.5, 0.06, 1.0, CM.x + 0.1, 0.03, CM.z);
  for (const s of [-1, 1]) k.cyl(steel, 0.012, 0.012, 2.1, CM.x, 1.1, CM.z + s * 0.08, 6);
  for (let i = 0; i < 11; i++) k.box(M.black, 0.2, 0.045, 0.28, CM.x, 0.08 + i * 0.05, CM.z);
  k.cyl(M.black, 0.06, 0.06, 0.03, CM.x + 0.25, 1.0, CM.z, 16, 0, Math.PI / 2);
  const stack = new THREE.Group(); G.add(stack);
  { const kk = kit(); for (let i = 0; i < 5; i++) kk.box(M.black, 0.2, 0.045, 0.28, 0, i * 0.05, 0); kk.box(M.brass, 0.21, 0.01, 0.1, 0, 0.22, 0.05); kk.flush(stack, false); }
  stack.position.set(CM.x, 0.63, CM.z);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 4).rotateZ(Math.PI / 2), M.black); G.add(rope);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), M.black); handle.rotation.x = Math.PI / 2; G.add(handle);
  const placeRope = (d) => {   // the cable from its pulley out to the handle, `d` metres out
    handle.position.set(CM.x + 0.25 + d, 1.0, CM.z);
    rope.position.set(CM.x + 0.25 + d / 2, 1.0, CM.z); rope.scale.x = d;
  };
  placeRope(0.15);
  solid(CM.x + 0.05, CM.z, 0.6, 1.1);
  W.hits.push(ctx.hitBox(G, 0.6, 2.3, 1.0, CM.x, 1.15, CM.z, { action: 'wellness-cable', reach: 3 }));
  let rows = null;
  ctx.action('wellness-cable', {
    hover: () => `<b>Cable row · 25 kg</b><div class="k">${W.using === rows ? 'Click to let go' : 'Click for a set'}</div>`,
    click: () => {
      if (W.using === rows && rows) { W.stop(); return; }
      let landed = true;
      rows = set({ name: 'Cable rows', reps: 12, tempo: 1.9, where: { x: CM.x + 1.15, z: CM.z }, eye: 1.6, yaw: Math.PI / 2, pitch: -0.25,
        clankAt: { x: CM.x, y: 0.6, z: CM.z },
        move: (u) => {
          const c = Math.sin(u * Math.PI) ** 1.5;
          stack.position.y = 0.63 + 0.35 * c; placeRope(0.15 + 0.62 * c);
          W.lift.dx = 0.04 * c;
          if (c < 0.03 && !landed) { landed = true; sound.clank(CM.x, 0.6, CM.z, 0.18); } else if (c > 0.3) landed = false;
        },
        end: () => { stack.position.y = 0.63; placeRope(0.15); } });
      W.use(rows);
    },
  });

  // ----- the rest of the room -----
  // A power rack with a loaded bar, a plate tree, plyo boxes, foam rollers on a mat, a water fountain and towel shelf by the door.
  {
    const PR = { x: 12.6, z: 9.4 };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(M.black, 0.08, 2.3, 0.08, PR.x + sx * 0.6, 1.15, PR.z + sz * 0.6);
    for (const sx of [-1, 1]) { k.box(M.black, 0.08, 0.08, 1.28, PR.x + sx * 0.6, 2.28, PR.z); k.box(M.black, 0.08, 0.08, 1.28, PR.x + sx * 0.6, 0.05, PR.z); }
    for (const sz of [-1, 1]) k.box(M.black, 1.28, 0.08, 0.08, PR.x, 2.28, PR.z + sz * 0.6);
    const rb = new THREE.Group(); rb.position.set(PR.x, 1.38, PR.z - 0.6); rb.rotation.y = 0; barbell(rb, 3); G.add(rb);
    k.box(M.oak, 1.2, 0.02, 1.2, PR.x, 0.012, PR.z);
    solid(PR.x, PR.z, 1.4, 1.4);
    k.cyl(M.black, 0.03, 0.03, 1.1, 14.2, 0.55, 9.4, 8); k.box(M.black, 0.5, 0.04, 0.5, 14.2, 0.02, 9.4);
    for (const [y, r] of [[0.35, 0.225], [0.7, 0.18], [0.95, 0.14]]) k.cyl(rubberM, r, r, 0.05, 14.2, y, 9.4, 24, Math.PI / 2);
    solid(14.2, 9.4, 0.55, 0.55);
    for (const [x, z, h] of [[14.6, 12.6, 0.6], [15.25, 12.6, 0.5], [14.9, 13.3, 0.75]]) { k.box(M.oak, 0.6, h, 0.5, x, h / 2, z); solid(x, z, 0.62, 0.52); }
    k.box(mat2('#3a4038'), 1.8, 0.012, 0.65, 8.9, 0.008, 6.2); k.box(mat2('#3a4038'), 1.8, 0.012, 0.65, 8.9, 0.008, 7.0);
    for (let i = 0; i < 3; i++) k.cyl(mat2('#5f7c86'), 0.075, 0.075, 0.45, 8.3 + i * 0.5, 0.09, 6.2, 16, Math.PI / 2);
    // Fountain and towels by the door.
    k.box(steel, 0.42, 0.9, 0.32, 11.0, 0.45, 3.78); k.box(M.black, 0.36, 0.03, 0.26, 11.0, 0.92, 3.78);
    k.box(M.oak, 0.9, 0.04, 0.38, 12.2, 1.0, 3.75); k.box(M.oak, 0.9, 0.04, 0.38, 12.2, 0.55, 3.75);
    for (let i = 0; i < 4; i++) { k.box(M.towel, 0.3, 0.08, 0.3, 11.92 + (i % 2) * 0.4, 0.61 + Math.floor(i / 2) * 0.45, 3.75); k.box(M.towel, 0.3, 0.08, 0.3, 11.92 + (i % 2) * 0.4, 0.69 + Math.floor(i / 2) * 0.45, 3.75); }
    solid(11.6, 3.78, 1.6, 0.42);
    // Ceiling speakers.
    for (const [x, z] of [[9.5, 6.5], [15, 11]]) k.cyl(M.black, 0.11, 0.11, 0.02, x, 3.29, z, 18);
  }
  function mat2(c) { return mat(c, { roughness: 0.9 }); }
  k.flush(G);

  // ----- the TV -----
  // On the oak wall over the stretching mats: the office's Team board, then its Usage, ten seconds each.
  const tv = W.screen(G, 2.0, 1.125, 6.112, 1.95, 10.6, Math.PI / 2, 860);
  { const kk = kit(); kk.box(M.black, 0.05, 1.19, 2.07, 6.08, 1.95, 10.6); kk.flush(G, false); }
  let tvAt = 0, page = 0;
  W.fxs.push((dt) => {
    tvAt -= dt;
    if (tvAt > 0 || !ctx.state?.live) return;
    tvAt = 10; page++;
    const scr = { ctx: tv.ctx, W: tv.W, H: tv.H, tex: tv.tex };
    tv.ctx.fillStyle = '#16171a'; tv.ctx.fillRect(0, 0, tv.W, tv.H);
    try { (page % 2 ? drawRoster : drawUsage)(scr, ctx.state); } catch { /* a board that can't draw yet stays dark */ }
    tv.tex.needsUpdate = true;
  });
  W.leaves.push(() => { tvAt = 0; });
}
