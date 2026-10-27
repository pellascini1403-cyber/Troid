import { ABILITIES } from '@/content/abilities';
import { PLAYER } from '@/content/player';
import { EventBus } from '@/core/events';
import type { Rect } from '@/core/math';
import { overlaps } from '@/core/math';
import type { GameEvents } from '@/gameplay/events';
import type { SimServices } from '@/gameplay/SimServices';
import { createInputFrame, type InputFrame } from '@/input/InputFrame';
import { Player } from '@/player/Player';
import { AbilitySystem } from '@/progression/AbilitySystem';
import { CollisionWorld } from '@/world/collision';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * CAN THE HERO GET THERE? (docs/PROMPT21-LOG.md). A room is data, and data can ask for a jump nobody can make. This answers it with the REAL CONTROLLER, not with a formula: it puts a real `Player` in a real `CollisionWorld`
 * built from the room, gives it the inputs a person has (a stick, a jump held for so long, a dash, a second jump), and sees where it lands. What it finds is a graph of the places a hero can stand — the tops of the solids,
 * with room above them for the body — joined by the hops that were seen to work; a place is REACHABLE when a chain of hops leads there from an entry.
 *
 * It is SOUND, not complete: a hop it finds is one the controller really makes (with the tuning in force), but it only tries the families of hop a careful person would — running or standing, a short or a full jump, a dash
 * early or late, a second jump at two moments, a kick from wall to wall — from the ends of every ledge and from points along it. A room that needs something stranger fails here and is rewritten; that is the point
 * (a path that only a frame-perfect trick finds is not a path of the game). The rooms of the world are proven with it, and so is the claim that an ability is what opens a place: without it, the hero cannot get there.
 *
 * Everything runs in the test process: no browser, no frames, a few thousand ticks a hop.
 */

const HALF = PLAYER.body.halfWidth;
const HEIGHT = PLAYER.body.height;
const TICK = 1 / 60;
/** How far past the edge of a ledge the centre of the body can be and still stand on it (the ground probe is the body's width less a hair). */
const OVERHANG = HALF - 0.02;
const MAX_TICKS = 190;
const RUN = PLAYER.movement.runSpeed;
const RUN_ACCEL = PLAYER.movement.groundAccel;

export type Geometry = 'closed' | 'open';

/** A place a hero can stand: the top of something, from `x0` to `x1` (the centre of the body), `y` metres up. */
export interface Surface {
  index: number;
  y: number;
  x0: number;
  x1: number;
  oneway: boolean;
}

/** A way of using the controls from the instant of the take-off. Every number is ticks since then. */
export interface Script {
  name: string;
  /** The abilities the hero must have for it. */
  uses: readonly string[];
  dir: -1 | 0 | 1;
  /** Ticks the jump button is held from the first tick (0: it is not pressed). */
  hold: number;
  /** Ticks at which dash is pressed. */
  dash?: readonly number[];
  /** The tick of a second jump press in the air, and how long it is held. */
  again?: number;
  /** The tick at which the stick is let go. */
  steerOffAt?: number;
  /** Down is held (drop through a platform). */
  down?: boolean;
  /** Kick from wall to wall: to the opposite wall, or to the same one again. */
  wall?: 'alternate' | 'same';
}

export interface Hop {
  from: number;
  to: number;
  /** Where the hero took off from and what they did. */
  x: number;
  script: string;
  /** Where they landed. */
  landX: number;
}

export interface Reach {
  start: number;
  surfaces: ReadonlySet<number>;
  hops: readonly Hop[];
}

interface Trial {
  surface: number;
  landX: number;
  landY: number;
}

/** The solids of the room in a state of its gates: `closed` is a room as it is built (a door that a flag opens is there; one that only shuts for a fight is not), `open` has every such door and every breakable wall gone. */
const walls = (room: RoomDefinition, mode: Geometry): RoomDefinition['solids'] => {
  const gone = new Set<string>();
  for (const g of room.gates ?? []) {
    const openByDefault = g.openWhen === undefined && g.closeWhen !== undefined;
    if (openByDefault || (mode === 'open' && g.openWhen !== undefined)) gone.add(g.solid);
  }
  return room.solids.filter((s) => !gone.has(s.id));
};

export class RoomPhysics {
  readonly world = new CollisionWorld();
  readonly surfaces: Surface[] = [];
  private readonly player: Player;
  private readonly sim: SimServices;
  private abilityKey = '';
  private readonly hazards: Rect[];
  private readonly killY: number;
  private readonly cache = new Map<string, Trial | null>();
  /** Every input frame of the trial that ran last, so a test can play it again through the real session. */
  trace: InputFrame[] = [];
  recording = false;

