// Golden screenshots: the office at fixed poses and a fixed sim time, against the fixture sessions. Each shot is compared
// with test/golden/<name>.png (or recorded with --record). Every pose gets a page of its own, so --only renders just the
// shots it names.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/server.mjs';
import { openOffice } from './lib/browser.mjs';
import { T0, SESSION_IDS } from './lib/fixtures.mjs';

const GOLDEN = path.join(ROOT, 'test', 'golden'), OUT = path.join(ROOT, 'test', 'out');

// Stand at (x, z) looking at `at` (as the 1–5 teleports do), on your feet.
const stand = (o, x, z, at, extra = {}) => o.eval(([x, z, at, extra]) => {
  const p = window.__office.player, eye = extra.eye ?? 1.65;
  Object.assign(p, { x, z, eye, seated: false, seat: null, fy: 0, yaw: Math.atan2(-(at.x - x), -(at.z - z)), pitch: Math.atan2(at.y - eye, Math.hypot(at.x - x, at.z - z)) }, extra);
}, [x, z, at, extra]);
const until = (o, fn, arg) => o.page.waitForFunction(fn, arg, { timeout: 60000, polling: 50 });
// Frames until a condition holds in the page (at most `max`).
async function stepUntil(o, fn, max = 80) {
  for (let i = 0; i < max; i++) { if (await o.eval(fn)) return; await o.step(1); }
  throw new Error(`still waiting after ${max} frames: ${fn}`);
}

// The intro's first frame (your desktop filling the view), then the pull back to your chair, the crosshair showing as if
// you'd clicked in (pointer lock can't be had headless).
const intro = (o) => o.step(1, 16);
async function arrive(o) {
  await intro(o);
  await o.step(1, 400); await o.step(1, 2700);
  await stepUntil(o, () => window.__office.mode === 'free');
  await o.eval(() => document.querySelector('.of-hud').classList.add('of-locked'));
}
// Down (or up) to floor n in your car, its doors open.
async function ride(o, n) {
  await o.eval((n) => window.__office.goFloor(n), n);
  await stepUntil(o, () => window.__office.mine.L?.state === 'open', 80);
}
const DUSK = T0 + 7 * 3600e3 + 15 * 60e3;   // 21:45 in London
const dusk = (o) => o.eval((t) => window.__office.setTime(t), DUSK);
// Another pose's setup, as the start of this one.
const from = (name, o) => POSES.find((p) => p[0] === name)[1](o);

