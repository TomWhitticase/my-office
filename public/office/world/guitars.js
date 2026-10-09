// The guitar corner in your office, under the task board: a cherry Les Paul, a dark blue Strat and a copper-taped HSS Strat on
// stands, and a practice amp plugged into the copper one.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, lerp, makeCanvas, mat, mergedBoxes, rng, solid } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { world } = ctx;

  // Guitar corner, under the task board: a cherry Les Paul, a dark blue Strat (maroon tortoise guard, gold hardware, maple board) and an
  // HSS Strat wrapped in copper tape (black guard, rosewood board), each on a stand, and a little practice amp plugged into the
  // copper one. Bodies are extruded outlines, fretboards one canvas each; small hardware is merged per guitar.
  {
    const UPV = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const add = (parent, geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
    const rodGeo = (a, b, r, seg = 6) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      return new THREE.CylinderGeometry(r, r, len,
        seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, d.normalize())).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    };
    // axis along z, from z0 up
    const czGeo = (r, h, x, y, z0, seg = 16, r2 = r) => new THREE.CylinderGeometry(r, r2, h, seg).rotateX(Math.PI / 2).translate(x, y, z0 + h / 2);
    const bGeo = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const merged = (parent, list, m) => list.length && add(parent, mergeGeometries(list), m);
    // Closed smooth outline through points; optional scale about (0, cy).
    const outline = (pts, k = 1, cy = 0) => {
      const v = pts.map(([x, y]) => new THREE.Vector2(x * k, (y - cy) * k + cy)), s = new THREE.Shape();
      s.moveTo(v[0].x, v[0].y);
      if (pts.length > 40) v.slice(1).forEach((p) => s.lineTo(p.x, p.y)); else s.splineThru([...v.slice(1), v[0]]);   // traced outlines are dense already
      return s;
    };
    const rrect = (hw, hh, r) => {
      const s = new THREE.Shape();
      s.moveTo(-hw + r, -hh); s.lineTo(hw - r, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + r); s.lineTo(hw, hh - r); s.quadraticCurveTo(hw, hh, hw - r, hh);
      s.lineTo(-hw + r, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - r); s.lineTo(-hw, -hh + r); s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
      return s;
    };
    const slab = (shape, z0, depth, bevel = 0, curve = 6) =>
      new THREE.ExtrudeGeometry(shape,
      { depth, curveSegments: curve, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 }).translate(0, 0, z0);
    const tex = (t, rx, ry, ox = 0.5, oy = 0) =>
      { t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(rx, ry); t.tex.offset.set(ox, oy); t.tex.needsUpdate = true; return t.tex; };

    // Copper tape: strips laid across the body, each a slightly different tone, overlapping at darker seams; creases from
    // smoothing it round the curves, and tarnish. A matching roughness map keeps the tape shiny and the seams and tarnish duller.
    const copper = (() => {
      const W = 512, H = 704, m = makeCanvas(W, H), r = makeCanvas(W, H), c = m.ctx, q = r.ctx, R = rng(808);
      c.fillStyle = '#d0915c'; c.fillRect(0, 0, W, H); q.fillStyle = 'rgb(0,64,0)'; q.fillRect(0, 0, W, H);
      // Strips run diagonally (lower bass to upper treble): draw them in a rotated frame big enough to cover the canvas.
      const D = Math.hypot(W, H) / 2 + 30;
      for (const ctx of [c, q]) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.68); }
      for (let y = -D; y < D;) {
        const sh = 58 + R() * 36, tilt = (R() - 0.5) * 12, edge = (yy) => { c.beginPath(); c.moveTo(-D, yy); c.lineTo(D, yy + tilt); };
        c.fillStyle = `hsl(${22 + R() * 7} ${50 + R() * 14}% ${54 + R() * 11}%)`;
        c.beginPath(); c.moveTo(-D, y); c.lineTo(D, y + tilt); c.lineTo(D, y + tilt + sh); c.lineTo(-D, y + sh); c.closePath(); c.fill();
        const g = c.createLinearGradient(0, y, 0, y + sh);
        g.addColorStop(0, 'rgba(255,222,185,.2)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,20,0,.2)');
        c.fillStyle = g; c.fill();
        c.strokeStyle = 'rgba(80,36,12,.5)'; c.lineWidth = 2.5; edge(y + sh); c.stroke();
        c.strokeStyle = 'rgba(255,225,190,.45)'; c.lineWidth = 1; edge(y + sh - 2.5); c.stroke();
        q.strokeStyle = 'rgb(0,150,0)'; q.lineWidth = 4; q.beginPath(); q.moveTo(-D, y + sh); q.lineTo(D, y + tilt + sh); q.stroke();
        y += sh - 4;
      }
      for (const ctx of [c, q]) ctx.restore();
      for (let i = 0; i < 320; i++) {
        const x = R() * W, y = R() * H, a = R() * Math.PI, l = 5 + R() * 30, x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
        c.strokeStyle = R() < 0.5 ? 'rgba(255,226,190,.3)' : 'rgba(60,25,8,.32)'; c.lineWidth = 0.8 + R() * 1.2;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x1, y1); c.stroke();
        q.strokeStyle = 'rgb(0,125,0)'; q.lineWidth = 2; q.beginPath(); q.moveTo(x, y); q.lineTo(x1, y1); q.stroke();
      }
      for (let i = 0; i < 80; i++) {
        const x = R() * W, y = R() * H, rad = 8 + R() * 42, green = R() < 0.12;
        for (const [ctx, col, a] of [[c, green ? '70,125,95' : '70,32,10', green ? 0.3 : 0.24], [q, '0,205,0', 0.55]]) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      }
      r.tex.colorSpace = THREE.NoColorSpace;
      return new THREE.MeshStandardMaterial({ map: tex(m, 1 / 0.34, 1 / 0.46), roughnessMap: tex(r, 1 / 0.34, 1 / 0.46), metalness: 1, roughness: 1,
        envMapIntensity: 1.4 });
    })();
    // Dark blue stain over ash, grain showing through; and a cherry finish over flamed maple. Both under a clear coat.
    const woodBody = (base, dark, light, seed, flame) => {
      const W = 512, H = 704, t = makeCanvas(W, H), c = t.ctx, R = rng(seed);
      c.fillStyle = base; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 110; i++) {
        const x0 = R() * W, amp = 3 + R() * 9, f = 0.004 + R() * 0.01, ph = R() * 6;
        c.strokeStyle = R() < 0.6 ? dark : light; c.globalAlpha = 0.2 + R() * 0.35; c.lineWidth = 0.6 + R() * 2.4;
        c.beginPath(); for (let y = 0; y <= H; y += 16) c.lineTo(x0 + Math.sin(y * f + ph) * amp, y); c.stroke();
      }
      c.globalAlpha = 0.28; c.strokeStyle = dark; c.lineWidth = 2;   // cathedral figure
      for (let k = 0; k < 7; k++) { c.beginPath(); c.ellipse(W / 2 + 20, H * 0.62, 30 + k * 26, 110 + k * 40, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); }
      if (flame) for (let y = 0; y < H; y += 5 + R() * 9) {
        c.globalAlpha = 0.1 + R() * 0.16; c.strokeStyle = R() < 0.5 ? light : dark; c.lineWidth = 3 + R() * 6;
        c.beginPath(); for (let x = 0; x <= W; x += 16) c.lineTo(x, y + Math.sin(x * 0.03 + y) * 4); c.stroke();
      }
      c.globalAlpha = 1;
      return new THREE.MeshPhysicalMaterial({ map: tex(t, 1 / 0.34, 1 / 0.46), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 });
    };
    const blueM = woodBody('#15275a', '#0a1430', '#2c4c8f', 41, false), cherryM = woodBody('#8c0b16', '#4a0208', '#c62233', 43, true);
    const tortM = (() => {
      const t = makeCanvas(256, 256), c = t.ctx, R = rng(47);
      c.fillStyle = '#5e1612'; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 170; i++) {
        const x = R() * 256, y = R() * 256, rad = 6 + R() * 30,
          [col, a] = [['30,6,6', 0.7], ['120,32,20', 0.55], ['176,74,38', 0.45], ['70,12,10', 0.6]][Math.floor(R() * 4)];
        const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      return new THREE.MeshPhysicalMaterial({ map: tex(t, 1 / 0.13, 1 / 0.13), roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.1 });
    })();
    // Fretboard: wood grain, nickel frets at the real spacing, dot (or trapezoid) inlays. Mapped in metres along the board.
    function boardTex(rose, trap, S, Ny, E) {
      const W = 128, H = 1024, t = makeCanvas(W, H), c = t.ctx, R = rng(rose ? 31 : 37), L = Ny - E;
      c.fillStyle = rose ? '#3a2216' : '#d4ad72'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) {
        const x = R() * W;
        c.strokeStyle = rose ? (R() < 0.5 ? 'rgba(14,7,3,.45)' : 'rgba(95,58,36,.4)') : `rgba(150,104,52,${0.12 + R() * 0.22})`; c.lineWidth = 0.5 + R() * 1.6;
        c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + R() * 6 - 3, H * 0.3, x + R() * 6 - 3, H * 0.7, x + R() * 4 - 2, H); c.stroke();
      }
      const fret = (n) => Ny - S * (1 - 2 ** (-n / 12)), py = (y) => (1 - (y - E) / L) * H, px = (x) => (x / 0.06 + 0.5) * W;
      for (let n = 1; n <= 22; n++) { const y = py(fret(n)); c.fillStyle = '#dcdde0'; c.fillRect(0, y - 1.6, W, 3.2); c.fillStyle = 'rgba(0,0,0,.4)';
        c.fillRect(0, y + 1.6, W, 1); }
      c.fillStyle = rose ? '#efe9dc' : '#1a1a1a';
      for (const n of [3, 5, 7, 9, 12, 15, 17, 19, 21]) {
        const y = py((fret(n - 1) + fret(n)) / 2), hh = Math.abs(py(fret(n - 1)) - py(fret(n))) * 0.3, hw = 0.017 + n * 0.00025;
        if (trap) { c.beginPath(); c.moveTo(px(-hw * 0.82), y - hh); c.lineTo(px(hw * 0.82), y - hh); c.lineTo(px(hw), y + hh); c.lineTo(px(-hw), y + hh);
          c.fill(); }
        else for (const dx of n === 12 ? [-0.011, 0.011] : [0]) { c.beginPath(); c.arc(px(dx), y, 6, 0, Math.PI * 2); c.fill(); }
      }
      return new THREE.MeshStandardMaterial({ map: tex(t, 1 / 0.06, 1 / L, 0.5, -E / L), roughness: rose ? 0.75 : 0.35 });
    }

    const chromeM = mat('#eceef0', { metalness: 1, roughness: 0.15 }), goldM = mat('#e2b85c', { metalness: 1, roughness: 0.22 }),
      steelM = mat('#8f9297', { metalness: 1, roughness: 0.35 });
    const blackM = mat('#111111', { roughness: 0.3 }), ivoryM = mat('#ece2c4', { roughness: 0.4 }), stringM = mat('#d7d9dc', { metalness: 1, roughness: 0.3 });
    // Body outlines traced from full-size templates (cho2/guitar-shape, CC BY-SA 4.0), in mm: butt end at y 0, neck centreline x 0,
    // bass side -x. Strat 457 x 321 mm, neck pocket edge 396 mm up; Les Paul 438 x 331 mm (waist 186, upper bout 234), neck joint 438 up.
    const mm = (t) => t.split(/\s+/).map((p) => p.split(',').map((v) => v / 1000));
    const STRAT = mm(`-125,228 -130,217 -134,207 -138,197 -143,186 -146,175 -150,164 -153,154 -156,143 -158,132 -160,120 -162,109 -162,97 -162,85 -160,73 -157,62
      -152,52 -146,43 -138,34 -129,26 -120,19 -110,14 -100,10 -89,6 -78,4 -66,2 -54,1 -42,0 -30,0 -18,0 -6,0 7,0 19,0 32,0 44,0 56,1 68,2 79,4
      90,7 101,11 111,16 121,22 130,29 138,38 145,47 150,57 154,68 156,80 158,91 158,103 157,115 155,127 152,138 149,149 145,160 142,170 137,180
      133,191 128,201 124,211 119,221 115,232 112,243 112,255 114,266 117,277 121,288 125,298 130,308 133,319 136,331 137,342 137,354 136,366
      132,376 127,386 117,393 106,392 98,384 95,373 92,362 88,351 81,342 71,336 60,333 48,334 37,338 28,344 27,356 27,368 27,380 27,392 18,397
      6,397 -7,397 -19,397 -29,393 -35,383 -45,378 -57,378 -67,382 -77,389 -84,398 -89,409 -91,420 -92,432 -93,444 -99,453 -109,457 -120,453
      -128,445 -134,435 -137,424 -140,413 -140,401 -140,389 -140,377 -138,366 -136,354 -133,343 -130,332 -126,322 -122,311 -119,300 -116,289
      -115,277 -115,265 -116,254 -120,243 -123,232`);
    const LP = mm(`29,438 17,438 5,438 -8,438 -20,438 -32,438 -44,436 -56,434 -68,431 -79,426 -89,420 -98,412 -106,403 -112,393 -116,381 -118,370 -117,358
      -114,346 -109,334 -104,324 -98,312 -94,301 -92,289 -93,277 -98,266 -105,256 -112,247 -120,238 -128,229 -135,220 -142,210 -148,199 -153,188
      -158,177 -160,165 -162,154 -163,141 -163,129 -162,117 -160,105 -156,94 -152,82 -147,71 -141,61 -134,52 -126,43 -117,35 -107,28 -97,21 -86,16
      -75,10 -63,6 -52,4 -40,2 -28,1 -16,0 -4,0 9,0 21,0 33,1 45,2 57,5 68,8 80,12 91,16 102,22 112,29 121,36 130,44 138,53 146,62 152,72 157,83
      161,95 165,106 167,118 168,130 168,142 166,155 164,166 161,178 157,189 152,200 145,211 138,221 131,230 123,239 115,248 107,257 100,266
      94,277 92,289 94,301 98,312 103,323 109,334 113,345 117,357 118,369 117,381 111,391 100,392 93,382 85,373 74,368 62,366 50,369 40,375 34,385
      31,396 30,408 29,421 29,433`);
    // Strat scratchplate: 9 mm in from the treble edge and cutaways, part way up the treble horn, clear of the bass horn,
    // ~25 mm in down the bass side, across just above the bridge, and a lobe down round the controls.
    const PG = mm(`148,108 147,119 145,130 142,141 139,152 135,162 131,172 127,182 122,192 118,202 113,212 108,223 106,229 104,235 103,242 103,249 103,255
      104,262 105,268 106,274 110,286 115,296 119,306 123,316 126,327 128,338 128,348 128,358 126,368 104,371 103,365 101,358 98,353 96,347 92,341
      87,336 81,331 74,328 68,325 61,324 53,324 46,325 39,327 33,329 30,360 -30,360 -29,376 -36,372 -43,369 -51,369 -58,370 -65,372 -72,374
      -109,333 -103,324 -100,319 -97,312 -95,307 -93,301 -92,294 -90,286 -90,279 -89,271 -90,264 -90,256 -92,248 -94,242 -96,235 -98,229 -100,222
      -105,212 -103,215 -92,197 -75,179 -52,170 -20,168 20,168 50,167 68,146 82,124 96,103 112,93 130,94`);
    // Les Paul's raised guard: a narrow teardrop from under the cutaway down beside the bridge pickup.
    const LPG = mm(`44,355 52,357 62,358 72,361 82,366 90,372 97,374 102,366 103,350 100,330 90,305 83,280 75,255 66,235 56,228 49,238 45,265 44,310`);
    const SHEAD = [[-0.0215, 0], [-0.026, 0.04], [-0.03, 0.1], [-0.034, 0.15], [-0.036, 0.175], [-0.028, 0.192], [-0.008, 0.196], [0.018, 0.19], [0.042, 0.178],
      [0.052, 0.162], [0.045, 0.148], [0.026, 0.13], [0.016, 0.1], [0.016, 0.05], [0.0215, 0.008]];
    const LHEAD = [[-0.0215, 0], [-0.034, 0.05], [-0.045, 0.12], [-0.047, 0.168], [-0.038, 0.18], [-0.015, 0.176], [0, 0.168], [0.015, 0.176], [0.038, 0.18],
      [0.047, 0.168], [0.045, 0.12], [0.034, 0.05], [0.0215, 0.002]];

    // A guitar standing upright, front facing +z, bass side on the left, body bottom at y 0. Returns the group and its output jack.
    function guitar(o) {
      const g = new THREE.Group(), strat = o.kind === 'strat', S = strat ? 0.648 : 0.628, Ny = strat ? 0.785 : 0.81, By = Ny - S, FZ = strat ? 0.0225 : 0.0275;
      const E = Ny - S * (1 - 2 ** (-22 / 12)) - 0.006, wN = 0.043, wE = strat ? 0.057 : 0.056;
      const hw = [], poles = [], knobs = [], tips = [], blacks = [], strings = [];
      const xn = (i) => -0.0175 + i * 0.007, xb = (i) => -0.026 + i * 0.0104, xAt = (i, y) => lerp(xb(i), xn(i), (y - By) / (Ny - By));
      // Body and scratchplate.
      if (strat) {
        add(g, slab(outline(STRAT), -0.0165, 0.033, 0.006), o.body);
        add(g, slab(outline(PG), FZ, 0.0025), o.guard);
      } else {
        add(g, slab(outline(LP), -0.022, 0.04, 0.0015), o.body);
        add(g, slab(outline(LP), 0.0195, 0.004), [o.body, ivoryM]);                 // cream binding round the top
        add(g, slab(outline(LP, 0.86, 0.21), 0.0175, 0.002, 0.008), o.body);          // the carved top's arch
        add(g, slab(outline(LPG), FZ + 0.006, 0.0018), ivoryM);                      // raised pickguard
        hw.push(bGeo(0.004, 0.006, 0.006, 0.098, 0.363, FZ + 0.006));
      }
      // Neck, fretboard (bound on the Les Paul), nut.
      const n0 = strat ? 0.3 : 0.33;
      add(g, new THREE.CylinderGeometry(0.0215, 0.028, Ny - n0, 18, 1, false, Math.PI / 2, Math.PI).scale(1, 1, 0.85).translate(0, (Ny + n0) / 2, FZ), o.neck);
      const fb = new THREE.Shape([V(-wE / 2, E), V(wE / 2, E), V(wN / 2, Ny), V(-wN / 2, Ny)].map((p) => new THREE.Vector2(p.x, p.y)));
      add(g, slab(fb, FZ, 0.006),
        [boardTex(o.board === 'rose', !strat, S, Ny, E), strat ? mat(o.board === 'rose' ? '#3a2216' : '#e0bd84', { roughness: 0.5 }) : ivoryM]);
      add(g, bGeo(wN, 0.005, 0.009, 0, Ny - 0.0025, FZ + 0.0045), ivoryM);
      // Headstock: Strat flat, six in a line on the bass side; Les Paul angled back, three a side.
      const hsM = new THREE.Matrix4().makeRotationX(strat ? 0 : -0.24).setPosition(0, Ny, FZ - (strat ? 0 : 0.002));
      add(g, slab(outline(strat ? SHEAD : LHEAD), -0.013, 0.013, 0.0015).applyMatrix4(hsM), strat ? o.neck : [blackM, o.neck]);
      const posts = strat ? [0, 1, 2, 3, 4, 5].map((i) => [-0.014 - i * 0.0016, 0.045 + i * 0.025, -1])
        : [[-0.028, 0.06, -1], [-0.032, 0.095, -1], [-0.035, 0.13, -1], [0.035, 0.13, 1], [0.032, 0.095, 1], [0.028, 0.06, 1]];
      const keys = [];
      for (const [px, py, side] of posts) {
        const hsList = [czGeo(0.0034, 0.012, px, py, 0), czGeo(0.0052, 0.0015, px, py, 0), bGeo(0.014, 0.016, 0.011, px + side * 0.004, py, -0.0205)];
        const out = strat ? -0.058 : side * 0.07;
        hsList.push(rodGeo(V(px + side * 0.011, py, -0.0185), V(out - side * 0.004, py, -0.0185), 0.0015));
        for (const h of hsList) hw.push(h.applyMatrix4(hsM));
        keys.push(new THREE.CylinderGeometry(0.0085, 0.0085, 0.004, 16).scale(1, 1, 0.7).translate(out, py, -0.0185).applyMatrix4(hsM));
      }
      if (!strat) {   // bell truss rod cover
        add(g, slab(rrect(0.011, 0.016, 0.006), 0.0005, 0.0012).translate(0, 0.03, 0).applyMatrix4(hsM), ivoryM);
        add(g, slab(rrect(0.0095, 0.0145, 0.005), 0.0012, 0.0012).translate(0, 0.03, 0).applyMatrix4(hsM), blackM);
      }
      // Pickups: chrome or plastic covers with a row of pole pieces each.
      const top = FZ + (strat ? 0.0025 : 0.003);
      const pickup = (kind, y, ang) => {
        const hb = kind === 'H', geo = slab(hb ? rrect(0.034, 0.018, 0.004) : rrect(0.0405, 0.0082, 0.0078), top + 0.001, 0.005, 0.001, 4);
        add(g, geo.rotateZ(ang).translate(0, y, 0), o.cover);
        for (let i = 0; i < 6; i++) {
          const xp = xAt(i, y), oy = hb ? 0.0075 : 0;
          poles.push(czGeo(hb ? 0.0022 : 0.0025, 0.001, xp * Math.cos(ang) - oy * Math.sin(ang), y + xp * Math.sin(ang) + oy * Math.cos(ang), top + 0.007));
        }
      };
      if (strat) {
        o.pickups.forEach((k, i) => pickup(k, By + [0.166, 0.105, 0.048][i], i < 2 ? 0 : k === 'H' ? -0.05 : -0.17));
        // Bridge: a vintage trem (plate, six saddles, the arm swung out to the treble side), or a hardtail: a heavier plate
        // with a raised back lip, strings through the body, no arm.
        if (o.hardtail) {
          hw.push(bGeo(0.07, 0.05, 0.004, 0, By - 0.006, FZ + 0.002), bGeo(0.07, 0.006, 0.012, 0, By - 0.028, FZ + 0.006));
          for (let i = 0; i < 6; i++) hw.push(bGeo(0.0092, 0.02, 0.009, xb(i), By - 0.002, FZ + 0.0085));
        } else {
          hw.push(bGeo(0.072, 0.042, 0.003, 0, By - 0.004, FZ + 0.0015));
          for (let i = 0; i < 6; i++) hw.push(bGeo(0.0092, 0.02, 0.01, xb(i), By - 0.004, FZ + 0.0075));
          hw.push(rodGeo(V(0.031, By - 0.02, FZ + 0.003), V(0.033, By - 0.022, FZ + 0.03), 0.0018),
            rodGeo(V(0.033, By - 0.022, FZ + 0.03), V(0.085, By - 0.145, FZ + 0.042), 0.0018));
          tips.push(rodGeo(V(0.075, By - 0.12, FZ + 0.0395), V(0.087, By - 0.15, FZ + 0.0425), 0.0035, 10));
        }
        for (const [x, y] of [[0.068, 0.176], [0.094, 0.152], [0.115, 0.124]]) knobs.push(czGeo(0.0105, 0.016, x, y, top, 20, 0.0118));
        hw.push(rodGeo(V(0.085, 0.218, top), V(0.088, 0.214, top + 0.014), 0.0012));
        tips.push(czGeo(0.003, 0.008, 0.088, 0.214, top + 0.012, 10));
        hw.push(new THREE.CylinderGeometry(0.0115, 0.0115, 0.003, 20).rotateX(Math.PI / 2).scale(1.35, 1, 1).translate(0.115, 0.075, FZ + 0.0015));
        blacks.push(czGeo(0.0045, 0.001, 0.115, 0.075, FZ + 0.003));
        hw.push(new THREE.CylinderGeometry(0.005, 0.006, 0.012, 12).translate(0, -0.012, 0),
          new THREE.CylinderGeometry(0.005, 0.006, 0.012, 12).translate(-0.109, 0.462, 0));
        for (let i = 0; i < 6; i++) {   // strings: saddle to nut to post
          const r = 0.00056 - i * 0.00005, [px, py] = posts[i], p = V(px + 0.0034, py, 0.008).applyMatrix4(hsM);
          strings.push(rodGeo(V(xb(i), By - 0.003, FZ + 0.013), V(xn(i), Ny - 0.001, FZ + 0.0085), r), rodGeo(V(xn(i), Ny - 0.001, FZ + 0.0085), p, r));
        }
      } else {
        for (const y of [By + 0.138, By + 0.033]) add(g, slab(rrect(0.043, 0.025, 0.006), FZ - 0.001, 0.004).translate(0, y, 0), ivoryM);   // mounting rings
        pickup('H', By + 0.138, 0); pickup('H', By + 0.033, 0);
        // Tune-o-matic bridge on its thumbwheels, stopbar tailpiece on studs.
        hw.push(bGeo(0.082, 0.012, 0.008, 0, By, FZ + 0.009));
        for (const s of [-1, 1]) hw.push(czGeo(0.0052, 0.006, s * 0.041, By, FZ), czGeo(0.0062, 0.009, s * 0.04, By - 0.049, FZ));
        hw.push(rodGeo(V(-0.044, By - 0.049, FZ + 0.008), V(0.044, By - 0.049, FZ + 0.008), 0.0055, 12));
        for (const [x, y] of [[0.072, 0.128], [0.112, 0.148], [0.085, 0.085], [0.125, 0.104]]) knobs.push(czGeo(0.0105, 0.016, x, y, FZ, 20, 0.012),
          czGeo(0.0145, 0.003, x, y, FZ, 20));
        add(g, slab(new THREE.Shape().absarc(0, 0, 0.017, 0, Math.PI * 2), FZ - 0.001, 0.002, 0, 16).translate(-0.085, 0.39, 0), ivoryM);   // toggle ring
        hw.push(rodGeo(V(-0.085, 0.39, FZ), V(-0.087, 0.395, FZ + 0.03), 0.0014));
        tips.push(czGeo(0.0042, 0.009, -0.087, 0.395, FZ + 0.026, 10));
        hw.push(new THREE.CylinderGeometry(0.005, 0.006, 0.012, 12).translate(0, -0.012, 0));
        for (let i = 0; i < 6; i++) {   // strings: tailpiece over the bridge to nut to post
          const r = 0.00056 - i * 0.00005, [px, py] = posts[i < 3 ? i : 8 - i], p = V(px + (i < 3 ? 0.0034 : -0.0034), py, 0.008).applyMatrix4(hsM);
          const tail = V(xb(i) * 1.05, By - 0.049, FZ + 0.0135), br = V(xb(i), By, FZ + 0.0135), nut = V(xn(i), Ny - 0.001, FZ + 0.0085);
          strings.push(rodGeo(tail, br, r), rodGeo(br, nut, r), rodGeo(nut, p, r));
        }
      }
      merged(g, hw, o.hw); merged(g, poles, steelM); merged(g, knobs, o.knob); merged(g, tips, o.tip); merged(g, blacks, blackM); merged(g, keys, o.keys);
      merged(g, strings, stringM);
      return { g, jack: V(0.115, 0.075, FZ + 0.004) };
    }

    // An A-frame stand: a padded cradle under the body, a post up behind it to a yoke round the neck, three legs.
    const standM = mat('#1d1e20', { metalness: 0.6, roughness: 0.45 }), rubberM = mat('#121212', { roughness: 0.9 }), TILT = 0.21, Y0 = 0.17;
    function onStand(gu, x, z, yaw) {
      const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = yaw; world.add(root);
      gu.g.position.set(0, Y0, 0); gu.g.rotation.x = -TILT; root.add(gu.g);
      const at = (y, zz) => V(0, Y0 + y * Math.cos(TILT) + zz * Math.sin(TILT), -y * Math.sin(TILT) + zz * Math.cos(TILT)), yk = at(0.72, -0.004);
      const cy = Y0 - 0.006, metal = [], pads = [];
      for (const s of [-1, 1]) {
        pads.push(rodGeo(V(s * 0.085, cy, -0.05), V(s * 0.085, cy, 0.06), 0.008, 8), rodGeo(V(s * 0.085, cy, 0.06), V(s * 0.085, cy + 0.035, 0.066), 0.008, 8));
        metal.push(rodGeo(V(s * 0.085, cy - 0.01, 0.02), V(s * 0.19, 0.012, 0.16), 0.006, 8));
        pads.push(rodGeo(V(s * 0.03, yk.y, yk.z - 0.014), V(s * 0.03, yk.y + 0.012, yk.z + 0.03), 0.006, 8),
          new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10).translate(s * 0.19, 0.006, 0.16));
      }
      metal.push(rodGeo(V(-0.085, cy - 0.01, -0.035), V(0.085, cy - 0.01, -0.035), 0.006, 8),
        rodGeo(V(0, cy - 0.01, -0.06), V(0, yk.y - 0.008, yk.z - 0.016), 0.007, 8),
        rodGeo(V(-0.034, yk.y, yk.z - 0.016), V(0.034, yk.y, yk.z - 0.016), 0.005, 8), rodGeo(V(0, cy - 0.01, -0.06), V(0, 0.012, -0.29), 0.006, 8));
      merged(root, metal, standM); merged(root, pads, rubberM);
      add(root, new THREE.SphereGeometry(0.014, 10, 8).translate(0, 0.01, -0.29), rubberM);
      solid(x, z - 0.05, 0.46, 0.56);
      root.updateMatrixWorld(true);
      return root;
    }
    const lp = guitar({ kind: 'lp', body: cherryM, neck: mat('#5e1913', { roughness: 0.3 }), board: 'rose', hw: chromeM, cover: chromeM,
      knob: mat('#b8862e', { roughness: 0.3, metalness: 0.25 }), tip: ivoryM, keys: mat('#dfe0c4', { roughness: 0.35 }) });
    const blue = guitar({ kind: 'strat', body: blueM, guard: [tortM, ivoryM], neck: mat('#c9a066', { roughness: 0.45 }), board: 'maple',
      pickups: ['S', 'S', 'S'], hw: goldM, cover: mat('#efe6cf', { roughness: 0.45 }), knob: goldM, tip: ivoryM, keys: goldM });
    const cu = guitar({ kind: 'strat', body: copper, guard: [mat('#0d0d0d', { roughness: 0.25 }), mat('#e6e3dc')], neck: mat('#b88a52', { roughness: 0.45 }),
      board: 'rose', pickups: ['S', 'S', 'H'], hardtail: true, hw: chromeM, cover: chromeM, knob: blackM, tip: blackM, keys: chromeM });
    onStand(lp, 15.45, -14.5, 0.12); onStand(blue, 16.25, -14.5, 0); onStand(cu, 17.05, -14.5, -0.1);

    // Little practice amp: tolex, grille cloth, a chrome control strip with a red jewel light, a strap handle.
    const amp = new THREE.Group(), AX = 17.92, AZ = -14.48, AY = -0.45, AW = 0.36, AH = 0.31, AD = 0.2;
    amp.position.set(AX, 0, AZ); amp.rotation.y = AY; world.add(amp);
    box(amp, AW, AH, AD, '#1a1a1a', 0, AH / 2 + 0.012, 0, { mat: { roughness: 0.85 } });
    const grille = makeCanvas(256, 192);
    grille.ctx.fillStyle = '#b4ad9c'; grille.ctx.fillRect(0, 0, 256, 192);
    for (let i = 0; i < 256; i += 3) { grille.ctx.fillStyle = i % 6 ? 'rgba(90,84,72,.45)' : 'rgba(235,230,215,.4)'; grille.ctx.fillRect(i, 0, 1.4, 192);
      grille.ctx.fillRect(0, i, 256, 1.4); }
    grille.tex.needsUpdate = true;
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(AW - 0.04, 0.215), new THREE.MeshStandardMaterial({ map: grille.tex, roughness: 0.95 }));
    gm.position.set(0, 0.14, AD / 2 + 0.002); amp.add(gm);
    const trim = [[AW - 0.034, 0.005, 0.004, 0, 0.25, AD / 2 + 0.002], [AW - 0.034, 0.005, 0.004, 0, 0.03, AD / 2 + 0.002],
      [0.005, 0.225, 0.004, -(AW - 0.04) / 2, 0.14, AD / 2 + 0.002], [0.005, 0.225, 0.004, (AW - 0.04) / 2, 0.14, AD / 2 + 0.002]];
    amp.add(mergedBoxes(trim, ivoryM));
    box(amp, AW - 0.03, 0.045, 0.004, '#c9ccd1', 0, 0.287, AD / 2 + 0.002, { mat: { metalness: 0.9, roughness: 0.3 } });
    const ak = [];
    for (let i = 0; i < 6; i++) ak.push(czGeo(0.0085, 0.012, -0.095 + i * 0.045, 0.287, AD / 2 + 0.004, 16, 0.0095));
    merged(amp, ak, blackM);
    add(amp, czGeo(0.008, 0.004, -0.148, 0.287, AD / 2 + 0.004), chromeM); add(amp, czGeo(0.0045, 0.0005, -0.148, 0.287, AD / 2 + 0.0082), blackM);
    add(amp, new THREE.SphereGeometry(0.0065, 12, 8).translate(0.155, 0.287, AD / 2 + 0.005), mat('#ff3b1f', { emissive: '#ff2a12', emissiveIntensity: 1.6 }));
    const badge = makeCanvas(256, 64);
    badge.ctx.fillStyle = '#d9dcdf'; badge.ctx.beginPath(); badge.ctx.roundRect(0, 0, 256, 64, 12); badge.ctx.fill();
    badge.ctx.font = `italic 700 38px Georgia, serif`; badge.ctx.fillStyle = '#1c1c1e'; badge.ctx.textAlign = 'center';
    badge.ctx.fillText('Little Giant', 128, 45);
    badge.tex.needsUpdate = true;
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.0225), new THREE.MeshStandardMaterial({ map: badge.tex, metalness: 0.6, roughness: 0.35 }));
    bm.position.set(0.1, 0.06, AD / 2 + 0.004); amp.add(bm);
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) corners.push([0.03, 0.03, 0.03, sx * (AW / 2 - 0.013),
      0.012 + sy * AH + (sy ? -0.013 : 0.013), sz * (AD / 2 - 0.013)]);
    amp.add(mergedBoxes(corners, mat('#2a2b2e', { metalness: 0.8, roughness: 0.4 })));
    amp.add(mergedBoxes([[0.16, 0.012, 0.032, 0, AH + 0.024, 0], [0.02, 0.02, 0.04, -0.085, AH + 0.02, 0], [0.02, 0.02, 0.04, 0.085, AH + 0.02, 0]],
      mat('#141414', { roughness: 0.6 })));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(amp, 0.012, 0.012, 0.012, '#111', sx * (AW / 2 - 0.03), 0.006, sz * (AD / 2 - 0.03), { seg: 10 });
    solid(AX, AZ, 0.42, 0.36);
    // Lead from the amp's input, along the floor, up into the copper Strat's jack.
    amp.updateMatrixWorld(true);
    const ampJack = amp.localToWorld(V(-0.148, 0.287, AD / 2 + 0.01)), gJack = cu.g.localToWorld(cu.jack.clone());
    const out = V(Math.sin(AY), 0, Math.cos(AY)), nrm = cu.g.getWorldDirection(new THREE.Vector3());
    const pts = [ampJack, ampJack.clone().addScaledVector(out, 0.05), amp.localToWorld(V(-0.17, 0.014, AD / 2 + 0.14)),
      V(gJack.x + 0.12, 0.014, gJack.z + 0.32),
      V(gJack.x + 0.03, 0.014, gJack.z + 0.2), gJack.clone().addScaledVector(nrm, 0.09).setY(gJack.y - 0.1), gJack.clone().addScaledVector(nrm, 0.035), gJack];
    add(world, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 120, 0.0035, 6), mat('#151515', { roughness: 0.7 }));
    add(world, rodGeo(ampJack, ampJack.clone().addScaledVector(out, 0.035), 0.0055, 12), chromeM);
    add(world, rodGeo(gJack, gJack.clone().addScaledVector(nrm, 0.035), 0.0055, 12), chromeM);
  }
}
