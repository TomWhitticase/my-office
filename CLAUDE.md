# my-office: notes for Claude

## Sync your work to GitHub (always, without being asked)

Several Claude sessions may work on this repo at once, sometimes in the same checkout. After each meaningful unit of work that passes the checks below, commit and push to `origin main`:

1. **Stage only what you changed.** Run `git status` first. Another session may have uncommitted work in the same tree, so `git add <your files>` rather than `git add -A`. If a file you touched also holds someone else's in-progress edits, check that the whole file still passes the checks before committing it, and say so in the commit message.
2. **Commit** with a message saying what changed and why.
3. **Integrate:** `git pull --rebase origin main`. On a conflict, read both sides and keep the intent of both. Never drop the other session's change to make yours apply. Re-run the checks on conflicted files, then `git rebase --continue`.
4. **Push:** `git push`. If it's rejected because main moved, repeat step 3 and push again.
5. **Never** `push --force`, `reset --hard`, `checkout -- <file>` or `stash drop` on work that isn't yours. If a conflict is ambiguous (both sides rewrote the same logic differently), stop and ask.

## Checks before committing

```bash
for f in server.js server/*.js bin/setup.mjs; do node --check "$f" || echo "FAIL $f"; done
# The front end is ES modules: `node --check file.js` passes one with a syntax error in it (no "type" in package.json), so pipe it in as a module.
for f in public/*.js public/office/*.js public/office/*/*.js; do node --input-type=module --check < "$f" || echo "FAIL $f"; done
npx tsc -p test/tsconfig.json   # JSDoc types: the office's ctx, registries, FLOORS and floors (files with // @ts-check)
```

To try a change, run your own server from your checkout with an isolated HOME on a spare port (7831-7840), not the live one.

The harness (`node test/run.mjs`, `npm test`, any suite) runs one at a time across all sessions, under a shared lock: `until mkdir /tmp/my-office-harness.lock 2>/dev/null; do sleep 20; done`, run it, then `rmdir /tmp/my-office-harness.lock` (a lock older than 30 min is stale: `find /tmp/my-office-harness.lock -mmin +30`, then rmdir it). Close the headless browsers and test servers you aren't using.

Before every push, the smoke test must say `all match`: `node test/run.mjs smoke --port=0` (about 10 s, no lock needed: it loads the office in headless Chrome on the GPU and fails on any page or console error, or if the office never comes up). `bin/live.sh` runs it too and won't deploy a commit that fails it. Then, under the lock: `node test/run.mjs api world` and `node test/run.mjs golden --only=<the shots your change can affect>` (each golden pose loads the office afresh, so that renders only those). `test/README.md` ("Before you push") says how to choose them: the floor or area you touched; HUD, `main.js`/`ctx.js`/`util.js`, post-processing or people changes reach every office shot, so run the whole golden suite for those. Don't run the full suite before every push: the coordinator runs it on main periodically (`bin/full-check.sh`, report in `~/.claude/my-office/full-check.log`) and sends a failure back to the commit's author to fix.

## Live site

The live office on http://127.0.0.1:7777 runs from a dedicated checkout, `/Users/admin/orca/workspaces/my-office/office-live`, kept on origin/main by `bin/live.sh` (launchd agent `com.my-office.live`). **Never edit that checkout or restart its server by hand**: push to main and it deploys within about 30 s. live.sh syntax-checks and smoke-tests each new commit first (one that fails, or whose server doesn't come up, is skipped, with why in its log), runs `npm install` when package files change, and restarts the server only when `server.js`, `server/` or package files changed; `public/` is served with `no-store`, and open pages poll `/api/build` and reload themselves (unless you're typing, chatting, at a TV or whiteboard, flying…). What it did is in `office-live/.live.log`.

On another machine, the installer's service (`launchctl kickstart -k gui/$(id -u)/com.my-office.server`; Linux: `systemctl --user restart my-office`) runs the server instead, and `server.js` / `server/` changes need that restart.

For a change that shouldn't alter anything you can see (a refactor, a tidy-up), the harness must say `all match` on the suites and shots it can affect (as above; see `test/README.md`). If it doesn't, fix the change; only re-record its baselines for an intended visual or behaviour change, after looking at every changed shot.

## Layout

