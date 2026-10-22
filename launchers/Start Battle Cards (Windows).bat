@echo off
rem Starts the Battle Cards server and opens the game in your browser. (You don't need the server to play
rem online with a friend; it's for playing on the same Wi-Fi through this computer.)
cd /d "%~dp0"
if not exist "server.js" (
  echo This file needs the rest of the Battle Cards folder next to it.
  echo.
  echo If you opened it from inside the zip file: close this window, right-click
  echo battle-cards.zip, choose "Extract All...", then open the extracted folder
  echo and double-click "Start Battle Cards (Windows).bat" there.
  echo.
  echo Tip: the Battle Cards installer ^(Battle-Cards-Setup.exe on the Releases page^) is easier.
  pause
  exit /b
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed, so the server can't start. Opening the game directly instead.
  echo Play Online still works there: create a room and send the code to your friend.
  start "" "Play Offline.html"
  pause
  exit /b
)
echo Battle Cards is running at http://localhost:8080  -  close this window to stop it.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
node server.js
pause
