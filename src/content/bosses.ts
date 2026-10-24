import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { BossAttackSpec, BossDefinition } from '@/enemies/boss/BossDefinition';
import type { ShotSpec } from '@/enemies/EnemyShot';
import { INK_WEAVER, LANTERN_WISP, VEIL_SHADE } from './creatures';

/**
 * THE GUARDIANS OF THE WORLD after the Ink Warden (docs/PROMPT21-LOG.md): six fights that are not the same fight. Each is the engine (`enemies/boss/Boss.ts`) running a table; what makes it itself is the table — which patterns it has, how its phases change them,
 * and, above all, the CONDITION under which it can be hurt at all:
 *
 *   Root Tyrant        bark armour; its heart shows only while it recovers from a sweep or an eruption; in the second phase a line of columns marches at the hero
 *   Mire Matriarch     takes a chip from anywhere and the full blow only on her belly, which shows after a leap or a lash; calls two lanterns at the second phase
 *   Crystal Colossus   shut like a mountain: nothing hurts it but the core it opens after a burst of shards, and the burst is a third of what it does
 *   Bell Warden        a flyer: it hangs out of reach and is hurt only where it falls on the hero and is stuck in the floor
 *   Foundry Engine     the vent on its back opens when its charge ends against a wall (a long stun); the pistons come up in alternate rows; three phases
 *   Inkheart Sovereign vanishes and cuts from behind, throws orbs and a ring; always hurtable at its heart; calls a creature at each phase
 *
 * All numbers are data in metres, ticks (60 to the second) and points of life; the wind-up of every attack IS its `startup`, the telegraph the hero reads.
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

// ------------------------------------------------------------------------------------------------------------ Root Tyrant
export const ROOT_TYRANT: BossDefinition = {
  id: 'boss_root_tyrant',
  nameKey: 'enemy.rootTyrant.name',
  health: 40,
  body: { halfWidth: 1.5, height: 4.2 },
  hurtboxes: [
    { x: 0.2, y: 1.6, w: 1.1, h: 1.4, multiplier: 2, part: 'core', when: ['exposed'] },
    { x: -1.5, y: 0, w: 3, h: 4.2, multiplier: 0, part: 'armor' },
  ],
  ...TIMES,
  farDistance: 8,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['sweep', 'eruptions'] },
    { at: 0.5, tempo: 0.8, shiftTicks: 70, attacks: ['sweep', 'eruptions', 'march'] },
  ],
  attacks: {
    sweep: atk({ attack: blow({ id: 'tyrant_sweep', startup: 46, active: 10, recovery: 70, hitbox: { x: 0.8, y: 0, w: 3.4, h: 2.2 }, knockback: { x: 8, y: 4 } }), handler: 'sweep', params: { lunge: 5, lungeTicks: 8 }, weight: [3, 1] }),
    eruptions: atk({
      attack: blow({ id: 'tyrant_eruptions', startup: 40, active: 16, recovery: 64, knockback: { x: 5, y: 7 } }),
      handler: 'eruptions',
      params: { offsets: [-4.5, 0, 4.5], offsets2: [-7, -3.5, 0, 3.5, 7], width: 1.8, height: 6 },
      weight: [2, 2],
    }),
    march: atk({
      attack: blow({ id: 'tyrant_march', startup: 44, active: 1, recovery: 80, knockback: { x: 5, y: 7 } }),
      handler: 'march',
      params: { count: 7, step: 3.2, first: 3, delay: 8, columnTicks: 12, width: 1.8, height: 5.5 },
      weight: [1, 3],
    }),
  },
  view: { lookId: 'boss_root_tyrant' },
};

// ------------------------------------------------------------------------------------------------------------ Mire Matriarch
export const MIRE_MATRIARCH: BossDefinition = {
  id: 'boss_mire_matriarch',
  nameKey: 'enemy.mireMatriarch.name',
  health: 44,
  body: { halfWidth: 1.4, height: 2.4 },
  hurtboxes: [
    { x: -0.8, y: 0.2, w: 1.6, h: 1.3, multiplier: 1.6, part: 'belly', when: ['exposed'] },
    { x: -1.4, y: 0, w: 2.8, h: 2.4, multiplier: 0.35, part: 'body' },
  ],
  ...TIMES,
  farDistance: 7,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['leap', 'tongue', 'spit'] },
    { at: 0.55, tempo: 0.85, shiftTicks: 80, summon: { def: LANTERN_WISP, count: 2 }, attacks: ['leap', 'tongue', 'spit'] },
  ],
  attacks: {
    leap: atk({
      attack: blow({ id: 'matriarch_leap', startup: 36, active: 80, recovery: 74, hitbox: { x: -1.2, y: 0, w: 2.4, h: 2 }, knockback: { x: 7, y: 5 } }),
      handler: 'leap',
      params: { vy: 14, range: 12, shockWidth: 4, shockTicks: 10 },
      weight: [1, 3],
    }),
    tongue: atk({ attack: blow({ id: 'matriarch_tongue', startup: 30, active: 8, recovery: 56, hitbox: { x: 1, y: 0.6, w: 6, h: 0.9 }, knockback: { x: 8, y: 3 } }), handler: 'sweep', params: {}, weight: [3, 1] }),
    spit: atk({
      attack: blow({ id: 'matriarch_spit', startup: 34, active: 12, recovery: 60, damage: 1 }),
      handler: 'volley',
      params: { count: 3, speed: 11, spread: 24, arc: 14, lift: 0.25 },
      shot: shot({ attackId: 'matriarch_spit', size: { w: 0.8, h: 0.7 } }),
      weight: [2, 2],
      exposes: false,
    }),
  },
  view: { lookId: 'boss_mire_matriarch' },
};

// ------------------------------------------------------------------------------------------------------------ Crystal Colossus
export const CRYSTAL_COLOSSUS: BossDefinition = {
  id: 'boss_colossus',
  nameKey: 'enemy.colossus.name',
  health: 48,
  body: { halfWidth: 1.6, height: 4.6 },
  hurtboxes: [
    { x: -0.5, y: 1.8, w: 1, h: 1.4, multiplier: 2.2, part: 'core', when: ['exposed'] },
    { x: -1.6, y: 0, w: 3.2, h: 4.6, multiplier: 0, part: 'armor' },
  ],
  ...TIMES,
  farDistance: 8,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['stomp', 'rockfall', 'burst'] },
    { at: 0.5, tempo: 0.8, shiftTicks: 70, attacks: ['stomp', 'rockfall', 'burst'] },
  ],
  attacks: {
    stomp: atk({
      attack: blow({ id: 'colossus_stomp', startup: 42, active: 10, recovery: 60 }),
      handler: 'stomp',
      params: { shockWidth: 6.5 },
      shot: shot({ mode: 'ground', speed: 7, size: { w: 1, h: 0.8 }, knockback: { x: 5, y: 5 }, ttl: 140, attackId: 'colossus_wave' }),
      weight: [3, 1],
      exposes: false,
    }),
    rockfall: atk({
      attack: blow({ id: 'colossus_rockfall', startup: 46, active: 18, recovery: 70, knockback: { x: 4, y: 7 } }),
      handler: 'eruptions',
      params: { offsets: [0], offsets2: [0, -5, 5], random: 3, width: 2, height: 15, gap: 3.4 },
      weight: [2, 2],
      exposes: false,
    }),
    // the burst opens it: a long recovery with the core showing is the only time it can be hurt
    burst: atk({
      attack: blow({ id: 'colossus_burst', startup: 44, active: 14, recovery: 110, damage: 1 }),
      handler: 'burst',
      params: { count: 4, speed: 11, minAngle: 10, maxAngle: 70, arc: 22 },
      shot: shot({ size: { w: 0.7, h: 0.6 }, attackId: 'colossus_shard' }),
      weight: [2, 2],
    }),
  },
  view: { lookId: 'boss_colossus' },
};

// ------------------------------------------------------------------------------------------------------------ Bell Warden
export const BELL_WARDEN: BossDefinition = {
  id: 'boss_bell_warden',
  nameKey: 'enemy.bellWarden.name',
  health: 46,
  body: { halfWidth: 1.2, height: 2.2 },
  hurtboxes: [
    { x: -0.5, y: 0, w: 1, h: 1, multiplier: 2, part: 'clapper', when: ['exposed'] },
    { x: -1.2, y: 0, w: 2.4, h: 2.2, multiplier: 0, part: 'armor' },
  ],
  ...TIMES,
  friction: 40,
  hover: 3.6,
  farDistance: 8,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['dive', 'toll', 'chime'] },
    { at: 0.5, tempo: 0.8, shiftTicks: 70, attacks: ['dive', 'toll', 'chime'] },
  ],
  attacks: {
    // the opening: it falls on the hero and is stuck in the floor, and only then is it within reach
    dive: atk({
      attack: blow({ id: 'bell_dive', startup: 36, active: 40, recovery: 70, hitbox: { x: -1.1, y: -0.1, w: 2.2, h: 2 }, knockback: { x: 7, y: 6 } }),
      handler: 'dive',
      params: { speed: 17, stuck: 40, track: 9 },
      weight: [2, 3],
    }),
    toll: atk({
      attack: blow({ id: 'bell_toll', startup: 38, active: 6, recovery: 60, damage: 1 }),
      handler: 'waves',
      params: { count: 3, gap: 22, speed: 6.5, faster: 1.2 },
      shot: shot({ mode: 'ground', speed: 6.5, size: { w: 1, h: 0.8 }, knockback: { x: 5, y: 5 }, ttl: 150, attackId: 'bell_wave' }),
      weight: [3, 1],
      exposes: false,
    }),
    chime: atk({
      attack: blow({ id: 'bell_chime', startup: 34, active: 14, recovery: 56, knockback: { x: 4, y: 7 } }),
      handler: 'eruptions',
      params: { offsets: [0], offsets2: [0, -5, 5], random: 3, width: 1.4, height: 9, gap: 3 },
      weight: [2, 2],
      exposes: false,
    }),
  },
  view: { lookId: 'boss_bell_warden' },
};

// ------------------------------------------------------------------------------------------------------------ Foundry Engine
export const FOUNDRY_ENGINE: BossDefinition = {
  id: 'boss_engine',
  nameKey: 'enemy.engine.name',
  health: 60,
  body: { halfWidth: 1.8, height: 3.4 },
  hurtboxes: [
    { x: -1.8, y: 2, w: 1.1, h: 1.1, multiplier: 2, part: 'vent', when: ['exposed'] },
    { x: -1.8, y: 0, w: 3.6, h: 3.4, multiplier: 0, part: 'armor' },
  ],
  ...TIMES,
  farDistance: 8,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['charge', 'pistons'] },
    { at: 0.65, tempo: 0.85, shiftTicks: 70, attacks: ['charge', 'pistons', 'sparks'] },
    { at: 0.3, tempo: 0.7, shiftTicks: 70, attacks: ['charge', 'pistons', 'sparks', 'march'] },
  ],
  attacks: {
    charge: atk({
      attack: blow({ id: 'engine_charge', startup: 40, active: 55, recovery: 50, hitbox: { x: 0, y: 0.1, w: 2.2, h: 2.2 }, knockback: { x: 9, y: 4 } }),
      handler: 'charge',
      params: { speed: 12, ticks: 55, wallStun: 90 },
      weight: [1, 3],
    }),
    pistons: atk({
      attack: blow({ id: 'engine_pistons', startup: 42, active: 20, recovery: 50, knockback: { x: 4, y: 7 } }),
      handler: 'eruptions',
      params: { fixed: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], alternate: 1, width: 2.2, height: 6.5 },
      weight: [2, 2],
      exposes: false,
    }),
    sparks: atk({
      attack: blow({ id: 'engine_sparks', startup: 40, active: 14, recovery: 56, damage: 1 }),
      handler: 'burst',
      params: { count: 3, speed: 10, minAngle: 20, maxAngle: 70, arc: 20 },
      shot: shot({ attackId: 'engine_spark' }),
      weight: [2, 1],
      exposes: false,
    }),
    march: atk({
      attack: blow({ id: 'engine_march', startup: 40, active: 1, recovery: 70, knockback: { x: 4, y: 7 } }),
      handler: 'march',
      params: { count: 8, step: 3, first: 3.4, delay: 6, columnTicks: 12, width: 2, height: 6 },
      weight: [1, 3],
    }),
  },
  view: { lookId: 'boss_engine' },
};

// ------------------------------------------------------------------------------------------------------------ Inkheart Sovereign
export const INKHEART_SOVEREIGN: BossDefinition = {
  id: 'boss_sovereign',
  nameKey: 'enemy.sovereign.name',
  health: 80,
  body: { halfWidth: 1.1, height: 3 },
  hurtboxes: [
    { x: -0.5, y: 1.2, w: 1, h: 1.2, multiplier: 1.6, part: 'core' },
    { x: -1.1, y: 0, w: 2.2, h: 3, multiplier: 1, part: 'body' },
  ],
  ...TIMES,
  farDistance: 8,
  repeatLimit: 2,
  phases: [
    { at: 1, tempo: 1, attacks: ['cut', 'rain', 'orbs'] },
    { at: 0.66, tempo: 0.85, shiftTicks: 80, summon: { def: VEIL_SHADE, count: 1 }, attacks: ['cut', 'rain', 'orbs', 'nova'] },
    { at: 0.33, tempo: 0.7, shiftTicks: 80, summon: { def: INK_WEAVER, count: 1 }, attacks: ['cut', 'rain', 'orbs', 'nova', 'march'] },
  ],
  attacks: {
    cut: atk({
      attack: blow({ id: 'sovereign_cut', startup: 28, active: 6, recovery: 54, hitbox: { x: 0.2, y: 0.1, w: 2.4, h: 2.4 }, knockback: { x: 8, y: 3 } }),
      handler: 'teleport',
      params: { gone: 28, appear: 22, behind: 2.6 },
      weight: [3, 2],
    }),
    rain: atk({
      attack: blow({ id: 'sovereign_rain', startup: 40, active: 16, recovery: 60, knockback: { x: 5, y: 7 } }),
      handler: 'eruptions',
      params: { offsets: [-4, 0, 4], random: 2, offsets3: [-6, -2, 2, 6], width: 1.8, height: 6.5, gap: 3.4 },
      weight: [2, 2],
    }),
    orbs: atk({
      attack: blow({ id: 'sovereign_orbs', startup: 34, active: 12, recovery: 60, damage: 1 }),
      handler: 'volley',
      params: { count: 5, speed: 9, spread: 50, arc: 0 },
      shot: shot({ attackId: 'sovereign_orb', size: { w: 0.8, h: 0.8 } }),
      weight: [2, 3],
    }),
    nova: atk({
      attack: blow({ id: 'sovereign_nova', startup: 44, active: 14, recovery: 70, damage: 1 }),
      handler: 'burst',
      params: { count: 5, speed: 10, minAngle: 8, maxAngle: 72, arc: 0 },
      shot: shot({ attackId: 'sovereign_nova', size: { w: 0.7, h: 0.7 } }),
      weight: [2, 2],
    }),
    march: atk({
      attack: blow({ id: 'sovereign_march', startup: 40, active: 1, recovery: 70, knockback: { x: 4, y: 7 } }),
      handler: 'march',
      params: { count: 8, step: 3, first: 3, delay: 6, columnTicks: 12, width: 1.8, height: 6 },
      weight: [1, 3],
    }),
  },
  view: { lookId: 'boss_sovereign' },
};

/** The guardians of the engine, in the order the hero meets them in the world. (The creatures they call are in `creatures.ts`.) */
export const ENGINE_BOSS_LIST: readonly BossDefinition[] = [ROOT_TYRANT, MIRE_MATRIARCH, CRYSTAL_COLOSSUS, BELL_WARDEN, FOUNDRY_ENGINE, INKHEART_SOVEREIGN];
export const ENGINE_BOSSES: Readonly<Record<string, BossDefinition>> = Object.fromEntries(ENGINE_BOSS_LIST.map((b) => [b.id, b]));

