import type { Rect } from '@/core/math';
import type { InteractableDef } from '@/interaction/Interactable';
import { rect } from './builders';
import type { BossDef, Destination, EntryDef, ExitDef, GateDef, HazardDef, RoomDefinition, SealDef, SolidDef, SpawnDef } from './RoomDefinition';

/**
 * ROOMS DRAWN IN LETTERS (docs/PROMPT21-LOG.md). A room of a metroidvania is mostly terrain, and terrain written as a list of rectangles is a list of numbers nobody can SEE: a platform one metre too far, a ceiling one metre
 * too low, a spike strip over nothing. Here the terrain is a picture — one character per square metre, rows from the TOP down — and the rest of the room (the entries, the enemies, the shrine, the doors) is placed on it by
 * MARKS: a letter or a digit in the picture says "here", and the room asks the picture where.
 *
 *   #  stone block (solid, blocks from every side)            G  earth ground (solid)
 *   -  jump-through platform; the hero stands on the TOP of its square, like on the top of a block
 *   ^  a strip of spikes standing on the solid under it (0.6 m high)
 *   =  lava: one metre of it to the square, standing on the solid under it; the squares of one pool (or of one fall, a column of them) are ONE hazard
 *   A–Z (but G)  a NAMED region: every square of that letter together is ONE solid with the id the `regions` table gives it (a door, a breakable wall)
 *   a–z, 0–9  a mark: empty air; its position is the FEET of someone standing on the floor of that square
 *   . or space  air
 *
 * The picture is also data the build can CHECK before anything runs: rows of one width, letters that mean something, regions that are single rectangles, spikes that stand on something, marks that exist. A mistake is an error
 * naming the room, not a hero who falls through the world in the middle of a playthrough. Everything it makes is plain `RoomDefinition` data: nothing downstream knows a room was drawn this way.
 *
 * Metres: +X right, +Y up; the bottom edge of the picture is y = 0, so the square at column c, row r (from the top, of H rows) spans x ∈ [c, c+1], y ∈ [H-1-r, H-r].
 */

export interface MapRegionSpec {
  /** The id of the solid. */
  id: string;
  material?: string;
  /** `oneway` makes the region a jump-through platform (a thin slab on the top of its squares); the default is a solid. */
  kind?: 'solid' | 'oneway';
  tag?: string;
}

export interface RoomMapSpec {
  /** The picture, from the TOP row to the BOTTOM one; every row the same width. */
  rows: readonly string[];
  /** The named regions (a capital letter other than `G`). */
  regions?: Readonly<Record<string, MapRegionSpec>>;
  /** The materials of the plain squares (stone `#`, earth `G`, platform `-`). */
  materials?: Partial<Record<'#' | 'G' | '-', string>>;
}

/** A mark found in the picture: where the feet of someone standing there are. */
export interface Mark {
  x: number;
  y: number;
  /** The column and the row (from the top) of its square. */
  col: number;
  row: number;
}

/** The thickness of a jump-through platform, metres (the same the hand-written rooms use). */
export const ONEWAY_THICKNESS = 0.3;
/** The height of a strip of spikes, metres. */
export const SPIKE_HEIGHT = 0.6;
/** How far from the side wall the zone of a way out reaches, metres, and how tall it is. */
export const EXIT_DEPTH = 2.4;
export const EXIT_HEIGHT = 4;

const SOLID_CHARS = new Set(['#', 'G']);
const isMark = (c: string): boolean => /^[a-z0-9]$/.test(c);
const isRegion = (c: string): boolean => /^[A-Z]$/.test(c) && c !== 'G';

/**
 * THE CANVAS: the way a picture is MADE. A room of sixty columns written as sixty letters a row is a room whose every row has to be counted; here the squares are painted by their place in metres — from the left, from the BOTTOM,
 * the same numbers the game uses (`y = 6` is a floor six metres up) — and what comes out is the same picture (`rows()`), which `RoomMap` reads. A square at (x, y) spans x … x + 1, y … y + 1. A stroke outside the canvas is an
 * error naming the room.
 */
export class RoomCanvas {
  private readonly cells: string[][];

