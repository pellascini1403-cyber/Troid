import * as THREE from 'three';

/**
 * Pose-to-pose clip authoring for placeholder models.
 *
 * Rotations are Euler XYZ in DEGREES, relative to the rest pose (rest = all zeros). The model faces +Z,
 * its left side is +X. Cheat-sheet (for limbs hanging down / torso standing up):
 *   thigh / upper arm forward  = NEGATIVE rx      knee / elbow flexion   = +rx (knee) / −rx (elbow)
 *   torso / head lean forward  = POSITIVE rx      +ry = turn toward the character's left
 *   toes up                    = NEGATIVE rx      left limb out to the side = +rz (right limb = −rz)
 *
 * Keys are sampled at `fps` with eased interpolation and baked into plain quaternion / position tracks, so
 * the result is indistinguishable from a clip exported by a DCC tool.
 */

export type V3 = [number, number, number];
export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'back';

export interface Pose {
  /** bone → Euler degrees */
  r?: Record<string, V3>;
  /** bone → position offset from rest, metres */
  p?: Record<string, V3>;
}

export interface Key {
  /** seconds */
  t: number;
  pose: Pose;
  /** easing of the segment that ARRIVES at this key (default `inOut`) */
  ease?: Ease;
}

export interface ClipDef {
  name: string;
  duration: number;
  /** Loops: the pose at `duration` is forced to equal the pose at t = 0. */
  loop: boolean;
  keys: Key[];
  fps?: number;
}

export function pose(r: Record<string, V3> = {}, p: Record<string, V3> = {}): Pose {
  return { r, p };
}

/**
 * Left ↔ right mirror across the sagittal plane: swap `_L`/`_R` bones, negate ry and rz and the x offset.
 * The same rule holds for centre bones (hips, chest, head…): twisting left becomes twisting right.
 */
export function mirror(source: Pose): Pose {
  const swap = (bone: string): string =>
    bone.endsWith('_L') ? `${bone.slice(0, -2)}_R` : bone.endsWith('_R') ? `${bone.slice(0, -2)}_L` : bone;
  const out = { r: {} as Record<string, V3>, p: {} as Record<string, V3> };
  for (const [bone, [x, y, z]] of Object.entries(source.r ?? {})) out.r[swap(bone)] = [x, -y, -z];
  for (const [bone, [x, y, z]] of Object.entries(source.p ?? {})) out.p[swap(bone)] = [-x, y, z];
  return out;
}

/** Shallow merge of poses: later poses win per bone. Lets a clip start from a shared base stance. */
export function mix(...poses: Pose[]): Pose {
  const out: Pose = { r: {}, p: {} };
  for (const ps of poses) {
    Object.assign(out.r as object, ps.r);
    Object.assign(out.p as object, ps.p);
  }
  return out;
}

function ease(kind: Ease, u: number): number {
  switch (kind) {
    case 'linear':
      return u;
    case 'in':
      return u * u;
    case 'out':
      return 1 - (1 - u) * (1 - u);
    case 'back': {
      // ease-out with a small overshoot: gives snappy, "drawn" accents
      const c1 = 1.2;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
    }
    case 'inOut':
    default:
      return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }
}

const DEG = Math.PI / 180;

/** One baked sample, handed to `BakeOptions.adjust` so a generator can post-process it (e.g. ground the feet). */
export interface Frame {
  t: number;
  rot: Map<string, THREE.Quaternion>;
  pos: Map<string, THREE.Vector3>;
}

export interface BakeOptions {
  /** Called for every sample before tracks are written; may edit `frame.rot` / `frame.pos` in place. */
  adjust?: (frame: Frame) => void;
  /** Bones that must always get a position track (e.g. `hips` when `adjust` moves it). */
  alwaysPosition?: string[];
}

/**
 * Bakes a ClipDef into an AnimationClip.
 * `rest` maps bone name → rest-pose LOCAL position (needed for position tracks).
 */
