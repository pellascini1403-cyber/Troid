import { describe, expect, it } from 'vitest';
import { createPlayerStatus, type PlayerStatus } from '@/gameplay/PlayerStatus';
import { BOTTLE_FADE_SECONDS, EDGE_SECONDS, HudModel, MAX_STEP_SECONDS, percentOf, SHAKE_SECONDS, WEAR_SECONDS } from '@/ui/hud/HudModel';

/**
 * The HUD as a pure model (docs/PROMPT17-LOG.md): a PlayerStatus in, a HudState out, with the short transients of the interface — where the picture of a bar is on its way to the number, the white rectangle of what was
 * just lost, the dark of a bottle that was drunk, the shake of a refused cast. No DOM, no simulation. The numbers in it are the simulation's, this frame: never animated.
 */
function status(patch: (s: PlayerStatus) => void = () => {}): PlayerStatus {
  const s = createPlayerStatus();
  s.life.current = 5;
  s.life.max = 5;
  s.magic.current = 100;
  s.magic.max = 100;
  s.bottles = [0, 1, 2].map(() => ({ state: 'ready' as const, fill01: 1, iconId: 'bottle', secondsLeft: 0 }));
  patch(s);
  return s;
}
const FRAME = 1 / 60;
const life = (n: number) => (s: PlayerStatus) => void (s.life.current = n);
const magic = (n: number) => (s: PlayerStatus) => void (s.magic.current = n);
/** Runs the model for `seconds` of frames on the same status, returning the last state. */
function run(m: HudModel, patch: (s: PlayerStatus) => void, seconds: number) {
  let s = m.state;
  for (let t = 0; t < seconds - 1e-9; t += FRAME) s = m.update(status(patch), FRAME) as typeof s;
  return s;
}

describe('the number a bar writes', () => {
  it('is the whole percentage of the bar: 100 only when it is full, 0 only when it is empty, never 0 for a bar that has something left', () => {
    expect([5, 4, 3, 2, 1, 0].map((n) => percentOf(n, 5))).toEqual([100, 80, 60, 40, 20, 0]);
    expect(percentOf(100, 100)).toBe(100);
    expect(percentOf(99.9, 100)).toBe(99);
    expect(percentOf(70, 100)).toBe(70);
    expect(percentOf(70.9, 100)).toBe(70);
    expect(percentOf(0.4, 100), 'a little is not nothing').toBe(1);
    expect(percentOf(1, 1000)).toBe(1);
    expect(percentOf(999, 1000)).toBe(99);
  });

  it('is exact where a division would not be: 29 of 100 is 29 and 7 of 100 is 7', () => {
    for (let n = 1; n < 100; n++) expect(percentOf(n, 100), `${n} of 100`).toBe(n);
    expect(percentOf(29 / 1000, 1 / 1000)).toBe(100);
  });

  it('never leaves 0 … 100: more than the maximum is 100, less than nothing is 0, and a bar with no maximum says 0', () => {
    expect(percentOf(7, 5)).toBe(100);
    expect(percentOf(-3, 5)).toBe(0);
    expect(percentOf(3, 0)).toBe(0);
    expect(percentOf(Number.NaN, 5)).toBe(0);
    expect(percentOf(3, Number.NaN)).toBe(0);
  });

  it('follows a maximum that is not 5: with a sixth point of life one point is 17 per cent and six are 100', () => {
    expect(percentOf(6, 6)).toBe(100);
    expect(percentOf(5, 6)).toBe(83);
    expect(percentOf(1, 6)).toBe(16);
  });
});

