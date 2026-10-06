import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { createPlayerStatus } from '@/gameplay/PlayerStatus';
import { captureProgress, restoreFromProgress } from '@/gameplay/progress';
import type { GameEvents } from '@/gameplay/events';
import { Seal } from '@/gameplay/Seal';
import { strikeOnPlayer } from '../helpers/combat';
import { jump, runTo, standOn } from '../helpers/hops';
import { breakTheSeal } from '../helpers/journey';
import { driver, type Driver, type MakeOptions } from '../helpers/sim';

/**
 * The Spirit Bolt in R3 (docs/PROMPT6-LOG.md S28), on the REAL world: the card no longer lies in R1 — it lies on R3's ledge, up a climb of two
 * jumps — taking it equips it, teaches the ability and enables the Ability button; and the way on is held by a ward of ink that only the bolt
 * breaks. The card is saved and stays taken; the seal stays broken; a hero who has not found the card cannot pass, and one who has cannot be
 * stopped by anything but the cost of the bolt.
 */
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };
const FLAGS = ['defeated:r1_slime', 'defeated:r2_slime'];
const CARD = 'card_spirit_bolt';
const TAKEN = 'taken:card_spirit_bolt';
const BROKEN = 'broken:r3_seal';

function r3(entry = 'west', extra: MakeOptions['extra'] = {}): Driver {
  const d = driver({ room: ROOMS.r3_chamber!, entry, unlocked: ['dash'], extra: { rooms: ROOMS, flags: FLAGS, ...QUICK, ...extra } });
  d.settle();
  return d;
}
const watch = (d: Driver, types: readonly (keyof GameEvents)[]): string[] => {
  const log: string[] = [];
  for (const t of types) d.session.bus.on(t, ((p: unknown) => void log.push(`${t}${p && typeof p === 'object' ? ' ' + JSON.stringify(p) : ''}`)) as never);
  return log;
};
const seal = (d: Driver): Seal | undefined => d.session.entities.find((e): e is Seal => e.kind === 'seal');
/** Up the climb to the ledge (two jumps), standing next to the card. */
function toTheCard(d: Driver): void {
  runTo(d, 21.6);
  jump(d);
  standOn(d, 2.4);
  runTo(d, 26.4);
  jump(d);
  standOn(d, 4.8);
  runTo(d, 33.6);
  d.stop();
  d.step(6);
}
const take = (d: Driver): void => {
  d.tap('interact');
  d.step(16);
};
const kill = (d: Driver): void => {
  d.p.health.damage(d.p.health.current - 1);
  strikeOnPlayer(d, { damage: 99 });
  d.step(1);
  expect(d.p.health.dead).toBe(true);
  d.until(() => !d.session.death.active, 400);
  d.step(10);
};

describe('the card on the ledge', () => {
  it('a hero who comes to R3 has no card, no ability and a bar that cannot be spent: Ability does nothing', () => {
    const d = r3();
    expect(d.session.loadout.equipped).toBeNull();
    expect(d.session.abilities.has('magic_attack')).toBe(false);
    d.tap('ability');
    d.step(30);
    expect(d.session.magic.current).toBe(100);
    expect(d.session.entities.some((e) => e.kind === 'projectile')).toBe(false);
  });

  it('it is reached by the climb — a step at 2.4 m, then the ledge at 4.8 m — and the icon is on the card', () => {
    const d = r3();
    toTheCard(d);
    expect(d.body.y).toBeCloseTo(4.8, 1);
    expect(d.session.interaction.current?.id).toBe(CARD);
  });

  it('taking it equips the card, teaches the ability, writes the flag and leaves the hero in the pose for 12 ticks — all in the same press', () => {
    const d = r3();
    const log = watch(d, ['card:changed', 'ability:unlocked', 'flag:set', 'interaction:performed']);
    toTheCard(d);
    d.tap('interact');
    d.step(1);
    expect(d.p.controller.state).toBe('interact');
    d.step(15);
    expect(d.session.loadout.equipped?.id).toBe(CARD);
    expect(d.session.abilities.has('magic_attack')).toBe(true);
    expect(d.session.flags.has(TAKEN)).toBe(true);
    expect(log.filter((l) => l.startsWith('card:changed')).map((l) => JSON.parse(l.slice('card:changed '.length)).type)).toEqual(['acquired', 'equipped']);
    expect(log.filter((l) => l.startsWith('ability:unlocked'))).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('interaction:performed'))).toHaveLength(1);
    expect(d.session.interaction.current, 'the icon goes with the card').toBeNull();
  });

  it('the HUD hears of it: the status shows the card equipped and ready, and the Ability button of the touch layer follows it', () => {
    const d = r3();
    const before = createPlayerStatus();
    d.session.status(before);
    expect(before.card.equipped).toBe(false);
    toTheCard(d);
    take(d);
    const after = createPlayerStatus();
    d.session.status(after);
    expect(after.card).toMatchObject({ equipped: true, id: CARD, state: 'ready' });
  });

  it('it can be taken once, and the Ability works at once: a bolt, 30 magic', () => {
    const d = r3();
    toTheCard(d);
    take(d);
    const log = watch(d, ['card:changed', 'interaction:performed']);
    for (let i = 0; i < 20; i++) {
      d.tap('interact');
      d.step(2);
    }
    expect(log).toEqual([]);
    d.tap('ability');
    d.step(20);
    expect(d.session.magic.current).toBeLessThanOrEqual(70.5);
  });

  it('there is no way to get it without the climb: from the floor, or from the step alone, nothing is in reach of the icon', () => {
    const d = r3();
    for (const [x, y] of [[34.5, 0], [24, 2.4], [28, 0]] as const) {
      d.teleport(x, y).settle();
      d.step(3);
      expect(d.session.interaction.current, `at (${x}, ${y})`).toBeNull();
    }
  });
});

