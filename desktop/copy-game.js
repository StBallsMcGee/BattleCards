/* Copies the game (../public) into desktop/game so it is packaged inside the app. */
'use strict';
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'public');
const dest = path.join(__dirname, 'game');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
// The app bundles its own version number from the main package.json.
const v = require('../package.json').version;
const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version !== v) { pkg.version = v; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n'); }
console.log('Copied the game into desktop/game (v' + v + ')');
