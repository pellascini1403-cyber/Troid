import type { AttackDefinition } from '@/combat/AttackDefinition';
import type { HitInfo } from '@/combat/Combatant';
import { attackRect } from '@/combat/hitboxGeometry';
import { approach } from '@/core/math';
import { StateMachine, type StateHooks } from '@/core/stateMachine';
import { TICK_SECONDS } from '@/core/time';
import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import type { EnemyBrain } from '../EnemyBrain';
import type { SlimeParams } from '../EnemyDefinition';
import { floorAhead, sightBlocked } from '../senses';

export type SlimeState = 'idle' | 'patrol' | 'detect' | 'approach' | 'telegraph' | 'attack' | 'recover' | 'hurt' | 'dead';

/** Below this horizontal gap (m) it does not turn around to face the player (no jitter when directly above or below). */
const FACING_DEAD_ZONE = 0.15;
/** Below this speed (m/s) a chasing slime reads as standing still. */
const MOVING_SPEED = 0.3;
/** Height of its "eyes" above its feet, as a fraction of its body; and of the player's torso, as a fraction of theirs. */
const EYE_HEIGHT = 0.6;
const TORSO_HEIGHT = 0.5;

/**
 * The Ink Slime's brain (docs/GAME-SPEC-2D.md §15.1): `idle ⇄ patrol → detect → approach → telegraph → attack →
 * recover → (approach | idle)`, with `hurt` and `dead` reachable from anywhere.
 *
 * The tick semantics that tests and animation rely on: a state with a duration of D occupies exactly D simulated
 * ticks, counting the tick it was entered as the first. So the wind-up of 24 is the 24 ticks BEFORE the first active
 * tick of the lunge, the lunge's hitbox exists on exactly 10 ticks, and the recovery lasts 36. (A state's update runs
 * once per tick with `t` = ticks already spent in it, so a state of D ticks hands over in the update where `t + 1 >= D`.)
 *
 * It sees the player only through `PlayerTarget`; every random choice (how long it stands still) comes from the
 * simulation `Rng`; it stops hunting the moment the player is dead ("enemies stop attacking", GAME-SPEC-2D §9.2).
 */
export class SlimeBrain implements EnemyBrain {
  private readonly fsm: StateMachine<SlimeBrain, SlimeState>;
  private readonly attack: AttackDefinition;
  /** Ticks to stand still in the current `idle`. */
  private idleFor = 0;
  /** Ticks of the current stun. */
  private stun = 0;
  /** The targets the current lunge has already hit (one hit per target per attack instance). */
  private alreadyHit = new Set<string>();

  constructor(
    private readonly enemy: Enemy,
    private readonly sim: SimServices,
    private readonly params: SlimeParams,
  ) {
    const attack = enemy.def.attacks[params.attack];
    if (!attack) throw new Error(`enemy "${enemy.def.id}" has no attack "${params.attack}"`);
    this.attack = attack;
    this.fsm = new StateMachine<SlimeBrain, SlimeState>(this, this.states(), 'idle');
    this.fsm.onChange = () => this.enemy.view.animSerial++;
    this.publish();
  }

  get state(): SlimeState {
    return this.fsm.current;
  }
  get stateTicks(): number {
    return this.fsm.ticksInState;
  }

  update(sim: SimServices): void {
    this.fsm.update();
    this.enemy.integrate(sim, this.params.gravity);
    if (this.fsm.current === 'attack') this.submitHitbox(sim);
    this.publish();
  }

  onHit(hit: HitInfo, killed: boolean): void {
    const e = this.enemy;
    const scale = e.def.hurt.knockbackScale;
    e.body.vx = hit.direction * hit.knockbackX * scale;
    e.body.vy = hit.knockbackY * scale;
    if (killed) {
      this.fsm.go('dead', true);
    } else {
      this.stun = hit.stun > 0 ? hit.stun : e.def.hurt.stun;
      this.fsm.go('hurt', true);
    }
    this.publish();
  }

  // ------------------------------------------------------------------------------------------------- the states

