import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { floorAhead, wallAhead } from '../senses';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Bramble Crawler's numbers (docs/PROMPT21-LOG.md): a low beast that charges in a straight line and, when it runs into a wall, is dazed. */
export interface CrawlerParams {
  patrolSpeed: number;
  patrolRange: number;
  idleTicks: readonly [min: number, max: number];
  detectRange: number;
  detectHeight: number;
  alertTicks: number;
  /** m/s of the charge. */
  rushSpeed: number;
  /** It charges at someone at most this far across (m) and level with it (`detectHeight`). */
  rushRange: number;
  /** The attack: `startup` is the dig-in (the telegraph), `active` the longest the charge lasts, `recovery` how long it is spent when the charge ends in the open. */
  attack: string;
  /** Ticks it is dazed after hitting a wall: helpless. */
  stunTicks: number;
  friction: number;
  gravity: number;
}

export type CrawlerState = 'idle' | 'patrol' | 'alert' | 'windup' | 'rush' | 'dazed' | 'recover';

/**
 * `idle ⇄ patrol → alert → windup → rush → (dazed | recover)`. Its whole threat is one straight line — and the whole answer to it is to not be in the line, or to be above it: the charge cannot stop,
 * so it ends at a wall (dazed for a long time, helpless) or at a ledge or by running out (spent for a shorter one).
 */
export class CrawlerBrain extends BaseBrain {
  private idleFor = 0;

  constructor(enemy: Enemy, sim: SimServices, private readonly p: CrawlerParams) {
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
            this.walk(p.patrolSpeed, 40);
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
            if (t + 1 >= p.alertTicks) this.fsm.go(this.inRushRange() ? 'windup' : 'alert', true);
          },
        },
        windup: {
          enter: () => {
            this.stop();
            this.faceTarget(true);
            this.telegraph(a);
          },
          update: (_, t) => {
            if (sim.player.health.dead) return this.fsm.go('idle');
            this.slowDown();
            if (t + 1 >= a.startup) this.fsm.go('rush');
          },
        },
        rush: {
          enter: () => {
            this.newBlow();
            this.struck(a);
            e.body.vx = e.facing * p.rushSpeed;
          },
          update: (_, t) => {
            const b = e.body;
            if (e.facing > 0 ? b.hitRight : b.hitLeft) return this.fsm.go('dazed');
            if (b.grounded && !floorAhead(sim.collision, b, e.facing, 0.35, 0.7) && !wallAhead(sim.collision, b, e.facing)) return this.fsm.go('recover'); // the charge stops at a ledge, it does not run off it
            b.vx = e.facing * p.rushSpeed;
            if (t + 1 >= a.active) this.fsm.go('recover');
          },
        },
        dazed: {
          enter: () => {
            this.stop();
            // the crash is felt: a blow on the wall it hit
            e.body.vy = 3;
          },
          update: (_, t) => {
            this.slowDown();
            if (t + 1 >= p.stunTicks) this.fsm.go(this.afterHurt());
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

  private inRushRange(): boolean {
    return Math.abs(this.dx()) <= this.p.rushRange && Math.abs(this.dy()) <= this.p.detectHeight;
  }

  protected engagedState(): string {
    return 'alert';
  }
  protected restState(): string {
    return 'idle';
  }
  protected override staggers(): boolean {
    return this.fsm.current !== 'rush'; // a charge is not stopped by a blow: only by what is in the way
  }
  protected override afterMove(): void {
    if (this.fsm.current === 'rush') this.submit(this.attackOf(this.p.attack));
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'patrol':
        return { anim: 'walk' };
      case 'alert':
        return { anim: 'alert', t: Math.min(1, t / this.p.alertTicks) };
      case 'windup':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'rush':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'dazed':
        return { anim: 'land', t: Math.min(1, t / this.p.stunTicks) };
      case 'recover':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      default:
        return { anim: 'idle' };
    }
  }
}
