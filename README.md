# my-office

A live dashboard for every Claude Code session running on your machine, with a first-person 3D office you can walk around.

- **Overview**: running sessions and what each one is doing right now, 5-hour and weekly plan limits, context window and prompt cache state, API-equivalent cost, a merged live activity feed, hourly/daily charts, and full per-session timelines including subagents.
- **Office**: the dashboard zooms out of the monitor on your desk into a 3D office:
  - **Desks:** working sessions sit at desks with their live stats on their screens.
  - **Breakroom:** idle sessions hang out there (sofas, coffee, ping pong).
  - **Your office:** a glass office with the overview on its screens.
  - **Outside:** the city's sun, moon and sunsets follow the real sky where you live.

Everything runs locally. It only reads Claude Code's own files under `~/.claude`; nothing leaves your machine.

## Setup

You need Node.js 18+ and Claude Code.

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
| Click | Look around (captures the mouse); click a person or screen for details |
| W A S D, Shift | Move, run |
| 1 2 3 4 | Desks, breakroom, your office, lobby |
| T | Time speed: live, ×120, ×1200, ×7200 |
| G | Toggle heavy graphics effects (ambient occlusion, bloom) |
| Esc | Release the mouse |

Click your own monitor to go back to the overview.

## How it works

`server.js` is a small Node server with no dependencies. It tails:

| Source | What it gives |
| --- | --- |
| `~/.claude/sessions/*.json` | which sessions are live, their names and busy/idle status |
| `~/.claude/projects/**/*.jsonl` | transcripts: tokens, tools, prompts, subagents, PRs |
| `~/.claude/my-office/statusline/*.json` | the latest status line payload per session: cost, context %, prompt cache, plan rate limits. Written by `bin/statusline-tap.sh` |
| `~/.claude/powerline/usage/` | daily history, if you use claude-powerline (optional) |

It streams state to the browser over Server-Sent Events. The 3D office (`public/office.js`) uses Three.js. The monitor on your desk shows the real overview page, projected into the scene with CSS3DRenderer.

Costs are API-equivalent estimates at list prices. On a Pro/Max subscription they measure usage, not a bill.

## Uninstall

```bash
node bin/setup.mjs --uninstall
```

This removes the background service and restores your previous status line. Delete the repo folder and `~/.claude/my-office` to remove everything.
