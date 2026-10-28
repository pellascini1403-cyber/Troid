import { PLAYER } from '@/content/player';
import { overlaps, type Rect } from '@/core/math';
import { bodyRect } from '@/world/collision';
import type { InteractableDef } from '@/interaction/Interactable';
import type { InputFrame } from '@/input/InputFrame';
import { chainTo } from './chain';
import { RoomPhysics, ScriptRunner, withExitsAsHazards, type Hop, type Surface } from './reach';
import type { Driver } from './sim';

/**
 * A PILOT: a scripted player that GETS SOMEWHERE in a real session with the inputs of a person (docs/PROMPT22-LOG.md). It walks along what it stands on, takes off where the solver (`reach.ts`) says a hop works, and plays the
 * hop's frames — the very ones the controller made them with — through the real `GameSession`, one tick at a time. It looks at where it LANDED, not at where it was told to land: after every hop it asks the solver again from
 * the surface it is really on, so a hero who was knocked off a ledge, or who came down a hair short, simply makes a new plan, as a person would.
 *
 * What it does not do is fight: a `reflex` may be given (a function that is called every few ticks and may take over for a while — kill what is near, step out of a telegraph) and the pilot goes back to its plan when it returns.
 * The physics it plans with are those of the room AS IT IS NOW: a door that is shut is a wall, one that is open is not.
 */
const HALF = PLAYER.body.halfWidth;
const HEIGHT = PLAYER.body.height;
/** How high above a floor a jump gets the head (a full jump is 3.1 m; this leaves a margin). */
const JUMP_REACH = 2.9;
/** And with the second jump at the top of the first (a full jump is 3.1 m and the second adds 2.6; this leaves a margin). */
const JUMP_REACH_TWICE = 5.0;
/** How far in from the end of a ledge a run-up begins, and a standing take-off stands (m). */
const EDGE = 0.1;
/** The height of the body crouched (m): a passage this low is walked through bent over. */
const CROUCHED = PLAYER.movement.crouch.height;

export type Goal = { zone: Rect } | { stand: { x: number; y: number } };
type Mode = 'stand' | 'touch' | 'hole' | 'above';

interface Candidate {
  surface: Surface;
  mode: Mode;
}

export interface PilotOptions {
  /** Keep away from the ways out the hero does not mean to take (default: yes). A person does; the switch is for finding out whether a room can be crossed only by running through one. */
  avoidExits?: boolean;
  /** Called every few ticks while the pilot walks or waits; true means "I took over, and have given the hero back": the pilot makes its plan again. */
  reflex?: (pilot: Pilot) => boolean;
  /** Where to write what the pilot did (for a person reading why a room could not be crossed). */
  trace?: string[];
  /**
   * Called with the frame of every tick of a hop, before it is played: the place where a person adds a blow to a climb (the sword at a wisp that has come to the wall) without letting go of the stick. It may set the buttons it needs; it must not
   * touch the stick or the jump.
   */
  overlay?: (frame: InputFrame, pilot: Pilot) => void;
  /**
   * Asked on every tick of a hop: true means "let go" — the hop is given up on the spot and the hero comes down as well as they can (toward the middle of what is below), and the pilot makes a new plan from there. The place where a person
   * who is hanging on a wall with something flying at them lets go and meets it on the ground.
   */
  abort?: (pilot: Pilot, hop: Hop) => boolean;
}

export class Pilot {
  /** What the pilot did, in words. */
  readonly trace: string[];
  reflex: PilotOptions['reflex'];
  overlay: PilotOptions['overlay'];
  abort: PilotOptions['abort'];
  avoidExits: boolean;
  /** The hops it played, and how many came down somewhere other than the solver said. */
  hops = 0;
  misses = 0;
  private readonly cache = new Map<string, RoomPhysics>();
  private readonly scratch: Rect = { x0: 0, x1: 0, y0: 0, y1: 0 };

  constructor(
    readonly d: Driver,
    opts: PilotOptions = {},
  ) {
    this.reflex = opts.reflex;
    this.overlay = opts.overlay;
    this.abort = opts.abort;
    this.avoidExits = opts.avoidExits ?? true;
    this.trace = opts.trace ?? [];
  }

