import { describe, expect, it } from 'vitest';
import { newProgress, parseProgress, repairProgress, serializeProgress, type ProgressData } from '@/save/ProgressData';
import { ProgressStore } from '@/save/ProgressStore';
import { ChaosStorage, lcg } from '../helpers/chaosStorage';

/**
 * SOAK of the progress's persistence (docs/PROMPT6-LOG.md S24): hundreds of saves and COLD STARTS against a storage that misbehaves the way
 * real ones do — a write that throws before storing, one that stores and then throws, one that stores only the first part of the
 * text, one that is lost without a word, a removal that fails — and a process that is killed in the middle of a save. The promise of a
 * save is the same as the settings': whatever stops in the middle leaves a good copy behind. So after ANY of that, a clean load must
 * give a valid save that is NEVER OLDER than the last one that reported success: that one, or one asked for after it. A valid save is
 * never lost by writing a corrupt one over it.
 */
const SEEDS = Array.from({ length: Math.max(8, Number(process.env['SOAK_SEEDS'] ?? 8)) }, (_, i) => [1, 2, 3, 5, 8, 13, 21, 34][i] ?? 100 + i * 3571);
const OPS = Math.max(300, Number(process.env['SOAK_TICKS'] ?? 600));
const KEY = 'troid.progress';
const PLACES = [
  { room: 'r1_gate', entry: 'start' },
  { room: 'r2_hall', entry: 'rest' },
  { room: 'r3_chamber', entry: 'west' },
  { room: 'r4_sanctum', entry: 'rest' },
];

