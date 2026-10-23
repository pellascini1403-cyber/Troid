import { ROOMS } from '@/content';
import { COMPLETED_FLAG } from '@/progression/adventure';
import { parseProgress, serializeProgress } from '@/save/ProgressData';
import { isSlot } from '@/save/SaveSlots';
import { AUTOSAVE, type GameSavesOptions, type ImportResult, type SlotCard } from './gameSaves';

/**
 * What the MENU does with the saved games (docs/PROMPT14-LOG.md): a chunk of its own, fetched the first time the menu asks (`GameSaves.actions()`).
 *
 * Leaving for another game, starting one over, deleting the one being played and importing into it all END the page's own game: it is `stop`ped FIRST, so nothing the game does on its way out can write
 * itself back over what was just chosen, and then the page is opened again on the slot the settings name. A game that is being LEFT is saved as it stands before anything else is touched
 * (`saveForLeaving`): if that does not reach the storage nothing has been changed yet, so there is nothing to take back and the game goes on. A start over or a delete asked for by name is the one way a
 * good game is lost; an unreadable one is never thrown away by anything but a delete (a start over keeps it aside).
 */
export interface SaveActionsHost {
  /** The game being played is saved as it stands because it is about to be left (it goes on writing until `stop`). Resolves to whether nothing is lost: `false` — it could not be saved, so it must not be left. */
  saveForLeaving(): Promise<boolean>;
  /** The game being played writes nothing more. */
  stop(): void;
  /** The game's own writes wait while the page writes into its slot (`release` lets them go on). */
  hold(): void;
  release(): void;
  /** Tells the player a choice could not be kept, and answers `false`. */
  failed(): boolean;
}

export class SaveActions {
  constructor(
    private readonly o: GameSavesOptions,
    private readonly host: SaveActionsHost,
  ) {}

  /** Keeps `slot` as the game to open next. A choice that does not reach the storage is not kept in memory either: a later change of ANOTHER setting would write it, and the page would open on a game nobody chose. */
  private async chooseSlot(slot: number): Promise<boolean> {
    if (await this.o.settings.update({ slot })) return true;
    await this.o.settings.update({ slot: this.o.slot });
    return false;
  }

  /** Every slot as the screen shows it (looked at without changing anything). */
  async cards(): Promise<SlotCard[]> {
    const list = await this.o.slots.summaries();
    return list.map((s) => ({
      slot: s.slot,
      state: s.state,
      active: s.slot === this.o.slot,
      zoneKey: s.progress ? (ROOMS[s.progress.at.room]?.nameKey ?? null) : null,
      ticks: s.progress?.stats.ticks ?? 0,
      savedAt: s.progress?.savedAt ?? 0,
      completed: s.progress?.flags.includes(COMPLETED_FLAG) ?? false,
    }));
  }

  /** Plays `slot`: this game is saved as it stands, the choice is kept in the settings and the page opens on it. Resolves to false (nothing changed) if either could not be kept. */
  async switchTo(slot: number): Promise<boolean> {
    if (!isSlot(slot)) return false;
    if (slot === this.o.slot) return true;
    // a browser that keeps nothing cannot keep the choice either: the page would open on an empty game and this one would be lost with it
    if (!this.o.durable) return this.host.failed();
    // this game first: if it cannot be saved it is not left, and nothing has been chosen yet. (The menu is open, so the world is held: nothing can be won between this save and the stop below.)
    if (!(await this.host.saveForLeaving())) return this.host.failed();
    if (!(await this.chooseSlot(slot))) return this.host.failed();
    this.host.stop();
    this.o.platform.reload();
    return true;
  }

  /**
   * A new game in `slot` (the caller has asked the player if there is a game there): what was saved goes — a copy that could not be read is kept aside — and the page opens on it. Resolves to
   * false (nothing destroyed) if the choice could not be kept. The game being left for another slot is saved as it stands; the one being replaced is not (it is going).
   */
  async startOver(slot: number): Promise<boolean> {
    if (!isSlot(slot)) return false;
    if (slot !== this.o.slot) {
      if (!this.o.durable) return this.host.failed();
      // before anything is removed: the game being left is saved (if it cannot be, it is not left and the other slot is not touched), and the choice is kept
      if (!(await this.host.saveForLeaving())) return this.host.failed();
      if (!(await this.chooseSlot(slot))) return this.host.failed();
    }
    this.host.stop(); // the game on its way out must not write itself back
    const ok = await this.o.slots.restart(slot);
    this.o.platform.reload();
    return ok;
  }

  /** Deletes `slot` and every copy of it. The one being played is deleted too: the page opens on a new game in it. */
  async erase(slot: number): Promise<boolean> {
    if (!isSlot(slot)) return false;
    if (slot === this.o.slot) {
      this.host.stop();
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
    const playing = slot === this.o.slot;
    // the game being played must not write itself over the copy, so its writes wait while this one goes in — and if it does not go in, the game goes on as if nothing had happened
    if (playing) this.host.hold();
    let ok = false;
    try {
      ok = await this.o.slots.store(slot).save(data);
    } finally {
      if (!ok && playing) this.host.release();
    }
    if (!ok) return { ok: false, reason: 'storage' };
    if (playing) {
      this.host.stop();
      this.o.platform.reload();
    }
    return { ok: true };
  }
}
