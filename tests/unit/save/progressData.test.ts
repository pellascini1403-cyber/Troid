import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newProgress, parseProgress, PROGRESS_LIMITS, PROGRESS_MIGRATIONS, PROGRESS_VERSION, repairProgress, serializeProgress } from '@/save/ProgressData';

/**
 * The PROGRESS as DATA (docs/PROMPT6-LOG.md S24): a version (`saveVersion`), repairs for whatever a damaged or hand-edited save could
 * be, and a migration chain with a golden file per version so a format change can never silently break the save of a player.
 * Version 2 (docs/PROMPT14-LOG.md) added what the game counts (time played, defeats, enemies beaten, rooms visited) and when the save was written.
 */
const start = { room: 'r1_gate', entry: 'start' };

describe('a new game', () => {
  it('starts at the start of the world, with the checkpoint there too, nothing won, the abilities it begins with and three bottle slots', () => {
    expect(newProgress(start, ['dash'])).toEqual({
      saveVersion: 2,
      at: start,
      checkpoint: start,
      flags: [],
      abilities: ['dash'],
      cards: { owned: [], equipped: null },
      bottleSlots: 3,
      stats: { ticks: 0, deaths: 0, kills: 0, rooms: ['r1_gate'] },
      savedAt: 0,
    });
    expect(PROGRESS_VERSION).toBe(2);
  });

  it('each one is a fresh object: changing one never changes the next', () => {
    const a = newProgress(start, ['dash']);
    a.flags.push('x');
    a.cards.owned.push('c');
    expect(newProgress(start, ['dash'])).toEqual(newProgress(start, ['dash']));
    expect(newProgress(start, ['dash']).flags).toEqual([]);
  });
});

