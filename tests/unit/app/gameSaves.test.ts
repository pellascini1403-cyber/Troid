import { describe, expect, it } from 'vitest';
import { GameSaves, AUTOSAVE, type SaveNotice, type SavePlatform } from '@/app/gameSaves';
import { ROOMS } from '@/content';
import { PlayStats } from '@/gameplay/PlayStats';
import { newProgress, parseProgress, serializeProgress, type ProgressData } from '@/save/ProgressData';
import { SaveSlots, slotKey } from '@/save/SaveSlots';
import { SettingsStore } from '@/save/SettingsStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import { driver } from '../../helpers/sim';
import { FlakyStorage } from '../../helpers/storage';

/**
 * THE SAVED GAMES OF THE PAGE (docs/PROMPT14-LOG.md), with a page that is a fake: a clock, a reload, "the page is being left" and a timer, all in the test's hands. What is held here is what a player is
 * promised: the game is saved as it goes and when the page is left, the player is told what they need to know and nothing more, leaving for another game never writes the old one back over it, a delete
 * or a new game is the one way a game is lost, and nothing that is read from outside is trusted.
 */
interface Fake extends SavePlatform {
  reloads: number;
  leave(): void;
  tick(): void;
  advance(ms: number): void;
}
function fakePlatform(): Fake {
  let now = 1_760_000_000_000;
  const leaves = new Set<() => void>();
  const timers = new Set<{ ms: number; cb: () => void }>();
  return {
    reloads: 0,
    now: () => now,
    reload() {
      this.reloads++;
    },
    onLeave(cb) {
      leaves.add(cb);
      return () => void leaves.delete(cb);
    },
    every(ms, cb) {
      const t = { ms, cb };
      timers.add(t);
      return () => void timers.delete(t);
    },
    leave() {
      for (const cb of [...leaves]) cb();
    },
    tick() {
      for (const t of [...timers]) t.cb();
    },
    advance(ms) {
      now += ms;
    },
  };
}

const START = { room: 'r1_gate', entry: 'start' };
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function setup(opts: { storage?: MemoryStorage | FlakyStorage; durable?: boolean; slot?: number } = {}) {
  const storage = opts.storage ?? new MemoryStorage();
  const slots = new SaveSlots(storage);
  const settings = new SettingsStore(storage);
  await settings.load();
  const platform = fakePlatform();
  const notices: SaveNotice[] = [];
  const stats = new PlayStats();
  const slot = opts.slot ?? 1;
  const saves = new GameSaves({ slots, settings, slot, stats, durable: opts.durable ?? true, platform, notify: (n) => void notices.push(n) });
  const d = driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked: ['dash'], extra: { rooms: ROOMS } });
  d.settle();
  stats.attach(d.session.bus, d.session.room.id);
  saves.attach(d.session);
  const read = async (n = slot): Promise<ProgressData | null> => parseProgress((await storage.get(slotKey(n))) ?? '');
  return { storage, slots, settings, platform, notices, stats, saves, d, read };
}

describe('what the page knows about its storage', () => {
  it('says whether what is saved outlives the page: a browser that offers storage does, one that keeps nothing does not', async () => {
    const kept = await setup();
    expect(kept.saves.durable).toBe(true);
    kept.saves.dispose();
    const lost = await setup({ durable: false });
    expect(lost.saves.durable).toBe(false);
    lost.saves.dispose();
  });
});

