// The wellness floor's sounds (floors/wellness.js): the pool lapping and a long echo off the water and glass in the pool
// hall; a splash going in, strokes as you swim, everything muffled under the water; your steps on the stone; the gym's
// music faint from its speakers, a treadmill's whirr, the bike's freewheel, the rower's flywheel, plates clanking; the
// sauna's stove crackling and the hiss of löyly; the steam room's hiss; the jacuzzi bubbling; a shower running; the blender;
// lockers; the doors; in the float pod, near silence and a slow heartbeat and breath.
// All synthesised here, through the office's own audio (sounds.js `audio`), so its volume and M apply. Positions are
// the floor's own (x, z; y over its boards).

const TAU = Math.PI * 2;

export function makeSound(ctx, W) {
  let A = null, B = null, out = null, lp = null, verb = null, wet = null, loops = [], under = null, tool = null, shower = null;
  let crackleAt = 0, stepAcc = 0, last = null, musicV = null, steamV = null, jacV = null, calmV = null, floatK = 0;
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
  // Water lapping at an edge: slow swells of low-passed noise with little slaps (4 s, looped).
  function lap() {
    const lo = biq('lp', 380, 0.7), slap = biq('bp', 900, 1.2), D = 4;
    let k = 0;
    return make(D, (t) => {
      if (Math.random() < 3 / A.ctx.sampleRate) k = rnd(0.4, 1);
      k *= 0.9996;
      const sw = 0.55 + 0.45 * Math.sin(TAU * t / D) * Math.sin(TAU * 3 * t / D + 1);
      return lo(nz()) * 2.2 * sw + slap(nz()) * k * 0.7;
    });
  }
  function splash(big) {   // going in: a plunge (low thump, bubbles) and the spray
    const lo = biq('lp', big ? 260 : 400, 0.8), spray = biq('hp', 1800, 0.7), bub = biq('bp', 700, 4), D = big ? 1.6 : 0.7;
    return make(D, (t) => {
      const n = nz(), e = Math.exp(-t / (big ? 0.12 : 0.06));
      return lo(n) * e * 4 + spray(n) * Math.exp(-t / (big ? 0.35 : 0.15)) * 0.8 + bub(n) * (Math.random() < 0.004 ? 6 : 0.2) * Math.exp(-t / 0.5);
    });
  }
  function stroke() {   // an arm going over and in: a soft whoosh, a slap, a trickle
    const f = biq('bp', rnd(500, 800), 0.9), sl = biq('bp', rnd(1200, 1700), 1.5), tr = biq('hp', 2500, 0.7), at = rnd(0.16, 0.22);
    return make(0.6, (t) => { const n = nz(); return f(n) * Math.sin(Math.PI * Math.min(1, t / at)) * 0.6 + sl(n) * (t > at ? Math.exp(-(t - at) / 0.03) * 2 : 0)
      + tr(n) * (t > at ? Math.exp(-(t - at) / 0.25) * 0.25 : 0); });
  }
  function clank() {   // iron plates meeting: inharmonic partials over a dull thud
    const lo = biq('lp', 200, 0.8), parts = [[312, 0.5, 0.18], [597, 0.35, 0.12], [1123, 0.25, 0.08], [1871, 0.15, 0.05], [2730, 0.08, 0.03]].map(([f, a, d]) => [f * rnd(0.97, 1.03), a, d]);
    return make(1.0, (t) => { let v = lo(nz()) * Math.exp(-t / 0.03) * 3; for (const [f, a, d] of parts) v += Math.sin(TAU * f * t) * a * Math.exp(-t / d); return v; });
  }
  function hiss() {   // löyly: water on hot stones, a burst of sizzle that dies away with crackles
    const hp = biq('hp', 2200, 0.6), bp = biq('bp', 5000, 0.8);
    return make(3.2, (t) => { const n = nz(), e = Math.min(1, t / 0.05) * Math.exp(-t / 0.9); return hp(n) * e * 1.2 + bp(n) * e * 0.6 + (Math.random() < 0.002 * (1 + e * 5) ? nz() * 2.5 : 0); });
  }
  function crackle() {   // the stove ticking and the stones settling
    const bp = biq('bp', rnd(1500, 3500), 2.5);
    return make(0.08, (t) => bp(nz() * Math.exp(-t / 0.004)));
  }
  function steamLoop() {   // the steam generator breathing out: hiss with slow surges (6 s)
    const hp = biq('hp', 1600, 0.5), lo = biq('lp', 300, 0.7), D = 6;
    return make(D, (t) => { const s = 0.55 + 0.45 * Math.sin(TAU * t / D) ** 2; return hp(nz()) * s + lo(nz()) * 0.6 * s; });
  }
  function rain() {   // a rain shower: dense droplets on stone (3 s)
    const hp = biq('hp', 900, 0.6), bp = biq('bp', 3200, 0.9);
    return make(3, (t) => nz() * 0.15 + hp(nz()) * 0.6 + bp(nz()) * (Math.random() < 0.02 ? 3 : 0.4));
  }
  function whirr() {   // a motor and belt (2 s, whole cycles so it loops): pitch follows the rate it's played at
    const lo = biq('lp', 600, 0.8);
    return make(2, (t) => Math.sin(TAU * 90 * t) * 0.35 + Math.sin(TAU * 180 * t) * 0.15 + Math.sin(TAU * 271 * t) * 0.06 + lo(nz()) * 0.8 + Math.sin(TAU * 2 * t) * 0.1);
  }
  function fly() {   // the rower's air flywheel: rushing air pulsing with each stroke (played at the stroke rate)
    const bp = biq('bp', 700, 0.6);
    return make(2, (t) => bp(nz()) * (0.3 + 0.7 * Math.sin(Math.PI * (t % 2) / 2) ** 2));
  }
  function thud() {   // a footfall on a treadmill's deck
    const lo = biq('lp', 150, 0.9);
    return make(0.15, (t) => lo(nz()) * Math.exp(-t / 0.025) * 4 + Math.sin(TAU * 70 * t) * Math.exp(-t / 0.03));
  }
  function blend() {   // the blender: a whine up to speed, the jug's contents churning, winding down
    const bp = biq('bp', 1200, 1.5), lo = biq('lp', 400, 0.7);
    let ph = 0;
    return make(4, (t) => {
      const sp = t < 0.4 ? t / 0.4 : t < 3.3 ? 1 : Math.max(0, 1 - (t - 3.3) / 0.7);
      ph += (180 + 260 * sp) / A.ctx.sampleRate;
      return (Math.sin(TAU * ph) * 0.5 + Math.sign(Math.sin(TAU * ph)) * 0.15) * sp + bp(nz()) * sp * 0.6 + lo(nz()) * sp * (0.5 + 0.5 * Math.sin(TAU * 7 * t)) * 0.6;
    });
  }
  function bubbles() {   // the jacuzzi: a churning rumble, the jets' hiss, bubbles popping (4 s, looped)
    const lo = biq('lp', 220, 0.7), mid = biq('bp', 650, 0.8), pop = biq('bp', 1100, 6), D = 4;
    let e = 0;
    return make(D, (t) => {
      if (Math.random() < 60 / A.ctx.sampleRate) e = rnd(0.5, 1);
      e *= 0.997;
      const s = 0.8 + 0.2 * Math.sin(TAU * 2 * t / D);
      return lo(nz()) * 2.5 * s + mid(nz()) * 0.5 * s + pop(nz()) * e * 3;
    });
  }
  // The float pod: a slow heartbeat (54 a minute) under one long breath in and out, five beats to the breath (looped).
  function calm() {
    const lo = biq('lp', 90, 0.9), br = biq('bp', 420, 0.6), D = 5 * 60 / 54;
    return make(D, (t) => {
      const b = t % (60 / 54), lub = Math.exp(-b / 0.05) * Math.sin(TAU * 48 * b), dub = b > 0.28 ? Math.exp(-(b - 0.28) / 0.06) * Math.sin(TAU * 40 * (b - 0.28)) * 0.7 : 0;
      const ph = t / D, breath = ph < 0.4 ? Math.sin(Math.PI * ph / 0.4) : Math.sin(Math.PI * (ph - 0.4) / 0.6) * 0.8;
      return lo((lub + dub) * 3) * 2.5 + br(nz()) * breath * breath * 0.35;
    });
  }
  const beep = () => make(0.12, (t) => Math.sin(TAU * 1760 * t) * Math.min(1, t / 0.004) * (t < 0.09 ? 1 : 0));
  // The gym's music: 8 s of a soft four-to-the-floor at 120 bpm, a bass line and a pad (whole cycles, so it loops).
  function music() {
    const SR = A.ctx.sampleRate, D = 8, chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
    const bass = [110, 87.31, 130.81, 98], hat = biq('hp', 7000, 0.7);
    return make(D, (t) => {
      const beat = (t * 2) % 1, bar = Math.floor(t / 2) % 4, e8 = (t * 4) % 1;
      const kick = Math.sin(TAU * (50 + 90 * Math.exp(-beat * 30)) * beat / 2) * Math.exp(-beat * 10) * 1.1;
      const h = hat(nz()) * Math.exp(-e8 * 40) * (Math.floor(t * 4) % 2 ? 0.5 : 0.2);
      const bf = bass[bar], b = (Math.sin(TAU * bf * t) + 0.3 * Math.sin(TAU * bf * 2 * t)) * (0.5 + 0.5 * Math.exp(-((t * 2) % 1) * 3)) * 0.45;
      let pad = 0; for (const f of chords[bar]) pad += Math.sin(TAU * f * t + Math.sin(TAU * 0.5 * t)) * 0.12;
      void SR;
      return kick + h + b + pad * (0.6 + 0.4 * Math.sin(TAU * t / 2));
    }, 0.8);
  }
  function build() {
    const n = (k, f) => Array.from({ length: k }, f);
    return { lap: lap(), splash: splash(true), dip: splash(false), stroke: n(4, stroke), clank: n(3, clank), hiss: hiss(), crackle: n(5, crackle),
      steam: steamLoop(), rain: rain(), whirr: whirr(), fly: fly(), thud: n(3, thud), blend: blend(), beep: beep(), music: music(), bubbles: bubbles(), calm: calm() };
  }

  // ----- playback -----
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) {
      A = a; B = null; loops = [];
      // Everything goes out through a low-pass (closed down under water) to the office's master, with a send to a long,
      // bright echo for the pool hall.
      lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; lp.connect(A.master);
      out = A.ctx.createGain(); out.connect(lp);
      verb = A.ctx.createConvolver(); wet = A.ctx.createGain(); wet.gain.value = 0;
      const SR = A.ctx.sampleRate, ir = A.ctx.createBuffer(2, SR * 2.6, SR);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = nz() * Math.exp(-i / SR / 0.55) * Math.min(1, i / (SR * 0.015)); }
      verb.buffer = ir; out.connect(verb).connect(wet).connect(lp);
    }
    if (!B) B = build();
    return true;
  }
  const setPos = (p, x, y, z) => { p.positionX.value = x; p.positionY.value = y + W.Y; p.positionZ.value = z; };
  function panner(x, y, z, ref = 2, roll = 1.1) {
    const p = A.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 10000;
    setPos(p, x, y, z); p.connect(out); return p;
  }
  // A one-shot at (x, y, z), or all round you (x null).
  function shot(buf, x, y, z, gain, { rate = 1, ref = 2, roll = 1.1 } = {}) {
    if (!buf) return null;
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g).connect(x === null ? out : panner(x, y, z, ref, roll));
    src.onended = () => src.disconnect();
    src.start();
    return { src, g };
  }
  function loop(buf, gain, x, y, z, ref = 3, roll = 1, fade = 1.2) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; src.loopStart = 0; g.gain.value = 0;
    const p = x === null ? null : panner(x, y, z, ref, roll);
    src.connect(g).connect(p || out);
    g.gain.setTargetAtTime(gain, A.ctx.currentTime, fade);
    src.start(0, Math.random() * buf.duration); loops.push({ src, g });
    return { src, g, p };
  }
  const office = (k) => ctx.sfx.buffers?.[k];

  return {
    // Each frame while you're here.
    fx(dt) {
      if (!ready()) return;
      const now = A.ctx.currentTime, p = ctx.camera.position, x = p.x, z = p.z;
      if (!loops.length) {
        loop(B.lap, 0.05, -12, 0, 12.2, 4, 0.9); loop(B.lap, 0.04, -1, 0, 12.2, 4, 0.9);
        musicV = loop(B.music, 0.035, 13, 3.0, 9.2, 3, 1.1);
        const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; musicV.g.disconnect(); musicV.g.connect(f).connect(musicV.p);
        steamV = loop(B.steam, 0.05, 13.2, 0.4, -14.3, 1.2, 1.8);
        if (W.jacuzzi) jacV = loop(B.bubbles, 0.07, W.jacuzzi.x, 0.5, W.jacuzzi.z, 1.5, 1.3);
      }
      // The jacuzzi, louder all round you once you're in it.
      if (jacV) jacV.g.gain.setTargetAtTime(W.jacuzzi.in ? 0.16 : 0.07, now, 0.5);
      // The pool hall's echo: you're in it (west of the gym, north of the glass).
      const hall = x < 6 && z > 3.5;
      wet.gain.setTargetAtTime(hall ? 0.22 : 0.04, now, 0.4);
      // The sauna's stove, now and then, when you're near.
      if (W.sauna && Math.hypot(x - W.sauna.stove.x, z - W.sauna.stove.z) < 7 && performance.now() > crackleAt) {
        if (crackleAt) shot(pick(B.crackle), W.sauna.stove.x, 0.6, W.sauna.stove.z, rnd(0.04, 0.12) * (1 + W.sauna.heat), { rate: rnd(0.8, 1.2), ref: 1, roll: 1.4 });
        crackleAt = performance.now() + rnd(150, 1400);
      }
      // The steam room's hiss rises while it's breathing out (the spa drives it).
      if (W.steam) steamV.g.gain.setTargetAtTime(0.03 + 0.06 * W.steam.puff, now, 0.5);
      // Your steps on the stone (not while you're swimming or on a machine).
      const moved = last ? Math.hypot(x - last.x, z - last.z) / Math.max(dt, 1e-3) : 0;
      last = { x, z };
      const walking = moved > 1.2 && moved < 12 && !W.swim?.in && !W.jacuzzi?.in && !W.using;
      stepAcc = walking ? stepAcc + dt : 0.3;
      if (walking && stepAcc > (moved > 4.5 ? 0.31 : 0.43)) {
        stepAcc = 0;
        const soft = (x > 6 && z > 3.5) || (x < -8 && z < -3.5) || (x < -10.5 && z < 3.5);   // rubber, oak
        const b = office(soft ? 'soft' : 'step');
        if (b) shot(pick(b), null, 0, 0, soft ? 0.05 : 0.07, { rate: rnd(0.95, 1.1) });
      }
    },
    splash(x, z, big) { if (ready()) shot(big ? B.splash : B.dip, x, 0, z, big ? 0.45 : 0.25, { rate: rnd(0.9, 1.1) }); },
    stroke(x, z) { if (ready()) shot(pick(B.stroke), x, 0.05, z, 0.22, { rate: rnd(0.9, 1.15) }); },
    clank(x, y, z, gain = 0.4) { if (ready()) shot(pick(B.clank), x, y, z, gain, { rate: rnd(0.92, 1.08) }); },
    thud(x, z, gain = 0.2) { if (ready()) shot(pick(B.thud), x, 0.2, z, gain, { rate: rnd(0.9, 1.1) }); },
    hiss(x, z) { if (ready()) shot(B.hiss, x, 0.8, z, 0.5, { rate: rnd(0.95, 1.05) }); },
    blend(x, z) { if (ready()) shot(B.blend, x, 1.1, z, 0.35); },
    beep(x, y, z) { if (ready()) shot(B.beep, x, y, z, 0.12, { ref: 1 }); },
    door(at) { if (ready()) shot(office('slide'), at.x, 1.2, at.z, 0.12, { rate: rnd(1.1, 1.25) }); },
    latch(x, y, z, open) { if (ready()) { shot(pick(office('latch') || [null]), x, y, z, 0.25); if (!open) shot(pick(office('slam') || [null]), x, y, z, 0.15, { rate: 1.6 }); } },
    towel() { if (ready()) shot(pick(office('rustle') || [null]), null, 0, 0, 0.18, { rate: 0.8 }); },
    // In the float pod, k 0..1 as the lights go: the floor falls away to almost nothing, muffled, and a slow heartbeat and
    // breathing come up (straight to the office's master, past the floor's own muffling).
    float(k) {
      if (!ready() || (Math.abs(k - floatK) < 0.002 && (k > 0 || floatK === 0))) return;
      floatK = k;
      const now = A.ctx.currentTime;
      out.gain.setTargetAtTime(1 - 0.94 * k, now, 0.3);
      lp.frequency.setTargetAtTime(k > 0.01 ? 18000 * Math.pow(400 / 18000, k) : 18000, now, 0.3);
      if (k > 0 && !calmV) {
        const src = A.ctx.createBufferSource(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 700; src.buffer = B.calm; src.loop = true; g.gain.value = 0;
        src.connect(f).connect(g).connect(A.master); src.start(); calmV = { src, g };
      }
      if (calmV) calmV.g.gain.setTargetAtTime(0.3 * k, now, 0.4);
      if (k === 0 && calmV) { const c = calmV; c.g.gain.setTargetAtTime(0, now, 0.2); c.src.stop(now + 1); calmV = null; }
    },
    // You under the water: everything closes down to a low rumble.
    under(on) {
      if (!A || !lp) return;
      const now = A.ctx.currentTime;
      if (floatK > 0.01) return;
      lp.frequency.setTargetAtTime(on ? 420 : 18000, now, 0.08);
      if (on && !under && ready()) under = loop(B.lap, 0, null, 0, 0, 0, 0, 0.1);
      under?.g.gain.setTargetAtTime(on ? 0.3 : 0, now, 0.1);
    },
    // A machine running: kind 'whirr' (treadmill, its rate the belt's), 'fly' (rower) or null to stop.
    tool(kind, level, x, z) {
      if (!ready()) return;
      const now = A.ctx.currentTime;
      if (tool && tool.kind !== kind) { tool.g.gain.setTargetAtTime(0, now, 0.15); tool.src.stop(now + 0.6); loops = loops.filter((l) => l.src !== tool.src); tool = null; }
      if (!kind) return;
      if (!tool) { tool = { kind, ...loop(B[kind], 0, x, 0.6, z, 1.5, 1.2, 0.2) }; }
      tool.g.gain.setTargetAtTime(level > 0.01 ? (kind === 'whirr' ? 0.05 + 0.08 * level : 0.1 + 0.25 * level) : 0, now, 0.2);
      tool.src.playbackRate.setTargetAtTime(kind === 'whirr' ? 0.5 + 1.1 * level : 0.4 + 0.9 * level, now, 0.2);
    },
    shower(on, x, z) {
      if (!ready()) return;
      const now = A.ctx.currentTime;
      if (on && !shower) shower = loop(B.rain, 0.12, x, 1.6, z, 1.5, 1.4, 0.3);
      else if (!on && shower) { const s = shower; s.g.gain.setTargetAtTime(0, now, 0.2); s.src.stop(now + 1); loops = loops.filter((l) => l !== s && l.src !== s.src); shower = null; }
    },
    stop() {
      if (A) for (const { src, g } of loops) { g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2); src.stop(A.ctx.currentTime + 1); }
      if (lp) lp.frequency.setTargetAtTime(18000, A.ctx.currentTime, 0.05);
      if (out) out.gain.setTargetAtTime(1, A.ctx.currentTime, 0.05);
      if (calmV) { calmV.src.stop(A.ctx.currentTime + 0.5); calmV = null; }
      floatK = 0;
      loops = []; under = null; tool = null; shower = null; last = null; musicV = null; steamV = null; jacV = null;
    },
  };
}