  constructor(
    readonly roomId: string,
    readonly width: number,
    readonly height: number,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4) throw new Error(`[${roomId}] a canvas of ${width} × ${height} squares`);
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));
  }

  /** Paints every square of x0 … x1 × y0 … y1 (the far edges excluded) with `ch`. */
  fill(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    if (!Number.isInteger(x0) || !Number.isInteger(y0) || !Number.isInteger(x1) || !Number.isInteger(y1) || x0 > x1 || y0 > y1) throw new Error(`[${this.roomId}] a stroke ${x0},${y0} → ${x1},${y1} that is not whole squares in order`);
    if (x0 < 0 || y0 < 0 || x1 > this.width || y1 > this.height) throw new Error(`[${this.roomId}] a stroke ${x0},${y0} → ${x1},${y1} outside the canvas (${this.width} × ${this.height})`);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.cells[this.height - 1 - y]![x] = ch;
    return this;
  }

  /** Stone. */
  rock(x0: number, y0: number, x1: number, y1: number): this {
    return this.fill(x0, y0, x1, y1, '#');
  }

  /** Earth ground. */
  earth(x0: number, y0: number, x1: number, y1: number): this {
    return this.fill(x0, y0, x1, y1, 'G');
  }

  /** Air: carves out what was painted. */
  air(x0: number, y0: number, x1: number, y1: number): this {
    return this.fill(x0, y0, x1, y1, '.');
  }

  /** The border of the room: a wall on each side, a roof and a bedrock floor. */
  walls(): this {
    return this.rock(0, 0, 1, this.height).rock(this.width - 1, 0, this.width, this.height).rock(0, this.height - 1, this.width, this.height).rock(0, 0, this.width, 1);
  }

  /** A floor from x0 to x1 whose top is at `top`: earth on top of stone down to the bottom of the canvas. */
  ground(x0: number, x1: number, top = 2): this {
    return this.rock(x0, 0, x1, top - 1).earth(x0, top - 1, x1, top);
  }

  /** A pit: the floor taken away from x0 to x1, all the way down. */
  pit(x0: number, x1: number): this {
    return this.air(x0, 0, x1, this.height - 1);
  }

  /** A jump-through platform whose TOP is at y, from x0 to x1. */
  plat(x0: number, x1: number, y: number): this {
    return this.fill(x0, y - 1, x1, y, '-');
  }

  /** A strip of spikes standing on whatever has its top at y. */
  spikes(x0: number, x1: number, y: number): this {
    return this.fill(x0, y, x1, y + 1, '^');
  }

  /** Lava: a pool `depth` metres deep (a column of lava if it is tall: a fall) standing on whatever has its top at y. */
  lava(x0: number, x1: number, y: number, depth = 1): this {
    return this.fill(x0, y, x1, y + depth, '=');
  }

  /** A named region (a capital letter the room's `regions` table describes): one filled rectangle. */
  region(ch: string, x0: number, y0: number, x1: number, y1: number): this {
    return this.fill(x0, y0, x1, y1, ch);
  }

  /** A mark: the feet of someone standing at (x, y) — on a floor whose top is y. */
  mark(ch: string, x: number, y: number): this {
    return this.fill(x, y, x + 1, y + 1, ch);
  }

  /** Marks of the same letter along a row: `from`, `from + step`… up to (and including) `to`. */
  marks(ch: string, from: number, to: number, y: number, step = 1): this {
    for (let x = from; x <= to; x += step) this.mark(ch, x, y);
    return this;
  }

  /** The picture, from the top row to the bottom one. */
  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }

  toString(): string {
    return this.rows().join('\n');
  }
}

export class RoomMap {
  readonly width: number;
  readonly height: number;
  /** The extent of the picture. */
  readonly grid: Rect;
  readonly solids: SolidDef[] = [];
  readonly hazards: HazardDef[] = [];
  private readonly marks = new Map<string, Mark[]>();
  private readonly cells: readonly string[];

