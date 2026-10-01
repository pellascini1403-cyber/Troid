import * as THREE from 'three';
import { createRenderer } from '@/render/createRenderer';
import { AssetManager } from '@/assets/AssetManager';
import { ActorVisual } from '@/assets/ActorVisual';
import { createActorViewState } from '@/gameplay/actorViewState';
import { MANNEQUIN } from '@/content/models';
import { CameraRig, type CameraConfig } from '@/camera/CameraRig';
import { CameraView } from '@/camera/CameraView';

/**
 * Dev-only camera study (`?lab=camera`): the SAME scene rendered through several projections in one image.
 * Every cell uses CameraRig with identical centre and visible height, so the player is the same size in all of
 * them and only the projection differs. Used to pick the default projection with evidence (docs/ART_DIRECTION.md).
 *
 *   ?lab=camera                      default 6-way comparison
 *   ?lab=camera&cells=ortho,20,26    custom list (numbers are FOV degrees)
 *   ?lab=camera&pitch=3.5&vh=15
 */

function buildStudyScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9c0a6);
  scene.fog = new THREE.Fog(0xa9c0a6, 40, 190);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x55604a, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.3);
  sun.position.set(-14, 22, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 20, bottom: -12, near: 1, far: 90 });
  scene.add(sun);

  const toon = (c: number) => new THREE.MeshToonMaterial({ color: c });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // gameplay plane: ground slab with real depth + a perspective grid on its top
  add(new THREE.BoxGeometry(160, 3, 14), toon(0x7c8a5c), 0, -1.5, 0);
  for (let z = -6; z <= 6; z += 2) add(new THREE.BoxGeometry(160, 0.02, 0.05), toon(0x4d5a38), 0, 0.01, z, false);
  for (let x = -70; x <= 70; x += 4) add(new THREE.BoxGeometry(0.05, 0.02, 14), toon(0x4d5a38), x, 0.01, 0, false);

  // platforms with visible side faces
  add(new THREE.BoxGeometry(6, 1.2, 6), toon(0x9aa476), -8.5, 3, 0);
  add(new THREE.BoxGeometry(5, 1.2, 6), toon(0x9aa476), 8.5, 2, 0);
  // ruin pillars straddling the plane (their sides are what perspective reveals)
  for (const [x, h] of [[-15, 9], [-3.2, 7], [4.2, 10], [14.5, 6]] as const) {
    add(new THREE.BoxGeometry(1.6, h, 1.6), toon(0xc8c2ae), x, h / 2, -3.2);
    if (Math.abs(x) > 12) add(new THREE.BoxGeometry(1.6, h * 0.8, 1.6), toon(0xc8c2ae), x + 0.4, (h * 0.8) / 2, 3.4);
  }
  // mid layer: tree trunks
  for (let i = -6; i <= 6; i++) {
    const trunk = add(new THREE.CylinderGeometry(0.7, 1.1, 22, 8), toon(0x56633f), i * 8 + (i % 2) * 2, 9, -16 - (i % 3) * 5);
    trunk.castShadow = false;
  }
  // far layer: mountains
  for (let i = -6; i <= 6; i++) {
    add(new THREE.ConeGeometry(14, 34 + (i % 3) * 6, 5), toon(0x8aa28c), i * 22, 14, -110, false);
  }
  // foreground: dark hanging cones at the top edge, grass tufts at the bottom
  for (let i = -5; i <= 5; i++) {
    const c = add(new THREE.ConeGeometry(0.9, 4.6, 6), toon(0x141c15), i * 6.5 - 2, 15.5, 7.5, false);
    c.rotation.z = Math.PI;
    add(new THREE.ConeGeometry(0.5, 2.2, 5), toon(0x141c15), i * 6.5 + 1.5, -0.4, 8, false);
  }
  return scene;
}

export async function startCameraLab(host: HTMLElement, q: URLSearchParams): Promise<void> {
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const renderer = createRenderer({ canvas, antialias: true, maxPixelRatio: 1, shadows: true });
  const scene = buildStudyScene();

  const assets = new AssetManager(import.meta.env.BASE_URL, { validate: false });
  const visuals: ActorVisual[] = [];
  for (const [x, state] of [[-8.5, 'run'], [0, 'idle'], [8.5, 'attack']] as const) {
    const visual = new ActorVisual(await assets.instantiate(MANNEQUIN));
    const view = createActorViewState();
    view.anim = state;
    view.x = view.prevX = x;
    view.y = view.prevY = x < -1 ? 3.6 : x > 1 ? 2.6 : 0; // two on platforms, one on the ground
    visual.model.animation.play(state, { fade: 0, restart: true });
    visual.model.animation.seek(state === 'run' ? 0.1 : state === 'attack' ? 0.3 : 0.5);
    visual.sync(view, 0, 0);
    visual.model.animation.seek(state === 'run' ? 0.1 : state === 'attack' ? 0.3 : 0.5);
    scene.add(visual.root);
    visuals.push(visual);
  }

  const cells = (q.get('cells') ?? 'ortho,12,20,26,36,50').split(',');
  const viewHeight = Number(q.get('vh') ?? 15);
  const pitchDeg = Number(q.get('pitch') ?? 3.5);
  const cols = Math.min(3, cells.length);
  const rows = Math.ceil(cells.length / cols);

  const W = host.clientWidth || window.innerWidth;
  const H = host.clientHeight || window.innerHeight;
  renderer.setSize(W, H, false);
  const cw = Math.floor(W / cols);
  const ch = Math.floor(H / rows);
  const ui = document.getElementById('ui');

  renderer.setScissorTest(true);
  const view = new CameraView();
  cells.forEach((cell, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ortho = cell === 'ortho';
    const config: Partial<CameraConfig> = {
      projection: ortho ? 'orthographic' : 'perspective',
      fovDeg: ortho ? 26 : Number(cell),
      viewHeight,
      pitchDeg,
      offset: { x: 0, y: 0 },
    };
    const rig = new CameraRig(config);
    rig.snapTo({ x: 0, y: 4.2, vx: 0, vy: 0, facing: 1, grounded: true }, cw / ch);
    const cam = view.apply(rig.pose, cw / ch);
    const x = col * cw;
    const y = H - (row + 1) * ch; // GL origin is bottom-left
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    renderer.render(scene, cam);

    if (ui) {
      const el = document.createElement('div');
      el.textContent = ortho ? 'ORTHOGRAPHIC' : `PERSPECTIVE  FOV ${cell}°   d=${rig.pose.distance.toFixed(0)} m`;
      el.style.cssText = `position:absolute;left:${x + 8}px;top:${row * ch + 6}px;font:700 13px ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);padding:2px 6px;border-radius:3px`;
      ui.appendChild(el);
    }
  });

  (window as unknown as { __labReady?: boolean }).__labReady = true;
}
