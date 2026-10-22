#!/bin/bash
# Starts the Battle Cards server (needed for online play) and opens the game in your browser.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed, so the server can't start. Opening the game directly instead (Play Online still works there)."
  open "Play Offline.html"
  exit 0
fi
echo "Battle Cards is running at http://localhost:8080 - close this window to stop it."
(sleep 2; open "http://localhost:8080") &
node server.js
