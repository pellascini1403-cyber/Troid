import { BEYOND_CATALOGS } from '@/i18n/beyondCatalogs';
import { CATALOGS } from '@/i18n/catalogs';
import { MENU_CATALOGS } from '@/i18n/menuCatalogs';
import { OVERLAY_CATALOGS } from '@/i18n/overlayCatalogs';
import type { Catalog } from '@/i18n/translator';

/**
 * Every text of the game, as the player has it once the settings menu has opened, the overlays are built and the rest of the world has arrived: the catalogs of the game and the words the menu, the overlays and the rooms past the
 * Sanctum bring with them (docs/PROMPT6-LOG.md S30, docs/PROMPT23-LOG.md §7: they travel in their own chunks). The consistency tests hold the parts to the rules of one.
 */
export const ALL_CATALOGS: Readonly<Record<string, Catalog>> = Object.fromEntries(
  Object.keys(CATALOGS).map((lang) => [lang, { ...CATALOGS[lang], ...MENU_CATALOGS[lang], ...OVERLAY_CATALOGS[lang], ...BEYOND_CATALOGS[lang] }]),
);
