import { Container, Sprite } from 'pixi.js';
import type { VfxAtlas } from '@/assets/vfxAtlas';
import { PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import type { EntityView } from './EntityViews';

/** The part of a shot the view needs (a structural type: the view never imports the entity class). */
export interface EnemyShotLike {
  readonly x: number;
  readonly y: number;
  readonly prevX: number;
  readonly prevY: number;
  readonly facing: 1 | -1;
  readonly look: 'orb' | 'wave';
  readonly spec: { readonly size: { readonly w: number; readonly h: number } };
}

/**
 * What an enemy throws (docs/PROMPT21-LOG.md), as light of the enemies' colour (violet): a spit is a bead with a white heart and a short tail; a wave along the floor is a low flat streak that runs with the ground.
 * The same soft shapes of the effects' atlas the hero's bolt is made of — additive, a batch with the rest of the light — and nothing else.
 */
export class EnemyShotView implements EntityView {
  readonly additive = true;
  readonly root = new Container({ label: 'enemyshot' });
  private readonly head: Sprite;
  private readonly baseHead: number;
  private clock = 0;

  constructor(private readonly shot: EnemyShotLike, atlas: Pick<VfxAtlas, 'frames' | 'widthPx'>) {
    const make = (shape: 'glow' | 'streak', widthMetres: number, tint: number, alpha: number, aspect = 1): Sprite => {
      const s = new Sprite(atlas.frames[shape]);
      s.anchor.set(shape === 'streak' ? 1 : 0.5, 0.5);
      const k = widthMetres / atlas.widthPx[shape];
      s.scale.set(k, k * aspect);
      s.tint = tint;
      s.alpha = alpha;
      s.blendMode = 'add';
      return s;
    };
    const { w, h } = shot.spec.size;
    if (shot.look === 'wave') {
      // the ground wave: as wide as it is, and as high as it is, lying along the floor
      const body = make('glow', Math.max(w, 0.9) * 1.8, PALETTE.violetCore, 0.7, (h / Math.max(w, 0.9)) * 0.9);
      const core = make('glow', Math.max(w, 0.9) * 0.9, PALETTE.violetGlow, 0.9, 0.5);
      const trail = make('streak', 2.2, PALETTE.violetCore, 0.6, 0.35);
      this.head = body;
      this.root.addChild(trail, body, core);
    } else {
      const tail = make('streak', 1.8, PALETTE.violetCore, 0.7, 0.4);
      this.head = make('glow', w * 2.6, PALETTE.violetCore, 0.95);
      const core = make('glow', w * 1.1, PALETTE.whiteHot, 1);
      this.root.addChild(tail, this.head, core);
    }
    this.baseHead = this.head.scale.x;
  }

  sync(alpha: number, dt: number): void {
    const s = this.shot;
    this.root.position.set(s.prevX + (s.x - s.prevX) * alpha, viewY(s.prevY + (s.y - s.prevY) * alpha));
    this.root.scale.x = s.facing;
    this.clock += dt;
    this.head.scale.x = this.baseHead * (1 + 0.1 * Math.sin(this.clock * 30));
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
