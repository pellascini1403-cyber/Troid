import type { AnimState, SocketId } from './vocabulary';

export interface ClipSpec {
  /** Name of the clip inside the glTF. */
  clip: string;
  /** Overrides the default (one-shot vs loop) for this state. */
  loop?: boolean;
  /** Playback speed multiplier for this clip (before gameplay-driven speed). */
  speed?: number;
  /** Cross-fade seconds when entering this clip. */
  fade?: number;
}

export interface OutlineSpec {
  /** World-space thickness in metres. */
  thickness: number;
  color: number;
}

export interface RimSpec {
  color: number;
  /** 0 disables the rim light. */
  strength: number;
  /** Higher = thinner rim. */
  power: number;
}

/**
 * Everything the engine needs to know about a 3D model. This is the *only* place that knows file
 * paths, clip names and node names. Replacing a placeholder with final art = pointing a definition at a new
 * `.glb` (and fixing the names below if the artist used different ones). Gameplay is untouched.
 */
export interface ModelDefinition {
  id: string;
  /** Path relative to the app base URL, e.g. `assets/models/mannequin.glb`. */
  url: string;
  /** Uniform scale applied to the loaded scene so that the model is `height` metres tall in the game. */
  scale: number;
  /** Degrees to rotate the model so its rest-pose forward axis becomes +Z (our convention). */
  yawOffsetDeg: number;
  /** Nominal height in metres (feet at y = 0). Used by validation and debug overlays. */
  height: number;
  /** Logical animation state → clip. A bare string is shorthand for `{ clip }`. */
  clips: Partial<Record<AnimState, string | ClipSpec>>;
  /** Logical socket → node name in the glTF. */
  sockets: Partial<Record<SocketId, string>>;
  look: {
    /**
     * `toon`: replace materials with the game's toon material, keeping base colour / map from the asset.
     * `keep`: use the asset's own materials untouched (for fully authored final art).
     */
    style: 'toon' | 'keep';
    outline?: OutlineSpec;
    rim?: RimSpec;
    /** Minimum lit fraction of the albedo even in shadow (default 0.5 for characters). */
    lightFloor?: number;
    /** Forces every material to this colour (white mannequin, flat-colour placeholders). */
    baseColor?: number;
  };
}

export function clipSpec(value: string | ClipSpec): ClipSpec {
  return typeof value === 'string' ? { clip: value } : value;
}
