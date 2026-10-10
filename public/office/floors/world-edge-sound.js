// The edge of the world's sounds (floors/world-edge.js): out by the sky wall, wind and the sea, louder the nearer you are;
// the backdrop's hollow knock when the helicopter bumps it; the door's creak. Behind it (world-edge-backstage.js): the
// hum of the strip lights and the equipment, the flat's TV through its doorway (a murmur and a muffled laugh track), the
// fire door's push bar and its thud shut. All synthesised here, through the office's own audio (sounds.js `audio`), so
// its volume and M apply. Positions are in whichever space you're in.

const TAU = Math.PI * 2;

export function makeSound(ctx) {
  let A = null, B = null, out = null, loops = null, back = null;
  const rnd = (a, b) => a + Math.random() * (b - a), nz = () => Math.random() * 2 - 1;

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
  // Loops whose slow swells come round a whole number of times, so they join up.
  function build() {
    const wbp = biq('bp', 520, 0.5), wlo = biq('lp', 140, 0.7), whi = biq('bp', 2400, 1.2);
    const slp = biq('lp', 380, 0.6), shi = biq('bp', 1300, 0.7), lap = biq('bp', 900, 2.5);
    const laps = Array.from({ length: 9 }, () => [rnd(0, 18), rnd(0.15, 0.4)]);
    return {
      // wind off the sea: a broad rush that gusts, a low rumble, a faint whistle in the gusts
      wind: make(20, (t) => {
        const g = 0.55 + 0.3 * Math.sin(TAU * t / 20) + 0.15 * Math.sin(TAU * 3 * t / 20 + 1.3);
        return wbp(nz()) * g * 1.2 + wlo(nz()) * 1.5 + whi(nz()) * g * g * 0.25;
      }),
      // the sea: a slow swell breaking along the foot of the wall, and the lap of water at the platform
      sea: make(18, (t) => {
        const swell = Math.pow(0.5 + 0.5 * Math.sin(TAU * t / 6), 3);
        let l = 0;
        for (const [at, d] of laps) { const u = t - at; if (u > 0 && u < d * 3) l += Math.sin(Math.PI * u / (d * 3)) ** 2; }
        return slp(nz()) * (0.6 + 0.8 * swell) + shi(nz()) * swell * 0.5 + lap(nz()) * l * 0.9;
      }),
      // a hollow knock: a big painted panel on its frame, booming a little behind
      knock: (() => {
        const th = biq('lp', 260, 0.9);
        return make(1.6, (t) => Math.exp(-t / 0.45) * (Math.sin(TAU * 74 * t) + 0.6 * Math.sin(TAU * 117 * t + 0.4) + 0.35 * Math.sin(TAU * 183 * t + 1.1))
          + th(nz()) * Math.exp(-t / 0.02) * 3 + Math.exp(-t / 0.9) * 0.25 * Math.sin(TAU * 52 * t));
      })(),
      // behind the sky: mains hum off the strip lights, and the racks' fans
      hum: (() => {
        const f = biq('lp', 900, 0.6);
        return make(8, (t) => 0.5 * Math.sin(TAU * 100 * t) + 0.22 * Math.sin(TAU * 200 * t + 0.3) + 0.08 * Math.sin(TAU * 300 * t) + f(nz()) * 0.9, 0.6);
      })(),
      // their TV through the wall: voices (syllables of filtered noise), and every few seconds an audience laughing, muffled
      tv: (() => {
        const v1 = biq('bp', 500, 1.4), v2 = biq('bp', 1100, 2), lpf = biq('lp', 900, 0.7), lf2 = biq('lp', 700, 0.7);
        const laughs = [1.5, 6.2, 9.8, 14.1].map((at) => ({ at, d: 1.6 + Math.random() * 1.4, v: Array.from({ length: 14 }, () => [rnd(3.6, 6.2), rnd(0, 6.3), rnd(0.4, 1), rnd(-0.2, 0.3)]) }));
        return make(16, (t) => {
          let talk = 0, laugh = 0;
          const syl = Math.max(0, Math.sin(TAU * 3.7 * t + 2 * Math.sin(TAU * 0.6 * t))), gap = Math.sin(TAU * 0.23 * t) > -0.4 ? 1 : 0.15;
          talk = (v1(nz()) + 0.5 * v2(nz())) * syl * gap;
          for (const L of laughs) {
            const u = t - L.at; if (u < 0 || u > L.d) continue;
            const env = Math.sin(Math.PI * u / L.d) ** 0.7;
            for (const [rate, ph, a, off] of L.v) { const w = u - off; if (w > 0) laugh += a * Math.max(0, Math.sin(TAU * rate * w + ph)) ** 3; }
            laugh *= env;
          }
          return lpf(talk * (1 - Math.min(1, laugh * 0.2))) * 1.2 + lf2(nz() * laugh * 0.5);
        }, 0.8);
      })(),
      bar: (() => { const th = biq('bp', 1400, 3); return make(0.5, (t) => th(nz()) * Math.exp(-t / 0.012) * 2 + Math.exp(-t / 0.05) * Math.sin(TAU * 180 * t) * 0.6 + (t > 0.12 ? th(nz()) * Math.exp(-(t - 0.12) / 0.01) : 0)); })(),
      clunk: (() => { const lo = biq('lp', 220, 0.8), hi = biq('bp', 2200, 4); return make(1.2, (t) => Math.exp(-t / 0.18) * (Math.sin(TAU * 62 * t) + 0.5 * Math.sin(TAU * 97 * t)) + lo(nz()) * Math.exp(-t / 0.03) * 3 + hi(nz()) * (t > 0.05 ? Math.exp(-(t - 0.05) / 0.015) * 0.4 : 0)); })(),
      // the door: a long dry hinge, slowing as it swings
      creak: (() => {
        const bp = biq('bp', 620, 6), bp2 = biq('bp', 1250, 9); let ph = 0;
        return make(2.4, (t) => {
          ph += (22 + 70 * Math.sin(Math.PI * Math.min(1, t / 2.2))) / A.ctx.sampleRate;
          const tick = ph % 1 < 0.06 ? nz() : 0;
          return (bp(tick) + bp2(tick) * 0.5) * Math.sin(Math.PI * Math.min(1, t / 2.4)) ** 0.5;
        });
      })(),
    };
  }
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) { A = a; B = null; loops = null; out = null; }
    if (!B) B = build();
    if (!out) { out = A.ctx.createGain(); out.connect(A.master); }
    return true;
  }
  function shot(buf, p, gain, rate = 1) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g);
    if (p) {
      const pan = A.ctx.createPanner();
      pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 6; pan.rolloffFactor = 0.8;
      pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
      g.connect(pan).connect(A.bus);
    } else g.connect(out);
    src.onended = () => src.disconnect();
    src.start();
  }
  function loop(buf) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g).connect(out); src.start(A.ctx.currentTime, Math.random() * buf.duration);
    return { src, g };
  }
  const level = (v, k, tc = 0.4) => v.g.gain.setTargetAtTime(k, A.ctx.currentTime, tc);
  return {
    // Each frame while the edge is shown: `near` 0..1 (how close to the wall), `low` 0..1 (how close to the water).
    update(near, low) {
      if (!ready()) return;
      if (!loops) loops = { wind: loop(B.wind), sea: loop(B.sea) };
      level(loops.wind, 0.05 + 0.3 * near);
      level(loops.sea, 0.45 * near * low);
    },
    knock(p, v) { if (ready()) shot(B.knock, p, Math.min(1, 0.35 + v / 10), rnd(0.92, 1.05)); },
    bar(p) { if (ready()) shot(B.bar, p, 0.5); },
    clunk(p) { if (ready()) shot(B.clunk, p, 0.7); },
    // Each frame behind the sky (on 1, off 0): the hum, and their TV from where it is (tvAt, a Vector3 in here).
    backstage(on, tvAt) {
      if (!ready()) return;
      if (!back && !on) return;
      if (!back) {
        const hum = loop(B.hum), src = A.ctx.createBufferSource(), g = A.ctx.createGain(), pan = A.ctx.createPanner();
        src.buffer = B.tv; src.loop = true; g.gain.value = 0;
        pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 1.5; pan.rolloffFactor = 1.4;
        src.connect(g).connect(pan).connect(A.bus); src.start();
        back = { hum, tv: { src, g }, pan };
      }
      level(back.hum, on * 0.1, 0.6); level(back.tv, on * 0.5, 0.6);
      if (tvAt) { back.pan.positionX.value = tvAt.x; back.pan.positionY.value = tvAt.y; back.pan.positionZ.value = tvAt.z; }
    },
    creak(p) { if (ready()) shot(B.creak, p, 0.5, rnd(0.95, 1.02)); },
    // Out of earshot, or through the door: the loops fade to nothing (over `s` seconds).
    stop(s = 0.4) {
      if (!loops || !A) return;
      for (const v of Object.values(loops)) level(v, 0, s / 3);
    },
  };
}
