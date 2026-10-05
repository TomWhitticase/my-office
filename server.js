#!/usr/bin/env node
// my-office: tails Claude Code's on-disk state and streams it to a browser (overview + 3D office).
//
// Sources (all read-only):
//   ~/.claude/sessions/<pid>.json              live session registry (name, status, cwd)
//   ~/.claude/projects/**/<session>.jsonl      transcripts (tokens, tools, prompts, subagents)
//   ~/.claude/my-office/statusline/<sid>.json  latest status line payload (cost, context, limits), written by bin/statusline-tap.sh
//   ~/.claude/powerline/usage/day-*.json       claude-powerline's daily cost cache (history)

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { CLAUDE, safeJSON, readJSON, clip, pidAlive, ts, hourKey, minuteKey, binOf, run, clients } = require('./server/util');
const { TV_UA_TAG, trustedHost, deny } = require('./server/security');
const { office, putOffice } = require('./server/office-settings');
const { listRepos, repoDetail, treeJob, repoBlob } = require('./server/repos');
const { MAX_EVENTS, transcripts, bySession, listTranscripts } = require('./server/transcripts');
const S = require('./server/state');   // live values: S.registry, S.procStats, S.state, S.stateJSON
const { ownPids, readRegistry, pollProcs, tick, transcriptSummary, subagentsOf } = S;
const { machineJSON } = require('./server/machine');

// config.json (written by `npm run setup`) holds owner name, location and port; env vars override.
const CONFIG = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; } })();
const PORT = Number(process.env.PORT || CONFIG.port || 7777);
const HOST = process.env.HOST || CONFIG.host || '127.0.0.1';

// ---------- John, the server hall's sysadmin ----------
// POST /api/john { text, history: [{ role: 'user' | 'john', text }] } -> { reply }. One `claude -p` per question: Haiku, no
// tools, no MCP, no customisations, nothing persisted; John only ever sees the snapshot below, so he can't run anything.
// One at a time, a few a minute, from this machine only. No claude CLI: { reply, lunch: true }.
const JOHN = { busy: false, at: [], pids: ownPids, max: 600, perMin: 8 };
const JOHN_BIN = () => binOf('claude') || [path.join(os.homedir(), '.local/bin/claude'), path.join(os.homedir(), '.claude/local/claude')].find((p) => fs.existsSync(p));
const JOHN_PERSONA = `You are John, the sysadmin who looks after the server hall on floor 47 of this office building. You're in your fifties,
grey hair in a ponytail, flannel shirt, a mug of terrible coffee; grizzled, dry, friendly, been doing this since the dial-up days.
The "servers" in the hall are really one machine (described below) and the Claude Code sessions running on it: each live session
is a 2U unit in racks A01-A03, the machine itself is in B01-B03 (CPU, memory, load, disks, UPS, switches), and the NOC wall shows
the graphs. Someone has walked up to your desk to ask you something.
Rules: answer in character, in 1-4 short sentences of plain spoken English (no markdown, no lists, no *actions*). Ground every
fact in the SNAPSHOT; never invent incidents, numbers, processes or sessions that aren't in it, and if it isn't there say you'd
have to check. You can't run commands or touch anything from this chat, so don't offer to. Friendly opinions and sysadmin
war stories are fine as long as they're clearly yours and not claims about this machine.`;
function johnSnapshot(m) {
  const st = S.state || {}, t = st.totals || {}, GB = (b) => (b / 2 ** 30).toFixed(1), rate = (b) => `${(b / 1024).toFixed(0)} KB/s`;
  const cpu = m.cores?.length ? Math.round(m.cores.reduce((a, b) => a + b, 0) / m.cores.length) : '?';
  const L = [`Time now: ${new Date().toLocaleString()}`,
    `Machine: ${m.hostname}, ${m.os} ${m.arch}, ${m.cpuModel || ''}, up ${(m.uptime / 3600).toFixed(1)} h`,
    `CPU: ${cpu}% average over ${m.cores?.length} cores (per core: ${(m.cores || []).join(' ')}); load ${(m.load || []).map((v) => v.toFixed(2)).join(' / ')} (1/5/15 min)`,
    m.mem && `Memory: ${GB(m.mem.used)} of ${GB(m.mem.total)} GB used (${Math.round(m.mem.used / m.mem.total * 100)}%)`,
    `Disks: ${(m.disks || []).map((d) => `${d.mount} ${GB(d.used)}/${GB(d.size)} GB (${Math.round(d.used / d.size * 100)}%)`).join('; ') || 'unknown'}`,
    m.net && `Network: in ${rate(m.net.rx)}, out ${rate(m.net.tx)}`,
    m.battery && `Battery: ${m.battery.pct}% (${m.battery.state}${m.battery.ac ? ', on mains' : ', on battery'})`,
    `Top processes by CPU: ${(m.top || []).slice(0, 6).map((p) => `${p.name} ${p.cpu}% ${p.rssMB} MB`).join('; ')}`,
    `Claude Code sessions live: ${(st.live || []).length} (${t.working || 0} working)`,
    ...(st.live || []).slice(0, 20).map((s) => `- ${s.name || s.sessionId.slice(0, 8)}: ${s.status}${s.transcript?.title ? `, "${String(s.transcript.title).slice(0, 80)}"` : ''}${s.transcript?.branch ? `, branch ${s.transcript.branch}` : ''}${s.statusline?.model ? `, ${s.statusline.model}` : ''}, CPU ${s.proc?.cpu ?? '?'}%, RSS ${s.proc?.rssMB ?? '?'} MB, cost so far $${(s.cost || 0).toFixed(2)}${s.transcript?.pendingTool ? `, running ${s.transcript.pendingTool.name}` : ''}`),
    `Today: $${(t.todayCost || 0).toFixed(2)} API-equivalent across ${t.todaySessions || 0} sessions, ${Math.round((t.todayTokens || 0) / 1e3)}k tokens`];
  return L.filter(Boolean).join('\n');
}
async function askJohn(text, history) {
  const bin = JOHN_BIN();
  if (!bin) return { reply: 'John’s on his lunch break. (No claude CLI on this machine, so he can’t answer.)', lunch: true };
  const m = JSON.parse(await machineJSON() || '{}');
  const convo = history.map((h) => `${h.role === 'john' ? 'John' : 'Visitor'}: ${h.text}`).join('\n');
  const prompt = `SNAPSHOT (live, just taken):\n${johnSnapshot(m)}\n\n${convo ? `CONVERSATION SO FAR:\n${convo}\n\n` : ''}Visitor: ${text}\nJohn:`;
  return new Promise((resolve) => {
    const c = spawn(bin, ['-p', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence', '--disable-slash-commands',
      '--output-format', 'text', '--system-prompt', JOHN_PERSONA], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'my-office-john' } });
    JOHN.pids.add(c.pid);
    let out = '', err = '';
    const done = (r) => { clearTimeout(timer); JOHN.pids.delete(c.pid); resolve(r); };
    const timer = setTimeout(() => { c.kill('SIGKILL'); }, 60e3);
    c.stdout.on('data', (d) => { out += d; if (out.length > 8000) c.kill(); });
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', () => done({ reply: 'John’s on his lunch break. (The claude CLI wouldn’t start.)', lunch: true }));
    c.on('close', (code) => {
      const reply = out.trim().replace(/^John:\s*/i, '').slice(0, 1500);
      if (/not logged in|please run \/login/i.test(out + err)) done({ reply: 'John’s on his lunch break. (The claude CLI here isn’t logged in.)', lunch: true });
      else if (code === 0 && reply) done({ reply });
      else { console.log(`[john] claude exited ${code}: ${err.trim().slice(0, 300)}`); done({ reply: 'John squints at his screen and mutters something about the coffee machine. (He couldn’t answer just now; try again in a minute.)', error: true }); }
    });
    c.stdin.end(prompt);
  });
}

