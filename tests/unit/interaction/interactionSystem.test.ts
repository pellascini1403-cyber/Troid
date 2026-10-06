import { describe, expect, it } from 'vitest';
import { DEFAULT_ICON_HEIGHT, DEFAULT_REACH, MAX_INTERACT_LOCK, REACH_HYSTERESIS, type InteractableDef } from '@/interaction/Interactable';
import { interactLock, InteractionSystem, type InteractionHost, type InteractionNotice } from '@/interaction/InteractionSystem';

/**
 * Who has the icon, and what happens when it is used (docs/GAME-SPEC-2D.md §12): the nearest available object in reach wins, it
 * keeps the icon with a 0.3 m hysteresis, flags decide whether it is there at all, and performing it runs its actions in order.
 * Pure: a position and a set of flags in, events and host calls out.
 */
function make(defs: InteractableDef[] = []) {
  const flags = new Set<string>();
  const calls: string[] = [];
  const log: Array<[string, unknown]> = [];
  const host: InteractionHost = {
    hasFlag: (f) => flags.has(f),
    setFlag: (f) => (calls.push(`set:${f}`), void flags.add(f)),
    clearFlag: (f) => (calls.push(`clear:${f}`), void flags.delete(f)),
    acquireCard: (id) => (calls.push(`card:${id}`), true),
    addBottleSlot: (id) => (calls.push(`bottle:${id}`), true),
    unlockAbility: (id) => (calls.push(`ability:${id}`), true),
    checkpoint: (entry) => void calls.push(`rest:${entry}`),
  };
  const sys = new InteractionSystem(host, {
    available: (e) => void log.push(['available', e]),
    lost: (e) => void log.push(['lost', e]),
    performed: (e) => void log.push(['performed', e]),
  });
  sys.setRoom(defs);
  const names = (): string[] => log.map(([n]) => n);
  return { sys, flags, calls, log, names };
}

const thing = (id: string, x: number, extra: Partial<InteractableDef> = {}): InteractableDef => ({
  id, kind: 'pickup', verbKey: 'interact.pickUp', x, y: 0, actions: [{ type: 'setFlag', flag: `done:${id}` }], ...extra,
});

describe('who has the icon', () => {
  it('nothing in reach: nobody, and nothing is announced', () => {
    const { sys, log } = make([thing('a', 10)]);
    sys.update(0, 0, true);
    expect(sys.current).toBeNull();
    expect(log).toEqual([]);
  });

  it('in reach: it has the icon, announced ONCE, with the verb and where the icon floats (above the object)', () => {
    const { sys, log } = make([thing('a', 10, { verbKey: 'interact.pickUp' })]);
    sys.update(9, 0, true);
    sys.update(9.2, 0, true);
    sys.update(9.4, 0, true);
    expect(sys.current?.id).toBe('a');
    expect(log).toEqual([['available', { id: 'a', kind: 'pickup', verbKey: 'interact.pickUp', x: 10, y: DEFAULT_ICON_HEIGHT } satisfies InteractionNotice]]);
  });

  it('the icon height is the object\'s own when it says so', () => {
    const { sys, log } = make([thing('a', 10, { iconHeight: 0.8 })]);
    sys.update(10, 0, true);
    expect((log[0]![1] as InteractionNotice).y).toBe(0.8);
  });

  it('the default reach is 1.6 m across and 1.2 m up and down, edges included', () => {
    expect(DEFAULT_REACH).toEqual({ x: 1.6, y: 1.2 });
    const { sys } = make([thing('a', 10)]);
    sys.update(10 - 1.6, 0, true);
    expect(sys.current?.id).toBe('a');
    sys.update(10 - 1.7, 0, true); // out of reach but inside the 0.3 m hysteresis: it keeps the icon
    expect(sys.current?.id).toBe('a');
    const fresh = make([thing('a', 10)]);
    fresh.sys.update(10 - 1.61, 0, true);
    expect(fresh.sys.current).toBeNull();
    const high = make([thing('a', 10)]);
    high.sys.update(10, 1.2, true);
    expect(high.sys.current?.id).toBe('a');
    const higher = make([thing('a', 10)]);
    higher.sys.update(10, 1.21, true);
    expect(higher.sys.current).toBeNull();
  });

  it('an object can ask for its own reach', () => {
    const { sys } = make([thing('a', 10, { reach: { x: 0.5, y: 3 } })]);
    sys.update(10.6, 0, true);
    expect(sys.current).toBeNull();
    sys.update(10.5, 2.9, true);
    expect(sys.current?.id).toBe('a');
  });

  it('leaving it takes the icon away, announced once', () => {
    const { sys, names } = make([thing('a', 10)]);
    sys.update(10, 0, true);
    sys.update(20, 0, true);
    sys.update(30, 0, true);
    expect(sys.current).toBeNull();
    expect(names()).toEqual(['available', 'lost']);
  });
});

