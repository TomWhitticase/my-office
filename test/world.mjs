// World snapshots: what the office is built from, read out of the live page through window.__office. The collider map,
// seats, desks and idle spots, every walking route checked against the colliders, the click actions in each scene, the
// floor table, a fingerprint of every object in every scene, and no two surfaces sharing a plane (coplanar.mjs). Compared with test/snapshots/world.json, and
// world-<scene>.txt (one line per object) so a mismatch can be diffed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/server.mjs';
import { openOffice } from './lib/browser.mjs';
import { diffJSON } from './lib/diff.mjs';

const SNAP = path.join(ROOT, 'test', 'snapshots'), OUT = path.join(ROOT, 'test', 'out');

function read() {
  const o = window.__office, r = (v) => Math.round(v * 1000) / 1000;
  const box = (b) => [r(b.minX), r(b.maxX), r(b.minZ), r(b.maxZ)];
  const out = {};

  // The office's colliders as a map, 0.5 m a cell (# solid), and each one.
  const grid = [];
  for (let z = -15; z < 15; z += 0.5) {
    let row = '';
    for (let x = -20; x < 20; x += 0.5) row += o.colliders.some((b) => x + 0.25 >= b.minX && x + 0.25 <= b.maxX && z + 0.25 >= b.minZ && z + 0.25 <= b.maxZ) ? '#' : '.';
    grid.push(row);
  }
  out.colliderMap = grid;
  out.colliders = o.colliders.map(box);
  out.seats = o.seats.map((s) => [s.name, r(s.x), r(s.z), r(s.rotY), r(s.eye ?? 0), s.floor ?? null]);
  out.desks = o.desks.map((d) => [r(d.x), r(d.z), r(d.rotY), d.spot.key, d.spot.route.map((p) => [r(p.x), r(p.z)])]);
  out.idleSpots = o.idleSpots.map((s) => [s.key, s.pose, r(s.pos.x), r(s.pos.z), r(s.rotY), s.route.map((p) => [r(p.x), r(p.z)])]);
  out.people = [...o.people].filter(([k]) => typeof k === 'string').map(([id, p]) => [id, p.spot?.key ?? null, o.desks.indexOf(p.desk), r(p.root.position.x), r(p.root.position.z)]);

  // Every route, sampled every 10 cm: the samples inside a collider (a walk-through), per route.
  const inside = (x, z) => o.colliders.filter((b) => x > b.minX + 1e-6 && x < b.maxX - 1e-6 && z > b.minZ + 1e-6 && z < b.maxZ - 1e-6).length;
  const check = (route) => {
    let hits = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
      for (let k = 0; k <= n; k++) hits += inside(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n) ? 1 : 0;
    }
    return hits;
  };
  out.routeHits = Object.fromEntries([...o.desks.map((d, i) => [`desk${i}`, d.spot.route]), ...o.idleSpots.map((s) => [s.key, s.route])].map(([k, rt]) => [k, check(rt)]));

  out.floors = o.FLOORS.map((F) => ({ n: F.n, label: F.label, title: F.title, scene: !!F.scene, y: F.y ?? null, carless: !!F.carless, fly: !!F.fly, sound: F.sound ?? null,
    colliders: (F.colliders || []).length, hits: (F.hits || []).length, hooks: ['enter', 'leave', 'bound', 'map', 'fx', 'pick', 'ground'].filter((k) => typeof F[k] === 'function') }));
  out.tvs = o.tvs().map((t) => t.id);
  out.boards = o.boards.map((b) => [b.id, b.name]);
  out.doors = o.doors.map((d) => d.name);
  out.blinds = Object.keys(o.blinds);
  out.lifts = o.lifts.map((L) => [r(L.z), L.state]);

  // Each scene: the click actions on its objects, and one line per object (type, geometry, material, transform, flags).
  const scene = o.camera.parent || o.people.values().next().value?.root.parent?.parent;
  const roots = { office: scene, ...Object.fromEntries(o.FLOORS.filter((F) => F.scene).map((F) => [F.label.toLowerCase(), F.scene])) };
  out.scenes = {};
  const lines = {};
  for (const [name, root] of Object.entries(roots)) {
    if (!root) continue;
    const L = [], actions = {}, types = {};
    root.traverse((x) => {
      const ud = x.userData || {};
      if (ud.action) actions[ud.action] = (actions[ud.action] || 0) + 1;
      types[x.type] = (types[x.type] || 0) + 1;
      if (typeof ud.sessionId === 'string') return;   // people come and go with the sessions
      const g = x.geometry, m = x.material, mm = Array.isArray(m) ? m[0] : m;
      const flags = Object.keys(ud).sort().map((k) => `${k}${typeof ud[k] === 'function' ? '()' : typeof ud[k] === 'object' ? '{}' : '=' + ud[k]}`).join(',');
      L.push([x.type, x.name, g ? `${g.type}:${g.attributes?.position?.count ?? 0}` : '', mm ? `${mm.type}:${mm.color?.getHexString?.() ?? ''}:${mm.map ? 'map' : ''}:${mm.transparent ? 't' : ''}` : '',
        [x.position.x, x.position.y, x.position.z, x.rotation.x, x.rotation.y, x.rotation.z, x.scale.x, x.scale.y, x.scale.z].map(r).join(' '),
        x.visible ? '' : 'hidden', x.layers.mask, x.isInstancedMesh ? `n=${x.count}` : '', x.children.length, flags].join('|'));
    });
    const hash = (a) => { let h = 2166136261; for (const s of a) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
    out.scenes[name] = { objects: L.length, types, actions, ordered: hash(L), sorted: hash([...L].sort()) };
    lines[name] = L;
  }
  return { out, lines };
}

