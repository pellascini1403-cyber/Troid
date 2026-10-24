import type { HitInfo } from '@/combat/Combatant';
import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Glow Spore's numbers: a flower that does not move, shut like a stone until it blooms. */
export interface SporeParams {
  /** It blooms when the hero is this near across (m) and this near up or down. */
  triggerRange: number;
  triggerHeight: number;
  /** Ticks it stays shut between one bloom and the next (the hero can walk past, or not). */
  closedTicks: number;
  /** The bloom: `startup` the opening (shut still: the telegraph), `active` the cloud (it hurts what is in it), `recovery` the time it stays open and exposed afterwards. */
  attack: string;
  gravity: number;
}

export type SporeState = 'closed' | 'bloom' | 'burst' | 'open';

/**
 * `closed → bloom → burst → open → closed`. It is armoured while it is shut and while it opens (every blow is turned away, `enemy:blocked`); its cloud fills the space around it for as long as the burst lasts; and
 * when the cloud thins it stays open and exposed — that is the window. A hero who blooms it from afar, or waits out the cloud, is the one who hurts it.
 */
export class SporeBrain extends BaseBrain {
  constructor(enemy: Enemy, sim: SimServices, private readonly p: SporeParams) {
    super(enemy, sim, p.gravity);
    const a = this.attackOf(p.attack);
    this.start(
      {
        closed: {
          enter: () => this.stop(),
          update: (_, t) => {
            this.stop();
            if (t >= p.closedTicks && this.sees(p.triggerRange, p.triggerHeight, false)) this.fsm.go('bloom');
          },
        },
        bloom: {
          enter: () => {
            this.alerted();
            this.telegraph(a);
          },
          update: (_, t) => {
            this.stop();
            if (t + 1 >= a.startup) this.fsm.go('burst');
          },
        },
        burst: {
          enter: () => {
            this.newBlow();
            this.struck(a);
          },
          update: (_, t) => {
            this.stop();
            if (t + 1 >= a.active) this.fsm.go('open');
          },
        },
        open: {
          update: (_, t) => {
            this.stop();
            if (t + 1 >= a.recovery) this.fsm.go('closed');
          },
        },
      },
      'closed',
    );
  }

  /** Armoured shut and while opening; its cloud and its recovery are the openings. */
  override guard(_hit: HitInfo): 'blocked' | null {
    const s = this.fsm.current;
    return s === 'closed' || s === 'bloom' ? 'blocked' : null;
  }

  protected engagedState(): string {
    return 'closed';
  }
  protected restState(): string {
    return 'closed';
  }
  protected override afterHurt(): string {
    return 'open';
  }
  protected override afterMove(): void {
    if (this.fsm.current === 'burst') this.submit(this.attackOf(this.p.attack));
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'bloom':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'burst':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'open':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      default:
        return { anim: 'idle' };
    }
  }
}
