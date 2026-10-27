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

/** Ticks the hero stands still between two hops: the time a real walk to the next take-off takes (the dash is ready again, the stick is back at rest). */
const WALK_TICKS = 90;

export interface Landing {
  hop: Hop;
  x: number;
  y: number;
  landed: boolean;
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
    out.push({ hop, x: d.body.x, y: d.body.y, landed });
    // the walk to the next take-off, and the breath a hero takes on the way: what a dash spent in the air has to recover before the next one
    d.stop();
    d.step(WALK_TICKS);
  }
  return out;
}
