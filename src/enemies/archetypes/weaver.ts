import type { SimServices } from '@/gameplay/SimServices';
import { Enemy } from '../Enemy';
import type { EnemyDefinition } from '../EnemyDefinition';
import { floorAhead } from '../senses';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Ink Weaver's numbers: it does not fight; it makes things that do. */
export interface WeaverParams {
  patrolRange: number;
  detectRange: number;
  detectHeight: number;
  alertTicks: number;
  /** It backs away when the hero is nearer than this (m), at `retreatSpeed`. */
  keepAway: number;
  retreatSpeed: number;
  /** Ticks between one weaving and the next, and the most creatures of its own alive at once. */
  interval: number;
  maxAlive: number;
  /** The weaving: `startup` the circle drawn in the air (the telegraph), `recovery` the time it is spent afterwards. */
  attack: string;
  /** What it makes, and how far in front of it (m). */
  summon: EnemyDefinition;
  summonOffset: number;
  friction: number;
  gravity: number;
}

export type WeaverState = 'idle' | 'alert' | 'stalk' | 'weave' | 'recover';

/**
 * `idle → alert → stalk ⇄ (weave → recover)`. It keeps its distance from the hero and, every few seconds, weaves a creature of ink out of the air at its feet; never more than two at once. Killing what it makes
 * only makes room for the next. The weaver itself is soft, slow to defend and slow to retreat — it is the one to reach.
 */
export class WeaverBrain extends BaseBrain {
  private countdown = 0;
  private readonly made: Enemy[] = [];

  constructor(enemy: Enemy, sim: SimServices, private readonly p: WeaverParams) {
    super(enemy, sim, p.gravity);
    const a = this.attackOf(p.attack);
    const e = enemy;
    this.countdown = Math.round(p.interval * 0.4);
    this.start(
      {
        idle: {
          enter: () => this.stop(),
          update: () => {
            this.slowDown();
            if (this.sees(p.detectRange, p.detectHeight)) this.fsm.go('alert');
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
            if (t + 1 >= p.alertTicks) this.fsm.go('stalk');
          },
        },
        stalk: {
          update: () => {
            if (!this.sees(p.detectRange * 1.4, p.detectHeight, false)) return this.fsm.go('idle');
            this.faceTarget();
            if (this.countdown > 0) this.countdown--;
            const b = e.body;
            const back = -e.facing as 1 | -1;
            if (Math.abs(this.dx()) < p.keepAway && b.grounded && floorAhead(sim.collision, b, back) && Math.abs(b.x - e.home.x) < p.patrolRange + 4) {
              b.vx = back * p.retreatSpeed;
            } else this.slowDown();
            if (this.countdown === 0 && this.alive() < p.maxAlive) this.fsm.go('weave');
          },
        },
        weave: {
          enter: () => {
            this.stop();
            this.faceTarget(true);
            this.telegraph(a);
          },
          update: (_, t) => {
            if (sim.player.health.dead) return this.fsm.go('idle');
            this.slowDown();
            if (t + 1 < a.startup) return;
            this.struck(a);
            const child = new Enemy(sim.newId(p.summon.id), p.summon, { x: e.body.x + e.facing * p.summonOffset, y: e.body.y, facing: e.facing === 1 ? -1 : 1 });
            this.made.push(child);
            sim.spawn(child);
            this.countdown = p.interval;
            this.fsm.go('recover');
          },
        },
        recover: {
          update: (_, t) => {
            this.slowDown();
            if (t + 1 >= a.recovery) this.fsm.go('stalk');
          },
        },
      },
      'idle',
    );
  }

  /** How many of the creatures it made are still there. */
  private alive(): number {
    for (let i = this.made.length - 1; i >= 0; i--) if (this.made[i]!.health.dead || this.made[i]!.expired) this.made.splice(i, 1);
    return this.made.length;
  }

  protected engagedState(): string {
    return 'stalk';
  }
  protected restState(): string {
    return 'idle';
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'alert':
        return { anim: 'alert', t: Math.min(1, t / this.p.alertTicks) };
      case 'stalk':
        return { anim: Math.abs(this.enemy.body.vx) > 0.3 ? 'run' : 'idle' };
      case 'weave':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'recover':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      default:
        return { anim: 'idle' };
    }
  }
}
