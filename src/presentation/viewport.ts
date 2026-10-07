/**
 * Viewport math (docs/ARCHITECTURE-2D.md §7.9). PURE: no Pixi, no DOM, so it is tested in Node.
 *
 * The VISIBLE HEIGHT is fixed (`viewHeight`, metres) and the visible WIDTH varies with the screen, clamped to
 * [4:3, 21:9]: wider screens get side bars (so ultra-wide monitors do not reveal more of a room than it was
 * designed to show); narrower ones get top/bottom bars and a "rotate your device" flag.
 */

export const MIN_ASPECT = 4 / 3;
export const MAX_ASPECT = 21 / 9;

export interface ViewportInput {
  /** Size of the host element in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** `window.devicePixelRatio`. */
  dpr: number;
  /** Quality-profile ceiling for the render resolution (1.25 low · 1.75 medium · 2 high). */
  resolutionCap: number;
  /** Visible world height in metres. */
  viewHeight: number;
}

export interface ViewportLayout {
  /** Raw aspect of the host (width / height). */
  aspect: number;
  /** Aspect of the game area after clamping to [MIN_ASPECT, MAX_ASPECT]. */
  contentAspect: number;
  /** The game area, in CSS pixels, centred in the host. Bars fill the rest. */
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  /** Width of each vertical bar / height of each horizontal bar, CSS px (0 when none). */
  barX: number;
  barY: number;
  /** CSS pixels per metre. */
  ppm: number;
  /** Render resolution = min(devicePixelRatio, cap). The backing store is `css × resolution`. */
  resolution: number;
  /** Visible world width in metres. */
  visibleWidth: number;
  /** True when the host is narrower than 4:3 (portrait): the UI asks the player to rotate the device. */
  rotateDevice: boolean;
}

export function computeViewport(i: ViewportInput): ViewportLayout {
  const w = Math.max(1, i.cssWidth);
  const h = Math.max(1, i.cssHeight);
  const aspect = w / h;

  let contentWidth = w;
  let contentHeight = h;
  if (aspect > MAX_ASPECT) contentWidth = h * MAX_ASPECT; // pillarbox
  else if (aspect < MIN_ASPECT) contentHeight = w / MIN_ASPECT; // letterbox

  const contentX = (w - contentWidth) / 2;
  const contentY = (h - contentHeight) / 2;
  const ppm = contentHeight / i.viewHeight;
  const resolution = Math.max(0.5, Math.min(i.dpr, i.resolutionCap));

  return {
    aspect,
    contentAspect: contentWidth / contentHeight,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    barX: contentX,
    barY: contentY,
    ppm,
    resolution,
    visibleWidth: contentWidth / ppm,
    rotateDevice: aspect < MIN_ASPECT,
  };
}

/** Render-resolution ceilings per quality profile (docs/ARCHITECTURE-2D.md §7.10). */
export const RESOLUTION_CAP = { low: 1.25, medium: 1.75, high: 2 } as const;
export type QualityTier = keyof typeof RESOLUTION_CAP;

/**
 * What a player may choose (docs/PROMPT6-LOG.md S30). `auto` is NOT a measurement: nothing in the game measures a device yet, so it is the balanced
 * profile (`medium`) the game always had; `low` and `high` are the two ends. A measuring `auto` is for the day there is something to measure it with.
 */
export const QUALITY_SETTINGS = ['auto', 'low', 'high'] as const;
export type QualitySetting = (typeof QUALITY_SETTINGS)[number];

export function tierFor(setting: QualitySetting): QualityTier {
  return setting === 'low' ? 'low' : setting === 'high' ? 'high' : 'medium';
}
