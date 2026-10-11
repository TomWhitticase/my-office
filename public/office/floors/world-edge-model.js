// The model table in the gallery behind the sky (world-edge-backstage.js): the whole world in miniature on a round table,
// a matte white architectural model lit from above. The city's blocks (city.js's own footprints, one merged mesh), the
// river, the ring of mountains, the sea out to the sky's wall (a faint line dome over it all), your building in the middle.
// Live: its sun a glowing ball on a brass arm over it, where the sun really is (so the shadows are the time of day; the
// console's TIME OF DAY dial moves both), WEATHER's cloud drifts over it, your building's windows light with the office's lights, the helicopter sits
// where it is (on the pier now), and the door you came in by glows at the edge. Click your building and its floors lift
// apart above the table into a stacked cutaway, each with its walls and desks, and the office's people moving about on
// it (and the blinds, the lights). Hover anything for its name. Only updated while you're in here: the people and the
// shadows a few times a second.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, colliders as officeCols, damp, dash, FONT, makeCanvas, sstep } from '../util.js';

const RIM = 1.75, TOP = 0.9, VEX = 1.25;   // the model's radius (the sky's wall) and the table's height (m); buildings' heights exaggerated a little

export function installModel(ctx, bs, PLAN, edge) {
  const { city, heli, roof, FLOORS, sun, sunDir } = ctx, root = bs.root, { TC } = PLAN, R = Math.random, hits = [], cols = [];
  const W = edge.R, K = RIM / W, G0 = city.GROUND;
  const Y0 = TC.y || 0, g = new THREE.Group(); g.position.set(TC.x, Y0 + TOP, TC.z); root.add(g);
  const my = (y) => (y - G0) * K * VEX;   // a height in the world, on the model
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, ...o });
  const whiteM = M({ color: '#f4f2ec', emissive: '#ffd9a0', emissiveIntensity: 0 }), landM = M({ color: '#9f9b91' });
  const name = (h, k) => `<b>${h}</b>${k ? `<div class="m">${k}</div>` : ''}`;
  const shade = (m) => { m.castShadow = m.receiveShadow = true; return m; };
  const pick = (m, at) => { m.userData = { action: 'edge-model', reach: 5, drawerAt: at }; hits.push(m); return m; };
  const local = new THREE.Vector3(), toWorld = (p) => { local.copy(p); g.worldToLocal(local); return { x: local.x / K, y: local.y / (K * VEX) + G0, z: local.z / K }; };

  // ----- the table: dark, round, a brass edge -----
  const tableM = M({ color: '#0d0e10', roughness: 0.4, metalness: 0.3 });
  const table = new THREE.Mesh(new THREE.CylinderGeometry(RIM + 0.1, RIM + 0.06, 0.09, 64), tableM); table.position.set(TC.x, Y0 + TOP - 0.055, TC.z); root.add(table);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(RIM - 0.55, RIM - 0.45, TOP - 0.1, 48), tableM); plinth.position.set(TC.x, Y0 + (TOP - 0.1) / 2, TC.z); root.add(plinth);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM + 0.08, 0.02, 8, 96).rotateX(Math.PI / 2), M({ color: '#8a7448', metalness: 0.8, roughness: 0.35 }));
  rim.position.set(TC.x, Y0 + TOP - 0.01, TC.z); root.add(rim);
  for (const [w, d] of [[2 * RIM + 0.2, 2.2], [2.2, 2 * RIM + 0.2], [3.1, 3.1]]) cols.push({ minX: TC.x - w / 2, maxX: TC.x + w / 2, minZ: TC.z - d / 2, maxZ: TC.z + d / 2 });

  // ----- the sea, the land, the river -----
  const sea = shade(new THREE.Mesh(new THREE.CircleGeometry(RIM, 128).rotateX(-Math.PI / 2), M({ color: '#3d5363', roughness: 0.3, metalness: 0.15 })));
  sea.position.y = 0.002; g.add(sea);
  pick(sea, () => name('The sea', 'Out to the wall'));
  const SQ = 2975, sqK = SQ * K, land = shade(new THREE.Mesh(new THREE.BoxGeometry(sqK * 2 + 0.03, 0.006, sqK * 2 + 0.03), landM));
  land.position.set(0.035 * 0, 0.005, 0); g.add(land);
  pick(land, (p) => { const w = toWorld(p); return name(Math.hypot(w.x, w.z) < 60 ? 'Your building' : 'The city', `${(Math.hypot(w.x, w.z) / 1000).toFixed(1)} km from your building`); });
  const riv = [];
  for (let z = -SQ; z < SQ; z += 60) {
    const a = city.riverX(z), b = city.riverX(z + 60);
    const q = new THREE.PlaneGeometry(city.RIVER_W * 2 * K, 60 * K).rotateX(-Math.PI / 2);
    const P = q.attributes.position;
    for (let k = 0; k < P.count; k++) { const top = P.getZ(k) < 0; P.setX(k, P.getX(k) + (top ? a : b) * K); P.setZ(k, ((top ? z : z + 60)) * K); }
    riv.push(q);
  }
  const river = new THREE.Mesh(mergeGeometries(riv), M({ color: '#5b7383', roughness: 0.3 }));
  river.position.y = 0.0085; river.receiveShadow = true; g.add(river);
  pick(river, () => name('The river'));

  // ----- the city's blocks, merged; your building, on its own -----
  const blocks = [];
  for (const b of city.boxes) {
    if (Math.abs(b.x) < 30 && Math.abs(b.z) < 25) continue;
    const h = my(b.top);
    if (h <= 0.002) continue;
    blocks.push(new THREE.BoxGeometry(Math.max(0.002, b.w * K), h, Math.max(0.002, b.d * K)).translate(b.x * K, 0.008 + h / 2, b.z * K));
  }
  const town = new THREE.Mesh(mergeGeometries(blocks), whiteM);   // (shadows from a few thousand tiny blocks are only noise)
  town.receiveShadow = true;
  g.add(town);
  pick(town, (p) => { const w = toWorld(p); return name('A building', `${Math.max(1, Math.round((w.y - G0) / 3.5))} storeys · ${(Math.hypot(w.x, w.z) / 1000).toFixed(1)} km out`); });
  const towerH = my(roof.y), towerM = M({ color: '#f2f0ea', emissive: '#ffc070', emissiveIntensity: 0 });
  const tower = shade(new THREE.Mesh(new THREE.BoxGeometry(40 * K, towerH, 30 * K), towerM));
  tower.position.y = 0.008 + towerH / 2; g.add(tower);
  const towerHit = ctx.hitBox(g, 0.07, towerH + 0.06, 0.06, 0, towerH / 2, 0, { action: 'edge-model', reach: 5 });
  towerHit.userData.drawerAt = () => name('Your building', `${dash.officeName?.() || 'The office'} · click to ${C.want ? 'put it back together' : 'open it up'}`);
  towerHit.userData.tower = true; hits.push(towerHit);

  // ----- the mountains: the ring sampled from city.js's own heights -----
  {
    // (each height the average of a few round it, and not exaggerated: at this scale the ridges would be a crown of thorns)
    const NA = 240, NR = 12, R0 = 2700, R1 = 4400, pos = [], idx = [];
    const hAt = (x, z) => { const y = city.mtnY(x, z); return Number.isFinite(y) ? Math.max(0, y - G0) : 0; };
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++) {
      const th = i / NA * Math.PI * 2, r = R0 + (R1 - R0) * j / NR, x = Math.cos(th) * r, z = Math.sin(th) * r;
      let h = 0;
      for (const [dx, dz] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]]) h += hAt(x + dx, z + dz) / 5;
      pos.push(x * K, Math.max(0.003, h * K) + (j === 0 || j === NR ? 0 : 0.002), z * K);
      if (i && j) { const w = NA + 1, a = j * w + i, b = a - 1, c = a - w, d = c - 1; idx.push(d, b, a, d, a, c); }
    }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setIndex(idx); mg.computeVertexNormals();
    const mtn = shade(new THREE.Mesh(mg, M({ color: '#e6e4dc', side: THREE.DoubleSide })));
    g.add(mtn);
    pick(mtn, (p) => { local.copy(p); g.worldToLocal(local); return name('The mountains', `${Math.round(local.y / K)} m`); });
  }

  // ----- the sky's wall: a faint line dome over it all (not to height: it'd be in the ceiling) -----
  {
    const pts = [];
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; for (let i = 0; i < 16; i++) { const e0 = i / 16 * Math.PI / 2, e1 = (i + 1) / 16 * Math.PI / 2; pts.push(RIM * Math.cos(e0) * Math.cos(a), RIM * 0.62 * Math.sin(e0), RIM * Math.cos(e0) * Math.sin(a), RIM * Math.cos(e1) * Math.cos(a), RIM * 0.62 * Math.sin(e1), RIM * Math.cos(e1) * Math.sin(a)); } }
    for (let i = 0; i < 6; i++) { const e = i / 6 * Math.PI / 2; for (let k = 0; k < 96; k++) { const a0 = k / 96 * Math.PI * 2, a1 = (k + 1) / 96 * Math.PI * 2; pts.push(RIM * Math.cos(e) * Math.cos(a0), RIM * 0.62 * Math.sin(e), RIM * Math.cos(e) * Math.sin(a0), RIM * Math.cos(e) * Math.cos(a1), RIM * 0.62 * Math.sin(e), RIM * Math.cos(e) * Math.sin(a1)); } }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const dome = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.35, 0.75, 1.0), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    dome.layers.set(1); dome.raycast = () => {}; g.add(dome);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(RIM, RIM, 0.025, 128, 1, true), M({ color: '#c9d4dc', roughness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
    wall.position.y = 0.0125; wall.layers.set(1); g.add(wall);
  }
  // the door you came in by, glowing at the wall's foot due west; the stairs and the pier by it
  const doorAt = new THREE.Vector3(-RIM + 0.004, my(edge.LT) + 0.006, 0);
  const doorM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.8, 2.2) });
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.008), doorM); door.position.copy(doorAt); g.add(door);
  const halo = makeCanvas(64, 64), hc = halo.ctx, hg = hc.createRadialGradient(32, 32, 0, 32, 32, 32);
  hg.addColorStop(0, 'rgba(200,255,220,1)'); hg.addColorStop(1, 'rgba(200,255,220,0)'); hc.fillStyle = hg; hc.fillRect(0, 0, 64, 64); halo.tex.needsUpdate = true;
  const haloS = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo.tex, color: new THREE.Color(1.4, 1.6, 1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  haloS.scale.setScalar(0.08); haloS.position.copy(doorAt); haloS.layers.set(1); g.add(haloS);
  const pierG = new THREE.Mesh(new THREE.BoxGeometry(edge.PIER.w * K * 3, 0.004, (edge.PIER.u1 - edge.PIER.u0 + 10) * K * 3), whiteM);
  pierG.position.set(-RIM + edge.PIER.w * K * 1.5, 0.004, (edge.PIER.u0 - 6) * K * 3); g.add(pierG);
  const doorHit = ctx.hitBox(g, 0.06, 0.06, 0.06, doorAt.x + 0.02, doorAt.y, 0, { action: 'edge-model', reach: 5 });
  doorHit.userData.drawerAt = () => name('A door in the sky', 'The way you came in'); hits.push(doorHit);

  // ----- the helicopter: a little one, eight times too big to see otherwise -----
  const hel = new THREE.Group(), HS = 8 * K;
  const bodyG = new THREE.SphereGeometry(1.4, 12, 8).scale(1, 0.9, 2.1);
  hel.add(new THREE.Mesh(bodyG, whiteM), Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 5).translate(0, 0.3, 4), whiteM), {}));
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.35), M({ color: '#bbb' })); rotor.position.y = 1.4; hel.add(rotor);
  hel.scale.setScalar(HS); g.add(hel);
  hel.traverse((o) => { o.castShadow = true; });
  const helHit = ctx.hitBox(hel, 6, 4, 10, 0, 0.8, 1, { action: 'edge-model', reach: 5 });
  helHit.userData.drawerAt = () => name('Your helicopter', heli.S.free ? 'Waiting on the pier' : 'On the roof'); hits.push(helHit);

  // ----- the cloud: a drifting layer of WEATHER over it -----
  const cl = makeCanvas(256, 256), cc = cl.ctx;
  for (let k = 0; k < 220; k++) { const x = R() * 256, y = R() * 256, r = 8 + R() * 30, gr = cc.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cc.fillStyle = gr; cc.fillRect(x - r, y - r, r * 2, r * 2); }
  cl.tex.wrapS = cl.tex.wrapT = THREE.RepeatWrapping; cl.tex.needsUpdate = true;
  const cloudM = new THREE.MeshBasicMaterial({ map: cl.tex, transparent: true, opacity: 0, depthWrite: false, color: new THREE.Color(0.9, 0.92, 0.95) });
  const cloud = new THREE.Mesh(new THREE.CircleGeometry(RIM - 0.02, 64).rotateX(-Math.PI / 2), cloudM);
  cloud.position.y = 0.28; cloud.layers.set(1); cloud.raycast = () => {}; g.add(cloud);
  // ...and the weather under it (world/weather.js): rain or snow falling from it to the streets, fog lying in layers
  const RN = 1400, NS = 1100, wxR = Math.random, rainP = new Float32Array(RN * 6), snowP = new Float32Array(NS * 3);
  const disc = () => { const a = wxR() * Math.PI * 2, r = Math.sqrt(wxR()) * (RIM - 0.05); return [Math.cos(a) * r, Math.sin(a) * r]; };
  for (let i = 0; i < RN; i++) { const [x, z] = disc(), y = wxR() * 0.27; rainP.set([x, y, z, x, y + 0.025, z], i * 6); }
  for (let i = 0; i < NS; i++) { const [x, z] = disc(); snowP.set([x, wxR() * 0.27, z], i * 3); }
  const geo = (a) => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(a, 3).setUsage(THREE.DynamicDrawUsage));
  const rainM = new THREE.LineBasicMaterial({ color: '#c8d4e4', transparent: true, opacity: 0, depthWrite: false });
  const rainL = new THREE.LineSegments(geo(rainP), rainM), snowL = new THREE.Points(geo(snowP), new THREE.PointsMaterial({ color: '#ffffff', size: 0.006, transparent: true, opacity: 0, depthWrite: false }));
  const hazeM = new THREE.MeshBasicMaterial({ color: '#d8dde2', transparent: true, opacity: 0, depthWrite: false }), haze = [];
  for (const y of [0.02, 0.07, 0.13, 0.2]) { const h = new THREE.Mesh(new THREE.CircleGeometry(RIM - 0.03, 48).rotateX(-Math.PI / 2), hazeM); h.position.y = y; haze.push(h); }
  for (const o of [rainL, snowL, ...haze]) { o.layers.set(1); o.raycast = () => {}; o.frustumCulled = false; o.visible = false; g.add(o); }
  let clX = 0, clZ = 0;

  // ----- its sun: a little glowing ball on a brass arm over the model, at the dome's edge, where the sun is in the sky (its
  // arm swung round to the sun's bearing, the ball up it to the sun's height: below the horizon it sinks to the rim and
  // dims), its light from further out along the same line (so the shadows fall as the day's do); a cool fill for the night
  const lamp = new THREE.SpotLight('#ffffff', 0, 9, 0.42, 0.5, 1.2);
  lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.004; lamp.shadow.camera.near = 2; lamp.shadow.camera.far = 9;
  root.add(lamp, lamp.target); lamp.target.position.set(TC.x, Y0 + TOP, TC.z);
  const fill = new THREE.SpotLight('#9fb6e0', 6, 6, 0.5, 0.8, 1.5); fill.position.set(TC.x, Y0 + 3.3, TC.z + 0.3); fill.target.position.set(TC.x, Y0 + TOP, TC.z); root.add(fill, fill.target);
  const AR = RIM + 0.06, AH = 0.62;   // the arm: a half ellipse over the model from rim to rim, as the dome's lines are
  const arm = new THREE.Group(); g.add(arm);
  {
    const pts = [];
    for (let i = 0; i <= 48; i++) { const e = i / 48 * Math.PI; pts.push(new THREE.Vector3(AR * Math.cos(e), AR * AH * Math.sin(e), 0)); }
    const brass = M({ color: '#8a7448', metalness: 0.8, roughness: 0.35 });
    arm.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.006, 6, false), brass));
    for (const s of [-1, 1]) { const pv = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), brass); pv.position.set(s * AR, 0.004, 0); arm.add(pv); }   // its pivots on the rim
    arm.traverse((o) => { o.raycast = () => {}; });
  }
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.9) }));
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => {
    const c = makeCanvas(64, 64), x = c.ctx, gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(0.35, 'rgba(255,210,140,.35)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); c.tex.needsUpdate = true; return c.tex;
  })(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sunGlow.scale.setScalar(0.32); sunGlow.layers.set(1); sunBall.add(sunGlow); g.add(sunBall);
  const sunHit = ctx.hitBox(sunBall, 0.12, 0.12, 0.12, 0, 0, 0, { action: 'edge-model', reach: 5 });
  sunHit.userData.drawerAt = () => name('The sun', sunDir.y > 0 ? `${Math.round(Math.asin(sunDir.y) * 180 / Math.PI)}° up · set it on the console’s TIME OF DAY` : 'Down for the night'); hits.push(sunHit);

  // ----- the cutaway: your building's floors, lifted apart above the table -----
  const C = { k: 0, want: 0, built: false, floors: [], people: null, n: 0 };
  const CS = 0.0155, STEP = 0.13, CUT_Y = 0.16;   // 1:65; the floors this far apart, the lowest this far over the table
  const plateM = M({ color: '#f0eee8', roughness: 0.85 }), wallM = M({ color: '#ffffff', roughness: 0.8 }), glowM = M({ color: '#f6efe0', emissive: '#ffbf6a', emissiveIntensity: 0 });
  function buildCut() {
    C.built = true;
    const list = FLOORS.filter((F) => typeof F.n === 'number' && !F.unlisted && !F.carless && F.n >= -2 && F.n <= 50).sort((a, b) => b.n - a.n);
    list.forEach((F, i) => {
      const fg = new THREE.Group(), boxes = [];
      const src = F.n === 48 ? officeCols : F.colliders || [];
      for (const b of src) {
        const x0 = clamp(b.minX, -20, 20), x1 = clamp(b.maxX, -20, 20), z0 = clamp(b.minZ, -15, 15), z1 = clamp(b.maxZ, -15, 15);
        if (x1 - x0 < 0.05 || z1 - z0 < 0.05 || (x1 - x0) * (z1 - z0) > 300) continue;
        boxes.push(new THREE.BoxGeometry(x1 - x0, 1.1, z1 - z0).translate((x0 + x1) / 2, 0.55, (z0 + z1) / 2));
      }
      const plate = new THREE.Mesh(new THREE.BoxGeometry(40, 0.35, 30).translate(0, -0.175, 0), F.n === 48 ? glowM : plateM);
      fg.add(plate);
      if (boxes.length) fg.add(new THREE.Mesh(mergeGeometries(boxes), wallM));
      // its number, on the plate's edge
      const lab = makeCanvas(128, 48); lab.ctx.fillStyle = '#e9e7e0'; lab.ctx.fillRect(0, 0, 128, 48); lab.ctx.fillStyle = '#2a2a2a'; lab.ctx.font = `700 30px ${FONT}`;
      lab.ctx.fillText(F.n === 50 ? 'ROOF' : F.n < 0 ? `B${-F.n}` : String(F.n), 10, 36); lab.tex.needsUpdate = true;
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 2.06), new THREE.MeshBasicMaterial({ map: lab.tex })); tag.position.set(-17, -0.18, 15.02); fg.add(tag);
      fg.traverse((o) => { o.castShadow = o.receiveShadow = true; });
      fg.visible = false; g.add(fg);
      const hit = ctx.hitBox(fg, 41, 1.6, 31, 0, 0.3, 0, { action: 'edge-model', reach: 5 });
      hit.userData.drawerAt = () => name(F.n === 50 ? 'The roof' : F.n < 0 ? `B${-F.n} · ${F.title}` : `${F.n} · ${F.title || 'Office'}`,
        F.n === 48 ? `${[...ctx.people.values()].filter((p) => p.root.visible).length} people · click to put it back together` : 'Click to put it back together');
      hit.userData.cut = true;
      C.floors.push({ F, fg, hit, i, top: (list.length - 1 - i) });
    });
    // the office's people: little figures on 48
    const fig = mergeGeometries([new THREE.CapsuleGeometry(0.25, 0.9, 3, 8).translate(0, 0.7, 0), new THREE.SphereGeometry(0.22, 10, 8).translate(0, 1.55, 0)].map((x) => x.toNonIndexed()));
    C.people = new THREE.InstancedMesh(fig, M({ color: '#ffffff', roughness: 0.6 }), 64);
    C.people.count = 0; C.people.castShadow = true; C.people.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const f48 = C.floors.find((f) => f.F.n === 48); if (f48) f48.fg.add(C.people);
    // the blinds on 48: a band round its glass, lowered as they are
    C.blinds = new THREE.Mesh(new THREE.BoxGeometry(40.4, 1, 30.4).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: '#b8b2a4', transparent: true, opacity: 0.55, side: THREE.BackSide }));
    C.blinds.position.y = 3.2; if (f48) f48.fg.add(C.blinds);
    hits.push(...C.floors.map((f) => f.hit));
    bs.hits.push(...C.floors.map((f) => f.hit));
  }
  ctx.action('edge-model', {
    hover: (h) => h.drawer || '',
    click: (h) => {
      if (!h?.drawer) return true;
      if (h.drawer.includes('Your building') || hov.drawer.includes('put it back')) { if (!C.built) buildCut(); C.want = C.want ? 0 : 1; ctx.sfx.cabinet?.('latch', g.localToWorld(new THREE.Vector3(0, 0.1, 0)), 0.15); }
      return true;
    },
  });

  // ----- each frame (while you're in here or looking in) -----
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  let slowAt = -1, shadowAt = -1, lastSun = new THREE.Vector3();
  function fx(dt, t) {
    const S = heli.S;
    // the sun: the ball where the line from the model's middle along the sun's direction meets the arm (so it's at the
    // sun's height in the sky), the arm swung to its bearing; the light 4.2 m out along the same line
    const el = sunDir.y, on = sstep(-0.03, 0.06, el), h = Math.hypot(sunDir.x, sunDir.z) || 1e-6, e = Math.max(-0.02, Math.asin(clamp(el, -1, 1)));
    const r = 1 / Math.hypot(Math.cos(e) / AR, Math.sin(e) / (AR * AH));
    arm.rotation.y = Math.atan2(-sunDir.z, sunDir.x);
    sunBall.position.set(sunDir.x / h * r * Math.cos(e), r * Math.sin(e) + 0.01, sunDir.z / h * r * Math.cos(e));
    sunBall.material.color.setRGB(3, 2.6, 1.9).multiplyScalar(0.15 + 0.85 * on); sunGlow.material.opacity = 0.2 + 0.8 * on;
    lamp.position.copy(sunDir).multiplyScalar(4.2).add(v.set(TC.x, Y0 + TOP, TC.z)); if (lamp.position.y < Y0 + TOP + 0.3) lamp.position.y = Y0 + TOP + 0.3;
    lamp.color.copy(sun.color); lamp.intensity = 28 * on * (0.4 + 0.6 * clamp(sun.intensity / 4.2, 0, 1.2));
    fill.intensity = 3 + 7 * (1 - on);
    // the city's lights at night, your building's with the office's
    const night = ctx.skyU.night.value, o = dash.office || {}, lights = (o.lights === 'on' ? 1 : o.lights === 'off' ? 0 : 1 - ctx.daylight) * (o.brightness ?? 1);
    whiteM.emissiveIntensity = 0.06 * night; towerM.emissiveIntensity = 0.9 * lights; glowM.emissiveIntensity = 0.35 * lights;
    doorM.color.setRGB(2.5, 2.8, 2.2).multiplyScalar(0.7 + 0.3 * Math.sin(t * 2.2)); haloS.material.opacity = 0.6 + 0.4 * Math.sin(t * 2.2);
    // cloud
    const W = ctx.weather?.now, wind = W ? W.wind / 0.3 : 1;
    clX += dt * 0.004 * wind; clZ += dt * 0.0025 * wind;
    cloudM.opacity = sstep(0.25, 1, ctx.skyU.cover.value) * 0.6 + (W ? W.grey * 0.25 : 0); cl.tex.offset.set(clX, clZ);
    if (W) {
      cloudM.color.setRGB(0.9, 0.92, 0.95).multiplyScalar(1 - 0.6 * W.dark).addScalar(W.flash * 1.5);
      fill.intensity += 60 * W.flash;
      const rain = clamp(W.rain, 0, 2) / 2, snow = W.snow, drift = W.wind * 0.02;
      rainM.opacity = 0.55 * Math.min(1, rain * 1.4); rainL.visible = rain > 0.01;
      if (rainL.visible) {
        rainL.geometry.setDrawRange(0, Math.ceil(RN * Math.min(1, 0.3 + rain)) * 2);
        for (let i = 0; i < RN * 6; i += 6) {
          let y = rainP[i + 1] - dt * 0.9;
          if (y < 0) y += 0.27;
          rainP[i + 1] = y; rainP[i + 4] = y + 0.025; rainP[i + 3] = rainP[i] + drift;
        }
        rainL.geometry.attributes.position.needsUpdate = true;
      }
      snowL.material.opacity = 0.9 * snow; snowL.visible = snow > 0.01;
      if (snowL.visible) {
        for (let i = 0; i < NS * 3; i += 3) {
          let y = snowP[i + 1] - dt * 0.03;
          if (y < 0) y += 0.27;
          snowP[i + 1] = y; snowP[i] += Math.sin(t * 1.3 + i) * dt * 0.004 + drift * dt;
          if (snowP[i] * snowP[i] + snowP[i + 2] * snowP[i + 2] > (RIM - 0.05) ** 2) snowP[i] *= -0.98;
        }
        snowL.geometry.attributes.position.needsUpdate = true;
      }
      hazeM.opacity = 0.2 * W.fog; for (const h of haze) h.visible = W.fog > 0.02;
      hazeM.color.copy(ctx.scene.fog.color).multiplyScalar(0.6);
    }
    // the helicopter
    hel.position.set(S.pos.x * K, my(S.pos.y) + 0.008, S.pos.z * K); hel.rotation.y = S.yaw; rotor.rotation.y += dt * 30 * S.rpm;
    hel.visible = Math.hypot(S.pos.x, S.pos.z) < W;
    // the cutaway
    C.k = damp(C.k, C.want, 2.2, dt);
    if (C.built) {
      const e = sstep(0, 1, C.k);
      for (const f of C.floors) {
        const s = THREE.MathUtils.lerp(K, CS, e), fromY = my(f.F.n >= 0 ? f.F.n === 50 ? roof.y : (f.F.n - 48) * 3.3 : G0 + 20 + f.F.n * 8), toY = CUT_Y + f.top * STEP;
        f.fg.visible = C.k > 0.01;
        f.fg.scale.setScalar(s); f.fg.position.set(0, THREE.MathUtils.lerp(fromY, toY, e), 0);
      }
      tower.visible = C.k < 0.5;
      if (C.k > 0.01 && t - slowAt > 0.2) {   // the people, a few times a second
        slowAt = t;
        let i = 0;
        for (const p of ctx.people.values()) {
          if (!p.root.visible || i >= 64) continue;
          q.setFromAxisAngle(up, p.root.rotation.y);
          C.people.setMatrixAt(i, m4.compose(v.set(p.root.position.x, 0, p.root.position.z), q, one));
          C.people.setColorAt(i, new THREE.Color(p.color || '#ffffff'));
          i++;
        }
        C.people.count = i; C.people.instanceMatrix.needsUpdate = true; if (C.people.instanceColor) C.people.instanceColor.needsUpdate = true;
        const bl = Object.values(o.blinds || {}), avg = bl.length ? bl.reduce((a, b) => a + (+b || 0), 0) / bl.length : 0;
        C.blinds.scale.y = Math.max(0.01, avg * 2.6); C.blinds.visible = avg > 0.02;
      }
    }
    // the lamp's shadows: again when it's moved, or things on the table have, a few times a second at most
    if (t - shadowAt > 0.25 && (lastSun.distanceToSquared(sunDir) > 1e-7 || C.k > 0.01 && C.k < 0.99 || S.rpm > 0 || C.k > 0.5)) {
      shadowAt = t; lastSun.copy(sunDir); M_.shadow = true;
    }
  }
  const M_ = { shadow: true };
  return { fx, hits, cols, C, g, lamp, shadow: M_, buildCut, open: (on = true) => { if (!C.built) buildCut(); C.want = on ? 1 : 0; } };
}
