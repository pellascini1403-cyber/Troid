import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { EnemyDefinition } from '@/enemies/EnemyDefinition';

/**
 * The Ink Slime (docs/GAME-SPEC-2D.md §15.1; working name, a text KEY in the catalogs). Every number is DATA, in metres
 * and simulation ticks, and is retuned by playing. Do not copy another game's enemy: this is a low, wet blob of ink
 * whose only trick is a lunge that it announces — violet aura, white-hot eyes, a squash — for 24 ticks.
 */

/**
 * Its one attack: wind up (the TELEGRAPH, 24 ticks), lunge at 9 m/s for 10 ticks (≈ 1.5 m) with a hitbox that is its own
 * body plus a hand's breadth (1.3 × 0.9 m), then 36 ticks of recovery: the window to punish. There is no damage by
 * simply touching it (GAME-SPEC-2D §7.3): every hurt is this hitbox, so every hurt was announced.
 */
export const SLIME_LUNGE: AttackDefinition = {
  id: 'slime_lunge',
  startup: 24, active: 10, recovery: 36,
  damage: 1,
  // centred on the body (near edge half a hitbox behind the centre): it hurts where the slime IS, not in front of it
  hitbox: { x: -0.65, y: 0, w: 1.3, h: 0.9 },
  // the standard hurt of GAME-SPEC-2D §9.1: 5.5 m/s away, 4 up, 14 ticks of stun, hit-stop 6
  knockback: { x: 5.5, y: 4 },
  stun: 14,
  hitStop: 6,
  shake: 0.2,
  lunge: { speed: 9, ticks: 10 },
  moveControl: 0,
  anim: 'telegraph',
};

export const INK_SLIME: EnemyDefinition = {
  id: 'ink_slime',
  nameKey: 'enemy.inkSlime.name',
  health: 3,
  body: { halfWidth: 0.55, height: 0.9 }, // 1.1 × 0.9 m
  ai: {
    archetype: 'slime',
    params: {
      patrolSpeed: 1.2,
      approachSpeed: 2.4,
      approachAccel: 14,
      detectRange: 8,
      detectHeight: 2.4,
      attackHeight: 1.2,
      loseRange: 11,
      attackRange: 2.2,
      lineOfSight: true,
      alertTicks: 15,
      idleTicks: [45, 110],
      patrolRange: 3,
      attack: SLIME_LUNGE.id,
      friction: 30,
      gravity: 52,
    },
  },
  attacks: { [SLIME_LUNGE.id]: SLIME_LUNGE },
  hurt: { stun: 14, knockbackScale: 1, flashTicks: 6 },
  death: { ticks: 40 },
  view: { proceduralId: 'ink_slime' },
};

export const ENEMIES: Readonly<Record<string, EnemyDefinition>> = {
  [INK_SLIME.id]: INK_SLIME,
};
