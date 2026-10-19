import { describe, expect, it } from 'vitest';
import { newProgress, serializeProgress, type ProgressData } from '@/save/ProgressData';
import { DEFAULT_SLOT, isSlot, sanitizeSlot, SaveSlots, SLOT_COUNT, slotKey } from '@/save/SaveSlots';
import { MemoryStorage } from '@/save/StorageAdapter';
import { FlakyStorage } from '../../helpers/storage';

/**
 * THE SAVED GAMES (docs/PROMPT14-LOG.md): a few independent places, each as hard to lose as any save in the game (they are the same `SafeStore`). What these tests hold them to: a game saved before there
 * were slots is slot 1 with nothing moved; a slot never touches another; looking at them rewrites nothing; a new game never throws away what could not be read; a delete is the one thing that takes
 * everything.
 */
const start = { room: 'r1_gate', entry: 'start' };
const game = (over: Partial<ProgressData> = {}): ProgressData => ({ ...newProgress(start, ['dash']), ...over });

describe('which slots there are', () => {
  it('three; the first is the key the game has always used (so a save from before slots is slot 1 as it lies, nothing copied) and the others hang from it', () => {
    expect(SLOT_COUNT).toBe(3);
    expect(DEFAULT_SLOT).toBe(1);
    expect([1, 2, 3].map(slotKey)).toEqual(['troid.progress', 'troid.progress.2', 'troid.progress.3']);
  });

  it('a slot is a whole number from 1 to 3; anything else is the first', () => {
    for (const ok of [1, 2, 3]) {
      expect(isSlot(ok)).toBe(true);
      expect(sanitizeSlot(ok)).toBe(ok);
    }
    for (const bad of [0, 4, -1, 1.5, '1', null, undefined, Number.NaN, {}]) {
      expect(isSlot(bad), String(bad)).toBe(false);
      expect(sanitizeSlot(bad), String(bad)).toBe(1);
    }
  });
});

describe('the store of a slot', () => {
  it('is always the SAME object for the same slot (every write to it goes through one queue), and another object for another slot', () => {
    const slots = new SaveSlots(new MemoryStorage());
    expect(slots.store(2)).toBe(slots.store(2));
    expect(slots.store(2)).not.toBe(slots.store(3));
    expect(slots.store(99), 'a slot that does not exist is the first').toBe(slots.store(1));
  });

  it('a save made before there were slots is read as slot 1, byte for byte, and the others are empty', async () => {
    const storage = new MemoryStorage();
    await storage.set('troid.progress', JSON.stringify({ saveVersion: 1, at: { room: 'r2_hall', entry: 'rest' }, checkpoint: { room: 'r2_hall', entry: 'rest' }, flags: ['defeated:r1_slime'], abilities: ['dash'], cards: { owned: [], equipped: null }, bottleSlots: 3 }));
    const before = await storage.get('troid.progress');
    const list = await new SaveSlots(storage).summaries();
    expect(list.map((s) => s.state)).toEqual(['ok', 'empty', 'empty']);
    expect(list[0]?.progress?.flags).toEqual(['defeated:r1_slime']);
    expect(list[0]?.progress?.saveVersion, 'migrated when read').toBe(2);
    expect(await storage.get('troid.progress'), 'and looking at it changed nothing').toBe(before);
  });

  it('slots are independent: a save in one is in no other, and a delete in one touches no other', async () => {
    const storage = new MemoryStorage();
    const slots = new SaveSlots(storage);
    await slots.store(1).save(game({ flags: ['a'] }));
    await slots.store(2).save(game({ flags: ['b'] }));
    await slots.store(3).save(game({ flags: ['c'] }));
    expect((await slots.summaries()).map((s) => s.progress?.flags)).toEqual([['a'], ['b'], ['c']]);
    expect(await slots.erase(2)).toBe(true);
    expect((await slots.summaries()).map((s) => s.state)).toEqual(['ok', 'empty', 'ok']);
    expect(await slots.restart(1)).toBe(true);
    expect((await slots.summaries()).map((s) => s.state)).toEqual(['empty', 'empty', 'ok']);
    expect((await slots.summaries())[2]?.progress?.flags).toEqual(['c']);
  });
});

describe('looking at the slots', () => {
  it('tells each of the four states apart: empty, a good save, a game recovered from its backup and one that cannot be read', async () => {
    const storage = new MemoryStorage();
    await storage.set(slotKey(1), serializeProgress(game({ flags: ['good'] })));
    await storage.set(slotKey(2), 'half-writ');
    await storage.set(`${slotKey(2)}.bak`, serializeProgress(game({ flags: ['backup'] })));
    await storage.set(slotKey(3), '{not json');
    const list = await new SaveSlots(storage).summaries();
    expect(list.map((s) => [s.slot, s.state])).toEqual([[1, 'ok'], [2, 'recovered'], [3, 'damaged']]);
    expect(list[1]?.progress?.flags).toEqual(['backup']);
    expect(list[2]?.progress, 'nothing to show of a game that cannot be read').toBeNull();
  });

  it('is READ-ONLY: it files no `.corrupt`, restores no backup and removes nothing, whatever it finds', async () => {
    const storage = new FlakyStorage();
    await storage.inner.set(slotKey(2), 'half-writ');
    await storage.inner.set(`${slotKey(2)}.bak`, serializeProgress(game()));
    await new SaveSlots(storage).summaries();
    expect(storage.log).toEqual([]);
  });

  it('a version from a LATER game is not read as if it were this one: it is shown as one that cannot be read, and kept', async () => {
    const storage = new MemoryStorage();
    const later = JSON.stringify({ saveVersion: 99, at: start, flags: ['future'] });
    await storage.set(slotKey(1), later);
    expect((await new SaveSlots(storage).summaries())[0]?.state).toBe('damaged');
    expect(await storage.get(slotKey(1))).toBe(later);
  });
});

describe('starting over and deleting', () => {
  it('a new game keeps aside a game that could not be read (filed as `.corrupt`); a delete takes it too', async () => {
    const storage = new MemoryStorage();
    const slots = new SaveSlots(storage);
    await storage.set(slotKey(2), 'half-writ');
    expect(await slots.restart(2)).toBe(true);
    expect(await storage.get(slotKey(2))).toBeNull();
    expect(await storage.get(`${slotKey(2)}.corrupt`)).toBe('half-writ');
    expect((await slots.summaries())[1]?.state, 'still something the player has: it can be deleted by name').toBe('damaged');
    expect(await slots.erase(2)).toBe(true);
    expect(storage.keys()).toEqual([]);
  });

  it('a new game over a GOOD one replaces it (the screen asks the player first) and the next save is a fresh game', async () => {
    const storage = new MemoryStorage();
    const slots = new SaveSlots(storage);
    await slots.store(1).save(game({ flags: ['old'] }));
    await slots.restart(1);
    expect((await slots.summaries())[0]?.state).toBe('empty');
    await slots.store(1).save(game({ flags: ['new'] }));
    expect((await slots.summaries())[0]?.progress?.flags).toEqual(['new']);
  });

  it('never throws: a storage that refuses is a `false`', async () => {
    const storage = new FlakyStorage();
    storage.failing = new Set(['get', 'set', 'remove']);
    const slots = new SaveSlots(storage);
    expect(await slots.restart(1)).toBe(false);
    expect(await slots.erase(1)).toBe(false);
    expect((await slots.summaries()).map((s) => s.state)).toEqual(['empty', 'empty', 'empty']);
  });
});
