#!/usr/bin/env node
/* Renders mobile/icons/icon.svg to the PNG app icons (needs Playwright with Chromium). */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const DIR = path.join(__dirname, '..', 'mobile', 'icons');
(async () => {
  const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');
  const b = await chromium.launch();
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent('<style>html,body{margin:0}svg{display:block;width:' + size + 'px;height:' + size + 'px}</style>' + svg);
    await p.screenshot({ path: path.join(DIR, name) });
    console.log('wrote mobile/icons/' + name);
  }
  await b.close();
})();
