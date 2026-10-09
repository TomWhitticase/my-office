// Server snapshots: every /api route's response for the fixture HOME, the SSE stream's opening, static serving, and the
// same-origin / JSON / TV-browser refusals. Compared with test/snapshots/api.json (or recorded with --record).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ROOT } from './lib/server.mjs';
import { SESSION_IDS } from './lib/fixtures.mjs';
import { diffJSON } from './lib/diff.mjs';

const SNAP = path.join(ROOT, 'test', 'snapshots', 'api.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// A raw request, so the path goes out exactly as written (fetch would normalise ../) and any header can be set.
function req(port, method, p, { headers = {}, body, upgrade = false } = {}) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { 'user-agent': UA, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', finish);
      res.on('close', finish);
      let done = false;
      function finish() { if (done) return; done = true; resolve({ status: res.statusCode, type: res.headers['content-type'] || null, cache: res.headers['cache-control'] || null, body: data }); }
    });
    if (upgrade) r.on('upgrade', (res, sock) => { sock.destroy(); resolve({ status: res.statusCode, upgraded: true }); });
    r.on('error', (e) => resolve({ error: e.code || e.message }));
    r.setTimeout(30000, () => { r.destroy(); resolve({ error: 'timeout' }); });
    if (body !== undefined) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

// The shape of a value: keys and types, not the numbers (for responses that read the real machine).
const shape = (v) => Array.isArray(v) ? (v.length ? [shape(v[0])] : []) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])])) : v === null ? null : typeof v;

