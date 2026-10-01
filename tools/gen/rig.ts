import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { V3 } from './poseDsl';

/**
 * Small toolkit shared by every generated placeholder model: build a bone hierarchy from WORLD rest
 * positions, add rigidly-skinned primitives (every vertex 100 % weighted to one bone) and attach sockets.
 * Rigid skinning is deliberate: it gives the segmented "artist mannequin" look and zero stretching.
 */

export interface BoneDef {
  name: string;
  parent: string | null;
  /** WORLD-space rest position */
  at: V3;
}

export class RigBuilder {
  readonly bones = new Map<string, THREE.Bone>();
  readonly boneList: THREE.Bone[] = [];
  /** local rest position per bone (needed by the clip baker) */
  readonly restLocal = new Map<string, THREE.Vector3>();
  private readonly world = new Map<string, THREE.Vector3>();
  private readonly pieces: THREE.BufferGeometry[] = [];

  constructor(defs: BoneDef[]) {
    for (const d of defs) {
      const bone = new THREE.Bone();
      bone.name = d.name;
      const w = new THREE.Vector3(...d.at);
      this.world.set(d.name, w);
      const parentWorld = d.parent ? (this.world.get(d.parent) as THREE.Vector3) : new THREE.Vector3();
      bone.position.copy(w).sub(parentWorld);
      this.restLocal.set(d.name, bone.position.clone());
      if (d.parent) (this.bones.get(d.parent) as THREE.Bone).add(bone);
      this.bones.set(d.name, bone);
      this.boneList.push(bone);
    }
  }

  get root(): THREE.Bone {
    return this.boneList[0] as THREE.Bone;
  }

  /** Adds a geometry (given in WORLD rest coordinates) weighted fully to `bone`. */
  skin(geometry: THREE.BufferGeometry, bone: string): void {
    const index = this.boneList.findIndex((b) => b.name === bone);
    if (index < 0) throw new Error(`unknown bone ${bone}`);
    const g = geometry;
    g.deleteAttribute('uv'); // untextured placeholders: smaller files, identical attribute sets for merging
    const n = g.attributes.position!.count;
    const ids = new Uint16Array(n * 4);
    const weights = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      ids[i * 4] = index;
      weights[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ids, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    this.pieces.push(g);
  }

  /** Empty node used as an anchor. `at` is a WORLD position; the node is parented to `bone`. */
  socket(name: string, bone: string, at: V3): THREE.Object3D {
    const node = new THREE.Object3D();
    node.name = name;
    const parentWorld = this.world.get(bone) as THREE.Vector3;
    node.position.set(...at).sub(parentWorld);
    (this.bones.get(bone) as THREE.Bone).add(node);
    return node;
  }

  /** Merges all pieces into a single SkinnedMesh (one draw call) bound to the skeleton in its rest pose. */
  build(material: THREE.Material, meshName: string): { group: THREE.Group; mesh: THREE.SkinnedMesh; skeleton: THREE.Skeleton } {
    const merged = mergeGeometries(this.pieces, false);
    if (!merged) throw new Error('mergeGeometries failed: pieces have different attribute sets');
    const mesh = new THREE.SkinnedMesh(merged, material);
    mesh.name = meshName;
    mesh.frustumCulled = false;
    const group = new THREE.Group();
    group.add(this.root);
    group.add(mesh);
    group.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(this.boneList);
    mesh.bind(skeleton);
    return { group, mesh, skeleton };
  }
}

// ---- primitive helpers (all return geometry in WORLD rest coordinates) ----

const UP = new THREE.Vector3(0, 1, 0);

export function ellipsoid(center: V3, radii: V3, segments = 14): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.7));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...center), new THREE.Quaternion(), new THREE.Vector3(...radii)));
  return g;
}

/** Capsule whose axis runs from `a` to `b`; `radius` may be squashed along X/Z with `squash`. */
export function capsule(a: V3, b: V3, radius: number, squash: [number, number] = [1, 1]): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const total = dir.length();
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.0001, total - 2 * radius), 3, 10);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  g.applyMatrix4(new THREE.Matrix4().makeScale(squash[0], 1, squash[1]));
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Truncated cone along Y between `a` (radius ra) and `b` (radius rb). */
export function taper(a: V3, b: V3, ra: number, rb: number, segments = 10): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const g = new THREE.CylinderGeometry(rb, ra, dir.length(), segments, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
