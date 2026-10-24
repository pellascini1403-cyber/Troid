import type { AbilityDefinition } from '@/progression/AbilitySystem';

/**
 * Every ability the design knows about. Only the ones marked `implemented` have behaviour today; the others are
 * declared so content, saves and UI can already refer to them (and so adding one later is a handler, not a refactor).
 */
export const ABILITIES: readonly AbilityDefinition[] = [
  { id: 'dash', name: 'Dash', description: 'A fast burst forward with a brief window of invulnerability.', kind: 'movement', implemented: true },
  // `implemented` is true since Prompt 5: the skill exists (content/skills.ts), a card equips it and the Ability button casts it
  { id: 'magic_attack', name: 'Spirit Bolt', description: 'Fires a bolt of spirit energy. Costs 30 magic.', kind: 'active', implemented: true },
  // `implemented` is true since Prompt 21 (docs/PROMPT21-LOG.md): the three that open the vertical half of the world, each one `abilities.has(…)` in the controller
  { id: 'double_jump', name: 'Double Jump', description: 'Jump once more in mid-air.', kind: 'movement', implemented: true },
  { id: 'wall_jump', name: 'Wall Jump', description: 'Hold against a wall in the air to slide down it, and kick off it.', kind: 'movement', implemented: true },
  { id: 'ground_slam', name: 'Ground Slam', description: 'In the air, down and attack: dive and break what the ground hides.', kind: 'movement', implemented: true },
  { id: 'grapple', name: 'Grapple', description: 'Swing from anchor points.', kind: 'movement', implemented: false },
  // `implemented` is true since S29: the reward of the Ink Warden, one more dash in the air (`PlayerController.canDash`)
  { id: 'air_dash', name: 'Air Dash', description: 'An extra dash in mid-air.', kind: 'movement', implemented: true },
  { id: 'swim', name: 'Swim', description: 'Move freely through water.', kind: 'movement', implemented: false },
];
