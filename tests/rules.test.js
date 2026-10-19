// Scenario tests for individual rules.   node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');

let uidN = 0;
function unit(p, id, extra) {
  return Object.assign({ uid: 'u' + (++uidN), id, owner: p, damage: 0, tokens: { M: 0, A: 0, T: 0, S: 0, E: 0, P: 0, V: 0 }, statuses: [],
    defeated: false, attachments: [], stack: [], used: {}, reacted: false, killer: null, marks: [], kills: 0, voidGained: 0, counters: {}, hpBonus: 0 }, extra || {});
}
function sup(g, p, id, tapped) {
  const s = { uid: 's' + (++uidN), id, owner: p, tapped: !!tapped };
  g.state.players[p].support.push(s);
  return s;
}

/** A game at player 0's first Arming phase, with empty Arenas apart from filler in Ready. */
function newGame(opts) {
  opts = opts || {};
  const deck = Array(40).fill('gladiator_recruit');
  const g = new E.Game({ decks: [deck, deck.slice()], stacked: [true, true], rigged: [6, 1], noSnapshots: true, names: ['A', 'B'] });
  g.submit(0, { first: 0 });
  for (const p of [0, 1]) g.submit(p, { placements: [{ uid: g.state.players[p].hand[0].uid, zone: 'ready', index: 2 }] });
  assert.equal(g.pending.kind, 'main');
  return g;
}
function place(g, p, zone, index, id, extra) {
  const u = unit(p, id, extra);
  g.state.players[p][zone][index] = u;
  return u;
}
function rig(g, ...vals) { g.state.rigged.push(...vals); }
function ok(g, p, a) { const err = g.submit(p, a); assert.equal(err, null, 'submit failed: ' + err + ' ' + JSON.stringify(a)); }
/** Answers interrupt choices with a policy until a main choice is pending. */
function settle(g, policy) {
  policy = policy || {};
  let guard = 0;
  while (g.pending && g.pending.kind !== 'main' && guard++ < 50) {
    const c = g.pending;
    let a;
    if (c.kind === 'tokens') a = { n: policy.tokens != null ? Math.min(policy.tokens, c.max) : 0 };
    else if (c.kind === 'reaction') a = { option: policy.reaction != null ? policy.reaction : -1 };
    else if (c.kind === 'veteran') a = { slot: policy.veteran === false ? -1 : c.slots[0] };
    else if (c.kind === 'discard') a = { uids: g.state.players[c.player].hand.slice(0, c.n).map(x => x.uid) };
    if (policy.seen) policy.seen.push(c);
    ok(g, c.player, a);
  }
}
const toFighting = g => ok(g, 0, { type: 'endPhase' });
function attack(g, attacker, idx, target, policy) {
  ok(g, attacker.owner, { type: 'declare', unitUid: attacker.uid, attackIndex: idx, targetUid: target.uid });
  ok(g, attacker.owner, { type: 'endPhase' });
  settle(g, policy);
}

test('damage, defeat at step 7 and removal in Resolving', () => {
  const g = newGame();
  const a = place(g, 0, 'active', 0, 'arena_brawler');
  const t = place(g, 1, 'active', 0, 'gladiator_recruit');
  sup(g, 0, 'gladiator_recruit'); sup(g, 0, 'gladiator_recruit');
  toFighting(g);
  attack(g, a, 1, t); // Pile Driver: 8 damage, Brutal
  assert.equal(t.damage, 8);
  assert.equal(t.defeated, true);
  assert.equal(g.state.players[0].favour, 1, 'Brutal grants 1 Favour');
  assert.equal(g.state.phase, 'resolving');
  assert.equal(g.state.players[1].active[0], null, 'removed in Resolving');
  assert.equal(g.state.players[1].grave.length, 1);
});

