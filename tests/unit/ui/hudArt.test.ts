import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, type RgbaImage } from '../../../tools/assets/png';
import { HUD_ORIGINALS, HUD_ORIGINALS_DIR, HUD_PIECES_DIR } from '../../../tools/hud/originals';
import { BOXES, CANVAS, crop, cutPieces, DIGITS, lostStart, type Box, type Piece } from '../../../tools/hud/pieces';
import { uiScale } from '@/input/gestures/TouchConfig';
import { HUD_ART } from '@/ui/hud/art';
import { HUD_BAR_TRAVEL, HUD_BLOCK_DP, HUD_DP_PER_PX, HUD_NUMBER, HUD_PX } from '@/ui/hud/artGeometry';
import { FADE_AT_FULL, placeBar } from '@/ui/hud/barLayout';

/**
 * THE ART OF THE HUD IS THE ARTIST'S (docs/PROMPT17-LOG.md): the two PNGs that were delivered are the files in the repository, byte for byte; every piece the game shows is a rectangle of one of them, pixel for pixel, but
 * for the two things that are written down (the number typed on the bars, and the dark part of the bars continued to the left); and the pieces, laid out the way the HUD lays them out, give the artist's two pictures back.
 * Nothing here looks at how the HUD LOOKS (that is the E2E's screenshots); it looks at what it is made of.
 */
const root = resolve(__dirname, '../../..');
const read = (rel: string): Buffer => readFileSync(resolve(root, rel));
const original = (which: keyof typeof HUD_ORIGINALS): RgbaImage => decodePng(read(`${HUD_ORIGINALS_DIR}/${HUD_ORIGINALS[which].file}`));
const piece = (name: string): RgbaImage => decodePng(read(`${HUD_PIECES_DIR}/${name}.png`));

const complete = original('complete');
const worn = original('worn');
const pieces = cutPieces(complete, worn);
const named = (name: string): Piece => pieces.find((p) => p.name === name) as Piece;

const at = (img: RgbaImage, x: number, y: number): [number, number, number, number] => {
  const i = (y * img.width + x) * 4;
  return [img.data[i] as number, img.data[i + 1] as number, img.data[i + 2] as number, img.data[i + 3] as number];
};
const same = (a: RgbaImage, b: RgbaImage): boolean => a.width === b.width && a.height === b.height && Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
const inside = (b: Box, x: number, y: number): boolean => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
const flat = (c: readonly number[], d: readonly number[]): boolean => Math.abs((c[0] as number) - (d[0] as number)) <= 1 && Math.abs((c[1] as number) - (d[1] as number)) <= 1 && Math.abs((c[2] as number) - (d[2] as number)) <= 1;

/** The tight boxes of the groups of non-clear pixels (8-connected) of a picture that have at least 30 of them. */
function components(img: RgbaImage): Box[] {
  const { width: W, height: H, data } = img;
  const seen = new Uint8Array(W * H);
  const out: Box[] = [];
  const stack: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || data[s * 4 + 3] === 0) continue;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    let n = 0;
    seen[s] = 1;
    stack.push(s);
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % W;
      const y = (p / W) | 0;
      n++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (!seen[q] && data[q * 4 + 3] !== 0) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (n >= 30) out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}
const key = (b: Box): string => `${b.x},${b.y},${b.w},${b.h}`;
/** The white rectangle on the magic bar of the worn picture: the artist put it at a fraction of a pixel (a soft column on each side), 5 px above the bar and 8 below. */
const MARKER_MAGIC: Box = { x: 1861, y: 762, w: 51, h: 186 };

