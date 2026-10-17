// The village's sounds (floors/kettle.js). A soft wind over the snow; your steps crunching, knocking on wood, and on the
// ice the long hiss of your skates and the scrape of each push; far voices, chatter and laughter, someone calling hello;
// dogs barking and yipping when you pet them; the kettle's whistle now and then; the lake's ice singing, the long falling
// "pew" of a frozen lake; a snowball's soft thump; the door's creak; the stove's crackle inside; and an accordion waltz
// from the player by the gateway, heard from wherever he is. All synthesised here, short ones at a low sample rate as
// they're first wanted, the tune rendered off the main thread (an OfflineAudioContext), through the office's own audio
// (sounds.js `audio`), so its volume and M apply. Positions are in the world.

const TAU = Math.PI * 2, SR = 22050;

export function makeSound(ctx, { tunePos }) {
  const { camera } = ctx;
  let A = null, B = {}, out = null, verb = null, loops = [], bleedL = null, tune = null, glide = null, crackle = null, stepAcc = 0, lastP = null, rendering = false;
  const due = { voice: 0, laugh: 0, whistle: 0, ice: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a), nz = () => Math.random() * 2 - 1, pick = (a) => a[Math.floor(Math.random() * a.length)];
  function biq(type, f, q) {   // RBJ biquad, per sample
    const w = TAU * f / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [a, 0, -a];
    const k0 = b0 / a0, k1 = b1 / a0, k2 = b2 / a0, a1 = -2 * c / a0, a2 = (1 - a) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => { const y = k0 * x + k1 * x1 + k2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  function make(sec, fn, peak = 0.9, ch = 1) {
    const n = Math.ceil(sec * SR), b = A.ctx.createBuffer(ch, n, SR);
    for (let c = 0; c < ch; c++) {
      const d = b.getChannelData(c);
      let m = 0;
      for (let k = 0; k < n; k++) { d[k] = fn(k / SR, c); m = Math.max(m, Math.abs(d[k])); }
      for (let k = 0; k < n; k++) d[k] *= (m ? peak / m : 0) * Math.min(1, (n - k) / (SR * 0.01), k / (SR * 0.003));
    }
    return b;
  }
  // a voice: a buzz at f0(t) through three formants (form(t)), breath under it, amp(t)
  function voice(sec, f0, form, amp, { breath = 0.15, rough = 0.02 } = {}) {
    let ph = 0, jit = 0, fs = form(0), bank = fs.map((f, i) => biq('bp', f, [5, 8, 10][i])), next = 0;
    return make(sec, (t) => {
      if (t >= next) { next = t + 0.02; const nf = form(t); bank = nf.map((f, i) => (Math.abs(f - fs[i]) > 20 ? biq('bp', f, [5, 8, 10][i]) : bank[i])); fs = nf; }
      jit += (nz() * rough - jit) * 0.02; ph = (ph + f0(t) * (1 + jit) / SR) % 1;
      const src = (2 * ph - 1) * (1 - breath) + nz() * breath;
      return (bank[0](src) + bank[1](src) * 0.7 + bank[2](src) * 0.4) * amp(t);
    });
  }
  const env = (a, h, r) => (t) => (t < a ? t / a : t < a + h ? 1 : Math.max(0, 1 - (t - a - h) / r));
  const VOW = { a: [800, 1250, 2600], o: [500, 900, 2500], e: [500, 1800, 2600], i: [320, 2300, 3000], u: [350, 800, 2400] };
  // syllables: [vowel, start, length, pitch]
  const speak = (syl, f0, sec) => voice(sec, (t) => { const s = syl.find(([, a, d]) => t >= a && t < a + d) || syl.at(-1); return f0 * s[3] * (1 + 0.05 * Math.sin(TAU * 5 * t)); },
    (t) => VOW[(syl.find(([, a, d]) => t >= a && t < a + d) || syl[0])[0]], (t) => { const s = syl.find(([, a, d]) => t >= a && t < a + d); return s ? Math.sin(Math.PI * (t - s[1]) / s[2]) ** 0.6 : 0; }, { breath: 0.2, rough: 0.04 });
  // what each sound is, made the first time it's wanted
  const KINDS = {
    wind: () => { const lp = [biq('lp', 300, 0.6), biq('lp', 300, 0.6)], wh = [biq('bp', 900, 6), biq('bp', 1100, 6)];
      return make(10, (t, c) => (lp[c](nz()) * 3 + wh[c](nz()) * 0.3 * (0.5 + 0.5 * Math.sin(TAU * t / 5 + c))) * (0.6 + 0.3 * Math.sin(TAU * t / 10) + 0.1 * Math.sin(TAU * t / 2.5 + c * 2)), 0.7, 2); },
    hall: () => { const f = [biq('lp', 3000, 0.5), biq('lp', 3000, 0.5)]; return make(2.2, (t, c) => f[c](nz()) * Math.exp(-t / 0.5), 0.5, 2); },
    snow: () => Array.from({ length: 5 }, () => { const bp = biq('bp', 1800 + Math.random() * 900, 0.9), lp = biq('lp', 700, 0.7);
      return make(0.24, (t) => (bp(nz() * (Math.random() < 0.35 ? 1 : 0.25)) * 1.4 + lp(nz()) * 0.8) * Math.exp(-t / 0.06) * Math.min(1, t * 120)); }),
    wood: () => Array.from({ length: 4 }, () => { const lp = biq('lp', 260 + Math.random() * 80, 1.4), bp = biq('bp', 900, 3);
      return make(0.2, (t) => (lp(nz()) * 3 + bp(nz()) * 0.6 * Math.exp(-t / 0.01)) * Math.exp(-t / 0.05)); }),
    push: () => Array.from({ length: 4 }, () => { const bp = biq('bp', 3500 + Math.random() * 1500, 1.5), hp = biq('hp', 2000, 0.7);
      return make(0.5, (t) => (bp(nz()) + hp(nz()) * 0.3) * Math.sin(Math.PI * Math.min(1, t / 0.5)) ** 0.5 * Math.exp(-t * 2.5)); }),
    glide: () => { const bp = biq('bp', 4200, 0.8); return make(4, (t) => bp(nz()) * (0.8 + 0.2 * Math.sin(TAU * t * 0.5)), 0.6); },
    thump: () => { const lp = biq('lp', 220, 0.8), bp = biq('bp', 1600, 1); return make(0.35, (t) => (lp(nz()) * 2.5 + bp(nz()) * 0.7 * Math.exp(-t / 0.03)) * Math.exp(-t / 0.07)); },
    creak: () => { const bp = biq('bp', 380, 8); let ph = 0; return make(1.1, (t) => { ph += (14 + 30 * Math.sin(Math.PI * t / 1.1)) / SR; return bp(ph % 1 < 0.07 ? nz() : 0) * Math.sin(Math.PI * t / 1.1); }, 0.7); },
    latch: () => { const bp = biq('bp', 2400, 4); return make(0.15, (t) => bp(nz()) * Math.exp(-t / 0.015) + Math.sin(TAU * 900 * t) * Math.exp(-t / 0.02) * 0.4); },
    whistle: () => { const bp = biq('bp', 2000, 12); let ph = 0;
      return make(3.6, (t) => { const f = 1650 + 600 * Math.min(1, t / 1.2) + 40 * Math.sin(TAU * 6 * t); ph = (ph + f / SR) % 1;
        const e = Math.min(1, t / 0.5) * Math.max(0, 1 - Math.max(0, t - 2.8) / 0.8); return (Math.sin(TAU * ph) * 0.8 + bp(nz()) * 0.8) * e; }, 0.6); },
    steam: () => { const hp = biq('hp', 1500, 0.7); return make(2.2, (t) => hp(nz()) * Math.min(1, t * 8) * Math.exp(-t * 1.1), 0.5); },
    ice: () => Array.from({ length: 3 }, () => { const f0 = 1400 + Math.random() * 800, bp = biq('bp', 600, 2); let ph = 0;
      return make(1.6, (t) => { ph = (ph + f0 * Math.exp(-t * 3.2) / SR + 80 / SR) % 1; return (Math.sin(TAU * ph) * 0.7 + bp(nz()) * 0.3) * Math.exp(-t * 2.2) * Math.min(1, t * 200); }, 0.6); }),
    crackle: () => { const lp = biq('lp', 300, 0.7), bp = biq('bp', 2800, 1.5); let pop = 0; return make(4, (t) => { if (Math.random() < 0.0016) pop = 0.5 + Math.random(); pop *= 0.985; return lp(nz()) * 0.5 + bp(nz() * pop) * 1.6; }, 0.6); },
    hello: () => [[220, 1], [300, 1], [190, 1]].map(([f]) => speak([['a', 0.02, 0.18, 1.0], ['o', 0.22, 0.32, 1.15]], f, 0.6)),
    chatter: () => Array.from({ length: 6 }, () => { const syl = []; let at = 0.03; const vs = Object.keys(VOW);
      while (at < 1.4) { const d = 0.1 + Math.random() * 0.14; syl.push([pick(vs), at, d, 0.85 + Math.random() * 0.35]); at += d + 0.03 + Math.random() * 0.06; }
      return speak(syl, pick([140, 190, 230, 280]), 1.6); }),
    laugh: () => [[230, 5], [320, 6], [170, 4]].map(([f, n]) => speak(Array.from({ length: n }, (_, k) => ['a', 0.04 + k * 0.17, 0.12, 1.15 - k * 0.04]), f, 0.1 + n * 0.17 + 0.1)),
    bark: () => [0, 1, 2].map(() => { const f = 420 + Math.random() * 200; return voice(0.22, (t) => f * (1.3 - t * 2.5), () => [700, 1300, 2600], env(0.01, 0.06, 0.12), { breath: 0.35, rough: 0.15 }); }),
    yip: () => [0, 1].map(() => voice(0.32, (t) => 900 * (1 + 0.4 * Math.sin(Math.PI * t / 0.32)), () => [900, 2000, 3000], env(0.02, 0.15, 0.12), { breath: 0.25 })),
  };
  const get = (k) => (B[k] ||= KINDS[k]());
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) { A = a; B = {}; loops = []; out = verb = bleedL = tune = glide = crackle = null; rendering = false; }
    if (!out) {
      out = A.ctx.createGain(); out.connect(A.master);
      verb = A.ctx.createConvolver(); verb.buffer = get('hall');
      const wet = A.ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet).connect(out);
    }
    return true;
  }
  function panner(p, ref) {
    const pan = A.ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = 1;
    pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; return pan;
  }
  function shot(buf, p, gain, { rate = 1, lp = 0, send = 0.3, ref = 3, when = 0 } = {}) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    let head = src;
    if (lp) { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); head = f; }
    head.connect(g);
    if (p) g.connect(panner(p, ref)).connect(out); else g.connect(out);
    if (send) { const s = A.ctx.createGain(); s.gain.value = send; g.connect(s).connect(verb); }
    src.onended = () => src.disconnect();
    src.start(A.ctx.currentTime + when);
    return src;
  }
  function loop(buf, gain, to = out) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g).connect(to); g.gain.setTargetAtTime(gain, A.ctx.currentTime, 1.5);
    src.start(); return { src, g };
  }
  // The waltz: an accordion's two reeds a little apart, a bass and chords under the tune; rendered once, off the main thread.
  function renderTune() {
    if (rendering) return; rendering = true;
    const beat = 0.5, bars = 16, sec = bars * 3 * beat + 0.5, rate = 32000, oc = new OfflineAudioContext(1, Math.ceil(sec * rate), rate);
    const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
    const bus = oc.createBiquadFilter(); bus.type = 'lowpass'; bus.frequency.value = 2400; bus.connect(oc.destination);
    const reed = (m, t0, d, v) => {
      for (const det of [-6, 7]) {
        const o = oc.createOscillator(), g = oc.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.04); g.gain.setValueAtTime(v * 0.85, t0 + d * 0.7); g.gain.linearRampToValueAtTime(0, t0 + d);
        o.connect(g).connect(bus); o.start(t0); o.stop(t0 + d + 0.02);
      }
    };
    const TUNE = [[76, 2], [74, 1], [72, 2], [76, 1], [79, 2], [77, 1], [76, 3], [74, 2], [76, 1], [77, 2], [81, 1], [79, 1], [77, 1], [76, 1], [74, 3],
      [76, 2], [74, 1], [72, 2], [76, 1], [79, 2], [84, 1], [83, 2], [81, 1], [79, 1], [81, 1], [77, 1], [76, 1], [74, 1], [71, 1], [72, 3], [72, 2], [0, 1]];
    let t = 0.1;
    for (const [m, b] of TUNE) { if (m) reed(m, t, b * beat * 0.95, 0.05); t += b * beat; }
    const CH = { C: [48, [60, 64, 67]], G: [43, [59, 62, 67]], F: [41, [60, 65, 69]] }, BARS = 'CCGCGFCGCCCFCGCC';
    for (let k = 0; k < bars; k++) {
      const [bass, tri] = CH[BARS[k]], t0 = 0.1 + k * 3 * beat;
      reed(bass, t0, beat * 0.8, 0.045);
      for (const b of [1, 2]) for (const m of tri) reed(m, t0 + b * beat, beat * 0.45, 0.018);
    }
    oc.startRendering().then((buf) => { B.tune = buf; }).catch(() => { rendering = false; });
  }
  const fw = { x: 0, z: 0 };
  const far = (d) => { const a = Math.random() * TAU, p = camera.position; return { x: p.x + Math.cos(a) * d, y: p.y + rnd(-1, 2), z: p.z + Math.sin(a) * d }; };

  return {
    // each frame out there: on (ice, wood or snow under you), how fast you're going, inside the kettle
    fx(dt, t, { surface, speed, inside, stove }) {
      if (!ready()) return;
      if (!loops.length) {
        loops.push(loop(get('wind'), 0.07));
        due.voice = t + rnd(3, 8); due.laugh = t + rnd(8, 18); due.whistle = t + rnd(25, 50); due.ice = t + rnd(10, 25);
      }
      loops[0].g.gain.setTargetAtTime(inside ? 0.025 : 0.07, A.ctx.currentTime, 0.4);
      if (!B.tune) renderTune();
      else if (!tune) {   // the waltz, from the accordion player's barrel
        const src = A.ctx.createBufferSource(), g = A.ctx.createGain(); src.buffer = B.tune; src.loop = true; g.gain.value = 0;
        const pan = panner(tunePos, 4); src.connect(g).connect(pan).connect(out); const s2 = A.ctx.createGain(); s2.gain.value = 0.15; g.connect(s2).connect(verb);
        g.gain.setTargetAtTime(0.9, A.ctx.currentTime, 2); src.start(); tune = { src, g };
      }
      if (tune) tune.g.gain.setTargetAtTime(inside ? 0.25 : 0.9, A.ctx.currentTime, 0.5);
      // the stove inside, louder as you come in
      if (!crackle) crackle = loop(get('crackle'), 0, out);
      crackle.g.gain.setTargetAtTime(inside ? 0.05 + stove * 0.1 : 0, A.ctx.currentTime, 0.4);
      // skates: the hiss with your speed on the ice; steps elsewhere
      if (!glide) glide = loop(get('glide'), 0, out);
      glide.g.gain.setTargetAtTime(surface === 'ice' ? Math.min(0.05, speed * 0.008) : 0, A.ctx.currentTime, 0.08);
      const p = camera.position, moved = lastP ? Math.hypot(p.x - lastP.x, p.z - lastP.z) / Math.max(dt, 1e-3) : 0;
      lastP = { x: p.x, z: p.z };
      if (surface !== 'ice') {
        const walking = moved > 1 && moved < 12;
        stepAcc = walking ? stepAcc + dt : 0.3;
        if (walking && stepAcc > (moved > 6 ? 0.3 : 0.44)) { stepAcc = 0; shot(pick(get(surface === 'wood' ? 'wood' : 'snow')), null, surface === 'wood' ? 0.08 : 0.05, { rate: rnd(0.9, 1.1), send: 0.05 }); }
      }
      // out there: voices and laughter, the ice, now and then the kettle
      if (inside) return;
      if (t > due.voice) { due.voice = t + rnd(4, 10); shot(pick(get('chatter')), far(rnd(18, 35)), 0.05, { rate: rnd(0.95, 1.1), lp: 2600, send: 0.6, ref: 5 }); }
      if (t > due.laugh) { due.laugh = t + rnd(9, 22); shot(pick(get('laugh')), far(rnd(15, 30)), 0.06, { rate: rnd(0.95, 1.1), lp: 3000, send: 0.6, ref: 5 }); }
      if (t > due.ice) { due.ice = t + rnd(18, 45); shot(pick(get('ice')), far(rnd(30, 60)), 0.08, { rate: rnd(0.8, 1.1), send: 1.0, ref: 10 }); }
      if (t > due.whistle) { due.whistle = t + rnd(50, 110); return 'whistle'; }
      void fw;
      return null;
    },
    push(p) { if (ready()) shot(pick(get('push')), null, 0.05, { rate: rnd(0.9, 1.15), send: 0.05 }); void p; },
    whistle(p) { if (!ready()) return; shot(get('whistle'), p, 0.35, { send: 0.4, ref: 8, rate: rnd(0.96, 1.04) }); shot(get('steam'), p, 0.2, { send: 0.2, ref: 6 }); },
    steam(p) { if (ready()) shot(get('steam'), p, 0.12, { send: 0.2, ref: 5, rate: rnd(0.9, 1.1) }); },
    thump(p) { if (ready()) shot(get('thump'), p, 0.35, { send: 0.2, ref: 3, rate: rnd(0.85, 1.15) }); },
    creak(p) { if (ready()) { shot(get('creak'), p, 0.25, { send: 0.2, ref: 2, rate: rnd(0.9, 1.1) }); shot(get('latch'), p, 0.15, { send: 0.1, ref: 2 }); } },
    hello(p, kid) { if (ready()) shot(pick(get('hello')), p, 0.12, { rate: kid ? 1.5 : rnd(0.9, 1.1), send: 0.2, ref: 3 }); },
    laugh(p, kid) { if (ready()) shot(pick(get('laugh')), p, 0.14, { rate: kid ? 1.45 : rnd(0.95, 1.1), send: 0.2, ref: 3 }); },
    bark(p, s) { if (ready()) { const b = pick(get('bark')); shot(b, p, 0.16, { rate: 1.3 - s * 0.35, send: 0.3, ref: 3 }); if (Math.random() < 0.6) shot(b, p, 0.14, { rate: 1.3 - s * 0.35, send: 0.3, ref: 3, when: 0.22 }); } },
    happy(p, s) { if (ready()) shot(pick(get('yip')), p, 0.14, { rate: 1.25 - s * 0.3, send: 0.2, ref: 2 }); },
    stoke(p) { if (ready()) { shot(get('thump'), p, 0.2, { rate: 0.6, send: 0.1, ref: 2 }); shot(get('crackle'), p, 0.15, { send: 0.1, ref: 2 }); } },
    // Heard from B3 through the painting: the wind and the far waltz at v (0 to 1).
    bleed(v) {
      if ((!bleedL && v < 0.002) || !ready()) return;
      const now = A.ctx.currentTime;
      if (!bleedL) {
        const g = A.ctx.createGain(); g.gain.value = 0; g.connect(A.master);
        bleedL = { g, srcs: [loop(get('wind'), 0.07, g)] };
        if (B.tune) { const l2 = loop(B.tune, 0.15, g); bleedL.srcs.push(l2); } else renderTune();
      }
      bleedL.g.gain.setTargetAtTime(v, now, 0.3);
      if (v < 0.002) { for (const s of bleedL.srcs) s.src.stop(now + 1.5); bleedL = null; }
    },
    stop() {
      if (A) for (const l of [...loops, tune, glide, crackle]) if (l) { l.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3); l.src.stop(A.ctx.currentTime + 1.5); }
      loops = []; tune = glide = crackle = null; lastP = null;
    },
  };
}
