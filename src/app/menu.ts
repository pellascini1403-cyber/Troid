import type { Bindings } from '@/input/bindings';
import { controlsReference } from '@/input/controlsReference';
import { SUPPORTED_LOCALES, type Translator } from '@/i18n';
import type { GameSession } from '@/gameplay/GameSession';
import type { PlayStats } from '@/gameplay/PlayStats';
import type { KeyMap } from '@/input/remap';
import type { QualitySetting } from '@/presentation/viewport';
import type { AccessibilitySettings, TouchSettings } from '@/save/SettingsData';
import type { SettingsStore } from '@/save/SettingsStore';
import { PauseMenu } from '@/ui/settings/PauseMenu';
import type { SavesHost } from '@/ui/settings/SavesScreen';
import { downloadText, pickTextFile } from './files';
import { AUTOSAVE, type GameSaves } from './gameSaves';
import { buildProfile } from './profile';
import { requestPersistence, storageStatus } from './storage';

/**
 * What the pause menu needs of the page, handed over by the game when the menu is first asked for (docs/PROMPT14-LOG.md). This module is the menu's side of the wiring — it reads the settings, the
 * session and what was counted, and turns them into what each screen asks for — and lives in the menu's chunk: the cold start carries none of it. The game keeps what CHANGES a setting (applying it
 * and saving it); the menu only reports a choice.
 */
export interface MenuDeps {
  parent: HTMLElement;
  translator: Translator;
  settings: SettingsStore;
  session: GameSession;
  stats: PlayStats;
  /** The saved games of the page (`null` in a playground, which saves nothing). */
  saves: GameSaves | null;
  /** The keys in force (they are replaced by a remap: asked for every time). */
  bindings(): Bindings;
  touchAvailable(): boolean;
  /** The device the player used last was a keyboard. */
  keyboardInUse(): boolean;
  change: {
    language(language: string): void;
    volume(level: number): void;
    quality(quality: QualitySetting): void;
    keys(keys: KeyMap): void;
    touch(patch: Partial<TouchSettings>): void;
    accessibility(patch: Partial<AccessibilitySettings>): void;
  };
  /** Closes the menu and lets the game go on. */
  resume(): void;
}

/** What the saved-games screen asks of the page: the actions are the saves' own (a chunk fetched on the first ask), the file in and out is the browser's. */
function savesHost(saves: GameSaves): Omit<SavesHost, 'back'> {
  return {
    cards: async () => (await saves.actions()).cards(),
    saveNow: async () => ((await saves.saveNow()) ? 'saved' : saves.conflicted ? 'conflict' : 'failed'),
    conflicted: () => saves.conflicted,
    switchTo: async (slot) => (await saves.actions()).switchTo(slot),
    startOver: async (slot) => (await saves.actions()).startOver(slot),
    erase: async (slot) => (await saves.actions()).erase(slot),
    exportSlot: async (slot) => (await saves.actions()).exportSlot(slot),
    importInto: async (slot, text) => (await saves.actions()).importInto(slot, text),
    download: (filename, text) => downloadText(document, filename, text),
    pickFile: () => pickTextFile(document, AUTOSAVE.importMaxBytes),
    storage: async () => ({ durable: saves.durable, persisted: (await storageStatus()).persisted }),
    requestPersistence: () => requestPersistence(),
  };
}

export function createPauseMenu(d: MenuDeps): PauseMenu {
  const { saves } = d;
  return new PauseMenu(d.parent, d.translator, {
    settings: {
      languages: SUPPORTED_LOCALES,
      touchAvailable: d.touchAvailable,
      // a keyboard is there unless this is a touch screen that has never seen one (a desktop, a laptop, a tablet with keys)
      keyboardAvailable: () => !d.touchAvailable() || d.keyboardInUse(),
      current: () => {
        const v = d.settings.value;
        return { language: d.translator.locale, volume: v.volume.master, quality: v.quality, keys: { ...v.keys }, touch: { ...v.touch }, accessibility: { ...v.accessibility } };
      },
      reference: () => controlsReference(d.bindings()),
      setLanguage: d.change.language,
      setVolume: d.change.volume,
      setQuality: d.change.quality,
      setKeys: d.change.keys,
      setTouch: d.change.touch,
      setAccessibility: d.change.accessibility,
    },
    // a playground (`?room=`) saves nothing: it has no saved games to show and no profile to keep
    saves: saves ? savesHost(saves) : null,
    profile: () => buildProfile(d.session, d.stats.snapshot(d.session.now), saves ? saves.slot : null),
    resume: d.resume,
  });
}