  constructor(
    readonly room: RoomDefinition,
    readonly mode: Geometry = 'closed',
  ) {
    for (const s of walls(room, mode)) this.world.add({ id: s.id, rect: { ...s.rect }, kind: s.kind ?? 'solid', enabled: true });
    this.hazards = (room.hazards ?? []).map((h) => h.rect);
    this.killY = room.killY ?? room.bounds.y0 - 4;
    this.buildSurfaces();
    this.player = new Player(PLAYER, 'probe');
    const bus = new EventBus<GameEvents>();
    const abilities = new AbilitySystem(ABILITIES, null, []);
    this.sim = {
      bus,
      abilities,
      collision: this.world,
      combat: { submit: () => {} },
      godMode: false,
      now: 0,
      newId: (p: string) => `${p}_0`,
      spawn: (e: unknown) => e,
      despawn: () => {},
      requestHitStop: () => {},
      loadout: { equipped: null },
      skills: { check: () => 'noMagic' },
      interaction: { current: null },
      bottles: { resolve: () => -1 },
    } as unknown as SimServices;
  }

  // ------------------------------------------------------------------------------------------------ the places to stand

  private buildSurfaces(): void {
    type Seg = { y: number; x0: number; x1: number; oneway: boolean };
    const segs: Seg[] = [];
    for (const c of this.world.all()) {
      const top = c.rect.y1;
      let from: number | null = null;
      let last = 0;
      const flush = (): void => {
        if (from !== null) segs.push({ y: top, x0: from, x1: last, oneway: c.kind === 'oneway' });
        from = null;
      };
      const end = c.rect.x1 + OVERHANG;
      for (let cx = c.rect.x0 - OVERHANG; ; cx = Math.min(end, cx + 0.1)) {
        if (this.canStand(cx, top)) {
          if (from === null) from = cx;
          last = cx;
        } else flush();
        if (cx >= end) break;
      }
      flush();
    }
    // the same height, touching: one place to stand (a floor made of several blocks)
    segs.sort((a, b) => a.y - b.y || a.x0 - b.x0);
    const merged: Seg[] = [];
    for (const s of segs) {
      const m = merged[merged.length - 1];
      if (m && Math.abs(m.y - s.y) < 1e-3 && s.x0 <= m.x1 + 0.12 && m.oneway === s.oneway) m.x1 = Math.max(m.x1, s.x1);
      else merged.push({ ...s });
    }
    merged.forEach((m, i) => this.surfaces.push({ index: i, y: m.y, x0: m.x0, x1: m.x1, oneway: m.oneway }));
  }

  /** Is there room for the standing body with its feet at (x, y), and no hazard under it? */
  private canStand(x: number, y: number): boolean {
    const body: Rect = { x0: x - HALF + 1e-4, x1: x + HALF - 1e-4, y0: y + 1e-4, y1: y + HEIGHT - 1e-4 };
    if (this.world.overlapsSolid(body)) return false;
    return !this.hazards.some((h) => overlaps(body, h));
  }

  /** The surface a standing body at (x, y) is on. */
  surfaceAt(x: number, y: number, tolerance = 0.06): Surface | null {
    for (const s of this.surfaces) if (Math.abs(s.y - y) <= tolerance && x >= s.x0 - 0.06 && x <= s.x1 + 0.06) return s;
    return null;
  }

  /** The points to take off from along a surface: both ends, a regular spacing (unless `dense`: the ends only), and under the edges of what is above and beside it. */
  takeoffs(s: Surface, dense = false): number[] {
    const out = new Map<number, number>();
    const add = (x: number): void => {
      const c = Math.min(s.x1, Math.max(s.x0, x));
      out.set(Math.round(c * 20), c);
    };
    add(s.x0);
    add(s.x1);
    if (!dense) for (let x = s.x0; x <= s.x1; x += 1.25) add(x);
    for (const o of this.surfaces) {
      if (o === s) continue;
      const dy = o.y - s.y;
      if (dy < -0.5 || dy > 7.5) continue;
      for (const edge of [o.x0, o.x1, (o.x0 + o.x1) / 2]) {
        if (edge >= s.x0 - 9 && edge <= s.x1 + 9) {
          add(edge);
          add(edge - 0.5);
          add(edge + 0.5);
        }
      }
    }
    return [...out.values()].sort((a, b) => a - b);
  }

  // ------------------------------------------------------------------------------------------------ the families of hop

