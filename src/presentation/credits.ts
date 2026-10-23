/**
 * The shape of the credits (docs/PROMPT20-LOG.md): what `content/credits.ts` writes and the closing of the adventure reads — a vocabulary both sides share, so the interface never imports game data.
 * A name is a proper name (a person, a studio, a library: never translated); a title and a role are text keys.
 */
export interface CreditLine {
  /** A proper name: a person, a studio, a library. */
  name: string;
  /** Text key of what they did (optional). */
  roleKey?: string;
}

export interface CreditSection {
  /** Text key of the heading. */
  titleKey: string;
  lines: readonly CreditLine[];
}
