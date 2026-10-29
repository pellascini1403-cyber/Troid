import { describe, expect, it } from 'vitest';
import { ROOMS } from '@/content';
import { createInputFrame } from '@/input/InputFrame';
import { runBot } from '../../helpers/bot';
import { driver, type Button, type Driver } from '../../helpers/sim';
import { DIGEST_EVERY, DIGEST_SRC, digestOf, heldOf, record, replay, sayableFrames, type Recording } from '../../../tools/e2e/replay';
import type { Ctx, GameState } from '../../../tools/e2e/scenario';

/**
 * The record/replay tooling of the whole-room E2E, tested WITHOUT a browser: a fake "browser" turns key presses into the
 * inputs of a second simulation, which is what Chromium does with the real game. If the recorder, the run-length encoding,
 * the chunking or the digest comparison is wrong, an honest replay fails here instead of in a 10-second E2E run.
 */
const R1 = ROOMS.r1_gate!;
const CROUCH = [[60.5, 77.4]] as const;
const KEY_TO_BUTTON: Record<string, Button> = { Space: 'jump', KeyJ: 'attack', ShiftLeft: 'dash' };

function fresh(): Driver {
  return driver({ room: R1, unlocked: ['dash'] });
}

/** A browser stand-in: keys held → a second Driver's inputs; `evaluate` runs the digest source against its session. */
function fakeBrowser(): { ctx: Ctx; steps: number[] } {
  const d = fresh();
  const down = new Set<string>();
  const steps: number[] = [];
  const ctx = {
    page: {
      keyboard: { down: async (c: string) => void down.add(c), up: async (c: string) => void down.delete(c) },
      evaluate: async (src: string) => new Function('window', `return ${src}`)({ __troid: { session: d.session } }),
    },
    step: async (n: number) => {
      steps.push(n);
      for (let i = 0; i < n; i++) {
        d.moveX = (down.has('KeyD') ? 1 : 0) - (down.has('KeyA') ? 1 : 0);
        d.moveY = down.has('KeyS') ? -1 : 0;
        for (const [code, button] of Object.entries(KEY_TO_BUTTON)) (down.has(code) ? d.press(button) : d.release(button));
        d.step(1);
      }
    },
    state: async () => ({ x: d.body.x }) as unknown as GameState,
  } as unknown as Ctx;
  return { ctx, steps };
}

function recordRun(ticks = 520): Recording {
  const d = fresh();
  return record(d, () => {
    runBot(d, { crouchZones: CROUCH, engage: 0, dashAt: 20, until: () => d.session.now >= ticks, maxTicks: ticks + 10 });
    d.release('jump');
    d.release('dash');
    d.stop();
  });
}

