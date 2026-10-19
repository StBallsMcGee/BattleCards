/*
 * Battle Cards — card database and preset decks.
 *
 * This is the one file to edit when adding or changing cards. The engine,
 * the card renderer and the bots all read these definitions, and card text is
 * generated from the structured fields, so you never write rules text by hand.
 *
 * Energy types:  M = Martial, A = Arcane, T = Tactical, S = Scientific
 *
 * Unit (fighter / character) fields
 *   id          unique id (used in decklists)
 *   name        display name. Characters: "Base Name, Version"
 *   type        'fighter' | 'character'
 *   baseName    characters only: links all versions of a character
 *   energy      one or two energy symbols produced in the Support Zone
 *   hp          hit points
 *   keywords    unit keywords: Parry, Embolden, Honourable, Resonance, Veteran
 *   armour      optional { M: 1 } — reduce damage of that type from each attack
 *   faction     optional faction tag (faction mechanics are not in the rulebook yet)
 *   attacks     [{ name, cost: ['M','T'], damage, salvo, keywords: [...] }]
 *                 salvo: X     -> "Salvo (X)": the attack deals Xd6 instead of `damage`
 *                 keywords     -> Blinding, Brutal, Burn, Confuse, Headshot, Long Ranged,
 *                                 Poison, Counterattack, Intervention,
 *                                 Meditate, Sharpen, Strategize, Calibrate
 *   abilities   activated abilities, once per turn each:
 *                 [{ name, cost: [], effect: { type: 'token', token: 'A' } }]
 *   shift       characters only: { cost: [...], condition: {...}, ontoOnly: bool }
 *                 condition types: { type: 'favour', min }        you have at least N Favour
 *                                  { type: 'targetDamage', min }  the character shifted onto has N+ damage
 *                                  { type: 'targetTokens', min }  the character shifted onto has N+ tokens
 *                 ontoOnly: true -> may only Shift on top of a matching character
 *                                   (not from the Support Zone into an empty slot)
 *   art         emoji used as placeholder card art
 *   flavor      flavour text
 *
 * Power Up fields
 *   target      'ownUnit' | 'ownActive' | 'ownGraveUnit' | 'oppSupport' | 'ownSupportFighter' | 'none'
 *   effect      { type: 'tokens', token, n } | { type: 'cleanse' } | { type: 'heal', n }
 *               { type: 'draw', n } | { type: 'attach', bonusDamage, grant } | { type: 'retreat' }
 *               { type: 'favour', n, requireActiveCharacter } | { type: 'recall' }
 *               { type: 'tapSupport' } | { type: 'reinforce' }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BCCards = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CARDS = [
    // ───────────── Martial fighters ─────────────
    { id: 'gladiator_recruit', name: 'Gladiator Recruit', type: 'fighter', energy: ['M'], hp: 8, art: '🗡️',
      attacks: [
        { name: 'Jab', cost: ['M'], damage: 2 },
        { name: 'Lunge', cost: ['M', 'M'], damage: 6 },
      ],
      flavor: 'Fresh sand, fresh blood, fresh hope.' },
    { id: 'arena_brawler', name: 'Arena Brawler', type: 'fighter', energy: ['M'], hp: 10, art: '👊',
      attacks: [
        { name: 'Haymaker', cost: ['M'], damage: 4 },
        { name: 'Pile Driver', cost: ['M', 'M'], damage: 8, keywords: ['Brutal'] },
      ],
      flavor: 'The crowd loves a knockout.' },
    { id: 'iron_legionnaire', name: 'Iron Legionnaire', type: 'fighter', energy: ['M'], hp: 14, art: '🛡️',
      keywords: ['Parry'],
      attacks: [
        { name: 'Gladius Thrust', cost: ['M'], damage: 4 },
        { name: 'Shield Bash', cost: ['M', 'T'], damage: 6, keywords: ['Counterattack'] },
      ],
      flavor: 'Shield up. Step in. Strike.' },
    { id: 'berserker', name: 'Berserker of Khar', type: 'fighter', energy: ['M'], hp: 12, art: '🪓',
      attacks: [
        { name: 'Frenzied Axe', cost: ['M', 'M'], damage: 7 },
        { name: 'Reckless Cleave', cost: ['M', 'M', 'M'], damage: 10, keywords: ['Brutal'] },
      ],
      flavor: 'Khar does not teach restraint.' },
    { id: 'pit_hound', name: 'Pit Hound', type: 'fighter', energy: ['M'], hp: 8, art: '🐺',
      attacks: [
        { name: 'Rabid Bite', cost: ['M'], damage: 2, keywords: ['Poison'] },
      ],
      flavor: 'Its bite festers long after the match.' },
    { id: 'honour_guard', name: 'Honour Guard', type: 'fighter', energy: ['M'], hp: 12, art: '⚔️',
      keywords: ['Honourable'],
      attacks: [
        { name: "Guardian's Riposte", cost: ['M'], damage: 4, keywords: ['Intervention'] },
        { name: 'Oathblade', cost: ['M', 'M'], damage: 5 },
      ],
      flavor: 'Sworn to fall so others stand.' },
    { id: 'veteran_pikeman', name: 'Veteran Pikeman', type: 'fighter', energy: ['M', 'T'], hp: 12, art: '🔱',
      keywords: ['Veteran'],
      attacks: [
        { name: 'Pike Wall', cost: ['M'], damage: 4, keywords: ['Counterattack'] },
        { name: 'Brace and Strike', cost: ['M', 'T'], damage: 6 },
      ],
      flavor: 'Retired twice. Unretired thrice.' },

    // ───────────── Arcane fighters ─────────────
    { id: 'ember_acolyte', name: 'Ember Acolyte', type: 'fighter', energy: ['A'], hp: 10, art: '🔥',
      attacks: [
        { name: 'Firebolt', cost: ['A'], damage: 2, keywords: ['Burn'] },
      ],
      abilities: [{ name: 'Meditate', cost: ['A'], effect: { type: 'token', token: 'A' } }],
      flavor: 'Every spark a prayer.' },
    { id: 'hex_weaver', name: 'Hex Weaver', type: 'fighter', energy: ['A'], hp: 12, art: '🕸️',
      attacks: [
        { name: 'Shadow Lash', cost: ['A'], damage: 4 },
        { name: 'Curse of Folly', cost: ['A', 'A'], damage: 4, keywords: ['Confuse'] },
      ],
      flavor: 'She tangles minds like thread.' },
    { id: 'storm_elemental', name: 'Storm Elemental', type: 'fighter', energy: ['A', 'S'], hp: 14, art: '⚡',
      attacks: [
        { name: 'Static Touch', cost: ['A'], damage: 4, keywords: ['Counterattack'] },
        { name: 'Chain Lightning', cost: ['A', 'A', 'S'], salvo: 2, damage: 4 },
      ],
      flavor: 'Bottled in a lab. Unbottled in a rage.' },
    { id: 'wyrmling', name: 'Wyrmling', type: 'fighter', energy: ['A'], hp: 12, art: '🐉',
      attacks: [
        { name: 'Claw', cost: ['M'], damage: 4 },
        { name: 'Flame Breath', cost: ['A', 'A'], damage: 6, keywords: ['Burn'] },
      ],
      flavor: 'Small for a dragon. Large for everything else.' },
    { id: 'mirror_sprite', name: 'Mirror Sprite', type: 'fighter', energy: ['A'], hp: 8, art: '✨',
      attacks: [
        { name: 'Dazzle', cost: ['A'], damage: 2, keywords: ['Blinding', 'Long Ranged'] },
      ],
      flavor: 'Look closer. No — closer.' },
    { id: 'runic_sentinel', name: 'Runic Sentinel', type: 'fighter', energy: ['A', 'M'], hp: 16, art: '🗿',
      keywords: ['Resonance'], faction: 'Vaultborne',
      attacks: [
        { name: 'Rune Strike', cost: ['A', 'M'], damage: 6 },
      ],
      abilities: [{ name: 'Meditate', cost: ['A'], effect: { type: 'token', token: 'A' } }],
      flavor: 'The runes hum for those who stand beside it.' },
    { id: 'spirit_wisp', name: 'Spirit Wisp', type: 'fighter', energy: ['A'], hp: 8, art: '👻',
      keywords: ['Resonance'],
      attacks: [
        { name: 'Ghost Touch', cost: ['A'], damage: 2, keywords: ['Long Ranged', 'Meditate'] },
      ],
      flavor: 'A flicker of something that refuses to leave.' },

    // ───────────── Tactical fighters ─────────────
    { id: 'field_commander', name: 'Field Commander', type: 'fighter', energy: ['T'], hp: 10, art: '🎖️',
      keywords: ['Embolden'],
      attacks: [
        { name: 'Coordinated Strike', cost: ['T'], damage: 4 },
      ],
      abilities: [{ name: 'Strategize', cost: ['T'], effect: { type: 'token', token: 'T' } }],
      flavor: '"On my mark."' },
    { id: 'crossbow_marksman', name: 'Crossbow Marksman', type: 'fighter', energy: ['T', 'M'], hp: 10, art: '🏹',
      attacks: [
        { name: 'Bolt', cost: ['T'], damage: 1, keywords: ['Headshot', 'Long Ranged'] },
        { name: 'Aimed Shot', cost: ['T', 'T'], damage: 4, keywords: ['Headshot', 'Long Ranged'] },
      ],
      flavor: 'Never where you are looking.' },
    { id: 'ambush_scout', name: 'Ambush Scout', type: 'fighter', energy: ['T'], hp: 10, art: '🥷',
      keywords: ['Veteran'], faction: 'Scellian SIB',
      attacks: [
        { name: 'Knife Flurry', cost: ['T'], damage: 4 },
        { name: 'Flank', cost: ['T', 'T'], damage: 6, keywords: ['Intervention'] },
      ],
      flavor: 'The Bureau sees everything. So does she.' },
    { id: 'smoke_saboteur', name: 'Smoke Saboteur', type: 'fighter', energy: ['T'], hp: 10, art: '💨',
      faction: 'Scellian SIB',
      attacks: [
        { name: 'Blinding Powder', cost: ['T'], damage: 2, keywords: ['Blinding'] },
        { name: 'Garrote', cost: ['T', 'M'], damage: 6 },
      ],
      flavor: 'Now you see me—' },
    { id: 'legion_tactician', name: 'Legion Tactician', type: 'fighter', energy: ['T'], hp: 10, art: '📜',
      attacks: [
        { name: 'Flanking Order', cost: ['T', 'T'], damage: 6, keywords: ['Intervention'] },
      ],
      abilities: [{ name: 'Strategize', cost: ['T'], effect: { type: 'token', token: 'T' } }],
      flavor: 'Wars are won on paper first.' },
    { id: 'war_drummer', name: 'War Drummer', type: 'fighter', energy: ['T', 'M'], hp: 8, art: '🥁',
      keywords: ['Embolden'],
      attacks: [
        { name: 'Drumstick', cost: ['T'], damage: 2 },
        { name: 'Battle Rhythm', cost: ['T', 'M'], damage: 4, keywords: ['Strategize'] },
      ],
      flavor: 'Boom. Boom. Charge.' },
    { id: 'siege_captain', name: 'Siege Captain', type: 'fighter', energy: ['T', 'S'], hp: 12, art: '💣',
      keywords: ['Embolden'],
      attacks: [
        { name: 'Bombard', cost: ['T', 'S', 'S'], salvo: 2, damage: 4, keywords: ['Long Ranged'] },
      ],
      flavor: 'Walls are suggestions.' },

    // ───────────── Scientific fighters ─────────────
    { id: 'clockwork_sentry', name: 'Clockwork Sentry', type: 'fighter', energy: ['S'], hp: 14, art: '⚙️',
      armour: { M: 2 }, faction: 'Vaultborne',
      attacks: [
        { name: 'Rivet Gun', cost: ['S'], damage: 4 },
      ],
      abilities: [{ name: 'Calibrate', cost: ['S'], effect: { type: 'token', token: 'S' } }],
      flavor: 'Tick. Tock. Target acquired.' },
    { id: 'plasma_trooper', name: 'Plasma Trooper', type: 'fighter', energy: ['S'], hp: 10, art: '🔫',
      attacks: [
        { name: 'Plasma Rifle', cost: ['S', 'S'], damage: 6, keywords: ['Burn'] },
        { name: 'Overcharge', cost: ['S', 'S', 'S'], damage: 10, keywords: ['Brutal'] },
      ],
      flavor: 'Warranty void if fired.' },
    { id: 'nanite_swarm', name: 'Nanite Swarm', type: 'fighter', energy: ['S'], hp: 10, art: '🦠',
      attacks: [
        { name: 'Corrode', cost: ['S'], damage: 2, keywords: ['Poison', 'Long Ranged'] },
      ],
      flavor: 'Billions of tiny, hungry mouths.' },
    { id: 'mech_walker', name: 'Mech Walker', type: 'fighter', energy: ['S', 'M'], hp: 18, art: '🤖',
      attacks: [
        { name: 'Stomp', cost: ['M'], damage: 4, keywords: ['Counterattack'] },
        { name: 'Autocannon', cost: ['S', 'S', 'M'], salvo: 2, damage: 4 },
      ],
      flavor: 'Ten tonnes of bad intentions.' },
    { id: 'drone_medic', name: 'Drone Medic', type: 'fighter', energy: ['S', 'T'], hp: 10, art: '🛸',
      keywords: ['Resonance'], faction: 'Scellian SIB',
      attacks: [
        { name: 'Stun Laser', cost: ['S'], damage: 2, keywords: ['Confuse'] },
      ],
      abilities: [{ name: 'Calibrate', cost: ['S'], effect: { type: 'token', token: 'S' } }],
      flavor: 'Patches you up. Powers you up.' },
    { id: 'tesla_engineer', name: 'Tesla Engineer', type: 'fighter', energy: ['S'], hp: 10, art: '🔌',
      attacks: [
        { name: 'Zap', cost: ['S'], damage: 2, keywords: ['Calibrate'] },
        { name: 'Arc Coil', cost: ['S', 'S'], damage: 6, keywords: ['Counterattack'] },
      ],
      flavor: 'Touch the coil. I dare you.' },
    { id: 'scrap_golem', name: 'Scrap Golem', type: 'fighter', energy: ['S', 'M'], hp: 16, art: '🦾',
      armour: { S: 2 }, faction: 'Vaultborne',
      attacks: [
        { name: 'Scrap Fist', cost: ['S', 'M'], damage: 6 },
      ],
      flavor: 'Built from the losers of last season.' },
    { id: 'sniper_drone', name: 'Sniper Drone', type: 'fighter', energy: ['S', 'T'], hp: 8, art: '🎯',
      attacks: [
        { name: 'Rail Shot', cost: ['S', 'S'], damage: 3, keywords: ['Headshot', 'Long Ranged'] },
      ],
      flavor: 'One click. One crater.' },

    // ───────────── Characters ─────────────
    { id: 'valeria_pit', name: 'Valeria, Pit Fighter', baseName: 'Valeria', type: 'character', energy: ['M'], hp: 12, art: '🤺',
      keywords: ['Honourable'],
      attacks: [
        { name: 'Taunting Strike', cost: ['M'], damage: 4, keywords: ['Counterattack'] },
        { name: 'Twin Blades', cost: ['M', 'M'], damage: 6 },
      ],
      shift: { cost: ['M', 'M'] },
      flavor: 'Sold to the pits. Never broken by them.' },
    { id: 'valeria_champion', name: 'Valeria, Champion of the Sands', baseName: 'Valeria', type: 'character', energy: ['M', 'T'], hp: 18, art: '🏆',
      keywords: ['Honourable', 'Parry'],
      attacks: [
        { name: 'Riposte', cost: ['M'], damage: 6, keywords: ['Counterattack'] },
        { name: 'Sunfire Edge', cost: ['M', 'M', 'T'], damage: 10, keywords: ['Brutal'] },
      ],
      shift: { cost: [], cond: { k: 'favour', min: 3 }, ontoOnly: true },
      flavor: 'The crowd chants one name.' },
    { id: 'orrin_hedge', name: 'Orrin, Hedge Mage', baseName: 'Orrin', type: 'character', energy: ['A'], hp: 10, art: '🧙',
      attacks: [
        { name: 'Arcane Missile', cost: ['A'], salvo: 1, damage: 1 },
      ],
      abilities: [{ name: 'Meditate', cost: ['A'], effect: { type: 'token', token: 'A' } }],
      shift: { cost: ['A'] },
      flavor: 'Self-taught. Mostly self-singed.' },
    { id: 'orrin_archmage', name: 'Orrin, Archmage Ascendant', baseName: 'Orrin', type: 'character', energy: ['A', 'S'], hp: 16, art: '🌌',
      keywords: ['Resonance'],
      attacks: [
        { name: 'Mind Shatter', cost: ['A', 'A'], damage: 6, keywords: ['Confuse'] },
        { name: 'Starfall', cost: ['A', 'A', 'A'], salvo: 3, damage: 3, keywords: ['Long Ranged'] },
      ],
      shift: { cost: ['A', 'A'], ontoOnly: true },
      flavor: 'The stars answer now.' },
    { id: 'k7_salvage', name: 'K-7, Salvage Bot', baseName: 'K-7', type: 'character', energy: ['S'], hp: 12, art: '🔧',
      attacks: [
        { name: 'Scrap Cannon', cost: ['S'], damage: 4 },
      ],
      abilities: [{ name: 'Calibrate', cost: ['S'], effect: { type: 'token', token: 'S' } }],
      shift: { cost: ['S'] },
      flavor: 'BEEP. SALVAGE PROTOCOL ENGAGED.' },
    { id: 'k7_warframe', name: 'K-7, Warframe', baseName: 'K-7', type: 'character', energy: ['S', 'M'], hp: 20, art: '🦿',
      armour: { M: 2 },
      attacks: [
        { name: 'Crushing Fist', cost: ['M', 'S'], damage: 8, keywords: ['Brutal'] },
        { name: 'Gatling Arm', cost: ['S', 'S', 'S'], salvo: 3, damage: 3 },
      ],
      shift: { cost: [], cond: { k: 'targetTokens', min: 2 }, ontoOnly: true },
      flavor: 'COMBAT PROTOCOL ENGAGED.' },
    { id: 'hale_junior', name: 'Hale, Junior Inspector', baseName: 'Hale', type: 'character', energy: ['T'], hp: 10, art: '🕵️',
      keywords: ['Veteran'], faction: 'Scellian SIB',
      attacks: [
        { name: 'Truncheon', cost: ['M'], damage: 4 },
      ],
      abilities: [{ name: 'Deduce', cost: ['T'], effect: { type: 'token', token: 'T' } }],
      shift: { cost: ['T'] },
      flavor: 'First day on the multiverse beat.' },
    { id: 'hale_chief', name: 'Hale, Chief Inspector', baseName: 'Hale', type: 'character', energy: ['T', 'S'], hp: 16, art: '🔎',
      keywords: ['Embolden'], faction: 'Scellian SIB',
      attacks: [
        { name: 'Service Revolver', cost: ['T'], damage: 2, keywords: ['Headshot'] },
        { name: 'Cross-Examination', cost: ['T', 'T'], damage: 6, keywords: ['Confuse'] },
      ],
      shift: { cost: ['T', 'T'], ontoOnly: true },
      flavor: '"The evidence is overwhelming."' },
    { id: 'grimbold_warden', name: 'Grimbold, Vault Warden', baseName: 'Grimbold', type: 'character', energy: ['M', 'S'], hp: 14, art: '🔨',
      keywords: ['Parry'], faction: 'Vaultborne',
      attacks: [
        { name: 'Bulwark Strike', cost: ['S'], damage: 4, keywords: ['Counterattack'] },
        { name: 'Vault Hammer', cost: ['M', 'M'], damage: 8 },
      ],
      flavor: 'Nothing gets into the Vault. Nothing gets out.' },
    { id: 'grimbold_unsealed', name: 'Grimbold, Unsealed', baseName: 'Grimbold', type: 'character', energy: ['M', 'A'], hp: 22, art: '🌋',
      keywords: ['Honourable'], faction: 'Vaultborne',
      attacks: [
        { name: 'Seismic Slam', cost: ['M', 'M'], salvo: 2, damage: 2 },
        { name: 'Ancient Wrath', cost: ['M', 'A', 'A'], damage: 12, keywords: ['Brutal'] },
      ],
      shift: { cost: [], cond: { k: 'targetDamage', min: 8 }, ontoOnly: true },
      flavor: 'Break the warden and the Vault breaks with him.' },

    // ───────────── Power Ups ─────────────
    { id: 'whetstone', name: 'Whetstone', type: 'powerup', art: '🪨', target: 'ownUnit',
      effect: { type: 'tokens', token: 'M', n: 2 }, flavor: 'A keen edge for a keen crowd.' },
    { id: 'arcane_focus', name: 'Arcane Focus', type: 'powerup', art: '🔮', target: 'ownUnit',
      effect: { type: 'tokens', token: 'A', n: 2 }, flavor: 'Breathe in the aether.' },
    { id: 'battle_plan', name: 'Battle Plan', type: 'powerup', art: '🗺️', target: 'ownUnit',
      effect: { type: 'tokens', token: 'T', n: 2 }, flavor: 'Step one: win.' },
    { id: 'overclock', name: 'Overclock', type: 'powerup', art: '🔋', target: 'ownUnit',
      effect: { type: 'tokens', token: 'S', n: 2 }, flavor: 'Safety limits disabled.' },
    { id: 'antidote', name: 'Antidote', type: 'powerup', art: '🧪', target: 'ownUnit',
      effect: { type: 'cleanse' }, flavor: 'Tastes awful. Works wonders.' },
    { id: 'field_dressing', name: 'Field Dressing', type: 'powerup', art: '🩹', target: 'ownUnit',
      effect: { type: 'heal', n: 6 }, flavor: 'Walk it off.' },
    { id: 'second_wind', name: 'Second Wind', type: 'powerup', art: '🌬️', target: 'none',
      effect: { type: 'draw', n: 2 }, flavor: 'Not done yet.' },
    { id: 'war_banner', name: 'War Banner', type: 'powerup', art: '🚩', target: 'ownUnit',
      effect: { type: 'attach', bonusDamage: 1 }, flavor: 'Fight beneath it. Fight harder.' },
    { id: 'tower_shield', name: 'Tower Shield', type: 'powerup', art: '🛡', target: 'ownUnit',
      effect: { type: 'attach', grant: 'Parry' }, flavor: 'A wall you can carry.' },
    { id: 'smoke_bomb', name: 'Smoke Bomb', type: 'powerup', art: '💥', target: 'ownActive',
      effect: { type: 'retreat' }, flavor: 'Exit, stage left.' },
    { id: 'crowd_pleaser', name: 'Crowd Pleaser', type: 'powerup', art: '📣', target: 'none',
      effect: { type: 'favour', n: 1, requireActiveCharacter: true }, flavor: 'Give them a show!' },
    { id: 'recall', name: 'Recall from the Pit', type: 'powerup', art: '⚰️', target: 'ownGraveUnit',
      effect: { type: 'recall' }, flavor: 'The multiverse is not done with you.' },
    { id: 'sabotage', name: 'Sabotage', type: 'powerup', art: '🧨', target: 'oppSupport',
      effect: { type: 'tapSupport' }, flavor: 'Cut the right wire.' },
    { id: 'reinforcements', name: 'Reinforcements', type: 'powerup', art: '📯', target: 'ownSupportFighter',
      effect: { type: 'reinforce' }, flavor: 'Sound the horn!' },
  ];

  const TYPE_NAMES = { M: 'Martial', A: 'Arcane', T: 'Tactical', S: 'Scientific' };

  const KEYWORD_TEXT = {
    // Attack keywords
    Blinding: 'After this attack resolves, roll a d6. On a 4+, the target becomes Blinded.',
    Brutal: 'If this attack Defeats an opposing unit, gain 1 Favour.',
    Burn: 'After this attack resolves, roll a d6. On a 4+, the target becomes Ablaze.',
    Confuse: 'After this attack resolves, roll a d6. On a 4+, the target becomes Confused.',
    Headshot: "Roll a d6 and add the result to this attack's damage.",
    'Long Ranged': 'This attack cannot be Parried and does not trigger Counterattack or Intervention.',
    Poison: 'After this attack resolves, roll a d6. On a 4+, the target becomes Poisoned.',
    Salvo: 'This attack deals Xd6 damage.',
    // Reactions
    Counterattack: 'When this unit takes damage from an enemy attack, it may immediately use this attack against the attacking unit, paying its energy cost.',
    Intervention: 'When your other Active unit takes damage from an enemy attack, this unit may immediately use this attack against the attacking unit, paying its energy cost. It cannot do this if it is also the target of an attack this turn.',
    // Unit keywords
    Embolden: "If this unit and your other Active unit both attack in the same Fighting phase, roll a d6 and add the result to the other unit's attack damage.",
    Honourable: 'When this unit dies, its controller gains 1 Favour.',
    Parry: 'When this unit takes damage from an attack, roll a d6 (once per attack). On a 5+, it takes only half of that damage, rounded down.',
    Resonance: 'Any of your other units in the Arena may spend energy tokens on this unit at any time, as if they were on that unit.',
    Shift: 'If the listed conditions are met or the cost is paid, this character may be played on top of a character with a matching base name, or move from your Support Zone into your Arena (Resolving phase only).',
    Veteran: 'When your opponent gains Favour, if this unit is in your Support Zone, you may immediately move it into an empty slot in your Ready Zone.',
    Armour: 'Reduce damage of the listed type dealt to this unit by each attack.',
    // Token keywords
    Meditate: 'Place 1 Arcane energy token on this unit.',
    Sharpen: 'Place 1 Martial energy token on this unit.',
    Strategize: 'Place 1 Tactical energy token on this unit.',
    Calibrate: 'Place 1 Scientific energy token on this unit.',
  };

  Object.assign(KEYWORD_TEXT, {
    Binding: 'After this attack resolves, roll a d6. On a 4+, the target becomes Bound.',
    Voidborn: 'Gains 1 Void token for every 3 damage it takes and every 4 damage it deals.',
    'Loyal Crew': 'When a Loyal Crew character Shifts, you may move a Loyal Crew fighter from your Support Zone into an empty Ready slot.',
    Evidence: 'Evidence tokens are counters, not energy. Threshold Bureau cards spend them for their effects.',
    Pressure: 'Pressure tokens build up on Sovereign and power his Shifts. They are counters, not energy.',
    Void: 'Void tokens build up on Voidborn creatures until they cross their threshold and Shift. They are counters, not energy.',
  });

  const STATUS_TEXT = {
    Poisoned: "Takes 1d3 Martial damage at the start of each of its controller's Arming phases.",
    Ablaze: "Takes 1d3 Arcane damage at the start of each of its controller's Arming phases.",
    Blinded: 'Its attacks deal no damage to their target.',
    Confused: 'Its attacks deal 1d3 Martial damage to itself instead of damaging their target.',
    Bound: 'It cannot Retreat, move zones or react, and its attacks deal 2 less damage.',
  };

  const TOKEN_KEYWORDS = { Meditate: 'A', Sharpen: 'M', Strategize: 'T', Calibrate: 'S' };
  const TOKEN_NAMES = { M: 'Martial', A: 'Arcane', T: 'Tactical', S: 'Scientific', E: 'Evidence', P: 'Pressure', V: 'Void' };
  const MARK_TEXT = {
    untargetable: 'cannot be targeted', taunt: 'must be targeted by enemy attacks', noReact: 'cannot react',
    guard: 'is guarding its allies', undying: 'cannot be killed', weakened: 'deals half damage', noAttack: 'cannot attack',
    ignoreShiftCond: 'may Shift without meeting its condition', canShiftNow: 'may Shift right now', bonusDie: '+1d6 to its attacks',
    plusDamage: 'deals extra damage', unparryable: 'its attacks cannot be Parried', grantParry: 'has Parry',
    interveneAny: 'may react with any attack', shiftOnKill: 'may Shift freely if it kills', regen: 'will regenerate',
    freeAttack: 'attacks for free this turn',
  };

  // Deck sets (one file per faction) register here: public/js/sets/*.js
  const SETS = typeof module === 'object' && module.exports
    ? ['elementals', 'bureau', 'apex', 'octo', 'hollowing'].map(n => require('./sets/' + n + '.js'))
    : ((typeof self !== 'undefined' ? self : this).BCSets || []);
  for (const set of SETS) for (const c of set.cards) { c.set = set.id; c.faction = c.faction || set.faction; CARDS.push(c); }

  const UNIT_KW_ON_ATTACKS = ['Parry', 'Embolden', 'Honourable', 'Veteran', 'Resonance'];
  const byId = {};
  for (const c of CARDS) {
    c.keywords = c.keywords || [];
    c.attacks = c.attacks || [];
    c.abilities = c.abilities || [];
    for (const a of c.attacks) {
      a.keywords = a.keywords || [];
      // Unit keywords written on an attack line apply to the whole unit.
      for (const k of UNIT_KW_ON_ATTACKS) if (a.keywords.includes(k)) { a.keywords = a.keywords.filter(x => x !== k); if (!c.keywords.includes(k)) c.keywords.push(k); }
    }
    if (c.shift && !c.keywords.includes('Shift')) c.keywords.push('Shift');
    byId[c.id] = c;
  }

  function costText(cost) {
    return cost.length ? cost.map(t => TYPE_NAMES[t] || 'Any').join(' + ') : 'free';
  }

  function damageText(atk) {
    let s = '';
    const dice = (atk.salvo || 0) + (atk.keywords.includes('Headshot') ? 1 : 0);
    if (dice) s = dice + 'd6' + (atk.damage ? '+' + atk.damage : '');
    else s = String(atk.damage || 0);
    if (atk.noDamage) s = '—';
    return s + (atk.aoe ? ' all' : '');
  }

  function condText(c, card) {
    if (!c) return '';
    if (Array.isArray(c)) return c.map(x => condText(x, card)).join(' and ');
    const b = card && card.baseName;
    switch (c.k) {
      case 'all': return c.of.map(x => condText(x, card)).join(' and ');
      case 'any': return c.of.map(x => condText(x, card)).join(' or ');
      case 'favour': return 'you have ' + c.min + '+ Favour';
      case 'oppFavour': return 'your opponent has ' + c.min + '+ Favour';
      case 'targetDamage': return b + ' has ' + c.min + '+ damage';
      case 'targetTokens': return b + ' has ' + c.min + '+ ' + (c.token ? TOKEN_NAMES[c.token] + ' ' : '') + 'tokens';
      case 'selfTokens': return 'it has ' + c.min + '+ ' + (c.token ? TOKEN_NAMES[c.token] + ' ' : '') + 'tokens';
      case 'selfKills': return b + ' has killed ' + c.min + '+ opposing unit' + (c.min > 1 ? 's' : '');
      case 'voidGained': return b + ' has gained ' + c.min + '+ Void tokens in total';
      case 'hpAtMost': return 'it has ' + c.n + ' or less HP left';
      case 'counter': return 'it has used ' + c.label + ' ' + c.min + '+ times';
      case 'spent': return 'you have spent ' + c.min + '+ ' + TOKEN_NAMES[c.token] + ' tokens this game';
      case 'pressure': return 'Sovereign has gained ' + c.min + '+ Pressure this game';
      case 'enemyKills': return c.min + '+ opposing units have died this game';
      case 'allyDeaths': return 'one of your units has died this game';
      case 'stage': return 'Sovereign is at Stage ' + c.min + ' or higher';
      case 'twoCharsActive': return 'you have two characters in your Active Zone';
      case 'bothAttacked': return 'both your Active units attacked this turn';
      case 'arenaTokens': return 'there are ' + c.min + '+ ' + TOKEN_NAMES[c.token] + ' tokens in the Arena';
      case 'inArena': return c.base + ' is in your Arena';
    }
    return '';
  }

  function shiftText(card) {
    const s = card.shift;
    if (!s) return '';
    const parts = [];
    if (s.cost && s.cost.length) parts.push('pay ' + costText(s.cost));
    if (s.cond) parts.push(condText(s.cond, card));
    const where = s.ontoOnly ? 'Shift onto ' + card.baseName : 'Shift onto ' + card.baseName + ', or from Support into your Arena';
    return where + (parts.length ? ' when ' + parts.join(' and ') : ' (no cost)') + '.';
  }

  function powerUpText(card) {
    if (card.text) return card.text;
    const e = card.effect || {};
    switch (e.type) {
      case 'tokens': return 'Place ' + e.n + ' ' + TYPE_NAMES[e.token] + ' energy tokens on one of your units.';
      case 'cleanse': return 'Remove all statuses from one of your units.';
      case 'heal': return 'Remove up to ' + e.n + ' damage from one of your units that is not Defeated.';
      case 'draw': return 'Draw ' + e.n + ' cards.';
      case 'attach':
        if (e.bonusDamage) return 'Attach to one of your units. Its attacks deal +' + e.bonusDamage + ' damage.';
        if (e.grant) return 'Attach to one of your units. It gains ' + e.grant + '.';
        return 'Attach to one of your units.';
      case 'retreat': return 'Move one of your Active units to an empty Ready slot for free. Discard its energy tokens.';
      case 'favour': return (e.requireActiveCharacter ? 'If you have a character in your Active Zone, gain ' : 'Gain ') + e.n + ' Favour.';
      case 'recall': return 'Return a fighter or character from your Graveyard to your hand.';
      case 'tapSupport': return "Tap one card in your opponent's Support Zone.";
      case 'reinforce': return 'Move a fighter from your Support Zone into an empty Ready slot.';
    }
    return '';
  }

  // ───────────── Preset decks ─────────────
  function expand(list) {
    const out = [];
    for (const [id, n] of list) for (let i = 0; i < n; i++) out.push(id);
    return out;
  }

  const PRESET_DECKS = [
    {
      id: 'steel', name: 'Steel & Strategy', colors: ['M', 'T'],
      description: 'Martial bruisers backed by Tactical support. Valeria and Hale lead the charge.',
      cards: expand([
        ['gladiator_recruit', 2], ['arena_brawler', 2], ['iron_legionnaire', 2], ['berserker', 2], ['pit_hound', 2],
        ['honour_guard', 2], ['veteran_pikeman', 2], ['field_commander', 2], ['crossbow_marksman', 2], ['ambush_scout', 2],
        ['smoke_saboteur', 2], ['legion_tactician', 2], ['war_drummer', 2],
        ['valeria_pit', 1], ['valeria_champion', 1], ['hale_junior', 1], ['hale_chief', 1],
        ['whetstone', 2], ['battle_plan', 2], ['war_banner', 2], ['smoke_bomb', 1], ['crowd_pleaser', 1], ['second_wind', 2],
      ]),
    },
    {
      id: 'storm', name: 'Arcane Storm', colors: ['A', 'S'],
      description: 'Spells, statuses and machines. Orrin and K-7 grow into powerhouses.',
      cards: expand([
        ['ember_acolyte', 2], ['hex_weaver', 2], ['storm_elemental', 2], ['wyrmling', 2], ['mirror_sprite', 2],
        ['runic_sentinel', 2], ['spirit_wisp', 2], ['clockwork_sentry', 2], ['plasma_trooper', 2], ['nanite_swarm', 2],
        ['drone_medic', 2], ['tesla_engineer', 2], ['sniper_drone', 2],
        ['orrin_hedge', 1], ['orrin_archmage', 1], ['k7_salvage', 1], ['k7_warframe', 1],
        ['arcane_focus', 2], ['overclock', 2], ['antidote', 2], ['field_dressing', 2], ['sabotage', 2],
      ]),
    },
    {
      id: 'vault', name: 'Vault Breakers', colors: ['M', 'S'],
      description: 'Heavy armour and heavier hitters. Grimbold breaks loose when the Vault cracks.',
      cards: expand([
        ['arena_brawler', 2], ['iron_legionnaire', 2], ['berserker', 2], ['honour_guard', 2], ['clockwork_sentry', 2],
        ['scrap_golem', 2], ['mech_walker', 2], ['plasma_trooper', 2], ['runic_sentinel', 2], ['tesla_engineer', 2],
        ['wyrmling', 2], ['gladiator_recruit', 2],
        ['grimbold_warden', 1], ['grimbold_unsealed', 1], ['k7_salvage', 1], ['k7_warframe', 1], ['valeria_pit', 1], ['valeria_champion', 1],
        ['whetstone', 2], ['overclock', 2], ['tower_shield', 2], ['recall', 2], ['reinforcements', 2],
      ]),
    },
    {
      id: 'bureau', name: 'Shadow Bureau', colors: ['T', 'S'],
      description: 'Scellian investigators: blind, confuse and pick the enemy apart from range.',
      cards: expand([
        ['siege_captain', 2], ['smoke_saboteur', 2], ['ambush_scout', 2], ['drone_medic', 2], ['sniper_drone', 2],
        ['nanite_swarm', 2], ['legion_tactician', 2], ['crossbow_marksman', 2], ['field_commander', 2], ['mirror_sprite', 2],
        ['hex_weaver', 2], ['tesla_engineer', 2], ['plasma_trooper', 2],
        ['hale_junior', 1], ['hale_chief', 1], ['orrin_hedge', 1], ['orrin_archmage', 1],
        ['battle_plan', 2], ['overclock', 2], ['sabotage', 2], ['smoke_bomb', 2], ['second_wind', 2],
      ]),
    },
  ];

  for (const set of SETS) if (set.deck.length) PRESET_DECKS.push(Object.assign({ cards: expand(set.deck) }, set.info));

  /** Returns a list of problems with a decklist (array of card ids). Empty = legal. */
  function validateDeck(ids) {
    const problems = [];
    if (!Array.isArray(ids)) return ['Deck must be a list of card ids.'];
    if (ids.length !== 40) problems.push('Deck must contain exactly 40 cards (has ' + ids.length + ').');
    const counts = {};
    for (const id of ids) {
      if (!byId[id]) { problems.push('Unknown card: ' + id); continue; }
      counts[id] = (counts[id] || 0) + 1;
    }
    for (const id in counts) {
      const c = byId[id];
      if (c.flipSide) { problems.push(c.name + ' is the flip side of another card and cannot be put in a deck.'); continue; }
      const max = c.type === 'character' ? 1 : 2;
      if (counts[id] > max) problems.push(c.name + ': max ' + max + (max === 1 ? ' copy (character version).' : ' copies.'));
    }
    if (!ids.some(id => byId[id] && byId[id].type !== 'powerup')) problems.push('Deck needs at least one fighter or character.');
    return problems;
  }

  return { CARDS, byId, TYPE_NAMES, KEYWORD_TEXT, STATUS_TEXT, TOKEN_KEYWORDS, TOKEN_NAMES, MARK_TEXT, PRESET_DECKS, SETS,
    validateDeck, costText, damageText, shiftText, powerUpText, condText };
});
