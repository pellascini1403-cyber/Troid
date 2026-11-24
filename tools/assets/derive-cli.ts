import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveAll } from './heroDerive';
import { heroPaths } from './heroRepo';
import { encodePng, type RgbaImage } from './png';

/**
 * `npm run assets:derive` — the poses the sheet has no drawing for, made from the owner's own (docs/PROMPT24-LOG.md, F5):
 *
 *   (no flag)        write the frames of the derived clips to `art/player/hero/` and declare them (their clips, and the sword's anchors) in `art/player/player.pack.json`
 *   --check          write nothing: fail if a committed frame or a declaration is not what the recipes (`heroDerivedClips.ts`) produce
 *   --sheet <png>    write a contact sheet of the derived clips (to look at them)
 */
const args = process.argv.slice(2);
const root = fileURLToPath(new URL('../../', import.meta.url));
const paths = heroPaths(root);
const check = args.includes('--check');
const sheetOut = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : undefined;
const onlyClips = args.includes('--clip') ? args[args.indexOf('--clip') + 1]!.split(',') : null;
const sheetCols = args.includes('--cols') ? Number(args[args.indexOf('--cols') + 1]) : 6;

interface ManifestShape {
  sprites: Array<{ clips: Record<string, unknown>; frames?: Record<string, { anchors: Record<string, number[]> }> }>;
  [k: string]: unknown;
}
const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8')) as ManifestShape;
const sprite = manifest.sprites[0]!;
sprite.frames ??= {};
const derived = deriveAll(root, manifest);
const made = derived.frames;
const clipDecl = derived.clips;
const frameDecl = derived.anchors;

if (sheetOut) {
  const cw = 320;
  const ch = 230;
  const shown = onlyClips ? made.filter((m) => onlyClips.includes(m.clip)) : made;
  const cols = sheetCols;
  const rows = Math.ceil(shown.length / cols);
  const img: RgbaImage = { width: cw * cols, height: ch * rows, data: new Uint8Array(cw * cols * ch * rows * 4) };
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 78;
    img.data[i + 1] = 90;
    img.data[i + 2] = 112;
    img.data[i + 3] = 255;
  }
  shown.forEach((m, k) => {
    const ox = (k % cols) * cw;
    const oy = Math.floor(k / cols) * ch;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const s = (y * cw + x) * 4;
        const d = ((oy + y) * img.width + ox + x) * 4;
        const a = m.image.data[s + 3]! / 255;
        for (let c = 0; c < 3; c++) img.data[d + c] = Math.round(m.image.data[s + c]! * a + img.data[d + c]! * (1 - a));
        if (y === 192) {
          img.data[d] = 110;
          img.data[d + 1] = 150;
          img.data[d + 2] = 110;
        }
      }
    }
  });
  writeFileSync(sheetOut, encodePng(img));
  console.log(`derive: contact sheet of ${shown.length} frames → ${sheetOut}`);
}

let drift = 0;
if (check) {
  for (const m of made) {
    const file = join(paths.hero, `${m.name}.png`);
    if (!existsSync(file)) {
      console.error(`missing: ${file}`);
      drift++;
    } else if (Buffer.compare(readFileSync(file), encodePng(m.image)) !== 0) {
      console.error(`differs from what its recipe produces: ${file}`);
      drift++;
    }
  }
  for (const [clip, decl] of Object.entries(clipDecl)) {
    if (JSON.stringify(sprite.clips[clip]) !== JSON.stringify(decl)) {
      console.error(`the manifest's "${clip}" is not what its recipe declares`);
      drift++;
    }
  }
  for (const [name, decl] of Object.entries(frameDecl)) {
    if (JSON.stringify(sprite.frames[name]) !== JSON.stringify(decl)) {
      console.error(`the manifest's anchors for "${name}" are not what the recipe produces`);
      drift++;
    }
  }
  console.log(drift === 0 ? `derive: ${made.length} frames and ${Object.keys(clipDecl).length} clips are what the recipes produce` : `derive: ${drift} difference(s) — run \`npm run assets:derive\``);
  process.exit(drift === 0 ? 0 : 1);
}

if (!sheetOut || args.includes('--write')) {
  mkdirSync(paths.hero, { recursive: true });
  for (const m of made) writeFileSync(join(paths.hero, `${m.name}.png`), encodePng(m.image));
  Object.assign(sprite.clips, clipDecl);
  // the manifest keeps its clips in the order of the requests (the game's own), the derived ones among them
  const order = Object.keys((JSON.parse(readFileSync(paths.requests, 'utf8')) as { clips: Record<string, unknown> }).clips);
  sprite.clips = Object.fromEntries(Object.entries(sprite.clips).sort(([a], [b]) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999)));
  Object.assign(sprite.frames, frameDecl);
  writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`derive: ${made.length} frames written to art/player/hero/, ${Object.keys(clipDecl).length} clips declared in art/player/player.pack.json — now \`npm run assets:pack\``);
}
