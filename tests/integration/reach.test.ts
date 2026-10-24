import { describe, expect, it } from 'vitest';
import { ROOMS } from '@/content';
import { createInputFrame } from '@/input/InputFrame';
import { lab } from '../helpers/lab';
import { abilitySet, RoomPhysics, START_ABILITIES } from '../helpers/reach';
import { driver } from '../helpers/sim';

/**
 * THE SOLVER (tests/helpers/reach.ts): it finds the places a hero can stand and the hops between them with the REAL controller. What it says is checked three ways here — against the lab, in which what each ability opens is known; against the
 * real session, which plays the very same inputs and lands in the very same place; and against the rooms that were hand-made before it (a corridor with a ditch, a chamber with a ledge), which a hero with the dash alone has always been able to walk.
 */
const room = lab();
const names = (phys: RoomPhysics, ids: Iterable<number>): string[] => [...ids].sort((a, b) => a - b).map((i) => `${phys.surfaces[i]!.y}@${Math.round(phys.surfaces[i]!.x0) + 0}`);

describe('the places to stand', () => {
  const phys = new RoomPhysics(room);
  it('are the tops of the solids with room above them for the body, joined when they touch: the floor in three pieces by the ledge and the shaft, the ledge, the block, the roof', () => {
    expect(names(phys, phys.surfaces.map((s) => s.index))).toEqual(['2@1', '2@11', '2@20', '7@7', '16@25', '26@0']);
  });
  it('a hero can stand with the centre of the body a hair short of a full body-width past the edge, and no further', () => {
    const s = phys.surfaces.find((x) => x.y === 7)!;
    expect(s.x0).toBeCloseTo(7 - 0.33, 1);
    expect(s.x1).toBeCloseTo(11 + 0.33, 1);
  });
  it('an entry is on the surface under its feet', () => {
    expect(phys.entrySurface('start').y).toBe(2);
    expect(phys.entrySurface('top').y).toBe(16);
  });
});

describe('what each ability opens', () => {
  const reach = (entry: string, ...has: string[]): string[] => {
    const phys = new RoomPhysics(room);
    return names(phys, phys.reachFrom(phys.entrySurface(entry), abilitySet(...has)).surfaces);
  };

  it('with the dash alone the 5 m ledge is a wall: the hero is shut into the first stretch of the floor', () => {
    expect(reach('start', 'dash')).toEqual(['2@1']);
  });
  it('with the Double Jump the ledge, and the floor beyond it', () => {
    expect(reach('start', 'dash', 'double_jump')).toEqual(['2@1', '2@11', '7@7']);
  });
  it('the shaft is climbed with the Wall Jump and with nothing else', () => {
    expect(reach('shaft', 'dash')).toEqual(['2@20']);
    expect(reach('shaft', 'dash', 'double_jump', 'air_dash')).toEqual(['2@20']);
    expect(reach('shaft', 'dash', 'wall_jump')).toEqual(['2@20', '16@25']);
  });
  it('and the way back down is free: from the top the hero drops into the shaft, but cannot climb out of it again without the ability (a trap the solver can tell)', () => {
    const phys = new RoomPhysics(room);
    const top = phys.entrySurface('top');
    const bottom = phys.entrySurface('shaft');
    expect(phys.reachFrom(top, START_ABILITIES).surfaces.has(bottom.index)).toBe(true);
    expect(phys.canReturn(bottom, top, START_ABILITIES)).toBe(false);
    expect(phys.canReturn(bottom, top, abilitySet('dash', 'wall_jump'))).toBe(true);
  });
  it('the zone an exit or a pickup occupies is touched when a reached surface lets the body in it', () => {
    const phys = new RoomPhysics(room);
    const r = phys.reachFrom(phys.entrySurface('start'), START_ABILITIES);
    expect(phys.touches(r, { x0: 2, y0: 2, x1: 4, y1: 6 })).toBe(true);
    expect(phys.touches(r, { x0: 8, y0: 7, x1: 10, y1: 11 })).toBe(false);
    expect(phys.standsNear(r, 3, 2)).toBe(true);
    expect(phys.standsNear(r, 9, 7)).toBe(false);
  });
});

describe('a hop that was found is a hop the real session makes: the same inputs, the same landing', () => {
  const cases: Array<{ entry: string; has: string[]; to: number; pick: (script: string) => boolean }> = [
    { entry: 'start', has: ['dash', 'double_jump'], to: 3, pick: (s) => s.includes('again') },
    { entry: 'shaft', has: ['dash', 'wall_jump'], to: 4, pick: (s) => s.includes('wall') },
  ];
  for (const c of cases) {
    it(`${c.entry} with ${c.has.join('+')}: the hop onto surface ${c.to}`, () => {
      const phys = new RoomPhysics(room);
      const has = abilitySet(...c.has);
      const r = phys.reachFrom(phys.entrySurface(c.entry), has);
      const hop = r.hops.find((h) => h.to === c.to && c.pick(h.script)) ?? r.hops.find((h) => h.to === c.to)!;
      expect(hop, 'a hop to it').toBeDefined();
      const rec = phys.record(hop, has);
      // the real thing: a session of the same room, the hero put where the solver put them, the frames of the trial played one by one
      const d = driver({ room, unlocked: c.has, entry: c.entry });
      d.teleport(rec.x, rec.y);
      d.p.facing = rec.frames[0]!.move.x < 0 ? -1 : 1;
      d.body.vx = rec.vx;
      d.session.collision.probeGround(d.body);
      const frame = createInputFrame();
      let landed = false;
      let airborne = false;
      for (const f of rec.frames) {
        Object.assign(frame, f, { move: { ...f.move } });
        d.session.tick(frame);
        if (!d.body.grounded) airborne = true;
        else if (airborne) {
          landed = true;
          break;
        }
      }
      expect(landed, 'the session lands too').toBe(true);
      expect(d.body.x).toBeCloseTo(rec.landX, 6);
      expect(d.body.y).toBeCloseTo(rec.landY, 6);
    });
  }
});

describe('the rooms made by hand before it', () => {
  it('R2 (a ditch and a high road) can be walked end to end with the dash alone, and the spikes of the low road are never in the way', () => {
    const phys = new RoomPhysics(ROOMS.r2_hall!);
    const r = phys.reachFrom(phys.entrySurface('west'), START_ABILITIES);
    const east = ROOMS.r2_hall!.exits!.find((x) => x.id === 'east')!;
    expect(phys.touches(r, east.rect)).toBe(true);
    // and back: from the east entry to the west exit
    const back = phys.reachFrom(phys.entrySurface('east'), START_ABILITIES);
    expect(phys.touches(back, ROOMS.r2_hall!.exits!.find((x) => x.id === 'west')!.rect)).toBe(true);
  });
  it('R3 (the chamber with a ledge for the card) reaches the card with the dash alone', () => {
    const r3 = ROOMS.r3_chamber!;
    const phys = new RoomPhysics(r3);
    const r = phys.reachFrom(phys.entrySurface('west'), START_ABILITIES);
    const card = r3.interactables!.find((i) => i.id === 'card_spirit_bolt')!;
    expect(phys.standsNear(r, card.x, card.y)).toBe(true);
  });
});
