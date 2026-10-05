import { Container, Sprite, type Texture } from 'pixi.js';
import type { LoadedSpriteSet } from '@/assets/SpriteAssetManager';
import { log } from '@/core/log';
import type { ResolvedAnchor } from '@/presentation/anchors';
import type { ActorViewState } from '@/presentation/actorViewState';
import { ActorPresenter } from '@/presentation/ActorPresenter';
import type { AnchorId } from '@/presentation/vocabulary';
import { viewY } from '@/presentation/worldTransform';

export interface ActorSpriteOptions {
  /** Draw order inside the (sortable) actors layer. */
  zIndex?: number;
  /** Blink frequency (Hz) while the actor is invulnerable. */
  blinkHz?: number;
}

/**
 * Binds one `ActorViewState` (written by the simulation) to Pixi: the 2D successor of `ActorVisual`. The pure
 * `ActorPresenter` decides what to show (frame, flip, alpha, flash); this class only applies it to two sprites:
 *
 *  - `body`   — the current frame;
 *  - `flash`  — the same frame, additive white, whose alpha is the hit-flash (no filter, so it never breaks batching
 *               more than one blend change).
 *
 * `root` sits at the feet centre in view space (metres), mirrored by `scale.x = facing`. The textures belong to the
 * `LoadedSpriteSet`, never to the actor: disposing an actor leaves the shared set intact, and the set can be swapped
 * at runtime (`setSpriteSet`) without touching gameplay.
 */
export class ActorSprite {
  readonly root = new Container({ label: 'actor' });
  private readonly body = new Sprite();
  private readonly flash = new Sprite();
  private set!: LoadedSpriteSet<Texture>;
  private _presenter!: ActorPresenter;
  private shown: string | null = null;
  private disposed = false;
  private readonly warn = log.scope('sprite');

  constructor(
    set: LoadedSpriteSet<Texture>,
    private readonly options: ActorSpriteOptions = {},
  ) {
    this.flash.blendMode = 'add';
    this.flash.visible = false;
    this.root.addChild(this.body, this.flash);
    if (options.zIndex !== undefined) this.root.zIndex = options.zIndex;
    this.setSpriteSet(set);
  }

  get presenter(): ActorPresenter {
    return this._presenter;
  }
  get spriteSetId(): string {
    return this.set.def.id;
  }
  /** Name of the frame currently on screen. */
  get frame(): string | null {
    return this.shown;
  }

  /** Swaps the art (placeholder → final, skin, variant). The next `sync` continues from the actor's current state. */
  setSpriteSet(set: LoadedSpriteSet<Texture>): void {
    this.set = set;
    this._presenter = new ActorPresenter(set.def, set.meta, { blinkHz: this.options.blinkHz });
    const s = 1 / set.def.artPxPerMeter;
    for (const sprite of [this.body, this.flash]) {
      sprite.anchor.set(set.def.pivot[0], set.def.pivot[1]);
      sprite.scale.set(s);
    }
    this.shown = null;
    this.show(this._presenter.pose.frame);
  }

  /** `alpha` ∈ [0,1): interpolation between the previous and current simulation tick. `dt`: real seconds. */
  sync(view: ActorViewState, alpha: number, dt: number): void {
    if (this.disposed) return;
    const pose = this._presenter.sync(view, alpha, dt);
    this.root.visible = pose.visible;
    if (!pose.visible) return;
    this.root.position.set(pose.x, viewY(pose.y));
    this.root.scale.x = pose.facing;
    this.show(pose.frame);
    this.body.alpha = pose.alpha;
    const f = pose.flash * pose.alpha;
    this.flash.visible = f > 0.01;
    this.flash.alpha = f;
  }

  /** An anchor relative to the feet, mirrored by the current facing (metres, +y up). Always answers. */
  anchor(id: AnchorId, out?: ResolvedAnchor): ResolvedAnchor {
    return this._presenter.anchor(id, out);
  }

  /** An anchor in WORLD space (simulation coordinates, metres, +y up): where VFX and projectiles spawn. */
  anchorWorld(id: AnchorId, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
    const a = this._presenter.anchor(id);
    out.x = this._presenter.pose.x + a.x;
    out.y = this._presenter.pose.y + a.y;
    return out;
  }

  /** Idempotent. Never destroys the shared textures. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this._presenter.dispose();
    this.root.removeFromParent();
    this.root.destroy({ children: true });
  }

  private show(frame: string | null): void {
    if (frame === null || frame === this.shown) return;
    const texture = this.set.textures.get(frame);
    if (!texture) {
      this.warn.warnOnce(`${this.set.def.id}:${frame}`, `[${this.set.def.id}] frame "${frame}" is not in the atlas`);
      return;
    }
    this.body.texture = texture;
    this.flash.texture = texture;
    this.shown = frame;
  }
}