describe('the card stays taken', () => {
  it('through a defeat: the hero comes back with the card equipped, and the ledge is empty', () => {
    const d = r3();
    toTheCard(d);
    take(d);
    kill(d);
    expect(d.session.loadout.equipped?.id).toBe(CARD);
    expect(d.session.abilities.has('magic_attack')).toBe(true);
    expect(d.session.flags.has(TAKEN)).toBe(true);
    d.session.loadRoom('r3_chamber', 'west');
    d.settle();
    d.teleport(33.6, 4.8).settle();
    d.step(3);
    expect(d.session.interaction.current).toBeNull();
  });

  it('a defeat BEFORE taking it loses nothing: the card is still there, once', () => {
    const d = r3();
    kill(d);
    d.session.loadRoom('r3_chamber', 'west');
    d.settle();
    toTheCard(d);
    expect(d.session.interaction.current?.id).toBe(CARD);
  });

  it('through a transition away and back', () => {
    const d = r3();
    toTheCard(d);
    take(d);
    d.teleport(1.2, 0);
    d.step(1);
    d.until(() => !d.session.transition.active, 100);
    expect(d.session.room.id).toBe('r2_hall');
    d.teleport(89.5, 0);
    d.step(1);
    d.until(() => !d.session.transition.active, 100);
    expect(d.session.room.id).toBe('r3_chamber');
    expect(d.session.loadout.equipped?.id).toBe(CARD);
    expect(d.session.interaction.isAvailable(CARD)).toBe(false);
  });

  it('through a saved game: the card, the ability and the flag come back, and the pickup is not built again', () => {
    const a = r3();
    toTheCard(a);
    take(a);
    const saved = captureProgress(a.session);
    expect(saved.cards).toEqual({ owned: [CARD], equipped: CARD });
    expect(saved.abilities).toContain('magic_attack');
    expect(saved.flags).toContain(TAKEN);
    const r = restoreFromProgress(saved, ROOMS, WORLD.start);
    const b = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, checkpoint: r.checkpoint, flags: r.flags, restore: r.restore, ...QUICK } });
    b.settle();
    expect(b.session.loadout.equipped?.id).toBe(CARD);
    expect(b.session.abilities.has('magic_attack')).toBe(true);
    expect(b.session.interaction.isAvailable(CARD)).toBe(false);
    b.tap('ability');
    b.step(20);
    expect(b.session.magic.current).toBeLessThan(100);
  });
});

