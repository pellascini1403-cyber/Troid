import type { EventBus } from '@/core/events';
import type { Rng } from '@/core/rng';
import type { Scheduler } from '@/core/scheduler';
import type { AbilitySystem } from '@/progression/AbilitySystem';
import type { CollisionWorld } from '@/world/collision';
import type { GameEvents } from './events';

/**
 * What an entity is allowed to touch while it ticks. A deliberately small surface: entities get services,
 * never the session itself, so they cannot reach into each other's state or into the view.
 */
export interface SimServices {
  readonly bus: EventBus<GameEvents>;
  readonly scheduler: Scheduler;
  readonly rng: Rng;
  readonly abilities: AbilitySystem;
  readonly collision: CollisionWorld;
  /** Number of simulation ticks since the session started. */
  readonly now: number;
}
