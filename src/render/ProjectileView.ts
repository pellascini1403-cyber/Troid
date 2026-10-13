import { Container, Sprite } from 'pixi.js';
import type { VfxAtlas, VfxSequence } from '@/assets/vfxAtlas';
import { PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import type { EntityView } from './EntityViews';

/** The part of a projectile the view needs (a structural type: the view never imports the entity class). */
export interface ProjectileLike {
  readonly x: number;
  readonly y: number;
  readonly prevX: number;
  readonly prevY: number;
  readonly facing: 1 | -1;
}

/** The painted bolt: how wide its picture is drawn (metres; its head is a third of it and its flames stream back from it), how fast its four frames burn and how long it takes to swell to full size as it leaves the hand. */
const PAINTED_WIDTH = 3;
const PAINTED_FPS = 16;
const SWELL_SECONDS = 0.1;

/**
 * The Spirit Bolt in flight (docs/GAME-SPEC-2D.md §10.1, "arco/estela cian con núcleo blanco"): a cyan glow with a white-hot
 * core and a tail of two streaks fading out behind it. Four additive sprites from the VFX atlas — one batch with the rest of
 * the light layer — and nothing else: no particles (the muzzle and the impact are the VFX director's).
 *
 * With the art's own bolt (docs/ART-PIPELINE-2D.md §M.14: the sequences `bolt_body` and `bolt_core` of the `vfx-flipbooks` pack) it is a teardrop of energy with flames that stream back from it,
 * burning in four frames that loop, over a soft bloom of the same cyan: the body tinted cyan and the core white-hot, as every effect of the hero's light is. It swells to its size in the first tenth of a
 * second (it leaves the hand, it is not born in the air). Without it — the art has none, or has not arrived — the shapes above are what flies, exactly as before.
 */
export class ProjectileView implements EntityView {
  readonly additive = true;
  readonly root = new Container({ label: 'projectile' });
  private readonly head: Sprite;
  private readonly core: Sprite;
  private readonly headBase: number;
  private readonly coreBase: number;
  private readonly painted: { body: Sprite; heart: Sprite; bodyFrames: VfxSequence['frames']; heartFrames: VfxSequence['frames']; base: number; frame: number } | null = null;
  private clock = 0;

  constructor(
    private readonly bolt: ProjectileLike,
    atlas: Pick<VfxAtlas, 'frames' | 'widthPx'> & Partial<Pick<VfxAtlas, 'sequences'>>,
  ) {
    const make = (shape: 'glow' | 'streak', widthMetres: number, tint: number, alpha: number, aspect = 1): Sprite => {
      const s = new Sprite(atlas.frames[shape]);
      s.anchor.set(shape === 'streak' ? 1 : 0.5, 0.5); // a streak's bright end is its right end: it sits ON the head, the tail trails behind
      const k = widthMetres / atlas.widthPx[shape];
      s.scale.set(k, k * aspect);
      s.tint = tint;
      s.alpha = alpha;
      s.blendMode = 'add';
      return s;
    };
    const body = atlas.sequences?.['bolt_body'];
    const heart = atlas.sequences?.['bolt_core'];
    if (body && heart) {
      // the art's bolt: a soft bloom under the two painted layers (the same two the shapes make, with a body of flames in place of the streaks)
      const picture = (seq: VfxSequence, tint: number): Sprite => {
        const sp = new Sprite(seq.frames[0]);
        sp.anchor.set(seq.pivot[0], seq.pivot[1]);
        sp.scale.set(PAINTED_WIDTH / seq.width);
        sp.tint = tint;
        sp.blendMode = 'add';
        return sp;
      };
      this.head = make('glow', 1.5, PALETTE.energyCore, 0.5);
      this.core = make('glow', 0.5, PALETTE.whiteHot, 0.8);
      const b = picture(body, PALETTE.energyCore);
      const c = picture(heart, PALETTE.whiteHot);
      this.painted = { body: b, heart: c, bodyFrames: body.frames, heartFrames: heart.frames, base: b.scale.x, frame: 0 };
      this.headBase = this.head.scale.x;
      this.coreBase = this.core.scale.x;
      this.root.addChild(this.head, b, c, this.core);
      return;
    }
    const tail = make('streak', 3.0, PALETTE.energyCore, 0.8, 0.5);
    const tailCore = make('streak', 1.5, PALETTE.whiteHot, 0.9, 0.22);
    this.head = make('glow', 0.95, PALETTE.energyCore, 0.95);
    this.core = make('glow', 0.4, PALETTE.whiteHot, 1);
    this.headBase = this.head.scale.x;
    this.coreBase = this.core.scale.x;
    this.root.addChild(tail, tailCore, this.head, this.core);
  }

  /** Whether the art's own bolt is what flies (the E2E asks; nothing in the game does). */
  get isPainted(): boolean {
    return this.painted !== null;
  }

  sync(alpha: number, dt: number): void {
    const b = this.bolt;
    this.root.position.set(b.prevX + (b.x - b.prevX) * alpha, viewY(b.prevY + (b.y - b.prevY) * alpha));
    this.root.scale.x = b.facing;
    // a living flicker (frozen when time is: a hit-stop or a paused test gives dt = 0)
    this.clock += dt;
    const flicker = 1 + 0.1 * Math.sin(this.clock * 38);
    const p = this.painted;
    if (p) {
      // it swells as it leaves the hand, and its flames burn in a loop
      const swell = 0.4 + 0.6 * Math.min(1, this.clock / SWELL_SECONDS);
      const at = Math.floor(this.clock * PAINTED_FPS) % p.bodyFrames.length;
      if (at !== p.frame) {
        p.frame = at;
        p.body.texture = p.bodyFrames[at]!;
        p.heart.texture = p.heartFrames[at % p.heartFrames.length]!;
      }
      p.body.scale.set(p.base * swell);
      p.heart.scale.set(p.base * swell);
      this.head.scale.set(this.headBase * flicker * swell);
      this.core.scale.set(this.coreBase * (2 - flicker) * swell);
      return;
    }
    this.head.scale.set(this.headBase * flicker);
    this.core.scale.set(this.coreBase * (2 - flicker));
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
