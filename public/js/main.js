/* Battle Cards — menus and navigation. */
(function () {
  'use strict';
  const C = window.BCCards, R = window.BCRender, UI = window.BCUI, Decks = window.BCDecks, Bots = window.BCBots;
  const { LocalController, RemoteController } = window.BCControllers;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const state = { myDeck: 'steel', bot: 'medium', botDeck: '', onlineDeck: 'steel' };
  const BOT_ICON = { easy: '🐣', medium: '⚔️', hard: '👑' };

  function go(name) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    if (name === 'play') fillPlay();
    if (name === 'online') fillOnline();
    if (name === 'decks') window.BCDeckBuilder.open();
    if (name === 'rules') $('#rules-body').innerHTML = window.BCRulesHTML;
    if (name === 'settings') fillSettings();
    if (name === 'tutorial') { window.BCTutorial.start(); return; }
  }

  function deckOptions(container, selected, onPick) {
    const legal = Decks.all().filter(d => !C.validateDeck(d.cards).length);
    container.innerHTML = legal.map(d => '<div class="deck-opt' + (d.id === selected ? ' on' : '') + '" data-id="' + d.id + '"><div><div class="dn">' +
      (d.custom ? '✎ ' : '') + R.esc(d.name) + '</div><div class="dd">' + R.esc(d.description || 'Custom deck') + '</div></div><span class="pips">' +
      R.pips(d.colors || Decks.colors(d.cards)) + '</span></div>').join('');
    $$('.deck-opt', container).forEach(el => el.onclick = () => { onPick(el.dataset.id); $$('.deck-opt', container).forEach(x => x.classList.toggle('on', x === el)); });
  }

  function fillPlay() {
    deckOptions($('#play-my-decks'), state.myDeck, id => { state.myDeck = id; });
    $('#play-bots').innerHTML = Object.keys(Bots.LEVELS).map(k => {
      const b = Bots.LEVELS[k];
      return '<div class="bot-opt' + (k === state.bot ? ' on' : '') + '" data-k="' + k + '"><span class="bicon">' + BOT_ICON[k] + '</span><div><div class="dn">' + b.name + '</div><div class="dd">' + b.blurb +
        '</div></div><span class="diff ' + k + '">' + b.title + '</span></div>';
    }).join('');
    $$('.bot-opt').forEach(el => el.onclick = () => { state.bot = el.dataset.k; fillPlay(); });
    const sel = $('#play-bot-deck');
    const sig = Decks.get(Bots.LEVELS[state.bot].deck);
    sel.innerHTML = '<option value="">Signature deck (' + R.esc(sig.name) + ')</option><option value="random">Random preset</option>' +
      Decks.all().filter(d => !C.validateDeck(d.cards).length).map(d => '<option value="' + d.id + '">' + R.esc(d.name) + '</option>').join('');
    sel.value = state.botDeck;
    sel.onchange = () => { state.botDeck = sel.value; };
  }

  function startBotGame() {
    const mine = Decks.get(state.myDeck);
    if (!mine) return UI.toast('Choose a deck.', 'error');
    let botDeck;
    if (state.botDeck === 'random') botDeck = C.PRESET_DECKS[Math.floor(Math.random() * C.PRESET_DECKS.length)];
    else botDeck = Decks.get(state.botDeck || Bots.LEVELS[state.bot].deck);
    const lvl = Bots.LEVELS[state.bot];
    go('game');
    new LocalController({ decks: [mine.cards, botDeck.cards], names: [UI.settings.name || 'Player', lvl.name], level: state.bot, oppAvatar: BOT_ICON[state.bot] }).start();
  }

  // ───────── online ─────────
  let poll = null;
  async function api(path, body) {
    const r = await fetch('api/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    return r.json();
  }
  async function fillOnline() {
    $('#online-name').value = UI.settings.name && UI.settings.name !== 'Player' ? UI.settings.name : '';
    deckOptions($('#online-decks'), state.onlineDeck, id => { state.onlineDeck = id; });
    $('#online-status').innerHTML = '';
    let ok = false;
    if (location.protocol.startsWith('http')) {
      try { ok = (await api('ping')).ok; } catch (e) { ok = false; }
    }
    $('#online-unavailable').classList.toggle('hidden', ok);
    $('#online-body').style.opacity = ok ? 1 : 0.4;
    $('#online-body').style.pointerEvents = ok ? 'auto' : 'none';
  }
  function onlineName() {
    const n = $('#online-name').value.trim() || 'Gladiator';
    UI.settings.name = n; UI.saveSettings();
    return n;
  }
  function waitForStart(room, token, seat) {
    clearInterval(poll);
    poll = setInterval(async () => {
      try {
        const s = await api('rooms/' + room + '/status?token=' + encodeURIComponent(token));
        if (s.error) { clearInterval(poll); $('#online-status').textContent = s.error; return; }
        if (s.started) {
          clearInterval(poll);
          go('game');
          new RemoteController({ room, token, seat }).start();
        }
      } catch (e) { /* keep polling */ }
    }, 1000);
  }
  async function createRoom() {
    const deck = Decks.get(state.onlineDeck);
    const r = await api('rooms', { name: onlineName(), deck: deck.cards });
    if (r.error) return UI.toast(r.error, 'error');
    $('#online-status').innerHTML = 'Room code<div class="big-code">' + r.room + '</div>Share this code with your opponent. Waiting for them to join…';
    waitForStart(r.room, r.token, r.seat);
  }
  async function joinRoom() {
    const code = $('#online-code').value.trim().toUpperCase();
    if (!code) return UI.toast('Enter a room code.', 'error');
    const deck = Decks.get(state.onlineDeck);
    const r = await api('rooms/' + code + '/join', { name: onlineName(), deck: deck.cards });
    if (r.error) return UI.toast(r.error, 'error');
    $('#online-status').textContent = 'Joined! Starting…';
    waitForStart(r.room, r.token, r.seat);
  }

  // ───────── settings ─────────
  function fillSettings() {
    const s = UI.settings;
    $('#set-name').value = s.name;
    $('#set-speed').value = String(s.speed);
    $('#set-manualpay').checked = !!s.manualPay;
    $('#set-askroll').checked = s.askRoll !== false;
    $('#set-sound').checked = s.sound !== false;
  }
  function bindSettings() {
    $('#set-name').oninput = e => { UI.settings.name = e.target.value.trim() || 'Player'; UI.saveSettings(); };
    $('#set-speed').onchange = e => { UI.settings.speed = +e.target.value; UI.saveSettings(); };
    $('#set-manualpay').onchange = e => { UI.settings.manualPay = e.target.checked; UI.saveSettings(); };
    $('#set-askroll').onchange = e => { UI.settings.askRoll = e.target.checked; UI.saveSettings(); };
    $('#set-sound').onchange = e => { UI.settings.sound = e.target.checked; UI.saveSettings(); };
  }

  function showRulesModal() {
    UI.modal('<h3>Rules Reference</h3><div class="rules-body">' + window.BCRulesHTML + '</div>', { cls: 'rules-modal' });
  }

  // ───────── boot ─────────
  $$('[data-go]').forEach(b => b.addEventListener('click', () => { window.BCSound.play('click'); clearInterval(poll); go(b.dataset.go); }));
  $('#play-start').onclick = startBotGame;
  $('#online-create').onclick = createRoom;
  $('#online-join').onclick = joinRoom;
  bindSettings();
  window.BCDeckBuilder.bind();

  window.BCMain = { go, showRulesModal, state };
})();
