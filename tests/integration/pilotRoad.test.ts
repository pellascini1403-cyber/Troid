import { describe, expect, it } from 'vitest';
import { ROOMS } from '@/content';
import { UPGRADES } from '@/content/upgrades';
import { grantedFlags } from '@/world/worldGraph';
import { Pilot } from '../helpers/pilot';
import { legOf, ROAD } from '../helpers/road';
import { driver } from '../helpers/sim';

/**
 * THE PILOT ON THE ROAD, ROOM BY ROOM (docs/PROMPT22-LOG.md): a scripted player with the inputs of a person — walks along what it stands on, takes off where the solver says a hop works and plays the script's inputs against the body it really has, crawls
 * under low roofs, and walks into the way out — crosses each room of the main road of the world, in the real session, from the entrance the road comes in by to the way out it leaves by, with what the hero has when it gets there. The rooms are taken quiet
 * (no creature, no guardian; the hero cannot die): this is the question of the TERRAIN, asked of the hero's real body and not of the solver's probe. The fights are the question of `tests/integration/encounters.test.ts`, and the whole thing in one session
 * that of `tests/integration/fullRun.test.ts`.
 */
describe('the pilot crosses every room of the road, from the entrance it comes in by to the way out it leaves by', () => {
  const abilities = new Set(['dash']);
  const flags = new Set<string>();
  for (let i = 0; i < ROAD.length - 1; i++) {
    const id = ROAD[i]!;
    const room = ROOMS[id]!;
    const { entry, exit, next } = legOf(i);
    // what the hero has when it comes in; and, so that the way on is open, what this room hands out (the rune it stands beside, the guardian it has beaten)
    const granted = grantedFlags(room);
    for (const f of granted) if (f.startsWith('ability:')) abilities.add(f.slice(8));
    const held = [...abilities];
    const heldFlags = [...flags, ...granted.filter((f) => !f.startsWith('~') && !f.startsWith('ability:'))];
    for (const f of granted) if (!f.startsWith('ability:')) flags.add(f);
    it(`${String(i).padStart(2)} ${id}: ${entry} → ${exit} (${next})`, () => {
      const quiet = { ...room, spawns: [], bosses: [] };
      const d = driver({ room: quiet, entry, unlocked: held, extra: { rooms: { ...ROOMS, [id]: quiet }, upgrades: UPGRADES, flags: heldFlags } });
      d.settle();
      d.session.godMode = true;
      const p = new Pilot(d);
      const ok = p.exit(exit!);
      expect(ok, p.trace.slice(0, 6).join('\n')).toBe(true);
      expect(d.session.room.id).toBe(next);
      expect(p.misses, p.trace.filter((l) => /hop "|crawl/.test(l)).slice(0, 6).join('\n')).toBe(0);
    }, 120_000);
  }
});
