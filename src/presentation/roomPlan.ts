import type { Rect } from '@/core/math';
import { axisPlan, ENV_CONTRACT, planTiles, slotKey, stripCover, type EnvLook } from './environment';

/**
 * WHAT TO DRAW OF A ROOM'S OWN DATA (docs/ART-PIPELINE-2D.md, part M): the pure half of the view that replaces the blockout with pictures. Given the room's solids
 * and the size of each piece of art the pack has, it answers — as plain numbers — which cell of which piece goes where: the fill of every block, the cap on the
 * tops that are open to the sky, the edges on the sides that face the air, the body and the ends of a platform, the column of a door. It never sees a picture,
 * a texture or Pixi, and it never moves a collider: the room's data is the truth and the art is cut to it (the last cell of a repetition is clipped to what is left,
 * never scaled).
 *
 * World metres, +y up (the view flips y in one place, `worldTransform.viewY`).
 */
export interface PlanSolid {
  id: string;
  rect: Rect;
  kind?: 'solid' | 'oneway';
  material?: string;
}

export interface PlanRoom {
  solids: ReadonlyArray<PlanSolid>;
  gates?: ReadonlyArray<{ id: string; solid: string }>;
}

/** What the plan needs to know of a piece of art: how big one cell is, in metres, how many cells it has and how it says it is drawn. */
export interface PieceInfo {
  /** Frames of its `idle` clip (the cells of a grid, or its variants). */
  frames: number;
  /** One cell, metres. */
  w: number;
  h: number;
  look: EnvLook;
}

/** The piece for a slot of the contract, or `null` when the art has none. */
export type PieceLookup = (role: 'solid' | 'platform' | 'door', subject: string, part: string) => PieceInfo | null;

/** One rectangle of one cell of one piece. The part of the cell that shows is `u0…u1` across and `v0…v1` down, as fractions of the frame (v counted from its top). */
export interface Draw {
  /** The slot key of the piece (`solid:stone:fill`). */
  slot: string;
  frame: number;
  /** Left edge and TOP edge of what is drawn, metres; its size. */
  x: number;
  top: number;
  w: number;
  h: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** `stretch`: the picture is a soft light, not a tile: the view fits it to the rectangle (the one exception to "never scaled"). */
  fit?: 'stretch';
}

export interface TerrainPlan {
  /** Back to front: every fill, then every edge, then every cap, then the platforms. */
  draws: Draw[];
  /** The draws of each gate, so the view can fade a door as one. */
  gates: Map<string, Draw[]>;
  /** The solids (the door's included) the art draws completely: their blockout can go. */
  dressed: Set<string>;
  /** The slots the room's data asked for that the art does not have, `slot → solids`: the blockout keeps drawing those. */
  lacking: Map<string, string[]>;
}

const EXPOSED_EPS = 0.05;

/** The parts of [a, b] that are not inside any of `cover` (each [c, d]), as a list of [from, to] with a length of more than a hair. */
export function subtractSpans(a: number, b: number, cover: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  let open: Array<[number, number]> = [[a, b]];
  for (const [c, d] of cover) {
    const next: Array<[number, number]> = [];
    for (const [from, to] of open) {
      if (d <= from || c >= to) next.push([from, to]);
      else {
        if (c > from) next.push([from, c]);
        if (d < to) next.push([d, to]);
      }
    }
    open = next;
  }
  return open.filter(([from, to]) => to - from > 1e-6);
}

export interface Exposed {
  /** Stretches of the top edge open to the sky: [x from, x to]. */
  top: Array<[number, number]>;
  /** Stretches of the left and of the right side that face air: [y from, y to]. */
  left: Array<[number, number]>;
  right: Array<[number, number]>;
}

/**
 * Which parts of a solid's edges can be SEEN: not the ones another solid sits on or leans against. A block on the ground has no cap where it stands and the
 * ground has none under it; a step against a wall has no edge where it touches. Only solids that block from all sides count (a platform is not a wall).
 */
