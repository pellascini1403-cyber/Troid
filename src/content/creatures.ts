import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { EnemyDefinition } from '@/enemies/EnemyDefinition';
import type { ShotSpec } from '@/enemies/EnemyShot';
import { INK_SLIME } from './inkSlime';

/**
 * THE CREATURES OF THE WORLD (docs/PROMPT21-LOG.md): thirteen ways to be an enemy after the Ink Slime, each one a brain (`enemies/archetypes/`) and the numbers it reads. Every number is data in metres, seconds and simulation
 * TICKS, retuned by playing; the wind-up of every blow IS its `startup` (the telegraph the hero reads). Names are text KEYS (`enemy.<id>.name`); the looks are procedural (`content/proceduralActors.ts`).
 *
 * What each one asks of the hero, in a line (the tests prove each one does it):
 *   Bramble Crawler — a straight charge that cannot turn: be out of the line, or over it       Mire Toad — leaps where you ARE, shakes the floor where it lands
 *   Stoneback — a shield to the front: get behind it, or come down on it (the slam)             Glow Spore — armoured until its cloud thins: wait it out, or bloom it from afar
 *   Ink Spitter — keeps its distance and throws: close in, or take the throw on the wall        Cave Bat — hangs from the roof and dives, turning: move late
 *   Lantern Wisp — floats to you and goes off: put it out first, or run                          Bell Toller — a rhythm of waves along the floor: hop them
 *   Shardling — a stone when curled, shards when broken: hit it uncurled, mind the pieces      Piston Drone — follows from above and drops: leave the line, hit it when it is stuck
 *   Floor Leech — a puddle that springs: the second time you know                                Ink Weaver — makes creatures, never more than two: reach it
 *   Veil Shade — vanishes and returns behind you: keep moving, or turn around
 */

const hit = (x: number, y: number, w: number, h: number): AttackDefinition['hitbox'] => ({ x, y, w, h });

/** The shape of a blow of an enemy, filled in with the standard hurt (docs/GAME-SPEC-2D.md §9.1) unless the blow says otherwise. */
function blow(a: Partial<AttackDefinition> & Pick<AttackDefinition, 'id' | 'startup' | 'active' | 'recovery' | 'hitbox'>): AttackDefinition {
  return { damage: 1, knockback: { x: 5.5, y: 4 }, stun: 14, hitStop: 6, shake: 0.2, moveControl: 0, anim: 'telegraph', ...a };
}

const HURT = (stun: number, knockbackScale: number) => ({ stun, knockbackScale, flashTicks: 6 });

// ---------------------------------------------------------------------------------------------------------- Bramble Crawler
export const CRAWLER_RUSH = blow({ id: 'crawler_rush', startup: 22, active: 54, recovery: 34, hitbox: hit(0, 0.05, 1.05, 0.6), knockback: { x: 6.5, y: 3.5 } });
export const BRAMBLE_CRAWLER: EnemyDefinition = {
  id: 'bramble_crawler',
  nameKey: 'enemy.crawler.name',
  health: 4,
  body: { halfWidth: 0.55, height: 0.7 },
  ai: {
    archetype: 'crawler',
    params: { patrolSpeed: 1.5, patrolRange: 3.5, idleTicks: [40, 100], detectRange: 11, detectHeight: 1.6, alertTicks: 14, rushSpeed: 11.5, rushRange: 11, attack: CRAWLER_RUSH.id, stunTicks: 70, friction: 30, gravity: 52 },
  },
  attacks: { [CRAWLER_RUSH.id]: CRAWLER_RUSH },
  hurt: HURT(14, 1),
  death: { ticks: 36 },
  view: { proceduralId: 'bramble_crawler' },
};

// ---------------------------------------------------------------------------------------------------------- Mire Toad
export const TOAD_LEAP = blow({ id: 'toad_leap', startup: 20, active: 60, recovery: 40, hitbox: hit(-0.6, 0, 1.2, 0.9) });
export const TOAD_SHOCK = blow({ id: 'toad_shock', startup: 0, active: 6, recovery: 0, hitbox: hit(0, 0, 2.1, 0.5), knockback: { x: 6, y: 4.5 }, anim: 'attack' });
export const MIRE_TOAD: EnemyDefinition = {
  id: 'mire_toad',
  nameKey: 'enemy.toad.name',
  health: 5,
  body: { halfWidth: 0.6, height: 0.9 },
  ai: {
    archetype: 'toad',
    params: { patrolRange: 3, idleTicks: [30, 80], detectRange: 10, detectHeight: 3, alertTicks: 12, leapRange: 6.5, leapVy: 12, attack: TOAD_LEAP.id, shock: TOAD_SHOCK.id, friction: 30, gravity: 52 },
  },
  attacks: { [TOAD_LEAP.id]: TOAD_LEAP, [TOAD_SHOCK.id]: TOAD_SHOCK },
  hurt: HURT(14, 0.9),
  death: { ticks: 40 },
  view: { proceduralId: 'mire_toad' },
};

