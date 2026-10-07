import type { InputFrame } from '@/input/InputFrame';
import type { Ctx, GameState } from './scenario';

/**
 * RECORD in Node, REPLAY in the browser (S11). A playthrough is recorded by driving the pure simulation with a scripted
 * player (tests/helpers/bot.ts), then replayed through REAL keyboard events in headless Chromium, tick by tick, comparing a
 * digest of the whole simulation state every few ticks. If the browser's input path (keyboard → InputManager → InputFrame →
 * GameSession) or anything between differs from the Node simulation by a single bit, the replay says at which tick.
 *
 * What a person's hands do is the HELD state of nine keys; the browser derives the press and release edges from the changes,
 * exactly as the `Driver` derives them, so a run of identical held states is one set of key events and one `step(n)`. The three
 * keys that are only ever PRESSED (a bottle, Interact — they have no "held" in an `InputFrame`) are held for exactly the tick
 * of their press.
 */
export interface Held {
  right: boolean;
  left: boolean;
  down: boolean;
  jump: boolean;
  attack: boolean;
  dash: boolean;
  ability: boolean;
  bottle: boolean;
  interact: boolean;
}

export const NO_KEYS: Readonly<Held> = { right: false, left: false, down: false, jump: false, attack: false, dash: false, ability: false, bottle: false, interact: false };

export interface Recording {
  /** Runs of identical held states, in order. */
  runs: Array<{ held: Held; ticks: number }>;
  /** The digest of the simulation after `tick` ticks, every `DIGEST_EVERY` ticks and at the end. */
  digests: Array<{ tick: number; digest: string }>;
  total: number;
}

export const DIGEST_EVERY = 50;

/** The held state a frame stands for. */
export function heldOf(f: Readonly<InputFrame>): Held {
  return {
    right: f.move.x > 0.5, left: f.move.x < -0.5, down: f.move.y < -0.5, jump: f.jumpHeld, attack: f.attackHeld, dash: f.dashHeld,
    ability: f.abilityHeld, bottle: f.bottlePressed, interact: f.interactPressed,
  };
}

const KEYS: Readonly<Record<keyof Held, string>> = {
  right: 'KeyD', left: 'KeyA', down: 'KeyS', jump: 'Space', attack: 'KeyJ', dash: 'ShiftLeft', ability: 'KeyK', bottle: 'KeyL', interact: 'KeyE',
};

/**
 * One line that says everything the simulation knows that matters: where the hero is, how it is, what it is doing, the world
 * flags, the exits touched, every enemy, the defeat flow, the room and its transition, and the random generator. A string, so it can be compared and
 * printed. Plain JS in a string: the very same text runs in Node and in the page (no bundler helpers can leak into it).
 */
export const DIGEST_SRC = `
  const f = (n) => n.toFixed(9);
  const p = s.player, b = p.body;
  const parts = [
    't' + s.now,
    'p' + f(b.x) + ',' + f(b.y) + ',' + f(b.vx) + ',' + f(b.vy) + ',' + (b.grounded ? 1 : 0),
    's' + p.controller.state + (p.controller.crouched ? 'c' : ''),
    'h' + p.health.current + (p.invulnerable ? 'i' : ''),
    'f' + s.flags.list().join('+'),
    'e' + [...s.exitsReached].join('+'),
    'r' + s.rng.state,
    'd' + s.death.phase,
    // which room, and where the room transition is (docs/PROMPT6-LOG.md S23)
    'R' + s.room.id,
    'x' + s.transition.phase,
    // the player's resources and what they hold: the magic, each bottle (state and progress), the card, the object with the icon
    'm' + s.magic.current.toFixed(6),
    'b' + s.bottles.slots.map((x) => x.state[0] + x.progress).join(','),
    'c' + (s.loadout.equipped ? s.loadout.equipped.id : '-'),
    'a' + (s.interaction.current ? s.interaction.current.id : '-'),
  ];
  for (const e of s.entities) if (e.kind === 'enemy') parts.push('n' + e.state + ':' + f(e.body.x) + ',' + f(e.body.y) + ':' + e.health.current);
  for (const e of s.entities) if (e.kind === 'projectile') parts.push('j' + f(e.x) + ',' + f(e.y));
  // the boss (docs/PROMPT6-LOG.md S29): what it is doing, where it stands, its life and how far into the state it is
  for (const e of s.entities) if (e.kind === 'guardian') parts.push('g' + e.state + ':' + f(e.body.x) + ',' + f(e.body.y) + ':' + e.health.current + ':' + e.stateTicks + (e.enraged ? 'E' : ''));
  return parts.join('|');
`;
export const digestOf = new Function('s', DIGEST_SRC) as (session: unknown) => string;

/** The structural slice of the `Driver` the recorder needs (so this file does not import the test helpers). */
export interface Recordable {
  onFrame: ((frame: Readonly<InputFrame>) => void) | null;
  session: unknown;
}

