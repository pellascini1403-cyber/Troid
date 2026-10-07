import type { FrameMeta } from './SpriteSetDefinition';
import { artClipFrames, FRAME_NAME, isSafeRelativePath, Reader, readFrameMetaMap, type ArtAtlas, type ArtIssue, type ArtSprite, type Parsed } from './artManifest';

/**
 * WHAT AN ATLAS PACKER EXPORTS next to its image (docs/ART-PIPELINE-2D.md, part C), read and checked. PURE, like the manifest: the very same functions run in
 * the browser (the art library, when it fetches a page), in Node (the packer and the build-time checker) and in the tests. Never throws: every problem
 * comes back as an `ArtIssue` with the path of the field.
 *
 * The layout is the "hash" one every common packer writes (TexturePacker, Free-Tex-Packer, Aseprite `--format json-hash`); the "array" one is read too.
 * Rotated frames are refused: a rotation would turn the pivot and the anchors the artist measured. The engine's own per-frame data (`heightPx`, anchors)
 * may travel in `meta.troid.frames` — or in the pack manifest, which wins.
 */

/** A rectangle inside an atlas image, in pixels. */
export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One frame of an atlas JSON. */
export interface AtlasFrameJson {
  frame: AtlasRect;
  /** Where the trimmed pixels sit inside the original (untrimmed) frame. */
  spriteSourceSize?: AtlasRect;
  /** Size of the original (untrimmed) frame. */
  sourceSize?: { w: number; h: number };
  trimmed?: boolean;
}

/** An atlas JSON once read. */
export interface AtlasData {
  /** `meta.image`: the name of the image the packer wrote this JSON for. */
  image: string | null;
  /** `meta.size`: the size of that image, when the packer says it. */
  size: { w: number; h: number } | null;
  frames: Record<string, AtlasFrameJson>;
  /** `meta.troid.frames`: per-frame anchors / heights written by the artist's tool (the pack manifest overrides them). */
  meta: Record<string, FrameMeta> | null;
}

