import type { AnchorPoint, AtlasMeta, SpriteSetDefinition } from './SpriteSetDefinition';
import type { AnchorId } from './vocabulary';

export interface ResolvedAnchor {
  /** Metres relative to the feet centre; +x is FORWARD for the art's facing (mirror by `facing` for world space). */
  x: number;
  y: number;
  /** True when no data existed and a proportional fallback was used (gameplay never needs null checks). */
  fallback: boolean;
}

/** Proportional anchors for sets that declare none, so `getAnchor` always answers. */
export function fallbackAnchor(id: AnchorId, height: number): AnchorPoint {
  switch (id) {
    case 'feet': return [0, 0];
    case 'head': return [0, 0.95 * height];
    case 'hand_r': return [0.22 * height, 0.5 * height];
    case 'weapon_grip': return [0.22 * height, 0.5 * height];
    case 'weapon_tip': return [0.7 * height, 0.45 * height];
    case 'vfx_origin': return [0, 0.5 * height];
    case 'projectile_origin': return [0.45 * height, 0.55 * height];
    case 'interaction': return [0, 0.6 * height];
  }
}

/**
 * Where an anchor is in a given frame. Precedence: the frame's own data (the sword moves per frame) → the set's fixed
 * anchor → a proportional fallback.
 */
export function resolveAnchor(
  def: Pick<SpriteSetDefinition, 'anchors' | 'height'>,
  meta: AtlasMeta | null,
  frame: string | null,
  id: AnchorId,
  out: ResolvedAnchor = { x: 0, y: 0, fallback: false },
): ResolvedAnchor {
  const perFrame = frame && meta ? meta.frames[frame]?.anchors?.[id] : undefined;
  const fixed = def.anchors?.[id];
  const p = perFrame ?? fixed;
  if (p) {
    out.x = p[0];
    out.y = p[1];
    out.fallback = false;
  } else {
    const f = fallbackAnchor(id, def.height);
    out.x = f[0];
    out.y = f[1];
    out.fallback = true;
  }
  return out;
}