// ---------- office TVs ----------
// Each wall TV in the 3D office is a live tab in a real browser on this machine. Config lives in ~/.claude/my-office/tvs.json:
// { id: { url, refresh, volume, muted, adblock, at } }. `at` changes whenever the URL is (re)set, which (re)loads the tab;
// volume, mute and ad blocking are patched on their own so the page keeps playing.
const TVS_FILE = path.join(CLAUDE, 'my-office', 'tvs.json');
let tvs = readJSON(TVS_FILE) || {};
for (const c of Object.values(tvs)) { delete c.src; delete c.blocked; c.volume ??= 100; c.muted ??= false; c.adblock ??= true; c.at ??= 0; }   // pre-browser entries
function sendTvs() { const json = JSON.stringify(tvs); for (const res of clients) res.write(`event: tvs\ndata: ${json}\n\n`); }
function putTv(id, body) {
  const prev = tvs[id], vol = (v, d) => Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : d;
  const refresh = (v, d) => 'refresh' in body ? Math.min(86400, Math.max(0, Math.round(Number(v) || 0))) : d;
  const adblock = 'adblock' in body ? !!body.adblock : prev?.adblock ?? true;
  if ('url' in body) {
    const url = String(body.url || '').trim();
    if (!url) delete tvs[id];
    else {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol) || url.length > 2048) throw new Error('only http(s) URLs');
      lastFrames.delete(id);
      tvs[id] = { url: u.href, refresh: refresh(body.refresh, 0), volume: vol(body.volume, prev?.volume ?? 100), muted: 'muted' in body ? !!body.muted : !!prev?.muted, adblock, at: Date.now() };
    }
  } else if (prev) Object.assign(prev, { volume: vol(body.volume, prev.volume), muted: 'muted' in body ? !!body.muted : prev.muted, adblock, refresh: refresh(body.refresh, prev.refresh) });
  else throw new Error('that TV is off');
  fs.mkdirSync(path.dirname(TVS_FILE), { recursive: true });
  fs.writeFileSync(TVS_FILE, JSON.stringify(tvs, null, 2));
  sendTvs();
  tvSync();
  return tvs[id] || null;
}

// ---------- TV browser ----------
// One headless Chrome, launched when a TV is first needed, with its own persistent profile (log in once on a TV and it
// sticks). New-style headless still plays sound through the speakers, and has no window or Dock icon to steal focus.
// CDP runs over --remote-debugging-pipe, so there is no debugging port at all. Each TV gets a tab, screencast only while
// an office client is looking at it; tabs nobody needs are frozen after 30 s and closed after 3 min (reopening where they
// left off), and the browser quits with its last tab, so with nobody near a TV it costs nothing.
const TV_PROFILE = path.join(CLAUDE, 'my-office', 'tv-browser');
const TV_FRAMES = path.join(CLAUDE, 'my-office', 'tv-frames');   // last frame per TV, shown until it's live again
const TV_W = 1280, TV_H = 720, TV_MAX_TABS = 8, TV_MAX_CASTS = 4;
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
const UA_OS = { darwin: 'Macintosh; Intel Mac OS X 10_15_7', win32: 'Windows NT 10.0; Win64; x64' }[process.platform] || 'X11; Linux x86_64';
// Volume for every <video>/<audio> in a frame, set by the server (starts silent until it knows how close you are), and
// __tvHold to pause playing media while the tab is frozen (freezing alone leaves video decoding running).
const TV_VOL_JS = `(() => { if (window.__tvVol) return; let v = 0, held = [];
  const set = (m) => { if (Math.abs(m.volume - v) > 0.005) m.volume = v; };
  window.__tvVol = (x) => { v = x; document.querySelectorAll('video, audio').forEach(set); };
  window.__tvHold = (on) => { if (on) { held = [...document.querySelectorAll('video, audio')].filter((m) => !m.paused); held.forEach((m) => m.pause()); } else { held.forEach((m) => m.play().catch(() => {})); held = []; } };
  for (const ev of ['play', 'playing', 'volumechange', 'loadedmetadata']) addEventListener(ev, (e) => e.target instanceof HTMLMediaElement && set(e.target), true);
  const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { set(this); return play.apply(this, arguments); }; })()`;

