import { describe, expect, it } from 'vitest';
import { attachProgressRecorder, type SaveReport } from '@/app/progressRecorder';
import { ROOMS } from '@/content';
import { captureProgress } from '@/gameplay/progress';
import { PlayStats } from '@/gameplay/PlayStats';
import { parseProgress } from '@/save/ProgressData';
import { ProgressStore } from '@/save/ProgressStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import { strikeOnPlayer } from '../helpers/combat';
import { driver } from '../helpers/sim';
import { FlakyStorage, SlowStorage } from '../helpers/storage';

/**
 * What the recorder adds to a save (docs/PROMPT14-LOG.md): what was COUNTED while playing and WHEN it was written, with the platform's clock — the simulation has none and must not. And the quiet saves:
 * the ones the page asks for when the hero has played a while, or is leaving, so the last stretch is never lost.
 */
function setup() {
  const storage = new MemoryStorage();
  const store = new ProgressStore(storage);
  const d = driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked: ['dash'], extra: { rooms: ROOMS } });
  d.settle();
  const stats = new PlayStats({ ticks: 600, deaths: 1, kills: 4, rooms: ['r1_gate'] });
  stats.attach(d.session.bus, d.session.room.id);
  let clock = 1_760_000_000_000;
  const reports: SaveReport[] = [];
  const recorder = attachProgressRecorder(d.session, store, { stats, now: () => clock, onSaved: (r) => void reports.push(r) });
  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await store.flush();
  };
  const saved = async () => parseProgress((await storage.get('troid.progress')) ?? '');
  return { d, storage, store, stats, recorder, reports, flush, saved, tick: (ms: number) => void (clock += ms), now: () => clock };
}

describe('what a save carries beyond the progress', () => {
  it('the counts as they stand and the time the platform\'s clock said — the play time is what the save had plus this session\'s ticks', async () => {
    const { d, recorder, flush, saved, now } = setup();
    d.step(300);
    d.session.flags.set('lever:test');
    await flush();
    const p = await saved();
    expect(p?.stats).toEqual({ ticks: 600 + d.session.now, deaths: 1, kills: 4, rooms: ['r1_gate', 'r2_hall'] });
    expect(p?.savedAt).toBe(now());
    expect(recorder.stopped).toBe(false);
  });

  it('a defeat and a kill are in the next save, counted from the events', async () => {
    const { d, stats, flush, saved } = setup();
    d.session.bus.emit('actor:died', { id: 'x', team: 'enemy', x: 0, y: 0 });
    d.session.bus.emit('death:started', { x: 0, y: 0 });
    d.session.flags.set('a');
    await flush();
    expect(stats.snapshot(0)).toMatchObject({ deaths: 2, kills: 5 });
    expect((await saved())?.stats).toMatchObject({ deaths: 2, kills: 5 });
  });

  it('a game saved without a platform clock says it does not know when (0), and without counts has counted nothing: the older call keeps working', async () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    const d = driver({ room: ROOMS.r2_hall!, entry: 'west', extra: { rooms: ROOMS } });
    attachProgressRecorder(d.session, store);
    d.session.flags.set('a');
    await Promise.resolve();
    await store.flush();
    const p = parseProgress((await storage.get('troid.progress')) ?? '');
    expect(p?.savedAt).toBe(0);
    expect(p?.stats).toEqual({ ticks: 0, deaths: 0, kills: 0, rooms: ['r2_hall'] });
  });
});

describe('telling the page how a save went', () => {
  it('says why it was made and that it reached the storage: progress, and a rest — which wins when both are in one burst', async () => {
    const { d, reports, flush } = setup();
    d.session.flags.set('a');
    await flush();
    expect(reports.map((r) => [r.ok, r.reason])).toEqual([[true, 'progress']]);
    d.session.flags.set('b');
    d.session.bus.emit('checkpoint:set', { room: 'r2_hall', entry: 'rest', x: 0, y: 0 });
    await flush();
    expect(reports.map((r) => r.reason)).toEqual(['progress', 'rest']);
  });

  it('says it did NOT reach the storage when the storage refuses, and the game goes on', async () => {
    const storage = new MemoryStorage();
    const failing = new ProgressStore({ get: storage.get.bind(storage), set: async () => { throw new Error('full'); }, remove: storage.remove.bind(storage) });
    const d = driver({ room: ROOMS.r2_hall!, entry: 'west', extra: { rooms: ROOMS } });
    const reports: SaveReport[] = [];
    attachProgressRecorder(d.session, failing, { onSaved: (r) => void reports.push(r) });
    d.session.flags.set('a');
    d.step(5);
    await Promise.resolve();
    await failing.flush();
    expect(reports.map((r) => r.ok)).toEqual([false]);
    expect(d.session.flags.has('a')).toBe(true);
  });
});