  constructor(
    readonly roomId: string,
    spec: RoomMapSpec,
  ) {
    const fail = (message: string): never => {
      throw new Error(`[${roomId}] ${message}`);
    };
    const rows = spec.rows.map((r) => r.replace(/ /g, '.'));
    if (rows.length === 0) fail('the picture has no rows');
    this.width = rows[0]!.length;
    this.height = rows.length;
    rows.forEach((r, i) => {
      if (r.length !== this.width) fail(`row ${i} is ${r.length} wide, the first is ${this.width}`);
    });
    this.cells = rows;
    this.grid = rect(0, 0, this.width, this.height);
    const materials = { '#': 'stone', G: 'earth', '-': 'wood', ...spec.materials };
    const regions = spec.regions ?? {};
    const solidAt = (c: number, r: number): boolean => {
      const ch = rows[r]?.[c];
      return ch !== undefined && (SOLID_CHARS.has(ch) || (isRegion(ch) && (regions[ch]?.kind ?? 'solid') === 'solid'));
    };
    const top = (r: number): number => this.height - r;

    // ---- what each character means; a letter nobody explained is an error ----
    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        const ch = rows[r]![c]!;
        if (ch === '.' || ch === '#' || ch === 'G' || ch === '-' || ch === '^' || ch === '=') continue;
        if (isMark(ch)) {
          const list = this.marks.get(ch) ?? [];
          list.push({ x: c + 0.5, y: this.height - 1 - r, col: c, row: r });
          this.marks.set(ch, list);
        } else if (isRegion(ch)) {
          if (!regions[ch]) fail(`the character "${ch}" at column ${c}, row ${r} is a region that the table does not describe`);
        } else fail(`the character "${ch}" at column ${c}, row ${r} means nothing`);
      }
    }

    // ---- solid squares → rectangles: runs along a row, joined to the identical run of the row above ----
    const open = new Map<string, { ch: string; c0: number; c1: number; r0: number; r1: number }>();
    const done: Array<{ ch: string; c0: number; c1: number; r0: number; r1: number }> = [];
    for (let r = 0; r <= this.height; r++) {
      const seen = new Set<string>();
      if (r < this.height) {
        let c = 0;
        while (c < this.width) {
          const ch = rows[r]![c]!;
          if (!SOLID_CHARS.has(ch)) {
            c++;
            continue;
          }
          let e = c;
          while (e + 1 < this.width && rows[r]![e + 1] === ch) e++;
          const key = `${ch}:${c}:${e}`;
          seen.add(key);
          const above = open.get(key);
          if (above && above.r1 === r - 1) above.r1 = r;
          else open.set(key, { ch, c0: c, c1: e, r0: r, r1: r });
          c = e + 1;
        }
      }
      for (const [key, run] of open) {
        if (!seen.has(key)) {
          done.push(run);
          open.delete(key);
        }
      }
    }
    done.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
    for (const run of done) {
      const ch = run.ch as '#' | 'G';
      this.solids.push({ id: `s_${run.c0}_${this.height - 1 - run.r1}`, rect: rect(run.c0, this.height - 1 - run.r1, run.c1 + 1, top(run.r0)), kind: 'solid', material: materials[ch] });
    }

    // ---- jump-through platforms: a thin slab on the top of each run of squares ----
    for (let r = 0; r < this.height; r++) {
      let c = 0;
      while (c < this.width) {
        if (rows[r]![c] !== '-') {
          c++;
          continue;
        }
        let e = c;
        while (e + 1 < this.width && rows[r]![e + 1] === '-') e++;
        this.solids.push({ id: `p_${c}_${top(r)}`, rect: rect(c, top(r) - ONEWAY_THICKNESS, e + 1, top(r)), kind: 'oneway', material: materials['-'] });
        c = e + 1;
      }
    }

    // ---- named regions: each letter is ONE solid, so its squares have to make one rectangle ----
    for (const [ch, def] of Object.entries(regions)) {
      if (!isRegion(ch)) fail(`the region "${ch}" must be a capital letter other than G`);
      const squares: Array<[number, number]> = [];
      for (let r = 0; r < this.height; r++) for (let c = 0; c < this.width; c++) if (rows[r]![c] === ch) squares.push([c, r]);
      if (squares.length === 0) fail(`the region "${ch}" (${def.id}) is not in the picture`);
      const c0 = Math.min(...squares.map((s) => s[0]));
      const c1 = Math.max(...squares.map((s) => s[0]));
      const r0 = Math.min(...squares.map((s) => s[1]));
      const r1 = Math.max(...squares.map((s) => s[1]));
      if (squares.length !== (c1 - c0 + 1) * (r1 - r0 + 1)) fail(`the region "${ch}" (${def.id}) is not one filled rectangle`);
      const oneway = def.kind === 'oneway';
      const area = oneway ? rect(c0, top(r0) - ONEWAY_THICKNESS, c1 + 1, top(r0)) : rect(c0, this.height - 1 - r1, c1 + 1, top(r0));
      this.solids.push({ id: def.id, rect: area, kind: oneway ? 'oneway' : 'solid', material: def.material ?? (oneway ? materials['-'] : materials['#']), ...(def.tag ? { tag: def.tag } : {}) });
    }

    // ---- spikes: strips on solid ground ----
    for (let r = 0; r < this.height; r++) {
      let c = 0;
      while (c < this.width) {
        if (rows[r]![c] !== '^') {
          c++;
          continue;
        }
        let e = c;
        while (e + 1 < this.width && rows[r]![e + 1] === '^') e++;
        for (let k = c; k <= e; k++) if (!solidAt(k, r + 1)) fail(`the spikes at column ${k}, row ${r} stand on nothing solid`);
        const y = this.height - 1 - r;
        this.hazards.push({ id: `spikes_${c}_${y}`, kind: 'spikes', rect: rect(c, y, e + 1, y + SPIKE_HEIGHT) });
        c = e + 1;
      }
    }

    // ---- lava: pools and falls, each one rectangle — a run of squares along a row, joined upward to the very same run above it (not to a longer or a shorter one: a fall that pours into a pool is a fall AND a pool) —
    // standing on something solid, or on other lava (the fall on the pool it feeds)
    const run = (r: number, c: number): number => {
      let e = c;
      while (e + 1 < this.width && rows[r]![e + 1] === '=') e++;
      return e;
    };
    const taken = new Set<string>();
    for (let r = this.height - 1; r >= 0; r--) {
      let c = 0;
      while (c < this.width) {
        if (rows[r]![c] !== '=' || taken.has(`${c},${r}`)) {
          c++;
          continue;
        }
        const e = run(r, c);
        let t = r;
        while (t - 1 >= 0 && rows[t - 1]![c] === '=' && run(t - 1, c) === e && (c === 0 || rows[t - 1]![c - 1] !== '=')) t--;
        for (let rr = t; rr <= r; rr++) for (let k = c; k <= e; k++) taken.add(`${k},${rr}`);
        for (let k = c; k <= e; k++) if (!solidAt(k, r + 1) && rows[r + 1]?.[k] !== '=') fail(`the lava at column ${k}, row ${r} stands on nothing solid`);
        this.hazards.push({ id: `lava_${c}_${this.height - 1 - r}`, kind: 'lava', rect: rect(c, this.height - 1 - r, e + 1, this.height - t) });
        c = e + 1;
      }
    }
    this.hazards.sort((a, b) => a.rect.x0 - b.rect.x0 || a.rect.y0 - b.rect.y0);

    const ids = this.solids.map((s) => s.id);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup) fail(`two solids are called "${dup}"`);
  }

  /** The one mark with this letter: an error if there is none or more than one. */
  at(mark: string): Mark {
    const list = this.marks.get(mark);
    if (!list || list.length === 0) throw new Error(`[${this.roomId}] the picture has no mark "${mark}"`);
    if (list.length > 1) throw new Error(`[${this.roomId}] the mark "${mark}" is in the picture ${list.length} times (use all())`);
    return list[0]!;
  }

  /** Every mark with this letter, top row first and left to right. */
  all(mark: string): Mark[] {
    const list = this.marks.get(mark);
    if (!list || list.length === 0) throw new Error(`[${this.roomId}] the picture has no mark "${mark}"`);
    return list;
  }

  has(mark: string): boolean {
    return this.marks.has(mark);
  }

  /** The marks the picture has. */
  markNames(): string[] {
    return [...this.marks.keys()].sort();
  }

  /** The character of a square. */
  cell(col: number, row: number): string {
    return this.cells[row]?.[col] ?? '#';
  }

  // ------------------------------------------------------------------------------------------------ the pieces of a room, placed by mark

  entry(id: string, mark: string, facing: 1 | -1 = 1): EntryDef {
    const m = this.at(mark);
    return { id, x: m.x, y: m.y, facing };
  }

  spawn(id: string, enemy: string, mark: string, opts: { facing?: 1 | -1; defeatFlag?: string } = {}): SpawnDef {
    const m = this.at(mark);
    return { id, enemy, x: m.x, y: m.y, facing: opts.facing ?? -1, ...(opts.defeatFlag ? { defeatFlag: opts.defeatFlag } : {}) };
  }

  /** One spawn for each square of the letter, numbered `${prefix}1`, `${prefix}2`…, in the order of the picture. */
  spawns(prefix: string, enemy: string, mark: string, opts: { facing?: 1 | -1; defeatFlag?: (n: number) => string } = {}): SpawnDef[] {
    return this.all(mark).map((m, i) => ({ id: `${prefix}${i + 1}`, enemy, x: m.x, y: m.y, facing: opts.facing ?? -1, ...(opts.defeatFlag ? { defeatFlag: opts.defeatFlag(i + 1) } : {}) }));
  }

  /**
   * A way out in a side wall: the zone touches the wall and reaches `EXIT_DEPTH` metres in, standing on the floor of the mark. The entry the other room puts the hero at is never inside it
   * (the world validator checks that), so the mark of the entry has to be farther in than that.
   */
  exitSide(id: string, side: 'west' | 'east', mark: string, to: Destination, opts: { requires?: string; end?: boolean } = {}): ExitDef {
    const y = this.at(mark).y;
    const r = side === 'west' ? rect(1, y, 1 + EXIT_DEPTH, y + EXIT_HEIGHT) : rect(this.width - 1 - EXIT_DEPTH, y, this.width - 1, y + EXIT_HEIGHT);
    return { id, rect: r, to, ...(opts.requires ? { requires: opts.requires } : {}), ...(opts.end ? { end: true } : {}) };
  }

  /** The way out of the WORLD in a side wall (the end of the adventure): the same zone as a door, and it leads nowhere. */
  endSide(id: string, side: 'west' | 'east', mark: string, opts: { requires?: string } = {}): ExitDef {
    const { to: _to, ...exit } = this.exitSide(id, side, mark, { room: '', entry: '' }, opts);
    return { ...exit, end: true };
  }

  /**
   * A way out through the roof or the floor: a zone of `width` metres centred on the mark, `depth` metres deep, at the top (`north`) or the bottom (`south`) of the picture. A hole in a floor wants a shallow zone (`depth` 1: a hero who
   * stands on its lip, feet two metres up, does not touch it; one who falls in does).
   */
  exitShaft(id: string, side: 'north' | 'south', mark: string, to: Destination, opts: { width?: number; depth?: number; requires?: string } = {}): ExitDef {
    const m = this.at(mark);
    const w = (opts.width ?? 4) / 2;
    const d = opts.depth ?? 2.5;
    const r = side === 'north' ? rect(m.x - w, this.height - 0.5 - d, m.x + w, this.height - 0.5) : rect(m.x - w, 0.5, m.x + w, 0.5 + d);
    return { id, rect: r, to, ...(opts.requires ? { requires: opts.requires } : {}) };
  }

  /** A shrine to rest at, standing on the floor of the mark, resting at the entry called `entryId` (which the room must have). */
  shrine(mark: string, entryId = 'rest', id = 'shrine'): InteractableDef {
    const m = this.at(mark);
    return { id, kind: 'rest', verbKey: 'interact.rest', x: m.x, y: m.y, actions: [{ type: 'checkpoint', entry: entryId }] };
  }

  /** A pickup lying on the floor of the mark. `actions` are the ones the interaction system knows; the pickup hides itself with `whenClear`. */
  pickup(id: string, mark: string, actions: InteractableDef['actions'], opts: { whenClear?: string; whenSet?: string } = {}): InteractableDef {
    const m = this.at(mark);
    return { id, kind: 'pickup', verbKey: 'interact.pickUp', x: m.x, y: m.y, actions, ...(opts.whenClear ? { whenClear: opts.whenClear } : {}), ...(opts.whenSet ? { whenSet: opts.whenSet } : {}) };
  }

  seal(id: string, mark: string, def: Omit<SealDef, 'id' | 'x' | 'y'>): SealDef {
    const m = this.at(mark);
    return { id, x: m.x, y: m.y, ...def };
  }

  boss(id: string, guardian: string, mark: string, arena: { from: string; to: string; top?: number; bottom?: number }, flags: { defeatFlag: string; fightFlag: string }, facing: 1 | -1 = -1): BossDef {
    const m = this.at(mark);
    const a = this.at(arena.from);
    const b = this.at(arena.to);
    return { id, guardian, x: m.x, y: m.y, facing, arena: rect(Math.min(a.x, b.x), Math.min(a.y, b.y) - (arena.bottom ?? 1), Math.max(a.x, b.x), Math.max(a.y, b.y) + (arena.top ?? 12)), ...flags };
  }

  /** A door of the picture (a named region) that opens with `flag`. */
  gate(id: string, solid: string, flag: string): GateDef {
    return { id, solid, openWhen: flag };
  }
}

