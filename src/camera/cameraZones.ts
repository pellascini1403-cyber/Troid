import type { RoomDefinition } from '@/world/RoomDefinition';
import type { CameraBounds } from './CameraRig';

/**
 * Which limits the camera must keep to right now (docs/PROMPT6-LOG.md S26): a PURE function of the room, the world flags and where the
 * hero stands. The room's own limits (`camera.bounds`, the room's extents when it declares none) hold everywhere except inside a
 * zone — the first one, in the order the room lists them, whose rectangle holds the hero's feet and whose flags allow it — and then
 * the zone's limits (and visible height) replace them. The adapter eases to whatever this says; it decides nothing itself.
 */
export interface CameraView {
  /** The limits the view must stay inside. Always the SAME object for the same room or zone, so a change is `!==`. */
  bounds: Readonly<CameraBounds>;
  /** Visible height in metres, or `null` for the default one. */
  viewHeight: number | null;
  /** Seconds to ease to these limits, or `undefined` for the rig's own default. */
  smoothTime: number | undefined;
  /** The id of the zone that applies, or `null` when none does. */
  zone: string | null;
}

export interface FlagReader {
  has(flag: string): boolean;
}

/** The limits of a room when no zone applies. */
export function roomLimits(room: Pick<RoomDefinition, 'bounds' | 'camera'>): Readonly<CameraBounds> {
  return room.camera?.bounds ?? room.bounds;
}

/** Writes into `out` (reused: no allocation per frame) and returns it. */
export function resolveCameraView(room: Pick<RoomDefinition, 'bounds' | 'camera'>, flags: FlagReader, x: number, y: number, out: CameraView = { bounds: room.bounds, viewHeight: null, smoothTime: undefined, zone: null }): CameraView {
  for (const z of room.camera?.zones ?? []) {
    const r = z.rect;
    if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
    if (z.whenSet !== undefined && !flags.has(z.whenSet)) continue;
    if (z.whenClear !== undefined && flags.has(z.whenClear)) continue;
    out.bounds = z.bounds;
    out.viewHeight = z.viewHeight ?? null;
    out.smoothTime = z.smoothTime;
    out.zone = z.id;
    return out;
  }
  out.bounds = roomLimits(room);
  out.viewHeight = null;
  out.smoothTime = undefined;
  out.zone = null;
  return out;
}
