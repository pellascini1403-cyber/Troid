import type { AnchorId, AnimState } from './vocabulary';

/** Inclusive frame-index ranges of an action's phases inside its clip. */
export interface ClipPhases {
  startup: readonly [number, number];
  active: readonly [number, number];
  recovery: readonly [number, number];
}

export interface ClipDefinition {
  /** Frame-name prefix: the frames are `<prefix><index padded to 2 digits>` (`idle_00`, `idle_01`…). */
  frames: string;
  /** Number of frames. */
  count: number;
  /** Playback rate when the clip runs on time (default 12). */
  fps?: number;
  /** Overrides the default (one-shot vs loop) of the state. */
  loop?: boolean;
  /**
   * For clips driven by the simulation (attacks, casts…): which frames belong to which phase. The frame shown is
   * chosen from the simulation's `phase`/`phaseT`, so the visible blow always matches the hitbox.
   */
  phases?: ClipPhases;
}

/** A point in metres relative to the feet centre: `[x forward, y up]`. */
export type AnchorPoint = readonly [x: number, y: number];

/**
 * Everything the engine needs to know about ONE actor's sprites. It is the only place that knows frame names and
 * atlas ids: replacing the placeholder with final art = pointing a definition at a new atlas (and fixing the names
 * if the artist used different ones). Gameplay is untouched. (docs/ARCHITECTURE-2D.md §7.5)
 */
export interface SpriteSetDefinition {
  id: string;
  /** Atlas id (path without extension for real art; a generator key for the placeholder). */
  atlas: string;
  /** Art pixels per metre: the sprite is scaled by `1 / artPxPerMeter` so it is measured in metres. */
  artPxPerMeter: number;
  /**
   * Visual size multiplier about the feet (default 1): art direction — the same art drawn bigger or smaller on screen. It is the one knob that
   * makes a sprite look larger than the body it stands for WITHOUT touching collision, speed or any hitbox (those never read the sprite).
   */
  visualScale?: number;
  /** Feet-centre pivot, normalised to the (untrimmed) frame: `[0.5, 1]` = bottom centre. */
  pivot: readonly [number, number];
  /** Standing height in metres (validation and fallback anchors). */
  height: number;
  clips: Partial<Record<AnimState, ClipDefinition>>;
  /** Fixed anchors, used when a frame carries no data of its own. */
  anchors?: Partial<Record<AnchorId, AnchorPoint>>;
  /** Marks a provisional set: the validator reports what the final art still has to provide. */
  placeholder?: boolean;
}

/** Per-frame data that travels with the atlas (exported by the artist's tool next to the image). */
export interface FrameMeta {
  /** Character height in art pixels in this frame (feet to top of the head, no weapon): scale validation. */
  heightPx?: number;
  /** Per-frame anchors: the sword moves with the animation, so do `hand_r`, `weapon_grip` and `weapon_tip`. */
  anchors?: Partial<Record<AnchorId, AnchorPoint>>;
}

export interface AtlasMeta {
  frames: Readonly<Record<string, FrameMeta>>;
}

export function frameName(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(2, '0')}`;
}

export function clipFrameNames(clip: ClipDefinition): string[] {
  return Array.from({ length: clip.count }, (_, i) => frameName(clip.frames, i));
}
