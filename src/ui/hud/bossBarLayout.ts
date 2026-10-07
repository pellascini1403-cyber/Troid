import type { Insets } from '../touch/layout';

/**
 * Where the boss's bar goes (docs/PROMPT6-LOG.md S31): the bottom centre of the window, inside the safe area — and out of the way of the touch buttons,
 * because a bar under a thumb is a bar nobody reads. A pure function of the window and of the boxes to keep clear of, so that its geometry is tested on every
 * class of screen without a browser. The bar draws nothing that can be touched (`pointer-events: none`): this is about what is SEEN.
 */
export const BOSS_BAR = {
  /** Its width is this fraction of the usable width, up to `maxWidth` px. */
  fraction: 0.46,
  maxWidth: 440,
  /** The room the touch layout always leaves it (the buttons never come in so far that less than this is free): enough for a name and a bar. */
  minWidth: 160,
  /** The name (13 px) and the bar (9 px) and what lies between them. */
  height: 32,
  /** From the bottom of the window (or of the safe area, whichever is higher) to the bar. */
  bottom: 18,
  /** What it keeps between itself and a button. */
  gap: 8,
} as const;

export interface BossBarBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Box0 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The bar for a window of `width × height` px with the given safe insets, keeping clear of `avoid` (the touch areas of the buttons: only those that
 * reach the band the bar lives in count). It is centred when it can be; when a button is in the way it slides into the largest free stretch of the band,
 * as near to the centre as it can get, and only shrinks if that stretch is narrower than its width.
 */
export function computeBossBarLayout(width: number, height: number, insets: Readonly<Insets>, avoid: readonly Box0[] = []): BossBarBox {
  const lo = insets.left;
  const hi = Math.max(lo, width - insets.right);
  const usable = hi - lo;
  const y = height - Math.max(BOSS_BAR.bottom, insets.bottom) - BOSS_BAR.height;
  const wanted = Math.min(usable * BOSS_BAR.fraction, BOSS_BAR.maxWidth);
  const centre = lo + usable / 2;
  // the stretches of the band that are not under a button, widest ones to be found by walking left to right over the spans that are
  const band = { y0: y - BOSS_BAR.gap, y1: y + BOSS_BAR.height + BOSS_BAR.gap };
  const spans = avoid
    .filter((r) => r.y1 > band.y0 && r.y0 < band.y1)
    .map((r): [number, number] => [r.x0 - BOSS_BAR.gap, r.x1 + BOSS_BAR.gap])
    .sort((a, b) => a[0] - b[0]);
  const free: Array<[number, number]> = [];
  let from = lo;
  for (const [a, b] of spans) {
    if (a > from) free.push([from, Math.min(a, hi)]);
    from = Math.max(from, b);
  }
  if (from < hi) free.push([from, hi]);
  // the best stretch: where the widest bar fits (all of them, if any stretch is wide enough), and among those the one nearest the centre
  let best: BossBarBox | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [a, b] of free) {
    const w = Math.min(wanted, b - a);
    if (w <= 0) continue;
    const x = Math.min(Math.max(centre - w / 2, a), b - w);
    const distance = Math.abs(x + w / 2 - centre);
    if (!best || w > best.width + 1e-9 || (Math.abs(w - best.width) <= 1e-9 && distance < bestDistance)) {
      best = { x, y, width: w, height: BOSS_BAR.height };
      bestDistance = distance;
    }
  }
  return best ?? { x: centre - wanted / 2, y, width: wanted, height: BOSS_BAR.height };
}
