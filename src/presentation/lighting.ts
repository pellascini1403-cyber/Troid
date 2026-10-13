import type { PaletteSlot } from './palette';
import type { VfxTrigger } from './vfx';
import type { QualityTier } from './viewport';
import { viewY } from './worldTransform';

/**
 * THE LIGHT OF THE WORLD (docs/PROMPT8-LOG.md, phase I): what the energy of the game does to the place around it. The hero carries a soft cyan light that grows with their magic; the Spirit Bolt lights what it flies
 * through; an enemy that prepares a blow and the guardian of the sanctum cast violet. Each is a soft pool of ADDITIVE light drawn BEHIND the actors and over the scenery (`fxBack`): the ground, the walls and the
 * strips of the backdrop are brightened where the energy is, and the dark silhouette of whoever stands in it is cut out against it — the reading of the game never gets worse for it, it gets better (the hero is
 * nearly black; a dark thing against a lit one is what the eye finds first).
 *
 * This module is PURE and knows no Pixi: it says WHICH lights there are this frame, WHERE, how BIG and how STRONG, from what the views already read (the interpolated state of the hero, the projectiles, the enemies
 * and the guardian). `vfx/LightField` draws them. Nothing here is gameplay: no light changes what happens, and with none (`?light=off`) the game is exactly the game it was.
 *
 * The CONTRACT below is what keeps it legible: a light is never brighter than its ceiling, never bigger than its radius, the number drawn at once is the quality profile's, the hero's own light is always among those
 * kept, and a dead hero casts none.
 */

/** The kinds of light the world carries, from the one that is always there to the one that comes and goes. */
export const LIGHT_KINDS = ['hero', 'floor', 'bolt', 'boss', 'foe'] as const;
export type LightKind = (typeof LIGHT_KINDS)[number];

/** One light, as the field draws it: in VIEW space (metres, +y down), a soft glow of `radius` that is `intensity` bright at its heart. */
export interface LightSource {
  /** Stable from one frame to the next for the same light (the field eases its strength, it never pops). */
  key: string;
  kind: LightKind;
  slot: PaletteSlot;
  x: number;
  y: number;
  /** Metres: half the width of the glow. */
  radius: number;
  /** 1 = round; below 1 it is flattened (a pool of light on the floor, seen across the ground). */
  squash: number;
  /** 0–1: the alpha of the glow at its heart. */
  intensity: number;
  /** Lower is more important: when the profile draws fewer lights than there are, the highest ranks go first. */
  rank: number;
}

/** How a kind of light is made (the numbers are DATA, in `content/lights.ts`). */
export interface LightRecipe {
  slot: PaletteSlot;
  /** Metres. */
  radius: number;
  squash: number;
  rank: number;
}

/** What the world must never do with light, and the profile's share of it. */
export const LIGHT_CONTRACT = {
  /** The brightest a light of each kind may ever be at its heart: the glow is added to a dark scene, so a cap here is what keeps the dark scene dark. */
  maxIntensity: { hero: 0.5, floor: 0.3, bolt: 0.62, boss: 0.42, foe: 0.42 } as Readonly<Record<LightKind, number>>,
  /** The smallest and the biggest a light may be (metres of radius): nothing is a pin-prick, nothing floods a room. */
  minRadius: 0.8,
  maxRadius: 8,
  /** The most light two kinds that stand on the same spot may add up to at their hearts (the hero's own, the floor under them and a bolt leaving their hand do): above it the silhouette would be lost in white. */
  maxStack: 1.25,
  /** Lights drawn at once per quality profile. The first three kinds (the hero's, the floor's and the bolt's) always fit, even in the lowest. */
  capacity: { low: 3, medium: 6, high: 8 } as Readonly<Record<QualityTier, number>>,
  /** A light further than this from the hero (metres, along x) is off the screen of any phone, and is not drawn. */
  reach: 24,
  /** The pool of light under the hero lies on the FLOOR beneath them, and fades as they rise from it: this many metres above it there is none. */
  floorReach: 3,
  /** An enemy this close (metres, along x) to the hero that winds up or strikes makes the hero's own light give way to its violet; the guardian's blows are arena-wide. */
  menaceReach: 7,
  bossReach: 14,
  /** The most of the hero's light that may give way (0–1): above it the hero would be lost in the dark exactly when they must be seen. */
  maxDuck: 0.75,
} as const;

/** Lights drawn at once for a quality profile. */
export function lightCapacity(tier: QualityTier): number {
  return LIGHT_CONTRACT.capacity[tier];
}

