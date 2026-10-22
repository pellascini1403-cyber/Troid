import { HUD_BAR_TRAVEL, HUD_PX } from './artGeometry';

/**
 * Where the pieces of a bar go for a given state, in pixels of the artist's canvas, measured from the left end of the bar. A bar is the artist's bright picture shown up to `fillRight`, the dark one shown from
 * `lostLeft` on, and the white rectangle — the artist's, `HUD_PX.marker` px wide — at `markX`, stretched to `markScale` times its width and as opaque as `markOpacity`. Pure numbers: the view applies them,
 * and the tests lay the pieces out with the same function to prove that the artist's own two pictures come out of it.
 */
export interface BarPlacement {
  /** The bright picture is shown from the left end to here. */
  fillRight: number;
  /** The dark picture is shown from here to the right end. */
  lostLeft: number;
  /** Where the white rectangle begins. */
  markX: number;
  /** How many times as wide as the artist drew it: 1 at rest, more while what was just lost lingers. */
  markScale: number;
  /** 1 while the bar is not full; the rectangle fades out over the last `FADE_AT_FULL` of the bar, where there is nothing left to mark. */
  markOpacity: number;
}

/** The rectangle fades out over this much of the edge's travel at the end of the bar. */
export const FADE_AT_FULL = 0.03;

/**
 * @param edge 0 … 1: where the bright picture ends, as a share of `HUD_BAR_TRAVEL`.
 * @param wear 0 … 1, ≥ `edge`: how far what was just lost reached.
 * @param length the length of the bar's picture in px of the canvas.
 * @param calm "fewer flashes": the rectangle keeps the size the artist drew it.
 */
export function placeBar(edge: number, wear: number, length: number, calm: boolean): BarPlacement {
  const w = HUD_PX.marker.w;
  const markX = edge * HUD_BAR_TRAVEL;
  const markOpacity = Math.min(1, Math.max(0, (1 - edge) / FADE_AT_FULL));
  // the bright picture gives way to the dark one under the rectangle; as the rectangle fades out at the end of the bar, the bright picture takes all the room it leaves, to the tip
  const seam = markX + (length - markX) * (1 - markOpacity);
  const reach = calm ? markX + w : Math.max(markX + w, wear * HUD_BAR_TRAVEL + w);
  return { fillRight: seam, lostLeft: seam, markX, markScale: (reach - markX) / w, markOpacity };
}
