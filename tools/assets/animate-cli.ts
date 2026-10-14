import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { animate } from './animate';

/**
 * `npm run assets:animate` — the protagonist's frames from the user's pose sheet, moved (docs/ART-PIPELINE-2D.md part N).
 *
 *   --spec <file>   the spec of the drawings (default art/player/source/hero.poses.json); the rig is `hero.rig.json` next to it
 *   --check         write nothing: say whether the committed frames and manifest are what the sheet, the rig and the clips produce (exit 1 when not)
 *
 * It reads `hero-sheet.png` (the user's drawing, kept bit for bit and checked against the hash the spec gives), cuts the drawings out, moves them as the rig and the clips say, writes one PNG
 * per frame into `art/player/hero/` and the manifest into `art/player/player.pack.json`. Run `npm run assets:pack` after it. The clips the rig lists as `delivered` (drawn by hand) are left alone.
 */
const args = process.argv.slice(2);
const has = (n: string): boolean => args.includes(n);
const value = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = fileURLToPath(new URL('../../', import.meta.url));

try {
  const result = animate({ specPath: resolve(value('--spec') ?? join(root, 'art', 'player', 'source', 'hero.poses.json')), check: has('--check') });
  process.exit(has('--check') && result.drift > 0 ? 1 : 0);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