  private states(): Record<SlimeState, StateHooks<SlimeBrain, SlimeState>> {
    const p = this.params;
    const e = this.enemy;
    const go = (s: SlimeState): void => this.fsm.go(s);
    return {
      idle: {
        enter: () => {
          this.stop();
          this.idleFor = this.sim.rng.int(p.idleTicks[0], p.idleTicks[1] + 1);
        },
        update: (_, t) => {
          this.slowDown();
          if (this.sees(p.detectRange)) return go('detect');
          if (t >= this.idleFor) go('patrol');
        },
      },
      patrol: {
        // after a chase it may stand far from home: the first leg goes back toward it
        enter: () => {
          const off = e.body.x - e.home.x;
          if (Math.abs(off) >= p.patrolRange) e.facing = off > 0 ? -1 : 1;
        },
        update: () => {
          if (this.sees(p.detectRange)) return go('detect');
          if (this.legEnded()) {
            e.facing = e.facing > 0 ? -1 : 1;
            return go('idle');
          }
          this.walk(p.patrolSpeed, Infinity);
        },
      },
      detect: {
        enter: () => {
          this.stop();
          this.faceTarget(true);
          this.sim.bus.emit('enemy:alerted', { id: e.id, defId: e.def.id, x: e.body.x, y: e.body.y });
        },
        update: (_, t) => {
          this.slowDown();
          if (!this.sees(p.loseRange)) return go('idle');
          this.faceTarget();
          if (t + 1 >= p.alertTicks) go('approach');
        },
      },
      approach: {
        update: () => {
          if (!this.sees(p.loseRange)) return go('idle');
          this.faceTarget();
          if (this.inAttackReach()) return go('telegraph');
          this.walk(p.approachSpeed, p.approachAccel);
        },
      },
      telegraph: {
        enter: () => {
          this.stop();
          this.faceTarget(true);
          this.sim.bus.emit('enemy:telegraph', {
            id: e.id, defId: e.def.id, x: e.body.x, y: e.body.y, facing: e.facing, ticks: this.attack.startup,
          });
        },
        update: (_, t) => {
          // nobody left to hit: it gives up instead of winding up at a body that is already down
          if (this.sim.player.health.dead) return go('idle');
          this.slowDown();
          if (t + 1 >= this.attack.startup) go('attack');
        },
      },
      attack: {
        enter: () => {
          this.alreadyHit = new Set();
          const lunge = this.attack.lunge;
          e.body.vx = lunge ? e.facing * lunge.speed : 0;
        },
        update: (_, t) => {
          const lunge = this.attack.lunge;
          if (lunge && t < lunge.ticks) e.body.vx = e.facing * lunge.speed;
          if (t + 1 >= this.attack.active) go('recover');
        },
      },
      recover: {
        enter: () => this.stop(), // the lunge ends where it ends (≈ 1.5 m): it does not skate on
        update: (_, t) => {
          this.slowDown();
          if (t + 1 >= this.attack.recovery) go(this.afterAction());
        },
      },
      hurt: {
        update: (_, t) => {
          this.slowDown();
          if (t + 1 >= this.stun) {
            this.faceTarget(true);
            go(this.afterAction());
          }
        },
      },
      dead: {
        update: (_, t) => {
          this.slowDown();
          if (t + 1 >= e.def.death.ticks) e.expired = true;
        },
      },
    };
  }

  // ------------------------------------------------------------------------------------------------ perception

  /** Is the player alive, within `range` m horizontally and the vertical tolerance, and in sight? */
  private sees(range: number): boolean {
    const pl = this.sim.player;
    if (pl.health.dead) return false;
    const b = this.enemy.body;
    if (Math.abs(pl.body.x - b.x) > range || Math.abs(pl.body.y - b.y) > this.params.detectHeight) return false;
    if (!this.params.lineOfSight) return true;
    return !sightBlocked(this.sim.collision, b.x, b.y + b.height * EYE_HEIGHT, pl.body.x, pl.body.y + pl.body.height * TORSO_HEIGHT);
  }

  /** Close enough, level enough and standing on the ground: the slime winds up only at someone it can reach. */
  private inAttackReach(): boolean {
    const pl = this.sim.player;
    const b = this.enemy.body;
    return (
      b.grounded &&
      !pl.health.dead &&
      Math.abs(pl.body.x - b.x) <= this.params.attackRange &&
      Math.abs(pl.body.y - b.y) <= this.params.attackHeight
    );
  }

