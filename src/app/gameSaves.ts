import type { GameSession } from '@/gameplay/GameSession';
import type { PlayStats } from '@/gameplay/PlayStats';
import type { Inspection } from '@/save/SafeStore';
import type { SaveSlots, SlotState } from '@/save/SaveSlots';
import type { SettingsStore } from '@/save/SettingsStore';
import { attachProgressRecorder, type ProgressRecorder, type SaveReport } from './progressRecorder';
import type { SaveActions } from './saveActions';

/**
 * What the player is told about their saved game, in one word each (the interface turns it into a short, discreet line): it was `saved`; it did NOT reach the storage (`failed`); the game that was
 * loaded had to be recovered from its last good copy (`recovered`) or could not be read at all and a new one began, the unreadable one kept (`damaged`); or the browser keeps nothing at all, so
 * the progress will not survive the page (`unavailable`).
 */
export type SaveNoticeKind = 'saved' | 'failed' | 'recovered' | 'damaged' | 'unavailable';

export interface SaveNotice {
  kind: SaveNoticeKind;
  slot: number;
}

/** What the saves need of the page, so the page can be a fake: the clock, a reload, "the page is being left" and a repeating timer. */
export interface SavePlatform {
  now(): number;
  /** Opens the game again (the page is reloaded without `?new=1`, which would erase the game it is about to open). */
  reload(): void;
  /** `cb` runs when the page is hidden, closed or sent to the background. Returns what stops it. */
  onLeave(cb: () => void): () => void;
  /** `cb` runs every `ms` milliseconds. Returns what stops it. */
  every(ms: number, cb: () => void): () => void;
}

export function browserPlatform(where: Pick<Location, 'href' | 'replace'> = location): SavePlatform {
  return {
    now: () => Date.now(),
    reload() {
      const url = new URL(where.href);
      url.searchParams.delete('new');
      where.replace(url.toString());
    },
    onLeave(cb) {
      const hidden = (): void => {
        if (document.hidden) cb();
      };
      window.addEventListener('pagehide', cb);
      document.addEventListener('visibilitychange', hidden);
      return () => {
        window.removeEventListener('pagehide', cb);
        document.removeEventListener('visibilitychange', hidden);
      };
    },
    every(ms, cb) {
      const id = window.setInterval(cb, ms);
      return () => window.clearInterval(id);
    },
  };
}

/** What the saves screen shows of one slot. */
export interface SlotCard {
  slot: number;
  state: SlotState;
  /** This is the game being played. */
  active: boolean;
  /** Text key of the zone the game picks up in. */
  zoneKey: string | null;
  /** Simulation ticks lived (60 to the second). */
  ticks: number;
  /** When it was last written (milliseconds since 1970; 0: not known). */
  savedAt: number;
}

/** A quiet save is made when the hero has played this long since the last one (30 seconds of simulation), checked this often. */
export const AUTOSAVE = { everyMs: 20_000, afterTicks: 1800, failedNoticeMs: 30_000, importMaxBytes: 65_536 } as const;

export type ImportResult = { ok: true } | { ok: false; reason: 'unreadable' | 'tooBig' | 'storage' };

export interface GameSavesOptions {
  slots: SaveSlots;
  settings: SettingsStore;
  /** The slot being played. */
  slot: number;
  stats: PlayStats;
  /** False when the browser offers no storage (the saves live in memory and die with the page). */
  durable: boolean;
  platform: SavePlatform;
  notify: (notice: SaveNotice) => void;
}

/**
 * The saved games of the page (docs/PROMPT14-LOG.md): the one place that knows how a game is saved. The simulation knows nothing of it and the menu only asks.
 *
 *  - While a game is played it is saved when something of its PROGRESS changes (the recorder), and quietly when the hero has played a while since the last write and when the page is hidden or
 *    closed — the one moment a game would otherwise lose its last stretch.
 *  - What only the menu does — leaving for another game, starting one over, deleting, taking a game out of the browser and putting one in — is `SaveActions`, a chunk of its own (`actions()`): the
 *    cold start carries only what saves the game as it is played.
 *
 * Nothing here is a promise about the storage: a browser may clear a site's data, a device may be lost. The player is told so (the saves screen), and can take a copy out.
 */