describe('a game being played', () => {
  it('is saved when something of its progress changes, and the player is told "saved" — once, quietly', async () => {
    const { d, saves, notices, read } = await setup();
    d.session.flags.set('lever:test');
    await flush();
    expect((await read())?.flags).toContain('lever:test');
    expect(notices).toEqual([{ kind: 'saved', slot: 1 }]);
    saves.dispose();
  });

  it('is saved quietly when the hero has played a while since the last write, and the player is NOT told (a blink every half minute would be noise)', async () => {
    const { d, platform, notices, read, saves } = await setup();
    d.step(AUTOSAVE.afterTicks - 1);
    platform.tick();
    await flush();
    expect(await read(), 'not yet').toBeNull();
    d.step(1);
    platform.tick();
    await flush();
    expect((await read())?.stats.ticks).toBe(AUTOSAVE.afterTicks);
    expect(notices).toEqual([]);
    saves.dispose();
  });

  it('is saved when the page is left, if the hero has played since the last write — and only then — and the player is not told (the page is going away)', async () => {
    const { d, platform, notices, read, saves } = await setup();
    platform.leave();
    await flush();
    expect(await read(), 'nothing played, nothing to save').toBeNull();
    d.step(90);
    platform.leave();
    await flush();
    expect((await read())?.stats.ticks).toBe(90);
    expect(notices).toEqual([]);
    saves.dispose();
  });

  it('every save carries when it was written, by the platform\'s clock', async () => {
    const { d, platform, read, saves } = await setup();
    platform.advance(5000);
    d.session.flags.set('a');
    await flush();
    expect((await read())?.savedAt).toBe(1_760_000_005_000);
    saves.dispose();
  });

  it('a save the storage refuses tells the player ONCE in a while, not at every attempt, and the game goes on', async () => {
    const storage = new FlakyStorage();
    storage.failing = new Set(['set']);
    const { d, platform, notices, saves } = await setup({ storage });
    d.session.flags.set('a');
    await flush();
    d.session.flags.set('b');
    await flush();
    expect(notices.map((n) => n.kind)).toEqual(['failed']);
    platform.advance(AUTOSAVE.failedNoticeMs + 1);
    d.session.flags.set('c');
    await flush();
    expect(notices.map((n) => n.kind)).toEqual(['failed', 'failed']);
    expect(d.session.flags.has('c')).toBe(true);
    saves.dispose();
  });

  it('a browser that keeps nothing never says "saved" (it would be a lie): it says so once, as the game begins', async () => {
    const { d, notices, saves } = await setup({ durable: false });
    saves.announceStart({ state: 'empty' });
    d.session.flags.set('a');
    await flush();
    expect(notices.map((n) => n.kind)).toEqual(['unavailable']);
    saves.dispose();
  });

  it('what the start found is told once: a game recovered from its last good copy, or one that could not be read; a whole game or no game says nothing', async () => {
    const { notices, saves } = await setup();
    saves.announceStart({ state: 'empty' });
    saves.announceStart({ state: 'ok', value: newProgress(START), recovered: false });
    expect(notices).toEqual([]);
    saves.announceStart({ state: 'ok', value: newProgress(START), recovered: true });
    saves.announceStart({ state: 'damaged' });
    expect(notices).toEqual([{ kind: 'recovered', slot: 1 }, { kind: 'damaged', slot: 1 }]);
    saves.dispose();
  });

  it('a manual save writes now and says so', async () => {
    const { saves, notices, read } = await setup();
    expect(await saves.saveNow()).toBe(true);
    expect((await read())?.at).toEqual({ room: 'r2_hall', entry: 'west' });
    expect(notices).toEqual([{ kind: 'saved', slot: 1 }]);
    saves.dispose();
  });

  it('in a browser that keeps nothing a manual save is NOT a save: it answers false and says nothing of "saved" (what the memory took dies with the page)', async () => {
    const { saves, notices } = await setup({ durable: false });
    expect(await saves.saveNow()).toBe(false);
    expect(notices).toEqual([]);
    saves.dispose();
  });

  it('after it is disposed it writes nothing more', async () => {
    const { d, platform, saves, storage } = await setup();
    saves.dispose();
    d.session.flags.set('a');
    d.step(5000);
    platform.leave();
    platform.tick();
    await flush();
    expect(storage.keys()).toEqual([]);
    expect(saves.stopped).toBe(true);
  });
});

describe('the slots as the screen shows them', () => {
  it('each slot with its state, the zone it picks up in, the time played and when it was saved; the one being played is marked', async () => {
    const { slots, saves } = await setup({ slot: 2 });
    await slots.store(1).save({ ...newProgress({ room: 'r3_chamber', entry: 'rest' }), stats: { ticks: 7200, deaths: 0, kills: 0, rooms: ['r3_chamber'] }, savedAt: 1_700_000_000_000 });
    const cards = await (await saves.actions()).cards();
    expect(cards.map((c) => [c.slot, c.state, c.active])).toEqual([[1, 'ok', false], [2, 'empty', true], [3, 'empty', false]]);
    expect(cards[0]).toMatchObject({ zoneKey: 'room.r3.name', ticks: 7200, savedAt: 1_700_000_000_000 });
    expect(cards[1]).toMatchObject({ zoneKey: null, ticks: 0, savedAt: 0 });
    saves.dispose();
  });
});

