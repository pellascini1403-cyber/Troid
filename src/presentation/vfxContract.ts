import type { PaletteSlot } from './palette';
import { PARTICLE_BUDGET, SPRITE_FX_BUDGET, type VfxBindings, type VfxDefinition, type VfxTrigger } from './vfx';
import { VFX_SEQUENCE_NAMES } from './vfxArt';

/**
 * THE VISUAL CONTRACT OF EVERY EFFECT (docs/ART-PIPELINE-2D.md, part H). An effect has a LOOK (its shapes, its sizes, its colours) and everything else: WHEN it
 * is born (the simulation's event), WHERE (a point the event gives, plus an offset), HOW LONG it may live, HOW MUCH of the screen's budget it may take and in WHICH
 * colours. The look is what a final art replaces; the rest is this contract, and `checkVfxContract` is the one function that says whether a set of effect
 * definitions — the ones the game ships, or the ones a replacement brings — keeps it. PURE: no Pixi, no clocks.
 *
 * The caps below are CEILINGS for a replacement, not the values in use (the game's own effects sit under them with room to spare): retuning inside a ceiling
 * needs nothing; going over one is a decision somebody takes on purpose, with the performance in front of them.
 */
export type VfxFamily = 'slash' | 'impact' | 'damage' | 'dash' | 'death' | 'telegraph' | 'bolt' | 'bottle' | 'rest' | 'ability' | 'interaction' | 'seal' | 'boss';

export interface VfxCue {
  /** What a person calls it. */
  family: VfxFamily;
  /** The simulation events (`GameEvents` keys) that raise it: WHEN an effect starts is the simulation's, never the art's. */
  events: readonly string[];
  /** Where it is born: metres ABOVE the point its event gives (the feet of the hero for the dash trail). It is the point an effect is authored around. */
  originY: number;
  /** The longest any effect of the trigger may live, seconds: a replacement may not outlast it (a slash that outlives its swing reads as lag). */
  maxLife: number;
  /** The most particles ONE firing may make, at the largest scale any firing uses (`FIRING_SCALE`). */
  maxParticles: number;
  /** The most sprite effects (arcs and their layers, flashes, rings) ONE firing may make. */
  maxSprites: number;
  /** The colours it may use: the hero's energy is cyan and white, the enemies' and their warnings are violet, the warm accent is off unless a trigger asks for it. */
  palettes: readonly PaletteSlot[];
}

/** The largest `scale` any firing uses (a blow that kills is 1.3× bigger): the particles of a firing are counted at it. */
export const FIRING_SCALE = 1.3;

