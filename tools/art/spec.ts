/**
 * HOW A PACK OF SCENERY IS DESCRIBED FOR THE PAINTER (docs/ART-PIPELINE-2D.md, part M): a list of sprite sets, each one a piece of the painter's catalogue (`painter/pieces.ts`)
 * with its parameters, cut into the frames of its `idle` clip, and the tags that say what it is for. `tools/art/build.ts` turns it into `art/<pack>/…` — frames and manifest —
 * and `npm run assets:pack` into what ships. The painter is a TOOL: what it writes is an ordinary art folder, checked and packed like one a person made.
 */
import type { RoomScene } from '../../src/presentation/roomScene';

export interface SpriteSpec {
  id: string;
  /** What the piece is for: `role:solid`, `material:earth`, `part:cap`, `grid:4x1`, `rise:0.34`… (`presentation/environment.ts`). */
  tags: string[];
  /** The painter's piece, its parameters, and how the picture is cut into frames (a periodic picture of `cols × rows` cells). */
  piece: string;
  params?: Record<string, unknown>;
  cols?: number;
  rows?: number;
  /** The picture is mirrored left to right before it is cut (the right-hand twin of a left-hand piece). */
  mirror?: boolean;
  /** Pivot, normalised over the frame: the contract of the role says which. */
  pivot: [number, number];
  /** Pixels per metre of this piece (default: the pack's). */
  ppm?: number;
  /** The size of a prop in metres (the painter makes it at the pack's density): the scenes need it to place the piece. */
  sizeM?: [number, number];
  comment?: string;
}

export interface PackSpec {
  id: string;
  /** The rooms that need it: the zone policy fetches it when the hero is in one of them. */
  zones: string[];
  ppm: number;
  comment: string;
  sprites: SpriteSpec[];
  /** The scenes of the pack: room id → the function that makes it (see `scenes/`). The build writes each one to `art/<pack>/scenes/<room>.json`. */
  scenes?: Record<string, (pack: PackSpec) => RoomScene>;
}

/** The size of a sprite of a pack in metres: what a scene needs to put it where it stands. */
export function sizeOf(pack: PackSpec, id: string): { w: number; h: number; ppm: number } {
  const s = pack.sprites.find((x) => x.id === id);
  if (!s?.sizeM) throw new Error(`pack ${pack.id}: sprite "${id}" has no sizeM`);
  return { w: s.sizeM[0], h: s.sizeM[1], ppm: s.ppm ?? pack.ppm };
}
