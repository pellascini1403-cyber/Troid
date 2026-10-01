import * as THREE from 'three';
import type { CollisionWorld, KinematicBody } from '@/world/collision';

const SOLID = 0xff5a5a;
const ONEWAY = 0xffd54d;
const BODY = 0x4dff9a;
const Z = 3.4; // in front of every blockout block (they extend ±3 m)

/**
 * Wireframe view of the collision world and of actor bodies. Created only when the debug flag is on,
 * costs nothing otherwise. Static colliders are rebuilt on room load; bodies update every frame.
 */
export class ColliderOverlay {
  readonly object = new THREE.Group();
  private staticLines: THREE.LineSegments | null = null;
  private bodyLines: THREE.LineSegments | null = null;
  private bodyCapacity = 0;

  constructor() {
    this.object.name = 'debug:colliders';
    this.object.renderOrder = 999;
  }

  setRoom(collision: CollisionWorld): void {
    this.staticLines?.removeFromParent();
    this.staticLines?.geometry.dispose();
    const positions: number[] = [];
    const colors: number[] = [];
    const c = new THREE.Color();
    for (const col of collision.all()) {
      c.setHex(col.kind === 'solid' ? SOLID : ONEWAY);
      pushRect(positions, colors, col.rect.x0, col.rect.y0, col.rect.x1, col.rect.y1, c, col.enabled ? 1 : 0.25);
    }
    this.staticLines = makeLines(positions, colors);
    this.object.add(this.staticLines);
  }

  updateBodies(bodies: readonly KinematicBody[]): void {
    if (!this.bodyLines || bodies.length > this.bodyCapacity) {
      this.bodyLines?.removeFromParent();
      this.bodyLines?.geometry.dispose();
      this.bodyCapacity = Math.max(8, bodies.length * 2);
      const zero = new Array<number>(this.bodyCapacity * 24).fill(0);
      this.bodyLines = makeLines(zero, new Array<number>(this.bodyCapacity * 24).fill(1));
      (this.bodyLines.geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
      this.object.add(this.bodyLines);
    }
    const pos = this.bodyLines.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.bodyLines.geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color(BODY);
    const tmpP: number[] = [];
    const tmpC: number[] = [];
    bodies.forEach((b) => pushRect(tmpP, tmpC, b.x - b.halfW, b.y, b.x + b.halfW, b.y + b.height, c, b.grounded ? 1 : 0.55));
    for (let i = 0; i < this.bodyCapacity * 8; i++) {
      pos.setXYZ(i, tmpP[i * 3] ?? 0, tmpP[i * 3 + 1] ?? 0, tmpP[i * 3 + 2] ?? 0);
      col.setXYZ(i, tmpC[i * 3] ?? 0, tmpC[i * 3 + 1] ?? 0, tmpC[i * 3 + 2] ?? 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  dispose(): void {
    this.staticLines?.geometry.dispose();
    this.bodyLines?.geometry.dispose();
    this.object.removeFromParent();
  }
}

function pushRect(pos: number[], col: number[], x0: number, y0: number, x1: number, y1: number, c: THREE.Color, k: number): void {
  const edges = [x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0];
  for (let i = 0; i < edges.length; i += 2) {
    pos.push(edges[i] as number, edges[i + 1] as number, Z);
    col.push(c.r * k, c.g * k, c.b * k);
  }
}

function makeLines(positions: number[], colors: number[]): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false;
  lines.renderOrder = 999;
  return lines;
}
