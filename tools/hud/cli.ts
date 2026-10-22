import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePng, encodePng } from '../assets/png';
import { HUD_ORIGINALS, HUD_ORIGINALS_DIR, HUD_PIECES_DIR } from './originals';
import { cutPieces } from './pieces';

/**
 * `npm run hud:cut` writes the pieces of the HUD (`src/ui/hud/png/*.png`) from the two originals; `npm run hud:check` writes nothing and says whether the files in the repository are what the originals give (pixel for pixel).
 * Both first hold the originals to the bytes that were delivered. Exit code 1 on anything that is not as it should be.
 */
const root = resolve(import.meta.dirname, '../..');
const check = process.argv.includes('--check');

function original(which: keyof typeof HUD_ORIGINALS): Uint8Array {
  const spec = HUD_ORIGINALS[which];
  const bytes = readFileSync(resolve(root, HUD_ORIGINALS_DIR, spec.file));
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== spec.bytes || sha !== spec.sha256) throw new Error(`${spec.file} is not the file that was delivered (${bytes.length} B, sha256 ${sha}; expected ${spec.bytes} B, ${spec.sha256})`);
  return bytes;
}

try {
  const pieces = cutPieces(decodePng(original('complete')), decodePng(original('worn')));
  let bad = 0;
  mkdirSync(resolve(root, HUD_PIECES_DIR), { recursive: true });
  for (const p of pieces) {
    const path = resolve(root, HUD_PIECES_DIR, `${p.name}.png`);
    if (check) {
      let same = false;
      try {
        const have = decodePng(readFileSync(path));
        same = have.width === p.image.width && have.height === p.image.height && Buffer.compare(Buffer.from(have.data), Buffer.from(p.image.data)) === 0;
      } catch {
        same = false;
      }
      if (!same) bad++;
      console.log(`${same ? 'ok   ' : 'DIFF '} ${p.name}.png  ${p.image.width} × ${p.image.height}`);
    } else {
      writeFileSync(path, encodePng(p.image));
      console.log(`wrote ${p.name}.png  ${p.image.width} × ${p.image.height}  (${p.from.file} ${p.from.box.x},${p.from.box.y})${p.note ? ' — ' + p.note : ''}`);
    }
  }
  if (bad > 0) {
    console.error(`${bad} piece(s) differ from what the originals give: run npm run hud:cut`);
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
