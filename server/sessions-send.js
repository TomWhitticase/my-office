// ---------- talking to sessions ----------
// The in-office chat types into a session's own terminal, as you would: through Orca's documented `orca terminal send`, or
// tmux outside Orca. The terminal comes from the claude process's own environment (Orca and tmux put ORCA_TERMINAL_HANDLE /
// TMUX_PANE in every shell they start), never guessed from the cwd; if two live sessions share a terminal we refuse.
const { safeJSON, pidAlive, binOf, run } = require('./util');
const S = require('./state');

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

module.exports = { SEND_MAX, sending, routeOf, sendToSession };
