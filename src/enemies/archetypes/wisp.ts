import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Lantern Wisp's numbers: a small light that drifts, finds the hero, and goes off. */
export interface WispParams {
  /** It drifts around where it was placed, at this speed (m/s) and this far (m). */
  driftSpeed: number;
  driftRange: number;
  /** It notices the hero within this much across and up or down; it follows at `chaseSpeed`, keeping `hoverAbove` metres above the hero's feet. */
  chaseRange: number;
  chaseHeight: number;
  chaseSpeed: number;
  hoverAbove: number;
  /** It lights its fuse when the hero is this near (m). */
  fuseRange: number;
  /** The blast: `startup` the fuse (it swells and flickers: the telegraph), `active` the ticks the explosion hurts. Setting it off is the end of the wisp. */
  attack: string;
}

export type WispState = 'drift' | 'chase' | 'fuse' | 'blast';

/**
 * `drift → chase → fuse → blast`. It does not strike: it comes. The fuse is long enough to run from and short enough that running is the only thing there is time for; and it can be put out first — a bolt, a blow — which
 * is the whole of its defence. The blast hurts an area, not a line.
 */
export class WispBrain extends BaseBrain {
  private leg = 1;

  constructor(enemy: Enemy, sim: SimServices, private readonly p: WispParams) {
    super(enemy, sim, 0);
    const a = this.attackOf(p.attack);
    const e = enemy;
    this.start(
      {
        drift: {
          update: (_, t) => {
            const b = e.body;
            if (this.sees(p.chaseRange, p.chaseHeight, false)) return this.fsm.go('chase');
            // a lazy figure of eight around home
            const wx = e.home.x + Math.sin(t / 50) * p.driftRange * this.leg;
            const wy = e.home.y + Math.sin(t / 31) * 0.35;
            this.flyTo(wx, wy, p.driftSpeed, 8);
            e.facing = b.vx >= 0 ? 1 : -1;
          },
        },
        chase: {
          enter: () => this.alerted(),
          update: () => {
            const pl = sim.player;
            if (pl.health.dead || !this.sees(p.chaseRange * 1.5, p.chaseHeight * 1.5, false)) return this.fsm.go('drift');
            this.flyTo(pl.body.x, pl.body.y + p.hoverAbove, p.chaseSpeed, 14);
            e.facing = this.dx() >= 0 ? 1 : -1;
            if (Math.hypot(this.dx(), this.dy() + p.hoverAbove * 0.5) <= p.fuseRange) this.fsm.go('fuse');
          },
        },
        fuse: {
          enter: () => {
            this.stop();
            this.telegraph(a);
          },
          update: (_, t) => {
            this.slowDown(18);
            if (t + 1 >= a.startup) this.fsm.go('blast');
          },
        },
        blast: {
          enter: () => {
            this.newBlow();
            this.struck(a);
          },
          update: (_, t) => {
            this.stop();
            if (t + 1 >= a.active) {
              // setting it off is its end: it falls like anything that has been defeated, and counts as such
              e.health.damage(e.health.max);
              sim.bus.emit('actor:died', { id: e.id, team: e.team, x: e.body.x, y: e.body.y });
              this.fsm.go('dead', true);
            }
          },
        },
      },
      'drift',
    );
  }

  protected engagedState(): string {
    return 'chase';
  }
  protected restState(): string {
    return 'drift';
  }
  protected override staggers(): boolean {
    return this.fsm.current !== 'blast';
  }
  protected override afterMove(): void {
    if (this.fsm.current === 'blast') this.submit(this.attackOf(this.p.attack));
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'chase':
        return { anim: 'run' };
      case 'fuse':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'blast':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      default:
        return { anim: 'idle' };
    }
  }
}
