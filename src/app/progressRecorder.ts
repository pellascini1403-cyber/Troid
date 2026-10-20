import type { GameSession } from '@/gameplay/GameSession';
import type { PlayStats } from '@/gameplay/PlayStats';
import { captureProgress } from '@/gameplay/progress';
import type { ProgressStore } from '@/save/ProgressStore';
import type { GuardedResult } from '@/save/SafeStore';

/**
 * Why a save was made: something of the hero's PROGRESS changed (a flag, a card, an ability, a bottle, a room), the hero RESTED at a checkpoint, a stretch of play went by with nothing
 * else to record (`interval`), the page is being LEFT (`leaving`: hidden, closed, put in the background) or the player asked for it (`manual`).
 */
export type SaveReason = 'progress' | 'rest' | 'interval' | 'leaving' | 'manual';

/** How a save ended: whether the progress reached the storage, why it was written and when. */
export interface SaveReport {
  ok: boolean;
  reason: SaveReason;
  /** The platform's clock when it was written (milliseconds since 1970). */
  at: number;
  /** It was NOT written because the game in the storage is newer than anything this page knows of (another tab saved it): this page has stopped saving. */
  conflict?: true;
}

export interface RecorderOptions {
  /** What is being counted (the time played, the defeats, the enemies beaten, the rooms visited): it goes into every save. */
  stats?: PlayStats;
  /** The platform's clock, stamped on every save (the simulation has none, and must not). */
  now?: () => number;
  /** A save ended. The interface answers it (a discreet "saved", or the warning that it did not reach the storage). */
  onSaved?: (report: SaveReport) => void;
  /**
   * When the game this page loaded was saved (its `savedAt`; 0 for a new game). The storage is shared by every page of the game: a save is refused — and this page stops saving — if what is stored was
   * written after that and after this page's own last write, because it is another page's progress and writing over it would lose it. Not given: nothing is guarded.
   */
  knownSavedAt?: number;
}

export interface ProgressRecorder {
  /** Saves what the game is now, after the writes already asked for. Resolves to whether it reached the storage (false once the recorder is stopped: it writes nothing). */
  saveNow(reason: SaveReason): Promise<boolean>;
  /** Saves only if the hero has PLAYED at least `ticks` simulation ticks since the last write: the quiet saves (an interval, leaving the page) cost nothing while nothing happens. */
  saveIfPlayed(ticks: number, reason: 'interval' | 'leaving'): void;
  /** Simulation ticks lived since the last write. */
  readonly unsavedTicks: number;
  /** Nothing is saved from now on (a game that is being left for another saved game must not write itself back over it). */
  stop(): void;
  readonly stopped: boolean;
  /**
   * Nothing is written for a while, and nothing is forgotten: what the game wins meanwhile is saved when `resume` comes. It is for a write the page makes ITSELF into this game's slot (an imported copy), which the
   * game's own writes must not land after; if that write fails the game goes on as if nothing had happened.
   */
  suspend(): void;
  resume(): void;
  /** This page stopped saving because another page saved the game after it: what is stored is the other one's, and was not written over. */
  readonly conflicted: boolean;
}

/**
 * Saves the progress when something that belongs to it changes (docs/PROMPT6-LOG.md S24): a flag, a card, an ability, a new bottle slot,
 * a room entered, a rest, a defeat that brought the hero back somewhere else (where a game saved now picks up). Changes come in bursts (taking a card sets a flag, equips it and teaches an ability in the same tick), so it
 * saves ONCE per burst, right after the tick that made them. The store skips a write that changes nothing and never lets a failed one
 * damage the last good copy, so calling it often is safe.
 *
 * What it writes is always the state of a finished tick (the events are raised inside one, the write is made after it ends): never a half-built room, never the middle of a step. The platform
 * adds two things the simulation does not know — the clock and the counts (`PlayStats`) — and the page asks for the quiet saves (`interval`, `leaving`) itself.
 */