/** One image of a variant with its JSON: what the checker compares against the manifest. */
export interface AtlasPage {
  atlas: ArtAtlas;
  data: AtlasData;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The size of the untrimmed frame: the one the pivot is measured against. */
export function untrimmedSize(f: AtlasFrameJson): { w: number; h: number } {
  return f.sourceSize ?? { w: f.frame.w, h: f.frame.h };
}

function readRect(r: Reader, v: unknown, path: string, minSize: number): AtlasRect | null {
  const o = r.object(v, path);
  if (!o) return null;
  const x = r.number(o['x'], `${path}.x`, { min: 0, int: true });
  const y = r.number(o['y'], `${path}.y`, { min: 0, int: true });
  const w = r.number(o['w'], `${path}.w`, { min: minSize, int: true });
  const h = r.number(o['h'], `${path}.h`, { min: minSize, int: true });
  return x === null || y === null || w === null || h === null ? null : { x, y, w, h };
}

function readSize(r: Reader, v: unknown, path: string): { w: number; h: number } | null {
  const o = r.object(v, path);
  if (!o) return null;
  const w = r.number(o['w'], `${path}.w`, { min: 1, int: true });
  const h = r.number(o['h'], `${path}.h`, { min: 1, int: true });
  return w === null || h === null ? null : { w, h };
}

function readFrame(r: Reader, v: unknown, path: string): AtlasFrameJson | null {
  const o = r.object(v, path);
  if (!o) return null;
  const frame = readRect(r, o['frame'], `${path}.frame`, 1);
  if (o['rotated'] === true) r.error(`${path}.rotated`, 'rotated frames are not supported (turn "allow rotation" off in the packer): a rotation would turn the pivot and the anchors');
  if (o['trimmed'] !== undefined && typeof o['trimmed'] !== 'boolean') r.error(`${path}.trimmed`, 'must be true or false');
  const sourceSize = o['sourceSize'] === undefined ? undefined : readSize(r, o['sourceSize'], `${path}.sourceSize`) ?? undefined;
  const spriteSourceSize = o['spriteSourceSize'] === undefined ? undefined : readRect(r, o['spriteSourceSize'], `${path}.spriteSourceSize`, 1) ?? undefined;
  if (!frame) return null;
  const trimmed = o['trimmed'] === true;
  if (trimmed && (!sourceSize || !spriteSourceSize)) r.error(path, 'a trimmed frame needs "sourceSize" and "spriteSourceSize" (where its pixels sit in the original frame)');
  if (spriteSourceSize && (spriteSourceSize.w !== frame.w || spriteSourceSize.h !== frame.h)) {
    r.error(`${path}.spriteSourceSize`, `${spriteSourceSize.w} × ${spriteSourceSize.h} is not the ${frame.w} × ${frame.h} of the frame: the texture would be stretched`);
  }
  if (sourceSize && spriteSourceSize && (spriteSourceSize.x + spriteSourceSize.w > sourceSize.w || spriteSourceSize.y + spriteSourceSize.h > sourceSize.h)) {
    r.error(`${path}.spriteSourceSize`, `the trimmed pixels reach outside the original ${sourceSize.w} × ${sourceSize.h} frame`);
  }
  if (!trimmed && sourceSize && (sourceSize.w !== frame.w || sourceSize.h !== frame.h)) {
    r.error(`${path}.sourceSize`, `${sourceSize.w} × ${sourceSize.h} differs from the ${frame.w} × ${frame.h} of an untrimmed frame`);
  }
  const out: AtlasFrameJson = { frame };
  if (spriteSourceSize) out.spriteSourceSize = spriteSourceSize;
  if (sourceSize) out.sourceSize = sourceSize;
  if (trimmed) out.trimmed = true;
  return out;
}

/** Reads and checks the JSON an atlas packer exported. Never throws; `value` is `null` when anything is an error. */
export function parseAtlasData(raw: unknown): Parsed<AtlasData> {
  const r = new Reader();
  const o = r.object(raw, '');
  if (!o) return { value: null, issues: r.issues };

  const frames: Record<string, AtlasFrameJson> = {};
  const add = (name: string, value: unknown, path: string): void => {
    if (!FRAME_NAME.test(name)) {
      r.error(path, `"${name}" is not a valid frame name (letters, digits, _ and -, up to 40)`);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(frames, name)) {
      r.error(path, `frame "${name}" appears twice`);
      return;
    }
    const f = readFrame(r, value, path);
    if (f) frames[name] = f;
  };
  const rawFrames = o['frames'];
  if (Array.isArray(rawFrames)) {
    rawFrames.forEach((f, i) => {
      const filename = isObject(f) ? f['filename'] : undefined;
      if (typeof filename !== 'string') r.error(`frames[${i}].filename`, 'must be a string');
      else add(filename.replace(/\.(png|webp|aseprite|ase)$/i, ''), f, `frames[${i}]`);
    });
  } else if (isObject(rawFrames)) {
    for (const [name, f] of Object.entries(rawFrames)) add(name, f, `frames.${name}`);
  } else r.error('frames', 'must be an object of frames (the "hash" layout) or a list of them');
  if (Object.keys(frames).length === 0 && !r.failed) r.error('frames', 'holds no frame');

  let image: string | null = null;
  let size: { w: number; h: number } | null = null;
  let meta: Record<string, FrameMeta> | null = null;
  if (o['meta'] !== undefined) {
    const m = r.object(o['meta'], 'meta');
    if (m) {
      if (m['image'] !== undefined) {
        if (typeof m['image'] === 'string' && isSafeRelativePath(m['image'])) image = m['image'];
        else r.error('meta.image', 'must be a relative file name');
      }
      if (m['size'] !== undefined) size = readSize(r, m['size'], 'meta.size');
      if (m['troid'] !== undefined) {
        const t = r.object(m['troid'], 'meta.troid');
        if (t) {
          r.known(t, 'meta.troid', ['frames']);
          meta = t['frames'] === undefined ? {} : readFrameMetaMap(r, t['frames'], 'meta.troid.frames') ?? null;
        }
      }
    }
  }
  if (size) {
    for (const [name, f] of Object.entries(frames)) {
      if (f.frame.x + f.frame.w > size.w || f.frame.y + f.frame.h > size.h) r.error(`frames.${name}.frame`, `reaches outside the ${size.w} × ${size.h} image`);
    }
  }
  if (r.failed) return { value: null, issues: r.issues };
  return { value: { image, size, frames, meta }, issues: r.issues };
}

const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/**
 * Checks a sprite set against the pages (the images and their JSON) of ONE variant: every frame its clips name is in some page, in only one, inside the
 * image, and all of them share one untrimmed size — the one the pivot is measured against. Reports everything it finds, errors first.
 */
export function checkSpriteFrames(sprite: Pick<ArtSprite, 'id' | 'clips' | 'frameSize' | 'frames'>, pages: readonly AtlasPage[]): ArtIssue[] {
  const issues: ArtIssue[] = [];
  const at = (suffix: string): string => `sprites.${sprite.id}${suffix}`;

  // 1. each page against its own declaration
  const owner = new Map<string, number>();
  pages.forEach(({ atlas, data }, p) => {
    const where = `atlases.${atlas.id}`;
    if (data.size && (data.size.w !== atlas.width || data.size.h !== atlas.height)) {
      issues.push({ level: 'error', path: where, message: `the JSON says the image is ${data.size.w} × ${data.size.h} but the manifest declares ${atlas.width} × ${atlas.height}` });
    }
    if (data.image && basename(data.image) !== basename(atlas.source)) {
      issues.push({ level: 'warn', path: where, message: `the JSON was written for "${data.image}" but the manifest points at "${atlas.source}"` });
    }
    for (const [name, f] of Object.entries(data.frames)) {
      if (f.frame.x + f.frame.w > atlas.width || f.frame.y + f.frame.h > atlas.height) {
        issues.push({ level: 'error', path: `${where}.frames.${name}`, message: `reaches outside the ${atlas.width} × ${atlas.height} image` });
      }
      const other = owner.get(name);
      if (other !== undefined && other !== p) issues.push({ level: 'error', path: `${where}.frames.${name}`, message: `frame "${name}" is in two pages ("${pages[other]?.atlas.id}" and "${atlas.id}")` });
      else owner.set(name, p);
    }
  });
  const frameOf = (name: string): AtlasFrameJson | undefined => {
    const p = owner.get(name);
    return p === undefined ? undefined : pages[p]?.data.frames[name];
  };

  // 2. every frame of every clip exists
  const used = new Set<string>();
  for (const [state, clip] of Object.entries(sprite.clips)) {
    if (!clip) continue;
    const names = artClipFrames(clip);
    const missing = names.filter((n) => frameOf(n) === undefined);
    for (const n of names) used.add(n);
    if (missing.length > 0) {
      const shown = missing.slice(0, 4).join(', ') + (missing.length > 4 ? `, … (${missing.length} in all)` : '');
      issues.push({ level: 'error', path: at(`.clips.${state}`), message: `missing frame${missing.length > 1 ? 's' : ''} ${shown} (the clip has ${clip.count})` });
    }
  }

  // 3. one untrimmed size for the whole set: the pivot is a fraction of it
  const sizes = new Map<string, string[]>();
  for (const name of used) {
    const f = frameOf(name);
    if (!f) continue;
    const s = untrimmedSize(f);
    const key = `${s.w} × ${s.h}`;
    sizes.set(key, [...(sizes.get(key) ?? []), name]);
  }
  if (sizes.size > 1) {
    const list = [...sizes.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, names]) => `${k} (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''})`);
    issues.push({ level: 'error', path: at('.frames'), message: `the frames do not share one original size — ${list.join(' vs ')}: the pivot is measured against it` });
  } else if (sizes.size === 1 && sprite.frameSize) {
    const [key] = [...sizes.keys()];
    if (key !== `${sprite.frameSize[0]} × ${sprite.frameSize[1]}`) issues.push({ level: 'error', path: at('.frameSize'), message: `the manifest says ${sprite.frameSize[0]} × ${sprite.frameSize[1]} but the frames are ${key}` });
  }

  // 4. data about frames that are not there, frames nobody uses
  const known = new Set(owner.keys());
  const orphans = new Set<string>();
  for (const name of Object.keys(sprite.frames ?? {})) if (!known.has(name)) orphans.add(name);
  for (const { data } of pages) for (const name of Object.keys(data.meta ?? {})) if (!known.has(name)) orphans.add(name);
  if (orphans.size > 0) issues.push({ level: 'warn', path: at('.frames'), message: `data for frames that are in no page: ${[...orphans].slice(0, 5).join(', ')}${orphans.size > 5 ? ', …' : ''}` });
  const unused = [...known].filter((n) => !used.has(n));
  if (unused.length > 0) issues.push({ level: 'info', path: at('.clips'), message: `${unused.length} frame${unused.length > 1 ? 's are' : ' is'} in the atlas but in no clip (${unused.slice(0, 4).join(', ')}${unused.length > 4 ? ', …' : ''})` });
  pages.forEach(({ atlas, data }) => {
    if (!Object.keys(data.frames).some((n) => used.has(n))) issues.push({ level: 'warn', path: `atlases.${atlas.id}`, message: 'no frame of this page is used by the sprite set' });
  });

  return issues.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

