import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createToonMaterial } from '@/render/materials/toon';
import type { RoomDefinition, SolidDef } from '../RoomDefinition';

/**
 * Level-design blockout: every collider as a box with real depth, merged per material (one draw call each).
 * It is what you see while authoring a room (and, via `?room=`, any room before its environment exists). The
 * environment builder (F8) dresses the same data with set pieces; this view stays available as a debug layer.
 *
 * Platform TOPS are lit lighter than their sides: the walkable edge must read at a glance on a phone.
 */

const PALETTE: Record<string, number> = {
  stone: 0x8b8d84,
  earth: 0x6e7c50,
  wood: 0xa07c4c,
  moss: 0x7f9d5c,
};
const FALLBACK = 0x8b8d84;

const DEPTH_SOLID = 6;
const DEPTH_ONEWAY = 4.2;

export function buildBlockout(room: RoomDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = `Blockout:${room.id}`;
  const byMaterial = new Map<string, THREE.BufferGeometry[]>();

  for (const s of room.solids) {
    const key = s.material ?? 'stone';
    const list = byMaterial.get(key) ?? [];
    list.push(boxFor(s));
    byMaterial.set(key, list);
  }

  for (const [material, geos] of byMaterial) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, createToonMaterial({ color: PALETTE[material] ?? FALLBACK, vertexColors: true }));
    mesh.name = `blockout:${material}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function boxFor(s: SolidDef): THREE.BufferGeometry {
  const { x0, y0, x1, y1 } = s.rect;
  const depth = s.kind === 'oneway' ? DEPTH_ONEWAY : DEPTH_SOLID;
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, depth);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  // vertex colours: tops lighter, sides darker (BoxGeometry has 24 vertices, 4 per face: +x,-x,+y,-y,+z,-z)
  const shades = [0.82, 0.74, 1.3, 0.6, 1.0, 0.7];
  const colors = new Float32Array(24 * 3);
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = (face * 4 + v) * 3;
      colors[i] = colors[i + 1] = colors[i + 2] = shades[face] as number;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}
