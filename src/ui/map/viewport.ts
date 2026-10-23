import { clamp, type Rect } from '@/core/math';

/**
 * Where the map is seen from (docs/PROMPT19-LOG.md): a scale (px per metre) and where the map's origin lands on the screen, `screen = map × scale + (x, y)`. Pure functions over numbers, so the zoom and the
 * panning of the map — with a mouse, a wheel, a pinch, a keyboard or a button — are the same arithmetic wherever they come from, and are tested without a screen.
 */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The scales the map can be seen at (px per metre): the least still shows a room as a mark, the most a platform as a hand-wide band. `start` is the most a first view zooms in, so one room is not blown up to the whole panel. */
export const ZOOM = { min: 0.35, max: 24, legible: 1, start: 5 } as const;
/** Room kept around the map when it is fitted to the panel (px). */
export const FIT_PAD = 28;
/** The corner of the panel the zoom buttons sit in (px, with a little room around them): a first view that would put the map under it fits the map in what is left to its left instead, so a door at the east end is not hidden behind a button. */
export const TOOLS_CORNER = { width: 64, height: 164 } as const;
/** How much of the map must stay in the panel however it is dragged (px): the player can never lose it off the screen. */
export const KEEP_IN_VIEW = 72;
/** What one step of a button, a key or a notch of a wheel zooms by. */
export const ZOOM_STEP = 1.25;
/** What one press of an arrow key moves the map by, as a share of the panel. */
export const PAN_STEP = 0.18;

const widthOf = (r: Rect): number => r.x1 - r.x0;
const heightOf = (r: Rect): number => r.y1 - r.y0;

export const clampScale = (scale: number): number => clamp(scale, ZOOM.min, ZOOM.max);

/** The scale at which the whole of `bounds` fits the panel with `pad` px around it. */
export function fitScale(bounds: Rect, size: Size, pad = FIT_PAD): number {
  const w = Math.max(widthOf(bounds), 1e-6);
  const h = Math.max(heightOf(bounds), 1e-6);
  return Math.min(Math.max(1, size.width - 2 * pad) / w, Math.max(1, size.height - 2 * pad) / h);
}

/** The view that has the map point `at` in the middle of the panel. */
export function viewCentredOn(at: Point, size: Size, scale: number): View {
  const s = clampScale(scale);
  return { scale: s, x: size.width / 2 - at.x * s, y: size.height / 2 - at.y * s };
}

/** What is left of the panel once `reserve` px at its right edge are set aside. */
const without = (size: Size, reserve: number): Size => ({ width: Math.max(1, size.width - reserve), height: size.height });

/** The view that shows the whole of `bounds` in the middle of `size`, as large as fits (and no larger than a first view goes). */
function fitIn(bounds: Rect, size: Size, pad: number): View {
  const scale = clamp(fitScale(bounds, size, pad), ZOOM.min, ZOOM.start);
  return viewCentredOn({ x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 }, size, scale);
}

/**
 * The view that shows the whole of `bounds` in the middle of the panel, as large as fits (and no larger than a first view goes). With a `corner` (the one the buttons are in) the map is fitted in the whole
 * panel unless that would put it under the corner — a thin map in a tall panel never gets there — and then in what is left of the panel to the left of it.
 */
export function fitView(bounds: Rect, size: Size, pad = FIT_PAD, corner?: Size): View {
  const whole = fitIn(bounds, size, pad);
  if (!corner) return whole;
  const under = bounds.x1 * whole.scale + whole.x > size.width - corner.width && bounds.y1 * whole.scale + whole.y > size.height - corner.height;
  return under ? fitIn(bounds, without(size, corner.width), pad) : whole;
}

/**
 * The first view of the map: everything discovered, if it fits at a scale that can be read; if it does not (a world grown large, a small screen) the map is read at `ZOOM.legible` around the hero, who is
 * what a player looks for first. Without a hero (a map of a place that has none) it is the fitted one.
 */
export function openingView(bounds: Rect, hero: Point | null, size: Size, pad = FIT_PAD, corner?: Size): View {
  const fit = fitView(bounds, size, pad, corner);
  if (fit.scale >= ZOOM.legible || !hero) return fit;
  return viewCentredOn(hero, size, ZOOM.legible);
}

/** Zooms by `factor` keeping the map point that is under `anchor` (a screen point) where it is: the wheel zooms into the cursor, a pinch into its middle. */
export function zoomAbout(view: View, factor: number, anchor: Point): View {
  const scale = clampScale(view.scale * factor);
  const k = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * k, y: anchor.y - (anchor.y - view.y) * k };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/** Keeps at least `keep` px of the map in the panel (or all of it, if it is smaller than that), whatever the player dragged. */
export function clampView(view: View, bounds: Rect, size: Size, keep = KEEP_IN_VIEW): View {
  const left = bounds.x0 * view.scale + view.x;
  const right = bounds.x1 * view.scale + view.x;
  const top = bounds.y0 * view.scale + view.y;
  const bottom = bounds.y1 * view.scale + view.y;
  const kx = Math.min(keep, right - left, size.width);
  const ky = Math.min(keep, bottom - top, size.height);
  // the right edge of the map must be at least `kx` from the left edge of the panel, and the left edge at least `kx` from the right edge
  const dx = right < kx ? kx - right : left > size.width - kx ? size.width - kx - left : 0;
  const dy = bottom < ky ? ky - bottom : top > size.height - ky ? size.height - ky - top : 0;
  return dx === 0 && dy === 0 ? view : { ...view, x: view.x + dx, y: view.y + dy };
}

export const toScreen = (view: View, p: Point): Point => ({ x: p.x * view.scale + view.x, y: p.y * view.scale + view.y });
export const toMap = (view: View, p: Point): Point => ({ x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale });

/** The distance and the middle of two screen points: what a pinch is made of. */
export function pinchOf(a: Point, b: Point): { distance: number; middle: Point } {
  return { distance: Math.hypot(a.x - b.x, a.y - b.y), middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** How much a notch of a wheel zooms by: a line-based wheel, a pixel-based one and a trackpad's pinch (which arrives as a wheel with the control key) all end up as a smooth factor. */
export function wheelFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-clamp(pixels, -240, 240) * (ctrlKey ? 0.01 : 0.0022));
}
