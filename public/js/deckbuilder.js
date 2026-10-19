/* Battle Cards — deck storage and deck builder screen. */
(function () {
  'use strict';
  const C = window.BCCards, R = window.BCRender;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const KEY = 'bc.decks';

  // ───────── storage ─────────
  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function saveCustom(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { window.BCUI.toast('Could not save decks in this browser.', 'error'); }
  }
  const Decks = {
    all() {
      return C.PRESET_DECKS.map(d => Object.assign({ preset: true }, d)).concat(loadCustom().map(d => Object.assign({ custom: true }, d)));
    },
    get(id) { return Decks.all().find(d => d.id === id); },
    save(deck) {
      const list = loadCustom();
      const i = list.findIndex(d => d.id === deck.id);
      if (i >= 0) list[i] = deck; else list.push(deck);
      saveCustom(list);
    },
    remove(id) { saveCustom(loadCustom().filter(d => d.id !== id)); },
    colors(cards) {
      const n = { M: 0, A: 0, T: 0, S: 0 };
      for (const id of cards) { const c = C.byId[id]; if (c && c.energy) for (const t of c.energy) n[t]++; }
      return Object.keys(n).filter(t => n[t] >= 6).sort((a, b) => n[b] - n[a]);
    },
  };

  // ───────── builder ─────────
  const B = { deck: null };

  function encode(cards) { return btoa(cards.join(',')); }
  function decode(s) { return atob(s.trim()).split(',').filter(Boolean); }

  function fresh() { return { id: 'custom-' + Date.now().toString(36), name: 'New Deck', cards: [] }; }

  function open() {
    if (!B.deck) B.deck = fresh();
    fillLoad();
    drawCollection();
    drawDeck();
  }

  function fillLoad() {
    const sel = $('#db-load');
    sel.innerHTML = '<option value="">Load a deck…</option>' + Decks.all().map(d => '<option value="' + d.id + '">' + (d.preset ? '★ ' : '') + R.esc(d.name) + '</option>').join('');
  }

  function counts() {
    const n = {};
    for (const id of B.deck.cards) n[id] = (n[id] || 0) + 1;
    return n;
  }

  function drawCollection() {
    const q = $('#db-search').value.trim().toLowerCase();
    const type = $('#db-type').value, en = $('#db-energy').value, set = $('#db-set').value;
    const n = counts();
    const cards = C.CARDS.filter(c => !c.flipSide && (!set || (set === 'core' ? !c.set : c.set === set)) && (!type || c.type === type) && (!en || (c.energy && c.energy.includes(en))) &&
      (!q || (c.name + ' ' + (c.keywords || []).join(' ') + ' ' + (c.attacks || []).map(a => a.name + ' ' + a.keywords.join(' ')).join(' ') + ' ' + (c.faction || '')).toLowerCase().includes(q)));
    $('#db-collection').innerHTML = cards.map(c => {
      const max = c.type === 'character' ? 1 : 2;
      return '<div class="coll-item' + ((n[c.id] || 0) >= max ? ' maxed' : '') + '" data-id="' + c.id + '">' + (n[c.id] ? '<span class="count">' + n[c.id] + '/' + max + '</span>' : '') +
        R.card(c.id, { w: 172 }) + '</div>';
    }).join('');
    $$('.coll-item', $('#db-collection')).forEach(el => el.onclick = () => add(el.dataset.id));
  }

  function add(id) {
    const c = C.byId[id];
    const max = c.type === 'character' ? 1 : 2;
    if ((counts()[id] || 0) >= max) return window.BCUI.toast('Max ' + max + (max === 1 ? ' copy of each character version.' : ' copies.'), 'error');
    if (B.deck.cards.length >= 40) return window.BCUI.toast('Decks are exactly 40 cards.', 'error');
    B.deck.cards.push(id);
    window.BCSound.play('click');
    drawCollection(); drawDeck();
  }
  function removeOne(id) {
    const i = B.deck.cards.indexOf(id);
    if (i >= 0) B.deck.cards.splice(i, 1);
    drawCollection(); drawDeck();
  }

  function drawDeck() {
    $('#db-name').value = B.deck.name;
    const n = counts();
    const ids = Object.keys(n).sort((a, b) => {
      const ta = { character: 0, fighter: 1, powerup: 2 }, ca = C.byId[a], cb = C.byId[b];
      return ta[ca.type] - ta[cb.type] || ca.name.localeCompare(cb.name);
    });
    $('#db-list').innerHTML = ids.map(id => {
      const c = C.byId[id];
      return '<div class="dl-row" data-id="' + id + '" data-card-id="' + id + '" title="Click to remove"><span class="n">' + n[id] + '×</span><span>' + c.art + '</span><span class="nm">' + R.esc(c.name) + '</span>' +
        (c.energy ? R.pips(c.energy) : '<small class="muted">Power Up</small>') + '</div>';
    }).join('') || '<p class="muted">Click cards on the left to add them.</p>';
    $$('.dl-row').forEach(el => el.onclick = () => removeOne(el.dataset.id));
    const total = B.deck.cards.length;
    const units = B.deck.cards.filter(id => C.byId[id].type !== 'powerup').length;
    const chars = B.deck.cards.filter(id => C.byId[id].type === 'character').length;
    $('#db-count').textContent = total + ' / 40 cards';
    $('#db-count').className = 'deck-count ' + (total === 40 ? 'ok' : 'bad');
    const e = { M: 0, A: 0, T: 0, S: 0 };
    for (const id of B.deck.cards) { const c = C.byId[id]; if (c.energy) for (const t of c.energy) e[t]++; }
    $('#db-curve').innerHTML = 'Units ' + units + ' · Characters ' + chars + ' · Power Ups ' + (total - units) + '<br>Energy: ' +
      Object.keys(e).map(t => R.pip(t) + ' ' + e[t]).join(' &nbsp;');
    const probs = C.validateDeck(B.deck.cards);
    $('#db-problems').textContent = probs.join(' ');
  }

  function bind() {
    $('#db-set').innerHTML = '<option value="">All sets</option><option value="core">Core set</option>' + C.SETS.map(st => '<option value="' + st.id + '">' + R.esc(st.info.name) + '</option>').join('');
    $('#db-set').onchange = drawCollection;
    $('#db-search').oninput = drawCollection;
    $('#db-type').onchange = drawCollection;
    $('#db-energy').onchange = drawCollection;
    $('#db-name').oninput = () => { B.deck.name = $('#db-name').value; };
    $('#db-new').onclick = () => { B.deck = fresh(); drawCollection(); drawDeck(); };
    $('#db-load').onchange = () => {
      const d = Decks.get($('#db-load').value);
      if (!d) return;
      B.deck = d.preset ? { id: 'custom-' + Date.now().toString(36), name: d.name + ' (copy)', cards: d.cards.slice() } : JSON.parse(JSON.stringify({ id: d.id, name: d.name, cards: d.cards }));
      $('#db-load').value = '';
      drawCollection(); drawDeck();
    };
    $('#db-save').onclick = async () => {
      const probs = C.validateDeck(B.deck.cards);
      if (probs.length && !(await window.BCUI.confirm('This deck is not legal yet: ' + probs.join(' ') + ' Save it anyway? Only legal decks can be played.', 'Save anyway'))) return;
      B.deck.name = B.deck.name.trim() || 'Unnamed Deck';
      Decks.save(JSON.parse(JSON.stringify(B.deck)));
      fillLoad();
      window.BCUI.toast('Deck saved.');
    };
    $('#db-delete').onclick = async () => {
      if (!(await window.BCUI.confirm('Delete "' + B.deck.name + '"? This cannot be undone.', 'Delete'))) return;
      Decks.remove(B.deck.id);
      B.deck = fresh();
      fillLoad(); drawCollection(); drawDeck();
    };
    $('#db-export').onclick = () => {
      const code = encode(B.deck.cards);
      const m = window.BCUI.modal('<h3>Export deck</h3><p class="muted">Copy this code to share "' + R.esc(B.deck.name) + '".</p><textarea class="input" style="width:560px;height:120px">' + code + '</textarea>');
      $('textarea', m.el).select();
    };
    $('#db-import').onclick = () => {
      const m = window.BCUI.modal('<h3>Import deck</h3><textarea class="input" style="width:560px;height:120px" placeholder="Paste a deck code"></textarea><div class="row" style="margin-top:10px"><button class="btn gold">Import</button></div>');
      $('button', m.el).onclick = () => {
        try {
          const ids = decode($('textarea', m.el).value).filter(id => C.byId[id]);
          if (!ids.length) throw new Error('empty');
          B.deck = { id: 'custom-' + Date.now().toString(36), name: 'Imported Deck', cards: ids.slice(0, 40) };
          m.close(); drawCollection(); drawDeck();
        } catch (e) { window.BCUI.toast('That deck code is not valid.', 'error'); }
      };
    };
    // Hover previews in the builder list.
    $('#db-list').addEventListener('pointerover', e => {
      const el = e.target.closest('[data-card-id]');
      if (!el) return;
      let pv = $('#db-preview');
      if (!pv) { pv = document.createElement('div'); pv.id = 'db-preview'; pv.style.cssText = 'position:absolute;right:400px;top:120px;z-index:50;pointer-events:none'; $('#screen-decks').appendChild(pv); }
      pv.innerHTML = R.card(el.dataset.cardId, { w: 260 });
    });
    $('#db-list').addEventListener('pointerleave', () => { const pv = $('#db-preview'); if (pv) pv.remove(); });
  }

  window.BCDecks = Decks;
  window.BCDeckBuilder = { open, bind };
})();
