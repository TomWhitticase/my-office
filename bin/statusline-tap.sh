#!/bin/sh
# my-office status line tap.
# Claude Code pipes a JSON payload (cost, context window, prompt cache, plan rate limits) to the status line
# command on every redraw. This saves the latest payload per session for the dashboard, then hands it on to
# the status line you had before setup (kept in ~/.claude/my-office/statusline-next), or prints a minimal one.
input=$(cat)

dir="$HOME/.claude/my-office/statusline"
sid=$(printf '%s' "$input" | sed -n 's/.*"session_id" *: *"\([^"]*\)".*/\1/p' | head -1)
if [ -n "$sid" ]; then
  mkdir -p "$dir" && printf '%s' "$input" > "$dir/$sid.json.tmp" && mv "$dir/$sid.json.tmp" "$dir/$sid.json"
fi

next="$HOME/.claude/my-office/statusline-next"
if [ -s "$next" ]; then
  printf '%s' "$input" | sh -c "$(cat "$next")"
else
  model=$(printf '%s' "$input" | sed -n 's/.*"display_name" *: *"\([^"]*\)".*/\1/p' | head -1)
  cwd=$(printf '%s' "$input" | sed -n 's/.*"current_dir" *: *"\([^"]*\)".*/\1/p' | head -1)
  printf '%s  %s' "${model:-Claude}" "$(basename "${cwd:-$PWD}")"
fi