test('Parry halves on 5+, never against Long Ranged', () => {
  const g = newGame();
  const a = place(g, 0, 'active', 0, 'berserker');
  const t = place(g, 1, 'active', 0, 'iron_legionnaire');
  for (let i = 0; i < 3; i++) sup(g, 0, 'gladiator_recruit');
  toFighting(g);
  rig(g, 5);
  attack(g, a, 1, t); // Reckless Cleave 10 → parried to 5
  assert.equal(t.damage, 5);

  const g2 = newGame();
  const m = place(g2, 0, 'active', 0, 'crossbow_marksman');
  const t2 = place(g2, 1, 'active', 0, 'iron_legionnaire');
  sup(g2, 0, 'legion_tactician');
  toFighting(g2);
  rig(g2, 4); // Headshot die; no Parry roll should follow
  attack(g2, m, 0, t2);
  assert.equal(t2.damage, 5);
});

test('energy tokens negate matching damage only', () => {
  const g = newGame();
  const a = place(g, 0, 'active', 0, 'arena_brawler');
  const t = place(g, 1, 'active', 0, 'honour_guard', { tokens: { M: 1, A: 2, T: 0, S: 0, E: 0, P: 0, V: 0 } });
  sup(g, 0, 'gladiator_recruit');
  toFighting(g);
  const seen = [];
  attack(g, a, 0, t, { tokens: 5, seen }); // Haymaker 4 Martial
  const neg = seen.find(c => c.kind === 'tokens' && c.purpose === 'negate');
  assert.equal(neg.max, 1, 'only the Martial token can negate Martial damage');
  assert.equal(t.damage, 3);
  assert.deepEqual(t.tokens, { M: 0, A: 2, T: 0, S: 0, E: 0, P: 0, V: 0 });
});

test('a lethally damaged unit can still Counterattack; reactions cannot chain', () => {
  const g = newGame();
  const a = place(g, 0, 'active', 0, 'berserker');
  const t = place(g, 1, 'active', 0, 'valeria_pit', { damage: 2 }); // Taunting Strike [M] 4 Counterattack, 10 HP left
  for (let i = 0; i < 3; i++) sup(g, 0, 'gladiator_recruit');
  sup(g, 1, 'gladiator_recruit');
  toFighting(g);
  const seen = [];
  attack(g, a, 1, t, { reaction: 0, seen }); // 10 damage = lethal
  assert.equal(seen.filter(c => c.kind === 'reaction').length, 1);
  assert.equal(a.damage, 4, 'counterattack landed');
  assert.equal(t.defeated, true);
  assert.equal(g.state.players[1].support[0].tapped, true, 'reaction paid with untapped Support');
});

test('Long Ranged attacks do not trigger reactions', () => {
  const g = newGame();
  const a = place(g, 0, 'active', 0, 'mirror_sprite');
  const t = place(g, 1, 'active', 0, 'valeria_pit');
  sup(g, 0, 'ember_acolyte'); sup(g, 1, 'gladiator_recruit');
  toFighting(g);
  const seen = [];
  rig(g, 1); // Blinding roll fails
  attack(g, a, 0, t, { reaction: 0, seen });
  assert.equal(seen.filter(c => c.kind === 'reaction').length, 0);
});

test('Intervention: partner reacts unless it is also a declared target', () => {
  for (const alsoTargeted of [false, true]) {
    const g = newGame();
    const a = place(g, 0, 'active', 0, 'arena_brawler');
    const a2 = place(g, 0, 'active', 1, 'gladiator_recruit');
    const t = place(g, 1, 'active', 0, 'gladiator_recruit');
    const guard = place(g, 1, 'active', 1, 'honour_guard'); // Guardian's Riposte [M] Intervention
    sup(g, 0, 'gladiator_recruit'); sup(g, 0, 'gladiator_recruit'); sup(g, 1, 'gladiator_recruit');
    toFighting(g);
    ok(g, 0, { type: 'declare', unitUid: a.uid, attackIndex: 0, targetUid: t.uid });
    if (alsoTargeted) ok(g, 0, { type: 'declare', unitUid: a2.uid, attackIndex: 0, targetUid: guard.uid });
    ok(g, 0, { type: 'resolve', index: 0 });
    const offered = g.pending.kind === 'reaction';
    assert.equal(offered, !alsoTargeted);
    settle(g, { reaction: 0 });
    if (!alsoTargeted) assert.equal(a.damage, 4);
  }
});

