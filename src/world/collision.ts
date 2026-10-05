import { overlaps, type Rect } from '@/core/math';

export type ColliderKind = 'solid' | 'oneway';

export interface Collider {
  readonly id: string;
  /** Mutable so gates / moving pieces can change shape; call `CollisionWorld.update(c)` after editing. */
  rect: Rect;
  kind: ColliderKind;
  /** Disabled colliders are ignored (opened gates, broken walls) but keep their identity. */
  enabled: boolean;
  /** Free-form label for gameplay lookups ('gate:r02_door', 'breakable'…). */
  tag?: string;
}

/**
 * A moving thing with a box body. Position is the CENTRE OF THE FEET.
 * The world writes the contact flags; the owner reads them and decides what they mean.
 */
export interface KinematicBody {
  x: number;
  y: number;
  halfW: number;
  height: number;
  vx: number;
  vy: number;
  grounded: boolean;
  hitLeft: boolean;
  hitRight: boolean;
  hitCeiling: boolean;
  /** Collider currently under the feet (null in the air). */
  ground: Collider | null;
}

export function createBody(halfW: number, height: number): KinematicBody {
  return { x: 0, y: 0, halfW, height, vx: 0, vy: 0, grounded: false, hitLeft: false, hitRight: false, hitCeiling: false, ground: null };
}

export function bodyRect(b: KinematicBody, out: Rect): Rect {
  out.x0 = b.x - b.halfW;
  out.x1 = b.x + b.halfW;
  out.y0 = b.y;
  out.y1 = b.y + b.height;
  return out;
}

/** Largest displacement resolved in one sub-step: thinner than any collider we author (≥ 0.5 m), so no tunnelling. */
const MAX_STEP = 0.25;
/** Gap left between a body and the wall it pushed out of, so floating-point noise cannot re-penetrate. */
const SKIN = 1e-4;
/**
 * How far below the feet still counts as "standing on it". Collision resolution lands bodies exactly on the
 * surface, so this only has to absorb floating-point noise; any larger and `grounded` would fire a few
 * centimetres BEFORE touching down.
 */
const GROUND_PROBE = 0.015;
const CELL = 4;

/**
 * Static collision geometry + kinematic movement.
 *
 * Movement resolves X then Y with sub-steps (axis-separated sweep), the classic platformer approach: stable,
 * predictable and exact enough for frame-perfect jumps. Solids block from every side; one-way platforms
 * only stop a body that is falling onto them from above (and can be dropped through).
 */
export class CollisionWorld {
  private readonly colliders = new Map<string, Collider>();
  private readonly grid = new Map<number, Collider[]>();
  private stamp = 0;
  private readonly seen = new Map<Collider, number>();
  private readonly tmp: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private readonly scratch: Collider[] = [];

  get count(): number {
    return this.colliders.size;
  }

  add(collider: Collider): Collider {
    if (this.colliders.has(collider.id)) throw new Error(`duplicate collider id "${collider.id}"`);
    this.colliders.set(collider.id, collider);
    this.index(collider);
    return collider;
  }

  get(id: string): Collider | undefined {
    return this.colliders.get(id);
  }

  remove(collider: Collider): void {
    if (!this.colliders.delete(collider.id)) return;
    this.unindex(collider);
  }

  /** Re-indexes a collider after its rect changed. */
  update(collider: Collider): void {
    this.unindex(collider);
    this.index(collider);
  }

  clear(): void {
    this.colliders.clear();
    this.grid.clear();
    this.seen.clear();
  }

  all(): IterableIterator<Collider> {
    return this.colliders.values();
  }

