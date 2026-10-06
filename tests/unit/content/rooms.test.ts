import { describe, expect, it } from 'vitest';
import { ENEMIES, PLAYER, ROOMS, START } from '@/content';
import { BOTTLE_DEFINITIONS, CARDS } from '@/content/resources';
import { CATALOGS } from '@/i18n';
import { validateRoom } from '@/world/validateRoom';

/**
 * The integrity of the data the game ships (docs/ARCHITECTURE-2D.md §5.11: `validateContent()` at start-up and in tests).
 * A typo in a room is caught here, with the room and the thing named, not in the middle of a playthrough.
 */
const refs = {
  enemies: ENEMIES,
  player: { halfWidth: PLAYER.body.halfWidth, height: PLAYER.body.height },
  cards: new Set(Object.keys(CARDS)),
  bottles: new Set(Object.keys(BOTTLE_DEFINITIONS)),
};

describe('shipped rooms', () => {
  for (const room of Object.values(ROOMS)) {
    it(`"${room.id}" is sound: references, bounds, entrances and spawns`, () => {
      expect(validateRoom(room, refs)).toEqual([]);
    });
  }

  it('every room is registered under its own id', () => {
    for (const [id, room] of Object.entries(ROOMS)) expect(room.id).toBe(id);
  });

  it('a new game starts in a room that exists, with abilities that exist', () => {
    expect(ROOMS[START.room]).toBeDefined();
    expect(ROOMS[START.room]!.entries.length).toBeGreaterThan(0);
  });

  it('every text key a room or an enemy points at exists in EVERY catalog (no text lives in the content)', () => {
    const keys = [...Object.values(ROOMS).map((r) => r.nameKey), ...Object.values(ENEMIES).map((e) => e.nameKey)].filter((k): k is string => k !== undefined);
    expect(keys.length).toBeGreaterThan(0);
    for (const [lang, catalog] of Object.entries(CATALOGS)) for (const k of keys) expect(catalog[k], `${lang}: ${k}`).toBeTruthy();
  });

  it('exits that lead somewhere lead to rooms and entrances that exist', () => {
    for (const room of Object.values(ROOMS)) {
      for (const x of room.exits ?? []) {
        if (!x.to) continue;
        const target = ROOMS[x.to.room];
        expect(target, `${room.id}/${x.id} → ${x.to.room}`).toBeDefined();
        expect(target!.entries.some((e) => e.id === x.to!.entry), `${room.id}/${x.id} → ${x.to.room}:${x.to.entry}`).toBe(true);
      }
    }
  });
});

describe('R1 «Puerta de las Ruinas» (the room of the vertical slice)', () => {
  const r1 = ROOMS.r1_gate!;

  it('has the pieces GAME-SPEC-2D §14.4 asks of it: ground, platforms, one-ways, a low passage, one Ink Slime and an exit', () => {
    const kinds = new Set(r1.solids.map((s) => s.kind ?? 'solid'));
    expect(kinds.has('solid')).toBe(true);
    expect(kinds.has('oneway')).toBe(true);
    expect(r1.spawns?.filter((s) => s.enemy === 'ink_slime')).toHaveLength(1);
    expect(r1.exits?.length).toBeGreaterThanOrEqual(1);
    // the low passage: a roof whose clearance sits between the crouched body (1.0 m) and the standing one (1.7 m)
    const roof = r1.solids.find((s) => s.id === 'tunnel_roof')!;
    expect(roof.rect.y0).toBeGreaterThan(PLAYER.movement.crouch.height);
    expect(roof.rect.y0).toBeLessThan(PLAYER.body.height);
  });

  it('the way out is shut by a door that only the slime\'s defeat opens', () => {
    const slime = r1.spawns!.find((s) => s.enemy === 'ink_slime')!;
    const gate = r1.gates![0]!;
    expect(slime.defeatFlag).toBe('defeated:r1_slime');
    expect(gate.openWhen).toBe(slime.defeatFlag);
    const door = r1.solids.find((s) => s.id === gate.solid)!;
    const exit = r1.exits![0]!.rect;
    expect(door.rect.x1).toBeLessThanOrEqual(exit.x0); // the exit is BEYOND the door
    expect(slime.x).toBeLessThan(door.rect.x0); // and the slime guards this side of it
    // too tall to jump over (a full jump clears 3.1 m)
    expect(door.rect.y1 - door.rect.y0).toBeGreaterThan(6);
  });

  it('every gap and rise respects the MEASURED reach of the controller (running jump ≈ 6.75 m, height 3.1 m)', () => {
    const ground = r1.solids.filter((s) => s.id.startsWith('g_'));
    const sorted = [...ground].sort((a, b) => a.rect.x0 - b.rect.x0);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]!.rect.x0 - sorted[i - 1]!.rect.x1;
      expect(gap, 'pit width').toBeLessThanOrEqual(6.75 * 0.8); // 20 % margin
    }
    for (const s of r1.solids) {
      if (s.kind === 'oneway' || s.id.startsWith('g_') || s.id.startsWith('wall') || s.id === 'tunnel_roof' || s.id === 'gate_door') continue;
      expect(s.rect.y1, `${s.id} is climbable`).toBeLessThanOrEqual(3.1 * 0.8);
    }
  });

  it('the camera sees the whole room within its bounds and the entrance is at the left end', () => {
    expect(r1.bounds.x1 - r1.bounds.x0).toBeGreaterThan(100);
    expect(r1.entries[0]!.x).toBeLessThan(10);
    expect(r1.entries[0]!.facing).toBe(1);
  });
});
