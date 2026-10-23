/**
 * The credits roll by themselves (docs/PROMPT20-LOG.md): after a moment's calm they scroll at a walking pace to the end, and the first thing the player does with them — a wheel, a finger, a key —
 * stops that for good. Pure: where the roll has got to, given how long it has gone on.
 */
export interface Roll {
  /** Milliseconds of stillness before it begins. */
  delayMs: number;
  /** Pixels per second. */
  speed: number;
  /** The most it can scroll (the end of the credits). */
  max: number;
}

export const CREDITS_ROLL = { delayMs: 1800, speed: 26 } as const;

/** How far down the credits are `elapsedMs` after the screen opened: nothing during the delay, then a steady pace, never past the end. */
export function rollOffset(elapsedMs: number, roll: Roll): number {
  const moving = elapsedMs - roll.delayMs;
  if (!(moving > 0) || !(roll.max > 0)) return 0;
  return Math.min(roll.max, (moving / 1000) * roll.speed);
}
