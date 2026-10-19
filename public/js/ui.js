/*
 * Battle Cards — game board UI.
 *
 * The UI never changes game state itself. It renders views it receives from a
 * controller as a queue of animated steps, and turns clicks / drags into
 * actions which it hands back to the controller (local engine or server).
 */
(function () {
  'use strict';
  const C = window.BCCards, E = window.BCEngine, R = window.BCRender, S = window.BCSound;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const def = c => C.byId[c.id];
  const esc = R.esc;

  // Layout constants (stage is 1600 × 900).
  const CX = 790;
  const ACTIVE_X = [CX - 100, CX + 100], READY_X = [CX - 200, CX, CX + 200];
  const AW = 136, AH = 190, RW = 92, RH = 130, HW = 130;

  const WAIT = {
    roll: 950, damage: 520, attack: 420, favour: 1000, defeated: 650, die: 350, turn: 1100, phase: 280, status: 650,
    tokens: 380, play: 420, move: 420, shift: 650, powerup: 1100, draw: 320, reveal: 900, log: 260, declare: 320,
    pay: 160, negate: 450, boost: 380, parry: 550, heal: 420, untap: 200, rolloff: 1300, mulligan: 1800,
    setupDone: 300, start: 500, ability: 320, discard: 350, undeclare: 150, gameover: 200, pending: 0,
  };

  const UI = {
    ctl: null, me: 0, view: null, queue: [], busy: false, sel: null, setup: null, opts: {},
    hooks: {}, settings: null, lastPendingKey: null,
  };

  // ───────────────────────── settings ─────────────────────────
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('bc.settings') || '{}'); } catch (e) { /* storage unavailable */ }
    UI.settings = Object.assign({ name: 'Player', speed: 1, manualPay: false, askRoll: true, sound: true }, s);
    S.setEnabled(UI.settings.sound);
    return UI.settings;
  }
  function saveSettings() {
    try { localStorage.setItem('bc.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ }
    S.setEnabled(UI.settings.sound);
  }
  loadSettings();

  const wait = ms => new Promise(r => setTimeout(r, ms / (UI.settings.speed || 1)));

  // ───────────────────────── stage scaling ─────────────────────────
  function fit() {
    const st = $('#stage');
    const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    UI.scale = s;
    st.style.transform = 'scale(' + s + ')';
    st.style.left = Math.max(0, (window.innerWidth - 1600 * s) / 2) + 'px';
    st.style.top = Math.max(0, (window.innerHeight - 900 * s) / 2) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();
  // The stage must never scroll (focus or scrollIntoView can otherwise shift it).
  for (const el of [$('#stage'), $('#viewport')]) el.addEventListener('scroll', () => { el.scrollTop = 0; el.scrollLeft = 0; });
  function stageRect(el) {
    const r = el.getBoundingClientRect(), sr = $('#stage').getBoundingClientRect();
    const s = UI.scale;
    return { x: (r.left - sr.left) / s, y: (r.top - sr.top) / s, w: r.width / s, h: r.height / s,
      cx: (r.left - sr.left + r.width / 2) / s, cy: (r.top - sr.top + r.height / 2) / s };
  }
  function stagePoint(e) {
    const sr = $('#stage').getBoundingClientRect();
    return { x: (e.clientX - sr.left) / UI.scale, y: (e.clientY - sr.top) / UI.scale };
  }

  // ───────────────────────── toasts & modals ─────────────────────────
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('#toast-layer').appendChild(el);
    if (kind === 'error') S.play('error');
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }
  function modal(html, opts) {
    const layer = $('#modal-layer');
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal ' + ((opts && opts.cls) || '') + '">' + html + '</div>';
    layer.appendChild(wrap);
    const close = () => wrap.remove();
    if (!opts || !opts.sticky) wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); });
    return { el: wrap.firstChild, close };
  }

  /** In-page replacement for confirm(): resolves true or false. */
  function askConfirm(message, yesLabel) {
    return new Promise(resolve => {
      const m = modal('<p style="max-width:440px;line-height:1.5">' + esc(message) + '</p><div class="row" style="justify-content:flex-end">' +
        '<button class="btn" data-no>Cancel</button><button class="btn gold" data-yes>' + esc(yesLabel || 'OK') + '</button></div>', { sticky: true });
      $('[data-yes]', m.el).onclick = () => { m.close(); resolve(true); };
      $('[data-no]', m.el).onclick = () => { m.close(); resolve(false); };
    });
  }

  // ───────────────────────── board skeleton ─────────────────────────
  function buildBoard() {
    const slots = (who, zone, xs, w, h, top) => xs.map((x, i) =>
      '<div class="slot ' + zone + '" data-owner="' + who + '" data-zone="' + zone + '" data-index="' + i + '" style="left:' + (x - w / 2) + 'px;top:' + top + 'px;width:' + w + 'px;height:' + h + 'px"><span class="slot-label">' + (zone === 'active' ? 'Active' : 'Ready') + '</span></div>').join('');
    $('#board').innerHTML =
      '<div class="arena-floor"></div><div class="arena-ring"></div>' +
      '<div id="opp-hand" class="hand opp"></div>' +
      '<div id="opp-info" class="pinfo opp"></div>' +
      '<div id="opp-support" class="support opp"><div class="zlabel">Opponent Support</div><div class="stiles"></div></div>' +
      slots('opp', 'ready', READY_X, RW, RH, 34) + slots('opp', 'active', ACTIVE_X, AW, AH, 178) +
      '<div id="center-band"></div>' +
      slots('me', 'active', ACTIVE_X, AW, AH, 446) + slots('me', 'ready', READY_X, RW, RH, 650) +
      '<div id="me-support" class="support me"><div class="zlabel">Your Support Zone <span class="hint">— energy</span></div><div class="stiles"></div></div>' +
      '<div id="me-info" class="pinfo me"></div>' +
      '<div id="me-hand" class="hand me"></div>' +
      '<div id="side"><div id="phase-tracker"></div><div id="log"></div><div id="side-actions"><button id="main-btn" class="btn big gold">…</button></div></div>' +
      '<svg id="arrows" width="1600" height="900"><defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs></svg>' +
      '<div id="fx-layer"></div><div id="prompt" class="hidden"></div><div id="popmenu" class="hidden"></div>' +
      '<div id="preview" class="hidden"></div>' +
      '<button id="btn-menu" class="btn subtle small" title="Menu">☰</button>' +
      '<div id="thinking" class="hidden">Opponent is thinking…</div>' +
      '<div id="coach" class="hidden"></div>';

    $('#main-btn').addEventListener('click', onMainButton);
    $('#btn-menu').addEventListener('click', openGameMenu);
    const board = $('#board');
    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointerover', onHover);
    board.addEventListener('pointerout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-card-id]')) hidePreview(); });
    board.addEventListener('contextmenu', e => { e.preventDefault(); cancelSelection(); });
  }

  // ───────────────────────── rendering ─────────────────────────
  function rel(p) { return p === UI.me ? 'me' : 'opp'; }

  function render(view) {
    UI.view = view;
    const before = captureRects();
    const me = view.players[UI.me], opp = view.players[1 - UI.me];

    renderInfo('#opp-info', opp, 1 - UI.me, view);
    renderInfo('#me-info', me, UI.me, view);
    renderSupport('#opp-support', opp);
    renderSupport('#me-support', me);

    // Arena slots
    for (const [who, P, pi] of [['me', me, UI.me], ['opp', opp, 1 - UI.me]]) {
      for (const zone of ['active', 'ready']) {
        P[zone].forEach((u, i) => {
          const slot = $('.slot[data-owner="' + who + '"][data-zone="' + zone + '"][data-index="' + i + '"]');
          $$('.card', slot).forEach(x => x.remove());
          let unit = u;
          if (!unit && UI.setup && who === 'me') {
            const pl = UI.setup.find(x => x.zone === zone && x.index === i);
            if (pl) unit = { uid: pl.uid, id: pl.id, owner: pi, damage: 0, tokens: {}, statuses: [], attachments: [], stack: [], defeated: false, placed: true };
          }
          if (unit) {
            const html = zone === 'active' ? R.card(unit.id, { uid: unit.uid, w: AW, unit: unit.placed ? null : unit, cls: 'unit' })
              : R.compact(unit.id, { uid: unit.uid, w: RW, unit: unit.placed ? null : unit, cls: 'unit' });
            slot.insertAdjacentHTML('beforeend', html);
            const el = slot.lastElementChild;
            el.dataset.flip = unit.uid;
            if (unit.placed) el.classList.add('placed');
          }
        });
      }
      // Face-down setup placements of the opponent
      if (who === 'opp' && P.setup) {
        // Shown only as a count in the info panel; nothing on the board yet.
      }
    }

    renderHand('#opp-hand', opp, false);
    renderHand('#me-hand', me, true);
    renderSide(view);
    renderCenter(view);
    renderArrows(view);
    applyHints(view);
    flip(before);
    if (UI.hooks.afterRender) UI.hooks.afterRender(view);
  }

  function renderInfo(sel, P, p, view) {
    const top = P.grave[P.grave.length - 1];
    const isActive = view.active === p && view.phase !== 'setup';
    $(sel).innerHTML =
      '<div class="pi-row"><div class="pi-avatar">' + (p === UI.me ? '🛡' : (UI.opts.oppAvatar || '👹')) + '</div>' +
      '<div class="pi-name">' + esc(P.name) + (isActive ? ' <span class="pi-turn">● turn</span>' : '') + '</div></div>' +
      '<div class="favour" title="Favour — reach 10 to win. Click for the history.">' + favourDial(P.favour) + '</div>' +
      '<div class="pi-piles">' +
      '<div class="pile deck" data-pile="deck" data-owner="' + rel(p) + '" title="Deck">' + R.back({ w: 46 }) + '<b>' + P.deckCount + '</b></div>' +
      '<div class="pile grave" data-pile="grave" data-owner="' + rel(p) + '" title="Graveyard — click to view">' +
      (top ? R.compact(top.id, { w: 46, cls: 'grave-top' }).replace('class="card', 'data-flip="' + top.uid + '" class="card') : '<div class="empty-pile">✝</div>') + '<b>' + P.grave.length + '</b></div>' +
      '<div class="pile handc" title="Cards in hand">🂠<b>' + P.handCount + '</b></div>' +
      '</div>';
  }

  function favourDial(n) {
    let s = '<div class="fav-label">FAVOUR</div><div class="fav-pips">';
    for (let i = 1; i <= 10; i++) s += '<span class="fav-pip' + (i <= n ? ' on' : '') + '"></span>';
    return s + '</div><div class="fav-num">' + n + '<small>/10</small></div>';
  }

  function renderSupport(sel, P) {
    const box = $(sel + ' .stiles');
    const untapped = P.support.filter(s => !s.tapped);
    const counts = { M: 0, A: 0, T: 0, S: 0 };
    let dual = 0;
    for (const s of untapped) { const e = def(s).energy; if (e.length === 1) counts[e[0]]++; else dual++; }
    box.innerHTML = P.support.map(s => R.supportTile(s).replace('class="stile', 'data-flip="' + s.uid + '" class="stile')).join('');
    const sum = Object.keys(counts).filter(t => counts[t]).map(t => R.pip(t) + counts[t]).join(' ') + (dual ? ' <span class="dual">+' + dual + ' dual</span>' : '');
    $(sel + ' .zlabel').innerHTML = (sel === '#me-support' ? 'Your Support Zone' : 'Opponent Support') +
      ' <span class="energy-sum">' + untapped.length + '/' + P.support.length + ' ready ' + (sum ? '· ' + sum : '') + '</span>';
  }

  function renderHand(sel, P, mine) {
    const box = $(sel);
    let cards = P.hand;
    if (mine && UI.setup) cards = cards.filter(c => !UI.setup.some(x => x.uid === c.uid));
    const n = cards.length;
    const w = mine ? HW : 70;
    const spread = mine ? Math.min(112, 760 / Math.max(1, n)) : Math.min(46, 400 / Math.max(1, n));
    box.innerHTML = cards.map((c, i) => {
      const off = i - (n - 1) / 2;
      const x = CX + off * spread - w / 2;
      const rot = off * (mine ? 2.6 : -2.6);
      const y = mine ? 790 + Math.abs(off) * Math.abs(off) * 1.6 : -66 - Math.abs(off) * Math.abs(off) * 1.2;
      const inner = mine && !c.hidden ? R.card(c.id, { uid: c.uid, w: HW, cls: 'in-hand' }) : R.back({ uid: c.uid, w: 70 });
      return '<div class="hand-card" data-flip="' + c.uid + '" data-hand-uid="' + c.uid + '" style="left:' + x + 'px;top:' + y + 'px;transform:rotate(' + rot + 'deg);z-index:' + (10 + i) + '">' + inner + '</div>';
    }).join('');
  }

  function renderSide(view) {
    const phases = [['arming', 'Arming', '🛠'], ['fighting', 'Fighting', '⚔'], ['resolving', 'Resolving', '⚖']];
    const myTurn = view.active === UI.me;
    let html = '<div class="turn-label ' + (myTurn ? 'mine' : 'theirs') + '">' +
      (view.phase === 'setup' ? 'Setup' : view.phase === 'gameover' ? 'Game over' : (myTurn ? 'Your turn' : esc(view.players[view.active].name) + "'s turn") +
        ' <small>· Turn ' + view.turn + '</small>') + '</div><div class="phases">';
    for (const [k, label, ic] of phases) html += '<div class="ph' + (view.phase === k ? ' on' : '') + '">' + ic + ' ' + label + '</div>';
    html += '</div>';
    const P = view.players[view.active];
    if (view.phase !== 'setup' && view.phase !== 'gameover' && myTurn) {
      html += '<div class="turn-limits">' +
        '<span class="' + (P.playedUnit ? 'used' : '') + '" title="One unit to the Ready Zone per turn">Ready play</span>' +
        '<span class="' + (P.playedSupport ? 'used' : '') + '" title="One card to the Support Zone per turn">Energy play</span>' +
        '<span class="' + (P.playedPowerUp ? 'used' : '') + '" title="One Power Up per turn">Power Up</span></div>';
    }
    $('#phase-tracker').innerHTML = html;
    updateMainButton();
  }

  function renderCenter(view) {
    const band = $('#center-band');
    if (view.phase === 'fighting' && view.declared && view.declared.length) {
      const mine = view.active === UI.me;
      const canAct = mine && isMyMain();
      band.innerHTML = '<div class="declared">' + view.declared.map((d, i) => {
        const a = E.unitByUid(view, d.attackerUid), t = E.unitByUid(view, d.targetUid);
        const an = a ? def(a).name.split(',')[0] : '?', tn = t ? def(t).name.split(',')[0] : '?';
        const atk = a ? def(a).attacks[d.attackIndex] : null;
        return '<div class="decl' + (d.resolved ? ' done' : '') + '"><span>' + esc(an) + ' <b>' + esc(atk ? atk.name : '') + '</b> → ' + esc(tn) + '</span>' +
          (!d.resolved && canAct ? '<button class="btn tiny gold" data-resolve="' + i + '">▶ Resolve</button>' : '') +
          (!d.resolved && canAct && !view.resolvingStarted ? '<button class="btn tiny" data-undeclare="' + i + '" title="Take back">✕</button>' : '') +
          (d.resolved ? '<span class="tick">✓</span>' : '') + '</div>';
      }).join('') + '</div>';
      $$('[data-resolve]', band).forEach(b => b.onclick = () => send({ type: 'resolve', index: +b.dataset.resolve }));
      $$('[data-undeclare]', band).forEach(b => b.onclick = () => send({ type: 'cancelDeclare', index: +b.dataset.undeclare }));
    } else band.innerHTML = '';
  }

  function unitEl(uid) { return $('#board .slot [data-uid="' + uid + '"]'); }

  function renderArrows(view) {
    const svg = $('#arrows');
    $$('.arrow', svg).forEach(x => x.remove());
    if (view.phase !== 'fighting' || !view.declared) return;
    for (const d of view.declared) {
      if (d.resolved) continue;
      const a = unitEl(d.attackerUid), t = unitEl(d.targetUid);
      if (!a || !t) continue;
      drawArrow(stageRect(a), stageRect(t), view.active === UI.me ? 'mine' : 'theirs');
    }
  }
  function drawArrow(ra, rt, cls) {
    const svg = $('#arrows');
    const x1 = ra.cx, y1 = ra.cy, x2 = rt.cx, y2 = rt.cy + (rt.cy > y1 ? -rt.h / 3 : rt.h / 3);
    const mx = (x1 + x2) / 2 + (x2 - x1) * 0.1, my = (y1 + y2) / 2 - 40;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M' + x1 + ',' + y1 + ' Q' + mx + ',' + my + ' ' + x2 + ',' + y2);
    p.setAttribute('class', 'arrow ' + cls);
    p.setAttribute('marker-end', 'url(#ah)');
    svg.appendChild(p);
    return p;
  }

  // FLIP animation: elements keep their identity across renders through data-flip.
  function captureRects() {
    const m = new Map();
    $$('#board [data-flip]').forEach(el => m.set(el.dataset.flip, stageRect(el)));
    return m;
  }
  function flip(before) {
    const dur = 380 / (UI.settings.speed || 1);
    $$('#board [data-flip]').forEach(el => {
      const uid = el.dataset.flip;
      const now = stageRect(el);
      let from = before.get(uid);
      if (!from) {
        // New element: hand cards come from their deck; everything else fades in.
        const handOwner = el.closest('#me-hand') ? 'me' : el.closest('#opp-hand') ? 'opp' : null;
        if (handOwner) {
          const deck = $('.pile.deck[data-owner="' + handOwner + '"]');
          if (deck) from = stageRect(deck);
        }
        if (!from) { el.animate([{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: dur, easing: 'ease-out' }); return; }
      }
      const dx = from.cx - now.cx, dy = from.cy - now.cy;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const sc = from.w / now.w;
      const base = el.style.transform || '';
      el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ') ' + base }, { transform: base || 'none' }],
        { duration: dur, easing: 'cubic-bezier(.2,.8,.3,1)' });
    });
  }

  // ───────────────────────── hints ─────────────────────────
  function isMyMain() {
    const v = UI.view;
    return v && !UI.busy && v.pending && v.pending.player === UI.me && v.pending.kind === 'main';
  }

  function applyHints(view) {
    $$('#board .can-act').forEach(e => e.classList.remove('can-act'));
    if (!isMyMain()) return;
    for (const el of $$('#me-hand .hand-card')) if (handOptions(el.dataset.handUid).some(o => !o.disabled)) el.classList.add('can-act');
    const P = view.players[UI.me];
    for (const u of E.arenaUnits(P)) {
      if (unitOptions(u.uid).some(o => !o.disabled)) { const el = unitEl(u.uid); if (el) el.classList.add('can-act'); }
    }
    for (const s of P.support) if (supportOptions(s.uid).some(o => !o.disabled)) { const el = $('#me-support [data-uid="' + s.uid + '"]'); if (el) el.classList.add('can-act'); }
  }

  // ───────────────────────── option builders ─────────────────────────
  function legal(a) { return E.validateAction(UI.view, UI.me, a); }
  function slotEl(who, zone, i) { return $('.slot[data-owner="' + who + '"][data-zone="' + zone + '"][data-index="' + i + '"]'); }

  /** Options for a card in my hand: [{label, action?, targets?:[{el, action}], disabled?, reason?}] */
  function handOptions(uid) {
    const v = UI.view, P = v.players[UI.me];
    const c = P.hand.find(x => x.uid === uid);
    if (!c || c.hidden) return [];
    const d = def(c), opts = [];
    if (d.type !== 'powerup') {
      if (v.phase === 'arming') {
        const targets = [0, 1, 2].map(i => ({ el: slotEl('me', 'ready', i), action: { type: 'playReady', cardUid: uid, index: i } })).filter(t => !legal(t.action));
        const err = legal({ type: 'playReady', cardUid: uid, index: E.emptySlots(P.ready)[0] != null ? E.emptySlots(P.ready)[0] : 0 });
        opts.push({ label: '⬆ Play to Ready Zone', targets, disabled: !targets.length, reason: err });
        const sa = { type: 'playSupport', cardUid: uid };
        const se = legal(sa);
        opts.push({ label: '⚡ Play as energy (' + d.energy.map(t => C.TYPE_NAMES[t]).join('/') + ')', action: sa, dropEl: $('#me-support'), disabled: !!se, reason: se });
      }
      if (d.shift) {
        for (const u of E.arenaUnits(P)) {
          const a = { type: 'shift', cardUid: uid, onto: u.uid };
          const e = legal(a);
          if (E.baseName(u) === d.baseName && u.id !== c.id && (v.phase === 'resolving' || !e)) opts.push({ label: '⧉ Shift onto ' + def(u).name, action: a, dropEl: unitEl(u.uid), disabled: !!e, reason: e, cost: d.shift.cost });
        }
      }
    } else {
      const targets = powerUpTargets(c);
      if (d.target === 'none') {
        const a = { type: 'playPowerUp', cardUid: uid, target: null };
        const e = legal(a);
        opts.push({ label: '✨ Use ' + d.name, action: a, disabled: !!e, reason: e });
      } else {
        const ok = targets.filter(t => !legal(t.action));
        const e = ok.length ? null : (P.playedPowerUp ? 'You may only play one Power Up per turn.' : legal(targets[0] ? targets[0].action : { type: 'playPowerUp', cardUid: uid, target: '' }) || 'No valid target.');
        opts.push({ label: '✨ Use ' + d.name + ' (choose target)', targets: ok, disabled: !ok.length, reason: e, graveTargets: ok.some(t => !t.el) });
      }
    }
    return opts;
  }

  function powerUpTargets(c) {
    const v = UI.view, P = v.players[UI.me], O = v.players[1 - UI.me];
    const mk = (el, target) => ({ el, action: { type: 'playPowerUp', cardUid: c.uid, target } });
    const out = [];
    for (const u of E.arenaUnits(P).concat(E.arenaUnits(O))) out.push(mk(unitEl(u.uid), u.uid));
    for (const s2 of P.support) out.push(mk($('#me-support [data-uid="' + s2.uid + '"]'), s2.uid));
    for (const s2 of O.support) out.push(mk($('#opp-support [data-uid="' + s2.uid + '"]'), s2.uid));
    for (const g of P.grave) out.push(mk(null, g.uid));
    return out;
  }

  function unitOptions(uid) {
    const v = UI.view, P = v.players[UI.me];
    const l = E.locate(v, uid);
    if (!l || l.owner !== UI.me) return [];
    const u = l.u, d = def(u), opts = [];
    if (l.zone === 'ready' && (v.phase === 'arming' || v.phase === 'resolving')) {
      const targets = [0, 1].map(i => ({ el: slotEl('me', 'active', i), action: { type: 'moveToActive', unitUid: uid, index: i } })).filter(t => !legal(t.action));
      opts.push({ label: '⬆ Move to Active Zone', targets, disabled: !targets.length, reason: legal({ type: 'moveToActive', unitUid: uid, index: E.emptySlots(P.active)[0] }) });
    }
    if (l.zone === 'active' && v.phase === 'arming') {
      const targets = [0, 1, 2].map(i => ({ el: slotEl('me', 'ready', i), action: { type: 'retreat', unitUid: uid, index: i } })).filter(t => !legal(t.action));
      const e = legal({ type: 'retreat', unitUid: uid });
      opts.push({ label: '⬇ Retreat to Ready', cost: ['*', '*'], targets, disabled: !!e || !targets.length, reason: e });
    }
    if (v.phase === 'arming') {
      d.abilities.forEach((ab, i) => {
        const a = { type: 'ability', unitUid: uid, abilityIndex: i };
        const e = legal(a);
        opts.push({ label: '✧ ' + ab.name, cost: ab.cost, action: a, disabled: !!e, reason: e });
      });
    }
    if (d.transform && v.phase === 'resolving') {
      const a = { type: 'transform', unitUid: uid };
      const e = legal(a);
      opts.push({ label: '⟳ Flip into ' + C.byId[d.transform.into].name, action: a, disabled: !!e, reason: e });
    }
    if (l.zone === 'active' && v.phase === 'fighting') {
      const O = v.players[1 - UI.me];
      d.attacks.forEach((atk, i) => {
        const targets = O.active.filter(Boolean).map(t => ({ el: unitEl(t.uid), action: { type: 'declare', unitUid: uid, attackIndex: i, targetUid: t.uid } })).filter(t => !legal(t.action));
        const first = O.active.find(Boolean);
        const e = first ? legal({ type: 'declare', unitUid: uid, attackIndex: i, targetUid: first.uid }) : 'Your opponent has no Active units.';
        opts.push({ label: atk.name, attack: atk, cost: atk.cost, targets, disabled: !targets.length, reason: targets.length ? null : e });
      });
    }
    return opts;
  }

  function supportOptions(uid) {
    const v = UI.view, P = v.players[UI.me];
    const s = P.support.find(x => x.uid === uid);
    if (!s || !['arming', 'fighting', 'resolving'].includes(v.phase)) return [];
    const d = def(s);
    if (!d.shift) return [];
    const opts = [];
    const targets = [];
    for (const zone of ['active', 'ready']) P[zone].forEach((x, i) => {
      const a = { type: 'shift', cardUid: uid, zone, index: i };
      if (!legal(a)) targets.push({ el: slotEl('me', zone, i), action: a });
    });
    for (const u of E.arenaUnits(P)) {
      const a = { type: 'shift', cardUid: uid, onto: u.uid };
      if (!legal(a)) targets.push({ el: unitEl(u.uid), action: a });
    }
    if (v.phase !== 'resolving' && !targets.length) return [];
    const ontoBase = E.arenaUnits(P).find(u => E.baseName(u) === d.baseName && u.id !== d.id);
    const probe = d.shift.ontoOnly && ontoBase ? legal({ type: 'shift', cardUid: uid, onto: ontoBase.uid })
      : d.shift.ontoOnly ? 'Needs ' + d.baseName + ' in your Arena to Shift onto.'
      : legal({ type: 'shift', cardUid: uid, zone: 'ready', index: E.emptySlots(P.ready)[0] != null ? E.emptySlots(P.ready)[0] : 0 });
    opts.push({ label: '⧉ Shift ' + (d.shift.ontoOnly ? 'onto ' + d.baseName : 'into the Arena'), cost: d.shift.cost, targets, disabled: !targets.length, reason: probe });
    return opts;
  }

  // ───────────────────────── input ─────────────────────────
  let drag = null;

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const t = e.target;
    if (t.closest('#popmenu')) return; // let the menu item's click handler run
    hidePopMenu();
    // Target selection mode
    if (UI.sel) {
      const hit = UI.sel.targets.find(x => x.el && (x.el === t || x.el.contains(t)));
      if (hit) { e.preventDefault(); const sel = UI.sel; cancelSelection(); commit(hit.action, sel.opt); return; }
      if (!t.closest('#prompt')) cancelSelection();
      return;
    }
    if (t.closest('#prompt') || t.closest('#side') || t.closest('#popmenu') || t.closest('#coach')) return;
    const fav = t.closest('.favour');
    if (fav) { showFavourLog(fav.closest('#me-info') ? UI.me : 1 - UI.me); return; }
    const pile = t.closest('.pile.grave');
    if (pile) { showGrave(pile.dataset.owner === 'me' ? UI.me : 1 - UI.me); return; }

    if (UI.setup) { setupPointerDown(e); return; }
    if (!isMyMain()) return;

    const handEl = t.closest('#me-hand .hand-card');
    const myUnit = t.closest('.slot[data-owner="me"] .card');
    const mySup = t.closest('#me-support .stile');
    let opts = null, anchor = null;
    if (handEl) { opts = handOptions(handEl.dataset.handUid); anchor = handEl; }
    else if (myUnit) { opts = unitOptions(myUnit.dataset.uid); anchor = myUnit; }
    else if (mySup) { opts = supportOptions(mySup.dataset.uid); anchor = mySup; }
    if (!opts) return;
    e.preventDefault();
    const start = stagePoint(e);
    drag = { start, anchor, opts, moved: false, ghost: null, pointerId: e.pointerId };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  function dropTargets(opts) {
    const out = [];
    for (const o of opts) {
      if (o.disabled) continue;
      if (o.targets) for (const t of o.targets) if (t.el) out.push({ el: t.el, action: t.action, opt: o });
      if (o.action && o.dropEl) out.push({ el: o.dropEl, action: o.action, opt: o });
    }
    return out;
  }

  function onPointerMove(e) {
    if (!drag) return;
    const p = stagePoint(e);
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 8) {
      drag.targets = dropTargets(drag.opts);
      if (!drag.targets.length) return;
      drag.moved = true;
      hidePreview();
      const g = drag.anchor.cloneNode(true);
      g.classList.add('drag-ghost');
      g.style.transform = 'none';
      $('#fx-layer').appendChild(g);
      drag.ghost = g;
      drag.anchor.classList.add('dragging');
      for (const t of drag.targets) t.el.classList.add('drop-ok');
    }
    if (drag.moved) {
      drag.ghost.style.left = (p.x - 60) + 'px';
      drag.ghost.style.top = (p.y - 80) + 'px';
      for (const t of drag.targets) t.el.classList.toggle('drop-hover', inside(t.el, p));
    }
  }
  function inside(el, p) { const r = stageRect(el); return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

  function onPointerUp(e) {
    window.removeEventListener('pointermove', onPointerMove);
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.moved) {
      const p = stagePoint(e);
      d.ghost.remove();
      d.anchor.classList.remove('dragging');
      $$('.drop-ok').forEach(x => x.classList.remove('drop-ok', 'drop-hover'));
      const hit = d.targets.find(t => inside(t.el, p));
      if (hit) commit(hit.action, hit.opt);
      return;
    }
    showPopMenu(d.anchor, d.opts);
  }

  function showPopMenu(anchor, opts) {
    if (!opts.length) return;
    S.play('click');
    hidePreview();
    UI.menuOpen = true;
    const m = $('#popmenu');
    m.innerHTML = opts.map((o, i) => {
      let extra = '';
      if (o.attack) extra = '<span class="pm-dmg">' + C.damageText(o.attack) + '</span>';
      const cost = o.cost && o.cost.length ? '<span class="pm-cost">' + R.pips(o.cost) + '</span>' : '';
      return '<button class="pm-item' + (o.disabled ? ' disabled' : '') + '" data-i="' + i + '" title="' + esc(o.reason || '') + '">' + cost +
        '<span class="pm-label">' + esc(o.label) + '</span>' + extra + (o.disabled && o.reason ? '<span class="pm-reason">' + esc(o.reason) + '</span>' : '') + '</button>';
    }).join('');
    const r = stageRect(anchor);
    m.classList.remove('hidden');
    const mh = m.offsetHeight, mw = m.offsetWidth;
    let x = r.cx - mw / 2, y = r.y - mh - 8;
    if (y < 10) y = r.y + r.h + 8;
    x = Math.max(340, Math.min(1250 - mw, x));
    y = Math.max(8, Math.min(890 - mh, y));
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    $$('.pm-item', m).forEach(b => b.addEventListener('click', () => {
      const o = opts[+b.dataset.i];
      hidePopMenu();
      if (o.disabled) { if (o.reason) toast(o.reason, 'error'); return; }
      chooseOption(o);
    }));
  }
  function hidePopMenu() { UI.menuOpen = false; if ($('#popmenu')) $('#popmenu').classList.add('hidden'); }

  function chooseOption(o) {
    if (o.action) return commit(o.action, o);
    if (o.graveTargets) return chooseFromGrave(o);
    if (o.targets.length === 1 && o.targets[0].action.type !== 'declare' && o.targets[0].action.type !== 'playPowerUp') return commit(o.targets[0].action, o);
    startSelection(o);
  }

  function startSelection(o) {
    UI.sel = { opt: o, targets: o.targets.filter(t => t.el) };
    for (const t of UI.sel.targets) t.el.classList.add('targetable');
    coachHint('Choose a target — right-click or click elsewhere to cancel.');
  }
  function cancelSelection() {
    if (!UI.sel) return;
    for (const t of UI.sel.targets) t.el && t.el.classList.remove('targetable');
    UI.sel = null;
    coachHint(null);
  }
  function coachHint(text) {
    let h = $('#target-hint');
    if (!text) { if (h) h.remove(); return; }
    if (!h) { h = document.createElement('div'); h.id = 'target-hint'; $('#board').appendChild(h); }
    h.textContent = text;
  }

  function chooseFromGrave(o) {
    const P = UI.view.players[UI.me];
    const ok = o.targets.map(t => t.action.target);
    const m = modal('<h3>Choose a card from your Graveyard</h3><div class="grave-grid">' +
      P.grave.map(g => '<div class="gpick' + (ok.includes(g.uid) ? '' : ' off') + '" data-uid="' + g.uid + '">' + R.compact(g.id, { w: 110 }) + '</div>').join('') + '</div>');
    $$('.gpick', m.el).forEach(x => x.addEventListener('click', () => {
      if (x.classList.contains('off')) return;
      m.close();
      commit(o.targets.find(t => t.action.target === x.dataset.uid).action, o);
    }));
  }

  /** Final step before sending: optional manual payment. */
  function commit(action, opt) {
    const cost = actionCost(action);
    if (cost && cost.length && UI.settings.manualPay) return paymentPanel(action, cost);
    send(action);
  }

  function actionCost(a) {
    const v = UI.view;
    if (a.type === 'declare') return def(E.unitByUid(v, a.unitUid)).attacks[a.attackIndex].cost;
    if (a.type === 'retreat') return ['*', '*'];
    if (a.type === 'ability') return def(E.unitByUid(v, a.unitUid)).abilities[a.abilityIndex].cost;
    if (a.type === 'shift') { const c = v.players[UI.me].hand.concat(v.players[UI.me].support).find(x => x.uid === a.cardUid); return def(c).shift.cost; }
    return null;
  }

  function paymentPanel(action, cost) {
    const v = UI.view;
    const unitUid = action.type === 'declare' ? action.unitUid : null;
    const exclude = action.type === 'shift' && v.players[UI.me].support.some(s => s.uid === action.cardUid) ? action.cardUid : null;
    const sources = E.paymentSources(v, UI.me, unitUid, exclude);
    const auto = E.autoPay(v, UI.me, cost, unitUid, { exclude }) || { support: [], tokens: [] };
    const picked = new Set();
    auto.support.forEach(uid => { const i = sources.findIndex(s => s.kind === 'support' && s.uid === uid); if (i >= 0) picked.add(i); });
    auto.tokens.forEach(t => { const i = sources.findIndex((s, k) => s.kind === 'token' && s.from === t.from && s.type === t.type && !picked.has(k)); if (i >= 0) picked.add(i); });
    const m = modal('<h3>Pay ' + R.pips(cost) + '</h3><p class="muted">Choose which energy sources to use.</p><div class="pay-grid"></div><div class="pay-err"></div>' +
      '<div class="row"><button class="btn gold pay-ok">Confirm</button><button class="btn pay-cancel">Cancel</button></div>', { cls: 'pay-modal' });
    const grid = $('.pay-grid', m.el);
    const draw = () => {
      grid.innerHTML = sources.map((s, i) => {
        const label = s.kind === 'support' ? R.pips(s.types) + ' ' + esc(def(v.players[UI.me].support.find(x => x.uid === s.uid)).name) : R.pip(s.type) + ' token on ' + esc(def(E.unitByUid(v, s.from)).name);
        return '<button class="pay-src' + (picked.has(i) ? ' on' : '') + '" data-i="' + i + '">' + label + '</button>';
      }).join('');
      $$('.pay-src', grid).forEach(b => b.onclick = () => { const i = +b.dataset.i; picked.has(i) ? picked.delete(i) : picked.add(i); draw(); });
      const pay = toPay();
      $('.pay-err', m.el).textContent = E.checkPayment(v, UI.me, cost, unitUid, pay, exclude) || '';
    };
    const toPay = () => {
      const pay = { support: [], tokens: [] };
      for (const i of picked) { const s = sources[i]; if (s.kind === 'support') pay.support.push(s.uid); else pay.tokens.push({ from: s.from, type: s.type }); }
      return pay;
    };
    draw();
    $('.pay-ok', m.el).onclick = () => {
      const pay = toPay();
      const err = E.checkPayment(v, UI.me, cost, unitUid, pay, exclude);
      if (err) return toast(err, 'error');
      m.close();
      send(Object.assign({}, action, { payment: pay }));
    };
    $('.pay-cancel', m.el).onclick = () => m.close();
  }

  function send(answer) {
    if (UI.hooks.filterAnswer) {
      const msg = UI.hooks.filterAnswer(answer, UI.view);
      if (msg) { toast(msg, 'error'); return; }
    }
    hidePrompt();
    cancelSelection();
    UI.ctl.submit(answer);
  }

  function onMainButton() {
    const v = UI.view;
    if (!v || !v.pending || v.pending.player !== UI.me || UI.busy) return;
    if (v.pending.kind === 'main') {
      const P = v.players[UI.me];
      if (v.phase === 'arming' && !UI.hooks.skipConfirm && !P.active.some(Boolean) && P.ready.some(u => u && !u.defeated)) {
        askConfirm('Your Active Zone is empty, and units in the Ready Zone cannot attack. End the Arming phase anyway?', 'End Arming')
          .then(yes => { if (yes) send({ type: 'endPhase' }); });
        return;
      }
      S.play('click');
      send({ type: 'endPhase' });
    }
  }

  function updateMainButton() {
    const b = $('#main-btn');
    if (!b) return;
    const v = UI.view;
    b.disabled = true;
    b.className = 'btn big gold';
    if (!v) return;
    if (v.phase === 'gameover') { b.textContent = 'Game over'; return; }
    if (!v.pending || v.pending.player !== UI.me || v.pending.kind !== 'main' || UI.busy) {
      b.textContent = v.active === UI.me ? 'Waiting…' : "Opponent's turn";
      b.className = 'btn big';
      return;
    }
    b.disabled = false;
    if (v.phase === 'arming') b.textContent = 'To Fighting ⚔';
    else if (v.phase === 'fighting') b.textContent = v.declared.some(d => !d.resolved) ? 'Resolve attacks ▶' : 'To Resolving ⚖';
    else b.textContent = 'End Turn ⏎';
  }

  // ───────────────────────── hover preview ─────────────────────────
  function onHover(e) {
    if ((drag && drag.moved) || UI.menuOpen) return;
    const el = e.target.closest && e.target.closest('[data-card-id]');
    if (!el) return;
    const id = el.dataset.cardId;
    const uid = el.dataset.uid;
    const unit = uid && UI.view ? E.unitByUid(UI.view, uid) : null;
    // Hand cards already enlarge on hover, so their preview goes to the side panel.
    showPreview(id, unit, stageRect(el), !!el.closest('#me-hand'));
  }
  function showPreview(id, unit, r, side) {
    const pv = $('#preview');
    pv.innerHTML = R.card(id, { w: 270, unit }) + '<div class="explain">' + R.explain(id, unit) + '</div>';
    pv.classList.remove('hidden');
    if (side) { pv.style.left = '1290px'; pv.style.top = '20px'; return; }
    const left = r.cx < 800 ? Math.min(1300, r.x + r.w + 16) : Math.max(10, r.x - 290);
    pv.style.left = Math.max(10, Math.min(1320, left)) + 'px';
    pv.style.top = Math.max(8, Math.min(900 - pv.offsetHeight - 8, r.cy - 220)) + 'px';
  }
  function hidePreview() { const pv = $('#preview'); if (pv) pv.classList.add('hidden'); }

  // ───────────────────────── graveyard viewer & game menu ─────────────────────────
  function showGrave(p) {
    const P = UI.view.players[p];
    const m = modal('<h3>' + esc(P.name) + "'s Graveyard (" + P.grave.length + ')</h3><div class="grave-grid">' +
      (P.grave.length ? P.grave.slice().reverse().map(g => R.compact(g.id, { w: 110 })).join('') : '<p class="muted">Empty.</p>') + '</div>');
    $$('[data-card-id]', m.el).forEach(x => x.addEventListener('pointerenter', () => {
      const pv = $('#preview'); showPreview(x.dataset.cardId, null, stageRect(x)); pv.style.zIndex = 300;
    }));
    $$('[data-card-id]', m.el).forEach(x => x.addEventListener('pointerleave', hidePreview));
  }

  function showFavourLog(p) {
    const P = UI.view.players[p];
    const list = (UI.favourLog || [[], []])[p];
    modal('<h3>' + esc(P.name) + ' — Favour ' + P.favour + '/10</h3><div class="fav-history">' +
      (list.length ? list.map(f => '<div>Turn ' + f.turn + ': <b>+' + f.n + '</b> — ' + esc(f.reason) + '</div>').join('') : '<p class="muted">No Favour gained yet.</p>') +
      '</div><p class="muted" style="max-width:420px">Favour comes from: 5+ excess damage to a character · your character killing a character · defeating both enemy Active units in one turn · two characters in your Active Zone at the end of your turn · your Honourable unit dying · a Brutal attack defeating a unit · some card effects.</p>');
  }

  function openGameMenu() {
    const m = modal('<h3>Menu</h3><div class="col-buttons">' +
      '<button class="btn" data-m="rules">📖 Rules reference</button>' +
      '<button class="btn" data-m="speed">⏩ Animation speed: ' + ({ 0.6: 'Slow', 1: 'Normal', 1.8: 'Fast', 4: 'Very fast' }[UI.settings.speed] || 'Normal') + '</button>' +
      '<button class="btn" data-m="pay">💠 Manual payment: ' + (UI.settings.manualPay ? 'On' : 'Off') + '</button>' +
      '<button class="btn danger" data-m="concede">🏳 ' + (UI.view && UI.view.phase === 'gameover' ? 'Leave game' : 'Concede & leave') + '</button>' +
      '<button class="btn" data-m="close">Resume</button></div>');
    $$('[data-m]', m.el).forEach(b => b.onclick = () => {
      const k = b.dataset.m;
      if (k === 'close') return m.close();
      if (k === 'rules') { m.close(); window.BCMain.showRulesModal(); return; }
      if (k === 'speed') { const sp = [0.6, 1, 1.8, 4]; UI.settings.speed = sp[(sp.indexOf(+UI.settings.speed) + 1) % sp.length]; saveSettings(); m.close(); openGameMenu(); return; }
      if (k === 'pay') { UI.settings.manualPay = !UI.settings.manualPay; saveSettings(); m.close(); openGameMenu(); return; }
      if (k === 'concede') { m.close(); UI.leave(); }
    });
  }

  // ───────────────────────── prompts (interrupt decisions) ─────────────────────────
  function hidePrompt() { const p = $('#prompt'); if (p) { p.classList.add('hidden'); p.innerHTML = ''; } }

  function showPrompt(html, cls) {
    const p = $('#prompt');
    p.className = cls || '';
    p.innerHTML = html;
    return p;
  }

  function promptFor(view) {
    const c = view.pending;
    hidePrompt();
    $('#thinking').classList.add('hidden');
    if (!c || view.phase === 'gameover') return;
    if (c.player !== UI.me) {
      const label = c.kind === 'main' ? 'Opponent is thinking…' : c.kind === 'setup' ? 'Opponent is placing units…' : 'Waiting for opponent…';
      $('#thinking').textContent = label;
      $('#thinking').classList.remove('hidden');
      return;
    }
    const unitName = uid => { const u = E.unitByUid(view, uid); return u ? def(u).name : '?'; };
    switch (c.kind) {
      case 'main': return;
      case 'setup': return beginSetup(view);
      case 'firstPlayer': {
        const p = showPrompt('<h3>You won the roll-off!</h3><p>Choose who takes the first turn. The first player skips their first draw.</p>' +
          '<div class="row"><button class="btn gold" data-a="me">Go first</button><button class="btn" data-a="opp">Go second</button></div>');
        $('[data-a="me"]', p).onclick = () => send({ first: UI.me });
        $('[data-a="opp"]', p).onclick = () => send({ first: 1 - UI.me });
        return;
      }
      case 'tokens': return tokenPrompt(view, c, unitName);
      case 'pick': {
        const p = showPrompt('<h3>' + esc(c.prompt || 'Choose a unit') + '</h3><div class="pick-grid">' +
          c.options.map(o => '<button class="btn" data-u="' + o.uid + '">' + esc(o.label) + '</button>').join('') +
          (c.optional ? '<button class="btn subtle" data-u="">No thanks</button>' : '') + '</div>', 'urgent');
        $$('[data-u]', p).forEach(b => {
          b.onclick = () => send({ uid: b.dataset.u || null });
          const el = b.dataset.u && unitEl(b.dataset.u);
          if (el) { b.onmouseenter = () => el.classList.add('targetable'); b.onmouseleave = () => el.classList.remove('targetable'); }
        });
        return;
      }
      case 'option': {
        const p = showPrompt('<h3>' + esc(c.prompt || 'Choose') + '</h3><div class="pick-grid">' +
          c.options.map((o, i) => '<button class="btn" data-i="' + i + '">' + esc(o) + '</button>').join('') + '</div>', 'urgent');
        $$('[data-i]', p).forEach(b => b.onclick = () => send({ index: +b.dataset.i }));
        return;
      }
      case 'reaction': {
        const p = showPrompt('<h3>↩ Reaction!</h3><p>' + esc(unitName(c.attackerUid)) + ' hit ' + esc(unitName(c.targetUid)) + '. React with an attack against ' + esc(unitName(c.attackerUid)) + '?</p>' +
          '<div class="col-buttons">' + c.options.map((o, i) => {
            const u = E.unitByUid(view, o.unitUid), a = def(u).attacks[o.attackIndex];
            return '<button class="btn gold" data-o="' + i + '">' + R.pips(a.cost) + ' ' + esc(o.label) + ' <small>(' + o.kind + ', ' + C.damageText(a) + ' dmg)</small></button>';
          }).join('') + '<button class="btn" data-o="-1">No reaction</button></div>', 'urgent');
        $$('[data-o]', p).forEach(b => b.onclick = () => send({ option: +b.dataset.o }));
        return;
      }
      case 'veteran': {
        const s = view.players[UI.me].support.find(x => x.uid === c.cardUid);
        const p = showPrompt('<h3>🎖 Veteran!</h3><p>Your opponent gained Favour. Move <b>' + esc(def(s).name) + '</b> from your Support Zone into your Ready Zone? (It stops producing energy.)</p>' +
          '<div class="row"><button class="btn gold" data-s="' + c.slots[0] + '">Yes — into the Ready Zone</button><button class="btn" data-s="-1">No, keep it as energy</button></div>', 'urgent');
        $$('[data-s]', p).forEach(b => b.onclick = () => send({ slot: +b.dataset.s }));
        return;
      }
      case 'discard': {
        const chosen = new Set();
        const P = view.players[UI.me];
        const p = showPrompt('<h3>Discard ' + c.n + ' card' + (c.n > 1 ? 's' : '') + '</h3><p>Your hand is over the limit of 7.</p><div class="discard-grid">' +
          P.hand.map(h => '<div class="dpick" data-uid="' + h.uid + '">' + R.compact(h.id, { w: 80 }) + '</div>').join('') +
          '</div><button class="btn gold" data-ok>Discard</button>', 'wide');
        $$('.dpick', p).forEach(x => x.onclick = () => {
          if (chosen.has(x.dataset.uid)) chosen.delete(x.dataset.uid); else if (chosen.size < c.n) chosen.add(x.dataset.uid);
          x.classList.toggle('on', chosen.has(x.dataset.uid));
        });
        $('[data-ok]', p).onclick = () => chosen.size === c.n ? send({ uids: [...chosen] }) : toast('Choose ' + c.n + ' card(s).', 'error');
        return;
      }
    }
  }

  /** Lists exactly which units' tokens this decision can spend (the unit itself, plus Resonance partners). */
  function tokenSources(view, u, c) {
    if (!u) return '';
    const holders = E.tokenHolders(view, u);
    const kinds = c.purpose === 'bonus' ? [c.token] : E.TOKEN_KINDS.filter(k => E.TOKEN_BASE[k] && (!c.types || c.types.includes(E.TOKEN_BASE[k])));
    return holders.map(h => {
      const t = {};
      for (const k of kinds) if (h.tokens[k]) t[k] = h.tokens[k];
      const pipsHtml = R.tokenPips(t);
      if (!pipsHtml) return '';
      return '<div class="muted">' + pipsHtml + ' on ' + esc(def(h).name) + (h === u ? '' : ' <i>(shared through Resonance)</i>') + '</div>';
    }).join('');
  }

  function tokenPrompt(view, c, unitName) {
    const u = E.unitByUid(view, c.unitUid);
    let title, body, defaultN = c.max;
    if (c.purpose === 'negate') {
      title = '🛡 Negate damage?';
      body = esc(unitName(c.unitUid)) + ' is about to take <b>' + c.amount + '</b> ' + c.types.map(t => R.pip(t)).join('') + ' damage' +
        (c.source === 'status' ? ' from a status' : c.source === 'confusion' ? ' from its own Confusion' : '') + '. Discard matching energy tokens to negate 1 damage each.';
    } else if (c.purpose === 'roll') {
      if (!UI.settings.askRoll) { send({ n: c.max }); return; }
      title = '🎲 Boost the roll?';
      body = esc(unitName(c.unitUid)) + ' rolled <b>' + c.roll + '</b> for ' + esc(c.rollPurpose) + ' (needs ' + c.need + '+). Spend tokens for +1 each?';
    } else if (c.purpose === 'bonus') {
      const t = E.unitByUid(view, c.targetUid);
      title = '🔍 Spend ' + C.TOKEN_NAMES[c.token] + ' tokens?';
      body = c.setTo ? 'Spend 1 ' + C.TOKEN_NAMES[c.token] + ' token so ' + esc(unitName(c.unitUid)) + ' deals <b>' + c.setTo + '</b> damage instead of ' + c.damage + '?'
        : 'Each ' + C.TOKEN_NAMES[c.token] + ' token spent adds +' + c.per + ' damage to ' + esc(unitName(c.unitUid)) + "'s attack on " + esc(t ? def(t).name : '?') + ' (currently ' + c.damage + ').';
    } else {
      const t = E.unitByUid(view, c.targetUid);
      title = '💥 Add tokens to the damage?';
      body = esc(unitName(c.unitUid)) + ' rolled <b>' + c.damage + '</b> damage against ' + esc(t ? def(t).name : '?') +
        (t ? ' (' + (def(t).hp - t.damage) + ' HP left)' : '') + '. Each token adds +1 to a die.';
      defaultN = 0;
    }
    let n = defaultN;
    const p = showPrompt('<h3>' + title + '</h3><p>' + body + '</p><div class="stepper"><button class="btn small" data-d="-1">−</button><span class="sv"></span><button class="btn small" data-d="1">+</button>' +
      '<span class="muted"> of ' + c.max + '</span></div><div class="tok-sources">' + tokenSources(view, u, c) + '</div>' +
      '<div class="row"><button class="btn gold" data-ok>Spend</button><button class="btn" data-no>Don\'t spend</button></div>', 'urgent');
    const upd = () => { $('.sv', p).textContent = n; $('[data-ok]', p).textContent = n ? 'Spend ' + n : 'Confirm (0)'; };
    upd();
    $$('[data-d]', p).forEach(b => b.onclick = () => { n = Math.max(0, Math.min(c.max, n + +b.dataset.d)); upd(); });
    $('[data-ok]', p).onclick = () => send({ n });
    $('[data-no]', p).onclick = () => send({ n: 0 });
  }

  // ───────────────────────── setup placement ─────────────────────────
  function beginSetup(view) {
    if (!UI.setup) UI.setup = [];
    render(view);
    const p = showPrompt('<h3>Place your gladiators</h3><p>Click units in your hand (or drag them) to place 1–4 of them into your Active and Ready slots. ' +
      'Your opponent can\'t see your placement until both of you are ready. Click a placed unit to take it back.</p>' +
      '<div class="row"><button class="btn gold" data-ok>Ready! ⚔</button><button class="btn" data-auto>Auto-place</button></div>', 'setup');
    const upd = () => { $('[data-ok]', p).textContent = 'Ready! (' + UI.setup.length + ' placed)'; $('[data-ok]', p).disabled = !UI.setup.length; };
    upd();
    UI.setupUpdate = upd;
    $('[data-ok]', p).onclick = () => {
      const placements = UI.setup.map(x => ({ uid: x.uid, zone: x.zone, index: x.index }));
      UI.setup = null;
      send({ placements });
    };
    $('[data-auto]', p).onclick = () => {
      UI.setup = [];
      const units = view.players[UI.me].hand.filter(E.isUnitCard).sort((a, b) => def(b).hp - def(a).hp).slice(0, 3);
      units.forEach((c, i) => UI.setup.push({ uid: c.uid, id: c.id, zone: i < 2 ? 'active' : 'ready', index: i < 2 ? i : 1 }));
      render(UI.view); upd();
    };
  }

  function nextSetupSlot() {
    for (const [zone, n] of [['active', 2], ['ready', 3]]) for (let i = 0; i < n; i++) if (!UI.setup.some(x => x.zone === zone && x.index === i)) return { zone, index: i };
    return null;
  }

  function setupPointerDown(e) {
    const t = e.target;
    const v = UI.view;
    const handEl = t.closest('#me-hand .hand-card');
    const placed = t.closest('.slot[data-owner="me"] .card.placed');
    if (placed) {
      UI.setup = UI.setup.filter(x => x.uid !== placed.dataset.uid);
      render(v); UI.setupUpdate(); return;
    }
    if (!handEl) return;
    const c = v.players[UI.me].hand.find(x => x.uid === handEl.dataset.handUid);
    if (!E.isUnitCard(c)) { toast('Only fighters and characters can be placed.', 'error'); return; }
    // Drag to a specific slot, or click to auto-place.
    e.preventDefault();
    const start = stagePoint(e);
    const targets = [];
    for (const [zone, n] of [['active', 2], ['ready', 3]]) for (let i = 0; i < n; i++) {
      if (!UI.setup.some(x => x.zone === zone && x.index === i)) targets.push({ el: slotEl('me', zone, i), zone, index: i });
    }
    const place = (zone, index) => {
      if (UI.setup.length >= 4) { toast('You can place at most four units.', 'error'); return; }
      UI.setup.push({ uid: c.uid, id: c.id, zone, index });
      S.play('play');
      render(v); UI.setupUpdate();
    };
    let ghost = null;
    const move = ev => {
      const p = stagePoint(ev);
      if (!ghost && Math.hypot(p.x - start.x, p.y - start.y) > 8) {
        ghost = handEl.cloneNode(true); ghost.classList.add('drag-ghost'); ghost.style.transform = 'none';
        $('#fx-layer').appendChild(ghost);
        targets.forEach(x => x.el.classList.add('drop-ok'));
      }
      if (ghost) { ghost.style.left = (p.x - 60) + 'px'; ghost.style.top = (p.y - 80) + 'px'; targets.forEach(x => x.el.classList.toggle('drop-hover', inside(x.el, p))); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', ev => {
      window.removeEventListener('pointermove', move);
      targets.forEach(x => x.el.classList.remove('drop-ok', 'drop-hover'));
      if (ghost) {
        ghost.remove();
        const p = stagePoint(ev);
        const hit = targets.find(x => inside(x.el, p));
        if (hit) place(hit.zone, hit.index);
        return;
      }
      const s = nextSetupSlot();
      if (s) place(s.zone, s.index);
    }, { once: true });
  }

  // ───────────────────────── effects ─────────────────────────
  function fxAt(el, html, cls, dur) {
    const r = el ? stageRect(el) : { cx: CX, cy: 412 };
    const f = document.createElement('div');
    f.className = 'fx ' + (cls || '');
    f.innerHTML = html;
    f.style.left = r.cx + 'px';
    f.style.top = r.cy + 'px';
    $('#fx-layer').appendChild(f);
    setTimeout(() => f.remove(), (dur || 1200) / (UI.settings.speed || 1));
    return f;
  }

  function banner(text, cls, dur) {
    const b = document.createElement('div');
    b.className = 'banner ' + (cls || '');
    b.innerHTML = text;
    $('#fx-layer').appendChild(b);
    setTimeout(() => b.remove(), (dur || 1200) / (UI.settings.speed || 1));
  }

  async function diceFx(ev) {
    S.play('dice');
    const el = ev.unitUid ? unitEl(ev.unitUid) : null;
    const success = ev.need ? ev.dice[0] >= ev.need : null;
    const f = fxAt(el, '<div class="dice-label">' + esc(ev.purpose || '') + (ev.need ? ' <small>(' + ev.need + '+)</small>' : '') + '</div><div class="dice">' +
      ev.dice.map(() => '<span class="die rolling">?</span>').join('') + '</div>', 'dicefx', 1500);
    const dies = $$('.die', f);
    for (let k = 0; k < 6; k++) { dies.forEach(d => d.textContent = 1 + Math.floor(Math.random() * 6)); await wait(55); }
    dies.forEach((d, i) => { d.textContent = ev.dice[i]; d.classList.remove('rolling'); if (ev.emboldenDie && i === ev.dice.length - 1) d.classList.add('emb'); });
    if (success !== null) f.classList.add(success ? 'ok' : 'fail');
  }

  async function animateAttack(ev) {
    const a = unitEl(ev.attackerUid), t = unitEl(ev.targetUid);
    if (!a || !t) return;
    const ra = stageRect(a), rt = stageRect(t);
    const arrow = drawArrow(ra, rt, ev.reaction ? 'reaction' : 'live');
    banner((ev.reaction ? '↩ ' + esc(ev.reaction) + '! ' : '') + esc(ev.attack), 'attack-name', 900);
    const dx = (rt.cx - ra.cx) * 0.35, dy = (rt.cy - ra.cy) * 0.35;
    await a.animate([{ transform: 'none' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1.06)' }, { transform: 'none' }],
      { duration: 420 / (UI.settings.speed || 1), easing: 'ease-in-out' }).finished.catch(() => {});
    setTimeout(() => arrow.remove(), 300);
  }

  async function animateDie(uid) {
    const el = unitEl(uid);
    if (!el) return;
    S.play('defeat');
    await el.animate([{ opacity: 1, transform: 'none', filter: 'grayscale(1)' }, { opacity: 0, transform: 'translateY(20px) scale(0.6) rotate(-8deg)', filter: 'grayscale(1)' }],
      { duration: 380 / (UI.settings.speed || 1), easing: 'ease-in' }).finished.catch(() => {});
  }

  function logEvent(ev) {
    if (ev.type === 'favour' && UI.favourLog) UI.favourLog[ev.player].push({ turn: ev.turn, n: ev.n, reason: ev.reason });
    if (!ev.text) return;
    const log = $('#log');
    if (!log) return;
    const d = document.createElement('div');
    d.className = 'log-line lg-' + ev.type;
    d.innerHTML = esc(ev.text);
    log.appendChild(d);
    while (log.children.length > 300) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  // ───────────────────────── step queue ─────────────────────────
  async function playStep(step) {
    const ev = step.ev, view = step.view;
    if (UI.hooks.beforeStep) UI.hooks.beforeStep(ev, view);
    if (ev.type === 'die') await animateDie(ev.uid);
    if (ev.type === 'attack') await animateAttack(ev);
    render(view);
    logEvent(ev);
    const mine = ev.player === UI.me;
    switch (ev.type) {
      case 'turn': S.play('turn'); banner(ev.player === UI.me ? 'YOUR TURN' : esc(view.players[ev.player].name.toUpperCase()) + "'S TURN", ev.player === UI.me ? 'turn mine' : 'turn', 1300); break;
      case 'phase': if (ev.phase !== 'setup' && ev.player === UI.me) banner(ev.phase.toUpperCase() + ' PHASE', 'phase', 800); break;
      case 'roll': await diceFx(ev); break;
      case 'rolloff': S.play('dice'); banner('Roll-off: ' + esc(view.players[0].name) + ' <b>' + ev.rolls[0] + '</b> · ' + esc(view.players[1].name) + ' <b>' + ev.rolls[1] + '</b>', 'phase', 1400); break;
      case 'damage': S.play('hit'); { const el = unitEl(ev.unitUid); fxAt(el, '−' + ev.n, 'dmg-float', 1100); if (el) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 }); } break;
      case 'heal': fxAt(unitEl(ev.unitUid), '+' + ev.n, 'heal-float', 1100); break;
      case 'parry': S.play('parry'); fxAt(unitEl(ev.unitUid), '🛡 PARRY', 'word-float', 1000); break;
      case 'negate': fxAt(unitEl(ev.unitUid), '−' + ev.n + ' negated', 'word-float', 1000); break;
      case 'boost': fxAt(unitEl(ev.unitUid), '+' + ev.n, 'word-float', 900); break;
      case 'status': S.play('status'); fxAt(unitEl(ev.unitUid), (ev.removed ? '✓ ' : '') + (R.STATUS_ICON[ev.status] || '') + ' ' + ev.status, ev.removed ? 'word-float' : 'status-float', 1100); break;
      case 'tokens': fxAt(unitEl(ev.unitUid), R.tokenPips({ [ev.token]: ev.delta }), 'token-float', 900); break;
      case 'favour': {
        S.play('favour');
        const info = $(ev.player === UI.me ? '#me-info' : '#opp-info');
        info.classList.add('fav-flash'); setTimeout(() => info.classList.remove('fav-flash'), 900);
        banner('👑 +' + ev.n + ' FAVOUR <small>' + esc(view.players[ev.player].name) + ' — ' + esc(ev.reason) + '</small>', 'favour ' + (mine ? 'mine' : ''), 1500);
        break;
      }
      case 'defeated': fxAt(unitEl(ev.unitUid), '💀', 'skull-float', 1000); break;
      case 'play': case 'move': case 'shift': S.play('play'); if (ev.type === 'shift') banner('⧉ SHIFT!', 'phase', 900); break;
      case 'draw': S.play('draw'); break;
      case 'powerup': {
        S.play('play');
        if (ev.player !== UI.me) {
          const f = fxAt(null, R.card(ev.cardId, { w: 220 }), 'powerup-show', 1300);
          f.style.top = '250px';
        }
        break;
      }
      case 'mulligan': banner(esc(view.players[ev.player].name) + ' mulligans!', 'phase', 1500); break;
      case 'reveal': S.play('turn'); banner('⚔ REVEAL! ⚔', 'turn', 1100); break;
      case 'gameover': showGameOver(ev, view); break;
    }
    if (UI.hooks.afterStep) UI.hooks.afterStep(ev, view);
    await wait(WAIT[ev.type] != null ? WAIT[ev.type] : 250);
  }

  async function pump() {
    if (UI.busy) return;
    UI.busy = true;
    hidePrompt();
    cancelSelection();
    updateMainButton();
    try {
      while (UI.queue.length) {
        const step = UI.queue.shift();
        // Skip ahead quickly when far behind (e.g. reconnecting).
        if (UI.queue.length > 60 && step.ev.type !== 'gameover') { render(step.view); logEvent(step.ev); continue; }
        await playStep(step);
      }
    } catch (err) {
      console.error(err);
    }
    UI.busy = false;
    if (UI.view) {
      render(UI.view);
      promptFor(UI.view);
      if (UI.hooks.onIdle) UI.hooks.onIdle(UI.view);
    }
    if (UI.ctl && UI.ctl.onIdle) UI.ctl.onIdle();
  }

  function showGameOver(ev, view) {
    const won = ev.winner === UI.me, draw = ev.winner === 'draw';
    S.play(won ? 'win' : draw ? 'turn' : 'lose');
    setTimeout(() => {
      const m = modal('<div class="gameover ' + (won ? 'won' : draw ? 'draw' : 'lost') + '"><div class="go-icon">' + (won ? '🏆' : draw ? '🤝' : '💀') + '</div>' +
        '<h2>' + (won ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT') + '</h2><p>' + esc(ev.reason) + '</p>' +
        '<p class="muted">Favour ' + view.players[UI.me].favour + ' – ' + view.players[1 - UI.me].favour + ' · Turn ' + view.turn + '</p>' +
        '<div class="row">' + (UI.ctl && UI.ctl.rematch ? '<button class="btn gold" data-r>Rematch</button>' : '') +
        '<button class="btn" data-v>View board</button><button class="btn" data-m>Main menu</button></div></div>', { sticky: true, cls: 'go-modal' });
      const r = $('[data-r]', m.el);
      if (r) r.onclick = () => { m.close(); UI.ctl.rematch(); };
      $('[data-v]', m.el).onclick = () => m.close();
      $('[data-m]', m.el).onclick = () => { m.close(); UI.leave(); };
    }, 900 / (UI.settings.speed || 1));
  }

  // ───────────────────────── public API ─────────────────────────
  UI.start = function (ctl, opts) {
    UI.ctl = ctl;
    UI.opts = opts || {};
    UI.me = opts.me || 0;
    UI.queue = [];
    UI.busy = false;
    UI.setup = null;
    UI.sel = null;
    UI.view = null;
    UI.hooks = opts.hooks || {};
    UI.favourLog = [[], []];
    $('#modal-layer').innerHTML = '';
    buildBoard();
  };
  UI.enqueue = function (steps) {
    UI.queue.push(...steps);
    pump();
  };
  UI.leave = function () {
    if (UI.ctl && UI.ctl.close) UI.ctl.close();
    UI.ctl = null;
    UI.queue = [];
    $('#modal-layer').innerHTML = '';
    if (UI.hooks.onLeave) UI.hooks.onLeave();
    window.BCMain.go('menu');
  };
  UI.reprompt = function () { if (UI.view) { render(UI.view); promptFor(UI.view); } };
  UI.send = send;
  UI.setLog = events => { const log = $('#log'); if (!log) return; log.innerHTML = ''; events.forEach(logEvent); };
  UI.toast = toast;
  UI.modal = modal;
  UI.confirm = askConfirm;
  UI.saveSettings = saveSettings;
  UI.render = v => render(v);
  UI.unitEl = unitEl;
  UI.slotEl = slotEl;
  UI.isIdle = () => !UI.busy && UI.queue.length === 0;
  UI.stageRect = stageRect;

  window.BCUI = UI;
})();