async function run(seed: number): Promise<{ violations: string[]; stats: ChaosStorage['stats']; coldStarts: number; committed: number }> {
  const rnd = lcg(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const violations: string[] = [];
  const bad = (what: string): void => {
    if (violations.length < 8) violations.push(`seed ${seed}: ${what}`);
  };
  const storage = new ChaosStorage(lcg(seed ^ 0x5bd1e995), KEY);
  let handle = storage.handle();
  let store = new ProgressStore(handle);
  let coldStarts = 0;
  let committedWrites = 0;

  // the game as it is now: it only ever grows (a flag is a flag for good), and the places and the slots change
  let game: ProgressData = newProgress(PLACES[0]!, ['dash']);
  let flagN = 0;
  // what a clean load may give right now: the text of the last save that reported success, or of any asked for after it. `null` = nothing was ever saved.
  let issued: Array<string | null> = [null];
  let lastCommit = 0;
  const pending: Array<Promise<void>> = [];

  const coldStart = async (killFirst: boolean): Promise<void> => {
    if (killFirst) handle.kill(); // the process dies where it stands: writes in flight stop at their next storage call
    else await Promise.all(pending);
    await Promise.allSettled(pending);
    pending.length = 0;
    coldStarts++;
    handle = storage.handle();
    store = new ProgressStore(handle);
    storage.note(`-- cold start; the storage holds ${JSON.stringify(Object.fromEntries(await Promise.all(storage.inner.keys().map(async (k) => [k.replace(KEY, 'main'), (await storage.inner.get(k))?.slice(0, 40)]))))}`);
    const wasFaulty = storage.faults;
    storage.faults = false; // the start-up itself reads a reliable store; it is the SAVING that goes wrong
    const loaded = await store.load();
    storage.faults = wasFaulty;
    const text = loaded === null ? null : serializeProgress(loaded);
    if (loaded !== null && JSON.stringify(repairProgress(loaded)) !== JSON.stringify(loaded)) bad(`a load gave progress that is not valid: ${JSON.stringify(loaded)}`);
    if (!issued.slice(lastCommit).includes(text)) {
      bad(
        `after cold start ${coldStarts} the load gave ${text}, which is OLDER than the last save that reported success (index ${lastCommit} of ${issued.length - 1})` +
          `\n      storage calls: ${storage.history.join(' · ')}\n      killed first: ${killFirst}`,
      );
    }
    // what the game continues from is what it loaded (or a new game); the next saves are measured from here
    game = loaded ?? newProgress(PLACES[0]!, ['dash']);
    flagN = game.flags.length;
    issued = [text];
    lastCommit = 0;
  };

  for (let i = 0; i < OPS; i++) {
    storage.faults = true;
    const r = rnd();
    if (r < 0.7) {
      // something happens in the game: the save is asked for at once and goes on in the background
      const what = rnd();
      if (what < 0.5) game = { ...game, flags: [...game.flags, `f${String(flagN++).padStart(5, '0')}`] };
      else if (what < 0.75) game = { ...game, at: pick(PLACES), checkpoint: pick(PLACES) };
      else if (what < 0.9) game = { ...game, cards: { owned: ['card_spirit_bolt'], equipped: 'card_spirit_bolt' }, abilities: ['dash', 'magic_attack'] };
      else game = { ...game, bottleSlots: 4 };
      game = repairProgress(game);
      const promise = store.save(game);
      const text = serializeProgress(game);
      issued.push(text);
      const index = issued.length - 1;
      const base = coldStarts;
      pending.push(
        promise.then((ok) => {
          if (ok && base === coldStarts) {
            lastCommit = Math.max(lastCommit, index);
            committedWrites++;
          }
        }),
      );
      if (rnd() < 0.5) await promise;
    } else if (r < 0.8) {
      await store.flush();
    } else if (r < 0.92) {
      await coldStart(false);
    } else {
      await coldStart(true); // killed mid-save
    }
  }
  storage.faults = false;
  await store.flush();
  await Promise.allSettled(pending);
  await coldStart(false); // and a last clean start
  // the storage holds nothing but the progress and, at most, its two safety copies
  for (const k of storage.inner.keys()) if (![KEY, `${KEY}.bak`, `${KEY}.corrupt`].includes(k)) bad(`a stray key "${k}"`);
  const main = await storage.inner.get(KEY);
  if (main !== null && parseProgress(main) === null && (await storage.inner.get(`${KEY}.bak`)) === null && committedWrites > 0) {
    // a damaged main is acceptable only while a good copy exists; after a clean load it must have been replaced or kept aside
    bad('the main file is damaged and there is no copy of it');
  }
  return { violations, stats: storage.stats, coldStarts, committed: committedWrites };
}

describe('progress persistence soak: saves and cold starts against a storage that fails, loses and truncates writes', () => {
  it('never loads anything but valid progress that is not older than the last saved change, on any seed — a good save is never lost to a bad write', async () => {
    const results = await Promise.all(SEEDS.map((seed) => run(seed)));
    expect(results.flatMap((r) => r.violations)).toEqual([]);
    // it really was hostile: every kind of failure happened, a lot of starts, and a lot of saves went through in between
    const sum = (f: (r: (typeof results)[number]) => number): number => results.reduce((n, r) => n + f(r), 0);
    expect(sum((r) => r.stats.threw)).toBeGreaterThan(30);
    expect(sum((r) => r.stats.storedThenThrew)).toBeGreaterThan(10);
    expect(sum((r) => r.stats.partial)).toBeGreaterThan(10);
    expect(sum((r) => r.stats.lost)).toBeGreaterThan(10);
    expect(sum((r) => r.stats.removeFailed)).toBeGreaterThan(5);
    expect(sum((r) => r.stats.killed)).toBeGreaterThan(5);
    expect(sum((r) => r.coldStarts)).toBeGreaterThan(100);
    expect(sum((r) => r.committed)).toBeGreaterThan(300);
  }, 280_000); // (a deeper hunt through SOAK_SEEDS / SOAK_TICKS may take a while)

  it('is deterministic: the same seed gives the same story', async () => {
    const a = await run(SEEDS[0]!);
    const b = await run(SEEDS[0]!);
    expect(b).toEqual(a);
  });
});
