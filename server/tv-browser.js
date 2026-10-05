// The wall TVs: their config, the headless Chrome that plays them, and the /tv socket the office watches them through.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { CLAUDE, readJSON, clients } = require('./util');
const { TV_UA_TAG, trustedHost } = require('./security');

// ---------- office TVs ----------
// Each wall TV in the 3D office is a live tab in a real browser on this machine. Config lives in ~/.claude/my-office/tvs.json:
// { id: { url, refresh, volume, muted, adblock, at } }. `at` changes whenever the URL is (re)set, which (re)loads the tab;
// volume, mute and ad blocking are patched on their own so the page keeps playing.
const TVS_FILE = path.join(CLAUDE, 'my-office', 'tvs.json');
let tvs = readJSON(TVS_FILE) || {};
for (const c of Object.values(tvs)) { delete c.src; delete c.blocked; c.volume ??= 100; c.muted ??= false; c.adblock ??= true; c.at ??= 0; }   // pre-browser entries
function sendTvs() { const json = JSON.stringify(tvs); for (const res of clients) res.write(`event: tvs\ndata: ${json}\n\n`); }
function putTv(id, body) {
  if (!/^[\w-]{1,40}$/.test(id) || id in Object.prototype) throw new Error('bad TV id');   // '__proto__', 'constructor'…
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
const heldUntil = new Map();   // tv id -> time: kept open (and awake) with nobody watching, while the receptionist works it

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
  const held = (id) => heldUntil.get(id) > now;
  for (const id of Object.keys(tvs)) if ((watch.has(id) || fade.get(id) > 0 || held(id)) && !tabs.has(id) && tabs.size < TV_MAX_TABS) openTab(id);
  let casts = 0;
  for (const tab of [...tabs.values()].sort((a, b) => (watch.get(a.id) || 9) - (watch.get(b.id) || 9))) {
    const c = tvs[tab.id];
    if (!c) { lastFrames.delete(tab.id); fs.rm(path.join(TV_FRAMES, `${tab.id}.jpg`), { force: true }, () => {}); closeTab(tab); continue; }
    if (!tab.sid) continue;   // still opening
    if (watch.has(tab.id) || fade.get(tab.id) > 0 || held(tab.id)) tab.neededAt = now;
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

// ---------- the receptionist's remote ----------
// "Put some music on": a YouTube search on the TV itself (the results show on it while she looks), then the first suitable
// result picked from the page (not an ad, a Short or a shelf; a live stream, playlist or video as asked) and played as the
// TV's URL, so it sticks like one set from the Admin tab. The tab is held open meanwhile, even with nobody near it.
const SEARCH_SP = { live: 'EgJAAQ%3D%3D', playlist: 'EgIQAw%3D%3D', video: 'EgIQAQ%3D%3D' };
const PICK_JS = (kind) => `(() => { if (location.pathname !== '/results') return null;
  const skip = 'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer, grid-shelf-view-model, ytd-reel-shelf-renderer, ytd-shelf-renderer, ytd-horizontal-card-list-renderer';
  for (const el of document.querySelectorAll('ytd-video-renderer, yt-lockup-view-model, ytd-playlist-renderer, ytd-radio-renderer')) {
    if (el.closest(skip) || !el.getClientRects().length) continue;
    const a = el.querySelector('a#video-title[href]') || el.querySelector('a[class*="MetadataViewModelTitle"][href]'), href = a?.getAttribute('href') || '';
    const title = (a?.getAttribute('title') || a?.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!/^\\/watch\\?/.test(href) || !title) continue;
    const u = new URL(href, location.origin), list = u.searchParams.get('list');
    const live = !!el.querySelector('.badge-style-type-live-now-alternate, .badge-shape-wiz--thumbnail-live, [aria-label="LIVE"]') || ${JSON.stringify(kind)} === 'live';
    if (${JSON.stringify(kind)} === 'playlist' && !list) continue;
    return { url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(u.searchParams.get('v')) + (list ? '&list=' + encodeURIComponent(list) : ''), title: title.slice(0, 140), live, playlist: !!list };
  }
  return null; })()`;
async function tvSearch(id, query, kind) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query).replace(/%20/g, '+')}${SEARCH_SP[kind] ? `&sp=${SEARCH_SP[kind]}` : ''}`;
  if (!CHROME) throw new Error('no Chrome for the TVs');
  putTv(id, { url });
  const at = tvs[id].at;
  heldUntil.set(id, Date.now() + 60e3);
  tvSync();
  try {
    for (let n = 0; n < 50; n++) {   // ~30 s
      await new Promise((r) => setTimeout(r, 600));
      if (tvs[id]?.at !== at) throw new Error('someone else changed that TV');
      const tab = tabs.get(id);
      if (!tab?.sid || tab.at !== at) continue;
      const r = await cdp('Runtime.evaluate', { expression: PICK_JS(kind), returnByValue: true }, tab.sid).catch(() => null);
      const pick = r?.result?.value;
      if (!pick?.url) continue;
      await new Promise((r) => setTimeout(r, 1200));   // let the results sit on screen a moment, as if read
      if (tvs[id]?.at !== at) throw new Error('someone else changed that TV');
      putTv(id, { url: pick.url });
      return pick;
    }
    throw new Error('nothing suitable came up');
  } finally { heldUntil.set(id, Date.now() + 15e3); }
}
const pages = () => Object.fromEntries([...tabs.values()].filter((t) => t.page.url).map((t) => [t.id, t.page]));

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

module.exports = { get tvs() { return tvs; }, get adsSent() { return adsSent; }, putTv, tvUpgrade, tvSearch, pages };