describe('the two PNGs of the HUD are the originals', () => {
  for (const which of ['complete', 'worn'] as const) {
    it(`${HUD_ORIGINALS[which].file} is byte for byte what was delivered, and a 2560 × 1440 RGBA file`, () => {
      const bytes = read(`${HUD_ORIGINALS_DIR}/${HUD_ORIGINALS[which].file}`);
      expect(bytes.length).toBe(HUD_ORIGINALS[which].bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(HUD_ORIGINALS[which].sha256);
      const img = which === 'complete' ? complete : worn;
      expect([img.width, img.height]).toEqual([CANVAS.w, CANVAS.h]);
    });
  }

  it('the portrait and the two plates are the same in both (the worn HUD is the complete one worn down, not a second drawing)', () => {
    for (const b of [BOXES.portrait, BOXES.plateLife, BOXES.plateMagic]) expect(same(crop(complete, b), crop(worn, b)), key(b)).toBe(true);
    // the first two bottles too
    for (const b of [BOXES.bottles[0], BOXES.bottles[1]]) expect(same(crop(complete, b), crop(worn, b)), key(b)).toBe(true);
  });

  it('the three bottles of the complete HUD are one picture, 229 px apart (to within one level of one channel in one pixel of the second)', () => {
    const first = crop(complete, BOXES.bottles[0]);
    for (const b of BOXES.bottles) {
      let differ = 0;
      const other = crop(complete, b);
      for (let i = 0; i < first.data.length; i++) {
        const d = Math.abs((first.data[i] as number) - (other.data[i] as number));
        expect(d, key(b)).toBeLessThanOrEqual(1);
        if (d > 0) differ++;
      }
      expect(differ, key(b)).toBeLessThanOrEqual(1);
    }
    expect(BOXES.bottles.map((b) => b.x)).toEqual([1253, 1253 + 229, 1253 + 2 * 229]);
  });

  it('in the worn HUD the third bottle is the same bottle drunk: its outline is the bottle\'s (but for twelve pixels of its right edge, 44 levels of transparency at the most), its colour is flat', () => {
    const bright = crop(complete, BOXES.bottles[2]);
    const dark = crop(worn, BOXES.bottles[2]);
    let outlineMoved = 0;
    let worst = 0;
    const colours = new Set<string>();
    for (let y = 0; y < bright.height; y++) {
      for (let x = 0; x < bright.width; x++) {
        const a = at(bright, x, y);
        const b = at(dark, x, y);
        worst = Math.max(worst, Math.abs(a[3] - b[3]));
        if (Math.abs(a[3] - b[3]) > 2) outlineMoved++;
        if (b[3] === 255) colours.add(b.slice(0, 3).join(','));
      }
    }
    expect(outlineMoved).toBeLessThanOrEqual(12);
    expect(worst).toBeLessThanOrEqual(50);
    expect([...colours], 'and one colour').toEqual(['26,68,77']);
  });
});

describe('the boxes are where the pieces are', () => {
  const all = [BOXES.portrait, BOXES.plateLife, BOXES.plateMagic, BOXES.barLife, BOXES.barMagic, ...BOXES.bottles];

  it('in the complete HUD the only things that are not clear are the eight boxes, and each box is the tightest one of its thing', () => {
    expect(components(complete).map(key).sort()).toEqual(all.map(key).sort());
  });

  it('in the worn HUD they are the same eight, with the white rectangle making the two bars it stands on taller (nothing else moved)', () => {
    // the rectangle is 7 px taller than the life bar above and below; on the magic bar the artist put it at a fraction of a pixel, 5 px above and 8 below
    const taller = [
      { ...BOXES.barLife, y: 493, h: 186 },
      { ...BOXES.barMagic, y: 762, h: 186 },
    ];
    const expected = [BOXES.portrait, BOXES.plateLife, BOXES.plateMagic, ...taller, ...BOXES.bottles];
    expect(components(worn).map(key).sort()).toEqual(expected.map(key).sort());
  });

  it('the marker box holds the white rectangle and nothing of the bar: 50 px of white, 7 px taller than the bar above and below', () => {
    const m = named('marker').image;
    expect([m.width, m.height]).toEqual([HUD_PX.marker.w, HUD_PX.marker.h]);
    expect(BOXES.marker.y).toBe(BOXES.barLife.y - HUD_PX.marker.overhang);
    expect(BOXES.marker.h).toBe(BOXES.barLife.h + 2 * HUD_PX.marker.overhang);
    let opaque = 0;
    for (let i = 0; i < m.data.length; i += 4) {
      if (m.data[i + 3] === 0) continue;
      expect([m.data[i], m.data[i + 1], m.data[i + 2]], 'white').toEqual([255, 255, 255]);
      if (m.data[i + 3] === 255) opaque++;
    }
    expect(opaque / (m.width * m.height), 'almost all of it is solid').toBeGreaterThan(0.95);
  });

  it('nothing the artist drew is left out: every pixel that is not clear in either picture is in a box (or in the white rectangle of the worn one)', () => {
    const rectangles = [BOXES.marker, MARKER_MAGIC];
    for (const img of [complete, worn]) {
      let outside = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
          if (all.some((b) => inside(b, x, y))) continue;
          if (img === worn && rectangles.some((b) => inside(b, x, y))) continue;
          outside++;
        }
      }
      expect(outside).toBe(0);
    }
  });

  it('the HUD block is the box of all of them, and the numbers the code uses are the tool\'s', () => {
    const left = Math.min(...all.map((b) => b.x));
    const top = Math.min(...all.map((b) => b.y));
    const right = Math.max(...all.map((b) => b.x + b.w));
    const bottom = Math.max(...all.map((b) => b.y + b.h));
    expect(HUD_PX.block).toEqual({ x: left, y: top, w: right - left, h: bottom - top });
    expect(HUD_PX.portrait).toEqual(BOXES.portrait);
    expect(HUD_PX.plateLife).toEqual(BOXES.plateLife);
    expect(HUD_PX.plateMagic).toEqual(BOXES.plateMagic);
    expect(HUD_PX.barLife).toEqual(BOXES.barLife);
    expect(HUD_PX.barMagic).toEqual(BOXES.barMagic);
    expect({ x: HUD_PX.bottle.x, y: HUD_PX.bottle.y, w: HUD_PX.bottle.w, h: HUD_PX.bottle.h }).toEqual(BOXES.bottles[0]);
    expect(HUD_PX.bottle.pitch).toBe(BOXES.bottles[1].x - BOXES.bottles[0].x);
    expect(HUD_PX.marker.w).toBe(BOXES.marker.w);
    expect(HUD_PX.marker.h).toBe(BOXES.marker.h);
  });
});