  // -------------------------------------------------------------------------------------------------- what the pilot knows

  /** The abilities the solver cares about, as the hero has them now. */
  hero(): Set<string> {
    const has = new Set<string>(['dash']);
    const a = this.d.session.abilities;
    for (const id of ['air_dash', 'double_jump', 'wall_jump']) if (a.has(id)) has.add(id);
    return has;
  }

  /**
   * The physics of the room as it is now: a collider that is switched off is not there. The ways out the hero does NOT mean to take are walls of fire to them (see `withExitsAsHazards`): touching one, or flying through it, is
   * leaving the room, and a run-up that begins inside one is not a run-up. `keep` is the zone of the way out they do mean to take (or nothing).
   */
  physics(keep?: Rect): RoomPhysics {
    const s = this.d.session;
    const room = s.room;
    const off = room.solids.filter((sol) => s.collision.get(sol.id)?.enabled === false).map((sol) => sol.id);
    const keepId = keep ? room.exits?.find((x) => x.rect === keep)?.id : undefined;
    // (a way out whose flag is not set is a zone that does nothing: nobody has to keep away from it)
    const avoid = this.avoidExits ? (room.exits ?? []).filter((x) => (x.to || x.end) && x.id !== keepId && (x.requires === undefined || s.flags.has(x.requires))).map((x) => x.id) : [];
    const key = `${room.id}|${off.sort().join(',')}|${avoid.sort().join(',')}`;
    let p = this.cache.get(key);
    if (!p) {
      const view = withExitsAsHazards({ ...room, gates: [], solids: room.solids.filter((sol) => !off.includes(sol.id)), exits: (room.exits ?? []).filter((x) => avoid.includes(x.id)) }, undefined, null);
      p = new RoomPhysics({ ...view, exits: room.exits }, 'closed');
      this.cache.set(key, p);
    }
    return p;
  }

  inZone(zone: Rect): boolean {
    return overlaps(bodyRect(this.d.body, this.scratch), zone);
  }

  private say(line: string): void {
    this.trace.push(`[${this.d.session.room.id} t${this.d.session.now}] ${line}`);
  }

  // -------------------------------------------------------------------------------------------------- walking

  /** Lets the hero come down onto something (false when they never do: a fall with no floor). */
  settle(max = 360): boolean {
    for (let t = 0; t < max; t++) {
      if (this.d.body.grounded && !this.d.p.controller.dashing) return true;
      this.d.stop();
      this.d.step(1);
    }
    return this.d.body.grounded;
  }

  /**
   * Walks along what the hero stands on to `x` and stops there (within `tol`). It slows as it comes in: the ends of a ledge are where a run-up begins, and a hero who overshoots by a hand's breadth is no longer on the ledge.
   */
  walkTo(x: number, tol = 0.12, maxTicks = 1500): boolean {
    const d = this.d;
    for (let t = 0; t < maxTicks; t++) {
      const b = d.body;
      const dx = x - b.x;
      const v = Math.abs(b.vx);
      if (Math.abs(dx) <= tol && v < 0.6) {
        d.stop();
        return true;
      }
      const stopDist = (v * v) / (2 * 95) + 0.03;
      if (Math.abs(dx) <= tol || (Math.sign(dx) === Math.sign(b.vx) && Math.abs(dx) <= stopDist)) d.stop();
      else d.moveX = Math.sign(dx) * (Math.abs(dx) > 1.6 ? 1 : Math.abs(dx) > 0.5 ? 0.6 : 0.25);
      d.step(1);
      if (t % 20 === 19 && this.reflex?.(this)) return false;
    }
    d.stop();
    return false;
  }

  /** Edges its way to `x` at a walking pace, from the side it is on: the last centimetres of a ledge are where a hero who comes in fast falls off. */
  creepTo(x: number, tol = 0.02, maxTicks = 600): boolean {
    const d = this.d;
    for (let t = 0; t < maxTicks; t++) {
      const dx = x - d.body.x;
      if (Math.abs(dx) <= tol) {
        d.stop();
        d.step(2);
        return Math.abs(x - d.body.x) <= tol * 3;
      }
      d.moveX = Math.sign(dx) * (Math.abs(dx) > 0.4 ? 0.5 : 0.16);
      d.step(1);
    }
    d.stop();
    return false;
  }

