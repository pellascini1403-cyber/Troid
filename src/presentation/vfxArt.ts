import type { ArtIssue, ArtPack } from './artManifest';

/**
 * THE ART OF THE LIGHT (docs/PROMPT8-LOG.md, phase H; docs/ART-PIPELINE-2D.md §M.14): what the effects of the game are made of, delivered as packs of the `vfx` category that the game fetches at the start. Two kinds of
 * picture, told apart by two tags on each sprite set:
 *
 *   `vfx:shape` + `shape:<name>`   one picture of a SHAPE — the particles and the flashes of the effects are made of the ten of them (`glow`, `spark`, `shard`, `ring`, `rune`, `dust`, `ink`, `streak`, `arc`, `chevron`).
 *                                  They are WHITE MASKS (alpha is the light): the game tints them with the colour of the palette slot, so the hero's light is cyan, an enemy's violet and ink black whatever is in the image.
 *   `vfx:seq` + `seq:<name>`       a SEQUENCE of frames played over the life of one effect (the slash that sweeps, the blow that lands…). Its time is the effect's own (`life` in the data), not a rate of the art.
 *
 * All the shapes must be on ONE page of the atlas (the particle container of the effects draws from one texture), and the game uses the art's shapes only when it has all ten — otherwise it draws them itself, as it always did.
 * A sequence that is missing is simply not played (the effects bound to it have their other layers). PURE: no Pixi, no file.
 */
export const VFX_SHAPE_NAMES = ['glow', 'spark', 'shard', 'ring', 'rune', 'dust', 'ink', 'streak', 'arc', 'chevron'] as const;
export type VfxShapeName = (typeof VFX_SHAPE_NAMES)[number];

/** The sequences the game plays, and what each is for. */
export const VFX_SEQUENCE_NAMES = [
  'slash_body', 'slash_edge', 'impact', 'bolt_body', 'bolt_core', 'bolt_impact', 'ink_splash', 'ink_splash_gloss', 'ink_column', 'ink_column_glow', 'pillar', 'aura',
] as const;
export type VfxSequenceName = (typeof VFX_SEQUENCE_NAMES)[number];

const SHAPES: ReadonlySet<string> = new Set(VFX_SHAPE_NAMES);
const SEQUENCES: ReadonlySet<string> = new Set(VFX_SEQUENCE_NAMES);

export interface VfxTags {
  kind: 'shape' | 'seq' | null;
  /** The name it answers to, or `null` when it names none (or one the game does not know). */
  name: string | null;
  problems: string[];
}

/** Reads the tags of a sprite set of a `vfx` pack. A set with neither `vfx:shape` nor `vfx:seq` says nothing of the light. Never throws. */
export function readVfxTags(tags: readonly string[]): VfxTags {
  const out: VfxTags = { kind: null, name: null, problems: [] };
  const isShape = tags.includes('vfx:shape');
  const isSeq = tags.includes('vfx:seq');
  if (!isShape && !isSeq) return out;
  if (isShape && isSeq) {
    out.problems.push('is both a "vfx:shape" and a "vfx:seq": it is one or the other');
    return out;
  }
  out.kind = isShape ? 'shape' : 'seq';
  const prefix = isShape ? 'shape:' : 'seq:';
  const names = tags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
  if (names.length === 0) out.problems.push(`is a "${isShape ? 'vfx:shape' : 'vfx:seq'}" but says no "${prefix}<name>"`);
  else if (names.length > 1) out.problems.push(`names ${names.length} ${isShape ? 'shapes' : 'sequences'} (${names.join(', ')}): it is exactly one`);
  else if (!(isShape ? SHAPES : SEQUENCES).has(names[0]!)) out.problems.push(`"${prefix}${names[0]}" is not ${isShape ? 'a shape' : 'a sequence'} of the game (${(isShape ? VFX_SHAPE_NAMES : VFX_SEQUENCE_NAMES).join(', ')})`);
  else out.name = names[0]!;
  return out;
}

export interface VfxParts {
  /** `shape name → sprite id` (the first set that claims a name keeps it). */
  shapes: Map<VfxShapeName, string>;
  sequences: Map<VfxSequenceName, string>;
}

