import { clamp, damp, smoothDamp, type SmoothState, type Vec2 } from '@/core/math';

/**
 * Side-scroller camera as pure math. Nothing here knows about the renderer: `update()` returns a `CameraPose`
 * (the centre of the view, its visible size and the shake) and `render/CameraAdapter2D` applies it to the PixiJS
 * world container. That keeps every behaviour testable in node.
 *
 * Mental model: the rig tracks a CENTRE point on the gameplay plane and a visible height `viewHeight` in metres;
 * the visible width follows the aspect ratio. The projection is flat (2D), so nothing else decides how big the
 * player looks or how much of the level is visible.
 */

export interface CameraConfig {
  /** Visible world height, metres. */
  viewHeight: number;
  /** Target position relative to the screen centre in metres: +y puts the player lower on screen. */
  offset: Vec2;
  /** Region around the screen centre where the target can move without moving the camera. */
  deadZone: { halfWidth: number; halfHeight: number };
  smoothTime: { x: number; y: number; /** vertical, while falling */ fall: number };
  /**
   * Hard cap on camera speed (m/s). A dash plus look-ahead stays far below it; it only matters when the target
   * jumps (teleport, debug, bug) so the camera never flies across the level in a single frame.
   */
  maxSpeed: { x: number; y: number };
  lookAhead: {
    /** Max horizontal look-ahead, metres. */
    distance: number;
    /** metres of look-ahead per m/s of horizontal speed */
    velocityScale: number;
    /** Fraction of `distance` kept while standing still, in the facing direction. */
    facingBias: number;
    smoothTime: number;
  };
  zoomSmoothTime: number;
  /** Default time for bounds to ease between rooms / arena locks. */
  boundsSmoothTime: number;
  shake: {
    /** Translation at trauma = 1, metres. */
    maxOffset: number;
    /** Roll at trauma = 1, degrees. */
    maxRollDeg: number;
    /** Noise frequency, Hz. */
    frequency: number;
    /** Trauma lost per second. */
    decay: number;
  };
}

export const DEFAULT_CAMERA: CameraConfig = {
  viewHeight: 15,
  offset: { x: 0, y: 2.6 },
  deadZone: { halfWidth: 1.4, halfHeight: 1.6 },
  smoothTime: { x: 0.2, y: 0.32, fall: 0.14 },
  maxSpeed: { x: 60, y: 45 },
  lookAhead: { distance: 3.2, velocityScale: 0.34, facingBias: 0.3, smoothTime: 0.45 },
  zoomSmoothTime: 0.5,
  boundsSmoothTime: 0.6,
  shake: { maxOffset: 0.45, maxRollDeg: 1.4, frequency: 17, decay: 1.7 },
};

export interface CameraTarget {
  x: number;
  y: number; // feet
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
}

/** World rectangle the VIEW must stay inside. */
export interface CameraBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CameraPose {
  /** Shake roll, radians. */
  rollRad: number;
  /** Current visible height / half width (after zoom). */
  viewHeight: number;
  viewHalfWidth: number;
  /** Centre of the view (before shake). */
  center: Vec2;
  /** Shake displacement in metres, applied on top of `center` by the view. */
  shake: Vec2;
}

const DEG = Math.PI / 180;
const MAX_DT = 0.1;

/** Cheap smooth noise in [-1, 1]; deterministic (no Math.random) so shake is testable. */
function noise(t: number, seed: number): number {
  return (Math.sin(t + seed) + 0.5 * Math.sin(t * 2.3 + seed * 1.7) + 0.25 * Math.sin(t * 4.1 + seed * 2.9)) / 1.75;
}

export class CameraRig {
  readonly config: CameraConfig;
  readonly pose: CameraPose;

  private readonly sx: SmoothState = { value: 0, velocity: 0 };
  private readonly sy: SmoothState = { value: 0, velocity: 0 };
  private anchorY = 0;
  private lookAhead = 0;
  private viewHeight: number;
  private zoomTarget: number | null = null;
  private zoomVelocity: SmoothState;
  private aspect = 16 / 9;

  // bounds (each edge eased independently)
  private bounds: CameraBounds | null = null;
  private boundsGoal: CameraBounds | null = null;
  private readonly bx0: SmoothState = { value: 0, velocity: 0 };
  private readonly bx1: SmoothState = { value: 0, velocity: 0 };
  private readonly by0: SmoothState = { value: 0, velocity: 0 };
  private readonly by1: SmoothState = { value: 0, velocity: 0 };
  private boundsTime = 0;