describe('the saves the page asks for', () => {
  it('saves NOW on request, whatever changed, and says it was asked for', async () => {
    const { recorder, reports, saved } = setup();
    expect(await recorder.saveNow('manual')).toBe(true);
    expect(reports.map((r) => r.reason)).toEqual(['manual']);
    expect((await saved())?.at).toEqual({ room: 'r2_hall', entry: 'west' });
  });

  it('a quiet save is made only when the hero has played at least that long since the last write — nothing to record is nothing to write', async () => {
    const { d, recorder, reports, flush } = setup();
    expect(recorder.unsavedTicks).toBe(0);
    d.step(100);
    recorder.saveIfPlayed(600, 'interval');
    await flush();
    expect(reports).toHaveLength(0);
    expect(recorder.unsavedTicks).toBe(100);
    d.step(500);
    recorder.saveIfPlayed(600, 'interval');
    await flush();
    expect(reports.map((r) => r.reason)).toEqual(['interval']);
    expect(recorder.unsavedTicks, 'the clock for the next one starts from this write').toBe(0);
    recorder.saveIfPlayed(1, 'leaving');
    await flush();
    expect(reports, 'leaving with nothing played since the last write writes nothing').toHaveLength(1);
    d.step(1);
    recorder.saveIfPlayed(1, 'leaving');
    await flush();
    expect(reports.map((r) => r.reason)).toEqual(['interval', 'leaving']);
  });

  it('a recorder that was stopped writes nothing at all — not a change on its way, not a manual save, not a quiet one: a game being left for another must not write itself back', async () => {
    const { d, recorder, storage, flush } = setup();
    d.session.flags.set('a');
    recorder.stop();
    await flush();
    expect(storage.keys()).toEqual([]);
    expect(await recorder.saveNow('manual')).toBe(false);
    d.step(1000);
    recorder.saveIfPlayed(1, 'leaving');
    await flush();
    expect(storage.keys()).toEqual([]);
    expect(recorder.stopped).toBe(true);
  });
});

describe('a write the page makes itself into the game\'s slot (an imported copy)', () => {
  it('while the game\'s own writes wait nothing is written — not a change, not a manual save, not a quiet one — and nothing is forgotten: the moment they go on, what was won meanwhile is saved', async () => {
    const { d, recorder, reports, storage, flush, saved } = setup();
    recorder.suspend();
    d.session.flags.set('won-meanwhile');
    d.step(3000);
    recorder.saveIfPlayed(1, 'leaving');
    recorder.saveIfPlayed(1, 'interval');
    expect(await recorder.saveNow('manual'), 'a manual save asked now is not made, and says so').toBe(false);
    await flush();
    expect(storage.keys()).toEqual([]);
    expect(reports).toEqual([]);
    expect(recorder.stopped, 'waiting is not stopping').toBe(false);
    recorder.resume();
    await flush();
    expect((await saved())?.flags).toContain('won-meanwhile');
    expect(reports.map((r) => [r.ok, r.reason])).toEqual([[true, 'progress']]);
    d.session.flags.set('after');
    await flush();
    expect((await saved())?.flags, 'and it saves as it always did').toContain('after');
  });

  it('going on with nothing missed writes nothing; a recorder that was stopped while it waited does not wake up', async () => {
    const { d, recorder, storage, flush } = setup();
    recorder.suspend();
    recorder.resume();
    recorder.resume(); // (a second one is nothing)
    await flush();
    expect(storage.keys()).toEqual([]);
    recorder.suspend();
    d.session.flags.set('won');
    recorder.stop();
    recorder.resume();
    await flush();
    expect(storage.keys()).toEqual([]);
  });
});

describe('the ticks that count as saved are the ones that reached the storage', () => {
  for (const guarded of [false, true]) {
    it(`a save the storage refuses leaves the quiet saves owed — ${guarded ? 'guarded against another tab' : 'unguarded'}: the next interval or the page being left tries again`, async () => {
      const flaky = new FlakyStorage();
      const store = new ProgressStore(flaky);
      const d = driver({ room: ROOMS.r2_hall!, entry: 'west', extra: { rooms: ROOMS } });
      d.settle();
      const reports: SaveReport[] = [];
      const recorder = attachProgressRecorder(d.session, store, { now: () => 1_760_000_000_000, onSaved: (r) => void reports.push(r), ...(guarded ? { knownSavedAt: 0 } : {}) });
      d.step(500);
      flaky.failing = new Set(['set']);
      expect(await recorder.saveNow('manual')).toBe(false);
      expect(recorder.unsavedTicks, 'nothing reached the storage, so the 500 ticks are still unsaved').toBe(500);
      d.step(10);
      flaky.failing = new Set();
      recorder.saveIfPlayed(1, 'leaving');
      await Promise.resolve();
      await store.flush();
      expect(reports.map((r) => [r.ok, r.reason])).toEqual([[false, 'manual'], [true, 'leaving']]);
      expect(recorder.unsavedTicks, 'now they are saved').toBe(0);
      expect(parseProgress((await flaky.get('troid.progress')) ?? '')?.at).toEqual({ room: 'r2_hall', entry: 'west' });
    });
  }
});

