import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLAYER_VISUAL } from '@/content/visuals';
import { parseArtPack } from '@/presentation/artManifest';
import { buildArt } from '../../../tools/assets/build';
import { readDelivery } from '../../../tools/assets/missing';

/**
 * THE ART IN THE REPOSITORY (docs/ART-PIPELINE-2D.md, part E): whatever `art/` declares must build, and whatever `public/art` ships must verify — the very check
 * `npm run build` runs before a browser is ever opened, held in the unit tests too so that a broken asset cannot be committed unnoticed. With no art in the
 * repository there is nothing to check, and that is the honest state of it today.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));

describe('the art of the repository', () => {
  it('builds without a single error (nothing is written)', () => {
    const r = buildArt({ srcDir: join(root, 'art'), outDir: join(root, 'public', 'art'), write: false });
    expect(r.issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('declares the slot of the protagonist\'s art — the sprite set `player/hero` with exactly the fifteen clips the game asks of it — and ships nothing while the art is awaited', () => {
    const raw = JSON.parse(readFileSync(join(root, 'art', 'player', 'player.pack.json'), 'utf8')) as unknown;
    const { value, issues } = parseArtPack(raw);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(value).toMatchObject({ id: PLAYER_VISUAL.art.pack, category: 'player', status: 'awaiting-art' });
    const hero = value!.sprites.find((s) => s.id === PLAYER_VISUAL.art.sprite)!;
    expect(Object.keys(hero.clips).sort()).toEqual([...PLAYER_VISUAL.required].sort());
    expect(hero.height).toBe(1.7);
    // the six to validate first are tagged as such in the declaration, and the four blows carry the sword
    expect(Object.entries(hero.clips).filter(([, c]) => c!.tags.includes('first')).map(([s]) => s).sort()).toEqual([...PLAYER_VISUAL.first].sort());
    expect(Object.entries(hero.clips).filter(([, c]) => c!.tags.includes('sword')).map(([s]) => s).sort()).toEqual(['attack1', 'attack2', 'attackAir', 'attackCrouch']);
    const r = buildArt({ srcDir: join(root, 'art'), outDir: join(root, 'public', 'art'), write: false });
    expect(r.packs.map((p) => [p.id, p.status, p.shipped])).toEqual([['player', 'awaiting-art', false]]);
    expect(existsSync(join(root, 'public', 'art')), 'no art ships: the game asks for no file').toBe(false);
  });

  it('says exactly what is missing: today, all of the protagonist\'s fifteen clips (the real art has not been delivered)', () => {
    const d = readDelivery(join(root, 'art'));
    expect(d).toMatchObject({ pack: 'player', sprite: 'hero', status: 'awaiting-art', delivered: 0, total: 15 });
    expect(d.rows.every((row) => row.prefix !== null && !row.delivered)).toBe(true);
  });
});
