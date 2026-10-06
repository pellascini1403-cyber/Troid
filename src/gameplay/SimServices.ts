import type { BottleSet } from '@/abilities/BottleSet';
import type { CardLoadout } from '@/abilities/CardLoadout';
import type { Magic } from '@/abilities/Magic';
import type { SkillRuntime } from '@/abilities/SkillRuntime';
import type { CombatSystem } from '@/combat/CombatSystem';
import type { Health } from '@/combat/Health';
import type { EventBus } from '@/core/events';
import type { Rng } from '@/core/rng';
import type { InteractionSystem } from '@/interaction/InteractionSystem';
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
  /** The player's magic bar, bottles and equipped card: resources, independent of each other (docs/GAME-SPEC-2D.md §10–§11). */
  readonly magic: Magic;
  readonly bottles: BottleSet;
  readonly loadout: CardLoadout;
  /** The active skills: their definitions and what they are waiting for (cooldowns). */
  readonly skills: SkillRuntime;
  /** What the player can interact with right now (docs/GAME-SPEC-2D.md §12): the controller asks it, the interface listens to its events. */
  readonly interaction: InteractionSystem;
  readonly player: PlayerTarget;
  /** Number of simulation ticks elapsed (frozen while hit-stop holds the world still). */
  readonly now: number;
  /** Debug switch: the player cannot be damaged. */
  readonly godMode: boolean;
  /** A fresh id for something the simulation creates (`bolt_3`): ids are unique and deterministic within a session. */
  newId(prefix: string): string;
  /** Adds an entity to the world. It joins at the END of the current tick (nothing is added while others iterate). */
  spawn<T extends SimEntity>(entity: T): T;
  despawn(entity: SimEntity): void;
  /** Freezes the simulation for `ticks` on impact; the longest request in a tick wins. */
  requestHitStop(ticks: number): void;
}
