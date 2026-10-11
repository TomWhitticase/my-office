// The secret door's sounds (world/secret-room.js) and the den's: the latch behind the book, the bookcase's bay backing into
// the wall with a thud and its heavy rumbling slide, the hatch, the ladder's stiles sliding up, a clank for each rung, the
// lever, the safe's dial and its door, the lamp's pull chain, the fire (catching, crackling, put out), a record on the
// turntable (a slow jazz loop under the crackle), and the crawl through the duct (hands and knees on sheet metal, ticks and
// booms, your breath, a hum, a draught, voices far off, the grille clattering out). All synthesised here (nothing until the
// first one's wanted), through the office's own audio (sounds.js `audio`), so its volume and M apply. Positions are in
// whichever scene's space you're in (the office's, or behind the sky's, for the duct's far end).

const TAU = Math.PI * 2;

export function makeSound(ctx) {
  let A = null, B = null, out = null, record = null, fire = null, loops = {};
  const rnd = (a, b) => a + Math.random() * (b - a), nz = () => Math.random() * 2 - 1;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ----- synthesis -----
  function biq(type, f, q) {   // RBJ biquad, per sample
    const SR = A.ctx.sampleRate, w = TAU * f / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [a, 0, -a];
    const k0 = b0 / a0, k1 = b1 / a0, k2 = b2 / a0, a1 = -2 * c / a0, a2 = (1 - a) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => { const y = k0 * x + k1 * x1 + k2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  function make(sec, fn, peak = 0.9) {
    const SR = A.ctx.sampleRate, n = Math.ceil(sec * SR), b = A.ctx.createBuffer(1, n, SR), d = b.getChannelData(0);
    let m = 0;
    for (let k = 0; k < n; k++) { d[k] = fn(k / SR); m = Math.max(m, Math.abs(d[k])); }
    for (let k = 0; k < n; k++) d[k] *= (m ? peak / m : 0) * Math.min(1, (n - k) / (SR * 0.005), k / (SR * 0.002));
    return b;
  }
  function clunk() {   // the latch behind the book letting go: a click, then a dull thump in the wall
    const click = biq('bp', 2400, 3), body = biq('bp', 160, 2), lo = biq('lp', 120, 0.8);
    return make(0.5, (t) => { const n = nz(); return click(n * Math.exp(-t / 0.004)) * 0.8 + body(n * Math.exp(-Math.max(0, t - 0.05) / 0.04) * (t > 0.05)) * 3
      + lo(n * Math.exp(-Math.max(0, t - 0.05) / 0.08) * (t > 0.05)) * 4; });
  }
  function rumble() {   // a loaded bookcase bay sliding on its runners: a low grinding rumble, the wood groaning, a creak or two
    const grind = biq('lp', 110, 0.8), groan = biq('bp', 240, 6), creak = biq('bp', 900, 9), D = 2.1;
    const creaks = [0.4, 1.0, 1.6].map((c) => c + rnd(-0.12, 0.12));
    return make(D, (t) => {
      const e = Math.min(1, t / 0.35, (D - t) / 0.4), n = nz(), w = 0.6 + 0.4 * Math.sin(TAU * 1.7 * t) * Math.sin(TAU * 0.6 * t + 1);
      let c = 0; for (const k of creaks) c += Math.exp(-((t - k) ** 2) / 0.006) * (0.5 + 0.5 * Math.sin(TAU * 31 * t));
      return grind(n) * 5 * e * w + groan(n * e) * 0.5 + creak(n * c) * 1.4 + Math.sin(TAU * 46 * t) * e * 0.12;
    });
  }
  function thud(heavy) {   // the bay home in the wall or back in line (heavy), or the hatch dropping onto its stops
    const lo = biq('lp', heavy ? 140 : 260, 0.8), knock = biq('bp', heavy ? 320 : 700, 3);
    return make(heavy ? 0.9 : 0.5, (t) => { const n = nz(), e = Math.exp(-t / (heavy ? 0.07 : 0.035));
      return lo(n * e) * 6 + knock(n * e) * 1.5 + Math.sin(TAU * (heavy ? 52 : 95) * t) * Math.exp(-t / 0.12) * (heavy ? 0.7 : 0.4); });
  }
  function slide() {   // the ladder's stiles running up their guides: steel on steel, then a clack
    const bp = biq('bp', 1800, 2), ring = biq('bp', 2600, 20), clack = biq('bp', 900, 3), D = 0.75;
    return make(D, (t) => { const n = nz(), run = t < 0.6 ? Math.sin(Math.PI * t / 0.6) : 0, stop = t > 0.6 ? Math.exp(-(t - 0.6) / 0.01) : 0;
      return bp(n * run) * 0.6 + ring(n * (run * 0.3 + stop * 6)) + clack(n * stop); });
  }
  function rung() {   // a hand or a boot on a steel rung: a dull knock with the tube ringing a little
    const lo = biq('lp', 300, 0.8), parts = [[620, 0.5, 0.05], [1480, 0.3, 0.035], [2310, 0.18, 0.025], [3720, 0.08, 0.015]].map(([f, a, d]) => [f * rnd(0.94, 1.06), a, d]);
    return make(0.35, (t) => { let v = lo(nz()) * Math.exp(-t / 0.012) * 2.5; for (const [f, a, d] of parts) v += Math.sin(TAU * f * t) * a * Math.exp(-t / d); return v; });
  }
  function lever() {   // a ratchet clacking over, then the bolt somewhere above letting go
    const tick = biq('bp', 3000, 4), lo = biq('lp', 150, 0.8);
    return make(0.6, (t) => { const n = nz(); let e = 0; for (const k of [0, 0.06, 0.12, 0.18]) if (t >= k) e += Math.exp(-(t - k) / 0.003);
      return tick(n * e) * 0.8 + lo(n * (t > 0.25 ? Math.exp(-(t - 0.25) / 0.06) : 0)) * 5; });
  }
  function dial() {   // a combination dial spun round: fine clicks, slowing, then the bolts drawing back
    const tick = biq('bp', 3400, 5), body = biq('bp', 600, 3), lo = biq('lp', 180, 0.8);
    const clicks = []; for (let t = 0.02, g = 0.025; t < 0.9; t += g, g *= 1.06) clicks.push(t);
    return make(1.2, (t) => { const n = nz(); let e = 0; for (const k of clicks) if (t >= k) e += Math.exp(-(t - k) / 0.002);
      const b = t > 0.98 ? Math.exp(-(t - 0.98) / 0.05) : 0; return tick(n * e) * 0.6 + body(n * e) * 0.3 + lo(n * b) * 4 + body(n * b) * 1.2; });
  }
  function creak() {   // a heavy steel door on dry hinges
    const groan = biq('bp', 380, 10), lo = biq('lp', 200, 0.8), D = 1.3;
    return make(D, (t) => { const n = nz(), e = Math.min(1, t / 0.1, (D - t) / 0.3), f = 0.5 + 0.5 * Math.sin(TAU * 23 * t + 3 * Math.sin(TAU * 1.3 * t));
      return groan(n * e * f) * 1.2 + lo(n * e) * 0.6; });
  }
  function clang() {   // the safe's door shut: steel ringing over a thump
    const lo = biq('lp', 180, 0.8), r1 = biq('bp', 420, 14), r2 = biq('bp', 770, 16);
    return make(1.4, (t) => { const n = nz(), e = Math.exp(-t / 0.04); return lo(n * e) * 5 + (r1(n) * 0.8 + r2(n) * 0.5) * Math.exp(-t / 0.4) * 0.5 + r1(n * e) * 1.5; });
  }
  function chain() {   // the lamp's pull chain: a rattle and a click
    const bp = biq('bp', 4200, 2), cl = biq('bp', 2000, 4);
    return make(0.25, (t) => { const n = nz(); return bp(n * Math.exp(-t / 0.05) * (0.5 + 0.5 * Math.sin(TAU * 60 * t))) * 0.5 + cl(n * (t > 0.12 ? Math.exp(-(t - 0.12) / 0.004) : 0)) * 1.5; });
  }
  // The fire, 6 s looped: a soft roar under it, crackles in little clusters, now and then a pop or a hiss.
  function crackle() {
    const roar = biq('lp', 220, 0.7), crack = biq('bp', 2600, 1.5), pop = biq('bp', 700, 2), hiss = biq('hp', 4000, 0.7), D = 6;
    const ev = []; for (let t = 0; t < D - 0.1; t += rnd(0.03, 0.35)) ev.push([t, Math.random() < 0.12 ? 1 : 0, rnd(0.3, 1)]);
    let j = 0, e = 0, ep = 0;
    return make(D, (t) => {
      while (j < ev.length && ev[j][0] <= t) { if (ev[j][1]) ep += ev[j][2]; else e += ev[j][2]; j++; }
      e *= 0.9965; ep *= 0.9985;
      const n = nz(), sw = 0.75 + 0.25 * Math.sin(TAU * t / D) * Math.sin(TAU * 3 * t / D + 1);
      return roar(n) * 1.6 * sw + crack(n * e) * 1.1 + pop(n * ep) * 1.8 + hiss(n) * 0.02 * sw;
    }, 0.8);
  }
  function whoosh(out) {   // a fire catching (rising), or put out (a hiss dying away)
    const lp = biq('lp', out ? 3000 : 500, 0.7), D = out ? 1.1 : 0.9;
    return make(D, (t) => { const n = nz(), u = t / D; return lp(n) * (out ? Math.exp(-u * 4) : Math.sin(Math.PI * Math.min(1, u * 1.4)) * (0.3 + u)); });
  }
  // The duct (world/secret-duct.js): a hand or a knee on sheet metal (a dull thud, the panel ringing), the metal ticking
  // as it cools, a panel oil-canning under your weight (a low boom), the grille knocked out and clattering on concrete.
  function thumpM(knee) {
    const lo = biq('lp', knee ? 140 : 220, 0.8), parts = [[knee ? 92 : 128, 0.6, 0.09], [237, 0.35, 0.06], [415, 0.22, 0.04], [690, 0.12, 0.025]].map(([f, a, d]) => [f * rnd(0.9, 1.1), a, d]);
    return make(0.45, (t) => { let v = lo(nz()) * Math.exp(-t / 0.014) * 3; for (const [f, a, d] of parts) v += Math.sin(TAU * f * t) * a * Math.exp(-t / d); return v; });
  }
  function tickM() {
    const bp = biq('bp', rnd(2500, 4200), 6);
    return make(0.15, (t) => bp(nz() * Math.exp(-t / 0.002)) * 2 + Math.sin(TAU * rnd(900, 1400) * t) * Math.exp(-t / 0.02) * 0.3);
  }
  function boomM() {
    const lo = biq('lp', 120, 0.8), f = rnd(55, 75);
    return make(1.6, (t) => lo(nz()) * Math.exp(-t / 0.03) * 3 + Math.sin(TAU * f * t + 2 * Math.sin(TAU * 3 * t)) * Math.exp(-t / 0.45) + Math.sin(TAU * f * 2.7 * t) * Math.exp(-t / 0.2) * 0.3);
  }
  function clatter() {   // off its clips, a bounce or two and a rattle settling
    const hits = [[0, 1], [0.32, 0.7], [0.5, 0.45], [0.62, 0.3], [0.7, 0.2], [0.76, 0.15], [0.8, 0.1]], rings = [[520, 0.12], [930, 0.08], [1460, 0.05], [2210, 0.03]];
    const lo = biq('lp', 300, 0.8);
    return make(1.6, (t) => {
      let v = 0;
      for (const [h, a] of hits) if (t >= h) { const u = t - h; v += a * (lo(nz()) * Math.exp(-u / 0.01) * 2); for (const [f, d] of rings) v += a * Math.sin(TAU * f * u * (1 + h * 0.07)) * Math.exp(-u / d) * 0.5; }
      return v;
    });
  }
  // Loops, 4 s: your breath (in and out, through the mouth), the fans' hum far off down the duct, a draught at an open end,
  // and voices somewhere (a murmur of syllables, low-passed through the metal).
  function breathL() {
    const bp = biq('bp', 900, 0.8), hp = biq('hp', 2400, 0.7), D = 4;
    return make(D, (t) => { const u = (t % 2) / 2, e = u < 0.4 ? Math.sin(Math.PI * u / 0.4) ** 2 : Math.sin(Math.PI * (u - 0.4) / 0.6) ** 2 * 0.7, n = nz(); return bp(n) * e * 1.2 + hp(n) * e * 0.15; });
  }
  function humL() {
    const lo = biq('lp', 300, 0.7), D = 4;
    return make(D, (t) => Math.sin(TAU * 50 * t) * 0.5 + Math.sin(TAU * 100 * t) * 0.3 + Math.sin(TAU * 150 * t) * 0.12 + lo(nz()) * 0.8 * (0.85 + 0.15 * Math.sin(TAU * t / D)));
  }
  function draughtL() {
    const bp = biq('bp', 600, 0.5), hp = biq('hp', 3000, 0.6), D = 4;
    return make(D, (t) => { const sw = 0.6 + 0.4 * Math.sin(TAU * t / D) * Math.sin(TAU * 2 * t / D + 1); return (bp(nz()) + hp(nz()) * 0.2) * sw; });
  }
  function voicesL() {
    const D = 8, SR = A.ctx.sampleRate, n = D * SR, b = A.ctx.createBuffer(1, n, SR), d = b.getChannelData(0);
    for (const [f0, gain] of [[125, 1], [205, 0.8]]) {
      const f1 = biq('bp', 600, 2), f2 = biq('bp', 1300, 2.5);
      let next = rnd(0, 0.5), on = 0, syl = 0, f = f0, ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        if (t >= next) { on = Math.random() < 0.82 ? 1 : 0; syl = rnd(0.12, 0.26); next = t + syl + (Math.random() < 0.15 ? rnd(0.4, 1.2) : 0.02); f = f0 * rnd(0.85, 1.2); }
        const u = (t - (next - syl - 0.02)) / syl, e = on && u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
        ph += TAU * f / SR; const saw = (ph / TAU) % 1 * 2 - 1;
        d[i] += (f1(saw) + f2(saw) * 0.6) * e * gain * Math.min(1, t / 0.3, (D - t) / 0.3);
      }
    }
    const lp = biq('lp', 700, 0.7); let m = 0;
    for (let i = 0; i < n; i++) { d[i] = lp(d[i]); m = Math.max(m, Math.abs(d[i])); }
    for (let i = 0; i < n; i++) d[i] *= 0.8 / m;
    return b;
  }
  // A record: four bars of slow jazz (an electric piano's chords, a walking bass, brushes) under vinyl crackle, 12 s,
  // looped. Whole bars, so it loops without a seam.
  function music() {
    const SR = A.ctx.sampleRate, bpm = 80, beat = 60 / bpm, D = 16 * beat, n = Math.ceil(D * SR), b = A.ctx.createBuffer(1, n, SR), d = b.getChannelData(0);
    const hz = (m) => 440 * 2 ** ((m - 69) / 12);
    const chords = [[50, 53, 57, 60, 64], [43, 53, 57, 59, 64], [48, 52, 55, 59, 62], [45, 52, 55, 58, 61]];   // Dm9 G13 Cmaj9 A7(b9)
    const bass = [38, 41, 45, 48, 43, 47, 50, 49, 36, 40, 43, 45, 45, 44, 43, 37];
    const brush = biq('bp', 5200, 0.7), hiss = biq('hp', 3000, 0.7), pop = biq('bp', 1800, 1);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, bt = t / beat, bar = Math.floor(bt / 4) % 4, ib = bt % 1;
      let v = 0;
      // The piano: each chord struck on beat one and the "and" of two, fading.
      for (const on of [0, 1.5]) {
        const u = (bt % 4) - on;
        if (u < 0 || u > 2.6) continue;
        const e = Math.exp(-u * beat / 1.1) * Math.min(1, u * beat / 0.004);
        for (const note of chords[bar]) { const f = hz(note + 12), w = TAU * f * t; v += e * 0.09 * (Math.sin(w) + 0.25 * Math.sin(2 * w) * Math.exp(-u * 2)); }
      }
      // The bass: a note a beat, plucked.
      { const f = hz(bass[Math.floor(bt) % 16]), e = Math.exp(-ib * beat / 0.45) * Math.min(1, ib * beat / 0.01), w = TAU * f * t; v += e * 0.32 * (Math.sin(w) + 0.3 * Math.sin(2 * w)); }
      // Brushes on two and four, a swish on every off-beat.
      const sw = Math.floor(bt) % 2 === 1 ? Math.exp(-ib * beat / 0.12) : 0, off = ib > 0.62 ? Math.exp(-(ib - 0.62) * beat / 0.05) * 0.4 : 0;
      v += brush(nz() * (sw + off)) * 0.25;
      d[i] = v; m = Math.max(m, Math.abs(v));
    }
    // Dulled, as through a little speaker; then the crackle on top.
    const lp = biq('lp', 3200, 0.7);
    for (let i = 0; i < n; i++) {
      const crack = Math.random() < 9 / SR ? rnd(0.3, 1) : 0;
      d[i] = lp(d[i] / m) * 0.7 + hiss(nz()) * 0.015 + pop(crack * nz()) * 0.6;
    }
    let mm = 0; for (let i = 0; i < n; i++) mm = Math.max(mm, Math.abs(d[i]));
    for (let i = 0; i < n; i++) d[i] *= 0.85 / mm;
    return b;
  }
  function build() {
    const n = (k, f) => Array.from({ length: k }, f);
    return { clunk: clunk(), rumble: rumble(), thud: thud(true), hatch: thud(false), slide: slide(), rung: n(5, rung), lever: lever(), dial: dial(),
      creak: creak(), clang: clang(), chain: chain(), ignite: whoosh(false), douse: whoosh(true),
      hand: n(4, () => thumpM(false)), knee: n(4, () => thumpM(true)), tick: n(4, tickM), boom: n(3, boomM), clatter: clatter() };
  }

  // ----- playback -----
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) { A = a; B = null; record = null; fire = null; loops = {}; out = A.ctx.createGain(); out.connect(A.master); }
    if (!B) B = build();
    return true;
  }
  function panner(x, y, z, ref = 1.5, roll = 1.2) {
    const p = A.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 10000;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; p.connect(out);
    return p;
  }
  function shot(buf, x, y, z, gain, rate = 1) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g).connect(panner(x, y, z));
    src.onended = () => src.disconnect();
    src.start();
  }
  const one = (k, gain, rate) => (p) => { if (ready()) shot([B[k]].flat().length > 1 ? pick(B[k]) : B[k], p.x, p.y, p.z, gain, rate ?? rnd(0.95, 1.05)); };
  return {
    clunk: one('clunk', 0.5), rumble: one('rumble', 0.7), thud: one('thud', 0.6), hatch: one('hatch', 0.35), slide: one('slide', 0.25),
    rung: one('rung', 0.22), lever: one('lever', 0.4), dial: one('dial', 0.35), creak: one('creak', 0.3), clang: one('clang', 0.4), chain: one('chain', 0.3),
    ignite: one('ignite', 0.35), douse: one('douse', 0.3), clatter: one('clatter', 0.5),
    // The duct: one-shots all round you (x, y, z null) or at p; its loops at the levels given (0 stops them).
    duct(kind, gain = 1, p = null) {
      if (!ready()) return;
      const src = A.ctx.createBufferSource(), g = A.ctx.createGain(), b = B[kind];
      src.buffer = Array.isArray(b) ? pick(b) : b; src.playbackRate.value = rnd(0.94, 1.06); g.gain.value = gain;
      src.connect(g).connect(p ? panner(p.x, p.y, p.z, 1.2, 1.2) : out); src.onended = () => src.disconnect(); src.start();
    },
    ductLoops(lv) {
      if (!lv) { for (const k of Object.keys(loops)) { loops[k].g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2); loops[k].src.stop(A.ctx.currentTime + 1); delete loops[k]; } return; }
      if (!ready()) return;
      for (const [k, v] of Object.entries(lv)) {
        if (!loops[k]) {
          if (!(v > 0.002)) continue;
          const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
          src.buffer = B['L' + k] ||= { breath: breathL, hum: humL, draught: draughtL, voices: voicesL }[k](); src.loop = true; g.gain.value = 0;
          src.connect(g).connect(out); src.start(0, Math.random() * src.buffer.duration); loops[k] = { src, g, v: -1 };
        }
        if (Math.abs(loops[k].v - v) > 0.005) { loops[k].v = v; loops[k].g.gain.setTargetAtTime(v, A.ctx.currentTime, 0.25); }
      }
    },
    // The fire's crackle at p, at a level 0 to 1 (0: stopped). Called each frame the den's shown; cheap when unchanged.
    fire(level, p) {
      if (!(level > 0.01)) { if (fire) { const f = fire; fire = null; f.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.15); f.src.stop(A.ctx.currentTime + 0.8); } return; }
      if (!ready()) return;
      if (!fire) {
        const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
        src.buffer = B.fire ||= crackle(); src.loop = true; g.gain.value = 0;
        src.connect(g).connect(panner(p.x, p.y, p.z, 1.5, 1.3));
        src.start(0, Math.random() * src.buffer.duration); fire = { src, g, level: -1 };
      }
      if (Math.abs(fire.level - level) > 0.02) { fire.level = level; fire.g.gain.setTargetAtTime(0.4 * level, A.ctx.currentTime, 0.3); }
    },
    // The record: on (fading in from the turntable at p) or off (the needle lifted).
    record(on, p) {
      if (!ready()) return;
      if (on && !record) {
        const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
        src.buffer = B.music ||= music(); src.loop = true; g.gain.value = 0;
        src.connect(g).connect(panner(p.x, p.y, p.z, 1.2, 1.0));
        g.gain.setTargetAtTime(0.32, A.ctx.currentTime, 0.4);
        src.start(); record = { src, g };
      } else if (!on && record) {
        const r = record; record = null;
        r.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.08); r.src.stop(A.ctx.currentTime + 0.4);
      }
    },
  };
}
