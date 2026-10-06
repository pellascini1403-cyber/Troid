import { ROOMS } from '@/content';
import { runBot } from './bot';
import { driver, type Driver } from './sim';

/**
 * The two playthroughs of R1 that S19 uses (docs/PROMPT5-LOG.md): a WIN with every system of Prompt 5 and a DEFEAT. They are
 * scripts for the pure simulation — `tests/integration/vertical.test.ts` asserts on them, and `tools/e2e/scenarios/vertical.ts`
 * RECORDS them and replays them through the real keyboard of a browser, tick by tick. One source, so what the test proves and what
 * the browser plays cannot drift apart.
 */

/** The low roof of the crawl tunnel in R1 (x from … to …): the bot crouches inside it. */
export const R1_CROUCH = [[60.5, 77.4]] as const;

/** A new game in R1 with the Dash taught (the unlock the room's first jump section asks for). */
export function freshR1(): Driver {
  return driver({ room: ROOMS.r1_gate!, unlocked: ['dash'] });
}

/** Lets go of everything the bot may be holding. */
export function letGo(d: Driver): void {
  d.release('jump');
  d.release('attack');
  d.release('dash');
  d.stop();
}

/** To the middle of the crawl tunnel, crouched, 1.3 m from the card. */
export function toTheCard(d: Driver): void {
  runBot(d, { crouchZones: R1_CROUCH, engage: 0, dashAt: 48, until: () => d.body.x >= 73.2, maxTicks: 3000 });
  letGo(d);
  d.step(12);
}

/** The whole room with the card, the magic, a bottle, the door and the exit. */
export function playWin(d: Driver): void {
  toTheCard(d);
  d.tap('interact'); // the card
  d.step(14);
  runBot(d, { crouchZones: R1_CROUCH, engage: 0, until: () => d.body.x >= 86.5, maxTicks: 1500 });
  letGo(d);
  d.until(() => d.p.health.current < 5, 1200); // stand still: the slime winds up and its lunge lands
  d.step(30);
  for (let i = 0; i < 4 && !d.session.flags.has('defeated:r1_slime'); i++) {
    d.tap('ability'); // the Spirit Bolt: 30 magic, two points of damage each
    d.step(22);
  }
  d.until(() => d.session.flags.has('defeated:r1_slime'), 300);
  d.step(30);
  d.tap('bottle'); // hurt: drink
  d.step(26);
  runBot(d, { crouchZones: R1_CROUCH, until: () => d.session.exitsReached.has('east'), maxTicks: 1500 });
  letGo(d);
  d.step(10);
}

/** The card, a bottle, and the slime wins; the run ends once the screen has faded back in at the entrance. */
export function playDefeat(d: Driver): void {
  toTheCard(d);
  d.tap('interact');
  d.step(14);
  runBot(d, { crouchZones: R1_CROUCH, engage: 0, until: () => d.body.x >= 88, maxTicks: 1500 });
  letGo(d);
  d.until(() => d.p.health.current < 5, 1200); // the first lunge lands
  d.step(16); // the knock-back is over; the slime is recovering (36 ticks): the window to drink
  d.tap('bottle');
  d.step(26);
  d.until(() => d.p.health.dead, 3000); // and then it wins
  d.until(() => d.session.death.phase === 'fadeIn', 600);
  d.step(60);
}
