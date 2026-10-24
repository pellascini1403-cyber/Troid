import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { EnemyDefinition } from '../EnemyDefinition';
import type { ShotSpec } from '../EnemyShot';

/**
 * A BOSS as DATA (docs/PROMPT21-LOG.md): the guardians after the Ink Warden. Where the Warden (`GuardianDefinition`) is two attacks written into its class, these are an engine and a table — the same states (`dormant → intro → choose → telegraph →
 * attack → recover → (hurt) → choose…`, `shift` between phases, `dead`) running attacks that are patterns picked by name (`BossHandlerId`), phases that change which patterns it has and how fast it is, and CONDITIONS under which it can be hurt at all.
 * Every blow it deals is the hitbox of one of its attacks; every attack is announced by a telegraph the hero can read; the numbers are metres, seconds and simulation TICKS.
 */

/** The patterns an attack can be (`enemies/boss/handlers.ts`): what each one does is in its handler. */
export type BossHandlerId =
  | 'charge' // a surge along the floor that ends at a wall (or runs out)
  | 'sweep' // a wide blow in front of it, with a lunge
  | 'leap' // a leap onto where the hero stood, and the floor shaking where it lands
  | 'eruptions' // columns at spots marked on the floor: aimed at the hero, random, or fixed (alternating)
  | 'march' // a line of columns that runs from it toward the hero, one after the other
  | 'volley' // shots in a fan, flat or in arcs
  | 'waves' // waves along the floor each way, one after the other
  | 'stomp' // the ground shakes: a hitbox around the feet and waves along the floor
  | 'dive' // (a flyer) it falls on the hero and is stuck where it lands
  | 'teleport' // it vanishes, and comes back behind the hero with a cut
  | 'burst'; // shots in a ring or a half ring from its middle

/** What one attack of the boss is. The numbers that are the same for every handler are `attack`'s; the ones that are the pattern's are `params`. */
export interface BossAttackSpec {
  /** Its timings (`startup` the wind-up the hero reads, `active`, `recovery` the opening), its damage and its knockback; its hitbox for the handlers that hit with one. */
  attack: AttackDefinition;
  handler: BossHandlerId;
  /** The pattern's numbers (`speed`, `ticks`, `count`…; a list ends with a number: `offsets`, `offsets2` for the second phase, `offsets3` for the third). */
  params: Readonly<Record<string, number | readonly number[]>>;
  /** What it throws, for the handlers that throw. */
  shot?: ShotSpec;
  /** How likely it is to be chosen when the hero is within / beyond `farDistance` of it. */
  weight: { near: number; far: number };
  /** When it is over, the boss is open (its weak point shows) for the whole recovery — the default — or stays shut until the next attack. */
  exposes?: boolean;
}

/** A phase of the fight: from `at` of its health on, these attacks, this tempo. */
export interface BossPhase {
  /** The fraction of its health at or below which the phase begins (the first is 1). */
  at: number;
  /** Multiplies every wind-up and recovery (< 1: faster). */
  tempo: number;
  /** The ids of the attacks it may choose. */
  attacks: readonly string[];
  /** Ticks it is shut and untouchable between the previous phase and this one (the roar), with `boss:phase`. */
  shiftTicks?: number;
  /** What it calls when the phase begins: this many creatures of this definition, spread across the arena. */
  summon?: { def: EnemyDefinition; count: number };
}

export interface BossHurtbox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Damage multiplier for a blow that lands here. */
  multiplier: number;
  /** Forwarded in the events (`core`, `body`). A region called `armor` turns every blow away. */
  part: string;
  /** The states it can be hit in (omitted: all that can be hurt). A weak point that only shows while the boss recovers. */
  when?: readonly string[];
}

export interface BossDefinition {
  id: string;
  /** Text KEY of the display name. */
  nameKey: string;
  health: number;
  body: { halfWidth: number; height: number };
  /** Vulnerable regions, WEAK POINTS FIRST (a blow lands on the first one it overlaps; `armor` last). */
  hurtboxes: readonly BossHurtbox[];
  introTicks: number;
  /** Ticks a blow taken while it recovers staggers it (once per recovery). */
  staggerTicks: number;
  flashTicks: number;
  deathTicks: number;
  phases: readonly BossPhase[];
  attacks: Readonly<Record<string, BossAttackSpec>>;
  /** Beyond this horizontal distance (m) the `far` weights apply. */
  farDistance: number;
  /** The same attack at most this many times in a row. */
  repeatLimit: number;
  friction: number;
  gravity: number;
  /** A flyer hangs this many metres above where it was placed and comes back to it after every attack; a boss that walks has none. */
  hover?: number;
  /** What draws it (a procedural look); gameplay never reads this. */
  view: { lookId: string };
}
