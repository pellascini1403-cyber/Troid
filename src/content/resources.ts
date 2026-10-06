import type { BottleDefinition, BottleRules } from '@/abilities/BottleSet';
import type { CardDefinition } from '@/abilities/CardLoadout';
import type { MagicDefinition } from '@/abilities/Magic';

/** The magic bar (docs/GAME-SPEC-2D.md §10.1): 100 units, 6 per second after 1.0 s without spending. */
export const MAGIC: MagicDefinition = { max: 100, regenPerSecond: 6, regenDelaySeconds: 1.0 };

/** The bottle that exists in the first slice: heals 2 points (GAME-SPEC-2D §11). */
export const BOTTLE_DEFINITIONS: Readonly<Record<string, BottleDefinition>> = {
  energy_bottle: { id: 'energy_bottle', nameKey: 'bottle.energy.name', iconId: 'bottle', effect: { type: 'heal', amount: 2 } },
};

/** Three bottles at the start, four at most (the fourth is a reward); one recharges at a time, 60 s each. No purchases. */
export const BOTTLES: { initial: readonly string[]; rules: BottleRules } = {
  initial: ['energy_bottle', 'energy_bottle', 'energy_bottle'],
  rules: { rechargeSeconds: 60, maxSlots: 4 },
};

/** The cards of the first slice: one, which equips the Spirit Bolt. The hero starts WITHOUT any card (no initial ability). */
export const CARDS: Readonly<Record<string, CardDefinition>> = {
  card_spirit_bolt: { id: 'card_spirit_bolt', nameKey: 'card.spiritBolt.name', iconId: 'spirit_bolt', skillId: 'spirit_bolt', grantsAbility: 'magic_attack' },
};
