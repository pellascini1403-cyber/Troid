import { afterEach, describe, expect, it } from 'vitest';
import type { InputFrame } from '@/input/InputFrame';
import { digestOf } from '../../tools/e2e/replay';
import { Runner } from '../helpers/runner';

/**
 * THE SAME GAME ON ANY ENGINE (docs/PROMPT22-LOG.md §5, `src/core/dmath.ts`). The language fixes the result of `+ − × ÷ √` and leaves `Math.sin`, `Math.cos`, `Math.atan2`, `Math.hypot`, `Math.pow`, `Math.exp`… to the engine, and engines differ in the last
 * bit (Node's and Chromium's V8 return a different `Math.sin` for one input in thirty). A simulation that steers a bat by the angle of its flight turns a last bit into a different game: in CI, the whole adventure recorded in Node and played in
 * the Chromium of the runner parted ways at tick 14 400. The simulation does not ask the engine for those functions any more (`core/dmath.ts`); THIS proves it, by the only means there is — playing a whole game with the engine's made different on
 * purpose. A whole adventure (101 887 ticks, the seven zones, the seven guardians) is played once with the engine's own `Math` and its inputs are kept, frame by frame; then the same inputs are played again, from a new game, on an engine whose
 * transcendental functions all answer one unit in the last place off — one way, then the other — and the simulation, every 50 ticks, must be the same one to the last digit.
 */
const REAL = { ...Object.getOwnPropertyDescriptors(Math) };
const EVERY = 50;

/** The transcendental functions of `Math`: what an engine is free to compute its own way (`sqrt`, `abs`, `floor`, `min`, `max`, `round`… are fixed by the language and are not touched). */
const FREE = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot'] as const;

/** A different engine: every free function answers one unit in the last place off, the same way for the same arguments (as an engine would), in the direction `sign` says. */
function otherEngine(sign: 1 | -1): void {
  for (const name of FREE) {
    const real = REAL[name]!.value as (...a: number[]) => number;
    Object.defineProperty(Math, name, {
      configurable: true,
      writable: true,
      value: (...a: number[]): number => {
        const r = real(...a);
        return Number.isFinite(r) && r !== 0 ? r * (1 + sign * Number.EPSILON) : r;
      },
    });
  }
}

const sameEngine = (): void => {
  for (const name of FREE) Object.defineProperty(Math, name, REAL[name]!);
};

afterEach(sameEngine);

interface Journey {
  frames: InputFrame[];
  digests: Map<number, string>;
}

/** The adventure played by the scripted player, with the inputs of every tick and the digest of the simulation every `EVERY` ticks. */
async function play(seed: number): Promise<Journey> {
  const runner = new Runner({ seed });
  const frames: InputFrame[] = [];
  const digests = new Map<number, string>();
  runner.d.onFrame = (f) => {
    if (frames.length % EVERY === 0 && frames.length > 0) digests.set(frames.length, digestOf(runner.d.session));
    frames.push({ ...f, move: { ...f.move } });
  };
  await runner.play();
  runner.d.onFrame = null;
  expect(runner.ended, 'the adventure reached its end').toBe(true);
  digests.set(frames.length, digestOf(runner.d.session));
  return { frames, digests };
}

/** The same inputs, from a new game: where the digests part, if they do. */
function replay(seed: number, journey: Journey): { firstDifference: { tick: number; was: string; now: string } | null } {
  const runner = new Runner({ seed });
  let tick = 0;
  for (const frame of journey.frames) {
    if (tick > 0 && tick % EVERY === 0) {
      const now = digestOf(runner.d.session);
      const was = journey.digests.get(tick);
      if (was !== now) return { firstDifference: { tick, was: was ?? '', now } };
    }
    runner.d.tickFrame(frame);
    tick++;
  }
  const now = digestOf(runner.d.session);
  const was = journey.digests.get(tick);
  return { firstDifference: was === now ? null : { tick, was: was ?? '', now } };
}

describe('the simulation does not depend on the engine\'s own transcendental functions', () => {
  it('a whole adventure played again on an engine whose sin, cos, atan2, hypot, pow, exp… are one unit in the last place off — either way — is the same adventure, digest by digest', async () => {
    const journey = await play(1);
    expect(journey.frames.length, 'a long game').toBeGreaterThan(54_000);
    expect(journey.digests.size).toBeGreaterThan(1000);

    // (the control: the same inputs on the same engine are the same game — the replay itself is sound)
    expect(replay(1, journey).firstDifference).toBeNull();

    for (const sign of [1, -1] as const) {
      otherEngine(sign);
      const sin = Math.sin(1);
      expect(sin, 'the engine really is different now').not.toBe((REAL['sin']!.value as (x: number) => number)(1));
      const outcome = replay(1, journey);
      sameEngine();
      expect(outcome.firstDifference, `on an engine ${sign > 0 ? 'above' : 'below'} the real one`).toBeNull();
    }
  }, 240_000);

  it('the engine really is different when it is made so: the helper changes the answers of the functions it names, and puts them back', () => {
    const before = [Math.sin(0.7), Math.atan2(1, 2), Math.hypot(3, 4.5), Math.pow(1.7, 2.2), Math.exp(0.3)];
    otherEngine(1);
    const during = [Math.sin(0.7), Math.atan2(1, 2), Math.hypot(3, 4.5), Math.pow(1.7, 2.2), Math.exp(0.3)];
    sameEngine();
    const after = [Math.sin(0.7), Math.atan2(1, 2), Math.hypot(3, 4.5), Math.pow(1.7, 2.2), Math.exp(0.3)];
    during.forEach((v, i) => expect(v, `function ${i}`).not.toBe(before[i]));
    expect(after).toEqual(before);
    expect(Math.sqrt(2), 'the functions the language fixes are not touched').toBe(1.4142135623730951);
  });
});
