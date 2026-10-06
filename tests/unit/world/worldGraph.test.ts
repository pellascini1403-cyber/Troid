import { describe, expect, it } from 'vitest';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { WorldDefinition } from '@/world/WorldDefinition';
import {
  analyzeProgression,
  buildWorldGraph,
  destinationOf,
  edgesFrom,
  edgesTo,
  grantedFlags,
  requiredFlags,
  routeBetween,
  validateWorld,
  worldGrantedFlags,
  type RoomRegistry,
} from '@/world/worldGraph';

/**
 * The world graph on SYNTHETIC worlds (the shipped one is in tests/unit/content/world.test.ts): the graph is built from the data of
 * the rooms, the validator names each thing that can be wrong with it, and the paper playthrough opens rooms only as the flags that
 * guard them are collected — in any order the data is written.
 */

/** A small valid room: an entry at each end and, when asked, an exit at each end. */
function room(id: string, patch: Partial<RoomDefinition> = {}): RoomDefinition {
  return {
    id,
    regionId: 'test',
    name: id,
    bounds: rect(-1, -12, 40, 18),
    killY: -20,
    entries: [
      { id: 'west', x: 4, y: 0, facing: 1 },
      { id: 'east', x: 32, y: 0, facing: -1 },
    ],
    solids: [block('wall_l', -2, -12, 0, 18), block('wall_r', 39, -12, 41, 18), ground('g', 0, 39)],
    exits: [],
    ...patch,
  };
}
const west = (to: string): NonNullable<RoomDefinition['exits']>[number] => ({ id: 'west', rect: rect(0, 0, 2.4, 4), to: { room: to, entry: 'east' } });
const east = (to: string, requires?: string): NonNullable<RoomDefinition['exits']>[number] => ({
  id: 'east',
  rect: rect(36, 0, 39, 4),
  to: { room: to, entry: 'west' },
  ...(requires ? { requires } : {}),
});

/** A → B → C and back, every exit open. */
function line(): { world: WorldDefinition; rooms: RoomRegistry } {
  const rooms: RoomRegistry = {
    a: room('a', { exits: [east('b')] }),
    b: room('b', { exits: [west('a'), east('c')] }),
    c: room('c', { exits: [west('b')] }),
  };
  return { world: { id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'b', 'c'] }, rooms };
}
const codes = (world: WorldDefinition, rooms: RoomRegistry): string[] => validateWorld(world, rooms).map((i) => i.code);

describe('flags a room asks for and gives', () => {
  const r = room('r', {
    spawns: [
      { id: 's1', enemy: 'ink_slime', x: 20, y: 0, defeatFlag: 'defeated:s1' },
      { id: 's2', enemy: 'ink_slime', x: 24, y: 0 }, // no flag: it comes back every time, it grants nothing
    ],
    gates: [{ id: 'g1', solid: 'wall_r', openWhen: 'lever:1' }],
    exits: [east('x', 'defeated:s1')],
    interactables: [
      { id: 'lever', kind: 'activate', verbKey: 'k', x: 10, y: 0, actions: [{ type: 'setFlag', flag: 'lever:1' }, { type: 'clearFlag', flag: 'zzz' }] },
      { id: 'door', kind: 'open', verbKey: 'k', x: 12, y: 0, whenSet: 'lever:1', actions: [{ type: 'setFlag', flag: 'opened:door' }] },
    ],
  });

  it('grants: the defeat flags of its spawns and the flags its interactables set (never the ones they clear)', () => {
    expect(grantedFlags(r).sort()).toEqual(['defeated:s1', 'lever:1', 'opened:door']);
  });

  it('requires: exits that need a flag, gates that open with one, interactables that wait for one', () => {
    expect(requiredFlags(r).sort()).toEqual(['defeated:s1', 'lever:1']);
  });

  it('a room that asks and gives nothing has empty lists', () => {
    expect(grantedFlags(room('p'))).toEqual([]);
    expect(requiredFlags(room('p'))).toEqual([]);
  });

  it('worldGrantedFlags is the union over the rooms of the world only', () => {
    const rooms: RoomRegistry = { a: room('a', { spawns: [{ id: 's', enemy: 'e', x: 5, y: 0, defeatFlag: 'defeated:a' }] }), b: room('b', { interactables: [{ id: 'l', kind: 'activate', verbKey: 'k', x: 5, y: 0, actions: [{ type: 'setFlag', flag: 'lever:b' }] }] }), z: r };
    expect([...worldGrantedFlags({ id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'b'] }, rooms)].sort()).toEqual(['defeated:a', 'lever:b']);
  });
});

