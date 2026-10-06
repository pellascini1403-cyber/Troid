import { describe, expect, it } from 'vitest';
import { ENEMIES, PLAYER, ROOMS, START, WORLD } from '@/content';
import { BOTTLE_DEFINITIONS, CARDS } from '@/content/resources';
import { CATALOGS } from '@/i18n';
import { validateRoom } from '@/world/validateRoom';
import { analyzeProgression, buildWorldGraph, destinationOf, edgesFrom, routeBetween, validateWorld, worldGrantedFlags } from '@/world/worldGraph';

/**
 * The shipped mini-world (docs/PROMPT6-LOG.md S22): four rooms in a line, each connected to the next and back, every connection
 * naming the entry the player appears at. The graph is read from the data of the rooms; nothing here knows what comes after what.
 */
const player = { halfWidth: PLAYER.body.halfWidth, height: PLAYER.body.height };
const graph = buildWorldGraph(WORLD, ROOMS);

describe('the world as shipped', () => {
  it('passes the world validator: every reference exists, no entry sits inside an exit, every room can be reached and left', () => {
    expect(validateWorld(WORLD, ROOMS, { player })).toEqual([]);
  });

  it('is four rooms, in the order the player meets them: R1 → R2 → R3 → R4', () => {
    expect(WORLD.rooms).toEqual(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']);
    expect(analyzeProgression(graph, ROOMS).order).toEqual(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']);
  });

  it('every room of the world is registered under its own id, and the registry also keeps the playgrounds', () => {
    for (const id of WORLD.rooms) expect(ROOMS[id]?.id).toBe(id);
    for (const id of ['movement_test', 'crouch_test', 'interaction_test']) expect(ROOMS[id]).toBeDefined();
  });

  it('a new game starts where the world says (the first room, at its start entry)', () => {
    expect(START.room).toBe(WORLD.start.room);
    expect(START.entry).toBe(WORLD.start.entry);
    expect(ROOMS[START.room]!.entries.some((e) => e.id === START.entry)).toBe(true);
    expect(START.room).toBe('r1_gate');
  });

  it('every room validates on its own with the flags the rest of the world hands out', () => {
    const refs = { enemies: ENEMIES, player, cards: new Set(Object.keys(CARDS)), bottles: new Set(Object.keys(BOTTLE_DEFINITIONS)), externalFlags: worldGrantedFlags(WORLD, ROOMS) };
    for (const id of WORLD.rooms) expect(validateRoom(ROOMS[id]!, refs), id).toEqual([]);
  });

  it('every room has a name for the player, in every language', () => {
    for (const id of WORLD.rooms) {
      const key = ROOMS[id]!.nameKey;
      expect(key, id).toBeTruthy();
      for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[key!], `${lang}: ${key}`).toBeTruthy();
    }
  });
});

describe('the connections', () => {
  const at = (room: string, exit: string) => destinationOf(graph, room, exit);

  it('R1 → R2 → R3 → R4 by the east exits, each arriving at the west entry of the next room', () => {
    expect(at('r1_gate', 'east')).toEqual({ room: 'r2_hall', entry: 'west' });
    expect(at('r2_hall', 'east')).toEqual({ room: 'r3_chamber', entry: 'west' });
    expect(at('r3_chamber', 'east')).toEqual({ room: 'r4_sanctum', entry: 'west' });
  });

  it('and back by the west exits, each arriving at the EAST entry of the previous room', () => {
    expect(at('r4_sanctum', 'west')).toEqual({ room: 'r3_chamber', entry: 'east' });
    expect(at('r3_chamber', 'west')).toEqual({ room: 'r2_hall', entry: 'east' });
    expect(at('r2_hall', 'west')).toEqual({ room: 'r1_gate', entry: 'east' });
  });

  it('every connection is two-way: whoever you leave through, you can come back through', () => {
    for (const e of graph.edges) {
      const back = edgesFrom(graph, e.to.room).filter((b) => b.to.room === e.from);
      expect(back.length, `${e.from}/${e.exit} → ${e.to.room}`).toBeGreaterThan(0);
    }
  });

  it('the spawn point of an arrival is on the side the player came from, facing into the room', () => {
    for (const e of graph.edges) {
      const target = ROOMS[e.to.room]!;
      const entry = target.entries.find((n) => n.id === e.to.entry)!;
      const middle = (target.bounds.x0 + target.bounds.x1) / 2;
      // entering through a west entry means being in the west half, facing east; an east entry the other way round
      if (e.to.entry === 'west') {
        expect(entry.x, `${e.from}→${e.to.room}`).toBeLessThan(middle);
        expect(entry.facing).toBe(1);
      } else {
        expect(entry.x, `${e.from}→${e.to.room}`).toBeGreaterThan(middle);
        expect(entry.facing).toBe(-1);
      }
    }
  });

  it('an exit zone is where its name says: the west ones at the left wall, the east ones at the right wall', () => {
    for (const id of WORLD.rooms) {
      const room = ROOMS[id]!;
      const middle = (room.bounds.x0 + room.bounds.x1) / 2;
      for (const x of room.exits ?? []) {
        const centre = (x.rect.x0 + x.rect.x1) / 2;
        if (x.id === 'west') expect(centre, `${id}/west`).toBeLessThan(middle);
        if (x.id === 'east') expect(centre, `${id}/east`).toBeGreaterThan(middle);
      }
    }
  });

  it('the walk from the start to the last room crosses every room once, and back', () => {
    const flags = analyzeProgression(graph, ROOMS).flags;
    expect(routeBetween(graph, 'r1_gate', 'r4_sanctum', flags)).toEqual(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']);
    expect(routeBetween(graph, 'r4_sanctum', 'r1_gate', flags)).toEqual(['r4_sanctum', 'r3_chamber', 'r2_hall', 'r1_gate']);
  });

  it('the only exit that leaves the world is the east one of the last room', () => {
    const ends = WORLD.rooms.flatMap((id) => (ROOMS[id]!.exits ?? []).filter((x) => x.end).map((x) => `${id}/${x.id}`));
    expect(ends).toEqual(['r4_sanctum/east']);
  });
});

describe('what the first room asks of the player', () => {
  it('R1 lets nobody through its exit until the Ink Slime is beaten: the exit says so, and so does the door', () => {
    const r1 = ROOMS.r1_gate!;
    expect(r1.exits![0]!.requires).toBe('defeated:r1_slime');
    expect(r1.gates![0]!.openWhen).toBe('defeated:r1_slime');
    expect(graph.edges.find((e) => e.from === 'r1_gate')!.requires).toBe('defeated:r1_slime');
    // so, with no flags, the paper player is stuck in R1; with the slime beaten, the world opens
    expect(analyzeProgression(graph, ROOMS).order).toHaveLength(4);
    const shut = { ...ROOMS, r1_gate: { ...r1, spawns: [{ ...r1.spawns![0]!, defeatFlag: undefined }] } };
    // (without a defeat flag nothing sets the one the exit requires: the validator says so)
    expect(validateWorld(WORLD, shut as typeof ROOMS, { player }).map((i) => i.code)).toEqual(expect.arrayContaining(['flag-ungranted', 'room-unreachable']));
  });
});
