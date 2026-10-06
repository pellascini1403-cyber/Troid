import { describe, expect, it } from 'vitest';
import { validateRoom, type RoomRefs } from '@/world/validateRoom';
import { block, ground, oneWay, rect } from '@/world/builders';
import type { Rect } from '@/core/math';
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

describe('validateRoom: interactables', () => {
  const pickup = (patch: Partial<NonNullable<RoomDefinition['interactables']>[number]> = {}): NonNullable<RoomDefinition['interactables']>[number] => ({
    id: 'p', kind: 'pickup', verbKey: 'interact.pickUp', x: 10, y: 0, actions: [{ type: 'acquireCard', cardId: 'card_a' }, { type: 'setFlag', flag: 'taken:p' }], ...patch,
  });
  const withCards: Partial<RoomRefs> = { cards: new Set(['card_a']), bottles: new Set(['bottle_a']) };

  it('a sound interactable has no issues', () => {
    expect(codes(room({ interactables: [pickup()] }), withCards)).toEqual([]);
  });

  it('ids are unique, and the object stands inside the room on something', () => {
    expect(codes(room({ interactables: [pickup(), pickup()] }), withCards)).toContain('duplicate-id');
    expect(codes(room({ interactables: [pickup({ x: 500 })] }), withCards)).toContain('interactable-outside');
    expect(codes(room({ interactables: [pickup({ y: 6 })] }), withCards)).toContain('interactable-floating');
  });

  it('a verb key, a positive reach, a lock of 0…12 ticks and at least one action are required', () => {
    expect(codes(room({ interactables: [pickup({ verbKey: '' })] }), withCards)).toContain('interactable-verb');
    expect(codes(room({ interactables: [pickup({ reach: { x: 0, y: 1 } })] }), withCards)).toContain('interactable-reach');
    expect(codes(room({ interactables: [pickup({ lock: 13 })] }), withCards)).toContain('interactable-lock');
    expect(codes(room({ interactables: [pickup({ lock: 3.5 })] }), withCards)).toContain('interactable-lock');
    expect(codes(room({ interactables: [pickup({ lock: 12 })] }), withCards)).toEqual([]);
    expect(codes(room({ interactables: [pickup({ actions: [] })] }), withCards)).toContain('interactable-actions');
  });

  it('a card or a bottle it hands out must exist (when the references are given)', () => {
    expect(codes(room({ interactables: [pickup({ actions: [{ type: 'acquireCard', cardId: 'card_typo' }] })] }), withCards)).toContain('unknown-card');
    expect(codes(room({ interactables: [pickup({ actions: [{ type: 'addBottleSlot', bottleId: 'bottle_typo' }] })] }), withCards)).toContain('unknown-bottle');
    expect(codes(room({ interactables: [pickup({ actions: [{ type: 'acquireCard', cardId: 'anything' }] })] }))).toEqual([]); // no references given: not checked
  });

  it('flags may not be empty', () => {
    expect(codes(room({ interactables: [pickup({ whenClear: '' })] }), withCards)).toContain('empty-flag');
    expect(codes(room({ interactables: [pickup({ actions: [{ type: 'setFlag', flag: '' }] })] }), withCards)).toContain('empty-flag');
  });

  it('a lever may open a door of its room: the flag it sets counts as something that sets it', () => {
    const door = { gates: [{ id: 'g1', solid: 'door', openWhen: 'lever:on' }] };
    expect(codes(room({ ...door }))).toContain('gate-flag');
    const lever = pickup({ id: 'lever', kind: 'activate', actions: [{ type: 'setFlag', flag: 'lever:on' }] });
    expect(codes(room({ ...door, spawns: [], interactables: [lever] }), withCards)).toEqual([]);
  });

  it('a shrine must rest at an entry its room has, and one that is at the shrine (not across the room)', () => {
    const shrine = (entry: string, x = 10): RoomDefinition['interactables'] => [{ id: 'shrine', kind: 'rest', verbKey: 'interact.rest', x, y: 0, actions: [{ type: 'checkpoint', entry }] }];
    const entries = [{ id: 'start', x: 4, y: 0, facing: 1 as const }, { id: 'rest', x: 11, y: 0, facing: 1 as const }];
    expect(codes(room({ entries, interactables: shrine('rest') }))).toEqual([]);
    expect(codes(room({ entries, interactables: shrine('nowhere') }))).toContain('checkpoint-entry');
    expect(codes(room({ entries, interactables: shrine('start') }))).toContain('checkpoint-far'); // 6 m away
    expect(codes(room({ entries, interactables: shrine('rest', 18) }))).toContain('checkpoint-far');
  });

  describe('hazards', () => {
    const spikes = (over: Partial<NonNullable<RoomDefinition['hazards']>[number]> = {}): RoomDefinition['hazards'] => [{ id: 'sp', kind: 'spikes', rect: rect(20, 0, 24, 0.6), ...over }];

    it('a sound hazard raises no issue', () => {
      expect(codes(room({ hazards: spikes() }))).toEqual([]);
      expect(codes(room({ hazards: spikes({ damage: 2 }) }))).toEqual([]);
    });

    it('ids are unique, the zone is a real rectangle inside the room, and it takes a whole number of points, at least one', () => {
      expect(codes(room({ hazards: [...spikes()!, ...spikes()!] }))).toContain('duplicate-id');
      expect(codes(room({ hazards: spikes({ rect: { x0: 5, y0: 0, x1: 3, y1: 1 } }) }))).toContain('bad-hazard');
      expect(codes(room({ hazards: spikes({ rect: rect(500, 0, 504, 1) }) }))).toContain('hazard-outside');
      for (const damage of [0, -1, 1.5, Number.NaN]) expect(codes(room({ hazards: spikes({ damage }) })), `damage ${damage}`).toContain('hazard-damage');
    });

    it('an entrance must not put the hero inside a hazard: arriving, or coming back from a defeat, must not start by being hurt', () => {
      expect(codes(room({ hazards: spikes({ rect: rect(2, 0, 6, 1) }) }))).toContain('entry-in-hazard');
      expect(codes(room({ hazards: spikes({ rect: rect(5, 0, 8, 1) }) }))).not.toContain('entry-in-hazard'); // beside it
    });

    it('an exit must not overlap a hazard, nor an interactable stand in one', () => {
      expect(codes(room({ hazards: spikes({ rect: rect(54, 0, 56, 1) }) }))).toContain('hazard-in-exit');
      const lever: RoomDefinition['interactables'] = [{ id: 'lever', kind: 'activate', verbKey: 'k', x: 22, y: 0, actions: [{ type: 'setFlag', flag: 'x' }] }];
      expect(codes(room({ hazards: spikes(), interactables: lever }))).toContain('interactable-in-hazard');
      expect(codes(room({ hazards: spikes({ rect: rect(30, 0, 33, 1) }), interactables: lever }))).not.toContain('interactable-in-hazard');
    });
  });

  describe('camera', () => {
    type Camera = NonNullable<RoomDefinition['camera']>;
    type Zone = NonNullable<Camera['zones']>[number];
    const limits = (bounds: Rect): RoomDefinition => room({ camera: { bounds } });
    const zone = (over: Partial<Zone> = {}): Zone => ({ id: 'arena', rect: rect(20, 0, 40, 6), bounds: rect(18, -6, 42, 10), ...over });
    const withZones = (...zones: Zone[]): RoomDefinition => room({ camera: { bounds: rect(-1, -6, 60, 12), zones } });

    it('a room with no camera data, with limits that are tighter than its extents, and with a sound zone raise no issue', () => {
      expect(codes(room())).toEqual([]);
      expect(codes(limits(rect(-1, -6, 60, 12)))).toEqual([]);
      expect(codes(limits(rect(-1, -14, 60, 20)))).toEqual([]); // exactly the room's own
      expect(codes(withZones(zone()))).toEqual([]);
      expect(codes(room({ camera: { zones: [zone()] } }))).toEqual([]); // zones with the room's own limits
    });

    it('the limits are a real rectangle and cannot go beyond the room: the view only ever shows what the room has', () => {
      expect(codes(limits({ x0: 5, y0: 0, x1: 3, y1: 1 }))).toContain('bad-camera');
      expect(codes(limits({ x0: 0, y0: 0, x1: Number.NaN, y1: 1 }))).toContain('bad-camera');
      for (const bounds of [rect(-5, -6, 60, 12), rect(-1, -20, 60, 12), rect(-1, -6, 70, 12), rect(-1, -6, 60, 30)]) {
        expect(codes(limits(bounds)), JSON.stringify(bounds)).toContain('camera-outside');
      }
    });

    it('the limits hold every entrance (the hero standing at it) and every exit: nobody arrives, or leaves, out of view', () => {
      expect(codes(limits(rect(10, -6, 59, 12)))).toContain('camera-entry'); // the entrance is at x = 4
      expect(codes(limits(rect(-1, -6, 60, 1)))).toContain('camera-entry'); // and the hero is 1.7 m tall: the top limit cuts the head
      expect(codes(limits(rect(-1, 1, 60, 12)))).toContain('camera-entry'); // the feet are at y = 0, below the bottom limit
      expect(codes(limits(rect(-1, -6, 55, 12)))).toContain('camera-exit'); // the exit reaches x = 58
      expect(codes(limits(rect(-1, -6, 60, 3)))).toContain('camera-exit'); // and goes up to y = 4
    });

    it('zones have unique ids and rectangles that exist, for the zone and for the limits it holds', () => {
      expect(codes(withZones(zone(), zone()))).toContain('duplicate-id');
      expect(codes(withZones(zone({ rect: { x0: 9, y0: 0, x1: 4, y1: 6 } })))).toContain('bad-camera-zone');
      expect(codes(withZones(zone({ bounds: { x0: 9, y0: 0, x1: Number.NaN, y1: 6 } })))).toContain('bad-camera-zone');
    });

    it('the limits of a zone contain the zone: the hero in it can never be out of the picture', () => {
      expect(codes(withZones(zone({ bounds: rect(22, -6, 42, 10) })))).toContain('camera-zone-bounds'); // cuts the west side
      expect(codes(withZones(zone({ bounds: rect(18, -6, 38, 10) })))).toContain('camera-zone-bounds'); // cuts the east side
      expect(codes(withZones(zone({ bounds: rect(18, 2, 42, 10) })))).toContain('camera-zone-bounds'); // above the floor of the zone
      expect(codes(withZones(zone({ bounds: rect(20, 0, 40, 6) })))).toEqual([]); // exactly the zone is fine
    });

    it('the zoom is a visible height between 4 and 30 m, and the ease a time that is not negative', () => {
      for (const viewHeight of [0, 3.9, 30.1, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(codes(withZones(zone({ viewHeight })))).toContain('camera-zone-zoom');
      }
      for (const viewHeight of [4, 13.5, 30]) expect(codes(withZones(zone({ viewHeight }))), `${viewHeight} m`).toEqual([]);
      for (const smoothTime of [-0.1, Number.NaN]) expect(codes(withZones(zone({ smoothTime })))).toContain('camera-zone-smooth');
      for (const smoothTime of [0, 0.8]) expect(codes(withZones(zone({ smoothTime })))).toEqual([]);
    });

    it('a zone that depends on a flag reads one that something sets (the room, or the world), never an empty or an unknown one', () => {
      expect(codes(withZones(zone({ whenClear: 'defeated:s1' })))).toEqual([]); // the guardian of this room
      expect(codes(withZones(zone({ whenSet: 'defeated:s1' })))).toEqual([]);
      expect(codes(withZones(zone({ whenClear: 'defeated:nobody' })))).toContain('camera-zone-flag');
      expect(codes(withZones(zone({ whenSet: 'defeated:nobody' })))).toContain('camera-zone-flag');
      expect(codes(withZones(zone({ whenClear: 'defeated:r9_boss' })), { externalFlags: new Set(['defeated:r9_boss']) })).toEqual([]); // another room's
      expect(codes(withZones(zone({ whenSet: '' })))).toContain('empty-flag');
      expect(codes(withZones(zone({ whenClear: '' })))).toContain('empty-flag');
    });
  });
});
