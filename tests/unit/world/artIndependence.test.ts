import { describe, expect, it } from 'vitest';
import { R1_GATE_ROOM } from '@/content/rooms/r1Gate';
import { R2_HALL_ROOM } from '@/content/rooms/r2Hall';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { Driver, makeSession } from '../../helpers/sim';

/**
 * COLLISION IS NOT THE ART (docs/ART-PIPELINE-2D.md, part I): a room is its DATA. What the hero walks on, hits and falls through is `solids`, `gates`, `hazards` and
 * `exits`; the picture of the room — its backdrop and the MATERIAL of each solid, which is what selects the tiles that will dress it — is a skin over that data. So changing
 * the picture, removing it or asking for one that does not exist leaves the simulation exactly where it was, tick by tick. (And nothing of the simulation can read the
 * picture: `architecture.test.ts` — `presentation/environment` is not among the five modules it may import.)
 */
const withMaterials = (room: RoomDefinition, to: string): RoomDefinition => ({ ...room, solids: room.solids.map((s) => ({ ...s, material: to })) });
const noArt = (room: RoomDefinition): RoomDefinition => {
  const { art: _art, ...rest } = room;
  return rest;
};

/** A scripted play of a room (run, jump, hit, dash, crouch, run on) and what the simulation says every 10 ticks, plus the colliders it collided with. */
function play(room: RoomDefinition): { trace: unknown[]; colliders: unknown[] } {
  const d = new Driver(makeSession({ room, unlocked: ['dash'], extra: { rooms: { [room.id]: room } } }));
  const trace: unknown[] = [];
  const mark = (): void => void trace.push({ t: d.session.now, x: d.body.x, y: d.body.y, vx: d.body.vx, vy: d.body.vy, g: d.body.grounded, a: d.p.view.anim, hp: d.p.health.current });
  d.step(20);
  mark();
  d.right();
  for (let i = 0; i < 12; i++) {
    d.step(10);
    mark();
    if (i === 2) d.tap('jump');
    if (i === 5) d.tap('attack');
    if (i === 7) d.tap('dash');
  }
  d.moveY = -1;
  d.step(40);
  mark();
  d.moveY = 0;
  d.step(120);
  mark();
  return { trace, colliders: [...d.session.collision.all()].map((c) => ({ id: c.id, rect: c.rect, kind: c.kind, enabled: c.enabled })) };
}

describe('the art of a room does not change what the simulation sees', () => {
  for (const room of [R1_GATE_ROOM, R2_HALL_ROOM]) {
    const base = play(room);

    it(`${room.id}: without its backdrop, or with one that does not exist, the same play gives the same ticks and the same colliders`, () => {
      expect(base.trace.length).toBeGreaterThan(12);
      for (const variant of [noArt(room), { ...room, art: { backdrop: 'a place that was never drawn', seed: 99 } }]) {
        const other = play(variant);
        expect(other.trace).toEqual(base.trace);
        expect(other.colliders).toEqual(base.colliders);
      }
    });

    it(`${room.id}: the MATERIAL of every solid is dress, not substance: the same play over a room made all of another material is the same`, () => {
      for (const material of ['moss', 'wood', 'a material nobody has drawn']) {
        const other = play(withMaterials(room, material));
        expect(other.trace).toEqual(base.trace);
        expect(other.colliders).toEqual(base.colliders);
      }
    });
  }

  it('the colliders are the room\'s solids, one for one, wherever the picture puts its tiles', () => {
    const { colliders } = play(R1_GATE_ROOM);
    const rects = (colliders as Array<{ id: string; rect: unknown }>).filter((c) => R1_GATE_ROOM.solids.some((s) => s.id === c.id));
    expect(rects).toHaveLength(R1_GATE_ROOM.solids.length);
    for (const s of R1_GATE_ROOM.solids) expect(rects.find((c) => c.id === s.id)!.rect).toEqual(s.rect);
  });
});
