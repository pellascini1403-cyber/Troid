import { Reader, type ArtIssue, type Parsed } from './artManifest';

/**
 * THE DRESSING OF A ROOM (docs/ART-PIPELINE-2D.md, part M): where the pieces of art that are NOT the room's data go — a ruined arch behind the action, a column
 * in the haze, a clump of ferns on a ledge, the shaft of light over a way out. A scene is DATA, one file per room per pack (`pack.scenes[roomId]`), written by whoever
 * dresses the room (a person, or the generator in `tools/art`) and read by the view; it holds no collision and no gameplay, so any scene — more, less, none, a wrong
 * one — leaves what the hero walks on, hits and falls through exactly where the room's data put it.
 *
 * What a room's DATA already says (its solids, doors, hazards and exits) is drawn from that data by `roomPlan.ts` and is never repeated here.
 *
 * Coordinates are metres in the LAYER's own space (+y up): a layer with a parallax factor f scrolls at f × the camera, so a piece far behind is placed where it is
 * seen from the middle of the room's camera range, not where it "is" in the world. PURE: nothing here knows Pixi or a file.
 */
export const SCENE_VERSION = 1;

/** The layers a scene may place pieces in, back to front (`ENV_LAYERS` in `environment.ts`: the scene graph). */
export const SCENE_LAYERS = ['backdropFar', 'backdropMid', 'backdropNear', 'propsBack', 'terrain', 'foreground', 'lightOverlay'] as const;
export type SceneLayer = (typeof SCENE_LAYERS)[number];

/** A cosmetic motion a piece may have. It is drawn, never simulated: it changes nothing a rule reads. */
export const SCENE_MOTIONS = ['sway', 'pulse', 'drift'] as const;
export type SceneMotion = (typeof SCENE_MOTIONS)[number];

export interface Placement {
  /** A sprite set of the SAME pack (its `idle` clip is the picture; its pivot is the point placed at x, y). */
  sprite: string;
  x: number;
  y: number;
  /** A multiplier of the piece's size (default 1). */
  scale?: number;
  /** Fit a SOFT piece (a gradient, a glow) to this size in metres instead of drawing it at its own: both or neither. Never for a piece with detail: that is scaled by `scale`. */
  w?: number;
  h?: number;
  flip?: boolean;
  alpha?: number;
  /** A colour that multiplies the piece (`0xRRGGBB`), to tell two copies of one piece apart. */
  tint?: number;
  /** Which frame of the `idle` clip (default 0): a piece may come in variants. */
  frame?: number;
  motion?: SceneMotion;
}

export interface RoomScene {
  sceneVersion: typeof SCENE_VERSION;
  room: string;
  layers: Partial<Record<SceneLayer, Placement[]>>;
}

const LAYER_SET: ReadonlySet<string> = new Set(SCENE_LAYERS);
const MOTION_SET: ReadonlySet<string> = new Set(SCENE_MOTIONS);
const PLACEMENT_KEYS = ['sprite', 'x', 'y', 'scale', 'w', 'h', 'flip', 'alpha', 'tint', 'frame', 'motion'] as const;
/** No room is wider than this; a coordinate beyond it is a typo (or pixels). */
export const SCENE_REACH = 400;

