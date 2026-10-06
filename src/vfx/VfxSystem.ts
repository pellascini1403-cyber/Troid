import { Container, Particle, ParticleContainer, Sprite } from 'pixi.js';
import type { VfxAtlas } from '@/assets/vfxAtlas';
import { Pool } from '@/core/pool';
import { Rng } from '@/core/rng';
import {
  arcPose,
  burstCount,
  createParticleMotion,
  initParticle,
  lifeFraction,
  particleAlpha,
  particleSize,
  resolveColor,
  stepParticle,
  type ArcPose,
  type ArcVfx,
  type FlashVfx,
  type ParticleMotion,
  type ParticleVfx,
  type VfxBlend,
  type VfxDefinition,
  type VfxShape,
  type VfxSpawn,
} from '@/presentation/vfx';

export interface VfxLayers {
  /** Additive layer (sparks, glows, arcs, trail). */
  add: Container;
  /** Normal-blend layer (ink, dust). */
  normal: Container;
}

export interface VfxSystemOptions {
  /** Live particles allowed (see `PARTICLE_BUDGET`). */
  particleBudget: number;
  /** Live sprite effects allowed (see `SPRITE_FX_BUDGET`). */
  spriteBudget: number;
  /** The view's OWN random generator seed: effects never touch the simulation's `Rng`. */
  seed?: number;
  /** The optional warm accent: off unless explicitly enabled. */
  accent?: boolean;
}

export interface VfxStats {
  /** Live particles / sprite effects right now. */
  particles: number;
  sprites: number;
  /** Effects started / dropped by the budget since the start. */
  spawned: number;
  dropped: number;
  peakParticles: number;
  /** Objects ever created by the pools: after warm-up it stops growing (a growing number is a leak). */
  poolCreated: number;
}

/** A pooled particle: the Pixi object plus the pure motion state. */
interface FxParticle {
  readonly particle: Particle;
  readonly motion: ParticleMotion;
  readonly pool: Pool<FxParticle>;
  readonly container: ParticleContainer;
  readonly shape: VfxShape;
  priority: number;
  texW: number;
}

/** A pooled sprite effect (a slash arc layer, a flash, a ring, a trail puff). */
interface FxSprite {
  readonly sprite: Sprite;
  age: number;
  life: number;
  x: number;
  y: number;
  width0: number;
  width1: number;
  height0: number;
  height1: number;
  alpha0: number;
  alpha1: number;
  rot0: number;
  rot1: number;
  flip: 1 | -1;
  priority: number;
  texW: number;
  texH: number;
}

const MAX_PER_SPAWN_SPRITES = 4;

/**
 * The VFX runtime (docs/ARCHITECTURE-2D.md §7.7–7.8). It turns `VfxDefinition`s into pooled Pixi objects:
 *
 *  - particles live in two `ParticleContainer`s (additive and normal): all of them, whatever their shape, are batched
 *    into one draw call per blend mode;
 *  - slash arcs, flashes, rings and trail puffs are pooled `Sprite`s in the additive layer;
 *  - a hard budget (150 / 300 / 400 particles per quality profile) is enforced: when full, the effects of lower
 *    `priority` are dropped first, then the new burst is trimmed.
 *
 * It runs in REAL time (it is told `dt`, never ticks), so a hit-stop that freezes the world does not freeze the
 * sparks. It never allocates in the steady state: every object comes from a `Pool` that stops growing after warm-up
 * (`stats.poolCreated` proves it).
 */
export class VfxSystem {
  private readonly rng: Rng;
  private readonly accent: boolean;
  private readonly containers: Record<VfxBlend, ParticleContainer>;
  private readonly particlePools = new Map<string, Pool<FxParticle>>();
  private readonly spritePool: Pool<FxSprite>;
  private readonly liveParticles: FxParticle[] = [];
  private readonly liveSprites: FxSprite[] = [];
  private readonly pose: ArcPose = { x: 0, y: 0, width: 0, height: 0, rotation0: 0, rotation1: 0, flip: 1 };
  private spawned = 0;
  private dropped = 0;
  private peak = 0;
  private destroyed = false;

  constructor(
    layers: VfxLayers,
    private readonly atlas: VfxAtlas,
    private readonly defs: Readonly<Record<string, VfxDefinition>>,
    private readonly options: VfxSystemOptions,
  ) {
    this.rng = new Rng(options.seed ?? 0x5eed);
    this.accent = options.accent ?? false;
    const make = (blend: VfxBlend, parent: Container): ParticleContainer => {
      const c = new ParticleContainer({
        texture: atlas.source,
        dynamicProperties: { position: true, vertex: true, rotation: true, color: true },
      });
      c.blendMode = blend;
      c.label = `vfx:particles:${blend}`;
      parent.addChild(c);
      return c;
    };
    this.containers = { add: make('add', layers.add), normal: make('normal', layers.normal) };
    this.spritePool = new Pool<FxSprite>(
      () => {
        const sprite = new Sprite(atlas.frames.glow);
        sprite.blendMode = 'add';
        sprite.visible = false;
        layers.add.addChild(sprite);
        return { sprite, age: 0, life: 1, x: 0, y: 0, width0: 1, width1: 1, height0: 1, height1: 1, alpha0: 1, alpha1: 0, rot0: 0, rot1: 0, flip: 1, priority: 0, texW: 1, texH: 1 };
      },
      (fx) => {
        fx.sprite.visible = false;
      },
      options.spriteBudget,
    );
  }

