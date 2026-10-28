import { Container, type Texture } from 'pixi.js';
import type { ActorViewState } from '@/presentation/actorViewState';
import type { ProceduralLook } from '@/presentation/proceduralPose';
import { viewY } from '@/presentation/worldTransform';
import type { EntityView } from './EntityViews';
import { GuardianMarks, type MarkShapes } from './GuardianMarks';
import { ProceduralActor, type CreatureArt } from './ProceduralActor';

/** The part of a boss of the engine the view reads (a structural type: the view never imports the entity class). */
export interface BossLike {
  readonly view: ActorViewState & {
    readonly attack: string | null;
    readonly marks: ReadonlyArray<{ readonly x: number; readonly w: number; readonly t01: number }>;
    readonly enraged: boolean;
    readonly awake: boolean;
  };
  /** The floor of the arena (a flyer is above it): where the warnings are drawn. */
  readonly floorY: number;
}

export interface BossViewOptions {
  glow: Texture;
  /** The shapes of the light the warnings on the floor are painted with. */
  marks: MarkShapes;
}

/**
 * A guardian of the engine drawn from shapes (docs/PROMPT21-LOG.md): the creature of its look — the same body language as every ink creature, at the size of a room — and, in world space, the warnings of its attacks on the
 * floor, painted by the same `GuardianMarks` the Warden uses. It reads the boss's state (`view`): which animation, how far through, which attack is being wound up, where the marks are; it decides nothing.
 */
export class BossView implements EntityView {
  readonly root = new Container({ label: 'boss' });
  private readonly actor: ProceduralActor;
  private readonly marks: GuardianMarks;
  private time = 0;

  constructor(
    private readonly source: BossLike,
    look: ProceduralLook,
    options: BossViewOptions,
  ) {
    this.actor = new ProceduralActor(look, source, { glow: options.glow });
    this.marks = new GuardianMarks(options.marks);
    this.root.addChild(this.marks.root, this.actor.root);
  }

  /**
   * The art of the guardians of the engine is delivered like the art of an ink creature — the same six parts (`presentation/enemyArt`), tagged `enemy:<lookId>` with the look of the boss (`boss_engine`…) — because their body IS an ink creature's, at the
   * size of a room: the actor that draws it takes the parts and moves them. Without art (`null`: the zone has none for this look, or the hero left it) it goes back to its shapes, exactly as before.
   */
  dress(art: CreatureArt | null): void {
    this.actor.dress(art);
  }

  sync(alpha: number, dt: number): void {
    this.time += dt;
    this.actor.sync(alpha, dt);
    this.marks.update(this.source.view.marks, this.source.view.attack, this.source.view.facing, viewY(this.source.floorY), this.time);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
