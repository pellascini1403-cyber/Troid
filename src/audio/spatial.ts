/**
 * WHERE A SOUND IS (docs/PROMPT18-LOG.md): the hero's ears are the camera, so a sound is heard from the side it happened on and quieter the farther it was. Pure arithmetic — the engine turns the two numbers into a
 * stereo pan and a gain.
 *
 * The room of the game is wide (a corridor of a hundred metres) and the camera shows about twenty-four across: everything that happens on the screen is heard at full strength, and the sound of what is beyond it fades
 * to a third. A sound is never panned all the way to one ear (a hard pan is a headphone trick, not a place) and never fades to nothing: a danger that is far away is still a danger.
 */
export interface Spatial {
  /** −1 (left) … 1 (right). */
  pan: number;
  /** 0 … 1. */
  gain: number;
}

/** Up to here a sound is at full strength (metres); from here to `FAR` it fades. */
export const NEAR = 9;
export const FAR = 48;
/** The quietest a positional sound gets. */
export const FLOOR = 0.32;
/** How far to a side a sound has to be to be panned to the limit (metres), and how far to that side the limit is. */
export const PAN_SPAN = 16;
export const PAN_LIMIT = 0.8;

/** `dx`, `dy`: the sound's place minus the listener's, in metres. */
export function spatialOf(dx: number, dy: number): Spatial {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { pan: 0, gain: 1 };
  const d = Math.hypot(dx, dy);
  const gain = d <= NEAR ? 1 : Math.max(FLOOR, 1 - ((d - NEAR) / (FAR - NEAR)) * (1 - FLOOR));
  const pan = Math.max(-1, Math.min(1, dx / PAN_SPAN)) * PAN_LIMIT;
  return { pan, gain };
}

export const dbToGain = (db: number): number => 10 ** (db / 20);
export const centsToRate = (cents: number): number => 2 ** (cents / 1200);
