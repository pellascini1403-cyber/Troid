import { PROGRESS_VERSION, repairProgress, type Place, type ProgressData } from '@/save/ProgressData';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { GameSession, SessionOptions } from './GameSession';

/**
 * Between the session and the saved progress (docs/PROMPT6-LOG.md S24): two pure functions, one each way. The session knows nothing
 * of storage and the save knows nothing of the session; this is the only place that knows both shapes.
 */

/** Flags that begin with `~` are volatile — a door that closed for a fight — and are never part of a save. */
export const VOLATILE_FLAG_PREFIX = '~';

/** What a game saved right now would contain. */
export function captureProgress(session: GameSession): ProgressData {
  return repairProgress({
    saveVersion: PROGRESS_VERSION,
    at: session.arrival,
    checkpoint: session.checkpoint,
    flags: session.flags.list().filter((f) => !f.startsWith(VOLATILE_FLAG_PREFIX)),
    abilities: session.abilities.serialize(),
    cards: session.loadout.serialize(),
    bottleSlots: session.bottles.slots.length,
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
  };
}