test('Embolden adds a d6 to the partner when both declare attacks', () => {
  const g = newGame();
  const cmd = place(g, 0, 'active', 0, 'field_commander');
  const b = place(g, 0, 'active', 1, 'arena_brawler');
  const t = place(g, 1, 'active', 0, 'mech_walker');
  sup(g, 0, 'legion_tactician'); sup(g, 0, 'gladiator_recruit');
  toFighting(g);
  ok(g, 0, { type: 'declare', unitUid: cmd.uid, attackIndex: 0, targetUid: t.uid });
  ok(g, 0, { type: 'declare', unitUid: b.uid, attackIndex: 0, targetUid: t.uid });
  rig(g, 4); // Embolden die for the Brawler
  ok(g, 0, { type: 'resolve', index: 1 });
  settle(g);
  assert.equal(t.damage, 8, 'Haymaker 4 + Embolden 4');
  ok(g, 0, { type: 'resolve', index: 0 });
  settle(g);
  assert.equal(t.damage, 12, 'the Embolden unit itself gets no bonus');
});

test('Poison: lands on 4+, ticks 1d3 at Arming, can be shaken off when attacking', () => {
  const g = newGame();
  const h = place(g, 0, 'active', 0, 'pit_hound');
  const t = place(g, 1, 'active', 0, 'arena_brawler');
  sup(g, 0, 'gladiator_recruit');
  toFighting(g);
  rig(g, 4);
  attack(g, h, 0, t);
  assert.deepEqual(t.statuses, ['Poisoned']);
  rig(g, 6); // B's Arming: Poison deals 1d3 = 3
  ok(g, 0, { type: 'endPhase' }); // end turn
  settle(g);
  assert.equal(t.damage, 2 + 3);
  // B attacks with the poisoned Brawler and shakes Poison off (roll 5)
  sup(g, 1, 'gladiator_recruit');
  ok(g, 1, { type: 'endPhase' });
  rig(g, 5);
  attack(g, t, 0, h);
  assert.deepEqual(t.statuses, []);
});

test('Confused attackers hit themselves; Blinded attackers deal no damage', () => {
  const g = newGame();
  const c = place(g, 0, 'active', 0, 'arena_brawler', { statuses: ['Confused'] });
  const t = place(g, 1, 'active', 0, 'mech_walker');
  sup(g, 0, 'gladiator_recruit');
  toFighting(g);
  rig(g, 1, 4); // fail to remove Confused, then 1d3 = 2
  attack(g, c, 0, t);
  assert.equal(c.damage, 2);
  assert.equal(t.damage, 0);

  const g2 = newGame();
  const b = place(g2, 0, 'active', 0, 'arena_brawler', { statuses: ['Blinded'] });
  const t2 = place(g2, 1, 'active', 0, 'mech_walker');
  sup(g2, 0, 'gladiator_recruit');
  toFighting(g2);
  rig(g2, 3);
  attack(g2, b, 0, t2);
  assert.equal(t2.damage, 0);
});

