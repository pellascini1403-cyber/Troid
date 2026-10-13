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
  /** Keep this fraction of the size of every frame (default 1): the piece is painted at full size and then resampled, and its manifest says the density it was left at (`ppm × scale`). For light that is soft anyway, which is the cheapest memory there is. */
  scale?: number;
  /** The size of a prop in metres (the painter makes it at the pack's density): the scenes need it to place the piece. */
  sizeM?: [number, number];
  /** Anchors the art declares (metres from the feet, +x forward, +y up): for a creature's body, `head` is where its eyes stand and `vfx_origin` where its sigil does. */
  anchors?: Partial<Record<'head' | 'vfx_origin', readonly [number, number]>>;
  comment?: string;
}

export interface PackSpec {
  id: string;
  /** What the pack draws (default `environment`): the enemies and the boss are of the `enemies` category — they are drawn over the world, with a transparent background — and the light of the effects is `vfx`. */
  category?: 'environment' | 'enemies' | 'vfx';
  /** When the game fetches it: with the rooms that need it (`zone`, the default) or at the start (`boot`: the effects are needed from the first blow). A `boot` pack has no zones. */
  load?: 'zone' | 'boot';
  /** The tags of the pack in the index and its manifest (default `ruins`). */
  tags?: string[];
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
