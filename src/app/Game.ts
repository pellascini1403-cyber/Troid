import * as THREE from 'three';
import { createRenderer } from '@/render/createRenderer';

/**
 * F1 walking skeleton: proves the toolchain end to end (Vite → three → WebGL2 → Chromium → capture).
 * It is replaced progressively: F2 swaps the raw rAF loop for the fixed-step loop, F3 the capsule for the
 * mannequin, F4 the camera for CameraRig, F8 the layered boxes for real rooms.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private raf = 0;
  private running = false;
  private readonly onResize = () => this.resize();
  private readonly player: THREE.Mesh;

  constructor(private readonly host: HTMLElement) {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    this.renderer = createRenderer({ canvas, antialias: true, maxPixelRatio: 2, shadows: true });

    this.scene.background = new THREE.Color(0x9fb8a0);
    this.scene.fog = new THREE.Fog(0x9fb8a0, 30, 140);

    // View height 16 m at the gameplay plane, narrow FOV: little distortion, real parallax.
    const fov = 28;
    const viewHeight = 16;
    this.camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.5, 400);
    const dist = viewHeight / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    this.camera.position.set(0, 5, dist);
    this.camera.lookAt(0, 5, 0);

    const hemi = new THREE.HemisphereLight(0xdfeccf, 0x3d4a3a, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe3b0, 2.2);
    sun.position.set(-10, 20, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 14, bottom: -14, near: 1, far: 70 });
    this.scene.add(sun);

    // Layered test set: FAR / MID / WORLD / FOREGROUND.
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });
    const ground = new THREE.Mesh(new THREE.BoxGeometry(80, 2, 6), mat(0x5d6b4a));
    ground.position.set(0, -1, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);
    for (let i = -4; i <= 4; i++) {
      const far = new THREE.Mesh(new THREE.BoxGeometry(10, 26 + (i % 3) * 5, 6), mat(0x7f9a86));
      far.position.set(i * 14, 6, -90);
      this.scene.add(far);
      const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 14, 7), mat(0x4a5a3c));
      mid.position.set(i * 9 + 2, 6, -18);
      mid.castShadow = true;
      this.scene.add(mid);
      const fg = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 6), mat(0x16201a));
      fg.position.set(i * 11 - 3, 10.5, 7);
      fg.rotation.z = Math.PI;
      this.scene.add(fg);
    }
    this.player = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 10), mat(0xffffff));
    this.player.position.set(0, 0.9, 0);
    this.player.castShadow = true;
    this.scene.add(this.player);

    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const frame = (t: number) => {
      if (!this.running) return;
      this.camera.position.x = Math.sin(t / 2500) * 6;
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
