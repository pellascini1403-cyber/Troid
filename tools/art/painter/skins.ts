import { ramp, type Rgb } from './color';
import { DAY, type Look } from './light';
import { MOSS, STONE } from './masonry';

/**
 * THE SKINS OF THE GROUND (docs/PROMPT23-LOG.md §5): the stone, the earth and the timber of the ruins are the painter's one palette — a cold grey-blue stone with a dark teal moss, lit by a cold key — and the sixty rooms
 * past the Sanctum were all built of them, so the floor of the Foundry was a mossy slab and the floor of the Spire was a turf. A skin is what the same generators (`masonry`, `ground`, `props`) are made of in another place:
 * the ramp of the stone, the ramp of what grows on it, the light its cracks give out, the light it is lit with and a few numbers. The ruins' own skin is the default and is exactly what the generators did before there were
 * skins, so every picture the Ruins have is the same to the byte; a piece names its skin with a `skin` parameter, and `withSkin` makes it the one the generators read for as long as the piece takes to paint.
 */
export interface Skin {
  stone: (v: number) => Rgb;
  moss: (v: number) => Rgb;
  /** The colour of the light that seeps out of the deepest cracks (cyan in the ruins). */
  energyRgb: Rgb;
  /** The light the ground is lit with: the key and the ambient, and the colour of the rim along its edges. */
  look: Look;
  /** The soil: how mossy, how bright its cracks and how light it is. */
  earth: { moss: number; energy: number; tone: number };
  /** A platform: the value of its planks, how much grows on its top and how much hangs from under it (1 = as much as the ruins' timber has of each). */
  platform: { tone: number; moss: number; hang: number };
}

const R = (...v: number[]): Rgb => [v[0]!, v[1]!, v[2]!];
const ramp5 = (stops: readonly Rgb[]): ((v: number) => Rgb) => ramp(stops.map((colour, i) => ({ at: i / (stops.length - 1), colour })));
const lookOf = (key: Rgb, ambient: Rgb, rimColour: Rgb): Look => ({ ...DAY, key, ambient, rimColour });

export const RUINS_SKIN: Skin = { stone: STONE, moss: MOSS, energyRgb: R(0.05, 0.36, 0.46), look: DAY, earth: { moss: 0.25, energy: 0.35, tone: 0.2 }, platform: { tone: 0.27, moss: 1, hang: 1 } };

/** One entry per place that has ground of its own. The ramps are the zone's backdrop ramps (`painter/zones.ts`) lifted a little: the ground is the most looked-at thing in a room. */
export const SKINS: Readonly<Record<string, Skin>> = {
  // the mire: black wet earth with a teal fungus on it
  mud: {
    stone: ramp5([R(0.008, 0.018, 0.02), R(0.028, 0.055, 0.06), R(0.07, 0.125, 0.13), R(0.15, 0.25, 0.25), R(0.34, 0.54, 0.52)]),
    moss: ramp5([R(0.03, 0.12, 0.1), R(0.08, 0.28, 0.23), R(0.22, 0.52, 0.44)]),
    energyRgb: R(0.05, 0.4, 0.34),
    look: lookOf(R(0.5, 0.95, 0.85), R(0.18, 0.3, 0.32), R(0.6, 1, 0.9)),
    earth: { moss: 0.4, energy: 0.3, tone: 0.2 },
    platform: { tone: 0.27, moss: 1.3, hang: 1.2 },
  },
  // the mines: slate with a vein of blue light, and the gravel between the rocks
  rock: {
    stone: ramp5([R(0.01, 0.015, 0.035), R(0.03, 0.05, 0.1), R(0.075, 0.12, 0.22), R(0.16, 0.25, 0.45), R(0.4, 0.58, 0.88)]),
    moss: ramp5([R(0.03, 0.06, 0.15), R(0.06, 0.12, 0.3), R(0.12, 0.25, 0.5)]),
    energyRgb: R(0.1, 0.3, 0.6),
    look: lookOf(R(0.5, 0.72, 1), R(0.2, 0.28, 0.46), R(0.6, 0.8, 1)),
    earth: { moss: 0.1, energy: 0.35, tone: 0.2 },
    platform: { tone: 0.24, moss: 0, hang: 0.3 },
  },
  // the spire: dressed stone the colour of old bronze, and the flagstones of its floors
  masonry: {
    stone: ramp5([R(0.02, 0.015, 0.013), R(0.07, 0.055, 0.048), R(0.16, 0.125, 0.105), R(0.34, 0.27, 0.21), R(0.7, 0.58, 0.45)]),
    moss: ramp5([R(0.07, 0.06, 0.03), R(0.14, 0.12, 0.05), R(0.26, 0.22, 0.09)]),
    energyRgb: R(0.34, 0.26, 0.1),
    look: lookOf(R(1, 0.82, 0.58), R(0.32, 0.27, 0.25), R(1, 0.85, 0.6)),
    earth: { moss: 0.05, energy: 0, tone: 0.24 },
    platform: { tone: 0.27, moss: 0, hang: 0 },
  },
  // the foundry: plates of iron with rust on them, slag with fire in its cracks, and the grating of the catwalks
  iron: {
    stone: ramp5([R(0.018, 0.01, 0.008), R(0.055, 0.03, 0.022), R(0.13, 0.07, 0.05), R(0.28, 0.15, 0.1), R(0.6, 0.34, 0.22)]),
    moss: ramp5([R(0.1, 0.04, 0.02), R(0.22, 0.09, 0.04), R(0.4, 0.17, 0.07)]),
    energyRgb: R(0.5, 0.2, 0.04),
    look: lookOf(R(1, 0.66, 0.42), R(0.3, 0.2, 0.16), R(1, 0.7, 0.4)),
    earth: { moss: 0.3, energy: 0.8, tone: 0.18 },
    platform: { tone: 0.25, moss: 0.4, hang: 0.2 },
  },
  // the heart: stone the colour of ink, with the violet light of the ink in its cracks, and bone
  ink: {
    stone: ramp5([R(0.015, 0.008, 0.03), R(0.045, 0.025, 0.085), R(0.1, 0.06, 0.2), R(0.22, 0.14, 0.4), R(0.5, 0.36, 0.78)]),
    moss: ramp5([R(0.05, 0.02, 0.12), R(0.1, 0.05, 0.25), R(0.2, 0.1, 0.45)]),
    energyRgb: R(0.3, 0.12, 0.5),
    look: lookOf(R(0.78, 0.55, 1), R(0.24, 0.18, 0.4), R(0.85, 0.65, 1)),
    earth: { moss: 0.3, energy: 0.8, tone: 0.18 },
    platform: { tone: 0.3, moss: 0.3, hang: 0.6 },
  },
};

let active: Skin = RUINS_SKIN;

/** The skin the generators read now. */
export const skin = (): Skin => active;

/** Paints with a skin: the generators read it for as long as `make` takes (the pieces are drawn one at a time, so it is never read by two). An unknown or missing id is the ruins'. */
export function withSkin<T>(id: unknown, make: () => T): T {
  const previous = active;
  active = (typeof id === 'string' ? SKINS[id] : undefined) ?? RUINS_SKIN;
  try {
    return make();
  } finally {
    active = previous;
  }
}
