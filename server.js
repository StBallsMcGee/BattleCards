#!/usr/bin/env node
/*
 * Battle Cards — online multiplayer server (no dependencies).
 *
 *   node server.js            # serves the game on http://localhost:8080
 *   PORT=3000 node server.js
 *
 * The server runs the authoritative rules engine for each match. Clients send
 * answers over POST and receive animated steps over Server-Sent Events, each
 * redacted so a player never sees the opponent's hand or deck.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Cards = require('./public/js/cards.js');
const E = require('./public/js/engine.js');

const PORT = +process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');
const MOBILE = path.join(__dirname, 'mobile'); // phone version, served at /mobile/
const ROOM_TTL = 3 * 60 * 60 * 1000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

/** rooms: code -> { code, players: [{ name, deck, token, streams: Set }], game, touched } */
const rooms = new Map();

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const newToken = () => crypto.randomBytes(16).toString('hex');
const cleanName = n => String(n || 'Gladiator').replace(/[<>]/g, '').trim().slice(0, 20) || 'Gladiator';

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 100000) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function seatOf(room, token) { return room.players.findIndex(p => p.token === token); }

function push(room, seat, event, payload) {
  const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n';
  for (const res of room.players[seat].streams) res.write(msg);
}

/** Sends new engine steps to both players, each with their own redacted view. */
function flush(room) {
  const steps = room.game.takeSteps();
  if (!steps.length) return;
  for (const s of steps) if (s.ev.text) room.log.push(s.ev);
  if (room.log.length > 400) room.log.splice(0, room.log.length - 400);
  for (let seat = 0; seat < room.players.length; seat++) {
    push(room, seat, 'steps', { steps: steps.map(s => ({ ev: s.ev, view: E.viewFor(s.snap, seat) })) });
  }
}

function startGame(room) {
  room.game = new E.Game({ decks: room.players.map(p => p.deck), names: room.players.map(p => p.name) });
  flush(room);
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  if (parts[1] === 'ping') return send(res, 200, { ok: true });

  if (parts[1] === 'rooms' && parts.length === 2 && req.method === 'POST') {
    const body = await readBody(req);
    const problems = Cards.validateDeck(body.deck);
    if (problems.length) return send(res, 400, { error: 'Illegal deck: ' + problems[0] });
    const code = newCode();
    const token = newToken();
    rooms.set(code, { code, players: [{ name: cleanName(body.name), deck: body.deck, token, streams: new Set() }], game: null, log: [], touched: Date.now() });
    return send(res, 200, { room: code, token, seat: 0 });
  }

  const room = rooms.get((parts[2] || '').toUpperCase());
  if (!room) return send(res, 404, { error: 'Room not found. Check the code.' });
  room.touched = Date.now();
  const action = parts[3];

  if (action === 'join' && req.method === 'POST') {
    const body = await readBody(req);
    if (room.players.length >= 2) return send(res, 409, { error: 'That room is full.' });
    const problems = Cards.validateDeck(body.deck);
    if (problems.length) return send(res, 400, { error: 'Illegal deck: ' + problems[0] });
    const token = newToken();
    let name = cleanName(body.name);
    if (name === room.players[0].name) name += ' II';
    room.players.push({ name, deck: body.deck, token, streams: new Set() });
    startGame(room);
    return send(res, 200, { room: room.code, token, seat: 1 });
  }

  const token = url.searchParams.get('token') || (req.method === 'POST' ? null : '');
  if (action === 'status') {
    const seat = seatOf(room, token);
    if (seat < 0) return send(res, 403, { error: 'Not a player in this room.' });
    return send(res, 200, { started: !!room.game, players: room.players.map(p => p.name) });
  }

  if (action === 'stream') {
    const seat = seatOf(room, token);
    if (seat < 0) return send(res, 403, { error: 'Not a player in this room.' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    const P = room.players[seat];
    P.streams.add(res);
    // Bring a (re)connecting client up to date.
    if (room.game) {
      res.write('event: history\ndata: ' + JSON.stringify({ events: room.log }) + '\n\n');
      const view = E.viewFor(room.game.state, seat);
      res.write('event: steps\ndata: ' + JSON.stringify({ steps: [{ ev: { type: 'sync' }, view }] }) + '\n\n');
    }
    const other = room.players[1 - seat];
    if (other) push(room, 1 - seat, 'notice', { text: P.name + ' is connected.' });
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); P.streams.delete(res); });
    return;
  }

  if (action === 'answer' && req.method === 'POST') {
    const body = await readBody(req);
    const seat = seatOf(room, body.token);
    if (seat < 0) return send(res, 403, { error: 'Not a player in this room.' });
    if (!room.game) return send(res, 409, { error: 'The game has not started.' });
    const err = room.game.submit(seat, body.answer);
    if (err) return send(res, 200, { error: err });
    flush(room);
    return send(res, 200, { ok: true });
  }

  if (action === 'leave' && req.method === 'POST') {
    const body = await readBody(req);
    const seat = seatOf(room, body.token);
    if (seat < 0) return send(res, 403, { error: 'Not a player in this room.' });
    if (room.game && room.game.state.winner == null) {
      room.game.concede(seat);
      flush(room);
    } else if (!room.game) rooms.delete(room.code);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Unknown endpoint.' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  // /mobile/… is the phone version; it loads the shared game files from /public/…, which is the same as /…
  let root = PUBLIC;
  if (p === '/mobile') { res.writeHead(301, { Location: '/mobile/' }); return res.end(); }
  if (p.startsWith('/mobile/')) { root = MOBILE; p = p.slice('/mobile'.length); }
  else if (p.startsWith('/public/')) p = p.slice('/public'.length);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/mobile/api/')) url.pathname = url.pathname.slice('/mobile'.length); // the phone page calls api/ relative to /mobile/
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch(e => { console.error(e); if (!res.headersSent) send(res, 400, { error: 'Bad request.' }); });
  } else serveStatic(req, res, url);
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.touched > ROOM_TTL) rooms.delete(code);
}, 10 * 60 * 1000).unref();

/** Addresses other devices on the same network can use to reach this computer. */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(require('os').networkInterfaces())) {
    for (const a of list || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
  }
  return out;
}

if (require.main === module) {
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error('Port ' + PORT + ' is already in use — Battle Cards may already be running (check your other windows).\n' +
        'To use a different port: PORT=8081 node server.js   (Windows: set PORT=8081 && node server.js)');
    } else console.error('Could not start the server:', e.message);
    process.exit(1);
  });
  server.listen(PORT, () => {
    const lan = lanAddresses();
    console.log('Battle Cards server is running.\n');
    console.log('  On this computer:      http://localhost:' + PORT + '   (phone layout: /mobile/)');
    for (const ip of lan) console.log('  Same Wi-Fi / network:  http://' + ip + ':' + PORT);
    console.log('\nFriends on the same Wi-Fi can open the second address. If it does not load, allow Node.js through your firewall.');
    console.log('Friends elsewhere: you don\'t need this server. Use Play Online → Create Room on the GitHub Pages site or the downloaded file.');
  });
}
module.exports = { server, rooms };
