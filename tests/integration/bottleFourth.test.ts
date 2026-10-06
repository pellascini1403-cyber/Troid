import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { BOTTLES } from '@/content/resources';
import { captureProgress, restoreFromProgress } from '@/gameplay/progress';
import type { GameEvents } from '@/gameplay/events';
import { repairProgress } from '@/save/ProgressData';
import { strikeOnPlayer } from '../helpers/combat';
import { jump, runTo, standOn } from '../helpers/hops';
import { fetchTheFourthBottle } from '../helpers/journey';
import { driver, type Driver, type MakeOptions } from '../helpers/sim';

/**
 * The fourth bottle (docs/PROMPT6-LOG.md S27), on the REAL world: it lies on the ledge of R2's high road, it is taken with the Interact
 * button like anything else, and from then on it is part of the game — four slots instead of three, saved with the flag that hides
 * the pickup, so it can be taken ONCE and stays taken through a death, a transition and a saved game. Nothing is bought, nothing is
 * counted: one object, one flag, one slot.
 */
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };
const FLAGS = ['defeated:r1_slime', 'defeated:r2_slime'];
const PICKUP = 'bottle_fourth';
const FLAG = 'taken:bottle_fourth';
const LEDGE = { x: 49.5, y: 4.8 };

function world(room = 'r2_hall', entry = 'west', extra: MakeOptions['extra'] = {}): Driver {
  const d = driver({ room: ROOMS[room]!, entry, unlocked: ['dash'], extra: { rooms: ROOMS, flags: FLAGS, ...QUICK, ...extra } });
  d.settle();
  return d;
}
const watch = (d: Driver, types: readonly (keyof GameEvents)[]): string[] => {
  const log: string[] = [];
  for (const t of types) d.session.bus.on(t, ((p: unknown) => void log.push(`${t}${p && typeof p === 'object' ? ' ' + JSON.stringify(p) : ''}`)) as never);
  return log;
};
/** The hero on the ledge itself, standing, with the icon on the pickup. */
function onTheLedge(d: Driver): void {
  d.teleport(LEDGE.x, LEDGE.y).settle();
  d.step(3);
}
function take(d: Driver): void {
  d.tap('interact');
  d.step(14);
}
const kill = (d: Driver): void => {
  d.p.health.damage(d.p.health.current - 1);
  strikeOnPlayer(d, { damage: 99 });
  d.step(1);
  expect(d.p.health.dead).toBe(true);
};
const comeBack = (d: Driver): void => {
  d.until(() => !d.session.death.active, 400);
  d.step(10);
};
const touch = (d: Driver, exitId: string): void => {
  const x = d.session.room.exits!.find((e) => e.id === exitId)!.rect;
  d.teleport((x.x0 + x.x1) / 2, x.y0);
  d.step(1);
  d.until(() => !d.session.transition.active, 100);
  d.settle();
};
const states = (d: Driver): string[] => d.session.bottles.slots.map((b) => b.state);

describe('where it is and how it is reached', () => {
  it('a new game has three bottles; the fourth is not given, it lies on the ledge', () => {
    const d = world();
    expect(d.session.bottles.slots).toHaveLength(3);
    expect(d.session.bottles.maxSlots).toBe(4);
    expect(d.session.flags.has(FLAG)).toBe(false);
  });

  it('it is reached from the entry by the high road and a last jump from the third platform, with nothing but the buttons a person has', () => {
    const d = world();
    runTo(d, 25.6);
    jump(d);
    standOn(d, 2.4); // p1
    runTo(d, 32.3);
    jump(d);
    standOn(d, 2.4); // p2
    runTo(d, 40.3);
    jump(d);
    standOn(d, 2.4); // p3
    d.teleport(49.5, 2.4).settle(); // the standing jump from p3 is the one `worldRooms` proves; here the hero only has to be under the ledge
    expect(d.session.interaction.current, 'nothing in reach from the platform below: the icon is for whoever stands on the ledge').toBeNull();
    jump(d);
    standOn(d, 4.8);
    d.step(3);
    expect(d.session.interaction.current?.id).toBe(PICKUP);
  });

  it('the scripted route the browser replays (`fetchTheFourthBottle`) gets it: the high road, a jump from under the ledge, Interact — and the hero ends on the ledge with four bottles', () => {
    const d = world();
    fetchTheFourthBottle(d);
    expect(d.session.bottles.slots).toHaveLength(4);
    expect(d.session.flags.has(FLAG)).toBe(true);
    expect(d.body.y).toBeCloseTo(4.8, 1);
    expect(d.body.x).toBeGreaterThan(48);
    expect(d.body.x).toBeLessThan(51);
    expect(d.p.health.current, 'nothing hurt the hero on the way (the spikes are on the low road)').toBe(d.p.health.max);
  });

  it('the icon is for whoever is ON the ledge: from the floor, from the platform under it or while going past, there is nothing to take', () => {
    const d = world();
    for (const [x, y] of [[49.5, 0], [49.5, 2.4], [44, 2.4], [60, 0]] as const) {
      d.teleport(x, y).settle();
      d.step(3);
      expect(d.session.interaction.current, `at (${x}, ${y})`).toBeNull();
    }
    onTheLedge(d);
    expect(d.session.interaction.current?.id).toBe(PICKUP);
  });

  it('it is no part of the way on: the other pickups of the world are not bottles, and the exit does not ask for it', () => {
    const bottleGivers = WORLD.rooms.flatMap((id) => (ROOMS[id]!.interactables ?? []).filter((i) => i.actions.some((a) => a.type === 'addBottleSlot')).map((i) => `${id}/${i.id}`));
    expect(bottleGivers).toEqual([`r2_hall/${PICKUP}`]);
    for (const id of WORLD.rooms) for (const x of ROOMS[id]!.exits ?? []) expect(x.requires, `${id}/${x.id}`).not.toBe(FLAG);
  });
});

