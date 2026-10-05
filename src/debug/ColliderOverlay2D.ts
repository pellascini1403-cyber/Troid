import { Graphics, type Container } from 'pixi.js';
import { viewY } from '@/presentation/worldTransform';
import type { CollisionWorld, KinematicBody } from '@/world/collision';

const SOLID = 0xff5a5a;
const ONEWAY = 0xffd54d;
const BODY = 0x4dff9a;

/**
 * Wireframe view of the collision world and of actor bodies (debug only). Same job as the 3D overlay it replaces,
 * drawn with Pixi `Graphics` in world space (metres); `pixelLine` keeps strokes 1 px wide at any zoom.
 */
export class ColliderOverlay2D {
  private readonly statics = new Graphics();
  private readonly bodies = new Graphics();

  constructor(parent: Container) {
    this.statics.label = 'debug:colliders';
    this.bodies.label = 'debug:bodies';
    parent.addChild(this.statics, this.bodies);
  }

  setRoom(collision: CollisionWorld): void {
    const g = this.statics;
    g.clear();
    for (const c of collision.all()) {
      const { x0, y0, x1, y1 } = c.rect;
      g.rect(x0, viewY(y1), x1 - x0, y1 - y0).stroke({ width: 1, color: c.kind === 'solid' ? SOLID : ONEWAY, alpha: c.enabled ? 1 : 0.25, pixelLine: true });
    }
  }

  updateBodies(bodies: readonly KinematicBody[]): void {
    const g = this.bodies;
    g.clear();
    for (const b of bodies) {
      g.rect(b.x - b.halfW, viewY(b.y + b.height), b.halfW * 2, b.height).stroke({ width: 1, color: BODY, alpha: b.grounded ? 1 : 0.55, pixelLine: true });
    }
  }

  destroy(): void {
    this.statics.destroy();
    this.bodies.destroy();
  }
}
