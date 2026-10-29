import type { EnemyDefinition } from '@/enemies/EnemyDefinition';
import type { ShotSpec } from '@/enemies/EnemyShot';
import { blow, hit, HURT } from './creatures';

/**
 * THE CREATURES OF THE SECOND HALF (docs/PROMPT23-LOG.md §7): the creatures of the world that burn. They are the ways of the first half — a charge that cannot turn, a leap that shakes the floor, a shield to the front, a rhythm along the floor, a drop from above — in
 * hotter, harder bodies: the same brains (`enemies/archetypes/`, so everything the hero learned about the thirteen is still true), with the numbers moved —
 * a longer reach, a shorter wind-up, a little more life — and a look of their own (`content/proceduralActors.ts`: black over the glow of embers, where the creatures of the first half are black over violet). A new creature is a definition, not a brain: none of them moves in a new way.
 * Where the first half made the hero learn each creature in a room of its own, here they come in pairs and with the lava between them: a toller on a stone in a pool is a rhythm to hop to, a piston over a bank is a place not to stand.
 *
 *   Cinder Crawler — the Bramble Crawler's line, longer and faster         Magma Toad — the Mire Toad, with a leap that crosses a pool and a shock that is wider
 *   Basalt Guard — a Stoneback with more stone: slower to turn, harder smash  Ember Wisp — a Lantern Wisp that comes faster and goes off bigger
 *   Ash Bat — a Cave Bat that dives three times, not two                      Slag Spitter — an Ink Spitter that stays farther away and throws faster
 *   Ash Toller — a Bell Toller whose rhythm is shorter                         Magma Piston — a Piston Drone that locks on sooner and falls faster
 *   Cinder Weaver — an Ink Weaver that weaves crawlers                         Dusk Shade — a Veil Shade that is gone for less
 */

// ---------------------------------------------------------------------------------------------------------- Cinder Crawler
export const CINDER_RUSH = blow({ id: 'cinder_rush', startup: 20, active: 54, recovery: 36, hitbox: hit(0, 0.05, 1.15, 0.65), knockback: { x: 7, y: 3.5 } });
export const CINDER_CRAWLER: EnemyDefinition = {
  id: 'cinder_crawler',
  nameKey: 'enemy.cinderCrawler.name',
  health: 5,
  body: { halfWidth: 0.6, height: 0.75 },
  ai: {
    archetype: 'crawler',
    params: { patrolSpeed: 1.8, patrolRange: 3.5, idleTicks: [36, 90], detectRange: 11.5, detectHeight: 1.6, alertTicks: 12, rushSpeed: 12, rushRange: 11.5, attack: CINDER_RUSH.id, stunTicks: 66, friction: 30, gravity: 52 },
  },
  attacks: { [CINDER_RUSH.id]: CINDER_RUSH },
  hurt: HURT(14, 0.9),
  death: { ticks: 36 },
  view: { proceduralId: 'cinder_crawler' },
};

// ---------------------------------------------------------------------------------------------------------- Magma Toad
export const MAGMA_LEAP = blow({ id: 'magma_leap', startup: 18, active: 64, recovery: 38, hitbox: hit(-0.7, 0, 1.4, 1), knockback: { x: 6, y: 5 } });
export const MAGMA_SHOCK = blow({ id: 'magma_shock', startup: 0, active: 8, recovery: 0, hitbox: hit(0, 0, 2.8, 0.5), knockback: { x: 6.5, y: 4.5 }, anim: 'attack' });
export const MAGMA_TOAD: EnemyDefinition = {
  id: 'magma_toad',
  nameKey: 'enemy.magmaToad.name',
  health: 7,
  body: { halfWidth: 0.65, height: 0.95 },
  ai: {
    archetype: 'toad',
    params: { patrolRange: 3, idleTicks: [26, 70], detectRange: 11, detectHeight: 3, alertTicks: 10, leapRange: 8, leapVy: 13, attack: MAGMA_LEAP.id, shock: MAGMA_SHOCK.id, friction: 30, gravity: 52 },
  },
  attacks: { [MAGMA_LEAP.id]: MAGMA_LEAP, [MAGMA_SHOCK.id]: MAGMA_SHOCK },
  hurt: HURT(14, 0.8),
  death: { ticks: 40 },
  view: { proceduralId: 'magma_toad' },
};

