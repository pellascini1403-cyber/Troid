import { describe, expect, it } from 'vitest';
import type { CameraTarget } from '@/camera/CameraRig';
import { CameraAdapter2D, type CameraSink } from '@/render/CameraAdapter2D';
import { computeViewport, type ViewportLayout } from '@/presentation/viewport';
import { computeWorldTransform, type CameraCentre, type CameraShake, type WorldTransform } from '@/presentation/worldTransform';
import { MOVEMENT_TEST_ROOM } from '@/content/rooms/movementTest';
import { block, ground } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

const DT = 1 / 60;
const VIEW_HEIGHT = 13.5;

/** Stands in for Renderer2D: same viewport maths, no Pixi. Exposes the world rectangle that would be on screen. */
class FakeSink implements CameraSink {
  viewport: ViewportLayout;
  transform: WorldTransform | null = null;
  layout: ViewportLayout;
  constructor(readonly cssWidth: number, readonly cssHeight: number) {
    this.layout = this.compute(VIEW_HEIGHT);
    this.viewport = this.layout;
  }
  private compute(viewHeight: number): ViewportLayout {
    return computeViewport({ cssWidth: this.cssWidth, cssHeight: this.cssHeight, dpr: 3, resolutionCap: 1.75, viewHeight });
  }
  applyCamera(centre: CameraCentre, shake: CameraShake, viewHeight: number): void {
    this.layout = this.compute(viewHeight); // exactly what Renderer2D does when the camera zooms
    this.transform = computeWorldTransform(centre, shake, this.layout, true);
  }
  /** Visible world rectangle (simulation coordinates, +Y up) of the game area. */
  visible(): { x0: number; x1: number; y0: number; y1: number } {
    const t = this.transform as WorldTransform;
    const halfW = this.layout.contentWidth / 2 / t.scale;
    const halfH = this.layout.contentHeight / 2 / t.scale;
    return { x0: t.pivotX - halfW, x1: t.pivotX + halfW, y0: -t.pivotY - halfH, y1: -t.pivotY + halfH };
  }
  get tolerance(): number {
    return 1 / (this.layout.ppm * this.layout.resolution); // one device pixel (the camera snaps to the pixel grid)
  }
}

const target = (x: number, y = 0, vx = 0, facing: 1 | -1 = 1): CameraTarget => ({ x, y, vx, vy: 0, facing, grounded: true });
const run = (cam: CameraAdapter2D, t: CameraTarget, frames: number): void => {
  for (let i = 0; i < frames; i++) cam.update(DT, t);
};

const SIZES: ReadonlyArray<readonly [string, number, number]> = [
  ['4:3 tablet', 1024, 768],
  ['16:9 desktop', 1920, 1080],
  ['19.5:9 phone', 844, 390],
  ['21:9 ultra-wide', 2560, 1080],
  ['32:9 super ultra-wide (pillarboxed to 21:9)', 3840, 1080],
];

describe('CameraAdapter2D: bounds at every supported aspect ratio', () => {
  for (const [name, w, h] of SIZES) {
    it(`never shows anything outside the room — ${name}`, () => {
      const sink = new FakeSink(w, h);
      const cam = new CameraAdapter2D(sink);
      cam.setRoom(MOVEMENT_TEST_ROOM);
      const b = MOVEMENT_TEST_ROOM.bounds;
      for (let x = b.x0; x <= b.x1; x += 5) {
        cam.snap();
        run(cam, target(x), 90);
        const v = sink.visible();
        const tol = sink.tolerance + 1e-9;
        expect(v.x0, `left edge at x=${x}`).toBeGreaterThanOrEqual(b.x0 - tol);
        expect(v.x1, `right edge at x=${x}`).toBeLessThanOrEqual(b.x1 + tol);
        expect(v.y0).toBeGreaterThanOrEqual(b.y0 - tol);
        expect(v.y1).toBeLessThanOrEqual(b.y1 + tol);
      }
    });
  }

  it('the visible height is exactly viewHeight and the visible width follows the clamped aspect', () => {
    for (const [, w, h] of SIZES) {
      const sink = new FakeSink(w, h);
      const cam = new CameraAdapter2D(sink);
      cam.setRoom(MOVEMENT_TEST_ROOM);
      run(cam, target(60), 30);
      const v = sink.visible();
      expect(v.y1 - v.y0).toBeCloseTo(VIEW_HEIGHT, 6);
      expect((v.x1 - v.x0) / (v.y1 - v.y0)).toBeCloseTo(sink.layout.contentAspect, 6);
    }
  });

  it('a room smaller than the view is centred instead of showing the void', () => {
    const tiny: RoomDefinition = {
      id: 'tiny', regionId: 'test', name: 'Tiny', bounds: { x0: 0, y0: -5, x1: 12, y1: 15 },
      solids: [ground('g', 0, 12), block('l', -1, -5, 0, 15), block('r', 12, -5, 13, 15)], entries: [{ id: 'start', x: 6, y: 0 }],
    };
    const sink = new FakeSink(1920, 1080); // shows 24 m, the room is 12 m wide
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(tiny);
    run(cam, target(2), 60);
    expect(cam.centre.x).toBeCloseTo(6, 6);
  });
});

