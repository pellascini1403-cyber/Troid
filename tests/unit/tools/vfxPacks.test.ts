import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VFX_FLIPBOOKS, VFX_PACKS, VFX_SHAPES } from '../../../tools/art/packs/vfx';
import { VFX } from '@/content/vfx';
import { parseArtPack, parseArtIndex } from '@/presentation/artManifest';
import { VFX_SEQUENCE_NAMES, VFX_SHAPE_NAMES, vfxArtIssues, vfxCoverageIssues, vfxParts } from '@/presentation/vfxArt';

/**
 * THE PACKS OF THE LIGHT (tools/art/packs/vfx.ts, docs/PROMPT8-LOG.md phase H): what the painter paints is what the game asks of it — every shape and every sequence the game names is a sprite set of a pack that boots with
 * the game; the pivots and the frame counts are the ones the effects are tuned against; and what ships is a valid art folder with nothing to say about the light.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = <T,>(...path: string[]): T => JSON.parse(readFileSync(join(root, ...path), 'utf8')) as T;
const sprites = (spec: typeof VFX_SHAPES) => spec.sprites.map((s) => ({ id: s.id, tags: s.tags }));

describe('the packs of the light, as the painter declares them', () => {
  it('are two packs of the `vfx` category that boot with the game and need no zone', () => {
    expect(VFX_PACKS.map((p) => p.id)).toEqual(['vfx-shapes', 'vfx-flipbooks']);
    for (const p of VFX_PACKS) {
      expect(p.category, p.id).toBe('vfx');
      expect(p.load, p.id).toBe('boot');
      expect(p.zones, p.id).toEqual([]);
    }
  });

  it('paint every shape the game names, and every sequence — and nothing the game does not know', () => {
    const shapes = vfxParts(sprites(VFX_SHAPES));
    const sequences = vfxParts(sprites(VFX_FLIPBOOKS));
    expect([...shapes.shapes.keys()].sort()).toEqual([...VFX_SHAPE_NAMES].sort());
    expect(shapes.sequences.size).toBe(0);
    expect([...sequences.sequences.keys()].sort()).toEqual([...VFX_SEQUENCE_NAMES].sort());
    expect(sequences.shapes.size).toBe(0);
    expect(vfxCoverageIssues([{ id: 'vfx-shapes', status: 'provisional', sprites: sprites(VFX_SHAPES) as never }, { id: 'vfx-flipbooks', status: 'provisional', sprites: sprites(VFX_FLIPBOOKS) as never }])).toEqual([]);
  });

  it('give every sequence the frame count and the pivot the effects are tuned against', () => {
    const seq = (name: string) => VFX_FLIPBOOKS.sprites.find((s) => s.id === `seq_${name}`)!;
    // the cut of the sword is held where its blade crosses the blow: the pivot of the old crescent's texture was (0.63, 0.5)
    expect(seq('slash_body').pivot).toEqual(seq('slash_edge').pivot);
    expect(seq('slash_body').pivot).toEqual([0.62, 0.5]);
    expect(seq('slash_body').cols).toBe(seq('slash_edge').cols);
    // the body and the heart of the bolt are one animation: the same frames, the same pivot (its head)
    expect([seq('bolt_body').cols, seq('bolt_body').pivot]).toEqual([seq('bolt_core').cols, seq('bolt_core').pivot]);
    expect(seq('bolt_body').pivot).toEqual([0.66, 0.5]);
    // what stands on the floor stands on its bottom edge
    for (const n of ['ink_column', 'ink_column_glow', 'pillar', 'aura']) expect(seq(n).pivot, n).toEqual([0.5, 1]);
    // the body of the ink and its rim are two layers of one burst: the same number of frames
    expect(seq('ink_splash').cols).toBe(seq('ink_splash_gloss').cols);
    expect(seq('ink_column').cols).toBe(seq('ink_column_glow').cols);
    // the ink is drawn over the world (normal blend), the light added
    expect(seq('ink_splash').tags).toContain('blend:normal');
    expect(seq('ink_column').tags).toContain('blend:normal');
    expect(seq('slash_body').tags).toContain('blend:add');
  });

  it('agree with the effects that play them: the blend of a flipbook is the blend its picture is painted for', () => {
    const blendOf = (name: string): string => (VFX_FLIPBOOKS.sprites.find((s) => s.id === `seq_${name}`)!.tags.find((t) => t.startsWith('blend:')) ?? '').slice(6);
    for (const d of Object.values(VFX)) {
      if (d.kind !== 'flipbook') continue;
      // ink (a dark thing) is drawn normal; the light behind the actors is added; everything else is added
      expect(blendOf(d.sequence), `${d.id} plays ${d.sequence}`).toBe(d.blend);
    }
  });
});

describe('the packs of the light, as they ship', () => {
  it('are in the index of the art folder, as `boot` packs, and valid with nothing to say about the light', () => {
    const index = parseArtIndex(read('public', 'art', 'index.json'));
    expect(index.issues.filter((i) => i.level === 'error')).toEqual([]);
    const entries = index.value!.packs.filter((p) => p.category === 'vfx');
    expect(entries.map((e) => [e.id, e.load, e.zones])).toEqual([['vfx-shapes', 'boot', []], ['vfx-flipbooks', 'boot', []]]);
    for (const entry of entries) {
      const { value, issues } = parseArtPack(read('public', 'art', entry.id, `${entry.id}.pack.json`));
      expect(issues.filter((i) => i.level === 'error'), entry.id).toEqual([]);
      expect(value!.status, entry.id).toBe('provisional');
      expect(vfxArtIssues(value!), entry.id).toEqual([]);
    }
  });

  it('keep the ten shapes on ONE page of the atlas (the particles of the effects draw from one texture)', () => {
    const { value } = parseArtPack(read('public', 'art', 'vfx-shapes', 'vfx-shapes.pack.json'));
    expect(value!.atlases).toHaveLength(1);
    expect(value!.sprites.every((s) => (s.atlases ?? []).length === 1 && s.atlases![0] === value!.atlases[0]!.id)).toBe(true);
  });

  it('weigh what the budget says: the whole of the light is a few MiB resident from the first frame', () => {
    const area = (id: string): number => parseArtPack(read('public', 'art', id, `${id}.pack.json`)).value!.atlases.reduce((n, a) => n + a.width * a.height * 4, 0);
    const mib = (area('vfx-shapes') + area('vfx-flipbooks')) / 1048576;
    expect(mib).toBeLessThan(4.5);
    expect(mib).toBeGreaterThan(1);
  });
});
