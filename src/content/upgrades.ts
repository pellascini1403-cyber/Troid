import type { UpgradeDef } from '@/progression/upgrades';

/**
 * THE VESSELS OF THE WORLD (docs/PROMPT21-LOG.md): five of life (a point each: the 5 the hero is made with grow to 10) and three of magic (twenty units each: the bar of 100 grows to 160). A pickup of a room that sets one of
 * these flags IS the vessel; the world test (tests/unit/content/upgrades.test.ts) holds the rooms to this list in both directions (every flag here is set by exactly one pickup, and no vessel-looking pickup is missing here).
 */
export const UPGRADES: readonly UpgradeDef[] = [
  { flag: 'taken:life_1', maxHealth: 1 },
  { flag: 'taken:life_2', maxHealth: 1 },
  { flag: 'taken:life_3', maxHealth: 1 },
  { flag: 'taken:life_4', maxHealth: 1 },
  { flag: 'taken:life_5', maxHealth: 1 },
  { flag: 'taken:mana_1', maxMagic: 20 },
  { flag: 'taken:mana_2', maxMagic: 20 },
  { flag: 'taken:mana_3', maxMagic: 20 },
];