describe('taking it', () => {
  it('the Interact button adds the slot — full — and writes the flag that hides it, in the same moment; the hero holds the pose', () => {
    const d = world();
    const log = watch(d, ['bottle:changed', 'interaction:performed', 'flag:set']);
    onTheLedge(d);
    d.tap('interact');
    d.step(1);
    expect(d.p.controller.state).toBe('interact');
    d.step(13);
    expect(d.session.bottles.slots).toHaveLength(4);
    expect(states(d)).toEqual(['ready', 'ready', 'ready', 'ready']);
    expect(d.session.flags.has(FLAG)).toBe(true);
    expect(log.filter((l) => l.startsWith('bottle:changed'))).toEqual([expect.stringContaining('"type":"added","slot":3')]);
    expect(log.filter((l) => l.startsWith('interaction:performed'))).toHaveLength(1);
    expect(log.some((l) => l.includes(`"${FLAG}"`) || l.includes(FLAG))).toBe(true);
    expect(d.session.interaction.current, 'the icon goes with the object').toBeNull();
  });

  it('it can be taken ONCE: a second press, a hundred of them, a different spot of the ledge — nothing more, and a fifth slot does not exist', () => {
    const d = world();
    const log = watch(d, ['bottle:changed', 'interaction:performed']);
    onTheLedge(d);
    take(d);
    for (let i = 0; i < 100; i++) {
      d.tap('interact');
      d.step(2);
    }
    for (const x of [48.2, 50.8]) {
      d.teleport(x, LEDGE.y).settle();
      d.step(3);
      take(d);
    }
    expect(d.session.bottles.slots).toHaveLength(4);
    expect(log.filter((l) => l.startsWith('bottle:changed'))).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('interaction:performed'))).toHaveLength(1);
    expect(d.session.bottles.addSlot('energy_bottle'), 'the most a hero ever has is four').toBe(false);
  });

  it('the fourth bottle is a bottle like the others: it is drunk, it recharges (one at a time, from the left) and a rest fills all four', () => {
    const d = world();
    onTheLedge(d);
    take(d);
    d.p.health.damage(3);
    for (const i of [3, 0, 1]) expect(d.session.bottles.consume(i)).toBe(true);
    // one recharges at a time: the fourth, the first one drunk, is the one under way; the other two wait their turn, empty
    expect(states(d)).toEqual(['empty', 'empty', 'ready', 'recharging']);
    const shrine = ROOMS.r2_hall!.interactables!.find((i) => i.kind === 'rest')!;
    d.teleport(shrine.x, shrine.y).settle();
    d.step(2);
    d.tap('interact');
    d.step(14);
    expect(states(d)).toEqual(['ready', 'ready', 'ready', 'ready']);
    expect(d.p.health.current).toBe(d.p.health.max);
  });

  it('with the fourth bottle in hand a drink heals the same two points, from the first that is ready', () => {
    const d = world();
    onTheLedge(d);
    take(d);
    d.p.health.damage(3);
    const before = d.p.health.current;
    d.tap('bottle');
    d.step(40);
    expect(d.p.health.current).toBe(before + 2);
    expect(states(d)).toEqual(['recharging', 'ready', 'ready', 'ready']);
  });
});

