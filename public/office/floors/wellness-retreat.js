// The wellness floor's jacuzzi (floors/wellness.js), in the south-west corner past the changing rooms: a raised travertine
// deck along the west glass with the tub sunk into it, so sitting in the water your eyes are over the sill and the city's
// right there. Walk in (or click it) and you're sitting in it: slower, eyes just over the bubbling water, a
// gentle sway, steam curling off it, the jets churning; walk out to get out.
//
// And in the hall past the changing rooms, a float room: a small dark room behind a door with a white pod in it. Click
// the pod to open it, again to get in: the lid comes down, the lights fade to black, the floor's sound falls away to a
// slow heartbeat and breathing, and the view drifts as you float. Move, Esc or click to get out.

import * as THREE from 'three';
import { EYE, mat } from '../util.js';
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
    k.box(M.stoneWall, 0.04, DECK.top, d - 0.004, DECK.x1 + 0.022, DECK.top / 2, mz);   // (beside the deck's edge, its back and ends just inside the steps')
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
    // The wall and the bench's front, turned inside out (seen from within: faces and normals in); the deck's floor isn't
    // under the tub, so you see down into it.
    const inward = (g) => {
      const ix = g.index.array, n = g.attributes.normal;
      for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
      for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
      return g;
    };
    const wall = inward(new THREE.CylinderGeometry(J.r, J.r, DECK.top - F, 48, 1, true)); wall.translate(J.x, (DECK.top + F) / 2, J.z);
    k.geo(tileM, uvWorld(wall, 1.6, 'wall'));
    const seat = new THREE.RingGeometry(ri, J.r, 48); seat.rotateX(-Math.PI / 2); seat.translate(J.x, B, J.z); k.geo(tileM, seat);
    const front = inward(new THREE.CylinderGeometry(ri, ri, B - F, 48, 1, true)); front.translate(J.x, (B + F) / 2, J.z); k.geo(tileM, front);
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
        // Fine froth, thickest over the jets and thinning between them, rather than blobs across the whole surface.
        float f = smoothstep(0.45, 0.85, boil * 1.3 + churn * 0.15 + jets * 0.75 * (0.6 + 0.4 * sin(time * 8.0 + r * 11.0))) * (0.35 + 0.65 * min(jets * 1.6, 1.0));
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

  installFloat(ctx, W);

  // Every frame, wherever you are: its lights (a soft teal by day, brighter at night).
  const tick = W.tick;
  W.tick = (dt, t) => { tick?.(dt, t); glow.value = 0.25 + 0.75 * W.lampK; };
}

