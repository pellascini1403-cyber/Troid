import { ROOMS } from '@/content';
import { parseProgress, serializeProgress } from '@/save/ProgressData';
import { isSlot } from '@/save/SaveSlots';
import { AUTOSAVE, type GameSavesOptions, type ImportResult, type SlotCard } from './gameSaves';

/**
 * What the MENU does with the saved games (docs/PROMPT14-LOG.md): a chunk of its own, fetched the first time the menu asks (`GameSaves.actions()`).
 *
 * Leaving for another game, starting one over, deleting the one being played and importing into it all END the page's own game: the recorder is stopped FIRST (`leave`), so nothing the game does on
 * its way out can write itself back over what was just chosen, and then the page is opened again on the slot the settings name. A start over or a delete asked for by name is the one way a good game
 * is lost; an unreadable one is never thrown away by anything but a delete (a start over keeps it aside).
 */
export class SaveActions {
  constructor(
    private readonly o: GameSavesOptions,
    /** Ends the game being played: saved as it stands first (when it is being left), and then it writes nothing more. */
    private readonly leave: (saveFirst: boolean) => Promise<void>,
    /** Tells the player a choice could not be kept, and answers `false`. */
    private readonly failed: () => boolean,
  ) {}

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
    }));
  }

  /** Plays `slot`: this game is saved as it stands, the choice is kept in the settings and the page opens on it. Resolves to false (nothing changed) if the choice could not be kept. */
  async switchTo(slot: number): Promise<boolean> {
    if (!isSlot(slot)) return false;
    if (slot === this.o.slot) return true;
    if (!(await this.o.settings.update({ slot }))) return this.failed();
    await this.leave(true);
    this.o.platform.reload();
    return true;
  }

  /**
   * A new game in `slot` (the caller has asked the player if there is a game there): what was saved goes — a copy that could not be read is kept aside — and the page opens on it. Resolves to
   * false (nothing destroyed) if the choice could not be kept. The game being left for another slot is saved as it stands; the one being replaced is not (it is going).
   */
  async startOver(slot: number): Promise<boolean> {
    if (!isSlot(slot)) return false;
    if (slot !== this.o.slot && !(await this.o.settings.update({ slot }))) return this.failed();
    await this.leave(slot !== this.o.slot); // before anything is removed: the game on its way out must not write itself back
    const ok = await this.o.slots.restart(slot);
    this.o.platform.reload();
    return ok;
  }

  /** Deletes `slot` and every copy of it. The one being played is deleted too: the page opens on a new game in it. */
  async erase(slot: number): Promise<boolean> {
    if (!isSlot(slot)) return false;
    if (slot === this.o.slot) {
      await this.leave(false);
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
    if (slot === this.o.slot) await this.leave(false);
    const ok = await this.o.slots.store(slot).save(data);
    if (!ok) return { ok: false, reason: 'storage' };
    if (slot === this.o.slot) this.o.platform.reload();
    return { ok: true };
  }
}