  /**
   * The hero stands where the solver has no place to stand: a floor of spikes, the lip of a block. The nearest place that is one — within a jump — is walked to, or hopped up onto, as a person gets out of a pit of spikes: at once, and by
   * the shortest way. A pit can be wide (the Veins have sixty-two metres of it): when nothing is within a hop, the hero walks along the floor toward the nearest place it could climb onto — the spikes hurt each step, and that is what a fall into
   * them costs. True when it did something about it.
   */
  private recover(phys: RoomPhysics, attempt: number): boolean {
    const d = this.d;
    const b = d.body;
    const twice = this.hero().has('double_jump');
    const reach = (twice ? JUMP_REACH_TWICE : JUMP_REACH) - 0.3;
    const all = phys.surfaces.map((s) => ({ s, dx: b.x < s.x0 ? s.x0 - b.x : b.x > s.x1 ? b.x - s.x1 : 0, dy: s.y - b.y })).filter((c) => c.dy <= reach && c.dy >= -7);
    const cost = (c: { dx: number; dy: number }): number => c.dx + Math.max(0, c.dy) * 0.6 + (c.dy < -0.2 ? 1.5 : 0);
    const near = all.filter((c) => c.dx <= 6).sort((p, q) => cost(p) - cost(q));
    const pick = near[attempt % Math.max(1, Math.min(2, near.length))];
    if (!pick) {
      // nothing within a hop: along the floor to the nearest place that can be climbed onto
      const far = all.sort((p, q) => cost(p) - cost(q))[0];
      if (!far) return false;
      d.moveX = b.x < far.s.x0 ? 1 : b.x > far.s.x1 ? -1 : 0;
      d.step(30);
      d.stop();
      return true;
    }
    const { s, dx, dy } = pick;
    const dir: -1 | 1 = b.x < s.x0 ? 1 : b.x > s.x1 ? -1 : b.x < (s.x0 + s.x1) / 2 ? 1 : -1;
    if (dy > 0.3 || dx > 0.2) {
      // up onto it (or across a gap to it): a full jump toward it — and the second one at the top of it when it is higher than one jump gets
      d.moveX = dir;
      d.press('jump');
      if (dy > JUMP_REACH - 0.3) {
        d.step(14);
        d.release('jump');
        d.step(1);
        d.press('jump');
        d.step(20);
      } else {
        d.step(26);
      }
      d.release('jump');
      for (let t = 0; t < 40 && !d.body.grounded; t++) d.step(1);
      d.stop();
      return true;
    }
    this.walkTo(Math.min(s.x1 - EDGE, Math.max(s.x0 + EDGE, b.x)), 0.1, 300);
    return true;
  }

  /** Comes down from where the hero is: steering toward the middle of the nearest thing below (so as not to fall on the lip of a way out, or into the gap beside a ledge). False when they never come down onto anything. */
  land(max = 360): boolean {
    const d = this.d;
    for (let t = 0; t < max; t++) {
      if (d.body.grounded && !d.p.controller.dashing) {
        d.stop();
        return true;
      }
      const b = d.body;
      const below = this.physics()
        .surfaces.filter((q) => q.y <= b.y + 0.1 && q.x1 + 2 >= b.x && q.x0 - 2 <= b.x)
        .sort((p, q) => q.y - p.y)[0];
      if (below) {
        const mid = (below.x0 + below.x1) / 2;
        d.moveX = Math.sign(mid - b.x) * Math.min(1, Math.abs(mid - b.x) / 1.5);
      } else d.moveX = 0;
      d.step(1);
    }
    d.stop();
    return d.body.grounded;
  }

  /** Keeps walking toward `x` until `cond` is true (false when it never is, or the hero gets to `x` without it). */
  walkUntil(cond: () => boolean, x: number, maxTicks = 600): boolean {
    const d = this.d;
    for (let t = 0; t < maxTicks; t++) {
      if (cond()) {
        d.stop();
        return true;
      }
      const dx = x - d.body.x;
      if (Math.abs(dx) < 0.08 && d.body.grounded) {
        d.stop();
        d.step(2);
        return cond();
      }
      d.moveX = Math.sign(dx) || 1;
      d.step(1);
      if (t % 20 === 19 && this.reflex?.(this)) return false;
    }
    d.stop();
    return cond();
  }

