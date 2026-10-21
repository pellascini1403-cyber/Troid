import type { ProfileData } from '@/app/profile';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { controlsReference } from '@/input/controlsReference';
import { defaultSettings } from '@/save/SettingsData';
import type { PauseHost } from '@/ui/settings/PauseMenu';
import type { ImportOutcome, PickedFile, SaveOutcome, SavesHost, SlotCardView } from '@/ui/settings/SavesScreen';
import type { SettingsMenuHost } from '@/ui/settings/SettingsMenu';
import { computeTouchLayout } from '@/ui/touch/layout';

/** The data a profile of a game in progress has: some of everything, so a test sees each line. */
export function profileData(over: Partial<ProfileData> = {}): ProfileData {
  return {
    slot: 1,
    ticks: 60 * 83,
    deaths: 2,
    kills: 5,
    zoneKey: 'room.r1.name',
    rooms: { visited: 2, total: 4 },
    abilities: ['ability.dash'],
    cards: ['card.spiritBolt.name'],
    bottles: { slots: 3, max: 4 },
    bosses: { beaten: [], total: 1 },
    lifeMax: 5,
    ...over,
  };
}

export function slotCard(slot: number, over: Partial<SlotCardView> = {}): SlotCardView {
  return { slot, state: 'empty', active: false, zoneKey: null, ticks: 0, savedAt: 0, ...over };
}

/** What a host of the saved-games screen was asked, in order, and what each ask answers (change `answers` to make one fail). */
export interface SavesProbe {
  host: Omit<SavesHost, 'back'>;
  calls: string[];
  cards: SlotCardView[];
  answers: {
    saveNow: SaveOutcome;
    conflicted: boolean;
    switchTo: boolean;
    startOver: boolean;
    erase: boolean;
    export: { filename: string; text: string } | null;
    import: ImportOutcome;
    download: boolean;
    picked: PickedFile | null;
    storage: { durable: boolean; persisted: boolean | null };
    persistence: boolean;
  };
}

export function savesProbe(): SavesProbe {
  const probe: SavesProbe = {
    calls: [],
    cards: [slotCard(1, { state: 'ok', active: true, zoneKey: 'room.r1.name', ticks: 60 * 83, savedAt: Date.UTC(2026, 9, 19, 12, 30) }), slotCard(2), slotCard(3)],
    answers: {
      saveNow: 'saved',
      conflicted: false,
      switchTo: true,
      startOver: true,
      erase: true,
      export: { filename: 'troid-partida-1-2026-10-19.json', text: '{"saveVersion":2}' },
      import: { ok: true },
      download: true,
      picked: { kind: 'text', text: '{"saveVersion":2}' },
      storage: { durable: true, persisted: null },
      persistence: true,
    },
    host: undefined as never,
  };
  const log = (entry: string): void => void probe.calls.push(entry);
  probe.host = {
    cards: async () => probe.cards.map((c) => ({ ...c })),
    saveNow: async () => {
      log('saveNow');
      if (probe.answers.saveNow === 'conflict') probe.answers.conflicted = true; // (a page that was refused has stopped saving)
      return probe.answers.saveNow;
    },
    conflicted: () => probe.answers.conflicted,
    switchTo: async (slot) => (log(`switchTo:${slot}`), probe.answers.switchTo),
    startOver: async (slot) => (log(`startOver:${slot}`), probe.answers.startOver),
    erase: async (slot) => (log(`erase:${slot}`), probe.answers.erase),
    exportSlot: async (slot) => (log(`export:${slot}`), probe.answers.export),
    importInto: async (slot, text) => (log(`import:${slot}:${text}`), probe.answers.import),
    download: (filename, text) => (log(`download:${filename}:${text}`), probe.answers.download),
    pickFile: async () => (log('pickFile'), probe.answers.picked),
    storage: async () => probe.answers.storage,
    requestPersistence: async () => (log('persist'), probe.answers.persistence),
  };
  return probe;
}

/** A settings host over a plain object, recording what it was asked. */
export function settingsProbe(over: { touch?: boolean; keyboard?: boolean } = {}): { host: Omit<SettingsMenuHost, 'close'>; calls: string[] } {
  const calls: string[] = [];
  const state = { ...defaultSettings(), language: 'es' };
  const host: Omit<SettingsMenuHost, 'close'> = {
    languages: ['es', 'en'],
    touchAvailable: () => over.touch ?? true,
    keyboardAvailable: () => over.keyboard ?? true,
    current: () => ({ language: state.language, volume: state.volume.master, quality: state.quality, keys: { ...state.keys }, touch: { ...state.touch }, accessibility: { ...state.accessibility } }),
    reference: () => controlsReference(DEFAULT_BINDINGS),
    setLanguage: (language) => void (calls.push(`lang:${language}`), (state.language = language)),
    setVolume: (level) => void calls.push(`volume:${level}`),
    setQuality: (quality) => void calls.push(`quality:${quality}`),
    setKeys: (keys) => void calls.push(`keys:${JSON.stringify(keys)}`),
    setTouch: (patch) => void calls.push(`touch:${JSON.stringify(patch)}`),
    // the layout of the design on the reference screen: what the small picture in the settings draws
    touchPreview: () => (over.touch ?? true ? { width: 844, height: 390, layout: computeTouchLayout(844, 390) } : null),
    editTouch: () => void calls.push('edit-touch'),
    setAccessibility: (patch) => void calls.push(`access:${JSON.stringify(patch)}`),
  };
  return { host, calls };
}

export interface PauseProbe {
  host: PauseHost;
  calls: string[];
  saves: SavesProbe;
  profile: { data: ProfileData };
}

/** A whole host for the pause menu: settings, saved games, profile and resume, recording what it is asked. */
export function pauseProbe(over: { playground?: boolean } = {}): PauseProbe {
  const settings = settingsProbe();
  const saves = savesProbe();
  const profile = { data: profileData(over.playground ? { slot: null } : {}) };
  const calls = settings.calls;
  return {
    host: {
      settings: settings.host,
      saves: over.playground ? null : saves.host,
      profile: () => profile.data,
      resume: () => void calls.push('resume'),
    },
    calls,
    saves,
    profile,
  };
}
