import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { animate } from './animate';

/**
 * `npm run assets:animate` — the generator of the protagonist's frames from the user's OLD pose sheet, moved by a rig (docs/ART-PIPELINE-2D.md part N). RETIRED: the protagonist of the game is now the one of the
 * character sheet (docs/PROMPT16-LOG.md), whose frames come through `npm run assets:intake`, and this generator belongs to the design that was replaced. It is kept — and tested — against that design, which is
 * kept whole in `art/player/archive/design-v1/` (in the layout of `art/player/` itself: `hero/`, `player.pack.json`, `source/`): everything it reads and writes is next to the spec it is given, so by default it
 * works on the archive and can not touch the frames of the game.
 *
 *   --spec <file>   the spec of the drawings (default art/player/archive/design-v1/source/hero.poses.json); the rig is `hero.rig.json` next to it
 *   --check         write nothing: say whether the archived frames and manifest are what the sheet, the rig and the clips produce (exit 1 when not)
 *
 * It reads `hero-sheet.png` (the old drawing, kept bit for bit and checked against the hash the spec gives), cuts the drawings out, moves them as the rig and the clips say, writes one PNG per frame into the
 * `hero/` folder next to `source/` and the manifest into `player.pack.json` next to that. The clips the rig lists as `delivered` (drawn by hand) are left alone.
 */
const args = process.argv.slice(2);
const has = (n: string): boolean => args.includes(n);
const value = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = fileURLToPath(new URL('../../', import.meta.url));

try {
  const result = animate({ specPath: resolve(value('--spec') ?? join(root, 'art', 'player', 'archive', 'design-v1', 'source', 'hero.poses.json')), check: has('--check') });
  process.exit(has('--check') && result.drift > 0 ? 1 : 0);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