describe('the seal holds the way on', () => {
  it('there is one ward in R3 and it is whole at the start, with the door shut', () => {
    const d = r3();
    expect(seal(d)?.broken).toBe(false);
    expect(d.session.gateOpen('seal_gate')).toBe(false);
    expect(d.session.flags.has(BROKEN)).toBe(false);
  });

  it('nothing but the bolt gets through: walking, jumping from the ledge and dashing all stop at the door, and the way out does nothing', () => {
    const d = r3();
    d.teleport(58, 0).settle();
    d.right();
    d.step(200);
    expect(d.body.x).toBeLessThan(63);
    d.stop();
    // from the high ledge, as far as a jump and a dash go
    d.teleport(39.5, 4.8).settle();
    d.right();
    jump(d);
    d.tap('dash');
    d.step(240);
    d.stop();
    expect(d.body.x).toBeLessThan(63);
    expect(d.session.exitsReached.has('east')).toBe(false);
  });

  it('the sword is turned away, as often as it swings: the ward never takes a scratch, the hero never a hit, the door never opens', () => {
    const d = r3();
    const log = watch(d, ['seal:rejected', 'combat:hit', 'gate:changed']);
    d.teleport(60.2, 0).settle();
    for (let i = 0; i < 8; i++) {
      d.tap('attack');
      d.step(26);
    }
    expect(log.filter((l) => l.startsWith('seal:rejected')).length).toBeGreaterThanOrEqual(4);
    expect(log.filter((l) => l.startsWith('combat:hit'))).toEqual([]);
    expect(log.filter((l) => l.startsWith('gate:changed'))).toEqual([]);
    expect(seal(d)?.broken).toBe(false);
    expect(d.p.health.current).toBe(d.p.health.max);
  });

  it('the Spirit Bolt breaks it from the lane: one cast from 11 m, the door opens, the exit works', () => {
    const d = r3();
    toTheCard(d);
    take(d);
    d.teleport(52, 0).settle();
    d.step(6);
    const log = watch(d, ['combat:hit', 'actor:died', 'gate:changed', 'flag:set']);
    d.tap('ability');
    d.step(80);
    expect(log.filter((l) => l.startsWith('combat:hit')).map((l) => JSON.parse(l.slice('combat:hit '.length)).killed)).toEqual([true]);
    expect(d.session.flags.has(BROKEN)).toBe(true);
    expect(d.session.gateOpen('seal_gate')).toBe(true);
    d.teleport(77, 0);
    d.step(2);
    expect(d.session.exitsReached.has('east')).toBe(true);
  });

  it('and the whole route is possible with the buttons of a person: the climb, the card, the bolt (the journey script)', () => {
    const d = r3();
    breakTheSeal(d);
    expect(d.session.flags.has(TAKEN)).toBe(true);
    expect(d.session.flags.has(BROKEN)).toBe(true);
    expect(d.session.gateOpen('seal_gate')).toBe(true);
    expect(d.p.health.current).toBe(d.p.health.max);
  });

  it('a hero who is out of magic cannot break it — and gets back to being able to: the bar fills at 6 per second', () => {
    const d = r3();
    toTheCard(d);
    take(d);
    d.teleport(52, 0).settle();
    d.session.magic.set(0);
    d.tap('ability');
    d.step(40);
    expect(seal(d)?.broken).toBe(false);
    d.step(60 * 6); // 6 s: 36 magic, and the bolt costs 30
    d.tap('ability');
    d.step(80);
    expect(seal(d)?.broken ?? true).toBe(true);
    expect(d.session.flags.has(BROKEN)).toBe(true);
  });
});

describe('a broken seal stays broken', () => {
  it('through a defeat, a transition and a saved game: no ward, an open door, a working exit', () => {
    const d = r3();
    breakTheSeal(d);
    kill(d);
    d.session.loadRoom('r3_chamber', 'west');
    d.settle();
    expect(seal(d)).toBeUndefined();
    expect(d.session.gateOpen('seal_gate')).toBe(true);
    const saved = captureProgress(d.session);
    expect(saved.flags).toEqual(expect.arrayContaining([TAKEN, BROKEN]));
    const r = restoreFromProgress(saved, ROOMS, WORLD.start);
    const b = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, checkpoint: r.checkpoint, flags: r.flags, restore: r.restore, ...QUICK } });
    b.settle();
    b.session.loadRoom('r3_chamber', 'west');
    b.settle();
    expect(seal(b)).toBeUndefined();
    expect(b.session.gateOpen('seal_gate')).toBe(true);
    b.teleport(77, 0);
    b.step(2);
    expect(b.session.exitsReached.has('east')).toBe(true);
  });

  it('a hero who comes BACK from R4 finds the door open', () => {
    const d = r3('east', { flags: [...FLAGS, TAKEN, BROKEN] });
    expect(d.session.gateOpen('seal_gate')).toBe(true);
    d.left();
    d.step(400);
    expect(d.body.x).toBeLessThan(55);
  });
});
