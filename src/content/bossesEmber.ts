import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { BossAttackSpec, BossDefinition } from '@/enemies/boss/BossDefinition';
import type { ShotSpec } from '@/enemies/EnemyShot';
import { CINDER_CRAWLER, CINDER_WEAVER, DUSK_SHADE, EMBER_WISP } from './creaturesEmber';

/**
 * THE GUARDIANS OF THE SECOND HALF (docs/PROMPT23-LOG.md §7): four more fights, each one the engine of the first half (`enemies/boss/Boss.ts`) running a table — and each with a different CONDITION under which it can be hurt at all, and a floor of its own
 * to be fought on (the arenas have lava at their edges: the way back from a mistake is a burn):
 *
 *   Dusk Shepherd      a gaunt tree that carries its heart-sphere in its chest and takes it out only to throw it: the sphere is open for the length of every volley — and for nothing else
 *   Grove Gardener     tends its spheres, and the spheres are what it calls: two ember wisps at two thirds of its life and three at a third; its bloom shows after a leap and after a burst
 *   Crater Behemoth    a mountain that walks: the crust on its back cracks open when it comes down — a stomp, or a charge that ends against a wall (the longest opening of the world) — and it throws lava from its mouth
 *   Cinder Sovereign   the last: it cuts from behind, rains geysers of fire where the hero stands and where they will, throws spheres and a ring, charges across the floor and, in the end, throws a ring of fire from itself; calls a shade and then a weaver
 *
 * All numbers are data in metres, ticks (60 to the second) and points of life; the wind-up of every attack IS its `startup`, the telegraph the hero reads. The numbers were set by playing: `tests/integration/encountersEmber.test.ts` fights each
 * guardian in its own arena with a hero who is mortal and reads the telegraphs, and `tests/integration/bossesEmber.test.ts` holds what each one does.
 */

const blow = (a: Partial<AttackDefinition> & Pick<AttackDefinition, 'id' | 'startup' | 'active' | 'recovery'>): AttackDefinition => ({
  damage: 2,
  hitbox: { x: 0, y: 0, w: 0.01, h: 0.01 },
  knockback: { x: 6.5, y: 4.5 },
  stun: 18,
  hitStop: 8,
  shake: 0.3,
  moveControl: 0,
  anim: 'telegraph',
  ...a,
});
const shot = (s: Partial<ShotSpec> & Pick<ShotSpec, 'attackId'>): ShotSpec => ({
  mode: 'air', speed: 9, size: { w: 0.6, h: 0.5 }, damage: 1, knockback: { x: 5, y: 3 }, stun: 14, hitStop: 5, shake: 0.15, ttl: 150, ...s,
});
const atk = (a: Omit<BossAttackSpec, 'weight'> & { weight: [near: number, far: number] }): BossAttackSpec => ({ ...a, weight: { near: a.weight[0], far: a.weight[1] } });

/** Every boss has the same four hits of time: it wakes for a second and a half, staggers for a third, flashes for six ticks, and takes a second and a half to fall. */
const TIMES = { introTicks: 90, staggerTicks: 20, flashTicks: 6, deathTicks: 100, friction: 60, gravity: 52 } as const;

// ------------------------------------------------------------------------------------------------------------ Dusk Shepherd
export const DUSK_SHEPHERD: BossDefinition = {
  id: 'boss_shepherd',
  nameKey: 'enemy.shepherd.name',
  health: 56,
  body: { halfWidth: 1.2, height: 4.4 },
  hurtboxes: [
    { x: -0.6, y: 1.7, w: 1.2, h: 1.5, multiplier: 2, part: 'orb', when: ['exposed'] },
    { x: -1.2, y: 0, w: 2.4, h: 4.4, multiplier: 0.3, part: 'body' },
  ],
  ...TIMES,
  farDistance: 8,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['sweep', 'volley', 'stamp'] },
    { at: 0.5, tempo: 0.8, shiftTicks: 70, summon: { def: CINDER_CRAWLER, count: 1 }, attacks: ['sweep', 'volley', 'stamp'] },
  ],
  attacks: {
    // its staff across the floor in front of it: a lunge and a long reach
    sweep: atk({
      attack: blow({ id: 'shepherd_sweep', startup: 44, active: 9, recovery: 62, hitbox: { x: 0.6, y: 0, w: 4.2, h: 2.4 }, knockback: { x: 8, y: 4 } }),
      handler: 'sweep',
      params: { lunge: 4, lungeTicks: 8 },
      weight: [3, 1],
      exposes: false,
    }),
    // the opening: it takes the sphere out of its chest to throw it, and for as long as the throw lasts the sphere is where a blow can reach it
    volley: atk({
      attack: blow({ id: 'shepherd_volley', startup: 36, active: 12, recovery: 124, damage: 1 }),
      handler: 'volley',
      params: { count: 5, speed: 9, spread: 56, arc: 18 },
      shot: shot({ attackId: 'shepherd_orb', size: { w: 0.8, h: 0.8 }, ttl: 170 }),
      weight: [2, 3],
    }),
    stamp: atk({
      attack: blow({ id: 'shepherd_stamp', startup: 40, active: 6, recovery: 58, damage: 1 }),
      handler: 'waves',
      params: { count: 2, gap: 34, speed: 6, faster: 1 },
      shot: shot({ mode: 'ground', speed: 6, size: { w: 1, h: 0.8 }, knockback: { x: 5, y: 5 }, ttl: 150, attackId: 'shepherd_wave' }),
      weight: [1, 2],
      exposes: false,
    }),
  },
  view: { lookId: 'boss_shepherd' },
};

