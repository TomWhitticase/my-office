# my-office

A first-person 3D office where every Claude Code session on your machine is a person at work, with a live dashboard on the computer on your desk.

- **The office**: working sessions sit at the desk pods typing, with their live stats and the code they're writing on their screens. Waiting ones lean back, scroll a phone or spin their chair; idle ones take a break in the kitchen, on the sofas, at ping pong or in a meeting room. People arrive and leave by lift, and coffee cups pile up on the desks of the hardest workers. The city outside follows the real sun, moon and sunsets where you live.
- **Your computer**: click your monitor for an XP-style desktop with three apps: **Dashboard** (running sessions, 5-hour and weekly plan limits, context and prompt cache, API-equivalent cost, live activity, charts, per-session timelines including subagents), **Office Admin** (lights, blinds, door, sounds, TVs) and **Messages** (read and reply to your sessions). A MacBook in the lounge shows the same desktop.
- **Talk to them**: click a person to see their conversation and send them a message.
- **Wall TVs**: show any web page, live and usable (YouTube, dashboards…), with ad blocking, per-TV volume that fades with distance, and auto-refresh.
- **Other floors, by lift**: a roof terrace with a little helicopter you can fly round the city (click it; W/S, A/D, Space/Shift, R to fly home, F to get out); the Server Hall (a rack per session plus this machine's live CPU, memory, disks and network, and John the sysadmin, who answers questions about it); and THE ARCHIVE, a white void with a filing cabinet of your GitHub repos and a gateway into them.

Everything runs locally and reads Claude Code's own files under `~/.claude`. The only things that leave your machine are the ones you use: TVs load the pages you pick, the archive asks GitHub for your repos via `gh`, and John asks Claude via your `claude` CLI.

## Setup

You need Node.js 18+ and Claude Code, on macOS (Linux should work but is less tested).

Optional, each unlocks part of the office (setup tells you which are missing):

| Tool | Unlocks |
| --- | --- |
| [GitHub CLI](https://cli.github.com) (`gh`), signed in | THE ARCHIVE: your repos in the filing cabinet |
| Google Chrome (or Chromium) | The wall TVs |
| [Orca](https://orca.app) or tmux | Sending messages to sessions running in them |
| `claude` CLI on your PATH | John in the Server Hall |

```bash
git clone https://github.com/TomWhitticase/my-office.git
cd my-office
claude
```

Then type **`/setup`**. The wizard asks a few questions (your name, city, port) and then:
- installs dependencies
- hooks your status line, keeping your existing one
- runs the server in the background (launchd on macOS, systemd on Linux)
- opens the dashboard at http://127.0.0.1:7777

Without Claude Code you can run the same thing directly:

```bash
node bin/setup.mjs --owner "Sam" --city Berlin --lat 52.52 --lon 13.40
```

## Office controls

| Key | Action |
| --- | --- |
| Click | Look around (captures the mouse); then click a person to chat, a screen for details, a TV to use it, a chair to sit, doors, blinds, whiteboards, lift buttons |
| W A S D, Shift | Move, run |
| 1 2 3 4 5 | Desks, breakroom, your office, lobby, meeting rooms |
| E | Session details, or set up the TV you're aiming at |
| T | Time speed: live, ×120, ×1200, ×7200 |
| G | Toggle heavy graphics effects (ambient occlusion, bloom) |
| H | Hide or show the overlays (minimap, name tags…) |
| M | Sounds on or off |
| Esc | Release the mouse, or leave whatever you're using |

Click your own monitor to use your computer.

## How it works

`server.js` is a small Node server with no dependencies (the work is in `server/`: transcripts, state, sending to
sessions, the TV browser, your repos, John, this machine, the office settings and the security checks). It tails:

| Source | What it gives |
| --- | --- |
| `~/.claude/sessions/*.json` | which sessions are live, their names and busy/idle status |
| `~/.claude/projects/**/*.jsonl` | transcripts: tokens, tools, prompts, subagents, PRs |
| `~/.claude/my-office/statusline/*.json` | the latest status line payload per session: cost, context %, prompt cache, plan rate limits. Written by `bin/statusline-tap.sh` |
| `~/.claude/powerline/usage/` | daily history, if you use claude-powerline (optional) |

It streams state to the browser over Server-Sent Events. The 3D office uses Three.js and is plain ES modules under
`public/office/`, no build step: `main.js` sets up the renderer, scene and loop and installs each part of the building
(`world/` for the rooms, `systems/` for the lifts, you, the TVs, chat and hover, `floors/` for the archive, the gateway,
the roof and the server hall), which share one context object. The desktop on your monitor is real HTML
(`public/desktop.js`) projected into the scene with CSS3DRenderer. The wall TVs are tabs in a hidden Chrome the server
drives over the DevTools protocol, streamed onto the screens.

`test/` holds the harness that checks a change to the code changed nothing you can see: screenshots of the office at
fixed poses, snapshots of how it's built and of every API response (see `test/README.md`).

Costs are API-equivalent estimates at list prices. On a Pro/Max subscription they measure usage, not a bill.

## Uninstall

```bash
node bin/setup.mjs --uninstall
```

This removes the background service and restores your previous status line. Delete the repo folder and `~/.claude/my-office` to remove everything.
