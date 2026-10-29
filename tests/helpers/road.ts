import { ROOMS, WORLD } from '@/content';
import { analyzeProgression, buildWorldGraph, grantedFlags, worldEnds } from '@/world/worldGraph';

/**
 * THE MAIN ROAD OF THE WORLD (docs/PROMPT22-LOG.md): the rooms from the first to the last, in the order the world's own progression analysis reaches them, and what the hero has when it gets to each one. The tests that play the world read it from here
 * so that they all mean the same road.
 */
const graph = buildWorldGraph(WORLD, ROOMS);
export const PAPER = analyzeProgression(graph, ROOMS);

/** The room where the adventure ends (docs/PROMPT23-LOG.md §7: the last of the Cinder Throne, behind its guardian), read from the way out of the world the rooms have. */
export const LAST_ROOM: string = worldEnds(WORLD, ROOMS)[0]!.room;

/** The room ids of the road, from `WORLD.start.room` to the room where the adventure ends. */
export const ROAD: readonly string[] = (() => {
  const out: string[] = [];
  for (let cur = LAST_ROOM; cur !== WORLD.start.room; cur = PAPER.via.get(cur)!.from) out.unshift(cur);
  out.unshift(WORLD.start.room);
  return out;
})();

/** The abilities (beyond the dash) and the world flags the hero has when it comes into `room`: what the rooms before it on the road hand out. (Not what the room itself does: the guardian that lives there has not fallen yet.) */
export function heldAt(room: string): { abilities: string[]; flags: string[] } {
  const abilities = new Set(['dash']);
  const flags = new Set<string>();
  for (const id of ROAD) {
    if (id === room) break;
    for (const f of grantedFlags(ROOMS[id]!)) {
      if (f.startsWith('ability:')) abilities.add(f.slice(8));
      else if (!f.startsWith('~')) flags.add(f);
    }
  }
  return { abilities: [...abilities], flags: [...flags] };
}

/** The entry of `room` that the road comes in by, and the way out it leaves by (the first room has the world's start; the last has no way on). */
export function legOf(index: number): { entry: string; exit: string | null; next: string | null } {
  const id = ROAD[index]!;
  const next = ROAD[index + 1] ?? null;
  const entry = index === 0 ? WORLD.start.entry : PAPER.via.get(id)!.to.entry;
  return { entry, exit: next ? PAPER.via.get(next)!.exit : null, next };
}

/**
 * What a hero can have when they are in `room`, at the least — the abilities (beyond the dash) and the world flags: on the road, what the road before it handed out; off the road, what was handed out up to the room it branches from and by that room itself (the
 * hero may have taken it before going off the road), and what the way into the room asks (an ability). The question "can they get out of here" is asked with THESE — more abilities only add ways, so it is the hard case.
 */
export function heldFor(room: string): { abilities: string[]; flags: string[] } {
  if (ROAD.includes(room)) {
    const h = heldAt(room);
    return { abilities: h.abilities.filter((a) => a !== 'dash'), flags: h.flags };
  }
  const via = PAPER.via.get(room);
  if (!via) return { abilities: [], flags: [] };
  const before = heldFor(via.from);
  const own = grantedFlags(ROOMS[via.from]!);
  return {
    abilities: [...new Set([...before.abilities, ...own.filter((f) => f.startsWith('ability:')).map((f) => f.slice(8)), ...(via.needs ?? [])])],
    flags: [...new Set([...before.flags, ...own.filter((f) => !f.startsWith('ability:') && !f.startsWith('~'))])],
  };
}
