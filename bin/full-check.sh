#!/bin/bash
# The periodic full check: every suite of the harness against a fresh checkout of origin/main, in a temporary worktree
# (nobody's working tree is touched), under the shared harness lock. Appends a short report to
# ~/.claude/my-office/full-check.log: pass, or which suites and shots failed (with their diff numbers) and the commits
# since the last passing run. Exits non-zero on failure. Usage: bin/full-check.sh [--port=7909]
set -u
REPO=$(cd "$(dirname "$0")/.." && git rev-parse --show-toplevel) || exit 2
PORT=7909
for a in "$@"; do case $a in --port=*) PORT=${a#--port=} ;; esac; done
DIR=$HOME/.claude/my-office
LOG=$DIR/full-check.log
PASSED=$DIR/full-check.last-pass   # the last commit a full check passed on
LOCK=/tmp/my-office-harness.lock
mkdir -p "$DIR"

git -C "$REPO" fetch -q origin main || { echo "full-check: fetch failed" >&2; exit 2; }
SHA=$(git -C "$REPO" rev-parse origin/main)
WT=$(mktemp -d "${TMPDIR:-/tmp}/my-office-full-check.XXXXXX")
OUT=$WT.out

until mkdir "$LOCK" 2>/dev/null; do
  find "$LOCK" -maxdepth 0 -mmin +30 -exec rmdir {} \; 2>/dev/null   # stale (its holder died)
  sleep 20
done
# Keep the lock fresh while we hold it (a full run can outlast the 30 minutes after which a lock counts as stale).
( while sleep 60; do touch "$LOCK" 2>/dev/null || exit; done ) &
KEEP=$!
cleanup() {
  kill "$KEEP" 2>/dev/null
  rmdir "$LOCK" 2>/dev/null
  git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"
  git -C "$REPO" worktree prune
  rm -f "$OUT"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

START=$(date +%s)
{
  git -C "$REPO" worktree add -q --detach "$WT" "$SHA" &&
  (cd "$WT" && npm ci --silent --no-audit --no-fund --prefer-offline) &&
  (cd "$WT" && node test/run.mjs --port="$PORT")
} >"$OUT" 2>&1
CODE=$?
MINS=$(( ($(date +%s) - START + 59) / 60 ))

SUBJECT=$(git -C "$REPO" log -1 --format='%h %s' "$SHA")
{
  echo "=== $(date '+%Y-%m-%d %H:%M') origin/main $SUBJECT (${MINS} min)"
  if [ $CODE -eq 0 ]; then
    echo "PASS"
  else
    echo "FAIL (exit $CODE)"
    # The suite headers, each failure with its indented detail, page errors, and the summary line.
    grep -E '^(api|world|golden)|✗|^    |page errors|failure|Error' "$OUT" | grep -vE '^  ✓' | head -80
    LAST=$(cat "$PASSED" 2>/dev/null)
    if [ -n "$LAST" ] && git -C "$REPO" cat-file -e "$LAST" 2>/dev/null; then
      echo "commits since the last pass (${LAST:0:7}):"
      git -C "$REPO" log --format='  %h %an: %s' "$LAST..$SHA"
    else
      echo "no earlier passing run on record"
    fi
  fi
  echo
} >>"$LOG"
[ $CODE -eq 0 ] && echo "$SHA" >"$PASSED"
tail -n +"$(grep -n '^=== ' "$LOG" | tail -1 | cut -d: -f1)" "$LOG"
exit $CODE
