import { describe, expect, it } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { PLAYER } from '@/content/player';
import { mapRoom, pictureOf, RoomMap } from '@/world/roomMap';
import { validateRoom } from '@/world/validateRoom';

/**
 * ROOMS DRAWN IN LETTERS (docs/PROMPT21-LOG.md): the picture is data the build checks, and what it makes is plain `RoomDefinition` data.
 */
const player = { halfWidth: PLAYER.body.halfWidth, height: PLAYER.body.height };

const SMALL = [
  '##########',
  '#........#',
  '#...--...#',
  '#..a.....#',
  '#.---....#',
  '#b.....c.#',
  'GGGG^^GGGG',
  '##########',
];

describe('the picture becomes rectangles', () => {
  const m = new RoomMap('t', { rows: SMALL });

  it('knows its size, in metres, and the bottom edge of the picture is y = 0', () => {
    expect([m.width, m.height]).toEqual([10, 8]);
    expect(m.grid).toEqual({ x0: 0, y0: 0, x1: 10, y1: 8 });
  });

  it('joins the squares of a run into one rectangle and equal runs of consecutive rows into one taller one: a wall column is ONE solid', () => {
    const box = new RoomMap('t', { rows: ['#####', '#...#', '#...#', '#####'] });
    const rects = box.solids.map((s) => s.rect).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    expect(rects).toEqual([
      { x0: 0, y0: 0, x1: 5, y1: 1 }, // the floor
      { x0: 0, y0: 1, x1: 1, y1: 3 }, // the left wall: two squares, one solid
      { x0: 4, y0: 1, x1: 5, y1: 3 }, // the right wall
      { x0: 0, y0: 3, x1: 5, y1: 4 }, // the roof
    ]);
  });

  it('covers every solid square once and nothing else: the area of the solids is the number of solid squares, and no two overlap', () => {
    const squares = SMALL.join('').split('').filter((ch) => ch === '#' || ch === 'G').length;
    const area = m.solids.filter((s) => s.kind === 'solid').reduce((n, s) => n + (s.rect.x1 - s.rect.x0) * (s.rect.y1 - s.rect.y0), 0);
    expect(area).toBe(squares);
    const solid = m.solids.filter((s) => s.kind === 'solid');
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]!.rect;
        const b = solid[j]!.rect;
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, `${solid[i]!.id} / ${solid[j]!.id}`).toBe(false);
      }
    }
  });

  it('every solid has a unique id, a valid rectangle and the material of its character: # is stone, G is earth', () => {
    expect(new Set(m.solids.map((s) => s.id)).size).toBe(m.solids.length);
    for (const s of m.solids) expect(s.rect.x0 < s.rect.x1 && s.rect.y0 < s.rect.y1, s.id).toBe(true);
    expect(m.solids.filter((s) => s.material === 'earth').length).toBeGreaterThan(0);
    expect(m.solids.find((s) => s.rect.y1 === 2 && s.rect.x0 === 0)?.material).toBe('earth');
  });

  it('a jump-through platform is a thin slab on the TOP of its squares: you stand on the top of the square, like on a block', () => {
    const platform = m.solids.find((s) => s.kind === 'oneway' && s.rect.x0 === 4)!;
    expect(platform.rect).toEqual({ x0: 4, y0: 5.7, x1: 6, y1: 6 });
    expect(platform.material).toBe('wood');
  });

  it('spikes are 0.6 m strips on the floor of their square, one hazard for each run', () => {
    expect(m.hazards).toHaveLength(1);
    expect(m.hazards[0]!.rect).toEqual({ x0: 4, y0: 1, x1: 6, y1: 1.6 });
  });

  it('a mark is the FEET of someone standing in its square: centred, on the floor of the square', () => {
    expect(m.at('a')).toMatchObject({ x: 3.5, y: 4, col: 3, row: 3 });
    expect(m.at('b')).toMatchObject({ x: 1.5, y: 2 });
    expect(m.at('c')).toMatchObject({ x: 7.5, y: 2 });
    expect(m.markNames()).toEqual(['a', 'b', 'c']);
  });

  it('a mark that is not in the picture, or is in it twice, is an error that says so', () => {
    expect(() => m.at('z')).toThrow(/no mark "z"/);
    const twice = new RoomMap('t', { rows: ['#####', '#a.a#', '#####'] });
    expect(() => twice.at('a')).toThrow(/2 times/);
    expect(twice.all('a').map((k) => k.col)).toEqual([1, 3]);
  });
});

