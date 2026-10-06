import { describe, expect, it } from 'vitest';
import { resolveCameraView, roomLimits, type CameraView } from '@/camera/cameraZones';
import { CameraAdapter2D } from '@/render/CameraAdapter2D';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { FakeSink, SIZES } from '../../helpers/cameraSink';

/**
 * Camera zones (docs/PROMPT6-LOG.md S26): the limits the view keeps to are the room's — its left, right, top and bottom edge — except
 * inside a zone, where the zone's replace them (and the visible height may change). A pure resolver says which; the adapter eases to it.
 */
const DT = 1 / 60;
const flags = (...on: string[]): { has(f: string): boolean } => ({ has: (f) => on.includes(f) });
const target = (x: number, y = 0): { x: number; y: number; vx: number; vy: number; facing: 1 | -1; grounded: boolean } => ({ x, y, vx: 0, vy: 0, facing: 1, grounded: true });

/** A 100 m room with limits tighter than itself and an arena in the middle that is shut while a guardian lives. */
function arenaRoom(over: Partial<NonNullable<RoomDefinition['camera']>> = {}): RoomDefinition {
  return {
    id: 'a', regionId: 't', name: 'a', bounds: rect(-1, -12, 100, 18), killY: -20,
    entries: [{ id: 'start', x: 4, y: 0 }],
    solids: [block('wl', -2, -12, 0, 18), block('wr', 99, -12, 101, 18), ground('g', 0, 99)],
    camera: {
      bounds: rect(-1, -6, 100, 11),
      zones: [{ id: 'arena', rect: rect(30, -1, 70, 12), bounds: rect(28, -6, 72, 10), viewHeight: 15, smoothTime: 0.8, whenClear: 'defeated:boss' }],
      ...over,
    },
  };
}

describe('resolveCameraView', () => {
  it('without a camera of its own the limits are the room\'s extents, and nothing is zoomed', () => {
    const plain: RoomDefinition = { ...arenaRoom(), camera: undefined };
    const v = resolveCameraView(plain, flags(), 50, 0);
    expect(v.bounds).toBe(plain.bounds);
    expect([v.viewHeight, v.smoothTime, v.zone]).toEqual([null, undefined, null]);
    expect(roomLimits(plain)).toBe(plain.bounds);
  });

  it('with limits of its own they are the room\'s limits everywhere outside a zone', () => {
    const room = arenaRoom();
    for (const x of [-0.5, 5, 29.9, 70.1, 99]) {
      const v = resolveCameraView(room, flags(), x, 0);
      expect(v.bounds, `x = ${x}`).toBe(room.camera!.bounds);
      expect(v.zone).toBeNull();
    }
  });

  it('inside a zone the zone\'s limits, visible height and easing time replace them', () => {
    const room = arenaRoom();
    const v = resolveCameraView(room, flags(), 50, 0);
    expect(v.zone).toBe('arena');
    expect(v.bounds).toBe(room.camera!.zones![0]!.bounds);
    expect(v.viewHeight).toBe(15);
    expect(v.smoothTime).toBe(0.8);
  });

  it('the zone is where the hero\'s FEET are: its rectangle, edges included', () => {
    const room = arenaRoom();
    const at = (x: number, y: number): string | null => resolveCameraView(room, flags(), x, y).zone;
    expect(at(30, 0)).toBe('arena');
    expect(at(70, 0)).toBe('arena');
    expect(at(29.99, 0)).toBeNull();
    expect(at(70.01, 0)).toBeNull();
    expect(at(50, -1)).toBe('arena');
    expect(at(50, 12)).toBe('arena');
    expect(at(50, -1.01)).toBeNull();
    expect(at(50, 12.01)).toBeNull();
  });

  it('a zone that reads a flag applies only while the flag lets it: `whenClear` (shut until the guardian falls) and `whenSet`', () => {
    const room = arenaRoom();
    expect(resolveCameraView(room, flags(), 50, 0).zone).toBe('arena');
    expect(resolveCameraView(room, flags('defeated:boss'), 50, 0).zone, 'the guardian fell: the view is free again').toBeNull();
    const set = arenaRoom({ zones: [{ id: 'z', rect: rect(30, -1, 70, 12), bounds: rect(28, -6, 72, 10), whenSet: 'door:shut' }] });
    expect(resolveCameraView(set, flags(), 50, 0).zone).toBeNull();
    expect(resolveCameraView(set, flags('door:shut'), 50, 0).zone).toBe('z');
  });

  it('the first zone that applies wins, in the order the room lists them', () => {
    const room = arenaRoom({
      zones: [
        { id: 'small', rect: rect(40, -1, 50, 12), bounds: rect(38, -6, 52, 10) },
        { id: 'big', rect: rect(30, -1, 70, 12), bounds: rect(28, -6, 72, 10) },
      ],
    });
    expect(resolveCameraView(room, flags(), 45, 0).zone).toBe('small');
    expect(resolveCameraView(room, flags(), 35, 0).zone).toBe('big');
  });

  it('writes into the object it is given and gives the SAME limits object each time: nothing is allocated per frame, a change is `!==`', () => {
    const room = arenaRoom();
    const out: CameraView = { bounds: room.bounds, viewHeight: null, smoothTime: undefined, zone: null };
    expect(resolveCameraView(room, flags(), 50, 0, out)).toBe(out);
    const inArena = out.bounds;
    resolveCameraView(room, flags(), 50, 0, out);
    expect(out.bounds).toBe(inArena);
    resolveCameraView(room, flags(), 5, 0, out);
    expect(out.bounds).not.toBe(inArena);
    expect(out.zone).toBeNull();
    expect(out.viewHeight).toBeNull();
  });
});

