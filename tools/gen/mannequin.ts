import * as THREE from 'three';
import { RigBuilder, capsule, ellipsoid, taper, type BoneDef } from './rig';
import { buildClip, type BakeOptions, type ClipDef, type Frame } from './poseDsl';

/**
 * The white placeholder humanoid: a real skinned, rigged 3D model (18 bones, one SkinnedMesh) with the
 * standard sockets. It is exported to `public/assets/models/mannequin.glb` and loaded through the exact
 * same path a final character will use. Faces +Z, left side = +X, 1.83 m tall, feet at y = 0.
 */

const FEET = ['foot_L', 'foot_R'] as const;

/** Mirrors an X coordinate for the right side (the model's left side is +X). */
const x = (side: 'L' | 'R', v: number): number => (side === 'L' ? v : -v);

export function buildMannequinRig(): RigBuilder {
  const defs: BoneDef[] = [
    { name: 'root', parent: null, at: [0, 0, 0] },
    { name: 'hips', parent: 'root', at: [0, 0.98, 0] },
    { name: 'spine', parent: 'hips', at: [0, 1.06, 0] },
    { name: 'chest', parent: 'spine', at: [0, 1.26, 0] },
    { name: 'neck', parent: 'chest', at: [0, 1.52, 0] },
    { name: 'head', parent: 'neck', at: [0, 1.62, 0] },
  ];
  for (const side of ['L', 'R'] as const) {
    defs.push(
      { name: `upperArm_${side}`, parent: 'chest', at: [x(side, 0.22), 1.47, 0] },
      { name: `forearm_${side}`, parent: `upperArm_${side}`, at: [x(side, 0.22), 1.19, 0] },
      { name: `hand_${side}`, parent: `forearm_${side}`, at: [x(side, 0.22), 0.93, 0] },
      { name: `upLeg_${side}`, parent: 'hips', at: [x(side, 0.1), 0.94, 0] },
      { name: `leg_${side}`, parent: `upLeg_${side}`, at: [x(side, 0.1), 0.52, 0] },
      { name: `foot_${side}`, parent: `leg_${side}`, at: [x(side, 0.1), 0.09, 0] },
    );
  }
  const rig = new RigBuilder(defs);

  // ---- body (ellipsoid segments: pelvis, abdomen, ribcage) ----
  rig.skin(ellipsoid([0, 0.99, 0], [0.155, 0.115, 0.115], 16), 'hips');
  rig.skin(ellipsoid([0, 1.15, 0], [0.135, 0.125, 0.1], 16), 'spine');
  rig.skin(ellipsoid([0, 1.37, 0], [0.19, 0.2, 0.125], 18), 'chest');
  rig.skin(taper([0, 1.52, 0], [0, 1.65, 0], 0.05, 0.042), 'neck');
  // head: slightly forward-heavy ellipsoid reads as "facing" even without a face
  rig.skin(ellipsoid([0, 1.745, 0.012], [0.095, 0.118, 0.108], 18), 'head');

  for (const side of ['L', 'R'] as const) {
    const s = (v: number) => x(side, v);
    // arm
    rig.skin(ellipsoid([s(0.22), 1.47, 0], [0.058, 0.058, 0.058], 12), `upperArm_${side}`); // shoulder ball
    rig.skin(capsule([s(0.22), 1.46, 0], [s(0.22), 1.2, 0], 0.045), `upperArm_${side}`);
    rig.skin(ellipsoid([s(0.22), 1.19, 0], [0.047, 0.047, 0.047], 12), `forearm_${side}`); // elbow ball
    rig.skin(capsule([s(0.22), 1.18, 0], [s(0.22), 0.94, 0], 0.039), `forearm_${side}`);
    rig.skin(ellipsoid([s(0.22), 0.875, 0.005], [0.046, 0.07, 0.04], 12), `hand_${side}`); // mitten hand
    // leg
    rig.skin(capsule([s(0.1), 0.93, 0], [s(0.1), 0.53, 0], 0.072), `upLeg_${side}`);
    rig.skin(ellipsoid([s(0.1), 0.52, 0], [0.06, 0.06, 0.06], 12), `leg_${side}`); // knee ball
    rig.skin(capsule([s(0.1), 0.51, 0], [s(0.1), 0.11, 0], 0.056), `leg_${side}`);
    rig.skin(ellipsoid([s(0.1), 0.09, 0], [0.052, 0.052, 0.052], 12), `foot_${side}`); // ankle ball
    rig.skin(capsule([s(0.1), 0.055, -0.045], [s(0.1), 0.05, 0.19], 0.045), `foot_${side}`);
  }

  // ---- sockets (see docs/ARCHITECTURE.md §5; ids in src/models/vocabulary.ts) ----
  rig.socket('SOCKET_weapon_R', 'hand_R', [-0.22, 0.88, 0.04]);
  rig.socket('SOCKET_weapon_L', 'hand_L', [0.22, 0.88, 0.04]);
  rig.socket('SOCKET_shield', 'forearm_L', [0.31, 1.06, 0.03]);
  rig.socket('SOCKET_projectile_origin', 'hand_R', [-0.22, 0.88, 0.22]);
  rig.socket('SOCKET_vfx_feet', 'root', [0, 0.02, 0]);
  rig.socket('SOCKET_vfx_hand_R', 'hand_R', [-0.22, 0.86, 0.02]);
  rig.socket('SOCKET_vfx_hand_L', 'hand_L', [0.22, 0.86, 0.02]);
  rig.socket('SOCKET_vfx_center', 'spine', [0, 1.2, 0]);
  rig.socket('SOCKET_interaction', 'chest', [0, 1.35, 0.22]);
  rig.socket('SOCKET_head', 'head', [0, 1.9, 0]);
  rig.socket('SOCKET_back', 'chest', [0, 1.35, -0.2]);
  return rig;
}

