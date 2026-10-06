import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { DEFAULT_TRANSITION } from '@/gameplay/RoomTransition';
import type { GameEvents } from '@/gameplay/events';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { buildWorldGraph, analyzeProgression } from '@/world/worldGraph';
import { strikeOnPlayer } from '../helpers/combat';
import { driver, makeSession, type Driver, type MakeOptions } from '../helpers/sim';

/**
 * Room transitions (docs/PROMPT6-LOG.md S23), played on the REAL world: touching an exit that leads somewhere fades out, swaps the
 * room in a single step, puts the player at the entry the exit names and fades in — with the hero's control held the whole time,
 * one transition at a time, and a defeat in the middle bringing the player back instead of leaving them stuck between two rooms.
 */
const T = DEFAULT_TRANSITION;
const WHOLE = T.fadeOut + T.hold + T.fadeIn;
const FLAGS = ['defeated:r1_slime', 'defeated:r2_slime'];

/** A session on the whole world, starting in `room` at `entry`, with the guardians' flags set (so nothing is in the way). */
function world(room = 'r1_gate', entry?: string, extra: MakeOptions['extra'] = {}): Driver {
  const d = driver({ room: ROOMS[room]!, ...(entry ? { entry } : {}), unlocked: ['dash'], extra: { rooms: ROOMS, flags: FLAGS, ...extra } });
  d.settle();
  return d;
}

/** The centre of an exit zone, on its floor. */
function zoneOf(d: Driver, exitId: string): { x: number; y: number } {
  const x = d.session.room.exits!.find((e) => e.id === exitId)!.rect;
  return { x: (x.x0 + x.x1) / 2, y: x.y0 };
}
const touch = (d: Driver, exitId: string): void => {
  const z = zoneOf(d, exitId);
  d.teleport(z.x, z.y);
};
/** Walks into an exit and lets the whole transition play. */
function through(d: Driver, exitId: string): void {
  touch(d, exitId);
  d.step(1);
  expect(d.session.transition.active, `${d.session.room.id}/${exitId} started a transition`).toBe(true);
  d.until(() => !d.session.transition.active, WHOLE + 20);
  d.settle();
}

const EVENTS = ['exit:reached', 'transition:started', 'transition:fadeOut', 'transition:fadeIn', 'transition:finished', 'transition:cancelled', 'room:exiting', 'room:loaded', 'room:entered', 'death:started', 'death:respawned', 'player:died'] as const;
/** What happened, in order, with the tick it happened at. */
function watch(d: Driver, types: readonly (keyof GameEvents)[] = EVENTS): string[] {
  const log: string[] = [];
  for (const t of types) d.session.bus.on(t, ((p: unknown) => void log.push(`${d.session.now} ${t}${p && typeof p === 'object' ? ' ' + JSON.stringify(p) : ''}`)) as never);
  return log;
}
const count = (log: string[], type: string): number => log.filter((l) => l.split(' ')[1] === type).length;

