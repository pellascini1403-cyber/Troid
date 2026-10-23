import { describe, expect, it } from 'vitest';
import { neighbour, PAD_FIRST, PAD_REPEAT, PAD_REST, PAD_TILT, PadStepper, sliderStep, type PadBox } from '@/ui/settings/padNav';

/**
 * THE PAD IN THE MENUS, the pure half (docs/PROMPT20-LOG.md): a direction becomes a step — the first at once, the next while it is held, none for a stick that only wobbles — and a step goes to the nearest control in that
 * direction. Boxes are given by hand: what a browser lays out is the E2E's to photograph.
 */
describe('the stepper: a held direction becomes steps', () => {
  it('steps at once, then waits, then repeats at a steady pace while it is held', () => {
    const s = new PadStepper();
    expect(s.step(0, -1, 0)).toBe('down');
    expect(s.step(0, -1, PAD_FIRST - 1)).toBeNull();
    expect(s.step(0, -1, PAD_FIRST)).toBe('down');
    expect(s.step(0, -1, PAD_FIRST + PAD_REPEAT - 1)).toBeNull();
    expect(s.step(0, -1, PAD_FIRST + PAD_REPEAT)).toBe('down');
  });

  it('+y is UP, as everywhere in the game (the pad source flips the stick before the input frame has it)', () => {
    const s = new PadStepper();
    expect(s.step(0, 1, 0)).toBe('up');
    s.step(0, 0, 10);
    expect(s.step(-1, 0, 20)).toBe('left');
    s.step(0, 0, 30);
    expect(s.step(1, 0, 40)).toBe('right');
  });

  it('a frame that comes late is one step, never two', () => {
    const s = new PadStepper();
    s.step(1, 0, 0);
    expect(s.step(1, 0, 5000)).toBe('right');
    expect(s.step(1, 0, 5001), 'the next is counted from the late one').toBeNull();
  });

  it('letting go and pressing again is a new first step, at once', () => {
    const s = new PadStepper();
    expect(s.step(1, 0, 0)).toBe('right');
    expect(s.step(0, 0, 10)).toBeNull();
    expect(s.step(1, 0, 20)).toBe('right');
  });

  it('a new direction is a first step at once (the repeat of the old one does not carry over)', () => {
    const s = new PadStepper();
    s.step(1, 0, 0);
    expect(s.step(0, 1, 50)).toBe('up');
    expect(s.step(0, 1, 60)).toBeNull();
  });

  it('a stick has to be pushed past the tilt to mean something, and has to come back to rest to mean nothing', () => {
    const s = new PadStepper();
    expect(s.step(PAD_TILT - 0.01, 0, 0), 'a light touch is not a step').toBeNull();
    expect(s.step(PAD_TILT + 0.01, 0, 10)).toBe('right');
    // it wobbles between the two thresholds: still the same held direction, no new first step each time
    expect(s.step(PAD_TILT - 0.1, 0, 20)).toBeNull();
    expect(s.step(PAD_TILT + 0.1, 0, 30)).toBeNull();
    // back to rest, and the next push is a first step again
    expect(s.step(PAD_REST - 0.01, 0, 40)).toBeNull();
    expect(s.step(PAD_TILT + 0.1, 0, 50)).toBe('right');
  });

  it('a diagonal is the axis that is further out; a tie goes to the horizontal', () => {
    const s = new PadStepper();
    expect(s.step(0.9, 0.7, 0)).toBe('right');
    s.reset();
    expect(s.step(0.6, 0.9, 10)).toBe('up');
    s.reset();
    expect(s.step(-0.8, -0.8, 20)).toBe('left');
  });

  it('reset forgets a direction that was held (the menu opened or changed screen under it)', () => {
    const s = new PadStepper();
    s.step(1, 0, 0);
    s.reset();
    expect(s.step(1, 0, 10)).toBe('right');
  });
});