// [name, what to do before the shot]. Each pose starts from a freshly loaded office (a new page, Math.random seeded from
// the pose's name), so any of them can be shot alone, in any order, and look the same as in a full run. A pose that
// builds on another's state says so with from().
export const POSES = [
  ['desktop', intro],
  ['seated', async (o) => { await arrive(o); await o.step(2); }],
  ['desks', async (o) => { await arrive(o); await o.eval(() => window.__office.teleport('Digit1')); await o.step(3); }],
  ['breakroom', async (o) => { await arrive(o); await o.eval(() => window.__office.teleport('Digit2')); await o.step(3); }],
  ['lobby', async (o) => { await arrive(o); await o.eval(() => window.__office.teleport('Digit4')); await o.step(3); }],
  ['meeting-rooms', async (o) => { await arrive(o); await o.eval(() => window.__office.teleport('Digit5')); await o.step(3); }],
  ['kitchen', async (o) => { await arrive(o); await stand(o, -13, 10.5, { x: -18, y: 1.2, z: 14 }); await o.step(3); }],
  ['lounge', async (o) => { await arrive(o); await stand(o, 4.5, 8.5, { x: 12, y: 1.0, z: 10 }); await o.step(3); }],
  ['my-office', async (o) => { await arrive(o); await stand(o, 9, -6, { x: 16, y: 1.2, z: -12 }); await o.step(3); }],
  // Behind my office's bookcase (world/secret-room.js): its bay halfway into the pocket behind its neighbour; slid away,
  // the hatch down and the ladder's top up out of the shaft; on the ladder in the shaft looking down into the den; the
  // den from the foot of the ladder, the fire lit; its desk and monitors.
  ['secret-bookcase-slide', async (o) => { await arrive(o); await o.eval(() => window.__office.secret.pose(2.45)); await stand(o, 8.6, -11.8, { x: 8.6, y: 1.1, z: -14.7 }); await o.step(3); }],
  ['secret-bookcase', async (o) => { await arrive(o); await o.eval(() => window.__office.secret.open(true)); await stand(o, 8.35, -12.0, { x: 8.35, y: 0.6, z: -14.8 }); await o.step(3); }],
  ['secret-shaft', async (o) => { await arrive(o); await o.eval(() => window.__office.secret.climb(-1.4, 0.4, -1.1)); await o.step(3); }],
  ['secret-den', async (o) => { await arrive(o); await o.eval(() => window.__office.secret.den(7.9, -13.4, Math.atan2(-1.6, -5), -0.08)); await o.step(6); }],
  ['secret-den-desk', async (o) => { await arrive(o); await o.eval(() => window.__office.secret.den(10, -11.6, Math.PI / 2, -0.05)); await o.step(8); }],
  // The duct from the den (world/secret-duct.js): its carved vent open in the den's wall; crawling, at its first turn; the
  // far end's louvred grille low in the corridor's wall behind the sky (its own scene, built as the vent opens).
  ['secret-vent', async (o) => { await arrive(o); await o.eval(() => { const s = window.__office.secret; s.den(11.3, -9.6, -Math.PI / 2, -0.5); s.vent(true); }); await o.step(6); }],
  ['secret-duct-turn', async (o) => { await arrive(o); await o.eval(() => window.__office.secret.duct(15.3, -8.9, Math.PI - 0.5, 0.02)); await o.step(4); }],
  ['secret-duct-grille', async (o) => { await arrive(o); await o.eval(() => window.__office.secret.corridor(34.6, 20.5, 0.6, -0.55)); await o.step(6); }],
  ['ping-pong-tv', async (o) => { await arrive(o); await stand(o, 1.4, 8, { x: 3.69, y: 1.6, z: 8 }); await o.step(3); }],
  ['tv-panel', async (o) => { await from('ping-pong-tv', o); await o.eval(() => window.__office.openTv('pingpong')); await o.step(2); }],
  ['whiteboard', async (o) => {
    await arrive(o);
    await stand(o, -16.5, 4.6, { x: -19.86, y: 1.6, z: 4.6 });
    await o.step(2);
    await o.eval(() => window.__office.useBoard(window.__office.boards[0].id));
    await o.step(16);   // the 700 ms glide up to the board
  }],
  ['laptop', async (o) => {
    await arrive(o);
    await stand(o, 16.7, 12.6, { x: 16.7, y: 0.5, z: 14.05 });
    await o.step(2);
    await o.eval(() => window.__office.openLaptop());
    await stepUntil(o, () => window.__office.laptop.k >= 1, 60);
    await o.step(2);
  }],
  ['lift-car', async (o) => {
    await arrive(o);
    await stand(o, 15, 0.4, { x: 18, y: 1.6, z: 0.4 });
    await o.step(2);
    await o.eval(() => { window.__office.goFloor(48); Object.assign(window.__office.player, { yaw: Math.PI / 2, pitch: -0.05 }); });
    await stepUntil(o, () => window.__office.mine.L?.state === 'open', 80);
    await o.step(2);
  }],
  ['lift-panel', async (o) => {   // in a car, turned to the floor buttons on its side wall, B2 lit
    await arrive(o);
    await ride(o, 48);
    const z = await o.eval(() => window.__office.mine.L.z);
    await stand(o, 19, z - 0.1, { x: 18.42, y: 1.32, z: z + 0.75 });
    await o.eval(() => window.__office.pressFloor(-2));
    await o.step(2);
  }],
  ['archive', async (o) => {
    await arrive(o);
    await ride(o, -2);
    await o.idle();
    const A = await o.eval(() => window.__office.ctx.ARCH);   // out in the void, the cabinet ahead
    await stand(o, A.x + 6, A.z, { x: A.x, y: 0.8, z: A.z });
    await o.step(3);
  }],
  ['archive-drawer', async (o) => {
    await from('archive', o);
    await until(o, () => window.__office.arch.files.list);
    const A = await o.eval(() => window.__office.ctx.ARCH);
    await stand(o, A.x + 3.5, A.z - 2, { x: A.x + 2, y: 0.8, z: A.z });   // within 5 m, or it slides home again
    await o.eval(() => window.__office.arch.toggleDrawer(1));
    await stepUntil(o, () => window.__office.arch.drawers[1].k === 1, 120);
    await o.step(2);
  }],
  ['gateway', async (o) => {
    await from('archive', o);
    await until(o, () => window.__office.arch.files.list);
    const G = await o.eval(() => window.__office.ctx.GATE);   // down the line from the cabinet, the ring facing you
    await stand(o, G.x + 12, G.z, { x: G.x, y: 2.8, z: G.z });
    await o.step(2);
    // Dial up the first fixture repo on the keypad and wait for its history to load.
    await o.eval(() => { const a = window.__office.arch, f = a.files.list[0]; for (const k of a.coordOf(f)) a.gatePress(k); a.gatePress('GO'); });
    await o.idle();
    await until(o, () => window.__office.arch.gate.ready);
    await stepUntil(o, () => window.__office.arch.gate.open >= 1, 60);
    await o.step(2);
  }],
  ['inside-a-repo', async (o) => {
    await from('gateway', o);
    await o.eval(() => window.__office.setFloor(window.__office.arch.tess()));
    await o.step(4);
  }],
  ['server-hall', async (o) => {
    await arrive(o);
    await ride(o, -1);
    const z = await o.eval(() => window.__office.mine.L.z);   // the hall is laid out about your car
    await stand(o, 10, z, { x: 0, y: 1.4, z });
    await o.step(2); await o.idle(); await o.step(3);
  }],
  ['roof', async (o) => {
    await arrive(o);
    await ride(o, 50);
    await stand(o, 12, 0.4, { x: -4, y: 1.0, z: 6 });
    await o.step(3);
  }],
  ['roof-rain', async (o) => {   // the roof in the rain (world/weather.js), the sky grey, streaks round you
    await from('roof', o);
    await o.eval(() => window.__office.weather.set({ kind: 'rain' }));
    await o.step(300);
  }],
  ['dusk', async (o) => {
    await arrive(o);
    await dusk(o);
    await o.eval(() => window.__office.teleport('Digit2'));
    await o.step(45);   // the lamps ease up
  }],
  ['heli-cockpit', async (o) => {   // up to the roof at dusk and into the helicopter's pilot seat, the rotor spooling up
    await arrive(o);
    await dusk(o);
    await ride(o, 50);
    await o.eval(() => window.__office.heli.board());
    await stepUntil(o, () => window.__office.heli.S.cam === 'in', 80);
    await o.step(10);
  }],
  ['edge-wall', async (o) => {   // out past the city in the helicopter, hovering 200 m off the sky wall: the pier and stairs at its foot
    await arrive(o);
    await ride(o, 50);
    await o.eval(() => window.__office.heli.board());
    await stepUntil(o, () => window.__office.heli.S.cam === 'in', 80);
    await o.eval(() => { const h = window.__office.heli; h.edge.place(200, 35); h.S.lookPitch = -0.14; });
    await o.step(10);
  }],
  ['edge-stairs', async (o) => {   // set down on the pier and out of the helicopter: the stairs up the wall to the door
    await arrive(o);
    await ride(o, 50);
    await o.eval(() => window.__office.heli.board());
    await stepUntil(o, () => window.__office.heli.S.cam === 'in', 80);
    await o.eval(() => window.__office.heli.edge.land());
    await o.step(2);
    await o.eval(() => window.__office.heli.getOut());
    await stepUntil(o, () => window.__office.heli.S.cam === 'out', 80);
    await o.eval(() => {   // on the pier, back from the foot of the stairs, looking up them to the door
      const O = window.__office, E = O.heli.edge, P = O.player, x = -E.R + 4.2, z = E.STAIR.u0 - 3.5;
      Object.assign(P, { x, z, yaw: Math.atan2(-(-E.R - x), -(0 - z)), pitch: 0.12, fy: E.PT - O.roof.y });
    });
    await o.step(40);
  }],
  ['edge-door', async (o) => {   // up on the landing, the door open onto the corridor behind the sky, the lights down
    await from('edge-stairs', o);
    await o.eval(() => {
      const O = window.__office, E = O.heli.edge, P = O.player;
      Object.assign(P, { x: -E.R + 1.25, z: 0.45, yaw: Math.atan2(1.25, 0.45), pitch: 0.02, fy: E.LT - O.roof.y });
      E.door(true);
    });
    await o.step(40);
  }],
  // Behind the sky (floors/world-edge-backstage.js, its own coordinates, PLAN: the monitor wall toward -z, yaw 0 facing it).
  ['edge-gallery', async (o) => {   // in from the sound lock, on the rear walkway: the empty tiers, the table in the pit, the monitor wall
    await from('edge-door', o);
    await o.eval(() => window.__office.heli.edge.backstage.go(-4.6, -0.9, -0.42, -0.24));
    await o.step(50);
  }],
  ['edge-console', async (o) => {   // at the director's console on the top tier, looking down at it: time, weather, building, the table and the wall beyond
    await from('edge-door', o);
    await o.eval(() => window.__office.heli.edge.backstage.go(0, -2.55, 0, -0.48));
    await o.step(40);
  }],
  ['edge-bank', async (o) => {   // the monitor wall's middle up close from the pit: the status screen and the clock, the pier's and the gallery's own feeds
    await from('edge-door', o);
    await o.eval(() => window.__office.heli.edge.backstage.go(0, -13.75, 0, 0.28));
    await o.step(50);
  }],
  ['edge-table', async (o) => {   // the model of the world on its table in the pit, its sun on its arm over it, your building opened up into its floors
    await from('edge-door', o);
    await o.eval(() => { const b = window.__office.heli.edge.backstage; b.go(-1.4, -7.4, -0.3, -0.3); b.model.open(true); });
    await o.step(60);
  }],
  ['edge-flat', async (o) => {   // in the flat's open doorway: the two of them on the sofa, you on their TV
    await from('edge-door', o);
    await o.eval(() => { const b = window.__office.heli.edge.backstage; b.doors.flat.open(true); b.go(-11.1, 2.5, 0, -0.12); });
    await o.step(40);
  }],
  ['edge-flat-door', async (o) => {   // the flat's front door from the corridor, shut: chipped paint, its number, the mat, the TV's light under it
    await from('edge-door', o);
    await o.eval(() => window.__office.heli.edge.backstage.go(-11.1, 3.85, 0, -0.5));
    await o.step(40);
  }],
  ['edge-exit', async (o) => {   // the fire door marked EXIT open off the corridor's last leg: B3 through it, in its own light
    await from('edge-door', o);
    await o.eval(() => { const b = window.__office.heli.edge.backstage; b.go(36.6, 19.4, -2.2, 0); b.exit(true); });
    await o.step(30);
  }],
  ['edge-exit-b3', async (o) => {   // never flown: down to B3 by lift, to the dead end deep in, the door open on the long corridor
    await arrive(o);
    await o.eval(() => window.__office.goFloor(-3));
    await o.step(40);
    await o.eval(() => { const b = window.__office.heli.edge.back(); b.b3(1.0, 2.6, 0.42, -0.04); b.exit(true); });
    await o.step(40);
  }],
  ['edge-corridor', async (o) => {   // in the long corridor's last leg, back to a corner: the pipes, the conduit and the tray round it on the walls
    await from('edge-door', o);
    await o.eval(() => window.__office.heli.edge.backstage.go(27.6, 20, Math.PI / 2, 0.05));
    await o.step(40);
  }],
  ['edge-door-swing', async (o) => {   // the door in the sky held a third open, from the landing close up: its leaf and its sign whole as it swings
    await from('edge-door', o);
    await o.eval(() => {
      const O = window.__office, E = O.heli.edge, P = O.player;
      Object.assign(E.E, { open: 0.3, want: 0.3 });
      Object.assign(P, { x: -E.R + 0.55, z: 0.75, yaw: Math.atan2(0.55, 0.75) + 0.25, pitch: 0, fy: E.LT - O.roof.y });
    });
    await o.step(30);
  }],
  ['edge-exit-jamb', async (o) => {   // the exit open, from beside the plant room, at an angle: its jambs and reveal clean, the leaf clear of them
    await from('edge-door', o);
    await o.eval(() => { const b = window.__office.heli.edge.backstage; b.go(37.6, 20.2, -1.97, 0.02); b.exit(true); });
    await o.step(30);
  }],
  ['edge-stub', async (o) => {   // round the corner from the gallery's corridor: the door in the sky open off the stub's side, the scene dock at its end
    await from('edge-door', o);
    await o.eval(() => window.__office.heli.edge.backstage.go(-18.4, 3.6, Math.PI, 0));
    await o.step(40);
  }],
  ['security-app', async (o) => {   // out of the helicopter to your desktop full screen, the Security app's feeds at dusk
    await from('heli-cockpit', o);
    await o.eval(() => { window.dash.setView('desktop', 'cctv'); });   // not awaited: the fly-in needs frames
    await stepUntil(o, () => document.body.dataset.view === 'desktop', 200);
    await stepUntil(o, () => document.querySelectorAll('.cc-tile canvas[data-live]').length === 23, 200);
    await o.step(4); await o.idle();
  }],
  ['archive-hall', async (o) => {   // down to the archive's entrance hall at dusk, the vault shut
    await arrive(o);
    await dusk(o);
    await ride(o, -2);
    const z = await o.eval(() => window.__office.mine.L.z);   // the hall is laid out about your car
    await stand(o, 16.6, z + 0.4, { x: 7, y: 1.8, z });
    await o.step(60);   // out of the car's light into the hall's
  }],
  ['archive-vault', async (o) => {   // the vault swung open on the void, eyes adjusted to the glare
    await from('archive-hall', o);
    const z = await o.eval(() => window.__office.mine.L.z);
    await stand(o, 12.4, z - 0.5, { x: 7, y: 1.5, z });
    await o.eval(() => window.__office.arch.openVault());
    await stepUntil(o, () => window.__office.arch.vault.state === 'open', 200);
    await o.step(60);
  }],
  ['archive-portal', async (o) => {   // out in the void, in front of the doorway: the hall only through it
    await from('archive-vault', o);
    const z = await o.eval(() => window.__office.mine.L.z);
    await stand(o, 1, z + 0.6, { x: 7, y: 1.7, z });
    await o.step(4);
  }],
  ['archive-behind', async (o) => {   // round the back of it: a frame and its door, and more void
    await from('archive-vault', o);
    const z = await o.eval(() => window.__office.mine.L.z);
    await stand(o, 12.5, z - 2.5, { x: 6, y: 1.6, z });
    await o.step(4);
  }],
  ['security-archive', async (o) => {   // the Security app's Archive tab: the entrance hall's camera alone, the vault open
    await from('archive-vault', o);
    await o.eval(() => { window.dash.setView('desktop', 'cctv'); });
    await stepUntil(o, () => document.body.dataset.view === 'desktop', 200);
    await o.eval(() => document.querySelector('.cc-bar button[data-floor="-2"]').click());
    await stepUntil(o, () => !!document.querySelector('.cc-tile:not([hidden]) canvas[data-live]'), 200);
    await o.step(4); await o.idle();
  }],
  ['restricted-keypad', async (o) => {   // at dusk, into a car, and B3 pressed: its keypad, half a code typed
    await arrive(o);
    await dusk(o);
    await ride(o, 48);
    const z = await o.eval(() => window.__office.mine.L.z);
    await stand(o, 19.2, z, { x: 18.4, y: 1.1, z: z + 0.7 });
    await o.eval(() => { window.__office.pressFloor(-3); for (const k of '14') window.__office.ctx.restr.keypad.press(k); });
    await o.step(4);
  }],
  ['restricted', async (o) => {   // straight down to B3 (goFloor skips the code), out of the car and into the rooms
    await arrive(o);
    await dusk(o);
    await ride(o, -3);
    const z = await o.eval(() => window.__office.mine.L.z);
    await stand(o, -10, z + 6, { x: -20, y: 1.6, z: z - 9 });
    await o.step(60);   // out of the car's light into the strip lights'
  }],
  ['restricted-path', async (o) => {   // the last stretch of the worn way to the stone door (restricted-paths.js): just about there
    await from('restricted', o);
    const p = await o.eval(() => {
      const r = window.__office.ctx.restr, q = r.paths.routes[1].map((x) => x.p);
      let n = q.length - 1, d = 0;
      while (n > 0 && d < 8) { d += Math.hypot(q[n][0] - q[n - 1][0], q[n][1] - q[n - 1][1]); n--; }
      r.stream(q[n][0], q[n][1], true);
      const [tx, tz] = q[Math.min(q.length - 1, n + 20)];
      return { x: q[n][0], z: q[n][1] + r.z0, tx, tz: tz + r.z0 };
    });
    await stand(o, p.x, p.z, { x: p.tx, y: 0.2, z: p.tz });
    await o.step(30);
  }],
  ['restricted-desk', async (o) => {   // Hale's desk, put in front of you (it's found by walking, normally), the coffee still steaming
    await from('restricted', o);
    await o.eval(() => window.__office.ctx.restr.story.force('desk'));
    const it = await o.eval(() => { const r = window.__office.ctx.restr, it = r.story.st.items.find((x) => x.beat.id === 'desk');
      return { x: it.at.x, z: it.at.z + r.z0, ry: it.g.rotation.y }; });
    await stand(o, it.x + Math.sin(it.ry) * 2.4 + Math.cos(it.ry) * 0.6, it.z + Math.cos(it.ry) * 2.4 - Math.sin(it.ry) * 0.6, { x: it.x, y: 0.8, z: it.z });
    await o.step(20);
  }],
  ['restricted-note', async (o) => {   // and one of Hale's notes, picked up
    await from('restricted-desk', o);
    await o.eval(() => window.__office.ctx.restr.story.read('tally'));
    await o.step(4);
  }],
  ['restricted-creature', async (o) => {   // out of the car, looking down the long corridor: it, at the far end, under the dimmed lights
    await arrive(o);
    await dusk(o);
    await ride(o, -3);
    const z = await o.eval(() => window.__office.mine.L.z);
    await stand(o, 16.5, z, { x: 0, y: 1.6, z });
    await o.eval(() => window.__office.ctx.restr.creature.force('far', -4, 0));
    await o.step(20);
  }],
  ['relativity-door', async (o) => {   // B3: the stone door that doesn't belong, put in a wall ahead of you (it's found by walking, normally)
    await from('restricted', o);
    await o.eval(() => window.__office.ctx.rel.door.force());
    const d = await o.eval(() => { const r = window.__office.ctx.restr, g = window.__office.ctx.rel.door.g; return { x: g.position.x, z: g.position.z + r.z0, ry: g.rotation.y }; });
    const nx = Math.sin(d.ry), nz = Math.cos(d.ry), x = d.x + nx * 2.6 + nz * 0.5, z = d.z + nz * 2.6 - nx * 0.5;
    await stand(o, x, z, { x: d.x, y: 1.9, z: d.z });
    await o.step(20);
  }],
  ['relativity-door-open', async (o) => {   // and open: the hall through it, live, in its own light (systems/portal.js)
    await from('relativity-door', o);
    await o.eval(() => window.__office.ctx.rel.door.open(true));
    await o.step(20);
  }],
  ['relativity-exit', async (o) => {   // inside, looking back at the door you came in by: B3's corridor through it
    await from('relativity-door', o);
    await o.eval(() => { const r = window.__office.ctx.rel; r.door.open(true); r.door.through(); r.pose(0, 9.4, -15, 6.3, Math.PI - 0.12, 0.02); });
    await o.step(20);
  }],
  ['relativity-exit-near', async (o) => {   // a step from it, where the hall used to show through B3 (ambient occlusion through the pane)
    await from('relativity-door', o);
    await o.eval(() => { const r = window.__office.ctx.rel; r.door.open(true); r.door.through(); r.pose(0, 9.0, -15, 7.9, 3.2, -0.15); });
    await o.step(20);
  }],
  ['relativity', async (o) => {   // through it: Relativity as you arrive, the door behind you, three gravities' stairs ahead
    await arrive(o);
    await ride(o, -3);
    await o.eval(() => window.__office.ctx.rel.go(true));
    await o.step(6);
  }],
  ['relativity-stair', async (o) => {   // the shared stair from the floor below: one figure walking up its top, another its underside
    await arrive(o);
    await ride(o, -3);
    await o.eval(() => { const r = window.__office.ctx.rel; r.go(true); r.pose(0, 4, -15, -1, 1.45, 0.88); });
    await o.step(4);
  }],
  ['relativity-turn', async (o) => {   // walking into the next gravity's floor: halfway through the roll onto it
    await arrive(o);
    await ride(o, -3);
    await o.eval(() => { const r = window.__office.ctx.rel; r.go(true); r.pose(0, 0, -15, -13.6, 0.3, 0.1); window.__office.keys.add('KeyW'); });
    await stepUntil(o, () => window.__office.ctx.rel.walker.S.roll?.t > 0.45, 60);
    await o.eval(() => window.__office.keys.delete('KeyW'));
  }],
  // The painting on B3 that's a way onto the Plain (floors/plain.js): from across its hall; close, the paint going clear;
  // a few centimetres from it, walking in (the Plain all round you, on B3 still); out there, the city ahead; a few
  // centimetres from the frame on the way back (B3 all round you, out there still); the frame hanging in the air behind
  // you with B3 through it; and the thing that lives out there, a few metres off, looking at you.
  ['plain-painting', async (o) => { await arrive(o); await o.eval(() => window.__office.plain.painting(0, 9, 0, 0)); await o.step(30); }],
  ['plain-painting-close', async (o) => { await arrive(o); await o.eval(() => window.__office.plain.painting(0.1, 1.4, 0.04, -0.03)); await o.step(30); }],
  ['plain-crossing', async (o) => { await arrive(o); await o.eval(() => window.__office.plain.painting(0.05, 0.06, 0, 0)); await o.step(20); }],
  ['plain', async (o) => { await arrive(o); await o.eval(() => window.__office.plain.go(0.4, -6, 0.04, 0.02)); await o.step(30); }],
  ['plain-crossing-out', async (o) => { await arrive(o); await o.eval(() => { const p = window.__office.plain; p.painting(0, 3, 0, 0); p.go(0.05, -0.06, Math.PI, 0); }); await o.step(20); }],
  ['plain-frame', async (o) => { await arrive(o); await o.eval(() => { const p = window.__office.plain; p.painting(0, 3, 0, 0); p.go(-0.9, -4.5, Math.PI + 0.2, -0.04); }); await o.step(30); }],
  ['plain-crawler', async (o) => { await arrive(o); await o.eval(() => { const p = window.__office.plain; p.go(0, -6, 0, -0.12); p.stage(0.4, -10.5, -0.2); }); await o.step(20); }],
  ['task-board', async (o) => {   // over to the task board in my office, in use: the fixture board, the layer over it
    await arrive(o);
    await stand(o, 16.7, -11.5, { x: 16.7, y: 1.9, z: -14.9 });
    await o.step(2);
    await o.eval(() => window.__office.ctx.useTaskBoard());
    await o.step(16);   // the 700 ms glide up to the board
  }],
  ['task-board-card', async (o) => {   // a card open: its editor beside the board, the card on the board as it's being edited
    await from('task-board', o);
    await o.eval(() => { const t = window.__office.ctx.taskBoard; t.openCard(t.tb.board.cards.find((c) => c.id === 'fix00004')); });
    await o.step(3);
  }],
  ['vacant-floor', async (o) => {   // down to 45, an empty floor, by day: out of the car into the bare shell
    await arrive(o);
    await ride(o, 45);
    await stand(o, 12, -2, { x: -10, y: 1.4, z: 6 });
    await o.step(45);
  }],
  ['wellness-pool', async (o) => {   // 46, the wellness floor: swimming at the north glass, looking out over the city
    await arrive(o);
    await ride(o, 46);
    await stand(o, -8, 12.9, { x: -8, y: 0, z: 20 });
    await o.step(45);
  }],
  ['wellness-gym', async (o) => {   // the gym: the cardio row on the east windows, the power rack, the dumbbells under the mirror
    await arrive(o);
    await ride(o, 46);
    await stand(o, 7.5, 4.6, { x: 16, y: 0.8, z: 11 });
    await o.step(30);
  }],
  ['wellness-sauna', async (o) => {   // in the sauna, just after a ladle of water on the stones
    await arrive(o);
    await ride(o, 46);
    await stand(o, 17.4, -13.9, { x: 19.1, y: 1.75, z: -11.35 });
    await o.eval(() => window.__office.ctx.actionOf('wellness-ladle').click({}));
    await o.step(40);
  }],
  ['wellness-steam', async (o) => {   // just inside the steam room, the fog thick by the floor and under the starry ceiling
    await arrive(o);
    await ride(o, 46);
    await stand(o, 13.2, -11.2, { x: 13.4, y: 1.0, z: -14.5 });
    await o.step(60);
  }],
  ['wellness-jacuzzi', async (o) => {   // the jacuzzi on its deck by the west glass, from the steps up to it
    await arrive(o);
    await ride(o, 46);
    await stand(o, -13.4, -10.6, { x: -17.2, y: 0.3, z: -12.6 });
    await o.step(40);
  }],
  ['wellness-float', async (o) => {   // the float room: its door open, the pod's lid raised over the blue-lit water
    await arrive(o);
    await ride(o, 46);
    await o.eval(() => { const O = window.__office; O.ctx.wellness.hinged.find((d) => d.name === 'Float room door').to = 1; O.ctx.actionOf('wellness-float').click({}, {}); });
    await stand(o, 2.6, -11.5, { x: 1.9, y: 0.3, z: -13.4 });
    await o.step(80);
  }],
  ['wellness-infrared', async (o) => {   // the infrared cabin on the spa's north wall, its heaters glowing through the glass
    await arrive(o);
    await ride(o, 46);
    await stand(o, 6.0, -9.8, { x: 13.5, y: 1.2, z: -4.5 });
    await o.step(40);
  }],
  ['wellness-hall', async (o) => {   // the hall past the changing rooms: the quiet room's fluted door, the treatment room, the showers
    await arrive(o);
    await ride(o, 46);
    await stand(o, 3.0, -7.6, { x: -6, y: 1.0, z: -12.6 });
    await o.step(40);
  }],
  ['security-wellness', async (o) => {   // from the office, the Security app's Wellness tab: the floor's four cameras, staged unseen
    await arrive(o);
    await o.eval(() => { window.dash.setView('desktop', 'cctv'); });
    await stepUntil(o, () => document.body.dataset.view === 'desktop', 200);
    await o.eval(() => document.querySelector('.cc-bar button[data-floor="46"]').click());
    await stepUntil(o, () => document.querySelectorAll('.cc-tile:not([hidden]) canvas[data-live]').length === 4, 200);
    await o.step(4); await o.idle();
  }],
];