- `server.js`: the entry point: config, http routing and the `/events` SSE stream. The work is in `server/`:
  - `transcripts.js` tails `~/.claude/projects/**/*.jsonl` (subagents too), and keeps each one's terminal feed (`/api/session/:id/feed`); `state.js` the session registry, status line snapshots and the state pushed every second.
  - `sessions-send.js` delivers chat messages to a session's terminal; `john.js` is John (`claude -p`); `machine.js` samples this machine for the server hall.
  - `receptionist.js` is Rosie at reception (`POST /api/receptionist`): a `claude -p` that answers with JSON `{ say, actions }`, every action checked against an allowlist and clamped there; `POST /api/receptionist/tv` has her find something on a TV (`tvSearch` in `tv-browser.js`: a YouTube search in that TV's tab, the first suitable result played).
  - `tv-browser.js` runs the wall TVs: one headless Chrome (CDP over `--remote-debugging-pipe`, profile `~/.claude/my-office/tv-browser`), a tab per TV, screencast frames and input over the dependency-free WebSocket at `/tv`.
  - `repos.js` (your GitHub repos via `gh`, for the archive), `office-settings.js` (lights, blinds, door, the security cameras), `security.js` (same-origin / JSON / no-TV checks on every write), `util.js`.
- `public/index.html`: the overview tab, the tabs, and the `window.dash` bridge (state, colours, drawer, config). `public/desktop.js` is your computer's desktop (Dashboard, Office Admin, Messages, Security), `chat.js` the chat shared with it, `sounds.js` the office's sounds.
- `public/office.js` re-exports `mountOffice` from `public/office/main.js`. The 3D office is plain ES modules (Three.js vendored via npm, served at `/vendor/three/`):
  - `main.js`: renderers, HUD, scene and camera; installs every part in order; the frame loop, resize, `window.__office` (the debug and test hooks; keep them working), show/hide.
  - `ctx.js`: the shared context and its registries (below). `hud.js`: the stylesheet and HUD markup. `util.js`: constants, `mat`/`box`/`cyl`, textures, `makeScreen`, the office's `colliders`. `painters.js`: the screens' canvas painters. `people.js`: `Person`, the idle spots and the people sync.
  - `world/`: the building and its rooms (sky, shell, city, furniture helpers, desks, breakroom, whiteboards, lounge, my office, kitchen, guitars, meeting rooms, fittings, clocks).
  - `systems/`: lifts and the `FLOORS` table, the player and walking keys, TVs, chat and John, hover and click actions, minimap, post-processing, the terminal pane under the code on each desk's code monitor (`terminals.js`), Rosie (`receptionist.js`: her desk kit, the light panel, her chat, A* routing over the colliders, and acting out a plan through the Admin app's own routes), and the security cameras (`cctv.js`: the cameras on 48, 47 and the roof, and the feeds the desktop's Security app shows; a floor joins in with `floor.cctv = { root, tick?, stage? }`).
  - `floors/`: the archive (B2), the gateway and inside a repo, the roof, the helicopter on the roof's pad (`window.__office.heli` drives it), the server hall (47), the restricted level (B3, `restricted.js`: behind an access code on the car panel, rooms generated in seeded chunks round you; `goFloor(-3)` skips the code; it's never remembered, the keypad asks every time), the empty floors (46, 45, 44, `empty-floors.js`: one bare copy of the office's shell, from `shellWalls` and `liftCore`, moved to whichever you ride to, in the office's scene like the roof).
  - The centre monitor in the owner's office is the live desktop in a CSS3DObject behind a hole punched in the WebGL frame (`world/my-office.js` installScreen, `systems/post.js` renderFrame).
- `bin/setup.mjs` and `.claude/skills/setup`: installer and the `/setup` wizard. `bin/statusline-tap.sh`: the status line snapshot tap.
- `test/`: the refactor harness (`npm test`) and the server's own API snapshots (`test/api-baseline/`).
- `config.json` (gitignored): owner name, city, lat/lon, port.

## How the office's parts fit together

Every part exports `install(ctx)` (some have a second, e.g. `installUse`), and `main.js` calls them in order. The context's shape, the registries, `Floor` and `Lift` are JSDoc types in `ctx.js` (`ctx.js`, `main.js` and `systems/lifts.js` are type-checked; add `// @ts-check` to a file to opt it in). A part:

- **reads** what's already built from ctx at the top (`const { world, sofa, desks } = ctx;`), and anything that changes, or is only set by a later part, live where it's used: `ctx.mode`, `ctx.away` (the floor you're on, or null), `ctx.state` (the latest server state), `ctx.daylight`, `ctx.player`. Never destructure a value that changes.
- **shares** what others need with `Object.assign(ctx, { … })` (or `Object.defineProperty(ctx, 'x', { get, set })` for a value it reassigns).
- **registers** instead of being called: `ctx.onFrame(fn(dt, t, now), order)` for per-frame work; `ctx.action(name, { hover(h), click(h, e) })` for something you can click (its meshes carry `userData.action = name`, plus `reach`, and whatever the handlers need); `ctx.hoverTargets(() => meshes, order)` for what you can point at in the office; `ctx.key(code, (e) => handled)` for a walking key; `ctx.minimap((c, sx, sz) => …, order)` for a layer of the office's map. Orders run lowest first; leave gaps (they go up in tens).

Things built while installing must not depend on a part installed later: put the new part after what it uses (the harness's world snapshots and screenshots will catch it if not).

### Adding a room or a piece of furniture

1. Make `public/office/world/<room>.js` exporting `install(ctx)`; build into `ctx.world` with the helpers in `util.js` and `world/furniture.js` (`sofa`, `plant`, `pendant`, `addSeat`…); call `solid(x, z, w, d)` for anything you can't walk through.
2. Register whatever it does each frame, can be clicked, or shows on the map, as above.
3. Import it in `main.js` and call it after the parts it uses (furniture helpers are installed early).

### Adding a floor

1. Make `public/office/floors/<floor>.js` exporting `install(ctx)`. A floor is an object `{ n, label, title, scene, colliders, hits, look, enter(z), bound(p), map(), fx?(dt, t), leave?(), pick?(ray), ground?(x, z) }` (see `systems/lifts.js`): its own `THREE.Scene` lit by `look` (exposure, hemisphere, env, bloom/grade scale, extra lights), or `y` instead of a scene for one that's part of the office scene (the roof).
2. Give it a lift to arrive by: `Object.assign(floor, ctx.liftShaft())` and add `floor.lift` to its scene; `enter(z)` moves it onto your car's z.
3. `ctx.addFloor(floor)` puts it on every car panel. Lifts never import floors.
4. Its clickables register actions as above; on that floor, hover uses its `hits` (or `pick`) and the minimap its `map()`.
5. Add a pose for it to `POSES` in `test/goldens.mjs` (each starts from a freshly loaded office), and record just that one (`golden --only=<name> --record`).
