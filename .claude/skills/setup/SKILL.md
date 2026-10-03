---
name: setup
description: Setup wizard for my-office, the live Claude Code dashboard with a 3D office view. Use when the user runs /setup in this repo, or asks to install, set up, configure, reconfigure, repair, or uninstall my-office.
---

# my-office setup wizard

You are setting up **my-office** for the user: a local web dashboard of every Claude Code session on this machine, with an Overview tab and a first-person 3D Office tab. Everything runs locally and only reads Claude Code's own files under `~/.claude`. Nothing is sent anywhere.

The mechanical work is done by `node bin/setup.mjs`. Your job is to check the machine, ask a few questions, run the script with the right flags, and confirm it works. Keep it friendly and brief: this is a wizard, not a lecture.

## 1. Check the current state

Run from the repo root:

```bash
node bin/setup.mjs --status
```

It prints JSON. Act on it:
- `nodeOk: false` or `node` missing: stop and tell the user to install Node.js 18+ (e.g. `brew install node`, or nodejs.org). Don't try to install Node yourself.
- `claudeDir: false`: Claude Code hasn't been run on this machine yet. Stop and say so.
- `config` already filled in and `service` installed: this is a re-run. Ask whether they want to change settings, repair, or uninstall, rather than starting from scratch.
- `platform` other than `darwin`/`linux`: setup still works, but the server must be started manually with `npm start` (pass `--no-service`).

## 2. Ask the user

Ask these together in one message, with sensible defaults so they can just say "defaults are fine":

1. **Name for the office door**: shown on the glass door of their private office in the 3D view ("Sam's office"). Default: no name ("My office").
2. **City**: the 3D office's sun, moon, sunsets and night sky follow the real sky at this location. Default: London.
3. **Port**: default `7777`. Only matters if something else already uses it.
4. **Run in the background**: install as a login service (launchd on macOS, a systemd user unit on Linux) so it's always available. Default: yes.
5. **Status line hook**: explain plainly that plan-limit %, context %, prompt-cache state and accurate cost come from Claude Code's status line. Setup puts a small "tap" in front of their status line that saves each update to `~/.claude/my-office/` and then runs their existing status line unchanged. `~/.claude/settings.json` is backed up first, and uninstall restores it. Default: yes. Without it the dashboard still works, using transcript-based estimates and no plan limits.

Work out the city's latitude and longitude yourself (two decimal places is plenty). Don't ask the user for coordinates.

## 3. Run setup

```bash
node bin/setup.mjs --owner "<name or empty>" --city "<city>" --lat <lat> --lon <lon> --port <port>
```

Add `--no-service` if they declined the background service, and `--no-statusline` if they declined the status line hook. Pass `--owner ""` for no name.

The script installs npm dependencies, writes `config.json`, hooks the status line, installs the service, and waits for the server to answer. Read its output. If it fails:
- **Port in use**: pick another port and re-run.
- **launchctl or systemctl errors**: show the error, offer `--no-service` and `npm start` instead.
- **Server didn't answer**: check the logs (macOS: `~/Library/Logs/my-office/err.log`; Linux: `journalctl --user -u my-office`).

If the status line hook reports "your own status line script already saves snapshots", that's fine: leave it alone.

## 4. Open it and hand over

Open `http://127.0.0.1:<port>` in their browser (`open` on macOS, `xdg-open` on Linux). Then tell them, briefly:

- **Overview tab**: live sessions, plan limits, cost, activity feed and charts. Click any session for full detail.
- **Office tab**: the camera zooms out of their monitor into a 3D office. Working sessions sit at desks with live stats on their screens, and idle ones hang out in the breakroom.
  - Controls: click to look around, WASD to move, Shift to run, and click a person or screen for details.
  - Keys: 1–4 jump between areas, T speeds up time, and G toggles heavy graphics effects.
- **Status line timing**: the status line data appears for each session the next time its status line redraws, which happens on that session's next message.
- **Uninstall**: `node bin/setup.mjs --uninstall` removes the service and restores their original status line.

If they didn't install the service, tell them to start it with `npm start` in the repo.