  /** The scripts a hero with these abilities has. */
  static scripts(has: ReadonlySet<string>): Script[] {
    const out: Script[] = [];
    const dash = has.has('dash');
    const airDash = dash && has.has('air_dash');
    const dbl = has.has('double_jump');
    const wall = has.has('wall_jump');
    for (const dir of [-1, 1] as const) {
      out.push({ name: `walk ${dir}`, uses: [], dir, hold: 0 });
      for (const hold of [26, 4]) {
        out.push({ name: `jump ${dir} h${hold}`, uses: [], dir, hold });
        out.push({ name: `jump ${dir} h${hold} steer-off`, uses: [], dir, hold, steerOffAt: 22 });
      }
      if (dash) {
        out.push({ name: `jump ${dir} dash@3`, uses: ['dash'], dir, hold: 26, dash: [3] });
        out.push({ name: `jump ${dir} dash@16`, uses: ['dash'], dir, hold: 26, dash: [16] });
        out.push({ name: `walk ${dir} dash`, uses: ['dash'], dir, hold: 0, dash: [0] });
      }
      if (airDash) {
        out.push({ name: `jump ${dir} dash@3 dash@24`, uses: ['dash', 'air_dash'], dir, hold: 26, dash: [3, 24] });
        out.push({ name: `jump ${dir} dash@12 dash@34`, uses: ['dash', 'air_dash'], dir, hold: 26, dash: [12, 34] });
      }
      if (dbl) {
        out.push({ name: `jump ${dir} again@14`, uses: ['double_jump'], dir, hold: 26, again: 14 });
        out.push({ name: `jump ${dir} again@26`, uses: ['double_jump'], dir, hold: 26, again: 26 });
        out.push({ name: `walk ${dir} again@12`, uses: ['double_jump'], dir, hold: 0, again: 12 });
        if (dash) out.push({ name: `jump ${dir} again@14 dash@30`, uses: ['double_jump', 'dash'], dir, hold: 26, again: 14, dash: [30] });
        if (airDash) out.push({ name: `jump ${dir} dash@3 again@20 dash@36`, uses: ['double_jump', 'dash', 'air_dash'], dir, hold: 26, dash: [3, 36], again: 20 });
      }
      if (wall) {
        out.push({ name: `jump ${dir} wall alt`, uses: ['wall_jump'], dir, hold: 26, wall: 'alternate' });
        out.push({ name: `jump ${dir} wall same`, uses: ['wall_jump'], dir, hold: 26, wall: 'same' });
        if (dbl) out.push({ name: `jump ${dir} wall alt again`, uses: ['wall_jump', 'double_jump'], dir, hold: 26, wall: 'alternate', again: 12 });
      }
    }
    for (const hold of [26, 4]) out.push({ name: `up h${hold}`, uses: [], dir: 0, hold });
    out.push({ name: 'drop', uses: [], dir: 0, hold: 0, down: true });
    if (dbl) {
      out.push({ name: 'up again@14', uses: ['double_jump'], dir: 0, hold: 26, again: 14 });
      out.push({ name: 'up again@24', uses: ['double_jump'], dir: 0, hold: 26, again: 24 });
    }
    return out.filter((s) => s.uses.every((a) => a === 'dash' || a === 'air_dash' || has.has(a)));
  }

  /**
   * The scripts of a hero who has practised: every moment of the jump for the dash, for the second jump and for the dash in the air, not the few a careful person tries first. They are how a GATE is proved to hold — if the lacking
   * ability cannot get there even with these, the gate is one — and they are slow (a thousand scripts a take-off), so they are tried from the ends of a ledge and under the edges of what is above it, not along it.
   * (Found by brute force, the farthest a flat gap is crossed: the dash alone 10 m, with the air dash 13, with the Double Jump 16, with both 19; the highest ledge: 3 m, and 5 with the Double Jump.)
   */
  static denseScripts(has: ReadonlySet<string>): Script[] {
    const out: Script[] = [];
    const dash = has.has('dash');
    const airDash = dash && has.has('air_dash');
    const dbl = has.has('double_jump');
    for (const dir of [-1, 1] as const) {
      for (const hold of [26, 18, 10, 4]) {
        if (dash) {
          for (let d = 0; d <= 60; d += 4) {
            out.push({ name: `jump ${dir} h${hold} d${d}`, uses: ['dash'], dir, hold, dash: [d] });
            if (airDash) for (let d2 = d + 14; d2 <= 72; d2 += 6) out.push({ name: `jump ${dir} h${hold} d${d} d${d2}`, uses: ['dash', 'air_dash'], dir, hold, dash: [d, d2] });
          }
        }
        if (dbl) {
          for (let a = 8; a <= 44; a += 4) {
            out.push({ name: `jump ${dir} h${hold} a${a}`, uses: ['double_jump'], dir, hold, again: a });
            if (dash) for (let d = 0; d <= 72; d += 8) if (Math.abs(d - a) > 3) out.push({ name: `jump ${dir} h${hold} a${a} d${d}`, uses: ['double_jump', 'dash'], dir, hold, again: a, dash: [d] });
          }
        }
      }
    }
    return out;
  }

