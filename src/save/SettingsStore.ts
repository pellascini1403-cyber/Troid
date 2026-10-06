import { Observable } from '@/core/observable';
import { parseSettings, repairSettings, serializeSettings, defaultSettings, type SettingsData, type TouchSettings } from './SettingsData';
import type { StorageAdapter } from './StorageAdapter';

/** A change to the settings: only what is given changes. */
export interface SettingsPatch {
  language?: string | null;
  touch?: Partial<TouchSettings>;
}

export interface SettingsStoreOptions {
  /** The key the settings live under (`<key>.bak` is the previous copy while a write is in flight, `<key>.corrupt` an unreadable one). */
  key?: string;
  /** Where problems are reported (never thrown): the platform wires it to the log. */
  warn?: (message: string) => void;
}

/**
 * The settings, loaded and saved safely (docs/ARCHITECTURE-2D.md §11). It never throws: a store that is full, blocked or empty
 * means the game runs on the in-memory value and says so once.
 *
 * - **Load:** `key` → if it is unreadable it is KEPT as `key.corrupt` and `key.bak` is tried → if that fails too, the defaults.
 * - **Write:** `key.bak` ← the previous value · `key` ← the new one · it is read back and checked · only then is the `.bak` removed.
 *   Whatever stops in the middle leaves a good copy behind.
 * - Writes are SERIALISED: two quick changes reach the storage in order, the last one wins.
 */
export class SettingsStore {
  readonly changed: Observable<Readonly<SettingsData>>;
  private state: SettingsData = defaultSettings();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly key: string;
  private readonly warn: (message: string) => void;
  private warned = false;

  constructor(
    private readonly storage: StorageAdapter,
    options: SettingsStoreOptions = {},
  ) {
    this.key = options.key ?? 'troid.settings';
    this.warn = options.warn ?? (() => undefined);
    this.changed = new Observable<Readonly<SettingsData>>(this.state);
  }

  get value(): Readonly<SettingsData> {
    return this.state;
  }

  /** Reads what is saved. Resolves to the settings now in force; never rejects. */
  async load(): Promise<Readonly<SettingsData>> {
    const main = await this.read(this.key);
    if (main !== null) {
      const parsed = parseSettings(main);
      if (parsed) return this.adopt(parsed);
      this.report(`the saved settings are unreadable; they are kept as "${this.key}.corrupt"`);
      await this.attempt(() => this.storage.set(`${this.key}.corrupt`, main));
    }
    const backup = await this.read(`${this.key}.bak`);
    if (backup !== null) {
      const parsed = parseSettings(backup);
      if (parsed) {
        // the good copy is back in force; put it where it belongs (the backup stays until the next good write)
        await this.attempt(() => this.storage.set(this.key, backup));
        return this.adopt(parsed);
      }
    }
    return this.adopt(defaultSettings());
  }

  /** Applies a change at once (the interface follows it) and saves it. Resolves to whether it reached the storage. */
  update(patch: SettingsPatch): Promise<boolean> {
    const cur = this.state;
    const next = repairSettings({
      language: patch.language === undefined ? cur.language : patch.language,
      touch: { ...cur.touch, ...patch.touch },
    });
    this.state = next;
    this.changed.set(next);
    const text = serializeSettings(next);
    const written = this.queue.then(() => this.write(text));
    this.queue = written;
    return written;
  }

  /** Resolves when every write asked for so far is finished. */
  async flush(): Promise<void> {
    await this.queue;
  }

  // ---------------------------------------------------------------------------------------------- internals

  private adopt(data: SettingsData): Readonly<SettingsData> {
    this.state = data;
    this.changed.set(data);
    return data;
  }

  private async write(text: string): Promise<boolean> {
    const bak = `${this.key}.bak`;
    try {
      const previous = await this.storage.get(this.key);
      const replacing = previous !== null && previous !== text;
      if (replacing) await this.storage.set(bak, previous);
      await this.storage.set(this.key, text);
      if ((await this.storage.get(this.key)) !== text) {
        this.report('a settings write did not read back as written; the previous copy is kept');
        return false;
      }
      if (replacing) await this.storage.remove(bak);
      return true;
    } catch (error) {
      this.report(`settings could not be saved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async read(key: string): Promise<string | null> {
    try {
      return await this.storage.get(key);
    } catch (error) {
      this.report(`settings could not be read: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async attempt(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.report(`settings storage failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Once per session: a store that fails does so every time, and the player needs to hear it once. */
  private report(message: string): void {
    if (this.warned) return;
    this.warned = true;
    this.warn(message);
  }
}
