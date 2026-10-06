import { describe, expect, it } from 'vitest';
import { validateRoom, type RoomRefs } from '@/world/validateRoom';
import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

const refs: RoomRefs = { enemies: { ink_slime: { body: { halfWidth: 0.55, height: 0.9 } } } };

/** A small valid room that every test below breaks in exactly one way. */
function room(patch: Partial<RoomDefinition> = {}): RoomDefinition {
  return {
    id: 't',
    regionId: 'test',
    name: 'Test',
    bounds: rect(-1, -14, 60, 20),
    killY: -20,
    entries: [{ id: 'start', x: 4, y: 0, facing: 1 }],
    solids: [block('wall_l', -2, -14, 0, 20), block('wall_r', 60, -14, 62, 20), ground('g', 0, 60), oneWay('plat', 20, 26, 3), block('door', 50, 0, 51.5, 8)],
    spawns: [{ id: 's1', enemy: 'ink_slime', x: 30, y: 0, defeatFlag: 'defeated:s1' }],
    gates: [{ id: 'g1', solid: 'door', openWhen: 'defeated:s1' }],
    exits: [{ id: 'east', rect: rect(53, 0, 58, 4) }],
    ...patch,
  };
}
const codes = (r: RoomDefinition, over: Partial<RoomRefs> = {}): string[] => validateRoom(r, { ...refs, ...over }).map((i) => i.code);

describe('validateRoom', () => {
  it('a sound room has no issues', () => {
    expect(validateRoom(room(), refs)).toEqual([]);
  });

  it('every message names the room', () => {
    const [issue] = validateRoom(room({ entries: [] }), refs);
    expect(issue?.message).toContain('[t]');
    expect(issue?.room).toBe('t');
  });

  it('ids must be unique in each family (solids, entries, spawns, gates, exits)', () => {
    expect(codes(room({ solids: [ground('g', 0, 60), ground('g', 0, 60)] }))).toContain('duplicate-id');
    expect(codes(room({ entries: [{ id: 'a', x: 4, y: 0 }, { id: 'a', x: 5, y: 0 }] }))).toContain('duplicate-id');
    expect(codes(room({ spawns: [{ id: 's', enemy: 'ink_slime', x: 30, y: 0 }, { id: 's', enemy: 'ink_slime', x: 31, y: 0 }] }))).toContain('duplicate-id');
    expect(codes(room({ exits: [{ id: 'e', rect: rect(53, 0, 58, 4) }, { id: 'e', rect: rect(40, 0, 41, 4) }] }))).toContain('duplicate-id');
  });

  it('a room needs an entrance; entrances must be inside, out of walls and standing on something', () => {
    expect(codes(room({ entries: [] }))).toContain('no-entry');
    expect(codes(room({ entries: [{ id: 'a', x: 500, y: 0 }] }))).toContain('entry-outside');
    expect(codes(room({ entries: [{ id: 'a', x: 50.5, y: 0 }] }))).toContain('entry-buried'); // inside the door
    expect(codes(room({ entries: [{ id: 'a', x: 4, y: 6 }] }))).toContain('entry-floating');
  });

  it('standing on a one-way platform is standing on something', () => {
    expect(codes(room({ entries: [{ id: 'a', x: 23, y: 3 }] }))).toEqual([]);
  });

  it('spawns must name a known enemy, be inside, not buried and not floating', () => {
    expect(codes(room({ spawns: [{ id: 's1', enemy: 'dragon', x: 30, y: 0, defeatFlag: 'defeated:s1' }] }))).toContain('unknown-enemy');
    expect(codes(room({ spawns: [{ id: 's1', enemy: 'ink_slime', x: 500, y: 0, defeatFlag: 'defeated:s1' }] }))).toContain('spawn-outside');
    expect(codes(room({ spawns: [{ id: 's1', enemy: 'ink_slime', x: 50.7, y: 0, defeatFlag: 'defeated:s1' }] }))).toContain('spawn-buried');
    expect(codes(room({ spawns: [{ id: 's1', enemy: 'ink_slime', x: 30, y: 5, defeatFlag: 'defeated:s1' }] }))).toContain('spawn-floating');
  });

  it('the enemy\'s own body decides whether it fits: a wider body is buried where a narrow one is not', () => {
    const wide: RoomRefs = { enemies: { ink_slime: { body: { halfWidth: 1.4, height: 0.9 } } } };
    // 48.8 + 1.4 = 50.2 > 50 (the door): buried; the real slime (0.55) would clear it
    const r = room({ spawns: [{ id: 's1', enemy: 'ink_slime', x: 48.8, y: 0, defeatFlag: 'defeated:s1' }] });
    expect(validateRoom(r, refs)).toEqual([]);
    expect(validateRoom(r, wide).map((i) => i.code)).toContain('spawn-buried');
  });

  it('gates must point at a solid that exists and open with a flag something can set', () => {
    expect(codes(room({ gates: [{ id: 'g1', solid: 'nope', openWhen: 'defeated:s1' }] }))).toContain('gate-solid');
    expect(codes(room({ gates: [{ id: 'g1', solid: 'door', openWhen: 'defeated:typo' }] }))).toContain('gate-flag');
    expect(codes(room({ gates: [{ id: 'g1', solid: 'door', openWhen: '' }] }))).toContain('empty-flag');
  });

  it('a gate may open with a flag from another room when it is declared external', () => {
    const r = room({ gates: [{ id: 'g1', solid: 'door', openWhen: 'pickup:elsewhere' }] });
    expect(codes(r)).toContain('gate-flag');
    expect(codes(r, { externalFlags: new Set(['pickup:elsewhere']) })).toEqual([]);
  });

  it('exits must be real rectangles that touch the room', () => {
    expect(codes(room({ exits: [{ id: 'e', rect: { x0: 5, y0: 0, x1: 5, y1: 4 } }] }))).toContain('bad-exit');
    expect(codes(room({ exits: [{ id: 'e', rect: rect(200, 0, 210, 4) }] }))).toContain('exit-outside');
  });

  it('bounds and killY must make sense', () => {
    expect(codes(room({ bounds: { x0: 5, y0: 0, x1: 5, y1: 4 } }))).toContain('bad-bounds');
    expect(codes(room({ killY: 99 }))).toContain('bad-killy');
    expect(codes(room({ solids: [{ id: 'x', rect: { x0: 3, y0: 0, x1: 1, y1: 2 } }, ground('g', 0, 60)] }))).toContain('bad-solid');
  });
});