export async function runWorld(browser, base, { record = false, log = console.log } = {}) {
  const errors = [];
  const o = await openOffice(browser, base, { errors });
  let got;
  try { got = await o.eval(read); } finally { await o.ctx.close(); }
  const { out, lines } = got;
  fs.mkdirSync(SNAP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(out, null, 1));
  for (const [k, L] of Object.entries(lines)) fs.writeFileSync(path.join(OUT, `world-${k}.txt`), L.join('\n') + '\n');
  if (errors.length) log(`  page errors:\n    ${errors.join('\n    ')}`);
  if (record) {
    fs.writeFileSync(path.join(SNAP, 'world.json'), JSON.stringify(out, null, 1) + '\n');
    for (const [k, L] of Object.entries(lines)) fs.writeFileSync(path.join(SNAP, `world-${k}.txt`), L.join('\n') + '\n');
    log(`  recorded: ${Object.entries(out.scenes).map(([k, s]) => `${k} ${s.objects} objects`).join(', ')}`);
    return errors.length ? 1 : 0;
  }
  const want = JSON.parse(fs.readFileSync(path.join(SNAP, 'world.json'), 'utf8'));
  let failed = 0;
  for (const k of new Set([...Object.keys(want), ...Object.keys(out)])) {
    // Objects added in a different order but otherwise identical draw the same: `ordered` is reported, `sorted` must match.
    const a = k === 'scenes' ? Object.fromEntries(Object.entries(want[k] || {}).map(([n, s]) => [n, { ...s, ordered: undefined }])) : want[k];
    const b = k === 'scenes' ? Object.fromEntries(Object.entries(out[k] || {}).map(([n, s]) => [n, { ...s, ordered: undefined }])) : out[k];
    const d = diffJSON(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));
    if (d.length) { failed++; log(`  ✗ ${k}\n      ${d.slice(0, 10).join('\n      ')}${d.length > 10 ? `\n      …and ${d.length - 10} more` : ''}`); }
    else log(`  ✓ ${k}`);
  }
  for (const [n, s] of Object.entries(out.scenes)) if (want.scenes?.[n] && want.scenes[n].ordered !== s.ordered) log(`  · ${n}: same objects, built in a different order (diff test/snapshots/world-${n}.txt test/out/world-${n}.txt)`);
  // Surfaces sharing a plane (z-fighting): every scene, cached per scene (test/coplanar.mjs).
  const { runCoplanar } = await import('./coplanar.mjs');
  failed += await runCoplanar(browser, base, log);
  return failed + (errors.length ? 1 : 0) + await runResume(browser, base, log);
}