describe('the nearest wins', () => {
  it('between two in reach, the closer one', () => {
    const { sys } = make([thing('far', 12), thing('near', 10.5)]);
    sys.update(10, 0, true);
    expect(sys.current?.id).toBe('near');
    sys.update(11.9, 0, true);
    expect(sys.current?.id).toBe('far');
  });

  it('at exactly the same distance the higher priority wins; with equal priority, the first of the room', () => {
    const a = make([thing('first', 9), thing('second', 11)]);
    a.sys.update(10, 0, true);
    expect(a.sys.current?.id).toBe('first');
    const b = make([thing('first', 9), thing('second', 11, { priority: 2 })]);
    b.sys.update(10, 0, true);
    expect(b.sys.current?.id).toBe('second');
  });

  it('the one that has the icon keeps it while another is only slightly nearer (hysteresis), and gives it up when it is clearly nearer', () => {
    const { sys } = make([thing('a', 10), thing('b', 12)]);
    sys.update(9.5, 0, true);
    expect(sys.current?.id).toBe('a');
    sys.update(10.9, 0, true); // a is 0.9 away, b 1.1: b is NOT nearer
    expect(sys.current?.id).toBe('a');
    sys.update(11.5, 0, true); // a is 1.5 away, b 0.5: b is nearer by 1.0 > 0.3
    expect(sys.current?.id).toBe('b');
  });

  it('after losing it the object has to be in plain reach again to get the icon back (the hysteresis only holds, it never grants)', () => {
    const { sys } = make([thing('a', 10)]);
    sys.update(10, 0, true);
    sys.update(10 + 1.6 + REACH_HYSTERESIS + 0.01, 0, true);
    expect(sys.current).toBeNull();
    sys.update(10 + 1.7, 0, true);
    expect(sys.current).toBeNull();
    sys.update(10 + 1.6, 0, true);
    expect(sys.current?.id).toBe('a');
  });
});

describe('flags decide whether it is there', () => {
  it('`whenClear`: available until the flag is set; setting it takes the icon away', () => {
    const { sys, flags, names } = make([thing('a', 10, { whenClear: 'taken:a' })]);
    sys.update(10, 0, true);
    expect(sys.current?.id).toBe('a');
    flags.add('taken:a');
    sys.update(10, 0, true);
    expect(sys.current).toBeNull();
    expect(sys.isAvailable('a')).toBe(false);
    expect(names()).toEqual(['available', 'lost']);
  });

  it('`whenSet`: not there until the flag is set', () => {
    const { sys, flags } = make([thing('a', 10, { whenSet: 'lever:on' })]);
    sys.update(10, 0, true);
    expect(sys.current).toBeNull();
    expect(sys.isAvailable('a')).toBe(false);
    flags.add('lever:on');
    sys.update(10, 0, true);
    expect(sys.current?.id).toBe('a');
  });

  it('an unavailable object never takes the icon from, or shares it with, an available one', () => {
    const { sys } = make([thing('taken', 10, { whenClear: 'x' }), thing('free', 11)]);
    // `x` is not set, so both are available: the nearer wins; set it and only the other remains
    sys.update(10, 0, true);
    expect(sys.current?.id).toBe('taken');
    const { sys: s2, flags } = make([thing('taken', 10, { whenClear: 'x' }), thing('free', 11)]);
    flags.add('x');
    s2.update(10, 0, true);
    expect(s2.current?.id).toBe('free');
  });

  it('an unknown object is not available', () => {
    expect(make([thing('a', 1)]).sys.isAvailable('nope')).toBe(false);
  });
});

describe('the player cannot interact (dead): the icon goes away and comes back', () => {
  it('disabled → lost; enabled again → available again', () => {
    const { sys, names } = make([thing('a', 10)]);
    sys.update(10, 0, true);
    sys.update(10, 0, false);
    expect(sys.current).toBeNull();
    sys.update(10, 0, true);
    expect(sys.current?.id).toBe('a');
    expect(names()).toEqual(['available', 'lost', 'available']);
  });
});

