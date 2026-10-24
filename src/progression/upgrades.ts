/**
 * UPGRADES ARE FLAGS (docs/PROMPT21-LOG.md). A vessel of life, a vessel of magic: the world remembers it was taken by the flag the pickup set — the flag every pickup already sets — and what it is worth is DERIVED from the flags
 * that are set, every time they change and when a game is loaded. Nothing extra is saved, so no saved game can disagree with itself (a hero with the vessel and the old size of the bar, or the other way round), and a game saved before
 * the upgrade existed simply has none.
 */
export interface UpgradeDef {
  /** The flag a pickup sets when it is taken. */
  flag: string;
  /** Points of life and units of magic it adds to the size of the bar. */
  maxHealth?: number;
  maxMagic?: number;
}

export interface UpgradeTotals {
  maxHealth: number;
  maxMagic: number;
}

/** What the upgrades whose flag is set add up to. */
export function upgradeTotals(defs: readonly UpgradeDef[], has: (flag: string) => boolean): UpgradeTotals {
  const out: UpgradeTotals = { maxHealth: 0, maxMagic: 0 };
  for (const u of defs) {
    if (!has(u.flag)) continue;
    out.maxHealth += u.maxHealth ?? 0;
    out.maxMagic += u.maxMagic ?? 0;
  }
  return out;
}
