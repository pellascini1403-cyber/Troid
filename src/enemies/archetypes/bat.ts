import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Cave Bat's numbers: it hangs from the roof until someone passes under it. */
export interface BatParams {
  /** It wakes when the hero is within `wakeRange` across and `wakeHeight` BELOW it (m). */
  wakeRange: number;
  wakeHeight: number;
  /** Speed of the dive (m/s), the most it can turn toward the hero a tick (radians), and the most ticks a dive lasts. */
  swoopSpeed: number;
  turnRate: number;
  swoopTicks: number;
  /** Speed (m/s) at which it goes back to the roof. */
  returnSpeed: number;
  /** Dives in a row before it goes back, and the ticks it hangs in the air between two. */
  maxSwoops: number;
  hoverTicks: number;
  /** The dive: `startup` the spreading of the wings (the telegraph), `active` the longest dive. */
  attack: string;
}

export type BatState = 'perched' | 'wake' | 'swoop' | 'hover' | 'climb';

/**
 * `perched → wake → swoop → hover → (wake | climb) → perched`. A creature of the air: it has no gravity, only the speed it gives itself. It swoops toward where the hero is when it lets go — turning a little
 * as it dives, so a hero who moves late is still caught — hits once and hangs in the air; after two dives it goes back to the roof it came from and sleeps.
 */
export class BatBrain extends BaseBrain {
  private swoops = 0;

  constructor(enemy: Enemy, sim: SimServices, private readonly p: BatParams) {
    super(enemy, sim, 0);
    const a = this.attackOf(p.attack);
    const e = enemy;
    this.start(
      {
        perched: {
          enter: () => {
            this.stop();
            this.swoops = 0;
          },
          update: () => {
            this.stop();
            const pl = sim.player;
            if (pl.health.dead) return;
            const below = e.body.y - pl.body.y;
            if (Math.abs(this.dx()) <= p.wakeRange && below >= -0.5 && below <= p.wakeHeight && this.sees(p.wakeRange, p.wakeHeight)) this.fsm.go('wake');
          },
        },
        wake: {
          enter: () => {
            this.stop();
            this.faceTarget(true);
            if (this.swoops === 0) this.alerted();
            this.telegraph(a);
          },
          update: (_, t) => {
            this.stop();
            if (sim.player.health.dead) return this.fsm.go('climb');
            this.faceTarget();
            if (t + 1 >= a.startup) this.fsm.go('swoop');
          },
        },
        swoop: {
          enter: () => {
            this.newBlow();
            this.struck(a);
            this.swoops++;
            this.aimAt(1);
          },
          update: (_, t) => {
            const b = e.body;
            this.aimAt(p.turnRate);
            if (b.hitLeft || b.hitRight || b.hitCeiling || b.grounded) return this.fsm.go('hover');
            if (t + 1 >= a.active || sim.player.health.dead) this.fsm.go('hover');
          },
        },
        hover: {
          update: (_, t) => {
            this.slowDown(26);
            if (t + 1 < p.hoverTicks) return;
            if (this.swoops < p.maxSwoops && this.sees(p.wakeRange * 1.5, p.wakeHeight * 1.5)) this.fsm.go('wake');
            else this.fsm.go('climb');
          },
        },
        climb: {
          update: () => {
            e.facing = e.home.x >= e.body.x ? 1 : -1;
            // it hangs again once it is near enough: a roof that is a hair too close to its wings must not keep it flying for ever
            if (this.flyTo(e.home.x, e.home.y, p.returnSpeed) || Math.hypot(e.home.x - e.body.x, e.home.y - e.body.y) < 0.5) {
              e.teleport(e.home.x, e.home.y, e.facing);
              this.fsm.go('perched');
            }
          },
        },
      },
      'perched',
    );
  }

  /** Turns the velocity toward the hero's torso by at most `rate` radians, at the dive's speed. */
  private aimAt(rate: number): void {
    const e = this.enemy;
    const b = e.body;
    const pl = this.sim.player;
    const tx = pl.body.x - b.x;
    const ty = pl.body.y + pl.body.height * 0.5 - (b.y + b.height * 0.5);
    const want = Math.atan2(ty, tx);
    const speed = Math.hypot(b.vx, b.vy);
    let have = speed > 0.1 ? Math.atan2(b.vy, b.vx) : want;
    let turn = want - have;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    have += Math.max(-rate, Math.min(rate, turn));
    b.vx = Math.cos(have) * this.p.swoopSpeed;
    b.vy = Math.sin(have) * this.p.swoopSpeed;
    e.facing = b.vx >= 0 ? 1 : -1;
  }

  protected engagedState(): string {
    return 'wake';
  }
  protected restState(): string {
    return 'climb';
  }
  protected override afterHurt(): string {
    return this.swoops < this.p.maxSwoops && this.sees(this.p.wakeRange * 1.5, this.p.wakeHeight * 1.5) ? 'wake' : 'climb';
  }
  protected override afterMove(): void {
    if (this.fsm.current === 'swoop') this.submit(this.attackOf(this.p.attack));
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'wake':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'swoop':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'hover':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / this.p.hoverTicks) };
      case 'climb':
        return { anim: 'run' };
      default:
        return { anim: 'idle' };
    }
  }
}
