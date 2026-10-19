// Plays many bot-vs-bot games headlessly to check the engine never crashes or
// stalls, and reports win rates between difficulty levels.
//   node tests/simulate.js [games=200]
'use strict';
const Cards = require('../public/js/cards.js');
const E = require('../public/js/engine.js');
const Bots = require('../public/js/bots.js');

const N = +process.argv[2] || 200;

for (const d of Cards.PRESET_DECKS) {
  const problems = Cards.validateDeck(d.cards);
  if (problems.length) { console.error('Deck', d.name, problems); process.exit(1); }
}

function play(levels, decks, seed) {
  const g = new E.Game({ decks, names: levels.map((l, i) => l + i), seed, noSnapshots: true, maxTurns: 150 });
  let steps = 0;
  const kinds = {};
  while (g.pending) {
    const c = g.pending;
    kinds[c.kind + (c.purpose ? ':' + c.purpose : '')] = (kinds[c.kind + (c.purpose ? ':' + c.purpose : '')] || 0) + 1;
    const view = E.viewFor(g.state, c.player);
    const ans = Bots.decide(levels[c.player], view, view.pending);
    const err = g.submit(c.player, ans);
    if (err) throw new Error('Bot answer rejected (' + c.kind + '): ' + err + ' ' + JSON.stringify(ans));
    g.takeSteps();
    if (++steps > 20000) throw new Error('Stalled');
  }
  return { winner: g.state.winner, reason: g.state.winReason, turns: g.state.turn, kinds };
}

const matchups = [['easy', 'easy'], ['medium', 'easy'], ['hard', 'easy'], ['hard', 'medium'], ['medium', 'medium'], ['hard', 'hard']];
const reasons = {};
const allKinds = {};
for (const [a, b] of matchups) {
  let wa = 0, wb = 0, dr = 0, turns = 0;
  for (let i = 0; i < N; i++) {
    const D = Cards.PRESET_DECKS.length;
    const da = Cards.PRESET_DECKS[i % D].cards, db = Cards.PRESET_DECKS[(i + 1 + (i >> 2)) % D].cards;
    // Alternate seats so seat order does not bias the result.
    const swap = i % 2 === 1;
    const levels = swap ? [b, a] : [a, b];
    const r = play(levels, swap ? [db, da] : [da, db], 1000 + i);
    turns += r.turns;
    const key = r.reason.replace(/^.*?(reached 10 Favour|no units left|empty deck|Turn limit|Both).*$/, '$1');
    reasons[key] = (reasons[key] || 0) + 1;
    for (const k in r.kinds) allKinds[k] = (allKinds[k] || 0) + r.kinds[k];
    if (r.winner === 'draw') dr++;
    else if ((r.winner === 0) !== swap) wa++; else wb++;
  }
  console.log(`${a.padEnd(6)} vs ${b.padEnd(6)}: ${wa}-${wb} (draws ${dr}), avg turns ${(turns / N).toFixed(1)}`);
}
console.log('Win reasons:', reasons);
console.log('Decision kinds seen:', allKinds);
