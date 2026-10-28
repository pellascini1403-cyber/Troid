import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { chromium } from 'playwright-core';
import { CHROMIUM_PATH } from '../e2e/harness';
import { PACKS as RUINS_PACKS } from './packs/ruins';
import { VFX_PACKS } from './packs/vfx';
import { ZONE_PACKS } from './packs/zones';

/** Every pack the painter makes: the scenery and the creatures of the ruins, the scenery of each zone after them, and the light of the effects. */
const PACKS = [...RUINS_PACKS, ...ZONE_PACKS, ...VFX_PACKS];
import type { PackSpec } from './spec';

/**
 * `npm run art:build` — THE PAINTER (docs/ART-PIPELINE-2D.md, part M). It runs the generator in `painter/` inside the Chromium the project already uses for its tests (the 2D canvas
 * does the paths, the gradients and the blurs), paints every sprite of the packs in `packs/`, cuts each picture into the frames of its clip and writes an ordinary art folder:
 *
 *   art/<pack>/<sprite>/<sprite>_NN.png     the frames
 *   art/<pack>/<pack>.pack.json             the manifest (scale, pivot, tags, clips, `atlasMode: "shared"`, the scenes)
 *   art/index.json                          the pack's entry (the packs of other tools are left as they are)
 *
 * `npm run assets:pack` then checks and packs it like art a person made. The painter is deterministic for a given seed on a given browser; the PNGs it wrote are what is versioned.
 *   npm run art:build                       every pack
 *   npm run art:build -- --pack ruins-back  one pack
 *   npm run art:build -- --only earth_fill,gate_top   some sprites of the chosen packs
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(ROOT, 'art');

interface Painted {
  frames: Array<{ png: string; w: number; h: number }>;
}

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyPack = flag('pack');
const onlySprites = flag('only')?.split(',');

const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
const nn = (i: number): string => String(i).padStart(2, '0');

async function main(): Promise<void> {
  const packs = PACKS.filter((p) => !onlyPack || p.id === onlyPack);
  if (packs.length === 0) throw new Error(`no pack "${onlyPack}" (${PACKS.map((p) => p.id).join(', ')})`);
  const code = (await bundle({ entryPoints: [join(ROOT, 'tools/art/painter/entry.ts')], bundle: true, write: false, format: 'iife', target: 'es2022' })).outputFiles[0]!.text;
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[painter]', e.message));
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: code });
    for (const pack of packs) await paintPack(pack, page);
  } finally {
    await browser.close();
  }
}

async function paintPack(pack: PackSpec, page: import('playwright-core').Page): Promise<void> {
  const dir = join(ART, pack.id);
  const manifestFile = join(dir, `${pack.id}.pack.json`);
  const previous = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, 'utf8')) as { sprites?: Array<Record<string, unknown>> }) : null;
  const sprites: Array<Record<string, unknown>> = [];
  for (const spec of pack.sprites) {
    const ppm = spec.ppm ?? pack.ppm;
    if (onlySprites && !onlySprites.includes(spec.id)) {
      // not repainted: its entry stays as it was (or is rebuilt from the frames on disk when the manifest is new)
      const kept = previous?.sprites?.find((s) => s['id'] === spec.id);
      if (kept) sprites.push(kept);
      continue;
    }
    const t0 = Date.now();
    const scale = spec.scale ?? 1;
    const painted = (await page.evaluate(([piece, params, cut]) => window.paint(piece, params, cut), [spec.piece, { ppm, ...(spec.sizeM ? { wM: spec.sizeM[0], hM: spec.sizeM[1] } : {}), ...(spec.params ?? {}) }, { cols: spec.cols ?? 1, rows: spec.rows ?? 1, mirror: spec.mirror ?? false, ...(scale < 1 ? { scale } : {}) }] as const)) as Painted;
    const folder = join(dir, spec.id);
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    painted.frames.forEach((f, i) => writeFileSync(join(folder, `${spec.id}_${nn(i)}.png`), Buffer.from(f.png, 'base64')));
    const { w, h } = painted.frames[0]!;
    const density = Math.round(ppm * scale * 1000) / 1000;
    sprites.push({
      id: spec.id,
      artPxPerMeter: density,
      pivot: spec.pivot,
      height: Math.round((h / density) * 1000) / 1000,
      frameSize: [w, h],
      missingClips: 'placeholder',
      tags: spec.tags,
      ...(spec.anchors ? { anchors: spec.anchors } : {}),
      clips: { idle: { frames: `${spec.id}_`, count: painted.frames.length } },
      ...(spec.comment ? { comment: spec.comment } : {}),
    });
    console.log(`${pack.id}/${spec.id}: ${painted.frames.length} frame(s) of ${w} × ${h} at ${density} px/m (${Date.now() - t0} ms)`);
  }
  // the scenes: made by the pack's own composers, written next to the manifest
  const scenes: Record<string, string> = {};
  for (const [room, compose] of Object.entries(pack.scenes ?? {})) {
    const file = `scenes/${room}.json`;
    mkdirSync(join(dir, 'scenes'), { recursive: true });
    const scene = compose(pack);
    writeFileSync(join(dir, file), json(scene));
    scenes[room] = file;
    console.log(`${pack.id}/${file}: ${Object.values(scene.layers).reduce((n, l) => n + (l?.length ?? 0), 0)} placements`);
  }
  writeFileSync(
    manifestFile,
    json({
      manifestVersion: 1,
      id: pack.id,
      category: pack.category ?? 'environment',
      status: 'provisional',
      comment: pack.comment,
      tags: [...(pack.tags ?? ['ruins']), 'generated'],
      atlasMode: 'shared',
      ...(Object.keys(scenes).length > 0 ? { scenes } : {}),
      atlases: [],
      sprites,
    }),
  );
  // the index: this pack's entry is written, the others stay
  const indexFile = join(ART, 'index.json');
  const index = JSON.parse(readFileSync(indexFile, 'utf8')) as { manifestVersion: number; packs: Array<Record<string, unknown>> };
  const entry = { id: pack.id, category: pack.category ?? 'environment', load: pack.load ?? 'zone', ...((pack.load ?? 'zone') === 'zone' ? { zones: pack.zones } : {}), manifest: `${pack.id}/${pack.id}.pack.json`, tags: pack.tags ?? ['ruins'] };
  const at = index.packs.findIndex((p) => p['id'] === pack.id);
  if (at >= 0) index.packs[at] = entry;
  else index.packs.push(entry);
  writeFileSync(indexFile, json(index));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
