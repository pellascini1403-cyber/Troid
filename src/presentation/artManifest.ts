import type { AnchorPoint, ClipPhases, FrameMeta, SpriteSetDefinition } from './SpriteSetDefinition';
import { ANCHOR_IDS, ANIM_STATES, type AnchorId, type AnimState } from './vocabulary';

/**
 * THE ASSET CONTRACT (docs/ART-PIPELINE-2D.md, part B): what an art pack DECLARES so that the engine can use it without a line of
 * gameplay knowing it exists. PURE data and maths — no Pixi, no DOM, no `fetch`, no files — so the very same functions parse a manifest
 * in the browser (the loader), in Node (the build-time checker and the packer) and in the tests.
 *
 * Two kinds of file (both JSON, both versioned):
 *
 *   `art/index.json`            the INDEX: which packs exist, of which category, and WHEN each one is fetched (`boot`, `zone`, `lazy`)
 *   `art/<pack>/<id>.pack.json` a PACK: its atlases (an image, plus the JSON an atlas packer exports next to it) and the sprite sets
 *                               drawn from them: scale, pivot, clips, frame rate, anchors and tags
 *
 * The engine's runtime form of a sprite set stays `SpriteSetDefinition` (what `ActorSprite`, the animator and the validator already
 * speak): `toSpriteSetDefinition` is the one bridge from the declared contract to it. Nothing here mentions a sword, a hitbox or a
 * hurtbox as GAMEPLAY — anchors are POINTS THE ART DECLARES (docs/GAME-SPEC-2D.md §2.6); the numbers that decide a blow live in
 * `AttackDefinition`.
 *
 * Parsing NEVER throws: every problem comes back as an `ArtIssue` with the path of the field (`sprites[0].clips.idle.count`), so a
 * tool can show all of them at once and a person can fix them in one pass.
 */

export const ART_MANIFEST_VERSION = 1;

/** The kinds of art, which is also how packs are split (docs/ART-PIPELINE-2D.md §C): a pack belongs to ONE category. */
export const ART_CATEGORIES = ['player', 'enemies', 'environment', 'vfx', 'ui'] as const;
export type ArtCategory = (typeof ART_CATEGORIES)[number];

/**
 * When a pack is fetched. `boot`: with the game, AFTER the first frame (never before it); `zone`: when the hero enters one of its
 * `zones` (it is fetched during the room transition's fade); `lazy`: only when something asks for it by name (a lab, a stress scene).
 */
export const ART_LOAD_POLICIES = ['boot', 'zone', 'lazy'] as const;
export type ArtLoadPolicy = (typeof ART_LOAD_POLICIES)[number];

/** How final the art in a pack is: `awaiting-art` declares what the pack WILL hold and carries no images yet. */
export const ART_STATUSES = ['final', 'provisional', 'awaiting-art'] as const;
export type ArtStatus = (typeof ART_STATUSES)[number];

/** What to show when the real art lacks the clip a state asks for: the placeholder's own clip, or the real set's fallback chain. */
export const MISSING_CLIP_POLICIES = ['placeholder', 'chain'] as const;
export type MissingClipPolicy = (typeof MISSING_CLIP_POLICIES)[number];

/**
 * Names an artist may use that are not the engine's state ids. They are normalised when the manifest is read, so the engine only ever
 * sees its own vocabulary (`presentation/vocabulary.ts`) and gameplay never changes.
 */
export const CLIP_ALIASES: Readonly<Record<string, AnimState>> = {
  aerialAttack: 'attackAir',
  airAttack: 'attackAir',
  crouchAttack: 'attackCrouch',
  landing: 'land',
  damage: 'hurt',
  die: 'death',
};

export interface ArtIssue {
  level: 'error' | 'warn' | 'info';
  /** Where in the file: `atlases[1].width`, `sprites[0].clips.attack.phases`. */
  path: string;
  message: string;
}

export interface ArtAtlas {
  id: string;
  /** The image, relative to the pack manifest (`player_2x.png`). */
  source: string;
  /** The atlas packer's JSON (frame rectangles, trim) next to the image: where the frames are. Required while the pack carries art. */
  data?: string;
  /** Declared size of the image in pixels: the checker compares it with the file's real header. */
  width: number;
  height: number;
  /** Pixel density of THIS image relative to the pack's master (`1`): a half-size variant of the same frames is `0.5`. */
  resolution: number;
}

