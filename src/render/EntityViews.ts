import type { Container } from 'pixi.js';
import type { EventBus } from '@/core/events';
import type { GameEvents } from '@/gameplay/events';
import type { SimEntity } from '@/gameplay/SimEntity';

/** What the view layer draws for one simulation entity. It only READS the entity's `view` state. */
export interface EntityView {
  readonly root: Container;
  /** Once per rendered frame. `alpha` is the interpolation between ticks, `dt` the animation time (frozen by hit-stop). */
  sync(alpha: number, dt: number): void;
  destroy(): void;
}

/** Builds the view of an entity of a given `kind`, or `null` when there is nothing to draw. */
export type EntityViewFactory = (entity: SimEntity) => EntityView | null;

/**
 * Keeps one view per live entity: it listens to `entity:spawned` / `entity:despawned`, so the simulation never
 * knows views exist (docs/ARCHITECTURE-2D.md §7.8). Each `kind` ('dummy', 'enemy', 'projectile'…) has a factory.
 */
export class EntityViews {
  private readonly views = new Map<SimEntity, EntityView>();
  private readonly off: Array<() => void> = [];

  constructor(
    private readonly parent: Container,
    private readonly factories: Readonly<Record<string, EntityViewFactory>>,
  ) {}

  /** Starts listening. Entities that already exist are NOT picked up (attach before the room is built). */
  attach(bus: EventBus<GameEvents>): void {
    this.off.push(bus.on('entity:spawned', ({ entity }) => this.add(entity)));
    this.off.push(bus.on('entity:despawned', ({ entity }) => this.remove(entity)));
  }

  get count(): number {
    return this.views.size;
  }

  sync(alpha: number, dt: number): void {
    for (const v of this.views.values()) v.sync(alpha, dt);
  }

  destroy(): void {
    for (const off of this.off.splice(0)) off();
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
  }

  private add(entity: SimEntity): void {
    if (this.views.has(entity)) return;
    const view = this.factories[entity.kind]?.(entity) ?? null;
    if (!view) return;
    this.views.set(entity, view);
    this.parent.addChild(view.root);
  }

  private remove(entity: SimEntity): void {
    const view = this.views.get(entity);
    if (!view) return;
    this.views.delete(entity);
    view.destroy();
  }
}
