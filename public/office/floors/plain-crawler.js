// The thing on the Plain (floors/plain.js), as the painting has it. A great hunched back like a sack of wet hide, much
// higher than the head; the head hung low between its arms, almost on the ground, wound round and round in old bandage,
// the strips layered over each other, grey with dirt, and something dark and wet soaking through where its face is.
// Four limbs like a starved man's arms and legs, too long: thin bone under waxy, wrinkled, sallow skin, the elbows and
// knees knobbed and jutting high, sinew standing out down the forearms, and hands with long jointed fingers, the
// knuckles raised, splayed on the dust like a spider's legs.
// It walks on them a limb at a time (two-bone IK to hands planted in the world, each lifted when the body's left it
// behind), never in step: out of order, hesitating, lurching. It twitches: a hand jerks up and slaps down, the head snaps
// round, the back shudders. It freezes dead still, mid-stride. It rises, slowly, far higher than it should, its hands
// drawn in under it, and drops again all at once. Its head tilts at you, right over, when it looks at you. Charging, it
// scuttles: low, fast, three limbs moving at once.
// Bones, knuckles and hands are instanced (lathed and sculpted shapes, a few draw calls for all of it).
// What it does: crouched in the painting's foreground while you're on B3 (come up close and it turns its head to you,
// then scuttles off into the haze); out here, it turns up far off, at the edge of what you can see, and watches; creeps
// nearer; then comes for you, faster and faster, shrieks as it closes, and at the last moment goes straight past you,
// close, and off into the haze; and later comes round again. It never touches you.
// Its own random stream (R): the same each visit for the tests.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp, makeCanvas } from '../util.js';

