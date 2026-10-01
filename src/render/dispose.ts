import * as THREE from 'three';

/**
 * Frees GPU resources of everything under `root` (geometries and materials). Shared gradient ramps are
 * deliberately not touched: they belong to the whole app (see getToonRamp).
 */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) for (const m of mat) m.dispose();
    else if (mat) mat.dispose();
  });
  root.removeFromParent();
}