/** What the recipes say against the contract; an empty answer means the light is as quiet as it has to be. */
export function lightIssues(recipes: Readonly<Record<LightKind, LightRecipe>>, strength: Readonly<Record<LightKind, number>>, duck = 0.5): string[] {
  const out: string[] = [];
  for (const kind of LIGHT_KINDS) {
    const r = recipes[kind];
    if (!r) {
      out.push(`there is no recipe for the "${kind}" light`);
      continue;
    }
    if (r.slot !== 'energy' && r.slot !== 'enemy') out.push(`the "${kind}" light is cast in the "${r.slot}" colour: the light of the world is the hero's (energy) or the enemy's (enemy)`);
    if (!(r.radius >= LIGHT_CONTRACT.minRadius && r.radius <= LIGHT_CONTRACT.maxRadius)) out.push(`the "${kind}" light is ${r.radius} m wide: between ${LIGHT_CONTRACT.minRadius} and ${LIGHT_CONTRACT.maxRadius} m`);
    if (!(r.squash > 0 && r.squash <= 1)) out.push(`the "${kind}" light is squashed to ${r.squash}: above 0 and up to 1`);
    const top = strength[kind];
    if (!(top >= 0 && top <= LIGHT_CONTRACT.maxIntensity[kind] + 1e-9)) out.push(`the "${kind}" light reaches ${top}: over its ceiling of ${LIGHT_CONTRACT.maxIntensity[kind]}`);
  }
  // the lights that stand on the hero add up at the hero's heart: a hero in white is a hero nobody can read
  const stack = strength.hero + strength.floor + strength.bolt;
  if (stack > LIGHT_CONTRACT.maxStack + 1e-9) out.push(`the hero's light, the floor's and a bolt's add up to ${stack.toFixed(2)} on the same spot: over ${LIGHT_CONTRACT.maxStack}`);
  if (!(duck > 0 && duck <= LIGHT_CONTRACT.maxDuck)) out.push(`the hero's light gives way by ${duck} to an enemy's warning: above 0 (the warning must stay violet) and up to ${LIGHT_CONTRACT.maxDuck} (the hero must stay seen)`);
  // the hero's own light is always among those kept, in every profile
  const kept = [...LIGHT_KINDS].sort((a, b) => recipes[a].rank - recipes[b].rank).slice(0, LIGHT_CONTRACT.capacity.low);
  for (const must of ['hero', 'floor', 'bolt'] as const) if (!kept.includes(must)) out.push(`the lowest profile draws ${LIGHT_CONTRACT.capacity.low} lights and the "${must}" one is not among them`);
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the pulses

/**
 * A light that a MOMENT leaves behind (a blow that lands, a bolt that is let go, a place that awakens): it swells, peaks and goes out over its `life`, where the moment happened. It is bound to the same
 * triggers the effects are (`content/lights.ts`), but it costs nothing of their budget — a pulse is one soft pool of light, and the field has a few of its own.
 */
export interface LightPulse {
  slot: PaletteSlot;
  /** Metres: half the width of the glow. */
  radius: number;
  /** 0–1: the alpha at the heart at its brightest. */
  peak: number;
  /** Seconds it lasts. */
  life: number;
  /** 0–1: how far through its life it peaks (a blow flashes at once, 0.15; a place that awakens swells, 0.3). */
  rise: number;
  /** Metres from the spawn point in the effect's own frame: +x is the way it faces, +y up. */
  offset?: readonly [x: number, y: number];
}

/** What a pulse may never be. */
export const PULSE_CONTRACT = {
  maxPeak: 0.62,
  minRadius: 1.2,
  maxRadius: 9.5,
  maxLife: 1.8,
  /** Pulses alive at once per quality profile: the newest takes the place of the one that is dimmest. */
  capacity: { low: 2, medium: 3, high: 4 } as Readonly<Record<QualityTier, number>>,
} as const;

export function pulseCapacity(tier: QualityTier): number {
  return PULSE_CONTRACT.capacity[tier];
}

/** How bright a pulse is `age` seconds after it was born: a quick swell (squared) up to its peak, then a soft fall. Zero once it is over. */
export function pulseLevel(p: Pick<LightPulse, 'peak' | 'life' | 'rise'>, age: number): number {
  if (!(age >= 0) || age >= p.life) return 0;
  const t = age / p.life;
  if (t < p.rise) {
    const k = t / p.rise;
    return p.peak * k * k;
  }
  const k = (1 - t) / (1 - p.rise);
  return p.peak * Math.pow(k, 1.5);
}

/** What the pulses say against the contract; an empty answer means they are as quiet as they have to be. */
export function pulseIssues(pulses: Readonly<Partial<Record<VfxTrigger, readonly LightPulse[]>>>): string[] {
  const out: string[] = [];
  for (const [trigger, list] of Object.entries(pulses) as Array<[string, readonly LightPulse[]]>) {
    if (list.length > 2) out.push(`"${trigger}" leaves ${list.length} pulses of light: at most 2`);
    for (const p of list) {
      const at = `the "${trigger}" pulse`;
      if (p.slot !== 'energy' && p.slot !== 'enemy') out.push(`${at} is in the "${p.slot}" colour: the light of the world is the hero's (energy) or the enemy's (enemy)`);
      if (!(p.peak > 0 && p.peak <= PULSE_CONTRACT.maxPeak)) out.push(`${at} peaks at ${p.peak}: above 0 and up to ${PULSE_CONTRACT.maxPeak}`);
      if (!(p.radius >= PULSE_CONTRACT.minRadius && p.radius <= PULSE_CONTRACT.maxRadius)) out.push(`${at} is ${p.radius} m wide: between ${PULSE_CONTRACT.minRadius} and ${PULSE_CONTRACT.maxRadius} m`);
      if (!(p.life > 0 && p.life <= PULSE_CONTRACT.maxLife)) out.push(`${at} lasts ${p.life} s: above 0 and up to ${PULSE_CONTRACT.maxLife} s`);
      if (!(p.rise > 0 && p.rise < 1)) out.push(`${at} peaks ${p.rise} of the way through its life: between 0 and 1, neither included`);
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the frame

/** The hero, as the lights need them: where they are NOW (interpolated, feet-centre, simulation space), whether they are down and how much magic they have (0–1). */
export interface LightHero {
  x: number;
  y: number;
  dead: boolean;
  magic: number;
  /** Where the floor is under their feet (simulation space; `null`: none within reach — a pit). Left out, they stand on it. */
  ground?: number | null;
}

/**
 * A thing of the world that may carry light, as the view reads it (a structural type: nothing here imports an entity class). A projectile has its own position; an actor has a `view`; the guardian's carries more.
 * What is not one of those has no light.
 */
export interface LightBody {
  readonly id: string;
  readonly kind: string;
  readonly x?: number;
  readonly y?: number;
  readonly prevX?: number;
  readonly prevY?: number;
  readonly body?: { readonly height: number };
  readonly view?: {
    readonly x: number;
    readonly y: number;
    readonly prevX: number;
    readonly prevY: number;
    readonly anim: string;
    readonly phaseT: number;
    readonly visible: boolean;
    readonly opacity: number;
    readonly awake?: boolean;
    readonly enraged?: boolean;
    readonly attack?: string | null;
  };
}

export interface LightFrame {
  /** The interpolation between ticks (1 when the game is paused). */
  alpha: number;
  hero: LightHero;
  bodies: readonly LightBody[];
}

/** How strong each state of a thing is, for the kinds whose light follows a state (DATA: `content/lights.ts`). */
export interface LightStrength {
  /** The hero's light at no magic and at full magic. */
  hero: readonly [number, number];
  /** The floor's, likewise. */
  floor: readonly [number, number];
  /** The hero's body: how high above the feet the light is centred, metres. */
  heroRise: number;
  /** How much of the hero's own light (and the pool under them) gives way to the violet while an enemy near them winds up or strikes: 0 none, 1 all. The warning is the one thing on the screen that must stay violet. */
  duck: number;
  /** The bolt in flight. */
  bolt: number;
  /** An enemy: awake, preparing a blow (ramps with the warning) and striking. */
  foe: { awake: number; telegraph: readonly [number, number]; strike: number };
  /** The guardian: asleep, awake, enraged, and what a blow in the making or on its way adds. */
  boss: { asleep: number; awake: number; enraged: number; telegraph: number; strike: number };
}

/** A list of lights that is made once and reused: the frame fills it, the field reads it (nothing is allocated while the game runs). */
export class LightBook {
  readonly sources: LightSource[] = [];
  /** How many of `sources` are in use this frame. */
  count = 0;

  constructor(readonly capacity: number) {
    // room for every light there can be before the profile cuts the list: the hero's two, a bolt or two, the guardian and a few enemies
    for (let i = 0; i < capacity + 12; i++) this.sources.push({ key: '', kind: 'foe', slot: 'enemy', x: 0, y: 0, radius: 1, squash: 1, intensity: 0, rank: 0 });
  }

  /** Starts a frame. */
  begin(): void {
    this.count = 0;
  }

  /** Adds one (when there is room). */
  add(key: string, kind: LightKind, recipe: LightRecipe, x: number, y: number, intensity: number): void {
    if (this.count >= this.sources.length || !(intensity > 0)) return;
    const s = this.sources[this.count++]!;
    s.key = key;
    s.kind = kind;
    s.slot = recipe.slot;
    s.x = x;
    s.y = y;
    s.radius = recipe.radius;
    s.squash = recipe.squash;
    s.intensity = Math.min(intensity, LIGHT_CONTRACT.maxIntensity[kind]);
    s.rank = recipe.rank;
  }

  /** Ends a frame: the lights that matter most come first, and only as many as the profile draws are kept. */
  end(): void {
    const list = this.sources;
    const n = this.count;
    // insertion sort by rank (stable: the order of arrival breaks ties): the list is a handful long and nearly sorted, and nothing is allocated
    for (let i = 1; i < n; i++) {
      const s = list[i]!;
      let j = i - 1;
      while (j >= 0 && list[j]!.rank > s.rank) {
        list[j + 1] = list[j]!;
        j--;
      }
      list[j + 1] = s;
    }
    if (this.count > this.capacity) this.count = this.capacity;
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Which lights there are this frame. Fills `book` (call `begin` before and `end` after): the hero's, the floor's under them, the light of every bolt in flight, the guardian's and the enemies' near enough to be on the screen.
 * Reads the state of the views (what is DRAWN) and nothing else; changes nothing.
 */
export function collectLights(frame: LightFrame, recipes: Readonly<Record<LightKind, LightRecipe>>, strength: LightStrength, book: LightBook): void {
  const a = frame.alpha;
  const h = frame.hero;
  const magic = clamp01(h.magic);
  if (!h.dead) {
    // an enemy that winds up, or strikes, near the hero takes the dark from the hero's light: the warning is violet and must read as violet, and the room is theirs for a moment
    const keep = 1 - strength.duck * menaceOver(frame);
    book.add('hero', 'hero', recipes.hero, h.x, viewY(h.y + strength.heroRise), lerp(strength.hero[0], strength.hero[1], magic) * keep);
    // the pool lies on the floor under them (where they will land), and fades as they rise from it
    const ground = h.ground === undefined ? h.y : h.ground;
    if (ground !== null) {
      const near = clamp01(1 - Math.max(0, h.y - ground) / LIGHT_CONTRACT.floorReach);
      book.add('floor', 'floor', recipes.floor, h.x, viewY(ground), lerp(strength.floor[0], strength.floor[1], magic) * keep * near);
    }
  }
  for (const e of frame.bodies) {
    if (e.kind === 'projectile') {
      if (e.x === undefined || e.y === undefined) continue;
      const x = (e.prevX ?? e.x) + (e.x - (e.prevX ?? e.x)) * a;
      const y = (e.prevY ?? e.y) + (e.y - (e.prevY ?? e.y)) * a;
      if (Math.abs(x - h.x) > LIGHT_CONTRACT.reach) continue;
      book.add(`bolt:${e.id}`, 'bolt', recipes.bolt, x, viewY(y), strength.bolt);
      continue;
    }
    const v = e.view;
    if (!v || !v.visible || v.opacity <= 0.02) continue;
    const x = v.prevX + (v.x - v.prevX) * a;
    const y = v.prevY + (v.y - v.prevY) * a;
    if (Math.abs(x - h.x) > LIGHT_CONTRACT.reach) continue;
    if (e.kind === 'guardian') {
      const b = strength.boss;
      let k = v.awake ? (v.enraged ? b.enraged : b.awake) : b.asleep;
      if (v.anim === 'telegraph') k += b.telegraph * clamp01(v.phaseT);
      else if (v.anim === 'attack') k += b.strike;
      book.add(`boss:${e.id}`, 'boss', recipes.boss, x, viewY(y + (e.body?.height ?? 2.9) * 0.55), k * v.opacity);
    } else if (e.kind === 'enemy') {
      const f = strength.foe;
      let k = f.awake;
      if (v.anim === 'telegraph') k = lerp(f.telegraph[0], f.telegraph[1], clamp01(v.phaseT));
      else if (v.anim === 'attack') k = f.strike;
      else if (v.anim === 'death') k = 0;
      book.add(`foe:${e.id}`, 'foe', recipes.foe, x, viewY(y + 0.5), k * v.opacity);
    }
  }
}

/**
 * How much the enemies near the hero threaten them right now, 0–1: the strongest warning (an enemy that winds up counts as far as it has got, one that strikes as all of it) among those close enough to matter —
 * an enemy within `menaceReach` metres along x, the guardian within `bossReach` (its blows cover the arena).
 */
export function menaceOver(frame: LightFrame): number {
  const a = frame.alpha;
  const hx = frame.hero.x;
  let menace = 0;
  for (const e of frame.bodies) {
    const boss = e.kind === 'guardian';
    if (!boss && e.kind !== 'enemy') continue;
    const v = e.view;
    if (!v || !v.visible || v.opacity <= 0.02) continue;
    const m = v.anim === 'telegraph' ? clamp01(v.phaseT) : v.anim === 'attack' ? 1 : 0;
    if (m <= menace) continue;
    const x = v.prevX + (v.x - v.prevX) * a;
    if (Math.abs(x - hx) <= (boss ? LIGHT_CONTRACT.bossReach : LIGHT_CONTRACT.menaceReach)) menace = m;
  }
  return menace;
}