// Compares two PNGs in the page: counts pixels where any channel differs by more than `tol`.
async function compare(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + src; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    if (A.width !== B.width || A.height !== B.height) return { size: `${A.width}x${A.height} vs ${B.width}x${B.height}` };
    const px = (img) => { const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const da = px(A), db = px(B);
    let diff = 0, sum = 0, max = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > 0) { sum += d; if (d > max) max = d; }
      if (d > 24) diff++;
    }
    return { diff, total: da.length / 4, mean: sum / (da.length / 4), max };
  }, [a.toString('base64'), b.toString('base64')]);
}

// Tolerance: no more than 0.1% of pixels off by more than 24/255 (rendering is deterministic here, so this is slack).
export const LIMIT = 0.001;

// The seed for a pose's Math.random, from its name (FNV-1a).
const seedOf = (name) => { let h = 2166136261; for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };

export async function runGoldens(browser, base, { record = false, only = null, log = console.log } = {}) {
  fs.mkdirSync(GOLDEN, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const unknown = (only || []).filter((n) => !POSES.some(([name]) => name === n));
  if (unknown.length) throw new Error(`no such pose: ${unknown.join(', ')} (poses: ${POSES.map(([n]) => n).join(', ')})`);
  const errors = [], results = [];
  for (const [name, setup] of POSES) {
    if (only && !only.includes(name)) continue;
    const t = Date.now(), errs = [];
    const o = await openOffice(browser, base, { errors: errs });
    try {
      // The page built the office from the fixed seed (so it's the world the world suite sees); from here on the random
      // stream is this pose's own, so what another pose's area draws can't shift it.
      await o.eval((s) => window.__seed(s), seedOf(name));
      await setup(o);
      const png = await o.page.screenshot({ animations: 'disabled', caret: 'hide', timeout: 240000 });
      fs.writeFileSync(path.join(OUT, `${name}.png`), png);
      const gold = path.join(GOLDEN, `${name}.png`), secs = `${((Date.now() - t) / 1000).toFixed(1)}s`;
      if (record) { fs.writeFileSync(gold, png); results.push({ name, recorded: true }); log(`  recorded ${name} (${secs})`); continue; }
      if (!fs.existsSync(gold)) { results.push({ name, ok: false, why: 'no golden' }); log(`  ✗ ${name}: no golden`); continue; }
      const r = await compare(o.page, png, fs.readFileSync(gold));
      const ok = !r.size && r.diff / r.total <= LIMIT;
      results.push({ name, ok, ...r });
      log(`  ${ok ? '✓' : '✗'} ${name}: ${r.size || `${r.diff} px over tolerance (${(100 * r.diff / r.total).toFixed(3)}%), mean ${r.mean.toFixed(3)}, max ${r.max}`} (${secs})`);
    } finally {
      await o.ctx.close();
      errors.push(...errs.map((e) => `${name}: ${e}`));
    }
  }
  if (errors.length) log(`  page errors:\n    ${errors.join('\n    ')}`);
  return { results, errors };
}
