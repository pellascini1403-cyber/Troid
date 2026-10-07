import { describe, expect, it } from 'vitest';
import { extractSheet, parseSheetSpec } from '../../../tools/assets/sheet';
import type { RgbaImage } from '../../../tools/assets/png';
import { Rng } from '@/core/rng';

/**
 * FRAME EXTRACTION FROM A SPRITESHEET (docs/ART-PIPELINE-2D.md, part F): a crop by a grid the manifest states, and nothing else. The sheet is noise: a technical
 * fixture, never art.
 */
const sheet = (w: number, h: number, seed = 1): RgbaImage => {
  const rng = new Rng(seed);
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = rng.int(0, 256);
  return { width: w, height: h, data };
};
const cell = (img: RgbaImage, x: number, y: number, w: number, h: number): number[] => {
  const out: number[] = [];
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) out.push(...img.data.subarray((r * img.width + c) * 4, (r * img.width + c) * 4 + 4));
  return out;
};
const spec = { file: 'idle.png', prefix: 'idle_', frameSize: [4, 3], columns: 3, count: 5 };

describe('extractSheet', () => {
  it('cuts the grid left to right and top to bottom, and every cell is bit for bit what was in the sheet', () => {
    const img = sheet(12, 6); // 3 columns × 2 rows of 4 × 3
    const r = extractSheet(spec, img);
    expect(r.errors).toEqual([]);
    expect(r.frames.map((f) => f.name)).toEqual(['idle_00', 'idle_01', 'idle_02', 'idle_03', 'idle_04']);
    const at = [[0, 0], [4, 0], [8, 0], [0, 3], [4, 3]] as const;
    r.frames.forEach((f, i) => {
      expect([f.image.width, f.image.height]).toEqual([4, 3]);
      expect(Array.from(f.image.data), f.name).toEqual(cell(img, at[i]![0], at[i]![1], 4, 3));
    });
  });

  it('numbers the frames from `first`', () => {
    const r = extractSheet({ ...spec, first: 8, count: 3 }, sheet(12, 3));
    expect(r.frames.map((f) => f.name)).toEqual(['idle_08', 'idle_09', 'idle_10']);
  });

  it('guesses nothing: a sheet that is not exactly the size of its grid is refused, with both numbers', () => {
    for (const [w, h] of [[13, 6], [12, 7], [8, 6], [12, 3]] as const) {
      const r = extractSheet(spec, sheet(w, h));
      expect(r.frames, `${w} × ${h}`).toEqual([]);
      expect(r.errors[0], `${w} × ${h}`).toMatch(new RegExp(`idle\\.png is ${w} × ${h} but 3 column\\(s\\) of 4 × 3 and 5 frame\\(s\\) make 12 × 6: nothing is guessed`));
    }
  });

  it('refuses a definition that is not complete and exact: no guessed sizes, columns or counts, no unknown keys', () => {
    for (const bad of [null, 'x', [], { ...spec, frameSize: undefined }, { ...spec, frameSize: [4.5, 3] }, { ...spec, frameSize: [0, 3] }, { ...spec, columns: 0 }, { ...spec, columns: 2.5 }, { ...spec, count: 'many' }, { ...spec, first: -1 }, { ...spec, file: '../idle.png' }, { ...spec, file: 'idle.jpg' }, { ...spec, prefix: '' }, { ...spec, stride: 2 }]) {
      const r = parseSheetSpec(bad);
      expect(r.spec, JSON.stringify(bad)).toBeNull();
      expect(r.errors.length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
    expect(parseSheetSpec({ ...spec, comment: 'ok' }).spec).not.toBeNull();
    expect(parseSheetSpec(spec).spec).toEqual({ file: 'idle.png', prefix: 'idle_', frameSize: [4, 3], columns: 3, count: 5, first: 0 });
  });
});