describe('the nearest control in a direction', () => {
  const box = (left: number, top: number, w = 100, h = 40): PadBox => ({ left, top, right: left + w, bottom: top + h });
  const at = (item: string, b: PadBox): { item: string; box: PadBox } => ({ item, box: b });

  // a screen: three rows of controls, a wide slider, and a column of options to its right
  const rows = [at('es', box(0, 0, 100)), at('en', box(110, 0, 100)), at('low', box(0, 60, 100)), at('high', box(110, 60, 100)), at('slider', box(0, 120, 210)), at('back', box(0, 180, 210))];
  const column = [at('resume', box(300, 0, 120)), at('map', box(300, 50, 120)), at('sound', box(300, 100, 120))];
  const all = [...rows, ...column];
  const of = (name: string): PadBox => all.find((t) => t.item === name)!.box;
  const go = (from: string, dir: 'up' | 'down' | 'left' | 'right'): string | null => neighbour(of(from), all.filter((t) => t.item !== from), dir);

  it('goes along a row and down a column of a screen', () => {
    expect(go('es', 'right')).toBe('en');
    expect(go('en', 'left')).toBe('es');
    expect(go('es', 'down')).toBe('low');
    expect(go('low', 'up')).toBe('es');
    expect(go('high', 'down')).toBe('slider');
    expect(go('slider', 'down')).toBe('back');
    expect(go('back', 'up')).toBe('slider');
  });

  it('goes over to the column from the controls beside it, and back — to the one that is level with where it was', () => {
    expect(go('en', 'right')).toBe('resume');
    expect(go('high', 'right')).toBe('map');
    expect(go('map', 'left')).toBe('high');
    expect(go('sound', 'left')).toBe('slider');
  });

  it('goes up and down the column, and stops at its ends', () => {
    expect(go('resume', 'down')).toBe('map');
    expect(go('map', 'down')).toBe('sound');
    expect(go('sound', 'down')).toBeNull();
    expect(go('resume', 'up')).toBeNull();
  });

  it('straight ahead wins over nearer but off to the side', () => {
    const from = box(100, 100, 40, 40);
    const targets = [at('beside', box(150, 100, 40, 40)), at('ahead', box(100, 300, 40, 40)), at('far', box(400, 150, 40, 40))];
    expect(neighbour(from, targets, 'down')).toBe('ahead');
    expect(neighbour(from, targets, 'right')).toBe('beside');
  });

  it('to the side the closest in height is the way even when nothing is in line (one button far below the options beside it) — above and below it never is', () => {
    const options = [at('a', box(300, 0, 120)), at('b', box(300, 50, 120)), at('c', box(300, 100, 120))];
    const lone = at('back', box(0, 400, 200));
    const all2 = [...options, lone];
    expect(neighbour(options[2]!.box, [lone], 'left'), 'left from the lowest option').toBe('back');
    expect(neighbour(options[0]!.box, [lone], 'left'), 'and from the highest').toBe('back');
    expect(neighbour(lone.box, options, 'right'), 'right from the lone button reaches the nearest option in height').toBe('c');
    expect(neighbour(options[2]!.box, [lone], 'down'), 'but down from the options does not jump to a button that is not under them').toBeNull();
    expect(neighbour(lone.box, all2.filter((t) => t !== lone), 'up'), 'nor up from it').toBeNull();
  });

  it('nothing that way is null, and what is behind or beside is never a way', () => {
    expect(neighbour(box(0, 0), [], 'down')).toBeNull();
    expect(neighbour(box(0, 100), [at('above', box(0, 0))], 'down')).toBeNull();
    expect(neighbour(box(0, 0), [at('same row', box(200, 0))], 'down')).toBeNull();
  });

  it('a control with no size (not on the screen) is never a way', () => {
    expect(neighbour(box(0, 0), [at('hidden', { left: 0, top: 100, right: 0, bottom: 0 }), at('shown', box(0, 100))], 'down')).toBe('shown');
    expect(neighbour(box(0, 0), [at('hidden', { left: 0, top: 100, right: 0, bottom: 0 })], 'down')).toBeNull();
  });

  it('every control of the screen can be reached from every other by some run of steps (nothing is out of reach)', () => {
    const names = all.map((t) => t.item);
    const reach = (start: string): Set<string> => {
      const seen = new Set([start]);
      const todo = [start];
      while (todo.length) {
        const n = todo.pop()!;
        for (const dir of ['up', 'down', 'left', 'right'] as const) {
          const to = go(n, dir);
          if (to && !seen.has(to)) {
            seen.add(to);
            todo.push(to);
          }
        }
      }
      return seen;
    };
    for (const n of names) expect([...reach(n)].sort(), `from ${n}`).toEqual([...names].sort());
  });
});

describe('a slider takes a step', () => {
  it('right raises it by its step, left lowers it, and none goes past an end', () => {
    expect(sliderStep(0.5, 0, 1, 0.05, 'right')).toBe(0.55);
    expect(sliderStep(0.5, 0, 1, 0.05, 'left')).toBe(0.45);
    expect(sliderStep(1, 0, 1, 0.05, 'right'), 'already at the top').toBeNull();
    expect(sliderStep(0, 0, 1, 0.05, 'left'), 'and at the bottom').toBeNull();
    expect(sliderStep(0.98, 0, 1, 0.05, 'right'), 'a step that would pass the end stops at it').toBe(1);
  });

  it('writes the value on the grid of its step: 0.1 + 0.2 is not 0.3 (a slider would not take it)', () => {
    expect(sliderStep(0.1, 0, 1, 0.1, 'right')).toBe(0.2);
    expect(sliderStep(0.2, 0, 1, 0.1, 'right')).toBe(0.3);
    expect(sliderStep(0.7, 0.7, 1.5, 0.05, 'right')).toBe(0.75);
    let v = 0;
    for (let i = 0; i < 20; i++) v = sliderStep(v, 0, 1, 0.05, 'right') ?? v;
    expect(v, 'twenty steps of a twentieth').toBe(1);
  });

  it('a slider with no usable step moves by one', () => {
    expect(sliderStep(5, 0, 10, 0, 'right')).toBe(6);
    expect(sliderStep(5, 0, 10, Number.NaN, 'left')).toBe(4);
  });
});
