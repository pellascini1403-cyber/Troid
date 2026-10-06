import { inflateSync } from 'node:zlib';

/**
 * A minimal PNG decoder for E2E screenshots (8-bit grey / RGB / RGBA, non-interlaced: what Chromium produces). It lets
 * a scenario look at the PIXELS of what the player sees — "is there violet on screen while the slime winds up?" —
 * without a dependency. Not a general-purpose decoder: anything else throws.
 */
export interface Image {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major from the top-left. */
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function decodePng(buf: Uint8Array): Image {
  for (let i = 0; i < 8; i++) if (buf[i] !== SIGNATURE[i]) throw new Error('not a PNG');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  for (let pos = 8; pos < buf.length; ) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4]!, buf[pos + 5]!, buf[pos + 6]!, buf[pos + 7]!);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const depth = buf[pos + 16];
      colorType = buf[pos + 17] ?? -1;
      const interlace = buf[pos + 20];
      if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}`);
      if (interlace !== 0) throw new Error('interlaced PNGs are not supported');
      if (![0, 2, 6].includes(colorType)) throw new Error(`unsupported PNG colour type ${colorType}`);
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      const x = line[i]!;
      let v: number;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      cur[i] = v & 255;
    }
    for (let px = 0; px < width; px++) {
      const o = (y * width + px) * 4;
      if (channels === 4) {
        out[o] = cur[px * 4]!;
        out[o + 1] = cur[px * 4 + 1]!;
        out[o + 2] = cur[px * 4 + 2]!;
        out[o + 3] = cur[px * 4 + 3]!;
      } else if (channels === 3) {
        out[o] = cur[px * 3]!;
        out[o + 1] = cur[px * 3 + 1]!;
        out[o + 2] = cur[px * 3 + 2]!;
        out[o + 3] = 255;
      } else {
        out[o] = out[o + 1] = out[o + 2] = cur[px]!;
        out[o + 3] = 255;
      }
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data: out };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export type PixelTest = (r: number, g: number, b: number, a: number) => boolean;

/** How many pixels of the image (or of a sub-rectangle) satisfy the test. */
export function countPixels(img: Image, test: PixelTest, region?: { x0: number; y0: number; x1: number; y1: number }): number {
  const x0 = Math.max(0, region?.x0 ?? 0);
  const y0 = Math.max(0, region?.y0 ?? 0);
  const x1 = Math.min(img.width, region?.x1 ?? img.width);
  const y1 = Math.min(img.height, region?.y1 ?? img.height);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * img.width + x) * 4;
      if (test(img.data[o]!, img.data[o + 1]!, img.data[o + 2]!, img.data[o + 3]!)) n++;
    }
  }
  return n;
}

/**
 * Violet LIGHT, as the enemy palette makes it (docs/GAME-SPEC-2D.md §3.4) — a hue test, not a colour match, because
 * additive light over a dark scene scales every channel: blue clearly above green, red above green, and bright enough
 * not to be the creature's own dark violet rim (58, 31, 122). Grey scenery, the hero's cyan and the enemy's white eyes
 * are all outside it.
 */
export const isVioletLight: PixelTest = (r, g, b) => b >= 120 && r >= 70 && b - g >= 40 && r - g >= 8 && r < 235;
