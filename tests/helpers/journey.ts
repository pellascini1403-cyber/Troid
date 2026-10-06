import { ROOMS } from '@/content';
import { runBot } from './bot';
import { driver, type Driver } from './sim';
import { letGo, R1_CROUCH } from './vertical';

/**
 * The whole world, front to back, by a scripted player (docs/PROMPT6-LOG.md S23): R1 with its slime, R2 by the low road, R3's lane and
 * R4 to the end of the world, through the real room transitions. `tests/integration/worldJourney.test.ts` asserts on it and
 * `tools/e2e/scenarios/world.ts` RECORDS it and replays it through the real keyboard of a browser, tick by tick: one source, so what
 * the test proves and what the browser plays cannot drift apart.
 */

/** Where the bot takes off to clear the spikes of R2's ditch: the middle of the ≈ 0.25 s window a running jump has (x from 37 to 38.5 m). */
export const R2_SPIKES_JUMP = [37.6] as const;

/** A new game: the whole world, R1, the Dash taught. */
export function freshWorld(seed = 1): Driver {
  return driver({ room: ROOMS.r1_gate!, unlocked: ['dash'], seed, extra: { rooms: ROOMS } });
}

/** Waits (hands off) for the transition that the last exit started to finish in `room`, then a little more. */
export function arriveIn(d: Driver, room: string): void {
  d.until(() => d.session.room.id === room && !d.session.transition.active, 200);
  d.step(10);
}

/** Walks to the exit named `east` of the current room by the bot's rules (it fights what it meets, jumps what blocks it). */
export function toTheEastExit(d: Driver, opts: Parameters<typeof runBot>[1] = {}): void {
  runBot(d, { until: () => d.session.exitsReached.has('east'), maxTicks: 6000, ...opts });
  letGo(d);
}

/** R1 → R2 → R3 → R4 → the end of the world. */
export function playWorld(d: Driver): void {
  toTheEastExit(d, { crouchZones: R1_CROUCH }); // R1: hurdle, pit, crawl, the slime, the door
  arriveIn(d, 'r2_hall');
  toTheEastExit(d, { jumpAt: R2_SPIKES_JUMP }); // R2: down into the ditch, over its spikes, up out of it, the slime beyond
  arriveIn(d, 'r3_chamber');
  toTheEastExit(d); // R3: the lane
  arriveIn(d, 'r4_sanctum');
  toTheEastExit(d); // R4: the way out of the world
  d.step(20);
}
