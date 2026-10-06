import { Container, Sprite } from 'pixi.js';
import type { VfxAtlas } from '@/assets/vfxAtlas';
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

/**
 * The Spirit Bolt in flight (docs/GAME-SPEC-2D.md §10.1, "arco/estela cian con núcleo blanco"): a cyan glow with a white-hot
 * core and a tail of two streaks fading out behind it. Four additive sprites from the VFX atlas — one batch with the rest of
 * the light layer — and nothing else: no art, no particles (the muzzle and the impact are the VFX director's).
 */
export class ProjectileView implements EntityView {
  readonly additive = true;
  readonly root = new Container({ label: 'projectile' });
  private readonly head: Sprite;
  private readonly core: Sprite;
  private readonly headBase: number;
  private readonly coreBase: number;
  private clock = 0;

  constructor(
    private readonly bolt: ProjectileLike,
    atlas: Pick<VfxAtlas, 'frames' | 'widthPx'>,
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
    const tail = make('streak', 3.0, PALETTE.energyCore, 0.8, 0.5);
    const tailCore = make('streak', 1.5, PALETTE.whiteHot, 0.9, 0.22);
    this.head = make('glow', 0.95, PALETTE.energyCore, 0.95);
    this.core = make('glow', 0.4, PALETTE.whiteHot, 1);
    this.headBase = this.head.scale.x;
    this.coreBase = this.core.scale.x;
    this.root.addChild(tail, tailCore, this.head, this.core);
  }

  sync(alpha: number, dt: number): void {
    const b = this.bolt;
    this.root.position.set(b.prevX + (b.x - b.prevX) * alpha, viewY(b.prevY + (b.y - b.prevY) * alpha));
    this.root.scale.x = b.facing;
    // a living flicker (frozen when time is: a hit-stop or a paused test gives dt = 0)
    this.clock += dt;
    const flicker = 1 + 0.1 * Math.sin(this.clock * 38);
    this.head.scale.set(this.headBase * flicker);
    this.core.scale.set(this.coreBase * (2 - flicker));
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
