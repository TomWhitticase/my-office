// The city outside, ~175 m below (we're on the ~48th floor): towers with lit windows at night, streets and water, the
// mountain ridge the sun sets behind (city.ridge), aircraft warning lights; its glass reflects the real sky (city.setEnv).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, makeCanvas, mat, rng, sstep } from '../util.js';

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  const { world, skyU, scene, RAD } = ctx;
  // ----- the city outside (we're on the ~48th floor, ~175 m up) -----
  const city = buildCity();
  function buildCity() {
    const GROUND = -175, R = rng(4242);
    // Facade colour, lit windows at night, and a roughness/metalness map so the glass is glossy and reflective.
    const fac = makeCanvas(512, 512), lit = makeCanvas(512, 512), rm = makeCanvas(512, 512);
    fac.ctx.fillStyle = '#9a9a96'; fac.ctx.fillRect(0, 0, 512, 512);
    lit.ctx.fillStyle = '#000'; lit.ctx.fillRect(0, 0, 512, 512);
    rm.ctx.fillStyle = 'rgb(0,235,25)'; rm.ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const x = i * 64, y = j * 64, g = fac.ctx.createLinearGradient(x, y, x + 64, y + 64);
      g.addColorStop(0, '#2c3a4a'); g.addColorStop(1, '#5f7489');
      fac.ctx.fillStyle = g; fac.ctx.fillRect(x + 9, y + 10, 46, 40);
      fac.ctx.fillStyle = 'rgba(0,0,0,.25)'; fac.ctx.fillRect(x + 9, y + 48, 46, 3);
      rm.ctx.fillStyle = 'rgb(0,40,230)'; rm.ctx.fillRect(x + 9, y + 10, 46, 40);
      if (R() < 0.42) {
        lit.ctx.globalAlpha = 0.5 + R() * 0.5;
        lit.ctx.fillStyle = ['#ffd49a', '#ffe6bf', '#fff1d6', '#cfe0ff', '#ffc27a'][Math.floor(R() * 5)];
        lit.ctx.fillRect(x + 9, y + 10, 46, 40);
      }
    }
    lit.ctx.globalAlpha = 1;
    rm.tex.colorSpace = THREE.NoColorSpace;
    for (const t of [fac.tex, lit.tex, rm.tex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }

    // A river runs north-south just west of us, and the west side is low-rise, so sunsets have a clear view.
    const riverX = (z) => -230 + 60 * Math.sin(z / 250) + 20 * Math.sin(z / 90), RIVER_W = 42;
    const bigPark = (gx, gz) => gx >= 2 && gx <= 4 && gz >= -3 && gz <= -1;
    const geos = [], av = [], trees = [], parks = [], ponds = [], boxes = [];   // boxes: each building's footprint and top, for the helicopter
    const TINTS = ['#ffffff', '#e8dccb', '#cfd8e3', '#d9d2c5', '#bfc6cc', '#f0e6d8', '#a9b4c0', '#c9b8a6'];
    const addB = (w, h, d, x, z, tintHex, uo, vo) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, GROUND + h / 2, z);
      const uv = g.attributes.uv, col = new Float32Array(uv.count * 3), tint = new THREE.Color(tintHex);
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        if (f === 2 || f === 3) uv.setXY(i, 0.003, 0.003);
        else uv.setXY(i, uv.getX(i) * (f < 2 ? d : w) / 16 + uo, uv.getY(i) * h / 24 + vo);
        col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g); boxes.push({ x, z, w, d, top: GROUND + h });
    };
    const tree = (x, z, scale = 1) => trees.push([x, z, (8 + R() * 7) * scale, (2.6 + R() * 1.9) * scale]);
    addB(40.6, -GROUND - 0.05, 30.6, 0, 0, '#d8d2c8', 0, 0);                // our own tower, below the office
    for (let gx = -12; gx <= 12; gx++) for (let gz = -12; gz <= 12; gz++) {
      const cx = gx * 70, cz = gz * 70, dist = Math.hypot(cx, cz), ring = Math.max(Math.abs(gx), Math.abs(gz));
      if ((gx === 0 && gz === 0) || dist > 880) continue;
      if (bigPark(gx, gz) || (ring >= 3 && R() < 0.1 && Math.abs(cx - riverX(cz)) > 75)) {
        parks.push([cx, cz]);
        if (R() < 0.4) ponds.push([cx + (R() - 0.5) * 20, cz + (R() - 0.5) * 20, 7 + R() * 6]);
        for (let k = 0; k < 26; k++) {
          const x = cx + (R() - 0.5) * 48, z = cz + (R() - 0.5) * 48;
          if (!ponds.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + 3)) tree(x, z);
        }
        continue;
      }
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const w = 14 + R() * 22, d = 14 + R() * 22;
        // Mid-rise next door, well below us, so the view opens over rooftops; a few towers further out top us.
        const tall = R() < 0.1 ? 120 + R() * 160 : 0;
        let h = ring === 1 ? 25 + R() * 55 : ring === 2 ? 35 + R() * 70 + (R() < 0.2 ? 25 + R() * 40 : 0) : 25 + R() * 130 * (1 - dist / 1300) + tall;
        const x = cx + (R() - 0.5) * (54 - w), z = cz + (R() - 0.5) * (54 - d);
        if (cx < -40 && Math.abs(cz) < -cx * 0.75 + 60) h = Math.min(h, 22 + R() * 30);
        if (Math.abs(x - riverX(z)) < RIVER_W + Math.max(w, d) / 2 + 6) continue;
        addB(w, h, d, x, z, TINTS[Math.floor(R() * TINTS.length)], Math.floor(R() * 8) / 8, Math.floor(R() * 8) / 8);
        if (h > 150) av.push([x, GROUND + h + 1, z]);
      }
      if (R() < 0.55) {   // street trees along one or two kerbs
        const side = Math.floor(R() * 4);
        for (let k = 0; k < 6; k++) {
          const o = -22 + k * 8.8;
          const [x, z] = [[cx + o, cz - 25], [cx + o, cz + 25], [cx - 25, cz + o], [cx + 25, cz + o]][side];
          if (Math.abs(x - riverX(z)) > RIVER_W + 4) tree(x, z, 0.8);
        }
      }
    }
    // Riverside parks with trees along both banks.
    for (let z = -1100; z <= 1100; z += 12) for (const s of [-1, 1]) if (R() < 0.75) tree(riverX(z) + s * (RIVER_W + 6 + R() * 14), z + R() * 6);

    const cityMat = new THREE.MeshStandardMaterial({ map: fac.tex, emissiveMap: lit.tex, emissive: '#ffffff', vertexColors: true,
      roughnessMap: rm.tex, metalnessMap: rm.tex, roughness: 1, metalness: 1, envMapIntensity: 1.1 });
    world.add(new THREE.Mesh(mergeGeometries(geos), cityMat));

    const avMat = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff2a1a', emissiveIntensity: 3 });
    const avMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), avMat, av.length);
    const m4 = new THREE.Matrix4();
    av.forEach(([x, y, z], i) => avMesh.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    world.add(avMesh);

    // Streets: one 70 m block per texture tile, roads on the tile edges, streetlights along the kerbs.
    const gt = makeCanvas(256, 256), ge = makeCanvas(256, 256), px = 256 / 70;
    gt.ctx.fillStyle = '#2a2c30'; gt.ctx.fillRect(0, 0, 256, 256);
    gt.ctx.fillStyle = '#5a5d61'; gt.ctx.fillRect(8 * px, 8 * px, 54 * px, 54 * px);
    gt.ctx.fillStyle = '#4b5a46'; gt.ctx.fillRect(11 * px, 11 * px, 48 * px, 48 * px);
    gt.ctx.fillStyle = '#c9c3a8';
    for (let i = 0; i < 256; i += 14) { gt.ctx.fillRect(i, 0, 7, 1.2); gt.ctx.fillRect(i, 254.8, 7, 1.2); gt.ctx.fillRect(0, i, 1.2, 7);
      gt.ctx.fillRect(254.8, i, 1.2, 7); }
    ge.ctx.fillStyle = '#000'; ge.ctx.fillRect(0, 0, 256, 256);
    for (let i = 4; i < 256; i += 32) for (const [x, y] of [[i, 7 * px], [i, 63 * px], [7 * px, i], [63 * px, i]]) {
      const g = ge.ctx.createRadialGradient(x, y, 0, x, y, 9);
      g.addColorStop(0, 'rgba(255,200,130,1)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      ge.ctx.fillStyle = g; ge.ctx.fillRect(x - 9, y - 9, 18, 18);
    }
    for (const t of [gt.tex, ge.tex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(86, 86); t.needsUpdate = true; }
    const groundMat = new THREE.MeshStandardMaterial({ map: gt.tex, emissiveMap: ge.tex, emissive: '#ffffff', roughness: 0.95 });
    // The river runs in its own channel: the ground stops at the top of each bank, and grass slopes down to water sunk well
    // below the street. Nothing lies in the water's plane: from 175 m+ up the depth buffer can't tell surfaces a few cm
    // apart, and the water, its banks and the streets under them used to flicker through each other.
    const BANK = 24, SINK = 2, WATER = -1.4, Z0 = -2975, Z1 = 3045, X0 = -2975, X1 = 3045;
    const rows = (profile) => {   // a ribbon along the river, one row of vertices every 20 m; profile: [offset from riverX or [x], y]
      const pos = [], idx = [], n = profile.length;
      for (let z = Z0, i = 0; z <= Z1; z += 20, i++) {
        const x = riverX(z);
        for (const [o, y] of profile) pos.push(Array.isArray(o) ? o[0] : x + o, GROUND + y, z);
        if (i) for (let j = 0; j < n - 1; j++) { const a = (i - 1) * n + j, c = i * n + j; idx.push(a, c, a + 1, a + 1, c, c + 1); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      return g;
    };
    // The ground either side of the channel, its texture laid exactly as the full plane's was.
    const groundGeo = rows([[[X0], 0], [-RIVER_W - BANK, 0], [RIVER_W + BANK, 0], [[X1], 0]]), gp = groundGeo.attributes.position;
    groundGeo.setIndex(groundGeo.index.array.filter((_, k) => Math.floor(k / 6) % 3 !== 1));   // drop the quads over the river
    const uv = [];
    for (let i = 0; i < gp.count; i++) uv.push((gp.getX(i) - X0) / (X1 - X0), (Z1 - gp.getZ(i)) / (Z1 - Z0));
    groundGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(groundGeo, groundMat);
    world.add(ground);

    // Grass for parks and river banks, water for the river and ponds.
    const grassMat = mat('#5f8f4a', { roughness: 1 });
    const parkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(56, 0.4, 56), grassMat, parks.length);
    parks.forEach(([x, z], i) => parkMesh.setMatrixAt(i, m4.makeTranslation(x, GROUND + 0.2, z)));
    world.add(parkMesh);
    const waterMat = new THREE.MeshStandardMaterial({ color: '#1b3444', roughness: 0.07, metalness: 0.85, envMapIntensity: 1.2 });
    const strip = (profile, material) => {
      const g = rows(profile); g.computeVertexNormals();
      const m = new THREE.Mesh(g, material); m.material.side = THREE.DoubleSide;
      world.add(m);
    };
    strip([[-RIVER_W - 1, WATER], [RIVER_W + 1, WATER]], waterMat);   // its edges tuck under the banks
    strip([[RIVER_W, -SINK], [RIVER_W + 3, 0], [RIVER_W + BANK, 0]], grassMat);
    strip([[-RIVER_W - BANK, 0], [-RIVER_W - 3, 0], [-RIVER_W, -SINK]], grassMat);
    // Parks lie on the streets and ponds in the parks, 0.15–0.4 m up: offset in depth so they win at any distance.
    Object.assign(grassMat, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    Object.assign(waterMat, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const pondMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.2, 32), waterMat, ponds.length);
    const dummy = new THREE.Object3D();
    ponds.forEach(([x, z, r], i) =>
      { dummy.position.set(x, GROUND + 0.45, z); dummy.scale.set(r, 1, r); dummy.updateMatrix(); pondMesh.setMatrixAt(i, dummy.matrix); });
    world.add(pondMesh);

    // Trees: autumn palette, it being October.
    const TREE_COLS = ['#3f7a3a', '#4f8a3c', '#2f6b3a', '#5d9440', '#d08a2a', '#c4572a', '#e0b23a', '#a23a2a', '#b8742a'].map((c) => new THREE.Color(c));
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), mat('#5a4030', { roughness: 1 }), trees.length);
    // Crowns: a clump of lumpy blobs, darker underneath, instead of one smooth ball.
    const crownGeo = mergeGeometries([[0, 0.1, 0, 0.8], [0.5, -0.2, 0.2, 0.62], [-0.45, -0.15, -0.3, 0.64], [0.1, 0.45, -0.25, 0.55], [-0.2, -0.05, 0.5, 0.58],
      [0.3, 0.2, -0.5, 0.5]].map(([x, y, z, r]) => {
      const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const n = Math.sin(p.getX(i) * 91.7 + p.getY(i) * 47.3 + p.getZ(i) * 73.1 + x * 13) * 43758.5, k = 0.9 + 0.2 * (n - Math.floor(n));
        p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z);
        col.fill(0.55 + 0.45 * sstep(-0.7, 0.8, p.getY(i)), i * 3, i * 3 + 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    }));
    crownGeo.computeVertexNormals();
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, vertexColors: true }), trees.length);
    trees.forEach(([x, z, h, r], i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, GROUND + h * 0.25, z); dummy.scale.set(1, h * 0.5, 1); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, GROUND + h * 0.62, z); dummy.scale.set(r, r * 1.25, r); dummy.rotation.y = R() * 6; dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(i, TREE_COLS[R() < 0.55 ? Math.floor(R() * 4) : 4 + Math.floor(R() * 5)]);
    });
    world.add(trunks, crowns);

    // Mountains on the far horizon: a ring of ridged fbm terrain, tallest to the north, lower in the west so sunsets clear them.
    const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const n2 = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return lerp(lerp(h2(xi, yi), h2(xi + 1, yi), u), lerp(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v);
    };
    const fbm2 = (x, y) =>
      { let s = 0, a = 0.5; for (let i = 0; i < 5; i++) { s += a * n2(x, y); x = x * 2.03 + 1.7; y = y * 2.03 + 3.1; a *= 0.5; } return s; };
    // MS scales the peaks up so they still clear the horizon seen from up here.
    const MBASE = GROUND - 40, R0 = 2700, R1 = 4400, SEG = 720, ROWS = 16, MS = 1.35;
    const mtnH = (th, t) => {
      const c = Math.cos(th), sn = Math.sin(th);
      const amp = 120 + 380 * fbm2(c * 2.2 + 5, sn * 2.2 + 9) + 320 * Math.max(0, sn) + 160 * Math.max(0, c) - 90 * Math.max(0, -c);
      const ridge = 1 - Math.abs(fbm2(c * 9 + t * 3, sn * 9 - t * 2) * 2 - 1);
      return amp * Math.pow(Math.sin(Math.PI * clamp(t * 1.15, 0, 1)), 0.85) * (0.5 + 0.5 * ridge);
    };
    const mpos = [], mcol = [], midx = [], ridgeDeg = new Array(360).fill(-90);
    const SNOW = new THREE.Color('#f4f6f9'), ROCK = new THREE.Color('#6b7078'), FOREST = new THREE.Color('#3a5440'), tmpC = new THREE.Color();
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS, r = R0 + (R1 - R0) * t;
      for (let i = 0; i <= SEG; i++) {
        const th = (i / SEG) * Math.PI * 2, hh = mtnH(th, t), y = MBASE + hh * MS;
        mpos.push(Math.cos(th) * r, y, Math.sin(th) * r);
        if (hh > 470 + 60 * n2(i * 0.3, j)) tmpC.copy(SNOW); else tmpC.copy(FOREST).lerp(ROCK, sstep(120, 380, hh));
        mcol.push(tmpC.r, tmpC.g, tmpC.b);
        const deg = Math.round(th / RAD) % 360;
        ridgeDeg[deg] = Math.max(ridgeDeg[deg], Math.atan2(y - 1.65, r) / RAD);
        if (j && i) { const w = SEG + 1, a = j * w + i, b = a - 1, c = a - w, d = c - 1; midx.push(d, b, a, d, a, c); }
      }
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mpos, 3));
    mg.setAttribute('color', new THREE.Float32BufferAttribute(mcol, 3));
    mg.setIndex(midx); mg.computeVertexNormals();
    const mtnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: '#8a8a8a', side: THREE.DoubleSide });
    // Aerial perspective: the scene's exp² fog, but ~3x thinner, so far ranges fade into the sky instead of vanishing.
    mtnMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
        `#ifdef USE_FOG
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.11);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.9);
        #endif`);
    };
    world.add(new THREE.Mesh(mg, mtnMat));

    // Low cloud drifting between the rooftops: stacked fbm slices, so each cloud has some depth and where a tower pokes
    // through it fades over a few slices instead of a hard line. Unlit: tinted from the sky colours, glowing over the
    // city at night. Bottom slice first so they blend back to front from above.
    const CL = 7, cpos = [], ck = [], cidx = [];
    for (let i = 0; i < CL; i++) {
      const y = GROUND + 72 + i * 5, b = i * 4;
      cpos.push(-3000, y, -3000, 3000, y, -3000, 3000, y, 3000, -3000, y, 3000);
      ck.push(i / (CL - 1), i / (CL - 1), i / (CL - 1), i / (CL - 1));
      cidx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
    cg.setAttribute('k', new THREE.Float32BufferAttribute(ck, 1));
    cg.setIndex(cidx);
    const cloudU = { lit: skyU.cloudLit, dark: skyU.cloudDark, sunCol: skyU.sunCol, sunDir: skyU.sunDir, night: skyU.night, time: skyU.time,
      fogCol: { value: scene.fog.color }, fogD: { value: scene.fog.density }, glow: { value: new THREE.Color('#ff9a52') } };
    const clouds = new THREE.Mesh(cg, new THREE.ShaderMaterial({
      uniforms: cloudU, transparent: true, depthWrite: false,
      vertexShader: `attribute float k; varying float vK; varying vec3 vW;
        void main() { vK = k; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 lit, dark, sunCol, sunDir, fogCol, glow; uniform float night, time, fogD; varying float vK; varying vec3 vW;
        float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n2(p); p = p * 2.07 + 1.3; a *= 0.5; } return v; }
        void main() {
          vec2 p = vW.xz * 0.004 + vec2(time * 0.006, time * 0.0025);
          float n = (fbm(p + vec2(vK * 0.07, 0.0)) - 0.42) * 2.4 + (n2(p * 0.15 + 1.5) - 0.5) * 1.1;   // ~half cover
          // Thickest mid-stack: the top and bottom slices only show where the cloud is dense, which rounds the puffs.
          float a = smoothstep(0.0, 0.3, n - abs(vK - 0.4) * 0.5);
          float r = length(vW.xz);
          a *= 0.38 * (1.0 - smoothstep(1500.0, 2900.0, r));
          if (a < 0.002) discard;
          vec3 v = normalize(vW - cameraPosition);
          vec3 col = mix(dark, lit, 0.3 + 0.55 * vK + 0.15 * smoothstep(0.0, 0.5, n));
          col += sunCol * (pow(max(dot(v, sunDir), 0.0), 6.0) * 0.5 + 0.12 * max(sunDir.y, 0.0) * vK);
          col += glow * night * (0.16 + 0.12 * (1.0 - vK)) * (1.0 - smoothstep(500.0, 1300.0, r));   // only over the lit city
          float d = distance(vW, cameraPosition);
          col = mix(col, fogCol, 1.0 - exp(-fogD * fogD * d * d * 0.5));
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    clouds.frustumCulled = false;
    world.add(clouds);

    return {
      mat: cityMat, ground: groundMat, av: avMat, mtn: mtnMat, ridge: ridgeDeg, boxes, GROUND,
      trees: [trunks, crowns],   // 1.4M triangles, never culled (one instanced mesh): the security cameras leave them out
      setEnv(tex) { for (const m of [cityMat, waterMat]) { if (!m.envMap) m.needsUpdate = true; m.envMap = tex; } },
    };
  }
  Object.assign(ctx, { city });
}
