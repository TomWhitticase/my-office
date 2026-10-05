#!/usr/bin/env node
// my-office: tails Claude Code's on-disk state and streams it to a browser (overview + 3D office).
//
// Sources (all read-only):
//   ~/.claude/sessions/<pid>.json              live session registry (name, status, cwd)
//   ~/.claude/projects/**/<session>.jsonl      transcripts (tokens, tools, prompts, subagents)
//   ~/.claude/my-office/statusline/<sid>.json  latest status line payload (cost, context, limits), written by bin/statusline-tap.sh
//   ~/.claude/powerline/usage/day-*.json       claude-powerline's daily cost cache (history)
//
// This file is the entry point: config, http routing and the /events stream. The work is in server/: transcripts, state (the
// registry and the state pushed every second), sessions-send, tv-browser, repos, john, machine, office-settings, security, util.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { safeJSON, clients } = require('./server/util');
const { TV_UA_TAG, trustedHost, deny } = require('./server/security');
const { office, putOffice } = require('./server/office-settings');
const { listRepos, repoDetail, treeJob, repoBlob } = require('./server/repos');
const { MAX_EVENTS, transcripts, bySession, listTranscripts } = require('./server/transcripts');
const S = require('./server/state');   // live values: S.registry, S.procStats, S.state, S.stateJSON
const { readRegistry, pollProcs, tick, transcriptSummary, subagentsOf } = S;
const { machineJSON } = require('./server/machine');
const { JOHN, askJohn } = require('./server/john');
const { SEND_MAX, sending, routeOf, sendToSession } = require('./server/sessions-send');
const TV = require('./server/tv-browser');   // live values: TV.tvs, TV.adsSent
const { putTv, tvUpgrade } = TV;

// config.json (written by `npm run setup`) holds owner name, location and port; env vars override.
const CONFIG = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; } })();
const PORT = Number(process.env.PORT || CONFIG.port || 7777);
const HOST = process.env.HOST || CONFIG.host || '127.0.0.1';

