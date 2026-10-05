import type { CameraConfig } from './CameraRig';

/**
 * Starting values of the 2D camera (docs/GAME-SPEC-2D.md §16), applied on top of the rig defaults. They are DATA:
 * everything the rig does (dead zone, look-ahead, smoothing, bounds, zoom, shake) stays the F4 maths.
 */
export const CAMERA_2D: Partial<CameraConfig> = {
  viewHeight: 13.5,
  offset: { x: 0, y: 2.3 },
  deadZone: { halfWidth: 1.2, halfHeight: 1.4 },
  lookAhead: { distance: 3.0, velocityScale: 0.34, facingBias: 0.3, smoothTime: 0.45 },
};
