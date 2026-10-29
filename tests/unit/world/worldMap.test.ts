import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { WorldDefinition } from '@/world/WorldDefinition';
import { buildMapLayout, EMPTY_SCENE, MAP_GAP, mapPoint, mapScene, sideOfExit, STUB_LENGTH, type MapInput, type MapLayout } from '@/world/worldMap';
import { analyzeProgression, buildWorldGraph, type RoomRegistry } from '@/world/worldGraph';

/**
 * The map of the world on SYNTHETIC worlds (the shipped one is at the end): where the rooms go, what each one is made of on the map, and what the player has earned of it. The map is pure — the same world and
 * the same discoveries always give the same scene — and describes nothing the world does not already hold: a room appears when the hero has been in it, a door takes its state from a flag.
 */

/** A room 40 m wide with a floor; its extent (what the map shows of it) is the camera's, when it has one. */
function room(id: string, patch: Partial<RoomDefinition> = {}): RoomDefinition {
  return {
    id,
    regionId: 'test',
    name: id,
    bounds: rect(-1, -12, 40, 18),
    killY: -20,
    camera: { bounds: rect(-1, -6, 40, 11) },
    entries: [
      { id: 'west', x: 4, y: 0, facing: 1 },
      { id: 'east', x: 32, y: 0, facing: -1 },
    ],
    solids: [block('wall_l', -2, -12, 0, 18), block('wall_r', 39, -12, 41, 18), ground('g', 0, 39)],
    exits: [],
    ...patch,
  };
}
type Exit = NonNullable<RoomDefinition['exits']>[number];
const east = (to: string, requires?: string, y = 0): Exit => ({ id: 'east', rect: rect(36, y, 39, y + 4), to: { room: to, entry: 'west' }, ...(requires ? { requires } : {}) });
const west = (to: string, y = 0): Exit => ({ id: 'west', rect: rect(0, y, 2.4, y + 4), to: { room: to, entry: 'east' } });
const up = (to: string): Exit => ({ id: 'up', rect: rect(18, 8, 22, 11), to: { room: to, entry: 'down' } });
const down = (to: string): Exit => ({ id: 'down', rect: rect(18, -6, 22, -3), to: { room: to, entry: 'up' } });

function worldOf(rooms: RoomRegistry, ids = Object.keys(rooms), start = ids[0] as string): { world: WorldDefinition; rooms: RoomRegistry } {
  return { world: { id: 'w', start: { room: start, entry: 'west' }, rooms: ids }, rooms };
}
/** A → B → C in a line, and back. */
function line(): { world: WorldDefinition; rooms: RoomRegistry } {
  return worldOf({ a: room('a', { exits: [east('b')] }), b: room('b', { exits: [west('a'), east('c', 'lever:1')] }), c: room('c', { exits: [west('b')] }) });
}
const layoutOf = (w: { world: WorldDefinition; rooms: RoomRegistry }): MapLayout => buildMapLayout(w.world, w.rooms);
const room_ = (layout: MapLayout, id: string): NonNullable<ReturnType<MapLayout['rooms']['get']>> => layout.rooms.get(id) as never;

/** What the player has earned, from a list of rooms and a list of flags. */
function input(over: Partial<MapInput> & { flags?: readonly string[] } = {}): MapInput {
  const flags = new Set(over.flags ?? []);
  return { visited: [], flag: (f) => flags.has(f), room: 'a', hero: { x: 4, y: 0 }, checkpoint: null, ...over };
}