// Ad blocking. Branded Chrome ignores --load-extension, so the server is the ad blocker: every request from a TV tab (its
// out-of-process iframes and workers too) pauses in the Fetch domain and fails if its host, or a parent domain, is on
// StevenBlack's unified hosts list (fetched weekly into ~/.claude/my-office/adblock, a few obvious ad networks built in for
// when it can't be). ADS_JS hides common ad slots and skips YouTube's in-stream ads. `adblock: false` on a TV turns it off.
const ADS_DIR = path.join(CLAUDE, 'my-office', 'adblock'), ADS_FILE = path.join(ADS_DIR, 'hosts');
const ADS_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts';
const adHosts = new Set(['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'amazon-adsystem.com',
  'taboola.com', 'outbrain.com', 'criteo.com', 'criteo.net', 'adnxs.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com',
  'adsrvr.org', 'moatads.com', 'smartadserver.com', 'teads.tv', 'media.net', '33across.com', 'indexww.com', 'adform.net', 'serving-sys.com', 'scorecardresearch.com']);
const AD_ALLOW = new Set(['cookielaw.org', 'onetrust.com', 'cookiebot.com', 'privacy-mgmt.com']);   // consent platforms: blocked, their banners can't be closed
const AD_PATHS = /^https:\/\/(www\.|m\.)?youtube\.com\/(pagead\/|api\/stats\/ads|ptracking|get_midroll_)/;
const adsBlocked = new Map();   // tv id -> requests blocked since the server started
let adsSent = '';
(async () => {
  let text = '', age = Infinity;
  try { age = Date.now() - fs.statSync(ADS_FILE).mtimeMs; text = fs.readFileSync(ADS_FILE, 'utf8'); } catch {}
  if (age > 7 * 864e5) try {
    const res = await fetch(ADS_URL, { signal: AbortSignal.timeout(30000) });
    const t = res.ok && await res.text();
    if (!/^0\.0\.0\.0 \S+\.\S+$/m.test(t || '')) throw new Error(`HTTP ${res.status}`);
    fs.mkdirSync(ADS_DIR, { recursive: true }); fs.writeFileSync(ADS_FILE, text = t);
  } catch (e) { console.error('adblock list:', e.message, text ? '(using the cached copy)' : '(using the built-in list)'); }
  for (const m of text.matchAll(/^0\.0\.0\.0[ \t]+([\w.-]+\.[a-z][\w-]*)\s*$/gim)) adHosts.add(m[1].toLowerCase());
  console.log(`adblock: ${adHosts.size} domains`);
})();
function isAd(url) {
  if (AD_PATHS.test(url)) return true;
  let h; try { h = new URL(url).hostname; } catch { return false; }
  const up = [];   // the host and its parent domains
  for (let i = 0; i >= 0; i = h.indexOf('.'), h = h.slice(i + 1)) up.push(h);
  return !up.some((d) => AD_ALLOW.has(d)) && up.some((d) => adHosts.has(d));
}
const ADS_CSS = `ins.adsbygoogle, [id^="google_ads_iframe"], [id^="div-gpt-ad"], [data-google-query-id], [data-ad-slot], [data-ad-unit],
  iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"], iframe[src*="amazon-adsystem.com"], amp-ad, amp-embed[type="taboola"],
  [id^="taboola-"], .trc_related_container, .OUTBRAIN, .ob-widget, [aria-label="Advertisement" i], .ad-slot, .adslot, .ad-banner, .ad-unit,
  .advertisement, .adsbox, #player-ads, #masthead-ad, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer,
  ytd-display-ad-renderer, ytd-companion-slot-renderer, .ytp-ad-overlay-container, .ytp-ad-overlay-slot,
  ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer), .mm-ads-gpt-adunit, .mm-ads-leaderboard-header, .banner-adverts,
  .mol-ads-label-container, .billboard-container:has(> .mol-ads-label-container) { display: none !important; }`;
// Consent banners: "Reject all" on the common consent platforms (OneTrust, Google Funding Choices, Cookiebot, Didomi, Google's and YouTube's own),
// for the first 20 s of a page. Rejecting is always allowed, and means fewer ads and trackers.
const CONSENT_REJECT = '#onetrust-reject-all-handler, .fc-cta-do-not-consent, #CybotCookiebotDialogBodyButtonDecline, #didomi-notice-disagree-button';
// __tvAds(on) per document. On YouTube, while #movie_player shows an ad: mute it, jump to its end, press Skip; unmuting
// after fires volumechange, so the volume hook puts the TV's level back.
const ADS_JS = `(() => { if (window.__tvAds) return window.__tvAds(true);
  const css = new CSSStyleSheet(); css.replaceSync(${JSON.stringify(ADS_CSS)});
  const adopt = () => { if (!document.adoptedStyleSheets.includes(css)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, css]; };
  let on = true, muted = null, timer = 0;
  const yt = /(^|\\.)youtube(-nocookie)?\\.com$/.test(location.hostname) && (() => {
    const p = document.querySelector('#movie_player, .html5-video-player'), v = p?.querySelector('video');
    if (on && v && p.matches('.ad-showing, .ad-interrupting')) {
      if (!v.muted) { v.muted = true; muted = v; }
      if (v.duration > 0 && Number.isFinite(v.duration) && v.currentTime < v.duration - 0.1) v.currentTime = v.duration;
      p.querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern').forEach((b) => b.click());
    } else if (muted) { muted.muted = false; muted = null; }
  });
  const google = /(^|\.)google\.[a-z.]+$/.test(location.hostname), consent = /^consent\.(google|youtube)\./.test(location.hostname);
  const reject = setInterval(() => { if (!on || performance.now() > 20000) return performance.now() > 20000 && clearInterval(reject);
    const b = document.querySelector(${JSON.stringify(CONSENT_REJECT)} + (google ? ', #W0wltc' : '') + (consent ? ', button[aria-label^="Reject all"]' : '') + (yt ? ', ytd-consent-bump-v2-lightbox button[aria-label^="Reject"]' : ''));
    if (b?.getClientRects().length) b.click(); }, 500);
  window.__tvAds = (x) => { on = x; css.disabled = !x; if (x) adopt(); if (yt) { clearInterval(timer); timer = x && setInterval(yt, 250); yt(); } };
  addEventListener('DOMContentLoaded', () => on && adopt());
  window.__tvAds(true); })()`;
