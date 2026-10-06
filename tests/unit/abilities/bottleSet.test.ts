import { describe, expect, it } from 'vitest';
import { BottleSet, type BottleChange } from '@/abilities/BottleSet';
import { BOTTLE_DEFINITIONS, BOTTLES } from '@/content/resources';
import { secondsToTicks } from '@/core/time';

/**
 * The energy bottles (docs/GAME-SPEC-2D.md §11): three at the start, four at most, each a charge that refills slowly —
 * ONE at a time, the first empty one from the left, 60 s each — independent of the magic. No purchases, no economy.
 */
const RECHARGE = secondsToTicks(BOTTLES.rules.rechargeSeconds); // 3600 ticks

function make(initial = BOTTLES.initial) {
  const log: BottleChange[] = [];
  const set = new BottleSet(BOTTLE_DEFINITIONS, initial, BOTTLES.rules, (c) => log.push(c));
  return { set, log };
}
const run = (set: BottleSet, ticks: number): void => {
  for (let i = 0; i < ticks; i++) set.tick();
};
const states = (set: BottleSet): string[] => set.slots.map((s) => s.state);

describe('bottles: the start', () => {
  it('there are three, all ready; a minute is 3600 ticks', () => {
    const { set } = make();
    expect(set.count).toBe(3);
    expect(set.readyCount).toBe(3);
    expect(states(set)).toEqual(['ready', 'ready', 'ready']);
    expect(set.rechargeLength).toBe(3600);
    expect(RECHARGE).toBe(3600);
  });

  it('drinking is a channel of 24 ticks (0.4 s), and it is data: the rules say so, the set only counts', () => {
    const { set } = make();
    expect(BOTTLES.rules.channelSeconds).toBe(0.4);
    expect(set.channelLength).toBe(24);
    const slower = new BottleSet(BOTTLE_DEFINITIONS, BOTTLES.initial, { ...BOTTLES.rules, channelSeconds: 1 });
    expect(slower.channelLength).toBe(60);
    const instant = new BottleSet(BOTTLE_DEFINITIONS, BOTTLES.initial, { ...BOTTLES.rules, channelSeconds: 0 });
    expect(instant.channelLength).toBe(1); // never zero: the effect still lands on a tick of its own
  });

  it('at most four slots; an unknown bottle is refused loudly', () => {
    expect(() => make(['nope'])).toThrow(/unknown bottle/);
    const { set } = make(['energy_bottle', 'energy_bottle', 'energy_bottle', 'energy_bottle', 'energy_bottle']);
    expect(set.count).toBe(4);
  });

  it('every slot is full when ready and says which definition it is (the icon, the heal of 2)', () => {
    const { set } = make();
    expect(set.fill(0)).toBe(1);
    expect(set.definition(0)?.effect).toEqual({ type: 'heal', amount: 2 });
    expect(set.definition(0)?.iconId).toBe('bottle');
    expect(set.definition(9)).toBeUndefined();
    expect(set.fill(9)).toBe(0);
  });
});

describe('bottles: using them', () => {
  it('a drunk bottle is empty at once, and its recharge starts (nothing else was recharging)', () => {
    const { set, log } = make();
    expect(set.consume(0)).toBe(true);
    expect(states(set)).toEqual(['recharging', 'ready', 'ready']);
    expect(log).toEqual([{ type: 'used', slot: 0 }, { type: 'recharging', slot: 0 }]);
    expect(set.readyCount).toBe(2);
  });

  it('a bottle that is not ready cannot be drunk (empty or recharging): nothing changes', () => {
    const { set, log } = make();
    set.consume(1);
    const events = log.length;
    expect(set.consume(1)).toBe(false);
    expect(set.consume(7)).toBe(false);
    expect(set.consume(-1)).toBe(false);
    expect(log).toHaveLength(events);
  });

  it('requests: −1 means "the first ready one" (the key, the chip), n means that slot (a HUD icon), and only if it is ready', () => {
    const { set } = make();
    expect(set.resolve(-1)).toBe(0);
    set.consume(0);
    expect(set.resolve(-1)).toBe(1);
    expect(set.resolve(2)).toBe(2);
    expect(set.resolve(0)).toBe(-1); // recharging
    expect(set.resolve(5)).toBe(-1); // no such slot
    set.consume(1);
    set.consume(2);
    expect(set.resolve(-1)).toBe(-1); // none ready
  });

  it('the fill of a slot follows its state: ready 1, waiting 0, recharging the progress', () => {
    const { set } = make();
    set.consume(0);
    set.consume(1);
    expect(set.fill(0)).toBe(0);
    run(set, RECHARGE / 4);
    expect(set.fill(0)).toBeCloseTo(0.25, 9);
    expect(set.fill(1)).toBe(0); // waiting its turn
    expect(set.fill(2)).toBe(1);
  });
});

