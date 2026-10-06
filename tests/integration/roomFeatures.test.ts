import { describe, expect, it } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import type { Enemy } from '@/enemies/Enemy';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { strikeOnPlayer } from '../helpers/combat';
import { driver, type Driver } from '../helpers/sim';

/**
 * What a room can ASK of the session (docs/ARCHITECTURE-2D.md §5.11): place enemies by data, leave a flag when a guardian
 * falls, keep a door shut until a flag is set, and announce a way out. Memory (the flags) outlives deaths and reloads.
 */
const ROOM: RoomDefinition = {
  id: 'rf',
  regionId: 'test',
  name: 'Room features',
  bounds: rect(-2, -14, 72, 20),
  killY: -20,
  entries: [{ id: 'start', x: 4, y: 0, facing: 1 }, { id: 'back', x: 40, y: 0, facing: -1 }],
  solids: [
    block('wall_l', -3, -14, -1, 20),
    block('wall_r', 71, -14, 73, 20),
    ground('g', -1, 71),
    block('door', 30, 0, 31.5, 8, 'gate'),
  ],
  spawns: [
    { id: 'guard', enemy: 'ink_slime', x: 20, y: 0, facing: -1, defeatFlag: 'defeated:guard' },
    { id: 'wanderer', enemy: 'ink_slime', x: 50, y: 0, facing: 1 },
  ],
  gates: [{ id: 'door_1', solid: 'door', openWhen: 'defeated:guard' }],
  exits: [{ id: 'out', rect: rect(60, 0, 66, 4), to: { room: 'other', entry: 'start' } }],
};

const enemies = (d: Driver): Enemy[] => d.session.entities.filter((e) => e.kind === 'enemy') as Enemy[];
const byX = (d: Driver, x: number): Enemy | undefined => enemies(d).find((e) => Math.abs(e.body.x - x) < 3);

