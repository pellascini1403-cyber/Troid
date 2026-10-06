import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { countPixels, decodePng, isVioletLight } from '../../../tools/e2e/png';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  // the decoder does not check CRCs: a zero CRC is enough for a test fixture
  return Buffer.concat([len, Buffer.from(type, 'ascii'), body, Buffer.alloc(4)]);
}

/** Encodes RGBA pixels with a chosen PNG filter per row, to exercise every filter of the decoder. */
function encode(width: number, height: number, rgba: number[], filters: number[], channels: 3 | 4 = 4): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  const stride = width * channels;
  const rows: Buffer[] = [];
  const px = (x: number, y: number, c: number): number => (x < 0 || y < 0 ? 0 : rgba[(y * width + x) * 4 + c]!);
  for (let y = 0; y < height; y++) {
    const f = filters[y % filters.length]!;
    const row = Buffer.alloc(stride + 1);
    row[0] = f;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const v = px(x, y, c);
        const a = px(x - 1, y, c);
        const b = px(x, y - 1, c);
        const cc = px(x - 1, y - 1, c);
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - cc;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
        }
        row[1 + x * channels + c] = (v - pred) & 255;
      }
    }
    rows.push(row);
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

describe('E2E PNG decoder', () => {
  const w = 5;
  const h = 6;
  const rgba: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.push((x * 50 + y * 7) & 255, (y * 40 + x * 3) & 255, (x * y * 11) & 255, 255 - x * 10);

  it('decodes every PNG filter (none, sub, up, average, Paeth) exactly', () => {
    for (const filters of [[0], [1], [2], [3], [4], [0, 1, 2, 3, 4]]) {
      const img = decodePng(encode(w, h, rgba, filters));
      expect(img.width).toBe(w);
      expect(img.height).toBe(h);
      expect(Array.from(img.data), `filters ${filters}`).toEqual(rgba);
    }
  });

  it('decodes RGB (no alpha) as opaque', () => {
    const img = decodePng(encode(w, h, rgba, [4], 3));
    for (let i = 0; i < w * h; i++) {
      expect(img.data[i * 4]).toBe(rgba[i * 4]);
      expect(img.data[i * 4 + 3]).toBe(255);
    }
  });

  it('rejects what it cannot read', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow('not a PNG');
  });

  it('counts pixels by predicate, optionally in a region; violet LIGHT is violet and bright, and nothing else (not its own rim)', () => {
    const px = (r: number, g: number, b: number): number[] => [r, g, b, 255];
    const violet = px(154, 107, 255); // the enemy's core colour
    const dimViolet = px(58, 48, 101); // the same light at a third of the strength over a dark scene: too dim to count
    const rim = px(58, 31, 122); // its dark rim: the creature itself, not light
    const glow = px(211, 194, 255); // its glow: pale, still violet
    const cyan = px(127, 218, 242);
    const white = px(247, 250, 255);
    const slate = px(79, 93, 140); // the scenery
    const night = px(12, 16, 25);
    const grey = px(104, 101, 128);
    const rgbaImg = [...violet, ...dimViolet, ...rim, ...glow, ...cyan, ...white, ...slate, ...night, ...grey];
    const img = decodePng(encode(9, 1, rgbaImg, [0]));
    expect(countPixels(img, isVioletLight)).toBe(2);
    expect(countPixels(img, isVioletLight, { x0: 0, y0: 0, x1: 2, y1: 1 })).toBe(1);
    expect(countPixels(img, (r, g, b) => r > 240 && g > 240 && b > 240)).toBe(1);
  });
});
