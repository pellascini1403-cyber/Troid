import type { Rect } from '@/core/math';
import type { ArtIssue, ArtPack } from './artManifest';

/**
 * THE ENVIRONMENT'S ART CONTRACT (docs/ART-PIPELINE-2D.md, part I): how the scenery that will replace the blockout is laid out, drawn and delivered — as DATA and
 * PURE functions, with no scenery in it. The rule that governs the rest: a room is its DATA. Its collision is `RoomDefinition.solids` and nothing else; the picture
 * is a skin drawn over that data (clipped to it, never the other way round), so any art — more, less, none, the wrong one — leaves what the hero walks on, hits and
 * falls through exactly where the room data put it. Nothing of the simulation imports this module (`architecture.test.ts`).
 */

// ------------------------------------------------------------------------------------------------------------------------------------------------------- 1 · the layers

/**
 * Parallax factors (docs/ARCHITECTURE-2D.md §7.4): 1 = moves with the world, 0 = glued to the screen. The foreground moves FASTER than the world (> 1), so the
 * dark silhouettes in front of the action add depth.
 */
export const PARALLAX_FACTOR = {
  backdropFar: 0.15,
  backdropMid: 0.4,
  backdropNear: 0.75,
  foreground: 1.2,
} as const;

/** The widest view the game ever shows (21:9 at 13.5 m: 31.5 m), halved, plus a margin: how far a layer must reach past the camera range. */
export const HALF_VIEW = 16 + 8;

/**
 * A layer's horizontal span in its OWN coordinates for a camera range of `bounds`. A layer with factor f scrolls at f × the camera, so it has to span
 * f × (the room's width) plus the visible width on both sides — NOT the room's width.
 */
export function layerSpan(bounds: Rect, factor: number): { x0: number; x1: number } {
  return { x0: bounds.x0 * factor - HALF_VIEW, x1: bounds.x1 * factor + HALF_VIEW };
}

/** The kinds of environment art, by what each draws of a room's data. */
export const ENV_ROLES = ['solid', 'platform', 'door', 'hazard', 'backdrop', 'foreground', 'decor', 'interactive', 'seal', 'light'] as const;
export type EnvRole = (typeof ENV_ROLES)[number];

export interface EnvLayer {
  /** The key in the scene graph (`render/layers.ts`), which is also its label. */
  id: string;
  /** `screen`: in pixels, behind or in front of the world. `world`: in metres, moves with the camera. */
  space: 'screen' | 'world';
  /** 1 = moves with the camera; below 1 it lags (it is far away); above 1 it runs ahead (it is in front). `null`: not scenery. */
  parallax: number | null;
  blend: 'normal' | 'add';
  holds: string;
  /** The roles of art that are drawn in it. */
  art: readonly EnvRole[];
}

/** The scene, back to front. `createLayers` builds exactly this (a test holds them together). */
export const ENV_LAYERS: readonly EnvLayer[] = [
  { id: 'sky', space: 'screen', parallax: null, blend: 'normal', holds: 'the placeholder sky, glued to the screen behind the world', art: [] },
  { id: 'backdropFar', space: 'world', parallax: PARALLAX_FACTOR.backdropFar, blend: 'normal', holds: 'the far scenery: haze, ridges', art: ['backdrop'] },
  { id: 'backdropMid', space: 'world', parallax: PARALLAX_FACTOR.backdropMid, blend: 'normal', holds: 'the middle scenery: trunks, crowns', art: ['backdrop'] },
  { id: 'backdropNear', space: 'world', parallax: PARALLAX_FACTOR.backdropNear, blend: 'normal', holds: 'the near scenery: pillars, arches', art: ['backdrop'] },
  { id: 'propsBack', space: 'world', parallax: 1, blend: 'normal', holds: 'what stands behind the action: shrines, levers, props', art: ['decor', 'interactive'] },
  { id: 'terrain', space: 'world', parallax: 1, blend: 'normal', holds: 'the ground, the walls, the platforms, the doors and the thorns', art: ['solid', 'platform', 'door', 'hazard'] },
  { id: 'actors', space: 'world', parallax: 1, blend: 'normal', holds: 'the hero, the enemies and the boss, sorted by depth', art: [] },
  { id: 'fxNormal', space: 'world', parallax: 1, blend: 'normal', holds: 'ink, smoke and dust (dark things cannot be additive)', art: [] },
  { id: 'fxWorld', space: 'world', parallax: 1, blend: 'add', holds: 'light: projectiles, slashes, trails, sparks, the sigil of a seal', art: ['seal'] },
  { id: 'foreground', space: 'world', parallax: PARALLAX_FACTOR.foreground, blend: 'normal', holds: 'dark silhouettes in front of the action (never over the hero\'s band)', art: ['foreground', 'decor'] },
  { id: 'lightOverlay', space: 'world', parallax: 1, blend: 'add', holds: 'light shafts over the ways out, floating pickups, fog', art: ['light', 'interactive'] },
  { id: 'debug', space: 'world', parallax: 1, blend: 'normal', holds: 'the overlays of `?debug=1`', art: [] },
  { id: 'screen', space: 'screen', parallax: null, blend: 'normal', holds: 'in front, in pixels: vignette, flashes, fades, bars', art: [] },
];

