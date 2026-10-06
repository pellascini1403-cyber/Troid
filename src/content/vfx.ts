import type { ArcVfx, FlashVfx, ParticleVfx, VfxBindings, VfxDefinition } from '@/presentation/vfx';

/**
 * The first effects (docs/GAME-SPEC-2D.md §3.5): the hero's energy is CYAN with a WHITE core, enemy energy is VIOLET,
 * enemy ink is BLACK. Colours are palette slots, never hex: the same definition serves the hero and the enemies, and the
 * warm accent (`accent`) is OFF by default (it falls back to cyan until it is tried on screen in Prompt 7).
 * All numbers are starting values, retuned by looking at them: metres, seconds, m/s.
 */

const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ the sword

const SLASH_VARIANTS: ArcVfx['variants'] = {
  // overhead → forward: a crescent that starts tilted up and sweeps down through the target
  slash_1: { rotation: [0.62, -0.28], width: 1.18, height: 1.25 },
  // the finisher rises: starts low, sweeps up
  slash_2: { rotation: [-0.7, 0.4], width: 1.26, height: 1.35 },
  air_slash: { rotation: [0.9, -0.32], width: 1.18, height: 1.25 },
  // a flat, fast thrust
  crouch_slash: { rotation: [0.08, -0.06], width: 1.22, height: 0.75 },
};

const slashArc: ArcVfx = {
  kind: 'arc',
  id: 'slash_arc',
  priority: 5,
  palette: 'energy',
  life: 0.17,
  alpha: [1, 0],
  scale: [0.9, 1.1],
  layers: [
    { role: 'core', scale: 1.18, alpha: 0.3 }, // soft halo
    { role: 'core', scale: 1, alpha: 0.95 },
    { role: 'hot', scale: 0.8, alpha: 1 }, // white-hot core
  ],
  variants: SLASH_VARIANTS,
  fallback: { rotation: [0.4, -0.2], width: 1.1, height: 1.1 },
};

/** The last hit of the chain: bigger, longer-lived and the ONE place the optional warm accent would appear. */
const slashArcFinisher: ArcVfx = { ...slashArc, id: 'slash_arc_finisher', priority: 6, palette: 'accent', life: 0.22 };

// ------------------------------------------------------------------------------------------------- impacts

const impactSparks: ParticleVfx = {
  kind: 'particles',
  id: 'impact_sparks',
  priority: 6,
  palette: 'energy',
  blend: 'add',
  shape: 'spark',
  count: [10, 14],
  speed: [3.5, 9.5],
  life: [0.16, 0.34],
  aim: 'along',
  spread: 2.4,
  size: [0.14, 0.26],
  sizeEnd: 0.2,
  gravity: -9,
  drag: 3.2,
  spin: [-9, 9],
  alpha: [1, 0],
  colors: ['hot', 'core', 'hot'],
  radius: 0.08,
};

const impactFlash: FlashVfx = {
  kind: 'flash', id: 'impact_flash', priority: 7, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.11, size: [0.7, 1.7], alpha: [1, 0],
};

const impactRing: FlashVfx = {
  kind: 'flash', id: 'impact_ring', priority: 6, palette: 'energy', shape: 'ring', role: 'core',
  life: 0.17, size: [0.3, 1.5], alpha: [0.85, 0],
};

// ------------------------------------------------------------------------------------------- damage taken

const hurtShards: ParticleVfx = {
  kind: 'particles',
  id: 'hurt_shards',
  priority: 8,
  palette: 'energy',
  blend: 'add',
  shape: 'shard',
  count: [11, 15],
  speed: [3, 8.5],
  life: [0.28, 0.5],
  aim: 'any',
  spread: TAU,
  size: [0.3, 0.55],
  sizeEnd: 0.25,
  gravity: -15,
  drag: 1.8,
  alpha: [1, 0],
  colors: ['hot', 'core', 'hot', 'deep'],
  align: true,
  radius: 0.25,
};

const hurtFlash: FlashVfx = {
  kind: 'flash', id: 'hurt_flash', priority: 8, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.16, size: [1.0, 2.3], alpha: [0.95, 0],
};

// ------------------------------------------------------------------------------------------------- the dash

const dashBurst: ParticleVfx = {
  kind: 'particles',
  id: 'dash_burst',
  priority: 5,
  palette: 'energy',
  blend: 'add',
  shape: 'spark',
  count: [8, 11],
  speed: [4, 11],
  life: [0.14, 0.3],
  aim: 'back',
  spread: 1.3,
  size: [0.12, 0.2],
  sizeEnd: 0.2,
  gravity: 0,
  drag: 6,
  alpha: [1, 0],
  colors: ['core', 'hot'],
  radius: 0.15,
};

