/**
 * The player's PROGRESS as data (docs/ARCHITECTURE-2D.md §11, docs/PROMPT6-LOG.md S24): where the hero is, where they come back after a
 * defeat, and the world's memory. It is NOT the settings (language, controls): those are another model under another key, so a
 * player who resets one never loses the other. Versioned (`saveVersion`) and repairable, exactly like the settings.
 *
 * The heart of it is the set of world FLAGS (`WorldFlags`): "that guardian is defeated", "this card was taken", "the boss is down" are
 * flags, so a loaded game builds every room the way a respawn does — by reading them. Around it, what the flags cannot say: the
 * abilities, the cards and the bottle slots the hero owns, and the two places (`at` and `checkpoint`).
 *
 * Version 2 (docs/PROMPT14-LOG.md) adds what a player is shown about a game — how long it has been played, how many times the hero has
 * fallen, how many enemies they have beaten, which rooms they have been in — and WHEN it was saved. None of it is read by the rules of the
 * game: it is the profile's, counted from the simulation's own events and never invented.
 */
export const PROGRESS_VERSION = 2;

/** A room and one of its entries (a spawn point). */
export interface Place {
  room: string;
  entry: string;
}

/** What the game COUNTED while it was played (the profile reads it; no rule of the game does). */
export interface PlayStatsData {
  /** Simulation ticks the hero has lived, 60 to the second: the time spent IN the world (not paused, not loading, not on a menu), not the time the page was open. */
  ticks: number;
  /** Times the hero has fallen. */
  deaths: number;
  /** Enemies beaten (bosses included: each one that fell). */
  kills: number;
  /** The rooms the hero has been in, once each (sorted). */
  rooms: string[];
}

export interface ProgressData {
  saveVersion: number;
  /** Where the game picks up: the room the hero last came into (or rested in) and the entry they came in by. */
  at: Place;
  /** Where the hero comes back after a defeat: the last place they rested at (the start of the world until then). */
  checkpoint: Place;
  /** The world's memory: defeated guardians, opened doors, pickups taken, the boss. Never the volatile ones (`~…`, a door that closed for a fight). */
  flags: string[];
  /** The abilities the hero owns. */
  abilities: string[];
  /** The cards the hero owns, and the equipped one. */
  cards: { owned: string[]; equipped: string | null };
  /** How many bottle slots the hero has (3 at the start, 4 with the fourth bottle). */
  bottleSlots: number;
  stats: PlayStatsData;
  /** When it was last written, in milliseconds since 1970 as the PLATFORM's clock said (0: not known — a save from before there was one). It says nothing about the hero's progress. */
  savedAt: number;
}

/**
 * The limits a save is held to: a hand-edited or damaged value cannot ask for a million flags or a name the size of a book. They are sized for a WORLD, not for a slice: a campaign of some eighty
 * rooms keeps a flag per defeated guardian, per pickup, per opened door and per broken wall (a few hundred), and the rooms the hero has been in are one name each. A cap below what a full game
 * writes would cut the progress of a finished game silently on the next save, so these sit at several times what the content needs (the test of the world checks that, `tests/unit/content/world.test.ts`).
 */
export const PROGRESS_LIMITS = {
  name: 64,
  flags: 1024,
  abilities: 64,
  cards: 32,
  bottleSlots: 8,
  rooms: 256,
  /** Deaths and kills: a count a person could never reach, so a number past it is a damaged one. */
  counter: 1_000_000_000,
  /** About 9 900 hours of play. */
  ticks: 2_147_483_647,
  /** The largest instant a JavaScript `Date` can hold. */
  savedAt: 8_640_000_000_000_000,
} as const;

/** What the game starts from: a new game, at `start`, with the abilities it starts with and the bottle slots it begins with. */
export function newProgress(start: Place, abilities: readonly string[] = [], bottleSlots = 3): ProgressData {
  return repairProgress({
    saveVersion: PROGRESS_VERSION,
    at: start,
    checkpoint: start,
    flags: [],
    abilities,
    cards: { owned: [], equipped: null },
    bottleSlots,
    stats: { ticks: 0, deaths: 0, kills: 0, rooms: [start.room] },
    savedAt: 0,
  });
}

/** An id: letters, digits and `_ . : -`, at most 64 of them. A flag that begins with `~` is volatile and is never saved. */
const NAME = /^[A-Za-z0-9_.:-]{1,64}$/;