describe('named regions are one solid with the id the table gives', () => {
  it('a door is the squares of its letter, as a solid with its id, material and tag', () => {
    const m = new RoomMap('t', { rows: ['#####', '#.D.#', '#.D.#', '#####'], regions: { D: { id: 'door', material: 'gate', tag: 'door' } } });
    const door = m.solids.find((s) => s.id === 'door')!;
    expect(door).toMatchObject({ rect: { x0: 2, y0: 1, x1: 3, y1: 3 }, material: 'gate', kind: 'solid', tag: 'door' });
  });

  it('a region may be a jump-through platform', () => {
    const m = new RoomMap('t', { rows: ['#####', '#.PP#', '#####'], regions: { P: { id: 'lift', kind: 'oneway' } } });
    expect(m.solids.find((s) => s.id === 'lift')).toMatchObject({ kind: 'oneway', rect: { x0: 2, x1: 4, y1: 2 } });
  });

  it('a region that is not one filled rectangle, is missing, or is not explained is an error', () => {
    expect(() => new RoomMap('t', { rows: ['#####', '#D.D#', '#####'], regions: { D: { id: 'door' } } })).toThrow(/not one filled rectangle/);
    expect(() => new RoomMap('t', { rows: ['#####', '#...#', '#####'], regions: { D: { id: 'door' } } })).toThrow(/not in the picture/);
    expect(() => new RoomMap('t', { rows: ['#####', '#.D.#', '#####'] })).toThrow(/does not describe/);
  });
});

describe('a picture that does not hold together is an error naming the room', () => {
  it('rows of different widths', () => {
    expect(() => new RoomMap('r', { rows: ['####', '###'] })).toThrow(/\[r\] row 1 is 3 wide/);
  });
  it('a character that means nothing', () => {
    expect(() => new RoomMap('r', { rows: ['####', '#?.#', '####'] })).toThrow(/means nothing/);
  });
  it('spikes that stand on nothing solid (air, a jump-through platform, the edge of the picture)', () => {
    expect(() => new RoomMap('r', { rows: ['#####', '#.^.#', '#...#', '#####'] })).toThrow(/stand on nothing solid/);
    expect(() => new RoomMap('r', { rows: ['#####', '#.^.#', '#.-.#', '#####'] })).toThrow(/stand on nothing solid/);
    expect(() => new RoomMap('r', { rows: ['#####', '#.^.#'] })).toThrow(/stand on nothing solid/);
  });
  it('an empty picture', () => {
    expect(() => new RoomMap('r', { rows: [] })).toThrow(/no rows/);
  });
});

describe('a room made from a picture', () => {
  const rows = [
    '########################',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#.........--...........#',
    '#......................#',
    '#.w...r....^^....s...e.#',
    'GGGGGGGGGGGGGGGGGGGGGGGG',
    '########################',
  ];
  const room = mapRoom(
    { id: 'demo', regionId: 'demo', name: 'Demo', nameKey: 'room.demo.name', art: { backdrop: 'ruins', seed: 1 }, rows },
    (m) => ({
      entries: [m.entry('west', 'w', 1), m.entry('east', 'e', -1), m.entry('rest', 'r', 1)],
      exits: [m.exitSide('west', 'west', 'w', { room: 'other', entry: 'east' }), m.exitSide('east', 'east', 'e', { room: 'other', entry: 'west' })],
      spawns: [m.spawn('slime', 'ink_slime', 's', { defeatFlag: 'defeated:demo_slime' })],
      interactables: [m.shrine('r')],
    }),
  );

  it('is a plain RoomDefinition that passes the same validator the hand-written rooms pass', () => {
    expect(validateRoom(room, { enemies: ENEMIES, player })).toEqual([]);
  });

  it('puts the camera on the picture, the room around it and the fall below it', () => {
    expect(room.camera?.bounds).toEqual({ x0: 0, y0: 0, x1: 24, y1: 11 });
    expect(room.bounds.x0).toBeLessThan(0);
    expect(room.bounds.y1).toBeGreaterThan(11);
    expect(room.killY).toBeLessThan(0);
  });

  it('places the pieces on the floor of their marks', () => {
    expect(room.entries.find((e) => e.id === 'west')).toMatchObject({ x: 2.5, y: 2, facing: 1 });
    expect(room.spawns![0]).toMatchObject({ id: 'slime', enemy: 'ink_slime', x: 17.5, y: 2, defeatFlag: 'defeated:demo_slime' });
    expect(room.interactables![0]).toMatchObject({ kind: 'rest', x: 6.5, y: 2 });
  });

  it('a way out in a side wall touches the wall and reaches 2.4 m in, 4 m tall, on the floor of its mark', () => {
    expect(room.exits!.find((x) => x.id === 'west')!.rect).toEqual({ x0: 1, y0: 2, x1: 3.4, y1: 6 });
    expect(room.exits!.find((x) => x.id === 'east')!.rect).toEqual({ x0: 23 - 2.4, y0: 2, x1: 23, y1: 6 });
  });

  it('the picture can be drawn again from the room: what was written is what the room has', () => {
    const back = pictureOf(room);
    expect(back).toHaveLength(11);
    expect(back[0]).toBe('#'.repeat(24));
    expect(back[8]!.slice(11, 13)).toBe('^^');
    expect(back[6]!.slice(10, 12)).toBe('--');
    expect(back[9]!).toBe('G'.repeat(24));
    expect(back[10]!).toBe('#'.repeat(24));
  });
});
