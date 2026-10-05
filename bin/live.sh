#!/bin/sh
# Keeps a live my-office running the newest origin/main, so the browser always shows the latest pushed work.
#
#   bin/live.sh <live-dir> [port]
#
# <live-dir> is a dedicated checkout (e.g. `git worktree add --detach ../office-live origin/main`) that nobody edits.
# Every 30 s: fetch; if origin/main moved, run the syntax checks on it (in a scratch copy, so the live tree never holds
# a broken version), check it out, `npm install` if package files changed, and restart the server only if server.js /
# server/ / package files changed (front-end changes are served fresh, and open pages reload themselves when
# /api/build changes). A version that fails the checks, or whose server doesn't come up, is skipped (rolled back) and
# not tried again until main moves on. A server that dies is started again. Everything goes to <live-dir>/.live.log.
set -u
[ $# -ge 1 ] || { echo "usage: bin/live.sh <live-dir> [port]" >&2; exit 2; }
LIVE=$(cd "$1" && pwd) || exit 1; PORT=${2:-7777}
EVERY=${LIVE_EVERY:-30}   # seconds between fetches
LOG="$LIVE/.live.log"; PID="$LIVE/.live.pid"; SELF="$LIVE/.live.sh.pid"
cd "$LIVE" || exit 1
export GIT_TERMINAL_PROMPT=0
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
short() { git rev-parse --short "$1"; }

# One deployer per checkout.
if [ -f "$SELF" ] && kill -0 "$(cat "$SELF")" 2>/dev/null; then echo "live.sh already running for $LIVE (pid $(cat "$SELF"))" >&2; exit 1; fi
echo $$ > "$SELF"

# The CLAUDE.md syntax checks, on a scratch copy of <commit>. The front end is checked as a module on stdin: `node --check
# file.js` passes an ES module with a syntax error in it (no "type" in package.json, so node guesses, and never checks it).
checks() {
  dir=$(mktemp -d "${TMPDIR:-/tmp}/office-live-check.XXXXXX") || return 1
  git archive "$1" | tar -x -C "$dir" && (
    cd "$dir" || exit 1
    for f in server.js server/*.js bin/setup.mjs; do
      [ -f "$f" ] || continue
      node --check "$f" || exit 1
    done
    for f in public/*.js public/office/*.js public/office/*/*.js; do
      [ -f "$f" ] || continue
      node --input-type=module --check < "$f" || { echo "in $f"; exit 1; }
    done
  ) 2>>"$LOG"
  ok=$?; rm -rf "$dir"; return $ok
}
npmi() { npm install --no-audit --no-fund --loglevel=error >> "$LOG" 2>&1; }

running() { [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; }
start() {
  PORT=$PORT node server.js < /dev/null >> "$LOG" 2>&1 &
  echo $! > "$PID"; log "server started (pid $!) on $(short HEAD)"
}
# The server and everything under it (the TV browser's Chrome and its helpers, John's claude -p): TERM, then KILL
# whatever is still there after 5 s, then wait for the port to be free for the next start.
tree() { for c in $(pgrep -P "$1"); do tree "$c"; done; echo "$1"; }
stop() {
  running || { rm -f "$PID"; return 0; }
  pids=$(tree "$(cat "$PID")"); rm -f "$PID"
  kill $pids 2>/dev/null
  i=0; while [ $i -lt 10 ] && kill -0 $pids 2>/dev/null; do sleep 0.5; i=$((i + 1)); done
  kill -9 $pids 2>/dev/null
  i=0; while [ $i -lt 20 ] && lsof -ti "tcp:$PORT" -sTCP:LISTEN > /dev/null 2>&1; do sleep 0.5; i=$((i + 1)); done
}
healthy() {   # the new server answers /api/state within 20 s
  i=0
  while [ $i -lt 20 ]; do
    curl -sf -o /dev/null "http://127.0.0.1:$PORT/api/state" && return 0
    running || return 1
    sleep 1; i=$((i + 1))
  done
  return 1
}

trap 'stop; rm -f "$SELF"; log "live.sh stopped"; exit 0' INT TERM HUP

deploy() {   # <new> <cur>
  new=$1; cur=$2; changed=$(git diff --name-only "$cur" "$new")
  if ! checks "$new"; then log "$(short "$new") fails the checks; staying on $(short "$cur")"; skip=$new; return; fi
  git checkout -q --detach "$new" 2>>"$LOG" || { log "checkout of $(short "$new") failed"; skip=$new; return; }
  pkg=$(echo "$changed" | grep '^package' || true)
  if [ -n "$pkg" ] && ! npmi; then
    log "npm install failed on $(short "$new"); back to $(short "$cur")"; skip=$new
    git checkout -q --detach "$cur"; npmi; return
  fi
  if ! echo "$changed" | grep -qE '^(server\.js|server/|package)'; then log "deployed $(short "$new") (front end only)"; return; fi
  log "deploying $(short "$new") (server changed: restart)"; stop; start
  healthy && { log "deployed $(short "$new")"; return; }
  log "$(short "$new")'s server doesn't come up; back to $(short "$cur")"; skip=$new
  stop; git checkout -q --detach "$cur"; [ -n "$pkg" ] && npmi; start
}

[ -d node_modules ] || npmi
log "live.sh watching origin/main in $LIVE, port $PORT"
start
skip=''; fetching=1
while :; do
  sleep "$EVERY" & wait $!
  running || { log "server died; starting it again"; start; }
  if ! git fetch -q origin main 2>>"$LOG"; then [ $fetching = 1 ] && log "fetch failed (will keep trying)"; fetching=0; continue; fi
  [ $fetching = 0 ] && log "fetching again"; fetching=1
  new=$(git rev-parse origin/main); cur=$(git rev-parse HEAD)
  [ "$new" = "$cur" ] || [ "$new" = "$skip" ] && continue
  deploy "$new" "$cur"
done