describe('bottles: sequential recharge (60 s each, one at a time)', () => {
  it('a bottle comes back after exactly 60 s, not a tick before', () => {
    const { set, log } = make();
    set.consume(0);
    run(set, RECHARGE - 1);
    expect(set.slots[0]?.state).toBe('recharging');
    run(set, 1);
    expect(set.slots[0]?.state).toBe('ready');
    expect(log.at(-1)).toEqual({ type: 'recharged', slot: 0 });
  });

  it('only ONE recharges at a time: drinking all three leaves one recharging and two waiting', () => {
    const { set } = make();
    set.consume(0);
    set.consume(1);
    set.consume(2);
    expect(states(set)).toEqual(['recharging', 'empty', 'empty']);
    run(set, 100);
    expect(states(set).filter((s) => s === 'recharging')).toHaveLength(1);
  });

  it('they come back from left to right, one minute apart, whatever the order they were drunk in', () => {
    const { set } = make();
    set.consume(2);
    set.consume(1);
    set.consume(0); // drunk right to left: slot 2 started recharging first, the others wait
    expect(states(set)).toEqual(['empty', 'empty', 'recharging']);
    run(set, RECHARGE); // slot 2 is done...
    expect(states(set)).toEqual(['recharging', 'empty', 'ready']); // ...and the next to start is the FIRST empty from the left
    run(set, RECHARGE);
    expect(states(set)).toEqual(['ready', 'recharging', 'ready']);
    run(set, RECHARGE);
    expect(states(set)).toEqual(['ready', 'ready', 'ready']);
  });

  it('the whole set takes three minutes to refill after drinking all three, and then stays still', () => {
    const { set, log } = make();
    for (let i = 0; i < 3; i++) set.consume(i);
    run(set, 3 * RECHARGE);
    expect(states(set)).toEqual(['ready', 'ready', 'ready']);
    const events = log.length;
    run(set, 600);
    expect(log).toHaveLength(events);
  });

  it('drinking a ready bottle while another recharges does not restart or speed up the one in progress', () => {
    const { set } = make();
    set.consume(0);
    run(set, 1000);
    set.consume(2);
    expect(set.slots[0]?.progress).toBe(1000);
    expect(set.slots[2]?.state).toBe('empty');
    run(set, RECHARGE - 1000);
    expect(set.slots[0]?.state).toBe('ready');
    expect(set.slots[2]?.state).toBe('recharging');
  });

  it('is independent of everything else: the recharge counts only its own ticks (a frozen world does not tick)', () => {
    const { set } = make();
    set.consume(0);
    // a hit-stop freezes the session, which then does not call tick(): there is nothing to model here but the absence of ticks
    expect(set.slots[0]?.progress).toBe(0);
    run(set, 5);
    expect(set.slots[0]?.progress).toBe(5);
  });

  it('refillAll() (a save point) makes every bottle ready at once and says so; with all ready it says nothing', () => {
    const { set, log } = make();
    set.consume(0);
    set.consume(1);
    log.length = 0;
    set.refillAll();
    expect(states(set)).toEqual(['ready', 'ready', 'ready']);
    expect(log.filter((c) => c.type === 'refilled').map((c) => c.slot)).toEqual([0, 1]);
    log.length = 0;
    set.refillAll();
    expect(log).toEqual([]);
    run(set, 100);
    expect(set.slots.every((s) => s.progress === 0)).toBe(true);
  });
});

describe('bottles: the fourth slot (a reward)', () => {
  it('a new slot is ready at once and the count goes to four', () => {
    const { set, log } = make();
    expect(set.addSlot('energy_bottle')).toBe(true);
    expect(set.count).toBe(4);
    expect(set.slots[3]?.state).toBe('ready');
    expect(log.at(-1)).toEqual({ type: 'added', slot: 3 });
  });

  it('there is no fifth, and an unknown definition adds nothing', () => {
    const { set } = make();
    set.addSlot('energy_bottle');
    expect(set.addSlot('energy_bottle')).toBe(false);
    expect(set.count).toBe(4);
    const { set: s2 } = make();
    expect(s2.addSlot('nope')).toBe(false);
    expect(s2.count).toBe(3);
  });

  it('the new slot takes part in the sequence: four drunk bottles refill in four minutes, left to right', () => {
    const { set } = make();
    set.addSlot('energy_bottle');
    for (let i = 0; i < 4; i++) set.consume(i);
    run(set, 4 * RECHARGE);
    expect(states(set)).toEqual(['ready', 'ready', 'ready', 'ready']);
  });
});

describe('bottles: determinism', () => {
  it('the same drinks at the same ticks give the same bottles, tick for tick', () => {
    const play = (): string[] => {
      const { set } = make();
      const out: string[] = [];
      for (let i = 0; i < 12000; i++) {
        if (i === 10 || i === 500 || i === 4000) set.consume(set.resolve(-1));
        set.tick();
        if (i % 600 === 0) out.push(`${i}:${states(set).join('/')}:${set.slots.map((s) => s.progress).join(',')}`);
      }
      return out;
    };
    expect(play()).toEqual(play());
  });
});
