// Her world's sounds (floors/lisa.js). At first nearly nothing: a hush of air over the valley, much too quiet, and
// breathing, slow and close, that isn't yours. Then, as it turns: a low drone that swells and grinds (two detuned throats
// and a growl under them), the paint crackling as it cracks and peels, whispers that run backwards, a voice far too deep
// for her, murmuring; her nails on the stone as she scuttles, quick and many; her neck clicking round as her head turns;
// a screech when she shows herself, and the shriek in your face when she's on you. The things she throws, rushing past.
// All synthesised here, through the office's own audio (sounds.js `audio`), so its volume and M apply. Positions are the
// world's.

import * as THREE from 'three';

const TAU = Math.PI * 2;

export function makeSound(ctx) {
  const { camera } = ctx;
  let A = null, B = null, todo = [], out = null, verb = null, loops = null, bleedL = null, stepAcc = 0;
  const lastP = { x: 0, z: 0, ok: false };
  const due = { whisper: 0, voice: 0, breath: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a), nz = () => Math.random() * 2 - 1, pick = (a) => a && a[Math.floor(Math.random() * a.length)];
  const lvl = { dread: 0, peel: 0, calm: 1 };

  function biq(type, f, q) {   // RBJ biquad, per sample
    const SR = A.ctx.sampleRate, w = TAU * f / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [a, 0, -a];
    const k0 = b0 / a0, k1 = b1 / a0, k2 = b2 / a0, a1 = -2 * c / a0, a2 = (1 - a) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => { const y = k0 * x + k1 * x1 + k2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  function make(sec, fn, peak = 0.9, ch = 1, rev = false) {
    const SR = A.ctx.sampleRate, n = Math.ceil(sec * SR), b = A.ctx.createBuffer(ch, n, SR);
    for (let c = 0; c < ch; c++) {
      const d = b.getChannelData(c);
      let m = 0;
      for (let k = 0; k < n; k++) { d[k] = fn(k / SR, c); m = Math.max(m, Math.abs(d[k])); }
      for (let k = 0; k < n; k++) d[k] *= (m ? peak / m : 0) * Math.min(1, (n - k) / (SR * 0.01), k / (SR * 0.003));
      if (rev) d.reverse();
    }
    return b;
  }
  // a voice: a buzz at f0(t) through three formants (form(t)), breath under it, amp(t)
  function voice(sec, f0, form, amp, { breath = 0.15, rough = 0.02, hoarse = 0, growl = 0 } = {}, rev = false) {
    const SR = A.ctx.sampleRate;
    let ph = 0, jit = 0, gp = 0, fs = form(0), bank = fs.map((f, i) => biq('bp', f, [6, 9, 12][i])), next = 0;
    return make(sec, (t) => {
      if (t >= next) { next = t + 0.02; const nf = form(t); bank = nf.map((f, i) => (Math.abs(f - fs[i]) > 20 ? biq('bp', f, [6, 9, 12][i]) : bank[i])); fs = nf; }
      jit += (nz() * rough - jit) * 0.02;
      ph = (ph + f0(t) * (1 + jit) / SR) % 1; gp = (gp + 31 / SR) % 1;
      let src = (2 * ph - 1) * (1 - breath) + nz() * (breath + hoarse);
      if (growl) src *= 1 - growl + growl * (gp < 0.5 ? 1 : -0.4);   // (a rattle under it)
      return (bank[0](src) + bank[1](src) * 0.7 + bank[2](src) * 0.45) * amp(t);
    }, 0.9, 1, rev);
  }
  const env = (a, h, r) => (t) => (t < a ? t / a : t < a + h ? 1 : Math.max(0, 1 - (t - a - h) / r));
  function syllables(sec, n0 = 0.08) {   // breath through the mouth's shapes, syllable by syllable (a whisper)
    const syl = []; let at = 0.05;
    while (at < sec - 0.2) { const d = n0 + Math.random() * 0.16; syl.push([at, d, pick([[300, 2300], [700, 1200], [500, 1700], [350, 900], [420, 2600]]), Math.random() < 0.4]); at += d + Math.random() * 0.08; }
    return syl;
  }
  // Each sound a thunk, made one at a time (grow(): one a frame, from the moment the world's built), so making them never
  // holds up a frame; what's not made yet is just not heard.
  function build() {
    const lp = (f) => [biq('lp', f, 0.6), biq('lp', f, 0.6)];
    return {
      // the air: barely anything, a hush over the valley
      air: () => (() => { const f = lp(500); return make(8, (t, c) => f[c](nz()) * (0.6 + 0.4 * Math.sin(TAU * t / 8 + c)), 0.6, 2); })(),
      // breathing: in through the nose, slow; out, slower; a catch in it
      breath: () => (() => { const bp = biq('bp', 900, 1.4), bp2 = biq('bp', 2400, 2); return make(4.2, (t) => {
        const inn = t < 1.4 ? Math.sin(Math.PI * t / 1.4) : 0, ex = t > 1.8 && t < 3.9 ? Math.sin(Math.PI * (t - 1.8) / 2.1) ** 1.5 : 0, n = nz();
        return bp(n) * inn * 0.8 + bp2(n) * ex * 0.5 + (t > 1.42 && t < 1.47 ? nz() * 0.3 : 0); }, 0.6); })(),
      // the drone: two detuned low throats and a grinding growl, slowly beating
      drone: () => (() => { const f = lp(420); let p1 = 0, p2 = 0, p3 = 0; return make(12, (t, c) => {
        const SR = A.ctx.sampleRate; p1 = (p1 + 41.2 / SR) % 1; p2 = (p2 + (41.2 * 1.007 + c * 0.3) / SR) % 1; p3 = (p3 + 27.5 / SR) % 1;
        const saw = (2 * p1 - 1) + (2 * p2 - 1) * 0.8 + (p3 < 0.5 ? 1 : -1) * 0.5 * (0.5 + 0.5 * Math.sin(TAU * t / 6));
        return f[c](saw + nz() * 0.15) * (0.7 + 0.3 * Math.sin(TAU * t / 4 + c)); }, 0.7, 2); })(),
      // the paint: cracking, ticking, a flake coming away
      crackle: () => (() => { const bp = biq('bp', 3200, 1.5), lpf = biq('lp', 900, 0.7); let pop = 0, big = 0; return make(6, () => {
        if (Math.random() < 0.004) pop = 0.5 + Math.random(); if (Math.random() < 0.0002) big = 1; pop *= 0.96; big *= 0.997;
        return bp(nz() * pop) * 1.2 + lpf(nz() * big) * 0.8; }, 0.6); })(),
      hall: () => (() => { const f = [biq('lp', 3000, 0.5), biq('lp', 3000, 0.5)]; return make(3, (t, c) => f[c](nz()) * Math.exp(-t / 0.7), 0.6, 2); })(),
      // whispers, run backwards (they swell to their start and stop dead)
      whisper: () => Array.from({ length: 4 }, () => {
        const syl = syllables(2.4), hs = biq('hp', 4500, 0.7);
        let k = -1, f1 = null, f2 = null;
        return make(2.4, (t) => {
          const i = syl.findIndex(([a, d]) => t >= a && t < a + d);
          if (i < 0) return 0;
          if (i !== k) { k = i; f1 = biq('bp', syl[i][2][0], 5); f2 = biq('bp', syl[i][2][1], 8); }
          const [a, d, , s] = syl[i], u = (t - a) / d, e = Math.sin(Math.PI * u) ** 0.7, n = nz();
          return (f1(n) + f2(n) * 0.8) * e * 1.6 + (s && u < 0.35 ? hs(n) * 0.8 : 0);
        }, 0.7, 1, true);
      }),
      // her voice, far too deep: a murmur of syllables, growling, a word you almost catch
      voice: () => Array.from({ length: 3 }, () => {
        const syl = syllables(3.2, 0.14);
        return voice(3.2, (t) => 62 * (1 + 0.15 * Math.sin(TAU * 0.7 * t)), (t) => { const s = syl.find(([a, d]) => t >= a && t < a + d); return s ? [s[2][0] * 0.6, s[2][1] * 0.55, 2300] : [400, 900, 2300]; },
          (t) => (syl.some(([a, d]) => t >= a && t < a + d) ? 1 : 0.15), { breath: 0.2, rough: 0.08, hoarse: 0.2, growl: 0.7 }, Math.random() < 0.5);
      }),
      // the screech: high, torn, short
      screech: () => [1500, 1900].map((f) => voice(1.1, (t) => f * (1 + 0.5 * Math.min(1, t * 10)) * (1 + 0.08 * Math.sin(TAU * 37 * t)), () => [1200, 2400, 3800], env(0.02, 0.6, 0.45), { breath: 0.3, rough: 0.25, hoarse: 0.35 })),
      // the shriek in your face: three throats at once, the lowest a roar, clipped hard
      shriek: () => [1350, 1700].map((f) => {
        const a = voice(1.7, (t) => f * (1 + 0.6 * Math.min(1, t * 9)) * (1 + 0.08 * Math.sin(TAU * 29 * t)) * (1 - 0.25 * Math.max(0, t - 1)), () => [1100, 2300, 3700], env(0.015, 1.0, 0.6), { breath: 0.3, rough: 0.25, hoarse: 0.35 });
        const b = voice(1.7, (t) => f * 0.5 * (1 + 0.4 * Math.min(1, t * 7)) * (1 + 0.1 * Math.sin(TAU * 23 * t)), () => [800, 1900, 3000], env(0.02, 0.95, 0.6), { breath: 0.2, rough: 0.3, hoarse: 0.4 });
        const c = voice(1.7, (t) => 90 * (1 + 0.3 * Math.sin(TAU * 3 * t)), () => [500, 1100, 2400], env(0.01, 1.0, 0.6), { breath: 0.4, rough: 0.3, hoarse: 0.5, growl: 0.9 });
        const da = a.getChannelData(0), db = b.getChannelData(0), dc = c.getChannelData(0);
        return make(1.7, (t) => { const k = Math.min(da.length - 1, Math.floor(t * A.ctx.sampleRate)); return Math.tanh((da[k] + db[k] * 0.8 + dc[k] * 0.9) * 4); }, 1);
      }),
      // her nails on stone: a click and a scratch
      nail: () => Array.from({ length: 6 }, () => { const bp = biq('bp', 3500 + Math.random() * 2500, 4), lpf = biq('lp', 600, 0.8), at = Math.random() * 0.01;
        return make(0.12, (t) => (t > at ? bp(nz()) * Math.exp(-(t - at) / 0.006) * 2 : 0) + bp(nz()) * Math.exp(-t / 0.04) * 0.25 + lpf(nz()) * Math.exp(-t / 0.02) * 0.8); }),
      // her neck: bone clicking, a wet crunch
      neck: () => (() => { const bp = biq('bp', 1800, 3), lpf = biq('lp', 300, 0.8); const clicks = Array.from({ length: 9 }, (_, i) => 0.05 + i * 0.13 + Math.random() * 0.06);
        return make(1.4, (t) => { let v = 0; for (const c of clicks) if (t > c && t < c + 0.03) v += bp(nz()) * Math.exp(-(t - c) / 0.005) * 2 + lpf(nz()) * 0.6; return v; }, 0.8); })(),
      // something heavy lifting off the ground (a groan in the stone), and rushing past
      lift: () => (() => { const f = biq('lp', 160, 0.9); return make(2.5, (t) => f(nz()) * Math.min(1, t / 0.8) * Math.exp(-Math.max(0, t - 1.6) * 3), 0.7); })(),
      rush: () => (() => { const f = biq('bp', 700, 0.8); return make(1, (t) => f(nz()) * Math.sin(Math.PI * t) ** 2, 0.8); })(),
      // your steps on stone, and on the grass below
      step: () => Array.from({ length: 5 }, () => { const lp2 = biq('lp', 900, 0.8), bp = biq('bp', 2400, 1.5); return make(0.16, (t) => (lp2(nz()) * 1.6 + bp(nz()) * 0.4) * Math.exp(-t / 0.035)); }),
      soft: () => Array.from({ length: 5 }, () => { const lp2 = biq('lp', 700, 0.7), bp = biq('bp', 3000, 1); return make(0.24, (t) => (lp2(nz()) + bp(nz() * (Math.random() < 0.3 ? 1 : 0.2)) * 0.6) * Math.exp(-t / 0.06)); }),
    };
  }
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) { A = a; B = null; loops = null; out = verb = bleedL = null; }
    if (!B) { B = {}; todo = Object.entries(build()); }
    if (!B.hall) return false;   // (the reverb first)
    if (!out) {
      out = A.ctx.createGain(); out.connect(A.master);
      verb = A.ctx.createConvolver(); verb.buffer = B.hall;
      const wet = A.ctx.createGain(); wet.gain.value = 0.6; verb.connect(wet).connect(out);
    }
    return true;
  }
  function grow() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return;
    if (A?.ctx !== a.ctx) { A = a; B = null; loops = null; out = verb = bleedL = null; }
    if (!B) { B = {}; todo = Object.entries(build()); todo.sort((x, y) => (y[0] === 'hall') - (x[0] === 'hall') || (y[0] === 'air') - (x[0] === 'air')); }
    const n = todo.shift(); if (n) B[n[0]] = n[1]();
  }
  function shot(buf, p, gain, { rate = 1, lp = 0, send = 0.3, ref = 2, when = 0 } = {}) {
    if (!buf) return;
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    let head = src;
    if (lp) { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); head = f; }
    head.connect(g);
    if (p) {
      const pan = A.ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = 1;
      pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
      g.connect(pan).connect(out);
    } else g.connect(out);
    if (send) { const s = A.ctx.createGain(); s.gain.value = send; g.connect(s).connect(verb); }
    src.onended = () => src.disconnect();
    src.start(A.ctx.currentTime + when);
  }
  function loop(buf, gain, to = out) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g).connect(to); g.gain.setTargetAtTime(gain, A.ctx.currentTime, 2);
    src.start(); return { src, g };
  }
  const fw = new THREE.Vector3(), rt = new THREE.Vector3(), near = { x: 0, y: 0, z: 0 };
  // a point just behind your head, to one side
  const behind = (d = 0.35) => { const p = camera.position; camera.getWorldDirection(fw); fw.y = 0; fw.normalize(); rt.set(-fw.z, 0, fw.x); const s = Math.random() < 0.5 ? -1 : 1;
    near.x = p.x - fw.x * d + rt.x * s * 0.16; near.y = p.y + 0.03; near.z = p.z - fw.z * d + rt.z * s * 0.16; return near; };

  return {
    grow,
    /** the horror's levels this frame: dread 0 to 1, peel 0 to 1, calm (the breathing) 0 to 1 */
    set(dread, peel, calm) { lvl.dread = dread; lvl.peel = peel; lvl.calm = calm; },
    fx(dt, t, grass) {
      if (!ready()) return;
      const now = A.ctx.currentTime;
      if (!loops && B.air && B.drone && B.crackle) {
        loops = { air: loop(B.air, 0.05), drone: loop(B.drone, 0), crackle: loop(B.crackle, 0) };
        due.whisper = t + rnd(8, 16); due.voice = t + rnd(10, 20); due.breath = t + rnd(3, 6);
      }
      if (loops) loops.air.g.gain.setTargetAtTime(0.05 * (1 - 0.6 * lvl.dread), now, 0.8);
      if (loops) loops.drone.g.gain.setTargetAtTime(0.22 * lvl.dread, now, 1.2);
      if (loops) loops.crackle.g.gain.setTargetAtTime(0.16 * lvl.peel, now, 0.6);
      // your steps
      const p = camera.position, moved = lastP.ok ? Math.hypot(p.x - lastP.x, p.z - lastP.z) / Math.max(dt, 1e-3) : 0;
      lastP.x = p.x; lastP.z = p.z; lastP.ok = true;
      const walking = moved > 1 && moved < 12;
      stepAcc = walking ? stepAcc + dt : 0.3;
      if (walking && stepAcc > (moved > 6 ? 0.3 : 0.44)) { stepAcc = 0; shot(pick(grass ? B.soft : B.step), null, grass ? 0.05 : 0.06, { rate: rnd(0.9, 1.1), send: grass ? 0.05 : 0.25 }); }
      // the breathing, close behind you, while it's calm
      if (t > due.breath && lvl.calm > 0.05) { due.breath = t + rnd(4.4, 6.5); shot(B.breath, behind(0.5), 0.05 * lvl.calm, { rate: rnd(0.95, 1.03), send: 0.05, ref: 0.4 }); }
      // the whispers and her voice, once it's turned
      if (t > due.whisper && lvl.dread > 0.2) { due.whisper = t + rnd(7, 18) / (0.5 + lvl.dread); shot(pick(B.whisper), behind(), 0.13 * lvl.dread, { rate: rnd(0.85, 1.05), send: 0.1, ref: 0.3 }); }
      if (t > due.voice && lvl.dread > 0.4) { due.voice = t + rnd(12, 26); shot(pick(B.voice), behind(1.2), 0.2 * lvl.dread, { rate: rnd(0.8, 1), send: 0.6, ref: 1 }); }
    },
    nail(p, speed) { if (ready()) shot(pick(B.nail), p, 0.05 + Math.min(0.1, speed * 0.012), { rate: rnd(0.85, 1.2), send: 0.15, ref: 1.5 }); },
    neck(p) { if (ready()) shot(B.neck, p, 0.4, { send: 0.3, ref: 1.5 }); },
    screech(p) { if (ready()) shot(pick(B.screech), p, 0.55, { rate: rnd(0.9, 1.05), send: 0.6, ref: 4 }); },
    shriek(p) { if (!ready()) return; const b = pick(B.shriek); shot(b, p, 0.9, { send: 0.4, ref: 3 }); shot(b, null, 0.35, { send: 0 }); },
    voice(p) { if (ready()) shot(pick(B.voice), p, 0.35, { rate: rnd(0.75, 0.9), send: 0.6, ref: 3 }); },
    lift(p) { if (ready()) shot(B.lift, p, 0.4, { send: 0.4, ref: 4 }); },
    rush(p) { if (ready()) shot(B.rush, p, 0.35, { rate: rnd(0.8, 1.3), send: 0.1, ref: 1.5 }); },
    /** heard from B3 through the painting: the air, at v (0 to 1) */
    bleed(v) {
      if ((!bleedL && v < 0.002) || !ready()) return;
      const now = A.ctx.currentTime;
      if (!B.air) return;
      if (!bleedL) { const g = A.ctx.createGain(); g.gain.value = 0; g.connect(A.master); bleedL = { g, srcs: [loop(B.air, 0.05, g)] }; }
      bleedL.g.gain.setTargetAtTime(v, now, 0.3);
      if (v < 0.002) { for (const s of bleedL.srcs) s.src.stop(now + 1.5); bleedL = null; }
    },
    stop() {
      if (A && loops) for (const { src, g } of Object.values(loops)) { g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3); src.stop(A.ctx.currentTime + 1.5); }
      loops = null; lastP.ok = false;
    },
  };
}