test('Favour: excess damage, character kill, Honourable, both Active defeated', () => {
  const g = newGame();
  const v = place(g, 0, 'active', 0, 'valeria_champion'); // character
  const b = place(g, 0, 'active', 1, 'berserker');
  const ch = place(g, 1, 'active', 0, 'hale_junior', { damage: 2 }); // character, 8 HP left (Sunfire Edge's 10 leaves only 2 excess)
  const hg = place(g, 1, 'active', 1, 'honour_guard', { damage: 10 }); // Honourable, 2 HP left
  for (let i = 0; i < 6; i++) sup(g, 0, 'veteran_pikeman');
  toFighting(g);
  ok(g, 0, { type: 'declare', unitUid: v.uid, attackIndex: 1, targetUid: ch.uid }); // Sunfire Edge 5 → 4 excess? needs 1, deals 5 → excess 4
  ok(g, 0, { type: 'declare', unitUid: b.uid, attackIndex: 0, targetUid: hg.uid });
  ok(g, 0, { type: 'endPhase' });
  settle(g);
  const favour = g.state.players.map(P => P.favour);
  // A: Brutal (Sunfire Edge) +1, both Active defeated +1, Valeria killed a character +1 = 3. B: Honourable +1.
  assert.deepEqual(favour, [3, 1]);

  const g2 = newGame();
  const ber = place(g2, 0, 'active', 0, 'berserker');
  const c2 = place(g2, 1, 'active', 0, 'hale_junior', { damage: 9 });
  for (let i = 0; i < 3; i++) sup(g2, 0, 'gladiator_recruit');
  toFighting(g2);
  attack(g2, ber, 1, c2); // 10 damage vs 1 needed → 9 excess to a character
  assert.equal(g2.state.players[0].favour, 2, 'excess damage + Brutal');
});

test('two characters in the Active Zone grant Favour in Resolving', () => {
  const g = newGame();
  place(g, 0, 'active', 0, 'valeria_pit');
  place(g, 0, 'active', 1, 'hale_junior');
  ok(g, 0, { type: 'endPhase' }); ok(g, 0, { type: 'endPhase' }); ok(g, 0, { type: 'endPhase' });
  assert.equal(g.state.players[0].favour, 1);
});

test('Veteran jumps from Support to Ready when the opponent gains Favour', () => {
  const g = newGame();
  const a = place(g, 0, 'active', 0, 'arena_brawler');
  const t = place(g, 1, 'active', 0, 'gladiator_recruit');
  sup(g, 0, 'gladiator_recruit'); sup(g, 0, 'gladiator_recruit');
  const vet = sup(g, 1, 'veteran_pikeman');
  toFighting(g);
  const seen = [];
  attack(g, a, 1, t, { seen }); // Brutal → A gains Favour → B's Veteran may trigger
  assert.ok(seen.some(c => c.kind === 'veteran' && c.player === 1));
  assert.ok(g.state.players[1].ready.some(u => u && u.uid === vet.uid));
  assert.ok(!g.state.players[1].support.includes(vet));
});

test('Shift from hand counts as the Ready play; damage carries, statuses clear', () => {
  const g = newGame();
  const base = place(g, 0, 'active', 0, 'hale_junior', { damage: 3, statuses: ['Poisoned'], tokens: { M: 0, A: 0, T: 1, S: 0, E: 0, P: 0, V: 0 } });
  const card = { uid: 'hc1', id: 'hale_chief', owner: 0 };
  g.state.players[0].hand.push(card);
  sup(g, 0, 'legion_tactician'); sup(g, 0, 'legion_tactician');
  assert.match(E.validateAction(g.state, 0, { type: 'shift', cardUid: 'hc1', onto: base.uid }), /Resolving/);
  ok(g, 0, { type: 'endPhase' }); ok(g, 0, { type: 'endPhase' });
  ok(g, 0, { type: 'shift', cardUid: 'hc1', onto: base.uid });
  const u = g.state.players[0].active[0];
  assert.equal(u.id, 'hale_chief');
  assert.equal(u.damage, 3);
  assert.equal(u.tokens.T, 1);
  assert.deepEqual(u.statuses, []);
  assert.equal(u.stack.length, 1);
  assert.equal(g.state.players[0].playedUnit, true);
});