// ------------------------------------------------------------------------------------------------------------ Grove Gardener
export const GROVE_GARDENER: BossDefinition = {
  id: 'boss_gardener',
  nameKey: 'enemy.gardener.name',
  health: 64,
  body: { halfWidth: 1.3, height: 3.2 },
  hurtboxes: [
    { x: -0.6, y: 1.6, w: 1.2, h: 1.3, multiplier: 2, part: 'bloom', when: ['exposed'] },
    { x: -1.3, y: 0, w: 2.6, h: 3.2, multiplier: 0.25, part: 'body' },
  ],
  ...TIMES,
  farDistance: 7.5,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['leap', 'ring'] },
    { at: 0.66, tempo: 0.88, shiftTicks: 80, summon: { def: EMBER_WISP, count: 2 }, attacks: ['leap', 'ring', 'roots'] },
    { at: 0.33, tempo: 0.74, shiftTicks: 80, summon: { def: EMBER_WISP, count: 3 }, attacks: ['leap', 'ring', 'roots'] },
  ],
  attacks: {
    leap: atk({
      attack: blow({ id: 'gardener_leap', startup: 34, active: 80, recovery: 112, hitbox: { x: -1.3, y: 0, w: 2.6, h: 2.2 }, knockback: { x: 7, y: 5 } }),
      handler: 'leap',
      params: { vy: 14, range: 13, shockWidth: 4.2, shockTicks: 10 },
      weight: [1, 3],
    }),
    // a ring of spheres out of its crown: low ones along the floor and high ones that fall in an arc
    ring: atk({
      attack: blow({ id: 'gardener_ring', startup: 40, active: 14, recovery: 78, damage: 1 }),
      handler: 'burst',
      params: { count: 4, speed: 10, minAngle: 10, maxAngle: 68, arc: 20 },
      shot: shot({ size: { w: 0.7, h: 0.7 }, attackId: 'gardener_orb' }),
      weight: [2, 2],
      exposes: false,
    }),
    // roots that run along the floor toward the hero, one after the other
    roots: atk({
      attack: blow({ id: 'gardener_roots', startup: 42, active: 1, recovery: 76, knockback: { x: 4, y: 7 } }),
      handler: 'march',
      params: { count: 6, step: 3.2, first: 3, delay: 8, columnTicks: 12, width: 1.8, height: 4.6 },
      weight: [1, 3],
      exposes: false,
    }),
  },
  view: { lookId: 'boss_gardener' },
};

// ------------------------------------------------------------------------------------------------------------ Crater Behemoth
export const CRATER_BEHEMOTH: BossDefinition = {
  id: 'boss_behemoth',
  nameKey: 'enemy.behemoth.name',
  health: 76,
  body: { halfWidth: 1.9, height: 3.6 },
  hurtboxes: [
    { x: -1.9, y: 2.1, w: 1.4, h: 1.3, multiplier: 2.1, part: 'crust', when: ['exposed'] },
    { x: -1.9, y: 0, w: 3.8, h: 3.6, multiplier: 0, part: 'armor' },
  ],
  ...TIMES,
  farDistance: 9,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['charge', 'stomp'] },
    { at: 0.6, tempo: 0.9, shiftTicks: 70, attacks: ['charge', 'stomp', 'bombs'] },
    { at: 0.3, tempo: 0.8, shiftTicks: 70, attacks: ['charge', 'stomp', 'bombs', 'rolls'] },
  ],
  attacks: {
    // it runs the floor from wall to wall: where it ends against a wall it is stunned for a long time, and its crust is open
    charge: atk({
      attack: blow({ id: 'behemoth_charge', startup: 42, active: 60, recovery: 62, hitbox: { x: 0, y: 0.1, w: 2.4, h: 2.4 }, knockback: { x: 9, y: 4.5 } }),
      handler: 'charge',
      params: { speed: 11.5, ticks: 60, wallStun: 85 },
      weight: [1, 3],
    }),
    stomp: atk({
      attack: blow({ id: 'behemoth_stomp', startup: 46, active: 10, recovery: 84 }),
      handler: 'stomp',
      params: { shockWidth: 6.5 },
      shot: shot({ mode: 'ground', speed: 6.5, size: { w: 1.1, h: 0.9 }, knockback: { x: 5, y: 5 }, ttl: 150, attackId: 'behemoth_wave' }),
      weight: [3, 1],
    }),
    // lava thrown from its mouth in arcs
    bombs: atk({
      attack: blow({ id: 'behemoth_bombs', startup: 38, active: 12, recovery: 62, damage: 1 }),
      handler: 'volley',
      params: { count: 4, speed: 9.5, spread: 40, arc: 24 },
      shot: shot({ attackId: 'behemoth_bomb', size: { w: 0.9, h: 0.9 } }),
      weight: [2, 3],
      exposes: false,
    }),
    rolls: atk({
      attack: blow({ id: 'behemoth_rolls', startup: 40, active: 6, recovery: 58, damage: 1 }),
      handler: 'waves',
      params: { count: 3, gap: 30, speed: 6.5, faster: 1.2 },
      shot: shot({ mode: 'ground', speed: 6.5, size: { w: 1.1, h: 0.9 }, knockback: { x: 5, y: 5 }, ttl: 160, attackId: 'behemoth_roll' }),
      weight: [2, 2],
      exposes: false,
    }),
  },
  view: { lookId: 'boss_behemoth' },
};

