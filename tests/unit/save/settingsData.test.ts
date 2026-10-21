import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultSettings, HUD_SCALE_LIMITS, parseSettings, repairSettings, serializeSettings, SETTINGS_MIGRATIONS, SETTINGS_VERSION, TOUCH_BUTTONS, TOUCH_LIMITS, VOLUME_LIMITS } from '@/save/SettingsData';

/**
 * The settings as DATA (docs/ARCHITECTURE-2D.md §11): a version, repairs for whatever a damaged or hand-edited value could be,
 * and a migration chain with a golden file per version so a format change can never silently break the settings of a player.
 * Version 2 (docs/PROMPT6-LOG.md S30) added the volume, the quality profile, the remapped keys and the position of the touch controls; version 3 (docs/PROMPT14-LOG.md) the saved game
 * being played and the accessibility choices; version 4 (docs/PROMPT15-LOG.md) the place and the size of each touch button.
 */
const touch = (over: Record<string, unknown> = {}) => ({ scale: 1, opacity: 1, buttons: {}, ...over });
const BUTTON = (x: number, y: number, scale = 1) => ({ x, y, scale });
/** What a block of buttons on the left, half way in and a quarter of the way up (the golden files of versions 2 and 3) is, button by button, on the reference screen of the design (844 × 390). */
const LEFT_HALF_IN_QUARTER_UP = { attack: BUTTON(0.1437, 0.7076), dash: BUTTON(0.2598, 0.7997), ability: BUTTON(0.2139, 0.6852) };
const ACCESS = { reduceFlashes: false, reduceShake: false, hudScale: 1 } as const;