test('Shift from the Support Zone into an empty slot', () => {
  const g = newGame();
  const s = sup(g, 0, 'valeria_pit');
  sup(g, 0, 'gladiator_recruit'); sup(g, 0, 'gladiator_recruit');
  ok(g, 0, { type: 'endPhase' }); ok(g, 0, { type: 'endPhase' });
  assert.match(E.validateAction(g.state, 0, { type: 'shift', cardUid: s.uid, zone: 'active', index: 0, payment: { support: [s.uid, g.state.players[0].support[1].uid], tokens: [] } }), /Support Zone/,
    'a Shifting card cannot pay for itself');
  ok(g, 0, { type: 'shift', cardUid: s.uid, zone: 'active', index: 0 });
  assert.equal(g.state.players[0].active[0].id, 'valeria_pit');
  assert.equal(g.state.players[0].support.length, 2);
});

test('Resonance lets other units spend its tokens', () => {
  const g = newGame();
  const b = place(g, 0, 'active', 0, 'arena_brawler');
  place(g, 0, 'ready', 0, 'spirit_wisp', { tokens: { M: 2, A: 0, T: 0, S: 0, E: 0, P: 0, V: 0 } });
  const t = place(g, 1, 'active', 0, 'mech_walker');
  toFighting(g);
  attack(g, b, 1, t); // Pile Driver [M,M] paid entirely by the Wisp's tokens
  assert.equal(t.damage, 8);
});

test('Retreat costs 2 energy and discards tokens but keeps damage', () => {
  const g = newGame();
  const u = place(g, 0, 'active', 0, 'arena_brawler', { damage: 2, tokens: { M: 3, A: 0, T: 0, S: 0, E: 0, P: 0, V: 0 }, statuses: ['Ablaze'] });
  assert.ok(E.validateAction(g.state, 0, { type: 'retreat', unitUid: u.uid }));
  sup(g, 0, 'ember_acolyte'); sup(g, 0, 'legion_tactician');
  ok(g, 0, { type: 'retreat', unitUid: u.uid, index: 0 });
  assert.equal(g.state.players[0].ready[0], u);
  assert.equal(u.tokens.M, 0);
  assert.equal(u.damage, 2);
  assert.deepEqual(u.statuses, ['Ablaze']);
});

test('drawing: up to 5, or 1 if holding 5+; empty deck loses', () => {
  const g = newGame();
  const A = g.state.players[0], B = g.state.players[1];
  const endTurn = p => { for (let i = 0; i < 3; i++) ok(g, p, { type: 'endPhase' }); settle(g); };
  B.hand.splice(2);
  assert.equal(A.hand.length, 6, 'first player did not draw on turn 1');
  endTurn(0);
  assert.equal(B.hand.length, 5, 'B drew up to 5');
  endTurn(1);
  assert.equal(A.hand.length, 7, 'A held 6, so drew exactly 1');
  A.deck.length = 0;
  endTurn(0);
  endTurn(1);
  assert.equal(g.state.winner, 1);
  assert.match(g.state.winReason, /empty deck/);
});

test('arena wipe wins at the end of the Resolving phase', () => {
  const g = newGame();
  g.state.players[1].ready[2] = null;
  const a = place(g, 0, 'active', 0, 'arena_brawler');
  const t = place(g, 1, 'active', 0, 'gladiator_recruit', { damage: 5 });
  sup(g, 0, 'gladiator_recruit');
  toFighting(g);
  attack(g, a, 0, t);
  ok(g, 0, { type: 'endPhase' });
  assert.equal(g.state.winner, 0);
});

test('10 Favour wins immediately', () => {
  const g = newGame();
  g.state.players[0].favour = 9;
  const a = place(g, 0, 'active', 0, 'arena_brawler');
  const t = place(g, 1, 'active', 0, 'gladiator_recruit');
  sup(g, 0, 'gladiator_recruit'); sup(g, 0, 'gladiator_recruit');
  toFighting(g);
  attack(g, a, 1, t);
  assert.equal(g.state.winner, 0);
  assert.equal(g.state.phase, 'gameover');
});