const ORDER: Record<ArtIssue['level'], number> = { error: 0, warn: 1, info: 2 };

/**
 * The data about each frame the sprite set needs, from the pack manifest (which wins) over the atlas JSONs (`meta.troid`). `heightPx` is declared in pixels
 * of the MASTER image (resolution 1) wherever it is written; for a smaller variant it is scaled by `resolution`, so that the validator compares it with the
 * density of the image that is really drawn. Anchors are metres: they never depend on the resolution.
 */
export function mergeFrameMeta(sprite: Pick<ArtSprite, 'frames'>, pages: readonly AtlasPage[], resolution = 1): Record<string, FrameMeta> {
  const out: Record<string, FrameMeta> = {};
  for (const { data } of pages) for (const [name, m] of Object.entries(data.meta ?? {})) out[name] = { ...m };
  for (const [name, m] of Object.entries(sprite.frames ?? {})) {
    const base = out[name] ?? {};
    out[name] = { ...base, ...m, ...(base.anchors || m.anchors ? { anchors: { ...base.anchors, ...m.anchors } } : {}) };
  }
  if (resolution !== 1) for (const m of Object.values(out)) if (m.heightPx !== undefined) m.heightPx *= resolution;
  return out;
}

/** The names of the frames a sprite set draws (every frame of every clip), in clip order. */
export function usedFrameNames(sprite: Pick<ArtSprite, 'clips'>): string[] {
  const names = new Set<string>();
  for (const clip of Object.values(sprite.clips)) if (clip) for (const n of artClipFrames(clip)) names.add(n);
  return [...names];
}