describe('a bar: the numbers are the simulation\'s, the picture follows them', () => {
  it('starts where it is: the first time it is read its picture is already at the number, with nothing to mark', () => {
    const m = new HudModel();
    const s = m.update(status(life(2)), FRAME);
    expect(s.life.fraction).toBe(0.4);
    expect([s.life.edge, s.life.wear]).toEqual([0.4, 0.4]);
    expect(s.life.percent).toBe(40);
    expect([s.life.current, s.life.max]).toEqual([2, 5]);
  });

  it('a new game: 100 of life and 100 of magic, full bars, nothing to mark', () => {
    const s = new HudModel().update(status(), FRAME);
    expect([s.life.percent, s.magic.percent]).toEqual([100, 100]);
    expect([s.life.fraction, s.magic.fraction, s.life.edge, s.magic.edge, s.life.wear, s.magic.wear]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('the number changes in the very update the value does — even when no time has passed (the game waits) — and the picture does not move until time does', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    const s = m.update(status(life(3)), 0);
    expect(s.life.percent).toBe(60);
    expect(s.life.current).toBe(3);
    expect(s.life.edge).toBe(1);
    expect(s.life.fraction).toBe(0.6);
  });

  it('the picture reaches the number in a fraction of a second and then IS the number (no creeping)', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    let s = m.update(status(life(4)), FRAME);
    expect(s.life.edge).toBeLessThan(1);
    expect(s.life.edge).toBeGreaterThan(0.8);
    s = run(m, life(4), EDGE_SECONDS * 3);
    expect(Math.abs(s.life.edge - 0.8)).toBeLessThan(0.2 * 0.06); // 95 % of the way after three time constants
    s = run(m, life(4), EDGE_SECONDS * 8);
    expect(s.life.edge).toBe(0.8);
  });

  it('losing life: the white rectangle trails the picture — it stretches behind it by about half of what was lost at the most, and shrinks smoothly back to nothing; no jump, no hold', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    const lost = 0.4; // 5 → 3 of 5
    let widest = 0;
    let widestAt = 0;
    let frame = 0;
    let last = 0;
    let rising = true;
    for (let t = 0; t < 1.5; t += FRAME) {
      const s = m.update(status(life(3)), FRAME);
      const width = s.life.wear - s.life.edge;
      expect(width, 'never behind the picture').toBeGreaterThanOrEqual(0);
      expect(s.life.wear, 'it only ever comes forward, after the picture').toBeLessThanOrEqual(1);
      if (width > last + 1e-12) expect(rising, 'it grows once and then shrinks: it never grows again').toBe(true);
      else if (width < last - 1e-12) rising = false;
      expect(width - last, 'no jump: it changes by a small step each frame').toBeLessThan(0.3 * lost);
      last = width;
      if (width > widest) {
        widest = width;
        widestAt = frame;
      }
      frame++;
    }
    expect(widestAt, 'it takes several frames to get to its widest: it does not pop').toBeGreaterThanOrEqual(4);
    expect(widest, 'it did stretch').toBeGreaterThan(0.2 * lost);
    expect(widest, 'by about half of what was lost at the most').toBeLessThan(0.7 * lost);
    expect([m.state.life.edge, m.state.life.wear], 'and it ends at nothing').toEqual([0.6, 0.6]);
  });

  it('the trail is slower than the picture: its time constant is WEAR_SECONDS against EDGE_SECONDS, and it is the same for a big loss as for a small one (a share of it)', () => {
    expect(WEAR_SECONDS).toBeGreaterThan(EDGE_SECONDS);
    const widest = (to: number): number => {
      const m = new HudModel();
      m.update(status((s) => ((s.life.max = 100), (s.life.current = 100))), FRAME);
      let w = 0;
      for (let t = 0; t < 1.5; t += FRAME) {
        const s = m.update(status((x) => ((x.life.max = 100), (x.life.current = to))), FRAME);
        w = Math.max(w, s.life.wear - s.life.edge);
      }
      return w;
    };
    expect(widest(80) / 0.2).toBeCloseTo(widest(40) / 0.6, 1);
  });

  it('what is lost on top of what was lost goes on trailing the picture: the rectangle follows the latest edge and ends where the bar does', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.update(status(life(4)), FRAME);
    let s = run(m, life(2), 0.05);
    expect(s.life.wear).toBeGreaterThan(s.life.edge);
    expect(s.life.percent).toBe(40);
    s = run(m, life(2), 1.5);
    expect([s.life.edge, s.life.wear]).toEqual([0.4, 0.4]);
  });

  it('getting life back moves the picture forward with no white rectangle: it is never behind the bar and there is nothing lost to mark', () => {
    const m = new HudModel();
    m.update(status(life(2)), FRAME);
    for (let t = 0; t < 30; t++) {
      const s = m.update(status(life(5)), FRAME);
      expect(s.life.wear).toBe(s.life.edge);
      expect(s.life.edge).toBeGreaterThanOrEqual(0.4);
      expect(s.life.edge).toBeLessThanOrEqual(1);
    }
    expect(m.state.life.edge).toBe(1);
    expect(m.state.life.percent).toBe(100);
  });

  it('the white rectangle is never behind the picture of the bar (wear ≥ edge), and neither is ever outside 0 … 1', () => {
    const m = new HudModel();
    const values = [5, 4, 4, 1, 5, 2, 0, 3, 5, 5, 0, 0, 2];
    for (let i = 0; i < 400; i++) {
      const s = m.update(status(life(values[(i / 7) | 0 % values.length] ?? 5)), FRAME);
      for (const b of [s.life, s.magic]) {
        expect(b.wear).toBeGreaterThanOrEqual(b.edge - 1e-12);
        expect(b.edge).toBeGreaterThanOrEqual(0);
        expect(b.edge).toBeLessThanOrEqual(1);
        expect(b.wear).toBeLessThanOrEqual(1);
        expect(b.percent).toBeGreaterThanOrEqual(0);
        expect(b.percent).toBeLessThanOrEqual(100);
      }
    }
  });

  it('nothing moves while the game waits (dt 0): the picture, the white rectangle and the bottles stay where they were, and the number is still the real one', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.update(status(life(2)), FRAME);
    const before = { edge: m.state.life.edge, wear: m.state.life.wear };
    for (let i = 0; i < 50; i++) m.update(status(life(2)), 0);
    expect(m.state.life.edge).toBe(before.edge);
    expect(m.state.life.wear).toBe(before.wear);
    expect(m.state.life.percent).toBe(40);
  });

  it('a long frame (a slow device, a hitch, a tab that was hidden) moves the transients no further than MAX_STEP_SECONDS: the picture still goes by the places in between, the next frames finish it, and the number is the real one at once', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    const s = m.update(status(life(1)), 30);
    expect([s.life.current, s.life.percent, s.life.fraction], 'the number does not wait for the picture').toEqual([1, 20, 0.2]);
    const reference = new HudModel();
    reference.update(status(), FRAME);
    const r = reference.update(status(life(1)), MAX_STEP_SECONDS);
    expect([s.life.edge, s.life.wear], 'the same as a frame of MAX_STEP_SECONDS').toEqual([r.life.edge, r.life.wear]);
    expect(s.life.edge, 'the picture has not arrived').toBeGreaterThan(0.2);
    expect(s.life.wear, 'and the white rectangle is behind it, stretched').toBeGreaterThan(s.life.edge + 0.05);
    const done = run(m, life(1), 1.5);
    expect([done.life.edge, done.life.wear]).toEqual([0.2, 0.2]);
  });

  it('a frame of any length is a step of MAX_STEP_SECONDS at the most: 0.1, 1 and 1000 seconds move the bar the same, and a negative one does not move it', () => {
    const after = (dt: number) => {
      const m = new HudModel();
      m.update(status(), FRAME);
      const s = m.update(status(magic(40)), dt);
      return [s.magic.edge, s.magic.wear];
    };
    expect(after(1)).toEqual(after(MAX_STEP_SECONDS));
    expect(after(1000)).toEqual(after(MAX_STEP_SECONDS));
    expect(after(-5)).toEqual([1, 1]);
  });

  it('a bar can be empty: 0 of life is 0, an empty picture, and the white rectangle at its left end', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    const s = run(m, life(0), 2);
    expect([s.life.percent, s.life.fraction, s.life.edge, s.life.wear]).toEqual([0, 0, 0, 0]);
  });

  it('never beyond either end: more than the maximum and less than nothing are the ends, and no maximum is an empty bar', () => {
    const m = new HudModel();
    expect(m.update(status(life(9)), FRAME).life.fraction).toBe(1);
    expect(m.update(status(life(-2)), FRAME).life.fraction).toBe(0);
    const s = m.update(status((x) => (x.life.max = 0)), FRAME);
    expect([s.life.fraction, s.life.percent]).toEqual([0, 0]);
  });

  it('is one object, reused: nothing is allocated every frame', () => {
    const m = new HudModel();
    const a = m.update(status(), FRAME);
    const b = m.update(status(life(3)), FRAME);
    expect(a).toBe(b);
    expect(a).toBe(m.state);
    expect(a.life).toBe(m.state.life);
  });
});