  // -------------------------------------------------------------------------------------------------- the plan

  private candidates(phys: RoomPhysics, goal: Goal): Candidate[] {
    const out: Candidate[] = [];
    if ('stand' in goal) {
      const g = goal.stand;
      for (const s of phys.surfaces) if (Math.abs(s.y - g.y) <= 0.2 && g.x + 1.2 >= s.x0 && g.x - 1.2 <= s.x1) out.push({ surface: s, mode: 'stand' });
      return out;
    }
    const z = goal.zone;
    for (const s of phys.surfaces) {
      if (z.y1 > s.y && z.y0 < s.y + HEIGHT && z.x1 > s.x0 - HALF && z.x0 < s.x1 + HALF) {
        out.push({ surface: s, mode: 'touch' });
        continue;
      }
      const a = Math.max(s.x0 - HALF, z.x0);
      const b = Math.min(s.x1 + HALF, z.x1);
      if (b - a < 0.05) continue;
      if (s.y >= z.y1 - 1e-6) {
        if (!phys.world.overlapsSolid({ x0: a + 0.02, x1: b - 0.02, y0: z.y1, y1: s.y - 0.02 })) out.push({ surface: s, mode: 'hole' });
      } else if (s.y + HEIGHT + JUMP_REACH >= z.y0 && z.y0 > s.y + HEIGHT) {
        if (!phys.world.overlapsSolid({ x0: a + 0.02, x1: b - 0.02, y0: s.y + HEIGHT + 0.02, y1: z.y0 })) out.push({ surface: s, mode: 'above' });
      }
    }
    return out;
  }

  private arrived(goal: Goal): boolean {
    const b = this.d.body;
    if ('zone' in goal) return this.inZone(goal.zone);
    return b.grounded && Math.abs(b.x - goal.stand.x) <= 1.0 && Math.abs(b.y - goal.stand.y) <= 0.3;
  }

  /**
   * Gets the hero to the goal: a thing to stand beside, or a zone to touch (a way out). It plans on the surface the hero stands on, plays the first hop of the plan, and plans again.
   * `false` when it could not (nothing to stand on, no chain of hops with what the hero has, or it ran out of time).
   */
  goTo(goal: Goal, opts: { maxTicks?: number } = {}): boolean {
    const d = this.d;
    const deadline = d.session.now + (opts.maxTicks ?? 7200);
    const room = d.session.room.id;
    for (let iter = 0; iter < 80 && d.session.now < deadline; iter++) {
      // (a defeat that brought the hero back to a shrine in another room, or a door they fell through: the goal was of the room they were in)
      if (d.session.room.id !== room || d.p.health.dead) return false;
      if (this.arrived(goal)) return true;
      if (this.reflex?.(this)) continue;
      if (!this.settle()) {
        this.say('the hero does not come down onto anything');
        return false;
      }
      if (this.arrived(goal)) return true;
      const phys = this.physics('zone' in goal ? goal.zone : undefined);
      const b = d.body;
      const here = phys.surfaceAt(b.x, b.y, 0.1);
      if (!here) {
        // standing on something that is not a place of the solver's (the margin of a way out, the lip of a block, a floor of spikes): to the nearest place that is — a walk along the floor, or a hop up onto it
        this.say(`no surface under (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`);
        if (!this.recover(phys, iter)) {
          d.moveX = iter % 2 ? 1 : -1;
          d.step(8);
          d.stop();
        }
        continue;
      }
      const targets = this.candidates(phys, goal);
      if (targets.length === 0) {
        this.say('no place from which the goal can be reached');
        return false;
      }
      const mine = targets.find((t) => t.surface.index === here.index);
      if (mine) {
        if (this.approach(goal, mine.mode, here)) return true;
        continue;
      }
      const has = this.hero();
      const best = this.plan(phys, here, has, targets);
      if (!best) {
        this.say(`no chain of hops from surface ${here.index} (y ${here.y.toFixed(1)}, x ${here.x0.toFixed(1)}…${here.x1.toFixed(1)}) with ${[...has].join('+')}`);
        return false;
      }
      this.say(`plan from surface ${here.index} (y ${here.y.toFixed(1)}, ${here.x0.toFixed(1)}…${here.x1.toFixed(1)}): ${best.map((h) => `${h.from}→${h.to} ${h.script}@${h.x.toFixed(1)}`).join(', ')}`);
      this.playHop(best[0]!, here, has, phys);
    }
    return this.arrived(goal);
  }