/** The sprite sets of a list that are the shapes and the sequences of the light. */
export function vfxParts(sprites: ReadonlyArray<{ id: string; tags: readonly string[] }>): VfxParts {
  const out: VfxParts = { shapes: new Map(), sequences: new Map() };
  for (const s of sprites) {
    const { kind, name } = readVfxTags(s.tags);
    if (kind === null || name === null) continue;
    if (kind === 'shape') {
      if (!out.shapes.has(name as VfxShapeName)) out.shapes.set(name as VfxShapeName, s.id);
    } else if (!out.sequences.has(name as VfxSequenceName)) out.sequences.set(name as VfxSequenceName, s.id);
  }
  return out;
}

/** Whether a set of shapes is whole: the game draws with the art's shapes only when it has all of them. */
export const hasEveryShape = (shapes: ReadonlyMap<VfxShapeName, string>): boolean => VFX_SHAPE_NAMES.every((n) => shapes.has(n));

/**
 * What a pack says of the light, against what the game needs. Errors only for what cannot be drawn (a tag that names nothing, a picture with no `idle` clip); the rest are warnings (the game draws its own shapes, or plays
 * one effect layer less). Looks only at the packs of the `vfx` category: the check of the repository calls it for those.
 */
export function vfxArtIssues(pack: Pick<ArtPack, 'id' | 'status' | 'sprites'>): ArtIssue[] {
  const out: ArtIssue[] = [];
  if (pack.status === 'awaiting-art') return out;
  const claimed = new Map<string, string>();
  const pages = new Set<string>();
  for (const sprite of pack.sprites) {
    const path = `sprites.${sprite.id}`;
    const tags = readVfxTags(sprite.tags);
    for (const problem of tags.problems) out.push({ level: 'error', path, message: problem });
    if (tags.kind === null || tags.name === null) continue;
    const key = `${tags.kind}/${tags.name}`;
    const other = claimed.get(key);
    if (other !== undefined) out.push({ level: 'warn', path, message: `claims the same ${tags.kind === 'shape' ? 'shape' : 'sequence'} as ${other} (${tags.name}): only one can be drawn` });
    else claimed.set(key, sprite.id);
    const frames = sprite.clips.idle?.count ?? 0;
    if (frames === 0) out.push({ level: 'error', path, message: 'has no "idle" clip: a still picture is an idle clip of one frame' });
    else if (tags.kind === 'shape' && frames > 1) out.push({ level: 'warn', path, message: `a shape is one picture: the ${frames - 1} after the first are never drawn` });
    else if (tags.kind === 'seq' && frames < 2) out.push({ level: 'warn', path, message: 'a sequence of one frame is a still: it plays as one, and a shape is the better way to say it' });
    if (tags.kind === 'shape') for (const a of sprite.atlases ?? []) pages.add(a);
  }
  if (pages.size > 1) out.push({ level: 'warn', path: pack.id, message: `the shapes are on ${pages.size} pages of the atlas: the particles of the effects draw from one texture, so the game draws its own shapes until they are all on one page` });
  return out;
}

/**
 * What the `vfx` packs say TOGETHER (the shapes are in one pack and the sequences in another): the game uses the art's shapes only with all ten, and plays a sequence only if it is there. Warnings: the game covers each
 * with what it draws itself (its own shapes; the effect without that layer).
 */
export function vfxCoverageIssues(packs: ReadonlyArray<Pick<ArtPack, 'id' | 'status' | 'sprites'>>): ArtIssue[] {
  const out: ArtIssue[] = [];
  const shapes = new Map<VfxShapeName, string>();
  const sequences = new Map<VfxSequenceName, string>();
  for (const pack of packs) {
    if (pack.status === 'awaiting-art') continue;
    const parts = vfxParts(pack.sprites);
    for (const [k, v] of parts.shapes) if (!shapes.has(k)) shapes.set(k, v);
    for (const [k, v] of parts.sequences) if (!sequences.has(k)) sequences.set(k, v);
  }
  if (shapes.size > 0 && !hasEveryShape(shapes)) {
    const lacking = VFX_SHAPE_NAMES.filter((n) => !shapes.has(n));
    out.push({ level: 'warn', path: 'vfx', message: `the art of the light lacks the shape${lacking.length > 1 ? 's' : ''} ${lacking.join(', ')}: the game draws all of its shapes itself until it has every one` });
  }
  if (sequences.size > 0) {
    const lacking = VFX_SEQUENCE_NAMES.filter((n) => !sequences.has(n));
    if (lacking.length > 0) out.push({ level: 'warn', path: 'vfx', message: `the art of the light lacks the sequence${lacking.length > 1 ? 's' : ''} ${lacking.join(', ')}: the effects that play ${lacking.length > 1 ? 'them' : 'it'} go without that layer` });
  }
  return out;
}