const dashFlash: FlashVfx = {
  kind: 'flash', id: 'dash_flash', priority: 5, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.12, size: [0.6, 1.5], alpha: [0.9, 0],
};

/** Dust the dash kicks up off the floor (normal blend: it is grey smoke, not light). */
const dashDust: ParticleVfx = {
  kind: 'particles',
  id: 'dash_dust',
  priority: 3,
  palette: 'neutral',
  blend: 'normal',
  shape: 'dust',
  count: [5, 7],
  speed: [0.8, 2.6],
  life: [0.35, 0.6],
  aim: 'back',
  spread: 1.5,
  size: [0.3, 0.55],
  sizeEnd: 1.9,
  gravity: 0.6,
  drag: 2.6,
  alpha: [0.5, 0],
  colors: ['core'],
  radius: 0.2,
};

/** One puff of the dash trail; the director repeats it every `spacing` metres along the dash path. */
const dashTrail: FlashVfx = {
  kind: 'flash', id: 'dash_trail', priority: 4, palette: 'energy', shape: 'streak', role: 'core',
  life: 0.24, size: [1.5, 0.5], alpha: [0.75, 0], aspect: 4, spacing: 0.45,
};

const dashTrailShards: ParticleVfx = {
  kind: 'particles',
  id: 'dash_trail_shards',
  priority: 3,
  palette: 'energy',
  blend: 'add',
  shape: 'shard',
  count: [1, 2],
  speed: [0.4, 2.2],
  life: [0.25, 0.45],
  aim: 'any',
  spread: TAU,
  size: [0.2, 0.34],
  sizeEnd: 0.2,
  gravity: 0,
  drag: 2.5,
  alpha: [0.9, 0],
  colors: ['hot', 'core'],
  align: true,
  radius: 0.35,
};

// ----------------------------------------------------------------------------------------------- deaths

/** Enemy death: black ink with a violet undertone splashes up and out; violet motes float away (docs §3.4). */
const deathInk: ParticleVfx = {
  kind: 'particles',
  id: 'death_ink',
  priority: 9,
  palette: 'enemy',
  blend: 'normal',
  shape: 'ink',
  count: [14, 20],
  speed: [2.2, 7.5],
  life: [0.5, 0.95],
  aim: 'up',
  spread: 2.7,
  size: [0.2, 0.42],
  sizeEnd: 0.55,
  gravity: -17,
  drag: 1.2,
  alpha: [0.95, 0],
  colors: ['ink', 'ink', 'deep'],
  radius: 0.3,
};

const deathMotes: ParticleVfx = {
  kind: 'particles',
  id: 'death_motes',
  priority: 8,
  palette: 'enemy',
  blend: 'add',
  shape: 'glow',
  count: [8, 12],
  speed: [0.8, 3],
  life: [0.6, 1.1],
  aim: 'up',
  spread: 3,
  size: [0.25, 0.5],
  sizeEnd: 0,
  gravity: 1.6,
  drag: 1.5,
  alpha: [0.9, 0],
  colors: ['core', 'hot'],
  radius: 0.35,
};

const deathFlash: FlashVfx = {
  kind: 'flash', id: 'death_flash', priority: 9, palette: 'enemy', shape: 'glow', role: 'hot',
  life: 0.2, size: [0.8, 2.2], alpha: [0.95, 0],
};

// ------------------------------------------------------------------------------------------ the warning

/**
 * The wind-up of an enemy lunge (docs/GAME-SPEC-2D.md §15.1: 24 ticks = 0.4 s): a violet ring CLOSES in on the creature —
 * a clock the eye reads without text, brightest the instant before the blow — while violet ink motes rise off it. The
 * creature's own aura, white-hot eyes and squash are drawn by its view; these are the cues of the light layer.
 */
const telegraphRing: FlashVfx = {
  kind: 'flash', id: 'telegraph_ring', priority: 8, palette: 'enemy', shape: 'ring', role: 'hot',
  life: 0.4, size: [3.8, 1.1], alpha: [0.05, 0.95],
};

const telegraphMotes: ParticleVfx = {
  kind: 'particles',
  id: 'telegraph_motes',
  priority: 7,
  palette: 'enemy',
  blend: 'add',
  shape: 'glow',
  count: [8, 12],
  speed: [0.5, 1.5],
  life: [0.28, 0.4],
  aim: 'up',
  spread: 3.4,
  size: [0.14, 0.26],
  sizeEnd: 0.3,
  gravity: 3.2,
  drag: 2,
  alpha: [0.9, 0],
  colors: ['core', 'hot', 'core'],
  radius: 0.8,
};