describe('the magic: units that are spent and come back', () => {
  it('spending 30 of the 100 is 70, a picture on its way to 70, and a white rectangle that trails it', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    let s = m.update(status(magic(70)), FRAME);
    expect([s.magic.percent, s.magic.current, s.magic.max]).toEqual([70, 70, 100]);
    expect(s.magic.wear).toBeGreaterThan(s.magic.edge);
    s = run(m, magic(70), 1.5);
    expect([s.magic.edge, s.magic.wear]).toEqual([0.7, 0.7]);
  });

  it('the regeneration brings it back in tenths of a unit: the number is the whole units, the picture follows, and the bar says so', () => {
    const m = new HudModel();
    m.update(status(magic(70)), FRAME);
    const seen: number[] = [];
    for (let i = 0; i < 70; i++) {
      const s = m.update(status((x) => ((x.magic.current = 70 + i * 0.1), (x.magic.regenerating = true))), FRAME);
      seen.push(s.magic.percent);
      expect(s.magic.regenerating).toBe(true);
    }
    expect(seen[0]).toBe(70);
    expect(seen[69]).toBe(76);
    expect(seen.every((n, i) => i === 0 || n >= (seen[i - 1] as number))).toBe(true);
    expect(m.update(status(magic(70)), FRAME).magic.regenerating).toBe(false);
  });

  it('a refused cast shakes the bar a short moment and then it is still', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.magicDenied();
    const xs: number[] = [];
    for (let t = 0; t < SHAKE_SECONDS; t += FRAME) xs.push(m.update(status(), FRAME).magic.shakeX);
    expect(xs.some((x) => Math.abs(x) > 1)).toBe(true);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(4);
    expect(m.update(status(), SHAKE_SECONDS).magic.shakeX).toBe(0);
  });

  it('the shake waits with the game: it does not run while dt is 0 (after a long wait it is where it would have been with none)', () => {
    const a = new HudModel();
    a.update(status(), FRAME);
    a.magicDenied();
    const direct = a.update(status(), FRAME).magic.shakeX;
    const b = new HudModel();
    b.update(status(), FRAME);
    b.magicDenied();
    for (let i = 0; i < 20; i++) expect(b.update(status(), 0).magic.shakeX).toBeCloseTo(0, 12);
    expect(b.update(status(), FRAME).magic.shakeX).toBe(direct);
    expect(Math.abs(direct)).toBeGreaterThan(1);
  });
});

