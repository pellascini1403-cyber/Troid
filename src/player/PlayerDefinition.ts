import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { MovementTuning } from './MovementTuning';

export interface PlayerCombatDefinition {
  maxHealth: number;
  /** All attacks the player can perform, by id. */
  attacks: Readonly<Record<string, AttackDefinition>>;
  /** First attack of the ground chain, the air attack and the crouched attack. Chains continue through `AttackDefinition.next`. */
  groundAttack: string;
  airAttack: string;
  crouchAttack: string;
  /** The two blows of the Ground Slam (docs/PROMPT21-LOG.md): the dive that hurts what it falls on, and the shockwave where it lands (the id a breakable floor asks for). Without them the ability does nothing. */
  slamDive?: string;
  slamWave?: string;
  /**
   * What the relics of the world are worth (docs/PROMPT21-LOG.md): passive abilities, each one `abilities.has('relic_…')` where it matters. `edgeBonus` points more on every blow of the sword, `siphon` units of magic back for every blow that
   * lands, `wardScale` times as long the invulnerability after a hit, `swiftScale` times the dash's cooldown, `brewBonus` points more from a bottle, `pierce` enemies the Spirit Bolt goes through.
   */
  relics?: { edgeBonus: number; siphon: number; wardScale: number; swiftScale: number; brewBonus: number; pierce: number };
  /** Seconds an attack press is remembered (so presses during a recovery are not lost). */
  attackBuffer: number;
  /** Being hit (docs/GAME-SPEC-2D.md §9). Durations are SIMULATION TICKS (60 per second). */
  hurt: {
    /** Ticks of lost control when the hit does not carry its own `stun`. */
    stun: number;
    /** Ticks of damage immunity after a hit (the blink): lets the player escape instead of being juggled to death. */
    invulnerability: number;
    /** Multiplier on incoming knockback. */
    knockbackScale: number;
    /** Ticks the world freezes when the hit kills the player. */
    deathHitStop: number;
  };
}

/**
 * Static description of the player character: identity, art, body, movement and combat. Everything tunable
 * lives here, in one place, and is read live so the debug panel can tweak it while playing.
 */
export interface PlayerDefinition {
  id: string;
  /** Id of a SpriteSetDefinition (resolved through the content registry). Swap to change the character's art. */
  spriteSetId: string;
  /** Collision body. Position of the player is the centre of the feet. */
  body: {
    halfWidth: number;
    /** Standing height. The crouched height is `movement.crouch.height`. */
    height: number;
    /** Vulnerable region while standing: deliberately smaller than the body so near-misses feel fair. */
    hurtbox: { halfWidth: number; height: number };
  };
  movement: MovementTuning;
  combat: PlayerCombatDefinition;
}
