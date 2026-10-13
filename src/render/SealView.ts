import { Container, Graphics } from 'pixi.js';
import { sealSigilY } from '@/presentation/environment';
import { PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import type { EntityView } from './EntityViews';

/** The part of a seal the view needs (a structural type: the view never imports the entity class). */
export interface SealLike {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly view: { readonly rejected: number; readonly opacity: number; readonly broken: boolean };
}

/**
 * The sigil as the ART draws it (`RoomArtView`): the picture of a ward hanging, and its flash. It is told the same three things the blockout's shapes read — how much of a blow that was
 * turned away is left (`rejected`), how much of the ward is left (`opacity`) and whether it is broken — and moves itself; it decides nothing.
 */
export interface SealArt {
  readonly root: Container;
  update(state: { readonly rejected: number; readonly opacity: number; readonly broken: boolean }, clock: number): void;
}

/**
 * The sigil of a seal (docs/PROMPT6-LOG.md S28): the mark the hero must hit, a diamond of violet ink with a pale slit for an eye, on a halo that
 * breathes — the colour of what is enemy to the hero (docs/GAME-SPEC-2D.md §3.4) — drawn in the additive layer in front of the door it holds. A
 * blow that is turned away makes it flash white and flinch; once broken it swells and fades. A PLACEHOLDER shape made of three `Graphics`:
 * no art, no particles (the rejection and the break have effects of their own, raised by the VFX director from the events).
 */
export class SealView implements EntityView {
  readonly additive = true;
  readonly root = new Container({ label: 'seal' });
  private readonly halo = new Graphics();
  private readonly sigil = new Graphics();
  private readonly flash = new Graphics();
  private art: SealArt | null = null;
  private clock = 0;

  constructor(private readonly seal: SealLike) {
    const diamond = (r: number): number[] => [0, -r * 1.35, r, 0, 0, r * 1.35, -r, 0];
    this.halo.circle(0, 0, 1.35).fill({ color: PALETTE.violetCore, alpha: 0.14 });
    this.halo.circle(0, 0, 0.85).stroke({ width: 0.04, color: PALETTE.violetGlow, alpha: 0.5 });
    this.sigil.poly(diamond(0.62)).fill({ color: PALETTE.violetDeep, alpha: 0.7 }).stroke({ width: 0.07, color: PALETTE.violetCore, alpha: 0.95 });
    this.sigil.poly(diamond(0.34)).stroke({ width: 0.04, color: PALETTE.violetGlow, alpha: 0.8 });
    this.sigil.ellipse(0, 0, 0.07, 0.3).fill({ color: PALETTE.whiteHot, alpha: 0.95 });
    this.flash.poly(diamond(0.8)).fill({ color: PALETTE.whiteHot, alpha: 1 });
    this.flash.alpha = 0;
    this.root.addChild(this.halo, this.sigil, this.flash);
    this.root.position.set(seal.x, viewY(sealSigilY(seal)));
  }

  /** The art draws this sigil from now on (or, with `null`, the blockout's shapes do again): the shapes below are then not drawn. */
  dress(art: SealArt | null): void {
    this.art = art;
    for (const g of [this.halo, this.sigil, this.flash]) g.visible = art === null;
    if (art) this.root.addChild(art.root);
  }

  sync(_alpha: number, dt: number): void {
    this.clock += dt;
    const v = this.seal.view;
    if (this.art) {
      // the art was cleared (the room was built again, or its pages were let go): the blockout's shapes are the sigil again
      if (this.art.root.destroyed) this.dress(null);
      else {
        this.art.update(v, this.clock);
        this.root.alpha = v.opacity;
        return;
      }
    }
    const breathe = 1 + 0.06 * Math.sin(this.clock * 3.2);
    const swell = v.broken ? 1 + (1 - v.opacity) * 0.8 : 1;
    this.halo.scale.set(breathe * swell);
    this.sigil.scale.set((1 - v.rejected * 0.12) * swell); // a blow that is turned away makes it flinch
    this.flash.alpha = v.rejected * 0.9 * v.opacity;
    this.root.alpha = v.opacity;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
