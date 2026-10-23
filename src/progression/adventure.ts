/**
 * THE END OF THE ADVENTURE (docs/PROMPT20-LOG.md): the world remembers that the hero has walked out of it. A way out marked `end` (`ExitDef.end`) raises `adventure:ended` every time it is touched
 * and sets this flag the first time. It is a flag like any other — the world's memory, saved with the rest, repaired and migrated with the rest — so a game that was completed stays completed
 * through every save, load, copy taken out and put in, and no version of the saves had to change for it. Nothing in the rules reads it: the interface does (the closing, the saved-games card,
 * the profile).
 */
export const COMPLETED_FLAG = 'completed:adventure';

/** Has the game been taken to its end? (`has` is the flags of a session, or of a save.) */
export function isCompleted(has: (flag: string) => boolean): boolean {
  return has(COMPLETED_FLAG);
}