describe('the bottles: each one is bright or dark, as its slot says', () => {
  const states = (m: HudModel): string[] => m.state.bottles.map((b) => b.state);
  const dark = (m: HudModel): number[] => m.state.bottles.map((b) => Number(b.dark.toFixed(3)));
  const slot = (patch: Array<'ready' | 'empty' | 'recharging'>) => (s: PlayerStatus) => void (s.bottles = patch.map((state) => ({ state, fill01: state === 'ready' ? 1 : 0, iconId: 'bottle', secondsLeft: 0 })));

  it('three ready bottles at the start: all bright, nothing drinking', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    expect(states(m)).toEqual(['ready', 'ready', 'ready']);
    expect(dark(m)).toEqual([0, 0, 0]);
    expect(m.state.bottles.every((b) => !b.drinking)).toBe(true);
  });

  it('the bottle that is used goes dark and the others keep what they had: one, two, three, one at a time', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    run(m, slot(['recharging', 'ready', 'ready']), BOTTLE_FADE_SECONDS * 2);
    expect(dark(m)).toEqual([1, 0, 0]);
    run(m, slot(['recharging', 'empty', 'ready']), BOTTLE_FADE_SECONDS * 2);
    expect(dark(m)).toEqual([1, 1, 0]);
    run(m, slot(['empty', 'empty', 'empty']), BOTTLE_FADE_SECONDS * 2);
    expect(dark(m)).toEqual([1, 1, 1]);
    expect(states(m)).toEqual(['empty', 'empty', 'empty']);
  });

  it('a recharging bottle and an empty one are both not available: both are dark', () => {
    const m = new HudModel();
    m.update(status(slot(['recharging', 'empty', 'ready'])), FRAME);
    expect(dark(m)).toEqual([1, 1, 0]);
  });

  it('it fades from one picture to the other over BOTTLE_FADE_SECONDS, in a straight line, and back again when the bottle is ready', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    const seen: number[] = [];
    for (let t = 0; t < BOTTLE_FADE_SECONDS + 0.1; t += FRAME) seen.push((m.update(status(slot(['recharging', 'ready', 'ready'])), FRAME).bottles[0] as { dark: number }).dark);
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(0.2);
    expect(seen.every((v, i) => i === 0 || v >= (seen[i - 1] as number))).toBe(true);
    expect(seen[seen.length - 1]).toBe(1);
    run(m, slot(['ready', 'ready', 'ready']), BOTTLE_FADE_SECONDS + 0.1);
    expect(dark(m)).toEqual([0, 0, 0]);
  });

  it('a game that loads with a bottle spent shows it dark from the first frame: nothing fades in', () => {
    const m = new HudModel();
    m.update(status(slot(['ready', 'recharging', 'empty'])), FRAME);
    expect(dark(m)).toEqual([0, 1, 1]);
  });

  it('the fourth bottle, the reward, appears bright and the third is not touched; when it is gone the row is three again', () => {
    const m = new HudModel();
    m.update(status(slot(['ready', 'empty', 'ready'])), FRAME);
    m.update(status(slot(['ready', 'empty', 'ready', 'ready'])), FRAME);
    expect(m.state.bottles).toHaveLength(4);
    expect(dark(m)).toEqual([0, 1, 0, 0]);
    m.update(status(slot(['ready', 'empty', 'ready'])), FRAME);
    expect(m.state.bottles).toHaveLength(3);
  });

  it('the bottle that is being drunk says so (the slot the hero is drinking), the others do not, and it stays bright until it is spent', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    const s = m.update(status((x) => ((x.drink.slot = 1), (x.drink.progress01 = 0.5))), FRAME);
    expect(s.bottles.map((b) => b.drinking)).toEqual([false, true, false]);
    expect(dark(m)).toEqual([0, 0, 0]);
    expect(m.update(status(), FRAME).bottles.map((b) => b.drinking)).toEqual([false, false, false]);
  });

  it('a refused drink shakes the row, and it is still afterwards', () => {
    const m = new HudModel();
    m.update(status(), FRAME);
    m.bottlesDenied();
    const xs: number[] = [];
    for (let t = 0; t < SHAKE_SECONDS; t += FRAME) xs.push(m.update(status(), FRAME).bottlesShakeX);
    expect(xs.some((x) => Math.abs(x) > 1)).toBe(true);
    expect(m.update(status(), SHAKE_SECONDS).bottlesShakeX).toBe(0);
  });
});
