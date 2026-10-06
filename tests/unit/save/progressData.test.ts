import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newProgress, parseProgress, PROGRESS_LIMITS, PROGRESS_MIGRATIONS, PROGRESS_VERSION, repairProgress, serializeProgress } from '@/save/ProgressData';

/**
 * The PROGRESS as DATA (docs/PROMPT6-LOG.md S24): a version (`saveVersion`), repairs for whatever a damaged or hand-edited save could
 * be, and a migration chain with a golden file per version so a format change can never silently break the save of a player.
 */
const start = { room: 'r1_gate', entry: 'start' };

describe('a new game', () => {
  it('starts at the start of the world, with the checkpoint there too, nothing won, the abilities it begins with and three bottle slots', () => {
    expect(newProgress(start, ['dash'])).toEqual({
      saveVersion: 1,
      at: start,
      checkpoint: start,
      flags: [],
      abilities: ['dash'],
      cards: { owned: [], equipped: null },
      bottleSlots: 3,
    });
    expect(PROGRESS_VERSION).toBe(1);
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
    for (const bad of [null, undefined, 3, 'x', []]) expect(repairProgress(bad)).toMatchObject({ saveVersion: 1, at: { room: '', entry: '' }, flags: [], abilities: [], bottleSlots: 3 });
    expect(Object.keys(repairProgress({ ...newProgress(start), hacked: true, volume: 11 })).sort()).toEqual(['abilities', 'at', 'bottleSlots', 'cards', 'checkpoint', 'flags', 'saveVersion']);
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

  it('is idempotent: repairing what is already repaired changes nothing', () => {
    const once = repairProgress({ flags: ['b', 'a'], at: start, cards: { owned: ['c'], equipped: 'c' }, bottleSlots: 4 });
    expect(repairProgress(once)).toEqual(once);
  });
});

describe('parsing what was stored', () => {
  const valid = { saveVersion: 1, at: { room: 'r2_hall', entry: 'rest' }, checkpoint: { room: 'r2_hall', entry: 'rest' }, flags: ['defeated:r1_slime'], abilities: ['dash'], cards: { owned: [], equipped: null }, bottleSlots: 3 };

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
    for (const text of ['', 'not json', '{"saveVersion":1', 'null', '[]', '3', '"x"', '{}', '{"saveVersion":"1"}', '{"saveVersion":1.5}', '{"saveVersion":0}', '{"saveVersion":-1}']) {
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
  it('version 1 is the first: the chain is empty', () => {
    expect(Object.keys(PROGRESS_MIGRATIONS)).toEqual([]);
  });

  it('the golden file of version 1 still parses to the progress it was written from (a format change must keep it readable)', () => {
    const golden = readFileSync(new URL('./golden/progress.v1.json', import.meta.url), 'utf8');
    const p = parseProgress(golden)!;
    expect(p).not.toBeNull();
    expect(p.at).toEqual({ room: 'r2_hall', entry: 'rest' });
    expect(p.flags).toEqual(['defeated:r1_slime', 'defeated:r2_slime']);
    expect(p.abilities).toEqual(['dash', 'magic_attack']);
    expect(p.cards).toEqual({ owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' });
    expect(p.bottleSlots).toBe(4);
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
