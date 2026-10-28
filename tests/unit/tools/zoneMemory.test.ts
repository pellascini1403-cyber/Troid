import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WORLD } from '@/content';
import { MEMORY_BUDGET_MIB, MIB } from '@/presentation/stressModel';

/**
 * WHAT A ZONE COSTS IN MEMORY (docs/PROMPT23-LOG.md §5.5): the art the game holds in a room is every pack that is fetched with the game (the hero, the light of the effects) and every pack whose `zones` name the room, as the pages of
 * its atlases once decoded. The sixty rooms past the Ruins each have a set of their own — a backdrop, a ground, the pieces that stand in them — and the budget a zone has (40 MiB, `MEMORY_BUDGET_MIB`) is what decides how
 * much set a zone can have. This is the sum of the pages as the packer wrote them, and it is what the game holds: the library measured the same number in the arena of the Spire (E2E, `scratchpad` `mem.mts`: 37.7 MiB).
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const art = join(root, 'public', 'art');

interface IndexEntry {
  id: string;
  load: 'boot' | 'zone';
  zones?: string[];
  manifest: string;
}

const index = (JSON.parse(readFileSync(join(art, 'index.json'), 'utf8')) as { packs: IndexEntry[] }).packs;
const bytesOf = (e: IndexEntry): number => {
  const m = JSON.parse(readFileSync(join(art, e.manifest), 'utf8')) as { atlases: Array<{ width: number; height: number }> };
  return m.atlases.reduce((n, a) => n + a.width * a.height * 4, 0);
};
const weight = new Map(index.map((e) => [e.id, bytesOf(e)]));

/** The packs the game holds in a room, and their pages in bytes. */
const held = (room: string): Array<[string, number]> => index.filter((e) => e.load === 'boot' || e.zones?.includes(room)).map((e): [string, number] => [e.id, weight.get(e.id)!]);

describe('the memory of a zone: the pages of what the game holds in a room', () => {
  it('every room of the world holds fewer pages than a zone may', () => {
    const limit = MEMORY_BUDGET_MIB.zone * MIB;
    const over = WORLD.rooms.map((room) => ({ room, bytes: held(room).reduce((n, [, b]) => n + b, 0) })).filter((r) => r.bytes >= limit);
    expect(over.map((r) => `${r.room}: ${(r.bytes / MIB).toFixed(1)} MiB`)).toEqual([]);
  });

  it('a room of a zone past the Ruins holds its zone\'s set and none of another zone\'s (a set is for its rooms only)', () => {
    const sets = index.filter((e) => e.id.startsWith('zone-'));
    expect(sets.map((e) => e.id).sort()).toEqual(['zone-foundry', 'zone-heart', 'zone-mines', 'zone-mire', 'zone-roots', 'zone-spire']);
    for (const room of WORLD.rooms) {
      const mine = held(room).map(([id]) => id).filter((id) => id.startsWith('zone-'));
      expect(mine.length, `${room} holds ${mine.join(', ') || 'no set'}`).toBeLessThanOrEqual(1);
    }
    // every room past the Ruins holds exactly one
    expect(WORLD.rooms.filter((r) => !/^(r\d|ru_)/.test(r)).every((room) => held(room).some(([id]) => id.startsWith('zone-')))).toBe(true);
  });
});