// A reload puts you back where you were (systems/resume.js): the office loaded with a pose saved on another floor comes up
// there, not at your desk. Relativity in its second gravity, deep in B3's rooms, out on the Plain and at its painting, and
// the helicopter in flight.
const RESUME = {
  relativity: [{ f: -4, car: 0, cz: -0.5, x: -1, z: -15, eye: 1.65, yaw: 1.45, pitch: 0.3, s: { k: 1, x: 4, y: -15, z: -1 } },
    () => { const w = window.__office, S = w.ctx.rel.walker.S; return w.away?.n === -4 && S.k === 1 && Math.hypot(S.x - 4, S.z + 1) < 0.05 && w.mode === 'free'; }],
  restricted: [{ f: -3, car: 0, cz: -0.5, x: -40, z: 29.5, eye: 1.65, yaw: 0.5, pitch: 0 },
    () => { const w = window.__office; return w.away?.n === -3 && Math.hypot(w.player.x + 40, w.player.z - 29.5) < 0.05 && w.mode === 'free'; }],
  // saved inside a stair's tread in the third gravity (as a door shutting on you, or an old save, could leave it): out to
  // somewhere you can walk from, close by, not back in it
  'relativity, stuck': [{ f: -4, car: 0, cz: -0.5, x: 0, z: 0, eye: 1.65, yaw: 0, pitch: 0, s: { k: 2, x: -0.093, y: -5.82, z: -0.573 } },
    () => { const w = window.__office, r = w.ctx.rel, S = r.walker.S; return w.away?.n === -4 && w.mode === 'free' && r.walker.ok() && S.k === 2 && Math.hypot(S.x + 0.093, S.y + 5.82, S.z + 0.573) < 6; }],
  // out on the Plain (floors/plain.js), and in front of its painting on B3 (built as the page comes back)
  plain: [{ f: -5, car: 0, cz: -0.5, x: 2.5, z: -30, eye: 1.65, yaw: 0.4, pitch: 0, s: {} },
    () => { const w = window.__office; return w.away?.n === -5 && Math.hypot(w.player.x - 2.5, w.player.z + 30) < 0.05 && w.mode === 'free'; }],
  'the painting on B3': [{ f: -3, car: 0, cz: -0.5, x: 2, z: 40.55, eye: 1.65, yaw: 1.571, pitch: 0 },
    () => { const w = window.__office; return w.away?.n === -3 && w.plain.built && Math.hypot(w.player.x - 2, w.player.z - 40.55) < 0.05 && w.mode === 'free'; }],
  // out on the acrobats' coast (floors/acro.js), up on its viaduct, and in front of its painting on B3
  acro: [{ f: -8, car: 0, cz: -0.5, x: -3, z: -6, eye: 1.65, yaw: 0.4, pitch: 0, s: { deck: false } },
    () => { const w = window.__office; return w.away?.n === -8 && Math.hypot(w.player.x + 3, w.player.z + 6) < 0.05 && w.mode === 'free'; }],
  'acro, on the viaduct': [{ f: -8, car: 0, cz: -0.5, x: -26.756, z: -52.373, eye: 1.65, yaw: 0.67, pitch: 0, s: { deck: true } },
    () => { const w = window.__office; return w.away?.n === -8 && w.acro.W.deck && Math.hypot(w.player.x + 26.756, w.player.z + 52.373) < 0.05 && w.mode === 'free'; }],
  'the acro painting on B3': [{ f: -3, car: 0, cz: -0.5, x: -80.2, z: -10.6, eye: 1.65, yaw: 0, pitch: 0 },
    () => { const w = window.__office; return w.away?.n === -3 && w.acro.built && Math.hypot(w.player.x + 80.2, w.player.z + 10.6) < 0.05 && w.mode === 'free'; }],
  // in the winter village (floors/kettle.js), up in the kettle's loft, and in front of its painting on B3
  village: [{ f: -7, car: 0, cz: -0.5, x: 6, z: -12, eye: 1.65, yaw: 0.3, pitch: 0, s: { inside: false, loft: false, open: 0 } },
    () => { const w = window.__office; return w.away?.n === -7 && Math.hypot(w.player.x - 6, w.player.z + 12) < 0.05 && w.mode === 'free'; }],
  'the kettle\'s loft': [{ f: -7, car: 0, cz: -0.5, x: -0.2, z: -33.4, eye: 1.65, yaw: 1, pitch: 0, s: { inside: true, loft: true, open: 1 } },
    () => { const w = window.__office, S = w.kettle.S; return w.away?.n === -7 && S.inside && S.loft && Math.abs(w.player.fy - 6) < 0.3 && w.mode === 'free'; }],
  'the village painting on B3': [{ f: -3, car: 0, cz: -0.5, x: -15.7, z: -67.2, eye: 1.65, yaw: 1.571, pitch: 0 },
    () => { const w = window.__office; return w.away?.n === -3 && w.kettle.built && Math.hypot(w.player.x + 15.7, w.player.z + 67.2) < 0.05 && w.mode === 'free'; }],
  // out in her world (floors/lisa.js; its land follows from a worker), and in front of the portrait on B3
  lisa: [{ f: -9, car: 0, cz: -0.5, x: -2, z: -3, eye: 1.65, yaw: 0.3, pitch: 0, s: {} },
    () => { const w = window.__office; return w.away?.n === -9 && w.lisa.built && Math.hypot(w.player.x + 2, w.player.z + 3) < 0.05 && w.mode === 'free'; }],
  'the portrait on B3': [{ f: -3, car: 0, cz: -0.5, x: 12.6, z: 123.3, eye: 1.65, yaw: 3.1416, pitch: 0 },
    () => { const w = window.__office; return w.away?.n === -3 && w.lisa.built && Math.hypot(w.player.x - 12.6, w.player.z - 123.3) < 0.05 && w.mode === 'free'; }],
  helicopter: [{ f: 50, car: 0, cz: -0.5, x: 19, z: -0.5, eye: 1.65, yaw: 0, pitch: 0, s: { x: 120, y: 90, z: -60, yaw: 0.7, landed: false, aboard: true, out: false, free: false } },
    () => { const w = window.__office, S = w.heli.S; return w.away?.n === 50 && w.mode === 'heli' && S.aboard && !S.landed && S.rpm === 1 && Math.hypot(S.pos.x - 120, S.pos.y - 90, S.pos.z + 60) < 1; }],
};
async function runResume(browser, base, log) {
  const { T0 } = await import('./lib/fixtures.mjs');
  let failed = 0;
  for (const [name, [pose, check]] of Object.entries(RESUME)) {
    const errors = [], o = await openOffice(browser, base, { errors, storage: { officePose: JSON.stringify({ ...pose, at: T0 }) } });
    let ok = false;
    try {
      for (let i = 0; i < 40 && !ok; i++) { await o.step(1, 100); ok = await o.eval(check); }
    } finally { await o.ctx.close(); }
    if (ok && !errors.length) log(`  ✓ reload: back in ${name}`);
    else { failed++; log(`  ✗ reload: not back in ${name}${errors.length ? ` (${errors.join('; ')})` : ''}`); }
  }
  return failed + await runStuck(browser, base, log, T0);
}

