// The city on the Plain's horizon (floors/plain-world.js), burning: cathedrals, a long nave under a steep roof, two west
// towers in tiers to an octagon and a spire, a spire or a dome over the crossing, buttresses down the sides, pinnacles,
// and houses packed round them; the spires ragged, some broken off, some leaning. Every face has pointed windows in rows,
// most dark, many lit from inside by fire and flickering, more of them low down; the fire along their feet. Smoke goes up
// off it in columns lit from under, and embers. Two ranks, the far one further into the haze.
// One merged mesh with its own shader (the windows are worked out from where on a face you are, not modelled), so the
// whole skyline is a draw call; its haze is its own (the scene's fog would swallow it whole at that distance).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Built a piece at a time (yields between pieces: plain-world.js steps through it), returns { city, towers }.
export function* buildCity(R, time, haze) {
  const city = new THREE.Group(), parts = [];
  // a piece: its geometry, which building (for the windows' pattern), whether it has windows
  const add = (g, bid, win) => {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('bid', new THREE.BufferAttribute(new Float32Array(n).fill(bid), 1));
    g.setAttribute('win', new THREE.BufferAttribute(new Float32Array(n).fill(win), 1));
    parts.push(g);
    return g;
  };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // a roof: a triangular prism along x (span w across z, length l), its ridge h up
  const roof = (l, w, h, x, y, z) => {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false }).translate(0, 0, -l / 2).rotateY(Math.PI / 2).translate(x, y, z);
  };
  // a spire: a cone, its sides ragged; broken off short (the top a jagged stump), and leaning, now and then
  const spire = (r, h, sides, x, y, z) => {
    const broken = R() < 0.3, cut = broken ? 0.35 + R() * 0.35 : 1;
    const g = new THREE.ConeGeometry(r, h, sides, 6), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = p.getY(i) / h + 0.5;   // 0 at its foot, 1 at the tip
      if (v > 0.02) { p.setX(i, p.getX(i) + (R() - 0.5) * r * 0.22 * v); p.setZ(i, p.getZ(i) + (R() - 0.5) * r * 0.22 * v); }
      if (v > cut) p.setY(i, (cut - 0.5) * h - R() * h * 0.08);
    }
    g.computeVertexNormals();
    g.translate(0, h / 2, 0);
    if (R() < 0.25) g.rotateZ((R() - 0.5) * 0.25).rotateX((R() - 0.5) * 0.15);
    return g.translate(x, y, z);
  };
  const pinnacle = (x, y, z, s, bid) => add(spire(1.3 * s, (5 + R() * 6) * s, 4, x, y, z), bid, 0);
  let bid = 0;

  function cathedral(x, z, s) {
    const b = ++bid, L = (40 + R() * 40) * s, W = (14 + R() * 8) * s, H = (22 + R() * 14) * s, sink = 3;
    add(box(L, H + sink, W, x, (H - sink) / 2, z), b, 1);   // the nave
    add(roof(L - 0.4, W * 1.04, W * 0.62, x, H, z), b, 0);
    add(box(W * 0.8, H * 0.82 + sink, W * 1.9, x + L * 0.18, (H * 0.82 - sink) / 2, z), b, 1);   // the transepts
    add(roof(W * 1.9 - 0.4, W * 0.84, W * 0.5, 0, 0, 0).rotateY(Math.PI / 2).translate(x + L * 0.18, H * 0.82, z), b, 0);   // (its ridge across the nave's)
    for (let k = -3; k <= 3; k++) {   // buttresses, leaning in to the nave's walls
      const bx = x + k * L / 7.5;
      for (const sd of [-1, 1]) {
        const g = box(1.6 * s, H * 0.75, 1.6 * s, 0, H * 0.375, 0).rotateX(sd * 0.32).translate(bx, -1, z + sd * (W / 2 + 4 * s));
        add(g, b, 0);
        pinnacle(bx, H * 0.72, z + sd * (W / 2 + 6.5 * s), s * 0.7, b);
      }
    }
    // the west front: two towers in tiers, octagons, spires
    const x0 = x - L / 2 - W * 0.15, tw = W * 0.42;
    for (const sd of [-1, 1]) {
      const tz = z + sd * W * 0.36, th = H * (1.25 + R() * 0.35);
      add(box(tw, th + sink, tw, x0, (th - sink) / 2, tz), b, 1);
      add(box(tw * 0.78, th * 0.3, tw * 0.78, x0, th + th * 0.15, tz), b, 1);
      const top = th * 1.3;
      add(new THREE.CylinderGeometry(tw * 0.34, tw * 0.38, th * 0.22, 8).translate(x0, top + th * 0.11, tz), b, 1);
      add(spire(tw * 0.42, (18 + R() * 30) * s, 8, x0, top + th * 0.22, tz), b, 0);
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pinnacle(x0 + px * tw * 0.4, th * 1.3, tz + pz * tw * 0.4, s * 0.8, b);
    }
    add(box(tw * 0.9, H * 0.9, W * 0.3, x0, H * 0.45, z), b, 1);   // between them, the great door's gable
    add(roof(tw * 0.9, W * 0.3 + 1, W * 0.25, x0, H * 0.9, z), b, 0);
    // the crossing: a tall spire, or a dome on a drum
    const cx = x + L * 0.18;
    if (R() < 0.6) {
      add(new THREE.CylinderGeometry(W * 0.32, W * 0.34, H * 0.4, 8).translate(cx, H + H * 0.2, z), b, 1);
      add(spire(W * 0.36, (22 + R() * 38) * s, 8, cx, H * 1.4, z), b, 0);
    } else {
      add(new THREE.CylinderGeometry(W * 0.4, W * 0.42, H * 0.35, 12).translate(cx, H + H * 0.175, z), b, 1);
      add(new THREE.SphereGeometry(W * 0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.25, 1).translate(cx, H * 1.35, z), b, 0);
      add(spire(W * 0.06, 14 * s, 6, cx, H * 1.35 + W * 0.5, z), b, 0);
    }
  }
  // houses and halls packed in round them: a block, a steep roof, now and then a turret
  function house(x, z, s) {
    const b = ++bid, w = (8 + R() * 16) * s, d = (8 + R() * 10) * s, h = (10 + R() * 24) * s, yaw = R() < 0.5 ? 0 : Math.PI / 2;
    add(box(w, h + 3, d, 0, (h - 3) / 2, 0).rotateY(yaw).translate(x, 0, z), b, 1);
    add(roof(w - 0.3, d * 1.05, d * (0.5 + R() * 0.5), 0, h, 0).rotateY(yaw).translate(x, 0, z), b, 0);
    if (R() < 0.35) {
      const r = (2 + R() * 2.5) * s, th = h * (1.2 + R() * 0.8), tx = x + (R() - 0.5) * w * 0.6, tz = z + (R() - 0.5) * d * 0.6;
      add(new THREE.CylinderGeometry(r, r, th, 8).translate(tx, th / 2 - 2, tz), b, 1);
      add(spire(r * 1.3, (6 + R() * 12) * s, 8, tx, th - 2, tz), b, 0);
    }
  }
  // the near rank: cathedrals across it, houses round them; the far rank, bigger, further into the haze
  const towers = [];
  for (let i = 0; i < 9; i++) { const x = -520 + i * 130 + (R() - 0.5) * 60, z = -455 - R() * 40; cathedral(x, z, 1.5); towers.push({ x, z }); if (i % 3 === 2) yield; }
  for (let i = 0; i < 110; i++) house((R() - 0.5) * 1150, -425 - R() * 75, 1.3);
  yield;
  for (let i = 0; i < 7; i++) { const x = -700 + i * 230 + (R() - 0.5) * 80, z = -650 - R() * 80; cathedral(x, z, 2); towers.push({ x, z }); if (i % 3 === 2) yield; }
  for (let i = 0; i < 60; i++) house((R() - 0.5) * 1600, -600 - R() * 120, 1.8);
  yield;

  const M = new THREE.ShaderMaterial({
    uniforms: { time, haze: { value: haze } },
    vertexShader: `attribute float bid, win; varying vec3 vL, vN; varying float vB, vW, vD;
      void main() { vL = position; vN = normal; vB = bid; vW = win;
        vec4 w = modelMatrix * vec4(position, 1.0); vD = distance(w.xyz, cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time; uniform vec3 haze; varying vec3 vL, vN; varying float vB, vW, vD;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vN);
        // where on the face: across it and up it
        vec2 q = abs(n.x) > abs(n.z) ? vec2(vL.z, vL.y) : vec2(vL.x, vL.y);
        vec2 cell = vec2(4.2, 8.5), id = floor(q / cell), f = fract(q / cell);
        float wx = abs(f.x - 0.5) / 0.16, top = 0.58 + 0.22 * (1.0 - wx);   // a lancet: straight sides, a pointed head
        float aa = 0.06;
        float inW = smoothstep(1.0, 1.0 - aa * 4.0, wx) * smoothstep(0.14, 0.14 + aa, f.y) * smoothstep(top, top - aa, f.y) * vW * step(0.3, abs(n.x) + abs(n.z));
        float r = h1(id + vB * 17.3), up = clamp(vL.y / 70.0, 0.0, 1.0);
        float lit = step(0.35 + up * 0.5, r);   // more of them lit low down
        float fl = 0.55 + 0.45 * sin(time * (1.7 + h1(id + 2.1) * 4.0) + r * 40.0) * sin(time * 0.8 + h1(id + 5.3) * 30.0);
        // the stone: near black up high, lit warm from the fire below; its faces shaded a little apart
        vec3 dark = vec3(0.1, 0.06, 0.035), warm = vec3(0.6, 0.24, 0.08);
        vec3 c = mix(warm, dark, smoothstep(0.0, 40.0, vL.y)) * (0.72 + 0.28 * max(0.0, dot(n, normalize(vec3(0.35, 0.3, 1.0)))));
        float base = 1.0 - smoothstep(0.0, 12.0, vL.y), fb = 0.6 + 0.4 * sin(time * 3.1 + vL.x * 0.07) * sin(time * 1.3 + vL.x * 0.031);
        c += vec3(1.0, 0.42, 0.1) * base * fb * 0.7;
        vec3 wc = vec3(1.0, 0.48, 0.13) * (1.4 + fl * 1.4);
        c = mix(c * (1.0 - inW * 0.45), wc, inW * lit);
        float fo = clamp(1.0 - exp(-vD * 0.0012), 0.0, 0.62) * (0.85 + 0.15 * smoothstep(20.0, 120.0, vL.y));
        gl_FragColor = vec4(mix(c, haze, fo) + wc * inW * lit * (1.0 - fo) * 0.35, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(mergeGeometries(parts), M);
  mesh.frustumCulled = false;
  city.add(mesh);
  return { city, towers };
}
