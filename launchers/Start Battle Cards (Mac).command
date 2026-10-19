#!/bin/bash
# Starts the Battle Cards server (needed for online play) and opens the game in your browser.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed, so online play is unavailable. Opening the offline version instead."
  echo "Install Node.js from https://nodejs.org to play online."
  open "Play Offline.html"
  exit 0
fi
echo "Battle Cards is running at http://localhost:8080 - close this window to stop it."
(sleep 2; open "http://localhost:8080") &
node server.js
