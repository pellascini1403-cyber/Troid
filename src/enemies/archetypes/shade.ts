import type { Rect } from '@/core/math';
import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Veil Shade's numbers: a figure of cloth and dark that is never where it was. */
export interface ShadeParams {
  /** It drifts toward a hero it has noticed at `driftSpeed` (m/s) and vanishes when the hero is within `vanishRange` across (m). */
  detectRange: number;
  detectHeight: number;
  driftSpeed: number;
  vanishRange: number;
  /** Ticks it takes to fade out, and the ticks it is gone. */
  vanishTicks: number;
  goneTicks: number;
  /** Where it comes back: this far (m) behind the hero, the way the hero is facing away from. */
  behind: number;
  /** The slash: `startup` the reappearance (it is solid but not yet armed: the telegraph), `active` the cut, `recovery` the time it is spent. */
  attack: string;
  gravity: number;
}

export type ShadeState = 'lurk' | 'vanish' | 'gone' | 'appear' | 'slash' | 'recover';

/**
 * `lurk → vanish → gone → appear → slash → recover`. It cannot be hit while it fades out and while it is gone; it comes back behind the hero — on the side the hero is NOT looking at — and the reappearance is the warning:
 * it is solid again, and it has not struck yet. A hero who turns around, or who simply keeps moving, is not where the slash lands.
 */
export class ShadeBrain extends BaseBrain {
  private spot = { x: 0, y: 0 };

  constructor(enemy: Enemy, sim: SimServices, private readonly p: ShadeParams) {
    super(enemy, sim, p.gravity);
    const a = this.attackOf(p.attack);
    const e = enemy;
    this.start(
      {
        lurk: {
          update: () => {
            if (this.sees(p.detectRange, p.detectHeight, false)) {
              this.faceTarget();
              if (Math.abs(this.dx()) <= p.vanishRange) return this.fsm.go('vanish');
              e.body.vx = e.facing * p.driftSpeed;
              if (!e.body.grounded) e.body.vx = 0;
            } else this.slowDown();
          },
        },
        vanish: {
          enter: () => {
            this.stop();
            this.alerted();
          },
          update: (_, t) => {
            this.stop();
            if (t + 1 >= p.vanishTicks) this.fsm.go('gone');
          },
        },
        gone: {
          enter: () => this.stop(),
          update: (_, t) => {
            this.stop();
            if (t + 1 >= p.goneTicks) {
              this.spot = this.reappearAt();
              this.fsm.go('appear');
            }
          },
        },
        appear: {
          enter: () => {
            e.teleport(this.spot.x, this.spot.y, e.facing); // (the view does not slide there)
            this.stop();
            this.faceTarget(true);
            this.telegraph(a);
          },
          update: (_, t) => {
            this.stop();
            this.faceTarget();
            if (sim.player.health.dead) return this.fsm.go('lurk');
            if (t + 1 >= a.startup) this.fsm.go('slash');
          },
        },
        slash: {
          enter: () => {
            this.newBlow();
            this.struck(a);
            e.body.vx = e.facing * 3;
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
      'lurk',
    );
  }

  /** A place on the floor behind the hero that has room for the body; if there is none, in front of them. */
  private reappearAt(): { x: number; y: number } {
    const pl = this.sim.player;
    const b = this.enemy.body;
    const back = -pl.facing;
    for (const side of [back, -back]) {
      for (const d of [this.p.behind, this.p.behind + 1.2, this.p.behind - 0.8]) {
        const x = pl.body.x + side * d;
        const y = this.floorUnder(x, pl.body.y);
        if (y === null) continue;
        const body: Rect = { x0: x - b.halfW, x1: x + b.halfW, y0: y + 0.02, y1: y + b.height };
        if (!this.sim.collision.overlapsSolid(body)) return { x, y };
      }
    }
    return { x: b.x, y: b.y };
  }

  private floorUnder(x: number, y: number): number | null {
    const probe: Rect = { x0: x - 0.2, x1: x + 0.2, y0: y - 2.2, y1: y + 0.6 };
    let best: number | null = null;
    for (const c of this.sim.collision.query(probe)) {
      const top = c.rect.y1;
      if (top > y + 0.5 || top < y - 2.2) continue;
      if (best === null || top > best) best = top;
    }
    return best;
  }

  override get untouchable(): boolean {
    return this.fsm.current === 'vanish' || this.fsm.current === 'gone';
  }

  protected engagedState(): string {
    return 'lurk';
  }
  protected restState(): string {
    return 'lurk';
  }
  protected override staggers(): boolean {
    return this.fsm.current !== 'slash';
  }
  protected override afterMove(): void {
    if (this.fsm.current === 'slash') this.submit(this.attackOf(this.p.attack));
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'lurk':
        return { anim: Math.abs(this.enemy.body.vx) > 0.3 ? 'walk' : 'idle' };
      case 'vanish':
        return { anim: 'alert', t: Math.min(1, t / this.p.vanishTicks), opacity: 1 - Math.min(1, t / this.p.vanishTicks) };
      case 'gone':
        return { anim: 'idle', opacity: 0 };
      case 'appear':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup), opacity: 0.35 + 0.65 * Math.min(1, t / a.startup) };
      case 'slash':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'recover':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      default:
        return { anim: 'idle' };
    }
  }
}
