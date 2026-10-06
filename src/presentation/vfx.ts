import type { Rng } from '@/core/rng';
import { PALETTE, SLOT_COLORS, type PaletteSlot } from './palette';
import type { QualityTier } from './viewport';

/**
 * VFX as PURE data and maths (docs/ARCHITECTURE-2D.md §7.7). An effect is a `VfxDefinition` (what it looks like, in
 * metres and seconds, with colours requested as palette SLOTS, never as hex), a spawn context says where and which way,
 * and the functions here turn the two into particle states. No Pixi, no clocks, no `Math.random`: the emitter takes an
 * injected `Rng`, so a burst is reproducible and tested in Node. `vfx/` only applies the results to sprites.
 *
 * The view's own random generator is NOT the simulation's `Rng`: effects never consume or disturb the sim's sequence.
 */

export type VfxBlend = 'add' | 'normal';

/** Procedural shapes of the VFX atlas (all white: the colour comes from the palette slot at runtime). */
export type VfxShape = 'spark' | 'shard' | 'glow' | 'ring' | 'dust' | 'ink' | 'streak' | 'arc';

/**
 * Which colour of a palette slot a particle takes. `ink` is the dark body colour of the slot's owner (enemy ink, hero
 * armour): the black of the "black / white / cyan" identity, the only colour that is not additive-friendly.
 */
export type ColorRole = 'core' | 'hot' | 'deep' | 'ink';

export type Range = readonly [min: number, max: number];

/** Where an effect happens and which way it looks. World space: metres, +y up. */
export interface VfxSpawn {
  x: number;
  y: number;
  /** +1 = to the right, −1 = to the left. */
  facing: 1 | -1;
  /** Explicit direction (a hit pushes along it); defaults to the facing. */
  dirX?: number;
  dirY?: number;
  /** World rectangle the effect should fit (a slash covers the attack's hitbox). */
  rect?: { x0: number; y0: number; x1: number; y1: number };
  /** Picks a variant of the definition (the attack id for slash arcs). */
  variant?: string;
  /** Multiplier on size (and on count for bursts): the finisher is bigger than the opener. */
  scale?: number;
}

interface VfxBase {
  id: string;
  /** Higher survives the particle budget; the lowest is dropped first when the screen is full. */
  priority: number;
  palette: PaletteSlot;
}

/** A burst of small particles (sparks, shards, dust, ink, motes): one `ParticleContainer`, one draw call. */
export interface ParticleVfx extends VfxBase {
  kind: 'particles';
  blend: VfxBlend;
  shape: 'spark' | 'shard' | 'glow' | 'dust' | 'ink';
  count: Range;
  /** m/s */
  speed: Range;
  /** seconds */
  life: Range;
  /** The burst's axis: along the hit / facing, back against the facing, straight up, or any way. */
  aim: 'along' | 'back' | 'up' | 'any';
  /** Total cone around `aim`, radians (2π = a full circle). */
  spread: number;
  /** Sprite width at birth, metres; at death it is multiplied by `sizeEnd`. */
  size: Range;
  sizeEnd: number;
  /** m/s², negative = falls. */
  gravity: number;
  /** 1/s */
  drag: number;
  /** rad/s */
  spin?: Range;
  alpha: readonly [from: number, to: number];
  colors: readonly ColorRole[];
  /** Turn the sprite along its velocity (sparks, shards). */
  align?: boolean;
  /** Spawn scatter, metres. */
  radius?: number;
}

/** A crescent that follows the sword: fits the attack's hitbox and sweeps through a few tens of degrees while it fades. */
export interface ArcVariant {
  /** Radians (counter-clockwise, facing right), from birth to death: the sweep. */
  rotation: readonly [from: number, to: number];
  /** Multipliers of the rect's width and height. */
  width: number;
  height: number;
}
export interface ArcVfx extends VfxBase {
  kind: 'arc';
  life: number;
  alpha: readonly [from: number, to: number];
  /** Uniform scale at birth → at death. */
  scale: readonly [from: number, to: number];
  /** Stacked crescents (a wide coloured one and a thin white-hot core). */
  layers: ReadonlyArray<{ role: ColorRole; scale: number; alpha: number }>;
  variants: Readonly<Record<string, ArcVariant>>;
  fallback: ArcVariant;
}

