# Refactor plan: split the office into modules

Status: **planned, not started.** Decisions agreed: pause feature work while it runs (requests are queued and done on the new layout afterwards), `playwright-core` as a test-only dependency, wrap long lines, and add JSDoc type checking (not TypeScript files) as the last phase.

## Goal

Same office, same behaviour, split into small modules so parallel agents stop colliding and changes are safer. No features, no visual changes, still no build step, and no new runtime dependencies.

Starting point (`75f816c`): `public/office.js` is ~7k lines, ~6.2k of them inside one `mountOffice` closure where every subsystem reaches every other's variables. `server.js` is ~1.6k lines doing nine jobs. There are no automated tests, and CLAUDE.md's layout section is out of date.

## Target layout

```
public/
  office/
    main.js         mountOffice: renderer, loop, wiring (small)
    ctx.js          the shared context every module receives
    util.js         helpers, mat/box/cyl, procedural textures
    painters.js     screen, code-monitor and label canvases
    people.js       Person, poses, the people sync
    world/          shell, city + sky, furniture, desks, breakroom + kitchen, lounge,
                    my office, meeting rooms, clocks, whiteboards
    systems/        lifts, player + input, hover + actions, TVs, chat + John, minimap,
                    post-processing
    floors/         archive (cabinet, folders), gateway (inside a repo), roof, server hall
  sounds.js, desktop.js, chat.js, index.html   (unchanged)
server.js           thin: config, http routing, SSE
server/             transcripts, state, sessions-send, tv-browser, repos, john, machine,
                    office-settings, security
```

Native ES module imports in the browser, so no bundler.

## The core change: a shared context and registries

The closure works because everything shares its variables. Instead, every module exports `install(ctx)` and registers what it needs:

- `ctx`: THREE handles, scene/world/camera/renderer, player, people, colliders, lamps, seats, sfx, dash, current state, toast, daylight, quality.
- `ctx.onFrame(fn)`: replaces the hard-wired `liftFx` / `officeFx` / `kitchen.update` / `laptopFx`… calls in the loop.
- `ctx.action(name, { hover, click })`: replaces the long if-chains for the 13 click actions (door, blinds, board, book, cabinet, coffee, computer, folder, gatekey, info, john, laptop, liftcall, liftpanel).
- `ctx.hoverTargets(fn)`, `ctx.key(code, fn)`, `ctx.minimap(fn)`, and the existing `FLOORS` table for floors.

Adding a floor or room then means adding one file.

## Verification harness (built first, kept in `test/`)

1. **Golden screenshots**: ~15 fixed camera poses (each office area, inside the car, each floor, the desktop, a TV, an open drawer, inside a repo) at a fixed sim time, against a fixed set of fixture sessions in an isolated `HOME`. Before and after must match within a small tolerance.
2. **World snapshots**: collider ASCII map, seat/desk/idle-spot counts, a script that checks every walking route against the colliders, the action registry, the floor table.
3. **Server snapshots**: every `/api` route's response for the fixture data, plus the same-origin/JSON/TV-browser security checks.
4. **Frame rate**: a baseline in a real browser on the Mac (headless is too slow to mean anything).

## Phases

| # | Phase | Risk |
|---|---|---|
| 0 | Tag `pre-refactor`; build the harness; record the baseline | none |
| 1 | Move the module-scope code (helpers, textures, painters, Person) into modules | very low |
| 2 | Add `ctx` and the registries inside `mountOffice`, no moves yet | low |
| 3 | Move sections out one at a time, in dependency order: furniture → static rooms → whiteboards → TVs → lifts and player → each floor → chat/John → hover, minimap, post, loop | medium; harness and a commit after each |
| 4 | Split `server.js` into `server/*` | low; independent of the client |
| 5 | Wrap lines over ~160 chars; rewrite CLAUDE.md's layout with a "how to add a floor or room" guide; refresh the README's "How it works" | low |
| 6 | `// @ts-check` + JSDoc types on `ctx`, the registries, the floor table and the server modules; `tsc --noEmit` added to CLAUDE.md's checks (test-only dependency) | low |

Every step is its own commit pushed to main; `pre-refactor` is the escape hatch.

## How it runs

- **One agent, sequentially, for the client** (phases 0–3, 5, 6). Splitting client moves across agents would recreate the collisions this fixes.
- **A second agent for the server split** (phase 4), in parallel; different files.
- **The coordinator** reviews each phase's harness results, keeps the live site on the last good commit, and redeploys after each phase.
- About half a day of agent time.

## Risks

- **Implicit ordering**: lazily built plant kit, functions called before their declaration (hoisting), arrays filled before use. They become explicit imports or late-bound through `ctx`; the harness catches what's missed.
- **Circular dependencies** (lifts and floors): floors register themselves; lifts never import floors.
- **Gaps the screenshots don't cover**: that's what the world and server snapshots are for.
