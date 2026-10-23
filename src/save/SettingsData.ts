import { clamp } from '@/core/math';
import { BUTTON_DESIGN, uiScale } from '@/input/gestures/TouchConfig';
import { sanitizeKeyMap, type KeyMap } from '@/input/remap';
import { AUDIO_CATEGORIES, AUDIO_LEVEL_LIMITS, DEFAULT_AUDIO_LEVELS, type AudioLevels } from '@/presentation/audioMix';
import { QUALITY_SETTINGS, type QualitySetting } from '@/presentation/viewport';
import { DEFAULT_SLOT, sanitizeSlot } from './SaveSlots';

/**
 * The player's SETTINGS as data (docs/ARCHITECTURE-2D.md §11): separate from the progress, versioned, and repairable. Version 1 held the
 * language and the size and opacity of the touch controls; version 2 (docs/PROMPT6-LOG.md S30) adds the volume,
 * the quality profile, the remapped keys and the position of the touch controls; version 3 (docs/PROMPT14-LOG.md) adds the saved game being played (`slot`) and the
 * accessibility choices (fewer flashes, no camera shake, the size of the HUD); version 4 (docs/PROMPT15-LOG.md) lets the player place each touch button where they like (the side and the two
 * offsets of version 2 become the position of every button); version 5 (docs/PROMPT18-LOG.md) gives the sound its three other volumes — the music, the effects and the ambience — under the general one. Each one came with a
 * migration, the day it existed.
 */
export const SETTINGS_VERSION = 5;

/** The volumes the player chooses, each 0 (silence) … 1: the general one and one for each kind of sound. */
export type VolumeSettings = AudioLevels;

/** The three fixed touch buttons the player can place: the melee attack, the dash and the ranged / magic ability (the bottle chip is not one of them: it hangs from the attack). */
export const TOUCH_BUTTONS = ['attack', 'dash', 'ability'] as const;
export type TouchButtonId = (typeof TOUCH_BUTTONS)[number];

/** Where the player put one button, and how big they made it. */
export interface TouchButtonSetting {
  /** The centre of the button as a fraction of the SAFE area: 0 is its left edge, 1 its right edge. */
  x: number;
  /** …and 0 its top edge, 1 its bottom edge. */
  y: number;
  /** The size of THIS button relative to the design (1 = as designed), on top of the size of all of them. */
  scale: number;
}

export interface TouchSettings {
  /** Size of the touch controls relative to the design size (1 = as designed). */
  scale: number;
  /** How opaque the touch controls are (1 = fully). */
  opacity: number;
  /** The buttons the player has placed; one that is not here is where the design has it (and follows the corner of the screen). */
  buttons: Readonly<Partial<Record<TouchButtonId, TouchButtonSetting>>>;
}

/** What a player can ask of the picture so that it is easier on them. Each one changes something the game really does (docs/PROMPT14-LOG.md). */
export interface AccessibilitySettings {
  /** The screen's pulses (a blow taken, a power gained, a place that wakes) and the white flashes of the interface are softened to a fraction of their strength. */
  reduceFlashes: boolean;
  /** The camera does not shake when something lands. */
  reduceShake: boolean;
  /** The size of the HUD (the portrait, the life, the magic and the bottles) relative to its design: 1 = as designed. */
  hudScale: number;
}

export interface SettingsData {
  version: number;
  /** The language the player chose, or `null` while none was chosen (the device's language is followed). */
  language: string | null;
  volume: VolumeSettings;
  /** `auto` is the balanced profile (nothing measures the device yet), `low` and `high` the ends. */
  quality: QualitySetting;
  /** The keys the player gave the main actions (only what differs from the defaults). */
  keys: KeyMap;
  touch: TouchSettings;
  /** The saved game being played (1 … `SLOT_COUNT`): the one the game opens with. */
  slot: number;
  accessibility: AccessibilitySettings;
}

/** What the settings screen offers: the controls are never smaller than 80 % or bigger than 140 %, never fainter than 30 %; the position is a fraction; one button may be 70 % … 150 % of its design on its own. */
export const TOUCH_LIMITS = {
  scale: { min: 0.8, max: 1.4 },
  opacity: { min: 0.3, max: 1 },
  position: { min: 0, max: 1 },
  button: { min: 0.7, max: 1.5 },
} as const;

