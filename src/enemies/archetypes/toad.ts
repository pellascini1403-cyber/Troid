import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Mire Toad's numbers: it hops, and where it comes down the ground shakes. */
export interface ToadParams {
  patrolRange: number;
  idleTicks: readonly [min: number, max: number];
  detectRange: number;
  detectHeight: number;
  alertTicks: number;
  /** The longest leap (m) and how hard it pushes off (m/s up): the flight takes 2·leapVy ÷ gravity seconds. */
  leapRange: number;
  leapVy: number;
  /** The leap: `startup` the crouch (the telegraph), `active` the longest it can be in the air, `recovery` how long it sits after the landing. */
  attack: string;
  /** The shock where it lands: a low wave of the ground either side, for its `active` ticks. */
  shock: string;
  friction: number;
  gravity: number;
}

export type ToadState = 'idle' | 'hop' | 'alert' | 'crouch' | 'leap' | 'land' | 'recover';

/**
 * `idle ⇄ hop → alert → crouch → leap → land → recover`. The leap aims where the hero IS when it pushes off — so it is dodged by moving after the crouch — and comes down in an arc that is a body
 * in the air (it hurts what it passes through); where it lands it makes a shock either side that must be jumped. Sitting after the landing it is the opening.
 */
export class ToadBrain extends BaseBrain {
  private idleFor = 0;

  constructor(enemy: Enemy, sim: SimServices, private readonly p: ToadParams) {
    super(enemy, sim, p.gravity);
    const a = this.attackOf(p.attack);
    const shock = this.attackOf(p.shock);
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
            if (t >= this.idleFor) this.fsm.go('hop');
          },
        },
        // a small hop along its patch: the toad is never still for long
        hop: {
          enter: () => {
            const off = e.body.x - e.home.x;
            e.facing = Math.abs(off) >= p.patrolRange ? (off > 0 ? -1 : 1) : sim.rng.chance(0.5) ? 1 : -1;
            if (e.body.grounded) {
              e.body.vy = 6;
              e.body.vx = e.facing * 2.2;
            }
          },
          update: (_, t) => {
            if (this.sees(p.detectRange, p.detectHeight)) return this.fsm.go('alert');
            if (t > 3 && e.body.grounded) this.fsm.go('idle');
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
            this.faceTarget();
            if (t + 1 >= p.alertTicks) this.fsm.go('crouch');
          },
        },
        crouch: {
          enter: () => {
            this.stop();
            this.faceTarget(true);
            this.telegraph(a);
          },
          update: (_, t) => {
            if (sim.player.health.dead) return this.fsm.go('idle');
            this.slowDown();
            if (t + 1 >= a.startup) this.fsm.go('leap');
          },
        },
        leap: {
          enter: () => {
            this.newBlow();
            this.struck(a);
            const b = e.body;
            const flight = (2 * p.leapVy) / p.gravity;
            const reach = Math.max(-p.leapRange, Math.min(p.leapRange, this.dx()));
            b.vx = reach / flight;
            b.vy = p.leapVy;
            b.grounded = false;
          },
          update: (_, t) => {
            if (t > 2 && e.body.grounded) this.fsm.go('land');
            else if (t + 1 >= a.active) this.fsm.go('land');
          },
        },
        land: {
          enter: () => {
            this.stop();
            this.newBlow();
            this.struck(shock);
            this.sim.bus.emit('enemy:telegraph', { id: e.id, defId: e.def.id, x: e.body.x, y: e.body.y, facing: e.facing, ticks: 0, attack: shock.id });
          },
          update: (_, t) => {
            this.slowDown();
            if (t + 1 >= shock.active) this.fsm.go('recover');
          },
        },
        recover: {
          update: (_, t) => {
            this.slowDown();
            if (t + 1 >= a.recovery) this.fsm.go(this.afterHurt());
          },
        },
      },
      'idle',
    );
  }

  protected engagedState(): string {
    return 'alert';
  }
  protected restState(): string {
    return 'idle';
  }
  protected override afterMove(): void {
    const s = this.fsm.current;
    if (s === 'leap') this.submit(this.attackOf(this.p.attack));
    else if (s === 'land') {
      const shock = this.attackOf(this.p.shock);
      this.submit(shock, 1);
      this.submit(shock, -1);
    }
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'hop':
        return { anim: 'walk' };
      case 'alert':
        return { anim: 'alert', t: Math.min(1, t / this.p.alertTicks) };
      case 'crouch':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'leap':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'land':
        return { anim: 'land', phase: 'active', t: Math.min(1, t / this.attackOf(this.p.shock).active) };
      case 'recover':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      default:
        return { anim: 'idle' };
    }
  }
}
