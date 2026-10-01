import * as THREE from 'three';
import { createRenderer } from '@/render/createRenderer';
import { DisposableStore } from '@/core/lifecycle';
import { TICK_SECONDS } from '@/core/time';
import { AssetManager } from '@/assets/AssetManager';
import { PlayerVisual } from '@/player/PlayerVisual';
import { createActorViewState, type ActorViewState } from '@/gameplay/actorView';
import { ANIM_STATES, type AnimState } from '@/models/vocabulary';
import { MODELS } from '@/content/models';
import { PLAYER } from '@/content/player';
import { CameraRig, DEFAULT_CAMERA, type CameraConfig, type CameraTarget } from '@/camera/CameraRig';
import { CameraView } from '@/camera/CameraView';
import { GameLoop } from './GameLoop';
import { listen } from './dom';

/** `?cam=ortho` `?fov=20` `?vh=18` `?pitch=5` — try camera options on a real device without rebuilding. */
export function cameraConfigFromQuery(q: URLSearchParams): Partial<CameraConfig> {
  const cfg: Partial<CameraConfig> = {};
  if (q.get('cam') === 'ortho') cfg.projection = 'orthographic';
  const num = (key: string) => (q.has(key) && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : undefined);
  const fov = num('fov');
  const vh = num('vh');
  const pitch = num('pitch');
  if (fov !== undefined) cfg.fovDeg = fov;
  if (vh !== undefined) cfg.viewHeight = vh;
  if (pitch !== undefined) cfg.pitchDeg = pitch;
  return cfg;
}

/**
 * F1 walking skeleton: proves the toolchain end to end (Vite → three → WebGL2 → Chromium → capture).
 * It is replaced progressively: F2 swaps the raw rAF loop for the fixed-step loop, F3 the capsule for the
 * mannequin, F4 the camera for CameraRig, F8 the layered boxes for real rooms.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cameraView = new CameraView(DEFAULT_CAMERA.near, DEFAULT_CAMERA.far);
  readonly cameraRig: CameraRig;
  /** Owns every listener / resource of this Game; `dispose()` releases them all. */
  private readonly lifecycle = new DisposableStore();
  private readonly loop: GameLoop;
  private readonly assets = new AssetManager(import.meta.env.BASE_URL);
  private playerVisual: PlayerVisual | null = null;
  private readonly playerView: ActorViewState = createActorViewState();
  private demoStates: AnimState[] = [];
  private simTime = 0;
  private aspect = 16 / 9;
  private snapCamera = true;

  constructor(private readonly host: HTMLElement) {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    this.renderer = createRenderer({ canvas, antialias: true, maxPixelRatio: 2, shadows: true });

    this.scene.background = new THREE.Color(0x9fb8a0);
    this.scene.fog = new THREE.Fog(0x9fb8a0, 30, 140);

    this.cameraRig = new CameraRig(cameraConfigFromQuery(new URLSearchParams(location.search)));

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
    void this.loadPlayer();

    this.loop = new GameLoop({
      tick: () => this.tick(),
      frame: (alpha, dt) => this.render(alpha, dt),
    });

    listen(this.lifecycle, window, 'resize', () => this.resize());
    // Mobile: never simulate (or burn battery) while the page is hidden, and never replay the time away.
    listen(this.lifecycle, document, 'visibilitychange', () => {
      if (document.hidden) this.loop.stop();
      else this.loop.start();
    });
    this.lifecycle.add(() => {
      this.loop.stop();
      this.renderer.dispose();
      this.renderer.domElement.remove();
    });
    this.resize();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.lifecycle.dispose();
  }

  /** F3 demo: the real model pipeline (GLB → CharacterModel → ActorVisual) cycling through logical states. */
  private async loadPlayer(): Promise<void> {
    const def = MODELS[PLAYER.modelId];
    if (!def) throw new Error(`player model "${PLAYER.modelId}" is not in the content registry`);
    const model = await this.assets.instantiate(def);
    if (this.lifecycle.disposed) return model.dispose();
    this.playerVisual = new PlayerVisual(model);
    this.scene.add(this.playerVisual.root);
    this.lifecycle.add(() => this.playerVisual?.dispose());
    this.demoStates = ANIM_STATES.filter((s) => def.clips[s] !== undefined);
    this.playerView.y = this.playerView.prevY = 0;
  }

  /** One fixed simulation step. */
  private tick(): void {
    this.simTime += TICK_SECONDS;
    const v = this.playerView;
    v.prevX = v.x;
    v.prevY = v.y;
    if (this.demoStates.length > 0) {
      const slot = Math.floor(this.simTime / 1.4);
      const state = this.demoStates[slot % this.demoStates.length] as AnimState;
      if (state !== v.anim) {
        v.anim = state;
        v.animSerial++;
      }
      v.facing = Math.floor(slot / this.demoStates.length) % 2 === 0 ? 1 : -1;
      // demo locomotion so the camera has something to follow (the real controller arrives in F5)
      const speed = state === 'run' ? 9 : state === 'walk' ? 4.5 : state === 'dash' ? 22 : 0;
      v.x = Math.max(-34, Math.min(34, v.x + v.facing * speed * TICK_SECONDS));
    }
  }

  private render(alpha: number, realDt: number): void {
    this.playerVisual?.sync(this.playerView, alpha, realDt);
    // The camera follows the INTERPOLATED position, exactly what is drawn, so camera and player never jitter apart.
    const v = this.playerView;
    const target: CameraTarget = {
      x: v.prevX + (v.x - v.prevX) * alpha,
      y: v.prevY + (v.y - v.prevY) * alpha,
      vx: (v.x - v.prevX) * 60,
      vy: 0,
      facing: v.facing,
      grounded: true,
    };
    if (this.snapCamera) {
      this.cameraRig.snapTo(target, this.aspect);
      this.snapCamera = false;
    }
    const pose = this.cameraRig.update(realDt, target, this.aspect);
    const camera = this.cameraView.apply(pose, this.aspect);
    this.renderer.render(this.scene, camera);
  }

  private resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
  }
}