describe('a transition: from touching an exit to having control again', () => {
  it('R1 → R2: fade out, the swap, black, fade in; the player appears at R2\'s west entry facing the room', () => {
    const d = world();
    const log = watch(d);
    touch(d, 'east');
    d.step(1);
    const detected = d.session.now; // the tick that saw the exit: the fade out began in it
    expect(d.session.transition.phase).toBe('fadeOut');
    expect(d.session.room.id).toBe('r1_gate'); // the old room is still the room while it fades
    expect(count(log, 'exit:reached')).toBe(1);
    d.until(() => d.session.room.id === 'r2_hall', WHOLE);
    // the swap is when the fade out's timer is due: `fadeOut` simulated ticks after the one that saw the exit, counting that one
    expect(d.session.now - detected).toBe(T.fadeOut - 1);
    expect(d.session.transition.phase).toBe('hold');
    expect(d.body.x).toBeCloseTo(4, 6);
    expect(d.body.y).toBeCloseTo(0, 1);
    expect(d.p.facing).toBe(1);
    d.until(() => !d.session.transition.active, WHOLE);
    expect(d.session.now - detected).toBe(WHOLE - 1);
    // the order the interface relies on
    const order = log.map((l) => l.split(' ')[1]);
    expect(order).toEqual(['exit:reached', 'transition:started', 'transition:fadeOut', 'room:exiting', 'room:loaded', 'room:entered', 'transition:fadeIn', 'transition:finished']);
    const started_ = JSON.parse(log.find((l) => l.includes('transition:started'))!.replace(/^\d+ transition:started /, ''));
    expect(started_).toEqual({ from: 'r1_gate', exitId: 'east', to: { room: 'r2_hall', entry: 'west' }, ticks: WHOLE });
    expect(log.find((l) => l.includes('room:entered'))).toContain('"from":"r1_gate"');
    expect(log.find((l) => l.includes('transition:finished'))).toContain('"room":"r2_hall"');
    expect(d.session.exitsReached.size, 'arriving does not touch an exit').toBe(0);
    expect(d.p.health.dead).toBe(false);
  });

  it('the walk forward: R1 → R2 → R3 → R4, each arrival at the west entry of the next room', () => {
    const d = world();
    const expected: Array<[string, number]> = [['r2_hall', 4], ['r3_chamber', 4], ['r4_sanctum', 4]];
    for (const [room, x] of expected) {
      through(d, 'east');
      expect(d.session.room.id).toBe(room);
      expect(d.body.x).toBeCloseTo(x, 6);
      expect(d.p.facing).toBe(1);
    }
  });

  it('and the walk back: R4 → R3 → R2 → R1, each arrival at the EAST entry of the previous room, facing the room', () => {
    const d = world('r4_sanctum', 'west');
    const expected: Array<[string, number]> = [['r3_chamber', 72.5], ['r2_hall', 84.5], ['r1_gate', 106.6]];
    for (const [room, x] of expected) {
      through(d, 'west');
      expect(d.session.room.id).toBe(room);
      expect(d.body.x).toBeCloseTo(x, 6);
      expect(d.p.facing).toBe(-1);
    }
  });

  it('EVERY exit of the world that leads somewhere arrives at the entry it names (position, facing, on the ground), without bouncing back', () => {
    const graph = buildWorldGraph(WORLD, ROOMS);
    expect(graph.edges.length).toBe(6);
    for (const e of graph.edges) {
      const d = world(e.from);
      through(d, e.exit);
      const entry = ROOMS[e.to.room]!.entries.find((n) => n.id === e.to.entry)!;
      expect(d.session.room.id, `${e.from}/${e.exit}`).toBe(e.to.room);
      expect(d.body.x, `${e.from}/${e.exit}`).toBeCloseTo(entry.x, 6);
      expect(d.body.y, `${e.from}/${e.exit}`).toBeCloseTo(entry.y, 1);
      expect(d.p.facing).toBe(entry.facing ?? 1);
      expect(d.body.grounded).toBe(true);
      d.step(120);
      expect(d.session.room.id, `${e.from}/${e.exit} does not throw the player back`).toBe(e.to.room);
      expect(d.session.transition.active).toBe(false);
    }
  });

  it('the player keeps what they are: life, magic, the card, the bottles and every flag go through', () => {
    const d = world('r2_hall', 'west');
    d.p.health.damage(2);
    d.session.magic.set(55);
    d.session.loadout.acquire('card_spirit_bolt');
    d.session.flags.set('lever:test');
    const bottles = d.session.bottles.slots.map((b) => b.state);
    through(d, 'east');
    expect(d.p.health.current).toBe(d.p.health.max - 2);
    expect(d.session.magic.current).toBeGreaterThanOrEqual(55);
    expect(d.session.loadout.equipped?.id).toBe('card_spirit_bolt');
    expect(d.session.flags.has('lever:test')).toBe(true);
    expect(d.session.bottles.slots.map((b) => b.state)).toEqual(bottles);
  });

  it('the arrival becomes the respawn point of the new room', () => {
    const d = world();
    expect(d.session.respawnPoint).toEqual({ room: 'r1_gate', entry: 'start' });
    through(d, 'east');
    expect(d.session.respawnPoint).toEqual({ room: 'r2_hall', entry: 'west' });
    through(d, 'west');
    expect(d.session.respawnPoint).toEqual({ room: 'r1_gate', entry: 'east' });
  });

  it('phases last what the definition says: fade out 12, black 6, fade in 14 (measured on the ticks of the events)', () => {
    const d = world();
    const log = watch(d, ['transition:fadeOut', 'room:loaded', 'transition:fadeIn', 'transition:finished']);
    touch(d, 'east');
    d.step(WHOLE + 5);
    const tickOf = (type: string): number => Number(log.find((l) => l.split(' ')[1] === type)!.split(' ')[0]);
    const t0 = tickOf('transition:fadeOut');
    expect(tickOf('room:loaded') - t0).toBe(T.fadeOut - 1); // (the tick that saw the exit counts as the first of the fade out)
    expect(tickOf('transition:fadeIn') - tickOf('room:loaded')).toBe(T.hold);
    expect(tickOf('transition:finished') - tickOf('transition:fadeIn')).toBe(T.fadeIn);
    expect(d.session.transition.phase).toBe('none');
  });

  it('the snapshot the overlay reads follows the phases in order and never goes backwards', () => {
    const d = world();
    touch(d, 'east');
    const seen: string[] = [];
    const ticks: number[] = [];
    for (let i = 0; i < WHOLE + 3; i++) {
      d.step(1);
      const s = d.session.transitionSnapshot;
      seen.push(s.phase);
      ticks.push(s.ticks);
      expect(s.ticks).toBeLessThanOrEqual(s.length);
    }
    const order = ['fadeOut', 'hold', 'fadeIn', 'none'];
    const firsts = order.map((p) => seen.indexOf(p));
    expect(firsts.every((i) => i >= 0)).toBe(true);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    expect(seen[0]).toBe('fadeOut');
    expect(seen[seen.length - 1]).toBe('none');
    // within a phase the counter only grows
    for (let i = 1; i < seen.length; i++) if (seen[i] === seen[i - 1]) expect(ticks[i]!).toBeGreaterThanOrEqual(ticks[i - 1]!);
  });

  it('a different definition is honoured', () => {
    const d = world('r1_gate', undefined, { transition: { fadeOut: 3, hold: 2, fadeIn: 4 } });
    touch(d, 'east');
    d.step(1);
    let n = 1;
    while (d.session.transition.active) {
      d.step(1);
      n++;
    }
    expect(n).toBe(3 + 2 + 4);
    expect(d.session.room.id).toBe('r2_hall');
  });
});