export function exposedEdges(solid: PlanSolid, others: ReadonlyArray<PlanSolid>): Exposed {
  const { x0, y0, x1, y1 } = solid.rect;
  const above: Array<[number, number]> = [];
  const leftOf: Array<[number, number]> = [];
  const rightOf: Array<[number, number]> = [];
  for (const o of others) {
    if (o === solid || o.kind === 'oneway') continue;
    const r = o.rect;
    // covers the strip just above the top edge
    if (r.y0 < y1 + EXPOSED_EPS && r.y1 > y1 + EXPOSED_EPS) above.push([Math.max(x0, r.x0), Math.min(x1, r.x1)]);
    // covers the strip just outside the left / right side
    if (r.x0 < x0 - EXPOSED_EPS && r.x1 > x0 - EXPOSED_EPS) leftOf.push([Math.max(y0, r.y0), Math.min(y1, r.y1)]);
    if (r.x0 < x1 + EXPOSED_EPS && r.x1 > x1 + EXPOSED_EPS) rightOf.push([Math.max(y0, r.y0), Math.min(y1, r.y1)]);
  }
  return { top: subtractSpans(x0, x1, above.filter(([a, b]) => b > a)), left: subtractSpans(y0, y1, leftOf.filter(([a, b]) => b > a)), right: subtractSpans(y0, y1, rightOf.filter(([a, b]) => b > a)) };
}

const frameOf = (piece: PieceInfo, col: number, row: number): number => {
  const g = piece.look.grid;
  if (g === null) return 0;
  return ((col % g.cols) + g.cols) % g.cols + g.cols * (((row % g.rows) + g.rows) % g.rows);
};

/** Whether a rectangle (left, top, w, h) touches the view. */
const visible = (view: Rect | undefined, x: number, top: number, w: number, h: number): boolean => view === undefined || (x < view.x1 && x + w > view.x0 && top > view.y0 && top - h < view.y1);

/** A whole repetition of a piece over a rectangle, from its top-left corner: whole cells, the last column and the last row clipped to what is left. */
function fillDraws(slot: string, piece: PieceInfo, rect: Rect, view: Rect | undefined, out: Draw[]): void {
  const plan = planTiles(rect, { w: piece.w, h: piece.h });
  for (let r = 0; r < plan.rows.count; r++) {
    const rowH = r < plan.rows.whole ? plan.cellH : plan.rows.rest;
    const top = plan.originY - r * plan.cellH;
    for (let c = 0; c < plan.cols.count; c++) {
      const colW = c < plan.cols.whole ? plan.cellW : plan.cols.rest;
      const x = plan.originX + c * plan.cellW;
      if (!visible(view, x, top, colW, rowH)) continue;
      out.push({ slot, frame: frameOf(piece, c, r), x, top, w: colW, h: rowH, u0: 0, u1: colW / plan.cellW, v0: 0, v1: rowH / plan.cellH });
    }
  }
}

/** A row of a piece along [from, to] at a given top: whole cells, the last one clipped (it keeps the left part of the frame). */
function rowDraws(slot: string, piece: PieceInfo, from: number, to: number, top: number, shift: number, view: Rect | undefined, out: Draw[]): void {
  const axis = axisPlan(to - from, piece.w);
  for (let i = 0; i < axis.count; i++) {
    const w = i < axis.whole ? piece.w : axis.rest;
    const x = from + i * piece.w;
    if (!visible(view, x, top, w, piece.h)) continue;
    out.push({ slot, frame: frameOf(piece, i + shift, 0), x, top, w, h: piece.h, u0: 0, u1: w / piece.w, v0: 0, v1: 1 });
  }
}

/** A column of a piece down [bottom, top] at a given x, from the TOP (a side edge): whole cells, the last one clipped at the bottom. */
function columnDraws(slot: string, piece: PieceInfo, x: number, top: number, bottom: number, shift: number, view: Rect | undefined, out: Draw[]): void {
  const axis = axisPlan(top - bottom, piece.h);
  for (let j = 0; j < axis.count; j++) {
    const h = j < axis.whole ? piece.h : axis.rest;
    const t = top - j * piece.h;
    if (!visible(view, x, t, piece.w, h)) continue;
    out.push({ slot, frame: frameOf(piece, 0, j + shift), x, top: t, w: piece.w, h, u0: 0, u1: 1, v0: 0, v1: h / piece.h });
  }
}

/**
 * The draws of a room's own data: solids (fill, cap, edges), platforms (body, ends) and doors (column, top, bottom), by the pieces the art has for each material.
 * `view` is the part of the world that can ever be on screen (the camera's range plus the visible width): cells outside it are not made.
 */