// ------------------------------------------------------------------------------------------------------------------------------------------------------- 2 · the roles

/** How a role fills what the room data gives it. */
export type EnvFill =
  /** two-dimensional repetition from the top-left corner of the rectangle, clipped at its right and bottom edges; the `cap` row goes on the top edge, the `edge` columns on the sides */
  | 'tile'
  /** one row repeated along the length of the rectangle, clipped at its end */
  | 'tile-x'
  /** one column repeated up the height of the rectangle, from its bottom, clipped at its top */
  | 'tile-y'
  /** a seamless horizontal strip, repeated over the whole span of its parallax layer */
  | 'strip'
  /** placed once, at a point */
  | 'none';

export interface EnvRoleSpec {
  /** The data of a room it draws. */
  draws: string;
  /** The layers it lives in. */
  layers: readonly string[];
  fill: EnvFill;
  /** Where the sprite's pivot is, normalised over its frame. For a repeated piece it is the origin of the repetition. */
  pivot: readonly [number, number];
  /** What it is FOR, as a tag: `material:stone`, `kind:spikes`, `backdrop:ruins`. */
  subject: 'material' | 'kind' | 'backdrop' | null;
  /** The pieces a set of it may have (`part:cap`), and the ones it must have to count as delivered. */
  parts: readonly string[];
  required: readonly string[];
}

export const ENV_CONTRACT: Readonly<Record<EnvRole, EnvRoleSpec>> = {
  solid: { draws: 'the `solids` of kind solid — ground, walls, blocks — by their material', layers: ['terrain'], fill: 'tile', pivot: [0, 0], subject: 'material', parts: ['fill', 'cap', 'edge-l', 'edge-r'], required: ['fill'] },
  platform: { draws: 'the `solids` of kind oneway (the jump-through platforms) by their material', layers: ['terrain'], fill: 'tile-x', pivot: [0, 0], subject: 'material', parts: ['body', 'cap-l', 'cap-r'], required: ['body'] },
  door: { draws: 'the `gates`: the solid a flag opens, by its material (`gate`, `seal`); it dissolves over 0.6 s of real time when the gate opens', layers: ['terrain'], fill: 'tile-y', pivot: [0, 1], subject: 'material', parts: ['body', 'top', 'bottom'], required: ['body'] },
  hazard: { draws: 'the `hazards`, by kind: the cell is drawn as big as the art says, along the zone, from its floor', layers: ['terrain'], fill: 'tile-x', pivot: [0, 1], subject: 'kind', parts: ['cell'], required: ['cell'] },
  backdrop: { draws: '`art.backdrop` of a room: three seamless strips that scroll slower than the world', layers: ['backdropFar', 'backdropMid', 'backdropNear'], fill: 'strip', pivot: [0, 1], subject: 'backdrop', parts: ['far', 'mid', 'near'], required: ['far', 'mid', 'near'] },
  foreground: { draws: '`art.backdrop` of a room: dark silhouettes in front of the action', layers: ['foreground'], fill: 'strip', pivot: [0, 1], subject: 'backdrop', parts: ['strip'], required: [] },
  decor: { draws: 'props that collide with nothing: roots, statues, banners (no room lists them yet: the day one does, it will name a sprite of this role)', layers: ['propsBack', 'foreground'], fill: 'none', pivot: [0.5, 1], subject: null, parts: [], required: [] },
  interactive: { draws: 'the `interactables`, by kind: a shrine (`rest`), a pickup, a lever (`activate`), a door that opens (`open`)', layers: ['propsBack', 'lightOverlay'], fill: 'none', pivot: [0.5, 1], subject: 'kind', parts: [], required: [''] },
  seal: { draws: 'the `seals`: the sigil the hero has to hit', layers: ['fxWorld'], fill: 'none', pivot: [0.5, 0.5], subject: null, parts: [], required: [''] },
  light: { draws: 'the `exits`: the shaft of light over a way out', layers: ['lightOverlay'], fill: 'none', pivot: [0.5, 1], subject: null, parts: [], required: [] },
};