export interface ArtClip {
  /** Frame-name prefix: the frames are `<prefix><NN>` (`idle_00`, `idle_01`…). */
  frames: string;
  count: number;
  /** Frames per second (a `frameDuration` in milliseconds is converted when the manifest is read). */
  fps?: number;
  loop?: boolean;
  phases?: ClipPhases;
  tags: string[];
}

export interface ArtSprite {
  id: string;
  /**
   * Atlas ids that hold THESE frames, the master (highest `resolution`) first. Atlases of DIFFERENT resolution are variants of the same frames
   * (a phone takes the small one); atlases of the SAME resolution are the PAGES of one variant — the frames that do not fit in one image.
   */
  atlases: string[];
  /** Pixels per metre of the pack's master image: the ONLY link between the art's pixels and the world's metres. */
  artPxPerMeter: number;
  /** Visual size multiplier about the feet (art direction). It never touches collision, speed or any hitbox. */
  scale: number;
  /** Feet-centre pivot normalised to the (untrimmed) frame. */
  pivot: [number, number];
  /** Untrimmed frame size in pixels, when the manifest gives the pivot in pixels or wants the atlas data checked against it. */
  frameSize?: [number, number];
  /** Standing height of the character AS DRAWN, in metres at the nominal density (validation and fallback anchors). */
  height: number;
  missingClips: MissingClipPolicy;
  clips: Partial<Record<AnimState, ArtClip>>;
  /** Fixed anchors (metres relative to the feet, +x forward), used when a frame carries none of its own. */
  anchors?: Partial<Record<AnchorId, AnchorPoint>>;
  /** Per-frame data written in the manifest itself (otherwise it travels in the atlas JSON, `meta.troid`). */
  frames?: Record<string, FrameMeta>;
  tags: string[];
}

export interface ArtPack {
  manifestVersion: typeof ART_MANIFEST_VERSION;
  id: string;
  category: ArtCategory;
  status: ArtStatus;
  tags: string[];
  atlases: ArtAtlas[];
  sprites: ArtSprite[];
}

export interface ArtIndexEntry {
  id: string;
  category: ArtCategory;
  load: ArtLoadPolicy;
  /** Rooms (or regions) in which a `zone` pack is needed. */
  zones: string[];
  /** The pack manifest, relative to the index. */
  manifest: string;
  tags: string[];
}

export interface ArtIndex {
  manifestVersion: typeof ART_MANIFEST_VERSION;
  packs: ArtIndexEntry[];
}

export interface Parsed<T> {
  /** `null` when anything was an error. */
  value: T | null;
  issues: ArtIssue[];
}

// ------------------------------------------------------------------------------------------------------------ reading

const ID = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;
const TAG = /^[a-z0-9][a-z0-9_.:-]{0,31}$/;
const FRAME_PREFIX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
export const FRAME_NAME = /^[A-Za-z0-9_-]{1,40}$/;
const IMAGE_EXT = /\.(png|webp)$/i;
const JSON_EXT = /\.json$/i;
/** A mobile GPU is comfortable with ≤ 2048 px per side; larger atlases are allowed, with a warning. */
export const COMFORTABLE_ATLAS_SIDE = 2048;
export const MAX_ATLAS_SIDE = 4096;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A path inside the pack's own folder: relative, no `..`, no scheme, no backslashes — a manifest can never point outside its folder. */
export function isSafeRelativePath(p: string): boolean {
  if (p.length === 0 || p.length > 160) return false;
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p)) return false;
  return p.split('/').every((seg) => seg.length > 0 && seg !== '.' && seg !== '..');
}

/** Collects the issues of one file while it is read (shared with the atlas reader, `artAtlas.ts`). */
export class Reader {
  readonly issues: ArtIssue[] = [];
  error(path: string, message: string): void {
    this.issues.push({ level: 'error', path, message });
  }
  warn(path: string, message: string): void {
    this.issues.push({ level: 'warn', path, message });
  }
  get failed(): boolean {
    return this.issues.some((i) => i.level === 'error');
  }

  object(v: unknown, path: string): Record<string, unknown> | null {
    if (isObject(v)) return v;
    this.error(path, 'must be an object');
    return null;
  }

  /** Reports the keys an object has that the contract does not know (a typo is silent otherwise). */
  known(o: Record<string, unknown>, path: string, keys: readonly string[]): void {
    for (const k of Object.keys(o)) if (!keys.includes(k) && k !== '$schema' && k !== 'comment') this.warn(`${path}.${k}`.replace(/^\./, ''), `unknown key "${k}" (ignored)`);
  }

