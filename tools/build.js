#!/usr/bin/env node
/* Builds the downloadable versions of the game into dist/:
 *   dist/battle-cards.html          one self-contained file (scripts, styles and card art inlined) — double-click to play offline
 *   dist/battle-cards-mobile.html   the same for the phone version (mobile/)
 *   dist/battle-cards.zip       the full game folder, including the online server and launch scripts
 * Usage: node tools/build.js            (the zip step needs the `zip` command, or is skipped)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const version = require(path.join(ROOT, 'package.json')).version;

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// ── single-file HTML ──
// Inlines a page's stylesheets, scripts and every card image, resolving paths relative to the page.
const safe = js => js.replace(/<\/script/gi, '<\\/script'); // inline scripts can't contain a literal "</script"
const art = {};
for (const f of fs.readdirSync(path.join(PUB, 'art')).filter(f => f.endsWith('.svg')).sort()) {
  art[f.slice(0, -4)] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(PUB, 'art', f)).toString('base64');
}
function inlinePage(page, out, note) {
  const dir = path.dirname(page);
  const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
  let html = fs.readFileSync(page, 'utf8');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => '<style>\n' + read(href) + '\n</style>');
  // App-install links point at files that aren't in a single-file download; use an inlined icon instead.
  html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
  const icon = path.join(ROOT, 'mobile', 'icons', 'icon-192.png');
  html = html.replace(/<link rel="(icon|apple-touch-icon)" href="[^"]+">/g, (_, rel) =>
    '<link rel="' + rel + '" href="data:image/png;base64,' + fs.readFileSync(icon).toString('base64') + '">');
  let first = true;
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
    const pre = first ? '<script>self.BCArt = ' + JSON.stringify(art) + ';</script>\n  ' : '';
    first = false;
    return pre + '<script>\n' + safe(read(src)) + '\n</script>';
  });
  html = html.replace('<head>', '<head>\n  <!-- Battle Cards v' + version + ' — ' + note + ' -->');
  fs.writeFileSync(path.join(DIST, out), html);
  console.log('dist/' + out + '  ' + (html.length / 1024 / 1024).toFixed(2) + ' MB, ' + Object.keys(art).length + ' card images');
}
inlinePage(path.join(PUB, 'index.html'), 'battle-cards.html', 'single-file build. Online play needs the full download (server.js).');
inlinePage(path.join(ROOT, 'mobile', 'index.html'), 'battle-cards-mobile.html', 'phone version, single-file build.');

// ── full zip ──
const STAGE = path.join(DIST, 'battle-cards');
fs.mkdirSync(STAGE);
for (const f of ['public', 'mobile', 'server.js', 'package.json', 'README.md', 'LICENSE']) {
  if (fs.existsSync(path.join(ROOT, f))) fs.cpSync(path.join(ROOT, f), path.join(STAGE, f), { recursive: true });
}
fs.cpSync(path.join(ROOT, 'launchers'), STAGE, { recursive: true });
fs.copyFileSync(path.join(DIST, 'battle-cards.html'), path.join(STAGE, 'Play Offline.html'));
try {
  execFileSync('zip', ['-qr', 'battle-cards.zip', 'battle-cards'], { cwd: DIST });
  console.log('dist/battle-cards.zip   ' + (fs.statSync(path.join(DIST, 'battle-cards.zip')).size / 1024 / 1024).toFixed(2) + ' MB');
} catch (e) {
  console.log('zip not available — the full game folder is in dist/battle-cards/');
}
