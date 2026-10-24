import type { HitInfo } from '@/combat/Combatant';
import type { SimServices } from '@/gameplay/SimServices';
import { Enemy } from '../Enemy';
import type { EnemyDefinition } from '../EnemyDefinition';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Shardling's numbers: a crystal beast that rolls itself into a ball and, when it is broken, breaks into pieces. */
export interface RollerParams {
  patrolSpeed: number;
  approachSpeed: number;
  patrolRange: number;
  idleTicks: readonly [min: number, max: number];
  detectRange: number;
  detectHeight: number;
  alertTicks: number;
  /** It curls up to roll at someone at most this far across (m) and this near level (`detectHeight`). */
  rollRange: number;
  /** m/s while rolling, and the most times it turns around at a wall before it stops. */
  rollSpeed: number;
  bounces: number;
  /** The roll: `startup` the curling (the telegraph), `active` the longest it rolls, `recovery` the time it lies uncurled. */
  attack: string;
  /** What it breaks into when it falls: this many of this definition. */
  splitInto: EnemyDefinition;
  splitCount: number;
  friction: number;
  gravity: number;
}

export type RollerState = 'idle' | 'patrol' | 'alert' | 'approach' | 'curl' | 'roll' | 'recover';

/**
 * `idle ⇄ patrol → alert → approach → curl → roll → recover`. Rolled up it is a stone: a blow bounces off it (`enemy:blocked`), and it bounces off walls and comes back — twice — so the way out of its
 * path is above it, not away from it. Uncurled it is soft, and it breaks: its shards (`splitInto`) scatter and take up the fight.
 */
export class RollerBrain extends BaseBrain {
  private idleFor = 0;
  private bouncesLeft = 0;

  constructor(enemy: Enemy, sim: SimServices, private readonly p: RollerParams) {
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
            this.walk(p.patrolSpeed, 30);
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
            if (t + 1 >= p.alertTicks) this.fsm.go('approach');
          },
        },
        approach: {
          update: () => {
            if (!this.sees(p.detectRange * 1.4, p.detectHeight)) return this.fsm.go('idle');
            this.faceTarget();
            if (e.body.grounded && Math.abs(this.dx()) <= p.rollRange && Math.abs(this.dy()) <= p.detectHeight) return this.fsm.go('curl');
            this.walk(p.approachSpeed, 30);
          },
        },
        curl: {
          enter: () => {
            this.stop();
            this.faceTarget(true);
            this.telegraph(a);
          },
          update: (_, t) => {
            if (sim.player.health.dead) return this.fsm.go('idle');
            this.slowDown();
            if (t + 1 >= a.startup) this.fsm.go('roll');
          },
        },
        roll: {
          enter: () => {
            this.newBlow();
            this.struck(a);
            this.bouncesLeft = p.bounces;
            e.body.vx = e.facing * p.rollSpeed;
          },
          update: (_, t) => {
            const b = e.body;
            if (e.facing > 0 ? b.hitRight : b.hitLeft) {
              if (this.bouncesLeft-- <= 0) return this.fsm.go('recover');
              e.facing = e.facing > 0 ? -1 : 1;
              this.newBlow(); // the way back is a new blow: it can hurt what it already did
            }
            b.vx = e.facing * p.rollSpeed;
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
      'idle',
    );
  }

  /** Curled up (and curling) it is a stone. */
  override guard(hit: HitInfo): 'blocked' | null {
    const s = this.fsm.current;
    if (s !== 'roll' && s !== 'curl') return null;
    return hit.attackId === 'slam_dive' || hit.attackId === 'slam' ? null : 'blocked';
  }

  protected override onDeath(): void {
    const e = this.enemy;
    const n = this.p.splitCount;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const shard = new Enemy(this.sim.newId(this.p.splitInto.id), this.p.splitInto, { x: e.body.x + dir * 0.35, y: e.body.y + 0.1, facing: dir === 1 ? -1 : 1 });
      shard.body.vx = dir * (3 + 1.5 * i);
      shard.body.vy = 6 + i;
      this.sim.spawn(shard);
    }
  }

  protected engagedState(): string {
    return 'approach';
  }
  protected restState(): string {
    return 'idle';
  }
  protected override staggers(): boolean {
    return this.fsm.current !== 'roll';
  }
  protected override afterMove(): void {
    if (this.fsm.current === 'roll') this.submit(this.attackOf(this.p.attack));
  }
  protected pose(state: string, t: number): BrainPose {
    const a = this.attackOf(this.p.attack);
    switch (state) {
      case 'patrol':
        return { anim: 'walk' };
      case 'alert':
        return { anim: 'alert', t: Math.min(1, t / this.p.alertTicks) };
      case 'approach':
        return { anim: Math.abs(this.enemy.body.vx) > 0.3 ? 'run' : 'idle' };
      case 'curl':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'roll':
        return { anim: 'attack', phase: 'active', t: Math.min(1, t / a.active) };
      case 'recover':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      default:
        return { anim: 'idle' };
    }
  }
}