/** The hero's energy disperses (docs §9.2: "dispersión de energía"): cyan and white motes rise slowly. */
const energyScatter: ParticleVfx = {
  kind: 'particles',
  id: 'energy_scatter',
  priority: 10,
  palette: 'energy',
  blend: 'add',
  shape: 'glow',
  count: [22, 30],
  speed: [1, 4.2],
  life: [0.9, 1.6],
  aim: 'up',
  spread: 3.6,
  size: [0.2, 0.42],
  sizeEnd: 0.1,
  gravity: 2.6,
  drag: 1.4,
  alpha: [0.95, 0],
  colors: ['core', 'hot', 'core', 'deep'],
  radius: 0.5,
};

// ------------------------------------------------------------------------------------- the Spirit Bolt

/**
 * The Spirit Bolt (docs/GAME-SPEC-2D.md §10.1: "arco/estela cian con núcleo blanco"): a flash and a few sparks where it leaves
 * the hero, a bigger cyan burst with a white core where it lands, and a soft puff where it fizzles out. The bolt itself, with
 * its tail, is drawn by its view.
 */
const boltMuzzleFlash: FlashVfx = {
  kind: 'flash', id: 'bolt_muzzle_flash', priority: 6, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.13, size: [0.5, 1.5], alpha: [1, 0],
};

const boltMuzzleSparks: ParticleVfx = {
  kind: 'particles',
  id: 'bolt_muzzle_sparks',
  priority: 5,
  palette: 'energy',
  blend: 'add',
  shape: 'spark',
  count: [6, 9],
  speed: [3, 9],
  life: [0.1, 0.26],
  aim: 'along',
  spread: 0.9,
  size: [0.1, 0.18],
  sizeEnd: 0.2,
  gravity: 0,
  drag: 5,
  alpha: [1, 0],
  colors: ['hot', 'core'],
  radius: 0.1,
};

const boltImpactBurst: ParticleVfx = {
  kind: 'particles',
  id: 'bolt_impact_burst',
  priority: 7,
  palette: 'energy',
  blend: 'add',
  shape: 'spark',
  count: [14, 18],
  speed: [3.5, 10.5],
  life: [0.2, 0.42],
  aim: 'any',
  spread: TAU,
  size: [0.14, 0.28],
  sizeEnd: 0.2,
  gravity: -4,
  drag: 3,
  spin: [-8, 8],
  alpha: [1, 0],
  colors: ['hot', 'core', 'hot', 'deep'],
  radius: 0.1,
};

const boltImpactFlash: FlashVfx = {
  kind: 'flash', id: 'bolt_impact_flash', priority: 7, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.15, size: [0.9, 2.3], alpha: [1, 0],
};

const boltImpactRing: FlashVfx = {
  kind: 'flash', id: 'bolt_impact_ring', priority: 6, palette: 'energy', shape: 'ring', role: 'core',
  life: 0.22, size: [0.4, 2.1], alpha: [0.9, 0],
};

const boltFizzle: ParticleVfx = {
  kind: 'particles',
  id: 'bolt_fizzle',
  priority: 4,
  palette: 'energy',
  blend: 'add',
  shape: 'glow',
  count: [5, 8],
  speed: [0.6, 2.2],
  life: [0.25, 0.45],
  aim: 'any',
  spread: TAU,
  size: [0.2, 0.36],
  sizeEnd: 0.1,
  gravity: 1.2,
  drag: 2.4,
  alpha: [0.9, 0],
  colors: ['core', 'hot'],
  radius: 0.15,
};

// --------------------------------------------------------------------------------------- the energy bottle

/**
 * Drinking a bottle (GAME-SPEC-2D §11): while the 0.4 s channel runs a ring of light closes in on the hero, and when the life comes
 * back a soft flash and a few motes rise from him. Light only (additive, the hero's cyan / white): nothing here is a hit.
 */
const drinkGather: FlashVfx = {
  kind: 'flash', id: 'drink_gather', priority: 4, palette: 'energy', shape: 'ring', role: 'hot',
  life: 0.4, size: [2.2, 0.7], alpha: [0.7, 0.2],
};

const drinkHealMotes: ParticleVfx = {
  kind: 'particles',
  id: 'drink_heal_motes',
  priority: 5,
  palette: 'energy',
  blend: 'add',
  shape: 'glow',
  count: [10, 14],
  speed: [1.2, 3.2],
  life: [0.35, 0.7],
  aim: 'up',
  spread: 1.3,
  size: [0.14, 0.28],
  sizeEnd: 0.2,
  gravity: 0.5,
  drag: 1.6,
  alpha: [0.95, 0],
  colors: ['hot', 'core', 'hot'],
  radius: 0.45,
};

const drinkHealFlash: FlashVfx = {
  kind: 'flash', id: 'drink_heal_flash', priority: 5, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.22, size: [0.8, 2.4], alpha: [0.9, 0],
};