// ---------------------------------------------------------------------------------------------------------- Stoneback
export const GUARD_SMASH = blow({ id: 'guard_smash', startup: 38, active: 5, recovery: 56, hitbox: hit(0.1, 0, 1.9, 1.5), damage: 2, knockback: { x: 7, y: 4 }, stun: 16, hitStop: 8, shake: 0.3 });
export const STONEBACK: EnemyDefinition = {
  id: 'stoneback',
  nameKey: 'enemy.stoneback.name',
  health: 7,
  body: { halfWidth: 0.7, height: 1.4 },
  ai: {
    archetype: 'guard',
    params: { patrolSpeed: 1.1, approachSpeed: 1.8, patrolRange: 3, idleTicks: [50, 120], detectRange: 9, detectHeight: 2.2, alertTicks: 20, attackRange: 1.8, attackHeight: 1.2, turnTicks: 30, pierces: ['slam_dive', 'slam'], attack: GUARD_SMASH.id, friction: 30, gravity: 52 },
  },
  attacks: { [GUARD_SMASH.id]: GUARD_SMASH },
  hurt: HURT(12, 0.4),
  death: { ticks: 44 },
  view: { proceduralId: 'stoneback' },
};

// ---------------------------------------------------------------------------------------------------------- Glow Spore
export const SPORE_CLOUD = blow({ id: 'spore_cloud', startup: 32, active: 44, recovery: 60, hitbox: hit(-2.5, 0, 5, 2), knockback: { x: 4, y: 5 }, stun: 12, hitStop: 4, shake: 0.12 });
export const GLOW_SPORE: EnemyDefinition = {
  id: 'glow_spore',
  nameKey: 'enemy.spore.name',
  health: 4,
  body: { halfWidth: 0.45, height: 1.1 },
  ai: { archetype: 'spore', params: { triggerRange: 5.5, triggerHeight: 3, closedTicks: 70, attack: SPORE_CLOUD.id, gravity: 52 } },
  attacks: { [SPORE_CLOUD.id]: SPORE_CLOUD },
  hurt: HURT(10, 0), // planted: nothing moves it
  death: { ticks: 34 },
  view: { proceduralId: 'glow_spore' },
};

// ---------------------------------------------------------------------------------------------------------- Ink Spitter
export const SPITTER_SPIT = blow({ id: 'spitter_spit', startup: 28, active: 1, recovery: 44, hitbox: hit(0, 0, 0.01, 0.01) });
export const SPIT: ShotSpec = { mode: 'air', speed: 10, size: { w: 0.5, h: 0.4 }, damage: 1, knockback: { x: 5, y: 3 }, stun: 14, hitStop: 5, shake: 0.15, ttl: 100, attackId: 'spit' };
export const INK_SPITTER: EnemyDefinition = {
  id: 'ink_spitter',
  nameKey: 'enemy.spitter.name',
  health: 3,
  body: { halfWidth: 0.45, height: 1.2 },
  ai: {
    archetype: 'spitter',
    params: { patrolSpeed: 1.4, patrolRange: 3, idleTicks: [40, 100], detectRange: 12, detectHeight: 2.6, alertTicks: 14, keepAway: 4.5, retreatSpeed: 3.6, cooldownTicks: 50, attack: SPITTER_SPIT.id, shot: SPIT, muzzle: { x: 0.6, y: 0.8 }, friction: 30, gravity: 52 },
  },
  attacks: { [SPITTER_SPIT.id]: SPITTER_SPIT },
  hurt: HURT(14, 1),
  death: { ticks: 36 },
  view: { proceduralId: 'ink_spitter' },
};

// ---------------------------------------------------------------------------------------------------------- Cave Bat
export const BAT_SWOOP = blow({ id: 'bat_swoop', startup: 18, active: 36, recovery: 0, hitbox: hit(-0.4, -0.1, 0.8, 0.7), knockback: { x: 5, y: 3 }, stun: 12, hitStop: 5, shake: 0.15 });
export const CAVE_BAT: EnemyDefinition = {
  id: 'cave_bat',
  nameKey: 'enemy.bat.name',
  health: 2,
  body: { halfWidth: 0.4, height: 0.5 },
  ai: { archetype: 'bat', params: { wakeRange: 6.5, wakeHeight: 9, swoopSpeed: 10.5, turnRate: 0.07, swoopTicks: 36, returnSpeed: 5, maxSwoops: 2, hoverTicks: 16, attack: BAT_SWOOP.id } },
  attacks: { [BAT_SWOOP.id]: BAT_SWOOP },
  hurt: HURT(10, 1.2),
  death: { ticks: 30 },
  view: { proceduralId: 'cave_bat' },
};