export async function collect(server) {
  const { port, home } = server, H = `127.0.0.1:${port}`, origin = `http://${H}`;
  const scrub = (s) => s.split(home).join('$HOME');
  const json = (r) => { try { return JSON.parse(scrub(r.body)); } catch { return scrub(r.body ?? ''); } };
  const get = async (p, o) => { const r = await req(port, 'GET', p, o); return { status: r.status, type: r.type, cache: r.cache, body: json(r) }; };
  const ok = { origin, 'content-type': 'application/json' };
  const out = {};

  out['GET /api/state'] = await get('/api/state');
  const cfg = await get('/api/config');
  out['GET /api/config'] = { ...cfg, body: shape(cfg.body) };   // values come from this checkout's config.json
  const build = await get('/api/build');
  out['GET /api/build'] = { ...build, body: { build: /^[0-9a-f]{40}$/.test(build.body?.build) ? '<commit>' : build.body?.build } };   // this checkout's HEAD
  out['GET /api/office'] = await get('/api/office');
  out['GET /api/tvs'] = await get('/api/tvs');
  for (const id of SESSION_IDS) out[`GET /api/session/${id}`] = await get(`/api/session/${id}`);
  out['GET /api/session/<unknown>'] = await get('/api/session/nope-0000');
  const chat = await get(`/api/session/${SESSION_IDS[0]}/chat`);
  out['GET /api/session/:id/chat'] = { ...chat, body: { ...chat.body, seq: typeof chat.body.seq } };   // seqs count up across transcripts
  const same = await get(`/api/session/${SESSION_IDS[0]}/chat?seq=${chat.body.seq}`);
  out['GET /api/session/:id/chat?seq=<same>'] = { ...same, body: Object.keys(same.body) };
  // The desk terminal's feed: seqs count up across transcripts too, so only their order is kept.
  const feed = await get(`/api/session/${SESSION_IDS[0]}/feed`), unseq = (b) => ({ ...b, seq: typeof b.seq, lines: b.lines?.map(({ s, ...l }) => l) });
  out['GET /api/session/:id/feed'] = { ...feed, body: unseq(feed.body) };
  const more = await get(`/api/session/${SESSION_IDS[0]}/feed?since=${feed.body.seq}`);
  out['GET /api/session/:id/feed?since=<latest>'] = { ...more, body: unseq(more.body) };
  out['GET /api/session/<unknown>/feed'] = await get('/api/session/nope-0000/feed');
  out['POST /api/session/:id/feed'] = await req(port, 'POST', `/api/session/${SESSION_IDS[0]}/feed`, { headers: ok, body: {} });
  out['GET /api/session/:id/feed (cross-site)'] = await get(`/api/session/${SESSION_IDS[0]}/feed`, { headers: { 'sec-fetch-site': 'cross-site' } });
  // Sections that read the machine's own sensors come and go with its state (on battery or mains, Wi-Fi read yet, macmon
  // installed, a first sample with no rates): only that they're there, and the battery's keys with its numbers maybe null.
  const m = await get('/api/machine'), VOLATILE = ['diskIO', 'files', 'ifaces', 'net', 'power', 'sensors', 'swap', 'thermal', 'wifi'];
  const nullable = (v) => (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k] === null || typeof v[k] === 'number' ? 'number?' : typeof v[k]])) : v);
  const { battery, ...core } = m.body;
  for (const k of VOLATILE) delete core[k];
  out['GET /api/machine'] = { ...m, body: { ...shape(core), battery: nullable(battery), sections: VOLATILE.filter((k) => k in m.body) } };
  const repos = await get('/api/repos');   // gh isn't signed in under the fixture HOME
  out['GET /api/repos'] = { status: repos.status, type: repos.type, cache: repos.cache, signin: repos.body?.signin };

  // The event stream's opening: the state, then the TVs, ad counts, office settings and the task board.
  const events = [];
  const stream = await new Promise((resolve) => {
    let buf = '';
    const r = http.get({ host: '127.0.0.1', port, path: '/events', headers: { 'user-agent': UA } }, (res) => {
      res.on('data', (c) => { buf += c; if ((buf.match(/\n\n/g) || []).length >= 5) { res.destroy(); resolve({ status: res.statusCode, type: res.headers['content-type'], buf }); } });
    });
    r.on('error', () => resolve({ buf }));
  });
  for (const block of stream.buf.split('\n\n').filter(Boolean)) {
    const e = {};
    for (const line of block.split('\n')) { const i = line.indexOf(':'); const k = line.slice(0, i), v = line.slice(i + 1).trimStart(); if (k === 'data') e.data = JSON.parse(scrub(v)); else e[k] = v; }
    events.push(e);
  }
  out['GET /events'] = { status: stream.status, type: stream.type, events };

  // Static files.
  for (const p of ['/', '/index.html', '/office.js', '/chat.js', '/vendor/three/build/three.module.js', '/nope.js', '/../server.js', '/%2e%2e/server.js', '/vendor/three/../../server.js', '/config.json']) {
    const r = await req(port, 'GET', p);
    out[`GET ${p}`] = { status: r.status, type: r.type, cache: r.cache, bytes: r.status === 200 ? (p.startsWith('/vendor') ? 'some' : r.body.length > 0) : r.body.length };
  }

  // Writes: only JSON, from our own Origin on a trusted Host, not from a TV or headless browser.
  const put = (p, body, headers, method = 'PUT') => req(port, method, p, { headers, body }).then((r) => ({ status: r.status, body: json(r) }));
  out['PUT /api/office (ok)'] = await put('/api/office', { door: 1 }, ok);
  out['GET /api/office (after)'] = (await get('/api/office')).body;
  out['PUT /api/office (put back)'] = await put('/api/office', { door: 0 }, ok);
  // The security cameras: a patch per camera, values clamped, ids checked, only what's given changes.
  out['PUT /api/office (camera)'] = await put('/api/office', { cameras: { lobby: { on: false, pan: 30.123, tilt: -12, zoom: 2 } } }, ok);
  out['PUT /api/office (camera, partial)'] = await put('/api/office', { cameras: { lobby: { on: true } } }, ok);
  out['PUT /api/office (camera, out of range)'] = await put('/api/office', { cameras: { lobby: { pan: 999, tilt: -999, zoom: 0, on: 'yes' } } }, ok);
  out['PUT /api/office (camera, bad ids)'] = await put('/api/office', { cameras: { '../x': { on: false }, 'A B': { on: false }, ok: 'nope' } }, ok);
  out['PUT /api/office (camera put back)'] = await put('/api/office', { cameras: { lobby: { on: true, pan: 0, tilt: 0, zoom: 1 } } }, ok);
  out['PUT /api/office (bad JSON)'] = await put('/api/office', '{nope', ok);
  out['PUT /api/office (no Origin)'] = await put('/api/office', { door: 1 }, { 'content-type': 'application/json' });
  out['PUT /api/office (foreign Origin)'] = await put('/api/office', { door: 1 }, { ...ok, origin: 'http://evil.example' });
  out['PUT /api/office (text/plain)'] = await put('/api/office', { door: 1 }, { ...ok, 'content-type': 'text/plain' });
  out['PUT /api/office (form)'] = await put('/api/office', 'door=1', { ...ok, 'content-type': 'application/x-www-form-urlencoded' });
  out['PUT /api/office (HeadlessChrome)'] = await put('/api/office', { door: 1 }, { ...ok, 'user-agent': UA.replace('Chrome/', 'HeadlessChrome/') });
  out['PUT /api/office (TV browser)'] = await put('/api/office', { door: 1 }, { ...ok, 'user-agent': UA + ' my-office-tv' });
  out['PUT /api/office (foreign Host)'] = await put('/api/office', { door: 1 }, { ...ok, host: 'evil.example', origin: 'http://evil.example' });
  // The task board: read only on our own Host and never cross-site (it's your notes); changed by ops, all or none, each
  // checked and clamped, behind the same write checks. Only cards and columns made here are touched, and all of them are
  // gone again at the end (the goldens after this paint the fixture board).
  const ops = (body, headers = ok) => put('/api/board', body, headers, 'POST');
  const brief = (r) => ({ status: r.status, body: r.body?.cards ? { rev: r.body.rev, columns: r.body.columns.map((k) => `${k.id}:${k.name}`),
    cards: r.body.cards.filter((c) => c.id.startsWith('api')).map((c) => `${c.id}@${c.col}${c.archived ? ' (archived)' : ''}`) }
    : r.body?.board ? { error: r.body.error, rev: r.body.board.rev } : r.body });
  out['GET /api/board'] = await get('/api/board');
  out['GET /api/board (cross-site)'] = await get('/api/board', { headers: { 'sec-fetch-site': 'cross-site' } });
  out['GET /api/board (foreign Host)'] = await get('/api/board', { headers: { host: 'evil.example' } });
  const added = await ops({ ops: [{ op: 'add', col: 'todo', at: 0, card: { id: 'api00001', title: ' Call\u0007 the   bank ', body: 'line 1\r\nline 2\u0000', kind: 'sticky', color: 'red', prio: 9,
    due: '2026-02-31', labels: `a, b, a, ${'x'.repeat(40)}`, who: 'ab!cd', archived: 'yes', rev: 99 } }] });
  out['POST /api/board (add, clamped)'] = { status: added.status, card: added.body.cards?.find((c) => c.id === 'api00001'), at: added.body.cards?.findIndex((c) => c.id === 'api00001') };
  out['POST /api/board (add more)'] = brief(await ops({ ops: [{ op: 'add', card: { id: 'api00002', title: 'B' } }, { op: 'add', card: { id: 'api00003', title: 'C', kind: 'index', color: 'blue' }, col: 'done', at: 99 }] }));
  out['POST /api/board (duplicate id)'] = brief(await ops({ ops: [{ op: 'add', card: { id: 'api00002' } }] }));
  out['POST /api/board (bad id)'] = brief(await ops({ ops: [{ op: 'add', card: { id: '../x' } }] }));
  out['POST /api/board (edit)'] = await ops({ ops: [{ op: 'edit', id: 'api00002', set: { title: 'B2', body: 'x'.repeat(10050), kind: 'nope', prio: 2, due: '2026-07-01', who: 'jd', id: 'hijack', col: 'done' } }] })
    .then((r) => ({ status: r.status, card: r.body.cards?.filter((c) => c.id === 'api00002').map((c) => ({ ...c, body: c.body.length })) }));
  out['POST /api/board (move)'] = brief(await ops({ ops: [{ op: 'move', id: 'api00002', col: 'review', at: 0 }, { op: 'move', id: 'api00003', col: 'review', at: 1 }] }));
  out['POST /api/board (archive)'] = brief(await ops({ ops: [{ op: 'archive', id: 'api00003' }] }));
  out['POST /api/board (a bad op: none applied)'] = brief(await ops({ ops: [{ op: 'delete', id: 'api00002' }, { op: 'move', id: 'api00001', col: 'nope' }] }));
  out['POST /api/board (unknown card)'] = brief(await ops({ ops: [{ op: 'edit', id: 'nope0000', set: { title: 'x' } }] }));
  out['POST /api/board (unknown op)'] = brief(await ops({ ops: [{ op: 'drop', table: 'cards' }] }));
  out['POST /api/board (no ops)'] = brief(await ops({ ops: [] }));
  out['POST /api/board (not ops)'] = brief(await ops({ cards: [] }));
  out['POST /api/board (too many ops)'] = brief(await ops({ ops: Array.from({ length: 101 }, () => ({ op: 'archive', id: 'api00003' })) }));
  out['POST /api/board (too big)'] = brief(await ops({ ops: [{ op: 'add', card: { body: 'x'.repeat(300000) } }] }));
  out['POST /api/board (bad JSON)'] = brief(await ops('{nope'));
  const cols = (await get('/api/board')).body.columns;
  out['POST /api/board (columns: add, rename, reorder)'] = brief(await ops({ ops: [{ op: 'columns', columns: [...cols.slice(0, 3), { id: 'apicol01', name: '  QA\n ' }, ...cols.slice(3)] },
    { op: 'move', id: 'api00002', col: 'apicol01' }] }));
  out['POST /api/board (columns: one dropped, its cards to the first)'] = brief(await ops({ ops: [{ op: 'columns', columns: cols }] }));
  out['POST /api/board (columns: none)'] = brief(await ops({ ops: [{ op: 'columns', columns: [] }] }));
  out['POST /api/board (columns: too many)'] = brief(await ops({ ops: [{ op: 'columns', columns: Array.from({ length: 13 }, (_, i) => ({ id: `apicol${String(i).padStart(2, '0')}`, name: `c${i}` })) }] }));
  out['POST /api/board (no Origin)'] = brief(await ops({ ops: [{ op: 'delete', id: 'api00001' }] }, { 'content-type': 'application/json' }));
  out['POST /api/board (foreign Origin)'] = brief(await ops({ ops: [{ op: 'delete', id: 'api00001' }] }, { ...ok, origin: 'http://evil.example' }));
  out['POST /api/board (text/plain)'] = brief(await ops({ ops: [{ op: 'delete', id: 'api00001' }] }, { ...ok, 'content-type': 'text/plain' }));
  out['POST /api/board (HeadlessChrome)'] = brief(await ops({ ops: [{ op: 'delete', id: 'api00001' }] }, { ...ok, 'user-agent': UA.replace('Chrome/', 'HeadlessChrome/') }));
  out['POST /api/board (TV browser)'] = brief(await ops({ ops: [{ op: 'delete', id: 'api00001' }] }, { ...ok, 'user-agent': UA + ' my-office-tv' }));
  out['POST /api/board (foreign Host)'] = brief(await ops({ ops: [{ op: 'delete', id: 'api00001' }] }, { ...ok, host: 'evil.example', origin: 'http://evil.example' }));
  out['PUT /api/board'] = await put('/api/board', { ops: [] }, ok);
  // Full: 500 cards at most, however many are archived.
  const n0 = (await get('/api/board')).body.cards.length, fill = [];
  for (let i = 0; n0 + i < 500; i++) fill.push(`api${String(i + 100).padStart(5, '0')}`);
  for (let i = 0; i < fill.length; i += 100) await ops({ ops: fill.slice(i, i + 100).map((id) => ({ op: 'add', card: { id, title: id } })) });
  out['POST /api/board (full)'] = brief(await ops({ ops: [{ op: 'add', card: { id: 'api99999', title: 'one too many' } }] }));
  const mine = (await get('/api/board')).body.cards.filter((c) => c.id.startsWith('api')).map((c) => c.id);
  for (let i = 0; i < mine.length; i += 100) await ops({ ops: mine.slice(i, i + 100).map((id) => ({ op: 'delete', id })) });
  out['GET /api/board (after)'] = await get('/api/board').then((r) => ({ ...r, body: { ...r.body, rev: typeof r.body.rev } }));

  out['PUT /api/tvs/lobby (foreign Origin)'] = await put('/api/tvs/lobby', { url: 'https://example.com' }, { ...ok, origin: 'http://evil.example' });
  out['PUT /api/tvs/lobby (bad url)'] = await put('/api/tvs/lobby', { url: 'javascript:alert(1)' }, ok);
  out['PUT /api/tvs/<bad id>'] = await put('/api/tvs/../x', { url: '' }, ok);
  out['GET /api/john'] = await put('/api/john', undefined, {}, 'GET');
  out['POST /api/john (no Origin)'] = await put('/api/john', { text: 'hi' }, { 'content-type': 'application/json' }, 'POST');
  out['POST /api/john (empty)'] = await put('/api/john', { text: '  ' }, ok, 'POST');
  out['POST /api/john (too long)'] = await put('/api/john', { text: 'x'.repeat(700) }, ok, 'POST');
  // Rosie at reception: the same checks as John's (her plans, with a stand-in claude, are in test/api-baseline/snap.mjs).
  out['GET /api/receptionist'] = await put('/api/receptionist', undefined, {}, 'GET');
  out['POST /api/receptionist (no Origin)'] = await put('/api/receptionist', { text: 'hi' }, { 'content-type': 'application/json' }, 'POST');
  out['POST /api/receptionist (foreign Origin)'] = await put('/api/receptionist', { text: 'hi' }, { ...ok, origin: 'http://evil.example' }, 'POST');
  out['POST /api/receptionist (TV browser)'] = await put('/api/receptionist', { text: 'hi' }, { ...ok, 'user-agent': UA + ' my-office-tv' }, 'POST');
  out['POST /api/receptionist (empty)'] = await put('/api/receptionist', { text: '  ' }, ok, 'POST');
  out['POST /api/receptionist (too long)'] = await put('/api/receptionist', { text: 'x'.repeat(700) }, ok, 'POST');
  out['POST /api/receptionist/tv (bad id)'] = await put('/api/receptionist/tv', { id: '../x', search: 'news' }, ok, 'POST');
  out['POST /api/receptionist/tv (TV browser)'] = await put('/api/receptionist/tv', { id: 'lobby', search: 'news' }, { ...ok, 'user-agent': UA + ' my-office-tv' }, 'POST');
  out['GET /api/session/:id/send'] = await put(`/api/session/${SESSION_IDS[0]}/send`, undefined, {}, 'GET');
  out['POST /api/session/:id/send (no Origin)'] = await put(`/api/session/${SESSION_IDS[0]}/send`, { text: 'hi' }, { 'content-type': 'application/json' }, 'POST');
  out['POST /api/session/:id/send (empty)'] = await put(`/api/session/${SESSION_IDS[0]}/send`, { text: '' }, ok, 'POST');
  out['POST /api/session/:id/send (too long)'] = await put(`/api/session/${SESSION_IDS[0]}/send`, { text: 'x'.repeat(9000) }, ok, 'POST');

  // The archive's routes: private repos, so our own Host only, never a TV, never cross-site.
  out['POST /api/repos'] = await put('/api/repos', {}, ok, 'POST');
  out['GET /api/repos (cross-site)'] = await put('/api/repos', undefined, { 'sec-fetch-site': 'cross-site' }, 'GET');
  out['GET /api/repos (same-site)'] = await put('/api/repos', undefined, { 'sec-fetch-site': 'same-site' }, 'GET');
  out['GET /api/repos (TV browser)'] = await put('/api/repos', undefined, { 'user-agent': UA + ' my-office-tv' }, 'GET');
  out['GET /api/repos (foreign Host)'] = await put('/api/repos', undefined, { host: 'evil.example' }, 'GET');
  out['GET /api/repos/../x'] = await put('/api/repos/../x', undefined, {}, 'GET');
  out['GET /api/repos/o/../tree'] = await put('/api/repos/o/../tree', undefined, {}, 'GET');
  out['GET /api/repos/o/n/blob (bad ref)'] = await put('/api/repos/o/n/blob?ref=main&path=a.js', undefined, {}, 'GET');
  out['GET /api/repos/o/n/blob (bad path)'] = await put(`/api/repos/o/n/blob?ref=${'a'.repeat(40)}&path=../x`, undefined, {}, 'GET');
  // A README's image: an image file's name only, no way out of the repo, a plain ref; private repos, so the same checks.
  out['GET /api/repos/o/n/raw (no path)'] = await put('/api/repos/o/n/raw', undefined, {}, 'GET');
  out['GET /api/repos/o/n/raw (not an image)'] = await put('/api/repos/o/n/raw?path=README.md', undefined, {}, 'GET');
  out['GET /api/repos/o/n/raw (traversal)'] = await put('/api/repos/o/n/raw?path=../../x.png', undefined, {}, 'GET');
  out['GET /api/repos/o/n/raw (bad ref)'] = await put('/api/repos/o/n/raw?path=a.png&ref=../main', undefined, {}, 'GET');
  out['GET /api/repos/o/n/raw (TV browser)'] = await put('/api/repos/o/n/raw?path=a.png', undefined, { 'user-agent': UA + ' my-office-tv' }, 'GET');
  out['GET /api/repos/o/n/raw (cross-site)'] = await put('/api/repos/o/n/raw?path=a.png', undefined, { 'sec-fetch-site': 'cross-site' }, 'GET');
  out['GET /api/repos/o/n/raw (signed out)'] = await put('/api/repos/o/n/raw?path=docs/a.png', undefined, {}, 'GET');

  // The TVs' socket: our own Origin on a trusted Host, and never from a TV.
  const ws = (headers) => req(port, 'GET', '/tv', { upgrade: true, headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', ...headers } })
    .then((r) => r.upgraded ? 'upgraded' : r.error ? 'refused' : `status ${r.status}`);
  out['WS /tv (ok)'] = await ws({ origin });
  out['WS /tv (foreign Origin)'] = await ws({ origin: 'http://evil.example' });
  out['WS /tv (no Origin)'] = await ws({});
  out['WS /tv (TV browser)'] = await ws({ origin, 'user-agent': UA + ' my-office-tv' });
  out['WS /tv (foreign Host)'] = await ws({ host: 'evil.example', origin: 'http://evil.example' });
  return out;
}

export async function runApi(server, { record = false, log = console.log } = {}) {
  const got = await collect(server);
  fs.mkdirSync(path.dirname(SNAP), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'test', 'out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'test', 'out', 'api.json'), JSON.stringify(got, null, 1));
  if (record) { fs.writeFileSync(SNAP, JSON.stringify(got, null, 1) + '\n'); log(`  recorded ${Object.keys(got).length} responses`); return 0; }
  const want = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  let failed = 0;
  for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) {
    const d = diffJSON(want[k], got[k]);
    if (d.length) { failed++; log(`  ✗ ${k}\n      ${d.slice(0, 8).join('\n      ')}${d.length > 8 ? `\n      …and ${d.length - 8} more` : ''}`); }
  }
  log(failed ? `  ${failed} of ${Object.keys(want).length} responses differ` : `  ✓ all ${Object.keys(want).length} responses match`);
  return failed;
}
