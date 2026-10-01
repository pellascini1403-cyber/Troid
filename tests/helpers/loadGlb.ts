import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GltfLike } from '@/assets/AssetManager';

/** Loads a committed .glb from public/ in node (no network, no GL), exactly as the browser parses it. */
export async function loadGlb(relativePath: string): Promise<GltfLike> {
  const buf = readFileSync(resolve(__dirname, '../../public', relativePath));
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new Promise<GltfLike>((res, rej) => new GLTFLoader().parse(arrayBuffer, '', res as never, rej));
  return { scene: gltf.scene, animations: gltf.animations };
}
