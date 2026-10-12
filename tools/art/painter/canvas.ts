import type { Rgb } from './color';

/** A canvas the painter draws into: the browser's own 2D context does the paths, the gradients and the blurs; pixels are read back for the per-pixel passes. */
export interface Surface {
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function surface(w: number, h: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2D context');
  return { w, h, canvas, ctx };
}

export const readPixels = (s: Surface): ImageData => s.ctx.getImageData(0, 0, s.w, s.h);
export const writePixels = (s: Surface, img: ImageData): void => s.ctx.putImageData(img, 0, 0);

/** The surface as PNG bytes, base64 (what the build reads back). */
export function toPngBase64(s: Surface): string {
  const url = s.canvas.toDataURL('image/png');
  return url.slice(url.indexOf(',') + 1);
}

/** Draws `from` onto `to` at (x, y) with a composite mode and an alpha. */
export function stamp(to: Surface, from: Surface, x = 0, y = 0, op: GlobalCompositeOperation = 'source-over', alpha = 1): void {
  to.ctx.save();
  to.ctx.globalCompositeOperation = op;
  to.ctx.globalAlpha = alpha;
  to.ctx.drawImage(from.canvas, x, y);
  to.ctx.restore();
}

/** Blurs a surface (the browser's own filter). */
export function blurred(s: Surface, px: number): Surface {
  const out = surface(s.w, s.h);
  out.ctx.filter = `blur(${px}px)`;
  out.ctx.drawImage(s.canvas, 0, 0);
  out.ctx.filter = 'none';
  return out;
}

export function fillRgb(s: Surface, c: Rgb, alpha = 1): void {
  s.ctx.fillStyle = `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`;
  s.ctx.fillRect(0, 0, s.w, s.h);
}
