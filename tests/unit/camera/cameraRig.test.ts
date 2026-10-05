import { describe, expect, it } from 'vitest';
import { CameraRig, DEFAULT_CAMERA, type CameraBounds, type CameraTarget } from '@/camera/CameraRig';

const ASPECT = 16 / 9;
const still = (x = 0, y = 0): CameraTarget => ({ x, y, vx: 0, vy: 0, facing: 1, grounded: true });

/** Steps the rig for `seconds` at `hz`, letting `target(t)` describe the player. Returns the final pose centre. */
function run(rig: CameraRig, seconds: number, target: (t: number) => CameraTarget, hz = 60, aspect = ASPECT) {
  const dt = 1 / hz;
  const frames = Math.round(seconds * hz);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < frames; i++) {
    const pose = rig.update(dt, target(i * dt), aspect);
    xs.push(pose.center.x);
    ys.push(pose.center.y);
  }
  return { x: rig.center.x, y: rig.center.y, xs, ys };
}

/** Rig with the shake noise and the facing bias out of the way unless a test needs them. */
const plain = (extra: Partial<typeof DEFAULT_CAMERA> = {}) =>
  new CameraRig({ offset: { x: 0, y: 0 }, lookAhead: { ...DEFAULT_CAMERA.lookAhead, distance: 0 }, ...extra });

describe('CameraRig — pose math', () => {
  it('the pose reports exactly the configured visible height, whatever it is (the renderer derives px/m from it)', () => {
    for (const viewHeight of [10, 13.5, 16, 24]) {
      const rig = plain({ viewHeight });
      rig.snapTo(still(), ASPECT);
      expect(rig.pose.viewHeight).toBe(viewHeight);
      expect(rig.pose.viewHalfWidth).toBeCloseTo((viewHeight / 2) * ASPECT, 8);
    }
  });

  it('visible half width follows the aspect ratio (phone vs tablet)', () => {
    const rig = plain({ viewHeight: 16 });
    rig.snapTo(still(), 20 / 9);
    expect(rig.pose.viewHalfWidth).toBeCloseTo(8 * (20 / 9), 6);
    rig.snapTo(still(), 4 / 3);
    expect(rig.pose.viewHalfWidth).toBeCloseTo(8 * (4 / 3), 6);
  });
});

describe('CameraRig — follow, dead zone, look-ahead', () => {
  it('does not move while the target stays inside the dead zone', () => {
    const rig = plain({ deadZone: { halfWidth: 2, halfHeight: 2 } });
    rig.snapTo(still(0, 0), ASPECT);
    const r = run(rig, 2, (t) => still(Math.sin(t * 3) * 1.5, 0));
    expect(Math.max(...r.xs) - Math.min(...r.xs)).toBeLessThan(1e-6);
  });

  it('follows once the target leaves the dead zone and settles within the dead zone of it', () => {
    const rig = plain({ deadZone: { halfWidth: 2, halfHeight: 2 } });
    rig.snapTo(still(0, 0), ASPECT);
    const r = run(rig, 4, () => still(20, 0));
    expect(Math.abs(20 - r.x)).toBeLessThanOrEqual(2 + 1e-3);
    expect(r.x).toBeGreaterThan(17);
  });

  it('never overshoots a stationary target (critically damped)', () => {
    const rig = plain({ deadZone: { halfWidth: 0, halfHeight: 0 } });
    rig.snapTo(still(0, 0), ASPECT);
    const r = run(rig, 4, () => still(12, 0));
    expect(Math.max(...r.xs)).toBeLessThanOrEqual(12 + 1e-6);
  });

  it('looks ahead in the direction of travel, and eases back to the facing bias when it stops', () => {
    const rig = new CameraRig({ offset: { x: 0, y: 0 }, deadZone: { halfWidth: 0, halfHeight: 0 } });
    rig.snapTo(still(0, 0), ASPECT);
    // run right at 9 m/s for 2 s
    const r = run(rig, 2, (t) => ({ x: t * 9, y: 0, vx: 9, vy: 0, facing: 1, grounded: true }));
    const lead = r.x - 18; // camera centre relative to where the player is
    expect(lead).toBeGreaterThan(1.0); // camera is AHEAD of the player
    expect(lead).toBeLessThanOrEqual(DEFAULT_CAMERA.lookAhead.distance + 0.5);
    // stop: lead eases down to facing bias (0.3 × 3.2 ≈ 1 m)
    const stopped = run(rig, 4, () => ({ x: 18, y: 0, vx: 0, vy: 0, facing: 1, grounded: true }));
    expect(stopped.x - 18).toBeCloseTo(DEFAULT_CAMERA.lookAhead.distance * DEFAULT_CAMERA.lookAhead.facingBias, 1);
  });

  it('turning around does not make the camera whip: peak camera speed stays bounded', () => {
    const rig = new CameraRig({ offset: { x: 0, y: 0 } });
    rig.snapTo(still(0, 0), ASPECT);
    let prev = rig.center.x;
    let peak = 0;
    for (let i = 0; i < 360; i++) {
      const t = i / 60;
      const dir = Math.floor(t / 1.2) % 2 === 0 ? 1 : -1;
      const x = dir === 1 ? (t % 1.2) * 9 : 10.8 - (t % 1.2) * 9;
      rig.update(1 / 60, { x, y: 0, vx: dir * 9, vy: 0, facing: dir as 1 | -1, grounded: true }, ASPECT);
      peak = Math.max(peak, Math.abs(rig.center.x - prev) * 60);
      prev = rig.center.x;
    }
    expect(peak).toBeLessThan(18); // m/s — about 2× the player's run speed at worst
  });
});

