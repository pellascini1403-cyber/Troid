import en from './locales/beyond.en.json';
import es from './locales/beyond.es.json';
import type { Catalog } from './translator';

/**
 * The words of the second half of the adventure (docs/PROMPT23-LOG.md §7): the names of its forty-one rooms, of the ten creatures that burn and of their four guardians. They are a catalog of their own, in the same languages, that only
 * comes with the rooms: the first frame does not carry the names of places the hero cannot be in yet (the budget of the cold start is about what a hero standing in R1 has to download). `app/beyond.ts` brings them in with the chunk of the
 * rest of the world and the game adds them to the translator (`Translator.extend`) when they arrive; the tests hold them to the same rules as the rest (same keys in every language, none orphaned, none missing). It is not part
 * of `@/i18n`'s index on purpose: anything that imported it from there would bring it into the cold start.
 */
export const BEYOND_CATALOGS: Readonly<Record<string, Catalog>> = { es, en };