/** Kills an enemy with a player blow (so the real `actor:died` path runs). */
function kill(d: Driver, e: Enemy): void {
  d.session.combat.submit({
    ownerId: d.p.id, team: 'player', rect: { x0: e.body.x - 0.5, x1: e.body.x + 0.5, y0: 0, y1: 1 }, attackId: 'test_kill',
    damage: 99, knockback: { x: 2, y: 1 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
  });
  d.step(1);
}

function make(extra: Parameters<typeof driver>[0] = {}): Driver {
  return driver({ room: ROOM, ...extra });
}

describe('rooms place their enemies by data', () => {
  it('a room is whole when it is built: its enemies are in the world before the first tick', () => {
    const d = make();
    expect(enemies(d)).toHaveLength(2);
    expect(d.session.combat.count).toBe(3); // the player and both enemies
    const guard = byX(d, 20)!;
    expect(guard.def.id).toBe('ink_slime');
    expect(guard.facing).toBe(-1);
    expect(guard.home).toEqual({ x: 20, y: 0 });
    expect(byX(d, 50)!.facing).toBe(1);
  });

  it('enemies get ids in placement order, deterministically', () => {
    const a = make();
    const b = make();
    expect(enemies(a).map((e) => e.id)).toEqual(enemies(b).map((e) => e.id));
    expect(new Set(enemies(a).map((e) => e.id)).size).toBe(2);
  });

  it('announces them like any other entity, so views can bind to them', () => {
    const d = make();
    const spawned: string[] = [];
    d.session.bus.on('entity:spawned', ({ entity }) => spawned.push(entity.id));
    d.session.loadRoom('rf', 'start');
    expect(spawned).toHaveLength(2);
  });

  it('a spawn that names an unknown enemy fails loudly at build time, naming the room and the spawn', () => {
    const bad: RoomDefinition = { ...ROOM, spawns: [{ id: 'oops', enemy: 'dragon', x: 10, y: 0 }], gates: [] };
    expect(() => driver({ room: bad })).toThrow(/room "rf".*spawn "oops".*"dragon"/);
  });

  it('a room without spawns, gates or exits still works exactly as before', () => {
    const plain: RoomDefinition = { id: 'p', regionId: 't', name: 'p', bounds: rect(-2, -14, 20, 20), entries: [{ id: 'start', x: 4, y: 0 }], solids: [ground('g', -1, 20)] };
    const d = driver({ room: plain });
    d.step(30);
    expect(d.session.entities).toHaveLength(0);
    expect(d.session.flags.list()).toEqual([]);
  });
});

describe('a guardian that falls leaves its flag, and the door follows the flag', () => {
  it('the guardian\'s death sets its flag ONCE (with an event); an ordinary enemy sets nothing', () => {
    const d = make();
    const events: string[] = [];
    d.session.bus.on('flag:set', ({ flag }) => events.push(flag));
    kill(d, byX(d, 50)!);
    expect(d.session.flags.list()).toEqual([]);
    kill(d, byX(d, 20)!);
    expect(d.session.flags.list()).toEqual(['defeated:guard']);
    expect(events).toEqual(['defeated:guard']);
  });

  it('a closed gate is a wall: the player cannot walk through it; once the flag is set it opens (one event) and they can', () => {
    const d = make();
    const changes: Array<{ gateId: string; open: boolean }> = [];
    d.session.bus.on('gate:changed', (e) => changes.push({ gateId: e.gateId, open: e.open }));
    expect(d.session.gateOpen('door_1')).toBe(false);
    expect(d.session.collision.get('door')!.enabled).toBe(true);
    d.teleport(28, 0).settle();
    d.right();
    d.step(120);
    expect(d.body.x).toBeLessThan(30); // stopped by the door
    expect(changes).toEqual([]);

    d.session.flags.set('defeated:guard');
    expect(d.session.gateOpen('door_1')).toBe(true);
    expect(d.session.collision.get('door')!.enabled).toBe(false);
    expect(changes).toEqual([{ gateId: 'door_1', open: true }]);
    d.step(120);
    expect(d.body.x).toBeGreaterThan(32); // through
    // setting it again says nothing
    d.session.flags.set('defeated:guard');
    expect(changes).toHaveLength(1);
  });

  it('clearing the flag closes the gate again (debug / tests): another event, and a wall once more', () => {
    const d = make({ extra: { flags: ['defeated:guard'] } });
    expect(d.session.gateOpen('door_1')).toBe(true);
    const changes: boolean[] = [];
    d.session.bus.on('gate:changed', (e) => changes.push(e.open));
    d.session.flags.clear('defeated:guard');
    expect(changes).toEqual([false]);
    expect(d.session.collision.get('door')!.enabled).toBe(true);
  });

  it('starting with the flag already set (a loaded save): no guardian, the door is open, and nothing is announced about it', () => {
    const events: string[] = [];
    const d = driver({ room: ROOM, extra: { flags: ['defeated:guard'] } });
    d.session.bus.on('gate:changed', () => events.push('gate'));
    expect(enemies(d)).toHaveLength(1); // only the wanderer
    expect(byX(d, 20)).toBeUndefined();
    expect(d.session.gateOpen('door_1')).toBe(true);
    expect(d.session.collision.get('door')!.enabled).toBe(false);
    d.step(10);
    expect(events).toEqual([]);
  });
});

describe('the flags are the memory: they outlive a death and a reload', () => {
  it('after dying, the room is rebuilt: the ordinary enemy comes back, the beaten guardian does not, the door stays open', () => {
    const d = make({ extra: { death: { dying: 20, fadeOut: 5, hold: 5, fadeIn: 5, skipAfter: 2 } } });
    d.teleport(10, 0).settle();
    kill(d, byX(d, 20)!);
    kill(d, byX(d, 50)!);
    d.step(60); // the wanderer's body dissolves and is removed
    expect(enemies(d)).toHaveLength(0);
    // the player dies
    d.session.godMode = false;
    strikeOnPlayer(d, { damage: 99 });
    d.step(1);
    expect(d.p.health.dead).toBe(true);
    d.step(60); // dying 20 + fade 5 + title 5, then the respawn
    expect(d.p.health.dead).toBe(false);
    expect(enemies(d)).toHaveLength(1); // the wanderer is back…
    expect(byX(d, 50)).toBeDefined();
    expect(byX(d, 20)).toBeUndefined(); // …the guardian is not
    expect(d.session.flags.has('defeated:guard')).toBe(true);
    expect(d.session.gateOpen('door_1')).toBe(true);
    expect(d.session.collision.get('door')!.enabled).toBe(false);
  });

  it('dying BEFORE beating the guardian brings it back, with the door shut', () => {
    const d = make({ extra: { death: { dying: 20, fadeOut: 5, hold: 5, fadeIn: 5, skipAfter: 2 } } });
    strikeOnPlayer(d, { damage: 99 });
    d.step(60);
    expect(d.p.health.dead).toBe(false);
    expect(enemies(d)).toHaveLength(2);
    expect(d.session.flags.list()).toEqual([]);
    expect(d.session.gateOpen('door_1')).toBe(false);
  });

  it('loadRoom keeps the flags too (walking out and back in)', () => {
    const d = make();
    kill(d, byX(d, 20)!);
    d.session.loadRoom('rf', 'back');
    expect(byX(d, 20)).toBeUndefined();
    expect(d.session.gateOpen('door_1')).toBe(true);
    expect(d.p.x).toBeCloseTo(40, 6);
  });
});

describe('ways out', () => {
  it('touching the exit zone raises exit:reached once, with where it leads; leaving and coming back says nothing more', () => {
    const d = make();
    const reached: Array<{ roomId: string; exitId: string; to?: { room: string; entry: string } }> = [];
    d.session.bus.on('exit:reached', (e) => reached.push(e));
    d.teleport(58, 0).settle();
    d.step(5);
    expect(reached).toEqual([]);
    d.right();
    d.until(() => reached.length > 0, 120);
    expect(reached).toEqual([{ roomId: 'rf', exitId: 'out', to: { room: 'other', entry: 'start' } }]);
    expect([...d.session.exitsReached]).toEqual(['out']);
    d.left();
    d.step(120);
    d.right();
    d.step(120);
    expect(reached).toHaveLength(1);
  });

  it('a fallen player reaches nothing', () => {
    const d = make();
    d.teleport(61, 0).settle();
    d.p.health.damage(99);
    const reached: string[] = [];
    d.session.bus.on('exit:reached', (e) => reached.push(e.exitId));
    d.step(30);
    expect(reached).toEqual([]);
  });

  it('is announced again after the room is rebuilt', () => {
    const d = make();
    const reached: string[] = [];
    d.session.bus.on('exit:reached', (e) => reached.push(e.exitId));
    d.teleport(62, 0).settle();
    d.step(3);
    expect(reached).toEqual(['out']);
    d.session.loadRoom('rf', 'start');
    expect(d.session.exitsReached.size).toBe(0);
    d.teleport(62, 0).settle();
    d.step(3);
    expect(reached).toEqual(['out', 'out']);
  });
});

describe('no residue', () => {
  it('40 reloads (with enemies, flags, gates and exits) leave no entities, combatants, listeners or hitboxes behind', () => {
    const d = make();
    const listeners = d.session.bus.listenerCount();
    for (let i = 0; i < 40; i++) {
      d.step(20);
      d.session.loadRoom('rf', 'start');
      expect(d.session.entities).toHaveLength(2);
      expect(d.session.combat.count).toBe(3);
      expect(d.session.combat.pendingHitboxes).toHaveLength(0);
      expect(d.session.bus.listenerCount()).toBe(listeners);
    }
  });

  it('is reproducible bit for bit, enemies included', () => {
    const run = (): string[] => {
      const d = make({ seed: 5 });
      d.teleport(12, 0).settle();
      const log: string[] = [];
      for (let i = 0; i < 600; i++) {
        if (i % 80 === 30) d.tap('attack');
        d.step(1);
        log.push(enemies(d).map((e) => `${e.state}:${e.body.x.toFixed(6)}:${e.health.current}`).join('|') + ` ${d.body.x.toFixed(6)} ${d.p.health.current} ${d.session.rng.state}`);
      }
      return log;
    };
    expect(run()).toEqual(run());
  });
});

describe('the data the game ships', () => {
  it('uses only enemies that exist', () => {
    for (const sp of ROOM.spawns ?? []) expect(ENEMIES[sp.enemy], sp.id).toBeDefined();
  });
});
