import type { Combatant, HitInfo, HitOutcome, Hurtbox, Team } from '@/combat/Combatant';
import { Health } from '@/combat/Health';
import { Actor } from '@/gameplay/Actor';
import type { SimEntity } from '@/gameplay/SimEntity';
import type { SimServices } from '@/gameplay/SimServices';
import { TICK_SECONDS } from '@/core/time';

export interface TrainingDummyOptions {
  x: number;
  y: number;
  health?: number;
  /** `enemy` (default) or `neutral` (a breakable wall / switch: the player hits it, enemies never do). */
  team?: Team;
  facing?: 1 | -1;
  halfWidth?: number;
  height?: number;
}

const FLASH_TICKS = 6;
const DEATH_TICKS = 24;
const GRAVITY = 52;
const FRICTION = 30;

/**
 * A target that does nothing: it has a body, a hurtbox and health, takes knockback and dies. It is the simplest
 * possible `SimEntity` + `Combatant`, used to test combat end to end before a real enemy exists and as the model the
 * Ink Slime builds on (docs/PROMPT4-LOG.md S6). It never attacks.
 */
export class TrainingDummy extends Actor implements SimEntity, Combatant {
  readonly kind = 'dummy';
  readonly health: Health;
  expired = false;
  /** Hits received, for tests and the debug overlay. */
  hits = 0;
  private flashTicks = 0;
  private deadTicks = -1;
  private sim: SimServices | null = null;

  constructor(id: string, opts: TrainingDummyOptions) {
    super(id, opts.team ?? 'enemy', opts.halfWidth ?? 0.4, opts.height ?? 1.4);
    this.health = new Health(opts.health ?? 5);
    this.teleport(opts.x, opts.y, opts.facing ?? -1);
  }

  /** Dummies can always be hit again: the attacker's hit-once set is what prevents multi-hits from one swing. */
  get invulnerable(): boolean {
    return false;
  }

  onSpawn(sim: SimServices): void {
    this.sim = sim;
    sim.combat.add(this);
    sim.collision.probeGround(this.body);
  }

  dispose(sim: SimServices): void {
    sim.combat.remove(this);
  }

  tick(sim: SimServices): void {
    this.beginTick();
    const b = this.body;
    if (this.deadTicks >= 0) {
      if (++this.deadTicks >= DEATH_TICKS) this.expired = true;
      this.view.opacity = Math.max(0, 1 - this.deadTicks / DEATH_TICKS);
    }
    // knockback bleeds off on the ground; gravity always applies
    if (b.grounded) b.vx = Math.abs(b.vx) <= FRICTION * TICK_SECONDS ? 0 : b.vx - Math.sign(b.vx) * FRICTION * TICK_SECONDS;
    b.vy = Math.max(b.vy - GRAVITY * TICK_SECONDS, -26);
    sim.collision.moveBody(b, b.vx * TICK_SECONDS, b.vy * TICK_SECONDS);
    if (this.flashTicks > 0) this.flashTicks--;
    this.syncView();
    this.view.flash = this.flashTicks / FLASH_TICKS;
    this.view.anim = this.deadTicks >= 0 ? 'death' : this.flashTicks > 0 ? 'hurt' : 'idle';
  }

  collectHurtboxes(out: Hurtbox[]): void {
    const b = this.body;
    out.push({ rect: { x0: b.x - b.halfW, x1: b.x + b.halfW, y0: b.y, y1: b.y + b.height }, multiplier: 1 });
  }

  receiveHit(hit: HitInfo): HitOutcome {
    if (this.health.dead) return 'ignored';
    this.health.damage(hit.damage);
    this.hits++;
    this.body.vx = hit.direction * hit.knockbackX;
    this.body.vy = hit.knockbackY;
    this.flashTicks = FLASH_TICKS;
    if (this.health.dead) {
      this.deadTicks = 0;
      this.sim?.bus.emit('actor:died', { id: this.id, team: this.team, x: this.body.x, y: this.body.y });
    }
    return 'hit';
  }
}
