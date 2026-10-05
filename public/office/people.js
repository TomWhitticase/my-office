// People: the figure every session (and John) is drawn as, its poses, and walking along a path.

import * as THREE from 'three';
import { F, angDiff, box, clamp, cyl, damp, hash, makeCanvas, mat } from './util.js';
import { titleOf } from '../chat.js';
import { drawLabel } from './painters.js';

// ---------- people ----------
export const SKIN = ['#f1c7a5', '#e0ac85', '#c68863', '#a0674a', '#7a4a33', '#ffdbbf'];
export const HAIR = ['#2b1d14', '#4a3121', '#8a5a2b', '#c9a15a', '#1a1a1a', '#a33b20', '#d8d0c4'];
export const PANTS = ['#2d3340', '#3b3f47', '#1f2a44', '#4a4038', '#28323a'];
export const G = {
  thigh: new THREE.CapsuleGeometry(0.068, 0.3, 4, 10), shin: new THREE.CapsuleGeometry(0.056, 0.3, 4, 10),
  shoe: new THREE.BoxGeometry(0.1, 0.07, 0.24), hips: new THREE.BoxGeometry(0.33, 0.16, 0.21),
  torso: new THREE.CapsuleGeometry(0.17, 0.3, 6, 14), neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10),
  head: new THREE.SphereGeometry(0.115, 20, 16), eye: new THREE.SphereGeometry(0.016, 8, 6),
  hairCap: new THREE.SphereGeometry(0.124, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairLong: new THREE.BoxGeometry(0.22, 0.26, 0.07), bun: new THREE.SphereGeometry(0.055, 12, 10),
  upperArm: new THREE.CapsuleGeometry(0.048, 0.2, 4, 8), foreArm: new THREE.CapsuleGeometry(0.042, 0.18, 4, 8),
  hand: new THREE.SphereGeometry(0.045, 10, 8),
};