describe('performing it', () => {
  it('runs the actions in order through the host and announces `performed`', () => {
    const { sys, calls, log } = make([
      thing('a', 10, {
        actions: [
          { type: 'acquireCard', cardId: 'card_x' },
          { type: 'addBottleSlot', bottleId: 'bottle_y' },
          { type: 'unlockAbility', abilityId: 'air_dash' },
          { type: 'setFlag', flag: 'taken:a' },
          { type: 'clearFlag', flag: 'old' },
        ],
      }),
    ]);
    sys.update(10, 0, true);
    log.length = 0;
    const done = sys.perform();
    expect(done?.id).toBe('a');
    expect(calls).toEqual(['card:card_x', 'bottle:bottle_y', 'ability:air_dash', 'set:taken:a', 'clear:old']);
    expect(log).toEqual([['performed', { id: 'a', kind: 'pickup', verbKey: 'interact.pickUp', x: 10, y: DEFAULT_ICON_HEIGHT }]]);
  });

  it('with nothing in reach it does nothing at all', () => {
    const { sys, calls, log } = make([thing('a', 10)]);
    sys.update(0, 0, true);
    expect(sys.perform()).toBeNull();
    expect(calls).toEqual([]);
    expect(log).toEqual([]);
  });

  it('a pickup that writes its own `whenClear` flag is gone on the next update, and cannot be performed twice', () => {
    const { sys, calls, names } = make([thing('a', 10, { whenClear: 'taken:a', actions: [{ type: 'setFlag', flag: 'taken:a' }] })]);
    sys.update(10, 0, true);
    expect(sys.perform()?.id).toBe('a');
    expect(sys.perform()).toBeNull(); // the flag is set: it is not available any more, even before the next update
    sys.update(10, 0, true);
    expect(sys.current).toBeNull();
    expect(calls).toEqual(['set:taken:a']);
    expect(names()).toEqual(['available', 'performed', 'lost']);
  });

  it('a lever stays where it is: it is performed once and its flag stays set', () => {
    const { sys, flags } = make([thing('lever', 10, { kind: 'activate', verbKey: 'interact.activate', whenClear: 'lever:on', actions: [{ type: 'setFlag', flag: 'lever:on' }] })]);
    sys.update(10, 0, true);
    sys.perform();
    sys.update(10, 0, true);
    expect(flags.has('lever:on')).toBe(true);
    expect(sys.current).toBeNull();
  });
});

describe('the room', () => {
  it('a new room replaces the list and the icon of the old one is announced as lost', () => {
    const { sys, names } = make([thing('a', 10)]);
    sys.update(10, 0, true);
    sys.setRoom([thing('b', 50)]);
    expect(sys.current).toBeNull();
    expect(names()).toEqual(['available', 'lost']);
    sys.update(10, 0, true);
    expect(sys.current).toBeNull();
    sys.update(50, 0, true);
    expect(sys.current?.id).toBe('b');
  });

  it('a room without interactables is the empty list', () => {
    const { sys, log } = make();
    sys.update(0, 0, true);
    expect(sys.current).toBeNull();
    expect(sys.notice()).toBeNull();
    expect(log).toEqual([]);
  });
});

describe('the pose that holds the control', () => {
  it('lasts the object\'s `lock`, 12 ticks at most (§12), never negative', () => {
    expect(MAX_INTERACT_LOCK).toBe(12);
    expect(interactLock(thing('a', 0))).toBe(12);
    expect(interactLock(thing('a', 0, { lock: 6 }))).toBe(6);
    expect(interactLock(thing('a', 0, { lock: 0 }))).toBe(0);
    expect(interactLock(thing('a', 0, { lock: 99 }))).toBe(12);
    expect(interactLock(thing('a', 0, { lock: -4 }))).toBe(0);
    expect(interactLock(thing('a', 0, { lock: 5.9 }))).toBe(5);
  });
});

describe('determinism', () => {
  it('the same walk gives the same events, twice', () => {
    const run = (): string => {
      const { sys, log } = make([thing('a', 10, { whenClear: 'taken:a', actions: [{ type: 'setFlag', flag: 'taken:a' }] }), thing('b', 13), thing('c', 16, { priority: 1 })]);
      for (let i = 0; i < 400; i++) {
        const x = 20 * (0.5 + 0.5 * Math.sin(i / 23));
        sys.update(x, 0, i % 97 !== 0);
        if (i === 150) sys.perform();
      }
      return JSON.stringify(log);
    };
    expect(run()).toBe(run());
  });
});

describe('resting (the `checkpoint` action)', () => {
  it('performing a shrine asks the host to rest at the entry it names, once, and announces it like any other interaction', () => {
    const { sys, calls, names } = make([{ id: 'shrine', kind: 'rest', verbKey: 'interact.rest', x: 5, y: 0, actions: [{ type: 'checkpoint', entry: 'rest' }] }]);
    sys.update(5, 0, true);
    expect(sys.current?.id).toBe('shrine');
    expect(sys.perform()?.id).toBe('shrine');
    expect(calls).toEqual(['rest:rest']);
    expect(names()).toEqual(['available', 'performed']);
  });

  it('a shrine can be used again and again: it is never spent', () => {
    const { sys, calls } = make([{ id: 'shrine', kind: 'rest', verbKey: 'interact.rest', x: 5, y: 0, actions: [{ type: 'checkpoint', entry: 'rest' }] }]);
    sys.update(5, 0, true);
    sys.perform();
    sys.perform();
    expect(calls).toEqual(['rest:rest', 'rest:rest']);
    expect(sys.current?.id).toBe('shrine');
  });
});
