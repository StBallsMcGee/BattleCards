/* Battle Cards — desktop app. Opens the game (game/index.html, a copy of ../public) in its own window. */
'use strict';
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Only one copy of the app at a time; opening it again focuses the existing window.
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#0f0b08',
    title: 'Battle Cards',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'game', 'index.html'));
  // Web links (e.g. to Node.js or GitHub) open in the normal browser, never inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
  { label: 'Game', submenu: [{ role: 'togglefullscreen' }, { role: 'reload' }, { type: 'separator' }, { role: 'quit' }] },
  { role: 'editMenu' },
  { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'toggleDevTools' }] },
]));

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