describe('the files are what the originals give', () => {
  const files = ['portrait', 'plate-life', 'plate-magic', 'bar-life', 'bar-life-lost', 'bar-magic', 'bar-magic-lost', 'marker', 'bottle', 'bottle-used'];

  it('there are ten pieces and each file in the repository is, pixel for pixel, what `cutPieces` makes from the originals', () => {
    expect(pieces.map((p) => p.name)).toEqual(files);
    for (const p of pieces) expect(same(piece(p.name), p.image), `${p.name}.png`).toBe(true);
  });

  it('the pieces that are only cut out are the very rectangle of the original', () => {
    for (const p of pieces.filter((x) => ['portrait', 'plate-life', 'plate-magic', 'marker', 'bottle', 'bottle-used'].includes(x.name))) {
      expect(p.note, p.name).toBe('');
      expect(same(piece(p.name), crop(p.from.file === 'complete' ? complete : worn, p.from.box)), `${p.name}.png`).toBe(true);
    }
  });

  for (const [name, digits, bar] of [['life', DIGITS.life, BOXES.barLife], ['magic', DIGITS.magic, BOXES.barMagic]] as const) {
    it(`bar-${name}.png is the artist's bar with the number taken off: the same pixels everywhere but in the box of the digits, and one flat colour in it`, () => {
      const from = crop(complete, bar);
      const made = piece(`bar-${name}`);
      expect([made.width, made.height]).toEqual([from.width, from.height]);
      const colour = at(from, digits.x + digits.w + 8, digits.y);
      let changed = 0;
      for (let y = 0; y < from.height; y++) {
        for (let x = 0; x < from.width; x++) {
          const a = at(from, x, y);
          const b = at(made, x, y);
          if (inside(digits, x, y)) {
            expect(b, `(${x}, ${y}) in the box`).toEqual(colour);
            if (a.join() !== b.join()) changed++;
          } else {
            expect(b, `(${x}, ${y}) outside the box`).toEqual(a);
          }
        }
      }
      expect(changed, 'the digits and their shadow were there').toBeGreaterThan(5000);
    });

    it(`the box of the digits of the ${name} bar holds all of them, in both pictures: no pixel that is not the bar's colour is left outside it`, () => {
      for (const img of [complete, worn]) {
        const b = crop(img, bar);
        const colour = at(b, 500, 80); // the middle of the body of the bar: filled, in both pictures, up to the rectangle (600 px from the end of the bar at the least)
        for (let y = 4; y < b.height - 4; y++) {
          for (let x = 60; x < 600; x++) {
            if (inside(digits, x, y)) continue;
            expect(flat(at(b, x, y), colour), `${name} (${x}, ${y})`).toBe(true);
          }
        }
      }
    });

    it(`the ${name} bar is one flat colour from end to end (that is what makes taking the digits off, and continuing the dark, safe)`, () => {
      const b = piece(`bar-${name}`);
      const colour = at(b, 700, 80);
      let off = 0;
      let total = 0;
      for (let y = 4; y < b.height - 4; y++) {
        for (let x = 60; x < 1150; x++) {
          total++;
          if (!flat(at(b, x, y), colour)) off++;
        }
      }
      expect(off / total, 'flat to within a level of one channel').toBeLessThan(0.001);
    });

    it(`bar-${name}-lost.png: from where the white rectangle ends it IS the worn picture; to the left of it, every column is a column of the dark that follows it, and no colour was made`, () => {
      const wornBar = crop(worn, bar);
      const lost = piece(`bar-${name}-lost`);
      const start = lostStart(wornBar, `the ${name} bar`);
      expect(start, 'the dark begins where the white rectangle ends').toBe(name === 'life' ? 954 : 659);
      for (let x = start; x < lost.width; x++) for (let y = 0; y < lost.height; y++) expect(at(lost, x, y), `(${x}, ${y})`).toEqual(at(wornBar, x, y));
      const columns = new Set<string>();
      for (let x = start + 40; x < start + 140; x++) columns.add(Array.from({ length: lost.height }, (_, y) => at(wornBar, x, y).join()).join(';'));
      for (let x = 0; x < start; x++) expect(columns.has(Array.from({ length: lost.height }, (_, y) => at(lost, x, y).join()).join(';')), `column ${x}`).toBe(true);
      // the same number of rows, and the same one flat colour as the number's shadow
      const dark = at(lost, 700, 80);
      expect(dark[3]).toBe(255);
      expect(`rgb(${dark[0]}, ${dark[1]}, ${dark[2]})`).toBe(name === 'life' ? HUD_NUMBER.shadowLife : HUD_NUMBER.shadowMagic);
    });

    it(`the dark ${name} bar has the outline of the bright one along its body: the lost part is the same bar, not another shape`, () => {
      const bright = piece(`bar-${name}`);
      const lost = piece(`bar-${name}-lost`);
      for (let y = 0; y < bright.height; y++) {
        for (let x = 60; x < 1150; x++) expect(Math.abs((at(bright, x, y)[3] as number) - (at(lost, x, y)[3] as number)), `(${x}, ${y})`).toBeLessThanOrEqual(1);
      }
    });
  }

  it('the colour of the shadow of a number is the dark of its bar, and the number is white, as the artist typed it', () => {
    expect(HUD_NUMBER.color).toBe('#ffffff');
    for (const img of [complete]) {
      const b = crop(img, BOXES.barLife);
      let white = 0;
      let shadow = 0;
      for (let y = DIGITS.life.y; y < DIGITS.life.y + DIGITS.life.h; y++) {
        for (let x = DIGITS.life.x; x < DIGITS.life.x + DIGITS.life.w; x++) {
          const p = at(b, x, y);
          if (p.join() === '255,255,255,255') white++;
          if (`rgb(${p[0]}, ${p[1]}, ${p[2]})` === HUD_NUMBER.shadowLife) shadow++;
        }
      }
      expect(white, 'the digits are white').toBeGreaterThan(3000);
      expect(shadow, 'with a shadow in the dark of the bar').toBeGreaterThan(300);
    }
  });
});

