import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { deadEnds } from '../helpers/audit';
import { heldFor } from '../helpers/road';

/**
 * NO PLACE OF THE WORLD IS A TRAP (docs/PROMPT22-LOG.md §7): a hero who has come to a place in a room — by a jump that fell short, by dropping off a ledge, by a kick at the wall that did not reach — can still get out of it with what they have. The
 * check is made on the real controller, as everything of the terrain is (`reach.ts`), for every room of the world, with the abilities the hero has at the least when they are in it.
 */
describe('there is a way out of every place a hero can come to', () => {
  for (const id of WORLD.rooms) {
    const held = heldFor(id);
    it(`${id}: with ${held.abilities.join(' + ') || 'the dash alone'}`, () => {
      expect(deadEnds(ROOMS[id]!, held.abilities, held.flags)).toEqual([]);
    }, 300_000);
  }
});
