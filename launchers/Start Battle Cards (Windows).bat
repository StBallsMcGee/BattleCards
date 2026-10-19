@echo off
rem Starts the Battle Cards server (needed for online play) and opens the game in your browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed, so online play is unavailable.
  echo Opening the offline version instead. Install Node.js from https://nodejs.org to play online.
  start "" "Play Offline.html"
  pause
  exit /b
)
echo Battle Cards is running at http://localhost:8080  -  close this window to stop it.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
node server.js
pause