describe('leaving for another game', () => {
  it('the game being left is saved as it stands, the choice is kept in the settings, the old game stops writing, and the page opens again', async () => {
    const { d, saves, settings, platform, read, storage } = await setup();
    d.step(240);
    expect(await (await saves.actions()).switchTo(3)).toBe(true);
    expect((await read(1))?.stats.ticks, 'the stretch just played is not lost').toBe(240);
    expect(settings.value.slot).toBe(3);
    expect(JSON.parse((await storage.get('troid.settings')) ?? '{}').slot).toBe(3);
    expect(platform.reloads).toBe(1);
    expect(saves.stopped).toBe(true);
    // what the game does on its way out cannot write itself back, onto either game
    d.session.flags.set('too-late');
    d.step(5000);
    platform.leave();
    await flush();
    expect((await read(1))?.flags).not.toContain('too-late');
    expect(await read(3)).toBeNull();
  });

  it('choosing the game that is already being played does nothing; a slot that does not exist is refused', async () => {
    const { saves, platform, settings } = await setup({ slot: 2 });
    expect(await (await saves.actions()).switchTo(2)).toBe(true);
    expect(await (await saves.actions()).switchTo(7)).toBe(false);
    expect(await (await saves.actions()).switchTo(0)).toBe(false);
    expect(platform.reloads).toBe(0);
    expect(settings.value.slot).toBe(1);
    expect(saves.stopped).toBe(false);
    saves.dispose();
  });

  it('if the choice cannot be KEPT, nothing changes: the game goes on writing, the page does not reopen, and the player is told', async () => {
    const storage = new FlakyStorage();
    const { d, saves, platform, notices, read } = await setup({ storage });
    storage.failing = new Set(['set']);
    expect(await (await saves.actions()).switchTo(2)).toBe(false);
    expect(platform.reloads).toBe(0);
    expect(saves.stopped).toBe(false);
    expect(notices.map((n) => n.kind)).toEqual(['failed']);
    storage.failing = new Set();
    d.session.flags.set('still-here');
    await flush();
    expect((await read())?.flags).toContain('still-here');
    saves.dispose();
  });
});

describe('a new game', () => {
  it('in the game being played: it stops writing FIRST, what was saved goes, and nothing the game does on its way out brings it back', async () => {
    const { d, saves, platform, slots, read } = await setup();
    d.session.flags.set('old');
    await flush();
    expect((await read())?.flags).toContain('old');
    expect(await (await saves.actions()).startOver(1)).toBe(true);
    expect(await read()).toBeNull();
    expect(platform.reloads).toBe(1);
    d.session.flags.set('after');
    d.step(5000);
    platform.leave();
    await flush();
    expect(await read(), 'not written back').toBeNull();
    expect((await slots.summaries())[0]?.state).toBe('empty');
  });

  it('in another slot: that game is replaced and chosen, this one is left as it was (saved), and the page opens on the new one', async () => {
    const { d, saves, slots, settings, platform, read } = await setup();
    await slots.store(2).save({ ...newProgress(START), flags: ['theirs'] });
    d.session.flags.set('mine');
    await flush();
    d.step(240); // a stretch played since the last write
    expect(await (await saves.actions()).startOver(2)).toBe(true);
    expect(await read(2)).toBeNull();
    expect(settings.value.slot).toBe(2);
    expect((await read(1))?.flags, 'the game that was being played is untouched').toContain('mine');
    expect((await read(1))?.stats.ticks, 'and the stretch it had played since its last write is saved: it is being LEFT, not destroyed').toBe(240);
    expect(platform.reloads).toBe(1);
  });

  it('a game that could not be read is kept aside, not thrown away, by a new game over it', async () => {
    const { saves, storage } = await setup();
    await storage.set(slotKey(1), 'half-writ');
    await (await saves.actions()).startOver(1);
    expect(await storage.get(slotKey(1))).toBeNull();
    expect(await storage.get(`${slotKey(1)}.corrupt`)).toBe('half-writ');
  });
});

describe('deleting', () => {
  it('another game: only that one goes, nothing reopens, nothing else is touched', async () => {
    const { d, saves, slots, platform, read } = await setup();
    d.session.flags.set('mine');
    await flush();
    await slots.store(2).save(newProgress(START));
    await slots.store(3).save(newProgress(START));
    expect(await (await saves.actions()).erase(2)).toBe(true);
    expect(await read(2)).toBeNull();
    expect(await read(3)).not.toBeNull();
    expect((await read(1))?.flags).toContain('mine');
    expect(platform.reloads).toBe(0);
    expect(saves.stopped).toBe(false);
    saves.dispose();
  });

  it('the game being played: it stops writing first, goes with every copy (the damaged one too), and the page opens on a new game in it', async () => {
    const { d, saves, platform, storage } = await setup();
    d.session.flags.set('mine');
    await flush();
    await storage.set(`${slotKey(1)}.corrupt`, 'old damage');
    expect(await (await saves.actions()).erase(1)).toBe(true);
    expect(storage.keys().filter((k) => k.startsWith('troid.progress'))).toEqual([]);
    expect(platform.reloads).toBe(1);
    d.step(5000);
    platform.leave();
    await flush();
    expect(storage.keys().filter((k) => k.startsWith('troid.progress'))).toEqual([]);
  });

  it('a slot that does not exist is refused', async () => {
    const { saves } = await setup();
    expect(await (await saves.actions()).erase(9)).toBe(false);
    saves.dispose();
  });
});

