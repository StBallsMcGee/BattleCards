// Deck balance report: every preset deck plays every other (Hard bot on both sides).
//   node tests/balance.js [gamesPerPair=10]
'use strict';
const Cards = require('../public/js/cards.js');
const E = require('../public/js/engine.js');
const Bots = require('../public/js/bots.js');
const N = +process.argv[2] || 10;
const decks = Cards.PRESET_DECKS;
const wins = {}, games = {}, reasons = {};
let errors = 0;
for (const d of decks) { wins[d.id] = 0; games[d.id] = 0; }
for (let a = 0; a < decks.length; a++) for (let b = a + 1; b < decks.length; b++) {
  for (let i = 0; i < N; i++) {
    const seat = i % 2 ? [b, a] : [a, b];
    const g = new E.Game({ decks: seat.map(k => decks[k].cards), names: seat.map(k => decks[k].id), seed: a * 1000 + b * 50 + i, noSnapshots: true, maxTurns: 150 });
    let steps = 0;
    try {
      while (g.pending) {
        const c = g.pending;
        const v = E.viewFor(g.state, c.player);
        const err = g.submit(c.player, Bots.decide('hard', v, v.pending));
        if (err) throw new Error(decks[seat[c.player]].id + ' ' + c.kind + ': ' + err);
        g.takeSteps();
        if (++steps > 30000) throw new Error('stalled');
      }
    } catch (e) { errors++; if (errors < 5) console.error(e.stack || e); continue; }
    const w = g.state.winner;
    games[decks[a].id]++; games[decks[b].id]++;
    if (w !== 'draw') wins[decks[seat[w]].id]++;
    const r = g.state.winReason.replace(/^.*?(10 Favour|no units left|empty deck|Turn limit|Both).*$/, '$1');
    reasons[r] = (reasons[r] || 0) + 1;
  }
}
for (const d of decks) console.log(d.name.padEnd(24), (100 * wins[d.id] / games[d.id]).toFixed(0).padStart(3) + '% of ' + games[d.id]);
console.log('Endings:', reasons, 'errors:', errors);