export const VFX_CONTRACT: Readonly<Record<VfxTrigger, VfxCue>> = {
  slash: { family: 'slash', events: ['player:attackActive'], originY: 0.8, maxLife: 0.25, maxParticles: 0, maxSprites: 4, palettes: ['energy'] },
  slashFinisher: { family: 'slash', events: ['player:attackActive'], originY: 0.8, maxLife: 0.32, maxParticles: 0, maxSprites: 4, palettes: ['energy', 'accent'] },
  hitLanded: { family: 'impact', events: ['combat:hit'], originY: 0, maxLife: 0.5, maxParticles: 20, maxSprites: 4, palettes: ['energy'] },
  playerHurt: { family: 'damage', events: ['player:hurt'], originY: 0, maxLife: 0.7, maxParticles: 24, maxSprites: 3, palettes: ['energy'] },
  dashStart: { family: 'dash', events: ['player:dashed'], originY: 0.9, maxLife: 0.45, maxParticles: 16, maxSprites: 3, palettes: ['energy'] },
  dashDust: { family: 'dash', events: ['player:dashed'], originY: 0.1, maxLife: 0.8, maxParticles: 12, maxSprites: 2, palettes: ['neutral'] },
  dashTrail: { family: 'dash', events: ['player:dashed', 'player:dashEnded'], originY: 0.85, maxLife: 0.6, maxParticles: 4, maxSprites: 3, palettes: ['energy'] },
  enemyDied: { family: 'death', events: ['actor:died'], originY: 0.7, maxLife: 1.4, maxParticles: 44, maxSprites: 3, palettes: ['enemy'] },
  enemyTelegraph: { family: 'telegraph', events: ['enemy:telegraph'], originY: 0.45, maxLife: 0.6, maxParticles: 18, maxSprites: 3, palettes: ['enemy'] },
  playerDied: { family: 'death', events: ['player:died'], originY: 0.9, maxLife: 2, maxParticles: 40, maxSprites: 2, palettes: ['energy'] },
  boltCharge: { family: 'bolt', events: ['skill:castStarted'], originY: 0, maxLife: 0.4, maxParticles: 10, maxSprites: 3, palettes: ['energy'] },
  boltCast: { family: 'bolt', events: ['skill:cast'], originY: 0, maxLife: 0.5, maxParticles: 14, maxSprites: 4, palettes: ['energy'] },
  boltImpact: { family: 'bolt', events: ['combat:hit'], originY: 0, maxLife: 0.8, maxParticles: 26, maxSprites: 4, palettes: ['energy'] },
  boltEnd: { family: 'bolt', events: ['projectile:ended'], originY: 0, maxLife: 0.6, maxParticles: 12, maxSprites: 2, palettes: ['energy'] },
  drinkStart: { family: 'bottle', events: ['bottle:drinkStarted'], originY: 0.9, maxLife: 0.6, maxParticles: 8, maxSprites: 2, palettes: ['energy'] },
  drinkHeal: { family: 'bottle', events: ['bottle:drunk'], originY: 0.9, maxLife: 1, maxParticles: 20, maxSprites: 3, palettes: ['energy'] },
  // a place that awakens: the event gives where the hero stands (their feet), and the pillar of light stands on it
  checkpoint: { family: 'rest', events: ['checkpoint:set'], originY: 0, maxLife: 1.6, maxParticles: 26, maxSprites: 4, palettes: ['energy'] },
  // a power that is gained: the event names no place — it is the hero's, where they stand (their feet)
  abilityGained: { family: 'ability', events: ['ability:unlocked'], originY: 0, maxLife: 1.8, maxParticles: 26, maxSprites: 4, palettes: ['energy'] },
  pickup: { family: 'interaction', events: ['interaction:performed'], originY: -0.35, maxLife: 1.2, maxParticles: 26, maxSprites: 4, palettes: ['energy'] },
  sealRejected: { family: 'seal', events: ['seal:rejected', 'enemy:blocked'], originY: 0, maxLife: 0.55, maxParticles: 16, maxSprites: 3, palettes: ['enemy'] },
  // a ward that breaks (its `actor:died`: a seal is the one neutral thing that falls): the violet of the ward and the white of what broke it
  sealBroken: { family: 'seal', events: ['actor:died'], originY: 0, maxLife: 1, maxParticles: 24, maxSprites: 4, palettes: ['enemy', 'energy'] },
  bossWake: { family: 'boss', events: ['boss:started'], originY: 3.2, maxLife: 1.5, maxParticles: 40, maxSprites: 3, palettes: ['enemy'] },
  bossStrike: { family: 'boss', events: ['boss:strike'], originY: 0.2, maxLife: 0.7, maxParticles: 26, maxSprites: 3, palettes: ['enemy'] },
  bossPhase: { family: 'boss', events: ['boss:phase'], originY: 3.2, maxLife: 1.5, maxParticles: 40, maxSprites: 3, palettes: ['enemy'] },
  bossDefeated: { family: 'boss', events: ['boss:defeated'], originY: 1.5, maxLife: 1.5, maxParticles: 20, maxSprites: 3, palettes: ['enemy'] },
};

/**
 * The moments in which several effects start AT ONCE, which together must fit the smallest profile's budget (the low one: the phone that is not new): what the
 * budget drops when it overflows is the cheapest effect, never the one that tells the player what happened — but a contract that lets a moment overflow the
 * smallest budget on its own would be asking the budget to do the work of the art.
 */
export const WORST_MOMENTS: Readonly<Record<string, readonly VfxTrigger[]>> = {
  'a blow that kills, taken while hurt and dashing': ['hitLanded', 'enemyDied', 'playerHurt', 'dashStart', 'dashDust'],
  'the boss raging: four marks of the rain at once': ['bossStrike', 'bossStrike', 'bossStrike', 'bossStrike'],
  'the boss falls to the last blow': ['hitLanded', 'enemyDied', 'bossDefeated'],
  'the Spirit Bolt breaks a ward': ['boltImpact', 'sealBroken'],
  'the rune of the shrine is taken and the place awakens': ['pickup', 'abilityGained', 'checkpoint'],
  'a bolt cast in the middle of a dash and a blow that lands': ['boltCharge', 'boltCast', 'dashStart', 'dashDust', 'hitLanded'],
};

export interface VfxCost {
  /** Seconds the longest effect of the trigger lives. */
  life: number;
  /** Particles one firing makes, at `FIRING_SCALE`. */
  particles: number;
  /** Sprite effects one firing makes. */
  sprites: number;
  /** The palette slots its effects use. */
  palettes: PaletteSlot[];
}

