import { Container, Particle, ParticleContainer, Sprite, type Texture } from 'pixi.js';
import type { VfxAtlas } from '@/assets/vfxAtlas';
import { Pool } from '@/core/pool';
import { Rng } from '@/core/rng';
import {
  arcPose,
  burstCount,
  createParticleMotion,
  initParticle,
  lifeFraction,
  paintedArcPose,
  particleAlpha,
  particleSize,
  resolveColor,
  stepParticle,
  type ArcPose,
  type ArcVfx,
  type FlashVfx,
  type FlipbookVfx,
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
  /** Additive layer BEHIND the actors (the light that stands behind someone). Without one, what is meant for it is drawn in front. */
  back?: Container;
}

/** The pools of sprite effects: one per place they are drawn in (the light, the ink, and the light behind). */
type SpriteLayer = 'add' | 'normal' | 'back';

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
  /** Effects not played because the art has not the sequence they are made of (nothing to do with the budget). */
  unplayed: number;
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

/** A pooled sprite effect (a slash arc layer, a flash, a ring, a trail puff, a picture of a sequence). */
interface FxSprite {
  readonly sprite: Sprite;
  readonly pool: Pool<FxSprite>;
  /** The pictures of a sequence it plays over its life (`null`: it is one still picture) and the one it shows now. */
  frames: readonly Texture[] | null;
  frame: number;
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
  flipY: 1 | -1;
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
  /** One pool of sprite effects per place: the light is additive, the ink is not (and it lives in its own layer, under the light), and some light stands behind the actors. */
  private readonly spritePools: Record<SpriteLayer, Pool<FxSprite>>;
  private readonly liveParticles: FxParticle[] = [];
  private readonly liveSprites: FxSprite[] = [];
  private readonly pose: ArcPose = { x: 0, y: 0, width: 0, height: 0, rotation0: 0, rotation1: 0, flip: 1, flipY: 1 };
  private spawned = 0;
  private dropped = 0;
  private unplayed = 0;
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
    const spritePool = (blend: VfxBlend, parent: Container): Pool<FxSprite> => {
      const created: Pool<FxSprite> = new Pool<FxSprite>(
        () => {
          const sprite = new Sprite(atlas.frames.glow);
          sprite.blendMode = blend;
          sprite.visible = false;
          parent.addChild(sprite);
          return { sprite, pool: created, frames: null, frame: 0, age: 0, life: 1, x: 0, y: 0, width0: 1, width1: 1, height0: 1, height1: 1, alpha0: 1, alpha1: 0, rot0: 0, rot1: 0, flip: 1, flipY: 1, priority: 0, texW: 1, texH: 1 };
        },
        (fx) => {
          fx.sprite.visible = false;
          fx.frames = null;
        },
        options.spriteBudget,
      );
      return created;
    };
    this.spritePools = { add: spritePool('add', layers.add), normal: spritePool('normal', layers.normal), back: spritePool('add', layers.back ?? layers.add) };
  }

  get stats(): VfxStats {
    let created = this.spritePools.add.created + this.spritePools.normal.created + this.spritePools.back.created;
    for (const p of this.particlePools.values()) created += p.created;
    return {
      particles: this.liveParticles.length,
      sprites: this.liveSprites.length,
      spawned: this.spawned,
      dropped: this.dropped,
      unplayed: this.unplayed,
      peakParticles: this.peak,
      poolCreated: created,
    };
  }

  /** Pre-creates pool objects so the first big fight allocates nothing (call while loading). */
  prewarm(particles = 120, sprites = 24): void {
    for (const shape of ['spark', 'shard', 'glow'] as const) this.particlePool('add', shape).prewarm(Math.floor(particles / 3));
    this.particlePool('normal', 'dust').prewarm(Math.floor(particles / 6));
    this.particlePool('normal', 'ink').prewarm(Math.floor(particles / 6));
    this.spritePools.add.prewarm(sprites);
    this.spritePools.normal.prewarm(Math.max(2, Math.floor(sprites / 4)));
    this.spritePools.back.prewarm(Math.max(2, Math.floor(sprites / 4)));
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
      case 'flipbook': {
        const played = this.spawnFlipbook(def, at);
        // the art has no such sequence: it is not played, and that is not the budget dropping it
        if (played === null) {
          this.unplayed++;
          return false;
        }
        made = played;
        break;
      }
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
    for (const pool of Object.values(this.spritePools)) pool.dispose((fx) => fx.sprite.destroy());
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

  private acquireSprite(priority: number, layer: SpriteLayer = 'add'): FxSprite | null {
    if (this.liveSprites.length >= this.options.spriteBudget) {
      // drop the oldest effect that is less important than the new one
      for (let i = 0; i < this.liveSprites.length; i++) {
        if ((this.liveSprites[i] as FxSprite).priority < priority) {
          this.killSpriteAt(i);
          break;
        }
      }
      // the screen is full of effects that matter as much: the new one is the one that waits (the budget is of all the places together, not of each pool)
      if (this.liveSprites.length >= this.options.spriteBudget) return null;
    }
    const fx = this.spritePools[layer].acquire();
    if (!fx) return null;
    fx.priority = priority;
    fx.age = 0;
    fx.frames = null;
    fx.frame = 0;
    fx.flipY = 1;
    this.liveSprites.push(fx);
    return fx;
  }

  private killSpriteAt(i: number): void {
    const fx = this.liveSprites[i] as FxSprite;
    const last = this.liveSprites.pop() as FxSprite;
    if (last !== fx) this.liveSprites[i] = last;
    fx.pool.release(fx);
  }

  private spawnArc(def: ArcVfx, at: VfxSpawn): boolean {
    // the cut the art painted, when it has BOTH of its sequences; the crescent otherwise
    const body = def.sequences ? this.atlas.sequences[def.sequences.core] : undefined;
    const edge = def.sequences ? this.atlas.sequences[def.sequences.hot] : undefined;
    const painted = body !== undefined && edge !== undefined;
    const pose = painted ? paintedArcPose(def, at, this.pose) : arcPose(def, at, this.pose);
    const frame = this.atlas.frames.arc;
    let made = false;
    for (let k = 0; k < def.layers.length && k < MAX_PER_SPAWN_SPRITES; k++) {
      const layer = def.layers[k]!;
      const fx = this.acquireSprite(def.priority);
      if (!fx) break;
      const seq = painted ? (layer.role === 'hot' ? edge : body) : undefined;
      if (seq) {
        fx.frames = seq.frames;
        fx.sprite.texture = seq.frames[0]!;
        fx.sprite.anchor.set(seq.pivot[0], seq.pivot[1]);
        fx.texW = seq.width;
        fx.texH = seq.height;
      } else {
        fx.sprite.texture = frame;
        fx.sprite.anchor.set(0.63, 0.5);
        fx.texW = this.atlas.widthPx.arc;
        fx.texH = this.atlas.heightPx.arc;
      }
      fx.sprite.tint = resolveColor(def.palette, layer.role, this.accent);
      fx.life = def.life;
      fx.x = pose.x;
      fx.y = pose.y;
      // the painted edge lies on the painted body (the crescent's inner "hot" line is smaller than it: a painted one is not), and its frames carry their own fade
      const scale = seq && layer.role === 'hot' ? 1 : layer.scale;
      const alpha = (seq && def.sequences?.alpha) || def.alpha;
      fx.width0 = pose.width * scale * def.scale[0];
      fx.width1 = pose.width * scale * def.scale[1];
      fx.height0 = pose.height * scale * def.scale[0];
      fx.height1 = pose.height * scale * def.scale[1];
      fx.alpha0 = alpha[0] * layer.alpha;
      fx.alpha1 = alpha[1] * layer.alpha;
      fx.rot0 = pose.rotation0;
      fx.rot1 = pose.rotation1;
      fx.flip = pose.flip;
      fx.flipY = pose.flipY;
      fx.sprite.visible = true;
      this.applySprite(fx);
      made = true;
    }
    return made;
  }

  private spawnFlash(def: FlashVfx, at: VfxSpawn): boolean {
    const fx = this.acquireSprite(def.priority, def.layer === 'back' ? 'back' : 'add');
    if (!fx) return false;
    const frame = this.atlas.frames[def.shape];
    const scale = at.scale ?? 1;
    const aspect = def.aspect ?? 1;
    fx.sprite.texture = frame;
    fx.sprite.anchor.set(0.5, 0.5);
    fx.sprite.tint = resolveColor(def.palette, def.role, this.accent);
    fx.texW = this.atlas.widthPx[def.shape];
    fx.texH = this.atlas.heightPx[def.shape];
    fx.life = def.life;
    fx.x = at.x + (def.offset ? def.offset[0] * at.facing : 0);
    fx.y = at.y + (def.offset ? def.offset[1] : 0);
    fx.width0 = def.size[0] * scale;
    fx.width1 = def.size[1] * scale;
    fx.height0 = fx.width0 / aspect;
    fx.height1 = fx.width1 / aspect;
    fx.alpha0 = def.alpha[0];
    fx.alpha1 = def.alpha[1];
    fx.rot0 = def.turn ? def.turn[0] : 0;
    fx.rot1 = def.turn ? def.turn[1] : 0;
    fx.flip = at.facing;
    fx.sprite.visible = true;
    this.applySprite(fx);
    return true;
  }

  /** A picture of a sequence the art painted, played over the life of the effect. `null` when the atlas has no such sequence (it is not played); `false` when the budget dropped it. */
  private spawnFlipbook(def: FlipbookVfx, at: VfxSpawn): boolean | null {
    const seq = this.atlas.sequences[def.sequence];
    if (!seq) return null;
    const fx = this.acquireSprite(def.priority, def.layer === 'back' ? 'back' : def.blend);
    if (!fx) return false;
    const scale = at.scale ?? 1;
    const aspect = seq.height / seq.width;
    fx.frames = seq.frames;
    fx.sprite.texture = seq.frames[0]!;
    fx.sprite.anchor.set(seq.pivot[0], seq.pivot[1]);
    fx.sprite.tint = resolveColor(def.palette, def.role, this.accent);
    fx.texW = seq.width;
    fx.texH = seq.height;
    fx.life = def.life;
    // the way it faces: as painted, mirrored by the facing, or mirrored and turned along the direction the spawn gives (a blow lands along the way it went)
    const dx = at.dirX ?? at.facing;
    const dy = at.dirY ?? 0;
    const aim = def.aim ?? 'none';
    fx.flip = aim === 'none' ? 1 : aim === 'facing' ? at.facing : dx >= 0 ? 1 : -1;
    const side = aim === 'none' ? 1 : fx.flip;
    fx.rot0 = fx.rot1 = aim === 'dir' ? -Math.atan2(dy, Math.abs(dx)) * side : 0;
    fx.x = at.x + (def.offset ? def.offset[0] * side : 0);
    fx.y = at.y + (def.offset ? def.offset[1] : 0);
    fx.width0 = def.size[0] * scale;
    fx.width1 = def.size[1] * scale;
    fx.height0 = fx.width0 * aspect;
    fx.height1 = fx.width1 * aspect;
    fx.alpha0 = def.alpha[0];
    fx.alpha1 = def.alpha[1];
    fx.sprite.visible = true;
    this.applySprite(fx);
    return true;
  }

  private applySprite(fx: FxSprite): void {
    const t = lifeFraction(fx.age, fx.life);
    const s = fx.sprite;
    const w = fx.width0 + (fx.width1 - fx.width0) * t;
    const h = fx.height0 + (fx.height1 - fx.height0) * t;
    // a sequence shows the picture its time has come to: the last one is held to the end of the life
    if (fx.frames) {
      const at = Math.min(fx.frames.length - 1, Math.floor(t * fx.frames.length));
      if (at !== fx.frame) {
        fx.frame = at;
        s.texture = fx.frames[at]!;
      }
    }
    s.position.set(fx.x, -fx.y);
    s.scale.set((fx.flip * w) / fx.texW, (fx.flipY * h) / fx.texH);
    s.rotation = fx.rot0 + (fx.rot1 - fx.rot0) * t;
    s.alpha = fx.alpha0 + (fx.alpha1 - fx.alpha0) * t * t;
  }
}
