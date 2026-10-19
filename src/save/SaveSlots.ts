import type { ProgressData } from './ProgressData';
import { ProgressStore } from './ProgressStore';
import type { StorageAdapter } from './StorageAdapter';

/**
 * The saved games (docs/PROMPT14-LOG.md): a handful of independent places, each one a `ProgressStore` of its own — so each has the `.bak` / `.corrupt` copies, the read-back and the serial
 * queue of every save in the game, and none of them can touch another's. Which one is being played is the SETTINGS' (`slot`): this module only knows how to open them, look at them
 * without changing them, start one over and delete one.
 *
 * Three, on purpose: it is what a screen can show at a glance and a number a player never has to manage. Slot 1 lives under the key the game has ALWAYS used for its progress
 * (`troid.progress`): a save from before there were slots is slot 1, byte for byte, and nothing is copied or moved to get it there.
 */
export const SLOT_COUNT = 3;
export const DEFAULT_SLOT = 1;

/** The key a slot's progress lives under (its `.bak` / `.corrupt` copies hang from it). */
export function slotKey(slot: number): string {
  return slot === DEFAULT_SLOT ? 'troid.progress' : `troid.progress.${slot}`;
}

export const isSlot = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= SLOT_COUNT;

/** Anything that is not a slot is the first one (a settings file a person edited cannot point the game at a place that does not exist). */
export const sanitizeSlot = (value: unknown): number => (isSlot(value) ? value : DEFAULT_SLOT);

/**
 * What a slot holds, as a LOOK at it found it:
 *  - `empty`: nothing was ever saved there (or it was deleted);
 *  - `ok`: a good save;
 *  - `recovered`: the main copy cannot be read but the backup of the last good write can — playing it puts that copy back in force;
 *  - `damaged`: something is stored and none of it can be read (it is kept, filed as `.corrupt`, until the player deletes it).
 */
export type SlotState = 'empty' | 'ok' | 'recovered' | 'damaged';

export interface SlotSummary {
  slot: number;
  state: SlotState;
  /** The save, for `ok` and `recovered`. */
  progress: Readonly<ProgressData> | null;
}

export interface SaveSlotsOptions {
  /** Where problems are reported (never thrown): the platform wires it to the log. */
  warn?: (message: string) => void;
}

export class SaveSlots {
  private readonly stores = new Map<number, ProgressStore>();

  constructor(
    private readonly storage: StorageAdapter,
    private readonly options: SaveSlotsOptions = {},
  ) {}

  /** The store of a slot: always the SAME object for the same slot, so every write to it goes through one queue. */
  store(slot: number): ProgressStore {
    const n = sanitizeSlot(slot);
    let store = this.stores.get(n);
    if (!store) {
      store = new ProgressStore(this.storage, { key: slotKey(n), ...(this.options.warn ? { warn: this.options.warn } : {}) });
      this.stores.set(n, store);
    }
    return store;
  }

  /** Every slot, looked at without changing anything (a list of games must not rewrite the ones it lists). Never rejects. */
  async summaries(): Promise<SlotSummary[]> {
    const out: SlotSummary[] = [];
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      const found = await this.store(slot).inspect();
      if (found.state === 'ok') out.push({ slot, state: found.recovered ? 'recovered' : 'ok', progress: found.value });
      else out.push({ slot, state: found.state, progress: null });
    }
    return out;
  }

  /** A new game in `slot`: what was there goes, but a copy that could not be read is kept aside. Resolves to whether it worked. */
  restart(slot: number): Promise<boolean> {
    return this.store(slot).restart();
  }

  /** Deletes `slot` and every copy of it, the damaged one too. Only for a player who asked for exactly this. */
  erase(slot: number): Promise<boolean> {
    return this.store(slot).erase();
  }
}
