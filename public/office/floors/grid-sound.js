// The grid's sounds (floors/grid.js): a mid-90s synth score that never resolves. Under everything a low rumble (below
// 300 Hz), over it a sustained, slightly detuned pad breathing on a suspended chord (its partials round 550-600 Hz and
// 1 kHz), and now and then a held bell tone (FM, 650-1000 Hz) somewhere off in the dark, through a long synthetic
// reverb. Your steps are hollow and digital: a short pitched-down knock, crushed to a few bits. The cone's poke, its
// throw and its landing; the tear's swelling roar and the zip of each thing it swallows; the heal's rising chime. And,
// near the doorway, each side heard through it: the pad on B3, B3's strip-light buzz in here. All synthesised here,
// through the office's own audio (sounds.js `audio`), so its volume and M apply. Positions are in the grid's own space.

const TAU = Math.PI * 2;

export function makeSound(ctx) {
  const { camera } = ctx;
  let A = null, B = null, out = null, verb = null, loops = [], stepAcc = 0, lastP = null, chimeAt = 0, roar = null, bleedL = null, buzzL = null, scrapeL = null;
  const rnd = (a, b) => a + Math.random() * (b - a), nz = () => Math.random() * 2 - 1;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function biq(type, f, q) {   // RBJ biquad, per sample
    const SR = A.ctx.sampleRate, w = TAU * f / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [a, 0, -a];
    const k0 = b0 / a0, k1 = b1 / a0, k2 = b2 / a0, a1 = -2 * c / a0, a2 = (1 - a) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => { const y = k0 * x + k1 * x1 + k2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  function make(sec, fn, peak = 0.9, ch = 1) {
    const SR = A.ctx.sampleRate, n = Math.ceil(sec * SR), b = A.ctx.createBuffer(ch, n, SR);
    for (let c = 0; c < ch; c++) {
      const d = b.getChannelData(c);
      let m = 0;
      for (let k = 0; k < n; k++) { d[k] = fn(k / SR, c); m = Math.max(m, Math.abs(d[k])); }
      for (let k = 0; k < n; k++) d[k] *= (m ? peak / m : 0) * Math.min(1, (n - k) / (SR * 0.005), k / (SR * 0.002));
    }
    return b;
  }
  // A loop that joins up: whole cycles of every partial in `sec`.
  const cyc = (f, sec) => Math.round(f * sec) / sec;
  // A bell: FM, the modulator at a non-integer ratio, its index dying faster than the tone.
  function bell(f, sec = 3.5) {
    const r = 3.5, fm = f * r;
    return make(sec, (t) => Math.sin(TAU * f * t + 2.4 * Math.exp(-t * 2.2) * Math.sin(TAU * fm * t)) * Math.exp(-t * 1.1) * Math.min(1, t / 0.004)
      + 0.25 * Math.sin(TAU * f * 2.01 * t) * Math.exp(-t * 2.5));
  }
  // A step: a hollow knock (a sine falling an octave in 50 ms over a box's resonance), crushed to 3 bits and held at a
  // quarter of the rate, so it's a sound a computer makes of a step.
  function step() {
    const f0 = rnd(150, 190), bp = biq('bp', rnd(700, 900), 4);
    let ph = 0, held = 0;
    return make(0.18, (t) => {
      ph += (f0 * Math.pow(0.5, t / 0.05)) / A.ctx.sampleRate;
      const s = Math.sin(TAU * ph) * Math.exp(-t / 0.045) + bp(nz()) * Math.exp(-t / 0.012) * 0.6;
      if (Math.floor(t * A.ctx.sampleRate) % 4 === 0) held = Math.round(s * 4) / 4;
      return held;
    });
  }
  function build() {
    const lo = biq('lp', 90, 0.8), lo2 = biq('lp', 220, 0.6), air = biq('bp', 1800, 0.7), wind = biq('bp', 420, 0.9);
    // the pad: a suspended chord (D, A, E over a low D), each voice two saws a few cents apart, softened
    const PAD = 12, voices = [[73.4, 0.5], [293.7, 0.32], [440, 0.26], [587.3, 0.2], [659.3, 0.16], [987.8, 0.06]].map(([f, a]) => [cyc(f, PAD), cyc(f * 1.004, PAD), a]);
    const saw = (p) => 2 * (p - Math.floor(p + 0.5));
    const pf = [biq('lp', 1600, 0.7), biq('lp', 1600, 0.7)];
    return {
      // the room: a decaying cloud of noise, darker as it dies, a little different left and right
      hall: (() => { const f = [biq('lp', 6000, 0.5), biq('lp', 6000, 0.5)];
        return make(4.5, (t, c) => f[c](nz()) * Math.exp(-t / 1.2) * (1 - 0.4 * Math.min(1, t / 2.5)) * (c ? 1 : 0.95), 0.6, 2); })(),
      rumble: make(8, (t) => lo(nz()) * 3 * (0.75 + 0.25 * Math.sin(TAU * t / 8)) + lo2(nz()) * 0.6),
      pad: make(PAD, (t, c) => {
        let s = 0;
        for (const [f1, f2, a] of voices) s += a * (saw(f1 * t + c * 0.25) + saw(f2 * t)) * 0.5;
        return pf[c](s) * (0.7 + 0.3 * Math.sin(TAU * t / PAD));
      }, 0.8, 2),
      hiss: make(6, (t) => air(nz()) * 0.3 * (0.6 + 0.4 * Math.sin(TAU * t / 6))),
      bells: [659.3, 740, 784, 880, 987.8].map((f) => bell(f)),
      step: Array.from({ length: 6 }, step),
      poke: (() => { let ph = 0; return make(0.35, (t) => { ph += (900 * Math.pow(0.4, t / 0.12)) / A.ctx.sampleRate; return Math.sin(TAU * ph) * Math.exp(-t / 0.1) + nz() * Math.exp(-t / 0.004) * 0.5; }); })(),
      whoosh: (() => { const bp = biq('bp', 900, 0.8); return make(0.8, (t) => bp(nz()) * Math.sin(Math.PI * t / 0.8) ** 2); })(),
      tink: (() => { const r = biq('bp', 3200, 12); return make(1.6, (t) => r(nz()) * Math.exp(-t / 0.4) * 2 + Math.sin(TAU * 2350 * t) * Math.exp(-t / 0.5) * 0.4 + lo(nz()) * Math.exp(-t / 0.06) * 3); })(),
      // the tear: wind through a band that swings about, and the sub under it (looped, its gain the hole's strength)
      roar: make(6, (t) => wind(nz()) * (0.6 + 0.4 * Math.sin(TAU * t / 3)) + lo(nz()) * 2.5, 0.9),
      zip: (() => { let ph = 0; return make(0.7, (t) => { ph += (1400 * Math.pow(0.08, t / 0.7)) / A.ctx.sampleRate; return (saw(ph) * 0.6 + nz() * 0.15) * Math.exp(-t / 0.3); }); })(),
      heal: make(3.5, (t) => [0, 0.18, 0.36, 0.54].reduce((s, d, i) => s + (t > d ? Math.sin(TAU * [587.3, 740, 880, 1174.7][i] * (t - d)) * Math.exp(-(t - d) * 1.4) : 0), 0)
        * Math.min(1, t / 0.01) + air(nz()) * Math.sin(Math.PI * Math.min(1, t / 3.5)) * 0.2),
      // the bookcase on B3, dragged: a heavy wooden scrape, juddering as it sticks and slips; and its thud as it stops
      scrape: (() => { const body = biq('bp', 180, 1.4), grit = biq('bp', 1400, 0.9), low = biq('lp', 120, 0.7); let j = 0;
        return make(3, (t) => { if (Math.random() < 0.0012) j = rnd(0.5, 1); j *= 0.9993;
          const judder = 0.55 + 0.45 * Math.abs(Math.sin(TAU * cyc(13, 3) * t));
          return (body(nz()) * 2.2 * judder + grit(nz()) * 0.5 * (0.3 + j) + low(nz()) * 1.5) * (0.7 + 0.3 * j); }, 0.9); })(),
      thud: (() => { const lp = biq('lp', 90, 0.8), knock = biq('bp', 500, 2);
        return make(0.6, (t) => lp(nz()) * 6 * Math.exp(-t / 0.08) + Math.sin(TAU * 62 * t) * Math.exp(-t / 0.12) + knock(nz()) * Math.exp(-t / 0.02) * 0.3); })(),
      buzz: make(2, (t) => Math.sin(TAU * 120 * t) * 0.6 + Math.sin(TAU * 240 * t) * 0.25 + Math.sign(Math.sin(TAU * 120 * t)) * 0.08),
    };
  }
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) { A = a; B = null; loops = []; out = verb = roar = bleedL = buzzL = scrapeL = null; }
    if (!B) B = build();
    if (!out) {
      out = A.ctx.createGain(); out.connect(A.master);
      verb = A.ctx.createConvolver(); verb.buffer = B.hall;
      const wet = A.ctx.createGain(); wet.gain.value = 0.6; verb.connect(wet).connect(out);
    }
    return true;
  }
  // A one-shot at p (the grid's space), dry plus a send to the room; p null: in your head.
  function shot(buf, p, gain, { rate = 1, send = 0.4, when = 0 } = {}) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g);
    if (p) {
      const pan = A.ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 3; pan.rolloffFactor = 0.8;
      pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
      g.connect(pan).connect(out);
    } else g.connect(out);
    const s = A.ctx.createGain(); s.gain.value = send; g.connect(s).connect(verb);
    src.onended = () => src.disconnect();
    src.start(A.ctx.currentTime + when);
  }
  function loop(buf, gain, to = out) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g).connect(to); g.gain.setTargetAtTime(gain, A.ctx.currentTime, 2);
    src.start(); loops.push({ src, g });
    return { src, g };
  }
  // A loop at level v (0 to 1) straight to the office's master, made when first wanted and stopped when it falls silent.
  function level(L, bufs, v) {
    const now = A.ctx.currentTime;
    if (!L) {
      const g = A.ctx.createGain(); g.gain.value = 0; g.connect(A.master);
      L = { g, srcs: bufs.map(([buf, gain]) => { const src = A.ctx.createBufferSource(), sg = A.ctx.createGain(); src.buffer = buf; src.loop = true; sg.gain.value = gain; src.connect(sg).connect(g); src.start(); return src; }) };
    }
    L.g.gain.setTargetAtTime(v, now, 0.3);
    if (v < 0.002) { for (const src of L.srcs) src.stop(now + 1.5); return null; }
    return L;
  }

  return {
    // Each frame you're in the grid: the score, the bells, your steps, and the tear's roar at `hole` (0 to 1) at `at`.
    fx(dt, t, hole, at) {
      if (!ready()) return;
      if (!loops.length) { loop(B.rumble, 0.05); loop(B.pad, 0.035); loop(B.hiss, 0.006); chimeAt = t + rnd(2, 5); }
      const p = camera.position;
      const moved = lastP ? Math.hypot(p.x - lastP.x, p.z - lastP.z) / Math.max(dt, 1e-3) : 0;
      lastP = { x: p.x, z: p.z };
      const walking = moved > 1 && moved < 12;
      stepAcc = walking ? stepAcc + dt : 0.3;
      if (walking && stepAcc > (moved > 6 ? 0.3 : 0.44)) { stepAcc = 0; shot(pick(B.step), null, 0.07, { rate: rnd(0.94, 1.06), send: 0.5 }); }
      if (t > chimeAt) {   // a held bell, somewhere off in the dark
        const a = Math.random() * TAU, d = rnd(8, 30);
        shot(pick(B.bells), { x: p.x + Math.cos(a) * d, y: rnd(1, 6), z: p.z + Math.sin(a) * d }, 0.05, { rate: pick([1, 1, 0.5, 2]), send: 1 });
        chimeAt = t + rnd(3.5, 9);
      }
      if (hole > 0.002 && !roar) roar = loop(B.roar, 0);
      if (roar) {
        roar.g.gain.setTargetAtTime(0.16 * hole * hole, A.ctx.currentTime, 0.4);
        roar.src.playbackRate.setTargetAtTime(0.6 + 0.6 * hole, A.ctx.currentTime, 0.5);
      }
    },
    poke(p) { if (ready()) shot(B.poke, p, 0.12, { send: 0.3 }); },
    whoosh(p) { if (ready()) shot(B.whoosh, p, 0.08, { rate: rnd(0.9, 1.1) }); },
    tink(p) { if (ready()) shot(B.tink, p, 0.12, { send: 0.6 }); },
    zip(p) { if (ready()) shot(B.zip, p, 0.05, { rate: rnd(0.8, 1.2), send: 0.7 }); },
    heal(p) { if (ready()) shot(B.heal, p, 0.12, { send: 0.9 }); },
    // Heard through the doorway: this side on B3 (v: 0 to 1), and B3's strip lights in here.
    bleed(v) { if (ready() && (bleedL || v >= 0.002)) bleedL = level(bleedL, [[B.pad, 0.035], [B.rumble, 0.04]], v); },
    buzz(v) { if (ready() && (buzzL || v >= 0.002)) buzzL = level(buzzL, [[B.buzz, 0.012]], v); },
    scrape(v) { if (ready() && (scrapeL || v >= 0.002)) scrapeL = level(scrapeL, [[B.scrape, 0.09]], v); },
    thud(v) { if (ready()) shot(B.thud, null, 0.14 * v, { send: 0 }); },
    get playing() { return loops.length > 0; },
    stop() {
      if (A) for (const { src, g } of loops) { g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3); src.stop(A.ctx.currentTime + 1.5); }
      loops = []; lastP = null; roar = null;
    },
  };
}