/** Runs `play` with the driver while recording what it presses and the state digest every `DIGEST_EVERY` ticks. */
export function record(driver: Recordable, play: () => void): Recording {
  const runs: Recording['runs'] = [];
  const digests: Recording['digests'] = [];
  let total = 0;
  const same = (a: Held, b: Held): boolean => (Object.keys(NO_KEYS) as Array<keyof Held>).every((k) => a[k] === b[k]);
  driver.onFrame = (f) => {
    // the state now is the state after `total` ticks
    if (total > 0 && total % DIGEST_EVERY === 0) digests.push({ tick: total, digest: digestOf(driver.session) });
    const held = heldOf(f);
    const last = runs[runs.length - 1];
    if (last && same(last.held, held)) last.ticks++;
    else runs.push({ held, ticks: 1 });
    total++;
  };
  play();
  driver.onFrame = null;
  digests.push({ tick: total, digest: digestOf(driver.session) });
  return { runs, digests, total };
}

/** The device a replay presses on: the keyboard, or the abstract gamepad of the test hook (the same actions, through the pad's own buttons and stick). */
export type Device = 'keyboard' | 'gamepad';

/** The standard-mapping button of each action that is a button on the pad (docs/GAME-SPEC-2D.md §4.2); left and right are the stick. */
const PAD_BUTTONS: Readonly<Record<Exclude<keyof Held, 'left' | 'right'>, number>> = { down: 13, jump: 0, attack: 2, dash: 1, ability: 3, bottle: 4, interact: 6 };

export interface ReplayOptions {
  /** Largest number of ticks between two looks at the game (the observer sees the state every this many ticks). */
  chunk?: number;
  /** Called after each chunk with the game state and the tick reached. */
  observe?: (state: GameState, tick: number) => Promise<void>;
  /**
   * Which device presses at a given tick (default: the keyboard). It is asked at the START of each run of identical held states, so a hand-over
   * between devices happens where one run ends and another begins — the caller chooses a moment when nothing is held, as a person would.
   */
  device?: (tick: number) => Device;
}

/** Plays a recording through the real keyboard (or the abstract gamepad) and checks every digest. Throws at the first tick that differs. */
export async function replay(ctx: Ctx, rec: Recording, opts: ReplayOptions = {}): Promise<void> {
  const chunk = opts.chunk ?? 4;
  const down = new Set<string>();
  const holdKeys = async (held: Held): Promise<void> => {
    for (const k of Object.keys(KEYS) as Array<keyof Held>) {
      const code = KEYS[k];
      if (held[k] && !down.has(code)) {
        await ctx.page.keyboard.down(code);
        down.add(code);
      } else if (!held[k] && down.has(code)) {
        await ctx.page.keyboard.up(code);
        down.delete(code);
      }
    }
  };
  let padUsed = false;
  const holdPad = async (held: Held): Promise<void> => {
    const buttons = (Object.keys(PAD_BUTTONS) as Array<keyof typeof PAD_BUTTONS>).filter((k) => held[k]).map((k) => PAD_BUTTONS[k]);
    await ctx.page.evaluate(`window.__troid.pad.set(${held.right ? 1 : held.left ? -1 : 0}, 0, ${JSON.stringify(buttons)})`);
    padUsed = true;
  };
  /** Presses `held` on `device` and lets go of everything on the other one. */
  const hold = async (held: Held, device: Device = 'keyboard'): Promise<void> => {
    if (device === 'gamepad') {
      await holdKeys(NO_KEYS);
      await holdPad(held);
    } else {
      if (padUsed) await holdPad(NO_KEYS);
      await holdKeys(held);
    }
  };
  const browserDigest = (): Promise<string> => ctx.page.evaluate(`(function (s) {${DIGEST_SRC}})(window.__troid.session)`) as Promise<string>;

  let tick = 0;
  let next = 0; // index of the next digest to check
  let device: Device = 'keyboard';
  for (const run of rec.runs) {
    device = opts.device?.(tick) ?? 'keyboard';
    await hold(run.held, device);
    let left = run.ticks;
    while (left > 0) {
      const toDigest = (rec.digests[next]?.tick ?? Infinity) - tick;
      const n = Math.max(1, Math.min(left, chunk, toDigest));
      await ctx.step(n);
      tick += n;
      left -= n;
      if (rec.digests[next] && rec.digests[next]!.tick === tick) {
        const got = await browserDigest();
        const want = rec.digests[next]!.digest;
        if (got !== want) throw new Error(`the browser diverged from the simulation at tick ${tick}\n  node:    ${want}\n  browser: ${got}`);
        next++;
      }
      if (opts.observe) await opts.observe(await ctx.state(), tick);
    }
  }
  await hold(NO_KEYS, device);
}
