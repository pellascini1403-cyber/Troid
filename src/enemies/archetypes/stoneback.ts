import type { HitInfo } from '@/combat/Combatant';
import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Stoneback's numbers: a slow walker behind a slab of stone that turns away every blow from the front. */
export interface StonebackParams {
  patrolSpeed: number;
  approachSpeed: number;
  patrolRange: number;
  idleTicks: readonly [min: number, max: number];
  detectRange: number;
  detectHeight: number;
  alertTicks: number;
  attackRange: number;
  attackHeight: number;
  /** Ticks the hero has to be behind it before it turns around. */
  turnTicks: number;
  /** The blows that go through the shield whatever side they come from (the dive and the shockwave of the Ground Slam). */
  pierces: readonly string[];
  /** The smash: `startup` is the lift (the telegraph), `active` the fall, `recovery` the time it is stuck with its guard down. */
  attack: string;
  friction: number;
  gravity: number;
}

export type StonebackState = 'idle' | 'patrol' | 'alert' | 'approach' | 'windup' | 'smash' | 'recover';

/**
 * `idle ⇄ patrol → alert → approach → windup → smash → recover`. The shield faces the way it looks: a blow from the front is turned away (`enemy:blocked`) — the sword, the bolt — except the
 * Ground Slam, which comes from above. It turns around slowly, so the hero gets behind it by jumping over; and when it smashes it puts its guard down, which is the opening.
 */
export class StonebackBrain extends BaseBrain {
  private idleFor = 0;
  private behind = 0;

  constructor(enemy: Enemy, sim: SimServices, private readonly p: StonebackParams) {
    super(enemy, sim, p.gravity);
    const a = this.attackOf(p.attack);
    const e = enemy;
    this.start(
      {
        idle: {
          enter: () => {
            this.stop();
            this.idleFor = sim.rng.int(p.idleTicks[0], p.idleTicks[1] + 1);
          },
          update: (_, t) => {
            this.slowDown();
            if (this.sees(p.detectRange, p.detectHeight)) return this.fsm.go('alert');
            if (t >= this.idleFor) this.fsm.go('patrol');
          },
        },
        patrol: {
          update: () => {
            if (this.sees(p.detectRange, p.detectHeight)) return this.fsm.go('alert');
            if (this.legEnded(p.patrolRange)) {
              e.facing = e.facing > 0 ? -1 : 1;
              return this.fsm.go('idle');
            }
            this.walk(p.patrolSpeed, 30);
          },
        },
        alert: {
          enter: () => {
            this.stop();
            this.faceTarget(true);
            this.alerted();
          },
          update: (_, t) => {
            this.slowDown();
            if (!this.sees(p.detectRange * 1.4, p.detectHeight)) return this.fsm.go('idle');
            if (t + 1 >= p.alertTicks) this.fsm.go('approach');
          },
        },
        approach: {
          update: () => {
            if (!this.sees(p.detectRange * 1.4, p.detectHeight)) return this.fsm.go('idle');
            this.track();
            if (this.inReach()) return this.fsm.go('windup');
            this.walk(p.approachSpeed, 30);
          },
        },
        windup: {
          enter: () => {
            this.stop();
            this.telegraph(a);
          },
          update: (_, t) => {
            if (sim.player.health.dead) return this.fsm.go('idle');
            this.slowDown();
            if (t + 1 >= a.startup) this.fsm.go('smash');
          },
        },
        smash: {
          enter: () => {
            this.newBlow();
            this.struck(a);
          },
          update: (_, t) => {
            if (t + 1 >= a.active) this.fsm.go('recover');
          },
        },
        recover: {
          enter: () => this.stop(),
          update: (_, t) => {
            this.slowDown();
            if (t + 1 >= a.recovery) this.fsm.go(this.afterHurt());
          },
        },
      },
      'idle',
    );
  }

  /** It turns toward the hero only after the hero has been behind it for a while. */
  private track(): void {
    if (this.targetBehind()) {
      if (++this.behind >= this.p.turnTicks) {
        this.behind = 0;
        this.faceTarget(true);
      }
    } else this.behind = 0;
  }

  private inReach(): boolean {
    const dx = this.dx() * this.enemy.facing;
    return this.enemy.body.grounded && !this.sim.player.health.dead && dx >= -0.2 && dx <= this.p.attackRange && Math.abs(this.dy()) <= this.p.attackHeight;
  }

  /** The shield is up while it walks, watches and lifts its weapon; it is down while the weapon falls and while it is stuck. */
  private get shielded(): boolean {
    const s = this.fsm.current;
    return s !== 'smash' && s !== 'recover' && s !== 'hurt' && s !== 'dead';
  }

  override guard(hit: HitInfo): 'blocked' | null {
    if (!this.shielded || this.p.pierces.includes(hit.attackId)) return null;
    // the blow came from the side it faces: the attacker faces the other way, toward it
    return hit.direction === -this.enemy.facing ? 'blocked' : null;
  }

  protected engagedState(): string {
    return 'approach';
  }
  protected restState(): string {
    return 'idle';
  }
  protected override afterMove(): void {
    if (this.fsm.current === 'smash') this.submit(this.attackOf(this.p.attack));
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'patrol':
        return { anim: 'walk' };
      case 'alert':
        return { anim: 'alert', t: Math.min(1, t / this.p.alertTicks) };
      case 'approach':
        return { anim: Math.abs(this.enemy.body.vx) > 0.3 ? 'run' : 'idle' };
      case 'windup':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'smash':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'recover':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      default:
        return { anim: 'idle' };
    }
  }
}
