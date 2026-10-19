/* The Threshold Bureau — paranormal detectives who build and spend Evidence. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.BCSets = root.BCSets || []).push(factory());
})(typeof self !== 'undefined' ? self : this, function () {
  const ev = (n, to) => ({ do: 'tokens', token: 'E', n, to });
  const cards = [
    // ───── Characters ─────
    { id: 'tb_mara', name: 'Mara Voss, Lead Detective', baseName: 'Mara Voss', type: 'character', energy: ['T', 'S'], hp: 17, art: '🕵️‍♀️',
      attacks: [{ name: 'Cold Read', cost: ['T'], damage: 5, keywords: ['Confuse'] }, { name: 'Sidearm', cost: ['S', 'T'], damage: 4, keywords: ['Headshot'] }],
      triggers: [{ on: 'turnStart', cond: { k: 'arenaTokens', token: 'E', min: 2 }, text: 'Evidence Sense: with 2+ Evidence in the Arena, Mara gains 1 Tactical token.', effects: [{ do: 'tokens', token: 'T', n: 1, to: 'self' }] }],
      shift: { cost: ['T', 'T'] },
      flavor: "She doesn't look for clues. She looks for what's wrong with the silence." },
    { id: 'tb_mara_threshold', name: 'Mara Voss, Threshold Detective', baseName: 'Mara Voss', type: 'character', energy: ['T', 'S'], hp: 22, art: '🔦',
      attacks: [
        { name: 'Psychometric Strike', cost: ['T', 'T'], damage: 9, keywords: ['Long Ranged'], mods: [{ type: 'spendTokens', token: 'E', per: 2 }], text: 'Spend any number of Evidence tokens: +2 damage each.' },
        { name: 'Bureau Override', cost: ['S', 'T', 'T'], damage: 11, keywords: ['Binding', 'Brutal'] },
      ],
      triggers: [{ on: 'kill', text: 'Case closed: Mara gains 2 Evidence tokens.', effects: [ev(2, 'self')] }],
      shift: { cost: [], cond: [{ k: 'selfKills', min: 1 }, { k: 'arenaTokens', token: 'E', min: 3 }], ontoOnly: true },
      flavor: 'The case broke her. Then she broke the case.' },
    { id: 'tb_dex', name: 'Dex Okafor, Field Analyst', baseName: 'Dex Okafor', type: 'character', energy: ['S', 'T'], hp: 15, art: '🧑‍🔬',
      attacks: [
        { name: 'Scan Pulse', cost: ['S'], damage: 3, keywords: ['Long Ranged'], effects: [ev(1, 'target')], text: 'Place 1 Evidence token on the target.' },
        { name: 'Pattern Lock', cost: ['S', 'S', 'T'], damage: 5, keywords: ['Confuse', 'Headshot'] },
      ],
      shift: { cost: ['S', 'S'] },
      flavor: "The data doesn't lie. It just doesn't say everything." },
    { id: 'tb_dex_echo', name: 'Dex Okafor, Echo Reader', baseName: 'Dex Okafor', type: 'character', energy: ['S', 'T'], hp: 19, art: '📡',
      attacks: [
        { name: 'Echoed Wound', cost: ['T'], damage: 4, keywords: ['Strategize'], mods: [{ type: 'ifTargetTokens', token: 'E', min: 1, mult: 2 }], text: 'Double damage if the target has an Evidence token.' },
        { name: 'Residual Burst', cost: ['S', 'S'], damage: 5, aoe: true, keywords: ['Long Ranged'] },
      ],
      shift: { cost: [], cond: { k: 'spent', token: 'E', min: 4 }, ontoOnly: true },
      flavor: 'He stopped reading the crime scenes. He started reading the killers.' },
    { id: 'tb_constance', name: 'Constance Rell, Coroner', baseName: 'Constance Rell', type: 'character', energy: ['S', 'A'], hp: 14, art: '⚰️',
      attacks: [
        { name: 'Necrotic Compound', cost: ['S', 'A'], damage: 5, keywords: ['Poison'] },
        { name: 'Cadaveric Pulse', cost: ['A', 'A'], damage: 4, aoe: true, effects: [{ do: 'tokens', token: 'E', n: 2, to: 'self', if: { k: 'killed' } }], text: 'If the target dies, place 2 Evidence tokens on Constance.' },
      ],
      shift: { cost: ['S', 'A'] },
      flavor: 'She knows more about the dead than the living. She prefers it that way.' },
    { id: 'tb_constance_path', name: 'Constance Rell, Threshold Pathologist', baseName: 'Constance Rell', type: 'character', energy: ['S', 'A'], hp: 18, art: '🧪',
      attacks: [{ name: 'Autopsy Field', cost: ['S', 'S', 'A'], damage: 10, keywords: ['Poison', 'Brutal'] }],
      abilities: [{ name: 'Trace the Dead', cost: ['A'], effects: [ev(1, 'allUnits'), { do: 'tokens', token: 'A', n: 1, to: 'self' }], text: 'Place 1 Evidence token on every unit in the Arena. Meditate.' }],
      shift: { cost: [], cond: { k: 'enemyKills', min: 2 }, ontoOnly: true },
      flavor: "She doesn't avenge the dead. She makes their deaths mean something." },
    { id: 'tb_harlan', name: 'Harlan Mote, Informant', baseName: 'Harlan Mote', type: 'character', energy: ['T', 'M'], hp: 13, art: '🚬', keywords: ['Honourable'],
      attacks: [
        { name: 'Shiv', cost: ['M'], damage: 4, keywords: ['Poison'] },
        { name: 'Burned Contact', cost: ['T'], damage: 3, keywords: ['Confuse'], effects: [ev(1, 'target')], text: 'Place 1 Evidence token on the target.' },
      ],
      triggers: [{ on: 'death', text: 'Harlan leaves 3 Evidence tokens behind.', effects: [{ do: 'distributeTokens', token: 'E', n: 3, to: 'otherFriendly' }] }],
      shift: { cost: ['T'] },
      flavor: 'He knew too much to live quietly and too little to stay safe.' },
    { id: 'tb_harlan_turned', name: 'Harlan Mote, Turned Asset', baseName: 'Harlan Mote', type: 'character', energy: ['T', 'M'], hp: 17, art: '🎭', keywords: ['Veteran', 'Embolden'],
      attacks: [
        { name: 'Double Cross', cost: ['T', 'T'], damage: 7, keywords: ['Counterattack'] },
        { name: 'Grudge Round', cost: ['M', 'M', 'T'], damage: 7, keywords: ['Headshot', 'Brutal'] },
      ],
      shift: { cost: [], cond: { k: 'oppFavour', min: 3 }, ontoOnly: true },
      flavor: 'Loyalty was always going to be the thing that killed him.' },

    // ───── Fighters ─────
    { id: 'tb_field_agent', name: 'Bureau Field Agent', type: 'fighter', energy: ['T', 'S'], hp: 12, art: '👮', keywords: ['Veteran', 'Embolden'],
      attacks: [{ name: 'Coordinated Approach', cost: ['T'], damage: 4, keywords: ['Strategize'] }, { name: 'Suppression Fire', cost: ['T', 'S'], damage: 6, keywords: ['Long Ranged'] }] },
    { id: 'tb_archivist', name: 'Threshold Archivist', type: 'fighter', energy: ['S', 'A'], hp: 10, art: '📚',
      attacks: [{ name: 'Trace Burst', cost: ['S'], damage: 3, keywords: ['Long Ranged'], effects: [ev(1, 'target')], text: 'Place 1 Evidence token on the target.' }],
      abilities: [{ name: 'Deep Archive', cost: ['A'], effects: [{ do: 'tokens', token: 'S', n: 1, to: 'self' }, { do: 'tokens', token: 'A', n: 1, to: 'self' }], text: 'Place 1 Scientific and 1 Arcane token on this unit.' }] },
    { id: 'tb_enforcer', name: 'Precinct Enforcer', type: 'fighter', energy: ['M', 'T'], hp: 15, art: '🚓', keywords: ['Veteran'],
      attacks: [{ name: 'Crowd Control', cost: ['T'], damage: 4, keywords: ['Binding'] }, { name: 'Baton Strike', cost: ['M', 'M'], damage: 8, keywords: ['Counterattack'] }] },
    { id: 'tb_street_op', name: 'Ashveil Street Operative', type: 'fighter', energy: ['M', 'T'], hp: 11, art: '🧥',
      attacks: [
        { name: 'Back Alley Knife', cost: ['M'], damage: 4, keywords: ['Poison'] },
        { name: 'Tail and Report', cost: ['T'], damage: 1, keywords: ['Strategize'], mods: [{ type: 'ifArena', cond: { k: 'arenaTokens', token: 'E', min: 1 }, add: 3 }], text: '+3 damage if there is any Evidence in the Arena.' },
      ] },
    { id: 'tb_construct', name: 'Forensic Construct', type: 'fighter', energy: ['S'], hp: 14, art: '🤖',
      attacks: [
        { name: 'Data Lance', cost: ['S'], damage: 2, keywords: ['Headshot'] },
        { name: 'Reconstruction Field', cost: ['S', 'S'], damage: 7, mods: [{ type: 'optionalSpend', token: 'E', setDamage: 11 }], text: 'You may spend 1 Evidence token: deal 11 damage instead.' },
      ],
      triggers: [{ on: 'death', text: 'Its records survive: 1 Evidence token on each of your other units.', effects: [ev(1, 'otherFriendly')] }] },
    { id: 'tb_witness', name: 'Witness in Hiding', type: 'fighter', energy: ['T'], hp: 9, art: '🫣', keywords: ['Honourable'],
      attacks: [
        { name: 'Desperate Testimony', cost: ['T'], damage: 3, keywords: ['Confuse'], effects: [ev(2, 'self')], text: 'Place 2 Evidence tokens on this unit.' },
        { name: 'Panic Strike', cost: ['T'], damage: 5, mods: [{ type: 'discardSelfTokens', token: 'E', per: 2 }], text: 'Discard all Evidence on this unit: +2 damage each.' },
      ] },
    { id: 'tb_psi_hound', name: 'Threshold Psi-Hound', type: 'fighter', energy: ['A', 'T'], hp: 11, art: '🐕', keywords: ['Embolden'],
      attacks: [
        { name: 'Psychic Scent', cost: ['A'], damage: 3, keywords: ['Long Ranged'], effects: [{ do: 'moveToken', token: 'E' }], text: 'Move 1 Evidence token from any unit to any other unit.' },
        { name: 'Resonant Howl', cost: ['A', 'T'], damage: 6, keywords: ['Binding'] },
      ] },
    { id: 'tb_revenant', name: 'Cold Case Revenant', type: 'fighter', energy: ['A', 'M'], hp: 13, art: '💀', keywords: ['Parry', 'Honourable'],
      attacks: [{ name: 'Memory Bleed', cost: ['A'], damage: 4, keywords: ['Confuse', 'Meditate'] }, { name: 'Haunted Blow', cost: ['M', 'M'], damage: 8, keywords: ['Counterattack'] }],
      triggers: [{ on: 'enter', cond: { k: 'arenaTokens', token: 'E', min: 2 }, text: 'The case reopens: +3 HP.', effects: [{ do: 'hpBonus', n: 3, to: 'self' }] }] },
    { id: 'tb_undercover', name: 'Undercover Operative', type: 'fighter', energy: ['T', 'M'], hp: 12, art: '🥸', keywords: ['Embolden'],
      attacks: [{ name: 'Concealed Draw', cost: ['M'], damage: 2, keywords: ['Long Ranged', 'Headshot'] }, { name: 'Exposed Cover', cost: ['T', 'T'], damage: 8, keywords: ['Strategize'] }] },
    { id: 'tb_riot_sergeant', name: 'Ashveil Riot Sergeant', type: 'fighter', energy: ['M', 'S'], hp: 16, art: '🪖', keywords: ['Veteran', 'Parry'],
      attacks: [{ name: 'Shock Baton', cost: ['M', 'S'], damage: 7, keywords: ['Confuse'] }, { name: 'Crowd Suppressor', cost: ['M', 'M'], damage: 9, keywords: ['Counterattack'] }] },
    { id: 'tb_cultist', name: 'Dimensional Breach Cultist', type: 'fighter', energy: ['A', 'S'], hp: 10, art: '🧿',
      attacks: [{ name: 'Tear Sigil', cost: ['A'], damage: 4, keywords: ['Burn'] }, { name: 'Collapse Point', cost: ['A', 'S'], damage: 7, keywords: ['Binding', 'Burn'] }],
      triggers: [{ on: 'death', text: 'The breach closes: an opposing unit loses 1 Evidence token.', effects: [{ do: 'removeTokens', token: 'E', n: 1, to: 'enemyMostE' }] }] },
    { id: 'tb_father', name: 'Grieving Father', type: 'fighter', energy: ['M'], hp: 14, art: '😢', keywords: ['Honourable', 'Parry'],
      attacks: [
        { name: "Won't Let Go", cost: ['M'], damage: 5, keywords: ['Counterattack'] },
        { name: 'Rage Strike', cost: ['M', 'M'], damage: 3, keywords: ['Headshot'], mods: [{ type: 'arenaTokens', token: 'E', per: 1 }], text: '+1 damage for each Evidence token in the Arena.' },
      ],
      flavor: 'The case file had a name on it. That name used to mean something else to him.' },

    // ───── Power Ups ─────
    { id: 'tb_scene', name: 'Scene Reconstruction', type: 'powerup', art: '🧩', target: 'ownUnit',
      effects: [{ do: 'tokens', token: 'E', n: 2, nIf: { cond: { k: 'inArena', base: 'Mara Voss' }, n: 3 }, to: 'target' }],
      text: 'Place 2 Evidence tokens on one of your units (3 if Mara Voss is in your Arena).', flavor: 'She could see it all — how it happened, and why.' },
    { id: 'tb_closed_case', name: 'Closed Case', type: 'powerup', art: '📁', target: 'oppUnit',
      effects: [{ do: 'removeTokens', token: 'E', to: 'target', damagePer: 2 }, { do: 'draw', n: 1 }],
      text: 'Discard all Evidence tokens from an opposing unit. It takes 2 damage per token discarded. Draw 1 card.', flavor: "The evidence doesn't disappear. It just moves." },
    { id: 'tb_protocol', name: 'Threshold Protocol', type: 'powerup', art: '🚨', target: 'ownSupportUnit',
      effects: [{ do: 'fromSupport', activeIf: { k: 'arenaTokens', token: 'E', min: 3 } }],
      text: 'Move a unit from your Support Zone into an empty Ready slot — or an empty Active slot if there are 3+ Evidence tokens in the Arena.', flavor: 'The Bureau reserves the right to escalate.' },
    { id: 'tb_witness_protection', name: 'Witness Protection', type: 'powerup', art: '🛡️', target: 'ownUnit',
      effects: [{ do: 'mark', mark: 'untargetable', dur: 'next', to: 'target' }],
      text: 'One of your units cannot be targeted by attacks or effects until your next turn.', flavor: 'We keep them alive just long enough to matter.' },
  ];
  const deck = [
    ['tb_mara', 1], ['tb_mara_threshold', 1], ['tb_dex', 1], ['tb_dex_echo', 1], ['tb_constance', 1], ['tb_constance_path', 1], ['tb_harlan', 1], ['tb_harlan_turned', 1],
    ['tb_field_agent', 2], ['tb_archivist', 2], ['tb_enforcer', 2], ['tb_street_op', 2], ['tb_construct', 2], ['tb_witness', 2],
    ['tb_psi_hound', 2], ['tb_revenant', 2], ['tb_undercover', 2], ['tb_riot_sergeant', 2], ['tb_cultist', 2], ['tb_father', 2],
    ['tb_scene', 2], ['tb_closed_case', 2], ['tb_protocol', 2], ['tb_witness_protection', 2],
  ];
  return { id: 'bureau', faction: 'Threshold Bureau', cards, deck,
    info: { id: 'threshold', name: 'The Threshold Bureau', colors: ['T', 'S'],
      description: 'Detectives of the Beyond. Seed Evidence tokens, then cash them in for huge hits — Mara Voss closes the case.' } };
});