describe('buildWorldGraph', () => {
  it('has a node per room with its entries, exits and flags, and an edge per exit that leads somewhere', () => {
    const { world, rooms } = line();
    const g = buildWorldGraph(world, rooms);
    expect([...g.rooms.keys()]).toEqual(['a', 'b', 'c']);
    expect(g.rooms.get('b')).toMatchObject({ id: 'b', entries: ['west', 'east'], exits: ['west', 'east'] });
    expect(g.edges.map((e) => `${e.from}/${e.exit}→${e.to.room}:${e.to.entry}`)).toEqual(['a/east→b:west', 'b/west→a:east', 'b/east→c:west', 'c/west→b:east']);
    expect(g.start).toEqual({ room: 'a', entry: 'west' });
  });

  it('knows where each exit leads, and who leads into a room', () => {
    const { world, rooms } = line();
    const g = buildWorldGraph(world, rooms);
    expect(destinationOf(g, 'a', 'east')).toEqual({ room: 'b', entry: 'west' });
    expect(destinationOf(g, 'a', 'nope')).toBeUndefined();
    expect(edgesFrom(g, 'b').map((e) => e.exit)).toEqual(['west', 'east']);
    expect(edgesTo(g, 'b').map((e) => e.from).sort()).toEqual(['a', 'c']);
  });

  it('an exit that leads out of the world (`end`) or nowhere is a node exit, not an edge', () => {
    const rooms: RoomRegistry = { a: room('a', { exits: [{ id: 'east', rect: rect(36, 0, 39, 4), end: true }, { id: 'west', rect: rect(0, 0, 2.4, 4) }] }) };
    const g = buildWorldGraph({ id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a'] }, rooms);
    expect(g.edges).toEqual([]);
    expect(g.rooms.get('a')!.exits).toEqual(['east', 'west']);
  });

  it('is lenient: a room the registry does not have, or listed twice, is left out (validateWorld reports it)', () => {
    const { rooms } = line();
    const g = buildWorldGraph({ id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'a', 'ghost', 'b'] }, rooms);
    expect([...g.rooms.keys()]).toEqual(['a', 'b']);
  });

  it('keeps the flag an exit requires on its edge', () => {
    const rooms: RoomRegistry = { a: room('a', { exits: [east('b', 'defeated:a')] }), b: room('b', { exits: [west('a')] }) };
    const g = buildWorldGraph({ id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'b'] }, rooms);
    expect(g.edges[0]!.requires).toBe('defeated:a');
    expect(g.edges[1]!.requires).toBeUndefined();
  });
});

describe('analyzeProgression: the world played on paper', () => {
  it('opens the rooms in the order the way leads, and every one of them', () => {
    const { world, rooms } = line();
    const p = analyzeProgression(buildWorldGraph(world, rooms), rooms);
    expect(p.order).toEqual(['a', 'b', 'c']);
    expect(p.unreachable).toEqual([]);
  });

  it('an exit that needs a flag opens only when something reachable sets it', () => {
    const rooms: RoomRegistry = {
      a: room('a', { spawns: [{ id: 's', enemy: 'ink_slime', x: 20, y: 0, defeatFlag: 'defeated:a' }], exits: [east('b', 'defeated:a')] }),
      b: room('b', { exits: [west('a')] }),
    };
    const world: WorldDefinition = { id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'b'] };
    const p = analyzeProgression(buildWorldGraph(world, rooms), rooms);
    expect(p.order).toEqual(['a', 'b']);
    expect(p.flags.has('defeated:a')).toBe(true);
  });

  it('the order the rooms are WRITTEN in does not matter', () => {
    const { world, rooms } = line();
    const backwards: WorldDefinition = { ...world, rooms: ['c', 'b', 'a'] };
    const p = analyzeProgression(buildWorldGraph(backwards, rooms), rooms);
    expect(p.order).toEqual(['a', 'b', 'c']);
  });

  it('a chain of flags is followed: a lever in B opens the exit of A to C only after B is reached', () => {
    const rooms: RoomRegistry = {
      a: room('a', { exits: [east('b'), { id: 'north', rect: rect(10, 8, 14, 12), to: { room: 'c', entry: 'west' }, requires: 'lever:b' }] }),
      b: room('b', { exits: [west('a')], interactables: [{ id: 'l', kind: 'activate', verbKey: 'k', x: 10, y: 0, actions: [{ type: 'setFlag', flag: 'lever:b' }] }] }),
      c: room('c', { exits: [west('a')] }),
    };
    const world: WorldDefinition = { id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'b', 'c'] };
    expect(analyzeProgression(buildWorldGraph(world, rooms), rooms).order).toEqual(['a', 'b', 'c']);
  });

  it('a circular dependency leaves the room shut: the flag is behind the door it opens', () => {
    const rooms: RoomRegistry = {
      a: room('a', { exits: [east('b', 'lever:b')] }),
      b: room('b', { exits: [west('a')], interactables: [{ id: 'l', kind: 'activate', verbKey: 'k', x: 10, y: 0, actions: [{ type: 'setFlag', flag: 'lever:b' }] }] }),
    };
    const world: WorldDefinition = { id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'b'] };
    const p = analyzeProgression(buildWorldGraph(world, rooms), rooms);
    expect(p.order).toEqual(['a']);
    expect(p.unreachable).toEqual(['b']);
    expect(p.flags.has('lever:b')).toBe(false);
  });

  it('a pickup that waits for a flag gives nothing until that flag exists', () => {
    const rooms: RoomRegistry = {
      a: room('a', { interactables: [{ id: 'p', kind: 'pickup', verbKey: 'k', x: 10, y: 0, whenSet: 'never', actions: [{ type: 'setFlag', flag: 'taken:p' }] }] }),
    };
    const world: WorldDefinition = { id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a'] };
    expect(analyzeProgression(buildWorldGraph(world, rooms), rooms).flags.has('taken:p')).toBe(false);
    expect(analyzeProgression(buildWorldGraph(world, rooms), rooms, ['never']).flags.has('taken:p')).toBe(true);
  });
});

