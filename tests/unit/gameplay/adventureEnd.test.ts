import { describe, expect, it } from 'vitest';
import { captureProgress, restoreFromProgress } from '@/gameplay/progress';
import { COMPLETED_FLAG, isCompleted } from '@/progression/adventure';
import { parseProgress, serializeProgress } from '@/save/ProgressData';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { driver, type Driver } from '../../helpers/sim';

/**
 * THE END OF THE ADVENTURE, in the simulation (docs/PROMPT20-LOG.md): a way out marked `end` completes the game. The first touch sets the world's memory of it (a flag like any other, so it is
 * saved, loaded, copied and repaired by everything that already handles flags) and raises `adventure:ended`; a way that is shut does nothing; a way that leads somewhere does not end anything; a hero who
 * is down ends nothing; and a loaded game that was completed is still completed.
 */
const ROOM: RoomDefinition = {
  id: 'finish',
  regionId: 'test',
  name: 'The last room',
  bounds: rect(-2, -14, 60, 20),
  killY: -20,
  entries: [
    { id: 'start', x: 4, y: 0, facing: 1 },
    { id: 'back', x: 30, y: 0, facing: -1 },
  ],
  solids: [block('wall_l', -3, -14, -1, 20), block('wall_r', 59, -14, 61, 20), ground('g', -1, 59)],
  exits: [
    { id: 'end', rect: rect(50, 0, 56, 4), end: true, requires: 'defeated:guardian' },
    { id: 'free', rect: rect(40, 0, 44, 4), end: true },
    { id: 'door', rect: rect(10, 0, 14, 4), to: { room: 'finish', entry: 'back' } },
  ],
};

function make(flags: string[] = []): Driver {
  const d = driver({ room: ROOM, extra: { rooms: { finish: ROOM }, flags } });
  d.settle();
  return d;
}

const at = (d: Driver, x: number): void => void d.teleport(x, 0).step(1);

/** What the session said, in order, of the end. */
function watch(d: Driver): string[] {
  const log: string[] = [];
  d.session.bus.on('flag:set', (e) => e.flag === COMPLETED_FLAG && log.push('flag'));
  d.session.bus.on('adventure:ended', (e) => log.push(`ended ${e.roomId}/${e.exitId}`));
  d.session.bus.on('exit:reached', (e) => log.push(`reached ${e.exitId}`));
  return log;
}

describe('the flag that says the game was taken to its end', () => {
  it('is an ordinary world flag: a valid name, so every save keeps it', () => {
    expect(COMPLETED_FLAG).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
    expect(COMPLETED_FLAG.startsWith('~'), 'not volatile: it is saved').toBe(false);
    expect(isCompleted((f) => f === COMPLETED_FLAG)).toBe(true);
    expect(isCompleted(() => false)).toBe(false);
  });
});

describe('a way out marked `end`', () => {
  it('completes the adventure the first time it is touched: the flag is set first, then the event, once', () => {
    const d = make(['defeated:guardian']);
    const log = watch(d);
    expect(isCompleted((f) => d.session.flags.has(f)), 'not before').toBe(false);
    at(d, 53);
    expect(log).toEqual(['reached end', 'flag', 'ended finish/end']);
    expect(isCompleted((f) => d.session.flags.has(f))).toBe(true);
    d.step(30);
    expect(log, 'standing in it raises nothing more').toHaveLength(3);
  });

  it('does nothing while the way is shut: no flag, no event — and works the moment what it asks for is there', () => {
    const d = make();
    const log = watch(d);
    at(d, 53);
    d.step(10);
    expect(log).toEqual([]);
    expect(d.session.flags.has(COMPLETED_FLAG)).toBe(false);
    expect([...d.session.exitsReached], 'a shut way is not spent').toEqual([]);
    d.session.flags.set('defeated:guardian');
    d.step(2);
    expect(log).toEqual(['reached end', 'flag', 'ended finish/end']);
  });

  it('is raised once per room build: the same room built again lets the way be touched again, and the flag is not set twice', () => {
    const d = make(['defeated:guardian']);
    const log = watch(d);
    at(d, 53);
    expect(log.filter((l) => l.startsWith('ended'))).toHaveLength(1);
    d.session.loadRoom('finish', 'start');
    d.settle();
    at(d, 53);
    expect(log.filter((l) => l.startsWith('ended')), 'a second visit to the end is announced again').toHaveLength(2);
    expect(log.filter((l) => l === 'flag'), 'but the memory was written once').toHaveLength(1);
  });

  it('a hero who is down ends nothing', () => {
    const d = make(['defeated:guardian']);
    const log = watch(d);
    d.p.health.damage(99);
    d.teleport(53, 0);
    d.step(3);
    expect(log).toEqual([]);
    expect(d.session.flags.has(COMPLETED_FLAG)).toBe(false);
  });

  it('a way that leads somewhere, or one that is only a zone, does not end anything', () => {
    const d = make();
    const log = watch(d);
    at(d, 12); // `door`: a connection (here back into the same room)
    d.step(1);
    expect(log.filter((l) => l.startsWith('ended'))).toEqual([]);
    expect(d.session.flags.has(COMPLETED_FLAG)).toBe(false);
  });

  it('an `end` that asks for nothing completes at the first touch', () => {
    const d = make();
    const log = watch(d);
    at(d, 42);
    expect(log).toEqual(['reached free', 'flag', 'ended finish/free']);
  });
});

describe('a completed game stays completed', () => {
  it('goes into the saved progress with the other flags, and a game loaded from it is completed — without ending again by itself', () => {
    const d = make(['defeated:guardian']);
    at(d, 53);
    const saved = captureProgress(d.session);
    expect(saved.flags).toContain(COMPLETED_FLAG);
    // through the text of the file and back: nothing repairs it away
    const again = parseProgress(serializeProgress(saved))!;
    expect(again.flags).toContain(COMPLETED_FLAG);

    const restored = restoreFromProgress(again, { finish: ROOM }, { room: 'finish', entry: 'start' });
    const loaded = driver({ room: ROOM, extra: { rooms: { finish: ROOM }, flags: restored.flags } });
    loaded.settle();
    const log = watch(loaded);
    expect(isCompleted((f) => loaded.session.flags.has(f))).toBe(true);
    loaded.step(60);
    expect(log, 'loading raises nothing').toEqual([]);
    loaded.teleport(53, 0).step(1);
    expect(log.filter((l) => l.startsWith('ended')), 'touching the end again is announced').toHaveLength(1);
    expect(log.filter((l) => l === 'flag'), 'and the memory is not written again').toHaveLength(0);
  });

  it('and a game that was not completed saves without the flag', () => {
    const d = make(['defeated:guardian']);
    d.step(5);
    expect(captureProgress(d.session).flags).not.toContain(COMPLETED_FLAG);
  });
});
