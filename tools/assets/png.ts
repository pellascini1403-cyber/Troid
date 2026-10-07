import { crc32, deflateSync, inflateSync } from 'node:zlib';

/**
 * PNG, both ways, with no dependency (docs/ART-PIPELINE-2D.md, part C). The decoder reads what an artist's tool exports — grey, grey + alpha, RGB, RGBA and
 * palette images, 1 to 16 bits, with `tRNS` transparency — and gives back plain 8-bit RGBA, the form the packer works on; the encoder writes 8-bit RGBA.
 * Nothing in between changes a pixel: no colour is converted, no alpha is touched, no filter is applied (the PNG row filters are lossless by definition).
 *
 * The one conversion that cannot be exact is a 16-bit channel to 8 bits (the GPU has 8): it is rounded, and `readPngInfo` tells the packer the source had
 * 16 so that it can say so. Interlaced images are refused (re-export them without Adam7): a clear message is better than a guessed picture.
 */
export interface RgbaImage {
  width: number;
  height: number;
  /** 4 bytes per pixel (R, G, B, A, straight alpha), row-major from the top-left. */
  data: Uint8Array;
}

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  /** 0 grey · 2 RGB · 3 palette · 4 grey + alpha · 6 RGBA. */
  colorType: number;
  interlaced: boolean;
  /** The image can have transparent pixels: an alpha channel, or a `tRNS` chunk. */
  hasAlpha: boolean;
  /** A colour profile or gamma travels with the file (`iCCP`, `sRGB`, `gAMA`, `cHRM`): the pixel numbers are used as they are, the profile is not carried over. */
  colourChunks: string[];
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

interface Chunk {
  type: string;
  body: Uint8Array;
}

function chunksOf(buf: Uint8Array, verifyCrc: boolean): Chunk[] {
  if (buf.length < 8 || SIGNATURE.some((b, i) => buf[i] !== b)) throw new Error('not a PNG file (the signature is wrong)');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Chunk[] = [];
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = view.getUint32(pos);
    if (pos + 12 + len > buf.length) throw new Error('the PNG is truncated (a chunk runs past the end of the file)');
    const type = String.fromCharCode(buf[pos + 4]!, buf[pos + 5]!, buf[pos + 6]!, buf[pos + 7]!);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (verifyCrc && crc32(buf.subarray(pos + 4, pos + 8 + len)) !== view.getUint32(pos + 8 + len)) throw new Error(`the PNG is corrupt (chunk ${type} fails its checksum)`);
    out.push({ type, body });
    pos += 12 + len;
    if (type === 'IEND') return out;
  }
  throw new Error('the PNG is truncated (no IEND chunk)');
}

function header(chunks: Chunk[]): { width: number; height: number; bitDepth: number; colorType: number; interlaced: boolean } {
  const ihdr = chunks[0];
  if (!ihdr || ihdr.type !== 'IHDR' || ihdr.body.length !== 13) throw new Error('the PNG has no header');
  const v = new DataView(ihdr.body.buffer, ihdr.body.byteOffset, 13);
  const width = v.getUint32(0);
  const height = v.getUint32(4);
  const bitDepth = ihdr.body[8]!;
  const colorType = ihdr.body[9]!;
  if (width === 0 || height === 0 || width > 16384 || height > 16384) throw new Error(`the PNG is ${width} × ${height}: not a size an atlas frame can have`);
  if (!DEPTHS[colorType]?.includes(bitDepth)) throw new Error(`colour type ${colorType} with ${bitDepth} bits is not a PNG format`);
  return { width, height, bitDepth, colorType, interlaced: ihdr.body[12] === 1 };
}

