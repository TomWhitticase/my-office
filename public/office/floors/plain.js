// THE PLAIN: behind a painting on the restricted level (B3, restricted.js). In a dim hall deep in B3, on the end wall, a
// small dark oil painting in an old gilt frame: an ochre plain under a burning sky, a city on fire far off, a black
// square hanging over it, and in front, crouched in the dust, something with a bandaged head (plain-painting.js has
// where, the frame and the paint). From across the room it's a picture. Closer, the paint has depth: the haze moves,
// the embers drift, and the thing in it turns its head to you and goes. Walk into it and you're there.
// It's seamless both ways (systems/portal.js): the painting is a window, drawn as paint while you're off it and clean as
// you reach it, the two floors' looks and sounds meeting at its plane; behind you, out there, the same frame hangs in the
// air with B3 through it (and from behind, the back of a canvas), and you walk back out the way you came.
// Out there (plain-world.js): the plain, endless, the city that's always as far away, the lamp, the table and chest, the
// gazebo, the bones. The thing hunts you (plain-crawler.js), and never quite gets you. The sound (plain-sound.js): wind,
// fire, people screaming and calling for help a long way off, metal, a whisper just behind your head. Over all of it, its
// own painted look (plain-painting.js makePaintPass).
// Its own unlisted, carless floor; your car waits on B3. Nothing of it is built until you first come near the painting
// (or a reload puts you out there), and nothing of it runs unless you're out there or looking in.
// Debug: ctx.plain (window.__office.plain): .go(x, z, yaw, pitch) stands you out there (the frame's at the origin, its
// plane z = 0, the way in toward -z; yaw 0 faces the city), .painting(x, z, yaw, pitch) on B3 in front of it (x across,
// z out from it into the room; yaw 0 faces it), .crawler(d) sets it on you from d m ahead, .stage(x, z, yaw, rise) puts it
// there looking at you (rise 1: risen up).

import * as THREE from 'three';
import { rng } from '../util.js';
import { makePaintingDoor } from './painting-door.js';
import { findPainting, makeFrame, paintPane, paintPassShader, PAINT } from './plain-painting.js';
import { buildWorld } from './plain-world.js';
import { makeCrawler } from './plain-crawler.js';
import { makeSound } from './plain-sound.js';