  string(v: unknown, path: string, opts: { pattern?: RegExp; what?: string } = {}): string | null {
    if (typeof v !== 'string' || v.length === 0) {
      this.error(path, 'must be a non-empty string');
      return null;
    }
    if (opts.pattern && !opts.pattern.test(v)) {
      this.error(path, `"${v}" is not ${opts.what ?? 'a valid name'}`);
      return null;
    }
    return v;
  }

  number(v: unknown, path: string, opts: { min?: number; max?: number; int?: boolean; exclusiveMin?: boolean } = {}): number | null {
    if (!isNumber(v)) {
      this.error(path, 'must be a number');
      return null;
    }
    if (opts.int && !Number.isInteger(v)) {
      this.error(path, `must be a whole number (got ${v})`);
      return null;
    }
    if (opts.min !== undefined && (opts.exclusiveMin ? v <= opts.min : v < opts.min)) {
      this.error(path, `must be ${opts.exclusiveMin ? 'greater than' : 'at least'} ${opts.min} (got ${v})`);
      return null;
    }
    if (opts.max !== undefined && v > opts.max) {
      this.error(path, `must be at most ${opts.max} (got ${v})`);
      return null;
    }
    return v;
  }

  pair(v: unknown, path: string, opts: { min?: number; max?: number } = {}): [number, number] | null {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(isNumber)) {
      this.error(path, 'must be a pair of numbers [x, y]');
      return null;
    }
    const [a, b] = v as [number, number];
    if ((opts.min !== undefined && (a < opts.min || b < opts.min)) || (opts.max !== undefined && (a > opts.max || b > opts.max))) {
      this.error(path, `values must be within ${opts.min ?? '−∞'} … ${opts.max ?? '∞'} (got ${JSON.stringify(v)})`);
      return null;
    }
    return [a, b];
  }

  tags(v: unknown, path: string): string[] {
    if (v === undefined) return [];
    if (!Array.isArray(v) || !v.every((t) => typeof t === 'string' && TAG.test(t))) {
      this.error(path, 'must be a list of short lowercase tags ([a-z0-9_.:-])');
      return [];
    }
    return [...new Set(v as string[])];
  }

  oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[], fallback: T): T {
    if (v === undefined) return fallback;
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
    this.error(path, `must be one of ${allowed.join(' | ')} (got ${JSON.stringify(v)})`);
    return fallback;
  }
}

const ATLAS_KEYS = ['id', 'source', 'data', 'width', 'height', 'resolution'] as const;
const CLIP_KEYS = ['frames', 'count', 'fps', 'frameDuration', 'loop', 'phases', 'tags'] as const;
const SPRITE_KEYS = ['id', 'atlases', 'artPxPerMeter', 'scale', 'pivot', 'pivotPx', 'frameSize', 'height', 'facing', 'missingClips', 'clips', 'anchors', 'frames', 'tags'] as const;
const PACK_KEYS = ['manifestVersion', 'id', 'category', 'status', 'tags', 'atlases', 'sprites'] as const;
const STATE_SET: ReadonlySet<string> = new Set(ANIM_STATES);
const ANCHOR_SET: ReadonlySet<string> = new Set(ANCHOR_IDS);

export function readAnchors(r: Reader, v: unknown, path: string): Partial<Record<AnchorId, AnchorPoint>> | undefined {
  if (v === undefined) return undefined;
  const o = r.object(v, path);
  if (!o) return undefined;
  const out: Partial<Record<AnchorId, AnchorPoint>> = {};
  for (const [k, p] of Object.entries(o)) {
    if (!ANCHOR_SET.has(k)) {
      r.error(`${path}.${k}`, `unknown anchor "${k}" (known: ${ANCHOR_IDS.join(', ')})`);
      continue;
    }
    const pt = r.pair(p, `${path}.${k}`, { min: -20, max: 20 });
    if (pt) out[k as AnchorId] = pt;
  }
  return out;
}

function readPhases(r: Reader, v: unknown, path: string, count: number | null): ClipPhases | undefined {
  if (v === undefined) return undefined;
  const o = r.object(v, path);
  if (!o) return undefined;
  const range = (key: 'startup' | 'active' | 'recovery'): [number, number] | null => {
    const raw = o[key];
    if (!Array.isArray(raw) || raw.length !== 2 || !raw.every((n) => Number.isInteger(n))) {
      r.error(`${path}.${key}`, 'must be a pair of frame indices [first, last]');
      return null;
    }
    const [lo, hi] = raw as [number, number];
    if (lo < 0 || hi < lo || (count !== null && hi >= count)) {
      r.error(`${path}.${key}`, `[${lo}, ${hi}] is not inside the clip's ${count ?? '?'} frames`);
      return null;
    }
    return [lo, hi];
  };
  const startup = range('startup');
  const active = range('active');
  const recovery = range('recovery');
  if (!startup || !active || !recovery) return undefined;
  if (!(startup[1] < active[0] && active[1] < recovery[0])) r.warn(path, 'the phases overlap or are out of order (startup → active → recovery)');
  return { startup, active, recovery };
}

