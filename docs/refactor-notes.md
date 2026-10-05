# Refactor notes

Things found while refactoring that were deliberately not changed (pure refactor), and decisions worth knowing about.

## Phase 4: server split

- **server/util.js** is a tenth module the plan didn't list: the helpers every module shares (safeJSON, readJSON, clip,
  pidAlive, ts, hourKey/minuteKey, binOf, run), the `~/.claude` path, and the set of open `/events` responses (the stream
  itself stays in server.js; tv-browser, office-settings and state push their own events to it).
- **Live values are getters.** `registry`, `procStats`, `state`, `stateJSON` (server/state.js) and `tvs`, `adsSent`
  (server/tv-browser.js) were module-level `let`s that get reassigned, so they're read as `S.registry`, `TV.tvs` and so on,
  never destructured.
- **No require cycles.** John's own `claude -p` pids were `JOHN.pids`, which readRegistry needs; they now live in
  `state.ownPids` and `JOHN.pids` is that same set, so state doesn't depend on john.
- **Side effects at require time** (the adblock list fetch, TV timers, the exit/signal handlers in tv-browser.js; the
  office.json/tvs.json reads) still run before the first `listTranscripts()`/`tick()`, as before.
- **CLAUDE.md's checks** still only `node --check server.js`; they should cover `server/*.js` too (phase 5 rewrites that section).

## Server snapshot coverage (test/api-baseline)

- `/api/repos*` is snapshotted signed out only (gh can't reach its keychain token under the isolated HOME): the 401
  `signin` path, the 202 tree job start and the 400s. The signed-in list/detail/tree/blob code moved verbatim but isn't
  diffed.
- Sending is covered up to route lookup (`?route` on every branch: orca, tmux, none, not a terminal, shared terminal, pid
  reuse, not running) and the 400s before delivery; actual delivery is never exercised.
- John is covered through a stand-in `claude` on PATH (his prompt's state lines and a hash of the CLI arguments).

## Possible bugs (not fixed)

- `Transcript.ingestUser`: when a prompt absorbs queued messages and has text of its own (`rest`), the chat gets the
  whole prompt (`text`) rather than `rest`, so the queued messages show twice. May be intended.
- `GET /api/session/<unknown id>` answers 404 with body `{}` and no content-type.