// ---------------------------------------------------------------------------------------------------------- Lantern Wisp
export const WISP_BLAST = blow({ id: 'wisp_blast', startup: 34, active: 6, recovery: 0, hitbox: hit(-2.1, -1.2, 4.2, 3.6), damage: 2, knockback: { x: 6, y: 5 }, stun: 18, hitStop: 8, shake: 0.3 });
export const LANTERN_WISP: EnemyDefinition = {
  id: 'lantern_wisp',
  nameKey: 'enemy.wisp.name',
  health: 2,
  body: { halfWidth: 0.35, height: 0.7 },
  ai: { archetype: 'wisp', params: { driftSpeed: 1.2, driftRange: 2.5, chaseRange: 9, chaseHeight: 6, chaseSpeed: 3.6, hoverAbove: 0.6, fuseRange: 2, attack: WISP_BLAST.id } },
  attacks: { [WISP_BLAST.id]: WISP_BLAST },
  hurt: HURT(8, 1.5),
  death: { ticks: 26 },
  view: { proceduralId: 'lantern_wisp' },
};

// ---------------------------------------------------------------------------------------------------------- Bell Toller
export const TOLLER_TOLL = blow({ id: 'toller_toll', startup: 36, active: 4, recovery: 50, hitbox: hit(0, 0, 0.01, 0.01) });
export const TOLL_WAVE: ShotSpec = { mode: 'ground', speed: 6.5, size: { w: 0.9, h: 0.7 }, damage: 1, knockback: { x: 5, y: 5 }, stun: 14, hitStop: 5, shake: 0.15, ttl: 150, attackId: 'toll_wave' };
export const BELL_TOLLER: EnemyDefinition = {
  id: 'bell_toller',
  nameKey: 'enemy.toller.name',
  health: 6,
  body: { halfWidth: 0.6, height: 1.8 },
  ai: { archetype: 'toller', params: { interval: 140, range: 15, height: 4, attack: TOLLER_TOLL.id, shot: TOLL_WAVE, muzzle: { x: 0.9, y: 0.35 }, gravity: 52 } },
  attacks: { [TOLLER_TOLL.id]: TOLLER_TOLL },
  hurt: HURT(10, 0.3),
  death: { ticks: 40 },
  view: { proceduralId: 'bell_toller' },
};

// ---------------------------------------------------------------------------------------------------------- Shardling (and the shard it breaks into)
export const SHARD_NIP = blow({ id: 'shard_nip', startup: 10, active: 6, recovery: 24, hitbox: hit(-0.35, 0, 0.7, 0.5), lunge: { speed: 6, ticks: 6 } });
export const CRYSTAL_SHARD: EnemyDefinition = {
  id: 'crystal_shard',
  nameKey: 'enemy.shard.name',
  health: 1,
  body: { halfWidth: 0.3, height: 0.45 },
  ai: {
    archetype: 'slime',
    params: { patrolSpeed: 2, approachSpeed: 5.5, approachAccel: 30, detectRange: 10, detectHeight: 2.5, attackHeight: 0.9, loseRange: 12, attackRange: 1.2, lineOfSight: false, alertTicks: 4, idleTicks: [10, 30], patrolRange: 2, attack: SHARD_NIP.id, friction: 30, gravity: 52 },
  },
  attacks: { [SHARD_NIP.id]: SHARD_NIP },
  hurt: HURT(8, 1.4),
  death: { ticks: 20 },
  view: { proceduralId: 'crystal_shard' },
};
export const ROLLER_ROLL = blow({ id: 'roller_roll', startup: 26, active: 66, recovery: 48, hitbox: hit(-0.6, 0, 1.2, 0.9), knockback: { x: 6.5, y: 4 } });
export const SHARDLING: EnemyDefinition = {
  id: 'shardling',
  nameKey: 'enemy.shardling.name',
  health: 5,
  body: { halfWidth: 0.6, height: 0.9 },
  ai: {
    archetype: 'roller',
    params: { patrolSpeed: 1, approachSpeed: 2, patrolRange: 3, idleTicks: [50, 110], detectRange: 9, detectHeight: 2, alertTicks: 16, rollRange: 6, rollSpeed: 8.5, bounces: 1, attack: ROLLER_ROLL.id, splitInto: CRYSTAL_SHARD, splitCount: 2, friction: 30, gravity: 52 },
  },
  attacks: { [ROLLER_ROLL.id]: ROLLER_ROLL },
  hurt: HURT(12, 0.7),
  death: { ticks: 36 },
  view: { proceduralId: 'shardling' },
};