describe('recording', () => {
  it('records runs of held keys that add up to the ticks played, and no two neighbours are alike', () => {
    const rec = recordRun();
    expect(rec.runs.reduce((n, r) => n + r.ticks, 0)).toBe(rec.total);
    expect(rec.total).toBeGreaterThanOrEqual(520);
    expect(rec.runs.length).toBeGreaterThan(3); // it ran, jumped and dashed
    for (let i = 1; i < rec.runs.length; i++) expect(rec.runs[i]!.held).not.toEqual(rec.runs[i - 1]!.held);
  });

  it('takes a digest every DIGEST_EVERY ticks and one at the end', () => {
    const rec = recordRun();
    const ticks = rec.digests.map((d) => d.tick);
    for (let i = 0; i < ticks.length - 1; i++) expect(ticks[i]).toBe((i + 1) * DIGEST_EVERY);
    expect(ticks[ticks.length - 1]).toBe(rec.total);
  });

  it('is reproducible: the same play records the same runs and digests', () => {
    expect(recordRun()).toEqual(recordRun());
  });

  it('heldOf reads the keys a frame stands for (a keyboard\'s clamped diagonal still counts as both)', () => {
    const base = { move: { x: 0, y: 0 }, jumpHeld: false, attackHeld: false, dashHeld: false, abilityHeld: false, attackPressed: false, dashPressed: false, abilityPressed: false, bottlePressed: false, interactPressed: false } as Parameters<typeof heldOf>[0];
    const none = { ability: false, bottle: false, interact: false };
    expect(heldOf({ ...base, move: { x: 0.7071, y: -0.7071 }, jumpHeld: true })).toEqual({ right: true, left: false, down: true, jump: true, attack: false, dash: false, ...none, ax: 0.7071, ay: -0.7071 });
    expect(heldOf({ ...base, move: { x: -1, y: 0 }, attackHeld: true, dashHeld: true })).toEqual({ right: false, left: true, down: false, jump: false, attack: true, dash: true, ...none, ax: -1, ay: 0 });
  });

  it('heldOf keeps the stick to the last digit (a scripted run walks slowly) and counts a button that was only PRESSED as held (a key that goes down is both)', () => {
    const base = { move: { x: 0, y: 0 }, jumpHeld: false, attackHeld: false, dashHeld: false, abilityHeld: false, attackPressed: false, dashPressed: false, abilityPressed: false, bottlePressed: false, interactPressed: false } as Parameters<typeof heldOf>[0];
    const walking = heldOf({ ...base, move: { x: 0.25, y: 0 } });
    expect(walking.ax).toBe(0.25);
    expect(walking.right, 'a quarter of a stick is not the right key').toBe(false);
    expect(heldOf({ ...base, dashPressed: true }).dash).toBe(true);
    expect(heldOf({ ...base, attackPressed: true }).attack).toBe(true);
    expect(heldOf({ ...base, abilityPressed: true }).ability).toBe(true);
  });
});

describe('the digest', () => {
  it('says the same thing about the same state and something else once anything moves', () => {
    const d = fresh();
    expect(digestOf(d.session)).toBe(digestOf(d.session));
    const before = digestOf(d.session);
    d.step(1);
    expect(digestOf(d.session)).not.toBe(before);
  });

  it('includes the hero, the enemies, the flags, the exits, the random generator and the defeat flow', () => {
    const digest = digestOf(fresh().session);
    for (const part of ['t0', 'p4.', 'sfree', 'h5', 'f|', 'e|', 'r', 'dnone', 'nidle:96.']) expect(digest, part).toContain(part);
  });

  it('is plain JS text that runs the same in the page as in Node', () => {
    const d = fresh();
    d.step(5);
    const inPage = new Function('window', `return (function (s) {${DIGEST_SRC}})(window.__troid.session)`)({ __troid: { session: d.session } });
    expect(inPage).toBe(digestOf(d.session));
  });
});

