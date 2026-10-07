import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArt, formatReport } from './build';

/**
 * `npm run assets:pack` — packs `art/` into `public/art/` (docs/ART-PIPELINE-2D.md, part C).
 * `npm run assets:check` — the same checks, writes nothing, exits 1 on any error: what `npm run build` and the CI ask before a browser is ever opened.
 *
 *   --src <dir>     the folder the artist hands over (default `art`)
 *   --out <dir>     the folder the game fetches (default `public/art`)
 *   --check         check only
 *   --no-trim       keep the transparent border of every frame (the default cuts only fully clear rows and columns, recording where the pixels were)
 *   --max-side <n>  largest page side (default 2048)
 */
const args = process.argv.slice(2);
const has = (name: string): boolean => args.includes(name);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = fileURLToPath(new URL('../../', import.meta.url));
const write = !has('--check');
const maxSide = value('--max-side');

const result = buildArt({
  srcDir: value('--src') ?? join(root, 'art'),
  outDir: value('--out') ?? join(root, 'public', 'art'),
  write,
  pack: { ...(has('--no-trim') ? { trim: false } : {}), ...(maxSide ? { maxSide: Number(maxSide) } : {}) },
});
console.log(formatReport(result, write));
process.exit(result.ok ? 0 : 1);
