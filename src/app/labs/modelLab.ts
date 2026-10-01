import * as THREE from 'three';
import { createRenderer } from '@/render/createRenderer';
import { AssetManager } from '@/assets/AssetManager';
import { ActorVisual } from '@/assets/ActorVisual';
import { createActorViewState } from '@/gameplay/actorViewState';
import { ANIM_STATES, type AnimState } from '@/models/vocabulary';
import { MODELS } from '@/content/models';

/**
 * Dev-only "model lab" (`?lab=model`): a contact sheet of one model across logical animation states.
 *
 *   ?lab=model                         every state the model has, frozen at its default key time
 *   ?lab=model&state=run&frames=6      one state at 6 evenly spaced times (cycle inspection)
 *   ?lab=model&state=attack&frames=8&t0=0&t1=1
 *   ?lab=model&model=<id>&facing=-1&yaw=90
 *
 * It exists to review placeholder AND final animations on exactly the same pipeline the game uses.
 */

/** Normalised clip time at which each state's signature pose is most readable. */
const KEY_TIME: Partial<Record<AnimState, number>> = {
  idle: 0.5, walk: 0.1, run: 0.0, jump: 0.9, fall: 0.2, land: 0.25, attack: 0.34, attack2: 0.34,
  attackAir: 0.3, dash: 0.9, hurt: 0.13, death: 0.95,
};

export async function startModelLab(host: HTMLElement, q: URLSearchParams): Promise<void> {
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const renderer = createRenderer({ canvas, antialias: true, maxPixelRatio: 2, shadows: true });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fa592);
  scene.fog = new THREE.Fog(0x8fa592, 30, 140);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7560, 1.5)); // neutral light: the mannequin must read as WHITE
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-8, 16, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 10, bottom: -4, near: 1, far: 60 });
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(80, 1, 8),
    new THREE.MeshToonMaterial({ color: 0x66744f }),
  );
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);
  // a few scale references: 1 m grid ticks
  for (let i = -30; i <= 30; i += 1) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.03, i % 5 === 0 ? 0.25 : 0.1, 0.03), new THREE.MeshBasicMaterial({ color: 0x2c3a24 }));
    tick.position.set(i, 0.05, 1.2);
    scene.add(tick);
  }

  const def = MODELS[q.get('model') ?? 'mannequin'];
  if (!def) throw new Error(`unknown model "${q.get('model')}"`);
  const assets = new AssetManager(import.meta.env.BASE_URL);

  const facing = (Number(q.get('facing') ?? 1) < 0 ? -1 : 1) as 1 | -1;
  const yaw = Number(q.get('yaw') ?? 78);
  const onlyState = q.get('state') as AnimState | null;
  const frames = Math.max(1, Number(q.get('frames') ?? 1));
  const t0 = Number(q.get('t0') ?? 0);
  const t1 = Number(q.get('t1') ?? 1);

  const jobs: Array<{ state: AnimState; t: number; label: string }> = [];
  const states = onlyState ? [onlyState] : ANIM_STATES.filter((s) => def.clips[s] !== undefined);
  for (const state of states) {
    for (let i = 0; i < frames; i++) {
      const t = onlyState && frames > 1 ? t0 + ((t1 - t0) * i) / (frames - 1 || 1) : (KEY_TIME[state] ?? 0.4);
      jobs.push({ state, t, label: frames > 1 ? `${state} ${t.toFixed(2)}` : state });
    }
  }

  const spacing = Number(q.get('spacing') ?? 2.3);
  const visuals: ActorVisual[] = [];
  const labels: Array<{ el: HTMLElement; pos: THREE.Vector3 }> = [];
  const ui = document.getElementById('ui');

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const model = await assets.instantiate(def);
    const visual = new ActorVisual(model, { facingYawDeg: yaw });
    visual.snapFacing(facing);
    const view = createActorViewState();
    view.anim = job.state;
    view.x = view.prevX = (i - (jobs.length - 1) / 2) * spacing;
    visual.model.animation.play(job.state, { fade: 0, restart: true });
    visual.model.animation.seek(job.t);
    visual.sync(view, 0, 0);
    visual.model.animation.seek(job.t);
    scene.add(visual.root);
    visuals.push(visual);

    if (ui) {
      const el = document.createElement('div');
      el.textContent = job.label;
      el.style.cssText =
        'position:absolute;transform:translate(-50%,0);font:600 12px ui-monospace,monospace;color:#fff;text-shadow:0 1px 2px #000;white-space:nowrap';
      ui.appendChild(el);
      labels.push({ el, pos: new THREE.Vector3(view.x, -0.55, 0) });
    }
  }

  const camera = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 24), 1, 0.5, 400);
  const fit = () => {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const totalWidth = jobs.length * spacing + 1.5;
    const needH = 2.7;
    const dW = totalWidth / 2 / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const dH = needH / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const d = Math.max(dW, dH);
    camera.position.set(0, 0.95, d);
    camera.lookAt(0, 0.95, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    for (const l of labels) {
      const p = l.pos.clone().project(camera);
      l.el.style.left = `${((p.x + 1) / 2) * w}px`;
      l.el.style.top = `${((1 - p.y) / 2) * h + 4}px`;
    }
  };
  fit();
  window.addEventListener('resize', fit);

  renderer.render(scene, camera);
  const w = window as unknown as { __labReady?: boolean; __renderInfo?: unknown };
  w.__renderInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  w.__labReady = true;
}
