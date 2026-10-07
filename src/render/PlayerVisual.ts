import { Container, type Texture } from 'pixi.js';
import type { LoadedSpriteSet } from '@/assets/SpriteAssetManager';
import type { Rect } from '@/core/math';
import type { ResolvedAnchor } from '@/presentation/anchors';
import type { ActorViewState } from '@/presentation/actorViewState';
import { chooseSource, type VisualMode, type VisualSource } from '@/presentation/visualSource';
import type { AnchorId } from '@/presentation/vocabulary';
import type { ActorSprite, ActorSpriteOptions } from './ActorSprite';

/**
 * THE PLAYER'S VISUAL (docs/ART-PIPELINE-2D.md, part D): everything the game asks of "how the protagonist looks", behind one interface, so that the look can
 * change — placeholder, real art, one and then the other — without a line of gameplay, camera, HUD, save or input knowing. The simulation writes an
 * `ActorViewState`; a visual draws it. Nothing here reads a position the simulation does not own, and nothing here writes one: a look can be swapped at any
 * moment and the hero does not move, hit differently or change speed by a hair (the collision body, the hurtbox and the hitboxes are data of `player/` and
 * `combat/`, never of the picture — §A.7).
 *
 * An `ActorSprite` already is a `PlayerVisual` (its surface is exactly this), and it is how each LOOK is drawn:
 *  - the PLACEHOLDER visual: an `ActorSprite` over the procedural set — always there, the way back;
 *  - the ART visual: an `ActorSprite` over the real set, once the art library has loaded it.
 * `PlayerVisualSwitch` holds both and shows one at a time.
 */
export interface PlayerVisual {
  /** Added to the actors layer once and never replaced. */
  readonly root: Container;
  /** The set on screen now. */
  readonly spriteSetId: string;
  /** The frame on screen now. */
  readonly frame: string | null;
  /** The way it faces now (+1 right, −1 left) and whether anything of it is drawn. */
  readonly facing: number;
  readonly visible: boolean;
  sync(view: ActorViewState, alpha: number, dt: number): void;
  anchor(id: AnchorId, out?: ResolvedAnchor): ResolvedAnchor;
  anchorWorld(id: AnchorId, out?: { x: number; y: number }): { x: number; y: number };
  /** The rectangle the picture on screen covers, in the world: what is SEEN — never the body, the hurtbox or the hitbox (those are the simulation's). */
  bounds(out?: Rect): Rect;
  dispose(): void;
}

interface ArtLook {
  sprite: ActorSprite;
  set: LoadedSpriteSet<Texture>;
  /** Gives the set back to whoever counted it (the art library). */
  release: () => void;
}

/**
 * The protagonist with two looks at once. Both are driven by EVERY frame's view state (so each keeps its own animation time, and the switch from one to the other
 * is a cut on the same pose, never a restart), and only the one `chooseSource` names is visible: one visible sprite, so no extra draw call.
 *
 *  - without art, only the placeholder is ever shown;
 *  - `auto` shows the art for every state it can stand for and the placeholder for the rest (a set with only `idle` and `walk` is the real hero standing and
 *    walking and the placeholder for everything else — the art grows in without the game ever looking at the difference);
 *  - `placeholder` is the way back, at any time; `art` is to judge the art on its own.
 */
export class PlayerVisualSwitch implements PlayerVisual {
  readonly root = new Container({ label: 'player-visual' });
  private art: ArtLook | null = null;
  private source: VisualSource = 'placeholder';
  private _mode: VisualMode;

  /**
   * `placeholder` is the always-there look. `makeArt` builds the sprite of the real art when it arrives, with the options the visual asks for (a real set is
   * partial by design while the art is delivered, so its fallbacks are silent); the visual itself does not know Pixi's loader or the art library.
   */
  constructor(
    private readonly placeholder: ActorSprite,
    private readonly makeArt: (set: LoadedSpriteSet<Texture>, options: ActorSpriteOptions) => ActorSprite,
    mode: VisualMode = 'auto',
    options: { zIndex?: number } = {},
  ) {
    this._mode = mode;
    if (options.zIndex !== undefined) this.root.zIndex = options.zIndex;
    this.root.addChild(placeholder.root);
  }

  get mode(): VisualMode {
    return this._mode;
  }

  /** Reverts to the placeholder (`placeholder`), or lets the art in (`auto` / `art`). Takes effect on the next sync. */
  setMode(mode: VisualMode): void {
    this._mode = mode;
  }

  /** The look drawing the last state. */
  get shows(): VisualSource {
    return this.source;
  }

  /** The art's set, once it has been attached. */
  get artSet(): LoadedSpriteSet<Texture> | null {
    return this.art?.set ?? null;
  }

  get hasArt(): boolean {
    return this.art !== null;
  }

  get spriteSetId(): string {
    return this.current.spriteSetId;
  }

  get frame(): string | null {
    return this.current.frame;
  }

  get facing(): number {
    return this.current.root.scale.x;
  }

  get visible(): boolean {
    return this.current.root.visible;
  }

  private get current(): ActorSprite {
    return this.source === 'art' && this.art ? this.art.sprite : this.placeholder;
  }

  /** Brings the real art in. `release` gives it back when it is detached (or the visual is disposed). */
  attachArt(set: LoadedSpriteSet<Texture>, release: () => void): void {
    this.detachArt();
    const sprite = this.makeArt(set, { quietFallbacks: true });
    sprite.root.visible = false;
    this.root.addChild(sprite.root);
    this.art = { sprite, set, release };
  }

  /** Takes the art away and shows the placeholder again. Idempotent. */
  detachArt(): void {
    const art = this.art;
    if (!art) return;
    this.art = null;
    this.source = 'placeholder';
    art.sprite.dispose();
    art.release();
    this.placeholder.root.visible = true;
  }

  sync(view: ActorViewState, alpha: number, dt: number): void {
    this.placeholder.sync(view, alpha, dt);
    if (!this.art) {
      this.source = 'placeholder';
      return;
    }
    this.art.sprite.sync(view, alpha, dt);
    this.source = chooseSource(this._mode, this.art.set.def, view.anim);
    // each sprite decided for itself whether this pose is visible (a blink, a death that has ended): the look not chosen is hidden on top of that
    const showArt = this.source === 'art';
    this.placeholder.root.visible = this.placeholder.root.visible && !showArt;
    this.art.sprite.root.visible = this.art.sprite.root.visible && showArt;
  }

  anchor(id: AnchorId, out?: ResolvedAnchor): ResolvedAnchor {
    return this.current.anchor(id, out);
  }

  anchorWorld(id: AnchorId, out?: { x: number; y: number }): { x: number; y: number } {
    return this.current.anchorWorld(id, out);
  }

  bounds(out?: Rect): Rect {
    return this.current.bounds(out);
  }

  dispose(): void {
    this.detachArt();
    this.placeholder.dispose();
    this.root.removeFromParent();
    this.root.destroy({ children: true });
  }
}