// ---------------------------------------------------------------------------------------------------------- Basalt Guard
export const BASALT_SMASH = blow({ id: 'basalt_smash', startup: 36, active: 5, recovery: 54, hitbox: hit(0.1, 0, 2.1, 1.7), damage: 2, knockback: { x: 7.5, y: 4 }, stun: 16, hitStop: 8, shake: 0.3 });
export const BASALT_GUARD: EnemyDefinition = {
  id: 'basalt_guard',
  nameKey: 'enemy.basaltGuard.name',
  health: 10,
  body: { halfWidth: 0.75, height: 1.55 },
  ai: {
    archetype: 'guard',
    params: { patrolSpeed: 1.2, approachSpeed: 2.1, patrolRange: 3, idleTicks: [44, 100], detectRange: 10, detectHeight: 2.2, alertTicks: 18, attackRange: 2, attackHeight: 1.3, turnTicks: 38, pierces: ['slam_dive', 'slam'], attack: BASALT_SMASH.id, friction: 30, gravity: 52 },
  },
  attacks: { [BASALT_SMASH.id]: BASALT_SMASH },
  hurt: HURT(12, 0.35),
  death: { ticks: 44 },
  view: { proceduralId: 'basalt_guard' },
};

// ---------------------------------------------------------------------------------------------------------- Ember Wisp
export const EMBER_BLAST = blow({ id: 'ember_blast', startup: 30, active: 6, recovery: 0, hitbox: hit(-2.4, -1.4, 4.8, 4), damage: 2, knockback: { x: 6.5, y: 5 }, stun: 18, hitStop: 8, shake: 0.3 });
export const EMBER_WISP: EnemyDefinition = {
  id: 'ember_wisp',
  nameKey: 'enemy.emberWisp.name',
  health: 3,
  body: { halfWidth: 0.4, height: 0.75 },
  ai: { archetype: 'wisp', params: { driftSpeed: 1.4, driftRange: 2.5, chaseRange: 10, chaseHeight: 6, chaseSpeed: 4.2, hoverAbove: 0.6, fuseRange: 2.2, attack: EMBER_BLAST.id } },
  attacks: { [EMBER_BLAST.id]: EMBER_BLAST },
  hurt: HURT(8, 1.4),
  death: { ticks: 26 },
  view: { proceduralId: 'ember_wisp' },
};

// ---------------------------------------------------------------------------------------------------------- Ash Bat
export const ASH_SWOOP = blow({ id: 'ash_swoop', startup: 16, active: 38, recovery: 0, hitbox: hit(-0.45, -0.1, 0.9, 0.7), knockback: { x: 5.5, y: 3 }, stun: 12, hitStop: 5, shake: 0.15 });
export const ASH_BAT: EnemyDefinition = {
  id: 'ash_bat',
  nameKey: 'enemy.ashBat.name',
  health: 2,
  body: { halfWidth: 0.45, height: 0.55 },
  ai: { archetype: 'bat', params: { wakeRange: 7.5, wakeHeight: 10, swoopSpeed: 11.5, turnRate: 0.08, swoopTicks: 38, returnSpeed: 5.5, maxSwoops: 3, hoverTicks: 18, attack: ASH_SWOOP.id } },
  attacks: { [ASH_SWOOP.id]: ASH_SWOOP },
  hurt: HURT(10, 1.1),
  death: { ticks: 30 },
  view: { proceduralId: 'ash_bat' },
};

// ---------------------------------------------------------------------------------------------------------- Slag Spitter
export const SLAG_SPIT = blow({ id: 'slag_spit', startup: 26, active: 1, recovery: 40, hitbox: hit(0, 0, 0.01, 0.01) });
export const SLAG_SHOT: ShotSpec = { mode: 'air', speed: 11, size: { w: 0.6, h: 0.5 }, damage: 1, knockback: { x: 5, y: 3 }, stun: 14, hitStop: 5, shake: 0.15, ttl: 110, attackId: 'slag_shot' };
export const SLAG_SPITTER: EnemyDefinition = {
  id: 'slag_spitter',
  nameKey: 'enemy.slagSpitter.name',
  health: 4,
  body: { halfWidth: 0.5, height: 1.25 },
  ai: {
    archetype: 'spitter',
    params: { patrolSpeed: 1.5, patrolRange: 3, idleTicks: [36, 90], detectRange: 13, detectHeight: 2.6, alertTicks: 12, keepAway: 5.5, retreatSpeed: 3.8, cooldownTicks: 46, attack: SLAG_SPIT.id, shot: SLAG_SHOT, muzzle: { x: 0.6, y: 0.8 }, friction: 30, gravity: 52 },
  },
  attacks: { [SLAG_SPIT.id]: SLAG_SPIT },
  hurt: HURT(14, 0.9),
  death: { ticks: 36 },
  view: { proceduralId: 'slag_spitter' },
};

