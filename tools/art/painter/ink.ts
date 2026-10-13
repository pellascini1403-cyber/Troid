import { surface, writePixels, type Surface } from './canvas';
import { hex, ramp, type Rgb } from './color';
import { DAY, shade, type Layers, type Look } from './light';

/**
 * THE INK (docs/PROMPT8-LOG.md phases F and G): the one material the Ink Warden, its pool and the Ink Slimes are made of, so that the creatures of the Sanctum and the thing that leaks from it agree. Wet ink is
 * near black with a cold violet where the light catches it; violet is the colour of what hurts the hero (docs/GAME-SPEC-2D.md §3.4) and it is the colour of every piece made of this.
 */
export const VIOLET: Rgb = hex('#9a5cff');
export const VIOLET_HOT: Rgb = hex('#d3b8ff');

/** Wet ink: near black, a cold violet where the light catches it. */
export const INK = ramp([
  { at: 0, colour: [0.01, 0.008, 0.025] },
  { at: 0.3, colour: [0.03, 0.024, 0.07] },
  { at: 0.6, colour: [0.1, 0.075, 0.2] },
  { at: 1, colour: [0.4, 0.31, 0.66] },
]);

/** The one light of the game, bent toward violet: ink is lit by what is round it, and the rim of a wet thing is bright. */
export const INK_LOOK: Look = { ...DAY, key: [0.7, 0.52, 1.0], ambient: [0.16, 0.12, 0.34], rim: 1.0, rimColour: [0.72, 0.58, 1.0], cavity: 0.5, exposure: 1.1 };

export const rgba = (c: Rgb, a: number): string => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

/** The layers of a piece of ink, lit. */
export const lightInk = (layers: Layers, look: Look = INK_LOOK): Surface => {
  const s = surface(layers.w, layers.h);
  writePixels(s, shade(layers, look, false));
  return s;
};
