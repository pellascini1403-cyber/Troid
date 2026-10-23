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
  /** `?vfx=procedural` keeps the effects drawing with the game's own shapes even when the art has painted them (to compare, and to see the fallback); anything else (the default) uses the art's. */
  vfx: 'auto' | 'procedural';
  /** `?arrival=<ms>`: the longest the world waits, held at black, for the art of the room it arrives in (default 10 000). For tests that must see the wait give up; a player never needs it. */
  arrivalWait?: number;
  /** `?audio=on|off`: whether the game makes sound. On by default; off by default under `?hooks=1` (a test does not want a sound it cannot hear to depend on a gesture), where `?audio=on` turns it on (docs/PROMPT18-LOG.md). */
  audio: 'on' | 'off';
  /** `?adaptive=1|0`: whether Auto quality measures the frames and steps down when the game cannot keep up (docs/PROMPT20-LOG.md §7). On for a player; off under `?hooks=1` (software drawing is slow by nature and a test must not have its quality change under it) unless `?adaptive=1` asks for it. */
  adaptive: boolean;
  /** `?light=off` takes away the light the energy casts on the world (the hero's, the bolt's, the enemies'): the game as it was before phase I, to compare and to see what it adds; anything else (the default) has it. */
  light: 'auto' | 'off';
  camera: Partial<CameraConfig>;
}

/** `?vh=18`: visible height in metres (handy to compare zoom levels on a real phone). */
export function cameraConfigFromQuery(q: URLSearchParams): Partial<CameraConfig> {
  const cfg: Partial<CameraConfig> = {};
  const vh = q.has('vh') && Number.isFinite(Number(q.get('vh'))) ? Number(q.get('vh')) : undefined;
  if (vh !== undefined) cfg.viewHeight = vh;
  return cfg;
}

/** `?arrival=1500`: a whole number of milliseconds between 100 and 60 000; anything else is ignored. */
export function arrivalWaitFromQuery(q: URLSearchParams): number | undefined {
  const raw = q.get('arrival');
  if (raw === null || !/^\d{3,5}$/.test(raw)) return undefined;
  const ms = Number(raw);
  return ms >= 100 && ms <= 60_000 ? ms : undefined;
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
    vfx: q.get('vfx') === 'procedural' ? 'procedural' : 'auto',
    light: q.get('light') === 'off' ? 'off' : 'auto',
    adaptive: q.get('adaptive') === '1' ? true : q.get('adaptive') === '0' ? false : q.get('hooks') !== '1',
    audio: q.get('audio') === 'on' ? 'on' : q.get('audio') === 'off' || q.get('hooks') === '1' ? 'off' : 'on',
    arrivalWait: arrivalWaitFromQuery(q),
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