describe('CameraAdapter2D: follow, anticipation and room changes', () => {
  it('anticipates: the look-ahead pushes the view toward where the player is going', () => {
    const lead = (lookAheadDistance: number | undefined, startX: number, vx: number): number => {
      const sink = new FakeSink(1920, 1080);
      const cam = new CameraAdapter2D(sink, lookAheadDistance === undefined ? {} : { lookAhead: { distance: lookAheadDistance, velocityScale: 0.34, facingBias: 0.3, smoothTime: 0.45 } });
      cam.setRoom(MOVEMENT_TEST_ROOM);
      const t = target(startX, 0, vx, vx < 0 ? -1 : 1);
      cam.snap();
      for (let i = 0; i < 300; i++) {
        t.x += vx * DT;
        cam.update(DT, t);
      }
      return cam.centre.x - t.x;
    };
    // running at full speed: the specified 3 m look-ahead is what keeps the player near the middle of the screen
    // (without it the follow lag + dead zone would let the player run toward the edge)
    expect(lead(undefined, 20, 8.5) - lead(0, 20, 8.5)).toBeGreaterThan(2.5);
    // and it leads in the direction of travel, mirrored when going left
    expect(lead(undefined, 100, -8.5) - lead(0, 100, -8.5)).toBeLessThan(-2.5);
  });

  it('holds still when the player stops inside the dead zone (no drift, no wobble)', () => {
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(MOVEMENT_TEST_ROOM);
    const t = target(60, 0, 0, 1);
    run(cam, t, 600);
    const rest = cam.centre.x;
    run(cam, t, 300);
    expect(Math.abs(cam.centre.x - rest)).toBeLessThan(1e-6);
    t.x += 0.8; // a small step stays inside the dead zone: the camera does not move
    run(cam, t, 120);
    expect(Math.abs(cam.centre.x - rest)).toBeLessThan(1e-6);
  });

  it('puts the player lower than the middle of the screen (ground in the lower third)', () => {
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(MOVEMENT_TEST_ROOM);
    run(cam, target(60), 90);
    expect(cam.centre.y).toBeCloseTo(2.3, 1);
    const v = sink.visible();
    expect(0 - v.y0).toBeLessThan(v.y1 - 0); // the feet are below the centre of the view
  });

  it('smooths: a sudden player move never jumps the camera', () => {
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(MOVEMENT_TEST_ROOM);
    run(cam, target(30), 90);
    const before = cam.centre.x;
    cam.update(DT, target(60)); // teleport-sized step in the target
    expect(Math.abs(cam.centre.x - before)).toBeLessThan(1); // limited by maxSpeed and the spring
  });

  it('snap() cuts: the first update after a room change lands on the target, no travel', () => {
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(MOVEMENT_TEST_ROOM);
    run(cam, target(10), 60);
    cam.setRoom(MOVEMENT_TEST_ROOM);
    cam.update(DT, target(100));
    expect(cam.centre.x).toBeGreaterThan(95);
    expect(cam.centre.x).toBeLessThan(105);
  });

  it('an arena lock eases the bounds without jumping the view', () => {
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(MOVEMENT_TEST_ROOM);
    run(cam, target(100), 90);
    cam.lockBounds({ x0: 90, y0: -14, x1: 130, y1: 30 }, 0.6);
    let prev = cam.centre.x;
    let maxStep = 0;
    for (let i = 0; i < 600; i++) {
      cam.update(DT, target(100));
      maxStep = Math.max(maxStep, Math.abs(cam.centre.x - prev));
      prev = cam.centre.x;
    }
    expect(maxStep).toBeLessThan(0.5); // never a jump
    const v = sink.visible(); // once the lock has eased in, the view stays inside the arena
    expect(v.x0).toBeGreaterThanOrEqual(90 - sink.tolerance);
    expect(v.x1).toBeLessThanOrEqual(130 + sink.tolerance);
  });
});

describe('CameraAdapter2D: zoom and shake', () => {
  it('zoom keeps the visible height exactly equal to what the camera asks for', () => {
    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(MOVEMENT_TEST_ROOM);
    run(cam, target(60), 30);
    cam.setZoom(16);
    run(cam, target(60), 300);
    const v = sink.visible();
    expect(v.y1 - v.y0).toBeCloseTo(16, 2);
    cam.setZoom(null);
    run(cam, target(60), 300);
    const v2 = sink.visible();
    expect(v2.y1 - v2.y0).toBeCloseTo(VIEW_HEIGHT, 2);
  });

  it('shake displaces the picture and then dies out completely (cosmetic only)', () => {
    const calm = new FakeSink(1920, 1080);
    const camCalm = new CameraAdapter2D(calm);
    camCalm.setRoom(MOVEMENT_TEST_ROOM);
    run(camCalm, target(60), 60);
    const baseline = calm.visible();

    const sink = new FakeSink(1920, 1080);
    const cam = new CameraAdapter2D(sink);
    cam.setRoom(MOVEMENT_TEST_ROOM);
    run(cam, target(60), 60);
    cam.addTrauma(1);
    let maxShift = 0;
    for (let i = 0; i < 90; i++) {
      cam.update(DT, target(60));
      maxShift = Math.max(maxShift, Math.abs(sink.visible().x0 - baseline.x0));
    }
    expect(maxShift).toBeGreaterThan(0.05);
    run(cam, target(60), 240);
    expect(Math.abs(sink.visible().x0 - baseline.x0)).toBeLessThan(sink.tolerance * 2);
  });
});