describe('repair: any value becomes valid progress of the current version', () => {
  it('what is not an object becomes an empty save with no place (the session turns it into the start of the world); unknown keys are dropped', () => {
    for (const bad of [null, undefined, 3, 'x', []]) expect(repairProgress(bad)).toMatchObject({ saveVersion: 2, at: { room: '', entry: '' }, flags: [], abilities: [], bottleSlots: 3, stats: { ticks: 0, deaths: 0, kills: 0, rooms: [] }, savedAt: 0 });
    expect(Object.keys(repairProgress({ ...newProgress(start), hacked: true, volume: 11 })).sort()).toEqual(['abilities', 'at', 'bottleSlots', 'cards', 'checkpoint', 'flags', 'saveVersion', 'savedAt', 'stats']);
  });

  it('a place is a room and an entry, both plain names; anything else falls back to the OTHER place, and then to the empty one', () => {
    expect(repairProgress({ at: { room: 'r2_hall', entry: 'west' }, checkpoint: start }).at).toEqual({ room: 'r2_hall', entry: 'west' });
    expect(repairProgress({ at: { room: 3, entry: 'x' }, checkpoint: start }).at).toEqual(start);
    expect(repairProgress({ at: start, checkpoint: { room: '<script>', entry: 'x' } }).checkpoint).toEqual(start);
    expect(repairProgress({ at: 'nope', checkpoint: 'nope' }).at).toEqual({ room: '', entry: '' });
    expect(repairProgress({ at: { room: 'a'.repeat(65), entry: 'x' }, checkpoint: start }).at).toEqual(start);
    expect(repairProgress({ at: { room: '', entry: 'x' }, checkpoint: start }).at).toEqual(start);
  });

  it('lists keep only plain names, once each, sorted, and no more than the limit', () => {
    expect(repairProgress({ flags: ['b', 'a', 'a', 7, null, '', 'bad name', '<x>', 'ok:name_1.2-3'] }).flags).toEqual(['a', 'b', 'ok:name_1.2-3']);
    const many = Array.from({ length: PROGRESS_LIMITS.flags + 40 }, (_, i) => `f${String(i).padStart(4, '0')}`);
    expect(repairProgress({ flags: many }).flags).toHaveLength(PROGRESS_LIMITS.flags);
    expect(repairProgress({ flags: 'not a list' }).flags).toEqual([]);
    expect(repairProgress({ abilities: ['dash', 'dash', 5] }).abilities).toEqual(['dash']);
  });

  it('the cards: the equipped one must be one that is owned', () => {
    expect(repairProgress({ cards: { owned: ['a'], equipped: 'a' } }).cards).toEqual({ owned: ['a'], equipped: 'a' });
    expect(repairProgress({ cards: { owned: ['a'], equipped: 'b' } }).cards).toEqual({ owned: ['a'], equipped: null });
    expect(repairProgress({ cards: { owned: 'x', equipped: 'x' } }).cards).toEqual({ owned: [], equipped: null });
    expect(repairProgress({ cards: 7 }).cards).toEqual({ owned: [], equipped: null });
  });

  it('the bottle slots: a whole number between 0 and the limit; anything else is the default', () => {
    expect(repairProgress({ bottleSlots: 4 }).bottleSlots).toBe(4);
    expect(repairProgress({ bottleSlots: 4.9 }).bottleSlots).toBe(4);
    expect(repairProgress({ bottleSlots: 99 }).bottleSlots).toBe(PROGRESS_LIMITS.bottleSlots);
    expect(repairProgress({ bottleSlots: -2 }).bottleSlots).toBe(0);
    expect(repairProgress({ bottleSlots: 'many' }).bottleSlots).toBe(3);
    expect(repairProgress({ bottleSlots: Number.NaN }).bottleSlots).toBe(3);
  });

  it('the counts are whole numbers from 0 to a limit no person could reach; anything else is 0, and the rooms are plain names, once each, sorted', () => {
    expect(repairProgress({ stats: { ticks: 7200.9, deaths: 2, kills: 5, rooms: ['r2_hall', 'r1_gate', 'r1_gate', 7, '<x>'] } }).stats).toEqual({ ticks: 7200, deaths: 2, kills: 5, rooms: ['r1_gate', 'r2_hall'] });
    expect(repairProgress({ stats: { ticks: -5, deaths: -1, kills: Number.NaN } }).stats, 'a negative count is nothing').toEqual({ ticks: 0, deaths: 0, kills: 0, rooms: [] });
    expect(repairProgress({ stats: { ticks: 'long', deaths: null, kills: Number.POSITIVE_INFINITY } }).stats).toEqual({ ticks: 0, deaths: 0, kills: 0, rooms: [] });
    expect(repairProgress({ stats: { ticks: 1e18, deaths: 1e18, kills: 1e18 } }).stats, 'past the limit it is the limit').toMatchObject({ ticks: PROGRESS_LIMITS.ticks, deaths: PROGRESS_LIMITS.counter, kills: PROGRESS_LIMITS.counter });
    expect(repairProgress({ stats: 'many' }).stats).toEqual({ ticks: 0, deaths: 0, kills: 0, rooms: [] });
    const rooms = Array.from({ length: PROGRESS_LIMITS.rooms + 20 }, (_, i) => `r${String(i).padStart(3, '0')}`);
    expect(repairProgress({ stats: { rooms } }).stats.rooms).toHaveLength(PROGRESS_LIMITS.rooms);
  });

  it('the time it was saved is a whole instant a Date can hold; anything else is "not known" (0)', () => {
    expect(repairProgress({ savedAt: 1_760_000_000_123.7 }).savedAt).toBe(1_760_000_000_123);
    for (const bad of [-1, Number.NaN, 'yesterday', null, Number.POSITIVE_INFINITY, {}]) expect(repairProgress({ savedAt: bad }).savedAt, String(bad)).toBe(0);
    expect(repairProgress({ savedAt: 1e30 }).savedAt).toBe(PROGRESS_LIMITS.savedAt);
  });

  it('is idempotent: repairing what is already repaired changes nothing', () => {
    const once = repairProgress({ flags: ['b', 'a'], at: start, cards: { owned: ['c'], equipped: 'c' }, bottleSlots: 4, stats: { ticks: 99, deaths: 1, kills: 2, rooms: ['b', 'a'] }, savedAt: 5 });
    expect(repairProgress(once)).toEqual(once);
  });
});

describe('parsing what was stored', () => {
  const valid = {
    saveVersion: 2,
    at: { room: 'r2_hall', entry: 'rest' },
    checkpoint: { room: 'r2_hall', entry: 'rest' },
    flags: ['defeated:r1_slime'],
    abilities: ['dash'],
    cards: { owned: [], equipped: null },
    bottleSlots: 3,
    stats: { ticks: 3600, deaths: 1, kills: 2, rooms: ['r1_gate', 'r2_hall'] },
    savedAt: 1_760_000_000_000,
  };

  it('a valid value of the current version gives the same progress', () => {
    expect(parseProgress(JSON.stringify(valid))).toEqual(valid);
  });

  it('round trip: what is serialised parses back unchanged', () => {
    const p = newProgress({ room: 'r4_sanctum', entry: 'rest' }, ['dash', 'magic_attack'], 4);
    p.flags.push('defeated:r4_boss');
    expect(parseProgress(serializeProgress(p))).toEqual(repairProgress(p));
  });

  it('serialising repairs first: a bad value never reaches the storage', () => {
    const bad = { ...valid, flags: ['ok', 7, '<x>'], bottleSlots: 99, extra: 1 } as never;
    const back = parseProgress(serializeProgress(bad))!;
    expect(back.flags).toEqual(['ok']);
    expect(back.bottleSlots).toBe(PROGRESS_LIMITS.bottleSlots);
    expect(serializeProgress(bad)).not.toContain('extra');
  });

  it('what cannot be trusted at all is null: not JSON, not an object, no version, a wrong version', () => {
    for (const text of ['', 'not json', '{"saveVersion":2', 'null', '[]', '3', '"x"', '{}', '{"saveVersion":"1"}', '{"saveVersion":1.5}', '{"saveVersion":0}', '{"saveVersion":-1}']) {
      expect(parseProgress(text), text).toBeNull();
    }
  });

  it('a version NEWER than this build knows is null too: it belongs to a later game and must not be rewritten as if it were this one', () => {
    expect(parseProgress(JSON.stringify({ ...valid, saveVersion: PROGRESS_VERSION + 1 }))).toBeNull();
  });

  it('a settings file is not a save: it has no `saveVersion`', () => {
    expect(parseProgress('{"version":1,"language":"es","touch":{"scale":1,"opacity":1}}')).toBeNull();
  });

  it('a damaged value inside a valid envelope is repaired, not refused', () => {
    const p = parseProgress(JSON.stringify({ ...valid, flags: 'oops', bottleSlots: 'x', cards: null }))!;
    expect(p.flags).toEqual([]);
    expect(p.bottleSlots).toBe(3);
    expect(p.cards).toEqual({ owned: [], equipped: null });
  });
});

