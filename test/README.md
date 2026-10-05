# The refactor harness

Proves a change to the office's code changed nothing you can see or reach. Three suites, all against a fixed set of
fixture sessions in a throwaway `HOME`, a frozen clock, and this checkout's own `server.js` on its own port (the live
server on 7777 is never touched):

| Suite | What it checks | Baseline |
|---|---|---|
| `api` | every `/api` route's response, the `/events` stream's opening, static serving (incl. path traversal), and the same-origin / JSON-only / no-TV / no-headless refusals on every write, the repo routes and the `/tv` socket | `snapshots/api.json` |
| `world` | the office's collider map and colliders, seats, desks, idle spots, who sits where, every walking route checked against the colliders, the floor table, TVs, boards, doors, blinds, lifts, the click actions in each scene, and a line per object in every scene (type, geometry, material, transform, flags) | `snapshots/world.json`, `snapshots/world-<scene>.txt` |
| `golden` | 21 screenshots on a walk through the building: your desktop, your chair, each area, a TV and its panel, a whiteboard, (a chat, walked through but not shot), the MacBook, inside a lift car, the archive, an open drawer, the gateway, inside a repo, the server hall, the roof, and dusk | `golden/<name>.png` |

## Running it

```bash
npm install                       # three, and playwright-core (dev only)
node test/run.mjs                 # all three suites; exit code 0 only if everything matches
node test/run.mjs api world       # just those
node test/run.mjs golden --only=archive,roof   # still walks every pose (each starts where the last left off), compares only these
node test/run.mjs --port=7786     # another port (default 7781), e.g. to run two at once
node test/run.mjs --log           # show the server's own output
```

It needs Google Chrome at `/Applications/Google Chrome.app` (or set `CHROME_PATH`); rendering is software
(SwiftShader), so the golden suite takes about five minutes. Results land in `test/out/` (gitignored): each shot,
`api.json`, `world.json` and `world-<scene>.txt`, ready to diff against the baselines.

## What keeps it deterministic

- **Fixture HOME** (`lib/fixtures.mjs`): five live sessions (two working, one on a shell, two idle), a subagent, two
  finished sessions, status lines with rate limits, and twelve days of usage history, all stamped relative to `T0`
  (Wednesday 17 June 2026, 14:30 London).
- **Frozen server** (`lib/fixture-env.cjs`, preloaded with `--require`): `Date` is pinned to `T0`, the hostname is
  `fixture-host`, the fixture pids are alive with a fixed `ps` line each. `TZ=Europe/London`.
- **Browser** (`lib/browser.mjs`): Playwright's fake clock owns `Date`, `performance.now`, timers and
  `requestAnimationFrame`, so a frame only happens when the harness steps one; `Math.random` is seeded; every fetch is
  awaited before the next frame. `/api/machine`, `/api/repos/*`, `/api/config` and the chat's terminal routing read the
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

Then look at every changed shot before committing it. A new pose goes in `POSES` in `goldens.mjs`; each one starts from
where the previous one left the player, so add new ones at the end unless you mean to re-record the ones after it.
