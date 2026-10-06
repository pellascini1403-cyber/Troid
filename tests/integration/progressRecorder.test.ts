import { describe, expect, it } from 'vitest';
import { attachProgressRecorder } from '@/app/progressRecorder';
import { ROOMS } from '@/content';
import { parseProgress } from '@/save/ProgressData';
import { ProgressStore } from '@/save/ProgressStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import { driver, type Driver } from '../helpers/sim';

/**
 * What saves the game (docs/PROMPT6-LOG.md S24): the recorder listens to the session and saves ONCE per burst of changes, right after the
 * tick that made them; it saves what matters (a flag, a card, an ability, a new bottle, a room entered, a rest) and not what does not
 * (every bottle that recharges, every hit); and it stops when it is told to.
 */
function setup(): { d: Driver; storage: MemoryStorage; store: ProgressStore; saves: () => number; stop: () => void } {
  const storage = new MemoryStorage();
  const store = new ProgressStore(storage);
  const d = driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked: ['dash'], extra: { rooms: ROOMS, flags: ['defeated:r1_slime'] } });
  d.settle();
  let n = 0;
  const original = store.save.bind(store);
  store.save = (data) => {
    n++;
    return original(data);
  };
  const stop = attachProgressRecorder(d.session, store);
  return { d, storage, store, saves: () => n, stop };
}
const flush = async (store: ProgressStore): Promise<void> => {
  await Promise.resolve();
  await store.flush();
};
const saved = async (storage: MemoryStorage) => parseProgress((await storage.get('troid.progress')) ?? '');

describe('the progress recorder', () => {
  it('saves nothing until something that belongs to the progress changes (a new game leaves no trace)', async () => {
    const { d, storage, store, saves } = setup();
    d.step(120);
    await flush(store);
    expect(saves()).toBe(0);
    expect(storage.keys()).toEqual([]);
  });

  it('a flag set is saved, after the tick, with what was true at that moment', async () => {
    const { d, storage, store, saves } = setup();
    d.session.flags.set('lever:test');
    expect(saves(), 'not synchronously: after the tick that made it').toBe(0);
    await flush(store);
    expect(saves()).toBe(1);
    expect((await saved(storage))?.flags).toEqual(['defeated:r1_slime', 'lever:test']);
  });

  it('a burst of changes is ONE save: taking a card sets a flag, equips it and teaches an ability in the same tick', async () => {
    const { d, storage, store, saves } = setup();
    d.session.loadout.acquire('card_spirit_bolt');
    d.session.flags.set('taken:card_spirit_bolt');
    await flush(store);
    expect(saves()).toBe(1);
    const p = await saved(storage);
    expect(p?.cards).toEqual({ owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' });
    expect(p?.abilities).toEqual(['dash', 'magic_attack']);
    expect(p?.flags).toContain('taken:card_spirit_bolt');
  });

  it('a new bottle slot, a room entered and a rest are each saved', async () => {
    const { d, storage, store } = setup();
    d.session.bottles.addSlot('energy_bottle');
    await flush(store);
    expect((await saved(storage))?.bottleSlots).toBe(4);
    const shrine = ROOMS.r2_hall!.interactables![0]!;
    d.teleport(shrine.x, shrine.y).settle();
    d.step(2);
    d.tap('interact');
    d.step(14);
    await flush(store);
    expect((await saved(storage))?.checkpoint).toEqual({ room: 'r2_hall', entry: 'rest' });
    const exit = ROOMS.r2_hall!.exits!.find((e) => e.id === 'east')!.rect;
    d.teleport((exit.x0 + exit.x1) / 2, 0);
    d.step(1);
    d.until(() => !d.session.transition.active, 100);
    await flush(store);
    expect((await saved(storage))?.at).toEqual({ room: 'r3_chamber', entry: 'west' });
  });

  it('a defeat that brings the hero back somewhere else is saved: a game saved now picks up THERE, not in the room they fell in', async () => {
    const { d, storage, store } = setup();
    d.session.rest('rest');
    await flush(store);
    const exit = ROOMS.r2_hall!.exits!.find((e) => e.id === 'east')!.rect;
    d.teleport((exit.x0 + exit.x1) / 2, 0);
    d.step(1);
    d.until(() => !d.session.transition.active, 100);
    await flush(store);
    expect((await saved(storage))?.at).toEqual({ room: 'r3_chamber', entry: 'west' });
    d.p.health.damage(d.p.health.current - 1);
    d.session.combat.submit({ ownerId: 'x', team: 'enemy', rect: { x0: d.body.x - 1, x1: d.body.x + 1, y0: 0, y1: 2 }, attackId: 'x', damage: 99, knockback: { x: 0, y: 0 }, stun: 0, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set() });
    d.step(1);
    d.until(() => !d.session.death.active, 600);
    await flush(store);
    expect((await saved(storage))?.at).toEqual({ room: 'r2_hall', entry: 'rest' });
  });

  it('what does not belong to the progress does not save: hits, bottles being drunk and recharging, the magic', async () => {
    const { d, store, saves } = setup();
    d.p.health.damage(2);
    d.session.magic.set(10);
    d.session.bottles.consume(0);
    d.step(600);
    await flush(store);
    expect(saves()).toBe(0);
  });

  it('volatile flags (`~…`) are never saved, even when they are the change that asked for the save', async () => {
    const { d, storage, store } = setup();
    d.session.flags.set('~arena_closed');
    await flush(store);
    expect((await saved(storage))?.flags ?? []).not.toContain('~arena_closed');
  });

  it('stops when told to: nothing is saved afterwards, even a change that was already on its way', async () => {
    const { d, storage, store, stop, saves } = setup();
    d.session.flags.set('a');
    stop();
    await flush(store);
    d.session.flags.set('b');
    await flush(store);
    expect(saves()).toBe(0);
    expect(storage.keys()).toEqual([]);
  });

  it('a save the storage refuses does not disturb the game: it goes on, and the next change tries again', async () => {
    const storage = new MemoryStorage();
    const failing = new ProgressStore({ get: storage.get.bind(storage), set: async () => { throw new Error('full'); }, remove: storage.remove.bind(storage) });
    const d = driver({ room: ROOMS.r2_hall!, entry: 'west', extra: { rooms: ROOMS } });
    attachProgressRecorder(d.session, failing);
    d.session.flags.set('a');
    d.step(5);
    await flush(failing);
    expect(d.session.flags.has('a')).toBe(true);
    expect(failing.value?.flags).toEqual(['a']);
  });
});