function adScript(tab, s, on) {   // (un)register ADS_JS for new documents in one CDP session
  const id = tab.adScripts.get(s);
  tab.adScripts.delete(s);
  return Promise.all([id && cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: id }, s),
    on && cdp('Page.addScriptToEvaluateOnNewDocument', { source: ADS_JS }, s).then((r) => tab.adScripts.set(s, r.identifier))]);
}
const FETCH_ALL = { patterns: [{ urlPattern: '*', requestStage: 'Request' }] };
let chrome = null;   // { proc, send, ready }
const tabs = new Map();   // tv id -> { id, targetId, sid, kids, adScripts, ads, at, cast, vol, frozen, neededAt, loadedAt, page }
const tvSessions = new Map();   // CDP session -> tab (the page and its out-of-process iframes)
const lastFrames = new Map();   // tv id -> { jpeg, saved }
const resumeAt = new Map();   // tv id -> { url, at }: page a closed tab was showing, reopened if its config hasn't changed

function startChrome() {
  if (chrome) return chrome.ready;
  if (!CHROME) return Promise.reject(new Error('no Chrome found (set CHROME_PATH)'));
  const c = chrome = { pending: new Map(), seq: 0 };
  c.ready = (async () => {
    // A TV browser left behind by a server that died hard still holds the profile.
    await new Promise((r) => execFile('pkill', ['-f', `user-data-dir=${TV_PROFILE}`], () => setTimeout(r, 300)));
    const ver = await new Promise((r) => execFile(CHROME, ['--version'], (e, out) => r(String(out).match(/(\d+)\.\d+\.\d+\.\d+/)?.[1] || '140')));
    const proc = c.proc = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${TV_PROFILE}`, '--no-first-run', '--no-default-browser-check',
      '--use-mock-keychain', '--password-store=basic', '--autoplay-policy=no-user-gesture-required', '--disable-blink-features=AutomationControlled',
      `--user-agent=Mozilla/5.0 (${UA_OS}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36 ${TV_UA_TAG}`, `--window-size=${TV_W},${TV_H}`, 'about:blank'],
      { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    let buf = '';
    proc.stdio[4].setEncoding('utf8');
    proc.stdio[4].on('data', (d) => {
      buf += d;
      for (let i; (i = buf.indexOf('\0')) >= 0; buf = buf.slice(i + 1)) {
        let m; try { m = JSON.parse(buf.slice(0, i)); } catch { continue; }
        const p = m.id && c.pending.get(m.id);
        if (p) { c.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
        else if (m.method) try { cdpEvent(m); } catch (e) { console.error('tv', m.method, e.message); }
      }
    });
    proc.stdio[3].on('error', () => {});
    proc.on('exit', () => {
      console.log('tv browser exited');
      for (const p of c.pending.values()) p.reject(new Error('browser exited'));
      if (chrome === c) { chrome = null; tabs.clear(); tvSessions.clear(); }
    });
    c.send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      if (proc.exitCode !== null) return reject(new Error('browser exited'));
      const id = ++c.seq;
      c.pending.set(id, { resolve, reject });
      proc.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
    await c.send('Target.setDiscoverTargets', { discover: true });
    await c.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    console.log(`tv browser up (Chrome ${ver}, pid ${proc.pid})`);
  })();
  c.ready.catch((e) => { console.error('tv browser', e.message); if (chrome === c) chrome = null; });
  return c.ready;
}
const cdp = (method, params, sid) => chrome?.send ? chrome.send(method, params, sid) : Promise.reject(new Error('no browser'));
function stopChrome() {
  const c = chrome;
  if (!c?.proc) return;
  chrome = null; tabs.clear(); tvSessions.clear();
  c.send('Browser.close').catch(() => {});
  setTimeout(() => { try { process.kill(-c.proc.pid, 'SIGKILL'); } catch {} }, 2000).unref();
}

async function openTab(id) {
  const tab = { id, kids: new Set(), adScripts: new Map(), ads: tvs[id].adblock !== false, at: tvs[id].at, cast: 0, vol: -1, frozen: false, neededAt: Date.now(), page: {} };
  tabs.set(id, tab);
  try {
    await startChrome();
    tab.targetId = (await cdp('Target.createTarget', { url: 'about:blank', newWindow: true, background: true })).targetId;
    const sid = (await cdp('Target.attachToTarget', { targetId: tab.targetId, flatten: true })).sessionId;
    tvSessions.set(sid, tab);
    await Promise.all([
      cdp('Page.enable', {}, sid),
      cdp('Page.addScriptToEvaluateOnNewDocument', { source: TV_VOL_JS }, sid),
      cdp('Fetch.enable', FETCH_ALL, sid),
      tab.ads && adScript(tab, sid, true),
      cdp('Emulation.setDeviceMetricsOverride', { width: TV_W, height: TV_H, deviceScaleFactor: 1, mobile: false }, sid),
      cdp('Emulation.setFocusEmulationEnabled', { enabled: true }, sid),
      cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid),
    ]);
    if (tabs.get(id) !== tab || !tvs[id]) throw new Error('gone');
    tab.sid = sid;
    const r = resumeAt.get(id);
    navTab(tab, r && r.at === tab.at ? r.url : tvs[id].url);
  } catch (e) {
    if (tabs.get(id) === tab) tabs.delete(id);
    if (tab.targetId) cdp('Target.closeTarget', { targetId: tab.targetId }).catch(() => {});
    if (e.message !== 'gone') console.error('tv tab', id, e.message);
  }
  tvSync();
}
function closeTab(tab) {
  tabs.delete(tab.id);
  if (/^https?:/.test(tab.page.url || '')) resumeAt.set(tab.id, { url: tab.page.url, at: tab.at });
  saveFrame(tab.id);
  for (const s of [tab.sid, ...tab.kids]) tvSessions.delete(s);
  if (tab.targetId) cdp('Target.closeTarget', { targetId: tab.targetId }).catch(() => {});
  if (!tabs.size) stopChrome();
}
function navTab(tab, url) {
  tab.loadedAt = Date.now();
  cdp('Page.navigate', { url }, tab.sid).catch(() => {});
}
function setVol(tab, v) {
  tab.vol = v;
  for (const s of [tab.sid, ...tab.kids]) cdp('Runtime.evaluate', { expression: `window.__tvVol?.(${v})` }, s).catch(() => {});
}

function cdpEvent(m) {
  const p = m.params || {}, tab = tvSessions.get(m.sessionId);
  switch (m.method) {
    case 'Page.screencastFrame':
      cdp('Page.screencastFrameAck', { sessionId: p.sessionId }, m.sessionId).catch(() => {});
      // While an auto-refresh reloads the page, keep showing the last frame instead of the blank page in between.
      if (tab && m.sessionId === tab.sid && !(tab.holdUntil > Date.now())) tvFrame(tab, p.data);
      return;
    case 'Page.domContentEventFired': case 'Page.loadEventFired':
      if (tab) setVol(tab, tab.vol);   // a fresh document starts silent
      if (tab && m.method === 'Page.loadEventFired' && tab.holdUntil > Date.now()) tab.holdUntil = Date.now() + 400;   // let it paint first
      return;
    case 'Page.javascriptDialogOpening':   // nobody is there to answer alerts or "leave this page?"
      cdp('Page.handleJavaScriptDialog', { accept: true }, m.sessionId).catch(() => {});
      return;
    case 'Inspector.targetCrashed':
      if (tab && m.sessionId === tab.sid) closeTab(tab);
      return;
    case 'Fetch.requestPaused': {   // every request a TV makes; the TV's own page always loads
      const block = tab?.ads && !(p.resourceType === 'Document' && p.frameId === tab.targetId) && isAd(p.request.url);
      if (block) adsBlocked.set(tab.id, (adsBlocked.get(tab.id) || 0) + 1);
      cdp(block ? 'Fetch.failRequest' : 'Fetch.continueRequest', block ? { requestId: p.requestId, errorReason: 'BlockedByClient' } : { requestId: p.requestId }, m.sessionId).catch(() => {});
      return;
    }
    case 'Target.attachedToTarget': {   // out-of-process iframes (e.g. a YouTube embed) need the volume hook and ad blocker too, workers the blocker
      const s = p.sessionId, frame = p.targetInfo.type === 'iframe', run = () => cdp('Runtime.runIfWaitingForDebugger', {}, s).catch(() => {});
      if (!tab || !(frame || /worker/.test(p.targetInfo.type))) { if (p.waitingForDebugger) run(); return; }
      tvSessions.set(s, tab);
      const setup = [cdp('Fetch.enable', FETCH_ALL, s)];
      if (frame) {
        tab.kids.add(s);
        setup.push(cdp('Page.enable', {}, s), cdp('Page.addScriptToEvaluateOnNewDocument', { source: TV_VOL_JS }, s),
          cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, s), tab.ads && adScript(tab, s, true));
      }
      Promise.allSettled(setup).then(() => {   // the frame starts loading only now, so none of its requests slip past
        run();
        if (frame) cdp('Runtime.evaluate', { expression: `${TV_VOL_JS}; window.__tvVol(${tab.vol})` }, s).catch(() => {});
      });
      return;
    }
    case 'Target.detachedFromTarget':
      if (tab) { tab.kids.delete(p.sessionId); tab.adScripts.delete(p.sessionId); tvSessions.delete(p.sessionId); }
      return;
    case 'Target.targetCreated': case 'Target.targetInfoChanged': {
      const ti = p.targetInfo;
      if (ti.type !== 'page') return;
      const own = [...tabs.values()].find((t) => t.targetId === ti.targetId);
      if (own) {
        own.page = { url: ti.url, title: ti.title };
        const json = JSON.stringify({ t: 'page', id: own.id, ...own.page });
        for (const cl of tvClients) wsSend(cl.sock, 1, json);
        return;
      }
      // A popup (target=_blank, window.open): show it on the TV that opened it, or the one in use, instead.
      const opener = [...tabs.values()].find((t) => t.targetId === ti.openerId) || tabs.get(tvUsed);
      if (/^https?:/.test(ti.url) && opener?.sid) { navTab(opener, ti.url); cdp('Target.closeTarget', { targetId: ti.targetId }).catch(() => {}); }
      else if (m.method === 'Target.targetCreated') setTimeout(() => {
        if (chrome && ![...tabs.values()].some((t) => t.targetId === ti.targetId)) cdp('Target.closeTarget', { targetId: ti.targetId }).catch(() => {});
      }, 15000);
      return;
    }
  }
}
function tvFrame(tab, b64) {
  const jpeg = Buffer.from(b64, 'base64');
  lastFrames.set(tab.id, { jpeg, saved: false });
  const msg = frameMsg(tab.id, jpeg);
  for (const cl of tvClients) if (cl.watch.has(tab.id) && cl.sock.writableLength < 4e6) wsSend(cl.sock, 2, msg);
}
function saveFrame(id) {
  const f = lastFrames.get(id);
  if (!f || f.saved) return;
  f.saved = true;
  fs.mkdirSync(TV_FRAMES, { recursive: true });
  fs.writeFile(path.join(TV_FRAMES, `${id}.jpg`), f.jpeg, () => {});
}
function lastFrame(id) {
  if (!lastFrames.has(id)) {
    const file = path.join(TV_FRAMES, `${id}.jpg`);
    try { if (fs.statSync(file).mtimeMs > (tvs[id]?.at || 0)) lastFrames.set(id, { jpeg: fs.readFileSync(file), saved: true }); } catch {}
  }
  return lastFrames.get(id)?.jpeg;
}
const frameMsg = (id, jpeg) => Buffer.concat([Buffer.from([Buffer.byteLength(id)]), Buffer.from(id), jpeg]);

// What every TV should be doing, from what the office clients are looking at and how close they are. Called on any change
// and once a second.
let tvUsed = null;
function tvSync() {
  const now = Date.now(), watch = new Map(), fade = new Map();   // id -> screencast everyNthFrame, id -> loudest client's fade
  tvUsed = null;
  for (const cl of tvClients) {
    for (const id of cl.watch) watch.set(id, Math.min(watch.get(id) || 9, id === cl.use ? 2 : 6));   // ~30 fps in use, ~10 otherwise
    for (const [id, f] of Object.entries(cl.fade)) fade.set(id, Math.max(fade.get(id) || 0, f));
    if (cl.use) tvUsed = cl.use;
  }
  for (const id of Object.keys(tvs)) if ((watch.has(id) || fade.get(id) > 0) && !tabs.has(id) && tabs.size < TV_MAX_TABS) openTab(id);
  let casts = 0;
  for (const tab of [...tabs.values()].sort((a, b) => (watch.get(a.id) || 9) - (watch.get(b.id) || 9))) {
    const c = tvs[tab.id];
    if (!c) { lastFrames.delete(tab.id); fs.rm(path.join(TV_FRAMES, `${tab.id}.jpg`), { force: true }, () => {}); closeTab(tab); continue; }
    if (!tab.sid) continue;   // still opening
    if (watch.has(tab.id) || fade.get(tab.id) > 0) tab.neededAt = now;
    const idle = now - tab.neededAt;
    if (idle > 180e3) { closeTab(tab); continue; }
    if (tab.at !== c.at) { tab.at = c.at; lastFrames.delete(tab.id); navTab(tab, c.url); }
    else if (c.refresh && !idle && tvUsed !== tab.id && now - tab.loadedAt > c.refresh * 1000) { tab.loadedAt = now; tab.holdUntil = now + 8000; cdp('Page.reload', {}, tab.sid).catch(() => {}); }
    const frozen = idle > 30e3, life = (f) => {
      tab.frozen = f;
      const hold = () => { for (const s of [tab.sid, ...tab.kids]) cdp('Runtime.evaluate', { expression: `window.__tvHold?.(${f})` }, s).catch(() => {}); };
      if (f) hold();
      cdp('Page.setWebLifecycleState', { state: f ? 'frozen' : 'active' }, tab.sid).then(f ? null : hold).catch(() => {});
    };
    if (!frozen && tab.frozen) life(false);
    const nth = !frozen && watch.has(tab.id) && casts++ < TV_MAX_CASTS ? watch.get(tab.id) : 0;
    if (nth !== tab.cast) {
      if (tab.cast) { cdp('Page.stopScreencast', {}, tab.sid).catch(() => {}); saveFrame(tab.id); }
      if (nth && !tab.cast) cdp('Page.captureScreenshot', { format: 'jpeg', quality: 70 }, tab.sid).then((r) => tab.cast && tvFrame(tab, r.data)).catch(() => {});   // a still page sends no screencast frames until it changes
      if (nth) cdp('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: TV_W, maxHeight: TV_H, everyNthFrame: nth }, tab.sid).catch(() => {});
      tab.cast = nth;
    }
    const vol = c.muted || frozen ? 0 : Math.round(c.volume * (fade.get(tab.id) || 0)) / 100;
    if (vol !== tab.vol) setVol(tab, vol);
    if ((c.adblock !== false) !== tab.ads) {   // switched on the Admin tab: applies at once, ads already loaded stay until a reload
      tab.ads = c.adblock !== false;
      for (const s of [tab.sid, ...tab.kids]) {
        adScript(tab, s, tab.ads).catch(() => {});
        cdp('Runtime.evaluate', { expression: tab.ads ? ADS_JS : 'window.__tvAds?.(false)' }, s).catch(() => {});
      }
    }
    if (frozen && !tab.frozen) life(true);   // after muting: a frozen page runs nothing
  }
}
setInterval(tvSync, 1000);
setInterval(() => {   // per-TV blocked counts for the Admin tab
  const json = JSON.stringify(Object.fromEntries(adsBlocked));
  if (json !== (adsSent || '{}')) { adsSent = json; for (const res of clients) res.write(`event: tvads\ndata: ${json}\n\n`); }
}, 2000);
setInterval(() => { for (const id of lastFrames.keys()) saveFrame(id); }, 30000);
const exitTvs = () => { if (chrome?.proc) try { process.kill(-chrome.proc.pid, 'SIGKILL'); } catch {} };
process.on('exit', exitTvs);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => {
  for (const id of lastFrames.keys()) { const f = lastFrames.get(id); if (!f.saved) try { fs.mkdirSync(TV_FRAMES, { recursive: true }); fs.writeFileSync(path.join(TV_FRAMES, `${id}.jpg`), f.jpeg); } catch {} }
  if (!chrome?.send) process.exit(0);
  chrome.proc.once('exit', () => process.exit(0));
  chrome.send('Browser.close').catch(() => {});   // let it flush cookies, so TV logins stick
  setTimeout(() => process.exit(0), 1500);
});

// ---------- TV socket ----------
// A minimal WebSocket server (RFC 6455, no deps) at /tv: one socket per office client. The client sends JSON (which TVs
// it's looking at, how loud each should be for it, mouse/keys/navigation for the TV in use); the server sends binary
// screencast frames ([id length][id][JPEG]) and JSON page updates. The TV browser carries the user's logins, so only
// pages served by this server itself may connect.
const tvClients = new Set();
function wsSend(sock, op, data) {
  if (sock.destroyed) return;
  if (typeof data === 'string') data = Buffer.from(data);
  const n = data.length, head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.alloc(10);
  if (n >= 65536) { head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  sock.cork(); sock.write(head); sock.write(data); sock.uncork();
}
function tvUpgrade(req, sock) {
  const host = req.headers.host || '', key = req.headers['sec-websocket-key'];
  if (new URL(req.url, 'http://x').pathname !== '/tv' || !key || !trustedHost(host) || req.headers.origin !== `http://${host}`
    || (req.headers['user-agent'] || '').includes(TV_UA_TAG)) return sock.destroy();
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${
    crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')}\r\n\r\n`);
  sock.setNoDelay(true);
  const cl = { sock, watch: new Set(), fade: {}, use: null };
  tvClients.add(cl);
  for (const id of Object.keys(tvs)) { const f = lastFrame(id); if (f) wsSend(sock, 2, frameMsg(id, f)); }
  for (const t of tabs.values()) if (t.page.url) wsSend(sock, 1, JSON.stringify({ t: 'page', id: t.id, ...t.page }));
  let buf = Buffer.alloc(0), parts = [];
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2) {
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (!(buf[1] & 128) || len > 1 << 20) return sock.destroy();   // clients must mask; nothing legit is this big
      if (buf.length < off + 4 + len) return;
      const fin = buf[0] & 128, op = buf[0] & 15, mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 8) return sock.end(Buffer.from([0x88, 0]));
      if (op === 9) { wsSend(sock, 10, data); continue; }
      if (op > 2) continue;
      parts.push(data);
      if (!fin) continue;
      const text = Buffer.concat(parts).toString(); parts = [];
      try { tvMessage(cl, JSON.parse(text)); } catch (e) { console.error('tv message', e.message); }
    }
  });
  const bye = () => { if (tvClients.delete(cl)) tvSync(); };
  sock.on('close', bye); sock.on('error', bye);
}
const KEY_TYPES = new Set(['keyDown', 'rawKeyDown', 'keyUp']), MOUSE_TYPES = new Set(['mouseMoved', 'mousePressed', 'mouseReleased', 'mouseWheel']);
function tvMessage(cl, m) {
  if (m.t === 'watch') {
    cl.watch = new Set((Array.isArray(m.ids) ? m.ids : []).filter((id) => tvs[id]).slice(0, TV_MAX_TABS));
    cl.use = tvs[m.use] ? m.use : null;
    if (cl.use) cl.watch.add(cl.use);
    return tvSync();
  }
  if (m.t === 'fade') {
    cl.fade = {};
    for (const [id, f] of Object.entries(m.fades || {})) if (tvs[id] && Number.isFinite(f)) cl.fade[id] = Math.min(1, Math.max(0, f));
    return tvSync();
  }
  // Input and navigation only go to the TV this client is using.
  const tab = tabs.get(m.id);
  if (!tab?.sid || m.id !== cl.use) return;
  const n = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0)), s = (v) => String(v ?? '').slice(0, 32);
  if (m.t === 'mouse' && MOUSE_TYPES.has(m.type)) {
    cdp('Input.dispatchMouseEvent', { type: m.type, x: n(m.x, 0, 1) * TV_W, y: n(m.y, 0, 1) * TV_H, modifiers: n(m.mods, 0, 15),
      button: ['left', 'middle', 'right'].includes(m.button) ? m.button : 'none', buttons: n(m.buttons, 0, 31), clickCount: n(m.clickCount, 0, 3),
      deltaX: n(m.dx, -5000, 5000), deltaY: n(m.dy, -5000, 5000) }, tab.sid).catch(() => {});
  } else if (m.t === 'key' && KEY_TYPES.has(m.type)) {
    const text = m.type === 'keyDown' ? s(m.text) : undefined;
    cdp('Input.dispatchKeyEvent', { type: m.type, key: s(m.key), code: s(m.code), text, unmodifiedText: text, windowsVirtualKeyCode: n(m.keyCode, 0, 255),
      modifiers: n(m.mods, 0, 15), location: n(m.loc, 0, 3), commands: m.cmd ? [s(m.cmd)] : undefined }, tab.sid).catch(() => {});
  } else if (m.t === 'text') {
    cdp('Input.insertText', { text: String(m.text || '').slice(0, 1e5) }, tab.sid).catch(() => {});
  } else if (m.t === 'nav') {
    if (m.act === 'reload') { tab.loadedAt = Date.now(); cdp('Page.reload', {}, tab.sid).catch(() => {}); }
    else if (m.act === 'home') navTab(tab, tvs[tab.id].url);
    else if (m.act === 'go') { try { const u = new URL(String(m.url)); if (/^https?:$/.test(u.protocol)) navTab(tab, u.href); } catch {} }
    else if (m.act === 'back' || m.act === 'forward') cdp('Page.getNavigationHistory', {}, tab.sid).then(({ currentIndex, entries }) => {
      const e = entries[currentIndex + (m.act === 'back' ? -1 : 1)];
      if (e) return cdp('Page.navigateToHistoryEntry', { entryId: e.id }, tab.sid);
    }).catch(() => {});
  }
}