  private faceTarget(force = false): void {
    const dx = this.sim.player.body.x - this.enemy.body.x;
    if (force || Math.abs(dx) > FACING_DEAD_ZONE) this.enemy.facing = dx >= 0 ? 1 : -1;
  }

  /** Where it goes after an action: keep hunting if the player is still around, else rest. */
  private afterAction(): SlimeState {
    return this.sees(this.params.loseRange) ? 'approach' : 'idle';
  }

  // --------------------------------------------------------------------------------------------------- motion

  /** Ground friction: knockback bleeds off, the slime does not skate. */
  private slowDown(): void {
    const b = this.enemy.body;
    if (b.grounded) b.vx = approach(b.vx, 0, this.params.friction * TICK_SECONDS);
  }

  private stop(): void {
    this.enemy.body.vx = 0;
  }

  /** Slides toward where it faces (up to `speed`), but never off a ledge. */
  private walk(speed: number, accel: number): void {
    const e = this.enemy;
    const b = e.body;
    if (!b.grounded) return;
    b.vx = floorAhead(this.sim.collision, b, e.facing) ? approach(b.vx, e.facing * speed, accel * TICK_SECONDS) : 0;
  }

  /** The leg of the patrol is over at a wall, at the edge of its range or at a ledge. */
  private legEnded(): boolean {
    const e = this.enemy;
    const b = e.body;
    if (e.facing > 0 ? b.hitRight : b.hitLeft) return true;
    if ((b.x - e.home.x) * e.facing >= this.params.patrolRange) return true;
    return !floorAhead(this.sim.collision, b, e.facing);
  }

  private submitHitbox(sim: SimServices): void {
    const a = this.attack;
    const e = this.enemy;
    sim.combat.submit({
      ownerId: e.id,
      team: 'enemy',
      rect: attackRect(a, e.body.x, e.body.y, e.facing, { x0: 0, y0: 0, x1: 0, y1: 0 }),
      attackId: a.id,
      damage: a.damage,
      knockback: { x: a.knockback.x, y: a.knockback.y },
      stun: a.stun,
      hitStop: a.hitStop,
      shake: a.shake,
      facing: e.facing,
      alreadyHit: this.alreadyHit,
    });
  }

  /**
   * The logical animation, for any view. `phaseT` is the progress 0..1 through the CURRENT timed state (alert,
   * telegraph, lunge, recovery, stun, death); `phase` says which part of the attack it is, so a clip that declares
   * phases shows the blow exactly when the hitbox exists.
   */
  private publish(): void {
    const v = this.enemy.view;
    const t = this.fsm.ticksInState;
    const a = this.attack;
    v.phase = 'none';
    v.phaseT = 0;
    v.animSpeed = 1;
    v.animDuration = 0;
    v.opacity = 1;
    switch (this.fsm.current) {
      case 'idle':
        v.anim = 'idle';
        break;
      case 'patrol':
        v.anim = 'walk';
        break;
      case 'detect':
        v.anim = 'alert';
        v.phaseT = Math.min(1, t / this.params.alertTicks);
        break;
      case 'approach':
        v.anim = Math.abs(this.enemy.body.vx) > MOVING_SPEED ? 'run' : 'idle';
        break;
      case 'telegraph':
        v.anim = 'telegraph';
        v.phase = 'startup';
        v.phaseT = Math.min(1, t / a.startup);
        break;
      case 'attack':
        v.anim = 'attack';
        v.phase = 'active';
        v.phaseT = Math.min(1, t / a.active);
        break;
      case 'recover':
        v.anim = 'idle';
        v.phase = 'recovery';
        v.phaseT = Math.min(1, t / a.recovery);
        break;
      case 'hurt':
        v.anim = 'hurt';
        v.phaseT = Math.min(1, t / Math.max(1, this.stun));
        break;
      case 'dead':
        v.anim = 'death';
        v.phaseT = Math.min(1, t / this.enemy.def.death.ticks);
        v.opacity = 1 - v.phaseT * v.phaseT;
        break;
    }
  }
}
