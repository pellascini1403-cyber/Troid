import { crc32, deflateSync } from 'node:zlib';

/**
 * A PNG written by hand, one row of raw samples at a time, in ANY colour type and bit depth (filter 0, no tricks): the independent reference the codec of the
 * art pipeline is tested against. `samples[y]` lists the samples of row y in order (grey; or R, G, B; or palette index; or grey, alpha; or R, G, B, A).
 */
export interface RawPng {
  width: number;
  height: number;
  bitDepth: 1 | 2 | 4 | 8 | 16;
  colorType: 0 | 2 | 3 | 4 | 6;
  samples: number[][];
  palette?: number[];
  trns?: number[];
  /** Extra chunks placed before the data (`gAMA`, `iCCP`…). */
  extra?: Array<{ type: string; body: number[] }>;
  interlace?: 0 | 1;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

export function rawPng(p: RawPng): Buffer {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[p.colorType];
  const stride = Math.ceil((p.width * channels * p.bitDepth) / 8);
  const rows: Buffer[] = [];
  for (let y = 0; y < p.height; y++) {
    const row = Buffer.alloc(stride + 1); // filter byte 0
    const samples = p.samples[y] ?? [];
    samples.forEach((v, i) => {
      if (p.bitDepth === 16) {
        row[1 + i * 2] = v >> 8;
        row[2 + i * 2] = v & 255;
      } else if (p.bitDepth === 8) row[1 + i] = v;
      else {
        const bit = i * p.bitDepth;
        row[1 + (bit >> 3)]! |= v << (8 - p.bitDepth - (bit & 7));
      }
    });
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(p.width, 0);
  ihdr.writeUInt32BE(p.height, 4);
  ihdr[8] = p.bitDepth;
  ihdr[9] = p.colorType;
  ihdr[12] = p.interlace ?? 0;
  const parts = [SIGNATURE, chunk('IHDR', ihdr)];
  for (const e of p.extra ?? []) parts.push(chunk(e.type, Buffer.from(e.body)));
  if (p.palette) parts.push(chunk('PLTE', Buffer.from(p.palette)));
  if (p.trns) parts.push(chunk('tRNS', Buffer.from(p.trns)));
  parts.push(chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