describe('the hero\'s control is held for the whole transition', () => {
  it('no button does anything: not an attack, a jump, a dash, a bolt, an interaction or a drink; the stick does not walk', () => {
    const d = world('r2_hall', 'west');
    d.session.loadout.acquire('card_spirit_bolt');
    d.p.health.damage(2); // so that drinking would be possible
    const log = watch(d, ['player:attacked', 'player:jumped', 'player:dashed', 'skill:cast', 'interaction:performed', 'bottle:drinkStarted']);
    touch(d, 'east');
    d.step(1);
    const x0 = d.body.x;
    d.right();
    for (const b of ['attack', 'jump', 'dash', 'ability', 'interact', 'bottle'] as const) d.press(b);
    // still in the old room: the stick does not walk them out of where they stand
    for (;;) {
      d.step(1);
      if (d.session.room.id !== 'r2_hall') break;
      expect(Math.abs(d.body.x - x0), 'the stick did not walk them').toBeLessThan(0.6);
    }
    // in the new one: they stand at the entry until control returns
    while (d.session.transition.active) {
      d.step(1);
      expect(d.body.x).toBeCloseTo(4, 1);
    }
    expect(log, 'nothing the hero did was seen').toEqual([]);
  });

  it('an attack that was in the air when the exit was touched does not follow the player into the next room', () => {
    const d = world('r2_hall', 'west');
    d.teleport(zoneOf(d, 'east').x - 6, 0).settle();
    d.tap('attack');
    d.step(3);
    expect(d.p.combat.attack).not.toBeNull();
    touch(d, 'east');
    d.until(() => d.session.room.id === 'r3_chamber', WHOLE);
    expect(d.p.combat.attack, 'the swing ended with the old room').toBeNull();
    expect(d.p.controller.state).not.toBe('attack');
    expect(d.session.combat.count, 'only the hero is in the combat system of a room with no enemy').toBe(1);
  });

  it('control comes back on the tick the transition finishes: the very next jump works', () => {
    const d = world();
    const jumped = watch(d, ['player:jumped']);
    through(d, 'east');
    expect(jumped).toEqual([]);
    d.tap('jump');
    expect(jumped.length).toBe(1);
  });

  it('a press made during the transition is not remembered afterwards (no jump the moment control returns)', () => {
    const d = world();
    const jumped = watch(d, ['player:jumped', 'player:attacked']);
    touch(d, 'east');
    d.step(2);
    d.press('jump');
    d.press('attack');
    d.step(WHOLE);
    d.release('jump');
    d.release('attack');
    d.step(30);
    expect(jumped).toEqual([]);
  });
});