function installFloat(ctx, W) {
  const { G, M, kit, solid, R } = W, { toast } = ctx;
  const sound = W.sound;
  // The room: x 0..4, z -15..-11 (walls in wellness.js), its door in the north wall. Inside it's all charcoal felt over the
  // walls (covering their coves), a dark ceiling and slate underfoot; a blue glow round the pod's foot and a dim warm
  // light by the door.
  const RM = { x0: 0.06, x1: 3.94, z0: -14.9, z1: -11.06 }, P = { x: 2.0, z: -13.35, l: 1.3, w: 0.75, h: 0.55 };
  const feltM = new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 1 }), k = kit();
  {
    const mx = (RM.x0 + RM.x1) / 2, mz = (RM.z0 + RM.z1) / 2, w = RM.x1 - RM.x0, d = RM.z1 - RM.z0, o = 0.08;
    k.box(feltM, w, 3.28, 0.02, mx, 1.64, RM.z0 + 0.04); k.box(feltM, 0.02, 3.28, d, RM.x0 + o, 1.64, mz); k.box(feltM, 0.02, 3.28, d, RM.x1 - o, 1.64, mz);
    for (const [a, b] of [[RM.x0, 1.2], [2.2, RM.x1]]) k.box(feltM, b - a, 3.28, 0.02, (a + b) / 2, 1.64, RM.z1 - o);
    k.box(feltM, 0.98, 1.0, 0.02, 1.7, 2.75, RM.z1 - o);   // over the door
    k.box(feltM, w, 0.03, d, mx, 2.98, mz);   // under the beams
    k.box(mat('#202326', { roughness: 0.7 }), w, 0.01, d, mx, 0.006, mz);
    // A fluted acoustic panel behind the pod's head end and a little shelf with a folded towel and a robe hook by the door.
    for (let i = 0; i < 18; i++) k.box(mat('#26292d', { roughness: 0.95 }), 0.1, 2.2, 0.04, RM.x0 + 0.5 + i * 0.16, 1.4, RM.z0 + 0.08);
    k.box(M.oak, 0.5, 0.03, 0.28, 0.45, 0.95, RM.z1 - 0.25); k.box(M.towel, 0.32, 0.08, 0.22, 0.45, 1.01, RM.z1 - 0.25);
    k.box(M.brass, 0.03, 0.12, 0.03, 3.5, 1.7, RM.z1 - 0.12);
    const blue = new THREE.MeshStandardMaterial({ color: '#1d3a5a', emissive: '#3f8fe0', emissiveIntensity: 1.2, roughness: 0.8 });
    k.geo(blue, new THREE.TorusGeometry(1, 0.012, 6, 64).scale(P.l + 0.08, P.w + 0.08, 1).rotateX(Math.PI / 2).translate(P.x, 0.02, P.z));
    const warm = new THREE.MeshStandardMaterial({ color: '#3a2a1a', emissive: '#ffb062', emissiveIntensity: 0.9, roughness: 0.8 });
    k.box(warm, 0.18, 0.05, 0.03, 0.9, 1.9, RM.z1 - 0.1);
    k.flush(G);
  }
  W.hingedDoor({ name: 'Float room door', hx: 1.2, hz: -11, swing: 1 });
  W.plaque('FLOAT', 0.88, 1.5, -10.93, 0);
  // The pod: a white shell, its lid hinged along the back (south) and lifting at the front; inside, a shallow pool lit blue.
  const shellM = new THREE.MeshStandardMaterial({ color: '#f1f2f0', roughness: 0.18, metalness: 0.05, side: THREE.DoubleSide });
  const innerM = new THREE.MeshStandardMaterial({ color: '#0d1a26', emissive: '#2a6fb0', emissiveIntensity: 0.35, roughness: 0.2 });
  const half = (top) => new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2);
  const pod = new THREE.Group(); pod.position.set(P.x, 0, P.z); G.add(pod);
  const hull = new THREE.Mesh(half(false).scale(P.l, P.h, P.w).translate(0, P.h, 0), shellM); hull.castShadow = true; pod.add(hull);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 40).scale(P.l * 0.92, P.w * 0.88, 1).rotateX(-Math.PI / 2).translate(0, P.h - 0.12, 0), innerM); pod.add(pool);
  const rimM = new THREE.MeshStandardMaterial({ color: '#cfd6dc', emissive: '#58a8ff', emissiveIntensity: 0.6, roughness: 0.4 });
  pod.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.018, 6, 64).scale(P.l, P.w, 1).rotateX(Math.PI / 2).translate(0, P.h, 0), rimM));
  const hinge = new THREE.Group(); hinge.position.set(0, P.h, -P.w); pod.add(hinge);   // along the back edge
  // The lid: the glossy shell outside, a matte liner inside (seen as it lifts), a hinge at the back and a gas strut each side.
  const outM = shellM.clone(); outM.side = THREE.FrontSide;
  const lid = new THREE.Mesh(half(true).scale(P.l * 1.01, P.h * 0.75, P.w * 1.01).translate(0, 0, P.w), outM); lid.castShadow = true; hinge.add(lid);
  // The liner turned inside out (front faces, normals in) rather than BackSide: the AO pass draws front faces only, and
  // would take its depth from the wall behind, striping it.
  const linerM = new THREE.MeshStandardMaterial({ color: '#dfe4e8', roughness: 0.85 });
  const lg = half(true).scale(P.l * 0.995, P.h * 0.74, P.w * 0.995).translate(0, 0, P.w), li = lg.index.array, ln = lg.attributes.normal;
  for (let i = 0; i < li.length; i += 3) [li[i + 1], li[i + 2]] = [li[i + 2], li[i + 1]];
  for (let i = 0; i < ln.count; i++) ln.setXYZ(i, -ln.getX(i), -ln.getY(i), -ln.getZ(i));
  hinge.add(new THREE.Mesh(lg, linerM));
  hinge.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.022, 6, 64).scale(P.l * 1.01, P.w * 1.01, 1).rotateX(Math.PI / 2).translate(0, 0, P.w), shellM));   // its rim
  const steelM = mat('#9aa1a8', { metalness: 0.9, roughness: 0.3 });
  pod.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.08).translate(0, P.h, -P.w - 0.02), steelM));
  const struts = [-1, 1].map((sx) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8).translate(0, 0.5, 0), steelM); pod.add(m);
    // From the hull's rim at the side (just inside it) to the lid's, the same point when it's shut.
    return { m, foot: new THREE.Vector3(sx * P.l * 0.8, P.h - 0.12, -P.w * 0.55), top: new THREE.Vector3(sx * P.l * 0.78, -0.02, P.w * 0.42) };
  });
  const sv = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const strutFx = () => {
    hinge.updateMatrix();
    for (const s of struts) {
      sv.copy(s.top).applyMatrix4(hinge.matrix).sub(s.foot);
      s.m.position.copy(s.foot); s.m.scale.set(1, sv.length(), 1); s.m.quaternion.setFromUnitVectors(UP, sv.normalize());
    }
  };
  strutFx();
  // Stars on the lid's underside, for while it's shut over you.
  {
    const pts = [];
    for (let i = 0; i < 90; i++) {
      const u = R() * Math.PI * 2, v = 0.15 + R() * 0.8, x = Math.cos(u) * Math.sin(v * Math.PI / 2), z = Math.sin(u) * Math.sin(v * Math.PI / 2), y = Math.cos(v * Math.PI / 2);
      pts.push(x * P.l * 0.98, y * P.h * 0.73, z * P.w * 0.98 + P.w);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    hinge.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe4ff', size: 0.012, transparent: true, opacity: 0.8 })));
  }
  solid(P.x, P.z, P.l * 2 + 0.05, P.w * 2 + 0.05);
  W.hits.push(ctx.hitBox(G, P.l * 2, 1.0, P.w * 2, P.x, 0.5, P.z, { action: 'wellness-float', reach: 2.8 }));

  // ----- floating -----
  const S = { lid: 0, lidTo: 0, closeAt: 0, t: 0, dark: 0, inside: false };
  W.float = S;
  const float = {
    name: 'Float pod',
    start() {
      S.lidTo = 1; S.t = 0; S.inside = true;
      Object.assign(ctx.player, { x: P.x, z: P.z, seated: false, seat: null, yaw: -Math.PI / 2, pitch: 1.25 });
      W.lift.eye = 0.6;
      sound.splash(P.x, P.z, false);
      toast('Float pod · lie back · the lid comes down and the lights go out · move, <kbd>Esc</kbd> or click to get out');
    },
    fx(dt) {
      S.t += dt;
      if (S.t > 2.5) S.lidTo = 0;
      // Floating: a slow breath in the view and the faintest drift and roll.
      const d = S.dark;
      W.lift.bob = Math.sin(S.t * 0.42) * 0.012;
      W.lift.roll = Math.sin(S.t * 0.11) * 0.05 * d + Math.sin(S.t * 0.29) * 0.012 * d;
      W.lift.dx = Math.sin(S.t * 0.07) * 0.06 * d; W.lift.dz = Math.sin(S.t * 0.05 + 1) * 0.04 * d;
      ctx.player.yaw += Math.sin(S.t * 0.09) * 0.0008 * d;
    },
    key: () => false,
    stop() {
      S.inside = false; S.lidTo = 1; S.closeAt = 6;
      Object.assign(ctx.player, { x: P.x, z: RM.z1 - 0.6, yaw: Math.PI, pitch: -0.25 });
      W.lift.bob = W.lift.roll = W.lift.dx = W.lift.dz = 0;
      sound.splash(P.x, P.z, false);
      toast('Out of the float pod · slowly now');
    },
  };
  ctx.action('wellness-float', {
    hover: () => `<b>Float pod</b><div class="m">Skin-warm salt water · total darkness · near silence</div><div class="k">${
      W.using === float ? 'Click to get out' : S.lidTo ? 'Click to get in' : 'Click to open it'}</div>`,
    click: () => {
      if (W.using === float) { W.stop(); return; }
      if (!S.lidTo) { S.lidTo = 1; S.closeAt = 20; sound.latch(P.x, 0.8, P.z, true); return; }
      W.use(float);
    },
  });
  W.fxs.push((dt) => {
    if (S.closeAt > 0 && !S.inside && (S.closeAt -= dt) <= 0) S.lidTo = 0;
    if (S.lid !== S.lidTo) {
      S.lid = S.lidTo > S.lid ? Math.min(1, S.lid + dt / 1.6) : Math.max(0, S.lid - dt / 2.2);
      hinge.rotation.x = -1.15 * (S.lid * S.lid * (3 - 2 * S.lid));
      strutFx();
    }
    // The lights fade to black once the lid's down over you, and back when you're out.
    const want = S.inside && S.lid < 0.05 ? 1 : 0;
    S.dark = want ? Math.min(1, S.dark + dt / 8) : Math.max(0, S.dark - dt / 2.5);
    if (S.dark > 0.003) W.wantVeil = [`radial-gradient(ellipse at 50% 50%, rgba(0,0,0,${(0.9 + 0.1 * S.dark).toFixed(2)}), #000)`, 0.985 * S.dark];
    sound.float(S.dark);
  });
  W.leaves.push(() => { S.inside = false; S.dark = 0; S.lid = S.lidTo = 0; hinge.rotation.x = 0; strutFx(); sound.float(0); });
}
