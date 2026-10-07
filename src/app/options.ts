import type { CameraConfig } from '@/camera/CameraRig';
import { VISUAL_MODES, type VisualMode } from '@/presentation/visualSource';

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
  /** `?art=<folder>` reads the art from `<folder>/index.json` (a folder next to the page) instead of the one the build found. */
  art?: string;
  /** `?visual=auto|placeholder|art`: which look draws the protagonist (docs/ART-PIPELINE-2D.md part D). `auto` by default: the real art where it has it, the placeholder where not. */
  visual: VisualMode;
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
    art: q.get('art') ?? undefined,
    visual: (VISUAL_MODES as readonly string[]).includes(q.get('visual') ?? '') ? (q.get('visual') as VisualMode) : 'auto',
    camera: cameraConfigFromQuery(q),
  };
}

/** A folder name as a person writes it in a URL: segments of letters, digits, `.`, `_` and `-` — never `..`, a scheme or another site. */
const ART_FOLDER = /^(?!.*\.\.)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/?$/;

/**
 * Where the art index is (docs/ART-PIPELINE-2D.md, part C): the `?art=<folder>` of the URL, else the one the build found in `public/art` (`built`, empty when
 * it found none), else NOWHERE — `null`, and a page that has no art never loads the art code, asks for no file and can fail on none. `base` is the page's URL.
 */
export function artIndexUrl(param: string | undefined, built: string, base: string): string | null {
  if (param !== undefined) {
    if (!ART_FOLDER.test(param)) return null;
    return new URL(`${param.replace(/\/$/, '')}/index.json`, base).href;
  }
  return built === '' ? null : new URL(built, base).href;
}