describe('one transition at a time', () => {
  it('touching the same exit again or another one while it runs starts nothing: one `transition:started`, the first destination', () => {
    const d = world('r2_hall', 'west');
    const log = watch(d);
    touch(d, 'east');
    d.step(3);
    expect(d.session.transition.phase).toBe('fadeOut');
    touch(d, 'west'); // the other way out, in the middle of the fade
    d.step(2);
    touch(d, 'east');
    d.step(2);
    d.until(() => !d.session.transition.active, WHOLE + 5);
    expect(count(log, 'transition:started')).toBe(1);
    expect(count(log, 'transition:finished')).toBe(1);
    expect(d.session.room.id).toBe('r3_chamber');
    expect(count(log, 'room:entered')).toBe(1);
  });

  it('`begin` is refused while one runs, and returns true when it starts one', () => {
    const d = world();
    expect(d.session.transition.begin('r1_gate', 'east', { room: 'r2_hall', entry: 'west' })).toBe(true);
    expect(d.session.transition.begin('r1_gate', 'east', { room: 'r2_hall', entry: 'west' })).toBe(false);
    d.until(() => !d.session.transition.active, WHOLE + 5);
    expect(d.session.transition.begin('r2_hall', 'west', { room: 'r1_gate', entry: 'east' })).toBe(true);
  });

  it('two transitions back to back are fine: nothing is left over from the first', () => {
    const d = world();
    const log = watch(d);
    through(d, 'east');
    through(d, 'east');
    expect(d.session.room.id).toBe('r3_chamber');
    expect(count(log, 'transition:started')).toBe(2);
    expect(count(log, 'transition:finished')).toBe(2);
    expect(d.session.scheduler.pending, 'no timer of a finished transition is left').toBe(0);
  });
});

describe('nothing is duplicated and nothing is left behind', () => {
  it('the old room\'s enemies, hitboxes and colliders go; the new room has exactly its own (R1 with the slime alive → R2)', () => {
    const d = world('r1_gate', 'start', { flags: [] });
    d.session.flags.set('defeated:r1_slime'); // the door opens and the slime stays beaten: the room had one slime until now
    const fresh = world('r2_hall', 'west', { flags: [] });
    through(d, 'east');
    expect(d.session.room.id).toBe('r2_hall');
    expect(d.session.entities.length).toBe(fresh.session.entities.length);
    expect(d.session.entities.every((e) => e.kind === 'enemy')).toBe(true);
    expect(d.session.combat.count).toBe(fresh.session.combat.count);
    expect(d.session.collision.get('p1')).toBeDefined();
    expect(d.session.collision.get('gate_door')).toBeUndefined(); // R1's door is gone with R1
  });

  it('40 round trips R1 ⇄ R2 leave no listener, timer, entity, collider or hitbox behind', () => {
    const d = world();
    const listeners = d.session.bus.listenerCount();
    const ref = world('r2_hall', 'west');
    for (let i = 0; i < 40; i++) {
      through(d, 'east');
      d.step(5);
      through(d, 'west');
      d.step(5);
    }
    expect(d.session.room.id).toBe('r1_gate');
    expect(d.session.bus.listenerCount()).toBe(listeners);
    expect(d.session.scheduler.pending).toBe(0);
    expect(d.session.entities.length).toBe(world('r1_gate').session.entities.length);
    expect(d.session.combat.count).toBe(world('r1_gate').session.combat.count);
    through(d, 'east');
    expect(d.session.combat.count).toBe(ref.session.combat.count);
    expect(d.session.entities.length).toBe(ref.session.entities.length);
  });

  it('what was beaten stays beaten across a transition: R2\'s slime is placed while its flag is clear and not once it is set', () => {
    const alive = world('r1_gate', 'east', { flags: ['defeated:r1_slime'] });
    through(alive, 'east');
    expect(alive.session.room.id).toBe('r2_hall');
    expect(alive.session.entities.filter((e) => e.kind === 'enemy')).toHaveLength(1);
    const beaten = world('r1_gate', 'east', { flags: ['defeated:r1_slime', 'defeated:r2_slime'] });
    through(beaten, 'east');
    expect(beaten.session.entities.filter((e) => e.kind === 'enemy')).toHaveLength(0);
  });
});

