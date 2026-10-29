import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { COMPLETED_FLAG, isCompleted } from '@/progression/adventure';
import type { GameEvents } from '@/gameplay/events';
import { arriveIn, freshWorld, playWorld } from '../helpers/journey';
import type { Driver } from '../helpers/sim';
import { at } from '../helpers/zone';

/**
 * THE FIRST CHAPTER of the world walked by a scripted player with the inputs a person has (docs/PROMPT6-LOG.md S23): R1 → R2 → R3 → R4 → the Collapsed Nave, through the real transitions. The adventure goes on past the Sanctum —
 * sixty rooms more, six guardians more, and the way out of the world in the last of them — and each zone of it is played by its own test (`tests/integration/world/`); this one is the road from the first step to the first guardian, and the
 * touch of the way on. If a retune of the controller, of a room or of the transition makes it impossible to cross, this is the test that says so.
 */
function record(d: Driver): string[] {
  const log: string[] = [];
  const on = <K extends keyof GameEvents>(type: K, f: (p: GameEvents[K]) => string): void => void d.session.bus.on(type, ((p: GameEvents[K]) => log.push(`${d.session.now} ${f(p)}`)) as never);
  on('room:entered', (e) => `entered ${e.roomId}:${e.entryId} from ${e.from}`);
  on('exit:reached', (e) => `exit ${e.roomId}/${e.exitId}`);
  on('transition:cancelled', (e) => `cancelled ${e.reason}`);
  on('player:died', () => 'DIED');
  on('hazard:hit', (e) => `HAZARD ${e.roomId}/${e.hazardId}`);
  return log;
}