function readClip(r: Reader, v: unknown, path: string): ArtClip | null {
  const o = r.object(v, path);
  if (!o) return null;
  r.known(o, path, CLIP_KEYS);
  const frames = r.string(o['frames'], `${path}.frames`, { pattern: FRAME_PREFIX, what: 'a frame-name prefix (letters, digits, _ and -)' });
  const count = r.number(o['count'], `${path}.count`, { min: 1, max: 96, int: true });
  let fps: number | undefined;
  if (o['fps'] !== undefined && o['frameDuration'] !== undefined) r.error(path, 'give "fps" or "frameDuration" (milliseconds per frame), not both');
  else if (o['fps'] !== undefined) fps = r.number(o['fps'], `${path}.fps`, { min: 0.25, max: 120 }) ?? undefined;
  else if (o['frameDuration'] !== undefined) {
    const ms = r.number(o['frameDuration'], `${path}.frameDuration`, { min: 8, max: 4000 });
    if (ms !== null) fps = 1000 / ms;
  }
  if (o['loop'] !== undefined && typeof o['loop'] !== 'boolean') r.error(`${path}.loop`, 'must be true or false');
  const phases = readPhases(r, o['phases'], `${path}.phases`, count);
  if (frames === null || count === null) return null;
  const clip: ArtClip = { frames, count, tags: r.tags(o['tags'], `${path}.tags`) };
  if (fps !== undefined) clip.fps = fps;
  if (typeof o['loop'] === 'boolean') clip.loop = o['loop'];
  if (phases) clip.phases = phases;
  return clip;
}

/** The per-frame data (`heightPx`, `anchors`) by frame name: written in the pack manifest, or exported by the artist's tool next to the atlas (`meta.troid`). */
export function readFrameMetaMap(r: Reader, v: unknown, path: string): Record<string, FrameMeta> | undefined {
  const fo = r.object(v, path);
  if (!fo) return undefined;
  const frames: Record<string, FrameMeta> = {};
  for (const [name, raw] of Object.entries(fo)) {
    const fp = `${path}.${name}`;
    if (!FRAME_NAME.test(name)) {
      r.error(fp, `"${name}" is not a valid frame name`);
      continue;
    }
    const m = r.object(raw, fp);
    if (!m) continue;
    r.known(m, fp, ['heightPx', 'anchors']);
    const meta: FrameMeta = {};
    if (m['heightPx'] !== undefined) {
      const h = r.number(m['heightPx'], `${fp}.heightPx`, { min: 0, exclusiveMin: true, max: 8192 });
      if (h !== null) meta.heightPx = h;
    }
    const a = readAnchors(r, m['anchors'], `${fp}.anchors`);
    if (a) meta.anchors = a;
    frames[name] = meta;
  }
  return frames;
}

