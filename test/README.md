# The refactor harness

Proves a change to the office's code changed nothing you can see or reach. Three suites, all against a fixed set of
fixture sessions in a throwaway `HOME`, a frozen clock, and this checkout's own `server.js` on its own port (the live
server on 7777 is never touched):

| Suite | What it checks | Baseline |
|---|---|---|
| `api` | every `/api` route's response, the `/events` stream's opening, static serving (incl. path traversal), and the same-origin / JSON-only / no-TV / no-headless refusals on every write, the repo routes and the `/tv` socket | `snapshots/api.json` |
| `world` | the office's collider map and colliders, seats, desks, idle spots, who sits where, every walking route checked against the colliders, the floor table, TVs, boards, doors, blinds, lifts, the click actions in each scene, and a line per object in every scene (type, geometry, material, transform, flags) | `snapshots/world.json`, `snapshots/world-<scene>.txt` |
| `golden` | a screenshot per pose (`POSES` in `goldens.mjs`), each from a freshly loaded office: your desktop, your chair, each area, a TV and its panel, a whiteboard, the MacBook, inside a lift car, the archive, an open drawer, the gateway, inside a repo, the server hall, the roof, dusk, the helicopter's cockpit, the Security app's camera feeds, the archive's hall and vault, the restricted level | `golden/<name>.png` |

## Running it

```bash
npm install                       # three, and playwright-core (dev only)
node test/run.mjs                 # all three suites; exit code 0 only if everything matches
node test/run.mjs api world       # just those
node test/run.mjs golden --only=archive,roof   # just these shots (each loads the office afresh)
node test/run.mjs --port=7901     # another port (default 7781)
node test/run.mjs --software      # SwiftShader instead of the GPU
node test/run.mjs --log           # show the server's own output
```

It needs Google Chrome at `/Applications/Google Chrome.app` (or set `CHROME_PATH`). It renders on this Mac's GPU (ANGLE
on Metal), which is what the goldens are recorded on; `--software` renders with SwiftShader instead (any machine, much
slower, and not pixel-identical to the GPU goldens, so only useful against goldens recorded the same way). Results land
in `test/out/` (gitignored): each shot, `api.json`, `world.json` and `world-<scene>.txt`, ready to diff against the
baselines.

Every run takes the shared lock first (see CLAUDE.md): `until mkdir /tmp/my-office-harness.lock 2>/dev/null; do sleep
20; done`, run, `rmdir /tmp/my-office-harness.lock`.

## Before you push

`api` and `world`, plus the golden shots your change can affect (all of it under the lock):

```bash
node test/run.mjs api world
node test/run.mjs golden --only=<shots>
```

Choosing the shots (`POSES` in `goldens.mjs` has them all, with what each sets up):

- **An area of the office floor** (a room, its furniture, a TV, a board): the shots that see it. `desks`, `breakroom`,
  `lobby`, `meeting-rooms`, `kitchen`, `lounge`, `my-office`, `ping-pong-tv`, `tv-panel`, `whiteboard`, `laptop`,
  `task-board`, `task-board-card` and `dusk` are on 48; open the PNGs in `test/golden/` to see which take in your spot.
  Lighting, the shell, the city or the sky reach all of them, plus `seated`, `lift-car`, `roof` and `heli-cockpit`.
- **Another floor**: its own shots: `archive*` and `gateway`, `inside-a-repo` (B2); `server-hall` (47); `vacant-floor`
  (45); `roof` and `heli-cockpit` (50); `restricted*` (B3); and `security-app` / `security-archive` if one of its
  cameras sees it.
- **The lifts**: `lift-car`, `restricted-keypad`, and one shot on each floor you can reach.
- **The HUD, the overlays, `main.js`, `ctx.js`, `util.js`, post-processing, people**: they're in every office shot; run
  the whole golden suite.
- **The desktop or `index.html`** (apps, the tabs, `window.dash`): `desktop`, `seated`, `security-app`,
  `security-archive`, and `my-office` (its centre monitor shows the desktop).
- **Server code only**: `api` and `world` are enough, unless what it sends changes what's drawn.

When unsure, add the shot. The coordinator runs the whole suite on main periodically (`bin/full-check.sh`) and sends a
failure back to the commit that caused it.

## The periodic full check

`bin/full-check.sh` (`npm run full-check`) takes the lock, checks out origin/main in a temporary worktree, runs every
suite there on port 7909 (`--port=` to change), and appends a report to `~/.claude/my-office/full-check.log`: `PASS`, or
the failing suites and shots with their diff numbers and the commits since the last passing run. Exit code non-zero on
failure. It touches the lock every minute while it holds it, so nobody takes it for stale.

## What keeps it deterministic

- **Fixture HOME** (`lib/fixtures.mjs`): five live sessions (two working, one on a shell, two idle), a subagent, two
  finished sessions, status lines with rate limits, and twelve days of usage history, all stamped relative to `T0`
  (Wednesday 17 June 2026, 14:30 London).
- **Frozen server** (`lib/fixture-env.cjs`, preloaded with `--require`): `Date` is pinned to `T0`, the hostname is
  `fixture-host`, the fixture pids are alive with a fixed `ps` line each. `TZ=Europe/London`.
- **Browser** (`lib/browser.mjs`): Playwright's fake clock owns `Date`, `performance.now`, timers and
  `requestAnimationFrame`, so a frame only happens when the harness steps one; `Math.random` is seeded (the office is
  built from one fixed seed, then each golden pose reseeds from its own name, so no pose's random draws depend on
  another's); every fetch is awaited before the next frame.
- **Independent poses**: every golden pose opens its own page and sets up everything it shows (the intro, floor, time of
  day, apps, panels), building on another pose's setup only explicitly (`from()`), so a shot looks the same alone, in
  any order, or in a full run. `/api/machine`, `/api/repos/*`, `/api/config` and the chat's terminal routing read the
  real machine or GitHub, so the browser gets fixed answers instead (`lib/mocks.mjs`).

Two runs of the same code give identical pixels; the tolerance (`LIMIT` in `goldens.mjs`: 0.1% of pixels may differ by
more than 24/255) is slack, not noise allowance.

## When something differs

The baseline was recorded from the code tagged `pre-refactor`. During the refactor a difference means the move broke
something: **fix the move, don't re-record.** Look at `test/out/<name>.png` next to `test/golden/<name>.png`, or diff
`test/out/world-office.txt` against `test/snapshots/world-office.txt`. A scene whose objects are all there but were
built in a different order passes (it draws the same) and is reported as such.

Page errors (uncaught exceptions in the office) fail the golden and world suites.

## Re-recording

Only when the office is meant to look or behave differently (after the refactor, for features), and only from a commit
you've checked by eye:

```bash
node test/run.mjs --record                 # all three baselines
node test/run.mjs golden --record          # just the screenshots
```

Then look at every changed shot before committing it. A new pose goes in `POSES` in `goldens.mjs`, anywhere: it starts
from a freshly loaded office, so record just that one (`golden --only=<name> --record`).
