import { describe, expect, it } from 'vitest';
import { WORLD } from '@/content';
import type { GameEvents } from '@/gameplay/events';
import { freshWorld, playWorld } from '../helpers/journey';
import type { Driver } from '../helpers/sim';

/**
 * The whole world walked by a scripted player with the inputs a person has (docs/PROMPT6-LOG.md S23): R1 → R2 → R3 → R4 → the end,
 * through the real transitions. If a retune of the controller, of a room or of the transition makes the world impossible to
 * cross, this is the test that says so.
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
  it('a scripted player crosses it: four rooms, three transitions, alive at the end of the world', () => {
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
    expect(d.session.room.id).toBe('r4_sanctum');
    expect(d.session.transition.active).toBe(false);
    expect(d.p.health.dead).toBe(false);
    expect(d.session.flags.list().sort()).toEqual(['defeated:r1_slime', 'defeated:r2_slime']);
  });

  it('visits the rooms in the order the world lists them', () => {
    const d = freshWorld();
    d.settle();
    const rooms = [d.session.room.id];
    d.session.bus.on('room:entered', (e) => void rooms.push(e.roomId));
    playWorld(d);
    expect(rooms).toEqual([...WORLD.rooms]);
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
