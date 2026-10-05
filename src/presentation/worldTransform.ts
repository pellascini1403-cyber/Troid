import type { ViewportLayout } from './viewport';

/**
 * Camera → world container transform (docs/ARCHITECTURE-2D.md §7.4 and §7.9). PURE.
 *
 * The whole world lives in METRES. Simulation space has +Y up; Pixi has +Y down, so the view space is `(x, −y)` and
 * that flip happens HERE and nowhere else. The `world` container is then:
 *
 *   scale    = pixels per metre (CSS px: with `autoDensity` Pixi applies the render resolution itself)
 *   position = centre of the game area on screen
 *   pivot    = camera centre in view space (snapped to a whole DEVICE pixel, so parallax layers never shimmer)
 *   rotation = camera roll (screen shake)
 */
export interface CameraCentre {
  x: number;
  y: number;
}

export interface CameraShake {
  x: number;
  y: number;
  rollRad: number;
}

export interface WorldTransform {
  scale: number;
  /** Screen position of the world container, CSS px. */
  posX: number;
  posY: number;
  /** Pivot in view space, metres (already snapped). */
  pivotX: number;
  pivotY: number;
  rotation: number;
}

/** Rounds a metre value to the nearest whole device pixel. */
export function snapToPixel(valueMetres: number, devicePixelsPerMetre: number): number {
  return Math.round(valueMetres * devicePixelsPerMetre) / devicePixelsPerMetre;
}

export function createWorldTransform(): WorldTransform {
  return { scale: 1, posX: 0, posY: 0, pivotX: 0, pivotY: 0, rotation: 0 };
}

/** Pass `out` to reuse one object per frame (the renderer does: no allocation in the hot path). */
export function computeWorldTransform(
  centre: CameraCentre,
  shake: CameraShake,
  layout: ViewportLayout,
  snap = true,
  out: WorldTransform = createWorldTransform(),
): WorldTransform {
  const dppm = layout.ppm * layout.resolution;
  const px = centre.x + shake.x;
  const py = -(centre.y + shake.y);
  out.scale = layout.ppm;
  out.posX = layout.contentX + layout.contentWidth / 2;
  out.posY = layout.contentY + layout.contentHeight / 2;
  out.pivotX = snap ? snapToPixel(px, dppm) : px;
  out.pivotY = snap ? snapToPixel(py, dppm) : py;
  out.rotation = shake.rollRad;
  return out;
}

/**
 * Parallax: a layer with `factor` f moves at f × the camera. A child of the world container ends up at
 * `screen = S·(local − f·P) + C` when its position is `(1 − f)·P`. `P` is the (snapped) camera pivot.
 */
export function parallaxOffset(pivot: number, factor: number, devicePixelsPerMetre: number): number {
  return snapToPixel((1 - factor) * pivot, devicePixelsPerMetre);
}

/** View-space Y for a simulation Y (the single place where the Y flip is defined). */
export function viewY(simY: number): number {
  return -simY;
}
