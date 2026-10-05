import type { SimServices } from './SimServices';

/**
 * Anything that lives in a room and ticks: enemies, bosses, projectiles, pickups, gates, checkpoints.
 * The session owns the list; entities are added with `sim.spawn()` and removed when `expired` turns true
 * (removal is deferred to the end of the tick, so nothing is ever deleted while another entity is iterating).
 */
export interface SimEntity {
  readonly id: string;
  /** Free-form discriminator the view layer switches on (`'dummy'`, `'enemy'`, `'projectile'`, `'pickup'`…). */
  readonly kind: string;
  /** Called once when the entity joins the world (end of the tick it was spawned in): register with systems. */
  onSpawn?(sim: SimServices): void;
  tick(sim: SimServices): void;
  /** When true the entity is removed at the end of the current tick. */
  readonly expired?: boolean;
  /** Last call before removal: unregister from systems, cancel owned timers. */
  dispose?(sim: SimServices): void;
}