describe('CameraAdapter2D.setView: the limits follow the zone', () => {
  const settle = (cam: CameraAdapter2D, room: RoomDefinition, f: { has(f: string): boolean }, x: number, frames: number, view: CameraView): void => {
    for (let i = 0; i < frames; i++) {
      cam.setView(resolveCameraView(room, f, x, 0, view));
      cam.update(DT, target(x));
    }
  };
  const fresh = (room: RoomDefinition): CameraView => ({ bounds: room.bounds, viewHeight: null, smoothTime: undefined, zone: null });

  for (const [name, w, h] of SIZES) {
    it(`in the arena the view never shows beyond the arena, and out of it beyond the room — ${name}`, () => {
      const room = arenaRoom();
      const sink = new FakeSink(w, h);
      const cam = new CameraAdapter2D(sink);
      cam.setRoom(room);
      const view = fresh(room);
      // walk the whole room: inside the arena the picture is held to [28, 72]; elsewhere to [-1, 100]
      for (let x = 0; x <= 98; x += 2) {
        settle(cam, room, flags(), x, 500, view); // (a 29 m ease over 0.8 s takes ≈ 8 s to be exact: the view is held to the limits once it has settled)
        const v = sink.visible();
        const tol = sink.tolerance + 1e-9;
        const inside = x >= 30 && x <= 70;
        const lo = inside ? 28 : -1;
        const hi = inside ? 72 : 100;
        // (a view wider than its limits is centred: it cannot be inside them)
        if (v.x1 - v.x0 <= hi - lo) {
          expect(v.x0, `left edge at x = ${x}`).toBeGreaterThanOrEqual(lo - tol);
          expect(v.x1, `right edge at x = ${x}`).toBeLessThanOrEqual(hi + tol);
        }
        expect(v.y0, `bottom edge at x = ${x}`).toBeGreaterThanOrEqual(-6 - tol);
        expect(v.y1, `top edge at x = ${x}`).toBeLessThanOrEqual((inside ? 10 : 11) + tol);
      }
    });
  }

  it('entering the arena pulls the view back (15 m) and holds it; leaving, or the guardian falling, lets it go (13.5 m): it eases, it never jumps', () => {
    const room = arenaRoom();
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(room);
    const view = fresh(room);
    settle(cam, room, flags(), 20, 120, view);
    const height = (): number => sink.visible().y1 - sink.visible().y0;
    expect(height()).toBeCloseTo(13.5, 2);
    let prev = height();
    let maxStep = 0;
    for (let i = 0; i < 400; i++) {
      cam.setView(resolveCameraView(room, flags(), 31, 0, view));
      cam.update(DT, target(31));
      maxStep = Math.max(maxStep, Math.abs(height() - prev));
      prev = height();
    }
    expect(height()).toBeCloseTo(15, 2);
    expect(maxStep, 'the zoom eased').toBeLessThan(0.1);
    // the guardian falls while the hero is still inside: the zone lets go
    settle(cam, room, flags('defeated:boss'), 31, 400, view);
    expect(height()).toBeCloseTo(13.5, 2);
    expect(sink.visible().x0).toBeLessThan(28); // and the view is free to show what was outside the arena
  });

  it('the easing is the zone\'s own: a slow zone takes longer to take hold than a fast one', () => {
    const edge = (smoothTime: number): number => {
      const room = arenaRoom({ zones: [{ id: 'z', rect: rect(30, -1, 70, 12), bounds: rect(40, -6, 60, 10), smoothTime }] });
      const sink = new FakeSink(1920, 1080);
      const cam = new CameraAdapter2D(sink);
      cam.setRoom(room);
      const view = fresh(room);
      settle(cam, room, flags(), 20, 60, view);
      for (let i = 0; i < 30; i++) {
        cam.setView(resolveCameraView(room, flags(), 45, 0, view));
        cam.update(DT, target(45));
      }
      return sink.visible().x0; // half a second after entering: how far the limits have closed in
    };
    expect(edge(0.2)).toBeGreaterThan(edge(2));
  });

  it('a hero who is put INSIDE the arena (a respawn, a loaded game) gets the arena at once, not an easing from the room: the cut takes the zone\'s limits', () => {
    const room = arenaRoom();
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(room);
    cam.setView(resolveCameraView(room, flags(), 31, 0, fresh(room)));
    cam.snap();
    cam.update(DT, target(31));
    expect(sink.visible().x0).toBeGreaterThanOrEqual(28 - sink.tolerance);
  });

  it('a new room forgets the zone of the old one: its own limits and the default height at once', () => {
    const room = arenaRoom();
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(room);
    const view = fresh(room);
    settle(cam, room, flags(), 50, 300, view);
    expect(sink.visible().y1 - sink.visible().y0).toBeCloseTo(15, 2);
    cam.setRoom({ ...room, camera: undefined });
    cam.update(DT, target(5));
    const v = sink.visible();
    expect(v.y1 - v.y0, 'a room change is a cut: the default height at once').toBeCloseTo(13.5, 2);
    expect(v.x0).toBeGreaterThanOrEqual(-1 - sink.tolerance); // and the new room's own limits (its extents)
  });

  it('setView does nothing while the zone is the same: it never restarts an easing in progress', () => {
    const room = arenaRoom();
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(room);
    const view = fresh(room);
    settle(cam, room, flags(), 31, 20, view);
    const rig = cam.rig as unknown as { setBounds: (...a: unknown[]) => void };
    let calls = 0;
    const original = rig.setBounds.bind(rig);
    rig.setBounds = (...a) => {
      calls++;
      original(...a);
    };
    settle(cam, room, flags(), 31, 100, view);
    expect(calls).toBe(0);
  });
});