  private setAbilities(has: ReadonlySet<string>): void {
    const key = [...has].sort().join(',');
    if (key === this.abilityKey) return;
    this.abilityKey = key;
    const sys = new AbilitySystem(ABILITIES, null, [...has]);
    (this.sim as { abilities: AbilitySystem }).abilities = sys;
  }

  /** Plays one script from the take-off point; where the hero comes down, or `null` (they stay, fall out of the world, touch spikes, never land). */
  private trial(s: Surface, x: number, script: Script, has: ReadonlySet<string>): Trial | null {
    this.setAbilities(has);
    const key = `${this.abilityKey}|${s.index}|${x}|${script.name}`;
    if (!this.recording && this.cache.has(key)) return this.cache.get(key) ?? null;
    const result = this.play(s, x, script, has);
    if (!this.recording) this.cache.set(key, result);
    return result;
  }

  private play(s: Surface, x: number, script: Script, has: ReadonlySet<string>): Trial | null {
    this.setAbilities(has);
    const p = this.player;
    const b = p.body;
    const facing: 1 | -1 = script.dir === 0 ? 1 : script.dir;
    p.respawn(x, s.y, facing);
    b.grounded = true;
    // the run-up: as much of the ledge behind the take-off point as there is, from a standing start
    const runway = script.dir > 0 ? x - s.x0 : script.dir < 0 ? s.x1 - x : 0;
    b.vx = script.dir === 0 ? 0 : script.dir * Math.min(RUN, Math.sqrt(2 * RUN_ACCEL * Math.max(0, runway)));
    this.world.probeGround(b);
    if (!b.grounded) return null;
    const frame = createInputFrame();
    let airborne = false;
    let jumpHeld = false;
    let pressedAt = -99;
    let side: 1 | -1 = script.dir === 0 ? 1 : script.dir;
    let againDone = false;
    let againUntil = -1;
    // a second jump is a second PRESS: the first one is let go of before it
    const hold = script.again !== undefined ? Math.min(script.hold, script.again - 1) : script.hold;
    this.trace = [];
    for (let t = 0; t < MAX_TICKS; t++) {
      let dir: number = script.dir;
      if (script.steerOffAt !== undefined && t >= script.steerOffAt) dir = 0;
      let wantJump = t < hold;
      let press = t === 0 && hold > 0;
      if (script.again !== undefined && !againDone && t >= script.again && airborne) {
        againDone = true;
        againUntil = t + 22;
        press = true;
      }
      if (againUntil >= t) wantJump = true;
      // the kick chain: in the air, the button is let go of at the top of each rise, and pressed again at a wall — toward the other one, or the same
      if (script.wall && airborne) {
        const atWall = (b.hitLeft && side === -1) || (b.hitRight && side === 1);
        if (jumpHeld) wantJump = !(b.vy <= 0 && t > pressedAt + 5);
        else if (!b.grounded && atWall && b.vy < 2) {
          press = true;
          wantJump = true;
          pressedAt = t;
          if (script.wall === 'alternate') side = side === 1 ? -1 : 1;
        }
        dir = side;
      }
      let down = 0;
      if (script.down) {
        down = -1;
        press = t === 0;
        wantJump = t === 0;
      }
      let dashNow = false;
      for (const d of script.dash ?? []) if (t === d) dashNow = true;
      frame.move.x = dir;
      frame.move.y = down;
      frame.jumpPressed = press && !jumpHeld;
      frame.jumpReleased = jumpHeld && !wantJump;
      frame.jumpHeld = wantJump;
      frame.dashPressed = dashNow;
      frame.attackPressed = false;
      jumpHeld = wantJump;
      if (this.recording) this.trace.push({ ...frame, move: { ...frame.move } });
      p.combat.tickBuffer(false);
      p.controller.update(this.sim, frame);
      if (b.y < this.killY) return null;
      if (!airborne && !b.grounded) airborne = true;
      for (const h of this.hazards) if (overlaps({ x0: b.x - HALF, x1: b.x + HALF, y0: b.y, y1: b.y + HEIGHT }, h)) return null;
      if (airborne && b.grounded && !p.controller.dashing) {
        const landed = this.surfaceAt(b.x, b.y);
        return landed ? { surface: landed.index, landX: b.x, landY: b.y } : null;
      }
    }
    return null;
  }