describe('writes that overlap in time (a storage that takes its time, as a native one does)', () => {
  function slowSetup(guarded: boolean) {
    const slow = new SlowStorage(2);
    const store = new ProgressStore(slow);
    const d = driver({ room: ROOMS.r2_hall!, entry: 'west', extra: { rooms: ROOMS } });
    d.settle();
    let clock = 1_760_000_000_000;
    const reports: SaveReport[] = [];
    const recorder = attachProgressRecorder(d.session, store, { now: () => clock, onSaved: (r) => void reports.push(r), ...(guarded ? { knownSavedAt: 0 } : {}) });
    const calls: string[] = [];
    const save = store.save.bind(store);
    const saveGuarded = store.saveGuarded.bind(store);
    store.save = (data) => (calls.push('save'), save(data));
    store.saveGuarded = (data, owns) => (calls.push('guarded'), saveGuarded(data, owns));
    return { d, slow, store, recorder, reports, calls, tick: (ms: number) => void (clock += ms) };
  }

  it('a page\'s own writes that are on their way together are never mistaken for another tab\'s: a quiet save asked for while another is still being written finds that one stored, and it is its own', async () => {
    const { d, store, recorder, reports, tick } = slowSetup(true);
    d.step(40);
    d.session.flags.set('a'); // a write, which takes a while
    await Promise.resolve();
    tick(5);
    d.step(40);
    recorder.saveIfPlayed(1, 'leaving'); // asked for while the first is still on its way: it holds the same picture of the storage the first did
    tick(5);
    expect(await recorder.saveNow('manual')).toBe(true); // and a third
    await store.flush();
    expect(recorder.conflicted, 'nobody else wrote anything: it must not stop, nor say so').toBe(false);
    expect(recorder.stopped).toBe(false);
    expect(reports.every((r) => r.ok && r.conflict === undefined)).toBe(true);
    expect(reports.length).toBeGreaterThanOrEqual(2);
    // and the game goes on being saved afterwards
    d.session.flags.set('b');
    await store.flush();
    await Promise.resolve();
    await store.flush();
    expect(reports.at(-1)?.ok).toBe(true);
  });

  it('what ANOTHER tab saved while this page\'s own writes are on their way is still refused', async () => {
    const { d, slow, store, recorder, tick } = slowSetup(true);
    d.session.flags.set('a');
    await Promise.resolve();
    tick(1000);
    // another tab of the game saves a game of its own in the meantime (a later moment than anything this page has written)
    const other = new ProgressStore(slow.inner);
    await other.save({ ...captureProgress(d.session, { savedAt: 1_760_000_000_000 + 500 }), flags: ['from-the-other-tab'] });
    d.session.flags.set('b');
    tick(1000);
    await store.flush();
    await Promise.resolve();
    await store.flush();
    expect(recorder.conflicted).toBe(true);
    expect(parseProgress((await slow.inner.get('troid.progress')) ?? '')?.flags, 'the other tab\'s game is whole').toEqual(['from-the-other-tab']);
  });

  for (const guarded of [false, true]) {
    it(`a quiet save is not asked for twice while the first is still being written — ${guarded ? 'guarded' : 'unguarded'}: a page being left raises several events at once and writes once`, async () => {
      const { d, store, recorder, calls, reports, tick } = slowSetup(guarded);
      d.step(100);
      recorder.saveIfPlayed(1, 'interval');
      recorder.saveIfPlayed(1, 'leaving');
      recorder.saveIfPlayed(1, 'leaving');
      expect(calls, 'three events, one write').toHaveLength(1);
      await store.flush();
      await Promise.resolve();
      expect(reports.map((r) => [r.ok, r.reason])).toEqual([[true, 'interval']]);
      expect(recorder.unsavedTicks).toBe(0);
      // more is played afterwards: the next one is a write again
      tick(10);
      d.step(5);
      recorder.saveIfPlayed(1, 'leaving');
      expect(calls).toHaveLength(2);
      await store.flush();
    });
  }

  it('a quiet save that the storage REFUSED withdraws its claim: the next quiet save asks for those ticks again', async () => {
    const flaky = new FlakyStorage();
    const store = new ProgressStore(flaky);
    const d = driver({ room: ROOMS.r2_hall!, entry: 'west', extra: { rooms: ROOMS } });
    d.settle();
    const reports: SaveReport[] = [];
    const recorder = attachProgressRecorder(d.session, store, { now: () => 1_760_000_000_000, onSaved: (r) => void reports.push(r) });
    d.step(100);
    flaky.failing = new Set(['set']);
    recorder.saveIfPlayed(1, 'interval');
    await Promise.resolve();
    await store.flush();
    await Promise.resolve();
    expect(reports.map((r) => r.ok)).toEqual([false]);
    flaky.failing = new Set();
    recorder.saveIfPlayed(1, 'leaving'); // the same 100 ticks are still owed
    await Promise.resolve();
    await store.flush();
    await Promise.resolve();
    expect(reports.map((r) => r.ok)).toEqual([false, true]);
    expect(recorder.unsavedTicks).toBe(0);
  });
});