/** What one firing of a trigger costs, counted over every effect bound to it. Ids the definitions do not have cost nothing (the check says so on its own). */
export function triggerCost(defs: Readonly<Record<string, VfxDefinition>>, bindings: VfxBindings, trigger: VfxTrigger): VfxCost {
  const cost: VfxCost = { life: 0, particles: 0, sprites: 0, palettes: [] };
  for (const id of bindings[trigger] ?? []) {
    const d = defs[id];
    if (!d) continue;
    if (!cost.palettes.includes(d.palette)) cost.palettes.push(d.palette);
    if (d.kind === 'particles') {
      cost.life = Math.max(cost.life, d.life[1]);
      cost.particles += Math.ceil(d.count[1] * FIRING_SCALE);
    } else if (d.kind === 'arc') {
      cost.life = Math.max(cost.life, d.life);
      cost.sprites += d.layers.length;
    } else {
      cost.life = Math.max(cost.life, d.life);
      cost.sprites += 1;
    }
  }
  return cost;
}

export interface VfxContractIssue {
  trigger: VfxTrigger | null;
  /** The effect the issue is about, when it is about one. */
  id?: string;
  message: string;
}

const finite = (n: number): boolean => Number.isFinite(n);
const KNOWN_SEQUENCES: ReadonlySet<string> = new Set(VFX_SEQUENCE_NAMES);

/** Is the definition itself well formed (numbers that are numbers, in the ranges the runtime assumes)? Replacements arrive as data: this is what stops a typo from reaching the screen. */
function definitionIssues(d: VfxDefinition): string[] {
  const out: string[] = [];
  const range = (name: string, r: readonly [number, number], min: number): void => {
    if (!finite(r[0]) || !finite(r[1]) || r[0] > r[1] || r[0] < min) out.push(`${name} ${JSON.stringify(r)} must be an ordered pair of numbers ≥ ${min}`);
  };
  const unit = (name: string, r: readonly [number, number]): void => {
    if (![r[0], r[1]].every((v) => finite(v) && v >= 0 && v <= 1)) out.push(`${name} ${JSON.stringify(r)} must stay within 0–1`);
  };
  if (!finite(d.priority) || d.priority < 0) out.push(`priority ${d.priority} must be a number ≥ 0`);
  if (d.kind === 'particles') {
    range('count', d.count, 0);
    range('life', d.life, 0.01);
    range('speed', d.speed, 0);
    range('size', d.size, 0.001);
    unit('alpha', d.alpha);
    if (d.colors.length === 0) out.push('colors must name at least one role');
  } else if (d.kind === 'arc') {
    if (!(d.life > 0)) out.push(`life ${d.life} must be above 0`);
    unit('alpha', d.alpha);
    if (d.layers.length === 0) out.push('layers must have at least one');
    if (d.sequences) for (const name of [d.sequences.core, d.sequences.hot]) if (!KNOWN_SEQUENCES.has(name)) out.push(`sequence "${name}" is not one the art paints (${VFX_SEQUENCE_NAMES.join(', ')})`);
  } else if (d.kind === 'flipbook') {
    if (!(d.life > 0)) out.push(`life ${d.life} must be above 0`);
    unit('alpha', d.alpha);
    if (![d.size[0], d.size[1]].every((v) => finite(v) && v > 0)) out.push(`size ${JSON.stringify(d.size)} must be two numbers above 0`);
    if (!KNOWN_SEQUENCES.has(d.sequence)) out.push(`sequence "${d.sequence}" is not one the art paints (${VFX_SEQUENCE_NAMES.join(', ')})`);
    if (d.layer === 'back' && d.blend !== 'add') out.push('the light behind the actors is additive: "back" needs blend "add"');
  } else {
    if (!(d.life > 0)) out.push(`life ${d.life} must be above 0`);
    unit('alpha', d.alpha);
    // a flash may grow or shrink: the pair is from → to, not min → max
    if (![d.size[0], d.size[1]].every((v) => finite(v) && v > 0)) out.push(`size ${JSON.stringify(d.size)} must be two numbers above 0`);
  }
  return out;
}

/**
 * Does this set of effects keep the contract? Every trigger bound to effects that exist; every effect well formed; no trigger over its ceilings (life, particles,
 * sprites) or in colours it may not use; and every moment of `WORST_MOMENTS` inside the smallest budget. An empty answer means the effects can replace what ships
 * without anything but their look changing.
 */
