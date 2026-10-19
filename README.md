# Battle Cards — Gladiators of the Multiverse

A browser client for **Battle Cards**, with a full rules engine, animated drag-and-drop play, an interactive tutorial, three bot opponents, a deck builder and online multiplayer.

## Running it

**Offline (tutorial, bots, deck builder):** open `public/index.html` in a browser. You don't need to install anything.

**With online play:** you need [Node.js](https://nodejs.org) 18 or newer. No npm packages are required.

```bash
node server.js            # → http://localhost:8080
PORT=3000 node server.js  # use a different port
```

Open the address in a browser and choose **Play Online → Create Room**. Your opponent opens the same address, chooses **Join** and types the 4-letter room code. To play over the internet, run `server.js` on any Node host (a VPS, Render, Railway, Fly.io and so on) and share its URL.

## Features

- **Rules engine** (`public/js/engine.js`). It implements every section of the rulebook: setup with simultaneous face-down placement and mulligans, the Arming, Fighting and Resolving phases, energy with tapping and dual types, energy tokens, all attack, reaction, unit and token keywords, the four statuses, Shift, Veteran, all six Favour sources, the three win conditions, draws, and the 7-card hand limit. Each decision either player has to make pauses the engine until that player answers, including decisions during the opponent's turn: spending tokens to negate damage, counterattacking or intervening, triggering a Veteran.
- **Game board** in the style of Hearthstone and MTG Arena. You can drag cards from your hand onto zones, or click a card for its action menu. It draws attack arrows, rolls animated dice, shows floating damage numbers and banners, and animates cards between zones. Hover any card for a large preview with explanations of its keywords and statuses. The board also shows a phase tracker, a per-turn limit tracker, a game log, a graveyard viewer and synthesized sound effects.
- **Tutorial**: a scripted 25-step lesson against Instructor Brutus. It covers setup, energy, Ready plays, Power Ups and tokens, declaring and resolving attacks, Defeat, Poison, dual energy, Parry, Counterattack, Brutal and Favour, then continues as free play.
- **Bots**:
  - **Rookie** (Easy): plays loosely.
  - **Gladiator** (Medium): plays greedily for expected damage and kills.
  - **Champion** (Hard): plans pairs of attacks, avoids counterattacks, saves energy for its own reactions, retreats dying units, pairs characters for Favour and manages its deck size.
- **Deck builder**: filter and search cards, check deck legality, save decks in the browser, and export or import decks as codes.
- **Online**: the server runs the engine for both players, and each player only receives what they are allowed to see. A reconnecting player gets the current board and the game log.

## Project layout

```
server.js              online server (static files + JSON/SSE API), no dependencies
public/index.html      the app
public/css/style.css
public/js/cards.js     ← card database & preset decks (edit this to change cards)
public/js/engine.js    rules engine (runs in browser and Node)
public/js/bots.js      AI opponents
public/js/ui.js        board rendering, input, animations, prompts
public/js/render.js    card faces
public/js/tutorial.js  tutorial script
public/js/controllers.js  local (bot) and remote (server) game controllers
public/js/deckbuilder.js, main.js, rules.js, sound.js
tests/rules.test.js    22 rule-scenario tests
tests/simulate.js      bot-vs-bot simulator (crash testing + balance data)
```

## Adding and editing cards

The rulebook doesn't list any cards, so I designed **53 placeholder cards** to cover every mechanic: 29 fighters, 10 character versions across 5 characters, and 14 Power Ups. There are also 4 preset decks. The art is emoji.

Everything about a card is data in `public/js/cards.js`. The schema is documented at the top of that file. The card text you see in the game is generated from that data, and the engine and bots read the same fields, so you never write rules text by hand. Example:

```js
{ id: 'iron_legionnaire', name: 'Iron Legionnaire', type: 'fighter', energy: ['M'], hp: 7, art: '🛡️',
  keywords: ['Parry'],
  attacks: [
    { name: 'Gladius Thrust', cost: ['M'], damage: 2 },
    { name: 'Shield Bash', cost: ['M', 'T'], damage: 3, keywords: ['Counterattack'] },
  ] },
```

Power Ups use a small set of effect types (tokens, cleanse, heal, draw, attach, retreat, favour, recall, tap a support card, reinforce). To add a new kind of effect, add a case to `resolvePowerUp` in `engine.js`.

## How I interpreted unclear rules

Where the rulebook leaves room for more than one reading, the engine does the following. Each one is a small change if you meant something else.

1. **Dying blow.** The Defeat check is step 7, after reactions (step 6). So a unit that takes lethal damage can still Counterattack before it is Defeated.
2. **Blinded** attacks deal no damage, but their status-keyword rolls still happen. Rule 9.2.5 says those rolls happen "even if all of the damage was negated".
3. **Confused** attacks hit the attacker for 1d3 Martial damage. They have no effect on the target at all, so no status rolls and no Brutal.
4. **Embolden** applies when both units have *declared* attacks in the Fighting phase. It does not need both attacks to resolve.
5. **Tokens on rolls.** "+1 to any dice roll" is offered for status-removal, Parry and status-infliction rolls only when it would change the result. For damage dice it is always offered.
6. **Activated abilities** (Meditate, Calibrate and so on) can only be used in your Arming phase, once per turn per unit, as the rulebook says. On my placeholder cards they cost 1 energy of their own type. When they were free, units built up so many tokens that games stalled.
7. **Simultaneous effects** resolve in a fixed order: the active player's things first, then in board order. The engine doesn't yet ask the active player to choose the order. In practice this almost never matters.
8. **Shift** can be used onto any version with the same base name, including a lower one. The bots only Shift upward.
9. **Factions.** Vaultborne and Scellian SIB are tagged on cards but have no mechanics, because the rulebook says those are "to be added".

## Testing

```bash
npm test                 # or: node --test tests/rules.test.js
npm run simulate         # or: node tests/simulate.js 100
```

### What the bot-vs-bot simulation shows (useful for playtesting)

These numbers are from 100 games per matchup with the preset decks:

| Matchup | Result |
|---|---|
| Hard vs Easy | 100–0 |
| Medium vs Easy | 87–13 |
| Hard vs Medium | ~55–60% to Hard |

Games last about 25 turns in total. The most common way games end is a **deck-out** (about half of all games), then 10 Favour, then an emptied Arena.

The reason is the draw rule. You draw *up to* 5, or just 1 if you already hold 5 or more. So playing out your hand speeds up your own deck-out, and holding 5+ cards slows it down. The Hard bot uses this. If you want more games to end in combat, you could try more damage per energy, a smaller Ready Zone, or a "draw 2" floor.
