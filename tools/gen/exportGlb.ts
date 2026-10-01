import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/** GLTFExporter's binary path uses FileReader, which Node lacks. Minimal polyfill backed by Blob.arrayBuffer(). */
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then(
      (buffer) => {
        this.result = buffer;
        this.onload?.();
        this.onloadend?.();
      },
      (error) => this.onerror?.(error),
    );
  }
  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload?.();
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

/** Exports a scene (+ clips) as a binary glTF and writes it to `path`. Returns the byte size. */
export async function exportGlb(scene: THREE.Object3D, clips: THREE.AnimationClip[], path: string): Promise<number> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true, animations: clips, onlyVisible: false });
  if (!(result instanceof ArrayBuffer)) throw new Error('expected a binary GLB');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(result));
  return result.byteLength;
}
