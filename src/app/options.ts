import type { CameraConfig } from '@/camera/CameraRig';

/** Everything that can be chosen from the URL (handy for testing on a real phone without rebuilding). */
export interface GameOptions {
  /** `?room=<id>` start room. */
  room?: string;
  /** `?unlock=dash,magic_attack` abilities owned from the start. */
  unlock: string[];
  /** `?debug=1` makes the debug tools available and opens the panel. */
  debug: boolean;
  /** `?hooks=1` exposes `window.__troid` (always on in dev builds) for E2E tests. */
  hooks: boolean;
  camera: Partial<CameraConfig>;
}

/** `?cam=ortho` `?fov=20` `?vh=18` `?pitch=5` */
export function cameraConfigFromQuery(q: URLSearchParams): Partial<CameraConfig> {
  const cfg: Partial<CameraConfig> = {};
  if (q.get('cam') === 'ortho') cfg.projection = 'orthographic';
  const num = (key: string) => (q.has(key) && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : undefined);
  const fov = num('fov');
  const vh = num('vh');
  const pitch = num('pitch');
  if (fov !== undefined) cfg.fovDeg = fov;
  if (vh !== undefined) cfg.viewHeight = vh;
  if (pitch !== undefined) cfg.pitchDeg = pitch;
  return cfg;
}

export function optionsFromQuery(q: URLSearchParams): GameOptions {
  return {
    room: q.get('room') ?? undefined,
    unlock: (q.get('unlock') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    debug: q.get('debug') === '1',
    hooks: q.get('hooks') === '1',
    camera: cameraConfigFromQuery(q),
  };
}
