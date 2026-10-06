import type { SkillDefinition } from '@/abilities/SkillDefinition';

/**
 * The one skill of the first slice (docs/GAME-SPEC-2D.md §10.1): the SPIRIT BOLT (working name; its ability id is
 * `magic_attack`). Costs 30 (three casts in a row from a full bar), 0.3 s between casts; 6 ticks of preparation and 8 of
 * recovery with 40 % of the normal control; a cyan bolt at 16 m/s that flies 12 m, deals 2, does not pierce, knocks back
 * (6, 2) and freezes the world for 3 ticks on impact. Starting values, retuned by playing.
 */
export const SPIRIT_BOLT: SkillDefinition = {
  id: 'spirit_bolt',
  cost: 30,
  cooldown: 0.3,
  startup: 6,
  recovery: 8,
  moveControl: 0.4,
  handler: 'projectile',
  projectile: {
    speed: 16,
    range: 12,
    damage: 2,
    knockback: { x: 6, y: 2 },
    hitStop: 3,
    shake: 0.14,
    stun: 0,
    size: { w: 0.7, h: 0.5 },
    muzzle: { x: 0.8, y: 1.05, yCrouched: 0.62 },
  },
};

export const SKILLS: Readonly<Record<string, SkillDefinition>> = { [SPIRIT_BOLT.id]: SPIRIT_BOLT };
