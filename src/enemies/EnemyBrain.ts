import type { HitInfo } from '@/combat/Combatant';
import type { SimServices } from '@/gameplay/SimServices';

/**
 * The behaviour of an enemy archetype (docs/ARCHITECTURE-2D.md §5.9): a finite-state machine that decides, once per
 * simulated tick, what its `Enemy` does. It perceives the player only through the read-only `PlayerTarget` of the
 * services, draws every random decision from the simulation `Rng`, and never touches a view: it publishes the logical
 * animation (`enemy.view`) and emits events, nothing else.
 */
export interface EnemyBrain {
  /** Name of the current state (`idle`, `telegraph`…): for tests, the debug panel and the E2E hooks. */
  readonly state: string;
  /** Ticks spent in the current state, counting the tick it was entered as 0. */
  readonly stateTicks: number;
  /** Once per simulated tick: decide, move, submit hitboxes, publish the animation. */
  update(sim: SimServices): void;
  /** The enemy was hit (its health is already reduced): stagger, knock back or die. */
  onHit(hit: HitInfo, killed: boolean): void;
}
