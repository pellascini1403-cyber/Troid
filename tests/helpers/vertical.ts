import { ROOMS } from '@/content';
import { runBot } from './bot';
import { driver, type Driver } from './sim';

/**
 * The two playthroughs of R1 that S19 uses (docs/PROMPT5-LOG.md): a WIN with every system of Prompt 5 and a DEFEAT. They are
 * scripts for the pure simulation — `tests/integration/vertical.test.ts` asserts on them and `tools/e2e/scenarios/vertical.ts`
 * RECORDS them and replays them through the real keyboard of a browser, tick by tick. One source, so what the test proves and what
 * the browser plays cannot drift apart.
 *
 * Since S28 the Spirit Bolt is no longer found in R1 (it lies in R3, where the seal is that only it breaks): the hero of these runs is the
 * one that comes BACK to R1 with the card already won — `freshR1WithBolt` — and R1 is, as the world now has it, a room with nothing to pick up.
 */

/** The low roof of the crawl tunnel in R1 (x from … to …): the bot crouches inside it. */
export const R1_CROUCH = [[60.5, 77.4]] as const;

/**
 * A new game in R1 with the Dash taught (the unlock the room's first jump section asks for). It has the WHOLE world, like the game in
 * the browser: the exit of R1 leads to R2, so the run that is recorded here and the one that is replayed there agree to the tick.
 */
export function freshR1(): Driver {
  return driver({ room: ROOMS.r1_gate!, unlocked: ['dash'], extra: { rooms: ROOMS } });
}

/**
 * The hero as they come back to R1 once the Spirit Bolt of R3 is theirs: the card equipped, the ability it teaches and the flag that
 * remembers it. The browser gets the same hero with `giveTheBolt` before tick 0 (the digest includes both).
 */
export function freshR1WithBolt(): Driver {
  const d = freshR1();
  d.session.loadout.acquire('card_spirit_bolt');
  d.session.flags.set(BOLT_FLAG);
  return d;
}
export const BOLT_FLAG = 'taken:card_spirit_bolt';
/** What a page runs to make its hero the one of `freshR1WithBolt` (`window.__troid.session` is the `s` of the code). */
export const GIVE_THE_BOLT = `s.loadout.acquire("card_spirit_bolt"); s.flags.set("${BOLT_FLAG}");`;

/** Lets go of everything the bot may be holding. */
export function letGo(d: Driver): void {
  d.release('jump');
  d.release('attack');
  d.release('dash');
  d.stop();
}

/** To the slime's arena, through the hurdle, the pit and the crawl tunnel (crouched all the way: there is nothing in it any more), and stop. */
export function toTheArena(d: Driver, x: number): void {
  runBot(d, { crouchZones: R1_CROUCH, engage: 0, dashAt: 48, until: () => d.body.x >= x, maxTicks: 4500 });
  letGo(d);
}

/** The whole room with the magic, a bottle, the door and the exit. */
export function playWin(d: Driver): void {
  toTheArena(d, 86.5);
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
  d.step(5); // the exit has started the transition to R2 (it swaps rooms 11 ticks in): the run ends while R1 is still fading out
}

/** A bottle, and the slime wins; the run ends once the screen has faded back in at the entrance. */
export function playDefeat(d: Driver): void {
  toTheArena(d, 88);
  d.until(() => d.p.health.current < 5, 1200); // the first lunge lands
  d.step(16); // the knock-back is over; the slime is recovering (36 ticks): the window to drink
  d.tap('bottle');
  d.step(26);
  d.until(() => d.p.health.dead, 3000); // and then it wins
  d.until(() => d.session.death.phase === 'fadeIn', 600);
  d.step(60);
}
