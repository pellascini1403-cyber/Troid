import { ROOMS, WORLD } from '@/content';
import { analyzeProgression, buildWorldGraph, grantedFlags } from '@/world/worldGraph';

/**
 * THE MAIN ROAD OF THE WORLD (docs/PROMPT22-LOG.md): the rooms from the first to the last, in the order the world's own progression analysis reaches them, and what the hero has when it gets to each one. The tests that play the world read it from here
 * so that they all mean the same road.
 */
const graph = buildWorldGraph(WORLD, ROOMS);
export const PAPER = analyzeProgression(graph, ROOMS);

/** The room ids of the road, from `WORLD.start.room` to the room where the adventure ends. */
export const ROAD: readonly string[] = (() => {
  const out: string[] = [];
  for (let cur = 'ih_end'; cur !== WORLD.start.room; cur = PAPER.via.get(cur)!.from) out.unshift(cur);
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
