import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { ActorViewState } from '@/presentation/actorViewState';
import { createProceduralPose, evalPose, type ProceduralLook } from '@/presentation/proceduralPose';
import { viewY } from '@/presentation/worldTransform';
import type { EntityView } from './EntityViews';

/** The part of an enemy the view reads (a structural type: the view never imports the entity class). */
export interface ProceduralSource {
  readonly view: ActorViewState;
}

export interface ProceduralActorOptions {
  /** The soft round light of the VFX atlas: the aura and the glow of the eyes are tinted copies of it. */
  glow: Texture;
}

/** Texture size of the glow frame in pixels (the VFX atlas draws it 96 × 96). */
const GLOW_PX = 96;
/**
 * The shapes are authored in CENTIMETRES and scaled down by this factor. Pixi subdivides curves with a tolerance in the
 * shape's own units: drawn in metres (a 0.15 m eye) a round shape comes out as a polygon; in centimetres it is smooth.
 */
const UNITS_PER_METRE = 100;
/** The aura at rest is this many body-widths wide (the pose scales it up while the warning builds). */
const AURA_WIDTH = 2.2;

/**
 * An actor drawn from shapes and deformed by its state (docs/ARCHITECTURE-2D.md §7.5): the view of the Ink Slime today
 * and of any ink creature tomorrow, behind the same `EntityView` as every other entity. The shapes are drawn ONCE; each
 * frame only changes transforms and alphas, so it costs nothing to redraw and allocates nothing.
 *
 * Back to front: aura (additive) · body (ink, rim, sheen) · eyes · eye glow + hit flash (additive). Squash and stretch
 * are about the FEET, so a squashed slime flattens into the floor instead of floating. `root` sits at the feet in view
 * space and is mirrored by the facing.
 */
export class ProceduralActor implements EntityView {
  readonly root = new Container({ label: 'procedural' });
  private readonly aura = new Sprite();
  private readonly shape = new Container({ label: 'shape' });
  private readonly body = new Graphics();
  private readonly eyes = new Graphics();
  private readonly glowL = new Sprite();
  private readonly glowR = new Sprite();
  private readonly flash = new Graphics();
  private readonly pose = createProceduralPose();
  private time = 0;

  constructor(
    private readonly look: ProceduralLook,
    private readonly source: ProceduralSource,
    options: ProceduralActorOptions,
  ) {
    const { width: w, height: h, colors: c, eyes: e } = look;
    const U = UNITS_PER_METRE;
    const hw = w / 2;

    // the aura: a violet halo behind the body, as wide as the blob at rest and growing with the warning
    this.aura.texture = options.glow;
    this.aura.anchor.set(0.5);
    this.aura.tint = c.aura;
    this.aura.blendMode = 'add';
    this.aura.position.set(0, -h * 0.5);
    this.aura.scale.set((w * AURA_WIDTH) / GLOW_PX);
    this.aura.alpha = 0;

    // the body: a dome of ink with a flat base, a violet rim and a soft sheen on its upper left
    const dome = (g: Graphics): Graphics =>
      g
        .moveTo(-hw * U, 0)
        .bezierCurveTo(-hw * 1.06 * U, -h * 0.55 * U, -hw * 0.62 * U, -h * U, 0, -h * U)
        .bezierCurveTo(hw * 0.62 * U, -h * U, hw * 1.06 * U, -h * 0.55 * U, hw * U, 0)
        .closePath();
    dome(this.body).fill(c.fill).stroke({ width: 0.055 * U, color: c.rim });
    this.body.ellipse(-hw * 0.28 * U, -h * 0.72 * U, hw * 0.34 * U, h * 0.12 * U).fill({ color: c.sheen, alpha: 0.55 });

    // the eyes: two vertical capsules near the front, drawn at their full height (the squint scales them)
    const ex = hw * 2 * e.forward;
    const spread = (w * e.spread) / 2;
    const ey = -h * e.y;
    for (const dx of [-spread, spread]) {
      this.eyes.roundRect((ex + dx - e.width / 2) * U, (ey - e.height / 2) * U, e.width * U, e.height * U, (e.width / 2) * U).fill(c.eye);
    }
    // squinting scales the eyes about their own centre, not about the feet
    this.eyes.pivot.set(0, ey * U);
    this.eyes.position.set(0, ey);
    this.glowL.texture = this.glowR.texture = options.glow;
    for (const [g, dx] of [[this.glowL, -spread], [this.glowR, spread]] as const) {
      g.anchor.set(0.5);
      g.tint = c.eyeGlow;
      g.blendMode = 'add';
      g.position.set(ex + dx, ey);
      g.scale.set((e.height * 3.4) / GLOW_PX);
      g.alpha = 0;
    }

    // the hit flash: the silhouette again, additive white
    dome(this.flash).fill(c.flash);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    for (const g of [this.body, this.eyes, this.flash]) g.scale.set(1 / U);

    this.shape.addChild(this.body, this.eyes, this.glowL, this.glowR, this.flash);
    this.root.addChild(this.aura, this.shape);
  }

  /** `alpha` ∈ [0,1): interpolation between ticks. `dt`: animation seconds (frozen by pause and hit-stop). */
  sync(alpha: number, dt: number): void {
    const v = this.source.view;
    this.time += dt;
    const x = v.prevX + (v.x - v.prevX) * alpha;
    const y = v.prevY + (v.y - v.prevY) * alpha;
    const p = evalPose(this.look, v.anim, v.phase, v.phaseT, this.time, this.pose);

    this.root.visible = v.visible;
    this.root.position.set(x, viewY(y));
    this.root.scale.x = v.facing;

    this.shape.scale.set(p.scaleX, p.scaleY);
    this.shape.skew.x = -p.lean; // view space is y-down: a forward lean is a negative shear
    this.shape.position.x = p.shakeX;
    this.shape.alpha = v.opacity;

    // the eyes close from the top and bottom (squint) and light up
    this.eyes.scale.y = Math.max(0.08, 1 - p.squint * 0.92) / UNITS_PER_METRE;
    const glow = Math.min(1, Math.max(0, p.eyeGlow - 0.55) / 1.2);
    this.glowL.alpha = this.glowR.alpha = glow * v.opacity;
    this.eyes.alpha = Math.min(1, 0.55 + p.eyeGlow * 0.55);

    this.aura.alpha = p.aura * v.opacity;
    this.aura.scale.set(((this.look.width * AURA_WIDTH) / GLOW_PX) * p.auraScale);
    this.aura.position.set(p.shakeX, -this.look.height * 0.5 * p.scaleY);

    this.flash.alpha = v.flash * v.opacity;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