describe('what the recorder does when a write goes wrong or is held', () => {
  it('a refusal that arrives while a LATER write is still on its way does not wipe that write\'s claim: the ticks it covers are not asked for again by the quiet saves that follow', async () => {
    const slow = new SlowStorage(2);
    let refuse = true;
    const store = new ProgressStore({
      get: (key) => slow.get(key),
      remove: (key) => slow.remove(key),
      set: async (key, value) => {
        if (refuse) {
          refuse = false; // the first write is refused, after a moment
          await new Promise((resolve) => setTimeout(resolve, 3));
          throw new Error('refused');
        }
        return slow.set(key, value);
      },
    });
    const d = driver({ room: ROOMS.r2_hall!, entry: 'west', extra: { rooms: ROOMS } });
    d.settle();
    let writes = 0;
    const save = store.save.bind(store);
    store.save = (data) => (writes++, save(data));
    const reports: SaveReport[] = [];
    const recorder = attachProgressRecorder(d.session, store, {
      now: () => 1_760_000_000_000,
      onSaved: (r) => {
        reports.push(r);
        // as the first write is refused, a page being left raises its quiet saves: the second write is still on its way and covers everything played
        if (!r.ok) for (let i = 0; i < 3; i++) recorder.saveIfPlayed(1, 'leaving');
      },
    });
    d.step(100);
    d.session.flags.set('a'); // the first write: refused
    await Promise.resolve();
    const second = recorder.saveNow('manual'); // the second, behind it
    expect(await second).toBe(true);
    await store.flush();
    expect(reports.map((r) => r.ok)).toEqual([false, true]);
    expect(writes, 'two writes, not five: the quiet saves found the second one already covering those ticks').toBe(2);
    expect(recorder.unsavedTicks).toBe(0);
  });

  it('a stretch that a leaving save could not claim because the writes were held is saved the moment they are let go', async () => {
    const { d, recorder, flush, saved, reports } = setup();
    recorder.suspend();
    d.step(500);
    recorder.saveIfPlayed(1, 'leaving'); // the page is hidden while a copy is being written into this slot
    await flush();
    expect(reports).toEqual([]);
    recorder.resume();
    await flush();
    expect((await saved())?.stats.ticks, 'the stretch it owed').toBe(600 + 500);
    expect(reports.map((r) => [r.ok, r.reason])).toEqual([[true, 'progress']]);
  });

  it('a store that throws where it never should is a refusal like any other: the recorder says so, does not stop, and the game does not go down with it', async () => {
    const { d, store, recorder, reports, flush } = setup();
    store.save = () => Promise.reject(new Error('the store blew up'));
    d.step(30);
    expect(await recorder.saveNow('manual')).toBe(false);
    expect(reports.map((r) => [r.ok, r.reason])).toEqual([[false, 'manual']]);
    expect(recorder.stopped).toBe(false);
    expect(recorder.unsavedTicks, 'nothing was saved, so those ticks are still owed').toBe(30);
    d.session.flags.set('later');
    await flush();
    expect(reports.map((r) => r.ok)).toEqual([false, false]);
  });
});

describe('what the game picks up from while the hero is going down', () => {
  it('a game saved during the defeat screen picks up at the CHECKPOINT, not at the door of the room that beat the hero', async () => {
    const d = driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked: ['dash'], extra: { rooms: ROOMS, checkpoint: { room: 'r1_gate', entry: 'start' } } });
    d.settle();
    expect(captureProgress(d.session).at, 'alive: where the hero came in').toEqual({ room: 'r2_hall', entry: 'west' });
    d.p.health.damage(d.p.health.current - 1);
    strikeOnPlayer(d);
    d.step(1);
    expect(d.p.health.dead).toBe(true);
    expect(d.session.deathSnapshot.phase).not.toBe('none');
    expect(captureProgress(d.session).at).toEqual({ room: 'r1_gate', entry: 'start' });
    d.until(() => d.session.deathSnapshot.phase === 'none', 2000);
    expect(captureProgress(d.session).at, 'back on its feet: where the defeat brought them').toEqual({ room: 'r1_gate', entry: 'start' });
  });
});
