import { describe, expect, it } from 'vitest';
import { VFX_SEQUENCE_NAMES, VFX_SHAPE_NAMES, hasEveryShape, readVfxTags, vfxArtIssues, vfxCoverageIssues, vfxParts, type VfxShapeName } from '@/presentation/vfxArt';
import { bossArtIssues } from '@/presentation/bossArt';
import { enemyArtIssues } from '@/presentation/enemyArt';

/**
 * THE ART OF THE LIGHT (docs/PROMPT8-LOG.md, phase H): the particles and the flashes of the effects are made of ten SHAPES (white masks the game tints with the colour of the palette slot), and a few effects play a SEQUENCE of
 * frames over their life. A sprite set says which with two tags; the game uses the art's shapes only when it has all ten (a pack is never half-painted) and plays a sequence only if it is there.
 */
const sprite = (id: string, tags: string[], idle = 1, atlases?: string[]) => ({ id, tags, clips: { idle: { frames: `${id}_`, count: idle } }, ...(atlases ? { atlases } : {}) });
const shapes = (page = 'main') => VFX_SHAPE_NAMES.map((n) => sprite(`shape_${n}`, ['vfx:shape', `shape:${n}`], 1, [page]));
const sequences = () => VFX_SEQUENCE_NAMES.map((n) => sprite(`seq_${n}`, ['vfx:seq', `seq:${n}`], 6));
const pack = (id: string, sprites: ReturnType<typeof sprite>[]) => ({ id, status: 'provisional' as const, sprites: sprites as never });

describe('readVfxTags', () => {
  it('reads whether a sprite set is a shape or a sequence and which', () => {
    expect(readVfxTags(['vfx:shape', 'shape:glow', 'blend:add'])).toEqual({ kind: 'shape', name: 'glow', problems: [] });
    expect(readVfxTags(['vfx:seq', 'seq:slash_body'])).toEqual({ kind: 'seq', name: 'slash_body', problems: [] });
    expect(readVfxTags(['role:decor', 'part:body'])).toEqual({ kind: null, name: null, problems: [] });
  });

  it('says what is wrong with a tag, without throwing', () => {
    expect(readVfxTags(['vfx:shape', 'vfx:seq']).problems.join(' ')).toMatch(/both/);
    expect(readVfxTags(['vfx:shape']).problems.join(' ')).toMatch(/says no "shape:<name>"/);
    expect(readVfxTags(['vfx:seq']).problems.join(' ')).toMatch(/says no "seq:<name>"/);
    expect(readVfxTags(['vfx:shape', 'shape:glow', 'shape:ring']).problems.join(' ')).toMatch(/names 2 shapes/);
    expect(readVfxTags(['vfx:seq', 'seq:slash_body', 'seq:impact']).problems.join(' ')).toMatch(/names 2 sequences/);
    expect(readVfxTags(['vfx:shape', 'shape:flame']).problems.join(' ')).toMatch(/not a shape of the game/);
    expect(readVfxTags(['vfx:seq', 'seq:flame']).problems.join(' ')).toMatch(/not a sequence of the game/);
    expect(readVfxTags(['vfx:shape', 'shape:flame']).name).toBeNull();
  });

  it('is not confused with a boss, an enemy or the scenery: each reader looks only at the sets that name its own kind', () => {
    expect(bossArtIssues(pack('vfx-shapes', [...shapes(), ...sequences()]))).toEqual([]);
    expect(enemyArtIssues(pack('vfx-shapes', [...shapes(), ...sequences()]))).toEqual([]);
    expect(readVfxTags(['boss:ink_warden', 'part:crest'])).toEqual({ kind: null, name: null, problems: [] });
    expect(readVfxTags(['enemy:ink_slime', 'part:eyes'])).toEqual({ kind: null, name: null, problems: [] });
  });
});