describe('the layout: where the rooms of a world go', () => {
  it('puts the first room at the origin, the size of what the camera shows of it', () => {
    const a = room_(layoutOf(line()), 'a');
    expect(a.rect).toEqual({ x0: 0, y0: 0, x1: 41, y1: 17 });
    expect(a.extent).toEqual(rect(-1, -6, 40, 11));
  });

  it('falls back to the bounds of a room whose camera has no limits of its own', () => {
    const w = worldOf({ a: room('a', { camera: undefined }) });
    expect(room_(layoutOf(w), 'a').rect).toEqual({ x0: 0, y0: 0, x1: 41, y1: 30 });
  });

  it('sets a neighbour against the wall its door is in, a gap away, with the two doors level', () => {
    const l = layoutOf(line());
    const [a, b, c] = ['a', 'b', 'c'].map((id) => room_(l, id));
    expect(b.rect.x0).toBe(a.rect.x1 + MAP_GAP);
    expect(c.rect.x0).toBe(b.rect.x1 + MAP_GAP);
    // the east door of A and the west door of B are the same height on the map: the corridor is one line
    const door = (r: typeof a, exit: string) => r.doors.find((d) => d.exit === exit)!;
    expect(door(a, 'east').y).toBeCloseTo(door(b, 'west').y, 9);
    expect(door(b, 'east').y).toBeCloseTo(door(c, 'west').y, 9);
    expect(door(a, 'east').x).toBe(a.rect.x1);
    expect(door(b, 'west').x).toBe(b.rect.x0);
  });

  it('puts a room above or below when the door is in the roof or the floor, the two doors in the same column', () => {
    const l = layoutOf(worldOf({ a: room('a', { exits: [up('b')] }), b: room('b', { exits: [down('a')] }) }));
    const [a, b] = [room_(l, 'a'), room_(l, 'b')];
    expect(b.rect.y1).toBe(a.rect.y0 - MAP_GAP);
    expect(a.doors[0]!.side).toBe('north');
    expect(b.doors[0]!.side).toBe('south');
    expect(a.doors[0]!.x).toBeCloseTo(b.doors[0]!.x, 9);
  });

  it('slides a room along the wall when another already stands where it would go', () => {
    // two doors in the east wall of A, at different heights, lead to two rooms: they cannot both be level with their door
    const w = worldOf({
      a: room('a', { exits: [east('b', undefined, 0), { id: 'east2', rect: rect(36, 5, 39, 8), to: { room: 'c', entry: 'west' } }] }),
      b: room('b', { exits: [west('a')] }),
      c: room('c', { exits: [{ id: 'west', rect: rect(0, 5, 2.4, 8), to: { room: 'a', entry: 'east2' } }] }),
    });
    const l = layoutOf(w);
    const boxes = ['a', 'b', 'c'].map((id) => room_(l, id).rect);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i]!;
      const q = boxes[j]!;
      expect(p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1, `${i} and ${j} overlap`).toBe(false);
    }
  });

  it('puts a room no door reaches below the rest, and places every room of the world exactly once', () => {
    const w = worldOf({ a: room('a', { exits: [east('b')] }), b: room('b', { exits: [west('a')] }), lost: room('lost') }, ['a', 'b', 'lost']);
    const l = layoutOf(w);
    expect([...l.rooms.keys()]).toEqual(['a', 'b', 'lost']);
    expect(room_(l, 'lost').rect.y0).toBeGreaterThan(room_(l, 'a').rect.y1);
  });

  it('leaves out a room the registry does not have, and survives a world with nothing in it', () => {
    const w = worldOf({ a: room('a', { exits: [east('ghost')] }) }, ['a', 'ghost']);
    const l = layoutOf(w);
    expect([...l.rooms.keys()]).toEqual(['a']);
    expect(room_(l, 'a').doors[0]!.to).toBeNull(); // the room it names is not in the world: it leads nowhere on the map
    const empty = buildMapLayout({ id: 'e', start: { room: 'none', entry: 'x' }, rooms: [] }, {});
    expect(empty.rooms.size).toBe(0);
    expect(mapScene(empty, input())).toEqual({ ...EMPTY_SCENE, total: 0 });
  });

  it('is the same layout every time', () => {
    const w = line();
    expect(JSON.stringify([...layoutOf(w).rooms])).toBe(JSON.stringify([...layoutOf(w).rooms]));
  });

  it('takes a way out for a door of the side wall it reaches, even on the floor; a shaft in the middle of the roof or the floor takes those', () => {
    const extent = rect(0, 0, 100, 20);
    expect(sideOfExit(rect(96, 0, 99, 4), extent)).toBe('east'); // on the floor, 1 m from the wall: a door, not a hatch
    expect(sideOfExit(rect(1, 0, 3, 4), extent)).toBe('west');
    expect(sideOfExit(rect(48, 17, 52, 20), extent)).toBe('north');
    expect(sideOfExit(rect(48, 0, 52, 3), extent)).toBe('south');
    // a narrow room is not all wall: the reach is a fifth of its width at the most
    expect(sideOfExit(rect(4, 15, 6, 20), rect(0, 0, 10, 20))).toBe('north');
  });

  it('links the two doors that lead to each other, once, and a door that does not come back to nothing', () => {
    const l = layoutOf(line());
    expect(l.links.map((x) => x.id)).toEqual(['a:east~b:west', 'b:east~c:west']);
    const oneWay = layoutOf(worldOf({ a: room('a', { exits: [east('b')] }), b: room('b') }));
    expect(oneWay.links).toEqual([]);
  });
});

