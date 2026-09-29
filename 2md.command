#!/bin/bash
# Double-click this file to open 2md.
#
# It stops any copy of this server left running, starts a fresh one on a fixed
# port, and opens the app. Killing the old one first is deliberate: a stale
# server answering on a different port is confusing to diagnose, and pinning the
# port keeps the URL stable enough to bookmark.

set -u

cd "$(dirname "$0")" || exit 1
HERE="$(pwd)"

if [ ! -f "server.mjs" ] || [ ! -f "shell.html" ] || [ ! -f "home.html" ]; then
  echo "This launcher must sit next to server.mjs, shell.html and home.html."
  echo "Current folder: $HERE"
  echo
  read -r -p "Press Return to close."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "2md needs Node.js, which is not installed."
  echo
  echo "Install it from https://nodejs.org (the LTS build), then run this again."
  echo
  read -r -p "Press Return to close."
  exit 1
fi

PORT=7777

# Stop whatever is on the port if it is a previous copy of this server
# (a `node server.mjs`, however it was launched). Anything else stays.
for PID in $(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); do
  if ps -o comm= -p "$PID" 2>/dev/null | grep -q node; then
    echo "Stopping a copy already running (pid: $PID)"
    kill "$PID" 2>/dev/null || true
    sleep 1
    kill -9 "$PID" 2>/dev/null || true
  fi
done

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is held by something else:"
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | sed -n '1,6p'
  echo
  echo "Stop it, or start on another port yourself:"
  echo "  PORT=7788 node server.mjs"
  echo
  read -r -p "Press Return to close."
  exit 1
fi

URL="http://127.0.0.1:$PORT/"

if ! command -v claude >/dev/null 2>&1; then
  echo "Note: the Claude Code CLI is not on PATH, so the prompt bar will be off."
  echo "Writing, editing and saving all work regardless."
  echo
fi

echo "2md   : $HERE"
echo "Open  : $URL"
echo
echo "Leave this window open while you use it."
echo "Close it, or press Control-C, to stop."
echo

PORT="$PORT" node server.mjs &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT INT TERM

sleep 1
open "$URL"
wait "$SERVER"