// ------------------------------------------------------------------------------------------------------------------------------------------------------- 3 · the repetition

export interface AxisPlan {
  /** Whole cells. */
  whole: number;
  /** What is left over, metres (0 when the length is a whole number of cells): the last cell is CLIPPED to it, never scaled. */
  rest: number;
  /** Cells to draw: the whole ones and the clipped one. */
  count: number;
}

const EPS = 1e-6;

/** How a cell of `cell` metres repeats along `length` metres. */
export function axisPlan(length: number, cell: number): AxisPlan {
  if (!(length > 0) || !(cell > 0)) return { whole: 0, rest: 0, count: 0 };
  let whole = Math.floor(length / cell + EPS);
  let rest = length - whole * cell;
  if (rest < EPS) rest = 0;
  if (cell - rest < EPS) {
    whole++;
    rest = 0;
  }
  return { whole, rest, count: whole + (rest > 0 ? 1 : 0) };
}

export interface TilePlan {
  /** The rectangle's top-left corner in the world (+y up): where the first cell's top-left goes. */
  originX: number;
  originY: number;
  cols: AxisPlan;
  rows: AxisPlan;
  cellW: number;
  cellH: number;
}

/**
 * How a tile of `cell` metres fills a rectangle of the room data: from its TOP-LEFT corner, whole cells, the last column and the last row clipped to what is
 * left. The rectangle is the truth and the art is cut to it: a block 1.4 × 1.1 m of a 1 m tile is one whole tile and a strip 0.4 m wide, and 0.1 m of the next row.
 */
export function planTiles(rect: Rect, cell: { w: number; h: number }): TilePlan {
  return { originX: rect.x0, originY: rect.y1, cols: axisPlan(rect.x1 - rect.x0, cell.w), rows: axisPlan(rect.y1 - rect.y0, cell.h), cellW: cell.w, cellH: cell.h };
}

/**
 * A seamless strip over a parallax layer: where the strip starts (the left end of the layer's span, in the layer's own coordinates) and how many copies of
 * `stripWidth` metres cover it.
 */
