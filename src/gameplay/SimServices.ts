import type { CombatSystem } from '@/combat/CombatSystem';
import type { Health } from '@/combat/Health';
import type { EventBus } from '@/core/events';
import type { Rng } from '@/core/rng';
import type { Scheduler } from '@/core/scheduler';
import type { AbilitySystem } from '@/progression/AbilitySystem';
import type { CollisionWorld, KinematicBody } from '@/world/collision';
import type { GameEvents } from './events';
import type { SimEntity } from './SimEntity';

/** Read-only view of the player for AI, camera and triggers. */
export interface PlayerTarget {
  readonly id: string;
  readonly body: Readonly<KinematicBody>;
  readonly facing: 1 | -1;
  readonly health: Health;
  readonly invulnerable: boolean;
}

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
  readonly combat: CombatSystem;
  readonly player: PlayerTarget;
  /** Number of simulation ticks elapsed (frozen while hit-stop holds the world still). */
  readonly now: number;
  /** Debug switch: the player cannot be damaged. */
  readonly godMode: boolean;
  /** Adds an entity to the world. It joins at the END of the current tick (nothing is added while others iterate). */
  spawn<T extends SimEntity>(entity: T): T;
  despawn(entity: SimEntity): void;
  /** Freezes the simulation for `ticks` on impact; the longest request in a tick wins. */
  requestHitStop(ticks: number): void;
}