describe('what a room is made of on the map', () => {
  it('shows its solids clipped to what the camera shows, and leaves out the walls beyond it', () => {
    const l = layoutOf(worldOf({ a: room('a', { solids: [ground('g', 0, 39), block('wall_l', -2, -12, 0, 18), oneWay('plat', 10, 14, 4)] }) }));
    const a = room_(l, 'a');
    // the floor: 6 m deep in the world, 6 m of it inside the extent (y −6 … 0) → at the bottom of the box
    const floor = a.terrain.find((t) => !t.oneWay && t.rect.x1 - t.rect.x0 === 39);
    expect(floor).toBeDefined();
    expect(floor!.rect.y1).toBe(a.rect.y1);
    expect(a.terrain.filter((t) => t.oneWay)).toHaveLength(1);
    // a wall of the world that is only partly in the extent keeps that part; nothing is drawn outside the box
    for (const t of a.terrain) {
      expect(t.rect.x0).toBeGreaterThanOrEqual(a.rect.x0);
      expect(t.rect.x1).toBeLessThanOrEqual(a.rect.x1);
      expect(t.rect.y0).toBeGreaterThanOrEqual(a.rect.y0);
      expect(t.rect.y1).toBeLessThanOrEqual(a.rect.y1);
    }
  });

  it('keeps the solid of a gate out of the terrain and lists the gate with the flag that opens it', () => {
    const l = layoutOf(worldOf({ a: room('a', { solids: [ground('g', 0, 39), block('door', 30, 0, 31.5, 9, 'gate')], gates: [{ id: 'exit_door', solid: 'door', openWhen: 'lever:1' }] }) }));
    const a = room_(l, 'a');
    expect(a.terrain).toHaveLength(1);
    expect(a.gates).toHaveLength(1);
    expect(a.gates[0]).toMatchObject({ id: 'exit_door', openWhen: 'lever:1' });
  });

  it('turns the exits of a room into doors on its walls, with the flag each asks for and whether it leaves the world', () => {
    const l = layoutOf(worldOf({ a: room('a', { exits: [east('b', 'lever:1'), { id: 'end', rect: rect(10, 0, 12, 3), end: true }] }), b: room('b') }, ['a', 'b']));
    const [e, end] = room_(l, 'a').doors;
    expect(e).toMatchObject({ id: 'a:east', side: 'east', to: 'b', requires: 'lever:1', end: false });
    expect(end).toMatchObject({ id: 'a:end', to: null, requires: null, end: true });
  });

  it('brings a point of the world onto the map, and keeps it inside the box whatever the point', () => {
    const a = room_(layoutOf(line()), 'a');
    expect(mapPoint(a, 4, 0)).toEqual({ x: 5, y: 11 }); // 5 m from the left edge of the extent, 11 m under its roof (the roof is y 11, the floor y 0)
    expect(mapPoint(a, -50, 500)).toEqual({ x: a.rect.x0, y: a.rect.y0 });
    expect(mapPoint(a, 500, -500)).toEqual({ x: a.rect.x1, y: a.rect.y1 });
  });

  it('finds the places of interest where the room keeps them: shrines, wards and guardians', () => {
    const l = layoutOf(
      worldOf({
        a: room('a', {
          interactables: [
            { id: 'shrine', kind: 'rest', verbKey: 'k', x: 12, y: 0, actions: [{ type: 'checkpoint', entry: 'rest' }] },
            { id: 'card', kind: 'pickup', verbKey: 'k', x: 20, y: 0, actions: [{ type: 'setFlag', flag: 'taken:card' }] },
          ],
          seals: [{ id: 'seal', x: 30, y: 0, accepts: ['spirit_bolt'], flag: 'broken:seal' }],
          bosses: [{ id: 'boss', guardian: 'warden', x: 20, y: 0, arena: rect(10, -1, 30, 12), defeatFlag: 'defeated:boss', fightFlag: '~fight' }],
        }),
      }),
    );
    const pois = room_(l, 'a').pois;
    expect(pois.map((p) => p.kind).sort()).toEqual(['boss', 'rest', 'seal']); // a pickup is not one: the map does not tell what lies where
    const rest = pois.find((p) => p.kind === 'rest')!;
    expect(rest).toMatchObject({ entry: 'rest', doneFlag: null });
    expect(rest.x).toBeCloseTo(13, 9);
    const boss = pois.find((p) => p.kind === 'boss')!;
    expect(boss.doneFlag).toBe('defeated:boss');
    expect(boss.area).not.toBeNull();
    expect(boss.x).toBeCloseTo((boss.area!.x0 + boss.area!.x1) / 2, 9);
    expect(pois.find((p) => p.kind === 'seal')!.doneFlag).toBe('broken:seal');
  });
});

