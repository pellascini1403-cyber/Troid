import { describe, expect, it } from 'vitest';
import { SWORD_HITS } from '@/content/attacks';
import type { GameEvents } from '@/gameplay/events';
import { mapRoom } from '@/world/roomMap';
import { validateRoom } from '@/world/validateRoom';
import { driver, type Driver } from '../helpers/sim';

/**
 * WALLS AND FLOORS THAT GIVE WAY (docs/PROMPT21-LOG.md): a seal with the look of split stone. It is the same machine as the ward of R3 — a neutral target that turns away what it does not accept and breaks for good on what it does, a flag
 * that remembers it, a door (the stone itself) that opens with the flag — and the same persistence: through a death, a change of room and a saved game, a wall that was broken stays broken.
 *
 *   a wall that any blow of the sword brings down (and the slam, and the bolt)       a floor that only the Ground Slam breaks, from above
 */
const W = 30;
const H = 22;
const SWORD_AND_MORE = [...SWORD_HITS, 'slam', 'slam_dive', 'spirit_bolt'];

/** An upper floor (top at y = 10) over a chamber (floor at y = 2); on the upper floor a wall 5 m tall at x = 10 and, at x = 17…19, a stretch of the floor that is split. */
function wallRoom() {
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  const fill = (x0: number, x1: number, y0: number, y1: number, ch: string): void => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[H - 1 - y]![x] = ch;
  };
  fill(0, W, 0, 1, '#');
  fill(0, W, 1, 2, 'G'); // the floor of the chamber, top at y = 2
  fill(0, 1, 0, H, '#');
  fill(W - 1, W, 0, H, '#');
  fill(0, W, H - 1, H, '#');
  fill(1, W - 1, 9, 10, 'G'); // the upper floor, top at y = 10…
  fill(17, 19, 9, 10, 'F'); // …with a split stretch
  fill(10, 11, 10, 15, 'W'); // the wall
  const mark = (x: number, y: number, ch: string): void => {
    grid[H - 1 - y]![x] = ch;
  };
  mark(3, 10, 'a');
  mark(24, 10, 'b');
  mark(8, 2, 'c');
  return mapRoom(
    {
      id: 'breaks',
      regionId: 'lab',
      name: 'Breaks',
      nameKey: 'room.lab.name',
      art: { backdrop: 'ruins', seed: 1 },
      rows: grid.map((r) => r.join('')),
      regions: { W: { id: 'crack_wall', material: 'stone', tag: 'crack' }, F: { id: 'crack_floor', material: 'stone', tag: 'crack' } },
    },
    (m) => ({
      entries: [m.entry('start', 'a', 1), m.entry('upper', 'b', -1), m.entry('lower', 'c', 1)],
      gates: [m.gate('wall_gate', 'crack_wall', 'broken:wall'), m.gate('floor_gate', 'crack_floor', 'broken:floor')],
      seals: [
        { id: 'wall_crack', x: 10.5, y: 10, area: { x0: 9.6, y0: 10, x1: 11.4, y1: 15 }, accepts: SWORD_AND_MORE, flag: 'broken:wall', style: 'crack' },
        { id: 'floor_crack', x: 18, y: 10, area: { x0: 16.9, y0: 9.4, x1: 19.1, y1: 10.4 }, accepts: ['slam', 'slam_dive'], flag: 'broken:floor', style: 'crack' },
      ],
    }),
  );
}

function setup(flags: string[] = [], abilities: string[] = ['dash']): Driver {
  const room = wallRoom();
  return driver({ room, unlocked: abilities, entry: 'start', extra: { flags } });
}
const log = (d: Driver, ...names: Array<keyof GameEvents>): Array<[string, unknown]> => {
  const out: Array<[string, unknown]> = [];
  for (const n of names) d.session.bus.on(n, (e) => void out.push([n as string, e]));
  return out;
};

describe('the picture and its data', () => {
  it('the room passes the validator (a seal of a door the room has, standing on its floor, with something that breaks it)', () => {
    const room = wallRoom();
    const issues = validateRoom(room, { enemies: {}, abilities: new Set(['dash']) });
    expect(issues.filter((i) => !['seal-floating'].includes(i.code))).toEqual([]);
  });
});

describe('a wall that any blow brings down', () => {
  it('stands in the way: the hero is stopped by it and a blow of the sword breaks it for good', () => {
    const d = setup();
    const events = log(d, 'actor:died', 'gate:changed', 'flag:set');
    d.settle();
    d.teleport(8.3, 10);
    d.settle();
    d.right();
    d.step(30);
    expect(d.body.x, 'stopped by the stone').toBeLessThan(9.7);
    d.stop();
    d.tap('attack');
    d.step(14);
    expect(d.session.flags.has('broken:wall')).toBe(true);
    expect(events.some(([n, e]) => n === 'gate:changed' && (e as { gateId: string }).gateId === 'wall_gate')).toBe(true);
    d.right();
    d.step(60);
    expect(d.body.x, 'and now through it').toBeGreaterThan(12);
  });

  it('a wall that was broken is never built again: a room built afterwards has it open', () => {
    const d = setup(['broken:wall']);
    d.settle();
    d.teleport(8.3, 10);
    d.settle();
    d.right();
    d.step(60);
    expect(d.body.x).toBeGreaterThan(12);
    expect(d.session.entities.filter((e) => e.kind === 'seal')).toHaveLength(1); // only the floor
  });
});

describe('a floor that only the Ground Slam breaks', () => {
  it('turns away the sword and the bolt, and says so: the floor holds', () => {
    const d = setup([], ['dash', 'magic_attack']);
    const events = log(d, 'seal:rejected');
    d.session.loadout.acquire('card_spirit_bolt');
    d.teleport(17.5, 10);
    d.settle();
    d.moveY = -1;
    d.tap('attack'); // crouch attack, down on the floor: the sword, turned away
    d.step(20);
    expect(d.session.flags.has('broken:floor')).toBe(false);
    expect(events.length).toBeGreaterThan(0);
    expect(d.body.y, 'still on the floor').toBeCloseTo(10, 1);
  });

  it('breaks under the slam: the hero falls through into the chamber below, and the floor stays gone', () => {
    const d = setup([], ['dash', 'ground_slam']);
    d.teleport(17.5, 15);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.session.flags.has('broken:floor'), 80);
    d.until(() => d.body.y < 5, 60);
    d.stop();
    d.until(() => d.p.controller.state === 'free', 80);
    expect(d.body.y, 'on the floor of the chamber under it').toBeCloseTo(2, 1);
  });

  it('without the ability there is no way to do it: down and attack in the air is only the air attack, which the floor turns away', () => {
    const d = setup();
    d.teleport(17.5, 15);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.step(80);
    expect(d.session.flags.has('broken:floor')).toBe(false);
  });
});

describe('the sword list', () => {
  it('names the four blows of the sword and nothing else', () => {
    expect([...SWORD_HITS].sort()).toEqual(['air_slash', 'crouch_slash', 'slash_1', 'slash_2']);
  });
});
