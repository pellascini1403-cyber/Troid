/**
 * The player's PROGRESS as data (docs/ARCHITECTURE-2D.md §11, docs/PROMPT6-LOG.md S24): where the hero is, where they come back after a
 * defeat, and the world's memory. It is NOT the settings (language, controls): those are another model under another key, so a
 * player who resets one never loses the other. Versioned (`saveVersion`) and repairable, exactly like the settings.
 *
 * The heart of it is the set of world FLAGS (`WorldFlags`): "that guardian is defeated", "this card was taken", "the boss is down" are
 * flags, so a loaded game builds every room the way a respawn does — by reading them. Around it, what the flags cannot say: the
 * abilities, the cards and the bottle slots the hero owns, and the two places (`at` and `checkpoint`).
 */
export const PROGRESS_VERSION = 1;

/** A room and one of its entries (a spawn point). */
export interface Place {
  room: string;
  entry: string;
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
}

/** The limits a save is held to: a hand-edited or damaged value cannot ask for a million flags or a name the size of a book. */
export const PROGRESS_LIMITS = { name: 64, flags: 256, abilities: 64, cards: 16, bottleSlots: 8 } as const;

/** What the game starts from: a new game, at `start`, with the abilities it starts with and the bottle slots it begins with. */
export function newProgress(start: Place, abilities: readonly string[] = [], bottleSlots = 3): ProgressData {
  return repairProgress({ saveVersion: PROGRESS_VERSION, at: start, checkpoint: start, flags: [], abilities, cards: { owned: [], equipped: null }, bottleSlots });
}

/** An id: letters, digits and `_ . : -`, at most 64 of them. A flag that begins with `~` is volatile and is never saved. */
const NAME = /^[A-Za-z0-9_.:-]{1,64}$/;

function names(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const v of value) if (typeof v === 'string' && NAME.test(v)) seen.add(v);
  return [...seen].sort().slice(0, max);
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
  };
}

/** One step of the migration chain: a value of version `v` in, a value of version `v + 1` out. Pure. */
export type ProgressMigration = (data: Record<string, unknown>) => Record<string, unknown>;

/** The migrations, by the version they upgrade FROM. Empty: version 1 is the first. Each one gets a golden file in the tests. */
export const PROGRESS_MIGRATIONS: Readonly<Record<number, ProgressMigration>> = {};

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