  // focus override (boss intro, cutscenes)
  private focus: { x: number; y: number } | null = null;
  private focusWeight = 0;
  private focusGoal = 0;

  // shake
  private trauma = 0;
  private shakeClock = 0;

  constructor(config: Partial<CameraConfig> = {}) {
    this.config = { ...DEFAULT_CAMERA, ...config };
    this.viewHeight = this.config.viewHeight;
    this.zoomVelocity = { value: this.viewHeight, velocity: 0 };
    this.pose = {
      rollRad: 0,
      viewHeight: this.viewHeight,
      viewHalfWidth: (this.viewHeight / 2) * this.aspect,
      center: { x: 0, y: 0 },
      shake: { x: 0, y: 0 },
    };
  }

  get center(): Readonly<Vec2> {
    return this.pose.center;
  }
  get currentTrauma(): number {
    return this.trauma;
  }

  /**
   * Sets the area the view must stay inside. Without `smoothTime` the edges blend over
   * `config.boundsSmoothTime`; pass 0 for an instant change (use together with `snapTo`).
   */
  setBounds(bounds: CameraBounds | null, smoothTime = this.config.boundsSmoothTime): void {
    this.boundsGoal = bounds ? { ...bounds } : null;
    this.boundsTime = smoothTime;
    if (!bounds) {
      this.bounds = null;
      return;
    }
    if (!this.bounds || smoothTime <= 0) {
      this.bounds = { ...bounds };
      this.bx0.value = bounds.x0;
      this.bx1.value = bounds.x1;
      this.by0.value = bounds.y0;
      this.by1.value = bounds.y1;
      this.bx0.velocity = this.bx1.velocity = this.by0.velocity = this.by1.velocity = 0;
    }
  }

  /** Overrides the visible height (arena zoom-out, boss intro). `null` returns to `config.viewHeight`. */
  setZoom(viewHeight: number | null): void {
    this.zoomTarget = viewHeight;
  }

  /** Pulls the view toward a world point (0..1 weight is eased). `null` releases it. */
  setFocus(point: { x: number; y: number } | null, weight = 1): void {
    if (point) this.focus = { ...point };
    this.focusGoal = point ? clamp(weight, 0, 1) : 0;
  }

  /** Camera shake. `amount` in 0..1 is added to the current trauma (it saturates at 1). */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /** Hard cut: no smoothing, no velocity. Use after a room change or respawn. */
  snapTo(target: CameraTarget, aspect = this.aspect): CameraPose {
    this.aspect = aspect;
    const cfg = this.config;
    this.viewHeight = this.zoomTarget ?? cfg.viewHeight;
    this.zoomVelocity.value = this.viewHeight;
    this.zoomVelocity.velocity = 0;
    this.lookAhead = target.facing * cfg.lookAhead.distance * cfg.lookAhead.facingBias;
    this.sx.value = target.x + cfg.offset.x + this.lookAhead;
    this.sy.value = target.y + cfg.offset.y;
    this.sx.velocity = this.sy.velocity = 0;
    this.anchorY = this.sy.value;
    this.focusWeight = this.focusGoal;
    if (this.boundsGoal) this.setBounds(this.boundsGoal, 0);
    this.compose(0);
    // Re-seat the smoothing state on the clamped result so the next update starts from rest.
    this.sx.value = this.pose.center.x;
    this.sy.value = this.pose.center.y;
    this.anchorY = this.sy.value;
    return this.pose;
  }