describe('replaying through a (fake) browser', () => {
  it('an honest replay matches the digest at every checkpoint and sees every chunk', async () => {
    const rec = recordRun();
    const { ctx } = fakeBrowser();
    const seen: number[] = [];
    await replay(ctx, rec, { chunk: 4, observe: async (_s, tick) => void seen.push(tick) });
    expect(seen[seen.length - 1]).toBe(rec.total);
    expect(seen.every((t, i) => i === 0 || t > seen[i - 1]!)).toBe(true);
  });

  it('steps in chunks no larger than asked, and never across a checkpoint', async () => {
    const rec = recordRun();
    const { ctx, steps } = fakeBrowser();
    await replay(ctx, rec, { chunk: 7 });
    expect(Math.max(...steps)).toBeLessThanOrEqual(7);
    expect(steps.reduce((a, b) => a + b, 0)).toBe(rec.total);
    // every checkpoint tick is the end of some step
    let tick = 0;
    const ends = new Set<number>();
    for (const n of steps) ends.add((tick += n));
    for (const d of rec.digests) expect(ends.has(d.tick), `checkpoint ${d.tick}`).toBe(true);
  });

  it('a replay that does something different from the recording is caught, at the tick where it happens', async () => {
    const rec = recordRun();
    const jumpRun = rec.runs.findIndex((r) => r.held.jump);
    expect(jumpRun).toBeGreaterThanOrEqual(0); // the recording jumps (the hurdle)
    // the same run with the jump taken out: the browser would not clear the hurdle
    const tampered: Recording = { ...rec, runs: rec.runs.map((r, i) => (i === jumpRun ? { ...r, held: { ...r.held, jump: false } } : r)) };
    const { ctx } = fakeBrowser();
    await expect(replay(ctx, tampered, { chunk: 4 })).rejects.toThrow(/diverged from the simulation at tick \d+/);
  });

  it('the failure message shows both digests so the difference can be read', async () => {
    const rec = recordRun();
    const bad: Recording = { ...rec, digests: rec.digests.map((d, i) => (i === 0 ? { ...d, digest: d.digest.replace('p', 'P') } : d)) };
    const { ctx } = fakeBrowser();
    await expect(replay(ctx, bad)).rejects.toThrow(/node: .*\n\s+browser: /);
  });

  it('releases every key when it is done', async () => {
    const rec = recordRun();
    const downNow = new Set<string>();
    const { ctx } = fakeBrowser();
    const page = ctx.page as unknown as { keyboard: { down: (c: string) => Promise<void>; up: (c: string) => Promise<void> } };
    const origDown = page.keyboard.down;
    const origUp = page.keyboard.up;
    page.keyboard.down = async (c) => (downNow.add(c), origDown(c));
    page.keyboard.up = async (c) => (downNow.delete(c), origUp(c));
    await replay(ctx, rec);
    expect([...downNow]).toEqual([]);
  });
});

describe('what a recording of held keys cannot say', () => {
  const run = (play: (d: Driver) => void): Array<string | null> => {
    const d = fresh();
    const say = sayableFrames();
    const seen: Array<string | null> = [];
    d.onFrame = (f) => void seen.push(say(f));
    play(d);
    return seen;
  };

  it('is silent about what a keyboard can do: keys that go down, are held and come up, a tap, a tap again after a tick without it', () => {
    const seen = run((d) => {
      d.press('jump').step(3);
      d.release('jump').step(1);
      d.press('attack').press('dash').step(2);
      d.release('attack').release('dash').step(1);
      d.tap('bottle').step(1);
      d.tap('bottle').step(1);
      d.tap('interact').step(1);
    });
    expect(seen.filter((x) => x !== null)).toEqual([]);
  });

  it('names the tick in which a key comes up and goes down again inside one tick: the page would see a key held, and lose the second press', () => {
    const seen = run((d) => {
      d.press('jump').step(2);
      d.release('jump').press('jump').step(1);
      d.release('jump').step(1);
    });
    expect(seen.map((x) => x !== null)).toEqual([false, false, true, false]);
    expect(seen[2]).toContain('jump key came up and went down again inside one tick');
  });

  it('names a bottle or Interact pressed on two ticks in a row (the page holds the key for the tick: one press), the drop key (not in a recording), and a key held that nobody pressed', () => {
    expect(run((d) => d.tap('bottle').tap('bottle')).filter((x) => x !== null)).toHaveLength(1);
    expect(run((d) => d.tap('interact').tap('interact')).filter((x) => x !== null)).toHaveLength(1);
    expect(run((d) => d.tap('drop')).filter((x) => x !== null)[0]).toContain('drop key');
    const say = sayableFrames();
    const f = createInputFrame();
    f.jumpHeld = true; // held, and the tick before it was not: nobody pressed it
    expect(say(f)).toContain('jump key is held but nobody pressed it');
  });

  it('is what `record` enforces: a run that cannot be replayed by a keyboard is refused at the tick it happens, not found thirty thousand ticks later', () => {
    const d = fresh();
    expect(() =>
      record(d, () => {
        d.press('jump').step(2);
        d.release('jump').press('jump').step(1);
      }),
    ).toThrow(/cannot be replayed by a keyboard: at tick 2, the jump key came up and went down again inside one tick/);
  });
});

