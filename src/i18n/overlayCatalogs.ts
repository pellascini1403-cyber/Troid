import en from './locales/overlay.en.json';
import es from './locales/overlay.es.json';
import type { Catalog } from './translator';

/**
 * The words of the parts of the interface that are not in the first frame (docs/PROMPT20-LOG.md): a catalog of their own, in the same languages, that only the overlays' chunk loads — the notice that asks the player to turn the
 * device. The overlays add them to the translator when they are built (`Translator.extend`); the tests hold them to the same rules as the rest (same keys in every language, none orphaned, none missing). It is not part of
 * `@/i18n`'s index on purpose: anything that imported it from there would bring it into the cold start.
 */
export const OVERLAY_CATALOGS: Readonly<Record<string, Catalog>> = { es, en };