  update(dtRaw: number, target: CameraTarget, aspect: number): CameraPose {
    const dt = clamp(dtRaw, 0, MAX_DT);
    this.aspect = aspect;
    const cfg = this.config;

    // ---- bounds easing ----
    if (this.bounds && this.boundsGoal && dt > 0) {
      const g = this.boundsGoal;
      const t = this.boundsTime;
      if (t <= 0) {
        this.bounds = { ...g };
      } else {
        this.bounds.x0 = smoothDamp(this.bx0, g.x0, t, dt);
        this.bounds.x1 = smoothDamp(this.bx1, g.x1, t, dt);
        this.bounds.y0 = smoothDamp(this.by0, g.y0, t, dt);
        this.bounds.y1 = smoothDamp(this.by1, g.y1, t, dt);
      }
    }

    // ---- zoom ----
    const goalView = this.zoomTarget ?? cfg.viewHeight;
    this.viewHeight = smoothDamp(this.zoomVelocity, goalView, cfg.zoomSmoothTime, dt);

    // ---- look-ahead (eased; direction from velocity, with a small bias toward facing when still) ----
    const la = cfg.lookAhead;
    const moving = clamp(target.vx * la.velocityScale, -la.distance, la.distance);
    const biased = Math.abs(target.vx) < 0.4 ? target.facing * la.distance * la.facingBias : moving;
    this.lookAhead = damp(this.lookAhead, biased, 1 / Math.max(0.001, la.smoothTime), dt);

    // ---- horizontal: dead zone, then spring ----
    const focusX = target.x + cfg.offset.x + this.lookAhead;
    const dx = focusX - this.sx.value;
    const hw = cfg.deadZone.halfWidth;
    let desiredX = this.sx.value;
    if (dx > hw) desiredX = focusX - hw;
    else if (dx < -hw) desiredX = focusX + hw;

    // ---- vertical: follow the GROUND, not every jump ----
    const wantY = target.y + cfg.offset.y;
    const hh = cfg.deadZone.halfHeight;
    if (target.grounded) {
      this.anchorY = wantY;
    } else if (wantY > this.sy.value + hh) {
      this.anchorY = wantY - hh; // rising above the zone: pan up just enough to keep the player in view
    } else if (wantY < this.sy.value - hh) {
      this.anchorY = wantY + hh; // falling below the zone: pan down
    }
    const falling = !target.grounded && target.vy < -1;
    const timeY = falling ? cfg.smoothTime.fall : cfg.smoothTime.y;

    // Clamp the goals first so the springs never wind up against a wall.
    const half = this.halfExtents();
    desiredX = this.clampAxis(desiredX, half.w, this.bounds?.x0, this.bounds?.x1);
    const desiredY = this.clampAxis(this.anchorY, half.h, this.bounds?.y0, this.bounds?.y1);

    smoothDamp(this.sx, desiredX, cfg.smoothTime.x, dt, cfg.maxSpeed.x);
    smoothDamp(this.sy, desiredY, timeY, dt, cfg.maxSpeed.y);

    // ---- focus override ----
    this.focusWeight = damp(this.focusWeight, this.focusGoal, 3.5, dt);

    // ---- shake ----
    this.trauma = Math.max(0, this.trauma - cfg.shake.decay * dt);
    this.shakeClock += dt;

    this.compose(dt);
    return this.pose;
  }

  // ------------------------------------------------------------------------------------------------ internals

  private halfExtents(): { w: number; h: number } {
    const h = this.viewHeight / 2;
    return { w: h * this.aspect, h };
  }

  /** Keeps a view of half-size `half` inside [lo, hi]; if the room is smaller than the view it is centred. */
  private clampAxis(value: number, half: number, lo: number | undefined, hi: number | undefined): number {
    if (lo === undefined || hi === undefined) return value;
    if (hi - lo <= 2 * half) return (lo + hi) / 2;
    return clamp(value, lo + half, hi - half);
  }

  /** Turns the smoothed centre into the final pose (clamps, focus, shake). */
  private compose(_dt: number): void {
    const cfg = this.config;
    const half = this.halfExtents();
    let cx = this.sx.value;
    let cy = this.sy.value;
    if (this.focus && this.focusWeight > 0.001) {
      cx += (this.focus.x - cx) * this.focusWeight;
      cy += (this.focus.y - cy) * this.focusWeight;
    }
    // Final hard clamp: nothing (zoom change, focus, bounds easing) may reveal the void.
    cx = this.clampAxis(cx, half.w, this.bounds?.x0, this.bounds?.x1);
    cy = this.clampAxis(cy, half.h, this.bounds?.y0, this.bounds?.y1);

    const t = this.trauma * this.trauma;
    const f = this.shakeClock * cfg.shake.frequency * Math.PI * 2;
    const shakeX = t * cfg.shake.maxOffset * noise(f, 1.3);
    const shakeY = t * cfg.shake.maxOffset * noise(f, 7.7);
    const roll = t * cfg.shake.maxRollDeg * DEG * noise(f, 13.1);

    const p = this.pose;
    p.viewHeight = this.viewHeight;
    p.viewHalfWidth = half.w;
    p.center.x = cx;
    p.center.y = cy;
    p.shake.x = shakeX;
    p.shake.y = shakeY;
    p.rollRad = roll;
  }
}
