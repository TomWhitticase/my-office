// The acrobats' coast's sounds (floors/acro.js). The sea, calm, washing on the rocks and drawing back; gulls now and then;
// a little band playing a waltz in the ring (an accordion, a tuba's oom-pah-pah, a glockenspiel), a long way off unless
// you're near it; the audience murmuring, gasping at a flip and clapping; your own clap or cheer; the bell at the halt;
// the train: its whistle far out, its chuffs, the rail joints under it, the brakes, a long sigh of steam when it stops.
// Your steps: grit on granite, boards in the ring, stone up on the deck. All synthesised here, a buffer at a time (one a
// frame, so nothing hitches), through the office's own audio (sounds.js `audio`), so its volume and M apply.

import * as THREE from 'three';
import { CEN, SEATS, toWorld, Y_DECK, RING } from './acro-plan.js';

const TAU = Math.PI * 2;

export function makeSound(ctx, { train: getTrain, ring: getRing }) {
  const { camera } = ctx;
  let A = null, B = null, out = null, verb = null, loops = [], bleedL = null, stepAcc = 0, lastP = null, queue = null;
  const due = { gull: 0, murmur: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a), nz = () => Math.random() * 2 - 1, pick = (a) => a[Math.floor(Math.random() * a.length)];

  function biq(type, f, q) {
    const SR = A.ctx.sampleRate, w = TAU * f / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [a, 0, -a];
    const k0 = b0 / a0, k1 = b1 / a0, k2 = b2 / a0, a1 = -2 * c / a0, a2 = (1 - a) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => { const y = k0 * x + k1 * x1 + k2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  function make(sec, fn, peak = 0.9, ch = 1, loopSmooth = false) {
    const SR = A.ctx.sampleRate, n = Math.ceil(sec * SR), b = A.ctx.createBuffer(ch, n, SR);
    for (let c = 0; c < ch; c++) {
      const d = b.getChannelData(c);
      let m = 0;
      for (let k = 0; k < n; k++) { d[k] = fn(k / SR, c); m = Math.max(m, Math.abs(d[k])); }
      const fade = loopSmooth ? 0 : 1;
      for (let k = 0; k < n; k++) d[k] *= (m ? peak / m : 0) * (fade ? Math.min(1, (n - k) / (SR * 0.01), k / (SR * 0.003)) : 1);
      if (loopSmooth) { const X = Math.floor(SR * 0.25); for (let k = 0; k < X; k++) { const u = k / X; d[k] = d[k] * u + d[n - X + k] * (1 - u); } }
    }
    return b;
  }
  const env = (a, h, r) => (t) => (t < a ? t / a : t < a + h ? 1 : Math.max(0, 1 - (t - a - h) / r));
  // ----- what's made, one per frame -----
  const RECIPES = {
    // the sea: a low wash, a slower swell, the hiss of it running back off the rocks
    sea: () => { const l = [biq('lp', 420, 0.6), biq('lp', 420, 0.6)], h = [biq('bp', 2400, 0.8), biq('bp', 2600, 0.8)];
      return make(12, (t, c) => { const sw = 0.5 + 0.5 * Math.sin(TAU * t / 6 + c * 0.7), run = Math.max(0, Math.sin(TAU * t / 6 - 1.2 + c * 0.5)) ** 3;
        return l[c](nz()) * 2.2 * (0.45 + 0.55 * sw) + h[c](nz()) * 0.5 * run; }, 0.8, 2, true); },
    // the band: a waltz, sixteen bars, round and round; accordion (two reeds a little apart), tuba, glockenspiel
    band: () => {
      const SR = A.ctx.sampleRate, bpm = 168, beat = 60 / bpm, bars = 16, len = bars * 3 * beat;
      const nf = (m) => 440 * 2 ** ((m - 69) / 12);
      const chords = [[48, 64, 67], [43, 62, 65], [43, 62, 65], [48, 64, 67], [48, 64, 67], [41, 65, 69], [43, 62, 67], [48, 64, 67],
        [45, 64, 69], [41, 65, 69], [48, 64, 67], [43, 62, 65], [48, 64, 67], [41, 65, 69], [43, 62, 65], [48, 64, 67]];
      const tune = [76, 79, 84, 83, 81, 79, 77, 79, 81, 79, 77, 76, 74, 76, 77, 79, 81, 84, 83, 81, 79, 77, 76, 74, 72, 74, 76, 79, 77, 74, 72, 72, 72, 76, 79, 79, 81, 81, 79, 77, 76, 79, 76, 74, 72, 71, 72, 72];
      const lp = biq('lp', 2600, 0.7);
      return make(len, (t) => {
        const b = Math.floor(t / beat), bar = Math.floor(b / 3) % bars, inB = b % 3, bt = t - b * beat, ch = chords[bar];
        let v = 0;
        // tuba: the root on one, oom; pah-pah the chord, short
        if (inB === 0) { const f = nf(ch[0] - 12); v += (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 2 * t)) * Math.exp(-bt * 5) * 0.55; }
        else { for (const m of ch.slice(1)) { const f = nf(m - 12); v += ((t * f) % 1 < 0.5 ? 0.15 : -0.15) * Math.exp(-bt * 9); } }
        // the tune on the accordion, a note a beat
        const m = tune[(bar * 3 + inB) % tune.length], f = nf(m), e = Math.min(1, bt * 30) * Math.exp(-bt * 1.2);
        v += (((t * f) % 1) * 2 - 1 + ((t * f * 1.006) % 1) * 2 - 1) * 0.16 * e * (1 + 0.15 * Math.sin(TAU * 5.5 * t));
        // a glockenspiel on the first of each bar, the tune an octave up
        if (inB === 0) v += Math.sin(TAU * f * 2 * t) * Math.exp(-bt * 6) * 0.22;
        return lp(v);
      }, 0.7, 1, true);
    },
    // the audience: many voices at once, far enough that there are no words
    murmur: () => { const bank = [300, 520, 800, 1150, 1700].map((f) => ({ b: biq('bp', f, 3), a: Math.random() * 6 })); return make(8, (t) => {
      let v = 0; for (const r of bank) v += r.b(nz()) * (0.5 + 0.5 * Math.sin(TAU * (1.3 + r.a * 0.3) * t + r.a)) * (0.5 + 0.5 * Math.sin(TAU * 0.21 * t + r.a)); return v; }, 0.6, 1, true); },
    // applause: claps, many, a swell and a die-away
    applause: () => { const SR = A.ctx.sampleRate, d = new Float32Array(Math.ceil(4 * SR)), bp = biq('bp', 1800, 0.8), e = env(0.3, 2.2, 1.4);
      for (let i = 0; i < 260; i++) { const at = Math.floor(Math.random() * 3.6 * Math.sqrt(Math.random()) * SR), g = 0.4 + Math.random() * 0.6; for (let k = 0; k < SR * 0.03 && at + k < d.length; k++) d[at + k] += nz() * g * Math.exp(-k / (SR * 0.006)); }
      return make(4, (t) => bp(d[Math.min(d.length - 1, Math.floor(t * SR))]) * e(t), 0.8); },
    // a gasp, the crowd's "ooh"
    ooh: () => { const f1 = biq('bp', 350, 4), f2 = biq('bp', 800, 6); return make(1.8, (t) => { const s = Math.sin(TAU * 140 * t * (1 + 0.1 * Math.sin(t * 3))) + nz() * 0.6; return (f1(s) + f2(s) * 0.5) * env(0.25, 0.6, 0.9)(t); }, 0.6); },
    // your clap: three, sharp; your cheer: a whoop
    clap: () => { const bp = biq('bp', 1500, 1.2); return make(1.4, (t) => { let v = 0; for (const at of [0, 0.42, 0.84]) { const u = t - at; if (u >= 0 && u < 0.05) v += nz() * Math.exp(-u / 0.008); } return bp(v); }, 0.9); },
    cheer: () => { const f1 = biq('bp', 750, 6), f2 = biq('bp', 1250, 8); let ph = 0; return make(1.1, (t) => { ph = (ph + (330 + 260 * Math.sin(Math.min(1, t / 0.6) * Math.PI)) / A.ctx.sampleRate) % 1; const s = (2 * ph - 1) * 0.8 + nz() * 0.2; return (f1(s) + f2(s) * 0.7) * env(0.06, 0.6, 0.4)(t); }, 0.8); },
    // a gull: a long "kee-ow", and a few short laughs
    gull: () => Array.from({ length: 3 }, (_, i) => { const f1 = biq('bp', 2200, 5), f2 = biq('bp', 3300, 7); let ph = 0; const d = i ? 0.35 : 0.9;
      return make(d, (t) => { const f = (i ? 1250 : 1100) * (1 + 0.35 * Math.sin(Math.PI * t / d)) * (1 - 0.25 * t / d); ph = (ph + f / A.ctx.sampleRate) % 1; const s = (ph < 0.3 ? 1 : -0.4) + nz() * 0.25; return (f1(s) + f2(s) * 0.6) * env(0.03, d * 0.5, d * 0.4)(t); }, 0.7); }),
    // the bell: struck bronze
    bell: () => { const p = [523, 1046 * 0.996, 1253, 1568, 2093 * 1.01, 2640].map((f, i) => [f, Math.random() * TAU, 0.6 + i * 0.7]); return make(5, (t) => p.reduce((a, [f, ph, dk], i) => a + Math.sin(TAU * f * t + ph) * Math.exp(-t * dk) / (1 + i * 0.6), 0), 0.8); },
    // the train: a whistle (two pipes and the breath through them), a chuff, the rail joints, the brakes, steam
    whistle: () => { const lp = biq('lp', 3500, 0.7); return make(2.4, (t) => { const e = env(0.12, 1.6, 0.6)(t); return lp((Math.sin(TAU * 523 * t) * 0.5 + Math.sin(TAU * 659 * t) * 0.4 + Math.sin(TAU * 784 * t) * 0.25) * (1 + 0.04 * Math.sin(TAU * 6 * t)) + nz() * 0.25) * e; }, 0.7); },
    chuff: () => Array.from({ length: 3 }, () => { const lp = biq('lp', 900, 0.7), bp = biq('bp', 2200, 1); return make(0.32, (t) => (lp(nz()) * 1.6 + bp(nz()) * 0.4) * Math.exp(-t / 0.07) * Math.min(1, t * 200), 0.8); }),
    clack: () => { const bp = biq('bp', 900, 3); return make(0.5, (t) => { let v = 0; for (const at of [0, 0.09]) { const u = t - at; if (u >= 0) v += nz() * Math.exp(-u / 0.012); } return bp(v); }, 0.7); },
    brake: () => { const bp = biq('bp', 3100, 18), bp2 = biq('bp', 4400, 22); return make(3.5, (t) => (bp(nz()) + bp2(nz()) * 0.6) * env(0.4, 2.2, 0.9)(t) * (0.6 + 0.4 * Math.sin(TAU * 7 * t)), 0.5); },
    hiss: () => { const hp = biq('hp', 1800, 0.6); return make(3.2, (t) => hp(nz()) * env(0.05, 1.2, 1.9)(t), 0.6); },
    // a flip: the air past them, and the thump of landing
    whoosh: () => { let f = 0; return make(1.4, (t) => { f = biq('bp', 400 + 1400 * Math.sin(Math.PI * Math.min(1, t / 1.1)), 1.5); return f(nz()) * env(0.2, 0.6, 0.5)(t) + (t > 1.1 && t < 1.2 ? Math.sin(TAU * 70 * t) * Math.exp(-(t - 1.1) * 30) * 2 : 0); }, 0.6); },
    creak: () => { const bp = biq('bp', 380, 8); let ph = 0; return make(0.6, (t) => { ph += (25 + 40 * t) / A.ctx.sampleRate; return bp(ph % 1 < 0.1 ? nz() : 0) * Math.sin(Math.PI * t / 0.6); }, 0.6); },
    // your steps: grit on granite, a hollow board, stone
    stepRock: () => Array.from({ length: 5 }, () => { const lp = biq('lp', 1600, 0.7), bp = biq('bp', 3000, 1); return make(0.2, (t) => (lp(nz()) * 1.4 + bp(nz() * (Math.random() < 0.3 ? 1 : 0.2))) * Math.exp(-t / 0.045)); }),
    stepBoard: () => Array.from({ length: 4 }, () => { const lp = biq('lp', 500, 1.5); return make(0.22, (t) => (lp(nz()) * 2 + Math.sin(TAU * 140 * t) * 0.5) * Math.exp(-t / 0.04)); }),
    hall: () => { const f = [biq('lp', 3000, 0.5), biq('lp', 3000, 0.5)]; return make(2.2, (t, c) => f[c](nz()) * Math.exp(-t / 0.55), 0.5, 2); },
  };
  const ORDER = ['sea', 'hall', 'band', 'murmur', 'stepRock', 'stepBoard', 'gull', 'applause', 'clap', 'cheer', 'ooh', 'bell', 'whistle', 'chuff', 'clack', 'brake', 'hiss', 'whoosh', 'creak'];
  function ready() {
    const a = ctx.sfx.audio;
    if (!a || a.ctx.state !== 'running') return false;
    if (A?.ctx !== a.ctx) { A = a; B = {}; queue = ORDER.slice(); loops = []; out = verb = bleedL = null; }
    if (queue.length) { const k = queue.shift(); B[k] = RECIPES[k](); }   // (one a frame)
    if (!out && B.hall) {
      out = A.ctx.createGain(); out.connect(A.master);
      verb = A.ctx.createConvolver(); verb.buffer = B.hall;
      const wet = A.ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet).connect(out);
    }
    return !!out;
  }
  function panner(p, ref = 3) {
    const pan = A.ctx.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = 1;
    pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
    return pan;
  }
  function shot(buf, p, gain, { rate = 1, lp = 0, send = 0.3, ref = 3, when = 0 } = {}) {
    if (!buf) return;
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    let head = src;
    if (lp) { const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); head = f; }
    head.connect(g);
    if (p) g.connect(panner(p, ref)).connect(out); else g.connect(out);
    if (send) { const s = A.ctx.createGain(); s.gain.value = send; g.connect(s).connect(verb); }
    src.onended = () => src.disconnect();
    src.start(A.ctx.currentTime + when);
  }
  function loop(buf, gain, to, p = null, ref = 6) {
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = 0;
    src.connect(g);
    if (p) g.connect(panner(p, ref)).connect(to); else g.connect(to);
    g.gain.setTargetAtTime(gain, A.ctx.currentTime, 2);
    src.start(); return { src, g };
  }
  const RINGP = { x: CEN.x, y: 2, z: CEN.z }, SEATP = (() => { const w = toWorld(Math.cos((SEATS.a0 + SEATS.a1) / 2) * 12, Math.sin((SEATS.a0 + SEATS.a1) / 2) * 12); return { x: w.x, y: 2, z: w.z }; })();
  const tp = new THREE.Vector3();
  let clackAcc = 0;
  return {
    fx(dt, t, W) {
      if (!ready()) return;
      if (!loops.length && B.sea && B.band && B.murmur) {
        loops.push(loop(B.sea, 0.32, out), loop(B.band, 0.5, out, RINGP, 7), loop(B.murmur, 0.12, out, SEATP, 5));
        due.gull = t + rnd(3, 8);
      }
      // your steps
      const p = camera.position, moved = lastP ? Math.hypot(p.x - lastP.x, p.z - lastP.z) / Math.max(dt, 1e-3) : 0;
      lastP = { x: p.x, z: p.z };
      const walking = moved > 1 && moved < 12 && !ctx.player.seated;
      stepAcc = walking ? stepAcc + dt : 0.3;
      if (walking && stepAcc > (moved > 6 ? 0.3 : 0.44) && B.stepRock) {
        stepAcc = 0;
        const inRing = Math.hypot(p.x - CEN.x, p.z - CEN.z) < RING;
        shot(pick(inRing ? B.stepBoard : B.stepRock), null, W.deck ? 0.05 : 0.06, { rate: rnd(0.9, 1.1) * (W.deck ? 0.8 : 1), send: W.deck ? 0.25 : 0.08 });
      }
      if (t > due.gull && B.gull) {
        due.gull = t + rnd(6, 16);
        const a = Math.random() * TAU, d = rnd(15, 45), q = { x: p.x + Math.cos(a) * d, y: p.y + rnd(8, 20), z: p.z + Math.sin(a) * d }, g = B.gull;
        shot(g[0], q, 0.18, { rate: rnd(0.9, 1.1), send: 0.4, ref: 8 });
        if (Math.random() < 0.6) for (let i = 0; i < 3; i++) shot(g[1 + (i % 2)], q, 0.14, { rate: rnd(0.95, 1.1), send: 0.4, ref: 8, when: 1.0 + i * 0.28 });
      }
      // the rail joints under the train while it's moving
      const T = getTrain();
      if (T && T.S.v > 0.5 && B.clack) {
        clackAcc += T.S.v * dt;
        if (clackAcc > 12.5) { clackAcc = 0; T.pos(); tp.copy(T.pos()); shot(B.clack, tp, 0.25, { rate: rnd(0.9, 1.1), send: 0.3, ref: 10 }); }
      }
    },
    you(kind) { if (ready()) shot(kind === 'cheer' ? B.cheer : B.clap, null, kind === 'cheer' ? 0.22 : 0.3, { send: 0.3, rate: rnd(0.95, 1.05) }); },
    applause(g = 1) { if (ready()) { shot(B.applause, SEATP, 0.5 * g, { send: 0.4, ref: 8, when: 0.3 }); } },
    flip(T) { if (ready()) { shot(B.whoosh, { x: T.x, y: 9, z: T.z }, 0.4, { send: 0.3, ref: 6 }); shot(B.ooh, SEATP, 0.35, { send: 0.4, ref: 8, when: 0.25 }); } },
    creak(T) { if (ready()) shot(B.creak, { x: T.x, y: 4, z: T.z }, 0.25, { send: 0.2 }); },
    bell(p) { if (ready()) shot(B.bell, { x: p.x, y: p.y + 2.2, z: p.z }, 0.7, { send: 0.5, ref: 4 }); },
    train(ev, a, T) {
      if (ctx.away?.n !== -8 || !ready() || !T) return;
      tp.copy(T.pos());
      if (ev === 'whistle') shot(B.whistle, tp, a ? 0.9 : 0.7, { send: 0.6, ref: 30 });
      else if (ev === 'chuff') shot(pick(B.chuff || [null]), tp, 0.25 + a * 0.4, { rate: rnd(0.9, 1.1), send: 0.3, ref: 12 });
      else if (ev === 'brake') shot(B.brake, tp, 0.35, { send: 0.3, ref: 12 });
      else if (ev === 'hiss') shot(B.hiss, tp, 0.5, { send: 0.3, ref: 10 });
    },
    // Heard from B3 through the painting: the sea and the band at v (0 to 1).
    bleed(v) {
      if ((!bleedL && v < 0.002) || !ready() || !B.band) return;
      const now = A.ctx.currentTime;
      if (!bleedL) {
        const g = A.ctx.createGain(); g.gain.value = 0; g.connect(A.master);
        bleedL = { g, srcs: [loop(B.sea, 0.3, g), loop(B.band, 0.12, g)] };
      }
      bleedL.g.gain.setTargetAtTime(v, now, 0.3);
      if (v < 0.002) { for (const s of bleedL.srcs) s.src.stop(now + 1.5); bleedL = null; }
    },
    stop() {
      if (A) for (const { src, g } of loops) { g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.3); src.stop(A.ctx.currentTime + 1.5); }
      loops = []; lastP = null;
    },
  };
  void getRing; void Y_DECK;
}
