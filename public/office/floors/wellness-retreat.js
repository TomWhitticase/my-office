// The wellness floor's jacuzzi (floors/wellness.js), in the south-west corner past the changing rooms: a raised travertine
// deck along the west glass with the tub sunk into it, so sitting in the water your eyes are over the sill and the city's
// right there. Walk in (or click it) and you're sitting in it: slower, eyes just over the bubbling water, a
// gentle sway, steam curling off it, the jets churning; walk out to get out.

import * as THREE from 'three';
import { EYE } from '../util.js';
import { causticMaterial } from './wellness-pool.js';

export function installRetreat(ctx, W) {
  const { G, M, kit, solid, uvWorld, Y } = W, { toast, camera } = ctx;
  const sound = W.sound;

  // ----- the deck -----
  // From the glass (x -20) to two steps down at x -13..-12.4, between the south wall and the yoga studio's (z -9.5); its top
  // is the windows' sill height. A hole in it for the tub.
  const DECK = { x0: -19.9, x1: -13.0, z0: -14.9, z1: -9.58, top: 0.45 }, STEP = 0.3;
  const J = { x: -17.0, z: -12.25, r: 1.3, rim: 1.6, water: 0.4, in: false, t: 0, tip: false };
  W.jacuzzi = J;
  const k = kit();
  {
    const s = new THREE.Shape();
    s.moveTo(DECK.x0, -DECK.z1); s.lineTo(DECK.x1, -DECK.z1); s.lineTo(DECK.x1, -DECK.z0); s.lineTo(DECK.x0, -DECK.z0); s.closePath();
    const hole = new THREE.Path(); hole.absarc(J.x, -J.z, J.r, 0, Math.PI * 2, false); s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s, 48); g.rotateX(-Math.PI / 2); g.translate(0, DECK.top, 0);
    k.geo(M.stone, uvWorld(g, 2.4));
    // The riser and the two steps down to the room.
    const mz = (DECK.z0 + DECK.z1) / 2, d = DECK.z1 - DECK.z0;
    k.box(M.stoneWall, 0.04, DECK.top, d, DECK.x1, DECK.top / 2, mz);
    for (let i = 0; i < 2; i++) {
      const h = DECK.top * (2 - i) / 3, x = DECK.x1 + STEP * (i + 0.5);
      k.box(M.stone, STEP, h, d, x, h / 2, mz);
      k.box(M.cove, 0.02, 0.012, d, x + STEP / 2 + 0.005, h - 0.03, mz);   // a lit nosing
    }
  }
  // Where your feet are: up the steps, on the deck, down in the tub.
  const deckAt = (x, z) => {
    if (z < DECK.z0 - 0.06 || z > DECK.z1 + 0.06 || x > DECK.x1 + 2 * STEP) return 0;
    return x > DECK.x1 + STEP ? DECK.top / 3 : x > DECK.x1 ? DECK.top * 2 / 3 : DECK.top;
  };
  const tubAt = (x, z) => Math.hypot(x - J.x, z - J.z) < J.r - 0.15;
  const SIT = J.water + 0.5;   // your eyes, sitting in it
  W.groundExtra = (x, z) => (tubAt(x, z) ? SIT - EYE : deckAt(x, z));
  W.paceExtra = (x, z) => (tubAt(x, z) ? 0.4 : 1);

  // ----- the tub -----
  // Tiled inside with a bench round it, lit from below (more at night), six jets; a stone lip round the hole.
  const glow = { value: 0 };
  const TU = { time: W.U.time, causK: W.U.causK, waterY: { value: Y + J.water }, glow };
  const tileM = causticMaterial({ map: W.poolTile, roughness: 0.3 }, TU);
  {
    const B = J.water - 0.42, F = J.water - 0.82, ri = J.r - 0.32;   // the bench's seat, the floor, the bench's front
    // The wall, turned inside out (seen from within); the deck's floor isn't under the tub, so you see down into it.
    const wall = new THREE.CylinderGeometry(J.r, J.r, DECK.top - F, 48, 1, true); wall.scale(-1, 1, 1); wall.translate(J.x, (DECK.top + F) / 2, J.z);
    k.geo(tileM, uvWorld(wall, 1.6, 'wall'));
    const seat = new THREE.RingGeometry(ri, J.r, 48); seat.rotateX(-Math.PI / 2); seat.translate(J.x, B, J.z); k.geo(tileM, seat);
    const front = new THREE.CylinderGeometry(ri, ri, B - F, 48, 1, true); front.translate(J.x, (B + F) / 2, J.z); k.geo(tileM, front);
    const floor = new THREE.CircleGeometry(ri, 48); floor.rotateX(-Math.PI / 2); floor.translate(J.x, F, J.z); k.geo(tileM, floor);
    const lip = new THREE.RingGeometry(J.r, J.rim, 48); lip.rotateX(-Math.PI / 2); lip.translate(J.x, DECK.top + 0.025, J.z); k.geo(M.stoneWall, lip);
    const edge = new THREE.CylinderGeometry(J.rim, J.rim, 0.025, 48, 1, true); edge.translate(J.x, DECK.top + 0.0125, J.z); k.geo(M.stoneWall, edge);
    const inner = new THREE.CylinderGeometry(J.r, J.r, 0.03, 48, 1, true); inner.translate(J.x, DECK.top + 0.01, J.z); k.geo(M.stoneWall, inner);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.3, jx = J.x + Math.cos(a) * (J.r - 0.01), jz = J.z + Math.sin(a) * (J.r - 0.01);
      k.cyl(M.chrome, 0.035, 0.035, 0.02, jx, B + 0.18, jz, 12, Math.PI / 2, 0, -a + Math.PI / 2);
    }
    // A chrome rail down into it on the room's side.
    k.cyl(M.chrome, 0.02, 0.02, 0.85, J.x + J.r + 0.12, DECK.top + 0.4, J.z - 0.9, 10);
    k.cyl(M.chrome, 0.02, 0.02, 0.5, J.x + J.r - 0.12, DECK.top + 0.82, J.z - 0.9, 10, 0, Math.PI / 2);
    W.hits.push(ctx.hitBox(G, J.r * 2, 0.3, J.r * 2, J.x, J.water, J.z, { action: 'wellness-jacuzzi', reach: 3.5 }));
  }
  // The water, and the foam the jets churn up over it.
  const water = new THREE.Mesh(new THREE.CircleGeometry(J.r, 48).rotateX(-Math.PI / 2).translate(J.x, J.water, J.z), W.water());
  water.renderOrder = 2; water.layers.set(1); G.add(water);
  const foamM = new THREE.ShaderMaterial({
    uniforms: { time: W.U.time, k: { value: 1 }, c: { value: new THREE.Vector2(J.x, J.z) } }, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float time, k; uniform vec2 c; varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + 1.0), f.x), f.y); }
      void main() {
        vec2 q = vW.xz - c; float r = length(q); vec2 dir = q / max(r, 1e-3);
        float boil = noise(q * 15.0 + vec2(0.0, time * 2.4)) * noise(q * 27.0 - vec2(time * 3.1, time));
        float churn = noise(q * 5.0 - dir * time * 1.4 + time * 0.3);
        float jets = 0.0;
        for (int i = 0; i < 6; i++) { float a = float(i) * 1.0472 + 0.3; vec2 j = vec2(cos(a), sin(a)) * 1.05; jets += exp(-dot(q - j, q - j) * 5.0); }
        float f = smoothstep(0.35, 0.8, boil * 1.5 + churn * 0.35 + jets * 0.6 * (0.6 + 0.4 * sin(time * 8.0 + r * 11.0)));
        float speck = step(0.9, noise(q * 55.0 + vec2(time * 3.0, -time * 2.0))) * 0.5;
        gl_FragColor = vec4(vec3(0.94, 0.98, 0.98), (f * 0.45 + speck) * k * (1.0 - smoothstep(J_R - 0.08, J_R, r)));
      }`.replaceAll('J_R', J.r.toFixed(2)),
  });
  const foam = new THREE.Mesh(new THREE.CircleGeometry(J.r, 48).rotateX(-Math.PI / 2).translate(J.x, J.water + 0.006, J.z), foamM);
  foam.renderOrder = 3; foam.layers.set(1); G.add(foam);

  // ----- loungers on the deck either side of it, facing the glass -----
  for (const z of [-14.05, -10.45]) {
    const x = -14.2, gr = new THREE.Group(); gr.position.set(x, DECK.top, z); gr.rotation.y = -Math.PI / 2; G.add(gr);
    const lk = kit();
    for (const s of [-1, 1]) lk.box(M.oak, 0.05, 0.3, 1.95, s * 0.33, 0.15, 0);
    lk.box(M.oak, 0.7, 0.05, 1.9, 0, 0.3, 0);
    lk.box(M.linen, 0.66, 0.09, 1.2, 0, 0.37, 0.32);
    const back = new THREE.BoxGeometry(0.66, 0.09, 0.72); back.translate(0, 0, -0.36); back.rotateX(0.75); back.translate(0, 0.37, -0.25); lk.geo(M.linen, back);
    lk.box(M.towel, 0.5, 0.02, 0.7, 0, 0.425, 0.45);
    lk.flush(gr);
    const st = W.seat(gr, 'Lounger', 0, 0.95); W.markSeat(gr, st);
    solid(x, z, 1.95, 0.72);
  }
  // A side table by the south one, clear of the way from the steps to the tub.
  k.cyl(M.oak, 0.22, 0.22, 0.03, -13.5, DECK.top + 0.42, -13.3, 20); k.cyl(M.black, 0.02, 0.02, 0.4, -13.5, DECK.top + 0.2, -13.3, 8);
  for (const dx of [-0.08, 0.1]) k.cyl(M.linen, 0.035, 0.03, 0.07, -13.5 + dx, DECK.top + 0.47, -13.25 + dx, 12);
  solid(-13.5, -13.3, 0.5, 0.5);
  k.flush(G);
  W.planter(-8.7, -14.3, 0.9); W.planter(-8.7, -10.2, 0.9);

  // ----- getting in -----
  const getIn = () => {
    Object.assign(ctx.player, { x: J.x - 0.75, z: J.z, seated: false, seat: null, yaw: Math.PI / 2, pitch: -0.05 });   // facing the glass
  };
  ctx.action('wellness-jacuzzi', {
    hover: () => `<b>Jacuzzi · 38 °C</b><div class="k">${J.in ? 'Walk out to get out' : 'Click to get in, or walk in'}</div>`,
    click: () => { if (!J.in) getIn(); },
  });

  // ----- each frame -----
  W.fxs.push((dt, t) => {
    const p = ctx.player, was = J.in, d = Math.hypot(p.x - J.x, p.z - J.z);
    J.in = tubAt(p.x, p.z);
    if (J.in && !was) {
      sound.splash(p.x, p.z, false); W.ripple(p.x, p.z, 0.03); J.t = 0;
      if (!J.tip) { J.tip = true; toast('Jacuzzi · 38 °C · the city’s right there · walk out to get out'); }
    }
    if (J.in && ctx.mode === 'free') {
      J.t += dt;
      camera.position.y += Math.sin(J.t * 1.4) * 0.012 + Math.sin(J.t * 3.7) * 0.004;
      camera.rotation.z += Math.sin(J.t * 0.9) * 0.006;
    }
    // Steam off it and the jets stirring the surface, while you're anywhere near.
    if (d < 12) {
      if (Math.random() < dt * (J.in ? 3 : 1.6)) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * (J.r - 0.2);
        W.puff?.(J.x + Math.cos(a) * r, J.water + 0.15, J.z + Math.sin(a) * r, { vy: 0.12 + Math.random() * 0.1, life: 4 + Math.random() * 3, size: 0.35, grow: 0.35, a: 0.2, ceil: 3.1 });
      }
      if (Math.random() < dt * 4) { const a = Math.floor(Math.random() * 6) * Math.PI / 3 + 0.3; W.ripple(J.x + Math.cos(a) * 1.0, J.z + Math.sin(a) * 1.0, 0.006); }
    }
  });
  W.leaves.push(() => { J.in = false; });

  // Every frame, wherever you are: its lights (a soft teal by day, brighter at night).
  const tick = W.tick;
  W.tick = (dt, t) => { tick?.(dt, t); glow.value = 0.25 + 0.75 * W.lampK; };
}