// ---------- http ----------
const INDEX = path.join(__dirname, 'public', 'index.html');
const STATIC_ROOTS = [
  ['/vendor/three/', path.join(__dirname, 'node_modules', 'three')],
  ['/', path.join(__dirname, 'public')],
];
const MIME = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveStatic(pathname, res) {
  for (const [prefix, root] of STATIC_ROOTS) {
    if (!pathname.startsWith(prefix)) continue;
    const file = path.resolve(root, '.' + decodeURIComponent(pathname.slice(prefix.length - 1)));
    if (!file.startsWith(root + path.sep)) break;
    return fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': prefix === '/' ? 'no-store' : 'max-age=86400' });
      fs.createReadStream(file).pipe(res);
    });
  }
  res.writeHead(404); res.end();
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`retry: 2000\ndata: ${S.stateJSON}\n\nevent: tvs\ndata: ${JSON.stringify(TV.tvs)}\n\nevent: tvads\ndata: ${TV.adsSent || '{}'}\n\nevent: office\ndata: ${JSON.stringify(office)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/api/config') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ owner: CONFIG.owner || '', city: CONFIG.city || '', lat: CONFIG.lat ?? 51.5, lon: CONFIG.lon ?? -0.13 }));
  }
  if (url.pathname === '/api/office') {
    if (req.method !== 'PUT') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(office)); }
    if (deny(req, res)) return;
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try { const saved = putOffice(JSON.parse(body || '{}')); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(saved)); }
      catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (url.pathname === '/api/tvs') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(TV.tvs));
  }
  const tv = url.pathname.match(/^\/api\/tvs\/([\w-]{1,40})$/);
  if (tv && req.method === 'PUT') {
    if (deny(req, res)) return;
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy(); });
    req.on('end', () => {
      try {
        const saved = putTv(tv[1], JSON.parse(body || '{}'));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(saved));
      } catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (url.pathname === '/api/john') {
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    if (deny(req, res)) return;
    if (!/^(127\.|::1$|::ffff:127\.)/.test(req.socket.remoteAddress || '')) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'refused: John only talks to people on this computer' })); }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 32768) req.destroy(); });
    req.on('end', async () => {
      const reply = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const j = safeJSON(body) || {}, text = String(j.text ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return reply(400, { error: 'empty message' });
      if (text.length > JOHN.max) return reply(400, { error: `too long (${text.length} of ${JOHN.max} characters)` });
      const now = Date.now(); JOHN.at = JOHN.at.filter((t) => now - t < 60e3);
      if (JOHN.busy) return reply(429, { error: 'John’s still answering the last one' });
      if (JOHN.at.length >= JOHN.perMin) return reply(429, { error: 'John holds up a finger: give him a minute' });
      const history = (Array.isArray(j.history) ? j.history : []).slice(-10).map((h) => ({ role: h?.role === 'john' ? 'john' : 'user', text: String(h?.text ?? '').slice(0, JOHN.max) }));
      JOHN.busy = true; JOHN.at.push(now);
      try { reply(200, await askJohn(text, history)); }
      catch (e) { reply(500, { error: e.message }); }
      finally { JOHN.busy = false; }
    });
    return;
  }
  if (url.pathname === '/api/machine') {
    machineJSON().then((json) => { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(json); });
    return;
  }
  // Your GitHub repos, for THE ARCHIVE. Private ones included, so: our own Host, never a TV, and no cross-site fetches.
  const repo = url.pathname.match(/^\/api\/repos(?:\/([\w.-]{1,100})\/([\w.-]{1,100})(?:\/(tree|blob))?)?$/);
  if (repo) {
    const ua = req.headers['user-agent'] || '', reply = (code, o) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (req.method !== 'GET') return reply(405, { error: 'GET only' });
    if (/^\.\.?$/.test(repo[1]) || /^\.\.?$/.test(repo[2])) return reply(400, { error: 'bad repo' });
    if (!trustedHost(req.headers.host || '') || ua.includes(TV_UA_TAG) || /^(cross-site|same-site)$/.test(req.headers['sec-fetch-site'] || '')) return reply(403, { error: 'refused' });
    const ref = url.searchParams.get('ref') || '', file = url.searchParams.get('path') || '';
    if (repo[3] === 'blob' && (!/^[0-9a-f]{40}$/i.test(ref) || !file || file.length > 1024 || file.split('/').some((x) => !x || x === '.' || x === '..'))) return reply(400, { error: 'bad path or ref' });
    if (repo[3] === 'tree') { const r = treeJob(repo[1], repo[2]); return reply(r.status, r.body); }
    (repo[3] === 'blob' ? repoBlob(repo[1], repo[2], ref, file) : repo[1] ? repoDetail(repo[1], repo[2]) : listRepos()).then((o) => reply(200, o), (e) => reply(e.signin ? 401 : 502, { error: e.message, signin: !!e.signin }));
    return;
  }
  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(S.stateJSON);
  }
  // The conversation for the in-office chat. ?seq= is the last seq the client has; unchanged means no messages are sent.
  const chat = url.pathname.match(/^\/api\/session\/([\w-]+)\/chat$/);
  if (chat) {
    const tr = transcripts.get(bySession.get(chat[1])), seq = tr?.chatSeq ?? 0;
    const body = url.searchParams.get('seq') === String(seq) ? { seq } : { seq, messages: tr?.chat.slice(-150) || [] };
    if (!url.searchParams.has('route')) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(body)); }
    // ?route also says whether (and how) a message could be delivered, so the chat can say so before you type.
    routeOf(chat[1]).then(({ term }) => ({ route: term.route }), (e) => ({ cantSend: e.message })).then((o) => {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ...body, ...o }));
    });
    return;
  }
  const send = url.pathname.match(/^\/api\/session\/([\w-]+)\/send$/);
  if (send) {
    if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
    if (deny(req, res)) return;
    // Driving an agent is for this machine only, even when the dashboard is shared on the network (HOST in config.json).
    if (!/^(127\.|::1$|::ffff:127\.)/.test(req.socket.remoteAddress || '')) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'refused: sending is only allowed from this computer' })); }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', async () => {
      const id = send[1], reply = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const text = String(safeJSON(body)?.text ?? '').replace(/\r\n?/g, '\n').trim();
      if (!text) return reply(400, { error: 'empty message' });
      if (text.length > SEND_MAX) return reply(400, { error: `too long (${text.length} of ${SEND_MAX} characters)` });
      if (sending.has(id)) return reply(409, { error: 'still sending the previous message' });
      sending.add(id);
      try { reply(200, await sendToSession(id, text)); }
      catch (e) { console.log(`[send] ${id}: refused: ${e.message}`); reply(422, { error: e.message }); }
      finally { sending.delete(id); }
    });
    return;
  }
  const m = url.pathname.match(/^\/api\/session\/([\w-]+)$/);
  if (m) {
    const file = bySession.get(m[1]);
    const tr = file && transcripts.get(file);
    if (!tr) { res.writeHead(404); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ...transcriptSummary(tr, { events: MAX_EVENTS }), subagents: subagentsOf(m[1]) }));
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return fs.createReadStream(INDEX).pipe(res);
  }
  serveStatic(url.pathname, res);
});

const t0 = Date.now();
listTranscripts();
readRegistry();
tick();
console.log(`indexed ${transcripts.size} transcripts in ${Date.now() - t0}ms`);
setInterval(tick, 1000);
setInterval(listTranscripts, 15000);
setInterval(pollProcs, 3000);
pollProcs();
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);
server.on('upgrade', tvUpgrade);
server.listen(PORT, HOST, () => console.log(`my-office on http://${HOST}:${PORT}`));
