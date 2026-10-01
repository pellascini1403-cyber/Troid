import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { ModelDefinition } from '@/models/ModelDefinition';
import { SOCKET_IDS, SOCKET_NODE_PREFIX, type SocketId } from '@/models/vocabulary';
import { createToonMaterial, getToonUniforms, setToonFlash } from '@/render/materials/toon';
import { createOutlineMaterial } from '@/render/materials/outline';
import { log } from '@/core/log';
import { AnimationController } from './AnimationController';

export interface ModelAsset {
  def: ModelDefinition;
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

/** Where a socket is synthesised when the model does not provide one (fractions of the model height). */
const FALLBACK_SOCKETS: Readonly<Record<SocketId, readonly [number, number, number]>> = {
  weapon_r: [-0.14, 0.5, 0.06], weapon_l: [0.14, 0.5, 0.06], shield: [0.2, 0.58, 0.05],
  projectile_origin: [-0.14, 0.5, 0.22], vfx_feet: [0, 0.01, 0], vfx_hand_r: [-0.14, 0.5, 0.04],
  vfx_hand_l: [0.14, 0.5, 0.04], vfx_center: [0, 0.62, 0], interaction: [0, 0.74, 0.12], head: [0, 1.02, 0],
  back: [0, 0.74, -0.12],
};

/**
 * One live instance of a ModelAsset: its own skeleton, mixer, materials and sockets. Several instances
 * share the asset's geometry (cheap) but never any mutable state (flash, animation, visibility).
 *
 * Coordinate contract: `root` has its origin at the FEET and the model faces +Z. The owner rotates `root`
 * (yaw) and positions it; nothing else in here depends on world position.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly animation: AnimationController;
  readonly sockets = new Map<SocketId, THREE.Object3D>();
  readonly materials: THREE.MeshToonMaterial[] = [];
  private readonly outlines: THREE.ShaderMaterial[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private disposed = false;

  constructor(readonly asset: ModelAsset) {
    const { def } = asset;
    this.root.name = `Model:${def.id}`;
    this.body = cloneSkinned(asset.scene);
    this.body.scale.setScalar(def.scale);
    this.body.rotation.y = (def.yawOffsetDeg * Math.PI) / 180;
    this.root.add(this.body);

    this.applyLook(def);
    this.bindSockets(def);

    this.mixer = new THREE.AnimationMixer(this.body);
    const clips = new Map(asset.animations.map((c) => [c.name, c] as const));
    this.animation = new AnimationController(this.mixer, clips, def);
    this.animation.play('idle', { fade: 0 });
  }

  getSocket(id: SocketId): THREE.Object3D {
    return this.sockets.get(id) as THREE.Object3D;
  }

  /** World position of a socket (updates matrices as needed). */
  getSocketWorld(id: SocketId, out = new THREE.Vector3()): THREE.Vector3 {
    return this.getSocket(id).getWorldPosition(out);
  }

  setFlash(amount: number, color?: THREE.ColorRepresentation): void {
    for (const m of this.materials) setToonFlash(m, amount, color);
  }

  setOpacity(opacity: number): void {
    const transparent = opacity < 0.999;
    for (const m of this.materials) {
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = opacity;
    }
    for (const o of this.outlines) o.visible = opacity > 0.5;
  }

  setCastShadow(value: boolean): void {
    for (const mesh of this.meshes) mesh.castShadow = value;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
    for (const m of this.materials) m.dispose();
    for (const m of this.outlines) m.dispose();
    this.root.removeFromParent();
    // Geometries belong to the shared ModelAsset (owned by AssetManager) and are NOT disposed here.
  }

  private applyLook(def: ModelDefinition): void {
    const { look } = def;
    const originals = new Map<THREE.Material, THREE.MeshToonMaterial>();
    const toToon = (src: THREE.Material): THREE.MeshToonMaterial => {
      let toon = originals.get(src);
      if (toon) return toon;
      const std = src as THREE.MeshStandardMaterial;
      toon = createToonMaterial({
        color: look.baseColor ?? std.color ?? 0xffffff,
        map: look.baseColor === undefined ? std.map ?? null : null,
        emissive: std.emissive,
        emissiveIntensity: std.emissiveIntensity,
        rimColor: look.rim?.color,
        rimStrength: look.rim?.strength ?? 0,
        rimPower: look.rim?.power,
        transparent: false,
      });
      toon.name = src.name;
      originals.set(src, toon);
      this.materials.push(toon);
      return toon;
    };

    const toOutline: THREE.Mesh[] = [];
    this.body.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // skinned bounds are computed at bind pose; characters are few and always near the camera
      this.meshes.push(mesh);
      if (look.style === 'toon') {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toToon) : toToon(mesh.material);
      }
      if (look.outline) toOutline.push(mesh);
    });

    if (look.outline) {
      const outline = createOutlineMaterial(look.outline.thickness / def.scale, look.outline.color);
      this.outlines.push(outline);
      for (const mesh of toOutline) {
        const hull: THREE.Mesh = (mesh as THREE.SkinnedMesh).isSkinnedMesh
          ? (() => {
              const src = mesh as THREE.SkinnedMesh;
              const s = new THREE.SkinnedMesh(src.geometry, outline);
              s.bind(src.skeleton, src.bindMatrix);
              return s;
            })()
          : new THREE.Mesh(mesh.geometry, outline);
        hull.name = `${mesh.name}_outline`;
        hull.frustumCulled = false;
        hull.castShadow = false;
        hull.receiveShadow = false;
        mesh.add(hull);
      }
    }
  }

  private bindSockets(def: ModelDefinition): void {
    const warn = log.scope('model');
    for (const id of SOCKET_IDS) {
      const nodeName = def.sockets[id] ?? `${SOCKET_NODE_PREFIX}${id}`;
      let node = this.body.getObjectByName(nodeName);
      if (!node) {
        // Synthesise an anchor so gameplay/VFX code never needs a null check.
        const f = FALLBACK_SOCKETS[id];
        node = new THREE.Object3D();
        node.name = `${SOCKET_NODE_PREFIX}${id}(fallback)`;
        node.position.set(f[0] * def.height, f[1] * def.height, f[2] * def.height).divideScalar(def.scale);
        this.body.add(node);
        warn.warnOnce(`${def.id}:socket:${id}`, `model "${def.id}" has no socket "${id}" (node "${nodeName}"); using a fallback anchor`);
      }
      this.sockets.set(id, node);
    }
  }

  /** Exposed for the lab / tests. */
  get toonUniformsOfFirstMaterial() {
    return this.materials[0] ? getToonUniforms(this.materials[0]) : undefined;
  }
}
