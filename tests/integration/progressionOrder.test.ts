import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { abilityFlag, analyzeProgression, buildWorldGraph, grantedFlags, type WorldEdge } from '@/world/worldGraph';
import { heldFor, PAPER, ROAD } from '../helpers/road';

/**
 * THE ORDER OF THE WORLD, ASKED OF EVERY ROOM (docs/PROMPT22-LOG.md §7). The world only ever gains — a flag set, an ability taught, a card taken is never taken back — so a hero who is somewhere with at least what it took to come there can finish the adventure from
 * there if the progression analysis, started in THAT room with ONLY what the way in asked for, reaches the end. That is the hardest case for every room: whatever else the hero has taken on the way only adds ways. And since every door of the world is a pair, the way
 * back is there too. The terrain inside each room is `deadEnds.test.ts`; this is the world between the rooms: abilities that are given late, doors that wait for a lever, rooms that can be entered before the thing that lets them be left.
 */
const graph = buildWorldGraph(WORLD, ROOMS);
const END = ROAD[ROAD.length - 1]!;

/** What the way into `room` asks of the hero, all the way from the first room: the flags its doors wait for and the abilities they need (as flags). Less than that cannot be in the room; more is only more. */
function asked(room: string): Set<string> {
  const need = new Set<string>();
  for (let cur = room; cur !== graph.start.room; ) {
    const e: WorldEdge = PAPER.via.get(cur)!;
    if (e.requires) need.add(e.requires);
    for (const a of e.needs ?? []) need.add(abilityFlag(a));
    cur = e.from;
  }
  return need;
}

describe('from every room, with only what the way in asked for, the whole world can still be finished', () => {
  for (const id of WORLD.rooms) {
    it(`${id}`, () => {
      const p = analyzeProgression(graph, ROOMS, asked(id), id);
      expect(p.order.includes(END), `the way out of the world is reached from ${id}`).toBe(true);
      expect(p.order.includes(graph.start.room), `and the first room too (the way home)`).toBe(true);
      expect(p.unreachable, `nothing of the world is lost to a hero who stands in ${id} with that much`).toEqual([]);
    });
  }
});

describe('every door is a pair', () => {
  it('every way from a room to another has its way back, and the way back is open to a hero who has gone through: with what the road had handed out up to the room they left, and what the way itself asked', () => {
    const missing: string[] = [];
    for (const e of graph.edges) {
      const here = heldFor(e.from);
      const abilities = new Set([...here.abilities, ...grantedFlags(ROOMS[e.from]!).filter((f) => f.startsWith('ability:')).map((f) => f.slice(8)), ...(e.needs ?? []), 'dash']);
      const flags = new Set([...here.flags, ...grantedFlags(ROOMS[e.from]!), ...(e.requires ? [e.requires] : [])]);
      const back = graph.edges.filter((b) => b.from === e.to.room && b.to.room === e.from);
      const open = back.filter((b) => (!b.requires || flags.has(b.requires)) && (b.needs ?? []).every((a) => abilities.has(a)));
      if (open.length === 0) missing.push(`${e.from}/${e.exit} → ${e.to.room}: no way back open to a hero who went through (${back.map((b) => `${b.exit}${b.requires ? ` requires ${b.requires}` : ''}${b.needs?.length ? ` needs ${b.needs.join('+')}` : ''}`).join(', ') || 'none'})`);
    }
    expect(missing).toEqual([]);
  });
});

describe('what the world asks of the hero is something the world has, and gives in time', () => {
  it('no door, seal or card waits for an ability that is only declared (the grapple, the swim): they are not part of the game', () => {
    const declared = ['grapple', 'swim'];
    for (const id of WORLD.rooms) {
      const room = ROOMS[id]!;
      for (const n of room.needs ?? []) for (const a of n.abilities) expect(declared, `${id} needs ${a}`).not.toContain(a);
      for (const x of room.exits ?? []) for (const a of x.requires ? [x.requires] : []) for (const d of declared) expect(a, `${id}/${x.id}`).not.toBe(abilityFlag(d));
      for (const i of room.interactables ?? []) for (const a of i.actions) if (a.type === 'unlockAbility') expect(declared, `${id}/${i.id} teaches ${a.abilityId}`).not.toContain(a.abilityId);
    }
    for (const e of graph.edges) for (const a of e.needs ?? []) expect(declared, `${e.from}/${e.exit} needs ${a}`).not.toContain(a);
  });

  /** Where on the road each ability is taught. */
  const taught = new Map<string, number>();
  ROAD.forEach((id, i) => {
    for (const x of ROOMS[id]!.interactables ?? []) for (const a of x.actions) if (a.type === 'unlockAbility' && !taught.has(a.abilityId)) taught.set(a.abilityId, i);
  });

  it('every way along the road that asks for an ability asks for one that was taught in the room it leaves or before it (the abilities come in the order of the road)', () => {
    const late: string[] = [];
    for (const e of graph.edges) {
      const from = ROAD.indexOf(e.from);
      const to = ROAD.indexOf(e.to.room);
      if (from < 0 || to < 0) continue; // (a way off the road: below)
      for (const a of e.needs ?? []) if (a !== 'dash' && !((taught.get(a) ?? Infinity) <= Math.max(from, to))) late.push(`${e.from}/${e.exit} asks for ${a}, taught at ${ROAD[taught.get(a) ?? -1] ?? 'nowhere'}`);
    }
    expect(late).toEqual([]);
  });

  it('the only ways that ask for an ability taught LATER than the room are the two that lead off the road, to a room that is not needed to finish: the places to come back to', () => {
    const back: string[] = [];
    for (const e of graph.edges) {
      if (ROAD.includes(e.to.room) || !ROAD.includes(e.from)) continue;
      for (const a of e.needs ?? []) if ((taught.get(a) ?? Infinity) > ROAD.indexOf(e.from)) back.push(`${e.from}/${e.exit} → ${e.to.room} (${a}, taught at ${ROAD[taught.get(a)!]})`);
    }
    expect(back).toEqual(['ru_nave/reliquary → ru_reliquary (double_jump, taught at rt_echo)', 'rt_gallery/hideout → rt_hideout (wall_jump, taught at mr_sink)']);
  });
});