  get stats(): VfxStats {
    let created = this.spritePool.created;
    for (const p of this.particlePools.values()) created += p.created;
    return {
      particles: this.liveParticles.length,
      sprites: this.liveSprites.length,
      spawned: this.spawned,
      dropped: this.dropped,
      peakParticles: this.peak,
      poolCreated: created,
    };
  }

  /** Pre-creates pool objects so the first big fight allocates nothing (call while loading). */
  prewarm(particles = 120, sprites = 16): void {
    for (const shape of ['spark', 'shard', 'glow'] as const) this.particlePool('add', shape).prewarm(Math.floor(particles / 3));
    this.particlePool('normal', 'dust').prewarm(Math.floor(particles / 6));
    this.particlePool('normal', 'ink').prewarm(Math.floor(particles / 6));
    this.spritePool.prewarm(sprites);
  }

  /** Starts an effect. Returns false when the definition is unknown or the budget dropped it entirely. */
  spawn(id: string, at: VfxSpawn): boolean {
    if (this.destroyed) return false;
    const def = this.defs[id];
    if (!def) return false;
    let made = false;
    switch (def.kind) {
      case 'particles':
        made = this.spawnParticles(def, at);
        break;
      case 'arc':
        made = this.spawnArc(def, at);
        break;
      case 'flash':
        made = this.spawnFlash(def, at);
        break;
    }
    if (made) this.spawned++;
    else this.dropped++;
    return made;
  }

  /** Real-time step. */
  update(dt: number): void {
    if (this.destroyed || dt <= 0) return;
    for (let i = this.liveParticles.length - 1; i >= 0; i--) {
      const fx = this.liveParticles[i] as FxParticle;
      if (!stepParticle(fx.motion, dt)) {
        this.killParticleAt(i);
        continue;
      }
      const m = fx.motion;
      const p = fx.particle;
      p.x = m.x;
      p.y = -m.y;
      p.scaleX = p.scaleY = particleSize(m) / fx.texW;
      p.rotation = -m.rotation;
      p.alpha = particleAlpha(m);
    }
    for (let i = this.liveSprites.length - 1; i >= 0; i--) {
      const fx = this.liveSprites[i] as FxSprite;
      fx.age += dt;
      if (fx.age >= fx.life) {
        this.killSpriteAt(i);
        continue;
      }
      this.applySprite(fx);
    }
  }

  /** Removes every live effect (room change, tests). */
  clear(): void {
    for (let i = this.liveParticles.length - 1; i >= 0; i--) this.killParticleAt(i);
    for (let i = this.liveSprites.length - 1; i >= 0; i--) this.killSpriteAt(i);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clear();
    this.destroyed = true;
    for (const pool of this.particlePools.values()) pool.dispose();
    this.spritePool.dispose((fx) => fx.sprite.destroy());
    this.containers.add.destroy({ children: true });
    this.containers.normal.destroy({ children: true });
  }

  // ------------------------------------------------------------------------------------------------ particles

  private particlePool(blend: VfxBlend, shape: VfxShape): Pool<FxParticle> {
    const key = `${blend}:${shape}`;
    let pool = this.particlePools.get(key);
    if (!pool) {
      const container = this.containers[blend];
      const texture = this.atlas.frames[shape];
      const texW = this.atlas.widthPx[shape];
      const created: Pool<FxParticle> = new Pool<FxParticle>(
        () => ({
          particle: new Particle({ texture, anchorX: 0.5, anchorY: 0.5 }),
          motion: createParticleMotion(),
          pool: created,
          container,
          shape,
          priority: 0,
          texW,
        }),
        () => {},
        this.options.particleBudget,
      );
      pool = created;
      this.particlePools.set(key, pool);
    }
    return pool;
  }

  private spawnParticles(def: ParticleVfx, at: VfxSpawn): boolean {
    let n = burstCount(def, this.rng, at.scale ?? 1);
    if (n <= 0) return false;
    // budget governor: make room by dropping the lowest-priority old particles, then trim the burst
    const free = this.options.particleBudget - this.liveParticles.length;
    if (n > free) this.evict(n - free, def.priority);
    n = Math.min(n, this.options.particleBudget - this.liveParticles.length);
    if (n <= 0) return false;
    const pool = this.particlePool(def.blend, def.shape);
    let made = 0;
    for (let i = 0; i < n; i++) {
      const fx = pool.acquire();
      if (!fx) break;
      initParticle(def, at, this.rng, this.accent, fx.motion);
      fx.priority = def.priority;
      const p = fx.particle;
      p.tint = fx.motion.tint;
      p.x = fx.motion.x;
      p.y = -fx.motion.y;
      p.scaleX = p.scaleY = fx.motion.size0 / fx.texW;
      p.rotation = -fx.motion.rotation;
      p.alpha = fx.motion.alpha0;
      fx.container.addParticle(p);
      this.liveParticles.push(fx);
      made++;
    }
    if (this.liveParticles.length > this.peak) this.peak = this.liveParticles.length;
    return made > 0;
  }