// ---------------------------------------------------------------------------------------------------------- Piston Drone
export const PISTON_DROP = blow({ id: 'piston_drop', startup: 30, active: 40, recovery: 60, hitbox: hit(-0.65, -0.5, 1.3, 1.4), damage: 2, knockback: { x: 5, y: 6 }, stun: 18, hitStop: 8, shake: 0.35 });
export const PISTON_DRONE: EnemyDefinition = {
  id: 'piston_drone',
  nameKey: 'enemy.piston.name',
  health: 6,
  body: { halfWidth: 0.6, height: 1.0 },
  ai: { archetype: 'piston', params: { detectRange: 14, detectHeight: 12, trackSpeed: 4.8, lockRange: 0.7, lockDelay: 18, dropSpeed: 24, riseSpeed: 5, cooldownTicks: 60, attack: PISTON_DROP.id } },
  attacks: { [PISTON_DROP.id]: PISTON_DROP },
  hurt: HURT(10, 0.5),
  death: { ticks: 36 },
  view: { proceduralId: 'piston_drone' },
};

// ---------------------------------------------------------------------------------------------------------- Floor Leech
export const LEECH_BITE = blow({ id: 'leech_bite', startup: 12, active: 8, recovery: 48, hitbox: hit(-0.4, 0, 1.5, 0.6), damage: 2, knockback: { x: 5, y: 4 } });
export const FLOOR_LEECH: EnemyDefinition = {
  id: 'floor_leech',
  nameKey: 'enemy.leech.name',
  health: 3,
  body: { halfWidth: 0.6, height: 0.55 },
  ai: { archetype: 'leech', params: { ambushRange: 1.7, ambushHeight: 1.2, biteSpeed: 6, biteLunge: 5, attack: LEECH_BITE.id, sinkTicks: 50, rearmRange: 4, gravity: 52 } },
  attacks: { [LEECH_BITE.id]: LEECH_BITE },
  hurt: HURT(12, 1),
  death: { ticks: 30 },
  view: { proceduralId: 'floor_leech' },
};

// ---------------------------------------------------------------------------------------------------------- Ink Weaver
export const WEAVER_WEAVE = blow({ id: 'weaver_weave', startup: 44, active: 1, recovery: 50, hitbox: hit(0, 0, 0.01, 0.01) });
export const INK_WEAVER: EnemyDefinition = {
  id: 'ink_weaver',
  nameKey: 'enemy.weaver.name',
  health: 6,
  body: { halfWidth: 0.5, height: 1.6 },
  ai: {
    archetype: 'weaver',
    params: { patrolRange: 3, detectRange: 12, detectHeight: 3, alertTicks: 18, keepAway: 4, retreatSpeed: 2.4, interval: 170, maxAlive: 2, attack: WEAVER_WEAVE.id, summon: INK_SLIME, summonOffset: 1.5, friction: 30, gravity: 52 },
  },
  attacks: { [WEAVER_WEAVE.id]: WEAVER_WEAVE },
  hurt: HURT(16, 1.2),
  death: { ticks: 44 },
  view: { proceduralId: 'ink_weaver' },
};

// ---------------------------------------------------------------------------------------------------------- Veil Shade
export const SHADE_SLASH = blow({ id: 'shade_slash', startup: 24, active: 5, recovery: 44, hitbox: hit(0.15, 0.1, 1.7, 1.5), damage: 2, knockback: { x: 7, y: 3 }, stun: 16, hitStop: 7, shake: 0.25 });
export const VEIL_SHADE: EnemyDefinition = {
  id: 'veil_shade',
  nameKey: 'enemy.shade.name',
  health: 5,
  body: { halfWidth: 0.45, height: 1.7 },
  ai: { archetype: 'shade', params: { detectRange: 10, detectHeight: 3, driftSpeed: 1.6, vanishRange: 6, vanishTicks: 16, goneTicks: 26, behind: 2, attack: SHADE_SLASH.id, gravity: 52 } },
  attacks: { [SHADE_SLASH.id]: SHADE_SLASH },
  hurt: HURT(14, 1),
  death: { ticks: 36 },
  view: { proceduralId: 'veil_shade' },
};

/** The creatures, in the order a hero meets them in the world; the Ink Slime of the first rooms is `INK_SLIME`. The shard is not one of the thirteen: it is what the Shardling comes apart into. */
export const CREATURES: readonly EnemyDefinition[] = [
  BRAMBLE_CRAWLER,
  MIRE_TOAD,
  STONEBACK,
  GLOW_SPORE,
  INK_SPITTER,
  CAVE_BAT,
  LANTERN_WISP,
  BELL_TOLLER,
  SHARDLING,
  CRYSTAL_SHARD,
  PISTON_DRONE,
  FLOOR_LEECH,
  INK_WEAVER,
  VEIL_SHADE,
];
