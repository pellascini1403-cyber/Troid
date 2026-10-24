import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { HitInfo } from '@/combat/Combatant';
import { attackRect } from '@/combat/hitboxGeometry';
import { approach } from '@/core/math';
import { StateMachine, type StateHooks } from '@/core/stateMachine';
import { TICK_SECONDS } from '@/core/time';
import type { SimServices } from '@/gameplay/SimServices';
import type { AnimPhase, AnimState } from '@/presentation/vocabulary';
import type { Enemy } from '../Enemy';
import type { EnemyBrain } from '../EnemyBrain';
import { floorAhead, sightBlocked } from '../senses';

/** What the view is told of the current state: the logical animation, the part of an action it is, and how far through it. */
export interface BrainPose {
  anim: AnimState;
  phase?: AnimPhase;
  /** 0 … 1 through the current timed state; omitted: 0. */
  t?: number;
  opacity?: number;
}

export type Hooks = StateHooks<BaseBrain, string>;

/** Below this horizontal gap (m) an enemy does not turn around to face the player (no jitter when directly above or below). */
const FACING_DEAD_ZONE = 0.15;
const EYE_HEIGHT = 0.6;
const TORSO_HEIGHT = 0.5;

/**
 * What every ENEMY brain after the Ink Slime shares (docs/PROMPT21-LOG.md): the machine of states with its `hurt` and `dead`, the senses, the few motions a creature needs and the hitbox of a blow. A brain is the states it adds
 * and the numbers they read; the rules of the tick are the slime's (docs/GAME-SPEC-2D.md §15.1) and they are kept: a state of D ticks occupies D ticks, counting the one it was entered in as the first; the brain
 * draws every random choice from the simulation `Rng`, sees the player only through `PlayerTarget`, never touches a view — it publishes the logical animation (`enemy.view`) — and stops hunting the moment the player is down.
 */
export abstract class BaseBrain implements EnemyBrain {
  protected fsm!: StateMachine<BaseBrain, string>;
  /** The targets the current blow has already hit (one hit per target per blow). */
  protected hitSet = new Set<string>();
  private stun = 0;

  constructor(
    protected readonly enemy: Enemy,
    protected readonly sim: SimServices,
    /** m/s² pulling it down; 0 for a creature that flies. A body that dies falls whatever it did in life. */
    protected readonly gravity: number,
  ) {}

  get state(): string {
    return this.fsm.current;
  }
  get stateTicks(): number {
    return this.fsm.ticksInState;
  }
  /** Nothing can hurt it in this state (a puddle that sleeps, a body that has vanished). The combat system leaves it alone. */
  get untouchable(): boolean {
    return false;
  }
  /** A blow that lands: `'blocked'` turns it away (a shield, an armoured shell). The enemy has not been hurt. */
  guard(_hit: HitInfo): 'blocked' | null {
    return null;
  }

  /** Called once by the subclass, at the end of its constructor: the states it adds, and the one it begins in. `hurt` and `dead` are added here. */
  protected start(states: Record<string, Hooks>, initial: string): void {
    const e = this.enemy;
    this.fsm = new StateMachine<BaseBrain, string>(
      this,
      {
        ...states,
        hurt: {
          update: (_, t) => {
            this.slowDown();
            if (t + 1 >= this.stun) {
              this.faceTarget(true);
              this.fsm.go(this.afterHurt());
            }
          },
        },
        dead: {
          enter: () => this.onDeath(),
          update: (_, t) => {
            this.slowDown();
            if (t + 1 >= e.def.death.ticks) e.expired = true;
          },
        },
      },
      initial,
    );
    this.fsm.onChange = () => this.enemy.view.animSerial++;
    this.publish();
  }

  update(sim: SimServices): void {
    this.fsm.update();
    this.enemy.integrate(sim, this.fsm.current === 'dead' ? Math.max(this.gravity, 30) : this.fsm.current === 'hurt' && this.gravity === 0 ? 14 : this.gravity);
    this.afterMove(sim);
    this.publish();
  }

