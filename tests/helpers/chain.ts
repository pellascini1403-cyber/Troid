import { createInputFrame } from '@/input/InputFrame';
import type { Hop, Reach, RoomPhysics } from './reach';
import type { Driver } from './sim';

/**
 * A CHAIN OF HOPS, PLAYED THROUGH THE REAL SESSION. The solver (`reach.ts`) says where a hero can get with a given set of abilities by trying hops with a controller of its own; this takes the chain of hops it found from the place a hero starts to
 * a place it asks about and plays every hop of it again through a real `GameSession` of the same room — the hero put at the take-off point with the run-up the solver gave them, the very same frames — and says where the hero came down. If
 * the room is the one the solver saw, the answer is the same place. It is how a test proves that the way the solver found is a way the GAME has (doors, hazards, enemies that are in the room and all).
 */

/** The shortest chain of hops from `reach.start` to the surface `to` (empty when the start is the target; `null` when there is none). */
export function chainTo(reach: Reach, to: number): Hop[] | null {
  if (reach.start === to) return [];
  const previous = new Map<number, Hop>();
  const queue = [reach.start];
  const seen = new Set(queue);
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    for (const hop of reach.hops) {
      if (hop.from !== at || seen.has(hop.to)) continue;
      seen.add(hop.to);
      previous.set(hop.to, hop);
      if (hop.to === to) {
        const out: Hop[] = [];
        for (let h: Hop | undefined = hop; h; h = previous.get(h.from)) out.unshift(h);
        return out;
      }
      queue.push(hop.to);
    }
  }
  return null;
}

/** What a hop that is not steady costs against one that is, when a chain is chosen (`Hop.steady`): a detour of up to five steady hops is preferred to one hop that works only at a single point of the ledge. */
export const FRAGILE_COST = 6;

/**
 * The chain from `reach.start` to the surface `to` that a PERSON would play: the cheapest, where a hop costs one and a hop that is not steady (a take-off that must be right to the centimetre, `Hop.steady === false`) costs `FRAGILE_COST`. With
 * every hop steady it is the shortest chain; a fragile one is used only when the detour around it is longer than that. `null` when there is no chain.
 */
export function cheapestChain(reach: Reach, to: number): Hop[] | null {
  if (reach.start === to) return [];
  const cost = new Map<number, number>([[reach.start, 0]]);
  const previous = new Map<number, Hop>();
  const open = new Set<number>([reach.start]);
  const done = new Set<number>();
  while (open.size > 0) {
    let at = -1;
    for (const i of open) if (at < 0 || cost.get(i)! < cost.get(at)!) at = i;
    open.delete(at);
    if (done.has(at)) continue;
    done.add(at);
    if (at === to) break;
    for (const hop of reach.hops) {
      if (hop.from !== at || done.has(hop.to)) continue;
      const c = cost.get(at)! + (hop.steady === false ? FRAGILE_COST : 1);
      if (c < (cost.get(hop.to) ?? Infinity)) {
        cost.set(hop.to, c);
        previous.set(hop.to, hop);
        open.add(hop.to);
      }
    }
  }
  if (!previous.has(to)) return null;
  const out: Hop[] = [];
  for (let h: Hop | undefined = previous.get(to); h; h = previous.get(h.from)) out.unshift(h);
  return out;
}

/** Ticks the hero stands still between two hops: the time a real walk to the next take-off takes (the dash is ready again, the stick is back at rest). */
const WALK_TICKS = 90;

export interface Landing {
  hop: Hop;
  x: number;
  y: number;
  /** The hero came down (was in the air and is on something again). */
  landed: boolean;
  /** …and came down WHERE the solver's hero did: the same place, to a hair. */
  matches: boolean;
}

/** Plays a chain of hops in the session of `d`, one after the other; the hero stands where the last one put them. */
export function playChain(d: Driver, phys: RoomPhysics, chain: readonly Hop[], has: ReadonlySet<string>): Landing[] {
  const out: Landing[] = [];
  const frame = createInputFrame();
  for (const hop of chain) {
    const rec = phys.record(hop, has);
    d.teleport(rec.x, rec.y);
    d.p.facing = rec.frames[0]!.move.x < 0 ? -1 : 1;
    d.body.vx = rec.vx;
    d.session.collision.probeGround(d.body);
    let airborne = false;
    let landed = false;
    for (const f of rec.frames) {
      Object.assign(frame, f, { move: { ...f.move } });
      d.session.tick(frame);
      if (!d.body.grounded) airborne = true;
      else if (airborne) {
        landed = true;
        break;
      }
    }
    out.push({ hop, x: d.body.x, y: d.body.y, landed, matches: landed && Math.abs(d.body.x - rec.landX) < 0.05 && Math.abs(d.body.y - rec.landY) < 0.05 });
    // the walk to the next take-off, and the breath a hero takes on the way: what a dash spent in the air has to recover before the next one
    d.stop();
    d.step(WALK_TICKS);
  }
  return out;
}
