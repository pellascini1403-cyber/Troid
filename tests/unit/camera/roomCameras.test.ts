import { describe, expect, it } from 'vitest';
import { PLAYER, ROOMS, WORLD } from '@/content';
import { resolveCameraView, roomLimits, type CameraView } from '@/camera/cameraZones';
import { CameraAdapter2D } from '@/render/CameraAdapter2D';
import { FakeSink, SIZES } from '../../helpers/cameraSink';

/**
 * The cameras of the rooms of the world (docs/PROMPT6-LOG.md S26), on every supported screen: the view never shows beyond the limits of
 * the room — or of the zone the hero is in — and the hero is always on screen, standing on every surface a room has. These are the
 * limits a person would call "the camera stays in the level".
 */
const DT = 1 / 60;
const noFlags = { has: () => false };
const HERO = { halfWidth: PLAYER.body.halfWidth, height: PLAYER.body.height };

/**
 * Every spot a hero can stand on in a room: for each metre of the room, the top of each walkable surface there. Walls and doors are not
 * walkable, and neither is a roof that runs up to the ceiling (the crawl tunnel of R1: nobody can climb to its top): a surface is one
 * only if a standing hero on it fits inside the limits of the camera.
 */
function standingSpots(id: string): Array<[number, number]> {
  const room = ROOMS[id]!;
  const doors = new Set((room.gates ?? []).map((g) => g.solid));
  const limits = roomLimits(room);
  const surfaces = room.solids.filter((s) => !s.id.startsWith('wall') && !doors.has(s.id) && s.rect.y1 + HERO.height <= limits.y1);
  const spots: Array<[number, number]> = [];
  for (let x = limits.x0 + 0.5; x <= limits.x1 - 0.5; x += 1) {
    for (const s of surfaces) if (x >= s.rect.x0 && x <= s.rect.x1) spots.push([x, s.rect.y1]);
  }
  return spots;
}

describe('the limits of each room', () => {
  for (const id of WORLD.rooms) {
    const room = ROOMS[id]!;

    it(`${id}: the limits are the room's own, inside its extents, and hold every entrance, every exit and every surface a hero can stand on (head included)`, () => {
      const limits = roomLimits(room);
      expect(room.camera?.bounds, 'a room declares its limits').toBeDefined();
      expect(limits.x0).toBeGreaterThanOrEqual(room.bounds.x0);
      expect(limits.x1).toBeLessThanOrEqual(room.bounds.x1);
      expect(limits.y0).toBeGreaterThanOrEqual(room.bounds.y0);
      expect(limits.y1).toBeLessThanOrEqual(room.bounds.y1);
      for (const e of room.entries) {
        expect(e.x).toBeGreaterThanOrEqual(limits.x0);
        expect(e.x).toBeLessThanOrEqual(limits.x1);
        expect(e.y).toBeGreaterThanOrEqual(limits.y0);
        expect(e.y + HERO.height).toBeLessThanOrEqual(limits.y1);
      }
      for (const x of room.exits ?? []) {
        expect(x.rect.x0).toBeGreaterThanOrEqual(limits.x0);
        expect(x.rect.x1).toBeLessThanOrEqual(limits.x1);
      }
      for (const [, top] of standingSpots(id)) {
        expect(top).toBeGreaterThanOrEqual(limits.y0);
        expect(top + HERO.height + 2, 'room above the head for a jump').toBeLessThanOrEqual(limits.y1 + 4);
      }
    });

    it(`${id}: the floor's foot is the bottom of the picture: the view never shows below the ground (6 m under the lowest floor)`, () => {
      const limits = roomLimits(room);
      const floors = room.solids.filter((s) => (s.kind ?? 'solid') === 'solid' && !s.id.startsWith('wall') && s.rect.y1 <= 0.01);
      const lowestFoot = Math.min(...floors.map((s) => s.rect.y0));
      expect(limits.y0).toBeGreaterThanOrEqual(lowestFoot - 1e-9);
    });
  }
});

describe('the camera in each room, on every screen', () => {
  for (const id of WORLD.rooms) {
    for (const [name, w, h] of SIZES) {
      it(`${id} — ${name}: the hero is on screen standing anywhere in the room, and the view stays inside the limits that hold there`, () => {
        const room = ROOMS[id]!;
        const sink = new FakeSink(w, h);
        const cam = new CameraAdapter2D(sink);
        cam.setRoom(room);
        const view: CameraView = { bounds: room.bounds, viewHeight: null, smoothTime: undefined, zone: null };
        for (const [x, top] of standingSpots(id)) {
          cam.setView(resolveCameraView(room, noFlags, x, top, view));
          cam.snap();
          const t = { x, y: top, vx: 0, vy: 0, facing: 1 as const, grounded: true };
          for (let i = 0; i < 90; i++) {
            cam.setView(resolveCameraView(room, noFlags, x, top, view));
            cam.update(DT, t);
          }
          const v = sink.visible();
          const tol = sink.tolerance + 1e-9;
          expect(v.x0, `the hero at (${x}, ${top}) is on screen (left)`).toBeLessThanOrEqual(x - HERO.halfWidth + tol);
          expect(v.x1, `(right)`).toBeGreaterThanOrEqual(x + HERO.halfWidth - tol);
          expect(v.y0, `(feet)`).toBeLessThanOrEqual(top + tol);
          expect(v.y1, `(head)`).toBeGreaterThanOrEqual(top + HERO.height - tol);
          const limits = resolveCameraView(room, noFlags, x, top).bounds;
          if (v.x1 - v.x0 <= limits.x1 - limits.x0 + tol) {
            expect(v.x0, `inside the limits (left) at x = ${x}`).toBeGreaterThanOrEqual(limits.x0 - tol - 0.07);
            expect(v.x1, `(right) at x = ${x}`).toBeLessThanOrEqual(limits.x1 + tol + 0.07);
          }
          expect(v.y0, `inside the limits (bottom) at x = ${x}`).toBeGreaterThanOrEqual(limits.y0 - tol - 0.07);
        }
      });
    }
  }
});

describe('the arena of R4', () => {
  const r4 = ROOMS.r4_sanctum!;
  const arena = r4.camera!.zones![0]!;

  it('is a zone of the room: it holds the view to the arena — the doors at both ends included — and pulls it back a little', () => {
    expect(arena.id).toBe('arena');
    expect(arena.bounds.x0).toBeLessThan(arena.rect.x0);
    expect(arena.bounds.x1).toBeGreaterThan(arena.rect.x1);
    expect(arena.viewHeight).toBeGreaterThan(13.5);
    expect(arena.viewHeight).toBeLessThanOrEqual(16);
    expect(arena.rect.x1 - arena.rect.x0, 'the arena is wide enough to fight in (about three screens)').toBeGreaterThanOrEqual(36);
  });

  it('the vestibule and the reward chamber are outside it: the camera is free there', () => {
    const at = (x: number): string | null => resolveCameraView(r4, noFlags, x, 0).zone;
    expect(at(4)).toBeNull();
    expect(at(14)).toBeNull(); // the shrine
    expect(at(25)).toBeNull();
    expect(at(40)).toBe('arena');
    expect(at(70)).toBeNull();
    expect(at(95)).toBeNull();
  });

  it('every other room has no zone yet', () => {
    for (const id of ['r1_gate', 'r2_hall', 'r3_chamber']) expect(ROOMS[id]!.camera?.zones ?? [], id).toEqual([]);
  });
});