  /** Plays a hop that was found once more, recording the inputs: where the hero started (feet and speed), every frame, and where they came down. For a test that plays it again through the real session. */
  record(hop: Pick<Hop, 'from' | 'x' | 'script'>, has: ReadonlySet<string>): { x: number; y: number; vx: number; frames: InputFrame[]; landX: number; landY: number } {
    const s = this.surfaces[hop.from]!;
    const script = RoomPhysics.scripts(has).find((c) => c.name === hop.script);
    if (!script) throw new Error(`no script "${hop.script}" for ${[...has].join(',')}`);
    this.recording = true;
    try {
      const r = this.play(s, hop.x, script, has);
      if (!r) throw new Error('the hop did not land this time');
      const runway = script.dir > 0 ? hop.x - s.x0 : script.dir < 0 ? s.x1 - hop.x : 0;
      const vx = script.dir === 0 ? 0 : script.dir * Math.min(RUN, Math.sqrt(2 * RUN_ACCEL * Math.max(0, runway)));
      return { x: hop.x, y: s.y, vx, frames: this.trace, landX: r.landX, landY: r.landY };
    } finally {
      this.recording = false;
    }
  }

  // ------------------------------------------------------------------------------------------------ the search

  /** Every place the hero can come to from the surface they start on, with the abilities `has`. `stopWhen` ends the search early (everything asked for was found). */
  reachFrom(start: Surface, has: ReadonlySet<string>, stopWhen?: (reached: ReadonlySet<number>) => boolean, opts: { dense?: boolean } = {}): Reach {
    const scripts = opts.dense ? [...RoomPhysics.scripts(has), ...RoomPhysics.denseScripts(has)] : RoomPhysics.scripts(has);
    const reached = new Set<number>([start.index]);
    const hops: Hop[] = [];
    const queue = [start.index];
    for (let q = 0; q < queue.length; q++) {
      const s = this.surfaces[queue[q]!]!;
      for (const x of this.takeoffs(s, opts.dense)) {
        for (const script of scripts) {
          if (script.down && !s.oneway) continue;
          const r = this.trial(s, x, script, has);
          if (!r || r.surface === s.index) continue;
          hops.push({ from: s.index, to: r.surface, x, script: script.name, landX: r.landX });
          if (!reached.has(r.surface)) {
            reached.add(r.surface);
            queue.push(r.surface);
            if (stopWhen?.(reached)) return { start: start.index, surfaces: reached, hops };
          }
        }
      }
    }
    return { start: start.index, surfaces: reached, hops };
  }

  /** The surface an entry of the room puts the hero on. */
  entrySurface(entryId: string): Surface {
    const e = this.room.entries.find((n) => n.id === entryId);
    if (!e) throw new Error(`[${this.room.id}] no entry "${entryId}"`);
    const s = this.surfaceAt(e.x, e.y);
    if (!s) throw new Error(`[${this.room.id}] the entry "${entryId}" (${e.x}, ${e.y}) is not on a place a hero can stand`);
    return s;
  }

  /** Does a hero standing somewhere on the reached surfaces touch `zone` (a rectangle: an exit, a pickup's reach)? */
  touches(reach: Reach, zone: Rect): boolean {
    for (const i of reach.surfaces) {
      const s = this.surfaces[i]!;
      if (this.standingIn(s, zone)) return true;
    }
    return false;
  }

  private standingIn(s: Surface, zone: Rect): boolean {
    // the body is [x ± HALF] × [y, y + HEIGHT]: it touches the zone for some x of the surface
    if (zone.y1 <= s.y || zone.y0 >= s.y + HEIGHT) return false;
    return zone.x1 > s.x0 - HALF && zone.x0 < s.x1 + HALF;
  }

  /** Can the hero stand within `reach` metres across of the point (x, y) — on the surface that the point is on? */
  standsNear(reach: Reach, x: number, y: number, across = 0.9): boolean {
    for (const i of reach.surfaces) {
      const s = this.surfaces[i]!;
      if (Math.abs(s.y - y) <= 0.1 && x + across >= s.x0 && x - across <= s.x1) return true;
    }
    return false;
  }

  /** Where `reachFrom` can come back to `target` from `from` (is there a way back?). */
  canReturn(from: Surface, to: Surface, has: ReadonlySet<string>): boolean {
    return this.reachFrom(from, has, (r) => r.has(to.index)).surfaces.has(to.index);
  }
}

/** The abilities a new game begins with. */
export const START_ABILITIES: ReadonlySet<string> = new Set(['dash']);

/** A set of abilities, from a list. */
export const abilitySet = (...ids: string[]): Set<string> => new Set(ids);

export { TICK };
