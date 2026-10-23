import { ROOMS, WORLD } from '@/content';
import type { Bindings } from '@/input/bindings';
import { controlsReference } from '@/input/controlsReference';
import { SUPPORTED_LOCALES, type Translator } from '@/i18n';
import type { GameSession } from '@/gameplay/GameSession';
import type { PlayStats } from '@/gameplay/PlayStats';
import type { KeyMap } from '@/input/remap';
import type { AudioCategory } from '@/presentation/audioMix';
import type { QualitySetting } from '@/presentation/viewport';
import type { AccessibilitySettings, TouchSettings } from '@/save/SettingsData';
import type { SettingsStore } from '@/save/SettingsStore';
import { PauseMenu, type MenuSound } from '@/ui/settings/PauseMenu';
import type { SavesHost } from '@/ui/settings/SavesScreen';
import type { Insets } from '@/ui/touch/layout';
import { TouchEditor } from '@/ui/touch/TouchEditor';
import type { TouchPreviewData } from '@/ui/touch/TouchPreview';
import { buildMapLayout, mapScene, type MapLayout } from '@/world/worldMap';
import { downloadText, pickTextFile } from './files';
import { AUTOSAVE, type GameSaves } from './gameSaves';
import { buildProfile } from './profile';
import { requestPersistence, storageStatus } from './storageStatus';

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
  /** The window as the touch buttons are laid out in it, and the size the player chose for the HUD (the editor of the buttons draws with them). */
  touchWindow(): { width: number; height: number; insets: Insets; hudScale: number };
  /** The layout of the touch buttons as the game has it now (`null`: there is no touch layer). */
  touchPreview(): TouchPreviewData | null;
  /** The game's touch layer steps aside while the editor has the screen, and comes back after. */
  suspendTouch(suspended: boolean): void;
  /** The device the player used last was a keyboard. */
  keyboardInUse(): boolean;
  change: {
    language(language: string): void;
    volume(category: AudioCategory, level: number): void;
    quality(quality: QualitySetting): void;
    keys(keys: KeyMap): void;
    touch(patch: Partial<TouchSettings>): void;
    accessibility(patch: Partial<AccessibilitySettings>): void;
  };
  /** Closes the menu and lets the game go on. */
  resume(): void;
  /** Makes a sound of the menu heard (a press, a slider, a switch, a game saved). Absent where the page makes no sound. */
  sound?(kind: MenuSound): void;
}

/** What the saved-games screen asks of the page: the actions are the saves' own (a chunk fetched on the first ask), the file in and out is the browser's. */
function savesHost(saves: GameSaves, sound: MenuDeps['sound']): Omit<SavesHost, 'back'> {
  return {
    cards: async () => (await saves.actions()).cards(),
    saveNow: async () => {
      if (await saves.saveNow()) {
        sound?.('save');
        return 'saved';
      }
      return saves.conflicted ? 'conflict' : 'failed';
    },
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

/** The layout of the world's map: built from the rooms the game is made of, once, the first time the menu is made. */
let layout: MapLayout | null = null;

export function createPauseMenu(d: MenuDeps): PauseMenu {
  const { saves } = d;
  let editor: TouchEditor | null = null;
  const menu: PauseMenu = new PauseMenu(d.parent, d.translator, {
    settings: {
      languages: SUPPORTED_LOCALES,
      touchAvailable: d.touchAvailable,
      // a keyboard is there unless this is a touch screen that has never seen one (a desktop, a laptop, a tablet with keys)
      keyboardAvailable: () => !d.touchAvailable() || d.keyboardInUse(),
      current: () => {
        const v = d.settings.value;
        return { language: d.translator.locale, volume: { ...v.volume }, quality: v.quality, keys: { ...v.keys }, touch: { ...v.touch }, accessibility: { ...v.accessibility } };
      },
      reference: () => controlsReference(d.bindings()),
      setLanguage: d.change.language,
      setVolume: d.change.volume,
      setQuality: d.change.quality,
      setKeys: d.change.keys,
      setTouch: d.change.touch,
      touchPreview: d.touchPreview,
      // the editor of the touch buttons: it has the screen (the menu steps aside) and reports what the player kept, which the game applies and saves like any other choice
      editTouch: () => {
        editor ??= new TouchEditor(d.parent, d.translator, {
          window: d.touchWindow,
          current: () => ({ scale: d.settings.value.touch.scale, buttons: d.settings.value.touch.buttons }),
          save: (buttons) => d.change.touch({ buttons }),
          suspend: d.suspendTouch,
          done: () => menu.setAside(false),
        });
        menu.setAside(true);
        editor.open();
      },
      setAccessibility: d.change.accessibility,
    },
    // a playground (`?room=`) saves nothing: it has no saved games to show and no profile to keep
    saves: saves ? savesHost(saves, d.sound) : null,
    profile: () => buildProfile(d.session, d.stats.snapshot(d.session.now), saves ? saves.slot : null),
    // the map is the world the hero has been through: the rooms counted as visited (the same list the save keeps and the profile reads), the flags of the world, and where the hero is now
    map: () => {
      layout ??= buildMapLayout(WORLD, ROOMS);
      const hero = d.session.player.body;
      return mapScene(layout, { visited: d.stats.snapshot(d.session.now).rooms, flag: (f) => d.session.flags.has(f), room: d.session.room.id, hero: { x: hero.x, y: hero.y }, checkpoint: d.session.checkpoint });
    },
    resume: d.resume,
    sound: d.sound,
    interrupt: () => {
      if (!editor?.active) return false;
      editor.cancel();
      return true;
    },
  });
  return menu;
}