const N = -5;

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // three takes a uuid from Math.random for every object: what's made here takes them from its own stream, so it doesn't
  // shift what's built after it (see helicopter.js); the same when the rest is built later.
  const random = Math.random;
  Math.random = rng(1890);
  try { setup(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function setup(ctx) {
  const { camera, style, mapCtx, addFloor } = ctx;
  const pl = { n: N, label: 'THE PLAIN', title: 'The Plain', unlisted: true, carless: true, liftGone: true, home: -3, on: false, composer: null,
    colliders: [], hits: [], scene: new THREE.Scene(), sound: { kind: 'plain', steps: true }, built: false };
  let world = null, crawler = null, sound = null;
  const R = rng(1894), fwd = new THREE.Vector3();
  style.textContent += `.of-plain .of-clock { font-size: 0 !important; } .of-plain .of-clock::after { content: '—'; font-size: 12px; }
    .of-plain .of-count { font-size: 0; } .of-plain .of-count::after { content: '·'; font-size: 12px; }`;
  const door = makePaintingDoor(ctx, pl, {
    at: findPainting(ctx.restr), size: PAINT, key: 'plain', near: 32, seed: 1891, hud: 'of-plain',
    frame: (R2, o) => makeFrame(R2, o), paint: (p) => paintPane(p), pass: paintPassShader,
    build(R2) {   // (R2: rng(1892), the frames' after it)
      world = buildWorld(pl, R2);
      sound = makeSound(ctx);
      const near = (p) => ctx.away === pl && p.distanceTo(camera.position) < 40;
      crawler = makeCrawler(rng(1893), {
        tap: (p, s) => { if (near(p)) sound.tap(p, s); },
        shriek: (p) => { if (ctx.away === pl) sound.shriek(p); },
        charge: (p) => { if (ctx.away === pl) sound.charge(p); },
        notice: (p) => { if (door.st.near < 5) sound.creak(p); },
      });
      pl.scene.add(crawler.root);
      return {
        sound,
        // out there, as seen from B3: the world round where you'd be, and the thing in the painting
        seen(mp, dt, t, d, drawn) { world.view(mp, t); crawler.update(dt, t, { x: mp.x, z: mp.z, fx: 0, fz: -1, d }, false, drawn); },
        fx(dt, t) {
          world.view(camera.position, t);
          const fw = camera.getWorldDirection(fwd);
          crawler.update(dt, t, { x: camera.position.x, z: camera.position.z, fx: fw.x / (Math.hypot(fw.x, fw.z) || 1), fz: fw.z / (Math.hypot(fw.x, fw.z) || 1), d: -camera.position.z }, true, false);
          sound.fx(dt, t);
        },
        arrive() { door.pose(0, -2.4, 0, 0); crawler.hide(12 + R() * 8); },   // (debug, a reload: in front of the frame, the city ahead)
      };
    },
    hover: {
      painting: (near) => (near < 1.6 ? '<b>The painting</b><div class="k">Warm air coming off it, and grit. Walk into it</div>'
        : '<b>A small oil painting</b><div class="k">Dust, a city burning, something crouched in the foreground. No name on it. The paint looks wet</div>'),
      frame: (front) => (front ? '<b>The painting</b><div class="k">B3 through it, the yellow rooms. Walk back into it</div>'
        : '<b>The back of a canvas</b><div class="k">Hanging in the air, from nothing</div>'),
    },
  });
  pl.bound = () => {};
  pl.save = () => ({});
  pl.restore = (s, p) => door.restore(p);

  // ----- the map: dust, and which way the frame is -----
  pl.map = () => {
    const c = mapCtx, MW = 440, MH = 330, K = 3;
    c.clearRect(0, 0, MW, MH);
    c.fillStyle = 'rgba(150,104,52,.35)'; c.fillRect(0, 0, MW, MH);
    const dx = -camera.position.x, dz = -camera.position.z;
    let px = MW / 2 + dx * K, pz = MH / 2 + 10 + dz * K;
    const inside = px > 24 && px < MW - 24 && pz > 50 && pz < MH - 20;
    if (!inside) { const s = Math.min((MW / 2 - 24) / Math.abs(dx * K || 1e-6), (MH / 2 - 40) / Math.abs(dz * K || 1e-6)); px = MW / 2 + dx * K * s; pz = MH / 2 + 10 + dz * K * s; }
    c.fillStyle = 'rgba(214,176,96,.95)';
    if (inside) { c.fillRect(px - 6, pz - 2, 12, 4); c.font = '600 15px system-ui'; c.fillText('the frame', px + 10, pz + 5); }
    else { const a = Math.atan2(dz, dx); c.save(); c.translate(px, pz); c.rotate(a); c.beginPath(); c.moveTo(10, 0); c.lineTo(-6, -7); c.lineTo(-6, 7); c.fill(); c.restore(); }
    c.save(); c.translate(MW / 2, MH / 2 + 10); c.rotate(-ctx.player.yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
    c.font = '600 20px system-ui'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('—', 16, 30);
  };

  ctx.plain = {
    pl, st: door.st, F: door.F, at: door.at, get built() { return pl.built; }, get crawlerS() { return crawler?.S; }, build: door.build,
    go: (x = 0, z = -2.4, yaw = 0, pitch = 0) => door.go(x, z, yaw, pitch),
    painting: door.painting,
    crawler(d = 20) { if (ctx.away !== pl) return false; const f = camera.getWorldDirection(fwd), n = Math.hypot(f.x, f.z) || 1; crawler.charge({ x: ctx.player.x, z: ctx.player.z, fx: f.x / n, fz: f.z / n }, d); return true; },
    stage(x, z, yaw, rise = 0) { if (!crawler) return false; crawler.stage(x, z, yaw, rise); return true; },
    into: door.into,
  };
  addFloor(pl);
}
