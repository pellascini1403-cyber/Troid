import { sanitizeKeyMap, type KeyMap } from '@/input/remap';
import { QUALITY_SETTINGS, type QualitySetting } from '@/presentation/viewport';

/**
 * The player's SETTINGS as data (docs/ARCHITECTURE-2D.md §11): separate from the progress, versioned, and repairable. Version 1 held the
 * language and the size and opacity of the touch controls; version 2 (docs/PROMPT6-LOG.md S30) adds the volume (prepared: there is no sound yet),
 * the quality profile, the remapped keys and the position of the touch controls. Each one came with a migration, the day it existed.
 */
export const SETTINGS_VERSION = 2;

export interface VolumeSettings {
  /** The master volume, 0 (silence) … 1. */
  master: number;
}

/** Which side of the screen the buttons are on; the movement zone is the other one. */
export type TouchSide = 'right' | 'left';

export interface TouchSettings {
  /** Size of the touch controls relative to the design size (1 = as designed). */
  scale: number;
  /** How opaque the touch controls are (1 = fully). */
  opacity: number;
  /** The side of the buttons: `right` (as designed) or `left` (mirrored, for the other hand). */
  side: TouchSide;
  /** How far the buttons are moved in from their edge of the screen, 0 (as designed) … 1 (the most the layout allows). */
  offsetX: number;
  /** How far the buttons are raised from the bottom, 0 … 1 (the layout never lifts them into the interface above). */
  offsetY: number;
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
}

/** What the settings screen offers: the controls are never smaller than 80 % or bigger than 140 %, never fainter than 30 %; the position is a fraction. */
export const TOUCH_LIMITS = {
  scale: { min: 0.8, max: 1.4 },
  opacity: { min: 0.3, max: 1 },
  offsetX: { min: 0, max: 1 },
  offsetY: { min: 0, max: 1 },
} as const;

export const VOLUME_LIMITS = { master: { min: 0, max: 1 } } as const;

export function defaultSettings(): SettingsData {
  return {
    version: SETTINGS_VERSION,
    language: null,
    volume: { master: 0.8 },
    quality: 'auto',
    keys: {},
    touch: { scale: 1, opacity: 1, side: 'right', offsetX: 0, offsetY: 0 },
  };
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** A finite number inside the limits, or `fallback` when the value is not a number at all. */
function limited(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

/**
 * Makes ANY value into valid settings of the current version: wrong types fall back to the default of that field, numbers are
 * clamped, unknown keys are dropped. Used on what was read AND on what is about to be written, so a bad value never gets either way.
 */
export function repairSettings(raw: unknown): SettingsData {
  const base = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const t = typeof r['touch'] === 'object' && r['touch'] !== null ? (r['touch'] as Record<string, unknown>) : {};
  const v = typeof r['volume'] === 'object' && r['volume'] !== null ? (r['volume'] as Record<string, unknown>) : {};
  const language = typeof r['language'] === 'string' && /^[a-z]{2,3}$/i.test(r['language']) ? r['language'].toLowerCase() : null;
  const quality = (QUALITY_SETTINGS as readonly unknown[]).includes(r['quality']) ? (r['quality'] as QualitySetting) : base.quality;
  return {
    version: SETTINGS_VERSION,
    language,
    volume: { master: limited(v['master'], VOLUME_LIMITS.master.min, VOLUME_LIMITS.master.max, base.volume.master) },
    quality,
    keys: sanitizeKeyMap(r['keys']),
    touch: {
      scale: limited(t['scale'], TOUCH_LIMITS.scale.min, TOUCH_LIMITS.scale.max, base.touch.scale),
      opacity: limited(t['opacity'], TOUCH_LIMITS.opacity.min, TOUCH_LIMITS.opacity.max, base.touch.opacity),
      side: t['side'] === 'left' ? 'left' : 'right',
      offsetX: limited(t['offsetX'], TOUCH_LIMITS.offsetX.min, TOUCH_LIMITS.offsetX.max, base.touch.offsetX),
      offsetY: limited(t['offsetY'], TOUCH_LIMITS.offsetY.min, TOUCH_LIMITS.offsetY.max, base.touch.offsetY),
    },
  };
}

/** One step of the migration chain: a value of version `v` in, a value of version `v + 1` out. Pure. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * The migrations, by the version they upgrade FROM. Each one gets a golden file in the tests.
 *  - 1 → 2 (S30): the volume, the quality profile, the keys and the position of the touch controls arrive with their defaults; what version 1 held
 *    (the language, the size and the opacity) is kept as it was.
 */
export const SETTINGS_MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (data) => {
    const touch = typeof data['touch'] === 'object' && data['touch'] !== null ? (data['touch'] as Record<string, unknown>) : {};
    return { ...data, version: 2, volume: { master: 0.8 }, quality: 'auto', keys: {}, touch: { ...touch, side: 'right', offsetX: 0, offsetY: 0 } };
  },
};

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
