import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, readPngInfo, type RgbaImage } from '../../../tools/assets/png';
import { rawPng } from '../../helpers/png';
import { Rng } from '@/core/rng';

/**
 * THE PNG CODEC OF THE ART PIPELINE (docs/ART-PIPELINE-2D.md, part C): what an artist's tool writes must come in without one pixel changed, and what the
 * packer writes must come back out the same. The references are PNGs written by hand (`helpers/png.ts`), in every colour type and bit depth.
 */
const noise = (width: number, height: number, seed: number): RgbaImage => {
  const rng = new Rng(seed);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i++) data[i] = rng.int(0, 256);
  // the values that matter at the edges of alpha: fully clear, almost clear, almost solid, solid
  for (let i = 0; i < width * height; i += 7) data[i * 4 + 3] = [0, 1, 254, 255][i % 4]!;
  return { width, height, data };
};
const rgba = (img: RgbaImage, x: number, y: number): number[] => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe('encodePng / decodePng: the packer\'s own PNGs', () => {
  it('come back exactly as they went in: every channel of every pixel, alpha included', () => {
    for (const [w, h, seed] of [[1, 1, 1], [3, 5, 2], [64, 48, 3], [101, 7, 4], [7, 101, 5]] as const) {
      const img = noise(w, h, seed);
      const back = decodePng(encodePng(img));
      expect(back.width).toBe(w);
      expect(back.height).toBe(h);
      expect(Array.from(back.data), `${w} × ${h}`).toEqual(Array.from(img.data));
    }
  });

  it('are the same bytes for the same pixels (a rebuild changes nothing in version control)', () => {
    const img = noise(40, 30, 9);
    expect(encodePng(img).equals(encodePng({ ...img, data: new Uint8Array(img.data) }))).toBe(true);
  });

  it('are real PNGs: 8-bit RGBA, with a header any reader takes', () => {
    const info = readPngInfo(encodePng(noise(10, 6, 1)), true);
    expect(info).toMatchObject({ width: 10, height: 6, bitDepth: 8, colorType: 6, interlaced: false, hasAlpha: true, colourChunks: [] });
  });

  it('refuse a pixel buffer that is not the size the image says', () => {
    expect(() => encodePng({ width: 2, height: 2, data: new Uint8Array(15) })).toThrow(/needs 16 bytes/);
  });

  it('compress a flat image far below its raw size (the row filters earn their keep on gradients too)', () => {
    const flat: RgbaImage = { width: 128, height: 128, data: new Uint8Array(128 * 128 * 4).fill(7) };
    expect(encodePng(flat).length).toBeLessThan(300);
    const ramp = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) ramp.set([x * 2, y * 2, (x + y) & 255, 255], (y * 128 + x) * 4);
    expect(encodePng({ width: 128, height: 128, data: ramp }).length).toBeLessThan(128 * 128 * 4 * 0.1);
    expect(Array.from(decodePng(encodePng({ width: 128, height: 128, data: ramp })).data)).toEqual(Array.from(ramp));
  });
});