  /**
   * The shortest chain of hops from the place the hero stands on to one of the places that will do. The solver's hops first; when they do not get there, the passages too low to walk through upright (a tunnel under a roof) join the places
   * on either side, and the search goes on from the far side.
   */
  private plan(phys: RoomPhysics, here: Surface, has: ReadonlySet<string>, targets: Candidate[]): Hop[] | null {
    const want = (r: ReadonlySet<number>): boolean => targets.some((t) => r.has(t.surface.index));
    const links = this.links(phys);
    const chains = new Map<number, Hop[]>([[here.index, []]]);
    const queue = [here.index];
    let firstHops: readonly Hop[] = [];
    for (let q = 0; q < queue.length; q++) {
      const from = phys.surfaces[queue[q]!]!;
      const base = chains.get(from.index)!;
      // (the far side of a passage can be the place itself)
      if (base.length > 0 && targets.some((t) => t.surface.index === from.index)) return this.steady(phys, firstHops, base, has);
      const reach = phys.reachFrom(from, has, want);
      if (q === 0) firstHops = reach.hops;
      let best: Hop[] | null = null;
      for (const t of targets) {
        const c = chainTo(reach, t.surface.index);
        if (c && c.length > 0 && (!best || c.length < best.length)) best = c;
      }
      if (best) return this.steady(phys, firstHops, [...base, ...best], has);
      for (const l of links) {
        if (!reach.surfaces.has(l.from) || chains.has(l.to)) continue;
        chains.set(l.to, [...base, ...(l.from === from.index ? [] : (chainTo(reach, l.from) ?? [])), l]);
        queue.push(l.to);
      }
    }
    return null;
  }

  /** The chain with its first hop swapped for the steadiest hop between the same two places (a crawl is as steady as it gets). */
  private steady(phys: RoomPhysics, hops: readonly Hop[], chain: Hop[], has: ReadonlySet<string>): Hop[] {
    const first = chain[0]!;
    return first.script === 'crouch' ? chain : [this.steadiest(phys, hops, first, has), ...chain.slice(1)];
  }

  /** The passages that a hero goes through bent over: two places on the same floor with a stretch between them where the standing body does not fit and the crouched one does. Both ways. */
  private links(phys: RoomPhysics): Hop[] {
    const out: Hop[] = [];
    for (const a of phys.surfaces) {
      for (const b of phys.surfaces) {
        if (a === b || a.oneway || b.oneway || Math.abs(a.y - b.y) > 0.01 || b.x0 <= a.x1 || b.x0 - a.x1 > 24) continue;
        if (phys.world.overlapsSolid({ x0: a.x1, x1: b.x0, y0: a.y + 0.02, y1: a.y + CROUCHED })) continue;
        let floor = true;
        for (let x = a.x1; x <= b.x0 && floor; x += 0.5) floor = phys.world.overlapsSolid({ x0: x - 0.01, x1: x + 0.01, y0: a.y - 0.05, y1: a.y - 0.01 });
        if (!floor) continue;
        out.push({ from: a.index, to: b.index, x: a.x1, script: 'crouch', landX: b.x0 });
        out.push({ from: b.index, to: a.index, x: b.x0, script: 'crouch', landX: a.x1 });
      }
    }
    return out;
  }