describe('CameraRig — vertical policy', () => {
  it('ignores small hops (stays inside the vertical dead zone)', () => {
    const rig = plain({ deadZone: { halfWidth: 2, halfHeight: 2.5 } });
    rig.snapTo(still(0, 0), ASPECT);
    const r = run(rig, 2, (t) => ({ x: 0, y: Math.max(0, Math.sin(t * 6)) * 2, vx: 0, vy: 0, facing: 1, grounded: false }));
    expect(Math.max(...r.ys) - Math.min(...r.ys)).toBeLessThan(1e-6);
  });

  it('pans up when a jump leaves the zone and keeps the player on screen', () => {
    const rig = plain({ deadZone: { halfWidth: 2, halfHeight: 1.5 } });
    rig.snapTo(still(0, 0), ASPECT);
    const r = run(rig, 2, () => ({ x: 0, y: 8, vx: 0, vy: 0, facing: 1, grounded: false }));
    expect(r.y).toBeGreaterThan(5);
    expect(8 - r.y).toBeLessThanOrEqual(1.5 + 1e-3);
  });

  it('re-centres on the ground when the player lands on a higher platform', () => {
    const rig = plain({ deadZone: { halfWidth: 2, halfHeight: 1.5 } });
    rig.snapTo(still(0, 0), ASPECT);
    const r = run(rig, 4, () => still(0, 6));
    expect(r.y).toBeCloseTo(6, 1);
  });

  it('catches up faster when falling than when rising to a ledge', () => {
    const mkRig = () => {
      const rig = plain({ deadZone: { halfWidth: 2, halfHeight: 0.5 } });
      rig.snapTo(still(0, 0), ASPECT);
      return rig;
    };
    const down = mkRig();
    down.snapTo(still(0, 20), ASPECT);
    const fall = run(down, 0.5, () => ({ x: 0, y: 0, vx: 0, vy: -25, facing: 1, grounded: false }));
    const up = mkRig();
    const climb = run(up, 0.5, () => ({ x: 0, y: 20, vx: 0, vy: 0, facing: 1, grounded: true }));
    const fallProgress = (20 - fall.y) / 20;
    const climbProgress = climb.y / 20;
    expect(fallProgress).toBeGreaterThan(climbProgress);
  });
});