describe('vfxParts', () => {
  it('groups the shapes and the sequences, the first set that claims a name keeping it', () => {
    const parts = vfxParts([...shapes(), ...sequences(), sprite('shape_glow_two', ['vfx:shape', 'shape:glow']), sprite('other', ['role:decor'])]);
    expect([...parts.shapes.keys()].sort()).toEqual([...VFX_SHAPE_NAMES].sort());
    expect([...parts.sequences.keys()].sort()).toEqual([...VFX_SEQUENCE_NAMES].sort());
    expect(parts.shapes.get('glow')).toBe('shape_glow');
  });

  it('hasEveryShape asks for all ten', () => {
    const all = vfxParts(shapes()).shapes;
    expect(hasEveryShape(all)).toBe(true);
    const part = new Map<VfxShapeName, string>(all);
    part.delete('rune');
    expect(hasEveryShape(part)).toBe(false);
  });
});

describe('vfxArtIssues', () => {
  it('has nothing to say of the whole light', () => {
    expect(vfxArtIssues(pack('vfx-shapes', shapes()))).toEqual([]);
    expect(vfxArtIssues(pack('vfx-flipbooks', sequences()))).toEqual([]);
  });

  it('is an error for what cannot be drawn: a tag that names nothing, a picture with no idle clip', () => {
    const bad = vfxArtIssues(pack('vfx-shapes', [sprite('a', ['vfx:shape']), sprite('b', ['vfx:shape', 'shape:glow'], 0)]));
    expect(bad.filter((i) => i.level === 'error').map((i) => i.path).sort()).toEqual(['sprites.a', 'sprites.b']);
  });

  it('is a warning for what the game covers with its own: a shape of several frames, a sequence of one, a name claimed twice, the shapes on several pages', () => {
    const issues = vfxArtIssues(pack('vfx-shapes', [
      sprite('glow', ['vfx:shape', 'shape:glow'], 3, ['a']),
      sprite('glow_two', ['vfx:shape', 'shape:glow'], 1, ['b']),
      sprite('still', ['vfx:seq', 'seq:impact'], 1),
    ]));
    expect(issues.every((i) => i.level === 'warn')).toBe(true);
    const text = issues.map((i) => i.message).join('\n');
    expect(text).toMatch(/after the first are never drawn/);
    expect(text).toMatch(/claims the same shape as glow/);
    expect(text).toMatch(/sequence of one frame/);
    expect(text).toMatch(/2 pages of the atlas/);
  });

  it('says nothing of a pack that is still awaiting its art', () => {
    expect(vfxArtIssues({ id: 'vfx-shapes', status: 'awaiting-art', sprites: [sprite('a', ['vfx:shape']) as never] })).toEqual([]);
  });
});

describe('vfxCoverageIssues', () => {
  it('has nothing to say when the packs together have every shape and every sequence', () => {
    expect(vfxCoverageIssues([pack('vfx-shapes', shapes()), pack('vfx-flipbooks', sequences())])).toEqual([]);
  });

  it('says what the shapes lack, and that the game draws all of its own until it has every one', () => {
    const issues = vfxCoverageIssues([pack('vfx-shapes', shapes().filter((s) => s.id !== 'shape_rune' && s.id !== 'shape_arc'))]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe('warn');
    expect(issues[0]!.message).toMatch(/lacks the shapes rune, arc/);
  });

  it('says which sequences are lacking when there are some, and nothing when there are none (the effects have their other layers)', () => {
    const some = vfxCoverageIssues([pack('vfx-flipbooks', sequences().slice(0, 3))]);
    expect(some).toHaveLength(1);
    expect(some[0]!.message).toMatch(/lacks the sequences/);
    expect(some[0]!.message).toMatch(/go without that layer/);
    expect(vfxCoverageIssues([])).toEqual([]);
  });

  it('skips a pack that is awaiting its art', () => {
    expect(vfxCoverageIssues([{ id: 'vfx-shapes', status: 'awaiting-art', sprites: shapes() as never }])).toEqual([]);
  });
});