/** A soft glow, a ring or a streak that grows and fades in place: impact flashes, shock rings, dash trail puffs. */
export interface FlashVfx extends VfxBase {
  kind: 'flash';
  shape: 'glow' | 'ring' | 'streak';
  role: ColorRole;
  life: number;
  /** Width in metres at birth → at death. */
  size: readonly [from: number, to: number];
  alpha: readonly [from: number, to: number];
  /** Width / height of the sprite (1 for glows and rings; a streak is wider than tall). */
  aspect?: number;
  /** Repeat every `spacing` metres along the path of the thing that leaves a trail (the dash). */
  spacing?: number;
}

export type VfxDefinition = ParticleVfx | ArcVfx | FlashVfx;

/** Triggers the director derives from simulation events; the binding table maps each to effect ids (data). */
export type VfxTrigger =
  | 'slash'
  | 'slashFinisher'
  | 'hitLanded'
  | 'playerHurt'
  | 'dashStart'
  | 'dashDust'
  | 'dashTrail'
  | 'enemyDied'
  | 'enemyTelegraph'
  | 'playerDied'
  | 'boltCast'
  | 'boltImpact'
  | 'boltEnd'
  | 'drinkStart'
  | 'drinkHeal'
  | 'pickup';

export type VfxBindings = Readonly<Record<VfxTrigger, readonly string[]>>;

/** Live particles allowed per quality profile (GAME-SPEC-2D §3.5: ≤ 400 high, 150 low). */
export const PARTICLE_BUDGET: Readonly<Record<QualityTier, number>> = { low: 150, medium: 300, high: 400 };
/** Sprite effects (arcs, flashes, trail puffs) alive at once, per profile. */
export const SPRITE_FX_BUDGET: Readonly<Record<QualityTier, number>> = { low: 24, medium: 40, high: 64 };

// ---------------------------------------------------------------------------------------------------- colour

/** Hex colour for a role of a slot. The warm accent is OFF unless explicitly enabled: it then falls back to energy. */
export function resolveColor(slot: PaletteSlot, role: ColorRole, accent = false): number {
  const effective: PaletteSlot = slot === 'accent' && !accent ? 'energy' : slot;
  if (role === 'ink') return effective === 'enemy' ? PALETTE.enemyInk : PALETTE.heroInk;
  return SLOT_COLORS[effective][role];
}

// -------------------------------------------------------------------------------------------------- particles

/** The state of one particle, in simulation space. Plain numbers: the same object is reused by the pool. */
export interface ParticleMotion {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  alpha0: number;
  alpha1: number;
  rotation: number;
  spin: number;
  gravity: number;
  drag: number;
  tint: number;
  align: boolean;
}

export function createParticleMotion(): ParticleMotion {
  return { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size0: 0.1, size1: 0.1, alpha0: 1, alpha1: 0, rotation: 0, spin: 0, gravity: 0, drag: 0, tint: 0xffffff, align: false };
}

/** Angle (radians, +x = 0, +y up = π/2) of the burst's axis. */
export function aimAngle(aim: ParticleVfx['aim'], s: VfxSpawn): number {
  const dx = s.dirX ?? s.facing;
  const dy = s.dirY ?? 0;
  switch (aim) {
    case 'along': return Math.atan2(dy, dx);
    case 'back': return Math.atan2(-dy, -dx);
    case 'up': return Math.PI / 2;
    case 'any': return 0;
  }
}

/** How many particles a burst makes (rounded, ≥ 0). Consumes one random number. */
export function burstCount(def: ParticleVfx, rng: Rng, scale = 1): number {
  return Math.max(0, Math.round(rng.range(def.count[0], def.count[1]) * scale));
}

