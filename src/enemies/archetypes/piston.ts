import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Piston Drone's numbers: a machine that follows the hero from above and drops. */
export interface PistonParams {
  /** It notices the hero within this much across and up or down (m: a long way down, it hangs from the roof), and follows at `trackSpeed` (m/s) along the line it hovers on (where it was placed). */
  detectRange: number;
  detectHeight: number;
  trackSpeed: number;
  /** It locks on when it is within `lockRange` of the hero's x for `lockDelay` ticks in a row. */
  lockRange: number;
  lockDelay: number;
  /**
   * The farthest (m) from its post it follows the hero: a piston that hangs over a stretch of a river of stones guards that stretch, and does not follow the hero along the whole of a room until every piston in it is over the same stone
   * (found in Prompt 23: over 100 m of lava, three pistons that outrun the hero by a metre a second were three pistons over the last stone). Without it, it follows for as long as it sees them.
   */
  leash?: number;
  /** m/s of the drop and of the climb back. */
  dropSpeed: number;
  riseSpeed: number;
  /** Ticks it waits between drops. */
  cooldownTicks: number;
  /** The crush: `startup` the lock (it stops and shows where it will fall: the telegraph), `active` the longest the fall lasts, `recovery` the time it is stuck in the ground afterwards. */
  attack: string;
}

export type PistonState = 'track' | 'lock' | 'drop' | 'stuck' | 'rise';

/**
 * `track → lock → drop → stuck → rise → track`. It hangs from its line and slides along it after the hero; when it has them under it, it stops — the telegraph — and falls straight down, hurting what is under it all
 * the way; and it is stuck where it landed, helpless and low, before it climbs back. The answer is not to be under it when it falls, and to be at it when it is stuck.
 */
export class PistonBrain extends BaseBrain {
  private aligned = 0;
  private cooldown = 0;

  constructor(enemy: Enemy, sim: SimServices, private readonly p: PistonParams) {
    super(enemy, sim, 0);
    const a = this.attackOf(p.attack);
    const e = enemy;
    this.start(
      {
        track: {
          update: () => {
            const b = e.body;
            if (this.cooldown > 0) this.cooldown--;
            if (!this.sees(p.detectRange, p.detectHeight, false)) {
              this.flyTo(e.home.x, e.home.y, 2.5);
              this.aligned = 0;
              return;
            }
            const aim = p.leash === undefined ? sim.player.body.x : Math.min(e.home.x + p.leash, Math.max(e.home.x - p.leash, sim.player.body.x));
            this.flyTo(aim, e.home.y, p.trackSpeed, 22);
            e.facing = this.dx() >= 0 ? 1 : -1;
            if (Math.abs(this.dx()) <= p.lockRange && this.cooldown === 0 && b.y > sim.player.body.y) this.aligned++;
            else this.aligned = 0;
            if (this.aligned >= p.lockDelay) this.fsm.go('lock');
          },
        },
        lock: {
          enter: () => {
            this.stop();
            this.alerted();
            this.telegraph(a);
          },
          update: (_, t) => {
            this.stop();
            if (sim.player.health.dead) return this.fsm.go('rise');
            if (t + 1 >= a.startup) this.fsm.go('drop');
          },
        },
        drop: {
          enter: () => {
            this.newBlow();
            this.struck(a);
            e.body.vx = 0;
            e.body.vy = -p.dropSpeed;
          },
          update: (_, t) => {
            const b = e.body;
            b.vx = 0;
            b.vy = -p.dropSpeed;
            if (b.grounded || b.hitCeiling || t + 1 >= a.active) this.fsm.go('stuck');
          },
        },
        stuck: {
          enter: () => this.stop(),
          update: (_, t) => {
            this.stop();
            if (t + 1 >= a.recovery) this.fsm.go('rise');
          },
        },
        rise: {
          update: () => {
            if (this.flyTo(e.body.x, e.home.y, p.riseSpeed)) {
              this.cooldown = p.cooldownTicks;
              this.aligned = 0;
              this.fsm.go('track');
            }
          },
        },
      },
      'track',
    );
  }

  protected engagedState(): string {
    return 'track';
  }
  protected restState(): string {
    return 'track';
  }
  protected override afterHurt(): string {
    return 'rise';
  }
  protected override staggers(): boolean {
    return this.fsm.current !== 'drop';
  }
  protected override afterMove(): void {
    if (this.fsm.current === 'drop') this.submit(this.attackOf(this.p.attack));
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'track':
        return { anim: Math.abs(this.enemy.body.vx) > 0.4 ? 'run' : 'idle' };
      case 'lock':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'drop':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'stuck':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      case 'rise':
        return { anim: 'walk' };
      default:
        return { anim: 'idle' };
    }
  }
}
