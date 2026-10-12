/** Colours as [r, g, b] in 0..1. A ramp maps a value to a colour: the painter works in values and grades them at the end, so a whole zone shares one palette. */
export type Rgb = [number, number, number];

export function hex(s: string): Rgb {
  const v = s.replace('#', '');
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}

export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scaleRgb = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
export const luma = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export interface Stop {
  at: number;
  colour: Rgb;
}

/** A piecewise-linear gradient from value 0..1 to a colour. */
export function ramp(stops: readonly Stop[]): (v: number) => Rgb {
  const s = [...stops].sort((a, b) => a.at - b.at);
  return (v) => {
    if (v <= s[0]!.at) return s[0]!.colour;
    for (let i = 1; i < s.length; i++) {
      const b = s[i]!;
      if (v <= b.at) {
        const a = s[i - 1]!;
        return mixRgb(a.colour, b.colour, (v - a.at) / (b.at - a.at || 1));
      }
    }
    return s[s.length - 1]!.colour;
  };
}

export function css(c: Rgb, alpha = 1): string {
  return `rgba(${Math.round(clamp01(c[0]) * 255)},${Math.round(clamp01(c[1]) * 255)},${Math.round(clamp01(c[2]) * 255)},${alpha})`;
}
