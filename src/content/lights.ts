import type { LightKind, LightPulse, LightRecipe, LightStrength } from '@/presentation/lighting';
import type { VfxTrigger } from '@/presentation/vfx';

/**
 * THE LIGHT OF THE WORLD, as DATA (docs/PROMPT8-LOG.md, phase I; the rules it keeps are `LIGHT_CONTRACT`). Soft pools of additive light behind the actors: how big, in which colour, which matter most when a profile can
 * draw fewer, and how strong each is in each state of the thing that casts it. The numbers were set looking at the game itself — the hero in R1 and in the darkest of R4, a bolt crossing a room, a slime that
 * prepares its charge, the guardian in its arena — and checked against the ceilings of the contract by `lightIssues` (a test).
 */

export const LIGHT_RECIPES: Readonly<Record<LightKind, LightRecipe>> = {
  // the hero's light: round, about the chest, the cyan of their own energy
  hero: { slot: 'energy', radius: 3.8, squash: 1, rank: 0 },
  // the pool of it on the ground under their feet: flat, as a thing seen across the floor
  floor: { slot: 'energy', radius: 3.2, squash: 0.18, rank: 2 },
  // the Spirit Bolt in flight: it lights the room it crosses
  bolt: { slot: 'energy', radius: 4.6, squash: 1, rank: 1 },
  // the guardian of the sanctum: big, violet
  boss: { slot: 'enemy', radius: 6.8, squash: 1, rank: 3 },
  // an enemy that has woken up (and more when it prepares a blow)
  foe: { slot: 'enemy', radius: 2.7, squash: 1, rank: 4 },
};

export const LIGHT_STRENGTH: LightStrength = {
  // alpha at the heart of the glow, with no magic and with all of it: the hero with the bolt ready is brighter than the hero who is spent
  hero: [0.2, 0.46],
  floor: [0.12, 0.24],
  heroRise: 0.85,
  duck: 0.6,
  bolt: 0.5,
  foe: { awake: 0.07, telegraph: [0.12, 0.38], strike: 0.3 },
  boss: { asleep: 0.04, awake: 0.13, enraged: 0.22, telegraph: 0.2, strike: 0.16 },
};

/** The most each kind reaches in the recipe above (the contract's ceilings are held against these). */
export function lightPeaks(): Readonly<Record<LightKind, number>> {
  const s = LIGHT_STRENGTH;
  return {
    hero: s.hero[1],
    floor: s.floor[1],
    bolt: s.bolt,
    boss: s.boss.enraged + Math.max(s.boss.telegraph, s.boss.strike),
    foe: Math.max(s.foe.awake, s.foe.telegraph[1], s.foe.strike),
  };
}

/**
 * The light a MOMENT leaves on the place where it happens, bound to the same triggers as the effects (`VFX_BINDINGS`) but drawn by the field of lights, not charged to the effects' budget: a blow that lands lights the
 * wall behind it for a fifth of a second, a bolt let go lights the room, a place that awakens swells with light and goes out slowly. Violet is the enemy's (their deaths, the guardian's blows), cyan the hero's.
 */
export const LIGHT_PULSES: Readonly<Partial<Record<VfxTrigger, readonly LightPulse[]>>> = {
  slashFinisher: [{ slot: 'energy', radius: 3.2, peak: 0.22, life: 0.24, rise: 0.2, offset: [0.9, 0] }],
  hitLanded: [{ slot: 'energy', radius: 3.0, peak: 0.36, life: 0.26, rise: 0.12 }],
  dashStart: [{ slot: 'energy', radius: 2.6, peak: 0.22, life: 0.3, rise: 0.15 }],
  enemyDied: [{ slot: 'enemy', radius: 3.6, peak: 0.4, life: 0.55, rise: 0.15 }],
  playerDied: [{ slot: 'energy', radius: 5, peak: 0.42, life: 0.9, rise: 0.12 }],
  boltCharge: [{ slot: 'energy', radius: 3.0, peak: 0.34, life: 0.42, rise: 0.92 }],
  boltCast: [{ slot: 'energy', radius: 4.4, peak: 0.42, life: 0.32, rise: 0.1, offset: [0.6, 0] }],
  boltImpact: [{ slot: 'energy', radius: 5.2, peak: 0.55, life: 0.5, rise: 0.1 }],
  drinkHeal: [{ slot: 'energy', radius: 3.4, peak: 0.28, life: 0.6, rise: 0.25 }],
  pickup: [{ slot: 'energy', radius: 3.2, peak: 0.26, life: 0.55, rise: 0.2 }],
  checkpoint: [{ slot: 'energy', radius: 5.6, peak: 0.38, life: 1.1, rise: 0.25 }],
  abilityGained: [{ slot: 'energy', radius: 6.6, peak: 0.44, life: 1.2, rise: 0.25 }],
  sealRejected: [{ slot: 'enemy', radius: 2.6, peak: 0.24, life: 0.28, rise: 0.15 }],
  sealBroken: [{ slot: 'energy', radius: 7.6, peak: 0.58, life: 1.1, rise: 0.12 }],
  bossWake: [{ slot: 'enemy', radius: 7.4, peak: 0.42, life: 1.3, rise: 0.3 }],
  bossStrike: [{ slot: 'enemy', radius: 3.8, peak: 0.4, life: 0.4, rise: 0.15 }],
  bossPhase: [{ slot: 'enemy', radius: 8.4, peak: 0.46, life: 1.1, rise: 0.25 }],
  bossDefeated: [{ slot: 'enemy', radius: 9, peak: 0.55, life: 1.7, rise: 0.15 }],
};
