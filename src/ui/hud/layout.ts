import { uiScale } from '@/input/gestures/TouchConfig';
import type { Insets } from '../touch/layout';
import { NO_INSETS } from '../touch/layout';
import { HUD_BLOCK_DP, HUD_DP_PER_PX, HUD_PX } from './artGeometry';

/**
 * The design numbers of the HUD (docs/PROMPT17-LOG.md), in dp: the artist's composition — the portrait, the two bars and the bottles — as one block at the top left. Everything inside the block is where the artist drew it
 * (`artGeometry.ts`); here is how big the block is and where it sits. It is scaled as one piece, so the proportions never change.
 */
export const HUD_DESIGN = {
  /**
   * Distance from the safe area to the HUD, dp. Measured on the artist's picture of the HUD in the game (an 844 × 390 phone, `uiScale` 819/844): the hexagon starts 25.0 px from the left of the screen and 24.8 px from the
   * top, which is 25.8 and 25.6 dp.
   */
  margin: 25.7,
  /** The block, dp: 218.3 × 78.9. */
  block: HUD_BLOCK_DP,
  /**
   * A bottle: the one drawn is 16.9 × 11.7 dp; its touch area is as TALL as a finger needs and as WIDE as its pitch (19.8): neighbours must never share pixels (a finger means one bottle), so the width follows the spacing.
   * The height is 49 dp so that at the smallest `uiScale` (0.9: a small phone) it is still 44 css px (S31). To drink, a touch screen has a second way: the chip, which is 64 dp across.
   */
  vial: { w: HUD_PX.bottle.w * HUD_DP_PER_PX, h: HUD_PX.bottle.h * HUD_DP_PER_PX, pitch: HUD_PX.bottle.pitch * HUD_DP_PER_PX, hitH: 49 },
} as const;

export interface HudLayout {
  /** `uiScale` of the window times the size the player chose: the HUD is drawn at `HUD_DESIGN` × this. */
  scale: number;
  /** Top-left corner of the HUD in px (the safe area plus the margin). */
  x: number;
  y: number;
  /** Size of the block in dp (before scaling). */
  width: number;
  height: number;
}

/** Width and height of the whole HUD block in dp. The artist's row of bottles has three; a fourth (the reward) goes on in the same row, inside the block. */
export function hudBlockSize(): { width: number; height: number } {
  return { width: HUD_DESIGN.block.w, height: HUD_DESIGN.block.h };
}

/**
 * Where the HUD goes: the top-left corner, inside the safe area (a notch, the Dynamic Island, rounded corners) plus the margin, at the `uiScale` of the window times the player's size preference. Nothing is positioned
 * in absolute px: the same function serves a 4:3 tablet, a 16:9 monitor, a 19.5:9 phone and a 21:9 ultra-wide.
 */
export function computeHudLayout(width: number, height: number, insets: Readonly<Insets> = NO_INSETS, sizePreference = 1): HudLayout {
  const scale = uiScale(width, height) * sizePreference;
  const block = hudBlockSize();
  return {
    scale,
    x: insets.left + HUD_DESIGN.margin * scale,
    y: insets.top + HUD_DESIGN.margin * scale,
    width: block.width,
    height: block.height,
  };
}

/**
 * Where the HUD ends on the screen (px): the lowest edge of the block or of the touch areas of the bottles, which are taller than the bottles and hang a little below the picture of the block. Whatever is put under
 * the HUD goes below this, so that it never covers a finger's target.
 */
export function hudBottom(layout: Readonly<HudLayout>): number {
  const hit = HUD_DESIGN.vial.hitH / HUD_DP_PER_PX; // the touch area, in pixels of the canvas
  const reach = (HUD_PX.bottle.y - HUD_PX.block.y + (HUD_PX.bottle.h + hit) / 2) * HUD_DP_PER_PX; // its lower edge, dp from the top of the block
  return layout.y + Math.max(layout.height, reach) * layout.scale;
}