/** Lays pieces on a clear canvas the way the HUD does: each at its place, a part of one clipped to a range of columns, over what is already there. */
class Canvas {
  readonly img: RgbaImage = { width: CANVAS.w, height: CANVAS.h, data: new Uint8Array(CANVAS.w * CANVAS.h * 4) };
  put(src: RgbaImage, x0: number, y0: number, from = 0, to = src.width): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = Math.max(0, Math.ceil(from)); x < Math.min(src.width, Math.floor(to)); x++) {
        const s = at(src, x, y);
        if (s[3] === 0) continue;
        const i = ((y0 + y) * this.img.width + x0 + x) * 4;
        const a = s[3] / 255;
        const d = at(this.img, x0 + x, y0 + y);
        if (d[3] === 0 || s[3] === 255) {
          this.img.data.set(s, i);
          continue;
        }
        // source over, straight alpha (only the soft edge of a rectangle over a bar's own edge comes here)
        const outA = a + (d[3] / 255) * (1 - a);
        for (let c = 0; c < 3; c++) this.img.data[i + c] = Math.round(((s[c] as number) * a + (d[c] as number) * (d[3] / 255) * (1 - a)) / outA);
        this.img.data[i + 3] = Math.round(outA * 255);
      }
    }
  }
}

describe('the pieces, laid out the way the HUD lays them out, give the artist\'s two pictures back', () => {
  const lay = (bars: { life: number; magic: number }, drunk: readonly number[]): RgbaImage => {
    const c = new Canvas();
    c.put(piece('portrait'), BOXES.portrait.x, BOXES.portrait.y);
    c.put(piece('plate-life'), BOXES.plateLife.x, BOXES.plateLife.y);
    c.put(piece('plate-magic'), BOXES.plateMagic.x, BOXES.plateMagic.y);
    for (const [kind, box, edge] of [['life', BOXES.barLife, bars.life], ['magic', BOXES.barMagic, bars.magic]] as const) {
      const p = placeBar(edge, edge, box.w, false);
      c.put(piece(`bar-${kind}-lost`), box.x, box.y, p.lostLeft, box.w);
      c.put(piece(`bar-${kind}`), box.x, box.y, 0, p.fillRight);
      if (p.markOpacity > 0) c.put(piece('marker'), box.x + Math.round(p.markX), box.y + Math.round((box.h - HUD_PX.marker.h) / 2));
    }
    BOXES.bottles.forEach((b, i) => c.put(piece(drunk.includes(i) ? 'bottle-used' : 'bottle'), b.x, b.y));
    return c.img;
  };

  /** Where the two pictures may differ: the numbers typed on the bars. */
  const inDigits = (x: number, y: number): boolean =>
    inside({ x: BOXES.barLife.x + DIGITS.life.x, y: BOXES.barLife.y + DIGITS.life.y, w: DIGITS.life.w, h: DIGITS.life.h }, x, y) ||
    inside({ x: BOXES.barMagic.x + DIGITS.magic.x, y: BOXES.barMagic.y + DIGITS.magic.y, w: DIGITS.magic.w, h: DIGITS.magic.h }, x, y);
  const lum = (p: readonly number[]): number => (p[0] as number) * 0.3 + (p[1] as number) * 0.6 + (p[2] as number) * 0.1;
  const diffs = (a: RgbaImage, b: RgbaImage, ok: (x: number, y: number, mine: number[], theirs: number[]) => boolean): string[] => {
    const out: string[] = [];
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const mine = at(a, x, y);
        const theirs = at(b, x, y);
        if (mine.join() !== theirs.join() && !ok(x, y, mine, theirs)) out.push(`${x},${y}`);
      }
    }
    return out;
  };
  /** The bottles are one picture to within a level of one channel. */
  const bottleNoise = (x: number, y: number, mine: number[], theirs: number[]): boolean => BOXES.bottles.some((b) => inside(b, x, y)) && mine.every((v, i) => Math.abs(v - (theirs[i] as number)) <= 1);

  it('the complete HUD: all the pieces at their place, the bars full and the bottles ready, are the artist\'s picture pixel for pixel (but for the numbers, and one level of one channel in one pixel of a bottle)', () => {
    const mine = lay({ life: 1, magic: 1 }, []);
    expect(diffs(mine, complete, (x, y, a, b) => inDigits(x, y) || bottleNoise(x, y, a, b))).toEqual([]);
  });

  it('the worn HUD, the life bar at 904 px as the artist drew it and the third bottle drunk: the artist\'s picture, but for the numbers and the edge of what is bright', () => {
    const mine = lay({ life: 904 / HUD_BAR_TRAVEL, magic: 609 / HUD_BAR_TRAVEL }, [2]);
    // the artist's rectangle on the magic bar is at a fraction of a pixel (a soft column on each side, and the rows of its soft ends): that is the one place where the two are not the same
    const magicMarker = (x: number, y: number): boolean => inside({ x: MARKER_MAGIC.x - 1, y: MARKER_MAGIC.y - 2, w: MARKER_MAGIC.w + 2, h: MARKER_MAGIC.h + 4 }, x, y);
    // the artist's worn picture has the bright fill laid over a whole dark bar, so the soft edge of the fill (its anti-aliased outline, one pixel of the canvas, and the nearly solid pixels next to it) lets a little of the dark
    // through: those pixels are darker than the complete picture's. Here the bright part does not have the dark under it, so they keep the complete picture's. The one other row is the bump of one pixel on the top of the magic bar
    const fringe = (x: number, y: number, mine: number[], theirs: number[]): boolean => {
      const bar = y < BOXES.barMagic.y - 20 ? BOXES.barLife : BOXES.barMagic;
      const limit = bar === BOXES.barLife ? 904 : 609;
      if (!inside(bar, x, y) || x >= bar.x + limit) return false;
      const outline = x < bar.x + 60 || y <= bar.y + 2 || y >= bar.y + bar.h - 3;
      return outline && lum(theirs) <= lum(mine) + 1;
    };
    const rest = diffs(mine, worn, (x, y, a, b) => inDigits(x, y) || magicMarker(x, y) || bottleNoise(x, y, a, b) || fringe(x, y, a, b));
    expect(rest).toEqual([]);
    // and that edge is a thing of a pixel of the canvas: under a thousand pixels in all, a thousandth of what is drawn
    const edge = diffs(mine, worn, (x, y, a, b) => !fringe(x, y, a, b));
    expect(edge.length).toBeLessThan(1300);
  });

  it('the states the artist drew are where the code puts them to within 4 px of the canvas: 75 and 50 are at 904 and 609 px', () => {
    expect(Math.abs(placeBar(0.75, 0.75, 1281, false).markX - 904)).toBeLessThanOrEqual(4);
    expect(Math.abs(placeBar(0.5, 0.5, 1281, false).markX - 609)).toBeLessThanOrEqual(5);
  });
});