describe('CameraRig — bounds', () => {
  const bounds: CameraBounds = { x0: 0, y0: 0, x1: 100, y1: 40 };

  it('never shows outside the room, at any aspect ratio', () => {
    for (const aspect of [4 / 3, 16 / 9, 20 / 9]) {
      const rig = plain({ viewHeight: 16 });
      rig.setBounds(bounds, 0);
      rig.snapTo(still(50, 10), aspect);
      const r = run(rig, 6, (t) => still(-30 + t * 30, -5 + t * 6), 60, aspect);
      void r;
      const halfW = rig.pose.viewHalfWidth;
      const halfH = rig.pose.viewHeight / 2;
      expect(rig.center.x - halfW).toBeGreaterThanOrEqual(bounds.x0 - 1e-6);
      expect(rig.center.x + halfW).toBeLessThanOrEqual(bounds.x1 + 1e-6);
      expect(rig.center.y - halfH).toBeGreaterThanOrEqual(bounds.y0 - 1e-6);
      expect(rig.center.y + halfH).toBeLessThanOrEqual(bounds.y1 + 1e-6);
    }
  });

  it('every intermediate frame stays inside the bounds (no one-frame peeks into the void)', () => {
    const rig = plain({ viewHeight: 16 });
    rig.setBounds(bounds, 0);
    rig.snapTo(still(50, 10), ASPECT);
    const r = run(rig, 5, (t) => still(Math.sin(t * 2) * 80 + 50, 10 + Math.sin(t * 3) * 20));
    const halfW = (16 / 2) * ASPECT;
    for (const x of r.xs) {
      expect(x - halfW).toBeGreaterThanOrEqual(bounds.x0 - 1e-6);
      expect(x + halfW).toBeLessThanOrEqual(bounds.x1 + 1e-6);
    }
  });

  it('centres the view when the room is smaller than the view', () => {
    const rig = plain({ viewHeight: 16 });
    rig.setBounds({ x0: 10, y0: 0, x1: 22, y1: 30 }, 0); // 12 m wide < 28 m view
    rig.snapTo(still(11, 5), ASPECT);
    expect(rig.center.x).toBeCloseTo(16, 6);
  });

  it('does not wind up against a wall: reacts immediately when the target comes back', () => {
    const rig = plain({ viewHeight: 16, deadZone: { halfWidth: 0, halfHeight: 0 } });
    rig.setBounds({ x0: 0, y0: -100, x1: 100, y1: 100 }, 0);
    rig.snapTo(still(10, 0), ASPECT);
    run(rig, 3, () => still(-50, 0)); // pushes against the left wall for 3 s
    const clampedX = rig.center.x;
    const r = run(rig, 1, () => still(40, 0));
    expect(r.xs[10]! - clampedX).toBeGreaterThan(0.5); // already moving 10 frames after the target returned
  });

  it('eases bounds between regions (arena lock) instead of snapping', () => {
    const rig = plain({ viewHeight: 16 });
    rig.setBounds({ x0: 0, y0: -50, x1: 200, y1: 50 }, 0);
    rig.snapTo(still(100, 0), ASPECT);
    // an arena lock tightens the allowed area so the current view (x 85.8…114.2) is no longer legal on the left
    rig.setBounds({ x0: 90, y0: -50, x1: 160, y1: 50 }, 0.6);
    const first = rig.update(1 / 60, still(100, 0), ASPECT).center.x;
    expect(Math.abs(first - 100)).toBeLessThan(0.1); // no jump on the first frame
    const r = run(rig, 4, () => still(100, 0));
    const halfW = (16 / 2) * ASPECT;
    expect(r.x).toBeCloseTo(90 + halfW, 1); // settles on the new legal edge
    const steps = r.xs.slice(1).map((x, i) => Math.abs(x - r.xs[i]!));
    expect(Math.max(...steps)).toBeLessThan(0.25); // gradual (≈ 11 m/s at worst), not a cut
  });

  it('null bounds remove the limit', () => {
    const rig = plain();
    rig.setBounds(bounds, 0);
    rig.setBounds(null);
    rig.snapTo(still(-500, 0), ASPECT);
    expect(rig.center.x).toBeCloseTo(-500, 3);
  });
});

describe('CameraRig — frame-rate independence', () => {
  it('reaches (almost) the same place at 30, 60 and 144 Hz', () => {
    const results = [30, 60, 144].map((hz) => {
      const rig = new CameraRig({ offset: { x: 0, y: 0 } });
      rig.snapTo(still(0, 0), ASPECT);
      return run(rig, 3, (t) => ({ x: t * 9, y: 0, vx: 9, vy: 0, facing: 1, grounded: true }), hz).x;
    });
    expect(Math.abs(results[0]! - results[1]!)).toBeLessThan(0.25);
    expect(Math.abs(results[2]! - results[1]!)).toBeLessThan(0.25);
  });

  it('a huge dt (tab switch) cannot throw the camera: normal motion stays bounded and finite', () => {
    const rig = plain();
    rig.snapTo(still(0, 0), ASPECT);
    const pose = rig.update(30, still(10, 0), ASPECT);
    expect(Number.isFinite(pose.center.x)).toBe(true);
    expect(pose.center.x).toBeGreaterThanOrEqual(0);
    expect(pose.center.x).toBeLessThanOrEqual(10);
  });

  it('a teleporting target (no snapTo) cannot make the camera exceed maxSpeed', () => {
    const rig = plain();
    rig.snapTo(still(0, 0), ASPECT);
    let prev = rig.center.x;
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      rig.update(1 / 60, still(1000, 0), ASPECT);
      peak = Math.max(peak, (rig.center.x - prev) * 60);
      prev = rig.center.x;
    }
    expect(peak).toBeLessThanOrEqual(DEFAULT_CAMERA.maxSpeed.x * 1.05);
    expect(peak).toBeGreaterThan(20); // but it does hurry
  });

  it('dt = 0 is safe (paused frames)', () => {
    const rig = plain();
    rig.snapTo(still(5, 5), ASPECT);
    const before = { ...rig.center };
    rig.update(0, still(50, 50), ASPECT);
    expect(rig.center.x).toBeCloseTo(before.x, 8);
    expect(rig.center.y).toBeCloseTo(before.y, 8);
  });
});