  /**
   * Of the hops that join the same two places, the one that does not ask for the take-off to be right to the centimetre: the one that still comes down on the same surface when the take-off is a little early or a little late
   * (a hero who runs at 8.5 m/s is at a new place every 14 cm). A hop that works only at one point is a hop of the solver's, not of a person's.
   */
  private steadiest(phys: RoomPhysics, hops: readonly Hop[], pick: Hop, has: ReadonlySet<string>): Hop {
    const same = hops.filter((h) => h.from === pick.from && h.to === pick.to);
    if (same.length <= 1) return pick;
    const s = phys.surfaces[pick.from]!;
    let best = pick;
    let bestScore = -1;
    for (const h of same) {
      let score = 0;
      for (const dx of [-0.12, -0.06, 0, 0.06, 0.12]) {
        const x = Math.min(s.x1, Math.max(s.x0, h.x + dx));
        if (phys.landing(s, x, h.script, has)?.surface === h.to) score++;
      }
      if (score > bestScore) {
        best = h;
        bestScore = score;
      }
      if (score === 5) break;
    }
    return best;
  }

  /** The last metres, once the hero stands on a surface from which the goal can be touched. */
  private approach(goal: Goal, mode: Mode, s: Surface): boolean {
    const d = this.d;
    const clamp = (x: number): number => Math.min(s.x1, Math.max(s.x0, x));
    if (mode === 'stand' && 'stand' in goal) {
      this.walkTo(clamp(goal.stand.x), 0.15);
      return this.arrived(goal);
    }
    if (!('zone' in goal)) return false;
    const z = goal.zone;
    const cx = (z.x0 + z.x1) / 2;
    if (mode === 'touch') return this.walkUntil(() => this.inZone(z), clamp(cx));
    if (mode === 'hole') return this.walkUntil(() => this.inZone(z), cx, 300);
    // a way out in the roof: stand under it and jump, as a person does — the second jump when the first is not enough
    this.walkTo(clamp(cx), 0.2);
    const has = this.hero();
    for (const again of has.has('double_jump') ? [0, 14, 24] : [0]) {
      if (!this.settle()) return false;
      d.stop();
      d.press('jump');
      for (let t = 0; t < 60 && !this.inZone(z); t++) {
        if (t === 26) d.release('jump');
        if (again > 0 && t === again) {
          d.release('jump');
          d.step(1);
          d.press('jump');
        }
        d.step(1);
      }
      d.release('jump');
      if (this.inZone(z)) return true;
    }
    return this.inZone(z);
  }

  /** Goes through a passage bent over: walks to its mouth, crouches, and crawls until the far side (the crouch is let go there, where there is room to stand). */
  private crawl(hop: Hop, from: Surface, to: Surface): void {
    const d = this.d;
    const dir = to.x0 > from.x1 ? 1 : -1;
    if (!this.walkTo(dir > 0 ? from.x1 - EDGE : from.x0 + EDGE, 0.05)) return;
    this.hops++;
    const far = dir > 0 ? to.x0 + 0.3 : to.x1 - 0.3;
    for (let t = 0; t < 900 && (far - d.body.x) * dir > 0; t++) {
      d.moveY = -1;
      d.moveX = dir;
      d.step(1);
    }
    d.stop();
    if (Math.abs(d.body.x - hop.landX) > 0.9) {
      this.misses++;
      this.say(`crawl from ${hop.x.toFixed(2)} stopped at ${d.body.x.toFixed(2)}, not at ${hop.landX.toFixed(2)}`);
    }
    d.step(8);
  }