export const VOLUME_LIMITS = { master: AUDIO_LEVEL_LIMITS, music: AUDIO_LEVEL_LIMITS, sfx: AUDIO_LEVEL_LIMITS, ambience: AUDIO_LEVEL_LIMITS } as const;

/** The HUD is never smaller than 85 % of its design (the numbers on it would stop being legible) nor bigger than 135 % (it would take the corner of a small phone). */
export const HUD_SCALE_LIMITS = { min: 0.85, max: 1.35 } as const;

export function defaultSettings(): SettingsData {
  return {
    version: SETTINGS_VERSION,
    language: null,
    volume: { ...DEFAULT_AUDIO_LEVELS },
    quality: 'auto',
    keys: {},
    touch: { scale: 1, opacity: 1, buttons: {} },
    slot: DEFAULT_SLOT,
    accessibility: { reduceFlashes: false, reduceShake: false, hudScale: 1 },
  };
}

/**
 * What the settings are before the player has chosen anything, on a system that has said what it needs: one that asks for less motion gets the game with the camera that does not shake and the effects that do not flash —
 * the nearest the game has to what the system asked for, and the player's own choice replaces it the moment they make one. (Settings that were saved are never touched by this.)
 */
export function defaultsFor(system: { reducedMotion: boolean }): SettingsData {
  const base = defaultSettings();
  return system.reducedMotion ? { ...base, accessibility: { ...base.accessibility, reduceFlashes: true, reduceShake: true } } : base;
}

/** A position or a size as it is kept: four decimals (a tenth of a pixel on any screen), so what is saved is tidy and what was saved is what comes back. */
const tidy = (v: number): number => Math.round(v * 1e4) / 1e4;

/** The value as an object (anything that is not one is an empty one): what was stored may be anything. */
const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

