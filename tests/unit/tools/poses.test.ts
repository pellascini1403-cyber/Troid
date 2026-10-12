import { describe, expect, it } from 'vitest';
import type { RgbaImage } from '../../../tools/assets/png';
import { dilate, erode, extractPose, flipX, placePose } from '../../../tools/assets/poses';

/**
 * THE POSES OF A SHEET AS SPRITES (docs/ART-PIPELINE-2D.md part L): what `extractPose` does and — as important — what it never does. The sheet here is built by
 * hand: a near-white background and a figure made of a dark disc with a glowing eye, a ground shadow, a red effect and a speed line, so every claim is about pixels
 * that are known. Never art.
 */
const W = 120;
const H = 120;
type Rgb = [number, number, number];

function sheet(paint: (set: (x: number, y: number, c: Rgb) => void) => void): RgbaImage {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([254, 254, 254, 255], i * 4);
  const set = (x: number, y: number, c: Rgb): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
  };
  paint(set);
  return { width: W, height: H, data };
}

const disc = (set: (x: number, y: number, c: Rgb) => void, cx: number, cy: number, r: number, c: Rgb): void => {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, c);
};
const FIGURE: Rgb = [16, 22, 36];
const EYE: Rgb = [127, 218, 242];
const WHITE: Rgb = [255, 255, 255];
const alphaAt = (img: RgbaImage, x: number, y: number): number => img.data[(y * img.width + x) * 4 + 3]!;
const colourAt = (img: RgbaImage, x: number, y: number): Rgb => [img.data[(y * img.width + x) * 4]!, img.data[(y * img.width + x) * 4 + 1]!, img.data[(y * img.width + x) * 4 + 2]!];
const BOX = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };

describe('extractPose: the background goes, the figure stays', () => {
  const s = sheet((set) => {
    disc(set, 60, 50, 24, FIGURE); // the figure
    disc(set, 54, 46, 8, EYE); // a glowing eye…
    disc(set, 52, 44, 3, WHITE); // …with a white highlight inside it
    for (let x = 36; x <= 84; x++) for (let y = 98; y <= 102; y++) set(x, y, [150, 160, 177]); // the ground shadow, below the figure
    disc(set, 98, 20, 6, [220, 40, 50]); // a red effect, apart
    for (let y = 72; y <= 90; y++) set(100, y, [140, 170, 200]); // a speed line, apart
  });
  const r = extractPose(s, BOX);

  it('is transparent where there was only background, shadow, red energy or a speed line, and opaque in the figure, the eye and its highlight', () => {
    expect(alphaAt(r.image, 5, 5)).toBe(0);
    expect(alphaAt(r.image, 60, 100)).toBe(0); // the shadow
    expect(alphaAt(r.image, 98, 20)).toBe(0); // the red effect
    expect(alphaAt(r.image, 100, 80)).toBe(0); // the speed line
    expect(alphaAt(r.image, 60, 60)).toBe(255);
    expect(alphaAt(r.image, 60, 46)).toBe(255);
    expect(alphaAt(r.image, 52, 44)).toBe(255); // a hole the figure encloses, ringed by glowing colour, is the figure
    expect(r.stats.droppedPieces).toBeGreaterThanOrEqual(1);
  });

  it('changes not one colour inside the figure', () => {
    expect(colourAt(r.image, 60, 60)).toEqual(FIGURE);
    expect(colourAt(r.image, 60, 46)).toEqual(EYE);
    expect(colourAt(r.image, 52, 44)).toEqual(WHITE);
    for (const [x, y] of [[48, 56], [66, 40], [60, 70]] as const) expect(colourAt(r.image, x, y)).toEqual(FIGURE);
  });

  it('finds the figure and only the figure: its bounds are its disc', () => {
    const b = r.bounds!;
    expect(b.x0).toBeGreaterThanOrEqual(35);
    expect(b.x1).toBeLessThanOrEqual(85);
    expect(b.y0).toBeGreaterThanOrEqual(25);
    expect(b.y1).toBeLessThanOrEqual(75);
  });

  it('has no white fringe: the rim is the figure\'s colour at a partial alpha, never the background\'s', () => {
    // a soft rim: a ring of mixed pixels around the disc, between the figure and the white
    const soft = sheet((set) => {
      disc(set, 60, 60, 24, [133, 138, 145]); // half way to white
      disc(set, 60, 60, 22, FIGURE);
    });
    const e = extractPose(soft, BOX).image;
    let rim = 0;
    for (let y = 30; y < 90; y++) {
      for (let x = 30; x < 90; x++) {
        const a = alphaAt(e, x, y);
        if (a > 0 && a < 255) {
          rim++;
          const [cr, cg, cb] = colourAt(e, x, y);
          expect(Math.max(cr, cg, cb)).toBeLessThan(120); // dark, not grey-white
        }
      }
    }
    expect(rim).toBeGreaterThan(20);
  });
});

