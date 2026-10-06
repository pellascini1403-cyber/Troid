import { ROOMS } from '@/content';
import { runBot } from './bot';
import { jump, runTo, standOn } from './hops';
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

/**
 * R2's high road to the ledge and the fourth bottle (docs/PROMPT6-LOG.md S27): the hops of the road — the first three platforms — then a
 * standing jump from under the ledge, and Interact. With nothing but the buttons a person has: `tools/e2e/scenarios/bottle4.ts` records
 * it here and replays it through the real keyboard of a browser, and `bottleFourth.test.ts` proves the same route in the simulation.
 */
export function fetchTheFourthBottle(d: Driver): void {
  runTo(d, 25.6);
  jump(d);
  standOn(d, 2.4); // p1
  runTo(d, 32.3);
  jump(d);
  standOn(d, 2.4); // p2
  runTo(d, 40.3);
  jump(d);
  standOn(d, 2.4); // p3 (a full jump from the edge of p2 lands on it, not on the ledge above its far end)
  runTo(d, 49.6);
  d.stop();
  d.step(4);
  jump(d); // straight up under the ledge: 3.1 m from a platform 2.4 m high is above its 4.8 m
  standOn(d, 4.8);
  d.step(4);
  d.tap('interact');
  d.step(20);
}
