import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildHeroAnimation, frameFile, keptFrom, sha256, type KeptManifest, type RigFile, type SheetSpec } from './heroAnimation';
import { decodePng, encodePng } from './png';

/**
 * `npm run assets:animate` without the command line (docs/ART-PIPELINE-2D.md part N): reads the sheet, the poses and the rig next to `specPath`, makes the protagonist's frames and either writes
 * them (`art/player/hero/*.png` and `art/player/player.pack.json`, next to the `source` folder) or says whether what is there is what they produce.
 *
 * The clips the rig lists as `delivered` are the artist's: this never makes, deletes or checks their frames beyond their being there, and the manifest keeps their entry as it was written.
 */

/** The most a channel may differ between the committed frame and the regenerated one: the maths is floating point, and a different engine may round a pixel the other way. */
export const TOLERANCE = 3;

export interface AnimateOptions {
  /** `hero.poses.json`; the sheet and `hero.rig.json` are read from its folder, and `hero/` and `player.pack.json` live in the folder above it. */
  specPath: string;
  /** Write nothing: say whether the committed frames and manifest are what the sources produce. */
  check: boolean;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

export interface AnimateResult {
  /** Check mode: how many things differ (0 = everything is as the sources produce it). */
  drift: number;
  /** Write mode: how many frames were written. */
  written: number;
}

/** The files `art/player/hero/` holds for the clips handed over: `<prefix>NN.png`, whatever NN. */
function isHandedOver(file: string, kept: KeptManifest, delivered: readonly string[]): boolean {
  return delivered.some((clip) => {
    const prefix = kept.clips[clip]?.frames;
    return typeof prefix === 'string' && file.startsWith(prefix) && /^\d+\.png$/.test(file.slice(prefix.length));
  });
}

export function animate(options: AnimateOptions): AnimateResult {
  const log = options.log ?? ((line: string) => console.log(line));
  const error = options.error ?? ((line: string) => console.error(line));
  const specPath = resolve(options.specPath);
  const specDir = dirname(specPath);
  const spec = JSON.parse(readFileSync(specPath, 'utf8')) as SheetSpec;
  const rig = JSON.parse(readFileSync(join(specDir, 'hero.rig.json'), 'utf8')) as RigFile;
  const delivered = rig.delivered ?? [];

  const sheetBytes = readFileSync(join(specDir, spec.sheet));
  const actual = sha256(sheetBytes);
  if (actual !== spec.sheetSha256) throw new Error(`the sheet is not the one the spec was made for:\n  spec  ${spec.sheetSha256}\n  file  ${actual}`);

  const outDir = resolve(specDir, '..', 'hero');
  const manifestFile = join(dirname(outDir), 'player.pack.json');
  const kept: KeptManifest = delivered.length > 0 && existsSync(manifestFile) ? keptFrom(JSON.parse(readFileSync(manifestFile, 'utf8'))) : { clips: {}, frames: {} };

  const started = performance.now();
  const { frames, manifest, report } = buildHeroAnimation(spec, rig, decodePng(sheetBytes), kept);
  for (const line of report) log(line);
  log(`(${((performance.now() - started) / 1000).toFixed(1)} s)`);
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  if (options.check) {
    let drift = 0;
    for (const [name, image] of frames) {
      const file = join(outDir, `${name}.png`);
      if (!existsSync(file)) {
        error(`missing: ${file}`);
        drift++;
        continue;
      }
      const have = decodePng(readFileSync(file));
      if (have.width !== image.width || have.height !== image.height) {
        error(`differs in size from what the rig produces: ${file}`);
        drift++;
        continue;
      }
      let worst = 0;
      for (let i = 0; i < image.data.length; i++) worst = Math.max(worst, Math.abs(have.data[i]! - image.data[i]!));
      if (worst > TOLERANCE) {
        error(`differs from what the rig produces (by up to ${worst} in a channel): ${file}`);
        drift++;
      }
    }
    // the clips handed over: not made here, but they must be all there
    for (const clip of delivered) {
      const entry = kept.clips[clip]!;
      for (let k = 0; k < entry.count; k++) {
        const file = join(outDir, `${frameFile(entry.frames, k)}.png`);
        if (!existsSync(file)) {
          error(`the clip "${clip}" was handed over, but this frame is missing: ${file}`);
          drift++;
        }
      }
    }
    if (existsSync(outDir)) {
      const counted = new Set<string>();
      for (const clip of delivered) for (let k = 0; k < kept.clips[clip]!.count; k++) counted.add(`${frameFile(kept.clips[clip]!.frames, k)}.png`);
      for (const f of readdirSync(outDir)) {
        if (!f.endsWith('.png') || frames.has(f.slice(0, -4)) || counted.has(f)) continue;
        // a leftover of the frames the generator used to make for a clip now handed over is the artist's to delete: it is said, not deleted
        error(isHandedOver(f, kept, delivered) ? `a frame of a clip handed over that its entry of the manifest does not count: ${join(outDir, f)}` : `not made by the rig: ${join(outDir, f)}`);
        drift++;
      }
    }
    if (!existsSync(manifestFile) || readFileSync(manifestFile, 'utf8') !== manifestText) {
      error(`the manifest is not what the rig produces: ${manifestFile}`);
      drift++;
    }
    log(drift === 0 ? 'animate: the frames are what the sheet, the rig and the clips produce' : `animate: ${drift} difference(s)`);
    return { drift, written: 0 };
  }

  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.endsWith('.png') && !isHandedOver(f, kept, delivered)) rmSync(join(outDir, f));
  for (const [name, image] of frames) writeFileSync(join(outDir, `${name}.png`), encodePng(image));
  writeFileSync(manifestFile, manifestText);
  log(`wrote ${frames.size} frames to ${outDir} and ${manifestFile}`);
  return { drift: 0, written: frames.size };
}