export interface BuiltMannequin {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/**
 * Feet-to-ground solver used while baking: for clips flagged `ground`, lowers/raises the hips so the lowest
 * sole point touches y = 0 in every frame. Lets clip authors specify only joint angles for contact poses.
 */
function makeGrounder(rig: RigBuilder): (frame: Frame) => void {
  const heel = new THREE.Vector3(0, -0.084, -0.05);
  const toe = new THREE.Vector3(0, -0.084, 0.19);
  const tmp = new THREE.Vector3();
  const resetRest = () => {
    for (const bone of rig.boneList) {
      bone.quaternion.identity();
      bone.position.copy(rig.restLocal.get(bone.name) as THREE.Vector3);
    }
  };
  return (frame) => {
    resetRest();
    for (const [name, q] of frame.rot) (rig.bones.get(name) as THREE.Bone).quaternion.copy(q);
    for (const [name, p] of frame.pos) (rig.bones.get(name) as THREE.Bone).position.copy(p);
    rig.root.updateMatrixWorld(true);
    let minY = Infinity;
    for (const name of FEET) {
      const foot = rig.bones.get(name) as THREE.Bone;
      for (const point of [heel, toe]) minY = Math.min(minY, foot.localToWorld(tmp.copy(point)).y);
    }
    (frame.pos.get('hips') as THREE.Vector3).y -= minY;
  };
}

export interface MannequinClipDef extends ClipDef {
  /** Keep the soles on the floor automatically (contact poses). Leave off for airborne / prone clips. */
  ground?: boolean;
}

export function buildMannequin(clipDefs: MannequinClipDef[]): BuiltMannequin {
  const rig = buildMannequinRig();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
  material.name = 'Mannequin_White';
  const { group } = rig.build(material, 'Mannequin_Body');
  group.name = 'Mannequin';

  const grounder = makeGrounder(rig);
  const clips = clipDefs.map((def) => {
    const options: BakeOptions = def.ground ? { adjust: grounder, alwaysPosition: ['hips'] } : {};
    return buildClip(def, rig.restLocal, options);
  });
  // The grounder poses the live bones while baking: restore the rest pose before export.
  for (const bone of rig.boneList) {
    bone.quaternion.identity();
    bone.position.copy(rig.restLocal.get(bone.name) as THREE.Vector3);
  }
  group.updateMatrixWorld(true);
  return { scene: group, clips };
}