describe('a defeat is never a dead end', () => {
  const quick = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };

  it('dying in the middle of the fade out calls the transition off: no swap, and the defeat flow brings the player back where they started the room', () => {
    const d = world('r1_gate', 'start', quick);
    const log = watch(d);
    touch(d, 'east');
    d.step(3);
    expect(d.session.transition.phase).toBe('fadeOut');
    d.p.health.damage(d.p.health.current - 1);
    strikeOnPlayer(d, { damage: 99 });
    d.step(1);
    expect(d.p.health.dead).toBe(true);
    expect(d.session.transition.active, 'the transition was called off').toBe(false);
    expect(count(log, 'transition:cancelled')).toBe(1);
    expect(log.find((l) => l.includes('transition:cancelled'))).toContain('"reason":"death"');
    d.until(() => !d.session.death.active, 300);
    d.step(40);
    expect(d.p.health.dead).toBe(false);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(d.session.room.id, 'it did not go on to the next room under a hero who was down').toBe('r1_gate');
    expect(d.body.x).toBeCloseTo(4, 0); // the entry the room was entered by
    expect(count(log, 'room:entered')).toBe(0);
    expect(count(log, 'transition:finished')).toBe(0);
    expect(d.session.scheduler.pending).toBe(0);
  });

  it('dying right after the swap (in the black or the fade in) brings the player back at the entry they arrived by', () => {
    const d = world('r1_gate', 'start', quick);
    const log = watch(d);
    through(d, 'east'); // a first full transition to have arrived somewhere
    touch(d, 'east');
    d.until(() => d.session.room.id === 'r3_chamber', WHOLE);
    expect(d.session.transition.phase).toBe('hold');
    d.p.health.damage(d.p.health.current - 1);
    strikeOnPlayer(d, { damage: 99 });
    d.step(1);
    expect(d.p.health.dead).toBe(true);
    expect(d.session.transition.active).toBe(false);
    d.until(() => !d.session.death.active, 300);
    d.step(30);
    expect(d.p.health.dead).toBe(false);
    expect(d.session.room.id).toBe('r3_chamber');
    expect(d.body.x).toBeCloseTo(4, 0);
    expect(d.session.flags.has('defeated:r1_slime')).toBe(true); // what was won stays won
    expect(count(log, 'transition:cancelled')).toBe(1);
  });

  it('dying on the very tick the exit is touched starts no transition at all', () => {
    const d = world('r1_gate', 'start', quick);
    const log = watch(d);
    touch(d, 'east');
    d.p.health.damage(d.p.health.current - 1);
    strikeOnPlayer(d, { damage: 99 });
    d.step(2);
    expect(d.p.health.dead).toBe(true);
    expect(count(log, 'transition:started')).toBe(0);
    d.until(() => !d.session.death.active, 300);
    d.step(60);
    expect(d.session.room.id).toBe('r1_gate');
    expect(count(log, 'transition:started')).toBe(0);
    expect(d.p.health.dead).toBe(false);
  });

  it('an exit touched while the defeat flow is bringing the player back waits for it to end, then goes through', () => {
    const d = world('r1_gate', 'start', { death: { dying: 4, fadeOut: 3, hold: 3, fadeIn: 30, skipAfter: 1 } });
    d.p.health.damage(d.p.health.current - 1);
    strikeOnPlayer(d, { damage: 99 });
    d.step(1);
    d.until(() => d.session.death.phase === 'fadeIn', 200);
    expect(d.p.health.dead).toBe(false);
    touch(d, 'east');
    d.step(4);
    expect(d.session.transition.active, 'not while the fade in of the defeat is playing').toBe(false);
    expect(d.session.exitsReached.size).toBe(0); // and the zone was not spent
    d.until(() => d.session.transition.active, 100);
    expect(d.session.death.active).toBe(false);
    d.until(() => !d.session.transition.active, WHOLE + 5);
    expect(d.session.room.id).toBe('r2_hall');
  });

  it('loading a room by hand in the middle of a transition cancels it: it never swaps afterwards', () => {
    const d = world();
    const log = watch(d);
    touch(d, 'east');
    d.step(4);
    d.session.loadRoom('r1_gate', 'start');
    expect(d.session.transition.active).toBe(false);
    expect(log.find((l) => l.includes('transition:cancelled'))).toContain('"reason":"reload"');
    d.step(WHOLE * 2);
    expect(d.session.room.id).toBe('r1_gate');
    expect(count(log, 'room:entered')).toBe(0);
  });
});

