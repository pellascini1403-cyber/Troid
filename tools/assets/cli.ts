import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArt, formatReport } from './build';
import { verifyArtFolder } from './verify';

/**
 * `npm run assets:pack` — packs `art/` into `public/art/` (docs/ART-PIPELINE-2D.md, part C).
 * `npm run assets:check` — the same checks, writes nothing, exits 1 on any error: what `npm run build` and the CI ask before a browser is ever opened.
 * `npm run assets:verify` — checks only what is in `public/art` (what the game will fetch), whoever put it there.
 *
 *   --src <dir>     the folder the artist hands over (default `art`)
 *   --out <dir>     the folder the game fetches (default `public/art`)
 *   --check         check only
 *   --verify        check only the folder the game fetches (`--out`), not the source
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
const write = !has('--check') && !has('--verify');
const maxSide = value('--max-side');

if (has('--verify')) {
  const checked = verifyArtFolder(value('--out') ?? join(root, 'public', 'art'));
  for (const i of checked.issues) console.log(`${i.level === 'error' ? 'ERROR' : i.level === 'warn' ? 'warn ' : 'note '} ${i.path}: ${i.message}`);
  for (const p of checked.packs) console.log(`pack ${p.id} [${p.status}]${p.lacking.length > 0 ? ` — the protagonist's art still lacks ${p.lacking.length} clip(s)` : ''}`);
  console.log(checked.packs.length === 0 ? 'art: nothing shipped (no index.json): the game keeps its placeholders' : checked.ok ? 'art: OK' : 'art: FAILED');
  process.exit(checked.ok ? 0 : 1);
}

const result = buildArt({
  srcDir: value('--src') ?? join(root, 'art'),
  outDir: value('--out') ?? join(root, 'public', 'art'),
  write,
  pack: { ...(has('--no-trim') ? { trim: false } : {}), ...(maxSide ? { maxSide: Number(maxSide) } : {}) },
});
console.log(formatReport(result, write));
process.exit(result.ok ? 0 : 1);
