// THE ACROBATS' COAST: behind a painting on the restricted level (B3, restricted.js). Far out in B3's west, on the end
// wall of a long room, a picture in a dark frame: dusk on a rocky northern coast, a circus ring on the granite, towers of
// acrobats standing on each other's shoulders, and going away from them over the sea, a great arched viaduct with a
// steam train on it, under a crescent moon (acro-painting.js has where, the frame and the paint). Come up to it and the
// paint gives way to a window; walk into it and you're there, the frame hanging in the air behind you with B3 through it
// (painting-door.js, systems/portal.js: seamless both ways).
// Out there (acro-plan.js lays it out): the ring, teal and gold, its rim, its seats and audience (acro-ring.js); the
// towers of acrobats in a line from the ring out to sea, where, the further they are from you, the more they're the
// viaduct's carved stone piers and arches (acro-viaduct.js: one morph, per fragment, by distance); the train that comes
// in along the deck and goes back out (acro-train.js); granite, pines, the calm sea, the moon in it, gulls (acro-land.js);
// a stair up the ridge to the halt on the headland and the deck, where you can walk out along the viaduct beside the
// track. The sound: the sea, gulls, a band somewhere, the crowd, the train (acro-sound.js). Its own soft painted look.
// What you can do: click a tower and it performs (the top acrobat flips; one without, a wave of balance up it); C to clap
// (V to cheer) and the ring's towers bow, the audience joining in; sit in the audience or on the halt's bench; ring the
// bell at the halt and the train comes.
// Its own unlisted, carless floor; your car waits on B3. Nothing of it is built until you first come near the painting
// (or a reload puts you out there), and nothing of it runs unless you're out there or looking in.
// Debug: ctx.acro (window.__office.acro): .go(x, z, yaw, pitch) stands you out there (the frame at the origin, its plane
// z = 0, the way in toward -z; yaw 0 faces the ring); .painting(x, z, yaw, pitch) on B3 in front of it; .su(s, u, yaw,
// pitch, deck) stands you on the line's own coordinates (deck: up on the viaduct); .flip(i), .bow(), .clap(), .bell(),
// .sit(i) (a seat in the audience), .train(s, state) puts the train somewhere, .comp() redraws the painting's picture.

import * as THREE from 'three';
import { EYE, rng, sstep } from '../util.js';
import { makePaintingDoor } from './painting-door.js';
import { findAcro, frame, paintPane, passShader, SIZE } from './acro-painting.js';
import { CEN, D, N, SEA, RING, RIM, FLOOR_Y, Y_DECK, DECK0, DECK_W, WALK, OPEN, PLATEAU, STAIR, toWorld, toSU, ground as groundAt, terrain, stairAt, tierAt } from './acro-plan.js';
import { buildLand, SKY } from './acro-land.js';
import { buildViaduct } from './acro-viaduct.js';
import { buildRing, GAP } from './acro-ring.js';
import { buildTrain } from './acro-train.js';
import { makeSound } from './acro-sound.js';