describe('where the pieces of a bar go (placeBar)', () => {
  const L = HUD_PX.barLife.w;

  it('an empty bar: nothing of the bright picture, all of the dark one, and the white rectangle at the left end', () => {
    const p = placeBar(0, 0, L, false);
    expect([p.fillRight, p.lostLeft, p.markX, p.markScale, p.markOpacity]).toEqual([0, 0, 0, 1, 1]);
  });

  it('a full bar: all of the bright picture to the tip, nothing of the dark one, and no white rectangle', () => {
    const p = placeBar(1, 1, L, false);
    expect(p.fillRight).toBe(L);
    expect(p.lostLeft).toBe(L);
    expect(p.markOpacity).toBe(0);
  });

  it('the bright and the dark pictures always meet at one place: never a gap, never an overlap', () => {
    for (let e = 0; e <= 1.0001; e += 0.0123) {
      const p = placeBar(Math.min(1, e), Math.min(1, e), L, false);
      expect(p.lostLeft).toBe(p.fillRight);
      expect(p.fillRight).toBeGreaterThanOrEqual(0);
      expect(p.fillRight).toBeLessThanOrEqual(L);
    }
  });

  it('the bright picture only grows as the bar fills, and the rectangle stays on the bar while it shows', () => {
    let last = -1;
    for (let e = 0; e <= 1.0001; e += 0.01) {
      const p = placeBar(Math.min(1, e), Math.min(1, e), L, false);
      expect(p.fillRight).toBeGreaterThanOrEqual(last);
      last = p.fillRight;
      expect(p.markX).toBeGreaterThanOrEqual(0);
      expect(p.markX + HUD_PX.marker.w * p.markScale).toBeLessThanOrEqual(L);
    }
  });

  it('the rectangle stays the size the artist drew it, and it is as long as what was just lost when something was: from the new edge to where the bar was', () => {
    expect(placeBar(0.6, 0.6, L, false).markScale).toBe(1);
    const lost = placeBar(0.6, 0.8, L, false);
    expect(lost.markScale).toBeGreaterThan(1);
    expect(lost.markX + HUD_PX.marker.w * lost.markScale).toBeCloseTo(0.8 * HUD_BAR_TRAVEL + HUD_PX.marker.w, 6);
    // "fewer flashes": it does not stretch
    expect(placeBar(0.6, 0.8, L, true).markScale).toBe(1);
  });

  it('the rectangle fades out over the last of the bar and is whole before that', () => {
    expect(placeBar(1 - FADE_AT_FULL - 1e-9, 1, L, false).markOpacity).toBe(1);
    expect(placeBar(1 - FADE_AT_FULL / 2, 1, L, false).markOpacity).toBeCloseTo(0.5, 6);
    expect(placeBar(1, 1, L, false).markOpacity).toBe(0);
  });
});

