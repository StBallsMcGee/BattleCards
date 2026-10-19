/* Abyssal Octo-Autons — cheerful submarine crew by day, malfunctioning horrors in the deep. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.BCSets = root.BCSets || []).push(factory());
})(typeof self !== 'undefined' ? self : this, function () {
  const LC = ['Loyal Crew'];
  const night = { cost: [], cond: { k: 'bothAttacked' }, ontoOnly: true };
  const cards = [
    // ───── Characters: Explorer (day) and Nightmare (night) forms ─────
    { id: 'oa_abyssclaw', name: 'Captain Abyssclaw, Explorer', baseName: 'Captain Abyssclaw', type: 'character', energy: ['S'], hp: 22, art: '🐻‍❄️', keywords: LC.concat(['Embolden']),
      attacks: [{ name: 'Abyss Scan', cost: ['S'], damage: 1, keywords: ['Long Ranged', 'Headshot'] }, { name: 'Helm Command', cost: ['S', 'S'], salvo: 2, damage: 2 }],
      shift: { cost: ['S', 'S'] }, flavor: 'Steady hands on the helm. Steady eyes on the dark.' },
    { id: 'oa_abyssclaw_n', name: 'Captain Abyssclaw, Nightmare', baseName: 'Captain Abyssclaw', type: 'character', energy: ['M'], hp: 24, art: '🐻', keywords: LC.slice(),
      attacks: [
        { name: 'Pack Hunt', cost: ['M', 'M'], salvo: 2, damage: 2, keywords: ['Intervention'], effects: [{ do: 'favour', n: 1, reason: 'Pack Hunt', if: [{ k: 'killed' }, { k: 'targetIsCharacter' }] }], text: 'If this kills a character, gain 1 extra Favour.' },
        { name: 'Terror Chomp', cost: ['M', 'M', 'M'], salvo: 3, damage: 3, keywords: ['Brutal'] },
      ],
      shift: night, flavor: 'The captain still gives orders. Nobody knows who to.' },
    { id: 'oa_shadowpaw', name: 'Corsair Shadowpaw, Explorer', baseName: 'Corsair Shadowpaw', type: 'character', energy: ['S'], hp: 20, art: '🐱', keywords: LC.concat(['Embolden']),
      attacks: [{ name: 'Hook Lash', cost: ['S'], salvo: 1, damage: 2 }, { name: 'Pirate Dash', cost: ['S', 'S'], salvo: 2, damage: 2 }],
      shift: { cost: ['S', 'S'] }, flavor: 'First one out the airlock, every time.' },
    { id: 'oa_shadowpaw_n', name: 'Corsair Shadowpaw, Nightmare', baseName: 'Corsair Shadowpaw', type: 'character', energy: ['M'], hp: 22, art: '🐈‍⬛', keywords: LC.slice(),
      attacks: [
        { name: 'Night Pursuit', cost: ['M', 'M'], salvo: 2, damage: 2, keywords: ['Long Ranged'], effects: [{ do: 'favour', n: 1, reason: 'Night Pursuit', if: { k: 'killed' } }], text: 'If this kills, gain 1 Favour.' },
        { name: 'Phantom Hook', cost: ['M', 'M', 'M'], salvo: 3, damage: 3, keywords: ['Counterattack'] },
      ],
      shift: night, flavor: 'You hear the hook before you see the eyes.' },
    { id: 'oa_deepfin', name: 'Medic Deepfin, Explorer', baseName: 'Medic Deepfin', type: 'character', energy: ['S'], hp: 20, art: '🐧', keywords: LC.concat(['Embolden']),
      attacks: [{ name: 'Medic Pulse', cost: ['S', 'S'], salvo: 2, damage: 1, keywords: ['Poison'] }],
      abilities: [{ name: 'Team Patch', cost: ['S'], effects: [{ do: 'heal', n: 'd6', to: 'pickFriendly' }], text: 'Remove 1d6 damage from one of your units.' }],
      shift: { cost: ['S', 'S'] }, flavor: 'Bandages, balm and a brave little song.' },
    { id: 'oa_deepfin_n', name: 'Medic Deepfin, Nightmare', baseName: 'Medic Deepfin', type: 'character', energy: ['M'], hp: 22, art: '🦈', keywords: LC.slice(),
      attacks: [
        { name: 'Malfunction Surge', cost: ['M', 'M'], salvo: 2, damage: 3, effects: [{ do: 'damage', n: 3, types: ['M'], to: 'randomOtherFriendly' }], text: 'Then deal 3 damage to another random unit of yours.' },
        { name: 'Drain Bite', cost: ['M', 'M', 'M'], salvo: 3, damage: 1, keywords: ['Poison'] },
      ],
      shift: night, flavor: 'The medicine cabinet hums a different song now.' },
    { id: 'oa_boltwhisker', name: 'Tinker Boltwhisker, Explorer', baseName: 'Tinker Boltwhisker', type: 'character', energy: ['S'], hp: 20, art: '🐰', keywords: LC.slice(),
      attacks: [
        { name: 'Gadget Barrage', cost: ['S'], salvo: 1, damage: 2, keywords: ['Binding'] },
        { name: 'Engineering Strike', cost: ['S', 'S'], salvo: 2, damage: 2, effects: [{ do: 'mark', mark: 'grantParry', dur: 'next', to: 'self' }], text: 'This unit gains Parry until your next turn.' },
      ],
      shift: { cost: ['S', 'S'] }, flavor: 'If it ticks, she can fix it.' },
    { id: 'oa_boltwhisker_n', name: 'Tinker Boltwhisker, Nightmare', baseName: 'Tinker Boltwhisker', type: 'character', energy: ['M'], hp: 22, art: '🐇', keywords: LC.slice(),
      attacks: [{ name: 'Overload Rush', cost: ['M', 'M'], salvo: 2, damage: 2, keywords: ['Intervention'] }, { name: 'Sabotage Clamp', cost: ['M', 'M', 'M'], salvo: 3, damage: 3, keywords: ['Brutal'] }],
      shift: night, flavor: 'If it ticks, she will make it stop.' },

    // ───── Fighters ─────
    { id: 'oa_probe', name: 'Submersible Probe', type: 'fighter', energy: ['S'], hp: 14, art: '🔦', keywords: LC.slice(),
      attacks: [{ name: 'Probe Lash', cost: ['S'], salvo: 1, damage: 2, keywords: ['Binding'] }] },
    { id: 'oa_hull', name: 'Armored Hull Guardian', type: 'fighter', energy: ['M'], hp: 18, art: '🐢', keywords: LC.concat(['Parry']),
      attacks: [{ name: 'Ram Charge', cost: ['M', 'M'], salvo: 2, damage: 3 }] },
    { id: 'oa_sonar', name: 'Sonar Jammer', type: 'fighter', energy: ['S'], hp: 13, art: '📡', keywords: LC.slice(),
      attacks: [{ name: 'Echo Pulse', cost: ['S'], salvo: 1, damage: 1, keywords: ['Confuse'] }] },
    { id: 'oa_depth_charge', name: 'Depth Charge Launcher', type: 'fighter', energy: ['M'], hp: 14, art: '💣', keywords: LC.slice(),
      attacks: [{ name: 'Salvo Blast', cost: ['M', 'M'], salvo: 2, damage: 2 }] },
    { id: 'oa_jellyfish', name: 'Jellyfish Lure Drone', type: 'fighter', energy: ['S'], hp: 13, art: '🪼', keywords: LC.slice(),
      attacks: [{ name: 'Biolume Trap', cost: ['S'], salvo: 1, damage: 2, keywords: ['Burn'] }] },
    { id: 'oa_claw', name: 'Mechanical Claw Grappler', type: 'fighter', energy: ['M'], hp: 17, art: '🦀', keywords: LC.slice(),
      attacks: [{ name: 'Clamp Strike', cost: ['M', 'M'], salvo: 2, damage: 2, keywords: ['Counterattack'] }] },
    { id: 'oa_pod', name: 'Emergency Escape Pod', type: 'fighter', energy: ['S'], hp: 14, art: '🫧', keywords: LC.slice(),
      attacks: [{ name: 'Eject Burst', cost: ['S'], salvo: 1, damage: 2, keywords: ['Long Ranged'] }] },
    { id: 'oa_echo', name: 'Haunt Echo Repeater', type: 'fighter', energy: ['M'], hp: 15, art: '🐙', keywords: LC.slice(),
      attacks: [{ name: 'Repeating Chomp', cost: ['M', 'M'], salvo: 2, damage: 1, mods: [{ type: 'ifFriendlyChar', dice: 1 }], text: '+1d6 if you have a character in your Active Zone.' }] },

    // ───── Power Ups ─────
    { id: 'oa_overclock', name: 'Pod Overclock Module', type: 'powerup', art: '⚙️', target: 'ownCharacter',
      effects: [{ do: 'mark', mark: 'ignoreShiftCond', dur: 'turn', to: 'target' }],
      text: 'This turn, one of your characters may be Shifted onto even if the Shift condition is not met (costs still apply).' },
    { id: 'oa_recall', name: 'Emergency Crew Recall', type: 'powerup', art: '🚑', target: 'ownLoyalCrew',
      effects: [{ do: 'toReady' }],
      text: 'Move one of your Loyal Crew fighters from your Support Zone or Active Zone into an empty Ready slot.' },
    { id: 'oa_night_vision', name: 'Night Vision Override', type: 'powerup', art: '🥽', target: 'ownActive',
      effects: [{ do: 'mark', mark: 'unparryable', dur: 'turn', to: 'target' }, { do: 'mark', mark: 'bonusDie', dur: 'turn', to: 'target', data: { n: 1 } }],
      text: "This turn, one of your Active units' attacks gain +1d6 and cannot be Parried." },
    { id: 'oa_injector', name: 'Malfunction Surge Injector', type: 'powerup', art: '💉', target: 'ownCharacter',
      effects: [{ do: 'mark', mark: 'bonusDie', dur: 'next2', to: 'target', data: { n: 1 } }, { do: 'mark', mark: 'shiftOnKill', dur: 'turn', to: 'target' }],
      text: 'One of your characters gains +1d6 to all attacks until the end of your next turn. If it kills this turn, it may Shift without meeting the condition.' },
    { id: 'oa_hull_patch', name: 'Abyssal Hull Patch', type: 'powerup', art: '🩹', target: 'ownUnit',
      effects: [{ do: 'mark', mark: 'grantParry', dur: 'next', to: 'target' }, { do: 'heal', n: 3, to: 'target' }],
      text: 'One of your units gains Parry until your next turn and removes 3 damage.' },
    { id: 'oa_jump_scare', name: 'Jump Scare Protocol', type: 'powerup', art: '😱', target: 'oppActive',
      effects: [{ do: 'chooseStatus', options: ['Bound', 'Confused'], to: 'target' }, { do: 'favour', n: 1, reason: 'Jump Scare', if: { k: 'targetIsCharacter' } }],
      text: 'An opposing Active unit becomes Bound or Confused (your choice). If it is a character, gain 1 Favour.' },
    { id: 'oa_twin_link', name: 'Twin Pod Link', type: 'powerup', art: '🔗', target: 'none',
      requires: { k: 'twoCharsActive' }, requiresText: 'You need two characters in your Active Zone.',
      effects: [{ do: 'mark', mark: 'interveneAny', dur: 'next', to: 'friendlyCharsActive' }],
      text: 'If you have two characters in your Active Zone, until your next turn either may react with any of its attacks as an Intervention.' },
    { id: 'oa_descent', name: 'Deep Descent Booster', type: 'powerup', art: '🚀', target: 'ownReadyUnit',
      effects: [{ do: 'toActive' }, { do: 'mark', mark: 'bonusDie', dur: 'turn', to: 'target', data: { n: 1 } }],
      text: 'Move one of your Ready units into an empty Active slot. Its attacks gain +1d6 this turn.' },
  ];
  const deck = [
    ['oa_abyssclaw', 1], ['oa_abyssclaw_n', 1], ['oa_shadowpaw', 1], ['oa_shadowpaw_n', 1], ['oa_deepfin', 1], ['oa_deepfin_n', 1], ['oa_boltwhisker', 1], ['oa_boltwhisker_n', 1],
    ['oa_probe', 2], ['oa_hull', 2], ['oa_sonar', 2], ['oa_depth_charge', 2], ['oa_jellyfish', 2], ['oa_claw', 2], ['oa_pod', 2], ['oa_echo', 2],
    ['oa_overclock', 2], ['oa_recall', 2], ['oa_night_vision', 2], ['oa_injector', 2], ['oa_hull_patch', 2], ['oa_jump_scare', 2], ['oa_twin_link', 2], ['oa_descent', 2],
  ];
  return { id: 'octo', faction: 'Octo-Autons', cards, deck,
    info: { id: 'octo', name: 'Abyssal Octo-Autons', colors: ['S', 'M'],
      description: 'Attack with both Active units, then Shift the crew into their Nightmare forms. Loyal Crew keeps the reinforcements coming.' } };
});