const N_FLOOR = -8, S_WALK = 280;   // how far out along the deck you can walk before the haze has you

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // (three takes a uuid from Math.random for every object: what's made here takes them from its own stream: see plain.js)
  const random = Math.random;
  Math.random = rng(2290);
  try { setup(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function setup(ctx) {
  const { camera, renderer, mapCtx, addFloor, style } = ctx;
  const fl = { n: N_FLOOR, label: 'THE COAST', title: 'The coast', unlisted: true, carless: true, liftGone: true, home: -3, on: false, composer: null,
    colliders: [], hits: [], scene: new THREE.Scene(), sound: { kind: 'acro', steps: true }, built: false };
  const time = { value: 0 };
  let land = null, via = null, ring = null, train = null, sound = null, comp = null;
  const W = { deck: false };   // where you are: up on the viaduct or not
  style.textContent += `.of-acro .of-clock { font-size: 0 !important; } .of-acro .of-clock::after { content: 'dusk'; font-size: 12px; }`;

  const door = makePaintingDoor(ctx, fl, {
    at: findAcro(ctx.restr), size: SIZE, key: 'acro', near: 32, seed: 2291, hud: 'of-acro',
    frame, pass: passShader,
    paint: (() => { let n = 0; return (p) => paintPane(p, n++ === 0 ? comp.rt.texture : null); })(),
    build(R) {
      land = buildLand(fl, R, time);
      via = buildViaduct(fl, rng(2293), time);
      ring = buildRing(fl, rng(2294), time);
      train = buildTrain(fl, rng(2295), time, (ev, a) => sound?.train(ev, a, train));
      sound = makeSound(ctx, { train: () => train, ring: () => ring });
      fl.look = { exposure: 1.0, hemi: 1.25, sky: new THREE.Color('#a9bde2'), ground: new THREE.Color('#5d5866'), env: 0.0, bloom: 0.8, grade: 1.0,
        lights: [...land.lights, [ring.ringL, 22], [ring.haltL, 8]], aoSkip1: true };
      fl.hits.push(...via.hits, ...ring.hits);
      comp = makeComp();
      return {
        sound, cols: [...via.cols, ...ring.cols],
        // out here, as seen from B3: the world round where you'd be
        seen(mp, dt, t, d) { tick(mp, dt, t); if (d < 40) comp.draw(t, d); },
        fx(dt, t) { tick(camera.position, dt, t); sound.fx(dt, t, W); },
        arrive() { door.pose(0, -2.4, 0, 0); W.deck = false; },   // (debug, a reload: in front of the frame, the ring ahead)
      };
    },
    hover: {
      painting: (near) => (near < 1.6 ? '<b>The painting</b><div class="k">Sea air coming off it, cool, and a band playing somewhere. Walk into it</div>'
        : '<b>A painting</b><div class="k">Dusk on a rocky coast: acrobats on each other’s shoulders, and a viaduct over the sea that looks like them. No name on it</div>'),
      frame: (front) => (front ? '<b>The painting</b><div class="k">B3 through it, the yellow rooms. Walk back into it</div>'
        : '<b>The back of a canvas</b><div class="k">Hanging in the air over the rocks</div>'),
    },
  });

  // ----- the composed picture, for the painting seen from across the room: the world from a fixed camera in the ring -----
  function makeComp() {
    const rt = new THREE.WebGLRenderTarget(704, 592, { type: THREE.HalfFloatType });
    const cam = new THREE.PerspectiveCamera(58, SIZE.w / SIZE.h, 0.1, 3000);
    const c = toWorld(-2.6, -7.4), lookAt = toWorld(9, 1.5);
    cam.position.set(c.x, 1.1, c.z); cam.lookAt(lookAt.x, 9.2, lookAt.z); cam.updateMatrixWorld();
    let last = -1;
    return {
      rt, cam,
      // drawn now and then while you're near enough to see it (it's paint: it doesn't need every frame)
      draw(t, d) {
        if (last >= 0 && t - last < (d < 8 ? 0.12 : 1.0)) return;
        last = t;
        tick(cam.position, 0, t, true);
        const L = fl.look, prev = renderer.getRenderTarget();
        fl.hemi.intensity = L.hemi; fl.hemi.color.copy(L.sky); fl.hemi.groundColor.copy(L.ground);
        for (const [l, k] of L.lights) l.intensity = k;
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(fl.scene, cam); renderer.setRenderTarget(prev);
      },
    };
  }

  // ----- everything that moves, for whichever camera's about to draw it -----
  let lastT = 0;
  function tick(p, dt, t, still = false) {
    time.value = t;
    if (!still && t !== lastT) { lastT = t; land.update(t); ring.update(dt, t); train.update(dt, t); ring.signal(train.S.state === 'in'); }
    via.update(p, t);
  }

  // ----- standing and walking: the ground, the deck, the stair and the seats; where you can't go -----
  const inRing = (x, z) => Math.hypot(x - CEN.x, z - CEN.z);
  const landing = (s, u) => s > OPEN[0] && s < OPEN[1] && u >= DECK_W - 0.05 && u <= PLATEAU.u0 + 0.8;
  fl.ground = (x, z) => {
    const { s, u } = toSU(x, z);
    if (W.deck || landing(s, u)) { if (s >= DECK0 && (Math.abs(u) <= DECK_W || landing(s, u))) return Y_DECK - 0.02; }
    if (inRing(x, z) < RING) return FLOOR_Y;
    return groundAt(x, z, false);
  };
  const slope = (x, z) => { const e = 0.45, h = terrain(x, z); return Math.max(Math.abs(terrain(x + e, z) - h), Math.abs(terrain(x - e, z) - h), Math.abs(terrain(x, z + e) - h), Math.abs(terrain(x, z - e) - h)) / e; };
  // can you stand at (x, z)? (deck: up on the viaduct)
  function standable(x, z, deck) {
    const { s, u } = toSU(x, z);
    if (deck) return (s >= DECK0 + 0.5 && s <= S_WALK && u >= WALK[0] && u <= WALK[1]) || landing(s, u);
    if (landing(s, u)) return true;
    const r = inRing(x, z);
    if (r < RING - 0.3) return true;
    if (r < RING + RIM + 0.3) { const a = Math.atan2(x - CEN.x, z - CEN.z), da = Math.abs(Math.atan2(Math.sin(a - GAP.a), Math.cos(a - GAP.a))); return da < GAP.half - 0.035; }
    if (stairAt(s, u) != null) return u > STAIR.u0 + 0.2 && u < STAIR.u1 - 0.2;
    if (tierAt(s, u) != null) return true;
    if (s > DECK0 && Math.abs(u) < DECK_W + 0.3 && terrain(x, z) < Y_DECK - 3) { /* under the deck: the rocks there */ }
    const h = terrain(x, z);
    if (h < SEA + 0.35) return false;
    return slope(x, z) < 0.9;
  }
  const lastOK = { x: 0, z: -2.4, y: 0 };
  fl.bound = (p) => {
    const isYou = p === ctx.player;
    if (!isYou) { if (!standable(p.x, p.z, W.deck)) p.x += 0.2; return; }   // (a spot tried by the menu or a reload: not free)
    const tryAt = (x, z) => {
      if (!standable(x, z, W.deck)) return false;
      const y = fl.ground(x, z);
      return Math.abs(y - lastOK.y) < 0.6;
    };
    if (!tryAt(p.x, p.z)) {
      if (tryAt(p.x, lastOK.z)) p.z = lastOK.z;
      else if (tryAt(lastOK.x, p.z)) p.x = lastOK.x;
      else { p.x = lastOK.x; p.z = lastOK.z; }
    }
    // onto the deck from the headland, and off it again
    const { s, u } = toSU(p.x, p.z);
    if (!W.deck && s >= DECK0 && u < DECK_W - 0.05 && Math.abs(lastOK.y - Y_DECK) < 0.3) W.deck = true;
    else if (W.deck && u > DECK_W + 0.05) W.deck = false;
    lastOK.x = p.x; lastOK.z = p.z; lastOK.y = fl.ground(p.x, p.z);
  };
  const stand = (x, z, yaw, pitch, deck = false) => {
    W.deck = deck;
    door.pose(x, z, yaw, pitch);
    const y = fl.ground(x, z);
    Object.assign(lastOK, { x, z, y }); ctx.player.fy = y;
    ctx.setCam({ x, y: EYE + y, z, yaw, pitch });
  };
  fl.unstick = () => { stand(0, -2.4, 0, 0); return true; };
  fl.save = () => ({ deck: W.deck });
  fl.restore = (s, p) => {
    const deck = !!s?.deck;
    if (standable(p.x, p.z, deck) && !(Math.abs(p.z) < 0.4 && Math.abs(p.x) < SIZE.w / 2 + 0.5)) stand(p.x, p.z, p.yaw, p.pitch, deck);
    else stand(0, -2.4, p.yaw ?? 0, 0);
    return true;
  };

  // ----- what you can do -----
  const near = (x, z, r) => Math.hypot(ctx.player.x - x, ctx.player.z - z) < r;
  function cheer(kind) {
    if (ctx.away !== fl || ctx.mode !== 'free') return false;
    const t = time.value;
    sound?.you(kind);
    if (near(CEN.x, CEN.z, RING + 14)) { via.bow(t + 0.6); ring.clap(t + 0.3); sound?.applause(1.6); }
    return true;
  }
  ctx.key('KeyC', () => cheer('clap'));
  ctx.key('KeyV', () => cheer('cheer'));
  ctx.action('acro-tower', {
    hover: (h) => '<b>Acrobats</b><div class="k">Click: they perform · C to clap, V to cheer</div>',
    click: () => {
      const T = ctx.hover?.tower || null;
      const h = lastHover; if (!h) return;
      const t = time.value;
      if (via.flip(h, t)) { ring.gasp(t + 0.3); sound?.flip(h); setTimeout(() => { ring.clap(time.value); sound?.applause(1.2); }, 1500); }
      else sound?.creak(h);
      void T;
    },
  });
  // (the tower under the crosshair: hover.js keeps only a few of userData's fields, so it's found here)
  let lastHover = null;
  const ray = new THREE.Raycaster(), c0 = new THREE.Vector2();
  ctx.onFrame(() => {
    if (ctx.away !== fl || !via) { lastHover = null; return; }
    ray.setFromCamera(c0, camera); ray.far = 14;
    lastHover = ray.intersectObjects(via.hits, false)[0]?.object.userData.tower || null;
  }, 197);
  ctx.action('acro-bell', {
    hover: () => (train?.S.state === 'away' ? '<b>The bell</b><div class="k">Click to ring it for the train</div>' : '<b>The bell</b><div class="k">The train’s ' + (train?.S.state === 'stop' ? 'in' : 'on its way') + '</div>'),
    click: () => { ring.ring(); sound?.bell(ring.bellAt); if (train.call()) ctx.toast?.('Far out over the sea, a whistle answers'); },
  });

  // ----- the map: the coast, the ring, the line out to sea, you -----
  let mapImg = null;
  const MK = 2.2;   // map px a metre
  function drawMap() {
    const c = document.createElement('canvas'); c.width = c.height = 700; const g = c.getContext('2d'), img = g.createImageData(700, 700);
    for (let j = 0; j < 700; j++) for (let i = 0; i < 700; i++) {
      const x = (i - 350) / MK, z = (j - 350) / MK, h = terrain(x, z), k = (j * 700 + i) * 4;
      const landA = h > SEA + 0.1;
      img.data[k] = landA ? 150 + h * 3 : 60; img.data[k + 1] = landA ? 150 + h * 3 : 92; img.data[k + 2] = landA ? 160 : 140; img.data[k + 3] = landA ? 110 : 70;
    }
    g.putImageData(img, 0, 0);
    const P = (x, z) => [350 + x * MK, 350 + z * MK];
    g.strokeStyle = 'rgba(232,200,100,.9)'; g.lineWidth = 2; g.beginPath(); g.arc(...P(CEN.x, CEN.z), RING * MK, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(200,200,215,.8)'; g.lineWidth = DECK_W * 2 * MK; g.beginPath(); g.moveTo(...P(toWorld(DECK0, 0).x, toWorld(DECK0, 0).z)); g.lineTo(...P(toWorld(400, 0).x, toWorld(400, 0).z)); g.stroke();
    g.fillStyle = 'rgba(240,210,120,.95)'; for (let k = 0; k < 20; k++) { const w = toWorld(-3 + k * 9, 0); g.beginPath(); g.arc(...P(w.x, w.z), 2.2, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(214,190,150,.95)'; g.fillRect(...P(-0.65, -0.05), 1.3 * MK, 3);
    return c;
  }
  fl.map = () => {
    const c = mapCtx, MW = 440, MH = 330;
    mapImg ||= drawMap();
    c.clearRect(0, 0, MW, MH);
    c.fillStyle = 'rgba(40,60,100,.35)'; c.fillRect(0, 0, MW, MH);
    const px = 350 + camera.position.x * MK, pz = 350 + camera.position.z * MK;
    c.drawImage(mapImg, px - MW / 2, pz - MH / 2 - 10, MW, MH, 0, 0, MW, MH);
    c.save(); c.translate(MW / 2, MH / 2 + 10); c.rotate(-ctx.player.yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill();
    c.restore();
    c.font = '600 18px system-ui'; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText('the coast', 16, 30);
  };

  // ----- getting you there, for the tests and for looking -----
  const su = (s, u, yaw = 0, pitch = 0, deck = false) => {
    if (!door.go(0, -2.4, 0, 0)) return false;
    const w = toWorld(s, u); stand(w.x, w.z, yaw, pitch, deck); return true;
  };
  ctx.acro = {
    fl, st: door.st, F: door.F, at: door.at, W, get built() { return fl.built; }, build: door.build,
    get world() { return { land, via, ring, train, sound, comp }; },
    go: (x = 0, z = -2.4, yaw = 0, pitch = 0) => { if (!door.go(x, z, yaw, pitch)) return false; stand(x, z, yaw, pitch); return true; },
    painting: door.painting, into: door.into, su,
    flip(i = 0) { const T = via?.towers[i]; return !!T && via.flip(T, time.value); },
    bow() { via?.bow(time.value); ring?.clap(time.value); return !!via; },
    clap: () => cheer('clap'),
    bell() { if (!ring) return false; ring.ring(); return train.call(); },
    sit(i = 0) { const st = ring?.seats.filter((x) => !x.taken)[i]; if (!st) return false; su(0, 0); const w = st; stand(w.x, w.z, st.yaw + Math.PI, -0.05); Object.assign(ctx.player, { seated: true, seat: { x: st.x, z: st.z, rotY: st.yaw, eye: 1.18, floor: true }, eye: 1.18 }); return true; },
    train(s, state = 'stop') { if (!train) return false; train.stage(s, state); return true; },
    comp(t = time.value) { comp?.draw(t + 10, 1); },
  };
  addFloor(fl);
}