  /** After the body has moved: the place for a hitbox that is submitted every tick it exists. */
  protected afterMove(_sim: SimServices): void {}

  /** Where a creature goes when its stun ends. */
  protected afterHurt(): string {
    return this.sees(14, 6) ? this.engagedState() : this.restState();
  }
  /** The state of a creature that has noticed the player, and the one it rests in. */
  protected abstract engagedState(): string;
  protected abstract restState(): string;
  /** A creature is hurt unless it says it is not (an armoured state keeps going through a blow). */
  protected staggers(): boolean {
    return true;
  }
  /** The moment the body gives up (hooks for what dying does: a swarm that comes apart). */
  protected onDeath(): void {}
  /** The animation of the current state (`hurt` and `dead` are the base's). */
  protected abstract pose(state: string, t: number): BrainPose;

  onHit(hit: HitInfo, killed: boolean): void {
    const e = this.enemy;
    const scale = e.def.hurt.knockbackScale;
    if (killed) {
      e.body.vx = hit.direction * hit.knockbackX * scale;
      e.body.vy = hit.knockbackY * scale;
      this.fsm.go('dead', true);
    } else if (this.staggers()) {
      e.body.vx = hit.direction * hit.knockbackX * scale;
      e.body.vy = hit.knockbackY * scale;
      this.stun = hit.stun > 0 ? hit.stun : e.def.hurt.stun;
      this.fsm.go('hurt', true);
    }
    this.publish();
  }

  // ------------------------------------------------------------------------------------------------ perception

  protected get target() {
    return this.sim.player;
  }
  protected dx(): number {
    return this.sim.player.body.x - this.enemy.body.x;
  }
  protected dy(): number {
    return this.sim.player.body.y - this.enemy.body.y;
  }

  /** Is the player alive, within `range` m across and `height` m up or down, and (unless `los` is off) in sight? */
  protected sees(range: number, height: number, los = true): boolean {
    const pl = this.sim.player;
    if (pl.health.dead) return false;
    const b = this.enemy.body;
    if (Math.abs(pl.body.x - b.x) > range || Math.abs(pl.body.y - b.y) > height) return false;
    if (!los) return true;
    return !sightBlocked(this.sim.collision, b.x, b.y + b.height * EYE_HEIGHT, pl.body.x, pl.body.y + pl.body.height * TORSO_HEIGHT);
  }

  protected faceTarget(force = false): void {
    const dx = this.dx();
    if (force || Math.abs(dx) > FACING_DEAD_ZONE) this.enemy.facing = dx >= 0 ? 1 : -1;
  }

  /** The player is on the side the creature does NOT face. */
  protected targetBehind(): boolean {
    return this.dx() * this.enemy.facing < -FACING_DEAD_ZONE;
  }

  // --------------------------------------------------------------------------------------------------- motion

  protected slowDown(friction = 30): void {
    const b = this.enemy.body;
    if (b.grounded || this.gravity === 0) b.vx = approach(b.vx, 0, friction * TICK_SECONDS);
    if (this.gravity === 0 && this.fsm.current !== 'dead' && this.fsm.current !== 'hurt') b.vy = approach(b.vy, 0, friction * TICK_SECONDS);
  }

  protected stop(): void {
    this.enemy.body.vx = 0;
    if (this.gravity === 0) this.enemy.body.vy = 0;
  }

  /** Slides toward where it faces, up to `speed`, but never off a ledge (unless `ledges` is off). */
  protected walk(speed: number, accel: number, ledges = true): void {
    const e = this.enemy;
    const b = e.body;
    if (!b.grounded) return;
    b.vx = ledges && !floorAhead(this.sim.collision, b, e.facing) ? 0 : approach(b.vx, e.facing * speed, accel * TICK_SECONDS);
  }

