/**
 * The player's SETTINGS as data (docs/ARCHITECTURE-2D.md §11): separate from the progress, versioned, and repairable. Version 1
 * holds what exists today — the language and the touch controls' size and opacity; the rest of the shape the architecture
 * sketches (volume, remapped keys, quality, accessibility) is added by a migration the day each one exists, not before.
 */
export const SETTINGS_VERSION = 1;

export interface TouchSettings {
  /** Size of the touch controls relative to the design size (1 = as designed). */
  scale: number;
  /** How opaque the touch controls are (1 = fully). */
  opacity: number;
}

export interface SettingsData {
  version: number;
  /** The language the player chose, or `null` while none was chosen (the device's language is followed). */
  language: string | null;
  touch: TouchSettings;
}

/** What the settings screen offers: the controls are never smaller than 80 % or bigger than 140 %, never fainter than 30 %. */
export const TOUCH_LIMITS = { scale: { min: 0.8, max: 1.4 }, opacity: { min: 0.3, max: 1 } } as const;

export function defaultSettings(): SettingsData {
  return { version: SETTINGS_VERSION, language: null, touch: { scale: 1, opacity: 1 } };
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
  const language = typeof r['language'] === 'string' && /^[a-z]{2,3}$/i.test(r['language']) ? r['language'].toLowerCase() : null;
  return {
    version: SETTINGS_VERSION,
    language,
    touch: {
      scale: limited(t['scale'], TOUCH_LIMITS.scale.min, TOUCH_LIMITS.scale.max, base.touch.scale),
      opacity: limited(t['opacity'], TOUCH_LIMITS.opacity.min, TOUCH_LIMITS.opacity.max, base.touch.opacity),
    },
  };
}

/** One step of the migration chain: a value of version `v` in, a value of version `v + 1` out. Pure. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** The migrations, by the version they upgrade FROM. Empty: version 1 is the first. Each one gets a golden file in the tests. */
export const SETTINGS_MIGRATIONS: Readonly<Record<number, Migration>> = {};

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
