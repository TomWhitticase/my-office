// Golden screenshots: the office at fixed poses and a fixed sim time, against the fixture sessions. Each shot is compared
// with test/golden/<name>.png (or recorded with --record). The poses run in order in one page, as a walk through the
// building, so each one starts from where the last left off: the same every run.
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

// [name, what to do before the shot]
export const POSES = [
  ['desktop', async (o) => { await o.step(1, 16); }],   // the intro's first frame: your desktop filling the view
  ['seated', async (o) => {
    await o.step(1, 400); await o.step(1, 2700);    // the pull back to your chair
    await stepUntil(o, () => window.__office.mode === 'free');
    // Show the crosshair, as if you'd clicked in (pointer lock can't be had headless); the HUD is otherwise as it comes.
    await o.eval(() => document.querySelector('.of-hud').classList.add('of-locked'));
    await o.step(2);
  }],
  ['desks', async (o) => { await o.eval(() => window.__office.teleport('Digit1')); await o.step(3); }],
  ['breakroom', async (o) => { await o.eval(() => window.__office.teleport('Digit2')); await o.step(3); }],
  ['lobby', async (o) => { await o.eval(() => window.__office.teleport('Digit4')); await o.step(3); }],
  ['meeting-rooms', async (o) => { await o.eval(() => window.__office.teleport('Digit5')); await o.step(3); }],
  ['kitchen', async (o) => { await stand(o, -13, 10.5, { x: -18, y: 1.2, z: 14 }); await o.step(3); }],
  ['lounge', async (o) => { await stand(o, 4.5, 8.5, { x: 12, y: 1.0, z: 10 }); await o.step(3); }],
  ['my-office', async (o) => { await stand(o, 9, -6, { x: 16, y: 1.2, z: -12 }); await o.step(3); }],
  ['ping-pong-tv', async (o) => { await stand(o, 1.4, 8, { x: 3.69, y: 1.6, z: 8 }); await o.step(3); }],
  ['tv-panel', async (o) => { await o.eval(() => window.__office.openTv('pingpong')); await o.step(2); }],
  ['whiteboard', async (o) => {
    await o.eval(() => window.dash.closeDrawer());
    await stand(o, -16.5, 4.6, { x: -19.86, y: 1.6, z: 4.6 });
    await o.step(2);
    await o.eval(() => window.__office.useBoard(window.__office.boards[0].id));
    await o.step(16);   // the 700 ms glide up to the board
  }],
  ['chat', async (o) => {
    await o.eval(() => window.__office.leaveBoard());
    await o.step(14);
    await o.eval(() => window.__office.teleport('Digit1'));
    await o.step(2);
    await o.eval((id) => window.__office.openChat(id), SESSION_IDS[0]);
    await o.idle(); await o.step(3);
  }],
  ['laptop', async (o) => {
    await o.eval(() => { window.__office.closeChat(); window.dash.closeDrawer(); });
    await o.step(2);
    await stand(o, 16.7, 12.6, { x: 16.7, y: 0.5, z: 14.05 });
    await o.step(2);
    await o.eval(() => window.__office.openLaptop());
    await stepUntil(o, () => window.__office.laptop.k >= 1, 60);
    await o.step(2);
  }],
  ['lift-car', async (o) => {
    await stand(o, 15, 0.4, { x: 18, y: 1.6, z: 0.4 });
    await stepUntil(o, () => !window.__office.laptop.open && window.__office.laptop.k === 0, 60);
    await o.eval(() => { window.__office.goFloor(48); Object.assign(window.__office.player, { yaw: Math.PI / 2, pitch: -0.05 }); });
    await stepUntil(o, () => window.__office.mine.L?.state === 'open', 80);
    await o.step(2);
  }],
  ['archive', async (o) => {
    await o.eval(() => window.__office.goFloor(-2));
    await stepUntil(o, () => window.__office.mine.L?.state === 'open', 80);
    await o.idle();
    await stand(o, 0, 0.4, { x: -6, y: 0.8, z: 0.4 });
    await o.step(3);
  }],
  ['archive-drawer', async (o) => {
    await until(o, () => window.__office.arch.files.list);
    await stand(o, -2.5, -1.6, { x: -4, y: 0.8, z: 0.4 });   // within 5 m, or it slides home again
    await o.eval(() => window.__office.arch.toggleDrawer(1));
    await stepUntil(o, () => window.__office.arch.drawers[1].k === 1, 120);
    await o.step(2);
  }],
  ['gateway', async (o) => {
    await o.eval(() => window.__office.arch.toggleDrawer(1));
    await stepUntil(o, () => window.__office.arch.drawers[1].k === 0, 120);
    await stand(o, -20, 56, { x: -20, y: 2.8, z: 68.4 });
    await o.step(2);
    // Dial up the first fixture repo on the keypad and wait for its history to load.
    await o.eval(() => { const a = window.__office.arch, f = a.files.list[0]; for (const k of a.coordOf(f)) a.gatePress(k); a.gatePress('GO'); });
    await o.idle();
    await until(o, () => window.__office.arch.gate.ready);
    await stepUntil(o, () => window.__office.arch.gate.open >= 1, 60);
    await o.step(2);
  }],
  ['inside-a-repo', async (o) => {
    await o.eval(() => window.__office.setFloor(window.__office.arch.tess()));
    await o.step(4);
  }],
  ['server-hall', async (o) => {
    await o.eval(() => window.__office.goFloor(47));
    await stepUntil(o, () => window.__office.mine.L?.state === 'open', 80);
    const z = await o.eval(() => window.__office.mine.L.z);   // the hall is laid out about your car
    await stand(o, 10, z, { x: 0, y: 1.4, z });
    await o.step(2); await o.idle(); await o.step(3);
  }],
  ['roof', async (o) => {
    await o.eval(() => window.__office.goFloor(50));
    await stepUntil(o, () => window.__office.mine.L?.state === 'open', 80);
    await stand(o, 12, 0.4, { x: -4, y: 1.0, z: 6 });
    await o.step(3);
  }],
  ['dusk', async (o) => {
    await o.eval(() => window.__office.goFloor(48));
    await stepUntil(o, () => window.__office.mine.L?.state === 'open', 80);
    await o.eval((t) => window.__office.setTime(t), T0 + 7 * 3600e3 + 15 * 60e3);   // 21:45 in London
    await o.eval(() => window.__office.teleport('Digit2'));
    await o.step(45);   // the lamps ease up
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

export async function runGoldens(browser, base, { record = false, only = null, log = console.log } = {}) {
  fs.mkdirSync(GOLDEN, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const errors = [];
  const o = await openOffice(browser, base, { errors });
  const results = [];
  try {
    for (const [name, setup] of POSES) {
      const t = Date.now();
      await setup(o);
      if (only && !only.includes(name)) continue;
      const png = await o.page.screenshot({ animations: 'disabled', caret: 'hide' });
      fs.writeFileSync(path.join(OUT, `${name}.png`), png);
      const gold = path.join(GOLDEN, `${name}.png`);
      if (record) { fs.writeFileSync(gold, png); results.push({ name, recorded: true }); log(`  recorded ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`); continue; }
      if (!fs.existsSync(gold)) { results.push({ name, ok: false, why: 'no golden' }); log(`  ✗ ${name}: no golden`); continue; }
      const r = await compare(o.page, png, fs.readFileSync(gold));
      const ok = !r.size && r.diff / r.total <= LIMIT;
      results.push({ name, ok, ...r });
      log(`  ${ok ? '✓' : '✗'} ${name}: ${r.size || `${r.diff} px over tolerance (${(100 * r.diff / r.total).toFixed(3)}%), mean ${r.mean.toFixed(3)}, max ${r.max}`} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    }
  } finally {
    await o.ctx.close();
  }
  if (errors.length) log(`  page errors:\n    ${errors.join('\n    ')}`);
  return { results, errors };
}