export function initParticle(def: ParticleVfx, s: VfxSpawn, rng: Rng, accent: boolean, out: ParticleMotion): ParticleMotion {
  const a = aimAngle(def.aim, s) + (rng.next() - 0.5) * def.spread;
  const speed = rng.range(def.speed[0], def.speed[1]);
  const scatter = (def.radius ?? 0) * Math.sqrt(rng.next());
  const around = rng.next() * Math.PI * 2;
  out.x = s.x + Math.cos(around) * scatter;
  out.y = s.y + Math.sin(around) * scatter;
  out.vx = Math.cos(a) * speed;
  out.vy = Math.sin(a) * speed;
  out.age = 0;
  out.life = rng.range(def.life[0], def.life[1]);
  out.size0 = rng.range(def.size[0], def.size[1]) * (s.scale ?? 1);
  out.size1 = out.size0 * def.sizeEnd;
  out.alpha0 = def.alpha[0];
  out.alpha1 = def.alpha[1];
  out.align = def.align === true;
  out.rotation = out.align ? a : rng.next() * Math.PI * 2;
  out.spin = def.spin ? rng.range(def.spin[0], def.spin[1]) : 0;
  out.gravity = def.gravity;
  out.drag = def.drag;
  out.tint = resolveColor(def.palette, rng.pick(def.colors), accent);
  return out;
}

/** Advances a particle by `dt` seconds. Returns false once it has lived its life. */
export function stepParticle(p: ParticleMotion, dt: number): boolean {
  p.age += dt;
  if (p.age >= p.life) return false;
  const damp = Math.exp(-p.drag * dt);
  p.vx *= damp;
  p.vy = p.vy * damp + p.gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.rotation = p.align && (p.vx !== 0 || p.vy !== 0) ? Math.atan2(p.vy, p.vx) : p.rotation + p.spin * dt;
  return true;
}

/** 0 at birth → 1 at death. */
export function lifeFraction(age: number, life: number): number {
  return life > 0 ? Math.min(1, Math.max(0, age / life)) : 1;
}

export function particleSize(p: ParticleMotion): number {
  const t = lifeFraction(p.age, p.life);
  return p.size0 + (p.size1 - p.size0) * t;
}

/** Fades late (ease-in), so sparks stay bright for most of their life. */
export function particleAlpha(p: ParticleMotion): number {
  const t = lifeFraction(p.age, p.life);
  return p.alpha0 + (p.alpha1 - p.alpha0) * t * t;
}

// ----------------------------------------------------------------------------------------------------- arcs

export interface ArcPose {
  /** Centre, simulation space. */
  x: number;
  y: number;
  /** Size of the crescent's bounding box, metres. */
  width: number;
  height: number;
  /** Sprite rotation at birth / death in the VIEW convention (clockwise positive, as Pixi). Mirrors with the facing. */
  rotation0: number;
  rotation1: number;
  /** +1 / −1: mirrors the sprite (the crescent bows toward the facing). */
  flip: 1 | -1;
}

/** Fits a slash arc to the attack's hitbox. Without a rect it falls back to a 1.4 × 1.1 m box in front of `(x, y)`. */
export function arcPose(def: ArcVfx, s: VfxSpawn, out: ArcPose): ArcPose {
  const v = (s.variant !== undefined ? def.variants[s.variant] : undefined) ?? def.fallback;
  const r = s.rect;
  const w = r ? r.x1 - r.x0 : 1.4;
  const h = r ? r.y1 - r.y0 : 1.1;
  const scale = s.scale ?? 1;
  out.x = r ? (r.x0 + r.x1) / 2 : s.x + s.facing * 0.9;
  out.y = r ? (r.y0 + r.y1) / 2 : s.y + 0.85;
  out.width = w * v.width * scale;
  out.height = h * v.height * scale;
  out.flip = s.facing;
  // simulation rotation is counter-clockwise with +y up; Pixi's is clockwise with +y down: −θ for facing right, +θ mirrored
  out.rotation0 = -v.rotation[0] * s.facing;
  out.rotation1 = -v.rotation[1] * s.facing;
  return out;
}
