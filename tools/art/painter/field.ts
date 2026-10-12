/**
 * Scalar fields — a Float32Array of w × h values — and the few operations the painter needs on them: a blur, the distance to the edge of a mask and the
 * slope of a height. Every one can WRAP (treat the field as periodic), which is how a texture made of them stays seamless.
 */
export interface Field {
  w: number;
  h: number;
  d: Float32Array;
}

export const makeField = (w: number, h: number, fill = 0): Field => {
  const d = new Float32Array(w * h);
  if (fill !== 0) d.fill(fill);
  return { w, h, d };
};

export function fieldFrom(w: number, h: number, fn: (x: number, y: number) => number): Field {
  const f = makeField(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f.d[y * w + x] = fn(x, y);
  return f;
}

const wrapIndex = (i: number, n: number): number => ((i % n) + n) % n;

/** One pass of a box blur along a row or a column, with a sliding window. */
function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, wrap: boolean, horizontal: boolean): void {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const win = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const at = (i: number): number => {
      const k = wrap ? wrapIndex(i, len) : Math.min(len - 1, Math.max(0, i));
      return horizontal ? src[line * w + k]! : src[k * w + line]!;
    };
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += at(i);
    for (let i = 0; i < len; i++) {
      if (horizontal) dst[line * w + i] = sum / win;
      else dst[i * w + line] = sum / win;
      sum += at(i + r + 1) - at(i - r);
    }
  }
}

/** A blur close to a Gaussian of deviation ≈ `radius` / 1.5 (three box passes per axis). */
export function blur(f: Field, radius: number, wrap = false): Field {
  const r = Math.max(0, Math.round(radius / 2));
  if (r === 0) return { w: f.w, h: f.h, d: f.d.slice() };
  let a = f.d.slice();
  let b = new Float32Array(f.d.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, f.w, f.h, r, wrap, true);
    boxPass(b, a, f.w, f.h, r, wrap, false);
  }
  return { w: f.w, h: f.h, d: a };
}

/**
 * Distance, in pixels, from each INSIDE pixel of `mask` (value > 0.5) to the nearest outside pixel (0 outside). A two-pass chamfer (3–4): good enough to bevel a
 * shape, and fast. With `wrap` the mask is periodic; without it the border of the field counts as outside only if `borderOutside`.
 */
export function distanceInside(mask: Field, wrap = false, borderOutside = true, cap = 1e9): Field {
  const { w, h } = mask;
  const INF = 1e8;
  const out = makeField(w, h);
  const d = out.d;
  for (let i = 0; i < d.length; i++) d[i] = mask.d[i]! > 0.5 ? INF : 0;
  const get = (x: number, y: number): number => {
    if (wrap) return d[wrapIndex(y, h) * w + wrapIndex(x, w)]!;
    if (x < 0 || y < 0 || x >= w || y >= h) return borderOutside ? 0 : INF;
    return d[y * w + x]!;
  };
  const sweeps = wrap ? 2 : 1;
  for (let s = 0; s < sweeps; s++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (d[i] === 0) continue;
        d[i] = Math.min(d[i]!, get(x - 1, y) + 3, get(x, y - 1) + 3, get(x - 1, y - 1) + 4, get(x + 1, y - 1) + 4);
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (d[i] === 0) continue;
        d[i] = Math.min(d[i]!, get(x + 1, y) + 3, get(x, y + 1) + 3, get(x + 1, y + 1) + 4, get(x - 1, y + 1) + 4);
      }
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = Math.min(cap, d[i]! >= INF ? cap : d[i]! / 3);
  return out;
}

/** The slope of a height field (central differences): where it rises to the right (`gx`) and downwards (`gy`), per pixel. */
export function slope(height: Field, wrap = false): { gx: Float32Array; gy: Float32Array } {
  const { w, h, d } = height;
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const at = (x: number, y: number): number => {
    if (wrap) return d[wrapIndex(y, h) * w + wrapIndex(x, w)]!;
    return d[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      gx[y * w + x] = (at(x + 1, y) - at(x - 1, y)) / 2;
      gy[y * w + x] = (at(x, y + 1) - at(x, y - 1)) / 2;
    }
  }
  return { gx, gy };
}
