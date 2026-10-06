import type { ProjectileSpec } from '@/abilities/SkillDefinition';
import type { Rect } from '@/core/math';
import { TICK_SECONDS } from '@/core/time';
import type { SimEntity } from './SimEntity';
import type { SimServices } from './SimServices';

export type ProjectileEnd = 'hit' | 'wall' | 'range';

/**
 * A skill's projectile (the Spirit Bolt): a `SimEntity` that flies straight along its facing, submits its hit area to the
 * combat system on every tick, and ends on the FIRST thing it hurts (it does not pierce), on a wall, or after `range` metres.
 * Deterministic: it moves a fixed distance per tick and counts whole ticks, never an accumulated float.
 *
 * It knows no VFX: it announces its end (`projectile:ended`, with why and where) and the effects layer draws what it wants.
 * Its view reads `x / y / prevX / prevY / facing` (the interpolation of a rendered frame between two ticks).
 */
export class Projectile implements SimEntity {
  readonly kind = 'projectile';
  expired = false;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Why it ended (null while it flies, and when the room was unloaded under it). */
  end: ProjectileEnd | null = null;

  private ticks = 0;
  private readonly maxTicks: number;
  private readonly step: number;
  private readonly hitSet = new Set<string>();
  private readonly rect: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private readonly swept: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(
    readonly id: string,
    readonly skillId: string,
    private readonly spec: ProjectileSpec,
    private readonly ownerId: string,
    x: number,
    y: number,
    readonly facing: 1 | -1,
  ) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.step = spec.speed * TICK_SECONDS;
    this.maxTicks = Math.max(1, Math.ceil(spec.range / this.step - 1e-9));
  }

  tick(sim: SimServices): void {
    if (this.expired) return;
    this.prevX = this.x;
    this.prevY = this.y;
    const nx = this.x + this.facing * this.step;
    const hw = this.spec.size.w / 2;
    const hh = this.spec.size.h / 2;
    // a wall in the way ends it where it is (the area it covers this tick, from where it was to where it would be)
    const s = this.swept;
    s.x0 = Math.min(this.x, nx) - hw;
    s.x1 = Math.max(this.x, nx) + hw;
    s.y0 = this.y - hh;
    s.y1 = this.y + hh;
    if (sim.collision.overlapsSolid(s)) {
      this.finish('wall');
      return;
    }
    this.x = nx;
    this.ticks++;
    const r = this.rect;
    r.x0 = nx - hw;
    r.x1 = nx + hw;
    r.y0 = this.y - hh;
    r.y1 = this.y + hh;
    sim.combat.submit({
      ownerId: this.ownerId,
      team: 'player',
      rect: { ...r },
      attackId: this.skillId,
      damage: this.spec.damage,
      knockback: this.spec.knockback,
      stun: this.spec.stun,
      hitStop: this.spec.hitStop,
      shake: this.spec.shake,
      facing: this.facing,
      alreadyHit: this.hitSet,
      // the first confirmed hit is its last: it does not pierce
      onConfirm: () => this.finish('hit'),
    });
    if (this.ticks >= this.maxTicks && !this.expired) this.finish('range');
  }

  /** The room is unloaded or the entity is removed: say how it ended (an unload is not an ending). */
  dispose(sim: SimServices): void {
    if (this.end !== null) {
      sim.bus.emit('projectile:ended', { id: this.id, skillId: this.skillId, x: this.x, y: this.y, facing: this.facing, reason: this.end });
    }
  }

  private finish(reason: ProjectileEnd): void {
    if (this.expired) return;
    this.end = reason;
    this.expired = true;
  }
}