function readSprite(r: Reader, v: unknown, path: string, atlasIds: ReadonlyMap<string, ArtAtlas>, awaitingArt: boolean): ArtSprite | null {
  const o = r.object(v, path);
  if (!o) return null;
  r.known(o, path, SPRITE_KEYS);
  const id = r.string(o['id'], `${path}.id`, { pattern: ID, what: 'a valid id ([a-z0-9_.:-])' });

  // atlases: the variants of the SAME frames at different resolutions
  let atlases: string[] = [];
  const rawAtlases = o['atlases'];
  if (!Array.isArray(rawAtlases) || (rawAtlases.length === 0 && !awaitingArt) || !rawAtlases.every((a) => typeof a === 'string')) {
    r.error(`${path}.atlases`, awaitingArt ? 'must be a list of atlas ids (empty while the art is awaited)' : 'must be a non-empty list of atlas ids');
  } else {
    atlases = [...new Set(rawAtlases as string[])];
    for (const a of atlases) if (!atlasIds.has(a)) r.error(`${path}.atlases`, `unknown atlas "${a}" (declared: ${[...atlasIds.keys()].join(', ') || 'none'})`);
    atlases.sort((a, b) => (atlasIds.get(b)?.resolution ?? 0) - (atlasIds.get(a)?.resolution ?? 0));
  }

  const artPxPerMeter = r.number(o['artPxPerMeter'], `${path}.artPxPerMeter`, { min: 0, exclusiveMin: true, max: 2000 });
  const scale = o['scale'] === undefined ? 1 : r.number(o['scale'], `${path}.scale`, { min: 0.25, max: 4 });
  const height = r.number(o['height'], `${path}.height`, { min: 0, exclusiveMin: true, max: 40 });
  if (o['facing'] !== undefined && o['facing'] !== 'right') r.error(`${path}.facing`, 'the art must face right ("right"): the engine mirrors it by the facing');

  // the frame size (untrimmed), the pivot (normalised, or in pixels of the frame)
  let frameSize: [number, number] | undefined;
  if (o['frameSize'] !== undefined) {
    const fs = r.pair(o['frameSize'], `${path}.frameSize`, { min: 1, max: MAX_ATLAS_SIDE });
    if (fs) frameSize = fs;
  }
  let pivot: [number, number] | null = null;
  if (o['pivot'] !== undefined && o['pivotPx'] !== undefined) r.error(path, 'give "pivot" (0…1) or "pivotPx" (pixels), not both');
  else if (o['pivot'] !== undefined) pivot = r.pair(o['pivot'], `${path}.pivot`, { min: 0, max: 1 });
  else if (o['pivotPx'] !== undefined) {
    const px = r.pair(o['pivotPx'], `${path}.pivotPx`, { min: 0, max: MAX_ATLAS_SIDE });
    if (px && !frameSize) r.error(`${path}.pivotPx`, 'needs "frameSize" to be turned into a pivot');
    else if (px && frameSize) {
      pivot = [px[0] / frameSize[0], px[1] / frameSize[1]];
      if (pivot[0] > 1 || pivot[1] > 1) {
        r.error(`${path}.pivotPx`, `[${px}] is outside the ${frameSize[0]} × ${frameSize[1]} frame`);
        pivot = null;
      }
    }
  } else r.error(`${path}.pivot`, 'the feet pivot is required: "pivot" (0…1) or "pivotPx"');

  const missingClips = r.oneOf(o['missingClips'], `${path}.missingClips`, MISSING_CLIP_POLICIES, 'placeholder');

  // clips: engine ids or their aliases
  const clips: Partial<Record<AnimState, ArtClip>> = {};
  const rawClips = r.object(o['clips'], `${path}.clips`);
  if (rawClips) {
    if (Object.keys(rawClips).length === 0) r.error(`${path}.clips`, 'declares no clip');
    for (const [name, raw] of Object.entries(rawClips)) {
      const state: string | undefined = STATE_SET.has(name) ? name : CLIP_ALIASES[name];
      if (!state) {
        r.error(`${path}.clips.${name}`, `"${name}" is not an animation state (known: ${ANIM_STATES.join(', ')}; aliases: ${Object.keys(CLIP_ALIASES).join(', ')})`);
        continue;
      }
      if (clips[state as AnimState]) {
        r.error(`${path}.clips.${name}`, `declares "${state}" twice (an alias and its state)`);
        continue;
      }
      const clip = readClip(r, raw, `${path}.clips.${name}`);
      if (clip) clips[state as AnimState] = clip;
    }
  }

  const anchors = readAnchors(r, o['anchors'], `${path}.anchors`);
  const frames = o['frames'] === undefined ? undefined : readFrameMetaMap(r, o['frames'], `${path}.frames`);

  if (id === null || artPxPerMeter === null || scale === null || height === null || pivot === null) return null;
  const sprite: ArtSprite = { id, atlases, artPxPerMeter, scale, pivot, height, missingClips, clips, tags: r.tags(o['tags'], `${path}.tags`) };
  if (frameSize) sprite.frameSize = frameSize;
  if (anchors) sprite.anchors = anchors;
  if (frames) sprite.frames = frames;
  return sprite;
}

