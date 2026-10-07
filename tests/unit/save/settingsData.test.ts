import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings, repairSettings, serializeSettings, SETTINGS_MIGRATIONS, SETTINGS_VERSION, TOUCH_LIMITS, VOLUME_LIMITS } from '@/save/SettingsData';

/**
 * The settings as DATA (docs/ARCHITECTURE-2D.md §11): a version, repairs for whatever a damaged or hand-edited value could be,
 * and a migration chain with a golden file per version so a format change can never silently break the settings of a player.
 * Version 2 (docs/PROMPT6-LOG.md S30) added the volume, the quality profile, the remapped keys and the position of the touch controls.
 */
const NEW_TOUCH = { side: 'right', offsetX: 0, offsetY: 0 } as const;
const touch = (over: Record<string, unknown> = {}) => ({ scale: 1, opacity: 1, ...NEW_TOUCH, ...over });

describe('defaults and repair', () => {
  it('the defaults: no language chosen (follow the device), the volume at 80 %, the balanced quality, no key changed and the touch controls as designed', () => {
    expect(defaultSettings()).toEqual({ version: 2, language: null, volume: { master: 0.8 }, quality: 'auto', keys: {}, touch: touch() });
    expect(SETTINGS_VERSION).toBe(2);
  });

  it('each default is a fresh object: changing one never changes the next', () => {
    const a = defaultSettings();
    a.touch.scale = 2;
    a.volume.master = 0;
    a.keys['attack'] = 'KeyF';
    expect(defaultSettings().touch.scale).toBe(1);
    expect(defaultSettings().volume.master).toBe(0.8);
    expect(defaultSettings().keys).toEqual({});
  });

  it('numbers are clamped to what the settings screen offers (80–140 % size, 30–100 % opacity, the position and the volume 0–1)', () => {
    expect(TOUCH_LIMITS).toEqual({ scale: { min: 0.8, max: 1.4 }, opacity: { min: 0.3, max: 1 }, offsetX: { min: 0, max: 1 }, offsetY: { min: 0, max: 1 } });
    expect(VOLUME_LIMITS).toEqual({ master: { min: 0, max: 1 } });
    expect(repairSettings({ touch: { scale: 9, opacity: 9 } }).touch).toEqual(touch({ scale: 1.4, opacity: 1 }));
    expect(repairSettings({ touch: { scale: -3, opacity: 0 } }).touch).toEqual(touch({ scale: 0.8, opacity: 0.3 }));
    expect(repairSettings({ touch: { scale: 1.2, opacity: 0.8 } }).touch).toEqual(touch({ scale: 1.2, opacity: 0.8 }));
    expect(repairSettings({ touch: { offsetX: 4, offsetY: -4 } }).touch).toMatchObject({ offsetX: 1, offsetY: 0 });
    expect(repairSettings({ volume: { master: 3 } }).volume).toEqual({ master: 1 });
    expect(repairSettings({ volume: { master: -1 } }).volume).toEqual({ master: 0 });
    expect(repairSettings({ volume: { master: 0 } }).volume, 'silence is a value, not a missing one').toEqual({ master: 0 });
  });

  it('a value of the wrong type falls back to the default of THAT field, not of the whole', () => {
    const r = repairSettings({ language: 7, touch: { scale: 'big', opacity: 0.5 } });
    expect(r.language).toBeNull();
    expect(r.touch).toEqual(touch({ opacity: 0.5 }));
    expect(repairSettings({ touch: { scale: Number.NaN, opacity: Number.POSITIVE_INFINITY } }).touch).toEqual(touch());
    expect(repairSettings({ volume: { master: 'loud' }, quality: 4, keys: 'WASD', touch: { side: 7, offsetX: 'a' } })).toEqual(defaultSettings());
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
    expect(repairSettings({ language: 'es', volume: 11, extra: { a: 1 } })).toEqual({ ...defaultSettings(), language: 'es' });
  });

  it('the quality is one of the three the screen offers; anything else is the balanced one', () => {
    for (const q of ['auto', 'low', 'high']) expect(repairSettings({ quality: q }).quality).toBe(q);
    for (const bad of ['ultra', 'medium', 'LOW', '', null, 2, {}]) expect(repairSettings({ quality: bad }).quality, String(bad)).toBe('auto');
  });

  it('the side of the touch controls is `left` or `right`; anything else is the side they were designed for', () => {
    expect(repairSettings({ touch: { side: 'left' } }).touch.side).toBe('left');
    expect(repairSettings({ touch: { side: 'right' } }).touch.side).toBe('right');
    for (const bad of ['middle', 'LEFT', '', null, 1]) expect(repairSettings({ touch: { side: bad } }).touch.side, String(bad)).toBe('right');
  });

  it('the keys are repaired as a map of actions: unknown actions, things that are not keys, reserved keys and defaults are dropped, and two actions never share a key', () => {
    expect(repairSettings({ keys: { attack: 'KeyF', dash: 'KeyG' } }).keys).toEqual({ attack: 'KeyF', dash: 'KeyG' });
    expect(repairSettings({ keys: { attack: 'KeyF', fly: 'KeyZ', jump: 'not a key', dash: 'KeyD', interact: 'Escape' } }).keys, 'KeyD is movement').toEqual({ attack: 'KeyF' });
    expect(repairSettings({ keys: { attack: 'KeyJ' } }).keys, 'a default is not an override').toEqual({});
    expect(repairSettings({ keys: { attack: 'KeyF', dash: 'KeyF' } }).keys, 'the later one gives it up').toEqual({ attack: 'KeyF' });
    expect(repairSettings({ keys: { attack: 'KeyK' } }).keys, 'KeyK is the ability\'s: attack goes back to its own').toEqual({});
    for (const bad of [null, [], 'KeyF', 7]) expect(repairSettings({ keys: bad }).keys).toEqual({});
  });
});

