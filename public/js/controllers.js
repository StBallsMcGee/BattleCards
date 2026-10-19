/*
 * Battle Cards — controllers connect the UI to a game.
 *   LocalController  — runs the engine in the browser; seat 1 is a bot (or the tutorial script).
 *   RemoteController — talks to server.js; the server runs the engine for both players.
 */
(function () {
  'use strict';
  const E = window.BCEngine, Bots = window.BCBots, UI = window.BCUI;

  class LocalController {
    /**
     * cfg: { decks: [ids0, ids1], names, level: 'easy'|'medium'|'hard', seed?, stacked?, rigged?,
     *        decideOpponent?: fn(view, choice) — overrides the bot (tutorial), hooks?, oppAvatar? }
     */
    constructor(cfg) {
      this.cfg = cfg;
      this.timer = null;
      this.closed = false;
    }
    start() {
      const c = this.cfg;
      this.game = new E.Game({ decks: c.decks, names: c.names, seed: c.seed, stacked: c.stacked, rigged: c.rigged });
      UI.start(this, { me: 0, hooks: c.hooks, oppAvatar: c.oppAvatar });
      this.flush();
    }
    flush() {
      const steps = this.game.takeSteps().map(s => ({ ev: s.ev, view: E.viewFor(s.snap, 0) }));
      if (steps.length) UI.enqueue(steps);
    }
    submit(answer) {
      const err = this.game.submit(0, answer);
      if (err) { UI.toast(err, 'error'); UI.reprompt(); return; }
      this.flush();
    }
    onIdle() {
      if (this.closed || this.timer) return;
      const p = this.game.pending;
      if (!p || p.player !== 1) return;
      const delay = p.kind === 'main' ? 650 : p.kind === 'setup' ? 900 : 450;
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.closed || !this.game.pending || this.game.pending.player !== 1) return;
        const v = E.viewFor(this.game.state, 1);
        const decide = this.cfg.decideOpponent || ((view, choice) => Bots.decide(this.cfg.level, view, choice));
        let ans = decide(v, v.pending);
        let err = this.game.submit(1, ans);
        if (err) {
          console.warn('Opponent answer rejected:', err, ans);
          ans = Bots.decide('easy', v, v.pending);
          err = this.game.submit(1, ans);
          if (err && v.pending.kind === 'main') this.game.submit(1, { type: 'endPhase' });
        }
        this.flush();
      }, delay / (UI.settings.speed > 1 ? UI.settings.speed : 1));
    }
    rematch() {
      this.close();
      const next = new LocalController(Object.assign({}, this.cfg, { seed: undefined }));
      next.start();
    }
    close() {
      this.closed = true;
      clearTimeout(this.timer);
    }
  }

  class RemoteController {
    constructor(cfg) { this.cfg = cfg; } // { room, token, seat }
    start() {
      UI.start(this, { me: this.cfg.seat, oppAvatar: '🧑' });
      this.connect();
    }
    connect() {
      const { room, token } = this.cfg;
      this.es = new EventSource('api/rooms/' + room + '/stream?token=' + encodeURIComponent(token));
      this.es.addEventListener('steps', e => UI.enqueue(JSON.parse(e.data).steps));
      this.es.addEventListener('notice', e => UI.toast(JSON.parse(e.data).text));
      this.es.addEventListener('history', e => UI.setLog(JSON.parse(e.data).events));
      this.es.onerror = () => { if (!this.closed) UI.toast('Connection lost — reconnecting…', 'error'); };
    }
    async submit(answer) {
      try {
        const r = await fetch('api/rooms/' + this.cfg.room + '/answer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: this.cfg.token, answer }),
        });
        const j = await r.json();
        if (j.error) { UI.toast(j.error, 'error'); UI.reprompt(); }
      } catch (e) {
        UI.toast('Could not reach the server.', 'error');
        UI.reprompt();
      }
    }
    close() {
      this.closed = true;
      if (this.es) this.es.close();
      fetch('api/rooms/' + this.cfg.room + '/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: this.cfg.token }) }).catch(() => {});
    }
  }

  window.BCControllers = { LocalController, RemoteController };
})();