function readAtlas(r: Reader, v: unknown, path: string): ArtAtlas | null {
  const o = r.object(v, path);
  if (!o) return null;
  r.known(o, path, ATLAS_KEYS);
  const id = r.string(o['id'], `${path}.id`, { pattern: ID, what: 'a valid id ([a-z0-9_.:-])' });
  const source = r.string(o['source'], `${path}.source`);
  if (source !== null) {
    if (!isSafeRelativePath(source)) r.error(`${path}.source`, `"${source}" must be a relative path inside the pack's folder (no "..", no scheme)`);
    else if (!IMAGE_EXT.test(source)) r.error(`${path}.source`, `"${source}" must be a .png or .webp image`);
  }
  let data: string | undefined;
  if (o['data'] !== undefined) {
    const d = r.string(o['data'], `${path}.data`);
    if (d !== null) {
      if (!isSafeRelativePath(d) || !JSON_EXT.test(d)) r.error(`${path}.data`, `"${d}" must be a relative .json path inside the pack's folder`);
      else data = d;
    }
  }
  const width = r.number(o['width'], `${path}.width`, { min: 1, max: MAX_ATLAS_SIDE, int: true });
  const height = r.number(o['height'], `${path}.height`, { min: 1, max: MAX_ATLAS_SIDE, int: true });
  if (width !== null && height !== null && (width > COMFORTABLE_ATLAS_SIDE || height > COMFORTABLE_ATLAS_SIDE)) {
    r.warn(path, `${width} × ${height} is over ${COMFORTABLE_ATLAS_SIDE} px on a side: a phone's GPU may not take it (docs/ART-PIPELINE-2D.md)`);
  }
  const resolution = o['resolution'] === undefined ? 1 : r.number(o['resolution'], `${path}.resolution`, { min: 0, exclusiveMin: true, max: 4 });
  if (id === null || source === null || width === null || height === null || resolution === null || !isSafeRelativePath(source) || !IMAGE_EXT.test(source)) return null;
  const atlas: ArtAtlas = { id, source, width, height, resolution };
  if (data !== undefined) atlas.data = data;
  return atlas;
}

/** Reads and checks a pack manifest. Never throws; `value` is `null` when anything is an error. */
export function parseArtPack(raw: unknown): Parsed<ArtPack> {
  const r = new Reader();
  const o = r.object(raw, '');
  if (!o) return { value: null, issues: r.issues };
  r.known(o, '', PACK_KEYS);
  if (o['manifestVersion'] !== ART_MANIFEST_VERSION) {
    r.error('manifestVersion', typeof o['manifestVersion'] === 'number' && o['manifestVersion'] > ART_MANIFEST_VERSION ? `version ${o['manifestVersion']} belongs to a newer game (this one reads ${ART_MANIFEST_VERSION})` : `must be ${ART_MANIFEST_VERSION}`);
    return { value: null, issues: r.issues };
  }
  const id = r.string(o['id'], 'id', { pattern: ID, what: 'a valid id ([a-z0-9_.:-])' });
  const category = ART_CATEGORIES.includes(o['category'] as ArtCategory) ? (o['category'] as ArtCategory) : null;
  if (category === null) r.error('category', `must be one of ${ART_CATEGORIES.join(' | ')}`);
  const status = r.oneOf(o['status'], 'status', ART_STATUSES, 'final');
  const tags = r.tags(o['tags'], 'tags');

  const atlases = new Map<string, ArtAtlas>();
  if (!Array.isArray(o['atlases'])) r.error('atlases', 'must be a list (empty while the pack awaits its art)');
  else {
    (o['atlases'] as unknown[]).forEach((a, i) => {
      const atlas = readAtlas(r, a, `atlases[${i}]`);
      if (!atlas) return;
      if (atlases.has(atlas.id)) r.error(`atlases[${i}].id`, `atlas "${atlas.id}" is declared twice`);
      else atlases.set(atlas.id, atlas);
    });
  }

  const sprites: ArtSprite[] = [];
  if (!Array.isArray(o['sprites'])) r.error('sprites', 'must be a list');
  else {
    const seen = new Set<string>();
    (o['sprites'] as unknown[]).forEach((s, i) => {
      const sprite = readSprite(r, s, `sprites[${i}]`, atlases, status === 'awaiting-art');
      if (!sprite) return;
      if (seen.has(sprite.id)) r.error(`sprites[${i}].id`, `sprite set "${sprite.id}" is declared twice`);
      seen.add(sprite.id);
      sprites.push(sprite);
    });
  }

  // a pack that carries art needs `idle` (the last resort of every state); one that awaits its art may declare it without images
  if (status !== 'awaiting-art') {
    if (atlases.size === 0) r.error('atlases', `a "${status}" pack needs at least one atlas (use status "awaiting-art" while there is no image yet)`);
    sprites.forEach((s, i) => {
      if (!s.clips.idle) r.error(`sprites[${i}].clips`, 'no "idle" clip: it is the last resort of every state');
    });
  }
  // an image alone says nothing about where its frames are: the packer's JSON is what the loader reads them from
  if (status !== 'awaiting-art') {
    for (const [i, a] of [...atlases.values()].entries()) if (a.data === undefined) r.error(`atlases[${i}].data`, `atlas "${a.id}" needs its "data": the JSON the packer exported next to the image (frame rectangles, trim)`);
  }
  // every atlas should be used by someone
  const used = new Set(sprites.flatMap((s) => s.atlases));
  for (const a of atlases.values()) if (!used.has(a.id)) r.warn(`atlases`, `atlas "${a.id}" is not used by any sprite set`);

  if (r.failed || id === null || category === null) return { value: null, issues: r.issues };
  return { value: { manifestVersion: ART_MANIFEST_VERSION, id, category, status, tags, atlases: [...atlases.values()], sprites }, issues: r.issues };
}