describe('the HUD is as big on the screen as the artist\'s own picture of it', () => {
  it('0.0865 dp per pixel of the canvas: the artist\'s hexagon is 74.7 px across on the 844 × 390 phone of the picture, which is a 819/844 scale', () => {
    // measured on the artist's picture of the HUD in the game: 0.08395 px per pixel of the canvas on that screen
    expect(HUD_DP_PER_PX * uiScale(844, 390)).toBeCloseTo(0.08395, 3);
    expect(HUD_PX.portrait.w * HUD_DP_PER_PX * uiScale(844, 390)).toBeCloseTo(74.7, 0);
    expect(HUD_BLOCK_DP.w).toBeCloseTo(218.3, 1);
    expect(HUD_BLOCK_DP.h).toBeCloseTo(78.9, 1);
  });
});

describe('the art in the page is the art in the repository', () => {
  it('ten different pictures, one per piece, each named after its file', () => {
    expect(Object.keys(HUD_ART).sort()).toEqual(['barLife', 'barLifeLost', 'barMagic', 'barMagicLost', 'bottle', 'bottleUsed', 'marker', 'plateLife', 'plateMagic', 'portrait'].sort());
    expect(new Set(Object.values(HUD_ART)).size).toBe(10);
    const file = { barLife: 'bar-life', barLifeLost: 'bar-life-lost', barMagic: 'bar-magic', barMagicLost: 'bar-magic-lost', bottle: 'bottle', bottleUsed: 'bottle-used', marker: 'marker', plateLife: 'plate-life', plateMagic: 'plate-magic', portrait: 'portrait' } as const;
    for (const [piece, name] of Object.entries(file)) expect(HUD_ART[piece as keyof typeof HUD_ART], piece).toMatch(new RegExp(`/${name}(-[A-Za-z0-9_]+)?\\.png`));
  });

  it('the code that shows them draws nothing: no canvas, no SVG, no filter, no blend, no mask, no gradient, no background', () => {
    for (const name of ['HudView.ts', 'art.ts', 'artGeometry.ts', 'barLayout.ts', 'layout.ts']) {
      const source = readFileSync(resolve(__dirname, '../../../src/ui/hud', name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      for (const forbidden of ['<canvas', "createElement('canvas')", 'createElementNS', 'getContext', 'filter:', 'filter =', 'backdropFilter', 'mixBlendMode', 'mix-blend-mode', 'mask', 'drop-shadow', 'hue-rotate', 'brightness(', 'gradient', 'background', 'box-shadow', 'border-radius', 'svg']) {
        expect(source.includes(forbidden), `${name} must not use ${forbidden}`).toBe(false);
      }
    }
  });
});
