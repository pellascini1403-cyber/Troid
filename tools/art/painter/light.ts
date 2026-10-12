import { blur, distanceInside, makeField, slope, type Field } from './field';
import { clamp01, smoothstep, type Rgb } from './color';

/**
 * The painter's lighting: a height field, an albedo and (for a shape that is not a rectangle) an alpha become lit pixels. One light for the whole game — a cold
 * key from above and slightly ahead of the hero, a deep blue ambient — so a column in the far haze and a block under the hero's feet agree about where the sky is.
 */
export interface Look {
  /** Direction TOWARDS the light, image space (x right, y down, z towards the viewer). */
  light: readonly [number, number, number];
  key: Rgb;
  ambient: Rgb;
  /** How much a height step bends the normal. Heights are in PIXELS, so 1 is a surface as steep as it is drawn. */
  bump: number;
  /** Strength (0..1) and radius (px) of the darkening in cavities: where the height is below its neighbourhood. */
  cavity: number;
  cavityRadius: number;
  /** Strength of the light on edges that face the light, and its colour. */
  rim: number;
  rimColour: Rgb;
  /** Multiplier of the final colour. */
  exposure: number;
}

export const DAY: Look = {
  light: [0.42, -0.78, 0.46],
  key: [0.62, 0.86, 1.0],
  ambient: [0.2, 0.3, 0.42],
  bump: 1,
  cavity: 0.6,
  cavityRadius: 7,
  rim: 0.7,
  rimColour: [0.72, 0.95, 1.0],
  exposure: 1,
};

export interface Layers {
  w: number;
  h: number;
  /** Three floats per pixel, 0..1. */
  albedo: Float32Array;
  height: Field;
  /** Coverage 0..1; absent = opaque. */
  alpha?: Field;
  /** Light the piece gives out itself (three floats per pixel): runes, glowing moss. Not shaded. */
  emissive?: Float32Array;
}

const norm3 = (v: readonly [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** A height from the alpha of a shape: it rises from its edge to 1 over `radius` pixels, so a flat silhouette is lit like a rounded thing. */
export function bevel(alpha: Field, radius: number, wrap = false): Field {
  const mask = makeField(alpha.w, alpha.h);
  for (let i = 0; i < mask.d.length; i++) mask.d[i] = alpha.d[i]! > 0.5 ? 1 : 0;
  const dist = distanceInside(mask, wrap, true, radius);
  for (let i = 0; i < dist.d.length; i++) {
    const t = clamp01(dist.d[i]! / radius);
    // a quarter circle: steep at the edge, flat in the middle
    dist.d[i] = Math.sqrt(1 - (1 - t) * (1 - t));
  }
  return dist;
}

export function shade(l: Layers, look: Look, wrap = false): ImageData {
  const { w, h } = l;
  const out = new ImageData(w, h);
  const L = norm3(look.light);
  const { gx, gy } = slope(l.height, wrap);
  const around = look.cavity > 0 ? blur(l.height, look.cavityRadius, wrap) : null;
  // the edge of the shape, for the rim
  let ax: Float32Array | null = null;
  let ay: Float32Array | null = null;
  if (l.alpha && look.rim > 0) {
    const soft = blur(l.alpha, 2, wrap);
    const s = slope(soft, wrap);
    ax = s.gx;
    ay = s.gy;
  }
  const L2 = Math.hypot(L[0], L[1]) || 1;
  for (let i = 0; i < w * h; i++) {
    let nx = -gx[i]! * look.bump;
    let ny = -gy[i]! * look.bump;
    let nz = 1;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const diffuse = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    let cav = 1;
    if (around) cav = 1 - look.cavity * clamp01((around.d[i]! - l.height.d[i]!) * 0.3);
    const a0 = l.albedo[i * 3]!;
    const a1 = l.albedo[i * 3 + 1]!;
    const a2 = l.albedo[i * 3 + 2]!;
    let r = a0 * (look.ambient[0] + look.key[0] * diffuse) * cav;
    let g = a1 * (look.ambient[1] + look.key[1] * diffuse) * cav;
    let b = a2 * (look.ambient[2] + look.key[2] * diffuse) * cav;
    if (ax && ay) {
      // the outward normal of the edge is minus the gradient of the coverage
      const ex = -ax[i]!;
      const ey = -ay[i]!;
      const mag = Math.hypot(ex, ey);
      if (mag > 0.02) {
        const facing = clamp01((ex * L[0] + ey * L[1]) / (mag * L2));
        const rim = look.rim * facing * smoothstep(0.02, 0.35, mag);
        r += look.rimColour[0] * rim;
        g += look.rimColour[1] * rim;
        b += look.rimColour[2] * rim;
      }
    }
    if (l.emissive) {
      r += l.emissive[i * 3]!;
      g += l.emissive[i * 3 + 1]!;
      b += l.emissive[i * 3 + 2]!;
    }
    out.data[i * 4] = Math.round(clamp01(r * look.exposure) * 255);
    out.data[i * 4 + 1] = Math.round(clamp01(g * look.exposure) * 255);
    out.data[i * 4 + 2] = Math.round(clamp01(b * look.exposure) * 255);
    out.data[i * 4 + 3] = Math.round(clamp01(l.alpha ? l.alpha.d[i]! : 1) * 255);
  }
  return out;
}

/** Aerial perspective and the zone's grade, applied last: the far is paler and bluer, the near darker and more contrasted. */
export function grade(img: ImageData, o: { fog: Rgb; fogAmount: number; contrast?: number; gamma?: number }): void {
  const contrast = o.contrast ?? 1;
  const gamma = o.gamma ?? 1;
  for (let i = 0; i < img.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = img.data[i + c]! / 255;
      v = clamp01((v - 0.5) * contrast + 0.5);
      v = Math.pow(v, gamma);
      v = v + (o.fog[c]! - v) * o.fogAmount;
      img.data[i + c] = Math.round(clamp01(v) * 255);
    }
  }
}
