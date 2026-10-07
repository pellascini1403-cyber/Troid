import { resolveAnchor, type ResolvedAnchor } from './anchors';
import type { ActorViewState } from './actorViewState';
import { SpriteAnimator } from './animation';
import type { AtlasMeta, SpriteSetDefinition } from './SpriteSetDefinition';
import type { AnchorId } from './vocabulary';

/** What the Pixi sprite has to show this frame (pure data: no Pixi types). */
export interface SpritePose {
  visible: boolean;
  /** World position of the feet centre, metres, simulation space (+Y up), already interpolated between ticks. */
  x: number;
  y: number;
  /** +1 = art as authored (faces right), −1 = mirrored. */
  facing: 1 | -1;
  /** Name of the atlas frame to show. */
  frame: string | null;
  /** Final opacity (blink applied). */
  alpha: number;
  /** Hit-flash intensity 0..1. */
  flash: number;
}

export interface ActorPresenterOptions {
  /** Blink frequency (Hz) while `blink` is set (i-frames). */
  blinkHz?: number;
}

/**
 * Binds one `ActorViewState` (written by the simulation) to one sprite set. It is the ONLY bridge between an actor's
 * simulation state and what is drawn: it interpolates the position between ticks, drives the animator and works out
 * flip, flash and blink. Pure (the Pixi binding just applies the resulting `SpritePose`), so the same class serves the
 * player, every enemy and every boss, and is tested in Node.
 */
export class ActorPresenter {
  readonly pose: SpritePose = { visible: true, x: 0, y: 0, facing: 1, frame: null, alpha: 1, flash: 0 };
  readonly animator: SpriteAnimator;
  private serial = -1;
  private clock = 0;
  private disposed = false;
  private readonly blinkHz: number;
  private readonly scratch: ResolvedAnchor = { x: 0, y: 0, fallback: false };

  constructor(
    readonly def: SpriteSetDefinition,
    private readonly meta: AtlasMeta | null,
    options: ActorPresenterOptions = {},
  ) {
    this.animator = new SpriteAnimator(def);
    this.blinkHz = options.blinkHz ?? 14;
    this.pose.frame = this.animator.frameName;
  }

  /** `alpha` ∈ [0,1): interpolation between the previous and current simulation tick. `dt`: real seconds. */
  sync(view: ActorViewState, alpha: number, dt: number): SpritePose {
    const p = this.pose;
    if (this.disposed) return p;
    this.clock += dt;
    p.visible = view.visible;
    if (!view.visible) return p;

    p.x = view.prevX + (view.x - view.prevX) * alpha;
    p.y = view.prevY + (view.y - view.prevY) * alpha;
    p.facing = view.facing;

    const restart = view.animSerial !== this.serial;
    this.serial = view.animSerial;
    this.animator.play(view.anim, {
      speed: view.animSpeed,
      duration: view.animDuration,
      restart,
      phase: view.phase,
      phaseT: view.phaseT,
    });
    this.animator.update(dt);
    p.frame = this.animator.frameName;

    p.flash = view.flash;
    const dim = view.blink && Math.floor(this.clock * this.blinkHz) % 2 === 0 ? 0.35 : 1;
    p.alpha = view.opacity * dim;
    return p;
  }

  /**
   * Where an anchor is NOW, in metres relative to the feet centre, mirrored by the current facing. Always answers
   * (a proportional fallback when the set has no data): gameplay and VFX never need null checks.
   */
  anchor(id: AnchorId, out: ResolvedAnchor = { x: 0, y: 0, fallback: false }): ResolvedAnchor {
    resolveAnchor(this.def, this.meta, this.pose.frame, id, out);
    // anchors are authored in the art's own metres; a visual scale grows the picture about the feet, and the anchors with it
    const k = this.def.visualScale ?? 1;
    out.x *= k * this.pose.facing;
    out.y *= k;
    return out;
  }

  /** True if the anchor has real data in the current frame (not a fallback). Used by tests and the validator. */
  hasAnchorData(id: AnchorId): boolean {
    return !resolveAnchor(this.def, this.meta, this.pose.frame, id, this.scratch).fallback;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Idempotent. */
  dispose(): void {
    this.disposed = true;
  }
}
