import type { Catalog } from '@/i18n';

/**
 * THE REST OF THE WORLD, ON ITS WAY (docs/PROMPT21-LOG.md): the rooms past the Sanctum, the creatures and the guardians that live in them are a chunk of their own (`content/beyond.ts`), because the budget of the cold
 * start is about what a hero standing in R1 has to download, and R1 needs none of it. The game asks for the chunk once its first frame is up, with the effects and the art; it adds itself to the registries of `content/core.ts`, which the
 * session reads from — so the first time anything asks for a room that is not there, this is the question that is answered. One request, kept: asking again gives the same promise, and a request that failed is forgotten, so the next ask is a new try.
 *
 * The words of the second half of the adventure (the names of its rooms and of what lives in them, `i18n/beyondCatalogs.ts`) come in the same request, and are kept here until the translator asks for them (`beyondWords`).
 */
let request: Promise<void> | null = null;
let words: Readonly<Record<string, Catalog>> | null = null;

export function loadBeyond(): Promise<void> {
  return (request ??= Promise.all([import('@/content/beyond'), import('@/i18n/beyondCatalogs')]).then(
    ([, catalogs]) => {
      words = catalogs.BEYOND_CATALOGS;
    },
    (err: unknown) => {
      request = null;
      throw err;
    },
  ));
}

/** The words that came with the rest of the world, by language; none until it has arrived. */
export function beyondWords(): Readonly<Record<string, Catalog>> {
  return words ?? {};
}
