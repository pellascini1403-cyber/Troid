/**
 * The curve between what a player sees and what is heard (docs/PROMPT6-LOG.md S30, docs/PROMPT18-LOG.md): the level a player sees (a slider, 0–1) is not the amplitude — loudness is heard on a curve, so the same step is
 * the same change at every volume. The levels themselves (the general volume and one for each kind of sound) are `Levels`; this is the one function they, and the engine, turn a level into an amplitude with.
 */
export function gainOf(level: number): number {
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return l * l;
}