describe('extractPose: what is enclosed and what only looks enclosed', () => {
  it('a white gap the figure closes around (between an antenna and the head) stays transparent', () => {
    const s = sheet((set) => {
      disc(set, 60, 70, 24, FIGURE);
      // an antenna: a ring arching over a gap, touching the head at both ends
      for (let a = 0; a <= 180; a += 2) {
        const x = Math.round(60 + 20 * Math.cos((a * Math.PI) / 180));
        const y = Math.round(46 - 16 * Math.sin((a * Math.PI) / 180));
        disc(set, x, y, 2, FIGURE);
      }
    });
    const r = extractPose(s, BOX);
    expect(alphaAt(r.image, 60, 38)).toBe(0); // inside the arch, between it and the head: background, not figure
    expect(alphaAt(r.image, 60, 70)).toBe(255);
  });

  it('red that touches the figure two pixels deep stays (the glow of a blade\'s edge); red further out is the effect and goes', () => {
    const s = sheet((set) => {
      disc(set, 60, 60, 20, FIGURE);
      for (let y = 40; y <= 80; y++) {
        set(74, y, [160, 20, 30]); // red inside the figure's own edge: it is the figure's (an accent line of its armour)
        for (const x of [81, 82]) set(x, y, [150, 20, 30]); // a rim of red glow touching the figure from outside
        for (let x = 86; x <= 96; x++) set(x, y, [220, 40, 50]); // a red band well apart from it
      }
    });
    const r = extractPose(s, BOX);
    expect(alphaAt(r.image, 74, 60)).toBe(255);
    expect(colourAt(r.image, 74, 60)).toEqual([160, 20, 30]);
    expect(alphaAt(r.image, 81, 60)).toBeGreaterThan(0); // the glow that touches the figure stays with it
    expect(alphaAt(r.image, 90, 60)).toBe(0); // the effect further out does not
  });

  it('does not take the pixels of a neighbour pose: an excluded rectangle is never the figure', () => {
    const s = sheet((set) => {
      disc(set, 40, 60, 18, FIGURE);
      disc(set, 100, 60, 4, FIGURE); // a fleck of another pose reaching into the box
    });
    expect(alphaAt(extractPose(s, BOX).image, 100, 60)).toBe(0); // small and apart from the figure: dropped as a loose piece
    const touching = sheet((set) => {
      disc(set, 40, 60, 18, FIGURE);
      disc(set, 62, 60, 12, FIGURE);
    });
    expect(alphaAt(extractPose(touching, BOX).image, 62, 60)).toBe(255);
    expect(alphaAt(extractPose(touching, BOX, { exclude: [{ x0: 56, y0: 40, x1: 80, y1: 80 }] }).image, 62, 60)).toBe(0);
  });

  it('reports no figure at all when the box holds only white', () => {
    expect(extractPose(sheet(() => undefined), BOX).bounds).toBeNull();
  });

  it('is deterministic: the same sheet and box give the same pixels', () => {
    const s = sheet((set) => disc(set, 60, 60, 20, FIGURE));
    expect(Buffer.compare(Buffer.from(extractPose(s, BOX).image.data), Buffer.from(extractPose(s, BOX).image.data))).toBe(0);
  });
});

describe('moving a pose around changes no pixel', () => {
  const pose: RgbaImage = { width: 3, height: 2, data: new Uint8Array([1, 2, 3, 255, 0, 0, 0, 0, 9, 8, 7, 128, 4, 5, 6, 255, 0, 0, 0, 0, 7, 7, 7, 255]) };

  it('flipX mirrors left to right and twice is the identity', () => {
    const f = flipX(pose);
    expect(Array.from(f.data.slice(0, 4))).toEqual([9, 8, 7, 128]);
    expect(Array.from(f.data.slice(8, 12))).toEqual([1, 2, 3, 255]);
    expect(flipX(f).data).toEqual(pose.data);
  });

  it('placePose is an integer translation that puts a point of the pose on a point of the canvas', () => {
    const { image, clipped } = placePose(pose, { x: 1, y: 1 }, { width: 8, height: 8 }, { x: 5, y: 6 });
    expect(clipped).toBe(0);
    // pose (0,0) lands on (4,5)
    expect(Array.from(image.data.slice((5 * 8 + 4) * 4, (5 * 8 + 4) * 4 + 4))).toEqual([1, 2, 3, 255]);
    expect(Array.from(image.data.slice((6 * 8 + 6) * 4, (6 * 8 + 6) * 4 + 4))).toEqual([7, 7, 7, 255]);
    // transparent pixels stay transparent, the rest of the canvas is empty
    expect(Array.from(image.data.slice((5 * 8 + 5) * 4, (5 * 8 + 5) * 4 + 4))).toEqual([0, 0, 0, 0]);
  });

  it('placePose says how many pixels fall outside the canvas instead of cropping them silently', () => {
    expect(placePose(pose, { x: 0, y: 0 }, { width: 8, height: 8 }, { x: 7, y: 7 }).clipped).toBe(3);
  });
});

describe('dilate and erode', () => {
  const grid = (w: number, h: number, on: Array<[number, number]>): Uint8Array => {
    const g = new Uint8Array(w * h);
    for (const [x, y] of on) g[y * w + x] = 1;
    return g;
  };

  it('dilating a point by r gives the square of side 2r + 1', () => {
    const d = dilate(grid(9, 9, [[4, 4]]), 9, 9, 2);
    expect(d.reduce((a, b) => a + b, 0)).toBe(25);
    expect(d[2 * 9 + 2]).toBe(1);
    expect(d[1 * 9 + 1]).toBe(0);
  });

  it('eroding that square by r gives the point back, and anything thinner than the element vanishes', () => {
    const square = dilate(grid(9, 9, [[4, 4]]), 9, 9, 2);
    const e = erode(square, 9, 9, 2);
    expect(e.reduce((a, b) => a + b, 0)).toBe(1);
    expect(e[4 * 9 + 4]).toBe(1);
    expect(erode(grid(9, 9, [[4, 3], [4, 4], [4, 5]]), 9, 9, 1).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
