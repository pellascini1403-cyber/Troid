import { describe, expect, it } from 'vitest';
import { ROOMS, START, WORLD } from '@/content';
import { captureProgress, restoreFromProgress, VOLATILE_FLAG_PREFIX } from '@/gameplay/progress';
import type { GameEvents } from '@/gameplay/events';
import { newProgress, repairProgress } from '@/save/ProgressData';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { strikeOnPlayer } from '../helpers/combat';
import { driver, type Driver, type MakeOptions } from '../helpers/sim';

/**
 * Checkpoints and progress (docs/PROMPT6-LOG.md S24), on the REAL world: resting at a shrine makes it the place the hero comes back to
 * after a defeat — in ANY room, not only the one they fell in — and gives back life, magic and bottles; a saved game is what the
 * session captures, and a session begun from it is the same game.
 */
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };
const FLAGS = ['defeated:r1_slime', 'defeated:r2_slime'];

function world(room = 'r1_gate', entry?: string, extra: MakeOptions['extra'] = {}): Driver {
  const d = driver({ room: ROOMS[room]!, ...(entry ? { entry } : {}), unlocked: ['dash'], extra: { rooms: ROOMS, flags: FLAGS, ...QUICK, ...extra } });
  d.settle();
  return d;
}
const watch = (d: Driver, types: readonly (keyof GameEvents)[]): string[] => {
  const log: string[] = [];
  for (const t of types) d.session.bus.on(t, ((p: unknown) => void log.push(`${d.session.now} ${t}${p && typeof p === 'object' ? ' ' + JSON.stringify(p) : ''}`)) as never);
  return log;
};
/** Takes the hero to the shrine of the room and rests there with the Interact button. */
function restAtShrine(d: Driver): void {
  const shrine = d.session.room.interactables!.find((i) => i.kind === 'rest')!;
  d.teleport(shrine.x, shrine.y).settle();
  d.step(2);
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

describe('resting at a shrine', () => {
  it('the Interact button at the shrine makes the room\'s entry `rest` the checkpoint, announces it once, and the hero holds the pose', () => {
    const d = world('r2_hall', 'west');
    const log = watch(d, ['checkpoint:set', 'interaction:performed']);
    expect(d.session.checkpoint).toEqual({ room: 'r2_hall', entry: 'west' });
    restAtShrine(d);
    expect(d.session.checkpoint).toEqual({ room: 'r2_hall', entry: 'rest' });
    expect(log.filter((l) => l.includes('checkpoint:set'))).toHaveLength(1);
    expect(log.find((l) => l.includes('checkpoint:set'))).toMatch(/"room":"r2_hall","entry":"rest","x":1[23]/);
    expect(log.some((l) => l.includes('interaction:performed'))).toBe(true);
  });

  it('RESTING gives back life, magic and EVERY bottle (the one place the slow recharge is skipped)', () => {
    const d = world('r2_hall', 'west');
    d.p.health.damage(3);
    d.session.magic.set(10);
    d.session.bottles.consume(0);
    d.session.bottles.consume(1);
    expect(d.session.bottles.slots.map((b) => b.state)).toEqual(['recharging', 'empty', 'ready']); // one recharges at a time, the first empty from the left
    restAtShrine(d);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(d.session.magic.current).toBe(d.session.magic.max);
    expect(d.session.bottles.slots.map((b) => b.state)).toEqual(['ready', 'ready', 'ready']);
  });

  it('resting again at the same shrine is harmless: it announces again (the light plays again) and nothing breaks', () => {
    const d = world('r2_hall', 'west');
    const log = watch(d, ['checkpoint:set']);
    restAtShrine(d);
    restAtShrine(d);
    expect(log).toHaveLength(2);
    expect(d.session.checkpoint).toEqual({ room: 'r2_hall', entry: 'rest' });
  });

  it('a shrine that names an entry its room does not have does nothing (a content error never crashes the game)', () => {
    const room: RoomDefinition = {
      id: 'broken', regionId: 't', name: 'broken', bounds: rect(-1, -12, 40, 18), killY: -20,
      entries: [{ id: 'start', x: 4, y: 0 }],
      solids: [block('wl', -2, -12, 0, 18), block('wr', 39, -12, 41, 18), ground('g', 0, 39)],
      interactables: [{ id: 's', kind: 'rest', verbKey: 'interact.rest', x: 10, y: 0, actions: [{ type: 'checkpoint', entry: 'nowhere' }] }],
    };
    const d = driver({ room });
    d.settle();
    d.p.health.damage(2);
    d.teleport(10, 0).settle();
    d.step(2);
    d.tap('interact');
    d.step(14);
    expect(d.session.checkpoint).toEqual({ room: 'broken', entry: 'start' });
    expect(d.p.health.current).toBe(d.p.health.max - 2); // not even healed: nothing happened
  });

  it('nothing rests during a transition (the hero has no control) or while down', () => {
    const d = world('r2_hall', 'west');
    const log = watch(d, ['checkpoint:set']);
    const shrine = ROOMS.r2_hall!.interactables![0]!;
    d.teleport(shrine.x, shrine.y).settle();
    d.session.transition.begin('r2_hall', 'east', { room: 'r3_chamber', entry: 'west' });
    d.step(2);
    d.tap('interact');
    d.until(() => !d.session.transition.active, 100);
    expect(log).toEqual([]);
  });
});

describe('a defeat brings the hero back at the LAST CHECKPOINT', () => {
  it('rested in R2, fell in R2: back at R2\'s `rest` entry, alive, facing the room, the room built again (its slime is back)', () => {
    const d = world('r2_hall', 'west', { flags: ['defeated:r1_slime'] });
    restAtShrine(d);
    d.teleport(60, 0).settle();
    expect(d.session.entities.some((e) => e.kind === 'enemy')).toBe(true);
    const log = watch(d, ['death:respawned', 'room:loaded']);
    kill(d);
    comeBack(d);
    expect(d.p.health.dead).toBe(false);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(d.session.room.id).toBe('r2_hall');
    expect(d.body.x).toBeCloseTo(12.8, 6);
    expect(d.p.facing).toBe(1);
    expect(log.find((l) => l.includes('death:respawned'))).toContain('"roomId":"r2_hall","entryId":"rest"');
    expect(d.session.entities.some((e) => e.kind === 'enemy')).toBe(true);
  });

  it('rested in R2, fell in R3: the defeat crosses the rooms — back in R2, R3 is unloaded, nothing of it is left behind', () => {
    const d = world('r2_hall', 'west');
    restAtShrine(d);
    touch(d, 'east');
    expect(d.session.room.id).toBe('r3_chamber');
    expect(d.session.checkpoint, 'a transition does not move the checkpoint').toEqual({ room: 'r2_hall', entry: 'rest' });
    const listeners = d.session.bus.listenerCount();
    kill(d);
    comeBack(d);
    expect(d.session.room.id).toBe('r2_hall');
    expect(d.body.x).toBeCloseTo(12.8, 6);
    expect(d.p.health.dead).toBe(false);
    expect(d.session.collision.get('climb_1'), 'R3\'s geometry is gone').toBeUndefined();
    expect(d.session.collision.get('p1'), 'and R2\'s is built').toBeDefined();
    expect(d.session.arrival).toEqual({ room: 'r2_hall', entry: 'rest' });
    expect(d.session.bus.listenerCount()).toBe(listeners);
    expect(d.session.scheduler.pending).toBe(0);
  });

  it('never rested: the start of the world, whatever room the fall was in', () => {
    const d = world();
    touch(d, 'east');
    expect(d.session.room.id).toBe('r2_hall');
    kill(d);
    comeBack(d);
    expect(d.session.room.id).toBe('r1_gate');
    expect(d.body.x).toBeCloseTo(4, 6);
  });

  it('the LAST rest counts: rest in R2, then in R4, then fall: R4', () => {
    const d = world('r2_hall', 'west');
    restAtShrine(d);
    d.session.loadRoom('r4_sanctum', 'west'); // (stands in for the walk there; `loadRoom` also moves the checkpoint, so rest again below)
    restAtShrine(d);
    expect(d.session.checkpoint).toEqual({ room: 'r4_sanctum', entry: 'rest' });
    d.teleport(50, 0).settle();
    kill(d);
    comeBack(d);
    expect(d.session.room.id).toBe('r4_sanctum');
    expect(d.body.x).toBeCloseTo(14.8, 6);
  });

  it('falling again and again always comes back to the same place, and nothing leaks', () => {
    const d = world('r2_hall', 'west');
    restAtShrine(d);
    const listeners = d.session.bus.listenerCount();
    for (let i = 0; i < 6; i++) {
      d.teleport(40, 0).settle();
      kill(d);
      comeBack(d);
      expect(d.body.x).toBeCloseTo(12.8, 6);
    }
    expect(d.session.bus.listenerCount()).toBe(listeners);
    expect(d.session.scheduler.pending).toBe(0);
    expect(d.session.combat.count).toBe(world('r2_hall', 'west').session.combat.count);
  });

  it('what was won stays won across the fall: flags, the card, the bottles you have, and the checkpoint itself', () => {
    const d = world('r2_hall', 'west');
    d.session.loadout.acquire('card_spirit_bolt');
    d.session.flags.set('lever:x');
    restAtShrine(d);
    kill(d);
    comeBack(d);
    expect(d.session.flags.has('lever:x')).toBe(true);
    expect(d.session.loadout.equipped?.id).toBe('card_spirit_bolt');
    expect(d.session.abilities.has('magic_attack')).toBe(true);
    expect(d.session.checkpoint).toEqual({ room: 'r2_hall', entry: 'rest' });
    expect(d.p.health.current).toBe(d.p.health.max);
  });

  it('after a respawn the bottles are NOT refilled (the slow recharge is on purpose): only a rest does that', () => {
    const d = world('r2_hall', 'west');
    restAtShrine(d);
    d.session.bottles.consume(0);
    kill(d);
    comeBack(d);
    expect(d.session.bottles.slots[0]!.state).not.toBe('ready');
  });

  it('a session begun with its own checkpoint (a loaded game) comes back there, not at the entry it started at', () => {
    const d = world('r3_chamber', 'west', { checkpoint: { room: 'r2_hall', entry: 'rest' } });
    expect(d.session.checkpoint).toEqual({ room: 'r2_hall', entry: 'rest' });
    kill(d);
    comeBack(d);
    expect(d.session.room.id).toBe('r2_hall');
    expect(d.body.x).toBeCloseTo(12.8, 6);
  });
});

describe('a respawn ALWAYS has somewhere valid to go', () => {
  it('a checkpoint option that names a room or an entry the session does not have is ignored at the start', () => {
    for (const checkpoint of [{ room: 'nowhere', entry: 'rest' }, { room: 'r2_hall', entry: 'nowhere' }]) {
      const d = world('r1_gate', 'start', { checkpoint });
      expect(d.session.checkpoint).toEqual({ room: 'r1_gate', entry: 'start' });
    }
  });

  it('a checkpoint that stops existing (the room is gone from the registry) sends the hero to where the session began, with a warning-free respawn', () => {
    const rooms: Record<string, RoomDefinition> = { ...ROOMS };
    const d = driver({ room: ROOMS.r1_gate!, unlocked: ['dash'], extra: { rooms, flags: FLAGS, ...QUICK } });
    d.settle();
    // the session rests in a room that is then removed from what it can load: a stale checkpoint
    d.session.loadRoom('r1_gate', 'east');
    (d.session as unknown as { _checkpoint: { room: string; entry: string } })._checkpoint = { room: 'gone', entry: 'x' };
    kill(d);
    comeBack(d);
    expect(d.p.health.dead).toBe(false);
    expect(d.session.room.id).toBe('r1_gate');
    expect(d.session.checkpoint, 'the place the session began at').toEqual({ room: 'r1_gate', entry: 'start' });
  });

  it('falling out of the world is recoverable: a hole in R1 costs a point of life and puts the hero back on the last solid ground, alive', () => {
    const d = world('r1_gate', 'start', { flags: [] });
    d.teleport(30, 0).settle();
    d.right();
    d.until(() => d.body.y < -2, 200);
    d.stop();
    d.step(160);
    expect(d.p.health.dead).toBe(false);
    expect(d.body.y).toBeGreaterThanOrEqual(-0.01);
    expect(d.body.x).toBeLessThan(32);
    expect(d.session.room.id).toBe('r1_gate');
  });

  it('dying out of the world still brings the hero back at the checkpoint: the last point of life and a fall', () => {
    const d = world('r2_hall', 'west');
    restAtShrine(d);
    d.p.health.damage(d.p.health.current - 1);
    d.teleport(33, -3); // in the ditch, then straight out of the world
    d.session.player.body.y = -25;
    d.step(30);
    comeBack(d);
    expect(d.p.health.dead).toBe(false);
    expect(d.session.room.id).toBe('r2_hall');
  });
});

describe('capturing and restoring the progress', () => {
  it('a new game captures as a new game: the start of the world twice, nothing won, the abilities it begins with, three bottle slots', () => {
    const d = driver({ room: ROOMS[START.room]!, unlocked: [...START.unlocked], extra: { rooms: ROOMS } });
    expect(captureProgress(d.session)).toEqual(newProgress(WORLD.start, ['dash']));
  });

  it('captures where the hero is, the checkpoint, the flags, the abilities, the cards and the bottle slots — and nothing volatile', () => {
    const d = world('r2_hall', 'west', { flags: ['defeated:r1_slime'] });
    d.session.loadout.acquire('card_spirit_bolt');
    d.session.bottles.addSlot('energy_bottle');
    d.session.flags.set('taken:x');
    d.session.flags.set(`${VOLATILE_FLAG_PREFIX}arena_closed`);
    restAtShrine(d);
    touch(d, 'east');
    const p = captureProgress(d.session);
    expect(p.at).toEqual({ room: 'r3_chamber', entry: 'west' });
    expect(p.checkpoint).toEqual({ room: 'r2_hall', entry: 'rest' });
    expect(p.flags).toEqual(['defeated:r1_slime', 'taken:x']);
    expect(p.abilities).toEqual(['dash', 'magic_attack']);
    expect(p.cards).toEqual({ owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' });
    expect(p.bottleSlots).toBe(4);
    expect(p).toEqual(repairProgress(p));
  });

  it('a session begun from a capture is the same game: the same capture, the card equipped and usable, four bottles, the flags, and the checkpoint a defeat uses', () => {
    const a = world('r2_hall', 'west', { flags: ['defeated:r1_slime'] });
    a.session.loadout.acquire('card_spirit_bolt');
    a.session.bottles.addSlot('energy_bottle');
    restAtShrine(a);
    touch(a, 'east');
    const saved = captureProgress(a.session);

    const r = restoreFromProgress(saved, ROOMS, WORLD.start);
    expect(r.startRoom).toBe('r3_chamber');
    expect(r.startEntry).toBe('west');
    const b = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, checkpoint: r.checkpoint, flags: r.flags, restore: r.restore, ...QUICK } });
    b.settle();
    expect(captureProgress(b.session)).toEqual(saved);
    expect(b.session.loadout.equipped?.id).toBe('card_spirit_bolt');
    expect(b.session.abilities.has('magic_attack')).toBe(true);
    expect(b.session.bottles.slots).toHaveLength(4);
    expect(b.session.flags.has('defeated:r1_slime')).toBe(true);
    // and the card works: the Spirit Bolt costs 30
    const before = b.session.magic.current;
    b.tap('ability');
    b.step(20);
    expect(b.session.magic.current).toBeLessThan(before);
    // and a defeat in the loaded game goes to the saved checkpoint
    kill(b);
    comeBack(b);
    expect(b.session.room.id).toBe('r2_hall');
    expect(b.body.x).toBeCloseTo(12.8, 6);
  });

  it('a loaded game does not take what was taken again: a pickup whose flag is set is not there, and the card is not "acquired" a second time', () => {
    const a = world('interaction_test', 'start', { flags: [] });
    a.teleport(12, 0).settle();
    a.step(2);
    a.tap('interact');
    a.step(14);
    expect(a.session.loadout.has('card_spirit_bolt')).toBe(true);
    const saved = captureProgress(a.session);
    expect(saved.flags).toContain('taken:card_spirit_bolt');
    const r = restoreFromProgress(saved, ROOMS, WORLD.start);
    const b = driver({ room: ROOMS.interaction_test!, unlocked: r.unlocked, extra: { rooms: ROOMS, flags: r.flags, restore: r.restore } });
    const acquired = watch(b, ['card:changed', 'ability:unlocked']);
    b.settle();
    b.teleport(12, 0).settle();
    b.step(5);
    expect(b.session.interaction.current?.id, 'the card is not lying there again (the other pickup, 2 m away, is the one in reach)').not.toBe('card_spirit_bolt');
    b.tap('interact');
    b.step(14);
    expect(acquired).toEqual([]);
    expect(b.session.loadout.owned).toEqual(['card_spirit_bolt']);
  });

  it('a place the world does not have is never trusted: it falls back to the checkpoint, and then to the start', () => {
    const base = newProgress({ room: 'r2_hall', entry: 'rest' }, ['dash']);
    const ghostAt = restoreFromProgress({ ...base, at: { room: 'ghost', entry: 'x' } }, ROOMS, WORLD.start);
    expect([ghostAt.startRoom, ghostAt.startEntry]).toEqual(['r2_hall', 'rest']);
    const ghostBoth = restoreFromProgress({ ...base, at: { room: 'ghost', entry: 'x' }, checkpoint: { room: 'r2_hall', entry: 'ghost' } }, ROOMS, WORLD.start);
    expect([ghostBoth.startRoom, ghostBoth.startEntry]).toEqual(['r1_gate', 'start']);
    expect(ghostBoth.checkpoint).toEqual({ room: 'r1_gate', entry: 'start' });
    const empty = restoreFromProgress(repairProgress(null), ROOMS, WORLD.start);
    expect([empty.startRoom, empty.startEntry]).toEqual(['r1_gate', 'start']);
  });

  it('restoring more bottle slots than the game allows stops at the limit; fewer than the start keeps the start', () => {
    const many = driver({ room: ROOMS.r1_gate!, extra: { restore: { bottleSlots: 8 } } });
    expect(many.session.bottles.slots).toHaveLength(4);
    const few = driver({ room: ROOMS.r1_gate!, extra: { restore: { bottleSlots: 1 } } });
    expect(few.session.bottles.slots).toHaveLength(3);
  });

  it('a card the game does not know is dropped on restore, and an equipped card that is not owned is not equipped', () => {
    const d = driver({ room: ROOMS.r1_gate!, extra: { restore: { cards: { owned: ['card_spirit_bolt', 'card_ghost'], equipped: 'card_ghost' } } } });
    expect(d.session.loadout.owned).toEqual(['card_spirit_bolt']);
    expect(d.session.loadout.equipped).toBeNull();
  });
});
