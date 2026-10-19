/*
 * Battle Cards — rules engine.
 *
 * The whole game runs as a generator (gameLoop). Whenever a player must make
 * a decision — their next action, or an interrupt such as spending energy
 * tokens, reacting, picking a unit for an effect, or a Veteran trigger — the
 * generator yields a `choice` and waits. `Game.submit(player, answer)`
 * validates the answer and resumes.
 *
 * Card abilities beyond the rulebook keywords are described as data in the
 * card database (see "Effect language" in cards.js) and interpreted here.
 *
 * Every visible change emits an event together with a snapshot of the state
 * at that moment, so the UI (or a remote client) can animate the game step
 * by step. `viewFor(state, player)` hides information that player must not see.
 *
 * Runs unchanged in the browser (window.BCEngine) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'));
  else root.BCEngine = factory(root.BCCards);
})(typeof self !== 'undefined' ? self : this, function (Cards) {
  'use strict';

  const TYPES = ['M', 'A', 'T', 'S'];
  /** Token kinds. Faction tokens — E (Evidence), P (Pressure), V (Void) — are counters that card effects use; they are not energy. */
  const TOKEN_KINDS = ['M', 'A', 'T', 'S', 'E', 'P', 'V'];
  const TOKEN_BASE = { M: 'M', A: 'A', T: 'T', S: 'S', E: null, P: null, V: null };
  const STATUS_KEYWORDS = { Poison: 'Poisoned', Burn: 'Ablaze', Blinding: 'Blinded', Confuse: 'Confused', Binding: 'Bound' };
  const HAND_LIMIT = 7;
  const FAVOUR_TO_WIN = 10;

  class GameOver extends Error {}

  // ───────────────────────── helpers ─────────────────────────

  function def(c) { return Cards.byId[c.id]; }
  function isUnitCard(c) { const d = c && !c.hidden && def(c); return !!d && (d.type === 'fighter' || d.type === 'character'); }
  function isCharacter(u) { return def(u).type === 'character'; }
  function hp(u) { return def(u).hp + (u.hpBonus || 0); }
  function left(u) { return hp(u) - u.damage; }
  function baseName(c) { const d = def(c); return d.baseName || d.name; }
  /** Shifted forms ("Shift onto … only") can only enter the Arena by Shifting. */
  function shiftOnly(c) { const d = def(c); return !!(d && d.shift && d.shift.ontoOnly); }

  function rand(state) {
    // mulberry32
    let t = (state.rng = (state.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function d6(state) {
    if (state.rigged && state.rigged.length) return state.rigged.shift();
    return 1 + Math.floor(rand(state) * 6);
  }
  function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(state) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function newUid(state) {
    // Random-looking ids so a card's uid never reveals its deck position.
    let s = '';
    for (let i = 0; i < 6; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(rand(state) * 32)];
    return s + (++state.uidCounter).toString(36);
  }
  function reassignUids(state, cards) { for (const c of cards) c.uid = newUid(state); }

  function emptyTokens() { return { M: 0, A: 0, T: 0, S: 0, E: 0, P: 0, V: 0 }; }
  function newUnit(card) {
    return { uid: card.uid, id: card.id, owner: card.owner, damage: 0, tokens: emptyTokens(),
      statuses: [], defeated: false, attachments: [], stack: [], used: {}, reacted: false, killer: null,
      marks: [], kills: 0, voidGained: 0, vTaken: 0, vDealt: 0, counters: {}, hpBonus: 0, flippedFrom: null };
  }
  function bareCard(c) { return { uid: c.uid, id: c.flippedFrom || c.id, owner: c.owner }; }

  function arenaUnits(P) { return P.active.concat(P.ready).filter(Boolean); }
  function allUnits(state) { return arenaUnits(state.players[0]).concat(arenaUnits(state.players[1])); }
  function activeUnits(P) { return P.active.filter(u => u && !u.defeated); }

  /** Finds a unit in any Arena slot: { u, owner, zone: 'active'|'ready', index }. */
  function locate(state, uid) {
    for (let p = 0; p < 2; p++) {
      const P = state.players[p];
      for (const zone of ['active', 'ready']) {
        const i = P[zone].findIndex(u => u && u.uid === uid);
        if (i >= 0) return { u: P[zone][i], owner: p, zone, index: i };
      }
    }
    return null;
  }
  function unitByUid(state, uid) { const l = locate(state, uid); return l ? l.u : null; }

  function hasMark(u, k) { return (u.marks || []).some(m => m.k === k); }
  function markData(u, k) { return (u.marks || []).filter(m => m.k === k); }
  function hasKeyword(u, kw) {
    if (def(u).keywords.includes(kw)) return true;
    if (kw === 'Parry' && hasMark(u, 'grantParry')) return true;
    return u.attachments.some(a => { const d = def(a); return d.effect && d.effect.grant === kw; });
  }
  function hasPassive(u, type) { return (def(u).passives || []).find(p => p.type === type); }
  function attackTypes(atk) { return [...new Set(atk.cost.filter(t => TYPES.includes(t)))]; }
  function pname(state, p) { return state.players[p].name; }
  function cname(c) { return def(c).name; }
  function totalTokens(u) { return TOKEN_KINDS.reduce((s, k) => s + (u.tokens[k] || 0), 0); }

  // ───────────────────────── events ─────────────────────────

  function snapshot(state) {
    const { events, ...rest } = state;
    return JSON.parse(JSON.stringify(rest));
  }
  function emit(state, ev) {
    ev.seq = ++state.eventSeq;
    ev.turn = state.turn;
    state.events.push({ ev, snap: state.noSnapshots ? null : snapshot(state) });
  }
  function log(state, text, extra) { emit(state, Object.assign({ type: 'log', text }, extra || {})); }

  function* ask(state, choice) {
    const answer = yield { choice };
    return answer;
  }

  // ───────────────────────── energy tokens ─────────────────────────

  /** Can unit `spender` use a token of this kind as energy / to negate damage / to boost a roll? */
  function usableKind(spender, k) {
    return !!TOKEN_BASE[k];
  }
  /** Units whose tokens `u` may spend: itself plus its controller's Resonance units in the Arena. */
  function tokenHolders(state, u) {
    const list = [u];
    for (const x of arenaUnits(state.players[u.owner])) {
      if (x !== u && !x.defeated && hasKeyword(x, 'Resonance')) list.push(x);
    }
    return list;
  }
  function kindsFor(spender, baseTypes) {
    return TOKEN_KINDS.filter(k => usableKind(spender, k) && (!baseTypes || baseTypes.includes(TOKEN_BASE[k])));
  }
  function availTokens(state, u, baseTypes) {
    const kinds = kindsFor(u, baseTypes);
    return tokenHolders(state, u).reduce((s, h) => s + kinds.reduce((t, k) => t + (h.tokens[k] || 0), 0), 0);
  }
  function noteSpent(state, owner, k, n) {
    const st = state.players[owner].stats;
    st.spent[k] = (st.spent[k] || 0) + n;
  }
  /** Spends n tokens (of the given base types, or any) usable by unit u. Own tokens and plain kinds first. */
  function spendTokens(state, u, n, baseTypes) {
    const spent = [];
    const kinds = kindsFor(u, baseTypes);
    for (const h of tokenHolders(state, u)) {
      while (n > 0) {
        let t = null;
        for (const x of kinds) {
          if (!(h.tokens[x] > 0)) continue;
          const plainX = TYPES.includes(x), plainT = t && TYPES.includes(t);
          if (!t || (plainX && !plainT) || (plainX === plainT && h.tokens[x] > h.tokens[t])) t = x;
        }
        if (!t) break;
        h.tokens[t]--;
        noteSpent(state, u.owner, t, 1);
        spent.push({ from: h.uid, type: t });
        n--;
      }
    }
    return spent;
  }
  /** Spends n tokens of one kind (e.g. Evidence) from u and its Resonance partners, for card effects. */
  function spendKind(state, u, k, n) {
    let done = 0;
    for (const h of tokenHolders(state, u)) {
      while (done < n && h.tokens[k] > 0) { h.tokens[k]--; done++; }
    }
    if (done) noteSpent(state, u.owner, k, done);
    return done;
  }
  function kindCount(state, u, k) { return tokenHolders(state, u).reduce((s, h) => s + (h.tokens[k] || 0), 0); }

  function addTokens(state, u, type, n) {
    if (n <= 0) return;
    u.tokens[type] = (u.tokens[type] || 0) + n;
    if (type === 'V') u.voidGained = (u.voidGained || 0) + n;
    if (type === 'P') state.players[u.owner].stats.pressure += n;
    emit(state, { type: 'tokens', unitUid: u.uid, token: type, delta: n,
      text: cname(u) + ' gains ' + n + ' ' + Cards.TOKEN_NAMES[type] + ' token' + (n > 1 ? 's' : '') + '.' });
  }

  /** Lets the owner of u discard matching tokens to negate damage. Returns the remaining damage. */
  function* negateWithTokens(state, u, amount, types, source) {
    if (amount <= 0) return amount;
    const avail = availTokens(state, u, types);
    if (avail <= 0) return amount;
    const ans = yield* ask(state, { kind: 'tokens', player: u.owner, purpose: 'negate', unitUid: u.uid,
      max: Math.min(avail, amount), amount, types, source });
    const n = ans.n | 0;
    if (n > 0) {
      spendTokens(state, u, n, types);
      emit(state, { type: 'negate', unitUid: u.uid, n,
        text: cname(u) + ' spends ' + n + ' token' + (n > 1 ? 's' : '') + ' to negate ' + n + ' damage.' });
    }
    return amount - n;
  }

  /** Offers the owner of u the chance to add +1 per token to a roll, when it would make it succeed. */
  function* boostRoll(state, u, roll, need, purpose) {
    if (roll >= need) return roll;
    const avail = availTokens(state, u, null);
    if (roll + avail < need) return roll;
    const ans = yield* ask(state, { kind: 'tokens', player: u.owner, purpose: 'roll', unitUid: u.uid,
      max: need - roll, roll, need, rollPurpose: purpose });
    const n = ans.n | 0;
    if (n > 0) {
      spendTokens(state, u, n, null);
      emit(state, { type: 'boost', unitUid: u.uid, n, roll: roll + n,
        text: cname(u) + ' spends ' + n + ' token' + (n > 1 ? 's' : '') + ': roll becomes ' + (roll + n) + '.' });
    }
    return roll + n;
  }

  // ───────────────────────── paying costs ─────────────────────────

  /**
   * Payment sources for player p. Support cards always; energy tokens only when
   * `unitUid` names the unit whose attack is being paid for.
   */
  function paymentSources(state, p, unitUid, excludeUid) {
    const P = state.players[p];
    const src = [];
    for (const s of P.support) {
      if (!s.tapped && s.uid !== excludeUid) src.push({ kind: 'support', uid: s.uid, types: def(s).energy.slice() });
    }
    if (unitUid) {
      const u = unitByUid(state, unitUid);
      if (u) for (const h of tokenHolders(state, u)) for (const k of kindsFor(u, null)) {
        for (let i = 0; i < h.tokens[k]; i++) src.push({ kind: 'token', from: h.uid, type: k, types: [TOKEN_BASE[k]] });
      }
    }
    return src;
  }

  function matchCost(cost, sources, prefer) {
    // Backtracking assignment of cost symbols to sources. Typed symbols first.
    const symbols = cost.slice().sort((a, b) => (a === '*') - (b === '*'));
    const used = new Array(sources.length).fill(false);
    const order = sources.map((s, i) => i).sort((a, b) => prefer(sources[a]) - prefer(sources[b]));
    const pick = [];
    function go(k) {
      if (k === symbols.length) return true;
      const sym = symbols[k];
      for (const i of order) {
        if (used[i]) continue;
        if (sym !== '*' && !sources[i].types.includes(sym)) continue;
        used[i] = true; pick.push(i);
        if (go(k + 1)) return true;
        used[i] = false; pick.pop();
      }
      return false;
    }
    return go(0) ? pick.map(i => sources[i]) : null;
  }

  function toPayment(picked) {
    const pay = { support: [], tokens: [] };
    for (const s of picked) {
      if (s.kind === 'support') pay.support.push(s.uid);
      else pay.tokens.push({ from: s.from, type: s.type });
    }
    return pay;
  }

  /** Finds a payment automatically. opts.tokens: 'last' (default) | 'first' | 'never'. */
  function autoPay(state, p, cost, unitUid, opts) {
    opts = opts || {};
    if (!cost.length) return { support: [], tokens: [] };
    const tokensMode = opts.tokens || 'last';
    const sources = paymentSources(state, p, tokensMode === 'never' ? null : unitUid, opts.exclude);
    const prefer = s => {
      if (s.kind === 'token') return (tokensMode === 'first' ? -1 : 10) + (TYPES.includes(s.type) ? 0 : 1);
      return s.types.length > 1 ? 1 : 0;
    };
    const picked = matchCost(cost, sources, prefer);
    return picked ? toPayment(picked) : null;
  }

  function checkPayment(state, p, cost, unitUid, pay, excludeUid) {
    if (!pay || !Array.isArray(pay.support) || !Array.isArray(pay.tokens)) return 'Invalid payment.';
    if (pay.support.length + pay.tokens.length !== cost.length) return 'Payment must cover the cost exactly (' + cost.length + ' energy).';
    if (pay.tokens.length && !unitUid) return 'Energy tokens can only pay for attacks.';
    const P = state.players[p];
    const sources = [];
    const seen = new Set();
    for (const uid of pay.support) {
      if (seen.has(uid)) return 'A card can only be tapped once.';
      seen.add(uid);
      const s = P.support.find(x => x.uid === uid);
      if (!s || uid === excludeUid) return 'That card is not in your Support Zone.';
      if (s.tapped) return 'That Support card is already tapped.';
      sources.push({ types: def(s).energy });
    }
    if (pay.tokens.length) {
      const u = unitByUid(state, unitUid);
      if (!u) return 'Unknown unit.';
      const holders = tokenHolders(state, u);
      const need = {};
      for (const t of pay.tokens) {
        const h = holders.find(x => x.uid === t.from);
        if (!h || !usableKind(u, t.type)) return 'Those tokens cannot be spent on this attack.';
        const k = t.from + t.type;
        need[k] = (need[k] || 0) + 1;
        if (need[k] > h.tokens[t.type]) return 'Not enough tokens.';
        sources.push({ types: [TOKEN_BASE[t.type]] });
      }
    }
    return matchCost(cost, sources, () => 0) ? null : 'Those sources do not produce the right energy types.';
  }

  function applyPayment(state, p, pay) {
    const P = state.players[p];
    for (const uid of pay.support) { const s = P.support.find(x => x.uid === uid); s.tapped = true; }
    for (const t of pay.tokens) { const h = unitByUid(state, t.from); h.tokens[t.type]--; noteSpent(state, p, t.type, 1); }
    if (pay.support.length || pay.tokens.length) {
      const toks = pay.tokens.map(t => Cards.TOKEN_NAMES[t.type] + ' token from ' + cname(unitByUid(state, t.from)));
      emit(state, { type: 'pay', player: p, support: pay.support.slice(), tokens: pay.tokens.slice(),
        text: toks.length ? pname(state, p) + ' spends ' + toks.join(', ') + '.' : undefined });
    }
  }
  function refundPayment(state, p, pay) {
    const P = state.players[p];
    for (const uid of pay.support) { const s = P.support.find(x => x.uid === uid); if (s) s.tapped = false; }
    for (const t of pay.tokens) { const h = unitByUid(state, t.from); if (h) { h.tokens[t.type]++; noteSpent(state, p, t.type, -1); } }
  }
  function canPay(state, p, cost, unitUid, excludeUid) {
    return !!autoPay(state, p, cost, unitUid, { exclude: excludeUid });
  }
  function attackCost(state, u, atk) { return hasMark(u, 'freeAttack') ? [] : atk.cost; }

  // ───────────────────────── marks (temporary effects) ─────────────────────────

  /** dur: 'turn' = until the end of this turn; 'next' = until the start of the applier's next turn; 'next2' = through the applier's next turn. */
  function untilFor(state, applier, dur) {
    if (dur === 'turn') return state.turn + 1;
    const mine = state.active === applier;
    if (dur === 'next') return state.turn + (mine ? 2 : 1);
    if (dur === 'next2') return state.turn + (mine ? 3 : 2);
    return Infinity;
  }
  function addMark(state, u, k, dur, applier, data) {
    u.marks = (u.marks || []).filter(m => m.k !== k);
    u.marks.push(Object.assign({ k, until: untilFor(state, applier, dur) }, data || {}));
  }
  function expireMarks(state) {
    for (const u of allUnits(state)) u.marks = (u.marks || []).filter(m => state.turn < m.until);
    for (const P of state.players) P.flags = (P.flags || []).filter(f => state.turn < f.until);
  }

  // ───────────────────────── targeting ─────────────────────────

  function isTargetable(state, u) {
    if (!u || u.defeated) return false;
    if (hasMark(u, 'untargetable')) return false;
    for (const ps of def(u).passives || []) {
      if (ps.type === 'untargetableWhile' && cond(state, ps.cond, { p: u.owner, self: u })) return false;
    }
    return true;
  }

  // ───────────────────────── conditions ─────────────────────────

  function sovereignOf(state, p) { return arenaUnits(state.players[p]).find(u => !u.defeated && def(u).baseName === 'Sovereign'); }
  function stageOf(state, p) {
    const s = sovereignOf(state, p);
    return s ? (def(s).stage || 1) : 0;
  }
  function arenaKindCount(state, k) { return allUnits(state).reduce((s, u) => s + (u.tokens[k] || 0), 0); }

  /** Evaluates a condition object from card data. ctx: { p, self, target, onto, killed, isReaction, dealt }. */
  function cond(state, c, ctx) {
    if (!c) return true;
    if (Array.isArray(c)) return c.every(x => cond(state, x, ctx));
    const P = state.players[ctx.p], O = state.players[1 - ctx.p];
    const subject = ctx.onto || ctx.self;
    switch (c.k) {
      case 'all': return c.of.every(x => cond(state, x, ctx));
      case 'any': return c.of.some(x => cond(state, x, ctx));
      case 'favour': return P.favour >= c.min;
      case 'oppFavour': return O.favour >= c.min;
      case 'targetDamage': return !!ctx.onto && ctx.onto.damage >= c.min;
      case 'targetTokens': return !!ctx.onto && (c.token ? (ctx.onto.tokens[c.token] || 0) : totalTokens(ctx.onto)) >= c.min;
      case 'selfTokens': return !!subject && (c.token ? (subject.tokens[c.token] || 0) : totalTokens(subject)) >= c.min;
      case 'hitTokens': return !!ctx.target && (ctx.target.tokens[c.token] || 0) >= c.min;
      case 'arenaTokens': return arenaKindCount(state, c.token) >= c.min;
      case 'selfKills': return !!subject && (subject.kills || 0) >= c.min;
      case 'voidGained': return !!subject && (subject.voidGained || 0) >= c.min;
      case 'hpAtMost': return !!subject && left(subject) <= c.n;
      case 'counter': return !!subject && ((subject.counters || {})[c.name] || 0) >= c.min;
      case 'spent': return (P.stats.spent[c.token] || 0) >= c.min;
      case 'pressure': return P.stats.pressure >= c.min;
      case 'enemyKills': return P.stats.enemyKills >= c.min;
      case 'allyDeaths': return P.stats.allyDeaths >= c.min;
      case 'stage': return stageOf(state, ctx.p) >= c.min;
      case 'twoCharsActive': return activeUnits(P).filter(isCharacter).length >= 2;
      case 'charActive': return activeUnits(P).some(isCharacter);
      case 'friendlyOtherActive': return activeUnits(P).some(u => u !== ctx.self);
      case 'friendlyFighterActive': return activeUnits(P).some(u => u !== ctx.self && !isCharacter(u));
      case 'inArena': return arenaUnits(P).some(u => !u.defeated && baseName(u) === c.base);
      case 'bothAttacked': return state.turnInfo.attacked[ctx.p].length >= 2;
      case 'killed': return !!ctx.killed;
      case 'isReaction': return !!ctx.isReaction;
      case 'targetIsCharacter': return !!ctx.target && !!ctx.target.id && isCharacter(ctx.target);
      case 'targetStatus': return !!ctx.target && c.statuses.some(s => ctx.target.statuses.includes(s));
    }
    return false;
  }

  // ───────────────────────── winning & Favour ─────────────────────────

  function endGame(state, winner, reason) {
    state.winner = winner;
    state.winReason = reason;
    state.phase = 'gameover';
    state.pending = null;
    emit(state, { type: 'gameover', winner, reason,
      text: winner === 'draw' ? 'The game is a draw: ' + reason : pname(state, winner) + ' wins! ' + reason });
    throw new GameOver();
  }

  function checkFavourWin(state) {
    const a = state.players[0].favour >= FAVOUR_TO_WIN, b = state.players[1].favour >= FAVOUR_TO_WIN;
    if (a && b) endGame(state, 'draw', 'Both players reached 10 Favour at the same time.');
    if (a) endGame(state, 0, pname(state, 0) + ' reached 10 Favour.');
    if (b) endGame(state, 1, pname(state, 1) + ' reached 10 Favour.');
  }

  /** Applies a batch of simultaneous Favour gains, then lets Veterans trigger. */
  function* gainFavour(state, gains) {
    gains = gains.filter(g => {
      if ((state.players[g.player].flags || []).some(f => f.k === 'noFavour')) {
        log(state, pname(state, g.player) + ' cannot gain Favour this turn (' + g.reason + ').');
        return false;
      }
      return true;
    });
    if (!gains.length) return;
    for (const g of gains) {
      state.players[g.player].favour += g.n;
      emit(state, { type: 'favour', player: g.player, n: g.n, reason: g.reason,
        text: pname(state, g.player) + ' gains ' + g.n + ' Favour (' + g.reason + ').' });
    }
    checkFavourWin(state);
    for (const g of gains) yield* veteranTriggers(state, 1 - g.player);
  }
  function* gain(state, player, reason, n) { yield* gainFavour(state, [{ player, n: n || 1, reason }]); }

  function* veteranTriggers(state, q) {
    const Q = state.players[q];
    for (const s of Q.support.slice()) {
      if (!def(s).keywords.includes('Veteran') || shiftOnly(s)) continue;
      const slots = emptySlots(Q.ready);
      if (!slots.length) return;
      if (!Q.support.includes(s)) continue;
      const ans = yield* ask(state, { kind: 'veteran', player: q, cardUid: s.uid, slots });
      if (ans.slot >= 0) {
        Q.support.splice(Q.support.indexOf(s), 1);
        const u = newUnit(s);
        Q.ready[ans.slot] = u;
        emit(state, { type: 'move', uid: s.uid, text: 'Veteran! ' + cname(s) + ' leaves the Support Zone and enters ' + pname(state, q) + "'s Ready Zone." });
        yield* fire(state, 'enter', u, {});
      }
    }
  }

  function* markDefeated(state, u, killer) {
    if (u.defeated) return;
    u.defeated = true;
    u.killer = killer;
    const loc = locate(state, u.uid);
    emit(state, { type: 'defeated', unitUid: u.uid, text: cname(u) + ' is Defeated!' });
    if (loc && loc.zone === 'active') {
      const list = state.turnInfo.defeatedActive[u.owner];
      if (!list.includes(u.uid)) list.push(u.uid);
      if (list.length >= 2 && !state.turnInfo.bothAwarded[u.owner]) {
        state.turnInfo.bothAwarded[u.owner] = true;
        yield* gain(state, 1 - u.owner, 'both opposing Active units Defeated this turn');
      }
    }
  }
  function* checkDefeat(state, u, killer) {
    if (!u.defeated && u.damage >= hp(u)) yield* markDefeated(state, u, killer);
  }

  function drawCards(state, p, n) {
    const P = state.players[p];
    for (let i = 0; i < n; i++) {
      if (!P.deck.length) endGame(state, 1 - p, pname(state, p) + ' had to draw from an empty deck.');
      P.hand.push(P.deck.shift());
    }
    if (n > 0) emit(state, { type: 'draw', player: p, n, text: pname(state, p) + ' draws ' + n + ' card' + (n > 1 ? 's' : '') + '.' });
  }

  // ───────────────────────── damage ─────────────────────────

  function killerInfo(u) { return { uid: u.uid, owner: u.owner, isCharacter: isCharacter(u), name: cname(u) }; }

  /** Applies damage that has already been through defences. source: the unit responsible (or null). */
  function* applyDamage(state, u, n, types, source, fromAttack) {
    if (n <= 0) return 0;
    if (hasMark(u, 'undying') && u.damage + n >= hp(u)) {
      n = Math.max(0, hp(u) - 1 - u.damage);
      log(state, cname(u) + ' cannot be killed right now!', { kind: 'undying', unitUid: u.uid });
      if (n <= 0) return 0;
    }
    u.damage += n;
    emit(state, { type: 'damage', unitUid: u.uid, n, types, text: cname(u) + ' takes ' + n + ' damage (' + u.damage + '/' + hp(u) + ').' });
    // Void Resonance: Voidborn units collect Void tokens from damage taken and dealt.
    if (hasKeyword(u, 'Voidborn') && !u.defeated) {
      u.vTaken = (u.vTaken || 0) + n;
      if (u.vTaken >= 3) { const g = Math.floor(u.vTaken / 3); u.vTaken -= g * 3; addTokens(state, u, 'V', g); }
    }
    if (source && source.owner !== u.owner && hasKeyword(source, 'Voidborn') && locate(state, source.uid)) {
      source.vDealt = (source.vDealt || 0) + n;
      if (source.vDealt >= 4) { const g = Math.floor(source.vDealt / 4); source.vDealt -= g * 4; addTokens(state, source, 'V', g); }
    }
    if (source && source.owner !== u.owner && fromAttack) yield* fire(state, 'damaged', u, { attacker: source });
    for (const x of arenaUnits(state.players[1 - u.owner])) if (!x.defeated) yield* fire(state, 'enemyDamaged', x, { target: u });
    return n;
  }

  /** Damage from a card effect (not an attack): no Parry, no reactions, no token negation. */
  function* effectDamage(state, u, n, types, source) {
    if (!u || u.defeated || n <= 0) return 0;
    n = passiveReduce(state, u, n);
    const dealt = yield* applyDamage(state, u, n, types || ['A'], source, false);
    yield* checkDefeat(state, u, source && source.owner !== u.owner ? killerInfo(source) : null);
    return dealt;
  }

  function passiveReduce(state, u, n) {
    const ps = hasPassive(u, 'reducePerToken');
    if (ps && n > 0) {
      const red = Math.min(ps.max || 99, Math.floor((u.tokens[ps.token] || 0) / (ps.per || 1)));
      if (red > 0) { log(state, cname(u) + ' shrugs off ' + Math.min(red, n) + ' damage.'); n = Math.max(0, n - red); }
    }
    return n;
  }

  // ───────────────────────── triggers & effects ─────────────────────────

  /** Runs every trigger of unit u listening for `on`. */
  function* fire(state, on, u, extra) {
    if (!u) return;
    for (const t of def(u).triggers || []) {
      if (t.on !== on) continue;
      const ctx = Object.assign({ p: u.owner, self: u }, extra || {});
      if (!cond(state, t.cond, ctx)) continue;
      emit(state, { type: 'trigger', unitUid: locate(state, u.uid) ? u.uid : null, text: '✦ ' + cname(u) + ': ' + t.text });
      yield* runEffects(state, t.effects, ctx);
    }
  }

  /** Resolves a target selector from card data into a list of units (may ask the player). */
  function* targets(state, to, ctx, prompt) {
    const P = state.players[ctx.p], O = state.players[1 - ctx.p];
    const live = xs => xs.filter(u => u && !u.defeated);
    const pick = function* (options, optional) {
      options = options.filter(Boolean);
      if (!options.length) return [];
      const ans = yield* ask(state, { kind: 'pick', player: ctx.p, prompt: prompt || 'Choose a unit', optional: !!optional,
        options: options.map(u => ({ uid: u.uid, label: cname(u) + (u.owner === ctx.p ? '' : ' (enemy)') })) });
      const u = options.find(x => x.uid === ans.uid);
      return u ? [u] : [];
    };
    const random = xs => xs.length ? [xs[Math.floor(rand(state) * xs.length)]] : [];
    switch (to) {
      case 'self': return ctx.self && locate(state, ctx.self.uid) ? [ctx.self] : [];
      case 'target': return ctx.target && locate(state, ctx.target.uid) ? [ctx.target] : [];
      case 'attacker': return ctx.attacker && locate(state, ctx.attacker.uid) ? [ctx.attacker] : [];
      case 'sovereign': { const s = sovereignOf(state, ctx.p); return s ? [s] : []; }
      case 'allFriendly': return live(arenaUnits(P));
      case 'otherFriendly': return live(arenaUnits(P)).filter(u => u !== ctx.self);
      case 'otherFriendlyActive': return activeUnits(P).filter(u => u !== ctx.self);
      case 'friendlyCharsActive': return activeUnits(P).filter(isCharacter);
      case 'allEnemies': return live(arenaUnits(O));
      case 'enemyActive': return activeUnits(O);
      case 'otherEnemyActive': return activeUnits(O).filter(u => u !== ctx.target);
      case 'allUnits': return live(allUnits(state));
      case 'randomEnemyActive': return random(activeUnits(O));
      case 'randomEnemy': return random(live(arenaUnits(O)));
      case 'randomOtherFriendly': return random(live(arenaUnits(P)).filter(u => u !== ctx.self));
      case 'pickFriendly': return yield* pick(live(arenaUnits(P)));
      case 'pickOtherFriendly': return yield* pick(live(arenaUnits(P)).filter(u => u !== ctx.self));
      case 'pickEnemy': return yield* pick(live(arenaUnits(O)).filter(u => isTargetable(state, u)));
      case 'pickEnemyActive': return yield* pick(activeUnits(O).filter(u => isTargetable(state, u)));
      case 'pickAny': return yield* pick(live(allUnits(state)).filter(u => u.owner === ctx.p || isTargetable(state, u)));
      case 'pickReadyFriendly': return yield* pick(live(P.ready));
      case 'ablazeEnemies': return live(arenaUnits(O)).filter(u => u.statuses.includes('Ablaze'));
      case 'enemyMostE': { const xs = live(arenaUnits(O)).filter(u => u.tokens.E > 0).sort((a, b) => b.tokens.E - a.tokens.E); return xs.slice(0, 1); }
    }
    if (to && to.startsWith('named:')) return live(arenaUnits(P)).filter(u => baseName(u) === to.slice(6)).slice(0, 1);
    return [];
  }

  function* runEffects(state, effects, ctx) {
    for (const e of effects || []) {
      if (state.winner != null) return;
      if (e.if && !cond(state, e.if, ctx)) continue;
      yield* runEffect(state, e, ctx);
    }
  }

  function* runEffect(state, e, ctx) {
    const P = state.players[ctx.p], O = state.players[1 - ctx.p];
    const src = ctx.self && locate(state, ctx.self.uid) ? ctx.self : null;
    switch (e.do) {
      case 'tokens': {
        let token = e.token;
        if (token === 'choose') {
          const ans = yield* ask(state, { kind: 'option', player: ctx.p, prompt: 'Choose an energy type', options: TYPES.map(t => Cards.TYPE_NAMES[t]) });
          token = TYPES[ans.index];
        }
        const n = e.nIf && cond(state, e.nIf.cond, ctx) ? e.nIf.n : e.n;
        const us = yield* targets(state, e.to, ctx, e.prompt || 'Place ' + (Cards.TOKEN_NAMES[token] || '') + ' tokens on…');
        if (e.to === 'sovereign' && !us.length && token === 'P') {
          P.stats.pressure += n;
          log(state, 'Sovereign is not in the Arena, but the Pressure still builds (' + P.stats.pressure + ').');
        }
        for (const u of us) {
          if (n === 'double') {
            let budget = e.max || 99;
            for (const k of TOKEN_KINDS) {
              const add = Math.min(u.tokens[k], budget);
              if ((!e.only || e.only === k) && add > 0) { addTokens(state, u, k, add); budget -= add; }
            }
          } else addTokens(state, u, token, n);
        }
        return;
      }
      case 'distributeTokens': {
        const us = yield* targets(state, e.to, ctx);
        if (!us.length) return;
        for (let i = 0; i < e.n; i++) addTokens(state, us[i % us.length], e.token, 1);
        return;
      }
      case 'removeTokens': {
        const us = yield* targets(state, e.to, ctx, e.prompt);
        for (const u of us) {
          let removed = 0;
          for (const k of e.token === 'all' ? TOKEN_KINDS : [e.token]) {
            const n = e.n ? Math.min(e.n, u.tokens[k]) : u.tokens[k];
            u.tokens[k] -= n;
            removed += n;
          }
          if (!removed) { log(state, cname(u) + ' has no tokens to remove.'); continue; }
          if (e.token === 'E') noteSpent(state, ctx.p, 'E', removed);
          emit(state, { type: 'tokens', unitUid: u.uid, token: e.token === 'all' ? 'M' : e.token, delta: -removed,
            text: cname(u) + ' loses ' + removed + ' ' + (e.token === 'all' ? '' : Cards.TOKEN_NAMES[e.token] + ' ') + 'token' + (removed > 1 ? 's' : '') + '.' });
          if (e.moveTo) {
            const dest = yield* targets(state, e.moveTo, ctx, 'Move the tokens to…');
            if (dest[0]) addTokens(state, dest[0], e.token, removed);
          }
          if (e.damagePer) yield* effectDamage(state, u, removed * e.damagePer, ['A'], src);
        }
        return;
      }
      case 'moveToken': {
        const holders = allUnits(state).filter(u => !u.defeated && u.tokens[e.token] > 0);
        if (!holders.length) { log(state, 'There are no ' + Cards.TOKEN_NAMES[e.token] + ' tokens to move.'); return; }
        const a1 = yield* ask(state, { kind: 'pick', player: ctx.p, prompt: 'Take an ' + Cards.TOKEN_NAMES[e.token] + ' token from…',
          options: holders.map(u => ({ uid: u.uid, label: cname(u) + (u.owner === ctx.p ? '' : ' (enemy)') })) });
        const s = holders.find(u => u.uid === a1.uid);
        const dests = allUnits(state).filter(u => !u.defeated && u !== s);
        if (!s || !dests.length) return;
        const a2 = yield* ask(state, { kind: 'pick', player: ctx.p, prompt: '…and move it to',
          options: dests.map(u => ({ uid: u.uid, label: cname(u) + (u.owner === ctx.p ? '' : ' (enemy)') })) });
        const d = dests.find(u => u.uid === a2.uid);
        if (!d) return;
        s.tokens[e.token]--;
        addTokens(state, d, e.token, 1);
        return;
      }
      case 'damage': {
        const us = yield* targets(state, e.to, ctx, e.prompt || 'Deal ' + e.n + ' damage to…');
        for (const u of us) yield* effectDamage(state, u, e.n, e.types, src);
        return;
      }
      case 'voidVolley': {
        for (const u of arenaUnits(P).filter(x => !x.defeated && x.tokens.V >= 2)) {
          const t = (yield* targets(state, 'randomEnemyActive', ctx))[0];
          if (!t) return;
          log(state, cname(u) + ' lashes out at ' + cname(t) + '.');
          yield* effectDamage(state, t, e.n, ['A'], u);
        }
        return;
      }
      case 'contaminateCheck': {
        for (const u of arenaUnits(O).filter(x => !x.defeated)) if (u.tokens.V >= left(u)) yield* effectDamage(state, u, e.n, ['A'], src);
        return;
      }
      case 'heal': {
        const us = yield* targets(state, e.to, ctx, e.prompt || 'Heal…');
        for (const u of us) {
          let n = e.n === 'd6' ? d6(state) : e.n;
          n = Math.min(n, u.damage);
          u.damage -= n;
          emit(state, { type: 'heal', unitUid: u.uid, n, text: cname(u) + ' recovers ' + n + ' damage.' });
        }
        return;
      }
      case 'hpBonus': {
        for (const u of yield* targets(state, e.to, ctx)) { u.hpBonus = (u.hpBonus || 0) + e.n; log(state, cname(u) + ' gains +' + e.n + ' HP.'); }
        return;
      }
      case 'status': {
        const us = yield* targets(state, e.to, ctx, e.prompt);
        for (const u of us) {
          if (u.statuses.includes(e.status)) continue;
          u.statuses.push(e.status);
          emit(state, { type: 'status', unitUid: u.uid, status: e.status, text: cname(u) + ' is now ' + e.status + '!' });
        }
        return;
      }
      case 'chooseStatus': {
        const us = yield* targets(state, e.to, ctx);
        if (!us.length) return;
        const ans = yield* ask(state, { kind: 'option', player: ctx.p, prompt: 'Choose a status for ' + cname(us[0]), options: e.options });
        yield* runEffect(state, { do: 'status', status: e.options[ans.index], to: 'target' }, Object.assign({}, ctx, { target: us[0] }));
        return;
      }
      case 'cleanse': {
        for (const u of yield* targets(state, e.to, ctx)) {
          const before = u.statuses.length;
          u.statuses = e.statuses ? u.statuses.filter(s => !e.statuses.includes(s)) : [];
          if (u.statuses.length !== before) log(state, cname(u) + ' is cleansed.', { kind: 'cleanse', unitUid: u.uid });
        }
        return;
      }
      case 'mark': {
        for (const u of yield* targets(state, e.to, ctx, e.prompt)) {
          addMark(state, u, e.mark, e.dur || 'next', ctx.p, e.data);
          emit(state, { type: 'mark', unitUid: u.uid, mark: e.mark, text: cname(u) + ': ' + (Cards.MARK_TEXT[e.mark] || e.mark) + '.' });
        }
        return;
      }
      case 'flag': {
        const who = e.who === 'opponent' ? O : P;
        who.flags = (who.flags || []).filter(f => f.k !== e.flag);
        who.flags.push({ k: e.flag, until: untilFor(state, ctx.p, e.dur || 'turn') });
        log(state, e.text || e.flag);
        return;
      }
      case 'draw': drawCards(state, ctx.p, e.nIf && cond(state, e.nIf.cond, ctx) ? e.nIf.n : e.n); return;
      case 'favour': yield* gain(state, ctx.p, e.reason || (src ? cname(src) : 'card effect'), e.n || 1); return;
      case 'counter': if (src) src.counters[e.name] = (src.counters[e.name] || 0) + 1; return;
      case 'destroy': {
        for (const u of yield* targets(state, e.to, ctx)) {
          u.noCredit = true;
          if (!u.defeated) { u.damage = Math.max(u.damage, hp(u)); yield* markDefeated(state, u, null); }
        }
        return;
      }
      case 'recall': {
        const i = P.grave.findIndex(x => x.uid === (ctx.target && ctx.target.uid));
        const slot = emptySlots(P.ready)[0];
        if (i < 0 || slot == null) { log(state, 'Nothing could be recalled.'); return; }
        const card = P.grave.splice(i, 1)[0];
        const u = newUnit(card);
        u.damage = Math.ceil(hp(u) / 2);
        P.ready[slot] = u;
        addMark(state, u, 'noAttack', 'turn', ctx.p);
        emit(state, { type: 'move', uid: u.uid, text: cname(u) + ' returns through the portal at half health.' });
        yield* fire(state, 'enter', u, {});
        return;
      }
      case 'fromSupport': {
        const s = P.support.find(x => x.uid === (ctx.target && ctx.target.uid));
        if (!s) return;
        let zone = 'ready';
        if ((e.activeIf && cond(state, e.activeIf, ctx) && emptySlots(P.active).length) || !emptySlots(P.ready).length) zone = 'active';
        const slot = emptySlots(P[zone])[0];
        if (slot == null) { log(state, 'No empty slot.'); return; }
        P.support.splice(P.support.indexOf(s), 1);
        const u = newUnit(bareCard(s));
        P[zone][slot] = u;
        emit(state, { type: 'move', uid: s.uid, text: cname(s) + ' leaves the Support Zone and enters the ' + (zone === 'active' ? 'Active' : 'Ready') + ' Zone.' });
        yield* fire(state, 'enter', u, {});
        return;
      }
      case 'toReady': {
        const t = ctx.target;
        const slot = emptySlots(P.ready)[0];
        if (!t || slot == null) return;
        const sIdx = P.support.findIndex(x => x.uid === t.uid);
        if (sIdx >= 0) {
          const s = P.support.splice(sIdx, 1)[0];
          P.ready[slot] = newUnit(bareCard(s));
          emit(state, { type: 'move', uid: s.uid, text: cname(s) + ' moves from the Support Zone to the Ready Zone.' });
          yield* fire(state, 'enter', P.ready[slot], {});
        } else {
          const l = locate(state, t.uid);
          if (l && l.zone === 'active') retreatUnit(state, ctx.p, l, slot);
        }
        return;
      }
      case 'toActive': {
        const us = e.to ? yield* targets(state, e.to, ctx, 'Move which unit into the Active Zone?') : [ctx.target];
        for (const u of us) {
          const l = u && locate(state, u.uid);
          const slot = emptySlots(P.active)[0];
          if (!l || l.zone !== 'ready' || slot == null || u.defeated) continue;
          P.ready[l.index] = null;
          P.active[slot] = u;
          emit(state, { type: 'move', uid: u.uid, text: cname(u) + ' steps into the Active Zone.' });
        }
        return;
      }
    }
  }

  // ───────────────────────── combat ─────────────────────────

  function* rollStatuses(state, A) {
    for (const st of A.statuses.slice()) {
      let r = d6(state);
      emit(state, { type: 'roll', unitUid: A.uid, dice: [r], need: 4, purpose: 'Shake off ' + st,
        text: cname(A) + ' rolls ' + r + ' to remove ' + st + '.' });
      r = yield* boostRoll(state, A, r, 4, 'remove ' + st);
      if (r >= 4) {
        A.statuses.splice(A.statuses.indexOf(st), 1);
        emit(state, { type: 'status', unitUid: A.uid, status: st, removed: true, text: cname(A) + ' is no longer ' + st + '.' });
      }
    }
  }

  /** Damage modifiers that depend on the unit being hit. */
  function perTargetDamage(state, A, atk, T, base, extraDice) {
    let dmg = base;
    for (const m of atk.mods || []) {
      if (m.type === 'targetStatusDice' && T.statuses.includes(m.status)) dmg += extraDice[m.status] || 0;
      if (m.type === 'ifTargetTokens' && (T.tokens[m.token] || 0) >= (m.min || 1)) dmg *= m.mult;
      if (m.type === 'vsStatusMult' && m.statuses.some(s => T.statuses.includes(s))) dmg *= m.mult;
      if (m.type === 'vsStatusAdd' && m.statuses.some(s => T.statuses.includes(s))) dmg += m.add;
    }
    return dmg;
  }

  function* defend(state, A, atk, T, dmg) {
    const kws = atk.keywords, types = attackTypes(atk);
    if (dmg > 0 && def(T).armour) {
      let red = 0;
      for (const t of types) red = Math.max(red, def(T).armour[t] || 0);
      if (red > 0) {
        dmg = Math.max(0, dmg - red);
        log(state, cname(T) + "'s armour reduces the damage by " + red + '.', { kind: 'armour', unitUid: T.uid });
      }
    }
    dmg = passiveReduce(state, T, dmg);
    if (dmg > 0 && hasKeyword(T, 'Parry') && !kws.includes('Long Ranged') && !hasMark(A, 'unparryable')) {
      let r = d6(state);
      emit(state, { type: 'roll', unitUid: T.uid, dice: [r], need: 5, purpose: 'Parry', text: cname(T) + ' rolls ' + r + ' to Parry.' });
      r = yield* boostRoll(state, T, r, 5, 'Parry');
      if (r >= 5) {
        dmg = Math.floor(dmg / 2);
        emit(state, { type: 'parry', unitUid: T.uid, text: 'Parried! Damage halved to ' + dmg + '.' });
        yield* fire(state, 'parried', T, { attacker: A });
      }
    }
    return yield* negateWithTokens(state, T, dmg, types, 'attack');
  }

  function* resolveAttack(state, spec) {
    const aLoc = locate(state, spec.attackerUid);
    const A = aLoc && aLoc.u;
    if (!A || A.defeated || aLoc.zone !== 'active') {
      log(state, 'The attack fizzles: the attacker can no longer attack.', { kind: 'fizzle' });
      return;
    }
    const atk = def(A).attacks[spec.attackIndex];
    const tLoc = locate(state, spec.targetUid);
    let T = tLoc && tLoc.u;
    if (!T || T.defeated || tLoc.zone !== 'active') {
      log(state, cname(A) + "'s " + atk.name + ' has no effect: its target is already Defeated.', { kind: 'fizzle' });
      return;
    }
    if (!spec.reaction) {
      const att = state.turnInfo.attacked[A.owner];
      if (!att.includes(A.uid)) att.push(A.uid);
    }
    const kws = atk.keywords;
    const types = attackTypes(atk);
    emit(state, { type: 'attack', attackerUid: A.uid, targetUid: T.uid, attack: atk.name, reaction: !!spec.reaction,
      text: (spec.reaction ? '↩ ' + spec.reaction + ': ' : '') + cname(A) + ' uses ' + atk.name + ' on ' + cname(T) + '.' });

    // Guards take hits meant for the units they protect.
    for (const G of activeUnits(state.players[T.owner])) {
      if (G === T) continue;
      const g = markData(G, 'guard')[0];
      if (g && (g.protect === 'others' || (g.protect === 'sovereign' && def(T).baseName === 'Sovereign'))) {
        log(state, cname(G) + ' steps in front of ' + cname(T) + '!', { kind: 'guard' });
        T = G;
        break;
      }
    }

    // 1. Status rolls
    yield* rollStatuses(state, A);
    if (A.statuses.includes('Confused')) {
      const r = d6(state);
      let amt = Math.ceil(r / 2);
      emit(state, { type: 'roll', unitUid: A.uid, dice: [r], purpose: 'Confused — hits itself',
        text: cname(A) + ' is Confused and strikes itself for 1d3 (' + amt + ') Martial damage!' });
      amt = yield* negateWithTokens(state, A, amt, ['M'], 'confusion');
      if (amt > 0) yield* applyDamage(state, A, amt, ['M'], null, false);
      yield* checkDefeat(state, A, null);
      return;
    }

    // 2. Roll for damage
    const dice = [];
    const extraDice = {};
    for (let i = 0; i < (atk.salvo || 0); i++) dice.push(d6(state));
    if (kws.includes('Headshot')) dice.push(d6(state));
    let emboldenDie = null;
    if (spec.embolden) { emboldenDie = d6(state); dice.push(emboldenDie); }
    for (const m of markData(A, 'bonusDie')) for (let i = 0; i < (m.n || 1); i++) dice.push(d6(state));
    for (const m of atk.mods || []) {
      if (m.type === 'targetStatusDice') extraDice[m.status] = d6(state);
      if (m.type === 'ifFriendlyChar' && cond(state, { k: 'charActive' }, { p: A.owner, self: A })) for (let i = 0; i < m.dice; i++) dice.push(d6(state));
    }
    let dmg = (atk.damage || 0) + dice.reduce((a, b) => a + b, 0);
    dmg += A.attachments.reduce((s, c) => s + (def(c).effect.bonusDamage || 0), 0);
    for (const m of markData(A, 'plusDamage')) dmg += m.n || 0;
    const ctxBase = { p: A.owner, self: A, target: T };
    for (const m of atk.mods || []) {
      if (m.type === 'arenaTokens') dmg += m.per * arenaKindCount(state, m.token);
      if (m.type === 'perStage') dmg += m.per * stageOf(state, A.owner);
      if (m.type === 'ifArena' && cond(state, m.cond, ctxBase)) dmg += m.add;
      if (m.type === 'discardSelfTokens') {
        const n = A.tokens[m.token] || 0;
        if (n) { A.tokens[m.token] = 0; noteSpent(state, A.owner, m.token, n); dmg += n * m.per; log(state, cname(A) + ' discards ' + n + ' ' + Cards.TOKEN_NAMES[m.token] + ' token(s): +' + n * m.per + ' damage.'); }
      }
      if (m.type === 'spendTokens') {
        const have = kindCount(state, A, m.token);
        if (have > 0) {
          const ans = yield* ask(state, { kind: 'tokens', player: A.owner, purpose: 'bonus', unitUid: A.uid, targetUid: T.uid, token: m.token, per: m.per, max: have, damage: dmg });
          const n = spendKind(state, A, m.token, ans.n | 0);
          if (n) { dmg += n * m.per; log(state, cname(A) + ' spends ' + n + ' ' + Cards.TOKEN_NAMES[m.token] + ' token(s): +' + n * m.per + ' damage.'); }
        }
      }
      if (m.type === 'optionalSpend' && kindCount(state, A, m.token) > 0) {
        const ans = yield* ask(state, { kind: 'tokens', player: A.owner, purpose: 'bonus', unitUid: A.uid, targetUid: T.uid, token: m.token, max: 1, damage: dmg, setTo: m.setDamage });
        if ((ans.n | 0) > 0 && spendKind(state, A, m.token, 1)) { dmg = m.setDamage; log(state, cname(A) + ' spends an ' + Cards.TOKEN_NAMES[m.token] + ' token: the attack deals ' + dmg + '.'); }
      }
    }
    if (dice.length) {
      emit(state, { type: 'roll', unitUid: A.uid, dice, purpose: 'Damage', emboldenDie,
        text: cname(A) + ' rolls ' + dice.join(' + ') + (emboldenDie ? ' (incl. Embolden ' + emboldenDie + ')' : '') + ' → ' + dmg + ' damage.' });
    }
    const blinded = A.statuses.includes('Blinded');
    if (dice.length && !blinded) {
      const avail = availTokens(state, A, null);
      if (avail > 0) {
        const ans = yield* ask(state, { kind: 'tokens', player: A.owner, purpose: 'damage', unitUid: A.uid, targetUid: T.uid, max: avail, damage: dmg, attackIndex: spec.attackIndex });
        if (ans.n > 0) {
          spendTokens(state, A, ans.n, null);
          dmg += ans.n;
          emit(state, { type: 'boost', unitUid: A.uid, n: ans.n, text: cname(A) + ' spends ' + ans.n + ' token(s): +' + ans.n + ' damage (' + dmg + ').' });
        }
      }
    }
    if (A.statuses.includes('Bound') && dmg > 0) { dmg = Math.max(0, dmg - 2); log(state, cname(A) + ' is Bound: −2 damage.'); }
    if (hasMark(A, 'weakened') && dmg > 0) { dmg = Math.floor(dmg / 2); log(state, cname(A) + ' is suppressed: its damage is halved.'); }
    if (blinded) { dmg = 0; log(state, cname(A) + ' is Blinded — the attack deals no damage.'); }

    // Who gets hit: the target, plus every other enemy Active unit for area attacks.
    const hits = [T];
    if (atk.aoe) for (const x of activeUnits(state.players[T.owner])) if (x !== T) hits.push(x);
    const results = [];
    let primaryDealt = 0;
    const killMod = (atk.mods || []).find(m => m.type === 'killIfTokens');
    for (const H of hits) {
      let d = perTargetDamage(state, A, atk, H, dmg, extraDice);
      const unmade = killMod && (H.tokens[killMod.token] || 0) >= killMod.min && !blinded;
      // 3. Defend (nothing defends against being unmade)
      if (unmade) { log(state, cname(H) + ' is unmade!', { kind: 'unmake' }); d = Math.max(0, left(H)); }
      else if (d > 0) d = yield* defend(state, A, atk, H, d);
      // 4. Deal damage
      const needed = Math.max(0, left(H));
      const dealt = d > 0 ? yield* applyDamage(state, H, d, types, A, true) : 0;
      if (!dealt) log(state, cname(H) + ' takes no damage.');
      if (H === T) primaryDealt = dealt;
      if (dealt > 0 && dealt - needed >= 5 && isCharacter(H) && H.owner !== A.owner) {
        yield* gain(state, A.owner, (dealt - needed) + ' excess damage to a character');
      }
      results.push({ H, dealt });
    }

    // 5. Apply effects
    for (const { H } of results) {
      for (const kw of kws) {
        if (!STATUS_KEYWORDS[kw] || H.defeated) continue;
        const st = STATUS_KEYWORDS[kw];
        let r = d6(state);
        emit(state, { type: 'roll', unitUid: A.uid, dice: [r], need: 4, purpose: kw, text: kw + ': ' + cname(A) + ' rolls ' + r + (hits.length > 1 ? ' vs ' + cname(H) : '') + '.' });
        r = yield* boostRoll(state, A, r, 4, kw);
        if (r >= 4) {
          if (!H.statuses.includes(st)) {
            H.statuses.push(st);
            emit(state, { type: 'status', unitUid: H.uid, status: st, text: cname(H) + ' is now ' + st + '!' });
          } else log(state, cname(H) + ' is already ' + st + '.');
        }
      }
    }
    for (const kw of kws) if (Cards.TOKEN_KEYWORDS[kw] && locate(state, A.uid)) addTokens(state, A, Cards.TOKEN_KEYWORDS[kw], 1);
    if (atk.splash) for (const x of activeUnits(state.players[T.owner])) if (x !== T) yield* effectDamage(state, x, atk.splash, types, A);
    const ctx = { p: A.owner, self: A, target: T, isReaction: !!spec.reaction, dealt: primaryDealt, killed: T.damage >= hp(T) };
    yield* runEffects(state, atk.effects, ctx);
    if (atk.collateral) {
      const own = atk.collateral.all ? arenaUnits(state.players[A.owner]).filter(u => u !== A && !u.defeated) : activeUnits(state.players[A.owner]).filter(u => u !== A);
      for (const u of own) yield* effectDamage(state, u, atk.collateral.n, ['M'], null);
    }

    // 6. Reactions (only the primary target, and never from Long Ranged attacks)
    if (!spec.reaction && !kws.includes('Long Ranged') && primaryDealt > 0) yield* reactions(state, A, T);

    // 7. Check for defeat
    for (const { H } of results) {
      if (!H.defeated && H.damage >= hp(H)) {
        yield* markDefeated(state, H, killerInfo(A));
        if (kws.includes('Brutal') && H.owner !== A.owner) yield* gain(state, A.owner, 'Brutal');
        if (hasMark(A, 'shiftOnKill')) addMark(state, A, 'ignoreShiftCond', 'turn', A.owner);
      }
    }
    if (locate(state, A.uid)) yield* fire(state, 'attack', A, { target: T, isReaction: !!spec.reaction });
  }

  function reactionOptions(state, A, T) {
    const q = T.owner, Q = state.players[q];
    const options = [];
    const canReact = R => !R.defeated && !R.reacted && !hasMark(R, 'noReact') && !R.statuses.includes('Bound');
    const tLoc = locate(state, T.uid);
    if (tLoc && tLoc.zone === 'active' && canReact(T)) {
      def(T).attacks.forEach((a, i) => {
        if (a.keywords.includes('Counterattack') && canPay(state, q, attackCost(state, T, a), T.uid)) {
          options.push({ unitUid: T.uid, attackIndex: i, kind: 'Counterattack', label: cname(T) + ': ' + a.name });
        }
      });
    }
    for (const R of Q.active) {
      if (!R || R === T || !canReact(R)) continue;
      if (state.declared.some(d => d.targetUid === R.uid)) continue;
      const any = hasMark(R, 'interveneAny');
      def(R).attacks.forEach((a, i) => {
        if ((any || a.keywords.includes('Intervention')) && canPay(state, q, attackCost(state, R, a), R.uid)) {
          options.push({ unitUid: R.uid, attackIndex: i, kind: 'Intervention', label: cname(R) + ': ' + a.name });
        }
      });
    }
    return options;
  }

  function* reactions(state, A, T) {
    const q = T.owner;
    while (true) {
      const aLoc = locate(state, A.uid);
      if (!aLoc || A.defeated || aLoc.zone !== 'active') return;
      const options = reactionOptions(state, A, T);
      if (!options.length) return;
      const ans = yield* ask(state, { kind: 'reaction', player: q, options, attackerUid: A.uid, targetUid: T.uid });
      if (ans.option < 0) return;
      const o = options[ans.option];
      const R = unitByUid(state, o.unitUid);
      R.reacted = true;
      applyPayment(state, q, autoPay(state, q, attackCost(state, R, def(R).attacks[o.attackIndex]), R.uid));
      yield* resolveAttack(state, { attackerUid: R.uid, attackIndex: o.attackIndex, targetUid: A.uid, reaction: o.kind });
    }
  }

  function* statusDamage(state, u) {
    for (const [st, type] of [['Poisoned', 'M'], ['Ablaze', 'A']]) {
      if (!u.statuses.includes(st) || u.defeated) continue;
      const r = d6(state);
      let amt = Math.ceil(r / 2);
      emit(state, { type: 'roll', unitUid: u.uid, dice: [r], purpose: st, text: cname(u) + ' is ' + st + ': 1d3 = ' + amt + ' ' + Cards.TYPE_NAMES[type] + ' damage.' });
      amt = yield* negateWithTokens(state, u, amt, [type], 'status');
      if (amt > 0) yield* applyDamage(state, u, amt, [type], null, false);
      yield* checkDefeat(state, u, null);
    }
  }

  // ───────────────────────── actions ─────────────────────────

  function emptySlots(arr) { return arr.map((u, i) => (u ? -1 : i)).filter(i => i >= 0); }

  function shiftConditionError(state, p, card, onto) {
    const s = def(card).shift;
    if (onto && hasMark(onto, 'ignoreShiftCond')) return null;
    if (!s.cond) return null;
    return cond(state, s.cond, { p, onto, self: onto }) ? null : 'Shift condition not met: ' + Cards.shiftText(def(card));
  }

  const PU_TARGETS = {
    none: () => null,
    ownUnit: (state, p, t) => { const l = locate(state, t); return !l || l.owner !== p ? 'Choose one of your units in the Arena.' : l.u.defeated ? 'That unit is Defeated.' : null; },
    ownActive: (state, p, t) => { const l = locate(state, t); return !l || l.owner !== p || l.zone !== 'active' ? 'Choose one of your Active units.' : l.u.defeated ? 'That unit is Defeated.' : null; },
    ownActiveRetreat: (state, p, t) => PU_TARGETS.ownActive(state, p, t) || (!emptySlots(state.players[p].ready).length ? 'Your Ready Zone is full.' : null),
    ownReadyUnit: (state, p, t) => { const l = locate(state, t); return !l || l.owner !== p || l.zone !== 'ready' || l.u.defeated ? 'Choose one of your Ready units.' : !emptySlots(state.players[p].active).length ? 'Your Active Zone is full.' : null; },
    ownCharacter: (state, p, t) => PU_TARGETS.ownUnit(state, p, t) || (!isCharacter(unitByUid(state, t)) ? 'Choose one of your characters.' : null),
    ownShiftedChar: (state, p, t) => PU_TARGETS.ownCharacter(state, p, t) || (!unitByUid(state, t).stack.length ? 'Choose a character that has Shifted.' : null),
    ownFighter: (state, p, t) => PU_TARGETS.ownUnit(state, p, t) || (def(unitByUid(state, t)).baseName === 'Sovereign' ? 'Choose a unit other than Sovereign.' : null),
    ownGraveUnit: (state, p, t) => { const c = state.players[p].grave.find(x => x.uid === t); return !c || !isUnitCard(c) ? 'Choose a fighter or character in your Graveyard.' : null; },
    ownGraveUnitToReady: (state, p, t) => PU_TARGETS.ownGraveUnit(state, p, t) || (shiftOnly(state.players[p].grave.find(x => x.uid === t)) ? 'Shifted forms can only enter the Arena by Shifting.' : null) || (!emptySlots(state.players[p].ready).length ? 'Your Ready Zone is full.' : null),
    ownSupportUnit: (state, p, t) => { const s = state.players[p].support.find(x => x.uid === t); return !s ? 'Choose a card in your Support Zone.' : shiftOnly(s) ? 'Shifted forms can only enter the Arena by Shifting.' : !emptySlots(state.players[p].ready).length && !emptySlots(state.players[p].active).length ? 'No empty slot.' : null; },
    ownSupportFighter: (state, p, t) => { const s = state.players[p].support.find(x => x.uid === t); return !s || def(s).type !== 'fighter' ? 'Choose a fighter in your Support Zone.' : !emptySlots(state.players[p].ready).length ? 'Your Ready Zone is full.' : null; },
    ownLoyalCrew: (state, p, t) => {
      const P = state.players[p];
      if (!emptySlots(P.ready).length) return 'Your Ready Zone is full.';
      const s = P.support.find(x => x.uid === t);
      const l = locate(state, t);
      const c = s || (l && l.owner === p && l.zone === 'active' ? l.u : null);
      return c && def(c).keywords.includes('Loyal Crew') && def(c).type === 'fighter' && !c.defeated ? null : 'Choose a Loyal Crew fighter in your Support or Active Zone.';
    },
    oppUnit: (state, p, t) => { const l = locate(state, t); return !l || l.owner === p ? 'Choose an opposing unit.' : !isTargetable(state, l.u) ? 'That unit cannot be targeted.' : null; },
    oppActive: (state, p, t) => PU_TARGETS.oppUnit(state, p, t) || (locate(state, t).zone !== 'active' ? 'Choose an opposing Active unit.' : null),
    oppCharacter: (state, p, t) => PU_TARGETS.oppUnit(state, p, t) || (!isCharacter(unitByUid(state, t)) ? 'Choose an opposing character.' : null),
    oppSupport: (state, p, t) => { const s = state.players[1 - p].support.find(x => x.uid === t); return !s ? "Choose a card in your opponent's Support Zone." : s.tapped ? 'That card is already tapped.' : null; },
  };

  function validatePowerUpTarget(state, p, card, target) {
    const d = def(card);
    const f = PU_TARGETS[d.target];
    if (!f) return 'Unknown target.';
    const err = f(state, p, target);
    if (err) return err;
    if (d.requires && !cond(state, d.requires, { p })) return d.requiresText || 'Its requirement is not met.';
    return null;
  }

  function declaredCount(state, uid) { return state.declared.filter(d => d.attackerUid === uid).length; }

  /** Returns an error string, or null if the action is legal right now. */
  function validateAction(state, p, a) {
    if (!a || typeof a.type !== 'string') return 'Invalid action.';
    if (state.active !== p) return 'It is not your turn.';
    const P = state.players[p], O = state.players[1 - p];
    const phase = state.phase;
    const inHand = uid => P.hand.find(c => c.uid === uid);
    switch (a.type) {
      case 'endPhase': return null;
      case 'playReady': {
        if (phase !== 'arming') return 'Units can only be played during your Arming phase.';
        if (P.playedUnit) return 'You have already played a unit to your Ready Zone this turn.';
        const c = inHand(a.cardUid);
        if (!c || !isUnitCard(c)) return 'Choose a fighter or character from your hand.';
        if (shiftOnly(c)) return cname(c) + ' can only enter the Arena by Shifting onto ' + def(c).baseName + '.';
        if (!(a.index >= 0 && a.index < 3) || P.ready[a.index]) return 'Choose an empty Ready slot.';
        return null;
      }
      case 'playSupport': {
        if (phase !== 'arming') return 'Support cards can only be played during your Arming phase.';
        if (P.playedSupport) return 'You have already played a card to your Support Zone this turn.';
        const c = inHand(a.cardUid);
        if (!c || !isUnitCard(c)) return 'Only fighters and characters can be played as energy.';
        return null;
      }
      case 'playPowerUp': {
        if (!['arming', 'fighting', 'resolving'].includes(phase)) return 'Not now.';
        if (P.playedPowerUp) return 'You may only play one Power Up per turn.';
        const c = inHand(a.cardUid);
        if (!c || def(c).type !== 'powerup') return 'Choose a Power Up from your hand.';
        return validatePowerUpTarget(state, p, c, a.target);
      }
      case 'moveToActive': {
        if (phase !== 'arming' && phase !== 'resolving') return 'Units move to the Active Zone during Arming or Resolving.';
        const l = locate(state, a.unitUid);
        if (!l || l.owner !== p || l.zone !== 'ready') return 'Choose one of your Ready units.';
        if (l.u.defeated) return 'Defeated units cannot move.';
        if (l.u.statuses.includes('Bound')) return 'Bound units cannot move.';
        if (!(a.index >= 0 && a.index < 2) || P.active[a.index]) return 'Choose an empty Active slot.';
        return null;
      }
      case 'retreat': {
        if (phase !== 'arming') return 'You can only Retreat during your Arming phase.';
        const l = locate(state, a.unitUid);
        if (!l || l.owner !== p || l.zone !== 'active') return 'Choose one of your Active units.';
        if (l.u.defeated) return 'Defeated units cannot Retreat.';
        if (l.u.statuses.includes('Bound')) return 'Bound units cannot Retreat.';
        if (hasPassive(l.u, 'noRetreat')) return cname(l.u) + ' cannot leave the Arena voluntarily.';
        const slots = emptySlots(P.ready);
        if (!slots.length) return 'Your Ready Zone is full.';
        if (a.index != null && !slots.includes(a.index)) return 'Choose an empty Ready slot.';
        const pay = a.payment || autoPay(state, p, ['*', '*'], null);
        if (!pay) return 'Retreating costs 2 energy.';
        return checkPayment(state, p, ['*', '*'], null, pay);
      }
      case 'ability': {
        if (phase !== 'arming') return 'Activated abilities are used during your Arming phase.';
        const l = locate(state, a.unitUid);
        if (!l || l.owner !== p) return 'Choose one of your units.';
        if (l.u.defeated) return 'Defeated units cannot use abilities.';
        const ab = def(l.u).abilities[a.abilityIndex];
        if (!ab) return 'Unknown ability.';
        if (l.u.used[a.abilityIndex]) return 'Each ability can be used once per turn.';
        if (ab.selfDamage && left(l.u) <= ab.selfDamage) return 'That would defeat ' + cname(l.u) + '.';
        const pay = a.payment || autoPay(state, p, ab.cost, null);
        if (!pay) return 'You cannot pay for that ability.';
        return checkPayment(state, p, ab.cost, null, pay);
      }
      case 'declare': {
        if (phase !== 'fighting') return 'Attacks are declared in the Fighting phase.';
        if (state.resolvingStarted) return 'All attacks must be declared before any are resolved.';
        const l = locate(state, a.unitUid);
        if (!l || l.owner !== p || l.zone !== 'active') return 'Only your Active units can attack.';
        if (l.u.defeated) return 'Defeated units cannot attack.';
        if (hasMark(l.u, 'noAttack')) return cname(l.u) + ' cannot attack this turn.';
        const max = hasPassive(l.u, 'doubleAttack') ? 2 : 1;
        if (declaredCount(state, a.unitUid) >= max) return max > 1 ? 'That unit has already declared both its attacks.' : 'That unit has already declared an attack.';
        const atk = def(l.u).attacks[a.attackIndex];
        if (!atk) return 'Unknown attack.';
        const t = locate(state, a.targetUid);
        if (!t || t.owner === p || t.zone !== 'active') return "Target one of your opponent's Active units.";
        if (t.u.defeated) return 'That unit is already Defeated.';
        if (!isTargetable(state, t.u)) return cname(t.u) + ' cannot be targeted right now.';
        const taunts = activeUnits(O).filter(u => hasMark(u, 'taunt') && isTargetable(state, u));
        if (taunts.length && !taunts.includes(t.u)) return 'You must target ' + taunts.map(cname).join(' or ') + '.';
        const cost = attackCost(state, l.u, atk);
        const pay = a.payment || autoPay(state, p, cost, l.u.uid);
        if (!pay) return 'You cannot pay for that attack.';
        return checkPayment(state, p, cost, l.u.uid, pay);
      }
      case 'cancelDeclare': {
        if (phase !== 'fighting' || state.resolvingStarted) return 'Attacks can only be taken back before any resolve.';
        if (!state.declared[a.index]) return 'No such attack.';
        return null;
      }
      case 'resolve': {
        if (phase !== 'fighting') return 'Not in the Fighting phase.';
        const d = state.declared[a.index];
        if (!d || d.resolved) return 'Choose an unresolved attack.';
        return null;
      }
      case 'transform': {
        const l = locate(state, a.unitUid);
        if (!l || l.owner !== p) return 'Choose one of your units.';
        const tf = def(l.u).transform;
        if (!tf) return 'That unit cannot transform.';
        if (phase !== 'resolving') return 'Units transform during your Resolving phase.';
        if (l.u.defeated) return 'That unit is Defeated.';
        if (!cond(state, tf.cond, { p, self: l.u })) return 'Not yet: ' + tf.condText;
        return null;
      }
      case 'shift': {
        let from = null, card = inHand(a.cardUid);
        if (card) from = 'hand';
        else { card = P.support.find(s => s.uid === a.cardUid); if (card) from = 'support'; }
        if (!card) return 'Choose a character in your hand or Support Zone.';
        const d = def(card);
        if (d.type !== 'character' || !d.shift) return 'That card cannot Shift.';
        let onto = null;
        if (a.onto) {
          const l = locate(state, a.onto);
          if (!l || l.owner !== p) return 'Choose one of your units in the Arena.';
          onto = l.u;
        }
        const early = onto && hasMark(onto, 'canShiftNow') && ['arming', 'fighting'].includes(phase);
        if (phase !== 'resolving' && !early) return 'Characters can only Shift during your Resolving phase.';
        if (from === 'hand' && P.playedUnit) return 'Shifting from your hand counts as your Ready Zone play, which you already used.';
        if (onto) {
          if (onto.defeated) return 'That unit is Defeated.';
          if (baseName(onto) !== d.baseName) return 'It must Shift onto ' + d.baseName + '.';
          if (onto.id === card.id) return 'It must Shift onto a different version.';
        } else {
          if (from === 'hand') return 'From your hand, a character can only Shift on top of a matching unit.';
          if (d.shift.ontoOnly) return 'This version can only Shift on top of ' + d.baseName + '.';
          const arr = a.zone === 'active' ? P.active : a.zone === 'ready' ? P.ready : null;
          if (!arr || !(a.index >= 0 && a.index < arr.length) || arr[a.index]) return 'Choose an empty Arena slot.';
        }
        const ce = shiftConditionError(state, p, card, onto);
        if (ce) return ce;
        const exclude = from === 'support' ? card.uid : null;
        const pay = a.payment || autoPay(state, p, d.shift.cost || [], null, { exclude });
        if (!pay) return 'You cannot pay the Shift cost.';
        return checkPayment(state, p, d.shift.cost || [], null, pay, exclude);
      }
    }
    return 'Unknown action.';
  }

  function carryOver(nu, old) {
    nu.damage = old.damage;
    nu.tokens = old.tokens;
    nu.attachments = old.attachments;
    nu.used = old.used;
    nu.reacted = old.reacted;
    nu.kills = old.kills;
    nu.voidGained = old.voidGained;
    nu.vTaken = old.vTaken; nu.vDealt = old.vDealt;
    nu.counters = old.counters;
    nu.hpBonus = old.hpBonus;
    nu.marks = (old.marks || []).filter(m => !['canShiftNow', 'ignoreShiftCond'].includes(m.k));
  }

  function* doAction(state, p, a) {
    const P = state.players[p];
    const takeFromHand = uid => P.hand.splice(P.hand.findIndex(c => c.uid === uid), 1)[0];
    switch (a.type) {
      case 'playReady': {
        const c = takeFromHand(a.cardUid);
        const u = newUnit(c);
        P.ready[a.index] = u;
        P.playedUnit = true;
        emit(state, { type: 'play', uid: c.uid, zone: 'ready', text: pname(state, p) + ' plays ' + cname(c) + ' into the Ready Zone.' });
        yield* fire(state, 'enter', u, {});
        return;
      }
      case 'playSupport': {
        const c = takeFromHand(a.cardUid);
        P.support.push({ uid: c.uid, id: c.id, owner: p, tapped: false });
        P.playedSupport = true;
        emit(state, { type: 'play', uid: c.uid, zone: 'support', text: pname(state, p) + ' plays ' + cname(c) + ' into the Support Zone as ' + def(c).energy.map(t => Cards.TYPE_NAMES[t]).join('/') + ' energy.' });
        return;
      }
      case 'playPowerUp': {
        const c = takeFromHand(a.cardUid);
        P.playedPowerUp = true;
        yield* resolvePowerUp(state, p, c, a.target);
        return;
      }
      case 'moveToActive': {
        const l = locate(state, a.unitUid);
        P.ready[l.index] = null;
        P.active[a.index] = l.u;
        emit(state, { type: 'move', uid: l.u.uid, text: cname(l.u) + ' steps into the Active Zone.' });
        return;
      }
      case 'retreat': {
        const l = locate(state, a.unitUid);
        applyPayment(state, p, a.payment || autoPay(state, p, ['*', '*'], null));
        retreatUnit(state, p, l, a.index);
        return;
      }
      case 'ability': {
        const u = unitByUid(state, a.unitUid);
        const ab = def(u).abilities[a.abilityIndex];
        applyPayment(state, p, a.payment || autoPay(state, p, ab.cost, null));
        u.used[a.abilityIndex] = true;
        emit(state, { type: 'ability', unitUid: u.uid, text: cname(u) + ' uses ' + ab.name + '.' });
        if (ab.selfDamage) yield* applyDamage(state, u, ab.selfDamage, ['A'], null, false);
        if (ab.effect && ab.effect.type === 'token') addTokens(state, u, ab.effect.token, ab.effect.n || 1);
        yield* runEffects(state, ab.effects, { p, self: u });
        yield* checkDefeat(state, u, null);
        return;
      }
      case 'declare': {
        const u = unitByUid(state, a.unitUid);
        const atk = def(u).attacks[a.attackIndex];
        const pay = a.payment || autoPay(state, p, attackCost(state, u, atk), u.uid);
        applyPayment(state, p, pay);
        state.declared.push({ attackerUid: u.uid, attackIndex: a.attackIndex, targetUid: a.targetUid, payment: pay,
          embolden: hasKeyword(u, 'Embolden'), resolved: false });
        emit(state, { type: 'declare', attackerUid: u.uid, targetUid: a.targetUid,
          text: pname(state, p) + ' declares ' + cname(u) + ' → ' + atk.name + ' on ' + cname(unitByUid(state, a.targetUid)) + '.' });
        return;
      }
      case 'cancelDeclare': {
        const d = state.declared.splice(a.index, 1)[0];
        refundPayment(state, p, d.payment);
        emit(state, { type: 'undeclare', attackerUid: d.attackerUid, text: 'Attack taken back.' });
        return;
      }
      case 'resolve': {
        yield* resolveDeclared(state, state.declared[a.index]);
        return;
      }
      case 'transform': {
        const l = locate(state, a.unitUid);
        const old = l.u, tf = def(old).transform;
        const nu = newUnit({ uid: old.uid, id: tf.into, owner: p });
        carryOver(nu, old);
        nu.stack = old.stack;
        nu.flippedFrom = old.flippedFrom || old.id;
        nu.statuses = [];
        P[l.zone][l.index] = nu;
        emit(state, { type: 'shift', uid: nu.uid, text: '⟳ ' + cname(old) + ' becomes ' + cname(nu) + '!' });
        yield* runEffects(state, tf.effects, { p, self: nu });
        yield* checkDefeat(state, nu, null);
        return;
      }
      case 'shift': {
        let card = P.hand.find(c => c.uid === a.cardUid), from = 'hand';
        if (!card) { card = P.support.find(s => s.uid === a.cardUid); from = 'support'; }
        const d = def(card);
        const exclude = from === 'support' ? card.uid : null;
        applyPayment(state, p, a.payment || autoPay(state, p, d.shift.cost || [], null, { exclude }));
        if (from === 'hand') { P.hand.splice(P.hand.indexOf(card), 1); P.playedUnit = true; }
        else P.support.splice(P.support.indexOf(card), 1);
        const nu = newUnit(bareCard(card));
        if (a.onto) {
          const l = locate(state, a.onto);
          const old = l.u;
          carryOver(nu, old);
          nu.stack = old.stack.concat([bareCard(old)]);
          P[l.zone][l.index] = nu;
          emit(state, { type: 'shift', uid: nu.uid, text: 'Shift! ' + cname(old) + ' becomes ' + d.name + '.' });
        } else {
          P[a.zone][a.index] = nu;
          emit(state, { type: 'shift', uid: nu.uid, text: 'Shift! ' + d.name + ' returns from the Support Zone to the Arena.' });
        }
        yield* fire(state, 'shiftedInto', nu, {});
        for (const x of arenaUnits(P)) if (x !== nu && !x.defeated) yield* fire(state, 'allyShift', x, { target: nu });
        yield* loyalCrew(state, p, card);
        yield* checkDefeat(state, nu, null);
        return;
      }
    }
  }

  /** Loyal Crew: when a Loyal Crew character Shifts, a Loyal Crew fighter may leave the Support Zone for the Ready Zone. */
  function* loyalCrew(state, p, card) {
    if (!def(card).keywords.includes('Loyal Crew')) return;
    const P = state.players[p];
    const slot = emptySlots(P.ready)[0];
    const crew = P.support.filter(s => def(s).type === 'fighter' && def(s).keywords.includes('Loyal Crew'));
    if (slot == null || !crew.length) return;
    const ans = yield* ask(state, { kind: 'pick', player: p, optional: true, prompt: 'Loyal Crew: bring a crew member from your Support Zone into the Ready Zone?',
      options: crew.map(s => ({ uid: s.uid, label: cname(s) })) });
    const s = crew.find(x => x.uid === ans.uid);
    if (!s) return;
    P.support.splice(P.support.indexOf(s), 1);
    const u = newUnit(bareCard(s));
    P.ready[slot] = u;
    emit(state, { type: 'move', uid: s.uid, text: 'Loyal Crew! ' + cname(s) + ' joins the Ready Zone.' });
    yield* fire(state, 'enter', u, {});
  }

  function retreatUnit(state, p, l, index) {
    const P = state.players[p];
    const slot = index != null ? index : emptySlots(P.ready)[0];
    P.active[l.index] = null;
    for (const t of TOKEN_KINDS) l.u.tokens[t] = 0;
    P.ready[slot] = l.u;
    emit(state, { type: 'move', uid: l.u.uid, text: cname(l.u) + ' retreats to the Ready Zone (energy tokens discarded).' });
  }

  function* resolveDeclared(state, d) {
    state.resolvingStarted = true;
    d.resolved = true;
    const others = state.declared.filter(x => x !== d && x.attackerUid !== d.attackerUid && x.embolden);
    yield* resolveAttack(state, { attackerUid: d.attackerUid, attackIndex: d.attackIndex, targetUid: d.targetUid, embolden: others.length > 0 });
  }

  function* resolvePowerUp(state, p, c, target) {
    const d = def(c), e = d.effect || {};
    const P = state.players[p], O = state.players[1 - p];
    emit(state, { type: 'powerup', uid: c.uid, player: p, cardId: c.id, target, text: pname(state, p) + ' plays ' + d.name + '.' });
    let attached = false;
    if (d.effects) {
      let tgt = target ? unitByUid(state, target) : null;
      if (!tgt && target) tgt = { uid: target };
      yield* runEffects(state, d.effects, { p, self: null, target: tgt });
      P.grave.push(bareCard(c));
      return;
    }
    switch (e.type) {
      case 'tokens': addTokens(state, unitByUid(state, target), e.token, e.n); break;
      case 'cleanse': {
        const u = unitByUid(state, target);
        u.statuses = [];
        log(state, cname(u) + ' is cleansed of all statuses.', { kind: 'cleanse', unitUid: u.uid });
        break;
      }
      case 'heal': {
        const u = unitByUid(state, target);
        const n = Math.min(e.n, u.damage);
        u.damage -= n;
        emit(state, { type: 'heal', unitUid: u.uid, n, text: cname(u) + ' recovers ' + n + ' damage.' });
        break;
      }
      case 'draw': drawCards(state, p, e.n); break;
      case 'attach': {
        const u = unitByUid(state, target);
        u.attachments.push(bareCard(c));
        attached = true;
        log(state, d.name + ' is attached to ' + cname(u) + '.', { kind: 'attach', unitUid: u.uid });
        break;
      }
      case 'retreat': retreatUnit(state, p, locate(state, target), null); break;
      case 'favour': {
        if (!e.requireActiveCharacter || P.active.some(u => u && !u.defeated && isCharacter(u))) {
          yield* gainFavour(state, [{ player: p, n: e.n, reason: d.name }]);
        } else log(state, 'No character in the Active Zone — ' + d.name + ' has no effect.');
        break;
      }
      case 'recall': {
        const i = P.grave.findIndex(x => x.uid === target);
        const card = P.grave.splice(i, 1)[0];
        P.hand.push(card);
        log(state, cname(card) + ' returns from the Graveyard to ' + pname(state, p) + "'s hand.", { kind: 'recall' });
        break;
      }
      case 'tapSupport': {
        const s = O.support.find(x => x.uid === target);
        s.tapped = true;
        log(state, cname(s) + ' is tapped.', { kind: 'tap' });
        break;
      }
      case 'reinforce': {
        const s = P.support.find(x => x.uid === target);
        P.support.splice(P.support.indexOf(s), 1);
        const u = newUnit(bareCard(s));
        P.ready[emptySlots(P.ready)[0]] = u;
        emit(state, { type: 'move', uid: s.uid, text: cname(s) + ' leaves the Support Zone and enters the Ready Zone.' });
        yield* fire(state, 'enter', u, {});
        break;
      }
    }
    if (!attached) P.grave.push(bareCard(c));
  }

  // ───────────────────────── turn structure ─────────────────────────

  function* removeDefeated(state, depth) {
    depth = depth || 0;
    const gains = [];
    const deaths = [];
    const order = [state.active, 1 - state.active];
    for (const p of order) {
      const P = state.players[p];
      for (const zone of ['active', 'ready']) {
        P[zone].forEach((u, i) => {
          if (!u || !u.defeated) return;
          P[zone][i] = null;
          for (const c of u.stack) P.grave.push(bareCard(c));
          P.grave.push(bareCard(u));
          for (const a of u.attachments) P.grave.push(bareCard(a));
          emit(state, { type: 'die', uid: u.uid, owner: p, text: cname(u) + ' dies and goes to the Graveyard.' +
            (u.killer ? ' (Killed by ' + u.killer.name + '.)' : '') });
          P.stats.allyDeaths++;
          if (!u.noCredit) state.players[1 - p].stats.enemyKills++;
          if (hasKeyword(u, 'Honourable')) gains.push({ player: p, n: 1, reason: 'Honourable ' + cname(u) + ' died' });
          if (isCharacter(u) && u.killer && u.killer.isCharacter && u.killer.owner !== p && !u.noCredit) {
            gains.push({ player: u.killer.owner, n: 1, reason: u.killer.name + ' killed a character' });
          }
          deaths.push(u);
        });
      }
    }
    // Credit kills to killers still in the Arena.
    for (const u of deaths) {
      const k = u.killer && !u.noCredit ? unitByUid(state, u.killer.uid) : null;
      if (k) k.kills = (k.kills || 0) + 1;
    }
    yield* gainFavour(state, gains);
    for (const u of deaths) {
      yield* fire(state, 'death', u, {});
      const k = u.killer && !u.noCredit ? unitByUid(state, u.killer.uid) : null;
      if (k && !k.defeated) yield* fire(state, 'kill', k, { target: u });
      for (const x of arenaUnits(state.players[1 - u.owner])) if (!x.defeated) yield* fire(state, 'enemyKilled', x, { target: u });
    }
    // Death and kill effects can defeat more units; remove those too.
    if (deaths.length && depth < 5 && allUnits(state).some(u => u.defeated)) yield* removeDefeated(state, depth + 1);
  }

  function checkArenaWin(state) {
    const empty = state.players.map(P => arenaUnits(P).length === 0);
    if (empty[0] && empty[1]) endGame(state, 'draw', 'Both Arenas are empty.');
    if (empty[0]) endGame(state, 1, pname(state, 0) + ' has no units left in the Arena.');
    if (empty[1]) endGame(state, 0, pname(state, 1) + ' has no units left in the Arena.');
  }

  function* actionLoop(state, phase) {
    const p = state.active;
    while (true) {
      const a = yield* ask(state, { kind: 'main', player: p, phase });
      if (a.type === 'endPhase') {
        if (phase === 'fighting') {
          for (const d of state.declared) if (!d.resolved) yield* resolveDeclared(state, d);
        }
        return;
      }
      yield* doAction(state, p, a);
    }
  }

  function* takeTurn(state) {
    const p = state.active, P = state.players[p];
    P.playedUnit = P.playedSupport = P.playedPowerUp = false;
    for (const u of allUnits(state)) { u.reacted = false; u.used = {}; }
    state.declared = [];
    state.resolvingStarted = false;
    state.turnInfo = { defeatedActive: [[], []], bothAwarded: [false, false], attacked: [[], []] };
    expireMarks(state);

    state.phase = 'arming';
    emit(state, { type: 'turn', player: p, text: '── Turn ' + state.turn + ': ' + pname(state, p) + ' ──' });
    emit(state, { type: 'phase', phase: 'arming', player: p });

    if (P.support.some(s => s.tapped)) {
      for (const s of P.support) s.tapped = false;
      emit(state, { type: 'untap', player: p });
    }
    for (const u of arenaUnits(P)) {
      for (const m of markData(u, 'regen')) {
        const n = Math.min(m.n, u.damage);
        if (n) { u.damage -= n; emit(state, { type: 'heal', unitUid: u.uid, n, text: cname(u) + ' regenerates ' + n + ' damage.' }); }
      }
    }
    for (const u of arenaUnits(P)) if (!u.defeated) yield* fire(state, 'turnStart', u, {});
    for (const u of arenaUnits(P)) yield* statusDamage(state, u);
    if (state.turn !== 1) drawCards(state, p, P.hand.length >= 5 ? 1 : 5 - P.hand.length);

    yield* actionLoop(state, 'arming');

    state.phase = 'fighting';
    emit(state, { type: 'phase', phase: 'fighting', player: p });
    yield* actionLoop(state, 'fighting');

    state.phase = 'resolving';
    emit(state, { type: 'phase', phase: 'resolving', player: p });
    yield* removeDefeated(state);
    yield* actionLoop(state, 'resolving');
    yield* removeDefeated(state);

    if (P.active.filter(u => u && !u.defeated && isCharacter(u)).length === 2) {
      yield* gain(state, p, 'two characters in the Active Zone');
    }
    checkArenaWin(state);

    if (P.hand.length > HAND_LIMIT) {
      const n = P.hand.length - HAND_LIMIT;
      const ans = yield* ask(state, { kind: 'discard', player: p, n });
      for (const uid of ans.uids) P.grave.push(P.hand.splice(P.hand.findIndex(c => c.uid === uid), 1)[0]);
      emit(state, { type: 'discard', player: p, text: pname(state, p) + ' discards ' + n + ' card' + (n > 1 ? 's' : '') + ' down to ' + HAND_LIMIT + '.' });
    }
    state.declared = [];
  }

  function* setupGame(state) {
    emit(state, { type: 'start', text: 'Welcome to the Arena of the Multiverse!' });
    let r0, r1;
    do {
      r0 = d6(state); r1 = d6(state);
      emit(state, { type: 'rolloff', rolls: [r0, r1], text: 'Roll-off: ' + pname(state, 0) + ' ' + r0 + ', ' + pname(state, 1) + ' ' + r1 + (r0 === r1 ? ' — tie, reroll.' : '.') });
    } while (r0 === r1);
    const w = r0 > r1 ? 0 : 1;
    const fp = yield* ask(state, { kind: 'firstPlayer', player: w });
    state.first = fp.first;
    state.active = fp.first;
    log(state, pname(state, fp.first) + ' will go first.');

    for (const p of [0, 1]) {
      const P = state.players[p];
      drawCards(state, p, 7);
      let guard = 0;
      while (!P.hand.some(c => isUnitCard(c) && !shiftOnly(c)) && guard++ < 30) {
        emit(state, { type: 'mulligan', player: p, revealed: P.hand.map(c => c.id),
          text: pname(state, p) + ' reveals a hand with no units (' + P.hand.map(cname).join(', ') + ') and mulligans.' });
        P.deck.push(...P.hand.splice(0));
        shuffle(state, P.deck);
        reassignUids(state, P.deck);
        drawCards(state, p, 7);
      }
    }

    state.phase = 'setup';
    emit(state, { type: 'phase', phase: 'setup' });
    for (const p of [state.first, 1 - state.first]) {
      const ans = yield* ask(state, { kind: 'setup', player: p });
      const P = state.players[p];
      P.setup = ans.placements.map(pl => ({ card: P.hand.splice(P.hand.findIndex(c => c.uid === pl.uid), 1)[0], zone: pl.zone, index: pl.index }));
      emit(state, { type: 'setupDone', player: p, text: pname(state, p) + ' has placed their units face down.' });
    }
    for (const p of [0, 1]) {
      const P = state.players[p];
      for (const pl of P.setup) P[pl.zone][pl.index] = newUnit(pl.card);
      P.setup = null;
    }
    emit(state, { type: 'reveal', text: 'Both players reveal their gladiators!' });
    state.turn = 1;
  }

  function* gameLoop(state) {
    try {
      yield* setupGame(state);
      while (true) {
        yield* takeTurn(state);
        state.turn++;
        state.active = 1 - state.active;
        if (state.maxTurns && state.turn > state.maxTurns) endGame(state, 'draw', 'Turn limit reached.');
      }
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
  }

  // ───────────────────────── choice validation ─────────────────────────

  function validateChoice(state, choice, ans) {
    if (!ans || typeof ans !== 'object') return 'Invalid answer.';
    const P = state.players[choice.player];
    switch (choice.kind) {
      case 'main': return validateAction(state, choice.player, ans);
      case 'firstPlayer': return ans.first === 0 || ans.first === 1 ? null : 'Choose who goes first.';
      case 'tokens': return Number.isInteger(ans.n) && ans.n >= 0 && ans.n <= choice.max ? null : 'Choose between 0 and ' + choice.max + ' tokens.';
      case 'reaction': return Number.isInteger(ans.option) && ans.option >= -1 && ans.option < choice.options.length ? null : 'Invalid reaction.';
      case 'veteran': return ans.slot === -1 || choice.slots.includes(ans.slot) ? null : 'Choose an empty Ready slot.';
      case 'pick': return (choice.optional && ans.uid == null) || choice.options.some(o => o.uid === ans.uid) ? null : 'Choose one of the options.';
      case 'option': return Number.isInteger(ans.index) && ans.index >= 0 && ans.index < choice.options.length ? null : 'Choose one of the options.';
      case 'discard': {
        if (!Array.isArray(ans.uids) || ans.uids.length !== choice.n) return 'Discard exactly ' + choice.n + ' card(s).';
        if (new Set(ans.uids).size !== ans.uids.length) return 'Choose different cards.';
        return ans.uids.every(uid => P.hand.some(c => c.uid === uid)) ? null : 'Choose cards from your hand.';
      }
      case 'setup': {
        const pl = ans.placements;
        if (!Array.isArray(pl) || pl.length < 1 || pl.length > 4) return 'Place between one and four units.';
        const used = new Set(), slots = new Set();
        for (const x of pl) {
          const c = P.hand.find(h => h.uid === x.uid);
          if (!c || !isUnitCard(c)) return 'Only fighters and characters can be placed.';
          if (shiftOnly(c)) return cname(c) + ' can only enter the Arena by Shifting.';
          if (used.has(x.uid)) return 'Each card can be placed once.';
          used.add(x.uid);
          const max = x.zone === 'active' ? 2 : x.zone === 'ready' ? 3 : 0;
          if (!(x.index >= 0 && x.index < max)) return 'Invalid slot.';
          const k = x.zone + x.index;
          if (slots.has(k)) return 'Two units cannot share a slot.';
          slots.add(k);
        }
        return null;
      }
    }
    return 'Unknown choice.';
  }

  // ───────────────────────── game object & views ─────────────────────────

  function createState(cfg) {
    const seed = cfg.seed != null ? cfg.seed : Math.floor(Math.random() * 2 ** 31);
    const state = {
      seed, rng: seed | 0, uidCounter: 0, eventSeq: 0, turn: 0, active: 0, first: null, phase: 'setup',
      declared: [], resolvingStarted: false, turnInfo: { defeatedActive: [[], []], bothAwarded: [false, false], attacked: [[], []] },
      pending: null, winner: null, winReason: '', events: [], rigged: (cfg.rigged || []).slice(),
      noSnapshots: !!cfg.noSnapshots, maxTurns: cfg.maxTurns || 0,
      players: [0, 1].map(p => ({
        name: (cfg.names && cfg.names[p]) || 'Player ' + (p + 1),
        deck: [], hand: [], grave: [], support: [], active: [null, null], ready: [null, null, null],
        favour: 0, playedUnit: false, playedSupport: false, playedPowerUp: false, setup: null, flags: [],
        stats: { spent: {}, pressure: 0, enemyKills: 0, allyDeaths: 0 },
      })),
    };
    for (let p = 0; p < 2; p++) {
      const deck = cfg.decks[p].map(id => ({ uid: '', id, owner: p }));
      if (!(cfg.stacked && cfg.stacked[p])) shuffle(state, deck);
      reassignUids(state, deck);
      state.players[p].deck = deck;
    }
    return state;
  }

  class Game {
    constructor(cfg) {
      this.state = createState(cfg);
      this.gen = gameLoop(this.state);
      this._run(undefined);
    }
    _run(ans) {
      let r = this.gen.next(ans);
      while (!r.done) {
        if (r.value && r.value.choice) {
          this.state.pending = r.value.choice;
          emit(this.state, { type: 'pending' });
          return;
        }
        r = this.gen.next();
      }
      this.state.pending = null;
    }
    get pending() { return this.state.pending; }
    /** Returns null on success or an error message. */
    submit(player, answer) {
      const c = this.state.pending;
      if (!c) return 'The game is not waiting for a decision.';
      if (c.player !== player) return 'Waiting for the other player.';
      const err = validateChoice(this.state, c, answer);
      if (err) return err;
      this.state.pending = null;
      this._run(answer);
      return null;
    }
    /** Ends the game immediately with player p conceding. */
    concede(p) {
      if (this.state.winner != null) return;
      try { endGame(this.state, 1 - p, pname(this.state, p) + ' conceded.'); } catch (e) { if (!(e instanceof GameOver)) throw e; }
      this.gen.return();
    }
    /** Removes and returns the accumulated [{ev, snap}] steps. */
    takeSteps() { const s = this.state.events; this.state.events = []; return s; }
  }

  /** A copy of `state` (or a snapshot) containing only what player p may see. */
  function viewFor(state, p) {
    const v = state.events ? snapshot(state) : JSON.parse(JSON.stringify(state));
    delete v.rng; delete v.rigged; delete v.seed;
    v.me = p;
    v.players.forEach((P, q) => {
      P.deckCount = P.deck.length;
      P.deck = [];
      P.handCount = P.hand.length;
      if (q !== p) {
        P.hand = P.hand.map(c => ({ uid: c.uid, hidden: true }));
        if (P.setup) P.setup = P.setup.map(() => ({ hidden: true }));
      }
    });
    if (v.pending && v.pending.player !== p) v.pending = { player: v.pending.player, kind: v.pending.kind, waiting: true };
    return v;
  }

  return {
    Game, viewFor, validateAction, validateChoice, autoPay, checkPayment, canPay, paymentSources,
    locate, unitByUid, arenaUnits, hasKeyword, hasMark, availTokens, tokenHolders, attackTypes, reactionOptions,
    emptySlots, isCharacter, isUnitCard, isTargetable, shiftOnly, def, hp, left, baseName, cond, stageOf, attackCost,
    TYPES, TOKEN_KINDS, TOKEN_BASE, HAND_LIMIT, FAVOUR_TO_WIN, STATUS_KEYWORDS, PU_TARGETS,
  };
});