export class GameSaves {
  readonly slot: number;
  private recorder: ProgressRecorder | null = null;
  private readonly off: Array<() => void> = [];
  private lastFailedNotice = Number.NEGATIVE_INFINITY;
  private loaded: Promise<SaveActions> | null = null;

  constructor(private readonly o: GameSavesOptions) {
    this.slot = o.slot;
  }

  /** Begins saving `session`. */
  attach(session: GameSession): void {
    const { platform } = this.o;
    this.recorder = attachProgressRecorder(session, this.o.slots.store(this.slot), {
      stats: this.o.stats,
      now: () => platform.now(),
      onSaved: (r) => this.report(r),
    });
    this.off.push(
      platform.onLeave(() => this.recorder?.saveIfPlayed(1, 'leaving')),
      platform.every(AUTOSAVE.everyMs, () => this.recorder?.saveIfPlayed(AUTOSAVE.afterTicks, 'interval')),
    );
  }

  get stopped(): boolean {
    return this.recorder?.stopped ?? true;
  }

  /** Does what is saved outlive the page? (`false`: the browser offers no storage and the games live in memory.) */
  get durable(): boolean {
    return this.o.durable;
  }

  /** Tells the player what the start found, once: a game recovered from its last good copy, one that could not be read, or no storage at all. */
  announceStart(found: Inspection<unknown>): void {
    if (!this.o.durable) this.o.notify({ kind: 'unavailable', slot: this.slot });
    else if (found.state === 'damaged') this.o.notify({ kind: 'damaged', slot: this.slot });
    else if (found.state === 'ok' && found.recovered) this.o.notify({ kind: 'recovered', slot: this.slot });
  }

  /** The player asked to save now. Resolves to whether it reached the storage — a browser that keeps nothing never did, whatever its memory store took. */
  saveNow(): Promise<boolean> {
    if (!this.o.durable) return Promise.resolve(false);
    return this.recorder?.saveNow('manual') ?? Promise.resolve(false);
  }

  /** What the menu does with the saved games (leave for another, start over, delete, export, import): fetched the first time it is asked for. */
  actions(): Promise<SaveActions> {
    this.loaded ??= import('./saveActions').then(
      ({ SaveActions: Actions }) => new Actions(this.o, (saveFirst) => this.leave(saveFirst), () => this.failed()),
      (err: unknown) => {
        this.loaded = null; // a failed fetch is forgotten: the next ask tries again
        throw err;
      },
    );
    return this.loaded;
  }

  /** The game that is being played ends here: saved as it stands first (when it is being LEFT, not when it is being destroyed), and then it writes nothing more — whatever it does on its way out cannot write itself back. */
  async leave(saveFirst: boolean): Promise<void> {
    if (saveFirst) await this.recorder?.saveNow('leaving');
    this.recorder?.stop();
  }

  dispose(): void {
    this.recorder?.stop();
    for (const f of this.off.splice(0)) f();
  }

  // ----------------------------------------------------------------------------------------------- internals

  /** A save ended: the player is told it did, quietly, when it was about their progress; and that it did NOT, but not more than once in a while. */
  private report(r: SaveReport): void {
    const { notify } = this.o;
    if (!r.ok) {
      if (r.at - this.lastFailedNotice >= AUTOSAVE.failedNoticeMs) {
        this.lastFailedNotice = r.at;
        notify({ kind: 'failed', slot: this.slot });
      }
      return;
    }
    // a "saved" that only lives in memory would be a lie
    if (!this.o.durable) return;
    if (r.reason === 'progress' || r.reason === 'rest' || r.reason === 'manual') notify({ kind: 'saved', slot: this.slot });
  }

  private failed(): boolean {
    this.o.notify({ kind: 'failed', slot: this.slot });
    return false;
  }
}
