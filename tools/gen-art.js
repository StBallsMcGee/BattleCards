#!/usr/bin/env node
// Generates an illustrated SVG for every card into public/art/<id>.svg.
// Each set has its own scene language; every card gets a unique, seeded composition.
//   node tools/gen-art.js
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../public/js/cards.js');

const OUT = path.join(__dirname, '..', 'public', 'art');
fs.mkdirSync(OUT, { recursive: true });

const ENERGY = { M: '#d24b3e', A: '#9a5cd6', T: '#d6a531', S: '#2bb3c9' };
const W = 400, H = 300;

function rng(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = (h + 0x6D2B79F5) | 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = n => Math.round(n * 10) / 10;
function mix(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('');
}

function scene(card) {
  const r = rng(card.id);
  const R = (a, b) => a + r() * (b - a);
  const accent = card.energy ? ENERGY[card.energy[0]] : '#3fae75';
  const accent2 = card.energy && card.energy[1] ? ENERGY[card.energy[1]] : mix(accent, '#ffffff', 0.35);
  const shifted = !!(card.shift && card.shift.ontoOnly) || card.flipSide;
  const nightmare = /Nightmare/.test(card.name);
  const defs = [];
  const back = [];
  const fore = [];
  let sky = ['#2a1d12', '#7a4a22'];
  const set = card.set || 'core';

  if (set === 'core') {
    sky = [mix('#1a1020', accent, 0.25), mix('#e09a4a', accent, 0.2)];
    back.push(`<circle cx="${f(R(60, 340))}" cy="${f(R(40, 90))}" r="${f(R(26, 40))}" fill="#ffd9a0" opacity="0.55"/>`);
    // colosseum arches
    const y = R(150, 175);
    back.push(`<rect x="0" y="${f(y)}" width="${W}" height="${H - y}" fill="#3b2616"/>`);
    for (let x = -10; x < W; x += 34) back.push(`<path d="M${x + 6},${f(y + 60)} v-30 a11 11 0 0 1 22 0 v30 z" fill="#1d120a" opacity="0.85"/>`);
    back.push(`<ellipse cx="200" cy="${H + 30}" rx="260" ry="90" fill="#c9a46d" opacity="0.9"/>`);
    for (let i = 0; i < 26; i++) fore.push(`<circle cx="${f(R(0, W))}" cy="${f(R(180, H))}" r="${f(R(0.8, 2.4))}" fill="#f2d29a" opacity="${f(R(0.2, 0.6))}"/>`);
  } else if (set === 'elementals') {
    sky = ['#0d0a26', mix('#241a5a', accent, 0.45)];
    const cx = R(170, 230), cy = R(120, 160);
    defs.push(`<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${accent2}"/></linearGradient>`);
    for (let i = 0; i < 6; i++) back.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(150 - i * 20)}" ry="${f(110 - i * 15)}" fill="none" stroke="url(#ring)" stroke-width="${f(R(2, 7))}" opacity="${f(0.15 + i * 0.1)}" transform="rotate(${f(R(-25, 25))} ${f(cx)} ${f(cy)})"/>`);
    for (let i = 0; i < 40; i++) { const a = R(0, Math.PI * 2), d = R(40, 190); fore.push(`<circle cx="${f(cx + Math.cos(a) * d)}" cy="${f(cy + Math.sin(a) * d * 0.7)}" r="${f(R(0.8, 3))}" fill="${r() < 0.5 ? accent : '#ffffff'}" opacity="${f(R(0.3, 0.9))}"/>`); }
  } else if (set === 'bureau') {
    sky = ['#070b16', mix('#1b2a40', accent, 0.25)];
    back.push(`<polygon points="${f(R(150, 250))},0 ${f(R(40, 120))},${H} ${f(R(280, 360))},${H}" fill="#fff6c8" opacity="0.08"/>`);
    let x = -10;
    while (x < W) {
      const bw = R(26, 60), bh = R(80, 190);
      back.push(`<rect x="${f(x)}" y="${f(H - bh)}" width="${f(bw)}" height="${f(bh)}" fill="#0b1220"/>`);
      for (let wy = H - bh + 8; wy < H - 10; wy += 14) for (let wx = x + 5; wx < x + bw - 6; wx += 10) if (r() < 0.28) back.push(`<rect x="${f(wx)}" y="${f(wy)}" width="4" height="6" fill="${r() < 0.8 ? '#f4d27a' : accent}" opacity="0.8"/>`);
      x += bw + R(2, 8);
    }
    for (let i = 0; i < 60; i++) { const rx = R(0, W), ry = R(0, H); fore.push(`<line x1="${f(rx)}" y1="${f(ry)}" x2="${f(rx - 6)}" y2="${f(ry + 18)}" stroke="#9fb6d6" stroke-width="1" opacity="0.35"/>`); }
  } else if (set === 'apex') {
    sky = [mix('#ffcf6a', accent, 0.25), mix('#7a1c1c', accent, 0.2)];
    const cx = 200, cy = R(110, 140);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; back.push(`<polygon points="${cx},${f(cy)} ${f(cx + Math.cos(a) * 500)},${f(cy + Math.sin(a) * 500)} ${f(cx + Math.cos(a + 0.12) * 500)},${f(cy + Math.sin(a + 0.12) * 500)}" fill="#fff4d0" opacity="0.13"/>`); }
    let x = -10;
    while (x < W) { const bw = R(20, 50), bh = R(50, 130); back.push(`<rect x="${f(x)}" y="${f(H - bh)}" width="${f(bw)}" height="${f(bh)}" fill="#3a1414" opacity="0.85"/>`); x += bw + R(0, 6); }
    back.push(`<polygon points="${[0, 1, 2, 3, 4, 5].map(i => f(cx + Math.cos(i * Math.PI / 3 + Math.PI / 6) * 95) + ',' + f(cy + 25 + Math.sin(i * Math.PI / 3 + Math.PI / 6) * 95)).join(' ')}" fill="none" stroke="#ffe7a6" stroke-width="5" opacity="0.6"/>`);
  } else if (set === 'octo') {
    sky = nightmare ? ['#12040a', '#5a0f1c'] : ['#0a3b55', '#02121f'];
    sky.reverse();
    for (let i = 0; i < 6; i++) { const x = R(0, W); back.push(`<polygon points="${f(x)},0 ${f(x + 30)},0 ${f(x + R(60, 140))},${H} ${f(x + R(-40, 20))},${H}" fill="${nightmare ? '#ff6b6b' : '#bff3ff'}" opacity="0.07"/>`); }
    back.push(`<path d="M0,${H} Q${f(R(60, 140))},${f(R(220, 250))} 200,${f(R(240, 265))} T${W},${f(R(230, 260))} V${H} Z" fill="${nightmare ? '#2a0610' : '#082233'}"/>`);
    for (let i = 0; i < 4; i++) {
      const x0 = R(-20, W + 20), c1x = x0 + R(-80, 80), c2x = x0 + R(-80, 80);
      fore.push(`<path d="M${f(x0)},${H + 10} C${f(c1x)},${f(R(180, 240))} ${f(c2x)},${f(R(120, 200))} ${f(x0 + R(-60, 60))},${f(R(90, 170))}" fill="none" stroke="${nightmare ? '#7a1426' : '#0f5f73'}" stroke-width="${f(R(9, 16))}" stroke-linecap="round" opacity="0.85"/>`);
    }
    for (let i = 0; i < 18; i++) fore.push(`<circle cx="${f(R(0, W))}" cy="${f(R(0, H))}" r="${f(R(2, 7))}" fill="none" stroke="#dff9ff" stroke-width="1.2" opacity="${f(R(0.25, 0.7))}"/>`);
    if (nightmare) for (let i = 0; i < 3; i++) { const x = R(30, 370), y = R(30, 120); fore.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="7" ry="4" fill="#ff3b3b"/><ellipse cx="${f(x + 20)}" cy="${f(y)}" rx="7" ry="4" fill="#ff3b3b"/>`); }
  } else if (set === 'hollowing') {
    sky = ['#0b0d0c', mix('#2c3a33', accent, 0.15)];
    for (let i = 0; i < 9; i++) { const x = R(0, W), w = R(6, 18); back.push(`<path d="M${f(x)},${H} L${f(x + R(-10, 10))},${f(R(20, 120))} L${f(x + w)},${H} Z" fill="#050606" opacity="${f(R(0.5, 0.95))}"/>`); }
    defs.push(`<filter id="fog"><feGaussianBlur stdDeviation="14"/></filter>`);
    for (let i = 0; i < 5; i++) back.push(`<ellipse cx="${f(R(0, W))}" cy="${f(R(170, 280))}" rx="${f(R(90, 180))}" ry="${f(R(20, 40))}" fill="#9aa5a0" opacity="0.18" filter="url(#fog)"/>`);
    const ex = R(80, 320), ey = R(50, 110);
    back.push(`<ellipse cx="${f(ex)}" cy="${f(ey)}" rx="44" ry="20" fill="none" stroke="#a07bff" stroke-width="2" opacity="0.5"/><circle cx="${f(ex)}" cy="${f(ey)}" r="11" fill="#140a22" stroke="#a07bff" stroke-width="2" opacity="0.8"/>`);
    for (let i = 0; i < 10; i++) fore.push(`<rect x="${f(R(0, W))}" y="${f(R(0, H))}" width="${f(R(10, 50))}" height="${f(R(2, 6))}" fill="${r() < 0.5 ? '#a07bff' : accent}" opacity="${f(R(0.2, 0.55))}"/>`);
  }

  // Power Up sigil, character aura, shifted-form flames.
  const cx = 200, cy = 158;
  if (card.type === 'powerup') {
    const n = 5 + Math.floor(R(0, 4));
    back.push(`<circle cx="${cx}" cy="${cy}" r="92" fill="none" stroke="#c9ffe0" stroke-width="3" opacity="0.55"/>`);
    back.push(`<polygon points="${Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2; return f(cx + Math.cos(a) * 92) + ',' + f(cy + Math.sin(a) * 92); }).join(' ')}" fill="none" stroke="#c9ffe0" stroke-width="2" opacity="0.45"/>`);
  }
  defs.push(`<radialGradient id="halo"><stop offset="0" stop-color="${card.type === 'character' ? '#fff3c4' : mix(accent, '#ffffff', 0.5)}" stop-opacity="0.85"/><stop offset="0.55" stop-color="${accent}" stop-opacity="0.35"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`);
  back.push(`<circle cx="${cx}" cy="${cy}" r="${shifted ? 125 : 105}" fill="url(#halo)"/>`);
  if (card.type === 'character') back.push(`<circle cx="${cx}" cy="${cy}" r="86" fill="none" stroke="#f1cf72" stroke-width="3" stroke-dasharray="${shifted ? '2 6' : '14 8'}" opacity="0.8"/>`);
  if (shifted) for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const r1 = 92, r2 = R(118, 150); back.push(`<line x1="${f(cx + Math.cos(a) * r1)}" y1="${f(cy + Math.sin(a) * r1)}" x2="${f(cx + Math.cos(a) * r2)}" y2="${f(cy + Math.sin(a) * r2)}" stroke="${nightmare ? '#ff4d4d' : accent2}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`); }

  defs.push(`<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>`);
  defs.push(`<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>`);
  defs.push(`<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.65"/></filter>`);
  const tilt = f(R(-8, 8));
  const subject = `<text x="${cx}" y="${cy + 52}" font-size="150" text-anchor="middle" filter="url(#sh)" transform="rotate(${tilt} ${cx} ${cy})" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji','Twemoji Mozilla',sans-serif">${card.art}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs.join('')}</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>${back.join('')}${subject}${fore.join('')}<rect width="${W}" height="${H}" fill="url(#vig)"/></svg>`;
}

let n = 0;
for (const card of C.CARDS) { fs.writeFileSync(path.join(OUT, card.id + '.svg'), scene(card)); n++; }
console.log('Wrote ' + n + ' card illustrations to ' + path.relative(process.cwd(), OUT));