export function buildClip(
  def: ClipDef,
  rest: ReadonlyMap<string, THREE.Vector3>,
  options: BakeOptions = {},
): THREE.AnimationClip {
  const fps = def.fps ?? 30;
  const keys = [...def.keys].sort((a, b) => a.t - b.t);
  if (keys.length === 0) throw new Error(`clip ${def.name}: no keys`);
  if ((keys[0] as Key).t !== 0) keys.unshift({ t: 0, pose: {}, ease: 'linear' });
  const last = keys[keys.length - 1] as Key;
  if (def.loop) {
    if (last.t < def.duration - 1e-6) keys.push({ t: def.duration, pose: keys[0]!.pose, ease: 'inOut' });
    else keys[keys.length - 1] = { ...last, t: def.duration, pose: keys[0]!.pose };
  } else if (last.t < def.duration - 1e-6) {
    keys.push({ t: def.duration, pose: last.pose, ease: 'linear' }); // hold the final pose
  }

  const rotBones = new Set<string>();
  const posBones = new Set<string>(options.alwaysPosition ?? []);
  for (const k of keys) {
    for (const b of Object.keys(k.pose.r ?? {})) rotBones.add(b);
    for (const b of Object.keys(k.pose.p ?? {})) posBones.add(b);
  }

  const frameCount = Math.max(2, Math.round(def.duration * fps) + 1);
  const times: number[] = [];
  for (let i = 0; i < frameCount; i++) times.push((i / (frameCount - 1)) * def.duration);

  const segment = (t: number): { a: Key; b: Key; u: number } => {
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i] as Key;
      const b = keys[i + 1] as Key;
      if (t <= b.t + 1e-9) {
        const span = Math.max(1e-6, b.t - a.t);
        return { a, b, u: ease(b.ease ?? 'inOut', Math.min(1, Math.max(0, (t - a.t) / span))) };
      }
    }
    return { a: keys[keys.length - 2] as Key, b: keys[keys.length - 1] as Key, u: 1 };
  };

  const qb = new THREE.Quaternion();
  const e = new THREE.Euler();
  const frames: Frame[] = times.map((t) => {
    const { a, b, u } = segment(t);
    const frame: Frame = { t, rot: new Map(), pos: new Map() };
    for (const bone of rotBones) {
      const ra = a.pose.r?.[bone] ?? [0, 0, 0];
      const rb = b.pose.r?.[bone] ?? [0, 0, 0];
      const q = new THREE.Quaternion().setFromEuler(e.set(ra[0] * DEG, ra[1] * DEG, ra[2] * DEG, 'XYZ'));
      qb.setFromEuler(e.set(rb[0] * DEG, rb[1] * DEG, rb[2] * DEG, 'XYZ'));
      frame.rot.set(bone, q.slerp(qb, u));
    }
    for (const bone of posBones) {
      const base = rest.get(bone);
      if (!base) throw new Error(`clip ${def.name}: position track for unknown bone "${bone}"`);
      const pa = a.pose.p?.[bone] ?? [0, 0, 0];
      const pb = b.pose.p?.[bone] ?? [0, 0, 0];
      frame.pos.set(
        bone,
        new THREE.Vector3(
          base.x + pa[0] + (pb[0] - pa[0]) * u,
          base.y + pa[1] + (pb[1] - pa[1]) * u,
          base.z + pa[2] + (pb[2] - pa[2]) * u,
        ),
      );
    }
    options.adjust?.(frame);
    return frame;
  });

  const tracks: THREE.KeyframeTrack[] = [];
  for (const bone of rotBones) {
    const values: number[] = [];
    for (const f of frames) {
      const q = f.rot.get(bone) as THREE.Quaternion;
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  for (const bone of posBones) {
    const values: number[] = [];
    for (const f of frames) {
      const v = f.pos.get(bone) as THREE.Vector3;
      values.push(v.x, v.y, v.z);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, values));
  }
  return new THREE.AnimationClip(def.name, def.duration, tracks);
}
