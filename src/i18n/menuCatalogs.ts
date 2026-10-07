import en from './locales/menu.en.json';
import es from './locales/menu.es.json';
import type { Catalog } from './translator';

/**
 * The words of the settings menu (docs/PROMPT6-LOG.md S30): a catalog of their own, in the same languages, that only the menu loads — a player who
 * never opens it never downloads them (the bundle budget). The menu adds them to the translator when it is built (`Translator.extend`); the tests
 * hold both halves to the same rules as one (same keys in every language, none orphaned, none missing). It is not part of `@/i18n`'s index on purpose:
 * anything that imported it from there would bring it into the cold start.
 */
export const MENU_CATALOGS: Readonly<Record<string, Catalog>> = { es, en };
