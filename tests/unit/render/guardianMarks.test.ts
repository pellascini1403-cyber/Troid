// @vitest-environment happy-dom
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createActorViewState } from '@/presentation/actorViewState';
import { PALETTE } from '@/presentation/palette';
import { GuardianMarks, type BossMark } from '@/render/GuardianMarks';
import { GuardianView, type GuardianLike } from '@/render/GuardianView';
import { fakeVfxAtlas } from '../../helpers/vfx';

/**
 * THE WARNINGS OF THE BOSS, PAINTED (docs/PROMPT8-LOG.md, phase H): the marks the guardian shows on the floor before its blows land, made of the shapes of the light. The simulation decides when and where (`view.marks`); this
 * only draws them — a rune that lies on the floor and turns, rings that close, a column of light that rises, for the rain; a band, a line and chevrons for the charge.
 */
const shapes = fakeVfxAtlas();
const lit = (m: GuardianMarks): Sprite[] => {
  const out: Sprite[] = [];
  for (const holder of m.root.children as Container[]) if (holder.visible) for (const c of holder.children as Container[]) for (const s of (c.children.length > 0 && !(c instanceof Sprite) ? c.children : [c]) as Sprite[]) if (s.visible) out.push(s);
  return out;
};
const rain = (x: number, t01: number, w = 1.7): BossMark => ({ x, w, t01 });