export function planTerrain(room: PlanRoom, piece: PieceLookup, view?: Rect): TerrainPlan {
  const fills: Draw[] = [];
  const edges: Draw[] = [];
  const caps: Draw[] = [];
  const platforms: Draw[] = [];
  const gates = new Map<string, Draw[]>();
  const dressed = new Set<string>();
  const lacking = new Map<string, string[]>();
  const lack = (slot: string, id: string): void => {
    const list = lacking.get(slot) ?? [];
    list.push(id);
    lacking.set(slot, list);
  };
  const gateOf = new Map((room.gates ?? []).map((g) => [g.solid, g.id]));
  const blocks = room.solids.filter((s) => s.kind !== 'oneway' && !gateOf.has(s.id));

  for (const s of room.solids) {
    const material = s.material ?? 'stone';
    const { x0, y0, x1, y1 } = s.rect;
    const gate = gateOf.get(s.id);
    if (gate !== undefined) {
      const out: Draw[] = [];
      const body = piece('door', material, 'body');
      if (!body) {
        lack(slotKey('door', material, 'body'), s.id);
        continue;
      }
      // a column up the door from its bottom, the last cell clipped at the top (it keeps the BOTTOM of the frame)
      const axis = axisPlan(y1 - y0, body.h);
      for (let j = 0; j < axis.count; j++) {
        const h = j < axis.whole ? body.h : axis.rest;
        const bottom = y0 + j * body.h;
        const cols = axisPlan(x1 - x0, body.w);
        for (let c = 0; c < cols.count; c++) {
          const w = c < cols.whole ? body.w : cols.rest;
          out.push({ slot: slotKey('door', material, 'body'), frame: frameOf(body, c, j), x: x0 + c * body.w, top: bottom + h, w, h, u0: 0, u1: w / body.w, v0: 1 - h / body.h, v1: 1 });
        }
      }
      const bottomPiece = piece('door', material, 'bottom');
      if (bottomPiece) out.push({ slot: slotKey('door', material, 'bottom'), frame: 0, x: x0, top: y0 + bottomPiece.h - bottomPiece.look.reach, w: Math.min(bottomPiece.w, x1 - x0), h: bottomPiece.h, u0: 0, u1: Math.min(1, (x1 - x0) / bottomPiece.w), v0: 0, v1: 1 });
      const topPiece = piece('door', material, 'top');
      if (topPiece) out.push({ slot: slotKey('door', material, 'top'), frame: 0, x: x0, top: y1 + topPiece.look.rise, w: Math.min(topPiece.w, x1 - x0), h: topPiece.h, u0: 0, u1: Math.min(1, (x1 - x0) / topPiece.w), v0: 0, v1: 1 });
      // the light of the seal: one soft picture over the whole door, a little wider than it
      const glow = piece('door', material, 'glow');
      if (glow) {
        const pad = glow.look.reach;
        out.push({ slot: slotKey('door', material, 'glow'), frame: 0, x: x0 - pad, top: y1 + pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad, u0: 0, u1: 1, v0: 0, v1: 1, fit: 'stretch' });
      }
      gates.set(gate, out);
      dressed.add(s.id);
      continue;
    }
    if (s.kind === 'oneway') {
      const body = piece('platform', material, 'body');
      if (!body) {
        lack(slotKey('platform', material, 'body'), s.id);
        continue;
      }
      rowDraws(slotKey('platform', material, 'body'), body, x0, x1, y1 + body.look.rise, 0, view, platforms);
      const left = piece('platform', material, 'cap-l');
      if (left) platforms.push(...oneEnd(slotKey('platform', material, 'cap-l'), left, x0 - left.look.reach, y1 + left.look.rise, view));
      const right = piece('platform', material, 'cap-r');
      if (right) platforms.push(...oneEnd(slotKey('platform', material, 'cap-r'), right, x1 + right.look.reach - right.w, y1 + right.look.rise, view));
      dressed.add(s.id);
      continue;
    }
    const fill = piece('solid', material, 'fill');
    if (!fill) {
      lack(slotKey('solid', material, 'fill'), s.id);
      continue;
    }
    fillDraws(slotKey('solid', material, 'fill'), fill, s.rect, view, fills);
    dressed.add(s.id);
    const open = exposedEdges(s, blocks);
    const edgeL = piece('solid', material, 'edge-l');
    const edgeR = piece('solid', material, 'edge-r');
    for (const [from, to] of open.left) if (edgeL) columnDraws(slotKey('solid', material, 'edge-l'), edgeL, x0 - edgeL.look.reach, to, from, Math.round((y1 - to) / edgeL.h), view, edges);
    for (const [from, to] of open.right) if (edgeR) columnDraws(slotKey('solid', material, 'edge-r'), edgeR, x1 + edgeR.look.reach - edgeR.w, to, from, Math.round((y1 - to) / edgeR.h), view, edges);
    const cap = piece('solid', material, 'cap');
    if (cap) for (const [from, to] of open.top) rowDraws(slotKey('solid', material, 'cap'), cap, from, to, y1 + cap.look.rise, Math.round((from - x0) / cap.w), view, caps);
  }
  return { draws: [...fills, ...edges, ...caps, ...platforms], gates, dressed, lacking };
}