/** The room as the game wants it, from a picture and everything placed on it. The room's own fields win over what the picture would give. */
export interface MapRoomSpec extends RoomMapSpec {
  id: string;
  regionId: string;
  /** The working name (logs, the debug panel); the player reads `nameKey`. */
  name: string;
  nameKey: string;
  art: { backdrop: string; seed: number };
  /** How far below the picture the hero is out of the world (default 8 m). */
  fall?: number;
}

export function mapRoom(spec: MapRoomSpec, place: (m: RoomMap) => Partial<RoomDefinition>): RoomDefinition {
  const m = new RoomMap(spec.id, spec);
  const fall = spec.fall ?? 8;
  const placed = place(m);
  return {
    id: spec.id,
    regionId: spec.regionId,
    name: spec.name,
    nameKey: spec.nameKey,
    bounds: rect(-2, -fall - 4, m.width + 2, m.height + 6),
    killY: -fall,
    camera: { bounds: m.grid },
    solids: m.solids,
    entries: [],
    ...(m.hazards.length > 0 ? { hazards: m.hazards } : {}),
    art: spec.art,
    ...placed,
  };
}

/** The picture of a room as letters again: solids, jump-through platforms, spikes and lava (what `mapRoom` was given, give or take the merging). For tests and for looking at a room. */
export function pictureOf(room: Pick<RoomDefinition, 'solids' | 'hazards' | 'camera' | 'bounds'>, marks: ReadonlyArray<{ x: number; y: number; ch: string }> = []): string[] {
  const g = room.camera?.bounds ?? room.bounds;
  const w = Math.round(g.x1 - g.x0);
  const h = Math.round(g.y1 - g.y0);
  const out = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  const put = (c: number, r: number, ch: string): void => {
    if (r >= 0 && r < h && c >= 0 && c < w) out[r]![c] = ch;
  };
  for (const s of room.solids) {
    if (s.kind === 'oneway') {
      for (let c = Math.floor(s.rect.x0 - g.x0 + 1e-6); c < Math.ceil(s.rect.x1 - g.x0 - 1e-6); c++) put(c, Math.round(g.y1 - s.rect.y1), '-');
      continue;
    }
    for (let r = Math.floor(g.y1 - s.rect.y1 + 1e-6); r < Math.ceil(g.y1 - s.rect.y0 - 1e-6); r++) {
      for (let c = Math.floor(s.rect.x0 - g.x0 + 1e-6); c < Math.ceil(s.rect.x1 - g.x0 - 1e-6); c++) put(c, r, s.material === 'earth' ? 'G' : s.tag ? 'B' : s.material === 'gate' ? 'D' : '#');
    }
  }
  for (const hz of room.hazards ?? []) {
    // spikes are drawn on one row (they are 0.6 m); lava on every row it fills
    const rows = hz.kind === 'lava' ? Math.round(hz.rect.y1 - hz.rect.y0) : 1;
    for (let k = 0; k < rows; k++) for (let c = Math.floor(hz.rect.x0 - g.x0 + 1e-6); c < Math.ceil(hz.rect.x1 - g.x0 - 1e-6); c++) put(c, Math.floor(g.y1 - hz.rect.y1 + 1e-6) + k, hz.kind === 'lava' ? '=' : '^');
  }
  for (const m of marks) put(Math.floor(m.x - g.x0), Math.round(g.y1 - m.y) - 1, m.ch);
  return out.map((r) => r.join(''));
}
