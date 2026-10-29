import { describe, expect, it } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { Enemy } from '@/enemies/Enemy';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import { Brawler } from '../helpers/brawler';
import { driver } from '../helpers/sim';
import { FALLBACK, TACTICS } from '../helpers/tactics';

/**
 * THE SCRIPTED FIGHTER AND THE LAVA (docs/PROMPT23-LOG.md §7.5). A pool is a FLOOR with a burn on it: the floor test of the fighter ("there is ground to step onto") says yes to the bottom of a basin, and a hero who follows a creature that stands in it is burned,
 * put back on the last safe ground and walks in again — found by the whole-game player in the Ash Orchard, where a spitter on the bottom of a pool drew the hero in five times. A person does not step into lava, nor off the end of a plank with lava under it.
 * What is asked here is the fighter's: in a room with a creature in the lava and another across a river, it fights what comes to it and burns nowhere, with a hero who CAN be burned (the god mode neither burns nor puts back).
 */
function lab(kind: 'basin' | 'planks') {
  const c = new RoomCanvas('brawl_lab', 70, 16).walls();
  if (kind === 'basin') {
    c.ground(1, 69, 2).pool(28, 42);
    c.mark('a', 22, 2);
  } else {
    c.lava(3, 69, 1, 1);
    c.plat(4, 16, 4).plat(24, 36, 4).plat(44, 56, 4);
    c.mark('a', 13, 4);
  }
  return mapRoom({ id: 'brawl_lab', regionId: 'lab', name: 'Brawl lab', nameKey: 'room.lab.name', art: { backdrop: 'ruins', seed: 1 }, rows: c.rows() }, (m) => ({ entries: [m.entry('start', 'a', 1)] }));
}

function fight(kind: 'basin' | 'planks', foes: Array<[string, number, number]>, ticks = 1800) {
  const room = lab(kind);
  const d = driver({ room, unlocked: ['dash'], entry: 'start', seed: 1, extra: { enemies: ENEMIES } });
  d.settle();
  const hits: string[] = [];
  d.session.bus.on('hazard:hit', () => void hits.push(`t${d.session.now}`));
  for (const [id, x, y] of foes) d.session.spawn(new Enemy(d.session.ids.next(id), ENEMIES[id]!, { x, y, facing: -1 }));
  d.step(1);
  const f = new Brawler(d, TACTICS, FALLBACK);
  const alive = (): number => d.session.entities.filter((e) => e.kind === 'enemy' && !(e as unknown as Enemy).health.dead).length;
  const r = f.run(() => alive() === 0, ticks);
  return { d, hits, r, alive: alive() };
}

describe('the fighter does not follow a creature into the lava', () => {
  it('a spitter on the bottom of a pool 14 m wide: the fighter fights it from the bank — across the pool — and burns nowhere', () => {
    const lavaPools = lab('basin').hazards!.filter((h) => h.kind === 'lava');
    expect(lavaPools.length, 'the lab has its pool').toBeGreaterThan(0);
    const { hits, d } = fight('basin', [['slag_spitter', 34.5, 1]]);
    expect(hits, 'burns').toHaveLength(0);
    expect(d.body.x, 'on the near bank').toBeLessThan(28.5);
  });

  it('a toad on the next plank of a river of lava, 8 m of lava away, and the fighter on the first one: it never runs off the end of its plank to get at it', () => {
    const { hits, d } = fight('planks', [['magma_toad', 25.5, 4]]);
    expect(hits, 'burns').toHaveLength(0);
    expect(d.body.y, 'still on a plank').toBeGreaterThan(3.5);
  });
});