export const POSE = { x: -0.6, z: -13.5, yaw: -Math.PI / 2 };   // where it crouches in the painting
const TAU = Math.PI * 2, SC = 1.5;   // built at 1, shown half again as big
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ----- its skin, its hide, its bandage: canvases, a colour map and a bump map each -----
function canvases(w, h, draw) {
  const c = makeCanvas(w, h), b = makeCanvas(w, h);
  draw(c.ctx, b.ctx, w, h);
  for (const t of [c.tex, b.tex]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
  b.tex.colorSpace = THREE.NoColorSpace;
  return [c.tex, b.tex];
}
function skinTex(R) {   // u round the limb, v along it: sallow, mottled, creased across, veins along
  return canvases(256, 512, (c, b, w, h) => {
    c.fillStyle = '#a89070'; c.fillRect(0, 0, w, h); b.fillStyle = '#808080'; b.fillRect(0, 0, w, h);
    for (let k = 0; k < 220; k++) { const x = R() * w, y = R() * h, r = 6 + R() * 30;
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${R() < 0.5 ? '120,96,70' : '196,178,140'},${0.12 + R() * 0.15})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let k = 0; k < 340; k++) {   // creases across the limb, bunched
      const y = R() * h, x0 = R() * w, len = 20 + R() * 120, a = (R() - 0.5) * 0.25, d = 0.7 + R() * 1.6;
      for (const [ctx, col] of [[c, `rgba(70,52,36,${0.2 + R() * 0.3})`], [b, 'rgba(20,20,20,.55)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = d; ctx.beginPath(); ctx.moveTo(x0, y);
        ctx.quadraticCurveTo(x0 + len / 2, y + Math.sin(a) * len + (R() - 0.5) * 6, x0 + len, y + Math.sin(a) * len * 2); ctx.stroke();
      }
      b.strokeStyle = 'rgba(230,230,230,.35)'; b.lineWidth = d; b.beginPath(); b.moveTo(x0, y - d * 1.5); b.lineTo(x0 + len, y - d * 1.5 + Math.sin(a) * len * 2); b.stroke();
    }
    for (let k = 0; k < 9; k++) {   // veins along it
      let x = R() * w, y = 0; c.strokeStyle = `rgba(80,90,92,${0.18 + R() * 0.15})`; b.strokeStyle = 'rgba(210,210,210,.5)';
      c.lineWidth = b.lineWidth = 1.5 + R() * 2; c.beginPath(); b.beginPath(); c.moveTo(x, y); b.moveTo(x, y);
      while (y < h) { x += (R() - 0.5) * 18; y += 10 + R() * 20; c.lineTo(x, y); b.lineTo(x, y); }
      c.stroke(); b.stroke();
    }
    for (let k = 0; k < 4000; k++) { c.fillStyle = `rgba(60,44,30,${R() * 0.15})`; c.fillRect(R() * w, R() * h, 1, 1); }
  });
}
function hideTex(R) {   // the back: near black hide, or old cloth gone hard; folds, sheen worn on the ridges, a split or two
  return canvases(512, 512, (c, b, w, h) => {
    c.fillStyle = '#2b1f17'; c.fillRect(0, 0, w, h); b.fillStyle = '#707070'; b.fillRect(0, 0, w, h);
    for (let k = 0; k < 160; k++) {   // folds: long curving creases, a lit lip on one side
      const x = R() * w, y = R() * h, l = 40 + R() * 220, a = R() * TAU, bend = (R() - 0.5) * 80, wd = 2 + R() * 7;
      const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l, mx = (x + ex) / 2 + Math.sin(a) * bend, my = (y + ey) / 2 - Math.cos(a) * bend;
      for (const [ctx, col, o] of [[c, `rgba(8,5,3,${0.5 + R() * 0.4})`, 0], [c, `rgba(98,76,58,${0.25 + R() * 0.25})`, -wd * 0.8], [b, 'rgba(0,0,0,.7)', 0], [b, 'rgba(255,255,255,.45)', -wd * 0.8]]) {
        ctx.strokeStyle = col; ctx.lineWidth = wd * (o ? 0.5 : 1); ctx.beginPath(); ctx.moveTo(x, y + o); ctx.quadraticCurveTo(mx, my + o, ex, ey + o); ctx.stroke();
      }
    }
    for (let k = 0; k < 30; k++) { const x = R() * w, y = R() * h, r = 10 + R() * 50, g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${R() < 0.6 ? '50,36,26' : '6,4,2'},.35)`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
    for (let k = 0; k < 6; k++) {   // splits, the sallow skin under it showing
      const x = R() * w, y = R() * h, l = 20 + R() * 40; c.strokeStyle = 'rgba(120,96,70,.6)'; c.lineWidth = 2 + R() * 3;
      c.beginPath(); c.moveTo(x, y); for (let s = 1; s < 5; s++) c.lineTo(x + s * l / 4 + (R() - 0.5) * 6, y + (R() - 0.5) * 10); c.stroke();
    }
    for (let k = 0; k < 9000; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '60,46,34'},${R() * 0.2})`; c.fillRect(R() * w, R() * h, 1 + R(), 1 + R()); }
  });
}
// The bandage: four strips up the texture, each a band of coarse gauze, its upper edge lighter where it's on top, a shadow
// along its lower edge where the next goes under it, frayed threads, dirt and old yellow.
const BANDS = 4;
function bandTex(R) {
  return canvases(256, 512, (c, b, w, h) => {
    const bh = h / BANDS;
    for (let i = 0; i < BANDS; i++) {
      const y0 = i * bh, tone = 186 + R() * 26;
      c.fillStyle = `rgb(${tone},${tone - 8},${tone - 26})`; c.fillRect(0, y0, w, bh);
      b.fillStyle = '#9a9a9a'; b.fillRect(0, y0, w, bh);
      for (let x = 0; x < w; x += 3) { c.fillStyle = 'rgba(120,108,88,.18)'; c.fillRect(x, y0, 1, bh); b.fillStyle = 'rgba(0,0,0,.12)'; b.fillRect(x, y0, 1, bh); }   // the weave
      for (let y = y0; y < y0 + bh; y += 3) { c.fillStyle = 'rgba(255,250,236,.12)'; c.fillRect(0, y, w, 1); }
      let g = c.createLinearGradient(0, y0, 0, y0 + bh);   // lit along the top, in shadow under the next strip at the bottom
      g.addColorStop(0, 'rgba(255,252,240,.35)'); g.addColorStop(0.18, 'rgba(255,252,240,0)'); g.addColorStop(0.72, 'rgba(60,48,34,0)'); g.addColorStop(1, 'rgba(40,30,20,.75)');
      c.fillStyle = g; c.fillRect(0, y0, w, bh);
      g = b.createLinearGradient(0, y0, 0, y0 + bh); g.addColorStop(0, '#d0d0d0'); g.addColorStop(0.7, '#909090'); g.addColorStop(1, '#202020');
      b.fillStyle = g; b.fillRect(0, y0, w, bh);
      for (let k = 0; k < 60; k++) {   // frayed threads off its edge
        const x = R() * w, l = 3 + R() * 10; c.strokeStyle = `rgba(${tone},${tone - 10},${tone - 30},.8)`; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(x, y0 + 1); c.lineTo(x + (R() - 0.5) * 6, y0 - l * 0.4); c.stroke();
      }
      for (let k = 0; k < 26; k++) { const x = R() * w, y = y0 + R() * bh, r = 4 + R() * 30, gg = c.createRadialGradient(x, y, 0, x, y, r);
        gg.addColorStop(0, `rgba(${R() < 0.5 ? '96,76,50' : '140,118,64'},${0.2 + R() * 0.35})`); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gg; c.fillRect(x - r, y - r, r * 2, r * 2); }
    }
    for (let k = 0; k < 5000; k++) { c.fillStyle = `rgba(80,66,48,${R() * 0.18})`; c.fillRect(R() * w, R() * h, 1, 1 + R() * 2); }
  });
}

// ----- shapes -----
// A bone along +y from 0 to 1, about 1 thick: lathed from a profile r(v), then sculpted: sinew ridges along part of it,
// fine noise. Instanced scaled (thickness, length, thickness).
function bone(profile, ridges = [], segs = 28, sides = 12) {
  const pts = []; for (let i = 0; i <= segs; i++) { const v = i / segs; pts.push(new THREE.Vector2(Math.max(0.02, profile(v)), v)); }
  const g = new THREE.LatheGeometry(pts, sides), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    let k = 1 + 0.035 * Math.sin(a * 3 + y * 19) * Math.sin(y * 41 + a);
    for (const [a0, v0, v1, amp] of ridges) k += amp * Math.exp(-(angTo(a, a0) ** 2) / 0.06) * sm(v0, v0 + 0.1, y) * (1 - sm(v1 - 0.1, v1, y));
    p.setXYZ(i, x * k, y, z * k);
    uv.setXY(i, uv.getX(i), y);
  }
  g.computeVertexNormals();
  return g;
}
const knob = (v, at, w, amp) => amp * Math.exp(-((v - at) ** 2) / w);
// a lump: an icosphere pushed about (knuckles, kneecaps, the wrist), unit size
function lump(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.18 * Math.sin(x * 4 + seed) * Math.sin(y * 3 - z * 5 + seed * 2); p.setXYZ(i, x * k, y * k * 0.85, z * k); }
  g.computeVertexNormals(); return g;
}