// ------------------------------------------------------------------------------------------ taking a pickup

/**
 * Taking something up (S27: the fourth bottle; S28: the Spirit Bolt card): the light of the object opens as a ring and a flash and a
 * handful of motes rise from where it floated. The hero's cyan / white, additive: nothing here is a hit.
 */
const pickupMotes: ParticleVfx = {
  kind: 'particles',
  id: 'pickup_motes',
  priority: 5,
  palette: 'energy',
  blend: 'add',
  shape: 'glow',
  count: [14, 18],
  speed: [1.4, 3.6],
  life: [0.45, 0.9],
  aim: 'up',
  spread: 1.6,
  size: [0.14, 0.3],
  sizeEnd: 0.2,
  gravity: 0.4,
  drag: 1.5,
  alpha: [0.95, 0],
  colors: ['hot', 'core', 'hot'],
  radius: 0.3,
};

const pickupRing: FlashVfx = {
  kind: 'flash', id: 'pickup_ring', priority: 5, palette: 'energy', shape: 'ring', role: 'core',
  life: 0.3, size: [0.3, 2.2], alpha: [0.9, 0],
};

const pickupFlash: FlashVfx = {
  kind: 'flash', id: 'pickup_flash', priority: 5, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.22, size: [0.8, 2.2], alpha: [0.9, 0],
};

// ------------------------------------------------------------------------------------------- a seal turns a blow away

/**
 * A blow that a seal turns away (S28): a violet ring snaps open on the sigil and a few sparks spring back out of it — the ward is of the
 * enemy's colour (GAME-SPEC-2D §3.4) and the blow did nothing. Short and dry: it is a refusal, not a hit.
 */
const sealRejectRing: FlashVfx = {
  kind: 'flash', id: 'seal_reject_ring', priority: 6, palette: 'enemy', shape: 'ring', role: 'hot',
  life: 0.28, size: [0.5, 2.3], alpha: [0.95, 0],
};

const sealRejectSparks: ParticleVfx = {
  kind: 'particles',
  id: 'seal_reject_sparks',
  priority: 5,
  palette: 'enemy',
  blend: 'add',
  shape: 'glow',
  count: [7, 10],
  speed: [2, 4.5],
  life: [0.18, 0.38],
  aim: 'back',
  spread: 1.6,
  size: [0.12, 0.22],
  sizeEnd: 0.05,
  gravity: 4,
  drag: 2.6,
  alpha: [0.95, 0],
  colors: ['hot', 'core', 'hot'],
  radius: 0.15,
};

export const VFX: Readonly<Record<string, VfxDefinition>> = Object.fromEntries(
  [
    slashArc, slashArcFinisher,
    impactSparks, impactFlash, impactRing,
    hurtShards, hurtFlash,
    dashBurst, dashFlash, dashDust, dashTrail, dashTrailShards,
    deathInk, deathMotes, deathFlash, energyScatter,
    telegraphRing, telegraphMotes,
    boltMuzzleFlash, boltMuzzleSparks, boltImpactBurst, boltImpactFlash, boltImpactRing, boltFizzle,
    drinkGather, drinkHealMotes, drinkHealFlash,
    pickupMotes, pickupRing, pickupFlash,
    sealRejectRing, sealRejectSparks,
  ].map((d) => [d.id, d]),
);

/** Trigger → effects, as data. Which event raises which trigger is the director's job; WHAT it looks like is only here. */
export const VFX_BINDINGS: VfxBindings = {
  slash: ['slash_arc'],
  slashFinisher: ['slash_arc_finisher'],
  hitLanded: ['impact_sparks', 'impact_flash', 'impact_ring'],
  playerHurt: ['hurt_shards', 'hurt_flash'],
  dashStart: ['dash_burst', 'dash_flash'],
  dashDust: ['dash_dust'],
  dashTrail: ['dash_trail', 'dash_trail_shards'],
  enemyDied: ['death_ink', 'death_motes', 'death_flash'],
  enemyTelegraph: ['telegraph_ring', 'telegraph_motes'],
  playerDied: ['energy_scatter'],
  boltCast: ['bolt_muzzle_flash', 'bolt_muzzle_sparks'],
  boltImpact: ['bolt_impact_burst', 'bolt_impact_flash', 'bolt_impact_ring'],
  boltEnd: ['bolt_fizzle'],
  drinkStart: ['drink_gather'],
  drinkHeal: ['drink_heal_motes', 'drink_heal_flash'],
  pickup: ['pickup_motes', 'pickup_ring', 'pickup_flash'],
  sealRejected: ['seal_reject_ring', 'seal_reject_sparks'],
};
