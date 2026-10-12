import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHeroFrames, sha256, type HeroSpec } from './heroFrames';
import { decodePng, encodePng } from './png';

/**
 * `npm run assets:poses` — the protagonist's frames from the user's pose sheet (docs/ART-PIPELINE-2D.md part L).
 *
 *   --spec <file>   the spec (default art/player/source/hero.poses.json)
 *   --check         write nothing: say whether the committed frames and manifest are what the sheet and the spec produce (exit 1 when not)
 *
 * It reads `hero-sheet.png` (the user's drawing, kept bit for bit and checked against the hash the spec gives), cuts the poses out, writes one PNG per frame into
 * `art/player/hero/` and the manifest into `art/player/player.pack.json`. Run `npm run assets:pack` after it.
 */
const args = process.argv.slice(2);
const has = (n: string): boolean => args.includes(n);
const value = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = fileURLToPath(new URL('../../', import.meta.url));
const specPath = resolve(value('--spec') ?? join(root, 'art', 'player', 'source', 'hero.poses.json'));
const specDir = dirname(specPath);
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as HeroSpec;

const sheetBytes = readFileSync(join(specDir, spec.sheet));
const actual = sha256(sheetBytes);
if (actual !== spec.sheetSha256) {
  console.error(`the sheet is not the one the spec was made for:\n  spec  ${spec.sheetSha256}\n  file  ${actual}`);
  process.exit(1);
}
const { frames, manifest, report } = buildHeroFrames(spec, decodePng(sheetBytes));
for (const line of report) console.log(line);

const outDir = resolve(specDir, spec.out);
const manifestFile = join(dirname(outDir), 'player.pack.json');
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

if (has('--check')) {
  let drift = 0;
  for (const [name, image] of frames) {
    const file = join(outDir, `${name}.png`);
    if (!existsSync(file)) {
      console.error(`missing: ${file}`);
      drift++;
      continue;
    }
    const have = decodePng(readFileSync(file));
    const same = have.width === image.width && have.height === image.height && Buffer.compare(Buffer.from(have.data), Buffer.from(image.data)) === 0;
    if (!same) {
      console.error(`differs from what the sheet produces: ${file}`);
      drift++;
    }
  }
  if (existsSync(outDir)) for (const f of readdirSync(outDir)) if (f.endsWith('.png') && !frames.has(f.slice(0, -4))) console.error(`not in the spec: ${join(outDir, f)}`), drift++;
  if (!existsSync(manifestFile) || readFileSync(manifestFile, 'utf8') !== manifestText) {
    console.error(`the manifest is not what the spec produces: ${manifestFile}`);
    drift++;
  }
  console.log(drift === 0 ? 'poses: the frames are what the sheet and the spec produce' : `poses: ${drift} difference(s)`);
  process.exit(drift === 0 ? 0 : 1);
}

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith('.png')) rmSync(join(outDir, f));
for (const [name, image] of frames) writeFileSync(join(outDir, `${name}.png`), encodePng(image));
writeFileSync(manifestFile, manifestText);
console.log(`wrote ${frames.size} frames to ${outDir} and ${manifestFile}`);