test('hand limit: discard down to 7 at end of turn', () => {
  const g = newGame();
  const P = g.state.players[0];
  while (P.hand.length < 9) P.hand.push(P.deck.shift());
  ok(g, 0, { type: 'endPhase' }); ok(g, 0, { type: 'endPhase' }); ok(g, 0, { type: 'endPhase' });
  assert.equal(g.pending.kind, 'discard');
  assert.equal(g.pending.n, 2);
  settle(g);
  assert.equal(P.hand.length, 7);
});

test('one unit to Ready, one to Support and one Power Up per turn', () => {
  const g = newGame();
  const P = g.state.players[0];
  P.hand.push({ uid: 'pw1', id: 'second_wind', owner: 0 }, { uid: 'pw2', id: 'second_wind', owner: 0 });
  ok(g, 0, { type: 'playReady', cardUid: P.hand[0].uid, index: 0 });
  assert.ok(E.validateAction(g.state, 0, { type: 'playReady', cardUid: P.hand[0].uid, index: 1 }));
  ok(g, 0, { type: 'playSupport', cardUid: P.hand[0].uid });
  assert.ok(E.validateAction(g.state, 0, { type: 'playSupport', cardUid: P.hand[0].uid }));
  ok(g, 0, { type: 'playPowerUp', cardUid: 'pw1', target: null });
  assert.ok(E.validateAction(g.state, 0, { type: 'playPowerUp', cardUid: 'pw2', target: null }));
});

test('views hide the opponent hand and both decks', () => {
  const g = newGame();
  const v = E.viewFor(g.state, 0);
  assert.ok(v.players[1].hand.every(c => c.hidden && !c.id));
  assert.ok(v.players[0].hand.every(c => c.id));
  assert.equal(v.players[0].deck.length, 0);
  assert.equal(v.players[1].deckCount, g.state.players[1].deck.length);
});

// ───────────────────────── deck-set mechanics ─────────────────────────

test('tokens can only be spent by the unit they are on (or through Resonance)', () => {
  const g = newGame();
  const b = place(g, 0, 'active', 0, 'arena_brawler');
  place(g, 0, 'active', 1, 'iron_legionnaire', { tokens: { M: 3, A: 0, T: 0, S: 0, E: 0, P: 0, V: 0 } });
  const t = place(g, 1, 'active', 0, 'mech_walker');
  toFighting(g);
  assert.match(E.validateAction(g.state, 0, { type: 'declare', unitUid: b.uid, attackIndex: 0, targetUid: t.uid }), /cannot pay/);
});

test('faction tokens (Evidence, Pressure, Void) are counters, not energy', () => {
  const g = newGame();
  const b = place(g, 0, 'active', 0, 'arena_brawler', { tokens: { M: 0, A: 0, T: 0, S: 0, E: 3, P: 3, V: 3 } });
  const t = place(g, 1, 'active', 0, 'mech_walker');
  toFighting(g);
  assert.ok(E.validateAction(g.state, 0, { type: 'declare', unitUid: b.uid, attackIndex: 0, targetUid: t.uid }));
});

test('Shifted forms can only enter the Arena by Shifting', () => {
  const g = newGame();
  g.state.players[0].hand.push({ uid: 'sv5', id: 'ax_sov5', owner: 0 });
  assert.match(E.validateAction(g.state, 0, { type: 'playReady', cardUid: 'sv5', index: 0 }), /only enter the Arena by Shifting/);
  assert.equal(E.validateAction(g.state, 0, { type: 'playSupport', cardUid: 'sv5' }), null, 'it can still be played as energy');
});

