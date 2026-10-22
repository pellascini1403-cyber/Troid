import type { RgbaImage } from '../assets/png';

/**
 * THE PIECES OF THE HUD (docs/PROMPT17-LOG.md): the two PNGs the artist delivered — the whole HUD with everything at the maximum, and the same HUD worn down (75 of life, 50 of magic, two bottles) — are 2560 × 1440
 * canvases with the portrait, the two plates, the two bars and the bottles on them. The game cannot show a canvas: the bars must move, the numbers must be real and each bottle must change by itself. So each THING in
 * them is cut out as a file of its own, and this module is the one place where that is done: every piece is a rectangle of one of the two originals, pixel for pixel, with two exceptions that are written down here and
 * checked by `tests/unit/ui/hudArt.test.ts`:
 *
 * - the two BARS have the number typed on them ("100"): the number is the game's, written every frame, so the digits are taken off the bar. What was under them is the bar's own flat colour (a bar is one flat colour from end
 *   to end: the test says it), so each row of the box of the digits is filled with the colour its neighbour to the right has. Nothing else of the bar changes.
 * - the LOST part of each bar (the dark one) exists in the worn original only where the fill does not cover it: from the white marker to the tip. Left of it the bar is the same flat dark from end to end, so it is
 *   continued with copies of the flat dark columns beside it (every pixel of the piece is a pixel of the worn file; the test proves the continued columns are the bar's own colour). The rounded end of the bar
 *   (46 px) is part of what is continued, and it is square in the lost piece: it is never seen, because the white marker is a rectangle taller than the bar and the dark is only shown to the right of where it starts.
 *
 * Nothing is scaled, recoloured, redrawn or filtered. Both the tool that writes the files (`tools/hud/cli.ts`) and the test that holds them to the originals call `cutPieces`.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CANVAS = { w: 2560, h: 1440 } as const;

/**
 * Where everything is in the originals (pixels of the 2560 × 1440 files): the box of everything that is not clear for each thing. The test holds every box to the pixels — it is the tightest box of its thing —
 * and holds the union of them to be everything that is not clear in both files: nothing is left out.
 */
export const BOXES = {
  /** The hexagon (half see-through white) with the head, the antennae and the bow. The same in both files. */
  portrait: { x: 10, y: 258, w: 890, h: 912 },
  /** The plates of the two bars (half see-through white) with the heart and the bolt in them. The same in both files. */
  plateLife: { x: 911, y: 500, w: 310, h: 172 },
  plateMagic: { x: 911, y: 768, w: 310, h: 172 },
  /** The two bars, from the rounded end to the tip of the arrow. */
  barLife: { x: 1253, y: 500, w: 1281, h: 172 },
  barMagic: { x: 1253, y: 767, w: 1281, h: 173 },
  /** The three bottles of the first file (identical pictures, 229 px apart); the third of the worn file is the bottle that was drunk. */
  bottles: [
    { x: 1253, y: 1031, w: 195, h: 135 },
    { x: 1482, y: 1031, w: 195, h: 135 },
    { x: 1711, y: 1031, w: 195, h: 135 },
  ],
  /** The white rectangle of the wear in the life bar of the worn file: it is taller than the bar (7 px above and below) and nothing but white. */
  marker: { x: 2157, y: 493, w: 50, h: 186 },
} as const satisfies Record<string, Box | readonly Box[]>;

/** The box of the number inside a bar, in the pixels of the bar (the digits and their shadow, with a margin of 6 px: the tests hold it to the pixels of both originals). */
export const DIGITS = {
  life: { x: 33, y: 32, w: 217, h: 111 },
  magic: { x: 33, y: 31, w: 217, h: 111 },
} as const satisfies Record<string, Box>;

/** One file of the HUD: its name, the picture, where it comes from and what, if anything, was done to it besides cutting it out. */
export interface Piece {
  /** The file name without its extension. */
  name: string;
  image: RgbaImage;
  /** Which original it was cut from and where. */
  from: { file: 'complete' | 'worn'; box: Box };
  /** What was done besides the cut (empty: nothing). */
  note: string;
}

const px = (img: RgbaImage, x: number, y: number): number => (y * img.width + x) * 4;

export function crop(img: RgbaImage, b: Box): RgbaImage {
  if (b.x < 0 || b.y < 0 || b.x + b.w > img.width || b.y + b.h > img.height) throw new Error(`the box ${JSON.stringify(b)} is outside the ${img.width} × ${img.height} picture`);
  const data = new Uint8Array(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) data.set(img.data.subarray(px(img, b.x, b.y + y), px(img, b.x + b.w, b.y + y)), y * b.w * 4);
  return { width: b.w, height: b.h, data };
}

/** The same four bytes at `(x, y)` of both pictures? */
function sameAt(a: RgbaImage, xa: number, ya: number, b: RgbaImage, xb: number, yb: number): boolean {
  const i = px(a, xa, ya);
  const j = px(b, xb, yb);
  return a.data[i] === b.data[j] && a.data[i + 1] === b.data[j + 1] && a.data[i + 2] === b.data[j + 2] && a.data[i + 3] === b.data[j + 3];
}

/** The number typed on a bar taken off it: every row of `box` gets the colour of the pixel 8 px to the right of the box (a bar is flat there: three more pixels to its right say it). */
function withoutDigits(bar: RgbaImage, box: Box, name: string): RgbaImage {
  const out: RgbaImage = { width: bar.width, height: bar.height, data: bar.data.slice() };
  const right = box.x + box.w + 8;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (const dx of [1, 2, 3]) {
      if (!sameAt(bar, right, y, bar, right + dx, y)) throw new Error(`${name}: the bar is not flat at row ${y} to the right of the number: nothing to take the digits off with`);
    }
    const from = px(bar, right, y);
    for (let x = box.x; x < box.x + box.w; x++) out.data.set(bar.data.subarray(from, from + 4), px(out, x, y));
  }
  return out;
}

