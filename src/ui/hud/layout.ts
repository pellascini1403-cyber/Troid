import { uiScale } from '@/input/gestures/TouchConfig';
import type { Insets } from '../touch/layout';
import { NO_INSETS } from '../touch/layout';

/**
 * The design numbers of the HUD (docs/GAME-SPEC-2D.md §17), in dp: a card on the left and, to its right, the life segments,
 * the magic bar and the bottles. Everything is authored in dp and scaled as one block, so the proportions never change.
 */
export const HUD_DESIGN = {
  /** Distance from the safe area to the HUD, dp. */
  margin: 16,
  card: { w: 52, h: 68 },
  /** Space between the card and the stack beside it. */
  cardGap: 10,
  life: { segW: 22, segH: 10, gap: 3 },
  magic: { w: 140, h: 8 },
  /**
   * A bottle icon: the vial drawn is 22 × 30; its touch area is as TALL as a finger needs and as WIDE as its pitch (36):
   * neighbours must never share pixels (a finger means one bottle), so the width follows the spacing, not the 44 px ideal. The height is 49 dp so that
   * at the smallest `uiScale` (0.9: a small phone) it is still 44 css px (S31: the geometry audit found 39.6 px with 44 dp). To drink, a touch screen
   * has a second way: the chip, which is 64 dp across.
   */
  vial: { w: 22, h: 30, pitch: 36, hitH: 49 },
  /** Vertical gaps inside the stack: life → magic, magic → bottles. */
  rowGap: { lifeMagic: 8, magicBottles: 10 },
  /** The touch area of the bottle icons is taller than the vial drawn: it reaches up this far over the gap above them. */
  bottlesOverlap: 8,
} as const;

export interface HudLayout {
  /** `uiScale` of the window: the HUD is drawn at `HUD_DESIGN` × this. */
  scale: number;
  /** Top-left corner of the HUD in px (the safe area plus the margin). */
  x: number;
  y: number;
  /** Size of the block in dp (before scaling), for a given number of life segments and bottles. */
  width: number;
  height: number;
}

/** Width and height of the whole HUD block in dp for `lifeMax` segments and `bottles` vials. */
export function hudBlockSize(lifeMax: number, bottles: number): { width: number; height: number } {
  const d = HUD_DESIGN;
  const lifeW = lifeMax * d.life.segW + Math.max(0, lifeMax - 1) * d.life.gap;
  const bottlesW = bottles > 0 ? bottles * d.vial.pitch : 0;
  const stackW = Math.max(lifeW, d.magic.w, bottlesW);
  const stackH = d.life.segH + d.rowGap.lifeMagic + d.magic.h + d.rowGap.magicBottles - d.bottlesOverlap + d.vial.hitH;
  return { width: d.card.w + d.cardGap + stackW, height: Math.max(d.card.h, stackH) };
}

/**
 * Where the HUD goes: the top-left corner, inside the safe area (a notch, the Dynamic Island, rounded corners) plus the margin,
 * at the `uiScale` of the window times the player's size preference. Nothing is positioned in absolute px: the same function
 * serves a 4:3 tablet, a 16:9 monitor, a 19.5:9 phone and a 21:9 ultra-wide.
 */
export function computeHudLayout(
  width: number,
  height: number,
  insets: Readonly<Insets> = NO_INSETS,
  sizePreference = 1,
  lifeMax = 5,
  bottles = 3,
): HudLayout {
  const scale = uiScale(width, height) * sizePreference;
  const block = hudBlockSize(lifeMax, bottles);
  return {
    scale,
    x: insets.left + HUD_DESIGN.margin * scale,
    y: insets.top + HUD_DESIGN.margin * scale,
    width: block.width,
    height: block.height,
  };
}
