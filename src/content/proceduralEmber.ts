import { PALETTE } from '@/presentation/palette';
import type { ProceduralLook } from '@/presentation/proceduralPose';
import { colors, creature, EYES } from './proceduralActors';

/**
 * THE LOOKS OF THE SECOND HALF (docs/PROMPT23-LOG.md §7): the creatures that burn and the four guardians, drawn the way every creature of the world is — from shapes, deformed by their state (`proceduralActors.ts`) — over colours that say where they live. The
 * creatures of the first half are black over violet; these are black over the glow of embers: a thin rim of the colour of a coal, eyes of its hottest white-yellow, and an aura that is the orange of the lava when they are about to strike. Not the lava's own fill (a
 * creature must not be mistaken for the floor) and never the hero's cyan.
 *
 * These are procedural silhouettes: the honest state of the art for creatures (`docs/PROMPT22-LOG.md` §10.1), and they are listed as provisional in the report.
 */
const E = PALETTE;

export const CINDER_CRAWLER_LOOK = creature({ id: 'cinder_crawler', width: 1.2, height: 0.75, colors: colors(E.enemyInk, E.emberCore, E.emberDeep, E.emberCore, E.emberHot), eyes: { ...EYES, y: 0.55, forward: 0.2, spread: 0.26 }, windup: 'squash', spikes: 7 });
export const ASH_BAT_LOOK = creature({ id: 'ash_bat', width: 1, height: 0.6, colors: colors(E.worldVoid, E.emberDeep, E.worldNight, E.emberCore, E.emberHot), eyes: { width: 0.1, height: 0.12, y: 0.6, forward: 0.18, spread: 0.3 }, windup: 'swell', shape: 'orb', wobble: 2.4 });
export const EMBER_WISP_LOOK = creature({ id: 'ember_wisp', width: 0.8, height: 0.8, colors: colors(E.emberCore, E.emberHot, E.whiteHot, E.emberHot, E.emberDeep), eyes: { width: 0.1, height: 0.1, y: 0.55, forward: 0.1, spread: 0.3 }, windup: 'swell', shape: 'orb', wobble: 3 });
export const SLAG_SPITTER_LOOK = creature({ id: 'slag_spitter', width: 1, height: 1.25, colors: colors(E.enemyInk, E.emberHot, E.emberDeep, E.emberCore, E.emberHot), eyes: { ...EYES, y: 0.72, forward: 0.22 }, windup: 'rise' });
export const BASALT_GUARD_LOOK = creature({ id: 'basalt_guard', width: 1.5, height: 1.55, colors: colors(E.worldNight, E.emberDeep, E.worldDusk, E.emberCore, E.emberHot), eyes: { ...EYES, y: 0.5, forward: 0.2, spread: 0.2 }, windup: 'rise', spikes: 4, wobble: 0.4 });
export const MAGMA_TOAD_LOOK = creature({ id: 'magma_toad', width: 1.3, height: 0.95, colors: colors(E.worldVoid, E.emberCore, E.emberDeep, E.emberHot, E.emberHot), eyes: { width: 0.2, height: 0.2, y: 0.78, forward: 0.12, spread: 0.55 }, windup: 'squash', wobble: 1.6 });
export const ASH_TOLLER_LOOK = creature({ id: 'ash_toller', width: 1.3, height: 1.85, colors: colors(E.worldDusk, E.emberCore, E.emberDeep, E.emberHot, E.emberHot), eyes: { width: 0.14, height: 0.2, y: 0.4, forward: 0, spread: 0.32 }, windup: 'rise', wobble: 0.5 });
export const MAGMA_PISTON_LOOK = creature({ id: 'magma_piston', width: 1.3, height: 1.05, colors: colors(E.worldNight, E.emberCore, E.emberDeep, E.accentWarm, E.emberHot), eyes: { width: 0.2, height: 0.1, y: 0.5, forward: 0, spread: 0.25 }, windup: 'rise', shape: 'orb', wobble: 0.5 });
export const CINDER_WEAVER_LOOK = creature({ id: 'cinder_weaver', width: 1.05, height: 1.65, colors: colors(E.worldDeep, E.emberCore, E.emberDeep, E.emberHot, E.emberHot), eyes: { ...EYES, y: 0.78, forward: 0.1, spread: 0.36 }, windup: 'swell', wobble: 1.2 });
export const DUSK_SHADE_LOOK = creature({ id: 'dusk_shade', width: 0.95, height: 1.75, colors: colors(E.worldVoid, E.accentWarm, E.emberDeep, E.accentWarm, E.emberHot), eyes: { width: 0.12, height: 0.3, y: 0.78, forward: 0.2, spread: 0.3 }, windup: 'rise', wobble: 1.8 });

// the guardians: the same body language at the size of a room, over the colours of the place they keep
export const DUSK_SHEPHERD_LOOK = creature({ id: 'boss_shepherd', width: 2.8, height: 4.4, colors: colors(E.worldNight, E.accentWarm, E.worldDeep, E.accentWarm, E.whiteHot), eyes: { width: 0.3, height: 0.2, y: 0.8, forward: 0.12, spread: 0.45 }, windup: 'rise', spikes: 8, wobble: 0.5 });
export const GROVE_GARDENER_LOOK = creature({ id: 'boss_gardener', width: 2.8, height: 3.2, colors: colors(E.worldNight, E.accentWarm, E.worldDusk, E.emberHot, E.whiteHot), eyes: { width: 0.4, height: 0.3, y: 0.8, forward: 0.1, spread: 0.6 }, windup: 'squash', spikes: 5, wobble: 1.3 });
export const CRATER_BEHEMOTH_LOOK = creature({ id: 'boss_behemoth', width: 3.8, height: 3.6, colors: colors(E.worldVoid, E.emberCore, E.emberDeep, E.emberHot, E.emberHot), eyes: { width: 0.5, height: 0.25, y: 0.7, forward: 0.2, spread: 0.3 }, windup: 'squash', spikes: 6, wobble: 0.3 });
export const CINDER_SOVEREIGN_LOOK = creature({ id: 'boss_cinder_sovereign', width: 2.4, height: 3.4, colors: colors(E.enemyInk, E.emberHot, E.emberDeep, E.accentWarm, E.whiteHot), eyes: { width: 0.2, height: 0.5, y: 0.72, forward: 0.1, spread: 0.4 }, windup: 'swell', spikes: 9, wobble: 1.2 });

export const EMBER_LOOKS: Readonly<Record<string, ProceduralLook>> = Object.fromEntries(
  [CINDER_CRAWLER_LOOK, ASH_BAT_LOOK, EMBER_WISP_LOOK, SLAG_SPITTER_LOOK, BASALT_GUARD_LOOK, MAGMA_TOAD_LOOK, ASH_TOLLER_LOOK, MAGMA_PISTON_LOOK, CINDER_WEAVER_LOOK, DUSK_SHADE_LOOK, DUSK_SHEPHERD_LOOK, GROVE_GARDENER_LOOK, CRATER_BEHEMOTH_LOOK, CINDER_SOVEREIGN_LOOK].map((l) => [l.id, l]),
);