export class Person {
  constructor(id, colorHex) {
    this.id = id;
    this.color = colorHex;
    this.phase = (hash(id) % 1000) / 100;
    const h = hash(id);
    const skinM = mat(SKIN[h % SKIN.length], { roughness: 0.7 }), hairM = mat(HAIR[(h >>> 3) % HAIR.length], { roughness: 0.95 });
    const pantsM = mat(PANTS[(h >>> 6) % PANTS.length]), shirtM = mat(colorHex, { roughness: 0.9 }), shoeM = mat('#222222', { roughness: 0.6 });
    const style = (h >>> 9) % 4;
    this.root = new THREE.Group();
    this.root.userData.sessionId = id;
    this.body = new THREE.Group(); this.root.add(this.body);
    const add = (parent, geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.userData.sessionId = id;
      parent.add(mesh); return mesh;
    };
    // index 0 = right side (-x, since people face +z), 1 = left
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group(); hip.position.set(0.095 * side, 0.9, 0); this.body.add(hip);
      add(hip, G.thigh, pantsM, 0, -0.22, 0);
      const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
      add(knee, G.shin, pantsM, 0, -0.2, 0);
      add(knee, G.shoe, shoeM, 0, -0.42, 0.045);
      return { hip, knee };
    });
    add(this.body, G.hips, pantsM, 0, 0.92, 0);
    this.upper = new THREE.Group(); this.upper.position.y = 0.9; this.body.add(this.upper);
    add(this.upper, G.torso, shirtM, 0, 0.3, 0).scale.set(1.12, 1, 0.72);
    add(this.upper, G.neck, skinM, 0, 0.55, 0);
    this.head = new THREE.Group(); this.head.position.y = 0.7; this.upper.add(this.head);
    add(this.head, G.head, skinM, 0, 0, 0);
    add(this.head, G.eye, mat('#1b1b1b'), 0.042, 0.015, 0.103);
    add(this.head, G.eye, mat('#1b1b1b'), -0.042, 0.015, 0.103);
    add(this.head, G.hairCap, hairM, 0, 0.012, -0.008).rotation.x = -0.3;
    if (style === 1) add(this.head, G.hairLong, hairM, 0, -0.1, -0.07);
    if (style === 2) add(this.head, G.bun, hairM, 0, 0.07, -0.11);
    this.arms = [-1, 1].map((side) => {
      const sh = new THREE.Group(); sh.position.set(0.215 * side, 0.5, 0); sh.rotation.order = 'YXZ'; this.upper.add(sh);   // YXZ: raise forward, then swing in
      add(sh, G.upperArm, shirtM, 0, -0.14, 0);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      add(el, G.foreArm, skinM, 0, -0.12, 0);
      const hand = new THREE.Group(); hand.position.y = -0.26; el.add(hand);
      add(hand, G.hand, skinM, 0, 0, 0);
      return { sh, el, hand, side };
    });
    // A phone for waiting at the desk: dark slab with a lit screen, held in the right hand.
    this.phone = new THREE.Group();
    box(this.phone, 0.075, 0.15, 0.012, '#1a1b1e', 0, 0, 0, { shadow: false });
    box(this.phone, 0.064, 0.13, 0.002, '', 0, 0, 0.007, { material: mat('#9fd0ff', { emissive: '#7fb8ff', emissiveIntensity: 0.9 }), shadow: false });
    this.phone.position.set(0, -0.06, 0.05); this.phone.rotation.x = -0.5; this.phone.visible = false;
    this.mug = new THREE.Group();
    cyl(this.mug, 0.04, 0.035, 0.1, '#f4f1ea', 0, 0, 0);
    cyl(this.mug, 0.036, 0.036, 0.005, '#4a2c1a', 0, 0.046, 0, { shadow: false });
    this.mug.position.set(0, -0.03, 0.06); this.mug.rotation.x = Math.PI / 2; this.mug.visible = false;
    this.arms[0].hand.add(this.mug, this.phone);
    this.paddle = new THREE.Group();
    cyl(this.paddle, 0.075, 0.075, 0.012, '#c0392b', 0, 0.12, 0, { seg: 20 }).rotation.x = Math.PI / 2;
    cyl(this.paddle, 0.015, 0.015, 0.1, '#c8a46a', 0, 0.03, 0);
    this.paddle.rotation.x = Math.PI; this.paddle.visible = false;
    this.arms[0].hand.add(this.paddle);

    this.lab = makeCanvas(512, 128);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.lab.tex, depthWrite: false, transparent: true }));
    this.label.scale.set(1.1, 0.275, 1);
    this.label.position.y = 2.1;
    this.label.userData.sessionId = id;
    this.label.layers.set(1);
    this.root.add(this.label);

    this.j = { bodyY: 0, lean: 0, leg0: 0, leg1: 0, knee0: 0, knee1: 0, sh0: 0, sh1: 0, shz0: -0.07, shz1: 0.07, shy0: 0, shy1: 0, el0: -0.15, el1: -0.15, headY: 0, headX: 0 };
    this.path = [];
    this.spot = null;
    this.desk = null;
    this.rotY = 0;
    this.walkPhase = 0;
    this.labelKey = '';
  }

  place(spot) {
    this.root.position.set(spot.pos.x, 0, spot.pos.z);
    this.rotY = spot.rotY;
    this.path = [];
  }

  targets(t) {
    const ph = this.phase, j = { bodyY: 0, lean: 0.02 * Math.sin(t * 1.3 + ph), leg0: 0, leg1: 0, knee0: 0, knee1: 0,
      sh0: 0, sh1: 0, shz0: -0.07, shz1: 0.07, shy0: 0, shy1: 0, el0: -0.15, el1: -0.15, headY: 0, headX: 0 };
    this.mug.visible = false; this.paddle.visible = false; this.phone.visible = false;
    if (this.path.length) {
      const w = this.walkPhase;
      Object.assign(j, { leg0: 0.5 * Math.sin(w), leg1: -0.5 * Math.sin(w), knee0: 0.1 + 0.55 * Math.max(0, Math.sin(w + 1.6)),
        knee1: 0.1 + 0.55 * Math.max(0, Math.sin(w + 1.6 + Math.PI)), sh0: -0.4 * Math.sin(w), sh1: 0.4 * Math.sin(w),
        el0: -0.35, el1: -0.35, bodyY: -0.02 * Math.abs(Math.cos(w)), lean: 0.05 });
      return j;
    }
    const sit = (seat) => Object.assign(j, { bodyY: seat - 0.9, leg0: -1.5, leg1: -1.5, knee0: 1.5, knee1: 1.5 });
    switch (this.spot?.pose) {
      case 'type': {   // forearms resting on the desk edge, hands angled in onto the keyboard, fingers tapping
        sit(0.47);
        const tap = (k) => 0.045 * Math.max(0, Math.sin(t * (15 + k * 2.3) + ph + k * 1.7));
        Object.assign(j, { lean: 0.04, sh0: -1.0, sh1: -1.0, shz0: 0.02, shz1: -0.02, shy0: 0.2, shy1: -0.2, headX: 0.14, headY: 0.04 + 0.12 * Math.sin(t * 0.45 + ph),
          el0: -0.67 + tap(0), el1: -0.67 + tap(1) });
        break;
      }
      case 'wait':   // at the desk but the session is waiting (on a shell, a prompt…): see waitStyle()
        sit(0.47);
        if (this.waitStyle() === 'lean')        // leaning right back, hands behind the head
          Object.assign(j, { lean: -0.38, sh0: -2.75, sh1: -2.75, shz0: -0.55, shz1: 0.55, el0: -2.0, el1: -2.0, headX: -0.18, headY: 0.15 * Math.sin(t * 0.3 + ph) });
        else if (this.waitStyle() === 'phone') { // slouched, scrolling a phone held up in front
          this.phone.visible = true;
          Object.assign(j, { lean: 0.05, sh0: -0.85, el0: -1.55 + 0.05 * Math.sin(t * 6 + ph), shz0: 0.12, sh1: -0.7, el1: -1.5, shz1: -0.05, headX: 0.38, headY: -0.08 });
        } else                                   // spinning the chair like a kid: legs up, arms out
          Object.assign(j, { lean: -0.2, leg0: -1.15, leg1: -1.15, knee0: 0.55, knee1: 0.55, sh0: -0.3, sh1: -0.3, shz0: -0.9, shz1: 0.9, el0: -0.2, el1: -0.2, headX: -0.1 });
        break;
      case 'sofa':
        sit(0.53);
        Object.assign(j, { lean: -0.25, leg0: -1.5, leg1: -1.5, knee0: 1.45, knee1: 1.45, sh0: -0.15, sh1: -0.15, el0: -0.9, el1: -0.9,
          headY: 0.5 * Math.sin(t * 0.25 + ph), headX: -0.05 });
        break;
      case 'beanbag':
        sit(0.3);
        Object.assign(j, { lean: -0.45, leg0: -1.2, leg1: -1.2, knee0: 0.8, knee1: 0.8, sh0: 0.1, sh1: 0.1, shz0: -0.3, shz1: 0.3, el0: -0.4, el1: -0.4,
          headY: 0.3 * Math.sin(t * 0.2 + ph) });
        break;
      case 'coffee': {
        this.mug.visible = true;
        const sip = (t + ph) % 7 < 1.6;
        Object.assign(j, { sh0: sip ? -0.9 : -0.25, el0: sip ? -2.2 : -1.5, headX: sip ? -0.15 : 0.05 * Math.sin(t + ph), headY: 0.25 * Math.sin(t * 0.4 + ph) });
        break;
      }
      case 'stool': {   // perched at the kitchen island with a coffee, the other forearm on the worktop
        sit(0.69);
        this.mug.visible = true;
        const sip = (t + ph) % 8 < 1.6;
        Object.assign(j, { lean: 0.08, knee0: 1.25, knee1: 1.4, sh0: sip ? -0.9 : -0.6, el0: sip ? -2.2 : -1.3, sh1: -0.55, el1: -1.0, shz1: 0.12,
          headX: sip ? -0.15 : 0.05, headY: 0.3 * Math.sin(t * 0.3 + ph) });
        break;
      }
      case 'fridge':   // browsing the drinks fridge, one hand on the shelf
        Object.assign(j, { sh0: -1.15 + 0.1 * Math.sin(t * 1.3 + ph), el0: -0.35, shz0: 0.1, headX: 0.12, headY: 0.35 * Math.sin(t * 0.5 + ph) });
        break;
      case 'chat':
        Object.assign(j, { sh0: -0.35 - 0.25 * (0.5 + 0.5 * Math.sin(t * 2.1 + ph)), el0: -1.2 + 0.3 * Math.sin(t * 3.3 + ph),
          sh1: -0.05, el1: -0.25, headX: 0.08 * Math.sin(t * 1.7 + ph), headY: 0.2 * Math.sin(t * 0.5 + ph) });
        break;
      case 'meeting':   // seated round a meeting-room table, forearms on it, one hand gesturing
        sit(0.47);
        Object.assign(j, { lean: 0.06, sh0: -0.55 - 0.25 * (0.5 + 0.5 * Math.sin(t * 1.9 + ph)), el0: -1.2 + 0.25 * Math.sin(t * 2.7 + ph), sh1: -0.5, el1: -1.0,
          shz0: -0.1, shz1: 0.12, headX: 0.04 * Math.sin(t * 1.3 + ph), headY: 0.35 * Math.sin(t * 0.35 + ph) });
        break;
      case 'press':   // calling the lift: reach for the button, then wait
        if (t - this.pressAt < 1.1) Object.assign(j, { sh0: -1.25, el0: -0.25, shz0: 0.1, headX: 0.1 });
        break;
      case 'pingpong': {
        this.paddle.visible = true;
        const swing = this.swing || 0;
        Object.assign(j, { bodyY: -0.05, leg0: -0.35, leg1: -0.35, knee0: 0.5, knee1: 0.5, lean: 0.25,
          sh0: -0.6 - 0.8 * swing, el0: -0.9 + 0.3 * swing, sh1: -0.2, el1: -0.6 });
        break;
      }
    }
    return j;
  }

  update(t, dt) {
    this.time = t;
    if (this.path.length) {
      const target = this.path[0], p = this.root.position;
      const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz), step = 1.4 * dt;
      if (d <= step) { p.x = target.x; p.z = target.z; this.path.shift(); }
      else { p.x += (dx / d) * step; p.z += (dz / d) * step; this.rotY += angDiff(this.rotY, Math.atan2(dx, dz)) * Math.min(1, dt * 10); }
      this.walkPhase += dt * 8;
      if (!this.path.length) this.onArrive?.();
    } else if (this.spot) {
      if (this.spot.pose === 'wait' && this.waitStyle() === 'spin') this.rotY += dt * 2.4;
      else this.rotY += angDiff(this.rotY, this.spot.rotY) * Math.min(1, dt * 6);
    }
    this.root.rotation.y = this.rotY;
    const tg = this.targets(t), j = this.j;
    if (this.lookAt) { const p = this.root.position; tg.headY = clamp(angDiff(this.rotY, Math.atan2(this.lookAt.x - p.x, this.lookAt.z - p.z)), -1.1, 1.1); tg.headX = 0; }   // you're talking to them
    for (const k in tg) j[k] = damp(j[k], tg[k], 9, dt);
    this.body.position.y = j.bodyY;
    this.upper.rotation.x = j.lean;
    this.legs[0].hip.rotation.x = j.leg0; this.legs[1].hip.rotation.x = j.leg1;
    this.legs[0].knee.rotation.x = j.knee0; this.legs[1].knee.rotation.x = j.knee1;
    this.arms[0].sh.rotation.x = j.sh0; this.arms[1].sh.rotation.x = j.sh1;
    this.arms[0].sh.rotation.z = j.shz0; this.arms[1].sh.rotation.z = j.shz1;
    this.arms[0].sh.rotation.y = j.shy0; this.arms[1].sh.rotation.y = j.shy1;
    this.arms[0].el.rotation.x = j.el0; this.arms[1].el.rotation.x = j.el1;
    this.head.rotation.y = j.headY; this.head.rotation.x = j.headX;
    this.label.position.y = 2.1 + j.bodyY;
  }

  // Each waiting stretch picks one way to kill time, so the same person varies but doesn't flip mid-wait.
  waitStyle() {
    const s = this.session;
    return ['lean', 'phone', 'spin'][hash(`${s?.sessionId}|${s?.statusSince}`) % 3];
  }

  setLabel(s) {
    const key = [titleOf(s), s.status, s.transcript?.pendingTool?.name, F.usd(s.cost), s.subagents.active, s.status === 'idle' ? F.dur(Date.now() - s.statusSince) : ''].join('|');
    if (key === this.labelKey) return;
    this.labelKey = key;
    drawLabel(this.lab, s, this.color);
    this.lab.tex.needsUpdate = true;
  }
}

