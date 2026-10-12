// The way into the grid (floors/grid.js) from the restricted level (floors/restricted.js), as it is in the reference: a
// bookcase stands flush against a wall. Click it and you drag it out, heavily, scraping: it swings out on its corner and
// drags clear, and the stretch of wall it hid is wrong: flat, too clean, unlit, faintly ruled like graph paper (click it
// again and it goes back, never onto you: it stops short). Squeeze in behind the bookcase and walk at it, and it gives: it dissolves from the middle out,
// a bright blue crackling edge where it meets the wall, onto the grid's black and green, live (systems/portal.js), and
// you walk through. From the grid the doorway hangs in the void, a blue fizz round its edge, B3 through it drawn flat
// and inked like a cartoon (fading to B3 as it is as you come up to it, so nothing jumps as you cross). It's always in
// the same place (found from B3's fixed layout, as findExit is), a fair walk from the lift, away from the other doors.
// Near the threshold the two floors' exposure, bloom and grade meet halfway, and each side is heard through the other.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, EYE, lerp, makeCanvas, rng, sstep } from '../util.js';
import { makePortal } from '../systems/portal.js';
import { findExit } from './world-edge-backstage.js';

export const DOOR = { w: 1.0, h: 2.1, PO: 0.006, PANEL: 0.012, PH: 2.16, SLOT: 0.95, CASE: 0.38, CW: 1.7, SHUT: [-0.85, 0.03], PIV: [-1.3, 0.62], TURN: -0.5 };
// the opening; the pane and the panel off the wall, the panel's height; the bookcase (its back-left corner at SHUT,
// flush against the wall; pulled out, at PIV, the other end out from the wall by TURN)

// ----- where it is: a cell 10-18 cells' walk from the lift (and 25 m from it as the crow flies) with a solid wall to stand the bookcase by, an open side for
// the gap behind it, two cells of room in front, nothing else in it, and well away from the other doors. -----
let at = null;
export function findGridDoor(restr) {
  if (at) return at;
  const G = restr.grid, key = (i, j) => `${i},${j}`, ex = findExit(restr).spot, home = restr.paths.home;
  const ways = (i, j) => [[i - 1, j, G.edgeType('v', i, j), 'w'], [i + 1, j, G.edgeType('v', i + 1, j), 'e'], [i, j - 1, G.edgeType('h', i, j), 's'], [i, j + 1, G.edgeType('h', i, j + 1), 'n']];
  const OPP = { w: 'e', e: 'w', s: 'n', n: 's' }, SIDES = { w: ['s', 'n'], e: ['s', 'n'], s: ['w', 'e'], n: ['w', 'e'] }, STEP = { w: [-1, 0], e: [1, 0], s: [0, -1], n: [0, 1] };
  const quiet = (i, j) => G.cellOk(i, j) && G.h3(i, j, 10) >= 0.03 && !(j === 0 && i >= -3 && i <= -1) && !restr.reserved?.has(key(i, j));
  const edge = (i, j, w) => ways(i, j).find((x) => x[3] === w)[2];
  const dist = new Map([[key(-1, 0), 0]]), q = [[-1, 0]];
  let spot = null;
  for (let h = 0; h < q.length && !spot; h++) {
    const [i, j] = q[h], d = dist.get(key(i, j));
    if (d >= 10 && d <= 18 && Math.hypot(i + 1, j) >= 8 && quiet(i, j) && Math.hypot(i - home.i, j - home.j) >= 6 && Math.hypot(i - ex.i, j - ex.j) >= 8) {
      for (const w of ['w', 'e', 's', 'n']) {
        const [bi, bj] = [i + STEP[w][0], j + STEP[w][1]], o = OPP[w], [fi, fj] = [i + STEP[o][0], j + STEP[o][1]];
        if (edge(i, j, w) !== G.SOLID || !G.cellOk(bi, bj) || edge(i, j, o) === G.SOLID || !quiet(fi, fj) || edge(fi, fj, o) === G.SOLID) continue;
        if (SIDES[w].every((s) => edge(i, j, s) === G.SOLID)) continue;
        spot = { i, j, side: w, back: [bi, bj], d }; break;
      }
    }
    for (const [ni, nj, t] of ways(i, j)) if (t !== G.SOLID && G.cellOk(ni, nj) && !dist.has(key(ni, nj))) { dist.set(key(ni, nj), d + 1); q.push([ni, nj]); }
  }
  spot ||= { i: -8, j: 2, side: 'n', back: [-8, 3], d: 12 };   // (never: the layout has one)
  const cx = G.X(spot.i) + G.C / 2, cz = G.Z(spot.j) + G.C / 2, H2 = G.C / 2 - G.T / 2;
  // the wall's face at the middle of that side (B3's own space, the car at z = 0), and the way out of it into the room
  const [X, Z, YAW] = { w: [cx - H2, cz, Math.PI / 2], e: [cx + H2, cz, -Math.PI / 2], s: [cx, cz - H2, 0], n: [cx, cz + H2, Math.PI] }[spot.side];
  return (at = { spot, X, Z, YAW });
}

