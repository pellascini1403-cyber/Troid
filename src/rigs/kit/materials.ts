import { PALETTE } from '@/presentation/palette';
import { darken, lighten, mix, type Pt } from './geometry';
import { LIGHT_DOWN, type GlossLens, type Material, type RimLight } from './paint';

/**
 * The surfaces the creatures are made of (docs/PROMPT24-LOG.md). They all follow the language of the references — a dark glossy body, a thin bright edge of coloured light on the side the light comes from, a faint reflected
 * glow from below, a lens of gloss — and differ in what they are made of: ink and shadow are nearly black and all rim; stone and bone are pale and shaded; glass takes the light through it; metal catches it in bands;
 * ember is dark and cracked with a light inside. Each is a function of the colours of the place, so a species picks the material and the region picks the light.
 */

/** The standard pair of rims: the light from above and behind, and the bounce from the floor. */
export function rims(color: number, o: { width?: number; power?: number; bounce?: number; alpha?: number } = {}): RimLight[] {
  const w = o.width ?? 2.2;
  return [
    { color, width: w, power: o.power ?? 1.3, alpha: o.alpha ?? 0.95 },
    { color: mix(color, 0x000000, 0.4), dir: LIGHT_DOWN, width: w * 0.75, power: 1.7, alpha: o.bounce ?? 0.55 },
  ];
}

/** A lens of gloss at `at`, as in the references: a faint wide one and a brighter small one inside it. */
export function lens(at: Pt, rx: number, ry: number, rot: number, color: number, alpha = 0.3): GlossLens[] {
  return [
    { at, rx, ry, rot, color, alpha },
    { at: [at[0] - rx * 0.12, at[1] + ry * 0.2], rx: rx * 0.5, ry: ry * 0.38, rot, color: lighten(color, 0.45), alpha: Math.min(1, alpha * 1.5) },
  ];
}

/** Ink: nearly black, wet, all rim and gloss. The body of the ink creatures and of everything that is made of the dark. */
export function ink(rim: number, o: { gloss?: GlossLens[]; fill?: number; width?: number; ramp?: boolean } = {}): Material {
  return {
    fill: o.fill ?? PALETTE.enemyInk,
    ...(o.ramp ? { ramp: 'sphere' as const } : {}),
    rims: rims(rim, o.width !== undefined ? { width: o.width } : {}),
    ...(o.gloss ? { gloss: o.gloss } : {}),
  };
}

/** Pale, shaded stuff (stone, bone, salt, brass): a ramp tinted with the colour, a dark edge so it does not melt into the world, and the light along it. */
export function solid(color: number, rim: number, o: { ramp?: Material['ramp']; edge?: number; gloss?: GlossLens[]; width?: number } = {}): Material {
  return {
    fill: color,
    ramp: o.ramp ?? 'sphere',
    edge: { color: o.edge ?? darken(color, 0.7), width: 1.1, alpha: 0.9 },
    rims: rims(rim, o.width !== undefined ? { width: o.width } : {}),
    ...(o.gloss ? { gloss: o.gloss } : {}),
  };
}

/** Dark stuff with a light of its own inside (magma, embers, a lit lantern): the body is the dark and the seams are drawn on it by the species. */
export function scorched(color: number, rim: number, o: { gloss?: GlossLens[]; width?: number } = {}): Material {
  return {
    fill: color,
    ramp: 'sphere',
    edge: { color: darken(color, 0.8), width: 1, alpha: 0.9 },
    rims: rims(rim, { width: o.width ?? 2 }),
    ...(o.gloss ? { gloss: o.gloss } : {}),
  };
}
