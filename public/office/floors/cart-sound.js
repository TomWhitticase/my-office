// The grey meadow's sounds (floors/cart.js). Wind through bare branches, gusting, a thin whistle in the twigs; crows,
// near and far, and their wings going up; the cart's wooden wheels creaking while it rolls; the girl humming a thin old
// tune, now and then; the face breathing, slow, heard close to, a long sigh sometimes, and its murmurs, low and sad and
// never quite words (and louder, a line when you click it); the music box in the shed, playing the same tune, slowing
// as it runs down, and once in a while, when nobody's wound it, a few notes of it from the shed far off. Your steps:
// grit on the path, a swish in the grass, boards in the shed. All synthesised here, a buffer at a time (one a frame, so
// nothing hitches), through the office's own audio (sounds.js `audio`), so its volume and M apply.

const TAU = Math.PI * 2;
// The tune (the girl hums it; the box plays it): a slow waltz in A minor. [midi, beats]; 0: a rest.
export const TUNE = [[69, 2], [72, 1], [76, 2], [74, 1], [72, 2], [71, 1], [69, 3], [71, 2], [72, 1], [74, 2], [72, 1], [71, 2], [68, 1], [69, 3],
  [76, 2], [77, 1], [76, 2], [74, 1], [72, 2], [74, 1], [76, 3], [72, 2], [71, 1], [69, 2], [68, 1], [69, 3], [0, 3]];
const nf = (m) => 440 * 2 ** ((m - 69) / 12);