describe('the warnings of the rain', () => {
  it('a mark is a sigil on the floor, two rings, a disc and a column of light — nothing else, in the violet of the enemy', () => {
    const m = new GuardianMarks(shapes);
    m.update([rain(55, 0.5)], 'rain', -1, -0, 1);
    expect(m.lit).toBe(5);
    const tints = new Set(lit(m).map((s) => s.tint));
    expect([...tints].every((t) => ([PALETTE.violetCore, PALETTE.violetGlow, PALETTE.whiteHot] as number[]).includes(t))).toBe(true);
    expect(lit(m).every((s) => s.blendMode === 'add')).toBe(true);
  });

  it('lies on the floor where the blow will land: at the mark, flattened like a thing seen across the ground', () => {
    const m = new GuardianMarks(shapes);
    m.update([rain(55, 0.3)], 'rain', -1, -2, 0);
    const holder = m.root.children[0] as Container;
    expect(holder.position.x).toBe(55);
    expect(holder.position.y).toBeCloseTo(-2.03, 9);
    const flat = holder.children[0] as Container;
    expect(flat.scale.y).toBeLessThan(0.4);
    expect(flat.scale.y).toBeGreaterThan(0.1);
  });

  it('builds with the blow: brighter and taller as it nears, the white ring closing faster than the violet one, the sigil turning with time', () => {
    const m = new GuardianMarks(shapes);
    const read = (t01: number, time: number) => {
      m.update([rain(55, t01)], 'rain', -1, 0, time);
      const holder = m.root.children[0] as Container;
      const flat = holder.children[0] as Container;
      const [disc, rune, ring, closing] = flat.children as Sprite[];
      const column = holder.children[1] as Sprite;
      return { rune: rune!, ring: ring!, closing: closing!, disc: disc!, column: column!, rotation: rune!.rotation };
    };
    const early = read(0.1, 0);
    const earlyAlpha = early.rune.alpha;
    const earlyColumn = early.column.scale.x;
    const late = read(0.9, 1);
    expect(late.rune.alpha).toBeGreaterThan(earlyAlpha);
    expect(late.column.scale.x).toBeGreaterThan(earlyColumn);
    expect(late.ring.width).toBeLessThan(1.7 * 1.9);
    expect(late.closing.width).toBeLessThan(late.ring.width);
    expect(late.rotation).not.toBe(0);
    // the column stands up: its bright end on the floor, its tail up (the streak turned a quarter of a turn)
    expect(late.column.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(late.column.anchor.x).toBe(1);
  });

  it('shows as many marks as the guardian has (the rain\'s densest phase has four), one holder each, made once and then only moved', () => {
    const m = new GuardianMarks(shapes);
    m.update([rain(50, 0.2), rain(54, 0.4), rain(58, 0.6), rain(62, 0.8), rain(66, 0.9)], 'rain', -1, 0, 0);
    expect(m.lit).toBe(4 * 5); // (a fifth is not shown: four is the most it is ever asked)
    expect(m.root.children).toHaveLength(4);
    const sprites = (m.root.children as Container[]).reduce((n, h) => n + h.children.length, 0);
    for (let i = 0; i < 100; i++) m.update([rain(50 + (i % 5), (i % 10) / 10), rain(54, 0.5)], i % 2 ? 'rain' : 'charge', 1, 0, i / 60);
    expect((m.root.children as Container[]).reduce((n, h) => n + h.children.length, 0)).toBe(sprites);
  });

  it('hides everything when the marks are gone', () => {
    const m = new GuardianMarks(shapes);
    m.update([rain(55, 0.5), rain(58, 0.5)], 'rain', -1, 0, 0);
    expect(m.lit).toBeGreaterThan(0);
    m.update([], 'rain', -1, 0, 0);
    expect(m.lit).toBe(0);
    m.update([rain(55, 0.5)], 'rain', -1, 0, 0);
    expect(m.lit).toBe(5);
  });
});

describe('the lane of the charge', () => {
  it('is a band of light, a bright line along the floor and chevrons that point the way it will slide', () => {
    const m = new GuardianMarks(shapes);
    m.update([{ x: 50, w: 12, t01: 0.5 }], 'charge', -1, 0, 0);
    const n = Math.floor((12 - 0.4 - 0.8) / 1.3) + 1;
    expect(m.lit).toBe(2 + Math.min(8, n));
    const chevrons = lit(m).filter((s) => s.texture === shapes.frames.chevron);
    expect(chevrons).toHaveLength(Math.min(8, n));
    expect(chevrons.every((s) => s.scale.x < 0), 'facing left: the chevrons point left').toBe(true);
    m.update([{ x: 50, w: 12, t01: 0.5 }], 'charge', 1, 0, 0);
    expect(lit(m).filter((s) => s.texture === shapes.frames.chevron).every((s) => s.scale.x > 0), 'facing right: they point right').toBe(true);
  });

  it('brightens as the slide nears', () => {
    const m = new GuardianMarks(shapes);
    const alpha = (t01: number): number => {
      m.update([{ x: 50, w: 12, t01 }], 'charge', 1, 0, 0);
      return lit(m).find((s) => s.texture === shapes.frames.chevron)!.alpha;
    };
    expect(alpha(0.9)).toBeGreaterThan(alpha(0.1));
  });

  it('an attack that is not a charge is a rain: the same marks draw both, by the attack the guardian is making', () => {
    const m = new GuardianMarks(shapes);
    m.update([rain(55, 0.5)], 'charge', 1, 0, 0);
    const asLane = m.lit;
    m.update([rain(55, 0.5)], 'rain', 1, 0, 0);
    expect(m.lit).toBe(5);
    expect(asLane).not.toBe(5);
  });
});

describe('the guardian\'s view draws its warnings with them when it is given the shapes', () => {
  type Writable<T> = { -readonly [K in keyof T]: T[K] };
  interface Fake extends GuardianLike {
    view: Writable<GuardianLike['view']> & { marks: BossMark[] };
  }
  const fake = (patch: Partial<Writable<GuardianLike['view']>> = {}): Fake =>
    ({ body: { halfW: 0.8, height: 2.9 }, view: { ...createActorViewState(), x: 58, y: 0, prevX: 58, prevY: 0, facing: -1, attack: null, marks: [] as BossMark[], enraged: false, awake: true, ...patch } }) as never;

  it('painted: the marks are sprites of the light (and the geometry is not drawn); without the shapes: the geometry, as before', () => {
    const g = fake({ attack: 'rain' });
    g.view.marks.push(rain(52, 0.6));
    const painted = new GuardianView(g, { glow: Texture.EMPTY, marks: shapes });
    painted.sync(1, 0);
    expect(painted.paintedMarks).toBe(5);
    const geometry = painted.root.children.find((c) => c instanceof Graphics) as Graphics;
    expect((geometry as unknown as { context: { instructions: unknown[] } }).context.instructions).toHaveLength(0);

    const plain = new GuardianView(g, { glow: Texture.EMPTY });
    plain.sync(1, 0);
    expect(plain.paintedMarks).toBe(0);
    expect(((plain.root.children[0] as Graphics) as unknown as { context: { instructions: unknown[] } }).context.instructions.length).toBeGreaterThan(0);
  });

  it('shows nothing when the guardian has no marks, and goes away with the guardian', () => {
    const g = fake();
    const v = new GuardianView(g, { glow: Texture.EMPTY, marks: shapes });
    v.sync(1, 0);
    expect(v.paintedMarks).toBe(0);
    g.view.attack = 'rain';
    g.view.marks.push(rain(52, 0.2));
    v.sync(1, 0);
    expect(v.paintedMarks).toBe(5);
    expect(() => v.destroy()).not.toThrow();
  });
});