/** A finite number inside the limits, or `fallback` when the value is not a number at all. */
function limited(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

/**
 * The buttons the player placed, repaired: only the three known buttons, each with a finite position inside the safe area (a button whose position is not a number is simply not placed: it is
 * where the design has it) and a size inside the limits (a wrong size is the design size). Always in the same order, so the same settings are always the same text.
 */
function repairButtons(raw: unknown): Partial<Record<TouchButtonId, TouchButtonSetting>> {
  const out: Partial<Record<TouchButtonId, TouchButtonSetting>> = {};
  const all = record(raw);
  const { position, button } = TOUCH_LIMITS;
  for (const id of TOUCH_BUTTONS) {
    const b = record(all[id]);
    const x = limited(b['x'], position.min, position.max, Number.NaN);
    const y = limited(b['y'], position.min, position.max, Number.NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    out[id] = { x: tidy(x), y: tidy(y), scale: tidy(limited(b['scale'], button.min, button.max, 1)) };
  }
  return out;
}

/**
 * Makes ANY value into valid settings of the current version: wrong types fall back to the default of that field, numbers are
 * clamped, unknown keys are dropped. Used on what was read AND on what is about to be written, so a bad value never gets either way.
 */
export function repairSettings(raw: unknown): SettingsData {
  const base = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const t = record(r['touch']);
  const v = record(r['volume']);
  const a = record(r['accessibility']);
  const language = typeof r['language'] === 'string' && /^[a-z]{2,3}$/i.test(r['language']) ? r['language'].toLowerCase() : null;
  const quality = (QUALITY_SETTINGS as readonly unknown[]).includes(r['quality']) ? (r['quality'] as QualitySetting) : base.quality;
  return {
    version: SETTINGS_VERSION,
    language,
    volume: Object.fromEntries(AUDIO_CATEGORIES.map((c) => [c, limited(v[c], VOLUME_LIMITS[c].min, VOLUME_LIMITS[c].max, base.volume[c])])) as VolumeSettings,
    quality,
    keys: sanitizeKeyMap(r['keys']),
    touch: {
      scale: limited(t['scale'], TOUCH_LIMITS.scale.min, TOUCH_LIMITS.scale.max, base.touch.scale),
      opacity: limited(t['opacity'], TOUCH_LIMITS.opacity.min, TOUCH_LIMITS.opacity.max, base.touch.opacity),
      buttons: repairButtons(t['buttons']),
    },
    slot: sanitizeSlot(r['slot']),
    accessibility: {
      reduceFlashes: a['reduceFlashes'] === true,
      reduceShake: a['reduceShake'] === true,
      hudScale: limited(a['hudScale'], HUD_SCALE_LIMITS.min, HUD_SCALE_LIMITS.max, base.accessibility.hudScale),
    },
  };
}

/** One step of the migration chain: a value of version `v` in, a value of version `v + 1` out. Pure. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * The migrations, by the version they upgrade FROM. Each one gets a golden file in the tests.
 *  - 1 → 2 (S30): the volume, the quality profile, the keys and the position of the touch controls arrive with their defaults; what version 1 held
 *    (the language, the size and the opacity) is kept as it was.
 *  - 2 → 3 (docs/PROMPT14-LOG.md): the saved game being played (the first, where every save made so far lives) and the accessibility choices (all off, the HUD as designed)
 *    arrive; everything version 2 held is kept as it was.
 *  - 3 → 4 (docs/PROMPT15-LOG.md): the side and the two offsets of the block of buttons become the position of each button. A player who never touched them (the right, no offset) keeps the
 *    design's places; one who did gets their three buttons on the same side and as far in and up as they had them, worked out on the reference screen of the design (844 × 390).
 *  - 4 → 5 (docs/PROMPT18-LOG.md): the music, the effects and the ambience get a volume of their own (at the defaults); the general volume the player had chosen is kept as it was.
 */
export const SETTINGS_MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (data) => ({ ...data, version: 2, volume: { master: 0.8 }, quality: 'auto', keys: {}, touch: { ...record(data['touch']), side: 'right', offsetX: 0, offsetY: 0 } }),
  2: (data) => ({ ...data, version: 3, slot: DEFAULT_SLOT, accessibility: { reduceFlashes: false, reduceShake: false, hudScale: 1 } }),
  3: (data) => {
    const { side, offsetX, offsetY, ...kept } = record(data['touch']);
    return { ...data, version: 4, touch: { ...kept, buttons: placedAsBefore(side, offsetX, offsetY) } };
  },
  4: (data) => ({ ...data, version: 5, volume: { ...DEFAULT_AUDIO_LEVELS, ...record(data['volume']) } }),
};

/**
 * Version 3's block of buttons — the side it hung from and how far in and up it had been moved — as the position of each of the three buttons: the design's places (`BUTTON_DESIGN`), on the reference
 * screen of the design (844 × 390 px), moved by those offsets. (If the design ever moves, the golden file of this migration says so.)
 */
function placedAsBefore(side: unknown, offsetX: unknown, offsetY: unknown): Record<string, TouchButtonSetting> {
  const left = side === 'left';
  const inward = limited(offsetX, 0, 1, 0) * 120;
  const upward = limited(offsetY, 0, 1, 0) * 70;
  const out: Record<string, TouchButtonSetting> = {};
  if (!left && inward === 0 && upward === 0) return out;
  const width = 844;
  const height = 390;
  const g = uiScale(width, height);
  for (const id of TOUCH_BUTTONS) {
    const { dx, dy } = BUTTON_DESIGN[id];
    const fromRight = width + dx * g;
    const x = left ? width - fromRight + inward * g : fromRight - inward * g;
    const y = height + dy * g - upward * g;
    out[id] = { x: tidy(clamp(x / width, 0, 1)), y: tidy(clamp(y / height, 0, 1)), scale: 1 };
  }
  return out;
}

/**
 * Reads what was stored: JSON → migrated to the current version → repaired. `null` when it cannot be trusted at all: not JSON,
 * not an object, no integer version, or a version NEWER than this build knows (it belongs to a later game: it is kept aside,
 * never overwritten silently).
 */
export function parseSettings(text: string, migrations: Readonly<Record<number, Migration>> = SETTINGS_MIGRATIONS, current = SETTINGS_VERSION): SettingsData | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  let data = value as Record<string, unknown>;
  let version = data['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > current) return null;
  while (version < current) {
    const step = migrations[version];
    if (!step) return null; // a hole in the chain: nothing safe to do
    data = step(data);
    version++;
  }
  return repairSettings(data);
}

export function serializeSettings(data: Readonly<SettingsData>): string {
  return JSON.stringify(repairSettings(data));
}
