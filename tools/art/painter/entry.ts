import { PIECES } from './pieces';
import { surface, toPngBase64, type Surface } from './canvas';

/**
 * What the build calls in the page: `paint(id, params, cut)` makes one piece and returns it as PNGs (base64) — the whole picture, or, with `cut`, its `cols × rows`
 * cells in row-major order (a periodic picture cut into the frames of a sprite set), optionally mirrored. The piece list lives in `pieces.ts`.
 */
export interface Cut {
  cols?: number;
  rows?: number;
  mirror?: boolean;
  /** Repeat the picture `tile` times across and down, to look for seams (for a person, never shipped). */
  tile?: [number, number];
  /** Paint the picture over this colour (for a person looking at a transparent piece, never shipped). */
  bg?: string;
  /** Keep this fraction of the size of every frame (0 < scale ≤ 1): the piece is painted at full size, with every number tuned for it, and then RESAMPLED — less to hold in memory for light that is soft anyway. */
  scale?: number;
}

declare global {
  interface Window {
    paint: (id: string, params?: Record<string, unknown>, cut?: Cut) => Promise<{ w: number; h: number; frames: Array<{ png: string; w: number; h: number }> }>;
    pieceIds: () => string[];
    sheet: (items: Array<{ id: string; params?: Record<string, unknown> }>, opts: { bg: string; cell: [number, number]; cols: number }) => Promise<{ w: number; h: number; png: string }>;
  }
}

function mirrored(s: Surface): Surface {
  const m = surface(s.w, s.h);
  m.ctx.translate(s.w, 0);
  m.ctx.scale(-1, 1);
  m.ctx.drawImage(s.canvas, 0, 0);
  return m;
}

window.paint = async (id, params = {}, cut = {}) => {
  const make = PIECES[id];
  if (!make) throw new Error(`no piece "${id}"`);
  let s = await make(params);
  if (cut.mirror) s = mirrored(s);
  if (cut.tile) {
    const [nx, ny] = cut.tile;
    const t = surface(s.w * nx, s.h * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) t.ctx.drawImage(s.canvas, i * s.w, j * s.h);
    s = t;
  }
  if (cut.bg) {
    const b = surface(s.w, s.h);
    b.ctx.fillStyle = cut.bg;
    b.ctx.fillRect(0, 0, s.w, s.h);
    b.ctx.drawImage(s.canvas, 0, 0);
    s = b;
  }
  const cols = cut.cols ?? 1;
  const rows = cut.rows ?? 1;
  if (s.w % cols !== 0 || s.h % rows !== 0) throw new Error(`piece "${id}" is ${s.w} × ${s.h}: it does not divide into ${cols} × ${rows} cells`);
  const fw = s.w / cols;
  const fh = s.h / rows;
  const k = cut.scale !== undefined && cut.scale > 0 && cut.scale < 1 ? cut.scale : 1;
  const ow = Math.max(1, Math.round(fw * k));
  const oh = Math.max(1, Math.round(fh * k));
  const frames: Array<{ png: string; w: number; h: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cols === 1 && rows === 1 && k === 1) {
        frames.push({ png: toPngBase64(s), w: s.w, h: s.h });
        continue;
      }
      const f = surface(ow, oh);
      f.ctx.imageSmoothingEnabled = true;
      f.ctx.imageSmoothingQuality = 'high';
      f.ctx.drawImage(s.canvas, c * fw, r * fh, fw, fh, 0, 0, ow, oh);
      frames.push({ png: toPngBase64(f), w: ow, h: oh });
    }
  }
  return { w: s.w * (ow / fw), h: s.h * (oh / fh), frames };
};
window.pieceIds = () => Object.keys(PIECES);

/** A contact sheet: several pieces side by side, each scaled to fit a cell, over a colour — for a person to judge a set of pieces together (never shipped). */
window.sheet = async (items, opts) => {
  const rows = Math.ceil(items.length / opts.cols);
  const sheet = surface(opts.cols * opts.cell[0], rows * opts.cell[1]);
  sheet.ctx.fillStyle = opts.bg;
  sheet.ctx.fillRect(0, 0, sheet.w, sheet.h);
  for (let i = 0; i < items.length; i++) {
    const make = PIECES[items[i]!.id];
    if (!make) throw new Error(`no piece "${items[i]!.id}"`);
    const piece = await make(items[i]!.params ?? {});
    const k = Math.min(1, (opts.cell[0] - 8) / piece.w, (opts.cell[1] - 8) / piece.h);
    const dw = piece.w * k;
    const dh = piece.h * k;
    const cx = (i % opts.cols) * opts.cell[0] + (opts.cell[0] - dw) / 2;
    const cy = Math.floor(i / opts.cols) * opts.cell[1] + (opts.cell[1] - dh) / 2;
    sheet.ctx.drawImage(piece.canvas, cx, cy, dw, dh);
  }
  return { w: sheet.w, h: sheet.h, png: toPngBase64(sheet) };
};
