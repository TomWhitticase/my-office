// Relativity's sounds (floors/relativity.js): a vast quiet room. Everything goes through a long, soft reverb (a
// synthesised impulse, six seconds of hall). A faint drone, two low tones a fifth apart, breathing slowly; air moving
// high up. Your own steps on stone, and the figures' steps near you; and steps from directions that make no sense,
// overhead, underfoot, walking a line through a wall. A door's creak, the world turning over, and, when you glimpse
// yourself, your own steps arriving a beat late from over there. All synthesised here, through the office's own audio
// (sounds.js `audio`), so its volume and M apply. Positions are in the world.

const TAU = Math.PI * 2;

export function makeSound(ctx) {
  const { camera } = ctx;
  let A = null, B = null, out = null, verb = null, loops = [], stepAcc = 0, lastP = null, ghostAt = 0, figAt = 0, echo = null, bleedL = null;
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
  // A step on stone: a hard little tap, a low knock under it, a scuff.
  function stone() {
    const hp = biq('bp', rnd(1800, 2600), 1.4), lo = biq('lp', 320, 0.8), sc = biq('bp', rnd(3500, 5000), 0.8), at = rnd(0.02, 0.05);
    return make(0.25, (t) => hp(nz()) * Math.exp(-t / 0.008) * 1.6 + lo(nz()) * Math.exp(-t / 0.03) * 3 + (t > at ? sc(nz()) * Math.exp(-(t - at) / 0.04) * 0.25 : 0));
  }
  function build() {
    const lpd = biq('lp', 70, 0.7), air = biq('bp', 900, 0.4);
    return {
      // the hall: a decaying cloud of noise, darker as it dies, a little different left and right
      hall: (() => { const f = [biq('lp', 7000, 0.5), biq('lp', 7000, 0.5)];
        return make(6, (t, c) => f[c](nz()) * Math.exp(-t / 1.6) * (1 - 0.4 * Math.min(1, t / 3)) * (c ? 1 : 0.96), 0.6, 2); })(),
      drone: make(12, (t) => (0.5 * Math.sin(TAU * 55 * t) + 0.32 * Math.sin(TAU * 82.5 * t + 1) + 0.12 * Math.sin(TAU * 110.25 * t)) * (0.65 + 0.35 * Math.sin(TAU * t / 12)) + lpd(nz()) * 2),
      air: make(8, (t) => air(nz()) * (0.6 + 0.4 * Math.sin(TAU * t / 8))),
      step: Array.from({ length: 6 }, stone),
      creak: (() => { const bp = biq('bp', 700, 7); let ph = 0; return make(1.4, (t) => { ph += (30 + 60 * t) / A.ctx.sampleRate; return bp(ph % 1 < 0.05 ? nz() : 0) * Math.sin(Math.PI * t / 1.4); }); })(),
      whoosh: (() => { const bp = biq('bp', 500, 0.6); return make(0.9, (t) => bp(nz()) * Math.sin(Math.PI * t / 0.9) ** 2); })(),
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
      const wet = A.ctx.createGain(); wet.gain.value = 0.55; verb.connect(wet).connect(out);
    }
    return true;
  }
  // A one-shot at p (world), dry plus a send to the hall (more of it the further off); p null: in your head.
  function shot(buf, p, gain, { rate = 1, lp = 0, send = 0.5, when = 0 } = {}) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    let head = src;
    if (lp) { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); head = f; }
    head.connect(g);
    if (p) {
      const pan = A.ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 3; pan.rolloffFactor = 0.9;
      pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
      g.connect(pan).connect(out);
    } else g.connect(out);
    const s = A.ctx.createGain(); s.gain.value = send; g.connect(s).connect(verb);
    src.onended = () => src.disconnect();
    src.start(A.ctx.currentTime + when);
  }
  function loop(buf, gain, lp) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = 0;
    let head = src;
    if (lp) { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); head = f; }
    head.connect(g).connect(out); g.gain.setTargetAtTime(gain, A.ctx.currentTime, 2.5);
    src.start(); loops.push({ src, g });
  }
  const off = (d, up) => { const a = Math.random() * TAU, e = up ?? rnd(-1, 1); const p = camera.position;
    return { x: p.x + Math.cos(a) * d * Math.sqrt(1 - e * e), y: p.y + e * d, z: p.z + Math.sin(a) * d * Math.sqrt(1 - e * e) }; };

  return {
    fx(dt, t, people) {
      if (!ready()) return;
      if (!loops.length) { loop(B.drone, 0.05, 400); loop(B.air, 0.012); ghostAt = t + rnd(4, 10); }
      const p = camera.position;
      // your steps, and now and then their echo from wherever you glimpsed yourself
      const moved = lastP ? Math.hypot(p.x - lastP.x, p.y - lastP.y, p.z - lastP.z) / Math.max(dt, 1e-3) : 0;
      lastP = { x: p.x, y: p.y, z: p.z };
      const walking = moved > 1 && moved < 10;
      stepAcc = walking ? stepAcc + dt : 0.3;
      if (walking && stepAcc > (moved > 5 ? 0.3 : 0.44)) {
        stepAcc = 0; shot(pick(B.step), null, 0.09, { rate: rnd(0.92, 1.06), send: 0.35 });
        if (echo) shot(pick(B.step), echo, 0.1, { rate: rnd(0.92, 1.06), lp: 2500, send: 0.9, when: 0.28 });
      }
      echo = people.me.on ? people.worldPos(people.me) : null;
      // the figures near you, walking
      if (t > figAt) {
        figAt = t + 0.45;
        for (const f of people.figs) if (f.kind !== 'me' && f.kind !== 'sit' && f.kind !== 'lean' && f.wait <= 0) {
          const w = people.worldPos(f);
          if (w.distanceTo(p) < 14) shot(pick(B.step), w, 0.06, { rate: rnd(0.95, 1.05), send: 0.6, when: rnd(0, 0.2) });
        }
      }
      // steps from nowhere sensible: overhead, underfoot, crossing through a wall, a few and then gone
      if (t > ghostAt) {
        const n = 3 + Math.floor(Math.random() * 6), a = off(rnd(10, 26), pick([0.9, -0.9, rnd(-0.3, 0.3)])), dir = off(1, 0);
        for (let i = 0; i < n; i++) shot(pick(B.step), { x: a.x + (dir.x - p.x) * i * 0.7, y: a.y, z: a.z + (dir.z - p.z) * i * 0.7 }, 0.08, { rate: rnd(0.85, 1), lp: 2200, send: 1, when: i * 0.52 });
        ghostAt = t + rnd(9, 24);
      }
    },
    roll() { if (ready()) shot(B.whoosh, null, 0.08, { rate: rnd(0.8, 1), send: 0.8 }); },
    door(p) { if (ready()) shot(B.creak, p || null, 0.12, { rate: rnd(0.85, 1.05), send: 0.8 }); },
    glimpse(p) { if (ready()) shot(pick(B.step), p, 0.12, { send: 1, lp: 2400 }); },
    // Heard through the open stone door from B3 (relativity-door.js): the hall's drone and air at v (0 to 1), its own loops.
    bleed(v) {
      if (!ready() || (!bleedL && v < 0.002)) return;
      const now = A.ctx.currentTime;
      if (!bleedL) {
        const g = A.ctx.createGain(); g.gain.value = 0; g.connect(A.master);
        bleedL = { g, srcs: [[B.drone, 0.05, 400], [B.air, 0.012, 0]].map(([buf, gain, lp]) => {
          const src = A.ctx.createBufferSource(), sg = A.ctx.createGain(); src.buffer = buf; src.loop = true; sg.gain.value = gain;
          let head = src;
          if (lp) { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); head = f; }
          head.connect(sg).connect(g); src.start(); return src;
        }) };
      }
      bleedL.g.gain.setTargetAtTime(v, now, 0.3);
      if (v < 0.002) { for (const src of bleedL.srcs) src.stop(now + 1.5); bleedL = null; }
    },
    stop() {
      if (A) for (const { src, g } of loops) { g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3); src.stop(A.ctx.currentTime + 1.5); }
      loops = []; lastP = null; echo = null;
    },
  };
}
