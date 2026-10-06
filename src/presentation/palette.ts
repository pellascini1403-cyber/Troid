/**
 * Colour tokens (docs/GAME-SPEC-2D.md §3.2). Pure data: the renderer, the HUD (as CSS variables) and the VFX read
 * from here, so the art direction changes in ONE place. Values come from measuring the reference images
 * ("muestreo") or are marked "proposed" when the references contain nothing to measure (violet).
 *
 * The protagonist is NEVER recoloured: black + white + cyan/blue is its identity. Warm/violet tones only appear on
 * VFX and enemies, selected by `PaletteSlot` rather than by hard-coded colours.
 */

export const PALETTE = {
  // protagonist (sampled from the portrait)
  heroInk: 0x101316,
  heroArmor: 0x121d27,
  heroArmorLit: 0x172734,
  // energy (sampled)
  energyCore: 0x7fdaf2,
  energyMid: 0x82bcd8,
  energyGlow: 0xc1f0fc,
  whiteHot: 0xf7faff,
  // enemies
  enemyInk: 0x05060a, // proposed (the sampled black is pure 0)
  enemyEye: 0xf7faff,
  violetCore: 0x9a6bff, // proposed: the references contain no violet
  violetGlow: 0xd3c2ff,
  violetDeep: 0x3a1f7a,
  // optional accent (sampled from the red VFX of the pose sheet): OFF by default
  accentWarm: 0xf4343d,
  // world (sampled from the reference palette strip)
  worldVoid: 0x050409,
  worldNight: 0x0c1019,
  worldDeep: 0x212548,
  worldDusk: 0x212c4a,
  worldSlate: 0x4f5d8c,
  worldMist: 0x686580,
  worldHaze: 0x859cbb,
  worldGlow: 0xacccd9,
  // ui (proposed)
  uiPanel: 0x0b1220,
  uiLife: 0xe6f1f5,
} as const;

export type PaletteToken = keyof typeof PALETTE;

/** Which family of colours a VFX asks for; the same effect definition serves the hero and the enemies. */
export type PaletteSlot = 'energy' | 'enemy' | 'accent' | 'neutral';

export interface SlotColors {
  /** Saturated body of the effect. */
  core: number;
  /** Bright centre / highlights. */
  hot: number;
  /** Dark rim / shadow. */
  deep: number;
}

/** `accent` is the optional warm tone: off by default, only used by definitions that ask for it explicitly. */
export const SLOT_COLORS: Readonly<Record<PaletteSlot, SlotColors>> = {
  energy: { core: PALETTE.energyCore, hot: PALETTE.whiteHot, deep: PALETTE.energyMid },
  enemy: { core: PALETTE.violetCore, hot: PALETTE.violetGlow, deep: PALETTE.violetDeep },
  accent: { core: PALETTE.accentWarm, hot: PALETTE.whiteHot, deep: PALETTE.enemyInk },
  neutral: { core: PALETTE.worldHaze, hot: PALETTE.whiteHot, deep: PALETTE.worldDusk },
};

/** `0xRRGGBB` → `#rrggbb` (CSS variables for the DOM UI). */
export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Material presets of the room blockout → fill colour. Placeholder look: flat, readable, never the final art. */
export const MATERIAL_FILL: Readonly<Record<string, number>> = {
  stone: PALETTE.worldDusk,
  earth: PALETTE.worldDeep,
  moss: PALETTE.worldSlate,
  wood: PALETTE.worldMist,
  gate: PALETTE.worldMist,
};
