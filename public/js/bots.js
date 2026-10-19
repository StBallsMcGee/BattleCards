/*
 * Battle Cards — computer opponents.
 *
 * decide(level, view, choice) returns an answer for any engine choice.
 * Bots only see what a human in their seat would see (a viewFor() state).
 *
 *   easy   "Rookie"   — plays what it can, attacks somewhat at random, rarely reacts.
 *   medium "Gladiator" — greedy: maximises expected damage, finishes kills, always reacts.
 *   hard   "Champion" — plans attack pairs (Embolden, kills, Brutal/Favour), avoids
 *                       counterattacks, keeps energy back for its own reactions,
 *                       retreats dying units, times Shifts and Power Ups.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'));
  else root.BCBots = factory(root.BCCards, root.BCEngine);
})(typeof self !== 'undefined' ? self : this, function (Cards, E) {
  'use strict';

  const LEVELS = {
    easy: { name: 'Rookie', title: 'Easy', deck: 'steel', blurb: 'A nervous first-timer. Learns the ropes as you do.' },
    medium: { name: 'Gladiator', title: 'Medium', deck: 'storm', blurb: 'Hits hard and goes for the kill, but rarely thinks ahead.' },
    hard: { name: 'Champion', title: 'Hard', deck: 'vault', blurb: 'Plans every exchange, baits reactions and plays to the crowd.' },
  };

  const def = c => Cards.byId[c.id];
  // Tuning knobs for the hard bot (overridable for experiments).
  const TUNE = { energyPenalty: 0.35, riskMult: 0.6, riskLethalMult: 1.5, reserve: 1 };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const remaining = u => def(u).hp - u.damage;

  function legal(view, a) { return !E.validateAction(view, view.me, a); }

  // ───────────── evaluation helpers ─────────────

  function attackBase(atk) {
    let d = atk.salvo ? atk.salvo * 3.5 : (atk.damage || 0);
    if (atk.keywords.includes('Headshot')) d += 3.5;
    return d;
  }

  function expectedDamage(view, A, atk, T, embolden) {
    if (A.statuses.includes('Confused')) return 0.5 * (attackBase(atk) + (embolden ? 3.5 : 0)) * 0.5;
    let d = attackBase(atk) + (embolden ? 3.5 : 0);
    d += A.attachments.reduce((s, c) => s + (def(c).effect.bonusDamage || 0), 0);
    if (A.statuses.includes('Blinded')) d *= 0.5; // half the time it shakes Blinded off
    const types = E.attackTypes(atk);
    const arm = def(T).armour;
    if (arm) { let r = 0; for (const t of types) r = Math.max(r, arm[t] || 0); d = Math.max(0, d - r); }
    if (E.hasKeyword(T, 'Parry') && !atk.keywords.includes('Long Ranged')) d = d * (2 / 3) + Math.floor(d / 2) / 3;
    d -= Math.min(d, E.availTokens(view, T, types));
    return d;
  }

  function unitThreat(u) {
    // Rough offensive value of a unit: its best attack.
    return Math.max(0, ...def(u).attacks.map(attackBase));
  }

  function unitValue(u) {
    const d = def(u);
    let v = remaining(u) + unitThreat(u) * 1.2;
    if (d.type === 'character') v += 3;
    for (const k of ['Parry', 'Embolden', 'Resonance', 'Honourable']) if (d.keywords.includes(k)) v += 1;
    if (d.attacks.some(a => a.keywords.includes('Counterattack') || a.keywords.includes('Intervention'))) v += 1;
    return v;
  }

  function cardValueInHand(c) {
    const d = def(c);
    if (d.type === 'powerup') return 4;
    return d.hp + Math.max(0, ...d.attacks.map(attackBase)) * 1.2 + (d.type === 'character' ? 3 : 0);
  }

  function statusValue(st) { return { Poisoned: 2.5, Ablaze: 2.5, Blinded: 3, Confused: 3.5 }[st] || 0; }

  // Energy types the bot's units want, weighted by how often they appear in attack costs.
  function energyNeeds(view) {
    const P = view.players[view.me];
    const need = { M: 0, A: 0, T: 0, S: 0 };
    const units = E.arenaUnits(P).concat(P.hand.filter(c => E.isUnitCard(c)));
    for (const u of units) for (const a of def(u).attacks) for (const t of a.cost) if (need[t] != null) need[t] += 1;
    const have = { M: 0, A: 0, T: 0, S: 0 };
    for (const s of P.support) for (const t of def(s).energy) have[t] += 1 / def(s).energy.length;
    const out = {};
    for (const t of E.TYPES) out[t] = need[t] / (1 + have[t]);
    return out;
  }

  // ───────────── main decisions ─────────────

  function setup(level, view) {
    const P = view.players[view.me];
    const units = P.hand.filter(c => E.isUnitCard(c) && !E.shiftOnly(c));
    const placements = [];
    if (level === 'easy') {
      const n = Math.min(units.length, 1 + Math.floor(Math.random() * 3));
      const shuffled = units.slice().sort(() => Math.random() - 0.5);
      for (let i = 0; i < n; i++) placements.push({ uid: shuffled[i].uid, zone: i < 2 ? 'active' : 'ready', index: i < 2 ? i : i - 2 });
      return { placements };
    }
    // Keep shift-only character versions in hand; sort the rest by value.
    const candidates = units.filter(c => !(def(c).shift && def(c).shift.ontoOnly)).sort((a, b) => cardValueInHand(b) - cardValueInHand(a));
    const pool = candidates.length ? candidates : units;
    // Keep at least two units in hand to use as energy if we can.
    // Keep a couple of units back as energy — Shifted forms in hand already serve that purpose.
    const keep = Math.max(0, (level === 'hard' ? 2 : 1) - P.hand.filter(c => E.isUnitCard(c) && E.shiftOnly(c)).length);
    const n = Math.max(1, Math.min(4, pool.length - Math.max(0, keep - (units.length - pool.length))));
    for (let i = 0; i < n; i++) {
      placements.push({ uid: pool[i].uid, zone: i < 2 ? 'active' : 'ready', index: i < 2 ? i : i - 2 });
    }
    return { placements };
  }

  function powerUpTargets(view, c) {
    const me = view.me, P = view.players[me], O = view.players[1 - me];
    if (def(c).target === 'none') return [null];
    const uids = E.arenaUnits(P).concat(E.arenaUnits(O)).map(u => u.uid)
      .concat(P.support.map(s => s.uid), O.support.map(s => s.uid), P.grave.map(g => g.uid));
    return uids.filter(t => !E.validateAction(view, me, { type: 'playPowerUp', cardUid: c.uid, target: t }));
  }

  /** Generic value of a data-driven Power Up (effects list). */
  function scoreEffects(view, c, t) {
    const me = view.me, P = view.players[me], O = view.players[1 - me];
    const d = def(c);
    const u = t ? E.unitByUid(view, t) : null;
    const enemy = u && u.owner !== me;
    let s = 0;
    for (const e of d.effects) {
      if (e.if && !E.cond(view, e.if, { p: me, target: u })) continue;
      switch (e.do) {
        case 'tokens': s += e.token === 'P' ? 1.5 * e.n : (e.n === 'double' ? (u ? Math.min(4, E.TOKEN_KINDS.reduce((a, k) => a + u.tokens[k], 0)) : 0) : (e.n || 1)) * (enemy ? -0.5 : 1); break;
        case 'damage': s += e.to === 'allUnits' ? (E.arenaUnits(O).length - E.arenaUnits(P).length) * e.n * 0.6 : e.n; break;
        case 'removeTokens': s += u ? (e.damagePer || 1) * Math.max(0, E.TOKEN_KINDS.reduce((a, k) => a + (e.token === 'all' || e.token === k ? u.tokens[k] : 0), 0)) : 0; break;
        case 'draw': s += P.hand.length <= 4 && P.deckCount > 8 ? 2 * e.n : 0; break;
        case 'favour': s += 6; break;
        case 'heal': s += u ? Math.min(e.n === 'd6' ? 3.5 : e.n, u.damage) : 0; break;
        case 'recall': s += 4; break;
        case 'fromSupport': case 'toActive': s += 2.5; break;
        case 'toReady': s += u && u.damage > E.hp(u) / 2 ? 3 : 0.3; break;
        case 'destroy': s += -2; break;
        case 'chooseStatus': s += 3; break;
        case 'cleanse': s += E.arenaUnits(P).reduce((a, x) => a + x.statuses.length, 0) * 1.5; break;
        case 'flag': s += 1; break;
        case 'contaminateCheck': s += 1; break;
        case 'mark': {
          const good = { untargetable: 2.5, undying: u && remaining(u) < 8 ? 4 : 1.5, freeAttack: 5, interveneAny: 2, bonusDie: 2.5, unparryable: 0.5, grantParry: 1.5,
            ignoreShiftCond: 0, canShiftNow: 0, plusDamage: 2, regen: 2, shiftOnKill: 0.5, noAttack: 3.5 }[e.mark];
          s += good || 1;
          if (e.mark === 'ignoreShiftCond' && u) {
            // Only worth it if a matching upgrade is in hand or support.
            const up = P.hand.concat(P.support).some(x => def(x).shift && def(x).baseName === E.baseName(u) && def(x).hp > def(u).hp);
            s += up ? 5 : -5;
          }
          break;
        }
      }
    }
    return s;
  }

  /** Scores playing power-up c on target t (higher is better; <= 0 means don't). */
  function scorePowerUp(view, c, t) {
    const me = view.me, P = view.players[me], O = view.players[1 - me];
    if (def(c).effects) return scoreEffects(view, c, t);
    const e = def(c).effect;
    const u = t ? E.unitByUid(view, t) : null;
    const loc = t ? E.locate(view, t) : null;
    switch (e.type) {
      case 'tokens': {
        if (!u) return 0;
        const uses = def(u).attacks.some(a => a.cost.includes(e.token)) ? 2 : 0.5;
        return (loc.zone === 'active' ? 3 : 1) + uses;
      }
      case 'cleanse': return u ? u.statuses.reduce((s, st) => s + statusValue(st), 0) - 1 : 0;
      case 'heal': return u ? Math.min(e.n, u.damage) * (remaining(u) <= 3 ? 1.5 : 1) - 1 : 0;
      case 'draw': return P.hand.length <= 4 && P.deckCount > 8 ? 4 : 0;
      case 'attach': {
        if (!u) return 0;
        if (e.bonusDamage) return loc.zone === 'active' ? 3 + unitThreat(u) / 4 : 0.5;
        if (e.grant && E.hasKeyword(u, e.grant)) return 0;
        return (loc.zone === 'active' ? 2 : 1) + remaining(u) / 4;
      }
      case 'retreat': {
        if (!u) return 0;
        const ready = P.ready.filter(x => x && !x.defeated);
        return remaining(u) <= 2 && ready.length ? 4 + unitValue(u) / 4 : 0;
      }
      case 'favour': return P.active.some(x => x && !x.defeated && E.isCharacter(x)) ? 6 : 0;
      case 'recall': {
        const g = P.grave.find(x => x.uid === t);
        return g ? cardValueInHand(g) / 3 : 0;
      }
      case 'tapSupport': {
        if (view.phase !== 'fighting' || view.declared.length) return 0;
        const s = O.support.find(x => x.uid === t);
        // Better when the opponent has reactions they could pay for.
        const reacts = O.active.some(x => x && !x.defeated && def(x).attacks.some(a =>
          (a.keywords.includes('Counterattack') || a.keywords.includes('Intervention')) && a.cost.some(ct => def(s).energy.includes(ct))));
        return reacts ? 3.5 : 0.5;
      }
      case 'reinforce': {
        const s = P.support.find(x => x.uid === t);
        return s && E.arenaUnits(P).length <= 2 ? 2 + def(s).hp / 4 : 0;
      }
    }
    return 0;
  }

  function bestPowerUp(level, view, phaseFilter) {
    const P = view.players[view.me];
    if (P.playedPowerUp) return null;
    let best = null;
    for (const c of P.hand) {
      if (def(c).type !== 'powerup') continue;
      for (const t of powerUpTargets(view, c)) {
        const a = { type: 'playPowerUp', cardUid: c.uid, target: t };
        if (!legal(view, a)) continue;
        let s = scorePowerUp(view, c, t);
        if (phaseFilter && !phaseFilter(def(c).effect || { type: 'effects' })) continue;
        if (level === 'easy') s = s > 0 ? Math.random() * 3 : 0;
        if (s > 0.5 && (!best || s > best.s)) best = { a, s };
      }
    }
    return best && best.a;
  }

  function arming(level, view) {
    const me = view.me, P = view.players[me], O = view.players[1 - me];
    const handUnits = P.hand.filter(E.isUnitCard);
    const arenaCount = E.arenaUnits(P).length;

    // Hard plays deck-aware: drawing is "up to 5", so holding cards slows your own deck-out.
    const conserve = level === 'hard' && P.deckCount <= O.deckCount + 2 && P.deckCount <= 16 && P.hand.length <= 6;
    const maxCost = Math.max(1, ...E.arenaUnits(P).concat(handUnits).map(u => Math.max(0, ...def(u).attacks.map(a => a.cost.length))));
    const energyCap = level === 'hard' ? maxCost * 2 + 2 : 99;

    // 1. Energy: play a unit to the Support Zone.
    if (!P.playedSupport && handUnits.length && (P.support.length < energyCap || P.hand.length >= 7) && !(conserve && P.support.length >= 5)) {
      const wantReady = !P.playedUnit && E.emptySlots(P.ready).length && arenaCount < 3;
      if (!(wantReady && handUnits.length === 1 && P.support.length >= 3)) {
        const need = energyNeeds(view);
        let best = null;
        for (const c of handUnits) {
          const d = def(c);
          let s = d.energy.reduce((x, t) => x + need[t], 0) / d.energy.length * 3 - cardValueInHand(c) * 0.3;
          if (d.shift && !d.shift.ontoOnly) s += 2;           // can come back via Shift
          if (d.keywords.includes('Veteran')) s += 2;          // can come back via Veteran
          if (d.shift && d.shift.ontoOnly) s += 5;             // Shifted forms: energy now, and they can still Shift from Support
          if (level === 'easy') s = Math.random();
          if (!best || s > best.s) best = { c, s };
        }
        return { type: 'playSupport', cardUid: best.c.uid };
      }
    }

    // 2. Power Ups that are best used now.
    const pu = bestPowerUp(level, view, e => e.type !== 'tapSupport' && !(conserve && e.type === 'draw'));
    if (pu && !(conserve && scorePowerUp(view, P.hand.find(c => c.uid === pu.cardUid), pu.target) < 3.5)) return pu;

    // 3. Retreat a dying Active unit (hard).
    if (level === 'hard') {
      for (let i = 0; i < 2; i++) {
        const u = P.active[i];
        if (!u || u.defeated || remaining(u) > 2) continue;
        const sub = P.ready.find(x => x && !x.defeated && remaining(x) >= 4);
        const untapped = P.support.filter(s => !s.tapped).length;
        if (sub && untapped >= 3 && !def(u).keywords.includes('Honourable')) {
          const a = { type: 'retreat', unitUid: u.uid };
          if (legal(view, a)) return a;
        }
      }
    }

    // 4. Play a unit into the Ready Zone.
    if (!P.playedUnit) {
      const slots = E.emptySlots(P.ready);
      const playable = handUnits.filter(c => {
        const d = def(c);
        if (E.shiftOnly(c)) return false;
        // Hold upgrades if the base character is already in the Arena (to Shift later).
        if (level !== 'easy' && d.type === 'character' && d.shift && d.shift.ontoOnly &&
          E.arenaUnits(P).some(u => def(u).baseName === d.baseName)) return false;
        return true;
      });
      const reserveForEnergy = level === 'easy' ? 0 : (P.support.length < 4 ? 1 : 0);
      const conserveOk = !conserve || arenaCount < 3;
      if (conserveOk && slots.length && playable.length && (handUnits.length > reserveForEnergy || arenaCount <= 1 || P.playedSupport)) {
        const c = level === 'easy' ? pick(playable) : playable.slice().sort((a, b) => cardValueInHand(b) - cardValueInHand(a))[0];
        return { type: 'playReady', cardUid: c.uid, index: slots[0] };
      }
    }

    // 5. Fill the Active Zone.
    const mv = fillActive(level, view);
    if (mv) return mv;

    // 6. Activated abilities, using only energy our attacks won't need.
    const untapped = P.support.filter(s => !s.tapped).length;
    const attackNeed = P.active.reduce((s, u) => s + (u && !u.defeated ? Math.max(0, ...def(u).attacks.map(a => a.cost.length)) : 0), 0);
    const spare = untapped - attackNeed - (level === 'hard' ? 1 : 0);
    for (const u of E.arenaUnits(P)) {
      const abs = def(u).abilities;
      for (let i = 0; i < abs.length; i++) {
        const a = { type: 'ability', unitUid: u.uid, abilityIndex: i };
        if (!legal(view, a)) continue;
        if (abs[i].selfDamage && remaining(u) <= abs[i].selfDamage + 5) continue;
        if (!abs[i].cost.length || (level === 'easy' ? Math.random() < 0.5 : spare >= abs[i].cost.length)) return a;
      }
    }
    return { type: 'endPhase' };
  }

  function fillActive(level, view) {
    const P = view.players[view.me];
    const slots = E.emptySlots(P.active);
    if (!slots.length) return null;
    const ready = P.ready.filter(u => u && !u.defeated);
    if (!ready.length) return null;
    // Hard values pairing two characters in the Active Zone (+1 Favour every turn).
    const pairBonus = x => (level === 'hard' && E.isCharacter(x) && P.active.some(a => a && !a.defeated && E.isCharacter(a)) ? 6 : 0);
    const u = level === 'easy' ? pick(ready) : ready.sort((a, b) => unitValue(b) + pairBonus(b) - unitValue(a) - pairBonus(a))[0];
    return { type: 'moveToActive', unitUid: u.uid, index: slots[0] };
  }

  // Enumerates every legal (attack, target) for unit u given current untapped energy.
  function attackOptions(view, u) {
    const O = view.players[1 - view.me];
    const out = [];
    def(u).attacks.forEach((atk, i) => {
      for (const t of O.active) {
        if (!t || t.defeated) continue;
        const a = { type: 'declare', unitUid: u.uid, attackIndex: i, targetUid: t.uid };
        if (legal(view, a)) out.push({ a, atk, u, t });
      }
    });
    return out;
  }

  function scoreAttack(level, view, o, embolden, alreadyOnTarget) {
    const me = view.me, O = view.players[1 - me];
    const { atk, u, t } = o;
    const exp = expectedDamage(view, u, atk, t, embolden);
    const left = remaining(t) - alreadyOnTarget;
    let s = Math.min(exp, Math.max(0, left)) * 1.0;
    const kills = exp >= left && left > 0;
    if (kills) {
      s += unitValue(t) * 0.8;
      if (atk.keywords.includes('Brutal')) s += 5;
      if (E.isCharacter(u) && E.isCharacter(t)) s += 4;
      if (def(t).keywords.includes('Honourable')) s -= 2;
    }
    if (E.isCharacter(t) && exp - left >= 5) s += 4;
    for (const k of atk.keywords) {
      const st = E.STATUS_KEYWORDS[k];
      if (st && !t.statuses.includes(st) && !kills) s += statusValue(st) * 0.5;
      if (Cards.TOKEN_KEYWORDS[k]) s += 0.7;
    }
    // Counterattack risk (hard looks at the opponent's untapped energy).
    if (level === 'hard' && !atk.keywords.includes('Long Ranged') && exp > 0) {
      let risk = 0;
      def(t).attacks.forEach(ra => {
        if (!ra.keywords.includes('Counterattack') || t.reacted) return;
        const oppView = Object.assign({}, view, { me: 1 - me });
        if (E.canPay(oppView, 1 - me, ra.cost, t.uid)) risk = Math.max(risk, expectedDamage(view, t, ra, u, false));
      });
      for (const r of O.active) {
        if (!r || r === t || r.defeated || r.reacted) continue;
        def(r).attacks.forEach(ra => {
          if (!ra.keywords.includes('Intervention')) return;
          if (E.canPay(view, 1 - me, ra.cost, r.uid)) risk = Math.max(risk, expectedDamage(view, r, ra, u, false));
        });
      }
      s -= risk * (risk >= remaining(u) ? TUNE.riskLethalMult : TUNE.riskMult);
    }
    // Cost of energy spent (it could have funded our own reactions).
    s -= atk.cost.length * (level === 'hard' ? TUNE.energyPenalty : 0.1);
    return s;
  }

  function myReactionReserveValue(view) {
    // Value of untapped energy kept for our own Counterattack / Intervention next turn.
    const P = view.players[view.me];
    let best = 0;
    for (const u of P.active) {
      if (!u || u.defeated) continue;
      for (const a of def(u).attacks) {
        if ((a.keywords.includes('Counterattack') || a.keywords.includes('Intervention')) && E.canPay(view, view.me, a.cost, u.uid)) {
          best = Math.max(best, attackBase(a) * 0.6);
        }
      }
    }
    return best;
  }

  function fighting(level, view) {
    const me = view.me, P = view.players[me];
    // Once attacks start resolving, finish them all in declared order.
    if (view.resolvingStarted) return { type: 'endPhase' };
    // Sabotage-style Power Ups before attacking.
    if (!view.declared.length) {
      const pu = bestPowerUp(level, view, e => e.type === 'tapSupport');
      if (pu) return pu;
    }

    const attackers = P.active.filter(u => u && !u.defeated && !view.declared.some(d => d.attackerUid === u.uid));
    const declaredEmbolden = view.declared.some(d => d.embolden);
    if (!attackers.length) return { type: 'endPhase' };

    if (level === 'easy') {
      const u = pick(attackers);
      const opts = attackOptions(view, u);
      if (opts.length && Math.random() < 0.85) return pick(opts).a;
      const other = attackers.find(x => x !== u);
      const opts2 = other ? attackOptions(view, other) : [];
      if (opts2.length && Math.random() < 0.85) return pick(opts2).a;
      return { type: 'endPhase' };
    }

    // Medium/hard: plan a pair of attacks jointly, then declare the first.
    const plans = [];
    const optsA = attackOptions(view, attackers[0]).concat([null]);
    for (const oa of optsA) {
      if (attackers.length < 2) { plans.push([oa]); continue; }
      // Simulate paying for oa to see what the second attacker can still afford.
      let v2 = view;
      if (oa) {
        v2 = JSON.parse(JSON.stringify(view));
        const pay = E.autoPay(v2, me, oa.atk.cost, oa.u.uid);
        if (!pay) continue;
        for (const uid of pay.support) v2.players[me].support.find(s => s.uid === uid).tapped = true;
        for (const tk of pay.tokens) E.unitByUid(v2, tk.from).tokens[tk.type]--;
      }
      const ub = E.unitByUid(v2, attackers[1].uid);
      const optsB = attackOptions(v2, ub).concat([null]);
      for (const ob of optsB) plans.push([oa, ob ? { a: ob.a, atk: ob.atk, u: attackers[1], t: E.unitByUid(view, ob.t.uid) } : null]);
    }
    let best = null;
    for (const plan of plans) {
      const acts = plan.filter(Boolean);
      const both = acts.length === 2;
      let s = 0;
      const onTarget = {};
      // Order: attacks without Brutal first so Brutal finishers land the kill.
      acts.sort((x, y) => x.atk.keywords.includes('Brutal') - y.atk.keywords.includes('Brutal'));
      for (const o of acts) {
        const partner = acts.find(x => x !== o);
        const emb = (both && partner && E.hasKeyword(partner.u, 'Embolden')) || declaredEmbolden;
        s += scoreAttack(level, view, o, emb, onTarget[o.t.uid] || 0);
        onTarget[o.t.uid] = (onTarget[o.t.uid] || 0) + expectedDamage(view, o.u, o.atk, o.t, emb);
      }
      if (level === 'hard' && acts.length === 0) s += myReactionReserveValue(view) * TUNE.reserve;
      if (both && acts[0].t === acts[1].t) {
        // Double-teaming a target is only worth it when the first hit might not kill.
        const left = remaining(acts[0].t);
        if (expectedDamage(view, acts[0].u, acts[0].atk, acts[0].t, false) >= left + 2) s -= 2;
      }
      if (!best || s > best.s) best = { s, acts };
    }
    if (!best || !best.acts.length || best.s <= 0) return { type: 'endPhase' };
    return best.acts[0].a;
  }

  function resolving(level, view) {
    const me = view.me, P = view.players[me];
    for (const u of E.arenaUnits(P)) {
      const a = { type: 'transform', unitUid: u.uid };
      if (def(u).transform && legal(view, a)) return a;
    }
    // Shift whenever it is legal and improves the unit.
    if (level !== 'easy' || Math.random() < 0.6) {
      const shifts = [];
      const cards = P.hand.concat(P.support).filter(c => def(c).type === 'character' && def(c).shift);
      for (const c of cards) {
        for (const u of E.arenaUnits(P)) {
          const a = { type: 'shift', cardUid: c.uid, onto: u.uid };
          if (legal(view, a) && def(c).hp > def(u).hp) shifts.push({ a, s: def(c).hp - def(u).hp + 5 });
        }
        for (const zone of ['active', 'ready']) {
          P[zone].forEach((x, i) => {
            if (x) return;
            const a = { type: 'shift', cardUid: c.uid, zone, index: i };
            if (legal(view, a) && E.arenaUnits(P).length <= 3) shifts.push({ a, s: def(c).hp / 2 + (zone === 'active' ? 1 : 0) });
          });
        }
      }
      if (shifts.length) return shifts.sort((x, y) => y.s - x.s)[0].a;
    }
    const mv = fillActive(level, view);
    if (mv) return mv;
    const pu = bestPowerUp(level, view, e => ['draw', 'favour', 'recall', 'heal', 'cleanse', 'reinforce'].includes(e.type));
    if (pu) return pu;
    return { type: 'endPhase' };
  }

  // ───────────── interrupt decisions ─────────────

  function tokens(level, view, c) {
    if (level === 'easy') return { n: Math.random() < 0.5 ? c.max : 0 };
    if (c.purpose === 'negate' || c.purpose === 'roll') return { n: c.max };
    if (c.purpose === 'bonus') return { n: c.max };
    if (c.purpose === 'damage') {
      const T = E.unitByUid(view, c.targetUid);
      if (!T) return { n: 0 };
      const left = remaining(T);
      const need = left - c.damage;
      if (level === 'medium') return { n: need > 0 && need <= c.max ? need : Math.min(c.max, 1) };
      // Hard: spend just enough to reach lethal (with a little slack for Parry/armour), otherwise keep them.
      if (need <= 0) return { n: 0 };
      const slack = E.hasKeyword(T, 'Parry') || def(T).armour ? 1 : 0;
      return { n: need + slack <= c.max ? need + slack : 0 };
    }
    return { n: 0 };
  }

  function reaction(level, view, c) {
    if (level === 'easy' && Math.random() < 0.5) return { option: -1 };
    let best = -1, bs = -1;
    c.options.forEach((o, i) => {
      const R = E.unitByUid(view, o.unitUid);
      const A = E.unitByUid(view, c.attackerUid);
      const atk = def(R).attacks[o.attackIndex];
      const s = expectedDamage(view, R, atk, A, false);
      if (s > bs) { bs = s; best = i; }
    });
    return { option: best };
  }

  function discard(level, view, c) {
    const P = view.players[view.me];
    const sorted = P.hand.slice().sort((a, b) => cardValueInHand(a) - cardValueInHand(b));
    return { uids: sorted.slice(0, c.n).map(x => x.uid) };
  }

  function pickUnit(level, view, c) {
    if (level === 'easy' || !c.options.length) return { uid: c.options.length ? pick(c.options).uid : null };
    const me = view.me;
    const units = c.options.map(o => ({ o, u: E.unitByUid(view, o.uid) }));
    const heal = /heal/i.test(c.prompt || '');
    const score = ({ u, o }) => {
      if (!u) return 1; // a card in the Support Zone (Loyal Crew)
      if (u.owner !== me) return 50 - remaining(u) + (u.tokens.E || 0) + (u.tokens.V || 0);
      if (heal) return u.damage;
      // Friendly: favour units close to a Shift threshold, then the strongest.
      const thr = def(u).threshold || 0;
      return (thr ? 10 - Math.max(0, thr - (u.tokens.V || 0)) * 2 : 0) + unitValue(u) / 4;
    };
    units.sort((a, b) => score(b) - score(a));
    return { uid: units[0].o.uid };
  }

  function decide(level, view, choice) {
    switch (choice.kind) {
      case 'firstPlayer': return { first: level === 'easy' && Math.random() < 0.5 ? 1 - view.me : view.me };
      case 'setup': return setup(level, view);
      case 'tokens': return tokens(level, view, choice);
      case 'reaction': return reaction(level, view, choice);
      case 'veteran': return { slot: level === 'easy' && Math.random() < 0.4 ? -1 : choice.slots[0] };
      case 'discard': return discard(level, view, choice);
      case 'pick': return pickUnit(level, view, choice);
      case 'option': {
        const i = choice.options.indexOf('Confused');
        if (i >= 0) return { index: i };
        const need = energyNeeds(view);
        const types = ['M', 'A', 'T', 'S'];
        let best = 0;
        choice.options.forEach((o, k) => { const t = types.find(x => Cards.TYPE_NAMES[x] === o); if (t && need[t] > need[types[best]]) best = k; });
        return { index: Math.min(best, choice.options.length - 1) };
      }
      case 'main': {
        let a;
        if (choice.phase === 'arming') a = arming(level, view);
        else if (choice.phase === 'fighting') a = fighting(level, view);
        else a = resolving(level, view);
        // Safety net: never submit an illegal action.
        return legal(view, a) ? a : { type: 'endPhase' };
      }
    }
    return {};
  }

  return { decide, LEVELS, TUNE };
});
