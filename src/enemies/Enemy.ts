import type { Combatant, HitInfo, HitOutcome, Hurtbox } from '@/combat/Combatant';
import { Health } from '@/combat/Health';
import { attackRect } from '@/combat/hitboxGeometry';
import { TICK_SECONDS } from '@/core/time';
import { Actor } from '@/gameplay/Actor';
import type { SimEntity } from '@/gameplay/SimEntity';
import type { SimServices } from '@/gameplay/SimServices';
import { createBrain } from './archetypes';
import type { EnemyBrain } from './EnemyBrain';
import type { EnemyDefinition } from './EnemyDefinition';

export interface EnemySpawn {
  x: number;
  y: number;
  facing?: 1 | -1;
}

/** Fastest an enemy can fall (m/s). */
const TERMINAL_VELOCITY = 26;

/**
 * An enemy in the world: a `SimEntity` that is also a `Combatant` and an `Actor` (docs/ARCHITECTURE-2D.md §5.9). It
 * owns what every enemy has — a body, health, a hurtbox, a hit flash, a place to come home to — and delegates every
 * decision to its `EnemyBrain`, chosen by the archetype of its definition. Nothing here knows how it is drawn.
 */
export class Enemy extends Actor implements SimEntity, Combatant {
  readonly kind = 'enemy';
  readonly health: Health;
  /** Where it was placed: patrols are around it, and a chase ends by walking back to it. */
  readonly home: { x: number; y: number };
  /** The brain turns this on when the body is gone; the session removes the entity at the end of the tick. */
  expired = false;
  /** Hits received, for tests and the debug panel. */
  hits = 0;
  private brain: EnemyBrain | null = null;
  private sim: SimServices | null = null;
  private flashTicks = 0;
  private readonly box: Hurtbox = { rect: { x0: 0, y0: 0, x1: 0, y1: 0 }, multiplier: 1 };

  constructor(
    id: string,
    readonly def: EnemyDefinition,
    spawn: EnemySpawn,
  ) {
    super(id, 'enemy', def.body.halfWidth, def.body.height);
    this.health = new Health(def.health);
    this.home = { x: spawn.x, y: spawn.y };
    this.teleport(spawn.x, spawn.y, spawn.facing ?? -1);
  }

  /** The brain's current state (`'none'` before it joins the world). */
  get state(): string {
    return this.brain?.state ?? 'none';
  }
  get stateTicks(): number {
    return this.brain?.stateTicks ?? 0;
  }
  /** The body of a dead enemy cannot be hit again while it dissolves. */
  get invulnerable(): boolean {
    return this.health.dead;
  }

  onSpawn(sim: SimServices): void {
    this.sim = sim;
    sim.combat.add(this);
    sim.collision.probeGround(this.body);
    this.brain = createBrain(this, sim);
  }

  dispose(sim: SimServices): void {
    sim.combat.remove(this);
    this.brain = null;
    this.sim = null;
  }

  tick(sim: SimServices): void {
    this.beginTick();
    this.brain?.update(sim);
    if (this.flashTicks > 0) this.flashTicks--;
    this.view.flash = this.flashTicks / this.def.hurt.flashTicks;
    this.syncView();
  }

  collectHurtboxes(out: Hurtbox[]): void {
    const b = this.body;
    const regions = this.def.hurtboxes;
    if (!regions) {
      const r = this.box.rect;
      r.x0 = b.x - b.halfW;
      r.x1 = b.x + b.halfW;
      r.y0 = b.y;
      r.y1 = b.y + b.height;
      out.push(this.box);
      return;
    }
    for (const h of regions) {
      out.push({
        rect: attackRect({ hitbox: h }, b.x, b.y, this.facing, { x0: 0, y0: 0, x1: 0, y1: 0 }),
        multiplier: h.multiplier ?? 1,
        ...(h.part ? { part: h.part } : {}),
      });
    }
  }

  receiveHit(hit: HitInfo): HitOutcome {
    if (this.health.dead) return 'ignored';
    this.health.damage(hit.damage);
    this.hits++;
    // The blow lands after this tick's view was published and the hit-stop freezes the next ones: show it NOW.
    this.flashTicks = this.def.hurt.flashTicks;
    this.view.flash = 1;
    const killed = this.health.dead;
    this.brain?.onHit(hit, killed);
    if (killed) this.sim?.bus.emit('actor:died', { id: this.id, team: this.team, x: this.body.x, y: this.body.y });
    return 'hit';
  }

  /** Gravity and movement with collisions: brains call it once per tick, after deciding their velocities. */
  integrate(sim: SimServices, gravity: number): void {
    const b = this.body;
    b.vy = Math.max(b.vy - gravity * TICK_SECONDS, -TERMINAL_VELOCITY);
    sim.collision.moveBody(b, b.vx * TICK_SECONDS, b.vy * TICK_SECONDS);
  }
}
