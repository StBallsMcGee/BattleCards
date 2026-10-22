/*
 * Battle Cards — online play without a server.
 *
 * The two browsers connect directly to each other over WebRTC (via PeerJS). PeerJS's free public
 * broker only introduces them; the game itself goes straight from one browser to the other.
 *
 * The player who creates the room is the host: their browser runs the engine, exactly like
 * server.js does, and sends the guest only the guest's redacted view. The guest sends back answers.
 *   host  → guest: { t: 'welcome', resume? } · { t: 'steps', steps } · { t: 'history', events }
 *                  { t: 'error', text } · { t: 'rematch' } · { t: 'leave' } · { t: 'full' }
 *   guest → host:  { t: 'hello', name, deck, token } · { t: 'answer', answer } · { t: 'rematch' } · { t: 'leave' }
 */
(function () {
  'use strict';
  const E = window.BCEngine, C = window.BCCards, UI = window.BCUI;

  const PREFIX = 'battlecards-v1-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // STUN finds each player's public address; the TURN relay is a fallback for networks that block direct connections.
  const ICE = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
        username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  };
  const CONNECT_TIMEOUT = 20000;

  const available = () => !!(window.Peer && window.RTCPeerConnection);
  const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  const newToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const cleanName = n => String(n || 'Gladiator').replace(/[<>]/g, '').trim().slice(0, 20) || 'Gladiator';
  // window.BCPeerServer can point at your own PeerJS server ({ host, port, path, secure }); otherwise PeerJS's free cloud broker is used.
  const newPeer = id => new window.Peer(id, Object.assign({ config: ICE, debug: 0 }, window.BCPeerServer || {}));

  function explain(err) {
    const type = err && err.type;
    if (type === 'peer-unavailable') return 'No room with that code. Check the code, and make sure your friend is still on the Create Room screen.';
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') return 'Could not reach the matchmaking service. Check your internet connection and try again.';
    if (type === 'browser-incompatible') return 'This browser does not support direct connections. Try Chrome, Safari, Firefox or Edge.';
    return 'Connection problem: ' + ((err && err.message) || err);
  }

  // ───────────────────────── host ─────────────────────────

  class PeerHostController {
    /** cfg: { peer, code, names: [host, guest], decks: [host, guest], guestToken } */
    constructor(cfg) {
      this.cfg = cfg;
      this.conn = null;
      this.closed = false;
      this.log = [];
    }
    attach(conn, resume) {
      this.conn = conn;
      conn.on('data', m => this.onData(m));
      conn.on('close', () => { if (!this.closed && this.conn === conn) UI.toast(this.cfg.names[1] + ' disconnected — waiting for them to reconnect…', 'error'); });
      this.send({ t: 'welcome', resume: !!resume, names: this.cfg.names });
      if (resume && this.game) {
        this.send({ t: 'history', events: this.log });
        this.send({ t: 'steps', steps: [{ ev: { type: 'sync' }, view: E.viewFor(this.game.state, 1) }] });
        UI.toast(this.cfg.names[1] + ' is back.');
      }
    }
    start() {
      this.game = new E.Game({ decks: this.cfg.decks, names: this.cfg.names });
      this.log = [];
      UI.start(this, { me: 0, oppAvatar: '🧑' });
      this.flush();
    }
    send(m) { if (this.conn && this.conn.open) this.conn.send(m); }
    flush() {
      const steps = this.game.takeSteps();
      if (!steps.length) return;
      for (const s of steps) if (s.ev.text) this.log.push(s.ev);
      if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
      UI.enqueue(steps.map(s => ({ ev: s.ev, view: E.viewFor(s.snap, 0) })));
      this.send({ t: 'steps', steps: steps.map(s => ({ ev: s.ev, view: E.viewFor(s.snap, 1) })) });
    }
    submit(answer) {
      const err = this.game.submit(0, answer);
      if (err) { UI.toast(err, 'error'); UI.reprompt(); return; }
      this.flush();
    }
    onData(m) {
      if (this.closed || !m) return;
      if (m.t === 'answer') {
        const err = this.game.submit(1, m.answer);
        if (err) this.send({ t: 'error', text: err });
        else this.flush();
      } else if (m.t === 'rematch') {
        this.rematch();
      } else if (m.t === 'leave') {
        UI.toast(this.cfg.names[1] + ' left the game.', 'error');
      }
    }
    rematch() {
      this.send({ t: 'rematch' });
      this.start();
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.send({ t: 'leave' });
      setTimeout(() => this.cfg.peer.destroy(), 500);
    }
  }

  /**
   * Opens a room and waits for a friend. Calls onCode(code) once the room exists and onStart() when the
   * game begins. Returns { cancel } for leaving the lobby.
   */
  function host({ name, deck, onCode, onError, onStart }) {
    let peer = null, ctl = null, cancelled = false, tries = 0;
    const open = () => {
      const code = newCode();
      peer = newPeer(PREFIX + code);
      peer.on('open', () => { if (!cancelled) onCode(code); });
      peer.on('error', err => {
        if (err.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); open(); return; } // code already taken
        if (ctl && err.type === 'peer-unavailable') return;
        if (!cancelled) onError(explain(err));
      });
      // Keep the room reachable if the connection to the broker drops mid-game.
      peer.on('disconnected', () => { if (!cancelled && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* ignore */ } }, 1500); });
      peer.on('connection', conn => {
        conn.on('data', m => {
          if (!m || m.t !== 'hello' || conn._bcHello) return;
          conn._bcHello = true;
          if (ctl) { // a game is already running: only the same guest may come back
            if (m.token === ctl.cfg.guestToken) ctl.attach(conn, true);
            else { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }
            return;
          }
          const problems = C.validateDeck(m.deck);
          if (problems.length) { conn.send({ t: 'error', text: 'Illegal deck: ' + problems[0] }); return; }
          let guestName = cleanName(m.name);
          if (guestName === name) guestName += ' II';
          ctl = new PeerHostController({ peer, code, names: [name, guestName], decks: [deck, m.deck], guestToken: m.token });
          ctl.attach(conn, false);
          onStart();
          ctl.start();
        });
      });
    };
    open();
    return { cancel() { cancelled = true; if (!ctl && peer) peer.destroy(); } };
  }

  // ───────────────────────── guest ─────────────────────────

  class PeerGuestController {
    constructor(cfg) { // { peer, code, name, deck, token }
      this.cfg = cfg;
      this.conn = null;
      this.closed = false;
      this.started = false;
    }
    attach(conn) {
      this.conn = conn;
      conn.on('data', m => this.onData(m));
      conn.on('close', () => {
        if (this.closed || this.conn !== conn) return;
        UI.toast('Connection lost — reconnecting…', 'error');
        setTimeout(() => this.reconnect(), 1500);
      });
    }
    reconnect(attempt) {
      if (this.closed) return;
      attempt = attempt || 1;
      const peer = this.cfg.peer;
      if (peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* ignore */ } }
      const conn = peer.connect(PREFIX + this.cfg.code, { reliable: true });
      const timer = setTimeout(() => { conn.close(); if (attempt < 10) this.reconnect(attempt + 1); else UI.toast('Could not reconnect to the host.', 'error'); }, CONNECT_TIMEOUT);
      conn.on('open', () => {
        clearTimeout(timer);
        this.attach(conn);
        conn.send({ t: 'hello', name: this.cfg.name, deck: this.cfg.deck, token: this.cfg.token });
      });
    }
    start() {
      this.started = true;
      UI.start(this, { me: 1, oppAvatar: '🧑' });
    }
    onData(m) {
      if (this.closed || !m) return;
      switch (m.t) {
        case 'welcome': if (!m.resume && !this.started) this.start(); else if (m.resume) UI.toast('Reconnected.'); break;
        case 'steps': UI.enqueue(m.steps); break;
        case 'history': UI.setLog(m.events); break;
        case 'error': UI.toast(m.text, 'error'); UI.reprompt(); break;
        case 'rematch': this.start(); break;
        case 'leave': UI.toast('Your opponent left the game.', 'error'); break;
        case 'full': UI.toast('That room already has two players.', 'error'); break;
      }
    }
    submit(answer) {
      if (!this.conn || !this.conn.open) { UI.toast('Not connected to the host — reconnecting…', 'error'); UI.reprompt(); return; }
      this.conn.send({ t: 'answer', answer });
    }
    rematch() { if (this.conn && this.conn.open) this.conn.send({ t: 'rematch' }); }
    close() {
      if (this.closed) return;
      this.closed = true;
      if (this.conn && this.conn.open) this.conn.send({ t: 'leave' });
      setTimeout(() => this.cfg.peer.destroy(), 500);
    }
  }

  /** Joins a friend's room. Calls onStart() when the game begins. Returns { cancel }. */
  function join({ code, name, deck, onError, onStart }) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const peer = newPeer();
    let cancelled = false, ctl = null;
    const timer = setTimeout(() => { if (!ctl || !ctl.started) { onError('Could not connect to your friend. Check the code, or try another network — some school and office networks block direct connections.'); peer.destroy(); } }, CONNECT_TIMEOUT);
    peer.on('error', err => { if (!cancelled && !(ctl && ctl.started)) { clearTimeout(timer); onError(explain(err)); } });
    peer.on('open', () => {
      if (cancelled) return;
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => {
        ctl = new PeerGuestController({ peer, code, name, deck, token: newToken() });
        const origStart = ctl.start.bind(ctl);
        ctl.start = () => { clearTimeout(timer); onStart(); origStart(); };
        ctl.attach(conn);
        conn.send({ t: 'hello', name, deck, token: ctl.cfg.token });
      });
    });
    return { cancel() { cancelled = true; clearTimeout(timer); if (!(ctl && ctl.started)) peer.destroy(); } };
  }

  window.BCP2P = { available, host, join, PeerHostController, PeerGuestController };
})();
