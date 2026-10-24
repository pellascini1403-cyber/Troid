import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Floor Leech's numbers: a puddle on the floor that is not one. */
export interface LeechParams {
  /** It springs up when the hero is within this much across and up or down (m). */
  ambushRange: number;
  ambushHeight: number;
  /** m/s of the lunge of the bite, and the ticks it lasts. */
  biteSpeed: number;
  biteLunge: number;
  /** The bite: `startup` the rise (very short: it is an ambush), `active` the bite, `recovery` the time it is up and exposed afterwards. */
  attack: string;
  /** Ticks it takes to sink back into the floor, and the distance (m) the hero has to be beyond for it to do so. */
  sinkTicks: number;
  rearmRange: number;
  gravity: number;
}

export type LeechState = 'dormant' | 'rise' | 'bite' | 'exposed' | 'sink';

/**
 * `dormant → rise → bite → exposed → (bite | sink) → dormant`. Asleep it is a patch of dark on the floor that nothing can touch — the blow goes through it — and it springs on whoever walks over it, with a rise
 * so short it can only be read the second time. The bite is not interrupted (nothing stops it but the end of it); afterwards it is up and exposed, which is what it costs it.
 */
export class LeechBrain extends BaseBrain {
  constructor(enemy: Enemy, sim: SimServices, private readonly p: LeechParams) {
    super(enemy, sim, p.gravity);
    const a = this.attackOf(p.attack);
    const e = enemy;
    this.start(
      {
        dormant: {
          enter: () => this.stop(),
          update: () => {
            this.stop();
            if (sim.player.health.dead) return;
            if (Math.abs(this.dx()) <= p.ambushRange && Math.abs(this.dy()) <= p.ambushHeight) this.fsm.go('rise');
          },
        },
        rise: {
          enter: () => {
            this.faceTarget(true);
            this.alerted();
            this.telegraph(a);
          },
          update: (_, t) => {
            this.stop();
            if (t + 1 >= a.startup) this.fsm.go('bite');
          },
        },
        bite: {
          enter: () => {
            this.newBlow();
            this.struck(a);
            this.faceTarget(true);
          },
          update: (_, t) => {
            e.body.vx = t < p.biteLunge ? e.facing * p.biteSpeed : 0;
            if (t + 1 >= a.active) this.fsm.go('exposed');
          },
        },
        exposed: {
          enter: () => this.stop(),
          update: (_, t) => {
            this.slowDown();
            if (t + 1 < a.recovery) return;
            if (Math.abs(this.dx()) <= p.ambushRange * 1.6 && Math.abs(this.dy()) <= p.ambushHeight && !sim.player.health.dead) this.fsm.go('rise');
            else this.fsm.go('sink');
          },
        },
        sink: {
          update: (_, t) => {
            this.slowDown();
            if (Math.abs(this.dx()) < p.rearmRange * 0.4 && !sim.player.health.dead) return this.fsm.go('rise');
            if (t + 1 >= p.sinkTicks) this.fsm.go('dormant');
          },
        },
      },
      'dormant',
    );
  }

  override get untouchable(): boolean {
    return this.fsm.current === 'dormant';
  }

  protected engagedState(): string {
    return 'rise';
  }
  protected restState(): string {
    return 'dormant';
  }
  protected override afterHurt(): string {
    return 'sink';
  }
  protected override staggers(): boolean {
    return this.fsm.current !== 'bite' && this.fsm.current !== 'rise';
  }
  protected override afterMove(): void {
    if (this.fsm.current === 'bite') this.submit(this.attackOf(this.p.attack));
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'dormant':
        return { anim: 'crouch' };
      case 'rise':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'bite':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'exposed':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      case 'sink':
        return { anim: 'crouch', t: Math.min(1, t / this.p.sinkTicks) };
      default:
        return { anim: 'idle' };
    }
  }
}
