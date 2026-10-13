import type { ArtIssue, ArtPack } from './artManifest';

/**
 * THE ART OF AN INK CREATURE (docs/PROMPT8-LOG.md, phase G; docs/ART-PIPELINE-2D.md part M): an ordinary enemy — the Ink Slime — is drawn in PARTS, like the boss before it, because the game moves them: its pose is the state of the
 * simulation, which the view reads (`render/ProceduralActor`) — the body squashes and stretches about its feet, the eyes burn and squint, the sigil in its chest flares as it winds up, the bristle rises along its back, and when it
 * falls it melts into the pool it rides in. So its art is not a clip of frames but a handful of pictures, each with a job. A pack of the `enemies` category says whose they are and which is which with two tags on each sprite set:
 *
 *   `enemy:<lookId>`   whose part it is (the `view.proceduralId` of the enemy's definition: `ink_slime`)
 *   `part:<name>`      which one: `body` (stands on its feet: pivot bottom centre; several frames are a LOOP — the surface of the ink "boils", the way a hand-drawn thing is kept alive), `flash` (the same silhouette in
 *                      white, one frame: the flash of a hit), `eyes`, `sigil` (both centred on themselves), `spines` (three frames, in the body's own frame: none, some, all — the bristle that rises as it winds up) and `pool` (pivot bottom centre)
 *
 * WHERE the eyes and the sigil stand on the body is said by the body's own anchors: `head` for the eyes and `vfx_origin` for the sigil (metres from the feet, +x forward — the contract's own anchors, read like any art's).
 * With every part (and both anchors) the view draws the creature with the art; with any missing it keeps drawing it with its shapes, exactly as before: a creature is never half-painted. PURE: no Pixi, no file.
 */
export const ENEMY_PARTS = ['body', 'flash', 'eyes', 'sigil', 'spines', 'pool'] as const;
export type EnemyPartName = (typeof ENEMY_PARTS)[number];
const PART_SET: ReadonlySet<string> = new Set(ENEMY_PARTS);

/** The states of the bristle, one frame each: a few nubs, some spines, all of them. */
export const SPINE_FRAMES = 3;

export interface EnemyTags {
  /** Whose part this is, or `null` when the sprite set says nothing of an enemy. */
  look: string | null;
  /** Which part, or `null` when it names none (or one that does not exist). */
  part: EnemyPartName | null;
  problems: string[];
}

/** Reads the tags of a sprite set: the enemy it is a part of and which part. A set with no `enemy:` tag says nothing of one (its `part:` tags are not ours: a boss has its own). Never throws. */
export function readEnemyTags(tags: readonly string[]): EnemyTags {
  const out: EnemyTags = { look: null, part: null, problems: [] };
  const looks = tags.filter((t) => t.startsWith('enemy:')).map((t) => t.slice(6));
  if (looks.length === 0) return out;
  const parts = tags.filter((t) => t.startsWith('part:')).map((t) => t.slice(5));
  if (looks.length > 1) out.problems.push(`names ${looks.length} enemies (${looks.join(', ')}): it is a part of exactly one`);
  out.look = looks[0]!;
  if (parts.length > 1) out.problems.push(`names ${parts.length} parts (${parts.join(', ')}): it is exactly one`);
  if (parts.length === 0) out.problems.push(`is a part of "${out.look}" but says no "part:<name>" (${ENEMY_PARTS.join(', ')})`);
  else if (PART_SET.has(parts[0]!)) out.part = parts[0] as EnemyPartName;
  else out.problems.push(`"part:${parts[0]}" is not a part of an enemy (${ENEMY_PARTS.join(', ')})`);
  return out;
}

/** The sprite sets of a list that are the parts of each enemy: `look → part → sprite id` (the first one that claims a part keeps it). */
export function enemyParts(sprites: ReadonlyArray<{ id: string; tags: readonly string[] }>): Map<string, Map<EnemyPartName, string>> {
  const out = new Map<string, Map<EnemyPartName, string>>();
  for (const s of sprites) {
    const { look, part } = readEnemyTags(s.tags);
    if (look === null || part === null) continue;
    const parts = out.get(look) ?? new Map<EnemyPartName, string>();
    if (!parts.has(part)) parts.set(part, s.id);
    out.set(look, parts);
  }
  return out;
}

/** How many pictures the game draws of a part: the body, as many as it has (a loop); the bristle, three states; the rest, one. */
export const enemyFramesNeeded = (part: EnemyPartName): number | null => (part === 'body' ? null : part === 'spines' ? SPINE_FRAMES : 1);

/** What a pack says of the enemies it draws, against what the game needs: every part, once, and a bristle with a frame for each of its states. Errors only for what cannot be drawn; the rest are warnings (the shapes cover it). */
export function enemyArtIssues(pack: Pick<ArtPack, 'id' | 'status' | 'sprites'>): ArtIssue[] {
  const out: ArtIssue[] = [];
  if (pack.status === 'awaiting-art') return out;
  const claimed = new Map<string, string>();
  for (const sprite of pack.sprites) {
    const path = `sprites.${sprite.id}`;
    const tags = readEnemyTags(sprite.tags);
    for (const problem of tags.problems) out.push({ level: 'error', path, message: problem });
    if (tags.look === null || tags.part === null) continue;
    const key = `${tags.look}/${tags.part}`;
    const other = claimed.get(key);
    if (other !== undefined) out.push({ level: 'warn', path, message: `claims the same part as ${other} (${tags.look} ${tags.part}): only one can be drawn` });
    else claimed.set(key, sprite.id);
    const frames = sprite.clips.idle?.count ?? 0;
    const need = enemyFramesNeeded(tags.part);
    if (frames === 0) out.push({ level: 'error', path, message: 'has no "idle" clip: a still picture is an idle clip of one frame' });
    else if (tags.part === 'spines' && frames < SPINE_FRAMES) out.push({ level: 'warn', path, message: `the bristle has ${frames} frame${frames === 1 ? '' : 's'} and the game shows it in ${SPINE_FRAMES} states (none, some, all): the missing ones repeat the last` });
    else if (need !== null && need < frames) out.push({ level: 'warn', path, message: `a ${tags.part} has ${need} picture${need === 1 ? '' : 's'}: the ${frames - need} after ${need === 1 ? 'it' : 'them'} are never drawn` });
  }
  for (const [look, parts] of enemyParts(pack.sprites)) {
    const lacking = ENEMY_PARTS.filter((p) => !parts.has(p));
    if (lacking.length > 0) out.push({ level: 'warn', path: pack.id, message: `the art of "${look}" lacks ${lacking.join(', ')}: the game draws that enemy with its shapes until it has every part` });
    // where the eyes and the sigil stand on the body: its `head` and `vfx_origin` anchors
    const body = pack.sprites.find((s) => s.id === parts.get('body'));
    if (body) {
      const missing = (['head', 'vfx_origin'] as const).filter((a) => !body.anchors?.[a]);
      if (missing.length > 0) out.push({ level: 'warn', path: `sprites.${body.id}`, message: `the body of "${look}" says no ${missing.map((a) => `"${a}"`).join(' and ')} anchor${missing.length > 1 ? 's' : ''} (where the eyes and the sigil stand, in metres from the feet): the game draws that enemy with its shapes until it does` });
    }
  }
  return out;
}