/** The first column (counting from the left of the bar) from which the worn bar is the dark of the lost part in the middle row, for at least 40 columns running. */
export function lostStart(worn: RgbaImage, name: string): number {
  const mid = worn.height >> 1;
  const dark = (x: number): boolean => worn.data[px(worn, x, mid) + 3] === 255 && sameAt(worn, x, mid, worn, worn.width - 130, mid);
  for (let x = 0; x < worn.width - 170; x++) if (Array.from({ length: 40 }, (_, k) => dark(x + k)).every(Boolean)) return x;
  throw new Error(`${name}: no dark of the lost part found in the worn file`);
}

/**
 * The lost part of a bar: the dark of the worn file from where the white marker ends to the tip, continued to the left with the flat dark beside it. A bar has one colour from end to end, so the 100 columns that
 * follow the first 40 dark ones are the same in every row but the first and the last (those two rows are the bar's edge: one of the bars has a one-pixel bump on its top edge for part of its length). The columns
 * to the left of the dark are copies of those: each one the copy whose first and last rows are nearest in transparency to the bright bar's at the same place, so that the lost part has the bar's own outline.
 * Every pixel of the result is a pixel of the worn file; none is made.
 */
function lostBar(worn: RgbaImage, bright: RgbaImage, name: string): { image: RgbaImage; start: number } {
  const start = lostStart(worn, name);
  const first = start + 40;
  const count = 100;
  const last = worn.height - 1;
  for (let k = 1; k < count; k++) for (let y = 1; y < last; y++) if (!sameAt(worn, first, y, worn, first + k, y)) throw new Error(`${name}: the dark of the lost part is not flat at column ${first + k}, row ${y}`);
  const alpha = (img: RgbaImage, x: number, y: number): number => img.data[px(img, x, y) + 3] as number;
  const out: RgbaImage = { width: worn.width, height: worn.height, data: new Uint8Array(worn.data.length) };
  for (let x = 0; x < worn.width; x++) {
    let from = x;
    if (x < start) {
      let best = Number.POSITIVE_INFINITY;
      for (let c = first; c < first + count; c++) {
        const d = Math.abs(alpha(worn, c, 0) - alpha(bright, x, 0)) + Math.abs(alpha(worn, c, last) - alpha(bright, x, last));
        if (d < best) {
          best = d;
          from = c;
        }
      }
    }
    for (let y = 0; y < worn.height; y++) out.data.set(worn.data.subarray(px(worn, from, y), px(worn, from, y) + 4), px(out, x, y));
  }
  return { image: out, start };
}

/** Every piece, cut from the two originals. Throws with the reason when an original is not what this module expects. */
export function cutPieces(complete: RgbaImage, worn: RgbaImage): Piece[] {
  for (const [name, img] of [['complete', complete], ['worn', worn]] as const) {
    if (img.width !== CANVAS.w || img.height !== CANVAS.h) throw new Error(`the ${name} original is ${img.width} × ${img.height}, not ${CANVAS.w} × ${CANVAS.h}`);
  }
  const marker = crop(worn, BOXES.marker);
  for (let i = 0; i < marker.data.length; i += 4) {
    if (marker.data[i + 3] !== 0 && (marker.data[i] !== 255 || marker.data[i + 1] !== 255 || marker.data[i + 2] !== 255)) throw new Error('the marker box holds something that is not white: it is not the rectangle of the wear alone');
  }
  const lifeWorn = crop(worn, BOXES.barLife);
  const magicWorn = crop(worn, BOXES.barMagic);
  const lifeLost = lostBar(lifeWorn, crop(complete, BOXES.barLife), 'the life bar');
  const magicLost = lostBar(magicWorn, crop(complete, BOXES.barMagic), 'the magic bar');
  const barNote = 'the number typed on the bar taken off (each row of the box of the digits gets the flat colour of the bar); nothing else changes';
  const lostNote = (start: number): string => `the dark of the worn file from column ${start} (where the white marker ends) to the tip; columns 0–${start - 1} are copies of the flat dark columns beside it`;
  return [
    { name: 'portrait', image: crop(complete, BOXES.portrait), from: { file: 'complete', box: BOXES.portrait }, note: '' },
    { name: 'plate-life', image: crop(complete, BOXES.plateLife), from: { file: 'complete', box: BOXES.plateLife }, note: '' },
    { name: 'plate-magic', image: crop(complete, BOXES.plateMagic), from: { file: 'complete', box: BOXES.plateMagic }, note: '' },
    { name: 'bar-life', image: withoutDigits(crop(complete, BOXES.barLife), DIGITS.life, 'the life bar'), from: { file: 'complete', box: BOXES.barLife }, note: barNote },
    { name: 'bar-life-lost', image: lifeLost.image, from: { file: 'worn', box: BOXES.barLife }, note: lostNote(lifeLost.start) },
    { name: 'bar-magic', image: withoutDigits(crop(complete, BOXES.barMagic), DIGITS.magic, 'the magic bar'), from: { file: 'complete', box: BOXES.barMagic }, note: barNote },
    { name: 'bar-magic-lost', image: magicLost.image, from: { file: 'worn', box: BOXES.barMagic }, note: lostNote(magicLost.start) },
    { name: 'marker', image: marker, from: { file: 'worn', box: BOXES.marker }, note: '' },
    { name: 'bottle', image: crop(complete, BOXES.bottles[0]), from: { file: 'complete', box: BOXES.bottles[0] }, note: '' },
    { name: 'bottle-used', image: crop(worn, BOXES.bottles[2]), from: { file: 'worn', box: BOXES.bottles[2] }, note: '' },
  ];
}
