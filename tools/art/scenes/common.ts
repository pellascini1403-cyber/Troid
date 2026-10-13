import { exposedEdges, type PlanSolid } from '../../../src/presentation/roomPlan';
import type { Placement, RoomScene, SceneLayer } from '../../../src/presentation/roomScene';
import { SCENE_VERSION } from '../../../src/presentation/roomScene';
import type { Rng } from '../painter/rng';

/** What the composers of the scenes of the rooms share: where the open tops of a room are, how a piece is placed, a weighted choice. */
export interface RoomLike {
  id: string;
  solids: ReadonlyArray<{ id: string; kind?: string; material?: string; rect: { x0: number; y0: number; x1: number; y1: number } }>;
  gates?: ReadonlyArray<{ solid: string }>;
  camera?: { bounds?: { x0: number; y0: number; x1: number; y1: number } };
}

/** The factor of the foreground layer (`PARALLAX_FACTOR.foreground`), and the half-height of the view the room shows at its tallest. */
const FOREGROUND_FACTOR = 1.2;
const HALF_VIEW_HEIGHT = 6.75;

/**
 * How high the TOP of a foreground piece must reach, in the layer's own metres, so that its top edge is never on screen: the foreground scrolls 1.2 × the camera, and when the hero
 * is on the highest ledge the camera is at the top of its range and shows the most. A piece that ends lower shows a flat edge hanging in the air (they are painted to hang from the top).
 */
export const foregroundTop = (room: RoomLike): number => FOREGROUND_FACTOR * ((room.camera?.bounds?.y1 ?? 11) - HALF_VIEW_HEIGHT) + HALF_VIEW_HEIGHT + 0.5;

export type Layers = Partial<Record<SceneLayer, Placement[]>>;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const push = (layers: Layers, layer: SceneLayer, p: Placement): void => {
  (layers[layer] ??= []).push(p);
};

export const sceneOf = (room: RoomLike, layers: Layers): RoomScene => ({ sceneVersion: SCENE_VERSION, room: room.id, layers });

/** The open tops of a room's solid ground (a wall is not ground), at least 1.1 m long: where things grow and lie. */
export function surfacesOf(room: RoomLike): Array<{ solid: PlanSolid; a: number; b: number; y: number }> {
  const solids = room.solids as unknown as PlanSolid[];
  const blocks = solids.filter((s) => s.kind !== 'oneway' && !room.gates?.some((g) => g.solid === s.id));
  const out: Array<{ solid: PlanSolid; a: number; b: number; y: number }> = [];
  for (const s of blocks) {
    if (s.id.startsWith('wall_')) continue;
    for (const [a, b] of exposedEdges(s, blocks).top) if (b - a >= 1.1) out.push({ solid: s, a, b, y: s.rect.y1 });
  }
  return out;
}

/** Weighted choice. */
export const choose = <T>(rng: Rng, items: ReadonlyArray<readonly [T, number]>): T => {
  const total = items.reduce((n, [, w]) => n + w, 0);
  let r = rng.next() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1]![0];
};

/**
 * Dust, spores and sparks in the air (docs/PROMPT8-LOG.md, phase I): fields of the motes piece (16 × 12 m of soft light, drifting) spread along the whole room, so that the air is never empty, in front of the action
 * (the light overlay: added) and dim. Where they stand, how big and how bright is seeded: a rebuild changes nothing. `avoid` leaves clear the places the hand already put a field in (or where the eye must
 * stay free: the arena, whose telegraphs are what shout).
 */
export function scatterMotes(
  layers: Layers,
  rng: Rng,
  room: RoomLike,
  o: { every: number; yBottom: number; alpha: readonly [number, number]; scale: readonly [number, number]; tints: readonly number[]; avoid?: ReadonlyArray<readonly [number, number]> },
): void {
  const b = room.camera?.bounds;
  const x0 = b?.x0 ?? 0;
  const x1 = b?.x1 ?? 100;
  for (let x = x0 + o.every * 0.5; x < x1; x += o.every * rng.range(0.85, 1.15)) {
    const alpha = round2(rng.range(o.alpha[0], o.alpha[1]));
    const scale = round2(rng.range(o.scale[0], o.scale[1]));
    const flip = rng.chance(0.5);
    const tint = o.tints[Math.floor(rng.next() * o.tints.length) % o.tints.length]!;
    const at = round2(x);
    if (o.avoid?.some(([a, c]) => at >= a && at <= c)) continue;
    push(layers, 'lightOverlay', { sprite: 'motes_a', x: at, y: o.yBottom, scale, alpha, flip, tint, motion: 'drift' });
  }
}
