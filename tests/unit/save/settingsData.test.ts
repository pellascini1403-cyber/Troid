import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings, repairSettings, serializeSettings, SETTINGS_MIGRATIONS, SETTINGS_VERSION, TOUCH_LIMITS } from '@/save/SettingsData';

/**
 * The settings as DATA (docs/ARCHITECTURE-2D.md §11): a version, repairs for whatever a damaged or hand-edited value could be,
 * and a migration chain with a golden file per version so a format change can never silently break the settings of a player.
 */
describe('defaults and repair', () => {
  it('the defaults: no language chosen (follow the device) and the touch controls as designed', () => {
    expect(defaultSettings()).toEqual({ version: 1, language: null, touch: { scale: 1, opacity: 1 } });
    expect(SETTINGS_VERSION).toBe(1);
  });

  it('each default is a fresh object: changing one never changes the next', () => {
    const a = defaultSettings();
    a.touch.scale = 2;
    expect(defaultSettings().touch.scale).toBe(1);
  });

  it('numbers are clamped to what the settings screen offers (80–140 % size, 30–100 % opacity)', () => {
    expect(TOUCH_LIMITS).toEqual({ scale: { min: 0.8, max: 1.4 }, opacity: { min: 0.3, max: 1 } });
    expect(repairSettings({ touch: { scale: 9, opacity: 9 } }).touch).toEqual({ scale: 1.4, opacity: 1 });
    expect(repairSettings({ touch: { scale: -3, opacity: 0 } }).touch).toEqual({ scale: 0.8, opacity: 0.3 });
    expect(repairSettings({ touch: { scale: 1.2, opacity: 0.8 } }).touch).toEqual({ scale: 1.2, opacity: 0.8 });
  });

  it('a value of the wrong type falls back to the default of THAT field, not of the whole', () => {
    const r = repairSettings({ language: 7, touch: { scale: 'big', opacity: 0.5 } });
    expect(r.language).toBeNull();
    expect(r.touch).toEqual({ scale: 1, opacity: 0.5 });
    expect(repairSettings({ touch: { scale: Number.NaN, opacity: Number.POSITIVE_INFINITY } }).touch).toEqual({ scale: 1, opacity: 1 });
  });

  it('a language must look like a language code (2–3 letters): anything else is "none chosen"; case is normalised', () => {
    expect(repairSettings({ language: 'ES' }).language).toBe('es');
    expect(repairSettings({ language: 'en' }).language).toBe('en');
    expect(repairSettings({ language: 'es-MX' }).language).toBeNull();
    expect(repairSettings({ language: '<script>' }).language).toBeNull();
    expect(repairSettings({ language: '' }).language).toBeNull();
  });

  it('what is not an object becomes the defaults; unknown keys are dropped', () => {
    for (const bad of [null, undefined, 3, 'x', []]) expect(repairSettings(bad)).toEqual(defaultSettings());
    expect(repairSettings({ language: 'es', volume: 11, extra: { a: 1 } })).toEqual({ version: 1, language: 'es', touch: { scale: 1, opacity: 1 } });
  });
});

describe('parsing what was stored', () => {
  it('a valid value of the current version gives the same settings', () => {
    const s = { version: 1, language: 'es', touch: { scale: 1.1, opacity: 0.6 } };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });

  it('round trip: what is serialised parses back unchanged', () => {
    const s = { version: 1, language: 'en', touch: { scale: 0.9, opacity: 0.4 } };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('serialising repairs first: a bad value never reaches the storage', () => {
    const text = serializeSettings({ version: 1, language: 'es', touch: { scale: 99, opacity: -1 } });
    expect(JSON.parse(text)).toEqual({ version: 1, language: 'es', touch: { scale: 1.4, opacity: 0.3 } });
  });

  it('what cannot be trusted at all is `null`: not JSON, not an object, no integer version, or a version from a LATER game', () => {
    for (const bad of ['', '{', 'null', '[]', '"es"', '3', '{}', '{"version":"1"}', '{"version":1.5}', '{"version":0}', '{"version":2,"language":"es"}', '{"version":99}']) {
      expect(parseSettings(bad), bad).toBeNull();
    }
  });

  it('a damaged value of a known version is repaired, not refused', () => {
    expect(parseSettings('{"version":1,"language":"fr-CA","touch":{"scale":50}}')).toEqual({ version: 1, language: null, touch: { scale: 1.4, opacity: 1 } });
  });
});

describe('migrations', () => {
  it('there are none yet (version 1 is the first), and a golden file of version 1 pins its format', () => {
    expect(SETTINGS_MIGRATIONS).toEqual({});
    const golden = readFileSync(new URL('./golden/settings.v1.json', import.meta.url), 'utf8');
    expect(parseSettings(golden)).toEqual({ version: 1, language: 'es', touch: { scale: 1.2, opacity: 0.8 } });
  });

  it('the chain runs step by step, each one upgrading from the version it names', () => {
    const migrations = {
      1: (d: Record<string, unknown>) => ({ ...d, version: 2, accessibility: { shake: 1 } }),
      2: (d: Record<string, unknown>) => ({ ...d, version: 3, language: d['language'] ?? 'en' }),
    };
    // a pretend build whose current version is 3: the stored v1 value goes 1 → 2 → 3, then it is repaired as the CURRENT shape
    const out = parseSettings('{"version":1,"touch":{"scale":1.1,"opacity":0.9}}', migrations, 3);
    expect(out).toEqual({ version: 1, language: 'en', touch: { scale: 1.1, opacity: 0.9 } });
  });

  it('a hole in the chain is `null` (nothing safe can be done), never a guess', () => {
    expect(parseSettings('{"version":1}', { 2: (d) => d }, 3)).toBeNull();
  });
});
