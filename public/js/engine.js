/*
 * Battle Cards — rules engine.
 *
 * The whole game runs as a generator (gameLoop). Whenever a player must make
 * a decision — their next action, or an interrupt such as spending energy
 * tokens, reacting, or a Veteran trigger — the generator yields a `choice`
 * and waits. `Game.submit(player, answer)` validates the answer and resumes.
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
  const STATUS_KEYWORDS = { Poison: 'Poisoned', Burn: 'Ablaze', Blinding: 'Blinded', Confuse: 'Confused' };
  const HAND_LIMIT = 7;
  const FAVOUR_TO_WIN = 10;

  class GameOver extends Error {}

  // ───────────────────────── helpers ─────────────────────────

  function def(c) { return Cards.byId[c.id]; }
  function isUnitCard(c) { const d = def(c); return d && (d.type === 'fighter' || d.type === 'character'); }
  function isCharacter(u) { return def(u).type === 'character'; }
  function hp(u) { return def(u).hp; }

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

  function newUnit(card) {
    return { uid: card.uid, id: card.id, owner: card.owner, damage: 0, tokens: { M: 0, A: 0, T: 0, S: 0 },
      statuses: [], defeated: false, attachments: [], stack: [], used: {}, reacted: false, killer: null };
  }
  function bareCard(c) { return { uid: c.uid, id: c.id, owner: c.owner }; }

  function arenaUnits(P) { return P.active.concat(P.ready).filter(Boolean); }
  function allUnits(state) { return arenaUnits(state.players[0]).concat(arenaUnits(state.players[1])); }

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

  function hasKeyword(u, kw) {
    if (def(u).keywords.includes(kw)) return true;
    return u.attachments.some(a => { const d = def(a); return d.effect && d.effect.grant === kw; });
  }
  function attackTypes(atk) { return [...new Set(atk.cost.filter(t => TYPES.includes(t)))]; }
  function tokenCount(u, types) {
    return (types || TYPES).reduce((s, t) => s + (u.tokens[t] || 0), 0);
  }
  function pname(state, p) { return state.players[p].name; }
  function cname(c) { return def(c).name; }

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

  /** Units whose tokens `u` may spend: itself plus its controller's Resonance units in the Arena. */
  function tokenHolders(state, u) {
    const list = [u];
    for (const x of arenaUnits(state.players[u.owner])) {
      if (x !== u && !x.defeated && hasKeyword(x, 'Resonance')) list.push(x);
    }
    return list;
  }
  function availTokens(state, u, types) {
    return tokenHolders(state, u).reduce((s, h) => s + tokenCount(h, types), 0);
  }
  /** Spends n tokens (of the given types, or any) usable by unit u. Own tokens first. */
  function spendTokens(state, u, n, types) {
    const spent = [];
    for (const h of tokenHolders(state, u)) {
      while (n > 0) {
        // Spend the type this holder has most of.
        let t = null;
        for (const x of types || TYPES) if (h.tokens[x] > 0 && (!t || h.tokens[x] > h.tokens[t])) t = x;
        if (!t) break;
        h.tokens[t]--;
        spent.push({ from: h.uid, type: t });
        n--;
      }
    }
    return spent;
  }
  function addTokens(state, u, type, n) {
    u.tokens[type] = (u.tokens[type] || 0) + n;
    emit(state, { type: 'tokens', unitUid: u.uid, token: type, delta: n,
      text: cname(u) + ' gains ' + n + ' ' + Cards.TYPE_NAMES[type] + ' token' + (n > 1 ? 's' : '') + '.' });
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
      if (u) for (const h of tokenHolders(state, u)) for (const t of TYPES) {
        for (let i = 0; i < h.tokens[t]; i++) src.push({ kind: 'token', from: h.uid, type: t, types: [t] });
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
      if (s.kind === 'token') return tokensMode === 'first' ? -1 : 10;
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
        if (!h || !TYPES.includes(t.type)) return 'Those tokens cannot be spent on this attack.';
        const k = t.from + t.type;
        need[k] = (need[k] || 0) + 1;
        if (need[k] > h.tokens[t.type]) return 'Not enough tokens.';
        sources.push({ types: [t.type] });
      }
    }
    return matchCost(cost, sources, () => 0) ? null : 'Those sources do not produce the right energy types.';
  }

  function applyPayment(state, p, pay) {
    const P = state.players[p];
    for (const uid of pay.support) { const s = P.support.find(x => x.uid === uid); s.tapped = true; }
    for (const t of pay.tokens) { const h = unitByUid(state, t.from); h.tokens[t.type]--; }
    if (pay.support.length || pay.tokens.length) {
      emit(state, { type: 'pay', player: p, support: pay.support.slice(), tokens: pay.tokens.slice() });
    }
  }
  function refundPayment(state, p, pay) {
    const P = state.players[p];
    for (const uid of pay.support) { const s = P.support.find(x => x.uid === uid); if (s) s.tapped = false; }
    for (const t of pay.tokens) { const h = unitByUid(state, t.from); if (h) h.tokens[t.type]++; }
  }
  function canPay(state, p, cost, unitUid, excludeUid) {
    return !!autoPay(state, p, cost, unitUid, { exclude: excludeUid });
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
    if (!gains.length) return;
    for (const g of gains) {
      state.players[g.player].favour += g.n;
      emit(state, { type: 'favour', player: g.player, n: g.n, reason: g.reason,
        text: pname(state, g.player) + ' gains ' + g.n + ' Favour (' + g.reason + ').' });
    }
    checkFavourWin(state);
    for (const g of gains) yield* veteranTriggers(state, 1 - g.player);
  }
  function* gain(state, player, reason) { yield* gainFavour(state, [{ player, n: 1, reason }]); }

  function* veteranTriggers(state, q) {
    const Q = state.players[q];
    for (const s of Q.support.slice()) {
      if (!def(s).keywords.includes('Veteran')) continue;
      const slots = Q.ready.map((u, i) => (u ? -1 : i)).filter(i => i >= 0);
      if (!slots.length) return;
      if (!Q.support.includes(s)) continue;
      const ans = yield* ask(state, { kind: 'veteran', player: q, cardUid: s.uid, slots });
      if (ans.slot >= 0) {
        Q.support.splice(Q.support.indexOf(s), 1);
        Q.ready[ans.slot] = newUnit(s);
        emit(state, { type: 'move', uid: s.uid, text: 'Veteran! ' + cname(s) + ' leaves the Support Zone and enters ' + pname(state, q) + "'s Ready Zone." });
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

  function drawCards(state, p, n) {
    const P = state.players[p];
    for (let i = 0; i < n; i++) {
      if (!P.deck.length) endGame(state, 1 - p, pname(state, p) + ' had to draw from an empty deck.');
      P.hand.push(P.deck.shift());
    }
    if (n > 0) emit(state, { type: 'draw', player: p, n, text: pname(state, p) + ' draws ' + n + ' card' + (n > 1 ? 's' : '') + '.' });
  }

  // ───────────────────────── combat ─────────────────────────

  function killerInfo(u) { return { uid: u.uid, owner: u.owner, isCharacter: isCharacter(u), name: cname(u) }; }

  function* resolveAttack(state, spec) {
    const aLoc = locate(state, spec.attackerUid);
    const tLoc = locate(state, spec.targetUid);
    const A = aLoc && aLoc.u;
    if (!A || A.defeated || aLoc.zone !== 'active') {
      log(state, 'The attack fizzles: the attacker can no longer attack.', { kind: 'fizzle' });
      return;
    }
    const atk = def(A).attacks[spec.attackIndex];
    const T = tLoc && tLoc.u;
    if (!T || T.defeated || tLoc.zone !== 'active') {
      log(state, cname(A) + "'s " + atk.name + ' has no effect: its target is already Defeated.', { kind: 'fizzle' });
      return;
    }
    const kws = atk.keywords;
    const types = attackTypes(atk);
    emit(state, { type: 'attack', attackerUid: A.uid, targetUid: T.uid, attack: atk.name, reaction: !!spec.reaction,
      text: (spec.reaction ? '↩ ' + spec.reaction + ': ' : '') + cname(A) + ' uses ' + atk.name + ' on ' + cname(T) + '.' });

    // 1. Status rolls
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

    if (A.statuses.includes('Confused')) {
      const r = d6(state);
      let amt = Math.ceil(r / 2);
      emit(state, { type: 'roll', unitUid: A.uid, dice: [r], purpose: 'Confused — hits itself',
        text: cname(A) + ' is Confused and strikes itself for 1d3 (' + amt + ') Martial damage!' });
      amt = yield* negateWithTokens(state, A, amt, ['M'], 'confusion');
      if (amt > 0) dealDamage(state, A, amt, ['M']);
      if (!A.defeated && A.damage >= hp(A)) yield* markDefeated(state, A, null);
      return;
    }

    // 2. Roll for damage
    const dice = [];
    if (atk.salvo) for (let i = 0; i < atk.salvo; i++) dice.push(d6(state));
    if (kws.includes('Headshot')) dice.push(d6(state));
    let emboldenDie = null;
    if (spec.embolden) { emboldenDie = d6(state); dice.push(emboldenDie); }
    const bonus = A.attachments.reduce((s, c) => s + (def(c).effect.bonusDamage || 0), 0);
    let dmg = (atk.salvo ? 0 : (atk.damage || 0)) + dice.reduce((a, b) => a + b, 0) + bonus;
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
    if (blinded) {
      dmg = 0;
      log(state, cname(A) + ' is Blinded — the attack deals no damage.');
    }

    // 3. Defend
    if (dmg > 0 && def(T).armour) {
      let red = 0;
      for (const t of types) red = Math.max(red, def(T).armour[t] || 0);
      if (red > 0) {
        dmg = Math.max(0, dmg - red);
        log(state, cname(T) + "'s armour reduces the damage by " + red + '.', { kind: 'armour', unitUid: T.uid });
      }
    }
    if (dmg > 0 && hasKeyword(T, 'Parry') && !kws.includes('Long Ranged')) {
      let r = d6(state);
      emit(state, { type: 'roll', unitUid: T.uid, dice: [r], need: 5, purpose: 'Parry', text: cname(T) + ' rolls ' + r + ' to Parry.' });
      r = yield* boostRoll(state, T, r, 5, 'Parry');
      if (r >= 5) {
        dmg = Math.floor(dmg / 2);
        emit(state, { type: 'parry', unitUid: T.uid, text: 'Parried! Damage halved to ' + dmg + '.' });
      }
    }
    dmg = yield* negateWithTokens(state, T, dmg, types, 'attack');

    // 4. Deal damage
    const needed = Math.max(0, hp(T) - T.damage);
    if (dmg > 0) dealDamage(state, T, dmg, types);
    else log(state, cname(T) + ' takes no damage.');
    const excess = dmg - needed;
    if (dmg > 0 && excess >= 5 && isCharacter(T) && T.owner !== A.owner) {
      yield* gain(state, A.owner, excess + ' excess damage to a character');
    }

    // 5. Apply effects
    for (const kw of kws) {
      if (STATUS_KEYWORDS[kw]) {
        const st = STATUS_KEYWORDS[kw];
        let r = d6(state);
        emit(state, { type: 'roll', unitUid: A.uid, dice: [r], need: 4, purpose: kw, text: kw + ': ' + cname(A) + ' rolls ' + r + '.' });
        r = yield* boostRoll(state, A, r, 4, kw);
        if (r >= 4) {
          if (!T.statuses.includes(st)) {
            T.statuses.push(st);
            emit(state, { type: 'status', unitUid: T.uid, status: st, text: cname(T) + ' is now ' + st + '!' });
          } else log(state, cname(T) + ' is already ' + st + '.');
        }
      }
      if (Cards.TOKEN_KEYWORDS[kw] && locate(state, A.uid)) addTokens(state, A, Cards.TOKEN_KEYWORDS[kw], 1);
    }

    // 6. Reactions
    if (!spec.reaction && !kws.includes('Long Ranged') && dmg > 0) yield* reactions(state, A, T);

    // 7. Check for defeat
    if (!T.defeated && T.damage >= hp(T)) {
      yield* markDefeated(state, T, killerInfo(A));
      if (kws.includes('Brutal') && T.owner !== A.owner) yield* gain(state, A.owner, 'Brutal');
    }
  }

  function dealDamage(state, u, n, types) {
    u.damage += n;
    emit(state, { type: 'damage', unitUid: u.uid, n, types, text: cname(u) + ' takes ' + n + ' damage (' + u.damage + '/' + hp(u) + ').' });
  }

  function reactionOptions(state, A, T) {
    const q = T.owner, Q = state.players[q];
    const options = [];
    const tLoc = locate(state, T.uid);
    if (tLoc && tLoc.zone === 'active' && !T.defeated && !T.reacted) {
      def(T).attacks.forEach((a, i) => {
        if (a.keywords.includes('Counterattack') && canPay(state, q, a.cost, T.uid)) {
          options.push({ unitUid: T.uid, attackIndex: i, kind: 'Counterattack', label: cname(T) + ': ' + a.name });
        }
      });
    }
    for (const R of Q.active) {
      if (!R || R === T || R.defeated || R.reacted) continue;
      if (state.declared.some(d => d.targetUid === R.uid)) continue;
      def(R).attacks.forEach((a, i) => {
        if (a.keywords.includes('Intervention') && canPay(state, q, a.cost, R.uid)) {
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
      applyPayment(state, q, autoPay(state, q, def(R).attacks[o.attackIndex].cost, R.uid));
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
      if (amt > 0) dealDamage(state, u, amt, [type]);
      if (!u.defeated && u.damage >= hp(u)) yield* markDefeated(state, u, null);
    }
  }

  // ───────────────────────── actions ─────────────────────────

  function emptySlots(arr) { return arr.map((u, i) => (u ? -1 : i)).filter(i => i >= 0); }

  function shiftConditionError(state, p, card, onto) {
    const s = def(card).shift;
    const c = s.condition;
    if (!c) return null;
    if (c.type === 'favour' && state.players[p].favour < c.min) return 'Requires ' + c.min + ' Favour.';
    if (c.type === 'targetDamage' && (!onto || onto.damage < c.min)) return 'The character it Shifts onto needs ' + c.min + '+ damage.';
    if (c.type === 'targetTokens' && (!onto || tokenCount(onto) < c.min)) return 'The character it Shifts onto needs ' + c.min + '+ energy tokens.';
    return null;
  }

  function validatePowerUpTarget(state, p, card, target) {
    const d = def(card);
    const P = state.players[p], O = state.players[1 - p];
    switch (d.target) {
      case 'none': return null;
      case 'ownUnit': {
        const l = locate(state, target);
        if (!l || l.owner !== p) return 'Choose one of your units in the Arena.';
        if (l.u.defeated) return 'That unit is Defeated.';
        return null;
      }
      case 'ownActive': {
        const l = locate(state, target);
        if (!l || l.owner !== p || l.zone !== 'active') return 'Choose one of your Active units.';
        if (l.u.defeated) return 'That unit is Defeated.';
        if (!emptySlots(P.ready).length) return 'Your Ready Zone is full.';
        return null;
      }
      case 'ownGraveUnit': {
        const c = P.grave.find(x => x.uid === target);
        if (!c || !isUnitCard(c)) return 'Choose a fighter or character in your Graveyard.';
        return null;
      }
      case 'oppSupport': {
        const s = O.support.find(x => x.uid === target);
        if (!s) return "Choose a card in your opponent's Support Zone.";
        if (s.tapped) return 'That card is already tapped.';
        return null;
      }
      case 'ownSupportFighter': {
        const s = P.support.find(x => x.uid === target);
        if (!s || def(s).type !== 'fighter') return 'Choose a fighter in your Support Zone.';
        if (!emptySlots(P.ready).length) return 'Your Ready Zone is full.';
        return null;
      }
    }
    return 'Unknown target.';
  }

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
        if (!(a.index >= 0 && a.index < 2) || P.active[a.index]) return 'Choose an empty Active slot.';
        return null;
      }
      case 'retreat': {
        if (phase !== 'arming') return 'You can only Retreat during your Arming phase.';
        const l = locate(state, a.unitUid);
        if (!l || l.owner !== p || l.zone !== 'active') return 'Choose one of your Active units.';
        if (l.u.defeated) return 'Defeated units cannot Retreat.';
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
        if (state.declared.some(d => d.attackerUid === a.unitUid)) return 'That unit has already declared an attack.';
        const atk = def(l.u).attacks[a.attackIndex];
        if (!atk) return 'Unknown attack.';
        const t = locate(state, a.targetUid);
        if (!t || t.owner === p || t.zone !== 'active') return "Target one of your opponent's Active units.";
        if (t.u.defeated) return 'That unit is already Defeated.';
        const pay = a.payment || autoPay(state, p, atk.cost, l.u.uid);
        if (!pay) return 'You cannot pay for that attack.';
        return checkPayment(state, p, atk.cost, l.u.uid, pay);
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
      case 'shift': {
        if (phase !== 'resolving') return 'Characters can only Shift during your Resolving phase.';
        let from = null, card = inHand(a.cardUid);
        if (card) from = 'hand';
        else { card = P.support.find(s => s.uid === a.cardUid); if (card) from = 'support'; }
        if (!card) return 'Choose a character in your hand or Support Zone.';
        const d = def(card);
        if (d.type !== 'character' || !d.shift) return 'That card cannot Shift.';
        if (from === 'hand' && P.playedUnit) return 'Shifting from your hand counts as your Ready Zone play, which you already used.';
        let onto = null;
        if (a.onto) {
          const l = locate(state, a.onto);
          if (!l || l.owner !== p) return 'Choose one of your characters in the Arena.';
          onto = l.u;
          if (onto.defeated) return 'That character is Defeated.';
          if (def(onto).type !== 'character' || def(onto).baseName !== d.baseName) return 'It must Shift onto a ' + d.baseName + '.';
          if (onto.id === card.id) return 'It must Shift onto a different version.';
        } else {
          if (from === 'hand') return 'From your hand, a character can only Shift on top of a matching character.';
          if (d.shift.ontoOnly) return 'This version can only Shift on top of a matching character.';
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

  function* doAction(state, p, a) {
    const P = state.players[p], O = state.players[1 - p];
    const takeFromHand = uid => P.hand.splice(P.hand.findIndex(c => c.uid === uid), 1)[0];
    switch (a.type) {
      case 'playReady': {
        const c = takeFromHand(a.cardUid);
        P.ready[a.index] = newUnit(c);
        P.playedUnit = true;
        emit(state, { type: 'play', uid: c.uid, zone: 'ready', text: pname(state, p) + ' plays ' + cname(c) + ' into the Ready Zone.' });
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
        if (ab.effect.type === 'token') addTokens(state, u, ab.effect.token, ab.effect.n || 1);
        return;
      }
      case 'declare': {
        const u = unitByUid(state, a.unitUid);
        const atk = def(u).attacks[a.attackIndex];
        const pay = a.payment || autoPay(state, p, atk.cost, u.uid);
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
          nu.damage = old.damage;
          nu.tokens = old.tokens;
          nu.attachments = old.attachments;
          nu.used = old.used;
          nu.reacted = old.reacted;
          nu.stack = old.stack.concat([bareCard(old)]);
          P[l.zone][l.index] = nu;
          emit(state, { type: 'shift', uid: nu.uid, text: 'Shift! ' + cname(old) + ' becomes ' + d.name + '.' });
          if (nu.damage >= hp(nu)) yield* markDefeated(state, nu, null);
        } else {
          P[a.zone][a.index] = nu;
          emit(state, { type: 'shift', uid: nu.uid, text: 'Shift! ' + d.name + ' returns from the Support Zone to the Arena.' });
        }
        return;
      }
    }
  }

  function retreatUnit(state, p, l, index) {
    const P = state.players[p];
    const slot = index != null ? index : emptySlots(P.ready)[0];
    P.active[l.index] = null;
    for (const t of TYPES) l.u.tokens[t] = 0;
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
    const d = def(c), e = d.effect;
    const P = state.players[p], O = state.players[1 - p];
    emit(state, { type: 'powerup', uid: c.uid, player: p, cardId: c.id, target, text: pname(state, p) + ' plays ' + d.name + '.' });
    let attached = false;
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
        P.ready[emptySlots(P.ready)[0]] = newUnit(bareCard(s));
        emit(state, { type: 'move', uid: s.uid, text: cname(s) + ' leaves the Support Zone and enters the Ready Zone.' });
        break;
      }
    }
    if (!attached) P.grave.push(bareCard(c));
  }

  // ───────────────────────── turn structure ─────────────────────────

  function* removeDefeated(state) {
    const gains = [];
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
          if (hasKeyword(u, 'Honourable')) gains.push({ player: p, n: 1, reason: 'Honourable ' + cname(u) + ' died' });
          if (isCharacter(u) && u.killer && u.killer.isCharacter && u.killer.owner !== p) {
            gains.push({ player: u.killer.owner, n: 1, reason: u.killer.name + ' killed a character' });
          }
        });
      }
    }
    yield* gainFavour(state, gains);
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
    state.turnInfo = { defeatedActive: [[], []], bothAwarded: [false, false] };

    state.phase = 'arming';
    emit(state, { type: 'turn', player: p, text: '── Turn ' + state.turn + ': ' + pname(state, p) + ' ──' });
    emit(state, { type: 'phase', phase: 'arming', player: p });

    if (P.support.some(s => s.tapped)) {
      for (const s of P.support) s.tapped = false;
      emit(state, { type: 'untap', player: p });
    }
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
      while (!P.hand.some(isUnitCard) && guard++ < 30) {
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
      declared: [], resolvingStarted: false, turnInfo: { defeatedActive: [[], []], bothAwarded: [false, false] },
      pending: null, winner: null, winReason: '', events: [], rigged: (cfg.rigged || []).slice(),
      noSnapshots: !!cfg.noSnapshots, maxTurns: cfg.maxTurns || 0,
      players: [0, 1].map(p => ({
        name: (cfg.names && cfg.names[p]) || 'Player ' + (p + 1),
        deck: [], hand: [], grave: [], support: [], active: [null, null], ready: [null, null, null],
        favour: 0, playedUnit: false, playedSupport: false, playedPowerUp: false, setup: null,
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
    locate, unitByUid, arenaUnits, hasKeyword, availTokens, tokenHolders, attackTypes, reactionOptions,
    emptySlots, isCharacter, isUnitCard, def, hp, TYPES, HAND_LIMIT, FAVOUR_TO_WIN, STATUS_KEYWORDS,
  };
});
