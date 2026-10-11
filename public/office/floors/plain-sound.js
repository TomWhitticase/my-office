// The Plain's sounds (floors/plain.js). Wind over open ground that never drops, gusting; the fire far off, crackling.
// Now and then, out in the haze in some direction, someone screaming, or calling for help, a long way off; metal: a
// clang, a long groan of something huge bending, a scrape, a chain; a boom. And sometimes a whisper right behind your
// head, close enough to feel (placed just behind you, a little to one side, as you are when it starts). Your steps in the
// dust. The crawler's fingers on the ground as it comes, and the shriek it lets out when it's on you. All synthesised
// here, through the office's own audio (sounds.js `audio`), so its volume and M apply. Positions are in the world.

import * as THREE from 'three';

const TAU = Math.PI * 2;

export function makeSound(ctx) {
  const { camera } = ctx;
  let A = null, B = null, out = null, verb = null, loops = [], bleedL = null, stepAcc = 0, lastP = null;
  const due = { scream: 0, help: 0, metal: 0, boom: 0, whisper: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a), nz = () => Math.random() * 2 - 1, pick = (a) => a[Math.floor(Math.random() * a.length)];

  function biq(type, f, q) {   // RBJ biquad, per sample
    const SR = A.ctx.sampleRate, w = TAU * f / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [a, 0, -a];
    const k0 = b0 / a0, k1 = b1 / a0, k2 = b2 / a0, a1 = -2 * c / a0, a2 = (1 - a) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const f2 = (x) => { const y = k0 * x + k1 * x1 + k2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
    return f2;
  }
  function make(sec, fn, peak = 0.9, ch = 1) {
    const SR = A.ctx.sampleRate, n = Math.ceil(sec * SR), b = A.ctx.createBuffer(ch, n, SR);
    for (let c = 0; c < ch; c++) {
      const d = b.getChannelData(c);
      let m = 0;
      for (let k = 0; k < n; k++) { d[k] = fn(k / SR, c); m = Math.max(m, Math.abs(d[k])); }
      for (let k = 0; k < n; k++) d[k] *= (m ? peak / m : 0) * Math.min(1, (n - k) / (SR * 0.01), k / (SR * 0.003));
    }
    return b;
  }
  // A voice: a buzz at f0(t) through three formants (f(t) gives them, [F1, F2, F3]), breath under it, amp(t).
  function voice(sec, f0, form, amp, { breath = 0.15, rough = 0.02, hoarse = 0 } = {}) {
    const SR = A.ctx.sampleRate;
    let ph = 0, jit = 0, fs = form(0), bank = fs.map((f, i) => biq('bp', f, [6, 9, 12][i])), next = 0;
    return make(sec, (t) => {
      if (t >= next) { next = t + 0.02; const nf = form(t); bank = nf.map((f, i) => (Math.abs(f - fs[i]) > 20 ? biq('bp', f, [6, 9, 12][i]) : bank[i])); fs = nf; }   // (re-tuned every 20 ms)
      jit += (nz() * rough - jit) * 0.02;
      ph = (ph + f0(t) * (1 + jit) / SR) % 1;
      const src = (2 * ph - 1) * (1 - breath) + nz() * (breath + hoarse);
      const v = bank[0](src) + bank[1](src) * 0.7 + bank[2](src) * 0.45;
      return v * amp(t);
    });
  }
  const env = (a, h, r) => (t) => (t < a ? t / a : t < a + h ? 1 : Math.max(0, 1 - (t - a - h) / r));
  function build() {
    const lpW = [biq('lp', 380, 0.6), biq('lp', 380, 0.6)], whW = [biq('bp', 620, 5), biq('bp', 700, 5)];
    return {
      // the wind: rushing low, a thin whistle in it, swelling and dying away, a little different each side
      wind: make(9, (t, c) => (lpW[c](nz()) * 3 + whW[c](nz()) * 0.5 * (0.5 + 0.5 * Math.sin(TAU * t / 4.5 + c))) * (0.55 + 0.3 * Math.sin(TAU * t / 9) + 0.15 * Math.sin(TAU * t / 3 + c * 2)), 0.8, 2),
      // the fire: a low roar, and pops
      crackle: (() => { const lp = biq('lp', 200, 0.7), bp = biq('bp', 2500, 1.2); let pop = 0;
        return make(5, (t) => { if (Math.random() < 0.0009) pop = 0.6 + Math.random(); pop *= 0.992; return lp(nz()) * 1.2 + bp(nz() * pop) * 1.4; }, 0.7); })(),
      // a dark hall of a reverb: the distance
      hall: (() => { const f = [biq('lp', 2500, 0.5), biq('lp', 2500, 0.5)]; return make(3.5, (t, c) => f[c](nz()) * Math.exp(-t / 0.9), 0.6, 2); })(),
      // screaming: a voice pushed past what it can do, high, cracking, falling away
      scream: [[560, 1.9], [760, 1.5], [420, 2.4]].map(([f, d]) => voice(d, (t) => f * (1 + 0.6 * Math.min(1, t * 6) - 0.35 * Math.max(0, t - d * 0.5) / d) * (1 + 0.03 * Math.sin(TAU * 6.5 * t)),
        () => [950, 1500, 2900], env(0.08, d * 0.55, d * 0.35), { breath: 0.25, rough: 0.08, hoarse: 0.1 })),
      // "help": h, the vowel rising then falling, the l, a stop
      help: [[220, 1.3], [330, 1.1]].map(([f, d]) => voice(d, (t) => f * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, t / (d * 0.75)))),
        (t) => (t < d * 0.7 ? [600, 1850, 2550] : [380, 1050, 2400]), (t) => (t < 0.07 ? 0.25 : t < d * 0.82 ? env(0.1, d * 0.5, d * 0.2)(t) : t > d * 0.9 && t < d * 0.93 ? 0.5 : 0), { breath: 0.35, rough: 0.04 })),
      // a whisper: no voice, only breath through the mouth's shapes, syllables, a hiss
      whisper: Array.from({ length: 4 }, () => {
        const syl = []; let at = 0.05;
        while (at < 1.9) { const d = 0.08 + Math.random() * 0.16; syl.push([at, d, pick([[300, 2300], [700, 1200], [500, 1700], [350, 900]]), Math.random() < 0.4]); at += d + Math.random() * 0.1; }
        const hs = biq('hp', 4500, 0.7);
        let k = -1, f1 = null, f2 = null;
        return make(2.2, (t) => {
          const i = syl.findIndex(([a, d]) => t >= a && t < a + d);
          if (i < 0) return 0;
          if (i !== k) { k = i; f1 = biq('bp', syl[i][2][0], 5); f2 = biq('bp', syl[i][2][1], 8); }
          const [a, d, , s] = syl[i], u = (t - a) / d, e = Math.sin(Math.PI * u) ** 0.7, n = nz();
          return (f1(n) + f2(n) * 0.8) * e * 1.6 + (s && u < 0.35 ? hs(n) * 0.8 : 0);
        }, 0.7);
      }),
      // metal: struck, bent, scraped, a chain
      clang: (() => { const p = [180, 497, 972, 1607, 2390].map((f) => [f * (0.98 + Math.random() * 0.04), Math.random() * TAU]);
        return make(3, (t) => p.reduce((a, [f, ph], i) => a + Math.sin(TAU * f * t + ph) * Math.exp(-t * (1.2 + i * 0.8)) / (i + 1), 0), 0.7); })(),
      groan: (() => { const bank = [0, 1, 2].map(() => ({ f: 120 + Math.random() * 300, b: null })); let next = 0;
        return make(4.5, (t) => { if (t >= next) { next = t + 0.03; for (const r of bank) r.b = biq('bp', r.f * (1 + 0.25 * Math.sin(TAU * t / 4.5)), 40); }
          const n = nz() * (0.4 + 0.6 * Math.sin(Math.PI * t / 4.5)); return bank.reduce((a, r) => a + r.b(n), 0); }, 0.7); })(),
      scrape: (() => { const bp = biq('bp', 2200, 6), bp2 = biq('bp', 3400, 9); return make(2.2, (t) => (bp(nz()) + bp2(nz()) * 0.6) * (0.4 + 0.6 * Math.abs(Math.sin(TAU * 3.1 * t))) * Math.sin(Math.PI * t / 2.2), 0.6); })(),
      chain: (() => { const bp = biq('bp', 3800, 5); let r = 0; return make(1.6, (t) => { if (Math.random() < 0.0012) r = 1; r *= 0.996; return bp(nz() * r) * Math.max(0, 1 - t / 1.6); }, 0.6); })(),
      boom: (() => { const lp = biq('lp', 90, 0.8); return make(3.5, (t) => lp(nz()) * Math.exp(-t * 1.4) * Math.min(1, t * 30), 0.9); })(),
      // the shriek: two throats at once, high and torn, a rattle under it; clipped hard
      shriek: [1300, 1650].map((f) => {
        const a = voice(1.5, (t) => f * (1 + 0.5 * Math.min(1, t * 9)) * (1 + 0.07 * Math.sin(TAU * 31 * t) + 0.04 * Math.sin(TAU * 11 * t)) * (1 - 0.2 * Math.max(0, t - 0.9)),
          () => [1100, 2200, 3600], env(0.03, 0.9, 0.5), { breath: 0.3, rough: 0.2, hoarse: 0.3 });
        const b = voice(1.5, (t) => f * 0.53 * (1 + 0.4 * Math.min(1, t * 7)) * (1 + 0.1 * Math.sin(TAU * 23 * t)), () => [800, 1900, 3000], env(0.05, 0.85, 0.5), { breath: 0.2, rough: 0.25, hoarse: 0.4 });
        const da = a.getChannelData(0), db = b.getChannelData(0);
        return make(1.5, (t) => { const k = Math.min(da.length - 1, Math.floor(t * A.ctx.sampleRate)); return Math.tanh((da[k] + db[k] * 0.8) * 3.5); }, 1);
      }),
      // its fingers on the ground: a soft knock and the nails' click
      tap: Array.from({ length: 5 }, () => { const lp = biq('lp', 260, 0.8), bp = biq('bp', 3200 + Math.random() * 1500, 3); const at = 0.005 + Math.random() * 0.02;
        return make(0.16, (t) => lp(nz()) * Math.exp(-t / 0.025) * 2 + (t > at ? bp(nz()) * Math.exp(-(t - at) / 0.008) : 0)); }),
      // its neck: a wet creak as it turns to you
      creak: (() => { const bp = biq('bp', 420, 9); let ph = 0; return make(0.8, (t) => { ph += (18 + 50 * t) / A.ctx.sampleRate; return bp(ph % 1 < 0.08 ? nz() : 0) * Math.sin(Math.PI * t / 0.8); }, 0.8); })(),
      // your steps: a crunch in dry dust
      step: Array.from({ length: 6 }, () => { const lp = biq('lp', 1400, 0.7), bp = biq('bp', 2600, 1); return make(0.22, (t) => (lp(nz()) * 1.5 + bp(nz() * (Math.random() < 0.3 ? 1 : 0.2))) * Math.exp(-t / 0.05)); }),
    };
  }
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) { A = a; B = null; loops = []; out = verb = bleedL = null; }
    if (!B) B = build();
    if (!out) {
      out = A.ctx.createGain(); out.connect(A.master);
      verb = A.ctx.createConvolver(); verb.buffer = B.hall;
      const wet = A.ctx.createGain(); wet.gain.value = 0.7; verb.connect(wet).connect(out);
    }
    return true;
  }
  // A one-shot at p (world), dry plus a send to the reverb; p null: in your head. far: muffled and pushed back.
  function shot(buf, p, gain, { rate = 1, lp = 0, send = 0.4, ref = 3, when = 0 } = {}) {
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
  const fw = new THREE.Vector3(), rt = new THREE.Vector3();
  // somewhere out in the haze, d m off in a random direction (for direction only: it's quiet and muffled as if far further)
  const out2 = (d) => { const a = Math.random() * TAU, p = camera.position; return { x: p.x + Math.cos(a) * d, y: p.y + rnd(-1, 4), z: p.z + Math.sin(a) * d }; };

  return {
    fx(dt, t) {
      if (!ready()) return;
      if (!loops.length) {
        loops.push(loop(B.wind, 0.12), loop(B.crackle, 0.025));
        due.scream = t + rnd(6, 14); due.help = t + rnd(18, 34); due.metal = t + rnd(8, 18); due.boom = t + rnd(20, 50); due.whisper = t + rnd(30, 60);
      }
      // your steps
      const p = camera.position, moved = lastP ? Math.hypot(p.x - lastP.x, p.z - lastP.z) / Math.max(dt, 1e-3) : 0;
      lastP = { x: p.x, z: p.z };
      const walking = moved > 1 && moved < 12;
      stepAcc = walking ? stepAcc + dt : 0.3;
      if (walking && stepAcc > (moved > 6 ? 0.3 : 0.44)) { stepAcc = 0; shot(pick(B.step), null, 0.06, { rate: rnd(0.9, 1.1), send: 0.1 }); }
      // out there
      if (t > due.scream) { due.scream = t + rnd(9, 26); shot(pick(B.scream), out2(30), 0.06, { rate: rnd(0.85, 1.1), lp: rnd(1400, 2600), send: 1.2, ref: 6 }); }
      if (t > due.help) {
        due.help = t + rnd(22, 50);
        const q = out2(30), v = pick(B.help);
        shot(v, q, 0.07, { rate: rnd(0.95, 1.05), lp: 2200, send: 1.1, ref: 6 });
        if (Math.random() < 0.6) shot(v, q, 0.06, { rate: rnd(0.9, 1.0), lp: 2000, send: 1.1, ref: 6, when: 1.6 + Math.random() });
      }
      if (t > due.metal) { due.metal = t + rnd(10, 28); const k = pick(['clang', 'groan', 'scrape', 'chain']); shot(B[k], out2(30), k === 'groan' ? 0.12 : 0.06, { rate: rnd(0.6, 1.1), lp: 1800, send: 1.3, ref: 6 }); }
      if (t > due.boom) { due.boom = t + rnd(30, 70); shot(B.boom, out2(30), 0.25, { rate: rnd(0.7, 1), send: 1.2, ref: 8 }); }
      // right behind you
      if (t > due.whisper) {
        due.whisper = t + rnd(35, 80);
        camera.getWorldDirection(fw); fw.y = 0; fw.normalize(); rt.set(-fw.z, 0, fw.x);
        const s = Math.random() < 0.5 ? -1 : 1;
        shot(pick(B.whisper), { x: p.x - fw.x * 0.32 + rt.x * s * 0.14, y: p.y + 0.04, z: p.z - fw.z * 0.32 + rt.z * s * 0.14 }, 0.16, { rate: rnd(0.92, 1.05), send: 0.05, ref: 0.3 });
      }
    },
    // the crawler
    tap(p, speed) { if (ready()) shot(pick(B.tap), { x: p.x, y: 0.1, z: p.z }, 0.05 + Math.min(0.12, speed * 0.012), { rate: Math.random() * 0.3 + 0.85, send: 0.15, ref: 2 }); },
    shriek(p) {
      if (!ready()) return;
      const b = pick(B.shriek);
      shot(b, p, 0.8, { send: 0.5, ref: 5 });
      shot(b, null, 0.22, { send: 0 });   // (and in your face)
    },
    creak(p) { if (ready()) shot(B.creak, p, 0.2, { send: 0.3, ref: 2 }); },
    charge(p) { if (ready()) shot(pick(B.scream), p, 0.05, { rate: 0.55, lp: 900, send: 0.8, ref: 5 }); },
    // Heard from B3 through the painting (floors/plain.js): the wind and the fire at v (0 to 1).
    bleed(v) {
      if ((!bleedL && v < 0.002) || !ready()) return;
      const now = A.ctx.currentTime;
      if (!bleedL) {
        const g = A.ctx.createGain(); g.gain.value = 0; g.connect(A.master);
        bleedL = { g, srcs: [loop(B.wind, 0.12, g), loop(B.crackle, 0.025, g)] };
      }
      bleedL.g.gain.setTargetAtTime(v, now, 0.3);
      if (v < 0.002) { for (const s of bleedL.srcs) s.src.stop(now + 1.5); bleedL = null; }
    },
    stop() {
      if (A) for (const { src, g } of loops) { g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3); src.stop(A.ctx.currentTime + 1.5); }
      loops = []; lastP = null;
    },
  };
}
