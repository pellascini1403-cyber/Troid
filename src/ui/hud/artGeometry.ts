/**
 * WHERE EVERYTHING IS IN THE ARTIST'S HUD (docs/PROMPT17-LOG.md). The two PNGs the artist delivered are 2560 × 1440 canvases with the portrait, the two plates, the two bars and the bottles drawn on them; the pieces
 * in `png/` are rectangles of those canvases, pixel for pixel (`tools/hud/pieces.ts` cuts them, `tests/unit/ui/hudArt.test.ts` holds them to the originals). This module holds where each piece was, in the pixels of the
 * canvas — which is where it goes in the HUD, so that the HUD is the artist's composition and not a layout made up from it — and how big the whole thing is on a screen.
 *
 * It has no image in it (the pictures are `art.ts`'s) so that the layout and the tests can use the numbers without the pictures.
 */
export interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The pieces, in the pixels of the 2560 × 1440 canvases of the artist. (`tools/hud/pieces.ts` has the same numbers; a test holds the two together.) */
export const HUD_PX = {
  /** The box of everything that is drawn: from the top left of the hexagon to the tip of the bars on the right and the bottom of the hexagon. The HUD is this box. */
  block: { x: 10, y: 258, w: 2524, h: 912 },
  portrait: { x: 10, y: 258, w: 890, h: 912 },
  plateLife: { x: 911, y: 500, w: 310, h: 172 },
  plateMagic: { x: 911, y: 768, w: 310, h: 172 },
  barLife: { x: 1253, y: 500, w: 1281, h: 172 },
  barMagic: { x: 1253, y: 767, w: 1281, h: 173 },
  /** The first bottle (the others are 229 px apart; a fourth, the reward, goes where the artist's row would have it). */
  bottle: { x: 1253, y: 1031, w: 195, h: 135, pitch: 229 },
  /** The white rectangle of the wear: as wide and as tall as the artist drew it, which is `overhang` px more than the bar above and below. */
  marker: { w: 50, h: 186, overhang: 7 },
} as const;

/**
 * How far the left edge of the white rectangle travels along a bar, in pixels of the canvas: from the left end (an empty bar) to where it is just before the bar is full, which is where it fades out. The artist drew two
 * states, 75 of life and 50 of magic, with the rectangle at 904 and 609 px from the left end of the bar; 904 ÷ 0.75 and 609 ÷ 0.5 are 1205 and 1218, and 1210 puts both within 4 px of where the artist put them (a third of a
 * pixel of the screen the artist's picture of the game was made on).
 */
export const HUD_BAR_TRAVEL = 1210;

/**
 * How the number is written on a bar, in the pixels of the canvas, as the artist typed it ("100" and "75", "100" and "50"): its left from the left end of the bar, the height of its digits, and the little hard shadow
 * under it, in the dark of the bar it is on. The colours are the ones in the artist's pixels (the test reads them there).
 */
export const HUD_NUMBER = {
  left: 40,
  digitHeight: 95,
  shadow: 3,
  color: '#ffffff',
  shadowLife: 'rgb(78, 17, 17)',
  shadowMagic: 'rgb(26, 68, 77)',
} as const;

/**
 * How big the artist's canvas is on a screen: dp per pixel of the canvas. Measured on the artist's own picture of the HUD in the game (an 844 × 390 phone, `uiScale` 819/844: the hexagon is 74.7 × 76.6 px there, so
 * 0.08395 px per pixel of the canvas, which is 0.0865 dp), the same way the three touch buttons were (docs/PROMPT15-LOG.md). With it the HUD block is 218.3 × 78.9 dp.
 */
export const HUD_DP_PER_PX = 0.0865;

/** The HUD block in dp (before it is scaled by `uiScale` and by the size the player chose). */
export const HUD_BLOCK_DP = { w: HUD_PX.block.w * HUD_DP_PER_PX, h: HUD_PX.block.h * HUD_DP_PER_PX } as const;
