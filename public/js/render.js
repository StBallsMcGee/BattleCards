/* Battle Cards — card rendering (HTML strings). */
(function () {
  'use strict';
  const C = window.BCCards;

  const ENERGY = {
    M: { icon: '⚔', name: 'Martial' },
    A: { icon: '✦', name: 'Arcane' },
    T: { icon: '♞', name: 'Tactical' },
    S: { icon: '⚙', name: 'Scientific' },
    E: { icon: '🔍', name: 'Evidence' },
    P: { icon: '⬢', name: 'Pressure' },
    V: { icon: '◉', name: 'Void' },
    '*': { icon: '◆', name: 'Any' },
  };
  const STATUS_ICON = { Poisoned: '☠', Ablaze: '🔥', Blinded: '🙈', Confused: '💫', Bound: '⛓️' };
  const MARK_ICON = {
    untargetable: '🫥', taunt: '🎯', noReact: '🔇', guard: '🧱', undying: '♾️', weakened: '½', noAttack: '⛔', bonusDie: '🎲',
    plusDamage: '➕', unparryable: '👁️', grantParry: '🛡️', interveneAny: '↩', freeAttack: '🆓', canShiftNow: '⧉', ignoreShiftCond: '⧉',
    shiftOnKill: '⧉', regen: '💚',
  };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function pip(t, extra) {
    return '<span class="pip e-' + (t === '*' ? 'any' : t) + (extra ? ' ' + extra : '') + '" title="' + ENERGY[t].name + '">' + ENERGY[t].icon + '</span>';
  }
  function pips(cost) { return cost.length ? cost.map(t => pip(t)).join('') : '<span class="free">free</span>'; }

  function frameClass(d) {
    if (d.type === 'powerup') return 'e-power' + (d.set ? ' set-' + d.set : '');
    return 'e-' + d.energy[0] + (d.energy[1] ? ' e2-' + d.energy[1] : '') + (d.set ? ' set-' + d.set : '');
  }

  /** Card art: the generated illustration, with the emoji as a fallback if the image is missing. */
  function art(d) {
    return '<div class="c-art"><span class="c-emoji">' + d.art + '</span><img class="c-img" src="art/' + d.id + '.svg" alt="" loading="lazy" onerror="this.remove()"></div>';
  }

  function attackHTML(a, i, opts) {
    const kw = a.keywords.filter(k => k !== 'Counterattack' && k !== 'Intervention');
    if (a.salvo) kw.push('Salvo (' + a.salvo + ')');
    if (a.aoe) kw.push('hits all enemy Active units');
    const react = a.keywords.find(k => k === 'Counterattack' || k === 'Intervention');
    return '<div class="c-attack' + (opts && opts.highlightAttack === i ? ' hl' : '') + '">' +
      '<div class="c-atk-line"><span class="c-cost">' + pips(a.cost) + '</span><span class="c-atk-name">' + esc(a.name) + '</span>' +
      '<span class="c-dmg">' + C.damageText(a) + '</span></div>' +
      (react ? '<div class="c-react">↩ ' + react + '</div>' : '') +
      (kw.length ? '<div class="c-kw">' + kw.map(esc).join(' · ') + '</div>' : '') +
      (a.text ? '<div class="c-atext">' + esc(a.text) + '</div>' : '') +
      '</div>';
  }

  function unitKeywordLine(d) {
    const kws = d.keywords.filter(k => k !== 'Shift');
    const parts = kws.slice();
    if (d.armour) for (const t in d.armour) parts.push('Armour ' + ENERGY[t].icon + d.armour[t]);
    return parts.length ? '<div class="c-unitkw">' + parts.map(esc).join(' · ') + '</div>' : '';
  }

  function abilityText(ab) {
    if (ab.text) return ab.text;
    return C.KEYWORD_TEXT[ab.name] || ('Place 1 ' + C.TYPE_NAMES[ab.effect.token] + ' token on this unit.');
  }

  function typeline(d) {
    if (d.type === 'powerup') return 'Power Up' + (d.faction ? ' · ' + esc(d.faction) : '');
    let t = d.type === 'character' ? 'Character — ' + esc(d.baseName) : 'Fighter';
    if (d.stage) t += ' · Stage ' + d.stage;
    if (d.flipSide) t += ' · flip side';
    if (d.faction) t += ' · ' + esc(d.faction);
    return t;
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
      body = '<div class="c-typeline">' + typeline(d) + '</div><div class="c-body"><div class="c-text">' + esc(C.powerUpText(d)) + '</div>' +
        (d.flavor ? '<div class="c-flavor">' + esc(d.flavor) + '</div>' : '') + '</div>';
    } else {
      head = '<div class="c-head"><span class="c-name">' + esc(d.name) + '</span><span class="c-energy">' + pips(d.energy) + '</span>' +
        '<span class="c-hp">' + d.hp + '</span></div>';
      const lines = [unitKeywordLine(d)];
      if (d.threshold) lines.push('<div class="c-thresh">' + pip('V') + ' Void threshold ' + d.threshold + ' — Shifts when it holds ' + d.threshold + ' Void tokens.</div>');
      for (const ps of d.passives || []) lines.push('<div class="c-passive">◈ ' + esc(ps.text) + '</div>');
      for (const t of d.triggers || []) lines.push('<div class="c-trigger">✦ ' + esc(t.text) + '</div>');
      d.attacks.forEach((a, i) => lines.push(attackHTML(a, i, opts)));
      for (const ab of d.abilities) lines.push('<div class="c-ability"><span class="c-cost">' + pips(ab.cost) + '</span> <b>' + esc(ab.name) + '</b> — ' + esc(abilityText(ab)) + ' <i>(once per turn)</i></div>');
      if (d.shift) lines.push('<div class="c-shift"><b>Shift:</b> ' + esc(C.shiftText(d)) + '</div>');
      if (d.transform) lines.push('<div class="c-shift"><b>⟳ Flips</b> into ' + esc(C.byId[d.transform.into].name) + ' ' + esc(d.transform.condText) + '.</div>');
      if (w >= 200 && d.flavor) lines.push('<div class="c-flavor">' + esc(d.flavor) + '</div>');
      const textLen = lines.join('').replace(/<[^>]+>/g, '').length;
      body = '<div class="c-typeline">' + typeline(d) + '</div><div class="c-body' + (textLen > 330 ? ' denser' : textLen > 220 ? ' dense' : '') + '">' + lines.join('') + '</div>';
    }
    return '<div class="card full ' + frameClass(d) + ' t-' + d.type + ' ' + (opts.cls || '') + '"' + attrs + ' style="--w:' + w + 'px">' +
      '<div class="c-frame">' + head + art(d) + body + '</div>' +
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
      art(d) +
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
    for (const t of ['M', 'A', 'T', 'S', 'E', 'P', 'V']) if (tokens && tokens[t]) s += '<span class="tok e-' + t + '" title="' + tokens[t] + ' ' + ENERGY[t].name + ' token(s)">' + ENERGY[t].icon + (tokens[t] > 1 ? '<b>' + tokens[t] + '</b>' : '') + '</span>';
    return s;
  }

  function unitOverlay(u) {
    const d = C.byId[u.id];
    const max = d.hp + (u.hpBonus || 0);
    const left = max - u.damage;
    let s = '<div class="u-hpbar"><div class="u-hpfill" style="width:' + Math.max(0, Math.min(100, left / max * 100)) + '%"></div></div>';
    s += '<div class="u-hp' + (u.damage ? ' hurt' : '') + '">' + Math.max(0, left) + '</div>';
    if (u.damage) s += '<div class="u-dmg">−' + u.damage + '</div>';
    const toks = tokenPips(u.tokens);
    if (toks) s += '<div class="u-tokens' + (d.keywords.includes('Resonance') ? ' resonance' : '') + '">' + toks + '</div>';
    const icons = u.statuses.map(st => '<span title="' + st + '">' + STATUS_ICON[st] + '</span>')
      .concat((u.marks || []).filter(m => MARK_ICON[m.k]).map(m => '<span class="mk" title="' + esc(C.MARK_TEXT[m.k] || m.k) + '">' + MARK_ICON[m.k] + '</span>'));
    if (icons.length) s += '<div class="u-status">' + icons.join('') + '</div>';
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
      const max = d.hp + (unit.hpBonus || 0);
      lines.push('<div class="ex-state"><b>' + Math.max(0, max - unit.damage) + '/' + max + ' HP</b>' + (unit.damage ? ' · ' + unit.damage + ' damage' : '') + (unit.kills ? ' · ' + unit.kills + ' kill' + (unit.kills > 1 ? 's' : '') : '') + '</div>');
      for (const st of unit.statuses) lines.push('<div class="ex-row status">' + STATUS_ICON[st] + ' <b>' + st + '</b>: ' + esc(C.STATUS_TEXT[st]) + '</div>');
      for (const m of unit.marks || []) lines.push('<div class="ex-row">' + (MARK_ICON[m.k] || '•') + ' ' + esc(C.MARK_TEXT[m.k] || m.k) + '</div>');
      const t = tokenPips(unit.tokens);
      if (t) lines.push('<div class="ex-row">Tokens: ' + t + ' — ' + (d.keywords.includes('Resonance') ? '<b>Resonance:</b> any of your units may spend this unit\'s energy tokens. ' : 'Only this unit can spend its energy tokens (or units it shares Resonance with). ') + 'Evidence, Pressure and Void are counters, not energy.</div>');
      if (unit.voidGained) lines.push('<div class="ex-row">' + pip('V') + ' Void gained in total: ' + unit.voidGained + '</div>');
      for (const a of unit.attachments) lines.push('<div class="ex-row">' + C.byId[a.id].art + ' <b>' + esc(C.byId[a.id].name) + '</b>: ' + esc(C.powerUpText(C.byId[a.id])) + '</div>');
      if (unit.stack.length) lines.push('<div class="ex-row">⧉ Shifted from: ' + unit.stack.map(c => esc(C.byId[c.id].name)).join(', ') + '</div>');
      if (unit.reacted) lines.push('<div class="ex-row muted">Has reacted this turn.</div>');
    }
    const kws = new Set();
    if (d.keywords) d.keywords.forEach(k => kws.add(k));
    if (d.armour) kws.add('Armour');
    if (d.attacks) d.attacks.forEach(a => a.keywords.forEach(k => kws.add(k)));
    if (d.attacks && d.attacks.some(a => a.salvo)) kws.add('Salvo');
    const txt = JSON.stringify(d);
    for (const [k, code] of [['Evidence', "'E'"], ['Pressure', "'P'"], ['Void', "'V'"]]) if (txt.includes('"token":"' + code[1] + '"') || txt.includes(k)) kws.add(k);
    for (const k of kws) if (C.KEYWORD_TEXT[k]) lines.push('<div class="ex-row"><b>' + esc(k) + '</b>: ' + esc(C.KEYWORD_TEXT[k]) + '</div>');
    if (d.shift && d.shift.ontoOnly) lines.push('<div class="ex-row muted">A Shifted form: it can only enter the Arena by Shifting. You can still play it as energy and Shift it from your Support Zone later.</div>');
    if (d.type !== 'powerup') lines.push('<div class="ex-row muted">In the Support Zone it produces ' + d.energy.map(t => ENERGY[t].name).join(' or ') + ' energy.</div>');
    return lines.join('');
  }

  window.BCRender = { card, compact, supportTile, back, pip, pips, explain, esc, ENERGY, STATUS_ICON, MARK_ICON, tokenPips };
})();
