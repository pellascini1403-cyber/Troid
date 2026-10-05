import { Container, Graphics } from 'pixi.js';
import type { ActorViewState } from '@/presentation/actorViewState';
import { PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import type { EntityView } from './EntityViews';

/** The part of a training dummy the view needs (a structural type: the view never imports the entity class). */
export interface DummyLike {
  readonly view: ActorViewState;
  readonly body: { readonly halfW: number; readonly height: number };
}

/**
 * A grey target with a face notch: the view of the `TrainingDummy`. Procedural on purpose (no art): it shows the
 * hit flash and the fade-out on death, which is all combat testing needs. Neutral colours: it is not an enemy design.
 */
export class DummyView implements EntityView {
  readonly root = new Container({ label: 'dummy' });
  private readonly body = new Graphics();
  private readonly flash = new Graphics();

  constructor(private readonly dummy: DummyLike) {
    const { halfW, height } = dummy.body;
    const w = halfW * 2;
    this.body.roundRect(-halfW, -height, w, height, 0.18).fill(PALETTE.worldSlate).stroke({ width: 0.04, color: PALETTE.worldNight });
    this.body.rect(halfW - 0.3, -height + 0.35, 0.22, 0.1).fill(PALETTE.whiteHot);
    this.flash.roundRect(-halfW, -height, w, height, 0.18).fill(0xffffff);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    this.root.addChild(this.body, this.flash);
  }

  sync(alpha: number): void {
    const v = this.dummy.view;
    this.root.position.set(v.prevX + (v.x - v.prevX) * alpha, viewY(v.prevY + (v.y - v.prevY) * alpha));
    this.root.scale.x = v.facing;
    this.body.alpha = v.opacity;
    this.flash.alpha = v.flash * v.opacity;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
