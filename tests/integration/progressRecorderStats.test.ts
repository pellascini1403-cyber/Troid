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
