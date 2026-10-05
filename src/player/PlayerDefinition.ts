import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { MovementTuning } from './MovementTuning';

export interface PlayerCombatDefinition {
  maxHealth: number;
  /** All attacks the player can perform, by id. */
  attacks: Readonly<Record<string, AttackDefinition>>;
  /** First attack of the ground chain / the air attack. Chains continue through `AttackDefinition.next`. */
  groundAttack: string;
  airAttack: string;
  /** Seconds an attack press is remembered (so presses during recovery are not lost). */
  attackBuffer: number;
  hurt: {
    /** Seconds of lost control after being hit (the hit can override it with its own `stun`). */
    stun: number;
    /** Seconds of damage immunity after a hit: lets the player escape instead of being juggled to death. */
    invulnerability: number;
    /** Multiplier on incoming knockback. */
    knockbackScale: number;
  };
  energy: { max: number; start: number };
}

/**
 * Static description of the player character: identity, model, body, movement and combat. Everything tunable
 * lives here, in one place, and is read live so the debug panel can tweak it while playing.
 */
export interface PlayerDefinition {
  id: string;
  /** Id of a ModelDefinition (resolved through the content registry). Swap to change the character. */
  modelId: string;
  /** Collision body. Position of the player is the centre of the feet. */
  body: {
    halfWidth: number;
    height: number;
    /** Vulnerable region: deliberately a bit smaller than the body so near-misses feel fair. */
    hurtbox: { halfWidth: number; height: number };
  };
  movement: MovementTuning;
  combat: PlayerCombatDefinition;
}
