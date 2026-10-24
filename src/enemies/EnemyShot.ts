import type { Rect } from '@/core/math';
import { TICK_SECONDS } from '@/core/time';
import type { SimEntity } from '@/gameplay/SimEntity';
import type { SimServices } from '@/gameplay/SimServices';

/**
 * What an enemy throws (docs/PROMPT21-LOG.md), as data: a spit that flies straight, a lob that falls in an arc, a wave that runs along the floor. Metres, seconds, ticks. It hurts the HERO through the combat system like every
 * blow of an enemy (damage, knockback, stun, hit-stop, i-frames), and it is not hurt by anything: it ends on the hero, on a wall, at the end of its flight or — a wave — where the floor ends.
 */
export interface ShotSpec {
  /** `air` flies (a spit, a lob); `ground` runs along the floor, following it up and down small steps, and ends at a wall or a drop. */
  mode: 'air' | 'ground';
  /** m/s along the direction it is thrown; for an arc, the horizontal speed. */
  speed: number;
  /** m/s upward at the start, and m/s² pulling it down (0: it flies straight). */
  vy?: number;
  gravity?: number;
  /** The size of its hit area. */
  size: { w: number; h: number };
  damage: number;
  knockback: { x: number; y: number };
  stun: number;
  hitStop: number;
  shake: number;
  /** Ticks it lives. */
  ttl: number;
  /** The id the blow carries (for the sound and the tests). */
  attackId: string;
}

export type ShotEnd = 'hit' | 'wall' | 'range' | 'edge';

/**
 * A shot in flight. A deterministic entity: a fixed distance a tick, whole ticks counted, never an accumulated float; it knows no VFX (it announces its end) and its view reads `x`, `y`, `prevX`, `prevY`, `facing` and `look`.
 */
export class EnemyShot implements SimEntity {
  readonly kind = 'enemyshot';
  expired = false;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  end: ShotEnd | null = null;
  private vy: number;
  private ticks = 0;
  private readonly hitSet = new Set<string>();
  private readonly swept: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(
    readonly id: string,
    readonly spec: Readonly<ShotSpec>,
    private readonly ownerId: string,
    x: number,
    y: number,
    readonly facing: 1 | -1,
  ) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vy = spec.vy ?? 0;
  }

  get look(): 'orb' | 'wave' {
    return this.spec.mode === 'ground' ? 'wave' : 'orb';
  }

  tick(sim: SimServices): void {
    if (this.expired) return;
    this.prevX = this.x;
    this.prevY = this.y;
    const s = this.spec;
    const nx = this.x + this.facing * s.speed * TICK_SECONDS;
    let ny = this.y;
    const hw = s.size.w / 2;
    const hh = s.size.h / 2;
    if (s.mode === 'ground') {
      // along the floor: the floor under the new x, if it is within a step up or a short way down; none: the wave is over
      const floor = this.floorAt(sim, nx, this.y - hh);
      if (floor === null) return this.finish(sim, 'edge');
      ny = floor + hh;
    } else {
      this.vy -= (s.gravity ?? 0) * TICK_SECONDS;
      ny = this.y + this.vy * TICK_SECONDS;
    }
    const sw = this.swept;
    sw.x0 = Math.min(this.x, nx) - hw;
    sw.x1 = Math.max(this.x, nx) + hw;
    sw.y0 = Math.min(this.y, ny) - hh + (s.mode === 'ground' ? 0.15 : 0);
    sw.y1 = Math.max(this.y, ny) + hh;
    if (sim.collision.overlapsSolid(sw)) return this.finish(sim, 'wall');
    this.x = nx;
    this.y = ny;
    this.ticks++;
    sim.combat.submit({
      ownerId: this.ownerId,
      team: 'enemy',
      rect: { x0: nx - hw, x1: nx + hw, y0: ny - hh, y1: ny + hh },
      attackId: s.attackId,
      damage: s.damage,
      knockback: { ...s.knockback },
      stun: s.stun,
      hitStop: s.hitStop,
      shake: s.shake,
      facing: this.facing,
      alreadyHit: this.hitSet,
      onConfirm: () => this.finish(sim, 'hit'),
    });
    if (this.ticks >= s.ttl) this.finish(sim, 'range');
  }

  dispose(): void {}

  /** The top of the floor under `x` that a wave at height `y` can follow: up to a 0.5 m step, down to 0.6 m. Null when there is none. */
  private floorAt(sim: SimServices, x: number, y: number): number | null {
    const probe: Rect = { x0: x - 0.05, x1: x + 0.05, y0: y - 0.6, y1: y + 0.5 };
    let best: number | null = null;
    for (const c of sim.collision.query(probe)) {
      const top = c.rect.y1;
      if (top > y + 0.5 || top < y - 0.6) continue;
      if (best === null || top > best) best = top;
    }
    return best;
  }

  private finish(sim: SimServices, reason: ShotEnd): void {
    if (this.expired) return;
    this.end = reason;
    this.expired = true;
    sim.bus.emit('enemyshot:ended', { id: this.id, x: this.x, y: this.y, reason });
  }
}