describe('routeBetween', () => {
  it('is the shortest way, both ends included', () => {
    const { world, rooms } = line();
    const g = buildWorldGraph(world, rooms);
    expect(routeBetween(g, 'a', 'c', new Set())).toEqual(['a', 'b', 'c']);
    expect(routeBetween(g, 'c', 'a', new Set())).toEqual(['c', 'b', 'a']);
    expect(routeBetween(g, 'b', 'b', new Set())).toEqual(['b']);
  });

  it('does not cross an exit whose flag is not collected, and crosses it when it is', () => {
    const rooms: RoomRegistry = { a: room('a', { exits: [east('b', 'f')] }), b: room('b', { exits: [west('a')] }) };
    const g = buildWorldGraph({ id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'b'] }, rooms);
    expect(routeBetween(g, 'a', 'b', new Set())).toEqual([]);
    expect(routeBetween(g, 'a', 'b', new Set(['f']))).toEqual(['a', 'b']);
  });

  it('takes the short way when there are two, and says nothing for a room that is not in the world', () => {
    const rooms: RoomRegistry = {
      a: room('a', { exits: [east('b'), { id: 'up', rect: rect(10, 8, 14, 12), to: { room: 'c', entry: 'west' } }] }),
      b: room('b', { exits: [west('a'), { id: 'up', rect: rect(10, 8, 14, 12), to: { room: 'c', entry: 'west' } }] }),
      c: room('c', { exits: [west('a')] }),
    };
    const g = buildWorldGraph({ id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'b', 'c'] }, rooms);
    expect(routeBetween(g, 'a', 'c', new Set())).toEqual(['a', 'c']);
    expect(routeBetween(g, 'a', 'zzz', new Set())).toEqual([]);
  });
});