// ------------------------------------------------------------------------------------------------------------ Cinder Sovereign
export const CINDER_SOVEREIGN: BossDefinition = {
  id: 'boss_cinder_sovereign',
  nameKey: 'enemy.cinderSovereign.name',
  health: 84,
  body: { halfWidth: 1.2, height: 3.4 },
  hurtboxes: [
    { x: -0.5, y: 1.4, w: 1, h: 1.3, multiplier: 2, part: 'core', when: ['exposed'] },
    { x: -1.2, y: 0, w: 2.4, h: 3.4, multiplier: 0.2, part: 'body' },
  ],
  ...TIMES,
  farDistance: 8.5,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['cut', 'geysers', 'orbs'] },
    { at: 0.7, tempo: 0.86, shiftTicks: 80, summon: { def: DUSK_SHADE, count: 1 }, attacks: ['cut', 'geysers', 'orbs', 'rush'] },
    { at: 0.38, tempo: 0.74, shiftTicks: 80, summon: { def: CINDER_WEAVER, count: 1 }, attacks: ['cut', 'geysers', 'orbs', 'rush', 'nova'] },
  ],
  attacks: {
    cut: atk({
      attack: blow({ id: 'cinder_cut', startup: 28, active: 6, recovery: 60, hitbox: { x: 0.2, y: 0.1, w: 2.6, h: 2.5 }, knockback: { x: 8.5, y: 3 } }),
      handler: 'teleport',
      params: { gone: 26, appear: 20, behind: 2.6 },
      weight: [3, 2],
    }),
    // columns of fire out of the floor: one under the hero, the others where they will have to be
    geysers: atk({
      attack: blow({ id: 'cinder_geysers', startup: 40, active: 16, recovery: 58, knockback: { x: 5, y: 7.5 } }),
      handler: 'eruptions',
      params: { offsets: [-3.6, 0, 3.6], random: 2, offsets3: [-6, -2.5, 2.5, 6], width: 1.8, height: 6.5, gap: 3.4 },
      weight: [2, 2],
      exposes: false,
    }),
    orbs: atk({
      attack: blow({ id: 'cinder_orbs', startup: 34, active: 12, recovery: 66, damage: 1 }),
      handler: 'volley',
      params: { count: 3, speed: 8, spread: 36, arc: 0 },
      shot: shot({ attackId: 'cinder_orb', size: { w: 0.8, h: 0.8 } }),
      weight: [2, 3],
    }),
    rush: atk({
      attack: blow({ id: 'cinder_rush', startup: 40, active: 54, recovery: 56, hitbox: { x: 0, y: 0.1, w: 2.2, h: 2.4 }, knockback: { x: 9, y: 4 } }),
      handler: 'charge',
      params: { speed: 12, ticks: 54, wallStun: 70 },
      weight: [1, 3],
    }),
    nova: atk({
      attack: blow({ id: 'cinder_nova', startup: 44, active: 14, recovery: 70, damage: 1 }),
      handler: 'burst',
      params: { count: 4, speed: 9, minAngle: 8, maxAngle: 72, arc: 0 },
      shot: shot({ attackId: 'cinder_nova', size: { w: 0.7, h: 0.7 } }),
      weight: [2, 2],
    }),
  },
  view: { lookId: 'boss_cinder_sovereign' },
};

/** The guardians of the second half, in the order the hero meets them. (The creatures they call are in `creaturesEmber.ts`.) */
export const EMBER_BOSS_LIST: readonly BossDefinition[] = [DUSK_SHEPHERD, GROVE_GARDENER, CRATER_BEHEMOTH, CINDER_SOVEREIGN];
export const EMBER_BOSSES: Readonly<Record<string, BossDefinition>> = Object.fromEntries(EMBER_BOSS_LIST.map((b) => [b.id, b]));
