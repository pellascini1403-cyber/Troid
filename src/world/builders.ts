import type { Rect } from '@/core/math';
import type { SolidDef } from './RoomDefinition';

/**
 * Tiny authoring helpers so rooms read like level-design notes instead of coordinate soup.
 * All return plain `SolidDef` data; nothing here is special to the engine.
 */

export function rect(x0: number, y0: number, x1: number, y1: number): Rect {
  if (!(x0 < x1 && y0 < y1)) throw new Error(`invalid rect ${x0},${y0},${x1},${y1}`);
  return { x0, y0, x1, y1 };
}

/** A solid block. */
export function block(id: string, x0: number, y0: number, x1: number, y1: number, material = 'stone', tag?: string): SolidDef {
  return { id, rect: rect(x0, y0, x1, y1), kind: 'solid', material, ...(tag ? { tag } : {}) };
}

/** Ground slab whose walkable TOP is at `top`, `depth` metres thick. */
export function ground(id: string, x0: number, x1: number, top = 0, depth = 6, material = 'earth'): SolidDef {
  return block(id, x0, top - depth, x1, top, material);
}

/** A jump-through platform whose walkable top is at `top`. */
export function oneWay(id: string, x0: number, x1: number, top: number, thickness = 0.3, material = 'wood'): SolidDef {
  return { id, rect: rect(x0, top - thickness, x1, top), kind: 'oneway', material };
}