/** @param {any} ctx @param {any} grid the floor @param {any} W its world (grid-world.js) @param {any} sound grid-sound.js's */
export function installDoor(ctx, grid, W, sound) {
  const restr = ctx.restr, { X, Z, YAW } = findGridDoor(restr), { T } = restr.grid, { w: DW, h: DH, PO } = DOOR;
  const camera = ctx.camera, R = rng(734);

  // ----- B3's side: the bookcase, the wall that's wrong -----
  const g = new THREE.Group(); g.position.set(X, 0, Z); g.rotation.y = YAW; restr.root.add(g);
  const caseG = new THREE.Group(); g.add(caseG);
  {   // the bookcase, its back to the wall: painted blue-violet, its books in colour order
    const parts = [], col = (c) => new THREE.Color(c);
    const b = (w, h, d, x, y, z, c) => { const geo = new THREE.BoxGeometry(w, h, d).translate(x, y, z), cc = col(c);
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).map((_, k) => [cc.r, cc.g, cc.b][k % 3]), 3)); geo.deleteAttribute('uv'); parts.push(geo); };
    const z0 = DOOR.SLOT, z1 = DOOR.SLOT + DOOR.CASE, zc = (z0 + z1) / 2, hw = DOOR.CW / 2, H = 2.2, PAINT = '#4d4f96';
    for (const s of [-1, 1]) b(0.04, H, DOOR.CASE, s * (hw - 0.02), H / 2, zc, PAINT);
    b(DOOR.CW - 0.08, 0.03, DOOR.CASE, 0, H - 0.015, zc, PAINT);
    b(DOOR.CW - 0.08, H - 0.03, 0.015, 0, (H - 0.03) / 2, z0 + 0.0075, '#3d3f7c');
    b(DOOR.CW - 0.08, 0.08, DOOR.CASE - 0.03, 0, 0.04, zc + 0.0075 - 0.008, PAINT);
    const shelves = [0.08, 0.5, 0.92, 1.34, 1.76];
    for (const y of shelves.slice(1)) b(DOOR.CW - 0.08, 0.025, DOOR.CASE - 0.015, 0, y + 0.0125, zc + 0.0075, PAINT);
    const books = [];
    shelves.forEach((y0, s) => {
      const top = (shelves[s + 1] ?? H - 0.03) - (s < shelves.length - 1 ? 0 : 0), room = top - y0 - (s ? 0.025 : 0);
      for (let x = -hw + 0.05; x < hw - 0.08;) {
        const w = 0.025 + R() * 0.03, h = Math.min(room - 0.04, 0.22 + R() * 0.14), d = 0.2 + R() * 0.07;
        books.push({ w, h, d, x: x + w / 2, y: y0 + (s ? 0.025 : 0) + h / 2, z: z0 + 0.015 + 0.01 + d / 2, hue: R() });
        x += w + 0.003;
      }
    });
    const hues = books.map((k) => k.hue).sort((a, c) => a - c);   // in colour order, shelf by shelf
    books.forEach((k, n) => b(k.w, k.h, k.d, k.x, k.y, k.z, `hsl(${Math.round(hues[n] * 330)}, 42%, ${30 + (n % 3) * 6}%)`));
    const m = new THREE.Mesh(mergeGeometries(parts).translate(hw, 0, -z0), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    m.castShadow = m.receiveShadow = true; caseG.add(m);
  }
  const caseHit = ctx.hitBox(caseG, DOOR.CW, 2.2, DOOR.CASE, DOOR.CW / 2, 1.1, DOOR.CASE / 2, { action: 'gridcase', reach: 3 });
  // Where it stands, c (0 against the wall, 1 pulled out): swung out on its back corner first, then dragged clear.
  const pose = (c) => ({ x: lerp(DOOR.SHUT[0], DOOR.PIV[0], sstep(0.2, 1, c)), z: lerp(DOOR.SHUT[1], DOOR.PIV[1], sstep(0.2, 1, c)), a: DOOR.TURN * sstep(0, 0.7, c) });
  const place = (c) => { const P = pose(c); caseG.position.set(P.x, 0, P.z); caseG.rotation.y = P.a; };
  // as boxes on the floor (in the doorway's frame): four squares along it
  const caseCols = (c) => { const P = pose(c), along = [Math.cos(P.a), -Math.sin(P.a)], out = [Math.sin(P.a), Math.cos(P.a)];
    return [0.125, 0.375, 0.625, 0.875].map((k) => {
      const x = P.x + along[0] * k * DOOR.CW + out[0] * DOOR.CASE / 2, z = P.z + along[1] * k * DOOR.CW + out[1] * DOOR.CASE / 2;
      return [x - 0.24, x + 0.24, z - 0.24, z + 0.24];
    }); };
  // whether (x, z) (the doorway's frame) is within r of it at c
  const onIt = (c, x, z, r) => { const P = pose(c), dx = x - P.x, dz = z - P.z, co = Math.cos(P.a), si = Math.sin(P.a);
    const lx = dx * co - dz * si, lz = dx * si + dz * co;
    return lx > -r && lx < DOOR.CW + r && lz > -r && lz < DOOR.CASE + r; };
  // The wrong wall: the wallpaper's colour, flat and unlit, no pattern, no damp, ruled faintly every 20 cm; it dissolves
  // (open, 0 to 1) from the middle out, a blue crackling edge where it's going.
  const RH = Math.round(256 * DOOR.PH / 1.5), ruled = makeCanvas(256, RH), rc = ruled.ctx;
  rc.fillStyle = '#7d6d34'; rc.fillRect(0, 0, 256, RH);
  rc.strokeStyle = 'rgba(70,62,28,.35)'; rc.lineWidth = 1;
  for (let x = 0; x <= 256; x += 256 / 7.5) { rc.beginPath(); rc.moveTo(x, 0); rc.lineTo(x, RH); rc.stroke(); }
  for (let y = RH; y >= 0; y -= 256 / 7.5) { rc.beginPath(); rc.moveTo(0, y); rc.lineTo(256, y); rc.stroke(); }
  ruled.tex.needsUpdate = true;
  const PU = { open: { value: 0 }, t: { value: 0 } };
  const panelM = new THREE.MeshBasicMaterial({ map: ruled.tex, transparent: true });
  panelM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, PU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPl;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPl = position.xy;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vPl; uniform float open, t;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float nn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec2 p = vPl - vec2(0.0, ${(DH / 2 - DOOR.PH / 2).toFixed(3)}), qq = abs(p) / vec2(${(DW / 2).toFixed(3)}, ${(DH / 2).toFixed(3)});
        float d = pow(pow(qq.x, 4.0) + pow(qq.y, 4.0), 0.25), n = nn(p * 9.0 + t * 1.7) * 0.6 + nn(p * 23.0 - t * 3.1) * 0.4 - 0.5;
        float rad = open * 1.25, e = d - rad + n * 0.14 * (1.0 - smoothstep(1.0, 1.25, rad));
        bool inside = qq.x < 1.0 && qq.y < 1.0;
        if (inside && e < 0.0) discard;
        float crack = 0.55 + 0.45 * sin(t * 37.0 + n * 40.0);
        float glow = inside && open > 0.001 ? (1.0 - smoothstep(0.0, 0.08, e)) : 0.0;
        float rim = (1.0 - smoothstep(0.0, 0.05, max(qq.x - 1.0, qq.y - 1.0))) * smoothstep(0.85, 1.0, open) * step(1.0, max(qq.x, qq.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.75, 2.6), clamp(max(glow, rim * 0.8) * crack, 0.0, 1.0));
      }`);
  };
  panelM.customProgramCacheKey = () => 'grid-panel';
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, DOOR.PH), panelM);   // (no taller than the bookcase: shut, it hides it all)
  panel.position.set(0, DOOR.PH / 2, DOOR.PANEL); panel.renderOrder = 2;
  Object.assign(panel.userData, { action: 'gridwall', reach: 3 });
  g.add(panel);

  // ----- B3's colliders and hits: the bookcase; a way through the wall (a stop well behind it, so nothing comes
  // through from the room beyond); shut till the wall's given -----
  const st = { open: 0, crossing: false, built: true, seenB3: false, drawnAt: -1e9, c: grid.caseOut ? 1 : 0, goal: grid.caseOut ? 1 : 0, vel: 0, cols: 0 };
  place(st.c);
  function local(x0, x1, z0, z1) {   // a rectangle in the doorway's frame as a box on the floor (B3's own space)
    const c = Math.cos(YAW), s = Math.sin(YAW), xs = [], zs = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { xs.push(X + x * c + z * s); zs.push(Z - x * s + z * c); }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }
  const given = () => st.open > 0.9;
  restr.extras.push({
    cols: () => [...caseCols(st.cols = st.c).map((c) => local(...c)), local(-0.62, 0.62, -0.46, -0.4),
      ...(given() ? [] : [local(-DW / 2, DW / 2, -0.1, 0.02)])],
    hits: () => [caseHit, panel],
    cut(list) {   // the wall's boxes either side of the doorway, not across it
      const gap = local(-DW / 2, DW / 2, -T - 0.05, 0.05), alongX = Math.abs(Math.cos(YAW)) > 0.5;
      gap.minZ += restr.z0; gap.maxZ += restr.z0;
      const [lo, hi, a, b2] = alongX ? ['minX', 'maxX', 'minZ', 'maxZ'] : ['minZ', 'maxZ', 'minX', 'maxX'];
      for (let k = list.length - 1; k >= 0; k--) {
        const b = list[k];
        if (b[hi] <= gap[lo] || b[lo] >= gap[hi] || b[b2] <= gap[a] || b[a] >= gap[b2]) continue;
        if (b[lo] > gap[lo] - 0.01 && b[hi] < gap[hi] + 0.01) continue;   // (not the wall: the doorway's own block, shut)
        list.splice(k, 1);
        if (b[lo] < gap[lo]) list.push({ ...b, [hi]: gap[lo] });
        if (b[hi] > gap[hi]) list.push({ ...b, [lo]: gap[hi] });
      }
    },
  });
  restr.sync();

  // ----- the grid's side: the doorway hanging there, a blue fizz round it -----
  const fizz = new THREE.Mesh(new THREE.PlaneGeometry(DW + 0.24, DH + 0.24).translate(0, DH / 2, 0), new THREE.ShaderMaterial({
    uniforms: PU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vP; uniform float t;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float nn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vP - vec2(0.0, ${(DH / 2).toFixed(3)});
        float e = max(abs(p.x) - ${(DW / 2).toFixed(3)}, abs(p.y) - ${(DH / 2).toFixed(3)});
        if (e < 0.0) discard;
        float n = nn(p * 14.0 + t * 2.3) * 0.6 + nn(p * 31.0 - t * 4.0) * 0.4;
        float a = (1.0 - smoothstep(0.0, 0.03 + 0.07 * n, e)) * (0.55 + 0.45 * sin(t * 33.0 + n * 30.0));
        gl_FragColor = vec4(vec3(0.3, 0.65, 2.2) * a, a);
      }`,
  }));
  fizz.raycast = () => {}; W.root.add(fizz);

  // ----- the frames and the portals -----
  // A doorway's frame: its sill's middle, +y up, +z through it the way you'd walk from the side it's seen from (portal.js).
  // B3's: this wall, seen from behind the bookcase (b3) or come out of (b3Out). The grid's: the doorway at its origin,
  // seen from the world (gOut: walking +z, back to B3) or come out of (gIn: walking -z, into the world).
  const flip = new THREE.Matrix4().makeRotationY(Math.PI), F = { b3: new THREE.Matrix4(), b3Out: new THREE.Matrix4(), gOut: new THREE.Matrix4(), gIn: flip.clone() };
  const frames = () => { g.updateWorldMatrix(true, false); F.b3Out.copy(g.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(0, 0, PO)); F.b3.copy(F.b3Out).multiply(flip); };
  frames();
  // Seen from the grid, B3 is drawn flat: its shading banded into a few flat tones, a touch more colour, and inked where
  // the picture changes sharply. flatK: how much (none at the threshold).
  const tone = { uniforms: { flatK: { value: 0 } }, glsl: `uniform float flatK;
    float lumi(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 tone(vec2 uv) {
      vec3 c = texture2D(tView, uv).rgb;
      if (flatK < 0.001) return c;
      vec2 px = 1.5 / res;
      float l = lumi(c), L = max(l, 1e-4);
      float gx = lumi(texture2D(tView, uv + vec2(px.x, 0.0)).rgb) - lumi(texture2D(tView, uv - vec2(px.x, 0.0)).rgb);
      float gy = lumi(texture2D(tView, uv + vec2(0.0, px.y)).rgb) - lumi(texture2D(tView, uv - vec2(0.0, px.y)).rgb);
      float ink = smoothstep(0.18, 0.4, length(vec2(gx, gy)) / max(l, 0.06));
      float band = (floor(L * 4.0 + 0.5) / 4.0);
      vec3 f = c / L * mix(L, max(band, 0.06), 0.85);
      f = mix(vec3(lumi(f)), f, 1.3);
      f = mix(f, vec3(0.04, 0.03, 0.02), ink * 0.9);
      return mix(c, f, flatK);
    }` };
  const inP = makePortal(ctx, { w: DW, h: DH, flat: true }), outP = makePortal(ctx, { w: DW, h: DH, flat: true, tone });
  restr.scene.add(inP.mesh); W.scene.add(outP.mesh);

  // Lit as it's lit from inside, for a look through: its look in full (renderFloor isn't drawing it).
  const lit = (F2) => {
    const L = F2.look;
    if (F2.hemi) { F2.hemi.intensity = L.hemi; F2.hemi.color.copy(L.sky); F2.hemi.groundColor.copy(L.ground); }
    for (const [l, k] of L.lights) l.intensity = k;
    F2.scene.environmentIntensity = L.env;
  };
  // Where the two floors' looks meet: u, how close you are to the open doorway (1 in it), takes each halfway to the other's.
  const KEYS = ['exposure', 'bloom', 'grade'], base = { b3: {}, g: {} };
  for (const k of KEYS) { base.b3[k] = restr.look[k]; base.g[k] = grid.look[k]; }
  let wasU = 0;   // (B3's look is only touched near here: the painting and the stone door blend it near theirs)
  function blend(u) {
    for (const k of KEYS) { grid.look[k] = lerp(base.g[k], base.b3[k], u / 2); if (u > 0 || wasU > 0) restr.look[k] = lerp(base.b3[k], base.g[k], u / 2); }
    wasU = u;
  }

  // ----- going through -----
  const last = new THREE.Vector3(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  let lastAway = null;
  const carry = (here, there) => {   // your camera, carried from one doorway's frame to the other's
    camera.updateMatrixWorld();
    m.copy(there).multiply(new THREE.Matrix4().copy(here).invert());
    pos.copy(camera.position).applyMatrix4(m);
    q.setFromRotationMatrix(m).multiply(camera.quaternion);
  };
  function stand() {
    eul.setFromQuaternion(q, 'YXZ');
    Object.assign(ctx.player, { x: pos.x, z: pos.z, yaw: eul.y, pitch: eul.x, eye: EYE, fy: 0, seated: false, seat: null });
    camera.position.copy(pos); camera.quaternion.copy(q); camera.updateMatrixWorld();
    last.copy(pos);
  }
  function intoGrid() {
    carry(F.b3, F.gIn);
    st.crossing = true; ctx.setFloor(grid); st.crossing = false;
    stand(); lastAway = grid;
  }
  function outToB3() {
    carry(F.gOut, F.b3Out);
    restr.arriveAt = { x: pos.x, z: pos.z - restr.z0 };   // (its rooms built round the doorway, not the lift)
    st.crossing = true; ctx.setFloor(restr); st.crossing = false;
    restr.out = 1;   // (no fading in from the car's light: you didn't come by lift)
    st.open = 1; bookcase(1); restr.sync();
    stand(); lastAway = restr;
  }

  // ----- the bookcase, dragged: it gets going slowly and slows as it comes home; going back, it stops short of you -----
  function drag(dt) {
    const want = st.goal - st.c;
    if (Math.abs(want) < 1e-4 && Math.abs(st.vel) < 1e-3) { st.c = st.goal; st.vel = 0; sound.scrape(0); return; }
    const vmax = Math.min(0.45, Math.sqrt(2 * 0.6 * Math.abs(want)) + 0.02);
    st.vel = clamp(st.vel + Math.sign(want) * 0.9 * dt, -vmax, vmax);
    let c = clamp(st.c + st.vel * dt, 0, 1);
    if ((st.goal - c) * Math.sign(want) <= 0) c = st.goal;
    const [px, pz] = fromB3(ctx.player.x, ctx.player.z - restr.z0);
    if (c < st.c && onIt(c, px, pz, 0.32)) {   // you're in its way: it stops there
      st.goal = st.c; st.vel = 0; sound.thud(0.5); sound.scrape(0); return;
    }
    const done = c === st.goal && st.c !== st.goal;
    st.c = c; place(c);
    if (done) { st.vel = 0; sound.thud(st.goal ? 0.6 : 1); }
    sound.scrape(done ? 0 : Math.min(1, Math.abs(st.vel) / 0.3));
    if (Math.abs(st.cols - c) > 0.01 || done) { restr.sync(); if (st.vel > 0 || done) ctx.collide(ctx.player); }   // (pulled out, it shoves you out of its way)
  }
  const fromB3 = (x, z) => { const dx = x - X, dz = z - Z, c = Math.cos(YAW), s = Math.sin(YAW); return [dx * c - dz * s, dx * s + dz * c]; };
  function pull() {   // a click: out if it's (mostly) in, back if it's (mostly) out, or the other way if it's on its way
    st.goal = Math.abs(st.vel) > 1e-3 ? (st.vel > 0 ? 0 : 1) : st.c > 0.5 ? 0 : 1;
    grid.caseOut = st.goal;
  }

  // ----- each frame on either side: the wall giving, what's through it, going through, the looks and the sound meeting -----
  const v = new THREE.Vector3(), inv = new THREE.Matrix4();
  // Where the camera is in a doorway's frame (v), and how far from the opening it is in front (Infinity behind).
  const dist = (f) => { v.copy(camera.position).applyMatrix4(inv.copy(f).invert()); return v.z > 0.05 ? Infinity : Math.hypot(Math.max(0, Math.abs(v.x) - DW / 2), Math.max(0, v.y - DH), v.z); };
  let wasGiven = false, bleed = 0, buzz = 0, seenAt = -1e9;
  function frame(dt, t) {
    const A = ctx.away, side = A === restr ? 'b3' : A === grid ? 'grid' : null;
    PU.t.value = t;
    if (side !== 'b3') inP.hide();
    if (side !== 'grid') outP.hide();
    let u = 0, hear = 0;
    if (side) {
      camera.updateMatrixWorld();
      if (lastAway !== A) { last.copy(camera.position); lastAway = A; }
      if (side === 'grid' && restr.z0 !== grid.z0) restr.view(X, Z, t, grid.z0, true);   // (B3 laid out about your car, waiting there)
      frames();
      if (side === 'b3') {
        drag(dt);
        // the wall gives as you come up to it behind the bookcase, and closes up once you've gone
        const d0 = dist(F.b3), slot = st.c > 0.98 && v.z > -1.1 && Math.abs(v.x) < DOOR.CW / 2 + 0.2;
        st.open = clamp(st.open + (slot && d0 < 1.05 ? dt / 0.6 : -dt / 1.4), 0, 1);
        g.visible = Math.hypot(ctx.player.x - g.position.x, ctx.player.z - restr.z0 - g.position.z) < 40;
        const u0 = sstep(0, 0.6, st.open);
        u = sstep(4, 0, d0) * u0; hear = 0.7 * sstep(6, 0, d0) * u0;
        const drawn = st.open > 0.002 && g.visible && inP.draw({ here: F.b3, there: F.gIn, scene: W.scene, k: grid.look.exposure / restr.look.exposure,
          prepare: () => { lit(grid); carry(F.b3, F.gIn); seen(dt, t, pos); ctx.renderer.shadowMap.needsUpdate = true; return null; } });
        if (drawn) seenAt = t;
        if (given() && inP.crossed(F.b3, last, camera.position) > 0) intoGrid();
      } else {
        const d0 = dist(F.gOut);
        tone.uniforms.flatK.value = sstep(0.4, 3.5, d0);
        u = sstep(4, 0, d0); buzz = sstep(7, 0, d0) * 0.8;
        outP.draw({ here: F.gOut, there: F.b3Out, scene: restr.scene, k: restr.look.exposure / grid.look.exposure, far: 60,
          prepare: () => { carry(F.gOut, F.b3Out); restr.view(pos.x, pos.z - grid.z0, t, grid.z0, !st.seenB3); st.seenB3 = true; lit(restr); return null; } });
        if (outP.crossed(F.gOut, last, camera.position) > 0) outToB3();
      }
      last.copy(camera.position);
    } else { lastAway = null; st.seenB3 = false; st.open = 0; }
    if (side !== 'grid') buzz = 0;
    if (given() !== wasGiven) { wasGiven = given(); if (A === restr) restr.sync(); }
    PU.open.value = st.open;
    if (side) blend(u);
    bleed = hear > bleed ? hear : Math.max(hear, bleed - dt / 2.5);
    sound.bleed(side === 'b3' ? bleed : 0); sound.buzz(buzz);
    return seenAt === t;
  }
  // The grid seen from B3 (once a frame): its things moving, the sky coming up over the first few seconds you see it.
  let seenT = -1;
  function seen(dt, t, eye) {
    if (seenT === t) return;
    seenT = t;
    grid.tick(dt, t, eye, false);
  }

  ctx.action('gridcase', {
    hover: () => {
      const back = Math.abs(st.vel) > 1e-3 ? st.vel > 0 : st.c > 0.5;
      return `<b>A bookcase</b><div class="k">${back ? 'Click to push it back' : 'Click to pull it out'}</div><div class="m">The books are in colour order.</div>`;
    },
    click: () => { pull(); return true; },
  });
  ctx.action('gridwall', { hover: () => (st.open > 0.05 ? '<b>The wall</b><div class="k">It’s giving. Walk on through</div>'
    : '<b>The wall</b><div class="k">Too clean. Flat, like it’s painted on. Faint lines in it, like graph paper.</div>') });

  return {
    st, F, g, panel, inP, outP, frame, local,
    // the doorway's frame on B3 to B3's space: (x along the wall, z out from it) → [x, z] (B3's own, the car at z = 0)
    toB3: (x, z) => [X + x * Math.cos(YAW) + z * Math.sin(YAW), Z - x * Math.sin(YAW) + z * Math.cos(YAW)], YAW,
    open(v2 = 1) { st.open = v2; PU.open.value = v2; wasGiven = !given(); },
    bookcase,
  };
  // Straight to c (0 against the wall, 1 pulled out), no dragging.
  function bookcase(c = 1) {
    st.c = st.goal = clamp(+c, 0, 1); st.vel = 0; place(st.c); grid.caseOut = st.c > 0.5 ? 1 : 0;
    sound.scrape(0); restr.sync();
  }
}