  /** Flies toward a point at up to `speed` (a creature with no gravity): returns true when it is there. */
  protected flyTo(x: number, y: number, speed: number, accel = 30): boolean {
    const b = this.enemy.body;
    const dx = x - b.x;
    const dy = y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.12) {
      b.vx = approach(b.vx, 0, accel * TICK_SECONDS * 2);
      b.vy = approach(b.vy, 0, accel * TICK_SECONDS * 2);
      return true;
    }
    const s = Math.min(speed, d * 8);
    b.vx = approach(b.vx, (dx / d) * s, accel * TICK_SECONDS);
    b.vy = approach(b.vy, (dy / d) * s, accel * TICK_SECONDS);
    return false;
  }

  /** The leg of a patrol is over at a wall, at the edge of its range or at a ledge. */
  protected legEnded(range: number): boolean {
    const e = this.enemy;
    const b = e.body;
    if (e.facing > 0 ? b.hitRight : b.hitLeft) return true;
    if ((b.x - e.home.x) * e.facing >= range) return true;
    return !floorAhead(this.sim.collision, b, e.facing);
  }

  // ------------------------------------------------------------------------------------------------- blows

  protected newBlow(): void {
    this.hitSet = new Set();
  }

  /** The hitbox of an attack of this enemy, for this tick, at the place the enemy stands (a contact blow or a swing). */
  protected submit(a: AttackDefinition, facing = this.enemy.facing): void {
    const e = this.enemy;
    this.sim.combat.submit({
      ownerId: e.id,
      team: 'enemy',
      rect: attackRect(a, e.body.x, e.body.y, facing, { x0: 0, y0: 0, x1: 0, y1: 0 }),
      attackId: a.id,
      damage: a.damage,
      knockback: { x: a.knockback.x, y: a.knockback.y },
      stun: a.stun,
      hitStop: a.hitStop,
      shake: a.shake,
      facing,
      alreadyHit: this.hitSet,
    });
  }

  protected attackOf(id: string): AttackDefinition {
    const a = this.enemy.def.attacks[id];
    if (!a) throw new Error(`enemy "${this.enemy.def.id}" has no attack "${id}"`);
    return a;
  }

  protected telegraph(a: AttackDefinition): void {
    const e = this.enemy;
    this.sim.bus.emit('enemy:telegraph', { id: e.id, defId: e.def.id, x: e.body.x, y: e.body.y, facing: e.facing, ticks: a.startup, attack: a.id });
  }
  protected struck(a: AttackDefinition): void {
    const e = this.enemy;
    this.sim.bus.emit('enemy:struck', { id: e.id, defId: e.def.id, x: e.body.x, y: e.body.y, facing: e.facing, attack: a.id });
  }
  protected alerted(): void {
    const e = this.enemy;
    this.sim.bus.emit('enemy:alerted', { id: e.id, defId: e.def.id, x: e.body.x, y: e.body.y });
  }

  // ----------------------------------------------------------------------------------------------- the view

  private publish(): void {
    const v = this.enemy.view;
    const t = this.fsm.ticksInState;
    v.phase = 'none';
    v.phaseT = 0;
    v.animSpeed = 1;
    v.animDuration = 0;
    v.opacity = 1;
    const s = this.fsm.current;
    if (s === 'hurt') {
      v.anim = 'hurt';
      v.phaseT = Math.min(1, t / Math.max(1, this.stun));
      return;
    }
    if (s === 'dead') {
      v.anim = 'death';
      v.phaseT = Math.min(1, t / this.enemy.def.death.ticks);
      v.opacity = 1 - v.phaseT * v.phaseT;
      return;
    }
    const p = this.pose(s, t);
    v.anim = p.anim;
    v.phase = p.phase ?? 'none';
    v.phaseT = p.t ?? 0;
    v.opacity = p.opacity ?? 1;
  }
}