const INDEX_KEYS = ['manifestVersion', 'packs'] as const;
const INDEX_ENTRY_KEYS = ['id', 'category', 'load', 'zones', 'manifest', 'tags'] as const;

/** Reads and checks `art/index.json`. Never throws. */
export function parseArtIndex(raw: unknown): Parsed<ArtIndex> {
  const r = new Reader();
  const o = r.object(raw, '');
  if (!o) return { value: null, issues: r.issues };
  r.known(o, '', INDEX_KEYS);
  if (o['manifestVersion'] !== ART_MANIFEST_VERSION) {
    r.error('manifestVersion', `must be ${ART_MANIFEST_VERSION}`);
    return { value: null, issues: r.issues };
  }
  const packs: ArtIndexEntry[] = [];
  if (!Array.isArray(o['packs'])) r.error('packs', 'must be a list');
  else {
    const seen = new Set<string>();
    (o['packs'] as unknown[]).forEach((raw, i) => {
      const path = `packs[${i}]`;
      const e = r.object(raw, path);
      if (!e) return;
      r.known(e, path, INDEX_ENTRY_KEYS);
      const id = r.string(e['id'], `${path}.id`, { pattern: ID, what: 'a valid id ([a-z0-9_.:-])' });
      const category = ART_CATEGORIES.includes(e['category'] as ArtCategory) ? (e['category'] as ArtCategory) : null;
      if (category === null) r.error(`${path}.category`, `must be one of ${ART_CATEGORIES.join(' | ')}`);
      const load = r.oneOf(e['load'], `${path}.load`, ART_LOAD_POLICIES, 'lazy');
      const manifest = r.string(e['manifest'], `${path}.manifest`);
      if (manifest !== null && (!isSafeRelativePath(manifest) || !JSON_EXT.test(manifest))) r.error(`${path}.manifest`, `"${manifest}" must be a relative .json path`);
      let zones: string[] = [];
      if (e['zones'] !== undefined) {
        if (!Array.isArray(e['zones']) || !e['zones'].every((z) => typeof z === 'string' && ID.test(z))) r.error(`${path}.zones`, 'must be a list of room or region ids');
        else zones = [...new Set(e['zones'] as string[])];
      }
      if (load === 'zone' && zones.length === 0) r.error(`${path}.zones`, 'a "zone" pack needs the rooms it belongs to');
      if (load !== 'zone' && zones.length > 0) r.warn(`${path}.zones`, `"zones" only matters for load "zone" (this one is "${load}")`);
      if (id !== null) {
        if (seen.has(id)) r.error(`${path}.id`, `pack "${id}" is listed twice`);
        seen.add(id);
      }
      if (id === null || category === null || manifest === null || !isSafeRelativePath(manifest)) return;
      packs.push({ id, category, load, zones, manifest, tags: r.tags(e['tags'], `${path}.tags`) });
    });
  }
  return { value: r.failed ? null : { manifestVersion: ART_MANIFEST_VERSION, packs }, issues: r.issues };
}

// ------------------------------------------------------------------------------------------------ the bridge to the engine

/** The images that hold the frames of a sprite set at ONE resolution: usually one atlas; several (pages) when the frames do not fit in one. */
export interface ArtVariant {
  /** Pixel density of these images relative to the pack's master (`1`). */
  resolution: number;
  pages: ArtAtlas[];
}

/** The variants of a sprite set, the master (highest resolution) first. Atlases of the same resolution are the pages of one variant. */
export function atlasVariants(sprite: Pick<ArtSprite, 'atlases'>, atlases: ReadonlyMap<string, ArtAtlas>): ArtVariant[] {
  const byResolution = new Map<number, ArtAtlas[]>();
  for (const id of sprite.atlases) {
    const atlas = atlases.get(id);
    if (!atlas) continue;
    const pages = byResolution.get(atlas.resolution) ?? [];
    pages.push(atlas);
    byResolution.set(atlas.resolution, pages);
  }
  return [...byResolution.entries()].sort((a, b) => b[0] - a[0]).map(([resolution, pages]) => ({ resolution, pages }));
}

