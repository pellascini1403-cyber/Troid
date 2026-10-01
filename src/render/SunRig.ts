import * as THREE from 'three';

export interface SunOptions {
  color: number;
  intensity: number;
  shadowMapSize: number;
  /** Half-extent (metres) of the shadow volume around the focus point. */
  shadowExtent: number;
}

/**
 * Key light whose shadow volume FOLLOWS the action. A level is 100+ m wide but only ~35 m are ever on screen,
 * so shadows are rendered for that window: crisp where it matters, one shadow map for the whole game.
 */
export class SunRig {
  readonly light: THREE.DirectionalLight;
  private readonly offset = new THREE.Vector3(-14, 22, 17);

  constructor(scene: THREE.Scene, opts: Partial<SunOptions> = {}) {
    const o: SunOptions = { color: 0xfff0d0, intensity: 2.3, shadowMapSize: 2048, shadowExtent: 26, ...opts };
    this.light = new THREE.DirectionalLight(o.color, o.intensity);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(o.shadowMapSize, o.shadowMapSize);
    const cam = this.light.shadow.camera;
    cam.left = -o.shadowExtent;
    cam.right = o.shadowExtent;
    cam.top = o.shadowExtent * 0.7;
    cam.bottom = -o.shadowExtent * 0.7;
    cam.near = 1;
    cam.far = 90;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.04;
    scene.add(this.light, this.light.target);
  }

  follow(x: number, y: number): void {
    this.light.target.position.set(x, y, 0);
    this.light.position.set(x + this.offset.x, y + this.offset.y, this.offset.z);
    this.light.target.updateMatrixWorld();
    this.light.updateMatrixWorld();
  }

  dispose(): void {
    this.light.dispose();
    this.light.removeFromParent();
    this.light.target.removeFromParent();
  }
}
