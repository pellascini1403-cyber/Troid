import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INK_SLIME } from '../../../tools/art/packs/ruins';
import { SLIME_EYES, SLIME_SIGIL } from '../../../tools/art/painter/slime';
import { enemyArtIssues, enemyParts, ENEMY_PARTS } from '@/presentation/enemyArt';
import { parseArtPack } from '@/presentation/artManifest';

/**
 * THE INK SLIME'S PACK (tools/art/packs/ruins.ts, docs/PROMPT8-LOG.md phase G): what the painter draws the eyes and the sigil at is what the pack tells the game — the body's own anchors — and the pack that ships is a whole
 * creature (every part, both anchors) in the two rooms where one lives.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = <T,>(...path: string[]): T => JSON.parse(readFileSync(join(root, ...path), 'utf8')) as T;

describe('the Ink Slime\'s pack', () => {
  it('says where the eyes and the sigil stand with the numbers the painter draws them for', () => {
    const body = INK_SLIME.sprites.find((s) => s.id === 'slime_body')!;
    expect(body.anchors).toEqual({ head: SLIME_EYES, vfx_origin: SLIME_SIGIL });
    // the eyes are in the head (in front of the chest) and the sigil is in the chest, both inside the 1.1 m body the game fights
    expect(SLIME_EYES[0]).toBeGreaterThan(SLIME_SIGIL[0]);
    for (const [x] of [SLIME_EYES, SLIME_SIGIL]) expect(Math.abs(x!)).toBeLessThan(0.55);
  });

  it('is a pack of the enemies category, dressed for the two rooms that have a Slime, and every part of it is a sprite set of the pack', () => {
    expect(INK_SLIME).toMatchObject({ id: 'ink-slime', category: 'enemies', zones: ['r1_gate', 'r2_hall'], ppm: 96 });
    const parts = enemyParts(INK_SLIME.sprites.map((s) => ({ id: s.id, tags: s.tags })));
    expect([...parts.get('ink_slime')!.keys()].sort()).toEqual([...ENEMY_PARTS].sort());
  });

  it('ships as what the painter wrote: a valid pack with no issue at all, the body carrying both anchors', () => {
    const raw = read<Record<string, unknown>>('public', 'art', 'ink-slime', 'ink-slime.pack.json');
    const { value, issues } = parseArtPack(raw);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(enemyArtIssues(value!)).toEqual([]);
    const body = value!.sprites.find((s) => s.id === 'slime_body')!;
    expect(body.anchors).toEqual({ head: [...SLIME_EYES], vfx_origin: [...SLIME_SIGIL] });
    expect(body.clips.idle?.count, 'the surface boils in four frames').toBe(4);
    expect(value!.sprites.find((s) => s.id === 'slime_spines')!.clips.idle?.count, 'the bristle has its three states').toBe(3);
  });
});
