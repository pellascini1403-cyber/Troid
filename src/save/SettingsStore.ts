import { Observable } from '@/core/observable';
import { SafeStore } from './SafeStore';
import type { KeyMap } from '@/input/remap';
import type { QualitySetting } from '@/presentation/viewport';
import { defaultSettings, parseSettings, repairSettings, serializeSettings, type SettingsData, type TouchSettings, type VolumeSettings } from './SettingsData';
import type { StorageAdapter } from './StorageAdapter';

/** A change to the settings: only what is given changes. */
export interface SettingsPatch {
  language?: string | null;
  volume?: Partial<VolumeSettings>;
  quality?: QualitySetting;
  /** The whole map of keys replaces the one there was (the menu works out swaps and refusals before asking). */
  keys?: KeyMap;
  touch?: Partial<TouchSettings>;
}

export interface SettingsStoreOptions {
  /** The key the settings live under (`<key>.bak` is the previous copy while a write is in flight, `<key>.corrupt` an unreadable one). */
  key?: string;
  /** Where problems are reported (never thrown): the platform wires it to the log. */
  warn?: (message: string) => void;
}

/**
 * The settings, loaded and saved safely (docs/ARCHITECTURE-2D.md §11). All the safety — the `.bak` / `.corrupt` copies, the read-back,
 * the serial queue — is `SafeStore`'s, shared with the progress of the game; this adds what is particular to the settings: the model,
 * the change the interface follows at once, and the observable.
 */
export class SettingsStore {
  readonly changed: Observable<Readonly<SettingsData>>;
  private state: SettingsData = defaultSettings();
  private readonly safe: SafeStore<SettingsData>;

  constructor(storage: StorageAdapter, options: SettingsStoreOptions = {}) {
    this.safe = new SafeStore(storage, { key: options.key ?? 'troid.settings', label: 'settings', parse: parseSettings, ...(options.warn ? { warn: options.warn } : {}) });
    this.changed = new Observable<Readonly<SettingsData>>(this.state);
  }

  get value(): Readonly<SettingsData> {
    return this.state;
  }

  /** Reads what is saved. Resolves to the settings now in force; never rejects. */
  async load(): Promise<Readonly<SettingsData>> {
    return this.adopt((await this.safe.load()) ?? defaultSettings());
  }

  /** Applies a change at once (the interface follows it) and saves it. Resolves to whether it reached the storage. */
  update(patch: SettingsPatch): Promise<boolean> {
    const cur = this.state;
    const next = repairSettings({
      language: patch.language === undefined ? cur.language : patch.language,
      volume: { ...cur.volume, ...patch.volume },
      quality: patch.quality ?? cur.quality,
      keys: patch.keys ?? cur.keys,
      touch: { ...cur.touch, ...patch.touch },
    });
    this.state = next;
    this.changed.set(next);
    return this.safe.write(serializeSettings(next));
  }

  /** Resolves when every write asked for so far is finished. */
  flush(): Promise<void> {
    return this.safe.flush();
  }

  private adopt(data: SettingsData): Readonly<SettingsData> {
    this.state = data;
    this.changed.set(data);
    return data;
  }
}
