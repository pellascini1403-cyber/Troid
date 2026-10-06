import type { Rect } from '@/core/math';
import type { CollisionWorld, KinematicBody } from '@/world/collision';

/**
 * What an enemy can perceive of the world: pure queries on the collision geometry (no state, no events, no view).
 * They answer "is there floor ahead?" and "can it see the player?", which is all a walking enemy needs to not
 * fall off ledges and not chase through walls.
 */

const PROBE_HALF_WIDTH = 0.05;

/**
 * Is there floor to step onto `reach` metres in front of the body? A thin probe below the leading edge looks for the
 * top of any collider (solid or one-way) within `drop` metres under the feet. A wall in front does not count as floor.
 */
export function floorAhead(world: CollisionWorld, b: KinematicBody, dir: 1 | -1, reach = 0.25, drop = 0.6): boolean {
  const x = b.x + dir * (b.halfW + reach);
  const probe: Rect = { x0: x - PROBE_HALF_WIDTH, x1: x + PROBE_HALF_WIDTH, y0: b.y - drop, y1: b.y + 0.05 };
  for (const c of world.query(probe)) {
    const top = c.rect.y1;
    if (top <= b.y + 0.05 && top >= b.y - drop) return true;
  }
  return false;
}

/** Does the segment (ax, ay) → (bx, by) cross the rectangle? (Liang–Barsky slab test; touching an edge counts as crossing.) */
export function segmentHitsRect(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const slab = (p: number, q: number): boolean => {
    // p: direction component; q: distance from the start to the slab's near side (q = start − min or max − start)
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return slab(-dx, ax - r.x0) && slab(dx, r.x1 - ax) && slab(-dy, ay - r.y0) && slab(dy, r.y1 - ay);
}

/** Is the straight line between two points cut by a SOLID? (One-way platforms never hide anything.) */
export function sightBlocked(world: CollisionWorld, ax: number, ay: number, bx: number, by: number): boolean {
  const pad = 0.01;
  const box: Rect = { x0: Math.min(ax, bx) - pad, x1: Math.max(ax, bx) + pad, y0: Math.min(ay, by) - pad, y1: Math.max(ay, by) + pad };
  for (const c of world.query(box)) {
    if (c.kind === 'solid' && segmentHitsRect(ax, ay, bx, by, c.rect)) return true;
  }
  return false;
}
