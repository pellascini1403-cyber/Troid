// @vitest-environment happy-dom
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LIGHT_PULSES } from '@/content/lights';
import { LightBook, type LightKind, type LightPulse } from '@/presentation/lighting';
import { PALETTE } from '@/presentation/palette';
import { LightField } from '@/vfx/LightField';
import { fakeVfxAtlas } from '../../helpers/vfx';

/**
 * THE LIGHTS OF THE WORLD, drawn (docs/PROMPT8-LOG.md, phase I): the pool of soft sprites behind the actors — they ease in and out, a source that goes frees its place, there are never more than the profile allows,
 * the pulses of a moment run their own life, and none of it allocates once it has started.
 */
const atlas = fakeVfxAtlas();
const book = (...lights: Array<[string, LightKind, number, number?, number?]>): LightBook => {
  const b = new LightBook(8);
  b.begin();
  for (const [key, kind, intensity, x = 0, y = 0] of lights) b.add(key, kind, { slot: kind === 'foe' || kind === 'boss' ? 'enemy' : 'energy', radius: 3, squash: kind === 'floor' ? 0.2 : 1, rank: 0 }, x, y, intensity);
  b.end();
  return b;
};
const make = (capacity = 4, pulses = 2): { field: LightField; layer: Container } => {
  const layer = new Container();
  return { field: new LightField(layer, atlas, capacity, pulses), layer };
};
const sprites = (f: LightField) => f.root.children as import('pixi.js').Sprite[];

describe('the field of lights', () => {
  it('is a pool of additive sprites in the layer it is given, made once and all hidden at first', () => {
    const { field, layer } = make(4, 2);
    expect(layer.children).toContain(field.root);
    expect(sprites(field)).toHaveLength(6);
    for (const s of sprites(field)) {
      expect(s.blendMode).toBe('add');
      expect(s.visible).toBe(false);
    }
    expect(field.stats.lit).toBe(0);
  });

  it('puts a light where it is, as big as it says, in the colour of its slot — and eases up to its strength instead of popping', () => {
    const { field } = make();
    const b = book(['hero', 'hero', 0.3, 4, -1]);
    field.update(1 / 60, b);
    const s = sprites(field)[0]!;
    expect(s.position.x).toBe(4);
    expect(s.position.y).toBe(-1);
    expect(s.scale.x).toBeCloseTo((2 * 3) / atlas.widthPx.glow, 9);
    expect(s.tint).toBe(PALETTE.energyCore);
    const first = s.alpha;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.3);
    for (let i = 0; i < 90; i++) field.update(1 / 60, b);
    expect(s.alpha).toBeCloseTo(0.3, 2);
    expect(s.visible).toBe(true);
  });

  it('a light of the enemy is violet, and a flat one is squashed', () => {
    const { field } = make();
    field.update(0, book(['foe:a', 'foe', 0.2, 0, 0], ['floor', 'floor', 0.2, 0, 0]));
    const [a, b] = sprites(field);
    expect(a!.tint).toBe(PALETTE.violetCore);
    expect(b!.scale.y).toBeCloseTo(b!.scale.x * 0.2 * (atlas.widthPx.glow / atlas.heightPx.glow), 9);
  });

  it('follows its source: the same key moves the same sprite (nothing is made when a light only moves)', () => {
    const { field } = make();
    for (let i = 0; i < 5; i++) field.update(1 / 60, book(['bolt:b1', 'bolt', 0.5, i, 0]));
    const lit = sprites(field).filter((s) => s.visible);
    expect(lit).toHaveLength(1);
    expect(lit[0]!.position.x).toBe(4);
    expect(field.stats.lights.map((l) => l.key)).toEqual(['bolt:b1']);
  });

  it('a light nobody asks for any more fades out and then frees its place', () => {
    const { field } = make(2, 0);
    for (let i = 0; i < 60; i++) field.update(1 / 60, book(['bolt:b1', 'bolt', 0.5], ['hero', 'hero', 0.3]));
    expect(field.stats.lit).toBe(2);
    // the bolt is gone: its light eases down (a third of a second to be mostly out), it does not vanish between two frames
    field.update(1 / 60, book(['hero', 'hero', 0.3]));
    const bolt = field.stats.lights.find((l) => l.key === 'bolt:b1');
    expect(bolt).toBeDefined();
    expect(bolt!.level).toBeGreaterThan(0.3);
    for (let i = 0; i < 180; i++) field.update(1 / 60, book(['hero', 'hero', 0.3]));
    expect(field.stats.lights.map((l) => l.key)).toEqual(['hero']);
    // …and its place is free for the next one
    field.update(1 / 60, book(['hero', 'hero', 0.3], ['bolt:b2', 'bolt', 0.5]));
    expect(field.stats.lights.map((l) => l.key).sort()).toEqual(['bolt:b2', 'hero']);
  });

  it('never draws more lights than it has places: a new one takes the place of the dimmest that nobody asks for', () => {
    const { field } = make(2, 0);
    for (let i = 0; i < 60; i++) field.update(1 / 60, book(['a', 'foe', 0.4], ['b', 'foe', 0.1]));
    // two new ones arrive and the old ones are not asked for: they go, the newcomers come (the dimmest first)
    field.update(1 / 60, book(['c', 'bolt', 0.5], ['d', 'boss', 0.4]));
    const keys = field.stats.lights.map((l) => l.key);
    expect(keys.length).toBeLessThanOrEqual(2);
    expect(keys).toContain('c');
    expect(sprites(field).filter((s) => s.visible).length).toBeLessThanOrEqual(2);
  });

  it('with no time passing (a tool paused the effects) the light is AT what it is asked, at once: a paused picture is what the light is, not a light on its way to it', () => {
    const { field } = make();
    const b = book(['hero', 'hero', 0.3]);
    field.update(0, b);
    expect(sprites(field)[0]!.alpha).toBeCloseTo(0.3, 9);
    expect(sprites(field)[0]!.visible).toBe(true);
    expect(field.stats.total).toBeCloseTo(0.3, 9);
    // and it follows what it is asked from frame to frame, still without time
    field.update(0, book(['hero', 'hero', 0.1]));
    expect(sprites(field)[0]!.alpha).toBeCloseTo(0.1, 9);
    // a light nobody asks for goes out at once too, and frees its place
    field.update(0, book());
    expect(field.stats.lit).toBe(0);
  });

  it('can be settled by hand: every light at its strength, nothing to fade in from', () => {
    const { field } = make();
    const b = book(['hero', 'hero', 0.3]);
    field.update(1 / 600, b);
    expect(sprites(field)[0]!.alpha).toBeLessThan(0.3);
    field.settle();
    expect(sprites(field)[0]!.alpha).toBeCloseTo(0.3, 9);
  });

  it('puts every light out when a room is left', () => {
    const { field } = make();
    field.update(1, book(['hero', 'hero', 0.3], ['bolt:x', 'bolt', 0.5]));
    field.settle();
    field.pulse(LIGHT_PULSES.hitLanded![0]!, 1, 1);
    field.update(0.05, book(['hero', 'hero', 0.3]));
    expect(field.stats.lit).toBeGreaterThan(0);
    field.clear();
    expect(field.stats.lit).toBe(0);
    expect(field.stats.pulses).toBe(0);
    expect(sprites(field).every((s) => !s.visible)).toBe(true);
  });

  it('can be destroyed with its sprites', () => {
    const { field } = make();
    expect(() => field.destroy()).not.toThrow();
  });
});