describe('defaults and repair', () => {
  it('the defaults: no language chosen (follow the device), the volume at 80 %, the balanced quality, no key changed and the touch controls as designed', () => {
    expect(defaultSettings()).toEqual({ version: 4, language: null, volume: { master: 0.8 }, quality: 'auto', keys: {}, touch: touch(), slot: 1, accessibility: ACCESS });
    expect(SETTINGS_VERSION).toBe(4);
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

  it('numbers are clamped to what the settings screen offers (80–140 % size, 30–100 % opacity, one button 70–150 % on its own, the position and the volume 0–1)', () => {
    expect(TOUCH_LIMITS).toEqual({ scale: { min: 0.8, max: 1.4 }, opacity: { min: 0.3, max: 1 }, position: { min: 0, max: 1 }, button: { min: 0.7, max: 1.5 } });
    expect(VOLUME_LIMITS).toEqual({ master: { min: 0, max: 1 } });
    expect(repairSettings({ touch: { scale: 9, opacity: 9 } }).touch).toEqual(touch({ scale: 1.4, opacity: 1 }));
    expect(repairSettings({ touch: { scale: -3, opacity: 0 } }).touch).toEqual(touch({ scale: 0.8, opacity: 0.3 }));
    expect(repairSettings({ touch: { scale: 1.2, opacity: 0.8 } }).touch).toEqual(touch({ scale: 1.2, opacity: 0.8 }));
    expect(repairSettings({ volume: { master: 3 } }).volume).toEqual({ master: 1 });
    expect(repairSettings({ volume: { master: -1 } }).volume).toEqual({ master: 0 });
    expect(repairSettings({ volume: { master: 0 } }).volume, 'silence is a value, not a missing one').toEqual({ master: 0 });
  });

  it('the saved game is a slot that exists (1 … 3); anything else is the first, so a settings file a person edited cannot point the game at a place there is not', () => {
    for (const slot of [1, 2, 3]) expect(repairSettings({ slot }).slot).toBe(slot);
    for (const bad of [0, 4, -1, 2.5, '2', null, Number.NaN, {}]) expect(repairSettings({ slot: bad }).slot, String(bad)).toBe(1);
  });

  it('the accessibility choices: a flag is on only when it is exactly `true`, and the size of the HUD is held to what the screen offers (85–135 %)', () => {
    expect(HUD_SCALE_LIMITS).toEqual({ min: 0.85, max: 1.35 });
    expect(repairSettings({ accessibility: { reduceFlashes: true, reduceShake: true, hudScale: 1.2 } }).accessibility).toEqual({ reduceFlashes: true, reduceShake: true, hudScale: 1.2 });
    for (const bad of ['true', 1, 'yes', null, [], {}]) expect(repairSettings({ accessibility: { reduceFlashes: bad, reduceShake: bad } }).accessibility, String(bad)).toEqual(ACCESS);
    expect(repairSettings({ accessibility: { hudScale: 9 } }).accessibility.hudScale).toBe(1.35);
    expect(repairSettings({ accessibility: { hudScale: 0.1 } }).accessibility.hudScale).toBe(0.85);
    expect(repairSettings({ accessibility: { hudScale: 'big' } }).accessibility.hudScale).toBe(1);
    for (const bad of [null, 7, 'a', []]) expect(repairSettings({ accessibility: bad }).accessibility).toEqual(ACCESS);
  });

  it('a value of the wrong type falls back to the default of THAT field, not of the whole', () => {
    const r = repairSettings({ language: 7, touch: { scale: 'big', opacity: 0.5 } });
    expect(r.language).toBeNull();
    expect(r.touch).toEqual(touch({ opacity: 0.5 }));
    expect(repairSettings({ touch: { scale: Number.NaN, opacity: Number.POSITIVE_INFINITY } }).touch).toEqual(touch());
    expect(repairSettings({ volume: { master: 'loud' }, quality: 4, keys: 'WASD', touch: { buttons: 7, side: 7, offsetX: 'a' } })).toEqual(defaultSettings());
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

  it('the buttons the player placed: only the three that exist, each with a finite place inside the safe area (a fraction) and a size inside its limits; a button without a place is simply not placed', () => {
    expect(TOUCH_BUTTONS).toEqual(['attack', 'dash', 'ability']);
    const ok = { attack: BUTTON(0.8, 0.7, 1.2), dash: BUTTON(0.2, 0.5), ability: BUTTON(0.5, 0.1, 0.7) };
    expect(repairSettings({ touch: { buttons: ok } }).touch.buttons).toEqual(ok);
    // out-of-range places and sizes are held to the limits
    expect(repairSettings({ touch: { buttons: { attack: { x: 7, y: -2, scale: 9 }, dash: { x: 0.5, y: 0.5, scale: 0 } } } }).touch.buttons).toEqual({ attack: BUTTON(1, 0, 1.5), dash: BUTTON(0.5, 0.5, 0.7) });
    // a missing or wrong size is the design's; a wrong place drops the button (it goes back to where the design has it)
    expect(repairSettings({ touch: { buttons: { attack: { x: 0.5, y: 0.5 }, dash: { x: 0.5, y: 0.5, scale: 'big' } } } }).touch.buttons).toEqual({ attack: BUTTON(0.5, 0.5), dash: BUTTON(0.5, 0.5) });
    for (const bad of [{ x: 'a', y: 0.5 }, { x: 0.5 }, { x: Number.NaN, y: 0.2 }, { x: 0.1, y: Number.POSITIVE_INFINITY }, null, 7, 'x', []]) {
      expect(repairSettings({ touch: { buttons: { attack: bad, dash: BUTTON(0.3, 0.3) } } }).touch.buttons, JSON.stringify(bad)).toEqual({ dash: BUTTON(0.3, 0.3) });
    }
    // buttons that do not exist are dropped (the bottle chip is not one the player places), and so is anything that is not a map
    expect(repairSettings({ touch: { buttons: { chip: BUTTON(0.5, 0.5), jump: BUTTON(0.5, 0.5), attack: BUTTON(0.4, 0.4) } } }).touch.buttons).toEqual({ attack: BUTTON(0.4, 0.4) });
    for (const bad of [null, 7, 'attack', []]) expect(repairSettings({ touch: { buttons: bad } }).touch.buttons, String(bad)).toEqual({});
  });

  it('places are kept to four decimals (a tenth of a pixel on any screen) and in a fixed order, so the same settings are always the same text', () => {
    const r = repairSettings({ touch: { buttons: { ability: { x: 0.123456789, y: 0.987654321, scale: 1.23456 }, attack: BUTTON(0.5, 0.5) } } });
    expect(r.touch.buttons.ability).toEqual({ x: 0.1235, y: 0.9877, scale: 1.2346 });
    expect(Object.keys(r.touch.buttons)).toEqual(['attack', 'ability']);
    expect(serializeSettings(r)).toBe(serializeSettings(repairSettings(JSON.parse(serializeSettings(r)))));
  });

  it('the old side and offsets are gone from the current format: they are not kept, and they do not make a button', () => {
    const r = repairSettings({ touch: { side: 'left', offsetX: 1, offsetY: 1 } });
    expect(r.touch).toEqual(touch());
    expect('side' in r.touch || 'offsetX' in r.touch || 'offsetY' in r.touch).toBe(false);
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
    const s = { version: 4, language: 'es', volume: { master: 0.5 }, quality: 'low', keys: { attack: 'KeyF' }, touch: touch({ scale: 1.1, opacity: 0.6, buttons: { attack: BUTTON(0.15, 0.7, 1.2), dash: BUTTON(0.3, 0.8) } }), slot: 3, accessibility: { reduceFlashes: true, reduceShake: false, hudScale: 1.1 } };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });

  it('round trip: what is serialised parses back unchanged', () => {
    const s = { ...defaultSettings(), language: 'en', volume: { master: 0 }, quality: 'high' as const, keys: { jump: 'KeyH', down: 'KeyX' }, touch: touch({ scale: 0.9, opacity: 0.4, buttons: { ability: BUTTON(0.9, 0.2, 1.5) } }) };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('serialising repairs first: a bad value never reaches the storage', () => {
    const text = serializeSettings({ ...defaultSettings(), language: 'es', touch: touch({ scale: 99, opacity: -1 }) } as never);
    expect(JSON.parse(text)).toEqual({ ...defaultSettings(), language: 'es', touch: touch({ scale: 1.4, opacity: 0.3 }) });
  });

  it('what cannot be trusted at all is `null`: not JSON, not an object, no integer version, or a version from a LATER game', () => {
    for (const bad of ['', '{', 'null', '[]', '"es"', '3', '{}', '{"version":"1"}', '{"version":1.5}', '{"version":0}', '{"version":5,"language":"es"}', '{"version":99}']) {
      expect(parseSettings(bad), bad).toBeNull();
    }
  });

  it('a damaged value of a known version is repaired, not refused', () => {
    expect(parseSettings('{"version":2,"language":"fr-CA","touch":{"scale":50},"quality":"max"}')).toEqual({ ...defaultSettings(), touch: touch({ scale: 1.4 }) });
    expect(parseSettings('{"version":1,"language":"fr-CA","touch":{"scale":50}}')).toEqual({ ...defaultSettings(), touch: touch({ scale: 1.4 }) });
  });
});

describe('migrations', () => {
  it('version 1 → 2 (S30) → 3 → 4: the golden file of version 1 keeps what it held and gets everything new with its defaults', () => {
    expect(Object.keys(SETTINGS_MIGRATIONS)).toEqual(['1', '2', '3']);
    const golden = readFileSync(new URL('./golden/settings.v1.json', import.meta.url), 'utf8');
    expect(JSON.parse(golden).version).toBe(1);
    expect(parseSettings(golden)).toEqual({ version: 4, language: 'es', volume: { master: 0.8 }, quality: 'auto', keys: {}, touch: touch({ scale: 1.2, opacity: 0.8 }), slot: 1, accessibility: ACCESS });
  });

  it('version 2 → 3 → 4: the golden file of version 2 keeps every field it held; the game it was playing is the first slot (where every save made so far lives), no accessibility choice is on, and its block of buttons (the left, half way in, a quarter up) is the place of each button', () => {
    const golden = readFileSync(new URL('./golden/settings.v2.json', import.meta.url), 'utf8');
    expect(JSON.parse(golden).version).toBe(2);
    expect(parseSettings(golden)).toEqual({
      version: 4,
      language: 'en',
      volume: { master: 0.35 },
      quality: 'high',
      keys: { attack: 'KeyF', dash: 'KeyG' },
      touch: touch({ scale: 1.2, opacity: 0.8, buttons: LEFT_HALF_IN_QUARTER_UP }),
      slot: 1,
      accessibility: ACCESS,
    });
  });

  it('version 3 → 4 (docs/PROMPT15-LOG.md): the golden file of version 3 keeps every field; its block of buttons becomes the place of each of the three, worked out on the reference screen of the design', () => {
    const golden = readFileSync(new URL('./golden/settings.v3.json', import.meta.url), 'utf8');
    expect(JSON.parse(golden).version).toBe(3);
    expect(parseSettings(golden)).toEqual({
      version: 4,
      language: 'en',
      volume: { master: 0.35 },
      quality: 'high',
      keys: { attack: 'KeyF', dash: 'KeyG' },
      touch: touch({ scale: 1.2, opacity: 0.8, buttons: LEFT_HALF_IN_QUARTER_UP }),
      slot: 2,
      accessibility: { reduceFlashes: true, reduceShake: true, hudScale: 1.2 },
    });
  });

  it('a block of buttons that was never moved (the right, no offset) stays where the design has it: no button is placed, so each keeps following the corner of the screen', () => {
    for (const t of [{ scale: 1.1, opacity: 0.9, side: 'right', offsetX: 0, offsetY: 0 }, { scale: 1.1, opacity: 0.9 }, { side: 'right', offsetX: 'a', offsetY: null }]) {
      expect(parseSettings(JSON.stringify({ version: 3, touch: t }))?.touch.buttons, JSON.stringify(t)).toEqual({});
    }
  });

  it('the block as it was becomes three buttons on the same side, in and up as it was moved — and never outside the screen, whatever the old numbers said', () => {
    const migrate = (side: string, offsetX: number, offsetY: number) => parseSettings(JSON.stringify({ version: 3, touch: { scale: 1, opacity: 1, side, offsetX, offsetY } }))!.touch.buttons;
    const right = migrate('right', 1, 1);
    const left = migrate('left', 0, 0);
    for (const id of TOUCH_BUTTONS) {
      expect(right[id]!.x, `right, in: ${id} is on the right half still, but nearer the middle than the design`).toBeLessThan(0.95);
      expect(right[id]!.x).toBeGreaterThan(0.5);
      expect(left[id]!.x, `left: ${id} is on the left half`).toBeLessThan(0.5);
      expect(left[id]!.y, `left, not raised: ${id} is as low as the design's`).toBeGreaterThan(0.6);
      expect(right[id]!.scale).toBe(1);
    }
    // the mirror image: what was 0.15 from the right edge is 0.15 from the left one
    expect(left.attack!.x).toBeCloseTo(1 - migrate('right', 0, 1).attack!.x, 3);
    // an old value that was not a number is the design's
    expect(parseSettings(JSON.stringify({ version: 3, touch: { side: 'left', offsetX: 'x', offsetY: null } }))!.touch.buttons.attack!.x).toBeLessThan(0.2);
    for (const bad of [Number.NaN, 1e9, -5]) expect(Object.values(migrate('left', bad, bad)).every((b) => b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1), String(bad)).toBe(true);
  });

  it('a golden file of version 4 pins the current format: every field of every section, the buttons the player placed with them', () => {
    const golden = readFileSync(new URL('./golden/settings.v4.json', import.meta.url), 'utf8');
    const s = parseSettings(golden);
    expect(s).toEqual({
      version: 4,
      language: 'es',
      volume: { master: 0.6 },
      quality: 'low',
      keys: { jump: 'KeyH' },
      touch: { scale: 1.1, opacity: 0.7, buttons: { attack: BUTTON(0.12, 0.74, 1.25), dash: BUTTON(0.27, 0.84), ability: BUTTON(0.2, 0.62, 0.8) } },
      slot: 3,
      accessibility: { reduceFlashes: false, reduceShake: true, hudScale: 1.1 },
    });
    expect(JSON.parse(serializeSettings(s!))).toEqual(JSON.parse(golden)); // and writing it gives the same file
    expect(serializeSettings(s!)).toBe(golden.trim());
  });

  it('the chain runs step by step, each one upgrading from the version it names', () => {
    const migrations = {
      1: (d: Record<string, unknown>) => ({ ...d, version: 2, accessibility: { shake: 1 } }),
      2: (d: Record<string, unknown>) => ({ ...d, version: 3, language: d['language'] ?? 'en' }),
      3: (d: Record<string, unknown>) => ({ ...d, version: 4 }),
    };
    // a pretend build whose current version is 4: the stored v1 value goes 1 → 2 → 3 → 4, then it is repaired as the CURRENT shape
    const out = parseSettings('{"version":1,"touch":{"scale":1.1,"opacity":0.9}}', migrations, 4);
    expect(out).toEqual({ ...defaultSettings(), language: 'en', touch: touch({ scale: 1.1, opacity: 0.9 }) });
  });

  it('a hole in the chain is `null` (nothing safe can be done), never a guess', () => {
    expect(parseSettings('{"version":1}', { 2: (d) => d }, 3)).toBeNull();
  });
});
