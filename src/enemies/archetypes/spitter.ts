import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import { EnemyShot, type ShotSpec } from '../EnemyShot';
import { floorAhead } from '../senses';
import { BaseBrain, type BrainPose } from './BaseBrain';

/** The Ink Spitter's numbers: it keeps its distance and throws ink. */
export interface SpitterParams {
  patrolSpeed: number;
  patrolRange: number;
  idleTicks: readonly [min: number, max: number];
  detectRange: number;
  detectHeight: number;
  alertTicks: number;
  /** It backs away when the hero is nearer than this (m), at `retreatSpeed`. */
  keepAway: number;
  retreatSpeed: number;
  /** Ticks it waits between one throw and the next. */
  cooldownTicks: number;
  /** The throw: `startup` the aim (the telegraph), `recovery` the time after it. */
  attack: string;
  shot: ShotSpec;
  /** Where the shot leaves it: metres in front of its centre and up from its feet. */
  muzzle: { x: number; y: number };
  friction: number;
  gravity: number;
}

export type SpitterState = 'idle' | 'patrol' | 'alert' | 'stalk' | 'aim' | 'fire' | 'recover';

/**
 * `idle ⇄ patrol → alert → stalk ⇄ (aim → fire → recover)`. It is at its best at range: it backs away from a hero who comes close, and it throws straight along the floor from far away — a shot that is jumped, or
 * dashed through, or taken to the wall; it is slow to aim, and the aim is the telegraph. Cornered, with a wall behind it, it has nowhere to go and throws anyway.
 */
export class SpitterBrain extends BaseBrain {
  private idleFor = 0;
  private cooldown = 0;

  constructor(enemy: Enemy, sim: SimServices, private readonly p: SpitterParams) {
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
            if (!this.sees(p.detectRange * 1.3, p.detectHeight)) return this.fsm.go('idle');
            this.faceTarget();
            if (t + 1 >= p.alertTicks) this.fsm.go('stalk');
          },
        },
        stalk: {
          update: () => {
            if (!this.sees(p.detectRange * 1.3, p.detectHeight, false)) return this.fsm.go('idle');
            this.faceTarget();
            if (this.cooldown > 0) this.cooldown--;
            const b = e.body;
            const near = Math.abs(this.dx()) < p.keepAway;
            const back = -e.facing as 1 | -1;
            const canBack = b.grounded && floorAhead(sim.collision, b, back);
            if (near && canBack) {
              b.vx = back * p.retreatSpeed;
              return;
            }
            this.slowDown();
            if (this.cooldown === 0 && this.sees(p.detectRange, p.detectHeight, true)) this.fsm.go('aim');
          },
        },
        aim: {
          enter: () => {
            this.stop();
            this.faceTarget(true);
            this.telegraph(a);
          },
          update: (_, t) => {
            if (sim.player.health.dead) return this.fsm.go('idle');
            this.slowDown();
            this.faceTarget();
            if (t + 1 >= a.startup) this.fsm.go('fire');
          },
        },
        fire: {
          enter: () => {
            this.struck(a);
            sim.spawn(new EnemyShot(sim.newId('shot'), p.shot, e.id, e.body.x + e.facing * p.muzzle.x, e.body.y + p.muzzle.y, e.facing));
            this.cooldown = p.cooldownTicks;
          },
          update: () => this.fsm.go('recover'),
        },
        recover: {
          update: (_, t) => {
            this.slowDown();
            if (t + 1 >= a.recovery) this.fsm.go(this.afterHurt());
          },
        },
      },
      'idle',
    );
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
      case 'patrol':
        return { anim: 'walk' };
      case 'alert':
        return { anim: 'alert', t: Math.min(1, t / this.p.alertTicks) };
      case 'stalk':
        return { anim: Math.abs(this.enemy.body.vx) > 0.3 ? 'run' : 'idle' };
      case 'aim':
        return { anim: 'telegraph', phase: 'startup', t: Math.min(1, t / a.startup) };
      case 'fire':
        return { anim: 'attack', phase: 'active', t: 0.5 };
      case 'recover':
        return { anim: 'idle', phase: 'recovery', t: Math.min(1, t / a.recovery) };
      default:
        return { anim: 'idle' };
    }
  }
}
