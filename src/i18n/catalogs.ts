import en from './locales/en.json';
import es from './locales/es.json';
import type { Catalog } from './translator';

/** Every catalog the game ships. Adding a language = adding `locales/<id>.json` and listing it here. */
export const CATALOGS: Readonly<Record<string, Catalog>> = { es, en };
export const SUPPORTED_LOCALES: readonly string[] = Object.keys(CATALOGS);
export const FALLBACK_LOCALE = 'en';
