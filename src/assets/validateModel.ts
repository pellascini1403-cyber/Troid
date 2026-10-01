import * as THREE from 'three';
import type { ModelDefinition } from '@/models/ModelDefinition';
import { clipSpec } from '@/models/ModelDefinition';
import { SOCKET_NODE_PREFIX, SOCKET_IDS } from '@/models/vocabulary';

export interface ModelIssue {
  level: 'error' | 'warn' | 'info';
  message: string;
}

/**
 * Checks a loaded glTF against its ModelDefinition. This is the "asset contract": run it when integrating
 * final art to learn immediately what is missing or mis-scaled (the same function backs the unit tests that
 * guard the placeholders). Pure three.js (no DOM, no GL), so it also runs in node.
 */
export function validateModel(def: ModelDefinition, scene: THREE.Object3D, animations: THREE.AnimationClip[]): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const clipNames = new Set(animations.map((a) => a.name));

  // 1. clips referenced by the definition exist
  for (const [state, raw] of Object.entries(def.clips)) {
    const { clip } = clipSpec(raw);
    if (!clipNames.has(clip)) {
      issues.push({ level: 'error', message: `state "${state}" maps to clip "${clip}", which is not in the file (has: ${[...clipNames].join(', ') || 'none'})` });
    }
  }
  if (def.clips.idle === undefined) {
    issues.push({ level: 'error', message: 'no "idle" clip mapped: it is the last-resort fallback of every state' });
  }

  // 2. sockets
  const names = new Set<string>();
  scene.traverse((o) => names.add(o.name));
  for (const id of SOCKET_IDS) {
    const node = def.sockets[id] ?? `${SOCKET_NODE_PREFIX}${id}`;
    if (!names.has(node)) issues.push({ level: 'warn', message: `socket "${id}" → node "${node}" not found (a fallback anchor will be used)` });
  }

  // 3. animated nodes exist (a typo here silently produces a motionless character)
  const missingTargets = new Set<string>();
  for (const clip of animations) {
    for (const track of clip.tracks) {
      const node = track.name.split('.')[0] ?? '';
      if (node && !names.has(node)) missingTargets.add(node);
    }
  }
  if (missingTargets.size > 0) {
    issues.push({ level: 'error', message: `animation tracks target nodes that do not exist: ${[...missingTargets].join(', ')}` });
  }

  // 4. scale sanity: the model, after def.scale, should be ≈ def.height tall
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) box.expandByObject(mesh);
  });
  let skinnedHeight = 0;
  scene.traverse((o) => {
    const sk = o as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) {
      const g = sk.geometry;
      g.computeBoundingBox();
      if (g.boundingBox) skinnedHeight = Math.max(skinnedHeight, g.boundingBox.max.y - g.boundingBox.min.y);
    }
  });
  const rawHeight = Math.max(skinnedHeight, box.isEmpty() ? 0 : box.max.y - box.min.y);
  if (rawHeight > 0) {
    const h = rawHeight * def.scale;
    if (Math.abs(h - def.height) / def.height > 0.15) {
      issues.push({
        level: 'warn',
        message: `model is ${h.toFixed(2)} m tall after scale ${def.scale}, definition says ${def.height} m. Suggested scale: ${(def.height / rawHeight).toFixed(4)}`,
      });
    }
  }

  // 5. skinning stats (info)
  let skinned = 0;
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned++;
  });
  issues.push({ level: 'info', message: `${skinned} skinned mesh(es), ${animations.length} clip(s)` });
  return issues;
}