// ---------- talking to sessions ----------
// The in-office chat types into a session's own terminal, as you would: through Orca's documented `orca terminal send`, or
// tmux outside Orca. The terminal comes from the claude process's own environment (Orca and tmux put ORCA_TERMINAL_HANDLE /
// TMUX_PANE in every shell they start), never guessed from the cwd; if two live sessions share a terminal we refuse.
const SEND_MAX = 8000;
const sending = new Set();   // session ids with a send in flight
const sentAt = new Map();    // session id -> when we last got a message in (the registry's status lags a turn starting by seconds)

async function terminalOf(r) {
  const { out } = await run('ps', ['eww', '-o', 'lstart=,command=', '-p', String(r.pid)]);
  if (!out.trim()) throw new Error('the session has exited');
  // procStart guards against pid reuse; Claude Code writes it in UTC (older versions in local time).
  const started = Date.parse(out.slice(0, 24)), reg = r.procStart && [Date.parse(r.procStart + ' UTC'), Date.parse(r.procStart)];
  if (reg && !reg.some((x) => Math.abs(x - started) < 2000)) throw new Error('its process changed since it registered');
  const last = (re) => [...out.matchAll(re)].at(-1)?.[1];   // the environment follows the arguments
  const handle = last(/\bORCA_TERMINAL_HANDLE=(term_[\w-]+)/g);
  if (handle) return { route: 'orca', handle };
  const pane = last(/\bTMUX_PANE=(%\d+)/g), socket = last(/\bTMUX=([^\s,]+),/g);
  return pane && socket ? { route: 'tmux', handle: pane, socket } : null;
}

