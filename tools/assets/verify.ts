import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOMS, WORLD } from '../../src/content';
import { PLAYER_VISUAL } from '../../src/content/visuals';
import { checkSpriteFrames, mergeFrameMeta, parseAtlasData, type AtlasPage } from '../../src/presentation/artAtlas';
import { applyContract } from '../../src/presentation/artContract';
import { atlasVariants, parseArtIndex, parseArtPack, toSpriteSetDefinition, type ArtAtlas, type ArtIndexEntry, type ArtIssue, type ArtPack, type ArtSprite } from '../../src/presentation/artManifest';
import { environmentPackIssues, environmentSlots } from '../../src/presentation/environment';
import { lackedClips } from '../../src/presentation/visualSource';
import { inspectPicture, pictureIssues } from './inspect';
import { decodePng, readPngInfo } from './png';

/**
 * THE CHECK OF WHAT SHIPS (docs/ART-PIPELINE-2D.md, part E): everything that can be known about a folder of art WITHOUT a browser — so that a build fails on a
 * broken asset, with the path of the file and what to do, long before anybody sees a wrong picture. It reads the folder the way the game does (index → manifest →
 * atlases) and asks every question the game would: the manifest is valid; every image and JSON is there, is what it says it is (the size of the PNG's own header,
 * an alpha channel, a transparent background); every frame of every clip is in a page, all of one size; the anchors are metres and inside the picture; the
 * sword is in the right hand; the character fits its canvas; and — with the same function the game applies at run time — which clips the game would leave out.
 *
 * It only LOOKS: it never writes a file and never changes a pixel.
 */
export interface VerifiedPack {
  id: string;
  status: string;
  /** Clips the game would leave out of each set (`set → states`), and the protagonist's required clips the art still lacks. */
  dropped: Record<string, string[]>;
  lacking: string[];
}

export interface VerifyResult {
  issues: ArtIssue[];
  packs: VerifiedPack[];
  ok: boolean;
}

/** `read(rel)` answers the bytes of a file relative to the art folder (`index.json`, `player/player.pack.json`…), or `null` when it is not there. */
export type FileReader = (rel: string) => Buffer | null;

const folderOf = (manifest: string): string => manifest.slice(0, Math.max(0, manifest.lastIndexOf('/')));
const under = (folder: string, file: string): string => (folder === '' ? file : `${folder}/${file}`);
const tag = (label: string, issues: readonly ArtIssue[]): ArtIssue[] => issues.filter((i) => i.level !== 'info').map((i) => ({ ...i, path: i.path ? `${label} ${i.path}` : label }));

/** Anchors are METRES from the feet: a value of 120 is a pixel measure, and one outside the canvas is a point that would be drawn off the picture. */
const PIXEL_LOOKING_METRES = 6;
const OFF_CANVAS_MARGIN = 0.25;

function anchorIssues(label: string, sprite: ArtSprite, frames: Record<string, { anchors?: Record<string, readonly [number, number] | undefined> }>, canvasPx: { w: number; h: number }, resolution: number): ArtIssue[] {
  const out: ArtIssue[] = [];
  const wM = canvasPx.w / (sprite.artPxPerMeter * resolution);
  const hM = canvasPx.h / (sprite.artPxPerMeter * resolution);
  // the canvas in metres from the feet, +x forward, +y up
  const box = { x0: -sprite.pivot[0] * wM, x1: (1 - sprite.pivot[0]) * wM, y0: -(1 - sprite.pivot[1]) * hM, y1: sprite.pivot[1] * hM };
  const pixelLike = new Set<string>();
  const offCanvas = new Set<string>();
  const check = (where: string, anchors: Record<string, readonly [number, number] | undefined> | undefined): void => {
    for (const [id, p] of Object.entries(anchors ?? {})) {
      if (!p) continue;
      if (Math.abs(p[0]) > PIXEL_LOOKING_METRES || Math.abs(p[1]) > PIXEL_LOOKING_METRES) pixelLike.add(`${where}.${id} = [${p[0]}, ${p[1]}]`);
      else if (p[0] < box.x0 - OFF_CANVAS_MARGIN || p[0] > box.x1 + OFF_CANVAS_MARGIN || p[1] < box.y0 - OFF_CANVAS_MARGIN || p[1] > box.y1 + OFF_CANVAS_MARGIN) offCanvas.add(`${where}.${id} = [${p[0]}, ${p[1]}]`);
    }
  };
  check('anchors', sprite.anchors);
  for (const [name, m] of Object.entries(frames)) check(name, m.anchors);
  const list = (set: Set<string>): string => `${[...set].slice(0, 3).join('; ')}${set.size > 3 ? `; … (${set.size} in all)` : ''}`;
  if (pixelLike.size > 0) out.push({ level: 'error', path: label, message: `anchors that look like PIXELS, not metres from the feet (a hero is under 2 m tall): ${list(pixelLike)}` });
  if (offCanvas.size > 0) {
    out.push({ level: 'warn', path: label, message: `anchors outside the picture (${box.x0.toFixed(2)} … ${box.x1.toFixed(2)} m across, ${box.y0.toFixed(2)} … ${box.y1.toFixed(2)} m up from the feet): ${list(offCanvas)} — are they metres FROM THE FEET, +x forward, +y up?` });
  }
  return out;
}

