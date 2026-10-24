import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { EnemyShot, type ShotSpec } from '../EnemyShot';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Bell Toller's numbers: a bell on legs that stays where it is and rings. */
export interface TollerParams {
  /** Ticks between one toll and the next while the hero is within `range` across and `height` up or down (m): it does not ring for nobody. */
  interval: number;
  range: number;
  height: number;
  /** The toll: `startup` the swing (the telegraph), `active` the ring, `recovery` the time until it can swing again. */
  attack: string;
  /** The wave it sends along the floor each way. */
  shot: ShotSpec;
  /** Where the waves leave it: metres from its centre, and up from its feet. */
  muzzle: { x: number; y: number };
  gravity: number;
}

export type TollerState = 'wait' | 'swing' | 'toll' | 'recover';

/**
 * `wait → swing → toll → recover → wait`. It does not move and does not chase; it is a rhythm. Every toll sends a low wave along the floor each way — a hop clears one — and the swing before it is long enough to
 * walk into position for. It is the room's metronome: what it asks is to cross the floor between two tolls, or to be above it.
 */
export class TollerBrain extends BaseBrain {
  constructor(enemy: Enemy, sim: SimServices, private readonly p: TollerParams) {
    super(enemy, sim, p.gravity);
    const a = this.attackOf(p.attack);
    const e = enemy;
    this.start(
      {
        wait: {
          enter: () => this.stop(),
          update: (_, t) => {
            this.stop();
            if (t >= p.interval && this.sees(p.range, p.height, false)) this.fsm.go('swing');
          },
        },
        swing: {
          enter: () => {
            this.alerted();
            this.telegraph(a);
          },
          update: (_, t) => {
            this.stop();
            if (t + 1 >= a.startup) this.fsm.go('toll');
          },
        },
        toll: {
          enter: () => {
            this.struck(a);
            for (const side of [-1, 1] as const) sim.spawn(new EnemyShot(sim.newId('shot'), p.shot, e.id, e.body.x + side * p.muzzle.x, e.body.y + p.muzzle.y, side));
          },
          update: (_, t) => {
            this.stop();
            if (t + 1 >= a.active) this.fsm.go('recover');
          },
        },
        recover: {
          update: (_, t) => {
            this.stop();
            if (t + 1 >= a.recovery) this.fsm.go('wait');
          },
        },
      },
      'wait',
    );
  }

  protected engagedState(): string {
    return 'wait';
  }
  protected restState(): string {
    return 'wait';
  }
  protected override afterHurt(): string {
    return 'wait';
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'swing':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'toll':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'recover':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      default:
        return { anim: 'idle' };
    }
  }
}
