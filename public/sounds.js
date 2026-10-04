// Ambient office sounds: typing, footsteps, chatter, ping pong, the coffee machine, and a few fixtures (lift chime and doors, door, blinds,
// chairs, room tone), plus the wind on the roof. No assets: every sound is synthesised once into a short buffer, then played through a panner with
// random pitch/gain so repeats don't sound canned. Nothing is scheduled for sources more than CULL metres away.
import * as THREE from 'three';

const dash = window.dash;
const CULL = 25, MAX_VOICES = 24;   // metres, concurrent one-shots
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const noise = () => Math.random() * 2 - 1;
const clampLook = (d) => Math.max(0, Math.min(d, 0.25));
const env = (t, a, b, att, rel) => (t < a || t > b ? 0 : Math.min(1, (t - a) / att, (b - t) / rel));
const SEATED = new Set(['type', 'wait', 'sofa', 'beanbag', 'meeting', 'stool']);
const TALK = new Set(['chat', 'sofa', 'beanbag', 'meeting']);
// Vowel formants (F1, F2, F3) for the babble.
const VOWELS = [[730, 1090, 2440], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [300, 870, 2240], [660, 1720, 2410], [490, 1350, 1690]];

export function createSounds({ camera, rugs, glass, lift, coffee, doorPos, roof }) {
  let ctx = null, bus = null, master = null, B = null, voices = 0, active = false;
  let away = false, tone = null, hum = null, humOn = false;   // away: off the office floor, where it can't be heard ('roof' up top, true in the archive)
  const played = {};   // debug counts by kind (window.__office.sfx.played)
  const st = new Map();       // person -> sound state
  const convs = new Map();    // chat group key -> conversation
  let look = 0.06, lastT = 0, groupsAt = 0, machineFree = 0, prevK = null, rallySeen = false, lastDoor = null, lastBlinds = {}, stepAcc = 0;
  const L = new THREE.Vector3(), fwd = new THREE.Vector3(), lastCam = new THREE.Vector3(), _w = new THREE.Vector3();

  // ----- synthesis -----
  function biq(type, f, q) {   // RBJ biquad, per sample
    const SR = ctx.sampleRate, w = TAU * f / SR, c = Math.cos(w), a = Math.sin(w) / (2 * q), a0 = 1 + a;
    const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [a, 0, -a];
    const k0 = b0 / a0, k1 = b1 / a0, k2 = b2 / a0, a1 = -2 * c / a0, a2 = (1 - a) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => { const y = k0 * x + k1 * x1 + k2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  function svf() {   // state-variable band-pass with a cutoff that can move per sample
    let lo = 0, bd = 0;
    return (x, f, damp) => { const F = 2 * Math.sin(Math.PI * Math.min(f, ctx.sampleRate / 6) / ctx.sampleRate); lo += F * bd; bd += F * (x - lo - damp * bd); return bd; };
  }
  function make(sec, fn, peak = 0.9) {
    const SR = ctx.sampleRate, n = Math.ceil(sec * SR), b = ctx.createBuffer(1, n, SR), d = b.getChannelData(0);
    let m = 0;
    for (let i = 0; i < n; i++) { const v = fn(i / SR); d[i] = v; m = Math.max(m, Math.abs(v)); }
    const fade = Math.min(n, Math.floor(SR * 0.005));
    for (let i = 0; i < n; i++) d[i] *= (m ? peak / m : 0) * Math.min(1, (n - i) / fade);
    return b;
  }
  const key = (space) => {
    const click = biq('bp', space ? 1500 : rnd(2200, 4000), 1.2), body = biq('bp', space ? rnd(170, 230) : rnd(350, 650), 3), rel = rnd(0.05, 0.09);
    return make(0.16, (t) => {
      const n = noise(), e = Math.exp(-t / 0.004) + (t > rel ? 0.45 * Math.exp(-(t - rel) / 0.003) : 0);
      return click(n * e) + body(n * Math.exp(-t / (space ? 0.03 : 0.016))) * 1.6;
    });
  };
  const step = (soft) => {
    const lp = biq('lp', soft ? 350 : 750, 0.8), thump = biq('bp', rnd(90, 130), 1.5), scuff = biq('bp', rnd(2500, 3500), 0.7), toeAt = rnd(0.06, 0.09);
    return make(0.24, (t) => {
      const n = noise(), heel = Math.exp(-t / 0.022), toe = t > toeAt ? 0.6 * Math.exp(-(t - toeAt) / 0.018) : 0;
      return lp(n * (heel + toe)) + thump(n * heel) * 3 + scuff(n * Math.exp(-t / 0.05)) * (soft ? 0.04 : 0.3);
    });
  };
  const tock = (table) => {
    const bp = biq('bp', table ? 1800 : 1300, 2), f = table ? rnd(2400, 2800) : rnd(900, 1050);
    return make(0.1, (t) => Math.sin(TAU * f * t) * Math.exp(-t / (table ? 0.02 : 0.012)) * 0.6 + bp(noise() * Math.exp(-t / 0.008))
      + Math.sin(TAU * (table ? 180 : 420) * t) * Math.exp(-t / 0.025) * 0.5);
  };
  function espresso() {   // button click, grind, pump + hiss, pour
    const g1 = biq('bp', 1400, 0.9), g2 = biq('bp', 260, 2), hiss = biq('hp', 3500, 0.7), pour = biq('bp', 700, 4), pour2 = biq('lp', 1200, 0.7), tick = biq('bp', 3000, 2);
    let bub = 0;
    return make(7, (t) => {
      const n = noise(), grind = env(t, 0.3, 2.6, 0.05, 0.15) * (0.6 + 0.4 * Math.sin(TAU * 38 * t)) * (0.8 + 0.2 * Math.sin(TAU * 3.1 * t));
      const pump = env(t, 2.9, 4.6, 0.1, 0.3), po = env(t, 4.3, 6.8, 0.2, 0.6);
      if (Math.random() < 0.0009) bub = 1;
      bub *= 0.9993;
      return tick(n * Math.exp(-Math.abs(t - 0.05) / 0.004)) * 2 + g1(n * grind) + g2(n * grind) * 0.6
        + pump * 0.12 * (Math.sin(TAU * 50 * t) + 0.5 * Math.sin(TAU * 100 * t) + 0.3 * Math.sin(TAU * 150 * t)) + hiss(n * pump) * 0.5
        + pour(n * po * (0.3 + bub)) * 1.2 + pour2(n * po) * 0.2;
    }, 0.8);
  }
  function syllable(f0) {   // a sawtooth "voice" through three vowel formants, sometimes after a fricative/plosive onset
    const [F1, F2, F3] = pick(VOWELS), dur = rnd(0.1, 0.24), onset = Math.random() < 0.45 ? rnd(0.02, 0.05) : 0, slope = rnd(-0.15, 0.15);
    const f1 = biq('bp', F1, 5), f2 = biq('bp', F2, 7), f3 = biq('bp', F3, 9), fric = biq('hp', rnd(2500, 5000), 0.7), lp = biq('lp', 2600, 0.7);
    let ph = 0;
    return make(onset + dur + 0.07, (t) => {
      ph += f0 * (1 + slope * t / dur) / ctx.sampleRate; ph -= Math.floor(ph);
      const src = 2 * ph - 1 + noise() * 0.06, e = Math.max(0, Math.min(1, (t - onset) / 0.02, (onset + dur + 0.06 - t) / 0.06));
      const fr = fric(noise()) * (onset ? env(t, 0, onset + 0.01, 0.005, 0.015) * 0.25 : 0);
      return lp((f1(src) + f2(src) * 0.5 + f3(src) * 0.22) * e + fr);
    }, 0.8);
  }
  function creak() {
    const r1 = biq('bp', rnd(600, 800), 8), r2 = biq('bp', rnd(1200, 1500), 10), D = rnd(0.35, 0.5);
    let ph = 0;
    return make(D, (t) => {
      ph += (35 + 70 * Math.sin(Math.PI * t / D)) * (1 + 0.3 * noise()) / ctx.sampleRate;
      const imp = ph >= 1 ? (ph -= 1, 1) : 0;
      return (r1(imp) + r2(imp) * 0.6) * Math.sin(Math.PI * t / D);
    });
  }
  function swish() {
    const f = svf(), latch = biq('bp', 2200, 3);
    return make(1, (t) => {
      const u = Math.min(1, t / 0.9), e = Math.sin(Math.PI * u) ** 2;
      return f(noise() * e, 300 + 1400 * Math.sin(Math.PI * u), 0.8) + latch(noise() * Math.exp(-Math.abs(t - 0.88) / 0.006)) * 0.8;
    });
  }
  function rattle() {   // slats knocking while the blind travels (1.6 s, the animation length) plus the cord
    const s1 = biq('bp', 3500, 3), s2 = biq('bp', 1800, 4), cord = biq('bp', 1200, 2);
    let k = 0;
    return make(1.7, (t) => {
      const e = env(t, 0, 1.65, 0.1, 0.25);
      if (Math.random() < 70 / ctx.sampleRate) k = rnd(0.4, 1);
      k *= 0.995;
      const n = noise();
      return s1(n * k * e) + s2(n * k * e) * 0.5 + cord(n * e * (0.5 + 0.5 * Math.sin(TAU * 24 * t))) * 0.15;
    });
  }
  function chime() {   // two-tone lift arrival bell
    const tone = (f, t) => t < 0 ? 0 : Math.exp(-t / 0.55) * (Math.sin(TAU * f * t) + 0.4 * Math.sin(TAU * f * 2 * t) * Math.exp(-t / 0.2) + 0.15 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t / 0.1));
    return make(2.2, (t) => tone(1318.5, t) * 0.8 + tone(1046.5, t - 0.42));
  }
  function slide() {   // lift doors gliding: a soft motor whirr, rollers on the track, a felt stop at the end
    const hum = biq('bp', 180, 2), roll = biq('bp', 1100, 1.5), stop = biq('lp', 140, 0.9);
    return make(1.15, (t) => {
      const e = env(t, 0, 1.0, 0.2, 0.3), n = noise();
      return hum(n * e) * 1.4 + Math.sin(TAU * 92 * t) * e * 0.05 + roll(n * e) * 0.12 + stop(n * Math.exp(-Math.abs(t - 1.0) / 0.02)) * 2;
    });
  }
  function build() {
    const n = (k, f) => Array.from({ length: k }, f);
    B = {
      key: n(8, () => key(false)), space: n(3, () => key(true)),
      step: n(6, () => step(false)), soft: n(6, () => step(true)),
      paddle: n(3, () => tock(false)), table: n(3, () => tock(true)),
      low: n(14, () => syllable(125)), high: n(14, () => syllable(205)),
      espresso: espresso(), creak: n(3, creak), swish: swish(), rattle: rattle(), chime: chime(), slide: slide(),
    };
    for (const [k, v] of Object.entries(B)) for (const b of [v].flat()) b.kind = k;
  }

  // ----- playback -----
  const inGlass = (x, z) => x > glass.minX && x < glass.maxX && z > glass.minZ && z < glass.maxZ;
  const near = (x, z) => Math.hypot(x - L.x, z - L.z) < CULL;
  let doorK = 0;
  function play(buf, x, y, z, gain = 1, rate = 1, when = 0) {
    if (!ctx || ctx.state !== 'running' || voices >= MAX_VOICES) return;
    const d = Math.hypot(x - L.x, z - L.z);
    if (d > CULL) return;
    const src = ctx.createBufferSource(), g = ctx.createGain(), pan = ctx.createPanner();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    pan.panningModel = d < 10 ? 'HRTF' : 'equalpower';
    pan.distanceModel = 'inverse'; pan.refDistance = 1.5; pan.rolloffFactor = 1.2; pan.maxDistance = CULL;
    if (pan.positionX) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; } else pan.setPosition(x, y, z);
    src.connect(g);
    let tail = g;
    // The glass office: muffled through the glass, less so with the door open.
    if (inGlass(x, z) !== inGlass(L.x, L.z)) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900 + 2600 * doorK; g.gain.value *= 0.5 + 0.35 * doorK;
      g.connect(lp); tail = lp;
    }
    tail.connect(pan); pan.connect(bus);
    voices++; played[buf.kind] = (played[buf.kind] || 0) + 1;
    src.onended = () => { voices--; src.disconnect(); pan.disconnect(); };
    src.start(ctx.currentTime + Math.max(0, when));
  }
  const onRug = (x, z) => rugs.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

  // ----- context, settings, visibility -----
  function roomTone() {   // HVAC: looping white noise, low-passed into a soft rumble plus a little air
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), air = ctx.createGain();
    src.buffer = make(2, noise); src.loop = true;
    lp.type = 'lowpass'; lp.frequency.value = 180; bp.type = 'bandpass'; bp.frequency.value = 450; bp.Q.value = 0.5;
    g.gain.value = 0.05; air.gain.value = 0.012;
    src.connect(lp).connect(g).connect(master); src.connect(bp).connect(air).connect(master);
    // The archive: a faint high air with a long, bright tail on everything (a big empty room), instead of the HVAC.
    const hi = ctx.createBiquadFilter(), void_ = ctx.createGain(), verb = ctx.createConvolver(), wet = ctx.createGain();
    hi.type = 'bandpass'; hi.frequency.value = 2400; hi.Q.value = 0.3; void_.gain.value = 0;
    src.connect(hi).connect(void_).connect(master);
    const SR = ctx.sampleRate, ir = ctx.createBuffer(2, SR * 3, SR);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = noise() * Math.exp(-i / SR / 0.7) * Math.min(1, i / (SR * 0.02)); }
    verb.buffer = ir; wet.gain.value = 0;
    bus.connect(verb).connect(wet).connect(master);
    // The roof: wind. A low roar all round that gusts, and a brighter rush off the nearest edge (placed in update).
    const wind = ctx.createBufferSource(), wlp = ctx.createBiquadFilter(), wbp = ctx.createBiquadFilter(), roar = ctx.createGain(), rush = ctx.createGain(), edge = ctx.createPanner();
    wind.buffer = make(4, noise); wind.loop = true;
    wlp.type = 'lowpass'; wlp.frequency.value = 260; wbp.type = 'bandpass'; wbp.frequency.value = 900; wbp.Q.value = 0.7;
    roar.gain.value = rush.gain.value = 0;
    edge.panningModel = 'HRTF'; edge.distanceModel = 'inverse'; edge.refDistance = 2; edge.rolloffFactor = 0.8;
    wind.connect(wlp).connect(roar).connect(master); wind.connect(wbp).connect(rush).connect(edge).connect(master);
    src.start(); wind.start(ctx.currentTime + 1.3);   // offset, so the two loops of noise don't line up
    tone = { g, air, void_, wet, roar, rush, edge, wbp };
  }
  function applyAway() {
    if (!tone) return;
    const at = (n, v) => n.gain.setTargetAtTime(v, ctx.currentTime, 0.25), arch = away && away !== 'roof';
    at(tone.g, away ? 0 : 0.05); at(tone.air, away ? 0 : 0.012); at(tone.void_, arch ? 0.006 : 0); at(tone.wet, arch ? 0.35 : 0);
    if (away !== 'roof') { at(tone.roar, 0); at(tone.rush, 0); }
  }
  function windFx(t) {   // gusts: two slow sines beating; the rush comes from the point on the edge nearest you
    const gust = 0.55 + 0.45 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1.3), now = ctx.currentTime;
    tone.roar.gain.setTargetAtTime(0.035 * (0.4 + 0.6 * gust), now, 0.3);
    tone.rush.gain.setTargetAtTime(0.06 * gust, now, 0.3);
    tone.wbp.frequency.setTargetAtTime(650 + 650 * gust, now, 0.5);
    const d = [[L.x - roof.minX, roof.minX, L.z], [roof.maxX - L.x, roof.maxX, L.z], [L.z - roof.minZ, L.x, roof.minZ], [roof.maxZ - L.z, L.x, roof.maxZ]].sort((a, b) => a[0] - b[0])[0];
    const [, x, z] = d, e = tone.edge;
    if (e.positionX) { e.positionX.value = x; e.positionY.value = L.y; e.positionZ.value = z; } else e.setPosition(x, L.y, z);
  }
  function liftHum(on) {   // the car's motor and the air in the shaft while you ride
    humOn = on;
    if (!ctx) return;
    if (!hum) {
      const SR = ctx.sampleRate, b = ctx.createBuffer(1, SR * 2, SR), d = b.getChannelData(0), lp = biq('lp', 220, 0.7);
      for (let i = 0; i < d.length; i++) { const t = i / SR; d[i] = 0.5 * Math.sin(TAU * 55 * t) + 0.25 * Math.sin(TAU * 110 * t) + 0.08 * Math.sin(TAU * 165 * t) + lp(noise()) * 2.5; }
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
      hum = ctx.createGain(); hum.gain.value = 0;
      src.connect(hum).connect(master); src.start();
    }
    hum.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, on ? 0.5 : 0.25);
  }
  function unlock() {
    if (!dash.sound.on) return;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      bus = ctx.createGain(); bus.connect(master);
      build(); roomTone(); apply(); applyAway(); if (humOn) liftHum(true);
    }
    sync();
  }
  function sync() {
    if (!ctx) return;
    const want = active && !document.hidden && dash.sound.on;
    if (want && ctx.state === 'suspended') ctx.resume();
    else if (!want && ctx.state === 'running') ctx.suspend();
  }
  function apply() {
    if (!ctx) return;
    const v = dash.sound.on ? (dash.sound.volume / 100) ** 1.5 : 0;
    master.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
    sync();
  }
  dash.soundListeners.add(apply);
  document.addEventListener('visibilitychange', sync);

  // ----- per frame -----
  function stateOf(p) {
    let s = st.get(p);
    if (!s) {
      const f = (p.phase * 13.7) % 1;
      s = { walking: p.path.length > 0, pose: p.spot?.pose, stepN: null, next: 0, burst: 0, gap: 0.075 + 0.08 * f, coffeeAt: 0,
        voice: Math.floor(p.phase * 7) % 2 ? 'high' : 'low', pitch: 0.9 + 0.22 * ((p.phase * 3.1) % 1) };
      st.set(p, s);
    }
    return s;
  }
  function typing(p, s, t, busy) {
    const pos = p.root.position, fx = pos.x + Math.sin(p.rotY) * 0.45, fz = pos.z + Math.cos(p.rotY) * 0.45;
    if (s.next < t - 1) s.next = t + rnd(0, 0.5);
    while (s.next < t + look) {
      if (s.burst > 0) {
        s.burst--;
        const sp = s.burst === 0 ? Math.random() < 0.3 : Math.random() < 0.1;
        play(sp ? pick(B.space) : pick(B.key), fx, 0.76, fz, rnd(0.18, 0.32) * (sp ? 1.2 : 1), rnd(0.92, 1.1), s.next - t);
        s.next += s.gap * rnd(0.6, 1.6) / (busy ? 1.35 : 1);
      } else {
        s.burst = Math.round(busy ? rnd(8, 28) : rnd(3, 12));
        s.next += busy ? rnd(0.2, 1.1) : rnd(0.8, 4);
      }
    }
  }
  function talk(group, t) {
    const key = group.map((p) => p.id).sort().join('|');
    let c = convs.get(key);
    if (!c) convs.set(key, c = { group, who: Math.floor(Math.random() * group.length), left: 0, len: 0, next: t + rnd(0.5, 2) });
    c.group = group; c.seen = t;
    if (c.next < t - 1) c.next = t;
    while (c.next < t + look) {
      if (c.left > 0) {
        const p = c.group[c.who % c.group.length], s = stateOf(p), pos = p.root.position, i = c.len - c.left--;
        const contour = (1.06 - 0.12 * i / c.len) * (c.left === 0 && c.ask ? 1.15 : 1) * rnd(0.96, 1.04);
        const b = pick(B[s.voice]), rate = s.pitch * contour;
        play(b, pos.x, s.pose === 'chat' ? 1.6 : 1.15, pos.z, rnd(0.2, 0.32), rate, c.next - t);
        c.next += (b.duration - 0.05) / rate + (Math.random() < 0.15 ? rnd(0.08, 0.2) : rnd(0, 0.04));
      } else {
        if (Math.random() < 0.8 || c.group.length < 2) c.who = (c.who + 1 + Math.floor(Math.random() * (c.group.length - 1))) % c.group.length;
        c.len = c.left = Math.round(rnd(3, 13)); c.ask = Math.random() < 0.15;
        c.next += Math.random() < 0.15 ? rnd(2.5, 6) : rnd(0.3, 1.3);
      }
    }
  }
  function groups(people) {   // settled talkers within 3.2 m of each other
    const talkers = people.filter((p) => !p.path.length && TALK.has(p.spot?.pose)), out = [], seen = new Set();
    for (const p of talkers) {
      if (seen.has(p)) continue;
      const g = [p]; seen.add(p);
      for (let i = 0; i < g.length; i++) for (const q of talkers) if (!seen.has(q) && g[i].root.position.distanceTo(q.root.position) < 3.2) { g.push(q); seen.add(q); }
      if (g.length > 1) out.push(g);
    }
    return out;
  }
  let talkGroups = [];
  function update(t, dt, { people, door, blinds, free }) {
    if (!ctx || ctx.state !== 'running') return;
    camera.getWorldPosition(L); camera.getWorldDirection(fwd);
    const li = ctx.listener;
    if (li.positionX) {
      li.positionX.value = L.x; li.positionY.value = L.y; li.positionZ.value = L.z;
      li.forwardX.value = fwd.x; li.forwardY.value = fwd.y; li.forwardZ.value = fwd.z; li.upX.value = 0; li.upY.value = 1; li.upZ.value = 0;
    } else { li.setPosition(L.x, L.y, L.z); li.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
    doorK = door.k; look = 0.06 + clampLook(t - lastT) * 1.5; lastT = t;   // schedule past the next frame, even a slow one
    if (away === 'roof' && tone && roof) windFx(t);
    const now = performance.now(), list = away ? [] : [...people.values()];
    for (const p of list) {
      const s = stateOf(p), pos = p.root.position, walking = p.path.length > 0, pose = p.spot?.pose;
      if (p.root.scale.x < 0.5 || !near(pos.x, pos.z)) { Object.assign(s, { walking, pose, stepN: null }); continue; }
      if (walking) {
        const n = Math.floor((p.walkPhase - Math.PI / 2) / Math.PI);
        if (s.stepN !== null && n !== s.stepN) { const soft = onRug(pos.x, pos.z); play(pick(soft ? B.soft : B.step), pos.x, 0.05, pos.z, soft ? 0.07 : 0.11, rnd(0.9, 1.1)); }
        s.stepN = n;
      } else s.stepN = null;
      if (walking !== s.walking) {
        const seat = walking ? s.pose : pose;   // getting up from, or sitting down on
        if (SEATED.has(seat)) play(pick(B.creak), pos.x, 0.5, pos.z, seat === 'type' || seat === 'wait' ? 0.22 : 0.12, rnd(0.8, 1.15));
        if (!walking && pose === 'coffee') s.coffeeAt = t + rnd(0.6, 1.6);
      }
      if (pose === 'coffee' && !s.coffeeAt) s.coffeeAt = t + rnd(2, 15);
      s.walking = walking; s.pose = pose;
      if (walking) continue;
      if (pose === 'type') {
        const d = p.desk, busy = (d?.codeAnim && now - d.codeAnim.start < d.codeAnim.dur) || !!p.session?.transcript?.pendingTool;
        typing(p, s, t, busy);
      } else if (pose === 'wait') {   // the odd mouse click while waiting
        if (s.next < t) { if (s.next) play(pick(B.key), pos.x + Math.sin(p.rotY) * 0.45, 0.76, pos.z + Math.cos(p.rotY) * 0.45, 0.08, 1.5); s.next = t + rnd(3, 12); }
      } else if (pose === 'coffee' && s.coffeeAt && t > s.coffeeAt && t > machineFree) {
        play(B.espresso, coffee.x, coffee.y, coffee.z, 0.5, rnd(0.97, 1.03));
        coffee.onBrew?.();
        machineFree = t + 7.5; s.coffeeAt = t + rnd(50, 110);
      }
    }
    if (t > groupsAt) { talkGroups = groups(list); groupsAt = t + 1; }
    for (const g of talkGroups) if (near(g[0].root.position.x, g[0].root.position.z)) talk(g, t);
    for (const [k, c] of convs) if (t - c.seen > 2) convs.delete(k);
    // Your own steps, quieter, while walking in free mode.
    const moved = Math.hypot(L.x - lastCam.x, L.z - lastCam.z) / Math.max(dt, 1e-3);
    lastCam.copy(L);
    if (free && moved > 1.5 && moved < 15) {
      stepAcc += dt;
      if (stepAcc > (moved > 6 ? 0.3 : 0.42)) { stepAcc = 0; const soft = !away && onRug(L.x, L.z); play(pick(soft ? B.soft : B.step), L.x, 0.05, L.z - 0.01, soft ? 0.03 : 0.045, rnd(0.95, 1.1)); }
    } else stepAcc = 0.3;
    // Door and blinds: a sound whenever their target changes (clicks here or anywhere else).
    if (!away && lastDoor !== null && door.to !== lastDoor) play(B.swish, doorPos.x, 1.1, doorPos.z, 0.4, door.to ? 1 : 0.9);
    lastDoor = door.to;
    for (const b of Object.values(blinds)) {
      if (!away && lastBlinds[b.key] !== undefined && lastBlinds[b.key] !== b.to) for (const r of b.runs) {   // one rattle per run, from its window nearest you
        let best = null, bd = Infinity;
        for (const [x] of r.cells || [[0]]) { const v = r.slats.localToWorld(_w.set(x, 2.2, 0)), d = v.distanceToSquared(L); if (d < bd) { bd = d; best = v.clone(); } }
        play(B.rattle, best.x, best.y, best.z, 0.25, rnd(0.95, 1.05));
      }
      lastBlinds[b.key] = b.to;
    }
    if (!rallySeen) prevK = null;
    rallySeen = false;
  }
  // Ping pong: k runs 0..2 over a rally (0..1 a→b, 1..2 b→a). Paddle hits at k = 0 and 1, the bounce partway along each half.
  const BOUNCE = (Math.PI - 0.1) / (Math.PI * 1.5);
  function rally(k, ball) {
    rallySeen = true;
    if (!ctx || ctx.state !== 'running' || away) return;
    if (prevK !== null) {
      const ph = prevK % 1, u = k % 1;
      if (k < prevK || (prevK < 1 && k >= 1)) play(pick(B.paddle), ball.x, ball.y, ball.z, 0.16, rnd(0.95, 1.05));
      else if (ph < BOUNCE && u >= BOUNCE) play(pick(B.table), ball.x, 0.78, ball.z, 0.13, rnd(0.95, 1.05));
    }
    prevK = k;
  }
  return {
    unlock,
    setActive(on) { active = on; if (on && navigator.userActivation?.hasBeenActive) unlock(); else sync(); },
    update, rally,
    // `mine`: your own car, the only lift you can hear from the archive.
    ding(at = lift, mine) { if (!away || mine) play(B?.chime, at.x, 2.4, at.z, 0.35); },
    espresso() { if (!away) play(B?.espresso, coffee.x, coffee.y, coffee.z, 0.5); machineFree = lastT + 7.5; },
    slide(at = lift, mine) { if (!away || mine) play(B?.slide, at.x, 1.2, at.z, 0.22, rnd(0.95, 1.05)); },
    setAway(on, kind) { away = on && (kind || true); applyAway(); }, hum: liftHum,
    get ready() { return !!ctx && ctx.state; },
    get voices() { return voices; }, played, get buffers() { return B; },
  };
}