/** Checks one pack. `folder` is where its manifest is (relative to the art folder): every path in it is relative to that. */
function verifyPack(entry: ArtIndexEntry, read: FileReader, issues: ArtIssue[]): VerifiedPack {
  const label = entry.id;
  const folder = folderOf(entry.manifest);
  const result: VerifiedPack = { id: entry.id, status: 'unknown', dropped: {}, lacking: [] };
  const bytes = read(entry.manifest);
  if (!bytes) {
    issues.push({ level: 'error', path: label, message: `its manifest ${entry.manifest} is not there` });
    return result;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch (err) {
    issues.push({ level: 'error', path: `${label} ${entry.manifest}`, message: `cannot be read as JSON (${err instanceof Error ? err.message : String(err)})` });
    return result;
  }
  const parsed = parseArtPack(raw);
  issues.push(...tag(label, parsed.issues));
  const pack: ArtPack | null = parsed.value;
  if (!pack) return result;
  result.status = pack.status;
  if (pack.id !== entry.id || pack.category !== entry.category) issues.push({ level: 'error', path: label, message: `the manifest says it is "${pack.id}" (${pack.category}) but the index lists "${entry.id}" (${entry.category})` });
  if (pack.status === 'awaiting-art') return result; // declared, no images: nothing more to look at
  // the scenery says what it draws, the way the environment contract asks (part I): the pieces the world's rooms ask for are read from their data
  if (pack.category === 'environment') issues.push(...tag(label, environmentPackIssues(pack, environmentSlots(WORLD.rooms.map((id) => ROOMS[id]!)))));

  // ---- every atlas: the files are there and are what the manifest says
  const pages = new Map<string, AtlasPage>();
  const pictures = new Map<string, boolean>();
  for (const atlas of pack.atlases) {
    const where = `${label} atlases.${atlas.id}`;
    const imageRel = under(folder, atlas.source);
    const image = read(imageRel);
    if (!image) issues.push({ level: 'error', path: where, message: `the image ${atlas.source} is not there` });
    else if (/\.png$/i.test(atlas.source)) {
      try {
        const info = readPngInfo(image, true);
        if (info.width !== atlas.width || info.height !== atlas.height) {
          issues.push({ level: 'error', path: where, message: `the image file ${atlas.source} is ${info.width} × ${info.height} but the manifest declares ${atlas.width} × ${atlas.height}` });
        }
        if (info.bitDepth === 16) issues.push({ level: 'warn', path: where, message: `${atlas.source} is 16 bits per channel: the GPU has 8, so its values are rounded` });
        if (info.colourChunks.includes('iCCP')) issues.push({ level: 'warn', path: where, message: `${atlas.source} carries an embedded colour profile: the browser would convert the colours, the packer does not — export as sRGB` });
        issues.push(...tag(`${where} ${atlas.source}`, pictureIssues('', inspectPicture(decodePng(image, { verifyCrc: false }), info), pack.category, 0, { edges: false })));
        pictures.set(atlas.id, true);
      } catch (err) {
        issues.push({ level: 'error', path: where, message: `${atlas.source}: ${err instanceof Error ? err.message : String(err)}` });
      }
    } else issues.push({ level: 'info', path: where, message: `${atlas.source} is not a PNG: its size and transparency are not inspected here` });
    if (atlas.data === undefined) continue;
    const dataBytes = read(under(folder, atlas.data));
    if (!dataBytes) {
      issues.push({ level: 'error', path: where, message: `the data ${atlas.data} is not there` });
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(dataBytes.toString('utf8')) as unknown;
    } catch (err) {
      issues.push({ level: 'error', path: `${where} ${atlas.data}`, message: `cannot be read as JSON (${err instanceof Error ? err.message : String(err)})` });
      continue;
    }
    const atlasData = parseAtlasData(data);
    issues.push(...tag(`${where} ${atlas.data}`, atlasData.issues));
    if (atlasData.value) pages.set(atlas.id, { atlas, data: atlasData.value });
  }

  // ---- every sprite set, at every variant: what is in the pages, and what the game would do with it
  const atlasMap = new Map<string, ArtAtlas>(pack.atlases.map((a) => [a.id, a]));
  for (const sprite of pack.sprites) {
    const spriteLabel = `${label} sprites.${sprite.id}`;
    const variants = atlasVariants(sprite, atlasMap);
    const dropped = new Set<string>();
    for (const variant of variants) {
      const own = variant.pages.map((a) => pages.get(a.id)).filter((p): p is AtlasPage => p !== undefined);
      if (own.length < variant.pages.length) continue; // a missing file was reported above
      const at = variants.length > 1 ? `${spriteLabel}@${variant.resolution}` : spriteLabel;
      const cross = checkSpriteFrames(sprite, own);
      issues.push(...tag(label, cross.filter((i) => i.level !== 'info')));
      const wanted = toSpriteSetDefinition(pack.id, sprite, variant);
      const meta = { frames: mergeFrameMeta(sprite, own, variant.resolution) };
      const available = new Set(own.flatMap((p) => Object.keys(p.data.frames)));
      const contract = applyContract(wanted, meta, available, cross);
      for (const m of contract.refused) issues.push({ level: 'error', path: at, message: `the game would REFUSE this set: ${m}` });
      for (const d of contract.dropped) {
        dropped.add(d.state);
        issues.push({ level: pack.status === 'final' ? 'error' : 'warn', path: `${at} clips.${d.state}`, message: `the game would leave this clip out (${d.reason}): the state would fall back${pack.status === 'final' ? ' — a "final" pack must not need that' : ''}` });
      }
      for (const m of contract.warnings) issues.push({ level: 'warn', path: at, message: m });
      // the picture: anchors in metres inside it, the character fits its canvas
      const first = own.flatMap((p) => Object.values(p.data.frames))[0];
      if (first && variant === variants[0]) {
        const size = first.sourceSize ?? { w: first.frame.w, h: first.frame.h };
        issues.push(...anchorIssues(at, sprite, meta.frames, size, variant.resolution));
        const canvasHeight = size.h / (sprite.artPxPerMeter * variant.resolution); // metres
        if (canvasHeight < sprite.height * 0.95) issues.push({ level: 'error', path: at, message: `the canvas is ${canvasHeight.toFixed(2)} m tall at ${sprite.artPxPerMeter} px/m but the character is ${sprite.height} m: it does not fit (is artPxPerMeter right?)` });
      }
    }
    result.dropped[sprite.id] = [...dropped];
    // the protagonist's set must bring the clips the game asks of it
    if (entry.id === PLAYER_VISUAL.art.pack && sprite.id === PLAYER_VISUAL.art.sprite) {
      result.lacking = lackedClips({ clips: sprite.clips }, PLAYER_VISUAL.required);
      if (result.lacking.length > 0) {
        issues.push({
          level: pack.status === 'final' ? 'error' : 'warn',
          path: spriteLabel,
          message: `the protagonist's art lacks ${result.lacking.length} of the ${PLAYER_VISUAL.required.length} clips the game asks of it: ${result.lacking.join(', ')} — the placeholder draws those states${pack.status === 'final' ? ' (a "final" pack must have them all)' : ''}`,
        });
      }
    }
  }
  return result;
}

/** Checks a folder of art through `read`. A folder with no `index.json` is not an error: there is no art. */
export function verifyArt(read: FileReader): VerifyResult {
  const issues: ArtIssue[] = [];
  const packs: VerifiedPack[] = [];
  const indexBytes = read('index.json');
  if (!indexBytes) return { issues, packs, ok: true };
  let raw: unknown;
  try {
    raw = JSON.parse(indexBytes.toString('utf8')) as unknown;
  } catch (err) {
    issues.push({ level: 'error', path: 'index.json', message: `cannot be read as JSON (${err instanceof Error ? err.message : String(err)})` });
    return { issues, packs, ok: false };
  }
  const index = parseArtIndex(raw);
  issues.push(...tag('index.json', index.issues));
  for (const entry of index.value?.packs ?? []) packs.push(verifyPack(entry, read, issues));
  return { issues, packs, ok: index.value !== null && !issues.some((i) => i.level === 'error') };
}

/** Checks a folder on disk (what `public/art` holds, or any folder written the same way). */
export function verifyArtFolder(dir: string): VerifyResult {
  return verifyArt((rel) => {
    const file = join(dir, ...rel.split('/'));
    return existsSync(file) ? readFileSync(file) : null;
  });
}
