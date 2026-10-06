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

/**
 * R3 (docs/PROMPT6-LOG.md S28): the climb to the ledge (a step at 2.4 m, then 4.8 m), the Spirit Bolt card (Interact), back down to the lane, and one
 * bolt at the seal that holds the way on. With nothing but the buttons a person has: the sword cannot break the seal, the bolt can.
 */
export function breakTheSeal(d: Driver): void {
  runTo(d, 21.6);
  jump(d);
  standOn(d, 2.4); // the step
  runTo(d, 26.4);
  jump(d);
  standOn(d, 4.8); // the ledge
  runTo(d, 33.6);
  d.stop();
  d.step(6);
  d.tap('interact'); // the card: equipped, and the ability it teaches
  d.step(16);
  runTo(d, 41.5); // off the east end of the ledge…
  standOn(d, 0); // …and down to the lane
  runTo(d, 52);
  d.stop();
  d.step(6); // facing east, 11 m from the ward: in range of the bolt
  d.tap('ability'); // the Spirit Bolt: 30 magic, and the ward breaks
  d.step(70);
}

/** R1 → R2 → R3 (the card and the seal) → R4 → the end of the world. */
export function playWorld(d: Driver): void {
  toTheEastExit(d, { crouchZones: R1_CROUCH }); // R1: hurdle, pit, crawl, the slime, the door
  arriveIn(d, 'r2_hall');
  toTheEastExit(d, { jumpAt: R2_SPIKES_JUMP }); // R2: down into the ditch, over its spikes, up out of it, the slime beyond
  arriveIn(d, 'r3_chamber');
  breakTheSeal(d); // R3: the climb, the card, the bolt that breaks the ward
  toTheEastExit(d); // …and the lane to the way on
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