/** Effective metres per art pixel of a sprite at one of its atlas variants, INCLUDING the visual scale: what `ActorSprite` multiplies by. */
export function metresPerPixel(sprite: Pick<ArtSprite, 'artPxPerMeter' | 'scale'>, atlas: Pick<ArtAtlas, 'resolution'>): number {
  return sprite.scale / (sprite.artPxPerMeter * atlas.resolution);
}

/**
 * The reference a runtime definition keeps to the images it was made from: `art:<pack>/<sprite>@<resolution>`. The art library turns it back into
 * the pages to fetch (`parseArtAtlasRef`); nothing else reads it.
 */
export function artAtlasRef(packId: string, spriteId: string, resolution: number): string {
  return `art:${packId}/${spriteId}@${resolution}`;
}

export function parseArtAtlasRef(ref: string): { packId: string; spriteId: string; resolution: number } | null {
  const m = /^art:([^/@]+)\/([^/@]+)@([0-9.]+)$/.exec(ref);
  const resolution = m ? Number(m[3]) : NaN;
  return m && m[1] && m[2] && Number.isFinite(resolution) && resolution > 0 ? { packId: m[1], spriteId: m[2], resolution } : null;
}

/** The id of the runtime definition of a sprite set (what the asset manager caches by): the pack disambiguates equal sprite ids of two packs. */
export function artSetId(packId: string, spriteId: string): string {
  return `${packId}/${spriteId}`;
}

/**
 * The engine's runtime form of a sprite set drawn from one variant. `artPxPerMeter` becomes the density OF THAT IMAGE (master density ×
 * the variant's resolution) so that a half-size variant is simply scaled up by two: the same frames, the same metres, the same pivot, the same anchors
 * — nothing that gameplay reads changes with the resolution of the art.
 */
export function toSpriteSetDefinition(packId: string, sprite: ArtSprite, variant: Pick<ArtVariant, 'resolution'>): SpriteSetDefinition {
  const clips: SpriteSetDefinition['clips'] = {};
  for (const [state, c] of Object.entries(sprite.clips) as Array<[AnimState, ArtClip]>) {
    clips[state] = { frames: c.frames, count: c.count, ...(c.fps !== undefined ? { fps: c.fps } : {}), ...(c.loop !== undefined ? { loop: c.loop } : {}), ...(c.phases ? { phases: c.phases } : {}) };
  }
  const def: SpriteSetDefinition = {
    id: artSetId(packId, sprite.id),
    atlas: artAtlasRef(packId, sprite.id, variant.resolution),
    artPxPerMeter: sprite.artPxPerMeter * variant.resolution,
    pivot: sprite.pivot,
    height: sprite.height,
    clips,
  };
  if (sprite.scale !== 1) def.visualScale = sprite.scale;
  if (sprite.anchors) def.anchors = sprite.anchors;
  if (sprite.missingClips === 'chain') def.missingClips = 'chain';
  return def;
}

/**
 * Which variant of a sprite set to load for a screen: the SMALLEST one that still has at least `tolerance` of the pixels the screen will draw
 * (a phone gets the half-size atlas, a 4K monitor the master), or the largest there is. `drawnPxPerMetre` is `ppm × resolution` of the viewport.
 */
export function chooseAtlasVariant(sprite: Pick<ArtSprite, 'artPxPerMeter' | 'scale' | 'atlases'>, atlases: ReadonlyMap<string, ArtAtlas>, drawnPxPerMetre: number, tolerance = 0.85): ArtVariant | null {
  const variants = atlasVariants(sprite, atlases);
  if (variants.length === 0) return null;
  // what the screen draws per art pixel's worth of metres: an image is "enough" when its density × the wanted tolerance covers it
  const needed = drawnPxPerMetre * sprite.scale * tolerance;
  const enough = variants.filter((v) => sprite.artPxPerMeter * v.resolution >= needed).sort((a, b) => a.resolution - b.resolution);
  return enough[0] ?? variants[0] ?? null;
}

/** The states a sprite set does not have a clip for, out of the ones the game wants: what is still to be drawn. */
export function missingClips(sprite: Pick<ArtSprite, 'clips'>, wanted: readonly AnimState[]): AnimState[] {
  return wanted.filter((s) => !sprite.clips[s]);
}

/** Frame names of a clip: `idle_00 … idle_07`. */
export function artClipFrames(clip: Pick<ArtClip, 'frames' | 'count'>): string[] {
  return Array.from({ length: clip.count }, (_, i) => `${clip.frames}${String(i).padStart(2, '0')}`);
}
