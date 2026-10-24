import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { BatParams } from './archetypes/bat';
import type { CrawlerParams } from './archetypes/crawler';
import type { LeechParams } from './archetypes/leech';
import type { PistonParams } from './archetypes/piston';
import type { RollerParams } from './archetypes/roller';
import type { ShadeParams } from './archetypes/shade';
import type { SporeParams } from './archetypes/spore';
import type { SpitterParams } from './archetypes/spitter';
import type { StonebackParams } from './archetypes/stoneback';
import type { ToadParams } from './archetypes/toad';
import type { TollerParams } from './archetypes/toller';
import type { WeaverParams } from './archetypes/weaver';
import type { WispParams } from './archetypes/wisp';

/**
 * An enemy, as DATA (docs/ARCHITECTURE-2D.md §5.9). Everything a designer retunes lives here, in metres, seconds and
 * SIMULATION TICKS; the behaviour that reads it is an `EnemyBrain` per archetype (a new kind of enemy is a new
 * definition, plus a brain only when it moves in a new way).
 *
 * The wind-up of the attack IS its `startup` (the telegraph the player reads): there is one number, not two.
 */
export interface EnemyDefinition {
  id: string;
  /** Text KEY of the display name (`enemy.inkSlime.name`): never the text itself (docs/GAME-SPEC-2D.md §18). */
  nameKey: string;
  health: number;
  /** Collision body, feet-centred. */
  body: { halfWidth: number; height: number };
  /**
   * Vulnerable regions in the body's local frame facing right (`x` = near edge from the centre, `y` = bottom above the
   * feet). Omitted: the whole body is one region.
   */
  hurtboxes?: ReadonlyArray<{ x: number; y: number; w: number; h: number; multiplier?: number; part?: string }>;
  ai: EnemyAi;
  /** The attacks the brain can pick, by id. */
  attacks: Readonly<Record<string, AttackDefinition>>;
  hurt: {
    /** Ticks of stun when the attack that hit it carries none. */
    stun: number;
    /** Multiplies the knockback it receives (heavy enemies < 1). */
    knockbackScale: number;
    /** Ticks the white hit flash lasts. */
    flashTicks: number;
  };
  death: {
    /** Ticks from the killing blow until the body is gone (the death animation). */
    ticks: number;
  };
  /** What draws it: a procedural actor today, a sprite set when the art exists. Gameplay never reads this. */
  view: { proceduralId: string } | { spriteSetId: string };
}

/**
 * The archetypes with a brain (docs/PROMPT21-LOG.md): fourteen ways to behave, each one a brain in `enemies/archetypes/` and the numbers it reads. Add a member (and a brain) for each new way; the compiler checks `createBrain`.
 * What each one is, and what answers it:
 *   slime — lunges at a short range            crawler — charges in a line, dazed by a wall   toad — leaps in an arc, shakes the floor where it lands
 *   guard — a shield to the front              spore — armoured until its cloud thins          spitter — keeps its distance, throws ink
 *   bat — hangs, then dives, turning           wisp — floats to you and goes off               toller — a metronome: waves along the floor
 *   roller — a stone when curled, shards when broken   piston — follows from above and drops    leech — a puddle that springs
 *   weaver — makes creatures                   shade — vanishes and comes back behind you
 */
export type EnemyAi =
  | SlimeAi
  | { archetype: 'crawler'; params: CrawlerParams }
  | { archetype: 'toad'; params: ToadParams }
  | { archetype: 'guard'; params: StonebackParams }
  | { archetype: 'spore'; params: SporeParams }
  | { archetype: 'spitter'; params: SpitterParams }
  | { archetype: 'bat'; params: BatParams }
  | { archetype: 'wisp'; params: WispParams }
  | { archetype: 'toller'; params: TollerParams }
  | { archetype: 'roller'; params: RollerParams }
  | { archetype: 'piston'; params: PistonParams }
  | { archetype: 'leech'; params: LeechParams }
  | { archetype: 'weaver'; params: WeaverParams }
  | { archetype: 'shade'; params: ShadeParams };

export interface SlimeAi {
  archetype: 'slime';
  params: SlimeParams;
}

/** The Ink Slime's numbers (docs/GAME-SPEC-2D.md §15.1). */
export interface SlimeParams {
  /** m/s while wandering. */
  patrolSpeed: number;
  /** m/s while chasing. */
  approachSpeed: number;
  /** m/s² it takes to reach the chase speed (it slides: it does not snap to it). */
  approachAccel: number;
  /** Horizontal distance (m) at which it notices the player. */
  detectRange: number;
  /** Vertical tolerance (m) of noticing: a player on a ledge far above is not seen. */
  detectHeight: number;
  /** Vertical tolerance (m) of attacking (the player's feet vs its own): it does not wind up at someone it cannot reach. */
  attackHeight: number;
  /** Once chasing, it only gives up beyond this distance (m): hysteresis, so it does not flicker at the border. */
  loseRange: number;
  /** Horizontal distance (m) at which it stops and winds up. */
  attackRange: number;
  /** Walls hide the player (a thin horizontal sight line between the two bodies). */
  lineOfSight: boolean;
  /** Ticks of the "I saw you" beat between noticing and chasing. */
  alertTicks: number;
  /** Ticks it stands still between patrol legs: a random value in `[min, max]` from the simulation `Rng`. */
  idleTicks: readonly [min: number, max: number];
  /** How far (m) each side of its home it wanders. */
  patrolRange: number;
  /** Id (in `attacks`) of its one attack. */
  attack: string;
  /** m/s²: how fast knockback bleeds off on the ground. */
  friction: number;
  /** m/s². */
  gravity: number;
}