/** The end piece of a platform: one cell, placed whole. */
function oneEnd(slot: string, piece: PieceInfo, x: number, top: number, view: Rect | undefined): Draw[] {
  if (!visible(view, x, top, piece.w, piece.h)) return [];
  return [{ slot, frame: 0, x, top, w: piece.w, h: piece.h, u0: 0, u1: 1, v0: 0, v1: 1 }];
}

/** The roles the plan reads, so a test can hold the plan and the contract together. */
export const PLANNED_ROLES = ['solid', 'platform', 'door'] as const;
export const plannedParts = (role: (typeof PLANNED_ROLES)[number]): readonly string[] => ENV_CONTRACT[role].parts;

export interface StripPlan {
  /** Where the bottom of the strip is, in the layer's own coordinates (metres, +y up), and the left edge of each copy. */
  bottom: number;
  xs: number[];
  /** The strip is tall enough to fill the screen at every height the camera can have: otherwise the sky shows above or below it. */
  coversView: boolean;
  /** How tall it has to be, metres. */
  needed: number;
}

/**
 * A seamless strip across a parallax layer (docs/ARCHITECTURE-2D.md §7.4: screen = S·(local − f·P) + C): the copies that cover the layer's span, and where its bottom
 * stands so that the screen is filled at every height the camera has. The centre of the view shows the layer at f × the camera's height, so the strip must span
 * from f × (the lowest centre) − half the view to f × (the highest centre) + half the view, plus a margin: the camera's range is the room's, the view is as tall as
 * the tallest the room ever shows (`viewHeight`).
 */
export function planStrip(bounds: Rect, factor: number, stripWidth: number, stripHeight: number, viewHeight: number, margin = 0.3): StripPlan {
  const half = viewHeight / 2;
  const lowest = bounds.y0 + half;
  const highest = Math.max(lowest, bounds.y1 - half);
  const bottom = factor * lowest - half - margin;
  const top = factor * highest + half + margin;
  const cover = stripCover(bounds, factor, stripWidth);
  return { bottom, xs: Array.from({ length: cover.count }, (_, i) => cover.x0 + i * stripWidth), coversView: bottom + stripHeight >= top - 1e-6, needed: top - bottom };
}

export interface CropRects {
  /** The rectangle of the page the visible pixels are in. */
  frame: { x: number; y: number; w: number; h: number };
  /** The size of the cropped picture and where its visible pixels sit in it. */
  orig: { w: number; h: number };
  trim: { x: number; y: number; w: number; h: number };
}

/**
 * The part of a trimmed atlas frame that is left after keeping only `keep` — a rectangle in the pixels of the ORIGINAL (untrimmed) picture. The packer cuts the transparent
 * border off a frame and records where its pixels sit (`trim`, inside `orig`); a clipped cell must keep the same alignment, so its new frame, size and trim are worked out
 * here, as numbers. `null` when nothing visible is left.
 */
export function cropFrame(
  frame: { x: number; y: number; w: number; h: number },
  orig: { w: number; h: number },
  trim: { x: number; y: number; w: number; h: number } | null,
  keep: { x0: number; y0: number; x1: number; y1: number },
): CropRects | null {
  const t = trim ?? { x: 0, y: 0, w: orig.w, h: orig.h };
  const x0 = Math.max(keep.x0, t.x);
  const y0 = Math.max(keep.y0, t.y);
  const x1 = Math.min(keep.x1, t.x + t.w);
  const y1 = Math.min(keep.y1, t.y + t.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return {
    frame: { x: frame.x + (x0 - t.x), y: frame.y + (y0 - t.y), w: x1 - x0, h: y1 - y0 },
    orig: { w: keep.x1 - keep.x0, h: keep.y1 - keep.y0 },
    trim: { x: x0 - keep.x0, y: y0 - keep.y0, w: x1 - x0, h: y1 - y0 },
  };
}
