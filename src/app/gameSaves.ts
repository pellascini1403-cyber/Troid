import { ROOMS } from '@/content';
import type { GameSession } from '@/gameplay/GameSession';
import type { PlayStats } from '@/gameplay/PlayStats';
import { parseProgress, serializeProgress } from '@/save/ProgressData';
import type { Inspection } from '@/save/SafeStore';
import { isSlot, type SaveSlots, type SlotState } from '@/save/SaveSlots';
import type { SettingsStore } from '@/save/SettingsStore';
import { attachProgressRecorder, type ProgressRecorder, type SaveReport } from './progressRecorder';

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
 * The saved games of the page (docs/PROMPT14-LOG.md): the one place that knows how a game is saved, left for another and started over. The simulation knows nothing of it and the menu only asks.
 *
 *  - While a game is played it is saved when something of its PROGRESS changes (the recorder), and quietly when the hero has played a while since the last write and when the page is hidden or
 *    closed — the one moment a game would otherwise lose its last stretch.
 *  - Leaving for another game, starting one over, deleting the one being played and importing into it all END the page's own game: the recorder is stopped FIRST, so nothing the game does on its
 *    way out can write itself back over what was just chosen, and then the page is opened again on the slot the settings name.
 *  - A start over or a delete asked for by name is the one way a good game is lost; an unreadable one is never thrown away by anything but a delete (a start over keeps it aside).
 *
 * Nothing here is a promise about the storage: a browser may clear a site's data, a device may be lost. The player is told so (the saves screen), and can take a copy out (`exportSlot`).
 */
export class GameSaves {
  readonly slot: number;
  private recorder: ProgressRecorder | null = null;
  private readonly off: Array<() => void> = [];
  private lastFailedNotice = Number.NEGATIVE_INFINITY;

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

  /** Tells the player what the start found, once: a game recovered from its last good copy, one that could not be read, or no storage at all. */
  announceStart(found: Inspection<unknown>): void {
    if (!this.o.durable) this.o.notify({ kind: 'unavailable', slot: this.slot });
    else if (found.state === 'damaged') this.o.notify({ kind: 'damaged', slot: this.slot });
    else if (found.state === 'ok' && found.recovered) this.o.notify({ kind: 'recovered', slot: this.slot });
  }

  /** The player asked to save now. Resolves to whether it reached the storage. */
  saveNow(): Promise<boolean> {
    return this.recorder?.saveNow('manual') ?? Promise.resolve(false);
  }

  /** Every slot as the screen shows it (looked at without changing anything). */
  async cards(): Promise<SlotCard[]> {
    const list = await this.o.slots.summaries();
    return list.map((s) => ({
      slot: s.slot,
      state: s.state,
      active: s.slot === this.slot,
      zoneKey: s.progress ? (ROOMS[s.progress.at.room]?.nameKey ?? null) : null,
      ticks: s.progress?.stats.ticks ?? 0,
      savedAt: s.progress?.savedAt ?? 0,
    }));
  }

  /** Plays `slot`: this game is saved as it stands, the choice is kept in the settings and the page opens on it. Resolves to false (nothing changed) if the choice could not be kept. */
  async switchTo(slot: number): Promise<boolean> {
    if (!isSlot(slot)) return false;
    if (slot === this.slot) return true;
    if (!(await this.o.settings.update({ slot }))) return this.failed();
    await this.recorder?.saveNow('leaving');
    this.recorder?.stop();
    this.o.platform.reload();
    return true;
  }

  /**
   * A new game in `slot` (the caller has asked the player if there is a game there): what was saved goes — a copy that could not be read is kept aside — and the page opens on it. Resolves to
   * false (nothing destroyed) if the choice could not be kept.
   */
  async startOver(slot: number): Promise<boolean> {
    if (!isSlot(slot)) return false;
    if (slot !== this.slot && !(await this.o.settings.update({ slot }))) return this.failed();
    this.recorder?.stop(); // before anything is removed: the game on its way out must not write itself back
    const ok = await this.o.slots.restart(slot);
    this.o.platform.reload();
    return ok;
  }

  /** Deletes `slot` and every copy of it. The one being played is deleted too: the page opens on a new game in it. */
  async erase(slot: number): Promise<boolean> {
    if (!isSlot(slot)) return false;
    if (slot === this.slot) {
      this.recorder?.stop();
      const ok = await this.o.slots.erase(slot);
      this.o.platform.reload();
      return ok;
    }
    return this.o.slots.erase(slot);
  }

  /** The text of the game in `slot`, to keep outside the browser; `null` when there is no readable game there. */
  async exportSlot(slot: number): Promise<{ filename: string; text: string } | null> {
    if (!isSlot(slot)) return null;
    const found = await this.o.slots.store(slot).inspect();
    if (found.state !== 'ok') return null;
    const day = new Date(this.o.platform.now()).toISOString().slice(0, 10);
    return { filename: `troid-partida-${slot}-${day}.json`, text: serializeProgress(found.value) };
  }

  /**
   * Puts a game taken out of the browser into `slot` (the caller has asked the player if there is a game there). Everything in it is treated as damaged or hand-made: it goes through the same reading as
   * any save — the version, the migration, the repairs — and what cannot be read is refused. Importing into the game being played opens the page on it again.
   */
  async importInto(slot: number, text: string): Promise<ImportResult> {
    if (!isSlot(slot)) return { ok: false, reason: 'unreadable' };
    if (text.length > AUTOSAVE.importMaxBytes) return { ok: false, reason: 'tooBig' };
    const data = parseProgress(text);
    if (data === null) return { ok: false, reason: 'unreadable' };
    if (slot === this.slot) this.recorder?.stop();
    const ok = await this.o.slots.store(slot).save(data);
    if (!ok) return { ok: false, reason: 'storage' };
    if (slot === this.slot) this.o.platform.reload();
    return { ok: true };
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