  /** Frees `need` particles that are less important than `priority`, oldest first. */
  private evict(need: number, priority: number): void {
    let freed = 0;
    for (let i = 0; i < this.liveParticles.length && freed < need; ) {
      if ((this.liveParticles[i] as FxParticle).priority < priority) {
        this.killParticleAt(i);
        freed++;
      } else i++;
    }
  }

  private killParticleAt(i: number): void {
    const fx = this.liveParticles[i] as FxParticle;
    // swap-remove keeps the order of the survivors mostly intact and costs O(1)
    const last = this.liveParticles.pop() as FxParticle;
    if (last !== fx) this.liveParticles[i] = last;
    fx.container.removeParticle(fx.particle);
    fx.pool.release(fx);
  }

  // ---------------------------------------------------------------------------------------------------- sprites

  private acquireSprite(priority: number): FxSprite | null {
    if (this.liveSprites.length >= this.options.spriteBudget) {
      // drop the oldest effect that is less important than the new one
      for (let i = 0; i < this.liveSprites.length; i++) {
        if ((this.liveSprites[i] as FxSprite).priority < priority) {
          this.killSpriteAt(i);
          break;
        }
      }
    }
    const fx = this.spritePool.acquire();
    if (!fx) return null;
    fx.priority = priority;
    fx.age = 0;
    this.liveSprites.push(fx);
    return fx;
  }

  private killSpriteAt(i: number): void {
    const fx = this.liveSprites[i] as FxSprite;
    const last = this.liveSprites.pop() as FxSprite;
    if (last !== fx) this.liveSprites[i] = last;
    this.spritePool.release(fx);
  }

  private spawnArc(def: ArcVfx, at: VfxSpawn): boolean {
    const pose = arcPose(def, at, this.pose);
    const frame = this.atlas.frames.arc;
    let made = false;
    for (let k = 0; k < def.layers.length && k < MAX_PER_SPAWN_SPRITES; k++) {
      const layer = def.layers[k]!;
      const fx = this.acquireSprite(def.priority);
      if (!fx) break;
      fx.sprite.texture = frame;
      fx.sprite.anchor.set(0.63, 0.5);
      fx.sprite.tint = resolveColor(def.palette, layer.role, this.accent);
      fx.texW = this.atlas.widthPx.arc;
      fx.texH = frame.height;
      fx.life = def.life;
      fx.x = pose.x;
      fx.y = pose.y;
      fx.width0 = pose.width * layer.scale * def.scale[0];
      fx.width1 = pose.width * layer.scale * def.scale[1];
      fx.height0 = pose.height * layer.scale * def.scale[0];
      fx.height1 = pose.height * layer.scale * def.scale[1];
      fx.alpha0 = def.alpha[0] * layer.alpha;
      fx.alpha1 = def.alpha[1] * layer.alpha;
      fx.rot0 = pose.rotation0;
      fx.rot1 = pose.rotation1;
      fx.flip = pose.flip;
      fx.sprite.visible = true;
      this.applySprite(fx);
      made = true;
    }
    return made;
  }

  private spawnFlash(def: FlashVfx, at: VfxSpawn): boolean {
    const fx = this.acquireSprite(def.priority);
    if (!fx) return false;
    const frame = this.atlas.frames[def.shape];
    const scale = at.scale ?? 1;
    const aspect = def.aspect ?? 1;
    fx.sprite.texture = frame;
    fx.sprite.anchor.set(0.5, 0.5);
    fx.sprite.tint = resolveColor(def.palette, def.role, this.accent);
    fx.texW = this.atlas.widthPx[def.shape];
    fx.texH = frame.height;
    fx.life = def.life;
    fx.x = at.x;
    fx.y = at.y;
    fx.width0 = def.size[0] * scale;
    fx.width1 = def.size[1] * scale;
    fx.height0 = fx.width0 / aspect;
    fx.height1 = fx.width1 / aspect;
    fx.alpha0 = def.alpha[0];
    fx.alpha1 = def.alpha[1];
    fx.rot0 = fx.rot1 = 0;
    fx.flip = at.facing;
    fx.sprite.visible = true;
    this.applySprite(fx);
    return true;
  }

  private applySprite(fx: FxSprite): void {
    const t = lifeFraction(fx.age, fx.life);
    const s = fx.sprite;
    const w = fx.width0 + (fx.width1 - fx.width0) * t;
    const h = fx.height0 + (fx.height1 - fx.height0) * t;
    s.position.set(fx.x, -fx.y);
    s.scale.set((fx.flip * w) / fx.texW, h / fx.texH);
    s.rotation = fx.rot0 + (fx.rot1 - fx.rot0) * t;
    s.alpha = fx.alpha0 + (fx.alpha1 - fx.alpha0) * t * t;
  }
}
