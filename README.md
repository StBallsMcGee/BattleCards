# Battle Cards — Gladiators of the Multiverse

A browser client for **Battle Cards**, with a full rules engine, animated drag-and-drop play, an interactive tutorial, three bot opponents, a deck builder and online multiplayer.

## Download & play

| | How |
|---|---|
| **Quick play** | Download [`battle-cards.html`](https://github.com/StBallsMcGee/battlecards/releases/latest/download/battle-cards.html) and double-click it. It's one self-contained file with everything, including online play with a friend (see below). No install needed. |
| **Full game with server** | Download [`battle-cards.zip`](https://github.com/StBallsMcGee/battlecards/releases/latest/download/battle-cards.zip), unzip it and run **Start Battle Cards** for your system (Windows `.bat`, Mac `.command`, Linux `start.sh`). You only need this to run your own server, which needs [Node.js](https://nodejs.org) 18+. |
| **In the browser** | https://stballsmcgee.github.io/battlecards/ (once GitHub Pages is switched on: *Settings → Pages → Source: GitHub Actions*). |
| **On a phone** | https://stballsmcgee.github.io/battlecards/mobile/ (see [Playing on a phone](#playing-on-a-phone)), or download [`battle-cards-mobile.html`](https://github.com/StBallsMcGee/battlecards/releases/latest/download/battle-cards-mobile.html). |

Downloads live on the [Releases page](https://github.com/StBallsMcGee/battlecards/releases). Every push to `main` runs the Release workflow, which tests and builds the game and attaches the files (and notes) to the release for the version in `package.json`. To start a new release, bump `version` in `package.json`. You can also build them yourself with `npm run build` (output in `dist/`).

On Mac, the first time you open the `.command` file you may need to right-click it and choose **Open**, because it isn't from an identified developer.

## Playing with a friend

You don't need a server. The two browsers connect directly to each other.

1. Both of you open the game, in any of these ways:
   - the web link (https://stballsmcgee.github.io/battlecards/, or `/mobile/` on a phone),
   - the downloaded `battle-cards.html` / `battle-cards-mobile.html`,
   - your own server.

   You can mix them, for example a phone against a laptop.
2. **You:** choose **Play Online**, pick a deck and press **Create Room**. A 5-letter code appears. Send it to your friend, and keep that screen open.
3. **Your friend:** chooses **Play Online**, picks a deck, types the code and presses **Join**. The game starts for both of you.

The person who creates the room hosts the game: the rules run in their browser, and the friend's browser only receives what that player is allowed to see. If the friend's connection drops, they reconnect automatically and carry on. If the host closes their tab, the game ends. Both of you need an internet connection.

**If it won't connect:**
- **"No room with that code":** check the code, and make sure the host is still on the Create Room screen.
- **"Could not connect to your friend":** some school, office and public Wi-Fi networks block direct connections. Try a phone hotspot or home Wi-Fi.
- **On a phone:** keep the game open and the screen on. Locking the phone or switching apps can drop the connection.

The players are introduced to each other by PeerJS's free public matchmaking service (`0.peerjs.com`). The game itself goes directly between the two browsers. If a network blocks direct connections, the game relays through a free public relay server.

### Using your own server instead

You can use your own server if you'd rather (for example on a network without internet access).

- **Same Wi-Fi:** run the launcher, or `node server.js`. It prints two addresses, and your friend opens the **Same Wi-Fi** one (for example `http://192.168.1.23:8080`) on their device.
  - If it doesn't load, allow Node.js through your computer's firewall. Windows asks the first time.
  - Under **Play Online**, both of you tick **Connect through this server instead**.
- **A public server:** [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/StBallsMcGee/battlecards) gives you a free hosted copy of the game, with its own address that anyone can open.
  - It uses `render.yaml`. Render's free plan sleeps when idle, so the first visit takes about a minute to wake it.

## Playing on a phone

The `mobile/` folder is a second version of the game laid out for phones held upright. It is the same game: it loads the rules engine, bots, tutorial, decks and card art from `public/`, so a rules or card change applies to both versions.

- **Layout:** your opponent is at the top and you are at the bottom, with your hand along the bottom edge and a big button for ending phases.
  - The game log is behind the 📜 button.
  - The Support Zones are strips you can swipe sideways.
- **Touch:** tap a card to see it full-size together with what you can do with it. Tap an opponent's card to read it. Dragging works too, and the card stays above your finger.
- **Install it:**
  1. Open `…/mobile/` on GitHub Pages, or on your own server (see below).
  2. Choose **Add to Home Screen** (Safari's share menu on iPhone, Chrome's ⋮ menu on Android).
  3. The game then opens full-screen like an app and works offline: it caches every file and card image the first time it loads.
- **Online play** works the same as on a computer (see [Playing with a friend](#playing-with-a-friend)). Phone and desktop players can play each other.
- **Desktop link:** the desktop menu links to the phone version, and shows a big button when it's opened on a phone.

How it works: `public/js/ui.js` takes its board positions from a layout object. The desktop layout is the default, and `mobile/js/layout.js` replaces it with a portrait 720×1440 board and turns on touch behaviour. `mobile/css/mobile.css` restyles the menus and panels for a narrow screen.

## Running it

**Offline (tutorial, bots, deck builder):** open `public/index.html` in a browser. You don't need to install anything.

**With online play:** you need [Node.js](https://nodejs.org) 18 or newer. No npm packages are required.

```bash
node server.js            # → http://localhost:8080
PORT=3000 node server.js  # use a different port
```

It prints the address for this computer and the address other devices on your Wi-Fi can use. To play through the server, both players open it, go to **Play Online** and tick **Connect through this server instead**. For a public server, see [Using your own server instead](#using-your-own-server-instead).

## Features

- **Five deck sets from your concept doc** plus four starter decks: 194 cards in total, each with a generated illustration.
- **Rules engine** (`public/js/engine.js`). It implements every section of the rulebook: setup with simultaneous face-down placement and mulligans, the Arming, Fighting and Resolving phases, energy with tapping and dual types, energy tokens, all attack, reaction, unit and token keywords, the four statuses, Shift, Veteran, all six Favour sources, the three win conditions, draws, and the 7-card hand limit. Each decision either player has to make pauses the engine until that player answers, including decisions during the opponent's turn: spending tokens to negate damage, counterattacking or intervening, triggering a Veteran.
- **Game board** in the style of Hearthstone and MTG Arena. You can drag cards from your hand onto zones, or click a card for its action menu. It draws attack arrows, rolls animated dice, shows floating damage numbers and banners, and animates cards between zones. Hover any card for a large preview with explanations of its keywords and statuses. The board also shows a phase tracker, a per-turn limit tracker, a game log, a graveyard viewer and synthesized sound effects.
- **Tutorial**: a scripted 25-step lesson against Instructor Brutus. It covers setup, energy, Ready plays, Power Ups and tokens, declaring and resolving attacks, Defeat, Poison, dual energy, Parry, Counterattack, Brutal and Favour, then continues as free play.
- **Bots**:
  - **Rookie** (Easy): plays loosely.
  - **Gladiator** (Medium): plays greedily for expected damage and kills.
  - **Champion** (Hard): plans pairs of attacks, avoids counterattacks, saves energy for its own reactions, retreats dying units, pairs characters for Favour and manages its deck size.
- **Deck builder**: filter and search cards, check deck legality, save decks in the browser, and export or import decks as codes.
- **Online**: play a friend anywhere with a 5-letter room code. The browsers connect directly (WebRTC), so no server is needed. The host's browser runs the engine, and each player only receives what they are allowed to see. A reconnecting player gets the current board and the game log. The optional server (`server.js`) does the same job for players who use its address.

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
tests/rules.test.js    32 rule-scenario tests
tests/balance.js       deck-vs-deck balance report
tools/gen-art.js       generates the card illustrations
tools/build.js         builds dist/battle-cards.html and battle-cards-mobile.html (single files) and dist/battle-cards.zip
launchers/             start scripts included in the zip
.github/workflows/     Release (downloads) and Pages (play in browser) automation
public/js/sets/        the five concept-doc deck sets
public/js/p2p.js       online play without a server (direct browser-to-browser)
public/js/vendor/      PeerJS 1.5.5 (MIT), used by p2p.js
render.yaml            one-click hosting on Render
mobile/                phone version: index.html, css/mobile.css, js/layout.js (portrait board),
                       sw.js + manifest.webmanifest (install & offline), icons/
tools/gen-icons.js     renders the app icons from mobile/icons/icon.svg
public/art/            card illustrations (SVG)
tests/simulate.js      bot-vs-bot simulator (crash testing + balance data)
```

## Decks

There are nine preconstructed decks, all selectable for you or for a bot:

| Deck | Source | Theme |
|---|---|---|
| **The Elementals** | your concept doc | Portal knights; every unit shares tokens through Resonance |
| **The Threshold Bureau** | your concept doc | Detectives who seed and spend Evidence tokens |
| **The Apex Syndicate** | your concept doc | Sovereign's five-stage escalation behind expendable handlers |
| **Abyssal Octo-Autons** | your concept doc | Explorer crew who Shift into Nightmare forms when both Active units attack |
| **The Hollowing** | your concept doc | Creatures that absorb Void tokens until they cross a threshold and Shift |
| Steel & Strategy, Arcane Storm, Vault Breakers, Shadow Bureau | my placeholder starter set | |

Each concept deck's cards live in their own file in `public/js/sets/`, and all of them appear in the deck builder, which has a set filter.

## Adding and editing cards

All card data lives in `public/js/cards.js` (the starter set) and `public/js/sets/*.js` (one file per faction). The schema and the **effect language** are documented at the top of `cards.js`. Keywords, costs, damage, Shift conditions, triggers (`turnStart`, `death`, `kill`, `damaged`, `enter`, `shiftedInto`, `parried`…), passives and Power Up effects are all written as data, and the engine interprets them. To add a card, add an object to a set file.

### Card art

Every card has an illustration in `public/art/<id>.svg`, made by `node tools/gen-art.js`. They are procedural: each faction has its own scene style, and each card gets a seeded composition built around its creature or emblem. They are not hand-painted or AI-generated, because there is no image model in this environment. To use your own art, drop a PNG or SVG at `public/art/<id>.svg` (or change the path in `render.js`). The emoji only appears if an image is missing.

## Changes I made to the deck concepts

You said the concepts weren't perfect and that I could change things, so here is everything I changed and why.

**Scale.** Your concepts use HP 9–44 and damage 4–20, which is about twice the scale of my original placeholder cards. I doubled the placeholder cards' HP and damage to match, so all decks can play each other.

**New rules that the concepts needed**
- **Binding / Bound** is a new status. A Bound unit can't Retreat, move zones or react, and its attacks deal 2 less damage. It is removed like other statuses (4+ when the unit attacks).
- **Faction tokens** (Evidence, Pressure, Void) are *counters, not energy*. When Pressure and Void could be spent as energy, Apex and The Hollowing got so much free energy that they won almost every game.
- **Shifted forms** (any version that says "Shift onto … only") can only enter the Arena by Shifting. Without this rule the bots played Sovereign Stage 4 straight from hand on turn 8. You can still play them as energy and Shift them from the Support Zone, which the rulebook already allows.
- Unit keywords written on attack lines in the docs (for example "Parry" or "Embolden" next to an attack) are treated as keywords of the unit.
- Abilities that cost "0" and generate tokens every turn mostly cost 1 energy now. Free tokens every turn made games stall.

**Per deck**
- **Elementals:** every unit has Resonance, which is the shared elemental pool. Resonant Surge, whose "tokens count double" was hard to track, now doubles the tokens on one unit (up to +4). Updraft moves a Ready unit into the Active Zone, because moving there is already free.
- **Threshold Bureau:** "on your next fighter to enter" effects place the tokens on Mara herself. Psychic Scent asks you for the source and the destination.
- **Apex Syndicate:**
  - Sovereign's stages have 18/22/26/30/34 HP. Containment Aura needs an Active *fighter* beside him, so pairing him with a character for Favour costs him his protection.
  - Damage redirection (Take the Hit, Bulwark Stance, Absorb Blow) is a "guard" effect, and Designated Target is a taunt.
  - Vantage, Null and Phalanx are flip cards with a second form, because the docs didn't list separate cards for those forms.
- **Octo-Autons:**
  - **Renamed** Kwazii, Peso and Tweak to Corsair Shadowpaw, Medic Deepfin and Tinker Boltwhisker, and "GUP" to "Pod". Those are Octonauts names, and your doc asks for original IP.
  - **Loyal Crew** was redundant: moving Ready units into the Active Zone is already free in Resolving. Now when a crew character Shifts, a Loyal Crew fighter can come out of your Support Zone into the Ready Zone.
  - **HP** is raised to 11–24. At the original HP of 4–12, units died to almost any single hit.
- **Hollowing:**
  - **Void tokens** come from every 3 damage taken and every 4 dealt.
  - **Second Grimstone:** I added a second copy to make 40 cards, as your doc suggested.
  - **The Absence** loses 1 Void token per turn, so it can't stay untargetable forever.
  - **Accelerated Hollowing** is capped at +4 tokens.

**Balance.** In 12 games per pairing (Hard bot on both sides, with the overkill rule and the search cards), the concept decks win 38–84% of their games:

| Deck | Win % |
|---|---|
| Apex Syndicate | 84% |
| Threshold Bureau | 65% |
| Elementals | 61% |
| Hollowing | 56% |
| Octo-Autons | 38% |

Apex gained the most from the overkill rule, because Sovereign's later Stages hit far harder than anything else.

The bot handles effect-heavy decks (Octo-Autons, Hollowing) less skilfully than a person would, so treat these numbers as a starting point for human playtesting. `node tests/balance.js` reruns the report.

## Overkill and deck searching

**Overkill rule.** Any attack that deals 5 or more damage beyond what an opposing unit (fighter *or* character) had left gains 1 Favour. This replaces the rulebook's "5+ excess damage to a character". It applies per unit hit, so a splash or area attack can overkill more than one. More games now end on 10 Favour.

**Draw and tutor Power Ups.** Every deck now has a way to find the cards it depends on. "Search your deck" puts the chosen card into your hand, reveals it and shuffles your deck. A search card can only be played when your deck holds a card it can find.

| Card | Set | Effect |
|---|---|---|
| Call to Arms | starter | Search for another version of a character in your Arena |
| Scouting Report | starter | Draw 1, or 3 if you have a character Active |
| Rift Beacon | Elementals | Search for the Shifted form of an Elemental in your Arena; +1 Science token |
| Portal Scrying | Elementals | Search for an unshifted Elemental character |
| Open Case File | Threshold Bureau | Search for a detective's Threshold form; +1 Evidence |
| Interrogation | Threshold Bureau | Draw 2, or 3 with 3+ Evidence in the Arena |
| Press Conference | Apex Syndicate | Search for Sovereign's *next* Stage; +1 Pressure |
| Contingency Plan | Apex Syndicate | Draw 2, or 3 at Stage 3+ (deck builder only; not in the preset) |
| Deep Sonar Sweep | Octo-Autons | Search for a crew character's Nightmare form (2 in the preset) |
| Supply Drop | Octo-Autons | Search for a Loyal Crew fighter, then draw 1 |
| Specimen Log | Hollowing | Search for the Shifted form of a unit in your Arena (2 in the preset) |
| Catalogue the Hollow | Hollowing | Search for an unshifted Voidborn unit; +1 Void |

To keep the presets at 40 cards, each one dropped a copy of some of its other Power Ups.

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

### What the bot-vs-bot simulation shows (starter decks only) (useful for playtesting)

These numbers are from 100 games per matchup with the preset decks:

| Matchup | Result |
|---|---|
| Hard vs Easy | 100–0 |
| Medium vs Easy | 87–13 |
| Hard vs Medium | ~55–60% to Hard |

Games last about 25 turns in total. The most common way games end is a **deck-out** (about half of all games), then 10 Favour, then an emptied Arena.

The reason is the draw rule. You draw *up to* 5, or just 1 if you already hold 5 or more. So playing out your hand speeds up your own deck-out, and holding 5+ cards slows it down. The Hard bot uses this. If you want more games to end in combat, you could try more damage per energy, a smaller Ready Zone, or a "draw 2" floor.