  /** Enabled colliders overlapping `rect`. The returned array is reused: copy it if you keep it. */
  query(rect: Rect, out: Collider[] = this.scratch): Collider[] {
    out.length = 0;
    this.stamp++;
    const cx0 = Math.floor(rect.x0 / CELL);
    const cx1 = Math.floor(rect.x1 / CELL);
    const cy0 = Math.floor(rect.y0 / CELL);
    const cy1 = Math.floor(rect.y1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const bucket = this.grid.get(key(cx, cy));
        if (!bucket) continue;
        for (const c of bucket) {
          if (!c.enabled || this.seen.get(c) === this.stamp) continue;
          this.seen.set(c, this.stamp);
          if (overlaps(rect, c.rect)) out.push(c);
        }
      }
    }
    return out;
  }

  /** Is any enabled SOLID (not one-way) overlapping `rect`? */
  overlapsSolid(rect: Rect): boolean {
    for (const c of this.query(rect)) if (c.kind === 'solid') return true;
    return false;
  }

  /**
   * Would the body still be free of solids if it were `height` tall (feet where they are)? Used to stand up from a
   * crouch: only the band ABOVE the current body is checked, because the part already occupied cannot collide.
   * One-way platforms never block standing up.
   */
  hasRoom(b: KinematicBody, height: number): boolean {
    if (height <= b.height) return true;
    const r = this.tmp;
    r.x0 = b.x - b.halfW;
    r.x1 = b.x + b.halfW;
    r.y0 = b.y + b.height;
    r.y1 = b.y + height;
    return !this.overlapsSolid(r);
  }

  /**
   * Moves a body by (dx, dy), resolving collisions. Writes contact flags and zeroes the velocity component
   * that was blocked. `dropThrough` lets the body fall through one-way platforms this call.
   */
  moveBody(b: KinematicBody, dx: number, dy: number, dropThrough = false): void {
    b.hitLeft = b.hitRight = b.hitCeiling = false;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = dist > MAX_STEP ? Math.ceil(dist / MAX_STEP) : 1;
    const sx = dx / steps;
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx !== 0) this.stepX(b, sx);
      if (sy !== 0) this.stepY(b, sy, dropThrough);
    }
    this.probeGround(b);
  }

  /** Refreshes `grounded` / `ground` without moving (call after teleporting or toggling colliders). */
  probeGround(b: KinematicBody): void {
    b.ground = null;
    b.grounded = false;
    if (b.vy > 0.01) return; // rising: cannot be standing
    const r = this.tmp;
    r.x0 = b.x - b.halfW + 0.01;
    r.x1 = b.x + b.halfW - 0.01;
    r.y0 = b.y - GROUND_PROBE;
    r.y1 = b.y + 0.02;
    for (const c of this.query(r)) {
      const top = c.rect.y1;
      if (top > b.y + 0.02 || top < b.y - GROUND_PROBE) continue;
      if (c.kind === 'oneway' && b.y < top - 0.02) continue; // feet below the platform top: passing through
      b.grounded = true;
      b.ground = c;
      break;
    }
  }

  private stepX(b: KinematicBody, sx: number): void {
    b.x += sx;
    const rect = bodyRect(b, this.tmp);
    for (const c of this.query(rect)) {
      if (c.kind !== 'solid') continue;
      if (!overlaps(bodyRect(b, rect), c.rect)) continue;
      if (sx > 0) {
        b.x = c.rect.x0 - b.halfW - SKIN;
        b.hitRight = true;
      } else {
        b.x = c.rect.x1 + b.halfW + SKIN;
        b.hitLeft = true;
      }
      if ((sx > 0 && b.vx > 0) || (sx < 0 && b.vx < 0)) b.vx = 0;
    }
  }

  private stepY(b: KinematicBody, sy: number, dropThrough: boolean): void {
    const prevY = b.y;
    b.y += sy;
    const rect = bodyRect(b, this.tmp);
    for (const c of this.query(rect)) {
      if (!overlaps(bodyRect(b, rect), c.rect)) continue;
      if (c.kind === 'solid') {
        if (sy < 0) {
          b.y = c.rect.y1;
          if (b.vy < 0) b.vy = 0;
        } else {
          b.y = c.rect.y0 - b.height;
          b.hitCeiling = true;
          if (b.vy > 0) b.vy = 0;
        }
      } else if (sy < 0 && !dropThrough && prevY >= c.rect.y1 - 1e-6) {
        // one-way: only lands a body that was above it at the start of the step
        b.y = c.rect.y1;
        if (b.vy < 0) b.vy = 0;
      }
    }
  }

  private index(c: Collider): void {
    const { x0, y0, x1, y1 } = c.rect;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        const k = key(cx, cy);
        const bucket = this.grid.get(k);
        if (bucket) bucket.push(c);
        else this.grid.set(k, [c]);
      }
    }
  }

  private unindex(c: Collider): void {
    for (const [k, bucket] of this.grid) {
      const i = bucket.indexOf(c);
      if (i >= 0) {
        bucket.splice(i, 1);
        if (bucket.length === 0) this.grid.delete(k);
      }
    }
    this.seen.delete(c);
  }
}

function key(cx: number, cy: number): number {
  // Szudzik-like pairing on shifted ints; rooms are far smaller than ±32k cells.
  return (cx + 32768) * 65536 + (cy + 32768);
}
