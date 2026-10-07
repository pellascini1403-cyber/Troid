import { Application, Graphics, Sprite } from 'pixi.js';
import { verticalGradientTexture } from '@/assets/proceduralTextures';
import { PALETTE } from '@/presentation/palette';
import { computeViewport, RESOLUTION_CAP, tierFor, type QualitySetting, type QualityTier, type ViewportLayout } from '@/presentation/viewport';
import {
  computeWorldTransform,
  createWorldTransform,
  parallaxOffset,
  worldToScreen,
  type CameraCentre,
  type CameraShake,
  type WorldTransform,
} from '@/presentation/worldTransform';
import { createLayers, PARALLAX_FACTOR, type Layers } from './layers';

export interface Renderer2DOptions {
  host: HTMLElement;
  /** Visible world height in metres (GAME-SPEC-2D §16: 13.5). */
  viewHeight: number;
  tier?: QualityTier;
  /** What the player chose (S30); `tier` wins when both are given. Without either, the balanced profile. */
  quality?: QualitySetting;
}

function hostSize(host: HTMLElement): { cssWidth: number; cssHeight: number } {
  return { cssWidth: host.clientWidth || window.innerWidth, cssHeight: host.clientHeight || window.innerHeight };
}

/**
 * PixiJS v8 presentation layer (docs/ARCHITECTURE-2D.md §7). It owns the `Application`, the scene-graph layers and
 * the camera → world transform. It never decides gameplay: the game loop (ours, not Pixi's ticker) calls `render()`
 * once per frame.
 *
 * `autoStart: false` + a manual `app.render()` ✅ is what the benchmark verified: one loop, no second ticker.
 */
export class Renderer2D {
  readonly layers: Layers;
  private layout: ViewportLayout;
  private viewHeight: number;
  private tier: QualityTier;
  private size: { cssWidth: number; cssHeight: number };
  private readonly bars = new Graphics();
  private readonly sky: Sprite;
  private readonly transform: WorldTransform = createWorldTransform();
  private destroyed = false;

  private constructor(
    readonly app: Application,
    private readonly host: HTMLElement,
    viewHeight: number,
    tier: QualityTier,
    layout: ViewportLayout,
    size: { cssWidth: number; cssHeight: number },
  ) {
    this.viewHeight = viewHeight;
    this.tier = tier;
    this.layout = layout;
    this.size = size;
    this.layers = createLayers(app.stage);
    this.sky = new Sprite(verticalGradientTexture(PALETTE.worldVoid, PALETTE.worldDusk));
    this.layers.sky.addChild(this.sky);
    this.layers.screen.addChild(this.bars);
    this.relayout();
  }

  static async create(opts: Renderer2DOptions): Promise<Renderer2D> {
    const tier = opts.tier ?? tierFor(opts.quality ?? 'auto');
    const size = hostSize(opts.host);
    const layout = computeViewport({ ...size, dpr: window.devicePixelRatio || 1, resolutionCap: RESOLUTION_CAP[tier], viewHeight: opts.viewHeight });
    const app = new Application();
    await app.init({
      width: size.cssWidth,
      height: size.cssHeight,
      preference: 'webgl',
      // Pixi's default start-up also loads accessibility, DOM containers, its event system, spritesheets and filters. The game
      // draws none of them: its HUD, touch controls and text are DOM (docs/ARCHITECTURE-2D.md §8) and input is handled by `input/`.
      // Skipping them takes ≈ 16 KB gz off the cold start (docs/PROMPT5-LOG.md S12). A tool that needs one imports its module
      // itself (`import 'pixi.js/filters'` in the stress lab).
      skipExtensionImports: true,
      antialias: false,
      autoStart: false,
      background: PALETTE.worldVoid,
      resolution: layout.resolution,
      autoDensity: true,
      powerPreference: 'high-performance',
    });
    opts.host.appendChild(app.canvas);
    return new Renderer2D(app, opts.host, opts.viewHeight, tier, layout, size);
  }

  get viewport(): Readonly<ViewportLayout> {
    return this.layout;
  }
  get qualityTier(): QualityTier {
    return this.tier;
  }

  /** Re-reads the host size and the device pixel ratio (call on `resize` / orientation change). */
  resize(): ViewportLayout {
    this.size = hostSize(this.host);
    this.relayout();
    return this.layout;
  }

  /** The player chose another profile: the resolution ceiling follows at once. */
  setQuality(setting: QualitySetting): void {
    this.setTier(tierFor(setting));
  }

  setTier(tier: QualityTier): void {
    this.tier = tier;
    this.relayout();
  }

  /**
   * Places the camera. `viewHeight` may change every frame (zoom): the pixel-per-metre ratio follows it, so the
   * visible height is always exactly what the camera asks for.
   */
  applyCamera(centre: CameraCentre, shake: CameraShake, viewHeight: number): void {
    if (Math.abs(viewHeight - this.viewHeight) > 1e-9) {
      this.viewHeight = viewHeight;
      this.layout = this.compute();
    }
    const t = computeWorldTransform(centre, shake, this.layout, true, this.transform);
    const { world, backdropFar, backdropMid, backdropNear, foreground } = this.layers;
    world.scale.set(t.scale);
    world.position.set(t.posX, t.posY);
    world.pivot.set(t.pivotX, t.pivotY);
    world.rotation = t.rotation;
    const dppm = this.layout.ppm * this.layout.resolution;
    const place = (c: typeof world, f: number): void => {
      c.position.set(parallaxOffset(t.pivotX, f, dppm), parallaxOffset(t.pivotY, f, dppm));
    };
    place(backdropFar, PARALLAX_FACTOR.backdropFar);
    place(backdropMid, PARALLAX_FACTOR.backdropMid);
    place(backdropNear, PARALLAX_FACTOR.backdropNear);
    place(foreground, PARALLAX_FACTOR.foreground);
  }

  /** Where a point of the world is on screen, in CSS px, with the camera of the LAST `applyCamera` (DOM that follows an object). */
  worldToScreen(x: number, y: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
    return worldToScreen(this.transform, x, y, out);
  }

  /** One call per frame, from OUR loop. */
  render(): void {
    if (!this.destroyed) this.app.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.destroy({ removeView: true }, { children: true, texture: true });
  }

  // ------------------------------------------------------------------------------------------------ internals

  private compute(): ViewportLayout {
    return computeViewport({ ...this.size, dpr: window.devicePixelRatio || 1, resolutionCap: RESOLUTION_CAP[this.tier], viewHeight: this.viewHeight });
  }

  private relayout(): void {
    this.layout = this.compute();
    this.app.renderer.resize(this.size.cssWidth, this.size.cssHeight, this.layout.resolution);
    const l = this.layout;
    // placeholder sky fills the game area
    this.sky.position.set(l.contentX, l.contentY);
    this.sky.width = l.contentWidth;
    this.sky.height = l.contentHeight;
    // bars hide whatever the world draws outside the game area
    const b = this.bars;
    b.clear();
    const { cssWidth: w, cssHeight: h } = this.size;
    if (l.barX > 0) {
      b.rect(0, 0, l.barX, h).fill(PALETTE.worldVoid);
      b.rect(w - l.barX, 0, l.barX, h).fill(PALETTE.worldVoid);
    }
    if (l.barY > 0) {
      b.rect(0, 0, w, l.barY).fill(PALETTE.worldVoid);
      b.rect(0, h - l.barY, w, l.barY).fill(PALETTE.worldVoid);
    }
  }
}
