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
node --check server.js && node --check public/office.js && node --check bin/setup.mjs
launchctl kickstart -k gui/$(id -u)/com.my-office.server   # macOS service; Linux: systemctl --user restart my-office
curl -sf http://127.0.0.1:7777/api/state > /dev/null && echo server ok
```

`public/` is served with `no-store`, so front-end changes only need a browser refresh. `server.js` changes need the restart.

## Layout

- `server.js`: tails `~/.claude` (session registry, transcripts incl. subagents, status line snapshots) and pushes state over SSE at `/events`. Per-session detail is at `/api/session/:id`, config at `/api/config`. It also runs the wall TVs: one headless Chrome (CDP over `--remote-debugging-pipe`, profile `~/.claude/my-office/tv-browser`), a tab per TV, screencast frames and input over the dependency-free WebSocket at `/tv`.
- `public/index.html`: the overview tab, the tabs, and the `window.dash` bridge (state, colours, drawer, config).
- `public/office.js`: the 3D office (Three.js, vendored via npm and served at `/vendor/three/`). The centre monitor in the owner's office is the live overview `<main>` in a CSS3DObject behind a hole punched in the WebGL frame.
- `bin/setup.mjs` and `.claude/skills/setup`: installer and the `/setup` wizard. `bin/statusline-tap.sh`: the status line snapshot tap.
- `config.json` (gitignored): owner name, city, lat/lon, port.