// Where a message to this session would go, or throws why it can't go anywhere.
async function routeOf(id) {
  const r = S.registry.find((x) => x.sessionId === id);
  if (!r || !pidAlive(r.pid)) throw new Error('this session isn’t running');
  if (r.kind !== 'interactive' || r.entrypoint !== 'cli') throw new Error(`can’t send to this session from here: it isn’t a terminal session (${r.entrypoint || r.kind})`);
  const term = await terminalOf(r);
  if (!term) throw new Error('can’t send to this session from here: it isn’t running in an Orca terminal or tmux');
  const others = await Promise.all(S.registry.filter((x) => x !== r && pidAlive(x.pid)).map((x) => terminalOf(x).catch(() => null)));
  if (others.some((o) => o?.route === term.route && o.handle === term.handle && o.socket === term.socket)) throw new Error('more than one Claude session runs in that terminal, so it’s unclear which would get the message');
  return { r, term };
}

async function sendToSession(id, text) {
  const { r, term } = await routeOf(id);
  if (!['idle', 'busy'].includes(r.status)) throw new Error(`it’s ${r.status === 'waiting' ? 'waiting on a prompt (a permission request or question)' : r.status}: answer it in its terminal`);
  const busy = r.status === 'busy' || (sentAt.get(id) || 0) > (r.statusUpdatedAt || 0);
  console.log(`[send] ${new Date().toISOString()} ${r.name || id} (pid ${r.pid}, ${busy ? 'busy' : 'idle'}) via ${term.route} ${term.handle}: ${JSON.stringify(text)}`);

  if (term.route === 'orca') {
    const orca = binOf('orca');
    if (!orca) throw new Error('the orca CLI isn’t installed');
    const t = safeJSON((await run(orca, ['terminal', 'list', '--json'])).out)?.result?.terminals?.find((x) => x.handle === term.handle);
    if (!t) throw new Error('its Orca terminal is gone (did Orca restart?)');
    if (!t.connected || !t.writable) throw new Error('its Orca terminal isn’t accepting input');
    // Text plus Enter is one prompt to Orca (newlines don't submit early). For an idle session wait briefly for Orca's proof the
    // turn started (it can miss very quick turns); a busy one queues the message. Either way the chat confirms delivery when the
    // message shows up in the transcript.
    const res = await run(orca, ['terminal', 'send', '--terminal', term.handle, `--text=${text}`, '--enter', ...(busy ? [] : ['--wait-submit', '4']), '--json']);
    const j = safeJSON(res.out);
    if (/agent_prompt_blocked/.test(`${j?.error?.code} ${j?.error?.message}`)) throw new Error('it’s showing a prompt in its terminal (a permission request or question), so Orca didn’t press Enter. Answer the prompt there, and check its input box: your text may be sitting in it');
    if (!j?.ok) throw new Error(j?.error?.message || res.errOut.trim() || 'orca terminal send failed');
    if (!j.result?.send?.accepted) throw new Error('Orca didn’t accept the input');
    const stages = j.result.send.prompt?.stages || [];
    console.log(`[send] ${r.name || id}: accepted, ${stages.join(' → ') || 'no receipt stages'}`);
    sentAt.set(id, Date.now());
    return { route: 'orca', terminal: t.title, started: !busy && stages.includes('turn_started'), queued: busy };
  }
  // tmux: one bracketed paste so newlines don't submit early, then Enter.
  const tmux = binOf('tmux');
  if (!tmux) throw new Error('tmux isn’t installed');
  const tm = async (...a) => { const x = await run(tmux, ['-S', term.socket, ...a]); if (x.err) throw new Error(`tmux: ${x.errOut.trim() || x.err.message}`); return x.out; };
  if ((await tm('display-message', '-p', '-t', term.handle, '#{pane_id}')).trim() !== term.handle) throw new Error('its tmux pane is gone');
  const buf = `my-office-${Date.now()}`;
  await tm('set-buffer', '-b', buf, '--', text);
  await tm('paste-buffer', '-p', '-d', '-b', buf, '-t', term.handle);
  await new Promise((ok) => setTimeout(ok, 150));
  await tm('send-keys', '-t', term.handle, 'Enter');
  sentAt.set(id, Date.now());
  return { route: 'tmux', terminal: term.handle, started: false, queued: busy };
}

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
    res.write(`retry: 2000\ndata: ${S.stateJSON}\n\nevent: tvs\ndata: ${JSON.stringify(tvs)}\n\nevent: tvads\ndata: ${adsSent || '{}'}\n\nevent: office\ndata: ${JSON.stringify(office)}\n\n`);
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
    return res.end(JSON.stringify(tvs));
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