describe('CameraRig — snap, zoom, focus', () => {
  it('snapTo cuts instantly and leaves no residual velocity', () => {
    const rig = plain({ deadZone: { halfWidth: 0, halfHeight: 0 } });
    rig.snapTo(still(0, 0), ASPECT);
    run(rig, 1, () => ({ x: 30, y: 0, vx: 30, vy: 0, facing: 1, grounded: true }));
    rig.snapTo(still(200, 20), ASPECT);
    expect(rig.center.x).toBeCloseTo(200, 3);
    const after = rig.update(1 / 60, still(200, 20), ASPECT);
    expect(Math.abs(after.center.x - 200)).toBeLessThan(0.05);
  });

  it('zoom eases the visible height and bounds are re-applied with the new extents', () => {
    const rig = plain({ viewHeight: 14, zoomSmoothTime: 0.3 });
    rig.setBounds({ x0: 0, y0: 0, x1: 60, y1: 30 }, 0);
    rig.snapTo(still(30, 15), ASPECT);
    rig.setZoom(22);
    run(rig, 3, () => still(30, 15));
    expect(rig.pose.viewHeight).toBeCloseTo(22, 1);
    expect(rig.center.y - rig.pose.viewHeight / 2).toBeGreaterThanOrEqual(-1e-6);
    rig.setZoom(null);
    run(rig, 3, () => still(30, 15));
    expect(rig.pose.viewHeight).toBeCloseTo(14, 1);
  });

  it('focus pulls the view toward a point and releases cleanly', () => {
    const rig = plain();
    rig.snapTo(still(0, 0), ASPECT);
    rig.setFocus({ x: 20, y: 6 }, 1);
    run(rig, 3, () => still(0, 0));
    expect(rig.center.x).toBeGreaterThan(18);
    rig.setFocus(null);
    run(rig, 3, () => still(0, 0));
    expect(rig.center.x).toBeLessThan(2);
  });
});

describe('CameraRig — shake', () => {
  it('trauma saturates at 1, decays to zero, and is deterministic', () => {
    const a = plain();
    const b = plain();
    for (const rig of [a, b]) {
      rig.snapTo(still(), ASPECT);
      rig.addTrauma(0.8);
      rig.addTrauma(0.8);
      expect(rig.currentTrauma).toBe(1);
    }
    const ra = run(a, 0.5, () => still());
    const rb = run(b, 0.5, () => still());
    expect(ra.xs).toEqual(rb.xs);
    run(a, 2, () => still());
    expect(a.currentTrauma).toBe(0);
  });

  it('offset is bounded by maxOffset and fully gone when trauma is 0', () => {
    const rig = plain();
    rig.snapTo(still(), ASPECT);
    rig.addTrauma(1);
    let maxShift = 0;
    for (let i = 0; i < 120; i++) {
      rig.update(1 / 60, still(), ASPECT);
      maxShift = Math.max(maxShift, Math.abs(rig.pose.shake.x), Math.abs(rig.pose.shake.y));
    }
    expect(maxShift).toBeGreaterThan(0.05);
    expect(maxShift).toBeLessThanOrEqual(DEFAULT_CAMERA.shake.maxOffset + 1e-9);
    expect(rig.pose.shake.x).toBeCloseTo(0, 9);
    expect(rig.pose.shake.y).toBeCloseTo(0, 9);
    expect(rig.pose.rollRad).toBeCloseTo(0, 9);
  });

  it('shake never changes the underlying centre (it is purely cosmetic)', () => {
    const calm = plain();
    const shaken = plain();
    calm.snapTo(still(), ASPECT);
    shaken.snapTo(still(), ASPECT);
    shaken.addTrauma(1);
    const a = run(calm, 0.5, () => still(5, 0));
    const b = run(shaken, 0.5, () => still(5, 0));
    expect(b.xs).toEqual(a.xs);
  });
});
