import * as THREE from 'three';
import type { CameraPose } from './CameraRig';

/**
 * Applies a CameraPose to a real three.js camera. The camera object is created here so switching between
 * perspective and orthographic at runtime (debug panel, per-room override) is just `setProjection`.
 */
export class CameraView {
  readonly perspective: THREE.PerspectiveCamera;
  readonly orthographic: THREE.OrthographicCamera;
  private active: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private readonly lookTarget = new THREE.Vector3();

  constructor(near = 0.5, far = 600) {
    this.perspective = new THREE.PerspectiveCamera(26, 16 / 9, near, far);
    this.orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, near, far);
    this.active = this.perspective;
  }

  get camera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.active;
  }

  apply(pose: CameraPose, aspect: number): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    if (pose.projection === 'perspective') {
      const cam = this.perspective;
      if (cam.fov !== pose.fovDeg || cam.aspect !== aspect) {
        cam.fov = pose.fovDeg;
        cam.aspect = aspect;
        cam.updateProjectionMatrix();
      }
      this.active = cam;
    } else {
      const cam = this.orthographic;
      const h = pose.viewHeight / 2;
      const w = h * aspect;
      if (cam.top !== h || cam.right !== w) {
        cam.left = -w;
        cam.right = w;
        cam.top = h;
        cam.bottom = -h;
        cam.updateProjectionMatrix();
      }
      this.active = cam;
    }
    const cam = this.active;
    cam.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.lookTarget.set(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.lookTarget);
    if (pose.rollRad !== 0) cam.rotateZ(pose.rollRad);
    cam.updateMatrixWorld();
    return cam;
  }
}