export function checkVfxContract(defs: Readonly<Record<string, VfxDefinition>>, bindings: VfxBindings, contract: Readonly<Record<VfxTrigger, VfxCue>> = VFX_CONTRACT): VfxContractIssue[] {
  const issues: VfxContractIssue[] = [];
  const say = (trigger: VfxTrigger | null, message: string, id?: string): void => void issues.push({ trigger, ...(id ? { id } : {}), message });
  for (const [name, cue] of Object.entries(contract) as Array<[VfxTrigger, VfxCue]>) {
    const ids = bindings[name];
    if (!ids || ids.length === 0) {
      say(name, `trigger "${name}" has no effect bound to it`);
      continue;
    }
    for (const id of ids) {
      const d = defs[id];
      if (!d) {
        say(name, `trigger "${name}" is bound to "${id}", which is not defined`, id);
        continue;
      }
      for (const m of definitionIssues(d)) say(name, `effect "${id}": ${m}`, id);
      if (!cue.palettes.includes(d.palette)) say(name, `effect "${id}" uses the "${d.palette}" colours, which "${name}" may not (${cue.palettes.join(', ')})`, id);
    }
    const cost = triggerCost(defs, bindings, name);
    if (cost.life > cue.maxLife) say(name, `"${name}" lives ${cost.life} s, over its ${cue.maxLife} s ceiling`);
    if (cost.particles > cue.maxParticles) say(name, `"${name}" makes ${cost.particles} particles at ×${FIRING_SCALE}, over its ${cue.maxParticles} ceiling`);
    if (cost.sprites > cue.maxSprites) say(name, `"${name}" makes ${cost.sprites} sprite effects, over its ${cue.maxSprites} ceiling`);
  }
  // the ceilings themselves must fit the budgets they share: a contract that lets one effect eat a third of the smallest profile is not one
  for (const [name, cue] of Object.entries(contract) as Array<[VfxTrigger, VfxCue]>) {
    if (cue.maxParticles > PARTICLE_BUDGET.low / 3) say(name, `the ceiling of "${name}" (${cue.maxParticles} particles) is over a third of the low profile's budget (${PARTICLE_BUDGET.low})`);
    if (cue.maxSprites > SPRITE_FX_BUDGET.low / 6) say(name, `the ceiling of "${name}" (${cue.maxSprites} sprites) is over a sixth of the low profile's budget (${SPRITE_FX_BUDGET.low})`);
  }
  for (const [moment, triggers] of Object.entries(WORST_MOMENTS)) {
    const particles = triggers.reduce((n, t) => n + (contract[t]?.maxParticles ?? 0), 0);
    const sprites = triggers.reduce((n, t) => n + (contract[t]?.maxSprites ?? 0), 0);
    if (particles > PARTICLE_BUDGET.low) say(null, `${moment}: ${particles} particles at the ceilings, over the low profile's ${PARTICLE_BUDGET.low}`);
    if (sprites > SPRITE_FX_BUDGET.low) say(null, `${moment}: ${sprites} sprite effects at the ceilings, over the low profile's ${SPRITE_FX_BUDGET.low}`);
  }
  return issues;
}

/**
 * THE LIGHT THE HERO CARRIES (docs/PROMPT8-LOG.md, phase H): not a trigger — no event raises it — but a mote the director lets go now and then, as often as the hero's magic is high. A contract of its own because
 * it never stops, so it must cost next to nothing for as long as it runs: one particle at a time, of the hero's own colour, the first thing the budget drops, and never so many alive that it could be mistaken for a hit.
 */
export const AMBIENT_CONTRACT = {
  /** Most motes alive at once, at full level. */
  maxAlive: 8,
  /** The longest one lives, seconds. */
  maxLife: 2.2,
  /** The most it may be worth to the budget: under every real effect (the lowest of those is 3). */
  maxPriority: 2,
  palette: 'energy',
} as const;

/** What the ambient effect (and the pace it is let go at) says against the contract; an empty answer means it is as quiet as it has to be. */
export function ambientIssues(defs: Readonly<Record<string, VfxDefinition>>, ambient: { effect: string; every: number }): string[] {
  const d = defs[ambient.effect];
  if (!d) return [`the ambient effect "${ambient.effect}" is not defined`];
  if (d.kind !== 'particles') return [`the ambient effect "${ambient.effect}" must be a burst of particles (it is a ${d.kind})`];
  const out: string[] = [];
  if (d.palette !== AMBIENT_CONTRACT.palette) out.push(`the ambient light is the hero's (${AMBIENT_CONTRACT.palette}), not "${d.palette}"`);
  if (d.blend !== 'add') out.push('the ambient light is light: it is added, not drawn over');
  if (d.count[1] > 1) out.push(`the ambient light lets go ${d.count[1]} particles at a time: one`);
  if (d.life[1] > AMBIENT_CONTRACT.maxLife) out.push(`an ambient mote lives ${d.life[1]} s, over its ${AMBIENT_CONTRACT.maxLife} s ceiling`);
  if (d.priority > AMBIENT_CONTRACT.maxPriority) out.push(`the ambient light has priority ${d.priority}: it must be the first the budget drops (≤ ${AMBIENT_CONTRACT.maxPriority})`);
  if (!(ambient.every > 0)) out.push(`the ambient pace ${ambient.every} s must be above 0`);
  else {
    const alive = (d.life[1] * d.count[1]) / ambient.every;
    if (alive > AMBIENT_CONTRACT.maxAlive) out.push(`${alive.toFixed(1)} ambient motes would be alive at once at full level, over the ${AMBIENT_CONTRACT.maxAlive} of the contract`);
  }
  return out;
}