test('Evidence: Psychometric Strike spends Evidence for +2 damage each', () => {
  const g = newGame();
  const m = place(g, 0, 'active', 0, 'tb_mara_threshold', { tokens: { M: 0, A: 0, T: 0, S: 0, E: 3, P: 0, V: 0 } });
  const t = place(g, 1, 'active', 0, 'mech_walker');
  sup(g, 0, 'legion_tactician'); sup(g, 0, 'legion_tactician');
  toFighting(g);
  attack(g, m, 0, t, { tokens: 3 });
  assert.equal(t.damage, 9 + 6);
  assert.equal(g.state.players[0].stats.spent.E, 3);
});

test('Containment Aura and taunt restrict targets', () => {
  const g = newGame();
  const a = place(g, 0, 'active', 0, 'arena_brawler');
  sup(g, 0, 'gladiator_recruit');
  const sov = place(g, 1, 'active', 0, 'ax_sov1');
  const guard = place(g, 1, 'active', 1, 'ax_asset');
  toFighting(g);
  assert.match(E.validateAction(g.state, 0, { type: 'declare', unitUid: a.uid, attackIndex: 0, targetUid: sov.uid }), /cannot be targeted/);
  guard.marks.push({ k: 'taunt', until: 99 });
  const other = place(g, 1, 'active', 1, 'mech_walker', { marks: [] });
  g.state.players[1].active[1] = other;
  g.state.players[1].ready[1] = guard;
  // Sovereign is now beside a fighter (Mech Walker), so still untargetable; Mech Walker is a legal target.
  assert.equal(E.validateAction(g.state, 0, { type: 'declare', unitUid: a.uid, attackIndex: 0, targetUid: other.uid }), null);
});

test('Voidborn units gain Void tokens from damage and can Shift at their threshold', () => {
  const g = newGame();
  const a = place(g, 0, 'active', 0, 'arena_brawler');
  sup(g, 0, 'gladiator_recruit'); sup(g, 0, 'gladiator_recruit');
  const m = place(g, 1, 'active', 0, 'ho_murkling');
  toFighting(g);
  attack(g, a, 1, m); // 8 damage → 2 Void tokens (1 per 3 taken)
  assert.equal(m.tokens.V, 2);
  assert.equal(m.voidGained, 2);
});

test('Phalanx flips into Shattered once badly hurt', () => {
  const g = newGame();
  const ph = place(g, 0, 'active', 0, 'ax_phalanx', { damage: 18 });
  ok(g, 0, { type: 'endPhase' }); ok(g, 0, { type: 'endPhase' });
  ok(g, 0, { type: 'transform', unitUid: ph.uid });
  const u = g.state.players[0].active[0];
  assert.equal(u.id, 'ax_phalanx_shattered');
  assert.equal(u.damage, 18);
});

test('Loyal Crew: a Shift lets a crew fighter leave the Support Zone', () => {
  const g = newGame();
  const ex = place(g, 0, 'active', 0, 'oa_abyssclaw');
  const ex2 = place(g, 0, 'active', 1, 'oa_probe');
  g.state.players[0].hand.push({ uid: 'nm', id: 'oa_abyssclaw_n', owner: 0 });
  const crew = sup(g, 0, 'oa_hull');
  sup(g, 0, 'oa_sonar'); sup(g, 0, 'oa_sonar');
  const t = place(g, 1, 'active', 0, 'mech_walker');
  toFighting(g);
  ok(g, 0, { type: 'declare', unitUid: ex.uid, attackIndex: 0, targetUid: t.uid });
  ok(g, 0, { type: 'declare', unitUid: ex2.uid, attackIndex: 0, targetUid: t.uid });
  ok(g, 0, { type: 'endPhase' });
  settle(g);
  ok(g, 0, { type: 'shift', cardUid: 'nm', onto: ex.uid });
  assert.equal(g.pending.kind, 'pick');
  ok(g, 0, { uid: crew.uid });
  assert.ok(g.state.players[0].ready.some(u => u && u.id === 'oa_hull'));
});
