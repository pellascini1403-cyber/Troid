import type { Driver } from './sim';

/**
 * Small moves for walking a room by hand, with the same inputs a person has: run to a spot, jump, wait to land on a given height.
 * `runBot` walks a room from left to right and jumps what blocks it; a route that needs a CHOICE (the high road of a fork, a ledge)
 * is a few of these in a row.
 */

/** Holds a direction until the body has reached `x` (from either side). The direction stays held. */
export function runTo(d: Driver, x: number, max = 1200): void {
  const dir = d.body.x < x ? 1 : -1;
  if (dir > 0) d.right();
  else d.left();
  d.until(() => (dir > 0 ? d.body.x >= x : d.body.x <= x), max);
}

/** A full jump: the button held for `hold` ticks (a short hold is a short hop). The direction is kept. */
export function jump(d: Driver, hold = 24): void {
  d.press('jump');
  d.step(hold);
  d.release('jump');
}

/** Waits (the direction still held) until the body stands on something at height `y`, then lets go of the stick. */
export function standOn(d: Driver, y: number, max = 240): void {
  d.until(() => d.body.grounded && Math.abs(d.body.y - y) < 0.05, max);
  d.stop();
}
