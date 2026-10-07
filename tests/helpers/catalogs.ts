import { CATALOGS } from '@/i18n/catalogs';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import type { Catalog } from '@/i18n/translator';

/**
 * Every text of the game, as the player has it once the settings menu has opened: the catalogs of the game and the words the menu brings with it
 * (docs/PROMPT6-LOG.md S30: they travel in the menu's own chunk). The consistency tests hold the two halves to the rules of one.
 */
export const ALL_CATALOGS: Readonly<Record<string, Catalog>> = Object.fromEntries(
  Object.keys(CATALOGS).map((lang) => [lang, { ...CATALOGS[lang], ...MENU_CATALOGS[lang] }]),
);