export function makeCrawler(R, events = {}) {
  const root = new THREE.Group(), body = new THREE.Group(), headG = new THREE.Group();
  root.add(body); body.add(headG); root.scale.setScalar(SC);
  const [sk, skB] = skinTex(R), [hd, hdB] = hideTex(R), [bd, bdB] = bandTex(R);
  sk.repeat.set(1, 1);
  // waxy: a soft sheen over it, a little light let through
  const skinM = new THREE.MeshPhysicalMaterial({ map: sk, bumpMap: skB, bumpScale: 1.2, roughness: 0.48, sheen: 0.6, sheenColor: new THREE.Color('#e9cfa8'), sheenRoughness: 0.5,
    emissive: new THREE.Color('#3a2414'), emissiveIntensity: 0.35 });
  const hideM = new THREE.MeshPhysicalMaterial({ map: hd, bumpMap: hdB, bumpScale: 4, roughness: 0.55, sheen: 0.7, sheenColor: new THREE.Color('#8a6a52'), sheenRoughness: 0.45 });

  // ----- the back: one shape, the hump high behind, narrowing and dropping to the shoulders, a ridge of spine, folds -----
  const backG = new THREE.SphereGeometry(1, 64, 44), bp = backG.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    let x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const front = sm(-0.2, 1, z), rear = sm(0.3, -0.9, z);
    x *= 0.44 * (1 - 0.3 * front); z *= 0.7;
    y = y > 0 ? y * 0.46 * (1 + 0.45 * rear - 0.25 * front) : y * 0.26;
    y += 0.04 * Math.exp(-x * x * 90) * Math.max(0, bp.getY(i));   // the spine
    y += 0.025 * Math.sin(z * 22) * Math.exp(-x * x * 120) * Math.max(0, bp.getY(i));   // its vertebrae
    const n = 1 + 0.035 * Math.sin(x * 17 + z * 6) * Math.sin(y * 13 - z * 9) + 0.02 * Math.sin(x * 41 + y * 23);
    bp.setXYZ(i, x * n, y * n - 0.12 * front, z);
  }
  backG.computeVertexNormals();
  const back = new THREE.Mesh(backG, hideM); back.position.set(0, 0.92, -0.22); back.rotation.x = 0.12;
  // the shoulders under its front, and the neck down to the head (vertebrae standing out), in skin
  const neckC = new THREE.CatmullRomCurve3([V(0, 0.84, 0.1), V(0, 0.72, 0.3), V(0, 0.6, 0.42), V(0, 0.52, 0.5)]);
  const neckG = new THREE.TubeGeometry(neckC, 24, 0.1, 12), np = neckG.attributes.position, cp = V(0, 0, 0);
  for (let i = 0; i < np.count; i++) {
    const t = Math.floor(i / 13) / 24; neckC.getPointAt(t, cp);
    const dx = np.getX(i) - cp.x, dy = np.getY(i) - cp.y, dz = np.getZ(i) - cp.z, k = (1.5 - 0.6 * t) * (1 + 0.15 * Math.max(0, Math.sin(t * 34)) * Math.max(0, dy / 0.1));
    np.setXYZ(i, cp.x + dx * k, cp.y + dy * k, cp.z + dz * k);
  }
  neckG.computeVertexNormals();
  const neck = new THREE.Mesh(neckG, hideM);
  const shoulders = new THREE.Mesh(lump(3), hideM); shoulders.scale.set(0.3, 0.17, 0.2); shoulders.position.set(0, 0.8, 0.22);
  body.add(back, neck, shoulders);

  // ----- the head: an egg wound in bandage; each turn a layer over the last (a sawtooth in its radius); the stain -----
  headG.position.set(0, 0.5, 0.56);
  // the stain: at the front, low, soaking out ragged (on the unit head)
  const stainAt = (x, y, z) => { const d = Math.hypot(x * 1.2, (y + 0.15) * 1.1, z - 1), e = 0.12 * Math.sin(x * 19 + y * 11) * Math.sin(y * 17 - x * 7); return sm(0.95, 0.25, d + e); };
  const headGeo = new THREE.SphereGeometry(1, 64, 48), hp = headGeo.attributes.position, huv = headGeo.attributes.uv;
  const stain = new Float32Array(hp.count), TURNS = 7;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), a = Math.atan2(x, -z) / TAU + 0.5;   // 0 at the back, round to 1
    // the strips go round it in a spiral, tilted: where along the wrap this is, and how far through its strip
    const s = (y * 0.5 + 0.5 + x * 0.3 * Math.sin(y * 2.4 + 0.6) + z * 0.12 + 0.05 * Math.sin(a * TAU * 2 + y * 4)) * TURNS + a, f = s - Math.floor(s);
    const k = 1 + 0.05 * f + 0.012 * Math.sin(a * 60 + s * 3);
    hp.setXYZ(i, x * k * 0.22, y * k * 0.25, z * k * 0.29 * (1 + 0.12 * Math.max(0, -z)));
    huv.setXY(i, a * 2, s / BANDS);
    stain[i] = stainAt(x, y, z);
  }
  headGeo.setAttribute('stain', new THREE.BufferAttribute(stain, 1));
  headGeo.computeVertexNormals();
  const headM = new THREE.MeshStandardMaterial({ map: bd, bumpMap: bdB, bumpScale: 2.5, roughness: 0.92, emissive: '#ffffff', emissiveMap: bd, emissiveIntensity: 0.12 });
  const bloody = (m, key) => { m.onBeforeCompile = (sh) => {   // blood soaking through: dark red, near black at its heart, wet
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float stain; varying float vSt;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSt = stain;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSt;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.42, 0.06, 0.04), vec3(0.11, 0.015, 0.01), smoothstep(0.55, 1.0, vSt)) * (0.7 + 0.3 * diffuseColor.r), smoothstep(0.0, 0.35, vSt));')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, smoothstep(0.3, 0.8, vSt));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - smoothstep(0.0, 0.4, vSt);');
  }; m.customProgramCacheKey = () => key; return m; };
  bloody(headM, 'plain-head');
  const head = new THREE.Mesh(headGeo, headM); head.position.set(0, -0.02, 0.1); head.rotation.x = 0.5;
  headG.add(head);
  // loose ends: two strips come away from it and hang, one long
  const bandM = bloody(new THREE.MeshStandardMaterial({ map: bd, bumpMap: bdB, bumpScale: 2, roughness: 0.95, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: bd, emissiveIntensity: 0.1 }), 'plain-band');
  const tail = (len, w, from, sway) => {
    const n = 16, g = new THREE.PlaneGeometry(w, len, 1, n).translate(0, -len / 2, 0), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const v = -p.getY(i) / len; p.setZ(i, Math.sin(v * 5 + sway) * 0.03 * v + v * v * 0.06); p.setX(i, p.getX(i) * (1 - 0.4 * v) + Math.sin(v * 7) * 0.01); uv.setY(i, v * len * 1.5 / BANDS); }
    g.computeVertexNormals();
    g.setAttribute('stain', new THREE.BufferAttribute(new Float32Array(p.count), 1));
    const m = new THREE.Mesh(g, bandM); m.position.copy(from); return m;
  };
  // strips wound over the crown and round under, crossing each other (the spiral can't cover its own pole): each round a
  // great circle tilted its own way, standing a layer proud of the head
  const wrap = (nx, ny, nz, w, out) => {
    const n = V(nx, ny, nz).normalize(), u = V(0, 1, 0).cross(n).normalize(), v = n.clone().cross(u), N = 72, pos = [], uvs = [], idx = [], st = [];
    for (let k = 0; k <= N; k++) {
      const th = k / N * TAU, c = Math.cos(th), sn = Math.sin(th);
      for (const e of [-1, 1]) {
        const p = V(u.x * c + v.x * sn, u.y * c + v.y * sn, u.z * c + v.z * sn).addScaledVector(n, e * w / 2).normalize().multiplyScalar(out + 0.008 * Math.sin(th * 9 + nx * 5));
        pos.push(p.x * 0.22, p.y * 0.25, p.z * 0.29); uvs.push(e < 0 ? 0 : 0.5, k / N * 6 / BANDS); st.push(stainAt(p.x, p.y, p.z));
      }
      if (k) { const b = (k - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('stain', new THREE.Float32BufferAttribute(st, 1)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const crown = new THREE.Mesh(mergeGeometries([wrap(1, 0.15, 0.3, 0.32, 1.075), wrap(-0.8, 0.2, 0.6, 0.3, 1.095), wrap(0.15, 0.35, -1, 0.26, 1.115)]), bandM);
  crown.position.copy(head.position); crown.rotation.copy(head.rotation);
  headG.add(crown);
  const tails = [tail(0.42, 0.045, V(0.11, -0.12, -0.08), 0), tail(0.2, 0.035, V(-0.13, -0.05, 0.02), 2)];
  tails[0].rotation.set(0.2, 0.4, 0.1); tails[1].rotation.set(-0.3, -0.6, -0.2);
  headG.add(...tails);

  const shade = makeCanvas(64, 64), sc = shade.ctx, sg = sc.createRadialGradient(32, 32, 2, 32, 32, 31);
  sg.addColorStop(0, 'rgba(20,12,6,.6)'); sg.addColorStop(1, 'rgba(20,12,6,0)'); sc.fillStyle = sg; sc.fillRect(0, 0, 64, 64); shade.tex.needsUpdate = true;
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shade.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  blob.position.y = 0.014; root.add(blob);

  // ----- the limbs: anchors on the body, lengths, where each hand rests, which way its elbow or knee bends -----
  const LIMBS = [
    { a: V(0.22, 0.7, 0.32), L: [0.96, 0.9], home: V(0.52, 0, 1.02), pole: V(0.35, 2.4, -0.9), fingers: 5, pair: 0 },
    { a: V(-0.22, 0.7, 0.32), L: [0.96, 0.9], home: V(-0.52, 0, 1.02), pole: V(-0.35, 2.4, -0.9), fingers: 5, pair: 1 },
    { a: V(0.26, 0.86, -0.64), L: [0.98, 0.94], home: V(0.72, 0, -0.86), pole: V(0.7, 1.9, 0.35), fingers: 5, pair: 1 },
    { a: V(-0.26, 0.86, -0.64), L: [0.98, 0.94], home: V(-0.72, 0, -0.86), pole: V(-0.7, 1.9, 0.35), fingers: 5, pair: 0 },
  ].map((l, i) => ({ ...l, i, foot: V(0, 0, 0), from: V(0, 0, 0), to: V(0, 0, 0), t: -1, dur: 0.3, lift: 0, wait: 0, ph: R() * TAU }));
  // the bones: upper (shoulder or hip down to a big knobbed elbow or knee), lower (the sinewy forearm or shin down to a
  // thin wrist), a finger's bone (knuckle, shaft, knuckle)
  const upperG = bone((v) => 0.62 + knob(v, 0.0, 0.01, 0.45) + knob(v, 0.25, 0.03, 0.12) - 0.08 * Math.sin(v * Math.PI) + knob(v, 0.97, 0.004, 0.55), [[0.4, 0.15, 0.7, 0.18]]);
  const lowerG = bone((v) => 0.95 - 0.5 * v + knob(v, 0.02, 0.003, 0.4) + knob(v, 0.22, 0.02, 0.22) + knob(v, 1.0, 0.002, 0.25), [[0.3, 0.1, 0.85, 0.22], [2.4, 0.15, 0.8, 0.16], [-1.5, 0.2, 0.7, 0.12]]);
  const phalG = bone((v) => 0.7 + knob(v, 0.0, 0.006, 0.45) - 0.12 * Math.sin(v * Math.PI) + knob(v, 1.0, 0.006, 0.25), [], 14, 8);
  const NF = LIMBS.reduce((n, l) => n + l.fingers, 0);
  const inst = (g, n, m = skinM) => { const x = new THREE.InstancedMesh(g, m, n); x.frustumCulled = false; root.add(x); return x; };
  const uppers = inst(upperG, 4), lowers = inst(lowerG, 4), phals = inst(phalG, NF * 3), knobs = inst(lump(1), 4 * 2 + NF * 2), palms = inst(lump(5), 4);

  // ----- moving it -----
  const S = { x: POSE.x, z: POSE.z, yaw: POSE.yaw, speed: 0, want: 0, state: 'posed', t: 0, timer: 0, shrieked: false, pass: null, hx: 0, hy: 0, hr: 0, tw: 0, twAt: 0,
    stopT: 0, lurch: 0, visible: true, seen: 0, freeze: 0, rise: 0, riseWant: 0, riseT: 0, shud: 0, tilt: 0, tiltSide: 1 };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = V(0, 1, 0), tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), sca = V(1, 1, 1);
  // a bone from a to b, th thick, into instanced mesh `m` at index i
  const put = (m, i, a, b, th) => {
    tmp.subVectors(b, a); const len = tmp.length();
    Q.setFromUnitVectors(UP, tmp.multiplyScalar(1 / (len || 1)));
    M.compose(a, Q, sca.set(th, len, th)); m.setMatrixAt(i, M);
  };
  const putLump = (m, i, p, sx, sy, sz, dir) => {
    if (dir) Q.setFromUnitVectors(V(0, 0, 1), tmp.copy(dir).normalize()); else Q.identity();
    M.compose(p, Q, sca.set(sx, sy, sz)); m.setMatrixAt(i, M);
  };
  // to world, from the root's frame (ground under the body, +z ahead)
  const toW = (v, out) => { const c = Math.cos(S.yaw) * SC, s = Math.sin(S.yaw) * SC; return out.set(S.x + v.x * c + v.z * s, v.y * SC, S.z - v.x * s + v.z * c); };
  const toL = (v, out) => { const c = Math.cos(S.yaw) / SC, s = Math.sin(S.yaw) / SC, dx = v.x - S.x, dz = v.z - S.z; return out.set(dx * c - dz * s, v.y / SC, dx * s + dz * c); };
  const homeL = V(0, 0, 0);
  const homeOf = (l) => homeL.set(l.home.x * (1 - 0.45 * S.rise), 0, l.home.z * (1 - 0.4 * S.rise));   // drawn in under it as it rises
  function plant() { for (const l of LIMBS) { toW(homeOf(l), l.foot); l.t = -1; } }
  plant();

  // Two-bone IK: from a, reaching t, lengths L0 L1, the joint bent toward `pole`: the joint's position into `j`.
  const dv = V(0, 0, 0), pv = V(0, 0, 0);
  function ik(a, t, L0, L1, pole, j) {
    dv.subVectors(t, a); let d = dv.length();
    if (d > L0 + L1 - 0.01) t.copy(a).addScaledVector(dv.normalize(), L0 + L1 - 0.01);   // (out of reach: the hand where the arm ends)
    d = clamp(d, Math.abs(L0 - L1) + 0.01, L0 + L1 - 0.01); dv.normalize();
    const ca = (L0 * L0 + d * d - L1 * L1) / (2 * L0 * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    pv.copy(pole).addScaledVector(dv, -pole.dot(dv)).normalize();
    j.copy(a).addScaledVector(dv, L0 * ca).addScaledVector(pv, L0 * sa);
  }

  const A = V(0, 0, 0), J = V(0, 0, 0), POLE = V(0, 0, 0), W2 = V(0, 0, 0), P = V(0, 0, 0), home = V(0, 0, 0), fwd = V(0, 0, 0);
  const hdir = V(0, 0, 0), side = V(0, 0, 0), K0 = V(0, 0, 0), K1 = V(0, 0, 0), K2 = V(0, 0, 0), TP = V(0, 0, 0), PC = V(0, 0, 0);
  const FL = [[0.085, 0.07, 0.06], [0.1, 0.085, 0.07], [0.11, 0.09, 0.075], [0.1, 0.085, 0.07], [0.07, 0.055, 0.045]];   // the fingers' bones, the thumb last
  // The limbs for this frame: steps due, steps under way, then every bone.
  function legs(dt, t) {
    const sp = S.speed, run = sm(5, 10, sp), stride = (0.3 + sp / SC * 0.11) * SC, lead = Math.min(0.5, 0.18 + sp / SC * 0.03);
    const busy = LIMBS.filter((l) => l.t >= 0), pairBusy = busy.length ? busy[0].pair : -1, most = run > 0.5 ? 3 : 2;
    fwd.set(Math.sin(S.yaw), 0, Math.cos(S.yaw));
    for (const l of LIMBS) {
      toW(homeOf(l), home).addScaledVector(fwd, sp * lead);
      if (l.t < 0) {
        l.wait -= dt;
        const far = l.foot.distanceTo(home);
        // out of step: whichever's furthest behind, mostly in its pair, now and then out of turn
        const strain = far > stride * 1.9;   // (left so far behind it'd be pulled straight: it goes, in step or not)
        if (far > stride * (l.i === 2 ? 1.25 : 1) && (strain || (l.wait <= 0 && busy.length < most && (pairBusy < 0 || pairBusy === l.pair || run > 0.5 || R() < 0.1)))) {
          l.from.copy(l.foot); l.to.copy(home).add(tmp.set((R() - 0.5) * 0.15, 0, (R() - 0.5) * 0.15));
          l.dur = clamp(0.38 - sp / SC * 0.03, 0.06, 0.38) * (0.6 + R() * 0.9); l.t = 0; l.lift = (0.12 + (l.i < 2 ? 0.14 : 0.06)) * SC * (1 - 0.5 * run) * (0.7 + R() * 0.6);
          busy.push(l);
        } else if (far < 0.05 * SC && sp < 0.1) l.wait = R() * 0.3;
      }
      if (l.t >= 0) {
        l.to.lerp(home, Math.min(1, dt * 3));   // (the body's still going)
        l.t += dt / l.dur;
        // up fast and high, then slapped down
        const u = Math.min(1, l.t), e = u * u * (3 - 2 * u), arc = u < 0.4 ? Math.sin(u / 0.4 * Math.PI / 2) : Math.cos((u - 0.4) / 0.6 * Math.PI / 2) ** 0.6;
        l.foot.lerpVectors(l.from, l.to, e); l.foot.y = arc * l.lift;
        if (l.t >= 1) { l.t = -1; l.foot.y = 0; l.wait = R() < 0.2 ? R() * 0.4 : 0; events.tap?.(l.foot, sp); }
      }
    }
    // the body: risen, or low and pitched forward running; rocking with the hands that are up; a heave when it's still
    const up = LIMBS.reduce((a, l) => a + l.foot.y, 0) / SC, rise = S.rise;
    body.position.y = -0.12 * run + up * 0.22 + Math.sin(t * 1.3) * 0.012 * (1 - run) + S.lurch * 0.05 + rise * 0.62;
    body.rotation.x = 0.1 * run + (LIMBS[0].foot.y + LIMBS[1].foot.y - LIMBS[2].foot.y - LIMBS[3].foot.y) / SC * 0.35 + S.lurch * 0.1 - rise * 0.38;
    body.rotation.z = (LIMBS[1].foot.y + LIMBS[3].foot.y - LIMBS[0].foot.y - LIMBS[2].foot.y) / SC * 0.5 + Math.sin(t * 0.7) * 0.02 + Math.sin(t * 83) * 0.05 * S.shud;
    body.updateMatrix(); root.updateMatrixWorld(true);
    // every bone, in the root's frame (the instanced meshes are children of root)
    let fi = 0, ki = 0;
    for (const l of LIMBS) {
      A.copy(l.a).applyMatrix4(body.matrix);
      toL(l.foot, W2); W2.y += 0.06;   // the wrist, just off the ground
      ik(A, W2, l.L[0], l.L[1], POLE.copy(l.pole).normalize(), J);
      put(uppers, l.i, A, J, 0.042); put(lowers, l.i, J, W2, 0.034);
      putLump(knobs, ki++, J, 0.055, 0.05, 0.062, tmp2.subVectors(J, A));   // the elbow, or the knee
      putLump(knobs, ki++, W2, 0.026, 0.022, 0.03, null);
      // the hand: along the forearm's line, flat to the ground; curled under while it's up
      hdir.set(W2.x - J.x, 0, W2.z - J.z).normalize(); side.set(hdir.z, 0, -hdir.x);
      const lift = l.foot.y / SC, curl = Math.min(1, lift * 7), creep = l.t < 0 ? 0.25 * Math.max(0, Math.sin(t * 2.2 + l.ph)) * (1 - S.speed / 4) : 0;
      PC.copy(W2).addScaledVector(hdir, 0.045); PC.y = W2.y - 0.02;
      putLump(palms, l.i, PC, 0.042, 0.018, 0.06, hdir);
      const n = l.fingers, inward = l.a.x > 0 ? 1 : -1;
      for (let f = 0; f < n; f++) {
        const thumb = f === n - 1, L = FL[f], sp2 = thumb ? -0.95 : (f - 1.5) * 0.3, a = Math.atan2(hdir.x, hdir.z) + sp2 * (l.i < 2 ? 1 : 0.8) * inward;
        const dir = tmp2.set(Math.sin(a), 0, Math.cos(a));
        // a finger arched like a spider's leg: up from the hand to its first knuckle, down to the tip on the ground
        const cu = Math.min(1, curl + (f === 1 ? creep : f === 3 ? creep * 0.6 : 0));
        K0.copy(PC).addScaledVector(dir, thumb ? 0.025 : 0.05); K0.y = PC.y + 0.005;
        K1.copy(K0).addScaledVector(dir, L[0] * (1 - 0.3 * cu)); K1.y = K0.y + 0.04 + 0.02 * cu;
        K2.copy(K1).addScaledVector(dir, L[1] * (1 - 0.8 * cu)); K2.y = Math.max(0.012, K1.y - 0.035 - 0.05 * cu);
        TP.copy(K2).addScaledVector(dir, L[2] * (1 - 1.6 * cu)); TP.y = Math.max(0.004, K2.y - 0.045 - 0.02 * cu);
        put(phals, fi++, K0, K1, 0.012); put(phals, fi++, K1, K2, 0.01); put(phals, fi++, K2, TP, 0.008);
        putLump(knobs, ki++, K1, 0.014, 0.013, 0.015, null); putLump(knobs, ki++, K2, 0.011, 0.01, 0.012, null);
      }
    }
    for (const m of [uppers, lowers, phals, knobs, palms]) m.instanceMatrix.needsUpdate = true;
  }

  // The head: small jerks, snapping from one angle to the next; looking at `at` (world), and when it looks at you, tilting
  // right over to one side.
  function look(dt, t, at, k) {
    const fast = S.state === 'chase' || S.state === 'pass';
    if (t > S.twAt) { S.twAt = t + 0.1 + R() * (fast ? 0.2 : 0.9); S.tw = R(); S.hr = (R() - 0.5) * (fast ? 0.4 : 0.9); }
    const amp = S.state === 'posed' ? 0.3 : 1;
    let yaw = (S.tw - 0.5) * 0.5 * amp, pitch = 0.25 + (S.tw - 0.5) * 0.2 * amp - S.rise * 0.2;
    if (at) {
      toL(at, P); const ay = Math.atan2(P.x, P.z - 0.6), ap = -Math.atan2(P.y - 0.45 - S.rise * 0.6, Math.hypot(P.x, P.z));
      yaw = lerp(yaw, clamp(ay, -1.3, 1.3), k); pitch = lerp(pitch, clamp(ap, -0.7, 0.7), k);
    }
    // tilting at you: over, in a few jerks, and held
    const tiltTo = fast ? 0 : k * 0.85 * S.tiltSide;
    if (Math.abs(tiltTo - S.tilt) > 0.2 && R() < dt * 6) S.tilt += (tiltTo - S.tilt) * (0.4 + R() * 0.4);
    if (k < 0.1 && R() < dt * 0.3) S.tiltSide = R() < 0.5 ? -1 : 1;
    // not smoothly: most of the way at once, then still
    S.hx = damp(S.hx, yaw, 24, dt); S.hy = damp(S.hy, pitch, 24, dt);
    headG.rotation.set(S.hy, S.hx, S.hr * (S.state === 'posed' ? 0.4 : 0.6) + S.tilt, 'YXZ');
    for (const [i, tl] of tails.entries()) tl.rotation.z = (i ? -0.2 : 0.1) - S.tilt * 0.7 + Math.sin(t * 1.7 + i * 2) * 0.12;   // (hanging)
  }

  // The fits: a twitch now and then (a hand jerked up and slapped down, the head snapped round, the back shuddering); dead
  // still for a moment; rising up on its limbs, slowly, far higher than it should, and dropping all at once.
  function fits(dt, t, d) {
    const st = S.state, quiet = st === 'watch' || st === 'stalk' || st === 'stay' || st === 'look';
    S.shud = Math.max(0, S.shud - dt * 4);
    if (quiet && R() < dt * 0.5) {
      const l = LIMBS[Math.floor(R() * 4)];
      if (l.t < 0) { l.from.copy(l.foot); l.to.copy(l.foot); l.dur = 0.13; l.t = 0; l.lift = 0.22 * SC; }
      S.twAt = t; S.shud = 1;
    }
    if (st === 'watch' || st === 'stalk' || st === 'stay') {
      if (S.riseWant && t > S.riseT) S.riseWant = 0;
      else if (!S.riseWant && S.rise < 0.05 && R() < dt * (st === 'watch' ? 0.35 : st === 'stay' ? 0.05 : 0.12) && S.speed < 0.5) { S.riseWant = 1; S.riseT = t + 1.6 + R() * 2.2; }
      if (S.freeze <= 0 && S.rise < 0.05 && R() < dt * (st === 'stalk' ? 0.4 : 0.15)) S.freeze = 0.4 + R() * 1.1;
    } else S.riseWant = 0;
    if (st === 'chase' && d > 22 && S.freeze <= 0 && R() < dt * 0.25) S.freeze = 0.22 + R() * 0.25;   // a dead stop, mid-charge, then on
    // up slowly, down at once
    S.rise = S.riseWant ? Math.min(1, S.rise + dt / 1.4) : Math.max(0, S.rise - dt / 0.16);
  }

  // ----- what it does -----
  const set = (state, timer = 0) => { S.state = state; S.t = 0; S.timer = timer; };
  const me3 = V(0, 0, 0);
  // Out on the Plain, where you are (me: x, z and which way you face, fx fz).
  function hunt(dt, t, me) {
    const dx = me.x - S.x, dz = me.z - S.z, d = Math.hypot(dx, dz), toMe = Math.atan2(dx, dz);
    let at = me3.set(me.x, 1.6, me.z), lookK = 1;
    switch (S.state) {
      case 'posed': case 'look': set('flee'); break;
      case 'hidden':
        S.want = 0; S.speed = 0;
        if (S.t > S.timer) {   // at the edge of what you can see, ahead of you more or less
          const a = Math.atan2(me.fx, me.fz) + (R() - 0.5) * 1.1, r = 66 + R() * 10;
          S.x = me.x + Math.sin(a) * r; S.z = me.z + Math.cos(a) * r; S.yaw = a + Math.PI; plant();
          set('watch', 3 + R() * 3); events.appear?.(V(S.x, 0.8, S.z));
        }
        break;
      case 'watch':
        S.want = 0; S.yaw += angTo(S.yaw, toMe) * Math.min(1, dt * 2);
        if ((S.t > S.timer && !S.riseWant) || d < 42) set('stalk', 5 + R() * 4);
        break;
      case 'stalk':   // nearer, in fits and starts
        S.stopT -= dt;
        if (S.stopT < -1 - R() * 1.5) S.stopT = 0.4 + R() * 1.2;
        S.want = S.stopT > 0 || S.rise > 0.05 ? 0 : 1.8;
        S.yaw += angTo(S.yaw, toMe) * Math.min(1, dt * 3);
        if (S.t > S.timer || d < 34) { set('chase'); S.riseWant = 0; S.shrieked = false; S.speed = Math.max(S.speed, 2.5); events.charge?.(V(S.x, 0.8, S.z)); }
        break;
      case 'chase': {
        S.want = Math.min(13, 3 + S.t * 2.4);
        S.speed = Math.max(S.speed, S.want * 0.8);
        S.yaw += angTo(S.yaw, toMe) * Math.min(1, dt * 4) + Math.sin(t * 9) * 0.25 * dt;   // (weaving a little as it scuttles)
        if (!S.shrieked && d < 19) { S.shrieked = true; events.shriek?.(V(S.x, 0.9, S.z)); }
        if (d < 9 || S.t > 14) {   // past you, close, on whichever side it's already on
          const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), lat = (S.x - me.x) * fz - (S.z - me.z) * fx;
          S.pass = { fx, fz, side: Math.abs(lat) > 0.3 ? Math.sign(lat) : (R() < 0.5 ? -1 : 1) };
          set('pass');
        }
        break;
      }
      case 'pass': {
        const { fx, fz, side } = S.pass, along = (S.x - me.x) * fx + (S.z - me.z) * fz;
        S.want = 13; S.speed = Math.max(S.speed, 10);
        // aim for a point beside you, 2.6 m off, then straight on
        const tx = me.x - fz * side * 2.6 + fx * 30, tz = me.z + fx * side * 2.6 + fz * 30;
        if (along < 0) S.yaw += angTo(S.yaw, Math.atan2(tx - S.x, tz - S.z)) * Math.min(1, dt * 12);
        // never closer than 2.2 m going by (its limbs reach a metre and more out from it)
        const lat = (S.x - me.x) * fz - (S.z - me.z) * fx;
        if (Math.abs(along) < 3 && Math.abs(lat) < 2.2) { const k = (Math.sign(lat) || side) * (2.2 - Math.abs(lat)) * Math.min(1, dt * 10); S.x += fz * k; S.z -= fx * k; }
        lookK = along < 0 ? 1 : 0;
        if (along > 0 && d > 80) { set('hidden', 22 + R() * 24); }
        break;
      }
      case 'flee': flee(dt); at = null; break;
      default: break;
    }
    return [at, lookK, d];
  }
  // Away from the painting into the haze, faster as it goes.
  function flee(dt) {
    S.want = Math.min(8, 1 + S.t * 3);
    S.yaw += angTo(S.yaw, Math.atan2(-1, -0.45)) * Math.min(1, dt * 1.5);
    if (Math.hypot(S.x, S.z) > 85) set('hidden', 14 + R() * 8);
  }
  // From B3, through the painting (me: where you'd be out here, in front of the frame at z = d from it).
  function watched(dt, t, me, drawn) {
    let at = null, lookK = 0;
    if (S.state === 'posed') {
      S.want = 0;
      if (me.d < 3.2) { set('look'); events.notice?.(V(S.x, 0.8, S.z)); }
    } else if (S.state === 'look') {
      at = me3.set(me.x, 1.6, me.z); lookK = Math.min(1, S.t * 1.5);
      if (S.t > 1.7) { set('flee'); events.flee?.(V(S.x, 0.8, S.z)); }
    } else if (S.state === 'flee') flee(dt);
    else if (!drawn && me.d > 5) { S.x = POSE.x; S.z = POSE.z; S.yaw = POSE.yaw; S.speed = S.want = 0; plant(); set('posed'); }   // back where it was, unseen
    else if (S.state !== 'hidden') { S.want = 0; }
    return [at, lookK, 99];
  }

  return {
    root, S,
    /** A frame of it: `me` where you are out here ({ x, z, fx, fz }, and d: how far in front of the frame); `plain`: you're
     *  out here (else on B3, looking through it, `drawn` if the painting's drawn this frame). */
    update(dt, t, me, plain, drawn) {
      // dead still: nothing moves, not even its head (never while it's going past you)
      if (S.freeze > 0 && S.state !== 'pass') { S.freeze -= dt; if (S.freeze > 0) return; }
      S.t += dt;
      const [at, lookK, d] = plain ? hunt(dt, t, me) : watched(dt, t, me, drawn);
      fits(dt, t, d);
      // speed: up quickly, down quicker; a lurch now and then on the way
      S.speed = damp(S.speed, S.want, S.want > S.speed ? 2.2 : 4, dt);
      if (S.speed > 0.5 && R() < dt * 0.6) S.lurch = 1;
      S.lurch = Math.max(0, S.lurch - dt * 3);
      const v = S.speed * (1 - S.lurch * 0.5);
      S.x += Math.sin(S.yaw) * v * dt; S.z += Math.cos(S.yaw) * v * dt;
      const vis = S.state !== 'hidden';
      root.visible = vis;
      if (!vis) return;
      root.position.set(S.x, 0, S.z); root.rotation.y = S.yaw;
      legs(dt, t);
      look(dt, t, at, lookK);
    },
    /** Put it d m in front of you (me), coming at you, already running (for looking). */
    charge(me, d = 20) {
      S.x = me.x + me.fx * d; S.z = me.z + me.fz * d; S.yaw = Math.atan2(-me.fx, -me.fz); S.rise = S.riseWant = S.freeze = 0; plant();
      set('chase'); S.t = 3; S.speed = S.want = 10; S.shrieked = d < 19;
    },
    hide(timer) { set('hidden', timer); },
    /** Stand it at (x, z) facing yaw, still, its head on you (for looking); rise: risen up (0 to 1). */
    stage(x, z, yaw, rise = 0) { S.x = x; S.z = z; S.yaw = yaw; S.speed = S.want = 0; S.freeze = 0; S.rise = rise; S.riseWant = rise ? 1 : 0; S.riseT = rise ? 1e9 : 0; plant(); set('stay'); },
    pose() { S.x = POSE.x; S.z = POSE.z; S.yaw = POSE.yaw; S.speed = S.want = 0; S.rise = S.riseWant = S.freeze = 0; plant(); set('posed'); },
    dist: (x, z) => Math.hypot(S.x - x, S.z - z),
  };
}
