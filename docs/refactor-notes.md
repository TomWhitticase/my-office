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

## Phases 1-3: client split

- **How a part is wired.** Each part exports `install(ctx)` (some have a second, e.g. `installCozy`, `installUse`), and
  `office/main.js` calls them in the order their code used to run, so everything is still built in the same order (the
  harness's scene fingerprints and goldens match exactly). What a part reads that is already set when it installs is
  destructured at the top (`const { world, sofa } = ctx;`); anything set later, or that changes (`ctx.mode`,
  `ctx.away`, `ctx.state`, `ctx.daylight`, `ctx.using`…), is read live as `ctx.x` at the point of use. What a part
  shares goes on ctx with `Object.assign(ctx, {…})` (functions first thing, so hoisting still works within the part;
  constants at the end) or, for a `let` it reassigns, `Object.defineProperty(ctx, 'x', { get, set })`.
- **mountOffice's own values** that parts need (renderer, scene, camera, hud, the HUD elements, sfx…) are getters on the
  object `createCtx` is given, since most are created after ctx is.
- **Registries keep the old order.** `onFrame`, `hoverTargets` and `minimap` entries carry the order number of the step
  they replaced in the old hard-wired loop / target list / map (10, 20, …), so the frame runs in exactly the old order
  wherever a part registers. Click actions are looked up by name, so their order doesn't matter. Two `KeyE` handlers
  (a TV, a session) are mutually exclusive.
- **Things that had to move to keep the build order working:**
  - `markerBoard` (a one-line wrapper of `whiteboard`) moved from the meeting rooms to the whiteboards: your desk calls it
    while building, before the meeting rooms install. It was only reachable before because function declarations hoist.
  - `liftShaft`, `setFloor` and `renderFloor` (function declarations only) install right after riding the lifts, before
    the archive, which builds its shaft with `liftShaft` while installing.
  - `drawArchiveMap` moved up into the archive.
  - `paintBoard`'s canvas local is `c` instead of `ctx` (it would have shadowed the context it now reads the state from).
- **Plan deviations.** The kitchen is its own file (world/kitchen.js, ~780 lines), not part of breakroom.js; the guitar
  corner is world/guitars.js; the binder credenza, cabinets, copier, bins and lobby seating are world/fittings.js; the
  idle spots and the people sync live in people.js with Person (installSpots, installSync); the stylesheet and HUD
  markup are office/hud.js. `public/office.js` stays as a one-line re-export so index.html didn't change.
- **The tooling** that did the moves (scope analysis with acorn + eslint-scope, then tsc for unresolved names) wasn't
  committed; the harness is what verified each step.

### Found, not changed

- `const gl = renderer.domElement` (the TV and whiteboard code's pointer target) shares its name with the WebGL context
  `gl` used in renderFrame/renderFloor; it's now `ctx.gl`. Worth a clearer name once features resume.
