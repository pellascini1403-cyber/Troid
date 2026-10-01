import * as THREE from 'three';
import { clipSpec, type ClipSpec, type ModelDefinition } from '@/models/ModelDefinition';
import {
  ANIM_FALLBACKS, DEFAULT_FADE, ONE_SHOT_STATES, type AnimState,
} from '@/models/vocabulary';
import { log } from '@/core/log';

export interface PlayOptions {
  /** Playback speed multiplier on top of the clip's own `speed`. */
  speed?: number;
  /** Time-fit the clip so that it lasts this many seconds (ignores `speed`). */
  duration?: number;
  /** Restart even if the state is already playing. */
  restart?: boolean;
  /** Cross-fade seconds. `0` switches instantly (respawns, teleports, contact sheets). */
  fade?: number;
}

interface Resolved {
  action: THREE.AnimationAction;
  spec: ClipSpec;
  length: number;
  loops: boolean;
}

/**
 * Maps LOGICAL animation states ('run', 'attack'…) onto the clips of one model.
 *
 * Gameplay never sees clip names. If a model lacks the clip for a state, the fallback chain from
 * `ANIM_FALLBACKS` is used and, as the last resort, `idle`. A model with a single clip therefore still
 * animates and never throws.
 */
export class AnimationController {
  private readonly resolved = new Map<AnimState, Resolved | null>();
  private currentAction: THREE.AnimationAction | null = null;
  private _state: AnimState | null = null;
  private _requested: AnimState | null = null;
  private readonly warn = log.scope('anim');

  constructor(
    private readonly mixer: THREE.AnimationMixer,
    private readonly clips: ReadonlyMap<string, THREE.AnimationClip>,
    private readonly def: Pick<ModelDefinition, 'id' | 'clips'>,
  ) {}

  /** The state that was asked for (what the simulation wants). */
  get requested(): AnimState | null {
    return this._requested;
  }
  /** The state whose clip is actually playing (may differ after fallback). */
  get state(): AnimState | null {
    return this._state;
  }

  /** True once a one-shot clip has reached its end (loops never finish). */
  get finished(): boolean {
    const a = this.currentAction;
    if (!a) return true;
    return a.loop === THREE.LoopOnce && a.time >= a.getClip().duration - 1e-4;
  }

  /** Normalised progress 0..1 of the current clip (for lab / debugging). */
  get progress(): number {
    const a = this.currentAction;
    if (!a) return 0;
    const d = a.getClip().duration;
    return d > 0 ? (a.time % (d + 1e-9)) / d : 0;
  }

  has(state: AnimState): boolean {
    return this.resolveState(state) !== null;
  }

  play(state: AnimState, options: PlayOptions = {}): void {
    this._requested = state;
    const target = this.resolveState(state);
    if (!target) return;
    const effective = this.effectiveState(state);
    const same = this.currentAction === target.action;
    if (same && !options.restart) {
      this.applySpeed(target, options);
      return;
    }

    const prev = this.currentAction;
    const next = target.action;
    // Blend only between two DIFFERENT clips. A first play or a restart of the same clip starts instantly at
    // full weight — fading a clip in from weight 0 would flash the bind pose (T-pose) for the fade duration.
    const blend =
      prev && prev !== next ? (options.fade ?? target.spec.fade ?? DEFAULT_FADE[effective] ?? 0.08) : 0;
    next.enabled = true;
    next.reset();
    next.setLoop(target.loops ? THREE.LoopRepeat : THREE.LoopOnce, target.loops ? Infinity : 1);
    next.clampWhenFinished = !target.loops;
    next.setEffectiveWeight(1);
    this.applySpeed(target, options);
    if (blend > 0 && prev) next.crossFadeFrom(prev, blend, false);
    else if (prev && prev !== next) prev.stop();
    next.play();
    this.currentAction = next;
    this._state = effective;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** Jumps the current clip to a normalised time and evaluates it (contact sheets, tests). */
  seek(normalized: number): void {
    const a = this.currentAction;
    if (!a) return;
    a.paused = false;
    a.time = normalized * a.getClip().duration;
    this.mixer.update(0);
  }

  private applySpeed(target: Resolved, options: PlayOptions): void {
    const base = target.spec.speed ?? 1;
    if (options.duration && options.duration > 0) {
      target.action.setEffectiveTimeScale(target.length / options.duration);
    } else {
      target.action.setEffectiveTimeScale(base * (options.speed ?? 1));
    }
  }

  /** The state whose clip will really play for `state` (after fallbacks). */
  private effectiveState(state: AnimState): AnimState {
    for (const candidate of [state, ...ANIM_FALLBACKS[state]]) {
      if (this.resolveExact(candidate)) return candidate;
    }
    return state;
  }

  private resolveState(state: AnimState): Resolved | null {
    for (const candidate of [state, ...ANIM_FALLBACKS[state]]) {
      const r = this.resolveExact(candidate);
      if (r) {
        if (candidate !== state) {
          this.warn.warnOnce(`${this.def.id}:${state}`, `model "${this.def.id}" has no clip for "${state}"; using "${candidate}"`);
        }
        return r;
      }
    }
    this.warn.warnOnce(`${this.def.id}:${state}:none`, `model "${this.def.id}" has no usable clip for "${state}"`);
    return null;
  }

  private resolveExact(state: AnimState): Resolved | null {
    if (this.resolved.has(state)) return this.resolved.get(state) ?? null;
    const raw = this.def.clips[state];
    let entry: Resolved | null = null;
    if (raw !== undefined) {
      const spec = clipSpec(raw);
      const clip = this.clips.get(spec.clip);
      if (clip) {
        const action = this.mixer.clipAction(clip);
        entry = { action, spec, length: clip.duration, loops: spec.loop ?? !ONE_SHOT_STATES.has(state) };
      } else {
        this.warn.warnOnce(`${this.def.id}:clip:${spec.clip}`, `model "${this.def.id}": clip "${spec.clip}" (for "${state}") not found in the file`);
      }
    }
    this.resolved.set(state, entry);
    return entry;
  }
}
