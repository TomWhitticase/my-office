// World snapshots: what the office is built from, read out of the live page through window.__office. The collider map,
// seats, desks and idle spots, every walking route checked against the colliders, the click actions in each scene, the
// floor table, and a fingerprint of every object in every scene. Compared with test/snapshots/world.json, and
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
  return failed + (errors.length ? 1 : 0) + await runResume(browser, base, log);
}

// A reload puts you back where you were (systems/resume.js): the office loaded with a pose saved on another floor comes up
// there, not at your desk. Relativity in its second gravity, deep in B3's rooms, and the helicopter in flight.
const RESUME = {
  relativity: [{ f: -4, car: 0, cz: -0.5, x: -1, z: -15, eye: 1.65, yaw: 1.45, pitch: 0.3, s: { k: 1, x: 4, y: -15, z: -1 } },
    () => { const w = window.__office, S = w.ctx.rel.walker.S; return w.away?.n === -4 && S.k === 1 && Math.hypot(S.x - 4, S.z + 1) < 0.05 && w.mode === 'free'; }],
  restricted: [{ f: -3, car: 0, cz: -0.5, x: -40, z: 29.5, eye: 1.65, yaw: 0.5, pitch: 0 },
    () => { const w = window.__office; return w.away?.n === -3 && Math.hypot(w.player.x + 40, w.player.z - 29.5) < 0.05 && w.mode === 'free'; }],
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
  return failed;
}
