import { CAMERA_2D } from '@/camera/camera2d';
import { CameraRig, type CameraBounds, type CameraConfig, type CameraTarget } from '@/camera/CameraRig';
import { roomLimits, type CameraView } from '@/camera/cameraZones';
import type { CameraCentre, CameraShake } from '@/presentation/worldTransform';
import type { RoomDefinition } from '@/world/RoomDefinition';

/** What the camera needs from the renderer: the game-area aspect and a way to place the world. */
export interface CameraSink {
  readonly viewport: { readonly contentAspect: number };
  applyCamera(centre: CameraCentre, shake: CameraShake, viewHeight: number): void;
}

/**
 * The 2D camera (docs/ARCHITECTURE-2D.md §13): the F4 `CameraRig` maths (follow, dead zone, look-ahead, ground-based
 * vertical policy, bounds, zoom, shake) driving the world container through the renderer. It knows nothing about
 * Pixi (so it is tested in Node) and nothing about 3D: the rig is only asked for a centre, a visible height and a
 * shake offset, and the simulation keeps working in world coordinates.
 *
 * The rig is given the aspect of the GAME AREA (4:3 – 21:9 after the viewport clamp), so a room can never reveal
 * more than the width it was designed for.
 */
export class CameraAdapter2D {
  readonly rig: CameraRig;
  private snapPending = true;
  /** The zone the limits were last set for (`null`: the room's own). */
  private zone: string | null = null;
  private readonly shake: CameraShake = { x: 0, y: 0, rollRad: 0 };

  constructor(
    private readonly sink: CameraSink,
    config: Partial<CameraConfig> = {},
  ) {
    this.rig = new CameraRig({ ...CAMERA_2D, ...config });
  }

  get centre(): Readonly<CameraCentre> {
    return this.rig.center;
  }

  /** The id of the camera zone that holds the view now (`null`: the room's own limits). */
  get activeZone(): string | null {
    return this.zone;
  }

  /** Room change / respawn: hard-set the room's own limits and cut (no travel across the level). */
  setRoom(room: RoomDefinition): void {
    this.rig.setBounds(roomLimits(room), 0);
    this.rig.setZoom(null);
    this.zone = null;
    this.snapPending = true;
  }

  /**
   * The limits and the visible height that apply now (`resolveCameraView`): call it every frame, it only does something when the zone
   * CHANGED — entering an arena holds the view to it, leaving it (or the flag that shuts it) lets the view go — and both ease over the
   * zone's `smoothTime` (the rig's default when it has none). A cut (`snap`) pending at that moment takes them at once.
   */
  setView(view: Readonly<CameraView>): void {
    if (view.zone === this.zone) return;
    this.zone = view.zone;
    this.rig.setBounds(view.bounds, view.smoothTime);
    this.rig.setZoom(view.viewHeight);
  }

  /** Arena lock / release: the bounds ease over `seconds` (the view never jumps). */
  lockBounds(bounds: CameraBounds | null, seconds?: number): void {
    this.rig.setBounds(bounds, seconds);
  }

  /** Cut to the target on the next update (teleport, debug). */
  snap(): void {
    this.snapPending = true;
  }

  /** Visible-height override (boss arenas); `null` returns to the configured height. */
  setZoom(viewHeight: number | null): void {
    this.rig.setZoom(viewHeight);
  }

  addTrauma(amount: number): void {
    this.rig.addTrauma(amount);
  }

  /** Once per rendered frame, with the INTERPOLATED target (exactly what is drawn). */
  update(realDt: number, target: CameraTarget): void {
    const aspect = this.sink.viewport.contentAspect;
    if (this.snapPending) {
      this.rig.snapTo(target, aspect);
      this.snapPending = false;
    }
    const pose = this.rig.update(realDt, target, aspect);
    this.shake.x = pose.shake.x;
    this.shake.y = pose.shake.y;
    this.shake.rollRad = pose.rollRad;
    this.sink.applyCamera(pose.center, this.shake, pose.viewHeight);
  }
}
