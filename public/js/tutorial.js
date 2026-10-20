/*
 * Battle Cards — interactive tutorial.
 *
 * A real game against "Instructor Brutus" with stacked decks, a scripted
 * opponent and pre-set dice for the scripted turns, so every lesson happens on
 * cue. A coach box explains each step, highlights what to click and only
 * accepts the move being taught. After the lesson the game continues as free
 * play against the Easy bot.
 */
(function () {
  'use strict';
  const C = window.BCCards, E = window.BCEngine, Bots = window.BCBots, UI = window.BCUI;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const def = c => C.byId[c.id];

  // ───────── decks ─────────
  const PLAYER_TOP = ['iron_legionnaire', 'arena_brawler', 'gladiator_recruit', 'field_commander', 'whetstone', 'veteran_pikeman', 'honour_guard',
    'valeria_pit', 'valeria_champion', 'smoke_bomb', 'berserker'];
  const TUTOR_TOP = ['pit_hound', 'gladiator_recruit', 'gladiator_recruit', 'hex_weaver', 'ember_acolyte', 'spirit_wisp', 'wyrmling'];
  const TUTOR_REST = ['hex_weaver', 'ember_acolyte', 'wyrmling', 'pit_hound', 'arena_brawler', 'arena_brawler', 'iron_legionnaire', 'iron_legionnaire',
    'berserker', 'honour_guard', 'honour_guard', 'mirror_sprite', 'mirror_sprite', 'storm_elemental', 'storm_elemental', 'spirit_wisp', 'runic_sentinel',
    'runic_sentinel', 'field_commander', 'war_drummer', 'war_drummer', 'legion_tactician', 'legion_tactician', 'whetstone', 'arcane_focus',
    'arcane_focus', 'field_dressing', 'field_dressing', 'crossbow_marksman', 'crossbow_marksman', 'berserker', 'gladiator_recruit', 'hex_weaver'];

  function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function playerDeck() {
    const rest = C.PRESET_DECKS.find(d => d.id === 'steel').cards.slice();
    for (const id of PLAYER_TOP) rest.splice(rest.indexOf(id), 1);
    return PLAYER_TOP.concat(shuffled(rest));
  }
  function tutorDeck() { return TUTOR_TOP.concat(shuffled(TUTOR_REST)).slice(0, 40); }

  // Dice for the scripted turns, in the order the engine rolls them:
  // T0 roll-off 6 v 1 · T2 Poison lands (5) · T3 Poison tick 1d3=1 (2), Brawler fails to shake off Poison (2)
  // T4 Parry fails (2), Poison already on (1) · T5 Poison tick 1d3=1 (1), Brawler shakes off Poison (5)
  const RIGGED = [6, 1, 5, 2, 2, 2, 1, 1, 5];

  // ───────── helpers for finding things on the board ─────────
  const me = v => v.players[0], opp = v => v.players[1];
  const findUnit = (P, id) => E.arenaUnits(P).find(u => u.id === id);
  const handCard = id => $$('#me-hand .hand-card').find(el => el.querySelector('[data-card-id="' + id + '"]'));
  const myUnitEl = id => $('.slot[data-owner="me"] [data-card-id="' + id + '"]');
  const oppUnitEl = id => $('.slot[data-owner="opp"] [data-card-id="' + id + '"]');
  const isMain = (v, phase) => v.pending && v.pending.player === 0 && v.pending.kind === 'main' && (!phase || v.phase === phase);
  const cardIdOf = (v, uid) => { const c = me(v).hand.find(x => x.uid === uid) || me(v).support.find(x => x.uid === uid); if (c) return c.id; const u = E.unitByUid(v, uid); return u && u.id; };

  // ───────── the lesson ─────────
  const STEPS = [
    { title: 'Welcome, gladiator!', next: true,
      text: '<p>Battle Cards is a duel in the Arena of the Multiverse. You win by <b>wiping out your opponent\'s Arena</b>, by reaching <b>10 Favour</b> with the crowd, or when your opponent <b>runs out of cards</b> to draw.</p><p>Instructor Brutus will take it easy on you. Let\'s begin!</p>' },
    { title: 'The roll-off', when: v => v.pending && v.pending.kind === 'firstPlayer',
      text: '<p>Both players roll a die — you won! The winner chooses who goes first.</p><div class="coach-do">Click <b>Go first</b>.</div>',
      hl: () => [$('#prompt [data-a="me"]')], allow: a => a.first === 0, deny: 'Choose "Go first" for this lesson.' },
    { title: 'Your Arena', when: v => v.pending && v.pending.kind === 'setup' && v.pending.player === 0, pos: 'right',
      text: '<p>The <b>Arena</b> has two zones. Units in the <b>Active Zone</b> (the 2 big slots) fight: only they can attack and be attacked. The <b>Ready Zone</b> (3 small slots) holds reinforcements.</p>' +
        '<p>At the start you place 1–4 units, face down. Keep some units in hand — they double as <b>energy</b>.</p>' +
        '<div class="coach-do">Place <b>Iron Legionnaire</b> and <b>Arena Brawler</b> in your two <b>Active</b> slots (click or drag them), then press <b>Ready!</b></div>',
      hl: () => [handCard('iron_legionnaire'), handCard('arena_brawler'), UI.slotEl('me', 'active', 0), UI.slotEl('me', 'active', 1)],
      allow: (a, v) => a.placements && a.placements.length === 2 && a.placements.every(p => p.zone === 'active' && ['iron_legionnaire', 'arena_brawler'].includes(cardIdOf(v, p.uid))),
      deny: 'Place exactly Iron Legionnaire and Arena Brawler into your two Active slots.' },
    { title: 'Energy', when: v => isMain(v, 'arming') && v.turn === 1,
      text: '<p>It\'s your <b>Arming phase</b>. Attacks cost <b>energy</b>, and energy comes from your <b>Support Zone</b>: any fighter or character can be played there instead of fighting. Each produces the energy shown by its symbols (' + window.BCRender.pip('M') + ' Martial).</p>' +
        '<p>You may play <b>one</b> card to the Support Zone each turn.</p><div class="coach-do">Drag <b>Gladiator Recruit</b> onto your Support Zone (or click it → Play as energy).</div>',
      hl: () => [handCard('gladiator_recruit'), $('#me-support')],
      allow: (a, v) => a.type === 'playSupport' && cardIdOf(v, a.cardUid) === 'gladiator_recruit', deny: 'Play Gladiator Recruit into your Support Zone.' },
    { title: 'Reinforcements', when: v => isMain(v, 'arming') && v.turn === 1,
      text: '<p>You may also play <b>one unit into an empty Ready slot</b> each turn. Ready units can step into the Active Zone for free whenever a slot opens.</p><div class="coach-do">Play <b>Field Commander</b> into a Ready slot.</div>',
      hl: () => [handCard('field_commander'), UI.slotEl('me', 'ready', 0), UI.slotEl('me', 'ready', 1), UI.slotEl('me', 'ready', 2)],
      allow: (a, v) => a.type === 'playReady' && cardIdOf(v, a.cardUid) === 'field_commander', deny: 'Play Field Commander into your Ready Zone.' },
    { title: 'Power Ups & energy tokens', when: v => isMain(v, 'arming') && v.turn === 1,
      text: '<p><b>Power Ups</b> are free — one per turn. <b>Whetstone</b> places 2 Martial <b>energy tokens</b> on a unit.</p><p>A token can be discarded to <b>pay 1 energy</b> for that unit\'s attack, <b>negate 1 matching damage</b>, or add <b>+1 to a roll</b> — and unlike energy, tokens are kept between turns.</p>' +
        '<div class="coach-do">Drag <b>Whetstone</b> onto your <b>Iron Legionnaire</b>.</div>',
      hl: () => [handCard('whetstone'), myUnitEl('iron_legionnaire')],
      allow: (a, v) => a.type === 'playPowerUp' && cardIdOf(v, a.cardUid) === 'whetstone' && a.target && E.unitByUid(v, a.target) && E.unitByUid(v, a.target).id === 'iron_legionnaire',
      deny: 'Use Whetstone on Iron Legionnaire.' },
    { title: 'To battle!', when: v => isMain(v, 'arming') && v.turn === 1, pos: 'right',
      text: '<p>That\'s everything for Arming. Turn order is <b>Arming → Fighting → Resolving</b>.</p><div class="coach-do">Click <b>To Fighting ⚔</b>.</div>',
      hl: () => [$('#main-btn')], allow: a => a.type === 'endPhase', deny: 'Click "To Fighting" to continue.' },
    { title: 'Declare an attack', when: v => isMain(v, 'fighting') && v.turn === 1,
      text: '<p>Each Active unit may use <b>one attack</b> per turn. Its cost (' + window.BCRender.pip('M') + ') is paid by tapping Support cards.</p><div class="coach-do">Click your <b>Arena Brawler</b>, choose <b>Haymaker</b>, then click the enemy <b>Gladiator Recruit</b>.</div>',
      hl: () => [myUnitEl('arena_brawler'), oppUnitEl('gladiator_recruit')],
      allow: (a, v) => a.type === 'declare' && E.unitByUid(v, a.unitUid).id === 'arena_brawler' && a.attackIndex === 0 && E.unitByUid(v, a.targetUid).id === 'gladiator_recruit',
      deny: 'Declare Arena Brawler → Haymaker on Gladiator Recruit.' },
    { title: 'Pay with tokens', when: v => isMain(v, 'fighting') && v.turn === 1 && v.declared.length === 1,
      text: '<p>Your only Support card is now tapped — but Iron Legionnaire can pay with one of its own <b>Martial tokens</b>!</p><p>You <b>declare all attacks first</b>, then resolve them. Both may target the same enemy.</p>' +
        '<div class="coach-do">Click <b>Iron Legionnaire</b> → <b>Gladius Thrust</b> → the enemy <b>Gladiator Recruit</b>.</div>',
      hl: () => [myUnitEl('iron_legionnaire'), oppUnitEl('gladiator_recruit')],
      allow: (a, v) => a.type === 'declare' && E.unitByUid(v, a.unitUid).id === 'iron_legionnaire' && a.attackIndex === 0 && E.unitByUid(v, a.targetUid).id === 'gladiator_recruit',
      deny: 'Declare Iron Legionnaire → Gladius Thrust on Gladiator Recruit.' },
    { title: 'Resolve!', when: v => isMain(v, 'fighting') && v.turn === 1 && v.declared.length === 2 && !v.resolvingStarted, pos: 'right',
      text: '<p>Both attacks are declared — the arrows show them. You can resolve them one at a time with <b>▶ Resolve</b> (you choose the order), or all at once.</p><div class="coach-do">Click <b>Resolve attacks ▶</b>.</div>',
      hl: () => [$('#main-btn'), $('#center-band')], allow: a => a.type === 'endPhase' || a.type === 'resolve', deny: 'Resolve your attacks.' },
    { title: 'Defeated!', when: v => isMain(v, 'resolving') && v.turn === 1, pos: 'right',
      text: '<p>4 + 4 damage defeated the 8-HP Recruit. <b>Defeated</b> units stay put until the <b>Resolving phase</b>, then they die and go to the Graveyard — that just happened.</p>' +
        '<p>In Resolving you can also move Ready units into empty Active slots and <b>Shift</b> characters (more on that later).</p><div class="coach-do">Click <b>End Turn</b>.</div>',
      hl: () => [$('#main-btn')], allow: a => a.type === 'endPhase', deny: 'Click "End Turn".' },
    { title: "Brutus's turn", when: v => v.active === 1 && v.turn === 2, wait: true, pos: 'right',
      text: '<p>Watch your opponent. Their <b>Pit Hound</b> has a <b>Poison</b> attack: after it resolves they roll a die, and on <b>4+</b> the target becomes <b>Poisoned</b>.</p>' },
    { title: 'Poison', when: v => isMain(v, 'arming') && v.turn === 3, next: true,
      text: '<p>Your Brawler was Poisoned (☠). At the start of each of your Arming phases a Poisoned unit takes <b>1d3 Martial damage</b> — it just took 1. Statuses can be shaken off: each time the unit attacks, roll 4+ to remove each status.</p>' +
        '<p>Notice you also <b>drew up to 5 cards</b> and your Support Zone <b>untapped</b>. Hover any card to read it in full.</p>' },
    { title: 'Dual energy', when: v => isMain(v, 'arming') && v.turn === 3,
      text: '<p>Some cards show <b>two</b> energy symbols. In the Support Zone they produce <b>either</b> type (not both).</p><div class="coach-do">Play <b>Veteran Pikeman</b> into your Support Zone (' + window.BCRender.pip('M') + '/' + window.BCRender.pip('T') + ').</div>',
      hl: () => [handCard('veteran_pikeman'), $('#me-support')],
      allow: (a, v) => a.type === 'playSupport' && cardIdOf(v, a.cardUid) === 'veteran_pikeman', deny: 'Play Veteran Pikeman as energy.' },
    { title: 'Plan ahead', when: v => isMain(v, 'arming') && v.turn === 3, pos: 'right',
      text: '<p>Here\'s a trick: Iron Legionnaire\'s <b>Shield Bash</b> is a <b>Counterattack</b> — when it takes damage on your opponent\'s turn, it can strike back immediately. You pay for it then, using <b>untapped</b> Support cards and tokens.</p>' +
        '<p>Energy only untaps at the start of <b>your</b> turn, so we\'ll keep the Pikeman untapped this turn.</p><div class="coach-do">Click <b>To Fighting ⚔</b>.</div>',
      hl: () => [$('#main-btn')], allow: a => a.type === 'endPhase', deny: 'Click "To Fighting".' },
    { title: 'Hit the Hound', when: v => isMain(v, 'fighting') && v.turn === 3 && !v.declared.length,
      text: '<div class="coach-do">Attack with <b>Arena Brawler → Haymaker</b> on the <b>Pit Hound</b>. It costs one ' + window.BCRender.pip('M') + ', paid by your Recruit.</div><p class="muted">Leave Iron Legionnaire idle so its Martial token and the Pikeman stay available for a Counterattack.</p>',
      hl: () => [myUnitEl('arena_brawler'), oppUnitEl('pit_hound')],
      allow: (a, v) => a.type === 'declare' && E.unitByUid(v, a.unitUid).id === 'arena_brawler' && a.attackIndex === 0 && E.unitByUid(v, a.targetUid).id === 'pit_hound',
      deny: 'Declare Arena Brawler → Haymaker on Pit Hound.' },
    { title: 'Resolve', when: v => isMain(v, 'fighting') && v.turn === 3 && v.declared.length > 0, pos: 'right',
      text: '<div class="coach-do">Click <b>Resolve attacks ▶</b>.</div>',
      hl: () => [$('#main-btn')], allow: a => a.type === 'endPhase' || a.type === 'resolve', deny: 'Resolve your attack.' },
    { title: 'End your turn', when: v => isMain(v, 'resolving') && v.turn === 3, pos: 'right',
      text: '<p>Pit Hound is down to 4 HP. Your Pikeman is still untapped, ready to pay for a Counterattack on Brutus\'s turn.</p><div class="coach-do">Click <b>End Turn</b>.</div>',
      hl: () => [$('#main-btn')], allow: a => a.type === 'endPhase', deny: 'Click "End Turn".' },
    { title: 'Be ready to react', when: v => v.active === 1 && v.turn === 4, wait: true, pos: 'right',
      text: '<p>Brutus is attacking. Watch for the <b>Parry</b> roll — Iron Legionnaire has Parry: on a 5+ it halves the damage.</p>' },
    { title: 'Counterattack!', when: v => v.pending && v.pending.kind === 'reaction' && v.pending.player === 0, pos: 'right',
      text: '<p>The Parry failed and Iron Legionnaire took damage — so its <b>Counterattack</b> triggers! It will be paid with its Martial token plus the Tactical energy of your untapped Pikeman.</p><div class="coach-do">Choose <b>Shield Bash</b>.</div>',
      hl: () => [$('#prompt .btn.gold')], allow: a => a.option === 0, deny: 'Choose Shield Bash to counterattack.' },
    { title: 'Brutal finish', when: v => isMain(v, 'arming') && v.turn === 5, pos: 'right',
      text: '<p>The crowd loves a show. <b>Favour</b> is earned by spectacular plays — reach <b>10</b> to win. One way: a <b>Brutal</b> attack that Defeats a unit gives +1 Favour.</p>' +
        '<p>Arena Brawler\'s <b>Pile Driver</b> is Brutal and deals 8 — more than enough to finish the wounded Pit Hound.</p><div class="coach-do">Click <b>To Fighting ⚔</b>.</div>',
      hl: () => [$('#main-btn')], allow: a => a.type === 'endPhase', deny: 'Click "To Fighting".' },
    { title: 'Pile Driver!', when: v => isMain(v, 'fighting') && v.turn === 5 && !v.declared.length,
      text: '<div class="coach-do">Declare <b>Arena Brawler → Pile Driver</b> on the <b>Pit Hound</b>, then resolve.</div>',
      hl: () => [myUnitEl('arena_brawler'), oppUnitEl('pit_hound')],
      allow: (a, v) => a.type === 'declare' && E.unitByUid(v, a.unitUid).id === 'arena_brawler' && a.attackIndex === 1 && E.unitByUid(v, a.targetUid).id === 'pit_hound',
      deny: 'Declare Arena Brawler → Pile Driver on Pit Hound.' },
    { title: 'Finish it!', when: v => isMain(v, 'fighting') && v.turn === 5 && v.declared.length > 0 && !v.resolvingStarted, pos: 'right',
      text: '<div class="coach-do">Click <b>Resolve attacks ▶</b>.</div>',
      hl: () => [$('#main-btn')], allow: a => a.type === 'endPhase' || a.type === 'resolve', deny: 'Resolve your attack.' },
    { title: 'The crowd roars!', when: v => v.turn === 5 && v.players[0].favour >= 1 && UI.isIdle(), next: true, pos: 'right',
      text: '<p>+1 Favour! Other ways to win the crowd: <b>overkill</b> any enemy unit by 5+ damage, have one of your characters <b>kill a character</b>, defeat <b>both</b> enemy Active units in one turn, have <b>two characters Active</b> in your Resolving phase, or lose an <b>Honourable</b> unit.</p>' },
    { title: 'Your turn to shine', next: true, pos: 'right', last: true,
      text: '<p>You know the basics! A few more things to discover as you finish this match:</p><ul style="margin:0 0 8px;padding-left:18px">' +
        '<li><b>Retreat</b> a hurt Active unit to Ready (2 energy).</li><li><b>Shift</b>: you hold Valeria, Pit Fighter and her Champion version — in your Resolving phase she can transform.</li>' +
        '<li><b>Veteran</b> units can leap from Support into Ready when your opponent gains Favour.</li><li><b>Embolden</b> (Field Commander) adds a die to its partner\'s attack.</li></ul>' +
        '<p>Green glows show what you can do. Hover cards for details. Good luck!</p>' },
  ];

  // ───────── scripted opponent ─────────
  function tutorDecide(view, choice) {
    const P = view.players[1];
    const uidOf = (list, id, nth) => { const xs = list.filter(c => c.id === id); return xs[nth || 0] && xs[nth || 0].uid; };
    if (choice.kind === 'setup') {
      return { placements: [{ uid: uidOf(P.hand, 'gladiator_recruit'), zone: 'active', index: 0 }, { uid: uidOf(P.hand, 'pit_hound'), zone: 'active', index: 1 }] };
    }
    if (choice.kind === 'main' && T.scripted && (view.turn === 2 || view.turn === 4)) {
      const target = id => { const u = findUnit(view.players[0], id); return u && u.uid; };
      const hound = findUnit(P, 'pit_hound'), weaver = findUnit(P, 'hex_weaver');
      const plan = view.turn === 2 ? {
        arming: [{ type: 'playSupport', cardUid: uidOf(P.hand, 'gladiator_recruit') }, { type: 'playReady', cardUid: uidOf(P.hand, 'hex_weaver'), index: 0 },
          weaver && { type: 'moveToActive', unitUid: weaver.uid, index: P.active.findIndex(x => !x) }],
        fighting: [hound && { type: 'declare', unitUid: hound.uid, attackIndex: 0, targetUid: target('arena_brawler') }],
      } : {
        arming: [{ type: 'playSupport', cardUid: uidOf(P.hand, 'ember_acolyte') }],
        fighting: [weaver && { type: 'declare', unitUid: weaver.uid, attackIndex: 0, targetUid: target('iron_legionnaire') },
          hound && { type: 'declare', unitUid: hound.uid, attackIndex: 0, targetUid: target('arena_brawler') }],
      };
      for (const a of plan[view.phase] || []) if (a && !E.validateAction(view, 1, a)) return a;
      return { type: 'endPhase' };
    }
    return Bots.decide('easy', view, choice);
  }

  // ───────── coach box ─────────
  const T = { i: 0, active: false, scripted: true };

  function step() { return STEPS[T.i]; }

  function showCoach() {
    const s = step();
    const box = $('#coach');
    if (!box) return;
    if (!s || !T.active) { box.classList.add('hidden'); return; }
    const v = UI.view;
    if (s.when && (!v || !s.when(v))) { box.classList.add('hidden'); return; }
    const touch = UI.layout && UI.layout.touch;
    // On a phone, "click" becomes "tap" and dragging is optional.
    const text = touch ? s.text.replace(/\(click or drag them\)/g, '(tap them)').replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap') : s.text;
    box.innerHTML = '<h4><span class="coach-mascot">🎓</span>' + s.title + '<span class="coach-step">' + (T.i + 1) + '/' + STEPS.length + '</span></h4>' + text +
      '<div class="row">' + (s.last ? '' : '<button class="btn small subtle" data-skip>Skip tutorial</button>') + (s.next ? '<button class="btn gold small" data-next>' + (s.last ? 'Play on!' : 'Next →') + '</button>' : '') + '</div>';
    box.classList.remove('hidden');
    // Dock over the side columns so the Arena stays visible.
    if (!touch) { // the phone stylesheet docks the coach at the top of the screen
      box.style.left = s.pos === 'right' ? '1262px' : '16px';
      box.style.top = s.pos === 'right' ? '130px' : '146px';
    }
    const nx = $('[data-next]', box);
    if (nx) nx.onclick = () => advance();
    const sk = $('[data-skip]', box);
    if (sk) sk.onclick = () => finish();
    highlight();
  }

  function highlight() {
    $$('.coach-hl').forEach(e => e.classList.remove('coach-hl'));
    const s = step();
    if (!T.active || !s || !s.hl || !UI.view || (s.when && !s.when(UI.view))) return;
    for (const el of s.hl(UI.view)) if (el) el.classList.add('coach-hl');
  }

  function advance() {
    T.i++;
    if (T.i >= STEPS.length) return finish();
    showCoach();
  }

  function finish() {
    T.active = false;
    T.scripted = false;
    if (T.ctl && T.ctl.game) T.ctl.game.state.rigged = [];
    $$('.coach-hl').forEach(e => e.classList.remove('coach-hl'));
    const box = $('#coach');
    if (box) box.classList.add('hidden');
    UI.toast('Free play: defeat Instructor Brutus! (He now plays like the Easy bot.)');
  }

  const hooks = {
    skipConfirm: true,
    afterRender() { if (T.active) highlight(); },
    onIdle() { if (T.active) showCoach(); },
    afterStep(ev) {
      if (!T.active) return;
      const s = step();
      // A "watch" step ends as soon as the next step's condition is met.
      if (s && s.wait && STEPS[T.i + 1] && STEPS[T.i + 1].when && UI.view && STEPS[T.i + 1].when(UI.view)) advance();
      if (ev.type === 'gameover') finish();
    },
    filterAnswer(ans, v) {
      if (!T.active) return null;
      const s = step();
      if (!s) return null;
      if (s.when && !s.when(v)) return null; // nothing being taught right now
      if (s.next) return 'Read the tutorial box and click "Next" first.';
      if (!s.allow) return null;
      if (s.allow(ans, v)) { setTimeout(advance, 0); return null; }
      return s.deny || 'Follow the tutorial step.';
    },
    onLeave() { T.active = false; },
  };

  function start() {
    T.i = 0; T.active = true; T.scripted = true;
    window.BCMain.go('game');
    T.ctl = new window.BCControllers.LocalController({
      decks: [playerDeck(), tutorDeck()], stacked: [true, true], rigged: RIGGED, seed: 7,
      names: [UI.settings.name || 'Player', 'Instructor Brutus'], level: 'easy', oppAvatar: '🧔',
      decideOpponent: tutorDecide, hooks,
    });
    T.ctl.start();
    showCoach();
  }

  window.BCTutorial = { start, STEPS, tutorDecide, playerDeck, tutorDeck, RIGGED };
})();