describe('validateWorld', () => {
  it('a sound world has no issues, and every message names the world', () => {
    const { world, rooms } = line();
    expect(validateWorld(world, rooms)).toEqual([]);
    const [issue] = validateWorld({ ...world, rooms: [] }, rooms);
    expect(issue?.message).toContain('[w]');
    expect(issue?.world).toBe('w');
  });

  it('a world needs rooms, each listed once and present in the registry', () => {
    const { world, rooms } = line();
    expect(codes({ ...world, rooms: [] }, rooms)).toContain('world-empty');
    expect(codes({ ...world, rooms: ['a', 'b', 'c', 'c'] }, rooms)).toContain('world-room-duplicate');
    expect(codes({ ...world, rooms: ['a', 'b', 'c', 'ghost'] }, rooms)).toContain('world-room-unknown');
  });

  it('the start must be a room of the world and one of its entries', () => {
    const { world, rooms } = line();
    expect(codes({ ...world, start: { room: 'nope', entry: 'west' } }, rooms)).toContain('start-room');
    expect(codes({ ...world, start: { room: 'z', entry: 'west' } }, { ...rooms, z: room('z') })).toContain('start-room'); // exists, but is not listed
    expect(codes({ ...world, start: { room: 'a', entry: 'nope' } }, rooms)).toContain('start-entry');
  });

  it('every exit leads somewhere (a destination) or out of the world (`end`), never both, never neither', () => {
    const { world, rooms } = line();
    const both = { ...rooms, c: room('c', { exits: [west('b'), { id: 'x', rect: rect(10, 8, 14, 12), end: true, to: { room: 'a', entry: 'west' } }] }) };
    expect(codes(world, both)).toContain('exit-both');
    const none = { ...rooms, c: room('c', { exits: [west('b'), { id: 'x', rect: rect(10, 8, 14, 12) }] }) };
    expect(codes(world, none)).toContain('exit-no-destination');
    const end = { ...rooms, c: room('c', { exits: [west('b'), { id: 'x', rect: rect(10, 8, 14, 12), end: true }] }) };
    expect(codes(world, end)).toEqual([]);
  });

  it('a destination must be a room of the world and an entry that room has', () => {
    const { world, rooms } = line();
    expect(codes(world, { ...rooms, a: room('a', { exits: [east('ghost')] }) })).toContain('exit-room');
    expect(codes(world, { ...rooms, a: room('a', { exits: [{ id: 'east', rect: rect(36, 0, 39, 4), to: { room: 'b', entry: 'nowhere' } }] }) })).toContain('exit-entry');
    expect(codes({ ...world, rooms: ['a', 'b'] }, rooms)).toContain('exit-room'); // b → c, but c is not in this world
  });

  it('an empty flag on an exit is an issue', () => {
    const { world, rooms } = line();
    expect(codes(world, { ...rooms, a: room('a', { exits: [{ ...east('b'), requires: '' }] }) })).toContain('empty-flag');
  });

  it('an entry must not put the player inside a way out: it would be thrown straight back', () => {
    const { world, rooms } = line();
    // R2's way back at the very spot where R1 sends the player
    const bounce = { ...rooms, b: room('b', { entries: [{ id: 'west', x: 1.2, y: 0, facing: 1 }, { id: 'east', x: 32, y: 0, facing: -1 }], exits: [west('a'), east('c')] }) };
    expect(codes(world, bounce)).toContain('entry-in-exit');
    // touching the edge of the zone is not being in it
    const edge = { ...rooms, b: room('b', { entries: [{ id: 'west', x: 2.4 + 0.35 + 0.01, y: 0, facing: 1 }, { id: 'east', x: 32, y: 0, facing: -1 }], exits: [west('a'), east('c')] }) };
    expect(codes(world, edge)).not.toContain('entry-in-exit');
    // an exit the room has but that leads out of the world counts as well
    const end = { ...rooms, c: room('c', { exits: [west('b'), { id: 'x', rect: rect(3, 0, 6, 4), end: true }] }) };
    expect(codes(world, end)).toContain('entry-in-exit');
  });

  it('every room must be reachable from the start, following only the exits the collected flags open', () => {
    const { world, rooms } = line();
    expect(codes(world, { ...rooms, b: room('b', { exits: [west('a')] }) })).toContain('room-unreachable'); // nothing leads to c
    const shut = { ...rooms, a: room('a', { exits: [east('b', 'never')] }) };
    const found = validateWorld(world, shut);
    expect(found.map((i) => i.code)).toEqual(expect.arrayContaining(['room-unreachable', 'flag-ungranted']));
    expect(found.find((i) => i.code === 'room-unreachable')!.message).toContain('"b"');
  });

  it('a flag that something waits for must be settable by something the player can reach', () => {
    const { world, rooms } = line();
    const gated = { ...rooms, b: room('b', { exits: [west('a'), east('c')], gates: [{ id: 'g', solid: 'wall_r', openWhen: 'lever:ghost' }] }) };
    const found = validateWorld(world, gated);
    expect(found.find((i) => i.code === 'flag-ungranted')?.message).toContain('lever:ghost');
    const lever = { ...gated, c: room('c', { exits: [west('b')], interactables: [{ id: 'l', kind: 'activate', verbKey: 'k', x: 10, y: 0, actions: [{ type: 'setFlag', flag: 'lever:ghost' }] }] }) };
    expect(codes(world, lever)).toEqual([]);
  });

  it('there must be a way back to the start from everywhere (no room that traps the player)', () => {
    const { world, rooms } = line();
    const trap = { ...rooms, c: room('c', { exits: [] }) };
    const found = validateWorld(world, trap);
    expect(found.find((i) => i.code === 'room-trapped')?.message).toContain('"c"');
    expect(found.some((i) => i.code === 'room-unreachable')).toBe(false);
  });

  it('the way back may need a flag the player has by then', () => {
    const rooms: RoomRegistry = {
      a: room('a', { exits: [east('b')] }),
      b: room('b', { spawns: [{ id: 's', enemy: 'ink_slime', x: 20, y: 0, defeatFlag: 'defeated:b' }], exits: [{ ...west('a'), requires: 'defeated:b' }] }),
    };
    expect(codes({ id: 'w', start: { room: 'a', entry: 'west' }, rooms: ['a', 'b'] }, rooms)).toEqual([]);
  });
});