function names(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const v of value) if (typeof v === 'string' && NAME.test(v)) seen.add(v);
  return [...seen].sort().slice(0, max);
}

/** A whole number from 0 to `max`; anything else (a string, NaN, infinity) is 0. */
function counter(value: unknown, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
}

function stats(value: unknown): PlayStatsData {
  const r = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    ticks: counter(r['ticks'], PROGRESS_LIMITS.ticks),
    deaths: counter(r['deaths'], PROGRESS_LIMITS.counter),
    kills: counter(r['kills'], PROGRESS_LIMITS.counter),
    rooms: names(r['rooms'], PROGRESS_LIMITS.rooms),
  };
}

function place(value: unknown, fallback: Place): Place {
  if (typeof value !== 'object' || value === null) return fallback;
  const r = value as Record<string, unknown>;
  return typeof r['room'] === 'string' && NAME.test(r['room']) && typeof r['entry'] === 'string' && NAME.test(r['entry']) ? { room: r['room'], entry: r['entry'] } : fallback;
}

/**
 * Makes ANY value into valid progress of the current version: wrong types fall back to the default of that field, lists are
 * cleaned (only valid names, no repeats, sorted, capped), numbers are clamped, unknown keys are dropped. Used on what was read AND on
 * what is about to be written, so a bad value never gets either way. A place that is not valid falls back to the other one, and to
 * the empty place (which the session turns into the start of the world) when neither is.
 */
export function repairProgress(raw: unknown): ProgressData {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const none: Place = { room: '', entry: '' };
  const at = place(r['at'], place(r['checkpoint'], none));
  const checkpoint = place(r['checkpoint'], at);
  const c = typeof r['cards'] === 'object' && r['cards'] !== null ? (r['cards'] as Record<string, unknown>) : {};
  const owned = names(c['owned'], PROGRESS_LIMITS.cards);
  const equipped = typeof c['equipped'] === 'string' && owned.includes(c['equipped']) ? c['equipped'] : null;
  const slots = typeof r['bottleSlots'] === 'number' && Number.isFinite(r['bottleSlots']) ? Math.floor(r['bottleSlots']) : 3;
  return {
    saveVersion: PROGRESS_VERSION,
    at,
    checkpoint,
    flags: names(r['flags'], PROGRESS_LIMITS.flags),
    abilities: names(r['abilities'], PROGRESS_LIMITS.abilities),
    cards: { owned, equipped },
    bottleSlots: Math.min(PROGRESS_LIMITS.bottleSlots, Math.max(0, slots)),
    stats: stats(r['stats']),
    savedAt: counter(r['savedAt'], PROGRESS_LIMITS.savedAt),
  };
}

/** One step of the migration chain: a value of version `v` in, a value of version `v + 1` out. Pure. */
export type ProgressMigration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * The migrations, by the version they upgrade FROM. Each one gets a golden file in the tests.
 *  - 1 → 2 (docs/PROMPT14-LOG.md): the counts and the time of the last write arrive. A version-1 save knows none of them, so they start at nothing — the one thing it does
 *    know is two rooms the hero has been in (where they were and where they rest), and those are the ones counted as visited.
 */
export const PROGRESS_MIGRATIONS: Readonly<Record<number, ProgressMigration>> = {
  1: (data) => {
    const room = (v: unknown): string[] => (typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>)['room'] === 'string' ? [(v as Record<string, string>)['room'] as string] : []);
    return { ...data, saveVersion: 2, stats: { ticks: 0, deaths: 0, kills: 0, rooms: [...room(data['at']), ...room(data['checkpoint'])] }, savedAt: 0 };
  },
};

/**
 * Reads what was stored: JSON → migrated to the current version → repaired. `null` when it cannot be trusted at all: not JSON, not an
 * object, no integer version, or a version NEWER than this build knows (it belongs to a later game: it is kept aside, never
 * overwritten silently).
 */
export function parseProgress(text: string, migrations: Readonly<Record<number, ProgressMigration>> = PROGRESS_MIGRATIONS, current = PROGRESS_VERSION): ProgressData | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  let data = value as Record<string, unknown>;
  let version = data['saveVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > current) return null;
  while (version < current) {
    const step = migrations[version];
    if (!step) return null; // a hole in the chain: nothing safe to do
    data = step(data);
    version++;
  }
  return repairProgress(data);
}

export function serializeProgress(data: Readonly<ProgressData>): string {
  return JSON.stringify(repairProgress(data));
}
