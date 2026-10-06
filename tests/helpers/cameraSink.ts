import type { CameraSink } from '@/render/CameraAdapter2D';
import { computeViewport, type ViewportLayout } from '@/presentation/viewport';
import { computeWorldTransform, type CameraCentre, type CameraShake, type WorldTransform } from '@/presentation/worldTransform';

export const VIEW_HEIGHT = 13.5;

/** Stands in for Renderer2D: same viewport maths, no Pixi. Exposes the world rectangle that would be on screen. */
export class FakeSink implements CameraSink {
  viewport: ViewportLayout;
  transform: WorldTransform | null = null;
  layout: ViewportLayout;
  constructor(readonly cssWidth: number, readonly cssHeight: number) {
    this.layout = this.compute(VIEW_HEIGHT);
    this.viewport = this.layout;
  }
  private compute(viewHeight: number): ViewportLayout {
    return computeViewport({ cssWidth: this.cssWidth, cssHeight: this.cssHeight, dpr: 3, resolutionCap: 1.75, viewHeight });
  }
  applyCamera(centre: CameraCentre, shake: CameraShake, viewHeight: number): void {
    this.layout = this.compute(viewHeight); // exactly what Renderer2D does when the camera zooms
    this.transform = computeWorldTransform(centre, shake, this.layout, true);
  }
  /** Visible world rectangle (simulation coordinates, +Y up) of the game area. */
  visible(): { x0: number; x1: number; y0: number; y1: number } {
    const t = this.transform as WorldTransform;
    const halfW = this.layout.contentWidth / 2 / t.scale;
    const halfH = this.layout.contentHeight / 2 / t.scale;
    return { x0: t.pivotX - halfW, x1: t.pivotX + halfW, y0: -t.pivotY - halfH, y1: -t.pivotY + halfH };
  }
  get tolerance(): number {
    return 1 / (this.layout.ppm * this.layout.resolution); // one device pixel (the camera snaps to the pixel grid)
  }
}

/** The screens the game supports, from a 4:3 tablet to a pillarboxed 32:9. */
export const SIZES: ReadonlyArray<readonly [string, number, number]> = [
  ['4:3 tablet', 1024, 768],
  ['16:9 desktop', 1920, 1080],
  ['19.5:9 phone', 844, 390],
  ['21:9 ultra-wide', 2560, 1080],
  ['32:9 super ultra-wide (pillarboxed to 21:9)', 3840, 1080],
];