describe('parsing what was stored', () => {
  it('a valid value of the current version gives the same settings', () => {
    const s = { version: 2, language: 'es', volume: { master: 0.5 }, quality: 'low', keys: { attack: 'KeyF' }, touch: touch({ scale: 1.1, opacity: 0.6, side: 'left', offsetX: 0.4, offsetY: 0.2 }) };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });

  it('round trip: what is serialised parses back unchanged', () => {
    const s = { ...defaultSettings(), language: 'en', volume: { master: 0 }, quality: 'high' as const, keys: { jump: 'KeyH', down: 'KeyX' }, touch: touch({ scale: 0.9, opacity: 0.4, side: 'left' }) };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('serialising repairs first: a bad value never reaches the storage', () => {
    const text = serializeSettings({ ...defaultSettings(), language: 'es', touch: touch({ scale: 99, opacity: -1 }) } as never);
    expect(JSON.parse(text)).toEqual({ ...defaultSettings(), language: 'es', touch: touch({ scale: 1.4, opacity: 0.3 }) });
  });

  it('what cannot be trusted at all is `null`: not JSON, not an object, no integer version, or a version from a LATER game', () => {
    for (const bad of ['', '{', 'null', '[]', '"es"', '3', '{}', '{"version":"1"}', '{"version":1.5}', '{"version":0}', '{"version":3,"language":"es"}', '{"version":99}']) {
      expect(parseSettings(bad), bad).toBeNull();
    }
  });

  it('a damaged value of a known version is repaired, not refused', () => {
    expect(parseSettings('{"version":2,"language":"fr-CA","touch":{"scale":50},"quality":"max"}')).toEqual({ ...defaultSettings(), touch: touch({ scale: 1.4 }) });
    expect(parseSettings('{"version":1,"language":"fr-CA","touch":{"scale":50}}')).toEqual({ ...defaultSettings(), touch: touch({ scale: 1.4 }) });
  });
});

describe('migrations', () => {
  it('version 1 → 2 (S30): the golden file of version 1 keeps what it held and gets what is new with its defaults', () => {
    expect(Object.keys(SETTINGS_MIGRATIONS)).toEqual(['1']);
    const golden = readFileSync(new URL('./golden/settings.v1.json', import.meta.url), 'utf8');
    expect(JSON.parse(golden).version).toBe(1);
    expect(parseSettings(golden)).toEqual({ version: 2, language: 'es', volume: { master: 0.8 }, quality: 'auto', keys: {}, touch: touch({ scale: 1.2, opacity: 0.8 }) });
  });

  it('a golden file of version 2 pins the current format: every field of every section', () => {
    const golden = readFileSync(new URL('./golden/settings.v2.json', import.meta.url), 'utf8');
    const s = parseSettings(golden);
    expect(s).toEqual({
      version: 2,
      language: 'en',
      volume: { master: 0.35 },
      quality: 'high',
      keys: { attack: 'KeyF', dash: 'KeyG' },
      touch: { scale: 1.2, opacity: 0.8, side: 'left', offsetX: 0.5, offsetY: 0.25 },
    });
    expect(JSON.parse(serializeSettings(s!))).toEqual(JSON.parse(golden)); // and writing it gives the same file
  });

  it('the chain runs step by step, each one upgrading from the version it names', () => {
    const migrations = {
      1: (d: Record<string, unknown>) => ({ ...d, version: 2, accessibility: { shake: 1 } }),
      2: (d: Record<string, unknown>) => ({ ...d, version: 3, language: d['language'] ?? 'en' }),
    };
    // a pretend build whose current version is 3: the stored v1 value goes 1 → 2 → 3, then it is repaired as the CURRENT shape
    const out = parseSettings('{"version":1,"touch":{"scale":1.1,"opacity":0.9}}', migrations, 3);
    expect(out).toEqual({ ...defaultSettings(), language: 'en', touch: touch({ scale: 1.1, opacity: 0.9 }) });
  });

  it('a hole in the chain is `null` (nothing safe can be done), never a guess', () => {
    expect(parseSettings('{"version":1}', { 2: (d) => d }, 3)).toBeNull();
  });
});
