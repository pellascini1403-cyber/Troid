import { surface, writePixels, type Surface } from './canvas';
import { clamp01, smoothstep } from './color';
import { fbm } from './noise';
import { Rng } from './rng';

/**
 * Light as pictures, for the layers that are drawn ADDITIVELY (docs/ART-PIPELINE-2D.md part H.3: light goes in its own layer, because mixing blend modes breaks a batch). Each is
 * a white-cyan colour whose alpha is the intensity: a shaft over a way out, a diagonal beam through the trees, a soft glow to put under a rune or a shrine, a bank of mist.
 */
export interface LightOptions {
  w: number;
  h: number;
  seed: number;
  /** The colour of the light (0..1 each); cold white-cyan when omitted. */
  tint?: readonly [number, number, number];
}

const RGB = [0.62, 0.93, 1] as const;

function fromAlpha(w: number, h: number, a: (x: number, y: number) => number, tint: readonly [number, number, number] = RGB): Surface {
  const s = surface(w, h);
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = clamp01(a(x, y));
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(tint[0] * 255);
      img.data[i + 1] = Math.round(tint[1] * 255);
      img.data[i + 2] = Math.round(tint[2] * 255);
      img.data[i + 3] = Math.round(v * 255);
    }
  }
  writePixels(s, img);
  return s;
}

/** A vertical shaft: soft at the sides, streaked, strongest at its foot and gone at its top. */
export function shaft(o: LightOptions): Surface {
  const { w, h, seed } = o;
  return fromAlpha(
    w,
    h,
    (x, y) => {
      const u = x / w;
      const side = smoothstep(0, 0.28, u) * (1 - smoothstep(0.72, 1, u));
      const along = smoothstep(0, 0.35, y / h) * (0.35 + 0.65 * (y / h)) ** 1.2;
      const streak = 0.65 + 0.7 * fbm(x * 0.07, y * 0.004, seed, { octaves: 3 });
      return side * along * streak * 0.5;
    },
    o.tint,
  );
}

/** A beam that falls at an angle through a canopy: a parallelogram, soft-edged, bright where it starts and gone where it ends. */
export function beam(o: LightOptions): Surface {
  const { w, h, seed } = o;
  const skew = w * 0.45;
  return fromAlpha(w, h, (x, y) => {
    const t = y / h;
    const u = (x - skew * t) / (w - skew);
    if (u < 0 || u > 1) return 0;
    const side = smoothstep(0, 0.3, u) * (1 - smoothstep(0.7, 1, u));
    const along = smoothstep(0, 0.12, t) * (1 - smoothstep(0.35, 1, t));
    return side * along * (0.7 + 0.5 * fbm(x * 0.05, y * 0.01, seed, { octaves: 3 })) * 0.55;
  });
}

/** A soft round glow: bright in the middle, falling off smoothly. */
export function glow(o: LightOptions): Surface {
  const { w, h } = o;
  return fromAlpha(
    w,
    h,
    (x, y) => {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h / 2) / (h / 2);
      const r = Math.hypot(dx, dy);
      return r >= 1 ? 0 : (1 - r) ** 2.3;
    },
    o.tint,
  );
}

/** A bank of mist: a wide soft band of noise that thins out above and below, periodic across its width so copies of it meet. */
export function mistBank(o: LightOptions): Surface {
  const { w, h, seed } = o;
  const cells = Math.max(2, Math.round(w / 220));
  return fromAlpha(
    w,
    h,
    (x, y) => {
      const band = smoothstep(0, 0.45, y / h) * (1 - smoothstep(0.55, 1, y / h));
      const edge = smoothstep(0, 0.12, x / w) * (1 - smoothstep(0.88, 1, x / w));
      const n = fbm((x / w) * cells, (y / h) * 2.2, seed, { octaves: 4, px: cells, py: 0 });
      return band * edge * smoothstep(0.32, 0.78, n) * 0.5;
    },
    [0.55, 0.85, 0.95],
  );
}

/** Motes: a few small points of light with a soft halo, scattered over a transparent field (for a drift of dust in a shaft). */
export function motes(o: LightOptions): Surface {
  const { w, h, seed } = o;
  const rng = new Rng(seed);
  const s = surface(w, h);
  const ctx = s.ctx;
  for (let i = 0; i < Math.round((w * h) / 7000); i++) {
    const x = rng.range(4, w - 4);
    const y = rng.range(4, h - 4);
    const r = rng.range(1.2, 3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, `rgba(220,250,255,${rng.range(0.35, 0.8)})`);
    g.addColorStop(0.35, 'rgba(120,225,255,0.25)');
    g.addColorStop(1, 'rgba(60,180,230,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  return s;
}

/** A veil of darkness: transparent at the top and nearly black at the bottom, to be stretched along a stretch of ground so that it sinks into the dark. Not light: drawn normally. */
export function veil(o: LightOptions): Surface {
  const { w, h } = o;
  const s = surface(w, h);
  const ctx = s.ctx;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(2,6,12,0)');
  g.addColorStop(0.18, 'rgba(2,6,12,0.12)');
  g.addColorStop(0.6, 'rgba(2,6,12,0.55)');
  g.addColorStop(1, 'rgba(2,6,12,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return s;
}
