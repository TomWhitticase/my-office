// You, as the security cameras see you: a Person (people.js) in the owner's colours with a name tag, following the player
// every frame: walking or running, sitting in whatever you sat in (typing at your own desk), in the helicopter's pilot
// seat, along on other floors. Its meshes are on ME_LAYER, which only the cameras' feeds draw (cctv.js): never your own
// view, nor hover's rays. No shadow: the office's shadow map is drawn from your view.

import * as THREE from 'three';
import { angDiff, clamp, dash, FONT, fit, ME_LAYER, rng } from '../util.js';
import { Person } from '../people.js';

const SHIRT = '#d97757';
const ME = 'owner-you';

class Avatar extends Person {
  // Walking at your pace (and running), and two poses of its own: an easy sit in a chair, and flying.
  targets(t) {
    if (this.moving) {
      const w = this.walkPhase, a = this.running ? 0.85 : 0.55;
      this.mug.visible = false; this.paddle.visible = false; this.phone.visible = false;
      return { bodyY: -0.03 * Math.abs(Math.cos(w)), lean: this.running ? 0.18 : 0.05, leg0: a * Math.sin(w), leg1: -a * Math.sin(w),
        knee0: 0.1 + (a + 0.1) * Math.max(0, Math.sin(w + 1.6)), knee1: 0.1 + (a + 0.1) * Math.max(0, Math.sin(w + 1.6 + Math.PI)),
        sh0: -0.8 * a * Math.sin(w), sh1: 0.8 * a * Math.sin(w), shz0: -0.07, shz1: 0.07, shy0: 0, shy1: 0,
        el0: this.running ? -1.3 : -0.35, el1: this.running ? -1.3 : -0.35, headY: 0, headX: 0 };
    }
    const pose = this.spot?.pose, j = super.targets(t);
    const sit = (h) => Object.assign(j, { bodyY: h - 0.9, leg0: -1.5, leg1: -1.5, knee0: 1.5, knee1: 1.5 });
    if (pose === 'sit') Object.assign(sit(0.47), { lean: 0.02, sh0: -0.45, sh1: -0.45, el0: -0.9, el1: -0.9, shz0: 0.1, shz1: -0.1 });
    if (pose === 'pilot') Object.assign(sit(0.9), { leg0: -1.25, leg1: -1.25, knee0: 1.0, knee1: 1.0, lean: -0.05, sh0: -0.75, sh1: -0.55, el0: -0.7, el1: -0.8 });
    return j;
  }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
export function install(ctx) {
  // Its own seeded Math.random (three's uuids), so it doesn't shift the draws made after it (see helicopter.js).
  const random = Math.random;
  Math.random = rng(4949);
  try { build(ctx); } finally { Math.random = random; }
}

/** @param {import('../ctx.js').OfficeCtx} ctx */
function build(ctx) {
  const { world, OWNER, seatedPose } = ctx;
  const me = new Avatar(ME, SHIRT);
  me.root.traverse((o) => { o.layers.set(ME_LAYER); if (o.isMesh) o.castShadow = false; });
  delete me.root.userData.sessionId;
  // The name tag: your name, as on the office's door.
  let named = '';
  function nameTag() {
    const name = dash.config?.owner || 'You';
    if (name === named) return;
    named = name;
    const { ctx: c, W, H } = me.lab;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(15,16,19,0.82)'; c.beginPath(); c.roundRect(4, 4, W - 8, H - 8, 22); c.fill();
    c.fillStyle = SHIRT; c.beginPath(); c.arc(36, 64, 11, 0, Math.PI * 2); c.fill();
    c.font = `700 40px ${FONT}`; c.fillStyle = '#fff'; c.fillText(fit(c, name, W - 80), 58, 78);
    me.lab.tex.needsUpdate = true;
  }
  me.spot = { pose: null, rotY: 0 };
  const last = new THREE.Vector3(), at = new THREE.Vector3();
  let parent = null;
  const seatPose = (st) => (!st ? 'type' : /Sofa|Armchair/.test(st.name) ? 'sofa' : st.name === 'Stool' ? 'stool' : 'sit');

  ctx.onFrame((dt, t) => {
    const p = ctx.player, H = ctx.heli, F = ctx.away, mode = ctx.mode;
    nameTag();
    let into = F?.scene || world, rotY = p.yaw + Math.PI, pose = null;
    if (H?.S.aboard && H.S.cam !== 'out') {   // in the pilot's seat (right-hand, facing the nose: -z in the body)
      into = H.body; at.set(0.33, 0, 0.12); rotY = Math.PI; pose = 'pilot';
    } else if (!ctx.active || mode === 'intro' || mode === 'outro') {   // at your computer (or MacBook), full screen
      const s = seatedPose();
      if (s.seat) { at.set(s.seat.x, 0, s.seat.z); rotY = s.seat.rotY; pose = seatPose(s.seat); }
      else { at.set(OWNER.x, 0, OWNER.z + 1.1); rotY = Math.PI; pose = 'type'; }
      into = world;
    } else if (p.seated) {
      const st = p.seat;
      if (st) { at.set(st.x, 0, st.z); rotY = st.rotY; } else { at.set(OWNER.x, 0, OWNER.z + 1.1); rotY = Math.PI; }
      pose = seatPose(st);
      at.y = F?.y || 0;
    } else {
      at.set(p.x, (F?.y || 0) + (p.fy || 0), p.z);
      // where you are is your eyes: stand a little behind them
      at.x += Math.sin(p.yaw) * 0.08; at.z += Math.cos(p.yaw) * 0.08;
    }
    if (into !== parent) { into.add(me.root); parent = into; last.copy(at); }
    // Walking: how far you've come since the last frame (a jump is a teleport).
    const d = Math.hypot(at.x - last.x, at.z - last.z), v = dt > 0 ? d / dt : 0;
    me.moving = !pose && d < 1 && v > 0.4;
    me.running = me.moving && v > 6;
    if (me.moving) me.walkPhase += dt * clamp(v * 2.4, 6, 16);
    last.copy(at);
    me.root.position.copy(at);
    me.spot.pose = pose; me.spot.rotY = rotY;
    me.rotY += angDiff(me.rotY, rotY);   // face exactly where you face
    me.update(t, dt);
  }, 87);   // after the player moves (80) and the helicopter flies (85)

  Object.assign(ctx, { me });
}
