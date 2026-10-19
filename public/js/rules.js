/* Battle Cards — in-game rules reference (condensed from the official rulebook). */
(function () {
  'use strict';
  const C = window.BCCards;
  const kw = names => '<table>' + names.map(n => '<tr><th>' + n + '</th><td>' + C.KEYWORD_TEXT[n] + '</td></tr>').join('') + '</table>';

  window.BCRulesHTML = `
<h3>1. How to win</h3>
<p>You win the moment any of these is true:</p>
<ul><li>Your opponent has no fighters or characters in their Arena (Active + Ready Zones) — checked at the end of every Resolving phase.</li>
<li>Your opponent must draw a card and cannot.</li><li>You reach <b>10 Favour</b>.</li></ul>
<p>If both players would lose at the same time, the game is a draw.</p>
<div class="box"><b>The Golden Rule:</b> if a card contradicts the rules, the card wins. "May" is optional. The active player orders simultaneous effects. Round down. Cards are only played from hand on your own turn.</div>

<h3>2. Cards</h3>
<p><b>Fighters</b> and <b>Characters</b> are <i>units</i>: they have HP, attacks (which cost energy) and energy symbols. Any unit can instead be played into your <b>Support Zone</b> as an energy source. Characters have versions sharing a base name and can <b>Shift</b>. <b>Power Ups</b> are free, one per turn, in any phase of your turn.</p>
<p><b>Decks:</b> exactly 40 cards, max 2 copies of a card, max 1 copy of each character version.</p>

<h3>3. The play area</h3>
<ul><li><b>Active Zone</b> (2 slots): only Active units attack, react, and can be targeted.</li>
<li><b>Ready Zone</b> (3 slots): waiting units. They keep damage, tokens and statuses.</li>
<li><b>Support Zone</b>: energy sources (unlimited). Not units — can't attack, be targeted or take damage.</li>
<li>Units are never played from hand straight into the Active Zone after setup.</li></ul>

<h3>4. Energy</h3>
<ul><li>Tap an untapped Support card for 1 energy of its type (dual cards: either type, not both).</li>
<li>Untap all your Support cards at the start of your Arming phase. Unspent energy is lost.</li>
<li>Typed costs need matching energy; Retreat's 2 energy can be any type.</li>
<li>An attack deals damage of every energy type in its cost.</li></ul>
<div class="box"><b>Holding energy back:</b> Counterattack and Intervention happen on your opponent's turn and are paid with untapped Support cards and/or tokens — leave energy unspent on your turn if you want to react.</div>
<p><b>Energy tokens</b> sit on units. Discard one at any time to: negate 1 damage of its type to that unit, pay 1 matching energy for that unit's attack, or add +1 to any roll that unit makes. Tokens are discarded when the unit leaves the Arena or Retreats.</p>

<h3>5. Setup</h3>
<ul><li>Shuffle; roll off — the winner chooses who goes first.</li><li>Draw 7. Mulligan (reveal, reshuffle, redraw) if your hand has no units.</li>
<li>Both players secretly place 1–4 units into any Active/Ready slots, then reveal.</li><li>The first player skips their first draw.</li></ul>

<h3>6. Turn structure</h3>
<p><b>1. Arming</b> — untap; Poisoned/Ablaze units take status damage; draw up to 5 (or 1 if you already have 5+). Then, in any order:</p>
<ul><li>Play one unit from hand into an empty Ready slot.</li><li>Play one unit from hand into your Support Zone.</li><li>Play a Power Up (one per turn, any phase).</li>
<li>Move Ready units into empty Active slots (free).</li><li>Retreat Active units to Ready (2 energy; discard their tokens).</li><li>Use activated abilities (each once per turn).</li></ul>
<p><b>2. Fighting</b> — each Active unit may use one attack. Declare and pay for <i>all</i> attacks first, then resolve them one at a time in any order.</p>
<p><b>3. Resolving</b> — remove all Defeated units (both players'); Shift characters; move Ready units into empty Active slots; gain 1 Favour if you have two characters Active; check for a winner; discard down to 7.</p>

<h3>7. Resolving an attack</h3>
<ol><li><b>Status rolls:</b> roll a d6 per attacker status; 4+ removes it.</li><li><b>Roll damage:</b> Headshot, Salvo, Embolden dice.</li>
<li><b>Defend:</b> Parry roll and/or tokens negate damage.</li><li><b>Deal damage.</b></li><li><b>Effects:</b> status keyword rolls (even if all damage was negated).</li>
<li><b>Reactions:</b> the defender may Counterattack / Intervene.</li><li><b>Defeat check:</b> damage ≥ HP means Defeated.</li></ol>
<p>A Defeated unit stays in place until the next Resolving phase but cannot attack, react, use abilities or be targeted. If an attack's target is already Defeated, the attack has no effect (its energy is still spent).</p>
<p><b>Reactions</b> are only triggered by damage from an enemy attack (not status/self damage, not Long Ranged). One reaction per unit per turn; a reaction can't trigger another.</p>

<h3>8. Shifting</h3>
<ul><li>Only in your Resolving phase, when the card's condition/cost is met.</li>
<li>From hand: on top of a matching-base-name character in your Arena (counts as your Ready play).</li>
<li>From Support: into an empty Arena slot, or on top of a matching character.</li>
<li>Damage and tokens carry over; statuses are removed; the stack goes to the Graveyard together.</li></ul>

<h3>9. Favour</h3>
<table><tr><td>One attack deals 5+ excess damage to an opposing character</td><th>+1</th></tr>
<tr><td>One of your characters kills an opposing character</td><th>+1</th></tr>
<tr><td>Both of your opponent's Active units are Defeated in the same turn</td><th>+1</th></tr>
<tr><td>Two characters in your Active Zone during your Resolving phase</td><th>+1</th></tr>
<tr><td>One of your Honourable units dies</td><th>+1</th></tr>
<tr><td>Your Brutal attack Defeats an opposing unit</td><th>+1</th></tr></table>
<p>Whenever a player gains Favour, their opponent's Veteran units in the Support Zone may jump into the Ready Zone.</p>

<h3>10. Statuses</h3>
<table>${Object.keys(C.STATUS_TEXT).map(s => '<tr><th>' + s + '</th><td>' + C.STATUS_TEXT[s] + '</td></tr>').join('')}</table>
<p>Inflicted on a 4+ after the attack resolves. Statuses don't stack, stay through Retreat, and are removed by Shifting or leaving the Arena. Status damage can't be Parried but can be negated by matching tokens.</p>

<h3>11. Attack keywords</h3>
${kw(['Binding', 'Blinding', 'Brutal', 'Burn', 'Confuse', 'Headshot', 'Long Ranged', 'Poison', 'Salvo', 'Counterattack', 'Intervention'])}
<h3>12. Unit &amp; token keywords</h3>
${kw(['Embolden', 'Honourable', 'Parry', 'Resonance', 'Shift', 'Veteran', 'Armour', 'Meditate', 'Sharpen', 'Strategize', 'Calibrate'])}

<h3>13. Faction rules (the five deck sets)</h3>
${kw(['Resonance', 'Evidence', 'Pressure', 'Voidborn', 'Void', 'Loyal Crew'])}
<ul>
<li><b>Shifted forms</b> — a character version that says "Shift onto … only" can only enter the Arena by Shifting. You can still play it as energy and Shift it from your Support Zone later.</li>
<li><b>Flip cards</b> (Vantage, Null, Phalanx) turn into their second form in your Resolving phase once the listed condition is met.</li>
<li><b>Effect damage</b> from triggers and Power Ups is not an attack: it can't be Parried or negated with tokens and never triggers reactions.</li>
<li><b>Area attacks</b> ("all") hit every opposing Active unit; only the main target can react.</li>
<li>Temporary effects shown as icons on units: 🫥 untargetable · 🎯 must be targeted · 🧱 guarding · ♾️ cannot be killed · ½ deals half damage · ⛔ cannot attack · 🔇 cannot react · 🎲 bonus die.</li>
</ul>

<h3>14. Implementation notes</h3>
<p class="muted">Where the rulebook leaves room for interpretation, this client does the following:
a unit that took lethal damage can still Counterattack (the Defeat check is step 7, after reactions);
a Blinded attack deals no damage but still rolls for its status keywords;
a Confused attack skips its effects on the target; Parry is rolled automatically, and spending tokens on a roll is offered only when it would change the result;
Embolden applies when both units have <i>declared</i> attacks; payments are chosen automatically unless "manual payment" is turned on in Settings.
The core-set factions (Vaultborne, Scellian SIB) are tags only; the five deck sets add their own mechanics above.</p>
`;
})();