// Stuck in Relativity (floors/relativity.js stuckCheck, systems/resume.js unstick): put inside that tread with W held, a
// couple of seconds sees you out; the page going while you're in it doesn't save it; Backspace twice gets you out at once.
async function runStuck(browser, base, log, T0) {
  const pose = RESUME.relativity[0], errors = [];
  const o = await openOffice(browser, base, { errors, storage: { officePose: JSON.stringify({ ...pose, at: T0 }) } });
  const results = {};
  try {
    for (let i = 0; i < 40; i++) { await o.step(1, 100); if (await o.eval(RESUME.relativity[1])) break; }
    const trap = () => o.eval(() => { const r = window.__office.ctx.rel; Object.assign(r.walker.S, { k: 2, x: -0.093, y: -5.82, z: -0.573, supp: 517, roll: null }); r.stuck.t = 0; return r.walker.ok(); });
    // the detector
    results.trapped = !(await trap());
    await o.eval(() => { window.__office.ctx.rel.stuck.n = 0; window.__office.keys.add('KeyW'); });
    for (let i = 0; i < 30; i++) await o.step(1, 100);
    results.detector = await o.eval(() => { const r = window.__office.ctx.rel; window.__office.keys.delete('KeyW'); return r.stuck.n > 0 && r.walker.ok(); });
    // and standing on nothing (in nothing, so it's the 2 s of getting nowhere that tells): out onto a floor
    await o.eval(() => { const r = window.__office.ctx.rel; Object.assign(r.walker.S, { k: 0, x: 0, y: -60, z: 0, supp: -1, roll: null }); r.stuck.t = 0; r.stuck.n = 0; window.__office.keys.add('KeyW'); });
    for (let i = 0; i < 10; i++) await o.step(1, 100);
    const early = await o.eval(() => window.__office.ctx.rel.stuck.n);   // (half a second in: not yet; a frame's 50 ms at most)
    for (let i = 0; i < 40; i++) await o.step(1, 100);
    results.nowhere = early === 0 && await o.eval(() => { const r = window.__office.ctx.rel; window.__office.keys.delete('KeyW'); return r.stuck.n > 0 && r.walker.ok(); });
    // never saved like that, not even as the page goes
    await trap();
    results.save = await o.eval(() => {
      const r = window.__office.ctx.rel, before = localStorage.officePose;
      dispatchEvent(new Event('pagehide'));
      return r.save() === false && localStorage.officePose === before;
    });
    // Backspace twice
    await trap();
    results.escape = await o.eval(() => {
      for (let i = 0; i < 2; i++) document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', key: 'Backspace' }));
      return window.__office.ctx.rel.walker.ok();
    });
  } finally { await o.ctx.close(); }
  let failed = 0;
  for (const [k, what] of [['trapped', 'the trap is one'], ['detector', 'held keys in it get you out'], ['nowhere', 'on nothing, 2 s of getting nowhere gets you out'], ['save', 'it isn\'t saved, even on pagehide'], ['escape', 'Backspace twice gets you out']]) {
    if (results[k] && !errors.length) log(`  ✓ stuck: ${what}`);
    else { failed++; log(`  ✗ stuck: ${what}${errors.length ? ` (${errors.join('; ')})` : ''}`); }
  }
  return failed;
}
