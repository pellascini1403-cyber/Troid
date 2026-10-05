import type { Rect } from '@/core/math';
import type { AttackDefinition } from './AttackDefinition';

/**
 * World-space rect of an attack's hitbox for an attacker standing at (`x`, `feetY`) and facing `facing`.
 * The definition is authored facing right; facing left mirrors it around the body centre.
 */
export function attackRect(
  attack: Pick<AttackDefinition, 'hitbox'>,
  x: number,
  feetY: number,
  facing: 1 | -1,
  out: Rect,
): Rect {
  const { x: near, y, w, h } = attack.hitbox;
  const a = x + facing * near;
  const b = x + facing * (near + w);
  out.x0 = Math.min(a, b);
  out.x1 = Math.max(a, b);
  out.y0 = feetY + y;
  out.y1 = feetY + y + h;
  return out;
}
