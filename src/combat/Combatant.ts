import type { Rect } from '@/core/math';
import type { Health } from './Health';

export type Team = 'player' | 'enemy' | 'neutral';

/** A vulnerable region. Most actors have one (their body); bosses have several parts with different multipliers. */
export interface Hurtbox {
  rect: Rect;
  /** Damage multiplier for hits that land on this region (weak points > 1, armour < 1). */
  multiplier: number;
  /** Optional label, forwarded in events (`"core"`, `"left_arm"`). */
  part?: string;
}

/** Everything a victim needs to know about a hit that connected. */
export interface HitInfo {
  attackId: string;
  attackerId: string | null;
  /** Final damage after the hurtbox multiplier. */
  damage: number;
  /** Direction the target is pushed along X (+1 right, −1 left). */
  direction: 1 | -1;
  knockbackX: number;
  knockbackY: number;
  stun: number;
  hitStop: number;
  shake: number;
  /** World point of the impact (centre of the overlap) — where sparks and numbers appear. */
  x: number;
  y: number;
  part?: string;
}

export type HitOutcome = 'hit' | 'blocked' | 'ignored';

/** Anything that can be hit: the player, enemies, bosses, breakable walls, switches, training dummies. */
export interface Combatant {
  readonly id: string;
  readonly team: Team;
  readonly health: Health;
  /** Writes this tick's vulnerable regions into `out` (world space). Return nothing when untouchable. */
  collectHurtboxes(out: Hurtbox[]): void;
  /** True while the combatant cannot be damaged (i-frames, intangible phases, already dead). */
  readonly invulnerable: boolean;
  /** Applies the hit. The combatant decides its own reaction (knockback, stagger, death). */
  receiveHit(hit: HitInfo): HitOutcome;
}

/** Hitbox submitted by an attacker for the current tick. */
export interface HitboxSubmission {
  ownerId: string;
  team: Team;
  rect: Rect;
  attackId: string;
  damage: number;
  knockback: { x: number; y: number };
  stun: number;
  hitStop: number;
  shake: number;
  /** Direction of the attacker's facing (the knockback pushes this way). */
  facing: 1 | -1;
  /**
   * Targets this attack instance has already hit. The attacker keeps ONE set per attack instance, so a hitbox that
   * stays active for several ticks hits each target once.
   */
  alreadyHit: Set<string>;
  /** Called once per confirmed hit on the attacker's side (energy gain, cancel windows…). */
  onConfirm?: (target: Combatant, hit: HitInfo) => void;
  /** Teams this hitbox can damage. Defaults to everything that is not the owner's team. */
  hits?: readonly Team[];
}
