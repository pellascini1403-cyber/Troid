import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WORLD } from '@/content';
import { PACKS } from '../../../tools/art/packs/all';

/**
 * IS `art/` WHAT THE PAINTER WOULD WRITE TODAY (docs/PROMPT23-LOG.md §5.6)? A pack says which rooms need it (`zones`) and composes a scene for each — both read from the rooms' data, which changes whenever a room is added or moved — and `npm run art:build`
 * writes them down. A room that was added and whose packs were not rebuilt is a room that is drawn with the blockout where the art should be (the first version of the Mangrove had planks of grey slab, because the ground pack did not know the room), and nothing
 * else notices: the art checks verify the folder, not that the folder is current. The scenes are pure functions of the room data, so this needs no painting: it composes them again and compares.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const art = join(root, 'art');
const index = (JSON.parse(readFileSync(join(art, 'index.json'), 'utf8')) as { packs: Array<{ id: string; load: string; zones?: string[] }> }).packs;

describe('the committed art is what the painter composes from the rooms as they are', () => {
  it('every pack of the painter is in the index (the order there is the order they were first made in, and it decides which pack wins a slot two of them fill: the painter does not reorder it), and every room of the world is named by some pack', () => {
    const painted = index.filter((e) => PACKS.some((p) => p.id === e.id)).map((e) => e.id);
    expect([...painted].sort()).toEqual(PACKS.map((p) => p.id).sort());
    const held = new Set(index.flatMap((e) => e.zones ?? []));
    expect(WORLD.rooms.filter((r) => !held.has(r)), 'rooms no pack of the index names').toEqual([]);
  });

  for (const pack of PACKS) {
    it(`${pack.id}: the rooms it names, and the scene of each, are the ones the rooms' data asks for today`, () => {
      const entry = index.find((e) => e.id === pack.id)!;
      if ((pack.load ?? 'zone') === 'zone') expect([...(entry.zones ?? [])].sort(), `the rooms ${pack.id} names in art/index.json`).toEqual([...pack.zones].sort());
      const scenes = pack.scenes ?? {};
      const dir = join(art, pack.id, 'scenes');
      expect(existsSync(dir) ? readdirSync(dir).sort() : [], `the scenes in art/${pack.id}/scenes`).toEqual(Object.keys(scenes).map((r) => `${r}.json`).sort());
      for (const [room, compose] of Object.entries(scenes)) {
        const written = readFileSync(join(dir, `${room}.json`), 'utf8');
        expect(written, `art/${pack.id}/scenes/${room}.json is not what its composer makes today (run \`npm run art:build -- --pack ${pack.id}\` and \`npm run assets:pack\`)`).toBe(`${JSON.stringify(compose(pack), null, 2)}\n`);
      }
    });
  }
});
