#!/bin/sh
# Linux: starts the Battle Cards server (needed for online play) and opens the game in your browser.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed, so online play is unavailable. Opening the offline version instead."
  xdg-open "Play Offline.html" 2>/dev/null
  exit 0
fi
echo "Battle Cards is running at http://localhost:8080 - press Ctrl+C to stop it."
(sleep 2; xdg-open "http://localhost:8080" 2>/dev/null) &
node server.js