// ---------------------------------------------------------------------------------------------------------- Ash Toller
export const ASH_TOLL = blow({ id: 'ash_toll', startup: 34, active: 4, recovery: 46, hitbox: hit(0, 0, 0.01, 0.01) });
export const ASH_WAVE: ShotSpec = { mode: 'ground', speed: 7.2, size: { w: 0.9, h: 0.75 }, damage: 1, knockback: { x: 5, y: 5 }, stun: 14, hitStop: 5, shake: 0.15, ttl: 150, attackId: 'ash_wave' };
export const ASH_TOLLER: EnemyDefinition = {
  id: 'ash_toller',
  nameKey: 'enemy.ashToller.name',
  health: 8,
  body: { halfWidth: 0.65, height: 1.85 },
  ai: { archetype: 'toller', params: { interval: 118, range: 16, height: 4, attack: ASH_TOLL.id, shot: ASH_WAVE, muzzle: { x: 0.9, y: 0.35 }, gravity: 52 } },
  attacks: { [ASH_TOLL.id]: ASH_TOLL },
  hurt: HURT(10, 0.3),
  death: { ticks: 40 },
  view: { proceduralId: 'ash_toller' },
};

// ---------------------------------------------------------------------------------------------------------- Magma Piston
export const MAGMA_DROP = blow({ id: 'magma_drop', startup: 28, active: 40, recovery: 58, hitbox: hit(-0.7, -0.5, 1.4, 1.5), damage: 2, knockback: { x: 5, y: 6 }, stun: 18, hitStop: 8, shake: 0.35 });
export const MAGMA_PISTON: EnemyDefinition = {
  id: 'magma_piston',
  nameKey: 'enemy.magmaPiston.name',
  health: 7,
  body: { halfWidth: 0.65, height: 1.05 },
  ai: { archetype: 'piston', params: { detectRange: 15, detectHeight: 12, trackSpeed: 5.4, lockRange: 0.7, lockDelay: 16, leash: 13, dropSpeed: 26, riseSpeed: 5.5, cooldownTicks: 54, attack: MAGMA_DROP.id } },
  attacks: { [MAGMA_DROP.id]: MAGMA_DROP },
  hurt: HURT(10, 0.5),
  death: { ticks: 36 },
  view: { proceduralId: 'magma_piston' },
};

// ---------------------------------------------------------------------------------------------------------- Cinder Weaver
export const CINDER_WEAVE = blow({ id: 'cinder_weave', startup: 42, active: 1, recovery: 48, hitbox: hit(0, 0, 0.01, 0.01) });
export const CINDER_WEAVER: EnemyDefinition = {
  id: 'cinder_weaver',
  nameKey: 'enemy.cinderWeaver.name',
  health: 7,
  body: { halfWidth: 0.55, height: 1.65 },
  ai: {
    archetype: 'weaver',
    params: { patrolRange: 3, detectRange: 12, detectHeight: 3, alertTicks: 16, keepAway: 4.5, retreatSpeed: 2.6, interval: 180, maxAlive: 2, attack: CINDER_WEAVE.id, summon: CINDER_CRAWLER, summonOffset: 1.6, friction: 30, gravity: 52 },
  },
  attacks: { [CINDER_WEAVE.id]: CINDER_WEAVE },
  hurt: HURT(16, 1.1),
  death: { ticks: 44 },
  view: { proceduralId: 'cinder_weaver' },
};

// ---------------------------------------------------------------------------------------------------------- Dusk Shade
export const DUSK_SLASH = blow({ id: 'dusk_slash', startup: 22, active: 5, recovery: 42, hitbox: hit(0.15, 0.1, 1.8, 1.55), damage: 2, knockback: { x: 7, y: 3 }, stun: 16, hitStop: 7, shake: 0.25 });
export const DUSK_SHADE: EnemyDefinition = {
  id: 'dusk_shade',
  nameKey: 'enemy.duskShade.name',
  health: 6,
  body: { halfWidth: 0.45, height: 1.75 },
  ai: { archetype: 'shade', params: { detectRange: 10.5, detectHeight: 3, driftSpeed: 1.8, vanishRange: 6.5, vanishTicks: 14, goneTicks: 22, behind: 2.2, attack: DUSK_SLASH.id, gravity: 52 } },
  attacks: { [DUSK_SLASH.id]: DUSK_SLASH },
  hurt: HURT(14, 0.9),
  death: { ticks: 36 },
  view: { proceduralId: 'dusk_shade' },
};

/** The creatures of the second half, in the order the hero meets them. */
export const EMBER_CREATURES: readonly EnemyDefinition[] = [CINDER_CRAWLER, ASH_BAT, EMBER_WISP, SLAG_SPITTER, BASALT_GUARD, MAGMA_TOAD, ASH_TOLLER, MAGMA_PISTON, CINDER_WEAVER, DUSK_SHADE];