describe('taking a game out of the browser and putting one in', () => {
  it('exports a good game as the text a save is, named for its slot and the day; there is nothing to export from an empty or a damaged slot', async () => {
    const { saves, slots, storage } = await setup();
    await slots.store(2).save({ ...newProgress(START), flags: ['a'] });
    const out = await (await saves.actions()).exportSlot(2);
    expect(out?.filename).toBe('troid-partida-2-2025-10-09.json');
    expect(parseProgress(out!.text)?.flags).toEqual(['a']);
    expect(await (await saves.actions()).exportSlot(3)).toBeNull();
    await storage.set(slotKey(3), 'half-writ');
    expect(await (await saves.actions()).exportSlot(3)).toBeNull();
    expect(await (await saves.actions()).exportSlot(9)).toBeNull();
    saves.dispose();
  });

  it('what is exported can be imported, anywhere, and the game it makes is the same', async () => {
    const { saves, slots, read } = await setup();
    const game = { ...newProgress(START, ['dash']), flags: ['a', 'b'], stats: { ticks: 99, deaths: 1, kills: 2, rooms: ['r1_gate'] }, savedAt: 5 };
    await slots.store(2).save(game);
    const out = (await (await saves.actions()).exportSlot(2))!;
    expect(await (await saves.actions()).importInto(3, out.text)).toEqual({ ok: true });
    expect(await read(3)).toEqual(await read(2));
    saves.dispose();
  });

  it('an old game (version 1) is read by the same migration as any save, and what is hand-made is repaired, never trusted', async () => {
    const { saves, read } = await setup();
    const v1 = JSON.stringify({ saveVersion: 1, at: { room: 'r2_hall', entry: 'rest' }, checkpoint: { room: 'r2_hall', entry: 'rest' }, flags: ['x', '<script>', 7], abilities: ['dash'], cards: { owned: [], equipped: null }, bottleSlots: 99 });
    expect(await (await saves.actions()).importInto(2, v1)).toEqual({ ok: true });
    const p = await read(2);
    expect(p?.saveVersion).toBe(2);
    expect(p?.flags).toEqual(['x']);
    expect(p?.bottleSlots).toBe(8);
    saves.dispose();
  });

  it('refuses what is not a save — not JSON, a settings file, a later version, a text the size of a book — and writes nothing', async () => {
    const { saves, storage } = await setup();
    for (const bad of ['', 'not json', '{}', '[]', '{"version":3}', JSON.stringify({ saveVersion: 99 }), 'x'.repeat(AUTOSAVE.importMaxBytes + 1)]) {
      const r = await (await saves.actions()).importInto(2, bad);
      expect(r.ok, bad.slice(0, 20)).toBe(false);
    }
    expect((await (await saves.actions()).importInto(2, 'x'.repeat(AUTOSAVE.importMaxBytes + 1))).ok).toBe(false);
    expect(await (await saves.actions()).importInto(9, serializeProgress(newProgress(START)))).toEqual({ ok: false, reason: 'unreadable' });
    expect(storage.keys().filter((k) => k.startsWith('troid.progress'))).toEqual([]);
    saves.dispose();
  });

  it('importing over a game keeps the one it replaces as the backup of the write; importing into the game being played stops it writing and reopens the page', async () => {
    const { d, saves, platform, read, storage } = await setup();
    d.session.flags.set('mine');
    await flush();
    const theirs = serializeProgress({ ...newProgress(START), flags: ['theirs'] });
    expect(await (await saves.actions()).importInto(1, theirs)).toEqual({ ok: true });
    expect((await read(1))?.flags).toEqual(['theirs']);
    expect(platform.reloads).toBe(1);
    d.session.flags.set('after');
    d.step(5000);
    platform.leave();
    await flush();
    expect((await read(1))?.flags, 'the page\'s old game cannot write itself over what was imported').toEqual(['theirs']);
    expect(await storage.get(slotKey(1))).toBe(theirs);
  });

  it('a storage that refuses the write is reported, and the page is not reopened on nothing', async () => {
    const storage = new FlakyStorage();
    const { saves, platform } = await setup({ storage });
    storage.failing = new Set(['set']);
    expect(await (await saves.actions()).importInto(2, serializeProgress(newProgress(START)))).toEqual({ ok: false, reason: 'storage' });
    expect(platform.reloads).toBe(0);
    saves.dispose();
  });
});
