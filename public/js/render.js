/* Battle Cards — card rendering (HTML strings). */
(function () {
  'use strict';
  const C = window.BCCards;

  const ENERGY = {
    M: { icon: '⚔', name: 'Martial' },
    A: { icon: '✦', name: 'Arcane' },
    T: { icon: '♞', name: 'Tactical' },
    S: { icon: '⚙', name: 'Scientific' },
    '*': { icon: '◆', name: 'Any' },
  };
  const STATUS_ICON = { Poisoned: '☠', Ablaze: '🔥', Blinded: '🙈', Confused: '💫' };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function pip(t, extra) {
    return '<span class="pip e-' + (t === '*' ? 'any' : t) + (extra ? ' ' + extra : '') + '" title="' + ENERGY[t].name + '">' + ENERGY[t].icon + '</span>';
  }
  function pips(cost) { return cost.map(t => pip(t)).join(''); }

  function frameClass(d) {
    if (d.type === 'powerup') return 'e-power';
    return 'e-' + d.energy[0] + (d.energy[1] ? ' e2-' + d.energy[1] : '');
  }

  function attackHTML(a, i, opts) {
    const kw = a.keywords.filter(k => k !== 'Counterattack' && k !== 'Intervention');
    if (a.salvo) kw.push('Salvo (' + a.salvo + ')');
    const react = a.keywords.find(k => k === 'Counterattack' || k === 'Intervention');
    return '<div class="c-attack' + (opts && opts.highlightAttack === i ? ' hl' : '') + '">' +
      '<div class="c-atk-line"><span class="c-cost">' + pips(a.cost) + '</span><span class="c-atk-name">' + esc(a.name) + '</span>' +
      '<span class="c-dmg">' + C.damageText(a) + '</span></div>' +
      (react ? '<div class="c-react">↩ ' + react + '</div>' : '') +
      (kw.length ? '<div class="c-kw">' + kw.map(esc).join(' · ') + '</div>' : '') +
      '</div>';
  }

  function unitKeywordLine(d) {
    const kws = d.keywords.filter(k => k !== 'Shift');
    const parts = kws.slice();
    if (d.armour) for (const t in d.armour) parts.push('Armour ' + ENERGY[t].icon + d.armour[t]);
    return parts.length ? '<div class="c-unitkw">' + parts.map(esc).join(' · ') + '</div>' : '';
  }

  /** Full card face. opts: { uid, w, unit, cls, highlightAttack } */
  function card(id, opts) {
    opts = opts || {};
    const d = C.byId[id];
    const w = opts.w || 130;
    const attrs = ' data-card-id="' + id + '"' + (opts.uid ? ' data-uid="' + opts.uid + '"' : '');
    let body = '';
    let head = '';
    if (d.type === 'powerup') {
      head = '<div class="c-head"><span class="c-name">' + esc(d.name) + '</span></div>';
      body = '<div class="c-typeline">Power Up</div><div class="c-body"><div class="c-text">' + esc(C.powerUpText(d)) + '</div>' +
        (d.flavor ? '<div class="c-flavor">' + esc(d.flavor) + '</div>' : '') + '</div>';
    } else {
      head = '<div class="c-head"><span class="c-name">' + esc(d.name) + '</span><span class="c-energy">' + pips(d.energy) + '</span>' +
        '<span class="c-hp">' + d.hp + '</span></div>';
      const typeline = (d.type === 'character' ? 'Character — ' + esc(d.baseName) : 'Fighter') + (d.faction ? ' · ' + esc(d.faction) : '');
      body = '<div class="c-typeline">' + typeline + '</div><div class="c-body">' + unitKeywordLine(d) +
        d.attacks.map((a, i) => attackHTML(a, i, opts)).join('') +
        d.abilities.map(ab => '<div class="c-ability"><span class="c-cost">' + (ab.cost.length ? pips(ab.cost) : '') + '</span> <b>' + esc(ab.name) + '</b> — ' +
          esc(C.KEYWORD_TEXT[ab.name] || ('Place 1 ' + C.TYPE_NAMES[ab.effect.token] + ' token on this unit.')) + ' <i>(once per turn)</i></div>').join('') +
        (d.shift ? '<div class="c-shift"><b>Shift:</b> ' + esc(C.shiftText(d)) + '</div>' : '') +
        (opts.w >= 200 && d.flavor ? '<div class="c-flavor">' + esc(d.flavor) + '</div>' : '') +
        '</div>';
    }
    return '<div class="card full ' + frameClass(d) + ' t-' + d.type + ' ' + (opts.cls || '') + '"' + attrs + ' style="--w:' + w + 'px">' +
      '<div class="c-frame">' + head + '<div class="c-art"><span class="c-emoji">' + d.art + '</span></div>' + body + '</div>' +
      (opts.unit ? unitOverlay(opts.unit) : '') + '</div>';
  }

  /** Compact card for Ready slots and thumbnails. */
  function compact(id, opts) {
    opts = opts || {};
    const d = C.byId[id];
    const w = opts.w || 92;
    const attrs = ' data-card-id="' + id + '"' + (opts.uid ? ' data-uid="' + opts.uid + '"' : '');
    const hpTxt = d.type === 'powerup' ? '' : '<span class="c-hp">' + d.hp + '</span>';
    return '<div class="card compact ' + frameClass(d) + ' t-' + d.type + ' ' + (opts.cls || '') + '"' + attrs + ' style="--w:' + w + 'px">' +
      '<div class="c-frame"><div class="c-head"><span class="c-name">' + esc(d.name.split(',')[0]) + '</span>' + hpTxt + '</div>' +
      '<div class="c-art"><span class="c-emoji">' + d.art + '</span></div>' +
      '<div class="c-mini-energy">' + (d.energy ? pips(d.energy) : '<span class="c-pu">POWER UP</span>') + '</div></div>' +
      (opts.unit ? unitOverlay(opts.unit) : '') + '</div>';
  }

  /** Small energy tile in the Support Zone. */
  function supportTile(s, opts) {
    const d = C.byId[s.id];
    opts = opts || {};
    return '<div class="stile ' + frameClass(d) + (s.tapped ? ' tapped' : '') + ' ' + (opts.cls || '') + '" data-uid="' + s.uid + '" data-card-id="' + s.id + '">' +
      '<span class="st-emoji">' + d.art + '</span><span class="st-energy">' + pips(d.energy) + '</span>' +
      '<span class="st-name">' + esc(d.name.split(',')[0]) + '</span></div>';
  }

  function back(opts) {
    opts = opts || {};
    return '<div class="card back ' + (opts.cls || '') + '"' + (opts.uid ? ' data-uid="' + opts.uid + '"' : '') + ' style="--w:' + (opts.w || 100) + 'px">' +
      '<div class="back-inner"><span>⚔</span></div></div>';
  }

  function tokenPips(tokens) {
    let s = '';
    for (const t of ['M', 'A', 'T', 'S']) if (tokens[t]) s += '<span class="tok e-' + t + '" title="' + tokens[t] + ' ' + ENERGY[t].name + ' token(s)">' + ENERGY[t].icon + (tokens[t] > 1 ? '<b>' + tokens[t] + '</b>' : '') + '</span>';
    return s;
  }

  function unitOverlay(u) {
    const d = C.byId[u.id];
    const left = d.hp - u.damage;
    let s = '<div class="u-hpbar"><div class="u-hpfill" style="width:' + Math.max(0, Math.min(100, left / d.hp * 100)) + '%"></div></div>';
    s += '<div class="u-hp' + (u.damage ? ' hurt' : '') + '">' + Math.max(0, left) + '</div>';
    if (u.damage) s += '<div class="u-dmg">−' + u.damage + '</div>';
    const toks = tokenPips(u.tokens);
    if (toks) s += '<div class="u-tokens">' + toks + '</div>';
    if (u.statuses.length) s += '<div class="u-status">' + u.statuses.map(st => '<span title="' + st + '">' + STATUS_ICON[st] + '</span>').join('') + '</div>';
    if (u.attachments.length) s += '<div class="u-attach">' + u.attachments.map(a => '<span title="' + esc(C.byId[a.id].name) + '">' + C.byId[a.id].art + '</span>').join('') + '</div>';
    if (u.stack.length) s += '<div class="u-stack" title="Shifted from ' + u.stack.map(c => esc(C.byId[c.id].name)).join(', ') + '">⧉' + u.stack.length + '</div>';
    if (u.defeated) s += '<div class="u-defeated"><span>💀</span><b>DEFEATED</b></div>';
    return s;
  }

  /** Text block explaining a card's keywords and a unit's live state (for the hover preview). */
  function explain(id, unit) {
    const d = C.byId[id];
    const lines = [];
    if (unit) {
      lines.push('<div class="ex-state"><b>' + Math.max(0, d.hp - unit.damage) + '/' + d.hp + ' HP</b>' + (unit.damage ? ' · ' + unit.damage + ' damage' : '') + '</div>');
      for (const st of unit.statuses) lines.push('<div class="ex-row status">' + STATUS_ICON[st] + ' <b>' + st + '</b>: ' + esc(C.STATUS_TEXT[st]) + '</div>');
      const t = tokenPips(unit.tokens);
      if (t) lines.push('<div class="ex-row">Tokens: ' + t + ' — discard to negate 1 matching damage, pay 1 matching energy for an attack, or +1 to a roll.</div>');
      for (const a of unit.attachments) lines.push('<div class="ex-row">' + C.byId[a.id].art + ' <b>' + esc(C.byId[a.id].name) + '</b>: ' + esc(C.powerUpText(C.byId[a.id])) + '</div>');
      if (unit.stack.length) lines.push('<div class="ex-row">⧉ Shifted from: ' + unit.stack.map(c => esc(C.byId[c.id].name)).join(', ') + '</div>');
      if (unit.reacted) lines.push('<div class="ex-row muted">Has reacted this turn.</div>');
    }
    const kws = new Set();
    if (d.keywords) d.keywords.forEach(k => kws.add(k));
    if (d.armour) kws.add('Armour');
    if (d.attacks) d.attacks.forEach(a => a.keywords.forEach(k => kws.add(k)));
    if (d.attacks && d.attacks.some(a => a.salvo)) kws.add('Salvo');
    for (const k of kws) if (C.KEYWORD_TEXT[k]) lines.push('<div class="ex-row"><b>' + esc(k) + '</b>: ' + esc(C.KEYWORD_TEXT[k]) + '</div>');
    if (d.type !== 'powerup') lines.push('<div class="ex-row muted">In the Support Zone it produces ' + d.energy.map(t => ENERGY[t].name).join(' or ') + ' energy.</div>');
    return lines.join('');
  }

  window.BCRender = { card, compact, supportTile, back, pip, pips, explain, esc, ENERGY, STATUS_ICON, tokenPips };
})();
