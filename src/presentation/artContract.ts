import type { ArtIssue } from './artManifest';
import type { AtlasMeta, SpriteSetDefinition } from './SpriteSetDefinition';
import { validateSpriteSet } from './validateSpriteSet';
import type { AnimState } from './vocabulary';

/**
 * WHAT THE GAME DOES WITH A SPRITE SET THAT DOES NOT MEET THE CONTRACT (docs/ART-PIPELINE-2D.md, parts C and E), as ONE pure function: the art library applies it
 * when it loads a set, and the build-time checker applies it to the very same data — so that `npm run assets:check` says, before any browser is opened, exactly
 * what the game will do with each clip.
 *
 *  - a CLIP that breaks the contract (a frame missing from the atlas, phases outside its frames, a sword that is not in the right hand, no sword anchors on a
 *    blow) is LEFT OUT: its state falls back (the animator's chain, or the placeholder's own clip) and the rest of the set is real art;
 *  - the whole SET is refused only when `idle` — the last resort of every state — is broken, or when something about the set as a whole is (frames that do not
 *    share one original size, a page whose data does not match its image, a pivot outside the frame…).
 */
export interface DroppedClip {
  state: AnimState;
  reason: string;
}

export interface ContractResult {
  /** The definition to draw with: the requested one without the clips that were left out. */
  def: SpriteSetDefinition;
  dropped: DroppedClip[];
  /** What refuses the whole set (empty: the set is usable). */
  refused: string[];
  /** What is worth saying and does not stop anything (phases that overlap, a scale that does not match the height…). */
  warnings: string[];
}

/**
 * `wanted`: the definition asked for. `meta`: the per-frame data. `available`: the names of the frames the pages really hold. `cross`: what the check of the
 * set against its pages found (`checkSpriteFrames`): errors whose path ends in `.clips.<state>` belong to that clip; any other error refuses the set.
 */
export function applyContract(wanted: SpriteSetDefinition, meta: AtlasMeta, available: ReadonlySet<string>, cross: readonly ArtIssue[]): ContractResult {
  const broken = new Map<AnimState, string>();
  const refused: string[] = [];
  const warnings: string[] = [];

  for (const i of cross) {
    if (i.level === 'warn') warnings.push(i.message);
    if (i.level !== 'error') continue;
    const state = /\.clips\.([A-Za-z0-9]+)$/.exec(i.path)?.[1] as AnimState | undefined;
    if (state && wanted.clips[state]) broken.set(state, broken.get(state) ?? i.message);
    else refused.push(i.message);
  }

  // the same contract the placeholder is held to (the sword in the hand, a scale that matches its height…), asked of each clip on its own with the `idle`
  // beside it: what the `idle` alone makes wrong (the pivot, the height) refuses the set; what a clip adds is that clip's
  const idle = wanted.clips.idle;
  const baseline = validateSpriteSet({ ...wanted, clips: idle ? { idle } : {} }, meta, available).filter((i) => i.level !== 'info');
  for (const i of baseline) (i.level === 'error' ? refused : warnings).push(i.message);
  const known = new Set(baseline.map((i) => i.message));
  for (const [state, clip] of Object.entries(wanted.clips) as Array<[AnimState, NonNullable<SpriteSetDefinition['clips'][AnimState]>]>) {
    if (state === 'idle') continue;
    const own = validateSpriteSet({ ...wanted, clips: { ...(idle ? { idle } : {}), [state]: clip } }, meta, available).filter((i) => i.level !== 'info' && !known.has(i.message));
    for (const i of own) if (i.level === 'warn') warnings.push(i.message);
    const error = own.find((i) => i.level === 'error');
    if (error && !broken.has(state)) broken.set(state, error.message);
  }
  if (broken.has('idle')) refused.push(`clip "idle": ${broken.get('idle')}`);

  const dropped: DroppedClip[] = [...broken.entries()].filter(([state]) => state !== 'idle').map(([state, reason]) => ({ state, reason }));
  const clips = { ...wanted.clips };
  for (const d of dropped) delete clips[d.state];
  return { def: { ...wanted, clips }, dropped, refused: [...new Set(refused)], warnings: [...new Set(warnings)] };
}