describe('migrations and golden files', () => {
  it('version 1 → 2 is the one migration there is', () => {
    expect(Object.keys(PROGRESS_MIGRATIONS)).toEqual(['1']);
  });

  it('the golden file of version 1 (a game saved before there were counts) still loads: everything it held is kept, the counts start at nothing, and the two rooms it names are the ones visited', () => {
    const golden = readFileSync(new URL('./golden/progress.v1.json', import.meta.url), 'utf8');
    expect(JSON.parse(golden).saveVersion).toBe(1);
    const p = parseProgress(golden)!;
    expect(p).not.toBeNull();
    expect(p.saveVersion).toBe(2);
    expect(p.at).toEqual({ room: 'r2_hall', entry: 'rest' });
    expect(p.flags).toEqual(['defeated:r1_slime', 'defeated:r2_slime']);
    expect(p.abilities).toEqual(['dash', 'magic_attack']);
    expect(p.cards).toEqual({ owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' });
    expect(p.bottleSlots).toBe(4);
    expect(p.stats).toEqual({ ticks: 0, deaths: 0, kills: 0, rooms: ['r2_hall'] });
    expect(p.savedAt, 'it was never stamped').toBe(0);
  });

  it('the migration of a damaged version-1 value never throws and never invents: what is not a place counts no room', () => {
    for (const bad of [{ saveVersion: 1 }, { saveVersion: 1, at: 'x', checkpoint: 7 }, { saveVersion: 1, at: { room: 3 }, checkpoint: null }]) {
      expect(parseProgress(JSON.stringify(bad))?.stats.rooms ?? [], JSON.stringify(bad)).toEqual([]);
    }
    expect(parseProgress(JSON.stringify({ saveVersion: 1, at: { room: 'r1_gate', entry: 'start' }, checkpoint: { room: 'r3_chamber', entry: 'rest' } }))?.stats.rooms).toEqual(['r1_gate', 'r3_chamber']);
  });

  it('a golden file of version 2 pins the current format: every field', () => {
    const golden = readFileSync(new URL('./golden/progress.v2.json', import.meta.url), 'utf8');
    const p = parseProgress(golden)!;
    expect(p).toEqual({
      saveVersion: 2,
      at: { room: 'r3_chamber', entry: 'rest' },
      checkpoint: { room: 'r2_hall', entry: 'rest' },
      flags: ['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime'],
      abilities: ['dash', 'magic_attack'],
      cards: { owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' },
      bottleSlots: 4,
      stats: { ticks: 123456, deaths: 3, kills: 7, rooms: ['r1_gate', 'r2_hall', 'r3_chamber'] },
      savedAt: 1_760_000_000_000,
    });
    // and writing it again is the same file, byte for byte
    expect(serializeProgress(p)).toBe(golden.trim());
  });

  it('a migration chain upgrades one version at a time, and a hole in it is null (nothing safe to do)', () => {
    const v1 = { saveVersion: 1, at: start, checkpoint: start, flags: ['a'], abilities: [], cards: { owned: [], equipped: null }, bottleSlots: 3 };
    const migrations = { 1: (d: Record<string, unknown>) => ({ ...d, saveVersion: 2, bottleSlots: 4 }), 2: (d: Record<string, unknown>) => ({ ...d, saveVersion: 3, flags: [...(d['flags'] as string[]), 'migrated'] }) };
    const out = parseProgress(JSON.stringify(v1), migrations, 3)!;
    expect(out.flags).toEqual(['a', 'migrated']);
    expect(out.bottleSlots).toBe(4);
    expect(parseProgress(JSON.stringify(v1), { 1: migrations[1] }, 3)).toBeNull();
  });
});