describe('what an exit does and does not do', () => {
  it('a hit-stop in the middle only delays it: the transition still finishes, and no tick is lost', () => {
    const d = world();
    touch(d, 'east');
    d.step(2);
    d.session.requestHitStop(10);
    d.until(() => !d.session.transition.active, WHOLE + 20);
    expect(d.session.room.id).toBe('r2_hall');
  });

  it('an exit that is shut (`requires`) does nothing: no event, no transition, and it is not spent — when the flag is set the player standing there goes through', () => {
    const d = world('r1_gate', 'east', { flags: [] });
    const log = watch(d);
    d.session.collision.get('gate_door')!.enabled = false; // (the door is not what is under test: the flag the exit asks for is)
    touch(d, 'east');
    d.step(10);
    expect(log).toEqual([]);
    expect(d.session.exitsReached.size).toBe(0);
    d.session.flags.set('defeated:r1_slime');
    d.step(1);
    expect(d.session.transition.active).toBe(true);
    expect(count(log, 'exit:reached')).toBe(1);
  });

  it('an exit with no destination (a test room) only raises the event: no transition, nothing swapped', () => {
    const d = driver({ room: ROOMS.interaction_test!, extra: { rooms: ROOMS } });
    d.settle();
    const log = watch(d);
    const x = ROOMS.interaction_test!.exits![0]!.rect;
    d.teleport((x.x0 + x.x1) / 2, 0);
    d.step(5);
    expect(count(log, 'exit:reached')).toBe(1);
    expect(d.session.transition.active).toBe(false);
    expect(d.session.room.id).toBe('interaction_test');
  });

  it('an exit that leads to a room this session was not given raises the event and does not crash (a test that walks one room)', () => {
    const d = driver({ room: ROOMS.r1_gate!, unlocked: ['dash'], extra: { flags: FLAGS } });
    d.settle();
    const log = watch(d);
    touch(d, 'east');
    d.step(5);
    expect(count(log, 'exit:reached')).toBe(1);
    expect(d.session.transition.active).toBe(false);
    expect(d.session.room.id).toBe('r1_gate');
  });

  it('the end of the world is an exit with no destination: it raises the event and nothing else', () => {
    const d = world('r4_sanctum', 'west');
    const log = watch(d);
    touch(d, 'east');
    d.step(3);
    expect(count(log, 'exit:reached')).toBe(1);
    expect(d.session.transition.active).toBe(false);
    expect(d.session.room.id).toBe('r4_sanctum');
  });
});

describe('determinism', () => {
  const journey = (): string[] => {
    const d = world();
    const log = watch(d);
    through(d, 'east');
    d.right();
    d.step(40);
    through(d, 'east');
    d.tap('jump');
    d.step(30);
    through(d, 'west');
    d.stop();
    log.push(`end ${d.session.now} ${d.session.room.id} ${d.body.x.toFixed(9)} ${d.body.y.toFixed(9)} ${d.session.rng.state}`);
    return log;
  };

  it('the same journey through the world gives the same events on the same ticks, bit for bit', () => {
    const a = journey();
    expect(a.length).toBeGreaterThan(20);
    expect(journey()).toEqual(a);
  });
});

describe('the world played through transitions agrees with the graph on paper', () => {
  it('following every exit from the start by physics visits the rooms in the order the paper analysis predicts', () => {
    const paper = analyzeProgression(buildWorldGraph(WORLD, ROOMS), ROOMS).order;
    const d = world();
    const visited = [d.session.room.id];
    for (let i = 0; i < 3; i++) {
      through(d, 'east');
      visited.push(d.session.room.id);
    }
    expect(visited).toEqual(paper);
  });
});

describe('synthetic: any two rooms can be connected', () => {
  const hall = (id: string, entries: RoomDefinition['entries'], exits: RoomDefinition['exits']): RoomDefinition => ({
    id, regionId: 't', name: id, bounds: rect(-1, -12, 40, 18), killY: -20, entries,
    solids: [block('wl', -2, -12, 0, 18), block('wr', 39, -12, 41, 18), ground('g', 0, 39)], exits,
  });
  it('an exit may lead to ANY entry of the other room, not only the first: the player appears there', () => {
    const a = hall('a', [{ id: 'in', x: 4, y: 0, facing: 1 }], [{ id: 'door', rect: rect(36, 0, 39, 4), to: { room: 'b', entry: 'far' } }]);
    const b = hall('b', [{ id: 'near', x: 4, y: 0, facing: 1 }, { id: 'far', x: 30, y: 0, facing: -1 }], []);
    const s = makeSession({ room: a, extra: { rooms: { a, b } } });
    const d = new (driver({ room: a }).constructor as typeof Driver)(s);
    d.settle();
    d.teleport(37.5, 0);
    d.step(1);
    d.until(() => !s.transition.active, 60);
    expect(s.room.id).toBe('b');
    expect(d.body.x).toBeCloseTo(30, 6);
    expect(d.p.facing).toBe(-1);
  });
});