describe('the scene: what the player has earned', () => {
  it('shows only the rooms the hero has been in, and always the one they are standing in', () => {
    const l = layoutOf(line());
    expect(mapScene(l, input({ visited: [], room: 'a' })).rooms.map((r) => r.id)).toEqual(['a']);
    expect(mapScene(l, input({ visited: ['a', 'b'], room: 'b' })).rooms.map((r) => r.id)).toEqual(['a', 'b']);
    expect(mapScene(l, input({ visited: ['a', 'c'], room: 'c' })).rooms.map((r) => r.id)).toEqual(['a', 'c']); // c has been reached some other way: it shows, its neighbour in between does not
    const s = mapScene(l, input({ visited: ['a', 'b'], room: 'b' }));
    expect([s.discovered, s.total, s.current]).toEqual([2, 3, 'b']);
  });

  it('ignores rooms the layout does not have (a saved game of another world, a playground)', () => {
    const l = layoutOf(line());
    const s = mapScene(l, input({ visited: ['a', 'moon'], room: 'moon', hero: { x: 1, y: 1 } }));
    expect(s.rooms.map((r) => r.id)).toEqual(['a']);
    expect(s.current).toBeNull();
    expect(s.hero).toBeNull();
    expect(mapScene(l, input({ visited: [], room: 'moon' }))).toEqual({ ...EMPTY_SCENE, total: 3 });
  });

  it('shuts the way that asks for a flag until the flag is set', () => {
    const l = layoutOf(line());
    const shut = mapScene(l, input({ visited: ['a', 'b'], room: 'b' }));
    const eastOfB = shut.rooms.find((r) => r.id === 'b')!.doors.find((d) => d.exit === 'east')!;
    expect(eastOfB.state).toBe('locked');
    const open = mapScene(l, input({ visited: ['a', 'b'], room: 'b', flags: ['lever:1'] }));
    expect(open.rooms.find((r) => r.id === 'b')!.doors.find((d) => d.exit === 'east')!.state).toBe('open');
  });

  it('says whether the room a way leads to is on the map: that is what makes a stub', () => {
    const l = layoutOf(line());
    const s = mapScene(l, input({ visited: ['a'], room: 'a' }));
    expect(s.rooms[0]!.doors[0]).toMatchObject({ exit: 'east', to: 'b', known: false });
    const both = mapScene(l, input({ visited: ['a', 'b'], room: 'b' }));
    expect(both.rooms.find((r) => r.id === 'a')!.doors[0]!.known).toBe(true);
    expect(both.rooms.find((r) => r.id === 'b')!.doors.find((d) => d.exit === 'east')!.known).toBe(false);
  });

  it('draws the connection between two rooms only when both are on the map, locked while either door still asks for a flag', () => {
    const l = layoutOf(line());
    expect(mapScene(l, input({ visited: ['a'], room: 'a' })).links).toEqual([]);
    const ab = mapScene(l, input({ visited: ['a', 'b'], room: 'b' })).links;
    expect(ab.map((x) => x.id)).toEqual(['a:east~b:west']);
    expect(ab[0]!.locked).toBe(false);
    const bc = mapScene(l, input({ visited: ['b', 'c'], room: 'c' })).links;
    expect(bc.map((x) => x.id)).toEqual(['b:east~c:west']);
    expect(bc[0]!.locked).toBe(true); // c was reached some other way: the door between b and c is still shut
    expect(mapScene(l, input({ visited: ['b', 'c'], room: 'c', flags: ['lever:1'] })).links[0]!.locked).toBe(false);
  });

  it('puts the hero in the room they stand in, where they stand', () => {
    const l = layoutOf(line());
    const s = mapScene(l, input({ visited: ['a', 'b'], room: 'b', hero: { x: 20, y: 3 } }));
    const b = room_(l, 'b');
    expect(s.hero).toEqual({ room: 'b', ...mapPoint(b, 20, 3) });
    expect(s.rooms.find((r) => r.current)!.id).toBe('b');
    expect(mapScene(l, input({ visited: ['a'], room: 'a', hero: null })).hero).toBeNull();
  });

  it('takes the state of the places of interest from the flags, and marks the shrine the hero comes back to', () => {
    const w = worldOf({
      a: room('a', {
        interactables: [
          { id: 's1', kind: 'rest', verbKey: 'k', x: 10, y: 0, actions: [{ type: 'checkpoint', entry: 'rest' }] },
          { id: 's2', kind: 'rest', verbKey: 'k', x: 20, y: 0, actions: [{ type: 'checkpoint', entry: 'rest2' }] },
        ],
        seals: [{ id: 'seal', x: 30, y: 0, accepts: [], flag: 'broken:seal' }],
        bosses: [{ id: 'boss', guardian: 'g', x: 20, y: 0, arena: rect(10, -1, 30, 12), defeatFlag: 'defeated:boss', fightFlag: '~f' }],
      }),
    });
    const l = layoutOf(w);
    const pois = (flags: string[], checkpoint: MapInput['checkpoint']) => mapScene(l, input({ visited: ['a'], flags, checkpoint })).rooms[0]!.pois;
    const fresh = pois([], { room: 'a', entry: 'rest2' });
    expect(fresh.filter((p) => p.done)).toEqual([]);
    expect(fresh.find((p) => p.id.endsWith(':s1'))!.active).toBe(false);
    expect(fresh.find((p) => p.id.endsWith(':s2'))!.active).toBe(true);
    const done = pois(['broken:seal', 'defeated:boss'], null);
    expect(done.filter((p) => p.done).map((p) => p.kind).sort()).toEqual(['boss', 'seal']);
    expect(done.some((p) => p.active)).toBe(false);
  });

  it('shows a gate as shut until its flag is set', () => {
    const w = worldOf({ a: room('a', { solids: [ground('g', 0, 39), block('door', 30, 0, 31.5, 9, 'gate')], gates: [{ id: 'exit_door', solid: 'door', openWhen: 'lever:1' }] }) });
    const l = layoutOf(w);
    expect(mapScene(l, input({ visited: ['a'] })).rooms[0]!.gates[0]!.open).toBe(false);
    expect(mapScene(l, input({ visited: ['a'], flags: ['lever:1'] })).rooms[0]!.gates[0]!.open).toBe(true);
  });

  it('boxes everything it shows, the stub of a way into the unknown included, and the zones with something discovered', () => {
    const l = layoutOf(line());
    const one = mapScene(l, input({ visited: ['a'], room: 'a' }));
    const a = room_(l, 'a');
    expect(one.bounds).toEqual({ x0: a.rect.x0, y0: a.rect.y0, x1: a.rect.x1 + STUB_LENGTH, y1: a.rect.y1 });
    expect(one.regions).toEqual([{ id: 'test', rect: a.rect }]);
    const two = mapScene(l, input({ visited: ['a', 'b'], room: 'b' }));
    expect(two.bounds!.x1).toBeGreaterThan(room_(l, 'b').rect.x1);
    expect(two.regions).toHaveLength(1);
  });

  it('the same discoveries give the same scene, and the scene holds nothing of the layout that can be changed from outside', () => {
    const l = layoutOf(line());
    const a = mapScene(l, input({ visited: ['a', 'b'], room: 'b', flags: ['lever:1'] }));
    const b = mapScene(l, input({ visited: ['b', 'a'], room: 'b', flags: ['lever:1'] }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    a.rooms[0]!.doors[0]!.state = 'locked';
    expect(mapScene(l, input({ visited: ['a', 'b'], room: 'b', flags: ['lever:1'] })).rooms[0]!.doors[0]!.state).toBe('open');
  });
});

describe('the map of the shipped world', () => {
  const layout = buildMapLayout(WORLD, ROOMS);
  const ids = WORLD.rooms;

  it('places the 108 rooms along the road, the first at the origin, no two on top of each other (nor closer than the gap), and the four rooms of the slice in a line, each door level with the one it leads to', () => {
    expect(layout.rooms.size).toBe(108);
    expect([...layout.rooms.keys()].slice(0, 4)).toEqual(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']);
    expect(room_(layout, 'r1_gate').rect).toMatchObject({ x0: 0, y0: 0 });
    const boxes = [...layout.rooms.values()];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!.rect;
        const b = boxes[j]!.rect;
        const apart = a.x1 + MAP_GAP / 2 <= b.x0 || b.x1 + MAP_GAP / 2 <= a.x0 || a.y1 + MAP_GAP / 2 <= b.y0 || b.y1 + MAP_GAP / 2 <= a.y0;
        expect(apart, `${boxes[i]!.id} and ${boxes[j]!.id} are not on top of each other`).toBe(true);
      }
    }
    for (let i = 1; i < 4; i++) {
      const before = room_(layout, ids[i - 1]!);
      const after = room_(layout, ids[i]!);
      expect(after.rect.x0, `${ids[i]} comes after ${ids[i - 1]}`).toBe(before.rect.x1 + MAP_GAP);
      const out = before.doors.find((d) => d.to === ids[i])!;
      const back = after.doors.find((d) => d.to === ids[i - 1])!;
      expect(out.y, `${out.id} and ${back.id} are level`).toBeCloseTo(back.y, 9);
    }
  });

  it('the ROAD places the rooms, not the shortcuts: each room stands next to the room by which it first opens on paper, and a shortcut is a line between two rooms that are already there', () => {
    const road = analyzeProgression(buildWorldGraph(WORLD, ROOMS), ROOMS).via;
    expect(road.size).toBe(107);
    for (const [to, way] of road) {
      const a = room_(layout, way.from).rect;
      const b = room_(layout, to).rect;
      const side = layout.rooms.get(way.from)!.doors.find((d) => d.exit === way.exit)!.side;
      // against the wall that door is in, a gap away (a room that would have landed on another has slid along the wall)
      const against = side === 'east' ? b.x0 === a.x1 + MAP_GAP : side === 'west' ? b.x1 === a.x0 - MAP_GAP : side === 'south' ? b.y0 === a.y1 + MAP_GAP : b.y1 === a.y0 - MAP_GAP;
      expect(against, `${to} is set against the ${side} wall of ${way.from}`).toBe(true);
    }
    const door = (id: string): { x: number; y: number } => layout.rooms.get(id.split(':')[0]!)!.doors.find((d) => d.id === id)!;
    const length = (id: string): number => {
      const l = layout.links.find((k) => k.id === id)!;
      return Math.hypot(door(l.a).x - door(l.b).x, door(l.a).y - door(l.b).y);
    };
    const shortcuts = layout.links.filter((l) => l.id.includes(':shortcut'));
    expect(shortcuts).toHaveLength(20 / 2);
    // the roads are short lines (a few rooms of sliding at the most); the shortcuts reach back along the whole zone
    for (const l of layout.links) if (!l.id.includes(':shortcut')) expect(length(l.id), l.id).toBeLessThan(80);
  });

  it('connects every way between two rooms of the world, and knows the one that leaves it: the end of the adventure, in the last room, behind the Sovereign', () => {
    const graph = buildWorldGraph(WORLD, ROOMS);
    // every exit that leads to a room that leads back is a link, once
    const pairs = new Set(graph.edges.filter((e) => graph.edges.some((b) => b.from === e.to.room && b.to.room === e.from)).map((e) => [e.from, e.to.room].sort().join('~')));
    expect(layout.links.length).toBeGreaterThanOrEqual(pairs.size);
    for (const e of graph.edges) expect(layout.links.some((l) => l.a === `${e.from}:${e.exit}` || l.b === `${e.from}:${e.exit}`), `${e.from}:${e.exit} is linked`).toBe(true);
    // the door of R4 that used to leave the world leads on, to the Collapsed Nave
    expect(room_(layout, 'r4_sanctum').doors.find((d) => d.exit === 'east')).toMatchObject({ to: 'ru_nave', requires: 'defeated:r4_boss', end: false });
    const ends = [...layout.rooms.values()].flatMap((r) => r.doors.filter((d) => d.end));
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ room: 'ct_end', to: null, requires: 'defeated:ct_boss' });
    // and the Rest of the Heart, which used to be it, leads on to the Gate of Dusk
    expect(room_(layout, 'ih_end').doors.find((d) => d.exit === 'east')).toMatchObject({ to: 'dv_gate', requires: 'defeated:ih_boss', end: false });
  });

  it('draws every room with its terrain, and the gates of R1 and R4 as gates', () => {
    for (const id of ids) expect(room_(layout, id).terrain.length, id).toBeGreaterThan(2);
    expect(room_(layout, 'r1_gate').gates.map((g) => g.openWhen)).toContain('defeated:r1_slime');
  });

  it('knows the shrines of R2 and R4, the seal of R3 and the guardian of R4 — and nothing in R1', () => {
    const kinds = (id: string) => room_(layout, id).pois.map((p) => p.kind).sort();
    expect(kinds('r1_gate')).toEqual([]);
    expect(kinds('r2_hall')).toEqual(['rest']);
    expect(kinds('r3_chamber')).toEqual(['seal']);
    expect(kinds('r4_sanctum')).toEqual(['boss', 'rest']);
  });

  it('a new game shows R1 alone, its way on shut and leading into the unknown', () => {
    const s = mapScene(layout, { visited: ['r1_gate'], flag: () => false, room: 'r1_gate', hero: { x: 4, y: 0 }, checkpoint: { room: 'r1_gate', entry: 'start' } });
    expect(s.rooms.map((r) => r.id)).toEqual(['r1_gate']);
    expect(s.links).toEqual([]);
    expect(s.rooms[0]!.doors[0]).toMatchObject({ exit: 'east', state: 'locked', known: false });
    expect(s.rooms[0]!.pois).toEqual([]);
    expect([s.discovered, s.total]).toEqual([1, 108]);
  });

  it('knows what is worth a mark: the twenty-four shrines, the eleven guardians, the two wards that only the Bolt breaks — and not the split stone, which is a secret', () => {
    const pois = [...layout.rooms.values()].flatMap((r) => r.pois);
    expect(pois.filter((p) => p.kind === 'rest')).toHaveLength(24);
    expect(pois.filter((p) => p.kind === 'boss').map((p) => p.room).sort()).toEqual(['ct_arena', 'dv_arena', 'ec_arena', 'fd_arena', 'ih_arena', 'mn_arena', 'mr_lair', 'og_arena', 'r4_sanctum', 'rt_arena', 'sp_arena']);
    expect(pois.filter((p) => p.kind === 'seal').map((p) => p.room).sort()).toEqual(['r3_chamber', 'ru_archive']);
  });

  it('the hero of every room of the world stands inside its box at every entry', () => {
    for (const id of ids) {
      const def = ROOMS[id]!;
      const r = room_(layout, id);
      for (const e of def.entries) {
        const p = mapPoint(r, e.x, e.y);
        expect(p.x, `${id}:${e.id}`).toBeGreaterThanOrEqual(r.rect.x0);
        expect(p.x).toBeLessThanOrEqual(r.rect.x1);
        expect(p.y).toBeGreaterThanOrEqual(r.rect.y0);
        expect(p.y).toBeLessThanOrEqual(r.rect.y1);
      }
    }
  });

  it('every door of the world is on the wall of its room and, where it leads somewhere, to a room that is on the layout', () => {
    for (const id of ids) {
      for (const d of room_(layout, id).doors) {
        const r = room_(layout, id).rect;
        const onWall = d.side === 'east' ? d.x === r.x1 : d.side === 'west' ? d.x === r.x0 : d.side === 'north' ? d.y === r.y0 : d.y === r.y1;
        expect(onWall, d.id).toBe(true);
        if (d.to) expect(layout.rooms.has(d.to), d.id).toBe(true);
      }
    }
  });
});
