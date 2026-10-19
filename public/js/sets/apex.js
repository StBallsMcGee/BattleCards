/* The Apex Syndicate — Sovereign escalates through five stages while his handlers absorb the punishment. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.BCSets = root.BCSets || []).push(factory());
})(typeof self !== 'undefined' ? self : this, function () {
  const P = (n, extra) => Object.assign({ do: 'tokens', token: 'P', n, to: 'sovereign' }, extra || {});
  const aura = { type: 'untargetableWhile', cond: { k: 'friendlyFighterActive' }, text: 'Containment Aura: Sovereign cannot be targeted while you have an Active fighter beside him.' };
  const cards = [
    // ───── Sovereign ─────
    { id: 'ax_sov1', name: 'Sovereign, The Apex Hero', baseName: 'Sovereign', stage: 1, type: 'character', energy: ['M', 'A'], hp: 18, art: '🦸',
      attacks: [{ name: 'Photon Fist', cost: ['M', 'A'], damage: 4, keywords: ['Headshot'] }],
      abilities: [{ name: "Sovereign's Oath", cost: ['M'], effects: [P(2)], text: 'Place 2 Pressure tokens on Sovereign.' }],
      passives: [aura],
      shift: { cost: ['M', 'A'] },
      flavor: "He waves at the crowd. They don't see his hands shaking." },
    { id: 'ax_sov2', name: 'Sovereign, Above Reproach', baseName: 'Sovereign', stage: 2, type: 'character', energy: ['M', 'A'], hp: 22, art: '🌟',
      attacks: [{ name: 'Heat Vision', cost: ['A'], damage: 6, keywords: ['Burn', 'Long Ranged'] }, { name: 'Iron Decree', cost: ['M', 'M', 'A'], damage: 6, keywords: ['Headshot', 'Brutal'] }],
      passives: [aura],
      triggers: [{ on: 'shiftedInto', text: 'The mask slips: 2 Pressure tokens.', effects: [P(2)] }],
      shift: { cost: [], cond: { k: 'pressure', min: 4 }, ontoOnly: true },
      flavor: 'He corrected the reporter. Gently, at first.' },
    { id: 'ax_sov3', name: 'Sovereign, The Iron Patriarch', baseName: 'Sovereign', stage: 3, type: 'character', energy: ['M', 'A'], hp: 26, art: '🦅', keywords: ['Parry'],
      attacks: [
        { name: 'Orbital Strike', cost: ['A', 'A', 'M'], damage: 10, splash: 4, keywords: ['Long Ranged', 'Burn'], text: 'Also deals 4 damage to the other opposing Active unit.' },
        { name: 'Sovereign Mandate', cost: ['M', 'M', 'M'], damage: 12, keywords: ['Counterattack'] },
      ],
      passives: [aura],
      triggers: [{ on: 'attack', text: 'Each attack builds 1 Pressure.', effects: [P(1, { to: 'self' })] }],
      shift: { cost: [], cond: [{ k: 'selfKills', min: 1 }, { k: 'targetTokens', token: 'P', min: 3 }], ontoOnly: true },
      flavor: 'He stopped explaining himself. That was the scariest day.' },
    { id: 'ax_sov4', name: 'Sovereign, Undeniable', baseName: 'Sovereign', stage: 4, type: 'character', energy: ['M', 'A'], hp: 30, art: '👁️', keywords: ['Parry'],
      attacks: [
        { name: 'Extinction Beam', cost: ['A', 'A', 'M'], damage: 11, keywords: ['Burn', 'Brutal', 'Long Ranged'] },
        { name: 'Absolute Force', cost: ['M', 'M', 'M'], damage: 11, keywords: ['Headshot', 'Counterattack'], collateral: { n: 3 }, text: 'Collateral: your other Active unit takes 3 damage.' },
      ],
      passives: [aura],
      triggers: [{ on: 'enemyKilled', text: 'Every enemy death feeds him: 2 Pressure.', effects: [P(2, { to: 'self' })] }],
      shift: { cost: [], cond: [{ k: 'selfKills', min: 2 }, { k: 'allyDeaths', min: 1 }], ontoOnly: true },
      flavor: "There were no more cameras. He didn't notice." },
    { id: 'ax_sov5', name: 'Sovereign, The Last Word', baseName: 'Sovereign', stage: 5, type: 'character', energy: ['M', 'A'], hp: 34,  art: '💥',
      attacks: [
        { name: "World's End", cost: ['M', 'M', 'M', 'A', 'A'], damage: 15, keywords: ['Burn', 'Brutal', 'Headshot', 'Long Ranged'], effects: [{ do: 'favour', n: 1, reason: "World's End", if: { k: 'killed' } }], text: 'If it kills, gain 1 Favour.' },
        { name: 'I Am The Standard', cost: ['M', 'M'], damage: 10, aoe: true, keywords: ['Brutal'], collateral: { n: 5, all: true }, text: 'Collateral: all your other units take 5 damage.' },
      ],
      passives: [{ type: 'doubleAttack', text: 'Containment Aura is gone. Sovereign may attack twice per turn, paying for each attack.' }],
      shift: { cost: [], cond: { k: 'any', of: [{ k: 'targetTokens', token: 'P', min: 6 }, { k: 'oppFavour', min: 8 }] }, ontoOnly: true },
      flavor: "He didn't want to destroy the world. He just wanted everyone to understand that he could." },

    // ───── Supporting characters (each flips into a second form) ─────
    { id: 'ax_vantage', name: 'Vantage, The Speedster', baseName: 'Vantage', type: 'character', energy: ['T', 'M'], hp: 16, art: '💨', keywords: ['Embolden'],
      attacks: [
        { name: 'Blitz Circuit', cost: ['T'], damage: 5, keywords: ['Long Ranged'] },
        { name: 'Speed Wall', cost: ['T'], damage: 3, keywords: ['Intervention'], effects: [P(1), { do: 'counter', name: 'speedWall' }], text: '1 Pressure on Sovereign.' },
      ],
      transform: { into: 'ax_vantage_burnt', cond: { k: 'counter', name: 'speedWall', min: 3, label: 'Speed Wall' }, condText: 'after using Speed Wall 3 times' },
      flavor: 'She kept stepping in front of things that should have killed her. Eventually one did.' },
    { id: 'ax_vantage_burnt', name: 'Vantage, Burnt Out', baseName: 'Vantage', type: 'character', energy: ['T', 'M'], hp: 12, art: '🔥', flipSide: true,
      attacks: [{ name: 'Blitz Circuit', cost: ['T'], damage: 8, keywords: ['Long Ranged'] }, { name: 'Last Lap', cost: ['T', 'M'], damage: 9, keywords: ['Counterattack'] }] },
    { id: 'ax_null', name: 'Null, The Suppressor', baseName: 'Null', type: 'character', energy: ['S', 'T'], hp: 14, art: '🔇',
      attacks: [
        { name: 'Dampener Pulse', cost: ['S'], damage: 0, noDamage: true, keywords: ['Long Ranged', 'Calibrate'], effects: [{ do: 'mark', mark: 'weakened', dur: 'next', to: 'target' }, P(1)], text: "The target's attacks deal half damage until your next turn. 1 Pressure on Sovereign." },
        { name: 'Null Field', cost: ['S', 'S', 'T'], damage: 6, keywords: ['Binding', 'Confuse'] },
      ],
      transform: { into: 'ax_null_over', cond: { k: 'stage', min: 3 }, condText: 'once Sovereign reaches Stage 3' },
      flavor: 'His job was to make sure Sovereign never had to break a sweat.' },
    { id: 'ax_null_over', name: 'Null, Overexposed', baseName: 'Null', type: 'character', energy: ['S', 'T'], hp: 18, art: '📢', flipSide: true,
      attacks: [
        { name: 'Dampener Pulse', cost: ['S'], damage: 0, noDamage: true, keywords: ['Long Ranged', 'Calibrate'], effects: [{ do: 'mark', mark: 'weakened', dur: 'next', to: 'enemyActive' }, P(1)], text: 'All opposing Active units deal half damage until your next turn. 1 Pressure.' },
        { name: 'Null Field', cost: ['S', 'S', 'T'], damage: 6, keywords: ['Binding', 'Confuse'] },
      ] },
    { id: 'ax_phalanx', name: 'Phalanx, The Shield', baseName: 'Phalanx', type: 'character', energy: ['M', 'S'], hp: 22, art: '🛡️', keywords: ['Parry'],
      attacks: [{ name: 'Shield Bash', cost: ['M', 'M'], damage: 8, keywords: ['Counterattack'] }],
      abilities: [{ name: 'Bulwark Stance', cost: ['S'], effects: [{ do: 'mark', mark: 'guard', dur: 'next', to: 'self', data: { protect: 'sovereign' } }, P(1)], text: 'Until your next turn, attacks on Sovereign hit Phalanx instead. 1 Pressure.' }],
      transform: { into: 'ax_phalanx_shattered', cond: { k: 'hpAtMost', n: 5 }, condText: 'when Phalanx has 5 or less HP left' },
      flavor: 'He took the hit. He always took the hit.' },
    { id: 'ax_phalanx_shattered', name: 'Phalanx, Shattered', baseName: 'Phalanx', type: 'character', energy: ['M', 'S'], hp: 22, art: '💔', keywords: ['Honourable'], flipSide: true,
      attacks: [{ name: 'Broken Charge', cost: ['M'], damage: 9, keywords: ['Brutal'] }, { name: 'Shield Bash', cost: ['M', 'M'], damage: 13, keywords: ['Counterattack', 'Brutal'] }] },

    // ───── Fighters ─────
    { id: 'ax_pr_handler', name: 'Apex PR Handler', type: 'fighter', energy: ['T'], hp: 8, art: '🎤',
      attacks: [{ name: 'Spin Control', cost: ['T'], damage: 0, noDamage: true, keywords: ['Confuse', 'Strategize'] }],
      abilities: [{ name: 'Take the Hit', cost: [], effects: [{ do: 'mark', mark: 'guard', dur: 'next', to: 'self', data: { protect: 'sovereign' } }, P(1)], text: 'Until your next turn, attacks on Sovereign hit this unit instead. 1 Pressure.' }],
      flavor: 'She had been trained for crises. Not for this kind.' },
    { id: 'ax_enforcer', name: 'Corporate Enforcer', type: 'fighter', energy: ['M', 'S'], hp: 14, art: '🕴️',
      attacks: [
        { name: 'Suppressive Fire', cost: ['M'], damage: 4, keywords: ['Counterattack', 'Strategize'], effects: [P(1, { if: { k: 'isReaction' } })], text: 'As a Counterattack: 1 Pressure on Sovereign.' },
        { name: 'Compound Rounds', cost: ['S', 'M'], damage: 4, keywords: ['Long Ranged', 'Headshot'] },
      ] },
    { id: 'ax_brute', name: 'Lab-Grown Brute', type: 'fighter', energy: ['M'], hp: 15, art: '🧟', keywords: ['Parry'],
      attacks: [{ name: 'Engineered Slam', cost: ['M', 'M'], damage: 9 }],
      abilities: [{ name: 'Absorb Blow', cost: ['M'], effects: [{ do: 'mark', mark: 'guard', dur: 'next', to: 'self', data: { protect: 'others' } }, P(1)], text: 'Until your next turn, attacks on your other Active unit hit this unit instead. 1 Pressure.' }] },
    { id: 'ax_sniper', name: 'Apex Sniper Unit', type: 'fighter', energy: ['S', 'T'], hp: 10, art: '🎯',
      attacks: [
        { name: 'Nullifier Round', cost: ['S'], damage: 4, keywords: ['Long Ranged'], effects: [{ do: 'mark', mark: 'noReact', dur: 'next', to: 'target' }], text: 'The target cannot react until your next turn.' },
        { name: 'Overwatch', cost: ['T'], damage: 3, keywords: ['Intervention', 'Calibrate'], effects: [P(1, { if: { k: 'isReaction' } })], text: 'As an Intervention: 1 Pressure on Sovereign.' },
      ] },
    { id: 'ax_asset', name: 'Expendable Asset', type: 'fighter', energy: ['M', 'T'], hp: 11, art: '🎯', keywords: ['Embolden'],
      attacks: [{ name: 'Distraction Strike', cost: ['T'], damage: 4, keywords: ['Confuse'] }],
      abilities: [{ name: 'Designated Target', cost: [], effects: [{ do: 'mark', mark: 'taunt', dur: 'next', to: 'self' }, P(2)], text: 'Until your next turn, enemy attacks must target this unit. 2 Pressure on Sovereign.' }],
      flavor: "He volunteered. They didn't tell him what for." },
    { id: 'ax_drone', name: 'Containment Drone', type: 'fighter', energy: ['S'], hp: 9, art: '🛸',
      attacks: [
        { name: 'Stasis Net', cost: ['S'], damage: 3, keywords: ['Binding'] },
        { name: 'Overload Burst', cost: ['S', 'S'], damage: 8, effects: [{ do: 'destroy', to: 'self' }, P(2)], text: 'This unit is destroyed. 2 Pressure on Sovereign.' },
      ],
      flavor: 'Disposable. The word was right there in the deployment brief.' },
    { id: 'ax_loyalist', name: 'Loyalist Brawler', type: 'fighter', energy: ['M', 'A'], hp: 13, art: '👊', keywords: ['Honourable'],
      attacks: [
        { name: 'For The Cause', cost: ['M'], damage: 5, keywords: ['Counterattack'], effects: [P(1, { if: { k: 'isReaction' } })], text: 'As a Counterattack: 1 Pressure on Sovereign.' },
        { name: 'Blind Devotion', cost: ['M', 'A'], damage: 5, keywords: ['Headshot'] },
      ] },
    { id: 'ax_wetwork', name: 'Wetwork Operative', type: 'fighter', energy: ['T', 'M'], hp: 11, art: '🔪',
      attacks: [{ name: 'Silent Blade', cost: ['M'], damage: 5, keywords: ['Poison', 'Long Ranged'] }, { name: 'Asset Denial', cost: ['T', 'T'], damage: 7, keywords: ['Confuse', 'Binding'] }] },
    { id: 'ax_tether', name: 'Psychic Tether', type: 'fighter', energy: ['A', 'T'], hp: 10, art: '🧠',
      attacks: [
        { name: 'Mind Anchor', cost: ['A'], damage: 4, keywords: ['Binding'] },
        { name: 'Loyalty Imprint', cost: ['A', 'T'], damage: 3, keywords: ['Meditate'], effects: [P(2)], text: '2 Pressure on Sovereign.' },
      ],
      flavor: 'The conditioning worked both ways.' },
    { id: 'ax_response', name: 'Heavy Response Unit', type: 'fighter', energy: ['M', 'S'], hp: 15, art: '🚔', keywords: ['Parry', 'Veteran'],
      attacks: [
        { name: 'Riot Shield', cost: ['S'], damage: 4, keywords: ['Intervention'], effects: [P(1, { if: { k: 'isReaction' } })], text: 'As an Intervention: 1 Pressure on Sovereign.' },
        { name: 'Armour Breach', cost: ['M', 'M', 'S'], damage: 10, keywords: ['Counterattack'] },
      ] },
    { id: 'ax_media', name: 'Apex Media Construct', type: 'fighter', energy: ['A', 'S'], hp: 9, art: '📺',
      attacks: [{ name: 'Narrative Shift', cost: ['A'], damage: 0, noDamage: true, keywords: ['Confuse', 'Meditate'] }, { name: 'Signal Flood', cost: ['S', 'A'], damage: 4, aoe: true, keywords: ['Confuse', 'Long Ranged'] }],
      flavor: "It wasn't lying, exactly. It was just very good at emphasis." },
    { id: 'ax_survivor', name: 'Survivor of Sovereign', type: 'fighter', energy: ['M', 'A'], hp: 12, art: '😠',
      attacks: [
        { name: 'Spite Strike', cost: ['M'], damage: 5, keywords: ['Counterattack'], mods: [{ type: 'perStage', per: 2 }], text: "+2 damage for each of Sovereign's stages." },
        { name: 'Witness', cost: ['A'], damage: 1, keywords: ['Headshot', 'Sharpen'] },
      ],
      flavor: "She wasn't fighting for anyone anymore. Just against." },

    // ───── Power Ups ─────
    { id: 'ax_sanctioned', name: 'Sanctioned Response', type: 'powerup', art: '📜', target: 'none',
      effects: [P(3), { do: 'damage', n: 5, types: ['M'], to: 'pickEnemyActive', if: { k: 'stage', min: 3 } }],
      text: 'Place 3 Pressure tokens on Sovereign. If Sovereign is at Stage 3+, also deal 5 Martial damage to an opposing Active unit.', flavor: 'Everything he did was technically legal.' },
    { id: 'ax_pr_burial', name: 'Public Relations Burial', type: 'powerup', art: '🗞️', target: 'none',
      effects: [{ do: 'cleanse', statuses: ['Confused', 'Bound', 'Poisoned'], to: 'allFriendly' }, { do: 'flag', flag: 'noFavour', who: 'opponent', dur: 'next', text: 'Your opponent cannot gain Favour until your next turn.' }, { do: 'draw', n: 1 }],
      text: 'Remove Confused, Bound and Poisoned from your units. Your opponent cannot gain Favour until your next turn. Draw 1 card.', flavor: 'Nothing happened. We have the footage to prove it.' },
    { id: 'ax_sacrifice', name: 'Calculated Sacrifice', type: 'powerup', art: '⚖️', target: 'ownFighter',
      effects: [{ do: 'destroy', to: 'target' }, P(4), { do: 'toActive', to: 'sovereign' }],
      text: 'Destroy one of your other units (no kill credit for your opponent). Place 4 Pressure on Sovereign and move him into an empty Active slot if he is Ready.', flavor: 'The asset was no longer operationally useful.' },
    { id: 'ax_above_law', name: 'Above The Law', type: 'powerup', art: '⚜️', target: 'none',
      requires: { k: 'inArena', base: 'Sovereign' }, requiresText: 'Sovereign must be in your Arena.',
      effects: [{ do: 'mark', mark: 'undying', dur: 'next', to: 'sovereign' }, { do: 'mark', mark: 'regen', dur: 'next2', to: 'sovereign', data: { n: 6 }, if: { k: 'stage', min: 4 } }],
      text: 'Until your next turn, Sovereign cannot be killed (he stays at 1 HP). At Stage 4+, he also regenerates 6 damage at the start of your next turn.', flavor: 'There was no one left with the authority to stop him.' },
  ];
  const deck = [
    ['ax_sov1', 1], ['ax_sov2', 1], ['ax_sov3', 1], ['ax_sov4', 1], ['ax_sov5', 1], ['ax_vantage', 1], ['ax_null', 1], ['ax_phalanx', 1],
    ['ax_pr_handler', 2], ['ax_enforcer', 2], ['ax_brute', 2], ['ax_sniper', 2], ['ax_asset', 2], ['ax_drone', 2],
    ['ax_loyalist', 2], ['ax_wetwork', 2], ['ax_tether', 2], ['ax_response', 2], ['ax_media', 2], ['ax_survivor', 2],
    ['ax_sanctioned', 2], ['ax_pr_burial', 2], ['ax_sacrifice', 2], ['ax_above_law', 2],
  ];
  return { id: 'apex', faction: 'Apex Syndicate', cards, deck,
    info: { id: 'apex', name: 'The Apex Syndicate', colors: ['M', 'A'],
      description: 'Walls of expendable handlers protect Sovereign while Pressure builds and he escalates through five stages.' } };
});