export function stripCover(bounds: Rect, factor: number, stripWidth: number): { x0: number; width: number; count: number } {
  const { x0, x1 } = layerSpan(bounds, factor);
  const width = x1 - x0;
  return { x0, width, count: stripWidth > 0 ? Math.ceil(width / stripWidth - EPS) : 0 };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- 4 · what the world asks for

/** The part of a room this module reads (a structural type: `RoomDefinition` fits it, and `presentation/` imports nothing of `world/`). */
export interface EnvRoomLike {
  id: string;
  solids: ReadonlyArray<{ id: string; kind?: 'solid' | 'oneway'; material?: string }>;
  gates?: ReadonlyArray<{ id: string; solid: string }>;
  hazards?: ReadonlyArray<{ kind: string }>;
  interactables?: ReadonlyArray<{ kind: string }>;
  seals?: ReadonlyArray<unknown>;
  exits?: ReadonlyArray<unknown>;
  art?: { backdrop: string };
}

/** One piece of art the world asks for. */
export interface EnvSlot {
  role: EnvRole;
  /** The material, kind or backdrop it is for (`null` for the roles with none). */
  subject: string | null;
  /** The piece (`fill`, `cap`, `far`…), or `''` for the roles with no parts. */
  part: string;
  /** Without it the world is not fully dressed: the blockout draws it instead. */
  required: boolean;
  /** The rooms that use it, in the order they were given. */
  rooms: string[];
  /** How many pieces of room data it draws. */
  uses: number;
}

export const slotKey = (role: string, subject: string | null, part: string): string => `${role}:${subject ?? ''}:${part}`;

/**
 * What the rooms ask of the art: one slot per (role, subject, part) that any of their data needs — every material of every solid, every door, every kind of hazard
 * and of interactable, the seals, the exits and the backdrop. Read from the DATA of the rooms, so it never goes out of date: a new material is a new slot.
 */
export function environmentSlots(rooms: readonly EnvRoomLike[]): EnvSlot[] {
  const slots = new Map<string, EnvSlot>();
  const add = (room: string, role: EnvRole, subject: string | null, part: string, required: boolean, uses = 1): void => {
    const key = slotKey(role, subject, part);
    const slot = slots.get(key) ?? { role, subject, part, required, rooms: [], uses: 0 };
    if (!slot.rooms.includes(room)) slot.rooms.push(room);
    slot.uses += uses;
    slots.set(key, slot);
  };
  const addParts = (room: string, role: EnvRole, subject: string | null, uses = 1): void => {
    const spec = ENV_CONTRACT[role];
    if (spec.parts.length === 0) add(room, role, subject, '', spec.required.includes(''), uses);
    for (const part of spec.parts) add(room, role, subject, part, spec.required.includes(part), uses);
  };
  for (const room of rooms) {
    const gateSolids = new Map((room.gates ?? []).map((g) => [g.solid, g.id]));
    for (const s of room.solids) {
      const material = s.material ?? 'stone';
      if (gateSolids.has(s.id)) addParts(room.id, 'door', material);
      else addParts(room.id, s.kind === 'oneway' ? 'platform' : 'solid', material);
    }
    for (const h of room.hazards ?? []) addParts(room.id, 'hazard', h.kind);
    for (const i of room.interactables ?? []) addParts(room.id, 'interactive', i.kind);
    for (const _ of room.seals ?? []) addParts(room.id, 'seal', null);
    for (const _ of room.exits ?? []) addParts(room.id, 'light', null);
    if (room.art) {
      addParts(room.id, 'backdrop', room.art.backdrop);
      addParts(room.id, 'foreground', room.art.backdrop);
    }
  }
  return [...slots.values()].sort((a, b) => ENV_ROLES.indexOf(a.role) - ENV_ROLES.indexOf(b.role) || (a.subject ?? '').localeCompare(b.subject ?? '') || a.part.localeCompare(b.part));
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- 5 · what a pack of art says

/** What an environment sprite says of itself, read from its tags (`role:solid`, `material:stone`, `part:cap`). */
export interface EnvTags {
  roles: string[];
  subject: string | null;
  parts: string[];
}

function tagValues(tags: readonly string[], key: string): string[] {
  return tags.filter((t) => t.startsWith(`${key}:`)).map((t) => t.slice(key.length + 1));
}

/** The tags of a sprite, split by what they say. `subject` is read by the role's own key (`material`, `kind` or `backdrop`) once the role is known. */
export function readEnvTags(tags: readonly string[]): EnvTags {
  const roles = tagValues(tags, 'role');
  const spec = roles.length === 1 ? ENV_CONTRACT[roles[0] as EnvRole] : undefined;
  const subjects = spec?.subject ? tagValues(tags, spec.subject) : [];
  return { roles, subject: subjects[0] ?? null, parts: tagValues(tags, 'part') };
}

const PIVOT_EPS = 1e-6;

/**
 * Does a pack of environment art say what it draws, the way the contract asks? Every sprite names ONE role, the subject that role needs and a piece it may have;
 * its pivot is where the role's repetition starts; one scale for the whole pack (tiles and props of a place share a pixel grid); two sprites do not claim the same piece.
 * With the `slots` of the world, it also says which required pieces the pack lacks — an error in a `final` pack, a warning in a provisional one (the blockout draws
 * what is missing). A pack that awaits its art is not looked at.
 */
export function environmentPackIssues(pack: Pick<ArtPack, 'id' | 'status' | 'sprites'>, slots: readonly EnvSlot[] = []): ArtIssue[] {
  const out: ArtIssue[] = [];
  if (pack.status === 'awaiting-art') return out;
  const claimed = new Map<string, string>();
  const have = new Set<string>();
  const scales = new Set<number>();
  for (const sprite of pack.sprites) {
    const path = `sprites.${sprite.id}`;
    const { roles, subject, parts } = readEnvTags(sprite.tags);
    scales.add(sprite.artPxPerMeter);
    if (roles.length !== 1) {
      out.push({ level: 'error', path, message: roles.length === 0 ? `says nothing of what it draws: it needs ONE "role:<role>" tag (${ENV_ROLES.join(', ')})` : `names ${roles.length} roles (${roles.join(', ')}): it needs exactly one` });
      continue;
    }
    const role = roles[0] as EnvRole;
    const spec = ENV_CONTRACT[role];
    if (!spec) {
      out.push({ level: 'error', path, message: `"role:${roles[0]}" is not a role of the environment (${ENV_ROLES.join(', ')})` });
      continue;
    }
    if (spec.subject && subject === null) out.push({ level: 'error', path, message: `a ${role} must say what it is for with a "${spec.subject}:<name>" tag` });
    if (spec.parts.length > 0) {
      if (parts.length !== 1) out.push({ level: 'error', path, message: `a ${role} must name which piece it is with ONE "part:<piece>" tag (${spec.parts.join(', ')})` });
      else if (!spec.parts.includes(parts[0]!)) out.push({ level: 'error', path, message: `"part:${parts[0]}" is not a piece of a ${role} (${spec.parts.join(', ')})` });
    } else if (parts.length > 0) out.push({ level: 'warn', path, message: `a ${role} has no pieces: "part:${parts[0]}" is ignored` });
    if (Math.abs(sprite.pivot[0] - spec.pivot[0]) > PIVOT_EPS || Math.abs(sprite.pivot[1] - spec.pivot[1]) > PIVOT_EPS) {
      out.push({ level: 'error', path, message: `its pivot is [${sprite.pivot[0]}, ${sprite.pivot[1]}] but a ${role} is placed from [${spec.pivot[0]}, ${spec.pivot[1]}] (${spec.fill === 'none' ? 'where it stands' : 'where its repetition starts'})` });
    }
    if (sprite.clips['idle'] === undefined) out.push({ level: 'error', path, message: 'has no "idle" clip: a still picture is an idle clip of one frame' });
    const part = spec.parts.length > 0 ? (parts[0] ?? '') : '';
    const key = slotKey(role, spec.subject ? subject : null, part);
    const other = claimed.get(key);
    if (other !== undefined) out.push({ level: 'warn', path, message: `claims the same piece as ${other} (${role}${subject ? ` ${subject}` : ''}${part ? ` ${part}` : ''}): only one can be drawn` });
    else claimed.set(key, sprite.id);
    have.add(key);
  }
  if (scales.size > 1) out.push({ level: 'warn', path: pack.id, message: `its sprites are drawn at ${[...scales].join(' and ')} pixels per metre: the pieces of one place share a pixel grid, or their seams do not meet` });
  const lacking = slots.filter((s) => s.required && !have.has(slotKey(s.role, s.subject, s.part)));
  for (const s of lacking) {
    out.push({
      level: pack.status === 'final' ? 'error' : 'warn',
      path: pack.id,
      message: `the world asks for the ${s.part ? `"${s.part}" of ` : ''}${s.role}${s.subject ? ` "${s.subject}"` : ''} (${s.rooms.join(', ')}) and the pack does not have it${pack.status === 'final' ? '' : ': the blockout draws it'}`,
    });
  }
  return out;
}
