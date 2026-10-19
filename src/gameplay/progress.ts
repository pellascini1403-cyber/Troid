import { PROGRESS_VERSION, repairProgress, type PlayStatsData, type Place, type ProgressData } from '@/save/ProgressData';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { GameSession, SessionOptions } from './GameSession';

/**
 * Between the session and the saved progress (docs/PROMPT6-LOG.md S24): two pure functions, one each way. The session knows nothing
 * of storage and the save knows nothing of the session; this is the only place that knows both shapes.
 */

/** Flags that begin with `~` are volatile — a door that closed for a fight — and are never part of a save. */
export const VOLATILE_FLAG_PREFIX = '~';

/** What the platform adds to a save: what was counted while playing and when it was written (neither is the simulation's to know). */
export interface CaptureExtras {
  /** The counts; without them, nothing has been counted (the game being played passes what `PlayStats` counted). */
  stats?: PlayStatsData;
  /** The platform's clock, in milliseconds since 1970 (0: not known). */
  savedAt?: number;
}

/**
 * What a game saved right now would contain. While the hero is going down (the defeat screen) the game picks up where a defeat brings them — the checkpoint — not in the room they fell in:
 * leaving at that moment must not be a way to come back at the door of the place that beat them.
 */
export function captureProgress(session: GameSession, extras: CaptureExtras = {}): ProgressData {
  return repairProgress({
    saveVersion: PROGRESS_VERSION,
    at: session.deathSnapshot.phase === 'none' ? session.arrival : session.checkpoint,
    checkpoint: session.checkpoint,
    flags: session.flags.list().filter((f) => !f.startsWith(VOLATILE_FLAG_PREFIX)),
    abilities: session.abilities.serialize(),
    cards: session.loadout.serialize(),
    bottleSlots: session.bottles.slots.length,
    stats: extras.stats ?? { ticks: 0, deaths: 0, kills: 0, rooms: [session.room.id] },
    savedAt: extras.savedAt ?? 0,
  });
}

/** What the session is begun with to continue a saved game, on top of the options of a new one. */
export interface Restored {
  startRoom: string;
  startEntry: string;
  checkpoint: Place;
  flags: string[];
  unlocked: string[];
  restore: NonNullable<SessionOptions['restore']>;
  /** What the save had counted: the time played, the defeats, the enemies beaten and the rooms visited so far. */
  stats: PlayStatsData;
}

const has = (rooms: Readonly<Record<string, RoomDefinition>>, p: Place): boolean => rooms[p.room]?.entries.some((e) => e.id === p.entry) ?? false;

/**
 * The options that continue a saved game. A place the game does not have (a save from a world that changed, or a damaged one) is
 * never trusted: the hero is put at the last checkpoint instead, and if that is gone too, at `start`. So whatever was saved, the game
 * begins somewhere valid — with the flags, abilities, cards and bottles it did have.
 */
export function restoreFromProgress(progress: Readonly<ProgressData>, rooms: Readonly<Record<string, RoomDefinition>>, start: Place): Restored {
  const checkpoint = has(rooms, progress.checkpoint) ? progress.checkpoint : start;
  const at = has(rooms, progress.at) ? progress.at : checkpoint;
  return {
    startRoom: at.room,
    startEntry: at.entry,
    checkpoint: { ...checkpoint },
    flags: [...progress.flags],
    unlocked: [...progress.abilities],
    restore: { cards: { owned: [...progress.cards.owned], equipped: progress.cards.equipped }, bottleSlots: progress.bottleSlots },
    stats: { ...progress.stats, rooms: [...progress.stats.rooms] },
  };
}