/** Reads and checks a scene file. Never throws; `value` is `null` when anything is an error. */
export function parseRoomScene(raw: unknown): Parsed<RoomScene> {
  const r = new Reader();
  const o = r.object(raw, '');
  if (!o) return { value: null, issues: r.issues };
  r.known(o, '', ['sceneVersion', 'room', 'layers']);
  if (o['sceneVersion'] !== SCENE_VERSION) {
    r.error('sceneVersion', typeof o['sceneVersion'] === 'number' && o['sceneVersion'] > SCENE_VERSION ? `version ${o['sceneVersion']} belongs to a newer game (this one reads ${SCENE_VERSION})` : `must be ${SCENE_VERSION}`);
    return { value: null, issues: r.issues };
  }
  const room = r.string(o['room'], 'room', { pattern: /^[a-z0-9][a-z0-9_.:-]{0,63}$/, what: 'a room id' });
  const layers: Partial<Record<SceneLayer, Placement[]>> = {};
  const lo = r.object(o['layers'], 'layers');
  for (const [layer, list] of Object.entries(lo ?? {})) {
    const path = `layers.${layer}`;
    if (!LAYER_SET.has(layer)) {
      r.error(path, `"${layer}" is not a layer a scene may use (${SCENE_LAYERS.join(', ')})`);
      continue;
    }
    if (!Array.isArray(list)) {
      r.error(path, 'must be a list of placements');
      continue;
    }
    const out: Placement[] = [];
    list.forEach((raw, i) => {
      const at = `${path}[${i}]`;
      const p = r.object(raw, at);
      if (!p) return;
      r.known(p, at, PLACEMENT_KEYS);
      const sprite = r.string(p['sprite'], `${at}.sprite`, { pattern: /^[a-z0-9][a-z0-9_.:-]{0,63}$/, what: 'a sprite id' });
      const x = r.number(p['x'], `${at}.x`, { min: -SCENE_REACH, max: SCENE_REACH });
      const y = r.number(p['y'], `${at}.y`, { min: -SCENE_REACH, max: SCENE_REACH });
      const placement: Placement = { sprite: sprite ?? '', x: x ?? 0, y: y ?? 0 };
      if (p['scale'] !== undefined) placement.scale = r.number(p['scale'], `${at}.scale`, { min: 0.05, max: 16 }) ?? 1;
      if ((p['w'] === undefined) !== (p['h'] === undefined)) r.error(at, 'give "w" and "h" together, or neither');
      else if (p['w'] !== undefined) {
        placement.w = r.number(p['w'], `${at}.w`, { min: 0.05, max: SCENE_REACH, exclusiveMin: false }) ?? 1;
        placement.h = r.number(p['h'], `${at}.h`, { min: 0.05, max: SCENE_REACH }) ?? 1;
      }
      if (p['flip'] !== undefined) {
        if (typeof p['flip'] === 'boolean') placement.flip = p['flip'];
        else r.error(`${at}.flip`, 'must be true or false');
      }
      if (p['alpha'] !== undefined) placement.alpha = r.number(p['alpha'], `${at}.alpha`, { min: 0, max: 1 }) ?? 1;
      if (p['tint'] !== undefined) placement.tint = r.number(p['tint'], `${at}.tint`, { min: 0, max: 0xffffff, int: true }) ?? 0xffffff;
      if (p['frame'] !== undefined) placement.frame = r.number(p['frame'], `${at}.frame`, { min: 0, max: 95, int: true }) ?? 0;
      if (p['motion'] !== undefined) {
        if (typeof p['motion'] === 'string' && MOTION_SET.has(p['motion'])) placement.motion = p['motion'] as SceneMotion;
        else r.error(`${at}.motion`, `must be one of ${SCENE_MOTIONS.join(' | ')}`);
      }
      out.push(placement);
    });
    layers[layer as SceneLayer] = out;
  }
  if (r.failed || room === null) return { value: null, issues: r.issues };
  return { value: { sceneVersion: SCENE_VERSION, room, layers }, issues: r.issues };
}

/** What a scene says against the pack it belongs to: every piece it places must be a sprite set of the pack, and a frame must exist. */
export function sceneIssues(scene: RoomScene, pack: { sprites: ReadonlyArray<{ id: string; clips: { idle?: { count: number } } }> }): ArtIssue[] {
  const out: ArtIssue[] = [];
  const byId = new Map(pack.sprites.map((s) => [s.id, s]));
  for (const layer of SCENE_LAYERS) {
    (scene.layers[layer] ?? []).forEach((p, i) => {
      const path = `scenes.${scene.room}.${layer}[${i}]`;
      const sprite = byId.get(p.sprite);
      if (!sprite) {
        out.push({ level: 'error', path, message: `"${p.sprite}" is not a sprite set of the pack` });
        return;
      }
      const count = sprite.clips.idle?.count ?? 0;
      if (count === 0) out.push({ level: 'error', path, message: `"${p.sprite}" has no idle clip: it is the picture a scene places` });
      else if ((p.frame ?? 0) >= count) out.push({ level: 'error', path, message: `frame ${p.frame} of "${p.sprite}" does not exist (it has ${count})` });
    });
  }
  return out;
}

/** How many pieces a scene places, in all. */
export function scenePieces(scene: RoomScene): number {
  return SCENE_LAYERS.reduce((n, l) => n + (scene.layers[l]?.length ?? 0), 0);
}