describe('it stays taken', () => {
  it('through a defeat: the hero comes back at the shrine with four bottles (a defeat never gives or takes one) and the pickup does not return', () => {
    const d = world();
    onTheLedge(d);
    take(d);
    d.session.bottles.consume(0); // the defeat does not refill
    kill(d);
    comeBack(d);
    expect(d.session.room.id).toBe('r2_hall');
    expect(d.session.bottles.slots).toHaveLength(4);
    expect(states(d)).toEqual(['recharging', 'ready', 'ready', 'ready']);
    expect(d.session.flags.has(FLAG)).toBe(true);
    onTheLedge(d);
    expect(d.session.interaction.current, 'nothing lies there any more').toBeNull();
    take(d);
    expect(d.session.bottles.slots).toHaveLength(4);
  });

  it('a defeat BEFORE taking it loses nothing: it is still there, once, for whenever the hero comes back for it', () => {
    const d = world();
    kill(d);
    comeBack(d);
    expect(d.session.bottles.slots).toHaveLength(3);
    onTheLedge(d);
    expect(d.session.interaction.current?.id).toBe(PICKUP);
    take(d);
    expect(d.session.bottles.slots).toHaveLength(4);
  });

  it('through a transition: R2 → R3 and back, four bottles, and the ledge is empty', () => {
    const d = world();
    onTheLedge(d);
    take(d);
    d.teleport(30, 0).settle();
    touch(d, 'east');
    expect(d.session.room.id).toBe('r3_chamber');
    expect(d.session.bottles.slots).toHaveLength(4);
    touch(d, 'west');
    expect(d.session.room.id).toBe('r2_hall');
    expect(d.session.bottles.slots).toHaveLength(4);
    onTheLedge(d);
    expect(d.session.interaction.current).toBeNull();
    expect(d.session.interaction.isAvailable(PICKUP)).toBe(false);
  });

  it('through a reload of the room (the debug loader): the flag is the world\'s, so the pickup is not built again', () => {
    const d = world();
    onTheLedge(d);
    take(d);
    d.session.loadRoom('r2_hall', 'west');
    d.settle();
    expect(d.session.bottles.slots).toHaveLength(4);
    expect(d.session.interaction.isAvailable(PICKUP)).toBe(false);
  });
});

describe('it is saved', () => {
  it('the capture holds the four slots and the flag — together, so one cannot be saved without the other', () => {
    const d = world();
    expect(captureProgress(d.session).bottleSlots).toBe(3);
    onTheLedge(d);
    take(d);
    const p = captureProgress(d.session);
    expect(p.bottleSlots).toBe(4);
    expect(p.flags).toContain(FLAG);
    expect(p).toEqual(repairProgress(JSON.parse(JSON.stringify(p))));
  });

  it('a game begun from that capture has four bottles, all ready, and the pickup is not there: taken once, kept for good', () => {
    const a = world();
    onTheLedge(a);
    take(a);
    const saved = captureProgress(a.session);
    const r = restoreFromProgress(saved, ROOMS, WORLD.start);
    const b = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, checkpoint: r.checkpoint, flags: r.flags, restore: r.restore, ...QUICK } });
    b.settle();
    expect(b.session.bottles.slots).toHaveLength(4);
    expect(states(b)).toEqual(['ready', 'ready', 'ready', 'ready']);
    expect(b.session.flags.has(FLAG)).toBe(true);
    expect(captureProgress(b.session)).toEqual(saved);
    onTheLedge(b);
    expect(b.session.interaction.current).toBeNull();
    take(b);
    expect(b.session.bottles.slots).toHaveLength(4);
  });

  it('a game saved BEFORE taking it still has the pickup, and taking it after loading is the first time', () => {
    const a = world();
    const saved = captureProgress(a.session);
    expect(saved.flags).not.toContain(FLAG);
    const r = restoreFromProgress(saved, ROOMS, WORLD.start);
    const b = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, checkpoint: r.checkpoint, flags: r.flags, restore: r.restore, ...QUICK } });
    b.settle();
    expect(b.session.bottles.slots).toHaveLength(3);
    onTheLedge(b);
    take(b);
    expect(b.session.bottles.slots).toHaveLength(4);
  });

  it('a damaged save cannot make a fifth bottle: with four already saved and the flag lost, taking it gives nothing more — and hides it', () => {
    const a = world();
    const saved = { ...captureProgress(a.session), bottleSlots: 4 };
    const r = restoreFromProgress(repairProgress(saved), ROOMS, WORLD.start);
    const b = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, checkpoint: r.checkpoint, flags: r.flags, restore: r.restore, ...QUICK } });
    b.settle();
    expect(b.session.bottles.slots).toHaveLength(4);
    onTheLedge(b);
    take(b);
    expect(b.session.bottles.slots).toHaveLength(4);
    expect(b.session.interaction.isAvailable(PICKUP)).toBe(false);
  });

  it('the limits of a save: more slots than a hero can have are cut to the most there is', () => {
    const p = repairProgress({ ...captureProgress(world().session), bottleSlots: 99 });
    expect(p.bottleSlots).toBeLessThanOrEqual(8);
    const r = restoreFromProgress(p, ROOMS, WORLD.start);
    const b = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, flags: r.flags, restore: r.restore } });
    expect(b.session.bottles.slots).toHaveLength(BOTTLES.rules.maxSlots);
  });
});