  /**
   * Plays one hop of the solver's plan: walks to where the run-up begins, runs to the take-off point, and plays the script's inputs — read tick by tick from the body of the real hero, as a person reads the screen, so a hero who is a
   * hair off what the solver counted still kicks off the wall they really touch (a chain of twenty wall jumps does not survive a recording made for another body).
   */
  private playHop(hop: Hop, s: Surface, has: ReadonlySet<string>, phys: RoomPhysics): void {
    const d = this.d;
    if (hop.script === 'crouch') {
      this.crawl(hop, s, phys.surfaces[hop.to]!);
      return;
    }
    const script = RoomPhysics.scripts(has).find((c) => c.name === hop.script);
    if (!script) throw new Error(`no script "${hop.script}" for ${[...has].join(',')}`);
    const rec = phys.record(hop, has);
    const dir = script.dir;
    if (/dash/.test(hop.script)) for (let t = 0; t < 120 && d.p.controller.dashCooldown01 > 0; t++) d.step(1);
    if (dir !== 0) {
      // the run-up the solver counted: from the end of the ledge behind the take-off point, from a standing start. A hop that takes off at the very end of the ledge (the one that climbs a chimney) has no run-up at all, and is
      // played from the very end; any other is played from a hand's breadth in, where a hero who comes in at a walk does not fall off
      const runway = dir > 0 ? rec.x - s.x0 : s.x1 - rec.x;
      const end = dir > 0 ? s.x0 : s.x1;
      if (runway < 0.5) {
        if (!this.walkTo(end + dir * 0.25, 0.1)) return;
        if (!this.creepTo(end + dir * 0.03, 0.015)) return; // (a hair in from the end: the last centimetres are where a hero who stops a tick late is no longer on the ledge)
      } else if (!this.walkTo(end + dir * EDGE, 0.05)) return;
      // (the script starts on the tick that begins nearest to the take-off point: a run is 14 cm a tick)
      for (let t = 0; t < 300; t++) {
        const dx = (rec.x - d.body.x) * dir;
        if (dx <= Math.abs(d.body.vx) / 120) break;
        d.moveX = dir;
        d.step(1);
      }
      d.stop();
    } else if (!this.walkTo(Math.min(s.x1 - EDGE, Math.max(s.x0 + EDGE, rec.x)), 0.04)) return;
    this.hops++;
    const takeoff = `${d.body.x.toFixed(2)} (vx ${d.body.vx.toFixed(2)}), the solver's ${rec.x.toFixed(2)} (vx ${rec.vx.toFixed(2)})`;
    const runner = new ScriptRunner(script);
    let landed = false;
    let letGo = false;
    for (let t = 0; t < runner.limit; t++) {
      if (this.abort?.(this, hop)) {
        letGo = true;
        break;
      }
      const frame = runner.next(t, d.body);
      this.overlay?.(frame, this);
      d.tickFrame(frame);
      runner.after(d.body);
      if (runner.inAir && d.body.grounded && !d.p.controller.dashing) {
        landed = true;
        break;
      }
    }
    d.stop();
    if (letGo) {
      this.say(`the hop "${hop.script}" was given up at (${d.body.x.toFixed(2)}, ${d.body.y.toFixed(2)})`);
      this.land();
      d.step(4);
      return;
    }
    if (!landed) this.settle();
    if (Math.abs(d.body.x - rec.landX) > 0.4 || Math.abs(d.body.y - rec.landY) > 0.4) {
      this.misses++;
      this.say(`hop "${hop.script}" took off at ${takeoff} and landed at (${d.body.x.toFixed(2)}, ${d.body.y.toFixed(2)}), not (${rec.landX.toFixed(2)}, ${rec.landY.toFixed(2)})`);
    }
    d.step(4); // a breath
  }

  // -------------------------------------------------------------------------------------------------- what a hero does in a room

  /** Walks into the way out `exitId` and lets the whole transition play, the hero standing in the next room (or the end of the world). */
  exit(exitId: string): boolean {
    const s = this.d.session;
    const x = s.room.exits!.find((e) => e.id === exitId);
    if (!x) throw new Error(`[${s.room.id}] no way out "${exitId}"`);
    const from = s.room.id;
    if (!this.goTo({ zone: x.rect })) {
      // (the way out may have been taken in the middle of it: the room is the next one)
      return !x.end && x.to !== undefined && s.room.id === x.to.room && !this.d.p.health.dead;
    }
    this.d.step(1);
    if (x.end) return true;
    const limit = s.now + 400;
    while (s.now < limit && (s.transition.active || s.room.id === from)) this.d.step(1);
    this.d.stop();
    this.settle();
    return s.room.id !== from;
  }

  /** The thing of the room that has this id, and a standing place beside it. */
  item(id: string): InteractableDef {
    const def = this.d.session.room.interactables?.find((i) => i.id === id);
    if (!def) throw new Error(`[${this.d.session.room.id}] no object "${id}"`);
    return def;
  }

  /** Walks to an object and does what a person does with it: press the key. True when the object was the one the icon was on. */
  use(id: string): boolean {
    const def = this.item(id);
    if (!this.goTo({ stand: { x: def.x, y: def.y } })) return false;
    const d = this.d;
    this.walkTo(def.x, 0.3);
    d.step(6);
    const on = d.session.interaction.current?.id === id;
    d.tap('interact');
    d.step(24);
    return on;
  }
}