export function attachProgressRecorder(session: GameSession, store: ProgressStore, options: RecorderOptions = {}): ProgressRecorder {
  const now = options.now ?? (() => 0);
  let pending: 'progress' | 'rest' | null = null;
  let closed = false;
  let conflicted = false;
  let suspended = false;
  /** Something that asks for a save happened while suspended: it is saved when the recorder resumes. */
  let missed = false;
  /** The ticks that count as saved are the ones of the latest write that LANDED: a write the storage refused leaves the quiet saves (the interval, leaving the page) owed. */
  let savedAtTick = session.now;
  /** …and the latest one ASKED FOR: a quiet save does not ask for the same ticks twice while the first is still on its way (a page being left raises several events at once). A refusal withdraws the claim. */
  let issuedTick = session.now;
  /** How many writes are on their way: the claim is only withdrawn when the last of them has been refused (an earlier refusal must not wipe the claim of one that is still on its way). */
  let inFlight = 0;
  /** The latest save this page knows of: the one it loaded, or the last it wrote. A stored game saved after it is somebody else's. */
  let known = options.knownSavedAt;
  /** The moments of this page's own writes that are still on their way: a later write finds one of them stored — it is its own, not another tab's — even before the page has heard that it landed. */
  const mine = new Set<number>();
  const owns = (savedAt: number): boolean => known === undefined || savedAt <= known || mine.has(savedAt);

  const write = async (reason: SaveReason): Promise<boolean> => {
    if (closed) return false;
    if (suspended) {
      missed = true;
      return false;
    }
    const tick = session.now;
    const at = now();
    inFlight++;
    issuedTick = Math.max(issuedTick, tick);
    if (known !== undefined) mine.add(at);
    let result: GuardedResult;
    try {
      const data = captureProgress(session, { ...(options.stats ? { stats: options.stats.snapshot(session.now) } : {}), savedAt: at });
      result = known === undefined ? ((await store.save(data)) ? 'written' : 'failed') : await store.saveGuarded(data, owns);
    } catch {
      result = 'failed'; // (the stores never reject; if one ever did, it is a refusal like any other — the game does not go down with it)
    }
    mine.delete(at);
    inFlight--;
    if (result === 'conflict') {
      // somebody else saved this game since: what is stored is theirs, and this page does not write over it, now or later
      conflicted = true;
      stop();
      options.onSaved?.({ ok: false, reason, at, conflict: true });
      return false;
    }
    if (known !== undefined) known = Math.max(known, at); // (an attempt counts too: a write that reached the storage but did not read back is still this page's)
    const ok = result === 'written';
    // the ticks played count as saved only once the write has landed: after a refused one the quiet saves (the interval, leaving the page) are still owed
    if (ok) savedAtTick = Math.max(savedAtTick, tick);
    else if (inFlight === 0) issuedTick = savedAtTick;
    options.onSaved?.({ ok, reason, at });
    return ok;
  };
  const dirty = (reason: 'progress' | 'rest'): void => {
    if (closed) return;
    if (suspended) {
      missed = true;
      return;
    }
    if (pending !== null) {
      if (reason === 'rest') pending = 'rest'; // a rest in the burst is what the player is told about
      return;
    }
    pending = reason;
    queueMicrotask(() => {
      const why = pending;
      pending = null;
      if (!closed && why !== null) void write(why);
    });
  };

  const bus = session.bus;
  const off = [
    bus.on('flag:set', () => dirty('progress')),
    bus.on('flag:cleared', () => dirty('progress')),
    bus.on('card:changed', () => dirty('progress')),
    bus.on('ability:unlocked', () => dirty('progress')),
    bus.on('bottle:changed', (e) => e.type === 'added' && dirty('progress')),
    bus.on('room:entered', () => dirty('progress')),
    bus.on('checkpoint:set', () => dirty('rest')),
    bus.on('death:respawned', () => dirty('progress')),
  ];
  function stop(): void {
    closed = true;
    for (const f of off) f();
  }
  return {
    saveNow: write,
    saveIfPlayed(ticks, reason) {
      if (closed || session.now - Math.max(savedAtTick, issuedTick) < Math.max(1, ticks)) return;
      if (suspended) missed = true; // a page that is hidden while an import is being written still owes this stretch: it is saved the moment the writes are let go
      else void write(reason);
    },
    suspend() {
      suspended = true;
    },
    resume() {
      if (!suspended) return;
      suspended = false;
      if (missed && !closed) {
        missed = false;
        dirty('progress');
      }
    },
    get unsavedTicks() {
      return session.now - savedAtTick;
    },
    stop,
    get stopped() {
      return closed;
    },
    get conflicted() {
      return conflicted;
    },
  };
}
