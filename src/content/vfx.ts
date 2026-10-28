import type { ArcVfx, FlashVfx, FlipbookVfx, ParticleVfx, VfxBindings, VfxDefinition } from '@/presentation/vfx';

/**
 * The first effects (docs/GAME-SPEC-2D.md §3.5): the hero's energy is CYAN with a WHITE core, enemy energy is VIOLET,
 * enemy ink is BLACK. Colours are palette slots, never hex: the same definition serves the hero and the enemies, and the
 * warm accent (`accent`) is OFF by default (it falls back to cyan until it is tried on screen in Prompt 7).
 * All numbers are starting values, retuned by looking at them: metres, seconds, m/s.
 *
 * Phase H (docs/PROMPT8-LOG.md, docs/ART-PIPELINE-2D.md §M.14) made the light a produced thing: the shapes the effects are made of can be PAINTED (the ten of `vfx-shapes`), and the big moments have a
 * SEQUENCE the art paints (`vfx-flipbooks`: the cut that sweeps, the blow that lands, the ink that bursts, the pillar of a place that awakens). A `flipbook` effect is not played when the art lacks its
 * sequence, and the effects bound beside it carry the moment without it — every trigger is whole either way, which the contract (`presentation/vfxContract`) keeps.
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
  // the cut the art paints, when it has it: its body in the cyan of the energy, its edge white-hot
  sequences: { core: 'slash_body', hot: 'slash_edge', scale: [1.35, 1.4], alpha: [1, 0.55] },
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

/** The blow that lands, as the art paints it: a flare with spikes along the way the blow went. */
const impactBurst: FlipbookVfx = {
  kind: 'flipbook', id: 'impact_burst', priority: 7, palette: 'energy', sequence: 'impact', blend: 'add', role: 'hot',
  life: 0.22, size: [1.5, 2.1], alpha: [1, 1], aim: 'dir',
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

/** The blow the hero takes, as the art paints it: the same flare, but in the hero's own cyan and thrown the way the blow pushes them. */
const hurtBurst: FlipbookVfx = {
  kind: 'flipbook', id: 'hurt_burst', priority: 8, palette: 'energy', sequence: 'impact', blend: 'add', role: 'core',
  life: 0.24, size: [1.6, 2.3], alpha: [1, 1], aim: 'dir',
};

// ------------------------------------------------------------------------------------------------- the lava

/** Embers thrown up out of the lava where the hero touched it: slow, rising, hot, and they cool to red on the way down (the hero's own hurt is the shards of their cyan). */
const lavaEmbers: ParticleVfx = {
  kind: 'particles',
  id: 'lava_embers',
  priority: 8,
  palette: 'ember',
  blend: 'add',
  shape: 'spark',
  count: [12, 17],
  speed: [2.5, 7.5],
  life: [0.45, 0.85],
  aim: 'up',
  spread: 1.7,
  size: [0.16, 0.36],
  sizeEnd: 0.1,
  gravity: -9,
  drag: 1.2,
  alpha: [1, 0],
  colors: ['hot', 'core', 'core', 'deep'],
  radius: 0.3,
};

/** Drops of lava that fall back heavy (normal blend: they are matter, not light). */
const lavaDrops: ParticleVfx = {
  kind: 'particles',
  id: 'lava_drops',
  priority: 6,
  palette: 'ember',
  blend: 'normal',
  shape: 'ink',
  count: [4, 7],
  speed: [2, 5.5],
  life: [0.4, 0.7],
  aim: 'up',
  spread: 1.3,
  size: [0.2, 0.34],
  sizeEnd: 0.12,
  gravity: -17,
  drag: 0.6,
  alpha: [1, 0.2],
  colors: ['core', 'deep', 'core'],
  radius: 0.25,
};

const lavaFlash: FlashVfx = {
  kind: 'flash', id: 'lava_flash', priority: 8, palette: 'ember', shape: 'glow', role: 'hot',
  life: 0.22, size: [1.4, 3.0], alpha: [1, 0],
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

/** Two marks of speed left behind where the dash began: chevrons pointing the way the hero went. */
const dashChevronNear: FlashVfx = {
  kind: 'flash', id: 'dash_chevron_near', priority: 4, palette: 'energy', shape: 'chevron', role: 'hot',
  life: 0.22, size: [1.0, 1.5], alpha: [0.9, 0], aspect: 4 / 3, offset: [-0.55, 0],
};

const dashChevronFar: FlashVfx = {
  kind: 'flash', id: 'dash_chevron_far', priority: 3, palette: 'energy', shape: 'chevron', role: 'core',
  life: 0.28, size: [0.8, 1.3], alpha: [0.6, 0], aspect: 4 / 3, offset: [-1.25, 0],
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

/** The ink of a creature that falls, as the art paints it: a splash of black ink and the rim of violet light on it. */
const deathSplash: FlipbookVfx = {
  kind: 'flipbook', id: 'death_splash', priority: 9, palette: 'enemy', sequence: 'ink_splash', blend: 'normal', role: 'ink',
  life: 0.55, size: [1.7, 2.5], alpha: [1, 1],
};

const deathGloss: FlipbookVfx = {
  kind: 'flipbook', id: 'death_gloss', priority: 9, palette: 'enemy', sequence: 'ink_splash_gloss', blend: 'add', role: 'hot',
  life: 0.55, size: [1.7, 2.5], alpha: [1, 1],
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

/** The sigil of the creature's wind-up, closing in as it turns: the same clock as the ring, in the enemy's own sign. */
const telegraphRune: FlashVfx = {
  kind: 'flash', id: 'telegraph_rune', priority: 7, palette: 'enemy', shape: 'rune', role: 'core',
  life: 0.4, size: [2.9, 0.9], alpha: [0.05, 0.8], turn: [1, 0],
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

/** The hero's light leaves them as a column that rises from their feet (the director raises it at their chest). */
const deathPillar: FlipbookVfx = {
  kind: 'flipbook', id: 'death_pillar', priority: 10, palette: 'energy', sequence: 'pillar', blend: 'add', role: 'hot',
  life: 1.3, size: [1.3, 1.9], alpha: [1, 1], offset: [0, -0.9], layer: 'back',
};

// ------------------------------------------------------------------------------------- the Spirit Bolt

/**
 * The Spirit Bolt (docs/GAME-SPEC-2D.md §10.1: "arco/estela cian con núcleo blanco"): a flash and a few sparks where it leaves
 * the hero, a bigger cyan burst with a white core where it lands, and a soft puff where it fizzles out. The bolt itself, with
 * its tail, is drawn by its view.
 */
/**
 * The power GATHERS in the hand before the bolt leaves (the six ticks of its preparation): motes fly in from around the muzzle, a ring closes on it and a light swells there. It is the accumulation the
 * eye reads as "something is coming" — the release is the bolt's own `boltCast`, a tenth of a second later.
 */
const boltChargeRing: FlashVfx = {
  kind: 'flash', id: 'bolt_charge_ring', priority: 6, palette: 'energy', shape: 'ring', role: 'hot',
  life: 0.14, size: [2.5, 0.5], alpha: [0.25, 1],
};

const boltChargeGlow: FlashVfx = {
  kind: 'flash', id: 'bolt_charge_glow', priority: 6, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.14, size: [0.3, 1.5], alpha: [0.45, 1],
};

const boltChargeMotes: ParticleVfx = {
  kind: 'particles',
  id: 'bolt_charge_motes',
  priority: 5,
  palette: 'energy',
  blend: 'add',
  shape: 'spark',
  count: [5, 7],
  speed: [5.5, 7.5],
  life: [0.1, 0.14],
  aim: 'any',
  spread: TAU,
  size: [0.2, 0.34],
  sizeEnd: 0.4,
  gravity: 0,
  drag: 0,
  alpha: [0.3, 1],
  colors: ['hot', 'core'],
  radius: 0.8,
  inward: true,
};

const boltMuzzleFlash: FlashVfx = {
  kind: 'flash', id: 'bolt_muzzle_flash', priority: 6, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.14, size: [0.8, 2.2], alpha: [1, 0],
};

/** A ring that opens at the muzzle, a streak of light thrown forward and the hand's own glow, still lit as the bolt goes: the launch. */
const boltMuzzleRing: FlashVfx = {
  kind: 'flash', id: 'bolt_muzzle_ring', priority: 6, palette: 'energy', shape: 'ring', role: 'hot',
  life: 0.18, size: [0.6, 2.6], alpha: [1, 0],
};

const boltMuzzleStreak: FlashVfx = {
  kind: 'flash', id: 'bolt_muzzle_streak', priority: 6, palette: 'energy', shape: 'streak', role: 'hot',
  life: 0.16, size: [1.6, 4.4], alpha: [1, 0], aspect: 4, offset: [0.9, 0],
};

const boltHandGlow: FlashVfx = {
  kind: 'flash', id: 'bolt_hand_glow', priority: 5, palette: 'energy', shape: 'glow', role: 'core',
  life: 0.4, size: [0.9, 0.5], alpha: [0.7, 0], offset: [-0.3, 0],
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

/** Where the bolt lands, as the art paints it: a flare with rays and the arcs of a shock that goes out, and a glow that stays a moment after the rest is gone — the afterglow. */
const boltImpactSeq: FlipbookVfx = {
  kind: 'flipbook', id: 'bolt_impact_seq', priority: 7, palette: 'energy', sequence: 'bolt_impact', blend: 'add', role: 'core',
  life: 0.34, size: [2.6, 3.2], alpha: [1, 1], aim: 'facing',
};

const boltAfterglow: FlashVfx = {
  kind: 'flash', id: 'bolt_afterglow', priority: 5, palette: 'energy', shape: 'glow', role: 'core',
  life: 0.8, size: [1.6, 0.8], alpha: [0.5, 0],
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

/** The flame of light that rises round the hero as the life comes back, standing on their feet (the director raises it at their chest). */
const drinkHealAura: FlipbookVfx = {
  kind: 'flipbook', id: 'drink_heal_aura', priority: 5, palette: 'energy', sequence: 'aura', blend: 'add', role: 'core',
  life: 0.7, size: [1.5, 1.8], alpha: [1, 1], offset: [0, -0.9], layer: 'back',
};

// ------------------------------------------------------------------------------------------ resting at a shrine

/**
 * A place that awakens (the shrine takes the hero in: it is where they come back now): a pillar of light stands on it, a rune opens behind the hero, a ring spreads on the floor and a flame of light rises round
 * them. The hero's cyan and white, additive: nothing here is a hit. (The bottle's own motes are the shrine's too: the same warmth of being restored.)
 */
const checkpointPillar: FlipbookVfx = {
  kind: 'flipbook', id: 'checkpoint_pillar', priority: 6, palette: 'energy', sequence: 'pillar', blend: 'add', role: 'hot',
  life: 1.3, size: [1.5, 2], alpha: [1, 1], layer: 'back',
};

const checkpointAura: FlipbookVfx = {
  kind: 'flipbook', id: 'checkpoint_aura', priority: 5, palette: 'energy', sequence: 'aura', blend: 'add', role: 'core',
  life: 0.9, size: [1.7, 2.1], alpha: [1, 1], layer: 'back',
};

const checkpointRune: FlashVfx = {
  kind: 'flash', id: 'checkpoint_rune', priority: 6, palette: 'energy', shape: 'rune', role: 'core',
  life: 1.1, size: [1.1, 2.9], alpha: [0.9, 0], turn: [0, 1.3], offset: [0, 0.95], layer: 'back',
};

const checkpointRing: FlashVfx = {
  kind: 'flash', id: 'checkpoint_ring', priority: 5, palette: 'energy', shape: 'ring', role: 'hot',
  life: 0.7, size: [0.6, 3.6], alpha: [0.8, 0], offset: [0, 0.1],
};

const checkpointMotes: ParticleVfx = {
  kind: 'particles',
  id: 'checkpoint_motes',
  priority: 5,
  palette: 'energy',
  blend: 'add',
  shape: 'glow',
  count: [14, 20],
  speed: [1.2, 3.4],
  life: [0.7, 1.4],
  aim: 'up',
  spread: 1.5,
  size: [0.14, 0.3],
  sizeEnd: 0.1,
  gravity: 0.9,
  drag: 1.3,
  alpha: [0.95, 0],
  colors: ['hot', 'core', 'hot'],
  radius: 0.5,
};

// ------------------------------------------------------------------------------------------ a power gained

/**
 * A power gained (the Spirit Bolt, the Air Dash): a great rune opens behind the hero and turns while a pillar of light stands where they do, a ring goes out and a flash opens — the biggest moment of the hero's
 * light, and the only one that takes the whole of a trigger's budget. Cyan and white.
 */
const abilityRune: FlashVfx = {
  kind: 'flash', id: 'ability_rune', priority: 8, palette: 'energy', shape: 'rune', role: 'hot',
  life: 1.5, size: [1.3, 3.8], alpha: [1, 0], turn: [0.3, -1.6], offset: [0, 1], layer: 'back',
};

const abilityPillar: FlipbookVfx = {
  kind: 'flipbook', id: 'ability_pillar', priority: 8, palette: 'energy', sequence: 'pillar', blend: 'add', role: 'core',
  life: 1.3, size: [1.2, 1.7], alpha: [1, 1], layer: 'back',
};

const abilityRing: FlashVfx = {
  kind: 'flash', id: 'ability_ring', priority: 7, palette: 'energy', shape: 'ring', role: 'hot',
  life: 0.85, size: [0.6, 4.6], alpha: [0.9, 0], offset: [0, 0.9],
};

const abilityFlash: FlashVfx = {
  kind: 'flash', id: 'ability_flash', priority: 8, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.2, size: [0.8, 2.4], alpha: [0.6, 0], offset: [0, 0.9],
};

const abilityMotes: ParticleVfx = {
  kind: 'particles',
  id: 'ability_motes',
  priority: 7,
  palette: 'energy',
  blend: 'add',
  shape: 'spark',
  count: [14, 20],
  speed: [1.4, 4.2],
  life: [0.8, 1.5],
  aim: 'up',
  spread: 2.2,
  size: [0.14, 0.3],
  sizeEnd: 0.1,
  gravity: 0.7,
  drag: 1.2,
  spin: [-3, 3],
  alpha: [0.95, 0],
  colors: ['hot', 'core', 'hot'],
  radius: 0.6,
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

const pickupRune: FlashVfx = {
  kind: 'flash', id: 'pickup_rune', priority: 5, palette: 'energy', shape: 'rune', role: 'core',
  life: 0.55, size: [0.5, 1.9], alpha: [0.9, 0], turn: [0, 0.9],
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

/**
 * A ward that breaks (the Spirit Bolt is the one blow it accepts): the light of what broke it flashes white-cyan, a violet ring goes out from the sigil, the ward bursts into ink with the rim of violet
 * light on it and its shards fly. It is the end of what held the way: bigger than a creature's fall, and nothing like it (a creature's ink falls; the ward's is thrown).
 */
const sealBreakFlash: FlashVfx = {
  kind: 'flash', id: 'seal_break_flash', priority: 8, palette: 'energy', shape: 'glow', role: 'hot',
  life: 0.22, size: [1.4, 4.4], alpha: [1, 0],
};

const sealBreakRing: FlashVfx = {
  kind: 'flash', id: 'seal_break_ring', priority: 8, palette: 'enemy', shape: 'ring', role: 'hot',
  life: 0.5, size: [0.9, 5.2], alpha: [0.95, 0],
};

const sealBreakSplash: FlipbookVfx = {
  kind: 'flipbook', id: 'seal_break_splash', priority: 9, palette: 'enemy', sequence: 'ink_splash', blend: 'normal', role: 'ink',
  life: 0.65, size: [2.8, 4.2], alpha: [1, 1],
};

const sealBreakGloss: FlipbookVfx = {
  kind: 'flipbook', id: 'seal_break_gloss', priority: 9, palette: 'enemy', sequence: 'ink_splash_gloss', blend: 'add', role: 'hot',
  life: 0.65, size: [2.8, 4.2], alpha: [1, 1],
};

const sealBreakShards: ParticleVfx = {
  kind: 'particles',
  id: 'seal_break_shards',
  priority: 8,
  palette: 'enemy',
  blend: 'add',
  shape: 'shard',
  count: [14, 18],
  speed: [3, 9],
  life: [0.4, 0.85],
  aim: 'any',
  spread: TAU,
  size: [0.3, 0.55],
  sizeEnd: 0.2,
  gravity: -8,
  drag: 1.6,
  alpha: [1, 0],
  colors: ['hot', 'core', 'hot'],
  align: true,
  radius: 0.9,
};

// ------------------------------------------------------------------------------------------------------ the boss

/**
 * The Ink Warden's moments (S29), in the enemy's violet: it WAKES (a ring that sweeps out and a swell of motes rising from the crest), its strikes
 * ERUPT (a narrow column of ink and a flash where each lands), it ENRAGES (another ring) and it FALLS (a great ring, and the ink burst of any death
 * that the `enemyDied` effects already play). Data, raised by the director from the boss's events; the budget and the governor apply as to any effect.
 */
const bossWakeRing: FlashVfx = {
  kind: 'flash', id: 'boss_wake_ring', priority: 7, palette: 'enemy', shape: 'ring', role: 'hot',
  life: 0.7, size: [1.2, 9], alpha: [0.9, 0],
};

/** The sign of the guardian opens in the air above its crest as it wakes (and again when it burns hotter): a great rune, turning. */
const bossWakeRune: FlashVfx = {
  kind: 'flash', id: 'boss_wake_rune', priority: 7, palette: 'enemy', shape: 'rune', role: 'core',
  life: 0.9, size: [1.6, 6.5], alpha: [0.9, 0], turn: [0, 1.2],
};

const bossWakeMotes: ParticleVfx = {
  kind: 'particles',
  id: 'boss_wake_motes',
  priority: 6,
  palette: 'enemy',
  blend: 'add',
  shape: 'glow',
  count: [22, 28],
  speed: [2, 6],
  life: [0.6, 1.1],
  aim: 'up',
  spread: 3,
  size: [0.16, 0.34],
  sizeEnd: 0.1,
  gravity: 0.8,
  drag: 1.2,
  alpha: [0.95, 0],
  colors: ['hot', 'core', 'hot', 'deep'],
  radius: 0.6,
};

const bossStrikeBurst: ParticleVfx = {
  kind: 'particles',
  id: 'boss_strike_burst',
  priority: 7,
  palette: 'enemy',
  blend: 'add',
  shape: 'glow',
  count: [14, 18],
  speed: [4, 9],
  life: [0.25, 0.5],
  aim: 'up',
  spread: 0.5,
  size: [0.2, 0.4],
  sizeEnd: 0.12,
  gravity: 6,
  drag: 1.4,
  alpha: [1, 0],
  colors: ['hot', 'core', 'core', 'deep'],
  radius: 0.5,
};

const bossStrikeFlash: FlashVfx = {
  kind: 'flash', id: 'boss_strike_flash', priority: 7, palette: 'enemy', shape: 'glow', role: 'hot',
  life: 0.16, size: [1, 2.8], alpha: [0.95, 0],
};

/** The ink of the rain erupts where each mark was: a column of black ink that rises from the floor and falls back, and the violet light along its edge. It stands on the floor (the director raises it 0.2 m). */
const bossStrikeColumn: FlipbookVfx = {
  kind: 'flipbook', id: 'boss_strike_column', priority: 7, palette: 'enemy', sequence: 'ink_column', blend: 'normal', role: 'ink',
  life: 0.6, size: [1.6, 1.7], alpha: [1, 1], offset: [0, -0.2],
};

const bossStrikeColumnGlow: FlipbookVfx = {
  kind: 'flipbook', id: 'boss_strike_column_glow', priority: 7, palette: 'enemy', sequence: 'ink_column_glow', blend: 'add', role: 'hot',
  life: 0.6, size: [1.6, 1.7], alpha: [1, 1], offset: [0, -0.2],
};

const bossPhaseRing: FlashVfx = {
  kind: 'flash', id: 'boss_phase_ring', priority: 7, palette: 'enemy', shape: 'ring', role: 'core',
  life: 0.55, size: [1, 7], alpha: [0.9, 0],
};

const bossDefeatRing: FlashVfx = {
  kind: 'flash', id: 'boss_defeat_ring', priority: 8, palette: 'enemy', shape: 'ring', role: 'hot',
  life: 1, size: [1, 12], alpha: [0.9, 0],
};

/** The guardian comes apart: a great burst of black ink with the violet rim of light on it, at the height of its heart. */
const bossDefeatSplash: FlipbookVfx = {
  kind: 'flipbook', id: 'boss_defeat_splash', priority: 9, palette: 'enemy', sequence: 'ink_splash', blend: 'normal', role: 'ink',
  life: 1, size: [4.5, 8], alpha: [1, 1],
};

const bossDefeatGloss: FlipbookVfx = {
  kind: 'flipbook', id: 'boss_defeat_gloss', priority: 9, palette: 'enemy', sequence: 'ink_splash_gloss', blend: 'add', role: 'hot',
  life: 1, size: [4.5, 8], alpha: [1, 1],
};

// --------------------------------------------------------------------------------------------- the air of the hero

/**
 * The light that the hero carries when their magic is high (not an event: the director lets a mote go now and then, as often as the magic is full): a spark of cyan that rises and goes out. It is the "power feel" of
 * the Spirit Bolt before it is cast — the hero with the bolt ready is not the hero who is spent. At most a few alive at once (`AMBIENT_CONTRACT` keeps it).
 */
export const ambientMote: ParticleVfx = {
  kind: 'particles',
  id: 'ambient_mote',
  priority: 1,
  palette: 'energy',
  blend: 'add',
  shape: 'glow',
  count: [1, 1],
  speed: [0.15, 0.5],
  life: [1.2, 2],
  aim: 'up',
  spread: 2.4,
  size: [0.2, 0.36],
  sizeEnd: 0.15,
  gravity: 0.25,
  drag: 0.8,
  alpha: [0.95, 0],
  colors: ['core', 'hot', 'core'],
  radius: 0.65,
};

export const VFX: Readonly<Record<string, VfxDefinition>> = Object.fromEntries(
  [
    slashArc, slashArcFinisher,
    impactSparks, impactFlash, impactRing, impactBurst,
    hurtShards, hurtFlash, hurtBurst,
    lavaEmbers, lavaDrops, lavaFlash,
    dashBurst, dashFlash, dashChevronNear, dashChevronFar, dashDust, dashTrail, dashTrailShards,
    deathInk, deathMotes, deathFlash, deathSplash, deathGloss, energyScatter, deathPillar,
    telegraphRing, telegraphRune, telegraphMotes,
    boltChargeRing, boltChargeGlow, boltChargeMotes,
    boltMuzzleFlash, boltMuzzleRing, boltMuzzleStreak, boltHandGlow, boltMuzzleSparks,
    boltImpactBurst, boltImpactFlash, boltImpactRing, boltImpactSeq, boltAfterglow, boltFizzle,
    drinkGather, drinkHealMotes, drinkHealFlash, drinkHealAura,
    checkpointPillar, checkpointAura, checkpointRune, checkpointRing, checkpointMotes,
    abilityRune, abilityPillar, abilityRing, abilityFlash, abilityMotes,
    pickupMotes, pickupRing, pickupFlash, pickupRune,
    sealRejectRing, sealRejectSparks,
    sealBreakFlash, sealBreakRing, sealBreakSplash, sealBreakGloss, sealBreakShards,
    bossWakeRing, bossWakeRune, bossWakeMotes, bossStrikeBurst, bossStrikeFlash, bossStrikeColumn, bossStrikeColumnGlow,
    bossPhaseRing, bossDefeatRing, bossDefeatSplash, bossDefeatGloss,
    ambientMote,
  ].map((d) => [d.id, d]),
);

/** Trigger → effects, as data. Which event raises which trigger is the director's job; WHAT it looks like is only here. */
export const VFX_BINDINGS: VfxBindings = {
  slash: ['slash_arc'],
  slashFinisher: ['slash_arc_finisher'],
  hitLanded: ['impact_sparks', 'impact_flash', 'impact_ring', 'impact_burst'],
  playerHurt: ['hurt_shards', 'hurt_flash', 'hurt_burst'],
  lavaBurn: ['lava_embers', 'lava_drops', 'lava_flash'],
  dashStart: ['dash_burst', 'dash_flash', 'dash_chevron_near', 'dash_chevron_far'],
  dashDust: ['dash_dust'],
  dashTrail: ['dash_trail', 'dash_trail_shards'],
  enemyDied: ['death_ink', 'death_motes', 'death_flash', 'death_splash', 'death_gloss'],
  enemyTelegraph: ['telegraph_ring', 'telegraph_rune', 'telegraph_motes'],
  playerDied: ['energy_scatter', 'death_pillar'],
  boltCharge: ['bolt_charge_ring', 'bolt_charge_glow', 'bolt_charge_motes'],
  boltCast: ['bolt_muzzle_flash', 'bolt_muzzle_ring', 'bolt_muzzle_streak', 'bolt_hand_glow', 'bolt_muzzle_sparks'],
  boltImpact: ['bolt_impact_burst', 'bolt_impact_flash', 'bolt_impact_ring', 'bolt_impact_seq', 'bolt_afterglow'],
  boltEnd: ['bolt_fizzle'],
  drinkStart: ['drink_gather'],
  drinkHeal: ['drink_heal_motes', 'drink_heal_flash', 'drink_heal_aura'],
  checkpoint: ['checkpoint_pillar', 'checkpoint_aura', 'checkpoint_rune', 'checkpoint_ring', 'checkpoint_motes'],
  abilityGained: ['ability_rune', 'ability_pillar', 'ability_ring', 'ability_flash', 'ability_motes'],
  pickup: ['pickup_motes', 'pickup_ring', 'pickup_flash', 'pickup_rune'],
  sealRejected: ['seal_reject_ring', 'seal_reject_sparks'],
  sealBroken: ['seal_break_flash', 'seal_break_ring', 'seal_break_splash', 'seal_break_gloss', 'seal_break_shards'],
  bossWake: ['boss_wake_ring', 'boss_wake_rune', 'boss_wake_motes'],
  bossStrike: ['boss_strike_burst', 'boss_strike_flash', 'boss_strike_column', 'boss_strike_column_glow'],
  bossPhase: ['boss_phase_ring', 'boss_wake_rune', 'boss_wake_motes'],
  bossDefeated: ['boss_defeat_ring', 'boss_defeat_splash', 'boss_defeat_gloss', 'death_motes'],
};

/** How the director lets the hero's light go: the effect, and the seconds between motes at full magic (at lower magic the level squared stretches it). */
export const AMBIENT = { effect: ambientMote.id, every: 0.35 } as const;
