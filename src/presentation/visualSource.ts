import type { SpriteSetDefinition } from './SpriteSetDefinition';
import type { AnimState } from './vocabulary';

/**
 * WHICH LOOK DRAWS A STATE (docs/ART-PIPELINE-2D.md, part D): the protagonist has TWO looks at once — the placeholder (always there) and, when it has been
 * loaded, the real art — and each frame one of them is shown. PURE: the decision is a function of the mode, of what the art provides and of the state, so it is
 * tested without a GPU and can never depend on gameplay.
 *
 *  - `auto`         the real art where it can stand for the state, the placeholder where it cannot (the default)
 *  - `placeholder`  always the placeholder: the way back, at any time
 *  - `art`          the real art always — its own fallback chain, ending at its `idle`, for whatever it lacks (to judge the art on its own)
 */
export const VISUAL_MODES = ['auto', 'placeholder', 'art'] as const;
export type VisualMode = (typeof VISUAL_MODES)[number];

/** The look on screen. */
export type VisualSource = 'art' | 'placeholder';

/** What a set needs to expose for the choice: its clips, and what to do for a state it has none for. */
export type VisualSet = Pick<SpriteSetDefinition, 'clips' | 'missingClips'>;

/**
 * What the art may stand in with when it lacks a state's own clip, in `auto` — and ONLY these. The animator's own fallback chain (`ANIM_FALLBACKS`) is wider
 * and ends at `idle` for everything, which is right inside a set (something must be drawn) but wrong for choosing between two looks: a sword swing is not a
 * cast and an idle is not a dash. So here a state is "provided" only by a clip that really is the same thing for the eye:
 *  - the gaits stand for each other (`walk`, `run`, `move`) and so do the two halves of a jump (`jump`, `fall`);
 *  - the first blow is `attack` or `attack1` (a content name and an artist's name for the same swing), and the second blow may repeat it;
 *  - a landing is a held pose of a few ticks and an alert a still one: the art's `idle` is a fair stand-in, and showing the placeholder for a few frames between
 *    two frames of the art would be a flicker, not a fallback.
 * Every other state (crouch, hurt, dash, the air and crouch blows, the cast, the drink…) says something no other clip says: without its own clip, the
 * placeholder draws it.
 */
const STAND_INS: Readonly<Partial<Record<AnimState, readonly AnimState[]>>> = {
  walk: ['run', 'move'],
  run: ['walk', 'move'],
  move: ['walk', 'run'],
  jump: ['fall'],
  fall: ['jump'],
  attack: ['attack1'],
  attack1: ['attack'],
  attack2: ['attack1', 'attack'],
  land: ['idle'],
  alert: ['idle'],
};

/** The state whose clip draws `state` in this set: `state` itself when it has the clip, else the first stand-in it has, else `null`. */
export function standInFor(set: Pick<SpriteSetDefinition, 'clips'>, state: AnimState): AnimState | null {
  if (set.clips[state] !== undefined) return state;
  return (STAND_INS[state] ?? []).find((s) => set.clips[s] !== undefined) ?? null;
}

/** Can the art stand for `state`: has it the clip, or one of the stand-ins above? */
export function providesState(set: Pick<SpriteSetDefinition, 'clips'>, state: AnimState): boolean {
  return standInFor(set, state) !== null;
}

/** The look that draws `state` now. Without art there is only the placeholder. */
export function chooseSource(mode: VisualMode, art: VisualSet | null, state: AnimState): VisualSource {
  if (art === null || mode === 'placeholder') return 'placeholder';
  if (mode === 'art' || art.missingClips === 'chain') return 'art';
  return providesState(art, state) ? 'art' : 'placeholder';
}

/** Which of `wanted` the set has NO clip of its own for (exactly: a chain does not count): what is still to be drawn. */
export function lackedClips(set: Pick<SpriteSetDefinition, 'clips'>, wanted: readonly AnimState[]): AnimState[] {
  return wanted.filter((s) => set.clips[s] === undefined);
}
