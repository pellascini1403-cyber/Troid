import { log } from '@/core/log';
import type { ClipDefinition, SpriteSetDefinition } from './SpriteSetDefinition';
import { frameName } from './SpriteSetDefinition';
import { ANIM_FALLBACKS, ONE_SHOT_STATES, type AnimPhase, type AnimState } from './vocabulary';

/**
 * Animation as PURE logic (docs/ARCHITECTURE-2D.md §7.5): which clip a logical state plays, which frame a moment in
 * time or a phase of an action shows. No Pixi, no DOM, no clocks: the same inputs always give the same frame, so it
 * is tested in Node and the simulation (which owns the phases) stays the single source of timing truth.
 */

const DEFAULT_FPS = 12;
const EPS = 1e-6;

export interface ResolvedClip {
  /** The state whose clip actually plays (may differ from the requested one after a fallback). */
  state: AnimState;
  clip: ClipDefinition;
  /** Natural duration in seconds at 1× speed. */
  length: number;
  loops: boolean;
}

export function clipLength(clip: ClipDefinition): number {
  return clip.count / (clip.fps ?? DEFAULT_FPS);
}

/** The clip a logical state plays, following the fallback chain; `null` only if the set has no `idle` at all. */
export function resolveClip(def: Pick<SpriteSetDefinition, 'clips'>, state: AnimState): ResolvedClip | null {
  for (const s of [state, ...ANIM_FALLBACKS[state], 'idle' as const]) {
    const clip = def.clips[s];
    if (clip && clip.count > 0) {
      return { state: s, clip, length: clipLength(clip), loops: clip.loop ?? !ONE_SHOT_STATES.has(s) };
    }
  }
  return null;
}

/** Frame index at `time` seconds into the clip: loops wrap, one-shots hold their last frame. */
export function frameForTime(clip: ClipDefinition, time: number, loops: boolean): number {
  const fps = clip.fps ?? DEFAULT_FPS;
  const raw = Math.floor(Math.max(0, time) * fps + EPS);
  return loops ? raw % clip.count : Math.min(raw, clip.count - 1);
}

/** Frame index for `phase` at progress `t` (0..1) inside it. Clips without `phases` return -1 (use time instead). */
export function frameForPhase(clip: ClipDefinition, phase: AnimPhase, t: number): number {
  if (!clip.phases || phase === 'none') return -1;
  const [lo, hi] = clip.phases[phase];
  const span = hi - lo + 1;
  const k = Math.min(span - 1, Math.max(0, Math.floor(Math.min(1, Math.max(0, t)) * span)));
  return lo + k;
}

export interface PlayOptions {
  /** Playback speed multiplier on top of the clip's own rate (time-driven clips). */
  speed?: number;
  /** Time-fit the clip so that it lasts this many seconds (ignores `speed`). */
  duration?: number;
  /** Restart even if the state is already playing. */
  restart?: boolean;
  /** Phase of the simulated action; with `phaseT` it selects the frame of clips that declare `phases`. */
  phase?: AnimPhase;
  phaseT?: number;
}

/**
 * Plays LOGICAL states on one sprite set. Gameplay never sees frame names. If the set lacks the clip for a state the
 * fallback chain is used and, as the last resort, `idle`: a set with a single clip still animates and never throws.
 *
 * There is no cross-fade in 2D: a state change is a cut to the first frame (or, for phase-driven clips, to the frame
 * of the current phase), which is what keeps the visible action aligned with the simulation.
 */
export class SpriteAnimator {
  private _requested: AnimState | null = null;
  private current: ResolvedClip | null = null;
  private time = 0;
  private speed = 1;
  private fit = 0;
  private phase: AnimPhase = 'none';
  private phaseT = 0;
  private frame = 0;
  private readonly warn = log.scope('anim');

  constructor(private readonly def: SpriteSetDefinition) {
    this.play('idle', { restart: true });
  }

  /** The state that was asked for (what the simulation wants). */
  get requested(): AnimState | null {
    return this._requested;
  }
  /** The state whose clip is actually playing (may differ after fallback). */
  get state(): AnimState | null {
    return this.current?.state ?? null;
  }
  get frameIndex(): number {
    return this.frame;
  }
  /** Name of the frame to show, or `null` when the set has no clips. */
  get frameName(): string | null {
    const c = this.current?.clip;
    return c ? frameName(c.frames, this.frame) : null;
  }
  /** True once a one-shot clip has reached its end (loops never finish). */
  get finished(): boolean {
    const c = this.current;
    if (!c) return true;
    if (c.loops) return false;
    if (this.drivenByPhase(c.clip)) return this.phase === 'recovery' && this.phaseT >= 1 - EPS;
    return this.time >= c.length - EPS;
  }
  /** Normalised progress 0..1 through the clip (lab / debugging). */
  get progress(): number {
    const c = this.current;
    if (!c) return 0;
    if (this.drivenByPhase(c.clip)) return c.clip.count > 1 ? this.frame / (c.clip.count - 1) : 1;
    if (c.length <= 0) return 0;
    return c.loops ? (this.time % c.length) / c.length : Math.min(1, this.time / c.length);
  }

  has(state: AnimState): boolean {
    return resolveClip(this.def, state) !== null;
  }

  play(state: AnimState, options: PlayOptions = {}): void {
    this._requested = state;
    const target = resolveClip(this.def, state);
    if (!target) return;
    if (target.state !== state) {
      this.warn.warnOnce(`${this.def.id}:${state}`, `[${this.def.id}] no clip for "${state}": using "${target.state}"`);
    }
    const same = this.current !== null && this.current.state === target.state;
    if (!same || options.restart) {
      this.current = target;
      this.time = 0;
    }
    this.phase = options.phase ?? 'none';
    this.phaseT = options.phaseT ?? 0;
    this.fit = options.duration && options.duration > 0 ? options.duration : 0;
    this.speed = this.fit > 0 && target.length > 0 ? target.length / this.fit : (options.speed ?? 1);
    this.refresh();
  }

  update(dt: number): void {
    const c = this.current;
    if (!c) return;
    if (!this.drivenByPhase(c.clip)) this.time += dt * this.speed;
    this.refresh();
  }

  private drivenByPhase(clip: ClipDefinition): boolean {
    return clip.phases !== undefined && this.phase !== 'none';
  }

  private refresh(): void {
    const c = this.current;
    if (!c) return;
    this.frame = this.drivenByPhase(c.clip)
      ? frameForPhase(c.clip, this.phase, this.phaseT)
      : frameForTime(c.clip, this.time, c.loops);
  }
}