describe('the world from front to back', () => {
  it('a scripted player crosses the first chapter: four rooms, three transitions and a fourth begun at the way on, alive, with the Warden down and the Air Dash taken', () => {
    const d = freshWorld();
    d.settle();
    const log = record(d);
    playWorld(d);
    expect(log.filter((l) => l.includes('entered')).map((l) => l.replace(/^\d+ /, ''))).toEqual([
      'entered r2_hall:west from r1_gate',
      'entered r3_chamber:west from r2_hall',
      'entered r4_sanctum:west from r3_chamber',
    ]);
    expect(log.filter((l) => l.includes(' exit ')).map((l) => l.replace(/^\d+ /, ''))).toEqual(['exit r1_gate/east', 'exit r2_hall/east', 'exit r3_chamber/east', 'exit r4_sanctum/east']);
    expect(log.some((l) => l.includes('DIED') || l.includes('cancelled'))).toBe(false);
    expect(log.filter((l) => l.includes('HAZARD')), 'the journey hops the spikes of R2: it never touches them').toEqual([]);
    // the journey ends on the very tick that touches the way on: the transition to the Nave has begun and the room has not changed yet
    expect(d.session.room.id).toBe('r4_sanctum');
    expect(d.session.transition.active).toBe(true);
    expect(d.p.health.dead).toBe(false);
    expect(d.session.flags.list().sort()).toEqual(['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime', 'defeated:r4_boss', 'taken:air_dash', 'taken:card_spirit_bolt']);
    expect(d.session.abilities.has('air_dash'), 'the Warden left the Air Dash').toBe(true);
    expect(d.session.flags.list().some((f) => f.startsWith('~')), 'no volatile flag is left behind').toBe(false);
  });

  it('and the way on of the Sanctum LEADS ON: the hero arrives in the Collapsed Nave, the hub of the rest of the world, alive and with the adventure not over', () => {
    const d = freshWorld();
    d.settle();
    const ended: string[] = [];
    d.session.bus.on('adventure:ended', (e) => void ended.push(`${e.roomId}/${e.exitId}`));
    playWorld(d);
    arriveIn(d, 'ru_nave');
    expect(d.session.room.id).toBe('ru_nave');
    expect(d.session.transition.active).toBe(false);
    expect(d.p.health.dead).toBe(false);
    expect(ended, 'the Sanctum no longer ends the adventure').toEqual([]);
    expect(d.session.flags.has(COMPLETED_FLAG)).toBe(false);
  });

  it('the way out of the world COMPLETES the adventure: once, at the last exit of the last room, behind the Cinder Sovereign — with the game remembering it and nothing earlier having told it', () => {
    const ends = WORLD.rooms.flatMap((id) => (ROOMS[id]!.exits ?? []).filter((x) => x.end).map((x) => `${id}/${x.id}`));
    expect(ends, 'one way out of the world, and it is in the last room').toEqual(['ct_end/end']);
    expect(WORLD.rooms[WORLD.rooms.length - 1]).toBe('ct_end');
    const d = at(ROOMS, 'ct_end', 'west', ['dash'], ['defeated:ct_boss']);
    const ended: string[] = [];
    d.session.bus.on('adventure:ended', (e) => void ended.push(`${d.session.now} ${e.roomId}/${e.exitId}`));
    const completedAt: number[] = [];
    d.session.bus.on('flag:set', (e) => e.flag === COMPLETED_FLAG && completedAt.push(d.session.now));
    expect(isCompleted((f) => d.session.flags.has(f))).toBe(false);
    const z = ROOMS.ct_end!.exits!.find((x) => x.end)!.rect;
    d.teleport((z.x0 + z.x1) / 2, z.y0);
    d.step(1);
    expect(ended).toEqual([`${d.session.now} ct_end/end`]);
    expect(completedAt, 'the flag was set on that very tick, once').toEqual([d.session.now]);
    expect(isCompleted((f) => d.session.flags.has(f))).toBe(true);
  });

  it('R3 is where the hero gets the Spirit Bolt and uses it: the card is taken on the ledge, one bolt breaks the seal, and the sword never could', () => {
    const d = freshWorld();
    d.settle();
    const log: string[] = [];
    const bus = d.session.bus;
    bus.on('interaction:performed', (e) => log.push(`took ${e.id}`));
    bus.on('card:changed', (e) => log.push(`card ${e.type}`));
    bus.on('skill:cast', (e) => log.push(`cast ${e.skillId}`));
    bus.on('seal:rejected', () => log.push('rejected'));
    bus.on('actor:died', (e) => e.team === 'neutral' && log.push('seal fell'));
    bus.on('gate:changed', (e) => e.open && log.push(`opened ${e.gateId}`));
    playWorld(d);
    expect(d.session.loadout.equipped?.id).toBe('card_spirit_bolt');
    expect(d.session.abilities.has('magic_attack')).toBe(true);
    // in order: the card is acquired and equipped by the pickup, one bolt is cast, the ward falls and its door opens — and nothing was turned away
    const at = (what: string): number => log.indexOf(what);
    expect(at('card acquired')).toBeGreaterThanOrEqual(0);
    expect(at('card equipped')).toBeGreaterThan(at('card acquired'));
    expect(at('took card_spirit_bolt')).toBeGreaterThan(at('card equipped'));
    expect(at('cast spirit_bolt')).toBeGreaterThan(at('took card_spirit_bolt'));
    expect(at('opened seal_gate')).toBeGreaterThan(at('cast spirit_bolt'));
    expect(at('seal fell')).toBeGreaterThan(at('cast spirit_bolt'));
    expect(log.filter((l) => l === 'cast spirit_bolt'), 'one bolt is enough').toHaveLength(1);
    expect(log.filter((l) => l === 'took card_spirit_bolt'), 'the card is taken once').toHaveLength(1);
    expect(log.filter((l) => l === 'rejected'), 'the journey never swings at the seal').toEqual([]);
  });

  it('visits the rooms in the order the world lists them: the four of the Ruins, and the Nave after them', () => {
    const d = freshWorld();
    d.settle();
    const rooms = [d.session.room.id];
    d.session.bus.on('room:entered', (e) => void rooms.push(e.roomId));
    playWorld(d);
    expect(rooms).toEqual(WORLD.rooms.slice(0, 4));
    arriveIn(d, 'ru_nave');
    expect(rooms).toEqual(WORLD.rooms.slice(0, 5));
    expect(WORLD.rooms.slice(0, 5)).toEqual(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum', 'ru_nave']);
  });

  it('the whole journey is reproducible bit for bit', () => {
    const play = (): string => {
      const d = freshWorld();
      d.settle();
      const log = record(d);
      playWorld(d);
      return [...log, `end ${d.session.now} ${d.body.x.toFixed(9)} ${d.p.health.current} ${d.session.rng.state}`].join('\n');
    };
    const a = play();
    expect(a.split('\n').length).toBeGreaterThan(5);
    expect(play()).toBe(a);
  });

  it('a different seed plays out differently in the details and still crosses the world', () => {
    const seeds = [2, 99, 12345];
    const ends = seeds.map((seed) => {
      const d = freshWorld(seed);
      d.settle();
      playWorld(d);
      expect(d.session.room.id, `seed ${seed}`).toBe('r4_sanctum');
      expect(d.p.health.dead, `seed ${seed}`).toBe(false);
      return `${d.session.now} ${d.session.rng.state}`;
    });
    expect(new Set(ends).size).toBeGreaterThan(1);
  });
});
