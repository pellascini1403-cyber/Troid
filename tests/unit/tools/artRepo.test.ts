import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildArt } from '../../../tools/assets/build';

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
});