export function makeSound(ctx) {
  const { camera } = ctx;
  let A = null, B = null, out = null, verb = null, loops = null, bleedL = null, queue = null, stepAcc = 0, lastP = null;
  const due = { crow: 0, faint: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a), nz = () => Math.random() * 2 - 1, pick = (a) => a[Math.floor(Math.random() * a.length)];

  function biq(type, f, q) {
    const SR = A.ctx.sampleRate;
    let k0, k1, k2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const set = (f2) => {
      const w = TAU * f2 / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
      const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [a, 0, -a];
      k0 = b0 / a0; k1 = b1 / a0; k2 = b2 / a0; a1 = -2 * c / a0; a2 = (1 - a) / a0;
    };
    set(f);
    const fn = (x) => { const y = k0 * x + k1 * x1 + k2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
    fn.set = set;
    return fn;
  }
  // (a generator, yielding every 8k samples: ready() makes a little of one each frame, so nothing hitches)
  function* make(sec, fn, peak = 0.9, ch = 1, loopSmooth = false) {
    const SR = A.ctx.sampleRate, n = Math.ceil(sec * SR), b = A.ctx.createBuffer(ch, n, SR);
    for (let c = 0; c < ch; c++) {
      const d = b.getChannelData(c);
      let m = 0;
      for (let k = 0; k < n; k++) { d[k] = fn(k / SR, c); m = Math.max(m, Math.abs(d[k])); if ((k & 8191) === 8191) yield; }
      for (let k = 0; k < n; k++) d[k] *= (m ? peak / m : 0) * (loopSmooth ? 1 : Math.min(1, (n - k) / (SR * 0.01), k / (SR * 0.003)));
      if (loopSmooth) { const X = Math.floor(SR * 0.4); for (let k = 0; k < X; k++) { const u = k / X; d[k] = d[k] * u + d[n - X + k] * (1 - u); } }
    }
    return b;
  }
  const env = (a, h, r) => (t) => (t < a ? t / a : t < a + h ? 1 : Math.max(0, 1 - (t - a - h) / r));

  // A voice, never quite words: a pulse train through two formants that move syllable to syllable, consonants of noise
  // between, all of it muffled. f0: its pitch; lp: how muffled; breathy: noise instead of voice (a whisper).
  function* voice(sec, { f0 = 92, lp = 1100, breathy = 0, fall = 0.18, seed = 1 } = {}) {
    const SR = A.ctx.sampleRate, VOW = [[700, 1150], [460, 820], [330, 760], [520, 1650], [320, 2100], [600, 950], [420, 1300]];
    const sylls = []; let s = 0.05;
    let r = seed * 9301 + 49297; const rr = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    while (s < sec - 0.3) { const d = 0.13 + rr() * 0.16; sylls.push({ s, d, v: VOW[Math.floor(rr() * VOW.length)], c: rr() < 0.55 ? 2200 + rr() * 2200 : 0, a: 0.55 + rr() * 0.45 }); s += d + (rr() < 0.2 ? 0.18 + rr() * 0.2 : 0.02); }
    const f1 = biq('bp', 600, 5), f2 = biq('bp', 1200, 7), cons = biq('bp', 3000, 2), lo = biq('lp', lp, 0.7);
    let ph = 0, si = 0, last = -1;
    return yield* make(sec, (t) => {
      while (si< sylls.length - 1 && t > sylls[si].s + sylls[si].d) si++;
      const y = sylls[si], u = (t - y.s) / y.d, inS = u >= 0 && u <= 1;
      const blk = Math.floor(t * SR / 64);
      if (blk !== last) { last = blk; const nx = sylls[Math.min(sylls.length - 1, si + 1)].v, k = inS ? Math.max(0, u - 0.6) / 0.4 : 0; f1.set(y.v[0] + (nx[0] - y.v[0]) * k); f2.set(y.v[1] + (nx[1] - y.v[1]) * k); }
      const f = f0 * (1 - fall * t / sec) * (1 + 0.012 * Math.sin(t * 31) + 0.008 * nz());
      ph += f / SR; let src = 0;
      if (ph >= 1) { ph -= 1; src = 1; }
      src = (src * 2 - 0.02) * (1 - breathy) + nz() * breathy * 0.35;
      const e = inS ? Math.sin(Math.PI * Math.min(1, u * 1.4)) ** 0.8 * y.a : 0;
      let v = (f1(src) * 1.3 + f2(src) * 0.6) * e;
      if (y.c && u > -0.12 && u < 0.05) v += cons(nz()) * 0.25 * (1 - Math.abs(u + 0.035) / 0.085);
      return lo(v) * (0.85 + 0.15 * Math.sin(t * 2.3));
    }, 0.8);
  }
  // A thin hum of the tune: one voice, a little unsteady, nasal; `beat` seconds a beat.
  function* hum(beat = 0.62) {
    const SR = A.ctx.sampleRate, notes = []; let at = 0.25;
    for (const [m, b] of TUNE) { notes.push([m, at, b * beat]); at += b * beat; }
    const sec = at + 0.6, n1 = biq('bp', 280, 2), n2 = biq('bp', 2600, 4), lo = biq('lp', 1800, 0.7);
    let ph = 0, f = nf(69), ni = 0;
    return yield* make(sec, (t) => {
      while (ni< notes.length - 1 && t > notes[ni][1] + notes[ni][2]) ni++;
      const [m, s, d] = notes[ni], u = (t - s) / d, on = m && u >= 0 && u <= 1;
      const want = m ? nf(m) : f;
      f += (want - f) * Math.min(1, 40 / SR * 60);
      const drift = 1 + 0.006 * Math.sin(t * 0.7) + 0.004 * Math.sin(t * 5.6) * Math.min(1, Math.max(0, u - 0.3) * 3);
      ph += f * drift / SR; ph -= Math.floor(ph);
      const src = Math.sin(TAU * ph) + 0.18 * Math.sin(TAU * ph * 2) + 0.06 * Math.sin(TAU * ph * 3) + nz() * 0.03;
      const e = on ? Math.min(1, u * d / 0.08) * (1 - 0.35 * u) * (u > 0.88 ? (1 - u) / 0.12 : 1) : 0;
      return lo(src * 0.8 + n1(src) * 0.6 + n2(src) * 0.08) * e;
    }, 0.6);
  }
  const RECIPES = {
    // wind: a low roar in gusts; three thin whistles in the twigs, each rising and falling on its own
    wind: () => { const l = [biq('lp', 380, 0.6), biq('lp', 380, 0.6)], w = [[biq('bp', 980, 14), 0.13, 0], [biq('bp', 1340, 16), 0.09, 2], [biq('bp', 720, 12), 0.07, 4]], h = biq('hp', 2500, 0.6);
      return make(16, (t, c) => { const g = 0.45 + 0.35 * Math.sin(TAU * t / 16 + c) + 0.2 * Math.sin(TAU * t / 4 + c * 2);
        let v = l[c](nz()) * 2.4 * g;
        for (const [f, s, p] of w) v += f(nz()) * 2.6 * Math.max(0, Math.sin(TAU * t * s + p + c)) ** 2 * g;
        return v + h(nz()) * 0.05 * g; }, 0.7, 2, true); },
    hall: () => { const f = [biq('lp', 2600, 0.5), biq('lp', 2600, 0.5)]; return make(1.6, (t, c) => f[c](nz()) * Math.exp(-t / 0.4), 0.5, 2); },
    // the cart's wheels: wood on wood, a stick-slip squeal and the knock of the spokes; looped, pitched by its speed
    creak: () => { const s = biq('bp', 950, 9), s2 = biq('bp', 1500, 12), k = biq('lp', 300, 1.5); let ph = 0;
      return make(2.4, (t) => { const r = 40 + 30 * Math.sin(TAU * t / 2.4) + 20 * Math.sin(TAU * t * 1.25 / 2.4);
        ph += r / A.ctx.sampleRate; const pulse = (ph % 1) < 0.08 ? nz() : 0;
        const sq = (s(pulse) * 1.6 + s2(pulse) * 0.6) * Math.max(0, Math.sin(TAU * t / 1.2)) ** 3;
        const knock = (t * 5) % 1 < 0.03 ? nz() : 0;
        return sq + k(knock) * 1.5; }, 0.7, 1, true); },
    // the face breathing: in through the nose, out, slow (5.2 s, as its body swells)
    breath: () => { const i = biq('bp', 1100, 1.2), o = biq('lp', 650, 0.7); return make(5.2, (t) => {
      const inn = t < 2.0 ? Math.sin(Math.PI * t / 2.0) ** 1.5 : 0, ex = t > 2.4 && t < 5.0 ? Math.sin(Math.PI * (t - 2.4) / 2.6) ** 1.2 : 0;
      return i(nz()) * inn * 0.6 + o(nz()) * ex * 1.4; }, 0.6, 1, true); },
    // a sigh: a deep breath in, a long breath out with a low hum in it at the end
    sigh: () => { const i = biq('bp', 1000, 1.1), o = biq('lp', 700, 0.7), v = biq('lp', 300, 0.7); let ph = 0; return make(4.4, (t) => {
      ph += 84 * (1 - t * 0.04) / A.ctx.sampleRate; const voiced = (ph % 1 < 0.5 ? 1 : -1) * (t > 2.2 ? Math.min(1, (t - 2.2) * 2) * Math.max(0, 1 - (t - 2.2) / 2.2) : 0);
      return i(nz()) * (t < 1.4 ? Math.sin(Math.PI * t / 1.4) : 0) * 0.8 + o(nz()) * (t > 1.6 ? Math.sin(Math.PI * Math.min(1, (t - 1.6) / 2.8)) : 0) * 1.5 + v(voiced) * 0.6; }, 0.8); },
    murmur: () => [1.4, 2.2, 3.1].map((s, i) => voice(s, { f0: 88 + i * 4, lp: 700, seed: i + 3 })),
    line: () => [2.4, 3.4, 4.6].map((s, i) => voice(s, { f0: 94 - i * 3, lp: 1500, seed: i + 11, fall: 0.22 })),
    whisper: () => [voice(1.3, { f0: 200, lp: 2400, breathy: 1, seed: 21 }), voice(1.9, { f0: 200, lp: 2400, breathy: 1, seed: 22 })],
    hum: () => hum(0.62),
    // a music box's tine: a bright fundamental, its inharmonic partials gone quickly, a little click
    tine: () => { const f0 = 880; return make(2.6, (t) => Math.sin(TAU * f0 * t) * Math.exp(-t * 1.7) + 0.35 * Math.sin(TAU * f0 * 2.76 * t) * Math.exp(-t * 7) + 0.18 * Math.sin(TAU * f0 * 5.4 * t) * Math.exp(-t * 16) + (t < 0.004 ? nz() * 0.3 : 0), 0.7); },
    wind_up: () => { const b = biq('bp', 2800, 3); return make(0.7, (t) => { let v = 0; for (let k = 0; k < 6; k++) { const u = t - k * 0.11; if (u >= 0 && u < 0.02) v += nz() * Math.exp(-u / 0.004); } return b(v); }, 0.6); },
    // crows: a harsh kraa, falling; their wings going up
    caw: () => [0, 1, 2].map((i) => { const f1 = biq('bp', 1150 + i * 120, 4), f2 = biq('bp', 1900 + i * 150, 5); let ph = 0; const d = 0.3 + i * 0.06;
      return make(d, (t) => { ph += (520 + i * 40) * (1 - 0.18 * t / d) / A.ctx.sampleRate; const s = ((ph % 1) < 0.35 ? 1 : -0.5) + nz() * 0.5; return (f1(s) + f2(s) * 0.7) * env(0.025, d * 0.55, d * 0.4)(t); }, 0.7); }),
    flap: () => { const l = biq('lp', 700, 0.8); return make(1.5, (t) => { const r = 8 - t * 2, u = (t * r) % 1; return l(nz()) * (u < 0.35 ? Math.sin(Math.PI * u / 0.35) : 0) * Math.max(0, 1 - t / 1.5); }, 0.6); },
    rope: () => { const b = biq('bp', 340, 9), b2 = biq('bp', 520, 11); let ph = 0; return make(0.7, (t) => { ph += (28 + 50 * t) / A.ctx.sampleRate; const p = (ph % 1) < 0.1 ? nz() : 0; return (b(p) + b2(p) * 0.5) * Math.sin(Math.PI * t / 0.7); }, 0.6); },
    hatTip: () => { const b = biq('bp', 1800, 2); return make(0.25, (t) => b(nz()) * Math.exp(-t / 0.05), 0.4); },
    // your steps: grit on the path, a swish in the grass, a hollow board
    stepDirt: () => Array.from({ length: 5 }, () => { const l = biq('lp', 1300, 0.7), b = biq('bp', 3200, 1.2); return make(0.2, (t) => (l(nz()) * 1.2 + b(nz() * (Math.random() < 0.35 ? 1 : 0.15))) * Math.exp(-t / 0.05)); }),
    stepGrass: () => Array.from({ length: 4 }, () => { const h = biq('hp', 1800, 0.7), l = biq('lp', 600, 0.7); return make(0.32, (t) => (h(nz()) * 0.7 + l(nz()) * 0.6) * env(0.04, 0.06, 0.2)(t)); }),
    stepBoard: () => Array.from({ length: 3 }, () => { const l = biq('lp', 420, 1.6); return make(0.24, (t) => (l(nz()) * 2 + Math.sin(TAU * 120 * t) * 0.4) * Math.exp(-t / 0.04)); }),
  };
  function* drive(x) { if (!Array.isArray(x)) return yield* x; const o = []; for (const g of x) o.push(yield* g); return o; }
  let making = null;
  const ORDER = ['wind', 'hall', 'stepDirt', 'stepGrass', 'creak', 'breath', 'caw', 'flap', 'tine', 'hum', 'murmur', 'sigh', 'line', 'whisper', 'rope', 'wind_up', 'hatTip', 'stepBoard'];
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) { A = a; B = {}; queue = ORDER.slice(); loops = null; out = verb = bleedL = making = null; }
    // (a recipe gives a buffer's generator, or a list of them: a few ms of one made a frame)
    if (!making && queue.length) { const k = queue.shift(); making = { k, it: drive(RECIPES[k]()) }; }
    if (making) { const t0 = performance.now(); let r; do r = making.it.next(); while (!r.done && performance.now() - t0 < 3); if (r.done) { B[making.k] = r.value; making = null; } }
    if (!out && B.hall) {
      out = A.ctx.createGain(); out.connect(A.master);
      verb = A.ctx.createConvolver(); verb.buffer = B.hall;
      const wet = A.ctx.createGain(); wet.gain.value = 0.45; verb.connect(wet).connect(out);
    }
    return !!out;
  }
  function panner(p, ref = 3) {
    const pan = A.ctx.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = 1;
    pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
    return pan;
  }
  const place = (pan, p) => { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; };
  // a one-shot: at p (or in your head), returns its panner so a moving source can be followed
  function shot(buf, p, gain, { rate = 1, send = 0.3, ref = 3, when = 0 } = {}) {
    if (!buf) return null;
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g);
    let pan = null;
    if (p) { pan = panner(p, ref); g.connect(pan).connect(out); } else g.connect(out);
    if (send) { const s = A.ctx.createGain(); s.gain.value = send; g.connect(s).connect(verb); }
    src.onended = () => src.disconnect();
    src.start(A.ctx.currentTime + when);
    return { src, pan, g };
  }
  function loop(buf, gain, to, p = null, ref = 4, offset = 0) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g);
    let pan = null;
    if (p) { pan = panner(p, ref); g.connect(pan).connect(to); } else g.connect(to);
    g.gain.setTargetAtTime(gain, A.ctx.currentTime, 1.5);
    src.start(0, offset % buf.duration); return { src, g, pan };
  }
  // ----- the music box: the tune a tine at a time, scheduled a little ahead, slowing as the spring runs down -----
  const MB = { on: false, i: 0, next: 0, left: 0, at: null, faint: false };
  function boxTick(box) {
    if (!MB.on || !B.tine) return;
    const now = A.ctx.currentTime;
    while (MB.next < now + 0.25 && MB.on) {
      const [m, b] = TUNE[MB.i % TUNE.length], slow = 1 + 2.2 * Math.max(0, 1 - MB.left / 6) ** 2;
      const beat = 0.4 * slow;
      if (m) {
        const g = MB.faint ? 0.5 : 0.55;
        const s = shot(B.tine, MB.at, g, { rate: nf(m + 12) / 880 * (1 - 0.02 * Math.max(0, 1 - MB.left / 3)), send: MB.faint ? 0.9 : 0.35, ref: MB.faint ? 14 : 1.2, when: Math.max(0, MB.next - now) });
        void s;
        if (MB.i % 3 === 0 && !MB.faint) shot(B.tine, MB.at, 0.3, { rate: nf(m - 12) / 880, send: 0.35, ref: 1.2, when: Math.max(0, MB.next - now) });
      }
      MB.next += b * beat; MB.left -= b * beat; MB.i++;
      if (MB.left <= 0 || (MB.faint && MB.i >= 7)) { MB.on = false; if (box) box.playing = false; }
    }
  }

  const P3 = { x: 0, y: 0, z: 0 };
  return {
    fx(dt, t, W) {
      if (!ready()) return;
      const p = camera.position;
      // the loops: the wind everywhere; at the cart, its breathing and its wheels
      if (!loops && B.wind && B.creak && B.breath) {
        loops = { wind: loop(B.wind, 0.38, out), creak: loop(B.creak, 0, out, W.cart, 3), breath: loop(B.breath, 0.22, out, W.face, 1.2, t % 5.2) };
        due.crow = t + rnd(4, 9); due.faint = t + rnd(40, 80);
      }
      if (loops) {
        place(loops.creak.pan, W.cart); place(loops.breath.pan, W.face);
        loops.creak.g.gain.setTargetAtTime(Math.min(1, W.speed / 0.7) * 0.32, A.ctx.currentTime, 0.15);
        loops.creak.src.playbackRate.setTargetAtTime(0.75 + Math.min(0.6, W.speed * 0.4), A.ctx.currentTime, 0.2);
      }
      for (const v of [MB.hum, MB.voice, MB.whisper]) if (v?.pan && v.follow) place(v.pan, v.follow());
      // your steps
      const moved = lastP ? Math.hypot(p.x - lastP.x, p.z - lastP.z) / Math.max(dt, 1e-3) : 0;
      lastP = lastP || { x: 0, z: 0 }; lastP.x = p.x; lastP.z = p.z;
      const walking = moved > 1 && moved < 12;
      stepAcc = walking ? stepAcc + dt : 0.3;
      if (walking && stepAcc > (moved > 6 ? 0.3 : 0.46) && B.stepDirt) {
        stepAcc = 0;
        const s = W.surface(p.x, p.z);
        shot(pick(s === 'board' ? B.stepBoard : s === 'path' ? B.stepDirt : B.stepGrass), null, s === 'grass' ? 0.05 : 0.06, { rate: rnd(0.9, 1.1), send: s === 'board' ? 0.3 : 0.06 });
      }
      // crows far off, now and then
      if (t > due.crow && B.caw) {
        due.crow = t + rnd(7, 20);
        const a = Math.random() * TAU, d = rnd(25, 60);
        P3.x = p.x + Math.cos(a) * d; P3.y = 8; P3.z = p.z + Math.sin(a) * d;
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) shot(pick(B.caw), P3, 0.35, { rate: rnd(0.92, 1.06), send: 0.6, ref: 10, when: i * rnd(0.35, 0.6) });
      }
      // the box: as wound; or a few notes of it from the shed, far off, when nobody has
      boxTick(W.box);
      if (W.box && W.box.playing && !MB.on) { MB.on = true; MB.faint = false; MB.i = 0; MB.next = A.ctx.currentTime + 0.3; MB.left = W.box.wound; MB.at = W.boxAt; }
      if (!W.box?.playing && MB.on && !MB.faint) MB.on = false;
      if (t > due.faint && !MB.on && B.tine) { due.faint = t + rnd(70, 140); MB.on = true; MB.faint = true; MB.i = Math.floor(Math.random() * 4) * 3; MB.next = A.ctx.currentTime + 0.1; MB.left = 99; MB.at = W.boxAt; }
    },
    /** the box wound: `sec` more of playing */
    wound(box) { if (!ready()) return; shot(B.wind_up, MB.at || null, 0.4, { send: 0.2 }); if (MB.on && !MB.faint) MB.left = box.wound; },
    caws(p, n = 2) { if (!ready() || !B.caw) return; for (let i = 0; i < n; i++) shot(pick(B.caw), p, 0.6, { rate: rnd(0.9, 1.08), send: 0.4, ref: 6, when: i * rnd(0.25, 0.5) }); shot(B.flap, p, 0.4, { send: 0.2, ref: 4 }); },
    /** the girl humming the tune; follow(): where she is now */
    hum(follow) { if (!ready() || !B.hum || MB.hum?.busy) return false; const s = shot(B.hum, follow(), 0.32, { send: 0.45, ref: 3 }); if (!s) return false; s.follow = follow; s.busy = true; s.src.onended = () => { s.busy = false; s.src.disconnect(); }; MB.hum = s; return true; },
    humming: () => !!MB.hum?.busy,
    whisper(follow) { if (!ready() || !B.whisper) return; const s = shot(pick(B.whisper), follow(), 0.3, { send: 0.3, ref: 1.5 }); if (s) { s.follow = follow; MB.whisper = s; } },
    /** the face: a murmur (low, never clear) or a line (sec long, louder); follow(): where its mouth is now */
    voice(follow, sec, loud) {
      if (!ready() || !B.murmur) return;
      const set = loud ? B.line : B.murmur, buf = set.reduce((a, b) => (Math.abs(b.duration - sec) < Math.abs(a.duration - sec) ? b : a));
      const s = shot(buf, follow(), loud ? 0.9 : 0.4, { send: 0.3, ref: loud ? 2.5 : 1.5, rate: rnd(0.96, 1.03) });
      if (s) { s.follow = follow; MB.voice = s; }
      return buf.duration;
    },
    sigh(p) { if (ready()) shot(B.sigh, p, 0.5, { send: 0.3, ref: 1.6 }); },
    rope(p, g = 1) { if (ready()) shot(B.rope, p, 0.25 * g, { send: 0.3, ref: 3, rate: rnd(0.85, 1.1) }); },
    tip(p) { if (ready()) shot(B.hatTip, p, 0.25, { send: 0.2, ref: 2 }); },
    // Heard from B3 through the painting: the wind at v, and the hum faintly under it.
    bleed(v) {
      if ((!bleedL && v < 0.002) || !ready() || !B.wind || !B.hum) return;
      const now = A.ctx.currentTime;
      if (!bleedL) {
        const g = A.ctx.createGain(); g.gain.value = 0; g.connect(A.master);
        bleedL = { g, srcs: [loop(B.wind, 0.5, g), loop(B.hum, 0.12, g)] };
      }
      bleedL.g.gain.setTargetAtTime(v, now, 0.3);
      if (v < 0.002) { for (const s of bleedL.srcs) s.src.stop(now + 1.5); bleedL = null; }
    },
    stop() {
      if (A && loops) for (const l of Object.values(loops)) { l.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3); l.src.stop(A.ctx.currentTime + 1.5); }
      loops = null; lastP = null; MB.on = false;
    },
  };
}