describe('the pulses of a moment', () => {
  const p: LightPulse = { slot: 'energy', radius: 4, peak: 0.5, life: 0.5, rise: 0.2 };

  it('are born where the moment happened, swell, peak and go out on their own', () => {
    const { field } = make(2, 2);
    field.pulse(p, 7, -2);
    const s = sprites(field)[2]!; // the pulses are the sprites after the lights that follow something
    expect(s.position.x).toBe(7);
    expect(s.position.y).toBe(-2);
    expect(s.scale.x).toBeCloseTo((2 * 4) / atlas.widthPx.glow, 9);
    expect(s.tint).toBe(PALETTE.energyCore);
    expect(field.stats.pulses).toBe(1);
    field.update(0.1, book()); // the peak is at a fifth of its life
    expect(s.alpha).toBeCloseTo(0.5, 9);
    expect(s.visible).toBe(true);
    field.update(0.2, book());
    expect(s.alpha).toBeLessThan(0.5);
    field.update(0.3, book());
    expect(s.visible).toBe(false);
    expect(field.stats.pulses).toBe(0);
  });

  it('wait while the game is paused (no time passes for them either)', () => {
    const { field } = make(2, 2);
    field.pulse(p, 0, 0);
    for (let i = 0; i < 20; i++) field.update(0, book());
    expect(field.stats.pulses).toBe(1);
    expect(sprites(field)[2]!.visible).toBe(false); // born, not yet lit
  });

  it('the newest takes the place of the one that has least life left when there is no room', () => {
    const { field } = make(1, 2);
    field.pulse({ ...p, life: 1 }, 1, 0);
    field.update(0.9, book()); // the first has a tenth of a second left
    field.pulse({ ...p, life: 1 }, 2, 0);
    field.update(0.001, book());
    field.pulse({ ...p, life: 1 }, 3, 0); // no room: it takes the older one's place (the first, nearly out)
    const xs = sprites(field).slice(1).map((s) => s.position.x).sort();
    expect(xs).toEqual([2, 3]);
    expect(field.stats.pulses).toBe(2);
  });

  it('count in the stats with their own capacity, apart from the lights that follow something', () => {
    const { field } = make(3, 4);
    field.pulse(p, 0, 0);
    field.update(0.1, book(['hero', 'hero', 0.3]));
    const st = field.stats;
    expect(st.capacity).toBe(3);
    expect(st.pulseCapacity).toBe(4);
    expect(st.pulses).toBe(1);
    expect(st.lights.some((l) => l.kind === 'pulse')).toBe(true);
  });

  it('a field made with no room for pulses simply has none', () => {
    const { field } = make(2, 0);
    expect(() => field.pulse(p, 0, 0)).not.toThrow();
    expect(field.stats.pulses).toBe(0);
  });
});
