// The restricted level's sounds (floors/restricted.js): the tubes buzzing over you, a little different room to room; a
// low drone from nowhere; your own steps on the wet carpet; the lift idling and chiming, fainter the further you go;
// thumps far off, someone's steps that stop when yours do, a phone ringing in a far room, a tape's garbled voice, and
// now and then a silence that's worse. All synthesised here, through the office's own audio (sounds.js `audio`), so its
// volume and M apply. Positions passed in are in the floor's own space (the car at z = 0).

import { LIFT } from '../util.js';

const TAU = Math.PI * 2;
const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [660, 1720], [490, 1350]];

export function makeSound(ctx, restr) {
  const { camera } = ctx;
  let A = null, B = null, out = null, loops = [], lamps = [], drone = null, ring = null;
  let thumpAt = 0, chimeAt = 0, walkT = 0, follow = null, last = null, stepAcc = 0, hushAt = 0, hushed = false, swellAt = 0;
  let baseHum = null, dreadK = 0, rumble = null, echoAt = null, bleedL = null;   // the creature (restricted-creature.js): how near, its rumble, your steps' echo
  const rnd = (a, b) => a + Math.random() * (b - a), nz = () => Math.random() * 2 - 1;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ----- synthesis -----
  function biq(type, f, q) {   // RBJ biquad, per sample
    const SR = A.ctx.sampleRate, w = TAU * f / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [a, 0, -a];
    const k0 = b0 / a0, k1 = b1 / a0, k2 = b2 / a0, a1 = -2 * c / a0, a2 = (1 - a) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => { const y = k0 * x + k1 * x1 + k2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  function make(sec, fn, peak = 0.9) {
    const SR = A.ctx.sampleRate, n = Math.ceil(sec * SR), b = A.ctx.createBuffer(1, n, SR), d = b.getChannelData(0);
    let m = 0;
    for (let k = 0; k < n; k++) { d[k] = fn(k / SR); m = Math.max(m, Math.abs(d[k])); }
    for (let k = 0; k < n; k++) d[k] *= (m ? peak / m : 0) * Math.min(1, (n - k) / (SR * 0.005));
    return b;
  }
  // A step on wet carpet: a soft low thud, the pile giving, a small squelch just after.
  function damp() {
    const lp = biq('lp', 240, 0.8), sq = biq('bp', rnd(1300, 1900), 2.2), at = rnd(0.035, 0.06);
    return make(0.32, (t) => lp(nz()) * Math.exp(-t / 0.035) * 4 + Math.sin(TAU * 68 * t) * Math.exp(-t / 0.04) * 0.5
      + (t > at ? sq(nz()) * Math.exp(-(t - at) / 0.03) * 0.9 : 0));
  }
  // A voice on an old tape: a buzzy source through two formants that jump syllable to syllable, slowing down, with wow,
  // hiss and dropouts. No words; at the end the same two syllables, three times, like a name.
  function tape() {
    const SR = A.ctx.sampleRate, len = 9.5, syl = [];
    for (let t = 0.4; t < 6.6;) { const d = rnd(0.11, 0.28); syl.push([t, d, pick(VOWELS)]); t += d + (Math.random() < 0.25 ? rnd(0.15, 0.5) : rnd(0.01, 0.05)); }
    const nameV = [pick(VOWELS), pick(VOWELS)];
    for (let k = 0; k < 3; k++) for (let s = 0; s < 2; s++) syl.push([6.9 + k * 0.8 + s * 0.26, 0.22, nameV[s]]);
    const hiss = biq('bp', 3500, 0.5), drop = Array.from({ length: 6 }, () => [rnd(0.5, 9), rnd(0.05, 0.25)]);
    let ph = 0, si = -1, f1 = null, f2 = null;
    const lp = biq('lp', 2600, 0.7);
    return make(len, (t) => {
      const wow = 1 + 0.045 * Math.sin(TAU * 0.55 * t) + 0.012 * Math.sin(TAU * 6.5 * t);
      ph += 84 * wow * (1 - 0.12 * t / len) / SR;
      const src = (ph % 1) * 2 - 1 + 0.25 * nz();
      while (si + 1 < syl.length && t >= syl[si + 1][0]) { si++; const [, , [a, b]] = syl[si]; f1 = biq('bp', a * 0.85, 6); f2 = biq('bp', b * 0.85, 8); }
      const s = syl[si], e = s && t < s[0] + s[1] ? Math.min(1, (t - s[0]) / 0.02, (s[0] + s[1] - t) / 0.05) : 0;
      const v = f1 ? (f1(src) + 0.5 * f2(src)) * e : 0;
      const gone = drop.some(([a, d]) => t > a && t < a + d);
      return lp(v * (gone ? 0.08 : 1) * 3 + hiss(nz()) * 0.25 + (Math.random() < 0.0004 ? nz() * 2 : 0));
    }, 0.8);
  }
  function build() {
    let lpn = 0;
    const lpd = biq('lp', 90, 0.7), n = (k, f) => Array.from({ length: k }, f);
    return {
      // Mains hum off the ballasts: 120 Hz and its harmonics (2 s, a whole number of cycles, so it loops clean).
      hum: make(2, (t) => Math.sin(TAU * 120 * t) + 0.45 * Math.sin(TAU * 240 * t + 0.4) + 0.08 * Math.sign(Math.sin(TAU * 120 * t))
        + 0.12 * Math.sin(TAU * 360 * t) + 0.05 * Math.sin(TAU * 480 * t) + 0.04 * nz()),
      buzz: make(0.3, (t) => (Math.sign(Math.sin(TAU * 120 * t)) * 0.5 + (Math.random() < 0.02 ? nz() * 3 : nz() * 0.3)) * Math.exp(-t / 0.12)),
      thump: make(1.2, (t) => { lpn += (nz() - lpn) * 0.02; return (Math.sin(TAU * 42 * t) * 0.8 + lpn * 4) * Math.exp(-t / 0.25); }),
      motor: make(2, (t) => 0.6 * Math.sin(TAU * 55 * t) + 0.3 * Math.sin(TAU * 110 * t) + 0.05 * nz()),
      // A drone with no source: low beating sines and a rumble, slowly breathing (8 s, whole cycles again).
      drone: make(8, (t) => 0.5 * Math.sin(TAU * 41 * t) + 0.35 * Math.sin(TAU * 41.5 * t + 1) + 0.22 * Math.sin(TAU * 61.5 * t) * (0.6 + 0.4 * Math.sin(TAU * t / 8))
        + lpd(nz()) * 6),
      // An old phone's bell: two bursts and a pause (3 s, looped).
      ring: make(3, (t) => ((t < 0.4 || (t > 0.6 && t < 1.0)) ? (Math.sin(TAU * 1050 * t) + 0.7 * Math.sin(TAU * 1310 * t)) * (0.65 + 0.35 * Math.sign(Math.sin(TAU * 25 * t))) : 0)),
      step: n(5, damp), tape: tape(), click: make(0.03, (t) => nz() * Math.exp(-t / 0.004)),
      beep: make(0.06, (t) => Math.sin(TAU * 1900 * t) * Math.min(1, t / 0.003)),
      deny: make(0.55, (t) => Math.sign(Math.sin(TAU * 92 * t)) * (t < 0.22 || t > 0.3 ? 1 : 0) * 0.6 + Math.sin(TAU * 184 * t) * 0.3),
      ok: make(0.32, (t) => Math.sin(TAU * (t < 0.12 ? 1320 : 1760) * t) * (t < 0.1 || t > 0.14 ? 1 : 0)),
      // The creature: ceiling grid creaking (stick-slip pulses through a resonance), something dragged over the tiles, a tile
      // lifted and set back, a fast skitter, and a rumble you feel more than hear (4 s, whole cycles, looped).
      creak: n(3, () => { const bp = biq('bp', rnd(500, 1100), 6), r0 = rnd(25, 60), r1 = rnd(70, 140); let ph = 0;
        return make(rnd(0.5, 0.9), (t) => { ph += (r0 + (r1 - r0) * t) / A.ctx.sampleRate; const pulse = ph % 1 < 0.04 ? nz() : 0; return bp(pulse * (0.4 + Math.random() * 0.6)) * Math.sin(Math.PI * Math.min(1, t / 0.8)); }); }),
      drag: (() => { const lp = biq('lp', 700, 0.7), bp = biq('bp', 1800, 1.5);
        return make(1.6, (t) => (lp(nz()) * 3 + bp(nz()) * 0.4) * (0.5 + 0.5 * Math.sin(TAU * 2.3 * t) ** 2) * Math.sin(Math.PI * t / 1.6)); })(),
      scrape: (() => { const bp = biq('bp', 2400, 2); return make(0.35, (t) => bp(nz()) * Math.sin(Math.PI * t / 0.35) + (t < 0.02 ? nz() : 0)); })(),
      clack: (() => { const lp = biq('lp', 900, 1), bp = biq('bp', 3200, 4); return make(0.2, (t) => lp(nz()) * Math.exp(-t / 0.02) * 3 + bp(nz()) * Math.exp(-t / 0.008)); })(),
      skitter: (() => { const hits = Array.from({ length: 22 }, (_, k) => k * 0.04 + Math.random() * 0.02), bp = biq('bp', 2600, 3);
        return make(1, (t) => bp(hits.reduce((a, h) => a + (t > h && t < h + 0.012 ? nz() * Math.exp(-(t - h) / 0.003) : 0), 0)) * (1 - t)); })(),
      rumble: make(4, (t) => (Math.sin(TAU * 31 * t) + 0.6 * Math.sin(TAU * 46.5 * t) + 0.3 * Math.sin(TAU * 62 * t)) * (0.6 + 0.4 * Math.sin(TAU * t / 4))),
    };
  }

  // ----- playback -----
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) { A = a; B = null; loops = []; lamps = []; baseHum = rumble = bleedL = null; out = A.ctx.createGain(); out.connect(A.master); }
    if (!B) B = build();
    return true;
  }
  const setPos = (p, x, y, z) => { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z + restr.z0; };
  function panner(x, y, z, ref = 2, roll = 1.1) {
    const p = A.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 10000;
    setPos(p, x, y, z); p.connect(out); return p;
  }
  // A one-shot: at (x, y, z), or all round you (x null) straight to the office's master (keypad beeps, your own steps:
  // they carry on through a silence). `lp` muffles it.
  function shot(buf, x, y, z, gain, { rate = 1, lp = 0, ref = 2, roll = 1.1, when = 0 } = {}) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    let head = src;
    if (lp) { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); head = f; }
    head.connect(g).connect(x === null ? A.master : panner(x, y, z, ref, roll));
    src.onended = () => src.disconnect();
    src.start(A.ctx.currentTime + when);
    return { src, g };
  }
  function loop(buf, gain, x, y, z, ref = 3, roll = 1) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; src.loopStart = Math.random() * buf.duration * 0.5; g.gain.value = 0;
    src.connect(g).connect(x === null ? out : panner(x, y, z, ref, roll));
    g.gain.setTargetAtTime(gain, A.ctx.currentTime, 1.2);
    src.start(); loops.push({ src, g });
    return { src, g };
  }
  // The four nearest tubes, each buzzing at its own pitch and through its own resonance (seeded by where it is).
  function lampVoices(near) {
    if (!lamps.length) for (let k = 0; k < 4; k++) {
      const src = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain(), p = panner(0, 2.6, 0, 1.2, 1.3);
      src.buffer = B.hum; src.loop = true; f.type = 'bandpass'; f.Q.value = 1.4; g.gain.value = 0;
      src.connect(f).connect(g).connect(p); src.start();
      lamps.push({ src, f, g, p, key: '' }); loops.push({ src, g });
    }
    const now = A.ctx.currentTime;
    lamps.forEach((v, k) => {
      const q = near[k];
      if (!q) { v.g.gain.setTargetAtTime(0, now, 0.2); v.key = ''; return; }
      const key = `${q.p.x},${q.p.z}`;
      if (key !== v.key) {
        v.key = key;
        const h = restr.h3(Math.round(q.p.x * 10), Math.round(q.p.z * 10), 61), h2 = restr.h3(Math.round(q.p.x * 10), Math.round(q.p.z * 10), 62);
        setPos(v.p, q.p.x, 2.65, q.p.z);
        v.src.playbackRate.setTargetAtTime(0.93 + h * 0.14, now, 0.05);
        v.f.frequency.setTargetAtTime(600 + h2 * 2600, now, 0.05);
      }
      v.g.gain.setTargetAtTime((q.p.kind === 1 ? 0.05 * q.ch.v : 0.028) * (hushed ? 0 : 1) * (1 - 0.9 * dreadK), now, 0.03);   // the hum drops away near it
    });
  }

  return {
    beep() { if (ready()) shot(B.beep, null, 0, 0, 0.08); },
    denied() { if (ready()) shot(B.deny, null, 0, 0, 0.22); },
    granted() { if (ready()) shot(B.ok, null, 0, 0, 0.12); },
    buzz(ch, x, z) {   // a tube in this chunk stuttering
      if (!ready() || hushed) return;
      const p = ch.panels.filter((q) => q.kind === 1).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
      if (p && Math.hypot(p.x - x, p.z - z) < 9) shot(B.buzz, p.x, 2.65, p.z, 0.05, { rate: rnd(0.95, 1.05) });
    },
    // Each frame: x, z where you are; near, the lit panels nearest you (restricted.js placeLights).
    fx(dt, t, x, z, riding, near) {
      if (!ready()) return;
      const now = A.ctx.currentTime;
      if (!loops.length) {
        baseHum = loop(B.hum, 0.005, null, 0, 0, 0);
        drone = loop(B.drone, 0.02, null, 0, 0, 0);
        const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
        drone.g.disconnect(); drone.g.connect(f).connect(out);
        loop(B.motor, 0.05, LIFT.x + 1, 1.2, 0, 3, 0.8);   // the lift, idling: follow the hum back
        hushAt = t + rnd(70, 140); swellAt = t + rnd(20, 40);
      }
      lampVoices(near);
      baseHum.g.gain.setTargetAtTime(0.005 * (1 - 0.9 * dreadK), now, 0.5);
      if (riding) return;
      // The drone swells now and then.
      if (t > swellAt) { drone.g.gain.setTargetAtTime(rnd(0.012, 0.045), now, rnd(2, 5)); swellAt = t + rnd(8, 25); }
      // A silence: everything but your own steps drops away for a few seconds.
      if (!hushed && t > hushAt) { hushed = true; hushAt = t + rnd(6, 10); out.gain.setTargetAtTime(0, now, 0.35); }
      else if (hushed && t > hushAt) { hushed = false; hushAt = t + rnd(110, 230); out.gain.setTargetAtTime(1, now, 1.5); }
      const lx = LIFT.x + 1 - x, far = Math.hypot(lx, z), p = camera.position;
      // Thumps, far off through the walls.
      if (t > thumpAt) {
        if (thumpAt && !hushed) { const a = Math.random() * TAU, d = rnd(16, 26); shot(B.thump, x + Math.cos(a) * d, 0.5, z + Math.sin(a) * d, 0.5, { rate: rnd(0.8, 1.1), lp: 300 }); }
        thumpAt = t + rnd(25, 70);
      }
      // The lift's chime, now and then once you've wandered off: fainter and duller the further you are.
      if (far > 6 && t > chimeAt && ctx.sfx.buffers?.chime) {
        if (chimeAt && !hushed) shot(ctx.sfx.buffers.chime, LIFT.x, 2.4, 0, 0.45, { lp: Math.max(450, 9000 / (1 + far / 5)), ref: 4, roll: 0.7 });
        chimeAt = t + rnd(25, 45);
      }
      // Your steps, and someone else's somewhere behind you while you walk; theirs stop a step or two after yours.
      const moved = last ? Math.hypot(p.x - last.x, p.z - last.z) / Math.max(dt, 1e-3) : 0;
      last = { x: p.x, z: p.z };
      const walking = moved > 1.2 && moved < 12;
      stepAcc = walking ? stepAcc + dt : 0.3;
      if (walking && stepAcc > (moved > 4.5 ? 0.31 : 0.45)) {
        stepAcc = 0; shot(pick(B.step), null, 0, 0, 0.1, { rate: rnd(0.9, 1.08) });
        if (echoAt && Math.random() < 0.45) shot(pick(B.step), echoAt.x, 0.05, echoAt.z, 0.08, { rate: rnd(0.84, 0.9), lp: 800, when: rnd(0.24, 0.32) });   // a beat late, behind you
      }
      walkT = walking ? walkT + dt : 0;
      if (!follow && walkT > 5 && Math.random() < dt / 25) follow = { next: t + 0.3, left: Infinity, until: t + rnd(6, 14) };
      if (follow) {
        if (!walking && follow.left === Infinity) follow.left = 1 + Math.floor(Math.random() * 2);
        if (walking && follow.left !== Infinity) follow.left = Infinity;
        if (t > follow.next) {
          const yaw = ctx.player.yaw, d = rnd(8, 10);   // behind you
          shot(pick(B.step), x + Math.sin(yaw) * d, 0.05, z + Math.cos(yaw) * d, 0.12, { rate: rnd(0.82, 0.92), lp: 900 });
          follow.next = t + rnd(0.47, 0.52);
          if (follow.left !== Infinity && --follow.left <= 0) follow = null;
          else if (t > follow.until && follow.left === Infinity) follow.left = 1;
        }
      }
    },
    // A phone ringing at (x, z) until stop().
    ring(x, z) {
      if (!ready() || ring) return null;
      const f = A.ctx.createBiquadFilter(), src = A.ctx.createBufferSource(), g = A.ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 2200; src.buffer = B.ring; src.loop = true; g.gain.value = 0.35;
      src.connect(f).connect(g).connect(panner(x, 1.3, z, 3, 0.9)); src.start();
      ring = { src, g };
      return { stop: () => { if (ring?.src === src) ring = null; g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.01); src.stop(A.ctx.currentTime + 0.1); } };
    },
    // The tape at (x, z): a click, the voice, a click. Its length in seconds (0 with no sound).
    tape(x, z) {
      if (!ready()) return 0;
      shot(B.click, x, 0.2, z, 0.3);
      const v = shot(B.tape, x, 0.2, z, 0.55, { ref: 1.5 }), d = B.tape.duration;
      v.src.onended = () => { v.src.disconnect(); if (A) shot(B.click, x, 0.2, z, 0.3, { rate: 0.8 }); };
      return d;
    },
    // The lift arriving behind a door at (x, z): muffled.
    chimeBehind(x, z) { if (ready() && ctx.sfx.buffers?.chime && !hushed) shot(ctx.sfx.buffers.chime, x, 1.6, z, 0.6, { lp: 650, ref: 2 }); },
    // The creature's: positions in the floor's own space.
    creature: {
      dread(k, x, z) {   // how near it is (0..1), and where: the hum drops, a rumble comes up from there
        dreadK = k;
        if (!ready() || (!rumble && !(k > 0))) return;
        if (!rumble) { rumble = loop(B.rumble, 0, null, 0, 0, 0); rumble.g.disconnect(); rumble.pan = panner(0, 1, 0, 6, 0.3); rumble.g.connect(rumble.pan); }
        if (x !== undefined) setPos(rumble.pan, x, 1, z);
        rumble.g.gain.setTargetAtTime(0.22 * k, A.ctx.currentTime, k ? 1.2 : 0.4);
      },
      echo(p) { echoAt = p; },
      creak(x, z) { if (ready()) shot(pick(B.creak), x, 2.9, z, 0.35, { rate: rnd(0.85, 1.15), ref: 2.5, roll: 0.8 }); },
      drag(x, z) { if (ready()) shot(B.drag, x, 2.95, z, 0.3, { rate: rnd(0.8, 1.1), lp: 1100, ref: 2.5, roll: 0.8 }); },
      lift(x, z) { if (ready()) shot(B.scrape, x, 2.75, z, 0.35, { rate: rnd(0.9, 1.1) }); },
      clack(x, z) { if (ready()) shot(B.clack, x, 2.75, z, 0.45, { rate: rnd(0.9, 1.1) }); },
      skitter(x, z) { if (ready()) shot(B.skitter, x, 0.3, z, 0.5, { rate: rnd(1.1, 1.3), ref: 3 }); },
      step(x, z) { if (ready()) shot(pick(B.step), x, 0.05, z, 0.16, { rate: rnd(0.55, 0.65), lp: 500, ref: 3, roll: 0.9 }); },   // too heavy, too slow
    },
    get hushed() { return hushed; },
    // Heard from another floor through a doorway onto B3 (relativity-door.js): the tubes' hum and the drone at v (0 to 1).
    bleed(v) {
      if (!ready() || (!bleedL && v < 0.002)) return;
      const now = A.ctx.currentTime;
      if (!bleedL) {
        const g = A.ctx.createGain(); g.gain.value = 0; g.connect(A.master);
        bleedL = { g, srcs: [[B.hum, 0.03, 'bandpass', 1400], [B.drone, 0.02, 'lowpass', 220]].map(([buf, gain, type, f0]) => {
          const src = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), sg = A.ctx.createGain();
          src.buffer = buf; src.loop = true; f.type = type; f.frequency.value = f0; sg.gain.value = gain;
          src.connect(f).connect(sg).connect(g); src.start(); return src;
        }) };
      }
      bleedL.g.gain.setTargetAtTime(v, now, 0.3);
      if (v < 0.002) { for (const src of bleedL.srcs) src.stop(now + 1.5); bleedL = null; }
    },
    stop() {
      if (A) for (const { src, g } of loops) { g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2); src.stop(A.ctx.currentTime + 1); }
      if (A && out) out.gain.setTargetAtTime(1, A.ctx.currentTime, 0.1);
      ring?.src.stop(); ring = null;
      loops = []; lamps = []; baseHum = rumble = echoAt = null; dreadK = 0; follow = null; walkT = 0; last = null; hushed = false;
    },
  };
}
