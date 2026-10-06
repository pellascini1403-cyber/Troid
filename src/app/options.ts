import type { CameraConfig } from '@/camera/CameraRig';

/** Everything that can be chosen from the URL (handy for testing on a real phone without rebuilding). */
export interface GameOptions {
  /** `?room=<id>` opens a room as a playground: the abilities are then exactly `unlock`. Without it a new game starts at R1. */
  room?: string;
  /** `?unlock=dash,magic_attack` abilities owned from the start (in addition to the starting ones of a new game). */
  unlock: string[];
  /** `?new=1` starts over: the saved progress (if any) is erased instead of continued. Playgrounds (`?room=`) never read or write the progress. */
  newGame: boolean;
  /** `?debug=1` makes the debug tools available and opens the panel. */
  debug: boolean;
  /** `?hooks=1` exposes `window.__troid` (always on in dev builds) for E2E tests. */
  hooks: boolean;
  /** `?paused=1` starts with the simulation stopped: not one tick runs until it is stepped (E2E replays that start from tick 0). */
  paused: boolean;
  /** `?lang=es|en` forces the interface language (default: the device's, English if unsupported). */
  lang?: string;
  /** `?touch=1` shows the touch controls even on a device without a touch screen (tests, desktop preview). They appear by themselves on the first touch. */
  touch: boolean;
  /** `?safe=44,47,21,47` (top, right, bottom, left, px) imitates the safe-area insets of a phone with a notch. */
  safe?: string;
  camera: Partial<CameraConfig>;
}

/** `?vh=18`: visible height in metres (handy to compare zoom levels on a real phone). */
export function cameraConfigFromQuery(q: URLSearchParams): Partial<CameraConfig> {
  const cfg: Partial<CameraConfig> = {};
  const vh = q.has('vh') && Number.isFinite(Number(q.get('vh'))) ? Number(q.get('vh')) : undefined;
  if (vh !== undefined) cfg.viewHeight = vh;
  return cfg;
}

export function optionsFromQuery(q: URLSearchParams): GameOptions {
  return {
    room: q.get('room') ?? undefined,
    unlock: (q.get('unlock') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    newGame: q.get('new') === '1',
    debug: q.get('debug') === '1',
    hooks: q.get('hooks') === '1',
    paused: q.get('paused') === '1',
    lang: q.get('lang') ?? undefined,
    touch: q.get('touch') === '1',
    safe: q.get('safe') ?? undefined,
    camera: cameraConfigFromQuery(q),
  };
}