/** What a PNG file is, from its header and chunk list alone (nothing is inflated). Throws on a file that is not a PNG. */
export function readPngInfo(buf: Uint8Array, verifyCrc = false): PngInfo {
  const chunks = chunksOf(buf, verifyCrc);
  const h = header(chunks);
  return {
    ...h,
    hasAlpha: h.colorType === 4 || h.colorType === 6 || chunks.some((c) => c.type === 'tRNS'),
    colourChunks: chunks.filter((c) => ['iCCP', 'sRGB', 'gAMA', 'cHRM'].includes(c.type)).map((c) => c.type),
  };
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Reads a PNG into 8-bit RGBA. Throws, with a message a person can act on, on anything that is not a whole, supported PNG. */
export function decodePng(buf: Uint8Array, options: { verifyCrc?: boolean } = {}): RgbaImage {
  const chunks = chunksOf(buf, options.verifyCrc ?? true);
  const { width, height, bitDepth, colorType, interlaced } = header(chunks);
  if (interlaced) throw new Error('interlaced (Adam7) PNGs are not supported: export the image without interlacing');
  const palette = chunks.find((c) => c.type === 'PLTE')?.body;
  const trns = chunks.find((c) => c.type === 'tRNS')?.body;
  if (colorType === 3 && !palette) throw new Error('a palette PNG has no palette');

  const channels = CHANNELS[colorType]!;
  const bitsPerPixel = channels * bitDepth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const idat = chunks.filter((c) => c.type === 'IDAT');
  if (idat.length === 0) throw new Error('the PNG holds no image data');
  const raw = inflateSync(Buffer.concat(idat.map((c) => c.body)));
  if (raw.length < height * (stride + 1)) throw new Error('the PNG holds less image data than its size needs');

  // 1. undo the row filters
  const lines = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = y > 0 ? dst - stride : -1;
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? lines[dst + i - bpp]! : 0;
      const above = up >= 0 ? lines[up + i]! : 0;
      const corner = up >= 0 && i >= bpp ? lines[up + i - bpp]! : 0;
      const x = raw[src + i]!;
      let v: number;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + left; break;
        case 2: v = x + above; break;
        case 3: v = x + ((left + above) >> 1); break;
        case 4: v = x + paeth(left, above, corner); break;
        default: throw new Error(`the PNG has an unknown row filter (${filter})`);
      }
      lines[dst + i] = v & 255;
    }
  }

  // 2. unpack to RGBA8
  const out = new Uint8Array(width * height * 4);
  const max = (1 << bitDepth) - 1;
  const sample = (y: number, index: number): number => {
    // the `index`-th sample of row y, whatever the bit depth
    const row = y * stride;
    if (bitDepth === 8) return lines[row + index]!;
    if (bitDepth === 16) return (lines[row + index * 2]! << 8) | lines[row + index * 2 + 1]!;
    const bit = index * bitDepth;
    return (lines[row + (bit >> 3)]! >> (8 - bitDepth - (bit & 7))) & max;
  };
  const to8 = (v: number): number => (bitDepth === 8 ? v : bitDepth === 16 ? Math.round(v / 257) : Math.round((v * 255) / max));
  const tGrey = trns && colorType === 0 && trns.length >= 2 ? (trns[0]! << 8) | trns[1]! : -1;
  const tRgb = trns && colorType === 2 && trns.length >= 6 ? [(trns[0]! << 8) | trns[1]!, (trns[2]! << 8) | trns[3]!, (trns[4]! << 8) | trns[5]!] : null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 0) {
        const g = sample(y, x);
        out[o] = out[o + 1] = out[o + 2] = to8(g);
        out[o + 3] = g === tGrey ? 0 : 255;
      } else if (colorType === 2) {
        const r = sample(y, x * 3);
        const g = sample(y, x * 3 + 1);
        const b = sample(y, x * 3 + 2);
        out[o] = to8(r);
        out[o + 1] = to8(g);
        out[o + 2] = to8(b);
        out[o + 3] = tRgb && r === tRgb[0] && g === tRgb[1] && b === tRgb[2] ? 0 : 255;
      } else if (colorType === 3) {
        const i = sample(y, x);
        if (i * 3 + 2 >= palette!.length) throw new Error(`the PNG uses palette entry ${i} but the palette has ${palette!.length / 3}`);
        out[o] = palette![i * 3]!;
        out[o + 1] = palette![i * 3 + 1]!;
        out[o + 2] = palette![i * 3 + 2]!;
        out[o + 3] = trns && i < trns.length ? trns[i]! : 255;
      } else if (colorType === 4) {
        out[o] = out[o + 1] = out[o + 2] = to8(sample(y, x * 2));
        out[o + 3] = to8(sample(y, x * 2 + 1));
      } else {
        out[o] = to8(sample(y, x * 4));
        out[o + 1] = to8(sample(y, x * 4 + 1));
        out[o + 2] = to8(sample(y, x * 4 + 2));
        out[o + 3] = to8(sample(y, x * 4 + 3));
      }
    }
  }
  return { width, height, data: out };
}

function chunk(type: string, body: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(body.buffer, body.byteOffset, body.byteLength).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/**
 * Writes an 8-bit RGBA PNG. Each row takes the PNG filter that makes it smallest (the sum-of-absolute-differences rule libpng uses) and the whole is deflated at
 * the highest level: the bytes are the same for the same pixels, so a rebuild changes nothing in version control.
 */
export function encodePng(img: RgbaImage): Buffer {
  const { width, height, data } = img;
  if (data.length !== width * height * 4) throw new Error(`an image of ${width} × ${height} needs ${width * height * 4} bytes, it has ${data.length}`);
  const stride = width * 4;
  const rows = Buffer.alloc(height * (stride + 1));
  const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    let best = 0;
    let bestCost = Infinity;
    for (let f = 0; f < 5; f++) {
      const line = candidates[f]!;
      let cost = 0;
      for (let i = 0; i < stride; i++) {
        const x = data[y * stride + i]!;
        const left = i >= 4 ? data[y * stride + i - 4]! : 0;
        const above = y > 0 ? data[(y - 1) * stride + i]! : 0;
        const corner = y > 0 && i >= 4 ? data[(y - 1) * stride + i - 4]! : 0;
        const pred = f === 0 ? 0 : f === 1 ? left : f === 2 ? above : f === 3 ? (left + above) >> 1 : paeth(left, above, corner);
        const v = (x - pred) & 255;
        line[i] = v;
        cost += v < 128 ? v : 256 - v;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = f;
      }
    }
    rows[y * (stride + 1)] = best;
    rows.set(candidates[best]!, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
}