describe('decodePng: whatever an artist\'s tool exports', () => {
  it('reads grey images of every bit depth, scaled to the 0–255 range', () => {
    const cases: Array<[1 | 2 | 4 | 8 | 16, number[], number[]]> = [
      [1, [0, 1, 1, 0], [0, 255, 255, 0]],
      [2, [0, 1, 2, 3], [0, 85, 170, 255]],
      [4, [0, 5, 10, 15], [0, 85, 170, 255]],
      [8, [0, 10, 200, 255], [0, 10, 200, 255]],
      [16, [0, 0x0101, 0x8080, 0xffff], [0, 1, 128, 255]],
    ];
    for (const [bitDepth, samples, expected] of cases) {
      const img = decodePng(rawPng({ width: 4, height: 1, bitDepth, colorType: 0, samples: [samples] }));
      expect(Array.from({ length: 4 }, (_, x) => rgba(img, x, 0)), `${bitDepth}-bit grey`).toEqual(expected.map((g) => [g, g, g, 255]));
    }
  });

  it('reads RGB and RGBA at 8 and 16 bits, and grey + alpha, keeping alpha as written', () => {
    const rgb8 = decodePng(rawPng({ width: 2, height: 1, bitDepth: 8, colorType: 2, samples: [[10, 20, 30, 40, 50, 60]] }));
    expect([rgba(rgb8, 0, 0), rgba(rgb8, 1, 0)]).toEqual([[10, 20, 30, 255], [40, 50, 60, 255]]);
    const rgba16 = decodePng(rawPng({ width: 1, height: 1, bitDepth: 16, colorType: 6, samples: [[0xffff, 0x8080, 0x0101, 0x00ff]] }));
    expect(rgba(rgba16, 0, 0)).toEqual([255, 128, 1, 1]);
    const ga8 = decodePng(rawPng({ width: 2, height: 1, bitDepth: 8, colorType: 4, samples: [[100, 0, 200, 129]] }));
    expect([rgba(ga8, 0, 0), rgba(ga8, 1, 0)]).toEqual([[100, 100, 100, 0], [200, 200, 200, 129]]);
    const ga16 = decodePng(rawPng({ width: 1, height: 1, bitDepth: 16, colorType: 4, samples: [[0x4040, 0xffff]] }));
    expect(rgba(ga16, 0, 0)).toEqual([64, 64, 64, 255]);
  });

  it('reads palette images of 1, 2, 4 and 8 bits, with the transparency of their tRNS chunk', () => {
    const palette = [255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9];
    for (const bitDepth of [2, 4, 8] as const) {
      const img = decodePng(rawPng({ width: 4, height: 1, bitDepth, colorType: 3, samples: [[0, 1, 2, 3]], palette, trns: [255, 128] }));
      expect(Array.from({ length: 4 }, (_, x) => rgba(img, x, 0)), `${bitDepth}-bit palette`).toEqual([[255, 0, 0, 255], [0, 255, 0, 128], [0, 0, 255, 255], [9, 9, 9, 255]]);
    }
    const one = decodePng(rawPng({ width: 3, height: 1, bitDepth: 1, colorType: 3, samples: [[1, 0, 1]], palette: [0, 0, 0, 200, 100, 50] }));
    expect([rgba(one, 0, 0), rgba(one, 1, 0)]).toEqual([[200, 100, 50, 255], [0, 0, 0, 255]]);
  });

  it('reads the single transparent colour of a grey or RGB image (tRNS)', () => {
    const grey = decodePng(rawPng({ width: 3, height: 1, bitDepth: 8, colorType: 0, samples: [[7, 8, 7]], trns: [0, 7] }));
    expect([0, 1, 2].map((x) => rgba(grey, x, 0)[3])).toEqual([0, 255, 0]);
    const rgb = decodePng(rawPng({ width: 2, height: 1, bitDepth: 8, colorType: 2, samples: [[1, 2, 3, 1, 2, 4]], trns: [0, 1, 0, 2, 0, 3] }));
    expect([0, 1].map((x) => rgba(rgb, x, 0)[3])).toEqual([0, 255]);
  });

  it('says what a file is without inflating it, including the colour chunks it carries that are not carried over', () => {
    const base = { width: 2, height: 1, bitDepth: 8 as const, samples: [[1, 2, 3, 4, 5, 6]] };
    expect(readPngInfo(rawPng({ ...base, colorType: 2 }))).toMatchObject({ hasAlpha: false, colourChunks: [] });
    expect(readPngInfo(rawPng({ ...base, colorType: 2, trns: [0, 1, 0, 2, 0, 3] })).hasAlpha, 'a tRNS chunk is transparency').toBe(true);
    expect(readPngInfo(rawPng({ ...base, colorType: 2, extra: [{ type: 'gAMA', body: [0, 1, 0, 0] }, { type: 'iCCP', body: [65, 0, 0] }] })).colourChunks).toEqual(['gAMA', 'iCCP']);
    expect(readPngInfo(rawPng({ ...base, width: 1, colorType: 6, samples: [[1, 2, 3, 4]] }))).toMatchObject({ hasAlpha: true, colorType: 6 });
  });

  it('refuses what is damaged, and says what is wrong', () => {
    const good = rawPng({ width: 2, height: 2, bitDepth: 8, colorType: 6, samples: [[1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16]] });
    expect(() => decodePng(Buffer.from('definitely not a png'))).toThrow(/not a PNG/);
    expect(() => decodePng(good.subarray(0, good.length - 20))).toThrow(/truncated/);
    const flipped = Buffer.from(good);
    flipped[flipped.length - 20] ^= 0xff; // a byte of the image data
    expect(() => decodePng(flipped)).toThrow(/corrupt \(chunk IDAT fails its checksum\)/);
    expect(() => decodePng(rawPng({ width: 1, height: 1, bitDepth: 8, colorType: 3, samples: [[0]] }))).toThrow(/no palette/);
    expect(() => decodePng(rawPng({ width: 1, height: 1, bitDepth: 8, colorType: 3, samples: [[5]], palette: [1, 2, 3] }))).toThrow(/palette entry 5/);
    expect(() => decodePng(rawPng({ width: 1, height: 1, bitDepth: 8, colorType: 6, samples: [[1, 2, 3, 4]], interlace: 1 }))).toThrow(/interlaced/);
    expect(() => decodePng(rawPng({ width: 1, height: 1, bitDepth: 4, colorType: 6, samples: [[1, 2, 3, 4]] }))).toThrow(/colour type 6 with 4 bits/);
    expect(() => decodePng(rawPng({ width: 0, height: 0, bitDepth: 8, colorType: 6, samples: [] }))).toThrow(/0 × 0/);
  });
});
