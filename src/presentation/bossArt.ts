import type { ArtIssue, ArtPack } from './artManifest';

/**
 * THE ART OF A BOSS (docs/PROMPT8-LOG.md, phase F; docs/ART-PIPELINE-2D.md part M). A guardian is drawn in PARTS, because the game moves them: its pose is the state of the simulation, which the view reads
 * (`render/GuardianView`) — the body sinks and leans on a wind-up, the crest rises, the shards lift, the eye burns brighter, and when it falls the body melts into the pool it stands in. So its art is not a
 * clip of frames but a handful of pictures, each with a job. A pack of the `enemies` category says whose they are and which is which with two tags on each sprite set:
 *
 *   `boss:<lookId>`   whose part it is (the `view.lookId` of the guardian's definition: `ink_warden`)
 *   `part:<name>`     which one: `body` (stands on its feet: pivot bottom centre), `eye`, `crest` (three frames: dim, awake, enraged), `shard` (the game hangs two of it) and `pool` (pivot bottom centre)
 *
 * (The body has two frames — the ink, and the same silhouette in white, the flash of a hit.)
 * With every part the view draws the boss with the art; with any missing it keeps drawing it with its shapes, exactly as before: a boss is never half-painted. PURE: no Pixi, no file.
 */
export const GUARDIAN_PARTS = ['body', 'eye', 'crest', 'shard', 'pool'] as const;
export type GuardianPartName = (typeof GUARDIAN_PARTS)[number];
const PART_SET: ReadonlySet<string> = new Set(GUARDIAN_PARTS);

/** The states of the crest, one frame each: it waits, it is awake, it burns (the second phase). */
export const CREST_FRAMES = 3;
/** The body: the ink, and its white flash. */
export const BODY_FRAMES = 2;

export interface BossTags {
  /** Whose part this is, or `null` when the sprite set says nothing of a boss. */
  look: string | null;
  /** Which part, or `null` when it names none (or one that does not exist). */
  part: GuardianPartName | null;
  problems: string[];
}

/** Reads the tags of a sprite set: the boss it is a part of and which part. Never throws. */
export function readBossTags(tags: readonly string[]): BossTags {
  const out: BossTags = { look: null, part: null, problems: [] };
  const looks = tags.filter((t) => t.startsWith('boss:')).map((t) => t.slice(5));
  // (a set with no `boss:` tag says nothing of a boss: its `part:` tags may be an enemy's — `presentation/enemyArt` — or the scenery's)
  if (looks.length === 0) return out;
  const parts = tags.filter((t) => t.startsWith('part:')).map((t) => t.slice(5));
  if (looks.length > 1) out.problems.push(`names ${looks.length} bosses (${looks.join(', ')}): it is a part of exactly one`);
  out.look = looks[0]!;
  if (parts.length > 1) out.problems.push(`names ${parts.length} parts (${parts.join(', ')}): it is exactly one`);
  if (parts.length > 0) {
    if (PART_SET.has(parts[0]!)) out.part = parts[0] as GuardianPartName;
    else out.problems.push(`"part:${parts[0]}" is not a part of a boss (${GUARDIAN_PARTS.join(', ')})`);
  }
  if (parts.length === 0) out.problems.push(`is a part of "${out.look}" but says no "part:<name>" (${GUARDIAN_PARTS.join(', ')})`);
  return out;
}

/** The sprite sets of a list that are the parts of each boss: `look → part → sprite id` (the first one that claims a part keeps it). */
export function bossParts(sprites: ReadonlyArray<{ id: string; tags: readonly string[] }>): Map<string, Map<GuardianPartName, string>> {
  const out = new Map<string, Map<GuardianPartName, string>>();
  for (const s of sprites) {
    const { look, part } = readBossTags(s.tags);
    if (look === null || part === null) continue;
    const parts = out.get(look) ?? new Map<GuardianPartName, string>();
    if (!parts.has(part)) parts.set(part, s.id);
    out.set(look, parts);
  }
  return out;
}

/** How many pictures the game draws of a part. */
export const framesNeeded = (part: GuardianPartName): number => (part === 'crest' ? CREST_FRAMES : part === 'body' ? BODY_FRAMES : 1);

/** What a pack says of the bosses it draws, against what the game needs: every part, once, and a crest with a frame for each of its states. Errors only for what cannot be drawn; the rest are warnings (the shapes cover it). */
export function bossArtIssues(pack: Pick<ArtPack, 'id' | 'status' | 'sprites'>): ArtIssue[] {
  const out: ArtIssue[] = [];
  if (pack.status === 'awaiting-art') return out;
  const claimed = new Map<string, string>();
  for (const sprite of pack.sprites) {
    const path = `sprites.${sprite.id}`;
    const tags = readBossTags(sprite.tags);
    for (const problem of tags.problems) out.push({ level: 'error', path, message: problem });
    if (tags.look === null || tags.part === null) continue;
    const key = `${tags.look}/${tags.part}`;
    const other = claimed.get(key);
    if (other !== undefined) out.push({ level: 'warn', path, message: `claims the same part as ${other} (${tags.look} ${tags.part}): only one can be drawn` });
    else claimed.set(key, sprite.id);
    const frames = sprite.clips.idle?.count ?? 0;
    if (frames === 0) out.push({ level: 'error', path, message: 'has no "idle" clip: a still picture is an idle clip of one frame' });
    else if (tags.part === 'crest' && frames < CREST_FRAMES) out.push({ level: 'warn', path, message: `the crest has ${frames} frame${frames === 1 ? '' : 's'} and the game shows it in ${CREST_FRAMES} states (dim, awake, enraged): the missing ones repeat the last` });
    else if (tags.part === 'body' && frames < BODY_FRAMES) out.push({ level: 'warn', path, message: 'the body has one frame: the second is the white flash of a hit, and without it a hit shows no flash' });
    else if (framesNeeded(tags.part) < frames) out.push({ level: 'warn', path, message: `a ${tags.part} has ${framesNeeded(tags.part)} picture${framesNeeded(tags.part) === 1 ? '' : 's'}: the ${frames - framesNeeded(tags.part)} after ${framesNeeded(tags.part) === 1 ? 'it' : 'them'} are never drawn` });
  }
  for (const [look, parts] of bossParts(pack.sprites)) {
    const lacking = GUARDIAN_PARTS.filter((p) => !parts.has(p));
    if (lacking.length > 0) out.push({ level: 'warn', path: pack.id, message: `the art of "${look}" lacks ${lacking.join(', ')}: the game draws that boss with its shapes until it has every part` });
  }
  return out;
}
